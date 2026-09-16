// Vercel serverless function: an administrator renames a user and/or sets a
// user's password directly (no reset email).
//
// Why this is server-side: setting another user's password needs Supabase's
// admin API, which needs the SERVICE ROLE key. That key bypasses every RLS
// policy, so it must never reach the browser. It is read here from
// process.env.SUPABASE_SERVICE_ROLE_KEY — deliberately NOT VITE_-prefixed:
// Vite inlines VITE_* variables into the public bundle (see ai-assistant.js).
//
// Nothing the browser says about who is calling is trusted:
//   1. the caller's Supabase access token (Authorization: Bearer ...) is
//      verified with Supabase itself to get the real user id;
//   2. that id is looked up in public.users and must be role = 'admin' and
//      is_active = true;
//   3. the target must be an existing ACTIVE user.
// Only then does it write. Passwords are never logged.
import { createClient } from "@supabase/supabase-js";

const MIN_PASSWORD_LENGTH = 8;   // keep in sync with src/services/adminUserService.js
const MAX_PASSWORD_LENGTH = 72;  // bcrypt only uses the first 72 bytes
const MAX_NAME_LENGTH = 120;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error("[admin-update-user] SUPABASE_SERVICE_ROLE_KEY or the Supabase URL is not set");
    return res.status(500).json({ error: "User administration is not configured on this deployment." });
  }

  const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    return res.status(401).json({ error: "You are not signed in." });
  }

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 1. Who is really calling?
  const { data: authData, error: authError } = await admin.auth.getUser(token);
  const callerId = authData?.user?.id;
  if (authError || !callerId) {
    return res.status(401).json({ error: "Your session has expired. Please sign in again." });
  }

  // 2. Are they an active administrator?
  const { data: caller, error: callerError } = await admin
    .from("users")
    .select("id, role, is_active")
    .eq("id", callerId)
    .maybeSingle();
  if (callerError) {
    console.error("[admin-update-user] caller lookup failed:", callerError.message);
    return res.status(500).json({ error: "Could not verify your permissions." });
  }
  if (!caller || caller.role !== "admin" || caller.is_active !== true) {
    console.warn(`[admin-update-user] refused: caller ${callerId} is not an active admin`);
    return res.status(403).json({ error: "Only an administrator can change user names or passwords." });
  }

  // 3. Validate the request.
  const { userId, fullName, password } = req.body || {};
  if (typeof userId !== "string" || !UUID_RE.test(userId)) {
    return res.status(400).json({ error: "A valid user id is required." });
  }
  const wantsName = fullName !== undefined && fullName !== null;
  const wantsPassword = password !== undefined && password !== null;
  if (!wantsName && !wantsPassword) {
    return res.status(400).json({ error: "Nothing to change." });
  }

  let name = null;
  if (wantsName) {
    name = typeof fullName === "string" ? fullName.trim().replace(/\s+/g, " ") : "";
    if (!name) return res.status(400).json({ error: "Name cannot be empty." });
    if (name.length > MAX_NAME_LENGTH) {
      return res.status(400).json({ error: `Name must be ${MAX_NAME_LENGTH} characters or fewer.` });
    }
  }
  if (wantsPassword) {
    if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` });
    }
    if (Buffer.byteLength(password, "utf8") > MAX_PASSWORD_LENGTH) {
      return res.status(400).json({ error: `Password must be ${MAX_PASSWORD_LENGTH} characters or fewer.` });
    }
  }

  // 4. The target must exist and be active.
  const { data: target, error: targetError } = await admin
    .from("users")
    .select("id, full_name, is_active")
    .eq("id", userId)
    .maybeSingle();
  if (targetError) {
    console.error("[admin-update-user] target lookup failed:", targetError.message);
    return res.status(500).json({ error: "Could not load that user." });
  }
  if (!target) return res.status(404).json({ error: "User not found." });
  if (target.is_active !== true) {
    return res.status(409).json({ error: "This user is inactive. Reactivate them before changing their name or password." });
  }

  const result = { success: true, userId, name: null, password: null };

  // 5a. Name — the profile row, then the auth display name (best effort).
  if (wantsName) {
    const { data: updated, error: nameError } = await admin
      .from("users")
      .update({ full_name: name, updated_at: new Date().toISOString() })
      .eq("id", userId)
      .select("id, full_name")
      .maybeSingle();
    if (nameError || !updated) {
      console.error("[admin-update-user] name update failed:", nameError?.message || "no row updated");
      return res.status(500).json({ error: "The name could not be saved." });
    }
    let metadataSynced = false;
    const { data: authUser } = await admin.auth.admin.getUserById(userId);
    if (authUser?.user) {
      const { error: metaError } = await admin.auth.admin.updateUserById(userId, {
        user_metadata: { ...(authUser.user.user_metadata || {}), full_name: name },
      });
      metadataSynced = !metaError;
    }
    result.name = { updated: true, fullName: updated.full_name, metadataSynced };
  }

  // 5b. Password.
  if (wantsPassword) {
    const { error: pwError } = await admin.auth.admin.updateUserById(userId, { password });
    if (pwError) {
      console.error("[admin-update-user] password update failed for", userId, "-", pwError.message);
      return res.status(400).json({
        ...result,
        success: false,
        error: `The password could not be set: ${pwError.message}`,
      });
    }
    result.password = { updated: true };
  }

  console.log(
    `[admin-update-user] admin ${callerId} updated user ${userId}:` +
      `${result.name ? " name" : ""}${result.password ? " password" : ""}`
  );
  return res.status(200).json(result);
}
