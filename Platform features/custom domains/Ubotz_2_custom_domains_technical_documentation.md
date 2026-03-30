# UBOTZ 2.0 — Custom Domain Management: Full Technical Specification

| Field | Value |
|---|---|
| **Document Type** | Principal Engineer — Technical Specification |
| **Feature** | Custom Domain Management |
| **Date** | 2026-03-27 |
| **Issued By** | Principal Engineer / Architecture Auditor |
| **Scope** | Full-stack: DB schema, domain layer, DNS infrastructure, domain events, lifecycle UseCases |
| **Status** | CURRENT — Reflects implemented codebase state (audited 2026-03-27) |

---

## 1. System Architecture Overview

```
HTTP Layer (Tenant Admin)
  → CustomDomainReadController (get current domain)
  → CustomDomainWriteController (add, verify, remove)

HTTP Layer (Platform Admin)
  → AdminCustomDomainReadController (global view of all custom domains)

Application Layer (Tenant)
  → CustomDomain/UseCases: AddCustomDomainUseCase, VerifyCustomDomainDnsUseCase, RemoveCustomDomainUseCase.

Domain Layer
  → TenantCustomDomain (Domain entity)
  → DomainStatus (Value object: 6 states)
  → DnsLookupServiceInterface (Interface for CNAME/TXT/A checks)

Infrastructure (Shared/Tenant DB)
  → TenantCustomDomainRecord (Eloquent) → tenant_custom_domains
  → EloquentCustomDomainRepository
  → PhpDnsLookupService (Uses php's dns_get_record)

Background Automation
  → VerifyCustomDomainDnsJob (Queued job for routine monitoring)
  → ProcessCustomDomainDeactivationListener (Listener for plan downgrades)

Public Routing Layer
  → PublicCustomDomainStatusController (unauthenticated, read-only, used by Caddy/reverse proxy)

Cache Layer
  → CustomDomainCacheService (Redis-backed, 5-min TTL, tenant-namespaced cache keys)
```

---

## 2. Database Schema (Tenant DB)

### 2.1 Table: `tenant_custom_domains`

| Column | Type | Notes |
|---|---|---|
| `id` | BIGINT (PK) | |
| `tenant_id` | BIGINT (FK) | Unique across platform (one per tenant). |
| `domain` | VARCHAR(255) | Normalized downcase (e.g., `academy.tenant.com`). |
| `status` | VARCHAR(30) | See Section 3.2 for states. |
| `verification_token` | VARCHAR(64) | 32-char hex string for TXT verification. |
| `cname_verified` | BOOLEAN | |
| `txt_verified` | BOOLEAN | |
| `a_record_verified` | BOOLEAN | (Optional/Reserved for A-record support). |
| `verification_deadline_at` | TIMESTAMP | CreatedAt + 72 hours. |
| `verified_at` | TIMESTAMP, Nullable | |
| `activated_at` | TIMESTAMP, Nullable | |
| `dns_failure_detected_at` | TIMESTAMP, Nullable | First detection of record loss. |
| `deactivated_at` | TIMESTAMP, Nullable | |
| `removed_at` | TIMESTAMP, Nullable | Timestamp of soft-delete. |
| `deactivation_reason` | VARCHAR(255) | `dns_verification_failed`, `plan_downgrade`. |
| `last_dns_check_at` | TIMESTAMP, Nullable | |
| `created_at` | TIMESTAMP | |
| `updated_at` | TIMESTAMP | Auto-managed by Eloquent. |

---

## 3. Domain Layer

### 3.1 `TenantCustomDomain` Entity

**Key Methods:**
- `create(tenantId, domain, actorId)`: Validates format, generates token, sets 72h deadline. Records `CustomDomainAdded`.
- `markDnsChecked(cnameOk, txtOk, aOk)`: Updates flags. If `cname` + `txt` both OK and status is `PENDING`, records `CustomDomainVerified`.
- `activate()`: Transitions to `ACTIVE`. Clears failures. Records `CustomDomainActivated`.
- `detectDnsFailure()`: Records `dnsFailureDetectedAt`. Records `CustomDomainDnsFailureDetected`.
- `deactivateDnsFailure()`: Transitions to `INACTIVE_DNS_FAILURE`. Records `CustomDomainDeactivated`.
- `deactivatePlanDowngrade()`: Transitions to `INACTIVE_PLAN_DOWNGRADE`. Records `CustomDomainDeactivated`.
- `reactivate()`: Transitions to `ACTIVE`. **Guard**: requires `cnameVerified && txtVerified` — throws `\DomainException` otherwise. Records `CustomDomainReactivated`.
- `markVerificationFailed()`: Transitions to `VERIFICATION_FAILED`. Records `CustomDomainVerificationFailed`.
- `remove(actorId)`: Transitions to `REMOVED`. Records `CustomDomainRemoved`.
- `setId(int $id)`: Called by repository after INSERT to stamp the generated PK. Immutable after first call.

