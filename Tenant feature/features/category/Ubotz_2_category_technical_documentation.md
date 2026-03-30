# UBOTZ 2.0 Category Technical Specification

This document describes **tenant course categories** — the hierarchical taxonomy used for **courses**, **batches**, and related LMS entities. It is **not** the same as **blog categories** (`/api/tenant/blog/categories`), which are a separate module.

Domain: `App\Domain\TenantAdminDashboard\Category`; application: `App\Application\TenantAdminDashboard\Category`; HTTP: `App\Http\TenantAdminDashboard\Category\Controllers`.

---

## 1. HTTP surface

Routes: `backend/routes/tenant_dashboard/categories.php` → **`/api/tenant/categories`**.

| Method | Path | Middleware |
|--------|------|------------|
| `GET` | `/` | *(none — authenticated tenant user)* |
| `GET` | `/{id}` | *(none)* |
| `POST` | `/` | `tenant.capability:category.manage` |
| `PUT` | `/{id}` | `tenant.capability:category.manage` |
| `DELETE` | `/{id}` | `tenant.capability:category.manage` |

**Reads are not gated** by `category.view` in `categories.php`; any authenticated tenant user can list/show. **Mutations** require **`category.manage`** (older drafts referring to `category.edit` or `category.view` for reads are inaccurate for this file).

---

## 2. Relational schema (tenant DB)

Migration: `2026_02_26_195500_create_categories_table.php`.

| Column | Role |
|--------|------|
| `tenant_id` | FK to `tenants`, cascade delete |
| `parent_id` | Nullable self-FK to `categories.id`, **`onDelete('cascade')`** — DB removes child rows when parent row is removed |
| `title`, `slug` | Display and URL key; **`unique(tenant_id, slug)`** as `idx_categories_tenant_slug` |
| `icon` | Optional icon identifier |
| `order` | Manual sort (`integer`, default `0`) |
| `timestamps` | |

Indexes: `idx_categories_tenant`, `idx_categories_parent` on `(tenant_id, parent_id)`.

Follow-up: `2026_03_26_330004_index_categories_parent_id.php` may add further indexing — see migration for details.

---

## 3. Delete semantics (application)

**`DeleteCategoryUseCase`** explicitly:

1. Loads the category and records deletion intent.
2. In a transaction: calls **`deleteByParentId`** to remove **descendant** categories, then **`delete`** for the target id (application-level cascade in addition to FK behavior).
3. Audits `category.deleted` and dispatches domain events.

Operators should still **reassign courses** away from a category before deletion if the product requires courses to always reference a valid category — course FK behavior is separate from category tree deletion.

---

## 4. Application use cases

- **`CreateCategoryUseCase`**, **`UpdateCategoryUseCase`**, **`DeleteCategoryUseCase`** — driven by `CategoryWriteController` with `CreateCategoryRequest` / `UpdateCategoryRequest`.

Queries for read paths are resolved inside `CategoryReadController` (list/tree/detail).

---

## 5. Frontend

- **`frontend/services/tenant-category-service.ts`** — `GET/POST/PUT/DELETE` **`/api/tenant/categories`**.
- **UI:** `frontend/app/tenant-admin-dashboard/categories/page.tsx`; components under `frontend/features/tenant-admin/categories/` (`use-categories.ts`, list table, form modal).

**Blog categories** live under **`/api/tenant/blog/categories`** and **`tenant.module:module.blog`** — do not confuse the two UIs or APIs.

---

## 6. Linked code references

| Layer | Path |
|-------|------|
| Application | `backend/app/Application/TenantAdminDashboard/Category/` |
| Domain | `backend/app/Domain/TenantAdminDashboard/Category/` |
| HTTP | `backend/app/Http/TenantAdminDashboard/Category/Controllers/` |
| Routes | `backend/routes/tenant_dashboard/categories.php` |

---

## 7. Document history

- Corrected capability story: **`category.manage`** on writes only; reads unrestricted in route file.
- Distinguished **course categories** vs **blog categories**.
- Documented **`DeleteCategoryUseCase`** cascade strategy and DB FK on `parent_id`.
