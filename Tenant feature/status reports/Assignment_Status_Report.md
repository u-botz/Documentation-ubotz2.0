# UBOTZ 2.0 — Feature Status Report: Assignment

> **Instructions:** Copy this template for each feature. Fill every section honestly. If something is missing, write "NOT IMPLEMENTED" — do not skip the section. This document feeds directly into the Principal Engineer audit pipeline.

| Field | Value |
|---|---|
| **Feature Name** | Assignment (homework creation, submissions, and feedback/grading) |
| **Bounded Context** | TenantAdminDashboard |
| **Date Reported** | 2026-03-21 |
| **Reported By** | AI Agent (verified in source) |
| **Current Status** | Incomplete — working minimally but critical isolation and architecture gaps exist |
| **Has Developer Instructions Doc?** | No |
| **Has Implementation Plan?** | No |
| **Was Principal Engineer Audit Done?** | No |

---

## 1. What This Feature Does (2–3 sentences)

The Assignment feature allows instructors to create structured homework tasks bound to specific courses and chapters. Students can submit their work, and instructors can review the submissions, leave threaded feedback (`assignment_messages`), and assign a final grade.

---

## 2. Backend Architecture

### 2.1 Controllers

| Controller | Methods | Notes |
|---|---|---|
| `App\Http\Controllers\Api\TenantAdminDashboard\Assignment\AssignmentReadController` | `index`, `show` | Listed under `/api/tenant/assignments` |
| `App\Http\Controllers\Api\TenantAdminDashboard\Assignment\AssignmentWriteController` | `store` | Creates the core assignment |
| `App\Http\Controllers\Api\TenantAdminDashboard\Assignment\AssignmentSubmissionReadController`| `index`, `mySubmission`, `messages`| Views submissions and specific feedback threads |
| `App\Http\Controllers\Api\TenantAdminDashboard\Assignment\AssignmentSubmissionWriteController`| `submit`, `grade` | Evaluates or submits the homework |

### 2.2 UseCases / Queries

| UseCase / Query | Purpose | Injects Audit Logger? | Injects Quota Service? |
|---|---|---|---|
| `CreateAssignmentUseCase` | Initializes new assignment entity | Yes (`assignment.created`) | No |
| `SubmitAssignmentMessageUseCase` | Posts a message to a submission | Yes (`assignment_message.created`) | No |
| `GetAssignmentQuery` | Retrieves single assignment | No | No |
| `ListChapterAssignmentsQuery` | Retrieves assignments for a chapter | No | No |
| `ListAssignmentSubmissionsQuery` | Retrieves submissions for an assignment | No | No |

### 2.3 Domain Layer

| Component | Type | Location | Notes |
|---|---|---|---|
| `AssignmentEntity` | Entity | `Domain/TenantAdminDashboard/Assignment/Entities/` | Aggregate root but lacks domain event dispatching |
| `AssignmentSubmissionEntity`| Entity | `Domain/TenantAdminDashboard/Assignment/Entities/` | Submission details |
| `AssignmentMessageEntity` | Entity | `Domain/TenantAdminDashboard/Assignment/Entities/` | Threaded message |

### 2.4 Domain Events

| Event Class | Trigger | Has Listener? |
|---|---|---|
| **NOT IMPLEMENTED** | N/A | Current UseCases/Entities do not dispatch domain-level events. |

### 2.5 Infrastructure Layer

| Component | Type | Notes |
|---|---|---|
| `AssignmentRecord` | Eloquent Model | Maps to `assignments`; uses `SoftDeletes`, `BelongsToTenant` |
| `AssignmentSubmissionRecord`| Eloquent Model | Maps to `assignment_submissions`; uses `BelongsToTenant` |
| `AssignmentMessageRecord` | Eloquent Model | Maps to `assignment_messages`. **Missing BelongsToTenant scope.** |
| `EloquentAssignmentRepository` | Repository | Implementation of `AssignmentRepositoryInterface` |
| `EloquentAssignmentSubmissionRepository` | Repository | Implementation of `AssignmentSubmissionRepositoryInterface` |

### 2.6 Exceptions

| Exception Class | When Thrown |
|---|---|
| **NOT IMPLEMENTED** | No specific domain exceptions detected directly in Assignment context. Handled generically. |

---

## 3. Database Schema

### 3.1 Tables

**Table: `assignments`** (Migration: `2026_03_05_130000_create_assignments_tables.php`)

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | BIGINT UNSIGNED PK | No | |
| `tenant_id` | BIGINT UNSIGNED FK | No | |
| `creator_id` | BIGINT UNSIGNED | No | |
| `course_id`, `chapter_id` | BIGINT UNSIGNED | No | |
| `title`, `description` | VARCHAR, TEXT | No | |
| `max_grade`, `pass_grade` | INTEGER | Yes | |
| `deadline_days`, `attempts`| INTEGER | Yes | |
| `check_previous_parts` | BOOLEAN | No | |
| `status` | VARCHAR | No | Default `active` |
| `created_at`, `updated_at` | TIMESTAMP | Yes | |
| `deleted_at` | TIMESTAMP | Yes | **Soft Deletes enabled** |