---

### 3.2 `DomainStatus` (Value Object)

**Transition Matrix (`canTransitionTo()` — source of truth: `DomainStatus.php`):**

| From Status | Allowed → To Status |
|---|---|
| `PENDING_VERIFICATION` | `ACTIVE`, `VERIFICATION_FAILED`, `REMOVED`, `INACTIVE_PLAN_DOWNGRADE` |
| `ACTIVE` | `INACTIVE_DNS_FAILURE`, `INACTIVE_PLAN_DOWNGRADE`, `REMOVED` |
| `VERIFICATION_FAILED` | `ACTIVE` (re-verify), `REMOVED`, `INACTIVE_PLAN_DOWNGRADE` |
| `INACTIVE_DNS_FAILURE` | `ACTIVE` (recover), `REMOVED`, `INACTIVE_PLAN_DOWNGRADE` |
| `INACTIVE_PLAN_DOWNGRADE` | `ACTIVE` (upgrade + re-verify), `PENDING_VERIFICATION`, `REMOVED` |
| `REMOVED` | *(terminal — no transitions allowed)* |

> **Note:** Same-status self-transitions (`ACTIVE → ACTIVE`) are permitted by `canTransitionTo()` as no-ops. `REMOVED` is a hard terminal state — a removed domain cannot be re-added under the same record; a new record must be created.

---

## 4. DNS Infrastructure

### 4.1 `PhpDnsLookupService`
Uses PHP's native `dns_get_record()` to fetch:
- `DNS_CNAME`: Matches against the platform's CNAME proxy target.
- `DNS_TXT`: Searches for the `verification_token` within returned strings.
- `DNS_A`: (Reserved) Matches specific IP addresses.

### 4.2 Platform CNAME Target Config
The expected CNAME target is read from:
```php
Config::get('platform.custom_domain_cname_target', 'custom.ubotz.io')
```
Default fallback: **`custom.ubotz.io`**. This must be set in `config/platform.php` and `.env` for each environment.

### 4.3 `CustomDomainCacheService` (Redis)
Used by the Caddy reverse-proxy lookup path to avoid DB hits on every inbound HTTP request.

| Method | Behaviour |
|---|---|
| `isActiveDomain(domain, fallback)` | Returns cached tenant ID or calls `fallback()` (DB query), caches result for 300 s. |
| `cacheDomain(domain, tenantId)` | Writes `custom_domain:{domain}` → tenantId into Redis with 300 s TTL. |
| `invalidateDomain(domain)` | Deletes the cache key. Called on deactivation/removal events. |

**Cache key pattern:** `custom_domain:{domain}` (no tenant prefix — the domain itself is globally unique).
**Negative caching:** A DB miss is stored as value `0` for 60 s to prevent hammering.

---

## 5. Application Layer UseCases

### 5.1 `AddCustomDomainUseCase`
1. **Plan Guard**: Checks `subscription.plan_features['custom_domain']` → throws `CustomDomainNotAllowedException` if false.
2. **Tenant Limit Guard**: `findByTenantId()` — throws `DomainAlreadyExistsException` if tenant has active/pending domain.
3. **Global Unique Guard**: `isDomainAvailable()` — throws `DomainAlreadyClaimedException` (another tenant owns it) or `DomainCooldownException` (recently removed, cooldown active).
4. **Format Guard**: `TenantCustomDomain::create()` → throws `InvalidDomainException` for IPs, localhost, platform subdomains.
5. **Persist & Audit**: Saves entity, records `CustomDomain.Added` audit log, dispatches `CustomDomainAdded` event.

### 5.2 `VerifyCustomDomainDnsUseCase`
1. Fetch domain; throw `CustomDomainNotFoundException` if missing.
2. Reject if status is `REMOVED` (throws `\DomainException`).
3. Call `DnsLookupService` for CNAME (against `platform.custom_domain_cname_target`) and TXT (against token).
4. `markDnsChecked(cnameOk, txtOk, aOk)` — updates flags, fires `CustomDomainVerified` internally if both pass while `PENDING`.
5. **Transition logic:**
   - DNS OK + was `INACTIVE_DNS_FAILURE` → `reactivate()`
   - DNS OK + was `PENDING` or `VERIFICATION_FAILED` → `activate()`
   - DNS OK + was `ACTIVE` with a pending failure → `activate()` (clears failure)
   - DNS FAIL + was `ACTIVE` → `detectDnsFailure()`
   - DNS FAIL + was `PENDING` + deadline passed → `markVerificationFailed()`
6. Audit log: records `cname_ok`, `txt_ok`, `previous_status`, `new_status`.

