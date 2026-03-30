# UBOTZ 2.0 — Batch Management Developer Instructions

## Academic Delivery Unit — Phase 1 (Fixed Cohort)

| Field | Value |
|---|---|
| **Document Type** | Developer Instruction (Pre-Implementation Brief) |
| **Date** | March 18, 2026 |
| **Issued By** | Principal Engineer / Architecture Auditor |
| **Audience** | Implementation Developer (Antigravity) |
| **Expected Deliverable** | Implementation Plan (same format as 10A–14 plans) |
| **Prerequisites** | Department CRUD COMPLETE (backend + frontend), Course CRUD COMPLETE (Phase 9), Timetable System COMPLETE, Attendance System COMPLETE, RBAC Phase 10A–10E COMPLETE |

> **Batch is load-bearing infrastructure. Five existing modules already reference `batch_id` as a phantom integer with no backing table. This feature does not add a new concept — it formalizes one that the platform already assumes exists. Every day without this table is a day where Timetable, Attendance, and Communication Hub reference a ghost.**

---

## 1. Mission Statement

This feature builds the **Batch** entity — the fundamental academic delivery unit in UBOTZ. A Batch is an independent organizational container that groups students for scheduled instruction. It sits in the hierarchy: **Department → Batch → Courses**.

A Batch is NOT:
- A User Group (ad-hoc labeling for communications — `user_groups` is a separate entity and remains untouched)
- A Course (Batch groups students; Course delivers content — a Batch can be associated with multiple Courses)
- An Enrollment (Enrollment is the access contract between User and Course; Batch membership triggers enrollment, not the other way around)

Phase 1 scope is **Fixed Cohort** batches only — date-bound groups with explicit start and end dates. Evergreen and Hybrid batch types are deferred to a later phase.

**What this phase includes:**
- `batches` table with full DDD vertical (Entity, Value Objects, Repository, UseCases)
- `batch_courses` pivot table linking batches to courses (many-to-many)
- `batch_students` membership table with capacity enforcement
- `batch_faculty` assignment table with course-level granularity (Teacher X teaches Physics to Batch A)
- Batch transfer workflow (student moves between batches of the same course, progress preserved)
- FK wiring: fix phantom `batch_id` references in Timetable (`schedule_templates`, `session_instances`) and Attendance (`attendance_sessions`)
- Fix broken validation rule (`exists:batches,id` in `CreateAdHocSessionRequest`) that currently references a non-existent table
- Batch CRUD API (create, list, show, update, change status, archive)
- Student management API (add/remove members, bulk add, transfer)
- Faculty assignment API (assign/unassign teacher-course pairs)
- Batch-scoped queries for Timetable and Attendance

**What this phase does NOT include:**
- Evergreen batch type (rolling enrollment, no fixed dates)
- Hybrid batch type (self-paced content + batched live sessions)
- Auto-enrollment in courses when student joins batch (Phase 1 creates the `batch_courses` association but auto-enrollment logic is a separate sub-phase due to Enrollment module dependency)
- Drip scheduling / content pacing per batch
- Batch-level fee structures or revenue reporting
- Communication Hub batch targeting (Communication Hub already has targeting infrastructure — wiring batch as a target type is a separate integration task)
- Student panel / teacher panel batch views (requires Panel frontend, not yet built)
- Batch cloning / template batches
- Waitlist when batch capacity is reached

---

## 2. Business Context

### 2.1 Current State

The platform references `batch_id` in five places with no backing entity:

| Module | Where | How | Problem |
|---|---|---|---|
| **Timetable** | `schedule_templates.batch_id` (required) | Plain integer, no FK | Accepts any integer — no validation that the batch exists |
| **Timetable** | `session_instances.batch_id` (nullable) | Plain integer, no FK | Same — phantom reference |
| **Timetable** | `GET .../templates?batch_id=` filter | Query parameter | Filters against a non-existent entity |
| **Attendance** | `attendance_sessions.batch_id` (nullable) | Plain integer, no FK | Phantom reference |
| **Attendance** | `CreateAdHocSessionRequest` | `exists:batches,id` validation | **Will fail at runtime** — the `batches` table does not exist |

Meanwhile, `user_groups` exists as a separate entity with its own CRUD (`UserGroupController`, routes at `/api/tenant/user-groups`). User Groups serve an ad-hoc administrative grouping purpose (e.g., "Sports Committee", "Parent Council") and have no academic semantics. They remain unchanged by this feature.

### 2.2 What Changes After This Phase

1. A `batches` table exists as a first-class tenant-scoped entity with DDD layers.
2. Batches belong to exactly one Department (mandatory FK to `departments.id`).
3. Batches can be associated with multiple Courses via `batch_courses` pivot.
4. Students are enrolled in batches via `batch_students` membership table with capacity enforcement.
5. Teachers are assigned to batches at the course level via `batch_faculty` table (Prof. X teaches Physics to Batch A, Prof. Y teaches Chemistry to Batch A).
6. Timetable and Attendance phantom `batch_id` references are converted to proper FKs.
7. The broken `exists:batches,id` validation in Attendance now works.
8. Batch provides the scoping entity for downstream features: "show me the timetable for Batch A", "mark attendance for Batch A".

### 2.3 Organizational Hierarchy

```
Department (e.g., "Engineering", "Medical", "Commerce")
  └── Batch (e.g., "JEE 2026 Morning", "NEET Evening Cohort")
        ├── Students (members with capacity limit)
        ├── Faculty (teacher + course assignments)
        └── Courses (linked via pivot: Physics, Chemistry, Maths)
              ├── Timetable sessions (scoped by batch)
              └── Attendance records (scoped by batch)
```

### 2.4 Stakeholder Perspectives

