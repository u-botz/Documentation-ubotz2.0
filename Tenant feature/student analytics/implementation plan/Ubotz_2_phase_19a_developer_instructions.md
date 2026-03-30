# UBOTZ 2.0 — Phase 19A Developer Instructions

## Student Analytics — Foundation & Aggregation Pipeline

| Field | Value |
|---|---|
| **Document Type** | Developer Instruction (Pre-Implementation Brief) |
| **Phase** | 19A |
| **Date** | March 26, 2026 |
| **Issued By** | Principal Engineer / Architecture Auditor |
| **Audience** | Implementation Developer (Antigravity) |
| **Expected Deliverable** | Phase 19A Implementation Plan (same format as 10A–15C plans) |
| **Prerequisites** | Quiz feature COMPLETE (quiz_results, quiz_result_responses, question bank with topic tags live), Course progress COMPLETE (course_learnings, video_watch_progress live), Attendance COMPLETE (attendance_sessions, attendance_records live), Assignment COMPLETE (assignments, assignment_submissions with grading live), Phase 15A COMPLETE (Branch bounded context, batch infrastructure live), Phase 14 COMPLETE (Notification infrastructure live) |

> **This is the data foundation for all student-facing and admin-facing analytics. Every dashboard, alert, and report built in Phases 19B and 19C depends on the aggregation tables and calculation pipeline designed here. Getting the schema and event wiring wrong means every downstream phase inherits the defect. Getting it right means 19B is just API exposure and 19C is just rendering.**

---

## 1. Mission Statement

Phase 19A builds the **Student Analytics Aggregation Pipeline** — a new bounded context (`StudentAnalytics`) that consumes signals from four existing bounded contexts (Quiz, Course, Attendance, Assignment), computes per-student and per-batch performance metrics using tenant-configurable weights, and persists the results into materialized aggregation tables optimized for dashboard reads.

**What this phase builds:**

- New `StudentAnalytics` bounded context with domain entities, value objects, and repository interfaces
- Tenant-configurable analytics weight configuration (same pattern as Lead Scoring in Phase 15C-II)
- Six aggregation tables storing pre-computed metrics at student, batch, and topic granularity
- Event listeners that react to signals from Quiz, Course, Attendance, and Assignment contexts
- Queued recalculation jobs (event-driven incremental + nightly full rebuild)
- Topic mastery calculation derived from quiz question bank tags

**What this phase does NOT build:**

- API endpoints (Phase 19B)
- Alert/notification dispatch (Phase 19B)
- Frontend dashboard views (Phase 19C)
- Export/PDF report generation (deferred beyond Phase 19)
- Teacher effectiveness scoring (deferred — separate product decision required)
- Term/Semester entity (batch date ranges serve as temporal boundaries)
- Gradebook / Report Card generation (separate feature, not analytics pipeline)

---

## 2. Business Requirements Summary

> **Checkpoint:** Antigravity must confirm understanding of this section before proceeding to the technical design. If any requirement is ambiguous, raise it in the Implementation Plan.

### 2.1 What Problem This Solves

Institutions using EducoreOS have student data scattered across four systems — quiz results, course progress, attendance records, and assignment grades. Today there is no unified view. A teacher cannot answer "How is Student X performing overall?" without manually checking four different screens. An admin cannot answer "Is Section A outperforming Section B?" at all.

Phase 19A creates the data layer that powers three dashboard views (built in 19C):

1. **Student Performance Profile** — per-student 360° view showing an overall performance score (0–100), individual dimension scores (quiz, course, attendance, assignment), topic-level strengths/weaknesses, and trend over time
2. **Batch Comparison Dashboard** — side-by-side comparison of batch-level aggregate metrics (average score, attendance rate, completion rate) to identify teaching gaps
3. **Topic Mastery Heatmap** — grid view of students × topics showing mastery levels, derived from quiz question-level analysis using question bank tags

### 2.2 Who Uses This

| Consumer | What They See | Built In |
|---|---|---|
| **Student** | Their own performance profile, topic strengths/weaknesses | 19C |
| **Teacher** | Performance profiles of students in their batches, batch comparison within their scope | 19C |
| **Tenant Admin** | All students, all batches, cross-batch comparison, institution-level analytics | 19C |

### 2.3 Approved Business Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Processing model | **Hybrid** — event-driven incremental updates + nightly full rebuild | Incremental keeps dashboards near-real-time (5–15 min); nightly rebuild is the consistency safety net that corrects any drift |
| Weight configuration | **Tenant-configurable** with platform defaults | Same pattern as Lead Scoring (15C-II); tenants have different priorities (coaching centers weight quizzes heavily, schools weight attendance) |
| Time dimension | **All-time storage with batch date-range filtering** | No Term entity exists; `batches.start_date`/`end_date` serve as implicit academic period boundaries |
| Topic analysis source | **Quiz question bank tags** (exam → subject → chapter → topic) | Questions are already tagged in the bank; this is the most granular data source available |
| Data freshness | **Near-real-time** (5–15 minute acceptable latency) | Event-driven jobs are queued; processing delay is acceptable |
| Scale assumption | **< 500 students per tenant, < 50 quizzes/month** in Phase 1 | Aggregation table design can be optimized later; correctness over performance for now |
| Exports | **Not in scope** for Phase 19 (dashboard-only) | Keeps output layer clean; export can be added as a Phase 19D if needed |

---

## 3. Data Source Inventory

### 3.1 Quiz Results

| Table | Key Columns for Analytics | Join Path |
|---|---|---|
| `quiz_results` | `id`, `tenant_id`, `quiz_id`, `user_id`, `status` ('passed'/'failed'/'waiting'), `user_grade`, `started_at`, `submitted_at`, `section_performance` (JSON) | Direct — `user_id` is the student |
| `quiz_result_responses` | `result_id`, `question_id`, `is_correct`, `marks_awarded`, `graded_by`, `graded_at` | Via `result_id` → `quiz_results.id` |
| Question bank tables | `question_id` → tagged with `exam_id`, `subject_id`, `chapter_id`, `topic_id`, `difficulty` | Via `question_id` → question bank hierarchy |

**What we extract:**
- Per-student quiz score (sum `marks_awarded` from `quiz_result_responses` per `result_id`)
- Per-student pass/fail rate across all quizzes
- Per-student per-topic correctness rate (join responses → questions → topic tags)
- Quiz completion time (`submitted_at - started_at`)

**Important:** Only include results where `quiz_results.status` is `'passed'` or `'failed'`. Exclude `'waiting'` (manually graded questions pending) — incomplete data would skew scores. When a `'waiting'` result transitions to `'passed'`/`'failed'` after manual grading, the recalculation job must pick it up.

### 3.2 Course Progress

