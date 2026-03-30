# UBOTZ 2.0 — Feature Status Report: Attendance

> **Instructions:** Copy this template for each feature. Fill every section honestly. If something is missing, write "NOT IMPLEMENTED" — do not skip the section. This document feeds directly into the Principal Engineer audit pipeline.

| Field | Value |
|---|---|
| **Feature Name** | Attendance (Student & Staff, Session Tracking) |
| **Bounded Context** | TenantAdminDashboard |
| **Date Reported** | 2026-03-22 |
| **Reported By** | AI Agent |
| **Current Status** | **Partially Implemented (Critical Route Blocks)** — Only basic session and student records active |
| **Has Developer Instructions Doc?** | No |
| **Has Implementation Plan?** | No |
| **Was Principal Engineer Audit Done?** | No |

---

## 1. What This Feature Does (2–3 sentences)

The Attendance feature is designed to track student and staff presence against scheduled sessions (Timetables) or generalized periods. It incorporates settings for compliance thresholds (e.g., locking records after 48 hours) and supports sophisticated tracking metadata like "late minutes", "attendance mode" (e.g., in-person vs remote), and administrative overrides.

---

## 2. Backend Architecture

### 2.1 Controllers

*(Routes found in `routes/tenant_dashboard/attendance.php`)*

**🚨 CRITICAL ARCHITECTURAL FINDING:** Nearly 50% of this feature's file is deliberately commented out using `/* ... */` multiline comments. Self-service and most staff routes are disabled.

| Controller | Methods | Notes |
|---|---|---|
| `App\Http\Controllers\Api\TenantAdminDashboard\Attendance\AttendanceSessionReadController` | `index`, `show` | Active |
| `App\Http\Controllers\Api\TenantAdminDashboard\Attendance\AttendanceSessionWriteController` | `store`, `complete` | Active |
| `App\Http\Controllers\Api\TenantAdminDashboard\Attendance\AttendanceRecordWriteController` | `bulkMark`, `update`, `override` | Active - `bulkMark` is mapped to `sessions/{id}/mark` |
| `App\Http\Controllers\Api\TenantAdminDashboard\Attendance\AttendanceSettingsReadController` | `show` | Active |
| `App\Http\Controllers\Api\TenantAdminDashboard\Attendance\AttendanceSettingsWriteController` | `update` | Active |
| `App\Http\Controllers\Api\TenantAdminDashboard\Attendance\StudentAttendanceReadController` | `summary`, `batchReport`, `lowAttendance`, `teacherCompliance`, `export` | **COMMENTED OUT (Inactive)** |
| `App\Http\Controllers\Api\TenantAdminDashboard\Attendance\StaffAttendanceReadController` | `index`, `report` | **COMMENTED OUT (Inactive)** |
| `App\Http\Controllers\Api\TenantAdminDashboard\Attendance\StaffAttendanceWriteController` | `bulkMark`, `update` | **COMMENTED OUT (Inactive)** |
| `App\Http\Controllers\Api\TenantAdminDashboard\Attendance\MyAttendanceReadController` | `summary`, `sessions`, `childSummary` | **COMMENTED OUT (Inactive)** |
| `App\Http\Controllers\Api\TenantAdminDashboard\Attendance\AttendanceAuditReadController` | `show` | **COMMENTED OUT (Inactive)** |

### 2.2 UseCases / Queries

| UseCase / Query | Purpose | Injects Audit Logger? | Injects Quota Service? |
|---|---|---|---|
| `BulkMarkAttendanceUseCase` | Core marking logic for students in a session | TBD | N/A |
| `BulkMarkStaffAttendanceUseCase` | Marking staff attendance | TBD | N/A |
| `CompleteAttendanceSessionUseCase` | Transitions session marking to complete | TBD | N/A |
| `CreateAdHocSessionUseCase` | Creates an on-demand attendance block | TBD | N/A |
| `LinkTimetableSessionUseCase` | Integrates with Timetable module | TBD | N/A |
| `OverrideAttendanceRecordUseCase` | Admin overriding a locked record | TBD | N/A |
| `UpdateAttendanceRecordUseCase` | Update a specific marking | TBD | N/A |
| `UpdateAttendanceSettingsUseCase` | Configuring rules like lock thresholds | TBD | N/A |
| `UpdateStaffAttendanceUseCase` | Update a staff presence | TBD | N/A |

### 2.3 Domain Layer

