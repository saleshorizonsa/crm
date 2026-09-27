/**
 * A target a manager set for HIMSELF, as opposed to one the Director gave him.
 *
 * A manager with no salesman in a division (Export, in the case that prompted
 * this) targets himself for it. That row is `assigned_by = assigned_to`, which
 * is what tells it apart from the Director's allocation — no schema change was
 * needed, and no target row records a division: a target's division is the
 * ASSIGNEE's sales_division_id, which is how Insights attributes every other
 * target too.
 *
 * The rule everywhere: a self-assigned row is a CARVE-OUT of the manager's own
 * allocation, never an addition to it.
 *   • his Total Target stays exactly what the Director gave him — self rows are
 *     excluded from any sum of his own allocation (ownAllocation below)
 *   • the team budget he can still hand out drops by that amount — self rows are
 *     counted with the targets he has assigned, like any team member's
 * Netting it this way is why nothing downstream double-counts.
 */
export const isSelfAssignedTarget = (t) =>
  !!t && !!t.assigned_by && !!t.assigned_to && t.assigned_by === t.assigned_to;

/** The Director-given allocation only: the manager's own rows minus self rows. */
export const ownAllocation = (targets) =>
  (targets || []).filter((t) => !isSelfAssignedTarget(t));

/** Sum of target_amount over rows. */
export const sumTargetAmount = (targets) =>
  (targets || []).reduce((sum, t) => sum + (parseFloat(t?.target_amount) || 0), 0);
