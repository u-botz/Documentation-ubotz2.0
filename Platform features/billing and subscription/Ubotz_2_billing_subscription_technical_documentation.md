# UBOTZ 2.0 — Billing & Subscription: Full Technical Specification

| Field | Value |
|---|---|
| **Document Type** | Principal Engineer — Technical Specification |
| **Feature** | Billing & Subscription Management |
| **Date** | 2026-03-27 |
| **Issued By** | Principal Engineer / Architecture Auditor |
| **Scope** | Full-stack: DB schema, domain layer, application UseCases, infrastructure, HTTP layer, scheduled automation |
| **Status** | CURRENT — Reflects implemented codebase state |

---

## 1. System Architecture Overview

```
HTTP Layer          → SubscriptionPlanController, TenantSubscriptionController
                    → WebhookController (Razorpay + Stripe)
                    → BillingProfileController, InvoiceController
Application Layer   → SubscriptionPlan UseCases (CreatePlan, ApprovePlan, RejectPlan, ArchivePlan, etc.)
                    → AssignSubscriptionToTenantUseCase
                    → ChangeTenantPlanUseCase
                    → ActivateSubscriptionOnPaymentUseCase
                    → ProcessWebhookUseCase (Razorpay)
                    → ProcessStripeWebhookUseCase
                    → RetryPaymentUseCase, RetryRenewalPaymentsUseCase
                    → ExpireTrialsUseCase, TransitionPastDueUseCase
                    → SuspendPastDueUseCase, GenerateRenewalOrdersUseCase
                    → CheckOverageResolutionUseCase, EnforceOverageDeactivationUseCase
                    → CancelSubscriptionUseCase, ReactivateSubscriptionUseCase
Domain Layer        → SubscriptionPlanEntity, TenantSubscriptionEntity
                    → OverageRecordEntity, ModuleEntitlementOverrideEntity
                    → SubscriptionStatus, PlanStatus, PlanTier, PlanFeatures
                    → ModuleCode, ModuleEntitlementSet, BillingCycle
Infrastructure      → SubscriptionPlanRecord, TenantSubscriptionRecord (Eloquent)
                    → EloquentSubscriptionPlanRepository
                    → EloquentTenantSubscriptionRepository
                    → PaymentGatewayFactory (Razorpay + Stripe adapters)
                    → PlatformSettingsService (Razorpay key_id, webhook secret)
Scheduled Commands  → 7 artisan commands (see Section 9)
```

---

## 2. Database Schema (Central DB)

---

### 2.1 Table: `subscription_plans`

| Column | Type | Notes |
|---|---|---|
| `id` | BIGINT (PK) | |
| `code` | VARCHAR(100), Unique | Immutable plan identifier. Set at creation, never changed. |
| `name` | VARCHAR(255) | Display name. |
| `description` | TEXT | Nullable. |
| `country_code` | CHAR(2) | ISO 3166-1. Plans are country-scoped. |
| `price_monthly_cents` | BIGINT | 0 = free. Stored in smallest currency subunit. |
| `price_annual_cents` | BIGINT | 0 = free. |
| `price_one_time_cents` | BIGINT | For LIFETIME tier. |
| `currency` | CHAR(3) | ISO 4217. Must match tenant's `default_currency`. |
| `tier` | VARCHAR(30) | `trial`, `shared`, `dedicated`, `lifetime`. |
| `features` | JSON | `PlanFeatures::toArray()` — 8 limit keys. |
| `plan_status` | VARCHAR(30) | `draft`, `pending_approval`, `active`, `rejected`, `pending_archive`, `archived`. |
| `is_trial` | BOOLEAN | True for trial plans. |
| `trial_duration_days` | INT | Nullable. Required if `is_trial = true`. |
| `sort_order` | INT | Display order. |
| `is_public` | BOOLEAN | True = visible in public plan listings. |
| `gateway_plan_id` | VARCHAR(100) | Nullable. Gateway-side plan ID (Razorpay/Stripe). |
| `modules` | JSON | `ModuleEntitlementSet` — list of module codes unlocked. |
| `submitted_by` | BIGINT (FK → `admins.id`) | Who submitted for approval. |
| `submitted_at` | TIMESTAMP | |
| `approved_by` | BIGINT (FK → `admins.id`) | Who approved. |
| `approved_at` | TIMESTAMP | |
| `rejected_by` | BIGINT (FK → `admins.id`) | Who rejected. |
| `rejected_at` | TIMESTAMP | |
| `rejection_reason` | TEXT | Mandatory on rejection. |
| `created_at` | TIMESTAMP | |
| `updated_at` | TIMESTAMP | |

