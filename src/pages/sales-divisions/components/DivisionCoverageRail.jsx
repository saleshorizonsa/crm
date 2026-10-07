// MOVED to src/components/CoverageRail.jsx on 2026-10-07.
//
// This page and the Coverage Console each carried a hand-copied rail, with a
// comment in both telling the reader to keep them in step by hand. Two copies
// of a bar chart was survivable; two copies of a drill-down panel was not, so
// they became one component.
//
// Re-exported rather than deleted, so a caller this refactor missed renders
// the real rail instead of failing to import.
export { default } from 'components/CoverageRail';
