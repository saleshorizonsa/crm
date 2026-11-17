import React from "react";
import { PURPOSES } from "utils/visitPurpose";

/**
 * "Purpose" on every visit, call and WhatsApp form (session 40). Required:
 * Sales is chosen to start with. Rendered only once utils/visitPurpose says
 * the column exists. No amount on a collection (session 40a, CEO 2026-11-17).
 */
export default function PurposeField({ purpose, onPurpose, idPrefix = "purpose" }) {
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
    </div>
  );
}
