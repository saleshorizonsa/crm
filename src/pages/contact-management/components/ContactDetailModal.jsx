import React, { useState, useEffect } from "react";
import Icon from "../../../components/AppIcon";
import Button from "../../../components/ui/Button";
import Input from "../../../components/ui/Input";
import { contactService, activityService } from "../../../services/supabaseService";
import { useLanguage } from "../../../i18n";
import LogActivityModal from "../../../components/LogActivityModal";
import ActivityTimeline from "../../../components/ActivityTimeline";

const ContactDetailModal = ({ contact, onSave, onClose, onDelete, isOpen }) => {
  const { t } = useLanguage();
  const [formData, setFormData] = useState({
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    job_title: "",
    company_name: "",
    status: "active",
  });
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteReferences, setDeleteReferences] = useState(null);
  const [validationErrors, setValidationErrors] = useState({});
  const [contactActivities,        setContactActivities]        = useState([]);
  const [contactActivitiesLoading, setContactActivitiesLoading] = useState(false);
  const [showLogActivityModal,     setShowLogActivityModal]     = useState(false);
  const [showActivitySection,      setShowActivitySection]      = useState(false);

  useEffect(() => {
    if (contact) {
      setFormData({
        first_name: contact.first_name || "",
        last_name: contact.last_name || "",
        email: contact.email || "",
        phone: contact.phone || "",
        job_title: contact.job_title || "",
        company_name: contact.company_name || "",
        status: contact.status || "active",
      });
    }
    // Reset delete state when modal opens
    setShowDeleteConfirm(false);
    setDeleteReferences(null);
  }, [contact, isOpen]);

  async function loadContactActivities() {
    if (!contact?.id) return;
    setContactActivitiesLoading(true);
    const { data } = await activityService.getActivitiesForContact(contact.id);
    setContactActivities(data || []);
    setContactActivitiesLoading(false);
  }

  useEffect(() => {
    if (contact?.id && showActivitySection) loadContactActivities();
  }, [contact?.id, showActivitySection]); // eslint-disable-line

  const handleSubmit = (e) => {
    e.preventDefault();

    const errs = {};
    if (!formData.first_name?.trim()) errs.first_name = t("contacts.firstNameRequired");
    if (!formData.last_name?.trim())  errs.last_name  = t("contacts.lastNameRequired");
    if (!formData.email?.trim())      errs.email      = t("contacts.emailRequired");
    if (Object.keys(errs).length > 0) { setValidationErrors(errs); return; }
    setValidationErrors({});

    const dataToSave = { ...formData };
    if (contact?.id) dataToSave.id = contact.id;
    onSave(dataToSave);
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  // Handle delete button click - check for references first
  const handleDeleteClick = async () => {
    if (!contact?.id) return;

    try {
      const { data, error } = await contactService.checkContactReferences(
        contact.id
      );
      if (error) throw error;

      setDeleteReferences(data);
      setShowDeleteConfirm(true);
    } catch (error) {
      console.error("Error checking contact references:", error);
      alert("Failed to check client references: " + error.message);
    }
  };

  // Handle delete confirmation - only allow if no references
  const handleDeleteConfirm = async () => {
    if (!contact?.id) return;

    // Prevent deletion if there are references
    if (deleteReferences?.totalReferences > 0) {
      alert(
        "Cannot delete client with existing references. Please remove all related deals, tasks, and activities first."
      );
      return;
    }

    setIsDeleting(true);
    try {
      const { error } = await contactService.deleteContact(contact.id);

      if (error) throw error;

      // Call onDelete callback if provided
      if (onDelete) {
        onDelete(contact.id);
      }

      setShowDeleteConfirm(false);
      onClose();
    } catch (error) {
      console.error("Error deleting contact:", error);
      alert("Failed to delete client: " + error.message);
    } finally {
      setIsDeleting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-500 overflow-y-auto" onClick={onClose}>
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
        <div className="fixed inset-0 transition-opacity bg-background/80 backdrop-blur-sm"></div>

        <div
          className="inline-block w-full max-w-2xl my-8 overflow-hidden text-left align-middle transition-all transform bg-card border border-border rounded-lg shadow-enterprise-lg"
          onClick={(e) => e.stopPropagation()}
        >
          <form onSubmit={handleSubmit}>
            <div className="flex items-center justify-between p-6 border-b border-border">
              <h2 className="text-xl font-semibold text-card-foreground">
                {contact ? t("contacts.editClient") : t("contacts.newClient")}
              </h2>
              <Button
                variant="ghost"
                size="icon"
                onClick={onClose}
                type="button"
              >
                <Icon name="X" size={20} />
              </Button>
            </div>

            <div className="p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-card-foreground mb-2">
                    {t("contacts.firstName")} <span className="text-destructive">*</span>
                  </label>
                  <Input
                    name="first_name"
                    value={formData.first_name}
                    onChange={handleChange}
                    placeholder="John"
                    className={validationErrors.first_name ? "border-destructive" : ""}
                  />
                  {validationErrors.first_name && (
                    <p className="text-xs text-destructive mt-1">{validationErrors.first_name}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-card-foreground mb-2">
                    {t("contacts.lastName")} <span className="text-destructive">*</span>
                  </label>
                  <Input
                    name="last_name"
                    value={formData.last_name}
                    onChange={handleChange}
                    placeholder="Doe"
                    className={validationErrors.last_name ? "border-destructive" : ""}
                  />
                  {validationErrors.last_name && (
                    <p className="text-xs text-destructive mt-1">{validationErrors.last_name}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-card-foreground mb-2">
                    {t("common.email")} <span className="text-destructive">*</span>
                  </label>
                  <Input
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    placeholder="john.doe@example.com"
                    className={validationErrors.email ? "border-destructive" : ""}
                  />
                  {validationErrors.email && (
                    <p className="text-xs text-destructive mt-1">{validationErrors.email}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-card-foreground mb-2">
                    {t("common.phone")}
                  </label>
                  <Input
                    type="tel"
                    name="phone"
                    value={formData.phone}
                    onChange={handleChange}
                    placeholder="+1 (555) 123-4567"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-card-foreground mb-2">
                    {t("contacts.jobTitle")}
                  </label>
                  <Input
                    name="job_title"
                    value={formData.job_title}
                    onChange={handleChange}
                    placeholder="Sales Manager"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-card-foreground mb-2">
                    {t("common.company")}
                  </label>
                  <Input
                    name="company_name"
                    value={formData.company_name}
                    onChange={handleChange}
                    placeholder="Acme Corp"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-card-foreground mb-2">
                    {t("common.status")}
                  </label>
                  <select
                    name="status"
                    value={formData.status}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="active">{t("common.active")}</option>
                    <option value="inactive">{t("common.inactive")}</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Activity History — only shown when editing an existing contact */}
            {contact?.id && (
              <div className="px-6 pb-4">
                <div className="border border-border rounded-xl overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setShowActivitySection(v => !v)}
                    className="w-full flex items-center justify-between px-4 py-3 bg-muted/30 hover:bg-muted/50 transition-colors text-left"
                  >
                    <div className="flex items-center gap-2">
                      <Icon name="Activity" size={14} className="text-blue-600" />
                      <span className="text-sm font-medium text-card-foreground">Activity History</span>
                      {contactActivities.length > 0 && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 font-medium">
                          {contactActivities.length}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={e => { e.stopPropagation(); setShowLogActivityModal(true); }}
                        className="text-xs px-2.5 py-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium flex items-center gap-1"
                      >
                        <Icon name="Plus" size={11} /> Log
                      </button>
                      <Icon name={showActivitySection ? 'ChevronUp' : 'ChevronDown'} size={13} className="text-muted-foreground" />
                    </div>
                  </button>
                  {showActivitySection && (
                    <div className="p-4 bg-white">
                      <ActivityTimeline
                        activities={contactActivities}
                        loading={contactActivitiesLoading}
                        showContact={false}
                        onDelete={async (id) => {
                          await activityService.deleteActivity(id);
                          loadContactActivities();
                        }}
                      />
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="flex justify-between items-center p-6 border-t border-border">
              <div>
                {contact && (
                  <Button
                    variant="ghost"
                    onClick={handleDeleteClick}
                    type="button"
                    disabled={isDeleting}
                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                  >
                    <Icon name="Trash2" size={16} className="mr-2" />
                    {t("common.delete")}
                  </Button>
                )}
              </div>
              <div className="flex space-x-3">
                <Button
                  variant="outline"
                  onClick={onClose}
                  type="button"
                  disabled={isDeleting}
                >
                  {t("common.cancel")}
                </Button>
                <Button variant="primary" type="submit" disabled={isDeleting}>
                  <Icon name="Save" size={16} className="mr-2" />
                  {contact ? t("contacts.updateClient") : t("contacts.createClient")}
                </Button>
              </div>
            </div>
          </form>

          {/* Log Activity Modal */}
          <LogActivityModal
            isOpen={showLogActivityModal}
            onClose={() => setShowLogActivityModal(false)}
            onSaved={(newActivity) => {
              setContactActivities(prev => [newActivity, ...prev]);
              if (!showActivitySection) setShowActivitySection(true);
            }}
            dealId={null}
            contactId={contact?.id}
            contactName={contact ? `${contact.first_name} ${contact.last_name}${contact.company_name ? ' — ' + contact.company_name : ''}` : ''}
          />

          {/* Delete Confirmation Modal */}
          {showDeleteConfirm && (
            <div className="absolute inset-0 bg-background/80 backdrop-blur-sm z-10 flex items-center justify-center p-4">
              <div className="bg-card border border-border rounded-lg shadow-enterprise-lg w-full max-w-md p-6">
                <div className="flex items-center space-x-3 mb-4">
                  <div className="w-10 h-10 bg-destructive/10 rounded-full flex items-center justify-center">
                    <Icon
                      name="AlertTriangle"
                      size={20}
                      className="text-destructive"
                    />
                  </div>
                  <h3 className="text-lg font-semibold text-card-foreground">
                    {deleteReferences?.totalReferences > 0
                      ? t("contacts.cannotDeleteClient")
                      : t("contacts.deleteClient")}
                  </h3>
                </div>

                {deleteReferences?.totalReferences > 0 ? (
                  <div className="mb-4">
                    <p className="text-sm text-destructive font-medium mb-3">
                      {t("contacts.clientHasReferences")}
                    </p>
                    <ul className="space-y-2 text-sm">
                      {deleteReferences.references.deals > 0 && (
                        <li className="flex items-center text-amber-600">
                          <Icon name="Briefcase" size={16} className="mr-2" />
                          {deleteReferences.references.deals} {t("contacts.dealsLinked")}
                        </li>
                      )}
                      {deleteReferences.references.activities > 0 && (
                        <li className="flex items-center text-amber-600">
                          <Icon name="Activity" size={16} className="mr-2" />
                          {deleteReferences.references.activities} {t("contacts.activitiesAssociated")}
                        </li>
                      )}
                      {deleteReferences.references.tasks > 0 && (
                        <li className="flex items-center text-amber-600">
                          <Icon name="CheckSquare" size={16} className="mr-2" />
                          {deleteReferences.references.tasks} {t("contacts.tasksLinked")}
                        </li>
                      )}
                      {deleteReferences.references.contact_tags > 0 && (
                        <li className="flex items-center text-amber-600">
                          <Icon name="Tag" size={16} className="mr-2" />
                          {deleteReferences.references.contact_tags} {t("contacts.tagsAssociated")}
                        </li>
                      )}
                    </ul>
                    <p className="text-sm text-muted-foreground mt-3">
                      {t("contacts.removeBeforeDeleting")}
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground mb-4">
                    {t("contacts.deleteClientConfirm")}
                  </p>
                )}

                <div className="flex justify-end space-x-3">
                  <Button
                    variant="ghost"
                    onClick={() => setShowDeleteConfirm(false)}
                    disabled={isDeleting}
                  >
                    {deleteReferences?.totalReferences > 0 ? t("common.close") : t("common.cancel")}
                  </Button>
                  {deleteReferences?.totalReferences === 0 && (
                    <Button
                      variant="destructive"
                      onClick={handleDeleteConfirm}
                      loading={isDeleting}
                    >
                      {isDeleting ? t("deals.deleting") : t("contacts.deleteClient")}
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ContactDetailModal;
