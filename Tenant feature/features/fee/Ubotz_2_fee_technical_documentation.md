# UBOTZ 2.0 Fee Technical Specification

Student **fee** operations cover ledgers, transactions, **offline payments**, **concessions**, **credit notes**, **late fees**, and reporting. Application code lives under `App\Application\TenantAdminDashboard\Fee`; HTTP controllers under `App\Http\TenantAdminDashboard\Fee` (and payment verification under `Payment`).

---

## 1. HTTP surface (tenant API)

Routes: `backend/routes/tenant_dashboard/fees.php` plus **student payment** routes in `backend/routes/tenant_dashboard/student_payments.php`. All fee-related admin routes require **`tenant.module:module.lms`**.

### 1.1 Capabilities (from `fees.php`)

| Capability | Examples |
|------------|----------|
| **`fee.record_payment`** | `POST /fees/offline-payment` |
| **`fee.view`** | `GET /fees/ledger`, `GET /fees/students/{userId}`, `GET /fees/aging-report`, `GET /fees/financial-health`, `GET /fees/collection-trend`, `GET /fees/transactions`, receipts, `GET /fees/concession-types`, concessions by student, credit notes list, revenue foregone, reconciliation export |
| **`fee.approve_payment`** | Pending offline verification: `GET /payments/pending-verification`, `POST /payments/{id}/approve`, `reject` |
| **`fee.manage`** | Late fee waive, CRUD-ish concession types, concession preview/create/revoke, create credit notes |
| **`fee.approve_concession`** | Pending concessions & credit notes approve/reject |

Exact paths are under **`/api/tenant`** (e.g. `/api/tenant/fees/ledger`, `/api/tenant/payments/pending-verification`).

### 1.2 Student-facing payments (`student_payments.php`)

Under **`tenant.module:module.lms`**, prefix **`/api/tenant/student/payments`**:

- Course purchase: `POST …/course-purchase/initiate`, `verify`
- Installment step: `POST …/installment-step/initiate`, `verify`
- My fees: `GET …/fees/summary`, `installments`, `transactions`, receipt

**Frontend:** `frontend/config/api-endpoints.ts` — extensive `TENANT_FEES_*` and student payment keys.

---

## 2. Schema (selected tenant migrations)

Representative tables (not exhaustive — grep `backend/database/migrations/tenant` for `fee`, `payment`, `transaction`):

- **`fee_concessions`**, **`fee_concession_step_adjustments`**, **`concession_types`** — `2026_03_27_100002_*`, `2026_03_27_100003_*`
- **`late_fee_charges`** — `2026_03_26_200006_create_late_fee_charges_table.php`
- **`installment_plans`** late-fee columns — `2026_03_26_200007_add_late_fee_config_to_installment_plans.php`
- **`branch_id`** on fee-related entities — `2026_03_26_200003_backfill_branch_id_on_fee_tables.php`
- **`payment_transactions`** extensions — `2026_03_21_100001_extend_payment_transactions_for_student_fees.php`

---

## 3. Application use cases (selected)

| Use case | Role |
|----------|------|
| **`RecordOfflineFeePaymentUseCase`** | Offline fee intake |
| **`ApplyConcessionUseCase`**, **`PreviewFeeConcessionReductionUseCase`**, **`CreateConcessionUseCase`**, approve/reject/revoke flows | Concessions |
| **`CalculateLateFeeUseCase`**, **`WaiveLateFeeUseCase`** | Late fees |
| **`DetectOverdueInstallmentPaymentsUseCase`** | Invokes **`CalculateLateFeeUseCase`** for overdue steps |
| **`InitiateCoursePurchaseUseCase`**, **`VerifyCoursePurchaseUseCase`** | Student course checkout |
| **`InitiateInstallmentStepPurchaseUseCase`**, **`VerifyInstallmentStepPurchaseUseCase`** | Installment step payments |
| **`EnforceFeeOverdueSuspensionUseCase`** | Enrollment suspension when configured |
| **`DownloadAdminFeeReceiptUseCase`**, **`DownloadStudentFeeReceiptUseCase`** | Receipts |
| Reporting queries: **`GetAgingReportQuery`**, **`GetFinancialHealthQuery`**, **`GetCollectionTrendQuery`**, **`GetRevenueForegoneReportQuery`**, **`ExportReconciliationDataUseCase`** | Analytics |

Event listeners (`OnConcessionApproved`, `OnLateFeeCharged`, etc.) wire domain events to notifications/audit — see `App\Application\TenantAdminDashboard\Fee\Listeners`.

---

## 4. Tenancy

All queries must respect **`tenant_id`**; **`branch_id`** supports branch-scoped reporting where populated.

---

## 5. Linked code references

| Layer | Path |
|-------|------|
| Application | `backend/app/Application/TenantAdminDashboard/Fee/` |
| HTTP | `backend/app/Http/TenantAdminDashboard/Fee/` |
| Routes | `backend/routes/tenant_dashboard/fees.php`, `student_payments.php` |

---

## 6. Document history

- Replaced unverified names (**`CalculateFeeConcessionUseCase`**, **`ApplyLateFeesJob`**) with **actual** use cases and **route/capability** matrix from `fees.php`.
