Step 4 — Hierarchy column findings (JASCO PVC promotions)
=========================================================

Date: 2026-09-15
Checked against: master (commit 36f371e) source code, plus live read-only calls
to the database functions.

The users table has two manager columns: reports_to and supervisor_id.
Different parts of the app read different ones.


1. WHICH COLUMN EACH PLACE READS
--------------------------------

Coverage Console
  Reads: reports_to ONLY
  Evidence: src/pages/coverage-console/index.jsx lines 131, 264-266, 464
  (builds its team tree from reports_to)

Plan Approval routing — resolveApprover / resolveApproverMap
  Reads: reports_to ONLY
  Evidence: src/utils/planApproval.js lines 64-75 and 103-114
  (approver = reports_to if that person is active, otherwise the company
  fallback: manager, then supervisor, then director, head, admin)

Plan Approval routing — resolveApproverScope
  Reads: reports_to ONLY
  Evidence: src/utils/planApproval.js lines 139-160
  (team from fetchTeamHierarchy, which walks reports_to, plus a fallback group
  for people whose reports_to is NULL or points at an inactive user)

Plan-approval database trigger (enforce_plan_approver)
  Reads: reports_to ONLY
  Evidence: migrations/add_plan_approval_guard.sql line 49
  (only the reports_to person, or the fallback, may approve or reject)
  CAVEAT: verified from the migration file, not from the live database
  definition. Everything else in this list was verified directly.

can_manage_user_contacts()  (database permission function)
  Reads: supervisor_id
  Evidence: live call — Osman -> Ahmad = true, even though Ahmad's
  reports_to is NULL (only his supervisor_id points at Osman)

can_assign_target_to_user()  (database permission function)
  Reads: supervisor_id
  Evidence: live call — Osman -> Ahmad = true

can_user_access_data()  (database permission function)
  Reads: supervisor_id
  Evidence: live call — Osman -> Ahmad = true

get_user_subordinates()  (database function)
  Reads: supervisor_id
  Evidence: live call — Osman's subordinate list includes Ahmad

Admin user screens (hierarchy tree, user edit, invite user)
  Reads: supervisor_id ONLY
  These are also the ONLY screens that WRITE a manager change, and they write
  supervisor_id alone.
  Evidence: UserHierarchyTree.jsx 213, UserDetailModal.jsx 17/203/260,
  InviteUserModal.jsx 205, supabaseService.js updateUserHierarchy (2511)


2. OTHER PLACES CHECKED
-----------------------

Reads reports_to:
  - Planning team lists and data scope ........ src/utils/teamHierarchy.js
  - Plan-deadline notifications ............... src/utils/deadlineCheck.js
  - Lead-expiry notifications ................. src/utils/leadExpiryCheck.js
  - Deal-edit "notify manager" ................ src/pages/sales-pipeline/components/DealModal.jsx

Reads supervisor_id:
  - Director dashboard target progress roll-up  DirectorDashboard.jsx 499, 551, 593
  - Manager dashboard target progress roll-up . EnhancedManagerDashboard.jsx 398
  - Supervisor dashboard team grouping ........ EnhancedSupervisorDashboard.jsx 711
  - Forecast, supervisor scope ................ supabaseService.js 5645, 5787
  - Reports, supervisor scope ................. supabaseService.js 5865
  - Leads, supervisor scope ................... src/services/leadService.js 111
  - Notification recipient chain .............. supabaseService.js getUserSupervisorChain
  - Subordinate lists ......................... supabaseService.js getUserSubordinates
  - Reassign Records tool ..................... src/services/reassignmentService.js
  - Reports hierarchy ......................... src/services/reportService.js


3. IS WRITING BOTH COLUMNS ENOUGH?
----------------------------------

YES, for this change. No code change is needed.

Every place above reads one of the two columns. The SQL
(migrations/promote_amer_alseyed_supervisors.sql) sets both to the same value
for all four people, so every screen, notification, approval check and
database permission sees the same tree.

Writing only one column would have split it:
  - reports_to only:    approvals and Coverage move to Amer, but the database
                        would not let Amer see or manage Hussein's and Ahmad's
                        records.
  - supervisor_id only: Amer could manage them, but their plans would still be
                        approved by Osman, and Coverage would still show them
                        under Osman.

The SQL also fixes an existing gap: Ahmad's reports_to is NULL today, so he is
missing from Mohamed Kamal's and Osman's dashboard figures (Kamal's pipeline is
short by exactly Ahmad's 52,496).


4. THINGS TO KNOW
-----------------

a) Future drift. Any manager change made later through the Admin user screens
   writes ONLY supervisor_id, so the two columns will drift apart again. That is
   the paused reports_to / supervisor_id consolidation work. This SQL does not
   make it worse.

b) Who approves plans after the change. Plans go to the person's immediate
   manager (reports_to), not up a chain:
     - Mohamed Hussein's and Ahmad's plans -> Amer (only Amer can approve;
       the database trigger enforces this)
     - Amer's and Alseyed's own plans      -> Mohamed Kamal
   This is the same pattern Osman follows as a supervisor today. If Mohamed
   Kamal should approve salesmen's plans instead, that is a code change.

c) Expected access changes (from supervisor_id):
     - Osman loses database access to Amer's, Alseyed's, Hussein's and Ahmad's
       records.
     - Amer gains access to Hussein's and Ahmad's records.
     - Mohamed Kamal keeps access to everyone.
