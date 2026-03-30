# UBOTZ 2.0 — Phase 12B Developer Instructions

## Recurring Billing & Auto-Renewal

| Field | Value |
|---|---|
| **Document Type** | Developer Instruction (Pre-Implementation Brief) |
| **Phase** | 12B |
| **Date** | March 8, 2026 |
| **Issued By** | Principal Engineer / Architecture Auditor |
| **Audience** | Implementation Developer |
| **Expected Deliverable** | Phase 12B Implementation Plan (same format as previous phases) |
| **Prerequisites** | Phase 12A COMPLETE (Razorpay Orders integration, `pending_payment` status, webhook activation) |

> **Phase 12A proved we can collect a single payment. Phase 12B proves we can collect every payment, on time, forever. A subscription platform that cannot auto-renew is a platform that churns. Every missed renewal is lost revenue. Every silent failure is a tenant who thinks they're paying but isn't. Build this like the company's cashflow depends on it — because it does.**

---

## 1. Mission Statement

Phase 12B adds automatic subscription renewal at billing cycle end. When a tenant's `active` subscription approaches expiry, the system automatically creates a new Razorpay Order and attempts to collect payment. If payment succeeds, the subscription renews seamlessly. If payment fails, the subscription enters a `past_due` grace period during which access continues. If the grace period expires without payment, the subscription is suspended.

**Our system controls the schedule. Razorpay is the payment collection tool.**

We are NOT using the Razorpay Subscriptions API. We use the same Razorpay Orders API from Phase 12A. Our system owns the billing clock, the retry logic, and the state machine. This avoids dual state machine conflicts and keeps Ubotz as the single source of truth for subscription state.

**What this phase delivers:**

- Scheduled renewal command that creates Razorpay Orders for expiring subscriptions
- `past_due` subscription status with configurable grace period (default: 7 days)
- Automatic suspension when grace period expires without payment
- Renewal payment tracking on subscription records
- Super Admin visibility into renewal status and past-due tenants
- Tenant Admin visibility into upcoming renewal and past-due warnings

---

## 2. Business Context

### 2.1 Current State (After 12A)

Phase 12A established the payment loop: Super Admin assigns paid plan → Razorpay Order created → tenant pays → webhook activates subscription. But subscriptions have a finite duration (`ends_at`). When a monthly subscription expires, nothing happens — the tenant simply loses access because the status transitions to `expired` via the existing `ExpireTrialSubscriptionsCommand` (which also handles non-trial expiry if implemented, or the subscription just sits in `active` past its `ends_at`).

### 2.2 What Changes

After Phase 12B, the lifecycle becomes continuous:

```
Subscription active (ends_at = March 31)
    ↓  7 days before expiry (configurable)
    ↓
Renewal Order created via Razorpay Orders API
    ↓
Payment link available (auto-charge if card saved, or manual pay)
    ↓
    ├── Payment succeeds (webhook) → ends_at extended by one cycle → continue active
    │
    └── Payment fails → status becomes `past_due` → grace period starts (7 days)
            ↓
            ├── Payment succeeds during grace → back to `active`, ends_at extended
            │
            └── Grace period expires → status becomes `suspended`
                    ↓
                    ├── Super Admin manually intervenes (retry, skip_payment, cancel)
                    │
                    └── Tenant loses access (quota enforcement treats suspended = no plan)
```

### 2.3 The Renewal Timeline

For a monthly subscription ending March 31:

| Day | Event |
|---|---|
| March 24 (T-7) | `GenerateRenewalOrdersCommand` creates Razorpay Order, dispatches `SubscriptionRenewalInitiated` event |
| March 24–31 | Tenant can pay via checkout link. If card-on-file exists via Razorpay, auto-charge may succeed immediately |
| March 31 | If paid → `ends_at` extended to April 30, status stays `active` |
| March 31 | If NOT paid → status transitions to `past_due`, grace period starts |
| April 1–7 | Grace period. Access continues. Dashboard shows warning. Retry payment available. |
| April 7 | Grace expires → `SuspendPastDueSubscriptionsCommand` sets status to `suspended` |
| After April 7 | Tenant has no active subscription. Quota enforcement falls back to platform defaults. |

---

## 3. Business Rules (NON-NEGOTIABLE)

### 3.1 Renewal Rules