| Table | Key Columns for Analytics | Join Path |
|---|---|---|
| `course_learnings` | `tenant_id`, `user_id`, `course_id`, `text_lesson_id`, `course_file_id`, `session_id` | Direct — presence of record = item completed |
| `video_watch_progress` | `course_file_id`, `watch_percentage`, `position_seconds`, `duration_seconds` | Via `course_file_id` → `course_files.id` |
| `course_enrollments` | `tenant_id`, `user_id`, `course_id`, `status` | Direct — filter to `status = 'active'` |

**What we extract:**
- Per-student per-course completion percentage (count `course_learnings` items / total publishable items in course) — mirrors `GetCourseProgressUseCase` logic
- Per-student average completion across all enrolled courses
- Per-student video engagement (average `watch_percentage` across watched videos)

**Important:** The platform deliberately does NOT store an aggregate progress column. The analytics pipeline WILL store a snapshot in the aggregation table — this is a read-optimized materialization, not a source-of-truth replacement. `GetCourseProgressUseCase` remains the canonical calculator; the analytics pipeline calls it or replicates its logic.

### 3.3 Attendance

| Table | Key Columns for Analytics | Join Path |
|---|---|---|
| `attendance_sessions` | `id`, `tenant_id`, `batch_id`, `subject_id`, `teacher_id`, `session_date`, `marking_status`, `is_cancelled` | Filter: `marking_status = 'completed'` AND `is_cancelled = false` |
| `attendance_records` | `attendance_session_id`, `student_id`, `status` ('present'/'absent'/'late'/'excused'), `late_minutes` | Via `attendance_session_id` → `attendance_sessions.id` |

**What we extract:**
- Per-student attendance rate: `(present + late + excused) / total_sessions * 100`
- Per-student late rate: `late / total_sessions * 100`
- Per-batch average attendance rate
- Attendance scoped to batch via `attendance_sessions.batch_id`

**Important:** Only count sessions where `marking_status = 'completed'` and `is_cancelled = false`. Pending or cancelled sessions must be excluded.

### 3.4 Assignments

| Table | Key Columns for Analytics | Join Path |
|---|---|---|
| `assignments` | `id`, `tenant_id`, `course_id`, `max_grade`, `pass_grade`, `status` | Filter: `status = 'active'` only |
| `assignment_submissions` | `assignment_id`, `student_id`, `grade`, `passed`, `status` | Via `assignment_id` → `assignments.id`; filter: `status = 'graded'` only |

**What we extract:**
- Per-student average assignment grade percentage: `AVG(grade / max_grade * 100)` across graded submissions
- Per-student assignment pass rate: `COUNT(passed = true) / COUNT(graded submissions) * 100`
- Per-student assignment submission rate: `COUNT(submissions) / COUNT(active assignments in enrolled courses) * 100`

**Important:** Only include submissions where `assignment_submissions.status = 'graded'`. Exclude `'pending'` and `'returned'` — these are incomplete evaluation cycles.

### 3.5 Batch (Cohort Dimension)

| Table | Key Columns | Purpose |
|---|---|---|
| `batches` | `id`, `tenant_id`, `code`, `name`, `start_date`, `end_date`, `status` | Defines the cohort and temporal boundary |
| `batch_students` | `batch_id`, `user_id`, `removed_at` | Student ↔ Batch mapping; active if `removed_at IS NULL` |

**Join path for batch-scoped analytics:**
1. `batch_students` (filter `removed_at IS NULL`) → identifies students in a batch
2. `attendance_sessions` (filter `batch_id = ?`) → identifies sessions for that batch
3. All other data sources (quiz, course, assignment) are scoped by `tenant_id` + `user_id` and optionally filtered by batch date range (`batches.start_date` / `end_date`) on the event timestamp

---

## 4. Architecture

### 4.1 Bounded Context: `StudentAnalytics`

This is a **new bounded context** under `TenantAdminDashboard`. It is a read-heavy, computation-focused context that consumes data from other contexts but does NOT write back to them.

**Cross-context access pattern:** The `StudentAnalytics` context reads from Quiz, Course, Attendance, and Assignment tables via **read-only query interfaces** (not direct Eloquent queries on foreign models). Each source context must expose a query interface that the analytics pipeline depends on.

```
Domain/TenantAdminDashboard/StudentAnalytics/
├── Entities/
│   ├── StudentPerformanceSnapshot.php        # Aggregate root — per-student materialized metrics
│   ├── BatchPerformanceSnapshot.php          # Per-batch aggregate metrics
│   └── StudentTopicMastery.php               # Per-student per-topic mastery record
├── ValueObjects/
│   ├── PerformanceScore.php                  # 0-100 score, immutable
│   ├── DimensionScore.php                    # Score for a single dimension (quiz/course/attendance/assignment)
│   ├── AnalyticsDimension.php                # Enum: QUIZ, COURSE, ATTENDANCE, ASSIGNMENT
│   ├── MasteryLevel.php                      # Enum: NOT_ATTEMPTED, WEAK, DEVELOPING, PROFICIENT, MASTERED
│   ├── RiskLevel.php                         # Enum: LOW, MEDIUM, HIGH, CRITICAL
│   └── RecalculationTrigger.php              # Enum: EVENT_DRIVEN, NIGHTLY_REBUILD, MANUAL
├── Events/
│   ├── StudentPerformanceRecalculated.php    # Fired after any recalculation
│   ├── StudentRiskLevelChanged.php           # Fired when risk level transitions
│   └── BatchPerformanceRecalculated.php      # Fired after batch aggregate update
├── Repositories/
│   ├── StudentPerformanceSnapshotRepositoryInterface.php
│   ├── BatchPerformanceSnapshotRepositoryInterface.php
│   ├── StudentTopicMasteryRepositoryInterface.php
│   └── AnalyticsConfigRepositoryInterface.php
├── Services/
│   ├── PerformanceCalculatorInterface.php    # Orchestrates score calculation
│   └── TopicMasteryCalculatorInterface.php   # Computes topic-level mastery
└── Exceptions/
    ├── InvalidWeightConfigurationException.php
    └── InsufficientDataException.php
```

### 4.2 Application Layer

```
Application/TenantAdminDashboard/StudentAnalytics/
├── UseCases/
│   ├── RecalculateStudentPerformanceUseCase.php    # Single student recalculation
│   ├── RecalculateBatchPerformanceUseCase.php      # Batch aggregate recalculation
│   ├── RecalculateTopicMasteryUseCase.php          # Topic mastery for a student
│   ├── FullRecalculationUseCase.php                # Nightly full rebuild for a tenant
│   ├── GetAnalyticsConfigUseCase.php               # Read weight configuration
│   └── UpdateAnalyticsConfigUseCase.php            # Update weight configuration
├── Commands/
│   ├── RecalculateStudentPerformanceCommand.php    # Immutable DTO
│   ├── RecalculateBatchPerformanceCommand.php
│   ├── RecalculateTopicMasteryCommand.php
│   └── UpdateAnalyticsConfigCommand.php
├── Listeners/
│   ├── OnQuizResultFinalized.php                   # Listens to quiz grading completion
│   ├── OnCourseProgressUpdated.php                 # Listens to course_learnings changes
│   ├── OnAttendanceMarked.php                      # Listens to attendance_records creation
│   ├── OnAssignmentGraded.php                      # Listens to assignment grading
│   └── OnBatchStudentChanged.php                   # Listens to batch membership changes
└── Jobs/
    ├── RecalculateStudentPerformanceJob.php         # Queued job — single student
    ├── RecalculateBatchPerformanceJob.php           # Queued job — single batch
    ├── RecalculateTopicMasteryJob.php               # Queued job — single student
    └── NightlyAnalyticsRebuildJob.php               # Scheduled job — full tenant rebuild
```

