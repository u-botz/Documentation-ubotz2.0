# UBOTZ 2.0 — Student Analytics — Technical Specification

## Scope

Weighted **performance** views, **batch** views, **topic mastery**, **self-service “my analytics”**, and **config** for dimension weights. Routes: `backend/routes/tenant_dashboard/student_analytics.php`. Application code: `App\Application\TenantAdminDashboard\StudentAnalytics\`.

## Module and capabilities

- **Module:** `tenant.module:module.student_analytics` on both route groups below.

| Capability | Routes |
|------------|--------|
| `student_analytics.configure` | `GET`/`PUT /api/tenant/analytics/config` |
| `student_analytics.view` | All other `/analytics/*` read endpoints below |

**Self-service (`/my-analytics`):** These routes intentionally omit `tenant.capability:*` — only **`tenant.module:module.student_analytics`** applies. Responses are scoped to the **authenticated user** in `MyAnalyticsController` / use cases (no cross-student admin reads on this prefix). Admin/instructor analytics under `/analytics/*` continues to require `student_analytics.view` or `student_analytics.configure` as listed above.

## HTTP map (base `/api/tenant`)

### Admin/instructor (`/analytics`)

| Method | Path |
|--------|------|
| GET/PUT | `/analytics/config` |
| GET | `/analytics/students`, `/analytics/students/{studentId}`, `/analytics/students/{studentId}/history`, `/analytics/students/{studentId}/topics` |
| GET | `/analytics/batches`, `/analytics/batches/{batchId}`, `/analytics/batches/{batchId}/students` |
| GET | `/analytics/topics` |

### Current user (`/my-analytics`)

| Method | Path |
|--------|------|
| GET | `/my-analytics`, `/my-analytics/history`, `/my-analytics/topics` |

Controllers include `AnalyticsConfigController`, `StudentAnalyticsController`, `BatchAnalyticsController`, `TopicMasteryController`, `MyAnalyticsController`.

## Application layer (examples)

Use cases: `GetAnalyticsConfigUseCase`, `UpdateAnalyticsConfigUseCase`, `ListStudentPerformanceUseCase`, `GetStudentPerformanceUseCase`, `GetStudentPerformanceHistoryUseCase`, `GetStudentTopicMasteryUseCase`, `ListBatchPerformanceUseCase`, `GetBatchPerformanceUseCase`, `ListBatchStudentsUseCase`, `GetTopicMasteryHeatmapUseCase`, `GetMyPerformanceUseCase`, plus recalculation: `RecalculateStudentPerformanceUseCase`, `RecalculateBatchPerformanceUseCase`, `RecalculateTopicMasteryUseCase`, `FullRecalculationUseCase`.

Jobs (examples): `RecalculateStudentPerformanceJob`, `RecalculateBatchPerformanceJob`, `RecalculateTopicMasteryJob`, `NightlyAnalyticsRebuildJob`. Command: `analytics:rebuild` (scheduled in `routes/console.php`).

Listeners react to domain events (e.g. quiz finalized, attendance marked, assignment graded) to keep aggregates fresh.

## Persistence (tenant)

| Migration | Table / purpose |
|-----------|-----------------|
| `2026_03_26_190001_create_analytics_weight_configs_table.php` | **`analytics_weight_configs`** — `dimension`, `weight`; **unique** `(tenant_id, dimension)` as `unq_awc_tenant_dimension` |
| `2026_03_26_190006_create_analytics_recalculation_log_table.php` | **`analytics_recalculation_log`** — run metadata |
| `2026_03_28_200000_create_quiz_analytics_snapshots_table.php` | **`quiz_analytics_snapshots`** — pre-aggregated data |

## Frontend

Add paths under `/api/tenant/analytics` and `/api/tenant/my-analytics` in `api-endpoints.ts` if not already centralized.

---

## Document history

- **2026-03-31:** Clarified self-service vs admin capability routing for `my-analytics`.

## Linked references

- **Quiz** — results feed analytics
- **Batches** — cohort views
- **Exam hierarchy** — topic-level mastery
