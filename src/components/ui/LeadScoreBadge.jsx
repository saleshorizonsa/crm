import { GRADE_CONFIG } from "../../utils/leadScoring";

/**
 * Colored dot + grade label + score number.
 * Falls back to "cold / 0" when score/grade are absent (e.g. migration not yet run).
 */
const LeadScoreBadge = ({ score, grade }) => {
  const config = GRADE_CONFIG[grade] ?? GRADE_CONFIG.cold;
  const display = score ?? 0;

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium ${config.bg} ${config.color}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${config.dot}`} />
      {config.label}
      <span className="font-semibold tabular-nums">{display}</span>
    </span>
  );
};

export default LeadScoreBadge;
