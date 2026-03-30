# UBOTZ 2.0 Store Business Findings

## Executive Summary
The Store module provides Ubotz 2.0 tenants with a full digital marketplace (E-commerce). It allows institutions to sell non-course assets, such as "Mock Test PDFs", "Physical Textbooks", or "Merchandise", directly to their student base.

## Operational Modalities

### 1. Product Catalog
- **Product Types**: Supports both `digital` (instant download) and `physical` (requiring shipping) assets.
- **Translations**: Every product supports multi-lingual metadata (Title, Description, SEO Summary) to cater to global student audiences.

### 2. Inventory Management
- **`inventory`**: Tracks stock levels for physical goods.
- **`inventory_warning`**: Triggers administrative alerts when a product is running low, ensuring fulfillment continuity.
- **UNLIMITED Flag**: Used for digital assets (PDFs, recorded seminars) where inventory is infinite.

### 3. Sales & Fulfillment
- **`price_cents` / `delivery_fee_cents`**: Clear separation of product cost vs. logistical overhead.
- **Fulfillment Status**: Tracks the movement from `DRAFT` (prep) $\rightarrow$ `ACTIVE` (live) $\rightarrow$ fulfillment.

## Commercial Integration
The Store is fully integrated with the platform's Payment engine. Successful purchases of digital products automatically grant the student access to the associated files in their "My Downloads" section.

---

## Linked References
- Related Modules: `Payment`, `File-Manager`.
