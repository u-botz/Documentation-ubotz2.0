# UBOTZ 2.0 / EducoreOS — Phase 20A Developer Instructions

## Fee Receivables Enhancement & Payment Integrity

| Field | Value |
|---|---|
| **Document Type** | Developer Instruction (Pre-Implementation Brief) |
| **Phase** | 20A |
| **Date** | March 26, 2026 |
| **Issued By** | Principal Engineer / Architecture Auditor |
| **Audience** | Implementation Developer (Antigravity) |
| **Expected Deliverable** | Phase 20A Implementation Plan (same format as 10A–15C plans) |
| **Prerequisites** | Phase 12A-12C COMPLETE (Payment infrastructure, invoicing), Phase 14 COMPLETE (Notification infrastructure), Phase 15A COMPLETE (Branch bounded context, `user_branch_assignments` table), Fee module WORKING (installment plans, orders, overdue detection, suspension) |
| **Business Findings** | Phase 20 Business Findings (March 26, 2026) — APPROVED |

> **This phase strengthens the financial backbone of every tenant. Partial payments, late fees, payment approval, and branch-level visibility are not features — they are operational necessities for any institution managing real student fees. Every shortcut here becomes a financial dispute the platform cannot resolve. Treat every number as real money.**

---

## 1. Mission Statement

Phase 20A enhances the existing Fee Management system with six capabilities that institution owners need to run their daily financial operations:

1. **Partial payment support** — students can pay any amount against an installment step, with remainder tracking
2. **Offline payment approval workflow** — manual payment recordings require verification before crediting the student
3. **Late fee auto-calculation** — configurable delay charges applied to overdue installments
4. **Aging buckets** — graduated overdue tracking (0-15, 16-30, 31-60, 60+ days)
5. **Branch-level financial filtering** — denormalized `branch_id` on financial records, branch-filtered reports
6. **FinancialHealth dashboard widget** — live data replacing the current hardcoded mockup

**What this phase includes:**
- Schema changes: `paid_amount_cents` + `partially_paid` status on `installment_order_payments`, `branch_id` denormalization on `installment_orders` + `payment_transactions`, new `late_fee_charges` table
- Modified `RecordOfflineFeePaymentUseCase` for approval workflow (`pending_verification` status)
- New `ApproveOfflinePaymentUseCase` and `RejectOfflinePaymentUseCase`
- Late fee entity, auto-calculation via extended `FeeDetectOverdueCommand`
- Late fee waiver capability with audit trail
- Aging bucket query service with fixed platform-defined boundaries
- Default installment plan assignment on courses/batches
- Consolidated student fee ledger API endpoint
- Overdue email notifications via Phase 14 infrastructure
- Branch-filtered fee reports (collections, outstanding, ledger, transactions)
- FinancialHealth dashboard widget backend API
- Tenant Admin frontend: student fee ledger screen, payment approval queue, aging report, enhanced dashboard widget

**What this phase does NOT include:**
- Expense tracking or branch P&L (future phase — new bounded context)
- Scholarship/concession approval workflows (Phase 20B)
- Credit notes or post-order fee adjustments (Phase 20B)
- Student-facing fee portal (depends on Student Dashboard)
- Reconciliation data export (Phase 20B)
- GST/tax calculation on tenant-level fee invoices (future)
- SMS notifications (future channel — Phase 14 infrastructure supports it)
- Configurable aging bucket boundaries (fixed: 0-15, 16-30, 31-60, 60+)
- Per-tenant "trusted mode" for offline payments (all tenants use approval workflow)

---

## 2. Business Context & Resolved Decisions

### 2.1 Why This Phase Exists

The current fee system can collect money and detect overdue payments, but it cannot:
- Accept a payment that doesn't exactly match the installment step amount
- Protect against a staff member recording a phantom cash payment
- Tell the institution owner how much revenue each branch generated
- Show graduated urgency for overdue accounts (5 days late vs. 90 days late)
- Automatically charge a penalty for late payment
- Give the front desk a single screen to answer "what does this student owe?"

Every one of these gaps creates daily operational friction for the institution owner.

### 2.2 Resolved Decisions (Binding)

These were decided by the Product Owner in the Phase 20 Business Findings and are **non-negotiable** in the implementation:

| Decision | Resolution | Implementation Impact |
|---|---|---|
| Partial payment suspension behavior | Partial payment does NOT prevent suspension. Only `status = 'paid'` clears suspension. | `FeeInstallmentEnrollmentLifecycleService` needs NO modification for partial payments. `partially_paid` is treated as unpaid for suspension purposes. |
| Late fee calculation model | Both flat and percentage, configurable per installment plan | Two new columns on `installment_plans`: `late_fee_type` (enum: `none`, `flat`, `percentage`) and `late_fee_value_cents` / `late_fee_percentage`. |
| Offline payment approval | Approval-required for ALL tenants. No configurable toggle. | `RecordOfflineFeePaymentUseCase` always creates payment as `pending_verification`. Single code path. |
| Aging buckets | Fixed platform-defined: 0-15, 16-30, 31-60, 60+ days | Domain constants in a Value Object or enum. No database configuration. |

---

## 3. Architecture Overview

### 3.1 Bounded Context Impact

Phase 20A extends **existing** bounded contexts. No new bounded context is required.

| Bounded Context | What Changes |
|---|---|
| **Installment** | `paid_amount_cents` on `installment_order_payments`, `partially_paid` status, late fee configuration on plans, default plan linking to courses/batches |
| **Payment** | `pending_verification` / `rejected` statuses on `payment_transactions`, `verified_by` / `verified_at` / `rejection_reason` columns, approval/rejection UseCases |
| **Fee** | Aging bucket query service, consolidated student ledger API, branch-filtered reports, FinancialHealth widget API, late fee auto-calculation in overdue cron, email notification expansion |

### 3.2 Bounded Context Map (Post-Phase 20A)

