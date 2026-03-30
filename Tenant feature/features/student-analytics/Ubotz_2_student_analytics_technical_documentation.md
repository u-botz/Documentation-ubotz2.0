# UBOTZ 2.0 Student Analytics Technical Specification

## Core Architecture
Student Analytics is an asynchronous processing context (`TenantAdminDashboard\StudentAnalytics`). It focuses on transforming raw transactional data (quizzes, attendance) into pedagogical insights.

## Relational Schema Constraints

### 1. Configuration (`analytics_weight_configs`)
- **`dimension`**: The metric category (e.g., `assessment`, `attendance`).
- **`weight`**: Relative coefficient used in grand-total calculations.
- **Indices**: `unq_awc_tenant_dimension` ensures one configuration per metric per tenant.

### 2. Snapshotting (`quiz_analytics_snapshots`)
- Captures the aggregate scores per subject/chapter for a student.
- Prevents expensive $O(N^2)$ recursive joins across the Question Bank during UI render cycles.

## Key Technical Workflows

### The Recalculation Engine
1. Assessment completions trigger a `RequestAnalyticsRecalculationJob`.
2. The job logs the request in `analytics_recalculation_log`.
3. A background daemon processes the queue, aggregates metrics using the `weight_configs`, and updates the latest `Snapshots`.

### Dashboard Aggregation
- Optimized for the `EloquentDashboardStatsQuery` (Dashboard 2.0). 
- Utilizes the `Cache::remember` closures to serve these pre-processed snapshots to Tenant Admins with sub-100ms latency.

## Tenancy & Security
Every configuration and log is strictly bound by `tenant_id` (`fk_awc_tenant`). The recalculation process is sandboxed to the active tenant's database connection to prevent cross-tenant resource contention.

---

## Linked References
- Related Artifacts: `Dashboard Stats Query Performance Optimization`.
- Related Modules: `Exam-Hierarchy`, `Quiz`.
