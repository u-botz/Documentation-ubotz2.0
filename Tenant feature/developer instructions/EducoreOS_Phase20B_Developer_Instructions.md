# UBOTZ 2.0 / EducoreOS — Phase 20B Developer Instructions

## Concessions, Fee Adjustments & Financial Reporting

| Field | Value |
|---|---|
| **Document Type** | Developer Instruction (Pre-Implementation Brief) |
| **Phase** | 20B |
| **Date** | March 26, 2026 |
| **Issued By** | Principal Engineer / Architecture Auditor |
| **Audience** | Implementation Developer (Antigravity) |
| **Expected Deliverable** | Phase 20B Implementation Plan (same format as 10A–15C plans) |
| **Prerequisites** | Phase 20A COMPLETE (Partial payments, offline payment approval, late fees, aging buckets, branch filtering, FinancialHealth widget live), Phase 12C COMPLETE (Invoicing infrastructure, `student_invoices` table), Pricing context WORKING (`TicketEntity`, `SpecialOffer`, `CalculatePriceUseCase`) |
| **Business Findings** | Phase 20 Business Findings (March 26, 2026) — APPROVED |

> **Phase 20A fixed how money comes in. Phase 20B fixes how money is adjusted after it's been committed. Concessions reduce what a student owes. Credit notes correct what was wrongly charged. Both affect revenue reporting, audit trails, and institutional trust. Every adjustment without a paper trail is a future dispute waiting to happen.**

---

## 1. Mission Statement

Phase 20B adds post-enrollment financial adjustment capabilities that institutions need for real-world fee management:

1. **Fee concessions** — partial manual discounts applied after enrollment with configurable approval workflows
2. **Credit notes** — formal corrections to existing fee obligations when errors occur or refunds are granted
3. **Concession type management** — platform-defined and tenant-custom concession categories
4. **Approval workflows** — threshold-based approval routing for concessions
5. **Revenue foregone reporting** — aggregated visibility into how much the institution is giving away
6. **Reconciliation data export** — CSV/Excel export of financial data for bank statement matching

**What this phase includes:**
- New `fee_concessions` table for post-enrollment fee adjustments
- New `credit_notes` table for formal fee corrections
- New `concession_types` table (platform defaults + tenant custom)
- Approval state machine for concessions with configurable thresholds
- Revenue foregone report (total concessions by type, by branch, by period)
- Reconciliation export endpoint (CSV of all payments with method, reference, date, status)
- Frontend: concession application screen, approval queue, revenue foregone report, export functionality

**What this phase does NOT include:**
- GST/tax calculation (CGST/SGST/IGST) — requires a tax engine, deferred
- Automated refund processing via Razorpay Refunds API — deferred
- Expense tracking or branch P&L — separate bounded context, separate phase
- Student-facing concession visibility (depends on Student Dashboard)
- Multi-level approval chains (max two levels in this phase: manager → owner)
- Retroactive concession application to already-paid installments (concessions reduce future obligations only)

---

## 2. Business Context

### 2.1 Current State (Post-Phase 20A)

The pricing system handles pre-enrollment discounts well: `TicketEntity` (coupon codes) and `SpecialOffer` (group discounts) reduce the price at checkout via `CalculatePriceUseCase`. These discounts are applied **before** an installment order is created, so they reduce the total obligation upfront.

But institutions need post-enrollment adjustments:

- A student earns a merit scholarship mid-year → their remaining installments should be reduced by 20%
- A parent negotiates a hardship concession → ₹5,000 off the next installment
- A staff member's child enrolls → 100% fee waiver on all remaining steps (currently only possible via "Grant Access" which bypasses the fee system entirely, losing audit trail)
- An installment order was created with the wrong plan → the excess amount needs to be formally corrected, not silently adjusted

The existing "Grant Access" feature is a blunt instrument — it bypasses all payment tracking. Institutions need concessions that **reduce obligations within the fee system**, not around it.

### 2.2 How Concessions Differ from Existing Discounts

| Dimension | Existing Discounts (Tickets/SpecialOffers) | New Concessions (Phase 20B) |
|---|---|---|
| When applied | At checkout, before order creation | After enrollment, against existing orders |
| What they affect | `final_price` on the order | Individual installment steps (reduce `amount_cents`) or create a credit |
| Who applies | Student (coupon code) or system (special offer rules) | Staff member (manual), subject to approval |
| Audit trail | Recorded in `student_invoices.discount_cents` | Dedicated `fee_concessions` table with approval chain |
| Approval | None — if the code is valid, it applies | Threshold-based: below threshold = auto-approve, above = manager/owner approval |
| Reversibility | Not reversible after order creation | Concessions can be revoked (with audit trail) |
| Reporting | Not aggregated as "revenue foregone" | Dedicated revenue foregone report |

### 2.3 How Credit Notes Differ from Concessions

| Dimension | Concession | Credit Note |
|---|---|---|
| Purpose | Intentional discount — institution decides to charge less | Correction — something was charged incorrectly |
| Trigger | Merit scholarship, hardship, sibling discount, staff-child waiver | Wrong plan applied, duplicate charge, billing error |
| Effect | Reduces future obligation | Creates a negative adjustment against an existing charge |
| Approval | Threshold-based | Always requires manager approval (corrections are sensitive) |
| Financial reporting | Revenue foregone | Adjustment/correction (not revenue foregone) |

---

## 3. Architecture Overview

### 3.1 Bounded Context Impact

| Bounded Context | What Changes |
|---|---|
| **Fee** | New concession entity, credit note entity, concession types, approval workflow, revenue foregone query, reconciliation export |
| **Installment** | Modified `installment_order_payments.amount_cents` when a concession is applied (reduces future step amount) |
| **Pricing** | No changes — existing Ticket/SpecialOffer system untouched. Concessions are a separate mechanism. |

**Important:** Concessions do NOT modify the Pricing context. They live in the Fee context because they are post-enrollment financial adjustments, not pre-checkout price calculations. The Pricing context remains responsible for pre-order discounts only.

### 3.2 Concession Application Model

A concession reduces a student's **future** fee obligations. It does NOT retroactively adjust already-paid installments.

