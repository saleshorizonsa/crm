import React, { useState, useEffect } from "react";
import { useAuth } from "./../contexts/AuthContext";
import { useCurrency } from "./../contexts/CurrencyContext";
import Header from "./../components/ui/Header";
import Button from "./../components/ui/Button";
import Input from "./../components/ui/Input";
import NavigationBreadcrumbs from "./../components/ui/NavigationBreadcrumbs";
import Icon from "./../components/AppIcon";
import { settingsService } from "./../services/supabaseService";
import { capitalize } from "utils/helper";

const AccountSettings = () => {
  const { user, userProfile, refetchProfile } = useAuth();
  const { preferredCurrency, setPreferredCurrency } = useCurrency();
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [settings, setSettings] = useState({
    full_name: "",
    email: "",
    preferred_currency: preferredCurrency,
    date_format: "MM/DD/YYYY",
    timezone: "UTC",
    language: "en",
    notifications_enabled: true,
    email_notifications: true,
  });
  const [message, setMessage] = useState({ type: "", text: "" });

  useEffect(() => {
    loadUserSettings();
  }, [user, userProfile]);

  const loadUserSettings = async () => {
    if (!user?.id || !userProfile) return;

    setIsLoading(true);
    try {
      const { data, error } = await settingsService.getUserSettings(user.id);

      if (!error && data) {
        setSettings({
          full_name: userProfile.full_name || "",
          email: user.email || "",
          preferred_currency: data.preferred_currency || preferredCurrency,
          date_format: data.date_format || "MM/DD/YYYY",
          timezone: data.timezone || "UTC",
          language: data.language || "en",
          notifications_enabled: data.notifications_enabled ?? true,
          email_notifications: data.email_notifications ?? true,
        });
      } else {
        // Set default values if no settings exist
        setSettings({
          full_name: userProfile.full_name || "",
          email: user.email || "",
          preferred_currency: preferredCurrency,
          date_format: "MM/DD/YYYY",
          timezone: "UTC",
          language: "en",
          notifications_enabled: true,
          email_notifications: true,
        });
      }
    } catch (error) {
      console.error("Error loading settings:", error);
      setMessage({ type: "error", text: "Failed to load settings." });
    } finally {
      setIsLoading(false);
    }
  };

  const handleInputChange = (field, value) => {
    setSettings((prev) => ({
      ...prev,
      [field]: value,
    }));
    setMessage({ type: "", text: "" });
  };

  const handleSave = async () => {
    if (!user?.id) return;

    setIsSaving(true);
    try {
      // Update user profile
      const { error: profileError } = await settingsService.updateUserProfile(
        user.id,
        {
          full_name: settings.full_name,
        }
      );

      if (profileError) throw profileError;

      // Update user settings
      const { error: settingsError } = await settingsService.updateUserSettings(
        user.id,
        {
          preferred_currency: settings.preferred_currency,
          date_format: settings.date_format,
          timezone: settings.timezone,
          language: settings.language,
          notifications_enabled: settings.notifications_enabled,
          email_notifications: settings.email_notifications,
        }
      );

      if (settingsError) throw settingsError;

      // Update currency context
      if (settings.preferred_currency !== preferredCurrency) {
        setPreferredCurrency(settings.preferred_currency);
      }

      // Refresh profile
      await refetchProfile();

      setMessage({ type: "success", text: "Settings saved successfully!" });
    } catch (error) {
      console.error("Error saving settings:", error);
      setMessage({ type: "error", text: "Failed to save settings." });
    } finally {
      setIsSaving(false);
    }
  };

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

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <div className="flex-1 flex flex-col overflow-hidden">
        <main className="flex-1 relative z-0 overflow-y-auto focus:outline-none">
          <div className="py-6">
            <div className="max-w-4xl mx-auto px-4 sm:px-6 md:px-8">
              <NavigationBreadcrumbs
                items={[
                  { label: "Dashboard", href: "/company-dashboard" },
                  { label: "Account Settings", href: "/account-settings" },
                ]}
              />

              <div className="mt-6 bg-white shadow rounded-lg">
                <div className="px-6 py-4 border-b border-gray-200">
                  <h1 className="text-xl font-semibold text-gray-900">
                    Account Settings
                  </h1>
                  <p className="text-sm text-gray-500 mt-1">
                    Manage your account preferences and settings
                  </p>
                </div>

                {message.text && (
                  <div
                    className={`mx-6 mt-4 p-4 rounded-md ${
                      message.type === "success"
                        ? "bg-green-50 text-green-800"
                        : "bg-red-50 text-red-800"
                    }`}
                  >
                    <div className="flex items-center">
                      <Icon
                        name={
                          message.type === "success"
                            ? "CheckCircle"
                            : "AlertCircle"
                        }
                        size={16}
                        className="mr-2"
                      />
                      {message.text}
                    </div>
                  </div>
                )}

                <div className="px-6 py-6 space-y-8">
                  {/* Profile Information */}
                  <div>
                    <h3 className="text-lg font-medium text-gray-900 mb-4">
                      Profile Information
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <Input
                          label="Full Name"
                          value={settings.full_name}
                          onChange={(e) =>
                            handleInputChange("full_name", e.target.value)
                          }
                          placeholder="Enter your full name"
                        />
                      </div>
                      <div>
                        <Input
                          label="Email Address"
                          value={settings.email}
                          disabled
                          placeholder="Your email address"
                        />
                        <p className="text-xs text-gray-500 mt-1">
                          Email cannot be changed from here
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Notifications */}
                  <div>
                    <h3 className="text-lg font-medium text-gray-900 mb-4">
                      Notifications
                    </h3>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-medium text-gray-900">
                            Push Notifications
                          </div>
                          <div className="text-sm text-gray-500">
                            Receive notifications in the app
                          </div>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            className="sr-only peer"
                            checked={settings.notifications_enabled}
                            onChange={(e) =>
                              handleInputChange(
                                "notifications_enabled",
                                e.target.checked
                              )
                            }
                          />
                          <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                        </label>
                      </div>
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-medium text-gray-900">
                            Email Notifications
                          </div>
                          <div className="text-sm text-gray-500">
                            Receive notifications via email
                          </div>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            className="sr-only peer"
                            checked={settings.email_notifications}
                            onChange={(e) =>
                              handleInputChange(
                                "email_notifications",
                                e.target.checked
                              )
                            }
                          />
                          <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                        </label>
                      </div>
                    </div>
                  </div>

                  {/* Company Information (Read Only) */}
                  <div>
                    <h3 className="text-lg font-medium text-gray-900 mb-4">
                      Company Information
                    </h3>
                    <div className="bg-gray-50 rounded-lg p-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <div className="text-sm font-medium text-gray-500">
                            Company
                          </div>
                          <div className="text-sm text-gray-900">
                            {userProfile.company?.name || "N/A"}
                          </div>
                        </div>
                        <div>
                          <div className="text-sm font-medium text-gray-500">
                            Role
                          </div>
                          <div className="text-sm text-gray-900 capitalize">
                            {capitalize(userProfile.role)}
                          </div>
                        </div>
                        <div>
                          <div className="text-sm font-medium text-gray-500">
                            Department
                          </div>
                          <div className="text-sm text-gray-900">
                            {userProfile.department || "N/A"}
                          </div>
                        </div>
                        <div>
                          <div className="text-sm font-medium text-gray-500">
                            Territory
                          </div>
                          <div className="text-sm text-gray-900">
                            {userProfile.territory || "N/A"}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-end">
                  <Button
                    variant="primary"
                    onClick={handleSave}
                    disabled={isSaving || isLoading}
                  >
                    {isSaving ? (
                      <>
                        <Icon
                          name="RefreshCw"
                          size={16}
                          className="mr-2 animate-spin"
                        />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Icon name="Save" size={16} className="mr-2" />
                        Save Settings
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default AccountSettings;