---

### 2.2 Table: `tenant_subscriptions`

| Column | Type | Notes |
|---|---|---|
| `id` | BIGINT (PK) | |
| `tenant_id` | BIGINT (FK → `tenants.id`) | |
| `plan_id` | BIGINT (FK → `subscription_plans.id`) | |
| `status` | VARCHAR(30) | 8-state machine: `trial`, `pending`, `pending_payment`, `active`, `past_due`, `suspended`, `cancelled`, `expired`. |
| `billing_cycle` | VARCHAR(20) | `monthly` or `annual`. |
| `idempotency_key` | VARCHAR(100), Unique | Required for concurrency safety. |
| `starts_at` | TIMESTAMP | When the paid period started. Null for `pending_payment`. |
| `ends_at` | TIMESTAMP | When the current period ends. Extended on renewal success. |
| `trial_ends_at` | TIMESTAMP | Null for non-trial plans. |
| `current_period_start` | TIMESTAMP | When the subscription was created/renewed. |
| `current_period_end` | TIMESTAMP | Null in current implementation. |
| `locked_price_monthly_cents` | BIGINT | Price locked at assignment. Unaffected by future plan price changes. |
| `locked_price_annual_cents` | BIGINT | Price locked at assignment. |
| `locked_modules` | JSON | Snapshot of plan modules at time of assignment. |
| `gateway_subscription_id` | VARCHAR(255) | External subscription ID (for recurring gateway billing). |
| `gateway_checkout_url` | TEXT | Initial checkout URL (Stripe Checkout Session). |
| `gateway_customer_id` | VARCHAR(255) | Gateway customer ID. |
| `gateway_provider` | VARCHAR(30) | `razorpay` or `stripe`. |
| `razorpay_order_id` | VARCHAR(100) | Phase 12A. Razorpay Orders API ID. |
| `stripe_payment_intent_id` | VARCHAR(100) | Stripe PaymentIntent ID. |
| `stripe_checkout_session_id` | VARCHAR(100) | Stripe Checkout Session ID. |
| `renewal_retry_count` | INT | Incremented on each failed renewal attempt. |
| `last_renewal_attempt_at` | TIMESTAMP | Timestamp of last retry attempt. |
| `suspended_at` | TIMESTAMP | When subscription was suspended. |
| `grace_period_ends_at` | TIMESTAMP | Deadline for past_due → suspended transition. |
| `created_at` | TIMESTAMP | |
| `updated_at` | TIMESTAMP | |

---

### 2.3 Table: `module_entitlement_overrides`

Per-tenant per-module access overrides. Independent of plan entitlements.

| Column | Type | Notes |
|---|---|---|
| `id` | BIGINT (PK) | |
| `tenant_id` | BIGINT (FK) | |
| `module_code` | VARCHAR(100) | From `ModuleCode` enum (e.g., `module.lms`, `module.crm`). |
| `type` | VARCHAR(10) | `grant` or `revoke`. |
| `reason` | TEXT | Mandatory. |
| `created_by_admin_id` | BIGINT (FK → `admins.id`) | |
| `created_at` | TIMESTAMP | |

---

### 2.4 Table: `tenant_licenses`

For `LIFETIME` plan tenants — a one-time purchase model.

| Column | Type | Notes |
|---|---|---|
| `id` | BIGINT (PK) | |
| `tenant_id` | BIGINT (FK) | |
| `plan_id` | BIGINT (FK) | |
| `idempotency_key` | VARCHAR(100), Unique | |
| `status` | VARCHAR(30) | `pending_payment`, `active`, `revoked`. |
| `locked_price_cents` | BIGINT | Price locked at provisioning. |
| `currency` | CHAR(3) | |
| `features_snapshot` | JSON | Snapshot of plan features at license creation. |
| `created_at` | TIMESTAMP | |
| `updated_at` | TIMESTAMP | |

---

### 2.5 Table: `overage_records`