### 4.3 Infrastructure Layer

```
Infrastructure/TenantAdminDashboard/StudentAnalytics/
├── Persistence/
│   ├── EloquentStudentPerformanceSnapshotRepository.php
│   ├── EloquentBatchPerformanceSnapshotRepository.php
│   ├── EloquentStudentTopicMasteryRepository.php
│   └── EloquentAnalyticsConfigRepository.php
├── Models/
│   ├── StudentPerformanceSnapshotModel.php
│   ├── BatchPerformanceSnapshotModel.php
│   ├── StudentTopicMasteryModel.php
│   └── AnalyticsWeightConfigModel.php
├── Services/
│   ├── PerformanceCalculator.php                   # Implements PerformanceCalculatorInterface
│   └── TopicMasteryCalculator.php                  # Implements TopicMasteryCalculatorInterface
└── QueryAdapters/
    ├── QuizAnalyticsQueryAdapter.php               # Reads from quiz_results + quiz_result_responses
    ├── CourseProgressAnalyticsQueryAdapter.php      # Reads from course_learnings + video_watch_progress
    ├── AttendanceAnalyticsQueryAdapter.php          # Reads from attendance_sessions + attendance_records
    └── AssignmentAnalyticsQueryAdapter.php          # Reads from assignments + assignment_submissions
```

### 4.4 HTTP Layer

```
Http/TenantAdminDashboard/StudentAnalytics/
├── Controllers/
│   └── AnalyticsConfigController.php               # CRUD for weight configuration
├── Requests/
│   └── UpdateAnalyticsConfigRequest.php
└── Resources/
    └── AnalyticsConfigResource.php
```

**Note:** The full dashboard API endpoints are Phase 19B scope. Phase 19A only exposes the weight configuration management endpoint (Tenant Admin needs to configure weights before analytics are meaningful).

### 4.5 Console Commands

```
Console/Commands/
└── NightlyAnalyticsRebuildCommand.php              # php artisan analytics:rebuild {--tenant=}
```

---

## 5. Database Design

### 5.1 Migration 1: `analytics_weight_configs`

Stores tenant-configurable weights for performance score calculation.

**File:** `database/migrations/tenant/2026_03_26_190001_create_analytics_weight_configs_table.php`

```sql
CREATE TABLE analytics_weight_configs (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    tenant_id       BIGINT UNSIGNED NOT NULL,
    dimension       VARCHAR(30) NOT NULL,           -- 'quiz', 'course', 'attendance', 'assignment'
    weight          SMALLINT UNSIGNED NOT NULL,      -- 0-100, must sum to 100 across all 4 dimensions
    created_at      TIMESTAMP NULL,
    updated_at      TIMESTAMP NULL,

    CONSTRAINT fk_awc_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    UNIQUE KEY unq_awc_tenant_dimension (tenant_id, dimension),
    INDEX idx_awc_tenant (tenant_id)
);
```

**Platform defaults** (seeded if tenant has no config):

| Dimension | Default Weight |
|---|---|
| `quiz` | 35 |
| `course` | 25 |
| `attendance` | 25 |
| `assignment` | 15 |

**Validation rules:**
- Each weight must be 0–100
- All four dimensions must sum to exactly 100
- If a tenant sets a dimension to 0, that dimension is excluded from the score calculation (denominator adjusts)
- A tenant cannot delete the config — they can only update weights. The config is seeded on first analytics access if absent.

### 5.2 Migration 2: `student_performance_snapshots`

Materialized per-student performance metrics. This is the primary read table for the Student Performance Profile dashboard.

**File:** `database/migrations/tenant/2026_03_26_190002_create_student_performance_snapshots_table.php`

```sql
CREATE TABLE student_performance_snapshots (
    id                          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    tenant_id                   BIGINT UNSIGNED NOT NULL,
    student_id                  BIGINT UNSIGNED NOT NULL,      -- FK to users.id

    -- Weighted overall score
    overall_score               SMALLINT UNSIGNED NOT NULL DEFAULT 0,   -- 0-100
    risk_level                  VARCHAR(20) NOT NULL DEFAULT 'low',     -- low, medium, high, critical

    -- Individual dimension scores (0-100 each, before weighting)
    quiz_score                  SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    course_score                SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    attendance_score            SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    assignment_score            SMALLINT UNSIGNED NOT NULL DEFAULT 0,

    -- Raw metrics (for drill-down, not weighted)
    quiz_pass_rate              DECIMAL(5,2) NULL,              -- % of quizzes passed
    quiz_avg_score_pct          DECIMAL(5,2) NULL,              -- average score as %
    quizzes_attempted           INT UNSIGNED NOT NULL DEFAULT 0,
    quizzes_passed              INT UNSIGNED NOT NULL DEFAULT 0,

    course_completion_avg_pct   DECIMAL(5,2) NULL,              -- avg completion % across enrolled courses
    courses_enrolled            INT UNSIGNED NOT NULL DEFAULT 0,
    courses_completed           INT UNSIGNED NOT NULL DEFAULT 0,

    attendance_rate_pct         DECIMAL(5,2) NULL,              -- (present+late+excused)/total
    late_rate_pct               DECIMAL(5,2) NULL,              -- late/total
    sessions_total              INT UNSIGNED NOT NULL DEFAULT 0,
    sessions_present            INT UNSIGNED NOT NULL DEFAULT 0,
    sessions_late               INT UNSIGNED NOT NULL DEFAULT 0,
    sessions_absent             INT UNSIGNED NOT NULL DEFAULT 0,
    sessions_excused            INT UNSIGNED NOT NULL DEFAULT 0,

    assignment_avg_grade_pct    DECIMAL(5,2) NULL,              -- avg grade as %
    assignment_pass_rate_pct    DECIMAL(5,2) NULL,              -- % of graded assignments passed
    assignments_graded          INT UNSIGNED NOT NULL DEFAULT 0,
    assignments_passed          INT UNSIGNED NOT NULL DEFAULT 0,

    -- Metadata
    last_recalculated_at        TIMESTAMP NOT NULL,
    recalculation_trigger       VARCHAR(30) NOT NULL,           -- 'event_driven', 'nightly_rebuild', 'manual'
    data_staleness_seconds      INT UNSIGNED NOT NULL DEFAULT 0, -- seconds since last source event

    created_at                  TIMESTAMP NULL,
    updated_at                  TIMESTAMP NULL,

    CONSTRAINT fk_sps_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_sps_student FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY unq_sps_tenant_student (tenant_id, student_id),
    INDEX idx_sps_tenant_risk (tenant_id, risk_level),
    INDEX idx_sps_tenant_overall (tenant_id, overall_score)
);
```

