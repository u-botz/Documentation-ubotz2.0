# UBOTZ 2.0 — Phase 19B Developer Instructions

## Student Analytics — Dashboard APIs & Alert System

| Field | Value |
|---|---|
| **Document Type** | Developer Instruction (Pre-Implementation Brief) |
| **Phase** | 19B |
| **Date** | March 26, 2026 |
| **Issued By** | Principal Engineer / Architecture Auditor |
| **Audience** | Implementation Developer (Antigravity) |
| **Expected Deliverable** | Phase 19B Implementation Plan (same format as 10A–15C plans) |
| **Prerequisites** | Phase 19A COMPLETE (all aggregation tables, calculation pipeline, weight config API, event listeners, nightly rebuild — all live and passing quality gates) |

> **Phase 19A built the data layer. Phase 19B exposes it. This phase creates the API surface that Phase 19C's frontend will consume, and wires the risk-based alert system into Phase 14's notification infrastructure. The APIs must be designed for dashboard rendering efficiency — the frontend should never need more than 2 API calls to render any single view.**

---

## 1. Mission Statement

Phase 19B builds two things:

1. **Dashboard API endpoints** — read-only APIs that expose the pre-computed analytics data from Phase 19A's aggregation tables. Three consumer views are served: Student Performance Profile, Batch Comparison, and Topic Mastery Heatmap.

2. **Risk-based alert system** — notification listeners that react to the `StudentRiskLevelChanged` domain event (from 19A) and dispatch alerts to teachers and admins via Phase 14's `NotificationDispatcher`.

**What this phase builds:**

- 8 API endpoints serving analytics data to three dashboard consumer views
- Request validation, authorization, and tenant scoping on all endpoints
- Risk alert notification listener + email template + in-app notification type
- Configurable risk alert thresholds (platform-defined in 19B, tenant-configurable deferred)
- Two new notification types registered with Phase 14 infrastructure

**What this phase does NOT build:**

- Frontend views (Phase 19C)
- Export endpoints (CSV/PDF — deferred)
- Real-time WebSocket push (polling is sufficient)
- Teacher effectiveness APIs (deferred — separate product decision)
- Parent-facing APIs (requires parent portal)
- AI-generated learning insights (future)

---

## 2. Business Requirements Summary

> **Checkpoint:** Antigravity must confirm understanding of this section before proceeding to the technical design.

### 2.1 Three Dashboard Views and Their Data Needs

**View 1: Student Performance Profile**

The individual student's 360° performance view. Consumed by the student themselves (own data only), by teachers (students in their batches), and by tenant admins (all students).

Data needed:
- Overall weighted score (0–100) + risk level badge
- Four dimension scores with raw metric breakdowns
- Performance trend chart (last 90 days from `student_performance_history`)
- Topic mastery grid (from `student_topic_masteries`)
- Batch memberships (which batches this student belongs to)

**View 2: Batch Comparison Dashboard**

Side-by-side comparison of 2+ batches. Consumed by teachers (their batches only) and tenant admins (all batches).

Data needed:
- List of batches with aggregate scores
- Per-batch risk distribution (how many low/medium/high/critical students)
- Per-batch dimension breakdowns (avg quiz score, avg attendance rate, etc.)
- Student list within a batch with individual scores (drill-down)

**View 3: Topic Mastery Heatmap**

Grid view: rows = students, columns = topics. Cell color = mastery level. Consumed by teachers (their batch students + their subject topics) and tenant admins (all).

Data needed:
- List of students (filterable by batch)
- List of topics (filterable by subject, chapter)
- Mastery level per student × topic intersection
- Aggregate mastery stats per topic (what % of students are weak/proficient/mastered)

### 2.2 Authorization Model

| Consumer | What They Can Access | How It's Enforced |
|---|---|---|
| **Student** | Own performance profile only | `student_id == authenticated_user_id` |
| **Teacher** | Students in batches where they are the assigned teacher | Teacher → `attendance_sessions.teacher_id` or batch assignment; scoped by batch membership |
| **Tenant Admin** (with `student_analytics.view`) | All students, all batches in their tenant | Standard tenant scoping |

**Important architectural note:** The teacher scoping is the most complex part. A teacher should see analytics for students in batches where they teach. The join path is: `attendance_sessions.teacher_id = auth_user_id` → `attendance_sessions.batch_id` → `batch_students.user_id`. This gives us the set of students a teacher has visibility into.

However, for Phase 19B, we take a **simplified approach**: teachers with `student_analytics.view` capability can see all students in any batch they are assigned to via `batch_students` or `attendance_sessions`. Fine-grained per-subject teacher scoping is deferred. The implementation plan must document this simplification.

### 2.3 Alert System Requirements

