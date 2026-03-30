# UBOTZ 2.0 Fee Business Findings

## Executive Summary

The **fee** area covers **what students owe**, how **payments** (online/offline) and **installments** settle those obligations, and how **discounts** (**concessions**) and **credit notes** adjust balances. **Late fees** and **overdue** handling can interact with **installment plans** and **enrollment** access depending on tenant configuration.

Operations are gated by **`module.lms`** and fine-grained capabilities: **`fee.view`**, **`fee.record_payment`**, **`fee.approve_payment`**, **`fee.manage`**, **`fee.approve_concession`**.

---

## Modalities

- **Recording & verification:** Staff can record **offline** payments; approvers can **verify** or **reject** pending payments.
- **Concessions:** Types, previews, approvals, and revocations support scholarship and policy-driven discounts.
- **Reporting:** Aging, financial health, collection trends, revenue foregone, reconciliation export support finance oversight.
- **Branch context:** Where **`branch_id`** is present, reporting can align with institutional branches.

---

## Linked references

- **Technical specification:** `Ubotz_2_fee_technical_documentation.md`.
- **Related:** Installments, payments, enrollment, student billing (`student/payments` APIs).
