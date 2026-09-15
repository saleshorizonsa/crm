// The "All Salesmen" drill-down list on Planning (Customer Master, Current Sales
// Plan, Future Orders).
//
// fetchTeamHierarchy() alone is not enough for that list: for a manager or
// supervisor it returns the people BELOW them and never the viewer, and for a
// director it returns only salesmen, supervisors and managers who are active.
// So a manager who owns customers himself could see them under "All" but never
// filter to just his own.
//
// The fix is local to the selector: offer the team PLUS anyone who owns a record
// the page has already loaded in the viewer's scope, whatever their role. Nothing
// here widens what is loaded — scope queries keep using the team list — and
// fetchTeamHierarchy() stays untouched, because plan-approval routing depends on
// it returning the downline only.
//
// Dependency-free so it can be tested in Node.

// Rows carry the joined owner as `owner: { id, full_name, role, is_active }`.
const ownerEntry = (o) => ({
  id: o.id,
  full_name: o.full_name,
  role: o.is_active === false ? `${o.role || 'user'} · inactive` : o.role,
});

// Add the owners of `rows` to `prev`. Returns `prev` itself when nobody is new,
// so a React state update with it does not re-render.
export function addRecordOwners(prev, rows) {
  const known = new Set(prev.map((m) => m.id));
  const added = [];
  for (const row of rows || []) {
    const o = row?.owner;
    if (!o?.id || known.has(o.id)) continue;
    known.add(o.id);
    added.push(ownerEntry(o));
  }
  return added.length ? [...prev, ...added] : prev;
}

// The team, plus record owners not already in it, sorted by name. The team's
// own entries are never replaced or dropped.
export function withRecordOwners(team, recordOwners) {
  const base = team || [];
  const ids = new Set(base.map((m) => m.id));
  const extra = (recordOwners || []).filter((o) => !ids.has(o.id));
  if (!extra.length) return base;
  return [...base, ...extra].sort((a, b) => (a.full_name || '').localeCompare(b.full_name || ''));
}
