# UBOTZ 2.0 Custom Domain Technical Specification

## Core Architecture
Custom Domain management is a cross-database concern handled by the `TenantAdminDashboard\CustomDomain` context. It interacts with the Platform Router to manage SSL and CNAME resolution.

## Relational Schema Constraints (`tenant_custom_domains`)
Derived from the `2026_03_14_075524_create_tenant_custom_domains_table.php` schema:

| Column | Technical Significance |
| :--- | :--- |
| **`tenant_id`** | Ties the domain to a specific organizational context. |
| **`verification_token`** | Secret string used for the `TXT` DNS challenge. |
| **`cname_verified`** | Boolean flag indicating the alias points correctly to the Ubotz ingress. |
| **`last_dns_check_at`** | Timestamp used by the `DnsMonitorCron` to schedule re-verification. |

## Key Technical Workflows

### The Domain Verification Pipeline
1. Tenant submits domain. system generates `verification_token`.
2. `PerformDnsCheckJob` executes `dns_get_record()` for the target.
3. If TXT and CNAME match platform constants, `txt_verified` and `cname_verified` are toggled.
4. Once all vectors are true, the domain moves to `activated_at`.

### Traffic Routing (Proxy Layer)
The Platform Ingress identifies incoming `Host` headers. If the host matches an active entry in `tenant_custom_domains`, the `ResolveTenant` middleware overrides the slug-based resolution with the `tenant_id` associated with the custom domain.

## Tenancy & Security
- **Collision Prevention**: Unique constraint at the network level prevents two tenants from claiming the same domain.
- **Cleanup**: `removed_at` allows for soft-deletion and historical auditing of domain ownership.

---

## Linked References
- Related Modules: `Tenant-Provisioning`.
