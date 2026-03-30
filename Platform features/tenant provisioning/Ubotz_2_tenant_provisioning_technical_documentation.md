# UBOTZ 2.0 — Tenant Provisioning: Full Technical Specification

| Field | Value |
|---|---|
| **Document Type** | Principal Engineer — Technical Specification |
| **Feature** | Tenant Provisioning & Lifecycle Management |
| **Date** | 2026-03-27 |
| **Issued By** | Principal Engineer / Architecture Auditor |
| **Scope** | Full-stack design — DB schema, domain, application UseCases, infrastructure, HTTP layer |
| **Status** | CURRENT — Reflects implemented codebase state |

---

## 1. System Architecture Overview

```
HTTP Layer         →  TenantWriteController, TenantReadController
                   →  TenantHardDeletionController, TenantSuspensionController
Application Layer  →  ProvisionTenantWithOnboardingUseCase (master orchestrator)
                   →  CreateTenantUseCase, UpdateTenantStatusUseCase
                   →  RequestTenantSuspensionUseCase, ApproveTenantSuspensionUseCase
                   →  RequestTenantHardDeletionUseCase, ApproveTenantHardDeletionUseCase
                   →  ExecuteTenantHardDeletionUseCase
Domain Layer       →  TenantEntity, TenantStatus (Enum), TenantSlug, TenantListCriteria
                   →  TenantProvisioningServiceInterface, TenantDatabaseProvisionerInterface
Infrastructure     →  TenantRecord (Eloquent), TenantProvisioningRunRecord
                   →  EloquentTenantRepository, TenantProvisioningService
Events             →  TenantCreated, TenantActivated, TenantSuspended, TenantArchived
```

---

## 2. Database Schema (Central DB)

---

### 2.1 Table: `tenants`

**Migration:** `2026_02_17_214641_create_tenants_table.php` (and multiple additive migrations)

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | BIGINT (PK) | No | |
| `name` | VARCHAR(255) | No | Display name of the organization. |
| `slug` | VARCHAR(100), Unique | No | URL-safe identifier. Immutable after creation. |
| `status` | VARCHAR(30) | No | One of: `pending`, `pending_payment`, `pending_infra`, `active`, `suspended`, `archived`. |
| `contact_email` | VARCHAR(255) | Yes | Primary contact email. |
| `contact_phone` | VARCHAR(30) | Yes | Primary contact phone. |
| `settings` | JSON | Yes | Tenant-specific configuration map. |
| `provisioned_by` | BIGINT (FK `admins.id`) | Yes | Admin who provisioned this tenant. |
| `idempotency_key` | VARCHAR(100), Unique | Yes | Client-provided idempotency key prevents duplicate tenants on retry. |
| `deployment_tier` | VARCHAR(30) | No | `shared`, `dedicated`, `trial`, `lifetime`. |
| `country_code` | CHAR(2) | No | ISO 3166-1 alpha-2. Default `IN`. Added: `2026_03_27_000001`. |
| `default_currency` | CHAR(3) | No | ISO 4217 currency code (e.g., `INR`, `USD`). Derived from `country_code`. |
| `payment_gateway` | VARCHAR(30) | No | `razorpay`, `stripe`. Derived from `country_code`. |
| `provisioned_at` | TIMESTAMP | Yes | When the tenant was provisioned. |
| `suspended_at` | TIMESTAMP | Yes | When the tenant was most recently suspended. |
| `archived_at` | TIMESTAMP | Yes | When the tenant was archived. |
| `institution_type_id` | BIGINT (FK) | Yes | Added: `2026_03_19_150000`. |
| `created_at` | TIMESTAMP | No | |
| `updated_at` | TIMESTAMP | No | |

---

### 2.2 Table: `tenant_provisioning_runs`

**Migration:** `2026_03_23_120000_create_tenant_provisioning_runs_table.php`

Tracks every provisioning attempt and its progress. Used for observability, retries, and debugging.

