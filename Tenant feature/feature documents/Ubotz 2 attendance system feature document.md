# UBOTZ 2.0 — Attendance System Feature Document

## Student & Staff Attendance Management

| Field | Value |
|---|---|
| **Document Type** | Feature Specification (Pre-Architecture) |
| **Version** | 1.0 |
| **Date** | March 16, 2026 |
| **Issued By** | Product & Architecture Team |
| **Audience** | Principal Engineer, Implementation Developer, Product Owner |
| **Status** | Draft — Pending Architecture Review |
| **Dependencies** | Timetable/Scheduling Module (prerequisite for timetable-linked attendance), Tenant RBAC (Phase 10A — complete), Notification Infrastructure (optional — Phase 1 uses dashboard flags, Phase 2 adds push/SMS/email) |

> **Design Principle:** This module must work equally well for a 30-student single-room coaching class and a 500+ student multi-branch institution. Every feature must pass the "small institute test" — if it adds overhead for a 2-teacher setup without proportional value, it does not belong in the core flow. Scale-dependent features are gated behind configuration, not imposed by default.

---

## 1. Problem Statement

### 1.1 What Institutions Face Today

Attendance tracking in Indian coaching institutes and educational institutions is overwhelmingly manual — paper registers, Excel sheets, or WhatsApp-based reporting. This creates several operational failures:

**For small institutes (30–100 students, 1 location):**
- Attendance lives in paper registers or personal Excel files with no centralized access
- Parents call the owner asking "was my child present today?" — answering requires physical register checks
- Identifying chronically absent students happens too late (end of term, not mid-month)
- Teachers forget to mark attendance or do it inconsistently because the process is cumbersome
- Special sessions (doubt clearing, extra classes, guest lectures) have no attendance tracking at all
- End-of-month reporting requires manual aggregation across multiple registers

**For multi-branch institutions (500+ students, 3+ branches):**
- No branch-level visibility for the institution owner who cannot be physically present everywhere
- Inconsistent teacher compliance — no way to know which teachers are consistently not marking attendance
- Late discovery of attendance problems — a student dropping below 75% is noticed at term-end, not week 3
- No audit trail when attendance is corrected after the fact — creates disputes with parents
- Attendance data is disconnected from fee calculations, exam eligibility, and progress reports
- Hybrid learning (some students online, some in-person) is tracked nowhere

### 1.2 What This Module Solves

The Attendance module provides a unified, audited, session-level attendance tracking system that integrates into the institution's operational workflow. It must:

1. Make marking attendance faster than paper (under 30 seconds per class session)
2. Provide real-time visibility into institutional attendance health
3. Flag at-risk students before it becomes a crisis
4. Maintain an immutable audit trail for every attendance record and correction
5. Expose attendance data to other modules (exams, fees, reports) via clean service interfaces
6. Scale from 1 teacher marking 15 students to 50 teachers across 5 branches marking 2,000 students

---

## 2. Scope Definition

### 2.1 In Scope

| Area | Details |
|---|---|
| **Student attendance** | Per-session tracking linked to timetable sessions AND ad-hoc sessions |
| **Staff attendance** | Daily check-in/check-out tracking for teachers and non-teaching staff |
| **Attendance states** | Present, Absent, Late, Excused |
| **Marking methods** | Manual roll call (primary), "mark all present then toggle exceptions" pattern |
| **Attendance mode** | In-person (default) / Online — optional field, not mandatory |
| **Correction workflow** | Edit within lock period (configurable), admin override after lock with mandatory reason |
| **Audit trail** | Every mark, edit, and override is logged with actor, timestamp, old value, new value, and reason |
| **Threshold alerts** | Configurable percentage threshold with dashboard-level flagging (Phase 1), push/SMS/email (Phase 2) |
| **Reports** | Student-wise, batch-wise, subject-wise, teacher compliance, branch-wise, date-range, exportable (PDF/Excel) |
| **Data exposure** | Internal service interfaces for other modules to query attendance data |
| **Multi-branch** | Branch-scoped views with consolidated cross-branch reporting for OWNER |

### 2.2 Explicitly Out of Scope (Not in This Feature)

| Area | Reason |
|---|---|
| **QR code self-service scanning** | Requires mobile app, geolocation infra, and adds complexity without proportional value for Phase 1. Deferred to Phase 2+. |
| **Biometric integration** | Hardware dependency. Will be supported via API hooks in a future phase when demand warrants it. |
| **GPS/geofencing** | Mobile app dependency. Not available in web-first Phase 1. |
| **Automated attendance from live class join time** | Requires Live Classes module. Will be an integration point when that module ships. |
| **Parent/student self-marking** | Attendance is an institutional record. Only authorized staff mark it. Students/parents have read-only access to their own records. |
| **Leave management system** | Separate module. Attendance records the fact (Excused absence). Leave management handles the approval workflow for leave requests. |

### 2.3 Phasing Strategy

**Phase 1 (Core — this document):** Manual attendance marking, correction workflow, audit trail, dashboard reporting, threshold flags on dashboard, data export, service interface for other modules.

**Phase 2 (Notifications):** Push/SMS/email alerts for low attendance thresholds, daily absence notifications to parents, teacher compliance reminders. Depends on Notification Infrastructure module.

**Phase 3 (Advanced Tracking):** QR code self-service, live class integration (auto-mark from session join time), biometric API hooks, geofencing for mobile app.

---

## 3. Business Rules (NON-NEGOTIABLE)

### 3.1 Attendance Record Rules

