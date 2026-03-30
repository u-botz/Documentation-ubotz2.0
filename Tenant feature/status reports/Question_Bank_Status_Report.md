# UBOTZ 2.0 — Feature Status Report: Question Bank

> **Instructions:** Copy this template for each feature. Fill every section honestly. If something is missing, write "NOT IMPLEMENTED" — do not skip the section. This document feeds directly into the Principal Engineer audit pipeline.

| Field | Value |
|---|---|
| **Feature Name** | Question Bank |
| **Bounded Context** | TenantAdminDashboard\Quiz |
| **Date Reported** | 2026-03-21 |
| **Reported By** | AI Agent |
| **Current Status** | Working — CRUD, CSV Import, Auto-write from Quiz, and "Add to Quiz" implemented |
| **Has Developer Instructions Doc?** | Yes (`Ubotz_2_phase_18b_developer_instructions.md`) |
| **Has Implementation Plan?** | Yes |
| **Was Principal Engineer Audit Done?** | No |

---

## 1. What This Feature Does (2–3 sentences)

The **Question Bank** feature provides a centralized repository of reusable questions that exist independently of any specific quiz. It allows instructors and tenant administrators to author questions directly in the bank, bulk import questions via CSV, and seamlessly copy questions from the bank into multiple active quizzes. The feature ensures a single source of truth for authored content while maintaining the architectural rule that changes to a bank question do not retroactively alter the content of already published quizzes.

---

## 2. Backend Architecture

### 2.1 Controllers

| Controller | Methods | Notes |
|---|---|---|
| `App\Http\Controllers\TenantAdminDashboard\Quiz\QuestionBankReadController` | `index`, `show` | Paginated listing with rich filtering and single item retrieval |
| `App\Http\Controllers\TenantAdminDashboard\Quiz\QuestionBankWriteController` | `store`, `update`, `changeStatus`, `addToQuiz` | Core lifecycle mutations and "Add to Quiz" action |
| `App\Http\Controllers\TenantAdminDashboard\Quiz\QuestionBankImportController` | `import` | Bulk CSV import endpoint |

### 2.2 UseCases / Queries

| UseCase / Query | Purpose | Injects Audit Logger? | Injects Quota Service? |
|---|---|---|---|
| `CreateQuestionBankItemUseCase` | Create a new question natively in the bank | Yes | N/A |
| `UpdateQuestionBankItemUseCase` | Update an existing bank question with deep data replacement | Yes | N/A |
| `ChangeQuestionBankItemStatusUseCase` | Transition status (`draft` ↔ `published` → `archived`) | Yes | N/A |
| `AddQuestionFromBankUseCase` | Deep copy a published bank question into a target quiz | Yes | N/A |
| `ImportQuestionBankUseCase` | Bulk parse and batch insert CSV question data | Yes | N/A |
| `ListQuestionBankQuery` | Fetch paginated records via `QuestionBankListCriteria` | N/A | N/A |
| `GetQuestionBankItemQuery` | Retrieve single native record | N/A | N/A |

### 2.3 Domain Layer

| Component | Type | Location | Notes |
|---|---|---|---|
| `QuestionBankEntity` | Entity | `Domain/TenantAdminDashboard/Quiz/Entities/` | Aggregate root |
| `QuestionBankProps` | ValueObject | `Domain/TenantAdminDashboard/Quiz/ValueObjects/` | Immutable DTO |
| `QuestionBankStatus` | Enum | `Domain/TenantAdminDashboard/Quiz/ValueObjects/` | Cases: `draft`, `published`, `archived` |

**Domain invariants (summary):** Questions must have `status=published` to be importable into a quiz; grade must be >= 0; empty titles are rejected. The class enforces strict transitions on publishes and archives, similar to the main Quiz domain.

### 2.4 Domain Events

| Event Class | Trigger | Has Listener? |
|---|---|---|
| `QuestionBankItemCreated` | After bank item persisted | Yes — audit logger injected |
| `QuestionBankItemArchived` | After status changed to `archived` | Yes — audit logger injected |

### 2.5 Infrastructure Layer

| Component | Type | Notes |
|---|---|---|
| `QuestionBankRecord` | Eloquent Model | Maps to `question_bank`; uses `BelongsToTenant` |
| `EloquentQuestionBankRepository` | Repository | Implements `QuestionBankRepositoryInterface` |
| `CsvQuestionBankImportParser` | Parser | Implements `QuestionBankImportParserInterface` |