| Rule ID | Rule | Detail |
|---|---|---|
| BR-01 | Renewal orders are created automatically N days before `ends_at`. N is configurable via platform settings. | Default: `billing.renewal_days_before_expiry = 7`. Super Admin configurable. |
| BR-02 | Only `active` subscriptions with a non-null `ends_at` are eligible for renewal. | `trial`, `pending_payment`, `past_due`, `cancelled`, `expired`, `suspended` subscriptions are NOT renewed. Trials must be converted to paid plans first. |
| BR-03 | The renewal order amount uses the subscription's `locked_price_*_cents` for the current billing cycle. | NOT the plan's current price. The tenant pays what they were originally locked in at. Price changes only apply to new assignments. |
| BR-04 | Each renewal creates a new Razorpay Order. The `razorpay_order_id` on the subscription is updated. Previous order IDs are preserved in `payment_events`. | This reuses 100% of the 12A payment flow. |
| BR-05 | A subscription must not have a pending (uncompleted) renewal order when a new one is generated. | The command checks: if `razorpay_order_id` exists and the current order is still `created` (not `paid` or `failed`), skip renewal creation. Prevent duplicate orders. |
| BR-06 | If renewal payment succeeds (webhook), `ends_at` is extended by one billing cycle from the CURRENT `ends_at`, not from the payment date. | Monthly: `ends_at += 1 month`. Annual: `ends_at += 1 year`. This prevents drift — paying on March 28 for a March 31 expiry extends to April 30, not April 28. |
| BR-07 | The renewal command is idempotent. Running it multiple times for the same day must not create duplicate orders. | Check: subscription already has a non-expired, non-paid order → skip. |

### 3.2 Past-Due Rules

| Rule ID | Rule | Detail |
|---|---|---|
| BR-08 | When `ends_at` passes without successful renewal payment, the subscription transitions to `past_due`. | This transition is performed by a scheduled command, not real-time. The command runs daily. |
| BR-09 | During `past_due`, the tenant retains full access to their plan features. Quota enforcement treats `past_due` the same as `active`. | This is a grace period — access continues. The `TenantQuotaService` must be updated to recognize `past_due` as an active status for limit resolution. |
| BR-10 | The grace period duration is configurable via platform settings. | Key: `billing.payment_grace_period_days`, default: `7`. |
| BR-11 | During the grace period, the system dispatches a `SubscriptionPaymentOverdue` domain event daily. | This enables future notification listeners (email reminders). In Phase 12B, the event is dispatched but no notification is sent — that's deferred to the Notification Infrastructure phase. |
| BR-12 | If payment succeeds during the grace period (webhook), the subscription returns to `active` and `ends_at` is extended from the original `ends_at` (not from payment date). | `past_due` → `active` is a valid transition. The renewal is considered successful. |

### 3.3 Suspension Rules

| Rule ID | Rule | Detail |
|---|---|---|
| BR-13 | When the grace period expires without payment, the subscription transitions to `suspended`. | Performed by `SuspendPastDueSubscriptionsCommand`. The command calculates: `ends_at + grace_period_days < now()` → suspend. |
| BR-14 | `suspended` is NOT a terminal state. It can be resolved by: (a) Super Admin retries payment, (b) Super Admin uses `skip_payment` manual override, (c) Super Admin cancels and assigns a new plan. | Unlike `cancelled` and `expired`, `suspended` allows recovery. |
| BR-15 | A `suspended` tenant is treated as having NO active subscription for quota purposes. | `TenantQuotaService` does NOT recognize `suspended` as active. The tenant falls back to platform default limits. |
| BR-16 | Every suspension is audit-logged with reason `payment_grace_period_expired`. | The `SubscriptionSuspended` domain event is dispatched for future notification wiring. |
| BR-17 | If payment succeeds for a `suspended` subscription (webhook from a retry order), the subscription returns to `active`. | `suspended` → `active` is a valid transition. `ends_at` is recalculated from the payment date (since the original cycle has lapsed). |

### 3.4 Super Admin Controls

| Rule ID | Rule | Detail |
|---|---|---|
| BR-18 | Super Admin can manually trigger a renewal payment retry for `past_due` or `suspended` subscriptions. | Reuses the `RetryPaymentUseCase` from 12A. Creates a new Razorpay Order. |
| BR-19 | Super Admin can manually extend `ends_at` without payment (e.g., courtesy extension for disputes). | New `ExtendSubscriptionUseCase`. Sets a new `ends_at`. Audit-logged with reason `manual_extension`. Does NOT change `locked_price`. |
| BR-20 | Super Admin can skip payment and reactivate a `past_due` or `suspended` subscription. | Reuses `skip_payment` pattern from 12A. Transitions to `active`, extends `ends_at`. Audit-logged with reason `manual_override`. |

---

## 4. State Machine Extension

### 4.1 Updated State Machine (Cumulative: 11A + 12A + 12B)

```
                    ┌──────────────────────────────────────────────────────┐
                    │                                                      │
                    ▼                                                      │
    ┌─────────┐  assign    ┌──────────────────┐  pay     ┌─────────┐   renew
    │  (none) │ ─────────► │ pending_payment  │ ───────► │ active  │ ──────┐
    │         │  (paid)    │                  │ (webhook)│         │       │
    └─────────┘            └───────┬──────────┘          └────┬────┘       │
         │                         │                          │            │
         │  assign (trial)         │ cancel                   │ past due   │
         │                         │                          ▼            │
         ▼                         ▼                    ┌───────────┐      │
    ┌─────────┐            ┌───────────┐                │ past_due  │ ─────┘
    │  trial  │            │ cancelled │                │           │ (pay succeeds)
    └────┬────┘            └───────────┘                └─────┬─────┘
         │                                                    │
         │ expire                                             │ grace expires
         ▼                                                    ▼
    ┌─────────┐                                        ┌───────────┐
    │ expired │                                        │ suspended │
    └─────────┘                                        └───────────┘
                                                             │
                                                             │ pay succeeds
                                                             │ OR manual override
                                                             ▼
                                                       ┌─────────┐
                                                       │ active  │
                                                       └─────────┘
```

