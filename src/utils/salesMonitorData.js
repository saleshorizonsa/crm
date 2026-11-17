import { supabase } from 'lib/supabase';
import { fetchAllRows } from 'utils/fetchAllRows';
import { fetchAdditionalDivisions } from 'utils/divisionMembership';
import { fetchConversionBaseOrDeals, nextMonthBounds } from 'utils/planningCalculations';
import { scopeUserIds } from 'utils/salesDivisionMetrics';
import { resolveApproverMap } from 'utils/planApproval';
import { CONTACT_KINDS, ACTIVITY_CONTACT_KINDS, addDays } from 'utils/salesMonitor';
import { SLA_REASON } from 'utils/leadExpiryCheck';
import { isMissingColumn } from 'utils/missingColumn';

export { isMissingColumn };

/**
 * SALES MONITOR — the reads (session 34). Pure figures live in
 * utils/salesMonitor.js; this file only fetches.
 *
 * THE INSIGHTS HALF IS INSIGHTS' OWN QUERIES. Target, Achieved, Won-not-
 * invoiced, Planned (open) and the funnel come out of calcDivisionMetrics, and
 * the rows handed to it here are fetched with the same tables, columns that
 * matter, filters and windows as pages/sales-divisions/index.jsx — so the two
 * pages measure the same rows and cannot disagree. Two deliberate differences,
 * neither of which moves a figure Insights shows:
 *
 *   1. every list is paged through fetchAllRows (session 29): Insights reads
 *      deals in one request, which PostgREST caps at 1,000 rows;
 *   2. deals are read WITH lost ones (plan outcomes need them) and the lost
 *      rows are filtered out before calcDivisionMetrics sees them — exactly the
 *      `.not('stage','eq','lost')` Insights applies in the query.
 *
 * SCOPE FIRST, as on Insights: director/head/admin = the company, manager and
 * supervisor = their supervisor_id subtree (scopeUserIds, the shared rule).
 * Every read below is filtered to those ids in the database.
 *
 * contact_reports.contact_id arrives with
 * migrations/contact_reports_contact_id.sql. Until that is applied the column
 * does not exist and PostgREST rejects any select naming it, so it is read in
 * a SEPARATE, guarded request (the numbersCheck.js pattern): if it fails the
 * page works on deal → contact alone and says so, instead of going blank.
 */


const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** First/last day of a yyyy-MM month. */
export function monthWindow(monthKey) {
  const [y, m] = String(monthKey).split('-').map(Number);
  return { start: `${y}-${pad(m)}-01`, end: ymd(new Date(y, m, 0)), key: `${y}-${pad(m)}` };
}

const all = async (make) => {
  const res = await fetchAllRows(make);
  if (res.error) throw res.error;
  return res.data || [];
};

const chunks = (arr, n = 200) => {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
};

/** Rows by id, in chunks so a long id list never becomes an over-long URL. */
async function byIds(table, cols, ids) {
  const out = [];
  for (const part of chunks([...new Set((ids || []).filter(Boolean))])) {
    // eslint-disable-next-line no-await-in-loop
    const { data, error } = await supabase.from(table).select(cols).in('id', part);
    if (error) throw error;
    out.push(...(data || []));
  }
  return out;
}

/** Rows whose `col` is in `ids`, in chunks, through fetchAllRows. */
async function byColumn(table, cols, col, ids) {
  const out = [];
  for (const part of chunks([...new Set((ids || []).filter(Boolean))])) {
    // eslint-disable-next-line no-await-in-loop
    const res = await fetchAllRows(() => supabase.from(table).select(cols, { count: 'exact' }).in(col, part));
    if (res.error) return { data: out, error: res.error };
    out.push(...(res.data || []));
  }
  return { data: out, error: null };
}

/**
 * Everything the page shows, for one viewer and one month.
 *
 * @param {object} p
 * @param {string} p.companyId
 * @param {string} p.viewerId
 * @param {string} p.role
 * @param {string} p.monthKey  yyyy-MM
 * @param {Date}   [p.now]
 */
