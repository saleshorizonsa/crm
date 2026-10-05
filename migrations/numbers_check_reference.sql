-- ============================================================================
-- NOT APPLIED — and there is nothing here to apply. Read-only SELECTs only:
-- no DDL, no DML, no function, no grant. Safe to paste into the SQL editor
-- against production.
-- ============================================================================
--
-- THE REFERENCE FIGURES, STRAIGHT FROM THE TABLES.
--
-- /numbers-check (src/utils/numbersCheck.js) compares every figure the app
-- shows against a reference it computes from the shared rules. This file
-- computes that same reference independently, in SQL, so the CHECKER itself can
-- be checked: if the page says Achieved is 1,518,070 and this says the same,
-- the agreement is not just the application agreeing with itself.
--
-- Three figures, each the shared rule restated once in SQL:
--   1. ACHIEVED       utils/planningCalculations.js computeAchieved
--   2. TARGET         utils/planningCalculations.js targetPerPerson
--   3. CONVERSION 3m  utils/winRate3m.js fetchWinRate3m
--
-- EDIT THE CONFIG BLOCK AT THE TOP OF EACH QUERY. Everything else follows from
-- it. JASCO PVC is 'adf8ee78-cf78-4f02-932c-989a214bdd78'.
--
-- WHY THE RULES ARE SPELLED OUT RATHER THAN SUMMARISED: each of them was once
-- implemented four different ways in the application, and the differences were
-- always in the details below, never in the headline.
-- ============================================================================


-- ============================================================================
-- 0. WHO COUNTS  —  run this first; every query below repeats it
-- ============================================================================
--
-- ACHIEVERS (whose revenue and whose monthly target count):
--   active users whose role is 'salesman' or 'supervisor' (CONTRIBUTOR_ROLES),
--   PLUS any active user outside those roles individually flagged
--   is_contributor = true — a manager who sells himself. His own invoiced deals
--   and his own monthly target both count; nothing else about him does.
--
-- CONTRIBUTORS (whose CONVERSION counts):
--   the roles only, never a flagged manager. A manager carries no monthly quota,
--   so his handful of deals must not move the team's conversion rate either.
--
-- A manager who is NOT flagged appears in neither set, which is why a company
-- total is not simply "every deal in the company".

SELECT
  u.id,
  u.full_name,
  u.role,
  u.is_contributor,
  (u.role IN ('salesman', 'supervisor') OR u.is_contributor IS TRUE) AS is_achiever,
  (u.role IN ('salesman', 'supervisor'))                             AS is_contributor_role
FROM users u
WHERE u.company_id = 'adf8ee78-cf78-4f02-932c-989a214bdd78'
  AND u.is_active IS TRUE
  AND (u.role IN ('salesman', 'supervisor') OR u.is_contributor IS TRUE)
ORDER BY is_contributor_role DESC, u.full_name;


-- ============================================================================
-- 1. ACHIEVED  —  for a company and a month
-- ============================================================================
--
-- THE RULE, in full:
--   • stage = 'won' AND is_invoiced = true. Won-but-not-yet-invoiced is a
--     separate figure ("Won, not yet invoiced") and is NOT achievement.
--   • dated by INVOICE_DATE, never by closed_at or expected_close_date. This is
--     the single most common way a screen drifted: picking won deals by close
--     date moves revenue into the wrong month.
--   • valued at COALESCE(final_amount, amount) — the figure it was actually
--     invoiced at, not the figure it was forecast at.
--   • owner must be an ACHIEVER (section 0).
--   • MINUS sales returns (deal_returns) that fall in the SAME window by
--     RETURN_DATE, not by the invoice's date: a credit note reduces the month it
--     happened in. return_amount is stored POSITIVE and subtracted here; the
--     original invoice is never rewritten.
--   • a return whose deal_id IS NULL has no owner and reduces nobody — the
--     inner join below drops it, exactly as fetchReturns does.

WITH config AS (
  SELECT
    'adf8ee78-cf78-4f02-932c-989a214bdd78'::uuid AS company_id,
    DATE '2026-09-01' AS period_start,
    DATE '2026-09-30' AS period_end
),
achievers AS (
  SELECT u.id
  FROM users u, config c
  WHERE u.company_id = c.company_id
    AND u.is_active IS TRUE
    AND (u.role IN ('salesman', 'supervisor') OR u.is_contributor IS TRUE)
),
invoiced AS (
  SELECT
    COUNT(*)                                        AS invoice_count,
    COALESCE(SUM(COALESCE(d.final_amount, d.amount)), 0) AS gross
  FROM deals d, config c
  WHERE d.company_id = c.company_id
    AND d.owner_id IN (SELECT id FROM achievers)
    AND d.stage = 'won'
    AND d.is_invoiced IS TRUE
    AND d.invoice_date IS NOT NULL
    AND d.invoice_date >= c.period_start
    AND d.invoice_date <= c.period_end
),
credits AS (
  SELECT
    COUNT(*)                                   AS return_count,
    COALESCE(SUM(ABS(r.return_amount)), 0)     AS returns_total
  FROM deal_returns r
  JOIN deals rd ON rd.id = r.deal_id            -- INNER: unmatched returns drop out
  CROSS JOIN config c
  WHERE r.company_id = c.company_id
    AND rd.owner_id IN (SELECT id FROM achievers)
    AND r.return_date >= c.period_start
    AND r.return_date <= c.period_end
)
SELECT
  c.period_start,
  c.period_end,
  i.invoice_count,
  i.gross                        AS achieved_gross,
  cr.return_count,
  cr.returns_total,
  i.gross - cr.returns_total     AS achieved_net   -- <<< THE REFERENCE FIGURE
