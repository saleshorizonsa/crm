import { supabase } from "../lib/supabase";

// Reassign Records — moving a person's open work to someone else, typically
// before they are deactivated.
//
// Three rules shape everything in here:
//
// 1. PLAIN UPDATE, NEVER UPSERT. An upsert runs as INSERT ... ON CONFLICT, and
//    the INSERT policy's WITH CHECK is evaluated against a candidate row first.
//    That exact trap took deal saves down in production on 2026-09-13.
//
// 2. COUNT WHAT ACTUALLY MOVED. When an UPDATE policy's USING clause rejects a
//    row, PostgREST returns no error — the row is simply not updated. Every
//    update therefore asks for the ids back (.select("id")) and compares them
//    with the ids requested; the difference is reported, never assumed away.
//
// 3. ONLY MOVE WHAT STILL BELONGS TO THE FROM-USER. Each update is filtered on
//    owner_id = from, so a record reassigned or edited by someone else between
//    loading the screen and pressing Apply is left alone and shows as skipped.

// Who may use the tool. Supervisors are excluded: this is a Sales Manager action.
export const REASSIGN_ROLES = ["manager", "director", "head", "admin"];
const COMPANY_WIDE_ROLES = ["director", "head", "admin"];
// Who records may be moved TO.
const TARGET_ROLES = ["salesman", "supervisor"];

/**
 * The people this actor may reassign from and to.
 *
 * A manager's scope is his whole supervisor_id subtree. That is the column every
 * RLS function (can_manage_user_contacts, get_user_subordinates) resolves the
 * hierarchy through, so a target outside this list would be refused by the
 * UPDATE policy anyway — offering it would only produce a silent no-op.
 *
 * FROM includes INACTIVE people: the tool has to keep working for someone
 * already deactivated. The walk therefore runs over all users, so a deactivated
 * supervisor does not cut his own team out of the manager's scope.
 * TO is active salesmen and supervisors.
 *
 * The actor appears in BOTH lists — they may hand off records they own, and may
 * take records over themselves — but only when they belong to this company. An
 * admin or director viewing another company is not listed there, so records are
 * never moved to an owner that company's own screens (which scope by the
 * company's users) would not show.
 *
 * RLS permits both self-cases through the owner_id = auth.uid() branch of the
 * UPDATE policy, independent of can_manage_user_contacts(): taking a record
 * over, the new row's owner is the actor; handing one off, the old row's is.
 */
export async function fetchReassignScope({ companyId, actorId, actorRole }) {
  if (!companyId || !actorId) return { fromUsers: [], toUsers: [], error: null };
  const { data, error } = await supabase
    .from("users")
    .select("id, full_name, role, is_active, supervisor_id")
    .eq("company_id", companyId)
    .order("full_name");
  if (error) return { fromUsers: [], toUsers: [], error };

  const users = data || [];
  const self = users.find((u) => u.id === actorId) || null;
  let scope;
  if (COMPANY_WIDE_ROLES.includes(actorRole)) {
    scope = users.filter((u) => u.role !== "viewer");
  } else {
    const childrenOf = new Map();
    users.forEach((u) => {
      if (!u.supervisor_id) return;
      if (!childrenOf.has(u.supervisor_id)) childrenOf.set(u.supervisor_id, []);
      childrenOf.get(u.supervisor_id).push(u);
    });
    scope = [];
    const seen = new Set([actorId]); // guards against a cyclic supervisor_id chain
    const queue = [actorId];
    while (queue.length) {
      for (const child of childrenOf.get(queue.shift()) || []) {
        if (seen.has(child.id)) continue;
        seen.add(child.id);
        scope.push(child);
        queue.push(child.id);
      }
    }
    if (self) scope.push(self);
    scope.sort((a, b) => (a.full_name || "").localeCompare(b.full_name || ""));
  }

  return {
    fromUsers: scope,
    toUsers: scope.filter(
      (u) => u.is_active && (TARGET_ROLES.includes(u.role) || u.id === actorId),
    ),
    error: null,
  };
}

