# UBOTZ 2.0 — Phase 18A Developer Instructions

## Quiz Domain Correction & Foundation — Safety Fixes and Question Type Completion

| Field | Value |
|---|---|
| **Document Type** | Developer Instruction (Pre-Implementation Brief) |
| **Phase** | 18A |
| **Series** | Quiz Feature Series (18A → 18B → 18C → 18D → 18E) |
| **Date** | 2026-03-21 |
| **Issued By** | Principal Engineer / Architecture Auditor |
| **Audience** | Antigravity Implementation Team |
| **Expected Deliverable** | Phase 18A Implementation Plan |
| **Prerequisites** | Phase 17 Series CERTIFIED COMPLETE (17A, 17B, 17C, 17D all certified) |

> **This is a safety and correctness phase, not a feature phase. The quiz feature has production-critical defects: student result records can be permanently destroyed, quiz creation has no idempotency protection, three confirmed question types are unimplemented, and student answers are stored in an unstructured JSON blob that cannot support analytics or manual grading. None of these are cosmetic issues. All must be resolved before the quiz feature can be considered production-ready or before any subsequent quiz phases begin.**

---

## 1. Mission Statement

Phase 18A corrects six defects in the existing Quiz bounded context identified during the 2026-03-21 Principal Engineer audit:

1. **No soft deletes on any quiz table** — quiz results (student exam records) are permanently destroyed on delete. This is a compliance violation.
2. **No idempotency on quiz creation** — double-click or network retry creates duplicate quizzes.
3. **Three question types unimplemented** — Fill in the blank, Match the following, and Numerical answer are confirmed business requirements with no schema or logic support.
4. **`quiz_results.responses` is an unstructured JSON blob** — individual question responses cannot be queried, graded, or analysed without parsing an undocumented payload.
5. **No attempt-time question snapshot** — editing or deleting a question after a student starts an attempt corrupts or breaks their in-progress attempt.
6. **Answer options do not support images** — confirmed business requirement: both question stems and answer options support images.

This phase also records the complete decision register from the 2026-03-21 business session so all subsequent quiz phases have a stable reference.

---

## 2. Business Decision Register (2026-03-21)

All decisions locked for the Quiz feature series. No deviation without a new business session.

| ID | Decision | Resolution |
|---|---|---|
| D-1 | Question Bank Model | Option B — Questions live in the bank, quizzes reference by ID, attempts snapshot content at start time |
| D-2 | Manual Grading Queue | Quiz creator owns queue by default, admin can reassign |
| D-3 | Standalone Quiz Access | Subscription plan includes specific quiz IDs — subscribing grants access to those exact quizzes |
| D-4 | Section Configuration | Sections have independent config (time, marks, negative marking per section) |
| D-5 | Exam Hierarchy | Quiz is always tied to exam hierarchy (Exam → Subject → Chapter → Topic → Quiz) |
| D-6 | Proctoring | Honour system only — no technical anti-cheating measures |
| D-7 | Media in Options | Both question stems and answer options support images |
| D-8 | Fill in the Blank Matching | Case-insensitive exact match |
| D-9 | Match the Following Structure | Both simple (1:1) and complex (1:many) supported |

---

## 3. What This Phase Includes

- Soft deletes on all four quiz tables (`quizzes`, `quiz_questions`, `quiz_question_options`, `quiz_results`)
- Idempotency key on quiz creation
- Three new question types: `fill_in_blank`, `match_following`, `numerical`
- New `QuestionType` enum cases for the three new types
- `quiz_question_pairs` table for match-the-following (both simple and complex)
- `image_url` column on `quiz_question_options` (options already have `title` text — add image support)
- New `quiz_result_responses` table replacing the JSON blob in `quiz_results`
- `quiz_attempt_snapshots` table — stores question content at attempt start time
- Updated `StartQuizAttemptUseCase` to write snapshots
- Updated `GradeQuizResultUseCase` to read from snapshots, not live questions
- Updated `SubmitQuizAnswersUseCase` to write structured response rows
- Updated domain entities and value objects for new question types
- Grading logic for fill-in-blank (case-insensitive) and numerical (exact match)
- Full test coverage for all changes

## 3.1 What This Phase Does NOT Include

- Question Bank as a browsable/reusable system (Phase 18B)
- Bulk question import (Phase 18B)
- Sections as first-class entities (Phase 18C)
- Manual grading queue (Phase 18C)
- Standalone quiz + subscription access (Phase 18D)
- Student quiz-taking UI (Phase 18E)
- Match-the-following grading logic — match questions require manual grading in Phase 18C (auto-grading match questions is deferred)
- Audio/video support on question options (images only in 18A — audio/video deferred)

---

## 4. Architecture Decisions

### AD-18A-001: Soft Deletes Are Mandatory on All Four Tables

`quiz_results` records are student examination records — permanent deletion is a compliance violation under the platform's data retention policy (7-year minimum for academic records). `quiz_questions` records, once referenced by a completed attempt, must be preserved for audit purposes. `quiz_question_options` records must be preserved alongside their parent questions.

