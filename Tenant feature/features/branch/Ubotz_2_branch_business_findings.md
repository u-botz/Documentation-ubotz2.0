# UBOTZ 2.0 Branch Business Findings

## Executive Summary

**Branches** let a single tenant represent **multiple physical locations or logical units** under one account. Each branch has a **stable code** (unique per tenant), contact fields, an **active** flag, and optional **branch manager**. Users can be **assigned** to branches for access and reporting.

Branches also act as a **dimension** on leads, fees, and payments where configured, so finance and CRM views can compare performance **by branch**.

---

## Operations

- **Activation:** `is_active` plus the **`deactivate`** API support turning a site off without deleting historical rows tied to that branch.
- **People:** `user_branch_assignments` models which users belong to which branch(es).
- **Plans:** Subscription **plan features** can cap **`max_branches`**, aligning commercial limits with footprint.

---

## Linked references

- **Technical specification:** `Ubotz_2_branch_technical_documentation.md` (routes, schema, integrations).
