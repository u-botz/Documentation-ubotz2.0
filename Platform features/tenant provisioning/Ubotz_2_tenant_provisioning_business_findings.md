# UBOTZ 2.0 — Tenant Provisioning: Business Findings & Design

| Field | Value |
|---|---|
| **Document Type** | Principal Engineer — Business Logic Audit |
| **Feature** | Tenant Provisioning & Lifecycle Management |
| **Date** | 2026-03-27 |
| **Issued By** | Principal Engineer / Architecture Auditor |
| **Scope** | Tenant creation, onboarding, status management, suspension, hard deletion |
| **Status** | REVIEWED — Reflects current implemented state |

---

## 1. Executive Summary

Tenant Provisioning is the foundational operation of the UBOTZ 2.0 platform. Every paying customer of the platform is a "tenant" — an isolated educational organization with its own database, users, subscriptions, and configuration.

### 1.1 Background — Historical Design Flaw (Phase 12A BR-06)

A previous version of this system introduced a `skip_payment` boolean flag, allowing any L4+ Super Admin to provision a tenant on a paid subscription plan and bypass payment entirely. This flag had three critical deficiencies:

| # | Problem | Business Impact |
|---|---|---|
| 1 | **No authority gating** — Any L4+ admin could set `skip_payment: true`. | Junior admins could give away paid plans for free. |
| 2 | **No payment proof** — No record of how payment was received (bank transfer, UPI, cash). | Financial reconciliation was impossible. Revenue reports were inaccurate. |
| 3 | **No state distinction** — Platform could not distinguish a legitimately paid tenant from a skipped one. | Audit trail gaps; billing disputes unresolvable. |

**This flaw has been fully remediated.** The current system enforces plan-tier-based provisioning paths with no `skip_payment` bypass. All activation is gated by the plan tier at the domain level. This document reflects the corrected current state.

### 1.2 Current System

The provisioning system now orchestrates four coordinated steps:
1. **Tenant Record Creation** — Identity record in the central DB with full audit trail.
2. **Database Infrastructure Provisioning** — A dedicated or shared tenant DB schema.
3. **Subscription Assignment** — Binding the tenant to a subscription plan with idempotent key.
4. **Initial Owner Creation** — First admin user for the tenant with `owner` role.

Beyond initial provisioning, the system manages the complete tenant lifecycle through a strict state machine with approval workflows for both suspension and permanent deletion.

---

## 2. Tenant Lifecycle — Status State Machine

Every tenant exists in exactly one of 6 states at any given time:

| Status | DB Value | Meaning |
|---|---|---|
| `PENDING` | `pending` | Tenant record created; provisioning not yet initiated. |
| `PENDING_PAYMENT` | `pending_payment` | Infrastructure provisioned; waiting for first invoice payment (non-trial plans). |
| `PENDING_INFRA` | `pending_infra` | Subscription assigned; waiting for DB infrastructure setup to complete. |
| `ACTIVE` | `active` | Fully operational. Users can log in and access all plan features. |
| `SUSPENDED` | `suspended` | Access blocked. All data preserved. Can be restored or permanently deleted. |
| `ARCHIVED` | `archived` | Permanent, irreversible terminal state. No transitions possible. |

### 2.1 Allowed Transitions (State Machine Rules)

| From | Allowed → To | Real-World Trigger |
|---|---|---|
| `pending` | `active`, `pending_payment` | Provisioning completes (trial → active; paid → pending_payment). |
| `pending_payment` | `active`, `pending_infra`, `suspended` | Payment received / infra delay / early suspension. |
| `pending_infra` | `active`, `suspended` | Infrastructure setup complete / early intervention. |
| `active` | `suspended`, `archived` | Admin initiates suspension or archival workflow. |
| `suspended` | `active`, `archived` | Admin restores tenant or approves hard deletion. |
| `archived` | ❌ **NONE** | Terminal — no recovery or transition possible. |

> **Critical Business Rule:** Admins **cannot manually set a tenant to any `PENDING_*` state** via the API. These states are system-only infrastructure states managed by the provisioning pipeline. Any attempt throws `InvalidTenantStatusTransitionException`.