### 4.2 New Transitions (Phase 12B)

| From | To | Trigger | Actor |
|---|---|---|---|
| `active` | `past_due` | `ends_at` passed without renewal payment | System (scheduled command) |
| `past_due` | `active` | Renewal payment confirmed via webhook | System (webhook) |
| `past_due` | `active` | Super Admin manual override (`skip_payment`) | Super Admin |
| `past_due` | `suspended` | Grace period expired without payment | System (scheduled command) |
| `past_due` | `cancelled` | Super Admin cancels | Super Admin |
| `suspended` | `active` | Payment confirmed via webhook (retry order) | System (webhook) |
| `suspended` | `active` | Super Admin manual override | Super Admin |
| `suspended` | `cancelled` | Super Admin cancels | Super Admin |

### 4.3 Updated Terminal States

`expired` and `cancelled` remain terminal. `suspended` is NOT terminal — it's a recoverable payment failure state.

### 4.4 Forbidden Transitions (additions)

| From | To | Reason |
|---|---|---|
| `past_due` | `trial` | Cannot revert to trial |
| `past_due` | `pending_payment` | Already past initial payment |
| `past_due` | `expired` | Expiry is for trials; payment failure → suspension |
| `suspended` | `trial` | Cannot revert to trial |
| `suspended` | `pending_payment` | Use retry-payment instead |
| `suspended` | `expired` | Suspension is the payment-failure analog of expiry |
| `suspended` | `past_due` | Cannot go backwards; must resolve to active or cancel |

---

## 5. Platform Settings (New Keys)

Add to the existing `platform_settings` table (Phase 11B infrastructure):

| Key | Type | Default | Description |
|---|---|---|---|
| `billing.renewal_days_before_expiry` | integer | `7` | How many days before `ends_at` to create renewal order |
| `billing.payment_grace_period_days` | integer | `7` | Days after `ends_at` before `past_due` → `suspended` |
| `billing.max_renewal_retry_attempts` | integer | `3` | Maximum automatic retry attempts during grace period |
| `billing.renewal_retry_interval_hours` | integer | `24` | Hours between automatic retry attempts |

These must be added to the `PlatformSettingsSeeder` with sensible defaults and included in the Platform Settings frontend form (Module C from 11C).

---

## 6. Scheduled Commands

### 6.1 `GenerateRenewalOrdersCommand`

```
php artisan billing:generate-renewal-orders
```

**Schedule:** Daily at 02:00 UTC (after quota enforcement commands from 11B)

**Logic:**

```
1. $renewalWindow = $this->platformSettings->getInt('billing.renewal_days_before_expiry', 7)
2. $cutoffDate = $this->clock->now()->modify("+{$renewalWindow} days")
3. Find all subscriptions WHERE:
   - status = 'active'
   - ends_at IS NOT NULL
   - ends_at <= $cutoffDate
   - ends_at > now() (not already expired)
   - No pending (unpaid) Razorpay order exists for this subscription
4. For each eligible subscription:
   a. Determine amount: locked_price based on billing_cycle (monthly or annual)
   b. Call PaymentGatewayInterface::createOrder(amount, 'INR', receipt_id, notes)
   c. Update subscription: razorpay_order_id = new order ID
   d. Log to payment_events: action = 'renewal_order_created'
   e. Audit log: action = 'subscription.renewal_initiated', entity = subscription
   f. Dispatch SubscriptionRenewalInitiated event
5. Has --dry-run option
6. Has --limit option to cap processing
7. Processes in chunks (50 per batch)
8. Logs progress: "Created renewal order for tenant {id}, subscription {id}, amount {amount}"
```

**CRITICAL:** The Razorpay `createOrder()` call is OUTSIDE any database transaction. Sequence: call Razorpay → get order_id → DB update (set razorpay_order_id) → audit log.

### 6.2 `TransitionPastDueSubscriptionsCommand`

```
php artisan billing:transition-past-due
```

**Schedule:** Daily at 03:00 UTC

**Logic:**

```
1. Find all subscriptions WHERE:
   - status = 'active'
   - ends_at IS NOT NULL
   - ends_at < now() (expired without renewal payment)
2. For each:
   a. Transition status to 'past_due' (via entity method with state machine guard)
   b. Audit log: action = 'subscription.payment_overdue', old_status = 'active', new_status = 'past_due'
   c. Dispatch SubscriptionPaymentOverdue event (for future notification wiring)
3. Uses pessimistic locking (lockForUpdate) on each subscription
4. Has --dry-run option
```