### 5.3 `RemoveCustomDomainUseCase`
1. Fetch domain; throw `CustomDomainNotFoundException` if missing.
2. Call `domain->remove(actorId)` — transitions to `REMOVED`.
3. Persist, audit log `CustomDomain.Removed`, dispatch `CustomDomainRemoved` event.

---

## 6. Domain Events

| Event | Fired By |
|---|---|
| `CustomDomainAdded` | `AddCustomDomainUseCase` |
| `CustomDomainVerified` | `markDnsChecked()` (internal transition) |
| `CustomDomainActivated` | `activate()` |
| `CustomDomainDeactivated` | `deactivateDnsFailure()`, `deactivatePlanDowngrade()` |
| `CustomDomainDnsFailureDetected` | `detectDnsFailure()` |
| `CustomDomainRemoved` | `remove()` |
| `CustomDomainVerificationFailed` | `markVerificationFailed()` |
| `CustomDomainReactivated` | `reactivate()` |

---

## 7. Exception Catalogue

| Exception | Thrown By | HTTP Status |
|---|---|---|
| `CustomDomainNotFoundException` | `VerifyCustomDomainDnsUseCase`, `RemoveCustomDomainUseCase` | 404 |
| `CustomDomainNotAllowedException` | `AddCustomDomainUseCase` — plan guard | 403 |
| `DomainAlreadyExistsException` | `AddCustomDomainUseCase` — tenant limit guard | 409 |
| `DomainAlreadyClaimedException` | `AddCustomDomainUseCase` — global uniqueness guard | 409 |
| `DomainCooldownException` | `AddCustomDomainUseCase` — cooldown guard | 422 |
| `InvalidDomainException` | `TenantCustomDomain::create()` — format validation | 422 |
| `InvalidDomainStatusTransitionException` | `TenantCustomDomain::transitionTo()` — illegal state machine move | 500 (bug) |
| `ManualVerifyRateLimitException` | `VerifyCustomDomainDnsUseCase` — rate limit on tenant-triggered checks | 429 |

---

## 8. HTTP API Endpoints

### Tenant Admin (authenticated)
| Method | URL | Controller | Action |
|---|---|---|---|
| `GET` | `/api/tenant/custom-domain` | `CustomDomainReadController@show` | Fetch current domain record |
| `POST` | `/api/tenant/custom-domain` | `CustomDomainWriteController@store` | Add custom domain |
| `POST` | `/api/tenant/custom-domain/verify` | `CustomDomainWriteController@verify` | Trigger DNS verification |
| `DELETE` | `/api/tenant/custom-domain` | `CustomDomainWriteController@destroy` | Remove custom domain |

### Platform Super Admin (authenticated)
| Method | URL | Controller | Action |
|---|---|---|---|
| `GET` | `/api/platform/custom-domains` | `AdminCustomDomainReadController` | List all custom domains across all tenants |

### Public / Unauthenticated
| Method | URL | Controller | Action |
|---|---|---|---|
| `GET` | `/api/public/{tenantSlug}/custom-domain-status` | `PublicCustomDomainStatusController` | Returns `{custom_domain, active}` — used by Caddy/reverse proxy routing logic. No authentication required. |

---

## 9. Critical Test Scenarios

1. **Plan Access Control** — Tenant on "Basic" plan attempts to add domain → `CustomDomainNotAllowedException`.
2. **Verification Logic** — CNAME points to wrong target → Domain remains `PENDING_VERIFICATION`.
3. **Activation Success** — CNAME + TXT both match → Domain transitions to `ACTIVE`.
4. **Deadline Enforcement** — Domain added 73 hours ago without verification → Next verify attempt sets `VERIFICATION_FAILED`.
5. **DNS Failure Detection** — Active domain loses CNAME record → Background job fires `detectDnsFailure()`.
6. **Plan Downgrade Recovery** — Tenant upgrades back to a premium plan → Domain can be `reactivated()`.
7. **Collision Prevention** — Tenant B attempts to claim Tenant A's active domain → `DomainAlreadyClaimedException`.
8. **Format Guard** — Attempting to add `localhost` or `1.2.3.4` → `InvalidDomainException`.
9. **Cooldown Guard** — Tenant attempts to claim a recently removed domain → `DomainCooldownException`.
10. **Reactivation Guard** — `reactivate()` called without valid CNAME/TXT → `\DomainException`.
11. **Rate Limit** — Tenant triggers DNS verify too frequently → `ManualVerifyRateLimitException` (429).
12. **Cache Invalidation** — Domain deactivated/removed → `CustomDomainCacheService::invalidateDomain()` fires so Caddy stops routing within 60 s.

---

*End of Document — UBOTZ 2.0 Custom Domain Technical Specification — March 27, 2026*