---

## 3. Provisioning Workflow — Step-by-Step

The `ProvisionTenantWithOnboardingUseCase` is the master orchestrator, coordinating across four bounded contexts: Tenant, Subscription, Database Infrastructure, and User Management.

### 3.1 Pre-flight Checks

Before any provisioning steps begin:
- **Plan exists:** The `planId` must resolve to a valid `SubscriptionPlan`. Fails fast with `InvalidArgumentException`.
- **Deployment tier resolved:** The plan's tier (`TRIAL`, `LIFETIME`, `DEDICATED`, `SHARED`) drives the entire flow.
- **Idempotency key required:** `X-Idempotency-Key` header must be present. Provisioning will refuse to run without it.

### 3.2 Plan Tier — Business Branching

| Plan Tier | What Happens to Subscription | What Tenant Activation Looks Like |
|---|---|---|
| `TRIAL` | Standard subscription record created. | Status → `ACTIVE` immediately. No payment needed. |
| `LIFETIME` | A `TenantLicenseRecord` is created (not a subscription). Price is locked at provisioning time. | Status → `PENDING_PAYMENT`. |
| `DEDICATED` / `SHARED` (recurring) | Standard subscription record created. | Status → `PENDING_PAYMENT`. |

For paid onboarding, first-payment grace enforcement is now automated via scheduled billing command `billing:suspend-pending-payment`. Any tenant/subscription that remains in `PENDING_PAYMENT` past `billing.initial_payment_grace_period_days` is system-suspended.

> **Why LIFETIME uses a license instead of a subscription:** Lifetime plans have a single one-time charge. Modeling this as a recurring subscription (with billing cycles) would be incorrect. A separate `TenantLicenseRecord` stores the locked price and `features_snapshot` at provisioning time, ensuring the tenant's feature entitlements cannot change due to future plan price edits.

### 3.3 Automated Post-Provisioning Actions (on `TenantCreated` Event)

When a tenant is created, the `TenantCreated` domain event fires (after DB commit). The `GrantDefaultModulesOnProvisioningListener` automatically:

1. **Grants 5 default module overrides** to the new tenant:

| Module | Code | Reason |
|---|---|---|
| Core LMS | `module.lms` | Platform foundation — every tenant must have this. |
| Public Website | `module.website` | Required so public-facing tenant pages resolve immediately. |
| CRM / Lead Management | `module.crm` | Lead capture is available from day one. |
| Exams | `module.exams` | Exam module unlocked by default. |
| ERP Timetable | `module.erp.timetable` | Timetable management available by default. |

> **Why this listener exists:** Without these grants, a newly provisioned tenant's public website (`/api/public/tenants/{slug}/website/theme`) returns `403 Forbidden`. This was a production bug affecting every new tenant before this listener was introduced.
>
> **Design constraint:** `module.lms` and `module.website` are functionally mandatory — omitting them causes `403 Forbidden` errors on public tenant pages and breaks the core platform. `module.crm`, `module.exams`, and `module.erp.timetable` are granted by current default but could be made tier-configurable. Any plan-tier-specific module set implementation requires passing `planId` through `TenantCreated`.

2. **Bootstraps default website settings** so `has_template = true` immediately — preventing the "no template found" error on a fresh tenant login.

---

## 4. Ordered Execution Steps (with Full Observability)

Each step is timestamped (ISO 8601) in the `tenant_provisioning_runs.steps` JSON column:

| # | Step Key | Action | Who Does It |
|---|---|---|---|
| 1 | `tenant_created` | Creates tenant record in `tenants` table. Fires `TenantCreated` → grants default modules. | `CreateTenantUseCase` |
| 2 | `database_provisioned` | Provisions tenant DB schema (dedicated) or marks connection (shared). | `TenantDatabaseProvisionerInterface` |
| 3 | `subscription_assigned` OR `license_created` | Plan-tier branching — subscription or lifetime license. | `AssignSubscriptionToTenantUseCase` or direct `TenantLicenseRecord::updateOrCreate()` |
| 4 | `tenant_activated_trial` OR `awaiting_payment` | Status set to `ACTIVE` (trial) or `PENDING_PAYMENT` (paid). | `ProvisionTenantWithOnboardingUseCase` |
| 5 | `owner_created` | Creates the initial `owner`-role user in the tenant's DB. | `CreateTenantUserUseCase` |
| 6 | `completed` | Run marked as `completed` with timestamp. | `ProvisionTenantWithOnboardingUseCase` |

If **any step fails**, the run is marked `failed` with `last_error` recorded. The entire run can be resumed via `resumeLatestFailedRun()`.

---

## 5. Idempotency & Resumability

### 5.1 Idempotency Key (Required)

The calling admin must supply `X-Idempotency-Key` (client UUID). The system:
- Checks if `tenant.idempotency_key` already exists → returns existing tenant without re-provisioning.
- Derives a subscription-specific key: `sha256(clientKey + ":subscription")[0:100]` — preventing a duplicate subscription even if the provisioning request is retried.

### 5.2 Re-entrant Provisioning Runs

When a provisioning call arrives with a key that matches an existing `TenantProvisioningRunRecord`:
- Increments `retry_count`.
- Resets `status = in_progress` and clears `last_error`.
- Re-runs all steps (each step uses `updateOrCreate` / idempotent semantics — safe to repeat).

### 5.3 Resume Failed Runs

`resumeLatestFailedRun(tenantId, actorId)`:
- Loads the failed run's `request_payload` JSON.
- Reconstructs `CreateTenantCommand` and `ProvisionOnboardingInput` from stored data.
- Calls `handle()` with the **same idempotency key** — so previously completed steps are no-ops.

---

## 6. Tenant Slug Rules

The tenant slug is a globally unique, URL-safe identifier:
- **Format:** `^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$`
- **Reserved slugs** (e.g., `api`, `admin`, `www`) are rejected at domain level.
- **Immutable:** Once set, the slug cannot be changed. It is embedded in API routes, DB connections, and file storage paths.
- **Idempotency link:** `CreateTenantUseCase` validates slug uniqueness via `TenantProvisioningService::validateSlugForProvisioning()`. If a collision is found without a matching idempotency key, throws `TenantSlugAlreadyExistsException`.

---

## 7. Tenant Suspension Workflow (Two-Step Approval)

Suspension is never a direct admin action — it always goes through a request-approval flow.

### Step 1 — Request (`RequestTenantSuspensionUseCase`)
**Who:** L4 Super Admin or above.
**Guards:**
- Tenant status must allow transition to `SUSPENDED` (e.g., `ACTIVE` → allowed; `ARCHIVED` → blocked).
- No pending suspension request must already exist (`TenantSuspensionConflictException` if so).
- **Reason is mandatory** — stored in both the request record and the audit log.

**What gets created:** A `tenant_suspension_requests` record with `status = pending`.
**Audit action logged:** `tenant.suspension.requested`.

### Step 2A — Approve (`ApproveTenantSuspensionUseCase`)
**Who:** L2 Root Approver or above.
- Approves the pending request.
- Invokes `UpdateTenantStatusUseCase` → tenant → `SUSPENDED`.
- Flushes `tenant:{id}:status` from Redis cache.
- Fires `TenantSuspended` domain event after DB commit.
- `NotifyTenantSuspendedListener` dispatches email + in-app notifications to all **tenant owner** users (role code `owner`), with fallback to `provisioned_by` / system user `1` if needed.

### Automated billing suspensions (non-manual)
- **Past-due subscription** (`billing:suspend-past-due`): `SubscriptionSuspended` → `NotifySubscriptionSuspendedListener` (billing category) to owners.
- **Stale first payment** (`billing:suspend-pending-payment`): subscription suspended, tenant set to `SUSPENDED`, then `TenantSuspended` after commit → `NotifyTenantSuspendedListener`.
- **Trial expiry** (`subscription:expire-trials`): tenant is suspended; owners are notified via `SubscriptionTrialExpired` (trial template) — **not** a second `TenantSuspended` email in the same run.