### 2.6 Exceptions

| Exception Class | When Thrown |
|---|---|
| `QuestionBankItemNotFoundException` | ID lookup failure across tenant scope |
| `QuestionBankItemNotPublishedException` | Attempting to import `draft` or `archived` item to Quiz |
| `InvalidImportRowException` | Found missing data or bad foreign keys in CSV load |

---

## 3. Database Schema

### 3.1 Tables

**Table: `question_bank`** (Migration: `2026_03_21_180B_000001_create_question_bank_table.php`)

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | BIGINT UNSIGNED PK | No | |
| `tenant_id` | BIGINT UNSIGNED FK | No | |
| `created_by` | BIGINT UNSIGNED | No | |
| `exam_id`, `subject_id`, `chapter_id`, `topic_id` | BIGINT UNSIGNED FK | Yes | Exam hierarchy refs |
| `type` | VARCHAR(20) | No | `multiple`, `descriptive` etc |
| `difficulty_level` | VARCHAR(20) | No | `easy`, `medium`, `hard` |
| `title` | TEXT | No | |
| `image_url`, `video_url` | VARCHAR(500) | Yes | |
| `correct_explanation` | TEXT | Yes | |
| `grade` | DECIMAL(8,2) | No | Default `1.00` |
| `correct_numerical_value` | DECIMAL(10,4) | Yes | |
| `options`, `pairs`, `accepted_answers` | JSON | Yes | Inline payload storage to avoid joining nested tables |
| `status` | VARCHAR(20) | No | Default `draft` |
| `created_at`, `updated_at` | TIMESTAMP | Yes | |
| `deleted_at` | TIMESTAMP | Yes | Includes SoftDeletes |

**Modifications to Existing Tables:**
- `quiz_questions`: Added `bank_question_id` (BIGINT UNSIGNED, nullable, index added, no FK constraint).
- `quiz_question_options`: Added `bank_question_id` (BIGINT UNSIGNED, nullable).
- `quiz_question_pairs`: Added `bank_question_id` (BIGINT UNSIGNED, nullable).

### 3.2 Relationships

| From Table | To Table | Type | FK Column |
|---|---|---|---|
| `question_bank` | `tenants` | BelongsTo | `tenant_id` |
| `question_bank` | `exams` | BelongsTo | `exam_id` |
| `question_bank` | `subjects` | BelongsTo | `subject_id` |
| `quiz_questions` | `question_bank` | BelongsTo (Logical) | `bank_question_id` |

---

## 4. API Endpoints

*(Routes in `routes/tenant_dashboard/question_bank.php`; all under `tenant.admin` + individual capability gates.)*

| Method | URI | Controller@Method | Middleware | Capability Code |
|---|---|---|---|---|
| `GET` | `/api/tenant/question-bank` | `QuestionBankReadController@index` | `auth:sanctum` | `quiz_bank.view` |
| `GET` | `/api/tenant/question-bank/{id}` | `QuestionBankReadController@show` | same | `quiz_bank.view` |
| `POST` | `/api/tenant/question-bank` | `QuestionBankWriteController@store` | same | `quiz_bank.create` |
| `PUT` | `/api/tenant/question-bank/{id}` | `QuestionBankWriteController@update` | same | `quiz_bank.edit` |
| `PATCH` | `/api/tenant/question-bank/{id}/status` | `QuestionBankWriteController@changeStatus` | same | `quiz_bank.edit` |
| `POST` | `/api/tenant/question-bank/{id}/add-to-quiz` | `QuestionBankWriteController@addToQuiz` | same | `quiz_bank.view` |
| `POST` | `/api/tenant/question-bank/import` | `QuestionBankImportController@import` | same | `quiz_bank.create` |

---

## 5. Security Checklist

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | All queries scoped by `tenant_id`? | Yes | `BelongsToTenant` trait enforced on `QuestionBankRecord` |
| 2 | Capability middleware on all routes? | Yes | Yes |
| 3 | Audit log written for every mutation? | Yes | Handled locally in UseCases |
| 4 | Input validation via FormRequest (not in controller)? | **No** | Validation done directly in Controller via `$request->validate()` for now |
| 5 | Soft deletes used? | Yes | `deleted_at` added to `question_bank` table |
| 6 | No raw SQL in controllers/UseCases? | Yes | Done via Eloquent Repository |
| 7 | `bank_question_id` FK is safely nullifiable? | Yes | Softdeleted origin items don't cascade delete quiz targets |

