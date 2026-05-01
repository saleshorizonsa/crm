import React, { useState } from "react";
import Header from "../../components/ui/Header";
import NavigationBreadcrumbs from "../../components/ui/NavigationBreadcrumbs";
import RoleBasedDashboard from "./components/RoleBasedDashboard";
import { useAuth } from "../../contexts/AuthContext";

const CompanyDashboard = () => {
  const { company, user, userProfile } = useAuth();
  const [selectedCompany, setSelectedCompany] = useState(company);

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
            No Company Found
          </h2>
          <p className="text-gray-600">
            Please contact your administrator to assign you to a company.
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
              No Companies Available
            </h2>
            <p className="text-gray-600">
              Please create a company first or select one from the dropdown
              above.
            </p>
          </div>
        </div>
      </div>
    );
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
                items={[{ label: "Dashboard", href: "/company-dashboard" }]}
              />

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
