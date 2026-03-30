# UBOTZ 2.0 — Developer Instructions: Assignment Feature Remediation & Completion

| Field | Value |
|---|---|
| **Document Type** | Developer Instruction (Pre-Implementation Brief) |
| **Phase** | Assignment Remediation |
| **Date** | March 2026 |
| **Issued By** | Principal Engineer / Architecture Auditor |
| **Audience** | Antigravity Implementation Team |
| **Expected Deliverable** | Implementation Plan (same format as prior phase plans) |
| **Prerequisites** | Phase 10A–10E COMPLETE (RBAC, capability middleware), Phase 14 COMPLETE (notification infrastructure), Phase 15A COMPLETE (CRM context), Backend file tree confirmed |

> **This document addresses an existing partial implementation.** The Assignment feature was built without a requirements document, without developer instructions, and without a Principal Engineer audit. As a result it contains critical security gaps, dead code, and missing domain rules. This instruction set covers two concerns: (1) **Remediation** — fix what is broken, remove what is wrong, (2) **Completion** — implement missing business rules that were defined in the March 2026 requirements session.
>
> The business requirements are defined in `EducoreOS_Assignment_Feature_Document.md`. That document is the authoritative source of truth. Any conflict between the existing code and that document must be resolved in favour of the document.

---

## 1. Current State Analysis

### 1.1 What Exists (from Status Report + File Tree)

The following files are already in the codebase:

**Application Layer**
- `Commands/CreateAssignmentCommand.php`
- `Commands/GradeSubmissionCommand.php`
- `Commands/SubmitAssignmentMessageCommand.php` ← **DELETE**
- `UseCases/CreateAssignmentUseCase.php`
- `UseCases/GradeSubmissionUseCase.php`
- `UseCases/SubmitAssignmentMessageUseCase.php` ← **DELETE**
- `Queries/GetAssignmentQuery.php`
- `Queries/GetStudentSubmissionQuery.php`
- `Queries/ListAssignmentSubmissionsQuery.php`
- `Queries/ListChapterAssignmentsQuery.php`
- `Queries/ListSubmissionMessagesQuery.php` ← **DELETE**

**Domain Layer**
- `Entities/AssignmentEntity.php`
- `Entities/AssignmentSubmissionEntity.php`
- `Entities/AssignmentMessageEntity.php` ← **DELETE**
- `Repositories/AssignmentRepositoryInterface.php`
- `Repositories/AssignmentSubmissionRepositoryInterface.php`

**Infrastructure Layer**
- `AssignmentRecord.php` — has `BelongsToTenant`, `SoftDeletes`
- `AssignmentSubmissionRecord.php` — has `BelongsToTenant`, `tenant_id` column NOW EXISTS (confirmed via updated status report)
- `AssignmentMessageRecord.php` ← **DELETE**
- `EloquentAssignmentRepository.php`
- `EloquentAssignmentSubmissionRepository.php`

**HTTP Layer**
- `AssignmentReadController.php`
- `AssignmentWriteController.php`
- `AssignmentSubmissionReadController.php`
- `AssignmentSubmissionWriteController.php`
- `routes/tenant_dashboard/assignment.php`

**Tests**
- `Unit/Application/TenantAdminDashboard/Assignment/CreateAssignmentUseCaseTest.php`
- `Unit/Application/TenantAdminDashboard/Assignment/GradeSubmissionUseCaseTest.php`
- `Unit/Application/TenantAdminDashboard/Assignment/SubmitAssignmentMessageUseCaseTest.php` ← **DELETE**

### 1.2 Critical Defects Confirmed by Audit

| # | Defect | Severity |
|---|---|---|
| D-01 | No `tenant.capability` middleware on any route | Critical |
| D-02 | Audit log written inside `DB::transaction()` in `CreateAssignmentUseCase` | Critical |
| D-03 | No domain events dispatched anywhere in the Assignment context | Architectural |
| D-04 | `assignment_messages` table + all related code is out of scope per agreed requirements — must be fully removed | Architectural |
| D-05 | No domain exceptions — invalid states handled generically | Maintainability |
| D-06 | No `FormRequest` classes — validation inline in controllers | Maintainability |
| D-07 | No soft deletes on `assignment_submissions` | Maintainability |
| D-08 | `attempts` column on `assignments` table is out of scope per requirements — must be dropped | Schema |
| D-09 | `check_previous_parts` column on `assignments` — unspecified behaviour, must be reviewed and removed if no defined business rule exists | Schema |
| D-10 | `instructor_id` on `assignment_submissions` must be set from authenticated user, never from request input | Security |
| D-11 | Deadline logic not enforced — platform must hard-block submission after deadline | Business Rule |
| D-12 | Pre-grade retraction rule not implemented — student can only retract while `status = pending_review` | Business Rule |
| D-13 | `deadline_type` not present — schema only has `deadline_days` with no model for fixed-date or no-deadline modes | Business Rule |
| D-14 | `feedback` field missing on `assignment_submissions` — single instructor comment not stored | Business Rule |
| D-15 | Submission status transitions not enforced — no state machine | Business Rule |

