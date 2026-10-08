import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from 'lib/supabase';
import { useAuth } from 'contexts/AuthContext';
import { useCurrency } from 'contexts/CurrencyContext';
import Icon from 'components/AppIcon';
import SalesmanSelector from 'components/ui/SalesmanSelector';
import DivisionPicker from 'components/DivisionPicker';
import { fetchTeamHierarchy } from 'utils/teamHierarchy';
import { addRecordOwners, withRecordOwners } from 'utils/recordOwners';
import { blockIfPlanLocked, blockIfPlanNotApproved, planMonthForDate } from 'utils/planApproval';
import { fetchOpenFunnel } from 'utils/openFunnel';
import { monthBoundsOf } from 'utils/planMonths';
import {
  fetchContributors,
  fetchMonthlyTargets,
  fetchAchieved,
  fetchAchievedOnlyUsers,
  targetPerPerson,
  monthBounds,
} from 'utils/planningCalculations';
import { matchesGroup, fetchPlannedOpen, openPlanTotal } from 'utils/planningPageSummary';
import { dealService } from 'services/supabaseService';

const DIRECTOR_ROLES = ['director', 'head', 'admin'];
const TEAM_ROLES     = ['manager', 'supervisor'];

const STATUS_FILTERS = [
  { id: 'all',       label: 'All'       },
  { id: 'open',      label: 'Open'      },
  { id: 'converted', label: 'Converted' },
  { id: 'won',       label: 'Won'       },
  { id: 'lost',      label: 'Lost'      },
];

// Stage colour for the linked deal badge
const STAGE_COLOR = {
  lead:          '#3B82F6',
  contact_made:  '#8B5CF6',
  proposal_sent: '#F59E0B',
  negotiation:   '#EF4444',
  won:           '#059669',
  lost:          '#6B7280',
};

/** Why each flag is on a row — the sentence a reader needs, not the rule name. */
const PLAN_FLAG_WHY = {
  'NOT CONVERTED': 'Still open with a week or less left in the month. Nobody has turned it into a deal, so it will not convert into anything.',
  DUPLICATE: 'Somebody else has this customer in their plan for the same month. Two people calling one customer is work done twice.',
  'NO HISTORY': 'This customer has never been invoiced. Not wrong in itself, but a plan made only of these is a plan of hope.',
  'ABOVE USUAL': 'Planned at more than twice what this customer usually buys in a month they buy.',
};

const emptyForm = (month) => ({
  customer_name:  '',
  customer_type:  'existing',
  contact_id:     '',
  planned_amount: '',
  material_group: '',
  expected_month: month,
  notes:          '',
  // null until DivisionPicker reports the owner's primary — or stays null for
  // the great majority, who belong to one division and never see the picker.
  division_id:    null,
});