### 5.3 Migration 3: `batch_performance_snapshots`

Materialized per-batch aggregate metrics for batch comparison dashboard.

**File:** `database/migrations/tenant/2026_03_26_190003_create_batch_performance_snapshots_table.php`

```sql
CREATE TABLE batch_performance_snapshots (
    id                          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    tenant_id                   BIGINT UNSIGNED NOT NULL,
    batch_id                    BIGINT UNSIGNED NOT NULL,       -- FK to batches.id

    -- Aggregate scores (averages across all active students in batch)
    avg_overall_score           DECIMAL(5,2) NOT NULL DEFAULT 0,
    avg_quiz_score              DECIMAL(5,2) NOT NULL DEFAULT 0,
    avg_course_score            DECIMAL(5,2) NOT NULL DEFAULT 0,
    avg_attendance_score        DECIMAL(5,2) NOT NULL DEFAULT 0,
    avg_assignment_score        DECIMAL(5,2) NOT NULL DEFAULT 0,

    -- Batch-level raw metrics
    avg_attendance_rate_pct     DECIMAL(5,2) NULL,
    avg_quiz_pass_rate_pct      DECIMAL(5,2) NULL,
    avg_course_completion_pct   DECIMAL(5,2) NULL,
    avg_assignment_grade_pct    DECIMAL(5,2) NULL,

    -- Risk distribution
    students_total              INT UNSIGNED NOT NULL DEFAULT 0,
    students_low_risk           INT UNSIGNED NOT NULL DEFAULT 0,
    students_medium_risk        INT UNSIGNED NOT NULL DEFAULT 0,
    students_high_risk          INT UNSIGNED NOT NULL DEFAULT 0,
    students_critical_risk      INT UNSIGNED NOT NULL DEFAULT 0,

    -- Metadata
    last_recalculated_at        TIMESTAMP NOT NULL,
    recalculation_trigger       VARCHAR(30) NOT NULL,

    created_at                  TIMESTAMP NULL,
    updated_at                  TIMESTAMP NULL,

    CONSTRAINT fk_bps_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_bps_batch FOREIGN KEY (batch_id) REFERENCES batches(id) ON DELETE CASCADE,
    UNIQUE KEY unq_bps_tenant_batch (tenant_id, batch_id),
    INDEX idx_bps_tenant (tenant_id)
);
```

### 5.4 Migration 4: `student_topic_masteries`

Per-student per-topic mastery levels derived from quiz question-level analysis.

**File:** `database/migrations/tenant/2026_03_26_190004_create_student_topic_masteries_table.php`

```sql
CREATE TABLE student_topic_masteries (
    id                      BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    tenant_id               BIGINT UNSIGNED NOT NULL,
    student_id              BIGINT UNSIGNED NOT NULL,

    -- Topic hierarchy (from question bank)
    exam_id                 BIGINT UNSIGNED NULL,
    subject_id              BIGINT UNSIGNED NOT NULL,
    chapter_id              BIGINT UNSIGNED NULL,
    topic_id                BIGINT UNSIGNED NULL,

    -- Mastery metrics
    questions_attempted     INT UNSIGNED NOT NULL DEFAULT 0,
    questions_correct       INT UNSIGNED NOT NULL DEFAULT 0,
    correctness_rate_pct    DECIMAL(5,2) NOT NULL DEFAULT 0,
    mastery_level           VARCHAR(20) NOT NULL DEFAULT 'not_attempted',  -- not_attempted, weak, developing, proficient, mastered

    -- Metadata
    last_recalculated_at    TIMESTAMP NOT NULL,

    created_at              TIMESTAMP NULL,
    updated_at              TIMESTAMP NULL,

    CONSTRAINT fk_stm_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_stm_student FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY unq_stm_student_topic (tenant_id, student_id, subject_id, COALESCE(chapter_id, 0), COALESCE(topic_id, 0)),
    INDEX idx_stm_tenant_student (tenant_id, student_id),
    INDEX idx_stm_tenant_subject (tenant_id, subject_id),
    INDEX idx_stm_mastery (tenant_id, mastery_level)
);
```

**Mastery level thresholds** (platform-defined, not tenant-configurable in Phase 19A):

| Level | Correctness Rate | Description |
|---|---|---|
| `not_attempted` | 0 questions attempted | No data |
| `weak` | 0% – 39% | Needs significant improvement |
| `developing` | 40% – 59% | Partial understanding |
| `proficient` | 60% – 79% | Solid understanding |
| `mastered` | 80% – 100% | Strong command |

**Granularity decision:** Store at the **most granular level available** from the question tag. If a question is tagged with `subject_id` + `chapter_id` + `topic_id`, store one row at that level. If tagged only with `subject_id`, store at subject level with `chapter_id = NULL` and `topic_id = NULL`. The heatmap in 19C will aggregate upward.

**IMPORTANT — Composite unique key:** MySQL does not support `COALESCE` in unique constraints. The implementation must use a functional alternative. Options:

- **Option A (recommended):** Use a sentinel value (`0`) instead of `NULL` for the unique constraint columns. Store `chapter_id = 0` and `topic_id = 0` when the question doesn't have those tags. This allows a clean `UNIQUE (tenant_id, student_id, subject_id, chapter_id, topic_id)`.
- **Option B:** Use a generated/virtual column that combines the hierarchy into a single hash and apply unique on that.

The implementation plan MUST specify which option is chosen and justify it.

### 5.5 Migration 5: `student_performance_history`

Stores periodic snapshots for trend analysis. One row per student per snapshot period.

**File:** `database/migrations/tenant/2026_03_26_190005_create_student_performance_history_table.php`

```sql
CREATE TABLE student_performance_history (
    id                  BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    tenant_id           BIGINT UNSIGNED NOT NULL,
    student_id          BIGINT UNSIGNED NOT NULL,
    snapshot_date       DATE NOT NULL,                  -- The date this snapshot represents
    overall_score       SMALLINT UNSIGNED NOT NULL,
    quiz_score          SMALLINT UNSIGNED NOT NULL,
    course_score        SMALLINT UNSIGNED NOT NULL,
    attendance_score    SMALLINT UNSIGNED NOT NULL,
    assignment_score    SMALLINT UNSIGNED NOT NULL,
    risk_level          VARCHAR(20) NOT NULL,

    created_at          TIMESTAMP NULL,

    CONSTRAINT fk_sph_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_sph_student FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY unq_sph_tenant_student_date (tenant_id, student_id, snapshot_date),
    INDEX idx_sph_tenant_date (tenant_id, snapshot_date)
);
```

