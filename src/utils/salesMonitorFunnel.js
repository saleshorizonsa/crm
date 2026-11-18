import { isConvertedWithDeal } from 'utils/planningDrill';
import { riyadhDate } from 'utils/visits';
import { STAGE_ORDER } from 'utils/forecastEngine';
import { stageLabel as sharedStageLabel } from 'utils/stageLabels';
import { SLA_DAYS, referenceTime } from 'utils/leadExpiryCheck';
import { THRESHOLDS } from 'utils/salesMonitorThresholds';

/**
 * SALES MONITOR — ③ FUNNEL (session 41, CEO 2026-11-16).
 *
 * After planning, salesmen convert plan items into deals and work them through
 * the stages. This is that execution, from rows the page already has:
 *
 *   PLAN → DEAL   the month's plan items (exactly the Plan outcomes rows), each
 *                 in ONE part: converted (isConvertedWithDeal — the Plan now
 *                 rule), split by what its deal is now; not started (still
 *                 open); moved to later months; other. The parts add up to the
 *                 plan items.
 *   BY STAGE      Insights' Funnel: calcDivisionMetrics' funnelRows — open
 *                 deals (not won / lost) of ACTIVE achievers in scope and
 *                 division, dated in the month by expected_close_date or
 *                 undated, raw amount (utils/openFunnel.js). Its total IS
 *                 metrics.monthFunnel, the "Open funnel" Insights shows. The
 *                 all-dates figure is metrics.pipeline over the same people.
 *   MOVEMENT      deal_stage_history rows entered in the window, each compared
 *                 with the deal's row before it in STAGE_ORDER: forward, back,
 *                 won, lost; a deal's first row on the day it was created is a
 *                 new lead; a first row on a later day (history began
 *                 2026-10-05) is "earlier stage not recorded".
 *   STUCK         open deals (all dates) with no stage change for
 *                 THRESHOLDS.stuckDays days — stage_changed_at, else created_at.
 *   OVERDUE       open deals (all dates) with expected_close_date before today.
 *   AUTO-MOVED    the month's future_orders rows the 3-day sweep wrote (reason
 *                 SLA_REASON; see salesMonitorData.js).
 *   DUE TO MOVE   open Leads the sweep will move within
 *                 THRESHOLDS.autoMoveSoonDays — its own clock (referenceTime)
 *                 and its own SLA_DAYS.
 *
 * Stuck, overdue and due-to-move describe the deals AS THEY ARE TODAY, in any
 * month viewed. Nothing here changes a figure of any other card.
 */

const DAY_MS = 86400000;
const OPEN_STAGES = STAGE_ORDER.filter((s) => !['won', 'lost'].includes(s));
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const sumBy = (rows, f) => (rows || []).reduce((s, r) => s + num(f(r)), 0);
const pct = (a, b) => (num(b) > 0 ? (num(a) / num(b)) * 100 : null);
const parts = (s) => String(s).slice(0, 10).split('-').map(Number);
const addDays = (ymd, n) => { const [y, m, d] = parts(ymd); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
const daysBetween = (a, b) => {
  const [y1, m1, d1] = parts(a);
  const [y2, m2, d2] = parts(b);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / DAY_MS);
};
export const stageLabel = (s) => sharedStageLabel(s);

export const PLAN_PART = {
  open: 'converted · deal open',
  won: 'converted · deal won',
  lost: 'converted · deal lost',
  gone: 'converted · deal not found',
  notStarted: 'not started',
  moved: 'moved to later months',
  other: 'other',
};
export const MOVE_KIND = {
  forward: 'moved forward', back: 'moved back', won: 'won', lost: 'lost',
  new: 'new lead', unrecorded: 'earlier stage not recorded', same: 'same stage again',
};