**Institution Owner** thinks: "I run 3 departments. Each department has 2–5 batches. Each batch has 30–60 students, 3–5 teachers, and takes 4–6 courses. I want to see batch-level attendance trends and student counts on my dashboard."

**Manager/Admin** thinks: "I create batches, assign students and teachers, build timetables per batch, and send notices to specific batches. At end of term, I mark the batch as Completed. When a parent calls to shift their child from Morning to Evening batch, I do a transfer."

**Teacher** thinks: "I teach Physics to both JEE Morning and JEE Evening batches. When I mark attendance, I pick the batch first and see only those students. When I create an assignment, I assign it to a specific batch."

---

## 3. Business Rules (NON-NEGOTIABLE)

### 3.1 Batch Lifecycle Rules

| Rule ID | Rule | Enforcement |
|---|---|---|
| BR-01 | Every Batch belongs to exactly one Department. Department is mandatory at creation — no null `department_id`. | NOT NULL FK constraint + application validation |
| BR-02 | Batch status lifecycle: `draft → active → completed → archived`. Only forward transitions allowed. No reactivation of completed/archived batches. | Status transition validation in `BatchEntity` domain logic |
| BR-03 | A `draft` batch cannot have students or timetable sessions scheduled against it. Students and scheduling are only allowed for `active` batches. | UseCase-level guard: reject student add / timetable link if batch status ≠ `active` |
| BR-04 | A `completed` batch is read-only. No new students, no new sessions, no faculty changes. Historical data (attendance, grades) remains visible. | UseCase-level guard on all mutation operations |
| BR-05 | An `archived` batch is soft-deleted. It disappears from all list views but remains in the database for audit and historical queries. | `archived_at` timestamp, default list queries exclude archived |
| BR-06 | Batch `code` must be unique per tenant. Example: `jee-2026-morning`. Machine-readable identifier used in URLs and API filters. | Unique constraint: `(tenant_id, code)` |
| BR-07 | Batch `start_date` and `end_date` are mandatory for Fixed Cohort type. `start_date` must be before `end_date`. | Domain entity validation |
| BR-08 | A batch cannot be deleted if it has any associated students, timetable sessions, or attendance records. It can only be archived. | UseCase checks: reject delete if related records exist, suggest archive instead |

### 3.2 Capacity & Student Membership Rules

| Rule ID | Rule | Enforcement |
|---|---|---|
| BR-09 | Every batch has a `max_capacity` (positive integer, required). | NOT NULL column, application validation |
| BR-10 | Adding a student to a batch is rejected if current member count ≥ `max_capacity`. Enforcement is at the application layer with a count query inside the transaction. | `AddStudentToBatchUseCase` checks count before insert, within a DB transaction |
| BR-11 | A student can belong to multiple batches simultaneously (e.g., "JEE Morning" for Physics and "JEE Special" for Advanced Problem Solving). No uniqueness constraint on `(student_id)` alone — only on `(batch_id, student_id)`. | Unique constraint on pivot: `(batch_id, user_id)` |
| BR-12 | Only users with the `student` role can be added to a batch as students. The UseCase must verify the user's role before adding. | Role check in `AddStudentToBatchUseCase` |
| BR-13 | Removing a student from a batch does NOT delete their attendance or timetable records. Membership removal is a soft operation — `removed_at` timestamp on `batch_students`. | Soft removal with timestamp, not hard delete |
| BR-14 | Batch student membership changes are audit-logged: who added/removed whom, when, and why (optional reason field). | Audit log entry via standard `tenant_audit_logs` |

### 3.3 Batch Transfer Rules

| Rule ID | Rule | Enforcement |
|---|---|---|
| BR-15 | Transfer is only allowed between batches that share at least one common course (via `batch_courses` pivot). The student must be enrolled in the course in the source batch. | `TransferStudentUseCase` validates course overlap |
| BR-16 | Transfer creates an audit trail: source batch, target batch, transferred student, initiating admin, timestamp, and optional reason. | Audit log + `BatchStudentTransferred` domain event |
| BR-17 | Transfer is atomic: remove from source + add to target happens in a single database transaction. If target batch is at capacity, the entire transfer fails. | Single DB transaction wrapping both operations |
| BR-18 | Transfer does NOT move course progress automatically in Phase 1. Progress preservation is documented as a Phase 2 requirement (depends on Enrollment module). | Explicitly out of scope — document in non-goals |

### 3.4 Faculty Assignment Rules

| Rule ID | Rule | Enforcement |
|---|---|---|
| BR-19 | Faculty assignment is at the `(batch, course)` level. A teacher is assigned to teach a specific course within a specific batch. | `batch_faculty` table: `(batch_id, user_id, course_id)` — unique constraint on all three |
| BR-20 | Only users with the `teacher` role can be assigned as faculty. | Role check in `AssignFacultyUseCase` |
| BR-21 | A course linked to a batch via `batch_courses` can have zero or more faculty assigned. Zero faculty means "unassigned" — this is a valid state (admin may assign later). | No NOT NULL constraint on faculty for a batch-course pair |
| BR-22 | Removing a faculty assignment does not affect existing timetable sessions created for that teacher-batch-course combination. Sessions are historical records. | No cascade delete from `batch_faculty` to timetable |
| BR-23 | Faculty assignment changes are audit-logged. | Standard audit log entry |

### 3.5 Batch-Course Association Rules

| Rule ID | Rule | Enforcement |
|---|---|---|
| BR-24 | A batch can be associated with multiple courses. A course can be associated with multiple batches. This is a many-to-many relationship via `batch_courses`. | Pivot table with unique constraint on `(batch_id, course_id)` |
| BR-25 | Only `published` courses can be linked to a batch. Draft or archived courses are rejected. | UseCase validates course status before creating the association |
| BR-26 | Removing a course from a batch is blocked if there are existing timetable sessions or attendance records for that batch-course combination. | UseCase checks for dependent records before allowing removal |
| BR-27 | Batch-course associations can only be modified when the batch is in `draft` or `active` status. | Status guard in UseCase |