**Snapshot frequency:** One snapshot per student per day, written by the nightly rebuild job. This table grows linearly but is bounded by tenant size and retention policy (Phase 19A seeds a 90-day retention; cleanup via the existing notification cleanup pattern, extended or new command).

### 5.6 Migration 6: `analytics_recalculation_log`

Audit trail of all recalculation runs for debugging and monitoring.

**File:** `database/migrations/tenant/2026_03_26_190006_create_analytics_recalculation_log_table.php`

```sql
CREATE TABLE analytics_recalculation_log (
    id                  BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    tenant_id           BIGINT UNSIGNED NOT NULL,
    trigger_type        VARCHAR(30) NOT NULL,           -- 'event_driven', 'nightly_rebuild', 'manual'
    scope               VARCHAR(30) NOT NULL,           -- 'student', 'batch', 'topic', 'full_tenant'
    target_id           BIGINT UNSIGNED NULL,            -- student_id or batch_id depending on scope
    source_event        VARCHAR(100) NULL,               -- e.g. 'quiz_result_finalized', 'attendance_marked'
    students_processed  INT UNSIGNED NOT NULL DEFAULT 0,
    duration_ms         INT UNSIGNED NOT NULL DEFAULT 0,
    status              VARCHAR(20) NOT NULL,            -- 'completed', 'failed', 'partial'
    error_message       TEXT NULL,
    started_at          TIMESTAMP NOT NULL,
    completed_at        TIMESTAMP NULL,

    created_at          TIMESTAMP NULL,

    INDEX idx_arl_tenant_date (tenant_id, started_at),
    INDEX idx_arl_status (status)
);
```

**This table does NOT have `updated_at`** — recalculation log entries are append-only, never updated.

---

## 6. Tenant Capability

### 6.1 New Capability

| Code | Group | Display Name |
|---|---|---|
| `student_analytics.view` | `student_analytics` | View Student Analytics |
| `student_analytics.configure` | `student_analytics` | Configure Analytics Weights |

### 6.2 Capability Seeder

Add both capabilities to the `tenant_capabilities` table via seeder. Assign `student_analytics.view` to system roles: `owner`, `admin`, `teacher`. Assign `student_analytics.configure` to `owner` and `admin` only.

### 6.3 Tenant Module

Register a new module code: `module.student_analytics`. This must be added to the platform capability set and gated at the subscription plan level (Business and Professional plans include it; Starter plan does not — confirm with product owner).

### 6.4 Route Middleware

All Phase 19A routes must use:
```
tenant.module:module.student_analytics
tenant.capability:student_analytics.configure   (for config endpoints)
```

---

## 7. Domain Layer Detail

### 7.1 Value Objects

**`PerformanceScore`**
- Range: 0–100 (unsigned integer)
- Constructor validates bounds
- Immutable
- `fromRaw(float $rawScore): self` — clamps to 0–100, rounds to nearest integer

**`DimensionScore`**
- Wraps a `PerformanceScore` with an `AnalyticsDimension` tag
- Example: `new DimensionScore(AnalyticsDimension::QUIZ, PerformanceScore::fromRaw(78.5))`

**`AnalyticsDimension`** (Enum)
```php
enum AnalyticsDimension: string
{
    case QUIZ = 'quiz';
    case COURSE = 'course';
    case ATTENDANCE = 'attendance';
    case ASSIGNMENT = 'assignment';
}
```

**`MasteryLevel`** (Enum)
```php
enum MasteryLevel: string
{
    case NOT_ATTEMPTED = 'not_attempted';
    case WEAK = 'weak';
    case DEVELOPING = 'developing';
    case PROFICIENT = 'proficient';
    case MASTERED = 'mastered';

    public static function fromCorrectnessRate(float $rate, int $questionsAttempted): self
    {
        if ($questionsAttempted === 0) return self::NOT_ATTEMPTED;
        return match(true) {
            $rate >= 80.0 => self::MASTERED,
            $rate >= 60.0 => self::PROFICIENT,
            $rate >= 40.0 => self::DEVELOPING,
            default => self::WEAK,
        };
    }
}
```

**`RiskLevel`** (Enum)
```php
enum RiskLevel: string
{
    case LOW = 'low';
    case MEDIUM = 'medium';
    case HIGH = 'high';
    case CRITICAL = 'critical';

    public static function fromOverallScore(int $score): self
    {
        return match(true) {
            $score >= 70 => self::LOW,
            $score >= 50 => self::MEDIUM,
            $score >= 30 => self::HIGH,
            default => self::CRITICAL,
        };
    }
}
```

**`RecalculationTrigger`** (Enum)
```php
enum RecalculationTrigger: string
{
    case EVENT_DRIVEN = 'event_driven';
    case NIGHTLY_REBUILD = 'nightly_rebuild';
    case MANUAL = 'manual';
}
```

### 7.2 Domain Events

| Event | Payload | When Dispatched |
|---|---|---|
| `StudentPerformanceRecalculated` | `tenantId`, `studentId`, `overallScore`, `riskLevel`, `previousRiskLevel`, `trigger` | After any student performance snapshot is updated |
| `StudentRiskLevelChanged` | `tenantId`, `studentId`, `previousLevel`, `newLevel`, `overallScore` | Only when `risk_level` changes between recalculations (not on every recalc) |
| `BatchPerformanceRecalculated` | `tenantId`, `batchId`, `avgOverallScore`, `trigger` | After batch aggregate snapshot is updated |

**`StudentRiskLevelChanged` is the event that Phase 19B will use to trigger notifications.** It must be dispatched OUTSIDE the database transaction, after commit, per platform convention.

### 7.3 Service Interfaces

**`PerformanceCalculatorInterface`**
```php
interface PerformanceCalculatorInterface
{
    /**
     * Calculates all dimension scores and the weighted overall score for a single student.
     * Returns a StudentPerformanceSnapshot entity ready for persistence.
     */
    public function calculateForStudent(
        int $tenantId,
        int $studentId,
        RecalculationTrigger $trigger
    ): StudentPerformanceSnapshot;

    /**
     * Calculates batch-level aggregates from existing student snapshots.
     * Prerequisite: all students in the batch must have up-to-date snapshots.
     */
    public function calculateForBatch(
        int $tenantId,
        int $batchId,
        RecalculationTrigger $trigger
    ): BatchPerformanceSnapshot;
}
```

**`TopicMasteryCalculatorInterface`**
```php
interface TopicMasteryCalculatorInterface
{
    /**
     * Recalculates topic mastery for a single student across all topics
     * they've encountered in quiz questions.
     *
     * @return StudentTopicMastery[] Array of mastery records
     */
    public function calculateForStudent(
        int $tenantId,
        int $studentId
    ): array;
}
```