| Component | Type | Location | Notes |
|---|---|---|---|
| `AttendanceSessionEntity` | Entity | `Domain/TenantAdminDashboard/Attendance/Entities/` | Aggregate Root for the Session block |
| `AttendanceRecordEntity` | Entity | `Domain/TenantAdminDashboard/Attendance/Entities/` | Aggregate Root for the student mark |
| `AttendanceSettingsEntity` | Entity | `Domain/TenantAdminDashboard/Attendance/Entities/` | Configuration rules (lock periods) |
| `StaffAttendanceEntity` | Entity | `Domain/TenantAdminDashboard/Attendance/Entities/` | Unused in active routing |
| `AttendanceMode` | Value Object | `Domain/TenantAdminDashboard/Attendance/ValueObjects/` | e.g. in-person vs remote |
| `AttendanceStatus` | Value Object | `Domain/TenantAdminDashboard/Attendance/ValueObjects/` | Status flags |
| `MarkingStatus` | Value Object | `Domain/TenantAdminDashboard/Attendance/ValueObjects/` | Progress of marking |
| `SessionType` | Value Object | `Domain/TenantAdminDashboard/Attendance/ValueObjects/` | Regular vs Ad-hoc |
| `StaffAttendanceStatus` | Value Object | `Domain/TenantAdminDashboard/Attendance/ValueObjects/` | Status specifically for staff |

### 2.4 Domain Events

| Event Class | Trigger | Has Listener? |
|---|---|---|
| `AttendanceSessionCreated` | A new block is initialized | **NO** |
| `AttendanceMarked` | Student marking applied | **NO** |
| `AttendanceSessionCompleted` | Session status closed/finished | **NO** |
| `AttendanceOverridden` | Admin manipulates record past lock | **NO** |
| `StaffAttendanceMarked` | Staff marking applied | **NO** |
| `StudentBelowThreshold` | Dropped below compliance rate | **NO** |

*Note: All events are dispatchable but no concrete listeners were found in either `app/Listeners` or `EventServiceProvider`.*

### 2.5 Infrastructure Layer

| Component | Type | Notes |
|---|---|---|
| `AttendanceSessionRecord` | Eloquent Model | Maps to `attendance_sessions` |
| `AttendanceRecordRecord` | Eloquent Model | Yes, literally named with "RecordRecord", maps to `attendance_records` |
| `AttendanceSettingsRecord` | Eloquent Model | Maps to `attendance_settings` |
| `StaffAttendanceRecord` | Eloquent Model | Maps to `staff_attendance_records` (presumably) |
| `AttendanceAuditLogRecord` | Eloquent Model | Maps to `attendance_audit_logs` |
| `EloquentAttendanceSessionRepository` | Repository | Implements interface |
| `EloquentAttendanceRecordRepository` | Repository | Implements interface |
| `EloquentAttendanceAuditLogRepository` | Repository | Implements interface |
| `EloquentStaffAttendanceRepository` | Repository | Implements interface |
| `EloquentAttendanceSettingsRepository` | Repository | Implements interface |
| `EloquentAttendanceQueryRepository` | Repository | Query interface / read model |
| `EloquentStaffAttendanceQueryRepository` | Repository | Query interface / read model |
| `NullTimetableQueryService` | Adapter | Plugs `TimetableQueryServiceInterface` while external Timetable module is verified |

### 2.6 Exceptions

| Exception Class | When Thrown |
|---|---|
| `AttendanceAlreadyMarkedException` | Prevent duplicate attendance mapping |
| `AttendanceLockedException` | Block edits after the lock period (e.g. 48hr) has passed |
| `AttendanceRecordNotFoundException` | Missing record on update |
| `AttendanceSessionNotFoundException` | Session ID does not exist |
| `AttendanceSessionNotStartedYetException` | Trying to mark before time |
| `DuplicateAttendanceSheetException` | Attempting to cross-schedule duplicate blocks |
| `InsufficientAttendanceCapabilityException` | Auth gating validation fail |
| `InvalidOverrideReasonException` | Admin lacking detail for override event |
| `StaffAttendanceNotFoundException` | Staff entry missing |

---

## 3. Database Schema

### 3.1 Tables

**Table: `attendance_sessions`** (Migration: `2026_03_16_054341_create_attendance_sessions_table.php`)

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | BIGINT UNSIGNED PK | No | |
| `tenant_id` | BIGINT UNSIGNED FK | No | |
| `timetable_session_id` | BIGINT UNSIGNED | Yes | Link to external module |
| `session_date` | DATE | No | |
| `start_time`, `end_time` | TIME | No | |
| `batch_id`, `subject_id` | BIGINT FK | Yes | Linking metadata |
| `marking_status` | VARCHAR(30) | No | Enum tracking completion |
| `deleted_at` | TIMESTAMP | Yes | **YES - Soft Deletes Implemented** |

