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

export const LanguageProvider = ({ children }) => {
  const [language, setLanguage] = useState(() => {
    // Check localStorage first, then default to 'en'
    return localStorage.getItem("language") || "en";
  });

  const [direction, setDirection] = useState(() => {
    const savedLang = localStorage.getItem("language") || "en";
    return savedLang === "ar" ? "rtl" : "ltr";
  });

  useEffect(() => {
    // Update localStorage when language changes
    localStorage.setItem("language", language);

    // Update direction
    const newDirection = language === "ar" ? "rtl" : "ltr";
    setDirection(newDirection);

    // Update HTML attributes for RTL support
    document.documentElement.setAttribute("dir", newDirection);
    document.documentElement.setAttribute("lang", language);

    // Add/remove RTL class for styling
    if (language === "ar") {
      document.body.classList.add("rtl");
    } else {
      document.body.classList.remove("rtl");
    }
  }, [language]);

  // Get translation by key path (e.g., "common.save" or "dashboard.title")
  const t = (keyPath, params = {}) => {
    const keys = keyPath.split(".");
    let value = translations[language];

    for (const key of keys) {
      if (value && typeof value === "object" && key in value) {
        value = value[key];
      } else {
        // Fallback to English if key not found
        value = translations["en"];
        for (const k of keys) {
          if (value && typeof value === "object" && k in value) {
            value = value[k];
          } else {
            return keyPath; // Return key path if translation not found
          }
        }
        break;
      }
    }

    // Replace parameters like {count}
    if (typeof value === "string" && Object.keys(params).length > 0) {
      Object.entries(params).forEach(([param, paramValue]) => {
        value = value.replace(new RegExp(`\\{${param}\\}`, "g"), paramValue);
      });
    }

    return value || keyPath;
  };

  const changeLanguage = (newLanguage) => {
    if (translations[newLanguage]) {
      setLanguage(newLanguage);
    }
  };

  const isRTL = direction === "rtl";

  return (
    <LanguageContext.Provider
      value={{
        language,
        direction,
        isRTL,
        t,
        changeLanguage,
        availableLanguages: Object.keys(translations),
      }}
    >
      {children}
    </LanguageContext.Provider>
  );
};

export default LanguageProvider;
