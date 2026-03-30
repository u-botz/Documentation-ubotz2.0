# UBOTZ 2.0 Tenant Provisioning Technical Specification

## Core Architecture
Provisioning is the core logic managed by the Platform Root. It is responsible for initializing the `TenantContext` for every institution.

## Relational Schema Constraints (`tenants`)
Derived from the `2026_02_17_214641_create_tenants_table.php` schema in the Central DB:

| Column | Technical Significance |
| :--- | :--- |
| **`slug`** | unique indexed URI identifier used by `ResolveTenant` middleware. |
| **`db_dedicated`** | Boolean flag determining which database driver to instantiate at runtime. |
| **`status`** | Primary state machine (`pending`, `active`, `suspended`, `archived`). |
| **`settings`** | JSON store for tenant-wide environmental overrides (timezones, locales). |

## Provisioning Pipeline
Handled by the `ProvisionTenantJob`:
1. **Validation**: Check for `slug` and `domain` collision in `tenants`.
2. **Registration**: Create `tenants` record and default `tenant_configs`.
3. **Seeding**:
   - Seed default `tenant_roles` and `tenant_role_capabilities` for the new institution.
   - Create initial `User` (Owner role).
4. **Subscription Initialization**: Assign the selected `subscription_plan`.

## Security & Performance
- **Run Tracking**: `tenant_provisioning_runs` table tracks every attempt, ensuring audit integrity for Super Admins.
- **Middleware Integration**: Every request to a tenant subdomain runs through the `ResolveTenant` middleware which queries the `tenants` table to verify active status before yielding execution.
- **Custom Domains**: `tenant_domain_mappings` allowing for CNAME aliases (e.g. `lms.oxford.edu`) mapping back to the primary slug.

---

## Linked References
- Related Modules: `Subscription`, `Auth`, `Role`.
