import React, { useState, useEffect } from "react";
import Button from "../../../components/ui/Button";
import Input from "../../../components/ui/Input";
import { useLanguage } from "../../../i18n";

const GeneralSettings = ({ settings, onSave, isSaving }) => {
  const { t, language: currentLanguage, changeLanguage } = useLanguage();
  const [formData, setFormData] = useState({
    timezone: "",
    language: currentLanguage || "en",
    date_format: "",
  });

  useEffect(() => {
    if (settings) {
      setFormData({
        timezone: settings.timezone || "UTC",
        language: currentLanguage || "en",
        date_format: settings.date_format || "MM/DD/YYYY",
      });
    }
  }, [settings]);

  // Sync formData.language when currentLanguage changes (e.g., from localStorage)
  useEffect(() => {
    setFormData((prev) => ({ ...prev, language: currentLanguage || "en" }));
  }, [currentLanguage]);

  const handleChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));

    // If language is changed, update the app language immediately
    if (field === "language") {
      changeLanguage(value);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(formData);
  };

  const timezones = [
    { value: "UTC", label: "UTC (Coordinated Universal Time)" },
    { value: "America/New_York", label: "Eastern Time (ET)" },
    { value: "America/Chicago", label: "Central Time (CT)" },
    { value: "America/Denver", label: "Mountain Time (MT)" },
    { value: "America/Los_Angeles", label: "Pacific Time (PT)" },
    { value: "Europe/London", label: "London (GMT)" },
    { value: "Europe/Paris", label: "Paris (CET)" },
    { value: "Asia/Tokyo", label: "Tokyo (JST)" },
    { value: "Asia/Dubai", label: "Dubai (GST)" },
    { value: "Asia/Kolkata", label: "India (IST)" },
  ];

  const languages = [
    { value: "en", label: "English" },
    { value: "ar", label: "العربية (Arabic)" },
  ];

  const dateFormats = [
    { value: "MM/DD/YYYY", label: "MM/DD/YYYY (12/31/2025)" },
    { value: "DD/MM/YYYY", label: "DD/MM/YYYY (31/12/2025)" },
    { value: "YYYY-MM-DD", label: "YYYY-MM-DD (2025-12-31)" },
    { value: "DD MMM YYYY", label: "DD MMM YYYY (31 Dec 2025)" },
  ];

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          {t("settings.generalSettings")}
        </h2>
        <p className="text-sm text-gray-600 mb-6">
          {t("settings.generalDescription")}
        </p>
      </div>

      {/* Timezone */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          {t("settings.timezone")}
        </label>
        <select
          value={formData.timezone}
          onChange={(e) => handleChange("timezone", e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {timezones.map((tz) => (
            <option key={tz.value} value={tz.value}>
              {tz.label}
            </option>
          ))}
        </select>
        <p className="text-xs text-gray-500 mt-1">
          {t("settings.timezoneNote")}
        </p>
      </div>

      {/* Language */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          {t("settings.language")}
        </label>
        <select
          value={formData.language}
          onChange={(e) => handleChange("language", e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {languages.map((lang) => (
            <option key={lang.value} value={lang.value}>
              {lang.label}
            </option>
          ))}
        </select>
        <p className="text-xs text-gray-500 mt-1">
          {t("settings.languageNote")}
        </p>
      </div>

      {/* Date Format */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          {t("settings.dateFormat")}
        </label>
        <select
          value={formData.date_format}
          onChange={(e) => handleChange("date_format", e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {dateFormats.map((format) => (
            <option key={format.value} value={format.value}>
              {format.label}
            </option>
          ))}
        </select>
        <p className="text-xs text-gray-500 mt-1">
          {t("settings.dateFormatNote")}
        </p>
      </div>

      {/* Save Button */}
      <div className="pt-4 border-t border-gray-200">
        <Button type="submit" disabled={isSaving}>
          {isSaving ? t("settings.saving") : t("settings.saveChanges")}
        </Button>
      </div>
    </form>
  );
};

export default GeneralSettings;
