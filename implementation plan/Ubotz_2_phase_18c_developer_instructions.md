# UBOTZ 2.0 — Phase 18C Developer Instructions

## Quiz Feature Series — Sections as First-Class Entities & Manual Grading Queue

| Field | Value |
|---|---|
| **Document Type** | Developer Instruction (Pre-Implementation Brief) |
| **Phase** | 18C |
| **Series** | Quiz Feature Series (18A → 18B → 18C → 18D → 18E) |
| **Date** | 2026-03-21 |
| **Issued By** | Principal Engineer / Architecture Auditor |
| **Audience** | Antigravity Implementation Team |
| **Expected Deliverable** | Phase 18C Implementation Plan |
| **Prerequisites** | Phase 18A CERTIFIED COMPLETE |
| **Parallel With** | Phase 18B (no dependency between 18B and 18C) |

> **This phase completes two critical systems that Phase 18A deferred. First: sections currently live as a JSON blob on the quizzes table — independent section configuration (time limits, marks, negative marking) cannot be correctly enforced against an unstructured payload. Second: descriptive and match-following questions have been producing `is_correct = null` response rows since 18A but nothing consumes or resolves them — the grading queue is data with no workflow. Both must be fixed before the quiz feature is usable for real coaching institute mock tests.**

---

## 1. Mission Statement

Phase 18C delivers two independent but equally important systems:

**System 1 — Sections as First-Class Entities**

The `sections JSON` blob on `quizzes` is replaced with a proper `quiz_sections` table. Each section becomes a named, ordered, independently configurable entity. Decision D-4 from the 2026-03-21 business session confirmed: sections have independent configuration — their own time limit, marks per question, and negative marking rules. A JSON blob cannot enforce this at the domain or database level. A JSON blob cannot be queried. A JSON blob cannot be validated independently. This must be corrected before mock tests are usable.

**System 2 — Manual Grading Queue**

Since Phase 18A, descriptive and match-following questions produce `quiz_result_responses` rows with `is_correct = null` and `marks_awarded = null`. These rows exist but nothing acts on them. Phase 18C introduces the grading workflow: a queue of pending responses, assignment to a grader, the grading UI surface (API-level), bulk grading by question across all submissions, and the completion trigger that transitions a result from `partially_graded` to `graded`. Decision D-2 confirmed: quiz creator owns the queue by default, admin can reassign.

This phase also removes the legacy `responses JSON` blob from `quiz_results` — deferred from 18A per AD-18A-007. By the time 18C runs, all active attempts use `quiz_result_responses`. The JSON blob is safe to remove.

---

## 2. What This Phase Includes

**Sections:**
- `quiz_sections` table — one row per section per quiz
- `QuizSectionEntity` — named section with independent config
- Migrate existing `sections JSON` data to `quiz_sections` rows
- Remove `sections JSON` column from `quizzes` table (post-migration)
- `section_key` on `quiz_questions` links questions to their section
- `CreateQuizSectionUseCase`, `UpdateQuizSectionUseCase`, `DeleteQuizSectionUseCase`, `ReorderQuizSectionsUseCase`
- `StartQuizAttemptUseCase` updated to enforce section-level time limits
- Snapshot updated to carry section config at attempt start time
- Section-aware API endpoints

**Manual Grading Queue:**
- `QuizGradingAssignment` entity — tracks who grades which result
- `GradeQuizResponseUseCase` — grade a single response (replaces monolithic `GradeQuizResultUseCase`)
- `BulkGradeByQuestionUseCase` — grade all submissions for one question at once
- `ReassignGradingUseCase` — admin reassigns grading from creator to another teacher
- `GetGradingQueueQuery` — paginated list of pending responses for a grader
- `CompleteGradingUseCase` — finalises result when all pending responses are graded
- `GradeQuizResultUseCase` updated to reflect new grading architecture
- Match-the-following auto-grading logic (deferred from 18A)

**Cleanup:**
- Remove `responses JSON` column from `quiz_results`
- Verify all reads have migrated to `quiz_result_responses`

## 2.1 What This Phase Does NOT Include

- Standalone quiz lifecycle + subscription access (Phase 18D)
- Student quiz-taking UI (Phase 18E)
- Random question selection from bank per section (depends on 18B — available in 18E)
- Section-level leaderboards (Phase 18E)
- Per-section attempt time tracking on frontend (Phase 18E)

---

## 3. Business Decision Reference

From the 2026-03-21 session — relevant to this phase:

| ID | Decision | Resolution |
|---|---|---|
| D-2 | Manual Grading Queue | Quiz creator owns queue by default, admin can reassign |
| D-4 | Section Configuration | Sections have independent config (time, marks, negative marking per section) |

---

## 4. Part 1 — Sections as First-Class Entities

### 4.1 Current State

`quizzes.sections` is a JSON column containing an array of section descriptors. The `SectionConfiguration` value object parses and validates this JSON. Questions reference a section via `quiz_questions.section_key` (a string). There is no foreign key, no enforcement that `section_key` on a question actually matches a valid section in the quiz, and no way to enforce independent section configuration against individual questions.

Example of current JSON structure (inferred from `SectionConfiguration` VO):
```json
[
  {
    "key": "physics",
    "title": "Physics",
    "time_minutes": 60,
    "negative_marking": 0.25,
    "default_mark": 4
  },
  {
    "key": "chemistry",
    "title": "Chemistry",
    "time_minutes": 45,
    "negative_marking": 0.25,
    "default_mark": 4
  }
]
```

### 4.2 Target State

