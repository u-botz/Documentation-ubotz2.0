# UBOTZ 2.0 — Phase G2 Developer Instructions

## Tenant-to-Student Stripe Billing (GCC Market)

| Field | Value |
|---|---|
| **Document Type** | Developer Instruction (Pre-Implementation Brief) |
| **Phase** | G2 |
| **Date** | March 2026 |
| **Issued By** | Principal Engineer / Architecture Auditor |
| **Audience** | Implementation Developer (Antigravity) |
| **Expected Deliverable** | Phase G2 Implementation Plan (same format as prior phase plans) |
| **Prerequisites** | Phase G1 COMPLETE (Stripe platform billing) + Phase G1-FE COMPLETE (Stripe checkout frontend) + Phase 17D COMPLETE (course pricing context) + Phase 17E COMPLETE (bundle context) |

> **This phase connects real money — AED and SAR — from GCC students to tenant institutions. Every rule in this document carries the same weight as Phase 12A and 12C. Idempotency is not a feature, it is the minimum bar. Webhook signature verification is not optional. Audit trails are not optional. There is no "we'll harden this later" when a tenant's Stripe account is involved.**

---

## 1. Mission Statement

Phase G2 enables GCC-market tenants to accept payments directly from their students using the tenant's own Stripe account. Ubotz acts as the checkout orchestration layer only — it never holds, touches, or routes student money. The tenant's Stripe secret key is used server-side to create Payment Intents; the tenant's publishable key is sent to the student's browser for the Stripe.js checkout experience.

**The three payment scenarios this phase enables:**

```
1. Course One-Time Purchase
   Student selects course → Ubotz creates PaymentIntent (tenant Stripe) →
   Student pays via Stripe Elements → Webhook confirms → Access granted

2. Course Bundle Purchase
   Student selects bundle → Ubotz creates PaymentIntent (tenant Stripe) →
   Student pays → Webhook confirms → Access granted to all courses in bundle

3. Fee Installment (EMI)
   Tenant admin configures installment schedule →
   Student enrolls in installment plan → Ubotz creates PaymentIntent per installment →
   Each installment paid individually → Access gated on installment schedule
```

**What this phase does NOT include:**

- Stripe Connect (Ubotz is not a payment facilitator)
- Platform commission / application fees on transactions
- Recurring Stripe Subscriptions API (student-level auto-renewal)
- Coupons / discount codes (deferred)
- Stripe Checkout hosted page (using Stripe Elements inline)
- KWD, BHD, QAR, USD — only AED and SAR in this phase
- Automated tax calculation (VAT applied as tenant-configured fixed rate only)
- Partial refunds (full refund only in this phase)

---

## 2. Business Context

### 2.1 Architectural Position

This is **Tenant → Student** billing. The money flow is:

```
Student (payer) ──► Tenant's Stripe Account (receiver)
                         ▲
               Ubotz orchestrates checkout
               using tenant's Stripe credentials
               stored in tenant settings
```

Ubotz has zero financial exposure. Ubotz never appears as a party on the Stripe transaction. Disputes, chargebacks, and reconciliation are entirely between the student and the tenant. Ubotz's role ends at confirming `payment_intent.succeeded` from the webhook.

### 2.2 Contrast with Platform Billing (G1)

| Dimension | G1 (Platform billing) | G2 (Tenant-to-student billing) |
|---|---|---|
| Who charges | Ubotz charges Tenant | Tenant charges Student |
| Stripe account | Ubotz's Stripe account | Tenant's own Stripe account |
| Gateway key source | Platform `config/services.php` | Tenant settings (encrypted in DB) |
| Currency | AED or SAR per tenant country | AED or SAR per tenant country |
| Commission | N/A (Ubotz is the merchant) | None (tenant keeps 100%) |
| Invoice issuer | Ubotz (UAE legal entity) | Tenant institution |

### 2.3 Tenant Prerequisite State

Before a tenant can use G2, all of the following must be true:

1. Tenant `country` is `UAE` or `Saudi Arabia` (GCC flag)
2. Tenant has configured and verified their Stripe credentials (publishable key + secret key) in tenant settings
3. Tenant has at least one published course, bundle, or installment plan with a price > 0

---

## 3. Business Rules (NON-NEGOTIABLE)

### 3.1 Stripe Credential Management Rules

| Rule ID | Rule | Detail |
|---|---|---|
| BR-01 | Each GCC tenant stores their own Stripe publishable key and secret key in the platform. | Stored in a `tenant_stripe_settings` table, scoped to `tenant_id`. Not in `tenant_settings` JSON blob — separate table for auditability. |
| BR-02 | The Stripe secret key is encrypted at rest using Laravel's `encrypt()` / `decrypt()` (AES-256-CBC via `APP_KEY`). | The raw secret key is NEVER stored in plaintext. It is NEVER logged. It is NEVER returned in any API response. |
| BR-03 | The Stripe publishable key is NOT encrypted. It is returned to the frontend when building the Stripe Elements checkout. | Publishable keys are designed to be public-facing. No security risk. |
| BR-04 | Only Tenant Admin (OWNER role, L3 equivalent within tenant RBAC) can configure Stripe credentials. | Other tenant roles (Teacher, Staff) cannot view or modify Stripe settings. |
| BR-05 | Stripe credentials can be updated but not deleted. If a tenant wants to stop accepting payments, they archive their published courses. | Deleting credentials risks breaking active installment schedules. |
| BR-06 | Before saving credentials, Ubotz performs a live Stripe API validation: retrieve account details using the provided secret key. If Stripe returns an error, credentials are rejected with a validation error. | Prevents saving invalid keys that would silently break checkout. Use `\Stripe\Account::retrieve()` with the provided key. |
| BR-07 | Stripe credential validation result (success/failure) is audit-logged to `tenant_audit_logs` with timestamp, actor, and outcome. The secret key value is NEVER included in the log. | Audit trail for when credentials were last updated and by whom. |
| BR-08 | If a tenant has no Stripe credentials configured, all student-facing payment endpoints for that tenant return HTTP 402 with error code `STRIPE_NOT_CONFIGURED`. The student checkout page shows a human-readable "Payment not available" message. | Never expose internal error details. |

