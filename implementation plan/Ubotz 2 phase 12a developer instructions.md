# UBOTZ 2.0 — Phase 12A Developer Instructions

## Razorpay Platform → Tenant Payment Integration

| Field | Value |
|---|---|
| **Document Type** | Developer Instruction (Pre-Implementation Brief) |
| **Phase** | 12A |
| **Date** | March 7, 2026 |
| **Issued By** | Principal Engineer / Architecture Auditor |
| **Audience** | Implementation Developer |
| **Expected Deliverable** | Phase 12A Implementation Plan (same format as 10A–11C plans) |
| **Prerequisites** | Phase 11A COMPLETE (subscription plan management) + Phase 11B COMPLETE (quota enforcement) + Phase 11C COMPLETE (subscription frontend) |

> **This phase connects real money to the subscription system. Every decision must be made with the assumption that production tenants are paying real rupees through this code. There is no "we'll fix it later" for financial operations. Idempotency, audit trails, pessimistic locking, and immutable records are not optional — they are the minimum.**

---

## 1. Mission Statement

Phase 12A connects the existing subscription management system to Razorpay's Orders API, enabling Super Admins to assign paid plans that require payment before activation. When a Super Admin assigns a paid plan to a tenant, the system creates a Razorpay Order, generates a payment link, and holds the subscription in `pending_payment` status until Razorpay confirms payment via webhook. Trial plans continue to activate immediately without payment.

**This is the minimum viable payment loop:**

```
Super Admin assigns paid plan
    → Backend creates Razorpay Order
    → Subscription created as `pending_payment`
    → Payment link sent/displayed for Tenant Owner
    → Tenant Owner pays via Razorpay Checkout
    → Razorpay sends webhook (payment.captured / order.paid)
    → Backend verifies signature, activates subscription
    → Quota enforcement kicks in with new plan limits
```

**What this phase does NOT include:** recurring auto-renewal, invoices, refunds, tenant self-service plan selection, Razorpay Subscriptions API (recurring billing). Those are Phase 12B+.

---

## 2. Business Context

### 2.1 Current State

Phase 11A built manual subscription management — Super Admin assigns plans, subscriptions activate immediately. This works for trials and for manually-billed tenants (offline payments). But it has no mechanism to collect payment before activating a paid plan. Super Admins must trust that tenants will pay after activation.

### 2.2 What Changes

After Phase 12A, the subscription assignment flow splits into two paths:

| Plan Type | Assignment Flow | Activation |
|---|---|---|
| Trial plan (`is_trial: true`) | Super Admin assigns → subscription created as `trial` | **Immediate** (no payment required) |
| Paid plan (non-trial) | Super Admin assigns → Razorpay Order created → subscription created as `pending_payment` → payment link generated | **After webhook confirms payment** |

### 2.3 Who Pays Whom

This is **Platform (Ubotz) billing Tenant (institute)**. The payer is the Tenant Owner. The payment goes to the platform's Razorpay account. This is NOT tenant → student billing.

---

## 3. Business Rules (NON-NEGOTIABLE)

### 3.1 Payment Flow Rules

| Rule ID | Rule | Detail |
|---|---|---|
| BR-01 | Trial plans activate immediately without payment. Paid plans require payment confirmation before activation. | The `AssignSubscriptionToTenantUseCase` must branch: if trial → status `trial` (existing behavior). If paid → status `pending_payment` + create Razorpay Order. |
| BR-02 | A Razorpay Order is created for each paid subscription assignment. The order amount equals the plan's locked price for the selected billing cycle. | `locked_price_monthly_cents` or `locked_price_annual_cents` based on the billing cycle chosen at assignment time. Amount sent to Razorpay in **paise** (1 INR = 100 paise = 100 cents in our system). |
| BR-03 | The Razorpay Order ID (`razorpay_order_id`) is stored on the `tenant_subscriptions` record. This links the subscription to the payment. | Immutable after creation. Used for webhook correlation. |
| BR-04 | When Razorpay confirms payment (via `payment.captured` or `order.paid` webhook), the subscription transitions from `pending_payment` to `active`. | The webhook handler must verify: (1) signature is valid, (2) `order_id` matches an existing `pending_payment` subscription, (3) amount matches locked price, (4) event has not been processed before (idempotency via `payment_events` table). |
| BR-05 | If payment fails or is not completed within a configurable timeout (default: 48 hours), the subscription remains in `pending_payment`. It does NOT auto-cancel. | Super Admin can manually cancel or re-trigger payment. A scheduled command can optionally expire stale `pending_payment` subscriptions (configurable). |
| BR-06 | Super Admin can still assign plans without payment (manual override) for offline-payment tenants. | A `skip_payment` flag on the assignment request. When true, paid plans activate immediately as `active` (existing behavior). This must be audit-logged with reason `manual_override`. |
| BR-07 | The payment link/checkout URL is returned in the API response when a paid plan is assigned. Super Admin can share this with the Tenant Owner. | The response includes `razorpay_order_id` and a `checkout_url` or the data needed to open Razorpay Checkout on the frontend. |
| BR-08 | Every payment event (success, failure, webhook receipt) is logged to `payment_events` with full payload. | The `ProcessWebhookUseCase` already does this. Extend it to handle the new event types. |
| BR-09 | Amount verification is mandatory. The webhook payload amount must match the subscription's locked price exactly. Any mismatch is logged and the subscription is NOT activated. | This prevents partial payments or tampered amounts from activating subscriptions. |
| BR-10 | A tenant with a `pending_payment` subscription is treated as having NO active subscription for quota purposes. | The `TenantQuotaService` already checks for `active` or `trial` status. `pending_payment` is not in that set, so the tenant falls back to platform default limits. |

