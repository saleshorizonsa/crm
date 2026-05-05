import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import Icon from "../../components/AppIcon";
import Button from "../../components/ui/Button";
import Input from "../../components/ui/Input";
import Header from "../../components/ui/Header";
import NavigationBreadcrumbs from "../../components/ui/NavigationBreadcrumbs";
import ApolloSearchPanel from "./components/ApolloSearchPanel";
import LeadDetailModal from "./components/LeadDetailModal";
import { useAuth } from "../../contexts/AuthContext";
import { leadService } from "../../services/leadService";

// ── Constants ──────────────────────────────────────────────────────────────────

const REGION_LABELS = {
  riyadh:"Riyadh", jeddah:"Jeddah", dammam:"Dammam", khobar:"Al Khobar",
  makkah:"Makkah", madinah:"Madinah", dubai:"Dubai", abudhabi:"Abu Dhabi",
  kuwait:"Kuwait", bahrain:"Bahrain", qatar:"Qatar",
};

const STATUS_CONFIG = {
  new:          { label: "New",          bg: "bg-blue-100",    text: "text-blue-700"   },
  contacted:    { label: "Contacted",    bg: "bg-amber-100",   text: "text-amber-700"  },
  qualified:    { label: "Qualified",    bg: "bg-green-100",   text: "text-green-700"  },
  unqualified:  { label: "Unqualified",  bg: "bg-gray-100",    text: "text-gray-600"   },
  converted:    { label: "Converted",    bg: "bg-teal-100",    text: "text-teal-700"   },
};

const PRODUCT_CONFIG = {
  steel:   { bg: "bg-slate-100",  text: "text-slate-700"  },
  pvc:     { bg: "bg-cyan-100",   text: "text-cyan-700"   },
  trading: { bg: "bg-purple-100", text: "text-purple-700" },
};

const SOURCE_CONFIG = {
  apollo:   { label: "Apollo",   bg: "bg-blue-50",   text: "text-blue-600"  },
  manual:   { label: "Manual",   bg: "bg-gray-50",   text: "text-gray-600"  },
  import:   { label: "Import",   bg: "bg-orange-50", text: "text-orange-600"},
  referral: { label: "Referral", bg: "bg-pink-50",   text: "text-pink-600"  },
};

const SCORE_COLOR = (s) =>
  s >= 70 ? "text-red-600 font-bold" :
  s >= 40 ? "text-amber-600 font-semibold" :
            "text-gray-400";