### Step 2B — Reject (`RejectTenantSuspensionUseCase`)
**Who:** L2+.
- Marks request `rejected`. Tenant status unchanged. No event fired.

---

## 8. Tenant Hard Deletion Workflow (Three-Step, Irreversible)

Hard deletion permanently destroys all tenant data. It requires the tenant to first be `SUSPENDED` — an active tenant cannot be jump-deleted.

### Step 1 — Request (`RequestTenantHardDeletionUseCase`)
**Who:** L4+.
**Guards:**
- Tenant MUST be in `SUSPENDED` status. (`TenantHardDeletionNotAllowedException` otherwise.)
- No open hard deletion request must already exist. (`TenantHardDeletionConflictException` if so.)
**Audit action:** `tenant.hard_delete.requested`.

### Step 2 — Approve (`ApproveTenantHardDeletionUseCase`)
**Who:** L2+.
- Request must be `pending`. Marks it `approved`.
**Audit action:** `tenant.hard_delete.approved`.

### Step 3 — Execute (`ExecuteTenantHardDeletionUseCase`)
**Who:** L2+.
**This step is irreversible.** Additional safeguard:
- **Slug confirmation challenge:** The caller must supply the tenant's exact slug as a confirmation string. Mismatches throw `TenantHardDeletionNotAllowedException::confirmationMismatch()`.
- **Pessimistic lock:** The approved request is locked (`SELECT FOR UPDATE`) before execution.
- **Execution cascade:**
  1. `TenantScopedDataPurgeService::purge($tenantId)` — purges all tenant-scoped data (subscriptions, users, uploads, etc.).
  2. `hardDeletionRequestRepository->markExecuted()` — marks the request `executed`.
  3. `Cache::forget("tenant:{$tenantId}:status")` and `Cache::forget("tenant_resolution:{$slug}")` — double cache flush.
  4. `TenantRecord::withTrashed()->whereKey($tenantId)->forceDelete()` — hard deletes the tenant record (bypassing soft-delete).
**Audit action:** `tenant.hard_delete.executed`.

---

## 9. Country / Currency / Gateway Derivation

When a tenant is created, the `country_code` drives two business-critical system defaults set at the domain entity level:

| Country Code | Default Currency | Default Payment Gateway |
|---|---|---|
| `IN` (India) | `INR` | `razorpay` |
| `US` (United States) | `USD` | `stripe` |
| `GB` (United Kingdom) | `GBP` | `stripe` |
| All others (fallback) | `USD` | `stripe` |

**Why at domain level, not config:** The `TenantEntity::create()` factory derives these via `CountryCode::defaultCurrency()` and `CountryCode::defaultGateway()`. This means the rule is enforced regardless of how a tenant is created — API, seeder, test, or CLI.

---

## 10. Business Rules — Complete Reference

