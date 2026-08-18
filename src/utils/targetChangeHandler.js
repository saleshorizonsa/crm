import { supabase } from '../lib/supabase';
import { fetchWinRate3m } from './winRate3m';

const fmtSAR = (n) => new Intl.NumberFormat('en-SA', { maximumFractionDigits: 0 }).format(Number(n) || 0);
const monthLabel = (d) => {
  try {
    return new Date(d).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  } catch {
    return '';
  }
};

// Mid-month target change: recalculate the salesman's Required Plan and notify both
// the salesman and the manager. The KPI cards / Planning bar recompute the Required
// Plan and Planned Gap on their next load (they read sales_targets live), so this
// only handles the notifications + audit trail. `winRate` may be passed in; if not,
// the salesman's 3-month rolling win rate is fetched (default 50% with no history).
export async function handleTargetChange({
  companyId,
  salesmanId,
  managerId,
  oldAmount,
  newAmount,
  planMonth,
  winRate = null,
}) {
  if (!companyId || !salesmanId) return null;
  const now = new Date();

  // Required Plan = Target ÷ Win Rate%
  let effectiveWinRate = winRate;
  if (effectiveWinRate == null) {
    const { winRate3m, total3m } = await fetchWinRate3m({ companyId, ownerIds: [salesmanId] });
    effectiveWinRate = total3m > 0 ? winRate3m : 50;
  }
  if (!(effectiveWinRate > 0)) effectiveWinRate = 50;

  const oldAmt = parseFloat(oldAmount) || 0;
  const newAmt = parseFloat(newAmount) || 0;
  const newRequiredPlan = newAmt / (effectiveWinRate / 100);
  const change = newAmt - oldAmt;
  const changeDirection = change >= 0 ? 'increased' : 'decreased';
  const changeAbs = Math.abs(change);
  const ml = monthLabel(planMonth);

  const notes = [
    {
      user_id: salesmanId,
      company_id: companyId,
      type: 'target_changed',
      title: `📊 Your Target Has Been ${changeDirection === 'increased' ? 'Increased' : 'Decreased'}`,
      message: `Your monthly target for ${ml} has been updated from ${fmtSAR(oldAmt)} SAR to ${fmtSAR(newAmt)} SAR (${change >= 0 ? '+' : '-'}${fmtSAR(changeAbs)} SAR). Your Required Plan is now ${fmtSAR(newRequiredPlan)} SAR. Please review and update your Current Sales Plan.`,
      is_read: false,
      metadata: {
        old_amount: oldAmt,
        new_amount: newAmt,
        required_plan: newRequiredPlan,
        plan_month: planMonth,
        changed_by: managerId,
      },
      created_at: now.toISOString(),
    },
  ];

  // Manager confirmation (skip if we don't know who made the change).
  if (managerId) {
    const { data: salesman } = await supabase
      .from('users')
      .select('full_name')
      .eq('id', salesmanId)
      .single();
    notes.push({
      user_id: managerId,
      company_id: companyId,
      type: 'target_changed_confirm',
      title: '✅ Target Updated',
      message: `${salesman?.full_name || 'The salesman'}'s target for ${ml} updated to ${fmtSAR(newAmt)} SAR. New Required Plan: ${fmtSAR(newRequiredPlan)} SAR.`,
      is_read: false,
      metadata: {
        salesman_id: salesmanId,
        old_amount: oldAmt,
        new_amount: newAmt,
        required_plan: newRequiredPlan,
        plan_month: planMonth,
      },
      created_at: now.toISOString(),
    });
  }

  try {
    await supabase.from('notifications').insert(notes);
  } catch (_) { /* notifications are best-effort */ }

  // Audit trail — best-effort; the table may not exist yet.
  try {
    await supabase.from('escalation_logs').insert({
      company_id: companyId,
      trigger_type: 'mid_month_target_change',
      triggered_for: salesmanId,
      triggered_by: managerId,
      details: {
        old_amount: oldAmt,
        new_amount: newAmt,
        change,
        required_plan: newRequiredPlan,
        plan_month: planMonth,
        win_rate: effectiveWinRate,
      },
      created_at: now.toISOString(),
    });
  } catch (_) { /* audit table optional */ }

  return { newRequiredPlan, change, changeDirection };
}
