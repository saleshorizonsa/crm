-- ============================================================
-- Migration: add_material_groups.sql
-- Creates dedicated tables for material groups and sub groups,
-- seeds them from existing product data, and sets up RLS.
-- Run once in Supabase SQL Editor.
-- ============================================================

-- 1. Material groups master table
CREATE TABLE IF NOT EXISTS material_groups (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid REFERENCES companies(id) ON DELETE CASCADE,
  name        text NOT NULL,
  sort_order  integer DEFAULT 0,
  is_active   boolean DEFAULT true,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now(),
  UNIQUE (company_id, name)
);

-- 2. Sub groups table
CREATE TABLE IF NOT EXISTS material_sub_groups (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        uuid REFERENCES companies(id) ON DELETE CASCADE,
  material_group_id uuid REFERENCES material_groups(id) ON DELETE CASCADE,
  name              text NOT NULL,
  sort_order        integer DEFAULT 0,
  is_active         boolean DEFAULT true,
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now(),
  UNIQUE (material_group_id, name)
);

-- 3. Enable RLS
ALTER TABLE material_groups      ENABLE ROW LEVEL SECURITY;
ALTER TABLE material_sub_groups  ENABLE ROW LEVEL SECURITY;

-- 4. RLS policies — read
CREATE POLICY "Company users read groups"
  ON material_groups FOR SELECT
  USING (
    company_id IN (
      SELECT company_id FROM users WHERE id = auth.uid()
    )
  );

CREATE POLICY "Company users read sub groups"
  ON material_sub_groups FOR SELECT
  USING (
    company_id IN (
      SELECT company_id FROM users WHERE id = auth.uid()
    )
  );

-- 5. RLS policies — admin write
CREATE POLICY "Admin manages groups"
  ON material_groups FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
        AND role IN ('admin', 'director')
    )
  );

CREATE POLICY "Admin manages sub groups"
  ON material_sub_groups FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
        AND role IN ('admin', 'director')
    )
  );

-- 6. Seed groups from existing products data
INSERT INTO material_groups (company_id, name)
SELECT DISTINCT
  company_id,
  TRIM(COALESCE(product_group, material_group))
FROM products
WHERE TRIM(COALESCE(product_group, material_group)) IS NOT NULL
  AND company_id IS NOT NULL
ON CONFLICT (company_id, name) DO NOTHING;

-- 7. Seed sub groups from existing products data
INSERT INTO material_sub_groups (company_id, material_group_id, name)
SELECT DISTINCT
  p.company_id,
  mg.id,
  TRIM(p.sub_group)
FROM products p
JOIN material_groups mg
  ON mg.company_id = p.company_id
  AND mg.name = TRIM(COALESCE(p.product_group, p.material_group))
WHERE TRIM(p.sub_group) IS NOT NULL
ON CONFLICT (material_group_id, name) DO NOTHING;