---

## 8. Calculation Logic

### 8.1 Per-Dimension Score Calculation

Each dimension produces a raw score from 0–100. The `PerformanceCalculator` computes each independently.

**Quiz Dimension Score:**
```
quiz_score = weighted average of:
  - Quiz pass rate (% of fully-graded quizzes passed)     × 0.50
  - Quiz average score (avg marks_awarded/max_marks × 100) × 0.50

If quizzes_attempted == 0 → quiz_score = NULL (dimension excluded from overall)
```

**Course Dimension Score:**
```
course_score = weighted average of:
  - Average completion % across enrolled courses  × 0.70
  - Average video watch % across watched videos   × 0.30

If courses_enrolled == 0 → course_score = NULL (dimension excluded from overall)
```

**Attendance Dimension Score:**
```
attendance_score = attendance_rate_pct × 0.80 + (100 - late_rate_pct) × 0.20

Where:
  attendance_rate_pct = (present + late + excused) / total_sessions × 100
  late_rate_pct = late / total_sessions × 100

If sessions_total == 0 → attendance_score = NULL (dimension excluded from overall)
```

**Assignment Dimension Score:**
```
assignment_score = weighted average of:
  - Average grade percentage  × 0.60
  - Assignment pass rate      × 0.40

If assignments_graded == 0 → assignment_score = NULL (dimension excluded from overall)
```

### 8.2 Weighted Overall Score

```
overall_score = Σ (dimension_score × weight) / Σ (weight for non-null dimensions)
```

If a dimension score is `NULL` (no data), that dimension's weight is excluded from both numerator and denominator. This prevents penalizing students who haven't interacted with a particular system yet.

**Example:**
- Tenant weights: Quiz=35, Course=25, Attendance=25, Assignment=15
- Student has: Quiz=80, Course=NULL (not enrolled in any course), Attendance=90, Assignment=70
- Effective weights: Quiz=35, Attendance=25, Assignment=15 (total=75)
- Overall = (80×35 + 90×25 + 70×15) / 75 = (2800 + 2250 + 1050) / 75 = 81.3 → 81

### 8.3 Risk Level Assignment

After computing `overall_score`, assign `risk_level` using `RiskLevel::fromOverallScore()`. If the new risk level differs from the previously stored value, dispatch `StudentRiskLevelChanged`.

### 8.4 Topic Mastery Calculation

For each student:
1. Query all `quiz_result_responses` for that student where `quiz_results.status IN ('passed', 'failed')` (exclude `'waiting'`)
2. Join `quiz_result_responses.question_id` → question bank to get `subject_id`, `chapter_id`, `topic_id`
3. Group by the most granular hierarchy level available (subject → chapter → topic)
4. For each group: `correctness_rate = questions_correct / questions_attempted × 100`
5. Assign `mastery_level` via `MasteryLevel::fromCorrectnessRate()`
6. Upsert into `student_topic_masteries`

---

## 9. Processing Pipeline

### 9.1 Hybrid Model (Recommended Architecture)

**Event-Driven Incremental Updates:**

When a source event occurs (quiz graded, attendance marked, assignment graded, course item completed), a listener dispatches a queued job to recalculate the affected student's snapshot. The job:

1. Locks the student's snapshot row (advisory lock, not `SELECT FOR UPDATE` — this is analytics, not financial)
2. Calls `PerformanceCalculator::calculateForStudent()`
3. Upserts the `student_performance_snapshots` row
4. If risk level changed, dispatches `StudentRiskLevelChanged` event AFTER commit
5. Dispatches a `RecalculateBatchPerformanceJob` for each batch the student belongs to
6. Logs to `analytics_recalculation_log`

**Nightly Full Rebuild:**

A scheduled command (`analytics:rebuild`) runs at 02:00 AM server time:

1. For each active tenant with `module.student_analytics` enabled:
   a. Query all active students (students with at least one enrollment, batch membership, or quiz attempt)
   b. Recalculate every student's snapshot from scratch
   c. Recalculate every active batch's aggregate
   d. Recalculate topic mastery for every student with quiz data
   e. Write one row per student to `student_performance_history` (snapshot_date = today)
   f. Purge `student_performance_history` rows older than 90 days
   g. Log the run to `analytics_recalculation_log`

2. Processing is chunked: 50 students per chunk, with `gc_collect_cycles()` between chunks to prevent memory leaks in long-running processes.

**Why both?** Event-driven updates keep dashboards fresh (5–15 minute latency). Nightly rebuild is the consistency safety net — if an event was missed, the queue backed up, or a bug introduced drift, the nightly job corrects it. The nightly job also writes history snapshots that event-driven processing does not.

### 9.2 Event → Listener Wiring

| Source Event | Listener | Job Dispatched | Delay |
|---|---|---|---|
| Quiz result status changes from `'waiting'` to `'passed'`/`'failed'` (manual grading complete) | `OnQuizResultFinalized` | `RecalculateStudentPerformanceJob` + `RecalculateTopicMasteryJob` | 5 minutes (debounce — teacher may grade multiple questions in quick succession) |
| Quiz result created with status `'passed'`/`'failed'` (auto-graded quiz) | `OnQuizResultFinalized` | `RecalculateStudentPerformanceJob` + `RecalculateTopicMasteryJob` | 2 minutes |
| `course_learnings` record created (lesson/file completed) | `OnCourseProgressUpdated` | `RecalculateStudentPerformanceJob` | 5 minutes (debounce — student may complete multiple items in a session) |
| `attendance_records` created (attendance marked for a session) | `OnAttendanceMarked` | `RecalculateStudentPerformanceJob` | 10 minutes (debounce — teacher marks entire class at once) |
| `assignment_submissions.status` changes to `'graded'` | `OnAssignmentGraded` | `RecalculateStudentPerformanceJob` | 2 minutes |
| `batch_students` record created or `removed_at` set | `OnBatchStudentChanged` | `RecalculateBatchPerformanceJob` | 1 minute |

**Debounce strategy:** Jobs are dispatched with a `delay()`. If multiple events fire for the same student within the delay window, the queue naturally deduplicates (only the most recently queued job runs with current data). Use a cache key `analytics:recalc:student:{tenantId}:{studentId}` with TTL matching the delay to skip redundant dispatches.

### 9.3 Queue Configuration

| Queue Name | Purpose | Priority |
|---|---|---|
| `analytics` | All analytics recalculation jobs | Low (below `default`, above `low`) |

Analytics jobs must NOT compete with payment processing, notification delivery, or other business-critical queues. Use a dedicated `analytics` queue name and configure the queue worker with appropriate priority ordering.

### 9.4 Required Domain Events from Source Contexts

