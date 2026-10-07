import React, { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "lib/supabase";
import { useAuth } from "contexts/AuthContext";
import Header from "components/ui/Header";
// The shared rail. This file owned the original; sales-divisions carried a
// hand-copy of it until 2026-10-07, when the drill-down made two copies
// untenable and they became one component.
import CoverageRail from "components/CoverageRail";
import PacingRail from "./components/PacingRail";
import OppHero from "./components/OppHero";
import ExceptionFeed from "./components/ExceptionFeed";
import QuickDateSelector from "components/QuickDateSelector";
import { useDateRange } from "contexts/DateRangeContext";
import {
  periodLabelFromRange,
  isCurrentMonthRange,
  isAllTimeRange,
} from "utils/dashboardDateUtils";
import {
  CONTRIBUTOR_ROLES,
  isAchievedOnly,
  computeAchieved,
  targetPerPerson,
  winRateFromDeals,
  computeCoverage,
  sumPlannedByOwner,
  computeRequiredRaw,
  computePlannedGap,
  monthBounds,
  nextMonthBounds,
  wonNotInvoicedExceptions,
} from "utils/planningCalculations";
// One funnel definition, including the undated open deals this screen used to
// drop (utils/openFunnel.js).
import { partitionOpenFunnel } from "utils/openFunnel";
// The per-node metrics this screen shows, lifted out so the numbers-check
// page can call the same function with the same arguments.
import { calcCoverageMetrics } from "utils/coverageConsoleMetrics";
// The coverage figure's one name and formula. This screen computes covRatio
// itself from calcCoverageMetrics, but it must not name it differently.
import {
  EXPECTED_PCT_LABEL,
  EXPECTED_PCT_TOOLTIP,
} from "utils/salesDivisionMetrics";

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

  // ── Selected period, shared with Planning and the dashboards ───────────────
  const { dateRange, setRange } = useDateRange();
  const defMonth = monthBounds(new Date());
  const rangeStart = dateRange?.from || defMonth.startDate;
  const rangeEnd = dateRange?.to || defMonth.endDate;
  const periodLabel = periodLabelFromRange(rangeStart, rangeEnd);
  // Pacing, the row status and Future carry-in only mean anything for the
  // current month in progress; target-derived figures mean nothing for All Time
  // (targets exist per month, Achieved spans everything).
  const isCurrentMonth = isCurrentMonthRange(rangeStart, rangeEnd);
  const isAllTime = isAllTimeRange(rangeStart, rangeEnd);

  const [nav, setNav] = useState(INIT_STATE);
  const [raw, setRaw] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // ── NAVIGATION GESTURES ────────────────────────────────────────────────────

  // Drilling changes React state, not the route, so the app-level <ScrollToTop />
  // (which keys off pathname) never fires here. Reset scroll by hand on every
  // level change, otherwise a drill from a row below the fold leaves the reader
  // parked mid-page with the breadcrumb out of view.
  const scrollToTop = () => window.scrollTo({ top: 0, behavior: "smooth" });

  function drillTeam(teamId) {
    setNav({ level: "team", team: teamId, rep: null, opp: null });
    scrollToTop();
  }

  function drillRep(repId, teamId) {
    setNav({ level: "salesman", team: teamId, rep: repId, opp: null });
    scrollToTop();
  }

  function drillOpp(oppId, repId, teamId) {
    setNav({ level: "opportunity", team: teamId, rep: repId, opp: oppId });
    scrollToTop();
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
    scrollToTop();
  }

  // Exception shortcut — sets all four keys at once.
  function jumpToException(teamId, repId, dealId) {
    setNav({
      level: "opportunity",
      team: teamId,
      rep: repId,
      opp: dealId,
    });
    scrollToTop();
  }

  // ── DATA FETCH ─────────────────────────────────────────────────────────────
  // Fetch once, filter in memory. Drilling never refetches.

  const fetchAll = useCallback(async () => {
    if (!company?.id) return;
    setLoading(true);
    setError("");
    try {
      const now = new Date();
      // The SELECTED period, shared with Planning and the dashboards through
      // DateRangeContext. This console used to hard-wire monthBounds(now), so
      // arriving here with "This Year" picked elsewhere silently showed the
      // current month instead.
      //
      // monthBounds() still supplies the DEFAULT when no range has been chosen.
      // It formats from LOCAL date parts: toISOString() was used here once and
      // in GMT+3 shifted the window back a day, pulling the previous month's
      // target rows in and dropping anything dated the last day of the month.
      const monthStart = rangeStart;
      const monthEnd = rangeEnd;
      // Today's calendar month, for the things that must stay as-of-today
      // whatever period is selected: the exception feeds and the 3-month
      // win-rate window.
      const todayMonth = monthBounds(now);
      // Carry-in is "next month" relative to TODAY, not to the selected period —
      // it is a live forward-looking figure and is hidden outside the current
      // month anyway (see isCurrentMonth).
      const nextMonth = nextMonthBounds(now);

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
        { data: returnRows },
      ] = await Promise.all([
        // All deals — not lost
        supabase
          .from("deals")
          .select(
            "id, title, stage, amount, final_amount, is_invoiced, invoice_date, expected_close_date, owner_id, forecast_amount, forecast_probability, contact_id, stage_changed_at, created_at, invoice_number, lost_reason, contacts!contact_id(first_name, last_name, company_name)"
          )
          .eq("company_id", company.id)
          .not("stage", "eq", "lost"),

        // EVERY user, not only the active ones: the company totals have to
        // include people who have left (CEO decision 2026-10-07) or this screen
        // contradicts the KPI strip and Planning on the same figures. The row
        // filters and the subtree walk below apply the active-only half of the
        // rule, so no departed person appears in a list or a drill-down.
        supabase
          .from("users")
          .select("id, full_name, role, supervisor_id, is_active, is_contributor")
          .eq("company_id", company.id),

        // Monthly targets overlapping this month. status=active matters: draft
        // and superseded rows were being counted here but nowhere else.
        supabase
          .from("sales_targets")
          .select(
            "assigned_to, target_amount, period_type, target_type, period_start, period_end, product_group, client_targets(target_amount)"
          )
          .eq("company_id", company.id)
          .eq("status", "active")
          .eq("period_type", "monthly")
          .lte("period_start", monthEnd)
          .gte("period_end", monthStart),

        // Trailing 3-month deals, for the conversion rate. invoice_number and
        // closed_at are read so winRateFromDeals can drop IMPORTED history
        // (utils/importedDeals.js) — without them every loaded-in invoice
        // counts as a won deal and the rate reads ~12 points high, which
        // understates Required Plan for every node on this screen.
        //
        // is_imported is NOT selected here: this read is part of a
        // Promise.all with no room to retry, and selecting a column that does
        // not exist yet would 400 the whole screen. invoice_number carries the
        // rule until the migration lands; add is_imported to this select
        // afterwards.
        supabase
          .from("deals")
          .select("id, stage, owner_id, created_at, closed_at, invoice_number")
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

        // Future orders (carry-in) — NEXT month only. Carry-in is defined as
        // next month's committed orders; this fetched every pending row of any
        // month, which would silently inflate carry-in as soon as an order was
        // booked further out.
        supabase
          .from("future_orders")
          .select(
            "id, owner_id, planned_amount, expected_month, status, customer_name, created_at"
          )
          .eq("company_id", company.id)
          .eq("status", "pending")
          .gte("expected_month", nextMonth.startDate)
          .lte("expected_month", nextMonth.endDate),

        // Unreviewed salesman flags
        supabase
          .from("salesman_flags")
          .select("id, owner_id, flag_type, flagged_at, details, reviewed")
          .eq("company_id", company.id)
          .eq("reviewed", false),

        // Bounce-backs — THIS calendar month, always. Exceptions are live
        // operational alerts, not historical figures: they must not shift when
        // someone selects a past quarter. Anchored to today, not to the range.
        supabase
          .from("bounce_back_logs")
          .select(
            "id, owner_id, opportunity_id, bounced_at, escalated, bounce_count"
          )
          .eq("company_id", company.id)
          .gte("bounced_at", todayMonth.startDate),

        // Contact reports this month
        supabase
          .from("contact_reports")
          .select(
            "id, deal_id, owner_id, contact_date, contact_type, customer_response, next_action, follow_up_date, is_audited, created_at"
          )
          .eq("company_id", company.id)
          .gte("created_at", todayMonth.startDate),

        // Unresolved escalations
        supabase
          .from("escalation_logs")
          .select(
            "id, trigger_type, triggered_for, triggered_by, deal_id, details, resolved, created_at"
          )
          .eq("company_id", company.id)
          .eq("resolved", false),

        // Sales returns in the selected window, joined to their deal for the
        // owner. Subtracted from Achieved by the shared rule.
        supabase
          .from("deal_returns")
          .select("id, deal_id, return_date, return_amount, deals!inner(owner_id, division_id)")
          .eq("company_id", company.id)
          .gte("return_date", monthStart)
          .lte("return_date", monthEnd),
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
        returns: (returnRows || []).map((r) => ({
          ...r,
          owner_id: r.deals?.owner_id ?? null,
          division_id: r.deals?.division_id ?? null,
        })),
        monthStart,
        monthEnd,
        now,
        isCurrentMonth,
        isAllTime,
      });
    } catch (e) {
      console.error("Coverage Console load failed:", e);
      setError(e?.message || "Failed to load console data");
    } finally {
      setLoading(false);
    }
  }, [company?.id, rangeStart, rangeEnd, isCurrentMonth, isAllTime]);

  useEffect(() => {
    if (!company?.id) return;
    fetchAll();
  }, [company?.id, fetchAll]);

  // ── HIERARCHY ──────────────────────────────────────────────────────────────
  // supervisor_id is a single edge, so a manager's real team is the whole
  // subtree beneath them (manager -> supervisors -> salesmen), not just direct
  // reports.
  //
  // This walked reports_to until 2026-09-28. Both columns exist on users, but
  // only supervisor_id is written — by every hierarchy write path and by every
  // RLS function — while reports_to is a one-time partial backfill nothing
  // maintains. Reading it here gave this console a different team from the
  // dashboards for the same manager. See utils/teamHierarchy.js.
  const childrenMap = useMemo(() => {
    // A TEAM subtree stays ACTIVE-ONLY (the other half of the 2026-10-07 rule).
    // The user rows now include people who have left, so this map is the only
    // thing keeping them out of a manager's or supervisor's scope.
    const map = new Map();
    (raw?.users || []).forEach((u) => {
      if (!u.supervisor_id || u.is_active === false) return;
      if (!map.has(u.supervisor_id)) map.set(u.supervisor_id, []);
      map.get(u.supervisor_id).push(u.id);
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
  const calcMetrics = calcCoverageMetrics;   // see utils/coverageConsoleMetrics.js

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
    const { flags, escalations, users, deals, now } = data;
    const exs = [];
    const teamOf = (ownerId) =>
      users.find((u) => u.id === ownerId)?.supervisor_id || null;

    // Won, not yet invoiced, stuck 7+ days — visibility only, never touches
    // Achieved. See wonNotInvoicedExceptions in utils/planningCalculations.js.
    wonNotInvoicedExceptions({ deals, ownerIds: userIds, now }).forEach((ex) => {
      exs.push({ ...ex, teamId: teamOf(ex.ownerId) });
    });

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

  // Combined coverage + pacing verdict. Outside the current month pacing is
  // null, so the status degrades to COVERAGE ONLY rather than silently treating
  // "no pacing verdict" as a failure — which would have turned every past month
  // amber. The header says which of the two is in force.
  const healthOf = (m) => {
    if (!m) return "risk";
    if (m.pacingOk === null) return m.coverageOk ? "ok" : "bad";
    return m.coverageOk && m.pacingOk
      ? "ok"
      : !m.coverageOk && !m.pacingOk
      ? "bad"
      : "risk";
  };

  const drillRows = (() => {
    if (nav.level === "company") {
      // Top tier only: managers own the teams, and supervisors nest inside
      // them when you drill in. Listing both tiers here would show the same
      // salesmen twice at different levels of aggregation.
      const teamHeads = raw.users.filter(
        (u) => scopedIds.includes(u.id) && u.is_active !== false && u.role === "manager"
      );

      // Flat hierarchy (supervisors reporting straight to a director, no
      // manager tier) — fall back to supervisors so the table is never empty.
      const effectiveTeamHeads =
        teamHeads.length > 0
          ? teamHeads
          : raw.users.filter(
              (u) => scopedIds.includes(u.id) && u.is_active !== false
                && u.role === "supervisor"
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
      // People rows: those who are still here. The team's TOTAL above may
      // include a departed member's figures; the list of people to drill into
      // does not list them.
      const members = raw.users.filter(
        (m) => subtreeOf(nav.team).includes(m.id) && m.is_active !== false
          && m.id !== nav.team
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

  // Same degradation as healthOf: coverage-only outside the current month, and
  // the label says so rather than letting "Healthy" quietly mean something
  // narrower than it did yesterday.
  const statusChip = (() => {
    if (!metrics) return null;
    const ok = metrics.pacingOk === null
      ? metrics.coverageOk
      : metrics.coverageOk && metrics.pacingOk;
    const bad = metrics.pacingOk === null
      ? !metrics.coverageOk
      : !metrics.coverageOk && !metrics.pacingOk;
    const suffix = metrics.pacingOk === null ? " (coverage only)" : "";
    if (ok) {
      return {
        text: `Healthy${suffix}`,
        cls: "bg-emerald-50 text-emerald-800 border-emerald-200",
      };
    }
    if (bad) {
      return { text: `Off Plan${suffix}`, cls: "bg-red-50 text-red-800 border-red-200" };
    }
    return { text: "At Risk", cls: "bg-amber-50 text-amber-800 border-amber-200" };
  })();

  // ── RENDER ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />

      {/* Console sub-header — sticks flush under the app Header (h-16 = 64px)
          so the breadcrumb stays reachable at any scroll position. */}
      <div className="sticky top-16 z-10 bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600 to-blue-800 flex items-center justify-center text-white font-bold text-xs">
              CC
            </div>
            <div>
              <span className="text-sm font-semibold text-gray-900">
                Coverage Console
              </span>
              {/* The selected period, shared with Planning and the dashboards.
                  This replaces the "This month only" chip: the page follows the
                  selector now, so the chip would be untrue. Day-of-month is
                  shown only while that is what is being measured. */}
              <span className="text-xs text-gray-500 ml-2 font-mono">
                {periodLabel}
                {isCurrentMonth && metrics?.dayOfMonth
                  ? ` · day ${metrics.dayOfMonth} of ${metrics.totalDays}`
                  : ""}
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

        {/* Period selector — the same DateRangeContext Planning and the
            dashboards use, so a period picked on one screen holds here. */}
        <div className="max-w-7xl mx-auto px-6 pb-3">
          <QuickDateSelector
            activeDateRange={{ from: rangeStart, to: rangeEnd }}
            onRangeChange={(r) => setRange({ from: r.from, to: r.to })}
          />
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
                  {/* Hidden, not substituted, whenever the selected period is
                      not the current month — pace and elapsed are null there. */}
                  {metrics.pacingOk !== null && (
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
                  )}
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
                  /* The drill-down reads the rows the metrics carry. This
                     screen is already scoped by its own level, so the panel
                     groups by person rather than by division. */
                  metrics={metrics}
                  users={raw?.users || []}
                  /* rangeEnd, not the fetch's local monthEnd: that one lives
                     inside the loader's scope. Same value, in scope here. */
                  monthEnd={rangeEnd}
                  scopeLabel={heroInfo?.title || ""}
                />
                {/* Pacing is a day-of-month verdict, so it is shown only while
                    the current month is what is selected. For any other period
                    it is hidden entirely rather than computed against a month
                    that has ended or not started. */}
                {isCurrentMonth ? (
                  <div className="mt-4">
                    <PacingRail
                      pace={metrics.pace}
                      elapsed={metrics.elapsed}
                      dayOfMonth={metrics.dayOfMonth}
                      totalDays={metrics.totalDays}
                      pctFmt={pctFmt}
                    />
                  </div>
                ) : (
                  <p className="mt-4 text-[11px] text-gray-500">
                    Pacing is measured against the days elapsed in the current
                    month, so it is not shown for {periodLabel}. Status above is
                    coverage only.
                  </p>
                )}
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
                  // Targets exist per month and the earliest are 2026, so an
                  // All Time target is a 2026 sum sitting beside an Achieved
                  // that spans everything. Every target-derived row is dropped
                  // for that range rather than shown as a false ratio.
                  ...(isAllTime
                    ? []
                    : [["Target", SAR(metrics.target) + " SAR", ""]]),
                  [
                    "Achieved",
                    SAR(metrics.invoiced) + " SAR",
                    isAllTime
                      ? "all time"
                      : metrics.pace !== null
                        ? (metrics.pace * 100).toFixed(1) + "% of target"
                        : periodLabel,
                    "pos",
                  ],
                  ...(isAllTime
                    ? []
                    : [[
                      "Gap to target",
                      SAR(metrics.remainingTarget) + " SAR",
                      "",
                      "neg",
                    ]]),
                  [
                    "Win rate",
                    (metrics.winRate * 100).toFixed(1) + "%",
                    "3-month average · to date",
                  ],
                  ...(isAllTime
                    ? []
                    : [[
                      "Required pipeline",
                      SAR(metrics.requiredPlan) + " SAR",
                      "gap to target ÷ win rate",
                    ]]),
                  ["Planned pipeline", SAR(metrics.planning) + " SAR", `open plan · ${periodLabel}`],
                  [
                    "Open funnel",
                    SAR(metrics.monthFunnel) + " SAR",
                    `open deals closing in ${periodLabel}`,
                  ],
                  ...(isAllTime
                    ? []
                    : [[
                      "New pipeline needed",
                      SAR(metrics.plannedGap) + " SAR",
                      "required − plan − funnel",
                      "neg",
                    ]]),
                  // Not netted off the requirement, and only meaningful while
                  // the current month is selected: "what is visible for next
                  // month" is a live forward-looking figure, not a property of
                  // a past quarter.
                  ...(isCurrentMonth
                    ? [[
                      "Future carry-in",
                      SAR(metrics.future) + " SAR",
                      "next month · not netted",
                    ]]
                    : []),
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
                        {/* "Coverage" was this screen's name for the same
                            covRatio the divisions panel called "Weighted
                            coverage". Both now use the one label and formula
                            from utils/salesDivisionMetrics. */}
                        {["Name", "Target", "Achieved", EXPECTED_PCT_LABEL, "Status"].map(
                          (h) => (
                            <th
                              key={h}
                              title={h === EXPECTED_PCT_LABEL ? EXPECTED_PCT_TOOLTIP : undefined}
                              className={`text-left px-4 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wide border-b border-gray-100${
                                h === EXPECTED_PCT_LABEL ? " cursor-help underline decoration-dotted" : ""
                              }`}
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
