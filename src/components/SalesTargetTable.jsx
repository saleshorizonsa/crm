import React, { useState } from "react";
import Icon from "./AppIcon";
import { useCurrency } from "../contexts/CurrencyContext";

const BAR_COLOR = (pct) =>
  pct >= 80 ? "bg-green-500" : pct >= 50 ? "bg-blue-500" : "bg-red-500";

const TYPE_BADGE = {
  by_clients: "bg-purple-100 text-purple-800",
  by_products: "bg-orange-100 text-orange-800",
  total_value: "bg-blue-100 text-blue-800",
  by_value: "bg-blue-100 text-blue-800",
};

const TYPE_LABEL = {
  by_clients: "By Clients",
  by_products: "By Product",
  total_value: "Total Value",
  by_value: "By Value",
};

const STATUS_BADGE = {
  active: "bg-green-100 text-green-700",
  completed: "bg-blue-100 text-blue-700",
  overdue: "bg-red-100 text-red-700",
  expired: "bg-gray-100 text-gray-500",
};

const SalesTargetTable = ({
  targets = [],
  quantityRows = null,
  role = "salesman",
  onEdit,
  onDelete,
  showAssignedBy = false,
  loading = false,
  title = "Active Sales Targets",
  headerControls = null,
}) => {
  const { formatCurrency } = useCurrency();
  const [view, setView] = useState("value");

  const showToggle = quantityRows !== null;
  const isSalesmanView = role === "salesman";
  const showActions = !isSalesmanView && (onEdit || onDelete);
  const showAssignedByCol = showAssignedBy && !isSalesmanView;

  const colCount =
    1 + 1 + 1 + 1 + 1 +
    (showAssignedByCol ? 1 : 0) +
    (showActions ? 1 : 0);

  const displayRows = view === "quantity" ? (quantityRows || []) : targets;

  const getInitial = (name) => (name || "?")[0].toUpperCase();

  const getMember = (target) => {
    if (isSalesmanView) {
      const name = target.assigner?.full_name || target.assigner?.email || "Supervisor";
      return { name, role: target.assigner?.role, initial: getInitial(name) };
    }
    const name = target.assignee?.full_name || target.assignee?.email || "Unknown";
    return { name, role: target.assignee?.role, initial: getInitial(name) };
  };

  if (loading) {
    return (
      <div className="w-full bg-white rounded-lg border border-gray-100 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <span className="text-sm font-medium text-gray-700">{title}</span>
        </div>
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-4 border-b border-gray-50 animate-pulse">
            <div className="w-8 h-8 bg-gray-100 rounded-full flex-shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-3 bg-gray-100 rounded w-28" />
              <div className="h-2 bg-gray-100 rounded w-16" />
            </div>
            <div className="h-3 bg-gray-100 rounded w-20" />
            <div className="h-3 bg-gray-100 rounded w-16" />
            <div className="h-3 bg-gray-100 rounded w-24" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="w-full bg-white rounded-lg border border-gray-100 overflow-hidden">
      {/* Card header */}
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-gray-100 flex-wrap">
        <span className="text-sm font-medium text-gray-700">{title}</span>
        <div className="flex items-center gap-2 flex-wrap">
          {headerControls}
          {showToggle && (
            <div className="inline-flex rounded-md border border-gray-200 overflow-hidden">
              <button
                type="button"
                onClick={() => setView("value")}
                className={`px-3 py-1 text-xs font-medium transition-colors ${
                  view === "value"
                    ? "bg-blue-600 text-white"
                    : "bg-white text-gray-600 hover:bg-gray-50"
                }`}
              >
                Value
              </button>
              <button
                type="button"
                onClick={() => setView("quantity")}
                className={`px-3 py-1 text-xs font-medium border-l border-gray-200 transition-colors ${
                  view === "quantity"
                    ? "bg-blue-600 text-white"
                    : "bg-white text-gray-600 hover:bg-gray-50"
                }`}
              >
                Quantity
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Scrollable table */}
      <div className="w-full overflow-x-auto">
        <table className="w-full min-w-[750px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/60">
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase tracking-wide">
                {isSalesmanView ? "Assigned By" : "Team Member"}
              </th>
              <th className="text-right px-4 py-3 text-xs font-medium text-gray-400 uppercase tracking-wide w-[140px]">
                {view === "quantity" ? "Target Qty" : "Target Amount"}
              </th>
              <th className="text-center px-4 py-3 text-xs font-medium text-gray-400 uppercase tracking-wide w-[120px]">
                Type
              </th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase tracking-wide w-[160px]">
                Period
              </th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase tracking-wide w-[150px]">
                Progress
              </th>
              {showAssignedByCol && (
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase tracking-wide w-[130px]">
                  Assigned By
                </th>
              )}
              {showActions && (
                <th className="px-4 py-3 w-[70px]" aria-label="Actions" />
              )}
            </tr>
          </thead>
          <tbody>
            {displayRows.length === 0 ? (
              <tr>
                <td
                  colSpan={colCount}
                  className="px-4 py-8 text-center text-sm text-gray-400"
                >
                  No active targets for this period
                </td>
              </tr>
            ) : (
              displayRows.map((target, idx) => {
                const isQtyRow = view === "quantity";
                const member = getMember(target);

                // Progress
                let pct = 0;
                let progressLabel = "";
                if (isQtyRow) {
                  const tq = parseFloat(target.target_quantity || 0);
                  const aq = parseFloat(target.achieved_quantity || 0);
                  pct = tq > 0 ? Math.min(100, (aq / tq) * 100) : 0;
                  progressLabel = `${aq.toLocaleString()} / ${tq.toLocaleString()} · ${pct.toFixed(1)}%`;
                } else {
                  const prog = parseFloat(
                    target.calculated_progress ?? target.progress_amount ?? 0,
                  );
                  const amt = parseFloat(target.target_amount || 0);
                  pct = amt > 0 ? Math.min(100, (prog / amt) * 100) : 0;
                  progressLabel = `${formatCurrency(prog, target.currency)} · ${pct.toFixed(1)}%`;
                }

                const barColor = BAR_COLOR(pct);
                const targetType = target.target_type || "total_value";
                const typeClass = TYPE_BADGE[targetType] || TYPE_BADGE.total_value;
                const typeLabel = isQtyRow ? "By Product" : (TYPE_LABEL[targetType] || "Total Value");
                const status = target.status;
                const periodType =
                  target.period_type ||
                  target.parentTarget?.period_type ||
                  "";

                const editTarget = target.parentTarget || target;
                const deleteTarget = target.parentTarget || target;

                return (
                  <tr
                    key={target.id || idx}
                    className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors"
                  >
                    {/* Team Member / Assigned By */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 text-xs font-semibold flex-shrink-0">
                          {member.initial}
                        </div>
                        <div className="min-w-0">
                          <div className="font-medium text-gray-800 truncate leading-tight">
                            {member.name}
                          </div>
                          {member.role && (
                            <div className="text-xs text-gray-400 capitalize">
                              {member.role}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Target Amount / Qty */}
                    <td className="px-4 py-3 text-right font-medium text-gray-800 w-[140px]">
                      {isQtyRow
                        ? `${parseFloat(target.target_quantity || 0).toLocaleString()} qty`
                        : formatCurrency(target.target_amount, target.currency)}
                    </td>

                    {/* Type */}
                    <td className="px-4 py-3 text-center w-[120px]">
                      <span className={`inline-block px-2 py-0.5 text-xs rounded-full ${typeClass}`}>
                        {typeLabel}
                      </span>
                    </td>

                    {/* Period + Status badge */}
                    <td className="px-4 py-3 w-[160px]">
                      <div className="flex items-center gap-1 flex-wrap">
                        <span className="text-xs font-medium text-gray-700 capitalize">
                          {periodType}
                        </span>
                        {status && (
                          <span
                            className={`px-1.5 py-0.5 text-[10px] rounded-full ${
                              STATUS_BADGE[status] || "bg-gray-100 text-gray-500"
                            }`}
                          >
                            {status}
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-gray-400 mt-0.5">
                        {target.period_start
                          ? new Date(target.period_start).toLocaleDateString()
                          : ""}
                        {" – "}
                        {target.period_end
                          ? new Date(target.period_end).toLocaleDateString()
                          : ""}
                      </div>
                    </td>

                    {/* Progress bar */}
                    <td className="px-4 py-3 w-[150px]">
                      <div className="w-full bg-gray-100 rounded-full h-1.5">
                        <div
                          className={`h-1.5 rounded-full transition-all ${barColor}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <div className="text-[11px] text-gray-400 mt-1 leading-tight">
                        {progressLabel}
                      </div>
                    </td>

                    {/* Assigned By (optional) */}
                    {showAssignedByCol && (
                      <td className="px-4 py-3 text-xs text-gray-500 w-[130px]">
                        {target.assigner?.full_name || target.assigner?.email || "–"}
                      </td>
                    )}

                    {/* Actions */}
                    {showActions && (
                      <td className="px-4 py-3 w-[70px]">
                        <div className="flex items-center justify-end gap-0.5">
                          {onEdit && (
                            <button
                              onClick={() => onEdit(editTarget)}
                              className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors"
                              title="Edit target"
                            >
                              <Icon name="Pencil" size={13} />
                            </button>
                          )}
                          {onDelete && (
                            <button
                              onClick={() => onDelete(deleteTarget)}
                              className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
                              title="Delete target"
                            >
                              <Icon name="Trash2" size={13} />
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default SalesTargetTable;
