/**
 * CUSTOMER STRATEGY COLOURS (session 48) — the only place they are defined.
 *
 *   colour : the strategy's colour (CEO brief) — card left edge, dots, borders
 *   bg     : the light background of a badge (CEO brief)
 *   text   : the badge's text colour. Same hue as `colour`, darkened where the
 *            brief's colour on its own light background is below 4.5:1
 *            (WCAG AA for small text). strategyContrast() proves every pair.
 *
 * "Not set" has no strip and no colour of its own: a light-grey dashed badge.
 */
export const STRATEGY_COLOURS = Object.freeze({
  growth:        { colour: '#15803D', bg: '#DCFCE7', text: '#166534' },
  maintenance:   { colour: '#65A30D', bg: '#ECFCCB', text: '#3F6212' },
  collection:    { colour: '#EA580C', bg: '#FFEDD5', text: '#9A3412' },
  collect_close: { colour: '#DC2626', bg: '#FEE2E2', text: '#991B1B' },
  other:         { colour: '#64748B', bg: '#F1F5F9', text: '#334155' },
  not_set:       { colour: '#CBD5E1', bg: '#FFFFFF', text: '#475569', dashed: true },
});

export const strategyColour = (key) => STRATEGY_COLOURS[key || 'not_set'] || STRATEGY_COLOURS.not_set;

// ── WCAG contrast ────────────────────────────────────────────────────────────
const channel = (c) => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const luminance = (hex) => {
  const n = parseInt(hex.replace('#', ''), 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
};
export const contrastRatio = (a, b) => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
/** { key: ratio } of each badge's text on its background; every one must be >= 4.5. */
export const strategyContrast = () => Object.fromEntries(
  Object.entries(STRATEGY_COLOURS).map(([k, c]) => [k, Math.round(contrastRatio(c.text, c.bg) * 100) / 100]),
);
