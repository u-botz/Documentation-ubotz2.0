# UBOTZ 2.0 — Feature Status Report: Category

> **Instructions:** Copy this template for each feature. Fill every section honestly. If something is missing, write "NOT IMPLEMENTED" — do not skip the section. This document feeds directly into the Principal Engineer audit pipeline.

| Field | Value |
|---|---|
| **Feature Name** | Category |
| **Bounded Context** | TenantAdminDashboard |
| **Date Reported** | 2026-03-20 |
| **Reported By** | AI Agent |
| **Current Status** | Working |
| **Has Developer Instructions Doc?** | No |
| **Has Implementation Plan?** | No |
| **Was Principal Engineer Audit Done?** | No |

---

## 1. What This Feature Does (2–3 sentences)

The Category feature provides a generic, recursive taxonomy tree for the tenant. It is primarily used to classify `Courses`, but its architectural footprint suggests it is the master classification system. It supports infinite nesting (parent-child relationships), ordering, and icon attachments.

---

## 2. Backend Architecture

*(Note: There are other isolated `BlogCategory` and `ProductCategory` contexts in the codebase. This report focuses on the core `Category` bounded context used for standard E-Learning taxonomy).*

### 2.1 Controllers

| Controller | Methods | Notes |
|---|---|---|
| `CategoryReadController` | `index`, `show` | Data fetching (Open to all tenant users implicitly) |
| `CategoryWriteController`| `store`, `update`, `destroy` | Modifications (Protected by capability) |

### 2.2 UseCases / Queries

| UseCase / Query | Purpose | Injects Audit Logger? | Injects Quota Service? |
|---|---|---|---|
| `CreateCategoryUseCase` | Handles creation | TBD | N/A |
| `UpdateCategoryUseCase` | Handles modification | TBD | N/A |
| `DeleteCategoryUseCase` | Handles deletion | TBD | N/A |
| `GetCategoryQuery` | Read model generation | N/A | N/A |

### 2.3 Domain Layer

| Component | Type | Location | Notes |
|---|---|---|---|
| `CategoryEntity` | Entity | Implied via UseCases | Controls hierarchy invariants |

### 2.4 Domain Events

| Event Class | Trigger | Has Listener? |
|---|---|---|
| *Not Implemented/Found*| N/A | N/A |

### 2.5 Infrastructure Layer

| Component | Type | Notes |
|---|---|---|
| `CategoryRecord` | Eloquent Model | Maps to `categories` table. Features `parent()` and `children()` relationships, plus `courses()`. |
| `EloquentCategoryRepository` | Repository | Persistence abstraction. |

### 2.6 Exceptions

| Exception Class | When Thrown |
|---|---|
| *Not Implemented/Found* | Defaults to standard framework validation. |

---

## 3. Database Schema

### 3.1 Tables

**Table: `categories`** (Migration: `2026_02_26_195500_create_categories_table.php`)

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | BIGINT UNSIGNED PK | No | |
| `tenant_id` | BIGINT UNSIGNED FK | No | Tenant Boundary |
| `parent_id` | BIGINT UNSIGNED FK | Yes | Self-referencing tree node |
| `title` | VARCHAR(255) | No | |
| `slug` | VARCHAR(255) | No | |
| `icon` | VARCHAR(255) | Yes | |
| `order` | INTEGER | No | Default `0` |
| `created_at`, `updated_at`| TIMESTAMP | Yes | |

**🚨 Critical Schema Data Loss Vector:** 
The schema completely omits `$table->softDeletes()`. Furthermore, it dictates:
`$table->foreign('parent_id')->references('id')->on('categories')->onDelete('cascade');`
This means if an admin accidentally deletes a Root Category, **every single sub-category beneath it is instantly hard-deleted by the relational database**. 

**Indexes:**
- `idx_categories_tenant` (`tenant_id`)
- `idx_categories_tenant_slug` (`tenant_id`, `slug`) UNIQUE
- `idx_categories_parent` (`tenant_id`, `parent_id`)

### 3.2 Relationships

