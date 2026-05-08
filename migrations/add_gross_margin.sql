-- Add cost_price to products table
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS cost_price NUMERIC(12,2);

-- Add margin columns to deals table
ALTER TABLE deals
  ADD COLUMN IF NOT EXISTS total_cost      NUMERIC(15,2),
  ADD COLUMN IF NOT EXISTS gross_margin    NUMERIC(15,2),
  ADD COLUMN IF NOT EXISTS margin_pct      NUMERIC(6,2);

-- Add margin columns to deal_products table
ALTER TABLE deal_products
  ADD COLUMN IF NOT EXISTS cost_price   NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS line_cost    NUMERIC(15,2),
  ADD COLUMN IF NOT EXISTS line_margin  NUMERIC(15,2),
  ADD COLUMN IF NOT EXISTS margin_pct   NUMERIC(6,2);

-- Indexes for margin queries
CREATE INDEX IF NOT EXISTS idx_deals_margin_pct       ON deals(margin_pct);
CREATE INDEX IF NOT EXISTS idx_deal_products_margin   ON deal_products(line_margin);
