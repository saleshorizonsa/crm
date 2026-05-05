import React, { useState, useEffect, useCallback } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { useCurrency } from "../../contexts/CurrencyContext";
import { reportService, computeDateRange } from "../../services/reportService";
import ByValue    from "./components/ByValue";
import ByProduct  from "./components/ByProduct";
import ByClient   from "./components/ByClient";
import ByLocation from "./components/ByLocation";
import BySalesman from "./components/BySalesman";

const TABS = [
  { id: "value",    label: "By Value",    icon: "💰" },
  { id: "product",  label: "By Product",  icon: "📦" },
  { id: "client",   label: "By Client",   icon: "🤝" },
  { id: "location", label: "By Location", icon: "🌍" },
  { id: "salesman", label: "By Salesman", icon: "👤" },
];

const PERIODS = [
  { value: "this_month",   label: "This Month"   },
  { value: "last_month",   label: "Last Month"   },
  { value: "this_quarter", label: "This Quarter" },
  { value: "last_quarter", label: "Last Quarter" },
  { value: "this_year",    label: "This Year"    },
  { value: "last_year",    label: "Last Year"    },
  { value: "all",          label: "All Time"     },
];

const ReportsPage = () => {
  const { userProfile, company } = useAuth();
  const { formatCurrency } = useCurrency();

  const [activeTab, setActiveTab]   = useState("value");
  const [period, setPeriod]         = useState("this_year");
  const [deals, setDeals]           = useState([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(null);

  const fetchDeals = useCallback(async () => {
    if (!userProfile || !company) return;
    setLoading(true);
    setError(null);

    const { from, to } = computeDateRange(period);
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
  }, [userProfile, company, period]);

  useEffect(() => { fetchDeals(); }, [fetchDeals]);

  const roleLabel = () => {
    const role = userProfile?.role;
    if (["director", "admin", "ceo"].includes(role)) return "All company deals";
    if (role === "salesman") return "Your deals only";
    return "Your team's deals";
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Reports</h1>
            <p className="text-xs text-gray-400 mt-0.5">{roleLabel()}</p>
          </div>

          {/* Period selector */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 hidden sm:block">Period:</span>
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {PERIODS.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
            <button
              onClick={fetchDeals}
              className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-500 hover:text-gray-700"
              title="Refresh"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="max-w-7xl mx-auto mt-4 flex gap-1 overflow-x-auto">
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

      {/* Content */}
      <div className="max-w-7xl mx-auto px-6 py-6">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 text-gray-400">
            <svg className="animate-spin w-8 h-8 mb-3 text-blue-500" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
            </svg>
            <p className="text-sm">Loading report data…</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-24 text-red-400">
            <span className="text-4xl mb-3">⚠️</span>
            <p className="text-sm font-medium text-red-600">{error}</p>
            <button onClick={fetchDeals} className="mt-3 text-xs text-blue-500 hover:underline">Try again</button>
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
