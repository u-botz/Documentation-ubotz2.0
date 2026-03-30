# UBOTZ 2.0 Installment Business Findings

## Executive Summary

**Installment plans** split a **tuition or fee** into an **upfront** portion and **scheduled steps** (amount/percent and due offsets). An **installment order** binds a **student** to a plan for a specific **item** (typically a course). **Payments** are recorded per step; **verification** and **approval** flows exist for tenants that require manual checks before access.

**Fee** and **enrollment** modules integrate with installments (e.g. overdue detection, suspension, student checkout). **`branch_id`** on orders supports multi-site reporting.

---

## Operations

- **Plan design:** Upfront type/value, steps, capacity, optional late-fee settings on plans (see technical migrations).
- **Order lifecycle:** Create → optional **pending verification** → **approve** / **cancel**; **payments** posted against steps.
- **Student checkout:** Gateway initiate/verify endpoints under **student payments** complement admin APIs.

---

## Linked references

- **Technical specification:** `Ubotz_2_installment_technical_documentation.md`.
- **Related:** Fee module, student payments, enrollment, courses/batches default plans.
