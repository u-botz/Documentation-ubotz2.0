# UBOTZ 2.0 — Store — Technical Specification

## Scope

Tenant **product catalog** (categories, products, translations, media files, FAQs) and **order** listing/fulfillment (ship, confirm delivery). Application layer: `App\Application\TenantAdminDashboard\Store\`. Routes: `backend/routes/tenant_dashboard/store.php`.

## Route entry point

| File | Prefix (effective) |
|------|---------------------|
| `backend/routes/tenant_dashboard/store.php` | `/api/tenant/store` |

### Module and capabilities

- **`tenant.module:module.lms`** — Store is part of the core LMS surface area; there is no separate `module.store` in `ModuleCode` today.
- **`tenant.capability:store.view`** — `GET` on categories, products, orders (browse catalog and read orders).
- **`tenant.capability:store.manage`** — Mutations: category/product create/update/delete, product details/inventory updates, FAQ and file CRUD, ship and confirm-delivery.

Capabilities are seeded in `TenantCapabilitySeeder` / migration `2026_03_31_000001_seed_store_and_reward_capabilities.php` and assigned to default system roles (`owner`/`admin` full `store.*`; `teacher`/`staff` view-only where listed in `TenantRoleCapabilitySeeder`).

## HTTP map

Nested `Route::middleware(['tenant.module:module.lms'])->prefix('store')->name('store.')`:

| Area | Pattern | Capability |
|------|---------|------------|
| Categories | `index`, `show` | `store.view` |
| Categories | `store`, `update`, `destroy` | `store.manage` |
| Products | `index`, `show` | `store.view` |
| Products | `store`, `update`, `destroy`, `PUT .../details`, `PUT .../inventory` | `store.manage` |
| FAQs | `apiResource` except `index`/`show` | `store.manage` |
| Files | `apiResource` except `index`/`show` | `store.manage` |
| Orders | `index`, `show` | `store.view` |
| Orders | `POST .../ship`, `POST .../confirm-delivery` | `store.manage` |

## Application use cases (examples)

`App\Application\TenantAdminDashboard\Store\UseCases\`: `CreateProductUseCase`, `UpdateProductDetailsUseCase`, `UpdateProductInventoryUseCase`, `UpdateProductMediaUseCase`, `DeleteProductUseCase`, category/FAQ/file CRUD use cases, `ShipProductOrderUseCase`, `ConfirmOrderDeliveryUseCase`.

## Persistence (tenant)

| Migration | Tables |
|-----------|--------|
| `2026_03_09_012332_create_product_category_tables.php` | `product_categories` (+ related if any) |
| `2026_03_09_012335_create_product_tables.php` | **`products`** — `tenant_id`, `creator_id`, `category_id`, `type`, `slug`, `price_cents`, `delivery_fee_cents`, `unlimited_inventory`, `inventory`, `inventory_warning`, `status`, …; **`product_translations`** — `locale`, `title`, `seo_description`, `summary`, `description`; **unique** `(product_id, locale)` |
| `2026_03_09_012352_create_product_orders_table.php` | **`product_orders`** |

## Frontend

- **`API_ENDPOINTS.TENANT_STORE`** in [`frontend/config/api-endpoints.ts`](../../../../frontend/config/api-endpoints.ts) (categories, products, FAQs, files, orders, ship / confirm-delivery).
- [`frontend/services/tenant-store-service.ts`](../../../../frontend/services/tenant-store-service.ts) — thin CRUD/fulfillment wrappers.

---

## Linked references

- **Payment** — checkout for store orders (where integrated)
- **File manager** — assets linked to digital products

## Document history

- **2026-03-30:** Centralized frontend API paths (`TENANT_STORE`) and `tenant-store-service.ts`.
- **2026-03-31:** Documented `module.lms`, `store.view`, `store.manage` route gating.