| Column | Type | Notes |
|---|---|---|
| `id` | BIGINT (PK) | |
| `tenant_id` | BIGINT (FK) | |
| `subscription_id` | BIGINT (FK) | |
| `resource_type` | VARCHAR(50) | E.g., `max_users`, `max_storage_mb`. |
| `limit_value` | INT | Allowed limit. |
| `current_value` | INT | Actual current usage. |
| `status` | VARCHAR(30) | `detected`, `notified`, `resolved`, `deactivated`. |
| `detected_at` | TIMESTAMP | |
| `resolved_at` | TIMESTAMP | |
| `created_at` | TIMESTAMP | |
| `updated_at` | TIMESTAMP | |

---

## 3. Domain Layer

### 3.1 `SubscriptionPlanEntity`

**File:** `App\Domain\SuperAdminDashboard\Subscription\Entities\SubscriptionPlanEntity`

Key domain methods and their guards:

| Method | From Status | To Status | Guard |
|---|---|---|---|
| `create()` | — | `DRAFT` | Sets `planStatus = DRAFT`. Records `SubscriptionPlanCreated`. |
| `submitForApproval(adminId)` | `DRAFT` / `REJECTED` | `PENDING_APPROVAL` | Throws `InvalidPlanStatusTransitionException` otherwise. |
| `approve(adminId)` | `PENDING_APPROVAL` | `ACTIVE` | Throws if not `PENDING_APPROVAL`. Records `SubscriptionPlanApproved`. |
| `reject(adminId, reason)` | `PENDING_APPROVAL` | `REJECTED` | Reason must not be empty. Records `SubscriptionPlanRejected`. |
| `requestArchive(adminId, hasActiveSubs)` | `ACTIVE` | `PENDING_ARCHIVE` | Blocks if `hasActiveSubscriptions = true` (`ArchiveWithActiveSubscriptionsException`). |
| `approveArchive(adminId)` | `PENDING_ARCHIVE` | `ARCHIVED` | Records `ArchiveApproved`. |
| `rejectArchiveRequest(adminId, reason)` | `PENDING_ARCHIVE` | `ACTIVE` | Reason must not be empty. |
| `markForDeletion()` | `DRAFT` / `REJECTED` | — | Throws `CannotDeleteActivePlanException` for any other status. |
| `updateDetails(...)` | `DRAFT` / `REJECTED` | unchanged | Full field update. Throws if `ACTIVE`, `PENDING_APPROVAL`, or `ARCHIVED`. |

**Key Computed Methods:**
- `isPaid()`: `priceMonthlyCents > 0 || priceAnnualCents > 0`
- `isAssignable()`: `planStatus === ACTIVE`
- `isAssignableTo(TenantEntity)`: `plan.countryCode.equals(tenant.countryCode)`
- `calculateTrialEndsAt(DateTimeImmutable $assignedAt)`: Returns `assignedAt + trialDurationDays` or `null` for non-trial plans.

---

### 3.2 `TenantSubscriptionEntity`

**File:** `App\Domain\SuperAdminDashboard\Subscription\Entities\TenantSubscriptionEntity`

Key domain methods:

| Method | Status Change | Side Effect |
|---|---|---|
| `activate()` | → `ACTIVE` | Records `SubscriptionStatusChanged`. |
| `activateOnPayment(paidAt, billingCycle)` | → `ACTIVE` | Sets `startsAt = paidAt`, calculates `endsAt`. Records `SubscriptionPaymentActivated`. |
| `markPending()` | → `PENDING` | Records `SubscriptionStatusChanged`. |
| `markPendingPayment()` | → `PENDING_PAYMENT` | Records `SubscriptionStatusChanged`. |
| `cancel(cancelledAt)` | → `CANCELLED` | Sets `endsAt`. Records `SubscriptionStatusChanged`. |
| `markPastDue()` | → `PAST_DUE` | Records `SubscriptionStatusChanged`. |
| `expire()` | → `EXPIRED` | Records `SubscriptionStatusChanged`. |
| `suspend(suspendedAt, reason)` | → `SUSPENDED` | Sets `suspendedAt`. Records `SubscriptionSuspended`. |
| `reactivateOnPayment(paidAt, billingCycle)` | → `ACTIVE` | If was `SUSPENDED`: restarts from `paidAt`. If was `PAST_DUE`: extends from current `endsAt`. Resets `renewalRetryCount`. Records `SubscriptionReactivated`. |
| `extendBillingCycle(billingCycle)` | unchanged | Extends `endsAt` by 1 or 12 months from current `endsAt`. |
| `manualExtend(newEndsAt)` | unchanged | Admin-triggered end-date override. |
| `incrementRenewalRetryCount(attemptAt)` | unchanged | Increments counter, sets `lastRenewalAttemptAt`. |
| `recordGatewayCheckoutContext(...)` | unchanged | Stores `gatewayProvider`, `razorpayOrderId`, `stripePaymentIntentId`, `stripeCheckoutSessionId`. |

