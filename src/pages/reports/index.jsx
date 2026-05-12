import React, { useState, useEffect, useCallback } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { useCurrency } from "../../contexts/CurrencyContext";
import { reportService, computeDateRange } from "../../services/reportService";
import ByValue    from "./components/ByValue";
import ByProduct  from "./components/ByProduct";
import ByClient   from "./components/ByClient";
import ByLocation from "./components/ByLocation";
import BySalesman from "./components/BySalesman";
import { useLanguage } from "../../i18n";

const today = () => new Date().toISOString().split("T")[0];
const firstOfYear = () => `${new Date().getFullYear()}-01-01`;

const ReportsPage = () => {
  const { t } = useLanguage();
  const { userProfile, company } = useAuth();
  const { formatCurrency } = useCurrency();

  const TABS = [
    { id: "value",    label: t("reportsPage.byValue"),    icon: "💰" },
    { id: "product",  label: t("reportsPage.byProduct"),  icon: "📦" },
    { id: "client",   label: t("reportsPage.byClient"),   icon: "🤝" },
    { id: "location", label: t("reportsPage.byCompany"),  icon: "🏢" },
    { id: "salesman", label: t("reportsPage.bySalesman"), icon: "👤" },
  ];

  const PRESETS = [
    { value: "this_month",   label: t("reportsPage.thisMonth")   },
    { value: "last_month",   label: t("reportsPage.lastMonth")   },
    { value: "this_quarter", label: t("reportsPage.thisQuarter") },
    { value: "last_quarter", label: t("reportsPage.lastQuarter") },
    { value: "this_year",    label: t("reportsPage.thisYear")    },
    { value: "last_year",    label: t("reportsPage.lastYear")    },
    { value: "all",          label: t("reportsPage.allTime")     },
    { value: "custom",       label: t("reportsPage.custom")      },
  ];

  const [activeTab, setActiveTab] = useState("value");
  const [period, setPeriod]       = useState("this_year");
  const [customFrom, setCustomFrom] = useState(firstOfYear);
  const [customTo, setCustomTo]     = useState(today);
  const [deals, setDeals]         = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);

  const getDateRange = useCallback(() => {
    if (period === "custom") {
      return {
        from: customFrom ? new Date(customFrom).toISOString() : null,
        to:   customTo   ? new Date(customTo + "T23:59:59").toISOString() : null,
      };
    }
    return computeDateRange(period);
  }, [period, customFrom, customTo]);

  const fetchDeals = useCallback(async () => {
    if (!userProfile || !company) return;
    setLoading(true);
    setError(null);

    const { from, to } = getDateRange();
    const { data, error: err } = await reportService.getReportDeals(
      company.id,
      userProfile.id,
      userProfile.role,
      from,
      to,
    );

    if (err) setError(err.message || "Failed to load report data.");
    else setDeals(data);
    setLoading(false);
  }, [userProfile, company, getDateRange]);

  useEffect(() => {
    if (period !== "custom") fetchDeals();
  }, [period]);                                    // eslint-disable-line

  useEffect(() => {
    fetchDeals();
  }, []);                                          // eslint-disable-line

  const roleLabel = () => {
    const role = userProfile?.role;
    if (["director", "admin", "ceo"].includes(role)) return t("reportsPage.allCompanyDeals");
    if (role === "salesman") return t("reportsPage.yourDealsOnly");
    return t("reportsPage.yourTeamDeals");
  };

  const activePeriodLabel = () => {
    if (period === "custom") {
      if (customFrom && customTo) return `${customFrom} → ${customTo}`;
      if (customFrom) return `${t("common.from")} ${customFrom}`;
      if (customTo)   return `${t("common.to")} ${customTo}`;
      return t("reportsPage.allTime");
    }
    return PRESETS.find((p) => p.value === period)?.label || "";
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-7xl mx-auto">

          {/* Title row */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
            <div>
              <h1 className="text-xl font-bold text-gray-900">{t("reportsPage.title")}</h1>
              <p className="text-xs text-gray-400 mt-0.5">{roleLabel()}</p>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5">
              <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span className="font-medium text-gray-700">{activePeriodLabel()}</span>
              <span className="text-gray-300 mx-0.5">·</span>
              <span>{deals.length} deal{deals.length !== 1 ? "s" : ""}</span>
            </div>
          </div>

          {/* Date filter bar */}
          <div className="flex flex-wrap items-center gap-1.5 mb-4">
            {PRESETS.map((p) => (
              <button
                key={p.value}
                onClick={() => setPeriod(p.value)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                  period === p.value
                    ? "bg-blue-600 text-white shadow-sm"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {p.label}
              </button>
            ))}

            <button
              onClick={fetchDeals}
              className="ml-auto p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-400 hover:text-gray-600"
              title="Refresh"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          </div>

          {/* Custom date range inputs — shown only when Custom is active */}
          {period === "custom" && (
            <div className="flex flex-wrap items-center gap-3 mb-4 p-3 bg-blue-50 rounded-xl border border-blue-100">
              <span className="text-xs font-medium text-blue-700">{t("reportsPage.customRange")}</span>
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-500">{t("common.from")}</label>
                <input
                  type="date"
                  value={customFrom}
                  max={customTo || undefined}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="text-sm border border-gray-200 rounded-lg px-2.5 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-500">{t("common.to")}</label>
                <input
                  type="date"
                  value={customTo}
                  min={customFrom || undefined}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="text-sm border border-gray-200 rounded-lg px-2.5 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <button
                onClick={fetchDeals}
                disabled={!customFrom && !customTo}
                className="px-4 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {t("common.apply")}
              </button>
            </div>
          )}

          {/* Tabs */}
          <div className="flex gap-1 overflow-x-auto">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                  activeTab === tab.id
                    ? "bg-blue-600 text-white shadow-sm"
                    : "text-gray-600 hover:bg-gray-100"
                }`}
              >
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-6 py-6">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 text-gray-400">
            <svg className="animate-spin w-8 h-8 mb-3 text-blue-500" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
            </svg>
            <p className="text-sm">{t("reportsPage.loadingReport")}</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-24 text-red-400">
            <span className="text-4xl mb-3">⚠️</span>
            <p className="text-sm font-medium text-red-600">{error}</p>
            <button onClick={fetchDeals} className="mt-3 text-xs text-blue-500 hover:underline">{t("reportsPage.tryAgain")}</button>
          </div>
        ) : deals.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <span className="text-5xl mb-3">📊</span>
            <h3 className="text-base font-medium text-gray-700 mb-1">{t("reportsPage.noDeals")}</h3>
            <p className="text-sm text-gray-400">{t("reportsPage.tryDifferentPeriod")}</p>
          </div>
        ) : (
          <>
            {activeTab === "value"    && <ByValue    deals={deals} formatCurrency={formatCurrency} />}
            {activeTab === "product"  && <ByProduct  deals={deals} formatCurrency={formatCurrency} />}
            {activeTab === "client"   && <ByClient   deals={deals} formatCurrency={formatCurrency} />}
            {activeTab === "location" && <ByLocation deals={deals} formatCurrency={formatCurrency} />}
            {activeTab === "salesman" && <BySalesman deals={deals} formatCurrency={formatCurrency} />}
          </>
        )}
      </div>
    </div>
  );
};

export default ReportsPage;
