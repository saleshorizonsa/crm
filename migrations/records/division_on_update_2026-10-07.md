# division_on_update.sql — pre-repair record, 2026-10-07

The state of `division_id` around the repair in
[`../division_on_update.sql`](../division_on_update.sql), applied on production
at **2026-10-07 22:21 (Asia/Riyadh)**.

This file exists because the repair cannot be reconstructed from the database.
Once a NULL `division_id` is filled, the column no longer records that it was
ever NULL, so nothing in Postgres can say which rows the repair touched. The
migration's ROLLBACK block drops the triggers but deliberately leaves the data
as repaired; **this list is the only basis for reverting it.**

---

## 1. The one row the repair changed

| | |
|---|---|
| Table | `deals` |
| Id | `8232d669-6d28-4536-95d6-ff836b62d593` |
| Title | SAUDI CARBOTAE CO. LTD |
| Amount | 18,315.00 SAR |
| Owner | Alseyed Mohammed Diba (active, primary division PVC Sheet) |
| `division_id` before | **NULL** |
| `division_id` after | PVC Sheet (`d0e42466-b0d3-4816-a18b-dbe91415c3e7`) |
| Changed at | 2026-10-07 22:21 Asia/Riyadh |
| `updated_at` | unchanged at `2026-10-07 13:10:07.557865+00` — the repair ran with the `updated_at` triggers disabled, so the row is not recorded as edited by it |

How it became NULL: the deal was created at 13:08:06 UTC and the BEFORE INSERT
trigger set its division from the owner's primary. It was edited two minutes
later, at 13:10:07 UTC, and `DealModal` sent
`division_id: formData.division_id || null` on that edit path, writing NULL over
the division. October's divisions then summed to 1,936,329.71 against a company
figure of 1,954,644.71 — short by exactly this deal's 18,315.00, which is how it
was found. The app now omits the key instead of nulling it (`04f13e1`), and the
BEFORE UPDATE triggers refill it if anything ever nulls it again.

### To revert this row

Disable the `updated_at` trigger first, or the revert will restamp the row as
edited — the same reason the repair disabled it:

```sql
ALTER TABLE public.deals DISABLE TRIGGER update_deals_updated_at;
-- The BEFORE UPDATE guard would immediately refill the division from the
-- owner's primary, so it has to be off as well for the revert to stick.
ALTER TABLE public.deals DISABLE TRIGGER set_deals_division_on_update;

UPDATE public.deals SET division_id = NULL
 WHERE id = '8232d669-6d28-4536-95d6-ff836b62d593';

ALTER TABLE public.deals ENABLE TRIGGER set_deals_division_on_update;
ALTER TABLE public.deals ENABLE TRIGGER update_deals_updated_at;
```

---

## 2. The 60 rows the repair left NULL

Rows whose owner has **no primary division at all**, so there is nothing to
attribute them to. Both owners are inactive: Shaikh Osman Shoukat (57 rows — 33
deals, 8 future orders, 7 plan items, 9 target rows) and Mueataz Mohammed Ahmed
(3 target rows). Insights falls back to the owner's
primary division for a NULL row, which for these two is also NULL, so no
division is short because of them — which is why `/numbers-check` reports this
count rather than asserting it is zero.

Regenerated with PREVIEW 2's query **after** the repair, by which point it
returns exactly the rows the repair did not touch. The counts match PREVIEW 2's
pre-repair output row for row (33 deals, 8 future orders, 7 plan items, 12
target rows), and the repaired deal above is correctly absent.

<details>
<summary>The query</summary>

```sql
WITH rows_null AS (
  SELECT 'deals'         AS tbl, d.id, d.title                                   AS label, d.owner_id    AS person
    FROM deals d          WHERE d.division_id IS NULL
  UNION ALL
  SELECT 'opportunities',       o.id, o.customer_name,                                 o.owner_id
    FROM opportunities o  WHERE o.division_id IS NULL
  UNION ALL
  SELECT 'future_orders',       f.id, f.customer_name,                                 f.owner_id
    FROM future_orders f  WHERE f.division_id IS NULL
  UNION ALL
  SELECT 'sales_targets',       t.id, t.target_type::text || ' ' || t.period_start::text, t.assigned_to
    FROM sales_targets t  WHERE t.division_id IS NULL
)
SELECT r.tbl,
       CASE WHEN u.sales_division_id IS NULL THEN 'LEFT AS IS (owner has no primary)'
            ELSE 'WILL BE REPAIRED -> ' || sd.name END AS outcome,
       r.id, r.label, u.full_name AS owner, u.is_active
FROM rows_null r
JOIN users u                 ON u.id  = r.person
LEFT JOIN sales_divisions sd ON sd.id = u.sales_division_id
ORDER BY (u.sales_division_id IS NULL), r.tbl, r.label;
```

