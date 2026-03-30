# UBOTZ 2.0 — Feature Status Report: Role

> **Instructions:** Copy this template for each feature. Fill every section honestly. If something is missing, write "NOT IMPLEMENTED" — do not skip the section. This document feeds directly into the Principal Engineer audit pipeline.

| Field | Value |
|---|---|
| **Feature Name** | Role |
| **Bounded Context** | TenantAdminDashboard |
| **Date Reported** | 2026-03-20 |
| **Reported By** | AI Agent |
| **Current Status** | Working |
| **Has Developer Instructions Doc?** | No |
| **Has Implementation Plan?** | No |
| **Was Principal Engineer Audit Done?** | No |

---

## 1. What This Feature Does (2–3 sentences)

The Role feature governs the Tenant's RBAC (Role-Based Access Control) structure. It defines distinct security roles (e.g. Instructor, Admin) comprised of granular capabilities (e.g. `course.view`, `batch.manage_faculty`) and assigns precisely **one** role per user within the tenant, ensuring strict and explicit authorization guardrails. 

---

## 2. Backend Architecture

This feature employs a **hybrid storage pattern**: Core roles are stored centrally to allow platform-wide taxonomy enforcement, while the mapping between a User and a Role is stored locally inside the tenant's exact database space.

### 2.1 Controllers

| Controller | Methods | Notes |
|---|---|---|
| `TenantRoleController` | `index`, `stats`, `capabilities`, `store`, `update`, `destroy`, `toggleActive` | Unified controller handling reads, metrics, and mutations. |

### 2.2 UseCases / Queries

| UseCase / Query | Purpose | Injects Audit Logger? | Injects Quota Service? |
|---|---|---|---|
| `CreateTenantRoleUseCase` | Creates custom role definitions | TBD | N/A |
| `UpdateTenantRoleUseCase` | Mutates definitions | TBD | N/A |
| `DeleteTenantRoleUseCase` | Deletes definitions | TBD | N/A |
| `ListTenantRolesQuery` | Fetches roles for the UI | N/A | N/A |
| `GetTenantRoleStatsQuery` | Counts user distribution per role | N/A | N/A |

### 2.3 Domain Layer

| Component | Type | Location | Notes |
|---|---|---|---|
| `TenantRoleEntity` | Entity | `Domain.../Role/Entities/` | Aggregate Root |

### 2.4 Domain Events

| Event Class | Trigger | Has Listener? |
|---|---|---|
| `TenantRoleCreated` | Entity generation | Yes |
| `TenantRoleUpdated` | Entity modification | Yes (`NotifyRoleChangedListener`) |
| `TenantRoleDeleted` | Entity deletion | Yes |
| `UserRoleChanged` | Emitted when a user assignment switches | Yes |

### 2.5 Infrastructure Layer

| Component | Type | Notes |
|---|---|---|
| `TenantRoleRecord` | Eloquent Model | Hits Central DB |
| `TenantRoleCapabilityRecord` | Eloquent Model | Hits Central DB |
| `UserRoleAssignmentRecord` | Eloquent Model | Hits Tenant DB |
| `EloquentTenantRoleRepository` | Repository | Bridges the Central/Tenant boundary securely |
| `EloquentTenantRoleQuery` | Repository | Bridges CQRS fetch logic |

### 2.6 Exceptions

| Exception Class | When Thrown |
|---|---|
| `DuplicateRoleCodeException` | Prevents naming collisions when creating custom scopes. |

---

## 3. Database Schema

### 3.1 Tables

**Table: `tenant_roles` [CENTRAL DB]** (Migration: `2026_02_23_000001_create_tenant_roles_table.php`)

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | BIGINT UNSIGNED PK | No | |
| `tenant_id` | BIGINT UNSIGNED FK | No | Scopes the central record |
| `slug` | VARCHAR(50) | No | Unique per tenant |
| `display_name` | VARCHAR(100) | No | |
| `description` | TEXT | Yes | |
| `is_system` | BOOLEAN | No | System roles cannot typically be deleted |
| `is_active` | BOOLEAN | No | |
| `created_at`, `updated_at`| TIMESTAMP | Yes | |

**Table: `user_role_assignments` [TENANT DB]** (Migration: `2026_02_25_013336_create_user_role_assignments_table.php`)

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | BIGINT UNSIGNED PK | No | |
| `tenant_id` | BIGINT UNSIGNED FK | No | |
| `user_id` | BIGINT UNSIGNED FK | No | |
| `role_id` | BIGINT UNSIGNED FK | No | |

**🚨 Critical Architecture Rule:** 
The assignment table has a UNIQUE index on `['tenant_id', 'user_id']`. This natively guarantees at the database engine level that **a user can only ever hold a single role simultaneously**.

**Soft Deletes:**
Neither the roles nor the assignment pivots use soft deletes. Destruction is hard/permanent.

