/**
 * Google Calendar OAuth — exchanges authorization code for tokens.
 *
 * Required Supabase secrets:
 *   GOOGLE_CLIENT_ID      — from Google Cloud Console
 *   GOOGLE_CLIENT_SECRET  — from Google Cloud Console
 *   SUPABASE_URL          — automatically available
 *   SUPABASE_SERVICE_ROLE_KEY — automatically available
 *
 * The frontend redirects the user to Google's OAuth consent screen,
 * then Google redirects back to the app with ?code=xxx&state=google_calendar.
 * The frontend calls this function to exchange the code for tokens.
 */
import { serve } from 'https://deno.land/std/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ok = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { code, redirect_uri, user_id } = await req.json();
    if (!code || !redirect_uri || !user_id) {
      return ok({ error: 'Missing required fields: code, redirect_uri, user_id' });
    }

    const CLIENT_ID     = Deno.env.get('GOOGLE_CLIENT_ID');
    const CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET');
    if (!CLIENT_ID || !CLIENT_SECRET) {
      return ok({ error: 'GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET secrets are not configured.' });
    }

    // Exchange code for tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id:     CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri,
        grant_type:    'authorization_code',
      }),
    });

    const tokenData = await tokenRes.json();
    if (!tokenRes.ok || tokenData.error) {
      return ok({ error: `Token exchange failed: ${tokenData.error_description || tokenData.error}` });
    }

    const { access_token, refresh_token, expires_in } = tokenData;
    const expires_at = new Date(Date.now() + expires_in * 1000).toISOString();

    // Get user's primary calendar email
    let email = '';
    try {
      const profileRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${access_token}` },
      });
      const profile = await profileRes.json();
      email = profile.email || '';
    } catch (_) {}

    // Store in Supabase using service role (bypasses RLS)
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { error: dbErr } = await supabase
      .from('calendar_connections')
      .upsert({
        user_id,
        provider:      'google',
        access_token,
        refresh_token,
        expires_at,
        calendar_id:   'primary',
        email,
        connected_at:  new Date().toISOString(),
        updated_at:    new Date().toISOString(),
      }, { onConflict: 'user_id' });

    if (dbErr) return ok({ error: `Failed to save connection: ${dbErr.message}` });

    return ok({ success: true, email });
  } catch (err) {
    return ok({ error: `Exception: ${String(err)}` });
  }
});
