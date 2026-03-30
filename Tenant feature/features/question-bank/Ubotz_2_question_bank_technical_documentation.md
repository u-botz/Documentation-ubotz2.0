# UBOTZ 2.0 Question Bank Technical Specification

## 1. Context & Architectural Placement

The Question Bank is fundamentally interwoven into the `TenantAdminDashboard\Quiz` Bounded Context. However, `QuestionBankEntity` serves as its own aggregate root, reflecting the fact that bank items exist autonomously outside the lifecycle of any specific `QuizEntity`.

### Core Application UseCases
The Application Layer coordinates via the `app/Application/TenantAdminDashboard/Quiz` namespace:
- `CreateQuestionBankItemUseCase`: Handles atomic authoring of a single entity.
- `ImportQuestionBankUseCase`: Crucial infrastructure orchestrating the ingestion of CSV/JSON files, enforcing validation against `subject_id` and `exam_id` bindings recursively.
- `UpdateQuestionBankItemUseCase`: Mutates repository records but relies on events to signal updates to any parent quizzes that may be actively cloning these parameters.
- `ChangeQuestionBankItemStatusUseCase`: Enforces moderation workflow (e.g. promoting `draft` $\rightarrow$ `published`).
- `AddQuestionFromBankUseCase`: Acts as the bridge context, importing a referenced `QuestionBankEntity` into a `QuizQuestionEntity`.

---

## 2. Infrastructure & Schema (`question_bank`)

The fundamental data structure resides in the `question_bank` table (`2026_03_21_180B_000001_create_question_bank_table.php`).

### Critical Indices and Schema Constraints
| Field Context | Column Name | Technical Significance |
| :--- | :--- | :--- |
| **Tenancy Enforcement** | `tenant_id` | **CRITICAL:** Constrained structurally by `idx_qbank_tenant`. Prevents cross-tenant asset leaking using the standard global scope. |
| **Performance Identifiers** | `exam_id`, `subject_id`, `chapter_id`, `topic_id` | Enforced collectively by the composite `idx_qbank_hierarchy` index. This guarantees efficient $O(log N)$ filtration during bulk-quiz auto-generation and analytics matrix mapping. |
| **Algorithmic Profiling** | `type`, `difficulty_level` | Supported by the `idx_qbank_type_difficulty` index. It accelerates dynamic pulling of queries (e.g., "Give me 10 *hard* *MCQs*"). |
| **Rendering Media** | `image_url`, `video_url` | Character-limited (`500`) to point to the tenant's segmented S3 objects. Not utilized for base64 embeddings directly into DB payloads. |

---

## 3. Data Invariants and Field Semantics

### Evaluation & Parsing Fields
- **`correct_numerical_value`:** Defined as `decimal(15, 4)`. This strictly accommodates CBT "Integer/Decimal Type" evaluation endpoints where regex string matching is inadequate for mathematical tolerance parsing.
- **`grade`:** Represents the baseline positive score increment `decimal(8, 2)`.
- **`correct_explanation`:** Rich text string sent exclusively as a post-submission payload during the `QuizResultEntity` rendering step.

### State Transitions
The core `status` column employs string mappings instead of boolean checks:
1. `draft`: Incomplete or awaiting subject-matter-expert (SME) approval.
2. `published`: Synced and ready to be loaded via `AddQuestionFromBankUseCase`.

---

## 4. Security Models

> [!WARNING]
> Question Bank assets are strictly partitioned. 

1. **Global Isolation:** Eloquent's `BelongsToTenant` scope asserts `$table->where('tenant_id', currentTenant())`. There are no scenarios where 'Platform Admins' pull records generically across boundaries.
2. **Access Middleware:** Creating and mutating bank items are protected by explicit policies validating `quiz.create` and `question_bank.manage` capabilities attached to the authenticated actor's `user_role_assignments`.
3. **Soft Deletions:** Managed through `$table->softDeletes()`. Due to the high relational coupling with legacy quizzes and previous student attempt analytics (`QuizResultEntity`), strict database row deletion is disabled via standard Eloquent traits.
