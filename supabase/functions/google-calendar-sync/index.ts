/**
 * Google Calendar Sync — creates/updates/deletes events on Google Calendar.
 *
 * Required Supabase secrets:
 *   GOOGLE_CLIENT_ID
 *   GOOGLE_CLIENT_SECRET
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Body: { action: 'upsert' | 'delete', meeting_id: string, user_id: string }
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

async function refreshTokenIfNeeded(
  supabase: ReturnType<typeof createClient>,
  conn: Record<string, string>
): Promise<string> {
  const expiresAt = new Date(conn.expires_at);
  if (expiresAt > new Date(Date.now() + 60000)) return conn.access_token;

  const CLIENT_ID     = Deno.env.get('GOOGLE_CLIENT_ID')!;
  const CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET')!;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: conn.refresh_token,
      grant_type:    'refresh_token',
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Token refresh failed: ${data.error}`);

  const newExpiry = new Date(Date.now() + data.expires_in * 1000).toISOString();
  await supabase
    .from('calendar_connections')
    .update({ access_token: data.access_token, expires_at: newExpiry, updated_at: new Date().toISOString() })
    .eq('user_id', conn.user_id);

  return data.access_token;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { action, meeting_id, user_id } = await req.json();

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Fetch calendar connection
    const { data: conn } = await supabase
      .from('calendar_connections')
      .select('*')
      .eq('user_id', user_id)
      .eq('provider', 'google')
      .maybeSingle();

    if (!conn) return ok({ error: 'Google Calendar not connected for this user.' });

    const accessToken = await refreshTokenIfNeeded(supabase, conn);
    const calendarId  = conn.calendar_id || 'primary';

    // Fetch meeting with relations
    const { data: meeting } = await supabase
      .from('meetings')
      .select('*, contact:contacts!contact_id(first_name, last_name, email), deal:deals!deal_id(title)')
      .eq('id', meeting_id)
      .single();

    if (!meeting) return ok({ error: 'Meeting not found.' });

    if (action === 'delete') {
      if (!meeting.google_event_id) return ok({ success: true, skipped: true });
      const delRes = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/${meeting.google_event_id}`,
        { method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (!delRes.ok && delRes.status !== 404) {
        const err = await delRes.text();
        return ok({ error: `Delete failed: ${err}` });
      }
      await supabase.from('meetings').update({ google_event_id: null }).eq('id', meeting_id);
      return ok({ success: true });
    }

    // Build Google Calendar event body
    const attendees = [];
    if (meeting.contact?.email) {
      attendees.push({ email: meeting.contact.email, displayName: `${meeting.contact.first_name} ${meeting.contact.last_name}` });
    }

    const eventBody = {
      summary:     meeting.title,
      description: [
        meeting.description || '',
        meeting.deal ? `Deal: ${meeting.deal.title}` : '',
        meeting.notes || '',
      ].filter(Boolean).join('\n\n'),
      location:    meeting.location || '',
      start:       { dateTime: meeting.start_time, timeZone: 'Asia/Riyadh' },
      end:         { dateTime: meeting.end_time,   timeZone: 'Asia/Riyadh' },
      attendees,
      reminders:   meeting.reminder_minutes > 0
        ? { useDefault: false, overrides: [{ method: 'popup', minutes: meeting.reminder_minutes }] }
        : { useDefault: false, overrides: [] },
    };
    if (meeting.meeting_url) {
      (eventBody as Record<string, unknown>).conferenceData = undefined;
      (eventBody as Record<string, unknown>).description += `\n\nVideo: ${meeting.meeting_url}`;
    }

    let googleEventId = meeting.google_event_id;
    let gcalRes: Response;

    if (googleEventId) {
      gcalRes = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/${googleEventId}`,
        {
          method:  'PUT',
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body:    JSON.stringify(eventBody),
        }
      );
    } else {
      gcalRes = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events`,
        {
          method:  'POST',
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body:    JSON.stringify(eventBody),
        }
      );
    }

    const gcalData = await gcalRes.json();
    if (!gcalRes.ok) return ok({ error: `Google Calendar error: ${gcalData.error?.message}` });

    googleEventId = gcalData.id;
    await supabase.from('meetings').update({ google_event_id: googleEventId }).eq('id', meeting_id);

    return ok({ success: true, google_event_id: googleEventId });
  } catch (err) {
    return ok({ error: `Exception: ${String(err)}` });
  }
});
