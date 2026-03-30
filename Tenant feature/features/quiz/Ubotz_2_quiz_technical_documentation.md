# UBOTZ 2.0 Quiz Technical Specification

## 1. Domain-Driven Design Context

The Quiz feature resides within the `TenantAdminDashboard\Quiz` bounded context. Adhering to the DDD invariants of the Ubotz platform, Eloquent Models are sequestered entirely inside `Infrastructure\Persistence`, while the Domain layer maintains pure PHP entities.

### Core Domain Entities
- **`QuizEntity`**: Root aggregate for the assessment. Contains business rules for status transitions, scoring boundaries, and access validations.
- **`QuestionBankEntity`**: Base item representing an isolated question pool record independently of any quiz attachment.
- **`QuizQuestionEntity` / `QuizQuestionOptionEntity`**: Represent the structural composition of a quiz payload.
- **`QuizSectionEntity`**: Manages logical groupings (e.g., "Physics", "Chemistry") utilized fundamentally in `mock_test` variants.
- **`QuizResultEntity`**: Captures scoring states, grading pipelines, and final resolution.

---

## 2. Infrastructure & Database Schema

The foundational data store for the module is the `quizzes` table (`2026_03_03_000001_create_quizzes_table.php`).

### Critical Schema Attributes
| Category | Columns | Significance |
| :--- | :--- | :--- |
| **Multi-Tenancy** | `tenant_id` | **CRITICAL:** Enforced via `BelongsToTenant` trait boundary. All queries MUST scope against this index. |
| **Hierarchy Binding** | `exam_id`, `subject_id`, `course_id` | Foreign keys resolving to the tenant application scope, dictating module dependencies. |
| **Access Control** | `access_level`, `is_free`, `max_attempts` | Validated constantly at the API gate to determine if a payload can be instantiated for an actor. |
| **Scoring Meta** | `pass_mark`, `negative_marking`, `total_mark` | Applied inside the `GradeQuizResponseUseCase` orchestration. |
| **CBT Flags** | `enable_cbt_mode`, `enable_mark_for_review`, `enable_question_palette` | Front-end drivers for dynamically rendering exam UI layouts. |

> **Note:** The `sections` attribute utilizes a `json` column, accommodating flexible nested mappings for Mock Test structures without necessitating expensive cross-table joins during test initiation.

---

## 3. Application UseCases Overview

The `Application\TenantAdminDashboard\Quiz\UseCases` namespace organizes tasks by single responsibility:

### Instantiation & Management
- `CreateQuizUseCase` / `UpdateQuizUseCase`
- `DuplicateQuizUseCase`: Deeply clones quiz structural trees including sections and question mappings.
- `ChangeQuizStatusUseCase`: Dictates transitions through the `draft` $\rightarrow$ `active` $\rightarrow$ `archived` state machine.

### Question Handling
- `ImportQuestionBankUseCase`: Handles bulk ingestion methodologies.
- `AddQuestionFromBankUseCase`: Safely binds bank references to a live `QuizEntity`.
- `ReorderQuizQuestionsUseCase` / `ReorderQuizSectionsUseCase`: Mutates array order parameters for fixed-display quizzes.

### Execution & Grading
- `CheckQuizAccessUseCase`: Pre-flight mechanism evaluating `max_attempts`, enrollment records, and active dates.
- `StartQuizAttemptUseCase`: Initializes tracker records and issues test payloads.
- `SubmitQuizAnswersUseCase`: Ingests and serializes student responses securely.
- `GradeQuizResponseUseCase` / `BulkGradeByQuestionUseCase`: Computation engines for objective score allocations and human-grading orchestrations.

---

## 4. Security & Multi-Tenancy Invariants

> [!WARNING]
> The Quiz Domain operates **exclusively in the tenant context**. Under no circumstances should cross-tenant global scopes be bypassed using `withoutGlobalScope()`.

1. **Authorization Boundaries:** Controller endpoints are guarded strictly by capabilities (`quiz.create`, `quiz.edit`, `quiz.publish`, `quiz.view`). 
2. **Access Isolation:** Student roles attempting to leverage `StartQuizAttemptUseCase` must pass stringent checks authenticating active parent `course_id` enrollments (if `access_level` is `course_only`).
3. **Database Guardrails:** Every query issued from `Infrastructure\Persistence\TenantAdminDashboard\Quiz\Repositories` injects `$tenantId` inherently or via Global Scope.

---

## 5. Linked References
- Status report: `../../status reports/Quiz_Status_Report.md`
- Consolidated feature doc: `../../feature documents/Ubotz_2_quiz_feature_documentation.md`