---

## 2. Business Rules (NON-NEGOTIABLE)

All rules derived from the agreed Assignment Feature Document. These must be enforced at the domain layer, not the controller.

### 2.1 Assignment Creation Rules

| Rule ID | Rule |
|---|---|
| BR-01 | `max_grade` is required. Must be a positive integer. |
| BR-02 | `pass_grade` is required. Must be a positive integer. Must be less than or equal to `max_grade`. |
| BR-03 | `deadline_type` must be one of: `fixed_date`, `days_after_enrollment`, `none`. |
| BR-04 | If `deadline_type = fixed_date`, a `deadline_at` timestamp is required. |
| BR-05 | If `deadline_type = days_after_enrollment`, a `deadline_days` integer (> 0) is required. |
| BR-06 | If `deadline_type = none`, both `deadline_at` and `deadline_days` are null. |
| BR-07 | An assignment must be bound to a valid `course_id` and `chapter_id` belonging to the same tenant. |
| BR-08 | The creator must have `assignment.create` capability OR be Tenant Admin. |

### 2.2 Submission Rules

| Rule ID | Rule |
|---|---|
| BR-09 | A student may only submit if their enrollment grants access to the chapter containing the assignment. (Access check delegated to enrollment/chapter access service — do not re-implement here; throw `ChapterAccessDeniedException` if access check returns false.) |
| BR-10 | Before accepting a submission, the platform must evaluate the deadline. If the assignment has an active deadline and it has passed for this student, reject with `SubmissionDeadlinePassedException`. |
| BR-11 | A student may only have one submission per assignment. If a submission already exists and its status is NOT `pending_review`, reject with `SubmissionAlreadyExistsException`. |
| BR-12 | A student may retract their own submission only while its status is `pending_review`. Retraction sets the record to soft-deleted. A new submission can then be created. |
| BR-13 | A submission must contain at least one of: a non-empty `text_response` OR a `file_path`. An empty submission is rejected with `EmptySubmissionException`. |
| BR-14 | `instructor_id` on a submission is NEVER sourced from request input. It is always null at submit time and set by the system when grading begins. |
| BR-15 | Soft delete is required on `assignment_submissions`. Hard deletes are forbidden. |

### 2.3 Submission Status State Machine

The only valid status transitions are:

```
[none]  →  pending_review   (student submits)
pending_review  →  [soft deleted]   (student retracts — only permitted state for retraction)
pending_review  →  graded           (instructor grades)
```

No other transitions are valid. Any attempt to transition outside these paths throws `InvalidSubmissionTransitionException`.

### 2.4 Grading Rules

| Rule ID | Rule |
|---|---|
| BR-16 | Only a user with `assignment.grade` capability OR Tenant Admin may grade a submission. |
| BR-17 | `grade` must be a non-negative integer and must not exceed the assignment's `max_grade`. Reject with `GradeExceedsMaximumException` if violated. |
| BR-18 | `feedback` is an optional text comment written by the instructor at grading time. It is stored on the submission record. Max 2000 characters. |
| BR-19 | `instructor_id` on the submission is set from the authenticated user's ID at grading time, not from request input. |
| BR-20 | A submission that is already `graded` cannot be regraded. Reject with `SubmissionAlreadyGradedException`. |
| BR-21 | After grading, the system must determine pass/fail: `grade >= assignment.pass_grade` = passed. This determination is computed and stored as `passed` boolean on the submission record. |

### 2.5 Course Progress Integration

| Rule ID | Rule |
|---|---|
| BR-22 | After a grade is saved and `passed = true`, the system must dispatch a domain event `AssignmentPassed` so that the course progress service can react. The Assignment context does NOT directly update course progress — it only fires the event. |
| BR-23 | A submission that is graded but `passed = false` does NOT trigger `AssignmentPassed`. |

### 2.6 Notification Rules

