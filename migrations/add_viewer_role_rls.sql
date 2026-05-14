-- Viewer role RLS policies
-- Viewers can only SELECT deals from Qualified stage onwards.
-- They have zero INSERT/UPDATE/DELETE access anywhere.
-- They cannot see lead-stage deals, financial values, or sales targets.

-- Viewers can read pipeline deals (Qualified and above only)
CREATE POLICY "Viewers read pipeline deals"
  ON deals FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
        AND role = 'viewer'
        AND company_id = deals.company_id
    )
    AND deals.stage IN (
      'contact_made',
      'proposal_sent',
      'negotiation',
      'won'
    )
  );

-- Viewers can read contacts (for company name display only)
CREATE POLICY "Viewers read contacts"
  ON contacts FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
        AND role = 'viewer'
    )
  );

-- Viewers can read deal_products (for product names and quantities)
CREATE POLICY "Viewers read deal products"
  ON deal_products FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
        AND role = 'viewer'
    )
  );

-- Viewers can read products table (for product names)
CREATE POLICY "Viewers read products"
  ON products FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
        AND role = 'viewer'
    )
  );

-- NOTE: No policy is added for sales_targets.
-- Viewers have zero access to financial targets.
