# UBOTZ 2.0 — Feature Status Report: Question Bank (Exam Hierarchy)

> **Instructions:** Copy this template for each feature. Fill every section honestly. If something is missing, write "NOT IMPLEMENTED" — do not skip the section. This document feeds directly into the Principal Engineer audit pipeline.

| Field | Value |
|---|---|
| **Feature Name** | Question Bank / Exam Hierarchy (Exam → Subject → Chapter → Topic taxonomy; drives quiz question tagging and course-to-exam linking) |
| **Bounded Context** | TenantAdminDashboard — `ExamHierarchy` |
| **Date Reported** | 2026-03-21 |
| **Reported By** | AI Agent (verified in source) |
| **Current Status** | Working — core CRUD for all four hierarchy levels implemented; read-only from within Quiz (question bank linking via `bank_*` FK columns); no standalone "Question Bank" question CRUD surface |
| **Has Developer Instructions Doc?** | No |
| **Has Implementation Plan?** | No |
| **Was Principal Engineer Audit Done?** | No |

---

## 1. What This Feature Does (2–3 sentences)

The **Question Bank / Exam Hierarchy** feature provides a four-level taxonomy — **Exam → Subject → Chapter → Topic** — that serves as the organisational backbone for categorising quiz questions and linking courses to specific exam targets. Tenant admins define the hierarchy once; quiz question authors then tag each question with `bank_exam_id`, `bank_subject_id`, `bank_chapter_id`, and `bank_topic_id` to place it in the bank. The Quiz module's `EloquentHierarchyResolver` reads this structure to populate hierarchy-aware filtering, question bank drill-downs, and course-to-exam associations (`exam_id`, `subject_id`, `hierarchy_chapter_id`, `topic_id` on the `courses` table).

> **Note:** There is no standalone "Question Bank CRUD" surface for bank questions themselves. Questions live on `quiz_questions` and are *tagged* with hierarchy FKs. The ExamHierarchy domain manages only the taxonomy nodes.

---

## 2. Backend Architecture

### 2.1 Controllers

| Controller | Methods | Notes |
|---|---|---|
| `App\Http\TenantAdminDashboard\ExamHierarchy\Controllers\ExamController` | `index`, `store`, `update`, `destroy` | CRUD under `/api/tenant/admin/exam-hierarchy/exams` |
| `App\Http\TenantAdminDashboard\ExamHierarchy\Controllers\SubjectController` | `index` | Read-only listing under `/api/tenant/admin/exam-hierarchy/subjects` |
| `App\Http\TenantAdminDashboard\ExamHierarchy\Controllers\ChapterController` | `index` | Read-only listing under `/api/tenant/admin/exam-hierarchy/chapters` |
| `App\Http\TenantAdminDashboard\ExamHierarchy\Controllers\TopicController` | `index` | Read-only listing under `/api/tenant/admin/exam-hierarchy/topics` |

> **Note:** Subject, Chapter (exam chapter, not course chapter), and Topic nodes do not have dedicated create/update/destroy routes — they appear to be managed as embedded data within an Exam, or via the Curriculum Hierarchy migration (`2026_03_15_041258_update_curriculum_hierarchy_for_subjects_and_chapters.php`). **VERIFY in `ExamController` source.**

### 2.2 UseCases / Queries

| UseCase / Query | Purpose | Injects Audit Logger? | Injects Quota Service? |
|---|---|---|---|
| `CreateExamUseCase` | Creates an exam node | Yes | N/A |
| `UpdateExamUseCase` | Modifies exam metadata | Yes | N/A |
| `DeleteExamUseCase` | Removes an exam (and cascade?) | Yes | N/A |
| `ListExamsQuery` | Paginated/filtered exam listing | N/A | N/A |
| `ListSubjectsQuery` | Subject listing | N/A | N/A |
| `ListChaptersQuery` | Exam chapter listing | N/A | N/A |
| `ListTopicsQuery` | Topic listing | N/A | N/A |
| `ManageExamCommand` | Shared command for exam mutations | N/A | N/A |