| Rule ID | Rule |
|---|---|
| BR-24 | When a student submits, dispatch domain event `AssignmentSubmitted`. A listener in this context sends a notification to the instructor using the Phase 14 `NotificationDispatcher`. |
| BR-25 | When an instructor grades a submission, dispatch domain event `AssignmentGraded`. A listener sends a notification to the student with their mark. |
| BR-26 | Both notifications use the `system` category (opt-out eligible). |

---

## 3. Schema Changes Required

### 3.1 Migrations to Write

**Migration 1: Modify `assignments` table**

```
- DROP COLUMN: attempts
- DROP COLUMN: check_previous_parts
- ADD COLUMN: deadline_type ENUM('fixed_date', 'days_after_enrollment', 'none') NOT NULL DEFAULT 'none'
- ADD COLUMN: deadline_at TIMESTAMP NULL
- RENAME COLUMN: (deadline_days stays — still used for days_after_enrollment mode)
- ADD COLUMN: status ENUM('active', 'archived') NOT NULL DEFAULT 'active'
  (if currently VARCHAR — enforce enum at DB level)
```

**Migration 2: Modify `assignment_submissions` table**

```
- ADD COLUMN: feedback TEXT NULL  (instructor's single comment)
- ADD COLUMN: passed BOOLEAN NULL  (null until graded, true/false after grading)
- ADD COLUMN: deleted_at TIMESTAMP NULL  (enable soft deletes)
- CONFIRM: tenant_id column exists (added via prior migration per updated status report)
- CONFIRM: status column exists
```

**Migration 3: Drop `assignment_messages` table**

```sql
DROP TABLE IF EXISTS assignment_messages;
```

This migration is irreversible. Confirm with the team that no production data exists in this table before running. If data exists, document the drop in the migration comment.

### 3.2 Final Schema State (Target)

**`assignments`**

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | BIGINT UNSIGNED PK | No | |
| `tenant_id` | BIGINT UNSIGNED FK | No | `BelongsToTenant` scoped |
| `creator_id` | BIGINT UNSIGNED | No | FK to `users.id` |
| `course_id` | BIGINT UNSIGNED | No | FK to `courses.id` |
| `chapter_id` | BIGINT UNSIGNED | No | FK to `chapters.id` |
| `title` | VARCHAR(255) | No | |
| `description` | TEXT | No | |
| `max_grade` | INTEGER UNSIGNED | No | |
| `pass_grade` | INTEGER UNSIGNED | No | Must be ≤ max_grade |
| `deadline_type` | ENUM | No | `fixed_date`, `days_after_enrollment`, `none` |
| `deadline_at` | TIMESTAMP | Yes | Required if `deadline_type = fixed_date` |
| `deadline_days` | INTEGER UNSIGNED | Yes | Required if `deadline_type = days_after_enrollment` |
| `status` | ENUM | No | `active`, `archived` — default `active` |
| `created_at` | TIMESTAMP | Yes | |
| `updated_at` | TIMESTAMP | Yes | |
| `deleted_at` | TIMESTAMP | Yes | SoftDeletes |

**`assignment_submissions`**

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | BIGINT UNSIGNED PK | No | |
| `tenant_id` | BIGINT UNSIGNED FK | No | `BelongsToTenant` scoped |
| `assignment_id` | BIGINT UNSIGNED FK | No | |
| `student_id` | BIGINT UNSIGNED | No | FK to `users.id` |
| `instructor_id` | BIGINT UNSIGNED | Yes | Set at grade time from auth user — never from input |
| `text_response` | TEXT | Yes | |
| `file_path` | VARCHAR(500) | Yes | Tenant-isolated storage path |
| `grade` | INTEGER UNSIGNED | Yes | Null until graded |
| `pass_grade` | INTEGER UNSIGNED | No | Snapshot of assignment.pass_grade at submission time |
| `feedback` | TEXT | Yes | Instructor comment — max 2000 chars |
| `passed` | BOOLEAN | Yes | Null until graded |
| `status` | ENUM | No | `pending_review`, `graded` |
| `created_at` | TIMESTAMP | Yes | |
| `updated_at` | TIMESTAMP | Yes | |
| `deleted_at` | TIMESTAMP | Yes | SoftDeletes — used for student retraction |

> **Note on `pass_grade` snapshot:** Store a copy of the assignment's `pass_grade` on the submission at the time of grading. This prevents retroactive changes to the assignment's pass threshold from silently altering a student's historical pass/fail status.

---

## 4. Files to DELETE

Remove these files completely. Do not refactor — delete.

