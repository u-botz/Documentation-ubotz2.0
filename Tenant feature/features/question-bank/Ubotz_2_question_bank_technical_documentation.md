# UBOTZ 2.0 — Question Bank — Technical Specification

## Scope

Reusable quiz items stored in **`question_bank`**, authored or imported once and attached to quizzes via **`AddQuestionFromBankUseCase`**. Routes live in `backend/routes/tenant_dashboard/question_bank.php`; application code under `App\Application\TenantAdminDashboard\Quiz\`.

## Route entry point

| File | Prefix (effective) |
|------|---------------------|
| `backend/routes/tenant_dashboard/question_bank.php` | `/api/tenant` |

| Method | Path | Capability |
|--------|------|------------|
| GET | `/question-bank` | `quiz_bank.view` |
| GET | `/question-bank/{id}` | `quiz_bank.view` |
| POST | `/question-bank` | `quiz_bank.create` |
| PUT | `/question-bank/{id}` | `quiz_bank.edit` |
| PATCH | `/question-bank/{id}/status` | `quiz_bank.edit` |
| POST | `/question-bank/{id}/add-to-quiz` | `quiz_bank.view` |
| POST | `/question-bank/import` | `quiz_bank.create` |

Controllers: `QuestionBankReadController`, `QuestionBankWriteController`, `QuestionBankImportController` under `App\Http\Controllers\TenantAdminDashboard\Quiz\`.

## Capabilities (seeded)

From `TenantCapabilitySeeder`: **`quiz_bank.view`**, **`quiz_bank.create`**, **`quiz_bank.edit`**.

## Application use cases

| Use case | Role |
|----------|------|
| `CreateQuestionBankItemUseCase` | Create bank item |
| `UpdateQuestionBankItemUseCase` | Update content; archived items are immutable |
| `ChangeQuestionBankItemStatusUseCase` | Status workflow (includes **archived**) |
| `ImportQuestionBankUseCase` | Bulk import via `QuestionBankImportParserInterface` |
| `AddQuestionFromBankUseCase` | Copy bank item into a quiz; **requires published bank item** (`QuestionBankItemNotPublishedException` if not) |

Queries: `ListQuestionBankQuery`, `GetQuestionBankItemQuery`, `QuestionBankListCriteria`.

## Persistence (tenant)

`backend/database/migrations/tenant/2026_03_21_180B_000001_create_question_bank_table.php` → table **`question_bank`**:

- `tenant_id`, `created_by`, `exam_id`, `subject_id`, optional `chapter_id` / `topic_id`
- `type`, `difficulty_level`, `title`, optional `image_url` / `video_url`, `correct_explanation`
- `grade`, optional `correct_numerical_value`
- `status` (default `published` in migration default string)
- `timestamps`, **`softDeletes`**
- Indexes: `idx_qbank_tenant`, `idx_qbank_tenant_status`, `idx_qbank_hierarchy`, `idx_qbank_type_difficulty`

## Security

- All queries must respect **tenant isolation** (repository / global scope patterns used elsewhere in Quiz).
- Route middleware maps **capabilities** above—not `quiz.create` / `question_bank.manage` (those names are not what the seeder uses).

---

## Linked references

- **Quiz** — attempts, grading, and in-quiz questions under `routes/tenant_dashboard/quiz.php`
- **Exam hierarchy** — `exam_id` / `subject_id` linkage
