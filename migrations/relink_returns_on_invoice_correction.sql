-- ============================================================================
-- NOT APPLIED to production
-- ============================================================================
--
-- Lets a corrected invoice number actually rescue the credit notes it was
-- hiding, for the people who do the correcting.
--
-- THE GAP. deal_returns.deal_id is how a return reduces Achieved, and a return
-- can only find its deal BY invoice number. 42 invoiced JASCO PVC deals since
-- 1 August 2026 carry a number no return can match ("11", "gg",
-- "INVOICE: 93002807"), so their credit notes sit in deal_returns with
-- deal_id NULL. Correcting the number in the pipeline re-runs the match
-- (dealService.relinkReturnsForDeal), but the live deal_returns UPDATE policy
-- allows role = 'admin' ONLY — not director, not head, and certainly not the
-- salesman or the supervisor who know what the real invoice number is. Without
-- this function their correction saves the number and links nothing, and the
-- application says so rather than claiming otherwise.
--
-- A re-import does not fix it either: the importer upserts with
-- ignoreDuplicates on (company, credit note, invoice, item), so a row already
-- stored is skipped — deal_id and all.
--
-- WHY SECURITY DEFINER, AND WHAT KEEPS IT SAFE
--   • It takes ONE argument, a deal id. No company, no user, no row ids, no
--     invoice text: nothing the caller supplies can widen what is touched.
--   • It decides permission itself, from auth.uid(), by the SAME rule the UI
--     shows the action by (src/utils/teamHierarchy.js canCorrectInvoice): the
--     deal's owner, anyone ABOVE him in the supervisor_id chain, or
--     admin/director/head of that deal's company. Anyone else gets an
--     exception, not a zero.
--   • The company is read from the DEAL, so a caller cannot reach across
--     companies even with a valid deal id from another one.
--   • It writes exactly one column, deal_id, on rows that are NULL now and
--     match exactly one invoiced deal — the one asked about.
--   • search_path is pinned, EXECUTE is revoked from public and anon, and every
--     call to the helper is schema-qualified, so nothing in the body can be
--     resolved to an object someone else created.
--   • Every row it links is recorded in deal_return_relink_log, which is what
--     makes the rollback exact rather than a guess.
--
-- WHAT IT DOES NOT DO. It never re-points a return that is already matched
-- (deal_id IS NULL only, re-checked inside the UPDATE), never touches deals,
-- never guesses: a return whose invoice is ALSO carried by another invoiced
-- deal is left unlinked and counted as `ambiguous`, which is the importer's
-- rule exactly.
--
-- ORDER OF OPERATIONS
--   1. Run PREVIEW for the deal you are about to correct. It changes nothing.
--   2. Run CREATE. The application calls the function on its own after that,
--      and falls back to a plain UPDATE (admin only) while it does not exist,
--      so applying this is safe at any time.
--   3. Run VERIFY.
--   4. ROLLBACK only if needed.
-- ============================================================================


