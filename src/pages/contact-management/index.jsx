import React, { useState, useEffect, useMemo } from "react";
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

const ContactManagement = () => {
  const { company, user } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [contacts, setContacts] = useState([]);
  const [stats, setStats] = useState(null);
  const [selectedContact, setSelectedContact] = useState(null);
  const [showContactModal, setShowContactModal] = useState(false);
  const [selectedRows, setSelectedRows] = useState([]);
  const [filters, setFilters] = useState({
    search: "",
    status: "",
    tags: [],
    owner: "",
    sort: "",
  });
  const loadingRef = React.useRef(false);

  useEffect(() => {
    if (user?.id) {
      loadContacts();
      loadStats();
    }
  }, [user?.id]); // Depend on user ID instead of company

  const loadContacts = async () => {
    // Prevent concurrent loads
    if (loadingRef.current) return;

    loadingRef.current = true;
    setIsLoading(true);
    try {
      const { data, error } = await contactService.getContacts(
        company.id,
        filters
      );
      if (error) throw error;
      setContacts(data || []);
    } catch (error) {
      console.error("Error loading contacts:", error);
    } finally {
      setIsLoading(false);
      loadingRef.current = false;
    }
  };

  const loadStats = async () => {
    try {
      const { data, error } = await contactService.getContactStats(company.id);
      console.log(data);
      if (error) throw error;
      setStats(data);
    } catch (error) {
      console.error("Error loading contact stats:", error);
    }
  };

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
          title: `Contact updated: ${data.first_name} ${data.last_name}`,
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
          title: `New contact created: ${data.first_name} ${data.last_name}`,
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
      alert(`Failed to save contact: ${error.message}`);
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
        `Are you sure you want to delete ${contactIds.length} contact(s)?`
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
      alert(`Failed to delete contacts: ${error.message}`);
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
          contact.company_name?.toLowerCase().includes(searchLower)
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

    return filtered;
  }, [contacts, filters]);

  if (!user) {
    return <div>Loading...</div>;
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
                { label: "Clients", href: "/contact-management" },
              ]}
            />
            <h1 className="text-2xl font-semibold text-gray-900 mt-2">
              Client Management
            </h1>
          </div>

          <Button
            variant="primary"
            onClick={handleCreateContact}
            iconName="Plus"
            iconPosition="left"
          >
            Add Client
          </Button>
        </div>

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
              />
            )}
          </div>

          {/* Contact List */}
          <div className="hidden lg:block">
            <ContactTable
              contacts={filteredContacts}
              selectedRows={selectedRows}
              onSelectRows={setSelectedRows}
              onEdit={handleEditContact}
              isLoading={isLoading}
              sort={filters.sort}
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
      </main>

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