### 3.2 State Machine Extension

The existing subscription state machine (from 11A §4) must be extended with `pending_payment`:

```
                    ┌──────────────────────────────────────┐
                    │                                      │
                    ▼                                      │
    ┌─────────┐  assign    ┌──────────────────┐  pay     ┌─────────┐
    │  (none) │ ─────────► │ pending_payment  │ ───────► │ active  │
    │         │  (paid)    │                  │ (webhook)│         │
    └─────────┘            └───────┬──────────┘          └────┬────┘
         │                         │                          │
         │  assign (trial)         │ cancel                   │ cancel
         │                         │                          │
         ▼                         ▼                          ▼
    ┌─────────┐            ┌───────────┐              ┌───────────┐
    │  trial  │            │ cancelled │              │ cancelled │
    └────┬────┘            └───────────┘              └───────────┘
         │
         │ expire
         ▼
    ┌─────────┐
    │ expired │
    └─────────┘
```

### New Transitions

| From | To | Trigger | Actor |
|---|---|---|---|
| (none) | `pending_payment` | Super Admin assigns a paid (non-trial) plan | Super Admin |
| `pending_payment` | `active` | Razorpay webhook confirms payment | System (webhook) |
| `pending_payment` | `cancelled` | Super Admin cancels before payment | Super Admin |
| (none) | `active` | Super Admin assigns paid plan with `skip_payment: true` | Super Admin (manual override) |

### Unchanged Transitions (from 11A)

All existing transitions remain valid: `(none) → trial`, `trial → active`, `trial → expired`, `trial → cancelled`, `active → cancelled`.

### Forbidden Transitions (additions)

| From | To | Reason |
|---|---|---|
| `pending_payment` | `trial` | Cannot downgrade to trial from pending payment |
| `pending_payment` | `expired` | Only trials expire |
| `cancelled` | `pending_payment` | Terminal state — create new subscription |
| `expired` | `pending_payment` | Terminal state — create new subscription |

---

## 4. Architecture — What Already Exists

### 4.1 Platform-Level Payment Infrastructure (Verified from file tree)

| Component | Location | Status |
|---|---|---|
| `PaymentGatewayInterface` | `Domain/SuperAdminDashboard/Subscription/Contracts/` | EXISTS — contract for gateway operations |
| `RazorpaySubscriptionGateway` | `Infrastructure/PaymentGateway/` | EXISTS — implements gateway interface |
| `WebhookAction` | `WebApi/SuperAdminDashboard/Subscription/Controllers/` | EXISTS — unauthenticated webhook endpoint |
| `ProcessWebhookUseCase` | `Application/SuperAdminDashboard/Subscription/UseCases/` | EXISTS — signature verification + idempotency |
| `GatewayAssignSubscriptionPlanUseCase` | `Application/SuperAdminDashboard/Subscription/UseCases/` | EXISTS — gateway-aware assignment (preserved per C-01 from 11A audit) |
| `PaymentEventRecord` | `Infrastructure/Database/Models/` | EXISTS — `payment_events` table for idempotency |
| `EloquentPaymentEventRepository` | `Infrastructure/Database/Repositories/` | EXISTS |
| `CreateGatewaySubscriptionData` DTO | `Domain/SuperAdminDashboard/Subscription/DTOs/` | EXISTS — data contract for gateway calls |
| `GatewaySubscriptionResult` DTO | `Domain/SuperAdminDashboard/Subscription/DTOs/` | EXISTS — result contract from gateway |
| `PaymentEventStatus` VO | `Domain/SuperAdminDashboard/Subscription/ValueObjects/` | EXISTS — `pending`, `completed`, `failed`, `refunded` |
| `WebhookSignatureInvalidException` | `Domain/SuperAdminDashboard/Subscription/Exceptions/` | EXISTS |
| `PaymentGatewayException` | `Domain/SuperAdminDashboard/Subscription/Exceptions/` | EXISTS |
| `SubscriptionPaymentReceived` event | `Domain/SuperAdminDashboard/Subscription/Events/` | EXISTS |
| `FakePaymentGateway` | `tests/Fakes/` | EXISTS — test double for gateway |
| `RazorpaySubscriptionGatewayTest` | `tests/Unit/Infrastructure/PaymentGateway/` | EXISTS |
| `ProcessWebhookUseCaseTest` | `tests/Unit/Application/SuperAdminDashboard/Subscription/UseCases/` | EXISTS |
| `WebhookActionTest` | `tests/Feature/WebApi/SuperAdminDashboard/Subscription/Controllers/` | EXISTS |
| `SubscriptionServiceProvider` | `app/Providers/` | EXISTS — binds gateway interface |
| `config/services.php` | Razorpay keys configured | EXISTS — `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` |
| `razorpay/razorpay` SDK | `composer.json` | EXISTS |

