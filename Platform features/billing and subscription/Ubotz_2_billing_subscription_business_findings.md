# UBOTZ 2.0 — Billing & Subscription: Business Findings & Design

| Field | Value |
|---|---|
| **Document Type** | Principal Engineer — Business Logic Audit |
| **Feature** | Billing & Subscription Management |
| **Date** | 2026-03-27 |
| **Issued By** | Principal Engineer / Architecture Auditor |
| **Scope** | Subscription plans, tenant subscriptions, billing cycles, payment gateways, automated lifecycle management |
| **Status** | REVIEWED — Reflects current implemented state |

---

## 1. Executive Summary

The Billing & Subscription system is the revenue engine of the UBOTZ 2.0 platform. It governs:

1. **Subscription Plan Management** — Platform admins define, approve, and publish plans with feature limits, pricing, and module entitlements.
2. **Tenant Subscription Lifecycle** — Each tenant has one active subscription at a time, moving through a strict 8-state machine from trial through cancellation.
3. **Payment Gateway Integration** — Dual-gateway support: **Razorpay** (India) and **Stripe** (international). Gateway selection is automatic based on the tenant's country.
4. **Automated Billing Automation** — Seven scheduled commands handle trial expiry, past-due enforcement, renewal order generation, retry logic, and overage management.
5. **Module Entitlements** — Subscription plans define which platform modules (LMS, CRM, Exams, etc.) a tenant can access, with per-tenant override capability.

---

## 2. Subscription Plan Lifecycle

Every subscription plan goes through a 6-state governance workflow before it can be assigned to any tenant.

### 2.1 Plan Status States

| Status | DB Value | Meaning |
|---|---|---|
| `DRAFT` | `draft` | Plan is being configured. Not visible to tenants. Editable. |
| `PENDING_APPROVAL` | `pending_approval` | Submitted for L2+ review. Locked from edits. |
| `ACTIVE` | `active` | Live. Can be assigned to tenants. |
| `REJECTED` | `rejected` | Sent back from review with a mandatory reason. Reverts to editable. |
| `PENDING_ARCHIVE` | `pending_archive` | Archiving requested. Awaiting L2+ approval. |
| `ARCHIVED` | `archived` | Retired. Cannot be assigned. Existing subscribers are unaffected. |

### 2.2 Plan Approval Workflow

```
DRAFT → (Submit) → PENDING_APPROVAL → (Approve) → ACTIVE
                                    → (Reject)  → REJECTED → (Re-submit) → PENDING_APPROVAL
ACTIVE → (Request Archive) → PENDING_ARCHIVE → (Approve Archive) → ARCHIVED
                                              → (Reject Archive)  → ACTIVE
```

**Key Guards:**
- A plan can only be **edited** when in `DRAFT` or `REJECTED` state.
- A plan can only be **assigned to a tenant** when `ACTIVE` (`isAssignable()`).
- Archiving is **blocked** if the plan has active tenant subscriptions (`ArchiveWithActiveSubscriptionsException`).
- **Deleting** a plan is only permitted in `DRAFT` or `REJECTED` (`CannotDeleteActivePlanException`).
- Rejection reason is **mandatory** — an empty reason throws `InvalidArgumentException`.

### 2.3 Plan Configuration (What a Plan Defines)

Each plan defines:

| Field | Type | Notes |
|---|---|---|
| `code` | String (unique, immutable) | Identifier used in API, audit logs, events. Never changes after creation. |
| `country_code` | ISO-2 | The plan is only assignable to tenants of the same country. |
| `price_monthly_cents` | Int | Price in the smallest currency subunit (e.g., paise for INR). |
| `price_annual_cents` | Int | Annual bundle price. Typically 10–20% discount over monthly. |
| `price_one_time_cents` | Int | For LIFETIME plans only. |
| `currency` | ISO-3 | Must match the tenant's `default_currency`. |
| `tier` | Enum | `TRIAL`, `SHARED`, `DEDICATED`, `LIFETIME`. Drives DB provisioning strategy. |
| `is_trial` | Boolean | Trial plans are free; must have `trial_duration_days > 0`. |
| `trial_duration_days` | Int | How many days before trial expires. Only for trial plans. |
| `is_public` | Boolean | Whether visible in public plan listings. Internal plans can be private. |
| `sort_order` | Int | Display ordering on pricing pages. |
| `gateway_plan_id` | String (nullable) | External gateway plan ID (Razorpay/Stripe). |

### 2.4 Plan Feature Limits (PlanFeatures)

Each plan defines 8 configurable resource limits. `0` means **unlimited**:

