-- ============================================================================
-- NOT APPLIED — and nothing here changes anything. One read-only SELECT.
-- ============================================================================
--
-- Every invoiced deal since 1 August 2026 whose invoice_number cannot be
-- matched to an ERP invoice, for sending back to the salesmen to correct.
--
-- WHY IT MATTERS: deal_returns can only find a deal BY its invoice number. A
-- deal carrying "1", "gg" or "INVOICE: 93002807" is permanently unmatchable, so
-- any credit note against it silently reduces nobody's Achieved.
--
-- The rule is the application's, restated once in SQL — utils/invoiceNumber.js
-- is the original:
--   strip labels (INVOICE / INV / BILL / #), split on / , ; & + | \ or
--   whitespace, keep digits per token, accept 8-10 digits with at least one
--   non-zero, left-pad to 10.
-- A value is a problem when NO token survives that, or when it survives but the
-- field held more than the digits, or when several invoices share one field.
-- 'PRE-CRM-…' placeholders are listed separately: they are real history from the
-- import, not somebody's typo, and nothing in the app will rewrite them.
--
-- Expected for JASCO PVC: 42 of the 119 invoiced deals in the window,
-- 3,026,094 SAR — 12 junk, 21 placeholders, 4 with several invoices in one
-- field, 5 with extra text.
--
-- EDIT THE COMPANY ID and the date floor if you want a different window.
-- JASCO PVC is 'adf8ee78-cf78-4f02-932c-989a214bdd78'.
-- ============================================================================

WITH invoiced AS (
  SELECT
    d.id,
    d.owner_id,
    d.title,
    d.invoice_number,
    d.invoice_date,
    COALESCE(d.final_amount, d.amount) AS value,
    d.contact_id
  FROM deals d
  WHERE d.company_id = 'adf8ee78-cf78-4f02-932c-989a214bdd78'
    AND d.stage = 'won'
    AND d.is_invoiced = true
    AND d.invoice_date >= DATE '2026-08-01'
),
cleaned AS (
  SELECT
    i.*,
    -- Is it the 'PRE-CRM-…' placeholder the history import wrote?
    (i.invoice_number ~* '^\s*pre[-_ ]?crm') AS is_placeholder,
    -- Every 8-10 digit run left after the labels are stripped, as an array.
    (
      SELECT array_agg(lpad(tok, 10, '0') ORDER BY ord)
      FROM (
        SELECT DISTINCT ON (tok) tok, ord
        FROM (
          SELECT regexp_replace(t, '\D', '', 'g') AS tok, ord
          FROM regexp_split_to_table(
                 regexp_replace(
                   COALESCE(i.invoice_number, ''),
                   '\y(invoice|inv|bill)\y\s*(no\.?|number|#)?\s*[:.#-]*', ' ', 'gi'),
                 '[/,;&+|\\\\]+|\s+'
               ) WITH ORDINALITY AS s(t, ord)
        ) tokens
        WHERE length(tok) BETWEEN 8 AND 10
          AND tok ~ '[1-9]'
        ORDER BY tok, ord
      ) uniq
    ) AS parsed
  FROM invoiced i
)
SELECT
  COALESCE(u.full_name, '(unassigned)')                       AS owner,
  COALESCE(c.company_name,
           NULLIF(TRIM(CONCAT_WS(' ', c.first_name, c.last_name)), ''),
           cl.title,
           '(no customer)')                                   AS customer,
  cl.invoice_date,
  ROUND(cl.value, 2)                                          AS value,
  cl.invoice_number                                           AS current_invoice_number,
  CASE
    WHEN cl.is_placeholder                                    THEN 'placeholder'
    WHEN cl.invoice_number IS NULL
      OR TRIM(cl.invoice_number) = ''                         THEN 'missing'
    WHEN cl.parsed IS NULL                                    THEN 'junk'
    WHEN array_length(cl.parsed, 1) > 1                       THEN 'multiple'
    ELSE 'extra text'
  END                                                         AS issue,
  -- What the application would store if this value were re-entered as it is.
  -- NULL for junk: there is nothing to keep, somebody has to look it up.
  array_to_string(cl.parsed, ', ')                            AS would_normalise_to,
  cl.id                                                       AS deal_id
FROM cleaned cl
LEFT JOIN users u    ON u.id = cl.owner_id
LEFT JOIN contacts c ON c.id = cl.contact_id
WHERE cl.is_placeholder
   OR cl.parsed IS NULL
   OR array_length(cl.parsed, 1) > 1
   -- survived, but the field carried more than the digits
   OR regexp_replace(COALESCE(cl.invoice_number, ''), '\D', '', 'g') <> COALESCE(cl.invoice_number, '')
ORDER BY owner, value DESC NULLS LAST;


-- ── Totals, to check against the figures in the header ──────────────────────
WITH invoiced AS (
  SELECT d.id, d.invoice_number, COALESCE(d.final_amount, d.amount) AS value
  FROM deals d
  WHERE d.company_id = 'adf8ee78-cf78-4f02-932c-989a214bdd78'
    AND d.stage = 'won'
    AND d.is_invoiced = true
    AND d.invoice_date >= DATE '2026-08-01'
),
cleaned AS (
  SELECT
    i.*,
    (i.invoice_number ~* '^\s*pre[-_ ]?crm') AS is_placeholder,
    (
      SELECT array_agg(DISTINCT lpad(regexp_replace(t, '\D', '', 'g'), 10, '0'))
      FROM regexp_split_to_table(
             regexp_replace(
               COALESCE(i.invoice_number, ''),
               '\y(invoice|inv|bill)\y\s*(no\.?|number|#)?\s*[:.#-]*', ' ', 'gi'),
             '[/,;&+|\\\\]+|\s+'
           ) AS s(t)
      WHERE length(regexp_replace(t, '\D', '', 'g')) BETWEEN 8 AND 10
        AND regexp_replace(t, '\D', '', 'g') ~ '[1-9]'
    ) AS parsed
  FROM invoiced i
)
SELECT
  CASE
    WHEN is_placeholder                  THEN 'placeholder'
    WHEN invoice_number IS NULL
      OR TRIM(invoice_number) = ''       THEN 'missing'
    WHEN parsed IS NULL                  THEN 'junk'
    WHEN array_length(parsed, 1) > 1     THEN 'multiple'
    WHEN regexp_replace(COALESCE(invoice_number, ''), '\D', '', 'g')
         <> COALESCE(invoice_number, '') THEN 'extra text'
    ELSE 'clean'
  END                                    AS issue,
  count(*)                               AS deals,
  ROUND(SUM(value), 2)                   AS total_value
FROM cleaned
GROUP BY 1
ORDER BY deals DESC;
