import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from 'lib/supabase';
import { useAuth } from 'contexts/AuthContext';
import Icon from 'components/AppIcon';
import AdminCompanySelector from 'pages/admin-dashboard/components/AdminCompanySelector';
import { downloadCustomerTemplate } from 'utils/importExportUtils';
import CustomerImportModal from './CustomerImportModal';
import CustomerDetailDrawer from './CustomerDetailDrawer';
import AddCustomerModal from './AddCustomerModal';

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

export default function CustomerMaster({ adminCompany, onCompanyChange }) {
  const { user, userProfile } = useAuth();
  const role = userProfile?.role;
  const canAssign = ['manager', 'supervisor', 'admin', 'director'].includes(role);
  const canImport = ['manager', 'admin', 'director'].includes(role);

  const [customers, setCustomers] = useState([]);
  const [allCustomers, setAllCustomers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selected, setSelected] = useState(new Set());
  const [bulkOwner, setBulkOwner] = useState('');
  const [salesmen, setSalesmen] = useState([]);
  const [showImport, setShowImport] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [activeCustomer, setActiveCustomer] = useState(null);

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
        .select(
          'id,company_name,first_name,last_name,phone,mobile,email,city,region,country,customer_type,last_order_date,notes,source,assigned_at,owner_id,created_at,owner:users!owner_id(id,full_name,email)'
        )
        .eq('company_id', adminCompany.id)
        .order('company_name', { ascending: true });

      if (statusFilter === 'unassigned') {
        // Unassigned = no owner. This is company-wide and must NOT be combined
        // with an owner-scope filter (owner_id IN [...] AND owner_id IS NULL
        // can never both be true — that was the 0-results bug). Managers,
        // supervisors, admins and directors can all see/assign these.
        query = query.is('owner_id', null);
      } else {
        // Role-based owner scope
        if (role === 'salesman') {
          query = query.eq('owner_id', user.id);
        } else if (role === 'supervisor') {
          const { data: teamMembers } = await supabase
            .from('users')
            .select('id')
            .eq('reports_to', user.id)
            .eq('is_active', true);
          const teamIds = (teamMembers || []).map((m) => m.id);
          query = query.in('owner_id', [user.id, ...teamIds]);
        }
        // manager / admin / director → no owner filter (all company customers)

        // customer_type facet (active / inactive / dormant / prospect)
        if (statusFilter !== 'all') {
          query = query.eq('customer_type', statusFilter);
        }
      }

      const { data, error } = await query;
      if (error) console.error('fetchCustomers error:', error);
      setCustomers(data || []);
    } finally {
      setLoading(false);
    }
  }, [adminCompany?.id, statusFilter, role, user?.id]);

  // Stats are computed from the full list of customers the user can access,
  // independent of the active status filter — so the numbers stay stable when
  // the user clicks between tabs (Total does not shrink to the filtered view).
  const fetchStats = useCallback(async () => {
    if (!adminCompany?.id) {
      setAllCustomers([]);
      return;
    }
    let query = supabase
      .from('contacts')
      .select('id,owner_id,customer_type')
      .eq('company_id', adminCompany.id);

    if (role === 'salesman') {
      query = query.eq('owner_id', user.id);
    } else if (role === 'supervisor') {
      const { data: teamMembers } = await supabase
        .from('users')
        .select('id')
        .eq('reports_to', user.id)
        .eq('is_active', true);
      const teamIds = (teamMembers || []).map((m) => m.id);
      const scopeIds = [user.id, ...teamIds];
      // Own + team, PLUS unassigned (supervisors can see/assign those too), so
      // the Unassigned stat reflects what the Unassigned filter actually shows.
      query = query.or(`owner_id.in.(${scopeIds.join(',')}),owner_id.is.null`);
    }
    // manager / admin / director → all company customers (unassigned included)

    const { data } = await query;
    setAllCustomers(data || []);
  }, [adminCompany?.id, role, user?.id]);

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

  const handleDownloadTemplate = async () => {
    const { data } = await supabase
      .from('users')
      .select('id,full_name,email')
      .eq('company_id', adminCompany.id)
      .eq('is_active', true)
      .order('full_name', { ascending: true });
    downloadCustomerTemplate(adminCompany.name, data || []);
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
    return 'No customers yet. Import or add your first customer.';
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

            {canImport && (
              <>
                <button
                  onClick={handleDownloadTemplate}
                  className="flex items-center gap-1.5 px-3 py-2 text-sm border border-green-500 text-green-700 rounded-xl hover:bg-green-50 transition-colors whitespace-nowrap"
                >
                  <Icon name="FileDown" size={14} />
                  Download Template
                </button>
                <button
                  onClick={() => setShowImport(true)}
                  className="flex items-center gap-1.5 px-3 py-2 text-sm border border-blue-500 text-blue-700 rounded-xl hover:bg-blue-50 transition-colors whitespace-nowrap"
                >
                  <Icon name="Upload" size={14} />
                  Import Excel
                </button>
              </>
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
          <div className="grid grid-cols-6 gap-3">
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
          </div>

          {/* Bulk assign bar */}
          {selected.size > 0 && canAssign && (
            <div className="flex items-center gap-3 bg-primary/5 border border-primary/20 rounded-xl px-4 py-2.5">
              <span className="text-sm font-medium text-primary">
                {selected.size} selected
              </span>
              <select
                value={bulkOwner}
                onChange={(e) => setBulkOwner(e.target.value)}
                className="flex-1 text-sm border border-border rounded-lg px-2 py-1.5 bg-background focus:outline-none focus:ring-2 focus:ring-primary/40"
              >
                <option value="">— Select salesman —</option>
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
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
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
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                      <td
                        colSpan={canAssign ? 8 : 7}
                        className="px-4 py-16 text-center text-muted-foreground text-sm"
                      >
                        <div className="flex flex-col items-center gap-2">
                          <Icon name="Users" size={32} className="opacity-25" />
                          <span>{emptyMessage()}</span>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filtered.map((c) => (
                      <tr
                        key={c.id}
                        onClick={() => setActiveCustomer(c)}
                        className="border-t border-border hover:bg-accent/30 cursor-pointer transition-colors"
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
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Modals */}
      <CustomerImportModal
        isOpen={showImport}
        onClose={() => setShowImport(false)}
        onSuccess={() => { setShowImport(false); fetchCustomers(); fetchStats(); }}
        adminCompany={adminCompany}
      />

      <AddCustomerModal
        isOpen={showAdd}
        onClose={() => setShowAdd(false)}
        onSuccess={() => { setShowAdd(false); fetchCustomers(); fetchStats(); }}
        adminCompany={adminCompany}
        canAssign={canAssign}
      />

      <CustomerDetailDrawer
        customer={activeCustomer}
        isOpen={!!activeCustomer}
        onClose={() => setActiveCustomer(null)}
        onUpdated={() => { setActiveCustomer(null); fetchCustomers(); fetchStats(); }}
        canAssign={canAssign}
        companyId={adminCompany?.id}
      />
    </div>
  );
}