### 3.2 Payment Intent Creation Rules

| Rule ID | Rule | Detail |
|---|---|---|
| BR-09 | All student payments use Stripe Payment Intents API (not Charges API, not Checkout Sessions). | Payment Intents support SCA (Strong Customer Authentication) required in some GCC markets and provides the best control over the payment lifecycle. |
| BR-10 | PaymentIntent amount is stored in the smallest currency unit: fils for AED (1 AED = 100 fils), halalah for SAR (1 SAR = 100 halalah). The `_cents` suffix convention is retained in our system for both currencies. | Example: AED 150.00 → stored as `15000` with `currency = AED`. |
| BR-11 | The PaymentIntent `currency` parameter is lowercase (`aed` or `sar`) as required by Stripe. The `currency` column in our database uses uppercase (`AED`, `SAR`). Transformation happens at the infrastructure gateway layer. | Domain layer uses uppercase. Stripe SDK receives lowercase. Never leak this conversion into the domain. |
| BR-12 | An idempotency key is generated for every PaymentIntent creation call. Format: `pi_{tenant_id}_{order_id}_{attempt_number}`. | Prevents duplicate charges if the API call is retried due to network failure. Passed as the `Idempotency-Key` header on the Stripe SDK call. |
| BR-13 | The PaymentIntent `metadata` field must include: `tenant_id`, `student_id`, `order_type` (`course` / `bundle` / `installment`), `order_id`, `installment_number` (if applicable). | Required for webhook correlation and support/debugging. |
| BR-14 | A Ubotz `student_orders` record is created BEFORE the PaymentIntent is created with Stripe. Status: `pending_payment`. The `stripe_payment_intent_id` is populated after Stripe responds. If Stripe call fails, the order stays `pending_payment` and can be retried. | Never create the Stripe PaymentIntent without a matching local order record. |
| BR-15 | The `client_secret` from the PaymentIntent response is returned to the student's frontend ONLY. It is not stored in the database beyond the order record's session. | The `client_secret` allows the frontend to confirm the payment. It must not be logged or persisted beyond the request lifecycle. |
| BR-16 | The amount in the PaymentIntent must be verified against the current published price of the course/bundle/installment at the time of order creation. | Prevents a student from manipulating the request to pay a different amount. Price is always read server-side from the course pricing context. |

### 3.3 Webhook Rules

| Rule ID | Rule | Detail |
|---|---|---|
| BR-17 | Stripe sends webhooks to a single platform endpoint: `POST /api/webhooks/stripe/tenant/{tenantId}`. | The `tenantId` in the URL identifies which tenant's webhook secret to use for signature verification. |
| BR-18 | Each tenant has their own Stripe webhook signing secret, stored in `tenant_stripe_settings` alongside their API keys. Encrypted at rest. | Stripe generates a unique signing secret per webhook endpoint. Tenants must register the Ubotz webhook URL in their Stripe dashboard. |
| BR-19 | Signature verification uses the tenant's webhook signing secret. If verification fails, return HTTP 400 immediately. Do not process the event. Log the failed attempt. | Use `\Stripe\Webhook::constructEvent($payload, $sigHeader, $tenantWebhookSecret)`. |
| BR-20 | Webhook processing is idempotent. The `stripe_event_id` from the Stripe event object is stored in `student_payment_events` table. If an event with that ID already exists, return HTTP 200 immediately without processing. | Stripe retries webhooks on non-2xx responses. Idempotency prevents double access grants. |
| BR-21 | Webhook handler must complete within Stripe's 30-second timeout. The access-granting logic MUST be dispatched as a queued job, not executed synchronously in the webhook handler. | The webhook handler validates signature, checks idempotency, persists the raw event, dispatches a job, and returns HTTP 200. Access granting happens in the job. |
| BR-22 | The relevant webhook event is `payment_intent.succeeded`. On this event: validate metadata, find the matching `student_orders` record, transition status to `paid`, dispatch `StudentPaymentConfirmed` domain event. | Only `payment_intent.succeeded` triggers access grant. `payment_intent.created` and `payment_intent.processing` are logged but do not trigger access. |
| BR-23 | `payment_intent.payment_failed` is logged. The order remains `pending_payment`. No access is granted. The student may attempt payment again up to 3 times (configurable per tenant). | After 3 failed attempts, order transitions to `failed`. Student must initiate a new order. |

### 3.4 Access Grant Rules

| Rule ID | Rule | Detail |
|---|---|---|
| BR-24 | After `StudentPaymentConfirmed`: for course purchase → create enrollment record in the enrollment bounded context. For bundle purchase → create enrollment records for all active courses in the bundle. For installment → create enrollment with `installment_access` flag. | Access grant is a side effect handled in the domain event listener, not in the webhook handler or payment use case. |
| BR-25 | Installment access: student retains access as long as installments are current. If installment N+1 is not paid within the due date grace period (configurable, default 3 days), access is suspended. Access is restored immediately on payment. | Access suspension is handled by a scheduled command, not by the webhook. Do not build this into the webhook flow. |
| BR-26 | Access grant is idempotent. If the domain event listener runs twice (queue retry), creating a duplicate enrollment must not throw an exception. Use `firstOrCreate` on the enrollment record. | Queue jobs are retried on failure. The listener must be safe to run multiple times. |

### 3.5 Refund Rules

