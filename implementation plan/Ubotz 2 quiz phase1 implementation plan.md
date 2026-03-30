# UBOTZ 2.0 — Quiz Phase 1: Implementation Plan

## Document Metadata

| Field | Value |
|---|---|
| **Phase** | Quiz Phase 1 — Admin Quiz & Question CRUD |
| **Scope** | Tenant Admin quiz management, question management, answer option CRUD |
| **Depends On** | Phase 10B (capability middleware), ExamHierarchy bounded context, Course bounded context patterns |
| **Estimated Effort** | 8–12 working days |
| **Quality Gate** | Zero critical/high defects, PHPStan Level 5 (0 new errors), all tests green |
| **Architecture Pattern** | Phase 6 DDD Template — Domain → Application → Infrastructure → HTTP |

---

## 1. Executive Summary

This phase introduces the Quiz bounded context within `TenantAdminDashboard`. It enables tenant administrators to create and manage quizzes (practice quizzes, mock tests, PYQ), manage questions with MCQ and descriptive types, configure scoring rules (negative marking, default MCQ grade, pass marks), and organize questions into sections for mock tests.

The design extracts proven business logic from Mentora's quiz feature while applying UBOTZ's DDD architecture, tenant isolation, and capability-based authorization. Student quiz-taking (attempts, grading, results) is explicitly deferred to Quiz Phase 2.

---

## 2. Bounded Context Placement

```
Domain/TenantAdminDashboard/
├── Quiz/                          ← NEW bounded context
│   ├── Entities/
│   ├── ValueObjects/
│   ├── Events/
│   ├── Exceptions/
│   ├── Repositories/
│   └── Services/
├── Course/                        ← Existing
├── ExamHierarchy/                 ← Existing (Quiz references this)
├── Role/                          ← Existing
└── User/                          ← Existing
```

The Quiz bounded context references ExamHierarchy entities via ID (loose coupling). It does NOT import Course domain objects directly — course linkage is a nullable `course_id` foreign key, not a domain-level dependency.

---

## 3. Database Schema

### 3.1 `quizzes` table (Tenant-Scoped)

