# UBOTZ 2.0 Subscription Business Findings

## Executive Summary
Subscriptions govern the relationship between the Ubotz Platform (Landlord) and the Tenant (Tenant). It is the primary engine for B2B revenue and resource governance, defining the plan tiers, usage limits, and billing cycles for every institution on the platform.

## Operational Modalities

### 1. Plan Catalog (`subscription_plans`)
Managed by the Platform administrators in the Central DB.
- **Tiers**: Standard tiers (Starter, Professional, Enterprise) with fixed capabilities.
- **Limits**: Hard constraints on `max_users`, `max_courses`, and `max_storage_bytes`.
- **Billing Cycles**: Supporting `monthly` and `annual` billing with significant discounts for annual commitments.

### 2. Tenant Lifecycles
Subscriptions track the full journey of a tenant institution:
- **Trial**: Initial period with temporary access to higher-tier features.
- **Active**: Regular paying state.
- **Past Due**: Temporary grace state after a failed payment.
- **Expired/Cancelled**: Suspension of service and potential locking of the tenant dashboard.

### 3. Entitlements & Overrides
- **Module Entitlements**: Specific functional blocks (e.g., "Lead Management", "CBT Quizzes") can be toggled per plan.
- **Overrides**: Platform administrators can grant manual overrides for specific tenants (`module_entitlement_overrides`) for pilots or bespoke enterprise agreements.

## Revenue Protection
Through integration with payment gateways (Stripe/Razorpay), the platform handles automatic renewals and seat-overage tracking. When a tenant exceeds their `max_users` limit, the system can automatically trigger overage billing or block further student registration.

---

## Linked References
- Related Modules: `Tenant-Provisioning`, `Payment`.
