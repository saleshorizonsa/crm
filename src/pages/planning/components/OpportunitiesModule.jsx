import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from 'lib/supabase';
import { useAuth } from 'contexts/AuthContext';
import { useCurrency } from 'contexts/CurrencyContext';
import Icon from 'components/AppIcon';

const DIRECTOR_ROLES = ['director', 'head', 'admin'];
const TEAM_ROLES     = ['manager', 'supervisor'];

const STATUS_FILTERS = [
  { id: 'all',       label: 'All'       },
  { id: 'open',      label: 'Open'      },
  { id: 'converted', label: 'Converted' },
  { id: 'won',       label: 'Won'       },
  { id: 'lost',      label: 'Lost'      },
];

// Stage colour for the linked deal badge
const STAGE_COLOR = {
  lead:          '#3B82F6',
  contact_made:  '#8B5CF6',
  proposal_sent: '#F59E0B',
  negotiation:   '#EF4444',
  won:           '#059669',
  lost:          '#6B7280',
};

const emptyForm = (month) => ({
  customer_name:  '',
  customer_type:  'existing',
  contact_id:     '',
  planned_amount: '',
  material_group: '',
  expected_month: month,
  notes:          '',
});

export default function OpportunitiesModule({ adminCompany }) {
  const { user, company: authCompany, userProfile } = useAuth();
  const { formatCurrency } = useCurrency();

  const company = adminCompany || authCompany;
  const role    = userProfile?.role;
  const isDirector = DIRECTOR_ROLES.includes(role);
  const isTeamLead = TEAM_ROLES.includes(role);

  // First day of the current month, as yyyy-MM-dd
  const currentMonth = useMemo(() => {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-01`;
  }, []);

  const [opportunities, setOpportunities] = useState([]);
  const [loading, setLoading]             = useState(true);
  const [loadError, setLoadError]         = useState(null);
  const [monthlyTarget, setMonthlyTarget] = useState(0);
  const [contacts, setContacts]           = useState([]);
  const [teamMembers, setTeamMembers]     = useState([]);
  const [saving, setSaving]               = useState(false);

  const [filterOwner, setFilterOwner]   = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');

  const [showModal, setShowModal]   = useState(false);
  const [editingOpp, setEditingOpp] = useState(null);
  const [form, setForm]             = useState(() => emptyForm(currentMonth));

  // ── Owner scope for the target calculation ────────────────────────────────
  const ownerScope = useMemo(() => {
    if (filterOwner !== 'all') return [filterOwner];
    if (isDirector || isTeamLead) {
      const ids = teamMembers.map((m) => m.id);
      return ids.length ? ids : [user?.id].filter(Boolean);
    }
    return [user?.id].filter(Boolean);
  }, [filterOwner, isDirector, isTeamLead, teamMembers, user?.id]);

  // ── Fetch: monthly target ─────────────────────────────────────────────────
  // Targets may be assigned as total_value / by_clients / by_products — these are
  // different views of the SAME monthly goal, so we take the MAX per person and
  // then sum across the scope (never add the types together).
  const fetchTarget = useCallback(async (ids) => {
    if (!company?.id || !ids?.length) { setMonthlyTarget(0); return; }
    const n = new Date();
    const from = new Date(n.getFullYear(), n.getMonth(), 1).toISOString();
    const to   = new Date(n.getFullYear(), n.getMonth() + 1, 0, 23, 59, 59).toISOString();

    const { data, error } = await supabase
      .from('sales_targets')
      .select('target_amount, assigned_to')
      .eq('company_id', company.id)
      .eq('status', 'active')
      .in('assigned_to', ids)
      .lte('period_start', to)
      .gte('period_end', from);

    if (error) { setMonthlyTarget(0); return; }

    const perPerson = {};
    (data || []).forEach((r) => {
      const k = r.assigned_to || 'x';
      perPerson[k] = Math.max(perPerson[k] || 0, parseFloat(r.target_amount) || 0);
    });
    setMonthlyTarget(Object.values(perPerson).reduce((s, v) => s + v, 0));
  }, [company?.id]);

  // ── Fetch: opportunities ──────────────────────────────────────────────────
  const fetchOpportunities = useCallback(async () => {
    if (!company?.id) return;
    setLoading(true);
    setLoadError(null);
    try {
      let query = supabase
        .from('opportunities')
        .select(`
          id, customer_name, customer_type, planned_amount, material_group,
          expected_month, notes, status, deal_id, converted_at, created_at,
          contact_id, owner_id,
          owner:users!owner_id(id, full_name, role),
          contact:contacts!contact_id(id, first_name, last_name, company_name),
          deal:deals!deal_id(id, title, stage, amount)
        `)
        .eq('company_id', company.id)
        .order('created_at', { ascending: false });

      if (!isDirector && !isTeamLead) {
        query = query.eq('owner_id', user?.id);      // salesman → own only
      } else if (filterOwner !== 'all') {
        query = query.eq('owner_id', filterOwner);
      }
      if (filterStatus !== 'all') query = query.eq('status', filterStatus);

      const { data, error } = await query;
      if (error) throw error;
      setOpportunities(data || []);
    } catch (err) {
      console.error('fetchOpportunities:', err);
      setLoadError(err?.message || 'Could not load opportunities.');
      setOpportunities([]);
    } finally {
      setLoading(false);
    }
  }, [company?.id, isDirector, isTeamLead, user?.id, filterOwner, filterStatus]);

  // ── Fetch: contacts + team ────────────────────────────────────────────────
  const fetchSupport = useCallback(async () => {
    if (!company?.id) return;
    const [contactsRes, teamRes] = await Promise.all([
      supabase
        .from('contacts')
        .select('id, first_name, last_name, company_name')
        .eq('company_id', company.id)
        .order('company_name'),
      (isDirector || isTeamLead)
        ? supabase
            .from('users')
            .select('id, full_name, role')
            .eq('company_id', company.id)
            .eq('is_active', true)
            .in('role', ['salesman', 'supervisor', 'manager'])
            .order('full_name')
        : Promise.resolve({ data: [] }),
    ]);
    setContacts(contactsRes.data || []);
    setTeamMembers(teamRes.data || []);
  }, [company?.id, isDirector, isTeamLead]);

  useEffect(() => { fetchSupport(); }, [fetchSupport]);
  useEffect(() => { fetchOpportunities(); }, [fetchOpportunities]);
  useEffect(() => { fetchTarget(ownerScope); }, [fetchTarget, ownerScope]);

  // ── Derived totals ────────────────────────────────────────────────────────
  const totalPlanned = opportunities.reduce(
    (s, o) => s + (parseFloat(o.planned_amount) || 0), 0,
  );
  const planningPct   = monthlyTarget > 0 ? Math.min((totalPlanned / monthlyTarget) * 100, 100) : 0;
  const unplanned     = Math.max(0, monthlyTarget - totalPlanned);
  const isUnderPlanned = monthlyTarget > 0 && totalPlanned < monthlyTarget;

  // ── Save (create / update) ────────────────────────────────────────────────
  async function handleSave() {
    if (!form.customer_name?.trim() || !form.planned_amount) return;
    setSaving(true);
    try {
      const payload = {
        customer_name:  form.customer_name.trim(),
        customer_type:  form.customer_type,
        contact_id:     form.contact_id || null,
        planned_amount: parseFloat(form.planned_amount) || 0,
        material_group: form.material_group || null,
        expected_month: form.expected_month || null,
        notes:          form.notes || null,
        company_id:     company?.id,
      };

      let error;
      if (editingOpp) {
        ({ error } = await supabase
          .from('opportunities').update(payload).eq('id', editingOpp.id));
      } else {
        ({ error } = await supabase
          .from('opportunities')
          .insert({ ...payload, owner_id: user?.id, created_by: user?.id }));
      }
      if (error) throw error;

      closeModal();
      fetchOpportunities();
    } catch (err) {
      console.error('saveOpportunity:', err);
      alert(`Could not save opportunity: ${err.message || err}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    if (!window.confirm('Delete this opportunity?')) return;
    const { error } = await supabase.from('opportunities').delete().eq('id', id);
    if (error) { alert(`Could not delete: ${error.message}`); return; }
    fetchOpportunities();
  }

  // ── Convert to a Lead-stage deal ──────────────────────────────────────────
  // The opportunity → deal link is stored on opportunities.deal_id, so this does
  // NOT depend on a deals.opportunity_id column existing.
  async function handleConvert(opp) {
    try {
      const { data: deal, error } = await supabase
        .from('deals')
        .insert({
          title:       opp.customer_name,
          stage:       'lead',
          amount:      parseFloat(opp.planned_amount) || 0,
          company_id:  company?.id,
          owner_id:    opp.owner_id || user?.id,
          contact_id:  opp.contact_id || null,
          description: opp.notes || null,
          expected_close_date: opp.expected_month || null,
        })
        .select()
        .single();
      if (error) throw error;

      const { error: updErr } = await supabase
        .from('opportunities')
        .update({
          status:       'converted',
          deal_id:      deal.id,
          converted_at: new Date().toISOString(),
        })
        .eq('id', opp.id);
      if (updErr) throw updErr;

      fetchOpportunities();
    } catch (err) {
      console.error('convertOpportunity:', err);
      alert(`Could not convert to lead: ${err.message || err}`);
    }
  }

  // ── Modal helpers ─────────────────────────────────────────────────────────
  function openAdd() {
    setEditingOpp(null);
    setForm(emptyForm(currentMonth));
    setShowModal(true);
  }
  function openEdit(opp) {
    setEditingOpp(opp);
    setForm({
      customer_name:  opp.customer_name || '',
      customer_type:  opp.customer_type || 'existing',
      contact_id:     opp.contact_id || '',
      planned_amount: opp.planned_amount ?? '',
      material_group: opp.material_group || '',
      expected_month: opp.expected_month || currentMonth,
      notes:          opp.notes || '',
    });
    setShowModal(true);
  }
  function closeModal() {
    setShowModal(false);
    setEditingOpp(null);
    setForm(emptyForm(currentMonth));
  }

  // Close on ESC
  useEffect(() => {
    if (!showModal) return;
    const onKey = (e) => { if (e.key === 'Escape') closeModal(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [showModal]);

  const contactLabel = (c) =>
    c.company_name || `${c.first_name || ''} ${c.last_name || ''}`.trim() || 'Unnamed';

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div>
      {/* ── Summary bar ── */}
      <div className="bg-card rounded-2xl border border-border p-5 mb-6">
        <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
          <div>
            <h2 className="text-base font-semibold text-foreground">Opportunities</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Plan your monthly target by customer ·{' '}
              {new Date().toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}
            </p>
          </div>
          <button
            onClick={openAdd}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 transition-colors"
          >
            <Icon name="Plus" size={15} />
            Add Opportunity
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
          <div className="bg-muted rounded-xl p-4 text-center">
            <p className="text-xl font-bold text-foreground tabular-nums">
              {formatCurrency(monthlyTarget)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">Monthly Target</p>
          </div>
          <div className="bg-muted rounded-xl p-4 text-center">
            <p className={`text-xl font-bold tabular-nums ${
              monthlyTarget > 0 && totalPlanned >= monthlyTarget ? 'text-green-600' : 'text-blue-600'
            }`}>
              {formatCurrency(totalPlanned)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">Total Planned</p>
          </div>
          <div className="bg-muted rounded-xl p-4 text-center">
            <p className={`text-xl font-bold tabular-nums ${
              isUnderPlanned ? 'text-red-600' : 'text-green-600'
            }`}>
              {formatCurrency(unplanned)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {isUnderPlanned ? 'Still Unplanned' : 'Fully Planned ✓'}
            </p>
          </div>
        </div>

        <div>
          <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
            <span>Planning Progress</span>
            <span className="font-medium text-foreground">
              {planningPct.toFixed(1)}% planned
            </span>
          </div>
          <div className="w-full h-2.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{
                width: `${planningPct}%`,
                background:
                  planningPct >= 100 ? '#059669' : planningPct >= 70 ? '#3B82F6' : '#F59E0B',
              }}
            />
          </div>
        </div>

        {isUnderPlanned && (
          <div className="flex items-start gap-2 mt-3 px-3 py-2 bg-amber-50 border border-amber-100 rounded-xl">
            <Icon name="AlertTriangle" size={14} className="text-amber-500 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-700">
              <strong>{formatCurrency(unplanned)}</strong> of the target is not yet planned.
              Add more opportunities to cover the full monthly target.
            </p>
          </div>
        )}
      </div>

      {/* ── Filters ── */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div className="flex gap-2 flex-wrap">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilterStatus(f.id)}
              className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors ${
                filterStatus === f.id
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'border-border text-muted-foreground hover:bg-muted'
              }`}
            >
              {f.label}
              {f.id !== 'all' && (
                <span className="ml-1.5 opacity-70">
                  {opportunities.filter((o) => o.status === f.id).length}
                </span>
              )}
            </button>
          ))}
        </div>

        {(isDirector || isTeamLead) && teamMembers.length > 0 && (
          <select
            value={filterOwner}
            onChange={(e) => setFilterOwner(e.target.value)}
            className="text-xs border border-border rounded-xl px-3 py-2 bg-card text-foreground focus:outline-none focus:border-blue-400"
          >
            <option value="all">All Salesmen</option>
            {teamMembers.map((m) => (
              <option key={m.id} value={m.id}>{m.full_name}</option>
            ))}
          </select>
        )}
      </div>

      {/* ── Error ── */}
      {loadError && (
        <div className="flex items-start gap-2 p-4 mb-4 rounded-xl bg-red-50 border border-red-100">
          <Icon name="AlertCircle" size={16} className="text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-red-700">Could not load opportunities</p>
            <p className="text-xs text-red-600 mt-0.5">{loadError}</p>
          </div>
        </div>
      )}

      {/* ── List ── */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 bg-muted rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : opportunities.length === 0 && !loadError ? (
        <div className="text-center py-16 bg-card rounded-2xl border border-border">
          <div className="w-14 h-14 rounded-full bg-blue-50 flex items-center justify-center mx-auto mb-4">
            <Icon name="Target" size={24} className="text-blue-400" />
          </div>
          <h3 className="text-sm font-semibold text-foreground mb-2">No opportunities yet</h3>
          <p className="text-xs text-muted-foreground mb-5 max-w-xs mx-auto">
            Start planning your monthly target by adding customers you plan to sell to this month.
          </p>
          <button
            onClick={openAdd}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 transition-colors"
          >
            <Icon name="Plus" size={15} />
            Add First Opportunity
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {opportunities.map((opp) => {
            const daysSince = Math.floor(
              (Date.now() - new Date(opp.created_at).getTime()) / 86400000,
            );
            const isOpen = opp.status === 'open';
            const isNew  = opp.customer_type === 'new';
            const stageColor = STAGE_COLOR[opp.deal?.stage] || '#6B7280';

            return (
              <div
                key={opp.id}
                className={`bg-card rounded-2xl border border-border transition-all duration-150 ${
                  isOpen ? 'hover:shadow-sm' : 'opacity-60'
                }`}
              >
                <div className="p-4">
                  <div className="flex items-start gap-3">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
                      isNew ? 'bg-green-100' : 'bg-blue-100'
                    }`}>
                      <Icon
                        name={isNew ? 'UserPlus' : 'Building2'}
                        size={16}
                        className={isNew ? 'text-green-600' : 'text-blue-600'}
                      />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-sm font-semibold text-foreground truncate">
                          {opp.customer_name}
                        </h3>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          isNew ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
                        }`}>
                          {isNew ? 'New Customer' : 'Existing'}
                        </span>
                        {!isOpen && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-medium capitalize">
                            {opp.status}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-4 mt-1.5 flex-wrap text-xs text-muted-foreground">
                        {opp.material_group && (
                          <span className="flex items-center gap-1">
                            <Icon name="Package" size={11} />{opp.material_group}
                          </span>
                        )}
                        {opp.expected_month && (
                          <span className="flex items-center gap-1">
                            <Icon name="Calendar" size={11} />
                            {new Date(opp.expected_month).toLocaleDateString('en-GB', {
                              month: 'short', year: 'numeric',
                            })}
                          </span>
                        )}
                        {opp.owner && (isDirector || isTeamLead) && (
                          <span className="flex items-center gap-1">
                            <Icon name="User" size={11} />{opp.owner.full_name}
                          </span>
                        )}
                      </div>

                      {opp.notes && (
                        <p className="text-xs text-muted-foreground mt-1.5 line-clamp-1">
                          {opp.notes}
                        </p>
                      )}
                    </div>

                    <div className="flex flex-col items-end gap-2 flex-shrink-0">
                      <p className="text-base font-bold tabular-nums text-foreground">
                        {formatCurrency(parseFloat(opp.planned_amount) || 0)}
                      </p>
                      <div className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full ${
                        daysSince > 30
                          ? 'bg-red-100 text-red-700'
                          : daysSince > 14
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-muted text-muted-foreground'
                      }`}>
                        <Icon name="Clock" size={10} />
                        {daysSince === 0 ? 'Today' : `${daysSince} days`}
                      </div>
                    </div>
                  </div>

                  {/* Linked deal */}
                  {!isOpen && opp.deal && (
                    <div className="mt-3 pt-3 border-t border-border flex items-center justify-between gap-3 flex-wrap">
                      <div className="flex items-center gap-2 min-w-0">
                        <Icon name="ArrowRight" size={13} className="text-muted-foreground flex-shrink-0" />
                        <span className="text-xs text-muted-foreground">Converted to deal:</span>
                        <span className="text-xs font-medium text-foreground truncate max-w-[12rem]">
                          {opp.deal.title}
                        </span>
                      </div>
                      <span
                        className="text-xs font-medium px-2 py-0.5 rounded-full capitalize flex-shrink-0"
                        style={{ background: `${stageColor}20`, color: stageColor }}
                      >
                        {opp.deal.stage?.replace('_', ' ')}
                      </span>
                    </div>
                  )}

                  {/* Actions */}
                  {isOpen && (
                    <div className="mt-3 pt-3 border-t border-border flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex gap-2">
                        <button
                          onClick={() => openEdit(opp)}
                          className="text-xs px-3 py-1.5 border border-border rounded-lg text-muted-foreground hover:bg-muted transition-colors"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(opp.id)}
                          className="text-xs px-3 py-1.5 border border-red-200 rounded-lg text-red-500 hover:bg-red-50 transition-colors"
                        >
                          Delete
                        </button>
                      </div>
                      <button
                        onClick={() => handleConvert(opp)}
                        className="flex items-center gap-1.5 text-xs px-4 py-1.5 bg-blue-600 text-white font-medium rounded-xl hover:bg-blue-700 transition-colors"
                      >
                        Convert to Lead
                        <Icon name="ArrowRight" size={12} />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Add / Edit modal ── */}
      {showModal && (
        <>
          <div
            className="fixed inset-0 z-[600] bg-black/40 backdrop-blur-sm"
            onClick={closeModal}
          />
          <div className="fixed inset-0 z-[600] flex items-center justify-center p-4 pointer-events-none">
            <div className="bg-card rounded-2xl shadow-2xl w-full max-w-md max-h-[85vh] flex flex-col overflow-hidden pointer-events-auto">
              <div className="px-6 py-4 border-b border-border flex items-center justify-between flex-shrink-0">
                <h2 className="text-base font-semibold text-foreground">
                  {editingOpp ? 'Edit Opportunity' : 'Add Opportunity'}
                </h2>
                <button
                  onClick={closeModal}
                  className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-muted transition-colors"
                >
                  <Icon name="X" size={16} className="text-muted-foreground" />
                </button>
              </div>

              <div className="px-6 py-5 space-y-4 overflow-y-auto flex-1">
                {/* Customer type */}
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-2 block">
                    Customer Type
                  </label>
                  <div className="flex gap-2">
                    {[
                      { v: 'existing', label: 'Existing Customer', icon: 'Building2' },
                      { v: 'new',      label: 'New Customer',      icon: 'UserPlus'  },
                    ].map((opt) => (
                      <button
                        key={opt.v}
                        onClick={() =>
                          setForm((f) => ({
                            ...f, customer_type: opt.v, contact_id: '', customer_name: '',
                          }))
                        }
                        className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border text-xs font-medium transition-colors ${
                          form.customer_type === opt.v
                            ? opt.v === 'new'
                              ? 'bg-green-600 text-white border-green-600'
                              : 'bg-blue-600 text-white border-blue-600'
                            : 'border-border text-muted-foreground hover:bg-muted'
                        }`}
                      >
                        <Icon name={opt.icon} size={13} />
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Customer */}
                {form.customer_type === 'existing' ? (
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">
                      Select Contact
                    </label>
                    <select
                      value={form.contact_id}
                      onChange={(e) => {
                        const c = contacts.find((x) => x.id === e.target.value);
                        setForm((f) => ({
                          ...f,
                          contact_id: e.target.value,
                          customer_name: c ? contactLabel(c) : '',
                        }));
                      }}
                      className="w-full border border-border rounded-xl px-3 py-2.5 text-sm bg-card text-foreground focus:outline-none focus:border-blue-400"
                    >
                      <option value="">Select a contact…</option>
                      {contacts.map((c) => (
                        <option key={c.id} value={c.id}>{contactLabel(c)}</option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">
                      New Customer Name
                    </label>
                    <input
                      type="text"
                      value={form.customer_name}
                      onChange={(e) => setForm((f) => ({ ...f, customer_name: e.target.value }))}
                      placeholder="Enter company or customer name"
                      className="w-full border border-border rounded-xl px-3 py-2.5 text-sm bg-card text-foreground focus:outline-none focus:border-blue-400"
                    />
                  </div>
                )}

                {/* Planned amount */}
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">
                    Planned Amount (SAR)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={form.planned_amount}
                    onChange={(e) => setForm((f) => ({ ...f, planned_amount: e.target.value }))}
                    placeholder="0.00"
                    className="w-full border border-border rounded-xl px-3 py-2.5 text-sm tabular-nums bg-card text-foreground focus:outline-none focus:border-blue-400"
                  />
                  {form.planned_amount && monthlyTarget > 0 && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Total planned will be{' '}
                      {formatCurrency(
                        totalPlanned
                        - (editingOpp ? parseFloat(editingOpp.planned_amount) || 0 : 0)
                        + (parseFloat(form.planned_amount) || 0),
                      )}{' '}
                      of {formatCurrency(monthlyTarget)} target
                    </p>
                  )}
                </div>

                {/* Material group */}
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">
                    Product / Material Group
                  </label>
                  <input
                    type="text"
                    value={form.material_group}
                    onChange={(e) => setForm((f) => ({ ...f, material_group: e.target.value }))}
                    placeholder="e.g. PVC Pipes, Fittings…"
                    className="w-full border border-border rounded-xl px-3 py-2.5 text-sm bg-card text-foreground focus:outline-none focus:border-blue-400"
                  />
                </div>

                {/* Expected month */}
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">
                    Expected Month
                  </label>
                  <input
                    type="month"
                    value={(form.expected_month || '').substring(0, 7)}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        expected_month: e.target.value ? `${e.target.value}-01` : null,
                      }))
                    }
                    className="w-full border border-border rounded-xl px-3 py-2.5 text-sm bg-card text-foreground focus:outline-none focus:border-blue-400"
                  />
                </div>

                {/* Notes */}
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">
                    Notes (optional)
                  </label>
                  <textarea
                    value={form.notes}
                    onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                    rows={3}
                    placeholder="Any notes about this opportunity…"
                    className="w-full border border-border rounded-xl px-3 py-2.5 text-sm resize-none bg-card text-foreground focus:outline-none focus:border-blue-400"
                  />
                </div>
              </div>

              <div className="px-6 py-4 border-t border-border flex gap-3 justify-end flex-shrink-0">
                <button
                  onClick={closeModal}
                  className="px-4 py-2 text-sm border border-border rounded-xl text-muted-foreground hover:bg-muted transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving || !form.customer_name?.trim() || !form.planned_amount}
                  className="px-5 py-2 text-sm bg-blue-600 text-white font-medium rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? 'Saving…' : editingOpp ? 'Save Changes' : 'Add Opportunity'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
