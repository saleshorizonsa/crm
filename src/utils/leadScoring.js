export const STAGE_WEIGHTS = {
  lead:          0.10,
  contact_made:  0.25,
  proposal_sent: 0.50,
  negotiation:   0.75,
  won:           1.00,
  lost:          0.00,
};

// Maximum achievable raw score (all positive signals, no decay):
//   Profile:    email(10) + phone(8) + company_name(8) + active(5)  = 31
//   Engagement: open_deal(20) + deal_stage(15) + activity(12) + task(7) = 54
//   Total max:  85
//
// Minimum raw score (no positive signals, all decay applied):
//   Decay: no_activity(-15) + last_deal_lost(-20) = -35
//
// Normalised score = (raw - MIN_RAW) / (MAX_RAW - MIN_RAW) * 100, clamped 0-100.

const MIN_RAW = -35;
const MAX_RAW = 85;

const OPEN_STAGES = new Set(["lead", "qualified", "proposal_sent", "negotiation"]);
const HIGH_VALUE_STAGES = new Set(["proposal_sent", "negotiation", "won"]);

const MS_7D  = 7  * 24 * 60 * 60 * 1000;
const MS_30D = 30 * 24 * 60 * 60 * 1000;

export const GRADE_CONFIG = {
  hot:  { label: "Hot",  color: "text-red-600",    bg: "bg-red-50",    dot: "bg-red-500"    },
  warm: { label: "Warm", color: "text-orange-500", bg: "bg-orange-50", dot: "bg-orange-400" },
  cool: { label: "Cool", color: "text-blue-600",   bg: "bg-blue-50",   dot: "bg-blue-500"   },
  cold: { label: "Cold", color: "text-gray-500",   bg: "bg-gray-100",  dot: "bg-gray-400"   },
};

function gradeFromScore(score) {
  if (score >= 75) return "hot";
  if (score >= 45) return "warm";
  if (score >= 20) return "cool";
  return "cold";
}

function latestActivityDate(activities) {
  let latest = new Date(0);
  for (const a of activities) {
    const d = new Date(a.created_at ?? a.activity_date ?? 0);
    if (d > latest) latest = d;
  }
  return latest;
}

/**
 * Calculate a normalised lead score (0–100) for a contact.
 *
 * @param {object}   contact    - Contact row from Supabase
 * @param {object[]} deals      - Deals linked to this contact
 * @param {object[]} activities - Activities linked to this contact
 * @returns {{ score: number, grade: string, breakdown: object }}
 */
export function calculateLeadScore(contact, deals = [], activities = []) {
  let raw = 0;
  const breakdown = { profile: {}, engagement: {}, decay: {} };

  // ── Profile signals ──────────────────────────────────────────────────────
  if (contact.email?.trim()) {
    raw += 10;
    breakdown.profile.email = 10;
  }
  if (contact.phone?.trim()) {
    raw += 8;
    breakdown.profile.phone = 8;
  }
  if (contact.company_name?.trim()) {
    raw += 8;
    breakdown.profile.company_name = 8;
  }
  if (contact.status === "active") {
    raw += 5;
    breakdown.profile.status_active = 5;
  }

  // ── Engagement signals ───────────────────────────────────────────────────
  const hasOpenDeal = deals.some((d) => OPEN_STAGES.has(d.stage));
  if (hasOpenDeal) {
    raw += 20;
    breakdown.engagement.open_deal = 20;
  }

  const hasHighValueStage = deals.some((d) => HIGH_VALUE_STAGES.has(d.stage));
  if (hasHighValueStage) {
    raw += 15;
    breakdown.engagement.deal_stage = 15;
  }

  const now = Date.now();
  const recentActivity = activities.some((a) => {
    const d = new Date(a.created_at ?? a.activity_date ?? 0);
    return now - d.getTime() <= MS_7D;
  });
  if (recentActivity) {
    raw += 12;
    breakdown.engagement.recent_activity = 12;
  }

  const hasPendingTask = activities.some(
    (a) => a.type === "task" && a.status !== "completed"
  );
  if (hasPendingTask) {
    raw += 7;
    breakdown.engagement.pending_task = 7;
  }

  // ── Decay signals ────────────────────────────────────────────────────────
  const lastActive = latestActivityDate(activities);
  if (now - lastActive.getTime() > MS_30D) {
    raw -= 15;
    breakdown.decay.no_recent_activity = -15;
  }

  // Most-recently-updated deal reflects the current relationship state
  const mostRecentDeal = deals.reduce(
    (latest, d) =>
      !latest || new Date(d.updated_at) > new Date(latest.updated_at) ? d : latest,
    null
  );
  if (mostRecentDeal?.stage === "lost") {
    raw -= 20;
    breakdown.decay.last_deal_lost = -20;
  }

  // ── Normalise ────────────────────────────────────────────────────────────
  const score = Math.round(
    Math.min(100, Math.max(0, ((raw - MIN_RAW) / (MAX_RAW - MIN_RAW)) * 100))
  );
  const grade = gradeFromScore(score);

  return { score, grade, breakdown };
}