```
quiz_sections table
├── id (PK)
├── tenant_id
├── quiz_id (FK → quizzes)
├── key (VARCHAR 100) — machine identifier e.g. "physics"
├── title (VARCHAR 255) — display name e.g. "Section A: Physics"
├── sort_order (TINYINT)
├── time_minutes (INT UNSIGNED NULLABLE) — null = uses quiz-level time
├── negative_marking (DECIMAL 5,2 NULLABLE) — null = uses quiz-level config
├── default_mark (DECIMAL 8,2 NULLABLE) — null = uses question-level grade
├── created_at, updated_at, deleted_at (soft deletes)

quiz_questions.section_id (FK → quiz_sections)
— replaces section_key string with typed FK
```

### 4.3 Architecture Decisions for Sections

**AD-18C-001: `section_key` String Is Preserved on `quiz_questions` Alongside New `section_id`**

The migration adds `section_id` as a nullable FK to `quiz_questions`. After the data migration moves all existing JSON sections to `quiz_sections` rows and populates `section_id` on questions, `section_key` is kept as a legacy column — not dropped. It is marked deprecated in the model. The developer must NOT remove `section_key` until a full audit confirms no query, report, or snapshot payload reads it. That removal is deferred to Phase 18E.

**Rationale:** The 18A snapshot system serialises question data including `section_key` into `quiz_attempt_snapshots`. Changing this payload schema for historical snapshots is risky. The string key is harmless to keep as a redundant field on the row.

**AD-18C-002: Section Config Inheritance**

Section-level config fields are all nullable. A null value means "inherit from quiz level". The resolution order for any config field:

```
section.time_minutes ?? quiz.time_minutes
section.negative_marking ?? quiz.negative_marking
section.default_mark (applied to question if question.grade is null)
```

This means a quiz can have a global config and override specific sections. The `QuizSectionEntity` must implement `resolveTimeMinutes(QuizEntity $quiz): int` and `resolveNegativeMarking(QuizEntity $quiz): float` helper methods.

**AD-18C-003: `QuizSectionEntity` Is a Child Entity of `QuizEntity`, Not an Aggregate Root**

Sections do not have an independent lifecycle. A section only exists within a quiz. Deleting a quiz soft-deletes all its sections. Creating a section requires a quiz context. There is no use case for browsing sections across quizzes.

**AD-18C-004: `StartQuizAttemptUseCase` Snapshot Must Carry Section Config**

The attempt snapshot for each question must include its resolved section configuration at attempt start time. This means the `question_version` JSON payload in `quiz_attempt_snapshots` gains a `section` field:

```json
{
  "id": 42,
  "title": "What is kinetic energy?",
  "type": "multiple",
  "grade": 4.00,
  "section": {
    "id": 7,
    "key": "physics",
    "title": "Section A: Physics",
    "time_minutes": 60,
    "negative_marking": 0.25,
    "resolved_negative_marking": 0.25,
    "resolved_time_minutes": 60
  }
}
```

The `resolved_*` fields carry the effective config after inheritance resolution. The student's timer and grading engine read from resolved values, never re-computing from the quiz entity after the attempt starts.

**AD-18C-005: Data Migration Strategy for Existing JSON Sections**

The migration must:
1. Read all `quizzes` rows with non-null `sections` JSON
2. Parse each JSON array
3. For each section object, insert a `quiz_sections` row
4. For each `quiz_questions` row, look up the matching section by `(quiz_id, section_key)` and set `section_id`
5. After verifying all questions have `section_id` set, the `sections` JSON column is removed in a follow-up migration

This migration must be idempotent — running it twice must not duplicate sections.

---

## 5. Part 1 — Domain Layer (Sections)

### 5.1 `QuizSectionEntity`

**File:** `app/Domain/TenantAdminDashboard/Quiz/Entities/QuizSectionEntity.php`

Fields:
- `id: ?int`
- `tenantId: int`
- `quizId: int`
- `key: string` — machine identifier, unique per quiz
- `title: string` — display name
- `sortOrder: int`
- `timeMinutes: ?int`
- `negativemarking: ?float`
- `defaultMark: ?float`

Invariants:
- `key` must be non-empty, alphanumeric + underscores only, max 100 chars
- `title` must be non-empty, max 255 chars
- `sortOrder` must be >= 0
- `timeMinutes` if set must be >= 1
- `negativeMarking` if set must be >= 0
- `defaultMark` if set must be > 0

Methods:
- `resolveTimeMinutes(int $quizTimeMinutes): int` — returns own `timeMinutes ?? $quizTimeMinutes`
- `resolveNegativeMarking(float $quizNegativeMarking): float` — returns own `negativemarking ?? $quizNegativeMarking`

### 5.2 New Repository Interface

**File:** `app/Domain/TenantAdminDashboard/Quiz/Repositories/QuizSectionRepositoryInterface.php`

```php
interface QuizSectionRepositoryInterface
{
    public function save(QuizSectionEntity $section): QuizSectionEntity;
    public function findByQuizId(int $tenantId, int $quizId): array;
    public function findById(int $tenantId, int $id): ?QuizSectionEntity;
    public function deleteByQuizId(int $tenantId, int $quizId): void;
    public function reorder(int $tenantId, int $quizId, array $orderedIds): void;
}
```

### 5.3 `QuizEntity` — Section-Awareness

`QuizEntity` gains awareness of its sections for config resolution. Two new methods:

```php
public function hasIndependentSectionConfig(): bool
{
    // Returns true if any section has non-null time/marking config
    // Used by StartQuizAttemptUseCase to decide whether to load section data
}

public function isSectioned(): bool
{
    // Returns true if the quiz has any sections defined
}
```

`QuizEntity` itself does not own the section collection — sections are loaded separately by the application layer and passed in when needed.