export function computeFunnel(c) {
  const {
    raw, metrics, itemRows, people, nameOf, knownDivision, primaryByUser, dealInView, viewSet,
    today, day, monthStart, monthEnd, now, contactRows, customerOfDeal, departedIds, noTargetIds,
  } = c;
  const forward = new Set(metrics.drill.forwardIds || []);
  const dealById = new Map([...(raw.allDeals || raw.deals || []), ...(raw.lookupDeals || [])].map((d) => [d.id, d]));
  const isOpen = (d) => !['won', 'lost'].includes(d.stage);

  // The open deals of active achievers in scope and division, ANY date — the
  // set calcDivisionMetrics sums into `pipeline` (same rows, same predicates).
  const openAll = (raw.deals || []).filter(dealInView).filter((d) => forward.has(d.owner_id) && isOpen(d));
  const periodIds = new Set((metrics.drill.funnelRows || []).map((d) => d.id));

  const lastContactOfDeal = new Map();
  (contactRows || []).forEach((x) => {
    if (!x.dealId || x.date > today) return;
    if (!lastContactOfDeal.has(x.dealId) || x.date > lastContactOfDeal.get(x.dealId)) lastContactOfDeal.set(x.dealId, x.date);
  });
  const dealRow = (d) => {
    const moved = riyadhDate(d.stage_changed_at || d.created_at);
    return {
      dealId: d.id,
      personId: d.owner_id,
      person: nameOf(d.owner_id),
      divisionId: knownDivision(d.division_id),
      customer: customerOfDeal(d),
      title: d.title || 'Deal',
      stageKey: d.stage,
      stage: stageLabel(d.stage),
      value: num(d.amount),
      expectedClose: d.expected_close_date ? String(d.expected_close_date).slice(0, 10) : null,
      daysInStage: moved ? daysBetween(moved, today) : null,
      lastContact: lastContactOfDeal.get(d.id) || null,
      inPeriod: periodIds.has(d.id),
      undated: !d.expected_close_date,
    };
  };
  const openRows = openAll.map(dealRow);
  const periodRows = openRows.filter((r) => r.inPeriod);
  const stuckRows = openRows.filter((r) => r.daysInStage !== null && r.daysInStage >= THRESHOLDS.stuckDays);
  const overdueRows = openRows.filter((r) => r.expectedClose && r.expectedClose < today);
  const dueRows = openAll.filter((d) => d.stage === 'lead').map((d) => {
    const ref = referenceTime({ ...d, converted_at: raw.leadConvertedAt?.[d.id] || null });
    const age = (now - ref) / DAY_MS;
    return { d, age };
  }).filter(({ age }) => Number.isFinite(age) && age >= SLA_DAYS - THRESHOLDS.autoMoveSoonDays)
    .map(({ d, age }) => ({ ...dealRow(d), daysAsLead: Math.floor(age), dueIn: age >= SLA_DAYS ? 'at the next sweep' : `within ${Math.max(1, Math.ceil(SLA_DAYS - age))} day` }));
  const largeNegotiation = (r) => r.stageKey === 'negotiation' && r.value > THRESHOLDS.negotiationLargeAmount;

  // ── Plan → deal ──
  const partOf = (r) => {
    if (isConvertedWithDeal(r.item)) {
      const d = r.deal;
      if (!d) return 'gone';
      if (d.stage === 'won') return 'won';
      if (d.stage === 'lost') return 'lost';
      return 'open';
    }
    if (r.movedOutOfMonth || r.status === 'moved_to_future') return 'moved';
    if (r.status === 'open') return 'notStarted';
    return 'other';
  };
  const planRows = itemRows.map((r) => {
    const key = partOf(r);
    return {
      oppId: r.oppId,
      dealId: r.dealId,
      personId: r.ownerId,
      person: r.person,
      divisionId: r.divisionId,
      customer: r.customer,
      title: r.deal?.title || 'Plan item',
      partKey: key,
      part: PLAN_PART[key],
      converted: ['open', 'won', 'lost', 'gone'].includes(key),
      stageKey: r.deal?.stage || null,
      stage: r.deal ? stageLabel(r.deal.stage) : '—',
      status: String(r.status || 'open').replace(/_/g, ' '),
      value: r.planned,
    };
  });
  const partSummary = (rows) => {
    const out = {};
    Object.keys(PLAN_PART).forEach((k) => {
      const mine = rows.filter((r) => r.partKey === k);
      out[k] = { count: mine.length, value: sumBy(mine, (r) => r.value) };
    });
    const conv = rows.filter((r) => r.converted);
    out.converted = { count: conv.length, value: sumBy(conv, (r) => r.value) };
    out.total = { count: rows.length, value: sumBy(rows, (r) => r.value) };
    out.convertedPct = pct(conv.length, rows.length);
    out.convertedValuePct = pct(out.converted.value, out.total.value);
    return out;
  };

  // ── Movement ──
  const history = raw.stageHistory || [];
  const byDeal = new Map();
  history.forEach((h) => { if (!byDeal.has(h.deal_id)) byDeal.set(h.deal_id, []); byDeal.get(h.deal_id).push(h); });
  byDeal.forEach((list) => list.sort((a, b) => String(a.entered_at).localeCompare(String(b.entered_at))));
  const weekFrom = addDays(day, -6);
  const order = (s) => STAGE_ORDER.indexOf(s);
  const moveRows = [];
  byDeal.forEach((list, dealId) => {
    const d = dealById.get(dealId);
    if (!d || !viewSet.has(d.owner_id) || !forward.has(d.owner_id) || !dealInView(d)) return;
    list.forEach((h, i) => {
      const date = riyadhDate(h.entered_at);
      // Kept: anything in the 7 days OR in the month to the selected day.
      if (!date || date > day || (date < weekFrom && date < monthStart)) return;
      const prior = i > 0 ? list[i - 1] : null;
      let kind;
      if (h.stage === 'won') kind = 'won';
      else if (h.stage === 'lost') kind = 'lost';
      else if (prior) {
        const a = order(prior.stage); const b = order(h.stage);
        kind = b > a ? 'forward' : b < a ? 'back' : 'same';
      } else kind = riyadhDate(d.created_at) === date ? 'new' : 'unrecorded';
      moveRows.push({
        id: `mv:${h.id}`,
        dealId,
        personId: d.owner_id,
        person: nameOf(d.owner_id),
        divisionId: knownDivision(d.division_id),
        customer: customerOfDeal(d),
        title: d.title || 'Deal',
        from: prior ? stageLabel(prior.stage) : null,
        stageKey: h.stage,
        move: `${prior ? stageLabel(prior.stage) : (kind === 'new' ? 'created' : 'not recorded')} → ${stageLabel(h.stage)}`,
        kind,
        kindLabel: MOVE_KIND[kind],
        date,
        stageNow: stageLabel(d.stage),
        amount: num(d.amount),
        in7: date >= weekFrom && date <= day,
        inMtd: date >= monthStart && date <= day,
      });
    });
  });
  moveRows.sort((a, b) => b.date.localeCompare(a.date) || a.person.localeCompare(b.person));
  const moveCounts = (rows) => Object.fromEntries([...Object.keys(MOVE_KIND), 'total'].map((k) => [k, k === 'total' ? rows.length : rows.filter((r) => r.kind === k).length]));
  const moves7 = moveRows.filter((r) => r.in7);
  const movesMtd = moveRows.filter((r) => r.inMtd);

  // ── Auto-moved by the 3-day rule ──
  const pickedDivision = c.pickedId || null;
  const autoRows = (raw.autoMoved || [])
    .filter((f) => viewSet.has(f.owner_id))
    .map((f) => ({
      id: `fo:${f.id}`,
      oppId: f.opportunity_id || null,
      dealId: null, // the sweep deleted it
      personId: f.owner_id,
      person: nameOf(f.owner_id),
      divisionId: knownDivision(f.division_id || primaryByUser[f.owner_id]),
      customer: f.customer_name || '—',
      title: f.customer_name || 'Lead',
      stageKey: 'lead',
      movedDate: riyadhDate(f.moved_at),
      expectedMonth: f.expected_month,
      status: f.status || '—',
      value: num(f.planned_amount),
    }))
    .filter((r) => !pickedDivision || r.divisionId === pickedDivision)
    .filter((r) => r.movedDate && r.movedDate >= monthStart && r.movedDate <= monthEnd);

  // ── per salesman, for the scoreboard ──
  const ownersOf = (id) => (id === '__departed__' ? new Set(departedIds) : id === '__no_target__' ? new Set(noTargetIds) : new Set([id]));
  const perPerson = {};
  people.forEach((p) => {
    const owners = ownersOf(p.id);
    const items = planRows.filter((r) => owners.has(r.personId));
    perPerson[p.id] = {
      converted: items.filter((r) => r.converted).length,
      items: items.length,
      // Insights' own per-person funnel (calcDivisionMetrics for the person).
      openValue: num(p.metrics?.monthFunnel),
      stuck: stuckRows.filter((r) => owners.has(r.personId)).length,
    };
  });

  const byStage = OPEN_STAGES.map((s) => {
    const rows = periodRows.filter((r) => r.stageKey === s);
    return { stage: s, label: stageLabel(s), count: rows.length, value: sumBy(rows, (r) => r.value) };
  });
  const otherStage = periodRows.filter((r) => !OPEN_STAGES.includes(r.stageKey));
  if (otherStage.length) byStage.push({ stage: 'other', label: 'Other stage', count: otherStage.length, value: sumBy(otherStage, (r) => r.value) });

  const cards = {
    plan: partSummary(planRows),
    stages: {
      total: num(metrics.monthFunnel),
      count: periodRows.length,
      byStage,
      undated: { count: periodRows.filter((r) => r.undated).length, value: sumBy(periodRows.filter((r) => r.undated), (r) => r.value) },
      allDates: { total: num(metrics.pipeline), count: openRows.length },
    },
    movement: {
      loaded: raw.stageHistoryLoaded !== false,
      day,
      weekFrom,
      week: moveCounts(moves7),
      mtd: moveCounts(movesMtd),
    },
    stuck: {
      stuck: { count: stuckRows.length, value: sumBy(stuckRows, (r) => r.value) },
      overdue: { count: overdueRows.length, value: sumBy(overdueRows, (r) => r.value) },
      autoMoved: { loaded: raw.autoMovedLoaded !== false, count: autoRows.length, value: sumBy(autoRows, (r) => r.value) },
      dueSoon: { count: dueRows.length },
    },
  };

  const sum = (f) => (rows) => sumBy(rows, f);
  const count = (rows) => rows.length;
  const DEAL_COLS = [
    { key: 'title', label: 'Deal' }, { key: 'stage', label: 'Stage' }, { key: 'value', label: 'Amount', type: 'money' },
    { key: 'expectedClose', label: 'Expected close', type: 'date' }, { key: 'daysInStage', label: 'Days in stage', type: 'int' },
    { key: 'lastContact', label: 'Last contact', type: 'date' },
  ];
  const tabs = {
    base: { rows: [], searchKeys: ['person', 'customer', 'title'] },
    sets: [
      { id: 'funnel', options: [
        { id: 'planDeal', label: 'Plan → deal', rows: planRows, total: sum((r) => r.value), unit: 'SAR', columns: [{ key: 'customer', label: 'Customer' }, { key: 'part', label: 'Became' }, { key: 'stage', label: 'Deal stage' }, { key: 'value', label: 'Planned', type: 'money' }],
          explain: 'Every plan item of the month and what it became: converted into a deal (by what the deal is now), not started (still open), moved to later months, or other. The parts add up to the plan items; values are planned amounts.' },
        { id: 'byStage', label: 'By stage', rows: periodRows, total: sum((r) => r.value), unit: 'SAR', columns: DEAL_COLS,
          explain: 'Insights\' Funnel: open deals of active salesmen in scope, due this month by expected close date or undated, raw amount.' },
        { id: 'moves7', label: 'Movement · 7 days', rows: moves7, total: count, unit: 'moves', columns: [{ key: 'title', label: 'Deal' }, { key: 'move', label: 'Move' }, { key: 'date', label: 'Date', type: 'date' }, { key: 'kindLabel', label: 'Kind' }],
          explain: 'Every stage change recorded in the 7 days to the selected day (deal stage history).' },
        { id: 'movesMtd', label: 'Movement · month to date', rows: movesMtd, total: count, unit: 'moves', columns: [{ key: 'title', label: 'Deal' }, { key: 'move', label: 'Move' }, { key: 'date', label: 'Date', type: 'date' }, { key: 'kindLabel', label: 'Kind' }],
          explain: 'Every stage change recorded from the 1st to the selected day (deal stage history).' },
        { id: 'stuck', label: 'Stuck', rows: stuckRows, total: sum((r) => r.value), unit: 'SAR', columns: DEAL_COLS,
          explain: `Open deals, any date, with no stage change for ${THRESHOLDS.stuckDays} days or more — as of today.` },
        { id: 'overdue', label: 'Overdue', rows: overdueRows, total: sum((r) => r.value), unit: 'SAR', columns: DEAL_COLS,
          explain: 'Open deals, any date, past their expected close date — as of today.' },
        { id: 'autoMoved', label: 'Auto-moved', rows: autoRows, total: sum((r) => r.value), unit: 'SAR', columns: [{ key: 'title', label: 'Lead' }, { key: 'movedDate', label: 'Moved', type: 'date' }, { key: 'expectedMonth', label: 'To', type: 'month' }, { key: 'value', label: 'Amount', type: 'money' }],
          explain: `Leads moved to Future Orders this month by the ${SLA_DAYS}-day rule (no contact within ${SLA_DAYS} days in the Lead stage).` },
        { id: 'dueSoon', label: 'Due to auto-move', rows: dueRows, total: sum((r) => r.value), unit: 'SAR', columns: DEAL_COLS,
          explain: `Leads the ${SLA_DAYS}-day rule will move to Future Orders within ${THRESHOLDS.autoMoveSoonDays} day unless they move forward — as of now.` },
        { id: 'allOpen', label: 'All open deals', rows: openRows, total: sum((r) => r.value), unit: 'SAR', columns: DEAL_COLS,
          explain: 'Every open deal of active salesmen in scope, whatever its date — the all-dates total.' },
      ] },
      { id: 'stage', options: [
        { id: 'all', label: 'All stages', isAll: true },
        ...OPEN_STAGES.map((s) => ({ id: s, label: stageLabel(s), filter: (r) => r.stageKey === s })),
      ] },
    ],
  };

  return {
    cards, perPerson, tabs,
    rows: { planRows, periodRows, openRows, stuckRows, overdueRows, moveRows, moves7, movesMtd, autoRows, dueRows },
    isLargeNegotiation: largeNegotiation,
  };
}
