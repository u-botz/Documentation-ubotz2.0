# UBOTZ 2.0 Attendance Technical Specification

This document reflects the **current** Laravel implementation. Application orchestration lives under `App\Application\TenantAdminDashboard\Attendance`; domain contracts under `App\Domain\TenantAdminDashboard\Attendance`; persistence as Eloquent records under `App\Infrastructure\Persistence\TenantAdminDashboard\Attendance`.

---

## 1. HTTP surface

Routes: `backend/routes/tenant_dashboard/attendance.php`, mounted under the authenticated **`/api/tenant`** group in `backend/routes/api.php` (same middleware stack as other tenant dashboard APIs: `tenant.resolve.token`, `auth:tenant_api`, `tenant.active`, etc.).

This route file does **not** wrap all paths in `tenant.module:module.erp.attendance`. Capability checks use **`attendance.view`** and **`attendance.manage`**, which are unlocked for tenants that have entitlement **`module.erp.attendance`** via `ModuleCapabilityMap` + `TenantCapabilityChecker` (see §4).

### 1.1 Core — prefix `/api/tenant/attendance`

| Method | Path (relative to prefix) | Controller | Notes |
|--------|---------------------------|------------|--------|
| `GET` | `sessions` | `AttendanceSessionReadController@index` | `attendance.view` enforced in `ListAttendanceSessionsQuery` |
| `POST` | `sessions` | `AttendanceSessionWriteController@store` | `attendance.manage` in use case |
| `GET` | `sessions/{id}` | `AttendanceSessionReadController@show` | Tenant-scoped fetch only — **no** `attendance.view` check in controller (align with product if stricter RBAC is required). |
| `POST` | `sessions/{id}/mark` | `AttendanceRecordWriteController@bulkMark` | `attendance.manage` in `BulkMarkAttendanceUseCase` |
| `POST` | `sessions/{id}/complete` | `AttendanceSessionWriteController@complete` | `attendance.manage` |
| `PATCH` | `records/{id}` | `AttendanceRecordWriteController@update` | `attendance.manage` |
| `POST` | `records/{id}/override` | `AttendanceRecordWriteController@override` | `attendance.manage` |
| `GET` | `settings` | `AttendanceSettingsReadController@show` | Authenticated tenant user; **no** capability middleware on controller (read is open within tenant auth). |
| `PUT` | `settings` | `AttendanceSettingsWriteController@update` | `attendance.manage` |

### 1.2 Student summary & reports — same prefix

| Method | Path | Controller | Middleware / auth |
|--------|------|------------|-------------------|
| `GET` | `students/{id}/summary` | `StudentAttendanceReadController@summary` | Caller may read **own** `{id}` without `attendance.view`; viewing another student’s summary requires `attendance.view` (see controller). |
| `GET` | `reports/batch/{id}` | `StudentAttendanceReadController@batchReport` | `tenant.capability:attendance.view` |
| `GET` | `reports/low-attendance` | `StudentAttendanceReadController@lowAttendance` | `tenant.capability:attendance.view` |
| `GET` | `reports/teacher-compliance` | `StudentAttendanceReadController@teacherCompliance` | `tenant.capability:attendance.view` |
| `GET` | `reports/export` | `StudentAttendanceReadController@export` | `tenant.capability:attendance.view` |

### 1.3 Staff attendance — same prefix

| Method | Path | Controller | Middleware |
|--------|------|------------|------------|
| `GET` | `staff` | `StaffAttendanceReadController@index` | `tenant.capability:attendance.view` |
| `GET` | `staff/reports` | `StaffAttendanceReadController@report` | `tenant.capability:attendance.view` |
| `POST` | `staff/mark` | `StaffAttendanceWriteController@bulkMark` | `tenant.capability:attendance.manage` |
| `PATCH` | `staff/{id}` | `StaffAttendanceWriteController@update` | `tenant.capability:attendance.manage` |

### 1.4 Self-service — prefix `/api/tenant/my`

Defined in the same `attendance.php` file **outside** the `attendance` prefix group.

| Method | Path (relative to `/api/tenant/my`) | Controller | Notes |
|--------|--------------------------------------|------------|--------|
| `GET` | `attendance` | `MyAttendanceReadController@summary` | Current user’s summary; no `attendance.view` required for own data |
| `GET` | `attendance/sessions` | `MyAttendanceReadController@sessions` | Same |
| `GET` | `children/{id}/attendance` | `MyAttendanceReadController@childSummary` | **Not implemented** — returns **501** until parent/guardian product rules exist |

### 1.5 Not registered

| Intended | Status |
|----------|--------|
| `GET /api/tenant/attendance/records/{id}/audit` | **Commented out** — `AttendanceAuditReadController` not wired |

---

## 2. Relational schema (tenant DB)

### 2.1 `attendance_sessions`

Migration: `2026_03_16_054341_create_attendance_sessions_table.php`.

| Column | Role |
|--------|------|
| `tenant_id` | Isolation; FK `fk_attendance_sessions_tenants` |
| `timetable_session_id` | Optional link to timetable; **unique** with tenant: `unq_attendance_sessions_tenant_timetable` |
| `session_title`, `session_date`, `start_time`, `end_time` | Scheduling |
| `batch_id`, `subject_id`, `teacher_id`, `branch_id` | Optional contextual FKs |
| `session_type`, `marking_status` | Domain value objects (`SessionType`, `MarkingStatus`) |
| `marked_by`, `marked_at` | Completion sign-off |
| **`locked_at`** | Immutability clock — `AttendanceSessionEntity::isLocked($now)` is true when `now >= locked_at` |
| `is_cancelled`, `notes` | Operational flags |
| Soft deletes | `deleted_at` on sessions |

