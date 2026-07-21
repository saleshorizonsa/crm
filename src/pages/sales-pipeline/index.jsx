import React, { useState, useEffect, useRef } from "react";
import Header from "../../components/ui/Header";
import NavigationBreadcrumbs from "../../components/ui/NavigationBreadcrumbs";
import PipelineFilters from "./components/PipelineFilters";
import PipelineStage from "./components/PipelineStage";
import PipelineAnalytics from "./components/PipelineAnalytics";
import DealModal from "./components/DealModal";
import DealsList from "./components/DealsList";
import LostReasonModal from "./components/LostReasonModal";
import Button from "../../components/ui/Button";
import Icon from "../../components/AppIcon";
import { useAuth } from "../../contexts/AuthContext";
import { useLanguage } from "../../i18n";
import { useLocation, Navigate } from "react-router-dom";
import {
  dealService,
  contactService,
  userService,
  activityService,
} from "../../services/supabaseService";
import { exportToExcel } from "../../utils/exportUtils";
import { now } from "d3";
import { format, startOfMonth } from 'date-fns';
import { formatLocalDateYMD } from "utils/dateFormat";
import { resolveDateRange } from "../../components/ui/DateRangePicker";
import { getDealOrigin } from "../../utils/dealGroupUtils";

const SalesPipeline = () => {
  const { t } = useLanguage();
  const { company, userProfile, user } = useAuth();
  const location = useLocation();
  const pipelineTopRef = useRef(null);

  const buildFilters = (stage = "") => ({
    search: "",
    owner_id: "",
    stage,
    minValue: "",
    maxValue: "",
    dateRange: "",
    customDateRange: { from: "", to: "" },
    showOverdue: false,
  });

  // Read active stage + active filter from navigation state (dashboard click) OR ?stage= URL param.
  const filtersFromLocation = (loc) => {
    const params = new URLSearchParams(loc.search);
    const activeStage = loc.state?.activeStage || loc.state?.filterStage || params.get("stage") || "";
    const activeFilter = loc.state?.activeFilter;
    return {
      ...buildFilters(activeStage),
      ...(activeFilter === "showOverdue" ? { showOverdue: true } : {}),
      ...(loc.state?.filterSalesman ? { owner_id: loc.state.filterSalesman } : {}),
    };
  };

  const [isLoading, setIsLoading] = useState(true);
  const [deals, setDeals] = useState([]);
  const [filteredDeals, setFilteredDeals] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [users, setUsers] = useState([]);
  const [selectedDeal, setSelectedDeal] = useState(null);
  const [showDealModal, setShowDealModal] = useState(false);
  const [showLostModal, setShowLostModal] = useState(false);
  const [dealBeingLost, setDealBeingLost] = useState(null);
  const [viewMode, setViewMode] = useState("pipeline");
  const [trackedKey, setTrackedKey] = useState(location.key);
  const [filters, setFilters] = useState(() => filtersFromLocation(location));
  const [drillDownContext, setDrillDownContext] = useState(null);
  const [originFilter, setOriginFilter] = useState('all'); // 'all' | 'new' | 'carry_forward'

  // Synchronously reset filters when location.key changes (new navigation from dashboard).
  // This runs during render so PipelineFilters always gets the right initialFilters on mount.
  if (trackedKey !== location.key) {
    setTrackedKey(location.key);
    setFilters(filtersFromLocation(location));
    setDrillDownContext(null);
  }

  // Detect drill-down from Sales Performance Card and clear navigation state.
  useEffect(() => {
    const state = location.state;
    const stageLabels = {
      lead: t("deals.lead"), contact_made: t("deals.qualified"), proposal_sent: t("deals.proposal"),
      negotiation: t("deals.negotiation"), won: t("deals.won"), lost: t("deals.lost"),
    };
    if (state?.source === "performance-card" && state?.activeStage) {
      setDrillDownContext({
        stage: state.activeStage,
        label: stageLabels[state.activeStage] || state.activeStage,
        companyName: state.companyName || "",
      });
    }
    if (state?.source === "director-stage-click" && state?.filterStage) {
      setDrillDownContext({
        stage: state.filterStage,
        label: stageLabels[state.filterStage] || state.filterStage,
        salesmanName: state.filterSalesmanName || "",
        companyName: state.companyName || "",
      });
    }
    if (state?.activeStage || state?.activeFilter || state?.source) {
      window.history.replaceState({}, document.title);
    }
  }, []);

  // Add cache timestamp to track data freshness
  const [lastFetchTime, setLastFetchTime] = useState(null);
  const loadingRef = React.useRef(false);

  useEffect(() => {
    if (company && userProfile) {
      loadDeals();
      loadContacts();
      loadUsers();
    }
  }, [company, userProfile?.role]); // Reload when role changes

  useEffect(() => {
    applyFilters();
  }, [deals, filters, originFilter]); // Apply filters whenever deals or filters change

  const loadDeals = async (force = false) => {
    try {
      // For salesmen: Load deals owned by them
      // For supervisors/managers/directors: Load deals from their subordinates
      const isManagementRole = ["supervisor", "manager", "director"].includes(
        userProfile?.role,
      );

      const { data, error } = await dealService.getDeals(
        company.id,
        {},
        isManagementRole ? null : user?.id, // Pass userId only for salesmen
      );

      console.log("Loaded deals:", data?.length, "Error:", error);

      if (error) throw error;
      setDeals(data || []);
      setLastFetchTime(now());
    } catch (error) {
      console.error("Error loading deals:", error);
    } finally {
      setIsLoading(false);
      loadingRef.current = false;
    }
  };

  const loadContacts = async () => {
    try {
      const { data, error } = await contactService.getContacts(company.id);
      if (error) throw error;
      setContacts(data || []);
    } catch (error) {
      console.error("Error loading contacts:", error);
    }
  };

  const loadUsers = async () => {
    try {
      const { data, error } = await userService.getCompanyUsers(company.id);
      if (error) throw error;
      setUsers(data || []);
    } catch (error) {
      console.error("Error loading users:", error);
    }
  };

  console.log(deals);

  const applyFilters = () => {
    let filtered = [...deals];

    // Search filter
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      filtered = filtered.filter(
        (deal) =>
          deal.title?.toLowerCase().includes(searchLower) ||
          deal.contact?.first_name?.toLowerCase().includes(searchLower) ||
          deal.contact?.last_name?.toLowerCase().includes(searchLower) ||
          deal.contact?.company_name?.toLowerCase().includes(searchLower),
      );
    }

    // Owner filter
    if (filters.owner_id) {
      filtered = filtered.filter((deal) => deal.owner_id === filters.owner_id);
    }

    // Stage filter
    if (filters.stage) {
      filtered = filtered.filter((deal) => deal.stage === filters.stage);
    }

    // Min value filter
    if (filters.minValue) {
      const minVal = parseFloat(filters.minValue);
      filtered = filtered.filter((deal) => deal.amount >= minVal);
    }

    // Max value filter
    if (filters.maxValue) {
      const maxVal = parseFloat(filters.maxValue);
      filtered = filtered.filter((deal) => deal.amount <= maxVal);
    }

    // Date range filter (uses centralized resolver from DateRangePicker)
    if (filters.dateRange) {
      const resolved = resolveDateRange(
        filters.dateRange,
        filters.customDateRange
      );

      if (resolved.startDate && resolved.endDate) {
        filtered = filtered.filter((deal) => {
          // Won → closed_at, Lost → closed_at/lost_at, Open → expected_close_date fallback created_at
          const dateField =
            deal.stage === 'won'
              ? (deal.closed_at || deal.created_at)
            : deal.stage === 'lost'
              ? (deal.closed_at || deal.lost_at || deal.created_at)
            : (deal.expected_close_date || deal.created_at);
          if (!dateField) return false;
          const dealDate = new Date(dateField);
          return dealDate >= resolved.startDate && dealDate <= resolved.endDate;
        });
      }
    }

    // Overdue filter
    if (filters.showOverdue) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      filtered = filtered.filter((deal) => {
        // Only include deals that are not won or lost
        if (deal.stage === "won" || deal.stage === "lost") return false;
        if (!deal.expected_close_date) return false;
        const closeDate = new Date(deal.expected_close_date);
        return closeDate < today;
      });
    }

    // Origin filter (skips won/lost)
    if (originFilter !== 'all') {
      const periodFrom = filters.customDateRange?.from
        || format(startOfMonth(new Date()), 'yyyy-MM-dd');
      filtered = filtered.filter(deal => {
        if (deal.stage === 'won' || deal.stage === 'lost') return true;
        return getDealOrigin(deal, periodFrom) === originFilter;
      });
    }

    setFilteredDeals(filtered);
  };

  const handleExportToCSV = () => {
    if (!filteredDeals || filteredDeals.length === 0) {
      alert("No deals to export");
      return;
    }

    // Define CSV headers
    const headers = [
      "Deal Name",
      "Company",
      "Contact",
      "Amount",
      "Currency",
      "Stage",
      "Owner",
      "Expected Close Date",
      "Created Date",
      "Last Updated",
    ];

    // Map deals to CSV rows
    const rows = filteredDeals.map((deal) => {
      return [
        deal.title || "",
        deal.contact?.company_name || "",
        deal.contact
          ? `${deal.contact.first_name || ""} ${deal.contact.last_name || ""}`.trim()
          : "",
        deal.amount || 0,
        deal.currency || "USD",
        deal.stage || "",
        deal.owner ? deal.owner.full_name || deal.owner.email : "",
        deal.expected_close_date || "",
        deal.created_at ? new Date(deal.created_at).toLocaleDateString() : "",
        deal.updated_at ? new Date(deal.updated_at).toLocaleDateString() : "",
      ];
    });

    // Create CSV content
    const csvContent = [
      headers.join(","),
      ...rows.map((row) =>
        row
          .map((cell) => {
            // Escape quotes and wrap in quotes if contains comma
            const cellStr = String(cell);
            if (
              cellStr.includes(",") ||
              cellStr.includes('"') ||
              cellStr.includes("\n")
            ) {
              return `"${cellStr.replace(/"/g, '""')}"`;
            }
            return cellStr;
          })
          .join(","),
      ),
    ].join("\n");

    // Create blob and download
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);

    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `pipeline-deals-${formatLocalDateYMD(new Date())}.csv`,
    );
    link.style.visibility = "hidden";

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportToExcel = () => {
    if (!filteredDeals || filteredDeals.length === 0) return;
    const rows = filteredDeals.map((d) => ({
      Deal:             d.title || "",
      Contact:          d.contact ? `${d.contact.first_name || ""} ${d.contact.last_name || ""}`.trim() : "",
      Company:          d.contact?.company_name || "",
      Stage:            d.stage || "",
      Amount:           d.amount || 0,
      Currency:         d.currency || "USD",
      Owner:            d.owner?.full_name || d.owner?.email || "",
      "Expected Close": d.expected_close_date || "",
      "Created At":     d.created_at ? new Date(d.created_at).toLocaleDateString() : "",
    }));
    exportToExcel([{ name: "Pipeline", data: rows }], `pipeline-deals-${formatLocalDateYMD(new Date())}`);
  };

  const handleExportToPdf = async () => {
    if (!filteredDeals || filteredDeals.length === 0) return;
    try {
      const { downloadReportPdf } = await import("../../components/reports/ReportPDF");
      await downloadReportPdf("pipeline", filteredDeals, { from: null, to: null }, company?.name || "");
    } catch (err) {
      console.error("PDF export failed:", err);
    }
  };

  const handleCreateDeal = () => {
    setSelectedDeal(null);
    setShowDealModal(true);
  };

  const handleEditDeal = (deal) => {
    setSelectedDeal(deal);
    setShowDealModal(true);
  };

  const handleDealSave = async (dealData) => {
    try {
      const payload = {
        ...dealData,
        company_id: company.id,
        // Set owner_id to current user if not provided
        owner_id: dealData.owner_id || userProfile?.id,
      };

      console.log("Saving deal with payload:", payload);

      const { data, error } = await dealService.upsertDeal(payload);

      if (error) {
        console.error("Deal save error:", error);
        throw error;
      }

      if (selectedDeal) {
        setDeals(deals.map((d) => (d.id === data.id ? data : d)));

        // Log activity for deal update
        const stageChanged = selectedDeal.stage !== data.stage;
        if (stageChanged) {
          // Log stage change activity
          await activityService.createActivity({
            type:
              data.stage === "won"
                ? "note"
                : data.stage === "lost"
                  ? "note"
                  : "note",
            title:
              data.stage === "won"
                ? `Deal won: ${data.title}`
                : data.stage === "lost"
                  ? `Deal lost: ${data.title}`
                  : `Deal moved to ${data.stage}: ${data.title}`,
            description:
              data.stage === "won" || data.stage === "lost"
                ? `${data.amount} ${data.currency}${data.lost_reason ? ` - Reason: ${data.lost_reason}` : ""}`
                : `Stage changed from ${selectedDeal.stage} to ${data.stage}`,
            company_id: company.id,
            deal_id: data.id,
            contact_id: data.contact_id,
            owner_id: userProfile?.id,
          });
        } else {
          // Log general deal update
          await activityService.createActivity({
            type: "note",
            title: `Deal updated: ${data.title}`,
            description: `Deal details modified`,
            company_id: company.id,
            deal_id: data.id,
            contact_id: data.contact_id,
            owner_id: userProfile?.id,
          });
        }
      } else {
        setDeals([data, ...deals]);

        // Log activity for new deal creation
        await activityService.createActivity({
          type: "note",
          title: `New deal created: ${data.title}`,
          description: `${data.amount} ${data.currency} - Stage: ${data.stage}`,
          company_id: company.id,
          deal_id: data.id,
          contact_id: data.contact_id,
          owner_id: userProfile?.id,
        });
      }

      setShowDealModal(false);

      // Return the saved deal so modal can add products
      return data;
    } catch (error) {
      console.error("Error saving deal:", error);
      // Re-throw to let modal handle the error
      throw error;
    }
  };

  // Handle deal deletion from modal
  const handleDealDelete = (dealId) => {
    setDeals(deals.filter((d) => d.id !== dealId));
    setShowDealModal(false);
    setSelectedDeal(null);
  };

  const handleDealStageChange = async (dealId, newStage) => {
    // Intercept 'lost' — show the reason modal instead of saving immediately
    if (newStage === "lost") {
      const deal = deals.find((d) => d.id === dealId);
      if (deal) {
        setDealBeingLost(deal);
        setShowLostModal(true);
      }
      return;
    }

    try {
      const deal = deals.find((d) => d.id === dealId);
      if (!deal) return;

      const updates = {
        stage: newStage,
        closed_at: newStage === "won" ? new Date().toISOString() : null,
      };

      const { data, error } = await dealService.updateDeal(dealId, updates);
      if (error) throw error;

      setDeals(deals.map((d) => (d.id === dealId ? data : d)));
    } catch (error) {
      console.error("Error updating deal stage:", error);
    }
  };

  const stages = [
    { id: "lead", name: t("deals.lead") },
    { id: "contact_made", name: t("deals.qualified") },
    { id: "proposal_sent", name: t("deals.proposal") },
    { id: "negotiation", name: t("deals.negotiation") },
    { id: "won", name: t("deals.won") },
    { id: "lost", name: t("deals.lost") },
  ];

  // Defence-in-depth: viewer must not reach the full pipeline page
  if (userProfile?.role === "viewer") {
    return <Navigate to="/pipeline-view" replace />;
  }

  if (!company) {
    return <div>{t("common.noData")}</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />

      <main className="p-6">
        <div className="mb-6 flex justify-between items-center">
          <div>
            <NavigationBreadcrumbs
              items={[
                { label: t("nav.dashboard"), href: "/company-dashboard" },
                { label: t("nav.pipeline"), href: "/sales-pipeline" },
              ]}
            />
            <h1 className="text-2xl font-semibold text-gray-900 mt-2">
              {t("nav.pipeline")}
            </h1>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center bg-gray-100 rounded-lg p-1">
              <Button
                variant={viewMode === "pipeline" ? "default" : "ghost"}
                size="sm"
                onClick={() => setViewMode("pipeline")}
                className="flex items-center gap-2"
              >
                <Icon name="Columns" size={16} />
                {t("dashboard.funnel")}
              </Button>
              <Button
                variant={viewMode === "table" ? "default" : "ghost"}
                size="sm"
                onClick={() => setViewMode("table")}
                className="flex items-center gap-2"
              >
                {t("pipeline.table")}
              </Button>
            </div>
            <button
              onClick={handleExportToExcel}
              disabled={filteredDeals.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-gray-300 bg-white text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-40"
              title="Export to Excel"
            >
              <Icon name="FileSpreadsheet" size={13} className="text-emerald-600" />
              Excel
            </button>
            <button
              onClick={handleExportToPdf}
              disabled={filteredDeals.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-gray-300 bg-white text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-40"
              title="Export to PDF"
            >
              <Icon name="FileDown" size={13} className="text-red-500" />
              PDF
            </button>
            <Button
              variant="primary"
              onClick={handleCreateDeal}
              iconName="Plus"
              iconPosition="left"
            >
              {t("deals.addDeal")}
            </Button>
          </div>
        </div>

        <div className="space-y-6">
          {/* Drill-down banner — shown when navigated from Sales Performance Card */}
          {drillDownContext && (
            <div className="flex items-center gap-2 px-4 py-2 bg-blue-50 rounded-lg text-sm text-blue-700 border border-blue-100">
              <Icon name="Filter" size={16} />
              <span>
                {t("pipeline.showing")}{" "}
                {drillDownContext.label && (
                  <strong className="font-semibold">{drillDownContext.label}</strong>
                )}{" "}
                deals
                {drillDownContext.salesmanName && (
                  <> {" "}for <strong className="font-semibold">{drillDownContext.salesmanName}</strong></>
                )}
                {drillDownContext.companyName && (
                  <> {" "}· <span className="text-blue-600">{drillDownContext.companyName}</span></>
                )}
              </span>
              <button
                onClick={() => {
                  setDrillDownContext(null);
                  setFilters((f) => ({ ...f, stage: "", owner_id: "" }));
                }}
                className="ml-auto text-blue-400 hover:text-blue-600 font-medium"
              >
                {t("pipeline.clearFilters")} ✕
              </button>
            </div>
          )}

          {/* Filters and Analytics */}
          <div className="w-full" ref={pipelineTopRef}>
            <PipelineFilters
              key={location.key}
              totalDeals={deals.length}
              filteredDeals={filteredDeals.length}
              filters={filters}
              onFiltersChange={setFilters}
              onExport={handleExportToCSV}
              initialFilters={filters}
            />
            {/* Origin filter */}
            <div className="mt-2 flex items-center gap-2">
              <span className="text-xs text-gray-500">Origin:</span>
              <select
                value={originFilter}
                onChange={e => setOriginFilter(e.target.value)}
                className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:border-blue-400"
              >
                <option value="all">All Origins</option>
                <option value="new">New This Period</option>
                <option value="carry_forward">Carried Forward</option>
              </select>
            </div>
          </div>

          {/* Content View */}
          {isLoading ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
            </div>
          ) : viewMode === "pipeline" ? (
            <div className="w-full overflow-x-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100">
              <div className="flex gap-4 p-4 bg-gray-50 min-h-[calc(100vh-300px)]" style={{ minWidth: "max-content" }}>
                {stages.map((stage) => (
                  <PipelineStage
                    key={stage.id}
                    stage={stage}
                    deals={filteredDeals.filter(
                      (deal) => deal.stage === stage.id,
                    )}
                    onDealUpdate={handleEditDeal}
                    onDealClick={handleEditDeal}
                    onStageUpdate={(stageId) =>
                      console.log("Stage settings:", stageId)
                    }
                    onDragOver={(stageId) =>
                      console.log("Dragging over:", stageId)
                    }
                    onDrop={handleDealStageChange}
                    activePeriodFrom={
                      filters.customDateRange?.from ||
                      format(startOfMonth(new Date()), 'yyyy-MM-dd')
                    }
                  />
                ))}
              </div>
            </div>
          ) : (
            <DealsList
              deals={filteredDeals}
              onStageChange={handleDealStageChange}
              onEditDeal={handleEditDeal}
            />
          )}
        </div>
        <div className="mt-20">
          <PipelineAnalytics
            deals={filteredDeals}
            activePeriodFrom={
              filters.customDateRange?.from ||
              format(startOfMonth(new Date()), 'yyyy-MM-dd')
            }
            onStageFilter={(stageId) => {
              const newFilters = { ...filters, stage: stageId };
              setFilters(newFilters);
              pipelineTopRef.current?.scrollIntoView({ behavior: "smooth" });
            }}
          />
        </div>
      </main>

      {/* Lost Reason Modal — shown on drag-drop to Lost stage */}
      <LostReasonModal
        isOpen={showLostModal}
        deal={dealBeingLost}
        onConfirm={async (code, notes) => {
          try {
            const { data, error } = await dealService.updateDealLost(
              dealBeingLost.id,
              { lost_reason_code: code, lost_reason_notes: notes, company_id: company?.id },
            );
            if (error) throw error;
            setDeals((prev) => prev.map((d) => (d.id === data.id ? data : d)));
          } catch (err) {
            console.error("Failed to mark deal lost:", err);
          } finally {
            setShowLostModal(false);
            setDealBeingLost(null);
          }
        }}
        onCancel={() => {
          setShowLostModal(false);
          setDealBeingLost(null);
        }}
      />

      {/* Deal Modal */}
      <DealModal
        deal={selectedDeal}
        isOpen={showDealModal}
        onSave={handleDealSave}
        onDelete={handleDealDelete}
        onClose={() => setShowDealModal(false)}
        contacts={contacts}
        users={users}
      />
    </div>
  );
};

export default SalesPipeline;
