import React, { useState, useEffect } from "react";
import { useAuth } from "contexts/AuthContext";
import Header from "components/ui/Header";
import Icon from "components/AppIcon";
import CustomerMaster from "./components/CustomerMaster";

const PlanningPage = () => {
  const { company, userProfile } = useAuth();
  const [activeTab, setActiveTab] = useState("customer_master");
  const [adminCompany, setAdminCompany] = useState(null);

  useEffect(() => {
    if (company && !adminCompany) {
      setAdminCompany(company);
    }
  }, [company]);

  const tabs = [
    { id: "customer_master", label: "Customer Master", icon: "Users" },
  ];

  if (!userProfile) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Icon name="Loader2" size={24} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header />
      <main className="flex-1 px-4 lg:px-6 py-6 max-w-screen-2xl mx-auto w-full">
        {/* Page heading */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-foreground">Planning</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage customer assignments and distribution
          </p>
        </div>

        {/* Tab bar */}
        <div className="flex items-center gap-1 bg-muted rounded-xl p-1 mb-6 w-fit">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                activeTab === tab.id
                  ? "bg-background shadow-sm text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon name={tab.icon} size={15} />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {activeTab === "customer_master" && (
          <CustomerMaster
            adminCompany={adminCompany}
            onCompanyChange={setAdminCompany}
          />
        )}
      </main>
    </div>
  );
};

export default PlanningPage;