### 4.2 Subscription Infrastructure (Phase 11A)

| Component | Status |
|---|---|
| `AssignSubscriptionToTenantUseCase` | EXISTS — currently creates subscriptions as `trial` or `active` |
| `ChangeTenantPlanUseCase` | EXISTS — cancel + create atomically |
| `CancelSubscriptionUseCase` | EXISTS |
| `SubscriptionStatus` value object | EXISTS — supports `trial`, `active`, `cancelled`, `expired`. Does NOT yet include `pending_payment`. |
| `tenant_subscriptions` table | EXISTS — has `gateway_subscription_id`, `gateway_plan_id` columns (added in Phase 8 migrations) |
| Pessimistic locking on transitions | EXISTS — `lockForUpdate` in all status-changing UseCases |
| Idempotency key | EXISTS — on `tenant_subscriptions` table |

### 4.3 What Must Be Built or Modified

| # | Component | Action | Severity |
|---|---|---|---|
| 1 | `SubscriptionStatus` value object | Add `PENDING_PAYMENT` case with transition rules | **CRITICAL** |
| 2 | `AssignSubscriptionToTenantUseCase` | Branch: trial → immediate activation, paid → create Razorpay Order + `pending_payment` status | **CRITICAL** |
| 3 | `RazorpaySubscriptionGateway` | Add `createOrder(amount_paise, currency, receipt_id): RazorpayOrderResult` method | **HIGH** |
| 4 | `PaymentGatewayInterface` | Add `createOrder()` to the contract | **HIGH** |
| 5 | `ProcessWebhookUseCase` | Extend to handle `payment.captured` / `order.paid` → activate subscription | **CRITICAL** |
| 6 | `ActivateSubscriptionOnPaymentUseCase` | NEW — called by webhook handler, transitions `pending_payment` → `active` | **HIGH** |
| 7 | `tenant_subscriptions` migration | Add `razorpay_order_id` column (VARCHAR, nullable, indexed) | **HIGH** |
| 8 | Frontend: Plan assignment flow | Modify to show payment link/checkout when paid plan assigned | **MEDIUM** |
| 9 | `ExpirePendingPaymentsCommand` | NEW — optional scheduled command to expire stale `pending_payment` subscriptions | **LOW** |
| 10 | Tests | New tests for the entire payment flow | **HIGH** |

---

## 5. Razorpay Orders API — Technical Reference

### 5.1 Create Order

```
POST https://api.razorpay.com/v1/orders

{
    "amount": 49900,       // In paise (₹499.00)
    "currency": "INR",
    "receipt": "sub_123",  // Our subscription ID or idempotency key
    "notes": {
        "tenant_id": 42,
        "plan_code": "starter_monthly",
        "subscription_id": 123
    }
}

Response:
{
    "id": "order_EKwxwAgItmmXdp",
    "amount": 49900,
    "currency": "INR",
    "status": "created",
    "receipt": "sub_123"
}
```

### 5.2 Webhook Events

Razorpay sends webhooks for payment lifecycle events. The events relevant to Phase 12A:

| Event | When | Action |
|---|---|---|
| `payment.captured` | Payment successfully captured | Activate subscription |
| `order.paid` | Order fully paid | Alternative activation trigger (redundant safety) |
| `payment.failed` | Payment attempt failed | Log event, subscription stays `pending_payment` |

### 5.3 Webhook Signature Verification

Already implemented in `ProcessWebhookUseCase`. The existing logic computes `hash_hmac('sha256', $payload, $webhookSecret)` and compares against the `X-Razorpay-Signature` header. This must continue to work for the new event types.

