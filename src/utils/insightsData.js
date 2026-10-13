import { supabase } from 'lib/supabase';
import { nextMonthBounds } from 'utils/planningCalculations';
import { scopeUserIds } from 'utils/salesDivisionMetrics';
import { fetchAdditionalDivisions } from 'utils/divisionMembership';

/**
 * EVERYTHING INSIGHTS READS, FOR ONE VIEWER AND ONE PERIOD — in one place.
 *
 * Moved verbatim out of pages/sales-divisions (session 21) so the AI
 * assistant's figures come from the very reads Insights makes: the same scope
 * (scopeUserIds), the same filters, the same rows. Anything that shows "your
 * Insights figures" calls this rather than re-reading the tables its own way.
 *
 * Throws on a failed core read, as the page always did; the page catches it.
 *
 * @returns {{ raw: object, divisionsNote: string }}
 */
export async function fetchInsightsRaw({
  companyId, userId, role, rangeStart, rangeEnd, isCurrentMonth, isAllTime,
}) {
  const now = new Date();
  // The SELECTED period, shared with Planning, the dashboards and the
  // Coverage Console. This page used to hard-wire monthBounds(now).
  const monthStart = rangeStart;
  const monthEnd = rangeEnd;
  let divisionsNote = "";
  // Carry-in stays relative to TODAY: it is a live forward-looking figure,
  // and it is hidden outside the current month anyway.
  const nextMonth = nextMonthBounds(now);

  // ── PHASE 1: WHO AM I ALLOWED TO SEE? ────────────────────────────────
  //
  // This page used to read every company row and narrow in the browser.
  // For a director that was merely wasteful; for a SALESMAN it would mean
  // his browser holding every colleague's deals and plan items, which is
  // not acceptable however carefully the UI hides them (CEO decision
  // 2026-10-07). So the scope is resolved FIRST and every read below is
  // filtered by it in the database.
  //
  // RLS is the real boundary and these filters are not a substitute for it
  // — see migrations/insights_rls.sql, which closes the three tables a
  // salesman can currently read company-wide (opportunities, future_orders,
  // salesman_flags). These filters make the page correct BEFORE that file is
  // applied and keep it correct after.
  const [usersRes, divisionsRes] = await Promise.all([
      supabase
        .from("users")
        // EVERY user: the company total has to include people who have
        // left (CEO decision 2026-10-07) or this panel contradicts the KPI
        // strip above it, and the divisions stop summing to the company.
        // is_active travels with the rows, and listedMembers / scopeUserIds
        // apply the active-only half of the rule to the PEOPLE LISTS.
        .select("id, full_name, role, supervisor_id, is_active, sales_division_id, is_contributor")
        .eq("company_id", companyId),
      supabase
        .from("sales_divisions")
        .select("id, name, sort_order")
        .eq("company_id", companyId)
        .order("sort_order", { ascending: true }),
  ]);
  if (usersRes.error) throw usersRes.error;

  // The scope, from the one shared rule: director = the company,
  // manager/supervisor = his subtree, salesman = himself.
  const allUsers = usersRes.data || [];
  const scopeIds = scopeUserIds({ users: allUsers, viewerId: userId, role });
  if (!scopeIds.length) {
    // A role with no scope (a viewer) gets an empty page, not everybody's.
    return { divisionsNote, raw: {
      users: [], divisions: divisionsRes.data || [], deals: [], targets: [],
      deals3m: [], opps: [], futureOrders: [], flags: [], escalations: [],
      returns: [], monthStart, monthEnd, now, additionalByUser: {},
      companyRate: null, scopeIds: [],
    } };
  }
  // Only the people in scope travel to the browser at all. For a director
  // that is everyone, as before; for a salesman it is one row, which is the
  // simplest guarantee that no colleague's name can reach the DOM.
  const scopedUsers = allUsers.filter((u) => scopeIds.includes(u.id));

  // ESCALATIONS are manager/director only (CEO decision 2026-10-07), so a
  // supervisor or salesman does not even ask for them.
  const seesEscalations = role === "manager" || role === "director";

  // ── PHASE 2: the figures, every one filtered to the scope ────────────
  const [dealsRes, targetsRes, deals3mRes, oppsRes, futureRes, flagsRes, escalationsRes, returnsRes] =
    await Promise.all([
      supabase
        .from("deals")
        .select(
          "id, title, stage, amount, final_amount, is_invoiced, invoice_date, owner_id, division_id, forecast_amount, expected_close_date, stage_changed_at, created_at, contacts!contact_id(first_name, last_name, company_name)"
        )
        .eq("company_id", companyId)
        .in("owner_id", scopeIds)
        .not("stage", "eq", "lost"),
      // division_id, or every target row falls back to its assignee's PRIMARY
      // division and Kamal's 1,550,000 total_value row lands on Export
      // instead of PVC Compound. The divisions would still SUM to the
      // company — misattribution moves a figure between two divisions
      // without changing the total — which is exactly why the
      // "Divisions sum = company" check cannot catch this and the split has
      // to be read against PREVIEW 1 of the migration.
      supabase
        .from("sales_targets")
        .select(
          "assigned_to, target_amount, period_type, target_type, period_start, period_end, product_group, division_id, client_targets(target_amount)"
        )
        .eq("company_id", companyId)
        .eq("status", "active")
        .eq("period_type", "monthly")
        .in("assigned_to", scopeIds)
        .lte("period_start", monthEnd)
        .gte("period_end", monthStart),
      // The 3-month conversion window. invoice_number and closed_at are read
      // so winRateFromDeals can drop IMPORTED history (utils/importedDeals.js):
      // loaded-in invoices can only be "won", so without them every division's
      // rate reads high and its Required Plan reads low.
      //
      // is_imported is deliberately NOT selected: this read is one leg of a
      // Promise.all with no room to retry, and asking for a column that does
      // not exist yet would 400 the whole page. invoice_number carries the
      // rule until migrations/add_deals_is_imported.sql is applied; add
      // is_imported to this select afterwards.
      supabase
        .from("deals")
        .select("id, stage, owner_id, division_id, created_at, closed_at, invoice_number")
        .eq("company_id", companyId)
        .in("owner_id", scopeIds)
        .gte("created_at", new Date(now.getFullYear(), now.getMonth() - 3, 1).toISOString())
        .lte("created_at", new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59).toISOString()),
      // division_id: Kamal's 15 PVC Compound plan items would otherwise be
      // counted in Export, his primary — the double count this session
      // exists to remove, reappearing one table at a time.
      supabase
        .from("opportunities")
        .select("id, owner_id, planned_amount, division_id")
        .eq("company_id", companyId)
        .in("owner_id", scopeIds)
        .eq("status", "open")
        .gte("expected_month", monthStart)
        .lte("expected_month", monthEnd),
      // Carry-in: next month's committed orders (same window as Planning).
      supabase
        .from("future_orders")
        .select("id, owner_id, planned_amount, division_id")
        .eq("company_id", companyId)
        .in("owner_id", scopeIds)
        .eq("status", "pending")
        .gte("expected_month", nextMonth.startDate)
        .lte("expected_month", nextMonth.endDate),
      // Exceptions — the Coverage Console's two sources.
      supabase
        // A salesman and a supervisor see flags on their own / their team's
        // deals only. The filter is the scope, so it needs no role branch.
        .from("salesman_flags")
        .select("id, owner_id, flag_type, flagged_at, details, reviewed")
        .eq("company_id", companyId)
        .in("owner_id", scopeIds)
        .eq("reviewed", false),
      // Not fetched at all for a supervisor or a salesman. Promise.all needs
      // a value in the slot, so an already-resolved empty result stands in
      // rather than a query nobody is allowed to run.
      seesEscalations
        ? supabase
          .from("escalation_logs")
          .select("id, trigger_type, triggered_for, triggered_by, deal_id, details, resolved, created_at")
          .eq("company_id", companyId)
          .eq("resolved", false)
        : Promise.resolve({ data: [], error: null }),
      // Sales returns in the window, joined to their deal for the owner.
      // Subtracted from Achieved by the shared rule (planningCalculations).
      supabase
        .from("deal_returns")
        .select("id, deal_id, return_date, return_amount, deals!inner(owner_id, division_id)")
        .eq("company_id", companyId)
        // Filtered on the EMBEDDED deal, which is where the owner is. The
        // !inner join makes this a real restriction rather than a filter
        // that leaves unmatched rows behind.
        .in("deals.owner_id", scopeIds)
        .gte("return_date", monthStart)
        .lte("return_date", monthEnd),
    ]);

  const failed = [usersRes, dealsRes, targetsRes, deals3mRes, oppsRes, futureRes].find((r) => r.error);
  if (failed) throw failed.error;
  if (divisionsRes.error) {
    divisionsNote = "Sales divisions could not be loaded, so everyone is shown under Unassigned.";
  }
  // Exceptions never block the page (the Coverage Console treats them the same way).
  if (flagsRes.error) console.warn("Sales Divisions: salesman_flags not loaded:", flagsRes.error.message);
  if (escalationsRes.error) console.warn("Sales Divisions: escalation_logs not loaded:", escalationsRes.error.message);

  if (returnsRes.error) console.warn("Sales Divisions: deal_returns not loaded:", returnsRes.error.message);
  // Additional divisions per user. Failure degrades to primary-only,
  // which is the pre-multi-division behaviour rather than a blank screen.
  // Narrowed to the scope: a salesman has no business reading the whole
  // company's division membership either.
  const additionalByUser = await fetchAdditionalDivisions({
    companyId: companyId, userIds: scopeIds,
  });

  // THE BENCHMARK. A supervisor's or a salesman's own conversion rate means
  // little without something to read it against, and the CEO asked for the
  // company RATE beside it — never company amounts. The rate needs
  // company-wide deals that these two roles must not read, so it comes from
  // a SECURITY DEFINER function that returns the rate and its counts and
  // nothing else.
  //
  // DEGRADES TO HIDDEN, never to an error: the function arrives with
  // migrations/insights_rls.sql, which is NOT APPLIED. Until it is, this
  // resolves to null and the benchmark is simply absent. (The lesson of
  // 1897c1a: nothing merged may require something production does not have.)
  let companyRate = null;
  try {
    const { data: rateRows, error: rateErr } = await supabase
      .rpc("company_conversion_3m", { p_company_id: companyId });
    if (!rateErr) {
      const r = Array.isArray(rateRows) ? rateRows[0] : rateRows;
      if (r && Number.isFinite(Number(r.win_rate_pct))) {
        companyRate = {
          winRatePct: Number(r.win_rate_pct),
          won: Number(r.won) || 0,
          total: Number(r.total) || 0,
          importedExcluded: Number(r.imported_excluded) || 0,
        };
      }
    }
  } catch (e) {
    // Nothing to report to the user: a missing benchmark is not an error
    // on their part, and the page is fully usable without it.
    console.warn("Insights: company benchmark rate unavailable:", e?.message);
  }

  return { divisionsNote, raw: {
    users: scopedUsers,
    scopeIds,
    companyRate,
    additionalByUser,
    divisions: divisionsRes.error ? [] : divisionsRes.data || [],
    deals: dealsRes.data || [],
    targets: targetsRes.data || [],
    deals3m: deals3mRes.data || [],
    opps: oppsRes.data || [],
    futureOrders: futureRes.data || [],
    returns: returnsRes.error
      ? []
      : (returnsRes.data || []).map((r) => ({
        ...r,
        owner_id: r.deals?.owner_id ?? null,
        division_id: r.deals?.division_id ?? null,
      })),
    flags: flagsRes.error ? [] : flagsRes.data || [],
    escalations: escalationsRes.error ? [] : escalationsRes.data || [],
    monthStart,
    monthEnd,
    now,
    isCurrentMonth,
    isAllTime,
  } };
}