/**
 * Everything still open that this person owns.
 *
 * Contacts are NOT filtered by company_id: owned contacts carry company_id NULL
 * in this database (only unassigned imports are stamped), so a company filter
 * would hide every one of them. They are company-scoped through their owner.
 */
export async function fetchOwnedRecords({ companyId, ownerId }) {
  const empty = { deals: [], opportunities: [], contacts: [], futureOrders: [] };
  if (!companyId || !ownerId) return { ...empty, errors: {} };

  const [deals, opportunities, contacts, futureOrders] = await Promise.all([
    supabase
      .from("deals")
      .select("id, title, amount, currency, stage, expected_close_date, contact_id, contact:contacts!contact_id(company_name)")
      .eq("company_id", companyId)
      .eq("owner_id", ownerId)
      .not("stage", "in", "(won,lost)")
      .order("amount", { ascending: false }),
    supabase
      .from("opportunities")
      .select("id, customer_name, planned_amount, expected_month, material_group")
      .eq("company_id", companyId)
      .eq("owner_id", ownerId)
      .eq("status", "open")
      .order("expected_month", { ascending: true }),
    supabase
      .from("contacts")
      .select("id, first_name, last_name, company_name, customer_type, status")
      .eq("owner_id", ownerId)
      .order("company_name", { ascending: true }),
    supabase
      .from("future_orders")
      .select("id, customer_name, planned_amount, expected_month")
      .eq("company_id", companyId)
      .eq("owner_id", ownerId)
      .eq("status", "pending")
      .order("expected_month", { ascending: true }),
  ]);

  return {
    deals: deals.data || [],
    opportunities: opportunities.data || [],
    contacts: contacts.data || [],
    futureOrders: futureOrders.data || [],
    errors: {
      deals: deals.error || null,
      opportunities: opportunities.error || null,
      contacts: contacts.error || null,
      futureOrders: futureOrders.error || null,
    },
  };
}

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
const roleLabel = (role) => (role ? role.charAt(0).toUpperCase() + role.slice(1) : "Manager");

/**
 * Move the selected records from one person to another, then record it.
 *
 * Not transactional across tables — each table is its own UPDATE — so the
 * result reports, per table, exactly which ids moved. Side effects (audit
 * entries, the notification, the log) are written only for what moved, and
 * each reports its own failure instead of being swallowed: supabase-js returns
 * errors rather than throwing, and a discarded error is how the notifications
 * RLS gap stayed invisible for months.
 *
 * @param {object}   p
 * @param {string}   p.companyId
 * @param {object}   p.actor     { id, full_name, role }
 * @param {object}   p.fromUser  { id, full_name }
 * @param {object}   p.toUser    { id, full_name }
 * @param {object}   p.selection { deals, opportunities, contacts, futureOrders } — arrays of ids
 * @param {object[]} p.dealRows  loaded deal rows, for audit-entry labels
 */
