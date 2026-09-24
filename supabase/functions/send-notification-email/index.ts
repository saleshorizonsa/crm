// Emails the SAME alert the app has just written to public.notifications.
//
// Called fire-and-forget from src/utils/notificationEmail.js right after each
// notifications insert. It is deliberately given only the notification's
// identifying fields — never an email address — so a caller cannot use it to
// mail an arbitrary recipient: this function looks the row up with the service
// role, reads its user_id, and resolves the address from public.users.
//
// Content is not rewritten per type: subject = notification.title, body =
// notification.message, so the email can never drift from what the bell shows.
//
// Sending is best-effort by contract. Every failure path returns 200 with
// { sent: false, reason } so the caller's `await` (if any) can never surface as
// an error next to the in-app insert that already succeeded.
import { serve } from 'https://deno.land/std/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

// How long an identical alert stays "already emailed". These checks re-run on
// every login, so without this a user who signs in five times before clearing a
// stale lead would get five identical emails. The bell keeps every row; only
// the email is suppressed.
const DEDUPE_WINDOW_HOURS = 6;

// Where "View in CRM" lands, per notification type. Unknown types fall back to
// the dashboard rather than guessing a route that may not exist.
const PATH_BY_TYPE: Record<string, string> = {
  target_assigned: '/planning',
  target_changed: '/planning',
  target_change: '/planning',
  plan_deadline: '/planning',
  plan_submitted: '/planning',
  plan_approved: '/planning',
  plan_returned: '/planning',
  lead_expiring: '/sales-pipeline',
  lead_expired: '/sales-pipeline',
  lead_swept: '/planning',
  future_order: '/planning',
  bounce_back: '/sales-pipeline',
  forecast_variance: '/forecast',
  deal_reassigned: '/sales-pipeline',
  meeting: '/calendar',
};

const escapeHtml = (s: string) =>
  String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { userId, type, title, message } = await req.json();
    if (!userId || !title) return json({ sent: false, reason: 'missing userId or title' });

    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
    const FROM = Deno.env.get('NOTIFICATION_FROM_EMAIL');
    const APP_URL = (Deno.env.get('APP_URL') || '').replace(/\/$/, '');
    if (!RESEND_API_KEY || !FROM) {
      // Not configured yet: the in-app notification still stands on its own.
      return json({ sent: false, reason: 'email provider not configured' });
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } },
    );

    // The row the app just inserted — the newest match for this recipient. Read
    // from the table rather than trusting the caller's copy, so the email is
    // always the notification as stored.
    const { data: rows, error: rowErr } = await admin
      .from('notifications')
      .select('id, user_id, type, title, message, metadata, created_at')
      .eq('user_id', userId)
      .eq('title', title)
      .order('created_at', { ascending: false })
      .limit(2);
    if (rowErr) return json({ sent: false, reason: `lookup failed: ${rowErr.message}` });

    const row = rows?.[0];
    if (!row) return json({ sent: false, reason: 'notification not found' });

    // Dedupe: an identical alert already recorded inside the window means this
    // is a re-check firing again, not a new event.
    const previous = rows?.[1];
    if (previous) {
      const ageHours = (new Date(row.created_at).getTime() - new Date(previous.created_at).getTime()) / 3_600_000;
      if (ageHours < DEDUPE_WINDOW_HOURS) {
        return json({ sent: false, reason: 'deduped: identical alert within window' });
      }
    }

    // public.users is authoritative for the address: every row has one and they
    // all match auth.users (verified against the live database).
    const { data: user, error: userErr } = await admin
      .from('users')
      .select('email, full_name, is_active')
      .eq('id', row.user_id)
      .maybeSingle();
    if (userErr) return json({ sent: false, reason: `user lookup failed: ${userErr.message}` });
    if (!user?.email) return json({ sent: false, reason: 'recipient has no email' });
    if (user.is_active === false) return json({ sent: false, reason: 'recipient is deactivated' });

    const subject = row.title as string;
    const body = (row.message as string) || '';
    const link = APP_URL ? `${APP_URL}${PATH_BY_TYPE[row.type ?? type] ?? '/'}` : '';

    // One shared template for every type: title, message, link. Nothing per-type
    // to keep in step with the in-app copy.
    const html = `
      <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#111">
        <h2 style="font-size:18px;margin:0 0 12px">${escapeHtml(subject)}</h2>
        <p style="font-size:14px;line-height:1.6;margin:0 0 20px;white-space:pre-wrap">${escapeHtml(body)}</p>
        ${link ? `<a href="${escapeHtml(link)}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;font-size:14px;font-weight:600;padding:10px 18px;border-radius:8px">View in CRM</a>` : ''}
        <p style="font-size:11px;color:#888;margin-top:28px">
          Sent to ${escapeHtml(user.full_name || 'you')} because this alert was raised in the CRM.
        </p>
      </div>`;
    const text = `${subject}\n\n${body}${link ? `\n\nView in CRM: ${link}` : ''}`;

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM, to: [user.email], subject, html, text }),
    });

    if (!res.ok) {
      const detail = await res.text();
      console.error('send-notification-email: provider rejected', res.status, detail);
      return json({ sent: false, reason: `provider ${res.status}` });
    }
    const sent = await res.json();
    return json({ sent: true, id: sent?.id ?? null });
  } catch (err) {
    console.error('send-notification-email:', err);
    return json({ sent: false, reason: 'unhandled error' });
  }
});