| Alert | Trigger | Recipients | Channel | Category |
|---|---|---|---|---|
| Student Risk Escalation | `StudentRiskLevelChanged` event where `newLevel` is `high` or `critical` | Teachers assigned to the student's batches + Tenant Admin users with `student_analytics.view` | Email + In-App | `system` (opt-out eligible per Phase 14 rules) |
| Student Risk Recovery | `StudentRiskLevelChanged` event where `previousLevel` was `high`/`critical` AND `newLevel` is `low`/`medium` | Same as above | In-App only (no email — recovery is informational, not urgent) | `system` |

**Alert content:**
- Risk Escalation: "Student [Name] in [Batch Name] has moved to [HIGH/CRITICAL] risk (score: [X]/100). Review their performance profile."
- Risk Recovery: "Student [Name] in [Batch Name] has improved to [LOW/MEDIUM] risk (score: [X]/100)."

---

## 3. API Endpoint Design

### 3.1 Route Registration

Route file: `routes/tenant_dashboard/student_analytics.php`

Base middleware stack (applied to all routes in group):
```
tenant.resolve.token → auth:tenant_api → tenant.active → ensure.user.active → tenant.session → tenant.module:module.student_analytics
```

Per-route capability middleware applied individually as specified below.

### 3.2 Endpoint Registry

| # | Method | Endpoint | Capability | Controller | Description |
|---|---|---|---|---|---|
| 1 | GET | `/api/tenant-dashboard/analytics/students` | `student_analytics.view` | StudentAnalyticsController | Paginated student list with performance scores |
| 2 | GET | `/api/tenant-dashboard/analytics/students/{studentId}` | `student_analytics.view` | StudentAnalyticsController | Single student performance profile (full detail) |
| 3 | GET | `/api/tenant-dashboard/analytics/students/{studentId}/history` | `student_analytics.view` | StudentAnalyticsController | Performance trend data (time series) |
| 4 | GET | `/api/tenant-dashboard/analytics/students/{studentId}/topics` | `student_analytics.view` | StudentAnalyticsController | Topic mastery for a single student |
| 5 | GET | `/api/tenant-dashboard/analytics/batches` | `student_analytics.view` | BatchAnalyticsController | Batch list with aggregate scores (comparison view) |
| 6 | GET | `/api/tenant-dashboard/analytics/batches/{batchId}` | `student_analytics.view` | BatchAnalyticsController | Single batch detail with student breakdown |
| 7 | GET | `/api/tenant-dashboard/analytics/batches/{batchId}/students` | `student_analytics.view` | BatchAnalyticsController | Paginated students within a batch with scores |
| 8 | GET | `/api/tenant-dashboard/analytics/topics` | `student_analytics.view` | TopicMasteryController | Topic mastery heatmap data (students × topics matrix) |

**Student self-access endpoint (separate route group):**

| # | Method | Endpoint | Auth | Controller | Description |
|---|---|---|---|---|---|
| 9 | GET | `/api/tenant-dashboard/my-analytics` | Authenticated student (no capability check — own data) | MyAnalyticsController | Student's own performance profile |
| 10 | GET | `/api/tenant-dashboard/my-analytics/history` | Authenticated student | MyAnalyticsController | Student's own performance trend |
| 11 | GET | `/api/tenant-dashboard/my-analytics/topics` | Authenticated student | MyAnalyticsController | Student's own topic mastery |

**Note on student endpoints:** These reuse the same UseCase layer as the admin endpoints but hardcode `studentId = auth()->id()`. No capability check is needed — a student always has the right to see their own analytics. These endpoints still require `tenant.module:module.student_analytics` to be enabled.

### 3.3 HTTP Layer Structure

```
Http/TenantAdminDashboard/StudentAnalytics/
├── Controllers/
│   ├── StudentAnalyticsController.php        # Endpoints 1-4
│   ├── BatchAnalyticsController.php          # Endpoints 5-7
│   ├── TopicMasteryController.php            # Endpoint 8
│   ├── MyAnalyticsController.php             # Endpoints 9-11
│   └── AnalyticsConfigController.php         # (from Phase 19A — weight config)
├── Requests/
│   ├── ListStudentAnalyticsRequest.php       # Filters: batch_id, risk_level, search, sort
│   ├── ListBatchAnalyticsRequest.php         # Filters: status, sort
│   ├── ListBatchStudentsRequest.php          # Filters: risk_level, sort
│   ├── TopicMasteryRequest.php               # Filters: batch_id, subject_id, chapter_id
│   └── StudentHistoryRequest.php             # Filters: from_date, to_date
└── Resources/
    ├── StudentPerformanceSummaryResource.php  # List view (compact)
    ├── StudentPerformanceDetailResource.php   # Detail view (full)
    ├── StudentPerformanceHistoryResource.php  # Time series point
    ├── BatchPerformanceSummaryResource.php    # Batch list view
    ├── BatchPerformanceDetailResource.php     # Batch detail view
    ├── TopicMasteryResource.php              # Single student×topic cell
    ├── TopicMasteryHeatmapResource.php       # Full heatmap response
    └── AnalyticsConfigResource.php           # (from Phase 19A)
```

---

## 4. API Contracts

### 4.1 Endpoint 1: List Students with Performance Scores