**All transitions flow through `changeStatus(SubscriptionStatus)` which validates `canTransitionTo()` and throws `InvalidSubscriptionStatusTransitionException` on failure.**

---

### 3.3 `PlanFeatures` (Value Object)

**File:** `App\Domain\SuperAdminDashboard\Subscription\ValueObjects\PlanFeatures`

Immutable. 8 integer fields. `0 = unlimited`. Stored as JSON in `subscription_plans.features`.

Rejects unknown keys strictly via `ALLOWED_KEYS` whitelist. Adding a new feature limit requires updating both `ALLOWED_KEYS` and the corresponding tests.

---

### 3.4 `ModuleCode` (Value Object / Enum)

**File:** `App\Domain\SuperAdminDashboard\Subscription\ValueObjects\ModuleCode`

Exhaustive list of platform module codes (e.g., `module.lms`, `module.crm`, `module.exams`, `module.erp.timetable`, `module.website`). Used in both `module_entitlement_overrides` and `subscription_plans.modules`.

---

## 4. Application Layer — Key UseCases

### 4.1 `AssignSubscriptionToTenantUseCase`

**Execution sequence:**

```
1. Validate plan exists + ACTIVE
2. Validate tenant exists
3. Check plan.countryCode == tenant.countryCode
4. Check plan.currency == tenant.defaultCurrency
5. If paid plan → gateway.createOrder() [OUTSIDE transaction]
   └─ PaymentGatewayException caught silently → orderResult = null
6. DB::transaction():
   ├─ Lock tenant (SELECT FOR UPDATE)
   ├─ Idempotency check → early return if key exists
   ├─ Re-validate plan inside lock
   ├─ findActiveByTenantIdForUpdate → TenantAlreadyHasActiveSubscriptionException
   ├─ hasUsedTrial() → TrialAlreadyUsedException
   ├─ deleteRevokeOverridesForModules() [BR-14]
   ├─ Build TenantSubscriptionEntity:
   │    TRIAL  → status = TRIAL,           startsAt = now
   │    PAID   → status = PENDING_PAYMENT, startsAt = null
   └─ subscriptionRepository.save()
7. eventDispatcher.dispatch(SubscriptionPlanAssigned)
8. auditLogger.log('subscription.assigned')
9. Return AssignSubscriptionResult with checkoutData
```

**`checkoutData` response format:**
- Razorpay: `{ gateway_provider, order_id, amount, currency, key_id }`
- Stripe: `{ gateway_provider, checkout_url, session_id, publishable_key, amount, currency }`

---

### 4.2 `ChangeTenantPlanUseCase`

```
1. Validate new plan exists + ACTIVE
2. Validate tenant exists
3. Check country + currency match
4. If paid → gateway.createOrder() [OUTSIDE transaction]
5. DB::transaction():
   ├─ findActiveByTenantIdForUpdate → current subscription
   ├─ Idempotency check
   ├─ Re-validate plan inside lock
   ├─ Trial enforcement check
   ├─ currentSub.cancel(now)
   ├─ subscriptionRepository.save(currentSub)
   ├─ Build new TenantSubscriptionEntity for new plan
   └─ subscriptionRepository.save(newSub)
6. Dispatch: SubscriptionCancelled + SubscriptionPlanAssigned
7. Two audit logs: subscription.cancelled (reason=plan_change) + subscription.plan_changed
8. Return AssignSubscriptionResult with checkoutData
```

---

### 4.3 `ProcessWebhookUseCase` (Razorpay)

```
1. Validate Razorpay HMAC-SHA256 signature
   └─ Secret from PlatformSettingsService('gateway.razorpay.webhook_secret')
2. On event 'payment.captured':
   └─ ActivateSubscriptionOnPaymentUseCase.execute(razorpayOrderId, paidAt, billingCycle)
```

### 4.4 `ProcessStripeWebhookUseCase`

```
1. Validate Stripe webhook signature
2. On 'checkout.session.completed' or 'payment_intent.succeeded':
   └─ ActivateSubscriptionOnPaymentUseCase.execute(sessionId|intentId, paidAt, billingCycle)
```

### 4.5 `ActivateSubscriptionOnPaymentUseCase`

