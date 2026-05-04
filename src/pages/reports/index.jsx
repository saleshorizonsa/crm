import React, { useState, useEffect, useCallback } from "react";
import Header from "../../components/ui/Header";
import NavigationBreadcrumbs from "../../components/ui/NavigationBreadcrumbs";
import EmployeeSelector from "../../components/ui/EmployeeSelector";
import Icon from "../../components/AppIcon";
import { useAuth } from "../../contexts/AuthContext";
import { useDateRange } from "../../contexts/DateRangeContext";
import { userService } from "../../services/supabaseService";
import {
  getPipelineReport,
  getTargetReport,
  getLeaderboard,
  getActivityReport,
} from "../../services/reportService";
import { exportToCsv, exportToExcel } from "../../utils/exportUtils";

// ── Constants ─────────────────────────────────────────────────────────────────

const STAGE_LABELS = {
  lead: "Lead", contact_made: "Qualified", proposal_sent: "Proposal",
  negotiation: "Negotiation", won: "Won", lost: "Lost",
};

const REPORT_TYPES = [
  { id: "pipeline",    label: "Pipeline",    icon: "TrendingUp" },
  { id: "targets",     label: "Targets",     icon: "Target"     },
  { id: "leaderboard", label: "Leaderboard", icon: "Trophy"     },
  { id: "activity",    label: "Activity",    icon: "Activity"   },
];

const VISIBLE_BY_ROLE = {
  director:   ["pipeline", "targets", "leaderboard", "activity"],
  admin:      ["pipeline", "targets", "leaderboard", "activity"],
  head:       ["pipeline", "targets", "leaderboard", "activity"],
  manager:    ["pipeline", "targets", "leaderboard", "activity"],
  supervisor: ["pipeline", "targets", "activity"],
  salesman:   ["pipeline", "activity"],
};

// ── Column + export configuration per report type ─────────────────────────────

const CONFIGS = {
  pipeline: {
    columns: [
      { label: "Deal",       render: (r) => r.title || "—" },
      { label: "Contact",    render: (r) => r.contact ? `${r.contact.first_name || ""} ${r.contact.last_name || ""}`.trim() : "—" },
      { label: "Company",    render: (r) => r.contact?.company_name || "—" },
      { label: "Stage",      render: (r) => STAGE_LABELS[r.stage] || r.stage || "—" },
      { label: "Amount",     render: (r) => r.amount != null ? `${r.currency || ""} ${Number(r.amount).toLocaleString()}`.trim() : "—" },
      { label: "Owner",      render: (r) => r.owner?.full_name || "—" },
      { label: "Close Date", render: (r) => r.expected_close_date?.slice(0, 10) || "—" },
    ],
    toRow: (r) => ({
      Deal:              r.title || "",
      Contact:           r.contact ? `${r.contact.first_name || ""} ${r.contact.last_name || ""}`.trim() : "",
      Company:           r.contact?.company_name || "",
      Stage:             r.stage || "",
      Amount:            r.amount || 0,
      Currency:          r.currency || "",
      Owner:             r.owner?.full_name || "",
      "Expected Close":  r.expected_close_date?.slice(0, 10) || "",
      "Created At":      r.created_at?.slice(0, 10) || "",
    }),
    summary: (data) => {
      const total = data.reduce((s, r) => s + parseFloat(r.amount || 0), 0);
      return `${data.length} deal${data.length !== 1 ? "s" : ""}  ·  Total ${total.toLocaleString()}`;
    },
  },
  targets: {
    columns: [
      { label: "Assignee",      render: (r) => r.assignee?.full_name || r.assignee?.email || "—" },
      { label: "Role",          render: (r) => r.assignee?.role || "—" },
      { label: "Target Amount", render: (r) => r.target_amount != null ? Number(r.target_amount).toLocaleString() : "—" },
      { label: "Period Start",  render: (r) => r.period_start || "—" },
      { label: "Period End",    render: (r) => r.period_end   || "—" },
      { label: "Status",        render: (r) => r.status       || "—" },
      { label: "Assigned By",   render: (r) => r.assigner?.full_name || "—" },
    ],
    toRow: (r) => ({
      Assignee:        r.assignee?.full_name || "",
      Role:            r.assignee?.role || "",
      "Target Amount": r.target_amount || 0,
      "Period Start":  r.period_start || "",
      "Period End":    r.period_end   || "",
      Status:          r.status       || "",
      "Assigned By":   r.assigner?.full_name || "",
    }),
    summary: (data) => {
      const total = data.reduce((s, r) => s + parseFloat(r.target_amount || 0), 0);
      return `${data.length} target${data.length !== 1 ? "s" : ""}  ·  Total ${total.toLocaleString()}`;
    },
  },
  leaderboard: {
    columns: [
      { label: "#",        render: (r) => r.rank },
      { label: "Name",     render: (r) => r.name || "—" },
      { label: "Revenue",  render: (r) => Number(r.revenue || 0).toLocaleString() },
      { label: "Won Deals",render: (r) => r.dealCount ?? 0 },
      { label: "Win Rate", render: (r) => `${r.winRate ?? 0}%` },
    ],
    toRow: (r) => ({
      Rank:        r.rank,
      Name:        r.name,
      Revenue:     r.revenue,
      "Won Deals": r.dealCount,
      "Win Rate %":r.winRate,
    }),
    summary: (data) => {
      const total = data.reduce((s, r) => s + (r.revenue || 0), 0);
      return `${data.length} rep${data.length !== 1 ? "s" : ""}  ·  Total Revenue ${total.toLocaleString()}`;
    },
  },
  activity: {
    columns: [
      { label: "Date",        render: (r) => r.created_at?.slice(0, 10) || "—" },
      { label: "Type",        render: (r) => r.type || "—" },
      { label: "Title",       render: (r) => r.title || r.description || "—" },
      { label: "Deal",        render: (r) => r.deal?.title || "—" },
      { label: "User",        render: (r) => r.user?.full_name || "—" },
    ],
    toRow: (r) => ({
      Date:        r.created_at?.slice(0, 10) || "",
      Type:        r.type || "",
      Title:       r.title || "",
      Description: r.description || "",
      Deal:        r.deal?.title || "",
      User:        r.user?.full_name || "",
    }),
    summary: (data) => `${data.length} activit${data.length !== 1 ? "ies" : "y"}`,
  },
};

