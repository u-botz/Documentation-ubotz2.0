# UBOTZ 2.0 Subscription Technical Specification

## Core Architecture
The Subscription module resides in the Central Database to ensure platform-wide consistency and prevent tenants from modifying their own billing metadata.

## Relational Schema Constraints

### 1. Plan Definitions (`subscription_plans`)
- **`code`**: Unique machine-readable SKU.
- **`price_monthly` / `price_annual`**: Stored as BigInt cents.
- **`features`**: JSON column storing specific feature flags (e.g., SSO: true).

### 2. Active Tracking (`tenant_subscriptions`)
- **`current_period_ends_at`**: The timestamp used by the `CheckTenantStatusMiddleware` to verify active access.
- **`gateway_subscription_id`**: The raw reference to the Stripe/Razorpay subscription object.
- **Indices**: `idx_subscriptions_period_end` optimizes the bulk "Past Due" scheduler that runs daily.

## Hard Resource Constraints
The platform enforces plan limits at the Application Tier.
- **User Limits**: Checked during `User::create` via the `TenantSubscriptionService`.
- **Course Limits**: Checked during `Course::published`.
- **Storage**: Monitored via the File Manager before committing new S3 uploads.

## Security & Payment Integrity
- **Idempotency**: `idempotency_key` on the `tenant_subscriptions` table prevents duplicate plan assignments during browser retries or webhook delays.
- **Locked Prices**: `locked_prices` boolean ensures that if a plan's price is updated, existing tenants remain on their legacy pricing until their next renewal cycle.

---

## Linked References
- Related Modules: `Tenant-Provisioning`, `Payment`.