### 3.6 Downstream Integration Rules

| Rule ID | Rule | Enforcement |
|---|---|---|
| BR-28 | Timetable `schedule_templates.batch_id` must reference a valid, active batch. The FK migration must add a foreign key constraint to `batches.id`. | Migration: add FK with `ON DELETE RESTRICT` (prevent batch deletion if templates exist) |
| BR-29 | Timetable `session_instances.batch_id` must reference a valid batch (active or completed — completed batches retain their session history). | FK constraint, no status restriction on session_instances (historical data) |
| BR-30 | Attendance `attendance_sessions.batch_id` must reference a valid batch. | FK constraint with `ON DELETE RESTRICT` |
| BR-31 | The broken `exists:batches,id` validation rule in `CreateAdHocSessionRequest` (Attendance module) will now work correctly because the `batches` table exists. No code change needed — only the migration. | Verified by integration test |

---

## 4. Domain Model

### 4.1 Bounded Context Placement

This feature creates a new **Batch** bounded context under `TenantAdminDashboard`.

| Component | Location | Rationale |
|---|---|---|
| `BatchEntity` | `Domain/TenantAdminDashboard/Batch/Entities/` | Core aggregate — business state + invariant enforcement |
| `BatchStatus` | `Domain/TenantAdminDashboard/Batch/ValueObjects/` | Enum: `draft`, `active`, `completed`, `archived` with transition rules |
| `BatchCode` | `Domain/TenantAdminDashboard/Batch/ValueObjects/` | Self-validating value object for batch code (kebab-case, unique per tenant) |
| `BatchType` | `Domain/TenantAdminDashboard/Batch/ValueObjects/` | Enum: `fixed_cohort` (only value in Phase 1, extensible for `evergreen`, `hybrid`) |
| `BatchRepositoryInterface` | `Domain/TenantAdminDashboard/Batch/Repositories/` | Contract for persistence |
| Domain Events | `Domain/TenantAdminDashboard/Batch/Events/` | `BatchCreated`, `BatchStatusChanged`, `BatchStudentAdded`, `BatchStudentRemoved`, `BatchStudentTransferred`, `BatchFacultyAssigned`, `BatchFacultyUnassigned`, `BatchCourseLinked`, `BatchCourseUnlinked` |
| Domain Exceptions | `Domain/TenantAdminDashboard/Batch/Exceptions/` | `BatchCapacityExceededException`, `InvalidBatchStatusTransitionException`, `BatchNotActiveException`, `DuplicateBatchCodeException`, `BatchHasDependentsException` |

### 4.2 Entity: BatchEntity

```
BatchEntity
├── id: int
├── tenantId: int
├── departmentId: int
├── code: BatchCode (e.g., "jee-2026-morning")
├── name: string (e.g., "JEE 2026 Morning Batch")
├── description: string|null
├── type: BatchType (fixed_cohort in Phase 1)
├── status: BatchStatus (draft → active → completed → archived)
├── maxCapacity: int (positive integer, required)
├── startDate: DateTimeImmutable (required for fixed_cohort)
├── endDate: DateTimeImmutable (required for fixed_cohort)
├── createdBy: int (user_id of the admin who created the batch)
├── archivedAt: DateTimeImmutable|null
├── createdAt: DateTimeImmutable
├── updatedAt: DateTimeImmutable
│
├── Methods:
│   ├── changeStatus(BatchStatus $new): void — enforces transition rules
│   ├── canAcceptStudents(): bool — status === active && currentCount < maxCapacity
│   ├── isActive(): bool
│   ├── isReadOnly(): bool — completed or archived
│   └── archive(): void — sets archivedAt, transitions to archived
│
└── Invariants:
    ├── startDate < endDate
    ├── maxCapacity > 0
    ├── status transitions are one-directional
    └── code format validated by BatchCode VO
```

### 4.3 Value Objects

**`BatchStatus`** (PHP Enum)
```
Values: draft, active, completed, archived
Methods:
  canTransitionTo(BatchStatus $target): bool
    draft → active: YES
    active → completed: YES
    completed → archived: YES
    draft → archived: YES (skip completed for batches that never went live)
    Everything else: NO (no backward transitions)
```

**`BatchCode`** (Value Object)
```
Format: kebab-case, 3–80 characters, alphanumeric + hyphens only
Validation: regex ^[a-z0-9][a-z0-9-]*[a-z0-9]$ (no leading/trailing hyphens)
Uniqueness: enforced at database level (tenant_id, code), checked in UseCase
```

**`BatchType`** (PHP Enum)
```
Values: fixed_cohort (Phase 1 only)
Future: evergreen, hybrid
```

### 4.4 Domain Events

All events are dispatched **after transaction commit**, never inside the transaction.

| Event | Payload | Triggered By |
|---|---|---|
| `BatchCreated` | batch_id, tenant_id, department_id, code, type | `CreateBatchUseCase` |
| `BatchStatusChanged` | batch_id, tenant_id, old_status, new_status | `ChangeBatchStatusUseCase` |
| `BatchStudentAdded` | batch_id, tenant_id, user_id, added_by | `AddStudentToBatchUseCase` |
| `BatchStudentRemoved` | batch_id, tenant_id, user_id, removed_by, reason | `RemoveStudentFromBatchUseCase` |
| `BatchStudentTransferred` | source_batch_id, target_batch_id, tenant_id, user_id, transferred_by, reason | `TransferStudentUseCase` |
| `BatchFacultyAssigned` | batch_id, tenant_id, user_id, course_id, assigned_by | `AssignFacultyUseCase` |
| `BatchFacultyUnassigned` | batch_id, tenant_id, user_id, course_id, unassigned_by | `UnassignFacultyUseCase` |
| `BatchCourseLinked` | batch_id, tenant_id, course_id, linked_by | `LinkCourseToBatchUseCase` |
| `BatchCourseUnlinked` | batch_id, tenant_id, course_id, unlinked_by | `UnlinkCourseFromBatchUseCase` |