export async function applyReassignment({ companyId, actor, fromUser, toUser, selection, dealRows = [] }) {
  const now = new Date().toISOString();

  const move = async (table, ids, extra, { companyScoped = true } = {}) => {
    if (!ids?.length) return { requested: 0, moved: [], error: null };
    let query = supabase
      .from(table)
      .update({ owner_id: toUser.id, updated_at: now, ...extra })
      .in("id", ids)
      .eq("owner_id", fromUser.id);
    if (companyScoped) query = query.eq("company_id", companyId);
    const { data, error } = await query.select("id");
    return { requested: ids.length, moved: (data || []).map((r) => r.id), error: error || null };
  };

  // Sequential, so a failure part-way leaves an exact, reportable picture.
  const deals        = await move("deals", selection.deals);
  const opportunities = await move("opportunities", selection.opportunities);
  const futureOrders = await move("future_orders", selection.futureOrders);
  // Mirrors Customer Master's bulk assign, which stamps who assigned and when.
  const contacts     = await move(
    "contacts",
    selection.contacts,
    { assigned_by: actor.id, assigned_at: now },
    { companyScoped: false },
  );

  const result = {
    deals, opportunities, futureOrders, contacts,
    audit: { written: 0, error: null },
    log: { id: null, error: null },
    notification: { sent: false, error: null },
  };

  const totalMoved =
    deals.moved.length + opportunities.moved.length + futureOrders.moved.length + contacts.moved.length;
  if (totalMoved === 0) return result;

  const role = roleLabel(actor.role);

  // Audit entry on every deal that moved — the same pattern as a manager editing
  // someone else's deal. The activities INSERT policy is owner_id = auth.uid(),
  // so the entry belongs to the person who acted.
  if (deals.moved.length) {
    const byId = new Map(dealRows.map((d) => [d.id, d]));
    const rows = deals.moved.map((id) => {
      const d = byId.get(id) || {};
      const label = d.title || d.contact?.company_name || "this deal";
      // "Reassigned to Mohamed Kamal by Mohamed Kamal" reads like an error; when
      // the actor takes the record themselves, say so.
      const takenOver = toUser.id === actor.id;
      return {
        type: "note",
        title: takenOver
          ? `Taken over from ${fromUser.full_name} by ${actor.full_name} (${role})`
          : `Reassigned to ${toUser.full_name} by ${actor.full_name} (${role})`,
        description: takenOver
          ? `${actor.full_name} (${role}) took over "${label}" from ${fromUser.full_name}.`
          : `${actor.full_name} (${role}) reassigned "${label}" from ${fromUser.full_name} to ${toUser.full_name}.`,
        company_id: companyId,
        deal_id: id,
        contact_id: d.contact_id || null,
        owner_id: actor.id,
      };
    });
    const { error } = await supabase.from("activities").insert(rows);
    result.audit = { written: error ? 0 : rows.length, error: error || null };
  }

  const skipped = {};
  [["deals", deals], ["opportunities", opportunities], ["future_orders", futureOrders], ["contacts", contacts]]
    .forEach(([k, r]) => { if (r.requested > r.moved.length) skipped[k] = r.requested - r.moved.length; });

  const { data: logRow, error: logError } = await supabase
    .from("reassignment_logs")
    .insert({
      company_id: companyId,
      performed_by: actor.id,
      from_user_id: fromUser.id,
      to_user_id: toUser.id,
      deal_ids: deals.moved,
      opportunity_ids: opportunities.moved,
      contact_ids: contacts.moved,
      future_order_ids: futureOrders.moved,
      skipped,
    })
    .select("id")
    .single();
  result.log = { id: logRow?.id || null, error: logError || null };

  // One summary notification to the new owner, not one per record — skipped when
  // the actor took the records themselves, since there is nobody to tell.
  if (toUser.id === actor.id) {
    result.notification = { sent: false, skipped: true, error: null };
    return result;
  }
  const parts = [
    deals.moved.length && plural(deals.moved.length, "deal"),
    opportunities.moved.length && plural(opportunities.moved.length, "opportunity").replace("opportunitys", "opportunities"),
    futureOrders.moved.length && plural(futureOrders.moved.length, "future order"),
    contacts.moved.length && plural(contacts.moved.length, "contact"),
  ].filter(Boolean);
  const { error: notifyError } = await supabase.from("notifications").insert({
    user_id: toUser.id,
    company_id: companyId,
    type: "records_reassigned",
    title: "📋 Records Assigned to You",
    message: `${actor.full_name} assigned you ${parts.join(", ")} previously owned by ${fromUser.full_name}.`,
    is_read: false,
    metadata: {
      reassignment_log_id: logRow?.id || null,
      from_user_id: fromUser.id,
      actor_id: actor.id,
      deal_count: deals.moved.length,
      opportunity_count: opportunities.moved.length,
      future_order_count: futureOrders.moved.length,
      contact_count: contacts.moved.length,
    },
  });
  result.notification = { sent: !notifyError, error: notifyError || null };

  return result;
}
