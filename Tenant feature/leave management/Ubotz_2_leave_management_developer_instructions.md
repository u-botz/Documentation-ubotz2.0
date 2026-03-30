# UBOTZ 2.0 — Leave Management Developer Instructions

## Staff Leave Management System

| Field | Value |
|---|---|
| **Document Type** | Developer Instruction (Pre-Implementation Brief) |
| **Phase** | Leave Management (Phase TBD — to be sequenced into roadmap) |
| **Date** | March 19, 2026 |
| **Issued By** | Principal Engineer / Architecture Auditor |
| **Audience** | Implementation Developer (Antigravity) |
| **Expected Deliverable** | Implementation Plan (same format as 10A–14 plans) |
| **Prerequisites** | Staff Attendance system COMPLETE (StaffAttendanceEntity, BulkMarkStaffAttendanceUseCase, staff attendance controllers exist in codebase), Phase 14 COMPLETE (Notification Infrastructure), Phase 10A–10E COMPLETE (Tenant RBAC, capability middleware) |

> **This module extends the existing staff attendance system with a formal leave lifecycle.** Staff attendance already tracks `on_leave` as a status — but there is no system for requesting, approving, or managing leave. Today, institute HR processes leave verbally or on paper, then manually marks attendance. After this phase, the entire lifecycle is digitized: staff requests leave → approver approves/rejects → balance deducts → attendance auto-marks `on_leave` for approved dates.

---

## 1. Mission Statement

The Leave Management system builds a **formal leave request and approval lifecycle** for staff within the TenantAdminDashboard bounded context. It is staff-only in Phase 1 — student leave is a future extension.

This phase builds four things:
1. **Leave type configuration engine** — tenant-configurable leave types with quotas, carry-forward rules, and negative balance policies.
2. **Leave balance tracking** — per employee, per leave type, per calendar year, with year-end rollover via manual admin trigger.
3. **Leave request and approval workflow** — employee submits request, any user with `leave.approve` approves or rejects, with date range and half-day support.
4. **Cross-context attendance integration** — approved leave automatically creates `on_leave` staff attendance records via domain event.

**What this phase includes:**
- New `LeaveManagement` feature module within `TenantAdminDashboard`
- Leave type CRUD (fully tenant-configurable — no platform defaults)
- Leave balance ledger (per employee, per type, per year)
- Leave request lifecycle: `pending → approved` or `pending → rejected`
- Date range requests with half-day support (single-day only)
- Overlap detection and rejection (no double-booking leave)
- Holiday-aware leave day calculation (holidays excluded from leave day count)
- Automatic attendance integration via `LeaveRequestApproved` domain event
- Year-end balance rollover with preview and manual admin trigger
- Carry-forward per leave type with configurable max days
- Negative balance support per leave type
- Capability-gated approval (`leave.approve`)
- Phase 14 notification integration (new request → approvers, approval/rejection → requester)
- Admin dashboard: pending requests count
- Audit logging on all state changes

**What this phase does NOT include:**
- Student leave management (future — different lifecycle, parent-initiated)
- Pro-rata allocation for mid-year joiners (future)
- Cancel or revoke actions on leave requests (future — Phase 1 is approve/reject only)
- Multi-level approval chains (future — Phase 1 is single approver)
- Compensatory off / comp leave (future)
- Leave encashment (future — payroll feature)
- Payroll integration beyond the data layer (future — leave data is exportable but no payroll calculation)
- Automatic year-end rollover (manual trigger only in Phase 1)
- Leave policy templates (each tenant builds from scratch)
- Mobile push notifications (polling via existing Phase 14 pattern)

---

## 2. Business Context

### 2.1 Current State

The staff attendance system exists and supports the `on_leave` status. Administrators can manually mark a staff member's daily attendance as `present`, `absent`, `late`, or `on_leave`. But there is no formal process for how someone ends up marked `on_leave`:
- No way for an employee to request leave
- No approval workflow
- No leave balance tracking
- No leave type definitions
- No year-end rollover logic
- No integration between "leave approved" and "attendance marked"

Today, HR processes leave via WhatsApp messages, verbal requests, or paper forms — then manually marks attendance. This is unauditable, error-prone, and doesn't scale.

### 2.2 What Changes

After this phase:
1. Tenant admins configure leave types (casual leave: 12 days/year, sick leave: 10 days/year, etc.) with per-type rules for carry-forward and negative balance.
2. When a new calendar year starts, admins trigger year-end rollover: the system previews carry-forward amounts, resets quotas, and allocates new balances.
3. A staff member submits a leave request: leave type, date range (or single day with optional half-day), reason.
4. The system validates: sufficient balance (or negative balance allowed), no overlap with existing approved leave, holiday-aware day count calculation.
5. Any user with `leave.approve` capability sees pending requests and approves or rejects (with mandatory reason on rejection).
6. On approval: leave balance deducts, `LeaveRequestApproved` domain event fires, attendance listener creates `on_leave` staff attendance records for each approved leave day.
7. On rejection: balance unchanged, requester notified with rejection reason.

### 2.3 Architecture Pattern

```
Staff Member submits leave request
    ↓
CreateLeaveRequestUseCase
    ↓  validates balance, overlap, holidays
    ↓  persists as PENDING
    ↓  dispatches LeaveRequestCreated event
    ↓
Phase 14 NotificationDispatcher → notifies users with leave.approve capability
    ↓
Approver reviews and approves
    ↓
ApproveLeaveRequestUseCase
    ↓  deducts balance
    ↓  transitions to APPROVED
    ↓  dispatches LeaveRequestApproved event
    ├── Phase 14 NotificationDispatcher → notifies requester
    └── MarkStaffOnLeaveListener (Attendance context)
            ↓  creates on_leave staff attendance records for each leave day
```

The Leave Management module owns the **leave lifecycle, balance tracking, and approval workflow**. The Attendance module owns **attendance record creation**. Communication between them is via domain events — the Leave module dispatches `LeaveRequestApproved`, and a listener in the Attendance context reacts. This preserves bounded context isolation.

---

## 3. Business Rules (NON-NEGOTIABLE)

### 3.1 Leave Type Rules

