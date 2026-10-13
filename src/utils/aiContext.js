import { supabase } from 'lib/supabase';
import { fetchInsightsRaw } from 'utils/insightsData';
import { calcDivisionMetrics, conversionLabel, MEMBER_ROLES, EXPECTED_PCT_LABEL } from 'utils/salesDivisionMetrics';
import { statusChipOf } from 'pages/sales-divisions/components/DivisionCoverageHero';
import { fetchSubmissionPlanned } from 'utils/planningPageSummary';
import { fetchPlanContacts, summarisePlanContacts } from 'utils/planContacts';
import { PLAN_STATUS } from 'utils/teamPlanBoard';
import { riyadhMonthKeyOf, monthBoundsOf, monthLabelOf } from 'utils/planMonths';
import { riyadhToday } from 'utils/visits';

/**
 * WHAT THE AI ASSISTANT KNOWS — the signed-in user's own figures.
 *
 * Read in the browser, under the user's own login and RLS, through the SAME
 * loader Insights uses (utils/insightsData.js) and the same metrics
 * (calcDivisionMetrics) — so every figure here is the one his Insights page
 * shows for this month. Nothing is defined here: it formats.
 *
 * No phone numbers, emails or notes leave the browser: deals carry the
 * customer's name only.
 *
 * The text is kept under MAX_CHARS; the deals list is what gives way.
 */
export const MAX_CHARS = 6000;
export const OPEN_STAGES = ['lead', 'contact_made', 'proposal_sent', 'negotiation'];
const STAGE_NAME = {
  lead: 'lead', contact_made: 'contact made', proposal_sent: 'proposal sent', negotiation: 'negotiation', won: 'won', lost: 'lost',
};
const COMPANY_ROLES = ['manager', 'director', 'head', 'admin'];
const sar = (v) => Math.round(Number(v) || 0).toLocaleString('en-US');
const pct = (v, d = 0) => (v == null || !Number.isFinite(Number(v)) ? '—' : `${Number(v).toFixed(d)}%`);
const shortDate = (ymd) => {
  if (!ymd) return 'no date';
  const [y, m, d] = String(ymd).slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
};
const amt = (d) => parseFloat(d?.amount) || 0;
const customerOf = (d) => d?.contacts?.company_name
  || [d?.contacts?.first_name, d?.contacts?.last_name].filter(Boolean).join(' ') || d?.title || 'Unnamed customer';

export function scopeLabelFor(role) {
  if (role === 'salesman') return 'your figures';
  if (role === 'supervisor') return 'you and your team';
  if (COMPANY_ROLES.includes(role)) return 'company';
  return 'your figures';
}

/**
 * @returns {Promise<{ text: string, figures: object }>}
 *   figures: the numbers the text was written from, for tests to compare
 *   against the Insights page.
 */