`quizzes` itself must use soft deletes so archived quizzes can be recovered if archived accidentally, and so historical result records remain linked to a retrievable quiz record.

**Implementation:** Add `deleted_at TIMESTAMP NULL` to all four tables via migration. Add `SoftDeletes` trait to all four Eloquent models. Verify `withTrashed()` is used where needed (e.g. grading use case must load soft-deleted questions when reading attempt snapshots).

### AD-18A-002: Idempotency Key on Quiz Creation Follows Platform Standard

`CreateQuizUseCase` must accept an `idempotencyKey` parameter in `CreateQuizCommand`. The `quizzes` table gains an `idempotency_key VARCHAR(255) NULLABLE UNIQUE(tenant_id, idempotency_key)` column. Pattern identical to `CreateCourseUseCase` post-Phase 17A.

### AD-18A-003: New Question Types Extend `QuestionType` Enum, Not Replace It

`multiple` and `descriptive` are preserved exactly. Three new cases are added:

```php
enum QuestionType: string
{
    case MULTIPLE          = 'multiple';       // MCQ single + multi-select + T/F
    case DESCRIPTIVE       = 'descriptive';    // Short answer + Essay
    case FILL_IN_BLANK     = 'fill_in_blank';  // NEW
    case MATCH_FOLLOWING   = 'match_following';// NEW
    case NUMERICAL         = 'numerical';      // NEW
}
```

True/False remains modelled as `MULTIPLE` with exactly two options. No separate type is needed.

### AD-18A-004: Match the Following Uses a Separate `quiz_question_pairs` Table

The existing `quiz_question_options` table is designed for MCQ options — it has `is_correct`, `sort_order`, and text/image. Match-the-following pairs have a fundamentally different structure: a left-side stem paired with one or more right-side matches, with a `is_correct` flag per pair (for complex matching where some pairs are correct and some are distractors).

Cramming match pairs into `quiz_question_options` would make the schema ambiguous. A dedicated `quiz_question_pairs` table is the correct approach.

```
quiz_question_pairs
├── id
├── tenant_id
├── question_id (FK → quiz_questions)
├── left_text      VARCHAR(500) — the stem
├── left_image_url VARCHAR(500) — optional
├── right_text     VARCHAR(500) — the match
├── right_image_url VARCHAR(500) — optional
├── is_correct     BOOLEAN — true = this is a correct pairing
├── sort_order     TINYINT UNSIGNED
├── created_at, updated_at, deleted_at
```

For simple matching: each left item has exactly one `is_correct = true` pair.
For complex matching: each left item may have multiple `is_correct = true` pairs.

### AD-18A-005: Fill in the Blank Correct Answers Stored in `quiz_question_options`

Fill-in-blank questions store their accepted answers as `quiz_question_options` rows where `is_correct = true`. Multiple accepted answers (variants) are multiple rows. The `title` field holds the accepted answer string. The `image_url` field is null for fill-in-blank options — they are text-only.

Grading logic: `strtolower(trim($studentAnswer)) === strtolower(trim($acceptedAnswer))` — case-insensitive exact match per D-8.

### AD-18A-006: Numerical Answer Stores Correct Value in `quiz_questions`

Numerical questions have a single correct numeric answer. A new `correct_numerical_value DECIMAL(15,4) NULLABLE` column is added to `quiz_questions`. No options rows are created for numerical questions.

Grading logic: exact numeric equality after casting. `(float)$studentAnswer === (float)$correctNumericalValue`. Future phases may add tolerance range — deferred.

### AD-18A-007: `quiz_result_responses` Table Replaces JSON Blob

The `responses JSON` column on `quiz_results` is not removed in this phase — it is kept for backward compatibility with existing records. New attempts write to `quiz_result_responses` AND retain the JSON blob for legacy reads. A migration plan to remove the JSON column is deferred to Phase 18C when all reads are migrated.

New table:
```
quiz_result_responses
├── id
├── tenant_id
├── result_id       (FK → quiz_results)
├── question_id     (FK → quiz_questions — may be soft-deleted, use withTrashed)
├── snapshot_id     (FK → quiz_attempt_snapshots — the version answered)
├── student_answer  TEXT NULLABLE   — raw student input
├── is_correct      BOOLEAN NULLABLE — null = awaiting manual grade
├── marks_awarded   DECIMAL(8,2) NULLABLE — null = not yet graded
├── graded_by       BIGINT UNSIGNED NULLABLE — user_id of grader (null = auto-graded)
├── graded_at       TIMESTAMP NULLABLE
├── created_at, updated_at
```

No `deleted_at` — response records are immutable after creation. A graded response can have its `marks_awarded` updated by a teacher (manual re-grade) but cannot be deleted.

### AD-18A-008: `quiz_attempt_snapshots` Table Captures Question State at Attempt Start

When `StartQuizAttemptUseCase` runs, it reads all questions for the quiz and writes one snapshot row per question. The snapshot stores the full question content as a JSON payload — question title, type, media URLs, options (with text, image, correct flag), pairs (for match), accepted answers (for fill-in-blank), correct value (for numerical).