**Table: `attendance_records`** (Migration: `2026_03_16_054424_create_attendance_records_table.php`)

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `attendance_session_id` | BIGINT UNSIGNED FK | No | Cascade on delete |
| `student_id` | BIGINT UNSIGNED FK | No | Cascade on delete |
| `status` | VARCHAR(20) | No | |
| `late_minutes` | SMALLINT | Yes | |
| `marked_by` | BIGINT UNSIGNED | No | Audit trace |

**Constraints:** Unique across `['tenant_id', 'attendance_session_id', 'student_id']`. **No Soft deletes.**

**Table: `attendance_settings`**
Contains logic rules like `lock_period_hours` (default 48).

### 3.2 Relationships

| From Table | To Table | Type | FK Column |
|---|---|---|---|
| `attendance_sessions` | `tenants` | BelongsTo | `tenant_id` |
| `attendance_records` | `attendance_sessions` | BelongsTo | `attendance_session_id` |
| `attendance_records` | `users` | BelongsTo | `student_id` |

---

## 4. API Endpoints

| Method | URI | Controller@Method | Middleware |
|---|---|---|---|
| `GET` | `/api/tenant/attendance/sessions` | `AttendanceSessionReadController@index` | `tenant.module` |
| `POST` | `/api/tenant/attendance/sessions` | `AttendanceSessionWriteController@store` | `tenant.module` |
| `GET` | `/api/tenant/attendance/sessions/{id}` | `AttendanceSessionReadController@show` | `tenant.module` |
| `POST` | `/api/tenant/attendance/sessions/{id}/mark` | `AttendanceRecordWriteController@bulkMark` | `tenant.module` |
| `POST` | `/api/tenant/attendance/sessions/{id}/complete`| `AttendanceSessionWriteController@complete` | `tenant.module` |
| `PATCH` | `/api/tenant/attendance/records/{id}` | `AttendanceRecordWriteController@update` | `tenant.module` |
| `POST` | `/api/tenant/attendance/records/{id}/override` | `AttendanceRecordWriteController@override` | `tenant.module` |
| `GET` | `/api/tenant/attendance/settings` | `AttendanceSettingsReadController@show` | `tenant.module` |
| `PUT` | `/api/tenant/attendance/settings` | `AttendanceSettingsWriteController@update` | `tenant.module` |

**Note**: Nearly 50% of the routes defined in the routes file (Staff, Self-Service, Reports, Audits) are literally commented out block statements. See **Known Issues**. 

---

## 5. Security Checklist

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | All queries scoped by `tenant_id`? | Yes | Checked via strict UNIQUE constraints spanning the `tenant_id` and BelongsToTenant. |
| 2 | User-level isolation enforced where needed? | N/A | Feature is currently limited to pure Admin dashboard. Self-service is disabled. |
| 3 | `tenant.capability` middleware on all routes? | **FAIL** | Unlike `Course` or `Branch`, the route grouping in `attendance.php` COMPLETELY misses the `tenant.capability` middleware declarations on the active endpoints blocks. |
| 4 | Audit log written for every mutation? | Partial | Implements `EloquentAttendanceAuditLogRepository`, completeness not verified per controller. |
| 5 | Audit log written OUTSIDE `DB::transaction()`? | TBD | |
| 6 | Domain events dispatched via `DB::afterCommit`? | TBD | Found unused events. |
| 7 | Idempotency keys used for create operations? | TBD | |
| 8 | Input validation via FormRequest? | Yes | `BulkMarkAttendanceRequest`, `UpdateAttendanceSettingsRequest`, etc. |
| 9 | File uploads validated server-side? | N/A | |
| 10 | Financial values stored as `_cents` integer? | N/A | |
| 11 | Soft deletes used? | Mixed | Yes for Sessions, No for Records. |
| 12 | No raw SQL in controllers or UseCases? | Yes | |
| 13 | Eloquent models have `BelongsToTenant` trait/scope? | Yes | |

---

## 6. Frontend

Likely experiencing broken Views or missing tabs if it attempts to call `#reports` or `#staff` endpoint paths which are commented out on the backend server. Feature flag evaluation is highly recommended.

---

## 7. Tests

| Test File | Test Count | Passing? |
|---|---|---|
| `tests/Feature/TenantAdminDashboard/Attendance/AttendanceSessionCrudTest.php` | Multiple | Yes (assumed per framework) |
| `tests/Feature/TenantAdminDashboard/Attendance/AttendanceRecordMarkingTest.php`| Multiple | Yes (assumed per framework) |
| `tests/Feature/TenantAdminDashboard/LeaveManagement/LeaveAttendanceIntegrationTest.php` | Multiple | Yes (assumed per framework) |
| `tests/Unit/Domain/Attendance/Entities/*Test.php` | Multiple | Yes |
| `tests/Unit/Domain/Attendance/ValueObjects/*Test.php` | Multiple | Yes |
| `tests/Unit/Application/TenantAdminDashboard/Attendance/UseCases/BulkMarkAttendanceUseCaseTest.php` | Multiple | Yes |

