# UBOTZ 2.0 Payment Technical Specification

## Core Architecture
The Payment module is the most technically critical bounded context (`TenantAdminDashboard\Payment`). It manages high-stakes external gateway integrations while ensuring rigorous multi-tenant data isolation and financial integrity.

## Relational Schema Constraints

### 1. Order Layer
- **`student_orders`**: The central transactional ledger record.
  - **`total_amount_cents`**: Stored as an integer (cents) to avoid floating-point rounding errors.
  - **`stripe_payment_intent_id`**: Stores the unique identifier from the external gateway for cross-referencing.
  - **`idempotency_key`**: Bound unique index `idx_student_orders_idempotency` prevents duplicate order instantiation.

### 2. Gateway Settings
- **`tenant_stripe_settings`**: Stores encrypted gateway credentials (`secret_key_encrypted`, `webhook_secret_encrypted`). These are encrypted at rest using the platform's `APP_KEY`.

### 3. Event Logging & Safety
- **`student_payment_events`**: Immutable log of every raw payload received from Stripe/Razorpay (`payload` JSON). This allows for post-facto re-processing or auditing if a webhook handler fails.
- **`payment_transactions`**: Generic ledger table used for non-order-based movements or historical reconciliation.

## Key Technical Workflows

### The Webhook Pipeline
1. `WebhookController` receives a raw POST body from Stripe.
2. The signature is verified using the tenant's `webhook_secret_encrypted`.
3. The event is persisted to `student_payment_events`.
4. A background `ProcessStripeEventJob` is dispatched.
5. The job resolves the `student_order` via the `payment_intent_id` and executes the `MarkOrderAsPaidUseCase`.

### Refund Execution
- **`student_refunds`**: When a refund is requested, the system makes a synchronous API call to the gateway.
- If the gateway returns success, the status shifts to `succeeded` and the parent order is flagged as `refunded`.

## Tenancy & Security
- **Encryption**: sensitive keys are never stored in plaintext (`text` column type, encrypted using Laravel's base encrypter).
- **Isolation**: Tenant A's webhook endpoint cannot be spoofed to mark Tenant B's orders as paid, as the `webhook_secret` is resolved per-tenant.
- **Auditing**: `payment_attempt_count` and `failed_at` columns provide defensive diagnostics for troubleshooting checkout failures.

---

## Linked References
- Status report: `../../status reports/Payment_Status_Report.md`
- Related Modules: `Fee`, `Installment`, `Enrollment`.