```
┌───────────────────────┐     ┌───────────────────────┐     ┌──────────────────┐
│     Installment       │     │       Payment         │     │     Pricing      │
│                       │     │                       │     │                  │
│ • Plan templates      │     │ • Transactions        │     │ • Price calc     │
│ • Orders + branch_id  │     │ • Razorpay GW         │     │ • Coupons/offers │
│ • Steps/schedule      │     │ • Offline record       │     │ • Discount apply │
│ • Partial payments    │     │ • ⭐ Approval workflow │     │                  │
│ • Fulfillment         │     │ • Receipt gen         │     │                  │
│ • ⭐ Late fee config  │     │ • branch_id           │     │                  │
│ • ⭐ Default plan     │     │                       │     │                  │
│   on course/batch     │     │                       │     │                  │
└───────────┬───────────┘     └───────────┬───────────┘     └──────────────────┘
            │                             │
            └─────────────┬───────────────┘
                          │
                 ┌────────▼──────────┐
                 │       Fee         │
                 │  (Orchestrator)   │
                 │                   │
                 │ • Ledger queries  │
                 │ • Overdue detect  │
                 │ • ⭐ Late fee calc│
                 │ • Suspension      │
                 │ • Reminders       │
                 │ • ⭐ Email notify │
                 │ • ⭐ Aging buckets│
                 │ • ⭐ Branch filter│
                 │ • ⭐ Dashboard API│
                 │ • Reporting       │
                 └──────────────────┘
```

---

## 4. Schema Changes

### 4.1 Migration 1: Add `branch_id` to `installment_orders`

```sql
ALTER TABLE installment_orders
  ADD COLUMN branch_id BIGINT UNSIGNED NULL AFTER tenant_id,
  ADD INDEX idx_installment_orders_branch (branch_id),
  ADD CONSTRAINT fk_installment_orders_branch
    FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL;
```

**Nullable:** Students may not have a branch assignment (tenant may not use branches).

**Set at order creation:** Resolved from `user_branch_assignments` at the time the `InstallmentOrderEntity` is created. This captures the branch that generated the revenue — not the student's current branch.

### 4.2 Migration 2: Add `branch_id` to `payment_transactions`

```sql
ALTER TABLE payment_transactions
  ADD COLUMN branch_id BIGINT UNSIGNED NULL AFTER tenant_id,
  ADD INDEX idx_payment_transactions_branch (branch_id),
  ADD CONSTRAINT fk_payment_transactions_branch
    FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL;
```

Same rationale as above — captured at transaction time.

### 4.3 Migration 3: Backfill `branch_id` on Existing Records

**One-time data migration.** Must run after migrations 4.1 and 4.2.

```sql
-- Backfill installment_orders
UPDATE installment_orders io
  INNER JOIN user_branch_assignments uba ON io.user_id = uba.user_id
  SET io.branch_id = uba.branch_id
  WHERE io.branch_id IS NULL;

-- Backfill payment_transactions
UPDATE payment_transactions pt
  INNER JOIN user_branch_assignments uba ON pt.user_id = uba.user_id
  SET pt.branch_id = uba.branch_id
  WHERE pt.branch_id IS NULL;
```

**Known limitation:** If a student has been reassigned to a different branch since the original transaction, the backfill assigns the *current* branch. This is best-effort for historical data. Going forward, branch is captured at event time.

**Risk:** Students with no branch assignment will remain `NULL`. Reports must handle this with an "Unassigned" bucket.

### 4.4 Migration 4: Add Partial Payment Support to `installment_order_payments`

```sql
ALTER TABLE installment_order_payments
  ADD COLUMN paid_amount_cents BIGINT UNSIGNED NOT NULL DEFAULT 0 AFTER amount_cents;
```

**Status field extension:** The existing `status` column (VARCHAR) gains a new valid value: `partially_paid`.

Valid statuses after this migration: `pending`, `partially_paid`, `overdue`, `paid`.

**Backfill:** All existing records with `status = 'paid'` should have `paid_amount_cents` set to `amount_cents`:

```sql
UPDATE installment_order_payments
  SET paid_amount_cents = amount_cents
  WHERE status = 'paid';
```

### 4.5 Migration 5: Add Approval Fields to `payment_transactions`

```sql
ALTER TABLE payment_transactions
  ADD COLUMN verified_by BIGINT UNSIGNED NULL AFTER recorded_by,
  ADD COLUMN verified_at TIMESTAMP NULL AFTER verified_by,
  ADD COLUMN rejection_reason TEXT NULL AFTER verified_at;
```

**Status field extension:** The existing `status` column gains two new valid values: `pending_verification`, `rejected`.

Valid statuses after this migration: (existing values) + `pending_verification`, `rejected`.

### 4.6 Migration 6: Create `late_fee_charges` Table

```sql
CREATE TABLE late_fee_charges (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  installment_order_payment_id BIGINT UNSIGNED NOT NULL,
  amount_cents BIGINT UNSIGNED NOT NULL,
  calculation_type VARCHAR(20) NOT NULL,  -- 'flat' or 'percentage'
  calculation_base_cents BIGINT UNSIGNED NULL,  -- original step amount (for percentage audit trail)
  charged_on DATE NOT NULL,
  is_waived BOOLEAN NOT NULL DEFAULT FALSE,
  waived_by BIGINT UNSIGNED NULL,
  waived_at TIMESTAMP NULL,
  waiver_reason TEXT NULL,
  created_at TIMESTAMP NULL,
  updated_at TIMESTAMP NULL,

  INDEX idx_late_fee_charges_tenant (tenant_id),
  INDEX idx_late_fee_charges_payment (installment_order_payment_id),
  CONSTRAINT fk_late_fee_charges_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_late_fee_charges_payment FOREIGN KEY (installment_order_payment_id) REFERENCES installment_order_payments(id) ON DELETE CASCADE,
  CONSTRAINT fk_late_fee_charges_waived_by FOREIGN KEY (waived_by) REFERENCES users(id) ON DELETE SET NULL
);
```

**Critical:** This table has `tenant_id` and MUST use `BelongsToTenant` global scope.

**One late fee charge per overdue step per calculation cycle.** The `charged_on` + `installment_order_payment_id` combination should be unique to prevent double-charging:

```sql
UNIQUE INDEX unq_late_fee_per_step_per_day (installment_order_payment_id, charged_on)
```

### 4.7 Migration 7: Add Late Fee Configuration to `installment_plans`

```sql
ALTER TABLE installment_plans
  ADD COLUMN late_fee_type VARCHAR(20) NOT NULL DEFAULT 'none' AFTER is_active,
  ADD COLUMN late_fee_flat_cents BIGINT UNSIGNED NULL AFTER late_fee_type,
  ADD COLUMN late_fee_percentage DECIMAL(5,2) NULL AFTER late_fee_flat_cents;
```

