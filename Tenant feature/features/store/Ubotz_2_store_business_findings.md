# UBOTZ 2.0 — Store — Business Findings

## Executive summary

The **store** lets a tenant sell **catalog items** that are not necessarily framed as “courses”: merchandise, materials, or digital goods, with **localized** titles/descriptions and **inventory** controls for physical stock. **Orders** can move through operational steps such as **shipping** and **delivery confirmation** where the product type requires it.

## Catalog

- **Types** — Products carry a `type` string (implementation-defined) to distinguish digital vs physical or other behaviors.
- **Translations** — Multiple locales per product support international student bodies.
- **Pricing** — Base price and optional delivery fee are tracked in **cents** for precision.

## Inventory and fulfillment

- **Stock** — Finite inventory with optional **low-stock** warnings; **unlimited** inventory suits digital goods.
- **Orders** — Staff list and inspect orders; fulfillment actions align with shipping workflows rather than only “paid” flags.

## Tenancy

All catalog and order data is **scoped to the institution**; another tenant never sees products or orders from a peer.

---

## Linked references

- **Payment** — customer payment for store purchases
- **File manager** — digital asset delivery when wired to product files
