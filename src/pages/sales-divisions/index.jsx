import React, { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "lib/supabase";
import { useAuth } from "contexts/AuthContext";
import Header from "components/ui/Header";
import { monthBounds, nextMonthBounds } from "utils/planningCalculations";
import {
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
import { DivisionCoverageHero, DivisionCycleLedger } from "./components/DivisionCoverageHero";
import DivisionExceptionFeed from "./components/DivisionExceptionFeed";

// Sales Divisions — Company → Division → Team → Member → Deal.
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

const COLUMNS = ["Name", "Target", "Achieved", "Deficit", "Win rate", "Planned gap", "Coverage", "Status"];

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
            {COLUMNS.map((h) => (
              <th
                key={h}
                className="text-left px-4 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wide border-b border-gray-100 whitespace-nowrap"
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
              className={`cursor-pointer hover:bg-gray-50 transition-colors ${row.pinned ? "bg-indigo-50/40" : ""}`}
            >
              <td className="px-4 py-3">
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
              <td className="px-4 py-3 font-mono text-gray-600">{compact(row.m.target)}</td>
              <td className="px-4 py-3 font-mono font-semibold text-emerald-700">{compact(row.m.achieved)}</td>
              <td className="px-4 py-3 font-mono text-red-600">{compact(row.m.deficit)}</td>
              <td className="px-4 py-3 font-mono text-gray-600">{pct(row.m.winRatePct)}</td>
              <td className="px-4 py-3 font-mono text-blue-700">{compact(row.m.plannedGap)}</td>
              <td className="px-4 py-3"><CoverageCell m={row.m} /></td>
              <td className="px-4 py-3"><StatusChip m={row.m} /></td>
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
    ["Deficit", `${compact(m.deficit)} SAR`, "text-red-600"],
    ["Win rate", pct(m.winRatePct), "text-gray-900"],
    ["Planned gap", `${compact(m.plannedGap)} SAR`, "text-blue-700"],
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
      const { startDate: monthStart, endDate: monthEnd } = monthBounds(now);
      const nextMonth = nextMonthBounds(now);

      const [usersRes, divisionsRes, dealsRes, targetsRes, deals3mRes, oppsRes, futureRes, flagsRes, escalationsRes] =
        await Promise.all([
          supabase
            .from("users")
            .select("id, full_name, role, reports_to, is_active, sales_division_id")
            .eq("company_id", company.id)
            .eq("is_active", true),
          supabase
            .from("sales_divisions")
            .select("id, name, sort_order")
            .eq("company_id", company.id)
            .order("sort_order", { ascending: true }),
          supabase
            .from("deals")
            .select(
              "id, title, stage, amount, final_amount, is_invoiced, invoice_date, owner_id, forecast_amount, expected_close_date, created_at, contacts!contact_id(first_name, last_name, company_name)"
            )
            .eq("company_id", company.id)
            .not("stage", "eq", "lost"),
          supabase
            .from("sales_targets")
            .select(
              "assigned_to, target_amount, period_type, target_type, period_start, product_group, client_targets(target_amount)"
            )
            .eq("company_id", company.id)
            .eq("status", "active")
            .eq("period_type", "monthly")
            .lte("period_start", monthEnd)
            .gte("period_end", monthStart),
          supabase
            .from("deals")
            .select("id, stage, owner_id")
            .eq("company_id", company.id)
            .gte("created_at", new Date(now.getFullYear(), now.getMonth() - 3, 1).toISOString())
            .lte("created_at", new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59).toISOString()),
          supabase
            .from("opportunities")
            .select("id, owner_id, planned_amount")
            .eq("company_id", company.id)
            .eq("status", "open")
            .gte("expected_month", monthStart)
            .lte("expected_month", monthEnd),
          // Carry-in: next month's committed orders (same window as Planning).
          supabase
            .from("future_orders")
            .select("id, owner_id, planned_amount")
            .eq("company_id", company.id)
            .eq("status", "pending")
            .gte("expected_month", nextMonth.startDate)
            .lte("expected_month", nextMonth.endDate),
          // Exceptions — the Coverage Console's two sources.
          supabase
            .from("salesman_flags")
            .select("id, owner_id, flag_type, flagged_at, details, reviewed")
            .eq("company_id", company.id)
            .eq("reviewed", false),
          supabase
            .from("escalation_logs")
            .select("id, trigger_type, triggered_for, triggered_by, deal_id, details, resolved, created_at")
            .eq("company_id", company.id)
            .eq("resolved", false),
        ]);

      const failed = [usersRes, dealsRes, targetsRes, deals3mRes, oppsRes, futureRes].find((r) => r.error);
      if (failed) throw failed.error;
      if (divisionsRes.error) {
        setDivisionsNote("Sales divisions could not be loaded, so everyone is shown under Unassigned.");
      }
      // Exceptions never block the page (the Coverage Console treats them the same way).
      if (flagsRes.error) console.warn("Sales Divisions: salesman_flags not loaded:", flagsRes.error.message);
      if (escalationsRes.error) console.warn("Sales Divisions: escalation_logs not loaded:", escalationsRes.error.message);

      setRaw({
        users: usersRes.data || [],
        divisions: divisionsRes.error ? [] : divisionsRes.data || [],
        deals: dealsRes.data || [],
        targets: targetsRes.data || [],
        deals3m: deals3mRes.data || [],
        opps: oppsRes.data || [],
        futureOrders: futureRes.data || [],
        flags: flagsRes.error ? [] : flagsRes.data || [],
        escalations: escalationsRes.error ? [] : escalationsRes.data || [],
        monthStart,
        monthEnd,
        now,
      });
    } catch (e) {
      console.error("Sales Divisions load failed:", e);
      setError(e?.message || "Failed to load sales divisions");
    } finally {
      setLoading(false);
    }
  }, [company?.id]);

  useEffect(() => {
    if (!company?.id) return;
    fetchAll();
  }, [company?.id, fetchAll]);

  const scopeIds = useMemo(
    () => (raw ? scopeUserIds({ users: raw.users, viewerId: user?.id, role }) : []),
    [raw, user?.id, role]
  );

  const groups = useMemo(
    () => (raw ? groupByDivision({ users: raw.users, divisions: raw.divisions, scopeIds }) : []),
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
          <p className="text-sm font-semibold text-red-700 mb-2">Sales Divisions could not load</p>
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
  const metricsFor = (ids) => calcDivisionMetrics(ids, raw);

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
  const metrics = metricsFor(levelIds);
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

  const scopeLabel = role === "manager" ? "Manager view · your team" : "Director view · whole company";

  const hero = (() => {
    const winRate = `${pct(metrics.winRatePct, 0)} win rate`;
    if (nav.level === "company")
      return {
        title: company?.name || "All Divisions",
        sub: `${groups.length - 1} divisions · ${listedMembers({ users: raw.users, userIds: scopeIds }).length} team members · ${winRate}`,
      };
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
          m: metricsFor(g.userIds),
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
          m: metricsFor([u.id]),
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
            const team = metricsFor(card.teamIds);
            const own = metricsFor([card.user.id]);
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
                  m: metricsFor([u.id]),
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
                  {["Deal", "Stage", "Amount", "Expected close"].map((h) => (
                    <th
                      key={h}
                      className="text-left px-4 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wide border-b border-gray-100 whitespace-nowrap"
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
                    className="cursor-pointer hover:bg-gray-50 transition-colors"
                  >
                    <td className="px-4 py-3 font-medium text-gray-900">{dealName(d)}</td>
                    <td className="px-4 py-3 text-gray-600 capitalize whitespace-nowrap">{stageLabel(d.stage)}</td>
                    <td className="px-4 py-3 font-mono text-gray-900 whitespace-nowrap">{SAR(d.amount)} SAR</td>
                    <td className="px-4 py-3 font-mono text-gray-600 whitespace-nowrap">{fmtDate(d.expected_close_date)}</td>
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
              <span className="text-sm font-semibold text-gray-900">Sales Divisions</span>
              <span className="text-xs text-gray-400 ml-2 font-mono">
                {raw.now.toLocaleDateString("en-GB", { month: "long", year: "numeric" })}
                {" · "}Day {metrics.dayOfMonth} of {metrics.totalDays}
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
            <DivisionCoverageHero metrics={metrics} scope={scopeLabel} title={hero.title} sub={hero.sub} />

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