| Rule ID | Rule | Enforcement |
|---|---|---|
| BR-01 | Leave types are fully tenant-configurable. There are NO platform-level default leave types. Each tenant defines their own. | Leave type CRUD endpoints. No seeder creates default types. |
| BR-02 | A leave type has: `name` (display), `code` (unique per tenant, snake_case, immutable after creation), `annual_quota_days` (decimal — supports half-days), `is_carry_forward_allowed` (boolean), `max_carry_forward_days` (decimal, only meaningful if carry-forward allowed), `allows_negative_balance` (boolean), `is_paid` (boolean — informational for future payroll, no logic in Phase 1), `is_active` (boolean — inactive types cannot be used for new requests). | `leave_types` table with all columns. Domain entity validates invariants. |
| BR-03 | A leave type `code` is immutable after creation. It serves as a stable identifier for integrations and reporting. | Domain entity constructor sets code. No setter. Update use case rejects code changes. |
| BR-04 | Deactivating a leave type does NOT affect existing approved leave or balances. It only prevents new requests from selecting this type. | Request creation validates `leave_type.is_active = true`. Existing records unaffected. |
| BR-05 | A leave type cannot be deleted if any leave requests (in any status) reference it. It can only be deactivated. | Delete use case checks for referencing requests. Throws `LeaveTypeInUseException` if found. |

### 3.2 Leave Balance Rules

| Rule ID | Rule | Enforcement |
|---|---|---|
| BR-06 | Leave balances are tracked per employee, per leave type, per calendar year. The balance record stores: `allocated_days`, `used_days`, `carried_forward_days`, and a computed `available_days` = `allocated_days + carried_forward_days - used_days`. | `leave_balances` table. `available_days` computed at read time, not stored. |
| BR-07 | Balances are created when the admin triggers year-end rollover (or manually allocates for mid-year). There is NO automatic balance creation on user creation. | `AllocateLeaveBalancesUseCase` creates balance records. User creation does not. |
| BR-08 | `used_days` increments on leave approval and is always a positive value. It represents total days consumed in the year. | `ApproveLeaveRequestUseCase` increments `used_days` on the balance record. |
| BR-09 | If `allows_negative_balance = false` on the leave type, a request is rejected if `requested_days > available_days`. If `allows_negative_balance = true`, the request is allowed even if `available_days` goes negative. | Validation in `CreateLeaveRequestUseCase`. Checked against the balance record. |
| BR-10 | `available_days` can be negative (when negative balance is allowed). This represents leave taken beyond quota — informational for future payroll deduction. | No constraint preventing negative computed balance. |
| BR-11 | If an employee has no balance record for a leave type in the current year, their available balance is 0 for that type. The system does NOT auto-create a balance record. | Query returns 0 for missing balance records. |

### 3.3 Leave Request Rules

| Rule ID | Rule | Enforcement |
|---|---|---|
| BR-12 | A leave request has: `leave_type_id`, `from_date`, `to_date`, `is_half_day` (boolean), `half_day_period` (enum: `first_half`, `second_half` — only valid when `is_half_day = true`), `reason` (text, required), `status` (enum: `pending`, `approved`, `rejected`), `requested_days` (decimal — computed at creation). | `leave_requests` table. Entity computes `requested_days` from dates + half-day flag + holiday exclusion. |
| BR-13 | `is_half_day` is only valid when `from_date === to_date` (single-day request). Multi-day requests cannot be half-day. | Domain entity validates: if `is_half_day = true` then `from_date` must equal `to_date`. |
| BR-14 | When `is_half_day = true`, `requested_days = 0.5`. When `is_half_day = false`, `requested_days = business days between from_date and to_date (inclusive), excluding holidays`. | `LeaveDay CalculationService` computes the count. Injected into the create use case. |
| BR-15 | A leave request state machine has exactly two transitions: `pending → approved` and `pending → rejected`. No other transitions. No cancel, no revoke. | Domain entity enforces transitions. `InvalidLeaveStatusTransitionException` for illegal transitions. |
| BR-16 | A leave request cannot overlap with any existing `approved` leave for the same employee. If any date in the requested range overlaps with an existing approved request's date range, the new request is rejected. | `LeaveOverlapDetectionService` checks for date range intersection against approved requests. Called in `CreateLeaveRequestUseCase`. |
| BR-17 | Leave requests cannot be created for past dates. `from_date` must be today or in the future. | Validation in `CreateLeaveRequestUseCase`. |
| BR-18 | Leave requests can span across weekends. The system does NOT automatically exclude weekends — only holidays from the Holiday Management module are excluded. Whether weekends are working days is institution-specific and handled by the holiday calendar. | `LeaveDayCalculationService` counts all calendar days in the range, then subtracts days that fall on holidays. |
| BR-19 | `from_date` and `to_date` must be within the same calendar year. Cross-year requests are not allowed — the employee must submit separate requests for each year. | Validation in `CreateLeaveRequestUseCase`: `from_date.year === to_date.year`. |

### 3.4 Approval Rules

| Rule ID | Rule | Enforcement |
|---|---|---|
| BR-20 | Any user with the `leave.approve` capability can approve or reject any pending leave request within their tenant. There is no reporting-line restriction in Phase 1. | Capability middleware on approval endpoint. No additional scope enforcement. |
| BR-21 | Approval triggers three side effects: (1) balance deduction, (2) status transition, (3) `LeaveRequestApproved` domain event. All three happen atomically in the approval transaction. | `ApproveLeaveRequestUseCase` wraps all three in `DB::transaction()`. |
| BR-22 | Rejection requires a mandatory `rejection_reason` (text, min 10 characters). The reason is stored on the leave request record. | `RejectLeaveRequestUseCase` validates reason length. Stored in `rejection_reason` column. |
| BR-23 | An approver cannot approve their own leave request. Self-approval is blocked. | `ApproveLeaveRequestUseCase` checks `request.user_id !== approver.user_id`. Throws `SelfApprovalNotAllowedException`. |
| BR-24 | Balance is re-checked at approval time, not just at request creation time. Between request creation and approval, the employee may have had other leave approved that consumed their balance. | `ApproveLeaveRequestUseCase` re-validates `available_days >= requested_days` (or negative balance allowed) before approving. |

### 3.5 Holiday Integration Rules

| Rule ID | Rule | Enforcement |
|---|---|---|
| BR-25 | The `LeaveDayCalculationService` queries the Holiday Management module to determine which dates are holidays. Holidays within the leave date range are excluded from the leave day count. | Service depends on a `HolidayQueryServiceInterface` (port in domain, implementation in infrastructure). |
| BR-26 | If the Holiday Management module does not exist or returns no holidays, all dates in the range count as leave days (no exclusion). The leave system must NOT fail if holidays are unavailable. | `HolidayQueryServiceInterface` implementation returns an empty array if the holiday table doesn't exist or has no records. Defensive coding. |
| BR-27 | Holiday data is read at request creation time and stored as `requested_days` on the leave request. If holidays change after the request is created, the `requested_days` does NOT retroactively update. | `requested_days` is a snapshot value. Stored on the record at creation time. |