The following domain events MUST exist in the source bounded contexts. The implementation plan must verify each exists and document the event class + where it's dispatched:

| Event | Expected Location | Dispatched When |
|---|---|---|
| Quiz result created / status changed | `Domain/TenantAdminDashboard/Quiz/Events/` | After quiz submission is auto-graded or manually graded |
| Course learning recorded | `Domain/TenantAdminDashboard/Course/Events/` or dispatched from UseCase | After `course_learnings` row is inserted |
| Attendance marked | `Domain/TenantAdminDashboard/Attendance/Events/` | After `attendance_records` are bulk-inserted for a session |
| Assignment graded | `Domain/TenantAdminDashboard/Assignment/Events/` | After teacher grades a submission |
| Batch student added/removed | `Domain/TenantAdminDashboard/Branch/Events/` or equivalent | After `batch_students` row is inserted or `removed_at` is set |

**If any of these events do not exist:** The implementation plan must include creating them in the source context. These events are facts about things that happened — they follow platform convention (past tense, dispatched outside transactions).

---

## 10. Cross-Context Query Adapters

### 10.1 Pattern

The `StudentAnalytics` context must NOT directly query Eloquent models belonging to other bounded contexts. Instead, it uses **Query Adapter** classes in its own infrastructure layer that encapsulate the raw SQL or query builder calls needed to extract analytics data.

This is a pragmatic compromise: full service interfaces on each source context would be ideal but disproportionate for read-only aggregation queries. Query Adapters are infrastructure-layer classes that know about database tables but are isolated within the `StudentAnalytics` context.

**Each adapter must:**
- Accept `tenantId` as a required parameter on every method
- Include `tenant_id` in every WHERE clause (defense-in-depth, even with global scopes)
- Return plain DTOs or arrays — never Eloquent models from foreign contexts
- Be covered by integration tests that verify correct data extraction

### 10.2 Adapter Contracts

**`QuizAnalyticsQueryAdapter`**
```php
public function getStudentQuizMetrics(int $tenantId, int $studentId): QuizMetricsDTO;
public function getStudentTopicResponses(int $tenantId, int $studentId): array; // [{question_id, subject_id, chapter_id, topic_id, is_correct, marks_awarded}]
```

**`CourseProgressAnalyticsQueryAdapter`**
```php
public function getStudentCourseMetrics(int $tenantId, int $studentId): CourseMetricsDTO;
```

**`AttendanceAnalyticsQueryAdapter`**
```php
public function getStudentAttendanceMetrics(int $tenantId, int $studentId, ?int $batchId = null): AttendanceMetricsDTO;
```

**`AssignmentAnalyticsQueryAdapter`**
```php
public function getStudentAssignmentMetrics(int $tenantId, int $studentId): AssignmentMetricsDTO;
```

Each DTO is a simple, immutable data class containing the raw counts and percentages needed by the `PerformanceCalculator`.

---

## 11. Analytics Weight Configuration API

### 11.1 Endpoints

| Method | Path | Middleware | Description |
|---|---|---|---|
| `GET` | `/api/tenant/analytics/config` | `tenant.module:module.student_analytics`, `tenant.capability:student_analytics.configure` | Get current weight configuration |
| `PUT` | `/api/tenant/analytics/config` | `tenant.module:module.student_analytics`, `tenant.capability:student_analytics.configure` | Update weight configuration |

### 11.2 Request: `PUT /api/tenant/analytics/config`

```json
{
    "weights": {
        "quiz": 35,
        "course": 25,
        "attendance": 25,
        "assignment": 15
    }
}
```

**Validation:**
- All four dimensions must be present
- Each value must be integer 0–100
- Sum must equal exactly 100
- At least two dimensions must have weight > 0 (a single-dimension score is meaningless)

### 11.3 Response

```json
{
    "data": {
        "weights": {
            "quiz": 35,
            "course": 25,
            "attendance": 25,
            "assignment": 15
        },
        "updated_at": "2026-03-26T14:30:00Z"
    }
}
```

### 11.4 Side Effect

When weights are updated, dispatch a `NightlyAnalyticsRebuildJob` for the tenant (queued, not immediate) to recalculate all snapshots with the new weights. This ensures dashboards reflect the new weighting without waiting for the next nightly run.

**Audit:** Log weight changes to `tenant_audit_logs` with `old_values` / `new_values` per platform convention. Write audit OUTSIDE the transaction (`DB::afterCommit()`).

---

## 12. Business Rules (NON-NEGOTIABLE)

| Rule ID | Rule | Enforcement |
|---|---|---|
| BR-01 | Every aggregation table must have `tenant_id` with `BelongsToTenant` global scope | Migration + Model |
| BR-02 | Analytics calculations must NEVER write to source tables (quiz_results, attendance_records, etc.) | Code review — QueryAdapters are read-only |
| BR-03 | Weight configuration must always sum to 100 | Validation in `UpdateAnalyticsConfigRequest` + domain entity constructor |
| BR-04 | Dimensions with NULL scores (no data) are excluded from weighted calculation, not treated as zero | `PerformanceCalculator` logic |
| BR-05 | `StudentRiskLevelChanged` event dispatched OUTSIDE database transaction | `DB::afterCommit()` in UseCase |
| BR-06 | Nightly rebuild must be idempotent — running it twice produces the same result | Upsert pattern on unique keys |
| BR-07 | Topic mastery only includes fully-graded quiz attempts (`status != 'waiting'`) | QueryAdapter WHERE clause |
| BR-08 | Attendance metrics only include completed, non-cancelled sessions | QueryAdapter WHERE clause |
| BR-09 | Assignment metrics only include graded submissions (`status = 'graded'`) | QueryAdapter WHERE clause |
| BR-10 | All recalculation runs are logged to `analytics_recalculation_log` | UseCase responsibility |
| BR-11 | Analytics jobs run on dedicated `analytics` queue, never on `default` or `high` | Job class `$queue` property |
| BR-12 | Debounce: redundant recalculation jobs within the delay window are suppressed | Cache-based dedup check at job dispatch |
| BR-13 | Student performance history retention: 90 days (purged by nightly job) | Nightly rebuild command |
| BR-14 | Audit log for weight config changes written OUTSIDE transaction | `DB::afterCommit()` |

---

## 13. What Phase 19A Does NOT Include

| Excluded Item | Reason | Deferred To |
|---|---|---|
| Dashboard API endpoints (list students, compare batches, etc.) | Separate concern — data exposure | Phase 19B |
| Risk-based alert notifications to teachers/admins | Depends on 19A data + Phase 14 infra | Phase 19B |
| Frontend dashboard views | Depends on 19B API contracts | Phase 19C |
| Export (CSV/PDF) | Dashboard-only in Phase 19 | Phase 19D (if needed) |
| Teacher effectiveness scoring | Requires separate product decision | Deferred indefinitely |
| Term/Semester entity | Batch date ranges serve this purpose | Deferred |
| Real-time WebSocket updates to dashboards | Near-real-time (polling) is sufficient | Deferred |
| Tenant-configurable risk level thresholds | Platform-defined thresholds in Phase 19A | Future enhancement |
| Tenant-configurable mastery level thresholds | Platform-defined thresholds in Phase 19A | Future enhancement |
| AI-generated learning insights / recommendations | Requires ML pipeline | Future |
| Parent view of student analytics | Requires parent portal | Future |

