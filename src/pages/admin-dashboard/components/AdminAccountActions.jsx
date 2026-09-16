import React, { useState, useEffect } from "react";
import Icon from "components/AppIcon";
import Button from "components/ui/Button";
import { useAuth } from "contexts/AuthContext";
import { adminUpdateUser, MIN_PASSWORD_LENGTH } from "../../../services/adminUserService";

// "Edit Name" and "Set Password" for one user, inside the admin user detail
// modal. Rendered for role = 'admin' only. That is a convenience, not the
// security boundary: api/admin-update-user.js verifies the caller server-side.

function ResultBanner({ result, onDismiss }) {
  if (!result) return null;
  const ok = result.tone === "ok";
  return (
    <div
      className={`flex items-start gap-2 px-3 py-2.5 rounded border text-sm ${
        ok ? "bg-green-50 border-green-200 text-green-800" : "bg-red-50 border-red-200 text-red-700"
      }`}
    >
      <Icon name={ok ? "CheckCircle2" : "AlertTriangle"} size={16} className="flex-shrink-0 mt-0.5" />
      <p className="flex-1">{result.text}</p>
      <button onClick={onDismiss} aria-label="Dismiss" className="opacity-60 hover:opacity-100">
        <Icon name="X" size={14} />
      </button>
    </div>
  );
}

export default function AdminAccountActions({ user, onNameChanged }) {
  const { userProfile } = useAuth();

  const [name, setName] = useState(user?.full_name || "");
  const [savingName, setSavingName] = useState(false);
  const [nameResult, setNameResult] = useState(null);

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordResult, setPasswordResult] = useState(null);

  useEffect(() => {
    setName(user?.full_name || "");
  }, [user?.id, user?.full_name]);

  if (userProfile?.role !== "admin" || !user) return null;

  const displayName = user.full_name || user.email || "this user";

  if (!user.is_active) {
    return (
      <div className="flex items-start gap-2 px-3 py-2.5 bg-gray-50 border border-gray-200 rounded text-sm text-gray-600">
        <Icon name="Lock" size={14} className="mt-0.5 flex-shrink-0 text-gray-400" />
        <p>This user is inactive. Reactivate them before changing their name or password.</p>
      </div>
    );
  }

  const trimmedName = name.trim().replace(/\s+/g, " ");
  const nameChanged = trimmedName && trimmedName !== (user.full_name || "");

  const handleSaveName = async () => {
    if (!nameChanged) return;
    setSavingName(true);
    setNameResult(null);
    const { data, error } = await adminUpdateUser({ userId: user.id, fullName: trimmedName });
    setSavingName(false);
    if (error) {
      setNameResult({ tone: "error", text: error });
      return;
    }
    const saved = data?.name?.fullName || trimmedName;
    setName(saved);
    setNameResult({ tone: "ok", text: `Name updated to "${saved}".` });
    onNameChanged?.(saved);
  };

  const passwordProblem =
    password.length === 0
      ? ""
      : password.length < MIN_PASSWORD_LENGTH
      ? `At least ${MIN_PASSWORD_LENGTH} characters.`
      : confirmPassword && confirmPassword !== password
      ? "The two passwords do not match."
      : "";
  const passwordReady =
    password.length >= MIN_PASSWORD_LENGTH && confirmPassword === password;

  const handleSetPassword = async () => {
    if (!passwordReady) return;
    setSavingPassword(true);
    setPasswordResult(null);
    const { error } = await adminUpdateUser({ userId: user.id, password });
    setSavingPassword(false);
    setConfirming(false);
    if (error) {
      setPasswordResult({ tone: "error", text: error });
      return;
    }
    setPassword("");
    setConfirmPassword("");
    setShowPassword(false);
    setPasswordResult({
      tone: "ok",
      text: `Password updated for ${displayName}. They can sign in with the new password now.`,
    });
  };

  const inputCls =
    "w-full px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-400";

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <h3 className="font-semibold text-base text-gray-900">Account</h3>
        <span className="text-[10px] font-medium uppercase tracking-wide px-2 py-0.5 rounded bg-indigo-50 text-indigo-700">
          Admin only
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Edit Name */}
        <div className="border border-gray-200 rounded p-4 space-y-3">
          <label htmlFor="admin-edit-name" className="text-xs font-medium text-gray-500 block">
            Edit Name
          </label>
          <input
            id="admin-edit-name"
            type="text"
            value={name}
            maxLength={120}
            onChange={(e) => {
              setName(e.target.value);
              setNameResult(null);
            }}
            className={inputCls}
          />
          <div className="flex justify-end">
            <Button size="sm" onClick={handleSaveName} disabled={!nameChanged || savingName}>
              {savingName ? "Saving..." : "Save Name"}
            </Button>
          </div>
          <ResultBanner result={nameResult} onDismiss={() => setNameResult(null)} />
        </div>

        {/* Set Password */}
        <div className="border border-gray-200 rounded p-4 space-y-3">
          <label htmlFor="admin-set-password" className="text-xs font-medium text-gray-500 block">
            Set Password
          </label>
          <div className="relative">
            <input
              id="admin-set-password"
              type={showPassword ? "text" : "password"}
              value={password}
              autoComplete="new-password"
              placeholder="New password"
              onChange={(e) => {
                setPassword(e.target.value);
                setConfirming(false);
                setPasswordResult(null);
              }}
              className={`${inputCls} pr-10`}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1"
            >
              <Icon name={showPassword ? "EyeOff" : "Eye"} size={16} />
            </button>
          </div>
          <input
            type={showPassword ? "text" : "password"}
            value={confirmPassword}
            autoComplete="new-password"
            placeholder="Confirm new password"
            onChange={(e) => {
              setConfirmPassword(e.target.value);
              setConfirming(false);
              setPasswordResult(null);
            }}
            className={inputCls}
          />
          <p className={`text-xs ${passwordProblem ? "text-red-600" : "text-gray-400"}`}>
            {passwordProblem || `Minimum ${MIN_PASSWORD_LENGTH} characters. No email is sent.`}
          </p>

          {!confirming ? (
            <div className="flex justify-end">
              <Button size="sm" onClick={() => setConfirming(true)} disabled={!passwordReady || savingPassword}>
                Set Password
              </Button>
            </div>
          ) : (
            <div className="px-3 py-2.5 bg-amber-50 border border-amber-200 rounded space-y-2">
              <p className="text-sm text-amber-900">
                Set a new password for <strong>{displayName}</strong>? Their current password stops
                working immediately.
              </p>
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setConfirming(false)} disabled={savingPassword}>
                  Cancel
                </Button>
                <Button size="sm" onClick={handleSetPassword} disabled={savingPassword}>
                  {savingPassword ? "Setting..." : "Confirm"}
                </Button>
              </div>
            </div>
          )}
          <ResultBanner result={passwordResult} onDismiss={() => setPasswordResult(null)} />
        </div>
      </div>
    </div>
  );
}