| Rule ID | Rule | Detail |
|---|---|---|
| ATT-BR-01 | Attendance is per-session, not per-day. | A student may be present for the 9 AM Physics class but absent for the 11 AM Chemistry class. Each session produces its own attendance record. |
| ATT-BR-02 | Every attendance record belongs to exactly one combination of: tenant + session + student + date. | This is the natural composite key. No duplicate records for the same student in the same session on the same date. |
| ATT-BR-03 | Attendance states are: `present`, `absent`, `late`, `excused`. | These are VARCHAR values, not MySQL ENUMs (per project convention). `present` = attended normally. `absent` = did not attend. `late` = arrived after session start (optional late_minutes field). `excused` = absent with valid reason (optional reason field). |
| ATT-BR-04 | Default state for unmarked students is `absent`. | If a teacher opens a session's attendance but does not mark a student, that student is `absent`. The system does not assume presence. |
| ATT-BR-05 | Attendance mode is optional: `in_person` (default) or `online`. | If not specified, defaults to `in_person`. Relevant for hybrid institutions. Stored as a nullable VARCHAR column. |
| ATT-BR-06 | Only users with `CAP_ATTENDANCE_MARK` capability can mark attendance. | Typically OWNER, ADMIN, TEACHER roles. A teacher can only mark attendance for sessions assigned to them (scope enforcement). |
| ATT-BR-07 | Only users with `CAP_ATTENDANCE_OVERRIDE` capability can edit attendance after the lock period. | Typically OWNER, ADMIN roles only. Every override requires a mandatory `reason` field. |
| ATT-BR-08 | Attendance records are soft-deletable but NEVER hard-deleted. | Even if a session is cancelled, the attendance records are marked as `cancelled` (inheriting from session status), not deleted. |

### 3.2 Session Linkage Rules

| Rule ID | Rule | Detail |
|---|---|---|
| ATT-BR-09 | Attendance can be linked to a timetable session (scheduled class) OR an ad-hoc session. | Timetable-linked: `timetable_session_id` is populated, inheriting batch, subject, teacher, date, and time from the timetable. Ad-hoc: `timetable_session_id` is NULL, and batch/subject/teacher/date/time are explicitly provided at creation time. |
| ATT-BR-10 | When attendance is linked to a timetable session, the session must exist and belong to the same tenant. | Foreign key constraint with tenant scoping. Prevents orphan attendance records. |
| ATT-BR-11 | Ad-hoc sessions require explicit metadata: session_title, date, start_time, end_time, batch_id (optional), subject_id (optional), teacher_id. | This supports doubt-clearing sessions, workshops, guest lectures, parent-teacher meetings, and any event not on the regular timetable. |
| ATT-BR-12 | A timetable session can have exactly one attendance sheet. | One-to-one relationship. If attendance has already been marked for a session, the existing sheet is opened for editing, not a new one created. |

### 3.3 Correction & Lock Rules

| Rule ID | Rule | Detail |
|---|---|---|
| ATT-BR-13 | Attendance lock period is configurable per tenant. Default: 48 hours after session end time. | Within the lock period, the original marker (teacher) or any user with `CAP_ATTENDANCE_MARK` can edit. After the lock period, only users with `CAP_ATTENDANCE_OVERRIDE` can edit. |
| ATT-BR-14 | Every attendance edit (within or outside lock period) creates an audit log entry. | The audit log captures: `actor_id`, `student_id`, `session_id`, `old_status`, `new_status`, `reason` (mandatory for post-lock edits, optional for within-lock edits), `edited_at` timestamp, `is_post_lock_override` boolean. |
| ATT-BR-15 | Bulk edits are logged as individual audit entries per student modified. | If an admin changes 5 students from `absent` to `present` in one operation, 5 audit log entries are created. Batch operations do not obscure individual changes. |
| ATT-BR-16 | The lock period is enforced at the backend (UseCase layer), not the frontend. | Frontend may hide the edit button after lock period for non-override users, but the backend UseCase MUST reject the edit regardless of what the frontend sends. |

### 3.4 Threshold & Alert Rules

| Rule ID | Rule | Detail |
|---|---|---|
| ATT-BR-17 | Attendance threshold is configurable per tenant. Default: 75%. | The threshold applies to the percentage of sessions attended vs total sessions in a configurable period (current month, current term, or rolling 30 days — tenant-configurable). |
| ATT-BR-18 | Students below the threshold are flagged on the dashboard. Phase 1 does not send notifications. | The dashboard displays a "Low Attendance" section listing students below threshold, grouped by batch. Phase 2 adds notification delivery. |
| ATT-BR-19 | Threshold calculation excludes `excused` absences from the "absent" count. | If a student attended 15 of 20 sessions, was excused for 3, and absent for 2: attendance % = 15 / (20 - 3) = 88%. Excused sessions are excluded from the denominator. |
| ATT-BR-20 | Threshold configuration and calculation logic live in the Attendance bounded context. Other modules query the result, not the raw data. | The `AttendanceQueryService` exposes `getStudentAttendancePercentage(studentId, periodStart, periodEnd)` and `getStudentsBelowThreshold(tenantId, threshold, periodStart, periodEnd)`. |

### 3.5 Staff Attendance Rules

| Rule ID | Rule | Detail |
|---|---|---|
| ATT-BR-21 | Staff attendance is daily, not session-based. | Staff (teachers, non-teaching staff) have one attendance record per day: `present`, `absent`, `late`, `on_leave`. |
| ATT-BR-22 | Staff attendance is marked by OWNER or ADMIN role users with `CAP_STAFF_ATTENDANCE_MARK`. | Teachers do not mark their own attendance. This prevents self-reporting fraud. |
| ATT-BR-23 | Staff attendance feeds into payroll calculations (future integration). | The Attendance module exposes staff attendance data via service interface. The Payroll module (when built) consumes this data. Attendance does not calculate pay deductions. |
| ATT-BR-24 | Staff attendance records follow the same audit trail rules as student attendance. | Every mark and edit is logged. Same lock period and override rules apply. |

---

## 4. User Stories by Role

### 4.1 Institution Owner (OWNER — L1 equivalent in tenant RBAC)