```
1. Find subscription by razorpayOrderId OR stripeCheckoutSessionId
2. Validate subscription in PENDING_PAYMENT / PENDING_PAYMENT
3. subscription.activateOnPayment(paidAt, billingCycle)
   └─ Sets startsAt, calculates endsAt
4. subscriptionRepository.save()
5. Fire SubscriptionPaymentActivated
6. auditLogger.log('subscription.activated_on_payment')
```

---

## 5. Scheduled Commands Pipeline

| Command | Schedule | Chunk Size | Dry-Run | Action |
|---|---|---|---|---|
| `subscriptions:expire-trials` | Daily | 100 | No | TRIAL → EXPIRED + Tenant → SUSPENDED |
| `subscriptions:transition-past-due` | Daily | — | No | ACTIVE past `ends_at` → PAST_DUE |
| `subscriptions:generate-renewal-orders` | Daily | — | No | Creates gateway payment orders for upcoming renewals |
| `subscriptions:retry-renewal-payments` | Daily | — | No | Retries payment for PAST_DUE, increments `renewal_retry_count` |
| `subscriptions:suspend-past-due` | Daily | — | Yes | PAST_DUE past `grace_period_ends_at` → SUSPENDED |
| `subscriptions:check-overage-resolution` | Daily | — | No | Checks if tenants reduced usage to within limits |
| `subscriptions:enforce-overage-deactivation` | Daily | — | No | Deactivates tenants in unresolved overage |

**Trial Expiry Safety:** Each subscription is locked with `SELECT FOR UPDATE` before marking `EXPIRED` to prevent double-processing across concurrent scheduler runs.

**Suspension Dry-Run:** `SuspendPastDueUseCase` accepts a `$command->dryRun` flag — logs affected subscriptions without committing changes. Used for operator review.

---

## 6. Domain Events

| Event | File | Payload | When Fired |
|---|---|---|---|
| `SubscriptionPlanCreated` | `...Subscription/Events` | `planId`, `code` | On `SubscriptionPlanEntity::create()`. |
| `SubscriptionPlanApproved` | `...Subscription/Events` | `planId`, `code`, `adminId` | On `approve()`. |
| `SubscriptionPlanRejected` | `...Subscription/Events` | `planId`, `code`, `adminId`, `reason` | On `reject()`. |
| `SubscriptionPlanArchived` | `...Subscription/Events` | `planId`, `code` | On `approveArchive()`. |
| `SubscriptionPlanAssigned` | `...Subscription/Events` | `tenantId`, `planId`, `idempotencyKey` | On `AssignSubscriptionToTenantUseCase` commit. |
| `SubscriptionStatusChanged` | `...Subscription/Events` | `tenantId`, `oldStatus`, `newStatus` | On every status transition (fired by entity). |
| `SubscriptionPaymentActivated` | `...Subscription/Events` | `tenantId`, `planId`, `subscriptionId`, `paymentRef`, `paidAt` | On `activateOnPayment()`. |
| `SubscriptionSuspended` | `...Subscription/Events` | `tenantId`, `subscriptionId`, `planId`, `reason`, `suspendedAt` | On `suspend()`. |
| `SubscriptionReactivated` | `...Subscription/Events` | `tenantId`, `subscriptionId`, `planId`, `endsAt`, `oldStatus`, `paidAt` | On `reactivateOnPayment()`. |
| `SubscriptionCancelled` | `...Subscription/Events` | `tenantId`, `planId`, `subscriptionId` | On `cancel()`. |
| `SubscriptionTrialExpired` | `...Subscription/Events` | `tenantId`, `planId` | On `ExpireTrialsUseCase`. |

---

## 7. HTTP Layer — Key Routes

