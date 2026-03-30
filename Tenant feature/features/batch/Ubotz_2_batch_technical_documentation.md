# UBOTZ 2.0 Batch Technical Specification

## Context & Architectural Precedence
The `TenantAdminDashboard\Batch` aggregate isolates strict cohort logic away from the general `Course` definition. It enables an $M:N$ operational mapping structure where a single Course can spawn a theoretically infinite sequence of independent temporal instances.

## Base Schema Constraints (`batches`)
Implemented dynamically through the `2026_03_19_000001_create_batches_table.php` schema.
- **`tenant_id`**: Invariant $O(1)$ lookup constraint preventing data-leaks to competing tenant accounts. `fk_batches_tenants` asserts a rigid `cascadeOnDelete()`.
- **Compound Keys**: `unq_batches_tenant_code(tenant_id, code)` implements a strictly enforced natural ID matrix, enforcing operators to supply distinct syllabus markers without colliding globally.

### Performance Indicators
The `start_date` and `end_date` date-components form a distinct indexing priority: `idx_batches_tenant_dates`. This enables dashboard queries resolving "All active batches for Date X" to bypass full-table scans.

## State Transitions
1. `draft` $\rightarrow$ `published` $\rightarrow$ soft archiving.
2. The core logic omits generic Laravel Soft Deletions (`deleted_at`) resolving instead to `archived_at`. This ensures legacy batch rosters remain immutable while actively removing them from `EnrollmentUseCase` lookups.

## Access Policy
Admin actions against `Batches` apply capabilities like `batch.view`, `batch.create` via Tenant Role hierarchies. `fk_batches_creator` locks down `restrict` deletion rules ensuring audit integrity for the operating actor.
