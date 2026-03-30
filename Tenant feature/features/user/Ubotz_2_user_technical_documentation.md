# UBOTZ 2.0 User Technical Specification

## Core Architecture
Users are the primary entities within the `TenantAdminDashboard\User` bounded context. They are persisted in the tenant-specific database but are rigorously scoped to ensure platform-wide data integrity.

## Relational Schema Constraints (`users`)
Derived from the `2026_02_22_000001_create_users_table.php` schema:

| Column | Technical Significance |
| :--- | :--- |
| **`tenant_id`** | **CRITICAL:** Foundational isolation key. Every query MUST apply this scope via `BelongsToTenant`. |
| **`email`** | Unique only when combined with `tenant_id` (`unq_users_email_tenant`). |
| **`token_version`** | Int-based versioning for JWT/Session invalidation. Incrementing this immediately logs the user out globally. |
| **`status`** | Enforced at the `Auth` middleware layer. Non-active statuses (e.g., `invited`, `locked`) block session instantiation. |

## Extended Schemas
The User module is augmented by several sub-tables for rich profiles:
- `user_education_records` / `user_experience_records`
- `user_occupations`
- `user_branch_assignments`: Links users to the physical `Branch` context.

## Performance & Security
- **Indices**: `idx_users_tenant_status` ensures rapid filtering for dashboard user listings.
- **Audit**: `last_login_ip` and `last_login_at` provide a baseline security trail for tenant administrators.
- **Force Reset**: `force_password_reset` boolean is checked during the login handshake to redirect users to the password update flow.

---

## Linked References
- Multi-Tenancy Invariants: See `Backend Architecture Master § 5.1`.
- Related Modules: `Role`, `Tenant-Provisioning`.
