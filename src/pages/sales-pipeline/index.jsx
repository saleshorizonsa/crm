import React, { useState, useEffect, useRef } from "react";
import Header from "../../components/ui/Header";
import NavigationBreadcrumbs from "../../components/ui/NavigationBreadcrumbs";
import PipelineFilters from "./components/PipelineFilters";
import PipelineStage from "./components/PipelineStage";
import PipelineAnalytics from "./components/PipelineAnalytics";
import DealModal from "./components/DealModal";
import DealsList from "./components/DealsList";
import LostReasonModal from "./components/LostReasonModal";
import ContactReportModal from "../../components/deals/ContactReportModal";
import ReplacementModal from "../../components/deals/ReplacementModal";
import Button from "../../components/ui/Button";
import Icon from "../../components/AppIcon";
import { useAuth } from "../../contexts/AuthContext";
import { supabase } from "../../lib/supabase";
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
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { parseInvoiceNumbers, formatInvoiceNumbers } from '../../utils/invoiceNumber';
import InvoiceModal, { validateInvoiceForm } from "./components/InvoiceModal";
import { formatLocalDateYMD } from "utils/dateFormat";
import { resolveDateRange } from "../../components/ui/DateRangePicker";
import { getDealOrigin } from "../../utils/dealGroupUtils";
import { fetchOpenFunnel, currentMonthBounds } from "../../utils/openFunnel";
import { fetchTeamHierarchy, canCorrectInvoice } from "../../utils/teamHierarchy";

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
  const [sharedFunnel, setSharedFunnel] = useState({ total: 0, dealCount: 0, loaded: false });
  const [contacts, setContacts] = useState([]);

  // ── The invoice form (Won deals) — Achievement counts only once invoiced ──
  // One modal, two jobs: recording the invoice, and CORRECTING the number
  // afterwards. There was no second job at all — the card printed "Invoiced #11"
  // and nothing in the app could change it — so 42 invoiced JASCO PVC deals
  // since 1 August 2026 hold a number no credit note can ever match.
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [invoiceMode, setInvoiceMode] = useState("mark");   // 'mark' | 'correct'
  const [invoicingDeal, setInvoicingDeal] = useState(null);
  const [invoiceForm, setInvoiceForm] = useState({ invoice_number: "", invoice_date: "", reason: "" });
  const [invoiceErrors, setInvoiceErrors] = useState({});
  const [savingInvoice, setSavingInvoice] = useState(false);
  const [correctionResult, setCorrectionResult] = useState(null);

  const closeInvoiceModal = () => {
    setShowInvoiceModal(false);
    setInvoicingDeal(null);
    setCorrectionResult(null);
  };

  const handleMarkInvoiced = (deal) => {
    setInvoiceMode("mark");
    setInvoicingDeal(deal);
    // Today in the user's own zone. toISOString() gives yesterday between
    // midnight and 03:00 in Riyadh, and this value is saved as the deal's
    // invoice_date — the date Achieved is counted by.
    setInvoiceForm({ invoice_number: "", invoice_date: format(new Date(), "yyyy-MM-dd"), reason: "" });
    setInvoiceErrors({});
    setCorrectionResult(null);
    setShowInvoiceModal(true);
  };

  const handleCorrectInvoice = (deal) => {
    setInvoiceMode("correct");
    setInvoicingDeal(deal);
    setInvoiceForm({
      invoice_number: deal?.invoice_number || "",
      // invoice_date is a DATE column, so Postgres hands back 'yyyy-mm-dd'
      // already: slicing it keeps the stored day. Parsing it into a Date and
      // formatting it back is what shifts an early-morning Riyadh date by one.
      invoice_date: String(deal?.invoice_date || "").slice(0, 10),
      reason: "",
    });
    setInvoiceErrors({});
    setCorrectionResult(null);
    setShowInvoiceModal(true);
  };

  const confirmInvoice = async () => {
    const correcting = invoiceMode === "correct";
    // One validator for both modes (components/InvoiceModal.jsx), so a
    // correction cannot accept a number that marking would have refused.
    const errors = validateInvoiceForm(invoiceForm, { requireReason: correcting });
    if (Object.keys(errors).length) { setInvoiceErrors(errors); return; }

    // Normalised — 10 digits, comma-separated for several — so the returns
    // file's 0093002906 and a typed 93002906 are the same value.
    const stored = formatInvoiceNumbers(parseInvoiceNumbers(invoiceForm.invoice_number));

    setSavingInvoice(true);
    try {
      const nowIso = new Date().toISOString();
      const previousNumber = invoicingDeal?.invoice_number || "";
      const previousDate = String(invoicingDeal?.invoice_date || "").slice(0, 10);

      // A correction changes the NUMBER, and the date that sits in the same
      // form. It must not touch is_invoiced, invoiced_at/by, the stage, the
      // amounts or the owner: the deal was already invoiced, by whoever
      // invoiced it, and Achieved must not move because a typo was fixed.
      const patch = correcting
        ? {
            invoice_number: stored,
            invoice_date: invoiceForm.invoice_date,
            updated_at: nowIso,
          }
        : {
            is_invoiced: true,
            invoice_number: stored,
            invoice_date: invoiceForm.invoice_date,
            invoiced_at: nowIso,
            invoiced_by: user?.id,
            updated_at: nowIso,
          };

      const { data, error } = await supabase
        .from("deals")
        .update(patch)
        .eq("id", invoicingDeal.id)
        .select("*, contact:contacts!contact_id(id, first_name, last_name, company_name), owner:users!owner_id(id, full_name, email)")
        .single();
      if (error) throw error;
      // Update in place so the card shows the new value without a full reload.
      setDeals((prev) => prev.map((d) => (d.id === data.id ? { ...d, ...data } : d)));

      if (!correcting) {
        closeInvoiceModal();
        return;
      }

      // The deal's history. `activities` is what this app already uses for it —
      // DealModal's "Activity Log" reads that table by deal_id, and the
      // lost-deal note is written the same way — so a correction shows up where
      // people already look. Best-effort: an audit entry must never fail a save
      // that has already happened, and createActivity RETURNS { error } rather
      // than throwing, so it is checked explicitly.
      const dateChanged = Boolean(invoiceForm.invoice_date) && previousDate !== invoiceForm.invoice_date;
      try {
        const { error: auditErr } = await activityService.createActivity({
          type: "note",
          title: "Invoice number corrected",
          description:
            `Invoice number corrected from "${previousNumber || "(blank)"}" to "${stored}"`
            + (dateChanged ? `; invoice date ${previousDate || "(blank)"} to ${invoiceForm.invoice_date}` : "")
            + `. Reason: ${invoiceForm.reason.trim()}`
            + ` — by ${userProfile?.full_name || "a user"}`
            + `${userProfile?.role ? ` (${userProfile.role})` : ""}.`,
          company_id: company.id,
          deal_id: data.id,
          contact_id: data.contact_id,
          owner_id: userProfile?.id,
        });
        if (auditErr) {
          console.error("Invoice correction note failed (non-fatal):",
            auditErr.code, auditErr.message, auditErr.details, auditErr.hint);
        }
      } catch (auditThrown) {
        console.error("Invoice correction note threw (non-fatal):", auditThrown);
      }

      // Re-run the importer's own match for this deal, so a credit note left
      // unmatched by the wrong number attaches now. A re-import would NOT do
      // it: the importer skips rows it has already stored, deal_id and all.
      let relink = { linked: 0, blocked: 0, ambiguous: 0 };
      let relinkError = null;
      try {
        const { data: res, error: relErr } = await dealService.relinkReturnsForDeal({
          companyId: company.id,
          dealId: data.id,
        });
        if (relErr) relinkError = relErr.message || "unknown error";
        else if (res) relink = res;
      } catch (relThrown) {
        relinkError = relThrown?.message || "unknown error";
      }

      setCorrectionResult({ stored, ...relink, relinkError });
    } catch (err) {
      console.error("Invoice:", err);
      setInvoiceErrors({ invoice_number: err.message || "Could not save invoice" });
    } finally {
      setSavingInvoice(false);
    }
  };
  const [users, setUsers] = useState([]);

  // Who may correct a number: the owner, anyone above him in the supervisor_id
  // chain, and admin/director (utils/teamHierarchy.js). A PEER salesman may not
  // — the invoice number decides which owner a credit note is charged to.
  const canCorrectThisInvoice = (deal) =>
    canCorrectInvoice({ users, viewer: userProfile, deal });

  const [selectedDeal, setSelectedDeal] = useState(null);
  const [showDealModal, setShowDealModal] = useState(false);
  const [showLostModal, setShowLostModal] = useState(false);
  const [dealBeingLost, setDealBeingLost] = useState(null);
  const [showContactReport, setShowContactReport] = useState(false);
  const [contactReportDeal, setContactReportDeal] = useState(null);
  const [contactReportStage, setContactReportStage] = useState(null);
  const [showReplacement, setShowReplacement] = useState(false);
  const [replacementDeal, setReplacementDeal] = useState(null);
  const [pendingLost, setPendingLost] = useState(null); // { dealId, code, notes }
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

  // Deep link to one deal (e.g. "Open deal →" in the KPI strip's Won, Not Yet
  // Invoiced list): state.openDealId opens that deal in the existing DealModal.
  // Unlike the effect above this cannot run only on mount — deals load
  // asynchronously — so it waits for the load to finish. replaceState clears the
  // browser's copy so a refresh doesn't reopen it, but React Router keeps
  // location.state in memory, so the ref (per navigation, via location.key)
  // stops a later setDeals — a save, a stage move — from reopening the modal.
  const openedDealForKeyRef = React.useRef(null);
  useEffect(() => {
    const openDealId = location.state?.openDealId;
    if (!openDealId || isLoading || openedDealForKeyRef.current === location.key) return;
    openedDealForKeyRef.current = location.key;
    const deal = deals.find((d) => d.id === openDealId);
    if (deal) handleEditDeal(deal);
    else console.warn("openDealId not found in the loaded deals:", openDealId);
    window.history.replaceState({}, document.title);
  }, [deals, isLoading, location.key, location.state]);

  // Add cache timestamp to track data freshness
  const [lastFetchTime, setLastFetchTime] = useState(null);
  const loadingRef = React.useRef(false);

  useEffect(() => {
    if (company && userProfile) {
      loadDeals();
      loadContacts();
      loadUsers();
      loadSharedFunnel();
    }
  }, [company, userProfile?.role]); // Reload when role changes

  useEffect(() => {
    applyFilters();
  }, [deals, filters, originFilter]); // Apply filters whenever deals or filters change

  const loadDeals = async (force = false) => {
    try {
      // For salesmen: Load deals owned by them
      // For supervisors/managers/directors/head/admin: Load all company deals
      const isManagementRole = ["supervisor", "manager", "director", "head", "admin"].includes(
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

  // The shared funnel figure (utils/openFunnel.js), for the analytics card when
  // no filter is narrowing the list. The page's own deal list is deliberately
  // company-wide and unfiltered by stage, which is right for browsing a pipeline
  // and wrong for a figure labelled "Total Funnel" — so the headline number comes
  // from the shared definition instead, and agrees with Planning and the KPI strip.
  const loadSharedFunnel = async () => {
    if (!company?.id || !user?.id) return;
    try {
      const isTeamLead = ["manager", "supervisor"].includes(userProfile?.role);
      const isDirector = ["director", "head", "admin"].includes(userProfile?.role);
      let ownerIds;
      if (isDirector) {
        ownerIds = null;                       // whole company, resolved by the util
      } else if (isTeamLead) {
        const team = await fetchTeamHierarchy({
          companyId: company.id, userId: user.id, role: userProfile?.role,
        });
        ownerIds = [user.id, ...team.map((m) => m.id)].filter(Boolean);
      } else {
        ownerIds = [user.id];
      }
      if (ownerIds === null) {
        const { data: everyone } = await supabase
          .from("users").select("id").eq("company_id", company.id).eq("is_active", true);
        ownerIds = (everyone || []).map((u) => u.id);
      }
      const funnel = await fetchOpenFunnel({ companyId: company.id, ownerIds });
      setSharedFunnel({
        total: funnel.total, dealCount: funnel.dealCount,
        undated: funnel.undated, bounds: funnel.bounds,
        loaded: !funnel.failed,
      });
    } catch (err) {
      console.error("loadSharedFunnel:", err);
      setSharedFunnel({ total: 0, dealCount: 0, loaded: false });
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

  // Everything except the date, mirroring what applyFilters() acts on.
  const nonDateFiltersActive = !!(
    filters.search
    || filters.owner_id
    || filters.stage
    || filters.minValue
    || filters.maxValue
    || filters.showOverdue
    || originFilter !== 'all'
  );

  // The shared funnel definition is CURRENT MONTH, so the current month is the
  // date selection that matches it — not an empty one. All Time is therefore a
  // filtered view here, even though it narrows nothing: it no longer describes
  // the same thing as Planning and the KPI strip.
  const dateIsCurrentMonth = (() => {
    const dr = filters.dateRange;
    if (!dr || typeof dr !== 'object') return false;      // "" = All Time
    const cm = currentMonthBounds();
    return dr.from === cm.start && dr.to === cm.end;
  })();

  const hasActiveFilters = nonDateFiltersActive || !dateIsCurrentMonth;

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
        deal.currency || "SAR",
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
      Currency:         d.currency || "SAR",
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

  // Quick action on a Lead card. Opens the SAME DealModal flow (month picker →
  // validation → mandatory ReplacementModal → completeMoveToFuture) rather than
  // duplicating any of it — the card only chooses which step the modal opens on.
  const [dealModalAction, setDealModalAction] = useState(null);
  const handleMoveToFutureFromCard = (deal) => {
    setSelectedDeal(deal);
    setDealModalAction('move_future');
    setShowDealModal(true);
  };

  const handleDealSave = async (dealData) => {
    try {
      // CREATE and EDIT take deliberately different routes.
      //
      // EDIT is a real UPDATE. It used to be an upsert, which Postgres runs as
      // INSERT ... ON CONFLICT DO UPDATE — and an INSERT policy's WITH CHECK is
      // evaluated against the CANDIDATE row, before conflict resolution. The
      // deals INSERT policy is
      //   owner_id = auth.uid() OR can_manage_user_contacts(auth.uid(), owner_id)
      // so once DealModal stopped sending owner_id on edit (so an edit could not
      // silently steal ownership), the candidate row's owner_id was NULL, that
      // check failed for EVERY user, and all deal saves broke in production.
      //
      // A plain UPDATE evaluates only the UPDATE policy, against the EXISTING
      // row — whose owner_id is unchanged and already passes, including the
      // hierarchy branch that lets a manager edit a team member's deal. So the
      // row is never a candidate for INSERT and the whole failure mode is gone,
      // rather than being worked around by re-sending owner_id.
      //
      // updateDeal() is also simply the better fit: it stamps stage_changed_at
      // only on a real stage change, recomputes the forecast only when stage or
      // amount moves, records deal_stage_history (upsertDeal never did), and
      // leaves closed_at alone instead of nulling it on every edit of an open
      // deal. Same joined shape back, so callers below are unaffected.
      let data, error;

      if (selectedDeal?.id) {
        // owner_id and id are never part of an update: id addresses the row, and
        // ownership changes only through an explicit reassignment action.
        const { id: _id, owner_id: _ownerId, ...updates } = dealData;
        ({ data, error } = await dealService.updateDeal(selectedDeal.id, updates));
      } else {
        ({ data, error } = await dealService.upsertDeal({
          ...dealData,
          company_id: company.id,
          owner_id: dealData.owner_id || userProfile?.id,
        }));
      }

      if (error) {
        console.error("Deal save error:", error);
        throw error;
      }

      if (selectedDeal) {
        setDeals(deals.map((d) => (d.id === data.id ? data : d)));

        // Someone editing a deal they do not own — a manager or supervisor acting
        // for a team member. The owner must be able to see that it happened and
        // who did it, so the change never looks like their own. Checked on EVERY
        // edit, not only stage moves: the ownership bug this accompanies was
        // triggered by any save at all, and a silent amount or close-date change
        // on someone's deal deserves the same visibility.
        //
        // Distinct from the role-based notification updateDeal() already sends,
        // which travels UP the hierarchy to supervisors; this one goes DOWN to
        // the deal's owner. Different audiences, not a duplicate.
        const trueOwnerId = data.owner_id || selectedDeal.owner_id;
        const actingForOwner = Boolean(trueOwnerId) && trueOwnerId !== userProfile?.id;
        const actorName = userProfile?.full_name || "A manager";
        const actorRole = userProfile?.role
          ? userProfile.role.charAt(0).toUpperCase() + userProfile.role.slice(1)
          : "Manager";
        const dealLabel =
          data.title || data.contact?.company_name || selectedDeal.title || "a deal";

        // Log activity for deal update
        const stageChanged = selectedDeal.stage !== data.stage;

        if (actingForOwner) {
          // Best-effort: an audit entry or notification must never fail the save.
          // createActivity() also RETURNS { error } instead of throwing — same
          // trap as the notification insert below. Check it explicitly.
          try {
            const { error: auditErr } = await activityService.createActivity({
              type: "note",
              title: stageChanged
                ? `Stage changed to ${data.stage} by ${actorName} (${actorRole})`
                : `Deal updated by ${actorName} (${actorRole})`,
              description: stageChanged
                ? `${actorName} (${actorRole}) moved "${dealLabel}" from ${selectedDeal.stage} to ${data.stage} on behalf of the deal owner.`
                : `${actorName} (${actorRole}) edited "${dealLabel}" on behalf of the deal owner.`,
              company_id: company.id,
              deal_id: data.id,
              contact_id: data.contact_id,
              owner_id: userProfile?.id,
            });
            if (auditErr) {
              console.error(
                "Audit activity failed (non-fatal):",
                auditErr.code, auditErr.message, auditErr.details, auditErr.hint,
              );
            }
          } catch (auditThrown) {
            console.error("Audit activity threw (non-fatal):", auditThrown);
          }

          // supabase-js RETURNS { error } rather than throwing on a database or
          // RLS rejection, so a try/catch alone silently swallows the failure —
          // which is exactly what happened on the first live test: the audit
          // entry landed, no notification row appeared, and the console showed
          // nothing at all. The returned error must be inspected explicitly.
          try {
            const { error: notifyErr } = await supabase.from("notifications").insert({
              user_id: trueOwnerId,
              company_id: company.id,
              type: "deal_changed",
              title: "📋 Your Deal Was Updated by Your Manager",
              message: stageChanged
                ? `${actorName} moved "${dealLabel}" to ${data.stage} on your behalf.`
                : `${actorName} updated "${dealLabel}" on your behalf.`,
              is_read: false,
              metadata: {
                deal_id: data.id,
                actor_id: userProfile?.id,
                actor_name: actorName,
                actor_role: userProfile?.role || null,
                from_stage: stageChanged ? selectedDeal.stage : null,
                to_stage: stageChanged ? data.stage : null,
              },
            });
            if (notifyErr) {
              console.error(
                "Owner notification failed (non-fatal):",
                notifyErr.code, notifyErr.message, notifyErr.details, notifyErr.hint,
              );
            }
          } catch (notifyThrown) {
            console.error("Owner notification threw (non-fatal):", notifyThrown);
          }
        }

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

    const deal = deals.find((d) => d.id === dealId);
    if (!deal || deal.stage === newStage) return; // ignore no-op drops

    // Every stage change except Won (own invoice/close flow) and Lost (reason
    // modal above) requires a contact report first — the report advances the
    // deal once saved.
    if (newStage !== "won") {
      setContactReportDeal(deal);
      setContactReportStage(newStage);
      setShowContactReport(true);
      return;
    }

    try {
      const updates = {
        stage: newStage,
        closed_at: new Date().toISOString(),
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
                    onMarkInvoiced={handleMarkInvoiced}
                    onCorrectInvoice={handleCorrectInvoice}
                    canCorrectInvoice={canCorrectThisInvoice}
                    onMoveToFuture={handleMoveToFutureFromCard}
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
            // With no filter active the headline funnel comes from the shared
            // definition, so this card agrees with Planning and the KPI strip.
            // With a filter active the card keeps describing the filtered list —
            // that is the page doing its job — and says so in its label.
            sharedFunnel={sharedFunnel}
            isFiltered={hasActiveFilters}
            activePeriodFrom={
              filters.customDateRange?.from ||
              format(startOfMonth(new Date()), 'yyyy-MM-dd')
            }
            // The period's end, for the figures that ask "closed in this
            // period?" rather than "entered the funnel in it?".
            activePeriodTo={
              filters.customDateRange?.to ||
              format(endOfMonth(new Date()), 'yyyy-MM-dd')
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
        onConfirm={(code, notes) => {
          // A replacement opportunity is mandatory before the deal is actually
          // marked lost — defer the removal until the replacement is created.
          setReplacementDeal(dealBeingLost);
          setPendingLost({ dealId: dealBeingLost.id, code, notes });
          setShowLostModal(false);
          setDealBeingLost(null);
          setShowReplacement(true);
        }}
        onCancel={() => {
          setShowLostModal(false);
          setDealBeingLost(null);
        }}
      />

      {/* Mandatory replacement opportunity — must be added before the deal is
          removed from the pipeline (marked Lost). Cancelling keeps the deal. */}
      {showReplacement && replacementDeal && (
        <ReplacementModal
          removedDeal={replacementDeal}
          removalType="lost"
          onClose={() => {
            setShowReplacement(false);
            setReplacementDeal(null);
            setPendingLost(null);
          }}
          onSaved={async () => {
            if (pendingLost) {
              try {
                const { data, error } = await dealService.updateDealLost(
                  pendingLost.dealId,
                  { lost_reason_code: pendingLost.code, lost_reason_notes: pendingLost.notes, company_id: company?.id },
                );
                if (error) throw error;
                setDeals((prev) => prev.map((d) => (d.id === data.id ? data : d)));
              } catch (err) {
                console.error("Failed to mark deal lost:", err);
              }
            }
            setShowReplacement(false);
            setReplacementDeal(null);
            setPendingLost(null);
            loadDeals(true);
          }}
        />
      )}

      {/* Mandatory contact report — gates a stage change (report saves, then advances) */}
      {showContactReport && contactReportDeal && (
        <ContactReportModal
          deal={contactReportDeal}
          nextStage={contactReportStage}
          onClose={() => {
            setShowContactReport(false);
            setContactReportDeal(null);
            setContactReportStage(null);
          }}
          onSaved={() => {
            setShowContactReport(false);
            setContactReportDeal(null);
            setContactReportStage(null);
            loadDeals(true);
          }}
        />
      )}

      {/* The invoice form: recording an invoice, and correcting the number
          afterwards. One component, one validator, one normaliser — so the two
          flows cannot drift apart (components/InvoiceModal.jsx). */}
      {showInvoiceModal && invoicingDeal && (
        <InvoiceModal
          deal={invoicingDeal}
          mode={invoiceMode}
          form={invoiceForm}
          errors={invoiceErrors}
          saving={savingInvoice}
          result={correctionResult}
          onChange={(patch) => setInvoiceForm((f) => ({ ...f, ...patch }))}
          onCancel={closeInvoiceModal}
          onConfirm={confirmInvoice}
        />
      )}

      {/* Deal Modal */}
      <DealModal
        deal={selectedDeal}
        isOpen={showDealModal}
        onSave={handleDealSave}
        onDelete={handleDealDelete}
        onClose={() => { setShowDealModal(false); setDealModalAction(null); }}
        initialAction={dealModalAction}
        contacts={contacts}
        users={users}
      />
    </div>
  );
};

export default SalesPipeline;