-- ── 1. PREVIEW (read-only) ──────────────────────────────────────────────────
-- Every unmatched return in the company, and how many invoiced deals its
-- invoice number reaches: 0 = nobody has entered that number, 1 = it will be
-- linked, more than 1 = ambiguous and left alone.
--
-- The parse rule is restated inline here so the preview can be run BEFORE the
-- function in section 2 exists. utils/invoiceNumber.js is the original: strip
-- labels (INVOICE / INV / BILL / #), split on / , ; & + | \ or whitespace, keep
-- the digits of each token, accept 8-10 digits with at least one non-zero,
-- left-pad to 10. 'PRE-CRM-…' placeholders parse to nothing.
--
-- EDIT THE COMPANY ID. JASCO PVC is 'adf8ee78-cf78-4f02-932c-989a214bdd78'.
WITH nums AS (
  SELECT
    'return'::text AS kind, r.id, r.company_id, r.invoice_no AS raw,
    r.return_date, r.return_amount, r.customer_name, NULL::uuid AS owner_id,
    (
      SELECT array_agg(DISTINCT lpad(tok, 10, '0'))
      FROM (
        SELECT regexp_replace(t, '\D', '', 'g') AS tok
        FROM regexp_split_to_table(
               regexp_replace(COALESCE(r.invoice_no, ''),
                 '\y(invoice|inv|bill)\y\s*(no\.?|number|#)?\s*[:.#-]*', ' ', 'gi'),
               '[/,;&+|\\]+|\s+') AS s(t)
      ) k
      WHERE length(tok) BETWEEN 8 AND 10 AND tok ~ '[1-9]'
        AND COALESCE(r.invoice_no, '') !~* '^\s*pre[-_ ]?crm'
    ) AS parsed
  FROM deal_returns r
  WHERE r.company_id = 'adf8ee78-cf78-4f02-932c-989a214bdd78'
    AND r.deal_id IS NULL

  UNION ALL

  SELECT
    'deal'::text, d.id, d.company_id, d.invoice_number,
    d.invoice_date, COALESCE(d.final_amount, d.amount), d.title, d.owner_id,
    (
      SELECT array_agg(DISTINCT lpad(tok, 10, '0'))
      FROM (
        SELECT regexp_replace(t, '\D', '', 'g') AS tok
        FROM regexp_split_to_table(
               regexp_replace(COALESCE(d.invoice_number, ''),
                 '\y(invoice|inv|bill)\y\s*(no\.?|number|#)?\s*[:.#-]*', ' ', 'gi'),
               '[/,;&+|\\]+|\s+') AS s(t)
      ) k
      WHERE length(tok) BETWEEN 8 AND 10 AND tok ~ '[1-9]'
        AND COALESCE(d.invoice_number, '') !~* '^\s*pre[-_ ]?crm'
    )
  FROM deals d
  WHERE d.company_id = 'adf8ee78-cf78-4f02-932c-989a214bdd78'
    AND d.stage = 'won' AND d.is_invoiced = true
)
SELECT
  r.return_date, r.raw AS return_invoice_no, r.customer_name, r.return_amount,
  COALESCE(array_length(r.parsed, 1), 0)                        AS numbers_parsed,
  (SELECT count(*) FROM nums d WHERE d.kind = 'deal' AND d.parsed && r.parsed) AS deals_reached,
  (SELECT string_agg(DISTINCT u.full_name, ', ')
     FROM nums d LEFT JOIN users u ON u.id = d.owner_id
    WHERE d.kind = 'deal' AND d.parsed && r.parsed)             AS would_go_to,
  CASE
    WHEN COALESCE(array_length(r.parsed, 1), 0) = 0 THEN 'return has no readable invoice number'
    WHEN (SELECT count(*) FROM nums d WHERE d.kind = 'deal' AND d.parsed && r.parsed) = 0
      THEN 'no deal carries this number yet'
    WHEN (SELECT count(*) FROM nums d WHERE d.kind = 'deal' AND d.parsed && r.parsed) = 1
      THEN 'WILL LINK'
    ELSE 'ambiguous - stays unlinked'
  END                                                           AS outcome
FROM nums r
WHERE r.kind = 'return'
ORDER BY r.return_date DESC;


-- ── 2. CREATE ───────────────────────────────────────────────────────────────
BEGIN;

-- Every row the function links, so the rollback in section 4 can put back
-- exactly those and nothing else. previous_deal_id is NULL by construction
-- (only unmatched rows are ever touched) and is stored anyway, so the rollback
-- restores a recorded value rather than assuming one.
CREATE TABLE IF NOT EXISTS public.deal_return_relink_log (
  id               bigserial PRIMARY KEY,
  return_id        uuid NOT NULL REFERENCES public.deal_returns(id) ON DELETE CASCADE,
  company_id       uuid NOT NULL,
  deal_id          uuid NOT NULL,
  previous_deal_id uuid,
  invoice_no       text,
  relinked_by      uuid,
  relinked_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS deal_return_relink_log_return_idx
  ON public.deal_return_relink_log (return_id);
CREATE INDEX IF NOT EXISTS deal_return_relink_log_deal_idx
  ON public.deal_return_relink_log (deal_id, relinked_at);

COMMENT ON TABLE public.deal_return_relink_log IS
  'One row per deal_return linked by relink_returns_for_deal(). The record the rollback in migrations/relink_returns_on_invoice_correction.sql unlinks from.';

-- RLS on, no policy: the function writes it as the table owner, and no client
-- role needs to read it. The rollback is run in the SQL editor, which is not
-- subject to these policies.
ALTER TABLE public.deal_return_relink_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.deal_return_relink_log FROM public, anon, authenticated;


-- The application's parse rule, restated once in SQL. utils/invoiceNumber.js is
-- the original; see the PREVIEW header for the rule in words. IMMUTABLE and
-- invoker-rights: it reads no tables and needs no privileges of its own.
CREATE OR REPLACE FUNCTION public.parse_invoice_numbers(p_text text)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN COALESCE(p_text, '') ~* '^\s*pre[-_ ]?crm' THEN '{}'::text[]
    ELSE COALESCE((
      SELECT array_agg(num ORDER BY ord)
      FROM (
        SELECT DISTINCT ON (digits) lpad(digits, 10, '0') AS num, ord
        FROM (
          SELECT regexp_replace(t, '\D', '', 'g') AS digits, ord
          FROM regexp_split_to_table(
                 regexp_replace(COALESCE(p_text, ''),
                   '\y(invoice|inv|bill)\y\s*(no\.?|number|#)?\s*[:.#-]*', ' ', 'gi'),
                 '[/,;&+|\\]+|\s+'
               ) WITH ORDINALITY AS s(t, ord)
        ) tok
        WHERE length(digits) BETWEEN 8 AND 10
          AND digits ~ '[1-9]'
        ORDER BY digits, ord
      ) uniq
    ), '{}'::text[])
  END;
$$;

COMMENT ON FUNCTION public.parse_invoice_numbers(text) IS
  'Every ERP invoice number in a free-text field, normalised to 10 digits. Mirrors src/utils/invoiceNumber.js parseInvoiceNumbers.';


-- Re-match unmatched returns against ONE deal's invoice numbers.
--
-- Takes a deal id and nothing else. Checks the caller against that deal.
-- Returns (linked, ambiguous). See the header for why it is SECURITY DEFINER
-- and what bounds it.
CREATE OR REPLACE FUNCTION public.relink_returns_for_deal(p_deal_id uuid)
RETURNS TABLE (linked integer, ambiguous integer)
LANGUAGE plpgsql
SECURITY DEFINER
-- pg_temp pinned LAST: in a definer function an unqualified name must not be
-- resolvable to something the caller created in their temp schema, which is
-- searched first when it is not listed.
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller    uuid := auth.uid();
  v_company   uuid;
  v_owner     uuid;
  v_nums      text[];
  v_is_above  boolean := false;
  v_linked    integer := 0;
  v_ambiguous integer := 0;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'relink_returns_for_deal: no authenticated user'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- The company comes from the DEAL, never from the caller.
  SELECT d.company_id, d.owner_id, public.parse_invoice_numbers(d.invoice_number)
    INTO v_company, v_owner, v_nums
  FROM public.deals d
  WHERE d.id = p_deal_id
    AND d.stage = 'won'
    AND d.is_invoiced = true;

  IF v_company IS NULL THEN
    RAISE EXCEPTION 'relink_returns_for_deal: % is not an invoiced won deal', p_deal_id
      USING ERRCODE = 'no_data_found';
  END IF;

  -- Is the caller anywhere ABOVE the owner? Walked upward with a depth guard,
  -- because a cyclic supervisor_id must not spin a definer function.
  WITH RECURSIVE chain(id, supervisor_id, depth) AS (
    SELECT u.id, u.supervisor_id, 1 FROM public.users u WHERE u.id = v_owner
    UNION ALL
    SELECT u.id, u.supervisor_id, c.depth + 1
    FROM public.users u JOIN chain c ON u.id = c.supervisor_id
    WHERE c.depth < 20
  )
  SELECT EXISTS (SELECT 1 FROM chain WHERE chain.supervisor_id = v_caller)
    INTO v_is_above;

  -- The same rule as utils/teamHierarchy.js canCorrectInvoice.
  IF NOT (
    v_owner = v_caller
    OR v_is_above
    OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = v_caller
        AND u.role = ANY (ARRAY['admin'::user_role, 'director'::user_role, 'head'::user_role])
        AND (u.company_id = v_company OR u.company_id IS NULL)
    )
  ) THEN
    RAISE EXCEPTION 'relink_returns_for_deal: not permitted for deal %', p_deal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Nothing parseable on the deal means nothing can match. Said plainly rather
  -- than scanning the table to return zero.
  IF v_nums IS NULL OR cardinality(v_nums) = 0 THEN
    RETURN QUERY SELECT 0, 0;
    RETURN;
  END IF;

  -- One statement, so the candidate set, the write and the log all see the same
  -- snapshot of deal_returns, and so there is no temp table to collide with a
  -- second call in the same transaction.
  --
  --   cand   unmatched returns in THIS company whose normalised numbers overlap
  --          this deal's, each with a count of how many invoiced deals in the
  --          company it reaches
  --   upd    links the ones that reach exactly one deal (this one)
  --   logged records each linked row, which is what makes the rollback exact
  WITH cand AS (
    SELECT
      r.id AS return_id,
      r.company_id,
      r.invoice_no,
      (
        SELECT count(*)
        FROM public.deals d2
        WHERE d2.company_id = v_company
          AND d2.stage = 'won'
          AND d2.is_invoiced = true
          AND public.parse_invoice_numbers(d2.invoice_number)
              && public.parse_invoice_numbers(r.invoice_no)
      ) AS deals_reached
    FROM public.deal_returns r
    WHERE r.company_id = v_company
      AND r.deal_id IS NULL                     -- never re-point a matched return
      AND public.parse_invoice_numbers(r.invoice_no) && v_nums
  ),
  upd AS (
    UPDATE public.deal_returns r
    SET deal_id = p_deal_id
    WHERE r.id IN (SELECT return_id FROM cand WHERE deals_reached = 1)
      AND r.deal_id IS NULL                     -- re-checked at write time
      AND r.company_id = v_company
    RETURNING r.id, r.company_id, r.invoice_no
  ),
  logged AS (
    INSERT INTO public.deal_return_relink_log
      (return_id, company_id, deal_id, previous_deal_id, invoice_no, relinked_by)
    SELECT u.id, u.company_id, p_deal_id, NULL, u.invoice_no, v_caller
    FROM upd u
    RETURNING 1
  )
  SELECT
    (SELECT count(*)::integer FROM logged),
    (SELECT count(*)::integer FROM cand WHERE deals_reached > 1)
  INTO v_linked, v_ambiguous;

  RETURN QUERY SELECT v_linked, v_ambiguous;
END;
$$;

COMMENT ON FUNCTION public.relink_returns_for_deal(uuid) IS
  'Re-match unmatched deal_returns against one deal''s invoice numbers after the number is corrected. Links only returns that resolve to exactly this deal; ambiguous ones stay unlinked. Caller must be the deal owner, above him in the supervisor_id chain, or admin/director/head of the deal''s company.';

REVOKE ALL ON FUNCTION public.relink_returns_for_deal(uuid) FROM public;
REVOKE ALL ON FUNCTION public.relink_returns_for_deal(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.relink_returns_for_deal(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.parse_invoice_numbers(text) FROM public;
REVOKE ALL ON FUNCTION public.parse_invoice_numbers(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.parse_invoice_numbers(text) TO authenticated;

COMMIT;


-- ── 3. VERIFY ───────────────────────────────────────────────────────────────
-- (a) The normaliser agrees with utils/invoiceNumber.js.
-- Expect: {0093002906} | {0093002819,0093002820} | {} | {} | {0093002843}
SELECT public.parse_invoice_numbers('93002906')          AS plain,
       public.parse_invoice_numbers('93002819/93002820') AS two,
       public.parse_invoice_numbers('11')                AS junk,
       public.parse_invoice_numbers('PRE-CRM-7781')      AS placeholder,
       public.parse_invoice_numbers('INVOICE: 93002843') AS labelled;

-- (b) The grants are what they should be. Expect exactly one row:
-- authenticated / EXECUTE. No public, no anon.
SELECT p.proname, p.prosecdef AS security_definer, p.proconfig, a.grantee, a.privilege_type
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
LEFT JOIN information_schema.routine_privileges a
       ON a.routine_schema = n.nspname AND a.routine_name = p.proname
WHERE n.nspname = 'public'
  AND p.proname IN ('relink_returns_for_deal', 'parse_invoice_numbers')
ORDER BY p.proname, a.grantee;

-- (c) How many returns are still unmatched, per company.
SELECT company_id, count(*) AS unmatched_returns, ROUND(SUM(return_amount), 2) AS total
FROM deal_returns
WHERE deal_id IS NULL
GROUP BY company_id;

-- (d) What the function has linked so far, newest first.
SELECT l.relinked_at, l.invoice_no, l.deal_id,
       u.full_name AS relinked_by, r.return_amount
FROM deal_return_relink_log l
LEFT JOIN users u ON u.id = l.relinked_by
LEFT JOIN deal_returns r ON r.id = l.return_id
ORDER BY l.relinked_at DESC
LIMIT 50;


-- ── 4. ROLLBACK ─────────────────────────────────────────────────────────────
-- Exact, because every linked row was recorded: only rows this function linked
-- are unlinked, and only while they still point where it put them — a return
-- re-pointed by someone since is left alone rather than reverted over.
--
-- Scope it before running it. Narrow by deal, by user or by time as needed.
--
-- -- what would be unlinked:
-- SELECT l.*, r.deal_id AS current_deal_id
-- FROM deal_return_relink_log l
-- JOIN deal_returns r ON r.id = l.return_id
-- WHERE l.deal_id = '<deal id>'          -- or: l.relinked_at > now() - interval '1 day'
--   AND r.deal_id = l.deal_id;
--
-- BEGIN;
--   UPDATE deal_returns r
--   SET deal_id = l.previous_deal_id      -- NULL: these rows were unmatched
--   FROM deal_return_relink_log l
--   WHERE r.id = l.return_id
--     AND r.deal_id = l.deal_id           -- still where the function put it
--     AND l.deal_id = '<deal id>';        -- the same scope as the SELECT above
--
--   -- Drop the log rows only once nothing needs them: they are the ONLY record
--   -- of what was linked.
--   -- DELETE FROM deal_return_relink_log WHERE deal_id = '<deal id>';
-- COMMIT;
--
-- Removing the functions puts the application back on its fallback path, where
-- only an admin can relink:
-- DROP FUNCTION IF EXISTS public.relink_returns_for_deal(uuid);
-- DROP FUNCTION IF EXISTS public.parse_invoice_numbers(text);
-- -- keep deal_return_relink_log unless the rollback above has been run.
