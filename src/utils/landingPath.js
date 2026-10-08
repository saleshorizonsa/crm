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
// it; see postLoginPath below.
export function landingPathForRole(role) {
  if (role === 'viewer') return '/pipeline-view';
  if (DIVISION_PAGE_ROLES.includes(role)) return '/insights';
  return '/company-dashboard';
}

/**
 * THE PATHS THAT MEAN "NOWHERE PARTICULAR".
 *
 * "/" is the app's front door, and "/company-dashboard" was the front door
 * until Insights became the landing page. Both are where a browser ends up on
 * its own — a bookmark, a restored tab, a typed address — rather than somewhere
 * a person chose to go, so neither counts as a deep link worth preserving
 * across a sign-in.
 */
export const HOME_PATHS = ['/', '/company-dashboard'];

export const isHomePath = (pathname) => HOME_PATHS.includes(pathname);

/**
 * Where to send someone who has just signed in.
 *
 * A REMEMBERED PATH WINS, except when it is one of the home paths. Following a
 * notification link to /planning#approvals while signed out has to land on
 * /planning#approvals, with its query and hash intact. But someone whose
 * bookmark is the old home page should land on their own landing page, not be
 * returned to the page the landing rule exists to replace — which is what
 * happened while this only skipped "/login": a restored
 * /company-dashboard tab was treated as a deliberate destination, and a
 * director who had Insights as a landing page never saw it.
 *
 * @param {object} from  a react-router location (ProtectedRoute's `state.from`)
 * @param {string} role  the signed-in user's role
 */
export function postLoginPath({ from, role }) {
  const pathname = from?.pathname;
  if (!pathname || pathname === '/login' || isHomePath(pathname)) {
    return landingPathForRole(role);
  }
  return `${pathname}${from.search || ''}${from.hash || ''}`;
}
