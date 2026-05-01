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
  const { user } = useAuth();
  const [preferredCurrency, setPreferredCurrency] = useState(() => {
    // Initialize from localStorage
    return localStorage.getItem("preferredCurrency") || "USD";
  });
  const [isLoading, setIsLoading] = useState(true);

  // Load currency from database on mount and save to localStorage
  useEffect(() => {
    if (user?.id) {
      loadUserCurrency();
    } else {
      setIsLoading(false);
    }
  }, [user?.id]);

  const loadUserCurrency = async () => {
    try {
      const { data, error } = await settingsService.getUserSettings(user.id);
      if (!error && data?.preferred_currency) {
        const currency = data.preferred_currency;
        setPreferredCurrency(currency);
        localStorage.setItem("preferredCurrency", currency);
      }
    } catch (error) {
      console.error("Error loading currency settings:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // Update localStorage when currency changes
  const updatePreferredCurrency = (newCurrency) => {
    setPreferredCurrency(newCurrency);
    localStorage.setItem("preferredCurrency", newCurrency);
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

  const convertCurrency = (amount, fromCurrency = "USD", toCurrency = null) => {
    const targetCurrency = toCurrency || preferredCurrency;
    const sourceCurrency = fromCurrency || "USD";
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