### 3.6 Attendance Integration Rules

| Rule ID | Rule | Enforcement |
|---|---|---|
| BR-28 | When a leave request is approved, a `LeaveRequestApproved` domain event fires. A listener in the Attendance context creates `on_leave` staff attendance records for each approved leave day (excluding holidays). | `MarkStaffOnLeaveListener` in `Application/TenantAdminDashboard/Attendance/Listeners/`. Reacts to `LeaveRequestApproved`. |
| BR-29 | The attendance listener creates records only for dates that don't already have a staff attendance record. If attendance was already marked for a date (e.g., the employee was present in the morning and took half-day leave in the afternoon), the listener must NOT overwrite it. | Listener uses `insertOrIgnore` or checks for existing records before creating. |
| BR-30 | For half-day leave, the attendance listener marks the attendance record with a metadata flag indicating which half was on leave. The exact mechanism depends on the existing `StaffAttendanceEntity` structure — the developer MUST verify how half-day is represented in the current attendance model. | Developer must inspect `StaffAttendanceStatus` and `StaffAttendanceEntity` to determine if half-day is a first-class concept or needs a metadata extension. |
| BR-31 | The attendance integration is a **side effect**, not a prerequisite. If attendance creation fails (e.g., constraint violation), the leave approval must NOT roll back. The approval transaction commits first; the attendance listener runs after commit. | Listener is wired to `LeaveRequestApproved` event, which fires after the approval transaction commits. Listener failures are logged but do not affect leave status. |

### 3.7 Year-End Rollover Rules

| Rule ID | Rule | Enforcement |
|---|---|---|
| BR-32 | Year-end rollover is a **manual admin action**, not an automatic scheduled command. The admin triggers it when ready. | `ProcessYearEndRolloverUseCase` invoked via API endpoint, not scheduler. |
| BR-33 | Before executing rollover, the system provides a **preview** showing: each employee's current balance per type, carry-forward amount (min of remaining days and `max_carry_forward_days`), lapsed days (remaining - carry-forward), and new year's opening balance (annual_quota + carried_forward). | `PreviewYearEndRolloverQuery` computes and returns the preview. No side effects. |
| BR-34 | Rollover creates new balance records for the next calendar year. For each employee and each active leave type: `allocated_days = leave_type.annual_quota_days`, `carried_forward_days = min(previous_year.available_days, leave_type.max_carry_forward_days)` (0 if carry-forward not allowed or available_days <= 0), `used_days = 0`. | `ProcessYearEndRolloverUseCase` bulk-creates balance records for `year + 1`. |
| BR-35 | Rollover can only be processed once per year. Attempting to run it again for the same target year is rejected. | Check for existing balance records in the target year. If found, throw `RolloverAlreadyProcessedException`. |
| BR-36 | Rollover does NOT delete or modify previous year's balance records. They remain as historical audit trail. | Previous year records are read-only after rollover. |
| BR-37 | Rollover requires the `leave.manage` capability (admin-level). Regular staff and approvers cannot trigger it. | Capability middleware: `leave.manage`. |

### 3.8 Audit Rules

| Rule ID | Rule | Enforcement |
|---|---|---|
| BR-38 | Leave type CRUD actions are audit-logged: `leave_type.created`, `leave_type.updated`, `leave_type.deactivated`, `leave_type.deleted`. | `TenantAuditLogger` called after transaction commit. |
| BR-39 | Leave request state changes are audit-logged: `leave_request.created`, `leave_request.approved`, `leave_request.rejected`. | `TenantAuditLogger` called after transaction commit. |
| BR-40 | Year-end rollover is audit-logged: `leave_rollover.processed` with metadata showing the year processed and employee count. | `TenantAuditLogger` called after transaction commit. |
| BR-41 | Balance allocation (manual) is audit-logged: `leave_balance.allocated`. | `TenantAuditLogger` called after transaction commit. |
| BR-42 | All audit logs are written OUTSIDE the database transaction (platform convention from Phase 6+). | UseCase: transaction → commit → audit log → event dispatch. |

---

## 4. Capability Requirements

### 4.1 New Tenant Capabilities

| Capability Code | Purpose | Default Roles |
|---|---|---|
| `leave.view` | View own leave requests and balances | ALL roles (OWNER, ADMIN, TEACHER, STAFF) |
| `leave.request` | Submit leave requests | TEACHER, STAFF |
| `leave.approve` | Approve or reject any pending leave request | OWNER, ADMIN |
| `leave.manage` | Full control: configure leave types, allocate balances, trigger rollover, view all employee leave data | OWNER, ADMIN |

### 4.2 Capability Notes

- `leave.view` does NOT grant visibility into other employees' leave. A staff member with `leave.view` only sees their own requests and balances. Admins with `leave.manage` see all employees.
- `leave.request` is intentionally NOT given to OWNER and ADMIN by default — they typically don't submit leave requests to themselves. If needed, the tenant can add it to those roles.
- `leave.approve` without `leave.manage` allows someone to approve requests but not configure leave types or trigger rollover. This is useful for department heads who approve but don't administer HR policy.

---

## 5. Domain Model

### 5.1 Bounded Context Placement

Leave Management is a new feature module within the `TenantAdminDashboard` bounded context.

```
Domain/TenantAdminDashboard/LeaveManagement/
Application/TenantAdminDashboard/LeaveManagement/
Infrastructure/Persistence/TenantAdminDashboard/LeaveManagement/
Http/TenantAdminDashboard/LeaveManagement/
```

**Cross-context integration:** The `MarkStaffOnLeaveListener` lives in `Application/TenantAdminDashboard/Attendance/Listeners/` because it operates on the Attendance bounded context's entities. It listens to a LeaveManagement domain event but writes to Attendance tables. This follows the established pattern where listeners live in the context they write to, not the context that emits the event.

### 5.2 Domain Layer

