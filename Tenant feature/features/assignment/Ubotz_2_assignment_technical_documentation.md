# UBOTZ 2.0 Assignment Technical Specification

This document reflects the **current** implementation: domain entities and value objects under `App\Domain\TenantAdminDashboard\Assignment`, application layer under `App\Application\TenantAdminDashboard\Assignment`, persistence as Eloquent `*Record` models in `App\Infrastructure\Persistence\TenantAdminDashboard\Assignment`.

---

## 1. Module boundaries & HTTP surface

### Tenant API prefix

Assignment routes are included from `backend/routes/tenant_dashboard/assignment.php` into the authenticated **`/api/tenant`** group (see `backend/routes/api.php`).

### Module & capabilities

- **`tenant.module:module.assignments`** — assignment APIs require the assignments module for the tenant.
- Staff/instructor operations use capabilities such as:
  - `assignment.view`, `assignment.create`, `assignment.edit`, `assignment.delete`
  - `assignment_submission.grade`, `assignment_submission.retract` (where applied on routes)

Student-facing submit/read endpoints are intentionally **not** wrapped in assignment capabilities (authenticated tenant user only); see comments in `assignment.php`.

### Implemented routes (summary)

| Method | Path | Controller | Notes |
|--------|------|------------|--------|
| `GET` | `/api/tenant/assignments` | `AssignmentReadController@index` | Query: optional `chapter_id` filters by chapter; `course_id` in query string is **not** used by the controller |
| `GET` | `/api/tenant/assignments/{assignmentId}` | `AssignmentReadController@show` | |
| `POST` | `/api/tenant/assignments` | `AssignmentWriteController@store` | `assignment.create` |
| `PUT` | `/api/tenant/assignments/{assignmentId}` | `AssignmentWriteController@update` | `assignment.edit` |
| `DELETE` | `/api/tenant/assignments/{assignmentId}` | `AssignmentWriteController@destroy` | `assignment.delete` |
| `POST` | `/api/tenant/assignments/{assignmentId}/submit` | `AssignmentSubmissionWriteController@submit` | Body: `text_response`, `file_path` (see §5) |
| `GET` | `/api/tenant/assignments/{assignmentId}/my-submission` | `AssignmentSubmissionReadController@mySubmission` | |
| `GET` | `/api/tenant/assignments/{assignmentId}/submissions` | `AssignmentSubmissionReadController@index` | `assignment.view` |
| `POST` | `/api/tenant/assignments/submissions/{submissionId}/grade` | `AssignmentSubmissionWriteController@grade` | `assignment_submission.grade` |
| `DELETE` | `/api/tenant/assignments/submissions/{submissionId}/retract` | `AssignmentSubmissionWriteController@retract` | `assignment_submission.retract` |

**Compatibility note:** `AssignmentSubmissionReadController@messages` exists for listing threaded messages, but **`assignment_messages` was dropped** (see §3) and `ListSubmissionMessagesQuery` always returns `[]`. A matching route is **not** registered in `assignment.php` at time of writing. The frontend `api-endpoints.ts` entry `MESSAGES` may not be wired end-to-end.

---

## 2. Application use cases & queries

| Class | Role |
|-------|------|
| `CreateAssignmentUseCase` | Creates `AssignmentEntity`, persists, audit `assignment.created`, dispatches `AssignmentCreated` |
| `SubmitAssignmentUseCase` | Validates deadline, single submission per student, persists submission, audit, `AssignmentSubmitted`, dispatches `RecordStudentActivityJob` (MAS telemetry) on `low` queue |
| `RetractSubmissionUseCase` | Soft-deletes submission while status allows retraction (`pending_review` only) |
| `GradeSubmissionUseCase` | Applies grade vs `max_grade` / `pass_grade`, feedback, `AssignmentGraded`, optional `AssignmentPassed` |
| `ListAllAssignmentsQuery` | All assignments for tenant |
| `ListChapterAssignmentsQuery` | By `chapter_id` |
| `GetAssignmentQuery` | Single assignment |
| `ListAssignmentSubmissionsQuery` | Instructor list for an assignment |
| `GetStudentSubmissionQuery` | Current user’s submission for an assignment |
| `ListSubmissionMessagesQuery` | **Stub** — returns empty array (see §3) |

Listeners (notifications): `NotifyInstructorOnSubmissionListener`, `NotifyStudentOnGradeListener` (under `Application\TenantAdminDashboard\Assignment\Listeners`).

---

## 3. Relational schema & evolution

### Base migration

`2026_03_05_130000_create_assignments_tables.php` created:

- **`assignments`**: `tenant_id`, `creator_id`, `course_id`, `chapter_id`, `title`, `description`, `max_grade`, `pass_grade`, `deadline_days`, `attempts`, `check_previous_parts`, `status`, soft deletes.
- **`assignment_submissions`**: `assignment_id`, `student_id`, `instructor_id`, `grade`, `status`.
- **`assignment_messages`**: threaded messages with optional `file_path`.

### Remediation migrations (authoritative behavior)

- **`2026_03_21_072305_remediate_assignments_table`**: Removes **`attempts`** and **`check_previous_parts`** from DB; adds **`deadline_type`** (`fixed_date`, `days_after_enrollment`, `none`) and **`deadline_at`**. On MySQL, `assignments.status` is constrained to `active` / `archived`.
- **`2026_03_21_072306_remediate_assignment_submissions_table`**: Adds `text_response`, `file_path`, `pass_grade`, `feedback`, `passed`, soft deletes on submissions.
- **`2026_03_21_072307_drop_assignment_messages_table`**: **Drops `assignment_messages`.** Any documentation referring to a normalized message table is **obsolete** unless reintroduced.
- **`2026_03_26_300004_add_tenant_id_to_assignment_submissions`**: Adds **`tenant_id`** on `assignment_submissions` with FK to `tenants` for direct tenant scoping on submissions.