| Column | Type | Notes |
|---|---|---|
| `id` | BIGINT (PK) | |
| `idempotency_key` | VARCHAR(100), Unique | Same key as `tenants.idempotency_key`. |
| `tenant_id` | BIGINT (FK) | Null until `tenant_created` step completes. |
| `status` | VARCHAR(30) | `in_progress`, `completed`, `failed`. |
| `current_step` | VARCHAR(100) | Name of the last completed step (e.g., `tenant_created`). |
| `steps` | JSON | Timestamped step log: `{ "tenant_created": "2026-03-27T05:00:00+05:30", ... }` |
| `request_payload` | JSON | Full serialized input (for resume-failed-run capability). |
| `last_error` | TEXT | Error message from last failed attempt. |
| `retry_count` | INT | Incremented each time the run is re-attempted. |
| `started_at` | TIMESTAMP | |
| `completed_at` | TIMESTAMP | |
| `failed_at` | TIMESTAMP | |
| `requested_by_admin_id` | BIGINT (FK → `admins.id`) | |
| `created_at` | TIMESTAMP | |
| `updated_at` | TIMESTAMP | |

**Step Names in Execution Order:**
`started` → `tenant_created` → `database_provisioned` → `subscription_assigned` (or `license_created`) → `tenant_activated_trial` (or `awaiting_payment`) → `owner_created` → `completed`

---

### 2.3 Table: `tenant_suspension_requests`

**Migration:** `2026_03_25_100000_create_tenant_suspension_requests_table.php`

| Column | Type | Notes |
|---|---|---|
| `id` | BIGINT (PK) | |
| `tenant_id` | BIGINT (FK) | |
| `requested_by` | BIGINT (FK → `admins.id`) | |
| `reason` | TEXT | Mandatory. |
| `status` | VARCHAR(30) | `pending`, `approved`, `rejected`. |
| `reviewed_by` | BIGINT (FK `admins.id`) | Null until reviewed. |
| `reviewed_at` | TIMESTAMP | |
| `created_at` | TIMESTAMP | |
| `updated_at` | TIMESTAMP | |

---

### 2.4 Table: `tenant_hard_deletion_requests`

**Migration:** `2026_03_24_120000_create_tenant_hard_deletion_requests_table.php`

| Column | Type | Notes |
|---|---|---|
| `id` | BIGINT (PK) | |
| `tenant_id` | BIGINT (FK) | |
| `requested_by` | BIGINT (FK → `admins.id`) | |
| `reason` | TEXT | Mandatory. |
| `status` | VARCHAR(30) | `pending`, `approved`, `rejected`, `executed`. |
| `reviewed_by` | BIGINT (FK `admins.id`) | |
| `reviewed_at` | TIMESTAMP | |
| `executed_by` | BIGINT (FK `admins.id`) | |
| `executed_at` | TIMESTAMP | |
| `created_at` | TIMESTAMP | |
| `updated_at` | TIMESTAMP | |

---

### 2.5 Table: `tenant_licenses`

**Migration:** `2026_03_23_141000_create_tenant_licenses_table.php`

For `LIFETIME` plan tenants — an alternative to subscriptions.

| Column | Type | Notes |
|---|---|---|
| `id` | BIGINT (PK) | |
| `tenant_id` | BIGINT (FK) | |
| `plan_id` | BIGINT (FK) | |
| `idempotency_key` | VARCHAR(100), Unique | Derived from provisioning key. |
| `status` | VARCHAR(30) | `pending_payment`, `active`, `revoked`. |
| `locked_price_cents` | BIGINT | Price at time of provisioning (locked, not affected by future plan price changes). |
| `currency` | CHAR(3) | |
| `features_snapshot` | JSON | Snapshot of the plan's feature set at time of license creation. |
| `created_at` | TIMESTAMP | |
| `updated_at` | TIMESTAMP | |

---

## 3. Domain Layer

### 3.1 `TenantEntity`

**File:** `App\Domain\SuperAdminDashboard\Tenant\Entities\TenantEntity`

Pure PHP entity. Zero Laravel dependencies. All status transitions enforced at domain level.

**Key Properties:**
- `id`: Null on creation, set by repository after persist.
- `status`: `TenantStatus` (mutable — set directly by lifecycle methods).
- `countryCode`: `CountryCode` VO — drives `defaultCurrency` and `paymentGateway`.
- `deploymentTier`: String — drives DB provisioning strategy.
- `idempotencyKey`: Immutable once set.

**Domain Methods:**

| Method | Invariant | Side Effect |
|---|---|---|
| `activate()` | Current status must allow transition to `ACTIVE`. | Sets `status = ACTIVE`. |
| `suspend()` | Current status must allow transition to `SUSPENDED`. | Sets `status = SUSPENDED`, `suspendedAt = now()`. |
| `restore()` | Current status must allow transition to `ACTIVE`. | Sets `status = ACTIVE`, `suspendedAt = null`. |
| `archive()` | Current status must allow transition to `ARCHIVED`. | Sets `status = ARCHIVED`, `archivedAt = now()`. |

