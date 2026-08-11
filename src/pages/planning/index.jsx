import React, { useState, useEffect } from "react";
import { useAuth } from "contexts/AuthContext";
import Header from "components/ui/Header";
import Icon from "components/AppIcon";
import CustomerMaster from "./components/CustomerMaster";
import OpportunitiesModule from "./components/OpportunitiesModule";
import FutureOrdersModule from "./components/FutureOrdersModule";
import HistoricalDataModule from "./components/HistoricalDataModule";

// Isolate each tab so a crash in one (e.g. a bad row of data) can't take down
// the whole Planning page — the other tabs stay usable and the failing tab shows
// the actual error message instead of a blank "Something went wrong".
class TabErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error("Planning tab crashed:", error, info);
  }

  componentDidUpdate(prevProps) {
    // Reset when the user switches tabs so a fixed/other tab renders fresh.
    if (prevProps.tabKey !== this.props.tabKey && this.state.hasError) {
      this.setState({ hasError: false, error: null });
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-8 text-center bg-card rounded-2xl border border-destructive/30">
          <p className="text-sm font-medium text-destructive mb-2">
            Something went wrong in this tab
          </p>
          <p className="text-xs text-muted-foreground font-mono break-words max-w-lg mx-auto">
            {this.state.error?.message || String(this.state.error)}
          </p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="mt-4 text-xs px-3 py-1.5 border border-border rounded-lg text-muted-foreground hover:bg-muted transition-colors"
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const PlanningPage = () => {
  const { company, userProfile } = useAuth();
  const [activeTab, setActiveTab] = useState("customer_master");
  const [adminCompany, setAdminCompany] = useState(null);

  useEffect(() => {
    if (company && !adminCompany) {
      setAdminCompany(company);
    }
  }, [company]);

  // Historical sales upload is a director/admin/head-only tool
  const canUploadHistory = ["director", "admin", "head"].includes(userProfile?.role);

  const tabs = [
    { id: "customer_master", label: "Customer Master", icon: "Users"  },
    { id: "opportunities",   label: "Opportunities",   icon: "Target" },
    { id: "future_orders",   label: "Future Orders",   icon: "CalendarClock" },
    ...(canUploadHistory
      ? [{ id: "historical_data", label: "Historical Data", icon: "Upload" }]
      : []),
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
            {activeTab === "opportunities"
              ? "Opportunities — Plan how you'll hit your monthly target, then convert to deals"
              : activeTab === "future_orders"
              ? "Future Orders — Plan orders for upcoming months; they auto-move to Opportunities when the month arrives"
              : activeTab === "historical_data"
              ? "Historical Data — Import past SAP/ERP sales to power forecasting and year-over-year comparisons"
              : "Customer Master — Import, assign and manage your customer accounts"}
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

        {/* Tab content — each isolated so one tab's error can't blank the page */}
        <TabErrorBoundary tabKey={activeTab}>
          {activeTab === "customer_master" && (
            <CustomerMaster
              adminCompany={adminCompany}
              onCompanyChange={setAdminCompany}
              onGoToOpportunities={() => setActiveTab("opportunities")}
            />
          )}

          {activeTab === "opportunities" && (
            <OpportunitiesModule adminCompany={adminCompany} />
          )}

          {activeTab === "future_orders" && (
            <FutureOrdersModule
              adminCompany={adminCompany}
              onGoToOpportunities={() => setActiveTab("opportunities")}
            />
          )}

          {activeTab === "historical_data" && canUploadHistory && (
            <HistoricalDataModule adminCompany={adminCompany} />
          )}
        </TabErrorBoundary>
      </main>
    </div>
  );
};

export default PlanningPage;
