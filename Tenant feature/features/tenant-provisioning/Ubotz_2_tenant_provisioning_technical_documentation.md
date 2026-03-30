# UBOTZ 2.0 — Tenant provisioning — Technical Specification

## Scope

**Platform-level** creation and lifecycle of **tenant organizations** (rows in the **central** `tenants` table), including onboarding flows, provisioning run tracking, and operator APIs to **inspect status** or **resume** failed steps. This is distinct from **tenant-user** features under `/api/tenant/...`.

## Platform API entry points

Base: **`/api/platform`** with `auth:admin_api` + `admin.session` (see `backend/routes/api.php`).

| Method | Path | Authority (representative) | Purpose |
|--------|------|----------------------------|---------|
| GET | `/tenants/{id}/provisioning-status` | `admin.authority:50`+ | Read provisioning state |
| POST | `/tenants/{id}/provisioning-resume` | `admin.authority:60`+ | Resume pipeline |
| POST | `/tenants` | `admin.authority:60`–`69` (with max) | Create tenant (provisioning entry) |
| PATCH | `/tenants/{id}/status` | `admin.authority:60`+ | Status transitions |

Controllers: `TenantReadController::provisioningStatus`, `TenantWriteController::resumeProvisioning`, `store`, `updateStatus`, etc.

## Application layer (examples)

- `CreateTenantUseCase` — orchestrates registry + `TenantProvisioningService` (slug validation, persistence, events).
- `ProvisionTenantWithOnboardingUseCase` — wraps tenant creation with onboarding (owner user, etc.).
- `ProvisionTeacherTenantUseCase` — **teacher self-onboarding** (`teacher-signup` public flow) with its own validation and `provisioningSource` metadata.

There is **no** class named `ProvisionTenantJob` in the repository snapshot; async work may use other jobs or synchronous services—trace callers for the exact path.

## Central persistence

| Artifact | Notes |
|----------|--------|
| `tenants` | `2026_02_17_214641_create_tenants_table.php` — `slug`, `name`, `domain`, `status`, `db_dedicated`, `db_connection`, JSON `settings`, …; later migrations may add/rename columns (e.g. institution type, deployment tier) |
| `tenant_provisioning_runs` | `2026_03_23_120000_create_tenant_provisioning_runs_table.php` — `idempotency_key`, `tenant_id`, `status`, `current_step`, `steps`, payloads, retry metadata |

## Related public flows

- **Teacher signup** — `routes` under `public/teacher-signup` and `ProvisionTeacherTenantUseCase` tie paid/trial provisioning to signup state.

## Frontend

`frontend/config/api-endpoints.ts` — **`PLATFORM_TENANTS`**: `PROVISIONING_STATUS`, `PROVISIONING_RESUME`, etc.

---

## Linked references

- **Platform subscription / billing** — tenant’s contract with UBOTZ
- **Roles / users** — seeded tenant roles and owner user created during onboarding (see `CreateTenantUseCase` and tests)