---

## 5. Database Schema

### 5.1 New Tables

**Table: `batches`** (tenant-scoped)

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | BIGINT UNSIGNED PK | NO | auto-increment | |
| `tenant_id` | BIGINT UNSIGNED FK → `tenants(id)` | NO | — | Tenant isolation. ON DELETE CASCADE |
| `department_id` | BIGINT UNSIGNED FK → `departments(id)` | NO | — | Mandatory parent. ON DELETE RESTRICT |
| `code` | VARCHAR(80) | NO | — | Machine-readable identifier. UNIQUE per tenant |
| `name` | VARCHAR(255) | NO | — | Human-readable display name |
| `description` | TEXT | YES | NULL | Optional description |
| `type` | VARCHAR(30) | NO | `fixed_cohort` | `fixed_cohort` only in Phase 1. NOT ENUM — VARCHAR |
| `status` | VARCHAR(30) | NO | `draft` | `draft`, `active`, `completed`, `archived`. NOT ENUM |
| `max_capacity` | INT UNSIGNED | NO | — | Must be > 0 |
| `start_date` | DATE | NO | — | Batch start. Required for fixed_cohort |
| `end_date` | DATE | NO | — | Batch end. Must be > start_date |
| `created_by` | BIGINT UNSIGNED FK → `users(id)` | NO | — | Admin who created. ON DELETE RESTRICT |
| `archived_at` | TIMESTAMP | YES | NULL | Set when status → archived |
| `created_at` | TIMESTAMP | NO | CURRENT_TIMESTAMP | |
| `updated_at` | TIMESTAMP | NO | CURRENT_TIMESTAMP | |

**Indexes:**
- `unq_batches_tenant_code` — UNIQUE(`tenant_id`, `code`)
- `idx_batches_tenant_status` — (`tenant_id`, `status`)
- `idx_batches_tenant_department` — (`tenant_id`, `department_id`)
- `idx_batches_tenant_dates` — (`tenant_id`, `start_date`, `end_date`)

---