**`GET /api/tenant-dashboard/analytics/students`**

Query parameters:

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `batch_id` | integer | No | — | Filter by batch |
| `risk_level` | string | No | — | Filter: `low`, `medium`, `high`, `critical` |
| `search` | string | No | — | Search student name or email |
| `sort_by` | string | No | `overall_score` | Options: `overall_score`, `quiz_score`, `course_score`, `attendance_score`, `assignment_score`, `name` |
| `sort_order` | string | No | `desc` | `asc` or `desc` |
| `page` | integer | No | 1 | Pagination |
| `per_page` | integer | No | 20 | Max 100 |

Response (`200 OK`):

```json
{
    "data": [
        {
            "student_id": 142,
            "student_name": "Ravi Kumar",
            "student_email": "ravi@example.com",
            "overall_score": 73,
            "risk_level": "low",
            "quiz_score": 80,
            "course_score": 65,
            "attendance_score": 85,
            "assignment_score": 62,
            "quizzes_attempted": 12,
            "courses_enrolled": 3,
            "attendance_rate_pct": 92.5,
            "last_recalculated_at": "2026-03-26T02:00:00Z",
            "batches": [
                { "id": 5, "name": "JEE Batch A", "code": "JEE-2026-A" }
            ]
        }
    ],
    "meta": {
        "current_page": 1,
        "per_page": 20,
        "total": 145,
        "last_page": 8
    }
}
```

**Authorization logic:**
- Tenant Admin: returns all students in tenant
- Teacher: returns only students in batches where the teacher has sessions (via `attendance_sessions.teacher_id`)
- If `batch_id` filter is provided, validate that the requesting user has access to that batch

### 4.2 Endpoint 2: Student Performance Profile (Full Detail)

**`GET /api/tenant-dashboard/analytics/students/{studentId}`**

Response (`200 OK`):

```json
{
    "data": {
        "student_id": 142,
        "student_name": "Ravi Kumar",
        "student_email": "ravi@example.com",
        "overall_score": 73,
        "risk_level": "low",
        "dimensions": {
            "quiz": {
                "score": 80,
                "weight": 35,
                "metrics": {
                    "pass_rate_pct": 75.0,
                    "avg_score_pct": 82.3,
                    "quizzes_attempted": 12,
                    "quizzes_passed": 9
                }
            },
            "course": {
                "score": 65,
                "weight": 25,
                "metrics": {
                    "completion_avg_pct": 58.2,
                    "courses_enrolled": 3,
                    "courses_completed": 1
                }
            },
            "attendance": {
                "score": 85,
                "weight": 25,
                "metrics": {
                    "attendance_rate_pct": 92.5,
                    "late_rate_pct": 5.0,
                    "sessions_total": 40,
                    "sessions_present": 35,
                    "sessions_late": 2,
                    "sessions_absent": 2,
                    "sessions_excused": 1
                }
            },
            "assignment": {
                "score": 62,
                "weight": 15,
                "metrics": {
                    "avg_grade_pct": 68.5,
                    "pass_rate_pct": 80.0,
                    "assignments_graded": 10,
                    "assignments_passed": 8
                }
            }
        },
        "batches": [
            { "id": 5, "name": "JEE Batch A", "code": "JEE-2026-A" },
            { "id": 8, "name": "Physics Special", "code": "PHY-2026-SP" }
        ],
        "last_recalculated_at": "2026-03-26T02:00:00Z"
    }
}
```

**Authorization:**
- Tenant Admin: any student in tenant
- Teacher: only students in their batches
- If student not found or not in scope: return `404 Not Found` (not 403 — prevent enumeration)

### 4.3 Endpoint 3: Student Performance History (Trend)

**`GET /api/tenant-dashboard/analytics/students/{studentId}/history`**

Query parameters:

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `from_date` | date (Y-m-d) | No | 90 days ago | Start of range |
| `to_date` | date (Y-m-d) | No | today | End of range |

Response (`200 OK`):

```json
{
    "data": {
        "student_id": 142,
        "period": {
            "from": "2025-12-27",
            "to": "2026-03-26"
        },
        "history": [
            {
                "date": "2025-12-27",
                "overall_score": 45,
                "quiz_score": 50,
                "course_score": 30,
                "attendance_score": 60,
                "assignment_score": 40,
                "risk_level": "medium"
            },
            {
                "date": "2025-12-28",
                "overall_score": 47,
                "quiz_score": 52,
                "course_score": 32,
                "attendance_score": 62,
                "assignment_score": 42,
                "risk_level": "medium"
            }
        ]
    }
}
```

**Note:** The `student_performance_history` table stores one row per day (written by nightly rebuild). This endpoint reads directly from that table — no on-the-fly calculation.

### 4.4 Endpoint 4: Student Topic Mastery

**`GET /api/tenant-dashboard/analytics/students/{studentId}/topics`**

Query parameters:

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `subject_id` | integer | No | — | Filter by subject |
| `chapter_id` | integer | No | — | Filter by chapter |

Response (`200 OK`):

