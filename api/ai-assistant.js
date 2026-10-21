// Vercel serverless proxy — keeps the API key server-side and avoids CORS.
//
// The key MUST NOT be named with a VITE_ prefix. Vite treats VITE_* as
// client-safe and inlines it into the public browser bundle; src/lib/supabase.js
// dereferences import.meta.env with optional chaining, which makes Vite emit the
// whole env object, so a VITE_-prefixed secret is published to every visitor.
// That is exactly how the previous key leaked (revoked 2026-09-08).
// Server-only secrets are read from process.env with no prefix.
//
// SIGNED-IN USERS ONLY (2026-10-21). This endpoint used to answer anyone who
// found the URL, spending the API key for them. Like admin-update-user.js, it
// now verifies the caller's Supabase access token (Authorization: Bearer ...)
// with Supabase itself before calling Anthropic.
//
// GET reports whether the service is configured, so the app can hide its AI
// panels instead of showing an error: { configured: boolean }. It reveals no
// key and costs nothing.
import { createClient } from "@supabase/supabase-js";

function supabaseFor() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    || process.env.SUPABASE_ANON_KEY
    || process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export default async function handler(req, res) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const supa = supabaseFor();

  if (req.method === "GET") {
    return res.status(200).json({ configured: !!apiKey && !!supa });
  }
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!apiKey || !supa) {
    console.error("[ai-assistant] ANTHROPIC_API_KEY or the Supabase URL/key is not set");
    return res.status(500).json({ error: "AI service not configured" });
  }

  const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    return res.status(401).json({ error: "You are not signed in." });
  }
  const { data: authData, error: authError } = await supa.auth.getUser(token);
  if (authError || !authData?.user?.id) {
    return res.status(401).json({ error: "Your session has expired. Please sign in again." });
  }

  const { system, messages } = req.body || {};
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: "messages array is required" });
  }

  try {
    const upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 500,
        system: system || "",
        messages,
      }),
    });

    const data = await upstream.json();

    if (!upstream.ok) {
      console.error("[ai-assistant] Anthropic error:", upstream.status, data);
      return res.status(upstream.status).json(data);
    }

    return res.status(200).json(data);
  } catch (err) {
    console.error("[ai-assistant] Fetch error:", err);
    return res.status(500).json({ error: "Failed to reach AI service" });
  }
}
