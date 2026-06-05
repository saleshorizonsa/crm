import React, { useState, useEffect, useRef } from "react";
import Icon from "../../../components/AppIcon";
import { logoService } from "../../../services/supabaseService";
import { supabase } from "../../../lib/supabase";

const CompanyLogoManager = () => {
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading]     = useState(false);
  const [uploading, setUploading] = useState({}); // { companyId: bool }
  const [savingBrand, setSavingBrand] = useState({});
  const [errors, setErrors]   = useState({});
  const [success, setSuccess] = useState({});
  const fileRefs = useRef({});

  useEffect(() => {
    loadCompanies();
  }, []);

  async function loadCompanies() {
    setLoading(true);
    const { data } = await supabase
      .from("companies")
      .select("id, name, logo_url, primary_color, tagline")
      .order("name");
    setCompanies(data || []);
    setLoading(false);
  }

  function flashSuccess(companyId, msg) {
    setSuccess((p) => ({ ...p, [companyId]: msg }));
    setTimeout(() => setSuccess((p) => ({ ...p, [companyId]: "" })), 3000);
  }

  async function handleLogoUpload(companyId, file) {
    if (!file) return;
    setUploading((p) => ({ ...p, [companyId]: true }));
    setErrors((p) => ({ ...p, [companyId]: "" }));

    const { data, error } = await logoService.uploadCompanyLogo(companyId, file);
    setUploading((p) => ({ ...p, [companyId]: false }));

    if (error) {
      setErrors((p) => ({ ...p, [companyId]: error.message }));
      return;
    }

    setCompanies((prev) =>
      prev.map((c) => (c.id === companyId ? { ...c, logo_url: data.logo_url } : c))
    );
    flashSuccess(companyId, "Logo uploaded");
  }

  async function handleRemoveLogo(companyId) {
    if (!confirm("Remove this company's logo?")) return;
    setUploading((p) => ({ ...p, [companyId]: true }));
    const { error } = await logoService.removeCompanyLogo(companyId);
    setUploading((p) => ({ ...p, [companyId]: false }));
    if (error) {
      setErrors((p) => ({ ...p, [companyId]: error.message }));
      return;
    }
    setCompanies((prev) =>
      prev.map((c) => (c.id === companyId ? { ...c, logo_url: null } : c))
    );
    flashSuccess(companyId, "Logo removed");
  }

  function updateField(companyId, field, value) {
    setCompanies((prev) =>
      prev.map((c) => (c.id === companyId ? { ...c, [field]: value } : c))
    );
  }

  async function handleSaveBranding(company) {
    setSavingBrand((p) => ({ ...p, [company.id]: true }));
    setErrors((p) => ({ ...p, [company.id]: "" }));
    const { error } = await logoService.updateCompanyBranding({
      companyId:    company.id,
      primaryColor: company.primary_color || "#2563EB",
      tagline:      company.tagline || "",
    });
    setSavingBrand((p) => ({ ...p, [company.id]: false }));
    if (error) {
      setErrors((p) => ({ ...p, [company.id]: error.message }));
      return;
    }
    flashSuccess(company.id, "Branding saved");
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Company Logos &amp; Branding</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Upload a logo for each company. Logos appear on the login page and in the header.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {companies.map((company) => (
          <div
            key={company.id}
            className="bg-white border border-gray-200 rounded-xl p-5 space-y-4"
          >
            {/* Header row */}
            <div className="flex items-center gap-4">
              {/* Logo preview */}
              <div
                className="w-16 h-16 rounded-xl border border-gray-200 flex items-center justify-center overflow-hidden flex-shrink-0 bg-gray-50"
                style={{ backgroundColor: `${company.primary_color || "#2563EB"}10` }}
              >
                {company.logo_url ? (
                  <img
                    src={company.logo_url}
                    alt={company.name}
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <Icon name="Building2" size={26} className="text-gray-300" />
                )}
              </div>
              <div className="min-w-0">
                <h3 className="text-base font-semibold text-gray-900 truncate">
                  {company.name}
                </h3>
                <p className="text-xs text-gray-400">
                  {company.logo_url ? "Custom logo set" : "No logo — using default icon"}
                </p>
              </div>
            </div>

            {/* Upload buttons */}
            <div className="flex items-center gap-2 flex-wrap">
              <input
                ref={(el) => (fileRefs.current[company.id] = el)}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files[0]) handleLogoUpload(company.id, e.target.files[0]);
                  e.target.value = "";
                }}
              />
              <button
                type="button"
                onClick={() => fileRefs.current[company.id]?.click()}
                disabled={uploading[company.id]}
                className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 font-medium disabled:opacity-50"
              >
                {uploading[company.id] ? (
                  <Icon name="Loader2" size={14} className="animate-spin" />
                ) : (
                  <Icon name="Upload" size={14} />
                )}
                {company.logo_url ? "Replace Logo" : "Upload Logo"}
              </button>
              {company.logo_url && (
                <button
                  type="button"
                  onClick={() => handleRemoveLogo(company.id)}
                  disabled={uploading[company.id]}
                  className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg border border-red-200 text-red-600 hover:bg-red-50 font-medium disabled:opacity-50"
                >
                  <Icon name="Trash2" size={14} />
                  Remove
                </button>
              )}
            </div>
            <p className="text-xs text-gray-400">PNG, JPG, WebP, or SVG · max 2MB</p>

            {/* Branding fields */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">
                  Primary Color
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={company.primary_color || "#2563EB"}
                    onChange={(e) => updateField(company.id, "primary_color", e.target.value)}
                    className="w-9 h-9 rounded border border-gray-200 cursor-pointer p-0.5"
                  />
                  <input
                    type="text"
                    value={company.primary_color || "#2563EB"}
                    onChange={(e) => updateField(company.id, "primary_color", e.target.value)}
                    className="flex-1 text-sm border border-gray-200 rounded-lg px-2 py-1.5 font-mono focus:outline-none focus:border-blue-400"
                  />
                </div>
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs font-medium text-gray-600 block mb-1">
                  Tagline
                </label>
                <input
                  type="text"
                  value={company.tagline || ""}
                  onChange={(e) => updateField(company.id, "tagline", e.target.value)}
                  placeholder="e.g. Strength in Steel"
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-blue-400"
                />
              </div>
            </div>

            {/* Save branding + feedback */}
            <div className="flex items-center justify-between pt-1">
              <div className="text-xs">
                {errors[company.id] && (
                  <span className="text-red-600">{errors[company.id]}</span>
                )}
                {success[company.id] && (
                  <span className="text-green-600 flex items-center gap-1">
                    <Icon name="CheckCircle" size={13} /> {success[company.id]}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => handleSaveBranding(company)}
                disabled={savingBrand[company.id]}
                className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 font-medium disabled:opacity-50"
              >
                {savingBrand[company.id] ? (
                  <Icon name="Loader2" size={13} className="animate-spin" />
                ) : (
                  <Icon name="Save" size={13} />
                )}
                Save Branding
              </button>
            </div>
          </div>
        ))}
      </div>

      {companies.length === 0 && (
        <div className="text-center py-12 text-gray-400 text-sm">No companies found.</div>
      )}
    </div>
  );
};

export default CompanyLogoManager;