```json
{
    "data": {
        "student_id": 142,
        "topics": [
            {
                "subject_id": 1,
                "subject_name": "Physics",
                "chapter_id": 3,
                "chapter_name": "Kinematics",
                "topic_id": 7,
                "topic_name": "Projectile Motion",
                "questions_attempted": 15,
                "questions_correct": 12,
                "correctness_rate_pct": 80.0,
                "mastery_level": "mastered"
            },
            {
                "subject_id": 1,
                "subject_name": "Physics",
                "chapter_id": 4,
                "chapter_name": "Laws of Motion",
                "topic_id": 9,
                "topic_name": "Newton's Third Law",
                "questions_attempted": 8,
                "questions_correct": 3,
                "correctness_rate_pct": 37.5,
                "mastery_level": "weak"
            }
        ]
    }
}
```

**Implementation note:** The `subject_name`, `chapter_name`, `topic_name` labels must be resolved by joining from the `student_topic_masteries` table's hierarchy IDs to the exam hierarchy tables. The QueryAdapter from 19A stores IDs; this endpoint resolves them to display names.

### 4.5 Endpoint 5: Batch List with Aggregate Scores

**`GET /api/tenant-dashboard/analytics/batches`**

Query parameters:

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `status` | string | No | `active` | Batch status filter: `active`, `archived`, `all` |
| `sort_by` | string | No | `avg_overall_score` | Options: `avg_overall_score`, `avg_attendance_score`, `name`, `students_total` |
| `sort_order` | string | No | `desc` | `asc` or `desc` |

Response (`200 OK`):

```json
{
    "data": [
        {
            "batch_id": 5,
            "batch_name": "JEE Batch A",
            "batch_code": "JEE-2026-A",
            "status": "active",
            "start_date": "2026-01-15",
            "end_date": "2026-06-30",
            "students_total": 45,
            "avg_overall_score": 68.4,
            "avg_quiz_score": 72.1,
            "avg_course_score": 61.5,
            "avg_attendance_score": 78.3,
            "avg_assignment_score": 55.9,
            "risk_distribution": {
                "low": 28,
                "medium": 10,
                "high": 5,
                "critical": 2
            },
            "last_recalculated_at": "2026-03-26T02:00:00Z"
        }
    ]
}
```

**Authorization:**
- Tenant Admin: all batches
- Teacher: only batches where they have attendance sessions

### 4.6 Endpoint 6: Single Batch Detail

**`GET /api/tenant-dashboard/analytics/batches/{batchId}`**

Response (`200 OK`):

```json
{
    "data": {
        "batch_id": 5,
        "batch_name": "JEE Batch A",
        "batch_code": "JEE-2026-A",
        "status": "active",
        "start_date": "2026-01-15",
        "end_date": "2026-06-30",
        "students_total": 45,
        "avg_overall_score": 68.4,
        "avg_quiz_score": 72.1,
        "avg_course_score": 61.5,
        "avg_attendance_score": 78.3,
        "avg_assignment_score": 55.9,
        "avg_attendance_rate_pct": 85.2,
        "avg_quiz_pass_rate_pct": 71.0,
        "avg_course_completion_pct": 58.4,
        "avg_assignment_grade_pct": 62.7,
        "risk_distribution": {
            "low": 28,
            "medium": 10,
            "high": 5,
            "critical": 2
        },
        "last_recalculated_at": "2026-03-26T02:00:00Z"
    }
}
```

### 4.7 Endpoint 7: Students Within a Batch

**`GET /api/tenant-dashboard/analytics/batches/{batchId}/students`**

Query parameters:

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `risk_level` | string | No | — | Filter by risk level |
| `sort_by` | string | No | `overall_score` | Options: `overall_score`, `quiz_score`, `course_score`, `attendance_score`, `assignment_score`, `name` |
| `sort_order` | string | No | `desc` | `asc` or `desc` |
| `page` | integer | No | 1 | Pagination |
| `per_page` | integer | No | 20 | Max 100 |

Response shape: identical to Endpoint 1, but pre-filtered to the specified batch. The response MUST only include students who are active in the batch (`batch_students.removed_at IS NULL`).

### 4.8 Endpoint 8: Topic Mastery Heatmap

**`GET /api/tenant-dashboard/analytics/topics`**

Query parameters:

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `batch_id` | integer | No | — | Filter students by batch |
| `subject_id` | integer | Yes | — | Required — heatmap scoped to one subject |
| `chapter_id` | integer | No | — | Further narrow to chapter |
| `page` | integer | No | 1 | Paginate students (rows) |
| `per_page` | integer | No | 20 | Max 50 |

Response (`200 OK`):