// ── Skeleton ──────────────────────────────────────────────────────────────────

const TableSkeleton = () => (
  <div className="animate-pulse space-y-2">
    <div className="h-10 bg-muted rounded-lg" />
    {[...Array(7)].map((_, i) => (
      <div key={i} className="h-12 bg-muted/60 rounded-lg" />
    ))}
  </div>
);

// ── Page ──────────────────────────────────────────────────────────────────────

const ReportsPage = () => {
  const { user, userProfile, company } = useAuth();
  const { dateRange } = useDateRange();
  const role = userProfile?.role ?? "salesman";

  const visibleTypes = VISIBLE_BY_ROLE[role] ?? ["pipeline", "activity"];

  const [reportType,      setReportType]      = useState(visibleTypes[0]);
  const [data,            setData]            = useState([]);
  const [isLoading,       setIsLoading]       = useState(false);
  const [fetchError,      setFetchError]      = useState(null);
  const [exporting,       setExporting]       = useState(null);
  const [employees,       setEmployees]       = useState([]);
  const [selectedEmployee,setSelectedEmployee]= useState(null);

  // Load team members for employee selector (manager+ roles)
  useEffect(() => {
    if (!company?.id || role === "salesman") return;
    userService.getCompanyUsers(company.id).then(({ data: users }) => {
      setEmployees(users || []);
    });
  }, [company?.id, role]);

  // Fetch report data whenever relevant deps change
  const fetchData = useCallback(async () => {
    if (!user?.id || !company?.id) return;
    if (!dateRange.isAllTime && !dateRange.from) return;

    const params = {
      companyId: company.id,
      userId:    selectedEmployee?.id || user.id,
      role:      selectedEmployee ? "salesman" : role,
      dateFrom:  dateRange.from || null,
      dateTo:    dateRange.to   || null,
    };

    setIsLoading(true);
    setFetchError(null);

    let result;
    if      (reportType === "pipeline")    result = await getPipelineReport(params);
    else if (reportType === "targets")     result = await getTargetReport(params);
    else if (reportType === "leaderboard") result = await getLeaderboard({ companyId: company.id, dateFrom: params.dateFrom, dateTo: params.dateTo });
    else                                   result = await getActivityReport(params);

    if (result.error) {
      setFetchError(result.error);
    } else {
      setData(result.data || []);
    }
    setIsLoading(false);
  }, [user?.id, company?.id, role, reportType, selectedEmployee, dateRange.from, dateRange.to, dateRange.isAllTime]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Export handlers ─────────────────────────────────────────────────────────

  const config   = CONFIGS[reportType] ?? CONFIGS.pipeline;
  const filename = `${company?.name || "Report"}-${reportType}-${dateRange.from || "all"}`;

  const handleCsvExport = () => exportToCsv(data.map(config.toRow), filename);

  const handleExcelExport = () => {
    setExporting("excel");
    try {
      exportToExcel([{ name: reportType, data: data.map(config.toRow) }], filename);
    } finally {
      setExporting(null);
    }
  };

  const handlePdfExport = async () => {
    setExporting("pdf");
    try {
      const { downloadReportPdf } = await import("../../components/reports/ReportPDF");
      await downloadReportPdf(reportType, data, dateRange, company?.name || "");
    } catch (err) {
      console.error("PDF export failed:", err);
    } finally {
      setExporting(null);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  const showEmployee = role !== "salesman";
  const breadcrumbs  = [
    { label: "Dashboard", path: "/company-dashboard" },
    { label: "Reports" },
  ];

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="max-w-screen-2xl mx-auto px-4 lg:px-8 py-6 space-y-6">
        {/* Page header */}
        <div>
          <NavigationBreadcrumbs items={breadcrumbs} />
          <div className="flex items-center justify-between mt-3">
            <div>
              <h1 className="text-2xl font-bold text-foreground">Reports</h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                Export tabular reports for your pipeline, targets, and activity
              </p>
            </div>
          </div>
        </div>

        {/* Controls bar */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Report type tabs */}
          <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
            {REPORT_TYPES.filter((t) => visibleTypes.includes(t.id)).map((t) => (
              <button
                key={t.id}
                onClick={() => { setReportType(t.id); setData([]); }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  reportType === t.id
                    ? "bg-card text-card-foreground shadow-sm"
                    : "text-muted-foreground hover:text-card-foreground"
                }`}
              >
                <Icon name={t.icon} size={14} />
                {t.label}
              </button>
            ))}
          </div>

          {/* Employee selector */}
          {showEmployee && employees.length > 0 && (
            <EmployeeSelector
              employees={employees}
              selectedEmployee={selectedEmployee}
              onEmployeeChange={setSelectedEmployee}
              showAllOption
              currentUserId={user?.id}
              className="w-52"
            />
          )}

          {/* Export buttons */}
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={handleCsvExport}
              disabled={isLoading || data.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border bg-card text-xs font-medium text-card-foreground hover:bg-muted transition-colors disabled:opacity-40"
              title="Export as CSV"
            >
              <Icon name="FileText" size={13} className="text-emerald-600" />
              CSV
            </button>
            <button
              onClick={handleExcelExport}
              disabled={isLoading || data.length === 0 || !!exporting}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border bg-card text-xs font-medium text-card-foreground hover:bg-muted transition-colors disabled:opacity-40"
              title="Export as Excel"
            >
              {exporting === "excel"
                ? <Icon name="Loader2" size={13} className="animate-spin" />
                : <Icon name="FileSpreadsheet" size={13} className="text-emerald-600" />}
              Excel
            </button>
            <button
              onClick={handlePdfExport}
              disabled={isLoading || data.length === 0 || !!exporting}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border bg-card text-xs font-medium text-card-foreground hover:bg-muted transition-colors disabled:opacity-40"
              title="Export as PDF"
            >
              {exporting === "pdf"
                ? <Icon name="Loader2" size={13} className="animate-spin" />
                : <Icon name="FileDown" size={13} className="text-red-500" />}
              PDF
            </button>
          </div>
        </div>

        {/* Content */}
        {isLoading ? (
          <TableSkeleton />
        ) : fetchError ? (
          <div className="flex items-center gap-3 p-4 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive">
            <Icon name="AlertCircle" size={18} className="flex-shrink-0" />
            <span className="text-sm">Failed to load data. Please try refreshing.</span>
          </div>
        ) : data.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Icon name="FileBarChart" size={48} className="text-muted-foreground mb-3" />
            <p className="text-lg font-medium text-card-foreground">No data for selected period</p>
            <p className="text-sm text-muted-foreground mt-1">
              Try adjusting the date range or your filters
            </p>
          </div>
        ) : (
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 border-b border-border">
                  <tr>
                    {config.columns.map((col, i) => (
                      <th
                        key={i}
                        className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap"
                      >
                        {col.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.map((row, ri) => (
                    <tr
                      key={ri}
                      className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors"
                    >
                      {config.columns.map((col, ci) => (
                        <td key={ci} className="px-4 py-3 text-card-foreground">
                          {col.render(row)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Summary bar */}
            <div className="px-4 py-2.5 border-t border-border bg-muted/20 text-xs text-muted-foreground">
              {config.summary(data)}
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default ReportsPage;