| File | Reason |
|---|---|
| `Application/TenantAdminDashboard/Assignment/Commands/SubmitAssignmentMessageCommand.php` | Messaging feature removed |
| `Application/TenantAdminDashboard/Assignment/UseCases/SubmitAssignmentMessageUseCase.php` | Messaging feature removed |
| `Application/TenantAdminDashboard/Assignment/Queries/ListSubmissionMessagesQuery.php` | Messaging feature removed |
| `Domain/TenantAdminDashboard/Assignment/Entities/AssignmentMessageEntity.php` | Messaging feature removed |
| `Infrastructure/Persistence/TenantAdminDashboard/Assignment/AssignmentMessageRecord.php` | Messaging feature removed |
| `tests/Unit/Application/TenantAdminDashboard/Assignment/SubmitAssignmentMessageUseCaseTest.php` | Test for deleted feature |

After deletion, verify with `grep -r "AssignmentMessage\|assignment_messages\|SubmitAssignmentMessage\|ListSubmissionMessages" app/ routes/ tests/` — the result must be zero matches.

---

## 5. Domain Layer

### 5.1 Domain Exceptions to Create

Create all exceptions under `Domain/TenantAdminDashboard/Assignment/Exceptions/`.

| Exception Class | When Thrown |
|---|---|
| `SubmissionDeadlinePassedException` | Student attempts to submit after the deadline has passed |
| `SubmissionAlreadyExistsException` | Student attempts to submit when a non-retracted submission exists |
| `EmptySubmissionException` | Submission has neither text_response nor file_path |
| `InvalidSubmissionTransitionException` | Any status transition that violates the state machine |
| `SubmissionNotRetractableException` | Student attempts to retract a submission that is not `pending_review` |
| `GradeExceedsMaximumException` | Grade value exceeds the assignment's `max_grade` |
| `SubmissionAlreadyGradedException` | Attempt to grade a submission that is already `graded` |
| `AssignmentNotFoundException` | Assignment not found or not accessible to this tenant |
| `SubmissionNotFoundException` | Submission not found or not accessible to this tenant/student |

All exceptions extend `DomainException` (PHP built-in). No infrastructure dependencies.

### 5.2 Value Objects to Create

Create under `Domain/TenantAdminDashboard/Assignment/ValueObjects/`.

**`DeadlineType`**

```php
final class DeadlineType
{
    public const FIXED_DATE = 'fixed_date';
    public const DAYS_AFTER_ENROLLMENT = 'days_after_enrollment';
    public const NONE = 'none';

    private function __construct(private readonly string $value) {}

    public static function from(string $value): self
    {
        if (!in_array($value, [self::FIXED_DATE, self::DAYS_AFTER_ENROLLMENT, self::NONE], true)) {
            throw new \InvalidArgumentException("Invalid deadline type: {$value}");
        }
        return new self($value);
    }

    public function value(): string { return $this->value; }
    public function isNone(): bool { return $this->value === self::NONE; }
    public function isFixedDate(): bool { return $this->value === self::FIXED_DATE; }
    public function isDaysAfterEnrollment(): bool { return $this->value === self::DAYS_AFTER_ENROLLMENT; }
}
```

**`SubmissionStatus`**

```php
final class SubmissionStatus
{
    public const PENDING_REVIEW = 'pending_review';
    public const GRADED = 'graded';
    // ...same pattern as DeadlineType
}
```

**`AssignmentStatus`**

```php
final class AssignmentStatus
{
    public const ACTIVE = 'active';
    public const ARCHIVED = 'archived';
    // ...same pattern
}
```

### 5.3 Domain Events to Create

Create under `Domain/TenantAdminDashboard/Assignment/Events/`.

**`AssignmentCreated`**
```php
final class AssignmentCreated
{
    public function __construct(
        public readonly int $tenantId,
        public readonly int $assignmentId,
        public readonly int $courseId,
        public readonly int $chapterId,
        public readonly int $creatorId,
    ) {}
}
```

**`AssignmentSubmitted`**
```php
final class AssignmentSubmitted
{
    public function __construct(
        public readonly int $tenantId,
        public readonly int $assignmentId,
        public readonly int $submissionId,
        public readonly int $studentId,
        public readonly int $instructorId, // course instructor to notify
    ) {}
}
```

**`AssignmentGraded`**
```php
final class AssignmentGraded
{
    public function __construct(
        public readonly int $tenantId,
        public readonly int $assignmentId,
        public readonly int $submissionId,
        public readonly int $studentId,
        public readonly int $instructorId,
        public readonly int $grade,
        public readonly bool $passed,
    ) {}
}
```