All delegate to `transitionTo(TenantStatus $target)` which calls `TenantStatus::canTransitionTo()` and throws `InvalidTenantStatusTransitionException` on failure.

---

### 3.2 `TenantStatus` (Backed Enum)

**File:** `App\Domain\SuperAdminDashboard\Tenant\ValueObjects\TenantStatus`

```php
enum TenantStatus: string {
    case PENDING         = 'pending';
    case PENDING_PAYMENT = 'pending_payment';
    case PENDING_INFRA   = 'pending_infra';
    case ACTIVE          = 'active';
    case SUSPENDED       = 'suspended';
    case ARCHIVED        = 'archived';
}
```

**Key Methods:**
- `canTransitionTo(self $newStatus): bool` — The state machine rules table. Called before every mutation.
- `label(): string` — Human-readable label.
- `isOperational(): bool` — Returns `true` only for `ACTIVE`.

---

### 3.3 `TenantSlug` (Value Object)

**File:** `App\Domain\SuperAdminDashboard\Tenant\ValueObjects\TenantSlug`

Validates and normalises the tenant slug:
- Must match `^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$`.
- Reserved slugs (e.g., `api`, `admin`, `www`) are rejected.
- Lowercased and stripped of whitespace on construction.

---

### 3.4 `CountryCode` → `Currency` → `GatewayProvider` Chain (Value Objects)

**Files:** `App\Domain\Shared\ValueObjects\CountryCode`, `Currency`, `GatewayProvider`

When a tenant is created, the country code drives two business-critical defaults:

```php
// In TenantEntity::create()
$countryCode     = CountryCode::fromCode($countryCodeInput ?? 'IN');
$defaultCurrency = $countryCode->defaultCurrency();    // 'IN' → Currency::INR
$paymentGateway  = $countryCode->defaultGateway();     // 'IN' → GatewayProvider::RAZORPAY
```

**Current mappings (from source):**
| Country | Currency | Gateway |
|---|---|---|
| `IN` (India) | `INR` | `razorpay` |
| `US` (United States) | `USD` | `stripe` |
| `GB` (United Kingdom) | `GBP` | `stripe` |
| All others | `USD` | `stripe` (fallback) |

---

## 4. Application Layer — Use Cases

### 4.1 `ProvisionTenantWithOnboardingUseCase` (Master Orchestrator)

**File:** `App\Application\SuperAdminDashboard\Tenant\UseCases\ProvisionTenantWithOnboardingUseCase`

**Dependencies injected:**
- `CreateTenantUseCase`
- `AssignSubscriptionToTenantUseCase`
- `CreateTenantUserUseCase`
- `TenantDatabaseProvisionerInterface`
- `SubscriptionPlanRepositoryInterface`
- `TenantRepositoryInterface`

**Full execution sequence:**

```
Validate plan exists → Resolve deployment tier → Start/Reuse idempotency run
  ├─ Step 1: CreateTenantUseCase.handle() → TenantCreated event → default roles
  ├─ Step 2: TenantDatabaseProvisionerInterface.provision() → DB schema
  ├─ Step 3 (branch):
  │    LIFETIME → TenantLicenseRecord.updateOrCreate()
  │    OTHER    → AssignSubscriptionToTenantUseCase.execute()
  ├─ Step 4 (branch):
  │    TRIAL    → status = ACTIVE
  │    OTHER    → status = PENDING_PAYMENT
  ├─ Step 5: TenantRepository.save(tenant)
  ├─ Step 6: CreateTenantUserUseCase.execute(role='owner')
  └─ Mark run completed → Return ProvisionTenantOnboardingResult
```

**Idempotency subscription key derivation:**
```php
substr(hash('sha256', $clientKey . ':subscription'), 0, 100)
```

---

### 4.2 `CreateTenantUseCase`

**File:** `App\Application\SuperAdminDashboard\Tenant\UseCases\CreateTenantUseCase`

1. Validate slug uniqueness (throws `DuplicateTenantSlugException` on collision — also handles idempotent return if same `idempotency_key`).
2. Construct `TenantEntity::create()`.
3. Persist via `TenantRepositoryInterface::save()`.
4. Dispatch `TenantCreated` event (after DB commit).
5. Returns `CreateTenantResult` with `wasIdempotentReturn: bool`.

---

### 4.3 `UpdateTenantStatusUseCase`

**File:** `App\Application\SuperAdminDashboard\Tenant\UseCases\UpdateTenantStatusUseCase`

