# UBOTZ 2.0 Attendance Technical Specification

## Core Architecture
`Attendance` bridges physical or digital live executions (`timetable_sessions`, `batches`, `branches`) with individual student logging. The baseline infrastructure manifests via `2026_03_16_054341_create_attendance_sessions_table.php`.

## Relational Schema Maps (`attendance_sessions`)
| Column | Technical Significance |
| :--- | :--- |
| **Tenancy** | `tenant_id` - Governed by `fk_attendance_sessions_tenants`, scoped structurally context-wide. |
| **Resolution Maps** | `batch_id`, `subject_id`, `teacher_id`, `branch_id` - Extensive normalized bindings. Allows aggregate queries like "$O(1)$ index lookup of all missed physics sessions taught by Staff #44 at the Delhi Branch". |
| **Temporal Logic** | `locked_at` - Crucial immutability token. If `$session->locked_at != null`, mutations to attendance statuses are fundamentally rejected by the `UpdateAttendanceStatusUseCase` to preserve rigorous academic auditing. |

### Index Optimization Strategy
Attendance generates rapid, monolithic payloads (e.g., 200 students per batch marked daily). To support this write-intensity:
- Uniqueness enforced at `unq_attendance_sessions_tenant_timetable` blocking duplicate roster instantiation.
- High-velocity read indexing implemented at `idx_attendance_sessions_tenant_date` and `idx_attendance_sessions_tenant_batch`. 

## Capability and Policy Invariants
Operations triggering new `attendance_sessions` or committing `marked_by` sign-offs evaluate the `attendance.manage` capability. Direct manipulation of the child records (`attendance_records`) relies entirely on the state boundaries (locked/unlocked) established by this parent entity.