| Component | Location | Purpose |
|---|---|---|
| `LeaveTypeEntity` | `Domain/TenantAdminDashboard/LeaveManagement/Entities/` | Leave type configuration. Immutable code. Validates carry-forward and quota invariants. |
| `LeaveRequestEntity` | `Domain/TenantAdminDashboard/LeaveManagement/Entities/` | Aggregate root for leave requests. State machine: `pending → approved / rejected`. Records domain events. |
| `LeaveBalanceEntity` | `Domain/TenantAdminDashboard/LeaveManagement/Entities/` | Balance record per employee per type per year. Tracks allocated, carried forward, and used days. |
| `LeaveStatus` (Value Object) | `Domain/TenantAdminDashboard/LeaveManagement/ValueObjects/` | Enum: `pending`, `approved`, `rejected`. State machine transitions enforced. |
| `HalfDayPeriod` (Value Object) | `Domain/TenantAdminDashboard/LeaveManagement/ValueObjects/` | Enum: `first_half`, `second_half`. Only valid when `is_half_day = true`. |
| `LeaveDateRange` (Value Object) | `Domain/TenantAdminDashboard/LeaveManagement/ValueObjects/` | Immutable pair: `(from_date: DateTimeImmutable, to_date: DateTimeImmutable)`. Self-validates: from <= to, same calendar year, from >= today. |
| `LeaveTypeRepositoryInterface` | `Domain/TenantAdminDashboard/LeaveManagement/Repositories/` | Contract for leave type persistence. |
| `LeaveRequestRepositoryInterface` | `Domain/TenantAdminDashboard/LeaveManagement/Repositories/` | Contract for leave request persistence. |
| `LeaveBalanceRepositoryInterface` | `Domain/TenantAdminDashboard/LeaveManagement/Repositories/` | Contract for balance persistence. |
| `LeaveDayCalculationServiceInterface` | `Domain/TenantAdminDashboard/LeaveManagement/Services/` | Contract for computing leave day count (holiday-aware). |
| `LeaveOverlapDetectionServiceInterface` | `Domain/TenantAdminDashboard/LeaveManagement/Services/` | Contract for checking date range overlap against existing approved leave. |
| `HolidayQueryServiceInterface` | `Domain/TenantAdminDashboard/LeaveManagement/Services/` | Port for querying holidays in a date range. Implemented in infrastructure, may depend on Holiday Management module. |
| `LeaveRequestCreated` (Event) | `Domain/TenantAdminDashboard/LeaveManagement/Events/` | Dispatched when a leave request is submitted. Triggers notification to approvers. |
| `LeaveRequestApproved` (Event) | `Domain/TenantAdminDashboard/LeaveManagement/Events/` | Dispatched on approval. Carries request ID, user ID, date range. Triggers attendance integration + requester notification. |
| `LeaveRequestRejected` (Event) | `Domain/TenantAdminDashboard/LeaveManagement/Events/` | Dispatched on rejection. Triggers requester notification. |
| `LeaveTypeCreated` (Event) | `Domain/TenantAdminDashboard/LeaveManagement/Events/` | Dispatched when a new leave type is configured. |
| `LeaveBalancesAllocated` (Event) | `Domain/TenantAdminDashboard/LeaveManagement/Events/` | Dispatched when year-end rollover or manual allocation occurs. |
| `InvalidLeaveStatusTransitionException` | `Domain/TenantAdminDashboard/LeaveManagement/Exceptions/` | Thrown on illegal state transition. |
| `InsufficientLeaveBalanceException` | `Domain/TenantAdminDashboard/LeaveManagement/Exceptions/` | Thrown when balance insufficient and negative not allowed. |
| `LeaveOverlapException` | `Domain/TenantAdminDashboard/LeaveManagement/Exceptions/` | Thrown when dates overlap with existing approved leave. |
| `SelfApprovalNotAllowedException` | `Domain/TenantAdminDashboard/LeaveManagement/Exceptions/` | Thrown when approver tries to approve their own request. |
| `LeaveTypeInUseException` | `Domain/TenantAdminDashboard/LeaveManagement/Exceptions/` | Thrown when attempting to delete a leave type that has requests. |
| `RolloverAlreadyProcessedException` | `Domain/TenantAdminDashboard/LeaveManagement/Exceptions/` | Thrown when rollover already executed for the target year. |

### 5.3 Application Layer

| Component | Location | Purpose |
|---|---|---|
| **Leave Type Use Cases** | | |
| `CreateLeaveTypeUseCase` | `Application/.../LeaveManagement/UseCases/` | Creates a new leave type for the tenant. |
| `UpdateLeaveTypeUseCase` | `Application/.../LeaveManagement/UseCases/` | Updates leave type (not code). |
| `DeactivateLeaveTypeUseCase` | `Application/.../LeaveManagement/UseCases/` | Sets `is_active = false`. |
| `DeleteLeaveTypeUseCase` | `Application/.../LeaveManagement/UseCases/` | Deletes if no requests reference it. |
| **Leave Request Use Cases** | | |
| `CreateLeaveRequestUseCase` | `Application/.../LeaveManagement/UseCases/` | Validates balance, overlap, holidays. Persists as `pending`. Dispatches `LeaveRequestCreated`. |
| `ApproveLeaveRequestUseCase` | `Application/.../LeaveManagement/UseCases/` | Re-validates balance. Deducts balance. Transitions to `approved`. Dispatches `LeaveRequestApproved`. |
| `RejectLeaveRequestUseCase` | `Application/.../LeaveManagement/UseCases/` | Validates rejection reason. Transitions to `rejected`. Dispatches `LeaveRequestRejected`. |
| **Balance Use Cases** | | |
| `AllocateLeaveBalancesUseCase` | `Application/.../LeaveManagement/UseCases/` | Manually allocate balances for employees (used for initial setup or mid-year adjustments). |
| `ProcessYearEndRolloverUseCase` | `Application/.../LeaveManagement/UseCases/` | Executes rollover: creates new year balances with carry-forward. |
| **Queries** | | |
| `ListLeaveTypesQuery` | `Application/.../LeaveManagement/Queries/` | Lists active/all leave types for the tenant. |
| `GetEmployeeLeaveBalancesQuery` | `Application/.../LeaveManagement/Queries/` | Returns all balances for an employee in a given year. |
| `ListLeaveRequestsQuery` | `Application/.../LeaveManagement/Queries/` | Lists requests. Filterable by status, employee, type, date range. For `leave.manage`: all employees. For `leave.view`: own only. |
| `GetPendingRequestsCountQuery` | `Application/.../LeaveManagement/Queries/` | Returns count of pending requests (for admin dashboard widget). |
| `PreviewYearEndRolloverQuery` | `Application/.../LeaveManagement/Queries/` | Computes rollover preview without side effects. |
| `GetTeamLeaveCalendarQuery` | `Application/.../LeaveManagement/Queries/` | Returns approved leave for all staff in a date range (for admin calendar view). |
| **Commands / DTOs** | | |
| `CreateLeaveTypeCommand` | `Application/.../LeaveManagement/Commands/` | Immutable data carrier for leave type creation. |
| `UpdateLeaveTypeCommand` | `Application/.../LeaveManagement/Commands/` | Immutable data carrier for leave type update. |
| `CreateLeaveRequestCommand` | `Application/.../LeaveManagement/Commands/` | Immutable: leave_type_id, from_date, to_date, is_half_day, half_day_period, reason, user_id, tenant_id. |
| `ApproveLeaveRequestCommand` | `Application/.../LeaveManagement/Commands/` | Immutable: request_id, approver_id, tenant_id. |
| `RejectLeaveRequestCommand` | `Application/.../LeaveManagement/Commands/` | Immutable: request_id, approver_id, rejection_reason, tenant_id. |
| `ProcessRolloverCommand` | `Application/.../LeaveManagement/Commands/` | Immutable: target_year, actor_id, tenant_id. |
| **Listeners (in Attendance context)** | | |
| `MarkStaffOnLeaveListener` | `Application/TenantAdminDashboard/Attendance/Listeners/` | Reacts to `LeaveRequestApproved`. Creates `on_leave` staff attendance records. Lives in Attendance context, NOT Leave context. |