---

## 6. Part 1 — Application Layer (Sections)

### 6.1 New Use Cases

**`CreateQuizSectionUseCase`**
```
1. Validate quiz exists and is DRAFT or ACTIVE (cannot add sections to ARCHIVED)
2. Validate section key is unique within quiz
3. Begin DB transaction
4. Create QuizSectionEntity
5. Persist section
6. Commit transaction
7. Write audit log (quiz_section.created) — OUTSIDE transaction
```

**`UpdateQuizSectionUseCase`**
```
1. Load section, verify belongs to quiz and tenant
2. If key changes: validate new key is unique within quiz
3. Begin DB transaction
4. Update section entity
5. Persist
6. Commit
7. Write audit log (quiz_section.updated) — OUTSIDE transaction
```

**`DeleteQuizSectionUseCase`**

A section cannot be deleted if it has questions assigned to it. The use case must check `quiz_questions` count where `section_id = this section` before allowing deletion.

```
1. Load section, verify belongs to quiz and tenant
2. Count questions assigned to section
3. If count > 0: throw QuizSectionHasQuestionsException
4. Soft delete section
5. Write audit log (quiz_section.deleted) — OUTSIDE transaction
```

**`ReorderQuizSectionsUseCase`**
```
1. Validate all provided section IDs belong to the quiz
2. Update sort_order for each section based on position in provided array
3. Single DB update (not N updates)
```

### 6.2 `StartQuizAttemptUseCase` — Section Config in Snapshot

Updated to load sections when building snapshots:

```
// After loading questions for snapshot:
$sections = $this->sectionRepository->findByQuizId($tenantId, $quizId);
$sectionMap = collect($sections)->keyBy('id');

foreach ($questions as $question) {
    $section = $question->sectionId
        ? $sectionMap[$question->sectionId] ?? null
        : null;

    $resolvedTimeMinutes = $section
        ? $section->resolveTimeMinutes($quiz->timeMinutes)
        : $quiz->timeMinutes;

    $resolvedNegativeMarking = $section
        ? $section->resolveNegativeMarking($quiz->negativeMarking)
        : $quiz->negativeMarking;

    // Build snapshot with section payload
}
```

### 6.3 New API Endpoints for Sections

Routes added to `routes/tenant_dashboard/quiz.php` under the existing quiz route group:

| Method | URI | Purpose | Capability |
|---|---|---|---|
| `GET` | `/api/tenant/quizzes/{quizId}/sections` | List sections | `quiz.view` |
| `POST` | `/api/tenant/quizzes/{quizId}/sections` | Create section | `quiz.edit` |
| `PUT` | `/api/tenant/quizzes/{quizId}/sections/{sectionId}` | Update section | `quiz.edit` |
| `DELETE` | `/api/tenant/quizzes/{quizId}/sections/{sectionId}` | Delete section | `quiz.edit` |
| `POST` | `/api/tenant/quizzes/{quizId}/sections/reorder` | Reorder sections | `quiz.edit` |

No new controller file needed — add to `QuizWriteController` and `QuizReadController` as `sections*` methods.

---

## 7. Part 2 — Manual Grading Queue

### 7.1 Current State (Post-18A)

`quiz_result_responses` has rows where `is_correct = null` and `marks_awarded = null` for DESCRIPTIVE and MATCH_FOLLOWING questions. `GradeQuizResultUseCase` exists but operates at the result level — it cannot grade individual responses. There is no assignment of who grades what. There is no queue view. There is no way for a teacher to know which of their quizzes have pending grading work.

### 7.2 Grading Ownership Model

Per Decision D-2: **quiz creator owns the grading queue by default. Admin can reassign.**

This means:
- When a student submits a quiz that has manually-graded questions, the `quizzes.created_by` user becomes the default grader for all resulting pending responses
- An admin can call `ReassignGradingUseCase` to transfer responsibility to another teacher
- The grader can call `GetGradingQueueQuery` to see all pending responses assigned to them across all quizzes
- Graders see responses anonymously — they grade the answer, not the student (prevents bias). Student identity is visible only to admins and the quiz owner.

### 7.3 Architecture Decisions for Grading

**AD-18C-006: No Separate `grading_assignments` Table — Grader Is Stored on the Response Row**

Rather than a separate assignments table, the grader identity is stored directly on `quiz_result_responses.graded_by`. A null `graded_by` with null `marks_awarded` means "unassigned, pending". A populated `graded_by` with null `marks_awarded` means "assigned but not yet graded". A populated `graded_by` with a `marks_awarded` value means "graded".

This keeps the schema flat. The `GetGradingQueueQuery` filters by `graded_by = currentUserId AND marks_awarded IS NULL`. Reassignment is an UPDATE on `graded_by`.

For the default assignment on submission: `SubmitQuizAnswersUseCase` reads `quiz.created_by` and sets `graded_by` on all pending response rows at submission time.

**AD-18C-007: Match-the-Following Auto-Grading Is Implemented in 18C**

Phase 18A deferred match-following auto-grading, noting it "requires manual grading in Phase 18C". Now that the grading queue exists, match-following is reassessed: simple 1:1 pair matching CAN be auto-graded. The student submits a mapping (left_id → right_id), and the system compares against `is_correct` on the pair records.

Complex matching (1:many, where a student can assign multiple right items to one left item) still requires manual grading — the correctness of partial mappings is ambiguous without a scoring rubric the admin defines. This phase auto-grades simple match-following and queues complex match-following for manual review.