### 6.3 `SuspendPastDueSubscriptionsCommand`

```
php artisan billing:suspend-past-due
```

**Schedule:** Daily at 04:00 UTC

**Logic:**

```
1. $gracePeriodDays = $this->platformSettings->getInt('billing.payment_grace_period_days', 7)
2. Find all subscriptions WHERE:
   - status = 'past_due'
   - ends_at + $gracePeriodDays < now()
3. For each:
   a. Transition status to 'suspended' (via entity method)
   b. Audit log: action = 'subscription.suspended', reason = 'payment_grace_period_expired'
   c. Dispatch SubscriptionSuspended event
4. Uses pessimistic locking
5. Has --dry-run option
```

### 6.4 `RetryRenewalPaymentsCommand` (Optional but recommended)

```
php artisan billing:retry-renewal-payments
```

**Schedule:** Every 12 hours (or configurable)

**Logic:**

```
1. $maxRetries = $this->platformSettings->getInt('billing.max_renewal_retry_attempts', 3)
2. $retryInterval = $this->platformSettings->getInt('billing.renewal_retry_interval_hours', 24)
3. Find all subscriptions WHERE:
   - status = 'past_due'
   - Last renewal order was created > $retryInterval hours ago
   - Retry count < $maxRetries
4. For each:
   a. Create new Razorpay Order (same amount, same locked price)
   b. Update razorpay_order_id
   c. Increment retry counter
   d. Log to payment_events: action = 'renewal_retry_order_created', attempt = N
5. Has --dry-run option
```

### 6.5 Scheduler Registration

```php
// routes/console.php
Schedule::command('billing:generate-renewal-orders')->dailyAt('02:00');
Schedule::command('billing:transition-past-due')->dailyAt('03:00');
Schedule::command('billing:suspend-past-due')->dailyAt('04:00');
Schedule::command('billing:retry-renewal-payments')->twiceDaily(6, 18);
```

**Order matters:** Generate renewals (02:00) → transition overdue to past_due (03:00) → suspend expired grace periods (04:00). Retry runs independently twice daily.

---

## 7. Webhook Handler Extension

The existing `ProcessWebhookUseCase` (12A) routes `payment.captured` and `order.paid` to `ActivateSubscriptionOnPaymentUseCase`. In Phase 12B, this use case must handle two scenarios:

### 7.1 Initial Payment (12A — unchanged)

- Subscription status is `pending_payment`
- Transition to `active`
- Set `starts_at` and `ends_at`

### 7.2 Renewal Payment (12B — new)

- Subscription status is `active`, `past_due`, or `suspended`
- The `razorpay_order_id` on the subscription matches the webhook's order_id
- Extend `ends_at` by one billing cycle (from the CURRENT `ends_at`, not from payment date — unless `suspended`, in which case recalculate from now)
- If `past_due` or `suspended`: transition back to `active`
- Clear retry counter

The `ActivateSubscriptionOnPaymentUseCase` must detect whether this is an initial payment or a renewal by checking the current status. The branching logic:

```
if status == 'pending_payment':
    // Initial payment (12A logic)
    activate(starts_at = now, ends_at = now + cycle)

elif status in ['active', 'past_due']:
    // Renewal payment
    extend(ends_at = current_ends_at + cycle)
    if status == 'past_due': transition to 'active'

elif status == 'suspended':
    // Late renewal payment
    reactivate(starts_at = now, ends_at = now + cycle)
    transition to 'active'
```

---

## 8. Migration Plan

### 8.1 `tenant_subscriptions` — New Columns

| Column | Type | Purpose |
|---|---|---|
| `renewal_retry_count` | INT UNSIGNED DEFAULT 0 | Tracks how many auto-retry attempts have been made for the current billing cycle |
| `last_renewal_attempt_at` | TIMESTAMP NULL | When the last renewal order was created (for retry interval calculation) |
| `suspended_at` | TIMESTAMP NULL | When the subscription was suspended (for reporting) |
| `grace_period_ends_at` | TIMESTAMP NULL | Calculated: `ends_at + grace_period_days` — when suspension kicks in |

### 8.2 Verify Existing Columns

The developer must verify that `razorpay_order_id` exists (added in 12A). Also verify `starts_at`, `ends_at`, `billing_cycle` are present and functioning.

---

## 9. API Changes

### 9.1 Modified Endpoints

| Method | Endpoint | Change |
|---|---|---|
| `GET` | `/api/admin/tenants/{tenantId}/subscription` | Response now includes `renewal_status` block: `next_renewal_date`, `renewal_retry_count`, `grace_period_ends_at`, `is_past_due`, `is_suspended` |
| `GET` | `/api/admin/subscriptions` | Filterable by new statuses: `past_due`, `suspended`. New column in list: `renewal_status` |
| `GET` | `/api/tenant/usage` | If subscription is `past_due`: include warning in response with grace period countdown. If `suspended`: show "subscription suspended" state. |

