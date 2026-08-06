import React, { createContext, useContext, useState, useEffect } from "react";
import { useAuth } from "./AuthContext";
import { settingsService, currencyService } from "../services/supabaseService";

const CurrencyContext = createContext();

export const useCurrency = () => {
  const context = useContext(CurrencyContext);
  if (!context) {
    throw new Error("useCurrency must be used within a CurrencyProvider");
  }
  return context;
};

export const CurrencyProvider = ({ children }) => {
  const { user, company } = useAuth();
  const [preferredCurrency, setPreferredCurrency] = useState(() => {
    // Initialize from localStorage; default to SAR (the company currency) rather
    // than USD. The real value is resolved from settings/company below.
    return localStorage.getItem("preferredCurrency") || "SAR";
  });
  // Tracks whether the user has an explicit currency preference of their own.
  // When they don't, we follow the active company's currency.
  const [hasUserChoice, setHasUserChoice] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Load currency from database on mount and save to localStorage
  useEffect(() => {
    if (user?.id) {
      loadUserCurrency();
    } else {
      setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Follow the active company's currency when the user has no explicit
  // preference (and hasn't changed it this session) — e.g. a director switching
  // between companies, or a user with no saved setting.
  useEffect(() => {
    if (!hasUserChoice && company?.currency) {
      setPreferredCurrency(company.currency);
      localStorage.setItem("preferredCurrency", company.currency);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company?.currency, hasUserChoice]);

  const loadUserCurrency = async () => {
    try {
      const { data, error } = await settingsService.getUserSettings(user.id);
      if (!error && data?.preferred_currency) {
        // The user has an explicit preference — honour it.
        setPreferredCurrency(data.preferred_currency);
        localStorage.setItem("preferredCurrency", data.preferred_currency);
        setHasUserChoice(true);
      } else {
        // No explicit preference → use the active company's currency (SAR here).
        const fallback = company?.currency || "SAR";
        setPreferredCurrency(fallback);
        localStorage.setItem("preferredCurrency", fallback);
        setHasUserChoice(false);
      }
    } catch (error) {
      console.error("Error loading currency settings:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // Update localStorage when currency changes (an explicit user choice)
  const updatePreferredCurrency = (newCurrency) => {
    setPreferredCurrency(newCurrency);
    localStorage.setItem("preferredCurrency", newCurrency);
    setHasUserChoice(true);
  };

  // Format currency - if fromCurrency is provided, convert it first
  // If fromCurrency is not provided, assume amount is already in preferredCurrency (no conversion needed)
  const formatCurrency = (amount, fromCurrency = null) => {
    if (!amount && amount !== 0)
      return currencyService.format(0, preferredCurrency);

    // If no fromCurrency specified, assume amount is already in preferred currency (just format, no conversion)
    if (!fromCurrency) {
      return currencyService.format(amount, preferredCurrency);
    }

    // If source currency is different from preferred, convert first
    if (fromCurrency !== preferredCurrency) {
      const convertedAmount = currencyService.convert(
        amount,
        fromCurrency,
        preferredCurrency
      );
      return currencyService.format(convertedAmount, preferredCurrency);
    }

    // Otherwise just format in the preferred currency
    return currencyService.format(amount, preferredCurrency);
  };

  const convertCurrency = (amount, fromCurrency = null, toCurrency = null) => {
    const targetCurrency = toCurrency || preferredCurrency;
    // Default the source to the preferred currency so an unspecified source
    // doesn't trigger a spurious USD→SAR conversion.
    const sourceCurrency = fromCurrency || preferredCurrency;
    return currencyService.convert(amount, sourceCurrency, targetCurrency);
  };

  const getCurrencySymbol = (currency = null) => {
    const currencyToUse = currency || preferredCurrency;
    return currencyService.getSymbol(currencyToUse);
  };

  const value = {
    preferredCurrency,
    setPreferredCurrency: updatePreferredCurrency,
    formatCurrency,
    convertCurrency,
    getCurrencySymbol,
    isLoading,
  };

  return (
    <CurrencyContext.Provider value={value}>
      {children}
    </CurrencyContext.Provider>
  );
};