**`late_fee_type` valid values:** `none`, `flat`, `percentage`.

- When `none`: no late fee is charged (default for existing plans)
- When `flat`: `late_fee_flat_cents` is the charge amount
- When `percentage`: `late_fee_percentage` is applied to the step's `amount_cents`

**Invariant:** If `late_fee_type = 'flat'`, then `late_fee_flat_cents` must be > 0. If `late_fee_type = 'percentage'`, then `late_fee_percentage` must be > 0 and ≤ 100. Enforce in domain entity, not just at validation layer.

### 4.8 Migration 8: Add Default Plan to Courses (Optional Linking)

```sql
ALTER TABLE courses
  ADD COLUMN default_installment_plan_id BIGINT UNSIGNED NULL,
  ADD CONSTRAINT fk_courses_default_plan
    FOREIGN KEY (default_installment_plan_id) REFERENCES installment_plans(id) ON DELETE SET NULL;
```

**Purpose:** When a student enrolls in a course that has a default plan, the system can pre-select that plan during installment order creation. This is a convenience — not enforcement. The plan can be overridden at enrollment time.

**Note:** If batches also need default plans, add the same column to the `batches` table (if it exists). Verify with the actual codebase whether a `batches` table exists and is in use.

---

## 5. Domain Layer — New & Modified Components

### 5.1 Installment Bounded Context

#### New Value Object: `InstallmentPaymentStatus`

**Location:** `Domain/TenantAdminDashboard/Installment/ValueObjects/InstallmentPaymentStatus.php`

Enum with values: `PENDING`, `PARTIALLY_PAID`, `OVERDUE`, `PAID`.

**Transition rules:**

| From | To | Condition |
|---|---|---|
| `PENDING` | `PARTIALLY_PAID` | Payment recorded where `paid_amount_cents < amount_cents` |
| `PENDING` | `PAID` | Payment recorded where `paid_amount_cents >= amount_cents` |
| `PENDING` | `OVERDUE` | `FeeDetectOverdueCommand` runs and `due_date < now()` |
| `PARTIALLY_PAID` | `PAID` | Additional payment brings `paid_amount_cents >= amount_cents` |
| `PARTIALLY_PAID` | `OVERDUE` | `FeeDetectOverdueCommand` runs and `due_date < now()` AND `paid_amount_cents < amount_cents` |
| `OVERDUE` | `PARTIALLY_PAID` | Payment recorded but `paid_amount_cents < amount_cents` (remains overdue for suspension but tracks partial) |
| `OVERDUE` | `PAID` | Payment recorded where `paid_amount_cents >= amount_cents` |

**Critical decision:** `OVERDUE` + partial payment → remains `OVERDUE` but with updated `paid_amount_cents`. The student is still overdue (suspension applies) until the full step is paid. The `partially_paid` status is only used when the step is NOT yet past due date.

**Correction:** Actually, to keep this simple and aligned with the product owner's decision (partial payment does NOT prevent suspension), we should handle it as:

- Before due date: `PENDING` or `PARTIALLY_PAID` (partial payment recorded, not yet overdue)
- After due date with any unpaid remainder: `OVERDUE` (regardless of partial payment)
- Full payment at any time: `PAID`

So `OVERDUE` takes precedence over `PARTIALLY_PAID` when past due date. The `paid_amount_cents` field tracks how much has been paid regardless of status.

#### New Value Object: `LateFeeType`

**Location:** `Domain/TenantAdminDashboard/Installment/ValueObjects/LateFeeType.php`

Enum: `NONE`, `FLAT`, `PERCENTAGE`.

Factory method: `fromString(string $value): self` with validation.

#### Modified Entity: `InstallmentOrderPaymentEntity`

Add `paid_amount_cents` property (integer). Add methods:

- `recordPayment(int $amountCents): void` — adds to `paid_amount_cents`, validates `paid_amount_cents <= amount_cents`, transitions status
- `getRemainingAmountCents(): int` — returns `amount_cents - paid_amount_cents`
- `isFullyPaid(): bool` — returns `paid_amount_cents >= amount_cents`

**Domain invariant:** `paid_amount_cents` must NEVER exceed `amount_cents`. Enforce in `recordPayment()` with a `DomainException`.

#### New Entity: `LateFeeChargeEntity`

**Location:** `Domain/TenantAdminDashboard/Fee/Entities/LateFeeChargeEntity.php`

Properties: `id`, `tenantId`, `installmentOrderPaymentId`, `amountCents`, `calculationType`, `calculationBaseCents`, `chargedOn`, `isWaived`, `waivedBy`, `waivedAt`, `waiverReason`.

Methods:
- `waive(int $waivedBy, \DateTimeImmutable $at, string $reason): void` — sets waiver fields, records domain event
- `isWaived(): bool`

**Domain events:**
- `LateFeeCharged` — dispatched when a new late fee is created
- `LateFeeWaived` — dispatched when a late fee is waived

#### New Repository Interface: `LateFeeChargeRepositoryInterface`

**Location:** `Domain/TenantAdminDashboard/Fee/Repositories/LateFeeChargeRepositoryInterface.php`

Methods:
- `save(LateFeeChargeEntity $charge): void`
- `findByPaymentId(int $installmentOrderPaymentId): array`
- `findUnwaivedByPaymentId(int $installmentOrderPaymentId): array`
- `existsForPaymentOnDate(int $installmentOrderPaymentId, string $date): bool` — idempotency check for daily cron

### 5.2 Payment Bounded Context

#### New Value Object: `OfflinePaymentVerificationStatus`

**Location:** `Domain/TenantAdminDashboard/Payment/ValueObjects/OfflinePaymentVerificationStatus.php`

Enum: `PENDING_VERIFICATION`, `VERIFIED`, `REJECTED`.

This is separate from the payment transaction's general `status` field. The verification status applies only to offline payments.

#### New Domain Events

- `OfflinePaymentRecorded` — dispatched when staff records an offline payment (status: `pending_verification`)
- `OfflinePaymentApproved` — dispatched when a verifier approves the payment
- `OfflinePaymentRejected` — dispatched when a verifier rejects the payment

### 5.3 Fee Bounded Context

#### New Value Object: `AgingBucket`

