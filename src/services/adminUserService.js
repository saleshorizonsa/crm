import { supabase } from "../lib/supabase";

// Browser side of api/admin-update-user.js. The function does all the
// authorization itself (it verifies this session token and requires an active
// admin); this just forwards the signed-in user's token and surfaces errors.

export const MIN_PASSWORD_LENGTH = 8; // keep in sync with api/admin-update-user.js

/**
 * @param {object} p
 * @param {string} p.userId
 * @param {string} [p.fullName]  new display name
 * @param {string} [p.password]  new password
 * @returns {Promise<{data: object|null, error: string|null}>}
 */
export async function adminUpdateUser({ userId, fullName, password }) {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData?.session?.access_token;
  if (!token) return { data: null, error: "Your session has expired. Please sign in again." };

  let response;
  try {
    response = await fetch("/api/admin-update-user", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ userId, fullName, password }),
    });
  } catch (e) {
    return { data: null, error: "Could not reach the server. Check your connection and try again." };
  }

  let body = null;
  try {
    body = await response.json();
  } catch (_) {
    body = null;
  }
  if (!response.ok || !body?.success) {
    return { data: body, error: body?.error || `Request failed (HTTP ${response.status}).` };
  }
  return { data: body, error: null };
}