**Determination logic:**
```php
// At submission time:
if ($question->type === QuestionType::MATCH_FOLLOWING) {
    $hasComplexPairs = $this->pairRepository->hasMultipleCorrectPairsForAnyLeftItem($questionId);
    if ($hasComplexPairs) {
        // Queue for manual grading
        $isCorrect = null;
        $marksAwarded = null;
    } else {
        // Auto-grade simple 1:1 match
        $isCorrect = $this->gradeSimpleMatchFollowing($response, $snapshot);
        $marksAwarded = $isCorrect ? $question->grade : $negativeMarkingValue;
    }
}
```

**AD-18C-008: Bulk Grading Is By Question, Not By Result**

When a teacher grades "Explain Newton's Third Law" for 200 students, they do not want to open 200 individual result pages. They want to see all 200 answers to that one question side by side and grade them sequentially.

`BulkGradeByQuestionUseCase` accepts: `quizId`, `questionId`, `grades: [{responseId, marksAwarded}]`. It updates multiple response rows in a single transaction. After each bulk grade operation, it checks if any result has been fully graded and fires `CompleteGradingUseCase` for those results.

**AD-18C-009: `responses JSON` Column Removal**

The `responses JSON` column on `quiz_results` has been written in parallel with `quiz_result_responses` since 18A. By the time 18C runs:
- All attempts started after 18A deployment use `quiz_result_responses`
- Attempts started before 18A still only have the JSON blob

Before removing the JSON column, the developer must run a check:

```sql
SELECT COUNT(*) FROM quiz_results
WHERE responses IS NOT NULL
AND id NOT IN (
    SELECT DISTINCT result_id FROM quiz_result_responses
);
```

If this count is non-zero, a one-time backfill migration must parse the JSON blob and write rows to `quiz_result_responses` for old attempts before the column is dropped.

The column drop migration must be in a separate file from the backfill — allowing the backfill to be verified before the column is permanently removed.

---

## 8. Part 2 — Domain Layer (Grading)

### 8.1 `QuizResultEntity` — Updated Grading Methods

The existing entity must expose methods reflecting the new grading architecture:

```php
public function isFullyGraded(): bool
{
    // Cannot determine from entity alone — requires response data
    // This is an application-layer concern, not domain
    // Entity only tracks: status, total_score, passed
}

public function finalise(float $totalScore, float $passmark): self
{
    // Returns new entity with:
    // status = GRADED
    // total_score = $totalScore
    // passed = $totalScore >= $passmark
    // Throws if current status is not PARTIALLY_GRADED or SUBMITTED
}
```

### 8.2 New Domain Exception

**File:** `app/Domain/TenantAdminDashboard/Quiz/Exceptions/QuizSectionHasQuestionsException.php`

Thrown by `DeleteQuizSectionUseCase` when the section has questions assigned.

### 8.3 No New Domain Events for Grading

Grading actions do not warrant new domain events in this phase. The existing `QuizAttemptGraded` event is sufficient — it fires when a result transitions to `GRADED`. Individual response grading is an operational action, not a domain event.

---

## 9. Part 2 — Application Layer (Grading)

### 9.1 Directory Additions

```
app/Application/TenantAdminDashboard/Quiz/
├── Commands/
│   ├── ... existing ...
│   ├── GradeQuizResponseCommand.php          ← NEW (single response)
│   ├── BulkGradeByQuestionCommand.php        ← NEW
│   └── ReassignGradingCommand.php            ← NEW
├── Queries/
│   ├── ... existing ...
│   └── GetGradingQueueQuery.php              ← NEW
└── UseCases/
    ├── ... existing ...
    ├── GradeQuizResponseUseCase.php           ← NEW
    ├── BulkGradeByQuestionUseCase.php         ← NEW
    ├── ReassignGradingUseCase.php             ← NEW
    └── CompleteGradingUseCase.php             ← NEW
```

### 9.2 `SubmitQuizAnswersUseCase` — Assign Default Grader

Updated from 18A. After writing `quiz_result_responses` rows with `is_correct = null`:

```php
// For all pending response rows (is_correct = null):
$defaultGraderId = $quiz->createdBy;

$this->responseRepository->assignGrader(
    resultId: $result->getId(),
    graderId: $defaultGraderId,
);
```

`assignGrader()` does a bulk UPDATE on `quiz_result_responses` where `result_id = X AND is_correct IS NULL AND graded_by IS NULL`. This is efficient — one UPDATE regardless of how many pending responses exist.

### 9.3 `GradeQuizResponseUseCase` — Single Response Grading

```
Inputs: tenantId, resultId, responseId, marksAwarded, graderId

1. Load response — verify belongs to result, belongs to tenant
2. Verify graderId = response.graded_by (only assigned grader can grade)
   — OR graderId has quiz.edit capability (admin override)
3. Validate marksAwarded: 0 <= marksAwarded <= question.grade (from snapshot)
4. Begin DB transaction
5. Update response: marks_awarded = marksAwarded, graded_at = now(), is_correct = (marksAwarded > 0)
6. Check if result is now fully graded (no more null marks_awarded rows)
7. If fully graded: call CompleteGradingUseCase logic inline (same transaction)
8. Commit
9. Write audit log (quiz_response.graded) — OUTSIDE transaction
```

### 9.4 `BulkGradeByQuestionUseCase` — Grade All Responses for One Question

```
Inputs: tenantId, quizId, questionId, grades: [{responseId, marksAwarded}], graderId

1. Validate quizId and questionId belong to tenant
2. Validate graderId has permission (owns quiz or has quiz.edit)
3. Load all responses for this questionId across all results
4. Validate each grade: 0 <= marksAwarded <= question.grade
5. Begin DB transaction
6. Bulk update response rows with marks_awarded and graded_at
7. For each affected result: check if fully graded
8. For each fully graded result: transition status to GRADED, calculate total_score, set passed
9. Capture QuizAttemptGraded events for fully-graded results
10. Commit transaction
11. Write audit log (quiz_question.bulk_graded, count) — OUTSIDE transaction
12. Dispatch QuizAttemptGraded events for completed results
```

