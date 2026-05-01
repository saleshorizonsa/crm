# Task Security and Type Update

## Overview

This update implements strict task ownership security and adds a task type field to the task management system.

## Changes Made

### 1. Database Migration

**File:** `supabase/migrations/20251115000000_add_task_type_and_rls.sql`

- **Added `task_type` column** to tasks table with two options:

  - `visit` - For visit-related tasks
  - `general` - For general tasks (default)

- **Implemented Row Level Security (RLS)** policies:
  - Users can only **VIEW** tasks they created (`created_by`)
  - Users can only **CREATE** tasks where they are the owner
  - Users can only **UPDATE** their own tasks
  - Users can only **DELETE** their own tasks

### 2. Frontend Updates

#### Task Detail Modal

**File:** `src/pages/task-management/components/TaskDetailModal.jsx`

- Added `task_type` field to form state
- Added Task Type dropdown with "General" and "Visit" options
- Updated form layout to 3-column grid (Priority, Status, Task Type)

#### Task Modal (Quick Actions)

**File:** `src/pages/company-dashboard/components/modals/TaskModal.jsx`

- Added `task_type` field to form state
- Added `taskTypes` options array
- Added Task Type dropdown to the form
- Updated form layout to 3-column grid (Priority, Status, Task Type)

### 3. Backend Service Updates

**File:** `src/services/supabaseService.js`

#### `getMyTasks()` Function

- **Changed from:** `.or(\`assigned_to.eq.${userId},created_by.eq.${userId}\`)`
- **Changed to:** `.eq("created_by", userId)`
- **Reason:** Ensures users only see tasks they created (not assigned to them)

#### `getTaskStats()` Function

- **Added `userId` parameter** (optional)
- **Filters by `created_by`** when userId is provided
- **Ensures statistics** only reflect user's own tasks

#### `getTeamTasks()` Function

- **Changed from:** `.or(\`assigned_to.in.(...),created_by.in.(...)\`)`
- **Changed to:** `.in("created_by", userIds)`
- **Reason:** Team views (managers/supervisors) only see tasks created by team members

#### Task Management Page

**File:** `src/pages/task-management/index.jsx`

- Updated `loadStats()` to pass `user.id` to `getTaskStats(company.id, user.id)`

## Security Model

### Before

- Tasks were visible if user was **assigned to** OR **created** the task
- Multiple users could see the same task

### After

- Tasks are **ONLY** visible to the user who created them (`created_by`)
- Each task has a single owner (creator)
- Database-level RLS policies enforce this at the PostgreSQL level
- Application-level queries filter by `created_by` for additional security

## Task Type Field

### Options

1. **General** (default) - Standard tasks, follow-ups, reminders, etc.
2. **Visit** - Customer visits, site visits, field tasks, etc.

### Usage

- Dropdown appears in both task creation modals
- Default value is "general"
- Existing tasks without type are updated to "general" by migration
- Required field (cannot be empty)

## Migration Instructions

1. **Apply the database migration:**

   ```bash
   # This will be applied automatically through Supabase
   ```

2. **The migration will:**

   - Add the `task_type` column
   - Set existing tasks to 'general'
   - Enable RLS on the tasks table
   - Create 4 security policies (SELECT, INSERT, UPDATE, DELETE)

3. **No code changes needed** - All updates are backward compatible

## Testing Checklist

- [ ] Create a new task and verify only creator can see it
- [ ] Verify task type dropdown shows "General" and "Visit"
- [ ] Verify existing tasks are accessible
- [ ] Test that another user cannot see your tasks
- [ ] Verify task statistics only count your own tasks
- [ ] Test task creation from both Task Management page and Quick Actions
- [ ] Verify RLS policies prevent unauthorized access

## Impact

### Positive

✅ Enhanced security - tasks are truly private to the creator
✅ Better task categorization with type field
✅ Database-level security enforcement
✅ Complies with data privacy requirements

### Considerations

⚠️ Users can no longer see tasks assigned to them by others
⚠️ Team visibility is limited to creator-only
⚠️ If task collaboration is needed, consider adding a "shared tasks" feature

## Future Enhancements

1. **Task Sharing** - Allow users to explicitly share tasks with others
2. **More Task Types** - Add types like "call", "email", "meeting"
3. **Task Templates** - Pre-defined task structures for common workflows
4. **Task Comments** - Allow notes/updates on tasks
5. **Task Attachments** - Upload files related to tasks
