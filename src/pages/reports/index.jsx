import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { useCurrency } from "../../contexts/CurrencyContext";
import { reportService, computeDateRange } from "../../services/reportService";
import ByValue    from "./components/ByValue";
import ByProduct  from "./components/ByProduct";
import ByClient   from "./components/ByClient";
import ByLocation from "./components/ByLocation";
import BySalesman from "./components/BySalesman";
import OriginReport   from "./OriginReport";
import MarginReport   from "./MarginReport";
import ActivityReport from "./ActivityReport";
import { useLanguage } from "../../i18n";
import { exportReportToExcel } from "../../utils/reportExport";
import { useMaterialGroups } from "../../hooks/useMaterialGroups";

const today = () => new Date().toISOString().split("T")[0];
const firstOfYear = () => `${new Date().getFullYear()}-01-01`;

// Dashboard cards navigate with semantic tab hints (e.g. "revenue", "team")
// that don't match this page's actual tab ids. Map them to real tab ids.
// Real ids: value | product | client | location | salesman | origin | margin | activity
const TAB_ALIASES = {
  revenue:    "value",     // Revenue / Sales Performance card → By Value
  value:      "value",
  product:    "product",
  client:     "client",
  location:   "location",
  company:    "location",  // "By Company" tab id is "location"
  salesman:   "salesman",
  team:       "salesman",  // Team Performance card → By Salesman
  origin:     "origin",
  pipeline:   "origin",    // Pipeline Origin
  margin:     "margin",
  activity:   "activity",
  activities: "activity",  // Activities card → Deal Activity
};

const STAGE_OPTIONS = [
  { value: 'lead',          label: 'Lead'        },
  { value: 'contact_made',  label: 'Qualified'   },
  { value: 'proposal_sent', label: 'Proposal'    },
  { value: 'negotiation',   label: 'Negotiation' },
  { value: 'won',           label: 'Won'         },
  { value: 'lost',          label: 'Lost'        },
];