The bulk update in step 6 must use a single SQL UPDATE with a CASE WHEN expression — not a loop of individual updates.

```sql
UPDATE quiz_result_responses
SET marks_awarded = CASE id
    WHEN ? THEN ?
    WHEN ? THEN ?
    ...
END,
graded_at = NOW(),
is_correct = (CASE id WHEN ? THEN ? ... END) > 0
WHERE id IN (?, ?, ...)
AND tenant_id = ?
```

### 9.5 `ReassignGradingUseCase`

```
Inputs: tenantId, quizId, fromGraderId, toGraderId, actorId

1. Verify actorId has quiz.edit capability (only admin can reassign)
2. Verify fromGraderId and toGraderId are valid users in the tenant
3. Update quiz_result_responses: graded_by = toGraderId
   WHERE quiz_id in (SELECT id FROM quizzes WHERE quiz_id = ? AND tenant_id = ?)
   AND graded_by = fromGraderId
   AND marks_awarded IS NULL
4. Write audit log (quiz_grading.reassigned, from, to, count) — OUTSIDE transaction
```

Reassignment only affects pending (ungraded) responses. Already graded responses are not moved.

### 9.6 `GetGradingQueueQuery`

Returns a paginated list of pending response groups for a grader, grouped by quiz + question:

```typescript
// Response shape per item:
{
  quizId: number;
  quizTitle: string;
  questionId: number;
  questionTitle: string;
  questionType: 'descriptive' | 'match_following';
  pendingCount: number;  // how many student responses await grading
}
```

This allows the teacher to see "JEE Mock Test 3 — Explain Newton's Third Law — 47 pending" and click through to grade all 47.

SQL approach: aggregate `quiz_result_responses` grouped by `quiz_id + question_id` where `graded_by = currentUser AND marks_awarded IS NULL`.

### 9.7 `CompleteGradingUseCase`

Called internally by `GradeQuizResponseUseCase` and `BulkGradeByQuestionUseCase` when a result has no more pending responses.

```
1. Sum marks_awarded across all response rows for this result
2. Get quiz.pass_mark
3. Transition result status: PARTIALLY_GRADED → GRADED
4. Set total_score and passed flag
5. Dispatch QuizAttemptGraded event (triggers AwardPointsOnQuizPassed listener)
```

This use case is not exposed as an HTTP endpoint — it is only called internally.

### 9.8 New Grading API Endpoints

Routes added to `routes/tenant_dashboard/quiz.php`:

| Method | URI | Purpose | Capability |
|---|---|---|---|
| `GET` | `/api/tenant/quiz-grading/queue` | Get grading queue for current user | `quiz.edit` |
| `POST` | `/api/tenant/quizzes/{quizId}/results/{resultId}/responses/{responseId}/grade` | Grade single response | `quiz.edit` |
| `POST` | `/api/tenant/quizzes/{quizId}/questions/{questionId}/bulk-grade` | Grade all responses for one question | `quiz.edit` |
| `POST` | `/api/tenant/quizzes/{quizId}/grading/reassign` | Reassign grading queue | `quiz.edit` |

New controller: `QuizGradingController` with methods: `queue`, `gradeResponse`, `bulkGrade`, `reassign`.

---

## 10. Infrastructure Layer

### 10.1 Database Migrations

**Migration 1: Create `quiz_sections` table**
`2026_03_21_180C_000001_create_quiz_sections_table.php`

```php
Schema::create('quiz_sections', function (Blueprint $table) {
    $table->id();
    $table->foreignId('tenant_id')->constrained('tenants');
    $table->foreignId('quiz_id')->constrained('quizzes');
    $table->string('key', 100);
    $table->string('title', 255);
    $table->unsignedTinyInteger('sort_order')->default(0);
    $table->unsignedInteger('time_minutes')->nullable();
    $table->decimal('negative_marking', 5, 2)->nullable();
    $table->decimal('default_mark', 8, 2)->nullable();
    $table->timestamps();
    $table->softDeletes();

    $table->index('tenant_id');
    $table->index(['quiz_id', 'sort_order'], 'idx_sections_quiz_order');
    $table->unique(['quiz_id', 'key'], 'uq_quiz_section_key');
});
```

**Migration 2: Add `section_id` to `quiz_questions`**
`2026_03_21_180C_000002_add_section_id_to_quiz_questions.php`

```php
Schema::table('quiz_questions', function (Blueprint $table) {
    $table->unsignedBigInteger('section_id')->nullable()->after('section_key');
    $table->index('section_id', 'idx_qqestions_section_id');
    // NOT a FK constraint — section may be soft-deleted;
    // section_key preserved as deprecated column
});
```

**Migration 3: Backfill `quiz_sections` from JSON**
`2026_03_21_180C_000003_backfill_quiz_sections_from_json.php`

This migration is data-critical. Must be idempotent:

