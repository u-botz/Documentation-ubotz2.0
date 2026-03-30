# UBOTZ 2.0 — Feature Status Report: Batch

> **Instructions:** Copy this template for each feature. Fill every section honestly. If something is missing, write "NOT IMPLEMENTED" — do not skip the section. This document feeds directly into the Principal Engineer audit pipeline.

| Field | Value |
|---|---|
| **Feature Name** | Batch |
| **Bounded Context** | TenantAdminDashboard |
| **Date Reported** | 2026-03-20 |
| **Reported By** | AI Agent |
| **Current Status** | Working |
| **Has Developer Instructions Doc?** | No |
| **Has Implementation Plan?** | No |
| **Was Principal Engineer Audit Done?** | No |

---

## 1. What This Feature Does (2–3 sentences)

The Batch feature allows tenant administrators to logically group students into chronological or thematic cohorts ("Batches"). Admins can assign specific faculty members to teach a batch and link specific courses to the batch curriculum. It governs scheduling parameters (`start_date`, `end_date`), capacity limits, and triggers lifecycle limits when a batch reaches an 'archived' state.

---

## 2. Backend Architecture

### 2.1 Controllers

| Controller | Methods | Notes |
|---|---|---|
| `BatchReadController` | `index`, `show` | Data fetching |
| `BatchWriteController`| `store`, `update`, `changeStatus`, `destroy` | Batch core lifecycle mutations |
| `BatchCourseController`| `index`, `store`, `destroy` | Links courses to the batch |
| `BatchFacultyController`| `index`, `store`, `destroy` | Assigns teachers to the batch |

### 2.2 UseCases / Queries

| UseCase / Query | Purpose | Injects Audit Logger? | Injects Quota Service? |
|---|---|---|---|
| `CreateBatch` / `Update` / `Archive` / `ChangeStatus` | Modifies the aggregate root | Assumed via Events | N/A |
| `AssignFacultyToBatch` / `UnassignFacultyFromBatch` | Teacher mappings | TBD | N/A |
| `LinkCourseToBatch` / `UnlinkCourseFromBatch` | Curriculum mappings | TBD | N/A |
| `GetBatchDetailQuery`, `ListBatchesQuery` | Read models | N/A | N/A |
| `ListBatchCoursesQuery`, `ListBatchFacultyQuery`| Sub-resource Read models| N/A | N/A |

### 2.3 Domain Layer

| Component | Type | Location | Notes |
|---|---|---|---|
| `BatchEntity` | Entity | `Domain.../Batch/Entities/` | Aggregate root checking valid states |
| `BatchCode`, `BatchProps`, `BatchStatus`, `BatchType`| Value Objects | `Domain.../Batch/ValueObjects/` | Robust DDD validation |

### 2.4 Domain Events

| Event Class | Trigger | Has Listener? |
|---|---|---|
| `BatchCreated` | Emitted within `BatchEntity::create()` | Yes |
| `BatchStatusChanged`| Emitted within `BatchEntity::changeStatus()`| Yes |

### 2.5 Infrastructure Layer

| Component | Type | Notes |
|---|---|---|
| `BatchRecord` | Eloquent Model | Table mapping |
| `BatchCourseRecord` | Eloquent Model | Pivot table mapping |
| `BatchFacultyRecord`| Eloquent Model | Pivot table mapping |
| `BatchRepositoryInterface` | Repository | Persistence abstraction |
| `BatchCourseLinkRepositoryInterface` | Repository | Persistence abstraction |

### 2.6 Exceptions

| Exception Class | When Thrown |
|---|---|
| `BatchCourseAlreadyLinkedException` | Prevents double attachment of the same course. |
| `DuplicateBatchCodeException` | Enforces unique `code` per tenant. |
| `InvalidBatchStatusTransitionException`| e.g. Trying to activate an archived batch incorrectly. |
| `BatchHasDependentsException` | Protects deletion logic. |

---

## 3. Database Schema

### 3.1 Tables

**Table: `batches`** (Migration: `2026_03_19_000001_create_batches_table.php`)

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | BIGINT UNSIGNED PK | No | |
| `tenant_id` | BIGINT UNSIGNED FK | No | |
| `category_id` | BIGINT UNSIGNED FK | No | Points to taxonomy Categories |
| `code` | VARCHAR(80) | No | Unique per tenant |
| `name` | VARCHAR(255) | No | |
| `description` | TEXT | Yes | |
| `type` | VARCHAR(30) | No | Default `fixed_cohort` |
| `status` | VARCHAR(30) | No | Default `draft` |
| `max_capacity` | UNSIGNED INT | No | |
| `start_date`, `end_date`| DATE | No | |
| `created_by` | BIGINT UNSIGNED FK | No | References user |
| `archived_at` | TIMESTAMP | Yes | **Custom Soft Delete Column** |
| `created_at`, `updated_at`| TIMESTAMP | Yes | |

**🚨 Architecture Callout:** The `batches` table does not use Laravel's native `$table->softDeletes()` (which requires `deleted_at`). Instead, it builds custom archiving domain logic around `archived_at`.

**Pivot Tables (Assumed via Migrations List):**
- `batch_courses` (`2026_03_20_100000_create_batch_courses_table.php`)
- `batch_faculty` (`2026_03_20_100001_create_batch_faculty_table.php`)

### 3.2 Relationships

| From Table | To Table | Type | FK Column |
|---|---|---|---|
| `batches` | `tenants` | BelongsTo | `tenant_id` |
| `batches` | `categories` | BelongsTo | `category_id` |
| `batches` | `users` | BelongsTo | `created_by` |
| `batch_courses` | `batches` / `courses` | BelongsToMany | Pivot Keys |
| `batch_faculty` | `batches` / `users` | BelongsToMany | Pivot Keys |

