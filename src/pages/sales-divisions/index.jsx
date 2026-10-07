import React, { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "lib/supabase";
import { useAuth } from "contexts/AuthContext";
import Header from "components/ui/Header";
import { monthBounds, nextMonthBounds } from "utils/planningCalculations";
import QuickDateSelector from "components/QuickDateSelector";
import { useDateRange } from "contexts/DateRangeContext";
import {
  periodLabelFromRange,
  isCurrentMonthRange,
  isAllTimeRange,
} from "utils/dashboardDateUtils";
import {
  EXPECTED_PCT_LABEL,
  EXPECTED_PCT_TOOLTIP,
  conversionLabel,
  borrowedNote,
  UNASSIGNED,
  scopeUserIds,
  groupByDivision,
  listedMembers,
  divisionView,
  teamRows,
  calcDivisionMetrics,
  buildExceptions,
  healthOf,
} from "utils/salesDivisionMetrics";
import { fetchAdditionalDivisions } from "utils/divisionMembership";
import { DivisionCoverageHero, DivisionCycleLedger } from "./components/DivisionCoverageHero";
import DivisionExceptionFeed from "./components/DivisionExceptionFeed";

// Insights (route /insights; folder and component keep the sales-divisions name)
// — Company → Division → Team → Member → Deal.
//
// A separate page from the Coverage Console: its presentation (hero, coverage
// equation, coverage + pacing rails, cycle ledger, exception feed) is COPIED
// into ./components, never imported, and every number comes from
// utils/salesDivisionMetrics.js -> utils/planningCalculations.js.
//
//   Company   hero + ledger for the whole scope, the divisions, exception feed
//   Division  hero + ledger for the division, the supervisor card, exception feed
//   Team      hero + ledger for the team, the team table, exception feed
//   Member    hero + ledger for that person, their open deals
//   Deal      the deal record
// A division with no supervisor opens straight to its team list, or to an empty
// state when nobody is in it.

const INIT_NAV = { level: "company", division: null, supervisor: null, member: null, deal: null };

const SAR = (n) => Math.abs(Math.round(n || 0)).toLocaleString("en-US");

const compact = (n) => {
  const a = Math.abs(Math.round(n || 0));
  if (a >= 1e6) return (a / 1e6).toFixed(2) + "M";
  if (a >= 1e3) return (a / 1e3).toFixed(0) + "K";
  return String(a);
};

const pct = (n, d = 1) => (Number(n) || 0).toFixed(d) + "%";

const stageLabel = (s) => String(s || "").replace(/_/g, " ");

const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";

const dealName = (d) =>
  d?.contacts?.company_name ||
  `${d?.contacts?.first_name || ""} ${d?.contacts?.last_name || ""}`.trim() ||
  d?.title ||
  "Deal";

const HEALTH = {
  ok: { text: "Healthy", cls: "bg-emerald-50 text-emerald-800 border-emerald-200" },
  risk: { text: "At risk", cls: "bg-amber-50 text-amber-800 border-amber-200" },
  bad: { text: "Off plan", cls: "bg-red-50 text-red-800 border-red-200" },
  none: { text: "No target", cls: "bg-gray-50 text-gray-500 border-gray-200" },
};

// "Conversion (3m)", not "Win rate": the figure is won over deals CREATED in
// the 3 completed months, which is what Required Plan divides by. "Win rate"
// means won / (won + lost) everywhere else, and the two are different numbers.
//
// The coverage column's name and formula come from utils/salesDivisionMetrics,
// where covRatio is computed, so this screen and the Coverage Console cannot
// call one number two things again.
//
// Planning's "Planning Coverage" keeps its own name: it is the RAW plan plus
// funnel, unweighted — a different measure that was also called Coverage.
const COLUMNS = ["Name", "Target", "Achieved", "Gap to target", "Conversion (3m)", "New pipeline needed", EXPECTED_PCT_LABEL, "Status"];

// ── FROZEN FIRST COLUMN ────────────────────────────────────────────────────
//
// The name column stays put while the figures scroll sideways, on desktop and
// on a phone. position: sticky with left: 0 inside the overflow-x-auto wrapper
// is all it takes — but ONLY with an opaque background, or the cells scrolling
// underneath show straight through it.
//
// The background is set on the CELL and the hover state is driven by
// `group-hover` from the row, rather than `bg-inherit`: a <tr> has no
// background of its own by default, so inheriting gives a transparent cell and
// the bug this exists to prevent. Every row state a sticky cell can be in needs
// its own opaque colour here — plain, hovered, and the pinned-supervisor tint.
const STICKY_CELL = 'sticky left-0 z-10';
// A right edge so a scrolled figure cannot appear to belong to the name.
const STICKY_EDGE = 'border-r border-gray-200 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.10)]';
const stickyBody = (pinned) => `${STICKY_CELL} ${STICKY_EDGE} ${
  pinned ? 'bg-indigo-50 group-hover:bg-indigo-100' : 'bg-white group-hover:bg-gray-50'
}`;
// z-20, above the body cells, so the header corner wins where they cross.
const STICKY_HEAD = `sticky left-0 z-20 bg-gray-50 ${STICKY_EDGE}`;

// ── HEADERS THAT WRAP ──────────────────────────────────────────────────────
// "New pipeline needed" and "Expected % of target" are wider than any figure
// beneath them, and on one line they stretched their columns and pushed the
// table sideways for no reason. They wrap onto a second line instead, inside a
// width that fits two words — the row height grows once, for the whole header,
// and the columns stay as narrow as their numbers.
const HEAD_WRAP = 'whitespace-normal break-words max-w-[7.5rem] align-bottom';
// Figures stay on ONE line and right-aligned, which is what makes a column of
// them scannable; wrapping a number is never useful.
const NUM_CELL = 'px-4 py-3 font-mono text-right whitespace-nowrap';
// The first column is a name, so it keeps its left alignment.
const HEAD_NUM = 'text-right';

function StatusChip({ m }) {
  const h = HEALTH[healthOf(m)];
  return (
    <span className={`text-[10px] font-semibold px-2 py-1 rounded-full border whitespace-nowrap ${h.cls}`}>{h.text}</span>
  );
}

function CoverageCell({ m }) {
  if (!(m.target > 0)) return <span className="font-mono text-gray-400">—</span>;
  const ok = m.covRatio >= 1;
  return (
    <div className="flex items-center gap-2">
      <div className="w-14 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full"
          style={{ width: `${Math.min(m.covRatio * 100, 100).toFixed(0)}%`, background: ok ? "#064e3b" : "#ef4444" }}
        />
      </div>
      <span className={`font-mono font-semibold ${ok ? "text-emerald-700" : "text-red-600"}`}>
        {(m.covRatio * 100).toFixed(0)}%
      </span>
    </div>
  );
}

function Panel({ title, hint, children }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden self-start">
      <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-gray-800">{title}</h3>
        {hint && <span className="text-xs text-gray-400 whitespace-nowrap">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function FigureTable({ rows, empty }) {
  if (!rows.length) return <div className="py-12 text-center text-sm text-gray-400">{empty}</div>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-gray-50">
            {COLUMNS.map((h, i) => (
              <th
                key={h}
                /* The formula on hover: the column is a ratio of four things
                   and the name alone cannot say which four. */
                title={h === EXPECTED_PCT_LABEL ? EXPECTED_PCT_TOOLTIP : undefined}
                className={[
                  'px-4 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wide border-b border-gray-100',
                  // Name column: frozen, left-aligned, never wrapped.
                  i === 0 ? `text-left whitespace-nowrap ${STICKY_HEAD}` : `${HEAD_NUM} ${HEAD_WRAP}`,
                  h === EXPECTED_PCT_LABEL ? 'cursor-help underline decoration-dotted' : '',
                ].filter(Boolean).join(' ')}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {rows.map((row) => (
            <tr
              key={row.id}
              onClick={row.onClick}
              /* `group` so the frozen cell can follow the row's hover state. */
              className={`group cursor-pointer hover:bg-gray-50 transition-colors ${row.pinned ? "bg-indigo-50/40" : ""}`}
            >
              <td className={`px-4 py-3 ${stickyBody(row.pinned)}`}>
                <div className="font-medium text-gray-900 whitespace-nowrap flex items-center gap-2">
                  {row.name}
                  {row.pinned && (
                    <span className="text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700">
                      Supervisor
                    </span>
                  )}
                </div>
                <div className="text-[10px] text-gray-400 font-mono mt-0.5 capitalize whitespace-nowrap">{row.sub}</div>
              </td>
              <td className={`${NUM_CELL} text-gray-600`}>{compact(row.m.target)}</td>
              <td className={`${NUM_CELL} font-semibold text-emerald-700`}>{compact(row.m.achieved)}</td>
              <td className={`${NUM_CELL} text-red-600`}>{compact(row.m.deficit)}</td>
              {/* A borrowed rate is marked in the table too. The cell has no
                  room for "company rate (n=6)", so it carries it on hover —
                  without it, a column of percentages gives no clue that two of
                  them are the same company figure. */}
              <td
                className={`${NUM_CELL} text-gray-600${row.m.winRateBorrowed ? " cursor-help underline decoration-dotted" : ""}`}
                title={row.m.winRateBorrowed ? borrowedNote(row.m) : undefined}
              >
                {pct(row.m.winRatePct)}
              </td>
              <td className={`${NUM_CELL} text-blue-700`}>{compact(row.m.plannedGap)}</td>
              {/* A bar and a chip, not figures — they keep their own layout and
                  are simply pushed to the right edge like the numbers. */}
              <td className="px-4 py-3"><div className="flex justify-end"><CoverageCell m={row.m} /></div></td>
              <td className="px-4 py-3 text-right"><StatusChip m={row.m} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Figures({ m, small = false }) {
  const items = [
    ["Target", `${compact(m.target)} SAR`, "text-gray-900"],
    ["Achieved", `${compact(m.achieved)} SAR`, "text-emerald-700"],
    ["Gap to target", `${compact(m.deficit)} SAR`, "text-red-600"],
    // Says so when it is not this division's own rate, and how thin the
    // division's own sample was — presenting a borrowed number as the
    // division's own is how somebody ends up planning against a conversion
    // nobody in that division achieved.
    [conversionLabel(m), pct(m.winRatePct), "text-gray-900"],
    ["New pipeline needed", `${compact(m.plannedGap)} SAR`, "text-blue-700"],
  ];
  return (
    <div className={`grid grid-cols-2 sm:grid-cols-5 ${small ? "gap-2" : "gap-3"}`}>
      {items.map(([k, v, cls]) => (
        <div key={k} className={small ? "" : "bg-gray-50 rounded-xl px-3 py-2.5"}>
          <div className="text-[10px] text-gray-400 uppercase tracking-widest font-mono">{k}</div>
          <div className={`font-bold font-mono ${small ? "text-xs mt-0.5" : "text-sm mt-1"} ${cls}`}>{v}</div>
        </div>
      ))}
    </div>
  );
}

export default function SalesDivisions() {
  const { user, company, userProfile } = useAuth();
  const role = userProfile?.role;

  const [nav, setNav] = useState(INIT_NAV);
  // Selected period, shared with Planning, the dashboards and the Console.
  const { dateRange, setRange } = useDateRange();
  const defMonth = monthBounds(new Date());
  const rangeStart = dateRange?.from || defMonth.startDate;
  const rangeEnd = dateRange?.to || defMonth.endDate;
  const periodLabel = periodLabelFromRange(rangeStart, rangeEnd);
  const isCurrentMonth = isCurrentMonthRange(rangeStart, rangeEnd);
  const isAllTime = isAllTimeRange(rangeStart, rangeEnd);

  const [raw, setRaw] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [divisionsNote, setDivisionsNote] = useState("");

  // Drilling changes state, not the route, so scroll back up by hand.
  const go = (next) => {
    setNav(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // ── DATA ── one fetch, every level computed in memory.
  const fetchAll = useCallback(async () => {
    if (!company?.id) return;
    setLoading(true);
    setError("");
    setDivisionsNote("");
    try {
      const now = new Date();
      // The SELECTED period, shared with Planning, the dashboards and the
      // Coverage Console. This page used to hard-wire monthBounds(now).
      const monthStart = rangeStart;
      const monthEnd = rangeEnd;
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
            .eq("company_id", company.id),
          supabase
            .from("sales_divisions")
            .select("id, name, sort_order")
            .eq("company_id", company.id)
            .order("sort_order", { ascending: true }),
      ]);
      if (usersRes.error) throw usersRes.error;

      // The scope, from the one shared rule: director = the company,
      // manager/supervisor = his subtree, salesman = himself.
      const allUsers = usersRes.data || [];
      const scopeIds = scopeUserIds({ users: allUsers, viewerId: user?.id, role });
      if (!scopeIds.length) {
        // A role with no scope (a viewer) gets an empty page, not everybody's.
        setRaw({
          users: [], divisions: divisionsRes.data || [], deals: [], targets: [],
          deals3m: [], opps: [], futureOrders: [], flags: [], escalations: [],
          returns: [], monthStart, monthEnd, now, additionalByUser: {},
          companyRate: null, scopeIds: [],
        });
        setLoading(false);
        return;
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
            .eq("company_id", company.id)
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
            .eq("company_id", company.id)
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
            .eq("company_id", company.id)
            .in("owner_id", scopeIds)
            .gte("created_at", new Date(now.getFullYear(), now.getMonth() - 3, 1).toISOString())
            .lte("created_at", new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59).toISOString()),
          // division_id: Kamal's 15 PVC Compound plan items would otherwise be
          // counted in Export, his primary — the double count this session
          // exists to remove, reappearing one table at a time.
          supabase
            .from("opportunities")
            .select("id, owner_id, planned_amount, division_id")
            .eq("company_id", company.id)
            .in("owner_id", scopeIds)
            .eq("status", "open")
            .gte("expected_month", monthStart)
            .lte("expected_month", monthEnd),
          // Carry-in: next month's committed orders (same window as Planning).
          supabase
            .from("future_orders")
            .select("id, owner_id, planned_amount, division_id")
            .eq("company_id", company.id)
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
            .eq("company_id", company.id)
            .in("owner_id", scopeIds)
            .eq("reviewed", false),
          // Not fetched at all for a supervisor or a salesman. Promise.all needs
          // a value in the slot, so an already-resolved empty result stands in
          // rather than a query nobody is allowed to run.
          seesEscalations
            ? supabase
              .from("escalation_logs")
              .select("id, trigger_type, triggered_for, triggered_by, deal_id, details, resolved, created_at")
              .eq("company_id", company.id)
              .eq("resolved", false)
            : Promise.resolve({ data: [], error: null }),
          // Sales returns in the window, joined to their deal for the owner.
          // Subtracted from Achieved by the shared rule (planningCalculations).
          supabase
            .from("deal_returns")
            .select("id, deal_id, return_date, return_amount, deals!inner(owner_id, division_id)")
            .eq("company_id", company.id)
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
        setDivisionsNote("Sales divisions could not be loaded, so everyone is shown under Unassigned.");
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
        companyId: company.id, userIds: scopeIds,
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
          .rpc("company_conversion_3m", { p_company_id: company.id });
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

      setRaw({
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
      });
    } catch (e) {
      console.error("Sales Divisions load failed:", e);
      setError(e?.message || "Failed to load sales divisions");
    } finally {
      setLoading(false);
    }
  }, [company?.id, rangeStart, rangeEnd, isCurrentMonth, isAllTime, user?.id, role]);

  useEffect(() => {
    if (!company?.id) return;
    fetchAll();
  }, [company?.id, fetchAll]);

  const scopeIds = useMemo(
    () => (raw ? scopeUserIds({ users: raw.users, viewerId: user?.id, role }) : []),
    [raw, user?.id, role]
  );

  // The panel collapses to the divisions the viewer's SCOPE TOUCHES (CEO
  // decision 2026-10-07). A salesman in PVC Sheet gets one division, not four
  // empty ones with his row in a corner of the last; a supervisor gets the
  // divisions his team actually sells in.
  //
  // For a director this removes only divisions with nobody in them at all,
  // which carry no target, no revenue and no funnel — a row of dashes. The
  // "divisions sum = company" invariant is unaffected: dropping an all-zero
  // group cannot change a total.
  const groups = useMemo(
    () => {
      if (!raw) return [];
      const all = groupByDivision({
        users: raw.users, divisions: raw.divisions, scopeIds,
        additionalByUser: raw.additionalByUser || {},
      });
      const touched = all.filter((g) => (g.userIds || []).length > 0);
      // Never return nothing: somebody with a scope but no division membership
      // at all still needs a page, and that is what Unassigned is for.
      return touched.length ? touched : all;
    },
    [raw, scopeIds]
  );

  // ── GUARDS ──
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header />
        <div className="flex items-center justify-center h-[60vh]">
          <div className="text-center">
            <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-sm text-gray-500">Loading sales divisions...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header />
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-16 text-center">
          <p className="text-sm font-semibold text-red-700 mb-2">Insights could not load</p>
          <p className="text-xs text-gray-500 font-mono mb-5">{error}</p>
          <button onClick={fetchAll} className="text-xs border border-gray-300 rounded-lg px-4 py-2 hover:bg-white">
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!raw) return null;

  // ── CURRENT LEVEL ──
  const userById = new Map(raw.users.map((u) => [u.id, u]));
  const userName = (id) => userById.get(id)?.full_name || "Unknown";
  // divisionId scopes the DEALS to this division; omitted at company level so
  // the top-level view still counts everything exactly as before.
  const metricsFor = (ids, divisionId = null) => calcDivisionMetrics(ids, { ...raw, divisionId });

  const currentGroup = nav.division ? groups.find((g) => g.id === nav.division) : null;
  const view = currentGroup ? divisionView({ group: currentGroup, users: raw.users }) : null;
  const currentCard = view && nav.supervisor ? view.supervisors.find((c) => c.user.id === nav.supervisor) : null;
  const teamIds = currentCard ? currentCard.teamIds : currentGroup?.userIds || [];
  const currentMember = nav.member ? userById.get(nav.member) : null;
  const currentDeal = nav.deal ? raw.deals.find((d) => d.id === nav.deal) : null;

  const openDivision = (group) => {
    const v = divisionView({ group, users: raw.users });
    go({ level: v.mode === "team" ? "team" : "division", division: group.id, supervisor: null, member: null, deal: null });
  };

  const levelIds =
    nav.level === "company"
      ? scopeIds
      : nav.level === "division"
      ? currentGroup?.userIds || []
      : nav.level === "team"
      ? teamIds
      : nav.member
      ? [nav.member]
      : [];
  // Below company level every figure belongs to the division being viewed, so
  // the deals are scoped to it. At company level nothing is scoped and the
  // totals are the same ones the page showed before multi-division.
  const navDivisionId = nav.level === "company" ? null : nav.division || null;
  const metrics = metricsFor(levelIds, navDivisionId);
  const showExceptions = ["company", "division", "team"].includes(nav.level);
  const exceptions = showExceptions ? buildExceptions(levelIds, raw) : [];

  // Exception click: open that person's deal, inside their own division.
  const jumpToException = (ex) => {
    const g = groups.find((x) => x.userIds.includes(ex.ownerId));
    const hasDeal = ex.dealId && raw.deals.some((d) => d.id === ex.dealId);
    go({
      level: hasDeal ? "deal" : "member",
      division: g?.id || null,
      supervisor: null,
      member: ex.ownerId,
      deal: hasDeal ? ex.dealId : null,
    });
  };

  const scopeLabel = {
    director: "Director view · whole company",
    manager: "Manager view · your team",
    supervisor: "Supervisor view · you and your team",
    // Said out loud, because a page that normally shows a company and now shows
    // one person should explain which it is rather than look broken.
    salesman: "Your figures only",
  }[role] || "Your figures only";

  const hero = (() => {
    const winRate = `${pct(metrics.winRatePct, 0)} win rate`;
    if (nav.level === "company") {
      // Counted off the COLLAPSED groups, and the Unassigned group only counts
      // when it has somebody in it — "4 divisions" on a page showing one was
      // the old count of the company's divisions rather than of this page's.
      const divisionCount = groups.filter((g) => g.id !== UNASSIGNED).length;
      const people = listedMembers({ users: raw.users, userIds: scopeIds }).length;
      return {
        title: role === "salesman"
          // His own page, so his own name — the company name over one person's
          // figures reads like a company total, which is the one thing it is not.
          ? (raw.users[0]?.full_name || "Your figures")
          : company?.name || "All Divisions",
        sub: role === "salesman"
          ? `your figures · ${winRate}`
          : `${divisionCount} division${divisionCount === 1 ? "" : "s"}`
            + ` · ${people} team member${people === 1 ? "" : "s"} · ${winRate}`,
      };
    }
    if (nav.level === "division")
      return {
        title: currentGroup?.name || "Division",
        sub:
          view?.mode === "empty"
            ? "No supervisor assigned"
            : `Division total · ${view?.members.length || 0} team members · ${winRate}`,
      };
    if (nav.level === "team")
      return {
        title: currentCard ? `${currentCard.user.full_name}'s team` : currentGroup?.name || "Team",
        sub: `Team total · ${teamRows({ users: raw.users, teamIds, supervisorId: nav.supervisor }).length} people · ${winRate}`,
      };
    return {
      title: userName(nav.member),
      sub: `${currentMember?.role || ""} · ${currentGroup?.name || ""} · ${winRate}`,
    };
  })();

  // Breadcrumb. The division crumb returns to wherever that division opens.
  const divisionLevel = view?.mode === "team" ? "team" : "division";
  const crumbs = [
    { key: "company", label: "All Divisions", to: INIT_NAV },
    currentGroup
      ? {
          key: "division",
          label: currentGroup.name,
          to: { level: divisionLevel, division: currentGroup.id, supervisor: null, member: null, deal: null },
        }
      : null,
    currentCard
      ? {
          key: "team",
          label: `${currentCard.user.full_name}'s team`,
          to: { level: "team", division: currentGroup.id, supervisor: currentCard.user.id, member: null, deal: null },
        }
      : null,
    currentMember ? { key: "member", label: currentMember.full_name, to: { ...nav, level: "member", deal: null } } : null,
    currentDeal ? { key: "deal", label: dealName(currentDeal), to: nav } : null,
  ].filter(Boolean);

  // ── ROWS ──
  const companyRows =
    nav.level === "company"
      ? groups.map((g) => ({
          id: g.id,
          name: g.name,
          sub: `${listedMembers({ users: raw.users, userIds: g.userIds }).length} members${
            g.id === UNASSIGNED ? " · no division set" : ""
          }`,
          m: metricsFor(g.userIds, g.id),
          onClick: () => openDivision(g),
        }))
      : [];

  const teamList =
    nav.level === "team"
      ? teamRows({ users: raw.users, teamIds, supervisorId: nav.supervisor }).map((u) => ({
          id: u.id,
          name: u.full_name,
          sub: `${u.role}${u.role === "manager" ? " · not counted in figures" : ""}`,
          pinned: u.id === nav.supervisor,
          m: metricsFor([u.id], navDivisionId),
          onClick: () => go({ ...nav, level: "member", member: u.id, deal: null }),
        }))
      : [];

  const dealRows =
    nav.level === "member" || nav.level === "deal"
      ? raw.deals
          .filter((d) => d.owner_id === nav.member && !["won", "lost"].includes(d.stage))
          .sort((a, b) => (b.amount || 0) - (a.amount || 0))
      : [];

  // ── MAIN PANEL per level ──
  const mainPanel = (() => {
    if (nav.level === "company") {
      return (
        <Panel title="Sales divisions" hint="Click to drill down ▸">
          <FigureTable rows={companyRows} empty="No divisions" />
        </Panel>
      );
    }

    if (nav.level === "division" && view) {
      if (view.mode === "empty") {
        return (
          <div className="bg-white rounded-2xl border border-dashed border-gray-300 py-12 text-center self-start">
            <p className="text-sm font-semibold text-gray-700">No supervisor assigned</p>
            <p className="text-xs text-gray-400 mt-1">No team members assigned to this division yet</p>
          </div>
        );
      }
      return (
        <div className="space-y-4 self-start">
          {view.supervisors.map((card) => {
            const team = metricsFor(card.teamIds, navDivisionId);
            const own = metricsFor([card.user.id], navDivisionId);
            const others = teamRows({ users: raw.users, teamIds: card.teamIds, supervisorId: card.user.id }).length - 1;
            return (
              <button
                key={card.user.id}
                onClick={() => go({ ...nav, level: "team", supervisor: card.user.id, member: null, deal: null })}
                className="w-full text-left bg-white rounded-2xl border border-gray-200 p-5 hover:border-indigo-300 hover:shadow-sm transition-all"
              >
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div className="min-w-0">
                    <p className="text-[10px] font-mono text-indigo-600 uppercase tracking-widest mb-1">Supervisor</p>
                    <h3 className="text-lg font-bold text-gray-900 truncate">{card.user.full_name}</h3>
                    <p className="text-xs text-gray-500 font-mono">
                      Team of {others + 1} · {others} {others === 1 ? "person" : "people"} under them
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <StatusChip m={team} />
                    <span className="text-xs text-gray-400 hidden sm:inline">View team &#9656;</span>
                  </div>
                </div>
                <p className="text-[10px] font-mono text-gray-400 uppercase tracking-widest mb-2">Team total</p>
                <Figures m={team} />
                <div className="mt-4 pt-3 border-t border-gray-100">
                  <p className="text-[10px] font-mono text-gray-400 uppercase tracking-widest mb-2">
                    {card.user.full_name}'s own figures
                  </p>
                  <Figures m={own} small />
                </div>
              </button>
            );
          })}
          {view.unattached.length > 0 && (
            <Panel title="Not under a supervisor in this division">
              <FigureTable
                rows={view.unattached.map((u) => ({
                  id: u.id,
                  name: u.full_name,
                  sub: u.role,
                  m: metricsFor([u.id], navDivisionId),
                  onClick: () => go({ ...nav, level: "member", supervisor: null, member: u.id, deal: null }),
                }))}
                empty=""
              />
            </Panel>
          )}
        </div>
      );
    }

    if (nav.level === "team") {
      return (
        <Panel
          title={
            nav.supervisor
              ? "Team"
              : currentGroup?.id === UNASSIGNED
              ? "People without a division"
              : "Team — no supervisor assigned"
          }
          hint="Click a person for their deals ▸"
        >
          <FigureTable rows={teamList} empty="No team members assigned to this division yet" />
        </Panel>
      );
    }

    // member
    return (
      <Panel title="Open deals" hint="Click a deal for details ▸">
        {dealRows.length === 0 ? (
          <div className="py-12 text-center text-sm text-gray-400">No open deals</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50">
                  {/* Same rules as the figures table: the name column is
                      frozen and never wraps, the rest wrap and sit right. */}
                  {["Deal", "Stage", "Amount", "Expected close"].map((h, i) => (
                    <th
                      key={h}
                      className={[
                        'px-4 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wide border-b border-gray-100',
                        i === 0
                          ? `text-left whitespace-nowrap ${STICKY_HEAD}`
                          : `${HEAD_NUM} ${HEAD_WRAP}`,
                      ].join(' ')}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {dealRows.map((d) => (
                  <tr
                    key={d.id}
                    onClick={() => go({ ...nav, level: "deal", deal: d.id })}
                    className="group cursor-pointer hover:bg-gray-50 transition-colors"
                  >
                    {/* A deal title is long and is the thing you navigate by,
                        so it is the frozen column here. It keeps its own
                        truncation rather than widening the table. */}
                    <td className={`px-4 py-3 font-medium text-gray-900 ${stickyBody(false)}`}>
                      <span className="block max-w-[14rem] truncate" title={dealName(d)}>
                        {dealName(d)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600 capitalize whitespace-nowrap text-right">{stageLabel(d.stage)}</td>
                    <td className={`${NUM_CELL} text-gray-900`}>{SAR(d.amount)} SAR</td>
                    <td className={`${NUM_CELL} text-gray-600`}>{fmtDate(d.expected_close_date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    );
  })();

  // ── RENDER ──
  return (
    <div className="min-h-screen bg-gray-50">
      <Header />

      {/* Sub-header — sticks under the app Header so the breadcrumb stays reachable. */}
      <div className="sticky top-16 z-10 bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 flex-shrink-0 rounded-lg bg-gradient-to-br from-indigo-600 to-indigo-800 flex items-center justify-center text-white font-bold text-xs">
              SD
            </div>
            <div className="min-w-0">
              <span className="text-sm font-semibold text-gray-900">Insights</span>
              {/* The selected period, shared with Planning, the dashboards and
                  the Coverage Console. Replaces the "This month only" chip now
                  that the page follows the selector. */}
              <span className="text-xs text-gray-500 ml-2 font-mono">
                {periodLabel}
                {isCurrentMonth && metrics.dayOfMonth
                  ? ` · day ${metrics.dayOfMonth} of ${metrics.totalDays}`
                  : ""}
              </span>
            </div>
          </div>
          <button
            onClick={fetchAll}
            className="flex-shrink-0 flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50"
          >
            &#8635; Refresh
          </button>
        </div>

        {/* Period selector — same DateRangeContext as Planning, the dashboards
            and the Coverage Console, so a period picked anywhere holds here. */}
        <div className="max-w-7xl mx-auto px-6 pb-3">
          <QuickDateSelector
            activeDateRange={{ from: rangeStart, to: rangeEnd }}
            onRangeChange={(r) => setRange({ from: r.from, to: r.to })}
          />
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 pb-3 flex items-center gap-2 flex-wrap">
          {crumbs.map((seg, i) => (
            <React.Fragment key={seg.key}>
              {i > 0 && <span className="text-gray-300 text-xs">&#9656;</span>}
              <button
                onClick={() => go(seg.to)}
                className={`text-xs px-3 py-1.5 rounded-lg border font-mono transition-colors max-w-[14rem] truncate ${
                  i === crumbs.length - 1
                    ? "bg-gray-900 text-white border-gray-900"
                    : "border-gray-200 text-gray-600 hover:bg-gray-50"
                }`}
              >
                {seg.label}
              </button>
            </React.Fragment>
          ))}
          <span className="ml-auto text-[10px] text-gray-400 font-mono uppercase tracking-widest">{scopeLabel}</span>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-5">
        {divisionsNote && (
          <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
            {divisionsNote}
          </div>
        )}

        {nav.level === "deal" && currentDeal ? (
          <>
            <div className="bg-white rounded-2xl border border-gray-200 p-5 sm:p-6">
              <p className="text-[10px] font-mono text-gray-400 uppercase tracking-widest mb-1">Deal record</p>
              <h2 className="text-xl font-bold text-gray-900 truncate">{dealName(currentDeal)}</h2>
              <p className="text-sm text-gray-500 mt-0.5 font-mono">{userName(nav.member)}</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-5">
                {[
                  ["Stage", stageLabel(currentDeal.stage)],
                  ["Amount", `${SAR(currentDeal.amount)} SAR`],
                  ["Expected close", fmtDate(currentDeal.expected_close_date)],
                ].map(([k, v]) => (
                  <div key={k} className="bg-gray-50 rounded-xl px-4 py-3">
                    <div className="text-[10px] text-gray-400 uppercase tracking-widest font-mono">{k}</div>
                    <div className="text-base font-bold font-mono mt-1 text-gray-900 capitalize">{v}</div>
                  </div>
                ))}
              </div>
            </div>
            <Panel title="Deal record">
              <div className="divide-y divide-gray-50">
                {[
                  ["Deal", currentDeal.title || "—"],
                  ["Customer", dealName(currentDeal)],
                  ["Owner", userName(currentDeal.owner_id)],
                  ["Stage", stageLabel(currentDeal.stage)],
                  ["Amount", `${SAR(currentDeal.amount)} SAR`],
                  ["Expected close", fmtDate(currentDeal.expected_close_date)],
                  ["Forecast", currentDeal.forecast_amount ? `${SAR(currentDeal.forecast_amount)} SAR` : "—"],
                  ["Invoiced", currentDeal.is_invoiced ? `Yes · ${fmtDate(currentDeal.invoice_date)}` : "No"],
                  ["Created", fmtDate(currentDeal.created_at)],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between items-baseline gap-4 px-5 py-2.5">
                    <span className="text-xs text-gray-500 font-mono">{k}</span>
                    <span className="text-xs font-semibold font-mono text-gray-900 capitalize text-right">{v}</span>
                  </div>
                ))}
              </div>
            </Panel>
          </>
        ) : (
          <>
            {/* ── HERO: status, coverage equation, coverage rail, pacing rail ── */}
            <DivisionCoverageHero
              metrics={metrics}
              scope={scopeLabel}
              title={hero.title}
              sub={hero.sub}
              periodLabel={periodLabel}
            />

            {/* THE BENCHMARK (CEO decision 2026-10-07): the company conversion
                RATE beside their own, for the two roles that cannot see the
                company. A rate is a rate — no amounts, no names, no totals.

                Absent, not broken, when raw.companyRate is null: the
                SECURITY DEFINER function it comes from arrives with
                migrations/insights_rls.sql, which is not applied yet. */}
            {(role === "supervisor" || role === "salesman") && raw?.companyRate && (
              <p
                className="text-xs text-gray-500 px-1 font-mono"
                title={`The company rate is ${raw.companyRate.won} won of ${raw.companyRate.total} deals created in the 3 completed months, with ${raw.companyRate.importedExcluded} imported rows set aside. It is shown so your own rate has something to be read against; company amounts are not shown.`}
              >
                Your conversion{" "}
                <span className="font-semibold text-gray-900">{pct(metrics.winRatePct, 0)}</span>
                {" · company "}
                <span className="font-semibold text-gray-900">
                  {raw.companyRate.winRatePct.toFixed(1)}%
                </span>
              </p>
            )}

            {nav.level === "member" && currentMember?.role === "manager" && (
              <p className="text-xs text-gray-500 px-1">
                Managers carry a yearly team target, so their own deals are not counted in these monthly figures.
                Figures count salesmen and supervisors only.
              </p>
            )}

            {/* ── LEDGER + this level's content ── */}
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
              <div className="lg:col-span-2">
                <DivisionCycleLedger metrics={metrics} exceptionCount={showExceptions ? exceptions.length : null} />
              </div>
              <div className="lg:col-span-3 min-w-0">{mainPanel}</div>
            </div>

            {/* ── EXCEPTIONS: company, division and team levels ── */}
            {showExceptions && (
              <DivisionExceptionFeed exceptions={exceptions} userName={userName} onJump={jumpToException} />
            )}
          </>
        )}
      </div>
    </div>
  );
}
