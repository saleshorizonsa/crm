import { DIVISION_PAGE_ROLES } from './salesDivisionMetrics';

// Where a signed-in user lands, in ONE place. Two callers redirect after auth —
// HomeRedirect ("/" visited directly) and the login page itself — and they had
// already drifted apart, so a role added to one was missed by the other.
//
// EVERY role that can open Insights lands there (CEO decision 2026-10-07).
// Directors already did; managers, supervisors, salesmen, heads and admins
// joined them. Dashboard stays in the menu one click away for all of them, and
// an admin keeps /admin-dashboard in the secondary menu, so nobody is stranded
// on a page with no way back — which is the mistake this file's previous
// version existed to avoid.
//
// Viewers are confined to /pipeline-view by ProtectedRoute, so that is where
// they land; sending them anywhere else only buys a redirect bounce. Any role
// that cannot open Insights keeps the Dashboard, because landing somebody on a
// page that answers "Access Denied" is worse than landing them anywhere.
//
// DEEP LINKS DO NOT COME THROUGH HERE. This is the DEFAULT only — what you get
// for visiting "/" or signing in with nowhere particular to go. A specific URL
// is honoured by ProtectedRoute remembering it and the login page preferring
// it; see both.
export function landingPathForRole(role) {
  if (role === 'viewer') return '/pipeline-view';
  if (DIVISION_PAGE_ROLES.includes(role)) return '/insights';
  return '/company-dashboard';
}
