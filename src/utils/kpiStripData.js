import { supabase } from 'lib/supabase';

// TEMP: set true to re-enable the KPI diagnostic logs (see end of the function).
const KPI_DEBUG = false;

// The KPI strip aggregates over individual contributors (salesmen) only. Manager
// and supervisor targets are team roll-ups — including them double-counts the
// team/company Target (a manager's rolled-up target dwarfs the salesmen's), which
// is what made the Director/Manager/Supervisor cards wrong. So both the popup rows
// and the totals are built from salesmen only.
const CONTRIBUTOR_ROLES = ['salesman'];

const EMPTY_TOTALS = {
  target: 0, achieved: 0, deficit: 0,
  winRate3m: 0, winRateIsDefault: true,
  planned: 0, required: 0, plannedGap: 0,
};

function monthBounds() {
  const n = new Date();
  const startD = new Date(n.getFullYear(), n.getMonth(), 1);
  const endD = new Date(n.getFullYear(), n.getMonth() + 1, 0, 23, 59, 59);
  return {
    startISO: startD.toISOString(),
    endISO: endD.toISOString(),
    startDate: `${startD.getFullYear()}-${String(startD.getMonth() + 1).padStart(2, '0')}-01`,
    endDate: new Date(n.getFullYear(), n.getMonth() + 1, 0).toISOString().split('T')[0],
  };
}

// The 3 completed calendar months before the current one (current month excluded).
function threeMonthWindow() {
  const n = new Date();
  const start = new Date(n.getFullYear(), n.getMonth() - 3, 1);
  const end = new Date(n.getFullYear(), n.getMonth(), 0, 23, 59, 59);
  return { startISO: start.toISOString(), endISO: end.toISOString() };
}