### 5.4 Infrastructure Layer

| Component | Location | Purpose |
|---|---|---|
| `EloquentLeaveTypeRepository` | `Infrastructure/Persistence/TenantAdminDashboard/LeaveManagement/` | Implements `LeaveTypeRepositoryInterface`. |
| `EloquentLeaveRequestRepository` | `Infrastructure/Persistence/TenantAdminDashboard/LeaveManagement/` | Implements `LeaveRequestRepositoryInterface`. |
| `EloquentLeaveBalanceRepository` | `Infrastructure/Persistence/TenantAdminDashboard/LeaveManagement/` | Implements `LeaveBalanceRepositoryInterface`. |
| `EloquentLeaveDayCalculationService` | `Infrastructure/Persistence/TenantAdminDashboard/LeaveManagement/` | Implements `LeaveDayCalculationServiceInterface`. Queries holiday table. |
| `EloquentLeaveOverlapDetectionService` | `Infrastructure/Persistence/TenantAdminDashboard/LeaveManagement/` | Implements `LeaveOverlapDetectionServiceInterface`. Queries approved leave requests for date overlap. |
| `EloquentHolidayQueryService` | `Infrastructure/Persistence/TenantAdminDashboard/LeaveManagement/` | Implements `HolidayQueryServiceInterface`. Queries the holiday table. Returns empty array if table doesn't exist. |
| `LeaveTypeRecord` | `Infrastructure/Persistence/TenantAdminDashboard/LeaveManagement/` | Eloquent model. `BelongsToTenant`. |
| `LeaveRequestRecord` | `Infrastructure/Persistence/TenantAdminDashboard/LeaveManagement/` | Eloquent model. `BelongsToTenant`. |
| `LeaveBalanceRecord` | `Infrastructure/Persistence/TenantAdminDashboard/LeaveManagement/` | Eloquent model. `BelongsToTenant`. |
| `LeaveManagementServiceProvider` | `Infrastructure/Persistence/TenantAdminDashboard/LeaveManagement/` | Binds all interfaces to implementations. |

### 5.5 HTTP Layer

| Component | Location | Purpose |
|---|---|---|
| `LeaveTypeController` | `Http/TenantAdminDashboard/LeaveManagement/Controllers/` | CRUD for leave types. `leave.manage` capability. |
| `LeaveRequestController` | `Http/TenantAdminDashboard/LeaveManagement/Controllers/` | Create request (`leave.request`), list own/all requests (`leave.view` / `leave.manage`), approve/reject (`leave.approve`). |
| `LeaveBalanceController` | `Http/TenantAdminDashboard/LeaveManagement/Controllers/` | View balances (`leave.view` for own, `leave.manage` for all), allocate (`leave.manage`), rollover preview + execute (`leave.manage`). |
| `CreateLeaveTypeRequest` | `Http/TenantAdminDashboard/LeaveManagement/Requests/` | Syntax validation for leave type creation. |
| `UpdateLeaveTypeRequest` | `Http/TenantAdminDashboard/LeaveManagement/Requests/` | Syntax validation for leave type update. |
| `CreateLeaveRequestRequest` | `Http/TenantAdminDashboard/LeaveManagement/Requests/` | Syntax: leave_type_id required, from_date/to_date required and valid dates, is_half_day boolean, half_day_period in enum if half_day, reason required min 5 chars. |
| `RejectLeaveRequestRequest` | `Http/TenantAdminDashboard/LeaveManagement/Requests/` | Syntax: rejection_reason required min 10 chars. |
| `LeaveTypeResource` | `Http/TenantAdminDashboard/LeaveManagement/Resources/` | API response shaping for leave types. |
| `LeaveRequestResource` | `Http/TenantAdminDashboard/LeaveManagement/Resources/` | API response shaping for leave requests. |
| `LeaveBalanceResource` | `Http/TenantAdminDashboard/LeaveManagement/Resources/` | API response shaping for balances. |

---

## 6. Database Schema

### 6.1 New Tables

All tables are **tenant-scoped** (in `database/migrations/tenant/`).

#### Table: `leave_types`

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | BIGINT UNSIGNED PK | NO | Auto-increment |
| `tenant_id` | BIGINT UNSIGNED FK | NO | Tenant isolation |
| `name` | VARCHAR(100) | NO | Display name (e.g., "Casual Leave") |
| `code` | VARCHAR(50) | NO | Immutable identifier (e.g., `casual_leave`). UNIQUE per tenant. |
| `annual_quota_days` | DECIMAL(5,1) | NO | Annual allocation (supports half-days: 12.0, 10.5) |
| `is_carry_forward_allowed` | BOOLEAN | NO | Default: false |
| `max_carry_forward_days` | DECIMAL(5,1) | NO | Default: 0. Only meaningful if carry-forward allowed. |
| `allows_negative_balance` | BOOLEAN | NO | Default: false |
| `is_paid` | BOOLEAN | NO | Default: true. Informational for future payroll. |
| `is_active` | BOOLEAN | NO | Default: true. Inactive types blocked from new requests. |
| `created_at` | TIMESTAMP | NO | |
| `updated_at` | TIMESTAMP | NO | |

**Indexes:**
- `uniq_leave_type_tenant_code` → UNIQUE `(tenant_id, code)`
- `idx_leave_type_tenant_active` → `(tenant_id, is_active)`