**Location:** `Domain/TenantAdminDashboard/Fee/ValueObjects/AgingBucket.php`

Enum with fixed boundaries:

```php
enum AgingBucket: string
{
    case NOT_OVERDUE = 'not_overdue';          // Not past due date
    case BUCKET_0_15 = '0_15_days';            // 1-15 days overdue
    case BUCKET_16_30 = '16_30_days';          // 16-30 days overdue
    case BUCKET_31_60 = '31_60_days';          // 31-60 days overdue
    case BUCKET_60_PLUS = '60_plus_days';      // 61+ days overdue

    public static function fromDaysOverdue(int $days): self
    {
        return match(true) {
            $days <= 0 => self::NOT_OVERDUE,
            $days <= 15 => self::BUCKET_0_15,
            $days <= 30 => self::BUCKET_16_30,
            $days <= 60 => self::BUCKET_31_60,
            default => self::BUCKET_60_PLUS,
        };
    }
}
```

These boundaries are **platform constants**. They are NOT configurable per tenant.

---

## 6. Application Layer — New & Modified Components

### 6.1 Modified: `RecordOfflineFeePaymentUseCase`

**Current behavior:** Records payment → immediately marks installment step as `paid` → triggers enrollment.

**New behavior:** Records payment → creates `payment_transactions` record with `status = 'pending_verification'` → does NOT mark installment step as `paid` → does NOT trigger enrollment. The payment sits in a verification queue until approved.

**Branch ID:** Resolve the student's branch from `user_branch_assignments` and set `branch_id` on the `payment_transactions` record at creation time.

### 6.2 New: `ApproveOfflinePaymentUseCase`

**Location:** `Application/TenantAdminDashboard/Payment/UseCases/ApproveOfflinePaymentUseCase.php`

Input: `paymentTransactionId`, `verifierId` (the staff member approving)

Flow:
1. Load payment transaction — verify `status = 'pending_verification'`
2. Verify the approver is NOT the same person who recorded the payment (four-eyes principle)
3. Lock the `installment_order_payment` record (pessimistic locking — `SELECT FOR UPDATE`)
4. Apply payment amount to the installment step's `paid_amount_cents`
5. Transition installment step status based on whether `paid_amount_cents >= amount_cents`
6. Update `payment_transactions`: set `status = 'paid'`, `verified_by`, `verified_at`
7. Update installment order `fulfillment_status` if all steps are now paid
8. Trigger enrollment activation if applicable (delegate to existing `FeeInstallmentEnrollmentLifecycleService`)
9. Dispatch `OfflinePaymentApproved` domain event (outside transaction)
10. Audit log (outside transaction via `DB::afterCommit()`)

**Critical:** Steps 3-8 must be inside a single database transaction. Domain event dispatch and audit logging must be OUTSIDE the transaction.

**Four-eyes rule:** `verifierId !== payment.recorded_by`. If violated, throw `SelfApprovalProhibitedException`.

### 6.3 New: `RejectOfflinePaymentUseCase`

**Location:** `Application/TenantAdminDashboard/Payment/UseCases/RejectOfflinePaymentUseCase.php`

Input: `paymentTransactionId`, `verifierId`, `rejectionReason`

Flow:
1. Load payment transaction — verify `status = 'pending_verification'`
2. Update: `status = 'rejected'`, `verified_by`, `verified_at`, `rejection_reason`
3. Dispatch `OfflinePaymentRejected` domain event
4. Audit log

**Note:** A rejected payment does NOT affect the student's installment obligations at all. The installment step remains in its current state.

### 6.4 New: `CalculateLateFeeUseCase`

**Location:** `Application/TenantAdminDashboard/Fee/UseCases/CalculateLateFeeUseCase.php`

Called by the extended `FeeDetectOverdueCommand` for each overdue installment step.

Input: `installmentOrderPaymentId`, `calculationDate` (injected, not `now()`)

Flow:
1. Load the installment order payment and its parent order's plan
2. Check plan's `late_fee_type` — if `none`, return (no charge)
3. Check idempotency: has a late fee already been charged for this step on this date? If yes, return.
4. Calculate amount:
   - If `flat`: charge = `plan.late_fee_flat_cents`
   - If `percentage`: charge = `floor(step.amount_cents * plan.late_fee_percentage / 100)`
5. Create `LateFeeChargeEntity` with calculated amount
6. Save via repository
7. Dispatch `LateFeeCharged` domain event

**Idempotency:** The unique constraint on `(installment_order_payment_id, charged_on)` prevents double-charging even if the cron runs twice. The UseCase should also check before inserting.

**Late fees are charged once per overdue step** (on the day it becomes overdue, or on the first run of the cron after it becomes overdue). They are NOT recurring (e.g., not "₹100 per week"). Recurring late fees are explicitly deferred.

### 6.5 New: `WaiveLateFeeUseCase`

**Location:** `Application/TenantAdminDashboard/Fee/UseCases/WaiveLateFeeUseCase.php`

Input: `lateFeeChargeId`, `waivedBy`, `reason`

Flow:
1. Load late fee charge — verify `is_waived = false`
2. Call `entity.waive(waivedBy, now, reason)`
3. Save
4. Dispatch `LateFeeWaived` domain event
5. Audit log

### 6.6 New: `GetStudentFeeLedgerQuery`

**Location:** `Application/TenantAdminDashboard/Fee/Queries/GetStudentFeeLedgerQuery.php`

Returns a consolidated view of a student's entire financial position across all active installment orders:

```php
public function execute(int $tenantId, int $studentId): StudentFeeLedgerDTO
{
    // For each active installment order:
    //   - Order details (plan name, course name, total amount, created date)
    //   - Each installment step: amount, paid_amount, remaining, status, due_date, aging bucket
    //   - Late fees: amount, waived status
    // Summary:
    //   - Total owed (sum of all step amounts + unwaived late fees)
    //   - Total paid (sum of all paid_amount_cents)
    //   - Total outstanding (total_owed - total_paid)
    //   - Total overdue (subset of outstanding that is past due)
    //   - Total late fees (charged, waived, net)
}
```

This is the **single endpoint** the front desk opens 50 times a day.

### 6.7 New: `GetAgingReportQuery`

**Location:** `Application/TenantAdminDashboard/Fee/Queries/GetAgingReportQuery.php`

