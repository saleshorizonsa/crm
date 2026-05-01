import React from "react";
import Icon from "../../../components/AppIcon";

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

  return (
    <div className="text-center space-y-6">
      {/* Company Logo and Name */}
      <div className="space-y-4">
        <div
          className="w-20 h-20 rounded-2xl flex items-center justify-center mx-auto shadow-enterprise-md"
          style={{ backgroundColor: `${currentTheme?.primaryColor}15` }}
        >
          <Icon
            name={currentTheme?.logo}
            size={32}
            color={currentTheme?.primaryColor}
          />
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-foreground">
            {currentTheme?.name}
          </h1>
          <p
            className="text-sm font-medium"
            style={{ color: currentTheme?.primaryColor }}
          >
            {currentTheme?.tagline}
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