| ID | Story | Acceptance Criteria |
|---|---|---|
| US-01 | As an owner, I want to see today's attendance summary on my dashboard so I know the institution's pulse without clicking into reports. | Dashboard widget shows: total students present/absent/late today, percentage, comparison with yesterday. Loads within 2 seconds. |
| US-02 | As an owner, I want to see which students are below 75% attendance this month so I can intervene before it becomes a dropout. | "Low Attendance" section on dashboard, grouped by batch, showing student name, current %, sessions missed. Sortable by %. |
| US-03 | As an owner, I want to see which teachers have NOT marked attendance for their sessions today so I can enforce compliance. | "Pending Attendance" widget showing sessions past their start time with no attendance marked, teacher name, batch, time. |
| US-04 | As an owner, I want to configure the attendance lock period and threshold percentage for my institution. | Settings page under Attendance section. Lock period: numeric input (hours), default 48. Threshold: numeric input (%), default 75. Saved per-tenant. |
| US-05 | As an owner, I want to override a locked attendance record with a documented reason. | After lock period, OWNER sees an "Override" button. Clicking opens a modal requiring a reason (text, minimum 10 characters). On submit, the record is updated and the override is logged in the audit trail. |
| US-06 | As an owner of a multi-branch institution, I want to see attendance broken down by branch so I know which branches need attention. | Branch filter on attendance dashboard. Default view shows all branches aggregated. Selecting a branch scopes all widgets to that branch. |
| US-07 | As an owner, I want to export attendance reports as PDF or Excel for record-keeping and regulatory compliance. | Export button on reports page. Filters (date range, batch, student, branch) are applied to the export. PDF has institutional letterhead. Excel has raw data with headers. |

### 4.2 Admin (ADMIN — hierarchy_level 80)

| ID | Story | Acceptance Criteria |
|---|---|---|
| US-08 | As an admin, I want to mark attendance on behalf of a teacher who is unable to (sick, technical issues) with proper attribution. | Admin can open any session's attendance sheet. The audit trail records the admin as the marker, not the assigned teacher. A note field allows the admin to explain why they're marking on behalf. |
| US-09 | As an admin, I want to create an ad-hoc attendance session for events not on the timetable (guest lecture, workshop, doubt-clearing). | "New Ad-hoc Session" button. Form requires: title, date, start time, end time. Optional: batch, subject, teacher. After creation, attendance sheet opens immediately. |
| US-10 | As an admin, I want to bulk-mark all students as present and then toggle the exceptions (absent/late) because most students attend most sessions. | Attendance sheet opens with all students pre-marked as `present`. Admin/teacher toggles individual students to `absent` or `late`. A "Mark All Absent" option also exists for cancelled sessions (edge case). |
| US-11 | As an admin, I want to view the complete audit trail for any attendance record to resolve disputes with parents. | Clicking on any attendance cell shows a history panel: original mark, every edit, who made each change, when, and why (reason field for post-lock overrides). |

### 4.3 Teacher (TEACHER — hierarchy_level 60)

