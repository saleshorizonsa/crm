import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from 'lib/supabase';
import { useAuth } from 'contexts/AuthContext';
import { useCurrency } from 'contexts/CurrencyContext';
import Icon from 'components/AppIcon';
import SalesmanSelector from 'components/ui/SalesmanSelector';
import ContactSearchInput from 'components/ui/ContactSearchInput';
import { fetchTeamHierarchy } from 'utils/teamHierarchy';

const DIRECTOR_ROLES = ['director', 'head', 'admin'];
const TEAM_ROLES     = ['manager', 'supervisor'];

const STATUS_FILTERS = [
  { id: 'pending', label: 'Pending' },
  { id: 'moved',   label: 'Moved to Opportunities' },
  { id: 'all',     label: 'All' },
];

const emptyForm = () => ({
  contact_id:     null,
  customer_name:  '',
  planned_amount: '',
  expected_month: '', // yyyy-MM from the <input type="month">
});

// First of the CURRENT month, as yyyy-MM-dd (the boundary a future order must beat).
function currentMonthStart() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-01`;
}

// yyyy-MM of NEXT month — the minimum a user may pick for a future order.
function nextMonthValue() {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function FutureOrdersModule({ adminCompany, onGoToOpportunities, onOrderChange }) {
  const { user, company: authCompany, userProfile } = useAuth();
  const { formatCurrency } = useCurrency();

  const company = adminCompany || authCompany;
  const role    = userProfile?.role;
  const isDirector = DIRECTOR_ROLES.includes(role);
  const isTeamLead = TEAM_ROLES.includes(role);

  const [orders, setOrders]           = useState([]);
  const [loading, setLoading]         = useState(true);
  const [teamMembers, setTeamMembers] = useState([]);
  const [contacts, setContacts]       = useState([]);
  const [filterStatus, setFilterStatus] = useState('pending');
  const [filterOwner, setFilterOwner]   = useState('all');
  const [movingId, setMovingId]       = useState(null);

  const [showAddModal, setShowAddModal] = useState(false);
  const [form, setForm]                 = useState(emptyForm);
  const [formError, setFormError]       = useState('');
  const [saving, setSaving]             = useState(false);

  // ── Team + contacts (contacts feed the ContactSearchInput; scoped by OWNER
  //    because contacts.company_id is null in this DB) ─────────────────────────
  const fetchSupport = useCallback(async () => {
    if (!company?.id) return;
    const team = (isDirector || isTeamLead)
      ? await fetchTeamHierarchy({ companyId: company.id, userId: user?.id, role })
      : [];
    setTeamMembers(team);

    const ownerIds = (isDirector || isTeamLead)
      ? Array.from(new Set([user?.id, ...team.map((m) => m.id)].filter(Boolean)))
      : [user?.id].filter(Boolean);

    let cq = supabase
      .from('contacts')
      .select('id, first_name, last_name, company_name, phone, mobile')
      .order('company_name');
    if (ownerIds.length) cq = cq.in('owner_id', ownerIds);
    const { data } = await cq;
    setContacts(data || []);
  }, [company?.id, isDirector, isTeamLead, user?.id, role]);

  // ── Fetch future orders (role-scoped + status + drill-down) ─────────────────
  const fetchOrders = useCallback(async () => {
    if (!company?.id) return;
    setLoading(true);
    try {
      let query = supabase
        .from('future_orders')
        .select(`
          id, customer_name, planned_amount, expected_month, status,
          opportunity_id, moved_at, created_at, contact_id, owner_id,
          owner:users!owner_id(id, full_name, role)
        `)
        .eq('company_id', company.id)
        .order('expected_month', { ascending: true });

      if (!isDirector && !isTeamLead) {
        query = query.eq('owner_id', user?.id);        // salesman → own only
      } else if (filterOwner !== 'all') {
        query = query.eq('owner_id', filterOwner);      // drilled into one salesman
      } else if (isTeamLead) {
        const ids = [user?.id, ...teamMembers.map((m) => m.id)].filter(Boolean);
        query = query.in('owner_id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000']);
      }
      // director/admin/head "All" → whole company (no owner filter)

      if (filterStatus !== 'all') query = query.eq('status', filterStatus);

      const { data, error } = await query;
      if (error) throw error;
      setOrders(data || []);
    } catch (err) {
      console.error('fetchOrders:', err);
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, [company?.id, isDirector, isTeamLead, user?.id, filterOwner, filterStatus, teamMembers]);

  useEffect(() => { fetchSupport(); }, [fetchSupport]);
  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  // ── Move a future order into Opportunities (shared by manual + auto) ────────
  const createOppFromOrder = useCallback(async (order) => {
    const now = new Date().toISOString();
    const { data: opp, error } = await supabase
      .from('opportunities')
      .insert({
        company_id:     company?.id,
        owner_id:       order.owner_id || user?.id,
        created_by:     user?.id,
        contact_id:     order.contact_id || null,
        customer_name:  order.customer_name,
        customer_type:  'existing',
        planned_amount: order.planned_amount,
        expected_month: order.expected_month,
        status:         'open',
      })
      .select()
      .single();
    if (error) throw error;

    const { error: updErr } = await supabase
      .from('future_orders')
      .update({ status: 'moved', opportunity_id: opp.id, moved_at: now, updated_at: now })
      .eq('id', order.id);
    if (updErr) throw updErr;

    return opp;
  }, [company?.id, user?.id]);

  // Manual move (button on a pending row).
  async function moveToOpportunities(order) {
    setMovingId(order.id);
    try {
      await createOppFromOrder(order);
      fetchOrders();
      onOrderChange?.();
    } catch (err) {
      console.error('moveToOpportunities:', err);
      alert(`Could not move to Opportunities: ${err.message || err}`);
    } finally {
      setMovingId(null);
    }
  }

  // Best-effort notification when an order auto-moves (uses the real notifications
  // schema: is_read + metadata; never throws).
  async function notifyMoved(order) {
    if (!order.owner_id) return;
    try {
      await supabase.from('notifications').insert({
        user_id:    order.owner_id,
        company_id: company?.id,
        type:       'future_order_moved',
        title:      '📅 Future Order Moved to Opportunities',
        message: `"${order.customer_name}" reached its planned month and was moved to your Opportunities.`,
        metadata:   { future_order_id: order.id },
        is_read:    false,
      });
    } catch (_) { /* notifications are best-effort */ }
  }

  // ── Auto-move on load: any of MY pending orders whose month has arrived ──────
  // Scoped to the acting user so that opening the tab as a manager/director never
  // mass-mutates other people's orders — each salesman's orders move when they
  // log in, which is the intended "auto-move on login" behaviour.
  const checkAutoMove = useCallback(async () => {
    if (!company?.id || !user?.id) return;
    const { data: toMove } = await supabase
      .from('future_orders')
      .select('*')
      .eq('company_id', company.id)
      .eq('owner_id', user.id)
      .eq('status', 'pending')
      .lte('expected_month', currentMonthStart());

    if (!toMove?.length) return;
    for (const order of toMove) {
      try {
        await createOppFromOrder(order);
        await notifyMoved(order);
      } catch (err) {
        console.error('autoMove:', err);
      }
    }
    fetchOrders();
    onOrderChange?.();
  }, [company?.id, user?.id, createOppFromOrder, fetchOrders, onOrderChange]);

  useEffect(() => { checkAutoMove(); }, [checkAutoMove]);

  // ── Add a future order ──────────────────────────────────────────────────────
  async function handleSave() {
    setFormError('');
    if (!form.customer_name || !form.planned_amount || !form.expected_month) return;

    // Future month only — current month (or earlier) belongs in Opportunities.
    const selected = new Date(`${form.expected_month}-01`);
    const n = new Date();
    const currentMonth = new Date(n.getFullYear(), n.getMonth(), 1);
    if (selected <= currentMonth) {
      setFormError(
        'Expected month must be in the future — use Opportunities for current-month planning.'
      );
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase.from('future_orders').insert({
        company_id:     company?.id,
        owner_id:       user?.id,
        created_by:     user?.id,
        contact_id:     form.contact_id || null,
        customer_name:  form.customer_name.trim(),
        planned_amount: parseFloat(form.planned_amount) || 0,
        expected_month: `${form.expected_month}-01`,
        status:         'pending',
      });
      if (error) throw error;

      setShowAddModal(false);
      setForm(emptyForm());
      fetchOrders();
      onOrderChange?.();
    } catch (err) {
      console.error('addFutureOrder:', err);
      setFormError(err.message || 'Could not save the future order.');
    } finally {
      setSaving(false);
    }
  }

  function closeModal() {
    setShowAddModal(false);
    setForm(emptyForm());
    setFormError('');
  }

  // Close modal on ESC
  useEffect(() => {
    if (!showAddModal) return;
    const onKey = (e) => { if (e.key === 'Escape') closeModal(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [showAddModal]);

  const minMonth = useMemo(() => nextMonthValue(), []);
  const canSave = form.customer_name && form.planned_amount && form.expected_month;

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-card rounded-2xl border border-border p-5">
        <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
          <div>
            <h2 className="text-base font-semibold text-foreground">Future Orders</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Plan customer orders for upcoming months · Auto-moves to Opportunities when the month arrives
            </p>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 transition-colors"
          >
            <Icon name="Plus" size={15} />
            Add Future Order
          </button>
        </div>

        <div className="flex items-center justify-between gap-3 flex-wrap">
          {/* Status filter tabs */}
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
                <span className="ml-1.5 opacity-70">
                  {orders.filter((o) => (f.id === 'all' ? true : o.status === f.id)).length}
                </span>
              </button>
            ))}
          </div>

          {(isDirector || isTeamLead) && teamMembers.length > 0 && (
            <SalesmanSelector
              value={filterOwner === 'all' ? null : filterOwner}
              onChange={(id) => setFilterOwner(id || 'all')}
              teamMembers={teamMembers}
            />
          )}
        </div>
      </div>

      {/* Orders list */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 bg-muted rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : orders.length === 0 ? (
        <div className="text-center py-16 bg-card rounded-2xl border border-border">
          <div className="w-14 h-14 rounded-full bg-blue-50 flex items-center justify-center mx-auto mb-4">
            <Icon name="CalendarClock" size={24} className="text-blue-400" />
          </div>
          <h3 className="text-sm font-semibold text-foreground mb-2">No future orders yet</h3>
          <p className="text-xs text-muted-foreground mb-5 max-w-xs mx-auto">
            Plan customer orders for upcoming months. They automatically move to Opportunities when the month arrives.
          </p>
          <button
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 transition-colors"
          >
            <Icon name="Plus" size={15} />
            Add First Future Order
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {orders.map((order) => {
            const isMoving = movingId === order.id;
            const isMoved  = order.status === 'moved';
            // expected_month is a full date ("2026-09-01"); parse day 02 so a
            // negative UTC offset can't roll it back into the previous month.
            const expectedDate = order.expected_month
              ? new Date(`${order.expected_month.substring(0, 7)}-02`)
              : new Date();
            const monthLabel = expectedDate.toLocaleDateString('en-GB', {
              month: 'long', year: 'numeric',
            });

            return (
              <div
                key={order.id}
                className={`bg-card rounded-2xl border border-border transition-all duration-150 ${
                  isMoved ? 'opacity-60' : 'hover:shadow-sm'
                }`}
              >
                <div className="p-4 flex items-center gap-4 flex-wrap">
                  {/* Month badge */}
                  <div className="w-14 h-14 rounded-xl bg-blue-50 border border-blue-100 flex flex-col items-center justify-center flex-shrink-0">
                    <span className="text-xs font-bold text-blue-600 uppercase">
                      {expectedDate.toLocaleDateString('en-GB', { month: 'short' })}
                    </span>
                    <span className="text-sm font-bold text-blue-800">
                      {expectedDate.getFullYear()}
                    </span>
                  </div>

                  {/* Details */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-semibold text-foreground truncate">
                        {order.customer_name}
                      </h3>
                      {isMoved && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium flex items-center gap-1">
                          <Icon name="CheckCircle" size={10} />
                          Moved to Opportunities
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1 flex-wrap text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Icon name="Calendar" size={10} />
                        {monthLabel}
                      </span>
                      {order.owner && (isDirector || isTeamLead) && (
                        <span className="flex items-center gap-1">
                          <Icon name="User" size={10} />
                          {order.owner.full_name}
                        </span>
                      )}
                      {isMoved && order.moved_at && (
                        <span>
                          Moved {new Date(order.moved_at).toLocaleDateString('en-GB', {
                            day: 'numeric', month: 'short',
                          })}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Amount */}
                  <div className="text-right flex-shrink-0">
                    <p className="text-base font-bold tabular-nums text-foreground">
                      {formatCurrency(parseFloat(order.planned_amount) || 0)}
                    </p>
                  </div>

                  {/* Action */}
                  {!isMoved ? (
                    <button
                      onClick={() => moveToOpportunities(order)}
                      disabled={isMoving}
                      className="flex items-center gap-1.5 text-xs px-3 py-2 bg-blue-600 text-white font-medium rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50 flex-shrink-0"
                    >
                      {isMoving ? (
                        <Icon name="Loader2" size={13} className="animate-spin" />
                      ) : (
                        <Icon name="ArrowRight" size={13} />
                      )}
                      Move to Opportunities
                    </button>
                  ) : onGoToOpportunities ? (
                    <button
                      onClick={onGoToOpportunities}
                      className="flex items-center gap-1.5 text-xs px-3 py-2 border border-border rounded-xl text-muted-foreground hover:bg-muted transition-colors flex-shrink-0"
                    >
                      View in Opportunities
                      <Icon name="ArrowRight" size={12} />
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Future Order modal */}
      {showAddModal && (
        <>
          <div
            className="fixed inset-0 z-[600] bg-black/40 backdrop-blur-sm"
            onClick={closeModal}
          />
          <div className="fixed inset-0 z-[600] flex items-center justify-center p-4 pointer-events-none">
            <div className="bg-card rounded-2xl shadow-2xl w-full max-w-md max-h-[85vh] flex flex-col overflow-hidden pointer-events-auto">
              <div className="px-6 py-4 border-b border-border flex items-center justify-between flex-shrink-0">
                <div>
                  <h2 className="text-base font-semibold text-foreground">Add Future Order</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Plan a customer order for a future month
                  </p>
                </div>
                <button
                  onClick={closeModal}
                  className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-muted transition-colors"
                >
                  <Icon name="X" size={16} className="text-muted-foreground" />
                </button>
              </div>

              <div className="px-6 py-5 space-y-4 overflow-y-auto flex-1">
                {/* Customer */}
                <ContactSearchInput
                  label="Customer"
                  required
                  contacts={contacts}
                  value={form.contact_id}
                  onChange={(contact) =>
                    setForm((f) => ({
                      ...f,
                      contact_id: contact?.id || null,
                      customer_name:
                        contact?.company_name ||
                        `${contact?.first_name || ''} ${contact?.last_name || ''}`.trim() ||
                        '',
                    }))
                  }
                />

                {/* Allow a free-typed name when the customer isn't in the list */}
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">
                    Customer Name *
                  </label>
                  <input
                    type="text"
                    value={form.customer_name}
                    onChange={(e) => setForm((f) => ({ ...f, customer_name: e.target.value }))}
                    placeholder="Company or customer name"
                    className="w-full border border-border rounded-xl px-3 py-2.5 text-sm bg-card text-foreground focus:outline-none focus:border-blue-400"
                  />
                </div>

                {/* Planned amount */}
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">
                    Planned Amount (SAR) *
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={form.planned_amount}
                    onChange={(e) => setForm((f) => ({ ...f, planned_amount: e.target.value }))}
                    placeholder="0.00"
                    className="w-full border border-border rounded-xl px-3 py-2.5 text-sm tabular-nums bg-card text-foreground focus:outline-none focus:border-blue-400"
                  />
                </div>

                {/* Expected month */}
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">
                    Expected Month *
                  </label>
                  <input
                    type="month"
                    min={minMonth}
                    value={form.expected_month}
                    onChange={(e) => setForm((f) => ({ ...f, expected_month: e.target.value }))}
                    className="w-full border border-border rounded-xl px-3 py-2.5 text-sm bg-card text-foreground focus:outline-none focus:border-blue-400"
                  />
                  <p className="text-xs text-muted-foreground mt-1">Must be next month or later</p>
                </div>

                {/* Error */}
                {formError && (
                  <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-100 rounded-xl">
                    <Icon name="AlertTriangle" size={14} className="text-amber-500 flex-shrink-0" />
                    <p className="text-xs text-amber-700">{formError}</p>
                  </div>
                )}
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
                  disabled={!canSave || saving}
                  className="px-5 py-2 text-sm bg-blue-600 text-white font-medium rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  <Icon name="CalendarClock" size={14} />
                  {saving ? 'Saving…' : 'Save Future Order'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