FROM config c, invoiced i, credits cr;


-- ============================================================================
-- 2. TARGET  —  for a company and a month
-- ============================================================================
--
-- THE RULE, in full:
--   • ACTIVE rows only. 'draft' and superseded rows are counted nowhere in the
--     application, and counting them here would make this file disagree with
--     every screen.
--   • MONTHLY rows only (period_type = 'monthly'). A yearly row is a whole
--     year's allocation — one manager's is 40,660,779 — so summing one into a
--     month is wrong whoever holds it. The annual view reads those rows
--     separately (section 4 of the page, computeAnnualTarget).
--   • rows OVERLAPPING the window: period_start <= end AND period_end >= start.
--   • held by an ACHIEVER (section 0).
--   • ROWS ARE ADDITIVE. A person's month is the SUM of every applicable row,
--     because each records a different commitment: total_value (an overall
--     value goal), by_products (a product-group commitment) and by_clients (a
--     per-client goal). "CPVC 300,000 + client ABC 200,000 + by value 100,000"
--     is 600,000, not 300,000.
--   • THE ONE THING NEVER COUNTED TWICE is a row and its own client breakdown:
--     a row with client_targets children counts GREATEST(its own amount, the
--     sum of its children) — not both. That is targetRowValue().
--   • summed per person PER MONTH and then across months, so a multi-month
--     range cannot blur one month's rows into another's. (For a single month
--     the two orders agree; the grouping is kept so this query is correct when
--     the window is widened.)

WITH config AS (
  SELECT
    'adf8ee78-cf78-4f02-932c-989a214bdd78'::uuid AS company_id,
    DATE '2026-09-01' AS period_start,
    DATE '2026-09-30' AS period_end
),
achievers AS (
  SELECT u.id
  FROM users u, config c
  WHERE u.company_id = c.company_id
    AND u.is_active IS TRUE
    AND (u.role IN ('salesman', 'supervisor') OR u.is_contributor IS TRUE)
),
rows_in_window AS (
  SELECT
    t.id,
    t.assigned_to,
    t.period_start,
    t.target_type,
    COALESCE(t.target_amount, 0)                     AS own_amount,
    COALESCE(SUM(ct.target_amount), 0)               AS child_sum,
    COUNT(ct.id)                                     AS child_count
  FROM sales_targets t
  LEFT JOIN client_targets ct ON ct.sales_target_id = t.id
  CROSS JOIN config c
  WHERE t.company_id = c.company_id
    AND t.status = 'active'
    AND t.period_type = 'monthly'
    AND t.period_start <= c.period_end
    AND t.period_end   >= c.period_start
    AND t.assigned_to IN (SELECT id FROM achievers)
  GROUP BY t.id, t.assigned_to, t.period_start, t.target_type, t.target_amount
),
row_values AS (
  -- targetRowValue(): a childless row counts its own amount; a row WITH a
  -- client breakdown counts the greater of the two, never the sum of both.
  SELECT
    r.assigned_to,
    r.period_start,
    CASE WHEN r.child_count = 0
         THEN r.own_amount
         ELSE GREATEST(r.own_amount, r.child_sum)
    END AS row_value
  FROM rows_in_window r
),
per_person_month AS (
  SELECT assigned_to, period_start, SUM(row_value) AS month_value
  FROM row_values
  GROUP BY assigned_to, period_start
),
per_person AS (
  SELECT assigned_to, SUM(month_value) AS person_target
  FROM per_person_month
  GROUP BY assigned_to
)
SELECT
  (SELECT COUNT(*) FROM rows_in_window)      AS target_rows,
  (SELECT COUNT(*) FROM per_person)          AS distinct_people,
  COALESCE(SUM(person_target), 0)            AS target_total   -- <<< THE REFERENCE
FROM per_person;


