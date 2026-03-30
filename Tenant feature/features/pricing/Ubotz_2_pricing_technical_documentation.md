# UBOTZ 2.0 Pricing & Special Offer Technical Specification

## Core Architecture
The Pricing module acts as a "Calculation Decorator" for the `Payment` and `Course` contexts (`TenantAdminDashboard\Pricing`).

## Relational Schema Constraints

### 1. Offer Ledger (`special_offers`)
- **`tenant_id`**: Structural isolation.
- **`discount_percentage` / `discount_fixed_cents`**: Supported discount types.
- **Indices**: Active offers are filtered using `ends_at > NOW()`.

### 2. Ticket Engine (`discount_tickets`)
- **`code`**: Case-insensitive unique identifier per tenant.
- **Join Tables**: `ticket_user_groups` enables targeting specific clusters of students.

## Key Technical Workflows

### The Net Price Calculation
1. `PriceCalculatorService` receives the `base_price_cents`.
2. It scans for active `SpecialOffers` matching the item type.
3. If a `TicketCode` is provided, it validates:
   - Expiration date.
   - Usage limits (`max_uses`).
   - Eligibility for the authenticated User/Group.
4. It returns the `net_price_cents` to the checkout engine.

## Performance & Optimization
- **Rule Resolution**: Pricing rules are pre-calculated and cached during the order initiation to ensure a lag-free checkout experience.
- **Atomic Increments**: `current_uses` on tickets is incremented using atomic DB operations to prevent "Double Spending" of limited-use codes during high-traffic sales.

## Tenancy & Security
Isolation is enforced via `tenant_id`. It is impossible for a code from "Tenant A" to be applied to a product from "Tenant B".

---

## Linked References
- Related Modules: `Payment`, `User-Group`.
