import { PACING_TOLERANCE } from 'utils/salesDivisionMetrics';
import { PIPELINE_STAGE_COLOR } from 'utils/pipelineStageColors';

/**
 * SALES MONITOR COLOURS (session 42, CEO 2026-11-16) — the app's own colour
 * language on the monitor and its stage pages. Styling only: nothing here
 * decides a figure, a row or a word.
 *
 * STAGES: the coloured top strip of Insights' KPI cards (KPICardsStrip: an h-1
 * strip and a coloured value), one colour per stage — Target blue-600 and
 * Achieved green-500 as Insights uses them.
 *
 * CONTRAST (≥ 4.5:1 for text on white): a strip or a dot can be any shade, but
 * text cannot, so each stage carries a TEXT shade and a SOLID shade (a filled
 * tab with white text) that pass, in the same hue:
 *
 *   stage      strip        text (value, header)  solid (active tab, number)
 *   Target     blue-600     blue-600   5.2:1      blue-600    5.2:1
 *   Planned    purple-500   purple-700 7.0:1      purple-600  5.4:1
 *   Funnel     orange-500   orange-700 5.2:1      orange-700  5.2:1
 *   Visits     teal-500     teal-700   5.5:1      teal-700    5.5:1
 *   Achieved   green-500    green-700  5.0:1      green-700   5.0:1
 *   Exceptions red-500      red-700    6.5:1      red-600     4.8:1
 *
 * (Insights writes Achieved in green-600, 3.3:1 at this size — so the text
 * here is green-700.) Every class is written out in full so Tailwind keeps it.
 *
 * Dark mode: the app declares darkMode "class" but never sets it, so there is
 * no dark theme to keep in step; none is added here.
 */
export const STAGE_COLOURS = {
  target: {
    outline: 'bg-white border-blue-300 text-blue-600 hover:bg-blue-50',
    strip: 'bg-blue-600', text: 'text-blue-600', solid: 'bg-blue-600 text-white border-blue-600',
    soft: 'bg-blue-50', border: 'border-blue-300', left: 'border-l-blue-600', arrow: 'text-blue-600', bar: 'bg-blue-600',
  },
  planned: {
    outline: 'bg-white border-purple-300 text-purple-700 hover:bg-purple-50',
    strip: 'bg-purple-500', text: 'text-purple-700', solid: 'bg-purple-600 text-white border-purple-600',
    soft: 'bg-purple-50', border: 'border-purple-300', left: 'border-l-purple-500', arrow: 'text-purple-500', bar: 'bg-purple-500',
  },
  funnel: {
    outline: 'bg-white border-orange-300 text-orange-700 hover:bg-orange-50',
    strip: 'bg-orange-500', text: 'text-orange-700', solid: 'bg-orange-700 text-white border-orange-700',
    soft: 'bg-orange-50', border: 'border-orange-300', left: 'border-l-orange-500', arrow: 'text-orange-500', bar: 'bg-orange-500',
  },
  visits: {
    outline: 'bg-white border-teal-300 text-teal-700 hover:bg-teal-50',
    strip: 'bg-teal-500', text: 'text-teal-700', solid: 'bg-teal-700 text-white border-teal-700',
    soft: 'bg-teal-50', border: 'border-teal-300', left: 'border-l-teal-500', arrow: 'text-teal-500', bar: 'bg-teal-500',
  },
  achieved: {
    outline: 'bg-white border-green-300 text-green-700 hover:bg-green-50',
    strip: 'bg-green-500', text: 'text-green-700', solid: 'bg-green-700 text-white border-green-700',
    soft: 'bg-green-50', border: 'border-green-300', left: 'border-l-green-500', arrow: 'text-green-500', bar: 'bg-green-500',
  },
  exceptions: {
    outline: 'bg-white border-red-300 text-red-700 hover:bg-red-50',
    strip: 'bg-red-500', text: 'text-red-700', solid: 'bg-red-600 text-white border-red-600',
    soft: 'bg-red-50', border: 'border-red-300', left: 'border-l-red-500', arrow: 'text-red-500', bar: 'bg-red-500',
  },
};
export const stageColour = (id) => STAGE_COLOURS[id] || STAGE_COLOURS.target;