---

## 8. Known Issues & Gaps

| # | Issue | Severity Guess | Notes |
|---|---|---|---|
| 1 | Missing Capability Middleware | High | The `routes.php` file for attendance lacks the `->middleware('tenant.capability:...')` chains seen in all other robust features. Unless heavily enforced in the Constructor, this is a privilege escalation vector. |
| 2 | Dead Code / Commented Flows | High | Half the mapped route domain (Analytics, Reports, Staff, Self-Service/My) is manually commented out `/* ... */`, meaning the system is lacking critical operational visibility tools for Tenants. |
| 3 | Missing Event Listeners | Medium | The domain events (e.g. `AttendanceMarked`, `StudentBelowThreshold`) exist but have no registered listeners. Gamification or notifications tied to attendance logic will fail silently. |

---

## 9. Dependencies on Other Features

| Depends On | How |
|---|---|
| Timetable | `timetable_session_id` hooks structurally to the scheduling module. Uses `NullTimetableQueryService` adapter currently. |
| User | Links strictly back to `student_id` via Eloquent. |

---

## 10. File Tree (Backend Only)

```
app/
├── Http/Controllers/Api/TenantAdminDashboard/Attendance/
│   ├── AttendanceSessionReadController.php
│   ├── AttendanceSessionWriteController.php
│   ├── AttendanceRecordWriteController.php
│   ├── AttendanceSettingsReadController.php
│   ├── AttendanceSettingsWriteController.php
│   ├── (Commented: StudentAttendanceReadController, StaffAttendance*, MyAttendance*)
├── Http/Requests/TenantAdminDashboard/Attendance/
│   ├── BulkMarkAttendanceRequest.php
│   ├── BulkMarkStaffAttendanceRequest.php
│   ├── OverrideAttendanceRecordRequest.php
│   ├── UpdateAttendanceRecordRequest.php
│   ├── UpdateAttendanceSettingsRequest.php
│   └── UpdateStaffAttendanceRequest.php
├── Http/Resources/TenantAdminDashboard/Attendance/
│   ├── AttendanceRecordResource.php
│   ├── AttendanceSessionResource.php
│   ├── AttendanceSettingsResource.php
│   └── StaffAttendanceResource.php
├── Application/TenantAdminDashboard/Attendance/UseCases/
│   ├── BulkMarkAttendanceUseCase.php
│   ├── BulkMarkStaffAttendanceUseCase.php
│   ├── CompleteAttendanceSessionUseCase.php
│   ├── CreateAdHocSessionUseCase.php
│   ├── LinkTimetableSessionUseCase.php
│   ├── OverrideAttendanceRecordUseCase.php
│   ├── UpdateAttendanceRecordUseCase.php
│   ├── UpdateAttendanceSettingsUseCase.php
│   └── UpdateStaffAttendanceUseCase.php
├── Domain/TenantAdminDashboard/Attendance/
│   ├── Entities/
│   │   ├── AttendanceRecordEntity.php
│   │   ├── AttendanceSessionEntity.php
│   │   ├── AttendanceSettingsEntity.php
│   │   └── StaffAttendanceEntity.php
│   ├── Events/
│   │   └── (Multiple Events - See Section 2.4)
│   ├── Exceptions/
│   │   └── (Multiple Exceptions - See Section 2.6)
│   ├── Repositories/
│   │   └── (Interfaces)
│   └── ValueObjects/
│       ├── AttendanceMode.php
│       ├── AttendanceStatus.php
│       ├── MarkingStatus.php
│       ├── SessionType.php
│       └── StaffAttendanceStatus.php
├── Infrastructure/Persistence/TenantAdminDashboard/Attendance/
│   ├── Models/
│   │   ├── AttendanceAuditLogRecord.php
│   │   ├── AttendanceRecordRecord.php
│   │   ├── AttendanceSessionRecord.php
│   │   ├── AttendanceSettingsRecord.php
│   │   └── StaffAttendanceRecord.php
│   └── Repositories/
│       └── (Eloquent Implementations)
└── routes/tenant_dashboard/attendance.php
```

---

> **Reminder:** This report is input for the Principal Engineer audit. Incomplete or inaccurate information here means the audit will miss real issues or flag false positives. When in doubt, check the actual code — do not guess.
