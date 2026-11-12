import {
  DIVISION_PAGE_ROLES,
  COVERAGE_CONSOLE_ROLES,
  DASHBOARD_ROLES,
  TARGETS_PAGE_ROLES,
} from 'utils/salesDivisionMetrics';
import { SALES_MONITOR_ROLES } from 'utils/salesMonitor';
import { NUMBERS_CHECK_ROLES } from 'utils/numbersCheck';
import { REASSIGN_ROLES } from 'services/reassignmentService';
import { landingPathForRole } from 'utils/landingPath';

/**
 * WHO SEES WHICH PAGE — role first, then the admin's per-user setting
 * (session 35, CEO 2026-11-12).
 *
 *   1. THE ROLE IS THE CEILING. Each page keeps the role list it already had
 *      (the *_ROLES constants the routes and the menu use). Nothing here can
 *      show a page to a role that list does not name.
 *   2. THE PER-USER SETTING CAN ONLY HIDE. user_page_permissions rows with
 *      can_view = false hide that page from that user. No row = visible, which
 *      is how every user is today (the table is empty).
 *   3. NOBODY IS LOCKED OUT. If the setting would leave a user no page at
 *      all, their landing page stays visible; and a hidden landing page sends
 *      them to the next visible page in menu order.
 *
 * Pages outside this list — Admin Dashboard, Settings, Account settings,
 * Notifications, Help, the viewer's pipeline view — cannot be hidden, so an
 * admin can never hide the Admin Dashboard from himself.
 *
 * ONE implementation, used by the menu (desktop and mobile) and by
 * ProtectedRoute, through contexts/PageAccessContext.jsx.
 */

/** Every menu page, in menu order, with the menu's own label. `roles` null = every role. */
export const ACCESS_PAGES = [
  { key: 'insights', path: '/insights', label: 'Insights', icon: 'Layers', roles: DIVISION_PAGE_ROLES },
  { key: 'sales-monitor', path: '/sales-monitor', label: 'Sales Monitor', icon: 'Gauge', roles: SALES_MONITOR_ROLES },
  { key: 'company-dashboard', path: '/company-dashboard', labelKey: 'nav.dashboard', icon: 'LayoutDashboard', roles: DASHBOARD_ROLES },
  { key: 'targets', path: '/targets', label: 'Targets', icon: 'Target', roles: TARGETS_PAGE_ROLES },
  { key: 'coverage-console', path: '/coverage-console', labelKey: 'nav.console', icon: 'LayoutGrid', roles: COVERAGE_CONSOLE_ROLES },
  { key: 'sales-pipeline', path: '/sales-pipeline', labelKey: 'nav.pipeline', icon: 'TrendingUp', roles: null },
  { key: 'lead-management', path: '/lead-management', labelKey: 'nav.leads', icon: 'UserPlus', roles: null },
  { key: 'calendar', path: '/calendar', labelKey: 'nav.calendar', icon: 'CalendarDays', roles: null },
  { key: 'forecast', path: '/forecast', labelKey: 'nav.forecast', icon: 'LineChart', roles: null },
  { key: 'reports', path: '/reports', labelKey: 'nav.reports', icon: 'FileBarChart', roles: null },
  { key: 'contact-management', path: '/contact-management', labelKey: 'nav.clients', icon: 'Users', roles: null },
  { key: 'planning', path: '/planning', labelKey: 'nav.planning', icon: 'ClipboardList', roles: null },
  { key: 'task-management', path: '/task-management', labelKey: 'nav.tasks', icon: 'ListTodo', roles: null },
  { key: 'numbers-check', path: '/numbers-check', label: 'Numbers check', icon: 'CheckCheck', roles: NUMBERS_CHECK_ROLES },
  { key: 'reassign-records', path: '/reassign-records', label: 'Reassign Records', icon: 'ArrowLeftRight', roles: REASSIGN_ROLES },
];

const BY_KEY = new Map(ACCESS_PAGES.map((p) => [p.key, p]));
const BY_PATH = new Map(ACCESS_PAGES.map((p) => [p.path, p]));

/** The menu label, translated the way the menu translates it. */
export const pageLabel = (page, t = null) => (page.labelKey && t ? t(page.labelKey) : page.label || page.key);

/** Can this role ever see this page? (The ceiling.) */
export function roleAllows(key, role) {
  const p = BY_KEY.get(key);
  if (!p) return true;
  return !p.roles || p.roles.includes(role);
}

/** The registry entry for a path (exact match), or null for a page that cannot be hidden. */
export const pageForPath = (path) => BY_PATH.get(String(path || '').split(/[?#]/)[0]) || null;

/**
 * The effective access for one user.
 *
 * @param {object}   p
 * @param {string}   p.role
 * @param {object[]} p.rows  that user's user_page_permissions rows ({ page, can_view })
 * @returns {{ hidden: Set<string>, canSee: (key) => boolean, canSeePath: (path) => boolean, landing: string, restoredLanding: boolean }}
 */
export function computeAccess({ role, rows = [] }) {
  // Hidden = rows saying can_view false, for pages this role could see at all.
  const hidden = new Set(
    (rows || [])
      .filter((r) => r && r.can_view === false && BY_KEY.has(r.page) && roleAllows(r.page, role))
      .map((r) => r.page),
  );
  const visibleKeys = () => ACCESS_PAGES.filter((p) => roleAllows(p.key, role) && !hidden.has(p.key)).map((p) => p.key);

  // NO LOCK-OUT: with nothing left, the landing page comes back.
  const roleLanding = landingPathForRole(role);
  let restoredLanding = false;
  if (visibleKeys().length === 0) {
    const lp = pageForPath(roleLanding);
    if (lp && hidden.delete(lp.key)) restoredLanding = true;
  }

  const canSee = (key) => roleAllows(key, role) && !hidden.has(key);
  const canSeePath = (path) => {
    const p = pageForPath(path);
    return !p || canSee(p.key);
  };
  // Where to land: the role's landing page, else the first visible page.
  const firstVisible = ACCESS_PAGES.find((p) => canSee(p.key));
  const landing = canSeePath(roleLanding) ? roleLanding : (firstVisible?.path || roleLanding);
  return { hidden, canSee, canSeePath, landing, restoredLanding };
}

/** Access with no setting at all: exactly today's behaviour. */
export const DEFAULT_ACCESS = (role) => computeAccess({ role, rows: [] });

/** Shown when a hidden page's URL is opened. */
export const HIDDEN_PAGE_NOTICE = 'That page is not available for your account.';

/** Fired after the admin saves, so the open app re-reads its own access. */
export const PAGE_ACCESS_CHANGED = 'page-access:changed';