**Execution pattern:**
1. Open DB transaction with `SELECT ... FOR UPDATE` (pessimistic lock).
2. Load `TenantEntity` via `findByIdForUpdate()`.
3. Call domain method (`activate()` / `suspend()` / `archive()`).
4. Persist via `TenantRepositoryInterface::save()`.
5. **Flush Redis cache:** `Cache::forget("tenant:{$tenantId}:status")`.
6. Audit log with `old_values` and `new_values`.
7. After commit → dispatch domain event (`TenantActivated`, `TenantSuspended`, `TenantArchived`).

> **Note:** Cannot be called with `PENDING`, `PENDING_PAYMENT`, or `PENDING_INFRA` as target — these are infrastructure-only states. Throws a descriptive exception.

---

### 4.4 Suspension Workflow UseCases

| UseCase | Actor | Guards | Result |
|---|---|---|---|
| `RequestTenantSuspensionUseCase` | L4+ | Tenant must be active. No pending request. | Creates pending suspension request. |
| `ApproveTenantSuspensionUseCase` | L2+ | Request must be pending. | Calls `UpdateTenantStatusUseCase(SUSPENDED)`. |
| `RejectTenantSuspensionUseCase` | L2+ | Request must be pending. | Marks request `rejected`. Tenant unchanged. |

---

### 4.5 Hard Deletion Workflow UseCases

| UseCase | Actor | Guards | Result |
|---|---|---|---|
| `RequestTenantHardDeletionUseCase` | L4+ | Tenant must be `SUSPENDED`. No open request. | Creates pending hard deletion request. |
| `ApproveTenantHardDeletionUseCase` | L2+ | Request must be `pending`. | Marks request `approved`. |
| `RejectTenantHardDeletionUseCase` | L2+ | Request must be `pending`. | Marks request `rejected`. |
| `ExecuteTenantHardDeletionUseCase` | L2+ | Request must be `approved`. | Irreversible: Drops DB, purges storage, deletes/archives tenant record. |

---

## 5. Domain Events

| Event | File | Payload | Typical Listener |
|---|---|---|---|
| `TenantCreated` | `...Tenant/Events/TenantCreated` | `tenantId`, `slug`, `name`, `contactEmail`, `provisionedBy` | `GrantDefaultModulesOnProvisioningListener` — unconditionally grants 5 module overrides (`module.lms`, `module.website`, `module.crm`, `module.exams`, `module.erp.timetable`) for all plan tiers. Also fires `ProvisionDefaultRolesListener` (default roles/capabilities) and notification listeners. |
| `TenantActivated` | `...Tenant/Events/TenantActivated` | `tenantId`, `actorId` | Send welcome email, unlock billing. |
| `TenantSuspended` | `...Tenant/Events/TenantSuspended` | `tenantId`, `suspendedBy`, `reason`, `timestamp` | `NotifyTenantSuspendedListener` — email + in-app to tenant **owner** users (see `TenantOwnerRecipientResolver`). |
| `SubscriptionSuspended` | `...Subscription/Events/SubscriptionSuspended` | `tenantId`, `subscriptionId`, `planId`, `reason`, `suspendedAt` | `NotifySubscriptionSuspendedListener` — billing notification to owners when subscription is suspended (e.g. past-due grace expiry). |
| `TenantArchived` | `...Tenant/Events/TenantArchived` | `tenantId`, `actorId` | Begin data retention countdown. |