const ReportsPage = () => {
  const { t } = useLanguage();
  const { userProfile, company } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { formatCurrency } = useCurrency();
  const reportRef = useRef(null);

  const TABS = [
    { id: "value",    label: t("reportsPage.byValue"),    icon: "💰" },
    { id: "product",  label: t("reportsPage.byProduct"),  icon: "📦" },
    { id: "client",   label: t("reportsPage.byClient"),   icon: "🤝" },
    { id: "location", label: t("reportsPage.byCompany"),  icon: "🏢" },
    { id: "salesman", label: t("reportsPage.bySalesman"), icon: "👤" },
    { id: "origin",   label: "Pipeline Origin",           icon: "🔄" },
    { id: "margin",   label: "Margin Analysis",           icon: "💹" },
    { id: "activity", label: "Deal Activity",             icon: "📋" },
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

  const [activeTab, setActiveTab]   = useState("value");
  const [period, setPeriod]         = useState("this_month");
  const [customFrom, setCustomFrom] = useState(firstOfYear);
  const [customTo, setCustomTo]     = useState(today);
  const [deals, setDeals]           = useState([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(null);
  const [exportLoading, setExportLoading] = useState(false);

  // Drill-down filters
  const [filterSalesman, setFilterSalesman] = useState('all');
  const [filterStage,    setFilterStage]    = useState('all');
  const [filterGroup,    setFilterGroup]    = useState('all');
  const [filterOrigin,   setFilterOrigin]   = useState('all');
  const [filterMinValue, setFilterMinValue] = useState('');
  const [filterMaxValue, setFilterMaxValue] = useState('');
  const [filterContact,  setFilterContact]  = useState('');
  const [showFilters,    setShowFilters]    = useState(false);

  const activeFilterCount = [
    filterSalesman !== 'all' ? 1 : 0,
    filterStage    !== 'all' ? 1 : 0,
    filterGroup    !== 'all' ? 1 : 0,
    filterOrigin   !== 'all' ? 1 : 0,
    filterMinValue             ? 1 : 0,
    filterMaxValue             ? 1 : 0,
    filterContact              ? 1 : 0,
  ].reduce((s, v) => s + v, 0);

  const clearAllFilters = () => {
    setFilterSalesman('all'); setFilterStage('all');
    setFilterGroup('all');    setFilterOrigin('all');
    setFilterMinValue('');    setFilterMaxValue('');
    setFilterContact('');
  };

  const getDateRange = useCallback(() => {
    if (period === "custom") {
      return {
        from: customFrom ? new Date(customFrom).toISOString() : null,
        to:   customTo   ? new Date(customTo + "T23:59:59").toISOString() : null,
      };
    }
    return computeDateRange(period);
  }, [period, customFrom, customTo]);

  const dateFrom = useMemo(() => getDateRange().from, [getDateRange]);

  const fetchDeals = useCallback(async () => {
    if (!userProfile || !company) return;
    setLoading(true);
    setError(null);
    clearAllFilters();

    const { from, to } = getDateRange();
    const { data, error: err } = await reportService.getReportDeals(
      company.id, userProfile.id, userProfile.role, from, to,
    );

    if (err) setError(err.message || "Failed to load report data.");
    else setDeals(data);
    setLoading(false);
  }, [userProfile, company, getDateRange]);

  useEffect(() => {
    if (period !== "custom") fetchDeals();
  }, [period]); // eslint-disable-line

  useEffect(() => { fetchDeals(); }, []); // eslint-disable-line

  // Pre-select the tab from the URL query (?tab=...) when arriving from a
  // dashboard card click. URL params survive refresh, back/forward and remounts
  // — unlike location.state, which was being lost (BUG-14). We also no longer
  // touch window.history.state (that was corrupting React Router's own history
  // bookkeeping). Dashboard hints map to real tab ids via TAB_ALIASES.
  useEffect(() => {
    const tabParam = searchParams.get("tab");
    if (!tabParam) return;
    const key = String(tabParam).toLowerCase();
    const mapped = TAB_ALIASES[key] || key;
    if (TABS.some((tt) => tt.id === mapped)) {
      setActiveTab(mapped);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Filter options derived from raw deals
  const salesmanOptions = useMemo(() => {
    const map = {};
    deals.forEach(d => { const id = d.owner?.id; const name = d.owner?.full_name; if (id && name) map[id] = name; });
    return Object.entries(map).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [deals]);

  const { groups: materialGroupOptions } = useMaterialGroups();

  // Apply drill-down filters
  const filteredDeals = useMemo(() => {
    let result = deals;

    if (filterSalesman !== 'all')
      result = result.filter(d => d.owner?.id === filterSalesman);

    if (filterStage !== 'all')
      result = result.filter(d => d.stage === filterStage);

    if (filterGroup !== 'all')
      result = result.filter(d => d.deal_products?.some(dp => dp.product?.material_group === filterGroup));

    if (filterOrigin !== 'all') {
      const periodFrom = dateFrom || new Date(new Date().getFullYear(), 0, 1).toISOString();
      result = result.filter(d => {
        const isNew = new Date(d.creation_date || d.created_at) >= new Date(periodFrom);
        return filterOrigin === 'new' ? isNew : !isNew;
      });
    }

    if (filterMinValue)
      result = result.filter(d => parseFloat(d.amount || 0) >= parseFloat(filterMinValue));

    if (filterMaxValue)
      result = result.filter(d => parseFloat(d.amount || 0) <= parseFloat(filterMaxValue));

    if (filterContact) {
      const term = filterContact.toLowerCase();
      result = result.filter(d =>
        d.contact?.company_name?.toLowerCase().includes(term) ||
        d.title?.toLowerCase().includes(term)
      );
    }

    return result;
  }, [deals, filterSalesman, filterStage, filterGroup, filterOrigin, filterMinValue, filterMaxValue, filterContact, dateFrom]);

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

  // Excel export
  const handleExportExcel = () => {
    setExportLoading(true);
    try {
      exportReportToExcel({ deals: filteredDeals, activeTab, period, filters: { salesman: filterSalesman, stage: filterStage, group: filterGroup } });
    } finally {
      setExportLoading(false);
    }
  };

  // PDF export via browser print
  const handleExportPDF = async () => {
    setExportLoading(true);
    document.body.classList.add('printing-report');
    const oldTitle = document.title;
    document.title = `JASCO_Report_${period}_${new Date().toISOString().split('T')[0]}`;
    await new Promise(r => setTimeout(r, 200));
    window.print();
    document.title = oldTitle;
    document.body.classList.remove('printing-report');
    setExportLoading(false);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 no-print">
        <div className="max-w-7xl mx-auto">

          {/* Title row */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate(-1)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors no-print"
                title="Back"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Back
              </button>
              <div>
                <h1 className="text-xl font-bold text-gray-900">{t("reportsPage.title")}</h1>
                <p className="text-xs text-gray-400 mt-0.5">{roleLabel()}</p>
              </div>
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
                  period === p.value ? "bg-blue-600 text-white shadow-sm" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
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

          {/* Custom date range */}
          {period === "custom" && (
            <div className="flex flex-wrap items-center gap-3 mb-4 p-3 bg-blue-50 rounded-xl border border-blue-100">
              <span className="text-xs font-medium text-blue-700">{t("reportsPage.customRange")}</span>
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-500">{t("common.from")}</label>
                <input type="date" value={customFrom} max={customTo || undefined} onChange={e => setCustomFrom(e.target.value)}
                  className="text-sm border border-gray-200 rounded-lg px-2.5 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-500">{t("common.to")}</label>
                <input type="date" value={customTo} min={customFrom || undefined} onChange={e => setCustomTo(e.target.value)}
                  className="text-sm border border-gray-200 rounded-lg px-2.5 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <button onClick={fetchDeals} disabled={!customFrom && !customTo}
                className="px-4 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 disabled:opacity-40">
                {t("common.apply")}
              </button>
            </div>
          )}

          {/* Drill-down toggle + export row */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowFilters(f => !f)}
                className={`flex items-center gap-2 px-3 py-2 text-sm rounded-lg border transition-colors ${
                  showFilters || activeFilterCount > 0
                    ? 'bg-blue-50 border-blue-200 text-blue-600'
                    : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                </svg>
                Drill Down
                {activeFilterCount > 0 && (
                  <span className="bg-blue-600 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-medium">
                    {activeFilterCount}
                  </span>
                )}
              </button>
              <span className="text-sm text-gray-500">
                Showing <strong className="text-gray-800">{filteredDeals.length}</strong> of <strong>{deals.length}</strong> deals
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleExportExcel} disabled={exportLoading || filteredDeals.length === 0}
                className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg border border-green-200 text-green-700 bg-green-50 hover:bg-green-100 transition-colors disabled:opacity-50"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Excel
              </button>
              <button
                onClick={handleExportPDF} disabled={exportLoading || filteredDeals.length === 0}
                className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg border border-red-200 text-red-700 bg-red-50 hover:bg-red-100 transition-colors disabled:opacity-50"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
                PDF
              </button>
            </div>
          </div>

          {/* Filter panel */}
          {showFilters && (
            <div className="bg-gray-50 rounded-xl p-4 mb-4 border border-gray-200">
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Salesman</label>
                  <select value={filterSalesman} onChange={e => setFilterSalesman(e.target.value)}
                    className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400">
                    <option value="all">All Salesmen</option>
                    {salesmanOptions.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Stage</label>
                  <select value={filterStage} onChange={e => setFilterStage(e.target.value)}
                    className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400">
                    <option value="all">All Stages</option>
                    {STAGE_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Product Group</label>
                  <select value={filterGroup} onChange={e => setFilterGroup(e.target.value)}
                    className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400">
                    <option value="all">All Groups</option>
                    {materialGroupOptions.map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Deal Origin</label>
                  <select value={filterOrigin} onChange={e => setFilterOrigin(e.target.value)}
                    className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400">
                    <option value="all">All Origins</option>
                    <option value="new">New This Period</option>
                    <option value="carry_forward">Carried Forward</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Min Value (SAR)</label>
                  <input type="number" min="0" value={filterMinValue} onChange={e => setFilterMinValue(e.target.value)} placeholder="0"
                    className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Max Value (SAR)</label>
                  <input type="number" min="0" value={filterMaxValue} onChange={e => setFilterMaxValue(e.target.value)} placeholder="No limit"
                    className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400" />
                </div>
                <div className="col-span-2">
                  <label className="text-xs font-medium text-gray-600 block mb-1">Search Company / Deal</label>
                  <input type="text" value={filterContact} onChange={e => setFilterContact(e.target.value)} placeholder="Filter by company name or deal title..."
                    className="w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400" />
                </div>
              </div>

              {activeFilterCount > 0 && (
                <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-200">
                  <div className="flex flex-wrap gap-2">
                    {filterSalesman !== 'all' && (
                      <span className="flex items-center gap-1 text-xs bg-blue-50 text-blue-600 px-2 py-1 rounded-full">
                        {salesmanOptions.find(s => s.id === filterSalesman)?.name}
                        <button onClick={() => setFilterSalesman('all')} className="ml-0.5">×</button>
                      </span>
                    )}
                    {filterStage !== 'all' && (
                      <span className="flex items-center gap-1 text-xs bg-purple-50 text-purple-600 px-2 py-1 rounded-full">
                        {STAGE_OPTIONS.find(s => s.value === filterStage)?.label}
                        <button onClick={() => setFilterStage('all')} className="ml-0.5">×</button>
                      </span>
                    )}
                    {filterGroup !== 'all' && (
                      <span className="flex items-center gap-1 text-xs bg-green-50 text-green-600 px-2 py-1 rounded-full">
                        {filterGroup}<button onClick={() => setFilterGroup('all')} className="ml-0.5">×</button>
                      </span>
                    )}
                    {filterOrigin !== 'all' && (
                      <span className="flex items-center gap-1 text-xs bg-amber-50 text-amber-600 px-2 py-1 rounded-full">
                        {filterOrigin === 'new' ? 'New only' : 'Carry forward only'}
                        <button onClick={() => setFilterOrigin('all')} className="ml-0.5">×</button>
                      </span>
                    )}
                    {(filterMinValue || filterMaxValue) && (
                      <span className="flex items-center gap-1 text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full">
                        SAR {filterMinValue || '0'} – {filterMaxValue || '∞'}
                        <button onClick={() => { setFilterMinValue(''); setFilterMaxValue(''); }} className="ml-0.5">×</button>
                      </span>
                    )}
                  </div>
                  <button onClick={clearAllFilters} className="text-xs text-gray-400 hover:text-red-500 transition-colors">Clear all</button>
                </div>
              )}
            </div>
          )}

          {/* Tabs */}
          <div className="flex gap-1 overflow-x-auto no-print">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                  activeTab === tab.id ? "bg-blue-600 text-white shadow-sm" : "text-gray-600 hover:bg-gray-100"
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
      <div className="max-w-7xl mx-auto px-6 py-6 report-content" ref={reportRef}>
        {/* Print header — only visible when printing */}
        <div className="hidden print:block mb-6 pb-4 border-b-2 border-gray-800">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">JASCO CRM — Sales Report</h1>
              <p className="text-sm text-gray-600">
                Period: {activePeriodLabel()} · Generated: {new Date().toLocaleDateString('en-GB')}
              </p>
            </div>
            <div className="text-sm text-gray-600 text-right">
              {filterSalesman !== 'all' && <p>Salesman: {salesmanOptions.find(s => s.id === filterSalesman)?.name}</p>}
              {filterStage !== 'all' && <p>Stage: {STAGE_OPTIONS.find(s => s.value === filterStage)?.label}</p>}
              <p>Showing {filteredDeals.length} of {deals.length} deals</p>
            </div>
          </div>
        </div>

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
            {activeTab === "value"    && <ByValue    deals={filteredDeals} formatCurrency={formatCurrency} />}
            {activeTab === "product"  && <ByProduct  deals={filteredDeals} formatCurrency={formatCurrency} />}
            {activeTab === "client"   && <ByClient   deals={filteredDeals} formatCurrency={formatCurrency} />}
            {activeTab === "location" && <ByLocation deals={filteredDeals} formatCurrency={formatCurrency} />}
            {activeTab === "salesman" && <BySalesman deals={filteredDeals} formatCurrency={formatCurrency} />}
            {activeTab === "origin"   && <OriginReport   deals={filteredDeals} formatCurrency={formatCurrency} dateFrom={dateFrom} />}
            {activeTab === "margin"   && <MarginReport   deals={filteredDeals} formatCurrency={formatCurrency} />}
            {activeTab === "activity" && <ActivityReport deals={filteredDeals} formatCurrency={formatCurrency} />}
          </>
        )}
      </div>
    </div>
  );
};

export default ReportsPage;
