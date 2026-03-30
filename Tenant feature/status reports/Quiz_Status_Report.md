# UBOTZ 2.0 — Feature Status Report: Quiz

> **Instructions:** Copy this template for each feature. Fill every section honestly. If something is missing, write "NOT IMPLEMENTED" — do not skip the section. This document feeds directly into the Principal Engineer audit pipeline.

| Field | Value |
|---|---|
| **Feature Name** | Quiz (quiz catalog, question authoring, CBT mode, student attempts, grading, rewards integration) |
| **Bounded Context** | TenantAdminDashboard |
| **Date Reported** | 2026-03-21 |
| **Reported By** | AI Agent (verified in source) |
| **Current Status** | Working — full lifecycle implemented; missing soft deletes and idempotency on create |
| **Has Developer Instructions Doc?** | No |
| **Has Implementation Plan?** | No |
| **Was Principal Engineer Audit Done?** | No |

---

## 1. What This Feature Does (2–3 sentences)

The **Quiz** feature allows tenant administrators and instructors to build assessments (practice quizzes, mock tests, exam papers) with advanced configurations including CBT mode, negative marking, section structures, time limits, and attempt restrictions. It handles the full examination lifecycle from question authoring (MCQ + descriptive) and ordering through to student attempt tracking, automatic/manual grading, and integration with the Rewards domain to award points when a student passes.

---

## 2. Backend Architecture

### 2.1 Controllers

| Controller | Methods | Notes |
|---|---|---|
| `App\Http\Controllers\Api\TenantAdminDashboard\Quiz\QuizReadController` | `index`, `show`, `stats` | Listings, details, reporting metrics |
| `App\Http\Controllers\Api\TenantAdminDashboard\Quiz\QuizWriteController` | `store`, `update`, `status`, `duplicate`, `archive` | Core quiz lifecycle mutations |
| `App\Http\Controllers\Api\TenantAdminDashboard\Quiz\QuizQuestionWriteController` | `store`, `update`, `destroy`, `reorder` | CRUD and ordering for nested questions |
| `App\Http\Controllers\Api\TenantAdminDashboard\Quiz\QuizResultController` | `index`, `show`, `grade` | Student attempt results and manual grading |

### 2.2 UseCases / Queries

| UseCase / Query | Purpose | Injects Audit Logger? | Injects Quota Service? |
|---|---|---|---|
| `CreateQuizUseCase` | Create a quiz (validates sections config, hierarchy) | Yes (via Events) | N/A |
| `UpdateQuizUseCase` | Update quiz metadata and config | Yes (via Events) | N/A |
| `ChangeQuizStatusUseCase` | State transitions (`draft`→`active`→`archived`) | Yes (via Events) | N/A |
| `ArchiveQuizUseCase` | Archive quiz | Yes (via Events) | N/A |
| `DuplicateQuizUseCase` | Deep-copy quiz and all questions | Yes (via Events) | N/A |
| `CreateQuizQuestionUseCase` | Add a question (validates MCQ options, media) | Yes (via Events) | N/A |
| `UpdateQuizQuestionUseCase` | Modify an existing question | Yes (via Events) | N/A |
| `DeleteQuizQuestionUseCase` | Remove a question | Yes (via Events) | N/A |
| `ReorderQuizQuestionsUseCase` | Change display order of questions | Yes (via Events) | N/A |
| `StartQuizAttemptUseCase` | Log a student into an active attempt | Yes (via Events) | N/A |
| `SubmitQuizAnswersUseCase` | Receive and store final/partial answer payloads | Yes (via Events) | N/A |
| `GradeQuizResultUseCase` | Score attempt (positive + negative marking config) | Yes (via Events) | N/A |
| `GetQuizQuery` | Fetch a single quiz | N/A | N/A |
| `GetQuizResultQuery` | Fetch a single result | N/A | N/A |
| `GetQuizStatsQuery` | Aggregate quiz metrics | N/A | N/A |
| `GetQuizWithQuestionsQuery` | Fetch quiz with full question tree | N/A | N/A |
| `ListQuizzesQuery` + `QuizListCriteria` | Paginated quiz listing with filters | N/A | N/A |
| `ListQuizResultsQuery` + `QuizResultListCriteria` | Paginated results listing with filters | N/A | N/A |

### 2.3 Domain Layer

