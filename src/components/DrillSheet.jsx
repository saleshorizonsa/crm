import React, { useEffect, useMemo, useRef, useState } from "react";

/**
 * THE DRILL-DOWN SHEET â€” one implementation, used by every screen that has
 * figures worth opening.
 *
 * Session 10 built this for the coverage rail: a sheet from the right, a
 * breadcrumb, a frozen first column, sortable wrapped headers, an Excel
 * export, Esc and outside-click to close. Session 13 needed the same thing on
 * Planning, and the rail's version was welded to coverage segments â€” exactly
 * the shape the rail itself was in before Session 10 (two hand-copied rails
 * that had already drifted). So the sheet moved here first, and both screens
 * are adapters onto it.
 *
 * WHAT IT TAKES IS A TREE, not a segment:
 *
 *   { label, total, unit, badge, note, columns, children: [...], rows: [...] }
 *
 * A node with `children` lists them and lets the reader open one; a node with
 * `rows` shows the table. Each child is { id, name, total, children?, rows? },
 * which is enough for one level (Planning: person â†’ rows), two (the rail at
 * company level: division â†’ person â†’ rows) or none at all (a card whose rows
 * belong to nobody in particular).
 *
 * The breadcrumb is the path taken, so stepping back is free, and the export
 * always writes what is on screen â€” the group list at a group level, the rows
 * at a leaf.
 */

export const money = (v) => Math.abs(Math.round(Number(v) || 0)).toLocaleString("en-US");
const fmtDate = (d) =>
  (d ? new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "â€”");
const fmtMonth = (d) =>
  (d ? new Date(d).toLocaleDateString("en-GB", { month: "short", year: "numeric" }) : "â€”");

/** One cell, formatted by its column type. Numbers never wrap. */
export function cellText(row, col) {
  const v = row[col.key];
  if (col.type === "money") return `${money(v)}${v < 0 ? " CR" : ""}`;
  if (col.type === "pct") return v == null ? "â€”" : `${Number(v).toFixed(0)}%`;
  if (col.type === "int") return v == null ? "â€”" : String(v);
  if (col.type === "date") return fmtDate(v);
  if (col.type === "month") return fmtMonth(v);
  if (col.type === "flags") return (v || []).join(" Â· ") || "â€”";
  return v == null || v === "" ? "â€”" : String(v);
}

export const FLAG_STYLE = {
  OVERDUE: "bg-red-50 text-red-700 border-red-200",
  UNDATED: "bg-amber-50 text-amber-700 border-amber-200",
  STUCK: "bg-amber-50 text-amber-700 border-amber-200",
  "NOT CONVERTED": "bg-amber-50 text-amber-700 border-amber-200",
  STALE: "bg-red-50 text-red-700 border-red-200",
};

/* â”€â”€ the table style of Session 9: frozen first column, wrapped headers â”€â”€â”€â”€â”€ */
export const STICKY_EDGE = "border-r border-gray-200 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.10)]";
export const HEAD_WRAP = "whitespace-normal break-words max-w-[7.5rem] align-bottom";