```php
public function up(): void
{
    $quizzes = DB::table('quizzes')
        ->whereNotNull('sections')
        ->get(['id', 'tenant_id', 'sections']);

    foreach ($quizzes as $quiz) {
        $sectionsJson = json_decode($quiz->sections, true);
        if (!is_array($sectionsJson)) continue;

        foreach ($sectionsJson as $index => $section) {
            // Idempotency: skip if key already exists for this quiz
            $exists = DB::table('quiz_sections')
                ->where('quiz_id', $quiz->id)
                ->where('key', $section['key'] ?? '')
                ->exists();

            if ($exists) continue;

            $sectionId = DB::table('quiz_sections')->insertGetId([
                'tenant_id'       => $quiz->tenant_id,
                'quiz_id'         => $quiz->id,
                'key'             => $section['key'] ?? 'section_' . ($index + 1),
                'title'           => $section['title'] ?? 'Section ' . ($index + 1),
                'sort_order'      => $index,
                'time_minutes'    => $section['time_minutes'] ?? null,
                'negative_marking'=> $section['negative_marking'] ?? null,
                'default_mark'    => $section['default_mark'] ?? null,
                'created_at'      => now(),
                'updated_at'      => now(),
            ]);

            // Update quiz_questions with section_id
            DB::table('quiz_questions')
                ->where('quiz_id', $quiz->id)
                ->where('section_key', $section['key'] ?? '')
                ->whereNull('section_id')
                ->update(['section_id' => $sectionId]);
        }
    }
}
```

**Migration 4: Backfill `quiz_result_responses` from JSON blob (if needed)**
`2026_03_21_180C_000004_backfill_responses_from_json_blob.php`

Runs the check from AD-18C-009. Only processes results that have JSON but no response rows.

**Migration 5: Drop `responses JSON` from `quiz_results`**
`2026_03_21_180C_000005_drop_responses_json_from_quiz_results.php`

```php
public function up(): void
{
    // Safety check: abort if any result still has no response rows
    $orphanCount = DB::select("
        SELECT COUNT(*) as cnt FROM quiz_results
        WHERE responses IS NOT NULL
        AND id NOT IN (SELECT DISTINCT result_id FROM quiz_result_responses)
    ")[0]->cnt;

    if ($orphanCount > 0) {
        throw new \RuntimeException(
            "Cannot drop responses column: {$orphanCount} result(s) have no response rows. Run backfill first."
        );
    }

    Schema::table('quiz_results', function (Blueprint $table) {
        $table->dropColumn('responses');
    });
}

public function down(): void
{
    Schema::table('quiz_results', function (Blueprint $table) {
        $table->json('responses')->nullable();
    });
}
```

**Migration 6: Add `graded_by` index to `quiz_result_responses`**
`2026_03_21_180C_000006_add_graded_by_index_to_responses.php`

```php
Schema::table('quiz_result_responses', function (Blueprint $table) {
    $table->index(['graded_by', 'marks_awarded'], 'idx_responses_grading_queue');
    // Note: this index was specified in 18A but adding here ensures it exists
    // If already exists from 18A migration, skip gracefully
});
```

### 10.2 New Eloquent Models

| Model | Table | Notes |
|---|---|---|
| `QuizSectionRecord` | `quiz_sections` | `BelongsToTenant`, `SoftDeletes` |

### 10.3 New Repository Implementations

| Interface | Implementation |
|---|---|
| `QuizSectionRepositoryInterface` | `EloquentQuizSectionRepository` |

`reorder()` method uses a single bulk UPDATE:

```php
public function reorder(int $tenantId, int $quizId, array $orderedIds): void
{
    foreach ($orderedIds as $sortOrder => $sectionId) {
        DB::table('quiz_sections')
            ->where('id', $sectionId)
            ->where('quiz_id', $quizId)
            ->where('tenant_id', $tenantId)
            ->update(['sort_order' => $sortOrder]);
    }
}
```

---

## 11. Business Rules (Non-Negotiable)

| ID | Rule | Enforcement |
|---|---|---|
| BR-01 | Section key must be unique within a quiz | UNIQUE constraint + application validation |
| BR-02 | Section cannot be deleted if it has questions | `DeleteQuizSectionUseCase` count check + exception |
| BR-03 | Null section config fields inherit from quiz level | `resolveTimeMinutes()` / `resolveNegativeMarking()` methods |
| BR-04 | Attempt snapshots must carry resolved section config | `StartQuizAttemptUseCase` builds resolved values before snapshot write |
| BR-05 | Only assigned grader OR quiz.edit capability holder can grade a response | `GradeQuizResponseUseCase` identity check |
| BR-06 | `marks_awarded` must be between 0 and the question's full grade value | Domain validation in grading use cases |
| BR-07 | Simple match-following is auto-graded; complex match-following is queued | `SubmitQuizAnswersUseCase` pair complexity check |
| BR-08 | Reassignment only moves pending (ungraded) responses | `ReassignGradingUseCase` — WHERE marks_awarded IS NULL |
| BR-09 | `CompleteGradingUseCase` dispatches `QuizAttemptGraded` event — triggers rewards | Event listener `AwardPointsOnQuizPassed` must fire for manually-graded quizzes |
| BR-10 | `responses JSON` column drop is guarded by zero-orphan check | Migration 5 runtime assertion |
| BR-11 | Bulk grade uses a single UPDATE, not N individual updates | Code review + performance test |
| BR-12 | All audit logs written outside transactions — no regression | Platform-wide rule |

---

## 12. Test Plan

### 12.1 Unit Tests — Sections

**File:** `tests/Unit/Domain/TenantAdminDashboard/Quiz/Entities/QuizSectionEntityTest.php`

| Test | Description |
|---|---|
| `test_key_must_be_alphanumeric_with_underscores` | Invariant |
| `test_time_minutes_inherits_from_quiz_when_null` | BR-03 |
| `test_negative_marking_inherits_from_quiz_when_null` | BR-03 |
| `test_section_has_own_time_overrides_quiz` | Independent config |

**File:** `tests/Unit/Application/TenantAdminDashboard/Quiz/UseCases/DeleteQuizSectionUseCaseTest.php`

