# UBOTZ 2.0 Store Technical Specification

## Core Architecture
The Store module is an e-commerce context (`TenantAdminDashboard\Store`) designed for high-cardinality metadata and inventory precision.

## Relational Schema Constraints

### 1. Products (`products`)
- **`tenant_id`**: Structural isolation key.
- **`price_cents`**: Integer bigInt for currency safety.
- **`inventory`**: Signed integer for stock tracking.
- **Indices**: `idx_products_tenant_status` ensures rapid front-end catalog rendering.

### 2. Translations (`product_translations`)
- Join table for `locale`-based strings.
- Unique constraint `uq_product_locale` ensures one set of metadata per language per product.

## Key Technical Workflows

### Inventory Lock (Atomic)
To prevent overselling of high-demand physical products (e.g. limited edition textbooks):
1. The system uses a pessimistic database lock or an atomic `decrement('inventory')` operation during the checkout flow.
2. If `inventory` reaches 0 (and `unlimited_inventory` is false), the product is immediately shifted to `OUT_OF_STOCK` for that tenant.

### Digital Content Fulfillment
When a `digital` type product is purchased:
1. The `ProcessOrderJob` identifies the linked `file_id` in the File Manager.
2. It grants the student account a permanent access token to the specific asset.

## Tenancy & Security
Isolation is enforced via `tenant_id`. Custom product categories and shipping rules are private to the institutional scope.

---

## Linked References
- Related Modules: `Payment`, `File-Manager`.
