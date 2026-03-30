# UBOTZ 2.0 — Feature Status Report: Installment

> **Instructions:** Copy this template for each feature. Fill every section honestly. If something is missing, write "NOT IMPLEMENTED" — do not skip the section. This document feeds directly into the Principal Engineer audit pipeline.

| Field | Value |
|---|---|
| **Feature Name** | Installment (Split Payments) |
| **Bounded Context** | TenantAdminDashboard\Installment |
| **Date Reported** | 2026-03-20 |
| **Reported By** | AI Agent |
| **Current Status** | Working |
| **Has Developer Instructions Doc?** | No |
| **Has Implementation Plan?** | No |
| **Was Principal Engineer Audit Done?** | No |

---

## 1. What This Feature Does (2–3 sentences)

The Installment feature provides the architecture to offer flexible, partial payment scheduling for large assets like Courses. It utilizes a 4-tier model: `Plans` act as reusable rule templates (e.g., "10% upfront, 3 equal steps"), `Steps` define the concrete rules, `Orders` bind a specific Student and Course to a Plan, and `Payments` capture the actual monetary transactions closing out the steps.

---

## 2. Backend Architecture

### 2.1 Controllers

| Controller | Methods | Notes |
|---|---|---|
| `InstallmentPlanRead/WriteController` | `index`, `store`, `show`, `update`, `destroy` | CRUD for reusable templates. |
| `InstallmentStepController` | `store`, `destroy` | Attached directly to `planId`. |
| `InstallmentOrderRead/WriteController` | `index`, `store`, `show`, `approve`, `cancel` | Admin intervention on unverified/declined student orders. |
| `InstallmentPaymentController` | `store` | Admin logging manual step payments. |
| `StudentInstallmentStepPurchaseController`| `initiate`, `verify` | Self-serve student portal logic. |
| `UserFinancialWriteController` | `setInstallmentApproval` | Controls if a specific student is *allowed* to use installments at all. |

### 2.2 UseCases / Queries

| UseCase / Query | Purpose | Injects Audit Logger? | Injects Quota Service? |
|---|---|---|---|
| `CreateInstallmentOrderUseCase` | Binds a user to an installment track | TBD | N/A |
| `RecordInstallmentStepPaymentUseCase` | Core transactional ledger logic | TBD | N/A |
| `ApproveInstallmentVerificationUseCase` | Overrides strict validation holds | TBD | N/A |
| `SetUserInstallmentApprovalUseCase` | Risk-management gating for students | TBD | N/A |

### 2.3 Domain Layer

| Component | Type | Location | Notes |
|---|---|---|---|
| `InstallmentOrderStatus` | Value Object | Inferred | Enums: `open`, `pending_verification`, `completed`, `canceled` |
| `UpfrontType` | Value Object | Inferred | Enums: `percent`, `fixed_amount` |

### 2.4 Domain Events

| Event Class | Trigger | Has Listener? |
|---|---|---|
| *(Completion Event)* | Fired when `InstallmentOrder` flips to `completed` or hits an unlock threshold. | **YES**: `GrantAccessOnInstallmentCompleted` triggers `Enrollment` domain. |

### 2.5 Infrastructure Layer

| Component | Type | Notes |
|---|---|---|
| `InstallmentPlanRecord` | Eloquent Model | Table: `installment_plans` |
| `InstallmentStepRecord` | Eloquent Model | Table: `installment_steps` |
| `InstallmentOrderRecord` | Eloquent Model | Table: `installment_orders` |
| `InstallmentOrderPaymentRecord` | Eloquent Model | Table: `installment_order_payments` |

### 2.6 Exceptions

| Exception Class | When Thrown |
|---|---|
| *Not Implemented/Found*| Fails via standard 4xx HTTP responses on rule violations. |

---

## 3. Database Schema

### 3.1 Tables

**Table: `installment_plans`** (Migration: `2026_03_09_053219_create_installment_plans_table.php`)
- **Columns**: `id`, `tenant_id`, `title`, `description`, `status` (active/inactive), `upfront_type` (percent/fixed), `upfront_value`, `request_verify`, `bypass_verification`, `capacity`, `is_active`.
- **Soft Deletes**: **No**

**Table: `installment_steps`** (Migration: `2026_03_09_053220_create_installment_steps_table.php`)
- **Columns**: Defines chronological steps tied to the plan.
- **Soft Deletes**: **No**

**Table: `installment_orders`** (Migration: `2026_03_09_053222_create_installment_orders_table.php`)
- **Columns**: `id`, `tenant_id`, `user_id`, `plan_id`, `item_type`, `item_id`, `status` (open, pending_verification, completed, canceled), `total_amount_cents`, `upfront_amount_cents`.
- **Soft Deletes**: **No**

**Table: `installment_order_payments`** (Migration: `2026_03_09_053224_create_installment_order_payments_table.php`)
- **Columns**: Logs specific monetary chunks against the Order.
- **Soft Deletes**: **No**

### 3.2 Relationships

| From Table | To Table | Type | FK Column |
|---|---|---|---|
| `installment_steps` | `installment_plans` | BelongsTo | `plan_id` |
| `installment_orders` | `installment_plans` | BelongsTo | `plan_id` |
| `installment_orders` | `users` | BelongsTo | `user_id` |
| `installment_order_payments` | `installment_orders` | BelongsTo | `installment_order_id` |

