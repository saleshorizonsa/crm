import React, { useState } from "react";
import Icon from "components/AppIcon";
import Button from "components/ui/Button";
import Header from "components/ui/Header";
import { useAuth } from "contexts/AuthContext";
import { contactService } from "services/supabaseService";
import UserManagement from "./components/UserManagement";
import ProductMaster from "./components/ProductMaster";
import SalesTarget from "./components/SalesTarget";
import CompanyManagement from "./components/CompanyManagement";
import UomSettings from "./components/UomSettings";
import UserAuthorization from "./components/UserAuthorization";
import LostReasonSettings from "./components/LostReasonSettings";
import MaterialGroupSettings from "./components/MaterialGroupSettings";
import CompanyLogoManager from "./components/CompanyLogoManager";
import AdminCompanySelector from "./components/AdminCompanySelector";
import CustomerMaster from "./components/CustomerMaster";
import { useLanguage } from "../../i18n";

const AdminDashboard = () => {
  const [activeTab, setActiveTab] = useState("users");
  const [adminCompany, setAdminCompany] = useState(null);
  const { company } = useAuth();
  const { t } = useLanguage();
  const [isRecalculating, setIsRecalculating] = useState(false);
  const [recalcMsg, setRecalcMsg] = useState(null);

  const handleRecalculate = async () => {
    if (!company?.id) return;
    setIsRecalculating(true);
    setRecalcMsg(null);
    const { data, error } = await contactService.recalculateAllScores(company.id);
    setIsRecalculating(false);
    if (error) {
      setRecalcMsg({ ok: false, text: t("admin.recalcFailed") });
    } else {
      setRecalcMsg({ ok: true, text: `${data.updated} ${data.updated !== 1 ? t("admin.contactsUpdated") : t("admin.contactUpdated")}` });
    }
    setTimeout(() => setRecalcMsg(null), 4000);
  };

  const tabs = [
    { id: "users",         label: t("admin.userManagement"), icon: "Users"       },
    { id: "authorization", label: t("admin.authorization"),  icon: "ShieldCheck" },
    { id: "companies",     label: t("admin.companyManagement"), icon: "Building2" },
    { id: "branding",      label: "Company Branding",        icon: "Palette"   },
    { id: "products",         label: t("admin.productMaster"),  icon: "Package"     },
    { id: "customer_master",  label: "Customer Master",         icon: "Building"    },
    { id: "targets",          label: t("admin.salesTargets"),   icon: "Target"      },
    { id: "lost-reasons",     label: t("admin.lostReasons"),    icon: "XCircle"     },
    { id: "material-groups",  label: "Material Groups",         icon: "Layers"      },
    { id: "settings",         label: t("admin.settings"),       icon: "Settings"    },
  ];

  // The same top menu as every other page (it was missing here, leaving the
  // browser's Back button as the only way out). The Header carries the user
  // menu and the one Sign Out, so this page no longer has its own.
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header />
      <div className="flex-1 flex flex-col min-h-0">
        {/* Page title, actions and tabs */}
        <div className="bg-background border-b border-border px-4 sm:px-6 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold">{t("admin.title")}</h1>
              <p className="text-sm text-muted-foreground mt-1">
                {t("admin.manageDescription")}
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
                title={t("contacts.leadScore")}
              >
                {isRecalculating
                  ? <Icon name="Loader2" size={14} className="animate-spin" />
                  : <Icon name="RefreshCw" size={14} />}
                {isRecalculating ? t("admin.recalculating") : t("admin.recalcScores")}
              </Button>
            </div>
          </div>

          {/* Tabs — scroll sideways on a narrow screen instead of widening the page */}
          <div className="flex gap-2 mt-4 overflow-x-auto pb-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors whitespace-nowrap shrink-0 ${
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
          {activeTab === "branding"      && <CompanyLogoManager />}
          {activeTab === "products" && (
            <>
              <AdminCompanySelector value={adminCompany} onSelect={setAdminCompany} />
              {adminCompany
                ? <ProductMaster adminCompany={adminCompany} />
                : <div className="flex items-center justify-center h-48 text-sm text-muted-foreground">Select a company above to manage products</div>
              }
            </>
          )}
          {activeTab === "customer_master" && (
            <>
              <AdminCompanySelector value={adminCompany} onSelect={setAdminCompany} />
              <CustomerMaster adminCompany={adminCompany} />
            </>
          )}
          {activeTab === "targets" && (
            <>
              <AdminCompanySelector value={adminCompany} onSelect={setAdminCompany} />
              {adminCompany
                ? <SalesTarget companyId={adminCompany.id} />
                : <div className="flex items-center justify-center h-48 text-sm text-muted-foreground">Select a company above to manage sales targets</div>
              }
            </>
          )}
          {activeTab === "lost-reasons"     && <LostReasonSettings />}
          {activeTab === "material-groups" && (
            <>
              <AdminCompanySelector value={adminCompany} onSelect={setAdminCompany} />
              {adminCompany
                ? <MaterialGroupSettings adminCompany={adminCompany} />
                : <div className="flex items-center justify-center h-48 text-sm text-muted-foreground">Select a company above to manage material groups</div>
              }
            </>
          )}
          {activeTab === "settings"         && <UomSettings />}
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
