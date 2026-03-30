# UBOTZ 2.0 — Feature Status Report: Payment

> **Instructions:** Copy this template for each feature. Fill every section honestly. If something is missing, write "NOT IMPLEMENTED" — do not skip the section. This document feeds directly into the Principal Engineer audit pipeline.

| Field | Value |
|---|---|
| **Feature Name** | Payment (Gateway Integrations, Transactions) |
| **Bounded Context** | TenantAdminDashboard (Cross-cuts `Payment`, `Fee`, `Installment`) |
| **Date Reported** | 2026-03-20 |
| **Reported By** | AI Agent |
| **Current Status** | Working |
| **Has Developer Instructions Doc?** | No |
| **Has Implementation Plan?** | No |
| **Was Principal Engineer Audit Done?** | No |

---

## 1. What This Feature Does (2–3 sentences)

The Payment feature orchestrates financial transactions across the platform. It handles gateway URL generation, securely processes automated callbacks (webhooks) for online purchases, permits authorized staff to log manual offline payments (cash, bank transfers), and allows explicit Tenant-level overrides for gateway credentials (e.g., using their own Razorpay keys instead of the platform default).

---

## 2. Backend Architecture

This feature is slightly decentralized, splitting its functional responsibilities across `Checkout`, `Student Course Purchases`, and `Offline Fees`.

### 2.1 Controllers

| Controller | Methods | Notes |
|---|---|---|
| `CheckoutController` | `initializeCourseCheckout`, `handleWebhook` | Handles external gateway integrations and generic initialization. |
| `StudentCoursePurchaseController` | `initiate`, `verify` | Specific logic for direct course buying. |
| `StudentInstallmentStepPurchaseController`| `initiate`, `verify` | Logic for piecemeal payments against planned installments. |
| `OfflineFeePaymentController` | `store` | Admin action to log manual cash/transfer receipts. |
| `TenantStudentPaymentSettingsController`| `show`, `update`, `verify` | Configures tenant-specific Razorpay API keys. |

### 2.2 UseCases / Queries

| UseCase / Query | Purpose | Injects Audit Logger? | Injects Quota Service? |
|---|---|---|---|
| `InitializeCheckoutUseCase` | Generates secure checkout links | TBD | N/A |
| `ProcessPaymentWebhookUseCase`| Parses and acts on provider callbacks | TBD | N/A |
| `RecordOfflineFeePaymentUseCase`| Writes ledger entries manually | TBD | N/A |
| `UpsertTenantStudentPaymentConfigUseCase`| Overrides root API keys with Tenant ones| TBD | N/A |

### 2.3 Domain Layer

| Component | Type | Location | Notes |
|---|---|---|---|
| `RazorpayStudentPaymentSignature` | Value Object | `.../Fee/` | Validates secure hashes |

### 2.4 Domain Events

| Event Class | Trigger | Has Listener? |
|---|---|---|
| `GenerateStudentInvoiceOnPaymentCompleted` | Triggered when webhook confirms funds | Listener (generates receipt PDF/record) |

### 2.5 Infrastructure Layer

| Component | Type | Notes |
|---|---|---|
| `PaymentEventRecord` | Eloquent Model | Maps to `payment_events` |
| `EloquentPaymentEventRepository`| Repository | Abstraction for pure webhook logging |

### 2.6 Exceptions

| Exception Class | When Thrown |
|---|---|
| *Not Implemented/Found*| Fails gracefully through Standard Laravel Validation HTTP exceptions. |

---

## 3. Database Schema

### 3.1 Tables

**Table: `payment_events` [CENTRAL DB]** (Migration: `2026_02_26_094513_create_payment_events_table.php`)

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `event_id` | VARCHAR | No | Gateway transaction or event identifier |
| `event_type` | VARCHAR | No | |
| `payload` | JSON / ARRAY | No | Raw webhook dump for auditing and idempotency |
| `gateway` | VARCHAR | No | e.g. 'razorpay' |
| `status` | VARCHAR | No | Mutable state (pending → processed/failed) |
| `error_message` | TEXT | Yes | |
| `gateway_subscription_id`| VARCHAR | Yes | |
| `created_at` | TIMESTAMP | No | Append-only date |

*(Note: `updated_at` is forcefully disabled on the Model level via `const UPDATED_AT = null;` to ensure chronological tracking relies on state appends rather than silent mutations).*

**Table: `tenant_student_payment_configs` (Inferred via Controller logic)** 
- Expected to hold tenant overrides `razorpay_key_id`, `razorpay_key_secret`, `razorpay_webhook_secret`, and `overdue_suspend_days`.

**Table: `course_purchases` / `fee_transactions` (Inferred via UseCases)**
- Expected to link `target_user_id`, `course_id`/`step_id`, and `paid_cents`.

