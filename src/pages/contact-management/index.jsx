import React, { useState, useEffect, useMemo } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import Icon from "../../components/AppIcon";
import Button from "../../components/ui/Button";
import NavigationBreadcrumbs from "../../components/ui/NavigationBreadcrumbs";
import Header from "../../components/ui/Header";
import ContactTable from "./components/ContactTable";
import ContactFilters from "./components/ContactFilters";
import ContactDetailModal from "./components/ContactDetailModal";
import BulkActionsBar from "./components/BulkActionsBar";
import ContactStats from "./components/ContactStats";
import ContactMobileView from "./components/ContactMobileView";
import { useAuth } from "../../contexts/AuthContext";
import { contactService, activityService } from "../../services/supabaseService";
import { useLanguage } from "../../i18n";
import { fetchAllRows } from "../../utils/fetchAllRows";
import {
  useStrategyEnabled, useCustomerStrategies, strategyOfId, canSetStrategy, customerCompanyId,
} from "utils/customerStrategy";
import { StrategyFilterChips, SetStrategyDialog } from "../../components/strategy/StrategyBadge";
import { StrategyChangesTab } from "../../components/strategy/StrategyPanels";

// Customer strategy (session 48): who sees the "Strategy changes" tab.
const STRATEGY_CHANGES_ROLES = ["manager", "director", "head", "admin"];

const DEFAULT_FILTERS = { search: "", status: "", tags: [], owner: "", sort: "" };

