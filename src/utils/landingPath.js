// Where a signed-in user lands, in ONE place. Two callers redirect after auth —
// HomeRedirect ("/" visited directly) and the login page itself — and they had
// already drifted apart, so a role added to one was missed by the other.
//
// Directors land on Sales Divisions because their Dashboard menu link is hidden
// (see navigationItems in components/ui/Header.jsx); landing them on Dashboard
// would strand them on a page with no way back to it.
export function landingPathForRole(role) {
  if (role === 'admin') return '/admin-dashboard';
  if (role === 'director') return '/sales-divisions';
  return '/company-dashboard';
}