</details>

Every row below returned `outcome = LEFT AS IS (owner has no primary)` and
`is_active = false`.

### deals — 33 rows, all Shaikh Osman Shoukat

| id | title |
|---|---|
| `cf4738d5-1d7a-4cb4-bcab-e1c45be1e3af` | Bahra Cables |
| `bea2453f-fdc2-4483-beb0-07b0d6c0332a` | MARJAN POWER TRADING |
| `b1c8d660-153d-4a04-8627-cd36716ba7fe` | PLASTICO BAHRAIN |
| `6b6a9053-a85d-4be0-ae69-7a0e22625f6b` | Potential client for UPVC Compound |
| `fd538610-47fe-4690-81b6-433b83462bf4` | Potential Client for UPVC Compound |
| `ade60382-bc37-497d-b587-0270eaf351de` | Potential Customer for UPVC Compound |
| `6ea9c904-00c0-4faa-9e9a-10d8263a1808` | Potential Customer for UPVC Compound |
| `ed47e7e3-83c8-4f29-b597-101c934c0d14` | Potential Customer for UPVC Compound |
| `d9cd2e7f-645f-493b-baf3-25a8e1f6b58a` | Potential Customer for UPVC Compound |
| `6fedd148-fec1-42bc-bbe7-3d10c01c2dee` | PVC COMPOUND |
| `4e82b3bb-6393-4190-9ca4-2cdea357d716` | UNITED PLASTICS |
| `0ce91b60-03fc-4df4-8e29-0e3aa5511c3c` | UPVC COMPOUND |
| `94432abd-0ff7-43d0-8e1a-9ae8658cb943` | UPVC COMPOUND |
| `5e8f9caf-b237-4356-a22b-5802e3a286ed` | UPVC COMPOUND |
| `d5097951-7e07-4727-a338-bf3a72a77f52` | UPVC COMPOUND |
| `1118b4ed-7237-4b73-a4aa-c1f5446ac147` | UPVC COMPOUND |
| `60b14129-2c3d-431e-8aa0-e479d22d2a63` | UPVC COMPOUND |
| `757ed1a9-e02b-4cca-ae4b-376534c2fcf2` | UPVC COMPOUND |
| `68197694-f77d-41af-ac0c-b6bfbdf9e78d` | UPVC COMPOUND (50 TONS) WHITE |
| `8de28096-d7a0-4b5a-a6ab-3f9c371c35f9` | UPVC COMPOUND (BLACK) |
| `9c1f3caa-f650-463d-ae29-b0ce6c101a36` | UPVC COMPOUND (BLACK) |
| `68dda78f-4b13-48e0-a7fd-2377e2e86c94` | UPVC COMPOUND (WHITE) |
| `f9cfa686-0952-4616-b8aa-769d20804489` | UPVC COMPOUND (WHITE) |
| `9f412f96-3a4b-4df5-8266-f421d2ba2027` | UPVC COMPOUND (WHITE) |
| `cd6b3e23-a6bb-49c0-8714-e774296ead05` | UPVC COMPOUND (WHITE) |
| `080c71cd-b281-4795-9a36-1589f9774645` | UPVC COMPOUND (WHITE) |
| `f61c4805-03fc-492a-8cfc-2a72840092ba` | UPVC COMPOUND 15 TONS (WHITE) |
| `8b544974-d14f-4183-b7ff-7b9dee1d6f53` | UPVC COMPOUND 20 TONS(WHITE) |
| `651e0f1b-59b5-4ff4-b3d0-236716f077e5` | UPVC COMPOUND 25 TONS |
| `2f4e2d0f-b515-45b5-a93c-93a8a50e8104` | UPVC COMPOUND 5 TONS (GREY COMPOUND) |
| `a8406696-ebae-41f9-8b5c-84bce4f4996e` | UPVC GREY COMPOUND (10 TONS) |
| `0ae00ed8-5321-4949-9883-63f12e5d8967` | UPVC RIDGE |
| `de066b7e-7992-438c-8963-5eafe41a772e` | UPVC WHITE COMPOUND |

