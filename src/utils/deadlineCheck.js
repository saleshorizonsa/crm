import { supabase } from '../lib/supabase';

// Plan-submission deadline = the 25th of each month. After the 25th, any active
// salesman/supervisor who hasn't submitted their plan is flagged, and both they
// and their direct manager are notified. Idempotent and safe to run on every
// login: it skips anyone already submitted or already flagged.
//
// `companyId` scopes the sweep; the actor id/role are accepted for symmetry with
// the caller but aren't needed (the sweep covers the whole company's contributors).
export async function checkPlanDeadlines(companyId, _actorId, _role) {
  if (!companyId) return;

  const now = new Date();
  if (now.getDate() <= 25) return; // nothing to flag before the deadline passes

  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const planMonth = `${y}-${m}-01`;
  const deadlineDate = `${y}-${m}-25`;
  const monthLabel = now.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

  try {
    const { data: contributors } = await supabase
      .from('users')
      .select('id, full_name, role, reports_to')
      .eq('company_id', companyId)
      .eq('is_active', true)
      .in('role', ['salesman', 'supervisor']);
    if (!contributors?.length) return;

    // One read for the whole month, then only touch the ones still missing.
    const { data: subs } = await supabase
      .from('plan_submissions')
      .select('owner_id, is_submitted, flagged')
      .eq('company_id', companyId)
      .eq('plan_month', planMonth);
    const subMap = {};
    (subs || []).forEach((s) => { subMap[s.owner_id] = s; });

    for (const person of contributors) {
      const sub = subMap[person.id];
      if (sub?.is_submitted || sub?.flagged) continue; // already fine or already flagged

      const { error: upErr } = await supabase
        .from('plan_submissions')
        .upsert(
          {
            company_id: companyId,
            owner_id: person.id,
            plan_month: planMonth,
            is_submitted: false,
            is_late: true,
            deadline_date: deadlineDate,
            flagged: true,
            flagged_at: now.toISOString(),
            updated_at: now.toISOString(),
          },
          { onConflict: 'company_id,owner_id,plan_month' },
        );
      if (upErr) { console.error('flag plan:', upErr); continue; }

      // Notify the direct manager (if any) and the salesman. Best-effort.
      const notes = [];
      if (person.reports_to) {
        notes.push({
          user_id: person.reports_to,
          company_id: companyId,
          type: 'plan_deadline_missed',
          title: '🚩 Plan Not Submitted',
          message: `${person.full_name} has not submitted their ${monthLabel} sales plan. The deadline was the 25th. Please interview before the month starts.`,
          is_read: false,
          metadata: { owner_id: person.id, plan_month: planMonth },
        });
      }
      notes.push({
        user_id: person.id,
        company_id: companyId,
        type: 'plan_overdue',
        title: '🚨 Your Sales Plan is Overdue',
        message: `Your ${monthLabel} sales plan was due on the 25th and has not been submitted. Please submit immediately and contact your manager.`,
        is_read: false,
        metadata: { plan_month: planMonth },
      });
      try {
        await supabase.from('notifications').insert(notes);
      } catch (_) { /* notifications are best-effort */ }
    }
  } catch (err) {
    console.error('checkPlanDeadlines:', err);
  }
}
