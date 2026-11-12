import { supabase } from 'lib/supabase';
import { ACCESS_PAGES, roleAllows } from 'utils/pageAccess';

/**
 * Reads and writes of user_page_permissions for the admin screen (session 35).
 *
 * STORAGE: one row per (user, company, page) that is HIDDEN, can_view = false.
 * "Visible" is stored as NO ROW, which is also what every user has today —
 * so showing a page deletes its row rather than writing can_view = true, and
 * a user nobody has touched never gets rows at all.
 *
 * can_create / can_edit are left to their column defaults: nothing reads them.
 */
const KNOWN = new Set(ACCESS_PAGES.map((p) => p.key));

/** Every hidden-page row of a company: { user_id, page }[]. */
export async function fetchCompanyHidden(companyId) {
  const { data, error } = await supabase
    .from('user_page_permissions')
    .select('user_id, page, can_view')
    .eq('company_id', companyId);
  if (error) return { rows: [], error };
  return { rows: (data || []).filter((r) => r.can_view === false && KNOWN.has(r.page)), error: null };
}

/**
 * One user's hidden pages, replaced as a whole. Only pages the user's role can
 * see are written — a hidden flag on a page the role never had is meaningless.
 */
export async function saveUserHidden({ userId, companyId, role, hiddenKeys }) {
  const keep = [...new Set(hiddenKeys || [])].filter((k) => KNOWN.has(k) && roleAllows(k, role));
  const { error: delError } = await supabase
    .from('user_page_permissions')
    .delete()
    .eq('user_id', userId)
    .eq('company_id', companyId);
  if (delError) return { error: delError };
  if (!keep.length) return { error: null, written: 0 };
  const { error } = await supabase.from('user_page_permissions').insert(
    keep.map((page) => ({ user_id: userId, company_id: companyId, page, can_view: false })),
  );
  return { error, written: error ? 0 : keep.length };
}

/**
 * HIDE FOR ALL USERS: a hidden row for every user in the company whose role
 * can see the page. Upserted on the table's unique (user_id, company_id, page).
 */
export async function hidePageForAll({ companyId, pageKey, users }) {
  const targets = (users || []).filter((u) => roleAllows(pageKey, u.role));
  if (!targets.length) return { error: null, written: 0 };
  const { error } = await supabase.from('user_page_permissions').upsert(
    targets.map((u) => ({ user_id: u.id, company_id: companyId, page: pageKey, can_view: false })),
    { onConflict: 'user_id,company_id,page' },
  );
  return { error, written: error ? 0 : targets.length };
}

/** SHOW FOR ALL USERS: every row for that page in the company goes. */
export async function showPageForAll({ companyId, pageKey }) {
  const { error } = await supabase
    .from('user_page_permissions')
    .delete()
    .eq('company_id', companyId)
    .eq('page', pageKey);
  return { error };
}
