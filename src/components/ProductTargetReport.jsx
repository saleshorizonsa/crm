import React, { useState } from "react";
import Icon from "./AppIcon";

const getProductName = (target) =>
  target.product?.material || target.product?.description || target.product_group || "Unknown";

const getProgress = (target, mode) => {
  const targetValue =
    mode === "quantity"
      ? parseFloat(target.target_quantity || 0)
      : parseFloat(target.target_value || target.target_amount || 0);
  const achievedValue =
    mode === "quantity"
      ? parseFloat(target.achieved_quantity || 0)
      : parseFloat(target.achieved_value || target.achieved || 0);

  return targetValue > 0 ? (achievedValue / targetValue) * 100 : null;
};

const ProductTargetReport = ({
  title = "Product Target Performance",
  productTargets = [],
  formatCurrency,
  defaultMode = "value",
  emptyMessage = "No product target data available yet.",
  showUser = false,
  showPeriod = false,
}) => {
  const [mode, setMode] = useState(defaultMode);

  const formatMoney = (amount) =>
    formatCurrency ? formatCurrency(amount) : Number(amount || 0).toLocaleString();

  const visibleTargets = (productTargets || []).filter((target) => {
    const targetValue =
      mode === "quantity"
        ? parseFloat(target.target_quantity || 0)
        : parseFloat(target.target_value || target.target_amount || 0);
    return targetValue > 0;
  });

  const sortedTargets = [...visibleTargets].sort((a, b) => {
    const aProgress = getProgress(a, mode) ?? -1;
    const bProgress = getProgress(b, mode) ?? -1;
    return bProgress - aProgress;
  });

  const currentEmptyMessage =
    productTargets?.length && !visibleTargets.length
      ? mode === "quantity"
        ? "No quantity-based product targets available for this report."
        : "No value-based product targets available for this report."
      : emptyMessage;

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <div className="flex items-center justify-between gap-4 mb-4">
        <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
          <Icon name="Package" size={20} className="text-orange-600" />
          {title}
        </h3>
        <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden">
          <button
            type="button"
            onClick={() => setMode("value")}
            className={`px-3 py-1.5 text-sm font-medium ${
              mode === "value"
                ? "bg-orange-600 text-white"
                : "bg-white text-gray-700 hover:bg-gray-50"
            }`}
          >
            Value
          </button>
          <button
            type="button"
            onClick={() => setMode("quantity")}
            className={`px-3 py-1.5 text-sm font-medium ${
              mode === "quantity"
                ? "bg-orange-600 text-white"
                : "bg-white text-gray-700 hover:bg-gray-50"
            }`}
          >
            Quantity
          </button>
        </div>
      </div>

      {!visibleTargets.length ? (
        <div className="text-center py-8 bg-gray-50 border border-dashed border-gray-200 rounded-lg">
          <Icon
            name="Package"
            size={32}
            className="mx-auto text-gray-400 mb-2"
          />
          <p className="text-sm text-gray-600">{currentEmptyMessage}</p>
        </div>
      ) : (
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              {showUser && (
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  User
                </th>
              )}
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Product
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Target
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Achieved
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Progress
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Gap
              </th>
              {showPeriod && (
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Period
                </th>
              )}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {sortedTargets.map((target) => {
              const targetValue =
                mode === "quantity"
                  ? parseFloat(target.target_quantity || 0)
                  : parseFloat(target.target_value || target.target_amount || 0);
              const achievedValue =
                mode === "quantity"
                  ? parseFloat(target.achieved_quantity || 0)
                  : parseFloat(target.achieved_value || target.achieved || 0);
              const progress = getProgress(target, mode);
              const gap = Math.max(0, targetValue - achievedValue);

              return (
                <tr key={`${target.sales_target_id || "target"}-${target.product_id || target.id}`}>
                  {showUser && (
                    <td className="px-4 py-3">
                      <div className="text-sm font-medium text-gray-900">
                        {target.assignee?.full_name ||
                          target.sales_target?.assignee?.full_name ||
                          "Unknown"}
                      </div>
                      <div className="text-xs text-gray-500">
                        {target.assignee?.email ||
                          target.sales_target?.assignee?.email ||
                          target.assignee?.role ||
                          target.sales_target?.assignee?.role ||
                          ""}
                      </div>
                    </td>
                  )}
                  <td className="px-4 py-3">
                    <div className="text-sm font-medium text-gray-900">
                      {getProductName(target)}
                    </div>
                    <div className="text-xs text-gray-500">
                      {target.product?.material_group || target.product_group || "No group"}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-900">
                    {targetValue > 0
                      ? mode === "quantity"
                        ? targetValue.toLocaleString()
                        : formatMoney(targetValue)
                      : "N/A"}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-900">
                    {targetValue > 0
                      ? mode === "quantity"
                        ? achievedValue.toLocaleString()
                        : formatMoney(achievedValue)
                      : "N/A"}
                  </td>
                  <td className="px-4 py-3">
                    {progress === null ? (
                      <span className="text-sm text-gray-500">N/A</span>
                    ) : (
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {progress.toFixed(1)}%
                        </div>
                        <div className="w-28 bg-gray-200 rounded-full h-1.5 mt-1">
                          <div
                            className={`h-1.5 rounded-full ${
                              progress >= 100
                                ? "bg-green-500"
                                : progress >= 70
                                  ? "bg-blue-500"
                                  : progress >= 40
                                    ? "bg-amber-500"
                                    : "bg-red-500"
                            }`}
                            style={{ width: `${Math.min(progress, 100)}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-900">
                    {targetValue > 0
                      ? mode === "quantity"
                        ? gap.toLocaleString()
                        : formatMoney(gap)
                      : "N/A"}
                  </td>
                  {showPeriod && (
                    <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
                      {target.sales_target?.period_start || target.period_start
                        ? `${new Date(
                            target.sales_target?.period_start ||
                              target.period_start,
                          ).toLocaleDateString()} - ${new Date(
                            target.sales_target?.period_end ||
                              target.period_end,
                          ).toLocaleDateString()}`
                        : "N/A"}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      )}
    </div>
  );
};

export default ProductTargetReport;