| Rule ID | Rule | Detail |
|---|---|---|
| BR-27 | Refunds are initiated by Tenant Admin via the Ubotz dashboard. Ubotz calls Stripe Refunds API using the tenant's secret key. | Full refund only in Phase G2. Partial refunds are deferred. |
| BR-28 | A refund can only be initiated if the order is in `paid` status. Refunds on `pending_payment`, `failed`, or already `refunded` orders are rejected with a validation error. | |
| BR-29 | A refund request stores: `order_id`, `stripe_refund_id`, `refund_amount_cents`, `currency`, `initiated_by` (Tenant Admin user ID), `initiated_at`, `status` (`pending` / `succeeded` / `failed`), `reason` (free text, optional). | Stored in `student_refunds` table. |
| BR-30 | Stripe processes the refund asynchronously. The refund is created in Stripe immediately, but funds may take 5–10 business days to reach the student. The Ubotz refund record reflects Stripe's refund status, updated via the `charge.refunded` webhook event. | |
| BR-31 | On refund confirmation (`charge.refunded` webhook): transition order to `refunded`, revoke enrollment access, audit-log the access revocation. | Access revocation is permanent for the refunded order. Student must purchase again for access. |
| BR-32 | The refund action is audit-logged to `tenant_audit_logs` with: actor, order ID, amount, currency, Stripe refund ID, reason. | |
| BR-33 | Tenant Admin cannot refund more than the original payment amount. Stripe enforces this at the API level; Ubotz must also validate before calling Stripe. | |

### 3.6 Currency and VAT Rules

| Rule ID | Rule | Detail |
|---|---|---|
| BR-34 | Tenant currency is determined by the tenant's `country` field: `UAE` → `AED`, `Saudi Arabia` → `SAR`. All student payments for that tenant are in that currency only. | A tenant cannot mix currencies. Currency is fixed at the tenant level. |
| BR-35 | VAT is configurable per tenant. Default rates: UAE = 5%, Saudi Arabia = 15%. Tenant Admin can disable VAT (for B2B exempt courses). | Stored in `tenant_stripe_settings.vat_rate_percentage` (TINYINT, 0–20). |
| BR-36 | VAT is computed at order creation time and stored on the order record. VAT is NOT recomputed on download or display. `order.base_amount_cents + order.vat_amount_cents = order.total_amount_cents`. | VAT computation: `vat_amount_cents = ROUND(base_amount_cents * vat_rate / 100)`. |
| BR-37 | The PaymentIntent amount sent to Stripe is always the `total_amount_cents` (inclusive of VAT). | Student pays the VAT-inclusive price. |
| BR-38 | A student-facing receipt/invoice is generated on payment confirmation. It includes: tenant name, course/bundle name, base amount, VAT rate, VAT amount, total amount, payment date, Stripe PaymentIntent ID as reference. | PDF generated server-side using the existing `DomPdfGenerator`. Stored in tenant-scoped storage path. |

---

## 4. Domain Model

### 4.1 Bounded Context

Phase G2 introduces a new bounded context: **`StudentBilling`**, within the tenant domain. This context owns:

- `StudentOrder` — the aggregate root
- `StudentPaymentEvent` — event log
- `StudentRefund` — refund record
- `TenantStripeSettings` — Stripe credential entity (tenant-scoped)

This context does NOT own enrollment. It emits `StudentPaymentConfirmed` and `StudentRefundConfirmed` domain events. The enrollment bounded context (Phase 17B) listens to these events and manages access.

### 4.2 StudentOrder Aggregate

```
StudentOrder {
    id: OrderId (UUID)
    tenant_id: TenantId
    student_id: StudentId
    order_type: OrderType (course | bundle | installment)
    orderable_id: int          // course_id, bundle_id, or installment_plan_id
    orderable_type: string     // discriminator
    installment_number: ?int   // null unless order_type = installment
    installment_plan_id: ?int  // null unless order_type = installment

    base_amount_cents: int     // price before VAT
    vat_rate_percentage: int   // snapshot of VAT rate at order time
    vat_amount_cents: int      // computed, immutable after creation
    total_amount_cents: int    // base + vat

    currency: Currency         // AED | SAR
    status: OrderStatus        // pending_payment | paid | failed | refunded | cancelled

    stripe_payment_intent_id: ?string
    stripe_payment_intent_client_secret: ?string  // NOT persisted beyond session
    idempotency_key: string

    receipt_pdf_path: ?string
    paid_at: ?datetime
    failed_at: ?datetime
    refunded_at: ?datetime

    created_at: datetime
    updated_at: datetime
}
```

### 4.3 OrderStatus State Machine

```
                ┌──────────────────────────────────────┐
                │                                      │
                ▼                                      │
┌──────────────────────┐  stripe webhook   ┌──────────┴──────┐
│   pending_payment    │ ────────────────► │      paid       │
│                      │  payment_intent   │                 │
└──────────┬───────────┘  .succeeded       └────────┬────────┘
           │                                        │
           │ 3 failures                             │ refund initiated
           ▼                                        ▼
      ┌─────────┐                           ┌──────────────┐
      │ failed  │                           │   refunded   │
      └─────────┘                           └──────────────┘
           │
           │ cancelled by admin
           ▼
      ┌───────────┐
      │ cancelled │
      └───────────┘
```

| From | To | Trigger |
|---|---|---|
| `pending_payment` | `paid` | `payment_intent.succeeded` webhook |
| `pending_payment` | `failed` | 3rd `payment_intent.payment_failed` event |
| `pending_payment` | `cancelled` | Tenant Admin cancels order manually |
| `paid` | `refunded` | Tenant Admin initiates refund + `charge.refunded` webhook |

**Forbidden Transitions (throw `InvalidOrderTransitionException`):**

| From | To | Reason |
|---|---|---|
| `paid` | `pending_payment` | Cannot un-pay |
| `paid` | `failed` | Cannot mark a paid order as failed |
| `failed` | `paid` | Cannot pay a failed order — create new order |
| `refunded` | ANY | Terminal state |
| `cancelled` | ANY | Terminal state |

### 4.4 TenantStripeSettings Entity

```
TenantStripeSettings {
    id: int
    tenant_id: TenantId (unique — one row per tenant)
    publishable_key: string        // stored plaintext
    secret_key: EncryptedString    // stored encrypted via APP_KEY
    webhook_secret: EncryptedString
    vat_rate_percentage: int       // 0–20, default by country
    is_active: bool
    stripe_account_verified_at: ?datetime
    created_at: datetime
    updated_at: datetime
}
```

---

## 5. Database Schema

