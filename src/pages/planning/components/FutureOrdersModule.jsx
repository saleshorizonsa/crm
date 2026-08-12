import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from 'lib/supabase';
import { useAuth } from 'contexts/AuthContext';
import { useCurrency } from 'contexts/CurrencyContext';
import Icon from 'components/AppIcon';
import SalesmanSelector from 'components/ui/SalesmanSelector';
import { fetchTeamHierarchy } from 'utils/teamHierarchy';

const DIRECTOR_ROLES = ['director', 'head', 'admin'];
const TEAM_ROLES     = ['manager', 'supervisor'];

const STATUS_FILTERS = [
  { id: 'pending', label: 'Pending' },
  { id: 'moved',   label: 'Moved to Current Sales Plan' },
  { id: 'all',     label: 'All' },
];

// First of the CURRENT month, as yyyy-MM-dd (the boundary a future order must beat).
function currentMonthStart() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-01`;
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
  const [filterStatus, setFilterStatus] = useState('pending');
  const [filterOwner, setFilterOwner]   = useState('all');
  const [movingId, setMovingId]       = useState(null);

  // ── Team members (feed the salesman drill-down) ─────────────────────────────
  const fetchTeam = useCallback(async () => {
    if (!company?.id || !(isDirector || isTeamLead)) { setTeamMembers([]); return; }
    const team = await fetchTeamHierarchy({ companyId: company.id, userId: user?.id, role });
    setTeamMembers(team);
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

  useEffect(() => { fetchTeam(); }, [fetchTeam]);
  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  // ── Move a future order into the Current Sales Plan (opportunities table) ────
  // Shared by the manual "Move" button and the auto-move on load.
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
  async function moveToCurrentPlan(order) {
    setMovingId(order.id);
    try {
      await createOppFromOrder(order);
      fetchOrders();
      onOrderChange?.();
    } catch (err) {
      console.error('moveToCurrentPlan:', err);
      alert(`Could not move to Current Sales Plan: ${err.message || err}`);
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
        title:      '📅 Future Order Moved to Current Sales Plan',
        message: `"${order.customer_name}" reached its planned month and was moved to your Current Sales Plan.`,
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

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-card rounded-2xl border border-border p-5">
        <div className="mb-4">
          <h2 className="text-base font-semibold text-foreground">Future Orders</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Deals moved from the Funnel to a future month. When the expected month arrives they
            automatically move to Current Sales Plan.
          </p>
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
          <p className="text-xs text-muted-foreground max-w-sm mx-auto">
            Future orders appear here when a salesman moves a deal from the Funnel to a future
            month. To create a future order, open any deal in the Funnel and select
            “Move to Future Orders”.
          </p>
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
                          Moved to Current Sales Plan
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
                      onClick={() => moveToCurrentPlan(order)}
                      disabled={isMoving}
                      className="flex items-center gap-1.5 text-xs px-3 py-2 bg-blue-600 text-white font-medium rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50 flex-shrink-0"
                    >
                      {isMoving ? (
                        <Icon name="Loader2" size={13} className="animate-spin" />
                      ) : (
                        <Icon name="ArrowRight" size={13} />
                      )}
                      Move to Current Sales Plan
                    </button>
                  ) : onGoToOpportunities ? (
                    <button
                      onClick={onGoToOpportunities}
                      className="flex items-center gap-1.5 text-xs px-3 py-2 border border-border rounded-xl text-muted-foreground hover:bg-muted transition-colors flex-shrink-0"
                    >
                      View in Current Sales Plan
                      <Icon name="ArrowRight" size={12} />
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
