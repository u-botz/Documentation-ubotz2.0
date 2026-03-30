# UBOTZ 2.0 Attendance Technical Specification

This document reflects the **current** Laravel implementation. Application orchestration lives under `App\Application\TenantAdminDashboard\Attendance`; domain contracts under `App\Domain\TenantAdminDashboard\Attendance`; persistence as Eloquent records under `App\Infrastructure\Persistence\TenantAdminDashboard\Attendance`.

---

## 1. HTTP surface

Routes: `backend/routes/tenant_dashboard/attendance.php`, mounted under the authenticated **`/api/tenant`** group in `backend/routes/api.php` (same middleware stack as other tenant dashboard APIs).

**Prefix:** `/api/tenant/attendance`

| Method | Path | Controller | Purpose |
|--------|------|------------|---------|
| `GET` | `sessions` | `AttendanceSessionReadController@index` | List sessions |
| `POST` | `sessions` | `AttendanceSessionWriteController@store` | Create (e.g. ad-hoc) session |
| `GET` | `sessions/{id}` | `AttendanceSessionReadController@show` | Session detail |
| `POST` | `sessions/{id}/mark` | `AttendanceRecordWriteController@bulkMark` | Bulk mark roster |
| `POST` | `sessions/{id}/complete` | `AttendanceSessionWriteController@complete` | Complete session (sign-off) |
| `PATCH` | `records/{id}` | `AttendanceRecordWriteController@update` | Update one record |
| `POST` | `records/{id}/override` | `AttendanceRecordWriteController@override` | Override after lock (capability-gated) |
| `GET` | `settings` | `AttendanceSettingsReadController@show` | Tenant attendance settings |
| `PUT` | `settings` | `AttendanceSettingsWriteController@update` | Update settings |

**Commented out (not exposed):** student/staff reports, staff attendance CRUD, record audit GET, and self-service `my/attendance` routes — see the same file for the exact list.

There is **no** `tenant.module` or `tenant.capability` middleware on these routes in `attendance.php`; **authorization** is enforced inside use cases via `TenantCapabilityCheckerInterface` (see §4).

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

- **`attendance_audit_logs`** (`2026_03_16_054818_create_attendance_audit_logs_table.php`) — audit trail for changes (wired in write use cases).
- **`staff_attendance`** (`2026_03_16_060000_create_staff_attendance_table.php`) — schema exists; **API routes for staff attendance are commented out** in `attendance.php`.

---

## 3. Application use cases (selected)

| Use case | Role |
|----------|------|
| `CreateAdHocSessionUseCase` | New session without timetable link |
| `LinkTimetableSessionUseCase` | Bind `timetable_session_id` |
| `BulkMarkAttendanceUseCase` | `sessions/{id}/mark`; checks capabilities, session state, settings; audit |
| `UpdateAttendanceRecordUseCase` | PATCH record; **rejects** when session `isLocked` unless business rules apply (see code) |
| `OverrideAttendanceRecordUseCase` | POST override; requires **`CAP_ATTENDANCE_OVERRIDE`**; does not duplicate the normal “locked session” path for standard edits |
| `CompleteAttendanceSessionUseCase` | POST complete; sets marking completed, `marked_by` / `marked_at` |
| `UpdateAttendanceSettingsUseCase` | PUT settings |
| `UpdateStaffAttendanceUseCase`, `BulkMarkStaffAttendanceUseCase` | Present in codebase; **no live routes** in `attendance.php` at time of writing |

Queries: `ListAttendanceSessionsQuery`, services under `AttendanceQueryService` / `StaffAttendanceQueryService`.

---

## 4. Capabilities (not route middleware)

Use cases reference capability keys such as:

- **`CAP_ATTENDANCE_MARK`** — bulk mark, update (where allowed), complete session.
- **`CAP_ATTENDANCE_OVERRIDE`** — override endpoint and elevated paths in update logic.

These are **not** the string `attendance.manage` from older drafts; map them to tenant roles/capabilities in seed data and admin UI.

---

## 5. Domain behavior (sessions)

- **`AttendanceSessionEntity`**: `complete()` sets `markingStatus` to `completed` and records `markedBy` / `markedAt`; emits `AttendanceSessionCompleted`.
- **`lock($lockedAt)`** sets `locked_at`; **`isLocked($now)`** compares wall-clock time to `locked_at`.
- Threshold / low-attendance style events may be raised from bulk mark (e.g. `StudentBelowThreshold` in `BulkMarkAttendanceUseCase`).

---

## 6. Frontend

There is **no** dedicated `api-endpoints.ts` block for `/api/tenant/attendance` in the same style as batches/blog at time of writing. Dashboard widgets reference **aggregated** attendance metrics (`tenant-dashboard-service`, teacher/global dashboard views). Full session marking UI may be routed elsewhere (e.g. timetable) or pending — treat **HTTP contract** in §1 as the source of truth for integrations.

---

## 7. Linked code references

| Layer | Path |
|-------|------|
| Application | `backend/app/Application/TenantAdminDashboard/Attendance/` |
| Domain | `backend/app/Domain/TenantAdminDashboard/Attendance/` |
| HTTP | `backend/app/Http/Controllers/Api/TenantAdminDashboard/Attendance/` |
| Routes | `backend/routes/tenant_dashboard/attendance.php` |

---

## 8. Document history

- Replaced references to non-existent `UpdateAttendanceStatusUseCase` and generic `attendance.manage` route middleware with **actual** use-case names and **CAP_*** capability checks.
- Documented **commented-out** routes and **staff** tables so readers do not assume full ERP surface from HTTP alone.