-- ============================================================================
-- 3. CONVERSION (3m)  —  for a company, as of a month
-- ============================================================================
--
-- THE RULE, in full:
--   conversion = won deals ÷ ALL deals CREATED in the window × 100
--
--   • the window is the THREE COMPLETED calendar months before the as-of month;
--     the as-of month itself is excluded because it is not finished. Run as of
--     October 2026 → 1 July .. 30 September.
--   • the denominator is every deal CREATED in the window, not just the closed
--     ones. This is deliberately NOT the won/(won+lost) "win rate" shown on a
--     card: it measures how much of what you start, you finish, and it is the
--     figure Required Plan divides by.
--   • IMPORTED HISTORY IS EXCLUDED (CEO decision, 2026-10-05). The months
--     before the CRM started were loaded in as deals that were already won and
--     already invoiced; they can only ever be "won", so counting them inflated
--     every rate — company 74.2% where the real figure is 62.7% — and an
--     inflated rate UNDERSTATES Required Plan, since Required Plan is
--     target ÷ rate.
--   • the marker. The application honours TWO: deals.is_imported, the durable
--     one, and invoice_number LIKE 'PRE-CRM%', the original placeholder the
--     history load wrote. The query below uses the PLACEHOLDER ONLY, because
--     migrations/add_deals_is_imported.sql is NOT APPLIED and Postgres rejects a
--     whole query for an unknown column rather than skipping the condition.
--     ONCE THAT MIGRATION IS APPLIED, change the marker line to
--         (d.is_imported IS TRUE OR d.invoice_number ILIKE 'PRE-CRM%')
--     which is exactly what isImportedDeal() does. Until then, note the
--     weakness this file inherits from production: "Correct invoice no." can
--     overwrite a PRE-CRM placeholder with a real ERP number, and that deal then
--     stops looking imported — to this query and to the application alike.
--   • scope is CONTRIBUTORS, not achievers (section 0).
--   • created_at is a timestamptz. The window below is built in the SESSION's
--     time zone; users are in Asia/Riyadh (UTC+3), so the `AT TIME ZONE` is
--     written out rather than left to whatever the editor's connection happens
--     to be set to. A deal created at 01:00 Riyadh on 1 July is 22:00 UTC on
--     30 June, and getting this wrong moves it into the previous window.

WITH config AS (
  SELECT
    'adf8ee78-cf78-4f02-932c-989a214bdd78'::uuid AS company_id,
    -- The month you are LOOKING FROM. The window is the three whole months
    -- before it. For the figures the brief quotes, this is October 2026.
    DATE '2026-10-01' AS as_of_month
),
window_bounds AS (
  SELECT
    ((c.as_of_month - INTERVAL '3 months') AT TIME ZONE 'Asia/Riyadh')  AS win_start,
    ((c.as_of_month AT TIME ZONE 'Asia/Riyadh') - INTERVAL '1 second')  AS win_end
  FROM config c
),
contributors AS (
  SELECT u.id
  FROM users u, config c
  WHERE u.company_id = c.company_id
    AND u.is_active IS TRUE
    AND u.role IN ('salesman', 'supervisor')
),
created AS (
  SELECT
    d.id,
    d.stage,
    -- See the marker note above: add `d.is_imported IS TRUE OR` here once
    -- migrations/add_deals_is_imported.sql has been applied.
    (d.invoice_number ILIKE 'PRE-CRM%') AS is_imported_history
  FROM deals d, config c, window_bounds w
  WHERE d.company_id = c.company_id
    AND d.owner_id IN (SELECT id FROM contributors)
    AND d.created_at >= w.win_start
    AND d.created_at <= w.win_end
),
worked AS (
  SELECT * FROM created WHERE NOT is_imported_history
)
SELECT
  (SELECT win_start FROM window_bounds)                           AS window_from,
  (SELECT win_end   FROM window_bounds)                           AS window_to,
  (SELECT COUNT(*) FROM created)                                  AS created_all,
  (SELECT COUNT(*) FROM created WHERE is_imported_history)         AS imported_excluded,
  (SELECT COUNT(*) FROM worked)                                   AS created_worked,
  (SELECT COUNT(*) FROM worked WHERE stage = 'won')               AS won_worked,
  ROUND(
    CASE WHEN (SELECT COUNT(*) FROM worked) = 0 THEN 0
         ELSE (SELECT COUNT(*) FROM worked WHERE stage = 'won')::numeric
              / (SELECT COUNT(*) FROM worked) * 100
    END, 1)                                                       AS conversion_3m_pct;
-- <<< THE REFERENCE FIGURE


-- ============================================================================
-- 4. ANNUAL TARGET  —  what the annual view measures against
-- ============================================================================
--
-- computeAnnualTarget: the explicit YEARLY rows, taken MAX PER PERSON — a
-- revised annual target REPLACES, it does not add. When nobody in scope holds
-- one, the application falls back to the sum of that year's monthly rows (NOT
-- monthly × 12, which invented targets for months that had not happened).
--
-- Run section 2 with period_start = Jan 1 and period_end = Dec 31 of the same
-- year to get the "monthly assigned" figure the annual view shows beside this.