### 9.2 New Endpoints

| Method | Endpoint | Permission | Description |
|---|---|---|---|
| `POST` | `/api/admin/tenants/{tenantId}/subscription/extend` | `billing.manage` | Manually extend `ends_at` by a specified duration. Audit-logged with reason. |
| `POST` | `/api/admin/tenants/{tenantId}/subscription/reactivate` | `billing.manage` | Reactivate a `suspended` subscription with `skip_payment` or retry. |
| `GET` | `/api/admin/subscriptions/past-due` | `billing.view` | List all `past_due` subscriptions with grace period countdown. Quick action view for Super Admin. |
| `GET` | `/api/admin/subscriptions/suspended` | `billing.view` | List all `suspended` subscriptions. Quick action view. |

### 9.3 Response Shape — Renewal Status Block

Added to subscription response when subscription is `active`, `past_due`, or `suspended`:

```json
{
    "renewal_status": {
        "next_renewal_date": "2026-03-24T00:00:00Z",
        "renewal_order_id": "order_xyz123",
        "renewal_retry_count": 1,
        "last_renewal_attempt_at": "2026-03-24T02:00:00Z",
        "grace_period_ends_at": "2026-04-07T00:00:00Z",
        "is_past_due": false,
        "is_suspended": false
    }
}
```

---

## 10. DDD Layer Requirements

### 10.1 Domain Layer — Modifications

| Component | Change |
|---|---|
| `SubscriptionStatus` | Add `PAST_DUE = 'past_due'` and `SUSPENDED = 'suspended'` cases. Update `canTransitionTo()` with all new transitions from §4.2. Update `isActiveForAccess(): bool` to return true for `active` AND `past_due` (grace period access). |
| `TenantSubscriptionEntity` | Add methods: `markPastDue()`, `suspend()`, `reactivateOnPayment(DateTimeImmutable)`, `extendBillingCycle(BillingCycle)`, `manualExtend(DateTimeImmutable newEndsAt)`. Add properties: `renewalRetryCount`, `lastRenewalAttemptAt`, `suspendedAt`, `gracePeriodEndsAt`. |
| NEW: `SubscriptionRenewalInitiated` event | Dispatched when a renewal order is created |
| NEW: `SubscriptionPaymentOverdue` event | Dispatched when subscription transitions to `past_due` |
| NEW: `SubscriptionSuspended` event | Dispatched when grace period expires and subscription is suspended |
| NEW: `SubscriptionReactivated` event | Dispatched when `past_due` or `suspended` → `active` via payment |

### 10.2 Application Layer — New Components

| Component | Purpose |
|---|---|
| `GenerateRenewalOrdersUseCase` | Core logic for the renewal command. Finds eligible subscriptions, creates Razorpay Orders, updates records. |
| `TransitionPastDueUseCase` | Transitions expired-without-payment subscriptions to `past_due`. |
| `SuspendPastDueUseCase` | Suspends subscriptions whose grace period has expired. |
| `RetryRenewalPaymentsUseCase` | Auto-retries failed renewal payments with new Razorpay Orders. |
| `ExtendSubscriptionUseCase` | Manual extension by Super Admin. |
| `ReactivateSubscriptionUseCase` | Manual reactivation of `suspended` subscriptions. |
| `GetPastDueSubscriptionsQuery` | List past-due subscriptions with grace countdown. |
| `GetSuspendedSubscriptionsQuery` | List suspended subscriptions. |

### 10.3 Application Layer — Modifications

| Component | Change |
|---|---|
| `ActivateSubscriptionOnPaymentUseCase` | **MODIFY**: Add renewal detection logic (§7.2). If current status is `active`/`past_due`/`suspended`, extend `ends_at` instead of setting initial dates. Reset `renewalRetryCount`. |
| `GetTenantUsageQuery` | **MODIFY**: Include `past_due` warning and `suspended` state in usage response. |

### 10.4 Infrastructure Layer

| Component | Change |
|---|---|
| `EloquentTenantQuotaService` | **MODIFY**: Update subscription status check to recognize `past_due` as active for quota purposes. Currently checks `active` and `trial`. Must add `past_due`. |
| `TenantSubscriptionRecord` | **MODIFY**: Add new columns to `$fillable` and casts. |
| `TenantSubscriptionRepositoryInterface` | **MODIFY**: Add `findExpiringSubscriptions(DateTimeImmutable $before): array`, `findPastDueSubscriptions(): array`, `findSuspendableSubscriptions(DateTimeImmutable $graceExpiry): array` |

---

## 11. Frontend Changes

### 11.1 Super Admin — Subscription Tab Updates

