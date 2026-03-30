# UBOTZ 2.0 Batch Technical Specification

Batches model **cohorts**: scheduled containers with capacity, category, and lifecycle distinct from individual **courses**. Code lives under `App\Application\TenantAdminDashboard\Batch`, `App\Domain\TenantAdminDashboard\Batch`, and persistence under `App\Infrastructure\Persistence\TenantAdminDashboard\Batch`.

---

## 1. HTTP surface

Routes: `backend/routes/tenant_dashboard/batch.php` under **`/api/tenant/batches`**.

Nested routes are registered **before** `GET /{id}` so paths like `/{batchId}/courses` resolve correctly.

| Method | Path | Capability |
|--------|------|------------|
| `GET` | `/` | `batch.view` |
| `GET` | `/{id}` | `batch.view` |
| `POST` | `/` | `batch.create` |
| `PUT` | `/{id}` | `batch.update` |
| `PATCH` | `/{id}/status` | `batch.update` |
| `DELETE` | `/{id}` | `batch.delete` |
| `GET` | `/{batchId}/courses` | `batch.view` |
| `POST` | `/{batchId}/courses` | `batch.update` |
| `DELETE` | `/{batchId}/courses/{courseId}` | `batch.update` |
| `GET` | `/{batchId}/faculty` | `batch.view` |
| `POST` | `/{batchId}/faculty` | `batch.manage_faculty` |
| `DELETE` | `/{batchId}/faculty/{assignmentId}` | `batch.manage_faculty` |

**Note:** `DELETE /{id}` invokes **`ArchiveBatchUseCase`** (sets `archived_at`), not a hard delete — see schema.

---

## 2. Relational schema (tenant DB)

### 2.1 `batches`

Migration: `2026_03_19_000001_create_batches_table.php` (skips if table exists).

| Column | Role |
|--------|------|
| `tenant_id` | FK `fk_batches_tenants` |
| `category_id` | FK `fk_batches_categories` (required) |
| `code` | Natural key with tenant: **`unq_batches_tenant_code`** (max 80 chars) |
| `name`, `description` | Display |
| `type` | e.g. `fixed_cohort` default |
| `status` | Workflow (`draft`, etc. — see domain `BatchStatus`) |
| `max_capacity` | Cohort ceiling |
| `start_date`, `end_date` | Lifecycle |
| `created_by` | FK `fk_batches_creator` |
| **`archived_at`** | Soft archive (no `deleted_at` on this table) |

Indexes: `idx_batches_tenant_status`, `idx_batches_tenant_category`, `idx_batches_tenant_dates`.

### 2.2 `batch_courses`

`2026_03_20_100000_create_batch_courses_table.php` — links batches to courses (`batch_id`, `course_id`, `linked_by`, tenant scoped). Unique `(batch_id, course_id)`.

### 2.3 `batch_faculty`

`2026_03_20_100001_create_batch_faculty_table.php` — assigns **user + course** within a batch (`unq_batch_faculty_assignment` on `batch_id`, `user_id`, `course_id`).

### 2.4 `batch_students`

`2026_03_20_100002_create_batch_students_table.php` — cohort membership with `removed_at` / `removed_by` / `removal_reason` for soft removal history.

### 2.5 Other

- **`batch_performance_snapshots`** (`2026_03_26_190003_create_batch_performance_snapshots_table.php`) — reporting/analytics storage (separate from core CRUD).
- **`add_default_installment_plan_to_courses_and_batches`** — optional financial linkage where configured.

---

## 3. Application layer

| Use case | Role |
|----------|------|
| `CreateBatchUseCase` | Create cohort |
| `UpdateBatchUseCase` | Update metadata/dates/capacity |
| `ChangeBatchStatusUseCase` | PATCH status |
| `ArchiveBatchUseCase` | DELETE → archive |
| `LinkCourseToBatchUseCase` / `UnlinkCourseFromBatchUseCase` | Course membership |
| `AssignFacultyToBatchUseCase` / `UnassignFacultyFromBatchUseCase` | Faculty rows |

Queries: `ListBatchesQuery`, `GetBatchDetailQuery`, `ListBatchCoursesQuery`, `ListBatchFacultyQuery`.

Enrollment and access for **students** can integrate with the **Enrollment** bounded context (e.g. batch-based access) — see `BatchEnrollmentAccessInterface` usage elsewhere in the platform.

---

## 4. Frontend

- **API paths:** `frontend/config/api-endpoints.ts` — `TENANT.BATCHES` (`LIST`, `DETAIL`, `CREATE`, `UPDATE`, `STATUS`, `COURSES`, `FACULTY`, …).
- **UI:** `frontend/app/tenant-admin-dashboard/batches/page.tsx`, `[id]/page.tsx`; components under `frontend/features/tenant-admin/batches/` (`use-batches.ts`, list/detail, faculty, courses).

---

## 5. Linked code references

| Layer | Path |
|-------|------|
| Application | `backend/app/Application/TenantAdminDashboard/Batch/` |
| Domain | `backend/app/Domain/TenantAdminDashboard/Batch/` |
| HTTP | `backend/app/Http/Controllers/Api/TenantAdminDashboard/Batch/` |
| Routes | `backend/routes/tenant_dashboard/batch.php` |

---

## 6. Document history

- Clarified **archive vs soft delete**, **capabilities** on each route, and related tables (**batch_students**, **batch_performance_snapshots**).
- **State transitions** in older docs referred generically to “published”; actual status strings are defined in domain value objects — refer to `BatchEntity` / `BatchStatus` in code for the canonical list.