WITH config AS (
  SELECT
    'adf8ee78-cf78-4f02-932c-989a214bdd78'::uuid AS company_id,
    2026 AS target_year
),
achievers AS (
  SELECT u.id
  FROM users u, config c
  WHERE u.company_id = c.company_id
    AND u.is_active IS TRUE
    AND (u.role IN ('salesman', 'supervisor') OR u.is_contributor IS TRUE)
),
yearly AS (
  SELECT
    t.assigned_to,
    MAX(COALESCE(t.target_amount, 0)) AS person_yearly
  FROM sales_targets t, config c
  WHERE t.company_id = c.company_id
    AND t.status = 'active'
    AND t.period_type = 'yearly'
    AND EXTRACT(YEAR FROM t.period_start) = c.target_year
    AND t.assigned_to IN (SELECT id FROM achievers)
  GROUP BY t.assigned_to
)
SELECT
  (SELECT target_year FROM config)    AS year,
  COUNT(*)                            AS people_with_a_yearly_row,
  COALESCE(SUM(person_yearly), 0)     AS annual_allocation   -- <<< THE REFERENCE
FROM yearly;


-- ============================================================================
-- 5. PER-PERSON BREAKDOWN  —  for finding WHICH person a difference is in
-- ============================================================================
--
-- The same three figures, one row per person. When a total disagrees, this says
-- who it disagrees about — which is almost always faster than re-reading the
-- rule.

WITH config AS (
  SELECT
    'adf8ee78-cf78-4f02-932c-989a214bdd78'::uuid AS company_id,
    DATE '2026-09-01' AS period_start,
    DATE '2026-09-30' AS period_end
),
achievers AS (
  SELECT u.id, u.full_name, u.role, u.is_contributor
  FROM users u, config c
  WHERE u.company_id = c.company_id
    AND u.is_active IS TRUE
    AND (u.role IN ('salesman', 'supervisor') OR u.is_contributor IS TRUE)
),
inv AS (
  SELECT d.owner_id,
         COUNT(*) AS invoices,
         SUM(COALESCE(d.final_amount, d.amount)) AS gross
  FROM deals d, config c
  WHERE d.company_id = c.company_id
    AND d.stage = 'won'
    AND d.is_invoiced IS TRUE
    AND d.invoice_date BETWEEN c.period_start AND c.period_end
  GROUP BY d.owner_id
),
ret AS (
  SELECT rd.owner_id, SUM(ABS(r.return_amount)) AS returns_total
  FROM deal_returns r
  JOIN deals rd ON rd.id = r.deal_id
  CROSS JOIN config c
  WHERE r.company_id = c.company_id
    AND r.return_date BETWEEN c.period_start AND c.period_end
  GROUP BY rd.owner_id
),
tgt_rows AS (
  SELECT t.id, t.assigned_to, t.period_start,
         COALESCE(t.target_amount, 0)       AS own_amount,
         COALESCE(SUM(ct.target_amount), 0) AS child_sum,
         COUNT(ct.id)                       AS child_count
  FROM sales_targets t
  LEFT JOIN client_targets ct ON ct.sales_target_id = t.id
  CROSS JOIN config c
  WHERE t.company_id = c.company_id
    AND t.status = 'active'
    AND t.period_type = 'monthly'
    AND t.period_start <= c.period_end
    AND t.period_end   >= c.period_start
  GROUP BY t.id, t.assigned_to, t.period_start, t.target_amount
),
tgt AS (
  SELECT assigned_to,
         SUM(CASE WHEN child_count = 0 THEN own_amount
                  ELSE GREATEST(own_amount, child_sum) END) AS person_target,
         COUNT(*) AS rows_held
  FROM tgt_rows
  GROUP BY assigned_to
)
SELECT
  a.full_name,
  a.role,
  a.is_contributor,
  COALESCE(t.rows_held, 0)                                      AS target_rows,
  COALESCE(t.person_target, 0)                                  AS target,
  COALESCE(i.invoices, 0)                                       AS invoices,
  COALESCE(i.gross, 0)                                          AS achieved_gross,
  COALESCE(r.returns_total, 0)                                  AS returns,
  COALESCE(i.gross, 0) - COALESCE(r.returns_total, 0)           AS achieved_net
FROM achievers a
LEFT JOIN inv i ON i.owner_id   = a.id
LEFT JOIN ret r ON r.owner_id   = a.id
LEFT JOIN tgt t ON t.assigned_to = a.id
ORDER BY achieved_net DESC, a.full_name;


-- ============================================================================
-- ROLLBACK
-- ============================================================================
-- None is possible and none is needed: nothing above changes anything.
-- ============================================================================
