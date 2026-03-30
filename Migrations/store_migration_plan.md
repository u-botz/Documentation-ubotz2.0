# Store Feature Migration Plan
## Mentora → UBOTZ 2.0 (Tenant Admin Dashboard)

> **Read before implementing**: [Feature Migration Guide](file:///c:/Users/sayan/lms/Ubotz_2.0/backend/documentation/Feature%20Migration%20Guide%20-%20Mentora%20to%20UBOTZ%202.md) and [Developer Manual](file:///c:/Users/sayan/lms/Ubotz_2.0/backend/documentation/Ubotz%202%20developer%20instruction%20manual%20.md) — both are MANDATORY reading.

- **Priority:** 🟡 High  
- **Complexity:** Very High  
- **Bounded Context:** `TenantAdminDashboard` (Products are tenant-owned content, managed by instructors/admins)

---

## Scope

Migrate the **Admin/Instructor panel product management** and **Student purchase tracking** functions. Public-facing storefront (catalog browsing, product detail pages) is **out of scope** for this phase.

### Legacy Source Files

| Type | File | Extract |
|------|------|---------|
| Controller | [`ProductController.php`](file:///c:/Users/sayan/lms/Ubotz_2.0/mentora_production/app/Http/Controllers/Panel/Store/ProductController.php) | CRUD, 5-step form, media handling, package limits |
| Controller | [`SaleController.php`](file:///c:/Users/sayan/lms/Ubotz_2.0/mentora_production/app/Http/Controllers/Panel/Store/SaleController.php) | Seller sales list, tracking codes, invoices |
| Controller | [`MyPurchaseController.php`](file:///c:/Users/sayan/lms/Ubotz_2.0/mentora_production/app/Http/Controllers/Panel/Store/MyPurchaseController.php) | Buyer purchases, delivery confirmation, invoices |
| Controller | [`ProductSpecificationController.php`](file:///c:/Users/sayan/lms/Ubotz_2.0/mentora_production/app/Http/Controllers/Panel/Store/ProductSpecificationController.php) | Specification CRUD, ordering |
| Controller | [`ProductFaqController.php`](file:///c:/Users/sayan/lms/Ubotz_2.0/mentora_production/app/Http/Controllers/Panel/Store/ProductFaqController.php) | FAQ CRUD |
| Controller | [`ProductFileController.php`](file:///c:/Users/sayan/lms/Ubotz_2.0/mentora_production/app/Http/Controllers/Panel/Store/ProductFileController.php) | Virtual product file management |
| Controller | [`CommentController.php`](file:///c:/Users/sayan/lms/Ubotz_2.0/mentora_production/app/Http/Controllers/Panel/Store/CommentController.php) | Product comment/review moderation |
| Model | [`Product.php`](file:///c:/Users/sayan/lms/Ubotz_2.0/mentora_production/app/Models/Product.php) | Types, statuses, availability, pricing, discounts, sales counts |
| Model | [`ProductOrder.php`](file:///c:/Users/sayan/lms/Ubotz_2.0/mentora_production/app/Models/ProductOrder.php) | Order statuses, buyer/seller relationships |
| Model | [`ProductCategory.php`](file:///c:/Users/sayan/lms/Ubotz_2.0/mentora_production/app/Models/ProductCategory.php) | Hierarchical categories with subcategories |
| Model | [`ProductMedia.php`](file:///c:/Users/sayan/lms/Ubotz_2.0/mentora_production/app/Models/ProductMedia.php) | Thumbnail, images, video types |
| Model | [`ProductDiscount.php`](file:///c:/Users/sayan/lms/Ubotz_2.0/mentora_production/app/Models/ProductDiscount.php) | Time-limited percentage discounts |
| Model | [`ProductFile.php`](file:///c:/Users/sayan/lms/Ubotz_2.0/mentora_production/app/Models/ProductFile.php) | Virtual product downloadable files |
| Model | [`ProductFaq.php`](file:///c:/Users/sayan/lms/Ubotz_2.0/mentora_production/app/Models/ProductFaq.php) | Product FAQ entries |
| Model | [`ProductSpecification.php`](file:///c:/Users/sayan/lms/Ubotz_2.0/mentora_production/app/Models/ProductSpecification.php) | Specification definitions |
| Model | [`Sale.php`](file:///c:/Users/sayan/lms/Ubotz_2.0/mentora_production/app/Models/Sale.php) | Mega-sale table (shared across all item types) |
| Translation | `ProductTranslation.php` | `title`, `seo_description`, `summary`, `description` |
| Translation | `ProductCategoryTranslation.php` | `title` |
| Translation | `ProductFaqTranslation.php` | `title`, `answer` |

### Legacy → UBOTZ Use Case Mapping

| Legacy Method | UBOTZ UseCase | Type |
|---------------|--------------|------|
| `ProductController@store` | `CreateProductUseCase` | Write |
| `ProductController@update` (step 1) | `UpdateProductDetailsUseCase` | Write |
| `ProductController@update` (step 2) | `UpdateProductInventoryUseCase` | Write |
| `ProductController@update` (step 3) | `UpdateProductMediaUseCase` | Write |
| `ProductController@destroy` | `DeleteProductUseCase` | Write |
| `ProductController@index` | `ListProductsQuery` | Read |
| `ProductController@edit` | `GetProductQuery` | Read |
| `SaleController@index` | `ListProductSalesQuery` | Read |
| `SaleController@setTrackingCode` | `ShipProductOrderUseCase` | Write |
| `SaleController@invoice` | `GetSaleInvoiceQuery` | Read |
| `MyPurchaseController@index` | `ListMyPurchasesQuery` | Read |
| `MyPurchaseController@setGotTheParcel` | `ConfirmOrderDeliveryUseCase` | Write |
| `MyPurchaseController@invoice` | `GetPurchaseInvoiceQuery` | Read |
| `ProductFaqController@store` | `CreateProductFaqUseCase` | Write |
| `ProductFaqController@update` | `UpdateProductFaqUseCase` | Write |
| `ProductFaqController@destroy` | `DeleteProductFaqUseCase` | Write |
| `ProductFileController@store` | `CreateProductFileUseCase` | Write |
| `ProductFileController@update` | `UpdateProductFileUseCase` | Write |
| `ProductFileController@destroy` | `DeleteProductFileUseCase` | Write |
| `ProductSpecificationController@store` | `AddProductSpecificationUseCase` | Write |
| `ProductSpecificationController@update` | `UpdateProductSpecificationUseCase` | Write |
| `ProductSpecificationController@destroy` | `RemoveProductSpecificationUseCase` | Write |

---

## Phase 1: Database Migrations

All tables are tenant-owned → `database/migrations/tenant/`.

> [!IMPORTANT]
> Legacy uses ENUMs for status. **UBOTZ 2.0 forbids MySQL ENUMs** — use `VARCHAR(30)`.
> Legacy has no `tenant_id`. You MUST add it to every table.
> Legacy stores prices as `DECIMAL`. **UBOTZ 2.0 uses `_cents BIGINT UNSIGNED`** for financial safety.

### Migration 1A: `product_categories` + `product_category_translations`

```php
// product_categories
$table->id();
$table->unsignedBigInteger('tenant_id');
$table->unsignedBigInteger('parent_id')->nullable(); // self-referencing for subcategories
$table->string('slug');
$table->string('icon')->nullable();
$table->timestamps();
$table->index(['tenant_id', 'parent_id']);
$table->index(['tenant_id', 'slug']);

// product_category_translations
$table->id();
$table->unsignedBigInteger('product_category_id');
$table->string('locale', 10)->index();
$table->string('title');
$table->unique(['product_category_id', 'locale']);
$table->foreign('product_category_id')->references('id')->on('product_categories')->onDelete('cascade');
```

### Migration 1B: `products` + `product_translations`

```php
// products
$table->id();
$table->unsignedBigInteger('tenant_id');
$table->unsignedBigInteger('creator_id');          // FK to tenant users
$table->unsignedBigInteger('category_id')->nullable();
$table->string('type', 30);                         // 'physical', 'virtual'
$table->string('slug');
$table->bigInteger('price_cents')->unsigned()->default(0);      // ← BIGINT not DECIMAL
$table->bigInteger('delivery_fee_cents')->unsigned()->default(0);
$table->boolean('unlimited_inventory')->default(false);
$table->integer('inventory')->default(0);
$table->integer('inventory_warning')->nullable();
$table->timestamp('inventory_updated_at')->nullable();
$table->boolean('ordering')->default(false);
$table->string('status', 30)->default('DRAFT');     // DRAFT, PENDING, ACTIVE, INACTIVE
$table->text('message_for_reviewer')->nullable();
$table->timestamps();
$table->index(['tenant_id', 'status']);
$table->index(['tenant_id', 'creator_id']);
$table->index(['tenant_id', 'category_id']);
$table->foreign('category_id')->references('id')->on('product_categories')->nullOnDelete();

// product_translations
$table->id();
$table->unsignedBigInteger('product_id');
$table->string('locale', 10)->index();
$table->string('title');
$table->string('seo_description')->nullable();
$table->text('summary')->nullable();
$table->longText('description')->nullable();
$table->unique(['product_id', 'locale']);
$table->foreign('product_id')->references('id')->on('products')->onDelete('cascade');
```

### Migration 1C: `product_media`

```php
$table->id();
$table->unsignedBigInteger('tenant_id');
$table->unsignedBigInteger('product_id');
$table->string('type', 30);                         // 'thumbnail', 'image', 'video'
$table->string('path');
$table->integer('order')->default(0);
$table->timestamps();
$table->index(['tenant_id', 'product_id', 'type']);
$table->foreign('product_id')->references('id')->on('products')->onDelete('cascade');
```

### Migration 1D: `product_files` (virtual products)

```php
$table->id();
$table->unsignedBigInteger('tenant_id');
$table->unsignedBigInteger('product_id');
$table->string('file_path');
$table->string('file_type', 30)->nullable();
$table->unsignedBigInteger('file_size')->default(0);  // bytes
$table->string('access_mode', 30)->default('paid');    // 'paid', 'free'
$table->integer('order')->default(0);
$table->string('status', 30)->default('ACTIVE');
$table->timestamps();
$table->index(['tenant_id', 'product_id']);
$table->foreign('product_id')->references('id')->on('products')->onDelete('cascade');

// product_file_translations
$table->id();
$table->unsignedBigInteger('product_file_id');
$table->string('locale', 10)->index();
$table->string('title');
$table->text('description')->nullable();
$table->unique(['product_file_id', 'locale']);
$table->foreign('product_file_id')->references('id')->on('product_files')->onDelete('cascade');
```

### Migration 1E: `product_faqs`

```php
$table->id();
$table->unsignedBigInteger('tenant_id');
$table->unsignedBigInteger('product_id');
$table->integer('order')->default(0);
$table->timestamps();
$table->index(['tenant_id', 'product_id']);
$table->foreign('product_id')->references('id')->on('products')->onDelete('cascade');

// product_faq_translations
$table->id();
$table->unsignedBigInteger('product_faq_id');
$table->string('locale', 10)->index();
$table->string('title');
$table->text('answer');
$table->unique(['product_faq_id', 'locale']);
$table->foreign('product_faq_id')->references('id')->on('product_faqs')->onDelete('cascade');
```

### Migration 1F: `product_orders`

```php
$table->id();
$table->unsignedBigInteger('tenant_id');
$table->unsignedBigInteger('product_id');
$table->unsignedBigInteger('buyer_id');
$table->unsignedBigInteger('seller_id');
$table->unsignedBigInteger('sale_id')->nullable();      // FK to a future Payment context
$table->integer('quantity')->default(1);
$table->bigInteger('amount_cents')->unsigned()->default(0);
$table->bigInteger('tax_cents')->unsigned()->default(0);
$table->bigInteger('commission_cents')->unsigned()->default(0);
$table->bigInteger('discount_cents')->unsigned()->default(0);
$table->bigInteger('total_amount_cents')->unsigned()->default(0);
$table->bigInteger('delivery_fee_cents')->unsigned()->default(0);
$table->string('status', 30)->default('PENDING');       // PENDING, WAITING_DELIVERY, SHIPPED, DELIVERED, CANCELED
$table->string('tracking_code')->nullable();
$table->timestamps();
$table->index(['tenant_id', 'buyer_id']);
$table->index(['tenant_id', 'seller_id']);
$table->index(['tenant_id', 'product_id']);
$table->index(['tenant_id', 'status']);
$table->foreign('product_id')->references('id')->on('products')->onDelete('cascade');
```

---

## Phase 2: Domain Layer

**Location:** `app/Domain/TenantAdminDashboard/Store/`

> [!CAUTION]
> Zero `use Illuminate\` imports allowed in the Domain layer. Pure PHP only.

### 2.1 Value Objects

| VO Class | File | Values |
|----------|------|--------|
| `ProductType` | `ValueObjects/ProductType.php` | `PHYSICAL`, `VIRTUAL` |
| `ProductStatus` | `ValueObjects/ProductStatus.php` | `DRAFT`, `PENDING`, `ACTIVE`, `INACTIVE` |
| `OrderStatus` | `ValueObjects/OrderStatus.php` | `PENDING`, `WAITING_DELIVERY`, `SHIPPED`, `DELIVERED`, `CANCELED` |
| `MediaType` | `ValueObjects/MediaType.php` | `THUMBNAIL`, `IMAGE`, `VIDEO` |
| `ProductSlug` | `ValueObjects/ProductSlug.php` | Immutable validated slug string |

**`ProductStatus` must implement:**
- `canActivate()` — from `PENDING` only
- `canDeactivate()` — from `ACTIVE` only
- `isActive()` — for access checks
- State transition map enforced in constructor

**`OrderStatus` must implement:**
- `canTransitionTo(OrderStatus $new)` — state machine for order lifecycle
- Allowed: `PENDING → WAITING_DELIVERY → SHIPPED → DELIVERED`, `PENDING → CANCELED`, `WAITING_DELIVERY → CANCELED`

### 2.2 Entities

#### `ProductCategoryEntity`
- Props: `id`, `tenantId`, `parentId`, `slug`, `icon`
- Factory: `create(...)`, `reconstitute(...)`
- Events: `ProductCategoryCreated`

#### `ProductEntity` (Aggregate Root)
- Props: `id`, `tenantId`, `creatorId`, `categoryId`, `type`, `slug`, `priceCents`, `deliveryFeeCents`, `unlimitedInventory`, `inventory`, `status`, `translations[]`
- Methods:
  - `activate()` — PENDING → ACTIVE, emits `ProductActivated`
  - `deactivate()` — ACTIVE → INACTIVE
  - `updateDetails(...)` — mutable fields
  - `updateInventory(int $quantity)` — emits `ProductInventoryUpdated`
- Events: `ProductCreated`, `ProductActivated`, `ProductInventoryUpdated`

#### `ProductOrderEntity`
- Props: `id`, `tenantId`, `productId`, `buyerId`, `sellerId`, `quantity`, `amountCents`, `taxCents`, `commissionCents`, `totalAmountCents`, `deliveryFeeCents`, `status`, `trackingCode`
- Methods:
  - `ship(string $trackingCode)` — WAITING_DELIVERY → SHIPPED, emits `OrderShipped`
  - `confirmDelivery()` — SHIPPED → DELIVERED, emits `OrderDelivered`
  - `cancel()` — emits `OrderCanceled`
- Events: `OrderCreated`, `OrderShipped`, `OrderDelivered`, `OrderCanceled`

#### `ProductFaqEntity`
- Props: `id`, `tenantId`, `productId`, `order`, `translations[]`

#### `ProductFileEntity`
- Props: `id`, `tenantId`, `productId`, `filePath`, `fileType`, `fileSize`, `accessMode`, `status`, `order`

### 2.3 Repository Interfaces

```php
// ProductCategoryRepositoryInterface
public function findById(int $tenantId, int $id): ?ProductCategoryEntity;
public function save(ProductCategoryEntity $category): ProductCategoryEntity;
public function delete(int $tenantId, int $id): void;

// ProductRepositoryInterface
public function findById(int $tenantId, int $id): ?ProductEntity;
public function save(ProductEntity $product): ProductEntity;
public function delete(int $tenantId, int $id): void;

// ProductOrderRepositoryInterface
public function findById(int $tenantId, int $id): ?ProductOrderEntity;
public function findByBuyer(int $tenantId, int $buyerId): array;
public function save(ProductOrderEntity $order): ProductOrderEntity;

// ProductFaqRepositoryInterface
public function findById(int $tenantId, int $id): ?ProductFaqEntity;
public function save(ProductFaqEntity $faq): ProductFaqEntity;
public function delete(int $tenantId, int $id): void;

// ProductFileRepositoryInterface
public function findById(int $tenantId, int $id): ?ProductFileEntity;
public function save(ProductFileEntity $file): ProductFileEntity;
public function delete(int $tenantId, int $id): void;
```

### 2.4 Domain Exceptions

- `ProductNotFoundException`
- `ProductCategoryNotFoundException`
- `ProductOrderNotFoundException`
- `InvalidProductStatusTransitionException`
- `InvalidOrderStatusTransitionException`
- `InsufficientInventoryException`
- `ProductCategoryNotEmptyException`

---

## Phase 3: Application Layer

**Location:** `app/Application/TenantAdminDashboard/Store/`

### 3.1 Commands (Write)

Each is a `final class`, `declare(strict_types=1)`, `readonly` constructor, with `int $tenantId` as **first** param and `?int $actorId` as last.

| Command | Key Parameters |
|---------|---------------|
| `CreateProductCommand` | `tenantId`, `type`, `title`, `seoDescription`, `summary`, `description`, `locale`, `actorId` |
| `UpdateProductDetailsCommand` | `tenantId`, `productId`, `title`, `seoDescription`, `summary`, `description`, `locale`, `actorId` |
| `UpdateProductInventoryCommand` | `tenantId`, `productId`, `categoryId`, `priceCents`, `deliveryFeeCents`, `inventory`, `unlimitedInventory`, `actorId` |
| `UpdateProductMediaCommand` | `tenantId`, `productId`, `thumbnail`, `images[]`, `videoDemo`, `actorId` |
| `DeleteProductCommand` | `tenantId`, `productId`, `actorId` |
| `CreateProductFaqCommand` | `tenantId`, `productId`, `title`, `answer`, `locale`, `actorId` |
| `UpdateProductFaqCommand` | `tenantId`, `faqId`, `title`, `answer`, `locale`, `actorId` |
| `DeleteProductFaqCommand` | `tenantId`, `faqId`, `actorId` |
| `CreateProductFileCommand` | `tenantId`, `productId`, `filePath`, `fileType`, `title`, `description`, `locale`, `actorId` |
| `UpdateProductFileCommand` | `tenantId`, `fileId`, `title`, `description`, `locale`, `actorId` |
| `DeleteProductFileCommand` | `tenantId`, `fileId`, `actorId` |
| `ShipProductOrderCommand` | `tenantId`, `orderId`, `trackingCode`, `actorId` |
| `ConfirmOrderDeliveryCommand` | `tenantId`, `orderId`, `actorId` |

### 3.2 Use Cases (Write)

Follow the fixed orchestration pattern from the Migration Guide §7.

| UseCase | Notes |
|---------|-------|
| `CreateProductUseCase` | Auto-generate slug, initial status = DRAFT |
| `UpdateProductDetailsUseCase` | Update translation record for locale |
| `UpdateProductInventoryUseCase` | Update category, price, inventory; track `inventory_updated_at` |
| `UpdateProductMediaUseCase` | Replace thumbnail/images/video in `product_media` |
| `DeleteProductUseCase` | Cascade deletes handled by DB FK |
| `CreateProductFaqUseCase` | Validate product exists, create FAQ entry |
| `UpdateProductFaqUseCase` | Update FAQ translation for locale |
| `DeleteProductFaqUseCase` | Hard delete |
| `CreateProductFileUseCase` | Validate product is virtual type |
| `UpdateProductFileUseCase` | Update file translation |
| `DeleteProductFileUseCase` | Hard delete + cleanup file storage |
| `ShipProductOrderUseCase` | WAITING_DELIVERY → SHIPPED, set tracking code, notify buyer |
| `ConfirmOrderDeliveryUseCase` | SHIPPED → DELIVERED, notify seller |

### 3.3 Queries (Read)

| Query | Filters |
|-------|---------|
| `ListProductsQuery` | `tenantId`, `creatorId`, `type`, `status`, `search`, `page`, `perPage` |
| `GetProductQuery` | `tenantId`, `productId` |
| `ListProductSalesQuery` | `tenantId`, `sellerId`, `customerId`, `type`, `status`, `dateFrom`, `dateTo`, `page`, `perPage` |
| `ListMyPurchasesQuery` | `tenantId`, `buyerId`, `type`, `status`, `dateFrom`, `dateTo`, `page`, `perPage` |
| `GetOrderInvoiceQuery` | `tenantId`, `orderId` |
| `ListProductCategoriesQuery` | `tenantId`, `search`, `parentId`, `page`, `perPage` |

---

## Phase 4: Infrastructure Layer

**Location:** `app/Infrastructure/Persistence/TenantAdminDashboard/Store/`

### 4.1 Eloquent Record Models

| Record Model | Table | Traits |
|---|---|---|
| `ProductCategoryRecord` | `product_categories` | **`BelongsToTenant`** |
| `ProductCategoryTranslationRecord` | `product_category_translations` | None |
| `ProductRecord` | `products` | **`BelongsToTenant`** |
| `ProductTranslationRecord` | `product_translations` | None |
| `ProductMediaRecord` | `product_media` | **`BelongsToTenant`** |
| `ProductFileRecord` | `product_files` | **`BelongsToTenant`** |
| `ProductFileTranslationRecord` | `product_file_translations` | None |
| `ProductFaqRecord` | `product_faqs` | **`BelongsToTenant`** |
| `ProductFaqTranslationRecord` | `product_faq_translations` | None |
| `ProductOrderRecord` | `product_orders` | **`BelongsToTenant`** |

### 4.2 Eloquent Repositories

| Repository | Implements |
|---|---|
| `EloquentProductCategoryRepository` | `ProductCategoryRepositoryInterface` |
| `EloquentProductRepository` | `ProductRepositoryInterface` |
| `EloquentProductOrderRepository` | `ProductOrderRepositoryInterface` |
| `EloquentProductFaqRepository` | `ProductFaqRepositoryInterface` |
| `EloquentProductFileRepository` | `ProductFileRepositoryInterface` |

### 4.3 Service Provider Registration

Create `StoreServiceProvider`:

```php
$this->app->bind(ProductCategoryRepositoryInterface::class, EloquentProductCategoryRepository::class);
$this->app->bind(ProductRepositoryInterface::class, EloquentProductRepository::class);
$this->app->bind(ProductOrderRepositoryInterface::class, EloquentProductOrderRepository::class);
$this->app->bind(ProductFaqRepositoryInterface::class, EloquentProductFaqRepository::class);
$this->app->bind(ProductFileRepositoryInterface::class, EloquentProductFileRepository::class);
```

---

## Phase 5: HTTP Layer

**Location:**
- `app/Http/Controllers/Api/TenantAdminDashboard/Store/`
- Routes: `routes/tenant_dashboard/store.php`

### 5.1 Controllers

| Controller | Methods |
|---|---|
| `ProductReadController` | `index`, `show` |
| `ProductWriteController` | `store`, `updateDetails`, `updateInventory`, `updateMedia`, `destroy` |
| `ProductCategoryReadController` | `index` |
| `ProductCategoryWriteController` | `store`, `update`, `destroy` |
| `ProductFaqWriteController` | `store`, `update`, `destroy` |
| `ProductFileWriteController` | `store`, `update`, `destroy` |
| `ProductSaleReadController` | `index`, `invoice` |
| `ProductSaleWriteController` | `ship` |
| `MyPurchaseReadController` | `index`, `invoice` |
| `MyPurchaseWriteController` | `confirmDelivery` |

### 5.2 Form Requests

| Request | Validates |
|---|---|
| `StoreProductRequest` | `type`, `title`, `seo_description`, `summary`, `description`, `locale` |
| `UpdateProductDetailsRequest` | `title`, `seo_description`, `summary`, `description`, `locale` |
| `UpdateProductInventoryRequest` | `category_id`, `price`, `delivery_fee`, `inventory`, `unlimited_inventory` |
| `UpdateProductMediaRequest` | `thumbnail`, `images`, `video_demo` |
| `StoreProductCategoryRequest` | `title`, `locale`, `parent_id` |
| `StoreProductFaqRequest` | `title`, `answer`, `locale` |
| `StoreProductFileRequest` | `file_path`, `title`, `locale` |
| `ShipOrderRequest` | `tracking_code` |

### 5.3 API Routes

```php
// routes/tenant_dashboard/store.php

// Product Categories
Route::get('/store/categories', [ProductCategoryReadController::class, 'index']);
Route::post('/store/categories', [ProductCategoryWriteController::class, 'store']);
Route::put('/store/categories/{id}', [ProductCategoryWriteController::class, 'update']);
Route::delete('/store/categories/{id}', [ProductCategoryWriteController::class, 'destroy']);

// Products
Route::get('/store/products', [ProductReadController::class, 'index']);
Route::get('/store/products/{id}', [ProductReadController::class, 'show']);
Route::post('/store/products', [ProductWriteController::class, 'store']);
Route::put('/store/products/{id}/details', [ProductWriteController::class, 'updateDetails']);
Route::put('/store/products/{id}/inventory', [ProductWriteController::class, 'updateInventory']);
Route::put('/store/products/{id}/media', [ProductWriteController::class, 'updateMedia']);
Route::delete('/store/products/{id}', [ProductWriteController::class, 'destroy']);

// Product FAQs
Route::post('/store/products/{productId}/faqs', [ProductFaqWriteController::class, 'store']);
Route::put('/store/faqs/{id}', [ProductFaqWriteController::class, 'update']);
Route::delete('/store/faqs/{id}', [ProductFaqWriteController::class, 'destroy']);

// Product Files
Route::post('/store/products/{productId}/files', [ProductFileWriteController::class, 'store']);
Route::put('/store/files/{id}', [ProductFileWriteController::class, 'update']);
Route::delete('/store/files/{id}', [ProductFileWriteController::class, 'destroy']);

// Sales (Seller view)
Route::get('/store/sales', [ProductSaleReadController::class, 'index']);
Route::get('/store/sales/{saleId}/orders/{orderId}/invoice', [ProductSaleReadController::class, 'invoice']);
Route::post('/store/sales/{saleId}/orders/{orderId}/ship', [ProductSaleWriteController::class, 'ship']);

// My Purchases (Buyer view)
Route::get('/store/purchases', [MyPurchaseReadController::class, 'index']);
Route::get('/store/purchases/{saleId}/orders/{orderId}/invoice', [MyPurchaseReadController::class, 'invoice']);
Route::post('/store/purchases/{saleId}/orders/{orderId}/confirm-delivery', [MyPurchaseWriteController::class, 'confirmDelivery']);
```

---

## Phase 6: Verification

### Architecture Checks

```powershell
# No Illuminate imports in domain layer
docker exec -it ubotz_backend grep -rn "use Illuminate" app/Domain/TenantAdminDashboard/Store/
# Expected: 0 results

# All store Record models have BelongsToTenant
docker exec -it ubotz_backend grep -rLn "BelongsToTenant" app/Infrastructure/Persistence/TenantAdminDashboard/Store/
# Should only return Translation records

# No enums in migrations
docker exec -it ubotz_backend grep -rn "->enum(" database/migrations/tenant/
# Expected: 0 results

# Financial columns use _cents suffix
docker exec -it ubotz_backend grep -rn "decimal\|DECIMAL" database/migrations/tenant/*store*
# Expected: 0 results (must use BIGINT _cents)
```

### Tests Required

| Test Class | Covers |
|---|---|
| `ProductStatusTest` | VO transitions — `canActivate`, `canDeactivate` |
| `OrderStatusTest` | VO state machine — all allowed/disallowed transitions |
| `ProductEntityTest` | Entity `activate()`, `updateInventory()`, events emitted |
| `ProductOrderEntityTest` | Entity `ship()`, `confirmDelivery()`, `cancel()` |
| `CreateProductUseCaseTest` | Happy path + tenant isolation |
| `ShipProductOrderUseCaseTest` | Tracking code set, status transition, notification |
| `ConfirmOrderDeliveryUseCaseTest` | Status transition, seller notification |
| `StoreTenantIsolationTest` | Tenant A cannot read/mutate Tenant B's products/orders |

---

## Implementation Order (Recommended)

```
Step 1  → Migrations (1A–1F)
Step 2  → Domain: Value Objects (ProductType, ProductStatus, OrderStatus, MediaType, ProductSlug)
Step 3  → Domain: Entities (ProductCategoryEntity, ProductEntity, ProductOrderEntity, ProductFaqEntity, ProductFileEntity)
Step 4  → Domain: Events (ProductCreated, ProductActivated, OrderShipped, OrderDelivered, ...)
Step 5  → Domain: Exceptions + Repository Interfaces
Step 6  → Infrastructure: Record models + Eloquent Repositories
Step 7  → Infrastructure: StoreServiceProvider bindings
Step 8  → Application: Commands
Step 9  → Application: UseCases (Write)
Step 10 → Application: Queries (Read)
Step 11 → HTTP: FormRequests + Controllers + Routes
Step 12 → Tests + Verification
```

> [!NOTE]
> **Total estimated file count:** ~100+ files (6 migrations + 5 VOs + 5 entities + 5 props + 8 events + 7 exceptions + 5 repo interfaces + 10 record models + 5 eloquent repos + 13 commands + 13 usecases + 6 queries + 10 controllers + 8 form requests + 1 route file + 1 service provider).

> [!WARNING]
> **The legacy `Sale` model is a mega-table.** Do NOT replicate this anti-pattern. The `product_orders` table should be self-contained with its own financial columns (`amount_cents`, `tax_cents`, etc.). Integration with a future Payment bounded context should be via domain events, not shared foreign keys.
