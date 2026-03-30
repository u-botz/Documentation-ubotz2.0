# UBOTZ 2.0 — Landing Page / Tenant Website — Technical Specification

## Scope

Three layers:

1. **Platform (Super Admin)** — catalog of **landing page templates** (lifecycle, approval). Routes in `backend/routes/super_admin/landing_page_templates.php`, included from `backend/routes/api.php` under the platform prefix (e.g. `/api/platform/landing-page-templates`).
2. **Tenant admin** — website builder: pages, sections, navigation, theme, display config, media, custom pages. Routes in `backend/routes/tenant_dashboard/landing_page.php` under `/api/tenant`.
3. **Public site** — read-only JSON for published website (navigation, theme, pages, courses, blog, stats, contact). Routes in `backend/routes/api.php` under `public/tenants/{tenantSlug}/website` (throttled).

## Tenant admin routes

**Module:** `tenant.module:module.website`  
**Capabilities:** `landing_page.view` (read), `landing_page.manage` (writes)

| Area | Read (`landing_page.view`) | Write (`landing_page.manage`) |
|------|----------------------------|-------------------------------|
| Navigation | `GET /api/tenant/navigation` | `PUT /api/tenant/navigation` |
| Templates catalog | `GET /api/tenant/landing-page-templates`, `GET .../{id}` | — |
| Landing pages | `GET /api/tenant/landing-pages`, `GET .../{id}` | `POST .../clone`, `DELETE .../{id}`, `PUT .../metadata`, `seo`, `colors`, `POST .../publish`, `.../unpublish`, section reorder/update/visibility, `POST/DELETE` landing-page media |
| Theme / display | `GET /api/tenant/website-theme`, `GET /api/tenant/website-display-config` | `PUT` both |
| Custom pages | `GET /api/tenant/custom-pages`, `GET .../{id}` | `POST`, `PUT`, `POST .../publish`, `.../unpublish`, `DELETE` |

Custom page controllers: `TenantCustomPageReadController` / `TenantCustomPageWriteController` (same route file).

## Public website routes

Prefix: **`/api/public/tenants/{tenantSlug}/website`** (middleware `throttle:60,1` on the group).

Includes: `navigation`, `theme`, `pages` + homepage + slug, `courses` + detail + curriculum, `blog/*`, `stats`, `contact` (POST), `custom-domain` (Phase 13B).

**Checkout:** `POST /api/public/tenants/{tenantSlug}/website/courses/{courseSlug}/checkout` — separate middleware stack (`public.website.tenant`, `auth:tenant_api`, etc.).

## Data model (tenant)

Core tables evolved via migrations such as:

- `2026_03_13_154702_create_landing_pages_table.php` — `tenant_id`, nullable `template_id` (**no FK** — ids reference the central template catalog), `branding` / `seo_config` JSON, `status`, `published_at`
- `2026_03_13_154703_create_landing_page_sections_table.php` — section payloads for pages
- Later renames/alters: `2026_03_14_051127_*`, `051128_*`, media table create/drop/rename cycles — use current schema from latest migrations
- `2026_03_19_100000_add_template_slug_to_tenant_landing_pages.php`, `2026_03_21_100300_seed_tenant_website_settings_from_landing_pages.php`

`template_id` is intentionally not a MySQL foreign key to the central DB; application services validate template availability.

## Frontend configuration

`frontend/config/api-endpoints.ts`:

- **`PLATFORM_LANDING_PAGE`** — platform template API
- **`TENANT_LANDING_PAGE`** — tenant builder (`PAGES`, `CLONE`, `SECTION_*`, `NAVIGATION`, `MEDIA`, `WEBSITE_THEME`, `WEBSITE_DISPLAY_CONFIG`, `CUSTOM_PAGES`, …)

Feature code: `frontend/features/landing-page/` (templates, types).

## Related

- **Custom domain:** `routes/tenant_dashboard/custom_domain.php`; see `TENANT_CUSTOM_DOMAIN` in `api-endpoints.ts`
- **Leads:** public lead capture is documented under Lead Management (`POST /api/public/tenants/{tenantSlug}/leads`)

---

## Linked references

- **Lead management** — public lead submission and CRM
- **Platform** — template authoring and approval workflow