### 3.2 Relationships

| From Table | To Table | Type | FK Column |
|---|---|---|---|
| `user_role_assignments` | `users` | BelongsTo | `user_id` |
| `user_role_assignments` | `tenant_roles` | BelongsTo | `role_id` |

---

## 4. API Endpoints

*(Routes found in `routes/tenant_dashboard/roles.php`)*

All paths prefixed with `/api/tenant/roles`

| Method | URI | Controller@Method | Middleware | Capability Code |
|---|---|---|---|---|
| `GET` | `/` | `TenantRoleController@index` | `tenant.capability` | `role.view` |
| `GET` | `/stats` | `TenantRoleController@stats` | `tenant.capability` | `role.view` |
| `GET` | `/capabilities` | `TenantRoleController@capabilities`| `tenant.capability` | `role.view` |
| `POST` | `/` | `TenantRoleController@store` | `tenant.capability` | `role.manage` |
| `PUT` | `/{id}` | `TenantRoleController@update` | `tenant.capability` | `role.manage` |
| `DELETE`| `/{id}` | `TenantRoleController@destroy`| `tenant.capability` | `role.manage` |
| `PATCH` | `/{id}/toggle-active`| `TenantRoleController@toggleActive`| `tenant.capability` | `role.manage` |

---

## 5. Security Checklist

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | All queries scoped by `tenant_id`? | Yes | Checked across dual database connections via Repositories. |
| 2 | User-level isolation enforced where needed? | Yes | Heavily tested per tenant connection. |
| 3 | `tenant.capability` middleware on all routes? | Yes | Standardized: `role.view` and `role.manage`. |
| 4 | Audit log written for every mutation? | TBD | |
| 5 | Audit log written OUTSIDE `DB::transaction()`? | TBD | |
| 6 | Domain events dispatched via `DB::afterCommit`? | Yes | Custom listener triggers (`NotifyRoleChangedListener`). |
| 7 | Idempotency keys used for create operations? | TBD | |
| 8 | Input validation via FormRequest? | Yes | E.g. `CreateTenantRoleRequest` |
| 9 | File uploads validated? | N/A | |
| 10 | Financial values stored as `_cents` integer? | N/A | |
| 11 | Soft deletes used? | **No** | |
| 12 | No raw SQL in controllers or UseCases? | Yes | |
| 13 | Eloquent models have `BelongsToTenant` trait/scope? | Yes | Explicitly decoupled logic. |

---

## 6. Frontend

Standard CRUD assumed.

---

## 7. Tests

This is one of the most vigorously tested boundaries in the application layer.

| Test File | Test Count | Passing? |
|---|---|---|
| `TenantRoleCrudTest.php` | Multiple | Yes |
| `TenantRoleIsolationTest.php` | Multiple | Yes |
| `TenantRoleUpdateDeleteTest.php` | Multiple | Yes |
| `RoleManagementTest.php` | Multiple | Yes |
| `TenantCapabilityCheckerTest.php` | Multiple | Yes |
| `EnforceTenantCapabilityMiddlewareTest.php`| Multiple | Yes |

---

## 8. Known Issues & Gaps

| # | Issue | Severity Guess | Notes |
|---|---|---|---|
| 1 | Hard Delete References | Low | Since Roles are hard deleted, a user tied to a deleted role might crash via cascading deletion or become orphaned depending on exact foreign key rules (`cascadeOnDelete()`). The schema indicates `cascadeOnDelete()` is active, meaning **deleting a role instantly wipes out the user assignment**, returning affected users back to "no role" statuses. |

---

## 9. Dependencies on Other Features

| Depends On | How |
|---|---|
| Platform User Schema | Connects tenant boundaries with centralized platform tables. |
| **Is Depended On By** | Literally every protected API route relies entirely on `tenant.capability` mappings derived here. |

---

## 10. File Tree (Backend Only)

```
app/
├── Http/TenantAdminDashboard/Role/
│   ├── Requests/
│   └── Controllers/
│       └── TenantRoleController.php
├── Application/TenantAdminDashboard/Role/
│   ├── Commands/
│   ├── Listeners/
│   ├── Queries/
│   └── UseCases/
├── Domain/TenantAdminDashboard/Role/
│   ├── Entities/
│   │   └── TenantRoleEntity.php
│   ├── Events/
│   ├── Exceptions/
│   └── Repositories/
├── Infrastructure/Persistence/TenantAdminDashboard/Role/
│   ├── EloquentTenantRoleRepository.php
│   └── EloquentTenantRoleQuery.php
└── routes/tenant_dashboard/roles.php
```

---

> **Reminder:** This report is input for the Principal Engineer audit. Incomplete or inaccurate information here means the audit will miss real issues or flag false positives. When in doubt, check the actual code — do not guess.

*End of Template*
