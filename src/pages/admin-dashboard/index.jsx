import React, { useState } from "react";
import Icon from "components/AppIcon";
import Button from "components/ui/Button";
import { useAuth } from "contexts/AuthContext";
import { contactService } from "services/supabaseService";
import UserManagement from "./components/UserManagement";
import ProductMaster from "./components/ProductMaster";
import SalesTarget from "./components/SalesTarget";
import CompanyManagement from "./components/CompanyManagement";
import UomSettings from "./components/UomSettings";
import UserAuthorization from "./components/UserAuthorization";
import LostReasonSettings from "./components/LostReasonSettings";

const AdminDashboard = () => {
  const [activeTab, setActiveTab] = useState("users");
  const { signOut, userProfile, company } = useAuth();
  const [isRecalculating, setIsRecalculating] = useState(false);
  const [recalcMsg, setRecalcMsg] = useState(null);

  const handleRecalculate = async () => {
    if (!company?.id) return;
    setIsRecalculating(true);
    setRecalcMsg(null);
    const { data, error } = await contactService.recalculateAllScores(company.id);
    setIsRecalculating(false);
    if (error) {
      setRecalcMsg({ ok: false, text: "Recalculation failed." });
    } else {
      setRecalcMsg({ ok: true, text: `${data.updated} contact${data.updated !== 1 ? "s" : ""} updated.` });
    }
    setTimeout(() => setRecalcMsg(null), 4000);
  };

  const tabs = [
    { id: "users",         label: "User Management", icon: "Users"       },
    { id: "authorization", label: "Authorization",   icon: "ShieldCheck" },
    { id: "companies",     label: "Companies",       icon: "Building2"   },
    { id: "products",      label: "Product Master",  icon: "Package"     },
    { id: "targets",       label: "Sales Targets",   icon: "Target"      },
    { id: "lost-reasons",  label: "Lost Reasons",    icon: "XCircle"     },
    { id: "settings",      label: "Settings",        icon: "Settings"    },
  ];

  const handleLogout = async () => {
    if (confirm("Are you sure you want to log out?")) {
      await signOut();
    }
  };

  return (
    <div className="flex-1 overflow-hidden">
      <div className="h-full flex flex-col">
        {/* Header */}
        <div className="bg-background border-b border-border px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">Admin Dashboard</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Manage users, products, and sales targets
              </p>
            </div>
            <div className="flex items-center gap-3">
              {recalcMsg && (
                <span className={`text-xs font-medium ${recalcMsg.ok ? "text-emerald-600" : "text-destructive"}`}>
                  {recalcMsg.text}
                </span>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={handleRecalculate}
                disabled={isRecalculating}
                className="gap-2"
                title="Recalculate lead scores for all contacts"
              >
                {isRecalculating
                  ? <Icon name="Loader2" size={14} className="animate-spin" />
                  : <Icon name="RefreshCw" size={14} />}
                {isRecalculating ? "Recalculating…" : "Recalc Scores"}
              </Button>
              <div className="flex items-center gap-2 px-3 py-2 bg-primary/10 rounded-lg">
                <Icon name="Shield" className="text-primary" size={20} />
                <span className="text-sm font-medium">
                  {userProfile?.full_name || "Admin"}
                </span>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleLogout}
                className="gap-2"
              >
                <Icon name="LogOut" size={16} />
                Logout
              </Button>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-2 mt-4">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
                  activeTab === tab.id
                    ? "bg-primary text-primary-foreground"
                    : "bg-card text-foreground hover:bg-accent"
                }`}
              >
                <Icon name={tab.icon} size={16} />
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto">
          {activeTab === "users"         && <UserManagement />}
          {activeTab === "authorization" && <UserAuthorization />}
          {activeTab === "companies"     && <CompanyManagement />}
          {activeTab === "products"      && <ProductMaster />}
          {activeTab === "targets"       && <SalesTarget />}
          {activeTab === "lost-reasons"  && <LostReasonSettings />}
          {activeTab === "settings"      && <UomSettings />}
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