| Component | Type | Location | Notes |
|---|---|---|---|
| `QuizEntity` | Entity | `Domain/TenantAdminDashboard/Quiz/Entities/` | Aggregate root; enforces section config, status transitions, activation requirements |
| `QuizQuestionEntity` | Entity | `Domain/TenantAdminDashboard/Quiz/Entities/` | Individual question with media and type rules |
| `QuizQuestionOptionEntity` | Entity | `Domain/TenantAdminDashboard/Quiz/Entities/` | MCQ option sub-entity |
| `QuizResultEntity` | Entity | `Domain/TenantAdminDashboard/Quiz/Entities/` | Student attempt with scoring |

**Domain invariants (summary):** MCQ options required (`McqOptionsRequiredException`); quiz must have questions and a pass mark before activation (`QuizActivationRequirementsNotMetException`); specific status rules enforced (`InvalidQuizStatusTransitionException`); hierarchy references validated (`InvalidHierarchyException`); sections JSON must be valid (`InvalidSectionConfigurationException`).

### 2.4 Domain Events

| Event Class | Trigger | Has Listener? |
|---|---|---|
| `QuizCreated` | After quiz persisted | Yes — audit |
| `QuizStatusChanged` | After status transition | Yes — audit |
| `QuizArchived` | After archive | Yes — audit |
| `QuizAttemptStarted` | Student begins an attempt | Yes — audit |
| `QuizAttemptSubmitted` | Student submits answers | Yes — audit |
| `QuizAttemptGraded` | Grading completes | Yes — `AwardPointsOnQuizPassed` listener |

### 2.5 Infrastructure Layer

| Component | Type | Notes |
|---|---|---|
| `QuizRecord` | Eloquent Model | Maps to `quizzes`; uses `BelongsToTenant`. **No SoftDeletes** |
| `QuizQuestionRecord` | Eloquent Model | Maps to `quiz_questions`; uses `BelongsToTenant`. **No SoftDeletes** |
| `QuizQuestionOptionRecord` | Eloquent Model | Maps to `quiz_question_options`; uses `BelongsToTenant`. **No SoftDeletes** |
| `QuizResultRecord` | Eloquent Model | Maps to `quiz_results`; uses `BelongsToTenant`. **No SoftDeletes** |
| `EloquentQuizRepository` | Repository | Implements `QuizRepositoryInterface` |
| `EloquentQuizQuestionRepository` | Repository | Implements `QuizQuestionRepositoryInterface` |
| `EloquentQuizQuestionOptionRepository` | Repository | Implements `QuizQuestionOptionRepositoryInterface` |
| `EloquentQuizResultRepository` | Repository | Implements `QuizResultRepositoryInterface` |
| `EloquentGetQuizResultQuery` | Query Object | Implements `GetQuizResultQuery` |
| `EloquentListQuizResultsQuery` | Query Object | Implements `ListQuizResultsQuery` |
| `EloquentQuizAggregateQuery` | Query Object | Implements `QuizAggregateQueryInterface` |
| `EloquentHierarchyResolver` | Query Object | Resolves exam hierarchy (exam→subject→chapter→topic) for quiz mapping |

### 2.6 Exceptions

| Exception Class | When Thrown |
|---|---|
| `CourseRequiredForPaidQuizException` | Premium quiz activated without a paid course attached |
| `InvalidHierarchyException` | Hierarchy refs (exam/subject/chapter/topic) are broken or inconsistent |
| `InvalidQuestionMediaException` | Media URL provided to a question doesn't match the question type rules |
| `InvalidQuizStatusTransitionException` | Illegal status state jump attempted |
| `InvalidSectionConfigurationException` | Sections JSON blob is structurally malformed |
| `McqOptionsRequiredException` | MCQ question saved without at least two options |
| `QuizActivationRequirementsNotMetException` | Activation attempted with 0 questions or no pass mark set |

---

## 3. Database Schema

### 3.1 Tables

