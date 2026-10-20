// Load every row of a list query, not just the first page.
//
// PostgREST returns at most 1,000 rows per request (the project's max-rows),
// and says nothing when it stops: a list of 4,268 products simply came back
// as 1,000. Lists that must be complete page through with .range() here.
//
//   const { data, error, count } = await fetchAllRows(() =>
//     supabase.from('products').select('*', { count: 'exact' })
//       .eq('company_id', id).order('material'));
//
// makeQuery must build a FRESH query each call (a builder cannot be reused
// after it has been awaited). Ask for { count: 'exact' } so the loop knows the
// true total; it then keeps going even if the server's cap is below the page
// size. An `id` order is appended as a tie-break so rows with equal sort keys
// cannot move between pages (and be skipped or loaded twice).
//
// A failed page returns { data: null, error } — never a silently short list.

export const PAGE_SIZE = 1000;

export async function fetchAllRows(makeQuery, { pageSize = PAGE_SIZE, tiebreak = 'id' } = {}) {
  const rows = [];
  let total = null;
  for (let from = 0; ; ) {
    let q = makeQuery();
    if (tiebreak) q = q.order(tiebreak, { ascending: true });
    const { data, error, count } = await q.range(from, from + pageSize - 1);
    if (error) return { data: null, error, count: null };
    if (total === null && typeof count === 'number') total = count;
    const page = data || [];
    rows.push(...page);
    from += page.length;
    if (page.length === 0) break;
    if (total !== null ? rows.length >= total : page.length < pageSize) break;
  }
  return { data: rows, error: null, count: total ?? rows.length };
}