---

## 14. Quality Gates — Phase 19A Complete

### 14.1 Architecture Gates

- [ ] `StudentAnalytics` bounded context is fully isolated — no imports from Quiz/Course/Attendance/Assignment domain layers
- [ ] QueryAdapters are infrastructure-layer classes, not domain services
- [ ] All value objects are pure PHP, no framework imports
- [ ] Domain events are past-tense facts with immutable payloads
- [ ] No Eloquent models from foreign contexts are used inside `StudentAnalytics`
- [ ] All domain events dispatched outside database transactions (`DB::afterCommit()`)
- [ ] Audit logging written outside database transactions

### 14.2 Data Safety Gates

- [ ] Every aggregation table has `tenant_id` column with `BelongsToTenant` global scope
- [ ] No cross-tenant data leakage possible — verified by test with two tenants
- [ ] Analytics pipeline NEVER writes to source tables (quiz_results, attendance_records, etc.)
- [ ] Nightly rebuild is idempotent — running twice produces identical snapshots
- [ ] Weight update correctly triggers full recalculation
- [ ] NULL dimension handling: student with no quiz data gets correct score excluding quiz weight

### 14.3 Functional Gates

- [ ] Student performance snapshot correctly computed for student with all 4 data sources
- [ ] Student performance snapshot correctly computed for student with only 1-2 data sources
- [ ] Batch performance snapshot correctly aggregates across all active batch members
- [ ] Topic mastery correctly derived from quiz question tags at subject/chapter/topic levels
- [ ] Event-driven recalculation triggers correctly for each source event type
- [ ] Debounce prevents redundant recalculations within delay window
- [ ] Nightly rebuild processes all active tenants with the analytics module enabled
- [ ] History snapshot written correctly with one row per student per day
- [ ] History older than 90 days purged by nightly job
- [ ] Recalculation log records every run with timing and status
- [ ] Weight configuration API: create, read, update with validation (sum=100)
- [ ] Weight configuration seeded with platform defaults on first access

### 14.4 Performance Gates

- [ ] Single student recalculation completes in < 2 seconds
- [ ] Batch recalculation for 500-student batch completes in < 30 seconds
- [ ] Nightly full rebuild for 500-student tenant completes in < 5 minutes
- [ ] No N+1 queries in QueryAdapters (verified via query log)

### 14.5 PHPStan Gate

- [ ] PHPStan Level 5 passes with zero errors across all new code

---

## 15. Constraints & Reminders

### Architecture Constraints

- **Listeners dispatch jobs, they do NOT calculate.** Listeners are thin — they extract the relevant IDs from the domain event, check the debounce cache key, and dispatch a queued job. All calculation logic lives in the `PerformanceCalculator` / `TopicMasteryCalculator` service implementations.
- **Jobs are idempotent.** A job can run multiple times for the same student without producing incorrect results. This means: always recalculate from source data, never increment/decrement stored values.
- **QueryAdapters own the SQL.** The `PerformanceCalculator` calls QueryAdapters to get metrics DTOs. It does NOT directly query any database table. This separation exists so that if source table schemas change, only the QueryAdapter needs updating.
- **No business logic in controllers.** The config controller delegates to `UpdateAnalyticsConfigUseCase` / `GetAnalyticsConfigUseCase`.
- **HTTP namespace follows Pattern B:** `Http/TenantAdminDashboard/StudentAnalytics/Controllers/`

### Docker Environment

- Container: Alpine Linux — use `sh` not `bash`
- Container name: `ubotz_backend`
- Database: `ubotz_mysql`
- Queue: Redis DB 3 (existing)
- Analytics queue worker must be added to the Docker Compose supervisor config

### What NOT to Do

- Do NOT store calculated scores as DECIMAL/FLOAT. `overall_score` and dimension scores are `SMALLINT UNSIGNED` (0–100). Raw percentages like `attendance_rate_pct` use `DECIMAL(5,2)`.
- Do NOT use `SELECT FOR UPDATE` on analytics tables. These are not financial records. Use advisory locks (cache-based) for deduplication only.
- Do NOT dispatch `StudentRiskLevelChanged` inside a transaction. This event may trigger notifications (in 19B), and notification dispatch must not be rolled back.
- Do NOT create a "real-time" calculation path that bypasses the aggregation tables. All dashboard reads come from snapshots, never from on-the-fly source queries.
- Do NOT put analytics jobs on the `default` or `high` queue. Use the dedicated `analytics` queue.
- Do NOT skip the debounce mechanism. Without it, a teacher grading 30 assignments in 5 minutes would trigger 30 recalculation jobs.
- Do NOT import Eloquent models from Quiz, Course, Attendance, or Assignment contexts into the StudentAnalytics domain or application layers. Use QueryAdapters only.
- Do NOT write audit logs inside database transactions. Use `DB::afterCommit()`.

---

## 16. Implementation Plan Requirements

The Implementation Plan produced by Antigravity must include:

1. **Event verification:** For each of the 5 source events in §9.4, confirm whether the event class exists today, document its location and payload, or specify the new event class to be created.
2. **Composite unique key decision:** For `student_topic_masteries`, specify whether Option A (sentinel values) or Option B (virtual column) is used, with justification.
3. **Queue worker configuration:** Show the exact Docker Compose / Supervisor changes to add the `analytics` queue worker.
4. **Migration execution order:** All 6 migrations in sequence, with verification SQL after each.
5. **Seeder specification:** Platform default weights and capability seeder entries.
6. **Test plan:** Minimum test coverage per layer (unit tests for value objects and calculators, integration tests for QueryAdapters, feature tests for config API).

---

## 17. Definition of Done

Phase 19A is complete when:

1. The implementation plan has been reviewed and approved by the Principal Engineer (conditional or full approval).
2. All code is implemented per the approved plan.
3. All quality gates in §14 pass.
4. A Principal Engineer audit confirms zero critical or high findings.
5. All findings from audit are resolved.
6. End-to-end demonstration: source event fires → listener dispatches job → job recalculates snapshot → snapshot table has correct data.
7. Nightly rebuild command runs successfully for a test tenant.
8. Weight configuration API works correctly (read defaults, update, validation).
9. History snapshot written by nightly job, old records purged.
10. PHPStan Level 5 passes.
11. The Phase 19A Completion Report is signed off.

---

*End of Document — UBOTZ 2.0 Phase 19A Developer Instructions — March 26, 2026*