**Table: `quizzes`** (Migration: `2026_03_03_000001_create_quizzes_table.php`)

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | BIGINT UNSIGNED PK | No | |
| `tenant_id` | BIGINT UNSIGNED FK | No | |
| `course_id` | BIGINT UNSIGNED FK | Yes | |
| `created_by` | BIGINT UNSIGNED | No | |
| `exam_id`, `subject_id`, `hierarchy_chapter_id`, `topic_id` | BIGINT UNSIGNED FK | Yes | Exam hierarchy references |
| `title` | VARCHAR(255) | No | |
| `quiz_type` | VARCHAR(20) | No | Default `practice_quiz` |
| `status` | VARCHAR(20) | No | Default `draft` |
| `access_level` | VARCHAR | No | |
| `is_free` | BOOLEAN | No | |
| `pass_mark` | DECIMAL(8,2) | No | Default `0.00` |
| `negative_marking`, `default_mcq_grade`, `total_mark` | DECIMAL | Yes | Scoring config |
| `time_minutes` | INT UNSIGNED | No | Default `0` |
| `max_attempts`, `expiry_days` | INT UNSIGNED | Yes | |
| `sections` | JSON | Yes | Section structure config |
| `enable_cbt_mode`, `enable_mark_for_review` | BOOLEAN | No | Default `false` |
| `enable_question_palette`, `show_section_summary` | BOOLEAN | No | |
| `display_limited_questions` | BOOLEAN | No | |
| `display_number_of_questions` | INT UNSIGNED | Yes | |
| `display_questions_randomly` | BOOLEAN | No | Default `false` |
| `certificate` | BOOLEAN | No | Indicates quiz awards a cert on pass |
| `created_at`, `updated_at` | TIMESTAMP | Yes | |

**Indexes:** `tenant_id`, `(tenant_id, status)`, `(tenant_id, quiz_type)`, `(tenant_id, course_id)`.

**Missing columns (known):**
- `deleted_at`: **No SoftDeletes** — quiz deletes are permanent.

---

**Table: `quiz_questions`** (Migration: `2026_03_03_000002_create_quiz_questions_table.php`)

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | BIGINT UNSIGNED PK | No | |
| `tenant_id` | BIGINT UNSIGNED FK | No | |
| `quiz_id` | BIGINT UNSIGNED FK | No | |
| `created_by` | BIGINT UNSIGNED | No | |
| `title` | TEXT | No | The question body |
| `type` | VARCHAR(20) | No | `multiple` or `descriptive` |
| `grade` | DECIMAL(6,2) | No | Points for correct answer |
| `correct_explanation` | TEXT | Yes | |
| `image_url`, `video_url`, `solution_image_url`, `solution_video_url` | VARCHAR(500) | Yes | Media refs |
| `section_key`, `difficulty_level` | VARCHAR | Yes | Grouping indexes |
| `bank_exam_id`, `bank_subject_id`, `bank_chapter_id`, `bank_topic_id` | BIGINT UNSIGNED | Yes | Links to global question bank |
| `sort_order` | INT UNSIGNED | No | |
| `created_at`, `updated_at` | TIMESTAMP | Yes | |

**Missing columns (known):**
- `deleted_at`: **No SoftDeletes** — question deletes are permanent.

---

**Table: `quiz_question_options`** (Migration: `2026_03_03_000003_create_quiz_question_options_table.php`)

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | BIGINT UNSIGNED PK | No | |
| `tenant_id` | BIGINT UNSIGNED FK | No | |
| `question_id` | BIGINT UNSIGNED FK | No | Points to `quiz_questions` |
| `created_by` | BIGINT UNSIGNED | No | |
| `title` | TEXT | No | Option text (A, B, C, D) |
| `is_correct` | BOOLEAN | No | Correct answer flag |
| `sort_order` | INT UNSIGNED | No | |
| `created_at`, `updated_at` | TIMESTAMP | Yes | |

**Missing columns (known):**
- `deleted_at`: **No SoftDeletes** — option deletes are permanent.

---

**Table: `quiz_results`** (Migration: `2026_03_08_034947_create_quiz_results_table.php`)

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | BIGINT UNSIGNED PK | No | |
| `tenant_id` | BIGINT UNSIGNED FK | No | |
| `quiz_id` | BIGINT UNSIGNED FK | No | |
| `user_id` | BIGINT UNSIGNED FK | No | The student who sat the test |
| `status` | VARCHAR(20) | No | `started`, `submitted`, `graded` |
| `started_at`, `submitted_at` | TIMESTAMP | Yes | |
| `time_taken_seconds` | INT UNSIGNED | No | |
| `total_score` | DECIMAL(10,2) | Yes | |
| `passed` | BOOLEAN | Yes | Met the pass_mark threshold |
| `responses` | JSON | Yes | Raw snapshot of student answers |
| `created_at`, `updated_at` | TIMESTAMP | Yes | |

**Missing columns (known):**
- `deleted_at`: **No SoftDeletes** — result records are permanently deleted.

