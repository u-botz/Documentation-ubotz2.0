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

The runtime table is **`tenant_landing_pages`** (not `landing_pages`). The original create migration `2026_03_13_154702_create_landing_pages_table.php` introduced `tenant_id` and nullable `template_id` without a foreign key to the platform catalog. **`2026_03_14_051146_rename_and_alter_landing_pages_table.php`** renames the table to **`tenant_landing_pages`**, renames **`template_id` → `source_template_id`**, and adds page fields (`title`, `slug`, `is_homepage`, SEO columns, `color_overrides`, etc.).

Related migrations:

- `2026_03_13_154703_create_landing_page_sections_table.php` — section payloads (FK targets evolved with table renames; see current migrations)
- Later alters: media tables, `2026_03_19_100000_add_template_slug_to_tenant_landing_pages.php`, `2026_03_21_100300_seed_tenant_website_settings_from_landing_pages.php`

**Cross-database FK:** `source_template_id` is **not** a MySQL foreign key to the central template table (templates live in the **central** database; tenant data is in the **tenant** database). **Referential integrity** is enforced in application code — e.g. **`CloneTemplateUseCase`** loads the template via **`LandingPageTemplateRepositoryInterface::findByIdOrFail`** before cloning. A bad or stale `source_template_id` stored manually would surface as missing template or inconsistent public rendering, not as a DB-level FK violation.

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
