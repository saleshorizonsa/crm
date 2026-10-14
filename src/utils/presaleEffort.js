// PRE-SALE EFFORT (CEO 2026-10-14): is the pre-sale work being done, next to
// the result? Four indicators and a score, per person, summed — never
// averaged — over the people and months in scope.
//
// WHO: active achievers only (salesman, supervisor, or is_contributor).
// WHEN: calendar months in Riyadh; a quarter or a year sums each month's
// numerator and denominator.
//
//   PLAN COVERAGE   (open + converted-with-deal plan value for the month)
//                   ÷ REQUIRED PLAN for the month — the page's own figure
//                   (target not yet achieved ÷ conversion, the Session 24 rule),
//                   counted up to the required plan (capped at 100%).
//                   Target already achieved → that month is 100% for the
//                   person and adds nothing to a group's sum (there is nothing
//                   left to cover). No target → the month is left out.
//   QUALIFIED BY DAY 7   plan items for the month that existed on the 7th and,
//                   by the end of the 7th, were converted (deal still there)
//                   or whose customer the owner had contacted since the 1st —
//                   the Plan-customer tracker's rule (utils/planContacts.js).
//                   ÷ plan items for the month that existed on the 7th. Open
//                   and converted items; moved-to-future ones are left out, as
//                   in PLAN → FUNNEL. Before the 7th: "from day 7".
//   REPLACEMENT RATE   value of deals lost in the period that have a
//                   replacement plan item (is_replacement, replaces_deal_id)
//                   ÷ value of all deals lost in the period. None lost: n/a.
//   PLAN → FUNNEL   plan items for the month converted with the deal still
//                   there ÷ plan items for the month (open + converted).
//                   Moved-to-future items are out of both; a converted item
//                   whose deal is gone counts as NOT converted.
//   EFFORT SCORE    the average of the indicators that have a value, × 100,
//                   rounded (25 each when all four are there).
import { supabase } from 'lib/supabase';
import { isConvertedWithDeal, isConvertedDealMissing } from 'utils/planningDrill';
import { fetchPlanContacts } from 'utils/planContacts';
import { riyadhDate, riyadhToday } from 'utils/visits';
import { CONTRIBUTOR_ROLES } from 'utils/planningCalculations';
import { calcDivisionMetrics } from 'utils/salesDivisionMetrics';

/** The verdict's thresholds, in one place (shown in the card's hover note). */
export const EFFORT_THRESHOLDS = {
  highEffortScore: 60,          // effort score ≥ this is "high effort"
  // high result = % of target ≥ the period's pace (days elapsed ÷ days in
  // the period; a past period = 100%)
};

export const INDICATORS = [
  { key: 'coverage', label: 'Plan coverage', short: 'Coverage' },
  { key: 'day7', label: 'Qualified by day 7', short: 'Day 7' },
  { key: 'replacement', label: 'Replacement rate', short: 'Replacement' },
  { key: 'planToFunnel', label: 'Plan → funnel', short: 'Plan→funnel' },
];

export const VERDICT = {
  attention: 'Needs attention',
  working: 'Working, not converting',
  thin: 'Thin pipeline',
  onTrack: 'On track',
  noTarget: 'no target',
};
// Needs attention first.
const VERDICT_ORDER = [VERDICT.attention, VERDICT.working, VERDICT.thin, VERDICT.onTrack, VERDICT.noTarget];

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const pad = (n) => String(n).padStart(2, '0');

/** The active achievers among these ids. */
export function effortPeople(ids, users) {
  const set = new Set(ids || []);
  return (users || []).filter((u) => set.has(u.id) && u.is_active !== false
    && (CONTRIBUTOR_ROLES.includes(u.role) || u.is_contributor === true));
}

