import React, { useState, useEffect, useMemo } from "react";
import Icon from "../../components/AppIcon";
import Button from "../../components/ui/Button";
import Input from "../../components/ui/Input";
import Header from "../../components/ui/Header";
import NavigationBreadcrumbs from "../../components/ui/NavigationBreadcrumbs";
import LeadStats from "./components/LeadStats";
import LeadKanban from "./components/LeadKanban";
import LeadFormModal from "./components/LeadFormModal";
import { useAuth } from "../../contexts/AuthContext";
import { leadService } from "../../services/supabaseService";

const LeadManagement = () => {
  const { user, company } = useAuth();
  const [leads, setLeads] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showClosed, setShowClosed] = useState(false);
  const [selectedLead, setSelectedLead] = useState(null);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    if (user?.id) loadLeads();
  }, [user?.id]);

  const loadLeads = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await leadService.getLeads();
      if (error) throw error;
      setLeads(data || []);
    } catch (err) {
      console.error("Error loading leads:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const stats = useMemo(() => {
    if (!leads.length) return { total: 0, byGrade: {}, thisMonth: 0, conversionRate: 0 };

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const byGrade = leads.reduce((acc, l) => {
      if (l.lead_grade) acc[l.lead_grade] = (acc[l.lead_grade] || 0) + 1;
      return acc;
    }, {});

    const converted = leads.filter((l) => l.lead_status === "converted").length;
    const thisMonth = leads.filter((l) => new Date(l.created_at) >= monthStart).length;

    return {
      total: leads.length,
      byGrade,
      thisMonth,
      conversionRate: leads.length ? Math.round((converted / leads.length) * 100) : 0,
    };
  }, [leads]);

  const filteredLeads = useMemo(() => {
    if (!search.trim()) return leads;
    const q = search.toLowerCase();
    return leads.filter(
      (l) =>
        l.first_name?.toLowerCase().includes(q) ||
        l.last_name?.toLowerCase().includes(q) ||
        l.email?.toLowerCase().includes(q) ||
        l.company_name?.toLowerCase().includes(q)
    );
  }, [leads, search]);

  const handleSave = async (data) => {
    try {
      if (data.id) {
        const { data: updated, error } = await leadService.updateLead(data.id, data);
        if (error) throw error;
        setLeads((prev) => prev.map((l) => (l.id === updated.id ? updated : l)));
      } else {
        const { data: created, error } = await leadService.createLead({
          ...data,
          owner_id: user.id,
          status: "active",
        });
        if (error) throw error;
        setLeads((prev) => [created, ...prev]);
      }
      setShowModal(false);
      setSelectedLead(null);
    } catch (err) {
      console.error("Error saving lead:", err);
      alert(`Failed to save lead: ${err.message}`);
    }
  };

  const handleStatusChange = async (leadId, newStatus) => {
    try {
      const { data: updated, error } = await leadService.updateLeadStatus(leadId, newStatus);
      if (error) throw error;
      setLeads((prev) => prev.map((l) => (l.id === updated.id ? updated : l)));
    } catch (err) {
      console.error("Error updating lead status:", err);
      alert(`Failed to update lead: ${err.message}`);
    }
  };

  const handleDelete = async (leadId) => {
    if (!window.confirm("Delete this lead?")) return;
    try {
      const { error } = await leadService.deleteLead(leadId);
      if (error) throw error;
      setLeads((prev) => prev.filter((l) => l.id !== leadId));
    } catch (err) {
      console.error("Error deleting lead:", err);
      alert(`Failed to delete lead: ${err.message}`);
    }
  };

  const handleEdit = (lead) => {
    setSelectedLead(lead);
    setShowModal(true);
  };

  if (!user) return <div>Loading…</div>;

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />

      <main className="p-6">
        {/* Page header */}
        <div className="mb-6 flex justify-between items-center">
          <div>
            <NavigationBreadcrumbs
              items={[
                { label: "Dashboard", href: "/company-dashboard" },
                { label: "Leads", href: "/lead-management" },
              ]}
            />
            <h1 className="text-2xl font-semibold text-gray-900 mt-2">Lead Management</h1>
          </div>
          <Button
            variant="primary"
            onClick={() => { setSelectedLead(null); setShowModal(true); }}
            iconName="Plus"
            iconPosition="left"
          >
            Add Lead
          </Button>
        </div>

        <div className="space-y-6">
          {/* Stats */}
          <LeadStats stats={stats} />

          {/* Toolbar */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex-1">
              <Input
                type="search"
                placeholder="Search leads by name, email, or company…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full"
              />
            </div>
            <button
              onClick={() => setShowClosed((v) => !v)}
              className={`flex items-center gap-2 text-sm px-4 py-2 rounded-lg border transition-colors ${
                showClosed
                  ? "bg-gray-900 text-white border-gray-900"
                  : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
              }`}
            >
              <Icon name={showClosed ? "EyeOff" : "Eye"} size={14} />
              {showClosed ? "Hide Closed" : "Show Closed"}
            </button>
          </div>

          {/* Kanban */}
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <Icon name="Loader2" size={32} className="text-gray-400 animate-spin" />
            </div>
          ) : (
            <LeadKanban
              leads={filteredLeads}
              onEdit={handleEdit}
              onStatusChange={handleStatusChange}
              onDelete={handleDelete}
              showClosed={showClosed}
            />
          )}
        </div>
      </main>

      <LeadFormModal
        lead={selectedLead}
        isOpen={showModal}
        onSave={handleSave}
        onClose={() => { setShowModal(false); setSelectedLead(null); }}
      />
    </div>
  );
};

export default LeadManagement;
