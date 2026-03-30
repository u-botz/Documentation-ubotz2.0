# UBOTZ 2.0 Timetable Technical Specification

## Core Architecture
The Timetable is a complex state-management context (`TenantAdminDashboard\Timetable`). It handles multi-dimensional conflict detection (Teacher vs. Batch vs. Venue).

## Relational Schema Constraints

### 1. Settings (`timetable_settings`)
- **`tenant_id`**: Foundational unique key.
- **`conflict_mode`**: Governs the strictness of the `ConflictDetectionService`.

### 2. Sessions (`timetable_sessions`)
- **`tenant_id`**, `batch_id`, `teacher_id`, `branch_id`.
- **`start_time` / `end_time`**: DateTime bounds.
- **Indices**: `idx_timetable_sessions_tenant_time` allows for rapid $O(1)$ lookups for day-view and week-view calendars.

## Key Technical Workflows

### Conflict Detection (The "Triage")
Before saving a new session or editing an existing one, the `DetectTimetableConflictsUseCase` scans for intersections:
1. `teacher_id` same time? (Instructor Overlap)
2. `batch_id` same time? (Batch Overlap)
3. `branch_id` + `venue` same time? (Venue Overlap)

### Batch-Wide Generation
1. Admin submits a recurrence pattern (e.g. MWF 9-11AM).
2. The `GenerateBatchTimetablesJob` iterates through child dates.
3. It performs individual conflict checks for every proposed slot.
4. It bulk-commits the valid sessions to the database.

## Tenancy & Security
Every query is limited by `tenant_id`. The `timetable_settings` are unique per tenant, ensuring that logic like "Conflict Mode" is never leaked between organizations.

---

## Linked References
- Related Modules: `Batch`, `Attendance`.
