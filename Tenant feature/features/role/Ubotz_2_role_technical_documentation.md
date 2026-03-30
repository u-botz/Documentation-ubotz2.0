# UBOTZ 2.0 Role Technical Specification

## Core Architecture
Roles are managed as platform-level definitions applied per-tenant. The implementation utilizes a Centralized RBAC model where role definitions live in the Central DB to ensure consistency across the platform.

## Relational Schema Constraints

### 1. Definitions (Central DB)
- **`tenant_roles`**: Stores the role identity (`slug`, `display_name`).
- **`tenant_capabilities`**: The master list of all possible actions in the system.
- **`tenant_role_capabilities`**: The join table mapping capabilities to specific roles (`idx_role_capability`).

### 2. Assignments (Tenant DB)
- **`user_role_assignments`**: Links a `user_id` inside a tenant's database to a `role_id` from the central catalog.
  - **Constraint**: One primary role is typically assigned per user, though the schema supports multiple assignments for complex staff duties.

## Authorization Middleware
Access control is enforced via the `tenant.capability:{slug}` middleware.
1. The middleware identifies the authenticated User.
2. It resolves the User's assigned Roles from `user_role_assignments`.
3. it checks if any assigned Role possesses the required Capability in `tenant_role_capabilities`.
4. If found, the request proceeds; otherwise, a `403 Forbidden` is returned.

## Performance Optimization
- **Caching**: Capability assignments are heavily cached using Redis (namespaced by `tenant_id`) to avoid expensive cross-database joins on every HTTP request.
- **Indices**: `uq_tenant_roles_tenant_slug` ensures role uniqueness within a tenant scope.

---

## Linked References
- Security Checklist: See `Global Rule § RBAC`.
- Related Modules: `User`, `Auth`.
