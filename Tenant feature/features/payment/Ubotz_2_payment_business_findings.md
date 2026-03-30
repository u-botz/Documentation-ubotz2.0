# UBOTZ 2.0 Payment Business Findings

## Executive Summary
The Payment module is the central financial engine of the Ubotz 2.0 platform. It facilitates the conversion of student liabilities (fees/installments) into actual revenue through automated gateway integrations. It manages the entire transactional lifecycle, from checkout initialization to reconciliation, refunding, and localized tax (VAT) accounting.

## Operational Modalities

### 1. The Unified Student Order System
Every transaction starts as a **Student Order**. An order acts as the formal "invoice" for a student's commercial commitment.
- **Order Types**: `course`, `bundle`, or `installment`.
- **Status Lifecycle**: `pending_payment` $\rightarrow$ `paid` / `failed` / `refunded`.
- **Taxation (VAT)**: Orders calculate `vat_rate_percentage` and `vat_amount_cents` based on the tenant's localized configuration (e.g. 5% VAT in GCC regions).

### 2. Multi-Gateway Integration (Stripe & Razorpay)
The platform is architected to support multiple payment processors based on the tenant's region:
- **Stripe**: Primary international gateway. Each tenant can link their own `Stripe Connect` account using `tenant_stripe_settings`.
- **Razorpay**: regional alternative commonly used in India.
- **Idempotency**: All orders enforce a unique `idempotency_key` to prevent duplicate charges in high-velocity mobile or web checkouts.

### 3. Automated Reconciliation (Webhooks)
Payments are not manually marked "paid" by staff.
- The system listens for **Student Payment Events** (e.g., `payment_intent.succeeded`).
- Upon verification of the signature, the `HandleStripeWebhookJob` automatically updates the corresponding `student_order` and marks it as `paid`. 
- This then triggers downstream events to unlock the student's `Enrollment`.

### 4. Refund Management
Administrators can initiate partial or full refunds directly from the dashboard.
- **`student_refunds`**: Tracks the audit trail of the refund, including the `initiated_by` user, the `reason`, and the final gateway-confirmed status (`succeeded`).

## Commercial Trust & Receipts
- Upon successful payment (`paid_at`), the system generates a formal `receipt_pdf_path` which is stored in the File Manager and emailed to the student. This satisfies legal requirements for B2B/B2C transactions in regulated markets.

---

## Linked References
- Status report: `../../status reports/Payment_Status_Report.md`
- Related Modules: `Fee`, `Installment`, `Enrollment`.