// Compute the 5 KPI-strip metrics — per salesman and as scope totals.
//
//   Target      = this month's target (max per person across target types)
//   Achieved    = won-deal value closed this month
//   Deficit     = max(0, Target − Achieved)
//   Win Rate    = 3-month average (won ÷ total created, last 3 completed months;
//                 defaults to 50% with no history)
//   Planned Gap = max(0, Required − Planned), where
//                 Required = Target ÷ WinRate%, Planned = open Current-Sales-Plan
//                 (opportunities) value for this month
//
// `ownerIds`: null = whole company (director); an array = that scope
// (manager/supervisor team, or a single salesman). Empty array = nobody.
export async function computeKpiStripData({ companyId, ownerIds = null }) {
  const empty = { salesmanData: [], totals: { ...EMPTY_TOTALS } };
  if (!companyId) return empty;
  if (Array.isArray(ownerIds) && ownerIds.length === 0) return empty;

  // 1. Owner-role users in scope (the rows).
  let uq = supabase
    .from('users')
    .select('id, full_name, role')
    .eq('company_id', companyId)
    .eq('is_active', true)
    .in('role', CONTRIBUTOR_ROLES);
  if (Array.isArray(ownerIds)) uq = uq.in('id', ownerIds);
  const { data: users } = await uq;
  const userList = users || [];
  const scopeIds = userList.map((u) => u.id);
  if (scopeIds.length === 0) return empty;

  const mb = monthBounds();
  const w3 = threeMonthWindow();

  // 2. Targets — active MONTHLY targets overlapping the current month; max per
  //    person. period_type='monthly' excludes manager/head yearly team targets
  //    (a manager's yearly roll-up would otherwise dwarf the salesmen's quotas).
  const { data: targets } = await supabase
    .from('sales_targets')
    .select('target_amount, assigned_to')
    .eq('company_id', companyId)
    .eq('status', 'active')
    .eq('period_type', 'monthly')
    .in('assigned_to', scopeIds)
    .lte('period_start', mb.endISO)
    .gte('period_end', mb.startISO);
  const targetPer = {};
  (targets || []).forEach((t) => {
    const k = t.assigned_to;
    targetPer[k] = Math.max(targetPer[k] || 0, parseFloat(t.target_amount) || 0);
  });

  // 3. Achieved — won deals whose stage changed to won this month (final value).
  const { data: wonDeals } = await supabase
    .from('deals')
    .select('owner_id, amount, final_amount, stage_changed_at')
    .eq('company_id', companyId)
    .eq('stage', 'won')
    .in('owner_id', scopeIds)
    .gte('stage_changed_at', mb.startISO)
    .lte('stage_changed_at', mb.endISO);
  const achievedPer = {};
  (wonDeals || []).forEach((d) => {
    const amt = parseFloat(d.final_amount ?? d.amount) || 0;
    achievedPer[d.owner_id] = (achievedPer[d.owner_id] || 0) + amt;
  });

  // 4. Win rate — deals created in the last 3 completed months, grouped by owner.
  const { data: deals3 } = await supabase
    .from('deals')
    .select('owner_id, stage, created_at')
    .eq('company_id', companyId)
    .in('owner_id', scopeIds)
    .gte('created_at', w3.startISO)
    .lte('created_at', w3.endISO);
  const wrPer = {};
  (deals3 || []).forEach((d) => {
    if (!wrPer[d.owner_id]) wrPer[d.owner_id] = { won: 0, total: 0 };
    wrPer[d.owner_id].total += 1;
    if (d.stage === 'won') wrPer[d.owner_id].won += 1;
  });

  // 5. Planned — open Current-Sales-Plan (opportunities) value for this month.
  const { data: opps } = await supabase
    .from('opportunities')
    .select('owner_id, planned_amount')
    .eq('company_id', companyId)
    .eq('status', 'open')
    .in('owner_id', scopeIds)
    .gte('expected_month', mb.startDate)
    .lte('expected_month', mb.endDate);
  const plannedPer = {};
  (opps || []).forEach((o) => {
    plannedPer[o.owner_id] = (plannedPer[o.owner_id] || 0) + (parseFloat(o.planned_amount) || 0);
  });

  // 6. Funnel value — open (not won/lost) deal amounts, for the coverage check.
  const { data: openDeals } = await supabase
    .from('deals')
    .select('owner_id, amount')
    .eq('company_id', companyId)
    .in('owner_id', scopeIds)
    .not('stage', 'in', '("won","lost")');
  const funnelValue = (openDeals || []).reduce((s, d) => s + (parseFloat(d.amount) || 0), 0);

  const salesmanData = userList
    .map((u) => {
      const target = targetPer[u.id] || 0;
      const achieved = achievedPer[u.id] || 0;
      const deficit = Math.max(0, target - achieved);
      const wr = wrPer[u.id];
      const winRateIsDefault = !wr || wr.total === 0;
      const winRate3m = winRateIsDefault ? 50 : (wr.won / wr.total) * 100;
      const planned = plannedPer[u.id] || 0;
      const required = winRate3m > 0 ? target / (winRate3m / 100) : target * 2;
      const plannedGap = Math.max(0, required - planned);
      return {
        id: u.id, full_name: u.full_name, role: u.role,
        target, achieved, deficit,
        winRate3m, winRateIsDefault,
        planned, required, plannedGap,
      };
    })
    .sort((a, b) => b.target - a.target || b.achieved - a.achieved);

  // Totals across the whole scope.
  const target = Object.values(targetPer).reduce((s, v) => s + v, 0);
  const achieved = Object.values(achievedPer).reduce((s, v) => s + v, 0);
  const deficit = Math.max(0, target - achieved);
  const total3 = (deals3 || []).length;
  const won3 = (deals3 || []).filter((d) => d.stage === 'won').length;
  const winRateIsDefault = total3 === 0;
  const winRate3m = winRateIsDefault ? 50 : (won3 / total3) * 100;
  const planned = Object.values(plannedPer).reduce((s, v) => s + v, 0);
  const required = winRate3m > 0 ? target / (winRate3m / 100) : target * 2;
  const plannedGap = Math.max(0, required - planned);
  const attainmentPct = target > 0 ? (achieved / target) * 100 : 0;

  // Coverage check: Achieved + (Funnel × WinRate) + (Planning × WinRate) ≥ Target.
  const wrFrac = winRate3m / 100;
  const coverageValue = achieved + funnelValue * wrFrac + planned * wrFrac;
  const coverageHealthy = target > 0 ? coverageValue >= target : true;

  // Pacing check (linear): attainment% should keep up with the % of the month elapsed
  // (within a 15-point tolerance).
  const nowD = new Date();
  const totalDaysInMonth = new Date(nowD.getFullYear(), nowD.getMonth() + 1, 0).getDate();
  const daysElapsed = nowD.getDate();
  const pacingPct = totalDaysInMonth > 0 ? (daysElapsed / totalDaysInMonth) * 100 : 0;
  const pacingHealthy = attainmentPct >= pacingPct - 15;
  const isHealthy = coverageHealthy && pacingHealthy;

  const totals = {
    target, achieved, deficit, winRate3m, winRateIsDefault, planned, required, plannedGap,
    attainmentPct, funnelValue,
    coverageValue, coverageHealthy, pacingPct, pacingHealthy, isHealthy,
  };

  // TEMP debug — helps diagnose wrong team/director KPI values. Remove once fixed.
  if (KPI_DEBUG) {
    /* eslint-disable no-console */
    console.log('=== KPI DEBUG ===');
    console.log('companyId:', companyId);
    console.log('ownerIds (scope requested):', ownerIds === null ? 'NULL → whole company' : ownerIds);
    console.log('users/scopeIds:', scopeIds.length, userList.map((u) => `${u.full_name} (${u.role})`));
    console.log('targets rows fetched:', (targets || []).length, targets);
    console.log('won deals this month:', (wonDeals || []).length);
    console.log('deals (3-mo window):', (deals3 || []).length, '| won:', won3);
    console.log('opportunities (open, this month):', (opps || []).length);
    console.log('salesmanData built:', salesmanData);
    console.log('TOTALS:', totals);
    /* eslint-enable no-console */
  }

  return { salesmanData, totals };
}