> **Module grant design note:** The 5 default module grants are applied identically to every tenant regardless of plan tier. This is by current design — `TenantCreated` does not carry plan/tier data, so tier-based branching is not possible in this listener without a structural change. If plan-tier-specific module sets are required (Open Question #5 in business findings), `planId` must be added to `TenantCreated` and the listener updated.

**Dispatch pattern:** All events dispatched via `DB::afterCommit()` to guarantee events only fire on committed transactions.

---

## 6. HTTP Layer

### 6.1 Routes

| Method | URI | UseCase | Min Auth |
|---|---|---|---|
| POST | `/tenants/provision` | `ProvisionTenantWithOnboardingUseCase` | L4 |
| GET | `/tenants` | `ListTenantsQuery` | L4 |
| GET | `/tenants/{id}` | `GetTenantQuery` | L4 |
| PUT | `/tenants/{id}/status` | `UpdateTenantStatusUseCase` | L4 |
| POST | `/tenants/{id}/suspend/request` | `RequestTenantSuspensionUseCase` | L4 |
| POST | `/tenants/{id}/suspend/approve` | `ApproveTenantSuspensionUseCase` | L2 |
| POST | `/tenants/{id}/suspend/reject` | `RejectTenantSuspensionUseCase` | L2 |
| POST | `/tenants/{id}/hard-delete/request` | `RequestTenantHardDeletionUseCase` | L4 |
| POST | `/tenants/{id}/hard-delete/approve` | `ApproveTenantHardDeletionUseCase` | L2 |
| POST | `/tenants/{id}/hard-delete/reject` | `RejectTenantHardDeletionUseCase` | L2 |
| POST | `/tenants/{id}/hard-delete/execute` | `ExecuteTenantHardDeletionUseCase` | L2 |
| POST | `/tenants/{id}/resume-failed-run` | `resumeLatestFailedRun()` | L4 |

### 6.2 Required Headers

- `X-Idempotency-Key: {uuid}` — **Required** for all provisionng, subscription, and status-mutation endpoints.

---

## 7. Infrastructure

### 7.1 `TenantDatabaseProvisionerInterface`

**Contract:** `App\Domain\SuperAdminDashboard\Tenant\Services\TenantDatabaseProvisionerInterface`
**Implementation:** `App\Infrastructure\SuperAdminDashboard\Tenant\Services\TenantProvisioningService`

```php
public function provision(int $tenantId, string $slug, bool $isDedicated): array;
```

Returns `['strategy' => 'shared|dedicated', 'db_connection' => '...']` — this metadata is stored in the provisioning run `steps` JSON.

**Strategies:**
- `DEDICATED` plan tier → dedicated DB connection: creates a new MySQL schema named after the tenant slug.
- All others → shared schema with row-level tenant isolation.

---

### 7.2 `TenantRecord` (Eloquent Model)

**File:** `App\Infrastructure\Persistence\Shared\TenantRecord`

Key characteristics:
- Soft-deletes enabled (uses `SoftDeletes`).
- `settings` cast to `array`.
- No `organization_id` — this is a central/landlord table.

---

## 8. Caching Strategy

| Cache Key | Value | Invalidated When |
|---|---|---|
| `tenant:{id}:status` | Current status string | `UpdateTenantStatusUseCase` always flushes on status change. |
| `tenant:{slug}:config` | Full tenant config array | On settings update. |

**Critical:** Middleware reads `tenant:{id}:status` from Redis to determine if a tenant's users should be allowed in. If the cache is stale after suspension, users may still access the platform for up to cache TTL. `UpdateTenantStatusUseCase` ensures this key is always flushed synchronously before the response is returned.

---

## 9. Exceptions Reference

| Exception | File | When Thrown |
|---|---|---|
| `TenantNotFoundException` | `...Tenant/Exceptions` | Tenant ID not found in repository. |
| `InvalidTenantStatusTransitionException` | `...Tenant/Exceptions` | Status transition not in `canTransitionTo()` allowlist. |
| `DuplicateTenantProvisioningException` | `...Tenant/Exceptions` | Slug collision without matching idempotency key. |
| `TenantSuspensionNotAllowedException` | `...Tenant/Exceptions` | Tenant status doesn't allow suspension request. |
| `TenantSuspensionConflictException` | `...Tenant/Exceptions` | A pending suspension request already exists for this tenant. |
| `TenantHardDeletionNotAllowedException` | `...Tenant/Exceptions` | Tenant not in `SUSPENDED` state. |
| `TenantHardDeletionConflictException` | `...Tenant/Exceptions` | An open hard deletion request already exists. |

---

## 10. Testing Notes

### Critical Test Scenarios

1. **Idempotency** — Calling provision twice with the same key returns the same tenant, not a duplicate.
2. **TRIAL plan → ACTIVE immediately** — No `PENDING_PAYMENT` state.
3. **LIFETIME plan → TenantLicense created, not Subscription**.
4. **Resume failed run** — After step 2 fails, resume continues from `database_provisioned`.
5. **Suspension requires ACTIVE status** — Suspending a `pending_payment` tenant should fail.
6. **Hard deletion requires SUSPENDED** — Cannot request hard deletion on an active tenant.
7. **Status transition to `PENDING_*` via API throws exception**.
8. **Cache flushed on status change** — `tenant:{id}:status` must not exist after suspend/activate.
9. **Domain event fires after commit** — `TenantSuspended` listener must not execute if the transaction rolls back.

---

*End of Document — UBOTZ 2.0 Tenant Provisioning Full Technical Specification — March 27, 2026*
