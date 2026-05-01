import React from "react";
import Icon from "../../../components/AppIcon";
import { useCurrency } from "../../../contexts/CurrencyContext";
import { useLanguage } from "../../../i18n";

const CompanyPerformanceGrid = ({
  companies,
  onCompanySelect,
  selectedCompany,
  selectedMonth,
  selectedQuarter,
  selectedYear,
  timePeriod = "month",
}) => {
  const { formatCurrency, preferredCurrency } = useCurrency();
  const { t } = useLanguage();

  // Generate period label based on filters
  const getPeriodLabel = () => {
    if (selectedMonth !== null && selectedYear !== null) {
      const monthNames = [
        "Jan",
        "Feb",
        "Mar",
        "Apr",
        "May",
        "Jun",
        "Jul",
        "Aug",
        "Sep",
        "Oct",
        "Nov",
        "Dec",
      ];
      return `${monthNames[selectedMonth]} ${selectedYear}`;
    }
    if (selectedQuarter !== null && selectedYear !== null) {
      return `Q${selectedQuarter + 1} ${selectedYear}`;
    }
    if (selectedYear !== null) {
      return `${selectedYear}`;
    }
    // Default to current period
    const now = new Date();
    if (timePeriod === "month") {
      const monthNames = [
        "Jan",
        "Feb",
        "Mar",
        "Apr",
        "May",
        "Jun",
        "Jul",
        "Aug",
        "Sep",
        "Oct",
        "Nov",
        "Dec",
      ];
      return `${monthNames[now.getMonth()]} ${now.getFullYear()}`;
    }
    if (timePeriod === "quarter") {
      const quarter = Math.floor(now.getMonth() / 3) + 1;
      return `Q${quarter} ${now.getFullYear()}`;
    }
    return `${now.getFullYear()}`;
  };

  const periodLabel = getPeriodLabel();

  const getPerformanceColor = (percentage) => {
    if (percentage >= 80) return "text-green-600 bg-green-50";
    if (percentage >= 60) return "text-yellow-600 bg-yellow-50";
    return "text-red-600 bg-red-50";
  };

  const getIndustryIcon = (industry) => {
    const iconMap = {
      Manufacturing: "Factory",
      "Technology Solutions": "Monitor",
      "PVC Manufacturing": "Package",
      "Steel Manufacturing": "Zap",
    };
    return iconMap[industry] || "Building2";
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-gray-900">
          {t("dashboard.companyPerformance")}
        </h3>
        <span className="text-sm text-gray-500">
          {companies.length} {t("nav.companies")}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-4 gap-4">
        {companies.map((company) => {
          const isSelected = selectedCompany?.id === company.id;
          const performance = company.metrics?.targetAchievement || 0;

          return (
            <div
              key={company.id}
              onClick={() => onCompanySelect(company)}
              className={`
                relative p-4 rounded-lg border-2 cursor-pointer transition-all duration-200 hover:shadow-md
                ${
                  isSelected
                    ? "border-blue-500 bg-blue-50"
                    : "border-gray-200 bg-white hover:border-gray-300"
                }
              `}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center space-x-2">
                  <div
                    className={`
                    w-8 h-8 rounded-lg flex items-center justify-center
                    ${isSelected ? "bg-blue-500" : "bg-gray-100"}
                  `}
                  >
                    <Icon
                      name={getIndustryIcon(company.industry)}
                      size={16}
                      color={isSelected ? "white" : "#6B7280"}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h4 className="font-medium text-gray-900 truncate text-sm">
                      {company.name}
                    </h4>
                    <p className="text-xs text-gray-500 truncate">
                      {company.industry}
                    </p>
                  </div>
                </div>

                {isSelected && (
                  <Icon name="Check" size={16} className="text-blue-500" />
                )}
              </div>

              <div className="space-y-3">
                {/* Revenue */}
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-xs text-gray-500">
                      {periodLabel} {t("dashboard.revenue")}
                    </span>
                    <span className="text-sm font-semibold text-gray-900">
                      {formatCurrency(company.metrics?.totalRevenue)}
                    </span>
                  </div>
                </div>

                {/* Remaining Revenue */}
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-xs text-gray-500">
                      Remaining Revenue
                    </span>
                    <span className="text-sm font-semibold text-gray-900">
                      {formatCurrency(company.metrics?.remainingRevenue || 0)}
                    </span>
                  </div>
                </div>

                {/* Active Deals */}
                <div className="flex justify-between items-center">
                  <span className="text-xs text-gray-500">
                    {t("dashboard.activeDeals")}
                  </span>
                  <span className="text-sm font-medium text-gray-700">
                    {company.metrics?.activeDeals || 0}
                  </span>
                </div>

                {/* Team Size */}
                <div className="flex justify-between items-center">
                  <span className="text-xs text-gray-500">
                    {t("dashboard.teamSize")}
                  </span>
                  <span className="text-sm font-medium text-gray-700">
                    {company.metrics?.teamSize || 0}{" "}
                    {t("admin.teamMembers").toLowerCase()}
                  </span>
                </div>
              </div>

              {/* Performance indicator */}
              <div
                className={`
                absolute top-2 right-2 w-2 h-2 rounded-full
                ${
                  performance >= 80
                    ? "bg-green-500"
                    : performance >= 60
                      ? "bg-yellow-500"
                      : "bg-red-500"
                }
              `}
              ></div>
            </div>
          );
        })}
      </div>

      {/* Summary Statistics */}
      <div className="mt-6 pt-4 border-t border-gray-200">
        <div className="grid grid-cols-4 gap-4">
          <div className="text-center">
            <div className="text-xs text-gray-500">
              {t("dashboard.totalRevenue")}
            </div>
            <div className="text-lg font-semibold text-gray-900">
              {formatCurrency(
                companies.reduce(
                  (sum, c) => sum + (c.metrics?.totalRevenue || 0),
                  0,
                ),
                preferredCurrency,
              )}
            </div>
          </div>
          <div className="text-center">
            <div className="text-xs text-gray-500">
              {t("reports.avgPerformance")}
            </div>
            <div className="text-lg font-semibold text-blue-600">
              {companies.length > 0
                ? (
                    companies.reduce(
                      (sum, c) => sum + (c.metrics?.targetAchievement || 0),
                      0,
                    ) / companies.length
                  ).toFixed(0)
                : 0}
              %
            </div>
          </div>
          <div className="text-center">
            <div className="text-xs text-gray-500">
              {t("reports.totalDeals")}
            </div>
            <div className="text-lg font-semibold text-purple-600">
              {companies.reduce(
                (sum, c) => sum + (c.metrics?.activeDeals || 0),
                0,
              )}
            </div>
          </div>
          <div className="text-center">
            <div className="text-xs text-gray-500">
              {t("reports.totalTeam")}
            </div>
            <div className="text-lg font-semibold text-green-600">
              {companies.reduce(
                (sum, c) => sum + (c.metrics?.teamSize || 0),
                0,
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CompanyPerformanceGrid;
