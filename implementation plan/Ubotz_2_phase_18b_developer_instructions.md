# UBOTZ 2.0 — Phase 18B Developer Instructions

## Quiz Feature Series — Question Bank: Browse, Reuse, and Import

| Field | Value |
|---|---|
| **Document Type** | Developer Instruction (Pre-Implementation Brief) |
| **Phase** | 18B |
| **Series** | Quiz Feature Series (18A → 18B → 18C → 18D → 18E) |
| **Date** | 2026-03-21 |
| **Issued By** | Principal Engineer / Architecture Auditor |
| **Audience** | Antigravity Implementation Team |
| **Expected Deliverable** | Phase 18B Implementation Plan |
| **Prerequisites** | Phase 18A CERTIFIED COMPLETE |

> **This phase delivers what the question bank has always promised but never provided: a real, browsable, reusable repository of questions tagged to the exam hierarchy. Right now every question belongs to exactly one quiz and cannot be reused. A teacher building "JEE Mock Test 3" rebuilds the same Physics questions they already wrote for "JEE Mock Test 2". This phase ends that. Questions become first-class entities that live in the bank independently of any quiz.**

---

## 1. Mission Statement

Phase 18B builds the **Question Bank** as a standalone entity within the Quiz bounded context. It delivers three capabilities:

1. **A browsable, searchable question repository** — questions tagged by exam hierarchy (Exam → Subject → Chapter → Topic), difficulty level, and type, accessible from the admin panel independently of any quiz.

2. **Question reuse when building quizzes** — when adding questions to a quiz, the teacher can either author a new question (which goes to the bank automatically) or pick existing questions from the bank by browsing or searching.

3. **Bulk import** — teachers can upload a structured CSV/Excel file to create multiple bank questions at once, removing the bottleneck of one-by-one authoring.

---

## 2. Current State vs Target State

### 2.1 Current State (Post-18A)

The `quiz_questions` table has four `bank_*` columns: `bank_exam_id`, `bank_subject_id`, `bank_chapter_id`, `bank_topic_id`. These are **tagging columns only** — they record where in the hierarchy a question conceptually belongs. There is no `question_bank` table. There is no `QuestionBankEntity`. There is no endpoint to browse questions by hierarchy. A question authored for Quiz A cannot be selected when building Quiz B.

The existing `QuizQuestionBankHierarchyTest` confirms the hierarchy tagging works at the question level — but the bank itself does not exist as a reusable system.

### 2.2 Target State (Post-18B)

```
question_bank
├── QuestionBankEntity (aggregate root)
│   ├── belongs to tenant
│   ├── tagged to exam hierarchy (exam → subject → chapter → topic)
│   ├── has question type (all 8 types from 18A)
│   ├── has difficulty level
│   ├── has question body, media, options/pairs/accepted answers
│   └── has lifecycle (draft → published → archived)
│
└── Referenced by quiz_questions via bank_question_id FK
    ├── quiz question "points to" a bank question
    ├── quiz question can also be "standalone" (no bank reference)
    └── adding question to quiz from bank creates a quiz_question record
        that mirrors the bank question content at that point in time
```

A quiz question that was sourced from the bank records `bank_question_id` on the `quiz_questions` row. A question authored directly for a quiz still writes to the bank (its `bank_exam_id` etc. are populated), but it is not marked as "sourced from bank" — it is the origin record.

---

## 3. What This Phase Includes

- `question_bank` table and `QuestionBankEntity` aggregate root
- `QuestionBankStatus` value object (DRAFT, PUBLISHED, ARCHIVED)
- Full CRUD for bank questions (create, update, publish, archive)
- Hierarchy-aware browsing: filter by exam, subject, chapter, topic, difficulty, type
- Search by question text
- `bank_question_id` FK column on `quiz_questions` — links a quiz question to its bank origin
- `AddQuestionFromBankUseCase` — creates a `quiz_questions` row from a bank question
- Updated `CreateQuizQuestionUseCase` — auto-writes to bank when question authored directly
- Bulk import: CSV/Excel upload endpoint, validation, batch persistence
- Import error report: per-row validation failures returned to caller
- API endpoints for bank CRUD and quiz-bank integration
- Capability codes: `quiz_bank.view`, `quiz_bank.create`, `quiz_bank.edit`
- Full test coverage

## 3.1 What This Phase Does NOT Include