```
quiz_attempt_snapshots
├── id
├── tenant_id
├── result_id       (FK → quiz_results)
├── question_id     (FK → quiz_questions)
├── question_version JSON — complete question content at snapshot time
├── created_at
```

No `updated_at` or `deleted_at` — snapshots are immutable facts. Once written, they are never modified.

The `question_version` JSON shape:
```json
{
  "id": 42,
  "title": "What is the speed of light?",
  "type": "numerical",
  "grade": 2.00,
  "correct_numerical_value": 299792458,
  "image_url": null,
  "correct_explanation": "c = 299,792,458 m/s",
  "section_key": "physics",
  "difficulty_level": "medium"
}
```

For MCQ the JSON includes `options: [{id, title, image_url, is_correct, sort_order}]`.
For match_following it includes `pairs: [{id, left_text, left_image_url, right_text, right_image_url, is_correct}]`.
For fill_in_blank it includes `accepted_answers: [{id, title}]`.

---

## 5. Domain Layer Changes

### 5.1 `QuestionType` Value Object

**File:** `app/Domain/TenantAdminDashboard/Quiz/ValueObjects/QuestionType.php`

Add three new cases as specified in AD-18A-003. Update any match expressions or validation methods that enumerate question types.

### 5.2 `QuizQuestionEntity` — New Type Support

**File:** `app/Domain/TenantAdminDashboard/Quiz/Entities/QuizQuestionEntity.php`

New fields required:
- `correctNumericalValue: ?float` — for `NUMERICAL` type
- `pairsProvided: bool` — calculated from whether pairs exist, used in `canBeGradedAutomatically()`

New invariants to enforce:

| Type | Invariant |
|---|---|
| `FILL_IN_BLANK` | At least one accepted answer option must exist (minimum 1 option with `is_correct = true`) |
| `MATCH_FOLLOWING` | At least 2 pairs must exist |
| `NUMERICAL` | `correctNumericalValue` must not be null |
| `MULTIPLE` | At least 2 options required (existing rule — preserved) |
| `DESCRIPTIVE` | No options, no pairs, no numerical value (manual grading) |

New method: `canBeGradedAutomatically(): bool`
```php
public function canBeGradedAutomatically(): bool
{
    return match($this->props->type) {
        QuestionType::MULTIPLE        => true,
        QuestionType::FILL_IN_BLANK   => true,
        QuestionType::NUMERICAL       => true,
        QuestionType::MATCH_FOLLOWING => false,  // deferred to 18C
        QuestionType::DESCRIPTIVE     => false,
    };
}
```

### 5.3 New `QuizQuestionPairEntity`

**File:** `app/Domain/TenantAdminDashboard/Quiz/Entities/QuizQuestionPairEntity.php`

Represents one pair in a match-the-following question.

Fields: `id`, `tenantId`, `questionId`, `leftText`, `leftImageUrl`, `rightText`, `rightImageUrl`, `isCorrect`, `sortOrder`

Invariants:
- `leftText` must not be empty
- `rightText` must not be empty
- At least `leftText` OR `leftImageUrl` must be present (same for right side)

### 5.4 New Repository Interfaces

**File:** `app/Domain/TenantAdminDashboard/Quiz/Repositories/QuizQuestionPairRepositoryInterface.php`

```php
interface QuizQuestionPairRepositoryInterface
{
    public function findByQuestionId(int $tenantId, int $questionId): array;
    public function saveMany(array $pairs): void;
    public function deleteByQuestionId(int $tenantId, int $questionId): void;
}
```

**File:** `app/Domain/TenantAdminDashboard/Quiz/Repositories/QuizAttemptSnapshotRepositoryInterface.php`

```php
interface QuizAttemptSnapshotRepositoryInterface
{
    public function saveMany(array $snapshots): void;
    public function findByResultId(int $tenantId, int $resultId): array;
    public function findByResultAndQuestion(int $resultId, int $questionId): ?QuizAttemptSnapshot;
}
```

**File:** `app/Domain/TenantAdminDashboard/Quiz/Repositories/QuizResultResponseRepositoryInterface.php`

```php
interface QuizResultResponseRepositoryInterface
{
    public function saveMany(array $responses): void;
    public function findByResultId(int $tenantId, int $resultId): array;
    public function updateGrade(int $responseId, float $marksAwarded, int $gradedBy): void;
}
```

### 5.5 New Value Object: `QuizAttemptSnapshot`

**File:** `app/Domain/TenantAdminDashboard/Quiz/ValueObjects/QuizAttemptSnapshot.php`

Immutable value object representing the snapshot of a single question at attempt start time. Carries the serialised `question_version` payload.

```php
final readonly class QuizAttemptSnapshot
{
    public function __construct(
        public readonly int    $tenantId,
        public readonly int    $resultId,
        public readonly int    $questionId,
        public readonly array  $questionVersion,   // the full snapshot payload
    ) {}
}
```

---

## 6. Application Layer Changes

### 6.1 `CreateQuizCommand` — Add Idempotency Key

```php
final readonly class CreateQuizCommand
{
    public function __construct(
        // ... existing fields ...
        public readonly string $idempotencyKey,  // ADD
    ) {}
}
```

### 6.2 `CreateQuizUseCase` — Add Idempotency Check