### future_orders — 8 rows, all Shaikh Osman Shoukat

| id | customer_name |
|---|---|
| `9e6ff1dd-cf82-47c0-ae84-bd3bcad04c2f` | PVC AND HDPE CORRUGATED PIPES |
| `63fc0e6d-5df1-4456-810f-52851ad9a609` | UPVC COMP (WHITE) 10 TONS |
| `21e1d698-685f-490f-8a16-c775a3c5cd94` | UPVC COMP (WHITE) 15 TONS |
| `8b53365f-b5f9-44cd-8950-125e32b1102e` | UPVC COMP (WHITE) 20 TONS |
| `1732b5fb-7b55-42e5-b84f-e712dd7c4b4f` | UPVC COMP(ORANGE) 50 TONS |
| `99f5a562-9be6-4795-b128-4191dbfe94b0` | UPVC COMPOUND |
| `371a6586-c9ac-499c-bd4b-48628eb26fbb` | upvc compound grey |
| `6f7c08e6-03bd-4fab-8775-6924d1a2f00d` | UPVC COMPOUND PLASTICO |

### opportunities — 7 rows, all Shaikh Osman Shoukat

| id | customer_name |
|---|---|
| `6a40239f-114a-469b-b781-fab8a3099fb9` | AL JAZIRA EXTENSION INDUSTRIAL CO. |
| `426e533a-dd60-435f-930e-a631cc6423c1` | ALSEHLY PLASTIC FACTORY |
| `87d786f4-a610-411a-be6b-fc5a97a10536` | Bahra Cables |
| `dc0111a4-a0bd-44bd-a2d7-f87771e7587b` | MARJAN POWER TRADING |
| `46633df0-dc11-4359-99e1-194a05affb11` | MARJAN POWER TRADING |
| `3411833f-cfb4-4b6c-b2c3-c7785dcf1de4` | PLASTICO BAHRAIN |
| `1382565b-296e-43d3-8cf3-552afb1a2d57` | SAUDI EEGA |

### sales_targets — 12 rows

| id | target_type · period_start | assignee |
|---|---|---|
| `19e072db-2a2c-4319-80bc-59c60adea043` | by_clients · 2026-05-01 | Shaikh Osman Shoukat |
| `c7b8ac69-c558-48ab-bdff-dc6938c726f0` | by_clients · 2026-06-01 | Shaikh Osman Shoukat |
| `0c4cdf3d-b9e1-4e9d-8577-21a8079b13c9` | by_clients · 2026-07-01 | Shaikh Osman Shoukat |
| `308ff244-baba-435c-8188-db8cd3356361` | total_value · 2026-01-01 | Mueataz Mohammed Ahmed |
| `62e5538c-873e-42f8-9789-2da648a82186` | total_value · 2026-01-01 | Shaikh Osman Shoukat |
| `7de85944-1f49-4a37-860d-480d3e48e691` | total_value · 2026-02-01 | Mueataz Mohammed Ahmed |
| `cfce34d8-5387-494c-8151-5264f77ef0d6` | total_value · 2026-02-01 | Shaikh Osman Shoukat |
| `ed9da967-c1f2-437a-8839-5a3bed1ef15c` | total_value · 2026-03-01 | Mueataz Mohammed Ahmed |
| `9b3d0f2f-eb0c-4907-889a-8ab20f0fc4ac` | total_value · 2026-03-01 | Shaikh Osman Shoukat |
| `5813a215-ddb2-4d0f-b89e-c6a7fa837337` | total_value · 2026-04-01 | Shaikh Osman Shoukat |
| `698a7aa1-d60c-418c-853c-a6c1f98e45ec` | total_value · 2026-08-01 | Shaikh Osman Shoukat |
| `91a8af10-bcb3-46ef-acf9-7740c557292c` | total_value · 2026-09-01 | Shaikh Osman Shoukat |

---

## If these 60 ever need attributing

Give the two owners a primary division (`users.sales_division_id`) and re-run
the repair UPDATEs from the migration's APPLY block — the BEFORE UPDATE triggers
alone will not touch these rows, because nothing updates them. Until then they
are counted at company level and in no division, which is correct: the people
who owned them are gone and the work is not anyone's division's to claim.