```json
{
    "data": {
        "subject_id": 1,
        "subject_name": "Physics",
        "topics": [
            { "topic_id": 7, "topic_name": "Projectile Motion", "chapter_name": "Kinematics" },
            { "topic_id": 9, "topic_name": "Newton's Third Law", "chapter_name": "Laws of Motion" },
            { "topic_id": 12, "topic_name": "Friction", "chapter_name": "Laws of Motion" }
        ],
        "students": [
            {
                "student_id": 142,
                "student_name": "Ravi Kumar",
                "masteries": [
                    { "topic_id": 7, "mastery_level": "mastered", "correctness_rate_pct": 80.0 },
                    { "topic_id": 9, "mastery_level": "weak", "correctness_rate_pct": 37.5 },
                    { "topic_id": 12, "mastery_level": "not_attempted", "correctness_rate_pct": 0 }
                ]
            },
            {
                "student_id": 208,
                "student_name": "Priya Sharma",
                "masteries": [
                    { "topic_id": 7, "mastery_level": "proficient", "correctness_rate_pct": 70.0 },
                    { "topic_id": 9, "mastery_level": "developing", "correctness_rate_pct": 50.0 },
                    { "topic_id": 12, "mastery_level": "mastered", "correctness_rate_pct": 90.0 }
                ]
            }
        ],
        "topic_aggregates": [
            { "topic_id": 7, "avg_correctness_pct": 75.0, "mastered_pct": 45.0, "weak_pct": 10.0 },
            { "topic_id": 9, "avg_correctness_pct": 43.8, "mastered_pct": 15.0, "weak_pct": 35.0 },
            { "topic_id": 12, "avg_correctness_pct": 45.0, "mastered_pct": 20.0, "weak_pct": 25.0 }
        ]
    },
    "meta": {
        "current_page": 1,
        "per_page": 20,
        "total": 45,
        "last_page": 3
    }
}
```

**Why `subject_id` is required:** A heatmap showing all subjects × all topics × all students would be an unbounded matrix. Scoping to one subject keeps the response size manageable and the UI renderable. The frontend will provide a subject selector dropdown.

**`topic_aggregates`:** Pre-computed in the API response (not a separate endpoint). For each topic column, calculate the average correctness and the distribution of mastery levels across all students in the filtered set. This powers the column summary row in the heatmap UI.

---

## 5. Application Layer

### 5.1 UseCases (New — Phase 19B)

```
Application/TenantAdminDashboard/StudentAnalytics/
├── UseCases/
│   ├── ListStudentPerformanceUseCase.php        # Endpoint 1
│   ├── GetStudentPerformanceUseCase.php          # Endpoint 2
│   ├── GetStudentPerformanceHistoryUseCase.php   # Endpoint 3
│   ├── GetStudentTopicMasteryUseCase.php         # Endpoint 4 & 11
│   ├── ListBatchPerformanceUseCase.php           # Endpoint 5
│   ├── GetBatchPerformanceUseCase.php            # Endpoint 6
│   ├── ListBatchStudentsUseCase.php              # Endpoint 7
│   ├── GetTopicMasteryHeatmapUseCase.php         # Endpoint 8
│   └── GetMyPerformanceUseCase.php               # Endpoints 9 & 10 (delegates to student-specific logic)
├── Queries/
│   ├── StudentPerformanceQuery.php               # Query object for filtering/sorting/pagination
│   ├── BatchPerformanceQuery.php
│   ├── BatchStudentsQuery.php
│   └── TopicMasteryHeatmapQuery.php
└── Listeners/
    ├── OnStudentRiskEscalated.php                # Listens to StudentRiskLevelChanged → dispatches alert
    └── OnStudentRiskRecovered.php                # Listens to StudentRiskLevelChanged → dispatches recovery notice
```

### 5.2 Query Objects

Query objects are immutable DTOs that encapsulate filter, sort, and pagination parameters. They are constructed from validated request data in the controller and passed to the UseCase.

```php
final class StudentPerformanceQuery
{
    public function __construct(
        public readonly int $tenantId,
        public readonly ?int $batchId,
        public readonly ?string $riskLevel,
        public readonly ?string $search,
        public readonly string $sortBy = 'overall_score',
        public readonly string $sortOrder = 'desc',
        public readonly int $page = 1,
        public readonly int $perPage = 20,
        public readonly ?int $scopedTeacherId = null, // non-null for teacher-scoped access
    ) {}
}
```

### 5.3 Teacher Scoping Logic

The controller determines the authenticated user's role. If the user is a Teacher (not Admin/Owner), the controller sets `scopedTeacherId` on the query object. The UseCase passes this to the repository, which applies the batch-based scoping filter.

**Scoping query (pseudocode):**
```sql
-- For teachers: only return students in batches where this teacher has sessions
WHERE student_id IN (
    SELECT bs.user_id FROM batch_students bs
    WHERE bs.removed_at IS NULL
    AND bs.batch_id IN (
        SELECT DISTINCT asess.batch_id FROM attendance_sessions asess
        WHERE asess.teacher_id = :teacherId
        AND asess.tenant_id = :tenantId
    )
)
```

**Important:** This scoping filter is applied in the **repository layer** (infrastructure), not in the UseCase. The UseCase calls `repository->listStudentPerformance(query)` and the repository decides how to apply the scope based on `query->scopedTeacherId`.