- `past_due` status badge: **Red** with pulsing indicator
- `suspended` status badge: **Dark Red / Black**
- Renewal status section showing: next renewal date, retry count, grace period countdown
- Action buttons: "Retry Payment", "Extend Subscription", "Reactivate", "Cancel"

### 11.2 Super Admin — Billing Dashboard Additions

- New filtered views: "Past Due" and "Suspended" subscription lists accessible from the billing section
- Count badges in sidebar: number of past-due and suspended subscriptions (polling or on page load)

### 11.3 Super Admin — Platform Settings Updates

Add new billing settings to the Platform Settings form (Module C from 11C):

- **Renewal Settings**: `renewal_days_before_expiry` (number), `max_renewal_retry_attempts` (number), `renewal_retry_interval_hours` (number)
- **Grace Period**: `payment_grace_period_days` (number)

### 11.4 Tenant Admin — Usage Dashboard Updates

- If `past_due`: amber warning banner — "Your subscription payment is overdue. Please contact your administrator to resolve payment. Your access will be restricted on {grace_period_ends_at}."
- If `suspended`: red alert banner — "Your subscription has been suspended due to non-payment. Contact your administrator to restore access."
- If renewal is upcoming (within renewal window): informational note — "Your subscription renews on {ends_at}."

---

## 12. Security & Financial Safety Requirements

| Requirement | Detail |
|---|---|
| **Renewal amount uses locked price** | Never the plan's current price. The `locked_price_*_cents` on the subscription record is the source of truth. |
| **No Razorpay calls inside transactions** | Renewal order creation follows the same pattern as 12A: Razorpay API call → then DB transaction. |
| **Pessimistic locking on all transitions** | `past_due`, `suspended`, `reactivate` all require `lockForUpdate`. |
| **Idempotent commands** | Every scheduled command must be safe to run multiple times. Check for existing pending orders before creating new ones. |
| **Idempotent webhooks** | `payment_events` idempotency from 12A continues to apply for renewal webhooks. |
| **Amount verification on renewal** | Same as 12A — webhook amount must match locked price. |
| **Audit trail** | Every renewal attempt, past-due transition, suspension, manual extension, and reactivation is logged to `admin_audit_logs`. |
| **Clock injection** | All scheduled commands and use cases use `ClockInterface`, never `now()`. |
| **Grace period access** | `past_due` tenants retain access. This is intentional — it's a business decision to give grace. The `TenantQuotaService` must be updated accordingly. |
| **Events outside transactions** | All domain events dispatched after commit. |

---

## 13. What Phase 12B Does NOT Include

| Excluded Item | Reason | Deferred To |
|---|---|---|
| Razorpay Subscriptions API | Avoided by design — our system controls the schedule | Never (architectural decision) |
| Invoice generation (PDF) | Separate bounded context | Phase 12C |
| Refund workflows | Requires refund domain model | Phase 12C |
| Email notifications for renewal/past-due/suspension | Dispatch events only; notification delivery deferred | Notification Infrastructure phase |
| Proration on mid-cycle plan changes | Complex calculation | Future |
| Automatic card-on-file charging (without checkout) | Requires Razorpay token/emandate setup | Future |
| Tenant self-service payment retry | Tenant Owner UI for paying overdue subscriptions | Future |
| Billing Admin (L6) dashboard | Separate role context | Phase 12D |
| Payment receipts | Requires invoice/receipt system | Phase 12C |

---

## 14. Quality Gate — Phase 12B Complete

### Security & Financial Safety Gates (BLOCKING)