/** The calendar months a period covers: { key, start, end, day7 }. */
export function monthsOf(start, end) {
  if (!start || !end) return [];
  const out = [];
  let y = Number(start.slice(0, 4));
  let m = Number(start.slice(5, 7));
  const endKey = end.slice(0, 7);
  for (let i = 0; i < 240; i += 1) {
    const key = `${y}-${pad(m)}`;
    if (key > endKey) break;
    const last = new Date(y, m, 0).getDate();
    out.push({ key, start: `${key}-01`, end: `${key}-${pad(last)}`, day7: `${key}-07` });
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return out;
}

/**
 * The rows behind the four indicators, for these people and this period.
 * Every read is filtered to the people in scope (RLS is the real boundary).
 * @returns {{ opps, lostDeals, replacedIds:Set, contactedItemIds:Set, failed }}
 */
export async function fetchEffortRows({ companyId, ownerIds, start, end, today = riyadhToday() }) {
  const empty = { opps: [], lostDeals: [], replacedIds: new Set(), contactedItemIds: new Set(), failed: false };
  const ids = [...new Set((ownerIds || []).filter(Boolean))];
  if (!companyId || !ids.length || !start || !end) return empty;

  const [oppsRes, lostRes] = await Promise.all([
    supabase.from('opportunities')
      .select('id, owner_id, contact_id, customer_name, planned_amount, status, deal_id, expected_month, created_at, converted_at, division_id')
      .eq('company_id', companyId)
      .in('owner_id', ids)
      .gte('expected_month', start)
      .lte('expected_month', end),
    supabase.from('deals')
      .select('id, title, owner_id, amount, lost_at, division_id, contact_id, contacts!contact_id(company_name, first_name, last_name)')
      .eq('company_id', companyId)
      .in('owner_id', ids)
      .eq('stage', 'lost')
      .gte('lost_at', `${start}T00:00:00+03:00`)
      .lte('lost_at', `${end}T23:59:59.999+03:00`),
  ]);
  if (oppsRes.error || lostRes.error) {
    console.error('fetchEffortRows:', oppsRes.error || lostRes.error);
    return { ...empty, failed: true };
  }
  const lostDeals = (lostRes.data || []).filter((d) => {
    const day = riyadhDate(d.lost_at);
    return day && day >= start && day <= end;
  });

  // Replacement plan items for those deals, whatever their month or status.
  const replacedIds = new Set();
  const lostIds = lostDeals.map((d) => d.id);
  for (let i = 0; i < lostIds.length; i += 200) {
    // eslint-disable-next-line no-await-in-loop
    const { data, error } = await supabase.from('opportunities')
      .select('replaces_deal_id')
      .eq('company_id', companyId)
      .eq('is_replacement', true)
      .in('replaces_deal_id', lostIds.slice(i, i + 200));
    if (error) return { ...empty, failed: true };
    (data || []).forEach((o) => replacedIds.add(o.replaces_deal_id));
  }

  // Contacted by day 7: the Plan-customer tracker, asked about the 1st..7th
  // of each month whose 7th has passed.
  const contactedItemIds = new Set();
  for (const mo of monthsOf(start, end)) {  // eslint-disable-line no-restricted-syntax
    if (mo.day7 > today) continue;            // eslint-disable-line no-continue
    // eslint-disable-next-line no-await-in-loop
    const res = await fetchPlanContacts({ companyId, ownerIds: ids, start: mo.start, end: mo.day7 });
    if (res.failed) return { ...empty, failed: true };
    res.rows.filter((r) => r.contacted).forEach((r) => (r.itemIds || []).forEach((id) => contactedItemIds.add(id)));
  }

  return { opps: oppsRes.data || [], lostDeals, replacedIds, contactedItemIds, failed: false };
}

const ratio = (n, d) => (d > 0 ? n / d : null);
const customerOf = (o) => o.customer_name || '—';
const dealCustomer = (d) => {
  const c = d.contacts || d.contact || null;
  return c?.company_name || [c?.first_name, c?.last_name].filter(Boolean).join(' ') || d.title || '—';
};

/**
 * One person's indicators.
 *
 * @param {object}   p
 * @param {string}   p.personId
 * @param {object[]} p.months      monthsOf(...)
 * @param {object}   p.rows        fetchEffortRows(...)
 * @param {function} p.requiredFor (personId, month) => { target, required } — the page's figures
 * @param {string|null} p.divisionId  a division view: only that division's rows
 * @param {string}   p.today       yyyy-MM-dd, Riyadh
 */
export function personEffort({ personId, months, rows, requiredFor, divisionId = null, today = riyadhToday() }) {
  const inDiv = (r) => !divisionId || r.division_id === divisionId;
  const mine = (rows.opps || []).filter((o) => o.owner_id === personId && inDiv(o));
  const planned = (o) => o.status === 'open' || o.status === 'converted';
  const out = {
    coverage: { num: 0, den: 0, achievedMonths: 0, targetMonths: 0, rows: [] },
    day7: { num: 0, den: 0, pending: false, rows: [] },
    replacement: { num: 0, den: 0, rows: [] },
    planToFunnel: { num: 0, den: 0, rows: [] },
  };

  months.forEach((mo) => {
    const items = mine.filter((o) => String(o.expected_month).slice(0, 7) === mo.key && planned(o));

    // ── coverage ──
    const { target, required } = requiredFor(personId, mo) || { target: 0, required: 0 };
    const value = items.filter((o) => o.status === 'open' || isConvertedWithDeal(o))
      .reduce((s, o) => s + num(o.planned_amount), 0);
    if (target > 0) {
      out.coverage.targetMonths += 1;
      if (required <= 0) {
        out.coverage.achievedMonths += 1;
        out.coverage.rows.push({ month: mo.start, planned: value, required: 0, counted: 0, note: 'target achieved' });
      } else {
        const counted = Math.min(value, required);
        out.coverage.num += counted;
        out.coverage.den += required;
        out.coverage.rows.push({ month: mo.start, planned: value, required, counted, note: value >= required ? 'covered' : '' });
      }
    } else {
      out.coverage.rows.push({ month: mo.start, planned: value, required: null, counted: null, note: 'no target' });
    }

    // ── qualified by day 7 ──
    if (mo.day7 > today) {
      out.day7.pending = true;
    } else {
      items.filter((o) => (riyadhDate(o.created_at) || '9999') <= mo.day7).forEach((o) => {
        const convertedBy7 = isConvertedWithDeal(o) && (riyadhDate(o.converted_at) || '9999') <= mo.day7;
        const contactedBy7 = rows.contactedItemIds?.has(o.id) || false;
        const ok = convertedBy7 || contactedBy7;
        out.day7.den += 1;
        if (ok) out.day7.num += 1;
        out.day7.rows.push({
          oppId: o.id, customer: customerOf(o), month: o.expected_month, value: num(o.planned_amount),
          convertedBy7: convertedBy7 ? 'yes' : 'no', contactedBy7: contactedBy7 ? 'yes' : 'no', qualified: ok ? 'yes' : 'no',
        });
      });
    }

    // ── plan → funnel ──
    items.forEach((o) => {
      const converted = isConvertedWithDeal(o);
      out.planToFunnel.den += 1;
      if (converted) out.planToFunnel.num += 1;
      out.planToFunnel.rows.push({
        oppId: o.id, dealId: o.deal_id || null, customer: customerOf(o), month: o.expected_month, value: num(o.planned_amount),
        status: converted ? 'converted' : (isConvertedDealMissing(o) ? 'deal missing' : 'open'),
        counts: converted ? 'yes' : 'no',
      });
    });
  });

  // ── replacement (the whole period) ──
  (rows.lostDeals || []).filter((d) => d.owner_id === personId && inDiv(d)).forEach((d) => {
    const replaced = rows.replacedIds?.has(d.id) || false;
    out.replacement.den += num(d.amount);
    if (replaced) out.replacement.num += num(d.amount);
    out.replacement.rows.push({
      dealId: d.id, customer: dealCustomer(d), lostOn: riyadhDate(d.lost_at), value: num(d.amount), replaced: replaced ? 'yes' : 'no',
    });
  });

  return { personId, ...finish(out) };
}

/** Percentages, n/a reasons and the score, from summed numerators/denominators. */
function finish(ind) {
  const cov = ind.coverage;
  const coveragePct = cov.den > 0 ? cov.num / cov.den
    : (cov.achievedMonths > 0 ? 1 : null);
  const values = {
    coverage: { ...cov, pct: coveragePct, na: coveragePct === null ? 'no target' : null },
    day7: { ...ind.day7, pct: ratio(ind.day7.num, ind.day7.den),
      na: ind.day7.den > 0 ? null : (ind.day7.pending ? 'from day 7' : 'no plan items on day 7') },
    replacement: { ...ind.replacement, pct: ratio(ind.replacement.num, ind.replacement.den),
      na: ind.replacement.den > 0 ? null : 'no lost deals' },
    planToFunnel: { ...ind.planToFunnel, pct: ratio(ind.planToFunnel.num, ind.planToFunnel.den),
      na: ind.planToFunnel.den > 0 ? null : 'no plan items' },
  };
  const available = INDICATORS.filter((i) => values[i.key].pct !== null);
  const score = available.length
    ? Math.round((available.reduce((s, i) => s + values[i.key].pct, 0) / available.length) * 100)
    : null;
  return {
    ...values,
    score,
    naList: INDICATORS.filter((i) => values[i.key].pct === null).map((i) => `${i.label}: ${values[i.key].na}`),
  };
}

/**
 * The page's required plan for one person and one month: calcDivisionMetrics
 * over that month alone (its own target rows), exactly as a person's row on
 * Insights computes it for a one-month period.
 */
export function requiredPlanFor(raw, divisionId = null, today = riyadhToday()) {
  return (personId, mo) => {
    const m = calcDivisionMetrics([personId], {
      ...raw,
      divisionId,
      monthStart: mo.start,
      monthEnd: mo.end,
      targets: (raw?.targets || []).filter((t) => String(t.period_start || '').slice(0, 7) === mo.key),
      isCurrentMonth: mo.key === today.slice(0, 7),
      isAllTime: false,
    }) || {};
    return { target: Number(m.target) || 0, required: Number(m.requiredRaw) || 0 };
  };
}

/**
 * Every person's indicators and the group's, from rows already fetched.
 * The ONE function both Insights and /numbers-check call.
 */
export function computeEffortFor({ rows, people, raw, divisionId = null, start, end, today = riyadhToday() }) {
  const months = monthsOf(start, end);
  const requiredFor = requiredPlanFor(raw, divisionId, today);
  const perPerson = new Map();
  (people || []).forEach((p) => {
    perPerson.set(p.id, personEffort({ personId: p.id, months, rows, requiredFor, divisionId, today }));
  });
  return { months, perPerson, total: sumEffort([...perPerson.values()]) };
}

/** A group: numerators and denominators summed over the people — never their percentages. */
export function sumEffort(perPerson) {
  const list = perPerson || [];
  const sum = (k, f) => list.reduce((s, p) => s + num(p[k][f]), 0);
  const cat = (k) => list.flatMap((p) => (p[k].rows || []).map((r) => ({ ...r, owner_id: p.personId })));
  return finish({
    coverage: {
      num: sum('coverage', 'num'), den: sum('coverage', 'den'),
      achievedMonths: sum('coverage', 'achievedMonths'), targetMonths: sum('coverage', 'targetMonths'), rows: cat('coverage'),
    },
    day7: { num: sum('day7', 'num'), den: sum('day7', 'den'), pending: list.some((p) => p.day7.pending), rows: cat('day7') },
    replacement: { num: sum('replacement', 'num'), den: sum('replacement', 'den'), rows: cat('replacement') },
    planToFunnel: { num: sum('planToFunnel', 'num'), den: sum('planToFunnel', 'den'), rows: cat('planToFunnel') },
  });
}

/** Days elapsed ÷ days in the period; a past period 1, a future one 0. */
export function periodPace(start, end, today = riyadhToday()) {
  if (!start || !end) return 1;
  if (today > end) return 1;
  if (today < start) return 0;
  const d = (s) => Date.UTC(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10)));
  return ((d(today) - d(start)) / 86400000 + 1) / ((d(end) - d(start)) / 86400000 + 1);
}

/** The verdict for one person. */
export function verdictFor({ score, target, achieved, pace }) {
  if (!(target > 0)) return VERDICT.noTarget;
  const highEffort = score !== null && score >= EFFORT_THRESHOLDS.highEffortScore;
  const highResult = achieved / target >= pace;
  if (highEffort && highResult) return VERDICT.onTrack;
  if (highEffort) return VERDICT.working;
  if (highResult) return VERDICT.thin;
  return VERDICT.attention;
}

/** Needs attention first, then by effort (lowest first); no target last. */
export function sortByVerdict(rows) {
  return [...rows].sort((a, b) => (VERDICT_ORDER.indexOf(a.verdict) - VERDICT_ORDER.indexOf(b.verdict))
    || ((a.score ?? -1) - (b.score ?? -1)) || String(a.name).localeCompare(String(b.name)));
}

/** "68%" or the reason there is no figure. */
export const effortPct = (ind) => (ind.pct === null ? ind.na : `${Math.round(ind.pct * 100)}%`);
