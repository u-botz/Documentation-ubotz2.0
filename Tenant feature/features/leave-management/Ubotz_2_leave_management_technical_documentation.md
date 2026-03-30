# UBOTZ 2.0 Leave Management Technical Specification

## Core Architecture
The Leave module is a request-based state machine context (`TenantAdminDashboard\Leave`).

## Relational Schema Constraints (`leave_requests`)
Derived from the `2026_03_23_000003_create_leave_requests_table.php` schema:

| Column | Technical Significance |
| :--- | :--- |
| **`tenant_id`** | Structural isolation key. |
| **`requested_days`** | Decimal (5,1) to support half-day increments. |
| **`from_date` / `to_date`** | Date bounds for overlap checking. |
| **`status`** | The state machine anchor (`pending`, `approved`, `rejected`). |

## Key Technical Workflows

### Overlap Detection (Prevention)
To prevent duplicate requests for the same day:
- **Index**: `idx_leave_req_overlap` is optimized for range checks.
- **Logic**: The `SubmitLeaveRequestUseCase` queries for existing records where the `status` is not rejected and the date range intersects with the new request.

### Balance Settlement
Upon `approval`:
1. The system identifies the user's `leave_balances` for that specific `leave_type_id`.
2. It atomically decrements the `available_days`.
3. It emits a `LeaveApprovedEvent`, which the Attendance module listens to for flagging excused absences.

## Tenancy & Security
- **Isolation**: Tenant-specific `leave_types` (e.g. "Dubai National Day Leave") are only visible to the relevant institution.
- **Privilege**: Only users with `leave.approve` capabilities (Branch Managers/Owners) can mutate the `status` from `pending`.

---

## Linked References
- Related Modules: `Attendance`, `User`.