| ID | Story | Acceptance Criteria |
|---|---|---|
| US-12 | As a teacher, I want to see my classes for today and mark attendance for each session from my mobile phone in under 30 seconds. | "My Classes Today" view showing scheduled sessions with "Mark Attendance" action button. The attendance sheet is a simple list of student names with tap-to-toggle status buttons (P/A/L/E). Saves on each toggle (auto-save, no submit button). |
| US-13 | As a teacher, I want to mark attendance ONLY for sessions assigned to me (not other teachers' sessions). | The attendance marking interface only shows sessions where `teacher_id` matches the logged-in teacher. Backend UseCase rejects any attempt to mark attendance for another teacher's session (unless the user also has `CAP_ATTENDANCE_MARK` with admin scope). |
| US-14 | As a teacher, I want to edit attendance I previously marked within the lock period (e.g., I marked a student absent but they arrived 10 minutes later). | Within lock period, the teacher can re-open the attendance sheet and change individual student statuses. Edit is saved and audit-logged. After lock period, the edit button is hidden and the backend rejects the request. |
| US-15 | As a teacher, I want to see the attendance trend for my batches so I can identify struggling students during class. | "Batch Attendance" view per teacher: list of students with attendance % for the current period (configurable: month/term). Students below threshold are highlighted. No access to other teachers' batch data. |

### 4.4 Student (STUDENT — hierarchy_level 20)

| ID | Story | Acceptance Criteria |
|---|---|---|
| US-16 | As a student, I want to see my own attendance record (sessions attended, missed, percentage) so I can track myself. | "My Attendance" section on student dashboard: overall %, subject-wise breakdown, calendar heatmap (green/red/yellow dots per day). Read-only. No edit capability. |
| US-17 | As a student, I want to know if my attendance is below the institution's threshold so I can improve before consequences. | A warning banner appears on the student dashboard if attendance % is below the threshold. The banner shows current % and sessions needed to recover. |

### 4.5 Parent (PARENT — hierarchy_level 10)

| ID | Story | Acceptance Criteria |
|---|---|---|
| US-18 | As a parent, I want to see my child's attendance for today immediately upon login so I know they reached the institution. | Parent dashboard "Today" widget: shows each scheduled session and whether the child was present/absent/late. If attendance hasn't been marked yet, shows "Pending". |
| US-19 | As a parent, I want to see my child's monthly attendance trend and be alerted if they're falling below the threshold. | Monthly attendance view with percentage and calendar heatmap. Warning banner if below threshold (same as student view, scoped to linked child). |

---

## 5. Attendance Marking Workflow

### 5.1 Timetable-Linked Session (Primary Flow)

```
Teacher opens "My Classes Today"
    → Sees list of scheduled sessions (from Timetable module)
    → Clicks "Mark Attendance" on a session
    → Attendance sheet opens with student roster (from batch enrollment)
    → All students pre-marked as PRESENT (default)
    → Teacher taps to toggle exceptions: ABSENT / LATE / EXCUSED
    → Each toggle auto-saves (no submit button — reduces friction)
    → System records: student_id, session_id, status, marked_by, marked_at
    → Session status updates from "attendance_pending" to "attendance_marked"
    → Dashboard widgets update in real-time (or near-real-time via polling)
```

### 5.2 Ad-Hoc Session Flow

```
Admin/Owner creates ad-hoc session
    → Provides: title, date, start_time, end_time
    → Optionally links: batch_id, subject_id, teacher_id
    → If batch is linked: student roster auto-populates from batch enrollment
    → If no batch: admin manually adds students (search + add pattern)
    → Attendance marking follows same toggle flow as timetable-linked
    → Ad-hoc sessions are visually distinguished in reports (different icon/label)
```

### 5.3 Staff Daily Attendance Flow

```
Admin/Owner opens "Staff Attendance" for today
    → Sees list of all active staff members
    → All staff pre-marked as PRESENT (default)
    → Admin toggles exceptions: ABSENT / LATE / ON_LEAVE
    → Auto-saves per toggle
    → Staff attendance is one record per staff member per day (not per session)
```

### 5.4 Correction Flow

```
Within lock period:
    → Original marker or any user with CAP_ATTENDANCE_MARK opens the session's sheet
    → Changes individual student status
    → System saves + creates audit entry (reason optional)

After lock period:
    → Only users with CAP_ATTENDANCE_OVERRIDE see the "Override" action
    → Clicking "Override" opens a modal with: current status, new status dropdown, reason field (mandatory, min 10 chars)
    → On submit: system validates capability + reason → saves → creates audit entry with is_post_lock_override = true
    → Frontend for non-override users shows the record as locked (no edit action)
```

---

## 6. Data Model (Conceptual)

> **Note:** This is the conceptual data model. The actual migration and Eloquent model structure will be defined in the Implementation Plan document. All tables follow project conventions: `tenant_id` scoping, `created_at`/`updated_at` timestamps, soft deletes where specified, VARCHAR for status fields (no MySQL ENUMs).

### 6.1 Core Tables

**`attendance_sessions`** — Represents one attendance-taking event (either linked to timetable or ad-hoc).

| Column | Type | Notes |
|---|---|---|
| `id` | BIGINT UNSIGNED PK | Auto-increment |
| `tenant_id` | BIGINT UNSIGNED FK | Tenant isolation |
| `timetable_session_id` | BIGINT UNSIGNED FK, NULLABLE | NULL for ad-hoc sessions |
| `session_title` | VARCHAR(255) | Auto-populated from timetable or manually entered for ad-hoc |
| `session_date` | DATE | The date of the session |
| `start_time` | TIME | Session start time |
| `end_time` | TIME | Session end time |
| `batch_id` | BIGINT UNSIGNED FK, NULLABLE | The batch (if applicable) |
| `subject_id` | BIGINT UNSIGNED FK, NULLABLE | The subject (if applicable) |
| `teacher_id` | BIGINT UNSIGNED FK, NULLABLE | The assigned teacher |
| `branch_id` | BIGINT UNSIGNED FK, NULLABLE | For multi-branch institutions |
| `session_type` | VARCHAR(30) | `timetable_linked`, `ad_hoc` |
| `marking_status` | VARCHAR(30) | `pending`, `in_progress`, `completed` |
| `marked_by` | BIGINT UNSIGNED FK, NULLABLE | User who marked/completed attendance |
| `marked_at` | TIMESTAMP, NULLABLE | When attendance was marked/completed |
| `locked_at` | TIMESTAMP, NULLABLE | Computed: session end_time + tenant lock_period. After this, only overrides allowed. |
| `is_cancelled` | BOOLEAN | If session was cancelled (attendance records preserved but excluded from calculations) |
| `notes` | TEXT, NULLABLE | Session-level notes |
| `created_at` | TIMESTAMP | |
| `updated_at` | TIMESTAMP | |
| `deleted_at` | TIMESTAMP, NULLABLE | Soft delete |

**Unique constraint:** `(tenant_id, timetable_session_id)` WHERE `timetable_session_id IS NOT NULL` — ensures one attendance sheet per timetable session.

**`attendance_records`** — Individual student attendance for a session.

| Column | Type | Notes |
|---|---|---|
| `id` | BIGINT UNSIGNED PK | Auto-increment |
| `tenant_id` | BIGINT UNSIGNED FK | Tenant isolation |
| `attendance_session_id` | BIGINT UNSIGNED FK | Links to `attendance_sessions` |
| `student_id` | BIGINT UNSIGNED FK | The student |
| `status` | VARCHAR(20) | `present`, `absent`, `late`, `excused` |
| `attendance_mode` | VARCHAR(20), NULLABLE | `in_person`, `online`. Default: `in_person` |
| `late_minutes` | SMALLINT UNSIGNED, NULLABLE | How many minutes late (only when status = `late`) |
| `reason` | VARCHAR(500), NULLABLE | Reason for excused absence or override |
| `marked_by` | BIGINT UNSIGNED FK | User who created/last modified this record |
| `marked_at` | TIMESTAMP | When this record was created/last modified |
| `created_at` | TIMESTAMP | |
| `updated_at` | TIMESTAMP | |

**Unique constraint:** `(tenant_id, attendance_session_id, student_id)` — one record per student per session.

**`attendance_audit_logs`** — Immutable audit trail for every change.

| Column | Type | Notes |
|---|---|---|
| `id` | BIGINT UNSIGNED PK | Auto-increment |
| `tenant_id` | BIGINT UNSIGNED FK | Tenant isolation |
| `attendance_record_id` | BIGINT UNSIGNED FK | The record that was modified |
| `attendance_session_id` | BIGINT UNSIGNED FK | Denormalized for query efficiency |
| `student_id` | BIGINT UNSIGNED FK | Denormalized for query efficiency |
| `actor_id` | BIGINT UNSIGNED FK | Who made the change |
| `action` | VARCHAR(30) | `marked`, `edited`, `override` |
| `old_status` | VARCHAR(20), NULLABLE | NULL on initial mark |
| `new_status` | VARCHAR(20) | |
| `old_mode` | VARCHAR(20), NULLABLE | |
| `new_mode` | VARCHAR(20), NULLABLE | |
| `reason` | VARCHAR(500), NULLABLE | Mandatory for `override` action |
| `is_post_lock_override` | BOOLEAN | TRUE if edit happened after lock period |
| `ip_address` | VARCHAR(45), NULLABLE | Actor's IP at time of action |
| `created_at` | TIMESTAMP | Immutable — no `updated_at` |

**No `updated_at`, no `deleted_at`.** Audit logs are append-only and immutable.

**`staff_attendance`** — Daily staff attendance (separate from student session attendance).

| Column | Type | Notes |
|---|---|---|
| `id` | BIGINT UNSIGNED PK | Auto-increment |
| `tenant_id` | BIGINT UNSIGNED FK | Tenant isolation |
| `staff_user_id` | BIGINT UNSIGNED FK | The staff member |
| `attendance_date` | DATE | The date |
| `status` | VARCHAR(20) | `present`, `absent`, `late`, `on_leave` |
| `check_in_time` | TIME, NULLABLE | Optional: when they arrived |
| `check_out_time` | TIME, NULLABLE | Optional: when they left |
| `marked_by` | BIGINT UNSIGNED FK | Who marked this record |
| `notes` | VARCHAR(500), NULLABLE | |
| `branch_id` | BIGINT UNSIGNED FK, NULLABLE | For multi-branch |
| `created_at` | TIMESTAMP | |
| `updated_at` | TIMESTAMP | |

**Unique constraint:** `(tenant_id, staff_user_id, attendance_date)` — one record per staff member per day.

### 6.2 Configuration Table

**`attendance_settings`** — Per-tenant attendance configuration.

| Column | Type | Notes |
|---|---|---|
| `id` | BIGINT UNSIGNED PK | Auto-increment |
| `tenant_id` | BIGINT UNSIGNED FK, UNIQUE | One row per tenant |
| `lock_period_hours` | SMALLINT UNSIGNED | Default: 48 |
| `threshold_percentage` | TINYINT UNSIGNED | Default: 75 |
| `threshold_period` | VARCHAR(30) | `current_month`, `current_term`, `rolling_30_days`. Default: `current_month` |
| `excused_excludes_denominator` | BOOLEAN | Default: TRUE. If true, excused absences reduce the total session count in % calculation. |
| `default_attendance_mode` | VARCHAR(20) | `in_person` or `online`. Default: `in_person` |
| `created_at` | TIMESTAMP | |
| `updated_at` | TIMESTAMP | |

---

## 7. Capability Requirements (Tenant RBAC)

The following capabilities must be added to the `tenant_capabilities` table and mapped to default roles.

| Capability Code | Display Name | Description | Default Roles |
|---|---|---|---|
| `CAP_ATTENDANCE_MARK` | Mark attendance | Can mark student attendance for assigned sessions | OWNER, ADMIN, TEACHER |
| `CAP_ATTENDANCE_MARK_ANY` | Mark any attendance | Can mark attendance for any session (not just assigned) | OWNER, ADMIN |
| `CAP_ATTENDANCE_OVERRIDE` | Override locked attendance | Can edit attendance records after the lock period | OWNER, ADMIN |
| `CAP_ATTENDANCE_VIEW_ALL` | View all attendance | Can view attendance records for all batches and students | OWNER, ADMIN |
| `CAP_ATTENDANCE_VIEW_OWN` | View own attendance | Can view attendance for own assigned batches/classes | TEACHER |
| `CAP_ATTENDANCE_VIEW_SELF` | View self attendance | Students/parents can view their own/child's attendance | STUDENT, PARENT |
| `CAP_ATTENDANCE_EXPORT` | Export attendance reports | Can export attendance data as PDF/Excel | OWNER, ADMIN |
| `CAP_ATTENDANCE_SETTINGS` | Manage attendance settings | Can configure lock period, threshold, and other settings | OWNER |
| `CAP_STAFF_ATTENDANCE_MARK` | Mark staff attendance | Can mark daily attendance for staff members | OWNER, ADMIN |
| `CAP_STAFF_ATTENDANCE_VIEW` | View staff attendance | Can view staff attendance records | OWNER, ADMIN |
| `CAP_ADHOC_SESSION_CREATE` | Create ad-hoc sessions | Can create attendance sessions not linked to timetable | OWNER, ADMIN, TEACHER |

---

## 8. Service Interfaces (Cross-Module Integration)

The Attendance bounded context exposes read-only query interfaces for other modules to consume. These are Application-layer query services, not domain entities. Other modules MUST NOT directly query attendance tables.

### 8.1 AttendanceQueryService

```
Interface: AttendanceQueryServiceInterface

Methods:

getStudentAttendancePercentage(
    tenantId: int,
    studentId: int,
    periodStart: DateTimeImmutable,
    periodEnd: DateTimeImmutable
): float
    // Returns 0.0–100.0. Respects excused_excludes_denominator setting.

getStudentsBelowThreshold(
    tenantId: int,
    threshold: float,  // e.g., 75.0
    periodStart: DateTimeImmutable,
    periodEnd: DateTimeImmutable,
    batchId: ?int = null  // Optional batch filter
): array<StudentAttendanceSummaryDTO>
    // Returns list of students below threshold with their current %.

getStudentSessionCount(
    tenantId: int,
    studentId: int,
    periodStart: DateTimeImmutable,
    periodEnd: DateTimeImmutable
): SessionCountDTO
    // Returns: total_sessions, attended, absent, late, excused.

getBatchAttendanceSummary(
    tenantId: int,
    batchId: int,
    date: DateTimeImmutable
): BatchAttendanceSummaryDTO
    // Returns: total_students, present, absent, late, excused for one date.

getTeacherComplianceReport(
    tenantId: int,
    periodStart: DateTimeImmutable,
    periodEnd: DateTimeImmutable
): array<TeacherComplianceDTO>
    // Returns: per teacher — total_assigned_sessions, sessions_marked, sessions_pending.
```

### 8.2 StaffAttendanceQueryService

```
Interface: StaffAttendanceQueryServiceInterface

Methods:

getStaffAttendanceForPeriod(
    tenantId: int,
    staffUserId: int,
    periodStart: DateTimeImmutable,
    periodEnd: DateTimeImmutable
): StaffAttendanceSummaryDTO
    // Returns: total_days, present, absent, late, on_leave.

getStaffAttendanceForDate(
    tenantId: int,
    date: DateTimeImmutable,
    branchId: ?int = null
): array<StaffDailyAttendanceDTO>
    // Returns all staff attendance records for a given date.
```

### 8.3 Consuming Modules (Future)

| Module | What It Reads | Purpose |
|---|---|---|
| **Exam Management** | `getStudentAttendancePercentage()` | Enforce minimum attendance requirement for exam eligibility |
| **Fee Management** | `getStudentSessionCount()` | Per-session fee calculation for pay-per-class models |
| **Report Cards** | `getStudentAttendancePercentage()` | Include attendance % on term reports |
| **Payroll** | `getStaffAttendanceForPeriod()` | Calculate leave deductions |
| **Performance Signals** | `getStudentsBelowThreshold()` | Feed into academic risk scoring |
| **Parent Dashboard** | `getStudentAttendancePercentage()`, daily records | Show child's attendance to parents |

---

## 9. Domain Events

All events are past-tense facts, dispatched outside database transactions (per project convention).

| Event | Trigger | Payload | Potential Consumers |
|---|---|---|---|
| `AttendanceSessionCreated` | Attendance sheet opened for a session | `tenant_id`, `session_id`, `session_type`, `teacher_id`, `batch_id` | Dashboard real-time updates |
| `AttendanceMarked` | Individual student attendance status saved | `tenant_id`, `session_id`, `student_id`, `status`, `marked_by` | Dashboard counters, parent notifications (Phase 2) |
| `AttendanceSessionCompleted` | Teacher marks session attendance as complete | `tenant_id`, `session_id`, `marked_by`, `summary` (present/absent/late/excused counts) | Teacher compliance tracking, dashboard |
| `AttendanceOverridden` | Post-lock edit performed | `tenant_id`, `record_id`, `student_id`, `old_status`, `new_status`, `actor_id`, `reason` | Audit alerts, compliance monitoring |
| `StudentBelowThreshold` | Student's rolling attendance % drops below tenant threshold | `tenant_id`, `student_id`, `current_percentage`, `threshold`, `batch_id` | Notification system (Phase 2), dashboard flagging |
| `StaffAttendanceMarked` | Staff daily attendance recorded | `tenant_id`, `staff_user_id`, `status`, `date`, `marked_by` | Dashboard, payroll integration (future) |

---

## 10. API Endpoints (Conceptual)

All endpoints are under the tenant-scoped API prefix with the standard middleware chain: `tenant.resolve.token → auth:tenant_api → tenant.active → ensure.user.active → tenant.session → tenant.capability:{code}`.

### 10.1 Student Attendance

| Method | Endpoint | Capability | Description |
|---|---|---|---|
| `GET` | `/api/tenant/attendance/sessions` | `CAP_ATTENDANCE_MARK` or `CAP_ATTENDANCE_VIEW_ALL` | List attendance sessions (filterable by date, batch, teacher, status) |
| `POST` | `/api/tenant/attendance/sessions` | `CAP_ADHOC_SESSION_CREATE` | Create ad-hoc attendance session |
| `GET` | `/api/tenant/attendance/sessions/{id}` | `CAP_ATTENDANCE_MARK` or `CAP_ATTENDANCE_VIEW_ALL` | Get session detail with student roster and current statuses |
| `POST` | `/api/tenant/attendance/sessions/{id}/mark` | `CAP_ATTENDANCE_MARK` | Bulk mark/update attendance for a session (array of student_id + status) |
| `PATCH` | `/api/tenant/attendance/records/{id}` | `CAP_ATTENDANCE_MARK` or `CAP_ATTENDANCE_OVERRIDE` | Edit individual attendance record (handles lock period logic) |
| `POST` | `/api/tenant/attendance/records/{id}/override` | `CAP_ATTENDANCE_OVERRIDE` | Override locked attendance record (requires reason) |
| `GET` | `/api/tenant/attendance/records/{id}/audit` | `CAP_ATTENDANCE_VIEW_ALL` | Get audit trail for a specific attendance record |
| `GET` | `/api/tenant/attendance/students/{id}/summary` | `CAP_ATTENDANCE_VIEW_ALL` or `CAP_ATTENDANCE_VIEW_SELF` | Get student attendance summary (%, sessions breakdown) |
| `GET` | `/api/tenant/attendance/reports/batch/{id}` | `CAP_ATTENDANCE_VIEW_ALL` or `CAP_ATTENDANCE_VIEW_OWN` | Get batch attendance report (date range, student-wise) |
| `GET` | `/api/tenant/attendance/reports/low-attendance` | `CAP_ATTENDANCE_VIEW_ALL` | Get students below threshold |
| `GET` | `/api/tenant/attendance/reports/teacher-compliance` | `CAP_ATTENDANCE_VIEW_ALL` | Get teacher marking compliance report |
| `GET` | `/api/tenant/attendance/reports/export` | `CAP_ATTENDANCE_EXPORT` | Export attendance report (PDF/Excel, filtered by query params) |

### 10.2 Staff Attendance

| Method | Endpoint | Capability | Description |
|---|---|---|---|
| `GET` | `/api/tenant/attendance/staff` | `CAP_STAFF_ATTENDANCE_VIEW` | List staff attendance for a date (default: today) |
| `POST` | `/api/tenant/attendance/staff/mark` | `CAP_STAFF_ATTENDANCE_MARK` | Bulk mark staff daily attendance |
| `PATCH` | `/api/tenant/attendance/staff/{id}` | `CAP_STAFF_ATTENDANCE_MARK` | Edit individual staff attendance record |
| `GET` | `/api/tenant/attendance/staff/reports` | `CAP_STAFF_ATTENDANCE_VIEW` | Staff attendance report (date range, branch filter) |

### 10.3 Settings

| Method | Endpoint | Capability | Description |
|---|---|---|---|
| `GET` | `/api/tenant/attendance/settings` | `CAP_ATTENDANCE_SETTINGS` | Get current attendance settings |
| `PUT` | `/api/tenant/attendance/settings` | `CAP_ATTENDANCE_SETTINGS` | Update attendance settings |

### 10.4 Student/Parent Self-Service (Read-Only)

| Method | Endpoint | Capability | Description |
|---|---|---|---|
| `GET` | `/api/tenant/my/attendance` | `CAP_ATTENDANCE_VIEW_SELF` | Get own attendance summary |
| `GET` | `/api/tenant/my/attendance/sessions` | `CAP_ATTENDANCE_VIEW_SELF` | Get own session-wise attendance history |
| `GET` | `/api/tenant/my/children/{id}/attendance` | `CAP_ATTENDANCE_VIEW_SELF` (parent) | Get linked child's attendance summary |

---

## 11. Dashboard Widgets

### 11.1 Institution Owner Dashboard (OWNER/ADMIN)

**Widget: Today's Attendance Summary**
- Total students: X | Present: Y | Absent: Z | Late: W
- Percentage bar with color coding (green > 85%, yellow 70–85%, red < 70%)
- Comparison with yesterday and same day last week

**Widget: Low Attendance Alerts**
- Count of students below threshold this period
- Grouped by batch with drill-down
- Click to see full list with student names, current %, sessions missed

**Widget: Teacher Compliance**
- Sessions scheduled today: X | Attendance marked: Y | Pending: Z
- List of pending sessions with teacher name, batch, time
- "Remind" action (Phase 2 — sends notification)

**Widget: Attendance Trend**
- Line chart showing daily attendance % over last 30 days
- Option to filter by batch or branch

### 11.2 Teacher Dashboard

**Widget: My Classes Today**
- List of today's sessions with: time, subject, batch, attendance status (pending/marked)
- "Mark Attendance" action button for pending sessions
- Quick stat: students marked present across all sessions today

### 11.3 Student Dashboard

**Widget: My Attendance**
- Current period attendance %
- Threshold warning if below (red banner)
- Mini calendar heatmap (last 30 days: green = present, red = absent, yellow = late, blue = excused)

### 11.4 Parent Dashboard

**Widget: Child's Attendance Today**
- Session-by-session status for today
- "Pending" status shown if teacher hasn't marked yet
- Current period attendance % with threshold warning

---

## 12. Reporting Requirements

### 12.1 Standard Reports

| Report | Filters | Format | Audience |
|---|---|---|---|
| **Student Attendance Register** | Date range, batch, branch | PDF (printable register format), Excel | OWNER, ADMIN |
| **Student Individual Report** | Student, date range | PDF (with calendar heatmap) | OWNER, ADMIN, TEACHER (own students), STUDENT (self), PARENT (child) |
| **Batch Summary Report** | Batch, date range | PDF, Excel | OWNER, ADMIN, TEACHER (own batches) |
| **Low Attendance Report** | Threshold, period, batch, branch | PDF, Excel | OWNER, ADMIN |
| **Teacher Compliance Report** | Date range, branch | PDF, Excel | OWNER, ADMIN |
| **Staff Attendance Report** | Date range, branch | PDF, Excel | OWNER, ADMIN |
| **Branch Comparison Report** | Date range, branches | PDF, Excel | OWNER |
| **Subject-wise Attendance** | Subject, date range, batch | PDF, Excel | OWNER, ADMIN, TEACHER |

### 12.2 Report Generation Rules

- Reports are generated on-demand, not pre-computed (for Phase 1). If performance becomes an issue with large datasets, introduce nightly aggregation jobs in a future phase.
- PDF reports include: institution name, logo (from tenant branding), report title, date range, generation timestamp, and "Generated by: [user name]" footer.
- Excel reports include: raw data with headers, filter columns preserved, a summary row at the bottom.
- All reports respect tenant isolation. A report can never include data from another tenant.

---

## 13. Module Entitlement Integration

The Attendance module is entitled under the code `module.attendance`. When this module is not entitled for a tenant:

- All attendance API endpoints return `403 Module Not Entitled`
- Dashboard widgets for attendance do not render (frontend checks entitlement)
- Attendance data is preserved (not deleted) if the module is later disabled
- Other modules that consume attendance data via service interfaces receive null/empty responses gracefully (they must handle the "attendance not available" case)

When the Timetable module (`module.timetable`) is not entitled but Attendance is:
- Timetable-linked attendance is unavailable (no sessions to link to)
- Ad-hoc session attendance works normally
- The system gracefully degrades — ad-hoc sessions become the primary attendance flow

---

## 14. Edge Cases & Error Handling

| Scenario | Behavior |
|---|---|
| Teacher marks attendance for a session in the past (yesterday) | Allowed within lock period. Audit-logged with actual timestamp. |
| Teacher marks attendance for a session that hasn't started yet | Rejected. Attendance can only be marked during or after the session's scheduled start time. |
| Student is enrolled in a batch mid-term (late joiner) | Student appears in attendance sheets from their enrollment date forward. Previous sessions show no record (not "absent"). Attendance % calculated from enrollment date only. |
| Student is transferred between batches | Old batch attendance records preserved. New batch attendance starts from transfer date. Reports can show combined or per-batch view. |
| A timetable session is rescheduled | If attendance was already marked, the attendance record retains the original date/time. If not marked, the attendance session updates to the new schedule. |
| A timetable session is cancelled | Attendance session is marked `is_cancelled = true`. Records are preserved but excluded from % calculations. |
| Network failure during auto-save | Frontend retries with exponential backoff (3 attempts). If all fail, unsaved changes are shown with a "Retry" indicator. No data loss — the last successfully saved state is preserved. |
| Two users simultaneously editing the same session's attendance | Last-write-wins at the individual record level (not session level). Since each student is a separate record, two users marking different students don't conflict. If they mark the same student, the later save wins and both are audit-logged. |
| Tenant has no batches configured | Ad-hoc sessions without batch linkage work. Batch-dependent reports show empty state with guidance: "Configure batches to see batch-wise attendance." |

---

## 15. Performance Considerations

| Concern | Approach |
|---|---|
| Large batch (200+ students) attendance sheet | Paginate the roster if needed, but prefer single-page load with virtual scrolling on frontend. Backend returns full roster in one query (indexed by `attendance_session_id`). |
| Dashboard widget queries on large tenants | Use indexed queries. Key indexes: `(tenant_id, session_date)` on `attendance_sessions`, `(tenant_id, attendance_session_id, student_id)` on `attendance_records`. Consider materialized daily aggregates if query time exceeds 500ms. |
| Attendance % calculation across many sessions | For Phase 1, calculate on-the-fly with indexed COUNT queries. If a tenant has > 10,000 sessions, introduce a nightly `attendance_summaries` rollup table. |
| Report export for large datasets | Generate exports asynchronously via queue job. Return a download link when ready. Frontend shows "Generating..." state. |

---

## 16. Security Requirements

| Requirement | Implementation |
|---|---|
| Tenant isolation | All queries scoped by `tenant_id` via `BelongsToTenant` trait. No cross-tenant attendance data leakage. |
| Capability enforcement | Backend UseCase layer checks capabilities before any write/read operation. Frontend hides UI elements but backend is the authority. |
| Teacher scope enforcement | A teacher with `CAP_ATTENDANCE_MARK` can only mark sessions where `teacher_id` matches their user ID, UNLESS they also have `CAP_ATTENDANCE_MARK_ANY`. |
| Audit immutability | `attendance_audit_logs` table has no UPDATE or DELETE operations in the application code. Enforced at UseCase level (no delete UseCase exists). |
| Override accountability | Post-lock overrides require: valid `CAP_ATTENDANCE_OVERRIDE` capability + mandatory reason field (min 10 chars) + full audit log entry with `is_post_lock_override = true`. |
| Enumeration prevention | Student/session existence checks do not leak information. 404 responses are generic: "Record not found" — not "Student 123 does not exist in this tenant." |
| Rate limiting | Attendance marking endpoints are rate-limited to prevent bulk automated manipulation. Configurable per-tenant (default: 100 requests/minute per user). |

---

## 17. Timetable Module Dependency

The Attendance module has a **soft dependency** on the Timetable module:

- **If Timetable exists:** Attendance sessions can be linked to timetable sessions, inheriting batch/subject/teacher/schedule data automatically. This is the recommended primary flow.
- **If Timetable does not exist:** Attendance operates entirely on ad-hoc sessions. The institution manually creates each session they want to track. This works but requires more manual input.

The Attendance module MUST NOT import Timetable domain entities. It references `timetable_session_id` as a foreign key and uses a `TimetableQueryServiceInterface` (provided by the Timetable module) to fetch session metadata. If the Timetable module is not installed, the query service returns null, and the Attendance module gracefully falls back to ad-hoc mode.

---

## 18. Non-Functional Requirements

| Requirement | Target |
|---|---|
| Attendance marking response time | < 200ms per individual toggle save |
| Attendance sheet load time (200 students) | < 1 second |
| Dashboard widget refresh | < 2 seconds for full dashboard load |
| Data retention | Attendance records retained for the tenant's subscription lifetime. No auto-purge. |
| Availability | Attendance marking must work even if reporting/analytics services are temporarily degraded. Core marking is independent of analytics. |
| Mobile responsiveness | Attendance marking UI must be fully functional on mobile browsers (teachers mark from phones). |

---

## 19. What This Document Does NOT Cover

This feature document defines WHAT the system does and WHY. It does NOT define:

- **HOW it is implemented** — that belongs in the Developer Instructions document (next step in the phase-gate process)
- **Database migration SQL** — defined in the Implementation Plan
- **Eloquent model structure** — defined in the Implementation Plan
- **Controller/UseCase code** — defined in the Implementation Plan
- **Frontend component hierarchy** — defined in the Frontend Implementation Plan
- **Test cases** — defined in the Test Strategy document

---

## 20. Open Questions for Architecture Review

| # | Question | Impact |
|---|---|---|
| 1 | Should the Attendance bounded context be a top-level context (`Domain/Attendance/`) or nested under a parent context (`Domain/AcademicOperations/Attendance/`)? | Directory structure and import paths |
| 2 | The Timetable module does not exist yet. Should Attendance Phase 1 be implemented with ad-hoc sessions only, or should Timetable be a prerequisite? | Phase sequencing and dependency management |
| 3 | For multi-branch institutions, should branch-level attendance aggregation be real-time or use cached daily rollups? | Performance architecture for large tenants |
| 4 | Should the auto-save (per-toggle) pattern use individual API calls per student or batch the changes with a debounced bulk save (e.g., every 2 seconds)? | API load and frontend complexity |
| 5 | Should attendance records for cancelled sessions be `soft_deleted` or kept with `is_cancelled` flag? Current design uses the flag. | Data model and query patterns |
| 6 | The `StudentBelowThreshold` event could fire frequently (every attendance mark). Should it only fire on threshold-crossing transitions (student drops FROM above TO below threshold)? | Event volume and notification frequency |

---

## Document History

| Version | Date | Author | Changes |
|---|---|---|---|
| 1.0 | March 16, 2026 | Product & Architecture Team | Initial draft |

---

*This document follows the UBOTZ phase-gate methodology. The next step is Principal Engineer architecture review, followed by Developer Instructions document, then Implementation Plan.*