### 3.2 Relationships

| From Table | To Table | Type | FK Column |
|---|---|---|---|
| `quizzes` | `tenants` | BelongsTo | `tenant_id` |
| `quizzes` | `courses` | BelongsTo | `course_id` |
| `quiz_questions` | `quizzes` | BelongsTo | `quiz_id` |
| `quiz_questions` | `tenants` | BelongsTo | `tenant_id` |
| `quiz_question_options` | `quiz_questions` | BelongsTo | `question_id` |
| `quiz_question_options` | `tenants` | BelongsTo | `tenant_id` |
| `quiz_results` | `quizzes` | BelongsTo | `quiz_id` |
| `quiz_results` | `users` | BelongsTo | `user_id` |
| `quiz_results` | `tenants` | BelongsTo | `tenant_id` |

---

## 4. API Endpoints

*(Routes in `routes/tenant_dashboard/quiz.php`; all under `tenant.module:module.lms` + individual capability gates.)*

| Method | URI | Controller@Method | Middleware | Capability Code |
|---|---|---|---|---|
| `GET` | `/api/tenant/quizzes` | `QuizReadController@index` | `tenant.module` + `tenant.capability` | `quiz.view` |
| `GET` | `/api/tenant/quizzes/stats` | `QuizReadController@stats` | same | `quiz.view` |
| `GET` | `/api/tenant/quizzes/{quizId}` | `QuizReadController@show` | same | `quiz.view` |
| `POST` | `/api/tenant/quizzes` | `QuizWriteController@store` | `tenant.module` | `quiz.create` |
| `PUT` | `/api/tenant/quizzes/{quizId}` | `QuizWriteController@update` | same | `quiz.edit` |
| `PATCH` | `/api/tenant/quizzes/{quizId}/status` | `QuizWriteController@status` | same | `quiz.publish` |
| `POST` | `/api/tenant/quizzes/{quizId}/duplicate` | `QuizWriteController@duplicate` | same | `quiz.create` |
| `DELETE` | `/api/tenant/quizzes/{quizId}` | `QuizWriteController@archive` | same | `quiz.archive` |
| `POST` | `/api/tenant/quizzes/{quizId}/questions` | `QuizQuestionWriteController@store` | same | `quiz.edit` |
| `PUT` | `/api/tenant/quizzes/{quizId}/questions/{questionId}` | `QuizQuestionWriteController@update` | same | `quiz.edit` |
| `DELETE` | `/api/tenant/quizzes/{quizId}/questions/{questionId}` | `QuizQuestionWriteController@destroy` | same | `quiz.edit` |
| `POST` | `/api/tenant/quizzes/{quizId}/questions/reorder` | `QuizQuestionWriteController@reorder` | same | `quiz.edit` |
| `GET` | `/api/tenant/quizzes/{quizId}/results` | `QuizResultController@index` | same | `quiz.view` |
| `GET` | `/api/tenant/quizzes/{quizId}/results/{resultId}` | `QuizResultController@show` | same | `quiz.view` |
| `POST` | `/api/tenant/quizzes/{quizId}/results/{resultId}/grade` | `QuizResultController@grade` | same | `quiz.edit` |

---

## 5. Security Checklist

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | All queries scoped by `tenant_id`? | Yes | `BelongsToTenant` trait enforced on all four Eloquent records |
| 2 | User-level isolation enforced where needed? (`user_id` check) | Yes | `quiz_results` scoped via `user_id`; teacher/admin access checked via capability middleware |
| 3 | `tenant.capability` middleware on all routes? | Yes | All 15 endpoints have explicit capability codes |
| 4 | Audit log written for every mutation? | Yes | All write use cases dispatch Domain Events that trigger audit |
| 5 | Audit log written OUTSIDE `DB::transaction()`? | Yes | Events dispatched post-transaction commit |
| 6 | Domain events dispatched via `DB::afterCommit`? | Yes | |
| 7 | Idempotency keys used for create operations? | **No** | `QuizWriteController@store` does not accept or apply an idempotency key — double-click will create duplicate quizzes |
| 8 | Input validation via FormRequest (not in controller)? | Yes | `CreateQuizRequest`, `UpdateQuizRequest`, `ChangeQuizStatusRequest` used |
| 9 | File uploads validated server-side (MIME via `finfo`)? | N/A | No file uploads in Core Quiz; media is URL-based |
| 10 | Financial values stored as `_cents` integer? | N/A | Quiz pricing determined by Course |
| 11 | Soft deletes used (no hard delete of user data)? | **No** | All four tables (`quizzes`, `quiz_questions`, `quiz_question_options`, `quiz_results`) omit `deleted_at` — all deletes are permanent. Student result records can be lost irreversibly. |
| 12 | No raw SQL in controllers or UseCases? | Yes | All queries via Eloquent repositories |
| 13 | Eloquent models have `BelongsToTenant` trait/scope? | Yes | Verified on all four records |
| 14 | Sensitive data not exposed in API responses? | Yes | Answer data hidden during in-progress attempts |