Follow the identical pattern established in `CreateCourseUseCase` (post Phase 17A fix):

```
1. Begin DB transaction
2. Lock tenant row (lockForUpdate)
3. Idempotency lookup by (tenantId, idempotencyKey) → return existing if present
4. Build QuizProps
5. Create QuizEntity
6. Persist quiz
7. Store idempotency record
8. Capture domain events
9. Commit transaction
10. Write audit log — OUTSIDE transaction
11. Dispatch captured events after commit
```

### 6.3 `CreateQuizQuestionUseCase` — Support New Types

Extended to handle three new question type paths:

```
If type == FILL_IN_BLANK:
  → Validate at least 1 accepted answer option provided
  → Persist question
  → Persist options (accepted answers as quiz_question_options rows)

If type == MATCH_FOLLOWING:
  → Validate at least 2 pairs provided
  → Persist question
  → Persist pairs via QuizQuestionPairRepositoryInterface

If type == NUMERICAL:
  → Validate correctNumericalValue is not null
  → Persist question (no options, no pairs)

If type == MULTIPLE or DESCRIPTIVE:
  → Existing logic unchanged
```

### 6.4 `StartQuizAttemptUseCase` — Add Snapshot Writing

This is the most critical change in Phase 18A. After creating the `quiz_results` record, the use case must:

```
1. Load all questions for the quiz (including their options and pairs)
   — use withTrashed() to handle soft-deleted questions that were in the quiz
   — at this point questions should not be soft-deleted, but defensive coding required
2. Build QuizAttemptSnapshot array — one per question
3. Persist all snapshots via QuizAttemptSnapshotRepositoryInterface
4. Return result_id to caller
```

The snapshot must be written in the same DB transaction as the `quiz_results` record. If the transaction rolls back, the snapshots roll back with it — no orphaned snapshots.

**Revised sequence:**
```
1. Validate quiz is ACTIVE and student has access
2. Check attempt count (max_attempts enforcement)
3. Begin DB transaction
4. Create QuizResultEntity (status = started)
5. Persist quiz_results record
6. Load all questions + options + pairs for quiz
7. Build snapshots array
8. Persist all snapshots (quiz_attempt_snapshots)
9. Commit transaction
10. Write audit log (quiz_attempt_started) — OUTSIDE transaction
11. Dispatch QuizAttemptStarted event
12. Return result with snapshot question data for rendering
```

### 6.5 `SubmitQuizAnswersUseCase` — Write Structured Responses

Currently writes to the `responses JSON` blob. After this phase, it must also write to `quiz_result_responses` (one row per question answered).

For auto-gradable question types (`MULTIPLE`, `FILL_IN_BLANK`, `NUMERICAL`), the use case calculates `is_correct` and `marks_awarded` immediately on submission.

For `DESCRIPTIVE` and `MATCH_FOLLOWING`, `is_correct` and `marks_awarded` remain null — awaiting manual grading (Phase 18C).

**Auto-grading logic per type:**

`MULTIPLE`:
```php
// Single correct: student selected the one correct option
// Multi-select: all correct options selected AND no incorrect options selected
// Partial marks: (correct selected / total correct) × question grade
```

`FILL_IN_BLANK`:
```php
$studentAnswer  = strtolower(trim($response->studentAnswer));
$acceptedAnswers = array_map(
    fn($a) => strtolower(trim($a->title)),
    $snapshot->acceptedAnswers
);
$isCorrect = in_array($studentAnswer, $acceptedAnswers, true);
$marksAwarded = $isCorrect ? $question->grade : ($negativeMarkingEnabled ? -$negativeMarkValue : 0);
```

`NUMERICAL`:
```php
$isCorrect = (float)$response->studentAnswer === (float)$snapshot->correctNumericalValue;
$marksAwarded = $isCorrect ? $question->grade : ($negativeMarkingEnabled ? -$negativeMarkValue : 0);
```

**The `responses JSON` blob is still written for backward compatibility.** It is not removed until Phase 18C.

### 6.6 `GradeQuizResultUseCase` — Read from Snapshots

Currently reads live questions to calculate final scores. After this phase it must:
- Read from `quiz_result_responses` for individual question scores
- Sum `marks_awarded` across all response rows for `total_score`
- Set `passed` based on `total_score >= quiz.pass_mark`
- For results with pending manual grading (`is_correct = null` rows), calculate `total_score` from auto-graded questions only and mark the result as `partially_graded` (new status — see §6.7)

### 6.7 `QuizResultStatus` — Add `PARTIALLY_GRADED`

The current result statuses are `started`, `submitted`, `graded`. A new status is needed:

```php
enum QuizResultStatus: string
{
    case STARTED           = 'started';
    case SUBMITTED         = 'submitted';
    case PARTIALLY_GRADED  = 'partially_graded';  // NEW — auto-graded done, manual pending
    case GRADED            = 'graded';             // all questions have marks_awarded
}
```

Transition rules:
- `submitted → partially_graded` (when quiz has mix of auto + manual questions)
- `submitted → graded` (when all questions are auto-gradable)
- `partially_graded → graded` (when manual grading completes all pending responses)