| Test | Description |
|---|---|
| `test_cannot_delete_section_with_questions` | BR-02 |
| `test_can_delete_empty_section` | Happy path |

### 12.2 Unit Tests — Grading

**File:** `tests/Unit/Application/TenantAdminDashboard/Quiz/UseCases/GradeQuizResponseUseCaseTest.php`

| Test | Description |
|---|---|
| `test_assigned_grader_can_grade` | BR-05 |
| `test_unassigned_user_cannot_grade` | BR-05 |
| `test_marks_cannot_exceed_question_grade` | BR-06 |
| `test_marks_cannot_be_negative` | BR-06 |
| `test_result_transitions_to_graded_when_last_response_graded` | Completion trigger |
| `test_quiz_attempt_graded_event_dispatched_on_completion` | BR-09 |
| `test_audit_log_written_after_commit` | BR-12 |

**File:** `tests/Unit/Application/TenantAdminDashboard/Quiz/UseCases/BulkGradeByQuestionUseCaseTest.php`

| Test | Description |
|---|---|
| `test_bulk_grades_all_responses_in_single_transaction` | BR-11 |
| `test_multiple_results_complete_after_bulk_grade` | Completion across results |
| `test_partial_bulk_grade_leaves_remaining_pending` | Partial scenario |

**File:** `tests/Unit/Application/TenantAdminDashboard/Quiz/UseCases/SubmitQuizAnswersUseCaseTest.php`

Add to existing:

| Test | Description |
|---|---|
| `test_assigns_default_grader_on_submission` | AD-18C-006 |
| `test_simple_match_following_is_auto_graded` | AD-18C-007 |
| `test_complex_match_following_is_queued_for_manual` | AD-18C-007 |

### 12.3 Feature Tests

**File:** `tests/Feature/TenantAdminDashboard/Quiz/QuizSectionCrudTest.php`

| Test | Description |
|---|---|
| `test_create_section` | Full stack |
| `test_section_key_unique_per_quiz` | Unique constraint |
| `test_delete_empty_section` | Happy path |
| `test_cannot_delete_section_with_questions` | BR-02 |
| `test_reorder_sections` | Sort order update |

**File:** `tests/Feature/TenantAdminDashboard/Quiz/QuizSectionMigrationTest.php`

| Test | Description |
|---|---|
| `test_existing_json_sections_migrated_to_rows` | Backfill migration |
| `test_migration_is_idempotent` | No duplicates on re-run |
| `test_quiz_questions_have_section_id_after_migration` | FK populated |

**File:** `tests/Feature/TenantAdminDashboard/Quiz/ManualGradingQueueTest.php`

| Test | Description |
|---|---|
| `test_grading_queue_shows_pending_responses_for_grader` | Queue query |
| `test_grading_queue_empty_after_all_graded` | Completion |
| `test_reassign_grading_moves_pending_only` | BR-08 |

**File:** `tests/Feature/TenantAdminDashboard/Quiz/ResponsesJsonRemovalTest.php`

| Test | Description |
|---|---|
| `test_responses_column_does_not_exist_after_migration` | Column dropped |
| `test_drop_migration_aborts_if_orphan_results_exist` | Safety guard |

### 12.4 Regression

```powershell
docker exec -it ubotz_backend sh -c "cd /var/www && php artisan test --filter=Quiz 2>&1 | tail -5"
```

All pre-existing quiz tests must pass. The `responses JSON` removal must not break any existing test. If any test asserts on the `responses` column, it must be updated to assert on `quiz_result_responses` rows instead.

---

## 13. Quality Gate

| # | Check | How to Verify |
|---|---|---|
| 1 | `quiz_sections` table exists with `key` UNIQUE per `quiz_id` | Migration + DB inspect |
| 2 | `quiz_questions.section_id` column exists (nullable, non-FK) | Migration check |
| 3 | `section_key` preserved on `quiz_questions` as deprecated | Column exists + code review |
| 4 | Existing JSON sections migrated to rows without duplicates | Feature test + DB count |
| 5 | `quiz_questions` have `section_id` populated after migration | DB query |
| 6 | Null section config inherits from quiz level | Unit test |
| 7 | Attempt snapshots include resolved section config | Unit test |
| 8 | `responses` column removed from `quiz_results` | `DESCRIBE quiz_results` |
| 9 | Drop migration aborts if orphan results exist | Unit test |
| 10 | Default grader assigned on submission | Unit test |
| 11 | Simple match-following is auto-graded | Unit test |
| 12 | Complex match-following queued for manual grading | Unit test |
| 13 | Only assigned grader or admin can grade a response | Unit test |
| 14 | Bulk grade uses single SQL UPDATE not a loop | Code review |
| 15 | `QuizAttemptGraded` event fires when last response graded | Unit test |
| 16 | `AwardPointsOnQuizPassed` fires for manually-graded quizzes | Integration test |
| 17 | Reassignment moves only pending responses | Unit test |
| 18 | All audit logs outside transactions | Code review |
| 19 | `php artisan test --filter=Quiz` passes zero failures, zero risky | Test output |
| 20 | PHPStan level 5 on all new and modified files | PHPStan output |

---

## 14. File Manifest

### New Files