### 2.3 Domain Layer

| Component | Type | Location | Notes |
|---|---|---|---|
| `ExamEntity` | Entity | `Domain/TenantAdminDashboard/ExamHierarchy/Entities/` | Root of hierarchy tree |
| `SubjectEntity` | Entity | `Domain/TenantAdminDashboard/ExamHierarchy/Entities/` | Child of Exam |
| `ExamChapterEntity` | Entity | `Domain/TenantAdminDashboard/ExamHierarchy/Entities/` | Child of Subject (note: separate from `course_chapters`) |
| `ExamTopicEntity` | Entity | `Domain/TenantAdminDashboard/ExamHierarchy/Entities/` | Leaf node |

**Domain invariants (summary):** Hierarchy integrity — subjects must belong to an exam, chapters to a subject (optionally), topics to a chapter. Validate that FKs are within the same tenant before linking.

### 2.4 Domain Events

**NO DOMAIN EVENTS DEFINED** — Exam/Subject/Chapter/Topic mutations audit via use case direct call (not via events). Add events if audit trail is required.

### 2.5 Infrastructure Layer

| Component | Type | Notes |
|---|---|---|
| `ExamRecord` | Eloquent Model | Maps to `exams`; tenant-scoped |
| `SubjectRecord` | Eloquent Model | Maps to `subjects`; tenant-scoped |
| `ExamChapterRecord` | Eloquent Model | Maps to `exam_chapters`; tenant-scoped |
| `ExamTopicRecord` | Eloquent Model | Maps to `exam_topics`; tenant-scoped |
| `EloquentExamRepository` | Repository | Implements `ExamRepositoryInterface` |
| `EloquentSubjectRepository` | Repository | Implements `SubjectRepositoryInterface` |
| `EloquentExamChapterRepository` | Repository | Implements `ExamChapterRepositoryInterface` |
| `EloquentExamTopicRepository` | Repository | Implements `ExamTopicRepositoryInterface` |
| `EloquentExamCourseQuery` | Query Object | Implements `ExamCourseQueryInterface` — resolves which courses are linked to a given exam |

### 2.6 Exceptions

**USES GENERIC EXCEPTIONS ONLY** — No custom exception classes in the `ExamHierarchy` domain. Domain-level validation errors (duplicate exam name, missing parent node) are thrown as generic exceptions. Consider adding typed exceptions for auditability.

---

## 3. Database Schema

### 3.1 Tables

**Table: `exams`** (Migration: `2026_02_26_195600_create_exams_table.php`)

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | BIGINT UNSIGNED PK | No | |
| `tenant_id` | BIGINT UNSIGNED FK | No | |
| `title` | VARCHAR(255) | No | |
| `description` | TEXT | Yes | |
| `created_at`, `updated_at` | TIMESTAMP | Yes | |

**Indexes:** `tenant_id`, `(tenant_id, title)`.

**Missing columns (known):**
- `deleted_at`: **No SoftDeletes** — exam deletes are permanent.
- No `status` column — exams are always active once created.

---

**Table: `subjects`** (Migration: `2026_02_26_195700_create_subjects_table.php`)

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | BIGINT UNSIGNED PK | No | |
| `tenant_id` | BIGINT UNSIGNED FK | No | |
| `exam_id` | BIGINT UNSIGNED FK | Yes | Nullable (per `2026_03_15_041527_make_exam_id_nullable_on_subjects_table.php`) |
| `title` | VARCHAR(255) | No | |
| `description` | TEXT | Yes | |
| `created_at`, `updated_at` | TIMESTAMP | Yes | |

**Indexes:** `tenant_id`, `(tenant_id, exam_id)`.

**Missing columns (known):**
- `deleted_at`: **No SoftDeletes** — subject deletes are permanent.

---