**`AssignmentPassed`**
```php
final class AssignmentPassed
{
    public function __construct(
        public readonly int $tenantId,
        public readonly int $courseId,
        public readonly int $chapterId,
        public readonly int $assignmentId,
        public readonly int $studentId,
    ) {}
}
```

> `AssignmentPassed` is dispatched in addition to `AssignmentGraded` when `passed = true`. It is the signal for the course progress service to react. The Assignment context does not touch the progress table directly.

### 5.4 `AssignmentEntity` — Required Updates

The existing entity must be updated to enforce the following invariants:

- `pass_grade` must not exceed `max_grade` — throw `\InvalidArgumentException` in constructor if violated
- `deadlineHasPassedFor(?\DateTimeImmutable $enrolledAt, \DateTimeImmutable $now): bool` — pure method, no infrastructure dependencies. Evaluates deadline based on `deadline_type`:
  - `none` → always returns `false`
  - `fixed_date` → returns `$now > $this->deadlineAt`
  - `days_after_enrollment` → returns `$enrolledAt !== null && $now > $enrolledAt->modify("+{$this->deadlineDays} days")`

### 5.5 `AssignmentSubmissionEntity` — Required Updates

- Remove any reference to `AssignmentMessageEntity` or message-related methods
- Add `canBeRetracted(): bool` — returns `true` only when `status === SubmissionStatus::PENDING_REVIEW`
- Add `canBeGraded(): bool` — returns `true` only when `status === SubmissionStatus::PENDING_REVIEW`
- Add `markAsGraded(int $grade, int $maxGrade, int $passGrade, ?string $feedback, int $instructorId): void` — enforces `grade <= maxGrade`, sets `passed`, sets `instructor_id`, transitions status to `graded`. Throws `GradeExceedsMaximumException` or `SubmissionAlreadyGradedException` as appropriate.

---

## 6. Application Layer

### 6.1 Commands to UPDATE

**`CreateAssignmentCommand`** — add fields:

```php
public readonly string $deadlineType,      // DeadlineType value
public readonly ?\DateTimeImmutable $deadlineAt,   // required if fixed_date
public readonly ?int $deadlineDays,        // required if days_after_enrollment
```

Remove fields:
- `attempts` — no longer a domain concept
- `checkPreviousParts` — no longer a domain concept

**`GradeSubmissionCommand`** — update:

```php
public readonly int $grade,
public readonly ?string $feedback,   // ADD — max 2000 chars
// instructor_id is NOT in the command — resolved from auth in UseCase
```

### 6.2 UseCases to UPDATE

**`CreateAssignmentUseCase`**

Current defect: audit log is written inside `DB::transaction()`.

Correct pattern:
```php
$assignment = null;

DB::transaction(function () use ($command, &$assignment) {
    // all DB writes here
    $assignment = ...; // capture result
});

// OUTSIDE transaction:
$this->auditLogger->log(...);
event(new AssignmentCreated(...));
```

Events must be dispatched via `DB::afterCommit()` or after the transaction block. Never inside.

**`GradeSubmissionUseCase`**

Current state: exists but not fully audited.

Required behaviour:
1. Resolve submission via repository — verify `tenant_id` matches tenant context (throw `SubmissionNotFoundException` if not found or tenant mismatch)
2. Resolve assignment — verify it belongs to same tenant
3. Verify actor has `assignment.grade` capability (resource-level check — actor must be Tenant Admin OR a teacher/co-teacher on the course)
4. Call `$submission->canBeGraded()` — throw `SubmissionAlreadyGradedException` if false
5. Validate `$command->grade <= $assignment->maxGrade` — throw `GradeExceedsMaximumException` if violated
6. Set `instructor_id` from authenticated actor's ID — NEVER from command input
7. Persist inside `DB::transaction()`
8. OUTSIDE transaction: dispatch `AssignmentGraded` event; if `passed = true`, also dispatch `AssignmentPassed` event; write audit log

### 6.3 New UseCase: `RetractSubmissionUseCase`

This is a missing use case. The retraction business rule exists but no UseCase implements it.

```
Command: RetractSubmissionCommand(tenantId, studentId, submissionId)

UseCase logic:
1. Resolve submission — verify tenant_id and student_id match
2. Call $submission->canBeRetracted() — throw SubmissionNotRetractableException if false
3. Soft-delete the submission record (sets deleted_at)
4. Audit log written OUTSIDE transaction: 'assignment_submission.retracted'
5. No domain event required for retraction
```