Indexes: `idx_attendance_sessions_tenant_date`, `idx_attendance_sessions_tenant_teacher`, `idx_attendance_sessions_tenant_batch`.

### 2.2 `attendance_records`

Migration: `2026_03_16_054424_create_attendance_records_table.php`.

| Column | Role |
|--------|------|
| `tenant_id` | Scoped FK |
| `attendance_session_id` | Parent session |
| `student_id` | Student user |
| `status`, `attendance_mode`, `late_minutes`, `reason` | Marking payload |
| `marked_by`, `marked_at` | Who/when the row was marked |

Unique: `(tenant_id, attendance_session_id, student_id)`.

### 2.3 `attendance_settings`

Migration: `2026_03_16_053652_create_attendance_settings_table.php`.

One row per tenant (`tenant_id` **unique**): `lock_period_hours`, `threshold_percentage`, `threshold_period`, `excused_excludes_denominator`, `default_attendance_mode`.

### 2.4 Other tables

- **`attendance_audit_logs`** (`2026_03_16_054818_create_attendance_audit_logs_table.php`) — audit trail for changes (wired in write use cases). **HTTP read** for a single record audit is not exposed (see §1.5).
- **`staff_attendance`** (`2026_03_16_060000_create_staff_attendance_table.php`) — used by staff read/write routes in §1.3.

---

## 3. Application use cases (selected)

| Use case | Role |
|----------|------|
| `CreateAdHocSessionUseCase` | New session without timetable link |
| `LinkTimetableSessionUseCase` | Bind `timetable_session_id` |
| `BulkMarkAttendanceUseCase` | `sessions/{id}/mark`; checks **`attendance.manage`**, session state, settings; audit |
| `UpdateAttendanceRecordUseCase` | PATCH record; **rejects** when session `isLocked` unless business rules apply (see code) |
| `OverrideAttendanceRecordUseCase` | POST override; requires **`attendance.manage`** |
| `CompleteAttendanceSessionUseCase` | POST complete; sets marking completed, `marked_by` / `marked_at` |
| `UpdateAttendanceSettingsUseCase` | PUT settings |
| `UpdateStaffAttendanceUseCase`, `BulkMarkStaffAttendanceUseCase` | Wired to **`PATCH staff/{id}`** and **`POST staff/mark`** |

Queries / read services: `ListAttendanceSessionsQuery`, `AttendanceQueryService`, `StaffAttendanceQueryService` (report/staff/report controllers delegate to these patterns).

---

## 4. Capabilities & module entitlement

- **Module:** `module.erp.attendance` maps to capabilities **`attendance.view`** and **`attendance.manage`** in `ModuleCapabilityMap`.
- **Route middleware:** `tenant.capability:attendance.view` on report and staff **read** groups; `tenant.capability:attendance.manage` on staff **write** routes (`staff/mark`, `staff/{id}`).
- **Use cases:** Most mutations and session listing checks use **`attendance.manage`** or **`attendance.view`** via `TenantCapabilityCheckerInterface` (not legacy `CAP_*` strings).

Tests that need attendance capabilities to resolve typically mock or seed **`module.erp.attendance`** (and often `module.lms`) so `userHasCapability` returns true for the actor.

---

## 5. Domain behavior (sessions)

- **`AttendanceSessionEntity`**: `complete()` sets `markingStatus` to `completed` and records `markedBy` / `markedAt`; emits `AttendanceSessionCompleted`.
- **`lock($lockedAt)`** sets `locked_at`; **`isLocked($now)`** compares wall-clock time to `locked_at`.
- Threshold / low-attendance style events may be raised from bulk mark (e.g. `StudentBelowThreshold` in `BulkMarkAttendanceUseCase`).

---

## 6. Frontend

Centralized paths: **`API_ENDPOINTS.TENANT_ATTENDANCE`** in [`frontend/config/api-endpoints.ts`](../../../../frontend/config/api-endpoints.ts) (includes nested **`MY`** for `/api/tenant/my/attendance`, `/api/tenant/my/attendance/sessions`, and `children/{id}/attendance`). Thin wrappers live in [`frontend/services/tenant-attendance-service.ts`](../../../../frontend/services/tenant-attendance-service.ts).

Dashboard widgets may continue to use aggregated metrics from `tenant-dashboard-service`. **Full session marking UI** (timetable-integrated or standalone screens calling `bulkMark`, etc.) is a separate product effort—constants and service are ready for consumers.

---

## 7. Linked code references

| Layer | Path |
|-------|------|
| Application | `backend/app/Application/TenantAdminDashboard/Attendance/` |
| Domain | `backend/app/Domain/TenantAdminDashboard/Attendance/` |
| HTTP | `backend/app/Http/Controllers/Api/TenantAdminDashboard/Attendance/` |
| Routes | `backend/routes/tenant_dashboard/attendance.php` |
| Frontend API | `frontend/config/api-endpoints.ts` — `TENANT_ATTENDANCE` |
| Frontend service | `frontend/services/tenant-attendance-service.ts` |

---

## 8. Document history

- Replaced references to non-existent `UpdateAttendanceStatusUseCase` and legacy **`CAP_*`**-only capability names with **`attendance.view`** / **`attendance.manage`** and `ModuleCapabilityMap`.
- **2026-03:** Documented **live** student reports, staff attendance, and **`/api/tenant/my`** self-service routes; noted **501** for parent/child attendance and **unregistered** record audit GET.
- Older drafts stated that most report/staff/self-service routes were commented out — **that is obsolete** for the current repository.
- **2026-03-30:** Centralized frontend API paths (`TENANT_ATTENDANCE`) and `tenant-attendance-service.ts`.
