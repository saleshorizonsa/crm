import { translations } from '../i18n/translations';

/**
 * DEAL STAGE NAMES — the one place they are spelled (session 46, CEO
 * 2026-11-18).
 *
 *   lead → Lead · contact_made → Qualified · proposal_sent → Proposal ·
 *   negotiation → Negotiation · won → Won · lost → Lost
 *
 * The words themselves live in the translations file (deals.lead,
 * deals.qualified, …), so Arabic follows the same keys. Every page that shows
 * a stage reads it from here:
 *
 *   - inside a component that has `t` (useLanguage): stageLabel(stage, t)
 *   - anywhere else (engines, exports, the Sales Monitor model): stageLabel(stage)
 *     or STAGE_LABELS[stage], which are the English words.
 *
 * Only the label changes here. The stage keys stored on deals are untouched.
 */
export const STAGE_ORDER = ['lead', 'contact_made', 'proposal_sent', 'negotiation', 'won', 'lost'];

export const STAGE_I18N_KEY = Object.freeze({
  lead: 'deals.lead',
  contact_made: 'deals.qualified',
  proposal_sent: 'deals.proposal',
  negotiation: 'deals.negotiation',
  won: 'deals.won',
  lost: 'deals.lost',
});

const EN = translations.en.deals;

/** English stage names, keyed by stage. */
export const STAGE_LABELS = Object.freeze({
  lead: EN.lead,
  contact_made: EN.qualified,
  proposal_sent: EN.proposal,
  negotiation: EN.negotiation,
  won: EN.won,
  lost: EN.lost,
});

// Older stage spellings some rows and filters still carry.
const ALIASES = { 'closed-won': 'won', 'closed-lost': 'lost', closed_won: 'won', closed_lost: 'lost' };

/**
 * The stage's name. With `t` it is the active language; without, English. An
 * unknown value is shown with underscores as spaces, never as a raw key — and
 * an empty one as `fallback`.
 */
export const stageLabel = (stage, t, fallback = '—') => {
  if (stage == null || stage === '') return fallback;
  const key = ALIASES[stage] || stage;
  if (STAGE_I18N_KEY[key]) return typeof t === 'function' ? t(STAGE_I18N_KEY[key]) : STAGE_LABELS[key];
  return String(stage).replace(/_/g, ' ');
};

/** The stage a label names (either language's word, or the key itself), else null. */
export const stageKeyOfLabel = (label) => {
  if (label == null) return null;
  for (const key of STAGE_ORDER) {
    if (label === key || label === STAGE_LABELS[key]) return key;
    const ar = translations.ar?.deals?.[STAGE_I18N_KEY[key].split('.')[1]];
    if (ar && label === ar) return key;
  }
  return null;
};

/** "Lead → Qualified". */
export const stageMoveLabel = (from, to, t) => `${stageLabel(from, t)} → ${stageLabel(to, t)}`;