### 6.4 New Query: `GetStudentSubmissionQuery` — verify it handles soft deletes

The query must explicitly use `withTrashed()` only in admin contexts. In student context it must never return a soft-deleted (retracted) submission — the student sees "no submission yet" after retraction.

### 6.5 Notification Listeners to Create

Create under `Application/TenantAdminDashboard/Assignment/Listeners/`.

**`NotifyInstructorOnSubmissionListener`**
- Listens to: `AssignmentSubmitted`
- Action: resolves the course instructor, dispatches notification via `NotificationDispatcher` (Phase 14 infrastructure)
- Notification category: `system`
- Queue: `default` priority lane

**`NotifyStudentOnGradeListener`**
- Listens to: `AssignmentGraded`
- Action: resolves the student, dispatches notification via `NotificationDispatcher`
- Notification category: `system`
- Payload: include grade and pass/fail status in notification body
- Queue: `default` priority lane

Register both listeners in `EventServiceProvider` (or the Assignment-context event service provider if one exists).

---

## 7. HTTP Layer

### 7.1 FormRequest Classes to Create

Create under `Http/Requests/TenantAdminDashboard/Assignment/`.

| FormRequest Class | Used By | Key Validation Rules |
|---|---|---|
| `CreateAssignmentRequest` | `AssignmentWriteController@store` | `title` required string max 255; `description` required string; `max_grade` required integer min 1; `pass_grade` required integer min 1 lte:max_grade; `deadline_type` required in:fixed_date,days_after_enrollment,none; `deadline_at` required_if:deadline_type,fixed_date date after:now; `deadline_days` required_if:deadline_type,days_after_enrollment integer min 1 |
| `GradeSubmissionRequest` | `AssignmentSubmissionWriteController@grade` | `grade` required integer min 0; `feedback` nullable string max 2000 |
| `SubmitAssignmentRequest` | `AssignmentSubmissionWriteController@submit` | `text_response` nullable string; `file` nullable file mimes:pdf,doc,docx,jpg,jpeg,png max:10240; custom rule: at least one of text_response or file must be present |

All FormRequests must extend `Illuminate\Foundation\Http\FormRequest` and use `authorize(): bool { return true; }` — authorization is handled by middleware and UseCase, not FormRequest.

### 7.2 Route Definitions (FULL REPLACEMENT)

Replace the contents of `routes/tenant_dashboard/assignment.php` entirely:

```php
<?php

use App\Http\Controllers\Api\TenantAdminDashboard\Assignment\AssignmentReadController;
use App\Http\Controllers\Api\TenantAdminDashboard\Assignment\AssignmentWriteController;
use App\Http\Controllers\Api\TenantAdminDashboard\Assignment\AssignmentSubmissionReadController;
use App\Http\Controllers\Api\TenantAdminDashboard\Assignment\AssignmentSubmissionWriteController;
use Illuminate\Support\Facades\Route;

Route::prefix('assignments')->group(function () {

    // --- Assignment CRUD ---
    Route::get('course/{courseId}/chapter/{chapterId}', [AssignmentReadController::class, 'index'])
        ->middleware('tenant.capability:assignment.view');

    Route::get('{assignmentId}', [AssignmentReadController::class, 'show'])
        ->middleware('tenant.capability:assignment.view');

    Route::post('/', [AssignmentWriteController::class, 'store'])
        ->middleware('tenant.capability:assignment.create');

    // --- Submission actions ---
    Route::get('{assignmentId}/submissions', [AssignmentSubmissionReadController::class, 'index'])
        ->middleware('tenant.capability:assignment.submission.view');

    Route::get('{assignmentId}/my-submission', [AssignmentSubmissionReadController::class, 'mySubmission'])
        ->middleware('tenant.capability:assignment.submit');

    Route::post('{assignmentId}/submit', [AssignmentSubmissionWriteController::class, 'submit'])
        ->middleware('tenant.capability:assignment.submit');

    Route::delete('{assignmentId}/my-submission', [AssignmentSubmissionWriteController::class, 'retract'])
        ->middleware('tenant.capability:assignment.submit');

    // --- Grading ---
    Route::post('submissions/{submissionId}/grade', [AssignmentSubmissionWriteController::class, 'grade'])
        ->middleware('tenant.capability:assignment.grade');
});
```

**Routes removed vs. current:**
- `GET .../submissions/{subId}/messages` — DELETED (messaging feature removed)
- `DELETE .../my-submission` — NEW (retraction)

