# UBOTZ 2.0 — Role (tenant RBAC) — Technical Specification

## Scope

Custom and system **roles** per tenant, **capability** catalog, role–capability assignments, and **user–role** assignments. Implemented in the **tenant** database (not the platform “central” catalog only). Routes: `backend/routes/tenant_dashboard/roles.php`.

## HTTP map (base `/api/tenant/roles`)

| Method | Path | Capability |
|--------|------|------------|
| GET | `/roles` | `role.view` |
| GET | `/roles/stats` | `role.view` |
| GET | `/roles/capabilities` | `role.view` — optional `role_type` query; filters `tenant_capabilities` by `config('tenant_role_scopes')` patterns |
| POST | `/roles` | `role.manage` |
| PUT | `/roles/{id}` | `role.manage` |
| DELETE | `/roles/{id}` | `role.manage` |
| PATCH | `/roles/{id}/toggle-active` | `role.manage` |

Controller: `App\Http\TenantAdminDashboard\Role\Controllers\TenantRoleController`.

## Application layer

| Component | Role |
|-----------|------|
| `ListTenantRolesQuery`, `GetTenantRoleStatsQuery` | Read models |
| `CreateTenantRoleUseCase`, `UpdateTenantRoleUseCase`, `DeleteTenantRoleUseCase` | Mutations with **hierarchy** checks via `GetActorHierarchyLevelQuery` |
| `CreateTenantRoleCommand` / `UpdateTenantRoleCommand` | Input to use cases |

## Persistence (tenant DB)

All of the following are **tenant-isolated** (see `BelongsToTenant` on models such as `TenantRoleRecord`):

| Table | Purpose |
|-------|---------|
| `tenant_roles` | Role definitions per tenant (`display_name`, `is_system`, `is_active`, plus fields such as `code`, `hierarchy_level`, `role_type` in current models) |
| `tenant_capabilities` | Capability catalog (`code`, `group`, …) — seeded via `TenantCapabilitySeeder` |
| `tenant_role_capabilities` | Role ↔ capability |
| `user_role_assignments` | User ↔ role |

Implementations and migrations evolve; use the latest migrations and `TenantRoleRecord` as source of truth for column names.

## Authorization middleware

`tenant.capability:{code}` — resolves the authenticated tenant user’s roles and checks whether the required capability is granted (implementation in `TenantCapabilityCheckerInterface` and related middleware).

## Seeded capabilities (role feature)

From `TenantCapabilitySeeder`: **`role.view`**, **`role.manage`**.

## Frontend

`frontend/config/api-endpoints.ts` — `TENANT.ROLES`: `/api/tenant/roles` (extend with `/stats`, `/capabilities` in clients as needed).

---

## Linked references

- **Users** — `user_role_assignments` ties users to roles
- **Identity** — tenant JWT and `TenantContext` supply `tenant_id`