Returns overdue installment steps grouped by aging bucket, with optional branch filter:

```php
public function execute(int $tenantId, ?int $branchId = null): AgingReportDTO
{
    // Returns:
    // - bucket_0_15: { count, total_amount_cents, students[] }
    // - bucket_16_30: { count, total_amount_cents, students[] }
    // - bucket_31_60: { count, total_amount_cents, students[] }
    // - bucket_60_plus: { count, total_amount_cents, students[] }
    // Each student entry: { user_id, name, course, amount_overdue, days_overdue }
}
```

### 6.8 New: `GetFinancialHealthQuery`

**Location:** `Application/TenantAdminDashboard/Fee/Queries/GetFinancialHealthQuery.php`

Returns the data needed by the FinancialHealth dashboard widget:

```php
public function execute(int $tenantId, ?int $branchId = null): FinancialHealthDTO
{
    // Returns:
    // - total_collections_this_month_cents
    // - total_collections_last_month_cents
    // - total_outstanding_cents
    // - total_overdue_cents
    // - overdue_student_count
    // - pending_verification_count (offline payments awaiting approval)
    // - aging_summary: { bucket → count + amount }
    // - collections_trend: [ { month, amount_cents } ] for last 6 months
}
```

**Performance concern:** This query aggregates across potentially thousands of records. For tenants with large student bodies, this should use indexed queries with `SUM()` and `COUNT()` — not Eloquent collection iteration. Consider a daily pre-computed cache via a scheduled job if performance is inadequate at launch.

### 6.9 Modified: `FeeDetectOverdueCommand`

**Current behavior:** Finds `pending` installments past due date → marks as `OVERDUE`.

**Extended behavior:**
1. (Existing) Find `pending` installments past due date → mark as `OVERDUE`
2. (New) Find `partially_paid` installments past due date → mark as `OVERDUE` (the partial payment does not prevent overdue status)
3. (New) For each newly overdue step, call `CalculateLateFeeUseCase` to apply late fee if the plan has late fees configured
4. (New) For each newly overdue step, dispatch notification via Phase 14's `NotificationDispatcher` on the email channel (in addition to existing in-app)

### 6.10 Modified: `FeeSendRemindersCommand`

**Current behavior:** Sends in-app notifications at T-7 (upcoming) and T+1 (overdue).

**Extended behavior:**
- Add email channel delivery via Phase 14's `NotificationDispatcher`
- The email template should include: student name, course name, installment step details, amount due, due date, and a "Pay Now" link (if online payment is supported)
- Use Phase 14's `EmailChannel` with the existing Ubotz-branded Blade layout

### 6.11 Modified: Existing Fee Report Queries

All existing fee report queries (`EloquentFeeReadQuery` and any report-specific queries) must be extended with an optional `?int $branchId = null` parameter. When provided, filter results by the denormalized `branch_id` on `installment_orders` and/or `payment_transactions`.

Affected queries:
- Collections summary
- Outstanding dues
- Student-wise ledger
- Transaction history

---

## 7. Infrastructure Layer — New & Modified Components

### 7.1 New Eloquent Model: `LateFeeChargeRecord`

**Location:** `Infrastructure/Persistence/TenantAdminDashboard/LateFeeChargeRecord.php`

Must include:
- `BelongsToTenant` trait (global scope on `tenant_id`)
- `$fillable` with all columns
- `$casts`: `amount_cents` → integer, `is_waived` → boolean, `waived_at` → datetime, `charged_on` → date
- Relationships: `belongsTo(InstallmentOrderPaymentRecord)`, `belongsTo(UserRecord, 'waived_by')`

### 7.2 New Repository: `EloquentLateFeeChargeRepository`

**Location:** `Infrastructure/Persistence/TenantAdminDashboard/EloquentLateFeeChargeRepository.php`

Implements `LateFeeChargeRepositoryInterface`.

### 7.3 Modified: `InstallmentOrderPaymentRecord`

Add `paid_amount_cents` to `$fillable` and `$casts` (integer). Add relationship: `hasMany(LateFeeChargeRecord)`.

### 7.4 Modified: `PaymentTransactionRecord` (or equivalent)

Add `verified_by`, `verified_at`, `rejection_reason` to `$fillable`. Add casts: `verified_at` → datetime.

### 7.5 New Email Template

**Location:** `resources/views/emails/fee/overdue-reminder.blade.php`

Extends the Phase 14 Ubotz-branded email layout. Content:
- Student name
- Course/batch name
- Installment step details (step number, amount, due date)
- Days overdue
- Late fee applied (if any)
- "Pay Now" CTA button (if online payment URL is available)
- Institution contact information

---

## 8. HTTP Layer — New & Modified Endpoints

### 8.1 Namespace Convention

All new controllers follow **Pattern B**:

```
Http/TenantAdminDashboard/Fee/Controllers/
Http/TenantAdminDashboard/Payment/Controllers/
```

### 8.2 New Endpoints

| Method | Route | Controller | Capability | Description |
|---|---|---|---|---|
| GET | `/api/admin/fees/students/{userId}/ledger` | `StudentFeeLedgerController` | `fee.view` | Consolidated student fee ledger |
| GET | `/api/admin/fees/aging-report` | `FeeAgingReportController` | `fee.view` | Aging buckets with optional `?branch_id=` filter |
| GET | `/api/admin/fees/financial-health` | `FinancialHealthController` | `dashboard.view` | Dashboard widget data with optional `?branch_id=` filter |
| GET | `/api/admin/payments/pending-verification` | `OfflinePaymentVerificationController` | `fee.manage` | List offline payments awaiting approval |
| POST | `/api/admin/payments/{id}/approve` | `OfflinePaymentVerificationController` | `fee.manage` | Approve an offline payment |
| POST | `/api/admin/payments/{id}/reject` | `OfflinePaymentVerificationController` | `fee.manage` | Reject an offline payment (body: `rejection_reason`) |
| POST | `/api/admin/fees/late-fees/{id}/waive` | `LateFeeController` | `fee.manage` | Waive a late fee charge (body: `reason`) |
| GET | `/api/admin/fees/late-fees/student/{userId}` | `LateFeeController` | `fee.view` | List late fee charges for a student |
| PUT | `/api/admin/installment-plans/{id}` | (modify existing) | `fee.manage` | Extend to accept `late_fee_type`, `late_fee_flat_cents`, `late_fee_percentage` |
| PUT | `/api/admin/courses/{id}` | (modify existing) | `course.edit` | Extend to accept `default_installment_plan_id` |

