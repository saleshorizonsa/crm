import React, { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "lib/supabase";
import { useAuth } from "contexts/AuthContext";
import Header from "components/ui/Header";
import CoverageRail from "./components/CoverageRail";
import PacingRail from "./components/PacingRail";
import OppHero from "./components/OppHero";
import ExceptionFeed from "./components/ExceptionFeed";

// ── STATE ────────────────────────────────────────────────────────────────────
// One object, four keys.
//   level: 'company' | 'team' | 'salesman' | 'opportunity'
//   team:  user id of supervisor/manager acting as team head
//   rep:   user id of salesman
//   opp:   deal id
const INIT_STATE = {
  level: "company",
  team: null,
  rep: null,
  opp: null,
};

const DIRECTOR_ROLES = ["director", "admin", "head"];

export default function CoverageConsole() {
  const { user, company, userProfile } = useAuth();
  const role = userProfile?.role;

  const [nav, setNav] = useState(INIT_STATE);
  const [raw, setRaw] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // ── NAVIGATION GESTURES ────────────────────────────────────────────────────

  function drillTeam(teamId) {
    setNav({ level: "team", team: teamId, rep: null, opp: null });
  }

  function drillRep(repId, teamId) {
    setNav({ level: "salesman", team: teamId, rep: repId, opp: null });
  }

  function drillOpp(oppId, repId, teamId) {
    setNav({ level: "opportunity", team: teamId, rep: repId, opp: oppId });
  }

  // Breadcrumb click — clear everything below the level clicked.
  function navTo(level) {
    setNav((prev) => ({
      ...prev,
      level,
      team: level === "company" ? null : prev.team,
      rep: ["company", "team"].includes(level) ? null : prev.rep,
      opp: level !== "opportunity" ? null : prev.opp,
    }));
  }

  // Exception shortcut — sets all four keys at once.
  function jumpToException(teamId, repId, dealId) {
    setNav({
      level: "opportunity",
      team: teamId,
      rep: repId,
      opp: dealId,
    });
  }

  // ── DATA FETCH ─────────────────────────────────────────────────────────────
  // Fetch once, filter in memory. Drilling never refetches.

  const fetchAll = useCallback(async () => {
    if (!company?.id) return;
    setLoading(true);
    setError("");
    try {
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
        .toISOString()
        .split("T")[0];
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0)
        .toISOString()
        .split("T")[0];

      const [
        { data: deals },
        { data: users },
        { data: targets },
        { data: deals3m },
        { data: opps },
        { data: futureOrders },
        { data: flags },
        { data: bounces },
        { data: contactReports },
        { data: escalations },
      ] = await Promise.all([
        // All deals — not lost
        supabase
          .from("deals")
          .select(
            "id, title, stage, amount, final_amount, is_invoiced, invoice_date, owner_id, forecast_amount, forecast_probability, contact_id, stage_changed_at, created_at, invoice_number, lost_reason, contacts!contact_id(first_name, last_name, company_name)"
          )
          .eq("company_id", company.id)
          .not("stage", "eq", "lost"),

        // All active users
        supabase
          .from("users")
          .select("id, full_name, role, reports_to, is_active")
          .eq("company_id", company.id)
          .eq("is_active", true),

        // Monthly targets overlapping this month
        supabase
          .from("sales_targets")
          .select("assigned_to, target_amount, period_type, target_type")
          .eq("company_id", company.id)
          .eq("period_type", "monthly")
          .lte("period_start", monthEnd)
          .gte("period_end", monthStart),

        // Trailing 3-month deals, for win rate
        supabase
          .from("deals")
          .select("id, stage, owner_id")
          .eq("company_id", company.id)
          .gte(
            "created_at",
            new Date(now.getFullYear(), now.getMonth() - 3, 1).toISOString()
          )
          .lte(
            "created_at",
            new Date(
              now.getFullYear(),
              now.getMonth(),
              0,
              23,
              59,
              59
            ).toISOString()
          ),

        // Opportunities (planning) for this month
        supabase
          .from("opportunities")
          .select(
            "id, owner_id, planned_amount, status, expected_month, customer_name, contact_id, bounce_count, deal_id"
          )
          .eq("company_id", company.id)
          .eq("status", "open")
          .gte("expected_month", monthStart)
          .lte("expected_month", monthEnd),

        // Future orders (carry-in)
        supabase
          .from("future_orders")
          .select(
            "id, owner_id, planned_amount, expected_month, status, customer_name, created_at"
          )
          .eq("company_id", company.id)
          .eq("status", "pending"),

        // Unreviewed salesman flags
        supabase
          .from("salesman_flags")
          .select("id, owner_id, flag_type, flagged_at, details, reviewed")
          .eq("company_id", company.id)
          .eq("reviewed", false),

        // Bounce-backs this month
        supabase
          .from("bounce_back_logs")
          .select(
            "id, owner_id, opportunity_id, bounced_at, escalated, bounce_count"
          )
          .eq("company_id", company.id)
          .gte("bounced_at", monthStart),

        // Contact reports this month
        supabase
          .from("contact_reports")
          .select(
            "id, deal_id, owner_id, contact_date, contact_type, customer_response, next_action, follow_up_date, is_audited, created_at"
          )
          .eq("company_id", company.id)
          .gte("created_at", monthStart),

        // Unresolved escalations
        supabase
          .from("escalation_logs")
          .select(
            "id, trigger_type, triggered_for, triggered_by, deal_id, details, resolved, created_at"
          )
          .eq("company_id", company.id)
          .eq("resolved", false),
      ]);

      setRaw({
        deals: deals || [],
        users: users || [],
        targets: targets || [],
        deals3m: deals3m || [],
        opps: opps || [],
        futureOrders: futureOrders || [],
        flags: flags || [],
        bounces: bounces || [],
        contactReports: contactReports || [],
        escalations: escalations || [],
        monthStart,
        monthEnd,
        now,
      });
    } catch (e) {
      console.error("Coverage Console load failed:", e);
      setError(e?.message || "Failed to load console data");
    } finally {
      setLoading(false);
    }
  }, [company?.id]);

  useEffect(() => {
    if (!company?.id) return;
    fetchAll();
  }, [company?.id, fetchAll]);

  // ── HIERARCHY ──────────────────────────────────────────────────────────────
  // reports_to is a single edge, so a manager's real team is the whole subtree
  // beneath them (manager -> supervisors -> salesmen), not just direct reports.

  const childrenMap = useMemo(() => {
    const map = new Map();
    (raw?.users || []).forEach((u) => {
      if (!u.reports_to) return;
      if (!map.has(u.reports_to)) map.set(u.reports_to, []);
      map.get(u.reports_to).push(u.id);
    });
    return map;
  }, [raw?.users]);

  const subtreeOf = useCallback(
    (rootId) => {
      if (!rootId) return [];
      const out = [rootId];
      const queue = [rootId];
      const seen = new Set([rootId]);
      while (queue.length) {
        const cur = queue.shift();
        for (const child of childrenMap.get(cur) || []) {
          if (seen.has(child)) continue;
          seen.add(child);
          out.push(child);
          queue.push(child);
        }
      }
      return out;
    },
    [childrenMap]
  );

  // ── METRICS ────────────────────────────────────────────────────────────────
  // Compute upward from deals. Same function at every level; only the id set
  // changes.

  function calcMetrics(userIds, data) {
    if (!data || !userIds?.length) return null;

    const {
      deals,
      targets,
      deals3m,
      opps,
      futureOrders,
      monthStart,
      monthEnd,
      now,
    } = data;

    const totalDays = new Date(
      now.getFullYear(),
      now.getMonth() + 1,
      0
    ).getDate();
    const elapsed = now.getDate() / totalDays;

    // Target — total_value rows only
    const myTargets = (targets || []).filter(
      (t) => userIds.includes(t.assigned_to) && t.target_type === "total_value"
    );
    const target = myTargets.reduce((sum, t) => sum + (t.target_amount || 0), 0);

    // Win rate — trailing 3 months, falling back to company rate
    const my3m = (deals3m || []).filter((d) => userIds.includes(d.owner_id));
    const won3m = my3m.filter((d) => d.stage === "won").length;
    const companyWR = (() => {
      const w = (deals3m || []).filter((d) => d.stage === "won").length;
      return (deals3m || []).length > 0 ? w / (deals3m || []).length : 0.472;
    })();
    const winRate = my3m.length > 0 ? won3m / my3m.length : companyWR;

    // Invoiced (achieved)
    const invoicedDeals = (deals || []).filter(
      (d) =>
        userIds.includes(d.owner_id) &&
        d.stage === "won" &&
        d.is_invoiced === true &&
        d.invoice_date >= monthStart &&
        d.invoice_date <= monthEnd
    );
    const invoiced = invoicedDeals.reduce(
      (sum, d) => sum + (d.final_amount || d.amount || 0),
      0
    );

    // Open deals (funnel)
    const openDeals = (deals || []).filter(
      (d) => userIds.includes(d.owner_id) && !["won", "lost"].includes(d.stage)
    );
    const funnel = openDeals.reduce((sum, d) => sum + (d.amount || 0), 0);
    const weightedFunnel = openDeals.reduce(
      (sum, d) => sum + (d.forecast_amount || d.amount * winRate || 0),
      0
    );

    // Planning
    const myOpps = (opps || []).filter((o) => userIds.includes(o.owner_id));
    const planning = myOpps.reduce((sum, o) => sum + (o.planned_amount || 0), 0);
    const weightedPlanning = planning * winRate;

    // Coverage
    const coverage = invoiced + weightedFunnel + weightedPlanning;

    // Required plan
    const requiredPlan = winRate > 0 ? target / winRate : 0;

    // Future orders carry-in
    const future = (futureOrders || [])
      .filter((o) => userIds.includes(o.owner_id))
      .reduce((sum, o) => sum + (o.planned_amount || 0), 0);

    // Planned gap
    const adjustedRequired = Math.max(0, requiredPlan - future);
    const plannedGap = Math.max(0, adjustedRequired - planning);

    return {
      target,
      invoiced,
      funnel,
      weightedFunnel,
      planning,
      weightedPlanning,
      coverage,
      winRate,
      requiredPlan,
      future,
      plannedGap,
      openDeals,
      invoicedDeals,
      coverageOk: coverage >= target,
      pacingOk: invoiced / Math.max(target, 1) >= elapsed - 0.15,
      pace: invoiced / Math.max(target, 1),
      elapsed,
      totalDays,
      dayOfMonth: now.getDate(),
    };
  }

  // ── SCOPED USER IDS ────────────────────────────────────────────────────────

  const scopedIds = useMemo(() => {
    if (!raw || !user?.id) return [];
    const { users } = raw;

    if (DIRECTOR_ROLES.includes(role)) {
      return users.map((u) => u.id);
    }
    if (role === "manager" || role === "supervisor") {
      return subtreeOf(user.id);
    }
    return [user.id];
  }, [raw, user?.id, role, subtreeOf]);

  // ── EXCEPTIONS ─────────────────────────────────────────────────────────────

  const FLAG_TITLES = {
    bounce_back_2nd: "2nd Bounce-Back",
    plan_missed_deadline: "Plan Not Submitted",
    forecast_mismatch: "Forecast Variance",
  };

  const ESCALATION_TITLES = {
    bounce_back_2nd: "Escalation: 2nd Bounce",
    mid_month_target_change: "Target Changed",
    forecast_mismatch: "Forecast Mismatch",
  };

  function buildExceptions(userIds, data) {
    const { flags, escalations, users } = data;
    const exs = [];
    const teamOf = (ownerId) =>
      users.find((u) => u.id === ownerId)?.reports_to || null;

    (flags || [])
      .filter((f) => userIds.includes(f.owner_id))
      .forEach((f) => {
        exs.push({
          sev: f.flag_type === "bounce_back_2nd" ? "critical" : "warning",
          type: f.flag_type,
          title: FLAG_TITLES[f.flag_type] || f.flag_type,
          ownerId: f.owner_id,
          dealId: f.details?.deal_id || null,
          teamId: teamOf(f.owner_id),
          createdAt: f.flagged_at,
        });
      });

    (escalations || [])
      .filter((e) => userIds.includes(e.triggered_for))
      .forEach((e) => {
        exs.push({
          sev: "critical",
          type: e.trigger_type,
          title: ESCALATION_TITLES[e.trigger_type] || e.trigger_type,
          ownerId: e.triggered_for,
          dealId: e.deal_id || null,
          teamId: teamOf(e.triggered_for),
          createdAt: e.created_at,
        });
      });

    return exs.sort((a, b) => {
      if (a.sev !== b.sev) return a.sev === "critical" ? -1 : 1;
      return new Date(b.createdAt) - new Date(a.createdAt);
    });
  }

  // ── HELPERS ────────────────────────────────────────────────────────────────

  const SAR = (n) => Math.abs(Math.round(n || 0)).toLocaleString("en-US");

  const compact = (n) => {
    const a = Math.abs(Math.round(n || 0));
    if (a >= 1e6) return (a / 1e6).toFixed(2) + "M";
    if (a >= 1e3) return (a / 1e3).toFixed(0) + "K";
    return String(a);
  };

  const pctFmt = (n, d = 1) => ((n || 0) * 100).toFixed(d) + "%";

  function userName(uid) {
    return raw?.users?.find((u) => u.id === uid)?.full_name || "Unknown";
  }

  // ── RENDER GUARDS ──────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header />
        <div className="flex items-center justify-center h-[60vh]">
          <div className="text-center">
            <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-sm text-gray-500">Loading console...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header />
        <div className="max-w-3xl mx-auto px-6 py-16 text-center">
          <p className="text-sm font-semibold text-red-700 mb-2">
            Coverage Console could not load
          </p>
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

  // ── LEVEL SCOPE ────────────────────────────────────────────────────────────

  const levelIds = (() => {
    if (nav.level === "company") return scopedIds;
    if (nav.level === "team" && nav.team) return subtreeOf(nav.team);
    if ((nav.level === "salesman" || nav.level === "opportunity") && nav.rep)
      return [nav.rep];
    return scopedIds;
  })();

  const metrics = calcMetrics(levelIds, raw);
  const exceptions = buildExceptions(levelIds, raw);

  const currentDeal = nav.opp ? raw.deals.find((d) => d.id === nav.opp) : null;

  // ── HERO COPY ──────────────────────────────────────────────────────────────

  const heroInfo = (() => {
    if (nav.level === "company")
      return {
        title: company?.name || "All Teams",
        sub: `${scopedIds.length} team members · ${pctFmt(
          metrics?.winRate || 0,
          0
        )} win rate`,
        scope: "Director view",
      };
    if (nav.level === "team")
      return {
        title: userName(nav.team),
        sub: `Team coverage position · ${levelIds.length} members`,
        scope: "Manager view",
      };
    if (nav.level === "salesman")
      return {
        title: userName(nav.rep),
        sub: "Salesman coverage",
        scope: "Salesman view",
      };
    return {
      title:
        currentDeal?.contacts?.company_name ||
        currentDeal?.title ||
        "Deal Record",
      sub: "Opportunity audit trail",
      scope: "Opportunity",
    };
  })();

  // ── DRILL ROWS ─────────────────────────────────────────────────────────────

  const healthOf = (m) =>
    m?.coverageOk && m?.pacingOk
      ? "ok"
      : !m?.coverageOk && !m?.pacingOk
      ? "bad"
      : "risk";

  const drillRows = (() => {
    if (nav.level === "company") {
      // Top tier only: managers own the teams, and supervisors nest inside
      // them when you drill in. Listing both tiers here would show the same
      // salesmen twice at different levels of aggregation.
      const teamHeads = raw.users.filter(
        (u) => scopedIds.includes(u.id) && u.role === "manager"
      );

      // Flat hierarchy (supervisors reporting straight to a director, no
      // manager tier) — fall back to supervisors so the table is never empty.
      const effectiveTeamHeads =
        teamHeads.length > 0
          ? teamHeads
          : raw.users.filter(
              (u) => scopedIds.includes(u.id) && u.role === "supervisor"
            );

      return effectiveTeamHeads
        .map((th) => {
          const memberIds = subtreeOf(th.id);
          const tm = calcMetrics(memberIds, raw);
          const covRatio = tm?.target > 0 ? tm.coverage / tm.target : 0;
          return {
            id: th.id,
            name: th.full_name,
            sub: `${th.role} · ${memberIds.length} members`,
            target: tm?.target || 0,
            invoiced: tm?.invoiced || 0,
            coverage: tm?.coverage || 0,
            covRatio,
            health: healthOf(tm),
            onClick: () => drillTeam(th.id),
          };
        })
        .sort((a, b) => a.covRatio - b.covRatio);
    }

    if (nav.level === "team" && nav.team) {
      const members = raw.users.filter(
        (m) => subtreeOf(nav.team).includes(m.id) && m.id !== nav.team
      );

      return members
        .map((m) => {
          const mm = calcMetrics([m.id], raw);
          const covRatio = mm?.target > 0 ? mm.coverage / mm.target : 0;
          const openCount = raw.deals.filter(
            (d) => d.owner_id === m.id && !["won", "lost"].includes(d.stage)
          ).length;
          return {
            id: m.id,
            name: m.full_name,
            sub: `${m.role} · ${openCount} open deals`,
            target: mm?.target || 0,
            invoiced: mm?.invoiced || 0,
            coverage: mm?.coverage || 0,
            covRatio,
            health: healthOf(mm),
            onClick: () => drillRep(m.id, nav.team),
          };
        })
        .sort((a, b) => a.covRatio - b.covRatio);
    }

    if (nav.level === "salesman" && nav.rep) {
      return raw.deals
        .filter(
          (d) => d.owner_id === nav.rep && !["won", "lost"].includes(d.stage)
        )
        .sort((a, b) => (b.amount || 0) - (a.amount || 0))
        .map((d) => {
          const contact = d.contacts;
          const daysSince = Math.floor(
            (Date.now() -
              new Date(d.stage_changed_at || d.created_at).getTime()) /
              86400000
          );
          const sla = daysSince > 3;
          return {
            id: d.id,
            name:
              contact?.company_name ||
              `${contact?.first_name || ""} ${
                contact?.last_name || ""
              }`.trim() ||
              d.title,
            sub: `${String(d.stage).replace(
              /_/g,
              " "
            )} · ${daysSince}d · ${SAR(d.amount)} SAR`,
            target: d.amount || 0,
            invoiced: d.forecast_amount || 0,
            coverage: d.forecast_amount || 0,
            covRatio: (d.forecast_probability || 0) / 100,
            health: sla
              ? "bad"
              : (d.forecast_probability || 0) >= 50
              ? "ok"
              : "risk",
            onClick: () => drillOpp(d.id, nav.rep, nav.team),
          };
        });
    }

    return [];
  })();

  // ── AUDIT TRAIL (opportunity level) ────────────────────────────────────────

  const auditTrail = (() => {
    if (nav.level !== "opportunity" || !nav.opp) return [];
    const deal = raw.deals.find((d) => d.id === nav.opp);
    if (!deal) return [];

    const events = [];

    raw.contactReports
      .filter((r) => r.deal_id === nav.opp)
      .forEach((r) => {
        events.push({
          date: r.created_at,
          type: "contact_report",
          icon: "\u{1F4CB}",
          title: `Contact report — ${r.contact_type || "contact"}`,
          detail: `Response: ${r.customer_response || "recorded"} · Next: ${
            r.next_action || "pending"
          }`,
        });
      });

    raw.bounces
      .filter((b) => {
        const opp = raw.opps.find((o) => o.id === b.opportunity_id);
        return opp?.deal_id === nav.opp;
      })
      .forEach((b) => {
        events.push({
          date: b.bounced_at,
          type: "bounce",
          icon: "\u{1F504}",
          title: `Bounce-back #${b.bounce_count}${
            b.escalated ? " — ESCALATED" : ""
          }`,
          detail: "No contact within 3 days",
        });
      });

    if (deal.stage_changed_at) {
      events.push({
        date: deal.stage_changed_at,
        type: "stage",
        icon: "➡️",
        title: `Stage: ${String(deal.stage).replace(/_/g, " ")}`,
        detail: `Amount: ${SAR(deal.amount)} SAR · Forecast: ${SAR(
          deal.forecast_amount
        )} SAR (${deal.forecast_probability || 0}%)`,
      });
    }

    return events.sort((a, b) => new Date(b.date) - new Date(a.date));
  })();

  // ── BREADCRUMB ─────────────────────────────────────────────────────────────

  const crumbs = [
    { label: "All Teams", level: "company" },
    nav.team ? { label: userName(nav.team), level: "team" } : null,
    nav.rep ? { label: userName(nav.rep), level: "salesman" } : null,
    nav.opp && currentDeal
      ? {
          label:
            currentDeal.contacts?.company_name || currentDeal.title || "Deal",
          level: "opportunity",
        }
      : null,
  ].filter(Boolean);

  const statusChip = metrics
    ? metrics.coverageOk && metrics.pacingOk
      ? {
          text: "Healthy",
          cls: "bg-emerald-50 text-emerald-800 border-emerald-200",
        }
      : !metrics.coverageOk && !metrics.pacingOk
      ? { text: "Off Plan", cls: "bg-red-50 text-red-800 border-red-200" }
      : { text: "At Risk", cls: "bg-amber-50 text-amber-800 border-amber-200" }
    : null;

  // ── RENDER ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />

      {/* Console sub-header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600 to-blue-800 flex items-center justify-center text-white font-bold text-xs">
              CC
            </div>
            <div>
              <span className="text-sm font-semibold text-gray-900">
                Coverage Console
              </span>
              <span className="text-xs text-gray-400 ml-2 font-mono">
                {raw.now.toLocaleDateString("en-GB", {
                  month: "long",
                  year: "numeric",
                })}
                {" · "}Day {metrics?.dayOfMonth ?? raw.now.getDate()} of{" "}
                {metrics?.totalDays ??
                  new Date(
                    raw.now.getFullYear(),
                    raw.now.getMonth() + 1,
                    0
                  ).getDate()}
              </span>
            </div>
          </div>

          <button
            onClick={fetchAll}
            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50"
          >
            &#8635; Refresh
          </button>
        </div>

        {/* Breadcrumb */}
        <div className="max-w-7xl mx-auto px-6 pb-3 flex items-center gap-2 flex-wrap">
          {crumbs.map((seg, i) => (
            <React.Fragment key={seg.level}>
              {i > 0 && <span className="text-gray-300 text-xs">&#9656;</span>}
              <button
                onClick={() => navTo(seg.level)}
                className={`text-xs px-3 py-1.5 rounded-lg border font-mono transition-colors ${
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
            {heroInfo.scope}
          </span>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6 space-y-5">
        {/* ── COVERAGE HERO ── */}
        {metrics && (
          <div className="bg-white rounded-2xl border border-gray-200 p-6">
            <div className="flex items-start justify-between mb-5 gap-4">
              <div>
                <p className="text-[10px] font-mono text-gray-400 uppercase tracking-widest mb-1">
                  {heroInfo.scope}
                </p>
                <h2 className="text-xl font-bold text-gray-900">
                  {heroInfo.title}
                </h2>
                <p className="text-sm text-gray-500 mt-0.5 font-mono">
                  {heroInfo.sub}
                </p>
              </div>

              <div className="text-right flex-shrink-0">
                <span
                  className={`inline-block text-xs font-semibold px-3 py-1.5 rounded-lg border ${statusChip.cls}`}
                >
                  {statusChip.text}
                </span>
                <div className="text-[11px] font-mono text-gray-400 mt-2 space-y-1">
                  <div>
                    Coverage{" "}
                    <span
                      className={
                        metrics.coverageOk
                          ? "text-emerald-600 font-semibold"
                          : "text-red-600 font-semibold"
                      }
                    >
                      {metrics.coverageOk ? "PASS" : "FAIL"}{" "}
                      {(
                        (metrics.coverage / Math.max(metrics.target, 1)) *
                        100
                      ).toFixed(0)}
                      %
                    </span>
                  </div>
                  <div>
                    Pacing{" "}
                    <span
                      className={
                        metrics.pacingOk
                          ? "text-emerald-600 font-semibold"
                          : "text-amber-600 font-semibold"
                      }
                    >
                      {metrics.pacingOk ? "PASS" : "FAIL"}{" "}
                      {(metrics.pace * 100).toFixed(1)}% vs{" "}
                      {(metrics.elapsed * 100).toFixed(1)}%
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Coverage equation */}
            {nav.level !== "opportunity" && (
              <div className="bg-gray-50 border-l-4 border-gray-800 px-4 py-3 mb-5 rounded-r-xl font-mono text-sm flex items-center gap-4 flex-wrap overflow-x-auto">
                {[
                  ["Invoiced", metrics.invoiced, "text-emerald-900"],
                  ["+"],
                  ["Funnel weighted", metrics.weightedFunnel, "text-emerald-600"],
                  ["+"],
                  [
                    "Planning weighted",
                    metrics.weightedPlanning,
                    "text-blue-600",
                  ],
                  [metrics.coverageOk ? "≥" : "<"],
                  ["Target", metrics.target, "text-gray-900"],
                ].map((item, i) => (
                  <div key={i}>
                    {item.length === 1 ? (
                      <span className="text-gray-400 font-bold text-lg">
                        {item[0]}
                      </span>
                    ) : (
                      <div className="flex flex-col">
                        <span className="text-[9px] text-gray-400 uppercase tracking-widest">
                          {item[0]}
                        </span>
                        <span className={`font-semibold ${item[2]}`}>
                          {compact(item[1])} SAR
                        </span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Rails — repeat at every level above opportunity */}
            {nav.level !== "opportunity" && (
              <>
                <CoverageRail
                  invoiced={metrics.invoiced}
                  weightedFunnel={metrics.weightedFunnel}
                  weightedPlanning={metrics.weightedPlanning}
                  target={metrics.target}
                  compact={compact}
                  SAR={SAR}
                />
                <div className="mt-4">
                  <PacingRail
                    pace={metrics.pace}
                    elapsed={metrics.elapsed}
                    dayOfMonth={metrics.dayOfMonth}
                    totalDays={metrics.totalDays}
                    pctFmt={pctFmt}
                  />
                </div>
              </>
            )}

            {nav.level === "opportunity" && currentDeal && (
              <OppHero
                deal={currentDeal}
                compact={compact}
                SAR={SAR}
                pctFmt={pctFmt}
              />
            )}
          </div>
        )}

        {/* ── MAIN GRID ── */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
          {/* Left — ledger */}
          <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-200 overflow-hidden self-start">
            <div className="px-5 py-3 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-gray-800">
                {nav.level === "opportunity" ? "Deal record" : "Cycle ledger"}
              </h3>
            </div>

            {nav.level !== "opportunity" && metrics && (
              <div className="divide-y divide-gray-50">
                {[
                  ["Target", SAR(metrics.target) + " SAR", ""],
                  [
                    "Achieved",
                    SAR(metrics.invoiced) + " SAR",
                    (metrics.pace * 100).toFixed(1) + "% of target",
                    "pos",
                  ],
                  [
                    "Gap to target",
                    SAR(Math.max(0, metrics.target - metrics.invoiced)) + " SAR",
                    "",
                    "neg",
                  ],
                  [
                    "Win rate",
                    (metrics.winRate * 100).toFixed(1) + "%",
                    "3-month average",
                  ],
                  [
                    "Required pipeline",
                    SAR(metrics.requiredPlan) + " SAR",
                    "target ÷ win rate",
                  ],
                  ["Planned pipeline", SAR(metrics.planning) + " SAR", ""],
                  ["Planned gap", SAR(metrics.plannedGap) + " SAR", "", "neg"],
                  [
                    "Future carry-in",
                    SAR(metrics.future) + " SAR",
                    "reduces req. plan",
                  ],
                  [
                    "Open exceptions",
                    String(exceptions.length),
                    "",
                    exceptions.length > 0 ? "neg" : "",
                  ],
                ].map(([k, v, n, cls]) => (
                  <div
                    key={k}
                    className="flex justify-between items-baseline px-5 py-2.5"
                  >
                    <span className="text-xs text-gray-500 font-mono">{k}</span>
                    <div className="text-right">
                      <span
                        className={`text-xs font-semibold font-mono ${
                          cls === "pos"
                            ? "text-emerald-700"
                            : cls === "neg"
                            ? "text-red-600"
                            : "text-gray-900"
                        }`}
                      >
                        {v}
                      </span>
                      {n && (
                        <div className="text-[10px] text-gray-400">{n}</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {nav.level === "opportunity" && currentDeal && (
              <div className="divide-y divide-gray-50">
                {[
                  ["Stage", String(currentDeal.stage).replace(/_/g, " ")],
                  ["Amount", SAR(currentDeal.amount) + " SAR"],
                  [
                    "Forecast",
                    SAR(currentDeal.forecast_amount) +
                      " SAR (" +
                      (currentDeal.forecast_probability || 0) +
                      "%)",
                  ],
                  [
                    "Invoice status",
                    currentDeal.is_invoiced
                      ? currentDeal.invoice_number || "Invoiced"
                      : "Not invoiced",
                  ],
                  [
                    "Created",
                    new Date(currentDeal.created_at).toLocaleDateString("en-GB"),
                  ],
                  [
                    "Last stage change",
                    currentDeal.stage_changed_at
                      ? new Date(
                          currentDeal.stage_changed_at
                        ).toLocaleDateString("en-GB")
                      : "—",
                  ],
                ].map(([k, v]) => (
                  <div
                    key={k}
                    className="flex justify-between items-baseline px-5 py-2.5"
                  >
                    <span className="text-xs text-gray-500 font-mono">{k}</span>
                    <span className="text-xs font-semibold font-mono text-gray-900 capitalize">
                      {v}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right — drill table or audit trail */}
          <div className="lg:col-span-3 bg-white rounded-2xl border border-gray-200 overflow-hidden self-start">
            <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-800">
                {nav.level === "company"
                  ? "Teams — weakest first"
                  : nav.level === "team"
                  ? "Salesmen"
                  : nav.level === "salesman"
                  ? "Open opportunities"
                  : "Audit trail"}
              </h3>
              {nav.level !== "opportunity" && (
                <span className="text-xs text-gray-400">
                  Click to drill down &#9656;
                </span>
              )}
            </div>

            {nav.level !== "opportunity" && (
              <div className="overflow-x-auto">
                {drillRows.length === 0 ? (
                  <div className="py-12 text-center text-sm text-gray-400">
                    No data available
                  </div>
                ) : (
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-gray-50">
                        {["Name", "Target", "Achieved", "Coverage", "Status"].map(
                          (h) => (
                            <th
                              key={h}
                              className="text-left px-4 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wide border-b border-gray-100"
                            >
                              {h}
                            </th>
                          )
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {drillRows.map((row) => (
                        <tr
                          key={row.id}
                          onClick={row.onClick}
                          className="cursor-pointer hover:bg-gray-50 transition-colors"
                        >
                          <td className="px-4 py-3">
                            <div className="font-medium text-gray-900">
                              {row.name}
                            </div>
                            {row.sub && (
                              <div className="text-[10px] text-gray-400 font-mono mt-0.5 capitalize">
                                {row.sub}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3 font-mono text-gray-600">
                            {compact(row.target)}
                          </td>
                          <td className="px-4 py-3 font-mono font-semibold text-emerald-700">
                            {compact(row.invoiced)}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                <div
                                  className="h-full rounded-full"
                                  style={{
                                    width: `${Math.min(
                                      row.covRatio * 100,
                                      100
                                    ).toFixed(0)}%`,
                                    background:
                                      row.covRatio >= 1 ? "#064e3b" : "#ef4444",
                                  }}
                                />
                              </div>
                              <span
                                className={`font-mono font-semibold ${
                                  row.covRatio >= 1
                                    ? "text-emerald-700"
                                    : "text-red-600"
                                }`}
                              >
                                {(row.covRatio * 100).toFixed(0)}%
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`text-[10px] font-semibold px-2 py-1 rounded-full border ${
                                row.health === "ok"
                                  ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                                  : row.health === "risk"
                                  ? "bg-amber-50 text-amber-800 border-amber-200"
                                  : "bg-red-50 text-red-800 border-red-200"
                              }`}
                            >
                              {row.health === "ok"
                                ? "Healthy"
                                : row.health === "risk"
                                ? "At risk"
                                : "Off plan"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {nav.level === "opportunity" && (
              <div className="divide-y divide-gray-50">
                {auditTrail.length === 0 ? (
                  <div className="py-12 text-center text-sm text-gray-400">
                    No events logged for this deal yet
                  </div>
                ) : (
                  auditTrail.map((ev, i) => (
                    <div key={i} className="px-5 py-3 flex items-start gap-3">
                      <span className="text-lg flex-shrink-0 mt-0.5">
                        {ev.icon}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold text-gray-900">
                          {ev.title}
                        </div>
                        <div className="text-[11px] text-gray-500 mt-0.5">
                          {ev.detail}
                        </div>
                        <div className="text-[10px] text-gray-400 font-mono mt-1">
                          {ev.date
                            ? new Date(ev.date).toLocaleDateString("en-GB", {
                                day: "2-digit",
                                month: "short",
                                year: "numeric",
                              })
                            : "—"}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── EXCEPTION FEED — repeats at every level ── */}
        <ExceptionFeed
          exceptions={exceptions}
          userName={userName}
          onJump={(ex) => jumpToException(ex.teamId, ex.ownerId, ex.dealId)}
        />
      </div>
    </div>
  );
}