---

## 6. Frontend

### 6.1 File Location

```
frontend/features/tenant-admin/quizzes/
frontend/features/tenant-admin/courses/components/
```

### 6.2 Components

| Component | Purpose | Notes |
|---|---|---|
| `quiz-list-page.tsx` | Main quiz listing and orchestrator | Under `frontend/features/tenant-admin/quizzes/components/` |
| `quiz-manager.tsx` | Chapter-level quiz configuration | Under `frontend/features/tenant-admin/courses/components/` — embedded inside chapter items |

### 6.3 API Hooks

| Hook | Endpoint | Notes |
|---|---|---|
| hooks for quiz CRUD | `/api/tenant/quizzes...` | In quiz service layer |

### 6.4 Capability-Based UI Gating

| UI Element | Hidden When Missing Capability | Implemented? |
|---|---|---|
| Create Quiz button | `quiz.create` | Yes |
| Edit Quiz button | `quiz.edit` | Yes |
| Archive/Delete Quiz button | `quiz.archive` | Yes |

---

## 7. Tests

| Test File | Test Count | Passing? |
|---|---|---|
| `tests/Feature/TenantAdminDashboard/Quiz/QuizCrudTest.php` | Multiple | Yes |
| `tests/Feature/TenantAdminDashboard/Quiz/QuizFeatureTest.php` | Multiple | Yes (large test file — comprehensive) |
| `tests/Feature/TenantAdminDashboard/Quiz/QuizFilteringTest.php` | Multiple | Yes |
| `tests/Feature/TenantAdminDashboard/Quiz/QuizQuestionBankHierarchyTest.php` | Multiple | Yes |
| `tests/Feature/TenantAdminDashboard/Quiz/QuizQuestionCrudTest.php` | Multiple | Yes |
| `tests/Feature/TenantAdminDashboard/Quiz/QuizResultTest.php` | Multiple | Yes |
| `tests/Feature/TenantAdminDashboard/Quiz/QuizStatsTest.php` | Multiple | Yes |
| `tests/Unit/TenantAdminDashboard/Quiz/Entities/QuizEntityTest.php` | Multiple | Yes |
| `tests/Unit/TenantAdminDashboard/Quiz/Entities/QuizQuestionEntityTest.php` | Multiple | Yes |
| `tests/Unit/TenantAdminDashboard/Quiz/Entities/QuizQuestionEntityBankHierarchyTest.php` | Multiple | Yes |

**Command (Docker):** `docker exec ubotz_backend php artisan test --filter=Quiz`

---

## 8. Known Issues & Gaps

| # | Issue | Severity Guess | Notes |
|---|---|---|---|
| 1 | No soft deletes on any Quiz table | High | Deleting a quiz, question, option, or result is permanent. Student exam result records can be destroyed irreversibly. All four tables need `deleted_at` migration and `SoftDeletes` on the Eloquent models. |
| 2 | No idempotency on quiz creation | Low | `QuizWriteController@store` does not use an idempotency key. Double-submission creates duplicate quizzes. |
| 3 | No Developer Instructions Doc | Low | No `QUIZ_DEVELOPER_INSTRUCTIONS.md` exists — feature relies entirely on code as documentation. |

---

## 9. Dependencies on Other Features

| Depends On | How |
|---|---|
| Course | `course_id` FK on `quizzes`; premium quiz activation requires a paid course |
| Exam Hierarchy | `exam_id`, `subject_id`, `hierarchy_chapter_id`, `topic_id` on `quizzes` and `bank_*` columns on `quiz_questions` |
| Rewards | `QuizAttemptGraded` event triggers `AwardPointsOnQuizPassed` listener |
| Certificate | `certificate` flag on a quiz — `IssueCertificateUseCase` triggered on pass |
| Users | `created_by` on quizzes/questions; `user_id` on results |

