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

  const t = (keyPath, params = {}) => {
    const keys = keyPath.split(".");
    let value = translations[language];

    for (const key of keys) {
      if (value && typeof value === "object" && key in value) {
        value = value[key];
      } else {
        // Fallback to English
        value = translations["en"];
        for (const k of keys) {
          if (value && typeof value === "object" && k in value) {
            value = value[k];
          } else {
            return keyPath;
          }
        }
        break;
      }
    }

    if (typeof value === "string" && Object.keys(params).length > 0) {
      Object.entries(params).forEach(([param, paramValue]) => {
        value = value.replace(new RegExp(`\\{${param}\\}`, "g"), paramValue);
      });
    }

    return value || keyPath;
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