- Sections as first-class entities (Phase 18C)
- Manual grading queue (Phase 18C)
- Random question generation from bank for quiz (deferred — Phase 18C when section config is complete, since random selection is per-section in the confirmed business model)
- Student-facing question bank (students never see the bank)
- Bank question versioning (editing a bank question does not retroactively change quizzes that already used it — 18A's attempt snapshot handles this; bank question editing is forward-only)
- Cross-tenant question bank sharing (each tenant owns their own bank — no platform-level shared bank)

---

## 4. Architecture Decisions

### AD-18B-001: Question Bank Lives in the Quiz Bounded Context

The question bank is a Quiz domain concept — it does not belong in the Course domain, ExamHierarchy domain, or a new standalone context. It is owned by `Domain/TenantAdminDashboard/Quiz/` alongside `QuizEntity`.

**Rationale:** The question bank's primary consumers are quiz creation workflows. Its hierarchy tagging references the ExamHierarchy bounded context by primitive IDs — not by importing ExamHierarchy entities. This is the same pattern used by `quizzes` (which has `exam_id`, `subject_id`, etc. as plain integer columns).

### AD-18B-002: `QuestionBankEntity` Is an Aggregate Root, Not a Child of Quiz

A bank question has its own lifecycle independent of any quiz. It can exist without being in any quiz. It can be archived while still referenced by historical quizzes. It is not owned by `QuizEntity`.

### AD-18B-003: `quiz_questions` Records Added From Bank Are Copies, Not References

When a teacher adds a bank question to a quiz, the system creates a new `quiz_questions` row that copies the bank question's content at that moment. The `bank_question_id` column on `quiz_questions` records where it came from — but the quiz question is an independent copy.

**Why copies, not live references?**
- The 18A attempt snapshot system snapshots `quiz_questions` content at attempt start. If quiz questions were live references to bank questions, a single bank edit would change the content of every quiz using that question before the attempt snapshot is written — defeating the entire snapshot system.
- Quiz questions may be customised after being added from the bank (teacher adjusts the grade or explanation for a specific quiz context). A live reference would make this impossible.

**Forward-only edit rule:** Editing a bank question after it has been used in a quiz does NOT update the corresponding `quiz_questions` rows. Teachers are informed of this via UI copy ("Editing this bank question will not affect quizzes that have already used it").

### AD-18B-004: Bank Question Lifecycle Is Draft → Published → Archived

```
DRAFT     → PUBLISHED   (question ready for use in quizzes)
DRAFT     → ARCHIVED    (discarded without publishing)
PUBLISHED → ARCHIVED    (retired)
ARCHIVED  → (terminal)
```

Only PUBLISHED bank questions can be added to quizzes. A DRAFT bank question is visible in the bank browser but the "Add to Quiz" button is disabled. An ARCHIVED bank question is hidden from the bank browser by default (visible via "Show Archived" filter).

### AD-18B-005: Auto-Write to Bank on Direct Question Authoring

When a teacher authors a question directly in a quiz (not from the bank), `CreateQuizQuestionUseCase` writes the question to the bank as a PUBLISHED record simultaneously. The quiz question gets `bank_question_id` pointing to the new bank record.

This means every question ever created in the platform ends up in the bank — the bank grows organically without requiring a separate authoring workflow. Teachers can then reuse it when building future quizzes.

**Implication:** `CreateQuizQuestionUseCase` now has two responsibilities in one transaction: persist `quiz_questions` record AND persist `question_bank` record. Both must commit together or both must roll back.

### AD-18B-006: Bulk Import Uses a Dedicated Import Service, Not the Create UseCase

The bulk import processes potentially hundreds of rows. It must not call `CreateQuizQuestionUseCase` in a loop (one transaction per row — too slow, too many DB round trips). Instead, a dedicated `ImportQuestionBankUseCase` processes the entire batch:

1. Parse and validate all rows
2. Collect all valid rows
3. Batch-insert into `question_bank` in a single transaction
4. Return a result object: `{ imported: N, failed: M, errors: [{row, field, message}] }`

Partial success is acceptable — failed rows are reported without rolling back successful rows.

### AD-18B-007: Import Format Is CSV First, Excel Deferred

CSV is universally supported and simpler to parse and validate. Excel (XLSX) import is deferred to a future phase. The import endpoint accepts `multipart/form-data` with a `.csv` file.

Required CSV columns (exact header names, case-insensitive):

| Column | Required | Notes |
|---|---|---|
| `question_type` | Yes | `multiple`, `descriptive`, `fill_in_blank`, `numerical`, `match_following` |
| `question_text` | Yes | The question body |
| `difficulty` | Yes | `easy`, `medium`, `hard` |
| `exam_id` | Yes | Integer FK to exam hierarchy |
| `subject_id` | Yes | Integer FK |
| `chapter_id` | No | Integer FK — nullable |
| `topic_id` | No | Integer FK — nullable |
| `grade` | Yes | Decimal — marks for correct answer |
| `correct_explanation` | No | Text — shown after grading |
| `image_url` | No | URL — question stem image |
| `options` | Conditional | JSON array — required for `multiple` type |
| `accepted_answers` | Conditional | Comma-separated — required for `fill_in_blank` |
| `correct_value` | Conditional | Decimal — required for `numerical` |
| `pairs` | Conditional | JSON array — required for `match_following` |

**`options` JSON format:**
```json
[
  {"text": "Option A", "is_correct": false},
  {"text": "Option B", "is_correct": true},
  {"text": "Option C", "is_correct": false},
  {"text": "Option D", "is_correct": false}
]
```

**`pairs` JSON format:**
```json
[
  {"left": "Newton's First Law", "right": "Law of Inertia", "is_correct": true},
  {"left": "Newton's Second Law", "right": "F = ma", "is_correct": true}
]
```

---

## 5. Domain Layer

### 5.1 Directory Structure After 18B

```
app/Domain/TenantAdminDashboard/Quiz/
├── Entities/
│   ├── QuizEntity.php                      ← existing
│   ├── QuizQuestionEntity.php              ← modified (add bank_question_id)
│   ├── QuizQuestionOptionEntity.php        ← existing
│   ├── QuizQuestionPairEntity.php          ← from 18A
│   ├── QuizResultEntity.php                ← existing
│   └── QuestionBankEntity.php              ← NEW aggregate root
├── Events/
│   ├── QuizCreated.php                     ← existing
│   ├── QuizStatusChanged.php               ← existing
│   ├── QuizArchived.php                    ← existing
│   ├── QuizAttemptStarted.php              ← existing
│   ├── QuizAttemptSubmitted.php            ← existing
│   ├── QuizAttemptGraded.php               ← existing
│   ├── QuestionBankItemCreated.php         ← NEW
│   └── QuestionBankItemArchived.php        ← NEW
├── Exceptions/
│   ├── ... existing ...
│   ├── QuestionBankItemNotFoundException.php   ← NEW
│   ├── QuestionBankItemNotPublishedException.php ← NEW
│   └── InvalidImportRowException.php           ← NEW
├── Repositories/
│   ├── ... existing ...
│   └── QuestionBankRepositoryInterface.php     ← NEW
├── Services/
│   ├── HierarchyResolverInterface.php      ← existing
│   └── QuestionBankImportParserInterface.php   ← NEW
└── ValueObjects/
    ├── ... existing ...
    ├── QuestionBankProps.php               ← NEW
    └── QuestionBankStatus.php              ← NEW
```

### 5.2 `QuestionBankEntity` — Aggregate Root

Fields (via `QuestionBankProps`):
- `id: ?int`
- `tenantId: int`
- `createdBy: int`
- `examId: int` — required (D-5: always tied to hierarchy)
- `subjectId: int` — required
- `chapterId: ?int`
- `topicId: ?int`
- `type: QuestionType`
- `difficultyLevel: DifficultyLevel`
- `title: string` — question body text
- `imageUrl: ?string`
- `videoUrl: ?string`
- `correctExplanation: ?string`
- `grade: float`
- `status: QuestionBankStatus`
- `correctNumericalValue: ?float` — for NUMERICAL type
- `createdAt: ?DateTimeImmutable`
- `updatedAt: ?DateTimeImmutable`

Relations (managed via repositories, not entity fields):
- Options (for MULTIPLE, FILL_IN_BLANK)
- Pairs (for MATCH_FOLLOWING)

**Invariants:**
- `examId` and `subjectId` must always be set (D-5)
- `title` min 5 characters
- `grade` must be positive
- Type-specific invariants mirror `QuizQuestionEntity` invariants from 18A
- Only PUBLISHED bank questions can be added to quizzes

**Domain events fired:**
- `QuestionBankItemCreated` on `create()`
- `QuestionBankItemArchived` on archive transition

### 5.3 `QuestionBankStatus` Value Object

```php
enum QuestionBankStatus: string
{
    case DRAFT     = 'draft';
    case PUBLISHED = 'published';
    case ARCHIVED  = 'archived';    // terminal
}
```

Same three-state lifecycle as `BundleStatus` and `CourseStatus`. No ACTIVE, INACTIVE, PENDING. This is now the canonical three-state lifecycle for all publishable entities on this platform.

### 5.4 `QuestionBankRepositoryInterface`

```php
interface QuestionBankRepositoryInterface
{
    public function save(QuestionBankEntity $entity): QuestionBankEntity;

    public function findById(int $tenantId, int $id): ?QuestionBankEntity;

    public function findByIdOrFail(int $tenantId, int $id): QuestionBankEntity;

    /**
     * Hierarchy-aware paginated listing.
     * All params nullable except tenantId.
     */
    public function list(
        int     $tenantId,
        ?int    $examId,
        ?int    $subjectId,
        ?int    $chapterId,
        ?int    $topicId,
        ?string $type,
        ?string $difficulty,
        ?string $status,
        ?string $search,
        int     $page,
        int     $perPage,
    ): PaginatedResult;

    /** Batch insert for import — single transaction */
    public function insertMany(array $entities): int;
}
```

### 5.5 `QuestionBankImportParserInterface`

```php
interface QuestionBankImportParserInterface
{
    /**
     * Parse a CSV stream into an array of validated row DTOs.
     * Returns ParseResult with valid rows and per-row errors.
     */
    public function parse(string $csvContent, int $tenantId): ImportParseResult;
}
```

`ImportParseResult` carries:
- `validRows: QuestionBankImportRow[]`
- `errors: ImportRowError[]` — each has `rowNumber`, `field`, `message`

### 5.6 `QuizQuestionEntity` — Add `bankQuestionId`

Add `bankQuestionId: ?int` field to `QuizQuestionEntity` and `QuizQuestionProps`. This field is set when a question is added from the bank or when a directly-authored question is auto-written to the bank.

---

## 6. Application Layer

### 6.1 Directory Structure

```
app/Application/TenantAdminDashboard/Quiz/
├── Commands/
│   ├── ... existing ...
│   ├── CreateQuestionBankItemCommand.php       ← NEW
│   ├── UpdateQuestionBankItemCommand.php       ← NEW
│   ├── ChangeQuestionBankItemStatusCommand.php ← NEW
│   └── AddQuestionFromBankCommand.php          ← NEW
├── Queries/
│   ├── ... existing ...
│   ├── ListQuestionBankQuery.php               ← NEW
│   ├── QuestionBankListCriteria.php            ← NEW
│   └── GetQuestionBankItemQuery.php            ← NEW
└── UseCases/
    ├── ... existing ...
    ├── CreateQuestionBankItemUseCase.php        ← NEW
    ├── UpdateQuestionBankItemUseCase.php        ← NEW
    ├── ChangeQuestionBankItemStatusUseCase.php  ← NEW
    ├── AddQuestionFromBankUseCase.php           ← NEW
    └── ImportQuestionBankUseCase.php            ← NEW
```

### 6.2 `CreateQuestionBankItemUseCase` — Orchestration Sequence

```
1. Validate hierarchy references (exam_id, subject_id exist in tenant's exam hierarchy)
2. Validate type-specific requirements (options for MULTIPLE, pairs for MATCH_FOLLOWING, etc.)
3. Begin DB transaction
4. Create QuestionBankEntity (status = PUBLISHED by default for direct authoring)
5. Persist via QuestionBankRepositoryInterface
6. Persist options (if MULTIPLE or FILL_IN_BLANK) via QuizQuestionOptionRepositoryInterface
7. Persist pairs (if MATCH_FOLLOWING) via QuizQuestionPairRepositoryInterface
8. Capture domain events
9. Commit transaction
10. Write audit log (question_bank.created) — OUTSIDE transaction
11. Dispatch captured events
```

Note: Bank questions are created as PUBLISHED by default when authored directly. A teacher writing a question intends it to be usable immediately. The DRAFT state is for the import workflow — imported questions that fail validation checks are written as DRAFT for review.

### 6.3 `CreateQuizQuestionUseCase` — Extended With Auto-Bank Write

This use case is modified from 18A to also write the question to the bank:

```
1. Validate quiz exists and is editable
2. Validate question type-specific requirements
3. Begin DB transaction
4. Create QuestionBankEntity (status = PUBLISHED)
5. Persist bank entity + options/pairs
6. Create QuizQuestionEntity with bankQuestionId = bank_entity.id
7. Persist quiz_questions record
8. Commit transaction
9. Write audit log (quiz_question.created) — OUTSIDE transaction
10. Dispatch events
```

Both records commit together. If either fails, both roll back.

**Important:** The audit log action is `quiz_question.created` — not `question_bank.created`. The teacher's intent was to add a question to a quiz. The bank write is a side effect from their perspective.

### 6.4 `AddQuestionFromBankUseCase` — Adds Existing Bank Question to Quiz

```
Inputs: tenantId, quizId, bankQuestionId, actorId

1. Load bank question — must be PUBLISHED (throw QuestionBankItemNotPublishedException if not)
2. Load quiz — must be DRAFT or ACTIVE (cannot add to ARCHIVED quiz)
3. Check question not already in quiz (prevent duplicate — compare bankQuestionId on existing quiz_questions)
4. Begin DB transaction
5. Create QuizQuestionEntity as copy of bank question content
   — set bankQuestionId = bank question's id
   — copy: title, type, grade, imageUrl, explanation, correctNumericalValue
6. Persist quiz_questions record
7. Copy options (for MULTIPLE, FILL_IN_BLANK) — new rows in quiz_question_options
8. Copy pairs (for MATCH_FOLLOWING) — new rows in quiz_question_pairs
9. Commit transaction
10. Write audit log (quiz_question.added_from_bank) — OUTSIDE transaction
```

The grade on the copied quiz question is taken from the bank question's default grade but can be overridden by the teacher after adding. This override does not affect the bank question.

### 6.5 `ImportQuestionBankUseCase` — Batch Import

```
Inputs: tenantId, csvContent (string), actorId

1. Call QuestionBankImportParserInterface::parse(csvContent, tenantId)
   — validates all rows
   — returns ParseResult with validRows[] and errors[]
2. If no valid rows: return ImportResult with zero imports and all errors
3. Build QuestionBankEntity array from validRows (status = PUBLISHED)
4. Begin DB transaction
5. Batch insert all entities via QuestionBankRepositoryInterface::insertMany()
6. For each entity with options: batch insert options
7. For each entity with pairs: batch insert pairs
8. Commit transaction
9. Write single audit log entry: question_bank.bulk_imported (count, actorId) — OUTSIDE transaction
10. Return ImportResult: { imported: N, failed: M, errors: [{row, field, message}] }
```

Partial success rule: valid rows are imported regardless of how many rows failed. The caller receives a detailed error report for failed rows so the teacher can correct and re-import only the failed subset.

---

## 7. Infrastructure Layer

### 7.1 Database Schema

**Table: `question_bank`**
Migration: `database/migrations/tenant/2026_03_21_180B_000001_create_question_bank_table.php`

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | BIGINT UNSIGNED PK | No | |
| `tenant_id` | BIGINT UNSIGNED FK | No | `tenants` |
| `created_by` | BIGINT UNSIGNED | No | user_id |
| `exam_id` | BIGINT UNSIGNED | No | Hierarchy FK |
| `subject_id` | BIGINT UNSIGNED | No | Hierarchy FK |
| `chapter_id` | BIGINT UNSIGNED | Yes | Hierarchy FK |
| `topic_id` | BIGINT UNSIGNED | Yes | Hierarchy FK |
| `type` | VARCHAR(30) | No | QuestionType enum value |
| `difficulty_level` | VARCHAR(20) | No | `easy`, `medium`, `hard` |
| `title` | TEXT | No | Question body |
| `image_url` | VARCHAR(500) | Yes | |
| `video_url` | VARCHAR(500) | Yes | |
| `correct_explanation` | TEXT | Yes | |
| `grade` | DECIMAL(8,2) | No | Default marks |
| `correct_numerical_value` | DECIMAL(15,4) | Yes | NUMERICAL type only |
| `status` | VARCHAR(20) | No | Default `published` |
| `created_at` | TIMESTAMP | Yes | |
| `updated_at` | TIMESTAMP | Yes | |
| `deleted_at` | TIMESTAMP | Yes | Soft deletes |

**Indexes:**
- `idx_qbank_tenant` (`tenant_id`)
- `idx_qbank_tenant_status` (`tenant_id`, `status`)
- `idx_qbank_hierarchy` (`tenant_id`, `exam_id`, `subject_id`, `chapter_id`, `topic_id`)
- `idx_qbank_type_difficulty` (`tenant_id`, `type`, `difficulty_level`)

**Note:** `question_bank` options and pairs reuse the existing `quiz_question_options` and `quiz_question_pairs` tables via a `source_type` / `source_id` polymorphic pattern OR dedicated bank option tables. Given the existing tables are already keyed by `question_id`, the simplest approach is:

**Decision:** Add a `bank_question_id` FK column to `quiz_question_options` and `quiz_question_pairs` (nullable). Either `question_id` or `bank_question_id` is set — never both. A `CHECK` constraint enforces this (or application-layer validation).

This avoids creating duplicate `question_bank_options` and `question_bank_pairs` tables — the existing option and pair tables serve both quiz questions and bank questions.

Migration for this: `2026_03_21_180B_000002_add_bank_question_id_to_option_and_pair_tables.php`

```php
Schema::table('quiz_question_options', function (Blueprint $table) {
    $table->unsignedBigInteger('bank_question_id')->nullable()->after('question_id');
    $table->index('bank_question_id', 'idx_qoptions_bank_question');
    // At application layer: enforce that exactly one of question_id or bank_question_id is set
});

Schema::table('quiz_question_pairs', function (Blueprint $table) {
    $table->unsignedBigInteger('bank_question_id')->nullable()->after('question_id');
    $table->index('bank_question_id', 'idx_qpairs_bank_question');
});
```

**Migration for `bank_question_id` on `quiz_questions`:**
`2026_03_21_180B_000003_add_bank_question_id_to_quiz_questions.php`

```php
Schema::table('quiz_questions', function (Blueprint $table) {
    $table->unsignedBigInteger('bank_question_id')->nullable()->after('created_by');
    $table->index('bank_question_id', 'idx_qqestions_bank_id');
    // NOT a FK constraint — bank question may be soft-deleted
});
```

### 7.2 Eloquent Models

| Model | Change |
|---|---|
| `QuestionBankRecord` | NEW — `BelongsToTenant`, `SoftDeletes` |
| `QuizQuestionOptionRecord` | Add `bank_question_id` to `$fillable` |
| `QuizQuestionPairRecord` | Add `bank_question_id` to `$fillable` |
| `QuizQuestionRecord` | Add `bank_question_id` to `$fillable` |

### 7.3 Repository Implementation

| Interface | Implementation |
|---|---|
| `QuestionBankRepositoryInterface` | `EloquentQuestionBankRepository` |

`EloquentQuestionBankRepository::list()` builds a query chain based on provided filters. It must apply `BelongsToTenant` scoping first. The `search` parameter applies `WHERE title LIKE ?` with `%search%`. All filter params are applied with `when($param !== null, fn($q) => $q->where(...))` — no empty strings, no null conditions polluting the query.

`EloquentQuestionBankRepository::insertMany()` uses Eloquent's `insert()` for batch inserts — not `create()` in a loop. This is critical for import performance.

### 7.4 `CsvQuestionBankImportParser`

**File:** `Infrastructure/Persistence/TenantAdminDashboard/Quiz/CsvQuestionBankImportParser.php`

Implements `QuestionBankImportParserInterface`. Uses PHP's native `fgetcsv()` — no external CSV library dependency.

Validation per row:
- Required field presence
- `question_type` must be a valid `QuestionType` enum value
- `difficulty` must be easy/medium/hard
- `exam_id` and `subject_id` must exist in the tenant's exam hierarchy (single query to validate all unique IDs at once — not one query per row)
- `grade` must be positive numeric
- `options` JSON valid and parseable when present
- `pairs` JSON valid and parseable when present
- MCQ: at least 2 options, at least 1 `is_correct: true`
- FILL_IN_BLANK: at least 1 accepted answer
- NUMERICAL: `correct_value` parseable as float
- MATCH_FOLLOWING: at least 2 pairs

---

## 8. HTTP Layer

### 8.1 Capability Codes

Three new capability codes added to the platform capability seeder:

| Code | Group | Description |
|---|---|---|
| `quiz_bank.view` | quiz_bank | Browse and search the question bank |
| `quiz_bank.create` | quiz_bank | Author new bank questions and import |
| `quiz_bank.edit` | quiz_bank | Edit, publish, archive bank questions |

### 8.2 Controllers

| Controller | Methods | Notes |
|---|---|---|
| `QuestionBankReadController` | `index`, `show` | Browse + get single |
| `QuestionBankWriteController` | `store`, `update`, `status`, `addToQuiz` | CRUD + quiz add |
| `QuestionBankImportController` | `store` | CSV upload + import |

### 8.3 API Endpoints

All routes in `routes/tenant_dashboard/question_bank.php`. All under `tenant.module:module.lms` + capability middleware.

| Method | URI | Purpose | Capability |
|---|---|---|---|
| `GET` | `/api/tenant/question-bank` | List with hierarchy/type/difficulty filters | `quiz_bank.view` |
| `GET` | `/api/tenant/question-bank/{id}` | Get single bank question with options/pairs | `quiz_bank.view` |
| `POST` | `/api/tenant/question-bank` | Create bank question | `quiz_bank.create` |
| `PUT` | `/api/tenant/question-bank/{id}` | Update bank question | `quiz_bank.edit` |
| `PATCH` | `/api/tenant/question-bank/{id}/status` | Publish or archive | `quiz_bank.edit` |
| `POST` | `/api/tenant/question-bank/{id}/add-to-quiz` | Add bank question to a quiz | `quiz_bank.edit` |
| `POST` | `/api/tenant/question-bank/import` | Bulk CSV import | `quiz_bank.create` |
| `GET` | `/api/tenant/question-bank/import/template` | Download CSV template | `quiz_bank.create` |

### 8.4 Import Template Endpoint

`GET /api/tenant/question-bank/import/template` returns a pre-built CSV file with:
- Header row with all required and optional columns
- Two example rows (one MCQ, one descriptive)
- Inline comments in a `_notes` column explaining each field

This eliminates the most common import failure — teachers not knowing the expected format.

---

## 9. Business Rules (Non-Negotiable)

| ID | Rule | Enforcement |
|---|---|---|
| BR-01 | Bank questions must have `exam_id` and `subject_id` — no unclassified questions | Domain invariant + FormRequest validation |
| BR-02 | Only PUBLISHED bank questions can be added to quizzes | `AddQuestionFromBankUseCase` throws `QuestionBankItemNotPublishedException` |
| BR-03 | Adding a bank question to a quiz creates a copy — editing the copy does not affect the bank | `AddQuestionFromBankUseCase` copies content, not references |
| BR-04 | Editing a bank question does not update quiz questions that sourced from it | Application layer — `UpdateQuestionBankItemUseCase` only updates `question_bank` rows |
| BR-05 | Direct quiz question authoring auto-writes to bank | `CreateQuizQuestionUseCase` always creates bank record in same transaction |
| BR-06 | Bulk import: valid rows import successfully even if some rows fail | Partial success — `ImportQuestionBankUseCase` does not rollback on partial failure |
| BR-07 | Bulk import: max 500 rows per file | `CsvQuestionBankImportParser` enforces row limit — returns error if exceeded |
| BR-08 | Bank question `title` minimum 5 characters | Domain invariant |
| BR-09 | Bank question `grade` must be positive | Domain invariant |
| BR-10 | Audit logs written outside DB transactions | Platform-wide rule — no exceptions |
| BR-11 | `bank_question_id` on `quiz_questions` is NOT a FK constraint | Schema decision — soft-deleted bank questions must remain referenceable |
| BR-12 | Archived bank questions are hidden from the browser by default | Repository filters `status != archived` unless caller passes `include_archived = true` |

---

## 10. Test Plan

### 10.1 Unit Tests — Domain

**File:** `tests/Unit/Domain/TenantAdminDashboard/Quiz/Entities/QuestionBankEntityTest.php`

| Test | Description |
|---|---|
| `test_requires_exam_id_and_subject_id` | BR-01 |
| `test_draft_can_transition_to_published` | Status lifecycle |
| `test_published_can_transition_to_archived` | Status lifecycle |
| `test_archived_is_terminal` | No transitions out |
| `test_title_minimum_five_characters` | BR-08 |
| `test_grade_must_be_positive` | BR-09 |
| `test_creates_question_bank_item_created_event` | Domain event |

### 10.2 Unit Tests — Application

**File:** `tests/Unit/Application/TenantAdminDashboard/Quiz/UseCases/AddQuestionFromBankUseCaseTest.php`

| Test | Description |
|---|---|
| `test_adds_published_bank_question_to_quiz` | Happy path |
| `test_rejects_draft_bank_question` | BR-02 |
| `test_rejects_archived_bank_question` | BR-02 |
| `test_copied_question_has_bank_question_id_set` | BR-03 |
| `test_options_are_copied_not_referenced` | BR-03 |

**File:** `tests/Unit/Application/TenantAdminDashboard/Quiz/UseCases/ImportQuestionBankUseCaseTest.php`

| Test | Description |
|---|---|
| `test_imports_valid_rows_successfully` | Happy path |
| `test_partial_import_on_mixed_valid_invalid_rows` | BR-06 |
| `test_returns_error_report_for_failed_rows` | Error reporting |
| `test_rejects_file_exceeding_500_rows` | BR-07 |
| `test_audit_log_written_after_commit` | Platform rule |

**File:** `tests/Unit/Application/TenantAdminDashboard/Quiz/UseCases/CreateQuizQuestionUseCaseTest.php`

Add to existing test file:

| Test | Description |
|---|---|
| `test_auto_writes_to_bank_on_direct_authoring` | AD-18B-005 |
| `test_quiz_question_has_bank_question_id_after_create` | AD-18B-005 |
| `test_bank_write_rolls_back_if_quiz_question_fails` | Transaction safety |

### 10.3 Unit Tests — Import Parser

**File:** `tests/Unit/Infrastructure/Quiz/CsvQuestionBankImportParserTest.php`

| Test | Description |
|---|---|
| `test_parses_valid_mcq_row` | Happy path |
| `test_parses_valid_fill_in_blank_row` | New type |
| `test_parses_valid_numerical_row` | New type |
| `test_reports_error_for_missing_required_column` | Validation |
| `test_reports_error_for_invalid_question_type` | Validation |
| `test_reports_error_for_invalid_options_json` | Validation |
| `test_reports_row_number_in_error` | Error reporting |

### 10.4 Feature Tests

**File:** `tests/Feature/TenantAdminDashboard/Quiz/QuestionBankCrudTest.php`

| Test | Description |
|---|---|
| `test_create_bank_question` | Full stack |
| `test_list_bank_questions_filtered_by_exam` | Hierarchy filter |
| `test_list_bank_questions_filtered_by_type` | Type filter |
| `test_list_bank_questions_search` | Text search |
| `test_archived_questions_excluded_by_default` | BR-12 |
| `test_archive_bank_question` | Status transition |

**File:** `tests/Feature/TenantAdminDashboard/Quiz/QuestionBankImportTest.php`

| Test | Description |
|---|---|
| `test_import_csv_creates_bank_questions` | Full stack |
| `test_import_returns_error_report_on_invalid_rows` | Error format |
| `test_import_partial_success` | BR-06 |
| `test_download_import_template` | Template endpoint |

**File:** `tests/Feature/TenantAdminDashboard/Quiz/AddQuestionFromBankTest.php`

| Test | Description |
|---|---|
| `test_add_published_bank_question_to_quiz` | Full stack |
| `test_quiz_question_has_bank_question_id` | Linkage verified |
| `test_editing_bank_question_does_not_affect_quiz_question` | BR-04 |

### 10.5 Regression

```powershell
docker exec -it ubotz_backend sh -c "cd /var/www && php artisan test --filter=Quiz 2>&1 | tail -5"
```

All pre-existing quiz tests must pass. No regressions.

---

## 11. Quality Gate

| # | Check | How to Verify |
|---|---|---|
| 1 | `question_bank` table exists with correct schema | Migration + `DESCRIBE` |
| 2 | `QuestionBankEntity` is an aggregate root in Quiz domain | File location + code review |
| 3 | `bank_question_id` on `quiz_questions` is NOT a FK constraint | Migration inspection |
| 4 | Only PUBLISHED bank questions can be added to quizzes | Unit test |
| 5 | Direct question authoring auto-writes to bank in same transaction | Unit test |
| 6 | Adding from bank creates a copy — not a live reference | Unit test |
| 7 | Editing bank question does not update quiz questions | Feature test |
| 8 | Import handles partial success | Unit test + feature test |
| 9 | Import rejects files > 500 rows | Unit test |
| 10 | Import template endpoint returns downloadable CSV | Manual test |
| 11 | `quiz_bank.view`, `quiz_bank.create`, `quiz_bank.edit` capabilities seeded | DB check |
| 12 | Archived questions hidden from default list | Feature test |
| 13 | Audit logs outside transactions — no regression | Code review |
| 14 | `php artisan test --filter=Quiz` passes zero failures, zero risky | Test output |
| 15 | PHPStan level 5 on all new and modified files | PHPStan output |

---

## 12. File Manifest

### New Files

| File | Purpose |
|---|---|
| `app/Domain/TenantAdminDashboard/Quiz/Entities/QuestionBankEntity.php` | Aggregate root |
| `app/Domain/TenantAdminDashboard/Quiz/Events/QuestionBankItemCreated.php` | Domain event |
| `app/Domain/TenantAdminDashboard/Quiz/Events/QuestionBankItemArchived.php` | Domain event |
| `app/Domain/TenantAdminDashboard/Quiz/Exceptions/QuestionBankItemNotFoundException.php` | Domain exception |
| `app/Domain/TenantAdminDashboard/Quiz/Exceptions/QuestionBankItemNotPublishedException.php` | Domain exception |
| `app/Domain/TenantAdminDashboard/Quiz/Exceptions/InvalidImportRowException.php` | Domain exception |
| `app/Domain/TenantAdminDashboard/Quiz/Repositories/QuestionBankRepositoryInterface.php` | Domain contract |
| `app/Domain/TenantAdminDashboard/Quiz/Services/QuestionBankImportParserInterface.php` | Service interface |
| `app/Domain/TenantAdminDashboard/Quiz/ValueObjects/QuestionBankProps.php` | Value object |
| `app/Domain/TenantAdminDashboard/Quiz/ValueObjects/QuestionBankStatus.php` | Value object |
| `app/Application/TenantAdminDashboard/Quiz/Commands/CreateQuestionBankItemCommand.php` | DTO |
| `app/Application/TenantAdminDashboard/Quiz/Commands/UpdateQuestionBankItemCommand.php` | DTO |
| `app/Application/TenantAdminDashboard/Quiz/Commands/ChangeQuestionBankItemStatusCommand.php` | DTO |
| `app/Application/TenantAdminDashboard/Quiz/Commands/AddQuestionFromBankCommand.php` | DTO |
| `app/Application/TenantAdminDashboard/Quiz/Queries/ListQuestionBankQuery.php` | Query |
| `app/Application/TenantAdminDashboard/Quiz/Queries/QuestionBankListCriteria.php` | Query criteria |
| `app/Application/TenantAdminDashboard/Quiz/Queries/GetQuestionBankItemQuery.php` | Query |
| `app/Application/TenantAdminDashboard/Quiz/UseCases/CreateQuestionBankItemUseCase.php` | Use case |
| `app/Application/TenantAdminDashboard/Quiz/UseCases/UpdateQuestionBankItemUseCase.php` | Use case |
| `app/Application/TenantAdminDashboard/Quiz/UseCases/ChangeQuestionBankItemStatusUseCase.php` | Use case |
| `app/Application/TenantAdminDashboard/Quiz/UseCases/AddQuestionFromBankUseCase.php` | Use case |
| `app/Application/TenantAdminDashboard/Quiz/UseCases/ImportQuestionBankUseCase.php` | Use case |
| `app/Infrastructure/Persistence/TenantAdminDashboard/Quiz/QuestionBankRecord.php` | Eloquent model |
| `app/Infrastructure/Persistence/TenantAdminDashboard/Quiz/EloquentQuestionBankRepository.php` | Repository |
| `app/Infrastructure/Persistence/TenantAdminDashboard/Quiz/CsvQuestionBankImportParser.php` | Import parser |
| `app/Http/Controllers/Api/TenantAdminDashboard/Quiz/QuestionBankReadController.php` | Controller |
| `app/Http/Controllers/Api/TenantAdminDashboard/Quiz/QuestionBankWriteController.php` | Controller |
| `app/Http/Controllers/Api/TenantAdminDashboard/Quiz/QuestionBankImportController.php` | Controller |
| `database/migrations/tenant/2026_03_21_180B_000001_create_question_bank_table.php` | Migration |
| `database/migrations/tenant/2026_03_21_180B_000002_add_bank_question_id_to_option_and_pair_tables.php` | Migration |
| `database/migrations/tenant/2026_03_21_180B_000003_add_bank_question_id_to_quiz_questions.php` | Migration |
| `routes/tenant_dashboard/question_bank.php` | Route file |
| `tests/Unit/Domain/TenantAdminDashboard/Quiz/Entities/QuestionBankEntityTest.php` | Unit test |
| `tests/Unit/Application/TenantAdminDashboard/Quiz/UseCases/AddQuestionFromBankUseCaseTest.php` | Unit test |
| `tests/Unit/Application/TenantAdminDashboard/Quiz/UseCases/ImportQuestionBankUseCaseTest.php` | Unit test |
| `tests/Unit/Infrastructure/Quiz/CsvQuestionBankImportParserTest.php` | Unit test |
| `tests/Feature/TenantAdminDashboard/Quiz/QuestionBankCrudTest.php` | Feature test |
| `tests/Feature/TenantAdminDashboard/Quiz/QuestionBankImportTest.php` | Feature test |
| `tests/Feature/TenantAdminDashboard/Quiz/AddQuestionFromBankTest.php` | Feature test |

### Modified Files

| File | Change |
|---|---|
| `app/Domain/TenantAdminDashboard/Quiz/Entities/QuizQuestionEntity.php` | Add `bankQuestionId` field |
| `app/Domain/TenantAdminDashboard/Quiz/ValueObjects/QuizQuestionProps.php` (if exists) | Add `bankQuestionId` |
| `app/Application/TenantAdminDashboard/Quiz/UseCases/CreateQuizQuestionUseCase.php` | Auto-write to bank |
| `app/Infrastructure/Persistence/TenantAdminDashboard/Quiz/QuizQuestionRecord.php` | Add `bank_question_id` to fillable |
| `app/Infrastructure/Persistence/TenantAdminDashboard/Quiz/QuizQuestionOptionRecord.php` | Add `bank_question_id` to fillable |
| `app/Infrastructure/Persistence/TenantAdminDashboard/Quiz/QuizQuestionPairRecord.php` | Add `bank_question_id` to fillable |
| Service provider registering quiz bindings | Add `QuestionBankRepositoryInterface` and `QuestionBankImportParserInterface` bindings |
| Capability seeder | Add `quiz_bank.view`, `quiz_bank.create`, `quiz_bank.edit` |
| `tests/Unit/Application/TenantAdminDashboard/Quiz/UseCases/CreateQuizQuestionUseCaseTest.php` | Add bank auto-write tests |

---

*End of Phase 18B Developer Instructions*
*Issued by Principal Engineer — 2026-03-21*
*Next step: Antigravity to produce Phase 18B Implementation Plan for Principal Engineer audit before implementation begins.*
*Note: 18B, 18C, and 18D can run in parallel after 18A is certified.*