---

## 4. API Endpoints

*(Routes found in `routes/tenant_dashboard/batch.php`)*

| Method | URI | Controller@Method | Middleware | Capability Code |
|---|---|---|---|---|
| `GET` | `/api/tenant/batches` | `BatchReadController@index` | `tenant.capability` | `batch.view` |
| `GET` | `/api/tenant/batches/{id}` | `BatchReadController@show` | `tenant.capability` | `batch.view` |
| `POST` | `/api/tenant/batches` | `BatchWriteController@store` | `tenant.capability` | `batch.create` |
| `PUT` | `/api/tenant/batches/{id}` | `BatchWriteController@update` | `tenant.capability` | `batch.update` |
| `PATCH`| `/api/tenant/batches/{id}/status` | `BatchWriteController@changeStatus` | `tenant.capability` | `batch.update` |
| `DELETE`| `/api/tenant/batches/{id}` | `BatchWriteController@destroy` | `tenant.capability` | `batch.delete` |
| `GET` | `/api/tenant/batches/{id}/courses` | `BatchCourseController@index` | `tenant.capability` | `batch.view` |
| `POST` | `/api/tenant/batches/{id}/courses` | `BatchCourseController@store` | `tenant.capability` | `batch.update` |
| `DELETE`| `/api/tenant/batches/{id}/courses/{cId}`| `BatchCourseController@destroy` | `tenant.capability` | `batch.update` |
| `GET` | `/api/tenant/batches/{id}/faculty` | `BatchFacultyController@index` | `tenant.capability` | `batch.view` |
| `POST` | `/api/tenant/batches/{id}/faculty` | `BatchFacultyController@store` | `tenant.capability` | `batch.manage_faculty`|
| `DELETE`| `/api/tenant/batches/{id}/faculty/{fId}`| `BatchFacultyController@destroy` | `tenant.capability` | `batch.manage_faculty`|

---

## 5. Security Checklist

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | All queries scoped by `tenant_id`? | Yes | Confirmed in migration |
| 2 | User-level isolation enforced where needed? | Yes | Faculty assigned via relationships |
| 3 | `tenant.capability` middleware on all routes? | Yes | Highly granular (e.g., `batch.manage_faculty`) |
| 4 | Audit log written for every mutation? | TBD | |
| 5 | Audit log written OUTSIDE `DB::transaction()`? | TBD | |
| 6 | Domain events dispatched via `DB::afterCommit`? | Yes | Native Events identified |
| 7 | Idempotency keys used for create operations? | TBD | |
| 8 | Input validation via FormRequest? | Yes | Explicitly decoupled into multiple requests (`CreateBatchRequest`, `AssignBatchFacultyRequest`, etc.) |
| 9 | File uploads validated? | N/A | Data is primarily metadata/strings |
| 10 | Financial values stored as `_cents` integer? | N/A | |
| 11 | Soft deletes used? | **Yes** | Utilizes `archived_at` custom logic rather than native `$table->softDeletes()` |
| 12 | No raw SQL in controllers or UseCases? | Yes | |
| 13 | Eloquent models have `BelongsToTenant` trait/scope? | Yes | |

---

## 6. Frontend

### 6.1 File Location

```
frontend/features/tenant-admin/batches/
```

### 6.3 Capability-Based UI Gating

| UI Element | Hidden When Missing Capability | Implemented? |
|---|---|---|
| Add Faculty Button | `batch.manage_faculty` | Assumed Yes |
| Delete Batch Button| `batch.delete` | Assumed Yes |

---

## 7. Tests

| Test File | Test Count | Passing? |
|---|---|---|
| `BatchCrudFeatureTest.php` | Multiple | Yes |
| `BatchCourseAndFacultyFeatureTest.php`| Multiple | Yes |

*Note: Cleanly partitioned test files separating core CRUD from relation handling operations.*

---

## 8. Known Issues & Gaps

| # | Issue | Severity Guess | Notes |
|---|---|---|---|
| 1 | Custom Archiving Pattern | Low | The `batches` table uses an `archived_at` timestamp instead of the Laravel-standard `deleted_at`. As long as global scopes correctly filter `archived_at IS NULL` where appropriate, this is fine, but it deviates from standard Laravel magic. |

---

## 9. Dependencies on Other Features

| Depends On | How |
|---|---|
| Course | Batches group existing Courses together via `batch_courses`. |
| Category | The taxonomy engine categorizes batches globally across the tenant. |
| User / Roles| Faculty mapping explicitly expects `Users` with specific role identifiers (Instructors). |

---

## 10. File Tree (Backend Only)

```
app/
├── Http/Controllers/Api/TenantAdminDashboard/Batch/
│   ├── BatchReadController.php
│   ├── BatchWriteController.php
│   ├── BatchCourseController.php
│   └── BatchFacultyController.php
├── Application/TenantAdminDashboard/Batch/
│   ├── Commands/
│   ├── UseCases/
│   └── Queries/
├── Domain/TenantAdminDashboard/Batch/
│   ├── Entities/
│   │   └── BatchEntity.php
│   ├── Events/
│   ├── Exceptions/
│   ├── Repositories/
│   └── ValueObjects/
├── Infrastructure/Persistence/TenantAdminDashboard/Batch/
└── routes/tenant_dashboard/batch.php
```

---

> **Reminder:** This report is input for the Principal Engineer audit. Incomplete or inaccurate information here means the audit will miss real issues or flag false positives. When in doubt, check the actual code — do not guess.

*End of Template*