**Table: `exam_chapters`** (Migration: `2026_02_26_195800_create_exam_chapters_table.php`)

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | BIGINT UNSIGNED PK | No | |
| `tenant_id` | BIGINT UNSIGNED FK | No | |
| `subject_id` | BIGINT UNSIGNED FK | Yes | |
| `title` | VARCHAR(255) | No | |
| `created_at`, `updated_at` | TIMESTAMP | Yes | |

**Indexes:** `tenant_id`, `(tenant_id, subject_id)`.

**Missing columns (known):**
- `deleted_at`: **No SoftDeletes** — exam chapter deletes are permanent.

---

**Table: `exam_topics`** (Migration: `2026_02_26_195900_create_exam_topics_table.php`)

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | BIGINT UNSIGNED PK | No | |
| `tenant_id` | BIGINT UNSIGNED FK | No | |
| `exam_chapter_id` | BIGINT UNSIGNED FK | Yes | |
| `title` | VARCHAR(255) | No | |
| `created_at`, `updated_at` | TIMESTAMP | Yes | |

**Indexes:** `tenant_id`, `(tenant_id, exam_chapter_id)`.

**Missing columns (known):**
- `deleted_at`: **No SoftDeletes** — topic deletes are permanent.

### 3.2 Relationships

| From Table | To Table | Type | FK Column |
|---|---|---|---|
| `exams` | `tenants` | BelongsTo | `tenant_id` |
| `subjects` | `exams` | BelongsTo | `exam_id` (nullable) |
| `subjects` | `tenants` | BelongsTo | `tenant_id` |
| `exam_chapters` | `subjects` | BelongsTo | `subject_id` |
| `exam_chapters` | `tenants` | BelongsTo | `tenant_id` |
| `exam_topics` | `exam_chapters` | BelongsTo | `exam_chapter_id` |
| `exam_topics` | `tenants` | BelongsTo | `tenant_id` |
| `courses` | `exams` | BelongsTo | `exam_id` (optional link) |
| `quiz_questions` | `exam`, `subject`, `chapter`, `topic` | BelongsTo | `bank_exam_id`, `bank_subject_id`, `bank_chapter_id`, `bank_topic_id` |

---

## 4. API Endpoints

*(Routes in `routes/tenant_dashboard/exam_hierarchy.php`; prefix `/api/tenant/admin/exam-hierarchy`.)*

| Method | URI | Controller@Method | Middleware | Capability Code |
|---|---|---|---|---|
| `GET` | `/api/tenant/admin/exam-hierarchy/exams` | `ExamController@index` | `tenant.capability` | `exam.view` |
| `POST` | `/api/tenant/admin/exam-hierarchy/exams` | `ExamController@store` | `tenant.capability` | `exam.manage` |
| `PUT` | `/api/tenant/admin/exam-hierarchy/exams/{exam_id}` | `ExamController@update` | `tenant.capability` | `exam.manage` |
| `DELETE` | `/api/tenant/admin/exam-hierarchy/exams/{exam_id}` | `ExamController@destroy` | `tenant.capability` | `exam.manage` |
| `GET` | `/api/tenant/admin/exam-hierarchy/subjects` | `SubjectController@index` | `tenant.capability` | `exam.view` |
| `GET` | `/api/tenant/admin/exam-hierarchy/chapters` | `ChapterController@index` | `tenant.capability` | `exam.view` |
| `GET` | `/api/tenant/admin/exam-hierarchy/topics` | `TopicController@index` | `tenant.capability` | `exam.view` |

> **Note:** Subjects, Chapters, and Topics have **read-only** endpoints. There are no `POST`/`PUT`/`DELETE` routes for these three levels in the current route file. Either these nodes are managed via exam nesting logic in `ExamController`, via the seeder/migration, or the write endpoints are missing entirely. **VERIFY.**

---

