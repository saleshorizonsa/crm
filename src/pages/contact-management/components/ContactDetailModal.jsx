import React, { useState, useEffect } from "react";
import Icon from "../../../components/AppIcon";
import Button from "../../../components/ui/Button";
import Input from "../../../components/ui/Input";
import { contactService } from "../../../services/supabaseService";

const ContactDetailModal = ({ contact, onSave, onClose, onDelete, isOpen }) => {
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

  const handleSubmit = (e) => {
    e.preventDefault();

    const dataToSave = {
      ...formData,
    };

    if (contact?.id) {
      dataToSave.id = contact.id;
    }

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
                {contact ? "Edit Client" : "New Client"}
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
                    First Name <span className="text-destructive">*</span>
                  </label>
                  <Input
                    name="first_name"
                    value={formData.first_name}
                    onChange={handleChange}
                    required
                    placeholder="John"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-card-foreground mb-2">
                    Last Name <span className="text-destructive">*</span>
                  </label>
                  <Input
                    name="last_name"
                    value={formData.last_name}
                    onChange={handleChange}
                    required
                    placeholder="Doe"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-card-foreground mb-2">
                    Email <span className="text-destructive">*</span>
                  </label>
                  <Input
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    required
                    placeholder="john.doe@example.com"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-card-foreground mb-2">
                    Phone
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
                    Job Title
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
                    Company
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
                    Status
                  </label>
                  <select
                    name="status"
                    value={formData.status}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
              </div>
            </div>

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
                    Delete
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
                  Cancel
                </Button>
                <Button variant="primary" type="submit" disabled={isDeleting}>
                  <Icon name="Save" size={16} className="mr-2" />
                  {contact ? "Update Client" : "Create Client"}
                </Button>
              </div>
            </div>
          </form>

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
                      ? "Cannot Delete Client"
                      : "Delete Client"}
                  </h3>
                </div>

                {deleteReferences?.totalReferences > 0 ? (
                  <div className="mb-4">
                    <p className="text-sm text-destructive font-medium mb-3">
                      This client cannot be deleted because it has the following
                      references:
                    </p>
                    <ul className="space-y-2 text-sm">
                      {deleteReferences.references.deals > 0 && (
                        <li className="flex items-center text-amber-600">
                          <Icon name="Briefcase" size={16} className="mr-2" />
                          {deleteReferences.references.deals} deal(s) linked to
                          this client
                        </li>
                      )}
                      {deleteReferences.references.activities > 0 && (
                        <li className="flex items-center text-amber-600">
                          <Icon name="Activity" size={16} className="mr-2" />
                          {deleteReferences.references.activities} activity(ies)
                          associated
                        </li>
                      )}
                      {deleteReferences.references.tasks > 0 && (
                        <li className="flex items-center text-amber-600">
                          <Icon name="CheckSquare" size={16} className="mr-2" />
                          {deleteReferences.references.tasks} task(s) linked to
                          this client
                        </li>
                      )}
                      {deleteReferences.references.contact_tags > 0 && (
                        <li className="flex items-center text-amber-600">
                          <Icon name="Tag" size={16} className="mr-2" />
                          {deleteReferences.references.contact_tags} tag(s)
                          associated
                        </li>
                      )}
                    </ul>
                    <p className="text-sm text-muted-foreground mt-3">
                      Please remove or reassign all related records before
                      deleting this client.
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground mb-4">
                    Are you sure you want to delete this client? This action
                    cannot be undone.
                  </p>
                )}

                <div className="flex justify-end space-x-3">
                  <Button
                    variant="ghost"
                    onClick={() => setShowDeleteConfirm(false)}
                    disabled={isDeleting}
                  >
                    {deleteReferences?.totalReferences > 0 ? "Close" : "Cancel"}
                  </Button>
                  {deleteReferences?.totalReferences === 0 && (
                    <Button
                      variant="destructive"
                      onClick={handleDeleteConfirm}
                      loading={isDeleting}
                    >
                      {isDeleting ? "Deleting..." : "Delete Client"}
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
