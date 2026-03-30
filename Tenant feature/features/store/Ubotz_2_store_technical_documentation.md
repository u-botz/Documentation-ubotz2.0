# UBOTZ 2.0 — Store — Technical Specification

## Scope

Tenant **product catalog** (categories, products, translations, media files, FAQs) and **order** listing/fulfillment (ship, confirm delivery). Application layer: `App\Application\TenantAdminDashboard\Store\`. Routes: `backend/routes/tenant_dashboard/store.php`.

## Route entry point

| File | Prefix (effective) |
|------|---------------------|
| `backend/routes/tenant_dashboard/store.php` | `/api/tenant/store` |

The route group does **not** add `tenant.module` or `tenant.capability` middleware in this file; authorization relies on the surrounding **tenant API** middleware (`auth:tenant_api`, etc.) and controller/use-case checks.

## HTTP map

Nested `Route::prefix('store')->name('store.')`:

| Area | Pattern | Notes |
|------|---------|--------|
| Categories | `apiResource('categories', ProductCategoryController)` | Standard REST |
| Products | `apiResource('products', ProductController)` + `PUT products/{product}/details`, `PUT products/{product}/inventory` | |
| FAQs | `apiResource('faqs', ProductFaqController)->except(['index','show'])` | |
| Files | `apiResource('files', ProductFileController)->except(['index','show'])` | |
| Orders | `apiResource('orders', ProductOrderController)->only(['index','show'])` + `POST orders/{order}/ship`, `POST orders/{order}/confirm-delivery` | |

## Application use cases (examples)

`App\Application\TenantAdminDashboard\Store\UseCases\`: `CreateProductUseCase`, `UpdateProductDetailsUseCase`, `UpdateProductInventoryUseCase`, `UpdateProductMediaUseCase`, `DeleteProductUseCase`, category/FAQ/file CRUD use cases, `ShipProductOrderUseCase`, `ConfirmOrderDeliveryUseCase`.

## Persistence (tenant)

| Migration | Tables |
|-----------|--------|
| `2026_03_09_012332_create_product_category_tables.php` | `product_categories` (+ related if any) |
| `2026_03_09_012335_create_product_tables.php` | **`products`** — `tenant_id`, `creator_id`, `category_id`, `type`, `slug`, `price_cents`, `delivery_fee_cents`, `unlimited_inventory`, `inventory`, `inventory_warning`, `status`, …; **`product_translations`** — `locale`, `title`, `seo_description`, `summary`, `description`; **unique** `(product_id, locale)` |
| `2026_03_09_012352_create_product_orders_table.php` | **`product_orders`** |

## Frontend

No dedicated `STORE` block was present in `frontend/config/api-endpoints.ts` at documentation time; clients call `/api/tenant/store/...` paths implied above.

---

## Linked references

- **Payment** — checkout for store orders (where integrated)
- **File manager** — assets linked to digital products
