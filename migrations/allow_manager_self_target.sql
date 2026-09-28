-- ============================================================================
-- Let a manager assign a monthly target to himself.
--
-- NOT APPLIED YET. Reported by Mohamed Kamal (manager, JASCO PVC): assigning a
-- target to himself in the PVC Compound division fails with
--   "User does not have permission to assign targets to this user"
--
-- TWO database gates block it, not one. The bug report identified the first;
-- fixing only that leaves the insert failing with a rawer error.
--
--   1. can_assign_target_to_user() has cases for director->manager,
--      manager->supervisor, manager->salesman and supervisor->salesman, and no
--      case for assigner = assignee, so it falls through to RETURN FALSE. This
--      is the message the user sees, raised by validate_target_assignment().
--
--   2. sales_targets carries CHECK (assigned_by <> assigned_to), named
--      `valid_hierarchy`. Even with the function fixed, the insert dies with
--      23514 "violates check constraint valid_hierarchy". Verified in a
--      rolled-back transaction: fixing only the function is not enough.
--
-- The self-target feature (ManagerSalesTargetAssignment.jsx + utils/selfTarget.js)
-- has supported this on the UI side since it shipped; both gates simply were
-- never updated to match. Nobody had hit it: there are 0 self-assigned rows in
-- sales_targets.
--
-- SCOPE: managers only, matching exactly what the UI offers. ManagerSalesTarget-
-- Assignment is rendered only by EnhancedManagerDashboard, and `selfAsAssignee`
-- returns null unless the manager has a sales_division_id, so no other role can
-- reach a "yourself" option today. Widening to another role means changing the
-- UI and this function TOGETHER — the drift that caused this bug.
--
-- The `valid_hierarchy` CHECK cannot be narrowed instead of dropped: a CHECK
-- constraint cannot read users.role, so "a manager may self-assign" is not
-- expressible there. can_assign_target_to_user() becomes the single gate, which
-- is where the rest of this rule already lives, and it runs on every insert and
-- update through validate_target_assignment().
--
-- The budget check is untouched and still applies to self-assignments:
-- validate_target_assignment() calls can_assign_target_to_user() FIRST, then
-- get_user_allocated_target()/get_user_assigned_target(). Verified below.
--
-- Rollback:
--   ALTER TABLE public.sales_targets
--     ADD CONSTRAINT valid_hierarchy CHECK (assigned_by <> assigned_to);
--   -- and re-create the function without the self-assignment block.
-- ============================================================================

-- ── 1. Permission gate: add the self-assignment case ────────────────────────
CREATE OR REPLACE FUNCTION public.can_assign_target_to_user(assigner_id uuid, assignee_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    assigner_role user_role;
    assignee_role user_role;
    is_subordinate BOOLEAN;
BEGIN
    SELECT role INTO assigner_role FROM users WHERE id = assigner_id;
    SELECT role INTO assignee_role FROM users WHERE id = assignee_id;

    -- Self-assignment: a manager carving part of his own allocation into a
    -- target for himself. Scoped to managers because that is exactly who the UI
    -- offers it to. The amount is still checked against his remaining
    -- allocation by validate_target_assignment(), like any other assignment.
    IF assigner_id = assignee_id THEN
        RETURN assigner_role = 'manager';
    END IF;

    -- Directors can assign to managers
    IF assigner_role = 'director' AND assignee_role = 'manager' THEN
        RETURN TRUE;
    END IF;

    -- Managers can assign to supervisors (direct reports)
    IF assigner_role = 'manager' AND assignee_role = 'supervisor' THEN
        SELECT EXISTS(
            SELECT 1 FROM users
            WHERE id = assignee_id AND supervisor_id = assigner_id
        ) INTO is_subordinate;
        RETURN is_subordinate;
    END IF;

    -- Managers can assign to salesmen (direct or indirect reports)
    IF assigner_role = 'manager' AND assignee_role = 'salesman' THEN
        SELECT EXISTS(
            SELECT 1 FROM users
            WHERE id = assignee_id AND supervisor_id = assigner_id
        ) INTO is_subordinate;

        IF is_subordinate THEN
            RETURN TRUE;
        END IF;

        SELECT EXISTS(
            SELECT 1 FROM users salesman
            INNER JOIN users supervisor ON salesman.supervisor_id = supervisor.id
            WHERE salesman.id = assignee_id
            AND supervisor.supervisor_id = assigner_id
            AND salesman.role = 'salesman'
            AND supervisor.role = 'supervisor'
        ) INTO is_subordinate;

        RETURN is_subordinate;
    END IF;

    -- Supervisors can assign to salesmen (direct reports only)
    IF assigner_role = 'supervisor' AND assignee_role = 'salesman' THEN
        SELECT EXISTS(
            SELECT 1 FROM users
            WHERE id = assignee_id AND supervisor_id = assigner_id
        ) INTO is_subordinate;
        RETURN is_subordinate;
    END IF;

    RETURN FALSE;
END;
$function$;

-- ── 2. The table constraint that also forbids it ────────────────────────────
ALTER TABLE public.sales_targets DROP CONSTRAINT valid_hierarchy;

-- ── Verification run 2026-09-28 in a rolled-back transaction ────────────────
-- Permission matrix, before -> after (only the first row changed):
--   Kamal -> Kamal      (manager self)        false -> TRUE
--   Nader -> Kamal      (director->manager)   true  -> true
--   Kamal -> Diba       (manager->supervisor) true  -> true
--   Kamal -> Hussein    (mgr->salesman, ind)  true  -> true
--   Diba  -> Saud       (supervisor->salesman)true  -> true
--   Diba  -> Diba       (supervisor self)     false -> false
--   Hussein -> Hussein  (salesman self)       false -> false
--   Hussein -> Diba     (no rule)             false -> false
--
-- Real inserts through the full trigger chain:
--   Kamal self-target 250,000 (Oct, monthly)      SUCCEEDED
--   Kamal self-target 50,000,000 (over budget)    REJECTED - "Cannot assign
--                                                 target amount ... Available
--                                                 amount: 39,009,778.80"
--   Hussein (salesman) self-target                REJECTED - no permission
--   Kamal -> Diba (manager->supervisor)           SUCCEEDED, unchanged
--   Hussein -> Diba (no rule)                     REJECTED, unchanged