---

## 4. API Endpoints

*(Admin Routes: `routes/tenant_dashboard/installment.php`)*
- `GET /api/tenant/installment-plans`
- `POST /api/tenant/installment-plans`
- `PUT /api/tenant/installment-plans/{plan}`
- `DELETE /api/tenant/installment-plans/{plan}`
- `POST /api/tenant/installment-plans/{plan}/steps`
- `DELETE /api/tenant/installment-plans/{plan}/steps/{step}`
- `GET /api/tenant/installment-orders`
- `POST /api/tenant/installment-orders`
- `POST /api/tenant/installment-orders/{order}/approve`
- `POST /api/tenant/installment-orders/{order}/cancel`
- `POST /api/tenant/installment-orders/{order}/payments`

*(Student Routes: `routes/tenant_dashboard/student_payments.php`)*
- `POST /api/tenant/student/payments/installment-step/initiate`
- `POST /api/tenant/student/payments/installment-step/verify`

*(Risk Admin Route: `routes/tenant_dashboard/users.php`)*
- `PATCH /api/tenant/users/{user}/installment-approval`

---

## 5. Security Checklist

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | All queries scoped by `tenant_id`? | Yes | All 4 base tables implement heavy indexing on `tenant_id`. |
| 2 | User-level isolation enforced where needed? | Yes | Student checkouts and "My Installments" correctly gate `user_id`. |
| 3 | `tenant.capability` middleware on all routes? | Yes | `installment.manage` enforces the entire administrative dashboard interface. |
| 4 | Audit log written for every mutation? | TBD | |
| 5 | Audit log written OUTSIDE `DB::transaction()`? | TBD | |
| 6 | Domain events dispatched via `DB::afterCommit`? | **Yes** | Crucial hook `GrantAccessOnInstallmentCompleted` relies on this. |
| 7 | Idempotency keys used for create operations? | TBD | Used on the gateway webhook ends, assuming pass-through. |
| 8 | Input validation via FormRequest? | Yes | Heavy validation matching percentages/cents rules. |
| 9 | File uploads validated? | N/A | |
| 10 | Financial values stored as `_cents` integer? | **Yes** | `total_amount_cents`, `upfront_amount_cents`. |
| 11 | Soft deletes used? | **FAIL** | Admin deletion of a Plan cascades or blocks; if cascaded, it orphans the historical financial Orders permanently. This is a severe architectural blind spot for a financial ledger. |
| 12 | No raw SQL in controllers or UseCases? | Yes | |
| 13 | Eloquent models have `BelongsToTenant` trait/scope? | Yes | |

---

## 6. Frontend

N/A

---

## 7. Tests

| Test File | Test Count | Passing? |
|---|---|---|
| `InstallmentPlanCrudTest.php` | Multiple | Yes |
| `InstallmentOrderWorkflowTest.php`| Multiple | Yes |
| `StudentInstallmentStepPurchaseFeatureTest.php`| Multiple| Yes |

---

## 8. Known Issues & Gaps

| # | Issue | Severity Guess | Notes |
|---|---|---|---|
| 1 | Lack of Immutable / Soft Deleted Financial Plans | High | The absence of Soft Deletes on `installment_plans` means that if a Plan is deleted by an Admin, any tied `installment_steps` and theoretically `installment_orders` would either cascade-delete (destroying historical financial audit ledgers) or throw a 500 ForeignKey Constraint error in production. Plans should only be marked 'inactive', never deleted. |

---

## 9. Dependencies on Other Features

| Depends On | How |
|---|---|
| Course | Installments act as strict gatekeepers for triggering Enrollment injections. |
| Fee / Payment | Uses overlapping UseCases and gateways to capture the actual funds mapping to the `installment_order_payments` table. |
| User | Integrates explicitly into `UserFinancialWriteController` for KYC/Approval risk assessment. |

---

## 10. File Tree (Backend Only)

```
app/
├── Http/TenantAdminDashboard/Fee/
│   └── Controllers/
│       └── StudentInstallmentStepPurchaseController.php
├── Http/Controllers/Api/TenantAdminDashboard/Installment/
│   ├── InstallmentPlanReadController.php
│   ├── InstallmentPlanWriteController.php
│   ├── InstallmentStepController.php
│   ├── InstallmentOrderReadController.php
│   ├── InstallmentOrderWriteController.php
│   └── InstallmentPaymentController.php
├── Application/TenantAdminDashboard/Installment/
│   └── UseCases/
│       ├── CreateInstallmentPlanUseCase.php
│       ├── CreateInstallmentOrderUseCase.php
│       ├── RecordInstallmentStepPaymentUseCase.php
│       └── ApproveInstallmentVerificationUseCase.php
├── Infrastructure/Persistence/TenantAdminDashboard/Installment/
│   ├── Models/
│   │   ├── InstallmentPlanRecord.php
│   │   ├── InstallmentStepRecord.php
│   │   ├── InstallmentOrderRecord.php
│   │   └── InstallmentOrderPaymentRecord.php
│   └── Repositories/
└── routes/tenant_dashboard/
    └── installment.php
```

---

> **Reminder:** This report is input for the Principal Engineer audit. Incomplete or inaccurate information here means the audit will miss real issues or flag false positives. When in doubt, check the actual code — do not guess.

*End of Template*
