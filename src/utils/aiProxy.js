import { supabase } from 'lib/supabase';

/**
 * THE ONE WAY THE BROWSER TALKS TO /api/ai-assistant.
 *
 * Sends the signed-in user's Supabase access token, which the proxy checks
 * before it spends anything (api/ai-assistant.js). Used by the AI assistant
 * panel and the forecast summary, so both get the same lock and the same
 * plain-language errors.
 *
 * Throws an Error whose .message is ready to show the user, and whose .status
 * is the HTTP status (0 when the request never got an answer).
 */
export function aiErrorMessage(status, body) {
  if (status === 401) return 'Please sign in again.';
  if (status === 403) return 'Your account is not active, so the AI assistant is not available.';
  if (status === 429) {
    return body?.error === 'daily_limit'
      ? 'Daily AI limit reached. Please try again tomorrow.'
      : 'Daily AI limit reached, or the AI service is busy. Please try again later.';
  }
  // The proxy's own 400 carries a string; Anthropic's (e.g. the credit
  // balance) carries an object and falls through to its real reason below.
  if (status === 400 && typeof body?.error === 'string') return `The request was too long or malformed: ${body.error}`;
  if (status === 500 && body?.error === 'AI service not configured') return 'AI Assistant not configured. Contact your administrator.';
  // Anthropic's own reason, e.g. "Your credit balance is too low…".
  const reason = body?.error?.message || (typeof body?.error === 'string' ? body.error : null);
  if (reason) return `AI service error: ${reason}`;
  return status ? `AI service error (HTTP ${status}).` : 'Could not reach the AI service. Check your connection and try again.';
}

export async function callAiProxy({ system, messages, signal } = {}) {
  let token = null;
  try {
    const { data } = await supabase.auth.getSession();
    token = data?.session?.access_token || null;
  } catch { /* no session — the proxy answers 401, which says so */ }

  let response;
  try {
    response = await fetch('/api/ai-assistant', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ system, messages }),
      signal,
    });
  } catch (e) {
    if (e?.name === 'AbortError') throw e;
    const err = new Error(aiErrorMessage(0, null));
    err.status = 0;
    throw err;
  }

  let body = {};
  try { body = await response.json(); } catch { /* not JSON */ }
  if (!response.ok) {
    console.error('[aiProxy]', response.status, body);
    const err = new Error(aiErrorMessage(response.status, body));
    err.status = response.status;
    throw err;
  }
  return body;
}
