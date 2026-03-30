# UBOTZ 2.0 — Leave Management Implementation Plan

## Staff Leave Management System (TenantAdminDashboard)

| Field | Value |
|-------|--------|
| **Document Type** | Implementation Plan (Revised — All Audit Findings Resolved) |
| **Feature** | Leave Management — Types, Balances, Requests, Approvals, Attendance Integration |
| **Date** | March 19, 2026 |
| **Authority** | [Ubotz_2_leave_management_developer_instructions.md](./Ubotz_2_leave_management_developer_instructions.md) |
| **Manual** | [Ubotz 2 developer instruction manual .md](../Ubotz%202%20developer%20instruction%20manual%20.md) |
| **Prerequisites** | Staff Attendance system COMPLETE; Phase 14 COMPLETE (Notification Infrastructure); Phase 10A–10E COMPLETE (Tenant RBAC) |
| **Revision Status** | CRIT-01 ✅ CRIT-02 ✅ ARCH-01 ✅ ARCH-02 ✅ SEC-01 ✅ MAINT-01 ✅ MAINT-02 ✅ |
| **Frontend (Next.js)** | [UBOTZ_2_LEAVE_MANAGEMENT_FRONTEND_INTEGRATION_PLAN.md](../../../frontend/documentation/UBOTZ_2_LEAVE_MANAGEMENT_FRONTEND_INTEGRATION_PLAN.md) — tenant dashboard UI under `/tenant-admin-dashboard/leave` |

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Scope](#2-scope)
3. [Architecture Alignment](#3-architecture-alignment)
4. [Application Commands & Queries](#4-application-commands--queries)
5. [Implementation Phases](#5-implementation-phases)
6. [Database Detail](#6-database-detail)
7. [API Contract & Security Rules](#7-api-contract--security-rules)
8. [Integrations (Attendance & Notifications)](#8-integrations-attendance--notifications)
9. [Capabilities](#9-capabilities)
10. [Audit, Events & Post-Commit Ordering](#10-audit-events--post-commit-ordering)
11. [Holiday Gap Analysis & Fallback](#11-holiday-gap-analysis--fallback)
12. [Service Container Bindings](#12-service-container-bindings)
13. [Quality Gates & Tests](#13-quality-gates--tests)
14. [Definition of Done](#14-definition-of-done)
15. [Files Manifest](#15-files-manifest)

---

## 1. Executive Summary

The Leave Management system extends the existing staff attendance system with a formal lifecycle for requesting, approving, and tracking staff leave. It resides within the **TenantAdminDashboard** bounded context and provides:

- **Leave Types:** Configurable quotas, carry-forward rules, and negative balance settings per tenant.
- **Leave Balances:** Ledger tracking allocated, carried-forward, and used days per employee per year.
- **Leave Requests:** Workflow from `pending` to `approved` or `rejected`, with holiday-aware calculations, half-day support, and overlap detection.
- **Cross-Context Integration:** Automatic creation of `on_leave` staff attendance records via domain events, plus Phase 14 in-app notifications.

---

## 2. Scope

### 2.1 In scope

| Area | Detail |
|------|--------|
| Bounded context | `TenantAdminDashboard/LeaveManagement` |
| Tables | `leave_types`, `leave_balances`, `leave_requests` (tenant-scoped migrations) |
| Application | Immutable Commands per use case; explicit Query classes |
| Use cases | Type CRUD + Deactivate, Balance Allocation & Rollover, Request Submit / Approve / Reject |
| Queries | List Types, List Balances, List Requests, Get Request Detail, Pending Count, Rollover Preview, Team Calendar |
| Integration | `MarkStaffOnLeaveListener` (Attendance context), `leave` Notification Category (Phase 14) |
| Holiday Integration | `HolidayQueryServiceInterface` abstraction with defensive fallback |

### 2.2 Out of scope

- Student leave management.
- Multi-level approval chains (Phase 1 is single approver).
- Cancel or revoke actions on leave requests (approve/reject only).
- Leave encashment, compensatory off, or payroll calculation beyond raw data.
- Automatic year-end rollover via scheduler (manual admin trigger only).

---

## 3. Architecture Alignment

Following the **Developer Instruction Manual**, the implementation must enforce strict layer dependencies.

| Rule | Implementation Strategy |
|------|-------------------------|
| **Pure Domain Entities** | `LeaveRequestEntity`, `LeaveTypeEntity`, `LeaveBalanceEntity` have ZERO `Illuminate` imports. They enforce rules like state transitions (`pending → approved`) and record events. |
| **No Eloquent in Domain** | Domain interfaces (`LeaveRequestRepositoryInterface`) are implemented in Infrastructure (`EloquentLeaveRequestRepository`). |
| **Tenant Isolation** | Every repository method, UseCase, and Query explicitly requires `$tenantId` and uses explicit `WHERE tenant_id = ?` alongside the `BelongsToTenant` global scope (belt-and-suspenders). |
| **Pessimistic Locking** | `ApproveLeaveRequestUseCase` uses `lockForUpdate()` on `leave_balances` inside `DB::transaction()` to prevent race conditions in concurrent approvals (BR-21, §10 Concurrency). |
| **Audit Logging** | **(CRIT-01 Fix)** Audit logging is performed OUTSIDE and AFTER the `DB::transaction()` commit. See §10 for the enforced execution ordering. |
| **Event Dispatching** | Events (`LeaveRequestApproved`) are collected via `$entity->releaseEvents()` and dispatched AFTER the audit log, in accordance with the UseCase Template in §22 of the developer manual. |
| **HTTP Namespace (Pattern B)** | **(CRIT-02 Fix)** All HTTP layer files follow `Http/TenantAdminDashboard/LeaveManagement/{Controllers|Requests|Resources}/`, not the legacy `Http/Controllers/Api/` path. |

---

## 4. Application Commands & Queries

### Write Operations (Commands)

All commands are `final class` with `declare(strict_types=1)` and `public readonly` properties.

| Command | Fields |
|---------|--------|
| `CreateLeaveTypeCommand` | `tenantId`, `actorId`, `name`, `code`, `annualQuotaDays`, `isCarryForwardAllowed`, `maxCarryForwardDays`, `allowsNegativeBalance`, `isPaid` |
| `UpdateLeaveTypeCommand` | `tenantId`, `actorId`, `leaveTypeId`, `name`, `annualQuotaDays`, `isCarryForwardAllowed`, `maxCarryForwardDays`, `allowsNegativeBalance`, `isPaid` |
| `DeactivateLeaveTypeCommand` | `tenantId`, `actorId`, `leaveTypeId` |
| `DeleteLeaveTypeCommand` | `tenantId`, `actorId`, `leaveTypeId` |
| `CreateLeaveRequestCommand` | `tenantId`, `actorId` (requesting user), `leaveTypeId`, `fromDate`, `toDate`, `isHalfDay`, `halfDayPeriod`, `reason` |
| `ApproveLeaveRequestCommand` | `tenantId`, `approverId`, `requestId` |
| `RejectLeaveRequestCommand` | `tenantId`, `approverId`, `requestId`, `rejectionReason` |
| `AllocateLeaveBalancesCommand` | `tenantId`, `actorId`, `userId`, `leaveTypeId`, `year`, `allocatedDays`, `carriedForwardDays` |
| `ProcessRolloverCommand` | `tenantId`, `actorId`, `targetYear` |

### Read Operations (Queries)

| Query Class | Parameters | Returns |
|-------------|------------|---------|
| `ListLeaveTypesQuery` | `tenantId`, `activeOnly?` | `LeaveTypeDTO[]` |
| `GetLeaveTypeQuery` | `tenantId`, `leaveTypeId` | `LeaveTypeDTO` |
| `ListLeaveRequestsQuery` | `tenantId`, `viewerId`, `viewerCanManage`, `status?`, `leaveTypeId?`, `userId?`, `fromDate?`, `toDate?`, `page`, `perPage` | paginated `LeaveRequestDTO[]` |
| `GetLeaveRequestQuery` | `tenantId`, `requestId`, `viewerId`, `viewerCapabilities` | `LeaveRequestDTO` |
| `GetEmployeeLeaveBalancesQuery` | `tenantId`, `userId`, `year` | `LeaveBalanceDTO[]` with computed `available_days` |
| `ListAllLeaveBalancesQuery` | `tenantId`, `year`, `categoryId?`, `page`, `perPage` | paginated `LeaveBalanceDTO[]` |
| `GetPendingRequestsCountQuery` | `tenantId` | `int` |
| `PreviewYearEndRolloverQuery` | `tenantId`, `targetYear` | `RolloverPreviewDTO[]` |
| `GetTeamLeaveCalendarQuery` | `tenantId`, `fromDate`, `toDate` | `CalendarEntryDTO[]` |

---

## 5. Implementation Phases

| Phase | Focus | Tasks |
|-------|-------|-------|
| **Phase A** | Schema & Capabilities | 1. Migrations: `leave_types`, `leave_balances`, `leave_requests` (including all 3 indexes on `leave_requests`).<br>2. Add `leave.*` capabilities to seeder with correct default roles. |
| **Phase B** | Domain Layer | 1. Value Objects: `LeaveStatus`, `HalfDayPeriod`, `LeaveDateRange`.<br>2. Domain Entities: `LeaveTypeEntity`, `LeaveRequestEntity`, `LeaveBalanceEntity`.<br>3. Domain Events: `LeaveRequestCreated`, `LeaveRequestApproved`, `LeaveRequestRejected`, `LeaveTypeCreated`, `LeaveBalancesAllocated`.<br>4. Domain Exceptions (7 total — see §15).<br>5. Repository Interfaces (3) and Service Interfaces (3). |
| **Phase C** | Infrastructure Layer | 1. Eloquent Models (`LeaveTypeRecord`, `LeaveRequestRecord`, `LeaveBalanceRecord`) with `BelongsToTenant`.<br>2. Eloquent Repositories (3 implementations).<br>3. Service implementations: `EloquentLeaveDayCalculationService`, `EloquentLeaveOverlapDetectionService`.<br>4. `EloquentHolidayQueryService` with defensive fallback (see §11). |
| **Phase D** | Application: Type & Balance | 1. Leave Type UseCases: `CreateLeaveTypeUseCase`, `UpdateLeaveTypeUseCase`, `DeactivateLeaveTypeUseCase`, `DeleteLeaveTypeUseCase`.<br>2. Balance UseCases: `AllocateLeaveBalancesUseCase`, `ProcessYearEndRolloverUseCase`.<br>3. Read Queries for types and balances. |
| **Phase E** | Application: Request Lifecycle | 1. `CreateLeaveRequestUseCase` — validates balance, overlap, holidays; dispatches `LeaveRequestCreated`.<br>2. `ApproveLeaveRequestUseCase` — pessimistic lock on balance, deducts `used_days`, dispatches `LeaveRequestApproved`.<br>3. `RejectLeaveRequestUseCase` — validates reason length, dispatches `LeaveRequestRejected`.<br>4. Read Queries for requests (including detail with visibility logic). |
| **Phase F** | Integrations & HTTP | 1. `MarkStaffOnLeaveListener` in Attendance context (investigate current `StaffAttendanceEntity` half-day support).<br>2. `NotifyApproversOnLeaveRequestListener`, `NotifyRequesterOnLeaveDecisionListener`.<br>3. `leave` notification category registration.<br>4. Read/Write Controllers following Pattern B namespace.<br>5. Form Requests (syntax validation only).<br>6. API Resources.<br>7. Route file `routes/tenant_dashboard/leave.php`, loaded from `routes/api.php`. |
| **Phase G** | `LeaveManagementServiceProvider` | Bind all 6 interface → implementation pairs in the service container. Register provider in `config/app.php`. |
| **Phase H** | Tests | Unit (entities, VOs, day calculation) + Feature (HTTP lifecycle, isolation, concurrency) — covering all 15 critical scenarios from §13. |

---

## 6. Database Detail

**Location:** `database/migrations/tenant/`

### Table: `leave_types`

| Column | Type | Notes |
|--------|------|-------|
| `id` | BIGINT UNSIGNED PK | Auto-increment |
| `tenant_id` | BIGINT UNSIGNED FK | Cascade delete to `tenants` |
| `name` | VARCHAR(100) | Display name |
| `code` | VARCHAR(50) | Immutable after creation, unique per tenant |
| `annual_quota_days` | DECIMAL(5,1) | Supports half-days (e.g., 10.5) |
| `is_carry_forward_allowed` | BOOLEAN | Default: false |
| `max_carry_forward_days` | DECIMAL(5,1) | Default: 0 |
| `allows_negative_balance` | BOOLEAN | Default: false |
| `is_paid` | BOOLEAN | Default: true. Informational only. |
| `is_active` | BOOLEAN | Default: true |
| `created_at`, `updated_at` | TIMESTAMP | |

**Indexes:**
- `uniq_leave_type_tenant_code` → UNIQUE `(tenant_id, code)`
- `idx_leave_type_tenant_active` → `(tenant_id, is_active)`

---

### Table: `leave_balances`

| Column | Type | Notes |
|--------|------|-------|
| `id` | BIGINT UNSIGNED PK | |
| `tenant_id` | BIGINT UNSIGNED FK | Cascade to `tenants` |
| `user_id` | BIGINT UNSIGNED FK | Cascade to `users` |
| `leave_type_id` | BIGINT UNSIGNED FK | Cascade to `leave_types` |
| `year` | SMALLINT UNSIGNED | Calendar year (e.g., 2026) |
| `allocated_days` | DECIMAL(5,1) | Annual quota for this year |
| `carried_forward_days` | DECIMAL(5,1) | Default: 0 |
| `used_days` | DECIMAL(5,1) | Default: 0. Incremented on approval only. |
| `created_at`, `updated_at` | TIMESTAMP | |

**Note:** `available_days` is NOT stored. Computed at read time: `allocated_days + carried_forward_days - used_days`.

**Indexes:**
- `uniq_leave_bal_user_type_year` → UNIQUE `(tenant_id, user_id, leave_type_id, year)`
- `idx_leave_bal_tenant_year` → `(tenant_id, year)`

---

### Table: `leave_requests`

| Column | Type | Notes |
|--------|------|-------|
| `id` | BIGINT UNSIGNED PK | |
| `tenant_id` | BIGINT UNSIGNED FK | Cascade to `tenants` |
| `user_id` | BIGINT UNSIGNED FK | Cascade to `users` |
| `leave_type_id` | BIGINT UNSIGNED FK | Cascade to `leave_types` |
| `from_date` | DATE | |
| `to_date` | DATE | Inclusive |
| `is_half_day` | BOOLEAN | Default: false |
| `half_day_period` | VARCHAR(20) | NULL unless half-day; `first_half` or `second_half` |
| `requested_days` | DECIMAL(5,1) | Snapshot computed at creation. Never recalculated. |
| `reason` | TEXT | Required |
| `status` | VARCHAR(20) | `pending`, `approved`, `rejected`. Default: `pending`. |
| `approved_by_user_id` | BIGINT UNSIGNED | NULL until approved |
| `approved_at` | TIMESTAMP NULL | |
| `rejection_reason` | TEXT NULL | Mandatory on rejection |
| `rejected_by_user_id` | BIGINT UNSIGNED NULL | |
| `rejected_at` | TIMESTAMP NULL | |
| `created_at`, `updated_at` | TIMESTAMP | |

**Note:** NO `deleted_at`. Leave requests are permanent audit records and are never deleted.

**Indexes (ARCH-01 Fix — all 3 required):**
- `idx_leave_req_tenant_user_status` → `(tenant_id, user_id, status)` — "my pending requests" query
- `idx_leave_req_tenant_status` → `(tenant_id, status)` — "all pending requests" for approvers
- `idx_leave_req_overlap` → `(tenant_id, user_id, status, from_date, to_date)` — overlap detection query. **Required to prevent full scans on long-tenured employees with years of leave history.**

---

## 7. API Contract & Security Rules

### Capability Matrix

| Capability | Who Has It | Access Granted |
|------------|------------|----------------|
| `leave.view` | OWNER, ADMIN, TEACHER, STAFF | Own balances, own requests |
| `leave.request` | TEACHER, STAFF | Submit leave requests |
| `leave.approve` | OWNER, ADMIN | View all pending, approve or reject |
| `leave.manage` | OWNER, ADMIN | Everything: configure types, all balances, all requests, rollover |

### Leave Type Endpoints (`leave.manage` required for all)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `POST` | `/api/tenant/leave/types` | Create a leave type |
| `GET` | `/api/tenant/leave/types` | List all types (active + inactive) |
| `GET` | `/api/tenant/leave/types/{id}` | Get leave type detail |
| `PUT` | `/api/tenant/leave/types/{id}` | Update leave type (not code) |
| `POST` | `/api/tenant/leave/types/{id}/deactivate` | **(ARCH-02 Fix)** Deactivate — sets `is_active = false`. Blocked if type is already inactive. Distinct from delete. |
| `DELETE` | `/api/tenant/leave/types/{id}` | Delete type (blocked if any requests reference it — `LeaveTypeInUseException` → 422) |

### Leave Request Endpoints

| Method | Endpoint | Capability | Visibility Rule |
|--------|----------|------------|-----------------|
| `POST` | `/api/tenant/leave/requests` | `leave.request` | Creates for the authenticated user only |
| `GET` | `/api/tenant/leave/requests` | `leave.view` | Own requests. With `leave.manage`: all employees. Filterable: `status`, `leave_type_id`, `user_id` (manage only), `from_date`, `to_date`. |
| `GET` | `/api/tenant/leave/requests/{id}` | `leave.view` | **(SEC-01 Fix)** Visibility rules: (a) `leave.manage` → any request. (b) `leave.approve` → any request (approvers must be able to view before acting). (c) `leave.view` only → own requests. Attempt to fetch another user's request without manage/approve → 404 (not 403 — anti-enumeration). Cross-tenant access → 404. |
| `GET` | `/api/tenant/leave/requests/pending-count` | `leave.approve` | Count of all pending requests in tenant |
| `POST` | `/api/tenant/leave/requests/{id}/approve` | `leave.approve` | Approve a pending request. Self-approval blocked (`SelfApprovalNotAllowedException` → 422). |
| `POST` | `/api/tenant/leave/requests/{id}/reject` | `leave.approve` | Reject. Requires `rejection_reason` (min 10 chars). |

### Leave Balance Endpoints

| Method | Endpoint | Capability | Purpose |
|--------|----------|------------|---------|
| `GET` | `/api/tenant/leave/balances/me` | `leave.view` | Own balances for current year with computed `available_days` |
| `GET` | `/api/tenant/leave/balances/{userId}` | `leave.manage` | Specific employee's balances |
| `GET` | `/api/tenant/leave/balances` | `leave.manage` | All employees' balances for a year. Filter: `year`, `category_id`. |
| `POST` | `/api/tenant/leave/balances/allocate` | `leave.manage` | Manually allocate/adjust balances |
| `GET` | `/api/tenant/leave/rollover/preview` | `leave.manage` | Rollover preview (no side effects) |
| `POST` | `/api/tenant/leave/rollover/execute` | `leave.manage` | Execute year-end rollover. Blocked if target year already processed (`RolloverAlreadyProcessedException` → 409). |

### Team Calendar Endpoint

| Method | Endpoint | Capability | Purpose |
|--------|----------|------------|---------|
| `GET` | `/api/tenant/leave/calendar` | `leave.manage` | Approved leave for all staff in a date range. Requires `from_date`, `to_date`. |

### Route Registration

All routes go in `routes/tenant_dashboard/leave.php`. This file is included in `routes/api.php` within the tenant dashboard route group with the tenant module middleware.

---

## 8. Integrations (Attendance & Notifications)

### Attendance Integration

- **Listener class:** `App\Application\TenantAdminDashboard\Attendance\Listeners\MarkStaffOnLeaveListener`
- **Lives in Attendance context**, not Leave context — follows the established bounded-context listener placement convention.
- **Trigger:** `LeaveRequestApproved` domain event.
- **Action:**
  1. Iterate over each calendar day in `fromDate → toDate` (inclusive).
  2. Skip dates that fall on holidays (use same `HolidayQueryServiceInterface`).
  3. For each remaining date: check if a staff attendance record already exists for this user + date. If yes, skip. If no, create `on_leave` attendance record.
- **Failure isolation (BR-31):** If attendance creation fails (e.g. a constraint violation), the leave approval must NOT roll back. The listener runs post-commit and logs failures without re-throwing.
- **Half-day handling (BR-30):** The developer **MUST** inspect the current `StaffAttendanceEntity` and `StaffAttendanceStatus` to determine whether half-day is a first-class concept (e.g., a `half_day` status) or requires a metadata extension (e.g., a `metadata` JSON column). This investigation happens in Phase F before implementing the listener.

### Phase 14 Notification Integration

Add `leave` to the notification category system:
- Opt-out eligible: Yes
- Default: Enabled (in-app channel)

| Listener | Location | Trigger | Recipient |
|----------|----------|---------|-----------|
| `NotifyApproversOnLeaveRequestListener` | `Application/.../LeaveManagement/Listeners/` | `LeaveRequestCreated` | All users with `leave.approve` in the tenant |
| `NotifyRequesterOnLeaveDecisionListener` | `Application/.../LeaveManagement/Listeners/` | `LeaveRequestApproved` / `LeaveRequestRejected` | The requesting employee |

---

## 9. Capabilities

Add to `TenantCapabilitySeeder`:

| Code | Default Roles |
|------|---------------|
| `leave.view` | OWNER, ADMIN, TEACHER, STAFF |
| `leave.request` | TEACHER, STAFF |
| `leave.approve` | OWNER, ADMIN |
| `leave.manage` | OWNER, ADMIN |

**Notes:**
- `leave.view` does NOT grant visibility into other employees' leave. A staff member with `leave.view` sees only their own requests and balances.
- `leave.request` is intentionally NOT given to OWNER and ADMIN by default.
- `leave.approve` without `leave.manage` allows approval but not type configuration.

---

## 10. Audit, Events & Post-Commit Ordering

### **(CRIT-01 Fix) Correct UseCase Execution Order**

The platform convention from Phase 6+ (BR-42) requires audit logging to be written OUTSIDE the transaction. The following ordering is **mandatory** for all write UseCases in this module:

```
Step 1: Load and lock entities (inside transaction)
Step 2: Perform domain operation — entity state transition, balance deduction, etc.
Step 3: Persist via repository (inside transaction)
Step 4: Collect domain events via $entity->releaseEvents() (inside transaction)
Step 5: DB::transaction() commits
──── TRANSACTION BOUNDARY ────
Step 6: Audit log (AFTER commit — outside transaction)
Step 7: Dispatch domain events (AFTER audit log — outside transaction)
```

Pseudocode template:

```php
$result = DB::transaction(function () use ($command) {
    // Step 1: Lock balance if needed
    $balance = LeaveBalanceRecord::where([...])->lockForUpdate()->firstOrFail();
    // Step 2: Validate & transition entity
    $request = $this->requestRepo->findById($command->tenantId, $command->requestId);
    $request->approve($command->approverId);         // Entity enforces state machine
    $this->balanceRepo->incrementUsedDays(...);      // Step 3: Persist balance change
    $saved = $this->requestRepo->save($request);     // Step 3: Persist request
    $events = $request->releaseEvents();             // Step 4: Collect events
    return [$saved, $events];
});
// Step 6: Audit AFTER commit
$this->auditLogger->log(new AuditContext(...));
// Step 7: Dispatch AFTER audit
foreach ($result[1] as $event) { event($event); }
```

### Audit Log Actions

| UseCase | Action Code |
|---------|-------------|
| `CreateLeaveTypeUseCase` | `leave_type.created` |
| `UpdateLeaveTypeUseCase` | `leave_type.updated` |
| `DeactivateLeaveTypeUseCase` | `leave_type.deactivated` |
| `DeleteLeaveTypeUseCase` | `leave_type.deleted` |
| `CreateLeaveRequestUseCase` | `leave_request.created` |
| `ApproveLeaveRequestUseCase` | `leave_request.approved` |
| `RejectLeaveRequestUseCase` | `leave_request.rejected` |
| `AllocateLeaveBalancesUseCase` | `leave_balance.allocated` |
| `ProcessYearEndRolloverUseCase` | `leave_rollover.processed` (metadata: `year`, `employee_count`) |

---

## 11. Holiday Gap Analysis & Fallback

### **(MAINT-02 Fix) Required Developer Investigation**

Before implementing `EloquentHolidayQueryService`, the developer **MUST** perform the following investigation and document the findings here:

1. Search `database/migrations/tenant/` for any migration containing `holidays` (or equivalent table).
2. If found: confirm the columns available (`date`, `tenant_id`, `is_recurring`, etc.) and check whether an existing `HolidayRepositoryInterface` or query service already exists in the codebase.
3. If existing: `EloquentHolidayQueryService` should delegate to the existing query mechanism rather than re-querying the table directly.

### Mandatory Fallback Behavior (BR-26)

Regardless of whether the holiday table exists, `EloquentHolidayQueryService` MUST implement defensive coding:

```php
final class EloquentHolidayQueryService implements HolidayQueryServiceInterface
{
    public function getHolidaysInRange(
        int $tenantId,
        \DateTimeImmutable $from,
        \DateTimeImmutable $to
    ): array {
        try {
            if (!Schema::hasTable('holidays')) {
                return [];   // Degrade gracefully — no table yet
            }
            return DB::table('holidays')
                ->where('tenant_id', $tenantId)
                ->whereBetween('date', [$from->format('Y-m-d'), $to->format('Y-m-d')])
                ->pluck('date')
                ->toArray();
        } catch (\Throwable) {
            return [];       // Never fail leave creation due to holiday unavailability
        }
    }
}
```

- If the table doesn't exist → return `[]` (all days count as leave days).
- If the table exists but is empty → return `[]`.
- If the query throws for any reason → return `[]`, log the error, do not re-throw.

---

## 12. Service Container Bindings

In `App\Infrastructure\Persistence\TenantAdminDashboard\LeaveManagement\LeaveManagementServiceProvider`:

| Interface | Implementation |
|-----------|---------------|
| `LeaveTypeRepositoryInterface` | `EloquentLeaveTypeRepository` |
| `LeaveRequestRepositoryInterface` | `EloquentLeaveRequestRepository` |
| `LeaveBalanceRepositoryInterface` | `EloquentLeaveBalanceRepository` |
| `LeaveDayCalculationServiceInterface` | `EloquentLeaveDayCalculationService` |
| `LeaveOverlapDetectionServiceInterface` | `EloquentLeaveOverlapDetectionService` |
| `HolidayQueryServiceInterface` | `EloquentHolidayQueryService` |

Register `LeaveManagementServiceProvider` in `config/app.php` providers array.

Also register the event listeners in `EventServiceProvider`:
- `LeaveRequestCreated` → `[NotifyApproversOnLeaveRequestListener]`
- `LeaveRequestApproved` → `[NotifyRequesterOnLeaveDecisionListener, MarkStaffOnLeaveListener]`
- `LeaveRequestRejected` → `[NotifyRequesterOnLeaveDecisionListener]`

---

## 13. Quality Gates & Tests

### Architecture Verification (Pre-merge checks)

```bash
# Zero Illuminate imports in Domain layer
grep -rn 'use Illuminate' app/Domain/TenantAdminDashboard/LeaveManagement/
# Must return 0 results.

# Zero DB::table() calls in Application layer
grep -rn 'DB::table' app/Application/TenantAdminDashboard/LeaveManagement/
# Must return 0 results.

# No MySQL ENUMs in migrations
grep -rn '->enum(' database/migrations/tenant/

# PHPStan Level 5
docker exec ubotz_backend vendor/bin/phpstan analyse app/ --level=5
```

### **(MAINT-01 Fix) All 15 Critical Scenarios — Tracked Individually**

The following 15 scenarios from §12.2 of the developer instructions **must each have a dedicated, named test method**. No scenario may be silently dropped.

| # | Scenario | Test File | Status |
|---|----------|-----------|--------|
| 1 | **Insufficient balance, negative NOT allowed** → `InsufficientLeaveBalanceException` on creation | `LeaveRequestCreateTest` | ☐ |
| 2 | **Insufficient balance, negative IS allowed** → request created; balance goes negative on approval | `LeaveRequestCreateTest` | ☐ |
| 3 | **Overlapping dates with existing approved leave** → `LeaveOverlapException` on creation | `LeaveRequestOverlapTest` | ☐ |
| 4 | **Self-approval blocked** → `SelfApprovalNotAllowedException` → HTTP 422 | `LeaveRequestApprovalTest` | ☐ |
| 5 | **Balance re-check at approval time** → request created when balance is sufficient, another approval consumes balance before → second approval fails | `LeaveRequestApprovalTest` | ☐ |
| 6 | **Concurrent approval race condition** → two approvers approve simultaneously for same employee → pessimistic lock serializes; second fails if balance insufficient | `LeaveRequestConcurrencyTest` | ☐ |
| 7 | **Holiday exclusion** → 5 calendar days requested, 1 is a holiday → `requested_days = 4.0` | `LeaveDayCalculationTest` | ☐ |
| 8 | **Half-day validation** → `is_half_day = true` with `from_date ≠ to_date` → rejected | `LeaveRequestCreateTest` | ☐ |
| 9 | **Cross-year request** → `from_date` in 2026, `to_date` in 2027 → rejected | `LeaveRequestCreateTest` | ☐ |
| 10 | **Rollover already processed** → trigger rollover for same year twice → second attempt → `RolloverAlreadyProcessedException` → HTTP 409 | `YearEndRolloverTest` | ☐ |
| 11 | **Carry-forward cap** → 10 unused days, `max_carry_forward_days = 5` → only 5 carry forward, 5 lapse | `YearEndRolloverTest` | ☐ |
| 12 | **Attendance integration on approval** → approve leave → assert `on_leave` attendance records created for each leave day | `LeaveAttendanceIntegrationTest` | ☐ |
| 13 | **Delete leave type with existing requests** → blocked → `LeaveTypeInUseException` → HTTP 422 | `LeaveTypeManagementTest` | ☐ |
| 14 | **Past date request** → `from_date` before today → rejected → HTTP 422 | `LeaveRequestCreateTest` | ☐ |
| 15 | **Tenant isolation** → Employee in Tenant A cannot see Tenant B's leave types, balances, or requests → HTTP 404 | `LeaveManagementTenantIsolationTest` | ☐ |

### Test Category Summary (~70–100 tests)

| Category | Est. Count | Description |
|----------|------------|-------------|
| Unit: Domain Entities | 10–15 | State machine (`pending → approved/rejected`), immutable code, half-day single-day validation, `LeaveDateRange` self-validation |
| Unit: Value Objects | 5–8 | `LeaveStatus` illegal transitions, `HalfDayPeriod`, `LeaveDateRange` (same-year, future-date guards) |
| Unit: Day Calculation | 5–8 | Holiday exclusion, half-day = 0.5, multi-day count, zero holidays fallback |
| Feature: Leave Type CRUD | 5–8 | Create, update (not code), deactivate, delete-blocked, list |
| Feature: Leave Request Lifecycle | 15–20 | Scenarios 1–9, 13–14 above |
| Feature: Balance & Rollover | 8–12 | Allocation, rollover correctness, scenario 10–11 |
| Feature: Attendance Listener | 3–5 | Scenario 12, idempotency (existing record not overwritten), holiday day skipped |
| Feature: API Endpoints | 15–20 | Full HTTP lifecycle, capability enforcement, self-approval, visibility rules (SEC-01) |
| Feature: Notifications | 2–3 | `LeaveRequestCreated` → approver notification; decision → requester notification |
| Feature: Concurrency | 2–3 | Scenario 6 — concurrent approval with pessimistic locking |
| **Total** | **~70–100** | |

---

## 14. Definition of Done

1. ✅ This revised implementation plan approved by Principal Engineer.
2. ✅ All CRIT-01, CRIT-02, ARCH-01, ARCH-02, SEC-01, MAINT-01, MAINT-02 findings resolved in this document.
3. ☐ All 3 migrations created (including all 3 indexes on `leave_requests`).
4. ☐ Domain layer: zero `use Illuminate` imports (verified by grep).
5. ☐ Application layer: zero `DB::table()` calls (verified by grep).
6. ☐ Audit logging confirmed to run AFTER `DB::transaction()` commit (Code Review checkpoint).
7. ☐ Pessimistic locking (`lockForUpdate()`) present in `ApproveLeaveRequestUseCase` (Code Review checkpoint).
8. ☐ HTTP layer files under `Http/TenantAdminDashboard/LeaveManagement/` (Pattern B).
9. ☐ `GET /requests/{id}` implements ownership + capability check: manage sees all, approve sees all pending, view sees own only — anything else returns 404.
10. ☐ `POST .../deactivate` endpoint and `DeactivateLeaveTypeUseCase` implemented.
11. ☐ `EloquentHolidayQueryService` is defensive — returns `[]` if table absent, no exception thrown.
12. ☐ All 15 critical scenarios from §13 have named passing test methods.
13. ☐ `MarkStaffOnLeaveListener` does not overwrite existing attendance records.
14. ☐ Phase 14 notifications fire for all 3 events.
15. ☐ Tenant isolation: cross-tenant access returns 404, verified by a dedicated feature test.
16. ☐ PHPStan Level 5 passes.
17. ☐ End-to-end demo: configure types → allocate balances → submit request → calculate days (holiday-aware) → approve (pessimistic lock) → balance deducts → attendance marks `on_leave` → requester notified.
18. ☐ Phase Completion Report signed off.

---

## 15. Files Manifest

### Database Migrations (tenant)
- `YYYY_MM_DD_000001_create_leave_types_table.php`
- `YYYY_MM_DD_000002_create_leave_balances_table.php`
- `YYYY_MM_DD_000003_create_leave_requests_table.php`

### Domain Layer
```
app/Domain/TenantAdminDashboard/LeaveManagement/
├── Entities/
│   ├── LeaveTypeEntity.php
│   ├── LeaveRequestEntity.php
│   └── LeaveBalanceEntity.php
├── ValueObjects/
│   ├── LeaveStatus.php
│   ├── HalfDayPeriod.php
│   └── LeaveDateRange.php
├── Events/
│   ├── LeaveRequestCreated.php
│   ├── LeaveRequestApproved.php
│   ├── LeaveRequestRejected.php
│   ├── LeaveTypeCreated.php
│   └── LeaveBalancesAllocated.php
├── Exceptions/
│   ├── InvalidLeaveStatusTransitionException.php
│   ├── InsufficientLeaveBalanceException.php
│   ├── LeaveOverlapException.php
│   ├── SelfApprovalNotAllowedException.php
│   ├── LeaveTypeInUseException.php
│   ├── LeaveTypeNotFoundException.php
│   ├── LeaveRequestNotFoundException.php
│   └── RolloverAlreadyProcessedException.php
├── Repositories/
│   ├── LeaveTypeRepositoryInterface.php
│   ├── LeaveRequestRepositoryInterface.php
│   └── LeaveBalanceRepositoryInterface.php
└── Services/
    ├── LeaveDayCalculationServiceInterface.php
    ├── LeaveOverlapDetectionServiceInterface.php
    └── HolidayQueryServiceInterface.php
```

### Application Layer
```
app/Application/TenantAdminDashboard/LeaveManagement/
├── Commands/
│   ├── CreateLeaveTypeCommand.php
│   ├── UpdateLeaveTypeCommand.php
│   ├── DeactivateLeaveTypeCommand.php
│   ├── DeleteLeaveTypeCommand.php
│   ├── CreateLeaveRequestCommand.php
│   ├── ApproveLeaveRequestCommand.php
│   ├── RejectLeaveRequestCommand.php
│   ├── AllocateLeaveBalancesCommand.php
│   └── ProcessRolloverCommand.php
├── UseCases/
│   ├── CreateLeaveTypeUseCase.php
│   ├── UpdateLeaveTypeUseCase.php
│   ├── DeactivateLeaveTypeUseCase.php
│   ├── DeleteLeaveTypeUseCase.php
│   ├── CreateLeaveRequestUseCase.php
│   ├── ApproveLeaveRequestUseCase.php
│   ├── RejectLeaveRequestUseCase.php
│   ├── AllocateLeaveBalancesUseCase.php
│   └── ProcessYearEndRolloverUseCase.php
├── Queries/
│   ├── ListLeaveTypesQuery.php
│   ├── GetLeaveTypeQuery.php
│   ├── ListLeaveRequestsQuery.php
│   ├── GetLeaveRequestQuery.php
│   ├── GetEmployeeLeaveBalancesQuery.php
│   ├── ListAllLeaveBalancesQuery.php
│   ├── GetPendingRequestsCountQuery.php
│   ├── PreviewYearEndRolloverQuery.php
│   └── GetTeamLeaveCalendarQuery.php
└── Listeners/
    ├── NotifyApproversOnLeaveRequestListener.php
    └── NotifyRequesterOnLeaveDecisionListener.php

app/Application/TenantAdminDashboard/Attendance/Listeners/
└── MarkStaffOnLeaveListener.php   ← Attendance context. NOT Leave context.
```

### Infrastructure Layer
```
app/Infrastructure/Persistence/TenantAdminDashboard/LeaveManagement/
├── LeaveTypeRecord.php
├── LeaveRequestRecord.php
├── LeaveBalanceRecord.php
├── EloquentLeaveTypeRepository.php
├── EloquentLeaveRequestRepository.php
├── EloquentLeaveBalanceRepository.php
├── EloquentLeaveDayCalculationService.php
├── EloquentLeaveOverlapDetectionService.php
├── EloquentHolidayQueryService.php
└── LeaveManagementServiceProvider.php
```

### HTTP Layer (Pattern B — CRIT-02 Fix)
```
app/Http/TenantAdminDashboard/LeaveManagement/
├── Controllers/
│   ├── LeaveTypeReadController.php
│   ├── LeaveTypeWriteController.php
│   ├── LeaveRequestReadController.php
│   ├── LeaveRequestWriteController.php
│   ├── LeaveBalanceReadController.php
│   ├── LeaveBalanceWriteController.php
│   └── LeaveCalendarController.php
├── Requests/
│   ├── CreateLeaveTypeRequest.php
│   ├── UpdateLeaveTypeRequest.php
│   ├── CreateLeaveRequestRequest.php
│   └── RejectLeaveRequestRequest.php
└── Resources/
    ├── LeaveTypeResource.php
    ├── LeaveRequestResource.php
    └── LeaveBalanceResource.php
```

### Routes
- `routes/tenant_dashboard/leave.php` (included in `routes/api.php`)

### Tests
```
tests/
├── Feature/TenantAdminDashboard/LeaveManagement/
│   ├── LeaveTypeManagementTest.php           (Scenario 13)
│   ├── LeaveRequestCreateTest.php            (Scenarios 1,2,8,9,14)
│   ├── LeaveRequestApprovalTest.php          (Scenarios 4,5)
│   ├── LeaveRequestOverlapTest.php           (Scenario 3)
│   ├── LeaveRequestConcurrencyTest.php       (Scenario 6)
│   ├── YearEndRolloverTest.php               (Scenarios 10,11)
│   ├── LeaveAttendanceIntegrationTest.php    (Scenario 12)
│   └── LeaveManagementTenantIsolationTest.php (Scenario 15)
└── Unit/
    ├── Domain/LeaveManagement/
    │   ├── LeaveRequestEntityTest.php
    │   ├── LeaveTypeEntityTest.php
    │   ├── LeaveStatusTest.php
    │   ├── HalfDayPeriodTest.php
    │   └── LeaveDateRangeTest.php
    └── Application/LeaveManagement/
        └── LeaveDayCalculationTest.php        (Scenario 7)
```

---

*End of Document — UBOTZ 2.0 Leave Management Implementation Plan (Revised) — March 19, 2026*