const fmtDate = (d) => {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

// ── Three-dot row menu ─────────────────────────────────────────────────────────
const RowMenu = ({ lead, onView, onStatus, onConvert, onDelete }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600"
      >
        <Icon name="MoreVertical" size={15} />
      </button>
      {open && (
        <div className="absolute right-0 top-8 z-30 w-48 bg-white rounded-lg shadow-xl border border-gray-200 py-1 text-sm">
          <button className="w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center gap-2"
            onClick={() => { setOpen(false); onView(lead); }}>
            <Icon name="Eye" size={13} className="text-gray-500" />View details
          </button>
          {lead.status !== "converted" && (
            <>
              <button className="w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center gap-2"
                onClick={() => { setOpen(false); onStatus(lead.id, "contacted"); }}>
                <Icon name="Phone" size={13} className="text-amber-500" />Mark as contacted
              </button>
              <button className="w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center gap-2"
                onClick={() => { setOpen(false); onStatus(lead.id, "qualified"); }}>
                <Icon name="CheckCircle" size={13} className="text-green-500" />Mark as qualified
              </button>
              <div className="border-t border-gray-100 my-1" />
              <button className="w-full text-left px-3 py-2 hover:bg-emerald-50 flex items-center gap-2 text-emerald-700 font-medium"
                onClick={() => { setOpen(false); onConvert(lead.id); }}>
                <Icon name="UserCheck" size={13} />Convert to contact
              </button>
              <div className="border-t border-gray-100 my-1" />
              <button className="w-full text-left px-3 py-2 hover:bg-red-50 flex items-center gap-2 text-red-600"
                onClick={() => { setOpen(false); onDelete([lead.id]); }}>
                <Icon name="Trash2" size={13} />Delete
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
};

// ── Main component ─────────────────────────────────────────────────────────────
const LeadManagement = () => {
  const { user, userProfile, company } = useAuth();
  const role = userProfile?.role;

  // ── State ──────────────────────────────────────────────────────────────────
  const [leads,           setLeads]           = useState([]);
  const [loading,         setLoading]         = useState(true);
  const [stats,           setStats]           = useState({ new:0, contacted:0, qualified:0, unqualified:0, converted:0, total:0 });
  const [filters,         setFilters]         = useState({ status:"", region:"", product:"", search:"", assigned_to:"" });
  const [selectedLeads,   setSelectedLeads]   = useState(new Set());

  // Panels / modals
  const [showApolloPanel, setShowApolloPanel] = useState(false);
  const [showModal,       setShowModal]       = useState(false);
  const [selectedLead,    setSelectedLead]    = useState(null);

  // Import feedback
  const [importing,       setImporting]       = useState(false);
  const [importSummary,   setImportSummary]   = useState(null);

  // Bulk assign
  const [bulkAssignTo,    setBulkAssignTo]    = useState("");
  const [companyUsers,    setCompanyUsers]    = useState([]);

  const loadingRef = useRef(false);

  // ── Load ───────────────────────────────────────────────────────────────────
  const loadLeads = useCallback(async () => {
    if (!company?.id || loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    const { data, error } = await leadService.getLeads(
      company.id, filters, user?.id, role
    );
    setLeads(error ? [] : (data || []));
    setLoading(false);
    loadingRef.current = false;
  }, [company?.id, filters, user?.id, role]);

  const loadStats = useCallback(async () => {
    if (!company?.id) return;
    const { data } = await leadService.getLeadStats(company.id);
    if (data) setStats(data);
  }, [company?.id]);

  const loadUsers = useCallback(async () => {
    if (!company?.id) return;
    const { supabase } = await import("../../lib/supabase");
    const { data } = await supabase
      .from("users")
      .select("id, full_name")
      .eq("company_id", company.id)
      .eq("is_active", true)
      .order("full_name");
    setCompanyUsers(data || []);
  }, [company?.id]);

  useEffect(() => {
    if (user?.id && company?.id) {
      loadLeads();
      loadStats();
      if (role !== "salesman") loadUsers();
    }
  }, [user?.id, company?.id]);

  // Re-run on filter change
  useEffect(() => {
    if (user?.id && company?.id) loadLeads();
  }, [filters]);

  // ── Derived ────────────────────────────────────────────────────────────────
  const filteredLeads = useMemo(() => {
    let list = [...leads];
    if (filters.search) {
      const q = filters.search.toLowerCase();
      list = list.filter(
        (l) =>
          l.first_name?.toLowerCase().includes(q) ||
          l.last_name?.toLowerCase().includes(q)  ||
          l.company_name?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [leads, filters.search]);

  const allSelected = filteredLeads.length > 0 && selectedLeads.size === filteredLeads.length;

  // ── Handlers ───────────────────────────────────────────────────────────────
  const setFilter = (key, value) =>
    setFilters((prev) => ({ ...prev, [key]: value }));

  const toggleRow = (id) => {
    setSelectedLeads((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (allSelected) {
      setSelectedLeads(new Set());
    } else {
      setSelectedLeads(new Set(filteredLeads.map((l) => l.id)));
    }
  };

  const handleOpenLead = (lead) => {
    setSelectedLead(lead);
    setShowModal(true);
  };

  const handleAddManually = () => {
    setSelectedLead(null);
    setShowModal(true);
  };

  const handleSaveLead = async (data) => {
    try {
      if (data.id) {
        const { data: updated, error } = await leadService.updateLead(data.id, data);
        if (error) throw error;
        setLeads((prev) => prev.map((l) => (l.id === updated.id ? updated : l)));
      } else {
        const { data: created, error } = await leadService.createLead({
          ...data,
          company_id:  company.id,
          assigned_to: user.id,
          assigned_by: user.id,
        });
        if (error) throw error;
        setLeads((prev) => [created, ...prev]);
      }
      setShowModal(false);
      setSelectedLead(null);
      loadStats();
    } catch (err) {
      throw err;
    }
  };

  const handleDeleteLead = async (leadId) => {
    const { error } = await leadService.deleteLead(leadId);
    if (!error) {
      setLeads((prev) => prev.filter((l) => l.id !== leadId));
      setShowModal(false);
      setSelectedLead(null);
      loadStats();
    }
  };

  const handleConvertLead = async (leadId) => {
    const { contact, error } = await leadService.convertLeadToContact(leadId, user.id);
    if (error) { alert("Conversion failed: " + error.message); return; }
    // Update lead in list to show converted
    setLeads((prev) =>
      prev.map((l) => l.id === leadId ? { ...l, status: "converted", converted_to: contact.id } : l)
    );
    setShowModal(false);
    setSelectedLead(null);
    loadStats();
  };

  const handleQuickStatus = async (leadId, status) => {
    const { data, error } = await leadService.updateLead(leadId, { status });
    if (!error && data) {
      setLeads((prev) => prev.map((l) => (l.id === leadId ? data : l)));
      loadStats();
    }
  };

  const handleDeleteSelected = async () => {
    const ids = [...selectedLeads];
    if (!window.confirm(`Delete ${ids.length} lead(s)?`)) return;
    const { error } = await leadService.deleteLeads(ids);
    if (!error) {
      setLeads((prev) => prev.filter((l) => !ids.includes(l.id)));
      setSelectedLeads(new Set());
      loadStats();
    }
  };

  const handleBulkStatus = async (status) => {
    const ids = [...selectedLeads];
    await Promise.all(ids.map((id) => leadService.updateLead(id, { status })));
    await loadLeads();
    setSelectedLeads(new Set());
    loadStats();
  };

  const handleBulkAssign = async () => {
    if (!bulkAssignTo) return;
    const ids = [...selectedLeads];
    await Promise.all(ids.map((id) => leadService.updateLead(id, { assigned_to: bulkAssignTo })));
    await loadLeads();
    setSelectedLeads(new Set());
    setBulkAssignTo("");
  };

  const handleImport = async (apolloLeads) => {
    setImporting(true);
    const summary = await leadService.importLeads(apolloLeads, company.id, user.id);
    setImporting(false);
    setImportSummary(summary);
    await loadLeads();
    await loadStats();
    setTimeout(() => setImportSummary(null), 6000);
  };

  const handleStatClick = (status) => {
    setFilter("status", filters.status === status ? "" : status);
  };

  if (!user) return <div>Loading…</div>;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50">
      <Header />

      <main className="p-6 space-y-5">
        {/* Page header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <NavigationBreadcrumbs
              items={[
                { label: "Dashboard", href: "/company-dashboard" },
                { label: "Lead Management", href: "/lead-management" },
              ]}
            />
            <h1 className="text-2xl font-semibold text-gray-900 mt-1">Lead Management</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Prospect pipeline powered by Apollo.io
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {importSummary && (
              <span className="text-xs font-medium text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-lg">
                {importSummary.imported} imported · {importSummary.duplicates} skipped
                {importSummary.errors > 0 && ` · ${importSummary.errors} errors`}
              </span>
            )}
            <Button variant="outline" size="sm" onClick={handleAddManually} className="gap-2">
              <Icon name="Plus" size={14} />Add manually
            </Button>
            <Button size="sm" onClick={() => setShowApolloPanel(true)} className="gap-2">
              <Icon name="Zap" size={14} />Search Apollo
            </Button>
          </div>
        </div>

        {/* Stats bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { key: "new",       label: "New",       icon: "UserPlus",    color: "text-blue-600",    bg: "bg-blue-50"   },
            { key: "contacted", label: "Contacted", icon: "Phone",       color: "text-amber-600",   bg: "bg-amber-50"  },
            { key: "qualified", label: "Qualified", icon: "CheckCircle", color: "text-green-600",   bg: "bg-green-50"  },
            { key: "converted", label: "Converted", icon: "UserCheck",   color: "text-teal-600",    bg: "bg-teal-50"   },
          ].map(({ key, label, icon, color, bg }) => (
            <button
              key={key}
              type="button"
              onClick={() => handleStatClick(key)}
              className={`bg-card border rounded-lg p-4 flex items-center gap-3 text-left transition-all hover:shadow-md ${
                filters.status === key ? "border-primary ring-2 ring-primary/20" : "border-border"
              }`}
            >
              <div className={`w-10 h-10 ${bg} rounded-lg flex items-center justify-center flex-shrink-0`}>
                <Icon name={icon} size={18} className={color} />
              </div>
              <div>
                <p className="text-xl font-bold text-foreground">{stats[key]}</p>
                <p className="text-xs text-muted-foreground">{label}</p>
              </div>
            </button>
          ))}
        </div>

        {/* Filter bar */}
        <div className="bg-card border border-border rounded-lg px-4 py-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex-1 min-w-[200px]">
              <Input
                placeholder="Search name or company…"
                value={filters.search}
                onChange={(e) => setFilter("search", e.target.value)}
                className="h-9 text-sm"
              />
            </div>
            {/* Status */}
            <select
              value={filters.status}
              onChange={(e) => setFilter("status", e.target.value)}
              className="px-3 py-2 border border-border rounded-md bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary h-9"
            >
              <option value="">All statuses</option>
              {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
            {/* Region */}
            <select
              value={filters.region}
              onChange={(e) => setFilter("region", e.target.value)}
              className="px-3 py-2 border border-border rounded-md bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary h-9"
            >
              <option value="">All regions</option>
              {Object.entries(REGION_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
            {/* Product */}
            <select
              value={filters.product}
              onChange={(e) => setFilter("product", e.target.value)}
              className="px-3 py-2 border border-border rounded-md bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary h-9"
            >
              <option value="">All products</option>
              <option value="steel">Steel</option>
              <option value="pvc">PVC</option>
              <option value="trading">Trading</option>
            </select>
            {/* Source */}
            <select
              value={filters.source || ""}
              onChange={(e) => setFilter("source", e.target.value)}
              className="px-3 py-2 border border-border rounded-md bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary h-9"
            >
              <option value="">All sources</option>
              <option value="apollo">Apollo</option>
              <option value="manual">Manual</option>
              <option value="import">Import</option>
              <option value="referral">Referral</option>
            </select>
            {/* Assigned to (hidden for salesman) */}
            {role !== "salesman" && companyUsers.length > 0 && (
              <select
                value={filters.assigned_to}
                onChange={(e) => setFilter("assigned_to", e.target.value)}
                className="px-3 py-2 border border-border rounded-md bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary h-9"
              >
                <option value="">All owners</option>
                {companyUsers.map((u) => (
                  <option key={u.id} value={u.id}>{u.full_name}</option>
                ))}
              </select>
            )}
            {/* Clear filters */}
            {(filters.status || filters.region || filters.product || filters.source || filters.assigned_to) && (
              <button
                type="button"
                onClick={() => setFilters({ status:"", region:"", product:"", search: filters.search, assigned_to:"", source:"" })}
                className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1 underline"
              >
                <Icon name="X" size={11} />Clear
              </button>
            )}
          </div>
        </div>

        {/* Bulk actions bar */}
        {selectedLeads.size > 0 && (
          <div className="bg-primary/5 border border-primary/20 rounded-lg px-4 py-3 flex items-center gap-3 flex-wrap">
            <span className="text-sm font-medium text-primary">
              {selectedLeads.size} lead{selectedLeads.size !== 1 ? "s" : ""} selected
            </span>
            {/* Assign to */}
            {role !== "salesman" && companyUsers.length > 0 && (
              <div className="flex items-center gap-2">
                <select
                  value={bulkAssignTo}
                  onChange={(e) => setBulkAssignTo(e.target.value)}
                  className="px-2 py-1.5 border border-border rounded-md bg-background text-sm focus:outline-none h-8"
                >
                  <option value="">Assign to…</option>
                  {companyUsers.map((u) => (
                    <option key={u.id} value={u.id}>{u.full_name}</option>
                  ))}
                </select>
                {bulkAssignTo && (
                  <Button size="sm" variant="outline" onClick={handleBulkAssign} className="h-8 text-xs gap-1">
                    <Icon name="UserCheck" size={12} />Assign
                  </Button>
                )}
              </div>
            )}
            <Button size="sm" variant="outline" onClick={() => handleBulkStatus("contacted")} className="h-8 text-xs gap-1">
              <Icon name="Phone" size={12} className="text-amber-500" />Mark contacted
            </Button>
            <Button size="sm" variant="outline" onClick={() => handleBulkStatus("qualified")} className="h-8 text-xs gap-1">
              <Icon name="CheckCircle" size={12} className="text-green-500" />Mark qualified
            </Button>
            <Button size="sm" variant="outline" onClick={handleDeleteSelected} className="h-8 text-xs gap-1 text-red-600 border-red-200 hover:bg-red-50">
              <Icon name="Trash2" size={12} />Delete
            </Button>
            <button
              type="button"
              onClick={() => setSelectedLeads(new Set())}
              className="text-xs text-gray-400 hover:text-gray-600 ml-auto"
            >
              Clear selection
            </button>
          </div>
        )}

        {/* Table / Empty state */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Icon name="Loader2" size={32} className="text-gray-300 animate-spin" />
          </div>
        ) : filteredLeads.length === 0 ? (
          <div className="bg-card border border-border rounded-xl p-16 text-center">
            <Icon name="UserPlus" size={48} className="mx-auto text-gray-200 mb-4" />
            <p className="text-lg font-medium text-foreground">No leads yet</p>
            <p className="text-sm text-muted-foreground mt-1 mb-6">
              {filters.status || filters.region || filters.product || filters.search
                ? "No leads match the current filters."
                : "Search Apollo to find prospects or add one manually."}
            </p>
            {!filters.status && !filters.region && !filters.product && !filters.search && (
              <Button onClick={() => setShowApolloPanel(true)} className="gap-2">
                <Icon name="Zap" size={15} />Search Apollo
              </Button>
            )}
          </div>
        ) : (
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 border-b border-border">
                  <tr>
                    <th className="px-4 py-3 w-10">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        onChange={toggleAll}
                        className="rounded border-gray-300"
                      />
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Name</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Company</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Region</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Products</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Score</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Assigned</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Source</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Added</th>
                    <th className="px-4 py-3 w-10" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredLeads.map((lead) => {
                    const sc = STATUS_CONFIG[lead.status] || STATUS_CONFIG.new;
                    return (
                      <tr
                        key={lead.id}
                        className="hover:bg-accent/50 cursor-pointer transition-colors"
                        onClick={() => handleOpenLead(lead)}
                      >
                        {/* Checkbox */}
                        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selectedLeads.has(lead.id)}
                            onChange={() => toggleRow(lead.id)}
                            className="rounded border-gray-300"
                          />
                        </td>

                        {/* Name */}
                        <td className="px-4 py-3">
                          <div className="font-medium text-foreground">
                            {lead.first_name} {lead.last_name}
                          </div>
                          {lead.title && (
                            <div className="text-xs text-muted-foreground truncate max-w-[160px]">
                              {lead.title}
                            </div>
                          )}
                        </td>

                        {/* Company */}
                        <td className="px-4 py-3">
                          <div className="text-foreground font-medium truncate max-w-[160px]">
                            {lead.company_name || "—"}
                          </div>
                          {lead.industry && (
                            <div className="text-xs text-muted-foreground truncate max-w-[160px]">
                              {lead.industry}
                            </div>
                          )}
                        </td>

                        {/* Region */}
                        <td className="px-4 py-3 text-sm text-muted-foreground">
                          {lead.region ? (
                            <>
                              <div>{REGION_LABELS[lead.region] || lead.region}</div>
                              {lead.city && (
                                <div className="text-xs text-muted-foreground">{lead.city}</div>
                              )}
                            </>
                          ) : lead.city ? (
                            <div className="text-xs">{lead.city}</div>
                          ) : "—"}
                        </td>

                        {/* Products */}
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1">
                            {(lead.product_interest || []).length > 0
                              ? (lead.product_interest || []).map((p) => {
                                  const pc = PRODUCT_CONFIG[p] || { bg: "bg-gray-100", text: "text-gray-600" };
                                  return (
                                    <span key={p} className={`px-1.5 py-0.5 rounded text-[10px] font-medium uppercase ${pc.bg} ${pc.text}`}>
                                      {p}
                                    </span>
                                  );
                                })
                              : <span className="text-muted-foreground">—</span>}
                          </div>
                        </td>

                        {/* Status */}
                        <td className="px-4 py-3">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${sc.bg} ${sc.text}`}>
                            {sc.label}
                          </span>
                        </td>

                        {/* Score */}
                        <td className="px-4 py-3">
                          <span className={`text-sm ${SCORE_COLOR(lead.lead_score || 0)}`}>
                            {lead.lead_score || 0}
                          </span>
                        </td>

                        {/* Assigned to */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                              <Icon name="User" size={10} className="text-primary" />
                            </div>
                            <span className="text-xs text-muted-foreground truncate max-w-[100px]">
                              {lead.assigned_user?.full_name || "Unassigned"}
                            </span>
                          </div>
                        </td>

                        {/* Source */}
                        <td className="px-4 py-3">
                          {(() => {
                            const sc2 = SOURCE_CONFIG[lead.source] || SOURCE_CONFIG.manual;
                            return (
                              <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium ${sc2.bg} ${sc2.text}`}>
                                {sc2.label}
                              </span>
                            );
                          })()}
                        </td>

                        {/* Date */}
                        <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                          {fmtDate(lead.created_at)}
                        </td>

                        {/* Actions */}
                        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                          <RowMenu
                            lead={lead}
                            onView={handleOpenLead}
                            onStatus={handleQuickStatus}
                            onConvert={handleConvertLead}
                            onDelete={handleDeleteSelected.bind(null, [lead.id])}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Table footer */}
            <div className="px-4 py-2.5 border-t border-border bg-muted/20 text-xs text-muted-foreground flex items-center justify-between">
              <span>{filteredLeads.length} lead{filteredLeads.length !== 1 ? "s" : ""}</span>
              <span>{stats.total} total</span>
            </div>
          </div>
        )}
      </main>

      {/* Apollo Search Panel */}
      <ApolloSearchPanel
        isOpen={showApolloPanel}
        onClose={() => setShowApolloPanel(false)}
        onImport={handleImport}
        companyId={company?.id}
      />

      {/* Lead detail / add modal */}
      <LeadDetailModal
        lead={selectedLead}
        isOpen={showModal}
        onSave={handleSaveLead}
        onDelete={handleDeleteLead}
        onClose={() => { setShowModal(false); setSelectedLead(null); }}
        onConvert={handleConvertLead}
      />
    </div>
  );
};

export default LeadManagement;
