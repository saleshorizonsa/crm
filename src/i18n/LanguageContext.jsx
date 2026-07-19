import React, { createContext, useContext, useState, useEffect } from "react";
import { translations } from "./translations";

const LanguageContext = createContext();

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used within LanguageProvider");
  }
  return context;
};

// Short alias used by components added after initial build
export const useLang = useLanguage;

const STORAGE_KEY = "jasco_language";

export const LanguageProvider = ({ children }) => {
  const [language, setLanguageState] = useState(() => {
    return localStorage.getItem(STORAGE_KEY) || "en";
  });

  const isRTL = language === "ar";
  const direction = isRTL ? "rtl" : "ltr";

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, language);
    document.documentElement.setAttribute("dir", direction);
    document.documentElement.setAttribute("lang", language);

    if (isRTL) {
      document.body.classList.add("rtl", "font-arabic");
    } else {
      document.body.classList.remove("rtl", "font-arabic");
    }
  }, [language, isRTL, direction]);

  // Last-resort label for a key that resolves in NEITHER the active language
  // NOR the English fallback. Turning "dashboard.pipelineCol" into "Pipeline
  // Col" guarantees users never see a raw dotted key on screen — e.g. when a
  // stale bundle is missing a key that source already defines.
  const humanizeKey = (keyPath) =>
    String(keyPath)
      .split(".")
      .pop()
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2") // camelCase → spaced
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/\b\w/g, (c) => c.toUpperCase());

  const t = (keyPath, params = {}) => {
    if (!keyPath) return "";

    const keys = String(keyPath).split(".");

    // Resolve against the active language, then fall back to English.
    const lookup = (lang) => {
      let value = translations[lang];
      for (const key of keys) {
        if (value && typeof value === "object" && key in value) {
          value = value[key];
        } else {
          return undefined;
        }
      }
      return value;
    };

    let value = lookup(language);
    if (value === undefined || value === null) value = lookup("en");

    // Never render a raw key or a non-string node (e.g. a partial namespace):
    // degrade gracefully to a humanized label instead.
    if (typeof value !== "string") {
      if (import.meta.env?.DEV) {
        console.warn(`[i18n] Missing translation for "${keyPath}"`);
      }
      return humanizeKey(keyPath);
    }

    if (Object.keys(params).length > 0) {
      Object.entries(params).forEach(([param, paramValue]) => {
        value = value.replace(new RegExp(`\\{${param}\\}`, "g"), paramValue);
      });
    }

    return value;
  };

  const setLanguage = (newLanguage) => {
    if (translations[newLanguage]) {
      setLanguageState(newLanguage);
    }
  };

  // Backward-compatible alias
  const changeLanguage = setLanguage;

  return (
    <LanguageContext.Provider
      value={{
        language,
        direction,
        isRTL,
        t,
        setLanguage,
        changeLanguage,
        availableLanguages: Object.keys(translations),
      }}
    >
      {children}
    </LanguageContext.Provider>
  );
};

export default LanguageProvider;