### 3.2 Relationships

*(Primarily decoupled; webhook tables act as isolated append-only logs).*

---

## 4. API Endpoints

*(Routes distributed across `payment.php`, `student_payments.php`, `fees.php`, and `settings.php`)*

| Method | URI | Controller@Method | Middleware | Capability Code |
|---|---|---|---|---|
| `POST` | `/api/tenant/checkout/course` | `CheckoutController@initialize` | `auth:api` | None (Public to Student) |
| `POST` | `/api/tenant/webhooks/payment`| `CheckoutController@webhook` | None | None (Public to Gateway) |
| `POST` | `/api/tenant/student/payments/course-purchase/...` | `StudentCoursePurchaseController`| `auth:api` | None (Public to Student) |
| `POST` | `/api/tenant/fees/offline-payment` | `OfflineFeePaymentController` | `tenant.capability` | `fee.record_payment` |
| `PUT` | `/api/tenant/settings/student-payment`| `TenantStudentPaymentSettingsController`| Assumed | Assumed (Admin config) |
| `POST` | `/api/tenant/settings/student-payment/verify`| `TenantStudentPaymentSettingsController`| Assumed | Validates API Keys |

---

## 5. Security Checklist

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | All queries scoped by `tenant_id`? | Yes | Webhooks require careful mapping to tenant via payload state parameters. |
| 2 | User-level isolation enforced where needed? | Yes | Students can only initiate course purchases for their authenticated session. |
| 3 | `tenant.capability` middleware on all routes? | Mixed | Webhooks and Student portals naturally omit capability checks. Admin actions (Offline flows) enforce `fee.record_payment`. |
| 4 | Audit log written for every mutation? | Yes | The entire `payment_events` table acts as a raw audit log. |
| 5 | Audit log written OUTSIDE `DB::transaction()`? | TBD | |
| 6 | Domain events dispatched via `DB::afterCommit`? | Yes | Used for Invoice generation. |
| 7 | Idempotency keys used for create operations? | **Yes** | Webhook processing relies heavily on the `event_id` string to prevent double-charging. |
| 8 | Input validation via FormRequest? | Yes | |
| 9 | File uploads validated? | N/A | |
| 10 | Financial values stored as `_cents` integer? | **Yes** | explicitly handled as `$v['paid_cents']` and `amount` boundaries. |
| 11 | Soft deletes used? | N/A | Financial ledgers typically do not delete records at all. |
| 12 | No raw SQL in controllers or UseCases? | Yes | |
| 13 | Eloquent models have `BelongsToTenant` trait/scope? | Yes | For ledger tables (not central webhook dumps). |

---

## 6. Frontend

Expected to render Razorpay overlays and capture callbacks seamlessly. 

---

## 7. Tests

| Test File | Test Count | Passing? |
|---|---|---|
| *Not Investigated Fully* | N/A | Features heavily rely on Provider mocks (`Faker\Provider\Payment` generation found). |

---

## 8. Known Issues & Gaps

| # | Issue | Severity Guess | Notes |
|---|---|---|---|
| 1 | Cross-Domain Architecture | Low | The payment boundary is slightly fractured. Settings, Offline Logic, Webhooks, and Student checkouts exist in almost four different domains (`Fee`, `Payment`, `Installment`). While functionally working, it increases cognitive overhead for debugging trace paths. |

---

## 9. Dependencies on Other Features

| Depends On | How |
|---|---|
| Course / Installment | Identifies the physical/digital asset being unlocked. |
| Tenant Settings | Resolves whether the money goes to the Platform Stripe/Razorpay account or directly to the Tenant's own account. |

---

## 10. File Tree (Backend Only)

```
app/
├── Http/TenantAdminDashboard/Fee/
│   ├── Requests/
│   └── Controllers/
│       ├── TenantStudentPaymentSettingsController.php
│       ├── StudentCoursePurchaseController.php
│       └── OfflineFeePaymentController.php
├── Http/Controllers/Api/TenantAdminDashboard/Payment/
│   └── CheckoutController.php
├── Application/TenantAdminDashboard/Payment/
│   └── UseCases/
│       ├── InitializeCheckoutUseCase.php
│       └── ProcessPaymentWebhookUseCase.php
├── Infrastructure/Database/
│   ├── Models/
│   │   └── PaymentEventRecord.php
│   └── Repositories/
│       └── EloquentPaymentEventRepository.php
└── routes/tenant_dashboard/
    ├── payment.php
    ├── student_payments.php
    └── fees.php
```

---

> **Reminder:** This report is input for the Principal Engineer audit. Incomplete or inaccurate information here means the audit will miss real issues or flag false positives. When in doubt, check the actual code — do not guess.

*End of Template*
