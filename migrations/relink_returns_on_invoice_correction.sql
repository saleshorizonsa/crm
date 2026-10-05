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
-- deal_id NULL. Correcting the number in the pipeline now re-runs the match
-- (dealService.relinkReturnsForDeal), but UPDATE on deal_returns is restricted
-- by RLS to admin/director/head — see create_deal_returns.sql — and the people
-- who know the real invoice number are the salesmen and their supervisors.
-- Without this function their correction saves the number and links nothing,
-- and the application says so rather than claiming otherwise.
--
-- A re-import does not fix it either: the importer upserts with
-- ignoreDuplicates on (company, credit note, invoice, item), so a row already
-- stored is skipped — deal_id and all.
--
-- WHAT IT DOES NOT DO. It never re-points a return that is already matched
-- (deal_id IS NULL only), never touches deals, never guesses: a return whose
-- invoice is ALSO carried by another invoiced deal is left alone and counted as
-- `ambiguous`, which is the importer's rule exactly.
--
-- ORDER OF OPERATIONS
--   1. Run PREVIEW for the deal you are about to correct. It changes nothing.
--   2. Run CREATE. The application calls the function on its own after that,
--      and falls back to a plain UPDATE (admin/director/head only) while it
--      does not exist, so applying this is safe at any time.
--   3. Run VERIFY.
--   4. ROLLBACK only if needed — read its note first.
-- ============================================================================


-- ── 1. PREVIEW (read-only) ──────────────────────────────────────────────────
-- Unmatched returns, and which invoiced deals each one's invoice number
-- reaches. 0 deals = nobody has entered that number; 1 = it will be linked;
-- more than 1 = ambiguous, left alone.
-- EDIT THE COMPANY ID. JASCO PVC is 'adf8ee78-cf78-4f02-932c-989a214bdd78'.
WITH orphan AS (
  SELECT r.id, r.invoice_no, r.return_date, r.return_amount, r.customer_name,
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
         ) AS nums
  FROM deal_returns r
  WHERE r.company_id = 'adf8ee78-cf78-4f02-932c-989a214bdd78'
    AND r.deal_id IS NULL
)
SELECT
  o.return_date, o.invoice_no, o.customer_name, o.return_amount,
  COALESCE(array_length(o.nums, 1), 0)                    AS parsed_numbers,
  (SELECT count(*) FROM deals d
    WHERE d.company_id = 'adf8ee78-cf78-4f02-932c-989a214bdd78'
      AND d.stage = 'won' AND d.is_invoiced = true
      AND (
        SELECT array_agg(DISTINCT lpad(tok, 10, '0'))
        FROM (
          SELECT regexp_replace(t, '\D', '', 'g') AS tok
          FROM regexp_split_to_table(
                 regexp_replace(COALESCE(d.invoice_number, ''),
                   '\y(invoice|inv|bill)\y\s*(no\.?|number|#)?\s*[:.#-]*', ' ', 'gi'),
                 '[/,;&+|\\]+|\s+') AS s(t)
        ) k
        WHERE length(tok) BETWEEN 8 AND 10 AND tok ~ '[1-9]'
      ) && o.nums
  )                                                       AS deals_reached
FROM orphan o
ORDER BY o.return_date DESC;


-- ── 2. CREATE ───────────────────────────────────────────────────────────────
BEGIN;