| Limit | Key | Description |
|---|---|---|
| Max Users | `max_users` | Total student/learner accounts the tenant can create. |
| Max Courses | `max_courses` | Total courses (published + draft) allowed. |
| Max Storage (MB) | `max_storage_mb` | Total file storage quota in megabytes. |
| Max Sessions | `max_sessions` | Concurrent live sessions allowed. |
| Max Branches | `max_branches` | Number of organizational branches (sub-tenants). |
| Max Admins | `max_admins` | Number of admin-role users within the tenant. |
| Max API Req/min | `max_api_requests_per_minute` | Rate limit for the tenant's API usage. |
| Max Automation Rules | `max_automation_rules` | Number of CRM/workflow automation rules. |

---

## 3. Tenant Subscription Lifecycle — 8-State Machine

Each tenant has at most one active subscription at a time. The subscription status follows a strict state machine (the "D3 Matrix"):

| Status | DB Value | Access Granted? | Meaning |
|---|---|---|---|
| `TRIAL` | `trial` | ✅ Yes | Free trial period. Access granted. Expires at `trial_ends_at`. |
| `PENDING` | `pending` | ❌ No | Subscription created on gateway, awaiting first successful charge webhook. |
| `PENDING_PAYMENT` | `pending_payment` | ❌ No | Checkout initiated. Awaiting first payment confirmation. |
| `ACTIVE` | `active` | ✅ Yes | Fully paid and active. |
| `PAST_DUE` | `past_due` | ✅ Yes (grace) | Renewal failed. In grace period — access maintained temporarily. |
| `SUSPENDED` | `suspended` | ❌ No | Grace period expired with no payment. Access blocked. |
| `CANCELLED` | `cancelled` | ❌ No | Terminal. No recovery possible. |
| `EXPIRED` | `expired` | ❌ No | Terminal. Trial ran out with no upgrade. |

### 3.1 State Transition Matrix (D3 Rules)

| From | Allowed → To |
|---|---|
| `TRIAL` | `ACTIVE`, `CANCELLED`, `EXPIRED`, `PENDING`, `PENDING_PAYMENT` |
| `PENDING` | `ACTIVE`, `CANCELLED`, `EXPIRED` |
| `PENDING_PAYMENT` | `ACTIVE`, `CANCELLED` |
| `ACTIVE` | `PAST_DUE`, `CANCELLED`, `EXPIRED` |
| `PAST_DUE` | `ACTIVE`, `CANCELLED`, `SUSPENDED`, `EXPIRED` |
| `SUSPENDED` | `ACTIVE`, `CANCELLED` |
| `CANCELLED` | ❌ NONE (terminal) |
| `EXPIRED` | ❌ NONE (terminal) |

### 3.2 Access Grant Logic

`isActive()` → True only for `ACTIVE` and `TRIAL`.
`isActiveForAccess()` → True for `ACTIVE`, `TRIAL`, and `PAST_DUE` (grace period access).

> **Critical:** Tenants in `PAST_DUE` retain access via `isActiveForAccess()` during the grace period. Access is cut at `SUSPENDED`.

---

## 4. Payment Gateway — Dual Gateway Strategy

UBOTZ 2.0 supports two payment gateways. Gateway selection is **automatic** based on the tenant's country code and is set at the domain entity level — it cannot be overridden by the caller.

| Gateway | Countries | Integration |
|---|---|---|
| **Razorpay** | India (`IN`) | Orders API. Checkout widget embedded in SuperAdmin UI. |
| **Stripe** | Global (`US`, `GB`, others) | Checkout Sessions API. Paid via Stripe Checkout redirect. |

### 4.1 Gateway Selection

`TenantEntity.paymentGateway` → `GatewayProvider::RAZORPAY` or `GatewayProvider::STRIPE`, derived from `CountryCode::defaultGateway()` at tenant creation.

`PaymentGatewayFactoryInterface::resolve($tenant->paymentGateway)` → Returns the appropriate gateway adapter.

### 4.2 Payment Flow for a New Subscription

1. `AssignSubscriptionToTenantUseCase` calls `gateway->createOrder(amount, currency, receiptId, notes)`.
2. If the gateway call succeeds → order ID / checkout session ID stored with the subscription.
3. Response includes `checkoutData` (Razorpay key_id + order_id, or Stripe publishable_key + checkout_url).
4. SuperAdmin UI renders the checkout widget or redirects to Stripe.
5. Payment webhook received → `ProcessWebhookUseCase` or `ProcessStripeWebhookUseCase` validates signature and activates subscription.

**Gateway Failure Fallback:** If the gateway call throws `PaymentGatewayException`, the system creates the subscription in `PENDING_PAYMENT` with no order ID — platform admins can manually track payment off-platform.

### 4.3 Webhook Processing

| Gateway | UseCase | Actions |
|---|---|---|
| Razorpay | `ProcessWebhookUseCase` | Validates HMAC signature. On `payment.captured`: calls `ActivateSubscriptionOnPaymentUseCase`. |
| Stripe | `ProcessStripeWebhookUseCase` | Validates Stripe signature. On `checkout.session.completed` or `payment_intent.succeeded`: activates subscription. |

