# UBOTZ 2.0 Tenant Provisioning Business Findings

## Executive Summary
Tenant Provisioning is the technical "Day Zero" workflow for every institution on the platform. It handles the secure creation of isolated data environments, organization-specific identity (subdomains), and the initial administrative account setup.

## Operational Modalities

### 1. Self-Service Onboarding
Prospective institutions provide their `slug` (URL prefix) and base organizational details.
- **Idempotency**: Prevents accidental double-provisioning if the user clicks "Subscribe" multiple times.
- **Validation**: Checks for slug availability and validates the institutional contact details.

### 2. Infrastructure Setup
The platform automatically executes the following:
- Registry entry in the **Central DB**.
- Subdomain mapping (e.g., `oxford.ubotz.com`).
- Generation of the initial **Owner** account for the institution.

### 3. Deployment Tiers
Provisioning supports multiple infrastructure models:
- **Shared DB (Standard)**: Most tenants share a common database with row-level isolation.
- **Dedicated DB (Enterprise)**: High-security institutions can be provisioned with a dedicated, isolated database instance during the run.

## Lifecycle Management
Provisioning is not a one-time event but a continuum.
- **Suspension**: Temporarily locking dashboard access for billing or compliance issues.
- **Hard Deletion**: Formal GDPR-compliant workflow for scrubbing institutional data from the platform.

---

## Linked References
- Related Modules: `Subscription`, `User`, `Auth`.
