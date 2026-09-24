import { supabase } from 'lib/supabase';

// Emails an alert that has just been written to `notifications`.
//
// Called right after each notifications insert, never instead of one: the bell
// is the record, the email is a copy. Best-effort by contract, exactly like the
// notify() helper in utils/leadExpiryCheck.js — it catches everything and never
// throws, so an email problem can never fail, block or roll back the insert that
// already succeeded. Call sites do not await it.
//
// Only identifying fields are sent. The edge function resolves the row and the
// recipient's address itself with the service role, so no address is ever put
// on the wire from the browser and a caller cannot redirect an alert elsewhere.
//
// WHY HERE AND NOT A DATABASE TRIGGER: an AFTER INSERT trigger on notifications
// would catch every call site at once, which is the tidier shape — but it needs
// pg_net to reach the edge function, and pg_net is NOT installed in this project
// (checked on the live database: no extension, no grant migration). Nothing in
// the database inserts notifications either — every insert comes from app code —
// so a trigger's other advantage does not apply yet. That route stays open: add
// pg_net plus a trigger later and these calls can simply be deleted.
export async function sendNotificationEmail({ userId, type, title, message }) {
  if (!userId || !title) return;
  try {
    const { error } = await supabase.functions.invoke('send-notification-email', {
      body: { userId, type, title, message },
    });
    if (error) console.warn('notification email skipped:', error.message);
  } catch (err) {
    console.warn('notification email skipped:', err?.message || err);
  }
}

/** Same, for the checks that insert a batch of notifications in one call. */
export async function sendNotificationEmails(rows) {
  await Promise.all(
    (rows || []).map((r) =>
      sendNotificationEmail({
        userId: r?.user_id,
        type: r?.type,
        title: r?.title,
        message: r?.message,
      }),
    ),
  );
}