#### Table: `leave_balances`

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | BIGINT UNSIGNED PK | NO | Auto-increment |
| `tenant_id` | BIGINT UNSIGNED FK | NO | Tenant isolation |
| `user_id` | BIGINT UNSIGNED FK | NO | References `users.id`. The employee. |
| `leave_type_id` | BIGINT UNSIGNED FK | NO | References `leave_types.id`. |
| `year` | SMALLINT UNSIGNED | NO | Calendar year (e.g., 2026) |
| `allocated_days` | DECIMAL(5,1) | NO | Annual quota for this year |
| `carried_forward_days` | DECIMAL(5,1) | NO | Days carried from previous year. Default: 0. |
| `used_days` | DECIMAL(5,1) | NO | Days consumed by approved leave. Default: 0. |
| `created_at` | TIMESTAMP | NO | |
| `updated_at` | TIMESTAMP | NO | |

**Indexes:**
- `uniq_leave_bal_user_type_year` → UNIQUE `(tenant_id, user_id, leave_type_id, year)` — one balance per employee per type per year
- `idx_leave_bal_tenant_year` → `(tenant_id, year)` — year-end rollover queries

**Notes:**
- `available_days` is NOT stored. Computed as: `allocated_days + carried_forward_days - used_days`.
- `used_days` is updated via pessimistic locking (`SELECT FOR UPDATE`) during approval to prevent race conditions where two approvers approve simultaneous requests that would exceed the balance.

#### Table: `leave_requests`

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | BIGINT UNSIGNED PK | NO | Auto-increment |
| `tenant_id` | BIGINT UNSIGNED FK | NO | Tenant isolation |
| `user_id` | BIGINT UNSIGNED FK | NO | References `users.id`. The requester. |
| `leave_type_id` | BIGINT UNSIGNED FK | NO | References `leave_types.id`. |
| `from_date` | DATE | NO | Start of leave |
| `to_date` | DATE | NO | End of leave (inclusive) |
| `is_half_day` | BOOLEAN | NO | Default: false |
| `half_day_period` | VARCHAR(20) | YES | `first_half` or `second_half`. NULL if not half-day. |
| `requested_days` | DECIMAL(5,1) | NO | Computed at creation. Snapshot value. |
| `reason` | TEXT | NO | Employee's reason for leave |
| `status` | VARCHAR(20) | NO | `pending`, `approved`, `rejected`. Default: `pending`. |
| `approved_by_user_id` | BIGINT UNSIGNED FK | YES | References `users.id`. NULL until approved. |
| `approved_at` | TIMESTAMP | YES | Set on approval. |
| `rejection_reason` | TEXT | YES | Mandatory on rejection. NULL otherwise. |
| `rejected_by_user_id` | BIGINT UNSIGNED FK | YES | References `users.id`. NULL until rejected. |
| `rejected_at` | TIMESTAMP | YES | Set on rejection. |
| `created_at` | TIMESTAMP | NO | |
| `updated_at` | TIMESTAMP | NO | |

**Indexes:**
- `idx_leave_req_tenant_user_status` → `(tenant_id, user_id, status)` — "my pending requests" query
- `idx_leave_req_tenant_status` → `(tenant_id, status)` — "all pending requests" for approvers
- `idx_leave_req_overlap` → `(tenant_id, user_id, status, from_date, to_date)` — overlap detection query

**Notes:**
- No `deleted_at`. Leave requests are never deleted. They remain as permanent audit records.
- `requested_days` is a snapshot computed at creation time using holiday-aware calculation. It does NOT change if holidays are modified later.

---

## 7. API Endpoints

### 7.1 Leave Type Management

| Method | Endpoint | Capability | Purpose |
|---|---|---|---|
| `POST` | `/api/tenant/leave/types` | `leave.manage` | Create a leave type |
| `GET` | `/api/tenant/leave/types` | `leave.manage` | List all leave types (active + inactive) |
| `GET` | `/api/tenant/leave/types/{id}` | `leave.manage` | Get leave type detail |
| `PUT` | `/api/tenant/leave/types/{id}` | `leave.manage` | Update leave type (not code) |
| `POST` | `/api/tenant/leave/types/{id}/deactivate` | `leave.manage` | Deactivate leave type |
| `DELETE` | `/api/tenant/leave/types/{id}` | `leave.manage` | Delete leave type (if no requests reference it) |

### 7.2 Leave Requests

| Method | Endpoint | Capability | Purpose |
|---|---|---|---|
| `POST` | `/api/tenant/leave/requests` | `leave.request` | Submit a leave request |
| `GET` | `/api/tenant/leave/requests` | `leave.view` | List own requests. `leave.manage` sees all employees. Filterable by status, type, date range. |
| `GET` | `/api/tenant/leave/requests/{id}` | `leave.view` | Get request detail (own) or any (`leave.manage`) |
| `POST` | `/api/tenant/leave/requests/{id}/approve` | `leave.approve` | Approve a pending request |
| `POST` | `/api/tenant/leave/requests/{id}/reject` | `leave.approve` | Reject a pending request (requires rejection_reason) |
| `GET` | `/api/tenant/leave/requests/pending-count` | `leave.approve` | Count of pending requests (dashboard widget) |

### 7.3 Leave Balances

| Method | Endpoint | Capability | Purpose |
|---|---|---|---|
| `GET` | `/api/tenant/leave/balances/me` | `leave.view` | Get own balances for current year |
| `GET` | `/api/tenant/leave/balances/{userId}` | `leave.manage` | Get specific employee's balances |
| `GET` | `/api/tenant/leave/balances` | `leave.manage` | List all employees' balances for a year. Filterable by department. |
| `POST` | `/api/tenant/leave/balances/allocate` | `leave.manage` | Manually allocate/adjust balances |
| `GET` | `/api/tenant/leave/rollover/preview` | `leave.manage` | Preview year-end rollover |
| `POST` | `/api/tenant/leave/rollover/execute` | `leave.manage` | Execute year-end rollover |

### 7.4 Team Calendar

| Method | Endpoint | Capability | Purpose |
|---|---|---|---|
| `GET` | `/api/tenant/leave/calendar` | `leave.manage` | Approved leave for all staff in a date range |

### 7.5 Route Registration

All routes go in `routes/tenant_dashboard/leave.php`. This file is loaded in `routes/api.php` within the tenant dashboard route group.

### 7.6 Query Parameters

**Leave requests list (`GET /requests`):**
- `status` — filter: `pending`, `approved`, `rejected`
- `leave_type_id` — filter by type
- `user_id` — filter by employee (only with `leave.manage`)
- `from_date`, `to_date` — filter by date range
- `page`, `per_page` — pagination (default `per_page = 20`)