### 8.3 Modified Endpoints

All existing fee report endpoints must accept an optional `?branch_id=` query parameter:

| Endpoint | Change |
|---|---|
| `GET /api/admin/fees/collections-summary` | Add `?branch_id=` filter |
| `GET /api/admin/fees/outstanding` | Add `?branch_id=` filter |
| `GET /api/admin/fees/ledger` | Add `?branch_id=` filter |
| `GET /api/admin/fees/transactions` | Add `?branch_id=` filter |

### 8.4 Capability Requirements

New capability codes to seed:

| Code | Group | Display Name |
|---|---|---|
| `fee.approve_payment` | fee | Approve/Reject Offline Payments |

**Note:** Existing `fee.view` and `fee.manage` capabilities should already exist. Verify in codebase. If not, add them. The `fee.approve_payment` capability is separate from `fee.manage` because payment approval is a sensitive operation that may be restricted to senior staff.

---

## 9. Frontend Changes

### 9.1 Student Fee Ledger Screen

**Route:** `/admin/fees/students/{userId}/ledger`

**Purpose:** The "front desk screen" — single page showing everything about one student's financial position.

**Layout:**
- Header: Student name, ID, branch, enrollment status
- Summary cards: Total owed, Total paid, Outstanding, Overdue, Late fees
- Per-order accordion: Each installment order expands to show steps with status badges, amounts, due dates, aging indicators
- Late fee section: List of charges with waive buttons (for authorized staff)
- Payment history: Chronological list of all payments (Razorpay + offline) with verification status

### 9.2 Payment Approval Queue

**Route:** `/admin/payments/pending`

**Purpose:** List of all offline payments awaiting verification.

**Layout:**
- Table: Student name, Amount, Method (cash/NEFT/UPI), Reference, Recorded by, Recorded at, Notes
- Actions: Approve / Reject per row
- Reject requires reason (modal with text input)
- Filter by branch (if branches exist)
- Sort by date (oldest first — process in order)

### 9.3 Aging Report

**Route:** `/admin/fees/aging-report`

**Purpose:** Overdue students grouped by severity.

**Layout:**
- Four cards/sections for each aging bucket with count and total amount
- Expandable student list per bucket
- Branch filter dropdown
- Click student name → navigate to student fee ledger

### 9.4 FinancialHealth Dashboard Widget

**Location:** Existing dashboard widget — currently hardcoded

**Change:** Replace hardcoded data with API call to `/api/admin/fees/financial-health`

**Display:**
- Collections this month vs. last month (with trend indicator)
- Total outstanding and overdue amounts
- Pending verification count (with link to approval queue)
- Aging summary (mini chart or count badges)
- Branch filter (if branches exist)

### 9.5 Installment Plan Configuration

**Location:** Existing installment plan create/edit form

**Change:** Add late fee configuration section:
- Late fee type: dropdown (None / Flat Amount / Percentage)
- Flat amount field (shown when type = Flat): currency input in display units (converted to cents)
- Percentage field (shown when type = Percentage): percentage input
- Clear helper text explaining when late fees are charged

### 9.6 Course Default Plan

**Location:** Existing course edit form

**Change:** Add optional "Default Installment Plan" dropdown. Lists active installment plans for the tenant. Nullable — courses don't require a default plan.

---

## 10. Notification Integration

### 10.1 New Notification Types (via Phase 14 Infrastructure)

| Notification | Trigger | Channels | Priority | Category |
|---|---|---|---|---|
| `OverduePaymentReminder` | `FeeSendRemindersCommand` (T+1 day) | in-app + email | high | billing |
| `UpcomingPaymentReminder` | `FeeSendRemindersCommand` (T-7 days) | in-app + email | normal | billing |
| `LateFeeApplied` | `LateFeeCharged` event | in-app | normal | billing |
| `OfflinePaymentPendingApproval` | `OfflinePaymentRecorded` event | in-app | high | billing |
| `OfflinePaymentApproved` | `OfflinePaymentApproved` event | in-app | normal | billing |
| `OfflinePaymentRejected` | `OfflinePaymentRejected` event | in-app | high | billing |

**Channel routing:** `billing` category notifications are mandatory (cannot be opted out per Phase 14 design).

**Recipients:**
- `OverduePaymentReminder` / `UpcomingPaymentReminder` → Student (and parent, when parent portal exists)
- `LateFeeApplied` → Student
- `OfflinePaymentPendingApproval` → Users with `fee.approve_payment` capability in the same branch
- `OfflinePaymentApproved` / `OfflinePaymentRejected` → The staff member who recorded the payment + the student

---

## 11. Implementation Sequence

The developer must implement in this order. Each step's dependencies are explicit.

| Step | Component | Depends On | Estimated Effort |
|---|---|---|---|
| 1 | Branch ID migrations (4.1, 4.2) + backfill (4.3) | None | 0.5 day |
| 2 | Partial payment migration (4.4) + backfill | None | 0.5 day |
| 3 | Approval fields migration (4.5) | None | 0.25 day |
| 4 | Late fee charges table (4.6) + plan config (4.7) + course default plan (4.8) | None | 0.5 day |
| 5 | Domain layer: Value Objects, entities, repository interfaces, domain events | Steps 1-4 | 1.5 days |
| 6 | Infrastructure layer: Eloquent models, repositories | Step 5 | 1 day |
| 7 | Modified `RecordOfflineFeePaymentUseCase` (approval flow) | Steps 5-6 | 0.5 day |
| 8 | `ApproveOfflinePaymentUseCase` + `RejectOfflinePaymentUseCase` | Step 7 | 1 day |
| 9 | `CalculateLateFeeUseCase` + `WaiveLateFeeUseCase` | Steps 5-6 | 1 day |
| 10 | Modified `FeeDetectOverdueCommand` (partial payment handling + late fee trigger) | Steps 8-9 | 0.5 day |
| 11 | `GetStudentFeeLedgerQuery` | Steps 5-6 | 0.5 day |
| 12 | `GetAgingReportQuery` + `GetFinancialHealthQuery` | Steps 5-6 | 1 day |
| 13 | Branch filter extension on existing report queries | Step 1 | 0.5 day |
| 14 | Modified `FeeSendRemindersCommand` (email channel) | Phase 14 infra | 0.5 day |
| 15 | HTTP layer: new controllers, routes, FormRequests, Resources | Steps 7-13 | 1.5 days |
| 16 | Notification listeners (6 types) | Steps 7-10, Phase 14 | 0.5 day |
| 17 | Capability seeding (`fee.approve_payment`) | None | 0.25 day |
| 18 | Frontend: Student fee ledger screen | Step 15 | 1.5 days |
| 19 | Frontend: Payment approval queue | Step 15 | 1 day |
| 20 | Frontend: Aging report | Step 15 | 1 day |
| 21 | Frontend: FinancialHealth dashboard widget (live data) | Step 15 | 1 day |
| 22 | Frontend: Installment plan late fee config + course default plan | Step 15 | 0.5 day |
| 23 | Tests | All steps | 2 days |