---

## 7. Infrastructure Layer Changes

### 7.1 Database Migrations

All migrations go in `database/migrations/tenant/`.

**Migration 1: Add soft deletes to quiz tables**
File: `2026_03_21_000001_add_soft_deletes_to_quiz_tables.php`

```php
public function up(): void
{
    foreach (['quizzes', 'quiz_questions', 'quiz_question_options', 'quiz_results'] as $table) {
        Schema::table($table, function (Blueprint $table) {
            $table->softDeletes();
        });
    }
}
```

**Migration 2: Add idempotency key to quizzes**
File: `2026_03_21_000002_add_idempotency_key_to_quizzes.php`

```php
Schema::table('quizzes', function (Blueprint $table) {
    $table->string('idempotency_key', 255)->nullable()->after('created_by');
    $table->unique(['tenant_id', 'idempotency_key'], 'uq_quizzes_tenant_idempotency');
});
```

**Migration 3: Extend quiz_questions for new types**
File: `2026_03_21_000003_extend_quiz_questions_for_new_types.php`

```php
Schema::table('quiz_questions', function (Blueprint $table) {
    $table->decimal('correct_numerical_value', 15, 4)->nullable()->after('grade');
    // image_url already exists on quiz_questions — confirmed in schema
    // No changes needed to the existing text fields
});
```

**Migration 4: Add image_url to quiz_question_options**
File: `2026_03_21_000004_add_image_url_to_quiz_question_options.php`

```php
Schema::table('quiz_question_options', function (Blueprint $table) {
    $table->string('image_url', 500)->nullable()->after('title');
});
```

**Migration 5: Create quiz_question_pairs table**
File: `2026_03_21_000005_create_quiz_question_pairs_table.php`

```php
Schema::create('quiz_question_pairs', function (Blueprint $table) {
    $table->id();
    $table->foreignId('tenant_id')->constrained('tenants');
    $table->foreignId('question_id')->constrained('quiz_questions');
    $table->string('left_text', 500);
    $table->string('left_image_url', 500)->nullable();
    $table->string('right_text', 500);
    $table->string('right_image_url', 500)->nullable();
    $table->boolean('is_correct')->default(true);
    $table->unsignedTinyInteger('sort_order')->default(0);
    $table->timestamps();
    $table->softDeletes();

    $table->index('tenant_id');
    $table->index('question_id');
});
```

**Migration 6: Create quiz_attempt_snapshots table**
File: `2026_03_21_000006_create_quiz_attempt_snapshots_table.php`

```php
Schema::create('quiz_attempt_snapshots', function (Blueprint $table) {
    $table->id();
    $table->foreignId('tenant_id')->constrained('tenants');
    $table->foreignId('result_id')->constrained('quiz_results');
    $table->unsignedBigInteger('question_id'); // NOT FK — question may be soft-deleted
    $table->json('question_version');
    $table->timestamp('created_at')->useCurrent();
    // No updated_at — immutable
    // No deleted_at — immutable

    $table->index(['result_id', 'question_id'], 'idx_snapshots_result_question');
    $table->index('tenant_id');
});
```

Note: `question_id` on `quiz_attempt_snapshots` is NOT a foreign key constraint. A soft-deleted question must still be referenceable from a historical snapshot. A FK constraint would prevent this.

**Migration 7: Create quiz_result_responses table**
File: `2026_03_21_000007_create_quiz_result_responses_table.php`

```php
Schema::create('quiz_result_responses', function (Blueprint $table) {
    $table->id();
    $table->foreignId('tenant_id')->constrained('tenants');
    $table->foreignId('result_id')->constrained('quiz_results');
    $table->unsignedBigInteger('question_id');   // NOT FK — question may be soft-deleted
    $table->unsignedBigInteger('snapshot_id');    // FK → quiz_attempt_snapshots
    $table->text('student_answer')->nullable();
    $table->boolean('is_correct')->nullable();
    $table->decimal('marks_awarded', 8, 2)->nullable();
    $table->unsignedBigInteger('graded_by')->nullable();
    $table->timestamp('graded_at')->nullable();
    $table->timestamps();
    // No deleted_at — response records are immutable (only marks_awarded updatable)

    $table->index(['result_id'], 'idx_responses_result');
    $table->index(['result_id', 'question_id'], 'idx_responses_result_question');
    $table->index('tenant_id');
    $table->index(['result_id', 'is_correct'], 'idx_responses_grading_queue');
});
```

**Migration 8: Add partially_graded to quiz_results status**
File: `2026_03_21_000008_add_partially_graded_status_to_quiz_results.php`

No schema change needed if `status` is `VARCHAR` — the new enum value is valid as a string. Verify the column type and add a comment documenting valid values.

### 7.2 Eloquent Model Updates

| Model | Change |
|---|---|
| `QuizRecord` | Add `SoftDeletes` trait. Add `idempotency_key` to `$fillable`. |
| `QuizQuestionRecord` | Add `SoftDeletes` trait. Add `correct_numerical_value` to `$fillable`. |
| `QuizQuestionOptionRecord` | Add `SoftDeletes` trait. Add `image_url` to `$fillable`. |
| `QuizResultRecord` | Add `SoftDeletes` trait. |