**Balances list (`GET /balances`):**
- `year` — calendar year (default: current year)
- `category_id` — filter by department (via `user_occupations` table)
- `page`, `per_page` — pagination

**Calendar (`GET /calendar`):**
- `from_date`, `to_date` — required date range

---

## 8. Integration with Phase 14 Notification Infrastructure

### 8.1 New Notification Category

Add `leave` to the notification category system:
- **Opt-out eligible**: Yes (same as `system` and `communication` categories)
- **Default**: Enabled for in-app channel

### 8.2 Notification Types

| # | Notification Type | Trigger Event | Recipient | Category |
|---|---|---|---|---|
| 1 | New Leave Request Submitted | `LeaveRequestCreated` | All users with `leave.approve` capability in the tenant | `leave` |
| 2 | Leave Request Approved | `LeaveRequestApproved` | The requesting employee | `leave` |
| 3 | Leave Request Rejected | `LeaveRequestRejected` | The requesting employee | `leave` |

### 8.3 Listener Locations

| Listener | Location | Trigger | Action |
|---|---|---|---|
| `NotifyApproversOnLeaveRequestListener` | `Application/TenantAdminDashboard/LeaveManagement/Listeners/` | `LeaveRequestCreated` | Constructs payload, dispatches via `NotificationDispatcher` |
| `NotifyRequesterOnLeaveDecisionListener` | `Application/TenantAdminDashboard/LeaveManagement/Listeners/` | `LeaveRequestApproved` / `LeaveRequestRejected` | Constructs payload, dispatches via `NotificationDispatcher` |
| `MarkStaffOnLeaveListener` | `Application/TenantAdminDashboard/Attendance/Listeners/` | `LeaveRequestApproved` | Creates `on_leave` staff attendance records. Lives in Attendance context. |

---

## 9. Holiday Integration — Developer Investigation Required

### 9.1 What the Developer Must Verify

The developer MUST investigate the Holiday Management module in the codebase before implementing the `LeaveDayCalculationService`. Specifically:

1. **Does a `holidays` (or equivalent) table exist?** Check `database/migrations/tenant/` for a holiday-related migration.
2. **What is the table structure?** At minimum, the leave system needs: `date` (DATE), `tenant_id`, and optionally `name` and `is_recurring`.
3. **Is there an existing Holiday entity or Eloquent model?** Check `Domain/TenantAdminDashboard/` and `Infrastructure/Persistence/TenantAdminDashboard/` for holiday-related files.
4. **Is there an existing query service or repository interface for holidays?** If yes, the `EloquentHolidayQueryService` should delegate to it rather than querying the table directly.

### 9.2 Fallback Behavior

If the Holiday Management module does NOT exist or the table is empty:
- `EloquentHolidayQueryService` returns an empty collection.
- All dates in the leave range count as leave days.
- No errors, no failures. The leave system functions independently.
- When Holiday Management is built later, the `HolidayQueryServiceInterface` implementation is updated to query the real table. No leave system changes needed.

---

## 10. Concurrency Safety

### 10.1 Balance Deduction Race Condition

Two approvers may try to approve different leave requests for the same employee simultaneously. Both check the balance, both see sufficient days, both deduct. The result: double deduction exceeding the balance.

**Required mitigation:** The `ApproveLeaveRequestUseCase` MUST use pessimistic locking on the balance record:

```
SELECT * FROM leave_balances
WHERE tenant_id = ? AND user_id = ? AND leave_type_id = ? AND year = ?
FOR UPDATE
```

This locks the row for the duration of the transaction, serializing concurrent approvals for the same employee + leave type combination.

### 10.2 Overlap Detection Race Condition

Two requests for overlapping dates submitted simultaneously could both pass the overlap check. Mitigation: the overlap detection query runs inside the approval transaction (after the balance lock is acquired), not at request creation time only. Creation-time overlap check is a UX convenience (fast feedback); approval-time check is the safety net.

---

## 11. Implementation Sequence (Recommended)

| Step | Description | Dependencies |
|---|---|---|
| 1 | Database migrations (3 tables: leave_types, leave_balances, leave_requests) | None |
| 2 | Domain layer: entities, value objects, events, exceptions, repository interfaces, service interfaces | None |
| 3 | Infrastructure layer: Eloquent models, repositories, service implementations | Steps 1, 2 |
| 4 | Holiday query service (investigate holiday module, implement interface) | Step 3 |
| 5 | Leave day calculation service (holiday-aware) | Steps 3, 4 |
| 6 | Overlap detection service | Step 3 |
| 7 | Application layer: Leave type CRUD use cases | Steps 2, 3 |
| 8 | Application layer: Create leave request use case (with balance check, overlap check, day calculation) | Steps 2, 3, 5, 6 |
| 9 | Application layer: Approve/Reject use cases (with pessimistic locking, balance deduction) | Steps 2, 3, 8 |
| 10 | Application layer: Balance allocation + rollover use cases and queries | Steps 2, 3 |
| 11 | Application layer: Queries (list requests, balances, pending count, calendar, rollover preview) | Steps 3, 7–10 |
| 12 | Attendance integration: MarkStaffOnLeaveListener | Step 9 + existing attendance infrastructure |
| 13 | HTTP layer: controllers, form requests, resources, routes | Steps 7–11 |
| 14 | Phase 14 integration: notification listeners + category registration | Step 9 |
| 15 | Capability seeder: add 4 new capabilities | Step 13 |
| 16 | Service provider: interface bindings | Step 3 |
| 17 | Tests | All steps |

---

## 12. Test Plan

### 12.1 Test Categories

| Category | Estimated Count | Focus |
|---|---|---|
| Unit: Domain Entities | 10–15 | State machine transitions, immutability of code, half-day validation, date range VO |
| Unit: Value Objects | 5–8 | LeaveStatus transitions, HalfDayPeriod, LeaveDateRange self-validation |
| Unit: Leave Day Calculation | 5–8 | Holiday exclusion, half-day count, multi-day count, no holidays |
| Integration: Leave Type CRUD | 5–8 | Create, update, deactivate, delete-with-requests-blocked |
| Integration: Leave Request Lifecycle | 15–20 | Create (balance check, overlap check), approve (balance deduct, pessimistic lock), reject (reason validation) |
| Integration: Balance Management | 8–12 | Allocation, rollover (carry-forward, lapsed, already-processed), negative balance |
| Integration: Attendance Listener | 3–5 | Approval → attendance records created, half-day handling, idempotency |
| Integration: API Endpoints | 15–20 | Full HTTP lifecycle, capability enforcement, self-approval block |
| Integration: Notification Listeners | 2–3 | LeaveRequestCreated → approver notification, approval/rejection → requester notification |
| **Total** | **~70–100** | |