**Application rules:**
1. Concession targets a specific `installment_order_id` (one order at a time)
2. Concession can be:
   - **Percentage-based:** reduces remaining unpaid steps by X% (e.g., "20% merit scholarship")
   - **Flat amount:** reduces the next unpaid step by ₹X (e.g., "₹5,000 hardship adjustment")
   - **Full waiver:** reduces all remaining unpaid steps to ₹0 (replaces current "Grant Access" for tracked waivers)
3. Only `pending` or `partially_paid` steps can be reduced. `paid` and `overdue` steps are not adjusted.
4. A concession cannot reduce a step's `amount_cents` below its `paid_amount_cents` (you cannot owe negative money)
5. Multiple concessions can apply to the same order (e.g., sibling discount + merit scholarship), but the combined reduction cannot bring any step below zero

**When a percentage concession is applied:**
```
For each unpaid step in the order:
  reduction = floor(step.amount_cents * concession_percentage / 100)
  step.amount_cents = step.amount_cents - reduction
  // If step already has partial payment: ensure amount_cents >= paid_amount_cents
```

**When a flat concession is applied:**
```
remaining_flat = concession_flat_amount_cents
For each unpaid step (ordered by due_date ASC):
  max_reduction = step.amount_cents - step.paid_amount_cents
  reduction = min(remaining_flat, max_reduction)
  step.amount_cents = step.amount_cents - reduction
  remaining_flat = remaining_flat - reduction
  if remaining_flat <= 0: break
```

---

## 4. Schema Changes

### 4.1 New Table: `concession_types`

```sql
CREATE TABLE concession_types (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NULL,
  code VARCHAR(50) NOT NULL,
  display_name VARCHAR(120) NOT NULL,
  description TEXT NULL,
  is_platform_defined BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NULL,
  updated_at TIMESTAMP NULL,

  UNIQUE INDEX unq_concession_type_code (tenant_id, code),
  INDEX idx_concession_types_tenant (tenant_id)
);
```

**Dual-scope design:**
- **Platform-defined types** (`is_platform_defined = true`, `tenant_id = NULL`): seeded by platform, visible to all tenants, cannot be edited or deleted by tenants
- **Tenant-custom types** (`is_platform_defined = false`, `tenant_id = {id}`): created by tenant admin, scoped to their tenant

**Platform-defined seed data:**

| Code | Display Name |
|---|---|
| `merit_scholarship` | Merit Scholarship |
| `sibling_discount` | Sibling Discount |
| `staff_child` | Staff Child Waiver |
| `financial_hardship` | Financial Hardship |
| `early_bird` | Early Bird Discount |
| `referral` | Referral Discount |
| `full_waiver` | Full Fee Waiver |
| `other` | Other |

**Query pattern:** When listing concession types for a tenant, combine: `WHERE tenant_id = {current_tenant} OR is_platform_defined = true`.

**Note on `BelongsToTenant`:** This table has a nullable `tenant_id`. Platform-defined rows have `NULL`. The `BelongsToTenant` global scope will filter these out. The query service must use `withoutGlobalScope(BelongsToTenant::class)` or a dedicated query that unions platform + tenant rows. Document this explicitly in the implementation plan.

### 4.2 New Table: `fee_concessions`

```sql
CREATE TABLE fee_concessions (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  installment_order_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  concession_type_id BIGINT UNSIGNED NOT NULL,
  concession_method VARCHAR(20) NOT NULL,
  concession_percentage DECIMAL(5,2) NULL,
  concession_flat_cents BIGINT UNSIGNED NULL,
  total_reduction_cents BIGINT UNSIGNED NOT NULL,
  reason TEXT NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'pending_approval',
  approval_threshold_cents BIGINT UNSIGNED NOT NULL,
  approved_by BIGINT UNSIGNED NULL,
  approved_at TIMESTAMP NULL,
  rejected_by BIGINT UNSIGNED NULL,
  rejected_at TIMESTAMP NULL,
  rejection_reason TEXT NULL,
  revoked_by BIGINT UNSIGNED NULL,
  revoked_at TIMESTAMP NULL,
  revocation_reason TEXT NULL,
  applied_by BIGINT UNSIGNED NOT NULL,
  applied_at TIMESTAMP NULL,
  idempotency_key VARCHAR(100) NOT NULL,
  created_at TIMESTAMP NULL,
  updated_at TIMESTAMP NULL,
  deleted_at TIMESTAMP NULL,

  INDEX idx_fee_concessions_tenant (tenant_id),
  INDEX idx_fee_concessions_order (installment_order_id),
  INDEX idx_fee_concessions_user (user_id),
  INDEX idx_fee_concessions_status (tenant_id, status),
  UNIQUE INDEX unq_fee_concessions_idempotency (tenant_id, idempotency_key),
  CONSTRAINT fk_fee_concessions_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_fee_concessions_order FOREIGN KEY (installment_order_id) REFERENCES installment_orders(id) ON DELETE CASCADE,
  CONSTRAINT fk_fee_concessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_fee_concessions_type FOREIGN KEY (concession_type_id) REFERENCES concession_types(id) ON DELETE RESTRICT,
  CONSTRAINT fk_fee_concessions_approved_by FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_fee_concessions_rejected_by FOREIGN KEY (rejected_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_fee_concessions_applied_by FOREIGN KEY (applied_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_fee_concessions_revoked_by FOREIGN KEY (revoked_by) REFERENCES users(id) ON DELETE SET NULL
);
```

**Key columns explained:**

- `concession_method`: `percentage`, `flat`, `full_waiver`
- `total_reduction_cents`: the actual total amount reduced across all affected steps (computed at application time, stored for reporting)
- `approval_threshold_cents`: the tenant's configured threshold at the time of creation (snapshot — if tenant later changes threshold, existing concessions aren't affected)
- `status`: `pending_approval`, `approved`, `applied`, `rejected`, `revoked`
- `applied_at`: timestamp when the concession was actually applied to installment steps (may differ from `approved_at` if applied in batch)

**Soft deletes:** Yes — compliance requirement. Deleted concessions must be recoverable for audit.

### 4.3 New Table: `fee_concession_step_adjustments`

Records exactly which installment steps were modified and by how much, providing a complete audit trail.