**Total estimated effort: ~17 days**

---

## 12. Test Plan

### Unit Tests

| Test File | What It Tests |
|---|---|
| `InstallmentPaymentStatusTest` | Status transition rules, invalid transitions throw exceptions |
| `AgingBucketTest` | `fromDaysOverdue()` returns correct bucket for boundary values (0, 1, 15, 16, 30, 31, 60, 61, 365) |
| `LateFeeTypeTest` | Enum values, `fromString()` factory |
| `LateFeeChargeEntityTest` | Construction, waive(), double-waive prevention |
| `InstallmentOrderPaymentEntityTest` | `recordPayment()` — partial, full, overpayment rejection, domain invariant enforcement |
| `CalculateLateFeeUseCaseTest` | Flat calculation, percentage calculation, `none` type skips, idempotency (already charged today), zero-amount prevention |
| `ApproveOfflinePaymentUseCaseTest` | Happy path, self-approval rejection, already-verified rejection, partial payment application, full payment application |
| `RejectOfflinePaymentUseCaseTest` | Happy path, already-verified rejection |
| `WaiveLateFeeUseCaseTest` | Happy path, already-waived rejection |

### Feature Tests

| Test File | What It Tests |
|---|---|
| `StudentFeeLedgerEndpointTest` | Returns correct aggregation across multiple orders, partial payments, late fees |
| `AgingReportEndpointTest` | Correct bucket grouping, branch filter, empty results |
| `FinancialHealthEndpointTest` | Correct aggregation, branch filter, collections trend |
| `OfflinePaymentApprovalFlowTest` | Record → pending → approve → student credited; Record → pending → reject → student NOT credited |
| `OfflinePaymentSelfApprovalTest` | Verifier === recorder → 403 |
| `LateFeeEndpointTest` | Waive endpoint, list by student |
| `BranchFilterOnReportsTest` | All existing report endpoints return branch-filtered data when `?branch_id=` is provided |
| `FeeDetectOverdueCommandTest` | Marks pending AND partially_paid as overdue; triggers late fee calculation; does NOT double-charge |
| `FeeSendRemindersCommandTest` | Sends email via Phase 14 NotificationDispatcher |
| `PartialPaymentFlowTest` | Record partial → partially_paid status → record remainder → paid status → enrollment activated |
| `PartialPaymentSuspensionTest` | Partial payment on overdue step → remains overdue → suspension NOT lifted |

**Minimum expected test count: 40-50 new tests.**

---

## 13. Quality Gate — Phase 20A Complete

### Security & Financial Safety Gates (BLOCKING)

- [ ] Offline payments always created as `pending_verification` — no code path bypasses this
- [ ] Self-approval prevention: `verifierId !== payment.recorded_by` enforced in UseCase, not just frontend
- [ ] Pessimistic locking (`SELECT FOR UPDATE`) on `installment_order_payments` during payment application
- [ ] Domain invariant: `paid_amount_cents <= amount_cents` enforced in entity — no code path can overpay
- [ ] Late fee idempotency: unique constraint + UseCase check prevents double-charging
- [ ] `branch_id` set at event time (order creation, payment recording) — not resolved dynamically
- [ ] All new tables with `tenant_id` have `BelongsToTenant` global scope
- [ ] No external API calls inside database transactions
- [ ] Audit logs written outside transactions (`DB::afterCommit()`)
- [ ] Domain events dispatched outside transactions
- [ ] Late fee waiver requires audit trail (waived_by, waived_at, reason) — no silent waivers

### Functional Gates (BLOCKING)

- [ ] Partial payment: ₹12,000 against ₹20,000 step → `partially_paid` with `paid_amount_cents = 12000`, `remaining = 8000`
- [ ] Partial payment on overdue step → status remains `OVERDUE`, suspension NOT lifted
- [ ] Full payment on overdue step → status becomes `PAID`, suspension lifted
- [ ] Offline payment approval flow: record → pending → approve → student credited, enrollment activated
- [ ] Offline payment rejection: record → pending → reject → student NOT affected
- [ ] Late fee charged once when step becomes overdue (if plan has late fees configured)
- [ ] Late fee waiver removes charge from student's balance
- [ ] Aging report correctly groups students into 4 buckets
- [ ] All fee reports accept `?branch_id=` filter and return correct results
- [ ] FinancialHealth widget shows live data, not hardcoded values
- [ ] Default plan on course pre-selects plan during order creation (convenience, not enforcement)
- [ ] Email reminders sent for upcoming (T-7) and overdue (T+1) payments

### Architecture Gates (BLOCKING)

- [ ] PHPStan Level 5: zero new errors
- [ ] All tests pass (zero regression on existing tests)
- [ ] Domain layer has zero `Illuminate` imports in new files
- [ ] Controllers < 20 lines per method
- [ ] `ClockInterface` used for all time operations (no `now()` in domain/application layer)
- [ ] `_cents` suffix on all monetary columns — no floats, no decimals (except `late_fee_percentage` on plans, which is a configuration value, not stored money)
- [ ] Events dispatched outside transactions
- [ ] `env()` check: zero results in `app/`, `routes/`, `database/`
- [ ] Soft deletes on `late_fee_charges` (compliance implications)
- [ ] HTTP namespace follows Pattern B: `Http/TenantAdminDashboard/{Feature}/Controllers/`

---

## 14. Implementation Plan Format

