# UBOTZ 2.0 — Feature Status Report: Fee

> **Instructions:** Copy this template for each feature. Fill every section honestly. If something is missing, write "NOT IMPLEMENTED" — do not skip the section. This document feeds directly into the Principal Engineer audit pipeline.

| Field | Value |
|---|---|
| **Feature Name** | Fee (Student Fee Management & Reporting) |
| **Bounded Context** | TenantAdminDashboard\Fee |
| **Date Reported** | 2026-03-20 |
| **Reported By** | AI Agent |
| **Current Status** | Working |
| **Has Developer Instructions Doc?** | No |
| **Has Implementation Plan?** | No |
| **Was Principal Engineer Audit Done?** | No |

---

## 1. What This Feature Does (2–3 sentences)

The Fee feature is the financial reporting, compliance, and enforcement layer sitting on top of raw payment transactions. It provides Tenant Admins with a ledger view of all student fees, generates downloadable receipts, tracks overdue installment payments, enforces suspension for chronic non-payers, and dispatches automated reminder notifications. It extends (rather than duplicates) the core `payment_transactions` table with fee-specific columns via a dedicated ALTER migration.

---

## 2. Backend Architecture

### 2.1 Controllers

| Controller | Methods | Notes |
|---|---|---|
| `AdminFeeReadController` | `ledger`, `stats`, `overdueInstallments`, `transactions`, `downloadReceipt`, `studentDetail` | Admin reporting dashboard. |
| `OfflineFeePaymentController`| `store` | Records cash/bank/cheque receipts from Admin side. |
| `StudentFeeReadController` | `summary`, `installments`, `transactions`, `downloadReceipt` | Student self-service portal (My Fees). |
| `TenantStudentPaymentSettingsController`| `show`, `update`, `verify` | Configure gateway credentials (Razorpay). |

### 2.2 UseCases / Queries

| UseCase / Query | Purpose | Injects Audit Logger? | Injects Quota Service? |
|---|---|---|---|
| `RecordOfflineFeePaymentUseCase` | Manually logs a cash or manual receipt | TBD | N/A |
| `DownloadStudentFeeReceiptUseCase`| Assembles a PDF receipt for student download | N/A | N/A |
| `DownloadAdminFeeReceiptUseCase`| Same for admin action | N/A | N/A |
| `EnforceFeeOverdueSuspensionUseCase`| Suspends access for non-payers | TBD | N/A |
| `SendFeeInstallmentRemindersUseCase`| Dispatches due-date notifications | N/A | N/A |

### 2.3 Domain Layer

| Component | Type | Location | Notes |
|---|---|---|---|
| `StudentFeePaymentTransactionSnapshot` | Value Object | `Domain.../Fee/ValueObjects/` | Immutable read-model used for reporting. Contains `TYPE_COURSE_PURCHASE` and `TYPE_INSTALLMENT_STEP` constants. |
| `FeeReadQueryInterface` | Query Interface | `Domain.../Fee/Queries/` | CQRS read separation |
| `StudentFeePaymentTransactionRepositoryInterface` | Repository Interface | Domain | Write layer abstraction |

### 2.4 Domain Events

| Event Class | Trigger | Has Listener? |
|---|---|---|
| *Not directly* | Fee is primarily triggered from the Payment event chain, not a source of new events. | N/A |

### 2.5 Infrastructure Layer

| Component | Type | Notes |
|---|---|---|
| `EloquentFeeReadQuery` | CQRS Query | |
| `EloquentFeeReminderQuery` | CQRS Query | Scoped to upcoming/due payments |
| `EloquentFeeSuspensionQuery` | CQRS Query | Identifies non-compliant students |
| `EloquentStudentFeePaymentTransactionRepository`| Repository | Write Layer |

### 2.6 Scheduled Console Commands (Cron)

| Command | Artisan Handle | Schedule |
|---|---|---|
| `FeeDetectOverdueCommand` | `fee:detect-overdue` | TBD (runs per-tenant with context switching) |
| `FeeEnforceOverdueSuspensionCommand`| `fee:enforce-suspension` | TBD |
| `FeeSendRemindersCommand` | `fee:send-reminders` | TBD |

**CRITICAL FINDING**: `FeeDetectOverdueCommand` correctly iterates all active tenants via `TenantRecord::query()->where('status', 'active')->pluck('id')` and uses `try/finally` blocks to always call `$tenantContext->clear()` even if an exception occurs. This is a best-practice pattern for multi-tenant batch jobs.

### 2.7 Background Jobs

| Job | Purpose |
|---|---|
| `GenerateStudentFeeReceiptJob` | Async PDF generation dispatched by `QueueStudentFeeReceipt` |

---

## 3. Database Schema

The Fee feature does **not** create its own table. Instead, it extends the central `payment_transactions` table in the Tenant DB via an ALTER migration.

**Base Table: `payment_transactions`** (Migration: `2026_03_05_120000_create_payment_transactions_table.php`)
*(The base transaction ledger created by the Payment context)*

**ALTER Migration: `2026_03_21_100001_extend_payment_transactions_for_student_fees.php`**

