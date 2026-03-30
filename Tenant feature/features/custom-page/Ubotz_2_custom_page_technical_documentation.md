# UBOTZ 2.0 Custom Page Technical Specification

## Core Architecture
Custom Pages are managed within the `TenantAdminDashboard\CustomPage` context. They utilize a simple but highly performant per-tenant slug resolution engine.

## Relational Schema Constraints (`tenant_custom_pages`)
Derived from the `2026_03_21_120000_create_tenant_custom_pages_table.php` schema:

| Column | Technical Significance |
| :--- | :--- |
| **`tenant_id`** | Structural isolation key. |
| **`slug`** | unique per tenant (`uq_tenant_custom_page_slug`). |
| **`status`** | Filters visibility (`draft` vs `published`). |
| **`body`** | Stored as a large text/blob; supports HTML content. |

## Key Technical Workflows

### Request Resolution
1. A request comes in for `/p/{slug}`.
2. The `ResolveCustomPageMiddleware` identifies the `tenant_context`.
3. It queries the `tenant_custom_pages` table using the `slug` and `tenant_id`.
4. If found and `status == published`, the body is rendered; otherwise, a 404 is returned.

## Performance & Optimization
- **Indexing**: `idx_tenant_custom_pages_status` ensures that the list of publicly available pages can be retrieved with minimal latency for footer/menu generation.
- **Caching**: Page content is cached via Redis, with invalidation occurring only when the `updated_at` or `status` changes.

## Tenancy & Security
- **Body Sanitization**: While the module allows HTML, content is run through a server-side `Kysely` / `Purifier` layer to prevent Cross-Site Scripting (XSS) attacks by institutional administrators.

---

## Linked References
- Related Modules: `Landing-Page`.
