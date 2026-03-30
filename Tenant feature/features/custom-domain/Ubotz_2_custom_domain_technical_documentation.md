# UBOTZ 2.0 Custom Domain Technical Specification

Custom domains allow a tenant to map a **branded hostname** to the platform after **DNS verification**. Tenant-facing APIs live under `App\Http\Controllers\TenantAdminDashboard\CustomDomain`; application use cases under `App\Application\TenantAdminDashboard\CustomDomain`.

**Platform-wide routing** may also use central tables (e.g. **`tenant_domain_mappings`** with **unique** `domain` in the central DB) for ingress resolution — the tenant migration below stores **per-tenant** verification state in the **tenant** database.

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

Indexes: `idx_tcd_status`, `idx_tcd_deadline`, `idx_tcd_dns_failure`.

The migration does **not** add a **unique** index on `domain` at the DB level; global hostname uniqueness may be enforced in **application logic** and/or the **central** `tenant_domain_mappings` table — verify `AddCustomDomainUseCase` / repository before assuming DB-only uniqueness.

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