---

## 10. File Tree (Backend Only)

```
app/
├── Http/Controllers/Api/TenantAdminDashboard/Quiz/
│   ├── QuizReadController.php
│   ├── QuizWriteController.php
│   ├── QuizQuestionWriteController.php
│   └── QuizResultController.php
├── Application/TenantAdminDashboard/Quiz/
│   ├── Commands/
│   │   ├── ArchiveQuizCommand.php
│   │   ├── ChangeQuizStatusCommand.php
│   │   ├── CreateQuizCommand.php
│   │   ├── CreateQuizQuestionCommand.php
│   │   ├── DeleteQuizQuestionCommand.php
│   │   ├── DuplicateQuizCommand.php
│   │   ├── GradeQuizResultCommand.php
│   │   ├── ReorderQuizQuestionsCommand.php
│   │   ├── StartQuizAttemptCommand.php
│   │   ├── SubmitQuizAnswersCommand.php
│   │   ├── UpdateQuizCommand.php
│   │   └── UpdateQuizQuestionCommand.php
│   ├── Queries/
│   │   ├── GetQuizQuery.php
│   │   ├── GetQuizResultQuery.php
│   │   ├── GetQuizStatsQuery.php
│   │   ├── GetQuizWithQuestionsQuery.php
│   │   ├── ListQuizResultsQuery.php
│   │   ├── ListQuizzesQuery.php
│   │   ├── QuizListCriteria.php
│   │   └── QuizResultListCriteria.php
│   └── UseCases/
│       ├── ArchiveQuizUseCase.php
│       ├── ChangeQuizStatusUseCase.php
│       ├── CreateQuizQuestionUseCase.php
│       ├── CreateQuizUseCase.php
│       ├── DeleteQuizQuestionUseCase.php
│       ├── DuplicateQuizUseCase.php
│       ├── GradeQuizResultUseCase.php
│       ├── ReorderQuizQuestionsUseCase.php
│       ├── StartQuizAttemptUseCase.php
│       ├── SubmitQuizAnswersUseCase.php
│       ├── UpdateQuizQuestionUseCase.php
│       └── UpdateQuizUseCase.php
├── Domain/TenantAdminDashboard/Quiz/
│   ├── Entities/
│   │   ├── QuizEntity.php
│   │   ├── QuizQuestionEntity.php
│   │   ├── QuizQuestionOptionEntity.php
│   │   └── QuizResultEntity.php
│   ├── Events/
│   │   ├── QuizArchived.php
│   │   ├── QuizAttemptGraded.php
│   │   ├── QuizAttemptStarted.php
│   │   ├── QuizAttemptSubmitted.php
│   │   ├── QuizCreated.php
│   │   └── QuizStatusChanged.php
│   ├── Exceptions/
│   │   ├── CourseRequiredForPaidQuizException.php
│   │   ├── InvalidHierarchyException.php
│   │   ├── InvalidQuestionMediaException.php
│   │   ├── InvalidQuizStatusTransitionException.php
│   │   ├── InvalidSectionConfigurationException.php
│   │   ├── McqOptionsRequiredException.php
│   │   └── QuizActivationRequirementsNotMetException.php
│   └── Repositories/
│       ├── QuizAggregateQueryInterface.php
│       ├── QuizQuestionOptionRepositoryInterface.php
│       ├── QuizQuestionRepositoryInterface.php
│       ├── QuizRepositoryInterface.php
│       └── QuizResultRepositoryInterface.php
├── Infrastructure/Persistence/TenantAdminDashboard/Quiz/
│   ├── EloquentGetQuizResultQuery.php
│   ├── EloquentHierarchyResolver.php
│   ├── EloquentListQuizResultsQuery.php
│   ├── EloquentQuizAggregateQuery.php
│   ├── EloquentQuizQuestionOptionRepository.php
│   ├── EloquentQuizQuestionRepository.php
│   ├── EloquentQuizRepository.php
│   ├── EloquentQuizResultRepository.php
│   ├── QuizQuestionOptionRecord.php
│   ├── QuizQuestionRecord.php
│   ├── QuizRecord.php
│   └── QuizResultRecord.php
└── routes/tenant_dashboard/quiz.php
```

---

> **Reminder:** This report is input for the Principal Engineer audit. Incomplete or inaccurate information here means the audit will miss real issues or flag false positives. When in doubt, check the actual code — do not guess.

*End of Report*
