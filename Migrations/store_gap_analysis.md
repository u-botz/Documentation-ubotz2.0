# Feature Migration Guide - Mentora to UBOTZ 2 (Store)

## Legend

| Symbol | Meaning |
|--------|---------|
| ✅ | Implemented in Ubotz |
| ❌ | Missing — needs implementation |
| ⚠️ | Partially implemented |

---

## Target Audience
This guide analyzes the migration of the "Store" (Products, Sales, Purchases) feature set from Mentora to UBOTZ 2.0.
The Store allows tenant admins/instructors to create physical and virtual products, and students/users to purchase them, track orders, and view invoices.

---

## 🏗️ Architectural Paradigm Shift

### How it worked in Mentora (Active Record / Laravel MVC)
*   **Controllers:** Huge monolithic controllers (`ProductController`, `MyPurchaseController`, `SaleController`) handling validation, business logic (e.g., checking package limits, calculating sales totals, creating media records), and view rendering directly.
*   **Models:** Heavy models. The `Product` model handled translations, calculating availability, tracking sales totals, checking active discounts, and sharing links. `Sale` had static factory methods (`createSales`).
*   **Coupling:** High coupling between Store, Auth (`User` model for checking privileges), Payments/Sales (the monolithic `Sale` model handles everything from courses to products to subscriptions).
*   **Tenant Isolation:** Non-existent or manual via `creator_id` checks.

### How it will work in UBOTZ 2.0 (Domain-Driven Design)
*   **Tenant Data Isolation:** Automatic via single-database multi-tenancy using global scopes on Models and Repositories.
*   **Bounded Contexts:** Store/E-commerce represents a highly critical domain. Will likely live under `App\Domain\TenantAdminDashboard\Store` (for management) and `App\Domain\StudentDashboard\Store` (for purchasing).
*   **Pure Domain Entities:** `ProductEntity`, `ProductOrderEntity`, `ProductSpecificationEntity`. Models are stripped of business logic.
*   **Application Services/Use Cases:** Logic moves to small, focused Use Cases (e.g., `CreateProductUseCase`, `UpdateProductInventoryUseCase`, `ShipProductOrderUseCase`).
*   **Decoupled Sales:** The central `Sale` concept from Mentora should be replaced by bounded contexts firing domain events (e.g., `PaymentCompleted` triggers physical product shipping workflow).
*   **API-First:** Controllers will only validate FormRequests and dispatch commands, returning JSON resources.

---

## 📊 Feature Gap Analysis & Scope

### 1. Product Management (Admin/Instructor)
**Source Files:** `Panel/Store/ProductController.php`, `Product.php`
✅ **Feature:** Create/Update/Delete Products (Physical and Virtual)
  *   **Mentora:** Massive 5-step form (Basic -> Category/Inventory -> Images/Video -> Specifications -> FAQs/Rules). Handled in a single `update()` method branching by step.
  *   **UBOTZ 2 (Backend Done):** Broken down into focused commands: `CreateProductCommand`, `UpdateProductDetailsCommand`, `UpdateProductInventoryCommand`.
✅ **Feature:** Product Media (Images & Videos)
  *   **Mentora:** Handled via `ProductMedia` table linked to `Product`.
  *   **UBOTZ 2 (Backend Done):** Implemented `ProductMediaRecord` and `syncMedia` service logic in `UpdateProductMediaUseCase`.
✅ **Feature:** Inventory & Availability
  *   **Mentora:** Tracked via `inventory`, `inventory_updated_at`, `unlimited_inventory`. Logic in Model to calculate real-time availability based on Sales.
  *   **UBOTZ 2 (Backend Done):** Implemented in `ProductEntity` aggregate root with domain rules preventing invalid inventory states.
❌ **Feature:** Product Specifications & Filters
  *   **Mentora:** `ProductSpecificationController`, dynamic multi-select values based on `ProductCategory`.
  *   **UBOTZ 2:** Domain model for `ProductSpecification` and `ProductCategory` (Category is done, Specification is pending).

### 2. Orders and Purchases (Student/Customer)
**Source Files:** `Panel/Store/MyPurchaseController.php`, `ProductOrder.php`
✅ **Feature:** View My Purchases
  *   **Mentora:** Listed `ProductOrder`s where the user is the buyer, joining with `Sale` to verify refunds. Included filters by type/status.
  *   **UBOTZ 2 (Backend Done):** Clean querying via `ProductOrderController` with tenant isolation and buyer filtering.
