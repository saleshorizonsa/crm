import React, { useState, useEffect } from "react";
import Button from "../../../components/ui/Button";
import { currencyService } from "../../../services/supabaseService";
import { useCurrency } from "../../../contexts/CurrencyContext";
import { useLanguage } from "../../../i18n";

const CurrencySettings = ({ settings, onSave, isSaving }) => {
  const { setPreferredCurrency } = useCurrency();
  const { t } = useLanguage();
  const [formData, setFormData] = useState({
    preferred_currency: "USD",
  });

  const [preview, setPreview] = useState({
    small: 0,
    medium: 0,
    large: 0,
  });

  useEffect(() => {
    if (settings) {
      setFormData({
        preferred_currency: settings.preferred_currency || "USD",
      });
    }
  }, [settings]);

  useEffect(() => {
    // Update preview amounts
    setPreview({
      small: 1234.56,
      medium: 45678.9,
      large: 1234567.89,
    });
  }, [formData.preferred_currency]);

  const handleChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    await onSave(formData);
    // Update the currency context and localStorage
    setPreferredCurrency(formData.preferred_currency);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          {t("settings.currencySettings")}
        </h2>
        <p className="text-sm text-gray-600 mb-6">
          {t("settings.currencyDescription")}
        </p>
      </div>

      {/* Preferred Currency */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          {t("settings.preferredCurrency")}
        </label>
        <select
          value={formData.preferred_currency}
          onChange={(e) => handleChange("preferred_currency", e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {currencyService.currencies.map((currency) => (
            <option key={currency.code} value={currency.code}>
              {currency.code} - {currency.name} ({currency.symbol})
            </option>
          ))}
        </select>
        <p className="text-xs text-gray-500 mt-1">
          {t("settings.currencyNote")}
        </p>
      </div>

      {/* Preview */}
      <div className="bg-gray-50 rounded-lg p-4">
        <h3 className="text-sm font-medium text-gray-900 mb-3">
          {t("settings.currencyPreview")}
        </h3>
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">{t("settings.smallAmount")}:</span>
            <span className="font-medium text-gray-900">
              {currencyService.format(
                preview.small,
                formData.preferred_currency
              )}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">{t("settings.mediumAmount")}:</span>
            <span className="font-medium text-gray-900">
              {currencyService.format(
                preview.medium,
                formData.preferred_currency
              )}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">{t("settings.largeAmount")}:</span>
            <span className="font-medium text-gray-900">
              {currencyService.format(
                preview.large,
                formData.preferred_currency
              )}
            </span>
          </div>
        </div>
      </div>

      {/* Information Box */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start space-x-3">
          <span className="text-blue-600 text-lg">ℹ️</span>
          <div className="flex-1">
            <h4 className="text-sm font-medium text-blue-900 mb-1">
              {t("settings.currencyConversion")}
            </h4>
            <p className="text-xs text-blue-700">
              {t("settings.currencyConversionNote")}
            </p>
          </div>
        </div>
      </div>

      {/* Save Button */}
      <div className="pt-4 border-t border-gray-200">
        <Button type="submit" disabled={isSaving}>
          {isSaving ? t("common.saving") : t("settings.saveChanges")}
        </Button>
      </div>
    </form>
  );
};

export default CurrencySettings;
