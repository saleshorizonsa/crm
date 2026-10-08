import React from "react";
import { useNavigate } from "react-router-dom";
import DrillSheet from "components/DrillSheet";

/**
 * THE CARD OPENER, and the sheet it opens.
 *
 * Session 10 gave the coverage rail a side panel: segment → person → record,
 * with a breadcrumb, a frozen first column, sortable columns and an Excel
 * export. Session 13 puts the Planning cards on the same panel —
 * components/DrillSheet.jsx — rather than a second one that looks like it.
 *
 * The opener is an overlay button filling its card. The cards hold no
 * interactive elements of their own, so this makes the whole card a control
 * without rebuilding it, and a keyboard reaches it like any other button.
 */
export function PlanCardOpener({ card, label, onOpen, ready }) {
  if (!ready) return null;
  return (
    <button
      type="button"
      onClick={() => onOpen(card)}
      data-testid={`plan-card-${card}`}
      title={`Open ${label}`}
      aria-label={`Open ${label}`}
      className="absolute inset-0 w-full h-full cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary rounded-2xl hover:bg-foreground/[0.02]"
    />
  );
}

/**
 * The sheet for one card.
 *
 * `cards` is buildPlanningDrill's output — trees whose totals come from
 * computePlanningPageSummary, never re-added from the rows. Clicking a row
 * opens the record it stands for: a deal in the pipeline, a plan item on this
 * page's own list.
 *
 * The Planned gap card carries the Gap closer underneath its rows, with its
 * one action: open the plan-item form prefilled. Nothing is added here.
 */
export default function PlanningCardPanel({
  card, cards, onClose, scopeLabel, onAddToPlan, gapCloser,
}) {
  const navigate = useNavigate();
  if (!card || !cards?.[card]) return null;
  const node = cards[card];

  const openRecord = (row) => {
    if (row?.dealId) navigate("/sales-pipeline", { state: { openDealId: row.dealId } });
    // A plan item is already on this page; the list below is where it lives.
    else if (row?.oppId) onClose();
  };

  const isGap = card === "gap";
  const closers = gapCloser?.rows || [];

  return (
    <DrillSheet
      label={node.label}
      total={node.total}
      note={node.note}
      columns={node.columns}
      groupLabels={node.groupLabels || []}
      onOpenRecord={card === "required" ? undefined : openRecord}
      onClose={onClose}
      scopeLabel={scopeLabel}
      footerHint={isGap && closers.length ? "suggested customers, biggest usual order first" : null}
      extra={isGap && onAddToPlan ? (
        <div className="px-4 py-3 border-t border-gray-100">
          <p className="text-[11px] text-gray-500 mb-2">
            Adding one opens the plan form with the customer, the usual order and
            this month filled in. Nothing is saved until you confirm it.
          </p>
          <div className="flex flex-col gap-1.5">
            {closers.slice(0, 8).map((r) => (
              <div key={r.key} className="flex items-center justify-between gap-3 text-xs">
                <span className="truncate text-gray-700">{r.customer}</span>
                <button
                  type="button"
                  onClick={() => onAddToPlan(r)}
                  data-testid="gap-add-to-plan"
                  className="flex-shrink-0 text-[11px] px-2 py-1 rounded border border-gray-200 hover:bg-gray-50 font-mono"
                >
                  Add to plan · {Math.round(r.value).toLocaleString("en-US")}
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    >
      {node.children}
    </DrillSheet>
  );
}
