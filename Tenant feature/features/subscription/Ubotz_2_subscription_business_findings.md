# UBOTZ 2.0 — Subscription — Business Findings

## Executive summary

In the **tenant** product, **subscription plans** are **institution-defined offers**: duration (**days**), optional **use limits**, and **pricing in cents**, used to package access (for example a “3-month test series pass”). Staff with **`subscription.manage`** maintain the catalog; enrolling a learner onto a plan typically requires **`subscription.enroll`** as well.

## Not platform billing

Do **not** confuse this with the **tenant organization’s own contract** with UBOTZ (plans, invoices, suspension for non-payment). That is **platform** operations and is documented under platform subscription and billing flows.

## Operations

- **Plans** — Create, update, retire, or delete institution offerings subject to business rules in the use cases.
- **Enrollment** — Assign a **student** to a **plan** so entitlements apply for the configured period or usage cap.

## Governance

Capabilities split **who can design plans** from **who can attach students**, reducing accidental mass enrollments by junior staff when policy requires it.

---

## Linked references

- **Payment** — when students pay for a priced plan
- **Users** — who receives the subscription
