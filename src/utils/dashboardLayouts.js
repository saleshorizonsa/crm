/**
 * Default drag-and-drop grid layouts per role.
 * Grid is 3 columns wide; height units are row-height steps (each ~80px).
 *
 * Widget IDs:
 *   revenue    – Revenue KPI card
 *   target     – Target / quota progress
 *   pipeline   – Pipeline stage chart
 *   hotleads   – Hot leads list
 *   tasks      – Upcoming tasks
 *   forecast   – Revenue forecast chart
 *   leaderboard – Top performers (supervisor+)
 *   teamperf   – Team performance table (supervisor+)
 */

export const DEFAULT_LAYOUTS = {
  // ─── Salesman ──────────────────────────────────────────────────────────────
  // Personal performance only — no team widgets.
  salesman: [
    { i: "revenue",   x: 0, y: 0, w: 1, h: 2 },
    { i: "target",    x: 1, y: 0, w: 1, h: 2 },
    { i: "pipeline",  x: 2, y: 0, w: 1, h: 4 },
    { i: "hotleads",  x: 0, y: 2, w: 1, h: 2 },
    { i: "tasks",     x: 1, y: 2, w: 1, h: 2 },
    { i: "forecast",  x: 0, y: 4, w: 3, h: 3 },
  ],

  // ─── Supervisor ────────────────────────────────────────────────────────────
  // Personal KPIs + small team view (leaderboard rail, team perf below).
  supervisor: [
    { i: "revenue",     x: 0, y: 0, w: 1, h: 2 },
    { i: "target",      x: 1, y: 0, w: 1, h: 2 },
    { i: "pipeline",    x: 2, y: 0, w: 1, h: 4 },
    { i: "hotleads",    x: 0, y: 2, w: 1, h: 2 },
    { i: "tasks",       x: 1, y: 2, w: 1, h: 2 },
    { i: "forecast",    x: 0, y: 4, w: 2, h: 3 },
    { i: "leaderboard", x: 2, y: 4, w: 1, h: 3 },
    { i: "teamperf",    x: 0, y: 7, w: 3, h: 3 },
  ],

  // ─── Manager ───────────────────────────────────────────────────────────────
  // Team pipeline and leaderboard are prominent; KPIs across the top.
  manager: [
    { i: "revenue",     x: 0, y: 0, w: 1, h: 2 },
    { i: "target",      x: 1, y: 0, w: 1, h: 2 },
    { i: "leaderboard", x: 2, y: 0, w: 1, h: 4 },
    { i: "pipeline",    x: 0, y: 2, w: 2, h: 4 },
    { i: "teamperf",    x: 2, y: 4, w: 1, h: 4 },
    { i: "hotleads",    x: 0, y: 6, w: 1, h: 2 },
    { i: "tasks",       x: 1, y: 6, w: 1, h: 2 },
    { i: "forecast",    x: 0, y: 8, w: 3, h: 3 },
  ],

  // ─── Director ──────────────────────────────────────────────────────────────
  // Company-wide view: forecast and team perf are top-level; pipeline spans center.
  director: [
    { i: "revenue",     x: 0, y: 0, w: 1, h: 2 },
    { i: "target",      x: 1, y: 0, w: 1, h: 2 },
    { i: "forecast",    x: 2, y: 0, w: 1, h: 2 },
    { i: "pipeline",    x: 0, y: 2, w: 2, h: 4 },
    { i: "leaderboard", x: 2, y: 2, w: 1, h: 4 },
    { i: "teamperf",    x: 0, y: 6, w: 2, h: 3 },
    { i: "hotleads",    x: 2, y: 6, w: 1, h: 2 },
    { i: "tasks",       x: 2, y: 8, w: 1, h: 1 },
  ],
};

/**
 * Returns the default layout for a role, falling back to salesman.
 * Normalises head/admin/owner to their closest role equivalent.
 */
export function getDefaultLayout(role) {
  const roleMap = {
    head: "director",
    admin: "director",
    owner: "director",
  };
  const resolved = roleMap[role] ?? role;
  return DEFAULT_LAYOUTS[resolved] ?? DEFAULT_LAYOUTS.salesman;
}

/**
 * Which widgets each role is allowed to see.
 * Use this to strip widgets that arrive in a saved layout but no longer apply.
 */
export const ROLE_WIDGETS = {
  salesman:   ["revenue", "target", "pipeline", "hotleads", "tasks", "forecast"],
  supervisor: ["revenue", "target", "pipeline", "hotleads", "tasks", "forecast", "leaderboard", "teamperf"],
  manager:    ["revenue", "target", "pipeline", "hotleads", "tasks", "forecast", "leaderboard", "teamperf"],
  director:   ["revenue", "target", "pipeline", "hotleads", "tasks", "forecast", "leaderboard", "teamperf"],
};

export function getAllowedWidgets(role) {
  const roleMap = { head: "director", admin: "director", owner: "director" };
  const resolved = roleMap[role] ?? role;
  return ROLE_WIDGETS[resolved] ?? ROLE_WIDGETS.salesman;
}