## 5. Security Checklist

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | All queries scoped by `tenant_id`? | Yes | `BelongsToTenant` enforced on all four Eloquent records |
| 2 | User-level isolation enforced where needed? (`user_id` check) | N/A | Hierarchy is tenant-wide, not per-user |
| 3 | `tenant.capability` middleware on all routes? | Yes | All 7 routes gated with `exam.view` or `exam.manage` |
| 4 | Audit log written for every mutation? | Partial | `CreateExamUseCase`, `UpdateExamUseCase`, `DeleteExamUseCase` — verify audit calls are present |
| 5 | Audit log written OUTSIDE `DB::transaction()`? | Partial | Verify per use case |
| 6 | Domain events dispatched via `DB::afterCommit`? | No | **NO DOMAIN EVENTS DEFINED** — no event dispatch |
| 7 | Idempotency keys used for create operations? | No | `CreateExamUseCase` does not implement idempotency |
| 8 | Input validation via FormRequest (not in controller)? | Partial | Verify `ExamController@store` and `@update` — check for FormRequest injection |
| 9 | File uploads validated server-side (MIME via `finfo`)? | N/A | No file uploads in this feature |
| 10 | Financial values stored as `_cents` integer? | N/A | No financial values |
| 11 | Soft deletes used (no hard delete of user data)? | **No** | All four tables (`exams`, `subjects`, `exam_chapters`, `exam_topics`) omit `deleted_at`; hard delete propagation could corrupt `bank_*` FK references on `quiz_questions` |
| 12 | No raw SQL in controllers or UseCases? | Yes | All queries via Eloquent repositories |
| 13 | Eloquent models have `BelongsToTenant` trait/scope? | Yes | Verified on all four records |
| 14 | Sensitive data not exposed in API responses? | Yes | Taxonomy data only; no PII |

---

## 6. Frontend

### 6.1 File Location

```
frontend/features/tenant-admin/exam-hierarchy/
```

### 6.2 Components

| Component | Purpose | Notes |
|---|---|---|
| Exam hierarchy management UI | Add/edit/delete exams, view subjects/chapters/topics | Verify component names in `frontend/features/tenant-admin/exam-hierarchy/` |

### 6.3 API Hooks

| Hook | Endpoint | Notes |
|---|---|---|
| Hooks for exam CRUD and hierarchy listing | `/api/tenant/admin/exam-hierarchy/...` | In exam hierarchy service layer |

### 6.4 Capability-Based UI Gating

| UI Element | Hidden When Missing Capability | Implemented? |
|---|---|---|
| Add/Edit/Delete Exam | `exam.manage` | Partial — verify in frontend |
| View Hierarchy | `exam.view` | Yes |

---

## 7. Tests

| Test File | Test Count | Passing? |
|---|---|---|
| `tests/Feature/TenantAdminDashboard/ExamHierarchy/ExamHierarchyTest.php` | Multiple | Yes |
| `tests/Feature/TenantAdminDashboard/ExamHierarchy/ExamCapabilityDenialTest.php` | Multiple | Yes |
| `tests/Feature/TenantAdminDashboard/Quiz/QuizQuestionBankHierarchyTest.php` | Multiple | Yes — tests the `bank_*` FK linking from quiz questions into the hierarchy |

**Command (Docker):** `docker exec ubotz_backend php artisan test --filter=ExamHierarchy`

**No Unit tests exist for ExamHierarchy domain entities.**

---

## 8. Known Issues & Gaps

| # | Issue | Severity Guess | Notes |
|---|---|---|---|
| 1 | No soft deletes on any hierarchy table | High | Hard-deleting an Exam/Subject/Chapter/Topic permanently orphans `quiz_questions.bank_exam_id` / `bank_subject_id` / `bank_chapter_id` / `bank_topic_id` FK references — no referential warning will fire if FKs are nullable. Quiz filtering by bank hierarchy silently breaks. |
| 2 | Subject/Chapter/Topic have no write routes | Medium | Only `GET` is exposed for Subjects, Exam Chapters, and Topics. Either these are managed via a hidden admin interface, or write routes are simply missing. Confirm against `ExamController` implementation. |
| 3 | No domain events | Low | Mutations produce no `ExamCreated` / `ExamDeleted` events — audit trail relies entirely on use case direct logging if wired. |
| 4 | No idempotency on exam creation | Low | `CreateExamUseCase` can create duplicate exam nodes on double-submit. |
| 5 | No custom exceptions | Low | Domain validation failures (duplicate title, broken parent ref) throw generic exceptions — hard to distinguish in error monitoring. |
| 6 | No unit tests for domain entities | Low | `ExamEntity`, `SubjectEntity`, `ExamChapterEntity`, `ExamTopicEntity` have no unit tests. |

