# UBOTZ 2.0 Installment Technical Specification

**Installment plans** define how a student pays for a **course** (or other billable item) over time; **installment orders** instantiate a plan for a user; **installment order payments** track per-step dues and settlement. Application code: `App\Application\TenantAdminDashboard\Installment`.

---

## 1. HTTP surface (tenant API)

Routes: `backend/routes/tenant_dashboard/installment.php` under **`/api/tenant`**.

| Group | Prefix | Capability |
|-------|--------|------------|
| Plans | `installment-plans` | **`installment.manage`** (all endpoints) |
| Orders | `installment-orders` | **`installment.manage`** |

### 1.1 Plans

| Method | Path |
|--------|------|
| `GET`, `POST` | `/installment-plans` |
| `GET`, `PUT`, `DELETE` | `/installment-plans/{plan}` |
| `POST`, `DELETE` | `/installment-plans/{plan}/steps`, `/installment-plans/{plan}/steps/{step}` |

### 1.2 Orders

| Method | Path |
|--------|------|
| `GET`, `POST` | `/installment-orders` |
| `GET` | `/installment-orders/{order}` |
| `POST` | `/installment-orders/{order}/approve`, `/cancel` |
| `POST` | `/installment-orders/{order}/payments` |

**Note:** There is **no** separate read-only capability in this route file — **`installment.manage`** covers all listed routes.

**Student payments:** Installment **step** Razorpay (or similar) flows live under **`/api/tenant/student/payments/installment-step/...`** in `student_payments.php` (see Fee module).

**Frontend:** `frontend/config/api-endpoints.ts` — `TENANT_INSTALLMENT.*` (`PLANS`, `ORDERS`, `ORDER_PAYMENTS`, …).

---

## 2. Relational schema (tenant DB)

### 2.1 `installment_plans`

`2026_03_09_053219_create_installment_plans_table.php`: `tenant_id`, `title`, `description`, `status`, **`upfront_type`** / **`upfront_value`**, `request_verify`, `bypass_verification`, `capacity`, `is_active`.

`2026_03_26_200007_add_late_fee_config_to_installment_plans.php` — late fee configuration on plans.

### 2.2 `installment_steps`

`2026_03_09_053220_create_installment_steps_table.php`: `plan_id`, **`amount_type`** / **`amount_value`**, **`deadline_days`**, `sort_order`.

### 2.3 `installment_orders`

`2026_03_09_053222_create_installment_orders_table.php`: `user_id`, `plan_id`, **`item_type`** / **`item_id`** (polymorphic target), `status`, `total_amount_cents`, `upfront_amount_cents`.

`2026_03_26_200001_add_branch_id_to_installment_orders.php` — **branch** reporting.

### 2.4 `installment_order_payments`

`2026_03_09_053224_create_installment_order_payments_table.php`: `order_id`, `step_id`, `amount_cents`, `due_date`, `status`, `paid_at`.

`2026_03_26_200004_add_partial_payment_to_installment_order_payments.php` — partial payment support.

### 2.5 Defaults on courses/batches

`2026_03_26_200008_add_default_installment_plan_to_courses_and_batches.php` — optional **default plan** on courses and batches.

---

## 3. Application use cases (selected)

| Use case | Role |
|----------|------|
| **`CreateInstallmentPlanUseCase`**, **`UpdateInstallmentPlanUseCase`**, **`DeleteInstallmentPlanUseCase`** | Plan CRUD |
| **`AddInstallmentStepUseCase`**, **`DeleteInstallmentStepUseCase`** | Steps |
| **`CreateInstallmentOrderUseCase`** | Order creation (replaces older “GenerateInstallmentOrder” naming) |
| **`ApproveInstallmentVerificationUseCase`**, **`CancelInstallmentOrderUseCase`** | Order lifecycle |
| **`RecordInstallmentStepPaymentUseCase`** | Payments against order |

Fee domain also includes **`InitiateInstallmentStepPurchaseUseCase`** / **`VerifyInstallmentStepPurchaseUseCase`** for gateway checkout.

---

## 4. Tenancy

All installment entities are **`tenant_id`** scoped; **`branch_id`** on orders supports branch-level finance views.

---

## 5. Linked code references

| Layer | Path |
|-------|------|
| Application | `backend/app/Application/TenantAdminDashboard/Installment/` |
| HTTP | `backend/app/Http/Controllers/Api/TenantAdminDashboard/Installment/` |
| Routes | `backend/routes/tenant_dashboard/installment.php` |

---

## 6. Document history

- Replaced **`GenerateInstallmentOrderUseCase`** / **`UpdateInstallmentOrderPaymentUseCase`** with **`CreateInstallmentOrderUseCase`** / **`RecordInstallmentStepPaymentUseCase`**.
- Documented **actual** routes (`installment-plans`, `installment-orders`) and **`installment.manage`** only.