On payment activation:
- `subscription.activateOnPayment(paidAt, billingCycle)`
- `startsAt = paidAt`, `endsAt = paidAt + (1 month | 12 months)`
- Fires `SubscriptionPaymentActivated` domain event.

---

## 5. Subscription Assignment Business Rules

When assigning a plan to a tenant (`AssignSubscriptionToTenantUseCase`):

| Check | Rule | Error if violated |
|---|---|---|
| **Plan active** | Plan must be in `ACTIVE` status. | `InactivePlanAssignmentException` |
| **Plan-country match** | Plan's `country_code` must match tenant's `country_code`. | `PlanCountryMismatchException` |
| **Currency match** | Plan's `currency` must match tenant's `default_currency`. | `InvalidArgumentException` |
| **No active subscription** | Tenant must not already have an `ACTIVE` or `TRIAL` subscription. | `TenantAlreadyHasActiveSubscriptionException` |
| **One trial per lifetime** | A tenant that has ever used a trial cannot start another trial on any plan. | `TrialAlreadyUsedException` |
| **Idempotency** | Duplicate calls with same key return the existing subscription quietly. | (no exception — idempotent return) |

**Module Revoke Auto-Clear:** When a new plan is assigned and the plan includes specific module entitlements, any existing `REVOKE` override for those modules is automatically deleted (BR-14). This prevents a situation where a tenant pays for a module but a stale revoke override blocks their access.

---

## 6. Plan Change (Upgrade / Downgrade)

`ChangeTenantPlanUseCase` implements a **cancel-then-create** pattern:

1. Lock current `ACTIVE` or `TRIAL` subscription.
2. Validate new plan (same country/currency guards apply).
3. **Cancel** the current subscription (`endsAt = now`).
4. **Create** new subscription for the new plan (same status logic as fresh assignment: TRIAL / PENDING_PAYMENT / ACTIVE).
5. Two distinct audit log entries: `subscription.cancelled` (reason = `plan_change`) + `subscription.plan_changed`.
6. Dispatch: `SubscriptionCancelled` event + `SubscriptionPlanAssigned` event.

> **Note:** There is currently no pro-rata credit calculation for mid-cycle upgrades. The old period is abandoned; the new period starts fresh.

---

## 7. Billing Cycle & Price Locking

When a subscription is created, the **current plan prices are locked** into the subscription record:
- `locked_price_monthly_cents`
- `locked_price_annual_cents`

**Why:** If the platform later changes the plan pricing, existing tenants continue to pay their locked-in rate. The price change only affects new assignments.

**Billing cycles supported:**
| Cycle | Value | Period |
|---|---|---|
| Monthly | `monthly` | +1 month per renewal |
| Annual | `annual` | +12 months per renewal |

---

## 8. Automated Billing — Scheduled Commands

Seven artisan commands run on schedule to manage the subscription lifecycle automatically:

| Command | UseCase | Schedule | Action |
|---|---|---|---|
| `subscriptions:expire-trials` | `ExpireTrialsUseCase` | Daily | Expires `TRIAL` subscriptions where `trial_ends_at < now`. Sets subscription `EXPIRED`, tenant `SUSPENDED`. |
| `subscriptions:generate-renewal-orders` | `GenerateRenewalOrdersUseCase` | Daily | Creates gateway renewal orders for subscriptions approaching `ends_at`. |
| `subscriptions:retry-renewal-payments` | `RetryRenewalPaymentsUseCase` | Daily | Retries payment for subscriptions in `PAST_DUE` with retry count < threshold. |
| `subscriptions:transition-past-due` | `TransitionPastDueUseCase` | Daily | Moves `ACTIVE` subscriptions that passed `ends_at` to `PAST_DUE`. |
| `subscriptions:suspend-past-due` | `SuspendPastDueUseCase` | Daily | Moves `PAST_DUE` subscriptions past their grace period to `SUSPENDED`. Supports `--dry-run`. |
| `subscriptions:check-overage-resolution` | `CheckOverageResolutionUseCase` | Daily | Checks if tenants in overage have resolved their limits. |
| `subscriptions:enforce-overage-deactivation` | `EnforceOverageDeactivationUseCase` | Daily | Deactivates tenants in unresolved overage. |

**Trial Expiry Detail:** Processed in chunks of 100 subscriptions per run. Each subscription is locked individually (`SELECT FOR UPDATE`) before processing to prevent duplicate expiration in concurrent runs.

**Past-Due Suspension:** Supports `--dry-run` mode — logs which subscriptions would be suspended without making changes. Used for operator review before enabling in production.

---

## 9. Module Entitlements & Overrides

