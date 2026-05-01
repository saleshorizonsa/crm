import React, { useState, useEffect } from "react";
import Icon from "../../../components/AppIcon";
import Button from "../../../components/ui/Button";
import Input from "../../../components/ui/Input";

const LEAD_STAGES = [
  { value: "new",       label: "New"           },
  { value: "contacted", label: "Contacted"      },
  { value: "qualified", label: "Qualified"      },
  { value: "proposal",  label: "Proposal Sent"  },
];

const LEAD_SOURCES = [
  { value: "",               label: "Select source…" },
  { value: "website",        label: "Website"         },
  { value: "referral",       label: "Referral"        },
  { value: "cold_call",      label: "Cold Call"       },
  { value: "social_media",   label: "Social Media"    },
  { value: "email_campaign", label: "Email Campaign"  },
  { value: "event",          label: "Event"           },
  { value: "other",          label: "Other"           },
];

const EMPTY = {
  first_name:   "",
  last_name:    "",
  email:        "",
  phone:        "",
  company_name: "",
  job_title:    "",
  lead_source:  "",
  lead_status:  "new",
};

const LeadFormModal = ({ lead, isOpen, onSave, onClose }) => {
  const [form, setForm] = useState(EMPTY);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (lead) {
      setForm({
        first_name:   lead.first_name   || "",
        last_name:    lead.last_name    || "",
        email:        lead.email        || "",
        phone:        lead.phone        || "",
        company_name: lead.company_name || "",
        job_title:    lead.job_title    || "",
        lead_source:  lead.lead_source  || "",
        lead_status:  lead.lead_status  || "new",
      });
    } else {
      setForm(EMPTY);
    }
  }, [lead, isOpen]);

  if (!isOpen) return null;

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.first_name.trim() || !form.last_name.trim()) return;
    setIsSaving(true);
    try {
      const data = { ...form };
      if (lead?.id) data.id = lead.id;
      await onSave(data);
    } finally {
      setIsSaving(false);
    }
  };

  const selectClass =
    "w-full px-3 py-2 border border-border rounded-md bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">
            {lead ? "Edit Lead" : "Add New Lead"}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 rounded-md p-1">
            <Icon name="X" size={18} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {/* Name row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                First Name <span className="text-red-500">*</span>
              </label>
              <Input
                name="first_name"
                value={form.first_name}
                onChange={handleChange}
                placeholder="John"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Last Name <span className="text-red-500">*</span>
              </label>
              <Input
                name="last_name"
                value={form.last_name}
                onChange={handleChange}
                placeholder="Smith"
                required
              />
            </div>
          </div>

          {/* Email + Phone */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Email</label>
              <Input
                name="email"
                type="email"
                value={form.email}
                onChange={handleChange}
                placeholder="john@example.com"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Phone</label>
              <Input
                name="phone"
                value={form.phone}
                onChange={handleChange}
                placeholder="+1 555 000 0000"
              />
            </div>
          </div>

          {/* Company + Job title */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Company</label>
              <Input
                name="company_name"
                value={form.company_name}
                onChange={handleChange}
                placeholder="Acme Corp"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Job Title</label>
              <Input
                name="job_title"
                value={form.job_title}
                onChange={handleChange}
                placeholder="CEO"
              />
            </div>
          </div>

          {/* Lead Source + Stage */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Lead Source</label>
              <select name="lead_source" value={form.lead_source} onChange={handleChange} className={selectClass}>
                {LEAD_SOURCES.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Stage</label>
              <select name="lead_status" value={form.lead_status} onChange={handleChange} className={selectClass}>
                {LEAD_STAGES.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
            <Button variant="outline" type="button" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" disabled={isSaving}>
              {isSaving ? (
                <><Icon name="Loader2" size={14} className="mr-1 animate-spin" />Saving…</>
              ) : (
                lead ? "Save Changes" : "Add Lead"
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default LeadFormModal;
