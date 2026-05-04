import { supabase } from "../lib/supabase";

// ── Role scoping helper ──────────────────────────────────────────────────────

async function resolveOwnerIds(role, userId) {
  if (role === "salesman") return [userId];
  if (role === "supervisor") {
    const { data } = await supabase
      .from("users")
      .select("id")
      .eq("supervisor_id", userId)
      .eq("is_active", true);
    return [userId, ...(data || []).map((u) => u.id)];
  }
  return null; // manager / director / admin / head → no owner filter (all company data)
}

// ── Pipeline report ──────────────────────────────────────────────────────────

export async function getPipelineReport({ companyId, userId, role, dateFrom, dateTo }) {
  try {
    const ownerIds = await resolveOwnerIds(role, userId);

    let q = supabase
      .from("deals")
      .select(
        `id, title, amount, stage, priority, currency,
         created_at, closed_at, expected_close_date,
         contact:contacts(first_name, last_name, company_name),
         owner:users!owner_id(full_name, role)`,
      )
      .eq("company_id", companyId)
      .order("created_at", { ascending: false });

    if (dateFrom) q = q.gte("created_at", `${dateFrom}T00:00:00`);
    if (dateTo)   q = q.lte("created_at", `${dateTo}T23:59:59`);
    if (ownerIds) q = q.in("owner_id", ownerIds);

    const { data, error } = await q;
    return { data: data || [], error };
  } catch (error) {
    return { data: [], error };
  }
}

// ── Target report ────────────────────────────────────────────────────────────

export async function getTargetReport({ companyId, userId, role, dateFrom, dateTo }) {
  try {
    let q = supabase
      .from("sales_targets")
      .select(
        `id, target_amount, period_start, period_end, status, target_type,
         assignee:assigned_to(id, full_name, email, role),
         assigner:assigned_by(id, full_name, email)`,
      )
      .eq("company_id", companyId)
      .order("period_start", { ascending: false });

    if (dateFrom) q = q.gte("period_start", dateFrom);
    if (dateTo)   q = q.lte("period_end",   dateTo);
    if (role === "salesman") q = q.eq("assigned_to", userId);

    const { data, error } = await q;
    return { data: data || [], error };
  } catch (error) {
    return { data: [], error };
  }
}

// ── Leaderboard ──────────────────────────────────────────────────────────────

export async function getLeaderboard({ companyId, dateFrom, dateTo }) {
  try {
    let wonQ = supabase
      .from("deals")
      .select(`id, amount, owner_id, owner:users!owner_id(id, full_name, email)`)
      .eq("company_id", companyId)
      .eq("stage", "won");

    if (dateFrom) wonQ = wonQ.gte("closed_at", `${dateFrom}T00:00:00`);
    if (dateTo)   wonQ = wonQ.lte("closed_at", `${dateTo}T23:59:59`);

    const { data: wonDeals, error } = await wonQ;
    if (error) return { data: [], error };

    // Closed deals for win-rate denominator
    let closedQ = supabase
      .from("deals")
      .select("owner_id, stage")
      .eq("company_id", companyId)
      .in("stage", ["won", "lost"]);

    if (dateFrom) closedQ = closedQ.gte("created_at", `${dateFrom}T00:00:00`);
    if (dateTo)   closedQ = closedQ.lte("created_at", `${dateTo}T23:59:59`);

    const { data: closedDeals } = await closedQ;

    // Aggregate by owner
    const map = {};
    (wonDeals || []).forEach((d) => {
      const id = d.owner_id;
      if (!map[id]) {
        map[id] = { id, name: d.owner?.full_name || "—", revenue: 0, dealCount: 0, closed: 0 };
      }
      map[id].revenue += parseFloat(d.amount || 0);
      map[id].dealCount++;
    });
    (closedDeals || []).forEach((d) => {
      if (map[d.owner_id]) map[d.owner_id].closed++;
    });

    const data = Object.values(map)
      .sort((a, b) => b.revenue - a.revenue)
      .map((o, i) => ({
        rank:      i + 1,
        name:      o.name,
        revenue:   o.revenue,
        dealCount: o.dealCount,
        winRate:   o.closed > 0 ? Math.round((o.dealCount / o.closed) * 100) : 100,
      }));

    return { data, error: null };
  } catch (error) {
    return { data: [], error };
  }
}

// ── Activity report ──────────────────────────────────────────────────────────

export async function getActivityReport({ companyId, userId, role, dateFrom, dateTo }) {
  try {
    const ownerIds = await resolveOwnerIds(role, userId);

    let q = supabase
      .from("activities")
      .select(
        `id, type, title, description, created_at, status,
         deal:deal_id(id, title, stage),
         user:owner_id(id, full_name, email)`,
      )
      .eq("company_id", companyId)
      .order("created_at", { ascending: false });

    if (dateFrom) q = q.gte("created_at", `${dateFrom}T00:00:00`);
    if (dateTo)   q = q.lte("created_at", `${dateTo}T23:59:59`);
    if (ownerIds) q = q.in("owner_id", ownerIds);

    const { data, error } = await q;
    return { data: data || [], error };
  } catch (error) {
    return { data: [], error };
  }
}
