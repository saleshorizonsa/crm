import React, { useState } from "react";
import { useAuth } from "../../../../contexts/AuthContext";
import Button from "../../../../components/ui/Button";
import Input from "../../../../components/ui/Input";
import Select from "../../../../components/ui/Select";

const ContactModal = ({ isOpen, onClose, onSubmit }) => {
  const { company, user } = useAuth();
  const [formData, setFormData] = useState({
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    company_name: "",
    title: "",
    type: "lead",
    status: "active",
  });

  const contactTypes = [
    { value: "lead", label: "Lead" },
    { value: "customer", label: "Customer" },
    { value: "partner", label: "Partner" },
    { value: "vendor", label: "Vendor" },
  ];

  const handleChange = (eOrValue, maybeName) => {
    if (eOrValue?.target) {
      const { name, value } = eOrValue.target;
      setFormData((prev) => ({ ...prev, [name]: value }));
    } else if (maybeName) {
      setFormData((prev) => ({ ...prev, [maybeName]: eOrValue }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await onSubmit({
        ...formData,
        company_id: company?.id,
        owner_id: user?.id,
      });
      onClose();
    } catch (error) {
      console.error("Error creating contact:", error);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-2xl rounded-2xl border border-border bg-card shadow-2xl overflow-hidden animate-in fade-in-50">
        {/* Header */}
        <div className="flex justify-between items-center px-6 py-4 border-b border-border bg-muted/30">
          <h2 className="text-lg font-semibold text-foreground">
            Add New Contact
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition"
          >
            ✕
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-6 py-6 space-y-6">
          {/* Name Fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-muted-foreground">
                First Name
              </label>
              <Input
                name="first_name"
                value={formData.first_name}
                onChange={handleChange}
                placeholder="e.g. John"
                required
                className="mt-1"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-muted-foreground">
                Last Name
              </label>
              <Input
                name="last_name"
                value={formData.last_name}
                onChange={handleChange}
                placeholder="e.g. Doe"
                required
                className="mt-1"
              />
            </div>
          </div>

          {/* Email & Phone */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-muted-foreground">
                Email
              </label>
              <Input
                name="email"
                type="email"
                value={formData.email}
                onChange={handleChange}
                placeholder="e.g. john.doe@email.com"
                required
                className="mt-1"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-muted-foreground">
                Phone
              </label>
              <Input
                name="phone"
                value={formData.phone}
                onChange={handleChange}
                placeholder="e.g. +1 555 123 4567"
                className="mt-1"
              />
            </div>
          </div>

          {/* Company & Title */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-muted-foreground">
                Company
              </label>
              <Input
                name="company_name"
                value={formData.company_name}
                onChange={handleChange}
                placeholder="e.g. Acme Corp"
                className="mt-1"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-muted-foreground">
                Job Title
              </label>
              <Input
                name="title"
                value={formData.title}
                onChange={handleChange}
                placeholder="e.g. Sales Manager"
                className="mt-1"
              />
            </div>
          </div>

          {/* Type */}
          <div>
            <label className="text-sm font-medium text-muted-foreground">
              Contact Type
            </label>
            <Select
              name="type"
              value={formData.type}
              onChange={(value) => handleChange(value, "type")}
              options={contactTypes}
              required
              className="mt-1"
            />
          </div>

          {/* Buttons */}
          <div className="flex justify-end gap-3 pt-4 border-t border-border">
            <Button
              variant="outline"
              type="button"
              onClick={onClose}
              className="min-w-[100px]"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="min-w-[120px] bg-primary text-primary-foreground hover:bg-primary/90"
            >
              Add Contact
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ContactModal;
