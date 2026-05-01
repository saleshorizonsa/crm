import React, { useState, useEffect } from "react";
import Button from "../../../components/ui/Button";
import { Checkbox } from "../../../components/ui/Checkbox";
import { useLanguage } from "../../../i18n";

const NotificationSettings = ({ settings, onSave, isSaving }) => {
  const { t } = useLanguage();
  const [formData, setFormData] = useState({
    notifications_enabled: true,
    email_notifications: true,
  });

  useEffect(() => {
    if (settings) {
      setFormData({
        notifications_enabled: settings.notifications_enabled ?? true,
        email_notifications: settings.email_notifications ?? true,
      });
    }
  }, [settings]);

  const handleChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          {t("settings.notificationPreferences")}
        </h2>
        <p className="text-sm text-gray-600 mb-6">
          {t("settings.notificationDescription")}
        </p>
      </div>

      {/* In-App Notifications */}
      <div className="space-y-4">
        <div className="flex items-start space-x-3">
          <Checkbox
            checked={formData.notifications_enabled}
            onChange={(checked) =>
              handleChange("notifications_enabled", checked)
            }
            className="mt-1"
          />
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-900">
              {t("settings.inAppNotifications")}
            </label>
            <p className="text-xs text-gray-500 mt-1">
              {t("settings.inAppNotificationsNote")}
            </p>
          </div>
        </div>

        <div className="flex items-start space-x-3">
          <Checkbox
            checked={formData.email_notifications}
            onChange={(checked) => handleChange("email_notifications", checked)}
            className="mt-1"
          />
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-900">
              {t("settings.emailNotifications")}
            </label>
            <p className="text-xs text-gray-500 mt-1">
              {t("settings.emailNotificationsNote")}
            </p>
          </div>
        </div>
      </div>

      {/* Notification Types */}
      <div className="bg-gray-50 rounded-lg p-4 space-y-3">
        <h3 className="text-sm font-medium text-gray-900">
          {t("settings.youllBeNotifiedAbout")}:
        </h3>
        <ul className="space-y-2 text-sm text-gray-600">
          <li className="flex items-center space-x-2">
            <span className="text-green-500">✓</span>
            <span>{t("settings.tasksAssignedToYou")}</span>
          </li>
          <li className="flex items-center space-x-2">
            <span className="text-green-500">✓</span>
            <span>{t("settings.dealStatusChanges")}</span>
          </li>
          <li className="flex items-center space-x-2">
            <span className="text-green-500">✓</span>
            <span>{t("settings.upcomingTaskDueDates")}</span>
          </li>
          <li className="flex items-center space-x-2">
            <span className="text-green-500">✓</span>
            <span>{t("settings.newContactActivities")}</span>
          </li>
          <li className="flex items-center space-x-2">
            <span className="text-green-500">✓</span>
            <span>{t("settings.teamMentionsAndComments")}</span>
          </li>
        </ul>
      </div>

      {/* Save Button */}
      <div className="pt-4 border-t border-gray-200">
        <Button type="submit" disabled={isSaving}>
          {isSaving ? t("common.saving") : t("settings.saveChanges")}
        </Button>
      </div>
    </form>
  );
};

export default NotificationSettings;