const ContactManagement = () => {
  const { company, user, userProfile } = useAuth();
  const { t } = useLanguage();
  const [isLoading, setIsLoading] = useState(true);
  const [contacts, setContacts] = useState([]);
  const [stats, setStats] = useState(null);
  const [selectedContact, setSelectedContact] = useState(null);
  const [showContactModal, setShowContactModal] = useState(false);
  const [selectedRows, setSelectedRows] = useState([]);
  const [filters, setFilters] = useState({ ...DEFAULT_FILTERS });
  // Tracks the company whose data is currently "active" so that a slower
  // in-flight response from a company the user has switched away from is
  // ignored instead of overwriting the current company's contacts.
  const activeCompanyRef = React.useRef(null);
  // Customer strategy (session 48). Nothing below shows until the feature is on.
  const strategyOn = useStrategyEnabled();
  const mayManage = strategyOn && canSetStrategy(userProfile?.role);
  const mayReviewChanges = strategyOn && STRATEGY_CHANGES_ROLES.includes(userProfile?.role);
  const [scope, setScope] = useState("mine");   // "mine" = today's list; "team" = every customer the user can see in this company
  const [tab, setTab] = useState("customers");
  const [strategyFilter, setStrategyFilter] = useState([]);
  const [bulkStrategy, setBulkStrategy] = useState(false);
  const { map: strategyMap, version: strategyVersion } = useCustomerStrategies(contacts.map((c) => c.id));

  // Reload whenever the authenticated user OR the active company changes.
  // The CompanySwitcher changes company?.id, so it MUST be in the deps —
  // otherwise the effect never re-runs and the previous company's contacts
  // stay on screen. (Previously the deps were [user?.id] only — the bug.)
  useEffect(() => {
    if (!user?.id || !company?.id) return;

    // Mark this company as the active one for the race guard below.
    activeCompanyRef.current = company.id;

    // Clear stale data, selections and filters immediately on switch so the
    // previous company's contacts are never shown while the new fetch runs.
    setContacts([]);
    setStats(null);
    setSelectedRows([]);
    setSelectedContact(null);
    setShowContactModal(false);
    setFilters({ ...DEFAULT_FILTERS });

    loadContacts(company.id, DEFAULT_FILTERS);
    loadStats(company.id);
    setScope("mine");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, company?.id]);

  // Team customers (managers and above, strategy on): every customer the
  // contacts policies let this user read whose company — its own, else its
  // owner's — is the active company. "Mine" reloads today's list.
  const firstScope = React.useRef(true);
  useEffect(() => {
    if (firstScope.current) { firstScope.current = false; return; }
    if (!company?.id) return;
    if (scope === "mine") { loadContacts(company.id); return; }
    const companyId = company.id;
    setIsLoading(true);
    fetchAllRows(() => supabase.from("contacts")
      .select("*, owner:users!owner_id(id, full_name, email, avatar_url, company_id)", { count: "exact" })
      .order("created_at", { ascending: false }))
      .then(({ data, error }) => {
        if (companyId !== activeCompanyRef.current) return;
        if (error) { console.error("Error loading team customers:", error); return; }
        setContacts((data || []).filter((c) => customerCompanyId(c) === companyId));
      })
      .finally(() => { if (companyId === activeCompanyRef.current) setIsLoading(false); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope]);

  const loadContacts = async (companyId = company?.id, activeFilters = filters) => {
    if (!companyId) return;
    setIsLoading(true);
    try {
      const { data, error } = await contactService.getContacts(
        companyId,
        activeFilters
      );
      // Ignore the response if the user has since switched companies.
      if (companyId !== activeCompanyRef.current) return;
      if (error) throw error;
      setContacts(data || []);
    } catch (error) {
      if (companyId === activeCompanyRef.current) {
        console.error("Error loading contacts:", error);
      }
    } finally {
      if (companyId === activeCompanyRef.current) setIsLoading(false);
    }
  };

  const loadStats = async (companyId = company?.id) => {
    if (!companyId) return;
    try {
      const { data, error } = await contactService.getContactStats(companyId);
      // Ignore stats for a company the user has since switched away from.
      if (companyId !== activeCompanyRef.current) return;
      if (error) throw error;
      setStats(data);
    } catch (error) {
      if (companyId === activeCompanyRef.current) {
        console.error("Error loading contact stats:", error);
      }
    }
  };

  // OPEN ONE CUSTOMER FROM A LINK (session 34): the Insights Visits panel and
  // the Sales Monitor send { openContactId } in the navigation state. Once the
  // list has loaded, that customer's record opens in the usual modal — from
  // the list if it is there, else read by id. Opened once per navigation.
  const location = useLocation();
  const openedFromLink = React.useRef(null);
  useEffect(() => {
    const id = location.state?.openContactId;
    if (!id || isLoading || openedFromLink.current === location.key) return;
    openedFromLink.current = location.key;
    const inList = contacts.find((c) => c.id === id);
    if (inList) { handleEditContact(inList); return; }
    supabase.from("contacts").select("*").eq("id", id).maybeSingle()
      .then(({ data }) => { if (data) handleEditContact(data); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key, location.state, isLoading, contacts]);

  const handleCreateContact = () => {
    setSelectedContact(null);
    setShowContactModal(true);
  };

  const handleEditContact = (contact) => {
    setSelectedContact(contact);
    setShowContactModal(true);
  };

  const handleContactSave = async (contactData) => {
    try {
      const dataToSave = {
        ...contactData,
        owner_id: user.id, // Use authenticated user as owner
      };

      const { data, error } = await contactService.upsertContact(dataToSave);

      if (error) throw error;

      if (selectedContact) {
        // Update existing contact in list
        setContacts(contacts.map((c) => (c.id === data.id ? data : c)));
        
        // Log activity for contact update
        await activityService.createActivity({
          type: 'email',
          title: `Customer updated: ${data.first_name} ${data.last_name}`,
          description: `${data.company_name || 'No company'} - ${data.email || 'No email'}`,
          company_id: company?.id,
          contact_id: data.id,
          owner_id: user.id,
        });
      } else {
        // Add new contact to list
        setContacts([data, ...contacts]);
        
        // Log activity for new contact
        await activityService.createActivity({
          type: 'email',
          title: `New customer created: ${data.first_name} ${data.last_name}`,
          description: `${data.company_name || 'No company'} - ${data.email || 'No email'}`,
          company_id: company?.id,
          contact_id: data.id,
          owner_id: user.id,
        });
      }

      setShowContactModal(false);
      setSelectedContact(null);
      loadStats();
    } catch (error) {
      console.error("Error saving contact:", error);
      alert(`Failed to save customer: ${error.message}`);
    }
  };

  // Handle contact deletion from modal
  const handleContactDelete = (contactId) => {
    setContacts(contacts.filter((c) => c.id !== contactId));
    setShowContactModal(false);
    setSelectedContact(null);
    loadStats();
  };

  const handleDeleteContacts = async (contactIds) => {
    if (
      !window.confirm(
        `${t("contacts.deleteContactsConfirm")} ${contactIds.length} ${t("contacts.contacts_plural")}`
      )
    ) {
      return;
    }

    try {
      const { error } = await contactService.deleteContacts(contactIds);
      if (error) throw error;

      setContacts(contacts.filter((c) => !contactIds.includes(c.id)));
      setSelectedRows([]);
      loadStats();
    } catch (error) {
      console.error("Error deleting contacts:", error);
      alert(`Failed to delete customers: ${error.message}`);
    }
  };

  const filteredContacts = useMemo(() => {
    let filtered = [...contacts];

    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      filtered = filtered.filter(
        (contact) =>
          contact.first_name?.toLowerCase().includes(searchLower) ||
          contact.last_name?.toLowerCase().includes(searchLower) ||
          contact.email?.toLowerCase().includes(searchLower) ||
          contact.company_name?.toLowerCase().includes(searchLower) ||
          contact.phone?.toLowerCase().includes(searchLower) ||
          contact.mobile?.toLowerCase().includes(searchLower)
      );
    }

    if (filters.status) {
      filtered = filtered.filter(
        (contact) => contact.status === filters.status
      );
    }

    if (filters.owner) {
      filtered = filtered.filter(
        (contact) => contact.owner_id === filters.owner
      );
    }

    if (strategyOn && strategyFilter.length) {
      const wanted = new Set(strategyFilter);
      filtered = filtered.filter((contact) => wanted.has(strategyOfId(strategyMap, contact.id)));
    }

    return filtered;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contacts, filters, strategyOn, strategyFilter, strategyVersion]);

  // Defence-in-depth: viewer must not reach contact management
  if (userProfile?.role === "viewer") {
    return <Navigate to="/pipeline-view" replace />;
  }

  if (!user) {
    return <div>{t("common.loading")}</div>;
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
                { label: t("nav.clients"), href: "/contact-management" },
              ]}
            />
            <h1 className="text-2xl font-semibold text-gray-900 mt-2">
              {t("nav.clients")}
            </h1>
          </div>

          <Button
            variant="primary"
            onClick={handleCreateContact}
            iconName="Plus"
            iconPosition="left"
          >
            {t("contacts.addClient")}
          </Button>
        </div>

        {(mayManage || mayReviewChanges) && (
          <div className="mb-4 flex flex-wrap items-center gap-3" data-testid="customers-strategy-bar">
            {mayReviewChanges && (
              <div className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5" role="tablist">
                {[["customers", t("strategy.customers")], ["changes", t("strategy.changes")]].map(([id, label]) => (
                  <button key={id} type="button" role="tab" aria-selected={tab === id} data-testid={`customers-tab-${id}`}
                    onClick={() => setTab(id)}
                    className={`px-3 py-1.5 text-sm rounded-md ${tab === id ? "bg-blue-600 text-white" : "text-gray-600 hover:bg-gray-50"}`}>{label}</button>
                ))}
              </div>
            )}
            {mayManage && tab === "customers" && (
              <div className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5">
                {[["mine", t("strategy.mine")], ["team", t("strategy.team")]].map(([id, label]) => (
                  <button key={id} type="button" aria-pressed={scope === id} data-testid={`customers-scope-${id}`}
                    onClick={() => setScope(id)}
                    className={`px-3 py-1.5 text-sm rounded-md ${scope === id ? "bg-gray-800 text-white" : "text-gray-600 hover:bg-gray-50"}`}>{label}</button>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "changes" && mayReviewChanges ? (
          <StrategyChangesTab />
        ) : (
        <div className="space-y-6">
          {/* Contact Stats */}
          <ContactStats stats={stats} />

          {/* Filters and Actions */}
          <div className="flex flex-col lg:flex-row gap-4">
            <div className="flex-grow">
              <ContactFilters filters={filters} onFilterChange={setFilters} />
            </div>
            {selectedRows.length > 0 && (
              <BulkActionsBar
                selectedCount={selectedRows.length}
                onDelete={() => handleDeleteContacts(selectedRows)}
                onSetStrategy={mayManage ? () => setBulkStrategy(true) : undefined}
              />
            )}
          </div>

          {strategyOn && (
            <StrategyFilterChips value={strategyFilter} onChange={setStrategyFilter} />
          )}

          {/* Contact List */}
          <div className="hidden lg:block">
            <ContactTable
              contacts={filteredContacts}
              selectedRows={selectedRows}
              onSelectRows={setSelectedRows}
              onEdit={handleEditContact}
              isLoading={isLoading}
              sort={filters.sort}
              strategyOn={strategyOn}
            />
          </div>
          <div className="lg:hidden">
            <ContactMobileView
              contacts={filteredContacts}
              onEdit={handleEditContact}
              isLoading={isLoading}
            />
          </div>
        </div>
        )}
      </main>

      {bulkStrategy && (
        <SetStrategyDialog
          contactIds={selectedRows}
          onClose={() => setBulkStrategy(false)}
          onSaved={() => {}}
        />
      )}

      {/* Contact Modal */}
      <ContactDetailModal
        contact={selectedContact}
        isOpen={showContactModal}
        onSave={handleContactSave}
        onDelete={handleContactDelete}
        onClose={() => setShowContactModal(false)}
      />
    </div>
  );
};

export default ContactManagement;
