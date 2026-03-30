# UBOTZ 2.0 — Pricing — Business Findings

## Executive summary

**Pricing** in this module means **course-level tickets** (coded discounts with optional capacity and audience limits) and **special offers** (percentage discounts over date ranges). Both are tools to run campaigns and segment audiences without editing base course list prices for every purchaser.

## Tickets

- Institutions define a **code-like ticket** tied to a course: discount amount, validity window, and optional **capacity** (how many times it can be used).
- **User groups** can restrict who may apply a ticket or offer, supporting scholarships or member-only campaigns when configured.

## Special offers

- **Percentage** discounts with **start/end** dates and active/inactive status simplify seasonal promotions (e.g. enrollment drives).

## Relationship to checkout

Discounted **net price** at checkout depends on the rest of the product (validation endpoints, cart/order logic). This documentation only establishes **what** tickets and offers are stored and **how** they are administered via APIs.

## Governance

All records are **tenant-scoped** in the data layer; a code created for one institution must never apply to another’s catalog.

---

## Linked references

- **Course** — offers and tickets are per course
- **Payment** — settlement after a price is agreed
- **User groups** — targeting for eligibility