-- The application's rule, restated once in SQL. utils/invoiceNumber.js is the
-- original: strip labels (INVOICE / INV / BILL / #), split on / , ; & + | \ or
-- whitespace, keep the digits of each token, accept 8-10 digits with at least
-- one non-zero, left-pad to 10. 'PRE-CRM-…' placeholders parse to nothing: they
-- are real history from the import, never a matchable number.
CREATE OR REPLACE FUNCTION public.parse_invoice_numbers(p_text text)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
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
-- SECURITY DEFINER because the whole point is to let the deal''s owner and his
-- supervisor link their own returns, which the deal_returns UPDATE policy
-- forbids. The permission rule is therefore enforced here, and it is the same
-- rule the UI shows the action by (utils/teamHierarchy.js canCorrectInvoice),
-- widened only to the roles that could already do this by hand: the owner,
-- anyone ABOVE him in the supervisor_id chain, and admin/director/head.
CREATE OR REPLACE FUNCTION public.relink_returns_for_deal(p_deal_id uuid)
RETURNS TABLE (linked integer, ambiguous integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company   uuid;
  v_owner     uuid;
  v_is_above  boolean := false;
  v_allowed   boolean := false;
BEGIN
  SELECT d.company_id, d.owner_id
    INTO v_company, v_owner
  FROM deals d
  WHERE d.id = p_deal_id
    AND d.stage = 'won'
    AND d.is_invoiced = true;

  IF v_company IS NULL THEN
    RAISE EXCEPTION 'relink_returns_for_deal: % is not an invoiced won deal', p_deal_id
      USING ERRCODE = 'no_data_found';
  END IF;

  -- Is the caller anywhere above the owner? Walked upward with a depth guard,
  -- because a cyclic supervisor_id must not spin a SECURITY DEFINER function.
  WITH RECURSIVE chain(id, supervisor_id, depth) AS (
    SELECT u.id, u.supervisor_id, 1 FROM users u WHERE u.id = v_owner
    UNION ALL
    SELECT u.id, u.supervisor_id, c.depth + 1
    FROM users u JOIN chain c ON u.id = c.supervisor_id
    WHERE c.depth < 20
  )
  SELECT EXISTS (SELECT 1 FROM chain WHERE chain.supervisor_id = auth.uid())
    INTO v_is_above;

  v_allowed :=
    v_owner = auth.uid()
    OR v_is_above
    OR EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
        AND u.role = ANY (ARRAY['admin'::user_role, 'director'::user_role, 'head'::user_role])
        AND (u.company_id = v_company OR u.company_id IS NULL)
    );

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'relink_returns_for_deal: not permitted for this deal'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
  WITH orphan AS (
    SELECT r.id, parse_invoice_numbers(r.invoice_no) AS nums
    FROM deal_returns r
    WHERE r.company_id = v_company
      AND r.deal_id IS NULL                       -- never re-point a matched return
  ),
  hits AS (
    SELECT o.id, array_agg(DISTINCT d.id) AS deal_ids
    FROM orphan o
    JOIN deals d
      ON d.company_id = v_company
     AND d.stage = 'won'
     AND d.is_invoiced = true
     AND parse_invoice_numbers(d.invoice_number) && o.nums
    WHERE cardinality(o.nums) > 0
    GROUP BY o.id
  ),
  mine AS (
    -- Exactly one deal, and it is this one. Several deals = ambiguous, and
    -- attributing it would charge the credit note to an arbitrary owner.
    SELECT id FROM hits
    WHERE cardinality(deal_ids) = 1 AND deal_ids[1] = p_deal_id
  ),
  upd AS (
    UPDATE deal_returns r
    SET deal_id = p_deal_id
    WHERE r.id IN (SELECT id FROM mine)
    RETURNING 1
  )
  SELECT
    (SELECT count(*)::integer FROM upd),
    (SELECT count(*)::integer FROM hits
      WHERE cardinality(deal_ids) > 1 AND p_deal_id = ANY (deal_ids));
END;
$$;

COMMENT ON FUNCTION public.relink_returns_for_deal(uuid) IS
  'Re-match unmatched deal_returns against one deal''s invoice numbers after the number is corrected. Links only returns that resolve to exactly this deal.';

REVOKE ALL ON FUNCTION public.relink_returns_for_deal(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.relink_returns_for_deal(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.parse_invoice_numbers(text) TO authenticated;

COMMIT;


-- ── 3. VERIFY ───────────────────────────────────────────────────────────────
-- Both functions exist, and the normaliser agrees with utils/invoiceNumber.js.
-- Expect: {0093002906}, {0093002819,0093002820}, {}, {}, {0093002843}.
SELECT parse_invoice_numbers('93002906')            AS plain,
       parse_invoice_numbers('93002819/93002820')   AS two,
       parse_invoice_numbers('11')                  AS junk,
       parse_invoice_numbers('PRE-CRM-7781')        AS placeholder,
       parse_invoice_numbers('INVOICE: 93002843')   AS labelled;

-- How many returns are still unmatched, per company.
SELECT company_id, count(*) AS unmatched_returns, ROUND(SUM(return_amount), 2) AS total
FROM deal_returns
WHERE deal_id IS NULL
GROUP BY company_id;


-- ── 4. ROLLBACK ─────────────────────────────────────────────────────────────
-- NOTE: the function keeps no log of which rows it linked, so there is no
-- blanket undo — unlinking everything on a deal would also unlink returns the
-- importer matched correctly. Undo is therefore per deal and deliberate: list
-- first, then unlink only what you meant to.
--
-- -- list:
-- SELECT id, return_date, invoice_no, credit_note_no, return_amount
-- FROM deal_returns WHERE deal_id = '<deal id>';
--
-- -- unlink chosen rows:
-- UPDATE deal_returns SET deal_id = NULL WHERE id IN ('<row id>', '<row id>');
--
-- Removing the functions puts the application back on its fallback path, where
-- only admin/director/head can relink:
-- DROP FUNCTION IF EXISTS public.relink_returns_for_deal(uuid);
-- DROP FUNCTION IF EXISTS public.parse_invoice_numbers(text);
