# UBOTZ 2.0 — Payment — Business Findings

## Executive summary

**Tenant-side payments** cover multiple products: marketing **course checkout** (hosted payment link flow), **student fee** collection and verification, **installments**, and **invoices/receipts**. This feature folder’s technical doc focuses on the **LMS checkout + webhook + student invoice** routes; day-to-day fee operations are documented under **Fee** / **Installment** as appropriate.

## What institutions configure

- **Tenant (student/course) money** — Schools connect their own **Razorpay** (and related) credentials in tenant payment settings so revenue goes to the institution. This is separate from **UBOTZ platform** subscription billing.
- **Checkout** — A learner initiates purchase; the system creates a payment transaction and returns a provider checkout URL. Final success is confirmed via **webhooks**, not by staff clicking “paid.”

## Operational expectations

- **Idempotency and retries** — Webhook handlers should tolerate duplicate delivery; the implementation marks transactions paid only when consistent with current state.
- **Invoices** — Students (or staff, depending on product rules) can retrieve invoice metadata and downloads where implemented.
- **Refunds and disputes** — May live in other modules or admin tools; this summary does not replace tracing refund use cases in code.

## Separation of concerns

- **Platform billing** (tenant pays UBOTZ) uses **platform** settings and APIs.
- **Tenant billing** (student pays school) uses **tenant** settings, fees, and payment transactions scoped by tenant.

---

## Linked references

- **Pricing** — tickets and special offers before checkout
- **Fee** — offline payments and approvals
- **Enrollment** — fulfillment after payment
