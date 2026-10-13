import React from "react";

/** The small "Export" tag next to an export customer's name. */
export default function ExportTag({ className = "" }) {
  return (
    <span
      data-testid="export-tag"
      title="Export customer — always counted in the Export division"
      className={`inline-flex items-center text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded border border-sky-300 bg-sky-50 text-sky-800 align-middle ${className}`}
    >
      Export
    </span>
  );
}
