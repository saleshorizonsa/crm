-- Migration: Update RLS policies to allow managers to assign targets directly to salesmen
-- Date: 2025-12-22
-- Description: Enable managers to assign sales targets to both supervisors and salesmen (direct and indirect reports)

-- =====================================================
-- 1. Update can_assign_target_to_user function
-- =====================================================

-- Drop and recreate the function with updated logic
DROP FUNCTION IF EXISTS can_assign_target_to_user(uuid, uuid);

CREATE OR REPLACE FUNCTION can_assign_target_to_user(assigner_id uuid, assignee_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECUxisting RLS policies already handle this correctly via can_assign_target_to_user function

-- =====================================================
-- 3. Add helpful comment for reference
-- =====================================================

COMMENT ON FUNCTION can_assign_target_to_user IS 
'Determines if a user can assign a sales target to another user based on hierarchy:
- Directors → Managers
- Managers → Supervisors (direct reports)
- Managers → Salesmen (direct or indirect reports) ✨ NEW
- Supervisors → Salesmen (direct reports only)'
CREATE INDEX IF NOT EXISTS idx_sales_targets_assigned_to ON sales_targets(assigned_to);
CREATE INDEX IF NOT EXISTS idx_sales_targets_assigned_by ON sales_targets(assigned_by);
CREATE INDEX IF NOT EXISTS idx_sales_targets_company_id ON sales_targets(company_id);

-- Index for client_targets if it exists
DO $$ 
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'client_targets') THEN
    CREATE INDEX IF NOT EXISTS idx_client_targets_assigned_to ON client_targets(assigned_to);
    CREATE INDEX IF NOT EXISTS idx_client_targets_assigned_by ON client_targets(assigned_by);
    CREATE INDEX IF NOT EXISTS idx_client_targets_company_id ON client_targets(company_id);
  END IF;
END $$;

-- Index for users hierarchy lookups
CREATE INDEX IF NOT EXISTS idx_users_supervisor_id ON users(supervisor_id);
CREATE INDEX IF NOT EXISTS idx_users_role_active ON users(role, is_active);

-- =====================================================
-- 4. Create helper function to get all subordinates
-- =====================================================

-- Drop existing function if it exists
DROP FUNCTION IF EXISTS get_all_subordinates(uuid);

-- Create recursive function to get all subordinates at any level
CREATE OR REPLACE FUNCTION get_all_subordinates(manager_id uuid)
RETURNS TABLE (
  subordinate_id uuid,
  subordinate_name text,
  subordinate_email text,
  subordinate_role text,
  level integer
) AS $$
BEGIN
  RETURN QUERY
  WITH RECURSIVE subordinate_hierarchy AS (
    -- Base case: direct reports
    SELECT 
      u.id as subordinate_id,
      u.full_name as subordinate_name,
      u.email as subordinate_email,
      u.role as subordinate_role,
      1 as level
    FROM users u
    WHERE u.supervisor_id = manager_id
    AND u.is_active = true
    
    UNION ALL
    
    -- Recursive case: subordinates of subordinates
    SELECT 
      u.id,
      u.full_name,
      u.email,
      u.role,
      sh.level + 1
    FROM users u
    INNER JOIN subordinate_hierarchy sh ON u.supervisor_id = sh.subordinate_id
    WHERE u.is_active = true
    AND sh.level < 10 -- Prevent infinite recursion
  )
  SELECT * FROM subordinate_hierarchy
  ORDER BY level, subordinate_name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION get_all_subordinates(uuid) TO authenticated;


-- =====================================================
-- SUMMARY OF CHANGES
-- =====================================================
-- 
-- **MAIN CHANGE**: Updated can_assign_target_to_user() function to allow:
--   ✨ Managers → Salesmen (direct or indirect reports) - NEW FUNCTIONALITY
--
-- **HIERARCHY NOW SUPPORTED**:
-- ✅ Directors → Managers
-- ✅ Managers → Supervisors (direct reports)
-- ✅ Managers → Salesmen (direct reports) - NEW
-- ✅ Managers → Salesmen (indirect via supervisors) - NEW  
-- ✅ Supervisors → Salesmen (direct reports)
--
-- **WHY THIS WORKS**:
-- The existing RLS policy on sales_targets INSERT already uses:
--   can_assign_target_to_user(auth.uid(), assigned_to)
-- 
-- By updating this function, the policy automatically enforces the new rules.
-- No need to modify the policy itself.
--
-- **FRONTEND**: No changes required. The ManagerSalesTargetAssignment 
-- component already filters for both 'supervisor' and 'salesman' roles 
-- and getUserSubordinates() returns all levels of subordinates.

-- Supervisors → Salesmen