### 7.3 New Eloquent Models

| Model | Table | Notes |
|---|---|---|
| `QuizQuestionPairRecord` | `quiz_question_pairs` | `BelongsToTenant`, `SoftDeletes` |
| `QuizAttemptSnapshotRecord` | `quiz_attempt_snapshots` | `BelongsToTenant`. No `SoftDeletes`. No `updated_at`. |
| `QuizResultResponseRecord` | `quiz_result_responses` | `BelongsToTenant`. No `SoftDeletes`. |

### 7.4 New Repository Implementations

| Interface | Implementation |
|---|---|
| `QuizQuestionPairRepositoryInterface` | `EloquentQuizQuestionPairRepository` |
| `QuizAttemptSnapshotRepositoryInterface` | `EloquentQuizAttemptSnapshotRepository` |
| `QuizResultResponseRepositoryInterface` | `EloquentQuizResultResponseRepository` |

---

## 8. Business Rules (Non-Negotiable)

| ID | Rule | Enforcement |
|---|---|---|
| BR-01 | `quiz_results` records are never hard-deleted | `SoftDeletes` + no `forceDelete()` in any quiz use case |
| BR-02 | `quiz_question_options` records are never hard-deleted | `SoftDeletes` + no `forceDelete()` |
| BR-03 | `quiz_attempt_snapshots` are immutable once written | No update or delete methods on `QuizAttemptSnapshotRecord` |
| BR-04 | `quiz_result_responses` `student_answer` and `is_correct` are immutable once set | Only `marks_awarded`, `graded_by`, `graded_at` are updatable |
| BR-05 | `GradeQuizResultUseCase` reads from snapshots, never from live questions | Code review + unit test with deleted question scenario |
| BR-06 | Fill-in-blank grading is case-insensitive exact match | Grading unit test with case variants |
| BR-07 | Numerical grading is exact float equality | Grading unit test |
| BR-08 | Match-the-following questions produce `is_correct = null` on submission (manual grading) | Unit test |
| BR-09 | Descriptive questions produce `is_correct = null` on submission (manual grading) | Existing behaviour preserved |
| BR-10 | Audit logs written outside DB transactions — no regression from Phase 17A | Code review |
| BR-11 | `StartQuizAttemptUseCase` snapshots all questions in same transaction as result creation | Unit test with simulated failure mid-snapshot |
| BR-12 | A quiz with at least one non-auto-gradable question transitions to `partially_graded` after submission, not `graded` | Unit test |

---

## 9. Test Plan

### 9.1 Unit Tests — Domain

**File:** `tests/Unit/Domain/TenantAdminDashboard/Quiz/Entities/QuizQuestionEntityNewTypesTest.php`

| Test | Description |
|---|---|
| `test_fill_in_blank_requires_at_least_one_accepted_answer` | BR enforcement |
| `test_match_following_requires_at_least_two_pairs` | BR enforcement |
| `test_numerical_requires_correct_value` | BR enforcement |
| `test_fill_in_blank_can_be_graded_automatically` | `canBeGradedAutomatically()` |
| `test_match_following_cannot_be_graded_automatically` | Deferred to 18C |
| `test_descriptive_cannot_be_graded_automatically` | Existing type preserved |

**File:** `tests/Unit/Domain/TenantAdminDashboard/Quiz/Grading/FillInBlankGradingTest.php`

| Test | Description |
|---|---|
| `test_exact_match_is_correct` | "photosynthesis" = "photosynthesis" |
| `test_case_insensitive_match_is_correct` | "PHOTOSYNTHESIS" = "photosynthesis" |
| `test_leading_trailing_whitespace_trimmed` | " photosynthesis " = "photosynthesis" |
| `test_wrong_answer_is_incorrect` | "respiration" ≠ "photosynthesis" |
| `test_multiple_accepted_answers_any_matches` | "photo synthesis" accepted when variant exists |

**File:** `tests/Unit/Domain/TenantAdminDashboard/Quiz/Grading/NumericalGradingTest.php`

| Test | Description |
|---|---|
| `test_exact_numeric_match_is_correct` | 42 = 42 |
| `test_different_numeric_is_incorrect` | 43 ≠ 42 |
| `test_float_precision_handled` | 3.14 = 3.14 |

### 9.2 Unit Tests — Application

**File:** `tests/Unit/Application/TenantAdminDashboard/Quiz/UseCases/StartQuizAttemptUseCaseTest.php`

| Test | Description |
|---|---|
| `test_snapshots_written_on_attempt_start` | Snapshot rows created for all questions |
| `test_snapshot_written_in_same_transaction_as_result` | Transaction rollback removes both |
| `test_soft_deleted_question_excluded_from_snapshot` | Guard against edge case |

**File:** `tests/Unit/Application/TenantAdminDashboard/Quiz/UseCases/SubmitQuizAnswersUseCaseTest.php`