### 7.3 Controller Responsibilities

Controllers must remain thin. The only logic permitted in a controller method:

1. Resolve the authenticated actor via `ResolvesTenantActor` trait
2. Instantiate the Command/Query from the FormRequest or route parameters
3. Call the UseCase/Query
4. Return an API Resource or JSON response

**No business logic. No validation logic. No direct model queries.**

### 7.4 API Resources to Create/Verify

Create under `Http/Resources/TenantAdminDashboard/Assignment/`.

| Resource Class | Represents | Key Fields |
|---|---|---|
| `AssignmentResource` | Single assignment | id, title, description, max_grade, pass_grade, deadline_type, deadline_at, deadline_days, status, created_at |
| `AssignmentSubmissionResource` | Single submission (instructor view) | id, assignment_id, student_id, text_response, file_path, grade, feedback, passed, status, instructor_id, created_at |
| `MySubmissionResource` | Student's own submission | id, text_response, file_path, grade, feedback, passed, status, created_at — **NO instructor_id exposed to student** |

---

## 8. Capability Codes

The following capability codes must be confirmed in the `tenant_capabilities` seeder. If they do not exist, add them:

| Code | Group | Display Name |
|---|---|---|
| `assignment.view` | `assignment` | View Assignments |
| `assignment.create` | `assignment` | Create Assignments |
| `assignment.edit` | `assignment` | Edit Assignments |
| `assignment.archive` | `assignment` | Archive Assignments |
| `assignment.submission.view` | `assignment` | View All Submissions |
| `assignment.grade` | `assignment` | Grade Submissions |
| `assignment.submit` | `assignment` | Submit Assignments (student-facing) |

Add these codes to `TenantCapabilitySeeder` via `updateOrInsert` (idempotent). Run verification: `SELECT COUNT(*) FROM tenant_capabilities WHERE \`group\` = 'assignment'` must return 7.

Default role capability assignments:
- `OWNER` and `ADMIN` roles: all 7 capabilities
- `TEACHER` role: `assignment.view`, `assignment.create`, `assignment.edit`, `assignment.submission.view`, `assignment.grade`
- `STUDENT` role: `assignment.view`, `assignment.submit`

---

## 9. Audit Log Events

All audit log entries must be written **outside** `DB::transaction()`.

| Action | Event String | Actor |
|---|---|---|
| Assignment created | `assignment.created` | Instructor/Admin |
| Submission submitted | `assignment_submission.submitted` | Student |
| Submission retracted | `assignment_submission.retracted` | Student |
| Submission graded | `assignment_submission.graded` | Instructor/Admin |

---

## 10. Tests Required

### 10.1 Unit Tests

**`CreateAssignmentUseCaseTest`** — update existing:
- Audit log is NOT called inside the transaction (mock and assert call happens after)
- `AssignmentCreated` event is dispatched
- `pass_grade > max_grade` throws `\InvalidArgumentException`

**`GradeSubmissionUseCaseTest`** — update existing:
- Grade above max throws `GradeExceedsMaximumException`
- Grading already-graded submission throws `SubmissionAlreadyGradedException`
- `instructor_id` is set from actor, not command
- `AssignmentGraded` event dispatched
- `AssignmentPassed` event dispatched only when `passed = true`
- Audit log written outside transaction

**`RetractSubmissionUseCaseTest`** — new:
- Retraction of `pending_review` submission succeeds, record is soft-deleted
- Retraction of `graded` submission throws `SubmissionNotRetractableException`

**`AssignmentEntityTest`** — new:
- `deadlineHasPassedFor()` returns correct results for all three deadline types
- `pass_grade > max_grade` throws on construction

**`AssignmentSubmissionEntityTest`** — new:
- `canBeRetracted()` returns true only for `pending_review`
- `canBeGraded()` returns true only for `pending_review`
- `markAsGraded()` throws `GradeExceedsMaximumException` when grade > maxGrade
- `markAsGraded()` throws `SubmissionAlreadyGradedException` when already graded

### 10.2 Feature / Integration Tests

**`AssignmentTenantIsolationTest`** — new — CRITICAL:
- Tenant A cannot read Tenant B's assignments
- Tenant A cannot read Tenant B's submissions
- Direct submission ID access from another tenant returns 404

**`AssignmentCapabilityTest`** — new:
- All 7 routes return 403 when capability is missing
- Correct capability grants access

**`AssignmentSubmissionFlowTest`** — new:
- Full happy path: create assignment → submit → grade → verify passed
- Deadline enforcement: submission blocked after `fixed_date` deadline passes
- Retraction: submit → retract → resubmit succeeds
- Retraction blocked after grading begins