### 5.1 New Table: `tenant_stripe_settings`

| Column | Type | Notes |
|---|---|---|
| `id` | BIGINT UNSIGNED PK | |
| `tenant_id` | BIGINT UNSIGNED UNIQUE FK | One row per tenant |
| `publishable_key` | VARCHAR(120) NOT NULL | Stripe pk_live_... or pk_test_... |
| `secret_key_encrypted` | TEXT NOT NULL | Laravel encrypted value |
| `webhook_secret_encrypted` | TEXT NOT NULL | Stripe whsec_... encrypted |
| `vat_rate_percentage` | TINYINT UNSIGNED NOT NULL DEFAULT 5 | 0 = VAT disabled |
| `is_active` | BOOLEAN NOT NULL DEFAULT TRUE | |
| `stripe_account_verified_at` | TIMESTAMP NULL | Set on first successful validation |
| `created_at` | TIMESTAMP | |
| `updated_at` | TIMESTAMP | |

### 5.2 New Table: `student_orders`

| Column | Type | Notes |
|---|---|---|
| `id` | BIGINT UNSIGNED PK | |
| `tenant_id` | BIGINT UNSIGNED FK NOT NULL | Enforced via BelongsToTenant |
| `student_id` | BIGINT UNSIGNED FK NOT NULL | References `users.id` |
| `order_type` | ENUM('course','bundle','installment') NOT NULL | |
| `orderable_id` | BIGINT UNSIGNED NOT NULL | course_id / bundle_id / installment_plan_id |
| `orderable_type` | VARCHAR(60) NOT NULL | Morph discriminator |
| `installment_plan_id` | BIGINT UNSIGNED NULL FK | Only if order_type = installment |
| `installment_number` | TINYINT UNSIGNED NULL | 1-based, null unless installment |
| `base_amount_cents` | BIGINT UNSIGNED NOT NULL | Price before VAT |
| `vat_rate_percentage` | TINYINT UNSIGNED NOT NULL | Snapshot at order time |
| `vat_amount_cents` | BIGINT UNSIGNED NOT NULL | Computed, immutable |
| `total_amount_cents` | BIGINT UNSIGNED NOT NULL | base + vat |
| `currency` | CHAR(3) NOT NULL | 'AED' or 'SAR' |
| `status` | ENUM('pending_payment','paid','failed','refunded','cancelled') NOT NULL DEFAULT 'pending_payment' | |
| `stripe_payment_intent_id` | VARCHAR(80) NULL UNIQUE | pi_... from Stripe |
| `idempotency_key` | VARCHAR(100) NOT NULL UNIQUE | pi_{tenant}_{order}_{attempt} |
| `receipt_pdf_path` | VARCHAR(255) NULL | |
| `paid_at` | TIMESTAMP NULL | |
| `failed_at` | TIMESTAMP NULL | |
| `refunded_at` | TIMESTAMP NULL | |
| `created_at` | TIMESTAMP | |
| `updated_at` | TIMESTAMP | |

**Indexes:** `(tenant_id, student_id)`, `(tenant_id, status)`, `(stripe_payment_intent_id)`

### 5.3 New Table: `student_payment_events`

| Column | Type | Notes |
|---|---|---|
| `id` | BIGINT UNSIGNED PK | |
| `tenant_id` | BIGINT UNSIGNED FK NOT NULL | |
| `student_order_id` | BIGINT UNSIGNED FK NULL | Null if event cannot be correlated |
| `stripe_event_id` | VARCHAR(80) NOT NULL UNIQUE | Idempotency key — evt_... |
| `event_type` | VARCHAR(80) NOT NULL | payment_intent.succeeded etc. |
| `payload` | JSON NOT NULL | Full Stripe event payload |
| `processed_at` | TIMESTAMP NULL | Null = not yet processed |
| `created_at` | TIMESTAMP | |

### 5.4 New Table: `student_refunds`

| Column | Type | Notes |
|---|---|---|
| `id` | BIGINT UNSIGNED PK | |
| `tenant_id` | BIGINT UNSIGNED FK NOT NULL | |
| `student_order_id` | BIGINT UNSIGNED FK NOT NULL | Must be in `paid` status |
| `stripe_refund_id` | VARCHAR(80) NULL UNIQUE | re_... from Stripe |
| `refund_amount_cents` | BIGINT UNSIGNED NOT NULL | Must equal order.total_amount_cents |
| `currency` | CHAR(3) NOT NULL | |
| `status` | ENUM('pending','succeeded','failed') NOT NULL DEFAULT 'pending' | |
| `reason` | VARCHAR(255) NULL | Free text from Tenant Admin |
| `initiated_by` | BIGINT UNSIGNED FK NOT NULL | Tenant Admin user ID |
| `initiated_at` | TIMESTAMP NOT NULL | |
| `succeeded_at` | TIMESTAMP NULL | |
| `failed_at` | TIMESTAMP NULL | |
| `created_at` | TIMESTAMP | |
| `updated_at` | TIMESTAMP | |

### 5.5 New Table: `student_installment_plans`

| Column | Type | Notes |
|---|---|---|
| `id` | BIGINT UNSIGNED PK | |
| `tenant_id` | BIGINT UNSIGNED FK NOT NULL | |
| `course_id` | BIGINT UNSIGNED FK NOT NULL | Parent course |
| `name` | VARCHAR(120) NOT NULL | e.g. "3-Month Installment Plan" |
| `total_installments` | TINYINT UNSIGNED NOT NULL | e.g. 3 |
| `installment_amount_cents` | BIGINT UNSIGNED NOT NULL | Amount per installment (pre-VAT) |
| `currency` | CHAR(3) NOT NULL | Matches tenant currency |
| `frequency_days` | SMALLINT UNSIGNED NOT NULL | Days between installments, e.g. 30 |
| `grace_period_days` | TINYINT UNSIGNED NOT NULL DEFAULT 3 | Days after due before access suspended |
| `is_active` | BOOLEAN NOT NULL DEFAULT TRUE | |
| `created_at` | TIMESTAMP | |
| `updated_at` | TIMESTAMP | |