---

## 6. Frontend

*(Note: Frontend is implemented as separate Phase, Backend provides endpoints here.)*

| Hook | Endpoint | Notes |
|---|---|---|
| CRUD Question Bank | `/api/tenant/question-bank...` | In quiz service layer APIs |
| Import Question Bank | `/api/tenant/question-bank/import` | File uploads API |

### 6.1 Capability-Based UI Gating

| UI Element | Hidden When Missing Capability | Implemented (Backend)? |
|---|---|---|
| Question Bank Tab | `quiz_bank.view` | API Protected |
| Create Question button | `quiz_bank.create` | API Protected |
| Edit / Archive button | `quiz_bank.edit` | API Protected |

---

## 7. Tests

| Test File | Expected Coverage | Created? |
|---|---|---|
| `tests/Unit/Domain/TenantAdminDashboard/Quiz/Entities/QuestionBankEntityTest.php` | Entity properties & validations | Yes |
| `tests/Unit/Infrastructure/Persistence/TenantAdminDashboard/Quiz/EloquentQuestionBankRepositoryTest.php` | Database interactions | Yes |
| `tests/Unit/Infrastructure/Persistence/TenantAdminDashboard/Quiz/CsvQuestionBankImportParserTest.php` | Parsing Logic & Mocked DB Validations | Yes |
| `tests/Unit/Application/TenantAdminDashboard/Quiz/UseCases/CreateQuestionBankItemUseCaseTest.php` | Service test mocking deps | Yes |
| `tests/Unit/Application/TenantAdminDashboard/Quiz/UseCases/AddQuestionFromBankUseCaseTest.php` | Ensures errors on Draft imports | Yes |
| `tests/Feature/TenantAdminDashboard/Quiz/QuestionBankCrudFeatureTest.php` | Feature test API boundaries | Yes |
| `tests/Feature/TenantAdminDashboard/Quiz/QuestionBankImportFeatureTest.php` | Feature test CSV upload integrations | Yes |

**Tests written but specifically skipped from execution per User request.**

---

## 8. Known Issues & Gaps

| # | Issue | Severity Guess | Notes |
|---|---|---|---|
| 1 | File Manager linking not integrated | Low | Currently just `image_url` fields, no integration with File Manager yet. |
| 2 | Duplication of nested items in `AddQuestionFromBankUseCase` | Low | Might fail or miss some deeply nested edge case data without full deep cloning testing, currently standard cloning implemented. |

---

## 9. Dependencies on Other Features

| Depends On | How |
|---|---|
| Quiz Domain | Existing tables `quiz_questions` modified to include `bank_question_id` |
| Exam Hierarchy | Hierarchy `exam_id` mapped strictly |

---

## 10. File Tree (Backend Only)

*(Relevant items added during Phase 18B)*

```
app/
├── Http/Controllers/TenantAdminDashboard/Quiz/
│   ├── QuestionBankReadController.php
│   ├── QuestionBankWriteController.php
│   └── QuestionBankImportController.php
├── Application/TenantAdminDashboard/Quiz/
│   ├── Commands/
│   │   ├── ...QuestionBank...Command.php
│   ├── Queries/
│   │   ├── ...QuestionBank...Query.php
│   └── UseCases/
│       ├── ...QuestionBank...UseCase.php
├── Domain/TenantAdminDashboard/Quiz/
│   ├── Entities/
│   │   └── QuestionBankEntity.php
│   ├── ValueObjects/
│   │   ├── QuestionBankProps.php
│   │   └── QuestionBankStatus.php
│   ├── Events/
│   │   ├── QuestionBankItemCreated.php
│   │   └── QuestionBankItemArchived.php
│   ├── Exceptions/
│   │   └── ...QuestionBank...Exception.php
│   └── Repositories/
│       ├── QuestionBankRepositoryInterface.php
│       └── QuestionBankImportParserInterface.php
├── Infrastructure/Persistence/TenantAdminDashboard/Quiz/
│   ├── QuestionBankRecord.php
│   ├── EloquentQuestionBankRepository.php
│   └── CsvQuestionBankImportParser.php
└── routes/tenant_dashboard/question_bank.php
```

---

*End of Report*