### 5.4 Amount Convention

| Our System | Razorpay | Conversion |
|---|---|---|
| `price_monthly_cents` (integer, e.g., `49900`) | `amount` in paise (integer, e.g., `49900`) | **1:1 mapping** — our cents ARE paise for INR |
| Display: `₹499.00` | | Divide by 100 |

Since Ubotz uses `_cents` suffix and stores prices as integer paise (for INR), the amount sent to Razorpay is the raw `locked_price_*_cents` value. No conversion needed.

---

## 6. API Changes

### 6.1 Modified Endpoints

| Method | Endpoint | Change |
|---|---|---|
| `POST` | `/api/admin/tenants/{tenantId}/subscription` | **Extended response**: When assigning a paid plan, response now includes `razorpay_order_id`, `payment_status: "pending_payment"`, and `checkout_data` (Razorpay key_id + order_id for frontend checkout widget). New optional request field: `skip_payment` (boolean, default `false`). |
| `POST` | `/api/admin/tenants/{tenantId}/subscription/change-plan` | Same extension as above for paid plan upgrades/downgrades. Old subscription is cancelled, new one is `pending_payment`. |

### 6.2 New Endpoints

| Method | Endpoint | Permission | Description |
|---|---|---|---|
| `GET` | `/api/admin/tenants/{tenantId}/subscription/payment-status` | `billing.view` | Returns current payment status for `pending_payment` subscriptions: order status, amount, created_at, checkout_data for retry |
| `POST` | `/api/admin/tenants/{tenantId}/subscription/retry-payment` | `billing.manage` | Generates a new Razorpay Order for the same subscription if previous payment was not completed. Updates `razorpay_order_id`. |

