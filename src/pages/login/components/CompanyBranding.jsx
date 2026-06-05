import React, { useState, useEffect } from "react";
import Icon from "../../../components/AppIcon";
import { supabase } from "../../../lib/supabase";

const CompanyBranding = ({ selectedCompany = "jasco-group" }) => {
  const companyThemes = {
    "jasco-group": {
      name: "JASCO Group",
      tagline: "Grow smarter. Engage faster",
      primaryColor: "#1e40af",
      accentColor: "#3b82f6",
      logo: "Building2",
      description: "Comprehensive business solutions for modern enterprises",
    },
    "jasco-steels": {
      name: "JASCO STEELS",
      tagline: "Strength in Steel, Excellence in Service",
      primaryColor: "#dc2626",
      accentColor: "#ef4444",
      logo: "Wrench",
      description: "Leading steel manufacturing and distribution",
    },
    "jasco-pvc": {
      name: "JASCO PVC",
      tagline: "Quality PVC Solutions",
      primaryColor: "#059669",
      accentColor: "#10b981",
      logo: "Package",
      description: "Premium PVC products and manufacturing",
    },
    imdadat: {
      name: "IMDADAT",
      tagline: "Data-Driven Business Intelligence",
      primaryColor: "#7c3aed",
      accentColor: "#8b5cf6",
      logo: "BarChart3",
      description: "Advanced analytics and business intelligence solutions",
    },
  };

  const currentTheme =
    companyThemes?.[selectedCompany] || companyThemes?.["jasco-group"];

  // Try to load the real uploaded logo + branding for this company (best-effort).
  const [dbBrand, setDbBrand] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function loadBranding() {
      try {
        const { data } = await supabase
          .from("companies")
          .select("name, logo_url, primary_color, tagline")
          .or(`logo_url.not.is.null,primary_color.not.is.null`)
          .order("name");

        if (cancelled || !data?.length) return;

        // Match by selectedCompany slug against company name, else first with a logo.
        const slugWords = (selectedCompany || "")
          .replace(/-/g, " ")
          .toLowerCase()
          .split(" ")
          .filter(Boolean);
        const matched =
          data.find((c) => {
            const n = (c.name || "").toLowerCase();
            return slugWords.length > 0 && slugWords.every((w) => n.includes(w));
          }) ||
          data.find((c) => c.logo_url) ||
          null;

        if (matched) setDbBrand(matched);
      } catch {
        /* pre-auth read may be blocked — fall back to themed icon */
      }
    }
    loadBranding();
    return () => {
      cancelled = true;
    };
  }, [selectedCompany]);

  const displayName    = dbBrand?.name     || currentTheme?.name;
  const displayTagline = dbBrand?.tagline  || currentTheme?.tagline;
  const primaryColor   = dbBrand?.primary_color || currentTheme?.primaryColor;

  return (
    <div className="text-center space-y-6">
      {/* Company Logo and Name */}
      <div className="space-y-4">
        <div
          className="w-20 h-20 rounded-2xl flex items-center justify-center mx-auto shadow-enterprise-md overflow-hidden"
          style={{ backgroundColor: `${primaryColor}15` }}
        >
          {dbBrand?.logo_url ? (
            <img
              src={dbBrand.logo_url}
              alt={displayName}
              className="w-full h-full object-contain p-2"
            />
          ) : (
            <Icon name={currentTheme?.logo} size={32} color={primaryColor} />
          )}
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-foreground">{displayName}</h1>
          <p className="text-sm font-medium" style={{ color: primaryColor }}>
            {displayTagline}
          </p>
          <p className="text-sm text-muted-foreground max-w-sm mx-auto">
            {currentTheme?.description}
          </p>
        </div>
      </div>
    </div>
  );
};

export default CompanyBranding;
