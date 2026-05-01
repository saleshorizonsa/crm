-- Migration: Add product-based sales targets
-- Description: Adds optional product pricing and product-level target rows while preserving existing targets.

-- Product Master default/unit price. Nullable to keep existing products valid.
ALTER TABLE products
ADD COLUMN IF NOT EXISTS unit_price numeric(12,2);

-- Persist target type for new and existing sales target flows.
ALTER TABLE sales_targets
ADD COLUMN IF NOT EXISTS target_type text DEFAULT 'total_value';

UPDATE sales_targets
SET target_type = 'total_value'
WHERE target_type IS NULL;

-- Product-level target rows. One sales target can contain multiple product targets.
CREATE TABLE IF NOT EXISTS product_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_target_id uuid NOT NULL REFERENCES sales_targets(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id),
  target_quantity numeric(12,2),
  target_value numeric(12,2),
  unit_price numeric(12,2),
  currency text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  CONSTRAINT product_targets_qty_or_value_check
    CHECK (
      target_quantity IS NOT NULL
      OR target_value IS NOT NULL
    )
);

CREATE INDEX IF NOT EXISTS idx_product_targets_sales_target_id
  ON product_targets(sales_target_id);

CREATE INDEX IF NOT EXISTS idx_product_targets_product_id
  ON product_targets(product_id);

CREATE INDEX IF NOT EXISTS idx_product_targets_sales_target_product
  ON product_targets(sales_target_id, product_id);

ALTER TABLE product_targets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view related product targets" ON product_targets;
CREATE POLICY "Users can view related product targets"
ON product_targets
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM sales_targets st
    WHERE st.id = product_targets.sales_target_id
      AND (
        st.assigned_by = auth.uid()
        OR st.assigned_to = auth.uid()
        OR EXISTS (
          SELECT 1
          FROM users u
          WHERE u.id = auth.uid()
            AND u.company_id = st.company_id
            AND u.role IN ('admin', 'director', 'head', 'manager', 'supervisor')
            AND COALESCE(u.is_active, true) = true
        )
      )
  )
);

DROP POLICY IF EXISTS "Users can insert product targets for assignable sales targets" ON product_targets;
CREATE POLICY "Users can insert product targets for assignable sales targets"
ON product_targets
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM sales_targets st
    WHERE st.id = product_targets.sales_target_id
      AND st.assigned_by = auth.uid()
      AND can_assign_target_to_user(auth.uid(), st.assigned_to)
  )
);

DROP POLICY IF EXISTS "Users can update related product targets" ON product_targets;
CREATE POLICY "Users can update related product targets"
ON product_targets
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM sales_targets st
    WHERE st.id = product_targets.sales_target_id
      AND st.assigned_by = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM sales_targets st
    WHERE st.id = product_targets.sales_target_id
      AND st.assigned_by = auth.uid()
  )
);

DROP POLICY IF EXISTS "Users can delete related product targets" ON product_targets;
CREATE POLICY "Users can delete related product targets"
ON product_targets
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM sales_targets st
    WHERE st.id = product_targets.sales_target_id
      AND st.assigned_by = auth.uid()
  )
);