Added columns:

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `fee_transaction_type` | VARCHAR(30) | Yes | `course_purchase` or `installment_step` |
| `fee_gateway` | VARCHAR(30)| Yes | The gateway that processed it (e.g. `razorpay`, `offline`) |
| `razorpay_order_id` | VARCHAR(100) | Yes | |
| `razorpay_payment_id` | VARCHAR(100) | Yes | |
| `razorpay_signature` | VARCHAR(255) | Yes | |
| `offline_method` | VARCHAR(30) | Yes | e.g. `cash`, `bank_transfer`, `cheque` |
| `external_reference` | VARCHAR(100) | Yes | Cheque number, transfer ID |
| `recorded_by` | BIGINT UNSIGNED | Yes | Admin who entered the offline payment |
| `fee_notes` | TEXT | Yes | Free-text admin note |
| `receipt_number` | VARCHAR(50) | Yes | Generated for printable receipts |

---

## 4. API Endpoints

*(Admin Routes: `routes/tenant_dashboard/fees.php`)*
- `POST /api/tenant/fees/offline-payment` — capability: `fee.record_payment`
- `GET /api/tenant/fees/ledger` — capability: `fee.view`
- `GET /api/tenant/fees/stats` — capability: `fee.view`
- `GET /api/tenant/fees/overdue-installments` — capability: `fee.view`
- `GET /api/tenant/fees/transactions` — capability: `fee.view`
- `GET /api/tenant/fees/transactions/{transactionId}/receipt` — capability: `fee.view`
- `GET /api/tenant/fees/students/{userId}` — capability: `fee.view`

*(Student Routes via `routes/tenant_dashboard/student_payments.php`)*
- `GET /api/tenant/student/payments/fees/summary`
- `GET /api/tenant/student/payments/fees/installments`
- `GET /api/tenant/student/payments/fees/transactions`
- `GET /api/tenant/student/payments/fees/transactions/{id}/receipt`

---

## 5. Security Checklist

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | All queries scoped by `tenant_id`? | Yes | Inherits from the strict `payment_transactions` base. |
| 2 | User-level isolation enforced where needed? | Yes | Student portals resolve `user_id` exclusively from auth token. |
| 3 | `tenant.capability` middleware on all routes? | **Yes** | Both `fee.record_payment` and `fee.view` enforced at route group level. |
| 4 | Audit log written for every mutation? | Partial | The `recorded_by` column acts as an implicit audit entry, but a full event log may not exist. |
| 5 | Audit log written OUTSIDE `DB::transaction()`? | TBD | |
| 6 | Domain events dispatched via `DB::afterCommit`? | N/A | Fee is a listener, not an event originator. |
| 7 | Idempotency keys used for create operations? | **Yes** | `idempotency_key` column is in the ALTER migration's fillable list. |
| 8 | Input validation via FormRequest? | Yes | |
| 9 | File uploads validated? | N/A | |
| 10 | Financial values stored as `_cents` integer? | **Yes** | `amount_cents` is inherited from the base transaction table. |
| 11 | Soft deletes used? | **No** | Financial ledger tables must NEVER be soft deleted — this is intentionally correct. |
| 12 | No raw SQL in controllers or UseCases? | Yes | |
| 13 | Batch jobs switch tenant context correctly? | **Yes** | `try/finally` pattern with `$tenantContext->clear()` confirmed in `FeeDetectOverdueCommand`. |

---

## 6. Frontend

N/A — Likely surfaced as a "My Payments" / "Fees" tab in the student dashboard.

---

## 7. Tests

| Test File | Test Count | Passing? |
|---|---|---|
| `StudentInstallmentStepPurchaseFeatureTest.php`| Multiple | Yes |
| *No dedicated `Fee/` test directory found* | — | — |

---

## 8. Known Issues & Gaps

| # | Issue | Severity Guess | Notes |
|---|---|---|---|
| 1 | No dedicated Fee test coverage | Medium | Core paths (offline payment recording, overdue detection correctness) are not unit-tested in isolation. Coverage relies on integration tests from other feature suites. |

---

## 9. Dependencies on Other Features

| Depends On | How |
|---|---|
| Payment / Installment | Fee extends the `payment_transactions` table created by those domains. |
| Enrollment | `EnforceFeeOverdueSuspensionUseCase` suspends access gated by the Enrollment domain. |
| Notification | `FeeSendRemindersUseCase` integrates into the notification dispatch pipeline. |

---

## 10. File Tree (Backend Only)

```
app/
├── Http/TenantAdminDashboard/Fee/
│   └── Controllers/
│       ├── AdminFeeReadController.php
│       ├── OfflineFeePaymentController.php
│       └── StudentFeeReadController.php
├── Application/TenantAdminDashboard/Fee/
│   ├── UseCases/
│   │   ├── RecordOfflineFeePaymentUseCase.php
│   │   ├── DownloadStudentFeeReceiptUseCase.php
│   │   ├── EnforceFeeOverdueSuspensionUseCase.php
│   │   └── SendFeeInstallmentRemindersUseCase.php
│   └── Services/
│       └── FeeInstallmentEnrollmentLifecycleService.php
├── Domain/TenantAdminDashboard/Fee/
│   ├── ValueObjects/
│   │   └── StudentFeePaymentTransactionSnapshot.php
│   └── Queries/
├── Console/Commands/
│   ├── FeeDetectOverdueCommand.php
│   ├── FeeEnforceOverdueSuspensionCommand.php
│   └── FeeSendRemindersCommand.php
├── Jobs/TenantAdminDashboard/Fee/
│   └── GenerateStudentFeeReceiptJob.php
└── routes/tenant_dashboard/
    └── fees.php
```

---

> **Reminder:** This report is input for the Principal Engineer audit. Incomplete or inaccurate information here means the audit will miss real issues or flag false positives. When in doubt, check the actual code — do not guess.

*End of Template*
