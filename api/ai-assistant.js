// Vercel serverless proxy — keeps the API key server-side and avoids CORS.
//
// The key MUST NOT be named with a VITE_ prefix. Vite treats VITE_* as
// client-safe and inlines it into the public browser bundle; src/lib/supabase.js
// dereferences import.meta.env with optional chaining, which makes Vite emit the
// whole env object, so a VITE_-prefixed secret is published to every visitor.
// That is exactly how the previous key leaked (revoked 2026-09-08).
// Server-only secrets are read from process.env with no prefix.
//
// SIGNED-IN, ACTIVE USERS ONLY (session 21). Until then this called Anthropic
// for anyone who found the URL, on our key. Now, before anything is spent:
//   1. the Supabase access token (Authorization: Bearer) must belong to a
//      signed-in user — GET /auth/v1/user answers 200 → else 401
//   2. that user must be active in public.users, read WITH HIS OWN TOKEN so
//      RLS applies → else 403
//   3. the request must be within the limits below → else 400
// The Supabase URL and anon key are public values (they ship in the browser
// bundle anyway), so reading the VITE_-named ones here leaks nothing.

export const LIMITS = {
  maxMessages: 8,
  maxMessageChars: 4000,
  maxSystemChars: 10000,
  maxTokens: 700,
};
const MODEL = "claude-haiku-4-5-20251001";

const textLength = (content) => {
  if (typeof content === "string") return content.length;
  if (Array.isArray(content)) {
    return content.reduce((n, part) => n + (typeof part?.text === "string" ? part.text.length : 0), 0);
  }
  return Infinity; // anything else is not a message we send
};

/** The request's own problems, or null when it is within the limits. */
export function checkRequest(body) {
  const { system, messages } = body || {};
  if (!Array.isArray(messages) || messages.length === 0) return "messages array is required";
  if (messages.length > LIMITS.maxMessages) return `at most ${LIMITS.maxMessages} messages`;
  for (const m of messages) {
    if (!m || !["user", "assistant"].includes(m.role)) return "each message needs a user or assistant role";
    if (textLength(m.content) > LIMITS.maxMessageChars) return `each message at most ${LIMITS.maxMessageChars} characters`;
  }
  if (system != null && (typeof system !== "string" || system.length > LIMITS.maxSystemChars)) {
    return `system at most ${LIMITS.maxSystemChars} characters`;
  }
  return null;
}

/** 200 → the user; anything else → null. Never throws. */
async function signedInUser(supabaseUrl, anonKey, token) {
  try {
    const r = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${token}` },
    });
    if (r.status !== 200) return null;
    const u = await r.json();
    return u?.id ? u : null;
  } catch {
    return null;
  }
}

/** Is this user active? Read with HIS token, so RLS decides what he can see. */
async function isActive(supabaseUrl, anonKey, token, userId) {
  try {
    const r = await fetch(
      `${supabaseUrl}/rest/v1/users?id=eq.${encodeURIComponent(userId)}&select=is_active`,
      { headers: { apikey: anonKey, Authorization: `Bearer ${token}`, Accept: "application/json" } },
    );
    if (!r.ok) return false;
    const rows = await r.json();
    return Array.isArray(rows) && rows.length === 1 && rows[0].is_active !== false;
  } catch {
    return false;
  }
}

export default async function handler(req, res) {
  // Only accept POST
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("[ai-assistant] ANTHROPIC_API_KEY is not set");
    return res.status(500).json({ error: "AI service not configured" });
  }
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) {
    // Fail CLOSED: without a way to check the caller, nobody gets through.
    console.error("[ai-assistant] Supabase URL / anon key not set");
    return res.status(500).json({ error: "AI service not configured" });
  }

  // ── 1. signed in ──
  const auth = req.headers?.authorization || req.headers?.Authorization || "";
  const token = /^Bearer\s+(.+)$/i.exec(auth)?.[1]?.trim();
  if (!token) return res.status(401).json({ error: "Not signed in" });
  const user = await signedInUser(supabaseUrl, anonKey, token);
  if (!user) return res.status(401).json({ error: "Not signed in" });

  // ── 2. active ──
  if (!(await isActive(supabaseUrl, anonKey, token, user.id))) {
    return res.status(403).json({ error: "Account not active" });
  }

  // ── 3. within the limits ──
  const problem = checkRequest(req.body);
  if (problem) return res.status(400).json({ error: problem });

  const { system, messages } = req.body;
  try {
    const upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: LIMITS.maxTokens,
        system: system || "",
        messages,
      }),
    });

    const data = await upstream.json();

    if (!upstream.ok) {
      // Passed through, so the panel can show the real reason (e.g. the credit
      // balance) instead of "could not connect".
      console.error("[ai-assistant] Anthropic error:", upstream.status, data);
      return res.status(upstream.status).json(data);
    }

    return res.status(200).json(data);
  } catch (err) {
    console.error("[ai-assistant] Fetch error:", err);
    return res.status(502).json({ error: "Failed to reach AI service" });
  }
}
