import * as XLSX from "xlsx";

// ── Excel export ─────────────────────────────────────────────────────────────

/**
 * Export an array of named sheets to a single .xlsx file.
 * @param {Array<{name: string, data: object[]}>} sheets
 * @param {string} filename  — written as filename.xlsx
 */
export function exportToExcel(sheets, filename) {
  const wb = XLSX.utils.book_new();

  sheets.forEach(({ name, data }) => {
    if (!data || data.length === 0) return;

    const ws = XLSX.utils.json_to_sheet(data);

    // Auto-size columns from header + content widths
    const keys = Object.keys(data[0] || {});
    ws["!cols"] = keys.map((k) => {
      const maxLen = Math.max(
        k.length,
        ...data.map((r) => String(r[k] ?? "").length),
      );
      return { wch: Math.min(maxLen + 2, 50) };
    });

    XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31));
  });

  XLSX.writeFile(wb, `${filename}.xlsx`);
}

// ── CSV export ───────────────────────────────────────────────────────────────

/**
 * Convert an object array to a CSV file and trigger a browser download.
 * @param {object[]} data
 * @param {string}   filename  — written as filename.csv
 */
export function exportToCsv(data, filename) {
  if (!data || data.length === 0) return;

  const ws  = XLSX.utils.json_to_sheet(data);
  const csv = XLSX.utils.sheet_to_csv(ws);

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