- [ ] Renewal order uses locked price, not current plan price
- [ ] No Razorpay API calls inside database transactions
- [ ] Pessimistic locking on every status transition (`past_due`, `suspended`, `reactivate`)
- [ ] Idempotent renewal command (running twice doesn't create duplicate orders)
- [ ] Idempotent suspension command (running twice doesn't double-suspend)
- [ ] Amount verification on renewal webhooks matches locked price
- [ ] All transitions audit-logged with actor, old/new status, reason
- [ ] Grace period access: `past_due` tenant retains plan features
- [ ] `suspended` tenant falls back to platform default limits
- [ ] `ClockInterface` used in all commands and use cases

### Functional Gates (BLOCKING)

- [ ] Renewal order created N days before expiry (configurable N)
- [ ] Webhook payment for active subscription extends `ends_at` by one cycle
- [ ] `ends_at` extension calculated from current `ends_at`, not payment date
- [ ] Subscription transitions to `past_due` when `ends_at` passes without payment
- [ ] `past_due` subscription transitions to `suspended` after grace period
- [ ] Payment during `past_due` reactivates to `active` and extends cycle
- [ ] Payment during `suspended` reactivates to `active` with recalculated dates
- [ ] Super Admin manual extension works with audit trail
- [ ] Super Admin reactivation with `skip_payment` works
- [ ] `--dry-run` mode works on all four commands
- [ ] Past-due and suspended subscription list endpoints work with filters
- [ ] Tenant usage dashboard shows appropriate warnings for each status
- [ ] Platform settings for billing configuration save and apply correctly

### Architecture Gates (BLOCKING)

- [ ] PHPStan Level 5: zero new errors
- [ ] All tests pass (zero regression)
- [ ] Domain layer has zero `Illuminate` imports in new files
- [ ] Controllers < 20 lines per method
- [ ] Events dispatched outside transactions
- [ ] `env()` check: zero results in `app/`, `routes/`, `database/`
- [ ] All four commands delegate to Application layer UseCases (thin CLI wrappers)

### Test Requirements

- [ ] Unit tests: `SubscriptionStatus` transitions for `past_due` and `suspended`
- [ ] Unit tests: `TenantSubscriptionEntity` renewal methods (extend, markPastDue, suspend, reactivate)
- [ ] Unit tests: `GenerateRenewalOrdersUseCase` — eligible subscriptions, skips already-pending, dry-run
- [ ] Unit tests: `ActivateSubscriptionOnPaymentUseCase` — renewal path (extend vs initial)
- [ ] Unit tests: `SuspendPastDueUseCase` — grace period calculation, suspension
- [ ] Feature tests: Renewal command creates orders for expiring subscriptions
- [ ] Feature tests: Webhook extends `ends_at` for active subscription
- [ ] Feature tests: Past-due transition when `ends_at` passes
- [ ] Feature tests: Suspension after grace period
- [ ] Feature tests: Reactivation via webhook payment
- [ ] Feature tests: Manual extension endpoint
- [ ] Feature tests: `past_due` tenant retains quota access
- [ ] Feature tests: `suspended` tenant loses quota access
- [ ] Feature tests: Platform settings for billing configuration
- [ ] Minimum 20–25 new tests expected

---

## 15. Implementation Plan Format

Same format as previous phases:

| # | Section | Description |
|---|---|---|
| 1 | Executive Summary | What gets built, what does NOT |
| 2 | Gap Analysis | Verify 12A completion, existing columns, command infrastructure |
| 3 | Architecture Decisions | Renewal strategy, grace period behavior, retry logic |
| 4 | Migration Plan | New columns on `tenant_subscriptions` |
| 5 | Domain Layer Changes | Status extensions, entity methods, new events |
| 6 | Application Layer Changes | New UseCases, modified webhook handler, new queries |
| 7 | Infrastructure Layer Changes | Quota service update, repository methods |
| 8 | HTTP Layer Changes | New endpoints, response shape updates |
| 9 | Scheduled Commands | Four new commands with scheduling |
| 10 | Platform Settings | New billing configuration keys |
| 11 | Frontend Changes | Status badges, warnings, settings form, action buttons |
| 12 | Implementation Sequence | Ordered steps with dependencies |
| 13 | Test Plan | Every test file with description |
| 14 | Quality Gate Verification | Checklist from §14 |
| 15 | Risk Register | Identified risks with severity and mitigation |
| 16 | File Manifest | Every new and modified file |

---

## 16. Constraints & Reminders

### Architecture Constraints

- We do NOT use Razorpay Subscriptions API. Our system owns the billing clock.
- `PaymentGatewayInterface::createOrder()` from 12A is reused. No new gateway methods needed.
- Renewal extends from `ends_at`, not from payment date. This prevents billing drift.
- `past_due` is an active-access state. `suspended` is a no-access state. This distinction is critical for `TenantQuotaService`.
- Scheduled commands must run in the correct order: generate → transition → suspend.
- All four commands must have `--dry-run` and `--limit` options.

### Docker Environment

- Container: Alpine Linux — use `sh` not `bash`
- Container name: `ubotz_backend`
- Database: `ubotz_mysql`

### What NOT to Do

- Do NOT use Razorpay Subscriptions API.
- Do NOT call Razorpay API inside `DB::transaction()`.
- Do NOT calculate `ends_at` from payment date for renewals (use current `ends_at` + cycle).
- Do NOT auto-cancel `past_due` subscriptions. Only suspend. Cancellation is a manual Super Admin action.
- Do NOT send emails in this phase. Dispatch events only.
- Do NOT treat `suspended` as a terminal state. It's recoverable.
- Do NOT skip audit logging on any status transition.
- Do NOT use `now()` in application or domain layers. Use `ClockInterface`.
- Do NOT modify the existing `ExpireTrialSubscriptionsCommand`. It handles trials only. Renewal is a separate concern.

---

## 17. Definition of Done

Phase 12B is complete when:

1. The implementation plan has been reviewed and approved by the Principal Engineer.
2. All code is implemented per the approved plan.
3. All quality gates in §14 pass.
4. A Principal Engineer audit confirms zero critical or high findings.
5. All findings from audit are resolved.
6. A full renewal cycle has been demonstrated in test/staging: active → renewal order → payment → extended. AND: active → expiry → past_due → grace → suspended → retry → reactivated.
7. The Phase 12B Completion Report is signed off.

---

> **Phase 12A proved the platform can charge money. Phase 12B proves the platform can keep charging money. The difference between a one-time sale and a recurring revenue business is exactly this phase. A missed renewal is not a bug — it's lost revenue. A silent suspension is not a feature — it's a customer who thinks they have access but doesn't. Make the billing clock reliable, visible, and auditable.**

*End of Document — UBOTZ 2.0 Phase 12B Developer Instructions — March 8, 2026*

---

# Phase 12B Completion Report — Audit Results

| Field | Value |
|---|---|
| **Phase** | 12B |
| **Status** | **PARTIALLY COMPLETE (CRITICAL BACKEND BUG & MISSING FRONTEND UI)** |
| **Audit Date** | March 16, 2026 |
| **Auditor** | Antigravity AI |

## 1. Executive Summary

Phase 12B is successfully implemented in the backend regarding the billing clock and state machine transitions. All four scheduled commands (`generate-renewal-orders`, `transition-past-due`, `suspend-past-due`, `retry-renewal-payments`) are present and follow the architectural requirements (DDR compliance, thin CLI wrappers, idempotent logic). The Domain and Infrastructure layers are robust, with correct quota enforcement for `past_due` status.

However, two significant gaps were identified:
1.  **Critical Backend Bug**: `ActivateSubscriptionOnPaymentUseCase` ignores renewal payments if the subscription is still in the `active` status. This prevents proactive renewals (e.g., payment made 2 days before expiry).
2.  **Missing Frontend UI**: The required warning banners for `past_due` status and blocking overlays for `suspended` status are missing from the Tenant Admin Dashboard (`UsageDashboard` and `BillingStatusBanner`).

## 2. Component Verification

### 2.1 Backend: Scheduled Commands (100% Verified)
- [x] **`GenerateRenewalOrdersUseCase`**: Correctly identifies expiring active subscriptions and creates Razorpay Orders safely outside transactions.
- [x] **`TransitionPastDueUseCase`**: Correctly transitions overdue active subscriptions to `past_due` with grace period calculation.
- [x] **`SuspendPastDueUseCase`**: Correctly suspends `past_due` subscriptions after grace period expiry.
- [x] **`RetryRenewalPaymentsUseCase`**: Implements automated retry logic for failed renewals.
- [x] **Scheduler (Console.php)**: All commands are registered with correct daily/twice-daily intervals.

### 2.2 Domain & Infrastructure (100% Verified)
- [x] **`TenantSubscriptionEntity`**: Updated with `markPastDue`, `suspend`, and `setGracePeriodEndsAt`.
- [x] **`SubscriptionStatus`**: Correctly includes `PAST_DUE` and `SUSPENDED`. `isActiveForAccess()` correctly includes `past_due`.
- [x] **`EloquentTenantQuotaService`**: Verified to include `past_due` in active status checks, ensuring grace period access.
- [x] **`Repository Locking`**: `findByIdForUpdate` and `findByRazorpayOrderIdForUpdate` use `lockForUpdate()`.

### 2.3 Webhook Handling (70% Verified - 1 Critical Finding)
- [x] **Idempotency**: `ProcessWebhookUseCase` correctly checks `payment_events` to prevent double-processing.
- [!] **Renewal Bug**: `ActivateSubscriptionOnPaymentUseCase` (Lines 41-43) returns `null` if the subscription is already `active`. **Finding**: This blocks renewals initiated before the `ends_at` date. Fixed needed to extend `ends_at` for active subscriptions.

### 2.4 Frontend UI (40% Verified - 1 Major Finding)
- [x] **Super Admin Dashboard**: `StatusBadge` support for `past_due`/`suspended` exists. Lists of overdue/suspended subscriptions are implemented.
- [ ] **Tenant Admin Dashboard**: **MAJOR GAP**: Missing banners in `UsageDashboard` and `BillingStatusBanner`.
- [ ] **Access Restriction**: `TenantAuthGuard` does not implement a full-page blocking overlay for `suspended` tenants.

## 3. Findings & Required Remediation

| ID | Severity | Find | Remediation |
|---|---|---|---|
| **F-12B-01** | **CRITICAL** | `ActivateSubscriptionOnPaymentUseCase` ignores payments for `active` subscriptions. | Modify the use case to allow `active` status and call `extendBillingCycle()` instead of returning `null`. |
| **F-12B-02** | **MAJOR** | Tenant Dashboard missing warnings for `past_due` and `suspended` statuses. | Implement conditional banners in `UsageDashboard.tsx` and a blocking component for `suspended` state. |
| **F-12B-03** | **MINOR** | `BillingStatusBanner.tsx` is currently a static or incomplete template. | Dynamically render subscription details and status-based warnings. |

## 4. Final Verification Status: **PARTIALLY COMPLETED**

The core engine is functional. Once the proactive renewal bug is patched and the frontend banners are wired to the existing backend data, Phase 12B will be fully compliant.

---