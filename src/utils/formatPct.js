// Percentages that cannot crash a render.
//
// WHY THIS EXISTS. On 2026-10-05 the whole Planning page went blank in
// production — "Cannot read properties of undefined (reading 'toFixed')" at
// planning/index.jsx:1305 — because a figure the page renders
// (`pipelineConversion3m`) was missing from the object it renders from, and the
// guard in front of it was `!== null`, which is true for `undefined`. Every
// role was affected, not just the manager who reported it.
//
// Two lessons, both encoded here:
//
//   1. `x !== null` IS NOT A GUARD for a value that can be absent. Only
//      Number.isFinite() rejects undefined, null AND NaN, which are the three
//      ways an async figure arrives as "no number yet".
//   2. A missing percentage must show as "—", never as 0%. 0% is a measurement;
//      a blank is the absence of one, and a reader who cannot tell them apart
//      will act on a number nobody computed.
//
// Use this for any percentage read off state, props or an awaited result. A
// percentage computed inline from two local numbers does not need it.

/** The em dash a missing figure shows as, so every screen says it the same way. */
export const NO_FIGURE = '—';

/**
 * True when `value` is a real number to show — the guard to use before rendering
 * one, in place of `!== null`.
 *
 * `Number()` is NOT used on its own here, because Number(null) is 0 and
 * Number('') is 0: coercing first would turn "no figure" into a confident zero,
 * which is the mistake this module exists to stop. null, undefined and '' are
 * rejected before any coercion.
 */
export function hasFigure(value) {
  if (value === null || value === undefined || value === '') return false;
  return Number.isFinite(Number(value));
}

/**
 * A percentage, or NO_FIGURE when there is no number to show.
 *
 * @param {*} value   the percentage, already scaled to 100 — this does not scale it
 * @param {number} [digits=1] decimal places
 * @param {string} [fallback] what to show instead; NO_FIGURE by default
 * @returns {string} e.g. "65.4%", or "—"
 */
export function fmtPct(value, digits = 1, fallback = NO_FIGURE) {
  return hasFigure(value) ? `${Number(value).toFixed(digits)}%` : fallback;
}

/**
 * The same number WITHOUT the percent sign, for a caller that supplies its own
 * (a translated string with a {percent} placeholder, a chart axis label).
 */
export function fmtPctValue(value, digits = 1, fallback = NO_FIGURE) {
  return hasFigure(value) ? Number(value).toFixed(digits) : fallback;
}
