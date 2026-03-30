# UBOTZ 2.0 Branch Technical Specification

## Context & Architectural Goal
The `Branch` entity sits outside the strict academic context (Courses/Assessments). It functions as the primary spatial boundary delineating physical operations or logical subsidiaries inside a singular Tenant.

## Schema Map (`branches`)
Derived from the `2026_03_17_210500_create_branches_table.php` invariant:
- **`tenant_id`**: Universal isolation boundary. Enforced structurally.
- **`code`**: A string identifying the branch (e.g., "DEL-01"). Uniquely indexed composite constraint: `unq_branches_tenant_code(tenant_id, code)`.
- **State Properties**: Uses a simplistic `is_active` boolean integer instead of formal `softDeletes()`. 
- **Performance Boundary**: Covered by `idx_branches_tenant_active`.

## Policy & Tenancy
Queries fetching or mutating `Branch` objects must conform to `BelongsToTenant` scope traits to prevent offline-center information from leaking across parallel tenants on the central platform. Support APIs rely intrinsically on `tenant_id` cascading.