---

## 6. API Design

### 6.1 Tenant Stripe Settings Endpoints

All endpoints under `/api/tenant/billing/stripe/`. Require `CAP_BILLING_SETTINGS_MANAGE`. Tenant Owner (OWNER role) only.

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/tenant/billing/stripe/settings` | Get current Stripe settings. **Secret key is NEVER returned.** Returns: `has_secret_key` (bool), `publishable_key`, `vat_rate_percentage`, `is_active`, `stripe_account_verified_at`. |
| `POST` | `/api/tenant/billing/stripe/settings` | Create or update Stripe credentials. Body: `publishable_key`, `secret_key`, `webhook_secret`, `vat_rate_percentage`. Triggers live validation against Stripe before saving. |
| `POST` | `/api/tenant/billing/stripe/verify` | Re-validate existing credentials against Stripe without changing them. Returns `{verified: bool, error?: string}`. |

### 6.2 Student Checkout Endpoints

All endpoints under `/api/tenant/student-billing/`. Student-authenticated (student guard).

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/tenant/student-billing/orders` | Create a new order and PaymentIntent. Body: `order_type`, `orderable_id`, `installment_plan_id?`. Returns: `order_id`, `publishable_key` (tenant's), `client_secret` (from Stripe PaymentIntent). |
| `GET` | `/api/tenant/student-billing/orders/{orderId}` | Get order status. Student can only see own orders. Returns: `status`, `total_amount_cents`, `currency`, `paid_at?`. Never returns `client_secret`. |
| `GET` | `/api/tenant/student-billing/orders` | List student's own orders. Paginated. |
| `GET` | `/api/tenant/student-billing/orders/{orderId}/receipt` | Download receipt PDF. Only available for `paid` orders. |

### 6.3 Tenant Admin Order Management Endpoints

Under `/api/tenant/admin/billing/orders/`. Require `CAP_BILLING_ORDERS_VIEW` (list/view) and `CAP_BILLING_ORDERS_MANAGE` (cancel, refund).

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/tenant/admin/billing/orders` | List all orders for tenant. Filters: `status`, `student_id`, `order_type`, `date_from`, `date_to`. Paginated. |
| `GET` | `/api/tenant/admin/billing/orders/{orderId}` | Get single order detail. |
| `POST` | `/api/tenant/admin/billing/orders/{orderId}/cancel` | Cancel a `pending_payment` order. |
| `POST` | `/api/tenant/admin/billing/orders/{orderId}/refund` | Initiate full refund on a `paid` order. Body: `reason?`. Calls Stripe Refunds API. |

### 6.4 Webhook Endpoint

| Method | Endpoint | Auth |
|---|---|---|
| `POST` | `/api/webhooks/stripe/tenant/{tenantId}` | None (Stripe signature verification) |

This endpoint must be excluded from all authentication middleware. It is protected solely by Stripe webhook signature verification using the tenant's `webhook_secret_encrypted`.

### 6.5 Installment Plan Endpoints (Tenant Admin)

Under `/api/tenant/admin/installment-plans/`. Require `CAP_INSTALLMENT_PLANS_MANAGE`.

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/tenant/admin/installment-plans` | List installment plans. Filter by `course_id`. |
| `POST` | `/api/tenant/admin/installment-plans` | Create installment plan for a course. |
| `GET` | `/api/tenant/admin/installment-plans/{id}` | Get plan detail. |
| `PATCH` | `/api/tenant/admin/installment-plans/{id}` | Update plan (only if no active enrollments on this plan). |
| `DELETE` | `/api/tenant/admin/installment-plans/{id}` | Soft delete (only if no active enrollments). |

---

## 7. Application Layer — Use Cases

All UseCases live in `Application/TenantAdminDashboard/StudentBilling/UseCases/`.

### 7.1 `SaveTenantStripeSettingsUseCase`

**Trigger:** `POST /api/tenant/billing/stripe/settings`

**Steps:**
1. Validate request (publishable_key format `pk_live_*` or `pk_test_*`, secret_key format `sk_live_*` or `sk_test_*`)
2. Call `StripeAccountValidator::validate($secretKey)` — infrastructure service, calls Stripe API
3. If validation fails → throw `StripeCredentialInvalidException` with Stripe error message
4. Encrypt secret_key and webhook_secret via `EncryptionService`
5. `Upsert` into `tenant_stripe_settings` (one row per tenant)
6. Set `stripe_account_verified_at = now()`
7. Dispatch `TenantStripeSettingsUpdated` domain event (outside transaction)
8. Audit-log to `tenant_audit_logs` — actor, tenant, outcome. **No key values in log.**

### 7.2 `CreateStudentOrderUseCase`

**Trigger:** `POST /api/tenant/student-billing/orders`

**Steps:**
1. Verify tenant has active Stripe settings (`is_active = true`)
2. Verify student is enrolled's eligibility (not already enrolled, not already has a `pending_payment` or `paid` order for the same orderable — idempotency check)
3. Resolve price server-side from pricing context (`CoursePrice`, `BundlePrice`, or `InstallmentPlan`)
4. Compute VAT: `vat_amount_cents = ROUND(base_amount_cents * vat_rate_percentage / 100)`
5. Create `StudentOrder` aggregate (status: `pending_payment`)
6. Persist order to DB (get `order_id`)
7. Generate idempotency key: `pi_{tenant_id}_{order_id}_1`
8. Call `TenantStripeGateway::createPaymentIntent(amount_cents, currency, metadata, idempotency_key)` — uses tenant's decrypted secret key
9. Store `stripe_payment_intent_id` on order (but NOT the `client_secret`)
10. Return: `order_id`, tenant `publishable_key`, `client_secret`

**Critical:** Steps 6 and 8 must NOT be inside the same DB transaction. Create the DB record first, then call Stripe. If Stripe fails, the order sits in `pending_payment` and can be retried.

### 7.3 `ProcessTenantStripeWebhookUseCase`

**Trigger:** `POST /api/webhooks/stripe/tenant/{tenantId}`

**Steps:**
1. Load tenant's `webhook_secret_encrypted`, decrypt it
2. Verify Stripe signature using `\Stripe\Webhook::constructEvent()`
3. If invalid → log failed attempt, return HTTP 400
4. Check `student_payment_events.stripe_event_id` — if exists, return HTTP 200 (idempotent)
5. Persist raw event to `student_payment_events` (unprocessed)
6. Dispatch queued job `ProcessStripePaymentEventJob`
7. Return HTTP 200 immediately

### 7.4 `HandlePaymentIntentSucceededUseCase`

**Trigger:** Queued job, from `payment_intent.succeeded` event

**Steps:**
1. Extract `payment_intent_id` from event metadata
2. Find `StudentOrder` by `stripe_payment_intent_id` — if not found, log and abort
3. Verify order is in `pending_payment` status — if already `paid`, abort (idempotent)
4. Verify `event.amount` matches `order.total_amount_cents` — if mismatch, log critical alert, abort
5. Transition order status: `pending_payment` → `paid`, set `paid_at`
6. Mark `student_payment_events` record as processed
7. Dispatch `StudentPaymentConfirmed` domain event (outside transaction, after DB::afterCommit)
8. Dispatch `GenerateStudentReceiptJob` (async)
9. Audit-log to `tenant_audit_logs`

### 7.5 `InitiateStudentRefundUseCase`

**Trigger:** `POST /api/tenant/admin/billing/orders/{orderId}/refund`

**Steps:**
1. Load order — verify `tenant_id` matches (cross-tenant guard)
2. Verify order status is `paid` — else throw `OrderNotRefundableException`
3. Verify no existing refund record for this order — else throw `RefundAlreadyInitiatedException`
4. Verify `refund_amount_cents == order.total_amount_cents` (full refund only)
5. Decrypt tenant secret key
6. Call Stripe Refunds API: `\Stripe\Refund::create(['payment_intent' => $paymentIntentId], ['api_key' => $secretKey])`
7. On Stripe success: create `student_refunds` record (status: `pending`), update order status to `refunded`, revoke enrollment access via domain event
8. On Stripe failure: throw `StripeRefundFailedException` with Stripe error — order status unchanged
9. Audit-log with Stripe refund ID, amount, actor

**Critical:** The Stripe API call is NOT inside a DB transaction. Call Stripe first. If Stripe succeeds, then persist. If DB write fails after Stripe success, a reconciliation alert must be logged.

### 7.6 `SuspendInstallmentAccessCommand` (Scheduled)

**Trigger:** Scheduler — runs daily at 02:00 tenant timezone

**Steps:**
1. Find all `paid` orders with `order_type = installment` where next installment due date has passed `grace_period_days`
2. For each: check if next installment order exists and is `paid`
3. If not paid and grace period exceeded: dispatch `InstallmentAccessSuspended` domain event
4. Listener revokes enrollment access
5. Audit-log suspension with details

---

## 8. Infrastructure Layer

### 8.1 `TenantStripeGateway`

Location: `Infrastructure/PaymentGateway/TenantStripeGateway.php`

Implements `TenantPaymentGatewayInterface`. This is a SEPARATE interface from the platform-level `PaymentGatewayInterface` (Razorpay). They must not share an interface — they serve different money flows.

```php
interface TenantPaymentGatewayInterface
{
    public function createPaymentIntent(
        int $amountCents,
        string $currency,       // 'aed' or 'sar' (lowercase for Stripe)
        array $metadata,
        string $idempotencyKey,
        string $secretKey       // Decrypted tenant secret key
    ): PaymentIntentResult;

    public function createRefund(
        string $paymentIntentId,
        int $amountCents,
        string $secretKey
    ): RefundResult;

    public function validateAccount(string $secretKey): AccountValidationResult;
}
```

**Never** inject the raw Stripe SDK into a UseCase. The UseCase calls the interface. The infrastructure implementation wraps the Stripe SDK.

### 8.2 `StripeAccountValidator`

Location: `Infrastructure/PaymentGateway/StripeAccountValidator.php`

Calls `\Stripe\Account::retrieve(null, ['api_key' => $secretKey])`. Returns `AccountValidationResult` value object with `isValid`, `errorMessage`, `accountId`.

### 8.3 `EncryptionService`

Must use Laravel's `encrypt()` / `decrypt()` backed by `APP_KEY`. Already exists in the platform. If not, create it as a thin wrapper. Never call `encrypt()` / `decrypt()` directly in a UseCase — route through the service.

### 8.4 `GenerateStudentReceiptJob`

Queued job. Uses `DomPdfGenerator` (existing). Generates PDF from a Blade template (`resources/views/receipts/student-payment.blade.php`). Stores to `tenant/{tenantId}/receipts/{orderId}.pdf`. Updates `student_orders.receipt_pdf_path`.

---

## 9. Capability Registry

All new capabilities follow `CAP_*` naming convention. Register in the capability seeder.

| Capability Code | Description | Assigned To |
|---|---|---|
| `CAP_STRIPE_SETTINGS_MANAGE` | Configure tenant Stripe credentials | Tenant OWNER only |
| `CAP_BILLING_ORDERS_VIEW` | View student orders and payment history | Tenant OWNER, Admin |
| `CAP_BILLING_ORDERS_MANAGE` | Cancel orders, initiate refunds | Tenant OWNER, Admin |
| `CAP_INSTALLMENT_PLANS_MANAGE` | Create/edit installment plans for courses | Tenant OWNER, Admin |
| `CAP_STUDENT_RECEIPT_DOWNLOAD` | Download own payment receipt | Student |

All tenant-admin routes must have `EnforceTenantCapability` middleware applied. All student routes must use the student guard with appropriate student-level capability checks.

---

## 10. Domain Events

All events are facts (past tense). Dispatched via the existing `EventDispatcher`. Fired **outside** DB transactions using `DB::afterCommit()`.

| Event | Payload | Listeners |
|---|---|---|
| `TenantStripeSettingsUpdated` | `tenant_id`, `actor_id`, `verified_at` | Audit logger |
| `StudentOrderCreated` | `tenant_id`, `order_id`, `student_id`, `order_type`, `total_cents`, `currency` | Audit logger |
| `StudentPaymentConfirmed` | `tenant_id`, `order_id`, `student_id`, `order_type`, `orderable_id` | `GrantCourseAccessListener`, `GrantBundleAccessListener`, `GrantInstallmentAccessListener`, Audit logger |
| `StudentRefundInitiated` | `tenant_id`, `order_id`, `student_id`, `stripe_refund_id`, `amount_cents` | Audit logger |
| `StudentRefundConfirmed` | `tenant_id`, `order_id`, `student_id` | `RevokeEnrollmentAccessListener`, Audit logger |
| `InstallmentAccessSuspended` | `tenant_id`, `student_id`, `course_id`, `installment_plan_id` | `SuspendEnrollmentAccessListener`, Notification dispatcher |
| `InstallmentAccessRestored` | `tenant_id`, `student_id`, `course_id` | `RestoreEnrollmentAccessListener`, Audit logger |

---

## 11. Security Checklist (Enforced at Audit)

The implementation plan will be rejected at audit if any of the following are not addressed:

| # | Requirement |
|---|---|
| S-01 | Stripe `secret_key` and `webhook_secret` NEVER appear in: API responses, logs, exception messages, audit logs, stack traces |
| S-02 | All `student_orders` queries include `WHERE tenant_id = ?` — global scope via `BelongsToTenant` trait |
| S-03 | Student can only view their own orders — `WHERE student_id = ?` on all student-facing queries |
| S-04 | Tenant Admin cannot view orders from another tenant — return 404 not 403 (existence hiding) |
| S-05 | Webhook endpoint has NO authentication middleware — protected by signature only |
| S-06 | Webhook signature verification failure returns HTTP 400, logs the failed attempt with IP, returns no error detail |
| S-07 | `client_secret` is returned to the student ONCE on order creation. It is NOT stored in DB after the response is sent. |
| S-08 | Amount on the PaymentIntent is ALWAYS read server-side from the pricing context — never from the client request |
| S-09 | Idempotency key is checked BEFORE calling Stripe — prevents duplicate PaymentIntents |
| S-10 | All monetary columns: `BIGINT UNSIGNED`, `_cents` suffix. No `DECIMAL`. No `FLOAT`. |
| S-11 | `DB::afterCommit()` used for all domain event dispatch |
| S-12 | No Stripe API calls inside DB transactions |
| S-13 | PHPStan Level 5 zero errors |

---

## 12. What Phase G2 Does NOT Include

| Excluded Item | Reason | Deferred To |
|---|---|---|
| Stripe Connect | Adds KYC and financial liability for Ubotz | Evaluated post G2 |
| Platform commission on transactions | Business decision — zero commission model | Future if Connect adopted |
| Partial refunds | Adds reconciliation complexity | Future phase |
| Coupon / discount codes | Separate feature domain | Future phase |
| USD, KWD, BHD, QAR currencies | Scope decision — AED and SAR only | G2 revision or G5 |
| Recurring auto-debit via Stripe Subscriptions API | Requires Stripe customer + payment method storage | Future phase |
| Student Stripe customer record creation | Tied to recurring billing — not needed for one-time/installment | Future phase |
| Arabic UI for checkout | UI deferred from GCC Phase 1 | Arabic RTL phase |
| ZATCA-compliant e-invoice generation | Saudi Phase 2 compliance complexity | ZATCA evaluation phase |
| Stripe payment method saving (cards on file) | Requires PCI consideration and recurring billing feature | Future phase |
| Multi-gateway per tenant (Stripe + Razorpay) | GCC tenants use Stripe only; India tenants use Razorpay | Architecture gate |
| Webhook retry monitoring dashboard | Ops tooling | Future ops phase |

---

## 13. Decision Records

| DR | Decision | Rationale |
|---|---|---|
| DR-G2-01 | Tenant brings their own Stripe account — direct charge model | Eliminates Ubotz financial liability. No KYC burden on platform. Fastest path to market. Stripe Connect evaluated post-validation. |
| DR-G2-02 | Webhook endpoint is `tenant/{tenantId}` scoped, not a single global endpoint | Each tenant has a distinct Stripe account and webhook secret. A single endpoint would require resolving the tenant from PaymentIntent metadata before signature verification, creating a TOCTOU window. Scoped URLs verify signature using the correct secret immediately. |
| DR-G2-03 | `client_secret` is NOT persisted to the database | Stripe's `client_secret` is a one-time token for the checkout session. Persisting it creates a window for replay. It is returned in the API response only and discarded server-side. |
| DR-G2-04 | Stripe API call is OUTSIDE the DB transaction that creates the order | Creating the order in DB first, then calling Stripe ensures we always have a record to correlate. If Stripe is called inside a transaction and the transaction rolls back, the Stripe PaymentIntent becomes an orphan. |
| DR-G2-05 | VAT is computed and frozen at order creation time | Tax rates can change. The student paid at a specific rate. Recalculating VAT post-payment would produce incorrect historical records. |
| DR-G2-06 | `TenantPaymentGatewayInterface` is separate from platform `PaymentGatewayInterface` | These are different money flows with different contracts. Merging them would create an interface that half the implementors cannot satisfy (Razorpay cannot use a tenant secret key). |
| DR-G2-07 | Full refund only in Phase G2 | Partial refund requires partial access revocation logic (e.g., refund one course from a bundle). The access grant/revoke logic is not mature enough for partial scenarios. |
| DR-G2-08 | Installment access suspension is done by scheduled command, not webhook | A webhook fires per payment. The absence of a payment (non-event) cannot trigger a webhook. Suspension by inaction must be scheduled. |

---

## 14. Quality Gates — Phase G2 Complete

### Security & Financial Safety Gates (BLOCKING)

- [ ] Stripe secret keys: zero occurrences in logs, API responses, exception messages (`grep -rn 'sk_live\|sk_test' storage/logs/`)
- [ ] `client_secret` not stored in `student_orders` table (verify migration schema)
- [ ] All `student_orders` queries include tenant_id scope (verify via query log in tests)
- [ ] Amount on PaymentIntent verified server-side against pricing context — cannot be overridden by client
- [ ] Webhook signature verification fails correctly on tampered payloads (test with wrong secret)
- [ ] Idempotency: duplicate PaymentIntent creation blocked (test with same idempotency key)
- [ ] Duplicate webhook event processed only once (insert same `stripe_event_id` twice — second is no-op)
- [ ] Refund blocked on non-`paid` orders (test all invalid statuses)
- [ ] Refund amount equals total — partial refund request rejected
- [ ] All monetary columns: BIGINT UNSIGNED, `_cents` suffix — no DECIMAL or FLOAT
- [ ] `DB::afterCommit()` used for all domain event dispatch (grep for events dispatched inside `DB::transaction`)
- [ ] No Stripe API calls inside DB transactions (code review gate)

### Functional Gates (BLOCKING)

- [ ] Tenant can save Stripe credentials — invalid keys are rejected with validation error
- [ ] Student can create a course order — PaymentIntent created with correct amount and currency
- [ ] Student can create a bundle order — PaymentIntent amount is bundle total price
- [ ] Student can create an installment order — PaymentIntent amount is single installment amount
- [ ] `payment_intent.succeeded` webhook → order transitions to `paid`
- [ ] `payment_intent.payment_failed` webhook (×3) → order transitions to `failed`
- [ ] Refund initiated → Stripe called → order transitions to `refunded`
- [ ] Refund confirmed → enrollment access revoked
- [ ] Receipt PDF generated after payment confirmation
- [ ] Receipt PDF downloadable by student (own orders only)
- [ ] Tenant Admin can view all orders, filter by status and student
- [ ] Tenant Admin can cancel `pending_payment` order
- [ ] Installment plan CRUD works (Tenant Admin)
- [ ] Installment access suspension command runs correctly

### Architecture Gates (BLOCKING)

- [ ] PHPStan Level 5: zero new errors
- [ ] All tests pass — zero regression from prior phases
- [ ] `StudentBilling` bounded context has no direct imports from `Enrollment` context (only domain events cross the boundary)
- [ ] Domain layer has zero `Illuminate` imports
- [ ] `TenantStripeGateway` implements `TenantPaymentGatewayInterface` — Stripe SDK not directly referenced in any UseCase
- [ ] Controllers < 20 lines per method
- [ ] `env()` check: `grep -rn 'env(' app/ routes/ database/` returns 0 results
- [ ] Webhook endpoint has no authentication middleware (verify route registration)

### Test Requirements

- [ ] Unit: `StudentOrder` state machine — all valid transitions, all forbidden transitions throw exception
- [ ] Unit: VAT computation — UAE 5%, Saudi 15%, zero VAT, rounding edge cases
- [ ] Unit: `Currency` value object — valid `AED`/`SAR`, rejects invalid values
- [ ] Unit: `OrderType` value object — valid types, invalid rejected
- [ ] Unit: Idempotency key generation format
- [ ] Unit: `TenantStripeGateway` with mocked Stripe SDK — success, failure, network error
- [ ] Unit: `StripeAccountValidator` — valid key, invalid key, Stripe unreachable
- [ ] Feature: `POST /api/tenant/billing/stripe/settings` — success, invalid keys, Stripe validation failure
- [ ] Feature: `POST /api/tenant/student-billing/orders` — course order, bundle order, installment order
- [ ] Feature: `POST /api/tenant/student-billing/orders` — duplicate order blocked
- [ ] Feature: Webhook `payment_intent.succeeded` — order paid, enrollment granted
- [ ] Feature: Webhook `payment_intent.succeeded` — duplicate event idempotent
- [ ] Feature: Webhook `payment_intent.succeeded` — amount mismatch rejected
- [ ] Feature: Webhook invalid signature → HTTP 400
- [ ] Feature: Refund initiation — success, non-paid order rejected, Stripe failure handled
- [ ] Feature: Cross-tenant order access returns 404
- [ ] Feature: Student cannot access another student's order
- [ ] Feature: Installment plan CRUD
- [ ] Minimum 40 new tests expected

---

## 15. Implementation Guidance for Antigravity

### 15.1 Gap Analysis Requirement

Before writing the implementation plan, the developer MUST:

1. Run `DESCRIBE tenant_stripe_settings` — expected result: table does not exist (new)
2. Run `DESCRIBE student_orders` — expected result: table does not exist (new)
3. Confirm `TenantPaymentGatewayInterface` does not already exist — create fresh
4. Confirm existing `DomPdfGenerator` location and interface from the file tree
5. Confirm existing `tenant_audit_logs` table schema — G2 will write to it
6. Confirm `EnforceTenantCapability` middleware accepts the new capability codes listed in §9

### 15.2 Stripe SDK Version

Install via Composer: `stripe/stripe-php`. Pin to `^10.0`. Set the Stripe API version to `2023-10-16` in the gateway constructor. Do not use `Stripe::setApiKey()` globally — always pass the key per-request to avoid cross-tenant key leakage.

### 15.3 Installment Scheduling Logic

For an installment plan with `total_installments = 3`, `frequency_days = 30`:

- Installment 1: due at enrollment (`paid` order for installment_number = 1)
- Installment 2: due 30 days after installment 1 paid_at
- Installment 3: due 30 days after installment 2 paid_at

Due dates are calculated from the `paid_at` of the prior installment, not from enrollment. Store due dates on the enrollment record in the enrollment context.

### 15.4 Queue Configuration

The webhook job `ProcessStripePaymentEventJob` must use a dedicated queue: `stripe-webhooks`. This prevents slow payment processing from blocking other queued work. Configure in `config/queue.php`.

---

*Document version: G2-v1.0. This document is locked for implementation. Superseding documents must be versioned G2-v1.1 or higher and must not alter this document in place.*
