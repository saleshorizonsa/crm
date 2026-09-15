import React, { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "lib/supabase";
import { useAuth } from "contexts/AuthContext";
import Header from "components/ui/Header";
import { monthBounds } from "utils/planningCalculations";
import {
  UNASSIGNED,
  scopeUserIds,
  groupByDivision,
  listedMembers,
  calcDivisionMetrics,
  healthOf,
} from "utils/salesDivisionMetrics";

// Sales Divisions — Company → Division → Member → Deal.
//
// A separate page from the Coverage Console: same look, its own code and data.
// It groups people by product line (users.sales_division_id) instead of by
// reporting line. Directors see the whole company; managers see their own team.
// Current month only, like the Coverage Console.

const INIT_NAV = { level: "company", division: null, member: null, deal: null };

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
  d
    ? new Date(d).toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "—";

const dealName = (d) =>
  d?.contacts?.company_name ||
  `${d?.contacts?.first_name || ""} ${d?.contacts?.last_name || ""}`.trim() ||
  d?.title ||
  "Deal";

const HEALTH = {
  ok: { text: "Covered", cls: "bg-emerald-50 text-emerald-800 border-emerald-200" },
  risk: { text: "At risk", cls: "bg-amber-50 text-amber-800 border-amber-200" },
  bad: { text: "Off plan", cls: "bg-red-50 text-red-800 border-red-200" },
  none: { text: "No target", cls: "bg-gray-50 text-gray-500 border-gray-200" },
};

export default function SalesDivisions() {
  const { user, company, userProfile } = useAuth();
  const role = userProfile?.role;

  const [nav, setNav] = useState(INIT_NAV);
  const [raw, setRaw] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [divisionsNote, setDivisionsNote] = useState("");

  // Drilling changes state, not the route, so scroll back up by hand.
  const scrollToTop = () => window.scrollTo({ top: 0, behavior: "smooth" });

  const drillDivision = (divisionId) => {
    setNav({ level: "division", division: divisionId, member: null, deal: null });
    scrollToTop();
  };
  const drillMember = (memberId) => {
    setNav((prev) => ({ ...prev, level: "member", member: memberId, deal: null }));
    scrollToTop();
  };
  const drillDeal = (dealId) => {
    setNav((prev) => ({ ...prev, level: "deal", deal: dealId }));
    scrollToTop();
  };
  const navTo = (level) => {
    setNav((prev) => ({
      level,
      division: level === "company" ? null : prev.division,
      member: ["company", "division"].includes(level) ? null : prev.member,
      deal: level === "deal" ? prev.deal : null,
    }));
    scrollToTop();
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

      const [usersRes, divisionsRes, dealsRes, targetsRes, deals3mRes, oppsRes] =
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
            .lte(
              "created_at",
              new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59).toISOString()
            ),
          supabase
            .from("opportunities")
            .select("id, owner_id, planned_amount")
            .eq("company_id", company.id)
            .eq("status", "open")
            .gte("expected_month", monthStart)
            .lte("expected_month", monthEnd),
        ]);

      const failed = [usersRes, dealsRes, targetsRes, deals3mRes, oppsRes].find((r) => r.error);
      if (failed) throw failed.error;
      if (divisionsRes.error) {
        setDivisionsNote("Sales divisions could not be loaded, so everyone is shown under Unassigned.");
      }

      setRaw({
        users: usersRes.data || [],
        divisions: divisionsRes.error ? [] : divisionsRes.data || [],
        deals: dealsRes.data || [],
        targets: targetsRes.data || [],
        deals3m: deals3mRes.data || [],
        opps: oppsRes.data || [],
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
          <button
            onClick={fetchAll}
            className="text-xs border border-gray-300 rounded-lg px-4 py-2 hover:bg-white"
          >
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
  const currentGroup = nav.division ? groups.find((g) => g.id === nav.division) : null;
  const currentDeal = nav.deal ? raw.deals.find((d) => d.id === nav.deal) : null;
  const currentMember = nav.member ? userById.get(nav.member) : null;

  const levelIds =
    nav.level === "company"
      ? scopeIds
      : nav.level === "division"
      ? currentGroup?.userIds || []
      : nav.member
      ? [nav.member]
      : [];

  const metrics = calcDivisionMetrics(levelIds, raw);
  const isManagerView = role === "manager";
  const scopeLabel = isManagerView ? "Manager view · your team" : "Director view · whole company";

  const hero = (() => {
    if (nav.level === "company")
      return {
        title: company?.name || "All Divisions",
        sub: `${groups.length - 1} divisions · ${listedMembers({ users: raw.users, userIds: scopeIds }).length} team members`,
      };
    if (nav.level === "division")
      return {
        title: currentGroup?.name || "Division",
        sub: `${listedMembers({ users: raw.users, userIds: currentGroup?.userIds }).length} team members`,
      };
    if (nav.level === "member")
      return {
        title: userName(nav.member),
        sub: `${currentMember?.role || ""} · ${currentGroup?.name || ""}`,
      };
    return { title: dealName(currentDeal), sub: `${userName(nav.member)} · deal record` };
  })();

  const crumbs = [
    { label: "All Divisions", level: "company" },
    currentGroup ? { label: currentGroup.name, level: "division" } : null,
    nav.member ? { label: userName(nav.member), level: "member" } : null,
    currentDeal ? { label: dealName(currentDeal), level: "deal" } : null,
  ].filter(Boolean);

  // ── TABLE ROWS ──
  const figureRow = (id, name, sub, ids, onClick) => {
    const m = calcDivisionMetrics(ids, raw);
    return { id, name, sub, m, health: healthOf(m), onClick };
  };

  const divisionRows =
    nav.level === "company"
      ? groups.map((g) =>
          figureRow(
            g.id,
            g.name,
            `${listedMembers({ users: raw.users, userIds: g.userIds }).length} members${
              g.id === UNASSIGNED ? " · no division set" : ""
            }`,
            g.userIds,
            () => drillDivision(g.id)
          )
        )
      : [];

  const memberRows =
    nav.level === "division"
      ? listedMembers({ users: raw.users, userIds: currentGroup?.userIds }).map((u) =>
          figureRow(
            u.id,
            u.full_name,
            `${u.role}${u.role === "manager" ? " · not counted in figures" : ""}`,
            [u.id],
            () => drillMember(u.id)
          )
        )
      : [];

  const dealRows =
    nav.level === "member"
      ? raw.deals
          .filter((d) => d.owner_id === nav.member && !["won", "lost"].includes(d.stage))
          .sort((a, b) => (b.amount || 0) - (a.amount || 0))
      : [];

  const tableTitle =
    nav.level === "company"
      ? "Sales divisions"
      : nav.level === "division"
      ? "Team members"
      : nav.level === "member"
      ? "Open deals"
      : "Deal record";

  const tiles = [
    { label: "Target", value: `${compact(metrics.target)} SAR`, note: "this month" },
    {
      label: "Achieved",
      value: `${compact(metrics.achieved)} SAR`,
      note: metrics.target > 0 ? `${pct((metrics.achieved / metrics.target) * 100)} of target` : "invoiced",
      cls: "text-emerald-700",
    },
    { label: "Win rate", value: pct(metrics.winRatePct), note: "3-month" },
    { label: "Planned", value: `${compact(metrics.planned)} SAR`, note: "this month's plan", cls: "text-blue-700" },
    { label: "Pipeline", value: `${compact(metrics.pipeline)} SAR`, note: "open deals" },
    {
      label: "Coverage",
      value: metrics.target > 0 ? pct(metrics.covRatio * 100, 0) : `${compact(metrics.coverage)} SAR`,
      note: `${compact(metrics.coverage)} SAR vs target`,
      cls: metrics.target > 0 ? (metrics.covRatio >= 1 ? "text-emerald-700" : "text-red-600") : "text-gray-900",
    },
  ];

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
            <React.Fragment key={seg.level}>
              {i > 0 && <span className="text-gray-300 text-xs">&#9656;</span>}
              <button
                onClick={() => navTo(seg.level)}
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
          <span className="ml-auto text-[10px] text-gray-400 font-mono uppercase tracking-widest">
            {scopeLabel}
          </span>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-5">
        {divisionsNote && (
          <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
            {divisionsNote}
          </div>
        )}

        {/* ── HERO ── */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4 mb-5">
            <div className="min-w-0">
              <p className="text-[10px] font-mono text-gray-400 uppercase tracking-widest mb-1">
                {scopeLabel}
              </p>
              <h2 className="text-xl font-bold text-gray-900 truncate">{hero.title}</h2>
              <p className="text-sm text-gray-500 mt-0.5 font-mono capitalize">{hero.sub}</p>
            </div>
            {nav.level !== "deal" && (
              <span
                className={`flex-shrink-0 inline-block text-xs font-semibold px-3 py-1.5 rounded-lg border ${
                  HEALTH[healthOf(metrics)].cls
                }`}
              >
                {HEALTH[healthOf(metrics)].text}
              </span>
            )}
          </div>

          {nav.level !== "deal" ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {tiles.map((t) => (
                <div key={t.label} className="bg-gray-50 rounded-xl px-4 py-3">
                  <div className="text-[10px] text-gray-400 uppercase tracking-widest font-mono">
                    {t.label}
                  </div>
                  <div className={`text-base font-bold font-mono mt-1 ${t.cls || "text-gray-900"}`}>
                    {t.value}
                  </div>
                  <div className="text-[10px] text-gray-400 mt-0.5">{t.note}</div>
                </div>
              ))}
            </div>
          ) : (
            currentDeal && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
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
            )
          )}

          {nav.level === "member" && currentMember?.role === "manager" && (
            <p className="mt-4 text-xs text-gray-500">
              Managers carry a yearly team target, so their own deals are not counted in these
              monthly figures. Figures count salesmen and supervisors only.
            </p>
          )}
        </div>

        {/* ── TABLE ── */}
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-800">{tableTitle}</h3>
            {nav.level !== "deal" && (
              <span className="text-xs text-gray-400">Click to drill down &#9656;</span>
            )}
          </div>

          {(nav.level === "company" || nav.level === "division") && (
            <div className="overflow-x-auto">
              {(nav.level === "company" ? divisionRows : memberRows).length === 0 ? (
                <div className="py-12 text-center text-sm text-gray-400">
                  No team members assigned to this division yet
                </div>
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50">
                      {["Name", "Target", "Achieved", "Win rate", "Planned", "Pipeline", "Coverage", "Status"].map(
                        (h) => (
                          <th
                            key={h}
                            className="text-left px-4 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wide border-b border-gray-100 whitespace-nowrap"
                          >
                            {h}
                          </th>
                        )
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {(nav.level === "company" ? divisionRows : memberRows).map((row) => (
                      <tr
                        key={row.id}
                        onClick={row.onClick}
                        className="cursor-pointer hover:bg-gray-50 transition-colors"
                      >
                        <td className="px-4 py-3">
                          <div className="font-medium text-gray-900 whitespace-nowrap">{row.name}</div>
                          <div className="text-[10px] text-gray-400 font-mono mt-0.5 capitalize whitespace-nowrap">
                            {row.sub}
                          </div>
                        </td>
                        <td className="px-4 py-3 font-mono text-gray-600">{compact(row.m.target)}</td>
                        <td className="px-4 py-3 font-mono font-semibold text-emerald-700">
                          {compact(row.m.achieved)}
                        </td>
                        <td className="px-4 py-3 font-mono text-gray-600">{pct(row.m.winRatePct)}</td>
                        <td className="px-4 py-3 font-mono text-blue-700">{compact(row.m.planned)}</td>
                        <td className="px-4 py-3 font-mono text-gray-600">{compact(row.m.pipeline)}</td>
                        <td className="px-4 py-3">
                          {row.m.target > 0 ? (
                            <div className="flex items-center gap-2">
                              <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                <div
                                  className="h-full rounded-full"
                                  style={{
                                    width: `${Math.min(row.m.covRatio * 100, 100).toFixed(0)}%`,
                                    background: row.m.covRatio >= 1 ? "#064e3b" : "#ef4444",
                                  }}
                                />
                              </div>
                              <span
                                className={`font-mono font-semibold ${
                                  row.m.covRatio >= 1 ? "text-emerald-700" : "text-red-600"
                                }`}
                              >
                                {(row.m.covRatio * 100).toFixed(0)}%
                              </span>
                            </div>
                          ) : (
                            <span className="font-mono text-gray-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`text-[10px] font-semibold px-2 py-1 rounded-full border whitespace-nowrap ${
                              HEALTH[row.health].cls
                            }`}
                          >
                            {HEALTH[row.health].text}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {nav.level === "member" && (
            <div className="overflow-x-auto">
              {dealRows.length === 0 ? (
                <div className="py-12 text-center text-sm text-gray-400">No open deals</div>
              ) : (
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
                        onClick={() => drillDeal(d.id)}
                        className="cursor-pointer hover:bg-gray-50 transition-colors"
                      >
                        <td className="px-4 py-3 font-medium text-gray-900">{dealName(d)}</td>
                        <td className="px-4 py-3 text-gray-600 capitalize whitespace-nowrap">
                          {stageLabel(d.stage)}
                        </td>
                        <td className="px-4 py-3 font-mono text-gray-900 whitespace-nowrap">
                          {SAR(d.amount)} SAR
                        </td>
                        <td className="px-4 py-3 font-mono text-gray-600 whitespace-nowrap">
                          {fmtDate(d.expected_close_date)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {nav.level === "deal" && currentDeal && (
            <div className="divide-y divide-gray-50">
              {[
                ["Deal", currentDeal.title || "—"],
                ["Customer", dealName(currentDeal)],
                ["Owner", userName(currentDeal.owner_id)],
                ["Stage", stageLabel(currentDeal.stage)],
                ["Amount", `${SAR(currentDeal.amount)} SAR`],
                ["Expected close", fmtDate(currentDeal.expected_close_date)],
                [
                  "Forecast",
                  currentDeal.forecast_amount ? `${SAR(currentDeal.forecast_amount)} SAR` : "—",
                ],
                ["Created", fmtDate(currentDeal.created_at)],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between items-baseline gap-4 px-5 py-2.5">
                  <span className="text-xs text-gray-500 font-mono">{k}</span>
                  <span className="text-xs font-semibold font-mono text-gray-900 capitalize text-right">
                    {v}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