| ID | Rule | Where Enforced |
|---|---|---|
| BR-PROV-01 | All provisioning requests MUST include `X-Idempotency-Key`. | `ProvisionTenantWithOnboardingUseCase::startOrReuseRun()`. |
| BR-PROV-02 | Trial plan tenants activate immediately — no payment required. | Tier branching in `ProvisionTenantWithOnboardingUseCase`. |
| BR-PROV-03 | Lifetime plan tenants get a `TenantLicenseRecord`, not a subscription. | Tier branching; `TenantLicenseRecord::updateOrCreate()`. |
| BR-PROV-04 | Tenant slug must be unique, lowercase, URL-safe, and is immutable after creation. | `TenantSlug` VO; `TenantProvisioningService::validateSlugForProvisioning()`. |
| BR-PROV-05 | No admin can manually set a tenant to any `PENDING_*` state via API. | `UpdateTenantStatusUseCase` explicit match block. |
| BR-PROV-06 | `ARCHIVED` is a terminal state — no further transitions possible. | `TenantStatus::canTransitionTo()`. |
| BR-PROV-07 | Hard deletion requires tenant to be `SUSPENDED` first. | `RequestTenantHardDeletionUseCase`, `ExecuteTenantHardDeletionUseCase`. |
| BR-PROV-08 | Hard deletion execution requires the caller to confirm by providing the exact tenant slug. | `ExecuteTenantHardDeletionUseCase::confirmationSlug` check. |
| BR-PROV-09 | A pending suspension or deletion request blocks duplicate requests for the same tenant. | `existsPendingRequestForTenant()` / `existsOpenRequestForTenant()`. |
| BR-PROV-10 | All status transitions are audit-logged with `old_values` and `new_values`. | `UpdateTenantStatusUseCase` + `AdminAuditLogger`. |
| BR-PROV-11 | Tenant Redis cache (`tenant:{id}:status`, `tenant_resolution:{slug}`) is flushed on every status change and hard deletion. | `UpdateTenantStatusUseCase` + `ExecuteTenantHardDeletionUseCase`. |
| BR-PROV-12 | Domain events are dispatched only after DB commit — never inside a transaction. | `DB::afterCommit()` in `CreateTenantUseCase`, `UpdateTenantStatusUseCase`. |
| BR-PROV-13 | Every new tenant is unconditionally granted 5 module overrides (`module.lms`, `module.website`, `module.crm`, `module.exams`, `module.erp.timetable`) and default website settings, regardless of plan tier. `module.lms` and `module.website` are functionally mandatory. | `GrantDefaultModulesOnProvisioningListener` on `TenantCreated`; `DEFAULT_MODULES` constant in that class. |
| BR-PROV-14 | Country code at creation time determines the tenant's default currency and payment gateway permanently. | `TenantEntity::create()` → `CountryCode::defaultCurrency/Gateway()`. |
| BR-PROV-15 | First-payment timeout for `PENDING_PAYMENT` is system-enforced by scheduler. | `billing:suspend-pending-payment` + `SuspendPendingPaymentUseCase`; grace key `billing.initial_payment_grace_period_days`. |
| BR-PROV-16 | Recurring delinquency is system-enforced in two phases (`ACTIVE` → `PAST_DUE` → `SUSPENDED`). | `billing:transition-past-due`, `billing:suspend-past-due` + corresponding use cases. |
| BR-PROV-17 | Tenant suspension notifies workspace owners (tenant role `owner`), with fallback to `provisioned_by` then system user `1` if no owner user exists. | `TenantOwnerRecipientResolver` + `NotifyTenantSuspendedListener` / `NotifySubscriptionSuspendedListener`. |
| BR-PROV-18 | Trial expiry notifies owners via `SubscriptionTrialExpired` only (no duplicate `TenantSuspended` email for the same run). | `NotifyTrialExpiredListener` + `ExpireTrialsUseCase`. |

---

## 11. Open Questions for Product Owner

| # | Question | Impact |
|---|---|---|
| 1 | Should suspension notification copy be customized per suspension reason (manual vs billing vs first-payment timeout)? | Owners are notified; copy is shared templates today (`tenant_status_changed` / `subscription_suspended`). |
| 2 | Is the default `billing.initial_payment_grace_period_days` value (currently 7) correct for all plan tiers/countries? | Enforcement exists; this is now a product-policy tuning question, not an implementation gap. |
| 3 | Should Lifetime plan tenants require manual L2 approval before the `TenantLicense` is activated? | Currently license is created immediately on provisioning. |
| 4 | Should `resumeLatestFailedRun` be exposed as a platform API or only via CLI by platform engineers? | Self-service recovery vs. operator-controlled remediation. |
| 5 | Should non-mandatory default modules (`module.crm`, `module.exams`, `module.erp.timetable`) be configurable per plan tier? | `module.lms` and `module.website` are functionally mandatory and must always be granted. Implementing tier-specific grants requires adding `planId` to `TenantCreated` and updating `GrantDefaultModulesOnProvisioningListener`. |

---

*End of Document — UBOTZ 2.0 Tenant Provisioning Business Findings — March 27, 2026*