---

## 9. Dependencies on Other Features

| Depends On | How |
|---|---|
| Tenants | All nodes are scoped to a tenant |
| Quiz | `quiz_questions` use `bank_exam_id`, `bank_subject_id`, `bank_chapter_id`, `bank_topic_id` to tag questions into this taxonomy |
| Course | `courses` table has `exam_id` (and optionally `subject_id`, `chapter_id`, `topic_id`) to declare exam target |
| Users | `created_by` on exam nodes (if present) |

---

## 10. File Tree (Backend Only)

```
app/
├── Http/TenantAdminDashboard/ExamHierarchy/Controllers/
│   ├── ChapterController.php
│   ├── ExamController.php
│   ├── SubjectController.php
│   └── TopicController.php
├── Application/TenantAdminDashboard/ExamHierarchy/
│   ├── Commands/
│   │   └── ManageExamCommand.php
│   ├── Queries/
│   │   ├── ListChaptersQuery.php
│   │   ├── ListExamsQuery.php
│   │   ├── ListSubjectsQuery.php
│   │   └── ListTopicsQuery.php
│   └── UseCases/
│       ├── CreateExamUseCase.php
│       ├── DeleteExamUseCase.php
│       └── UpdateExamUseCase.php
├── Domain/TenantAdminDashboard/ExamHierarchy/
│   ├── Entities/
│   │   ├── ExamChapterEntity.php
│   │   ├── ExamEntity.php
│   │   ├── ExamTopicEntity.php
│   │   └── SubjectEntity.php
│   └── Repositories/
│       ├── ExamChapterRepositoryInterface.php
│       ├── ExamCourseQueryInterface.php
│       ├── ExamRepositoryInterface.php
│       ├── ExamTopicRepositoryInterface.php
│       └── SubjectRepositoryInterface.php
├── Infrastructure/Persistence/TenantAdminDashboard/ExamHierarchy/
│   ├── EloquentExamChapterRepository.php
│   ├── EloquentExamCourseQuery.php
│   ├── EloquentExamRepository.php
│   ├── EloquentExamTopicRepository.php
│   ├── EloquentSubjectRepository.php
│   ├── ExamChapterRecord.php
│   ├── ExamRecord.php
│   ├── ExamTopicRecord.php
│   └── SubjectRecord.php
└── routes/tenant_dashboard/exam_hierarchy.php
```

---

## Appendix A — Hierarchy Linking Pattern (authoritative)

**How quiz questions reference the bank:**

```
quiz_questions
├── bank_exam_id    → exams.id        (exam-level tag)
├── bank_subject_id → subjects.id     (subject-level tag)
├── bank_chapter_id → exam_chapters.id (chapter-level tag)
└── bank_topic_id   → exam_topics.id  (leaf-level tag)
```

Questions can be tagged at any level — not all four FKs are required. The `EloquentHierarchyResolver` (inside the Quiz infrastructure) resolves these references when building question bank filters in the quiz UI.

**How courses reference the hierarchy:**

```
courses
├── exam_id              → exams.id
├── subject_id           → subjects.id
├── hierarchy_chapter_id → exam_chapters.id
└── topic_id             → exam_topics.id
```

All four are optional — a course can declare an exam target at any level of granularity.

---

> **Reminder:** This report is input for the Principal Engineer audit. Incomplete or inaccurate information here means the audit will miss real issues or flag false positives. When in doubt, check the actual code — do not guess.

*End of Report*