### Current persistence model (high level)

**`assignments`**

| Area | Detail |
|------|--------|
| Scope | `AssignmentRecord` uses `BelongsToTenant` |
| Binding | `course_id`, `chapter_id` required at creation |
| Grading | `max_grade`, `pass_grade`; domain enforces `pass_grade <= max_grade` |
| Deadlines | `DeadlineType` + `deadline_at` / `deadline_days` (see `AssignmentEntity::deadlineHasPassedFor`) |
| Lifecycle | `AssignmentStatus` aligned with DB (`active` / `archived` on MySQL) |

**`assignment_submissions`**

| Column | Role |
|--------|------|
| `tenant_id` | Direct tenant filter (see repository queries) |
| `student_id` | Submitter |
| `text_response` / `file_path` | Payload (file is a **path string**, not binary in DB) |
| `grade`, `pass_grade`, `feedback`, `passed` | Grading outcome |
| `status` | See §4 |
| `instructor_id` | Grader |

---

## 4. Domain state machines

### Assignment status

Use `App\Domain\TenantAdminDashboard\Assignment\ValueObjects\AssignmentStatus` — aligned with remediated DB (`active`, `archived`).

### Submission status

`SubmissionStatus` supports:

- **`pending_review`** — initial state after submit; only state that allows **retract** and **grade**.
- **`graded`** — terminal after `GradeSubmissionUseCase`.

Older prose referring to `submitted`, `under_review`, etc. does **not** match this codebase.

### Submissions per student

`SubmitAssignmentUseCase` rejects a second submission for the same student on the same assignment (`SubmissionAlreadyExistsException`). There is **no** multi-attempt resubmission loop in this use case; retract removes the row (soft delete path via repository) so the student can submit again.

### Deadlines

`AssignmentEntity::deadlineHasPassedFor(?DateTimeImmutable $enrolledAt, DateTimeImmutable $now)`:

- `none` → never passed by deadline.
- `fixed_date` → compare to `deadline_at`.
- `days_after_enrollment` → requires `enrolledAt` and `deadline_days` (if enrollment context is not passed, behavior follows implementation in `deadlineHasPassedFor`).

**Note:** `SubmitAssignmentUseCase` calls `deadlineHasPassedFor(null, …)`, so **days-after-enrollment** deadlines may not evaluate as intended until enrollment time is wired in — verify product behavior if that mode is used.

---

## 5. Request payloads & files

- **`SubmitAssignmentRequest`**: `text_response` (optional string), `file_path` (optional string, max 500) — at least one required.
- Controllers do **not** map multipart file uploads to storage in the snippet above; clients typically supply a **tenant-scoped file path** from the file manager (or a future upload pipeline). Align frontend `FormData` usage with whatever upload endpoint produces `file_path`.

---

## 6. Multi-tenancy & security

- **`AssignmentRecord`** and **`AssignmentSubmissionRecord`** use **`BelongsToTenant`**.
- Repositories scope by **`tenant_id`** on submissions (`EloquentAssignmentSubmissionRepository`).
- Do not query submissions by primary key alone without `tenant_id` in tenant context.

Capability checks on routes are the primary **authorization** gate for staff; submission endpoints rely on authenticated identity plus use-case rules (e.g. grade by submission id within tenant).

---

## 7. Frontend (Next.js)

| Area | Location |
|------|----------|
| API paths | `frontend/config/api-endpoints.ts` — `TENANT_ASSIGNMENTS` (`BASE`, `BY_CHAPTER`, `SUBMIT`, `SUBMISSIONS`, `GRADE`, `MESSAGES`, …) |
| Tenant admin (course builder) | `frontend/features/tenant-admin/courses/components/assignment-*.tsx` — form, manager, submissions list, grading modal |
| Student submission | `frontend/features/student/assignments/assignment-submission-page.tsx`, `frontend/services/student-assignment-service.ts` |

**Integration notes:**

- `studentAssignmentService.getMyAssignments` calls `/tenant/student/assignments` with a fallback empty list if missing — that aggregate listing route may not exist in `backend/routes`; confirm before relying on “my assignments” dashboard.
- Retract: service uses `DELETE /api/tenant/assignments/{id}/my-submission`; backend registers **`DELETE …/submissions/{submissionId}/retract`**. Align paths/parameters when hardening the feature.
- Submit: service posts multipart to `submit`; backend validation expects `text_response` / `file_path` — ensure upload flow supplies `file_path` or extend the API to accept uploads consistently.

---

## 8. Linked code references

| Layer | Path |
|-------|------|
| Domain | `backend/app/Domain/TenantAdminDashboard/Assignment/` |
| Application | `backend/app/Application/TenantAdminDashboard/Assignment/` |
| HTTP | `backend/app/Http/Controllers/Api/TenantAdminDashboard/Assignment/` |
| Requests | `backend/app/Http/Requests/TenantAdminDashboard/Assignment/` |
| Persistence | `backend/app/Infrastructure/Persistence/TenantAdminDashboard/Assignment/` |
| Routes | `backend/routes/tenant_dashboard/assignment.php` |

---

## 9. Document history

- Prior versions described `assignment_messages` and a richer submission status model; schema and domain were **remediated** in March 2026 migrations — this document replaces those assumptions where they conflict with the repository.
