# Email notifications — what still needs setting up

The code is complete and deployed to the preview, but **no email can be sent
until the three manual steps below are done**. Until then the edge function
returns `{ sent: false, reason: "email provider not configured" }` and the app
carries on exactly as before: the bell notification is still written, and
nothing fails.

## 1. Resend account + API key

[resend.com](https://resend.com) — free tier is 3,000 emails/month, 100/day,
which covers this comfortably (JASCO PVC raises on the order of tens of alerts a
day). Chosen because it needs no SDK, no SMTP credentials and no extra
infrastructure: one HTTPS POST from the edge function, which is all a Deno
function can do cheaply.

## 2. Verify a sending domain

Resend → Domains → Add Domain, then add the DNS records it gives you (DKIM,
SPF, and usually a return-path CNAME) at whoever hosts `jascopvc.com`.

- Until a domain is verified, Resend only delivers to the address that owns the
  account, so a test will "succeed" while nobody else receives anything.
- Send **from** a real address on the verified domain, e.g.
  `CRM Alerts <crm@jascopvc.com>`. Sending as `gmail.com` or any domain you do
  not control will be rejected or land in spam.
- Verification is usually minutes, but DNS can take up to 24 hours.

## 3. Set the secrets on Supabase

```bash
supabase secrets set RESEND_API_KEY=re_xxxxxxxxxxxxxxxx
supabase secrets set NOTIFICATION_FROM_EMAIL="CRM Alerts <crm@jascopvc.com>"
supabase secrets set APP_URL=https://crmhorizon.vercel.app
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected by the platform —
do not set them, and never put any of these in `.env`, in the repo, or anywhere
the browser can read them. `APP_URL` only builds the "View in CRM" link.

## 4. Deploy the edge function

Not deployed yet — deploying is a production change, so it is left for you to
run (or ask me and I will):

```bash
supabase functions deploy send-notification-email
```

## Then test it

1. Set your own address on a test user in `users.email`.
2. Trigger one alert — the simplest is a target assignment (Admin → Sales
   Targets → assign a target to that user), which writes a notification
   immediately.
3. Check the bell shows it, then check the inbox. If nothing arrives:
   Supabase → Edge Functions → `send-notification-email` → Logs shows the
   reason (`provider 4xx`, `recipient has no email`, `deduped…`).

## How it behaves

- **Recipient**: exactly the person on `notifications.user_id`. No manager CC.
- **Content**: subject is the notification's `title`, body is its `message`,
  plus a "View in CRM" button. One shared template for every type, so the email
  cannot drift from the bell.
- **Best-effort**: every failure path returns 200 with a reason. An email
  problem can never block or roll back the in-app insert.
- **No address leaves the browser**: the app sends only `userId/type/title/
  message`; the function resolves the row and the address itself with the
  service role.
- **Flood guard**: these checks re-run on every login, so an identical alert
  (same recipient and title) already recorded within 6 hours is not emailed
  again. The bell still keeps every row.
- **Deactivated users** are skipped.

## Why the app calls the function instead of a database trigger

The brief suggested an `AFTER INSERT` trigger on `notifications` calling the
function through `pg_net`. That is the tidier shape, but:

- **`pg_net` is not installed in this project** — checked on the live database:
  no extension, and no grant migration. It would have to be installed first.
- **Nothing in the database inserts notifications.** Every insert comes from app
  code (11 sites), so a trigger's main advantage — catching writes the app
  cannot see — does not apply here.

So the call sits next to each insert: no schema change, no new database
dependency, and the same fire-and-forget contract the existing `notify()`
helpers already use. If notifications ever start being written by SQL, add
`pg_net` plus the trigger and delete these calls — the function takes the same
payload either way.