The developer must produce an implementation plan following the same format as previous phases:

| # | Section | Description |
|---|---|---|
| 1 | Executive Summary | What gets built, what does NOT |
| 2 | Prerequisite Verification | Verify actual schema of `installment_order_payments`, `payment_transactions`, `installment_plans`, `courses`. Document actual column names and types. |
| 3 | Gap Analysis | Compare this spec against actual codebase. Flag any assumptions that don't match. |
| 4 | Architecture Decisions | Any deviations from this spec, with justification |
| 5 | Migration Plan | All 8 migrations with exact SQL/Laravel schema builder code |
| 6 | Domain Layer | Entities, value objects, events, exceptions, repository interfaces |
| 7 | Application Layer | UseCases, queries, DTOs, event listeners |
| 8 | Infrastructure Layer | Eloquent models, repositories, email templates |
| 9 | HTTP Layer | Controllers, FormRequests, Resources, route files |
| 10 | Frontend Changes | Every new page, component, and modified component |
| 11 | Notification Integration | Listener wiring, email template, channel routing |
| 12 | Implementation Sequence | Ordered steps with dependencies and day estimates |
| 13 | Test Plan | Every test file with description |
| 14 | Quality Gate Verification | Checklist from §13 |
| 15 | Risk Register | Identified risks with severity and mitigation |
| 16 | File Manifest | Every new and modified file |

---

## 15. Constraints & Reminders

### Architecture Constraints

- Installment, Payment, Pricing, and Fee are separate bounded contexts. Do not merge them. Cross-context access via service interfaces or query services only.
- `LateFeeChargeEntity` lives in the **Fee** context (it's an orchestration concern), not the Installment context.
- `late_fee_type` / `late_fee_flat_cents` / `late_fee_percentage` on `installment_plans` is Installment context configuration. The Fee context reads it but does not own it.
- The approval workflow modifies `payment_transactions` (Payment context). The resulting credit to `installment_order_payments` (Installment context) is a cross-context operation coordinated by the `ApproveOfflinePaymentUseCase`. This is acceptable as a UseCase-level orchestration — do NOT create a domain service that spans both contexts.

### Docker Environment

- Container: Alpine Linux — use `sh` not `bash`
- Container name: `ubotz_backend`
- Database: `ubotz_mysql`
- Command: `docker exec -it ubotz_backend sh -c "..."`

### What NOT to Do

- Do NOT make aging bucket boundaries configurable. They are platform constants.
- Do NOT add a tenant setting for `offline_payment_requires_approval`. It is always required.
- Do NOT allow `paid_amount_cents` to exceed `amount_cents`. This is a hard domain invariant.
- Do NOT mutate the original `amount_cents` on `installment_order_payments` when applying late fees. Late fees are a separate entity.
- Do NOT use DECIMAL or FLOAT for any stored monetary amount. Exception: `late_fee_percentage` on `installment_plans` is a configuration percentage, not stored money.
- Do NOT use ENUM columns in MySQL. Use VARCHAR with PHP enum validation.
- Do NOT dispatch domain events inside database transactions.
- Do NOT write audit logs inside database transactions. Use `DB::afterCommit()`.
- Do NOT call external APIs (Razorpay, etc.) inside database transactions.
- Do NOT allow the same user to record AND approve an offline payment (four-eyes principle).
- Do NOT resolve `branch_id` dynamically for financial reports. Use the denormalized column.
- Do NOT use `now()` in domain or application layer code. Inject `ClockInterface` or `\DateTimeImmutable`.
- Do NOT create a separate webhook or cron for late fees. Extend the existing `FeeDetectOverdueCommand`.
- Do NOT skip the backfill migrations. Existing data must be consistent with new schema.

---

## 16. Risk Register

| Risk | Severity | Likelihood | Mitigation |
|---|---|---|---|
| Branch ID backfill assigns current branch for historically transferred students | Medium | Medium | Document as best-effort; going forward, branch captured at event time |
| `paid_amount_cents` backfill for existing `paid` records could fail on large datasets | Low | Low | Run in batches of 1000; idempotent (only updates where `status = 'paid'` and `paid_amount_cents = 0`) |
| Existing code checks `status = 'paid'` without accounting for `partially_paid` | High | Medium | Audit ALL existing queries that filter on payment status. `partially_paid` must not accidentally grant access or clear obligations. |
| Late fee cron adds processing time to `FeeDetectOverdueCommand` | Medium | Low | Late fee calculation is O(n) per overdue step; unlikely to be bottleneck. Monitor execution time. |
| Four-eyes principle on approvals blocks institutions with single-person finance teams | Medium | Medium | Documented constraint. In practice, the institution owner can always approve payments recorded by staff. If truly single-person, they can use Razorpay (no approval needed). |
| FinancialHealth query performance on large tenants (10,000+ students) | Medium | Medium | Use indexed aggregate queries, not Eloquent collection iteration. Consider daily pre-computed cache if query exceeds 500ms. |
| `partially_paid` + overdue interaction creates complex status resolution | Medium | Low | Clear precedence rule: overdue takes priority. Status is resolved by `FeeDetectOverdueCommand`, not by payment recording. |

---

## 17. Definition of Done

Phase 20A is complete when:

1. The implementation plan has been reviewed and approved by the Principal Engineer.
2. All code is implemented per the approved plan.
3. All quality gates in §13 pass.
4. A Principal Engineer audit confirms zero critical or high findings.
5. All findings from audit are resolved.
6. Partial payment flow demonstrated end-to-end: partial → partially_paid → remainder → paid → enrollment activated.
7. Offline payment approval demonstrated: record → pending → approve → student credited.
8. Late fee auto-calculation demonstrated: overdue step + plan with late fee → charge created.
9. Aging report shows correct bucket grouping with branch filter.
10. FinancialHealth dashboard widget shows live data from backend API.
11. The Phase 20A Completion Report is signed off.

---

> **Phase 12A charged the first rupee. Phase 12B charged every rupee on time. Phase 12C accounted for every rupee. Phase 20A ensures every rupee is tracked to the right student, the right branch, the right installment — and that no rupee enters or leaves without verification. Financial integrity is not a feature. It's a promise you make to every institution that trusts this platform with their revenue.**

*End of Document — UBOTZ 2.0 Phase 20A Developer Instructions — March 26, 2026*