export function DrillTable({ columns, rows, onRowClick, emptyText }) {
  const [sort, setSort] = useState({ key: null, dir: "desc" });

  const sorted = useMemo(() => {
    if (!sort.key) return rows;
    const col = columns.find((c) => c.key === sort.key);
    const val = (r) => {
      const v = r[sort.key];
      if (col?.type === "flags") return (v || []).join(",");
      if (typeof v === "number") return v;
      return String(v ?? "").toLowerCase();
    };
    return [...rows].sort((a, b) => {
      const x = val(a);
      const y = val(b);
      if (x === y) return 0;
      const less = x < y ? -1 : 1;
      return sort.dir === "asc" ? less : -less;
    });
  }, [rows, sort, columns]);

  if (!rows.length) {
    return <div className="py-10 text-center text-sm text-gray-400">{emptyText}</div>;
  }

  const toggle = (key) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" }));

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-gray-50">
            {columns.map((c, i) => (
              <th
                key={c.key}
                scope="col"
                aria-sort={
                  sort.key === c.key
                    ? (sort.dir === "asc" ? "ascending" : "descending")
                    : "none"
                }
                className={[
                  "px-3 py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wide border-b border-gray-100 select-none",
                  i === 0
                    ? `text-left whitespace-nowrap sticky left-0 z-20 bg-gray-50 ${STICKY_EDGE}`
                    : `text-right ${HEAD_WRAP}`,
                ].join(" ")}
              >
                <button
                  type="button"
                  onClick={() => toggle(c.key)}
                  title={`Sort by ${c.label}`}
                  className={[
                    "w-full uppercase tracking-wide cursor-pointer hover:text-gray-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 rounded",
                    i === 0 ? "text-left" : `text-right ${HEAD_WRAP}`,
                  ].join(" ")}
                >
                  {c.label}
                  <span aria-hidden="true">
                    {sort.key === c.key ? (sort.dir === "asc" ? " â†‘" : " â†“") : ""}
                  </span>
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {sorted.map((r, idx) => (
            <tr
              key={r.dealId || r.oppId || idx}
              onClick={onRowClick ? () => onRowClick(r) : undefined}
              className={`group ${onRowClick ? "cursor-pointer" : ""} hover:bg-gray-50 transition-colors`}
            >
              {columns.map((c, i) => (
                <td
                  key={c.key}
                  className={[
                    "px-3 py-2.5",
                    i === 0
                      ? `sticky left-0 z-10 bg-white group-hover:bg-gray-50 ${STICKY_EDGE} font-medium text-gray-900`
                      : "text-right whitespace-nowrap font-mono",
                    c.type === "money" && Number(r[c.key]) < 0 ? "text-red-600" : "",
                  ].join(" ")}
                >
                  {c.type === "flags" ? (
                    (r.flags || []).length ? (
                      <span className="inline-flex gap-1 flex-wrap justify-end">
                        {r.flags.map((f) => (
                          <span
                            key={f}
                            className={`text-[9px] font-semibold px-1.5 py-0.5 rounded border ${FLAG_STYLE[f] || "bg-gray-50 text-gray-600 border-gray-200"}`}
                          >
                            {f}
                          </span>
                        ))}
                      </span>
                    ) : (
                      <span className="text-gray-300">â€”</span>
                    )
                  ) : (
                    cellText(r, c)
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Level-1 list: a name and a figure, clickable. */
export function GroupList({ items, onPick, unit }) {
  if (!items.length) {
    return <div className="py-10 text-center text-sm text-gray-400">Nothing in this segment.</div>;
  }
  const max = Math.max(...items.map((i) => Math.abs(i.total)), 1);
  return (
    <div className="divide-y divide-gray-50">
      {items.map((it) => (
        <button
          key={it.id}
          type="button"
          onClick={() => onPick(it)}
          className="w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors flex items-center gap-3"
        >
          <span className="flex-1 min-w-0">
            <span className="block text-sm font-medium text-gray-900 truncate">{it.name}</span>
            <span className="block mt-1 h-1 rounded-full bg-gray-100 overflow-hidden">
              <span
                className="block h-full rounded-full bg-gray-800"
                style={{ width: `${Math.min((Math.abs(it.total) / max) * 100, 100)}%` }}
              />
            </span>
          </span>
          <span className="font-mono text-sm text-gray-900 whitespace-nowrap">{money(it.total)}</span>
          <span className="text-gray-300">â€º</span>
        </button>
      ))}
      {unit && <div className="px-4 py-2 text-[10px] font-mono text-gray-400">{unit}</div>}
    </div>
  );
}

/** Rows â†’ a worksheet, using the same columns the panel shows. */
export function exportRows({ segment, columns, rows, scopeLabel }) {
  const header = columns.map((c) => c.label);
  const body = rows.map((r) => columns.map((c) => {
    const v = r[c.key];
    if (c.type === "flags") return (v || []).join(" ");
    if (typeof v === "number") return v;
    return v == null ? "" : String(v);
  }));
  const csv = [header, ...body]
    .map((line) => line.map((cell) => {
      const s = String(cell ?? "");
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(","))
    .join("\r\n");
  // A BOM so Excel opens Arabic customer names in UTF-8 rather than mojibake.
  const blob = new Blob([`ï»¿${csv}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${segment}-${scopeLabel || "coverage"}.csv`.replace(/\s+/g, "-").toLowerCase();
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
/* â”€â”€ the sheet â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

/** The node the reader is looking at, walked down from the root by `path`. */
function nodeAt(root, path) {
  return path.reduce((n, id) => (n?.children || []).find((c) => c.id === id) || n, root);
}

/**
 * The columns in force at this depth.
 *
 * A branch may carry its own: Planning's coverage card opens onto open plan
 * items on one side and funnel deals on the other, which are different rows
 * with different columns under one total. The deepest `columns` on the path
 * wins, so a person node inherits whichever half it hangs under.
 */
function columnsAt(root, path, fallback) {
  let cols = fallback;
  let node = root;
  if (node.columns) cols = node.columns;
  for (const id of path) {
    node = (node.children || []).find((c) => c.id === id) || node;
    if (node.columns) cols = node.columns;
  }
  return cols || [];
}

export default function DrillSheet({
  label,
  total,
  unit = "SAR",
  badge = null,
  note = null,
  columns = [],
  children: tree = null,
  rows = null,
  groupLabels = [],
  onOpenRecord,
  onClose,
  scopeLabel = "",
  footerHint = null,
  extra = null,
}) {
  const [path, setPath] = useState([]);
  const panelRef = useRef(null);

  // Esc closes, and the panel takes focus so a keyboard user is inside it.
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    panelRef.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const root = { id: "__root", name: label, total, children: tree, rows };
  const node = nodeAt(root, path);
  const atLeaf = !node.children || node.children.length === 0;
  const leafRows = atLeaf ? (node.rows || []) : [];
  const cols = columnsAt(root, path, columns);

  const crumbs = [
    { label, onClick: () => setPath([]) },
    ...path.map((id, i) => ({
      label: nodeAt(root, path.slice(0, i + 1)).name,
      onClick: i === path.length - 1 ? null : () => setPath(path.slice(0, i + 1)),
    })),
  ];

  const groupHint = groupLabels[path.length] || null;

  return (
    <>
      {/* The page stays visible behind: the scrim covers it, and clicking
          closes. */}
      <div
        className="fixed inset-0 z-40 bg-gray-900/20"
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-label={`${label} breakdown`}
        className="fixed z-50 top-0 right-0 bottom-0 w-full sm:w-[min(640px,100vw)] bg-white shadow-2xl flex flex-col focus:outline-none"
      >
        <header className="px-4 py-3 border-b border-gray-200 flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <nav className="flex items-center gap-1 text-[11px] font-mono text-gray-400 flex-wrap">
              {crumbs.map((c, i) => (
                <span key={`${c.label}-${i}`} className="flex items-center gap-1">
                  {i > 0 && <span>â€º</span>}
                  {c.onClick ? (
                    <button type="button" onClick={c.onClick} className="hover:text-gray-700 underline decoration-dotted">
                      {c.label}
                    </button>
                  ) : (
                    <span className="text-gray-700">{c.label}</span>
                  )}
                </span>
              ))}
            </nav>
            <div className="mt-1 flex items-baseline gap-2 flex-wrap">
              <span className="text-xl font-semibold font-mono text-gray-900">
                {money(node.total)}
              </span>
              <span className="text-xs text-gray-500">{unit}</span>
              {badge && (
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded border bg-gray-50 text-gray-600 border-gray-200">
                  {badge}
                </span>
              )}
            </div>
            {note && path.length === 0 && (
              <p className="mt-1 text-[11px] text-gray-500">{note}</p>
            )}
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              type="button"
              onClick={() => exportRows({
                segment: label,
                columns: atLeaf
                  ? cols
                  : [
                    { key: "name", label: groupHint || "Name" },
                    { key: "total", label, type: "money" },
                  ],
                rows: atLeaf ? leafRows : node.children,
                scopeLabel: path.length ? node.name : scopeLabel,
              })}
              className="text-[11px] px-2 py-1 rounded border border-gray-200 hover:bg-gray-50"
            >
              Export to Excel
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="w-8 h-8 rounded hover:bg-gray-100 text-gray-500 text-lg leading-none"
            >
              Ã—
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto">
          {atLeaf ? (
            <>
              <DrillTable
                columns={cols}
                rows={leafRows}
                onRowClick={onOpenRecord ? (r) => onOpenRecord(r) : undefined}
                emptyText="No rows."
              />
              {extra}
            </>
          ) : (
            <GroupList
              items={node.children}
              onPick={(it) => setPath([...path, it.id])}
              unit={groupHint}
            />
          )}
        </div>

        <footer className="px-4 py-2 border-t border-gray-100 text-[10px] font-mono text-gray-400">
          {atLeaf
            ? `${leafRows.length} rows${onOpenRecord ? " Â· click a row to open it" : ""}`
            : `${node.children.length} ${groupHint ? groupHint.toLowerCase() : "groups"}`}
          {footerHint ? ` Â· ${footerHint}` : ""}
        </footer>
      </aside>
    </>
  );
}