export async function loadSalesMonitor({ companyId, viewerId, role, monthKey, now = new Date() }) {
  const { start: monthStart, end: monthEnd } = monthWindow(monthKey);
  const nextMonth = nextMonthBounds(now);

  // ── PHASE 1: who may this viewer see? ──
  const [usersRes, divisionsRes] = await Promise.all([
    supabase.from('users')
      .select('id, full_name, role, supervisor_id, is_active, sales_division_id, is_contributor')
      .eq('company_id', companyId),
    supabase.from('sales_divisions')
      .select('id, name, sort_order')
      .eq('company_id', companyId)
      .order('sort_order', { ascending: true }),
  ]);
  if (usersRes.error) throw usersRes.error;
  const allUsers = usersRes.data || [];
  const scopeIds = scopeUserIds({ users: allUsers, viewerId, role });
  const users = allUsers.filter((u) => scopeIds.includes(u.id));
  const divisions = divisionsRes.error ? [] : divisionsRes.data || [];
  const base = {
    users, scopeIds, divisions, monthStart, monthEnd, monthKey, now,
    isCurrentMonth: monthKey === `${now.getFullYear()}-${pad(now.getMonth() + 1)}`,
    isAllTime: false,
    notes: [],
  };
  if (!scopeIds.length) {
    return {
      ...base, deals: [], allDeals: [], targets: [], deals3m: [], opps: [], futureOrders: [],
      returns: [], flags: [], escalations: [], additionalByUser: {}, conversionBase: {},
      planItems: [], bounceLogs: [], submissions: [], futurePushes: [], contactReports: [],
      activities: [], contacts: [], departedOpenPlan: [], contactIdColumn: false, purposeColumns: false,
      stageHistory: [], stageHistoryLoaded: false, autoMoved: [], autoMovedLoaded: false, leadConvertedAt: {},
    };
  }
  if (divisionsRes.error) base.notes.push('Sales divisions could not be loaded, so everyone is shown under Unassigned.');

  // The Monitor's OWN reads degrade: a failure shows as one line on the page
  // and an empty list, never a blank screen. Insights' reads above and below
  // still fail loudly, exactly as they do on Insights.
  const soft = async (label, make) => {
    const res = await fetchAllRows(make);
    if (!res.error) return res.data || [];
    console.warn(`Sales Monitor: ${label} not loaded:`, res.error.message);
    base.notes.push(`${label} could not be read, so what depends on them is missing from this page.`);
    return [];
  };
  const w3Start = new Date(now.getFullYear(), now.getMonth() - 3, 1).toISOString();
  const w3End = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59).toISOString();

  // ── PHASE 2: Insights' reads, plus the Monitor's own ──
  const [
    allDeals, targets, deals3m, openOpps, futureOrders, returnsRaw,
    planItemsInMonth, bounceLogs, submissionsRes, futurePushes,
    contactReports, activities, departedOpenPlan,
  ] = await Promise.all([
    // Insights' deal read, every stage, with the columns the outcomes and the
    // exception rules need on top.
    all(() => supabase.from('deals')
      .select('id, title, stage, amount, final_amount, is_invoiced, invoice_date, invoice_number, owner_id, division_id, forecast_amount, expected_close_date, stage_changed_at, closed_at, created_at, contact_id, lost_reason, lost_reason_code, contacts!contact_id(first_name, last_name, company_name)', { count: 'exact' })
      .eq('company_id', companyId)
      .in('owner_id', scopeIds)),
    // Insights' target read, verbatim.
    all(() => supabase.from('sales_targets')
      .select('id, assigned_to, target_amount, period_type, target_type, period_start, period_end, product_group, division_id, client_targets(target_amount)', { count: 'exact' })
      .eq('company_id', companyId)
      .eq('status', 'active')
      .eq('period_type', 'monthly')
      .in('assigned_to', scopeIds)
      .lte('period_start', monthEnd)
      .gte('period_end', monthStart)),
    // The 3-month conversion window, verbatim.
    all(() => supabase.from('deals')
      .select('id, stage, owner_id, division_id, created_at, closed_at, invoice_number', { count: 'exact' })
      .eq('company_id', companyId)
      .in('owner_id', scopeIds)
      .gte('created_at', w3Start)
      .lte('created_at', w3End)),
    // Open plan items of the month, verbatim (Insights' Planned).
    all(() => supabase.from('opportunities')
      .select('id, owner_id, planned_amount, division_id', { count: 'exact' })
      .eq('company_id', companyId)
      .in('owner_id', scopeIds)
      .eq('status', 'open')
      .gte('expected_month', monthStart)
      .lte('expected_month', monthEnd)),
    // Carry-in, verbatim: next month relative to TODAY.
    all(() => supabase.from('future_orders')
      .select('id, owner_id, planned_amount, division_id', { count: 'exact' })
      .eq('company_id', companyId)
      .in('owner_id', scopeIds)
      .eq('status', 'pending')
      .gte('expected_month', nextMonth.startDate)
      .lte('expected_month', nextMonth.endDate)),
    // Returns in the month, verbatim.
    all(() => supabase.from('deal_returns')
      .select('id, deal_id, return_date, return_amount, deals!inner(owner_id, division_id)', { count: 'exact' })
      .eq('company_id', companyId)
      .in('deals.owner_id', scopeIds)
      .gte('return_date', monthStart)
      .lte('return_date', monthEnd)),

    // ── the Monitor's own ──
    // EVERY plan item of the month, whatever became of it.
    all(() => supabase.from('opportunities')
      .select('id, owner_id, contact_id, customer_name, planned_amount, status, expected_month, deal_id, division_id, bounce_count, last_bounced_at, converted_at, created_at, updated_at', { count: 'exact' })
      .eq('company_id', companyId)
      .in('owner_id', scopeIds)
      .gte('expected_month', monthStart)
      .lte('expected_month', monthEnd)),
    // Bounces logged in the month: they identify a plan item that was moved
    // OUT of the month (its expected_month now later) and still belongs to it.
    soft('Bounce-backs', () => supabase.from('bounce_back_logs')
      .select('id, owner_id, opportunity_id, bounce_count, bounced_at, reason', { count: 'exact' })
      .eq('company_id', companyId)
      .in('owner_id', scopeIds)
      .gte('bounced_at', `${monthStart}T00:00:00+03:00`)
      .lte('bounced_at', `${monthEnd}T23:59:59+03:00`)),
    // The month's plan submissions. A failure is shown, never read as
    // "nobody submitted".
    supabase.from('plan_submissions')
      .select('id, owner_id, plan_month, is_submitted, is_late, deadline_date, submitted_at, approval_status, approved_by, total_planned, required_plan, flagged, rejection_reason, updated_at')
      .eq('company_id', companyId)
      .in('owner_id', scopeIds)
      .eq('plan_month', `${monthStart}`),
    // Where moved work went: future orders from the month onwards.
    soft('Future orders', () => supabase.from('future_orders')
      .select('id, owner_id, contact_id, customer_name, planned_amount, expected_month, status, opportunity_id, source_deal_id, moved_at, created_at', { count: 'exact' })
      .eq('company_id', companyId)
      .in('owner_id', scopeIds)
      .gt('expected_month', monthEnd)),
    // Contacts of every kind the page counts — all time up to the month end,
    // because "last visit" and "not contacted in 14 days" look back past the
    // 1st. contact_id is NOT named here (see the guarded read below).
    soft('Contact reports', () => supabase.from('contact_reports')
      .select('id, owner_id, deal_id, contact_type, contact_date, duration_minutes, customer_response, next_action, follow_up_date, notes, is_audited, created_at', { count: 'exact' })
      .eq('company_id', companyId)
      .in('owner_id', scopeIds)
      .in('contact_type', CONTACT_KINDS)
      .lte('contact_date', monthEnd)),
    soft('Activities', () => supabase.from('activities')
      .select('id, type, owner_id, user_id, contact_id, deal_id, title, description, outcome, next_action, next_action_date, duration_minutes, completed_at, due_date, created_at', { count: 'exact' })
      .eq('company_id', companyId)
      .in('type', ACTIVITY_CONTACT_KINDS)
      .or(`owner_id.in.(${scopeIds.join(',')}),user_id.in.(${scopeIds.join(',')})`)),
    // Open plan items of DEPARTED owners, any month — for "open work owned by
    // a departed salesman". Only a company-scope viewer has departed people
    // in scope; for everyone else this returns nothing.
    (() => {
      const departed = users.filter((u) => u.is_active === false).map((u) => u.id);
      if (!departed.length) return Promise.resolve([]);
      return soft('Open plan items of departed salesmen', () => supabase.from('opportunities')
        .select('id, owner_id, customer_name, contact_id, planned_amount, expected_month, status', { count: 'exact' })
        .eq('company_id', companyId)
        .in('owner_id', departed)
        .eq('status', 'open'));
    })(),
  ]);

  if (submissionsRes.error) {
    base.notes.push('Plan submissions could not be read — plan status is not shown.');
  }

  // Plan items moved OUT of the month: logged as bounced in it, now dated later.
  const inMonthIds = new Set(planItemsInMonth.map((o) => o.id));
  const movedOutIds = [...new Set(bounceLogs.map((b) => b.opportunity_id).filter((id) => id && !inMonthIds.has(id)))];
  const movedOut = movedOutIds.length
    ? (await byIds('opportunities', 'id, owner_id, contact_id, customer_name, planned_amount, status, expected_month, deal_id, division_id, bounce_count, last_bounced_at, converted_at, created_at, updated_at', movedOutIds))
      .filter((o) => scopeIds.includes(o.owner_id) && String(o.expected_month || '') > monthEnd)
      .map((o) => ({ ...o, movedOutOfMonth: true }))
    : [];
  const planItems = [...planItemsInMonth, ...movedOut];

  // Deals behind plan items that sit outside the scope's own deal read
  // (reassigned since) — read by id so an outcome never reads "no deal" for a
  // deal that exists.
  const dealIds = new Set(allDeals.map((d) => d.id));
  const missingDealIds = planItems.map((o) => o.deal_id).filter((id) => id && !dealIds.has(id));
  const extraDeals = missingDealIds.length
    ? await byIds('deals', 'id, title, stage, amount, final_amount, is_invoiced, invoice_date, owner_id, division_id, closed_at, stage_changed_at, created_at, expected_close_date, lost_reason, lost_reason_code', missingDealIds)
    : [];

  // ── the guarded contact_id read ──
  let contactIdColumn = true;
  const reportContact = new Map();
  if (contactReports.length) {
    for (const part of chunks(contactReports.map((r) => r.id))) {
      // eslint-disable-next-line no-await-in-loop
      const { data, error } = await supabase.from('contact_reports').select('id, contact_id').in('id', part);
      if (error) {
        contactIdColumn = false;
        if (!isMissingColumn(error)) console.warn('Sales Monitor: contact_reports.contact_id not read:', error.message);
        break;
      }
      (data || []).forEach((r) => { if (r.contact_id) reportContact.set(r.id, r.contact_id); });
    }
  }
  if (!contactIdColumn) {
    base.notes.push('Visits name their customer through the deal only: contact_reports.contact_id is not in the database yet (migrations/contact_reports_contact_id.sql).');
  }
  // Who audited a report, and when — for the read-only Visit sheet. The
  // audit writes these two columns (ContactReportsAudit) but no screen has
  // read them yet, so they are read apart from everything else: if either is
  // missing the sheet simply says "audited" without the who and when.
  const auditBy = new Map();
  const audited = contactReports.filter((r) => r.is_audited).map((r) => r.id);
  for (const part of chunks(audited)) {
    // eslint-disable-next-line no-await-in-loop
    const { data, error } = await supabase.from('contact_reports').select('id, audited_by, audited_at').in('id', part);
    if (error) { console.warn('Sales Monitor: audit details not read:', error.message); break; }
    (data || []).forEach((r) => auditBy.set(r.id, r));
  }
  // The audit note (session 40): contact_reports.audit_notes, read apart so
  // that, if the column is not there, only the note is missing.
  const auditNote = new Map();
  for (const part of chunks(audited)) {
    // eslint-disable-next-line no-await-in-loop
    const { data, error } = await supabase.from('contact_reports').select('id, audit_notes').in('id', part);
    if (error) { console.warn('Sales Monitor: audit notes not read:', error.message); break; }
    (data || []).forEach((r) => { if (r.audit_notes) auditNote.set(r.id, r.audit_notes); });
  }
  // VISIT PURPOSE AND COLLECTION (session 40): migrations/visit_purpose_collection.sql.
  // Read in their own request, like contact_id: while the columns are missing
  // every contact is Sales with nothing collected, and the pages show no
  // purpose at all (exactly as before the migration).
  let purposeColumns = true;
  const purposeOfRow = { reports: new Map(), activities: new Map() };
  for (const [table, rows, into] of [['contact_reports', contactReports, purposeOfRow.reports], ['activities', activities, purposeOfRow.activities]]) {
    for (const part of chunks(rows.map((r) => r.id))) {
      if (!purposeColumns) break;
      // eslint-disable-next-line no-await-in-loop
      const { data, error } = await supabase.from(table).select('id, visit_purpose, collected_amount').in('id', part);
      if (error) {
        purposeColumns = false;
        if (!isMissingColumn(error)) console.warn(`Sales Monitor: ${table} purpose not read:`, error.message);
        break;
      }
      (data || []).forEach((r) => into.set(r.id, r));
    }
  }
  if (!purposeColumns) {
    purposeOfRow.reports.clear();
    purposeOfRow.activities.clear();
  }
  const reports = contactReports.map((r) => ({
    ...r,
    contact_id: reportContact.get(r.id) || null,
    audited_by: auditBy.get(r.id)?.audited_by || null,
    audited_at: auditBy.get(r.id)?.audited_at || null,
    audit_notes: auditNote.get(r.id) || null,
    visit_purpose: purposeOfRow.reports.get(r.id)?.visit_purpose ?? null,
    collected_amount: purposeOfRow.reports.get(r.id)?.collected_amount ?? null,
  }));
  const activitiesWithPurpose = activities.map((a) => ({
    ...a,
    visit_purpose: purposeOfRow.activities.get(a.id)?.visit_purpose ?? null,
    collected_amount: purposeOfRow.activities.get(a.id)?.collected_amount ?? null,
  }));

  // ── customer names, for every contact any row points at ──
  const dealContact = new Map([...allDeals, ...extraDeals].map((d) => [d.id, d.contact_id]));
  const otherReportDealIds = reports.map((r) => r.deal_id).filter((id) => id && !dealContact.has(id));
  const otherActivityDealIds = activities.map((a) => a.deal_id).filter((id) => id && !dealContact.has(id));
  const lookupDeals = [...new Set([...otherReportDealIds, ...otherActivityDealIds])];
  const reportDeals = lookupDeals.length ? await byIds('deals', 'id, title, contact_id', lookupDeals) : [];
  const contactIds = [
    ...planItems.map((o) => o.contact_id),
    ...reports.map((r) => r.contact_id),
    ...activities.map((a) => a.contact_id),
    ...futurePushes.map((f) => f.contact_id),
    ...[...allDeals, ...extraDeals, ...reportDeals].map((d) => d.contact_id),
  ];
  const contacts = contactIds.some(Boolean)
    ? await byIds('contacts', 'id, company_name, first_name, last_name', contactIds)
    : [];

  // Who approves each person's plan — the approval queue's own rule — and the
  // names of approvers, who may sit outside the viewer's scope (session 36).
  let approvers = {};
  try { approvers = await resolveApproverMap(companyId, scopeIds); } catch (e) { console.warn('Sales Monitor: approvers not resolved:', e?.message || e); }
  const approverNames = Object.fromEntries(allUsers.map((u) => [u.id, u.full_name || u.email || 'Unknown']));

  // ── THE FUNNEL STAGE'S OWN READS (session 41) — all guarded ──
  //
  // deal_stage_history (migrations/add_deal_stage_history.sql, applied
  // 2026-10-05): one row per stage a deal entered, written by updateDeal and
  // createDeal. The rows entered from 7 days before the month to its end are
  // read, then EVERY row of those deals, so each move can be compared with the
  // stage before it. Rows are deleted with their deal (ON DELETE CASCADE), so a
  // lead the 3-day sweep removed leaves none.
  const scopeDealIds = new Set(allDeals.map((d) => d.id));
  let stageHistoryLoaded = true;
  const historyWindow = await fetchAllRows(() => supabase.from('deal_stage_history')
    .select('id, deal_id, stage, entered_at, exited_at', { count: 'exact' })
    .eq('company_id', companyId)
    .gte('entered_at', `${addDays(monthStart, -7)}T00:00:00+03:00`)
    .lte('entered_at', `${monthEnd}T23:59:59+03:00`));
  let stageHistory = [];
  if (historyWindow.error) {
    stageHistoryLoaded = false;
    console.warn('Sales Monitor: deal stage history not loaded:', historyWindow.error.message);
    base.notes.push('Deal stage history could not be read, so funnel movement is not shown.');
  } else {
    const moved = [...new Set((historyWindow.data || []).map((h) => h.deal_id).filter((id) => scopeDealIds.has(id)))];
    const every = await byColumn('deal_stage_history', 'id, deal_id, stage, entered_at, exited_at', 'deal_id', moved);
    if (every.error) {
      stageHistoryLoaded = false;
      console.warn('Sales Monitor: deal stage history not loaded:', every.error.message);
      base.notes.push('Deal stage history could not be read, so funnel movement is not shown.');
    } else stageHistory = every.data;
  }
  // Leads the 3-day sweep moved to Future Orders in the month: the sweep
  // (utils/leadExpiryCheck.js, moveLeadToFutureOrders) writes a future_orders
  // row with reason SLA_REASON, the deal it came from in source_deal_id and
  // the time in moved_at, and then deletes the deal. That row is how they are
  // found — the deal itself no longer exists.
  let autoMovedLoaded = true;
  const autoMovedRes = await fetchAllRows(() => supabase.from('future_orders')
    .select('id, owner_id, contact_id, customer_name, planned_amount, expected_month, status, opportunity_id, source_deal_id, moved_at, reason, division_id', { count: 'exact' })
    .eq('company_id', companyId)
    .in('owner_id', scopeIds)
    .eq('reason', SLA_REASON)
    .gte('moved_at', `${monthStart}T00:00:00+03:00`)
    .lte('moved_at', `${monthEnd}T23:59:59+03:00`));
  if (autoMovedRes.error) {
    autoMovedLoaded = false;
    console.warn('Sales Monitor: auto-moved leads not loaded:', autoMovedRes.error.message);
    base.notes.push('Leads moved to Future Orders by the 3-day rule could not be read.');
  }
  // converted_at of open Leads — the sweep's own clock falls back to it — read
  // apart, so a failure only loses that fallback.
  const leadConvertedAt = {};
  const leadIds = allDeals.filter((d) => d.stage === 'lead').map((d) => d.id);
  if (leadIds.length) {
    const conv = await byColumn('deals', 'id, converted_at', 'id', leadIds);
    if (conv.error) console.warn('Sales Monitor: deals.converted_at not read:', conv.error.message);
    (conv.data || []).forEach((d) => { if (d.converted_at) leadConvertedAt[d.id] = d.converted_at; });
  }

  const [additionalByUser, conversionBase] = await Promise.all([
    fetchAdditionalDivisions({ companyId, userIds: scopeIds }),
    fetchConversionBaseOrDeals({ companyId, divisionIds: divisions.map((d) => d.id) }),
  ]);

  return {
    ...base,
    additionalByUser,
    conversionBase,
    // What calcDivisionMetrics reads — Insights' shape exactly.
    deals: allDeals.filter((d) => d.stage !== 'lost'),
    targets,
    deals3m,
    opps: openOpps,
    futureOrders,
    returns: returnsRaw.map((r) => ({
      ...r, owner_id: r.deals?.owner_id ?? null, division_id: r.deals?.division_id ?? null,
    })),
    flags: [],
    escalations: [],
    // The Monitor's own.
    allDeals: [...allDeals, ...extraDeals],
    lookupDeals: reportDeals,
    planItems,
    bounceLogs,
    submissions: submissionsRes.error ? null : submissionsRes.data || [],
    futurePushes,
    contactReports: reports,
    activities: activitiesWithPurpose,
    purposeColumns,
    contacts,
    departedOpenPlan,
    contactIdColumn,
    approvers,
    approverNames,
    stageHistory,
    stageHistoryLoaded,
    autoMoved: autoMovedRes.error ? [] : autoMovedRes.data || [],
    autoMovedLoaded,
    leadConvertedAt,
  };
}
