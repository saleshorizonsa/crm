# Hierarchy Update: Managers Can Assign Targets to Salesmen

## Overview
Successfully updated the database hierarchy permissions to allow Managers to assign targets directly to Salesmen (in addition to Supervisors).

## Date Applied
December 2024

## Migration Applied
- **Migration Name**: `update_hierarchy_rls_for_managers_v2`
- **Status**: ✅ Successfully Applied
- **Location**: `/migrations/update_hierarchy_rls_for_managers_v2.sql`

## Changes Made

### 1. Updated `can_assign_target_to_user()` Function
The database function that controls target assignment permissions was updated to support the new hierarchy path.

**NEW Capability Added:**
```sql
-- Managers can now assign to salesmen (direct or indirect reports)
IF assigner_role = 'manager' AND assignee_role = 'salesman' THEN
    -- Check if salesman is a direct report
    SELECT EXISTS(
        SELECT 1 FROM users 
        WHERE id = assignee_id AND supervisor_id = assigner_id
    ) INTO is_subordinate;
    
    IF is_subordinate THEN
        RETURN TRUE;
    END IF;
    
    -- Check if salesman is an indirect report (under a supervisor who reports to this manager)
    SELECT EXISTS(
        SELECT 1 FROM users salesman
        INNER JOIN users supervisor ON salesman.supervisor_id = supervisor.id
        WHERE salesman.id = assignee_id 
        AND supervisor.supervisor_id = assigner_id
        AND salesman.role = 'salesman'
        AND supervisor.role = 'supervisor'
    ) INTO is_subordinate;
    
    RETURN is_subordinate;
END IF;
```

### 2. Recreated Dependent RLS Policy
The policy "Users can assign targets to subordinates" on `sales_targets` table was automatically recreated during the function update (using CASCADE).

## Supported Hierarchy Paths

### Before Update
- ✅ Directors → Managers
- ✅ Managers → Supervisors (direct reports)
- ✅ Supervisors → Salesmen (direct reports)

### After Update
- ✅ Directors → Managers
- ✅ Managers → Supervisors (direct reports)
- ✅ **Managers → Salesmen (direct reports)** ⭐ NEW
- ✅ **Managers → Salesmen (indirect via supervisors)** ⭐ NEW
- ✅ Supervisors → Salesmen (direct reports)

## Frontend Compatibility

### Components Already Supporting New Hierarchy
1. **ManagerSalesTargetAssignment.jsx** (Lines 87-88)
   - Already filters for both `supervisor` and `salesman` roles
   - No frontend changes needed

2. **Database RLS Policies**
   - INSERT policy on `sales_targets` uses `can_assign_target_to_user()` function
   - Automatically enforces new permissions without policy modifications

## Security Considerations

1. **Maintains Existing Security:**
   - All previous hierarchy paths remain functional
   - No existing permissions were removed

2. **Scope Limited:**
   - Managers can only assign to their direct or indirect reports
   - Cannot assign to salesmen outside their hierarchy
   - Company-level checks still enforced

3. **Verified Through:**
   - Direct report check (salesman.supervisor_id = manager_id)
   - Indirect report check (salesman → supervisor → manager chain)

## Testing Recommendations

1. **Manager → Direct Report Salesman**
   - Log in as a manager
   - Attempt to assign target to a salesman who directly reports to them
   - Expected: Success

2. **Manager → Indirect Report Salesman**
   - Log in as a manager
   - Attempt to assign target to a salesman under one of their supervisors
   - Expected: Success

3. **Manager → Outside Hierarchy Salesman**
   - Log in as a manager
   - Attempt to assign target to a salesman in a different manager's team
   - Expected: Permission denied

## Technical Details

### Database Function
- **Name**: `can_assign_target_to_user(uuid, uuid)`
- **Returns**: boolean
- **Security**: SECURITY DEFINER
- **Parameters**: assigner_id, assignee_id

### Affected Tables
- `sales_targets` (RLS enabled, 12 rows)
- Uses function in INSERT policy

### Related Functions
- `get_user_subordinates(uuid)` - Not modified, still supports recursive hierarchy
- `can_manage_user_contacts(uuid, uuid)` - Not modified

## Rollback Procedure
If rollback is needed, restore the previous version of `can_assign_target_to_user` function by removing the manager→salesman section:

```sql
DROP FUNCTION IF EXISTS can_assign_target_to_user(uuid, uuid) CASCADE;
-- Then recreate with old definition (see git history)
-- Recreate dependent policies
```

## Notes
- No data migration required (table structure unchanged)
- No frontend code changes required
- Changes are backward compatible
- All existing targets remain valid