| File | Purpose |
|---|---|
| `app/Domain/TenantAdminDashboard/Quiz/Entities/QuizSectionEntity.php` | Section entity |
| `app/Domain/TenantAdminDashboard/Quiz/Exceptions/QuizSectionHasQuestionsException.php` | Domain exception |
| `app/Domain/TenantAdminDashboard/Quiz/Repositories/QuizSectionRepositoryInterface.php` | Domain contract |
| `app/Application/TenantAdminDashboard/Quiz/Commands/CreateQuizSectionCommand.php` | DTO |
| `app/Application/TenantAdminDashboard/Quiz/Commands/UpdateQuizSectionCommand.php` | DTO |
| `app/Application/TenantAdminDashboard/Quiz/Commands/GradeQuizResponseCommand.php` | DTO |
| `app/Application/TenantAdminDashboard/Quiz/Commands/BulkGradeByQuestionCommand.php` | DTO |
| `app/Application/TenantAdminDashboard/Quiz/Commands/ReassignGradingCommand.php` | DTO |
| `app/Application/TenantAdminDashboard/Quiz/Queries/GetGradingQueueQuery.php` | Query |
| `app/Application/TenantAdminDashboard/Quiz/UseCases/CreateQuizSectionUseCase.php` | Use case |
| `app/Application/TenantAdminDashboard/Quiz/UseCases/UpdateQuizSectionUseCase.php` | Use case |
| `app/Application/TenantAdminDashboard/Quiz/UseCases/DeleteQuizSectionUseCase.php` | Use case |
| `app/Application/TenantAdminDashboard/Quiz/UseCases/ReorderQuizSectionsUseCase.php` | Use case |
| `app/Application/TenantAdminDashboard/Quiz/UseCases/GradeQuizResponseUseCase.php` | Use case |
| `app/Application/TenantAdminDashboard/Quiz/UseCases/BulkGradeByQuestionUseCase.php` | Use case |
| `app/Application/TenantAdminDashboard/Quiz/UseCases/ReassignGradingUseCase.php` | Use case |
| `app/Application/TenantAdminDashboard/Quiz/UseCases/CompleteGradingUseCase.php` | Use case (internal) |
| `app/Infrastructure/Persistence/TenantAdminDashboard/Quiz/QuizSectionRecord.php` | Eloquent model |
| `app/Infrastructure/Persistence/TenantAdminDashboard/Quiz/EloquentQuizSectionRepository.php` | Repository |
| `app/Http/Controllers/Api/TenantAdminDashboard/Quiz/QuizGradingController.php` | Controller |
| `database/migrations/tenant/2026_03_21_180C_000001_create_quiz_sections_table.php` | Migration |
| `database/migrations/tenant/2026_03_21_180C_000002_add_section_id_to_quiz_questions.php` | Migration |
| `database/migrations/tenant/2026_03_21_180C_000003_backfill_quiz_sections_from_json.php` | Migration |
| `database/migrations/tenant/2026_03_21_180C_000004_backfill_responses_from_json_blob.php` | Migration |
| `database/migrations/tenant/2026_03_21_180C_000005_drop_responses_json_from_quiz_results.php` | Migration |
| `database/migrations/tenant/2026_03_21_180C_000006_add_graded_by_index_to_responses.php` | Migration |
| `tests/Unit/Domain/TenantAdminDashboard/Quiz/Entities/QuizSectionEntityTest.php` | Unit test |
| `tests/Unit/Application/TenantAdminDashboard/Quiz/UseCases/DeleteQuizSectionUseCaseTest.php` | Unit test |
| `tests/Unit/Application/TenantAdminDashboard/Quiz/UseCases/GradeQuizResponseUseCaseTest.php` | Unit test |
| `tests/Unit/Application/TenantAdminDashboard/Quiz/UseCases/BulkGradeByQuestionUseCaseTest.php` | Unit test |
| `tests/Feature/TenantAdminDashboard/Quiz/QuizSectionCrudTest.php` | Feature test |
| `tests/Feature/TenantAdminDashboard/Quiz/QuizSectionMigrationTest.php` | Feature test |
| `tests/Feature/TenantAdminDashboard/Quiz/ManualGradingQueueTest.php` | Feature test |
| `tests/Feature/TenantAdminDashboard/Quiz/ResponsesJsonRemovalTest.php` | Feature test |

### Modified Files

| File | Change |
|---|---|
| `app/Domain/TenantAdminDashboard/Quiz/Entities/QuizEntity.php` | Add `hasIndependentSectionConfig()`, `isSectioned()` |
| `app/Domain/TenantAdminDashboard/Quiz/Entities/QuizResultEntity.php` | Add `finalise()` method |
| `app/Application/TenantAdminDashboard/Quiz/UseCases/StartQuizAttemptUseCase.php` | Load sections, include resolved config in snapshot |
| `app/Application/TenantAdminDashboard/Quiz/UseCases/SubmitQuizAnswersUseCase.php` | Assign default grader, auto-grade simple match |
| `app/Application/TenantAdminDashboard/Quiz/UseCases/GradeQuizResultUseCase.php` | Delegate to `CompleteGradingUseCase` |
| `app/Infrastructure/Persistence/TenantAdminDashboard/Quiz/QuizQuestionRecord.php` | Add `section_id` to fillable |
| `app/Http/Controllers/Api/TenantAdminDashboard/Quiz/QuizReadController.php` | Add `sections()` list method |
| `app/Http/Controllers/Api/TenantAdminDashboard/Quiz/QuizWriteController.php` | Add section CRUD methods |
| `routes/tenant_dashboard/quiz.php` | Add section and grading routes |
| Service provider for quiz bindings | Add `QuizSectionRepositoryInterface` binding |
| Relevant existing test files | Update any that assert on `responses` JSON column |

---

*End of Phase 18C Developer Instructions*
*Issued by Principal Engineer — 2026-03-21*
*Next step: Antigravity to produce Phase 18C Implementation Plan for Principal Engineer audit before implementation begins.*
*Note: 18B, 18C, and 18D can run in parallel after 18A is certified. 18C and 18B have no dependency on each other.*
