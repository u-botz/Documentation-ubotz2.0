# UBOTZ 2.0 — Student Fee Collection Developer Instructions

## Payment Pipeline & Fee Management

| Field | Value |
|---|---|
| **Document Type** | Developer Instruction (Pre-Implementation Brief) |
| **Date** | March 18, 2026 |
| **Issued By** | Principal Engineer / Architecture Auditor |
| **Audience** | Implementation Developer (Antigravity) |
| **Expected Deliverable** | Implementation Plan (same format as 10A–14 plans) |
| **Prerequisites** | Enrollment system COMPLETE (CourseEnrollment, BundleEnrollment, SubscriptionEnrollment entities + tables), Installment Plan system COMPLETE (plans, steps, orders, order_payments tables + domain events), Notification Infrastructure COMPLETE (Phase 14), Student Panel DESIGNED, Razorpay platform integration COMPLETE (Phases 12A–12C — patterns reusable but credentials separate) |

> **This feature connects money to access. The enrollment system knows WHO has access. The installment system knows WHO owes WHAT. This feature is the bridge that actually moves money — from student's bank account into the tenant's Razorpay account — and triggers the downstream enrollment. Every rupee must be traceable, every payment auditable, every receipt downloadable. Real money is at risk.**

---

## 1. Mission Statement

This feature builds the **Student Fee Collection Pipeline** — the payment infrastructure that enables students to pay for courses, bundles, and subscription plans, and enables admins to record offline payments and manage the institution's financial ledger.

The system has two payment channels:
1. **Online** — Student clicks "Pay Now," Razorpay processes the payment, webhook confirms, system records and triggers enrollment
2. **Offline** — Admin records a cash/bank transfer payment manually, system records and triggers enrollment

And two purchase flows:
1. **One-time purchase** — Student pays the full course/bundle price in a single transaction, gets enrolled immediately
2. **Installment step payment** — Student pays an individual installment step (from an existing `InstallmentOrder`), system records the payment against the step