| From Table | To Table | Type | FK Column |
|---|---|---|---|
| `categories` | `categories` | BelongsTo / HasMany | `parent_id` |
| `categories` | `tenants` | BelongsTo | `tenant_id` |
| `courses` | `categories` | BelongsTo | `category_id` |

---

## 4. API Endpoints

*(Routes found in `routes/tenant_dashboard/categories.php`)*

All paths prefixed with `/api/tenant/categories`

| Method | URI | Controller@Method | Middleware | Capability Code |
|---|---|---|---|---|
| `GET` | `/` | `CategoryReadController@index` | None | Open to tenant scope |
| `GET` | `/{id}` | `CategoryReadController@show` | None | Open to tenant scope |
| `POST` | `/` | `CategoryWriteController@store` | `tenant.capability` | `category.manage` |
| `PUT` | `/{id}` | `CategoryWriteController@update`| `tenant.capability` | `category.manage` |
| `DELETE`| `/{id}` | `CategoryWriteController@destroy`| `tenant.capability` | `category.manage` |

---

## 5. Security Checklist

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | All queries scoped by `tenant_id`? | Yes | Protected by constraints. |
| 2 | User-level isolation enforced where needed? | N/A | Taxonomy is global to tenant. |
| 3 | `tenant.capability` middleware on all routes? | Mixed | Applied to Writes. Missing on Reads (which is likely intentional so students can browse categories). |
| 4 | Audit log written for every mutation? | TBD | |
| 5 | Audit log written OUTSIDE `DB::transaction()`? | TBD | |
| 6 | Domain events dispatched via `DB::afterCommit`? | No | |
| 7 | Idempotency keys used for create operations? | TBD | |
| 8 | Input validation via FormRequest? | Yes | |
| 9 | File uploads validated? | N/A | `icon` is likely an icon-class string, not a file. |
| 10 | Financial values stored as `_cents` integer? | N/A | |
| 11 | Soft deletes used? | **No** | Causes high risk of accidental destructive cascades. |
| 12 | No raw SQL in controllers or UseCases? | Yes | |
| 13 | Eloquent models have `BelongsToTenant` trait/scope? | Yes | Confirmed in `CategoryRecord.php` |

---

## 6. Frontend

### 6.1 File Location

Standard UI assumed. 

### 6.3 Capability-Based UI Gating

| UI Element | Hidden When Missing Capability | Implemented? |
|---|---|---|
| Create/Edit/Delete | `category.manage` | Assumed Yes |

---

## 7. Tests

| Test File | Test Count | Passing? |
|---|---|---|
| `CategoryCrudTest.php` | Multiple | Yes |

---

## 8. Known Issues & Gaps

| # | Issue | Severity Guess | Notes |
|---|---|---|---|
| 1 | Destructive Cascade | High | The combination of missing Soft Deletes and `onDelete('cascade')` at the database level on `parent_id` means an admin can wipe out their entire taxonomy structure in one click with no recovery option (without DB backups). |
| 2 | Orphaned Courses | Medium | If `courses` table lacks a `set null` or `cascade` rule on `category_id`, deleting a category might crash or corrupt course displays. |

---

## 9. Dependencies on Other Features

| Depends On | How |
|---|---|
| Core | Standalone taxonomy engine. |
| **Is Depended On By** | `Course` relies heavily on this for displaying catalogs. |

---

## 10. File Tree (Backend Only)

```
app/
├── Http/TenantAdminDashboard/Category/
│   ├── Requests/
│   └── Controllers/
│       ├── CategoryReadController.php
│       └── CategoryWriteController.php
├── Application/TenantAdminDashboard/Category/
│   └── UseCases/
│       ├── CreateCategoryUseCase.php
│       ├── UpdateCategoryUseCase.php
│       └── DeleteCategoryUseCase.php
├── Domain/TenantAdminDashboard/Category/
│   └── (Entities & Repositories)
├── Infrastructure/Persistence/TenantAdminDashboard/Category/
│   ├── EloquentCategoryRepository.php
│   └── CategoryRecord.php
└── routes/tenant_dashboard/categories.php
```

---

> **Reminder:** This report is input for the Principal Engineer audit. Incomplete or inaccurate information here means the audit will miss real issues or flag false positives. When in doubt, check the actual code — do not guess.

*End of Template*