export default function OpportunitiesModule({
  adminCompany,
  onOpportunityChange,
  // The period the page is showing. The plan is a monthly artifact, so the list
  // and every number on this tab are bounded by it instead of always reading the
  // real-world current month.
  periodStart,
  periodEnd,
  // The month this page is planning (the page's activeMonthKey). It governs the
  // edit lock AND the "Monthly Target" card, both of which are about one month.
  // Defaults to undefined so blockIfPlanLocked falls back to the current month,
  // exactly as before, and the target falls back to the period's own month.
  planMonth,
  // Both filters are owned by the page, because the summary cards above this tab
  // follow them too. Controlled here, stored there.
  filterOwner = 'all',
  onFilterOwnerChange,
  // True when the owner filter points at somebody else's plan. Computed by the
  // page and passed down, rather than re-derived here, so there is one rule
  // behind the read-only chip, the removed submit button and the Add action.
  isViewingOther = false,
  filterProductGroup = null,
  onFilterProductGroupChange,
  productGroups = [],
  // THE GAP CLOSER'S ONE ACTION. A suggestion arrives here as
  // { customer, value, contactId } and opens the normal add form with those
  // fields filled in — the person still confirms, and nothing is written until
  // they do. The page clears it through onPrefillConsumed so re-opening the
  // panel does not reopen the form.
  prefill = null,
  onPrefillConsumed,
  // The health flags, computed once by the page for the whole scope:
  // customer key → flag list. Passed in rather than computed per row so the
  // list, the panel and the chips cannot disagree about what is wrong.
  flagsByItemId = null,
}) {
  const { user, company: authCompany, userProfile } = useAuth();
  const { formatCurrency } = useCurrency();

  const company = adminCompany || authCompany;
  const role    = userProfile?.role;
  const isDirector = DIRECTOR_ROLES.includes(role);
  const isTeamLead = TEAM_ROLES.includes(role);

  const setFilterOwner = onFilterOwnerChange || (() => {});

  // An opportunity is only modifiable by the person who owns it.
  //
  // This is the per-ROW form of the read-only rule and it subsumes the
  // per-FILTER one: with the filter on one subordinate every row is theirs, so
  // every row is locked out — but it also covers the "All Salesmen" view, where
  // a lead sees the whole team's rows mixed together and `isViewingOther` is
  // false because no single person is selected.
  //
  // This remains the rule for ADD, DELETE and CONVERT. EDIT now has one
  // exception on top of it — see canEditRow below.
  const isOwnRow = (opp) => !!user?.id && opp?.owner_id === user.id;

  // The shared date selector's range. NOTHING ON THIS TAB READS IT ANY MORE.
  //
  // Its only remaining job is to name a fallback month for targetMonth below,
  // for the case where the page does not pass planMonth. Every figure and every
  // query on this tab is about ONE month — the month being planned — so a
  // selector that can span a quarter or a year has nothing to say here. It is
  // still rendered by the page, because the dashboards share it.
  //
  // If you are adding something to this tab, it almost certainly wants
  // targetMonth, not this.
  const period = useMemo(() => {
    if (periodStart && periodEnd) return { start: periodStart, end: periodEnd };
    const mb = monthBounds();
    return { start: mb.startDate, end: mb.endDate };
  }, [periodStart, periodEnd]);

  // THE month this tab is about: the one being planned. Everything here is
  // scoped to it — the opportunity list, Total Planned, Still Unplanned, Monthly
  // Target, Achieved and In Funnel — so the five cards and the rows beneath them
  // always describe the same month, and Remaining subtracts like for like.
  //
  // All of these used to follow `period`, the shared selector, with a different
  // consequence each time:
  //   target    fetchMonthlyTargets matches any row OVERLAPPING the window, so a
  //             year-long selection summed Jan-Oct and labelled it a MONTHLY
  //             target: 12,808,589.56 for Kamal where October alone is 3,701,000.
  //   achieved  a year of invoiced revenue came off one month's target.
  //   funnel    defaulted to the WALL-CLOCK month, so a late September plan in
  //             the grace window sat beside October's funnel.
  //   list      a multi-month selection mixed several months' rows, and
  //             totalPlanned under them described no particular month.
  //
  // planMonth is the page's activeMonthKey. The fallback is only for a caller
  // that does not supply one.
  const targetMonth = useMemo(() => {
    const key = planMonth || `${String(period.start).slice(0, 7)}-01`;
    return monthBoundsOf(key);
  }, [planMonth, period.start]);

  // A new opportunity defaults to the month being planned, which is also the only
  // month the list shows — so a row added here cannot be filed into a month where
  // it would be invisible the moment it saved.
  const currentMonth = targetMonth.start;

  const [opportunities, setOpportunities] = useState([]);
  const [loading, setLoading]             = useState(true);
  const [loadError, setLoadError]         = useState(null);
  const [monthlyTarget, setMonthlyTarget] = useState(0);
  // Does anyone in scope actually hold a monthly target row? "No target" and
  // "target of 0" look identical in a number but mean opposite things here.
  const [hasTargetRows, setHasTargetRows] = useState(false);
  // In Funnel = raw value of every OPEN deal in scope (not won/lost), unweighted —
  // the same figure the KPI strip shows, so the two views cannot disagree.
  const [funnelValue, setFunnelValue] = useState(0);
  // This month's Achieved for the same scope (invoiced won deals, final value).
  const [achievedThisMonth, setAchievedThisMonth] = useState(0);
  const [contacts, setContacts]           = useState([]);
  const [teamMembers, setTeamMembers]     = useState([]);
  // Owners of opportunities loaded under "All" — selector only (utils/recordOwners).
  const [recordOwners, setRecordOwners]   = useState([]);
  const [saving, setSaving]               = useState(false);

  const [filterStatus, setFilterStatus] = useState('all');

  const [showModal, setShowModal]   = useState(false);
  // Which flag the list is narrowed to, or null for everything. A chip, not a
  // dropdown: there are four flags and the question is always "show me the
  // broken ones".
  const [flagFilter, setFlagFilter] = useState(null);
  const [editingOpp, setEditingOpp] = useState(null);
  const [form, setForm]             = useState(() => emptyForm(currentMonth));

  // ── Manager edit during review ────────────────────────────────────────────
  // The owners (other than the viewer) whose plan for the month on screen is
  // SUBMITTED and still PENDING — the window in which the manager is deciding
  // whether to approve or reject, and the only window in which he may change
  // somebody else's numbers.
  //
  // A set of ids rather than a per-row lookup: the gate is consulted during
  // render for every row's Edit button, which must not await anything.
  //
  // Any failure leaves the set EMPTY, which means read-only. This grants a
  // capability, so it fails closed — the opposite of the plan lock, which fails
  // open so a missing row can never shut someone out of their own plan.
  const [reviewOwners, setReviewOwners] = useState(() => new Set());

  // Only the 'manager' role, as specified. Note this is NOT the same set as the
  // people who can actually approve a plan: resolveApprover() routes by
  // supervisor_id, so a SUPERVISOR is the real reviewer for the salesmen under
  // him and does not get this exception. Widening it to TEAM_ROLES is a one-word
  // change here if that turns out to be wanted.
  const isManagerReviewer = role === 'manager';

  // ── Owner scope for the target calculation ────────────────────────────────
  // "All" for a manager or supervisor means THEIR TEAM INCLUDING THEMSELVES —
  // the same scope fetchOpportunities() below already uses ([user.id, ...team]).
  // This used to be the downline alone, so a team lead's own records were listed
  // in the plan while being left out of every number computed from this scope:
  // supervisor Alseyed Diba saw In Funnel 0.00 with 1,510,602.80 of his own open
  // deals, and his own monthly target never counted either (Amer was short
  // 501,088, Kamal 152,500).
  const ownerScope = useMemo(() => {
    if (filterOwner !== 'all') return [filterOwner];
    if (isDirector || isTeamLead) {
      const ids = [user?.id, ...teamMembers.map((m) => m.id)].filter(Boolean);
      return [...new Set(ids)];
    }
    return [user?.id].filter(Boolean);
  }, [filterOwner, isDirector, isTeamLead, teamMembers, user?.id]);

  // ── Fetch: monthly target ─────────────────────────────────────────────────
  // The one shared rule (utils/planningCalculations.js): this month's ACTIVE
  // MONTHLY rows for CONTRIBUTORS, then per person per month take total_value
  // when present else by_clients, never by_products.
  //
  // What this replaced took the MAX across every target type with no
  // period_type filter, so a manager's YEARLY roll-up row leaked in and the
  // tab reported a 43,749,224 monthly target against a real 2,300,494 — which
  // also pinned planningPct to ~0% and isUnderPlanned permanently true. The
  // window was built from toISOString() as well, pulling in the previous
  // month's rows (the same bleed fixed in the Coverage Console).
  // Whose numbers this scope covers: contributors, plus any flagged manager who
  // sells himself — the scope Target and Achieved now share everywhere else.
  //
  // With ONE person explicitly selected, that person is used even if the
  // narrowing would drop them. Picking a single name is a deliberate act: a
  // manager choosing himself or a director meant that person, not "nobody".
  // Before this, such a pick left the scope empty and the tile silently read 0 —
  // indistinguishable from a real zero target, and shown as "Fully Planned ✓".
  const resolveScopeIds = useCallback(async (ids) => {
    if (!company?.id || !ids?.length) return [];
    const [contributors, flagged] = await Promise.all([
      fetchContributors({ companyId: company.id, ownerIds: ids }),
      fetchAchievedOnlyUsers({ companyId: company.id, ownerIds: ids }),
    ]);
    const scopeIds = [...new Set([...contributors.map((c) => c.id), ...flagged.map((u) => u.id)])];
    if (scopeIds.length) return scopeIds;
    return ids.length === 1 ? [...ids] : [];
  }, [company?.id]);

  const fetchTarget = useCallback(async (ids) => {
    if (!company?.id || !ids?.length) { setMonthlyTarget(0); setHasTargetRows(false); return; }

    const scopeIds = await resolveScopeIds(ids);
    if (!scopeIds.length) { setMonthlyTarget(0); setHasTargetRows(false); return; }

    // targetMonth, NOT period: fetchMonthlyTargets matches any monthly row that
    // overlaps the window, so a multi-month selection would sum several months
    // into a figure labelled "Monthly Target".
    const rows = await fetchMonthlyTargets({
      companyId: company.id,
      contributorIds: scopeIds,
      start: targetMonth.start,
      end: targetMonth.end,
    });
    // Whether a target EXISTS is its own fact, separate from its value. Nobody
    // in scope holding a target row reads "No target assigned" rather than
    // "Fully Planned ✓" — which is what a plan against a 0 target used to claim,
    // for salesmen with no target row as much as for a picked manager.
    setHasTargetRows(rows.length > 0);
    setMonthlyTarget(
      Object.values(targetPerPerson(rows)).reduce((sum, v) => sum + v, 0),
    );
  }, [company?.id, resolveScopeIds, targetMonth.start, targetMonth.end]);

  // ── Fetch: In Funnel + this month's Achieved ──────────────────────────────
  // In Funnel is the raw open-deal value for the scope — the same query and the
  // same unweighted definition as the KPI strip's funnel figure
  // (utils/kpiStripData.js), so Planning and the dashboards agree. Achieved comes
  // from the one shared rule. BOTH are scoped to the planned month, which is also
  // what the target above uses, so all three figures behind Remaining describe
  // the same month.
  const fetchFunnelAndAchieved = useCallback(async (ids) => {
    if (!company?.id || !ids?.length) { setFunnelValue(0); setAchievedThisMonth(0); return; }

    // The same scope as the target above, so In Funnel, Remaining and Monthly
    // Target always describe the same people — including a single explicit pick
    // that the contributor narrowing would otherwise drop.
    const scopeIds = await resolveScopeIds(ids);
    if (!scopeIds.length) { setFunnelValue(0); setAchievedThisMonth(0); return; }

    // utils/openFunnel.js is the one definition of "funnel" — see the note there
    // for the three figures this replaced. The scope is already narrowed, so it
    // is handed over rather than resolved twice.
    //
    // The window is targetMonth, like the target and Achieved below. Left to its
    // default, fetchOpenFunnel uses the WALL-CLOCK month, which is only the right
    // answer while the planned month happens to be the current one: in the grace
    // window a late September plan would show September's target and September's
    // Achieved beside OCTOBER's funnel.
    //
    // Note this means undated open deals (INCLUDE_UNDATED, openFunnel.js) count
    // toward whichever month is on screen — they are dated to no month, so they
    // belong to the one being planned.
    const funnel = await fetchOpenFunnel({
      companyId: company.id,
      scopeIds,
      start: targetMonth.start,
      end: targetMonth.end,
    });
    setFunnelValue(funnel.total);

    // resolveScopeIds already folded in any flagged achieved-only manager, so
    // there is no second users lookup here any more.
    //
    // targetMonth, the same window the target uses. Remaining subtracts Achieved
    // from the target, so the two have to describe the same month or the
    // subtraction is between different spans: with the selector on This Year it
    // took a YEAR of invoiced revenue off ONE month's target and drove Remaining
    // to 0 (Kamal: 2,551,340.28 against a 3,701,000 October target).
    const { total } = await fetchAchieved({
      companyId: company.id,
      contributorIds: scopeIds,
      start: targetMonth.start,
      end: targetMonth.end,
    });
    setAchievedThisMonth(total);
  }, [company?.id, resolveScopeIds, targetMonth.start, targetMonth.end]);

  // ── Fetch: opportunities ──────────────────────────────────────────────────
  const fetchOpportunities = useCallback(async () => {
    if (!company?.id) return;
    setLoading(true);
    setLoadError(null);
    try {
      let query = supabase
        .from('opportunities')
        .select(`
          id, customer_name, customer_type, planned_amount, material_group,
          expected_month, notes, status, deal_id, converted_at, created_at, division_id,
          contact_id, owner_id, bounce_count, last_bounced_at, is_replacement, replaces_deal_id,
          owner:users!owner_id(id, full_name, role, is_active),
          contact:contacts!contact_id(id, first_name, last_name, company_name),
          deal:deals!deal_id(id, title, stage, amount)
        `)
        .eq('company_id', company.id)
        // The Current Sales Plan is the plan for ONE month, and that month is the
        // one being PLANNED — not whatever the shared date selector happens to
        // hold. A month bound was always the intent here; it was bound to the
        // selector, so a multi-month selection put it straight back into the state
        // this was written to prevent: July, August and September rows in one
        // list, with totals under them describing no particular month.
        //
        // Browsing several months at once from this tab is therefore gone, by
        // intent. Switching plan months (September <-> October) is the way to look
        // at another month.
        //
        // Rows whose expected_month is in a future month are not orphaned by
        // this: they appear when that month is selected. The Future Orders tab
        // remains the route for parking a deal in a later month (it creates the
        // opportunity when the month arrives, carrying expected_month across).
        .gte('expected_month', targetMonth.start)
        .lte('expected_month', targetMonth.end)
        .order('created_at', { ascending: false });

      if (!isDirector && !isTeamLead) {
        query = query.eq('owner_id', user?.id);      // salesman → own only
      } else if (filterOwner !== 'all') {
        query = query.eq('owner_id', filterOwner);   // drilled into one salesman
      } else if (isTeamLead) {
        // manager/supervisor "All" → their own team only (self + direct reports)
        const ids = [user?.id, ...teamMembers.map((m) => m.id)].filter(Boolean);
        query = query.in('owner_id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000']);
      }
      // director/admin/head "All" → whole company (no owner filter)
      if (filterStatus !== 'all') query = query.eq('status', filterStatus);

      const { data, error } = await query;
      if (error) throw error;
      // Product group is matched here rather than in the query because the
      // values are free text: "PVC PIPE AND FITTING", "pvc pipe and fitting" and
      // "PVC pipe and Fitting" are one group, and only a normalised comparison
      // treats them as one. Rows with no group at all are left out while a group
      // is selected — they belong to no group, not to every group.
      const rows = filterProductGroup
        ? (data || []).filter((o) => o.material_group && matchesGroup(o.material_group, filterProductGroup))
        : (data || []);
      setOpportunities(rows);
      if (filterOwner === 'all') setRecordOwners((prev) => addRecordOwners(prev, data));
    } catch (err) {
      console.error('fetchOpportunities:', err);
      setLoadError(err?.message || 'Could not load opportunities.');
      setOpportunities([]);
    } finally {
      setLoading(false);
    }
  }, [company?.id, isDirector, isTeamLead, user?.id, filterOwner, filterStatus, teamMembers,
      targetMonth.start, targetMonth.end, filterProductGroup]);

  // ── Fetch: contacts + team ────────────────────────────────────────────────
  // Contacts are scoped by OWNER, not company: contacts.company_id is null in
  // this database and the real company link is the owner (users.company_id), so
  // a salesman sees their own customers and a director/team lead sees the team's.
  const fetchSupport = useCallback(async () => {
    if (!company?.id) return;

    // 1) Team members (feeds the salesman drill-down). Director/admin/head see
    //    the whole company; manager/supervisor see their FULL downline (direct
    //    reports plus every salesman/supervisor recursively beneath them).
    const team = (isDirector || isTeamLead)
      ? await fetchTeamHierarchy({ companyId: company.id, userId: user?.id, role })
      : [];
    setTeamMembers(team);

    // 2) Contacts scoped to the visible owner set.
    const ownerIds = (isDirector || isTeamLead)
      ? Array.from(new Set([user?.id, ...team.map((m) => m.id)].filter(Boolean)))
      : [user?.id].filter(Boolean);

    let cq = supabase
      .from('contacts')
      .select('id, first_name, last_name, company_name')
      .order('company_name');
    if (ownerIds.length) cq = cq.in('owner_id', ownerIds);

    const { data: contactData, error: contactErr } = await cq;
    if (contactErr) console.error('fetchContacts:', contactErr);
    setContacts(contactData || []);
  }, [company?.id, isDirector, isTeamLead, user?.id, role]);

  // Declared before the fetches so a company switch clears first, then refills.
  useEffect(() => { setRecordOwners([]); }, [company?.id, user?.id]);
  useEffect(() => { fetchSupport(); }, [fetchSupport]);
  useEffect(() => { fetchOpportunities(); }, [fetchOpportunities]);

  // The drill-down list: team plus owners of loaded records. Scope queries above
  // keep using teamMembers.
  const selectorMembers = useMemo(
    () => withRecordOwners(teamMembers, recordOwners),
    [teamMembers, recordOwners],
  );
  useEffect(() => { fetchTarget(ownerScope); }, [fetchTarget, ownerScope]);
  useEffect(() => { fetchFunnelAndAchieved(ownerScope); }, [fetchFunnelAndAchieved, ownerScope]);

  // Which of the owners on screen are mid-review. Keyed off the loaded rows
  // rather than the team, so it asks about exactly the people whose Edit buttons
  // are about to be rendered, and off targetMonth, so switching plan months
  // re-asks for that month.
  //
  // Only a manager has the exception, so nobody else pays for the query.
  useEffect(() => {
    if (!isManagerReviewer || !company?.id) { setReviewOwners(new Set()); return undefined; }
    const ids = [...new Set(
      opportunities.map((o) => o.owner_id).filter((id) => id && id !== user?.id),
    )];
    if (!ids.length) { setReviewOwners(new Set()); return undefined; }

    let alive = true;
    (async () => {
      const { data, error } = await supabase
        .from('plan_submissions')
        .select('owner_id, is_submitted, approval_status')
        .eq('company_id', company.id)
        .in('owner_id', ids)
        .eq('plan_month', targetMonth.start);
      if (!alive) return;
      if (error) {
        // Read-only on failure, deliberately: see reviewOwners above.
        console.error('reviewOwners:', error);
        setReviewOwners(new Set());
        return;
      }
      setReviewOwners(new Set(
        (data || [])
          .filter((r) => r.is_submitted === true && r.approval_status === 'pending')
          .map((r) => r.owner_id),
      ));
    })();
    // The month or the row set can change while this is in flight; a late reply
    // must not grant edit rights for a plan state that is no longer on screen.
    return () => { alive = false; };
  }, [isManagerReviewer, company?.id, user?.id, opportunities, targetMonth.start]);

  // ── The EDIT gate ─────────────────────────────────────────────────────────
  // Your own row, or a subordinate's row whose plan you are currently reviewing.
  //
  // Deliberately separate from isOwnRow, which still governs add, delete and
  // convert. A manager may correct a number he is being asked to approve; he may
  // not add work to someone's plan, remove work from it, or convert it — those
  // belong to the person who owns the plan and is measured on it.
  //
  // Once he approves, reviewOwners no longer contains that owner (the row stops
  // being pending), so the capability ends by itself — there is no second rule
  // to keep in step. A rejected or still-draft plan is never in the set either.
  const canEditRow = (opp) => isOwnRow(opp)
    || (isManagerReviewer && !!opp?.owner_id && reviewOwners.has(opp.owner_id));

  // Put plan_submissions.total_planned back in step after ANY edit to a row.
  //
  // That column is a SNAPSHOT taken at submit time, not a live sum, and the
  // approval queue reads it. Change a row underneath a submitted plan and the
  // queue goes on showing the as-submitted figure.
  //
  // Four paths could do that, and none used to correct it:
  //   the MANAGER correcting a number during review — he would then be approving
  //     against the total he had just changed;
  //   the OWNER editing after submitting, which became possible once the lock
  //     moved to approval, so a salesman could revise a plan already in the queue
  //     and leave the manager reviewing the figure it was filed with;
  //   the OWNER adding a row to a plan already in the queue, which an approved
  //     plan permits too and which therefore has to be told apart from it;
  //   the OWNER deleting a row from a pending plan, which moves the total DOWN;
  //   CONVERTING a row, which sets status='converted' and so drops it out of the
  //     status='open' sum — reachable on a pending plan only by a manager or
  //     director, who are not in CONVERSION_GATED_ROLES.
  //
  // EVERY writer of `opportunities` on this tab now calls this: handleSave
  // (create and edit), handleDelete, handleConvert. That is the property worth
  // keeping — add a fifth, and it has to call this too.
  //
  // A draft plan needs no resync and gets none: the UPDATE below matches only a
  // submitted, still-pending row, so there is nothing to keep in step until the
  // plan has actually been filed. An APPROVED plan is excluded by the same
  // clause, which is what makes adding to one safe.
  //
  // fetchPlannedOpen is the same function the submit path's total comes from
  // (utils/planningPageSummary.js), called with the same productGroup: null and
  // the owner alone, which is the scope a salesman's own submission uses. A
  // second hand-rolled sum here would be a different definition waiting to drift.
  const resyncSubmittedTotal = useCallback(async (ownerId) => {
    if (!company?.id || !ownerId) return;
    const { total, failed } = await fetchPlannedOpen({
      companyId: company.id,
      ownerIds: [ownerId],
      start: targetMonth.start,
      end: targetMonth.end,
      productGroup: null,
    });
    // Never write a total derived from a failed read. A dropped opportunities
    // query returns 0, which is indistinguishable from an empty plan once it is
    // written down — that is exactly how a plan came to be filed at 0.00 against
    // a real pipeline. Leaving the old figure is the lesser wrong.
    if (failed) { console.error('resyncSubmittedTotal: read failed, total left as submitted'); return; }
    // Still-pending only. If the plan was approved or sent back while the modal
    // was open, its total belongs to that decision and must not be rewritten.
    // Narrowing the UPDATE is also what keeps the approver-guard trigger on its
    // early-return path: approval_status and is_locked are untouched.
    const { error } = await supabase
      .from('plan_submissions')
      .update({ total_planned: total, updated_at: new Date().toISOString() })
      .eq('company_id', company.id)
      .eq('owner_id', ownerId)
      .eq('plan_month', targetMonth.start)
      .eq('is_submitted', true)
      .eq('approval_status', 'pending');
    if (error) console.error('resyncSubmittedTotal:', error);
  }, [company?.id, targetMonth.start, targetMonth.end]);

  // ── Derived totals ────────────────────────────────────────────────────────
  //
  // OPEN rows only, which is what every other figure in the app already means
  // by "planned": the Plan card (planningPageSummary.js fetchPlannedOpen), the
  // KPI strip's Planned, the submit check and plan_submissions.total_planned all
  // filter status = 'open'. This total did not, so a converted opportunity was
  // counted twice over — once here as plan, and again in the funnel as the deal
  // it became — which made Total Planned read above the plan that was actually
  // filed and made Remaining read lower than it is. 'moved_to_future' rows are
  // next month's problem and were being counted into this month as well.
  // openPlanTotal (utils/planningPageSummary.js) is the shared definition, so
  // this tab and the numbers-check page cannot disagree about it.
  const { total: totalPlanned, rows: openOpportunities } = openPlanTotal(opportunities);
  const planningPct   = monthlyTarget > 0 ? Math.min((totalPlanned / monthlyTarget) * 100, 100) : 0;
  const unplanned     = Math.max(0, monthlyTarget - totalPlanned);
  // Remaining = what the target still needs once THIS month's invoiced revenue,
  // the open funnel and the plan are all counted. Distinct from Still Unplanned
  // (target vs plan alone) and from the KPI strip's Deficit (target vs achieved).
  const remaining     = Math.max(0, monthlyTarget - achievedThisMonth - funnelValue - totalPlanned);
  const isUnderPlanned = monthlyTarget > 0 && totalPlanned < monthlyTarget;

  // ── Save (create / update) ────────────────────────────────────────────────
  async function handleSave() {
    if (!form.customer_name?.trim() || !form.planned_amount) return;
    // Editing: the row must be yours. Creating: a new row is always yours, but
    // not while the page is pointed at someone else's plan.
    // Editing: canEditRow — yours, or a subordinate's row you are reviewing.
    // Creating: a new row is always yours, but not while the page is pointed at
    // someone else's plan. The manager exception does NOT extend to creating.
    if (editingOpp ? !canEditRow(editingOpp) : isViewingOther) return;
    // An approved plan freezes the rows it was APPROVED WITH. It does not close
    // the month: the owner can always add new work to their plan, approved or
    // not. Selling more than you promised is not a thing to be stopped, and
    // blocking it is the bug this guard caused — a salesman adding a new customer
    // was told "This month's plan is locked. Contact your manager", which should
    // never happen for an add, in any role.
    //
    // So the lock is checked ONLY on an edit. `editingOpp` is what distinguishes
    // the two: this one handler serves both the Add and the Edit modal.
    //
    // The lock that matters is the row OWNER's, not the logged-in user's — on an
    // edit those need not be the same person, and checking the viewer's lock
    // asked the wrong question entirely. (`role` is not passed: blockIfPlanLocked
    // accepts it but no longer lets it decide anything.)
    if (editingOpp && await blockIfPlanLocked({
      ownerId: editingOpp.owner_id || user?.id, planMonth,
    })) return;
    setSaving(true);
    try {
      const payload = {
        customer_name:  form.customer_name.trim(),
        customer_type:  form.customer_type,
        contact_id:     form.contact_id || null,
        planned_amount: parseFloat(form.planned_amount) || 0,
        material_group: form.material_group || null,
        expected_month: form.expected_month || null,
        notes:          form.notes || null,
        company_id:     company?.id,
        // Omitted, not null, when the picker did not appear — so the BEFORE
        // INSERT trigger fills it from the owner's primary division. See
        // migrations/division_attribution.sql.
        ...(form.division_id ? { division_id: form.division_id } : {}),
      };

      let error;
      if (editingOpp) {
        ({ error } = await supabase
          .from('opportunities').update(payload).eq('id', editingOpp.id));
      } else {
        ({ error } = await supabase
          .from('opportunities')
          .insert({ ...payload, owner_id: user?.id, created_by: user?.id }));
      }
      if (error) throw error;

      // EVERY path that changes the rows resyncs — create and edit, owner and
      // manager. Unconditional rather than `editingOpp || !editingOpp`, which is
      // the same thing written as a riddle.
      //
      // Safety for an approved plan does not live here, it lives in the UPDATE's
      // pending-only narrowing: adding to an approved plan is always allowed, and
      // because no pending row matches, the total it was approved on is left
      // exactly as it was. On a create the owner is the inserting user, which is
      // who the row was just filed under.
      await resyncSubmittedTotal(editingOpp?.owner_id || user?.id);

      closeModal();
      fetchOpportunities();
      onOpportunityChange?.();
    } catch (err) {
      console.error('saveOpportunity:', err);
      alert(`Could not save opportunity: ${err.message || err}`);
    } finally {
      setSaving(false);
    }
  }

  // Takes the row, not just its id, because the lock to check belongs to the
  // opportunity's OWNER — previously this asked whether the logged-in user's own
  // plan was locked, which is a different person whenever a lead is looking at
  // someone else's plan.
  async function handleDelete(opp) {
    if (!isOwnRow(opp)) return;
    const id = typeof opp === 'string' ? opp : opp?.id;
    const ownerId = (typeof opp === 'object' && opp?.owner_id) || user?.id;
    if (await blockIfPlanLocked({ ownerId, role, planMonth })) return;
    if (!window.confirm('Delete this opportunity?')) return;
    const { error } = await supabase.from('opportunities').delete().eq('id', id);
    if (error) { alert(`Could not delete: ${error.message}`); return; }
    // Run AFTER the delete, so the recomputed total no longer counts the row that
    // just went. An approved plan cannot reach here at all — blockIfPlanLocked
    // returned above — and the pending-only clause inside would refuse it anyway.
    await resyncSubmittedTotal(ownerId);
    fetchOpportunities();
    onOpportunityChange?.();
  }

  // ── Convert to a Lead-stage deal ──────────────────────────────────────────
  // The deal amount is ALWAYS the opportunity's planned_amount (never the
  // expected-close value). Links are two-way (opportunities.deal_id +
  // deals.opportunity_id) so the 3-day lead-expiry check can find converted leads.
  async function handleConvert(opp) {
    if (!isOwnRow(opp)) return;
    // A plan must be APPROVED before the work in it can become a deal. The month
    // checked is the opportunity's own expected_month, not the month the page is
    // showing — converting an October opportunity is governed by October's plan
    // even if the switch is on September. Existing converted opportunities are
    // untouched; this only governs new attempts.
    const oppPlanMonth = planMonthForDate(opp.expected_month);
    if (await blockIfPlanNotApproved({
      ownerId: opp.owner_id || user?.id,
      role,
      planMonth: oppPlanMonth,
    })) return;

    try {
      const now = new Date().toISOString();
      // Through dealService.createDeal rather than a bare insert: a converted
      // opportunity is a new deal like any other, and this path wrote none of
      // the weighted forecast fields, so a converted lead sat in the pipeline
      // with forecast_amount null — missing from every forecast total — and
      // left no opening row in deal_stage_history. createDeal computes both
      // from stage_probabilities and is otherwise a plain insert of this same
      // payload; it sends no notification, so nothing else about converting
      // changes.
      const { data: deal, error } = await dealService.createDeal({
        title:       opp.customer_name,
        stage:       'lead',
        amount:      parseFloat(opp.planned_amount) || 0,
        original_amount: parseFloat(opp.planned_amount) || 0,
        final_amount: null,
        // Always the company currency — never inherit a stray currency, so the
        // Funnel card never exchange-converts the planned amount.
        currency:    company?.currency || 'SAR',
        company_id:  company?.id,
        owner_id:    opp.owner_id || user?.id,
        contact_id:  opp.contact_id || null,
        description: opp.notes || null,
        expected_close_date: opp.expected_month || null,
        // THE PLAN ITEM'S DIVISION, inherited. A converted plan item is the same
        // piece of business in a different table, so it must not change division
        // on the way across: Kamal's Al BADAH plan sits in PVC Compound, and the
        // deal it becomes belongs there too. Without this the deal would take
        // the owner's PRIMARY division from the BEFORE INSERT trigger (Export
        // for Kamal), and the plan would leave one division while the deal
        // arrived in another — the panel's plan and funnel would stop reconciling
        // for exactly the people this session is about.
        //
        // `undefined` rather than null when the plan item has no division yet
        // (before migrations/division_attribution.sql is applied), so the column
        // is omitted from the insert and the trigger's owner-primary default
        // still applies instead of being overwritten with an explicit NULL.
        ...(opp.division_id ? { division_id: opp.division_id } : {}),
        opportunity_id: opp.id,
        converted_at: now,
        stage_changed_at: now,
      });
      if (error) throw error;

      const { error: updErr } = await supabase
        .from('opportunities')
        .update({
          status:       'converted',
          deal_id:      deal.id,
          converted_at: now,
        })
        .eq('id', opp.id);
      if (updErr) throw updErr;

      // status='converted' drops this row out of the status='open' sum, so the
      // plan's total has just fallen. For a salesman or supervisor this is a
      // no-op: blockIfPlanNotApproved only let them here on an APPROVED plan, and
      // the pending-only clause inside refuses to rewrite an approved total — the
      // protection stays exactly as it was. It matters for a manager or director,
      // who are not in CONVERSION_GATED_ROLES and so can convert off a plan that
      // is still pending.
      await resyncSubmittedTotal(opp.owner_id || user?.id);

      fetchOpportunities();
      onOpportunityChange?.();
    } catch (err) {
      console.error('convertOpportunity:', err);
      alert(`Could not convert to lead: ${err.message || err}`);
    }
  }

  // ── Modal helpers ─────────────────────────────────────────────────────────
  function openAdd() {
    // Adding while pointed at someone else's plan would create the opportunity
    // under the VIEWER (the insert uses user.id), so it would not even appear in
    // the filtered list it was added from. Guarded here as well as in the UI.
    if (isViewingOther) return;
    setEditingOpp(null);
    setForm(emptyForm(currentMonth));
    setShowModal(true);
  }
  function openEdit(opp) {
    if (!canEditRow(opp)) return;
    setEditingOpp(opp);
    setForm({
      customer_name:  opp.customer_name || '',
      customer_type:  opp.customer_type || 'existing',
      contact_id:     opp.contact_id || '',
      planned_amount: opp.planned_amount ?? '',
      division_id:    opp.division_id || null,
      material_group: opp.material_group || '',
      expected_month: opp.expected_month || currentMonth,
      notes:          opp.notes || '',
    });
    setShowModal(true);
  }
  function closeModal() {
    setShowModal(false);
    setEditingOpp(null);
    setForm(emptyForm(currentMonth));
  }

  // A suggestion from the Gap closer: the add form, already filled in.
  // `customer_type: 'existing'` because every candidate has bought before —
  // that is what made it a candidate.
  useEffect(() => {
    if (!prefill || isViewingOther) return;
    setEditingOpp(null);
    setForm({
      ...emptyForm(currentMonth),
      customer_name:  prefill.customer || '',
      customer_type:  'existing',
      contact_id:     prefill.contactId || '',
      planned_amount: prefill.value != null ? String(Math.round(prefill.value)) : '',
    });
    setShowModal(true);
    onPrefillConsumed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefill]);

  // Close on ESC
  useEffect(() => {
    if (!showModal) return;
    const onKey = (e) => { if (e.key === 'Escape') closeModal(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [showModal]);

  const contactLabel = (c) =>
    c.company_name || `${c.first_name || ''} ${c.last_name || ''}`.trim() || 'Unnamed';

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div>
      {/* ── Summary bar ── */}
      <div className="bg-card rounded-2xl border border-border p-5 mb-6">
        <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
          <div>
            <h2 className="text-base font-semibold text-foreground">Current Sales Plan</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Plan your monthly target by customer ·{' '}
              {new Date().toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}
            </p>
          </div>
          <button
            onClick={openAdd}
            disabled={isViewingOther}
            title={isViewingOther ? "Only this plan's owner can add to it" : undefined}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl transition-colors ${
              isViewingOther
                ? 'bg-muted text-muted-foreground cursor-not-allowed'
                : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
          >
            <Icon name="Plus" size={15} />
            Add to Current Sales Plan
          </button>
        </div>

        {/* Five cards: two per row on a phone, three across from sm, all five
            from xl — five in a row on a small screen is unreadable. */}
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-4 mb-4">
          <div className="bg-muted rounded-xl p-4 text-center">
            <p className={`text-xl font-bold tabular-nums ${hasTargetRows ? 'text-foreground' : 'text-muted-foreground'}`}>
              {hasTargetRows ? formatCurrency(monthlyTarget) : '—'}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {hasTargetRows ? 'Monthly Target' : 'No target assigned'}
            </p>
          </div>
          <div className="bg-muted rounded-xl p-4 text-center">
            <p className={`text-xl font-bold tabular-nums ${
              monthlyTarget > 0 && totalPlanned >= monthlyTarget ? 'text-green-600' : 'text-blue-600'
            }`}>
              {formatCurrency(totalPlanned)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">Total Planned</p>
          </div>
          {/* Without a target there is nothing to be "fully planned" against —
              that claim used to appear for a picked manager whose scope resolved
              to nobody, and for any salesman with no target row. */}
          <div className="bg-muted rounded-xl p-4 text-center">
            <p className={`text-xl font-bold tabular-nums ${
              !hasTargetRows ? 'text-muted-foreground' : isUnderPlanned ? 'text-red-600' : 'text-green-600'
            }`}>
              {hasTargetRows ? formatCurrency(unplanned) : '—'}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {!hasTargetRows ? 'Nothing to plan against' : isUnderPlanned ? 'Still Unplanned' : 'Fully Planned ✓'}
            </p>
          </div>
          <div className="bg-muted rounded-xl p-4 text-center">
            <p className="text-xl font-bold text-blue-600 tabular-nums">
              {formatCurrency(funnelValue)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">In Funnel</p>
          </div>
          <div className="bg-muted rounded-xl p-4 text-center">
            <p className={`text-xl font-bold tabular-nums ${
              monthlyTarget <= 0 ? 'text-muted-foreground' : remaining > 0 ? 'text-red-600' : 'text-green-600'
            }`}>
              {/* No target set → "—", the same way the other cards treat a
                  missing target, rather than a meaningless 0. */}
              {monthlyTarget > 0 ? formatCurrency(remaining) : '—'}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Remaining
              <span className="block text-[10px] text-muted-foreground/80">after achieved + funnel + plan</span>
            </p>
          </div>
        </div>

        <div>
          <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
            <span>Planning Progress</span>
            <span className="font-medium text-foreground">
              {planningPct.toFixed(1)}% planned
            </span>
          </div>
          <div className="w-full h-2.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{
                width: `${planningPct}%`,
                background:
                  planningPct >= 100 ? '#059669' : planningPct >= 70 ? '#3B82F6' : '#F59E0B',
              }}
            />
          </div>
        </div>

        {isUnderPlanned && (
          <div className="flex items-start gap-2 mt-3 px-3 py-2 bg-amber-50 border border-amber-100 rounded-xl">
            <Icon name="AlertTriangle" size={14} className="text-amber-500 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-700">
              <strong>{formatCurrency(unplanned)}</strong> of the target is not yet planned.
              Add more opportunities to cover the full monthly target.
            </p>
          </div>
        )}
      </div>

      {/* ── Filters ── */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div className="flex gap-2 flex-wrap">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilterStatus(f.id)}
              className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors ${
                filterStatus === f.id
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'border-border text-muted-foreground hover:bg-muted'
              }`}
            >
              {f.label}
              {f.id !== 'all' && (
                <span className="ml-1.5 opacity-70">
                  {opportunities.filter((o) => o.status === f.id).length}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Product Group — free-text values collapsed to one entry per group
              (case and spacing ignored). Sits beside the salesman selector
              because the summary cards above follow both together. */}
          {productGroups.length > 0 && (
            <div className="flex items-center gap-1.5">
              <Icon name="Package" size={14} className="text-muted-foreground" />
              <select
                value={filterProductGroup || ''}
                onChange={(e) => onFilterProductGroupChange?.(e.target.value || null)}
                className="text-xs px-2.5 py-2 rounded-lg border border-border bg-background text-foreground max-w-[190px]"
                title="Filter the plan and the coverage cards by product group"
              >
                <option value="">All product groups</option>
                {productGroups.map((g) => (
                  <option key={g.value} value={g.value}>
                    {g.label}
                    {g.variants.length > 1 ? ` (${g.variants.length} spellings)` : ''}
                    {` — ${g.count}`}
                  </option>
                ))}
              </select>
            </div>
          )}

          {(isDirector || isTeamLead) && selectorMembers.length > 0 && (
            <SalesmanSelector
              value={filterOwner === 'all' ? null : filterOwner}
              onChange={(id) => setFilterOwner(id || 'all')}
              teamMembers={selectorMembers}
            />
          )}
        </div>
      </div>

      {/* Filtering by product group hides rows that carry no group at all, which
          is most of them today. Say so rather than letting the list look empty. */}
      {filterProductGroup && (
        <div className="flex items-start gap-2 p-3 mb-4 rounded-xl bg-amber-50 border border-amber-200">
          <Icon name="Info" size={15} className="text-amber-600 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-amber-800">
            Showing only opportunities tagged{' '}
            <span className="font-semibold">
              {productGroups.find((g) => g.value === filterProductGroup)?.label || filterProductGroup}
            </span>
            . Rows with no product group are not shown, and the coverage cards above leave them out too.
          </p>
        </div>
      )}

      {/* ── Error ── */}
      {loadError && (
        <div className="flex items-start gap-2 p-4 mb-4 rounded-xl bg-red-50 border border-red-100">
          <Icon name="AlertCircle" size={16} className="text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-red-700">Could not load opportunities</p>
            <p className="text-xs text-red-600 mt-0.5">{loadError}</p>
          </div>
        </div>
      )}

      {/* ── List ── */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 bg-muted rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : opportunities.length === 0 && !loadError ? (
        <div className="text-center py-16 bg-card rounded-2xl border border-border">
          <div className="w-14 h-14 rounded-full bg-blue-50 flex items-center justify-center mx-auto mb-4">
            <Icon name="Target" size={24} className="text-blue-400" />
          </div>
          <h3 className="text-sm font-semibold text-foreground mb-2">No plans yet</h3>
          {/* The empty state normally invites the owner to start planning. Read
              by someone else it must not, and offering a dead button here would
              be worse than offering none. */}
          {isViewingOther ? (
            <p className="text-xs text-muted-foreground max-w-xs mx-auto">
              Nothing planned for this month yet. Only this plan&apos;s owner can add to it.
            </p>
          ) : (
            <>
              <p className="text-xs text-muted-foreground mb-5 max-w-xs mx-auto">
                Start planning your monthly target by adding customers you plan to sell to this month.
              </p>
              <button
                onClick={openAdd}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 transition-colors"
              >
                <Icon name="Plus" size={15} />
                Add to Current Sales Plan
              </button>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {/* FLAG CHIPS. Counted over the whole list, so the counts do not
              change as the list is narrowed. */}
          {flagsByItemId && (() => {
            const counts = {};
            opportunities.forEach((o) => {
              (flagsByItemId[o.id] || []).forEach((f) => {
                const base = f.startsWith('DUPLICATE') ? 'DUPLICATE' : f;
                counts[base] = (counts[base] || 0) + 1;
              });
            });
            const names = Object.keys(counts);
            if (!names.length) return null;
            return (
              <div className="flex items-center gap-2 flex-wrap" data-testid="plan-flag-chips">
                <span className="text-xs text-muted-foreground">Show only:</span>
                {names.map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setFlagFilter(flagFilter === f ? null : f)}
                    aria-pressed={flagFilter === f}
                    className={`text-xs px-2.5 py-1 rounded-full border font-medium transition-colors ${
                      flagFilter === f
                        ? 'bg-amber-100 border-amber-300 text-amber-800'
                        : 'bg-card border-border text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {f} · {counts[f]}
                  </button>
                ))}
                {flagFilter && (
                  <button
                    type="button"
                    onClick={() => setFlagFilter(null)}
                    className="text-xs text-muted-foreground underline decoration-dotted"
                  >
                    clear
                  </button>
                )}
              </div>
            );
          })()}

          {opportunities
            .filter((o) => {
              if (!flagFilter) return true;
              const fl = (flagsByItemId?.[o.id] || []);
              return fl.some((f) => (f.startsWith('DUPLICATE') ? 'DUPLICATE' : f) === flagFilter);
            })
            .map((opp) => {
            const daysSince = Math.floor(
              (Date.now() - new Date(opp.created_at).getTime()) / 86400000,
            );
            const isOpen = opp.status === 'open';
            const isNew  = opp.customer_type === 'new';
            const stageColor = STAGE_COLOR[opp.deal?.stage] || '#6B7280';

            return (
              <div
                key={opp.id}
                className={`bg-card rounded-2xl border border-border transition-all duration-150 ${
                  isOpen ? 'hover:shadow-sm' : 'opacity-60'
                }`}
              >
                <div className="p-4">
                  <div className="flex items-start gap-3">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
                      isNew ? 'bg-green-100' : 'bg-blue-100'
                    }`}>
                      <Icon
                        name={isNew ? 'UserPlus' : 'Building2'}
                        size={16}
                        className={isNew ? 'text-green-600' : 'text-blue-600'}
                      />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-sm font-semibold text-foreground truncate">
                          {opp.customer_name}
                        </h3>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          isNew ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
                        }`}>
                          {isNew ? 'New Customer' : 'Existing'}
                        </span>
                        {/* WHAT IS WRONG WITH THIS ITEM. Computed once by the
                            page for the whole scope (utils/planningDrill.js),
                            so these say the same thing as the panel's. */}
                        {(flagsByItemId?.[opp.id] || []).map((f) => (
                          <span
                            key={f}
                            data-testid="plan-item-flag"
                            title={PLAN_FLAG_WHY[f.startsWith('DUPLICATE') ? 'DUPLICATE' : f] || f}
                            className={`text-[10px] px-1.5 py-0.5 rounded border font-semibold ${
                              f === 'NO HISTORY'
                                ? 'bg-gray-50 text-gray-600 border-gray-200'
                                : 'bg-amber-50 text-amber-700 border-amber-200'
                            }`}
                          >
                            {f}
                          </span>
                        ))}
                        {!isOpen && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-medium capitalize">
                            {opp.status}
                          </span>
                        )}
                        {/* Converted leads with no progress are nearing/​past the
                            3-day return-to-Opportunities cutoff. */}
                        {opp.status === 'converted' && (() => {
                          const d = opp.converted_at
                            ? Math.floor((Date.now() - new Date(opp.converted_at).getTime()) / 86400000)
                            : 0;
                          if (d >= 3) return (
                            <span className="flex items-center gap-1 text-xs px-2 py-0.5 bg-red-100 text-red-700 rounded-full font-medium">
                              <Icon name="AlertTriangle" size={10} /> Returning to plan…
                            </span>
                          );
                          if (d >= 2) return (
                            <span className="flex items-center gap-1 text-xs px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full font-medium">
                              <Icon name="Clock" size={10} /> Expires tomorrow
                            </span>
                          );
                          return null;
                        })()}
                        {opp.bounce_count > 0 && (
                          <span className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${
                            opp.bounce_count >= 2 ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                          }`}>
                            <Icon name="RefreshCw" size={9} /> Bounced {opp.bounce_count}×
                          </span>
                        )}
                        {opp.is_replacement && (
                          <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">
                            <Icon name="RefreshCw" size={9} /> Replacement
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-4 mt-1.5 flex-wrap text-xs text-muted-foreground">
                        {opp.material_group && (
                          <span className="flex items-center gap-1">
                            <Icon name="Package" size={11} />{opp.material_group}
                          </span>
                        )}
                        {opp.expected_month && (
                          <span className="flex items-center gap-1">
                            <Icon name="Calendar" size={11} />
                            {new Date(opp.expected_month).toLocaleDateString('en-GB', {
                              month: 'short', year: 'numeric',
                            })}
                          </span>
                        )}
                        {opp.owner && (isDirector || isTeamLead) && (
                          <span className="flex items-center gap-1">
                            <Icon name="User" size={11} />{opp.owner.full_name}
                          </span>
                        )}
                      </div>

                      {opp.notes && (
                        <p className="text-xs text-muted-foreground mt-1.5 line-clamp-1">
                          {opp.notes}
                        </p>
                      )}
                    </div>

                    <div className="flex flex-col items-end gap-2 flex-shrink-0">
                      <p className="text-base font-bold tabular-nums text-foreground">
                        {formatCurrency(parseFloat(opp.planned_amount) || 0)}
                      </p>
                      <div className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full ${
                        daysSince > 30
                          ? 'bg-red-100 text-red-700'
                          : daysSince > 14
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-muted text-muted-foreground'
                      }`}>
                        <Icon name="Clock" size={10} />
                        {daysSince === 0 ? 'Today' : `${daysSince} days`}
                      </div>
                    </div>
                  </div>

                  {/* Linked deal */}
                  {!isOpen && opp.deal && (
                    <div className="mt-3 pt-3 border-t border-border flex items-center justify-between gap-3 flex-wrap">
                      <div className="flex items-center gap-2 min-w-0">
                        <Icon name="ArrowRight" size={13} className="text-muted-foreground flex-shrink-0" />
                        <span className="text-xs text-muted-foreground">Converted to deal:</span>
                        <span className="text-xs font-medium text-foreground truncate max-w-[12rem]">
                          {opp.deal.title}
                        </span>
                      </div>
                      <span
                        className="text-xs font-medium px-2 py-0.5 rounded-full capitalize flex-shrink-0"
                        style={{ background: `${stageColor}20`, color: stageColor }}
                      >
                        {opp.deal.stage?.replace('_', ' ')}
                      </span>
                    </div>
                  )}

                  {/* Actions */}
                  {isOpen && (
                    <div className="mt-3 pt-3 border-t border-border flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex gap-2">
                        {/* canEditRow, not isOwnRow: a manager may correct the
                            numbers on a plan he is being asked to approve, while
                            it is still pending. Delete and Convert below stay on
                            isOwnRow. */}
                        <button
                          onClick={() => openEdit(opp)}
                          disabled={!canEditRow(opp)}
                          title={!canEditRow(opp)
                            ? "Only this plan's owner can change it"
                            : (!isOwnRow(opp) ? 'Reviewing: you can adjust this while the plan is pending' : undefined)}
                          className={`text-xs px-3 py-1.5 border rounded-lg transition-colors ${
                            !canEditRow(opp)
                              ? 'border-border text-muted-foreground/50 cursor-not-allowed'
                              : 'border-border text-muted-foreground hover:bg-muted'
                          }`}
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(opp)}
                          disabled={!isOwnRow(opp)}
                          title={!isOwnRow(opp) ? "Only this plan's owner can change it" : undefined}
                          className={`text-xs px-3 py-1.5 border rounded-lg transition-colors ${
                            !isOwnRow(opp)
                              ? 'border-border text-muted-foreground/50 cursor-not-allowed'
                              : 'border-red-200 text-red-500 hover:bg-red-50'
                          }`}
                        >
                          Delete
                        </button>
                      </div>
                      <button
                        onClick={() => handleConvert(opp)}
                        disabled={!isOwnRow(opp)}
                        title={!isOwnRow(opp) ? "Only this plan's owner can convert it" : undefined}
                        className={`flex items-center gap-1.5 text-xs px-4 py-1.5 font-medium rounded-xl transition-colors ${
                          !isOwnRow(opp)
                            ? 'bg-muted text-muted-foreground cursor-not-allowed'
                            : 'bg-blue-600 text-white hover:bg-blue-700'
                        }`}
                      >
                        Convert to Lead
                        <Icon name="ArrowRight" size={12} />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Add / Edit modal ── */}
      {showModal && (
        <>
          <div
            className="fixed inset-0 z-[600] bg-black/40 backdrop-blur-sm"
            onClick={closeModal}
          />
          <div className="fixed inset-0 z-[600] flex items-center justify-center p-4 pointer-events-none">
            <div className="bg-card rounded-2xl shadow-2xl w-full max-w-md max-h-[85vh] flex flex-col overflow-hidden pointer-events-auto">
              <div className="px-6 py-4 border-b border-border flex items-center justify-between flex-shrink-0">
                <h2 className="text-base font-semibold text-foreground">
                  {editingOpp ? 'Edit Sales Plan Item' : 'Add to Current Sales Plan'}
                </h2>
                <button
                  onClick={closeModal}
                  className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-muted transition-colors"
                >
                  <Icon name="X" size={16} className="text-muted-foreground" />
                </button>
              </div>

              <div className="px-6 py-5 space-y-4 overflow-y-auto flex-1">
                {/* Customer type */}
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-2 block">
                    Customer Type
                  </label>
                  <div className="flex gap-2">
                    {[
                      { v: 'existing', label: 'Existing Customer', icon: 'Building2' },
                      { v: 'new',      label: 'New Customer',      icon: 'UserPlus'  },
                    ].map((opt) => (
                      <button
                        key={opt.v}
                        onClick={() =>
                          setForm((f) => ({
                            ...f, customer_type: opt.v, contact_id: '', customer_name: '',
                          }))
                        }
                        className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border text-xs font-medium transition-colors ${
                          form.customer_type === opt.v
                            ? opt.v === 'new'
                              ? 'bg-green-600 text-white border-green-600'
                              : 'bg-blue-600 text-white border-blue-600'
                            : 'border-border text-muted-foreground hover:bg-muted'
                        }`}
                      >
                        <Icon name={opt.icon} size={13} />
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Customer */}
                {form.customer_type === 'existing' ? (
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">
                      Select Contact
                    </label>
                    <select
                      value={form.contact_id}
                      onChange={(e) => {
                        const c = contacts.find((x) => x.id === e.target.value);
                        setForm((f) => ({
                          ...f,
                          contact_id: e.target.value,
                          customer_name: c ? contactLabel(c) : '',
                        }));
                      }}
                      className="w-full border border-border rounded-xl px-3 py-2.5 text-sm bg-card text-foreground focus:outline-none focus:border-blue-400"
                    >
                      <option value="">Select a contact…</option>
                      {contacts.map((c) => (
                        <option key={c.id} value={c.id}>{contactLabel(c)}</option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">
                      New Customer Name
                    </label>
                    <input
                      type="text"
                      value={form.customer_name}
                      onChange={(e) => setForm((f) => ({ ...f, customer_name: e.target.value }))}
                      placeholder="Enter company or customer name"
                      className="w-full border border-border rounded-xl px-3 py-2.5 text-sm bg-card text-foreground focus:outline-none focus:border-blue-400"
                    />
                  </div>
                )}

                {/* Planned amount */}
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">
                    Planned Amount (SAR)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={form.planned_amount}
                    onChange={(e) => setForm((f) => ({ ...f, planned_amount: e.target.value }))}
                    placeholder="0.00"
                    className="w-full border border-border rounded-xl px-3 py-2.5 text-sm tabular-nums bg-card text-foreground focus:outline-none focus:border-blue-400"
                  />
                  {form.planned_amount && monthlyTarget > 0 && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Total planned will be{' '}
                      {formatCurrency(
                        totalPlanned
                        - (editingOpp ? parseFloat(editingOpp.planned_amount) || 0 : 0)
                        + (parseFloat(form.planned_amount) || 0),
                      )}{' '}
                      of {formatCurrency(monthlyTarget)} target
                    </p>
                  )}
                </div>

                {/* Material group */}
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">
                    Product / Material Group
                  </label>
                  <input
                    type="text"
                    value={form.material_group}
                    onChange={(e) => setForm((f) => ({ ...f, material_group: e.target.value }))}
                    placeholder="e.g. PVC Pipes, Fittings…"
                    className="w-full border border-border rounded-xl px-3 py-2.5 text-sm bg-card text-foreground focus:outline-none focus:border-blue-400"
                  />
                </div>

                {/* Expected month */}
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">
                    Expected Month
                  </label>
                  <input
                    type="month"
                    value={(form.expected_month || '').substring(0, 7)}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        expected_month: e.target.value ? `${e.target.value}-01` : null,
                      }))
                    }
                    className="w-full border border-border rounded-xl px-3 py-2.5 text-sm bg-card text-foreground focus:outline-none focus:border-blue-400"
                  />
                </div>

                {/* Division — ONLY for an owner in more than one. A plan
                    item is the business this division will book, so a
                    multi-division planner has to say which one. */}
                <DivisionPicker
                  companyId={company?.id}
                  userId={editingOpp?.owner_id || user?.id}
                  value={form.division_id}
                  onChange={(id) => setForm((f) => ({ ...f, division_id: id }))}
                />

                {/* Notes */}
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">
                    Notes (optional)
                  </label>
                  <textarea
                    value={form.notes}
                    onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                    rows={3}
                    placeholder="Any notes about this opportunity…"
                    className="w-full border border-border rounded-xl px-3 py-2.5 text-sm resize-none bg-card text-foreground focus:outline-none focus:border-blue-400"
                  />
                </div>
              </div>

              <div className="px-6 py-4 border-t border-border flex gap-3 justify-end flex-shrink-0">
                <button
                  onClick={closeModal}
                  className="px-4 py-2 text-sm border border-border rounded-xl text-muted-foreground hover:bg-muted transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving || !form.customer_name?.trim() || !form.planned_amount}
                  className="px-5 py-2 text-sm bg-blue-600 text-white font-medium rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? 'Saving…' : editingOpp ? 'Save Changes' : 'Add to Current Sales Plan'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
