import React, { useState, useEffect, useRef } from "react";
import Header from "../../components/ui/Header";
import NavigationBreadcrumbs from "../../components/ui/NavigationBreadcrumbs";
import PipelineFilters from "./components/PipelineFilters";
import PipelineStage from "./components/PipelineStage";
import PipelineAnalytics from "./components/PipelineAnalytics";
import DealModal from "./components/DealModal";
import DealsList from "./components/DealsList";
import Button from "../../components/ui/Button";
import Icon from "../../components/AppIcon";
import { useAuth } from "../../contexts/AuthContext";
import { useLocation } from "react-router-dom";
import {
  dealService,
  contactService,
  userService,
  activityService,
} from "../../services/supabaseService";
import { exportToExcel } from "../../utils/exportUtils";
import { now } from "d3";
import { formatLocalDateYMD } from "utils/dateFormat";
import { resolveDateRange } from "../../components/ui/DateRangePicker";

const SalesPipeline = () => {
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
    const activeStage = loc.state?.activeStage || params.get("stage") || "";
    const activeFilter = loc.state?.activeFilter;
    return {
      ...buildFilters(activeStage),
      ...(activeFilter === "showOverdue" ? { showOverdue: true } : {}),
    };
  };

  const [isLoading, setIsLoading] = useState(true);
  const [deals, setDeals] = useState([]);
  const [filteredDeals, setFilteredDeals] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [users, setUsers] = useState([]);
  const [selectedDeal, setSelectedDeal] = useState(null);
  const [showDealModal, setShowDealModal] = useState(false);
  const [viewMode, setViewMode] = useState("pipeline");
  const [trackedKey, setTrackedKey] = useState(location.key);
  const [filters, setFilters] = useState(() => filtersFromLocation(location));

  // Synchronously reset filters when location.key changes (new navigation from dashboard).
  // This runs during render so PipelineFilters always gets the right initialFilters on mount.
  if (trackedKey !== location.key) {
    setTrackedKey(location.key);
    setFilters(filtersFromLocation(location));
  }

  // Clear navigation state after applying it so the back button does not re-apply the stage filter.
  useEffect(() => {
    if (location.state?.activeStage || location.state?.activeFilter) {
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
  }, [deals, filters]); // Apply filters whenever deals or filters change

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
          if (!deal.expected_close_date) return false;
          const dealDate = new Date(deal.expected_close_date);
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
    try {
      // Find the deal being moved
      const deal = deals.find((d) => d.id === dealId);
      if (!deal) return;

      const updates = {
        stage: newStage,
        // If moving to won/lost, update closed_at
        closed_at: ["won", "lost"].includes(newStage)
          ? new Date().toISOString()
          : null,
        // Reset lost_reason if moving from lost to another stage
        lost_reason: newStage === "lost" ? deal.lost_reason : null,
      };

      const { data, error } = await dealService.updateDeal(dealId, updates);
      if (error) throw error;

      setDeals(deals.map((d) => (d.id === dealId ? data : d)));
    } catch (error) {
      console.error("Error updating deal stage:", error);
    }
  };

  const stages = [
    { id: "lead", name: "Lead" },
    { id: "contact_made", name: "Qualified" },
    { id: "proposal_sent", name: "Proposal" },
    { id: "negotiation", name: "Negotiation" },
    { id: "won", name: "Won" },
    { id: "lost", name: "Lost" },
  ];

  if (!company) {
    return <div>No company selected</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />

      <main className="p-6">
        <div className="mb-6 flex justify-between items-center">
          <div>
            <NavigationBreadcrumbs
              items={[
                { label: "Dashboard", href: "/company-dashboard" },
                { label: "Sales Funnel", href: "/sales-pipeline" },
              ]}
            />
            <h1 className="text-2xl font-semibold text-gray-900 mt-2">
              Sales Funnel
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
                Funnel
              </Button>
              <Button
                variant={viewMode === "table" ? "default" : "ghost"}
                size="sm"
                onClick={() => setViewMode("table")}
                className="flex items-center gap-2"
              >
                Table
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
              Add Deal
            </Button>
          </div>
        </div>

        <div className="space-y-6">
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
          </div>

          {/* Content View */}
          {isLoading ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
            </div>
          ) : viewMode === "pipeline" ? (
            <div className="flex">
              <div className="flex gap-4 overflow-x-auto p-4 bg-gray-50 min-h-[calc(100vh-300px)] scrollbar-thin scrollbar-thumb-gray-300">
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
            onStageFilter={(stageId) => {
              const newFilters = { ...filters, stage: stageId };
              setFilters(newFilters);
              pipelineTopRef.current?.scrollIntoView({ behavior: "smooth" });
            }}
          />
        </div>
      </main>

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