---

## 6. Repository Additions (Phase 19B)

### 6.1 New Query Interfaces

Add to `Domain/TenantAdminDashboard/StudentAnalytics/Repositories/`:

```php
interface StudentPerformanceQueryInterface
{
    public function listWithPagination(StudentPerformanceQuery $query): LengthAwarePaginator;
    public function findByStudentId(int $tenantId, int $studentId, ?int $scopedTeacherId = null): ?StudentPerformanceSnapshot;
    public function getHistory(int $tenantId, int $studentId, string $fromDate, string $toDate): array;
}

interface BatchPerformanceQueryInterface
{
    public function listBatches(BatchPerformanceQuery $query): Collection;
    public function findByBatchId(int $tenantId, int $batchId, ?int $scopedTeacherId = null): ?BatchPerformanceSnapshot;
    public function listBatchStudents(BatchStudentsQuery $query): LengthAwarePaginator;
}

interface TopicMasteryQueryInterface
{
    public function getStudentTopics(int $tenantId, int $studentId, ?int $subjectId = null, ?int $chapterId = null): array;
    public function getHeatmapData(TopicMasteryHeatmapQuery $query): array;
    public function getTopicAggregates(int $tenantId, array $studentIds, array $topicIds): array;
}
```

### 6.2 Hierarchy Name Resolution

The topic mastery endpoints need to resolve `subject_id` → `subject_name`, `chapter_id` → `chapter_name`, `topic_id` → `topic_name`. This data lives in the exam hierarchy tables.

Create a **read-only adapter** (not a full repository — this is a display name lookup):

```
Infrastructure/TenantAdminDashboard/StudentAnalytics/
└── QueryAdapters/
    └── ExamHierarchyNameResolver.php    # Resolves IDs to display names from exam hierarchy
```

This resolver takes arrays of IDs and returns `[id => name]` maps. It should use a single query with `whereIn()` per hierarchy level — no N+1.

---

## 7. Alert System

### 7.1 Notification Integration

Phase 19B adds two new notification types to the Phase 14 catalog:

| # | Notification Type | Category | Channels | Priority |
|---|---|---|---|---|
| 20 | Student Risk Escalation | `system` | Email + In-App | `default` |
| 21 | Student Risk Recovery | `system` | In-App only | `low` |

### 7.2 Listener Wiring

| Listener | Event | Condition | Action |
|---|---|---|---|
| `OnStudentRiskEscalated` | `StudentRiskLevelChanged` | `newLevel` is `HIGH` or `CRITICAL` | Construct `NotificationPayload`, dispatch via `NotificationDispatcher` |
| `OnStudentRiskRecovered` | `StudentRiskLevelChanged` | `previousLevel` was `HIGH`/`CRITICAL` AND `newLevel` is `LOW`/`MEDIUM` | Construct `NotificationPayload` (in-app only), dispatch |

Both listeners live in:
```
Application/TenantAdminDashboard/StudentAnalytics/Listeners/
```

### 7.3 Recipient Resolution

When a risk event fires, the listener must determine who should receive the alert:

1. **Teachers:** Query `attendance_sessions` for `batch_id`s associated with the student (via `batch_students`), then get distinct `teacher_id` values from those sessions.
2. **Admins:** Query users in the tenant who have the `student_analytics.view` capability AND have a role with `hierarchy_level` indicating admin/owner (not student/teacher level).

Create a service for this:

```
Application/TenantAdminDashboard/StudentAnalytics/Services/
└── AnalyticsAlertRecipientResolver.php
```

This service takes a `tenantId` and `studentId`, returns a list of user IDs who should receive the alert. The listener iterates this list and dispatches one `NotificationPayload` per recipient.