```sql
CREATE TABLE quizzes (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    tenant_id       BIGINT UNSIGNED NOT NULL,
    course_id       BIGINT UNSIGNED NULL,         -- Optional course linkage
    created_by      BIGINT UNSIGNED NOT NULL,      -- Tenant user who created
    
    -- Exam Hierarchy Binding (Exam → Subject → Chapter → Topic)
    exam_id                 BIGINT UNSIGNED NULL,
    subject_id              BIGINT UNSIGNED NULL,
    hierarchy_chapter_id    BIGINT UNSIGNED NULL,
    topic_id                BIGINT UNSIGNED NULL,
    
    -- Core Fields
    title           VARCHAR(255) NOT NULL,
    quiz_type       VARCHAR(20) NOT NULL DEFAULT 'practice_quiz',  -- practice_quiz|mock_test|pyq
    status          VARCHAR(20) NOT NULL DEFAULT 'draft',          -- draft|active|inactive|archived
    
    -- Access Model
    is_free         BOOLEAN NOT NULL DEFAULT FALSE,
    access_level    VARCHAR(20) NOT NULL DEFAULT 'public',         -- public|premium
    
    -- Scoring Configuration
    pass_mark       DECIMAL(8,2) NOT NULL DEFAULT 0,
    negative_marking DECIMAL(5,2) NULL,
    default_mcq_grade DECIMAL(6,2) NULL,
    total_mark      DECIMAL(10,2) NOT NULL DEFAULT 0,              -- Derived: SUM(question grades)
    
    -- Time & Attempts
    time_minutes    INT UNSIGNED NULL DEFAULT 0,
    max_attempts    INT UNSIGNED NULL,
    expiry_days     INT UNSIGNED NULL,
    
    -- Mock Test Sections (JSON)
    sections        JSON NULL,
    
    -- CBT Mode Configuration
    enable_cbt_mode         BOOLEAN NOT NULL DEFAULT FALSE,
    enable_mark_for_review  BOOLEAN NOT NULL DEFAULT FALSE,
    enable_question_palette BOOLEAN NOT NULL DEFAULT FALSE,
    show_section_summary    BOOLEAN NOT NULL DEFAULT TRUE,
    
    -- Display Options
    display_limited_questions    BOOLEAN NOT NULL DEFAULT FALSE,
    display_number_of_questions  INT UNSIGNED NULL,
    display_questions_randomly   BOOLEAN NOT NULL DEFAULT FALSE,
    
    -- Certificate
    certificate     BOOLEAN NOT NULL DEFAULT FALSE,
    
    -- Timestamps (proper Laravel timestamps, NOT Unix)
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP NULL,

    -- Indexes
    INDEX idx_quizzes_tenant_status (tenant_id, status),
    INDEX idx_quizzes_tenant_type (tenant_id, quiz_type),
    INDEX idx_quizzes_tenant_exam (tenant_id, exam_id),
    INDEX idx_quizzes_course (tenant_id, course_id),
    INDEX idx_quizzes_created_by (tenant_id, created_by),

    -- Foreign Keys
    CONSTRAINT fk_quizzes_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
    CONSTRAINT fk_quizzes_course FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE SET NULL,
    CONSTRAINT fk_quizzes_exam FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE SET NULL,
    CONSTRAINT fk_quizzes_subject FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE SET NULL,
    CONSTRAINT fk_quizzes_chapter FOREIGN KEY (hierarchy_chapter_id) REFERENCES exam_chapters(id) ON DELETE SET NULL,
    CONSTRAINT fk_quizzes_topic FOREIGN KEY (topic_id) REFERENCES exam_topics(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

**Key differences from Mentora:**
- `tenant_id` on every row (multi-tenant isolation)
- `status` includes `draft` and `archived` (proper lifecycle vs Mentora's binary active/inactive)
- `grade` and `pass_mark` are `DECIMAL`, not string or integer
- `time_minutes` (renamed from ambiguous `time`)
- `max_attempts` (renamed from ambiguous `attempt`)
- `created_by` references tenant users table (not a global user)
- Proper `TIMESTAMP` columns instead of Unix integers
- Title stored directly on table (no translation table)
- All relationships have proper FK constraints

### 3.2 `quiz_questions` table (Tenant-Scoped)

```sql
CREATE TABLE quiz_questions (
    id                  BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    tenant_id           BIGINT UNSIGNED NOT NULL,
    quiz_id             BIGINT UNSIGNED NOT NULL,
    created_by          BIGINT UNSIGNED NOT NULL,
    
    -- Content
    title               TEXT NOT NULL,
    type                VARCHAR(20) NOT NULL,      -- multiple|descriptive
    grade               DECIMAL(6,2) NOT NULL,
    correct_explanation TEXT NULL,                   -- Explanation for correct answer
    
    -- Media (mutually exclusive: image XOR video, enforced in domain)
    image_url           VARCHAR(500) NULL,
    video_url           VARCHAR(500) NULL,
    solution_image_url  VARCHAR(500) NULL,
    solution_video_url  VARCHAR(500) NULL,
    
    -- Section Assignment (mock tests)
    section_key         VARCHAR(100) NULL,
    
    -- Question Bank Metadata (per-question tagging for future bank queries)
    bank_exam_id        BIGINT UNSIGNED NULL,
    bank_subject_id     BIGINT UNSIGNED NULL,
    bank_chapter_id     BIGINT UNSIGNED NULL,
    bank_topic_id       BIGINT UNSIGNED NULL,
    difficulty_level    VARCHAR(10) NULL,           -- easy|medium|hard
    
    -- Ordering
    sort_order          INT UNSIGNED NOT NULL DEFAULT 0,
    
    -- Timestamps
    created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP NULL,
    
    -- Indexes
    INDEX idx_qq_tenant_quiz (tenant_id, quiz_id),
    INDEX idx_qq_quiz_section (quiz_id, section_key),
    INDEX idx_qq_quiz_order (quiz_id, sort_order),
    INDEX idx_qq_bank_exam (bank_exam_id),
    INDEX idx_qq_difficulty (difficulty_level),
    
    -- Foreign Keys
    CONSTRAINT fk_qq_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
    CONSTRAINT fk_qq_quiz FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

**Key differences from Mentora:**
- `grade` is `DECIMAL(6,2) NOT NULL` (not VARCHAR)
- `title` and `correct_explanation` stored directly (no translation table)
- `section_key` only (dropped redundant `section` name column — resolved from quiz sections JSON)
- Renamed `order` → `sort_order` (avoids MySQL reserved word)
- `type` is `VARCHAR(20)` not ENUM (extensible without ALTER TABLE)
- `image_url`/`video_url` with `_url` suffix for clarity

### 3.3 `quiz_question_options` table (Tenant-Scoped)

```sql
CREATE TABLE quiz_question_options (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    tenant_id       BIGINT UNSIGNED NOT NULL,
    question_id     BIGINT UNSIGNED NOT NULL,
    
    -- Content
    title           TEXT NOT NULL,
    image_url       VARCHAR(500) NULL,
    is_correct      BOOLEAN NOT NULL DEFAULT FALSE,
    
    -- Ordering
    sort_order      INT UNSIGNED NOT NULL DEFAULT 0,
    
    -- Timestamps
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP NULL,
    
    -- Indexes
    INDEX idx_qqo_tenant_question (tenant_id, question_id),
    INDEX idx_qqo_question_correct (question_id, is_correct),
    
    -- Foreign Keys
    CONSTRAINT fk_qqo_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
    CONSTRAINT fk_qqo_question FOREIGN KEY (question_id) REFERENCES quiz_questions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

**Naming rationale:** Renamed from `quizzes_questions_answers` to `quiz_question_options` — "option" is semantically correct for MCQ choices; "answer" is what the student provides during an attempt (Phase 2 concern).

---

## 4. Domain Layer

### 4.1 Entities

#### `QuizEntity` (Aggregate Root)

**Location:** `Domain/TenantAdminDashboard/Quiz/Entities/QuizEntity.php`

**Properties:**
- `id`, `tenantId`, `courseId`, `createdBy`
- `examId`, `subjectId`, `hierarchyChapterId`, `topicId`
- `title` (string, max 255)
- `quizType` (QuizType value object)
- `status` (QuizStatus value object)
- `isFree` (bool), `accessLevel` (AccessLevel value object)
- `passMark` (decimal), `negativeMarking` (nullable decimal), `defaultMcqGrade` (nullable decimal), `totalMark` (decimal)
- `timeMinutes` (nullable int), `maxAttempts` (nullable int), `expiryDays` (nullable int)
- `sections` (nullable SectionConfiguration value object)
- `enableCbtMode`, `enableMarkForReview`, `enableQuestionPalette`, `showSectionSummary` (booleans)
- `displayLimitedQuestions` (bool), `displayNumberOfQuestions` (nullable int), `displayQuestionsRandomly` (bool)
- `certificate` (bool)
- `createdAt`, `updatedAt`

**Invariants enforced in entity:**

1. **Type-CBT coupling:** If `quizType` is `mock_test` or `pyq`, `enableCbtMode` must be true. `enableMarkForReview` and `enableQuestionPalette` auto-set for mock tests.
2. **Access model:** If `isFree` is false, `accessLevel` is forced to `public`.
3. **Course requirement:** If `isFree` is false AND `quizType` is `practice_quiz`, `courseId` must not be null.
4. **Section requirement:** If `quizType` is `mock_test`, `sections` must have at least one enabled section with `questionCount >= 1`.
5. **Display limit:** If `displayLimitedQuestions` is true, `displayNumberOfQuestions` must be a positive integer.
6. **Status transitions:** draft→active, draft→inactive, active→inactive, inactive→active, active→archived, inactive→archived. No transition out of archived.
7. **Activation gate:** Cannot transition to `active` if `passMark <= 0` (quiz must have a configured pass mark).

**Domain Events recorded:**
- `QuizCreated` (on construction)
- `QuizUpdated` (on property changes)
- `QuizStatusChanged` (on status transitions)
- `QuizArchived` (on archive)

#### `QuizQuestionEntity`

**Location:** `Domain/TenantAdminDashboard/Quiz/Entities/QuizQuestionEntity.php`

**Properties:**
- `id`, `tenantId`, `quizId`, `createdBy`
- `title` (string), `type` (QuestionType value object), `grade` (decimal)
- `correctExplanation` (nullable string)
- `imageUrl`, `videoUrl`, `solutionImageUrl`, `solutionVideoUrl` (nullable strings)
- `sectionKey` (nullable string)
- `bankExamId`, `bankSubjectId`, `bankChapterId`, `bankTopicId` (nullable ints)
- `difficultyLevel` (nullable DifficultyLevel value object)
- `sortOrder` (int)
- `options` (collection of `QuizQuestionOptionEntity` — loaded for MCQ questions)

**Invariants:**
1. **Media exclusivity:** Cannot have both `imageUrl` and `videoUrl` set simultaneously.
2. **Grade resolution:** Grade must be > 0. For MCQ, if quiz has `defaultMcqGrade`, grade equals that default.
3. **MCQ options:** If type is `multiple`, must have at least 2 options and exactly one marked `is_correct = true`.
4. **Descriptive grade:** If type is `descriptive`, grade is always required per-question (no default override).

#### `QuizQuestionOptionEntity`

**Location:** `Domain/TenantAdminDashboard/Quiz/Entities/QuizQuestionOptionEntity.php`

**Properties:**
- `id`, `tenantId`, `questionId`
- `title` (string), `imageUrl` (nullable string), `isCorrect` (bool)
- `sortOrder` (int)

### 4.2 Value Objects

**Location:** `Domain/TenantAdminDashboard/Quiz/ValueObjects/`

| Value Object | Values | Notes |
|---|---|---|
| `QuizType` | `practice_quiz`, `mock_test`, `pyq` | PYQ behaves as mock_test variant |
| `QuizStatus` | `draft`, `active`, `inactive`, `archived` | Added `draft` and `archived` vs Mentora |
| `AccessLevel` | `public`, `premium` | Only meaningful when `is_free = true` |
| `QuestionType` | `multiple`, `descriptive` | Extensible in future |
| `DifficultyLevel` | `easy`, `medium`, `hard` | Question bank metadata |
| `SectionConfiguration` | JSON array wrapper | Validates section structure: name, key, enabled, questionCount, timeLimit |
| `HierarchyBinding` | examId, subjectId, chapterId, topicId | Coercion logic: resolves parents from deepest selection |

### 4.3 Domain Services

#### `HierarchyResolver`

**Location:** `Domain/TenantAdminDashboard/Quiz/Services/HierarchyResolverInterface.php`

Extracts the 5× duplicated "coerce from deepest selection" logic from Mentora controllers into a single domain service.

```php
interface HierarchyResolverInterface
{
    /**
     * Given a partial hierarchy (any combination of exam/subject/chapter/topic IDs),
     * resolves the complete chain by walking up from the deepest provided level.
     *
     * @return HierarchyBinding  Value object with all 4 IDs resolved
     * @throws InvalidHierarchyException  If any provided ID doesn't exist or chain is broken
     */
    public function resolve(
        ?int $examId,
        ?int $subjectId,
        ?int $chapterId,
        ?int $topicId,
        int $tenantId
    ): HierarchyBinding;
}
```

The infrastructure implementation queries ExamHierarchy repositories to walk the tree. This keeps the domain layer free of Eloquent while encapsulating the resolution algorithm.

### 4.4 Domain Events

**Location:** `Domain/TenantAdminDashboard/Quiz/Events/`

| Event | When | Payload |
|---|---|---|
| `QuizCreated` | Quiz entity constructed | tenantId, quizId, quizType, createdBy |
| `QuizUpdated` | Properties changed | tenantId, quizId, changedFields |
| `QuizStatusChanged` | Status transition | tenantId, quizId, oldStatus, newStatus |
| `QuizArchived` | Archived | tenantId, quizId |
| `QuizQuestionCreated` | Question added to quiz | tenantId, quizId, questionId |
| `QuizQuestionUpdated` | Question modified | tenantId, quizId, questionId |
| `QuizQuestionDeleted` | Question removed | tenantId, quizId, questionId, grade |

All events are past-tense facts. Dispatched via `DB::afterCommit()` in UseCases.

### 4.5 Domain Exceptions

**Location:** `Domain/TenantAdminDashboard/Quiz/Exceptions/`

| Exception | When |
|---|---|
| `InvalidQuizStatusTransitionException` | Invalid status change (e.g., archived→active) |
| `QuizActivationRequirementsNotMetException` | Activating quiz without pass_mark configured |
| `InvalidQuestionMediaException` | Both image and video set on same question |
| `McqOptionsRequiredException` | MCQ question without minimum 2 options or no correct option |
| `InvalidSectionConfigurationException` | Mock test without valid enabled sections |
| `CourseRequiredForPaidQuizException` | Paid practice quiz without course linkage |
| `InvalidHierarchyException` | Broken hierarchy chain in resolver |

### 4.6 Repository Interfaces

**Location:** `Domain/TenantAdminDashboard/Quiz/Repositories/`

```php
interface QuizRepositoryInterface
{
    public function findById(int $id, int $tenantId): ?QuizEntity;
    public function save(QuizEntity $quiz): QuizEntity;
    public function findByIdOrFail(int $id, int $tenantId): QuizEntity;
}

interface QuizQuestionRepositoryInterface
{
    public function findById(int $id, int $tenantId): ?QuizQuestionEntity;
    public function findByQuizId(int $quizId, int $tenantId): array;
    public function save(QuizQuestionEntity $question): QuizQuestionEntity;
    public function delete(int $id, int $tenantId): void;
    public function getNextSortOrder(int $quizId, int $tenantId): int;
    public function recalculateTotalMark(int $quizId, int $tenantId): string; // returns decimal string
}

interface QuizQuestionOptionRepositoryInterface
{
    public function findByQuestionId(int $questionId, int $tenantId): array;
    public function saveMany(int $questionId, int $tenantId, array $options): array;
    public function deleteByQuestionId(int $questionId, int $tenantId): void;
}
```

---

## 5. Application Layer

### 5.1 Commands (Immutable DTOs)

**Location:** `Application/TenantAdminDashboard/Quiz/Commands/`

| Command | Fields |
|---|---|
| `CreateQuizCommand` | tenantId, createdBy, title, quizType, isFree, accessLevel, courseId, examId, subjectId, chapterId, topicId, passMark, negativeMarking, defaultMcqGrade, timeMinutes, maxAttempts, expiryDays, sections, certificate, displayOptions |
| `UpdateQuizCommand` | tenantId, quizId, title, quizType, isFree, accessLevel, courseId, examId, subjectId, chapterId, topicId, passMark, negativeMarking, defaultMcqGrade, timeMinutes, maxAttempts, expiryDays, sections, certificate, displayOptions |
| `ChangeQuizStatusCommand` | tenantId, quizId, newStatus |
| `ArchiveQuizCommand` | tenantId, quizId |
| `CreateQuizQuestionCommand` | tenantId, quizId, createdBy, title, type, grade, correctExplanation, imageUrl, videoUrl, solutionImageUrl, solutionVideoUrl, sectionKey, bankExamId, bankSubjectId, bankChapterId, bankTopicId, difficultyLevel, options[] |
| `UpdateQuizQuestionCommand` | tenantId, questionId, title, type, grade, correctExplanation, imageUrl, videoUrl, solutionImageUrl, solutionVideoUrl, sectionKey, bankMetadata, difficultyLevel, options[] |
| `DeleteQuizQuestionCommand` | tenantId, questionId |
| `ReorderQuizQuestionsCommand` | tenantId, quizId, orderedQuestionIds[] |

### 5.2 UseCases

**Location:** `Application/TenantAdminDashboard/Quiz/UseCases/`

Each UseCase follows the Phase 6 template:
`validate → build entity → DB::transaction { persist → audit } → DB::afterCommit { dispatch events }`

| UseCase | Responsibility |
|---|---|
| `CreateQuizUseCase` | Validates command, resolves hierarchy via HierarchyResolver, constructs QuizEntity, persists, audits, dispatches QuizCreated |
| `UpdateQuizUseCase` | Loads existing quiz, applies changes, validates invariants, persists, audits, dispatches QuizUpdated |
| `ChangeQuizStatusUseCase` | Loads quiz, validates transition via QuizStatus, updates, audits, dispatches QuizStatusChanged |
| `ArchiveQuizUseCase` | Loads quiz, transitions to archived, audits, dispatches QuizArchived |
| `CreateQuizQuestionUseCase` | Validates, resolves grade (default MCQ check), creates question + options in transaction, recalculates quiz total_mark, audits |
| `UpdateQuizQuestionUseCase` | Loads question, validates ownership to quiz, applies changes, replaces options for MCQ, recalculates total_mark, audits |
| `DeleteQuizQuestionUseCase` | Loads question, deletes (CASCADE handles options), recalculates total_mark, audits |
| `ReorderQuizQuestionsUseCase` | Validates all IDs belong to quiz, updates sort_order in batch |

### 5.3 Queries

**Location:** `Application/TenantAdminDashboard/Quiz/Queries/` (or `Infrastructure/Queries/TenantAdminDashboard/Quiz/`)

| Query | Returns |
|---|---|
| `ListQuizzesQuery` | Paginated quiz list with filters (status, type, exam_id, course_id) |
| `GetQuizQuery` | Single quiz with question count, total_mark |
| `GetQuizWithQuestionsQuery` | Quiz + all questions with options (for question management page) |
| `QuizListCriteria` | Filter DTO: status, quizType, examId, courseId, search, sortBy, sortDir |

---

## 6. Infrastructure Layer

### 6.1 Eloquent Models (Persistence Only)

**Location:** `Infrastructure/Persistence/TenantAdminDashboard/Quiz/`

| Model | Table | Traits |
|---|---|---|
| `QuizRecord` | `quizzes` | `BelongsToTenant` |
| `QuizQuestionRecord` | `quiz_questions` | `BelongsToTenant` |
| `QuizQuestionOptionRecord` | `quiz_question_options` | `BelongsToTenant` |

Each record has `toEntity()` and static `fromEntity()` mapper methods. These are persistence models, NOT domain objects.

### 6.2 Repository Implementations

| Implementation | Interface |
|---|---|
| `EloquentQuizRepository` | `QuizRepositoryInterface` |
| `EloquentQuizQuestionRepository` | `QuizQuestionRepositoryInterface` |
| `EloquentQuizQuestionOptionRepository` | `QuizQuestionOptionRepositoryInterface` |
| `EloquentHierarchyResolver` | `HierarchyResolverInterface` |

`EloquentHierarchyResolver` queries existing ExamHierarchy repositories (ExamRecord, SubjectRecord, ExamChapterRecord, ExamTopicRecord) to walk the tree and resolve the complete hierarchy from any partial input.

### 6.3 Service Provider

**Location:** `Providers/QuizServiceProvider.php`

Binds all repository interfaces to Eloquent implementations. Registered in `bootstrap/providers.php`.

---

## 7. HTTP Layer

### 7.1 Controllers

**Location:** `Http/TenantAdminDashboard/Quiz/Controllers/`

| Controller | Methods | Lines Target |
|---|---|---|
| `QuizReadController` | `index()`, `show()` | <15 lines each |
| `QuizWriteController` | `store()`, `update()`, `changeStatus()`, `archive()` | <20 lines each |
| `QuizQuestionController` | `index()`, `store()`, `update()`, `destroy()`, `reorder()` | <20 lines each |

All controllers are thin — delegate to UseCases/Queries, return Resources.

### 7.2 Form Requests

**Location:** `Http/TenantAdminDashboard/Quiz/Requests/`

| Request | Validates |
|---|---|
| `CreateQuizRequest` | title, quiz_type, is_free, access_level, course_id, exam_id, subject_id, hierarchy_chapter_id, topic_id, pass_mark, negative_marking, default_mcq_grade, time_minutes, max_attempts, expiry_days, sections, certificate, display options |
| `UpdateQuizRequest` | Same as create (all fields optional except title) |
| `ChangeQuizStatusRequest` | status (in: active, inactive) |
| `CreateQuizQuestionRequest` | quiz_id, title, type, grade, correct_explanation, image_url, video_url, solution_image_url, solution_video_url, section_key, bank metadata, difficulty_level, options[] |
| `UpdateQuizQuestionRequest` | Same as create |
| `ReorderQuestionsRequest` | question_ids[] |

Syntax validation only — no business logic in requests.

### 7.3 API Resources

**Location:** `Http/TenantAdminDashboard/Quiz/Resources/`

| Resource | Purpose |
|---|---|
| `QuizListResource` | Compact list view: id, title, quiz_type, status, total_mark, question_count, created_at |
| `QuizResource` | Full detail: all fields + question_count + exam hierarchy names |
| `QuizQuestionResource` | Question with options: id, title, type, grade, section_key, difficulty, options[], media |
| `QuizQuestionOptionResource` | Option: id, title, image_url, is_correct, sort_order |

### 7.4 Routes

**Location:** `routes/tenant_dashboard/quiz.php`

```php
Route::prefix('tenant/quizzes')->group(function () {
    // Quiz CRUD
    Route::get('/', [QuizReadController::class, 'index'])
        ->middleware('tenant.capability:quiz.view');
    Route::get('/{id}', [QuizReadController::class, 'show'])
        ->middleware('tenant.capability:quiz.view');
    Route::post('/', [QuizWriteController::class, 'store'])
        ->middleware('tenant.capability:quiz.create');
    Route::put('/{id}', [QuizWriteController::class, 'update'])
        ->middleware('tenant.capability:quiz.edit');
    Route::patch('/{id}/status', [QuizWriteController::class, 'changeStatus'])
        ->middleware('tenant.capability:quiz.edit');
    Route::delete('/{id}', [QuizWriteController::class, 'archive'])
        ->middleware('tenant.capability:quiz.archive');

    // Question CRUD (nested under quiz)
    Route::get('/{quizId}/questions', [QuizQuestionController::class, 'index'])
        ->middleware('tenant.capability:quiz.view');
    Route::post('/{quizId}/questions', [QuizQuestionController::class, 'store'])
        ->middleware('tenant.capability:quiz.edit');
    Route::put('/{quizId}/questions/{questionId}', [QuizQuestionController::class, 'update'])
        ->middleware('tenant.capability:quiz.edit');
    Route::delete('/{quizId}/questions/{questionId}', [QuizQuestionController::class, 'destroy'])
        ->middleware('tenant.capability:quiz.edit');
    Route::post('/{quizId}/questions/reorder', [QuizQuestionController::class, 'reorder'])
        ->middleware('tenant.capability:quiz.edit');
});
```

Middleware pipeline (per ADR-010 §6.3):
`tenant.resolve.token → auth:tenant_api → tenant.active → ensure.user.active → tenant.session → tenant.capability:{code}`

### 7.5 Capability Codes (New)

Add to `ProvisionDefaultRolesListener` and capability seeder:

| Code | Description | Default Roles |
|---|---|---|
| `quiz.view` | View/list quizzes and questions | OWNER, ADMIN, TEACHER |
| `quiz.create` | Create new quizzes | OWNER, ADMIN, TEACHER |
| `quiz.edit` | Edit quiz properties and manage questions | OWNER, ADMIN, TEACHER |
| `quiz.archive` | Archive quizzes | OWNER, ADMIN |

---

## 8. File Manifest

### 8.1 New Files (47 files)

**Domain Layer (15 files):**
```
Domain/TenantAdminDashboard/Quiz/Entities/QuizEntity.php
Domain/TenantAdminDashboard/Quiz/Entities/QuizQuestionEntity.php
Domain/TenantAdminDashboard/Quiz/Entities/QuizQuestionOptionEntity.php
Domain/TenantAdminDashboard/Quiz/ValueObjects/QuizType.php
Domain/TenantAdminDashboard/Quiz/ValueObjects/QuizStatus.php
Domain/TenantAdminDashboard/Quiz/ValueObjects/AccessLevel.php
Domain/TenantAdminDashboard/Quiz/ValueObjects/QuestionType.php
Domain/TenantAdminDashboard/Quiz/ValueObjects/DifficultyLevel.php
Domain/TenantAdminDashboard/Quiz/ValueObjects/SectionConfiguration.php
Domain/TenantAdminDashboard/Quiz/ValueObjects/HierarchyBinding.php
Domain/TenantAdminDashboard/Quiz/Events/QuizCreated.php
Domain/TenantAdminDashboard/Quiz/Events/QuizStatusChanged.php
Domain/TenantAdminDashboard/Quiz/Events/QuizArchived.php
Domain/TenantAdminDashboard/Quiz/Exceptions/InvalidQuizStatusTransitionException.php
Domain/TenantAdminDashboard/Quiz/Exceptions/QuizActivationRequirementsNotMetException.php
Domain/TenantAdminDashboard/Quiz/Exceptions/InvalidQuestionMediaException.php
Domain/TenantAdminDashboard/Quiz/Exceptions/McqOptionsRequiredException.php
Domain/TenantAdminDashboard/Quiz/Exceptions/InvalidSectionConfigurationException.php
Domain/TenantAdminDashboard/Quiz/Exceptions/CourseRequiredForPaidQuizException.php
Domain/TenantAdminDashboard/Quiz/Repositories/QuizRepositoryInterface.php
Domain/TenantAdminDashboard/Quiz/Repositories/QuizQuestionRepositoryInterface.php
Domain/TenantAdminDashboard/Quiz/Repositories/QuizQuestionOptionRepositoryInterface.php
Domain/TenantAdminDashboard/Quiz/Services/HierarchyResolverInterface.php
```

**Application Layer (12 files):**
```
Application/TenantAdminDashboard/Quiz/Commands/CreateQuizCommand.php
Application/TenantAdminDashboard/Quiz/Commands/UpdateQuizCommand.php
Application/TenantAdminDashboard/Quiz/Commands/ChangeQuizStatusCommand.php
Application/TenantAdminDashboard/Quiz/Commands/ArchiveQuizCommand.php
Application/TenantAdminDashboard/Quiz/Commands/CreateQuizQuestionCommand.php
Application/TenantAdminDashboard/Quiz/Commands/UpdateQuizQuestionCommand.php
Application/TenantAdminDashboard/Quiz/Commands/DeleteQuizQuestionCommand.php
Application/TenantAdminDashboard/Quiz/Commands/ReorderQuizQuestionsCommand.php
Application/TenantAdminDashboard/Quiz/UseCases/CreateQuizUseCase.php
Application/TenantAdminDashboard/Quiz/UseCases/UpdateQuizUseCase.php
Application/TenantAdminDashboard/Quiz/UseCases/ChangeQuizStatusUseCase.php
Application/TenantAdminDashboard/Quiz/UseCases/ArchiveQuizUseCase.php
Application/TenantAdminDashboard/Quiz/UseCases/CreateQuizQuestionUseCase.php
Application/TenantAdminDashboard/Quiz/UseCases/UpdateQuizQuestionUseCase.php
Application/TenantAdminDashboard/Quiz/UseCases/DeleteQuizQuestionUseCase.php
Application/TenantAdminDashboard/Quiz/UseCases/ReorderQuizQuestionsUseCase.php
```

**Infrastructure Layer (8 files):**
```
Infrastructure/Persistence/TenantAdminDashboard/Quiz/QuizRecord.php
Infrastructure/Persistence/TenantAdminDashboard/Quiz/QuizQuestionRecord.php
Infrastructure/Persistence/TenantAdminDashboard/Quiz/QuizQuestionOptionRecord.php
Infrastructure/Persistence/TenantAdminDashboard/Quiz/EloquentQuizRepository.php
Infrastructure/Persistence/TenantAdminDashboard/Quiz/EloquentQuizQuestionRepository.php
Infrastructure/Persistence/TenantAdminDashboard/Quiz/EloquentQuizQuestionOptionRepository.php
Infrastructure/Persistence/TenantAdminDashboard/Quiz/EloquentHierarchyResolver.php
Infrastructure/Queries/TenantAdminDashboard/Quiz/ListQuizzesQuery.php
Infrastructure/Queries/TenantAdminDashboard/Quiz/GetQuizQuery.php
Infrastructure/Queries/TenantAdminDashboard/Quiz/GetQuizWithQuestionsQuery.php
Infrastructure/Queries/TenantAdminDashboard/Quiz/QuizListCriteria.php
```

**HTTP Layer (12 files):**
```
Http/TenantAdminDashboard/Quiz/Controllers/QuizReadController.php
Http/TenantAdminDashboard/Quiz/Controllers/QuizWriteController.php
Http/TenantAdminDashboard/Quiz/Controllers/QuizQuestionController.php
Http/TenantAdminDashboard/Quiz/Requests/CreateQuizRequest.php
Http/TenantAdminDashboard/Quiz/Requests/UpdateQuizRequest.php
Http/TenantAdminDashboard/Quiz/Requests/ChangeQuizStatusRequest.php
Http/TenantAdminDashboard/Quiz/Requests/CreateQuizQuestionRequest.php
Http/TenantAdminDashboard/Quiz/Requests/UpdateQuizQuestionRequest.php
Http/TenantAdminDashboard/Quiz/Requests/ReorderQuestionsRequest.php
Http/TenantAdminDashboard/Quiz/Resources/QuizListResource.php
Http/TenantAdminDashboard/Quiz/Resources/QuizResource.php
Http/TenantAdminDashboard/Quiz/Resources/QuizQuestionResource.php
Http/TenantAdminDashboard/Quiz/Resources/QuizQuestionOptionResource.php
routes/tenant_dashboard/quiz.php
```

**Configuration (2 files):**
```
Providers/QuizServiceProvider.php
database/migrations/tenant/YYYY_MM_DD_create_quizzes_table.php
database/migrations/tenant/YYYY_MM_DD_create_quiz_questions_table.php
database/migrations/tenant/YYYY_MM_DD_create_quiz_question_options_table.php
```

### 8.2 Modified Files (3 files)

| File | Change |
|---|---|
| `bootstrap/providers.php` | Register `QuizServiceProvider` |
| `Application/SuperAdminDashboard/Tenant/Listeners/ProvisionDefaultRolesListener.php` | Add `quiz.*` capability codes |
| `routes/api.php` | Include `quiz.php` route file |

---

## 9. Testing Strategy

### 9.1 Unit Tests (Domain — No Database)

| Test File | Coverage |
|---|---|
| `QuizEntityTest` | Status transitions, invariant enforcement (CBT coupling, access model, course requirement, section requirement, activation gate) |
| `QuizTypeTest` | Valid/invalid types, isMockTest() includes pyq |
| `QuizStatusTest` | All valid transitions, all invalid transitions throw |
| `SectionConfigurationTest` | Valid sections, empty sections, disabled sections, missing required fields |
| `HierarchyBindingTest` | Coercion from each level, null handling |
| `QuestionTypeTest` | Valid/invalid types |
| `DifficultyLevelTest` | Valid/invalid levels, nullable |
| `AccessLevelTest` | Valid/invalid levels |

**Estimated: ~40 test methods**

### 9.2 Integration Tests (Application — With Database)

| Test File | Coverage |
|---|---|
| `CreateQuizUseCaseTest` | Happy path for each quiz type, hierarchy resolution, course linkage, audit log creation |
| `UpdateQuizUseCaseTest` | Property updates, type changes, section changes |
| `ChangeQuizStatusUseCaseTest` | All valid transitions, invalid transitions throw, activation gate |
| `ArchiveQuizUseCaseTest` | Archive from active, archive from inactive |
| `CreateQuizQuestionUseCaseTest` | MCQ with options, descriptive, default grade resolution, total_mark recalculation |
| `UpdateQuizQuestionUseCaseTest` | Change type, change grade, replace options, total_mark recalculation |
| `DeleteQuizQuestionUseCaseTest` | Delete and verify total_mark recalculation, CASCADE deletes options |
| `ReorderQuizQuestionsUseCaseTest` | Reorder and verify sort_order |

**Estimated: ~35 test methods**

### 9.3 Feature Tests (API — Full Request/Response)

| Test File | Coverage |
|---|---|
| `QuizCrudTest` | Full CRUD lifecycle: create → list → get → update → change status → archive |
| `QuizQuestionCrudTest` | Question lifecycle: create MCQ → create descriptive → update → reorder → delete |
| `QuizTenantIsolationTest` | Tenant A cannot see/modify Tenant B's quizzes |
| `QuizCapabilityDenialTest` | Users without quiz.create get 403, users with quiz.view can GET |

**Estimated: ~25 test methods**

### Total: ~100 test methods

---

## 10. Implementation Order (Sub-Phases)

### Sub-Phase A: Domain + Migrations (Days 1–3)

1. Create all 3 migration files
2. Implement all Value Objects with unit tests
3. Implement QuizEntity with invariant enforcement and unit tests
4. Implement QuizQuestionEntity and QuizQuestionOptionEntity
5. Implement domain events and exceptions
6. Implement HierarchyResolverInterface
7. Run PHPStan — must pass

**Gate:** All unit tests green, PHPStan 0 new errors.

### Sub-Phase B: Infrastructure + Application (Days 4–7)

1. Create Eloquent Records with BelongsToTenant trait
2. Implement all repository implementations with toEntity/fromEntity mappers
3. Implement EloquentHierarchyResolver
4. Create QuizServiceProvider and register bindings
5. Implement all Commands (DTOs)
6. Implement all UseCases following Phase 6 template
7. Implement Query classes
8. Write integration tests for all UseCases

**Gate:** All integration tests green, PHPStan 0 new errors.

### Sub-Phase C: HTTP Layer + Capabilities (Days 8–10)

1. Create FormRequest classes (syntax validation)
2. Create Resource classes (API response shaping)
3. Create thin Controllers
4. Create route file with capability middleware
5. Add quiz capability codes to ProvisionDefaultRolesListener
6. Register route file and service provider
7. Write feature tests (CRUD, isolation, capability denial)

**Gate:** All tests green (unit + integration + feature), PHPStan 0 new errors.

### Sub-Phase D: Audit + Quality Gate (Days 11–12)

1. Verify tenant isolation via cross-tenant test
2. Verify capability enforcement via denial tests
3. Verify total_mark recalculation correctness
4. Run full test suite (including all existing 345+ tests — zero regression)
5. PHPStan Level 5 — 0 new errors
6. Code review against Phase 6 DDD template checklist

**Gate:** READY for frontend integration and Quiz Phase 2 planning.

---

## 11. Decisions & Rationale

| Decision | Rationale |
|---|---|
| `draft` status added (Mentora only had active/inactive) | Allows quiz creation in incomplete state without exposing to students. Wizard-style partial saves become simple DRAFT updates. |
| `grade` as DECIMAL not VARCHAR | Mentora's string grade is a data integrity bug. UBOTZ enforces numeric precision. |
| `total_mark` recalculated atomically | Mentora's increment/decrement pattern has race conditions under concurrent question edits. We recalculate via `SUM(grade)` query after each question mutation. |
| Sections stored as JSON on quiz | Sections are quiz-level configuration, not independent entities. SectionConfiguration value object validates structure in domain. |
| HierarchyResolver as domain service | Eliminates 5× code duplication from Mentora. Single source of truth for hierarchy coercion. |
| `quiz_question_options` naming | Distinguishes from student answers (Phase 2). "Option" = what admin defines. "Answer" = what student provides. |
| No translation tables | UBOTZ doesn't support multi-locale. Title stored directly. Eliminates 3 tables and N+1 query patterns. |
| `sort_order` instead of `order` | Avoids MySQL reserved word. Consistent with UBOTZ naming convention. |
| Quiz Phase 1 = Admin only | Mirrors Course Phase approach. Proves the DDD pattern, validates tenant isolation, delivers manageable scope. Student quiz-taking is a separate aggregate with its own complexity. |

---

## 12. Risk Register

| Risk | Severity | Mitigation |
|---|---|---|
| Hierarchy resolver queries ExamHierarchy tables that may not be tenant-scoped correctly | HIGH | Verify ExamHierarchy repositories enforce tenant_id scope. Write cross-tenant test for hierarchy resolution. |
| total_mark recalculation via SUM query under high concurrent question edits | MEDIUM | Use pessimistic lock (SELECT FOR UPDATE) on quiz row during question mutations. Acceptable for admin operations (low concurrency). |
| Section configuration JSON schema drift | MEDIUM | SectionConfiguration value object validates on hydration. Any invalid JSON throws at domain boundary, not at DB level. |
| Mock test type coupling (CBT flags auto-set) | LOW | Enforced in QuizEntity constructor and update methods. Unit tests cover all type-to-flag combinations. |

---

*End of Implementation Plan — Quiz Phase 1*