### 12.2 Critical Test Scenarios

These MUST be covered:

1. **Insufficient balance, negative not allowed** → request rejected at creation with `InsufficientLeaveBalanceException`.
2. **Insufficient balance, negative allowed** → request created successfully, balance goes negative on approval.
3. **Overlapping dates with existing approved leave** → request rejected with `LeaveOverlapException`.
4. **Self-approval** → approver tries to approve own request → `SelfApprovalNotAllowedException`.
5. **Balance re-check at approval** → create request when balance is sufficient, another approval consumes balance before this one is approved → second approval fails.
6. **Concurrent approval race condition** → two approvers approve simultaneously for same employee → pessimistic lock serializes them, second one fails if balance insufficient.
7. **Holiday exclusion** → 5 calendar days requested, 1 is a holiday → `requested_days = 4`.
8. **Half-day validation** → half-day request with `from_date != to_date` → rejected.
9. **Cross-year request** → `from_date` in 2026, `to_date` in 2027 → rejected.
10. **Rollover already processed** → trigger rollover for 2027 twice → second attempt fails with `RolloverAlreadyProcessedException`.
11. **Carry-forward cap** → employee has 10 unused days, max carry-forward is 5 → only 5 carry forward, 5 lapse.
12. **Attendance integration on approval** → approve leave → verify `on_leave` staff attendance records created for each leave day.
13. **Delete leave type with existing requests** → blocked with `LeaveTypeInUseException`.
14. **Past date request** → `from_date` before today → rejected.
15. **Tenant isolation** → Employee in Tenant A cannot see Tenant B's leave types or requests.

---

## 13. Quality Gate

### 13.1 Functionality Gates

- [ ] All leave type CRUD operations work
- [ ] Leave requests create with correct day calculation (holiday-aware)
- [ ] Approval deducts balance correctly
- [ ] Rejection stores reason and notifies requester
- [ ] Half-day requests work for single-day only
- [ ] Overlap detection blocks conflicting requests
- [ ] Balance check enforced at both creation and approval
- [ ] Negative balance allowed per leave type configuration
- [ ] Year-end rollover preview shows correct carry-forward and lapsed amounts
- [ ] Year-end rollover creates correct new year balances
- [ ] Rollover blocked if already processed for target year
- [ ] Attendance integration: approved leave creates `on_leave` records
- [ ] Phase 14 notifications fire for all three events
- [ ] Pending count endpoint returns correct count

### 13.2 Security Gates

- [ ] All endpoints gated by appropriate `leave.*` capability middleware
- [ ] `leave.view` users see only own requests and balances
- [ ] `leave.manage` users see all employees
- [ ] Self-approval blocked
- [ ] Tenant isolation on every query
- [ ] `BelongsToTenant` trait on all Eloquent models

### 13.3 Performance Gates

- [ ] Balance check + overlap detection at request creation responds in < 200ms
- [ ] Approval with pessimistic lock completes in < 500ms
- [ ] Year-end rollover for 500 employees × 5 leave types completes in < 10 seconds
- [ ] Pending count endpoint responds in < 50ms

---

## 14. Constraints & Reminders

### Architecture Constraints

- **Domain entities are pure PHP.** No Eloquent, no framework imports in `Domain/`.
- **Use cases follow the established pattern:** validation → entity operation → transaction (with pessimistic lock where needed) → commit → audit log (outside transaction) → event dispatch.
- **Audit logs are written OUTSIDE the database transaction.** Platform convention from Phase 6+.
- **Domain events are past tense facts.** `LeaveRequestApproved`, not `ApproveLeaveRequest`.
- **The entity enforces state transitions.** Controllers and use cases do NOT check status directly.
- **Cross-context communication via domain events ONLY.** The Leave module does NOT import Attendance entities or repositories. It dispatches `LeaveRequestApproved`. The Attendance listener reacts.
- **Pessimistic locking on balance deduction.** `SELECT FOR UPDATE` in the approval transaction. Non-negotiable.
- **Balance `used_days` is always incremented, never decremented** (no cancel/revoke in Phase 1).
- **`requested_days` is a snapshot.** Computed once at creation, never recalculated.

### Docker Environment

- Container: Alpine Linux — use `sh` not `bash`
- Container name: `ubotz_backend`
- Database: `ubotz_mysql`
- Queue: Redis DB 3

### What NOT to Do

- Do NOT use MySQL ENUMs. VARCHAR + PHP enum, per platform convention.
- Do NOT create automatic balance records on user creation. Balances are created explicitly by admin allocation or rollover.
- Do NOT auto-schedule year-end rollover. It's a manual admin action.
- Do NOT use FLOAT for day counts. DECIMAL(5,1) for all day-related columns.
- Do NOT let the Leave module import Attendance entities directly. Communicate via domain events.
- Do NOT skip pessimistic locking on balance deduction. Race conditions in concurrent approval are a real risk.
- Do NOT trust frontend-submitted `tenant_id`. Resolve from `TenantContext` middleware.
- Do NOT use Laravel's `SoftDeletes` trait on leave requests. They are never deleted.
- Do NOT allow `requested_days` to be submitted by the frontend. Always compute server-side from dates + holidays.
- Do NOT block leave request creation if the holiday module doesn't exist. Degrade gracefully (count all days).

---

## 15. Definition of Done

This phase is complete when:

1. The implementation plan has been reviewed and approved by the Principal Engineer.
2. All code is implemented per the approved plan.
3. All quality gates in §13 pass.
4. A Principal Engineer audit confirms zero critical or high findings.
5. All findings from audit are resolved.
6. End-to-end demonstration: admin configures leave types → allocates balances → employee requests leave → system calculates days (holiday-aware) → approver approves → balance deducts → attendance marks `on_leave` → requester notified.
7. Self-approval blocked.
8. Overlap detection working.
9. Pessimistic locking verified under concurrent approval.
10. Year-end rollover: preview correct → execute creates correct balances → second execution blocked.
11. Phase 14 notifications verified for all three events.
12. Tenant isolation verified: zero cross-tenant data leakage.
13. ~70–100 tests pass covering all critical scenarios in §12.2.
14. The Phase Completion Report is signed off.

---

*End of Document — UBOTZ 2.0 Leave Management Developer Instructions — March 19, 2026*
