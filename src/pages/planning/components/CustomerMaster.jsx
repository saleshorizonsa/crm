import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from 'lib/supabase';
import { useAuth } from 'contexts/AuthContext';
import Icon from 'components/AppIcon';
import AdminCompanySelector from 'pages/admin-dashboard/components/AdminCompanySelector';
import CustomerDetailDrawer from './CustomerDetailDrawer';
import AddCustomerModal from './AddCustomerModal';
import SalesmanSelector from 'components/ui/SalesmanSelector';
import { fetchTeamHierarchy } from 'utils/teamHierarchy';

function StatusBadge({ type }) {
  const map = {
    active:   ['Active',   'bg-emerald-100 text-emerald-700'],
    inactive: ['Inactive', 'bg-red-100 text-red-600'],
    dormant:  ['Dormant',  'bg-amber-100 text-amber-700'],
    prospect: ['Prospect', 'bg-blue-100 text-blue-700'],
    blocked:  ['Blocked',  'bg-gray-100 text-gray-600'],
  };
  const [label, cls] = map[type] || map['active'];
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${cls}`}>
      {label}
    </span>
  );
}

export default function CustomerMaster({ adminCompany, onCompanyChange, onGoToOpportunities }) {
  const { user, userProfile } = useAuth();
  const role = userProfile?.role;
  const canAssign = ['manager', 'supervisor', 'admin', 'director'].includes(role);
  // Who may drill into another salesman's book. A plain salesman never sees the
  // selector (only their own data).
  const canDrillDown = ['director', 'admin', 'manager', 'supervisor', 'head'].includes(role);

  const [customers, setCustomers] = useState([]);
  const [allCustomers, setAllCustomers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selected, setSelected] = useState(new Set());
  const [bulkOwner, setBulkOwner] = useState('');
  const [salesmen, setSalesmen] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [activeCustomer, setActiveCustomer] = useState(null);
  // Drill-down selector: null = "All Salesmen" (in scope); otherwise a user id.
  const [selectedSalesman, setSelectedSalesman] = useState(null);
  const [teamMembers, setTeamMembers] = useState([]);
  // "New This Month" = customers created in the current calendar month, scoped
  // by role. Clicking the stat card opens a modal listing them. Resets on its
  // own each month because the query window is derived from today's date.
  const [newThisMonth, setNewThisMonth] = useState([]);
  const [showNewModal, setShowNewModal] = useState(false);

  // ── Inline "plan an opportunity" state (replaces the old bulk modal) ────────
  const [activeRow, setActiveRow] = useState(null);      // contact id whose SAR input is open
  const [inlineAmount, setInlineAmount] = useState('');  // amount typed for the active row
  const [addedIds, setAddedIds] = useState(new Set());   // added this session
  const [existingOppIds, setExistingOppIds] = useState(new Set()); // already have an open opp this month
  const [savingId, setSavingId] = useState(null);        // row currently saving
  const inlineInputRef = useRef(null);

  // The role-scoped list the selector may offer: director/admin/head see every
  // salesman/supervisor/manager in the company; manager/supervisor see their
  // FULL downline (direct reports plus everyone recursively beneath them).
  const fetchTeamMembers = useCallback(async () => {
    if (!adminCompany?.id || !canDrillDown) {
      setTeamMembers([]);
      return;
    }
    const team = await fetchTeamHierarchy({
      companyId: adminCompany.id,
      userId: user?.id,
      role,
    });
    setTeamMembers(team);
  }, [adminCompany?.id, canDrillDown, role, user?.id]);

  useEffect(() => { fetchTeamMembers(); }, [fetchTeamMembers]);

  // Reset the drill-down and inline-planning state when switching company so
  // stale ids / green badges can't leak across companies.
  useEffect(() => {
    setSelectedSalesman(null);
    setActiveRow(null);
    setInlineAmount('');
    setAddedIds(new Set());
  }, [adminCompany?.id]);

  // Which customers already have an OPEN opportunity for the current month, so
  // the list can flag them and block a duplicate plan.
  const fetchExistingOpps = useCallback(async () => {
    if (!adminCompany?.id) { setExistingOppIds(new Set()); return; }
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
    const { data } = await supabase
      .from('opportunities')
      .select('contact_id')
      .eq('company_id', adminCompany.id)
      .eq('status', 'open')
      .gte('expected_month', monthStart)
      .lte('expected_month', monthEnd);
    setExistingOppIds(new Set((data || []).map((o) => o.contact_id).filter(Boolean)));
  }, [adminCompany?.id]);

  useEffect(() => { fetchExistingOpps(); }, [fetchExistingOpps]);

  // Close the "New This Month" modal on Escape.
  useEffect(() => {
    if (!showNewModal) return;
    const onKey = (e) => { if (e.key === 'Escape') setShowNewModal(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [showNewModal]);

  // A contact belongs to a company through its OWNER (contacts.company_id is not
  // reliably populated in this DB), so "all customers of company X" means "owned
  // by a user of company X". Unassigned customers have no owner, so they are
  // scoped by contacts.company_id (which imports stamp).
  const getCompanyUserIds = useCallback(async (cid) => {
    const { data } = await supabase.from('users').select('id').eq('company_id', cid);
    return (data || []).map((u) => u.id);
  }, []);

  // Customers created in the CURRENT calendar month, role-scoped:
  //   salesman            → own customers
  //   manager/supervisor  → full downline (self + team)
  //   director/admin/head → whole company (owner-scoped + unassigned imports)
  // Scoped by OWNER (contacts.company_id is null for owned rows), so the company
  // view mirrors fetchStats rather than a naive contacts.company_id filter.
  // NOTE: declared AFTER getCompanyUserIds — it references that callback in its
  // dependency array, which is evaluated during render (a TDZ crash otherwise).
  const fetchNewThisMonth = useCallback(async () => {
    if (!adminCompany?.id) { setNewThisMonth([]); return; }
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();
    const COLS =
      'id,first_name,last_name,company_name,phone,city,customer_type,created_at,owner_id,owner:users!owner_id(id,full_name)';
    const base = () =>
      supabase
        .from('contacts')
        .select(COLS)
        .gte('created_at', monthStart)
        .lte('created_at', monthEnd)
        .order('created_at', { ascending: false });

    let rows = [];
    if (role === 'salesman') {
      rows = (await base().eq('owner_id', user.id)).data || [];
    } else if (['manager', 'supervisor'].includes(role)) {
      const teamIds = [user.id, ...teamMembers.map((m) => m.id)].filter(Boolean);
      rows = teamIds.length ? (await base().in('owner_id', teamIds)).data || [] : [];
    } else {
      // director / admin / head → company's assigned (owner in company) + unassigned
      const ownerIds = await getCompanyUserIds(adminCompany.id);
      const owned = ownerIds.length ? (await base().in('owner_id', ownerIds)).data || [] : [];
      const orphan = (await base().is('owner_id', null).eq('company_id', adminCompany.id)).data || [];
      const merged = new Map();
      [...owned, ...orphan].forEach((r) => merged.set(r.id, r));
      rows = [...merged.values()].sort(
        (a, b) => new Date(b.created_at) - new Date(a.created_at)
      );
    }
    setNewThisMonth(rows);
  }, [adminCompany?.id, role, user?.id, teamMembers, getCompanyUserIds]);

  useEffect(() => { fetchNewThisMonth(); }, [fetchNewThisMonth]);

  const SELECT_COLS =
    'id,company_name,first_name,last_name,phone,mobile,email,city,region,country,customer_type,last_order_date,notes,source,assigned_at,owner_id,created_at,company_id,owner:users!owner_id(id,full_name,email)';

  const fetchCustomers = useCallback(async () => {
    if (!adminCompany?.id) {
      setCustomers([]);
      return;
    }
    setLoading(true);
    try {
      // Salesmen only ever see customers assigned to them, so there is no
      // "unassigned" bucket for them — short-circuit to an empty list.
      if (statusFilter === 'unassigned' && role === 'salesman') {
        setCustomers([]);
        return;
      }

      let query = supabase
        .from('contacts')
        .select(SELECT_COLS)
        .order('company_name', { ascending: true });

      if (statusFilter === 'unassigned') {
        // Unassigned = no owner, scoped to the company via company_id.
        query = query.is('owner_id', null).eq('company_id', adminCompany.id);
      } else if (selectedSalesman) {
        // Drilled into one salesman (the selector only offers in-scope members).
        query = query.eq('owner_id', selectedSalesman);
        if (statusFilter !== 'all') query = query.eq('customer_type', statusFilter);
      } else if (role === 'salesman') {
        query = query.eq('owner_id', user.id);
        if (statusFilter !== 'all') query = query.eq('customer_type', statusFilter);
      } else if (['manager', 'supervisor'].includes(role)) {
        // Team lead "All" → the full downline (self + every member below them).
        const teamIds = [user.id, ...teamMembers.map((m) => m.id)].filter(Boolean);
        query = query.in('owner_id', teamIds.length ? teamIds : ['00000000-0000-0000-0000-000000000000']);
        if (statusFilter !== 'all') query = query.eq('customer_type', statusFilter);
      } else {
        // admin / director / head → all of the company's assigned customers,
        // scoped by the owner's company.
        const ownerIds = await getCompanyUserIds(adminCompany.id);
        query = query.in('owner_id', ownerIds.length ? ownerIds : ['00000000-0000-0000-0000-000000000000']);
        if (statusFilter !== 'all') query = query.eq('customer_type', statusFilter);
      }

      const { data, error } = await query;
      if (error) console.error('fetchCustomers error:', error);
      setCustomers(data || []);
    } finally {
      setLoading(false);
    }
  }, [adminCompany?.id, statusFilter, role, user?.id, getCompanyUserIds, selectedSalesman, teamMembers]);

  // Stats are computed from the full list of customers the user can access,
  // independent of the active status filter — so the numbers stay stable when
  // the user clicks between tabs (Total does not shrink to the filtered view).
  const fetchStats = useCallback(async () => {
    if (!adminCompany?.id) {
      setAllCustomers([]);
      return;
    }
    const COLS = 'id,owner_id,customer_type';
    const unassigned = async () =>
      (await supabase.from('contacts').select(COLS).is('owner_id', null).eq('company_id', adminCompany.id)).data || [];

    let rows = [];
    if (selectedSalesman) {
      // Drilled into one salesman → their assigned book only (no unassigned).
      rows = (await supabase.from('contacts').select(COLS).eq('owner_id', selectedSalesman)).data || [];
    } else if (role === 'salesman') {
      rows = (await supabase.from('contacts').select(COLS).eq('owner_id', user.id)).data || [];
    } else if (['manager', 'supervisor'].includes(role)) {
      // Team lead → full downline (self + everyone below) plus unassigned.
      const scopeIds = [user.id, ...teamMembers.map((m) => m.id)].filter(Boolean);
      const owned = scopeIds.length
        ? (await supabase.from('contacts').select(COLS).in('owner_id', scopeIds)).data || []
        : [];
      rows = [...owned, ...(await unassigned())];
    } else {
      // admin / director / head → company's assigned (owner in company) + unassigned
      const ownerIds = await getCompanyUserIds(adminCompany.id);
      const owned = ownerIds.length
        ? (await supabase.from('contacts').select(COLS).in('owner_id', ownerIds)).data || []
        : [];
      rows = [...owned, ...(await unassigned())];
    }
    setAllCustomers(rows);
  }, [adminCompany?.id, role, user?.id, getCompanyUserIds, selectedSalesman, teamMembers]);

  const fetchSalesmen = useCallback(async () => {
    if (!adminCompany?.id || !canAssign) return;
    const { data } = await supabase
      .from('users')
      .select('id,full_name,email,role')
      .eq('company_id', adminCompany.id)
      .eq('is_active', true)
      .in('role', ['salesman', 'supervisor'])
      .order('full_name', { ascending: true });
    setSalesmen(data || []);
  }, [adminCompany?.id, canAssign]);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  useEffect(() => {
    if (canAssign) fetchSalesmen();
  }, [fetchSalesmen, canAssign]);

  // Client-side search filter
  const filtered = customers.filter(
    (c) =>
      !search ||
      c.company_name?.toLowerCase().includes(search.toLowerCase()) ||
      c.phone?.includes(search) ||
      c.first_name?.toLowerCase().includes(search.toLowerCase()) ||
      c.owner?.full_name?.toLowerCase().includes(search.toLowerCase())
  );

  // Stats from the full accessible list (unaffected by the active filter)
  const stats = {
    total: allCustomers.length,
    unassigned: allCustomers.filter((c) => !c.owner_id).length,
    active: allCustomers.filter((c) => c.customer_type === 'active').length,
    inactive: allCustomers.filter((c) => c.customer_type === 'inactive').length,
    dormant: allCustomers.filter((c) => c.customer_type === 'dormant').length,
    prospect: allCustomers.filter((c) => c.customer_type === 'prospect').length,
  };

  const handleBulkAssign = async () => {
    if (!bulkOwner || selected.size === 0) return;
    await supabase
      .from('contacts')
      .update({
        owner_id: bulkOwner,
        assigned_by: user.id,
        assigned_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .in('id', [...selected]);
    setSelected(new Set());
    setBulkOwner('');
    fetchCustomers();
    fetchStats();
  };

  const handleSelectAll = (checked) => {
    if (checked) {
      setSelected(new Set(filtered.map((c) => c.id)));
    } else {
      setSelected(new Set());
    }
  };

  const handleToggleSelect = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // ── Inline plan-an-opportunity ─────────────────────────────────────────────
  // Open the SAR input on a row. Rows already added this session or already in
  // Opportunities this month are inert. Clicking the open row again closes it.
  const handlePlanClick = (customer) => {
    if (addedIds.has(customer.id) || existingOppIds.has(customer.id)) return;
    if (activeRow === customer.id) {
      setActiveRow(null);
      setInlineAmount('');
      return;
    }
    setActiveRow(customer.id);
    setInlineAmount('');
    setTimeout(() => inlineInputRef.current?.focus(), 50);
  };

  // Save the typed amount as a single Opportunity for this customer.
  const handleInlineSave = async (customer) => {
    const amount = parseFloat(inlineAmount);
    if (!amount || amount <= 0) {
      inlineInputRef.current?.focus();
      return;
    }
    setSavingId(customer.id);
    try {
      const now = new Date();
      const expectedMonth = new Date(now.getFullYear(), now.getMonth(), 1)
        .toISOString().split('T')[0];
      const { error } = await supabase.from('opportunities').insert({
        company_id:     adminCompany?.id,
        // Opportunity belongs to the customer's assigned salesman (falls back to
        // the acting user for unassigned customers).
        owner_id:       customer.owner_id || user?.id,
        created_by:     user?.id,
        contact_id:     customer.id,
        customer_name:
          customer.company_name ||
          `${customer.first_name || ''} ${customer.last_name || ''}`.trim() ||
          'Unnamed customer',
        customer_type:  'existing',
        planned_amount: amount,
        expected_month: expectedMonth,
        status:         'open',
      });
      if (error) throw error;

      setAddedIds((prev) => new Set([...prev, customer.id]));
      setExistingOppIds((prev) => new Set([...prev, customer.id]));
      setActiveRow(null);
      setInlineAmount('');
    } catch (err) {
      console.error('Save opp:', err);
      alert(`Could not create opportunity: ${err.message || err}`);
    } finally {
      setSavingId(null);
    }
  };

  const statCards = [
    { key: 'all',        label: 'Total',      value: stats.total,      color: 'text-gray-700',    ring: 'ring-gray-300' },
    { key: 'unassigned', label: 'Unassigned',  value: stats.unassigned, color: 'text-red-700',     ring: 'ring-red-300' },
    { key: 'active',     label: 'Active',      value: stats.active,     color: 'text-emerald-700', ring: 'ring-emerald-300' },
    { key: 'inactive',   label: 'Inactive',    value: stats.inactive,   color: 'text-gray-500',    ring: 'ring-gray-300' },
    { key: 'dormant',    label: 'Dormant',     value: stats.dormant,    color: 'text-amber-700',   ring: 'ring-amber-300' },
    { key: 'prospect',   label: 'Prospect',    value: stats.prospect,   color: 'text-blue-700',    ring: 'ring-blue-300' },
  ];

  const emptyMessage = () => {
    if (search) return `No customers match "${search}"`;
    if (statusFilter === 'unassigned') return 'No unassigned customers';
    if (statusFilter !== 'all') return `No ${statusFilter} customers`;
    return 'No customers yet. Add your first customer.';
  };

  return (
    <div className="space-y-4">
      {/* Company selector for admin/director */}
      {['admin', 'director'].includes(role) && (
        <AdminCompanySelector
          value={adminCompany?.id}
          onSelect={(co) => {
            onCompanyChange(co);
            setStatusFilter('all');
            setSearch('');
            setSelected(new Set());
          }}
        />
      )}

      {!adminCompany ? (
        <div className="flex flex-col items-center justify-center py-24 text-muted-foreground gap-3">
          <Icon name="Building2" size={40} className="opacity-30" />
          <p className="text-sm">Select a company above to manage customers</p>
        </div>
      ) : (
        <>
          {/* Action bar */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-48">
              <Icon
                name="Search"
                size={15}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
              />
              <input
                type="text"
                placeholder="Search company, phone, name, salesman…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full text-sm pl-9 pr-3 py-2 border border-border rounded-xl bg-background focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>

            {canDrillDown && teamMembers.length > 0 && (
              <SalesmanSelector
                value={selectedSalesman}
                onChange={(id) => { setSelectedSalesman(id); setSelected(new Set()); }}
                teamMembers={teamMembers}
              />
            )}

            <button
              onClick={() => setShowAdd(true)}
              className="flex items-center gap-1.5 px-3 py-2 text-sm bg-primary text-primary-foreground rounded-xl hover:bg-primary/90 transition-colors whitespace-nowrap"
            >
              <Icon name="Plus" size={14} />
              Add Customer
            </button>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-7 gap-3">
            {statCards.map(({ key, label, value, color, ring }) => {
              const isActive = statusFilter === key;
              // Unassigned customers need attention — flag the card red when any exist
              const unassignedAlert = key === 'unassigned' && value > 0 && !isActive;
              return (
                <button
                  key={key}
                  onClick={() => { setStatusFilter(key); setSelected(new Set()); }}
                  className={`rounded-xl border p-3 text-center transition-all ${
                    isActive
                      ? `bg-primary text-primary-foreground ring-2 ${ring}`
                      : unassignedAlert
                        ? 'bg-red-50 border-red-200 hover:border-red-300'
                        : 'bg-card hover:bg-accent/40 border-border'
                  }`}
                >
                  <p className={`text-xl font-bold ${
                    isActive ? 'text-primary-foreground' : unassignedAlert ? 'text-red-600' : color
                  }`}>
                    {value}
                  </p>
                  <p className={`text-xs mt-0.5 ${
                    isActive ? 'text-primary-foreground/80' : unassignedAlert ? 'text-red-500' : 'text-muted-foreground'
                  }`}>
                    {label}
                  </p>
                </button>
              );
            })}

            {/* New This Month — opens a modal instead of filtering the table */}
            <button
              onClick={() => setShowNewModal(true)}
              className={`rounded-xl border p-3 text-center transition-all ${
                newThisMonth.length > 0
                  ? 'bg-emerald-50 border-emerald-200 hover:border-emerald-300'
                  : 'bg-card hover:bg-accent/40 border-border'
              }`}
            >
              <p className={`text-xl font-bold ${
                newThisMonth.length > 0 ? 'text-emerald-600' : 'text-gray-400'
              }`}>
                {newThisMonth.length}
              </p>
              <p className={`text-xs mt-0.5 ${
                newThisMonth.length > 0 ? 'text-emerald-600' : 'text-muted-foreground'
              }`}>
                New This Month
              </p>
              {newThisMonth.length > 0 && (
                <p className="text-[10px] mt-0.5 text-emerald-500">
                  {new Date().toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}
                </p>
              )}
            </button>
          </div>

          {/* Session summary — opportunities planned inline in this session */}
          {addedIds.size > 0 && (
            <div className="flex items-center gap-2 px-4 py-2.5 bg-emerald-50 border border-emerald-100 rounded-xl">
              <Icon name="CheckCircle2" size={15} className="text-emerald-600 flex-shrink-0" />
              <p className="text-sm text-emerald-700">
                <strong>{addedIds.size}</strong>{' '}
                opportunit{addedIds.size > 1 ? 'ies' : 'y'} added to Planning this session
              </p>
              {onGoToOpportunities && (
                <button
                  onClick={onGoToOpportunities}
                  className="ml-auto text-xs text-emerald-600 font-medium hover:text-emerald-800 flex items-center gap-1"
                >
                  View in Opportunities
                  <Icon name="ArrowRight" size={12} />
                </button>
              )}
            </div>
          )}

          {/* Bulk assign bar (assign-to-salesman only) */}
          {selected.size > 0 && canAssign && (
            <div className="flex items-center gap-3 bg-primary/5 border border-primary/20 rounded-xl px-4 py-2.5 flex-wrap">
              <span className="text-sm font-medium text-primary">
                {selected.size} selected
              </span>
              <select
                value={bulkOwner}
                onChange={(e) => setBulkOwner(e.target.value)}
                className="flex-1 min-w-40 text-sm border border-border rounded-lg px-2 py-1.5 bg-background focus:outline-none focus:ring-2 focus:ring-primary/40"
              >
                <option value="">— Assign to salesman —</option>
                {salesmen.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.full_name} ({s.email})
                  </option>
                ))}
              </select>
              <button
                onClick={handleBulkAssign}
                disabled={!bulkOwner}
                className="px-4 py-1.5 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Assign
              </button>
              <button
                onClick={() => { setSelected(new Set()); setBulkOwner(''); }}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors ml-auto"
              >
                Clear
              </button>
            </div>
          )}

          {/* Table */}
          <div className="bg-card rounded-xl border border-border overflow-hidden relative">
            {loading && (
              <div className="absolute inset-0 bg-background/60 flex items-center justify-center z-10 rounded-xl">
                <Icon name="Loader2" size={28} className="text-primary animate-spin" />
              </div>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    {canAssign && (
                      <th className="px-4 py-3 w-10">
                        <input
                          type="checkbox"
                          checked={filtered.length > 0 && filtered.every((c) => selected.has(c.id))}
                          onChange={(e) => handleSelectAll(e.target.checked)}
                          className="rounded border-border"
                        />
                      </th>
                    )}
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Company</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Contact</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Phone</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">City</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Assigned To</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Last Order</th>
                    <th className="px-4 py-3 text-right font-medium text-muted-foreground">Plan</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                      <td
                        colSpan={canAssign ? 9 : 8}
                        className="px-4 py-16 text-center text-muted-foreground text-sm"
                      >
                        <div className="flex flex-col items-center gap-2">
                          <Icon name="Users" size={32} className="opacity-25" />
                          <span>{emptyMessage()}</span>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filtered.map((c) => {
                      const isRowActive = activeRow === c.id;
                      const isAdded = addedIds.has(c.id);
                      const isExisting = existingOppIds.has(c.id) && !isAdded;
                      const isSaving = savingId === c.id;
                      return (
                      <tr
                        key={c.id}
                        onClick={() => setActiveCustomer(c)}
                        className={`border-t border-border cursor-pointer transition-colors ${
                          isRowActive
                            ? 'bg-primary/5'
                            : isAdded
                              ? 'bg-emerald-50'
                              : isExisting
                                ? 'bg-muted/40'
                                : 'hover:bg-accent/30'
                        }`}
                      >
                        {canAssign && (
                          <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={selected.has(c.id)}
                              onChange={() => handleToggleSelect(c.id)}
                              className="rounded border-border"
                            />
                          </td>
                        )}
                        <td className="px-4 py-3 font-medium max-w-[180px]">
                          <span className="truncate block">{c.company_name}</span>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {[c.first_name, c.last_name].filter(Boolean).join(' ') || '—'}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{c.phone || c.mobile || '—'}</td>
                        <td className="px-4 py-3 text-muted-foreground">{c.city || '—'}</td>
                        <td className="px-4 py-3">
                          <StatusBadge type={c.customer_type} />
                        </td>
                        <td className="px-4 py-3">
                          {c.owner ? (
                            <div className="flex items-center gap-2">
                              <div className="w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs font-semibold shrink-0">
                                {c.owner.full_name?.charAt(0)?.toUpperCase() || '?'}
                              </div>
                              <span className="text-sm truncate max-w-[120px]">{c.owner.full_name}</span>
                            </div>
                          ) : (
                            <span className="text-xs text-red-500 font-medium">Unassigned</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground text-xs whitespace-nowrap">
                          {c.last_order_date
                            ? new Date(c.last_order_date).toLocaleDateString('en-GB', {
                                day: '2-digit',
                                month: 'short',
                                year: 'numeric',
                              })
                            : '—'}
                        </td>

                        {/* Plan → inline opportunity */}
                        <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                          {isRowActive ? (
                            <div className="flex items-center justify-end gap-1.5">
                              <div className="relative flex items-center">
                                <span className="absolute left-2.5 text-xs text-muted-foreground font-medium pointer-events-none">
                                  SAR
                                </span>
                                <input
                                  ref={inlineInputRef}
                                  type="number"
                                  min="0"
                                  inputMode="decimal"
                                  value={inlineAmount}
                                  onChange={(e) => setInlineAmount(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleInlineSave(c);
                                    if (e.key === 'Escape') { setActiveRow(null); setInlineAmount(''); }
                                  }}
                                  placeholder="0"
                                  className="w-28 pl-10 pr-2 py-1.5 border-2 border-primary/50 rounded-xl text-sm tabular-nums text-right bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                                />
                              </div>
                              <button
                                onClick={() => handleInlineSave(c)}
                                disabled={!inlineAmount || isSaving}
                                className="flex items-center gap-1 px-3 py-1.5 bg-primary text-primary-foreground text-xs font-semibold rounded-xl hover:bg-primary/90 transition-colors disabled:opacity-50 whitespace-nowrap"
                              >
                                {isSaving ? (
                                  <Icon name="Loader2" size={12} className="animate-spin" />
                                ) : (
                                  <Icon name="Plus" size={12} />
                                )}
                                Add
                              </button>
                              <button
                                onClick={() => { setActiveRow(null); setInlineAmount(''); }}
                                className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                              >
                                <Icon name="X" size={13} />
                              </button>
                            </div>
                          ) : isAdded ? (
                            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600">
                              <Icon name="CheckCircle2" size={13} />
                              Added ✓
                            </span>
                          ) : isExisting ? (
                            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-600">
                              <Icon name="AlertTriangle" size={12} />
                              In Opportunities
                            </span>
                          ) : (
                            <button
                              onClick={() => handlePlanClick(c)}
                              className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-primary transition-colors"
                            >
                              Click to plan
                              <Icon name="ArrowRight" size={12} />
                            </button>
                          )}
                        </td>
                      </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Modals */}
      <AddCustomerModal
        isOpen={showAdd}
        onClose={() => setShowAdd(false)}
        onSuccess={() => { setShowAdd(false); fetchCustomers(); fetchStats(); fetchNewThisMonth(); }}
        adminCompany={adminCompany}
        canAssign={canAssign}
      />

      <CustomerDetailDrawer
        customer={activeCustomer}
        isOpen={!!activeCustomer}
        onClose={() => setActiveCustomer(null)}
        onUpdated={() => { setActiveCustomer(null); fetchCustomers(); fetchStats(); fetchNewThisMonth(); }}
        canAssign={canAssign}
        companyId={adminCompany?.id}
      />

      {/* New Customers This Month modal */}
      {showNewModal && (
        <>
          <div
            className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
            onClick={() => setShowNewModal(false)}
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="bg-card rounded-2xl shadow-2xl w-full max-w-xl max-h-[85vh] flex flex-col overflow-hidden border border-border">
              {/* Header */}
              <div className="px-6 py-4 border-b border-border flex items-center justify-between flex-shrink-0 bg-emerald-50">
                <div>
                  <h2 className="text-base font-semibold text-emerald-800">
                    New Customers This Month
                  </h2>
                  <p className="text-xs text-emerald-600 mt-0.5">
                    {new Date().toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}
                    {' · '}
                    {newThisMonth.length} customer{newThisMonth.length !== 1 ? 's' : ''}
                  </p>
                </div>
                <button
                  onClick={() => setShowNewModal(false)}
                  className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-emerald-100 transition-colors"
                >
                  <Icon name="X" size={16} className="text-emerald-700" />
                </button>
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto">
                {newThisMonth.length === 0 ? (
                  <div className="text-center py-12">
                    <Icon name="UserPlus" size={30} className="opacity-25 mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">
                      No new customers added this month
                    </p>
                  </div>
                ) : (
                  <div>
                    <div className="grid grid-cols-[1fr_1fr_90px_70px] gap-3 px-5 py-2.5 bg-muted/40 border-b border-border text-xs font-medium text-muted-foreground uppercase tracking-wide sticky top-0">
                      <span>Customer</span>
                      <span>Assigned To</span>
                      <span>City</span>
                      <span>Added</span>
                    </div>
                    {newThisMonth.map((customer, i) => (
                      <div
                        key={customer.id}
                        className={`grid grid-cols-[1fr_1fr_90px_70px] gap-3 px-5 py-3.5 border-b border-border last:border-0 items-center ${
                          i % 2 === 0 ? 'bg-card' : 'bg-muted/20'
                        }`}
                      >
                        {/* Customer */}
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">
                            {customer.company_name ||
                              `${customer.first_name || ''} ${customer.last_name || ''}`.trim() ||
                              '—'}
                          </p>
                          {customer.phone && (
                            <p className="text-xs text-muted-foreground mt-0.5 truncate">
                              {customer.phone}
                            </p>
                          )}
                        </div>

                        {/* Assigned to */}
                        <div className="flex items-center gap-2 min-w-0">
                          {customer.owner ? (
                            <>
                              <div className="w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs font-bold flex-shrink-0">
                                {customer.owner.full_name?.charAt(0)?.toUpperCase() || '?'}
                              </div>
                              <span className="text-xs text-muted-foreground truncate">
                                {customer.owner.full_name}
                              </span>
                            </>
                          ) : (
                            <span className="text-xs text-red-500 font-medium">Unassigned</span>
                          )}
                        </div>

                        {/* City */}
                        <p className="text-xs text-muted-foreground truncate">
                          {customer.city || '—'}
                        </p>

                        {/* Added */}
                        <p className="text-xs text-muted-foreground whitespace-nowrap">
                          {new Date(customer.created_at).toLocaleDateString('en-GB', {
                            day: 'numeric',
                            month: 'short',
                          })}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="px-6 py-4 border-t border-border flex-shrink-0 flex justify-end">
                <button
                  onClick={() => setShowNewModal(false)}
                  className="px-4 py-2 text-sm border border-border rounded-xl text-muted-foreground hover:bg-accent transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
