// The top navigation's structure, as data.
//
// Kept out of Header.jsx so the role gating can be exercised directly: which
// items a role sees is the part that is easy to get wrong and impossible to
// check by looking at a rendered menu one role at a time.
//
// MENU VISIBILITY ONLY. Every path here stays reachable by direct URL for any
// role — the routes, not this file, decide what a person may actually open.

import { PLANNING_TAB_IDS, REPORTS_TAB_IDS } from 'constants/pageTabs';

// The Planning page's own gates for its Approvals and Historical Data tabs.
// Duplicated from pages/planning/index.jsx deliberately: a shortcut must not
// offer a tab the page will not render.
const DIRECTOR_ROLES = ['director', 'admin', 'head'];
const TEAM_ROLES = ['manager', 'supervisor'];
export const canApproveFor = (role) => TEAM_ROLES.includes(role) || DIRECTOR_ROLES.includes(role);
export const canUploadHistoryFor = (role) => ['director', 'admin', 'head'].includes(role);

/** Planning's tabs, gated exactly as the page gates them. */
export function planningTabItems(role) {
  return [
    { id: 'customer_master', label: 'Customer Master', icon: 'Users' },
    { id: 'opportunities', label: 'Current Sales Plan', icon: 'Target' },
    { id: 'future_orders', label: 'Future Orders', icon: 'CalendarClock' },
    ...(canApproveFor(role)
      ? [{ id: 'approvals', label: 'Plans Awaiting Approval', icon: 'ClipboardCheck', badge: 'approvals' }]
      : []),
    ...(canUploadHistoryFor(role)
      ? [{ id: 'historical_data', label: 'Historical Data', icon: 'Upload' }]
      : []),
  ];
}

/** Reports' tabs. No role gating today — deliberately kept that way. */
export function reportsTabItems(t = (k) => k) {
  return [
    { id: 'value', label: t('reportsPage.byValue') || 'By Value', icon: 'DollarSign' },
    { id: 'product', label: t('reportsPage.byProduct') || 'By Product', icon: 'Package' },
    { id: 'client', label: t('reportsPage.byClient') || 'By Client', icon: 'Handshake' },
    { id: 'location', label: t('reportsPage.byCompany') || 'By Company', icon: 'Building2' },
    { id: 'salesman', label: t('reportsPage.bySalesman') || 'By Salesman', icon: 'User' },
    { id: 'origin', label: 'Pipeline Origin', icon: 'GitBranch' },
    { id: 'margin', label: 'Margin Analysis', icon: 'Percent' },
    { id: 'activity', label: 'Deal Activity', icon: 'Activity' },
  ];
}

/**
 * The four function groups. Every gate below is the one that was already in
 * force before the regrouping — nothing that used to be visible is hidden now.
 * A group whose items are all gated away for this role is dropped entirely, so
 * no empty button is rendered.
 */
export function buildNavGroups({ role, t = (k) => k }) {
  return [
    {
      key: 'sales',
      label: t('nav.sales') || 'Sales',
      icon: 'TrendingUp',
      items: [
        { label: t('nav.pipeline') || 'Pipeline', path: '/sales-pipeline', icon: 'TrendingUp' },
        { label: t('nav.leads') || 'Leads', path: '/lead-management', icon: 'UserPlus' },
        { label: t('nav.calendar') || 'Calendar', path: '/calendar', icon: 'CalendarDays' },
        { label: t('nav.clients') || 'Clients', path: '/contact-management', icon: 'Users' },
      ],
    },
    {
      key: 'performance',
      label: t('nav.performance') || 'Performance',
      icon: 'LayoutDashboard',
      items: [
        // Directors work from Insights instead of the Dashboard.
        ...(role !== 'director'
          ? [{ label: t('nav.dashboard') || 'Dashboard', path: '/company-dashboard', icon: 'LayoutDashboard' }]
          : []),
        // The Console is a supervisor's tool; admin/head/viewer keep it unchanged.
        ...(!['director', 'manager', 'salesman'].includes(role)
          ? [{ label: t('nav.console') || 'Console', path: '/coverage-console', icon: 'LayoutGrid' }]
          : []),
        // Directors and managers only — the route enforces the same list.
        ...(['director', 'manager'].includes(role)
          ? [{ label: 'Insights', path: '/insights', icon: 'Layers' }]
          : []),
        // ChartLine / FileChartColumn, not LineChart / FileBarChart: those two
        // names no longer exist in lucide 0.484 and were silently rendering the
        // grey HelpCircle fallback.
        { label: t('nav.forecast') || 'Forecast', path: '/forecast', icon: 'ChartLine' },
        {
          label: t('nav.reports') || 'Reports',
          path: '/reports',
          icon: 'FileChartColumn',
          tabs: reportsTabItems(t),
        },
      ],
    },
    {
      key: 'planning',
      label: t('nav.planning') || 'Planning',
      icon: 'ClipboardList',
      items: [
        {
          label: t('nav.planning') || 'Planning',
          path: '/planning',
          icon: 'ClipboardList',
          tabs: planningTabItems(role),
        },
        // A standalone page rather than an Admin Dashboard tab: /admin-dashboard
        // is admin-only, and the people who reassign records are Sales Managers.
        ...(['manager', 'director', 'head', 'admin'].includes(role)
          ? [{ label: 'Reassign Records', path: '/reassign-records', icon: 'ArrowLeftRight' }]
          : []),
      ],
    },
    {
      key: 'admin',
      label: t('nav.admin') || 'Admin',
      icon: 'Shield',
      items: [
        { label: t('nav.tasks') || 'Tasks', path: '/task-management', icon: 'ListTodo' },
        { label: t('nav.settings') || 'Settings', path: '/settings', icon: 'Settings' },
        ...(role === 'admin'
          ? [{ label: t('nav.adminDashboard') || 'Admin Dashboard', path: '/admin-dashboard', icon: 'Shield' }]
          : []),
        { label: t('dashboard.help') || 'Help', path: '/help', icon: 'Info' },
      ],
    },
  ].filter((g) => g.items.length > 0);
}

/**
 * A flyout id that is not one of the page's real tab ids would navigate to a
 * hash the page ignores, leaving the default tab selected — a dead link that
 * still looks like it worked.
 */
export function navTabIdDrift(role, t) {
  return [
    ...planningTabItems(role).filter((i) => !PLANNING_TAB_IDS.includes(i.id)).map((i) => `planning:${i.id}`),
    ...reportsTabItems(t).filter((i) => !REPORTS_TAB_IDS.includes(i.id)).map((i) => `reports:${i.id}`),
  ];
}
