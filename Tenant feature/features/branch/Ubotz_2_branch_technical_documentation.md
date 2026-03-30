# UBOTZ 2.0 Branch Technical Specification

Branches are tenant-scoped **sites / campuses** (or logical subsidiaries) used for addressing, assignment of users, and downstream linkage to CRM, fees, installments, payments, and leads. Persistence uses Eloquent records with **`BelongsToTenant`**; HTTP controllers live under `App\Http\Controllers\Api\TenantAdminDashboard\Branch`.

---

## 1. HTTP surface

Routes: `backend/routes/tenant_dashboard/branch.php` → **`/api/tenant/branches`** (included from `backend/routes/api.php` in the tenant group).

| Method | Path | Capability |
|--------|------|------------|
| `GET` | `/` | `branch.view` |
| `GET` | `/{branchId}` | `branch.view` |
| `POST` | `/` | `branch.manage` |
| `PUT` | `/{branchId}` | `branch.manage` |
| `PATCH` | `/{branchId}/deactivate` | `branch.manage` |
| `POST` | `/assign-user` | `branch.manage` |

---

## 2. Relational schema (tenant DB)

### 2.1 `branches`

Migration: `2026_03_17_210500_create_branches_table.php`.

| Column | Role |
|--------|------|
| `tenant_id` | FK `fk_branches_tenant` |
| `name`, `code` | Display and natural key; **`unique(tenant_id, code)`** as `unq_branches_tenant_code` |
| `address`, `phone`, `email` | Contact / location |
| `is_active` | `tinyInteger` default `1` (not Laravel `softDeletes` on this table) |
| `timestamps` | Audit |

Index: `idx_branches_tenant_active` on `(tenant_id, is_active)`.

### 2.2 `manager_user_id`

Migration: `2026_03_25_120003_add_manager_user_id_to_branches_table.php` — optional FK to `users` (`fk_branches_manager_user`, `set null` on delete).

### 2.3 `user_branch_assignments`

Migration: `2026_03_17_210501_create_user_branch_assignments_table.php` — links users to branches (`tenant_id`, `user_id`, `branch_id`), unique triple `unq_user_branch`.

### 2.4 Downstream references

Later migrations add **`branch_id`** to leads, installment orders, payment transactions, and fee-related tables (see `2026_03_17_210502_*`, `2026_03_26_20000*`); branches act as an optional dimension across reporting and money flows.

---

## 3. Application layer

Use cases are wired from `BranchReadController` / `BranchWriteController` (see `backend/app/Application/TenantAdminDashboard/Branch/` if present) — list/show, create/update, deactivate, and user assignment.

---

## 4. Frontend & integrations

- **`API_ENDPOINTS.TENANT_BRANCH`** in [`frontend/config/api-endpoints.ts`](../../../../frontend/config/api-endpoints.ts); thin client in [`frontend/services/tenant-branch-service.ts`](../../../../frontend/services/tenant-branch-service.ts).
- Branch context also appears in **dashboard** (`tenant-dashboard-service` overview `branch_id`), **CRM** reports (`crmReportsApi` branch comparison), **fees**, **WhatsApp**, and **subscription plan limits** (`max_branches`). **`branch.php`** remains the HTTP contract.

---

## 5. Linked code references

| Layer | Path |
|-------|------|
| HTTP | `backend/app/Http/Controllers/Api/TenantAdminDashboard/Branch/` |
| Routes | `backend/routes/tenant_dashboard/branch.php` |
| Migrations | `backend/database/migrations/tenant/2026_03_17_210500_create_branches_table.php` (+ follow-ups) |
| Frontend API | `frontend/config/api-endpoints.ts` — `TENANT_BRANCH` |
| Frontend service | `frontend/services/tenant-branch-service.ts` |

---

## 6. Document history

- Confirmed **`is_active`** as `tinyInteger` and documented **`manager_user_id`** and **`user_branch_assignments`**.
- Replaced vague “offline-center” wording with **route- and schema-accurate** descriptions.
- **2026-03-30:** Centralized frontend API paths (`TENANT_BRANCH`) and `tenant-branch-service.ts`.
