import React, { useState } from "react";
import { Navigate } from "react-router-dom";
import Header from "../../components/ui/Header";
import NavigationBreadcrumbs from "../../components/ui/NavigationBreadcrumbs";
import RoleBasedDashboard from "./components/RoleBasedDashboard";
import { useAuth } from "../../contexts/AuthContext";
import DateRangePicker from "../../components/ui/DateRangePicker";
import { useDateRange } from "../../contexts/DateRangeContext";
import { format, parseISO } from "date-fns";
import { useLanguage } from "../../i18n";

const CompanyDashboard = () => {
  const { t } = useLanguage();
  const { company, user, userProfile } = useAuth();
  const { dateRange, setRange } = useDateRange();
  const [selectedCompany, setSelectedCompany] = useState(company);

  const periodLabel = (() => {
    if (dateRange.isAllTime || (!dateRange.from && !dateRange.to)) return t("dashboard.allTime");
    try {
      const from = format(parseISO(dateRange.from), "d MMM yyyy");
      const to   = format(parseISO(dateRange.to),   "d MMM yyyy");
      return dateRange.from === dateRange.to ? from : `${from} – ${to}`;
    } catch {
      return "";
    }
  })();

  const handleCompanyChange = (newCompany) => {
    setSelectedCompany(newCompany);
  };

  // Show loading if user profile is not loaded yet
  if (!userProfile) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-center">
          <div className="w-12 h-12 bg-gray-300 rounded-full mx-auto mb-4"></div>
          <div className="h-4 bg-gray-300 rounded w-32"></div>
        </div>
      </div>
    );
  }

  // Show error if no company (only for non-admin/director/head roles)
  if (
    !company &&
    userProfile.role !== "admin" &&
    userProfile.role !== "director" &&
    userProfile.role !== "head"
  ) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-gray-900 mb-2">
            {t("dashboard.noCompanyFound")}
          </h2>
          <p className="text-gray-600">
            {t("dashboard.contactAdminForCompany")}
          </p>
        </div>
      </div>
    );
  }

  // For admin/director/head without company, show a message to select one
  if (
    !company &&
    (userProfile.role === "admin" || 
     userProfile.role === "director" || 
     userProfile.role === "head")
  ) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header
          onCompanyChange={handleCompanyChange}
          selectedCompany={selectedCompany}
        />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              {t("dashboard.noCompaniesAvailable")}
            </h2>
            <p className="text-gray-600">
              {t("dashboard.createCompanyFirst")}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Defence-in-depth: viewer must not reach the company dashboard
  if (userProfile?.role === "viewer") {
    return <Navigate to="/pipeline-view" replace />;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header
        onCompanyChange={handleCompanyChange}
        selectedCompany={selectedCompany}
      />
      <div className="flex-1 flex flex-col overflow-hidden">
        <main className="flex-1 relative z-0 overflow-y-auto focus:outline-none">
          <div className="py-6">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8">
              <NavigationBreadcrumbs
                items={[{ label: t("nav.companyDashboard"), href: "/company-dashboard" }]}
              />

              {/* Period selector bar */}
              <div className="flex items-center justify-between mt-4 mb-6 px-1">
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <span className="font-medium text-gray-700">{t("dashboard.viewing")}:</span>
                  <span>{periodLabel}</span>
                </div>
                <DateRangePicker onChange={setRange} />
              </div>

              {/* Role-based Dashboard */}
              <RoleBasedDashboard
                userRole={userProfile.role}
                user={user}
                userProfile={userProfile}
                company={selectedCompany || company}
                onCompanyChange={handleCompanyChange}
              />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default CompanyDashboard;