**Table: `assignment_submissions`** (Migration: `2026_03_06_073920_add_tenant_id_to_assignment_submissions_table.php`)

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | BIGINT UNSIGNED PK | No | |
| `tenant_id` | BIGINT UNSIGNED FK | No | Added via central migration |
| `assignment_id` | BIGINT UNSIGNED FK | No | |
| `student_id` | BIGINT UNSIGNED | No | |
| `instructor_id` | BIGINT UNSIGNED | Yes | |
| `grade` | INTEGER | Yes | |
| `status` | VARCHAR | No | |
| `created_at`, `updated_at` | TIMESTAMP | Yes | |

**🚨 Critical Schema Gap:** Missing `deleted_at`.

**Table: `assignment_messages`**

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | BIGINT UNSIGNED PK | No | |
| `submission_id` | BIGINT UNSIGNED FK | No | |
| `sender_id` | BIGINT UNSIGNED | No | |
| `message` | TEXT | No | |
| `file_title`, `file_path` | VARCHAR | Yes | |
| `created_at`, `updated_at` | TIMESTAMP | Yes | |

**🚨 Critical Schema Gap:** Missing `tenant_id`. Contains no `deleted_at`.

### 3.2 Relationships

| From Table | To Table | Type | FK Column |
|---|---|---|---|
| `assignments` | `tenants` | BelongsTo | `tenant_id` |
| `assignment_submissions`| `assignments` | BelongsTo | `assignment_id` |
| `assignment_messages` | `assignment_submissions`| BelongsTo | `submission_id` |

---

## 4. API Endpoints

*(Routes found in `routes/tenant_dashboard/assignment.php`)*

| Method | URI | Controller@Method | Middleware | Capability Code |
|---|---|---|---|---|
| `GET` | `/api/tenant/assignments/course/{cId}/chapter/{chId}`| `AssignmentReadController@index` | `tenant.module`? | **MISSING — No explicit capability attached** |
| `GET` | `/api/tenant/assignments/{astId}` | `AssignmentReadController@show` | `tenant.module`? | **MISSING** |
| `POST` | `/api/tenant/assignments` | `AssignmentWriteController@store` | `tenant.module`? | **MISSING** |
| `GET` | `.../{astId}/submissions` | `AssignmentSubmissionReadController@index`| `tenant.module`? | **MISSING** |
| `GET` | `.../{astId}/my-submission`| `AssignmentSubmissionReadController@mySubmission`| `tenant.module`? | **MISSING** |
| `POST` | `.../{astId}/submit` | `AssignmentSubmissionWriteController@submit`| `tenant.module`? | **MISSING** |
| `GET` | `.../submissions/{subId}/messages`| `AssignmentSubmissionReadController@messages`| `tenant.module`? | **MISSING** |
| `POST` | `.../submissions/{subId}/grade`| `AssignmentSubmissionWriteController@grade`| `tenant.module`?| **MISSING** |

---

## 5. Security Checklist

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | All queries scoped by `tenant_id`? | **Partial** | `assignments` & `submissions` have `tenant_id`. `messages` lack it at the DB level. |
| 2 | User-level isolation enforced where needed? | Partial | Instructor vs student views exist but need rigorous bypass testing. |
| 3 | `tenant.capability` middleware on all routes? | **NO** | `routes/tenant_dashboard/assignment.php` lacks capability gates. |
| 4 | Audit log written for every mutation? | Yes | `CreateAssignmentUseCase` and `SubmitAssignmentMessageUseCase` write logs. |
| 5 | Audit log written OUTSIDE `DB::transaction()`? | **NO** | Logs are written *inside* transaction blocks. |
| 6 | Domain events dispatched via `DB::afterCommit`? | **NO** | No events emitted. |
| 7 | Idempotency keys used for create operations? | **NO** | Missing idempotency protection. |
| 8 | Input validation via FormRequest? | **NO** | Handled in controllers directly without separate FormRequest objects. |
| 9 | File uploads validated server-side? | TBD | Handled via message media paths. |
| 10 | Financial values stored as `_cents` integer? | N/A | |
| 11 | Soft deletes used (no hard delete of user data)? | **Partial** | Master assignments have it; submissions/messages do not. |
| 12 | No raw SQL in controllers or UseCases? | Yes | Repositories used. |
| 13 | Eloquent models have `BelongsToTenant` trait/scope? | **Partial** | `AssignmentRecord` and `AssignmentSubmissionRecord` have it; `AssignmentMessageRecord` does not. |

