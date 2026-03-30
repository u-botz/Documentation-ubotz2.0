# UBOTZ 2.0 Custom Domain Technical Specification

Custom domains allow a tenant to map a **branded hostname** to the platform after **DNS verification**. Tenant-facing APIs live under `App\Http\Controllers\TenantAdminDashboard\CustomDomain`; application use cases under `App\Application\TenantAdminDashboard\CustomDomain`.

**Central DB:** `tenant_domain_mappings` defines a **unique** `domain` column (see central migration `2026_03_13_154701_create_tenant_domain_mappings_table.php`), but **no application services in `backend/app` currently read or write this model** (`TenantDomainMappingRecord` is unused). Treat it as **reserved / future ingress routing**, not as today’s enforcement of hostname ownership. **Authoritative verification state** for a tenant’s custom domain lives in **`tenant_custom_domains`** (tenant DB), described below.

---

## 1. HTTP surface (tenant API)

Routes: `backend/routes/tenant_dashboard/custom_domain.php` → **`/api/tenant/custom-domain`**.

| Method | Path | Capability | Notes |
|--------|------|------------|--------|
| `GET` | `/` | `custom_domain.view` | Current domain row (or `null`) |
| `POST` | `/` | `custom_domain.manage` | Register domain |
| `POST` | `/verify` | `custom_domain.manage` + `throttle:5,1` | Re-check DNS |
| `DELETE` | `/` | `custom_domain.manage` | Remove / soft-remove |

**Frontend:** `frontend/config/api-endpoints.ts` — `TENANT_CUSTOM_DOMAIN.BASE`, `VERIFY`.

---

## 2. Relational schema (tenant DB)

Migration: `2026_03_14_075524_create_tenant_custom_domains_table.php` — table **`tenant_custom_domains`**.

| Column | Role |
|--------|------|
| `tenant_id` | FK `fk_tcd_tenants` |
| `domain` | Hostname string |
| `status` | Default `pending_verification`; workflow in domain layer |
| `verification_token` | TXT challenge value |
| `cname_verified`, `txt_verified`, `a_record_verified` | Boolean checkpoints |
| `verification_deadline_at` | Cutoff for completing DNS |
| `verified_at`, `activated_at` | Lifecycle timestamps |
| `dns_failure_detected_at`, `deactivated_at`, `removed_at` | Failure / teardown |
| `deactivation_reason` | Short code/string |
| `last_dns_check_at` | Last automated or manual check |
| `domain_active_key` | **(Added in `2026_03_30_231500_add_domain_active_key_unique_to_tenant_custom_domains.php`.)** Stored generated column: equals `domain` when `removed_at IS NULL`, otherwise `NULL`. Used only to support a partial uniqueness rule at the DB layer (see below). Not application-managed. |

Indexes: `idx_tcd_status`, `idx_tcd_deadline`, `idx_tcd_dns_failure`, and **`UNIQUE(domain_active_key)`** (unique index name `tenant_custom_domains_domain_active_key_unique`).

### Invariants (application + DB)

- **At most one non-removed custom domain per tenant:** `CustomDomainRepositoryInterface::findByTenantId` returns the active row (`whereNull('removed_at')`); `AddCustomDomainUseCase` rejects if the tenant already has any such row.
- **Global hostname among “active” rows:** At most **one** row with `removed_at IS NULL` may use a given `domain` string (enforced by **`domain_active_key` + UNIQUE** — multiple soft-deleted rows may share the same historical `domain` because their `domain_active_key` is `NULL`, which does not collide under MySQL/SQLite unique semantics).
- **Cooldown on reuse:** `EloquentCustomDomainRepository::isDomainAvailable` blocks registering a hostname that was **removed within the last 24 hours** (application-only; not expressed as a CHECK constraint).
- **Races:** `AddCustomDomainUseCase` checks availability inside a transaction; concurrent requests can still pass the check until insert. **`UNIQUE(domain_active_key)`** is the final guard. On duplicate insert/update, `EloquentCustomDomainRepository::save` maps the driver’s unique-constraint error to **`DomainAlreadyClaimedException`**.

---

## 3. Workflows

### 3.1 Add domain

**`AddCustomDomainUseCase`** — creates row with token and deadlines (see use case for exact rules).

### 3.2 Verify DNS

**`VerifyCustomDomainDnsUseCase`** — `CustomDomainWriteController@verify` passes **`expectedCnameTarget`** from **`config('platform.custom_domain_cname_target', 'custom.ubotz.io')`**. Implementation uses DNS checks (see use case; not necessarily a job named `PerformDnsCheckJob`).

### 3.3 Remove

**`RemoveCustomDomainUseCase`** — `DELETE /api/tenant/custom-domain`; read controller filters **`whereNull('removed_at')`** for active display.

---

## 4. Public / ingress

Landing routes include **`GET /api/public/tenants/{tenantSlug}/website/custom-domain`** (see `backend/routes/api.php`) for frontend redirect / status checks — use that for public site configuration flows alongside tenant APIs.

---

## 5. Linked code references

| Layer | Path |
|-------|------|
| Application | `backend/app/Application/TenantAdminDashboard/CustomDomain/` |
| Domain | `backend/app/Domain/TenantAdminDashboard/CustomDomain/` |
| HTTP | `backend/app/Http/Controllers/TenantAdminDashboard/CustomDomain/` |
| Persistence | `backend/app/Infrastructure/Persistence/TenantAdminDashboard/CustomDomain/TenantCustomDomainRecord.php` |
| Routes | `backend/routes/tenant_dashboard/custom_domain.php` |

---

## 6. Document history

- Aligned capability names with **`custom_domain.view`** / **`custom_domain.manage`** (not generic “router” prose alone).
- Documented **`VerifyCustomDomainDnsUseCase`**, **config CNAME target**, and **tenant vs central** uniqueness caveat.
- Removed reliance on unverified cron/job class names unless present in repo.
- Documented **`domain_active_key`**, **UNIQUE** enforcement, **invariants**, **race backstop**, and clarified that **`tenant_domain_mappings` is not wired in application code** today.