| Test | Description |
|---|---|
| `test_auto_grades_multiple_choice_on_submission` | `is_correct` set immediately |
| `test_auto_grades_fill_in_blank_on_submission` | `is_correct` set immediately |
| `test_auto_grades_numerical_on_submission` | `is_correct` set immediately |
| `test_descriptive_answer_left_ungraded` | `is_correct = null` |
| `test_match_following_answer_left_ungraded` | `is_correct = null` |
| `test_result_transitions_to_partially_graded_when_manual_pending` | BR-12 |
| `test_result_transitions_to_graded_when_all_auto` | All auto-gradable questions |

**File:** `tests/Unit/Application/TenantAdminDashboard/Quiz/UseCases/CreateQuizUseCaseTest.php`

| Test | Description |
|---|---|
| `test_idempotency_returns_existing_quiz_on_retry` | Duplicate key returns first record |
| `test_audit_log_written_after_commit` | Not inside transaction |

### 9.3 Feature Tests

**File:** `tests/Feature/TenantAdminDashboard/Quiz/QuizSoftDeleteTest.php`

| Test | Description |
|---|---|
| `test_deleted_quiz_not_returned_in_list` | Soft delete respected |
| `test_deleted_question_not_returned_in_quiz` | Soft delete respected |
| `test_quiz_result_record_soft_deleted_not_hard_deleted` | BR-01 |
| `test_deleted_quiz_result_not_returned_in_results_list` | Soft delete respected |

**File:** `tests/Feature/TenantAdminDashboard/Quiz/QuizNewQuestionTypesTest.php`

| Test | Description |
|---|---|
| `test_create_fill_in_blank_question` | Full stack test |
| `test_create_match_following_question_simple` | Simple 1:1 pairs |
| `test_create_match_following_question_complex` | 1:many pairs |
| `test_create_numerical_question` | With correct_numerical_value |
| `test_fill_in_blank_without_answers_rejected` | 422 response |
| `test_match_following_without_pairs_rejected` | 422 response |

### 9.4 Regression

```powershell
docker exec -it ubotz_backend sh -c "cd /var/www && php artisan test --filter=Quiz 2>&1 | tail -5"
```

All pre-existing quiz tests must pass. Test count must increase — not decrease — from the baseline.

---

## 10. Quality Gate

| # | Check | How to Verify |
|---|---|---|
| 1 | All four quiz tables have `deleted_at` column | Migration + `DESCRIBE` query |
| 2 | All four Eloquent models have `SoftDeletes` trait | Code review |
| 3 | `quizzes.idempotency_key` column exists with UNIQUE constraint | Migration + DB check |
| 4 | `CreateQuizUseCase` uses idempotency pattern | Code review + unit test |
| 5 | `QuestionType` enum has FILL_IN_BLANK, MATCH_FOLLOWING, NUMERICAL | Enum inspection |
| 6 | `quiz_question_options.image_url` column exists | Migration check |
| 7 | `quiz_question_pairs` table exists with correct schema | Migration check |
| 8 | `quiz_attempt_snapshots` table exists, `question_id` is NOT a FK constraint | Migration check |
| 9 | `quiz_result_responses` table exists | Migration check |
| 10 | `StartQuizAttemptUseCase` writes snapshots in same transaction as result | Code review + unit test |
| 11 | `GradeQuizResultUseCase` reads from snapshots not live questions | Code review |
| 12 | Fill-in-blank grading is case-insensitive | Unit test |
| 13 | `partially_graded` status exists and transitions correctly | Unit test |
| 14 | Audit logs outside transactions — no regression | Code review |
| 15 | `php artisan test --filter=Quiz` passes with zero failures, zero risky | Test output |
| 16 | PHPStan level 5 on all modified and new files | PHPStan output — zero errors |

---

## 11. File Manifest

### New Files