/** A pill: the text stays; the colour only repeats what it says. */
export const CHIP = 'inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border text-[11px] leading-none font-medium whitespace-nowrap';
const TONE = {
  green: 'bg-green-50 text-green-700 border-green-200',
  amber: 'bg-amber-50 text-amber-700 border-amber-200',
  red: 'bg-red-50 text-red-700 border-red-200',
  blue: 'bg-blue-50 text-blue-700 border-blue-200',
  slate: 'bg-slate-50 text-slate-700 border-slate-200',
  yellow: 'bg-yellow-50 text-yellow-800 border-yellow-300',
};
export const toneChip = (tone) => `${CHIP} ${TONE[tone] || TONE.slate}`;

/** Pipeline stages: exactly the Pipeline's column colours (a dot), the label kept. */
export const pipelineStageDot = (stageKey) => PIPELINE_STAGE_COLOR[stageKey] || 'bg-gray-400';
const STAGE_KEY_BY_LABEL = {
  Lead: 'lead', 'Contact Made': 'contact_made', 'Proposal Sent': 'proposal_sent', Negotiation: 'negotiation', Won: 'won', Lost: 'lost',
};
export const stageKeyOfLabel = (label) => STAGE_KEY_BY_LABEL[label] || null;

/** Plan outcomes. */
export const OUTCOME_TONE = { Achieved: 'green', Bounced: 'amber', Failed: 'red', Pending: 'slate' };
export const OUTCOME_TEXT = {
  Achieved: 'text-green-700', Bounced: 'text-amber-700', Failed: 'text-red-700', Pending: 'text-slate-600',
};

/** Plan status words, as the pages write them. */
export const PLAN_STATUS_TONE = {
  'on time': 'green', 'submitted on time': 'green',
  late: 'amber', 'submitted late': 'amber',
  missing: 'red', 'not submitted': 'red',
  'awaiting approval': 'blue',
  rejected: 'red', 'rejected, not resubmitted': 'red',
  approved: 'green',
};
export const planStatusTone = (word) => PLAN_STATUS_TONE[String(word || '').trim()] || null;

/** Visit responses. */
export const RESPONSE_TONE = { positive: 'green', neutral: 'slate', negative: 'red' };

/** Exception severity. */
export const SEVERITY_CHIP = {
  high: 'bg-red-50 text-red-700 border-red-200',
  medium: 'bg-amber-50 text-amber-700 border-amber-200',
  low: 'bg-yellow-50 text-yellow-800 border-yellow-300',
};

/**
 * Pace: the Achieved card's own rule (on pace = achieved % ≥ elapsed % −
 * PACING_TOLERANCE). Green when at or ahead of the month (or ≥ 100%), amber
 * inside the tolerance (15 points), red behind it. elapsedPct: share of the
 * month gone, 0–100 (100 once the month is closed).
 */
export function paceTone(pct, elapsedPct) {
  if (pct === null || pct === undefined || !Number.isFinite(Number(pct))) return null;
  const p = Number(pct);
  const e = Number.isFinite(Number(elapsedPct)) ? Number(elapsedPct) : 100;
  if (p >= 100 || p >= e) return 'green';
  if (p >= e - PACING_TOLERANCE * 100) return 'amber';
  return 'red';
}
export const TONE_TEXT = { green: 'text-green-700', amber: 'text-amber-700', red: 'text-red-700', slate: 'text-slate-600', blue: 'text-blue-700' };

/** The next-steps box: the app's warning panel. */
export const NEXT_STEPS_BOX = 'bg-amber-50 border border-amber-200 text-amber-700';