**Important:** Recipient resolution must NOT be done inside a database transaction. The listener runs asynchronously via the queue (it's reacting to a domain event) and there is no transaction to be inside of, but this must be documented to prevent future refactoring mistakes.

### 7.4 Email Template

Create a Blade template for the risk escalation email:

```
resources/views/emails/system/student_risk_escalation.blade.php
```

Template extends the Phase 14 branded layout. Content:

```
Subject: "[Institution Name] — Student at Risk: [Student Name]"

Body:
- Student name and batch
- New risk level (with color-coded badge)
- Current overall score
- CTA button: "View Performance Profile" → deep link to the student's analytics page
```

### 7.5 Deduplication

Risk alerts must be deduplicated to prevent notification spam. Use the Phase 14 `notification_sent_log` table:

- Dedup key: `student_risk_{tenantId}_{studentId}_{riskLevel}`
- TTL: 24 hours

This means if a student oscillates between `medium` and `high` risk due to recalculations, the teacher receives at most one escalation alert per 24 hours per risk level transition.

---

## 8. Error Handling

### 8.1 Response Codes

| Scenario | Status Code | Body |
|---|---|---|
| Success | `200 OK` | Data as specified |
| Student not found in tenant | `404 Not Found` | `{"message": "Student not found"}` |
| Batch not found in tenant | `404 Not Found` | `{"message": "Batch not found"}` |
| Teacher accessing student outside their batches | `404 Not Found` | (not 403 — prevents enumeration) |
| Missing `student_analytics.view` capability | `403 Forbidden` | Standard capability error |
| Module `module.student_analytics` not enabled | `403 Forbidden` | Standard module error |
| Validation error (invalid filters) | `422 Unprocessable Entity` | Standard Laravel validation errors |
| No analytics data yet (student has no snapshot) | `200 OK` | Return response with all scores as `0` and `risk_level: "low"` — never 404 for "no data" |

### 8.2 No-Data Scenario

If a student exists but has never had their analytics calculated (no row in `student_performance_snapshots`), the API must still return a valid response. The UseCase should return a default snapshot with all zeros rather than a 404. This prevents frontend errors and communicates "no data yet" via the zero values.

---

## 9. Business Rules (NON-NEGOTIABLE)

| Rule ID | Rule | Enforcement |
|---|---|---|
| BR-01 | All endpoints are read-only — no POST/PUT/DELETE on analytics data tables | Route registration — only GET methods |
| BR-02 | Every endpoint includes `tenant_id` in WHERE clause (defense-in-depth beyond global scope) | Repository implementations |
| BR-03 | Teacher scoping: teachers see only students in their batches, never cross-batch | `scopedTeacherId` in query objects, enforced in repository |
| BR-04 | Student self-access: students can only see their own analytics | `MyAnalyticsController` hardcodes `studentId = auth()->id()` |
| BR-05 | Cross-tenant access returns 404 (not 403) — prevent enumeration | Repository returns null → Controller returns 404 |
| BR-06 | Risk alert deduplication: max one alert per student per risk level per 24 hours | `notification_sent_log` dedup key with 24h TTL |
| BR-07 | Risk escalation email includes deep link to student profile | Email template with action URL |
| BR-08 | Risk recovery is in-app only (no email — informational, not urgent) | Listener dispatches `NotificationPayload` with `channels: [IN_APP]` |
| BR-09 | No analytics data returns 200 with zeros, not 404 | UseCase returns default snapshot |
| BR-10 | Topic heatmap requires `subject_id` — unbounded matrix is not permitted | Request validation `required` rule |
| BR-11 | Audit logging for weight config changes only (19A) — read-only analytics endpoints do NOT write audit logs | No audit calls in read controllers |
| BR-12 | Per-page maximum: 100 for student lists, 50 for heatmap | Request validation `max` rule |

---

## 10. What Phase 19B Does NOT Include

| Excluded Item | Reason | Deferred To |
|---|---|---|
| Frontend dashboard views | Separate concern | Phase 19C |
| CSV/PDF export endpoints | Dashboard-only in Phase 19 | Phase 19D |
| WebSocket real-time updates | Polling sufficient | Future |
| Tenant-configurable risk thresholds | Platform-defined in 19A | Future enhancement |
| Teacher effectiveness analytics | Separate product decision | Deferred indefinitely |
| Parent-facing API endpoints | Requires parent portal | Future |
| AI-generated recommendations | Requires ML pipeline | Future |
| Batch comparison chart data endpoint | 19C frontend can derive charts from existing endpoints 5+6 | Future if needed |
| Historical batch comparison (compare batch performance over time) | Requires batch-level history table (not built in 19A) | Future |

---

## 11. Quality Gates — Phase 19B Complete

### 11.1 Architecture Gates

- [ ] All endpoints follow Pattern B: `Http/TenantAdminDashboard/StudentAnalytics/Controllers/`
- [ ] Controllers are thin — delegate to UseCases, no business logic
- [ ] UseCases use query objects for filter/sort/pagination parameters
- [ ] Teacher scoping is enforced in the repository layer, not controllers
- [ ] No Eloquent models from foreign bounded contexts are imported
- [ ] Alert listeners construct `NotificationPayload` and call `NotificationDispatcher` — no direct email/DB writes
- [ ] Recipient resolution is a separate service, not inlined in listeners

### 11.2 Security Gates

- [ ] Every endpoint has `tenant.module:module.student_analytics` middleware
- [ ] Admin/Teacher endpoints have `tenant.capability:student_analytics.view` middleware
- [ ] Student self-access endpoints (`/my-analytics/*`) validate `studentId == auth()->id()`
- [ ] Cross-tenant access returns 404 (tested with two tenants)
- [ ] Teacher cannot access student outside their batches (returns 404)
- [ ] Student cannot access another student's analytics (returns 404)
- [ ] No sensitive data leakage in error responses

### 11.3 Functional Gates

- [ ] Endpoint 1: paginated student list with all filter/sort combinations
- [ ] Endpoint 2: full student profile returns all dimension details
- [ ] Endpoint 3: history returns daily data points within date range
- [ ] Endpoint 4: topic mastery with subject/chapter filtering
- [ ] Endpoint 5: batch list with aggregate scores and risk distribution
- [ ] Endpoint 6: single batch detail with all metrics
- [ ] Endpoint 7: paginated students within batch
- [ ] Endpoint 8: heatmap matrix with topic aggregates
- [ ] Endpoints 9-11: student self-access returns own data only
- [ ] No-data scenario: student with no snapshot returns 200 with zeros
- [ ] Risk escalation notification dispatched on HIGH/CRITICAL transition
- [ ] Risk recovery notification dispatched (in-app only) on recovery
- [ ] Alert deduplication: second alert within 24h for same student+level is suppressed
- [ ] Recipient resolution: correct teachers and admins receive alerts

### 11.4 Performance Gates

- [ ] Student list endpoint (Endpoint 1) responds in < 200ms for 500 students
- [ ] Student profile endpoint (Endpoint 2) responds in < 100ms
- [ ] Heatmap endpoint (Endpoint 8) responds in < 500ms for 50 students × 20 topics
- [ ] No N+1 queries on any endpoint (verified via query log)
- [ ] Batch list endpoint responds in < 100ms for 50 batches

### 11.5 PHPStan Gate

- [ ] PHPStan Level 5 passes with zero errors across all new code

---

## 12. Constraints & Reminders

### Architecture Constraints

- **Controllers do not determine teacher scoping.** Controllers read the authenticated user's role and set `scopedTeacherId` on the query object. The repository applies the filter. This separation means scoping logic is testable without HTTP.
- **No writes to analytics tables from this phase.** All endpoints are GET. The only writes in Phase 19B are to `notification_sent_log` (dedup) and `notifications` table (in-app alerts) — both via Phase 14 infrastructure.
- **Query objects are immutable.** Constructed in controllers from validated request data, passed to UseCases. No mutation.
- **One controller per view.** `StudentAnalyticsController` serves student-related endpoints, `BatchAnalyticsController` serves batch-related, `TopicMasteryController` serves heatmap, `MyAnalyticsController` serves student self-access. Do not merge.
- **Alert listeners are thin.** They extract data from the event, resolve recipients, construct `NotificationPayload`, and call `NotificationDispatcher::dispatch()`. No calculation logic in listeners.

### Docker Environment

- Container: Alpine Linux — use `sh` not `bash`
- Container name: `ubotz_backend`
- Database: `ubotz_mysql`

### What NOT to Do

- Do NOT calculate analytics on-the-fly in API endpoints. All data comes from pre-computed snapshot tables (Phase 19A). If a snapshot doesn't exist, return zeros — never calculate in the request cycle.
- Do NOT use `403 Forbidden` for cross-tenant or out-of-scope access. Always use `404 Not Found` to prevent enumeration.
- Do NOT send email for risk recovery alerts. In-app notification only — recovery is informational.
- Do NOT skip deduplication on risk alerts. Without it, nightly recalculation touching 500 students could spam teachers with hundreds of emails.
- Do NOT put recipient resolution logic inside the event payload. The event carries `tenantId`, `studentId`, and risk levels. The listener resolves recipients at dispatch time.
- Do NOT create separate API endpoints for "admin view" vs "teacher view" of the same data. Use one endpoint with role-based scoping. The response shape is identical; only the data scope differs.
- Do NOT write audit logs for read-only analytics endpoints. Audit logging is for mutations only.

---

## 13. Implementation Plan Requirements

The Implementation Plan produced by Antigravity must include:

1. **Teacher scoping verification:** Document the exact SQL join path used for teacher → batch → student scoping. Include the query plan for the most complex scenario (teacher scoping + batch filter + risk level filter + search + pagination).
2. **Notification integration verification:** Confirm that the Phase 14 `NotificationDispatcher`, `NotificationPayload`, `EmailChannel`, and `InAppChannel` classes exist at the expected paths. Document any interface changes needed.
3. **Recipient resolution query:** Show the exact SQL for resolving alert recipients (teachers + admins) for a given student.
4. **Email template:** Provide the full Blade template for risk escalation email extending the Phase 14 branded layout.
5. **Test plan:** Minimum test coverage: unit tests for query objects and recipient resolver, feature tests for all 11 endpoints (including authorization tests for each role), integration test for alert dispatch.

---

## 14. Definition of Done

Phase 19B is complete when:

1. The implementation plan has been reviewed and approved by the Principal Engineer.
2. All code is implemented per the approved plan.
3. All quality gates in §11 pass.
4. A Principal Engineer audit confirms zero critical or high findings.
5. All findings from audit are resolved.
6. End-to-end demonstration: API endpoints return correct data for Tenant Admin, Teacher, and Student roles.
7. Authorization verified: Teacher cannot see students outside their batches.
8. Risk alert verified: `StudentRiskLevelChanged` → notification dispatched → email sent + in-app notification visible.
9. Deduplication verified: second alert within 24h is suppressed.
10. PHPStan Level 5 passes.
11. The Phase 19B Completion Report is signed off.

---

*End of Document — UBOTZ 2.0 Phase 19B Developer Instructions — March 26, 2026*
