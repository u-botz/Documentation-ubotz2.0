# UBOTZ 2.0 — Payment (Tenant LMS checkout) — Technical Specification

## Scope

This document covers the **tenant payment routes** in `backend/routes/tenant_dashboard/payment.php`: course checkout initialization, payment webhooks, and student invoice read/download. It is **not** the full story for **student fee ledgers**, **offline fee verification**, or **platform (UBOTZ) billing**—those live under other route files (see Linked references).

## Route entry point

| File | Module gate |
|------|-------------|
| `backend/routes/tenant_dashboard/payment.php` | `tenant.module:module.lms` |

Effective base: **`/api/tenant`** (included from `backend/routes/api.php` in the tenant route group).

| Method | Path | Auth | Handler |
|--------|------|------|---------|
| `POST` | `/checkout/course` | Same as other `/api/tenant` routes (`tenant.resolve.token`, `auth:tenant_api`, …) | `CheckoutController::initializeCourseCheckout` |
| `GET` | `/student-invoices/{id}` | same | `StudentInvoiceReadController::show` |
| `GET` | `/student-invoices/{id}/download` | same | `StudentInvoiceReadController::download` |
| `POST` | `/webhooks/payment` | *(none — verify in use case)* | `CheckoutController::handleWebhook` |

Checkout and student invoices **do not** add a separate guard in this file; they use the **standard tenant JWT pipeline** from [`backend/routes/api.php`](../../../../backend/routes/api.php) (`auth:tenant_api`, etc.). Clients should send the same **tenant API** Bearer token as for other tenant dashboard calls.

## Application layer

| Component | Role |
|-----------|------|
| `InitializeCheckoutUseCase` | Creates a `PaymentTransaction` (gateway name **`razorpay`** in current code), persists via `PaymentTransactionRepositoryInterface`, returns URL from `PaymentGatewayInterface::generateCheckoutUrl` |
| `ProcessPaymentWebhookUseCase` | Verifies signature via gateway (`X-Razorpay-Signature`), resolves transaction, idempotent paid handling, dispatches `PaymentCompleted` |
| `GetStudentInvoiceQuery` | Backs invoice JSON |
| `StudentInvoicePdfGeneratorInterface` | PDF for download |

Webhook verification and payload parsing are **Razorpay-oriented** in `CheckoutController` / `ProcessPaymentWebhookUseCase` (not Stripe-specific).

## Persistence (tenant — representative)

| Artifact | Notes |
|----------|--------|
| `payment_transactions` | Base: `2026_03_05_120000_create_payment_transactions_table.php` — `tenant_id`, `user_id`, `item_type` / `item_id`, `amount_cents`, `currency`, `status`, `gateway_name`, `gateway_transaction_id`, `paid_at`; extended by fee/Razorpay migrations (e.g. `2026_03_21_100001_extend_payment_transactions_for_student_fees.php`) |
| `tenant_payment_configs` | Per-tenant Razorpay keys (encrypted columns) — `2026_03_21_100000_create_tenant_payment_configs_table.php` |
| `student_orders` / `tenant_stripe_settings` | Introduced in broader **student billing** migrations (e.g. `2026_03_29_120000_g2_student_billing_tables.php`) — used by other flows; do not assume every checkout path writes here without tracing the use case |

## Related tenant payment surfaces (other files)

- **Fees / offline approval:** `routes/tenant_dashboard/fees.php` — `/api/tenant/fees/offline-payment`, `/api/tenant/payments/pending-verification`, approve/reject
- **Student-initiated Razorpay flows:** `routes/tenant_dashboard/student_payments.php`
- **Payment settings UI:** `routes/tenant_dashboard/settings.php` — `/api/tenant/settings/student-payment` (+ verify)

## Frontend

- `frontend/services/tenant-payment-service.ts` posts to **`/checkout/course`** (ensure API base URL includes `/api/tenant` if that is how the client is configured)

---

## Document history

- **2026-03-31:** Aligned payment routes with global `auth:tenant_api` stack (removed invalid `auth:api` / `resolve.tenant` inner group).

## Linked references

- **Fees** — ledger, concessions, offline recording
- **Installment** — installment order payments
- **Enrollment** — access after successful payment events
- **CLAUDE.md** — platform Razorpay vs tenant student payment configuration
