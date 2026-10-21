// The same-origin AI proxy (/api/ai-assistant), from the browser.
//
// The endpoint answers signed-in users only, so every call carries the
// Supabase access token. aiConfigured() asks it whether it is configured at
// all (GET), once per session, so AI panels can stay hidden instead of
// showing an error on a deployment without the key.
import { supabase } from 'lib/supabase';

let configuredPromise = null;

export function aiConfigured() {
  if (!configuredPromise) {
    configuredPromise = fetch('/api/ai-assistant', { method: 'GET' })
      .then((r) => (r.ok ? r.json() : { configured: false }))
      .then((j) => j?.configured === true)
      .catch(() => false);
  }
  return configuredPromise;
}

/** For tests. */
export function resetAiConfigured() { configuredPromise = null; }

export async function aiPost(body, { signal } = {}) {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  return fetch('/api/ai-assistant', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
    signal,
  });
}