```sql
CREATE TABLE fee_concession_step_adjustments (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  fee_concession_id BIGINT UNSIGNED NOT NULL,
  installment_order_payment_id BIGINT UNSIGNED NOT NULL,
  original_amount_cents BIGINT UNSIGNED NOT NULL,
  reduction_cents BIGINT UNSIGNED NOT NULL,
  adjusted_amount_cents BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NULL,

  INDEX idx_concession_adjustments_concession (fee_concession_id),
  INDEX idx_concession_adjustments_payment (installment_order_payment_id),
  CONSTRAINT fk_concession_adj_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_concession_adj_concession FOREIGN KEY (fee_concession_id) REFERENCES fee_concessions(id) ON DELETE CASCADE,
  CONSTRAINT fk_concession_adj_payment FOREIGN KEY (installment_order_payment_id) REFERENCES installment_order_payments(id) ON DELETE CASCADE
);
```

**Purpose:** When a concession is revoked, this table tells us exactly how to reverse the step adjustments. Without it, reversal requires recalculation which is error-prone.

### 4.4 New Table: `credit_notes`

```sql
CREATE TABLE credit_notes (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  credit_note_number VARCHAR(30) NOT NULL,
  installment_order_id BIGINT UNSIGNED NOT NULL,
  installment_order_payment_id BIGINT UNSIGNED NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  amount_cents BIGINT UNSIGNED NOT NULL,
  reason TEXT NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'pending_approval',
  approved_by BIGINT UNSIGNED NULL,
  approved_at TIMESTAMP NULL,
  rejected_by BIGINT UNSIGNED NULL,
  rejected_at TIMESTAMP NULL,
  rejection_reason TEXT NULL,
  applied_by BIGINT UNSIGNED NOT NULL,
  idempotency_key VARCHAR(100) NOT NULL,
  created_at TIMESTAMP NULL,
  updated_at TIMESTAMP NULL,

  UNIQUE INDEX unq_credit_note_number (tenant_id, credit_note_number),
  UNIQUE INDEX unq_credit_note_idempotency (tenant_id, idempotency_key),
  INDEX idx_credit_notes_tenant (tenant_id),
  INDEX idx_credit_notes_order (installment_order_id),
  INDEX idx_credit_notes_user (user_id),
  INDEX idx_credit_notes_status (tenant_id, status),
  CONSTRAINT fk_credit_notes_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_credit_notes_order FOREIGN KEY (installment_order_id) REFERENCES installment_orders(id) ON DELETE CASCADE,
  CONSTRAINT fk_credit_notes_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

**Credit note numbering:** `CN/{FY_START}-{FY_END_SHORT}/{SEQUENTIAL}` — e.g., `CN/2025-26/0001`. Same gapless pattern as Phase 12C invoices. Requires its own sequence table or row in the existing `invoice_number_sequences` table (add a `type` column or create a `credit_note_number_sequences` table).

**Credit notes are immutable after approval.** Once applied, they cannot be edited or deleted — only new adjustments can correct errors (same principle as invoices from Phase 12C).

### 4.5 New Tenant Setting: Concession Approval Thresholds

Add to tenant `settings` JSON (via existing `config/tenant.php` `allowed_settings_keys`):

```php
'concession_auto_approve_threshold_cents' => 500000,  // ₹5,000 — below this, auto-approve
'concession_owner_approval_threshold_cents' => 2500000, // ₹25,000 — above this, requires owner
```

**Approval routing logic:**

| Concession Amount | Approval Path |
|---|---|
| ≤ `auto_approve_threshold_cents` | Auto-approved (no manual approval needed) |
| > `auto_approve_threshold_cents` AND ≤ `owner_approval_threshold_cents` | Requires branch manager or admin approval (`hierarchy_level >= 80`) |
| > `owner_approval_threshold_cents` | Requires owner approval (`hierarchy_level = 100`) |

**Defaults:** If tenant hasn't configured these settings, use the platform defaults above.

---

## 5. Domain Layer — New Components

### 5.1 Fee Bounded Context — New Entities

#### `ConcessionTypeEntity`

**Location:** `Domain/TenantAdminDashboard/Fee/Entities/ConcessionTypeEntity.php`

Properties: `id`, `tenantId` (nullable), `code`, `displayName`, `description`, `isPlatformDefined`, `isActive`.

Immutable for platform-defined types. Tenant types can be deactivated but not deleted (soft delete).

#### `FeeConcessionEntity`

**Location:** `Domain/TenantAdminDashboard/Fee/Entities/FeeConcessionEntity.php`

Properties: all columns from §4.2.

**Status state machine:**

```
pending_approval → approved → applied → (optionally) revoked
pending_approval → rejected
```

| From | To | Condition |
|---|---|---|
| `pending_approval` | `approved` | Approval by authorized user (or auto-approve if below threshold) |
| `pending_approval` | `rejected` | Rejection by authorized user |
| `approved` | `applied` | Step adjustments executed against installment order |
| `applied` | `revoked` | Revocation by authorized user (reverses step adjustments) |

**Domain methods:**
- `approve(int $approvedBy, \DateTimeImmutable $at): void` — validates approver hierarchy, transitions status
- `reject(int $rejectedBy, \DateTimeImmutable $at, string $reason): void`
- `markApplied(\DateTimeImmutable $at): void`
- `revoke(int $revokedBy, \DateTimeImmutable $at, string $reason): void`
- `calculateReduction(array $unpaidSteps): int` — computes total reduction without side effects
- `isAutoApproved(int $thresholdCents): bool` — returns true if `total_reduction_cents <= thresholdCents`

**Domain invariants:**
- `concession_percentage` must be > 0 and ≤ 100 when `concession_method = 'percentage'`
- `concession_flat_cents` must be > 0 when `concession_method = 'flat'`
- `total_reduction_cents` must be > 0 (a zero-value concession is meaningless)
- Approver must have sufficient `hierarchy_level` for the concession amount
- Self-approval is NOT prohibited for concessions (unlike payment approval) — staff can grant concessions they created, provided they have the authority level. The threshold-based routing provides governance.

#### `CreditNoteEntity`

**Location:** `Domain/TenantAdminDashboard/Fee/Entities/CreditNoteEntity.php`

Properties: all columns from §4.4.

**Status state machine:**

```
pending_approval → approved (applied immediately on approval)
pending_approval → rejected
```

Credit notes always require manager approval — there is no auto-approve threshold. Corrections to financial records are always sensitive.

**Domain methods:**
- `approve(int $approvedBy, \DateTimeImmutable $at): void`
- `reject(int $rejectedBy, \DateTimeImmutable $at, string $reason): void`

**Domain invariant:** Credit note `amount_cents` cannot exceed the remaining unpaid balance on the targeted step/order.

### 5.2 New Value Objects

#### `ConcessionMethod`

**Location:** `Domain/TenantAdminDashboard/Fee/ValueObjects/ConcessionMethod.php`

Enum: `PERCENTAGE`, `FLAT`, `FULL_WAIVER`.

#### `ConcessionStatus`

**Location:** `Domain/TenantAdminDashboard/Fee/ValueObjects/ConcessionStatus.php`

Enum: `PENDING_APPROVAL`, `APPROVED`, `APPLIED`, `REJECTED`, `REVOKED`.

Includes `canTransitionTo(self $target): bool` enforcing the state machine.

#### `CreditNoteStatus`

**Location:** `Domain/TenantAdminDashboard/Fee/ValueObjects/CreditNoteStatus.php`

Enum: `PENDING_APPROVAL`, `APPROVED`, `REJECTED`.

#### `CreditNoteNumber`

**Location:** `Domain/TenantAdminDashboard/Fee/ValueObjects/CreditNoteNumber.php`

Value object for `CN/2025-26/0001` format. Same validation/parsing logic as `InvoiceNumber` from Phase 12C, with `CN` prefix instead of `INV`.

### 5.3 New Domain Events

| Event | When Dispatched |
|---|---|
| `ConcessionRequested` | Staff creates a concession request |
| `ConcessionAutoApproved` | Concession is below threshold, auto-approved and applied |
| `ConcessionApproved` | Manager/owner approves a concession |
| `ConcessionApplied` | Concession adjustments applied to installment steps |
| `ConcessionRejected` | Concession request rejected |
| `ConcessionRevoked` | Applied concession is reversed |
| `CreditNoteRequested` | Staff creates a credit note request |
| `CreditNoteApproved` | Manager approves and credit note is applied |
| `CreditNoteRejected` | Credit note request rejected |

### 5.4 New Repository Interfaces

| Interface | Location | Key Methods |
|---|---|---|
| `ConcessionTypeRepositoryInterface` | `Domain/TenantAdminDashboard/Fee/Repositories/` | `findAllForTenant(int $tenantId): array`, `findByCode(string $code, ?int $tenantId): ?ConcessionTypeEntity` |
| `FeeConcessionRepositoryInterface` | `Domain/TenantAdminDashboard/Fee/Repositories/` | `save()`, `findById()`, `findPendingByTenant()`, `findByOrderId()`, `findByStudentId()` |
| `CreditNoteRepositoryInterface` | `Domain/TenantAdminDashboard/Fee/Repositories/` | `save()`, `findById()`, `findPendingByTenant()`, `findByOrderId()` |
| `ConcessionStepAdjustmentRepositoryInterface` | `Domain/TenantAdminDashboard/Fee/Repositories/` | `saveBatch()`, `findByConcessionId()` |

---

## 6. Application Layer — New Components

### 6.1 `CreateConcessionUseCase`

**Location:** `Application/TenantAdminDashboard/Fee/UseCases/CreateConcessionUseCase.php`

Input: `tenantId`, `installmentOrderId`, `userId` (student), `concessionTypeId`, `concessionMethod`, `percentage` or `flatCents`, `reason`, `appliedBy`, `idempotencyKey`

Flow:
1. Load the installment order — verify it belongs to the tenant and user
2. Load concession type — verify it's active and available to the tenant
3. Calculate total reduction against unpaid steps (call entity method)
4. Validate: total reduction > 0, no step goes below `paid_amount_cents`
5. Load tenant concession threshold settings
6. Determine approval path:
   - If below auto-approve threshold → create with `status = 'approved'`, then immediately apply (call `ApplyConcessionUseCase`)
   - If above auto-approve but below owner threshold → create with `status = 'pending_approval'`, dispatch `ConcessionRequested`
   - If above owner threshold → create with `status = 'pending_approval'`, dispatch `ConcessionRequested` with `requires_owner = true`
7. Save entity
8. Audit log (outside transaction)

### 6.2 `ApproveConcessionUseCase`

**Location:** `Application/TenantAdminDashboard/Fee/UseCases/ApproveConcessionUseCase.php`

Input: `concessionId`, `approvedBy`

Flow:
1. Load concession — verify `status = 'pending_approval'`
2. Load approver's role — verify `hierarchy_level` meets requirement
3. Transition to `approved`
4. Immediately call `ApplyConcessionUseCase` to execute the step adjustments
5. Dispatch `ConcessionApproved`
6. Audit log

### 6.3 `ApplyConcessionUseCase`

**Location:** `Application/TenantAdminDashboard/Fee/UseCases/ApplyConcessionUseCase.php`

This is the core financial mutation. Called by `CreateConcessionUseCase` (auto-approve path) or `ApproveConcessionUseCase`.

Input: `concessionId`

Flow:
1. Load concession — verify `status = 'approved'`
2. Load installment order and all unpaid steps (pessimistic lock on steps — `SELECT FOR UPDATE`)
3. Apply reduction per §3.2 rules (percentage, flat, or full waiver)
4. For each modified step, create a `fee_concession_step_adjustments` record with `original_amount_cents`, `reduction_cents`, `adjusted_amount_cents`
5. Update each step's `amount_cents` to the adjusted value
6. Update installment order `fulfillment_status` if all steps are now effectively paid
7. Transition concession to `applied`, set `applied_at`
8. Dispatch `ConcessionApplied`
9. Audit log (outside transaction)

**Critical:** Steps 2-7 must be inside a single database transaction with pessimistic locking.

### 6.4 `RejectConcessionUseCase`

Input: `concessionId`, `rejectedBy`, `reason`

Flow: Load → verify pending → transition to `rejected` → dispatch event → audit log.

### 6.5 `RevokeConcessionUseCase`

**Location:** `Application/TenantAdminDashboard/Fee/UseCases/RevokeConcessionUseCase.php`

Input: `concessionId`, `revokedBy`, `reason`

Flow:
1. Load concession — verify `status = 'applied'`
2. Load step adjustments for this concession
3. Pessimistic lock on affected installment steps
4. Reverse each adjustment: `step.amount_cents = step.amount_cents + adjustment.reduction_cents`
5. Transition concession to `revoked`
6. Dispatch `ConcessionRevoked`
7. Audit log

**Invariant:** Revoking a concession may cause a step to become overdue if the restored amount now exceeds `paid_amount_cents` and the due date has passed. The next run of `FeeDetectOverdueCommand` will handle this automatically.

### 6.6 `CreateCreditNoteUseCase`

**Location:** `Application/TenantAdminDashboard/Fee/UseCases/CreateCreditNoteUseCase.php`

Input: `tenantId`, `installmentOrderId`, `installmentOrderPaymentId` (optional — can target specific step or entire order), `amountCents`, `reason`, `appliedBy`, `idempotencyKey`

Flow:
1. Load order/step — verify ownership and tenant
2. Validate: `amountCents` does not exceed remaining unpaid balance
3. Generate credit note number (gapless sequential, same pattern as invoices)
4. Create `CreditNoteEntity` with `status = 'pending_approval'` (always requires approval)
5. Dispatch `CreditNoteRequested`
6. Audit log

### 6.7 `ApproveCreditNoteUseCase`

Input: `creditNoteId`, `approvedBy`

Flow:
1. Load credit note — verify `status = 'pending_approval'`
2. Load approver — verify `hierarchy_level >= 80` (admin or above)
3. Approve and apply immediately:
   - If targeting a specific step: reduce `step.amount_cents` by credit note amount
   - If targeting the entire order: distribute reduction across unpaid steps (same pattern as flat concession)
4. Transition to `approved`
5. Dispatch `CreditNoteApproved`
6. Audit log

### 6.8 `GetRevenueForegoneReportQuery`

**Location:** `Application/TenantAdminDashboard/Fee/Queries/GetRevenueForegoneReportQuery.php`

Returns:
```php
public function execute(
    int $tenantId,
    ?int $branchId = null,
    ?string $dateFrom = null,
    ?string $dateTo = null
): RevenueForegoneDTO
{
    // Returns:
    // - total_concessions_cents: sum of all applied concession reductions
    // - total_credit_notes_cents: sum of all approved credit notes
    // - total_foregone_cents: concessions + credit notes
    // - by_type: [ { concession_type, count, total_cents } ]
    // - by_branch: [ { branch_id, branch_name, total_cents } ]
    // - by_month: [ { month, total_cents } ]  (trend)
    // - top_concessions: [ { student_name, order, type, amount } ] (top 10 by amount)
}
```

### 6.9 `ExportReconciliationDataUseCase`

**Location:** `Application/TenantAdminDashboard/Fee/UseCases/ExportReconciliationDataUseCase.php`

Generates a CSV/Excel file containing all payment transactions for a given period, suitable for matching against bank statements.

Input: `tenantId`, `dateFrom`, `dateTo`, `branchId` (optional), `format` ('csv' or 'xlsx')

Output columns:
- Date, Student Name, Student ID, Course, Installment Step, Amount (₹), Payment Method, Reference Number, Status (paid/pending_verification/rejected), Recorded By, Verified By, Branch

**Implementation:** Use a streaming CSV writer for large datasets. Do NOT load all records into memory. If `xlsx` format is requested, use the xlsx skill (PhpSpreadsheet or similar).

---

## 7. Infrastructure Layer

### 7.1 New Eloquent Models

| Model | Table | Must Have |
|---|---|---|
| `ConcessionTypeRecord` | `concession_types` | **No `BelongsToTenant`** — platform-defined rows have `NULL` tenant_id. Use manual scoping in queries. |
| `FeeConcessionRecord` | `fee_concessions` | `BelongsToTenant`, `SoftDeletes`, casts for dates/booleans |
| `ConcessionStepAdjustmentRecord` | `fee_concession_step_adjustments` | `BelongsToTenant` |
| `CreditNoteRecord` | `credit_notes` | `BelongsToTenant` |

### 7.2 New Repository Implementations

Standard Eloquent implementations for all four repository interfaces in §5.4.

### 7.3 Credit Note Number Generator

**Location:** `Infrastructure/Persistence/TenantAdminDashboard/SequentialCreditNoteNumberGenerator.php`

Same pattern as `SequentialInvoiceNumberGenerator` from Phase 12C:
- Uses `SELECT FOR UPDATE` on a sequence counter
- Format: `CN/{FY}/{SEQ}` — e.g., `CN/2025-26/0001`
- Gapless within financial year per tenant

**Option A:** Add a `type` column to `invoice_number_sequences` and reuse the table.
**Option B:** Create a dedicated `credit_note_number_sequences` table.

**Recommendation:** Option B — separate tables prevent any possibility of cross-contamination between invoice and credit note sequences. The cost is one small table.

---

## 8. HTTP Layer

### 8.1 New Endpoints

| Method | Route | Controller | Capability | Description |
|---|---|---|---|---|
| GET | `/api/admin/fees/concession-types` | `ConcessionTypeController` | `fee.view` | List all concession types (platform + tenant) |
| POST | `/api/admin/fees/concession-types` | `ConcessionTypeController` | `fee.manage` | Create tenant-custom concession type |
| PUT | `/api/admin/fees/concession-types/{id}` | `ConcessionTypeController` | `fee.manage` | Update tenant-custom type (platform types: 403) |
| DELETE | `/api/admin/fees/concession-types/{id}` | `ConcessionTypeController` | `fee.manage` | Deactivate tenant-custom type (platform types: 403) |
| POST | `/api/admin/fees/concessions` | `FeeConcessionController` | `fee.manage` | Create concession request |
| GET | `/api/admin/fees/concessions/pending` | `FeeConcessionController` | `fee.approve_concession` | List pending concession approvals |
| POST | `/api/admin/fees/concessions/{id}/approve` | `FeeConcessionController` | `fee.approve_concession` | Approve a concession |
| POST | `/api/admin/fees/concessions/{id}/reject` | `FeeConcessionController` | `fee.approve_concession` | Reject a concession |
| POST | `/api/admin/fees/concessions/{id}/revoke` | `FeeConcessionController` | `fee.manage` | Revoke an applied concession |
| GET | `/api/admin/fees/concessions/student/{userId}` | `FeeConcessionController` | `fee.view` | List concessions for a student |
| POST | `/api/admin/fees/credit-notes` | `CreditNoteController` | `fee.manage` | Create credit note request |
| GET | `/api/admin/fees/credit-notes/pending` | `CreditNoteController` | `fee.approve_concession` | List pending credit note approvals |
| POST | `/api/admin/fees/credit-notes/{id}/approve` | `CreditNoteController` | `fee.approve_concession` | Approve credit note |
| POST | `/api/admin/fees/credit-notes/{id}/reject` | `CreditNoteController` | `fee.approve_concession` | Reject credit note |
| GET | `/api/admin/fees/revenue-foregone` | `RevenueForegoneController` | `fee.view` | Revenue foregone report |
| GET | `/api/admin/fees/reconciliation/export` | `ReconciliationExportController` | `fee.view` | Download CSV/Excel export |

### 8.2 New Capability Codes

| Code | Group | Display Name |
|---|---|---|
| `fee.approve_concession` | fee | Approve/Reject Concessions & Credit Notes |

### 8.3 Namespace Convention

All controllers follow Pattern B:

```
Http/TenantAdminDashboard/Fee/Controllers/ConcessionTypeController.php
Http/TenantAdminDashboard/Fee/Controllers/FeeConcessionController.php
Http/TenantAdminDashboard/Fee/Controllers/CreditNoteController.php
Http/TenantAdminDashboard/Fee/Controllers/RevenueForegoneController.php
Http/TenantAdminDashboard/Fee/Controllers/ReconciliationExportController.php
```

---

## 9. Frontend Changes

### 9.1 Concession Application Screen

**Route:** `/admin/fees/students/{userId}/concessions/new`

**Purpose:** Staff applies a concession to a student's installment order.

**Layout:**
- Student header: name, branch, enrollment summary
- Order selector: dropdown of active installment orders for this student
- When order is selected: show all steps with current amounts, payment status, due dates
- Concession form:
  - Type: dropdown from concession types API
  - Method: Percentage / Flat Amount / Full Waiver
  - Value: input field (percentage or amount, hidden for full waiver)
  - Reason: required text field
- Preview: before submission, show which steps will be affected and by how much
- Submit: creates concession (may auto-approve or go to approval queue)

### 9.2 Concession Approval Queue

**Route:** `/admin/fees/concessions/pending`

**Purpose:** Managers/owners review and approve/reject pending concessions.

**Layout:**
- Table: Student, Order, Type, Method, Amount (₹ total reduction), Requested By, Date, Status
- Filter: by concession type, by branch
- Actions: Approve / Reject per row
- Reject requires reason (modal)
- Badge count on sidebar navigation item

### 9.3 Credit Note Management

**Route:** `/admin/fees/credit-notes`

**Purpose:** Create, review, and approve credit notes.

**Layout:**
- "Create Credit Note" button → form with order selector, step selector (optional), amount, reason
- Pending approvals table (same pattern as concession approval)
- History table: all approved/rejected credit notes

### 9.4 Revenue Foregone Report

**Route:** `/admin/fees/reports/revenue-foregone`

**Purpose:** Institution owner sees how much revenue has been waived/adjusted.

**Layout:**
- Summary cards: Total concessions, Total credit notes, Grand total
- Breakdown by concession type (bar chart or table)
- Breakdown by branch (if branches exist)
- Monthly trend (line chart)
- Top 10 largest concessions (table)
- Filter: date range, branch

### 9.5 Reconciliation Export

**Route:** Component on `/admin/fees/transactions` page

**Purpose:** Download payment data for bank statement matching.

**Layout:**
- Date range picker
- Branch filter (optional)
- Format selector: CSV / Excel
- "Export" button → triggers download

### 9.6 Student Fee Ledger Enhancement (from Phase 20A)

Add to the existing student fee ledger screen:
- Concession history section: list of all concessions applied to this student (type, amount, status, date)
- Credit note history section: list of all credit notes
- "Apply Concession" button (navigates to concession application screen)

---

## 10. Notification Integration

| Notification | Trigger | Channels | Recipients |
|---|---|---|---|
| `ConcessionPendingApproval` | `ConcessionRequested` event | in-app | Users with `fee.approve_concession` capability in the branch |
| `ConcessionApproved` | `ConcessionApproved` / `ConcessionAutoApproved` event | in-app | Staff who created the concession + the student |
| `ConcessionRejected` | `ConcessionRejected` event | in-app | Staff who created the concession |
| `ConcessionRevoked` | `ConcessionRevoked` event | in-app + email | The student (their fees just increased) |
| `CreditNotePendingApproval` | `CreditNoteRequested` event | in-app | Users with `fee.approve_concession` capability |
| `CreditNoteApproved` | `CreditNoteApproved` event | in-app | Staff who created the credit note |

---

## 11. Implementation Sequence

| Step | Component | Depends On | Estimated Effort |
|---|---|---|---|
| 1 | `concession_types` table + seed data | None | 0.5 day |
| 2 | `fee_concessions` + `fee_concession_step_adjustments` tables | None | 0.5 day |
| 3 | `credit_notes` table + `credit_note_number_sequences` table | None | 0.5 day |
| 4 | Tenant settings keys for approval thresholds | None | 0.25 day |
| 5 | Domain layer: entities, value objects, events, repository interfaces | Steps 1-3 | 1.5 days |
| 6 | Infrastructure layer: models, repositories, credit note number generator | Step 5 | 1 day |
| 7 | `CreateConcessionUseCase` + `ApplyConcessionUseCase` | Steps 5-6 | 1.5 days |
| 8 | `ApproveConcessionUseCase` + `RejectConcessionUseCase` | Step 7 | 0.5 day |
| 9 | `RevokeConcessionUseCase` | Step 7 | 0.5 day |
| 10 | `CreateCreditNoteUseCase` + `ApproveCreditNoteUseCase` + `RejectCreditNoteUseCase` | Steps 5-6 | 1 day |
| 11 | `GetRevenueForegoneReportQuery` | Steps 7-10 | 0.5 day |
| 12 | `ExportReconciliationDataUseCase` | Phase 20A branch filtering | 1 day |
| 13 | HTTP layer: controllers, FormRequests, Resources, routes | Steps 7-12 | 1.5 days |
| 14 | Capability seeding (`fee.approve_concession`) | None | 0.25 day |
| 15 | Notification listeners | Steps 7-10, Phase 14 | 0.5 day |
| 16 | Frontend: concession application + preview | Step 13 | 1.5 days |
| 17 | Frontend: concession approval queue | Step 13 | 1 day |
| 18 | Frontend: credit note management | Step 13 | 1 day |
| 19 | Frontend: revenue foregone report | Step 13 | 1 day |
| 20 | Frontend: reconciliation export | Step 13 | 0.5 day |
| 21 | Frontend: student ledger concession/credit note sections | Step 13 | 0.5 day |
| 22 | Tests | All steps | 2 days |

**Total estimated effort: ~16 days**

---

## 12. Test Plan

### Unit Tests

| Test File | What It Tests |
|---|---|
| `ConcessionMethodTest` | Enum values, factory method |
| `ConcessionStatusTest` | State machine transitions, `canTransitionTo()` |
| `CreditNoteStatusTest` | State machine transitions |
| `CreditNoteNumberTest` | Format validation, financial year parsing |
| `FeeConcessionEntityTest` | Construction, approval, rejection, revocation, `calculateReduction()`, domain invariants (percentage bounds, flat > 0, no step below paid) |
| `CreditNoteEntityTest` | Construction, approval, rejection, amount cannot exceed balance |
| `CreateConcessionUseCaseTest` | Auto-approve path (below threshold), pending path (above threshold), owner-required path, invalid order, zero reduction |
| `ApplyConcessionUseCaseTest` | Percentage application, flat application, full waiver, multiple steps, step with partial payment, concurrent lock |
| `RevokeConcessionUseCaseTest` | Reversal of step adjustments, concession not applied (reject), already revoked |
| `CreateCreditNoteUseCaseTest` | Happy path, amount exceeds balance, gapless number generation |
| `ApproveCreditNoteUseCaseTest` | Happy path, insufficient authority, already approved |

### Feature Tests

| Test File | What It Tests |
|---|---|
| `ConcessionTypeEndpointTest` | CRUD on tenant types, platform types immutable, listing combines both |
| `ConcessionCreateFlowTest` | Create → auto-approve (below threshold) → steps adjusted |
| `ConcessionApprovalFlowTest` | Create → pending → approve → steps adjusted |
| `ConcessionRejectionTest` | Create → pending → reject → steps unchanged |
| `ConcessionRevocationTest` | Applied concession → revoke → steps restored to original amounts |
| `ConcessionAuthorizationTest` | Staff below required hierarchy → 403 on approval |
| `ConcessionIdempotencyTest` | Duplicate idempotency key → 409 conflict |
| `CreditNoteFlowTest` | Create → pending → approve → step amount reduced |
| `CreditNoteRejectTest` | Create → pending → reject → step unchanged |
| `CreditNoteNumberSequenceTest` | Gapless sequential numbering under concurrent creation |
| `RevenueForegoneReportTest` | Correct aggregation by type, branch, month |
| `ReconciliationExportTest` | CSV download with correct columns, date filtering, branch filtering |
| `ConcessionOnPartiallyPaidStepTest` | Concession cannot reduce step below `paid_amount_cents` |

**Minimum expected test count: 35-45 new tests.**

---

## 13. Quality Gate — Phase 20B Complete

### Security & Financial Safety Gates (BLOCKING)

- [ ] Concession cannot reduce any step's `amount_cents` below `paid_amount_cents`
- [ ] Approval routing respects hierarchy: auto-approve below threshold, manager above, owner above owner-threshold
- [ ] Credit notes always require manager approval (no auto-approve path)
- [ ] Credit note numbers are gapless within financial year per tenant
- [ ] Platform-defined concession types cannot be edited or deleted by tenants
- [ ] Revocation correctly reverses all step adjustments (using stored `fee_concession_step_adjustments`)
- [ ] Pessimistic locking on `installment_order_payments` during concession application and revocation
- [ ] Idempotency key prevents duplicate concession creation
- [ ] All new tables with `tenant_id` have `BelongsToTenant` global scope (except `concession_types` — documented exception)
- [ ] Audit logs written outside transactions
- [ ] Domain events dispatched outside transactions
- [ ] Concession `total_reduction_cents` is computed and stored at creation time — not recalculated on approval

### Functional Gates (BLOCKING)

- [ ] Percentage concession correctly reduces all unpaid steps proportionally
- [ ] Flat concession distributes reduction across steps in due-date order
- [ ] Full waiver reduces all unpaid steps to zero (or to `paid_amount_cents` if partially paid)
- [ ] Auto-approve path: concession below threshold → immediately applied → steps adjusted
- [ ] Manual approve path: concession above threshold → pending → approve → applied → steps adjusted
- [ ] Rejection: pending concession → rejected → no step changes
- [ ] Revocation: applied concession → revoked → steps restored to pre-concession amounts
- [ ] Credit note reduces targeted step or distributes across order
- [ ] Revenue foregone report shows correct totals by type, branch, month
- [ ] Reconciliation export contains all payment transactions with correct columns
- [ ] Student fee ledger shows concession and credit note history

### Architecture Gates (BLOCKING)

- [ ] PHPStan Level 5: zero new errors
- [ ] All tests pass (zero regression)
- [ ] Domain layer has zero `Illuminate` imports in new files
- [ ] Controllers < 20 lines per method
- [ ] `ClockInterface` used for all time operations
- [ ] `_cents` suffix on all monetary columns (except `concession_percentage`)
- [ ] Soft deletes on `fee_concessions`
- [ ] HTTP namespace follows Pattern B
- [ ] `env()` check: zero results in `app/`, `routes/`, `database/`

---

## 14. Implementation Plan Format

Same format as Phase 20A:

| # | Section | Description |
|---|---|---|
| 1 | Executive Summary | What gets built, what does NOT |
| 2 | Prerequisite Verification | Verify Phase 20A completion: partial payments, approval workflow, branch filtering, `installment_order_payments` schema |
| 3 | Gap Analysis | Verify actual schema of pricing tables (`tickets`, `special_offers`), existing `student_invoices` columns |
| 4 | Architecture Decisions | Any deviations from this spec |
| 5 | Migration Plan | All new tables with exact schema |
| 6 | Domain Layer | Entities, value objects, events, exceptions, repository interfaces |
| 7 | Application Layer | UseCases, queries, DTOs, event listeners |
| 8 | Infrastructure Layer | Eloquent models, repositories, number generator |
| 9 | HTTP Layer | Controllers, FormRequests, Resources, route files |
| 10 | Frontend Changes | Every new page, component, and modified component |
| 11 | Notification Integration | Listener wiring, channel routing |
| 12 | Implementation Sequence | Ordered steps with dependencies |
| 13 | Test Plan | Every test file with description |
| 14 | Quality Gate Verification | Checklist from §13 |
| 15 | Risk Register | Identified risks with severity and mitigation |
| 16 | File Manifest | Every new and modified file |

---

## 15. Constraints & Reminders

### Architecture Constraints

- Concessions and credit notes live in the **Fee** bounded context. They do NOT modify the Pricing context (`TicketEntity`, `SpecialOffer`, `CalculatePriceUseCase`).
- `ConcessionTypeRecord` does NOT use `BelongsToTenant` because platform-defined types have `NULL` tenant_id. Document this clearly.
- The `ApplyConcessionUseCase` modifies `installment_order_payments.amount_cents` (Installment context). This cross-context mutation is acceptable as UseCase-level orchestration.
- Credit note numbering uses a SEPARATE sequence from invoice numbering. Do NOT share the `invoice_number_sequences` table.

### Docker Environment

- Container: Alpine Linux — use `sh` not `bash`
- Container name: `ubotz_backend`
- Database: `ubotz_mysql`

### What NOT to Do

- Do NOT retroactively adjust already-paid installments. Concessions reduce **future** obligations only.
- Do NOT allow a step's `amount_cents` to go below `paid_amount_cents` after concession. This is a hard domain invariant.
- Do NOT allow tenant admins to edit or delete platform-defined concession types.
- Do NOT auto-approve credit notes. They always require manual approval.
- Do NOT make credit notes editable after approval. They are immutable (same principle as invoices from Phase 12C).
- Do NOT use ENUM columns. Use VARCHAR with PHP enum validation.
- Do NOT dispatch events inside database transactions.
- Do NOT write audit logs inside database transactions.
- Do NOT use `now()` in domain or application layer.
- Do NOT use DECIMAL or FLOAT for monetary storage (exception: `concession_percentage` is a configuration value, not stored money).
- Do NOT skip the `fee_concession_step_adjustments` table. Without it, revocation requires recalculation which is error-prone and breaks if the concession percentage changed.
- Do NOT combine concession approval and credit note approval into a single capability code. They use the same code (`fee.approve_concession`) in this phase for simplicity, but the approval logic differs (threshold-based vs. always-required).

---

## 16. Risk Register

| Risk | Severity | Likelihood | Mitigation |
|---|---|---|---|
| Concession applied to a step that becomes overdue between approval and application | Medium | Low | `ApplyConcessionUseCase` re-validates step status at application time. If step is now paid/overdue, skip it and recalculate total reduction. |
| Multiple concessions applied to same order create compounding reductions | Medium | Medium | Each concession calculates reduction against the CURRENT step amounts (which already reflect prior concessions). Total across all concessions is naturally bounded by step amounts. |
| Revocation after partial payment on reduced step | High | Low | Revocation restores `amount_cents` to pre-concession value. If `paid_amount_cents` is now less than restored amount, the step becomes unpaid/overdue — which is correct behavior. |
| `ConcessionTypeRecord` without `BelongsToTenant` leaks platform types to wrong tenants | Low | Low | Platform types are intentionally visible to all tenants. Tenant-custom types are filtered by `tenant_id`. Query service handles the union explicitly. |
| Credit note number sequence conflicts with invoice number sequence | Low | Low | Separate sequence tables (Option B). No shared state. |
| Large reconciliation export causes timeout or memory exhaustion | Medium | Medium | Use streaming CSV writer. Set `set_time_limit()` for export endpoint. Paginate database reads (1000 records per batch). |
| Concession percentage rounding loses cents | Low | High | Use `floor()` for reductions (institution keeps the rounding). Document that ₹333.33 on a ₹1,000 step at 33.33% is rounded down to ₹333. |

---

## 17. Definition of Done

Phase 20B is complete when:

1. The implementation plan has been reviewed and approved by the Principal Engineer.
2. All code is implemented per the approved plan.
3. All quality gates in §13 pass.
4. A Principal Engineer audit confirms zero critical or high findings.
5. All findings from audit are resolved.
6. Concession flow demonstrated: create percentage concession → auto-approve → steps reduced → student ledger updated.
7. Concession approval flow demonstrated: create large concession → pending → manager approves → steps reduced.
8. Concession revocation demonstrated: revoke applied concession → steps restored → student sees original amounts.
9. Credit note flow demonstrated: create → pending → approve → step adjusted → credit note number generated.
10. Revenue foregone report shows correct totals by type and branch.
11. Reconciliation export downloads correctly formatted CSV with all payment data.
12. The Phase 20B Completion Report is signed off.

---

> **Discounts before enrollment are marketing. Adjustments after enrollment are governance. Phase 20B ensures that every rupee the institution decides not to collect is recorded, approved, and reportable — because the difference between a scholarship and a leak is a paper trail.**

*End of Document — UBOTZ 2.0 Phase 20B Developer Instructions — March 26, 2026*
