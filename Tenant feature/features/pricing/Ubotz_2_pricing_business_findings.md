# UBOTZ 2.0 Pricing & Special Offer Business Findings

## Executive Summary
The Pricing module is the tactical marketing engine of the platform. It allows Ubotz 2.0 tenants to implement complex discount strategies, promotional "Special Offers", and targeted "Coupon Tickets" to drive conversions and reward student loyalty.

## Operational Modalities

### 1. Special Offers (`special_offers`)
Global or category-specific discounts (e.g., "30% Off All Physics Courses for Diwali").
- **Time-bound**: Automated `starts_at` and `ends_at` governance.
- **Resource Constraints**: Offers can be limited to specific `Courses` or `Bundles`.

### 2. Discount Tickets (`discount_tickets`)
Personalized or campaign-specific "Coupon" codes (e.g., `SAVE50`).
- **Usage Limits**: Tracks `max_uses` vs. `current_uses`. 
- **User-Specific**: Tickets can be restricted to specific student `User-Groups`, allowing for "Scholarship" or "Early Bird" concessions.

### 3. Pricing Rules
Allows for "Tiered" pricing based on institutional rules (e.g., "Staff children get 50% discount automatically").

## Revenue Governance
Every discount applied is linked back to the `Payment` ledger. This ensures that even with aggressive marketing, the institution can maintain precise "Net Revenue" vs "Gross Revenue" auditing.

---

## Linked References
- Related Modules: `Course`, `Bundle`, `Payment`, `User-Group`.