Plans define a `ModuleEntitlementSet` — the set of platform modules unlocked for subscribers. In addition, platform admins can create tenant-level per-module overrides:

| Override Type | Effect |
|---|---|
| `GRANT` | Gives the tenant access to a module not included in their plan. |
| `REVOKE` | Removes access to a module that is in their plan. |

**Auto-clear on plan assignment:** All `REVOKE` overrides for modules included in the new plan are automatically cleared when a tenant is assigned a plan.

---

## 10. Overage Management

Subscriptions have usage limits (from `PlanFeatures`). When a tenant exceeds a limit:

1. An `OverageRecordEntity` is created documenting the overage.
2. The overage status progresses: `DETECTED` → `NOTIFIED` → `RESOLVED` or `DEACTIVATED`.
3. `EnforceOverageDeactivationUseCase` deactivates tenants in unresolved overage.
4. `CheckOverageResolutionUseCase` checks if tenants have reduced usage below the limit.

---

## 11. Business Rules — Complete Reference

| ID | Rule | Enforcement Point |
|---|---|---|
| BR-SUB-01 | A plan can only be edited in `DRAFT` or `REJECTED` state. | `SubscriptionPlanEntity::updateDetails()`. |
| BR-SUB-02 | A plan can only be assigned when `ACTIVE`. | `AssignSubscriptionToTenantUseCase::isAssignable()`. |
| BR-SUB-03 | A plan can only be archived if it has no active subscriptions. | `SubscriptionPlanEntity::requestArchive($hasActiveSubscriptions)`. |
| BR-SUB-04 | A tenant can only have one active or trial subscription at a time. | `AssignSubscriptionToTenantUseCase::findActiveByTenantIdForUpdate()`. |
| BR-SUB-05 | Each tenant gets one trial — ever. Trials cannot be restarted. | `TenantSubscriptionRepository::hasUsedTrial()`. |
| BR-SUB-06 | Plan country must match tenant country. Cross-country assignment is rejected. | `SubscriptionPlanEntity::isAssignableTo(TenantEntity)`. |
| BR-SUB-07 | Plan currency must match the tenant's default currency. | Explicit check in `AssignSubscriptionToTenantUseCase`. |
| BR-SUB-08 | Subscription prices are locked at the time of assignment. Future price changes do not affect existing subscriptions. | `locked_price_monthly_cents` / `locked_price_annual_cents` on `TenantSubscriptionEntity`. |
| BR-SUB-09 | All subscription assignments require `X-Idempotency-Key`. Duplicate calls return the existing subscription silently. | Idempotency check inside `DB::transaction()`. |
| BR-SUB-10 | Gateway is selected automatically by tenant country — not by caller. | `PaymentGatewayFactoryInterface::resolve(tenant->paymentGateway)`. |
| BR-SUB-11 | If the gateway order creation fails, the subscription is created in `PENDING_PAYMENT` without a gateway order. | `AssignSubscriptionToTenantUseCase` catch block. |
| BR-SUB-12 | Plan changes use cancel-then-create pattern. There is no mid-cycle pro-rata credit. | `ChangeTenantPlanUseCase`. |
| BR-SUB-13 | Trial expiry automatically suspends the tenant (not just the subscription). | `ExpireTrialsUseCase` → `TenantEntity::status = SUSPENDED`. |
| BR-SUB-14 | REVOKE module overrides for modules in the new plan are auto-cleared on plan assignment. | `AssignSubscriptionToTenantUseCase::deleteRevokeOverridesForModules()`. |
| BR-SUB-15 | `PAST_DUE` tenants retain access during the grace period (`isActiveForAccess()`). | `SubscriptionStatus::isActiveForAccess()`. |
| BR-SUB-16 | Rejection reason on plan reject / archive reject is mandatory. | `SubscriptionPlanEntity::reject()` / `rejectArchiveRequest()`. |

---

## 12. Open Questions for Product Owner

| # | Question | Impact |
|---|---|---|
| 1 | Should `PAST_DUE` tenants receive an automated grace period warning email? | Currently no notification is sent on transition to `PAST_DUE`. |
| 2 | Is there a defined grace period duration (7 days? 14 days?) before `PAST_DUE` → `SUSPENDED`? | `grace_period_ends_at` field exists but the duration is not documented. |
| 3 | Should mid-cycle plan upgrades implement pro-rata billing credits? | Currently no credit is given for unused days. |
| 4 | Should private plans (not `is_public`) be shown in a separate "Custom Plans" section for enterprise tenants? | Currently all non-public plans are fully invisible. |
| 5 | What is the maximum renewal retry count before a subscription is permanently suspended? | `renewal_retry_count` is tracked but no formal threshold is defined in code. |

---

*End of Document — UBOTZ 2.0 Billing & Subscription Business Findings — March 27, 2026*