**Table: `batch_courses`** (pivot — tenant-scoped)

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | BIGINT UNSIGNED PK | NO | auto-increment | |
| `tenant_id` | BIGINT UNSIGNED FK → `tenants(id)` | NO | — | Tenant isolation. ON DELETE CASCADE |
| `batch_id` | BIGINT UNSIGNED FK → `batches(id)` | NO | — | ON DELETE CASCADE |
| `course_id` | BIGINT UNSIGNED FK → `courses(id)` | NO | — | ON DELETE RESTRICT (don't orphan batch-course links) |
| `linked_by` | BIGINT UNSIGNED FK → `users(id)` | NO | — | Admin who linked. ON DELETE RESTRICT |
| `created_at` | TIMESTAMP | NO | CURRENT_TIMESTAMP | |

**Indexes:**
- `unq_batch_courses_batch_course` — UNIQUE(`batch_id`, `course_id`)
- `idx_batch_courses_tenant` — (`tenant_id`)
- `idx_batch_courses_course` — (`course_id`)

---

**Table: `batch_students`** (membership — tenant-scoped)

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | BIGINT UNSIGNED PK | NO | auto-increment | |
| `tenant_id` | BIGINT UNSIGNED FK → `tenants(id)` | NO | — | Tenant isolation. ON DELETE CASCADE |
| `batch_id` | BIGINT UNSIGNED FK → `batches(id)` | NO | — | ON DELETE CASCADE |
| `user_id` | BIGINT UNSIGNED FK → `users(id)` | NO | — | Must have `student` role. ON DELETE CASCADE |
| `added_by` | BIGINT UNSIGNED FK → `users(id)` | NO | — | Admin who added. ON DELETE RESTRICT |
| `removed_at` | TIMESTAMP | YES | NULL | Soft removal — not hard delete |
| `removed_by` | BIGINT UNSIGNED FK → `users(id)` | YES | NULL | Admin who removed |
| `removal_reason` | VARCHAR(500) | YES | NULL | Optional reason for removal |
| `created_at` | TIMESTAMP | NO | CURRENT_TIMESTAMP | Membership start |

**Indexes:**
- `unq_batch_students_active` — UNIQUE(`batch_id`, `user_id`) WHERE `removed_at IS NULL` (partial unique — if MySQL doesn't support partial unique, enforce at application layer and use a composite unique on `batch_id, user_id, removed_at` with a sentinel value or use a separate approach)
- `idx_batch_students_tenant` — (`tenant_id`)
- `idx_batch_students_user` — (`user_id`)
- `idx_batch_students_batch_active` — (`batch_id`, `removed_at`) for "active members of batch" queries

**Note on unique constraint:** MySQL does not support partial unique indexes. The uniqueness of active membership (one active row per batch+student) must be enforced at the **application layer** in the `AddStudentToBatchUseCase` — query for existing active membership (where `removed_at IS NULL`) before insert, inside the same transaction.

---

**Table: `batch_faculty`** (assignment — tenant-scoped)

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | BIGINT UNSIGNED PK | NO | auto-increment | |
| `tenant_id` | BIGINT UNSIGNED FK → `tenants(id)` | NO | — | Tenant isolation. ON DELETE CASCADE |
| `batch_id` | BIGINT UNSIGNED FK → `batches(id)` | NO | — | ON DELETE CASCADE |
| `user_id` | BIGINT UNSIGNED FK → `users(id)` | NO | — | Must have `teacher` role. ON DELETE CASCADE |
| `course_id` | BIGINT UNSIGNED FK → `courses(id)` | NO | — | The course this teacher teaches in this batch. ON DELETE RESTRICT |
| `assigned_by` | BIGINT UNSIGNED FK → `users(id)` | NO | — | Admin who assigned. ON DELETE RESTRICT |
| `created_at` | TIMESTAMP | NO | CURRENT_TIMESTAMP | |

**Indexes:**
- `unq_batch_faculty_assignment` — UNIQUE(`batch_id`, `user_id`, `course_id`)
- `idx_batch_faculty_tenant` — (`tenant_id`)
- `idx_batch_faculty_user` — (`user_id`) — for "my batches" teacher query
- `idx_batch_faculty_course` — (`course_id`)

---

### 5.2 Migration Modifications (Fix Phantom References)

These are ALTER TABLE migrations that convert existing phantom `batch_id` columns into proper foreign keys.

**Migration: Add FK to `schedule_templates.batch_id`**

```
ALTER TABLE schedule_templates
ADD CONSTRAINT fk_schedule_templates_batch
FOREIGN KEY (batch_id) REFERENCES batches(id)
ON DELETE RESTRICT;
```

**Important:** `schedule_templates.batch_id` is currently NOT NULL (required). This migration will FAIL if any existing rows have `batch_id` values that don't exist in the `batches` table. The migration must handle this:
1. Check for orphaned `batch_id` values in `schedule_templates` that don't exist in `batches`.
2. If orphans exist, log them and either: (a) delete them if they are test/seed data, or (b) create placeholder batch records. **The developer must verify production data before running this migration.**

**Migration: Add FK to `session_instances.batch_id`**

```
ALTER TABLE session_instances
ADD CONSTRAINT fk_session_instances_batch
FOREIGN KEY (batch_id) REFERENCES batches(id)
ON DELETE RESTRICT;
```

`session_instances.batch_id` is nullable, so NULL values are safe. Only non-null values need FK validation.

**Migration: Add FK to `attendance_sessions.batch_id`**

```
ALTER TABLE attendance_sessions
ADD CONSTRAINT fk_attendance_sessions_batch
FOREIGN KEY (batch_id) REFERENCES batches(id)
ON DELETE RESTRICT;
```

Same nullable handling as `session_instances`.

---

## 6. API Design

### 6.1 Batch CRUD

| Method | Endpoint | Purpose | Capability Required |
|---|---|---|---|
| POST | `/api/v1/tenant/batches` | Create batch | `batch.create` |
| GET | `/api/v1/tenant/batches` | List batches (filterable, paginated) | `batch.view` |
| GET | `/api/v1/tenant/batches/{id}` | Get batch detail (with student count, course count, faculty count) | `batch.view` |
| PUT | `/api/v1/tenant/batches/{id}` | Update batch metadata (name, description, dates, capacity) | `batch.update` |
| PATCH | `/api/v1/tenant/batches/{id}/status` | Change batch status | `batch.update` |
| DELETE | `/api/v1/tenant/batches/{id}` | Archive batch (soft — sets `archived_at`, status → `archived`) | `batch.delete` |

**List Query Parameters:**

| Parameter | Type | Example |
|---|---|---|
| `filter[status]` | string | `active`, `draft`, `completed` |
| `filter[department_id]` | integer | `5` |
| `filter[type]` | string | `fixed_cohort` |
| `search` | string | `jee morning` (searches name and code) |
| `sort` | string | `-created_at`, `name`, `start_date` |
| `page` | integer | `1` |
| `per_page` | integer | `20` (max 50) |

### 6.2 Batch-Course Association

| Method | Endpoint | Purpose | Capability Required |
|---|---|---|---|
| POST | `/api/v1/tenant/batches/{batchId}/courses` | Link course to batch | `batch.update` |
| DELETE | `/api/v1/tenant/batches/{batchId}/courses/{courseId}` | Unlink course from batch | `batch.update` |
| GET | `/api/v1/tenant/batches/{batchId}/courses` | List courses linked to batch | `batch.view` |

### 6.3 Student Membership

| Method | Endpoint | Purpose | Capability Required |
|---|---|---|---|
| POST | `/api/v1/tenant/batches/{batchId}/students` | Add student to batch | `batch.manage_students` |
| POST | `/api/v1/tenant/batches/{batchId}/students/bulk` | Bulk add students (array of user_ids) | `batch.manage_students` |
| DELETE | `/api/v1/tenant/batches/{batchId}/students/{userId}` | Remove student from batch | `batch.manage_students` |
| GET | `/api/v1/tenant/batches/{batchId}/students` | List active students in batch | `batch.view` |
| POST | `/api/v1/tenant/batches/{batchId}/students/{userId}/transfer` | Transfer student to another batch | `batch.manage_students` |

**Transfer request body:**
```json
{
  "target_batch_id": 42,
  "reason": "Parent requested shift from morning to evening"
}
```

### 6.4 Faculty Assignment

| Method | Endpoint | Purpose | Capability Required |
|---|---|---|---|
| POST | `/api/v1/tenant/batches/{batchId}/faculty` | Assign teacher to batch-course | `batch.manage_faculty` |
| DELETE | `/api/v1/tenant/batches/{batchId}/faculty/{facultyAssignmentId}` | Unassign teacher | `batch.manage_faculty` |
| GET | `/api/v1/tenant/batches/{batchId}/faculty` | List faculty assignments for batch | `batch.view` |

**Assign request body:**
```json
{
  "user_id": 15,
  "course_id": 7
}
```

### 6.5 Route Middleware Stack

All batch endpoints must pass through (in order):
1. `auth:tenant-api` — JWT authentication for tenant users
2. `resolve.tenant.from.token` — Extract tenant context from JWT
3. `ensure.tenant.active` — Reject requests for suspended/archived tenants
4. `ensure.user.active` — Reject requests from inactive users
5. Capability check — per-endpoint as listed above

---

## 7. Capability Registry (New Capabilities)

These capabilities must be seeded into `tenant_capabilities` and mapped to default role-capability assignments:

| Capability Code | Display Name | Module | Default Roles |
|---|---|---|---|
| `batch.view` | View Batches | `batch` | OWNER, ADMIN, TEACHER |
| `batch.create` | Create Batches | `batch` | OWNER, ADMIN |
| `batch.update` | Update Batches | `batch` | OWNER, ADMIN |
| `batch.delete` | Archive Batches | `batch` | OWNER, ADMIN |
| `batch.manage_students` | Manage Batch Students | `batch` | OWNER, ADMIN |
| `batch.manage_faculty` | Manage Batch Faculty | `batch` | OWNER, ADMIN |

**Note:** TEACHER gets `batch.view` only — they can see their assigned batches and student lists, but cannot create, modify, or manage membership. This follows the principle of least privilege.

---

## 8. Application Layer — UseCases

Each UseCase follows the Phase 6 DDD template: idempotency check → validation → entity operation → transaction → audit log → domain event dispatch (after commit).

### 8.1 Batch CRUD UseCases

| UseCase | Input | Output | Key Logic |
|---|---|---|---|
| `CreateBatchUseCase` | CreateBatchCommand (tenant_id, department_id, code, name, description, type, max_capacity, start_date, end_date) | BatchEntity | Validate department exists in tenant. Check code uniqueness. Create entity. Persist. Audit log. Dispatch `BatchCreated`. |
| `UpdateBatchUseCase` | UpdateBatchCommand (batch_id, name?, description?, max_capacity?, start_date?, end_date?) | BatchEntity | Load batch. Verify tenant ownership (403 vs 404 — return consistent response per security rules). Reject if status is `completed` or `archived`. Update fields. Persist. Audit log. |
| `ChangeBatchStatusUseCase` | ChangeBatchStatusCommand (batch_id, new_status) | BatchEntity | Load batch. Validate transition via `BatchStatus.canTransitionTo()`. If transitioning to `archived`, set `archived_at`. Persist. Audit log. Dispatch `BatchStatusChanged`. |
| `ListBatchesQuery` | ListBatchesFilter (tenant_id, status?, department_id?, search?, sort, page, per_page) | Paginated list | Exclude archived by default (unless `filter[status]=archived` explicitly requested). Include counts: student_count, course_count, faculty_count as aggregates. |
| `GetBatchDetailQuery` | batch_id, tenant_id | BatchEntity + counts + recent activity | Return full batch data with student_count, course_count, faculty_count. |

### 8.2 Student Membership UseCases

| UseCase | Input | Key Logic |
|---|---|---|
| `AddStudentToBatchUseCase` | batch_id, user_id, added_by | Verify batch is `active`. Verify user has `student` role in this tenant. Check capacity (count active members < max_capacity). Check no existing active membership for this batch+student. Insert. Audit log. Dispatch `BatchStudentAdded`. |
| `BulkAddStudentsToBatchUseCase` | batch_id, user_ids[], added_by | Same as above but in a loop within a single transaction. If ANY student fails validation, the entire operation fails (atomic). Return detailed error for which students failed and why. |
| `RemoveStudentFromBatchUseCase` | batch_id, user_id, removed_by, reason? | Verify batch is `active`. Set `removed_at`, `removed_by`, `removal_reason`. Do NOT hard delete. Audit log. Dispatch `BatchStudentRemoved`. |
| `TransferStudentUseCase` | source_batch_id, target_batch_id, user_id, transferred_by, reason? | Verify both batches are `active`. Verify student is active member of source batch. Verify at least one common course between source and target (via `batch_courses`). Verify target capacity. Within single transaction: soft-remove from source + add to target. Audit log. Dispatch `BatchStudentTransferred`. |

### 8.3 Faculty Assignment UseCases

| UseCase | Input | Key Logic |
|---|---|---|
| `AssignFacultyUseCase` | batch_id, user_id, course_id, assigned_by | Verify batch is `active`. Verify user has `teacher` role. Verify course is linked to this batch (exists in `batch_courses`). Check no duplicate assignment (batch+teacher+course). Insert. Audit log. Dispatch `BatchFacultyAssigned`. |
| `UnassignFacultyUseCase` | faculty_assignment_id, unassigned_by | Load assignment. Verify tenant ownership. Hard delete (faculty assignment is a pure link, not a historical record). Audit log. Dispatch `BatchFacultyUnassigned`. |

### 8.4 Batch-Course Association UseCases

| UseCase | Input | Key Logic |
|---|---|---|
| `LinkCourseToBatchUseCase` | batch_id, course_id, linked_by | Verify batch is `draft` or `active`. Verify course exists in tenant and is `published`. Check no duplicate link. Insert. Audit log. Dispatch `BatchCourseLinked`. |
| `UnlinkCourseFromBatchUseCase` | batch_id, course_id, unlinked_by | Verify batch is `draft` or `active`. Check for dependent records (timetable sessions, attendance records, faculty assignments for this batch+course). If dependents exist, reject with explanation. Otherwise delete. Audit log. Dispatch `BatchCourseUnlinked`. |

---

## 9. Cross-Context Integration Points

### 9.1 Timetable Context (Existing)

The Timetable module already uses `batch_id` on `schedule_templates` and `session_instances`. After this phase:

- `schedule_templates.batch_id` becomes a proper FK to `batches(id)`
- Timetable template creation should validate that the batch is `active`
- Timetable listing should support filtering by batch: `GET .../templates?batch_id=X` (already exists as a query param — now backed by a real entity)
- The `TimetableQueryServiceInterface` (bounded context interface) may need a method to check batch status before allowing template creation. **The developer should assess whether the Timetable context's existing service interface needs extension or whether the batch status check belongs in Timetable's own UseCase.**

### 9.2 Attendance Context (Existing)

The Attendance module uses `batch_id` on `attendance_sessions`. After this phase:

- `attendance_sessions.batch_id` becomes a proper FK to `batches(id)`
- The `CreateAdHocSessionRequest` validation `exists:batches,id` will now work
- Attendance session creation should validate that the batch exists and is `active` or `completed` (attendance can be recorded against completed batches during wind-down period)

### 9.3 Communication Hub (Future Integration — NOT in this phase)

The Product Handbook specifies batch-based targeting for announcements. This requires the Communication Hub to accept `batch_id` as a target type. This is a future integration — documented here for awareness but explicitly out of scope.

### 9.4 Enrollment Module (Future Integration — NOT in this phase)

The Product Handbook describes auto-enrollment: "Adding a student to a batch auto-enrolls them in all associated courses." This requires the Enrollment module to exist with course enrollment APIs. Since Enrollment is not yet built, this automation is deferred. In Phase 1, batch membership and course enrollment are independent operations.

---

## 10. Audit Log Events

All audit entries write to `tenant_audit_logs` following the established pattern.

| Action | Entity Type | Trigger |
|---|---|---|
| `batch.created` | `batch` | CreateBatchUseCase |
| `batch.updated` | `batch` | UpdateBatchUseCase |
| `batch.status_changed` | `batch` | ChangeBatchStatusUseCase |
| `batch.archived` | `batch` | ChangeBatchStatusUseCase (when status → archived) |
| `batch.student_added` | `batch_student` | AddStudentToBatchUseCase |
| `batch.student_removed` | `batch_student` | RemoveStudentFromBatchUseCase |
| `batch.student_transferred` | `batch_student` | TransferStudentUseCase |
| `batch.faculty_assigned` | `batch_faculty` | AssignFacultyUseCase |
| `batch.faculty_unassigned` | `batch_faculty` | UnassignFacultyUseCase |
| `batch.course_linked` | `batch_course` | LinkCourseToBatchUseCase |
| `batch.course_unlinked` | `batch_course` | UnlinkCourseFromBatchUseCase |

**Reminder:** Audit logs must NEVER be written inside database transactions (data loss on rollback). Write audit logs after the transaction commits successfully.

---

## 11. Security Considerations

| Concern | Mitigation |
|---|---|
| **Cross-tenant data leakage** | All queries scoped by `tenant_id` via `BelongsToTenant` trait. UseCase layer verifies resource ownership before any mutation. |
| **Tenant enumeration via 403 vs 404** | All "resource not found" responses return 404 regardless of whether the resource exists in another tenant. Never return 403 for cross-tenant access — it confirms existence. |
| **Capacity race condition** | Capacity check (count query) and insert happen inside the same DB transaction. Two simultaneous requests adding the last student will be serialized by the row-level lock. |
| **Role impersonation** | Adding a user as a student requires verifying their `student` role via `user_role_assignments`. A user with only a `teacher` role cannot be added as a student. |
| **Bulk add abuse** | Bulk add has a configurable max size (e.g., 100 users per request). Larger imports should use CSV upload + async processing (not in Phase 1). |
| **Archived batch data access** | Archived batches are excluded from default list queries but remain accessible via direct ID lookup for audit and historical purposes. |

---

## 12. Decision Records

### DR-BATCH-001: Batch as Independent Entity (Not Course-Bound)

| Field | Value |
|---|---|
| **Decision** | Batch is an independent entity with a mandatory Department parent, not bound to a single Course. Courses are linked via a many-to-many pivot (`batch_courses`). |
| **Alternatives Considered** | (1) Batch belongs to Course — rejected because real institutions have batches like "Class 10-A" that take multiple courses. (2) Batch has no parent — rejected because Department provides the organizational grouping that institutions need. |
| **Impact** | Requires `batch_courses` pivot table. Faculty assignment is at `(batch, course)` level, not just `(batch)` level. More flexible but slightly more complex. |
| **Risk** | None — this matches the real-world organizational model of coaching institutes and schools. |

### DR-BATCH-002: Keep User Groups Separate

| Field | Value |
|---|---|
| **Decision** | `user_groups` entity remains untouched. Batch and User Group are separate concepts with separate responsibilities. |
| **Rationale** | User Groups are ad-hoc administrative labels ("Sports Committee"). Batches are academic delivery units with lifecycle, capacity, scheduling, and faculty assignments. Merging them creates a God Model with conditional logic everywhere. |
| **Impact** | Two grouping concepts in the platform — requires clear documentation for tenant admins to understand the difference. |
| **Risk** | Low — the naming is sufficiently distinct ("Batch" vs "Group") and the use cases don't overlap. |

### DR-BATCH-003: Fixed Cohort Only in Phase 1

| Field | Value |
|---|---|
| **Decision** | Phase 1 implements `fixed_cohort` batch type only. Evergreen and Hybrid types are deferred. |
| **Rationale** | Fixed Cohort covers 90%+ of coaching institute use cases. Evergreen requires relative-date enrollment logic (depends on Enrollment module). Hybrid requires both fixed scheduling and self-paced content pacing. |
| **Impact** | `type` column is VARCHAR(30) — extensible without migration. `BatchType` enum has one value now, extensible in code. |
| **Risk** | None — the schema and domain model are designed for extension without breaking changes. |

### DR-BATCH-004: Faculty Assignment at Course Level

| Field | Value |
|---|---|
| **Decision** | Teachers are assigned to a `(batch, course)` pair, not to a batch directly. |
| **Alternatives Considered** | (1) Teacher assigned to batch only — rejected because a batch takes multiple courses and different teachers teach different subjects. "Prof. X teaches ALL courses in Batch A" is not how institutes work. |
| **Impact** | `batch_faculty` table has a three-column unique constraint `(batch_id, user_id, course_id)`. Slightly more complex than a two-column model. |
| **Risk** | None — this matches the real-world faculty assignment model. |

### DR-BATCH-005: No Auto-Enrollment in Phase 1

| Field | Value |
|---|---|
| **Decision** | Adding a student to a batch does NOT auto-enroll them in associated courses in Phase 1. |
| **Rationale** | The Enrollment module (enrollments table, access control logic, expiry/renewal) is not yet built. Auto-enrollment requires Enrollment APIs to exist. |
| **Impact** | In Phase 1, batch membership and course enrollment are separate manual steps. This is acceptable for launch — the admin adds students to a batch AND separately enrolls them in courses. |
| **Risk** | Medium — this creates a two-step workflow for admins. Must be resolved when the Enrollment module is built. Documented as a Phase 2 dependency. |

### DR-BATCH-006: Soft Removal for Student Membership

| Field | Value |
|---|---|
| **Decision** | Removing a student from a batch sets `removed_at` instead of hard deleting the row. |
| **Rationale** | Hard deletion loses the audit trail of "who was in this batch and when." Attendance records, assignment submissions, and quiz attempts reference the student's batch context. Deleting the membership row orphans that context. |
| **Impact** | "Active members" queries must filter `WHERE removed_at IS NULL`. Slightly more complex but preserves data integrity. |
| **Risk** | None — this is the standard pattern for membership-type relationships in the platform. |

---

## 13. Testing Strategy

### 13.1 Required Test Categories

| Category | What to Test |
|---|---|
| **Unit Tests (Domain)** | BatchEntity invariants (status transitions, capacity, date validation). BatchStatus transition rules. BatchCode validation. All should run without database. |
| **UseCase Tests** | Each UseCase with mocked repository. Verify business rules (capacity check, role check, status guard, tenant ownership). |
| **Integration Tests** | Full API endpoint tests through HTTP layer. Verify middleware stack, tenant isolation, capability gating, and correct HTTP status codes. |
| **Cross-Tenant Isolation** | Verify that Batch, Student, Faculty, and Course data from Tenant A is invisible to Tenant B. Standard isolation test pattern. |
| **FK Wiring Tests** | After FK migrations: verify that creating a timetable template with a non-existent `batch_id` fails. Verify that deleting a batch with existing templates fails (RESTRICT). |
| **Capacity Race Condition** | Concurrent test: two requests simultaneously adding the last student to a batch at capacity. Only one should succeed. |
| **Transfer Atomicity** | Verify that transfer either completes fully (removed from source + added to target) or fails entirely (no partial state). |

---

## 14. Implementation Guidance

### 14.1 Suggested Sub-Phasing

The developer may choose to split implementation into sub-phases:

- **Sub-Phase A:** `batches` table + Batch CRUD (Entity, Repository, UseCases, Controller, tests). This is the core entity.
- **Sub-Phase B:** `batch_courses` pivot + link/unlink APIs. `batch_faculty` table + assign/unassign APIs.
- **Sub-Phase C:** `batch_students` table + add/remove/bulk-add APIs. Capacity enforcement. Transfer workflow.
- **Sub-Phase D:** FK wiring migrations for Timetable and Attendance. Integration tests for downstream modules.

### 14.2 Migration Execution Order

1. Create `batches` table (no dependencies beyond `tenants` and `departments`)
2. Create `batch_courses` table (depends on `batches` + `courses`)
3. Create `batch_students` table (depends on `batches` + `users`)
4. Create `batch_faculty` table (depends on `batches` + `users` + `courses`)
5. Alter `schedule_templates` — add FK to `batches` (must handle orphaned data)
6. Alter `session_instances` — add FK to `batches`
7. Alter `attendance_sessions` — add FK to `batches`

**Steps 5–7 are destructive migrations.** They will fail if existing data has `batch_id` values that don't exist in `batches`. The developer MUST check production data before running these migrations and handle orphaned records appropriately.

### 14.3 Capability Seeder

Add the 6 new capabilities to the existing `TenantCapabilitySeeder`. Map them to default roles as specified in Section 7.

---

## 15. Future Phases (Out of Scope — Documented for Awareness)

| Feature | Dependency | Notes |
|---|---|---|
| Auto-enrollment on batch join | Enrollment module | When student joins batch → auto-enroll in all `batch_courses` |
| Evergreen batch type | Enrollment module (relative-date expiry) | Rolling enrollment, no fixed dates |
| Hybrid batch type | Evergreen + Live Session scheduling | Self-paced content + batched live sessions |
| Batch-level fee structures | Fee Management module | Different pricing per batch for same course |
| Communication Hub batch targeting | Communication Hub target type extension | Send notices to specific batches |
| Batch cloning / templates | Batch CRUD extension | Clone a batch's course links and faculty assignments for a new cohort |
| Student panel batch view | Panel frontend | Students see "My Batches" and batch-specific schedule |
| Teacher panel batch view | Panel frontend | Teachers see "My Batches" with student lists and attendance |
| Batch dashboard widgets | Dashboard phase | Active batches count, batch capacity utilization, batch attendance trends |
| Progress preservation on transfer | Enrollment + Learning Progress modules | Copy video progress, quiz attempts when transferring between batches |
| Waitlist when at capacity | Batch CRUD extension | Queue students when batch is full, auto-admit on spot opening |

---

*End of Document. Issued for Antigravity implementation team.*
