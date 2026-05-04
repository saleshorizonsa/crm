import React, { useState, useEffect, useMemo } from "react";
import Icon from "../../components/AppIcon";
import Button from "../../components/ui/Button";
import Input from "../../components/ui/Input";
import Header from "../../components/ui/Header";
import NavigationBreadcrumbs from "../../components/ui/NavigationBreadcrumbs";
import LeadFormModal from "./components/LeadFormModal";
import { useAuth } from "../../contexts/AuthContext";
import { leadService } from "../../services/supabaseService";

const LeadManagement = () => {
  const { user } = useAuth();
  const [leads, setLeads] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
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
      // Only show lost leads
      setLeads((data || []).filter((l) => l.lead_status === "lost"));
    } catch (err) {
      console.error("Error loading leads:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const stats = useMemo(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    return {
      total: leads.length,
      thisMonth: leads.filter((l) => new Date(l.created_at) >= monthStart).length,
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
        // Keep in list only if still lost
        if (updated.lead_status === "lost") {
          setLeads((prev) => prev.map((l) => (l.id === updated.id ? updated : l)));
        } else {
          setLeads((prev) => prev.filter((l) => l.id !== updated.id));
        }
      } else {
        const { data: created, error } = await leadService.createLead({
          ...data,
          lead_status: "lost", // always lost in this view
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
                { label: "Lost Leads", href: "/lead-management" },
              ]}
            />
            <h1 className="text-2xl font-semibold text-gray-900 mt-2">Lost Leads</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Capture and track leads that were lost for re-engagement
            </p>
          </div>
          <Button
            variant="primary"
            onClick={() => { setSelectedLead(null); setShowModal(true); }}
            iconName="Plus"
            iconPosition="left"
          >
            Add Lost Lead
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-2 gap-4 mb-6">
          <div className="bg-card border border-border rounded-lg p-4 flex items-center gap-3">
            <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
              <Icon name="UserX" size={20} className="text-red-600" />
            </div>
            <div>
              <p className="text-xl font-bold">{stats.total}</p>
              <p className="text-xs text-muted-foreground">Total Lost Leads</p>
            </div>
          </div>
          <div className="bg-card border border-border rounded-lg p-4 flex items-center gap-3">
            <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
              <Icon name="Calendar" size={20} className="text-orange-600" />
            </div>
            <div>
              <p className="text-xl font-bold">{stats.thisMonth}</p>
              <p className="text-xs text-muted-foreground">Added This Month</p>
            </div>
          </div>
        </div>

        {/* Search */}
        <div className="mb-4">
          <Input
            type="search"
            placeholder="Search by name, email, or company…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full max-w-md"
          />
        </div>

        {/* Table */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Icon name="Loader2" size={32} className="text-gray-400 animate-spin" />
          </div>
        ) : filteredLeads.length === 0 ? (
          <div className="bg-card border border-border rounded-lg p-12 text-center">
            <Icon name="UserX" size={48} className="mx-auto text-muted-foreground mb-3" />
            <p className="text-card-foreground font-medium">No lost leads yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              {search ? "No results match your search." : "Add a lost lead to start tracking re-engagement opportunities."}
            </p>
          </div>
        ) : (
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-muted">
                  <tr>
                    <th className="text-left px-4 py-3 text-sm font-medium">Name</th>
                    <th className="text-left px-4 py-3 text-sm font-medium">Company</th>
                    <th className="text-left px-4 py-3 text-sm font-medium">Email</th>
                    <th className="text-left px-4 py-3 text-sm font-medium">Phone</th>
                    <th className="text-left px-4 py-3 text-sm font-medium">Source</th>
                    <th className="text-left px-4 py-3 text-sm font-medium">Added</th>
                    <th className="text-left px-4 py-3 text-sm font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredLeads.map((lead) => (
                    <tr key={lead.id} className="hover:bg-accent">
                      <td className="px-4 py-3">
                        <div className="font-medium text-card-foreground">
                          {lead.first_name} {lead.last_name}
                        </div>
                        {lead.job_title && (
                          <div className="text-xs text-muted-foreground">{lead.job_title}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">
                        {lead.company_name || "—"}
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">
                        {lead.email || "—"}
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">
                        {lead.phone || "—"}
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground capitalize">
                        {lead.lead_source?.replace("_", " ") || "—"}
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">
                        {lead.created_at
                          ? new Date(lead.created_at).toLocaleDateString()
                          : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEdit(lead)}
                            title="Edit"
                          >
                            <Icon name="Edit" size={15} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(lead.id)}
                            title="Delete"
                          >
                            <Icon name="Trash2" size={15} className="text-destructive" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
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