---

## 11. Implementation Sequence

The developer must implement in this order. Do not skip steps.

```
Step 1 — Delete dead code (all assignment_messages files + SubmitAssignmentMessage files)
Step 2 — Schema migrations (modify assignments, modify submissions, drop messages table)
Step 3 — Value Objects (DeadlineType, SubmissionStatus, AssignmentStatus)
Step 4 — Domain Exceptions (all 9 exception classes)
Step 5 — Domain Events (AssignmentCreated, AssignmentSubmitted, AssignmentGraded, AssignmentPassed)
Step 6 — Update AssignmentEntity (deadline enforcement, pass_grade invariant)
Step 7 — Update AssignmentSubmissionEntity (state machine methods, markAsGraded)
Step 8 — Update Eloquent Records (AssignmentRecord, AssignmentSubmissionRecord — confirm BelongsToTenant, SoftDeletes on submissions)
Step 9 — Update Commands (CreateAssignmentCommand, GradeSubmissionCommand)
Step 10 — Update CreateAssignmentUseCase (move audit log outside transaction, add event dispatch)
Step 11 — Update GradeSubmissionUseCase (full rewrite per Section 6.2 rules)
Step 12 — New RetractSubmissionUseCase
Step 13 — Capability seeder updates
Step 14 — FormRequest classes (3 classes)
Step 15 — Route file replacement
Step 16 — Controller updates (thin controllers, use FormRequests)
Step 17 — API Resources
Step 18 — Notification Listeners (wire to Phase 14 NotificationDispatcher)
Step 19 — Register listeners in EventServiceProvider
Step 20 — Unit tests
Step 21 — Feature/integration tests
Step 22 — grep verification: zero references to assignment_messages anywhere
Step 23 — PHPStan Level 5 — zero errors
Step 24 — Full test suite — zero regressions
```

---

## 12. Quality Gate

All gates must pass before this phase is considered complete.

| # | Gate | Verification |
|---|---|---|
| 1 | `assignment_messages` table dropped | `SHOW TABLES LIKE 'assignment_messages'` returns empty |
| 2 | Zero references to AssignmentMessage anywhere | `grep -r "AssignmentMessage\|assignment_messages" app/ routes/ tests/` returns 0 |
| 3 | `assignment_submissions.deleted_at` column exists | `DESCRIBE assignment_submissions` shows `deleted_at` |
| 4 | `assignment_submissions.feedback` column exists | `DESCRIBE assignment_submissions` shows `feedback` |
| 5 | `assignment_submissions.passed` column exists | `DESCRIBE assignment_submissions` shows `passed` |
| 6 | `assignments.attempts` column removed | `DESCRIBE assignments` shows no `attempts` column |
| 7 | `assignments.deadline_type` column exists | `DESCRIBE assignments` shows `deadline_type` |
| 8 | All 7 assignment capability codes seeded | `SELECT COUNT(*) FROM tenant_capabilities WHERE \`group\` = 'assignment'` = 7 |
| 9 | All routes have capability middleware | Route file inspection — zero routes without `tenant.capability:*` |
| 10 | Tenant isolation test passes | `AssignmentTenantIsolationTest` — all assertions green |
| 11 | Deadline hard block enforced | Feature test: submission after deadline returns 422 |
| 12 | Retraction rules enforced | Feature test: retraction after grading returns 422 |
| 13 | Audit log outside transaction | Unit test assertion on mock order |
| 14 | `instructor_id` never from request | Code review + unit test confirms value set from actor |
| 15 | PHPStan Level 5 passes | `vendor/bin/phpstan analyse` — 0 errors |
| 16 | All existing tests pass | `php artisan test` — zero regressions |

---

## 13. What This Phase Does NOT Include

The following are explicitly deferred. Do not implement them.

| Item | Rationale |
|---|---|
| Course progress update logic | `AssignmentPassed` event is dispatched — the progress service will consume it in a future phase when course progress tracking is built |
| Deadline reminder notifications | Deferred per requirements session |
| Student self-service course catalog / assignment browsing | Student panel not yet built |
| File storage implementation (S3/Contabo) | Follows existing file handling pattern — `file_path` stored as string, actual storage handled by shared file service |
| Peer grading or rubric-based grading | Out of scope |

---

*End of Developer Instructions — Assignment Feature Remediation & Completion*
*UBOTZ 2.0 — Issued by Principal Engineer — March 2026*