export async function buildAiContext({ companyId, companyName, userId, userName, role, now = new Date() }) {
  const planMonth = riyadhMonthKeyOf(now);
  const { start, end } = monthBoundsOf(planMonth);
  const today = riyadhToday(now);

  const { raw } = await fetchInsightsRaw({
    companyId, userId, role, rangeStart: start, rangeEnd: end, isCurrentMonth: true, isAllTime: false,
  });
  const scopeIds = raw.scopeIds || [];
  const users = raw.users || [];
  const active = users.filter((u) => u.is_active !== false);
  const activeIds = active.map((u) => u.id);
  // People who have left are never named: their deals stay visible (they may
  // need reassigning) under "No longer active".
  const nameOf = (id) => {
    const u = users.find((x) => x.id === id);
    if (u?.is_active === false) return 'No longer active';
    return u?.full_name || 'Unknown';
  };
  const m = calcDivisionMetrics(scopeIds, { ...raw, divisionId: null });
  const chip = statusChipOf(m);

  // ── funnel by stage: the rows behind the funnel figure ──
  const funnelRows = m.drill?.funnelRows || [];
  const byStage = OPEN_STAGES.map((s) => {
    const rows = funnelRows.filter((d) => d.stage === s);
    return { stage: s, count: rows.length, value: rows.reduce((t, d) => t + amt(d), 0) };
  });
  const wni = m.drill?.wonNotInvoicedRows || [];

  // ── overdue and undated: every open deal in scope ──
  const open = (raw.deals || []).filter((d) => OPEN_STAGES.includes(d.stage));
  const overdue = open.filter((d) => d.expected_close_date && String(d.expected_close_date).slice(0, 10) < today);
  const undated = open.filter((d) => !d.expected_close_date);

  // ── plan ──
  const [sub, own, contacts] = await Promise.all([
    fetchSubmissionPlanned({ companyId, ownerIds: activeIds, start, end }),
    supabase.from('plan_submissions').select('owner_id, is_submitted, approval_status')
      .eq('company_id', companyId).eq('plan_month', planMonth).in('owner_id', activeIds.length ? activeIds : [userId]),
    fetchPlanContacts({ companyId, ownerIds: activeIds, start, end }),
  ]);
  const statusOf = (r) => (!r || !r.is_submitted ? PLAN_STATUS.none : PLAN_STATUS[r.approval_status] || PLAN_STATUS.pending);
  const subs = new Map((own.data || []).map((r) => [r.owner_id, r]));
  const myStatus = statusOf(subs.get(userId));
  const planTeam = active.filter((u) => MEMBER_ROLES.includes(u.role));
  const teamStatus = {};
  planTeam.forEach((u) => { const s = statusOf(subs.get(u.id)); teamStatus[s] = (teamStatus[s] || 0) + 1; });
  const pc = [...summarisePlanContacts(contacts.rows || []).values()]
    .reduce((t, p) => ({ customers: t.customers + p.customers, contacted: t.contacted + p.contacted }), { customers: 0, contacted: 0 });

  // ── per person (supervisor and above; active people only) ──
  const people = role === 'salesman' ? [] : planTeam
    .map((u) => ({ u, pm: calcDivisionMetrics([u.id], { ...raw, divisionId: null }) }))
    .filter(({ pm }) => pm.target > 0 || pm.achieved !== 0)
    .sort((a, b) => b.pm.target - a.pm.target);

  // ── deals most worth action ──
  const daysSince = (d) => {
    const at = d.stage_changed_at || d.created_at;
    return at ? Math.max(0, Math.floor((now - new Date(at)) / 86400000)) : null;
  };
  const seen = new Set();
  const pick = (list, why) => list.filter((d) => !seen.has(d.id)).map((d) => { seen.add(d.id); return { d, why }; });
  const actions = [
    ...pick([...overdue].sort((a, b) => amt(b) - amt(a)), 'overdue'),
    ...pick([...wni].sort((a, b) => amt(b) - amt(a)), 'won, not invoiced'),
    ...pick([...open].sort((a, b) => amt(b) - amt(a)), 'large open'),
  ].slice(0, 15);

  // ── the text ──
  const lines = [];
  lines.push(`CRM DATA for ${userName || 'the user'} (${role}) at ${companyName || 'the company'} — read ${shortDate(today)} ${today.slice(0, 4)}, Riyadh time.`);
  lines.push(`Scope: ${scopeLabelFor(role)}${role === 'salesman' ? '' : ` — ${active.filter((u) => scopeIds.includes(u.id) && MEMBER_ROLES.includes(u.role)).length} active people`}.`);
  lines.push(`Period: ${monthLabelOf(planMonth)}, day ${m.dayOfMonth} of ${m.totalDays} (${pct((m.elapsed || 0) * 100)} elapsed). Amounts in SAR.`);
  lines.push(`TOTALS: Target ${sar(m.target)} | Achieved ${sar(m.achieved)} | Gap to target ${sar(m.deficit)} | ${EXPECTED_PCT_LABEL} ${pct((m.covRatio || 0) * 100)} | Status ${chip?.text || '—'} | ${conversionLabel(m)} ${pct(m.winRatePct)} | Pace: achieved ${pct((m.pace || 0) * 100, 1)} of target vs ${pct((m.elapsed || 0) * 100)} of the month.`);
  lines.push(`FUNNEL due this month or undated (${sar(m.monthFunnel)}): ${byStage.map((s) => `${STAGE_NAME[s.stage]} ${s.count} deals ${sar(s.value)}`).join('; ')}. Won, not invoiced: ${wni.length} deals ${sar(wni.reduce((t, d) => t + amt(d), 0))}.`);
  lines.push(`OPEN DEALS: overdue (expected close passed) ${overdue.length} deals ${sar(overdue.reduce((t, d) => t + amt(d), 0))}; no expected close date ${undated.length} deals ${sar(undated.reduce((t, d) => t + amt(d), 0))}.`);
  lines.push(`PLAN ${monthLabelOf(planMonth)}: open items ${sar(sub.open)} | converted to deals ${sar(sub.converted)} | New pipeline needed ${sar(m.plannedGap)} | Your plan: ${myStatus}${role === 'salesman' ? '' : ` | Team plans: ${Object.entries(teamStatus).map(([k, n]) => `${n} ${k}`).join(', ') || 'none'}`}.`);
  lines.push(`PLAN CUSTOMERS this month: contacted ${pc.contacted} of ${pc.customers} (a visit, call, WhatsApp or meeting by the plan's owner).`);
  if (people.length) {
    lines.push('BY PERSON (active):');
    people.forEach(({ u, pm }) => lines.push(`- ${u.full_name}: target ${sar(pm.target)}, achieved ${sar(pm.achieved)}, gap ${sar(pm.deficit)}, ${pct((pm.covRatio || 0) * 100)} expected, status ${statusChipOf(pm)?.text || '—'}`));
  }
  const header = lines.join('\n');
  const dealLines = actions.map(({ d, why }) => `- [${why}] ${customerOf(d)} — ${nameOf(d.owner_id)} — ${STAGE_NAME[d.stage] || d.stage} — ${sar(amt(d))} — close ${shortDate(d.expected_close_date)} — ${daysSince(d) ?? '?'} days in stage`);
  let text = `${header}\nDEALS MOST WORTH ACTION:\n${dealLines.join('\n') || '- none'}`;
  while (text.length > MAX_CHARS && dealLines.length) {
    dealLines.pop();
    text = `${header}\nDEALS MOST WORTH ACTION (shortened):\n${dealLines.join('\n') || '- none'}`;
  }

  return {
    text,
    figures: {
      target: m.target,
      achieved: m.achieved,
      deficit: m.deficit,
      monthFunnel: m.monthFunnel,
      byStage,
      people: people.map(({ u }) => u.full_name),
      dealOwners: [...new Set(actions.map(({ d }) => nameOf(d.owner_id)))],
      planCustomers: pc,
    },
  };
}
