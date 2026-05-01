import React, { useState, useEffect } from "react";
import Header from "../../components/ui/Header";
import NavigationBreadcrumbs from "../../components/ui/NavigationBreadcrumbs";
import GeneralSettings from "./components/GeneralSettings";
import CurrencySettings from "./components/CurrencySettings";
import NotificationSettings from "./components/NotificationSettings";
import { useAuth } from "../../contexts/AuthContext";
import { settingsService } from "../../services/supabaseService";
import { useLanguage } from "../../i18n";

const Settings = () => {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState("general");
  const [settings, setSettings] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (user?.id) {
      loadSettings();
    }
  }, [user?.id]);

  const loadSettings = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await settingsService.getUserSettings(user.id);
      if (error) throw error;
      setSettings(data);
    } catch (error) {
      console.error("Error loading settings:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveSettings = async (updates) => {
    setIsSaving(true);
    try {
      const { data, error } = await settingsService.updateUserSettings(
        user.id,
        updates
      );
      if (error) throw error;
      setSettings(data);
      alert("Settings saved successfully!");
    } catch (error) {
      console.error("Error saving settings:", error);
      alert(`Failed to save settings: ${error.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const tabs = [
    { id: "general", label: t("dashboard.general"), icon: "Settings" },
    {
      id: "currency",
      label: t("dashboard.currencyFormat"),
      icon: "DollarSign",
    },
    { id: "notifications", label: t("dashboard.notifications"), icon: "Bell" },
  ];

  if (!user) {
    return <div>{t("common.loading")}...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />

      <main className="p-6">
        <div className="mb-6">
          <NavigationBreadcrumbs
            items={[
              { label: t("nav.dashboard"), href: "/company-dashboard" },
              { label: t("settings.title"), href: "/settings" },
            ]}
          />
          <h1 className="text-2xl font-semibold text-gray-900 mt-2">
            {t("settings.title")}
          </h1>
          <p className="text-gray-600 mt-1">
            {t("dashboard.manageAccountSettings")}
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Sidebar Tabs */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg border border-gray-200 p-2">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`w-full text-left px-4 py-3 rounded-md transition-colors flex items-center space-x-3 ${
                    activeTab === tab.id
                      ? "bg-blue-50 text-blue-700 font-medium"
                      : "text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  <span className="text-lg">
                    {tab.icon === "Settings" && "⚙️"}
                    {tab.icon === "DollarSign" && "💰"}
                    {tab.icon === "Bell" && "🔔"}
                  </span>
                  <span>{tab.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Settings Content */}
          <div className="lg:col-span-3">
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="text-gray-500">{t("common.loading")}...</div>
                </div>
              ) : (
                <>
                  {activeTab === "general" && (
                    <GeneralSettings
                      settings={settings}
                      onSave={handleSaveSettings}
                      isSaving={isSaving}
                    />
                  )}
                  {activeTab === "currency" && (
                    <CurrencySettings
                      settings={settings}
                      onSave={handleSaveSettings}
                      isSaving={isSaving}
                    />
                  )}
                  {activeTab === "notifications" && (
                    <NotificationSettings
                      settings={settings}
                      onSave={handleSaveSettings}
                      isSaving={isSaving}
                    />
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Settings;