### 6.3 Existing Webhook Endpoint (No Change to Route)

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/api/webhooks/razorpay` | None (signature verification) | Already exists. Extended to handle `payment.captured` and `order.paid` for subscription activation. |

### 6.4 Response Shape — Paid Plan Assignment

```json
{
    "data": {
        "id": 123,
        "tenant_id": 42,
        "plan": {
            "id": 5,
            "name": "Starter",
            "code": "starter_monthly"
        },
        "status": "pending_payment",
        "billing_cycle": "monthly",
        "locked_price_monthly_cents": 49900,
        "locked_price_annual_cents": 499000,
        "starts_at": null,
        "ends_at": null,
        "razorpay_order_id": "order_EKwxwAgItmmXdp",
        "checkout_data": {
            "key_id": "rzp_live_xxxxx",
            "order_id": "order_EKwxwAgItmmXdp",
            "amount": 49900,
            "currency": "INR",
            "name": "Ubotz Platform",
            "description": "Starter Monthly Plan - Tenant: Institute ABC"
        }
    }
}
```

`starts_at` and `ends_at` are null until payment is confirmed. On activation, `starts_at` = payment confirmation time, `ends_at` = starts_at + billing cycle duration.

---

## 7. DDD Layer Requirements

### 7.1 Domain Layer — Modifications

| Component | Change |
|---|---|
| `SubscriptionStatus` value object | Add `PENDING_PAYMENT = 'pending_payment'` case. Update `canTransitionTo()`: `pending_payment → active` (on payment), `pending_payment → cancelled` (manual). Add `pending_payment` to forbidden transitions from terminal states. |
| `TenantSubscriptionEntity` | Add `activateOnPayment(DateTimeImmutable $paidAt): void` method — transitions from `pending_payment` to `active`, sets `starts_at` and calculates `ends_at`. |
| `PaymentGatewayInterface` | Add `createOrder(int $amountPaise, string $currency, string $receiptId, array $notes = []): OrderResult` method |
| NEW: `OrderResult` DTO | `Domain/SuperAdminDashboard/Subscription/DTOs/` — contains `orderId`, `amount`, `currency`, `status` |
| NEW: `SubscriptionPaymentActivated` event | `Domain/SuperAdminDashboard/Subscription/Events/` — dispatched when `pending_payment` → `active` |
| NEW: `PaymentAmountMismatchException` | `Domain/SuperAdminDashboard/Subscription/Exceptions/` — thrown when webhook amount ≠ locked price |

### 7.2 Application Layer — Modifications and New Components

| Component | Action |
|---|---|
| `AssignSubscriptionToTenantUseCase` | **MODIFY**: Add branching logic. If `!plan.isTrial() && !command.skipPayment`: create Razorpay Order via `PaymentGatewayInterface::createOrder()`, set status to `pending_payment`, store `razorpay_order_id`. If trial or `skipPayment`: existing behavior. |
| `ChangeTenantPlanUseCase` | **MODIFY**: Same branching for paid upgrades/downgrades. Cancel old, create new as `pending_payment`. |
| NEW: `ActivateSubscriptionOnPaymentUseCase` | Called by webhook handler. Receives `orderId`, `paymentId`, `amountPaise`. Loads subscription by `razorpay_order_id`, verifies amount, transitions to `active`, sets dates, audit logs, dispatches `SubscriptionPaymentActivated` event. Uses pessimistic locking. |
| NEW: `GetPaymentStatusQuery` | Returns payment status for a tenant's `pending_payment` subscription including checkout retry data. |
| NEW: `RetryPaymentUseCase` | Creates a new Razorpay Order for an existing `pending_payment` subscription. Updates `razorpay_order_id`. Audit logs the retry. |
| `ProcessWebhookUseCase` | **MODIFY**: Extend event routing. On `payment.captured` or `order.paid`: extract `order_id` from payload → delegate to `ActivateSubscriptionOnPaymentUseCase`. On `payment.failed`: log event, no status change. |
| NEW: `ExpirePendingPaymentsCommand` (optional) | Scheduled command. Finds `pending_payment` subscriptions older than configurable threshold (default: 48 hours). Transitions to `cancelled` with reason `payment_timeout`. |

### 7.3 Infrastructure Layer — Modifications

| Component | Action |
|---|---|
| `RazorpaySubscriptionGateway` | **MODIFY**: Implement `createOrder()` method using Razorpay SDK: `$this->razorpay->order->create([...])`. Wrap in try/catch for `PaymentGatewayException`. |
| `FakePaymentGateway` | **MODIFY**: Add `createOrder()` fake that returns a predictable `OrderResult`. |
| `TenantSubscriptionRecord` | **MODIFY**: Ensure `razorpay_order_id` is fillable and cast correctly. |
| `TenantSubscriptionRepositoryInterface` | **MODIFY**: Add `findByRazorpayOrderId(string $orderId): ?TenantSubscriptionEntity` |
| `EloquentTenantSubscriptionRepository` | **MODIFY**: Implement `findByRazorpayOrderId()` |

### 7.4 HTTP Layer — Modifications and New Components

| Component | Action |
|---|---|
| `TenantSubscriptionWriteController` | **MODIFY**: Update `assign()` and `changePlan()` methods to return extended response with checkout data when payment is pending. |
| NEW: `TenantSubscriptionPaymentController` | `GET payment-status`, `POST retry-payment` endpoints |
| `AssignSubscriptionPlanRequest` | **MODIFY**: Add `skip_payment` (boolean, optional, default false) validation rule |
| `TenantSubscriptionResource` | **MODIFY**: Include `razorpay_order_id`, `payment_status`, `checkout_data` in response when status is `pending_payment` |

---

## 8. Migration Plan

### 8.1 Verify Existing Columns

The developer must check whether `razorpay_order_id` already exists on `tenant_subscriptions`. The Phase 8 migrations added `gateway_subscription_id` and `gateway_plan_id` columns. If `razorpay_order_id` does not exist, create:

```sql
ALTER TABLE tenant_subscriptions ADD COLUMN razorpay_order_id VARCHAR(50) NULL AFTER gateway_plan_id;
CREATE INDEX idx_tenant_subs_razorpay_order ON tenant_subscriptions(razorpay_order_id);
```

### 8.2 No New Tables Required

The `payment_events` table (for webhook idempotency) already exists. No new tables are needed in Phase 12A.

---

## 9. Frontend Changes

### 9.1 Super Admin — Plan Assignment Flow

The existing plan selector modal (Phase 11C, Module B) must be extended:

- When a paid plan is selected and `skip_payment` is not checked, the assignment response returns `checkout_data`
- Display a "Payment Pending" status badge instead of "Active"
- Show a "Copy Payment Link" button that generates a Razorpay Checkout URL from the `checkout_data`
- Optionally: embed the Razorpay Checkout widget directly in a modal so Super Admin can complete payment on behalf of tenant (for walk-in/phone scenarios)

### 9.2 Super Admin — Subscription Tab Updates

- Show `pending_payment` as a distinct status badge (amber/yellow)
- Add "Retry Payment" action button for `pending_payment` subscriptions
- Add "Skip Payment (Manual Override)" action for Super Admins who want to activate without payment (requires `billing.manage`)
- Show payment status details: order amount, created date, time elapsed

### 9.3 Razorpay Checkout Integration (Frontend)

```javascript
// Razorpay Checkout widget integration
const options = {
    key: checkoutData.key_id,
    amount: checkoutData.amount,
    currency: checkoutData.currency,
    name: checkoutData.name,
    description: checkoutData.description,
    order_id: checkoutData.order_id,
    handler: function (response) {
        // Payment successful on client side
        // response.razorpay_payment_id
        // response.razorpay_order_id
        // response.razorpay_signature
        // Webhook will handle activation server-side
        // Frontend just shows "Payment submitted, awaiting confirmation"
    },
    prefill: {
        name: tenantOwnerName,
        email: tenantOwnerEmail,
    },
    theme: { color: "#1B4F72" }
};
const rzp = new Razorpay(options);
rzp.open();
```

**IMPORTANT:** The frontend handler is informational only. Subscription activation happens server-side via webhook. The frontend should poll the subscription status after the checkout handler fires, not assume activation.

### 9.4 Script Tag

Add `<script src="https://checkout.razorpay.com/v1/checkout.js"></script>` to the Super Admin layout or load dynamically when the checkout modal opens. Do NOT bundle the Razorpay SDK — always load from their CDN for PCI compliance.

---

## 10. Security & Financial Safety Requirements

| Requirement | Detail |
|---|---|
| **Webhook signature verification** | Already implemented. Must continue to verify `X-Razorpay-Signature` for all new event types. |
| **Idempotency** | Every webhook event is logged to `payment_events` with unique `event_id`. Duplicate events are rejected. |
| **Amount verification** | Webhook amount MUST match `locked_price_*_cents` on the subscription. Any mismatch → log error, do NOT activate. |
| **Pessimistic locking** | `ActivateSubscriptionOnPaymentUseCase` must `lockForUpdate` on the subscription record before status transition. |
| **Immutable records** | `razorpay_order_id` is set once and never changed (a retry creates a new order, updates the ID). Old order IDs are preserved in `payment_events`. |
| **No external API calls inside transactions** | The Razorpay `createOrder()` call must happen BEFORE the database transaction, not inside it. Sequence: create Razorpay order → DB transaction (create subscription with order_id) → commit → dispatch events. |
| **Audit trail** | Every payment-related action logged to `admin_audit_logs`: order creation, payment received, payment failed, manual override, retry. |
| **No Razorpay secrets in frontend** | Only `key_id` (public key) goes to the frontend. `key_secret` and `webhook_secret` never leave the server. |
| **No financial data in localStorage** | Order IDs and checkout data are passed as component props or API responses. Never stored in browser storage. |

---

## 11. What Phase 12A Does NOT Include

| Excluded Item | Reason | Deferred To |
|---|---|---|
| Razorpay Subscriptions API (recurring auto-charge) | Adds dual state machine complexity | Phase 12B |
| Auto-renewal on billing cycle end | Requires Subscriptions API | Phase 12B |
| Invoice generation (PDF) | Separate bounded context | Phase 12C |
| Refund workflows | Requires refund domain model + approval tiers | Phase 12C |
| `past_due` subscription status | Requires failed payment retry logic | Phase 12B |
| Billing Admin (L6) dashboard | Separate role context | Phase 12D |
| Tenant self-service plan selection | Separate frontend flow | Future |
| Proration on plan change | Complex financial calculation | Future |
| Multiple payment methods (UPI, NetBanking config) | Razorpay handles this in checkout — no backend work | N/A (automatic) |
| Tenant → Student billing integration | Completely separate bounded context | Future |

---

## 12. Quality Gate — Phase 12A Complete

### Security & Financial Safety Gates (BLOCKING)

- [ ] Webhook signature verification works for `payment.captured` and `order.paid` events
- [ ] Duplicate webhook events are rejected (idempotency via `payment_events`)
- [ ] Amount mismatch between webhook and locked price is detected and logged (subscription NOT activated)
- [ ] Pessimistic locking on `pending_payment` → `active` transition
- [ ] `razorpay_order_id` is immutable after initial set
- [ ] No Razorpay secrets exposed in API responses or frontend
- [ ] `skip_payment` manual override is audit-logged with reason
- [ ] No external API calls inside database transactions
- [ ] Every payment event (success, failure, retry) is logged to `payment_events` and `admin_audit_logs`

### Functional Gates (BLOCKING)

- [ ] Trial plan assignment works unchanged (immediate activation, no payment)
- [ ] Paid plan assignment creates Razorpay Order and returns checkout data
- [ ] Subscription status is `pending_payment` until webhook confirms
- [ ] Webhook confirmation transitions subscription to `active` with correct `starts_at` and `ends_at`
- [ ] `pending_payment` tenant uses platform default limits (not plan limits)
- [ ] Payment retry generates new order for same subscription
- [ ] `skip_payment` flag activates paid plan without Razorpay
- [ ] Payment status endpoint returns correct data
- [ ] Razorpay Checkout widget opens and completes on frontend
- [ ] Plan change (upgrade/downgrade) with payment works end-to-end

### Architecture Gates (BLOCKING)

- [ ] PHPStan Level 5: zero new errors
- [ ] All tests pass (zero regression)
- [ ] `PaymentGatewayInterface` extended (not replaced) — existing methods unchanged
- [ ] `FakePaymentGateway` updated for all new methods
- [ ] Domain layer has zero `Illuminate` imports in new files
- [ ] Controllers < 20 lines per method
- [ ] `ClockInterface` used for all time operations
- [ ] Events dispatched outside transactions
- [ ] `env()` check: zero results in `app/`, `routes/`, `database/`

### Test Requirements

- [ ] Unit tests: `SubscriptionStatus` transitions including `pending_payment`
- [ ] Unit tests: `ActivateSubscriptionOnPaymentUseCase` — happy path, amount mismatch, duplicate event, already activated
- [ ] Unit tests: `RetryPaymentUseCase` — generates new order, updates subscription
- [ ] Feature tests: Paid plan assignment → 200 with checkout data
- [ ] Feature tests: Trial plan assignment → unchanged behavior
- [ ] Feature tests: `skip_payment` flag → immediate activation
- [ ] Feature tests: Webhook `payment.captured` → subscription activated
- [ ] Feature tests: Webhook with invalid signature → 401
- [ ] Feature tests: Webhook with duplicate event_id → 200 (idempotent, no side effects)
- [ ] Feature tests: Webhook with amount mismatch → logged, subscription NOT activated
- [ ] Feature tests: Payment status endpoint returns correct data
- [ ] Feature tests: Payment retry endpoint creates new order
- [ ] Minimum 15–20 new tests expected

---

## 13. Implementation Plan Format

Same format as previous phases:

| # | Section | Description |
|---|---|---|
| 1 | Executive Summary | What gets built, what does NOT |
| 2 | Gap Analysis | Verify existing gateway code, webhook handler, subscription table schema |
| 3 | Architecture Decisions | Any deviations from this spec |
| 4 | Migration Plan | `razorpay_order_id` column (verify if already exists) |
| 5 | Domain Layer Changes | `SubscriptionStatus` extension, new DTOs, new events, new exceptions |
| 6 | Application Layer Changes | Modified UseCases, new UseCases, webhook handler extension |
| 7 | Infrastructure Layer Changes | Gateway `createOrder()`, repository methods, fake gateway |
| 8 | HTTP Layer Changes | Controller modifications, new endpoints, request/resource updates |
| 9 | Frontend Changes | Checkout widget integration, status badge updates, payment link UI |
| 10 | Implementation Sequence | Ordered steps with dependencies |
| 11 | Test Plan | Every test file with description |
| 12 | Quality Gate Verification | Checklist from §12 |
| 13 | Risk Register | Identified risks with severity and mitigation |
| 14 | File Manifest | Every new and modified file |

---

## 14. Constraints & Reminders

### Architecture Constraints

- `PaymentGatewayInterface` is extended, not replaced. All existing methods remain.
- Razorpay API calls happen OUTSIDE database transactions. Never hold a DB lock while calling an external API.
- The `ProcessWebhookUseCase` is the single entry point for all webhook events. It routes to specific handlers based on event type. Do NOT create separate webhook endpoints per event.
- `SubscriptionStatus::PENDING_PAYMENT` must be added to the value object, not created as a separate status field.
- `FakePaymentGateway` must be updated for every new method added to the interface. All tests use the fake, never the real gateway.

### Docker Environment

- Container: Alpine Linux — use `sh` not `bash`
- Container name: `ubotz_backend`
- Database: `ubotz_mysql`

### What NOT to Do

- Do NOT call Razorpay API inside `DB::transaction()`.
- Do NOT trust the frontend handler for subscription activation. ONLY the webhook activates.
- Do NOT store `key_secret` or `webhook_secret` in API responses.
- Do NOT create a separate webhook route — use the existing `POST /api/webhooks/razorpay`.
- Do NOT implement recurring billing in this phase.
- Do NOT use DECIMAL or FLOAT for any amount.
- Do NOT skip audit logging on any payment-related action.
- Do NOT modify the existing `AssignSubscriptionToTenantUseCase` destructively — extend its branching logic while preserving the existing trial flow.

---

## 15. Definition of Done

Phase 12A is complete when:

1. The implementation plan has been reviewed and approved by the Principal Engineer.
2. All code is implemented per the approved plan.
3. All quality gates in §12 pass.
4. A Principal Engineer audit confirms zero critical or high findings.
5. All findings from audit are resolved.
6. A successful end-to-end payment has been demonstrated in a test/staging environment with Razorpay Test Mode.
7. The Phase 12A Completion Report is signed off.

---

# PHASE 6 — DEVELOPER DOCUMENTATION (TRUTH ONLY)
## Phase 12A Completion Report

### Purpose
Phase 12A establishes the minimum viable payment loop for tenant subscriptions using Razorpay. It transitions the platform from purely manual assignment to a secure, gateway-backed flow where subscriptions are activated only upon receipt of a verified payment.

### How it works
The integration uses the **Razorpay Orders API** to create a cryptographically linked payment session before a subscription is persisted.
* **Pending State**: Paid subscriptions are created in the `pending_payment` state. They do not grant access to features (`isActive()` returns `false`).
* **Webhook Activation**: Activation is decoupled from the synchronous HTTP request. It occurs asynchronously when the `payment.captured` or `order.paid` webhook is received from Razorpay.
* **Security & Idempotency**: All webhooks undergo signature verification and are logged to `payment_events`. If an event for a specific `razorpay_order_id` is re-received, it is ignored (idempotent).
* **Financial Integrity**: The system performs a server-side amount verification. If the amount captured by Razorpay does not match the `locked_price` on the subscription, activation is aborted to prevent underpayment.

### Data flow
1. **Order Creation**: Super Admin selects a paid plan. The backend calls Razorpay to create an Order and receives an `order_id`.
2. **Persistence**: A `tenant_subscription` is created with status `pending_payment` and the `razorpay_order_id` is stored.
3. **Checkout**: The frontend receives `checkout_data` and launches the Razorpay Checkout widget.
4. **Payment**: The user completes payment. Razorpay informs the client (informational) and sends a webhook to the server (authoritative).
5. **Verification**: `ProcessWebhookUseCase` verifies the signature. `ActivateSubscriptionOnPaymentUseCase` locks the subscription record, verifies the amount, and transitions the status to `active`.
6. **Audit**: The activation is logged to `admin_audit_logs` as a system action (Admin ID: 0).

### Permissions
* **Payment Actions**: `billing.manage`
* **Status Visibility**: `billing.view`

### Known limitations
1. **No Auto-Recurring**: Auto-charge on billing cycle end is **[NOT IMPLEMENTED]** (deferred to Phase 12B).
2. **No Invoices**: Generation of PDF invoices or receipts is **[NOT IMPLEMENTED]** (deferred to Phase 12C).
3. **No Refunds**: Reversing payments through the dashboard is **[NOT IMPLEMENTED]** (deferred to Phase 12C).
4. **Manual Retries**: If a payment fails, the admin must manually trigger a "Retry Payment" to generate a new Razorpay Order.

### Implementation Analysis Details

#### 1. Database Layer
- Table `tenant_subscriptions` successfully extended with `razorpay_order_id` (VARCHAR 50, Indexed) via migration.
- `payment_events` table utilized for robust webhook idempotency.

#### 2. Domain Layer
- **Status Enum**: `SubscriptionStatus` now includes `PENDING_PAYMENT` with strict transition guards.
- **Entity**: `TenantSubscriptionEntity` implements `activateOnPayment()` and supports `razorpayOrderId` mutation for retries.
- **Safety**: `PaymentAmountMismatchException` ensures no plan is activated for the wrong price.

#### 3. Application Layer
- **Use Cases**: Comprehensive coverage for Order Creation, Webhook Processing, Activation, and Manual Retries.
- **Concurrency**: Pessimistic locking (`lockForUpdate`) verified in `ActivateSubscriptionOnPaymentUseCase` to prevent race conditions during high-volume webhook delivery.

#### 4. Infrastructure & HTTP Layers
- **Gateway**: `RazorpaySubscriptionGateway` implements the `createOrder` contract using the official SDK.
- **Controllers**: `TenantSubscriptionWriteController` updated for `checkout_data` delivery. `TenantSubscriptionPaymentController` adds status polling and retry capabilities.
- **Frontend**: Next.js components updated to load Razorpay SDK dynamically and show amber "PENDING_PAYMENT" badges.

#### 5. Verification & Tests
- **Enum Tests**: Verified `PENDING_PAYMENT` transition logic.
- **Activation Tests**: Verified amount matching and idempotent activation.
- **Feature Tests**: Verified full API lifecycle for paid vs trial plans.
- **PHPStan**: Successfully passed at Level 5.
- **Architecture Gates**: Verified zero `Illuminate` leakage into Domain and zero `env()` calls in application logic.

**Conclusion:** Phase 12A successfully provides a secure, idempotent foundation for tenant billing. The implementation respects the "Financial Safety First" mandate of UBOTZ 2.0.

*End of Document — UBOTZ 2.0 Phase 12A Developer Instructions — March 7, 2026*
