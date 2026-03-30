# UBOTZ 2.0 Category Technical Specification

## Core Architecture
Categories define an infinitely recursive nested menu layout required for comprehensive Course categorization (`app\Domain\TenantAdminDashboard\Category`).

## Relational Schema Constraints (`categories`)
Derived from the `2026_02_26_195500_create_categories_table.php` schema:
- **`tenant_id`**: Structural invariant. Prevents multi-tenant leaking via `idx_categories_tenant`.
- **`parent_id`**: Recursive schema mapping directly back to `categories.id`. The cornerstone of nested trees. 
    - The dual-index `idx_categories_parent(tenant_id, parent_id)` exists to optimize the notoriously expensive `$O(N)` recursive lookup queries required to generate hierarchical DOM elements (e.g., fetching all grandchildren of Category ID #5).
- **`slug`**: A tenant-unique URI mapping (`idx_categories_tenant_slug(tenant_id, slug)`). Crucial for frontend API queries resolving vanity URLs rather than exposing raw Primary Keys.
- **`order`**: Used as a manual `asc` sorting coefficient by tenant operators.

## Security Policies
Requires middleware `tenant.capability:category.view` to serialize trees, and mutations (e.g., node reassignment) are restricted via `category.edit`. All deletions (`cascade`) recursively destroy orphaned child-categories preventing corrupt subtrees.
