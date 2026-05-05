import React, { useState, useEffect } from "react";
import Icon from "../../../components/AppIcon";
import Button from "../../../components/ui/Button";
import { useAuth } from "../../../contexts/AuthContext";
import { meetingService } from "../../../services/meetingService";

const CalendarSettings = () => {
  const { user } = useAuth();
  const [connection,    setConnection]   = useState(null);
  const [loading,       setLoading]      = useState(true);
  const [connecting,    setConnecting]   = useState(false);
  const [disconnecting, setDisconnecting]= useState(false);
  const [msg,           setMsg]          = useState(null);

  const redirectUri = `${window.location.origin}/calendar`;

  useEffect(() => {
    if (user?.id) loadConnection();
  }, [user?.id]);

  const loadConnection = async () => {
    setLoading(true);
    const { data } = await meetingService.getCalendarConnection(user.id);
    setConnection(data);
    setLoading(false);
  };

  const handleConnectGoogle = () => {
    const url = meetingService.getGoogleAuthUrl(redirectUri);
    if (!url) {
      setMsg({ ok: false, text: "VITE_GOOGLE_CLIENT_ID is not set. Add it to your .env file." });
      return;
    }
    // Add state param to URL for security
    const finalUrl = url + "&state=google_calendar";
    window.location.href = finalUrl;
  };

  const handleConnectOutlook = () => {
    const url = meetingService.getMicrosoftAuthUrl(redirectUri);
    if (!url) {
      setMsg({ ok: false, text: "VITE_MICROSOFT_CLIENT_ID is not set. Add it to your .env file." });
      return;
    }
    window.location.href = url + "&state=outlook_calendar";
  };

  const handleDisconnect = async () => {
    if (!window.confirm("Disconnect your calendar? Existing meetings won't be affected.")) return;
    setDisconnecting(true);
    const { error } = await meetingService.disconnectCalendar(user.id);
    setDisconnecting(false);
    if (error) {
      setMsg({ ok: false, text: "Failed to disconnect: " + error.message });
    } else {
      setConnection(null);
      setMsg({ ok: true, text: "Calendar disconnected." });
      setTimeout(() => setMsg(null), 3000);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-8 text-muted-foreground">
        <Icon name="Loader2" size={16} className="animate-spin" />Loading…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold text-gray-900">Calendar Integration</h3>
        <p className="text-sm text-gray-500 mt-0.5">
          Connect your Google or Outlook calendar to sync meetings automatically.
        </p>
      </div>

      {msg && (
        <div className={`p-3 rounded-lg text-sm flex items-center gap-2 ${
          msg.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
        }`}>
          <Icon name={msg.ok ? "CheckCircle2" : "AlertCircle"} size={14} />
          {msg.text}
        </div>
      )}

      {/* Connected state */}
      {connection ? (
        <div className="p-4 rounded-lg border border-green-200 bg-green-50 flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg bg-white border border-green-200 flex items-center justify-center flex-shrink-0">
              <Icon name={connection.provider === "google" ? "Calendar" : "Mail"} size={18} className="text-green-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-green-800 capitalize">
                {connection.provider} Calendar connected
              </p>
              {connection.email && (
                <p className="text-xs text-green-600 mt-0.5">{connection.email}</p>
              )}
              <p className="text-xs text-green-600 mt-0.5">
                Connected {new Date(connection.connected_at).toLocaleDateString()}
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleDisconnect}
            disabled={disconnecting}
            className="text-red-600 border-red-200 hover:bg-red-50 flex-shrink-0"
          >
            {disconnecting
              ? <Icon name="Loader2" size={13} className="animate-spin mr-1" />
              : <Icon name="Unlink" size={13} className="mr-1" />}
            Disconnect
          </Button>
        </div>
      ) : (
        /* Connect options */
        <div className="space-y-3">
          {/* Google Calendar */}
          <div className="p-4 rounded-lg border border-border flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-white border border-gray-200 flex items-center justify-center flex-shrink-0 shadow-sm">
                <Icon name="Calendar" size={18} className="text-blue-500" />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900">Google Calendar</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Sync meetings to your Google Calendar. Requires Google Cloud OAuth credentials.
                </p>
              </div>
            </div>
            <Button size="sm" onClick={handleConnectGoogle} disabled={connecting} className="flex-shrink-0 gap-1.5">
              <Icon name="Link" size={13} />Connect
            </Button>
          </div>

          {/* Outlook */}
          <div className="p-4 rounded-lg border border-border flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-white border border-gray-200 flex items-center justify-center flex-shrink-0 shadow-sm">
                <Icon name="Mail" size={18} className="text-blue-700" />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900">Outlook / Microsoft 365</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Sync meetings via Microsoft Graph API. Requires Azure AD app registration.
                </p>
              </div>
            </div>
            <Button size="sm" variant="outline" onClick={handleConnectOutlook} disabled={connecting} className="flex-shrink-0 gap-1.5">
              <Icon name="Link" size={13} />Connect
            </Button>
          </div>
        </div>
      )}

      {/* Setup instructions */}
      {!connection && (
        <div className="p-4 rounded-lg bg-amber-50 border border-amber-200 space-y-3">
          <p className="text-xs font-semibold text-amber-800 flex items-center gap-1.5">
            <Icon name="Info" size={13} />Setup required before connecting
          </p>
          <div className="text-xs text-amber-700 space-y-2">
            <p><strong>Google Calendar:</strong></p>
            <ol className="list-decimal ml-4 space-y-1">
              <li>Go to console.cloud.google.com → Create project → Enable Google Calendar API</li>
              <li>Create OAuth 2.0 credentials (Web application type)</li>
              <li>Add <code className="bg-amber-100 px-1 rounded">{redirectUri}</code> as an authorized redirect URI</li>
              <li>Add <code className="bg-amber-100 px-1 rounded">VITE_GOOGLE_CLIENT_ID=xxx</code> to your <code>.env</code> file</li>
              <li>Add <code className="bg-amber-100 px-1 rounded">GOOGLE_CLIENT_ID</code> and <code className="bg-amber-100 px-1 rounded">GOOGLE_CLIENT_SECRET</code> as Supabase secrets</li>
              <li>Deploy the <code className="bg-amber-100 px-1 rounded">google-calendar-auth</code> and <code className="bg-amber-100 px-1 rounded">google-calendar-sync</code> Edge Functions</li>
            </ol>
          </div>
        </div>
      )}
    </div>
  );
};

export default CalendarSettings;