| Method | URI | UseCase | Min Auth |
|---|---|---|---|
| POST | `/platform/subscription-plans` | `CreateSubscriptionPlanUseCase` | L4 |
| PUT | `/platform/subscription-plans/{code}` | `UpdateSubscriptionPlanUseCase` | L4 |
| POST | `/platform/subscription-plans/{code}/submit` | `SubmitPlanForApprovalUseCase` | L4 |
| POST | `/platform/subscription-plans/{code}/approve` | `ApprovePlanUseCase` | L2 |
| POST | `/platform/subscription-plans/{code}/reject` | `RejectPlanUseCase` | L2 |
| POST | `/platform/subscription-plans/{code}/request-archive` | `RequestArchiveUseCase` | L4 |
| POST | `/platform/subscription-plans/{code}/approve-archive` | `ApproveArchiveUseCase` | L2 |
| POST | `/platform/tenants/{id}/assign-subscription` | `AssignSubscriptionToTenantUseCase` | L4 |
| POST | `/platform/tenants/{id}/change-plan` | `ChangeTenantPlanUseCase` | L4 |
| POST | `/platform/tenants/{id}/cancel-subscription` | `CancelSubscriptionUseCase` | L4 |
| POST | `/platform/tenants/{id}/extend-subscription` | `ExtendSubscriptionUseCase` | L4 |
| POST | `/platform/tenants/{id}/reactivate-subscription` | `ReactivateSubscriptionUseCase` | L4 |
| POST | `/webhooks/razorpay` | `ProcessWebhookUseCase` | Public (HMAC-verified) |
| POST | `/webhooks/stripe` | `ProcessStripeWebhookUseCase` | Public (Stripe-verified) |

**Required Headers for mutation endpoints:** `X-Idempotency-Key: {uuid}`

---

## 8. Infrastructure — Payment Gateway Factory

**Interface:** `PaymentGatewayFactoryInterface::resolve(GatewayProvider): PaymentGatewayInterface`

**Implementations:**
- `RazorpayGatewayService` — uses `PlatformSettingsService` to read `gateway.razorpay.key_id` and `gateway.razorpay.key_secret` (encrypted at rest in `platform_settings`).
- `StripeGatewayService` — uses `config('services.stripe.secret')`.

**Important:** Razorpay credentials are stored in the **Platform Settings** (central DB), NOT in `.env`. If `APP_KEY` changes, the platform settings secrets must be re-saved.

---

## 9. Exceptions Reference

| Exception | When Thrown |
|---|---|
| `SubscriptionPlanNotFoundException` | Plan ID does not exist. |
| `InactivePlanAssignmentException` | Plan exists but is not in `ACTIVE` status. |
| `PlanCountryMismatchException` | Plan country ≠ tenant country. |
| `TenantAlreadyHasActiveSubscriptionException` | Tenant already has active/trial subscription. |
| `TrialAlreadyUsedException` | Tenant has previously used a trial subscription. |
| `InvalidPlanStatusTransitionException` | Plan status transition not allowed by state machine. |
| `ArchiveWithActiveSubscriptionsException` | Cannot archive plan with active subscribers. |
| `CannotDeleteActivePlanException` | Cannot delete plan not in DRAFT or REJECTED. |
| `InvalidSubscriptionStatusTransitionException` | Subscription status transition not in D3 matrix. |
| `PaymentGatewayException` | Gateway call failed (order creation, webhook validation). |

---

## 10. Critical Test Scenarios

1. **One trial per tenant** — Attempting a second trial returns `TrialAlreadyUsedException`.
2. **Plan country guard** — Assigning an `IN` plan to a `US` tenant throws `PlanCountryMismatchException`.
3. **Currency guard** — Assigning an `INR` plan to a `USD` tenant throws `InvalidArgumentException`.
4. **Concurrent assignment** — Two simultaneous requests with the same tenant and different idempotency keys must result in one success and one `TenantAlreadyHasActiveSubscriptionException`.
5. **Idempotency** — Two requests with the same idempotency key return the same subscription without duplicating it.
6. **Gateway failure fallback** — Gateway exception → subscription created in `PENDING_PAYMENT` with no order ID.
7. **Webhook activation** — Razorpay `payment.captured` webhook → subscription transitions from `PENDING_PAYMENT` to `ACTIVE` with correct `starts_at` / `ends_at`.
8. **Trial expiry** — After `trial_ends_at`, `ExpireTrialsUseCase` sets status `EXPIRED` and tenant to `SUSPENDED`.
9. **Price lock** — Updating a plan's price does not change `locked_price_*` on existing subscriptions.
10. **Plan change audit** — `ChangeTenantPlanUseCase` generates exactly two audit entries: `subscription.cancelled` and `subscription.plan_changed`.
11. **Archive guard** — `RequestArchiveUseCase` with active subscribers must throw `ArchiveWithActiveSubscriptionsException`.
12. **Module revoke auto-clear** — Assigning a plan with `module.crm` removes any existing `REVOKE` override for `module.crm`.

---

*End of Document — UBOTZ 2.0 Billing & Subscription Full Technical Specification — March 27, 2026*
