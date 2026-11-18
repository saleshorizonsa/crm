import React from "react";
import { useLanguage } from "../../i18n";
import { strategyColour } from "utils/strategyColours";
import { strategyLabel, NOT_SET } from "utils/customerStrategy";

/**
 * Sales Monitor stage pages — "By strategy" (session 48): each strategy's part
 * of the page's figure and its % of it. The parts are the same rows and the
 * same total function as the header, so they add up to it. Clicking a part
 * shows only those customers; clicking it again shows all.
 */
export default function StrategyStrip({ parts, total, selected, onPick, format }) {
  const { t } = useLanguage();
  if (!parts) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5" data-testid="strategy-strip" data-total={total}>
      <span className="text-xs font-medium text-gray-600 mr-1">{t("strategy.byStrategy")}:</span>
      {parts.map((p) => {
        const c = strategyColour(p.key);
        const active = selected === p.key;
        const empty = !p.count;
        return (
          <button
            key={p.key}
            type="button"
            disabled={empty && !active}
            aria-pressed={active}
            data-testid={`strategy-part-${p.key}`}
            data-value={p.value}
            onClick={() => onPick(active ? null : p.key)}
            className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs border ${empty && !active ? "opacity-50 cursor-default" : "hover:shadow-sm"}`}
            style={active
              ? { background: c.bg, color: c.text, borderColor: c.colour }
              : { background: "#fff", color: "#334155", borderColor: "#E2E8F0", borderStyle: p.key === NOT_SET ? "dashed" : "solid" }}
          >
            <span aria-hidden="true" className="inline-block w-2 h-2 rounded-full" style={p.key === NOT_SET ? { border: `1px dashed ${c.colour}` } : { background: c.colour }} />
            <span className="font-medium">{strategyLabel(p.key, t)}</span>
            <span className="tabular-nums">{format(p.value)}</span>
            <span className="tabular-nums text-gray-500">{p.pct === null ? "—" : `${Math.round(p.pct)}%`}</span>
          </button>
        );
      })}
    </div>
  );
}
