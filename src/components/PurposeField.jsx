import React from "react";
import { PURPOSES } from "utils/visitPurpose";

/**
 * "Purpose" on every visit, call and WhatsApp form (session 40). Required:
 * Sales is chosen to start with. Collection adds "Amount collected (SAR)",
 * optional. Rendered only once utils/visitPurpose says the columns exist.
 */
export default function PurposeField({ purpose, amount, onPurpose, onAmount, error = null, idPrefix = "purpose" }) {
  return (
    <div data-testid={`${idPrefix}-field`}>
      <label className="text-xs font-medium text-gray-700 mb-2 block">Purpose *</label>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2" role="radiogroup" aria-label="Purpose">
        {PURPOSES.map((p) => {
          const active = purpose === p.id;
          return (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={active}
              data-testid={`${idPrefix}-${p.id}`}
              onClick={() => onPurpose(p.id)}
              className={`py-2 px-2 rounded-xl border text-xs font-medium transition-colors ${active ? "border-blue-400 bg-blue-50 text-blue-700" : "border-gray-300 text-gray-700 hover:bg-gray-50"}`}
            >
              {p.label}
            </button>
          );
        })}
      </div>
      {purpose === "collection" && (
        <div className="mt-3">
          <label htmlFor={`${idPrefix}-amount`} className="text-xs font-medium text-gray-700 mb-1.5 block">
            Amount collected (SAR)<span className="text-gray-400 font-normal ml-1">(optional)</span>
          </label>
          <input
            id={`${idPrefix}-amount`}
            data-testid={`${idPrefix}-amount`}
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            value={amount}
            onChange={(e) => onAmount(e.target.value)}
            placeholder="e.g. 25000"
            className={`w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 ${error ? "border-red-400" : "border-gray-300"}`}
          />
          {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
        </div>
      )}
    </div>
  );
}