| File | Purpose |
|---|---|
| `app/Domain/TenantAdminDashboard/Quiz/Entities/QuizQuestionPairEntity.php` | Match pair entity |
| `app/Domain/TenantAdminDashboard/Quiz/ValueObjects/QuizAttemptSnapshot.php` | Immutable snapshot VO |
| `app/Domain/TenantAdminDashboard/Quiz/ValueObjects/QuizResultStatus.php` | Extended status enum |
| `app/Domain/TenantAdminDashboard/Quiz/Repositories/QuizQuestionPairRepositoryInterface.php` | Domain contract |
| `app/Domain/TenantAdminDashboard/Quiz/Repositories/QuizAttemptSnapshotRepositoryInterface.php` | Domain contract |
| `app/Domain/TenantAdminDashboard/Quiz/Repositories/QuizResultResponseRepositoryInterface.php` | Domain contract |
| `app/Infrastructure/Persistence/TenantAdminDashboard/Quiz/QuizQuestionPairRecord.php` | Eloquent model |
| `app/Infrastructure/Persistence/TenantAdminDashboard/Quiz/QuizAttemptSnapshotRecord.php` | Eloquent model |
| `app/Infrastructure/Persistence/TenantAdminDashboard/Quiz/QuizResultResponseRecord.php` | Eloquent model |
| `app/Infrastructure/Persistence/TenantAdminDashboard/Quiz/EloquentQuizQuestionPairRepository.php` | Repository impl |
| `app/Infrastructure/Persistence/TenantAdminDashboard/Quiz/EloquentQuizAttemptSnapshotRepository.php` | Repository impl |
| `app/Infrastructure/Persistence/TenantAdminDashboard/Quiz/EloquentQuizResultResponseRepository.php` | Repository impl |
| `database/migrations/tenant/2026_03_21_000001_add_soft_deletes_to_quiz_tables.php` | Migration |
| `database/migrations/tenant/2026_03_21_000002_add_idempotency_key_to_quizzes.php` | Migration |
| `database/migrations/tenant/2026_03_21_000003_extend_quiz_questions_for_new_types.php` | Migration |
| `database/migrations/tenant/2026_03_21_000004_add_image_url_to_quiz_question_options.php` | Migration |
| `database/migrations/tenant/2026_03_21_000005_create_quiz_question_pairs_table.php` | Migration |
| `database/migrations/tenant/2026_03_21_000006_create_quiz_attempt_snapshots_table.php` | Migration |
| `database/migrations/tenant/2026_03_21_000007_create_quiz_result_responses_table.php` | Migration |
| `database/migrations/tenant/2026_03_21_000008_add_partially_graded_status_to_quiz_results.php` | Migration |
| `tests/Unit/Domain/TenantAdminDashboard/Quiz/Entities/QuizQuestionEntityNewTypesTest.php` | Unit test |
| `tests/Unit/Domain/TenantAdminDashboard/Quiz/Grading/FillInBlankGradingTest.php` | Unit test |
| `tests/Unit/Domain/TenantAdminDashboard/Quiz/Grading/NumericalGradingTest.php` | Unit test |
| `tests/Unit/Application/TenantAdminDashboard/Quiz/UseCases/StartQuizAttemptUseCaseTest.php` | Unit test |
| `tests/Unit/Application/TenantAdminDashboard/Quiz/UseCases/SubmitQuizAnswersUseCaseTest.php` | Unit test |
| `tests/Unit/Application/TenantAdminDashboard/Quiz/UseCases/CreateQuizUseCaseTest.php` | Unit test |
| `tests/Feature/TenantAdminDashboard/Quiz/QuizSoftDeleteTest.php` | Feature test |
| `tests/Feature/TenantAdminDashboard/Quiz/QuizNewQuestionTypesTest.php` | Feature test |

### Modified Files

| File | Change |
|---|---|
| `app/Domain/TenantAdminDashboard/Quiz/ValueObjects/QuestionType.php` | Add 3 new cases |
| `app/Domain/TenantAdminDashboard/Quiz/Entities/QuizQuestionEntity.php` | New type fields + invariants + `canBeGradedAutomatically()` |
| `app/Application/TenantAdminDashboard/Quiz/Commands/CreateQuizCommand.php` | Add `idempotencyKey` field |
| `app/Application/TenantAdminDashboard/Quiz/UseCases/CreateQuizUseCase.php` | Add idempotency pattern |
| `app/Application/TenantAdminDashboard/Quiz/UseCases/CreateQuizQuestionUseCase.php` | Handle 3 new types |
| `app/Application/TenantAdminDashboard/Quiz/UseCases/StartQuizAttemptUseCase.php` | Add snapshot writing |
| `app/Application/TenantAdminDashboard/Quiz/UseCases/SubmitQuizAnswersUseCase.php` | Write structured responses + auto-grade |
| `app/Application/TenantAdminDashboard/Quiz/UseCases/GradeQuizResultUseCase.php` | Read from snapshots |
| `app/Infrastructure/Persistence/TenantAdminDashboard/Quiz/QuizRecord.php` | Add SoftDeletes + idempotency_key |
| `app/Infrastructure/Persistence/TenantAdminDashboard/Quiz/QuizQuestionRecord.php` | Add SoftDeletes + correct_numerical_value |
| `app/Infrastructure/Persistence/TenantAdminDashboard/Quiz/QuizQuestionOptionRecord.php` | Add SoftDeletes + image_url |
| `app/Infrastructure/Persistence/TenantAdminDashboard/Quiz/QuizResultRecord.php` | Add SoftDeletes |
| Service provider registering quiz bindings | Add 3 new repository bindings |

---

## 12. Phase 18 Series Roadmap (For Reference)

| Phase | Scope | Blocked Until |
|---|---|---|
| **18A** | Safety fixes + question type completion + structured responses + attempt snapshot | Nothing — starts now |
| **18B** | Question Bank as reusable entity + browse/search UI + bulk import | 18A complete |
| **18C** | Sections as first-class entities + manual grading queue + teacher assignment | 18A complete |
| **18D** | Standalone quiz lifecycle + subscription plan quiz ID entitlements | 18A complete, 18C for grading queue |
| **18E** | Student quiz-taking UI (attempt interface, timer, result screen, leaderboard) | 18A, 18B, 18C complete |

18B, 18C, and 18D can run in parallel after 18A is certified.

---

*End of Phase 18A Developer Instructions*
*Issued by Principal Engineer — 2026-03-21*
*Next step: Antigravity to produce Phase 18A Implementation Plan for Principal Engineer audit before implementation begins.*
