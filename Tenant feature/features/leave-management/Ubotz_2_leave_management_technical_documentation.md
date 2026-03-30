# UBOTZ 2.0 — Leave Management — Technical Specification

## Scope

Tenant-scoped leave **types**, **requests**, **balances**, **year-end rollover**, and **team calendar**. Controllers live under `App\Http\TenantAdminDashboard\LeaveManagement\Controllers\`; use cases under `App\Application\TenantAdminDashboard\LeaveManagement\UseCases\`.

## Route entry point

| File | Prefix (effective) |
|------|---------------------|
| `backend/routes/tenant_dashboard/leave.php` | `/api/tenant/leave` |

All routes are nested under the tenant API group (same authentication and tenant resolution as other tenant dashboard routes).

## Capabilities

Defined in `TenantCapabilitySeeder` (examples):

| Capability | Purpose |
|------------|---------|
| `leave.view` | List and read requests; read balances (including `balances/me`); read single request |
| `leave.request` | Active leave types + submit new requests |
| `leave.approve` | Pending count, approve/reject |
| `leave.manage` | Full leave type CRUD, org-wide balances, allocate, rollover preview/execute, team calendar |

**Route ordering:** `GET leave/requests/pending-count` is registered **before** `GET leave/requests/{id}` so `pending-count` is not captured as an id.

## HTTP map (summary)

| Method | Path | Capability |
|--------|------|------------|
| GET/POST | `/leave/types`, `/leave/types/{id}`, PUT, DELETE, POST `.../deactivate` | `leave.manage` |
| GET | `/leave/types/active` | `leave.request` |
| POST | `/leave/requests` | `leave.request` |
| GET | `/leave/requests` | `leave.view` |
| GET | `/leave/requests/pending-count` | `leave.approve` |
| POST | `/leave/requests/{id}/approve`, `.../reject` | `leave.approve` |
| GET | `/leave/requests/{id}` | `leave.view` |
| GET | `/leave/balances/me` | `leave.view` |
| GET/POST | `/leave/balances`, `/leave/balances/{userId}`, `/leave/balances/allocate` | `leave.manage` |
| GET/POST | `/leave/rollover/preview`, `/leave/rollover/execute` | `leave.manage` |
| GET | `/leave/calendar` | `leave.manage` |

## Application use cases

Under `LeaveManagement\UseCases\`:

- Types: `CreateLeaveTypeUseCase`, `UpdateLeaveTypeUseCase`, `DeactivateLeaveTypeUseCase`, `DeleteLeaveTypeUseCase`
- Requests: `CreateLeaveRequestUseCase`, `ApproveLeaveRequestUseCase`, `RejectLeaveRequestUseCase`
- Balances / rollover: `AllocateLeaveBalancesUseCase`, `ProcessYearEndRolloverUseCase`

Approval deducts balance inside a DB transaction with pessimistic locking on balances; overlap is re-checked at approval time via `LeaveOverlapDetectionServiceInterface` (see `ApproveLeaveRequestUseCase`).

## Persistence (tenant)

Migrations (examples):

- `2026_03_23_000001_create_leave_types_table.php`
- `2026_03_23_000002_create_leave_balances_table.php`
- `2026_03_23_000003_create_leave_requests_table.php` — includes `requested_days` decimal(5,1), `is_half_day` / `half_day_period`, status, approver/rejector metadata, and `idx_leave_req_overlap` for range-style queries

Foreign keys reference `tenants`, `users`, and `leave_types` within the tenant database.

## Frontend reference

`frontend/config/api-endpoints.ts` — object **`TENANT_LEAVE`** (paths mirror `leave.php` exactly).

---

## Linked references

- **Users** — requesters and approvers
- **Attendance** — any future integration should subscribe to domain events or explicit application hooks; the current leave module does not require a `LeaveApprovedEvent` by that name in the repository snapshot