---

## 6. Frontend

*(Details retained from proxy template)*

### 6.1 File Location

```
frontend/features/tenant-admin/courses/components/
```

### 6.2 Components

| Component | Purpose | Notes |
|---|---|---|
| `assignment-manager.tsx` | View logic and instructor listings | `features/tenant-admin/courses/components/` |
| `assignment-form.tsx` | Modals to create and manage the assignment | `features/tenant-admin/courses/components/` |
| `use-assignments.ts` | Hook for fetching and managing assignments | `features/tenant-admin/courses/hooks/` |
| `tenant-assignment-service.ts`| Backend API client for instructor actions | `services/` |
| `student-assignment-service.ts`| Backend API client for student actions | `services/` |
| `my-assignments-page.tsx` | Student view of their assignments | `features/student/assignments/` |
| `assignment-submission-page.tsx`| Student submission interface | `features/student/assignments/` |

### 6.3 Capability-Based UI Gating

| UI Element | Hidden When Missing Capability | Implemented? |
|---|---|---|
| Grading Buttons | `assignment.grade` | **Verify** |

---

## 7. Tests

| Test File | Test Count | Passing? |
|---|---|---|
| `tests/Feature/TenantAdminDashboard/Assignment/AssignmentIntegrationTest.php` | Multiple | **Verify** |
| `tests/Unit/Application/TenantAdminDashboard/Assignment/CreateAssignmentUseCaseTest.php` | Multiple | **Verify** |
| `tests/Unit/Application/TenantAdminDashboard/Assignment/SubmitAssignmentMessageUseCaseTest.php` | Multiple | **Verify** |

*Note: Test framework seems largely missing compared to rich coverage in other domains like Courses. Coverage is dangerously slight.*

---

## 8. Known Issues & Gaps

| # | Issue | Severity Guess | Notes |
|---|---|---|---|
| 1 | Missing `tenant_id` on `assignment_messages` | **Critical** | `assignment_messages` relies on nested relation scoping to avoid cross-tenant leaks. Natively missing the isolation column. |
| 2 | Missing capability middleware | **High** | The routes lack explicit capability enforcement gates (`tenant.capability:assignment.create`). |
| 3 | Audit Logging Inside Transaction | **Medium** | Audit context triggers inside DB transaction context for module UseCases. Should execute post-commit. |
| 4 | Missing Idempotency Key Lock | **Medium** | Endpoints producing new assignments do not safely isolate sequential repetitive commits. |
| 5 | Missing soft deletes on submissions | **Low** | Only assignments have soft delete support. |

---

## 9. Dependencies on Other Features

| Depends On | How |
|---|---|
| Course / Chapter Hierarchy | Assignments map strictly to a `course_id` and `chapter_id`. |

---

## 10. File Tree (Backend Only)

```
app/
├── Http/Controllers/Api/TenantAdminDashboard/Assignment/
│   ├── AssignmentReadController.php
│   ├── AssignmentWriteController.php
│   ├── AssignmentSubmissionReadController.php
│   └── AssignmentSubmissionWriteController.php
├── Application/TenantAdminDashboard/Assignment/
│   ├── Commands/
│   │   ├── CreateAssignmentCommand.php
│   │   └── SubmitAssignmentMessageCommand.php
│   ├── UseCases/
│   │   ├── CreateAssignmentUseCase.php
│   │   └── SubmitAssignmentMessageUseCase.php
│   └── Queries/
│       ├── GetAssignmentQuery.php
│       ├── ListAssignmentSubmissionsQuery.php
│       └── ListChapterAssignmentsQuery.php
├── Domain/TenantAdminDashboard/Assignment/
│   ├── Entities/
│   │   ├── AssignmentEntity.php
│   │   ├── AssignmentSubmissionEntity.php
│   │   └── AssignmentMessageEntity.php
│   ├── Repositories/
│   │   ├── AssignmentRepositoryInterface.php
│   │   └── AssignmentSubmissionRepositoryInterface.php
│   └── ValueObjects/
├── Infrastructure/Persistence/TenantAdminDashboard/Assignment/
│   ├── AssignmentRecord.php
│   ├── AssignmentSubmissionRecord.php
│   ├── AssignmentMessageRecord.php
│   ├── EloquentAssignmentRepository.php
│   └── EloquentAssignmentSubmissionRepository.php
└── routes/tenant_dashboard/assignment.php
```

---

> **Reminder:** This report is input for the Principal Engineer audit. Incomplete or inaccurate information here means the audit will miss real issues or flag false positives. When in doubt, check the actual code — do not guess.
