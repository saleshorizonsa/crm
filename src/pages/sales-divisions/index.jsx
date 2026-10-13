import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useAuth } from "contexts/AuthContext";
import Header from "components/ui/Header";
import { monthBounds } from "utils/planningCalculations";
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
  DASHBOARD_ROLES,
  CONTACT_AUDIT_ROLES,
} from "utils/salesDivisionMetrics";
// The page's reads live in one shared loader (session 21) so other screens —
// the AI assistant — read exactly what Insights reads.
import { fetchInsightsRaw } from "utils/insightsData";
import { DivisionCoverageHero, DivisionCycleLedger } from "./components/DivisionCoverageHero";
import DivisionExceptionFeed from "./components/DivisionExceptionFeed";
// What moved here from the Dashboard for the roles that no longer have one.
import InsightsBanners from "./components/InsightsBanners";
import InsightsMyWork from "./components/InsightsMyWork";
import InsightsTargets from "./components/InsightsTargets";
import DivisionPicker from "./components/DivisionPicker";
// The Dashboard's own audit panel, unchanged — the component already scopes
// itself by ownerIds.
import ContactReportsAudit from "components/dashboard/ContactReportsAudit";

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
  // The "All Divisions" picker (session 17): manager and above only.
  const [pickerOpen, setPickerOpen] = useState(false);
  const canPick = ["manager", "director", "head", "admin"].includes(role);
  // "coverage" (everything this page has always shown) or "targets".
  const [section, setSection] = useState("coverage");

  // THE ROLES THIS PAGE HAS TO BE COMPLETE FOR. A manager and above keep their
  // Dashboard, so the panels that moved here are rendered only for the roles
  // that lost theirs — reading DASHBOARD_ROLES rather than naming supervisor
  // and salesman again, so the two cannot disagree about who has what.
  const ownsNoDashboard = Boolean(role) && !DASHBOARD_ROLES.includes(role);
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
      const { raw: loaded, divisionsNote: note } = await fetchInsightsRaw({
        companyId: company.id, userId: user?.id, role, rangeStart, rangeEnd, isCurrentMonth, isAllTime,
      });
      if (note) setDivisionsNote(note);
      setRaw(loaded);
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

  // The people UNDER the viewer — his scope less himself. The plan, forecast
  // and bounce-back alerts are about a supervisor's salesmen, which is the
  // same `ownerIds` the Dashboard passed them.
  const subordinateIds = useMemo(
    () => scopeIds.filter((id) => id !== user?.id),
    [scopeIds, user?.id]
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
              <span className="relative">
              <button
                // Manager and above: "All Divisions" opens the picker, which can
                // still jump to the company level. Everyone else: as before.
                onClick={() => (seg.key === "company" && canPick ? setPickerOpen((o) => !o) : go(seg.to))}
                data-testid={seg.key === "company" ? "crumb-all-divisions" : undefined}
                aria-haspopup={seg.key === "company" && canPick ? "dialog" : undefined}
                aria-expanded={seg.key === "company" && canPick ? pickerOpen : undefined}
                className={`text-xs px-3 py-1.5 rounded-lg border font-mono transition-colors max-w-[14rem] truncate ${
                  i === crumbs.length - 1
                    ? "bg-gray-900 text-white border-gray-900"
                    : "border-gray-200 text-gray-600 hover:bg-gray-50"
                }`}
              >
                {seg.label}{seg.key === "company" && canPick ? " ▾" : ""}
              </button>
              {seg.key === "company" && canPick && pickerOpen && (
                <DivisionPicker
                  users={raw.users}
                  groups={groups}
                  viewerId={user?.id}
                  role={role}
                  onJump={go}
                  onClose={() => setPickerOpen(false)}
                />
              )}
              </span>
            </React.Fragment>
          ))}
          <span className="ml-auto text-[10px] text-gray-400 font-mono uppercase tracking-widest">{scopeLabel}</span>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-5">
        {/* ── WHAT NEEDS ACTING ON, FIRST ──
            The banners that used to greet a salesman or a supervisor on the
            Dashboard. They are only rendered for the roles that no longer have
            a Dashboard to see them on; a manager's is unchanged, so repeating
            them here would double them up. */}
        {ownsNoDashboard && (
          <InsightsBanners
            role={role}
            userId={user?.id}
            companyId={company?.id}
            subordinateIds={subordinateIds}
          />
        )}

        {/* ── CONTACT REPORTS AUDIT ──
            The last thing the Dashboard had that nothing else did. It showed
            only to supervisors there; here it reaches everyone who reviews a
            team, scoped to their own. Collapsed until opened, so it costs a
            query only when somebody wants it. subordinateIds is memoised —
            the component takes ownerIds as an effect dependency, and a fresh
            array each render would refetch on every one. */}
        {CONTACT_AUDIT_ROLES.includes(role) && company?.id && (
          <div data-testid="insights-contact-audit">
            <ContactReportsAudit
              companyId={company.id}
              ownerIds={subordinateIds}
              reviewerId={user?.id}
            />
          </div>
        )}

        {/* ── COVERAGE | TARGETS ──
            Two sections rather than one long page. "Coverage" is everything
            this page has always shown; "Targets" is the pair of tables that
            answer what a person was given and how far through it they are. */}
        {ownsNoDashboard && (
          <div className="flex items-center gap-1 border-b border-gray-200 -mt-1">
            {[
              ["coverage", "Coverage"],
              ["targets", "Targets"],
            ].map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setSection(key)}
                aria-current={section === key}
                data-testid={`insights-tab-${key}`}
                className={`text-xs font-medium px-3.5 py-2 -mb-px border-b-2 transition-colors ${
                  section === key
                    ? "border-indigo-600 text-indigo-700"
                    : "border-transparent text-gray-500 hover:text-gray-800"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {section === "targets" ? (
          <InsightsTargets
            companyId={company?.id}
            role={role}
            scopeIds={scopeIds}
            users={raw.users}
            deals={raw.deals}
            range={{ from: rangeStart, to: rangeEnd }}
          />
        ) : (
        <>
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
              /* What the coverage rail's drill-down needs on top of the
                 figures. raw.users is ALREADY the viewer's scope — the page
                 narrows it at fetch time — so the panel cannot name anybody
                 the rail does not already count. Grouping by division only
                 where there is more than one division on screen. */
              drill={{
                users: raw.users,
                divisions: raw.divisions,
                byDivision: nav.level === "company" && groups.length > 1,
                // rangeEnd, not the loader's local monthEnd: that one lives
                // inside fetchAll's scope. Same value, in scope here.
                monthEnd: rangeEnd,
              }}
              /* The pacing rail opens onto the same level's people, with their
                 visits (session 17). */
              pacing={{ scopeIds: levelIds, companyId: company?.id, viewerId: user?.id, role }}
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

        {/* ── MY WORK ──
            Below the tables, as the last thing on the Coverage section: the
            hot leads and the activity feed a salesman and a supervisor worked
            from on the Dashboard, scoped to themselves and their team. */}
        {ownsNoDashboard && (
          <InsightsMyWork
            companyId={company?.id}
            userId={user?.id}
            ownerIds={scopeIds}
            users={raw.users}
            scopeLabel={scopeLabel}
          />
        )}
        </>
        )}
      </div>
    </div>
  );
}