**What this phase includes:**
- Tenant-level Razorpay credential management (each tenant configures their own `key_id` / `key_secret`)
- Student-facing Razorpay checkout for one-time purchases
- Student-facing Razorpay checkout for installment step payments
- Admin offline payment recording (cash, bank transfer, cheque — admin marks as paid)
- Payment receipt PDF generation (simple receipt: amount, date, reference, tenant name)
- Overdue detection scheduled command (marks `installment_order_payments` as overdue)
- Automated reminder notifications (T-7 days before due, T+1 day after due)
- Auto-suspend enrollment after configurable overdue threshold (e.g., T+15 days)
- Student fee dashboard (My Fees page in Student Panel — paid, due, overdue view)
- Admin fee ledger (all students' fee status, filterable by batch/course/status)
- Razorpay webhook handler for student payment verification
- Payment transaction recording with full audit trail

**What this phase does NOT include:**
- Discount / coupon / scholarship system (deferred)
- Refund processing (deferred — admin can cancel orders but no money-back through Razorpay)
- Full tax-compliant invoice with GST/VAT line items (simple receipt only in Phase 1)
- Razorpay auto-debit / recurring payments for installments (student pays each step manually)
- Payment gateway selection (Razorpay only — Stripe/PayPal deferred)
- Student wallet / prepaid balance
- Parent-facing fee payment (deferred until Parent Panel)
- Partial payment on a step (student pays the full step amount or nothing)
- Late fees / penalty charges on overdue payments
- Payment reconciliation dashboard (admin-level Razorpay vs platform records comparison)
- Bundle and subscription purchase flows (Phase 1 focuses on course one-time purchase + installment flow; bundle/subscription checkout uses the same patterns but is wired separately)

---

## 2. Business Context

### 2.1 Current State

The enrollment and installment systems exist but operate without a payment bridge:

| What Exists | What It Does | What's Missing |
|---|---|---|
| `course_enrollments` table | Records that Student X has access to Course Y | No way for a student to PAY for a course to get enrolled |
| `InstallmentPlanEntity` + steps | Defines "pay ₹15,000 in 3 installments" | No way for a student to actually PAY an installment step |
| `InstallmentOrderEntity` | Tracks a student's commitment to a plan | Steps have statuses (`pending/paid/overdue`) but no money moves |
| `InstallmentOrderPaymentEntity` | Records individual step payment status | No Razorpay integration, no offline recording, no receipts |
| `GrantAccessOnInstallmentCompleted` listener | Enrolls student when order completes | Never fires because no payment mechanism exists |
| `EnrollStudentUseCase` (free + admin_grant) | Two working enrollment paths | `purchase` source path has no payment gateway |
| Platform Razorpay (Phases 12A–12C) | Tenant subscription billing | Student payments need TENANT-level Razorpay, not platform-level |

### 2.2 What Changes After This Phase

1. Each tenant configures their own Razorpay `key_id` / `key_secret` in tenant settings. Student payments go directly to the tenant's bank account.
2. Students can purchase a course in one click — Razorpay checkout opens, payment processes, enrollment is created automatically.
3. Students with installment orders can pay each step via Razorpay — step marked as `paid`, and when the final step is paid, enrollment activates.
4. Admins can record offline payments (cash, bank transfer) against a student's order or a one-time purchase.
5. Every payment generates a downloadable receipt PDF.
6. A scheduled command detects overdue installment payments and sends reminders.
7. After a configurable number of days overdue, the system auto-suspends the student's enrollment.
8. Students see a "My Fees" dashboard showing paid, due, and overdue items.
9. Admins see a fee ledger showing all students' payment statuses across the institution.

### 2.3 Payment Flow Architecture

**One-Time Purchase (Online):**
```
Student → "Buy Course" → Razorpay Checkout (tenant credentials)
    → Payment success → Razorpay Webhook
    → Verify signature → Record PaymentTransaction
    → Create CourseEnrollment (source: purchase)
    → Generate Receipt PDF
    → Notify student (payment confirmation)
```

**One-Time Purchase (Offline):**
```
Admin → "Record Payment for Student X, Course Y"
    → Enter: amount, method (cash/bank/cheque), reference number
    → Record PaymentTransaction (method: offline)
    → Create CourseEnrollment (source: purchase)
    → Generate Receipt PDF
    → Notify student (enrollment confirmed)
```

**Installment Step Payment (Online):**
```
Student → "Pay Step 2" on My Fees dashboard → Razorpay Checkout
    → Payment success → Razorpay Webhook
    → Verify signature → Record PaymentTransaction
    → Mark InstallmentOrderPayment as `paid`
    → If all steps paid → fire InstallmentOrderCompleted event
        → GrantAccessOnInstallmentCompleted listener → Enroll
    → Generate Receipt PDF
    → Notify student
```

**Installment Step Payment (Offline):**
```
Admin → "Record Payment for Student X, Order Y, Step 2"
    → Enter: amount, method, reference
    → Record PaymentTransaction
    → Mark InstallmentOrderPayment as `paid`
    → Same completion check as online flow
    → Generate Receipt PDF
```

---

## 3. Business Rules (NON-NEGOTIABLE)

### 3.1 Financial Safety Rules

| Rule ID | Rule | Enforcement |
|---|---|---|
| **FR-01** | All monetary values stored as `_cents` integers (BIGINT UNSIGNED). No floats, no decimals in the database. | Schema enforcement. `amount_cents`, `total_cents` columns. |
| **FR-02** | Every Razorpay API call must happen OUTSIDE of a database transaction. Never call Razorpay inside a `DB::transaction()` block. | Code review enforcement. Razorpay order creation → then DB write. |
| **FR-03** | Every payment operation must be idempotent. Re-processing the same Razorpay webhook must not create duplicate transactions or enrollments. | Idempotency key on `payment_transactions` table. Webhook handler checks for existing transaction before processing. |
| **FR-04** | Razorpay payment signature must be verified before any state change. An unverified payment is treated as failed. | `razorpay_signature` verification using tenant's `key_secret` before marking payment as successful. |
| **FR-05** | Pessimistic locking (`SELECT FOR UPDATE`) on the `installment_order_payments` row when recording a payment, to prevent double-payment of the same step. | DB-level lock within transaction. |
| **FR-06** | Audit logs for ALL payment events must be written AFTER the transaction commits, never inside. | Standard UBOTZ audit pattern. |
| **FR-07** | Offline payment recording requires admin capability `fee.record_payment`. The admin's identity is permanently recorded on the transaction — it cannot be anonymous. | `recorded_by` column on transaction, capability check in UseCase. |

### 3.2 Tenant Razorpay Configuration Rules

| Rule ID | Rule | Enforcement |
|---|---|---|
| **FR-08** | Each tenant stores their own Razorpay `key_id` and `key_secret`. These are encrypted at rest in the database. | `tenant_payment_configs` table with encrypted columns. Laravel's `Crypt::encrypt()` / `decrypt()`. |
| **FR-09** | Student checkout is blocked if the tenant has not configured Razorpay credentials. The API returns a clear error: "Payment gateway not configured. Contact your administrator." | UseCase-level check before creating Razorpay order. |
| **FR-10** | Razorpay webhook endpoint is tenant-aware. The webhook URL includes the tenant identifier so the handler knows which tenant's `key_secret` to use for signature verification. | Webhook route: `/api/v1/tenant/{tenantSlug}/webhooks/razorpay/student-payment` |
| **FR-11** | Tenant Razorpay credentials are NEVER exposed in API responses. They are write-only from the admin perspective (set/update, never read back). | API returns masked status: `"razorpay_configured": true/false`, never the actual keys. |

### 3.3 One-Time Purchase Rules

| Rule ID | Rule | Enforcement |
|---|---|---|
| **FR-12** | A one-time purchase creates a Razorpay Order (via Orders API) with the course price. The student pays the full amount in one transaction. | `CreatePurchaseOrderUseCase` calls Razorpay Orders API. |
| **FR-13** | If a course has `price_amount_cents = 0`, it is a free course. The student uses the existing free enrollment path — no payment flow triggered. | UseCase checks price before initiating payment. |
| **FR-14** | A student cannot purchase a course they are already actively enrolled in. Duplicate purchase is rejected at the UseCase level. | Query `course_enrollments` for active enrollment before proceeding. |
| **FR-15** | After successful payment verification, enrollment is created with `source: purchase` and `expires_at` based on the course's configured access duration (or null for lifetime). | `CreateCourseEnrollmentUseCase` called from payment confirmation handler. |

### 3.4 Installment Payment Rules

| Rule ID | Rule | Enforcement |
|---|---|---|
| **FR-16** | An installment step payment must match the exact step amount. No partial payments on a step. | Razorpay Order created for exactly `step.amount_cents`. |
| **FR-17** | Installment steps must be paid in order. Step 2 cannot be paid before Step 1 is marked `paid`. The upfront payment (if any) must be paid first. | UseCase validates all previous steps are `paid` before allowing payment on the current step. |
| **FR-18** | When the final step of an installment order is paid, the order status transitions to `completed` and the `InstallmentOrderCompleted` event fires. This triggers enrollment via the existing `GrantAccessOnInstallmentCompleted` listener. | Completion check in `RecordInstallmentStepPaymentUseCase` after marking step as paid. |
| **FR-19** | For installment plans with `request_verify = true`, the order must be in `active` status (admin-approved) before any step payment is accepted. Orders in `pending` status cannot accept payments. | Status check in UseCase. |

### 3.5 Offline Payment Rules

| Rule ID | Rule | Enforcement |
|---|---|---|
| **FR-20** | Offline payments are recorded by an admin with: amount, payment method (`cash`, `bank_transfer`, `cheque`), external reference number, and optional notes. | `RecordOfflinePaymentUseCase` with required fields. |
| **FR-21** | Offline payment recording triggers the same downstream effects as online payment: enrollment creation (for one-time) or step completion check (for installment). | Shared completion logic between online and offline paths. |
| **FR-22** | Offline payments have `gateway: offline` and `gateway_payment_id: null` on the transaction record. The `external_reference` field captures the bank reference or receipt number provided by the admin. | Column design on `payment_transactions`. |
| **FR-23** | Offline payments skip Razorpay signature verification (obviously). The admin's identity serves as the trust anchor — their user_id is recorded as `recorded_by`. | Separate code path from Razorpay webhook, no signature check. |

### 3.6 Overdue & Auto-Suspend Rules

| Rule ID | Rule | Enforcement |
|---|---|---|
| **FR-24** | A scheduled command runs daily and marks `installment_order_payments` as `overdue` when `due_date < today AND status = pending`. | `fee:detect-overdue` command, daily at 1:00 AM. |
| **FR-25** | Reminder notifications are sent at configurable intervals: T-7 days (upcoming due), T+1 day (payment overdue). Reminders are idempotent — use `notification_sent_log` to prevent duplicates. | `fee:send-reminders` command, daily at 9:00 AM. |
| **FR-26** | After a configurable number of days overdue (tenant setting: `overdue_suspend_days`, default 15), the system auto-suspends the related enrollment. Enrollment status → `suspended`. The student loses access to course content. | `fee:enforce-overdue-suspension` command, daily at 2:00 AM. |
| **FR-27** | When an overdue payment is eventually made (online or offline), the suspension is automatically lifted. Enrollment status → `active`. | Payment confirmation handler checks for suspended enrollment and reactivates. |
| **FR-28** | Auto-suspension and reactivation are audit-logged with the reason: "Auto-suspended due to overdue payment (Step 2, 18 days overdue)" / "Reactivated after overdue payment received." | Audit log with full context. |

### 3.7 Receipt Rules

| Rule ID | Rule | Enforcement |
|---|---|---|
| **FR-29** | Every successful payment (online or offline) generates a receipt PDF. The receipt is stored in the tenant's file storage and linked to the `payment_transactions` record. | `GeneratePaymentReceiptUseCase` called after payment confirmation. |
| **FR-30** | Receipt contents: tenant name/logo, student name, payment date, amount, payment method, reference number, item description (course name or installment step label), and a unique receipt number. | PDF rendered from a Blade template. |
| **FR-31** | Receipt number format: `{TENANT_CODE}-RCP-{YEAR}-{SEQUENCE}` (e.g., `ACAD-RCP-2026-00042`). Sequence is auto-incrementing per tenant per year. | `receipt_sequence` counter, scoped by `tenant_id + year`. |
| **FR-32** | Receipts are immutable once generated. If a payment is later reversed (future refund feature), a separate credit note is issued — the original receipt is never modified. | Append-only pattern. Receipt PDFs are stored as immutable files. |

---

## 4. Database Schema

### 4.1 New Tables

**Table: `tenant_payment_configs`** (tenant-scoped, one row per tenant)

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | BIGINT UNSIGNED PK | NO | auto-increment | |
| `tenant_id` | BIGINT UNSIGNED FK → `tenants(id)` | NO | — | UNIQUE. ON DELETE CASCADE |
| `razorpay_key_id` | TEXT | YES | NULL | Encrypted at rest via Laravel Crypt |
| `razorpay_key_secret` | TEXT | YES | NULL | Encrypted at rest |
| `razorpay_webhook_secret` | TEXT | YES | NULL | Encrypted. For webhook signature verification |
| `currency` | VARCHAR(3) | NO | `INR` | ISO 4217 currency code |
| `overdue_suspend_days` | SMALLINT UNSIGNED | NO | 15 | Days after due date before auto-suspend |
| `is_active` | BOOLEAN | NO | false | Must be explicitly activated after credentials are configured |
| `created_at` | TIMESTAMP | NO | CURRENT_TIMESTAMP | |
| `updated_at` | TIMESTAMP | NO | CURRENT_TIMESTAMP | |

**Indexes:**
- `unq_tenant_payment_config_tenant` — UNIQUE(`tenant_id`)

---

**Table: `payment_transactions`** (tenant-scoped)

The central ledger of all student payments — both online and offline.

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | BIGINT UNSIGNED PK | NO | auto-increment | |
| `tenant_id` | BIGINT UNSIGNED FK → `tenants(id)` | NO | — | ON DELETE CASCADE |
| `user_id` | BIGINT UNSIGNED FK → `users(id)` | NO | — | The paying student. ON DELETE RESTRICT |
| `idempotency_key` | VARCHAR(100) | NO | — | Prevents duplicate processing. UNIQUE per tenant |
| `transaction_type` | VARCHAR(30) | NO | — | `one_time_purchase`, `installment_step` |
| `item_type` | VARCHAR(30) | NO | — | `course`, `bundle`, `subscription_plan` |
| `item_id` | BIGINT UNSIGNED | NO | — | FK to the item being purchased (course_id, etc.) |
| `installment_order_id` | BIGINT UNSIGNED FK → `installment_orders(id)` | YES | NULL | Only for installment payments |
| `installment_order_payment_id` | BIGINT UNSIGNED FK → `installment_order_payments(id)` | YES | NULL | The specific step being paid |
| `amount_cents` | BIGINT UNSIGNED | NO | — | Amount in smallest currency unit |
| `currency` | VARCHAR(3) | NO | `INR` | ISO 4217 |
| `gateway` | VARCHAR(30) | NO | — | `razorpay`, `offline` |
| `gateway_order_id` | VARCHAR(100) | YES | NULL | Razorpay order_id (for online payments) |
| `gateway_payment_id` | VARCHAR(100) | YES | NULL | Razorpay payment_id (for online payments) |
| `gateway_signature` | VARCHAR(255) | YES | NULL | Razorpay signature (for verification audit) |
| `offline_method` | VARCHAR(30) | YES | NULL | `cash`, `bank_transfer`, `cheque` (for offline) |
| `external_reference` | VARCHAR(255) | YES | NULL | Bank reference / cheque number (for offline) |
| `status` | VARCHAR(30) | NO | `pending` | `pending`, `completed`, `failed`, `refunded` (refunded for future use) |
| `recorded_by` | BIGINT UNSIGNED FK → `users(id)` | YES | NULL | Admin who recorded offline payment. ON DELETE SET NULL |
| `notes` | TEXT | YES | NULL | Admin notes (for offline) or failure reason |
| `receipt_number` | VARCHAR(50) | YES | NULL | Generated after successful payment |
| `receipt_file_path` | VARCHAR(500) | YES | NULL | Path to stored receipt PDF |
| `completed_at` | TIMESTAMP | YES | NULL | When payment was confirmed successful |
| `created_at` | TIMESTAMP | NO | CURRENT_TIMESTAMP | |
| `updated_at` | TIMESTAMP | NO | CURRENT_TIMESTAMP | |

**Indexes:**
- `unq_payment_tx_tenant_idempotency` — UNIQUE(`tenant_id`, `idempotency_key`)
- `idx_payment_tx_tenant_user` — (`tenant_id`, `user_id`)
- `idx_payment_tx_tenant_status` — (`tenant_id`, `status`)
- `idx_payment_tx_tenant_item` — (`tenant_id`, `item_type`, `item_id`)
- `idx_payment_tx_gateway_order` — (`gateway_order_id`) for Razorpay webhook lookup
- `idx_payment_tx_gateway_payment` — (`gateway_payment_id`) for deduplication
- `idx_payment_tx_installment_order` — (`installment_order_id`)

---

**Table: `receipt_sequences`** (tenant-scoped)

Auto-incrementing receipt number per tenant per year.

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | BIGINT UNSIGNED PK | NO | auto-increment | |
| `tenant_id` | BIGINT UNSIGNED FK → `tenants(id)` | NO | — | ON DELETE CASCADE |
| `year` | SMALLINT UNSIGNED | NO | — | Calendar year (e.g., 2026) |
| `last_sequence` | INT UNSIGNED | NO | 0 | Incremented atomically per receipt |
| `created_at` | TIMESTAMP | NO | CURRENT_TIMESTAMP | |
| `updated_at` | TIMESTAMP | NO | CURRENT_TIMESTAMP | |

**Indexes:**
- `unq_receipt_seq_tenant_year` — UNIQUE(`tenant_id`, `year`)

**Atomic increment pattern:**
```sql
UPDATE receipt_sequences
SET last_sequence = last_sequence + 1, updated_at = NOW()
WHERE tenant_id = ? AND year = ?;
-- Then SELECT last_sequence for the new receipt number
```
If no row exists for the current year, INSERT with `last_sequence = 1`.

---

### 4.2 No Modifications to Existing Tables

The existing `installment_order_payments` table already has `status` (`pending`, `paid`, `overdue`) and `due_date` columns. The existing `course_enrollments` table already has `status` (`active`, `cancelled`).

**One addition needed on `course_enrollments`:**

| Column | Type | Notes |
|---|---|---|
| `suspended_at` | TIMESTAMP, nullable | Set when auto-suspended due to overdue payment. Cleared on reactivation. |
| `suspension_reason` | VARCHAR(500), nullable | e.g., "Auto-suspended: installment step 2 overdue by 18 days" |

The `status` value during suspension: the developer must decide whether to add a `suspended` status to the existing `active/cancelled` enum, or use the `suspended_at` timestamp as an overlay on `active` status. **Recommended: add `suspended` as a third status value** to make queries simple (`WHERE status = 'active'` correctly excludes suspended students).

---

## 5. API Design

### 5.1 Tenant Payment Configuration (Admin)

| Method | Endpoint | Purpose | Capability |
|---|---|---|---|
| GET | `/api/v1/tenant/settings/payment` | Get payment config status (configured: yes/no, currency, overdue_suspend_days — NO credentials returned) | `settings.manage` |
| PUT | `/api/v1/tenant/settings/payment` | Set/update Razorpay credentials + payment settings | `settings.manage` |
| POST | `/api/v1/tenant/settings/payment/verify` | Test Razorpay credentials by making a test API call | `settings.manage` |

### 5.2 Student Purchase Flow (Student Panel)

| Method | Endpoint | Purpose | Auth |
|---|---|---|---|
| POST | `/api/v1/panel/payments/purchase` | Initiate one-time course purchase → creates Razorpay Order, returns `order_id` + `key_id` for frontend checkout | `tenant_api` (student) |
| POST | `/api/v1/panel/payments/purchase/verify` | Verify Razorpay payment after checkout → creates enrollment | `tenant_api` (student) |
| POST | `/api/v1/panel/payments/installment/{orderPaymentId}/pay` | Initiate installment step payment → creates Razorpay Order | `tenant_api` (student) |
| POST | `/api/v1/panel/payments/installment/{orderPaymentId}/verify` | Verify installment step payment | `tenant_api` (student) |

**Razorpay Webhook (server-to-server):**

| Method | Endpoint | Purpose | Auth |
|---|---|---|---|
| POST | `/api/v1/tenant/{tenantSlug}/webhooks/razorpay/student-payment` | Razorpay payment.authorized / payment.captured / payment.failed events | Razorpay signature verification |

### 5.3 Admin Offline Payment Recording

| Method | Endpoint | Purpose | Capability |
|---|---|---|---|
| POST | `/api/v1/tenant/fees/offline-payment` | Record an offline payment (one-time or installment step) | `fee.record_payment` |

**Request body:**
```json
{
  "user_id": 42,
  "payment_for": "one_time_purchase",
  "item_type": "course",
  "item_id": 15,
  "amount_cents": 1500000,
  "method": "bank_transfer",
  "external_reference": "NEFT-REF-20260318-001",
  "notes": "Bank transfer confirmed via account statement"
}
```

Or for installment:
```json
{
  "user_id": 42,
  "payment_for": "installment_step",
  "installment_order_payment_id": 88,
  "amount_cents": 500000,
  "method": "cash",
  "external_reference": "Cash receipt #312",
  "notes": null
}
```

### 5.4 Student Fee Dashboard (Student Panel)

| Method | Endpoint | Purpose | Auth |
|---|---|---|---|
| GET | `/api/v1/panel/fees/summary` | Fee overview: total due, total paid, total overdue, next due date | `tenant_api` (student) |
| GET | `/api/v1/panel/fees/installments` | List all installment orders with step-by-step status (paid/pending/overdue) | `tenant_api` (student) |
| GET | `/api/v1/panel/fees/payments` | Payment history — all transactions (online + offline) with receipt download links | `tenant_api` (student) |
| GET | `/api/v1/panel/fees/receipts/{transactionId}/download` | Download receipt PDF | `tenant_api` (student) |

### 5.5 Admin Fee Ledger (Tenant Admin Dashboard)

| Method | Endpoint | Purpose | Capability |
|---|---|---|---|
| GET | `/api/v1/tenant/fees/ledger` | All students' fee status, filterable/paginated | `fee.view` |
| GET | `/api/v1/tenant/fees/ledger/{userId}` | Specific student's fee detail — all orders, payments, receipts | `fee.view` |
| GET | `/api/v1/tenant/fees/transactions` | All payment transactions across institution | `fee.view` |
| GET | `/api/v1/tenant/fees/overdue` | Students with overdue payments — urgency list | `fee.view` |
| GET | `/api/v1/tenant/fees/stats` | Summary: total collected, total outstanding, overdue count, collection rate | `fee.view` |

**Ledger Query Parameters:**

| Parameter | Type | Example |
|---|---|---|
| `filter[status]` | string | `paid`, `pending`, `overdue`, `suspended` |
| `filter[batch_id]` | integer | Filter by batch (via student's batch membership) |
| `filter[course_id]` | integer | Filter by specific course |
| `filter[date_from]` | date | `2026-01-01` |
| `filter[date_to]` | date | `2026-03-31` |
| `search` | string | Student name or email |
| `sort` | string | `-due_date`, `amount`, `student_name` |

---

## 6. Application Layer — UseCases

### 6.1 Purchase Flow

| UseCase | Key Logic |
|---|---|
| `InitiatePurchaseUseCase` | Validate course exists, is published, has price > 0. Check student not already enrolled. Check tenant Razorpay configured. Create Razorpay Order (amount = course price). Store pending `payment_transactions` record with idempotency key. Return Razorpay `order_id` + tenant `key_id` to frontend. **Razorpay API call OUTSIDE transaction.** |
| `VerifyPurchasePaymentUseCase` | Receive `razorpay_order_id`, `razorpay_payment_id`, `razorpay_signature`. Verify signature using tenant's `key_secret`. Load pending transaction by `gateway_order_id`. Within transaction: mark transaction `completed`, create `CourseEnrollment` (source: `purchase`), generate receipt number, queue receipt PDF generation. After commit: audit log, dispatch `StudentEnrolledEvent`, dispatch `PaymentCompletedEvent`, notify student. |
| `InitiateInstallmentStepPaymentUseCase` | Load `installment_order_payment`. Validate step is `pending` (not already paid or overdue-and-locked). Validate all previous steps are `paid` (sequential enforcement). Validate order is `active`. Check tenant Razorpay configured. Create Razorpay Order (amount = step amount). Store pending `payment_transactions`. Return checkout data. |
| `VerifyInstallmentStepPaymentUseCase` | Same signature verification flow. Mark transaction `completed`. Within transaction: `SELECT FOR UPDATE` on `installment_order_payments` row, mark step `paid`. Check if all steps now paid → if yes, transition order to `completed`, fire `InstallmentOrderCompleted`. Generate receipt. If enrollment was suspended due to overdue, reactivate it. After commit: audit, events, notifications. |

### 6.2 Offline Payment

| UseCase | Key Logic |
|---|---|
| `RecordOfflinePaymentUseCase` | Validate admin has `fee.record_payment` capability. Validate student and item exist in tenant. For one-time: check student not already enrolled, create transaction (gateway: `offline`), create enrollment. For installment: load step, validate sequential payment, `SELECT FOR UPDATE`, mark paid, completion check. Generate receipt. All within transaction except receipt PDF generation (queued). Audit log with admin identity. |

### 6.3 Webhook Handler

| UseCase | Key Logic |
|---|---|
| `HandleRazorpayStudentWebhookUseCase` | Resolve tenant from URL slug. Verify webhook signature using tenant's `razorpay_webhook_secret`. Parse event type (`payment.captured`, `payment.failed`). For `payment.captured`: find pending transaction by `gateway_payment_id`, process same as verify flow (idempotent — skip if already completed). For `payment.failed`: mark transaction as `failed`, log reason. **The webhook is a safety net — the primary flow is client-side verify. Both paths must be idempotent.** |

### 6.4 Overdue & Suspension

| UseCase | Key Logic |
|---|---|
| `DetectOverduePaymentsCommand` | Find all `installment_order_payments` where `due_date < today` AND `status = pending`. Mark as `overdue`. Dispatch `InstallmentStepOverdue` event. Run daily at 1:00 AM. |
| `SendFeeRemindersCommand` | T-7: find steps where `due_date = today + 7 days` AND `status = pending`. Send reminder notification. T+1: find steps where `due_date = today - 1 day` AND `status = overdue`. Send overdue notification. Idempotent via `notification_sent_log`. Run daily at 9:00 AM. |
| `EnforceOverdueSuspensionCommand` | Load tenant's `overdue_suspend_days` setting. Find `installment_order_payments` where `status = overdue` AND `due_date < today - overdue_suspend_days`. For each: find related enrollment, set status → `suspended`, set `suspended_at`, set `suspension_reason`. Dispatch `EnrollmentSuspendedDueToOverdue` event. Notify student. Run daily at 2:00 AM. Idempotent — skip already-suspended enrollments. |

### 6.5 Receipt Generation

| UseCase | Key Logic |
|---|---|
| `GeneratePaymentReceiptUseCase` | Atomically increment `receipt_sequences` for tenant+year. Format receipt number: `{TENANT_CODE}-RCP-{YEAR}-{SEQUENCE padded to 5 digits}`. Render Blade template to PDF (tenant name, student name, amount, date, method, reference, item description, receipt number). Store PDF in tenant's file storage. Update `payment_transactions.receipt_number` and `receipt_file_path`. **Queue this as a job — do not block the payment confirmation response.** |

---

## 7. Capability Registry (New Capabilities)

| Capability Code | Display Name | Module | Default Roles |
|---|---|---|---|
| `fee.view` | View Fee Ledger | `fee` | OWNER, ADMIN, STAFF |
| `fee.record_payment` | Record Offline Payments | `fee` | OWNER, ADMIN |

Students access their own fee data via the Panel context using role-based auth.

---

## 8. Notification Integration

| Notification | Trigger | Recipient | Category | Priority |
|---|---|---|---|---|
| Payment Successful | `PaymentCompletedEvent` | Student | `billing` (mandatory) | `default` |
| Payment Failed | Razorpay `payment.failed` webhook | Student | `billing` | `default` |
| Enrollment Confirmed | `StudentEnrolledEvent` (purchase source) | Student | `system` | `default` |
| Installment Due Soon | `fee:send-reminders` (T-7 days) | Student | `billing` | `low` |
| Installment Overdue | `fee:send-reminders` (T+1 day) | Student | `billing` | `default` |
| Enrollment Suspended (Overdue) | `EnrollmentSuspendedDueToOverdue` | Student | `billing` | `high` |
| Enrollment Reactivated | Overdue payment received | Student | `billing` | `default` |
| Offline Payment Recorded | `RecordOfflinePaymentUseCase` | Student | `billing` | `default` |

---

## 9. Domain Events

| Event | Payload | Triggered By |
|---|---|---|
| `PaymentCompletedEvent` | transaction_id, tenant_id, user_id, amount_cents, gateway, item_type, item_id | Payment verification (online or offline) |
| `PaymentFailedEvent` | transaction_id, tenant_id, user_id, reason | Razorpay webhook (payment.failed) |
| `InstallmentStepPaid` | order_payment_id, order_id, tenant_id, user_id, step_number | Step payment verification |
| `InstallmentStepOverdue` | order_payment_id, order_id, tenant_id, user_id, days_overdue | DetectOverduePaymentsCommand |
| `EnrollmentSuspendedDueToOverdue` | enrollment_id, tenant_id, user_id, overdue_step_id, days_overdue | EnforceOverdueSuspensionCommand |
| `EnrollmentReactivatedAfterPayment` | enrollment_id, tenant_id, user_id, transaction_id | Payment verification (when overdue resolved) |

Note: `StudentEnrolledEvent` and `InstallmentOrderCompleted` already exist in the enrollment/installment systems.

---

## 10. Audit Log Events

| Action | Entity Type | Trigger |
|---|---|---|
| `fee.payment.completed` | `payment_transaction` | Online payment verified |
| `fee.payment.failed` | `payment_transaction` | Razorpay payment failed |
| `fee.payment.offline_recorded` | `payment_transaction` | Admin records offline payment |
| `fee.installment_step.paid` | `installment_order_payment` | Step payment completed |
| `fee.installment_step.overdue` | `installment_order_payment` | Overdue detection command |
| `fee.enrollment.suspended` | `course_enrollment` | Auto-suspend command |
| `fee.enrollment.reactivated` | `course_enrollment` | Payment received for overdue step |
| `fee.receipt.generated` | `payment_transaction` | Receipt PDF created |
| `fee.config.updated` | `tenant_payment_config` | Admin updates Razorpay credentials |

---

## 11. Security Considerations

| Concern | Mitigation |
|---|---|
| **Razorpay credential exposure** | Credentials encrypted at rest. Never returned in API responses. Write-only. |
| **Payment tampering** | Razorpay signature verification on every payment. Amount in Razorpay Order matches expected price — student cannot alter amount client-side. |
| **Double payment** | Idempotency key on transactions. Pessimistic locking on installment step. Webhook handler checks existing transaction before processing. |
| **Cross-tenant payment routing** | Webhook URL includes tenant slug. Signature verified with THAT tenant's secret. A webhook signed by Tenant A's key cannot be processed against Tenant B. |
| **Offline payment fraud** | Admin identity (`recorded_by`) permanently recorded. Capability-gated. Audit logged. Two admins cannot record the same payment (idempotency key). |
| **Overdue suspension bypass** | Suspension check runs daily as scheduled command. Enrollment status is the source of truth for content access — the access middleware checks enrollment status, not payment status. |
| **Receipt tampering** | Receipts are immutable files. Receipt number sequence is atomically incremented. No update/delete on receipt records. |

---

## 12. Decision Records

### DR-FEE-001: Tenant-Level Razorpay Credentials

| Field | Value |
|---|---|
| **Decision** | Each tenant configures their own Razorpay `key_id` / `key_secret`. Student payments go directly to the tenant's bank account. |
| **Alternatives Considered** | (1) Platform-level Razorpay — all payments through UBOTZ account, platform settles with tenants. Rejected: creates regulatory/compliance burden, UBOTZ becomes a payment aggregator, settlement delays. (2) Razorpay Route (split payments) — platform collects, auto-splits to tenant. Rejected: requires Razorpay Route activation, adds dependency on Razorpay's settlement timelines. |
| **Impact** | Each tenant must have a Razorpay business account. Tenants without Razorpay can only use offline payments. |

### DR-FEE-002: Separate One-Time and Installment Flows

| Field | Value |
|---|---|
| **Decision** | One-time purchase is a separate, simpler flow from installment payments. Not modeled as a "1-step installment plan." |
| **Rationale** | One-time purchase is: student pays full price → enrolled immediately. No order, no steps, no due dates. Forcing this through the installment system adds unnecessary complexity and confusing UX for the 80% case. |
| **Impact** | Two code paths for payment initiation/verification. Shared: receipt generation, transaction recording, Razorpay integration. |

### DR-FEE-003: No Refunds in Phase 1

| Field | Value |
|---|---|
| **Decision** | Admin can cancel installment orders (stops future steps) but no money-back refund processing through Razorpay. |
| **Rationale** | Refunds require: Razorpay Refund API integration, partial refund calculation, credit note generation, refund approval workflow, and settlement reconciliation. This is a full sub-phase. |
| **Impact** | If a student needs a refund, the tenant handles it manually outside the platform (direct bank transfer). The `payment_transactions.status = refunded` value exists in the schema for future use. |

### DR-FEE-004: Simple Receipt, Not Tax Invoice

| Field | Value |
|---|---|
| **Decision** | Phase 1 generates a simple payment receipt (amount, date, reference, tenant name). Not a full tax-compliant invoice with GST/VAT line items. |
| **Rationale** | Tax compliance varies by country (GST in India, VAT in EU, Sales Tax in US). Building a configurable tax engine is a separate feature. A receipt confirms payment was received — it is not a tax document. |
| **Impact** | Tenants needing tax invoices must generate them through their own accounting software using data exported from UBOTZ. |

### DR-FEE-005: Webhook as Safety Net, Not Primary Flow

| Field | Value |
|---|---|
| **Decision** | The primary payment confirmation flow is client-side verify (student's browser sends `razorpay_payment_id` + signature back to UBOTZ API). The Razorpay webhook is a redundant safety net for cases where the client-side call fails (browser crash, network timeout). |
| **Rationale** | Client-side verify gives instant confirmation to the student. Webhooks can be delayed by seconds to minutes. But if the browser crashes after Razorpay captures the payment and before the verify API is called, the webhook catches it. Both paths are idempotent — processing the same payment twice is safe. |
| **Impact** | Two code paths must be tested: (1) normal flow via verify API, (2) webhook-only flow when client drops. |

---

## 13. Razorpay Integration Pattern

### 13.1 Checkout Flow (Frontend)

```
1. Student clicks "Pay ₹15,000 for Physics 101"
2. Frontend calls POST /api/v1/panel/payments/purchase
   → Backend creates Razorpay Order, returns { order_id, key_id, amount, currency }
3. Frontend opens Razorpay Checkout widget:
   var options = {
     key: response.key_id,          // Tenant's Razorpay key
     amount: response.amount,
     currency: response.currency,
     order_id: response.order_id,
     handler: function(paymentResponse) {
       // paymentResponse has: razorpay_payment_id, razorpay_order_id, razorpay_signature
       // Call verify API
       POST /api/v1/panel/payments/purchase/verify
     }
   };
   var rzp = new Razorpay(options);
   rzp.open();
4. Backend verify API: signature check → record payment → create enrollment → generate receipt
5. Frontend shows "Payment Successful! You're enrolled."
```

### 13.2 Razorpay Orders API Usage

**Create Order (server-side):**
```
POST https://api.razorpay.com/v1/orders
Authorization: Basic {base64(key_id:key_secret)}  ← TENANT's credentials
Body: { amount: 1500000, currency: "INR", receipt: "IDEMPOTENCY_KEY" }
Response: { id: "order_ABC123", amount: 1500000, status: "created" }
```

**Verify Signature (server-side):**
```
expected_signature = HMAC-SHA256(
  order_id + "|" + payment_id,
  key_secret  ← TENANT's key_secret
)
if (expected_signature == razorpay_signature) → VERIFIED
```

### 13.3 Webhook Configuration

Each tenant must configure a webhook in their Razorpay Dashboard pointing to:
```
https://{tenant-slug}.educoreos.com/api/v1/tenant/{tenant-slug}/webhooks/razorpay/student-payment
```

Events to subscribe: `payment.captured`, `payment.failed`

Webhook signature verification uses the tenant's `razorpay_webhook_secret` (different from `key_secret`).

---

## 14. Scheduled Commands

| Command | Schedule | Purpose |
|---|---|---|
| `fee:detect-overdue` | Daily 1:00 AM | Mark pending steps past due_date as `overdue` |
| `fee:send-reminders` | Daily 9:00 AM | Send T-7 (upcoming) and T+1 (overdue) notifications. Idempotent. |
| `fee:enforce-overdue-suspension` | Daily 2:00 AM | Suspend enrollments for steps overdue > `overdue_suspend_days`. Idempotent. |

---

## 15. Testing Strategy

| Category | What to Test |
|---|---|
| **Financial Safety** | Idempotency: process same webhook twice → only one transaction recorded. Double-payment prevention: two concurrent requests for same step → only one succeeds. Amount integrity: Razorpay Order amount matches expected price exactly. |
| **Razorpay Integration** | Mock Razorpay API for unit tests. Signature verification with known test vectors. Webhook handler with valid/invalid signatures. |
| **Offline Payment** | Admin records cash payment → enrollment created → receipt generated. Admin records installment step → completion check fires → enrollment on final step. |
| **Overdue Flow** | Step past due date → command marks overdue → reminder sent → after N days → enrollment suspended → payment received → enrollment reactivated. |
| **Cross-Tenant Isolation** | Webhook for Tenant A cannot affect Tenant B's data. Student in Tenant A cannot purchase a course from Tenant B. |
| **Receipt Generation** | Sequence increments atomically under concurrent receipts. PDF contains correct data. Receipt is immutable after generation. |
| **Edge Cases** | Course price changed after Razorpay Order created but before payment → amount in Order is locked (Razorpay Order is immutable). Student's enrollment expires between step payments → what happens? Free course → payment flow never initiates. |

---

## 16. Implementation Guidance

### 16.1 Suggested Sub-Phasing

- **Sub-Phase A:** `tenant_payment_configs` table + credential management API. Razorpay credential encryption/decryption. Test connection API.
- **Sub-Phase B:** `payment_transactions` table + receipt sequence. One-time purchase flow (online): initiate → Razorpay Order → verify → enroll. Receipt generation.
- **Sub-Phase C:** Installment step payment flow (online): initiate → Razorpay Order → verify → mark step paid → completion check. Sequential step enforcement.
- **Sub-Phase D:** Offline payment recording (one-time + installment). Admin capability.
- **Sub-Phase E:** Razorpay webhook handler. Idempotent processing. Failure recording.
- **Sub-Phase F:** Overdue detection, reminders, auto-suspension, reactivation. Scheduled commands.
- **Sub-Phase G:** Student fee dashboard APIs. Admin fee ledger APIs.
- **Sub-Phase H:** Frontend: Razorpay checkout integration in Student Panel. My Fees page. Admin fee ledger page. Tenant payment settings page.

### 16.2 What NOT to Do

- Do NOT call Razorpay APIs inside database transactions. Create the Razorpay Order first, then write to DB.
- Do NOT store Razorpay credentials in plaintext. Always use Laravel's `Crypt` facade.
- Do NOT expose Razorpay `key_secret` in any API response. Ever.
- Do NOT trust the payment amount from the client. The Razorpay Order (created server-side) locks the amount. Verify the Order amount matches expected price.
- Do NOT skip signature verification for any reason.
- Do NOT process a webhook if signature verification fails — log it and return 400.
- Do NOT use float/decimal for money. `_cents` integers only.
- Do NOT write audit logs inside the payment transaction DB transaction.
- Do NOT generate the receipt PDF synchronously in the payment confirmation response. Queue it as a background job.

---

## 17. Future Phases (Out of Scope)

| Feature | Notes |
|---|---|
| Discount / coupon / scholarship | Coupon codes, percentage/fixed discounts, merit scholarships applied at checkout |
| Refund processing | Razorpay Refund API, partial refunds, credit notes, refund approval workflow |
| Full tax invoice (GST/VAT) | Configurable tax rates per tenant, GSTIN on invoices, HSN codes |
| Razorpay auto-debit | Recurring payments via emandate / Razorpay Subscriptions API for installments |
| Multi-gateway support | Stripe, PayPal, or other gateways alongside Razorpay |
| Parent payment flow | Parents pay on behalf of children from Parent Panel |
| Payment reconciliation | Admin dashboard comparing Razorpay settlements vs platform records |
| Late fees | Configurable penalty charges added to overdue installments |
| Bundle purchase flow | One-time purchase of course bundles (uses same payment infrastructure) |
| Subscription purchase flow | Purchase subscription plans with usage tracking |

---

## 18. Definition of Done

This feature is complete when:

1. Implementation plan reviewed and approved by Principal Engineer.
2. Tenant can configure and verify Razorpay credentials.
3. Student can purchase a course via Razorpay checkout → payment captured → enrolled → receipt generated.
4. Student can pay an installment step → step marked paid → final step triggers enrollment.
5. Admin can record offline payment → same downstream effects as online.
6. Razorpay webhook processes payments that failed client-side verification.
7. Idempotency verified: same payment processed twice → no duplicate records.
8. Overdue detection runs → reminders sent → auto-suspension after threshold → reactivation on payment.
9. Student sees My Fees dashboard with accurate paid/due/overdue status.
10. Admin sees fee ledger with all students' payment statuses.
11. Receipt PDFs generated with correct data and sequential numbering.
12. Cross-tenant isolation verified: tenant A's payments invisible to tenant B.
13. Financial safety: no float money values, no Razorpay calls inside transactions, pessimistic locking on step payments.

---

*End of Document — UBOTZ 2.0 Student Fee Collection Developer Instructions — March 18, 2026*