✅ **Feature:** Order Tracking (Physical Products)
  *   **Mentora:** `status` = waiting_delivery, shipped, success, canceled. Tracking code URL integration.
  *   **UBOTZ 2 (Backend Done):** A clear state machine in `OrderStatus` value object. Transitions handled by `ShipProductOrderUseCase`.
✅ **Feature:** "Got the parcel" Confirmation
  *   **Mentora:** User clicks a button to mark the order as `success` (Delivered) and notifies the seller.
  *   **UBOTZ 2 (Backend Done):** `ConfirmOrderDeliveryUseCase` dispatched by the student app.
❌ **Feature:** Invoices
  *   **Mentora:** Rendered HTML blade views directly in controllers.
  *   **UBOTZ 2:** Generate PDF via a generic `InvoiceService` and return signed URLs or blobs (Pending).

### 3. Sales Tracking (Admin/Seller)
**Source Files:** `Panel/Store/SaleController.php`
⚠️ **Feature:** Seller Dashboard Sales View
  *   **Mentora:** View all sold products, grouped by customer, calculating totals/commissions via complex DB queries.
  *   **UBOTZ 2 (Backend Partial):** Basic order listing implemented. Advanced analytics read-models are pending.
✅ **Feature:** Entering Tracking Codes
  *   **Mentora:** Seller submits tracking code, changing status to `shipped` and notifying the buyer.
  *   **UBOTZ 2 (Backend Done):** `ShipProductOrderUseCase` (Admin action) updates the order entity and fires `OrderShipped` event.

---

## 🚀 Migration Strategy & Implementation Plan

### Phase 1: Domain Definition (Store Context) ✅
1.  **Define Value Objects:** ✅ (Done)
    - `ProductType`, `ProductStatus`, `OrderStatus`, `MediaType`, `ProductSlug` 
2.  **Define Entities:** ✅ (Done)
    - `ProductCategoryEntity`, `ProductEntity`, `ProductOrderEntity`, `ProductFaqEntity`, `ProductFileEntity`
3.  **Define Domain Events:** ✅ (Done)
    - `ProductCreated`, `ProductActivated`, `ProductInventoryUpdated`, `OrderShipped`, `OrderDelivered`, `OrderCanceled`.

### Phase 2: Application Use Cases ✅
1.  **Product Management:** ✅ `CreateProduct`, `UpdateProductDetails`, `UpdateProductInventory`, `UpdateProductMedia`, `DeleteProduct`.
2.  **Categories & FAQ/Files:** ✅ `CreateProductCategory`, `UpdateProductCategory`, `DeleteProductCategory`, `CreateProductFaq`, `UpdateProductFile`, etc.
3.  **Order Fulfillment (Seller):** ✅ `ShipProductOrder`, `ConfirmOrderDelivery`.

### Phase 3: Infrastructure ✅
1.  **Repositories:** ✅ `EloquentProductRepository`, `EloquentProductOrderRepository`, etc.
2.  **Models (Data transfer):** ✅ Eloquent Record models with `BelongsToTenant`.
3.  **Migrations:** ✅ All 6 Store migrations defined and applied.

### Phase 4: Frontend API Integration
1.  Build cleanly versioned APIs (e.g., `POST /api/tenant/admin/store/products`, `GET /api/tenant/student/store/purchases`).
2.  Build the UIs in the Next.js App Router for Admin (`features/tenant-admin/store`) and Student (`features/student/store`).

---

## ⚠️ Key Differences & Gotchas
1.  **The Mega-Sale Table:** Mentora uses one `sales` table for *everything* (courses, products, subscriptions, gifts). This is an anti-pattern in UBOTZ 2 DDD. Store payments should either have their own lightweight ledger or use a strictly decoupled Payment Bounded Context that links via references, not hard foreign keys to every possible item type.
2.  **Inventory Race Conditions:** Mentora computes availability by subtracting tracked sales from base inventory on the fly. UBOTZ 2 should use robust atomic transactions or dedicated inventory ledgers to prevent race conditions during high-volume sales.
3.  **Commissions & Taxes:** Mentora embeds logic to check store settings vs per-product settings. This belongs in a `PricingService` or `TaxCalculator` domain service, never in the Model directly.
