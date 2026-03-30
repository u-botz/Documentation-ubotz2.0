# UBOTZ 2.0 Custom Page Technical Specification

**Custom pages** are tenant-authored HTML content with a **slug**, managed alongside the **website / landing** stack. They share the same **`module.website`** gate and **`landing_page.view`** / **`landing_page.manage`** capabilities as landing pages (see `backend/routes/tenant_dashboard/landing_page.php`).

HTTP controllers: `App\Http\Controllers\TenantAdminDashboard\CustomPage\TenantCustomPageReadController`, `TenantCustomPageWriteController`.

---

## 1. HTTP surface (tenant API)

**Prefix:** `/api/tenant` (no extra segment — routes are `custom-pages` at the same level as `landing-pages`).

Requires **`tenant.module:module.website`**.

| Capability | Methods | Paths |
|------------|---------|--------|
| **`landing_page.view`** | `GET` | `/custom-pages`, `/custom-pages/{id}` |
| **`landing_page.manage`** | `POST`, `PUT`, `POST …/publish`, `POST …/unpublish`, `DELETE` | `/custom-pages`, `/custom-pages/{id}`, `/custom-pages/{id}/publish`, `/custom-pages/{id}/unpublish` |

**Frontend:** `frontend/config/api-endpoints.ts` — `TENANT_LANDING_PAGE.CUSTOM_PAGES`, `CUSTOM_PAGE`, `CUSTOM_PAGE_PUBLISH`, `CUSTOM_PAGE_UNPUBLISH`.

---

## 2. Relational schema (tenant DB)

Migration: `2026_03_21_120000_create_tenant_custom_pages_table.php` — table **`tenant_custom_pages`**.

| Column | Role |
|--------|------|
| `tenant_id` | Isolation; indexed |
| `title` | Display |
| `slug` | **`unique(tenant_id, slug)`** — `uq_tenant_custom_page_slug` |
| `body` | Long-form content (typically HTML from the editor) |
| `status` | Default `draft`; `published` for public resolution |
| `published_at` | Optional timestamp when published |
| `timestamps` | |

Index: `idx_tenant_custom_pages_status` on `(tenant_id, status)`.

---

## 3. Public resolution (marketing site)

Custom pages are **not** resolved by a dedicated `ResolveCustomPageMiddleware` name in the public stack. The **public page** pipeline loads **`tenant_landing_pages`** first, then **`tenant_custom_pages`** by **`slug`** and **`status = published`** — see `App\Infrastructure\Persistence\PublicFacing\LandingPage\EloquentPublicPageQuery` (`getPageBySlug` / `listPageSlugs` merges landing + custom slugs).

**Public API** (throttled): `GET /api/public/tenants/{tenantSlug}/website/pages/{pageSlug}` (see `backend/routes/api.php` and `PublicPageController`).

---

## 4. Slug collision

Tests assert **custom page slugs** cannot collide with reserved **landing page** slugs — see `TenantLandingPageTest::test_custom_page_slug_avoids_collision_with_landing_page`.

---

## 5. Performance, cache, sanitization

- **Indexing:** `(tenant_id, status)` supports admin lists and public lookups.
- **Caching:** Do not assume **Redis** invalidation for every deployment; confirm any cache layer in `PublicPageQuery` / read models before documenting SLAs.
- **XSS:** **`CreateCustomPageUseCase`** / **`UpdateCustomPageUseCase`** sanitize **`body`** via **`HtmlSanitizerInterface`** (**`HtmlPurifierSanitizer`**, **`ezyang/htmlpurifier`**) with the same allowlist as blog admin comments. Public/SPA output should still use safe rendering practices.

---

## 6. Linked code references

| Layer | Path |
|-------|------|
| HTTP | `backend/app/Http/Controllers/TenantAdminDashboard/CustomPage/` |
| Public query | `backend/app/Infrastructure/Persistence/PublicFacing/LandingPage/EloquentPublicPageQuery.php` |
| Routes | `backend/routes/tenant_dashboard/landing_page.php` |
| Tests | `backend/tests/Feature/TenantAdminDashboard/LandingPage/TenantLandingPageTest.php`, `backend/tests/Feature/Public/LandingPage/PublicCustomPageTest.php` |

---

## 7. Document history

- Removed unverified **middleware class name**, **Redis** guarantee, and **Kysely** reference; aligned with **`landing_page.php`**, migration, and **`EloquentPublicPageQuery`**.
- Documented **HTMLPurifier**-based write-path sanitization for custom page body.
