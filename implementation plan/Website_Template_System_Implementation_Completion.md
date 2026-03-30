# Website Template System — Implementation Completion Report

**Date:** March 21, 2026  
**Scope:** Phases 13C + 13D aligned with [EducoreOS Website Template System Requirements](EducoreOS_Website_Template_System_Requirements%20(1).md)  
**API prefix (actual):** `/api/public/tenants/{tenantSlug}/website/...` (not the doc’s shorthand)

This document summarizes what was implemented, where it lives in the repo, and intentional gaps or follow-up work.

---

## 1. Executive summary

The platform now supports:

- **Tenant website theme** persisted per tenant (`tenant_website_settings`), with defaults from central `landing_page_templates.default_theme_config`, cloned when a tenant clones a template.
- **Data-driven public pages** for **courses** (catalog, detail, curriculum) and **blog** (list, categories, post by slug), plus **branded auth routes** on the Next.js site (`/auth/login`, `/auth/register` placeholder).
- **Public checkout** for paid courses (`POST .../website/courses/{courseSlug}/checkout`) using existing fee/Razorpay initiation and free enrollment for zero-price courses, with tenant context resolved from the URL slug (not `tenant.resolve.token`).
- **Navigation** extended with `course_catalog` and `login` link types; **reserved slugs** extended so tenants cannot claim `courses`, `blog`, `login`, `register`.
- **Frontend** page-type dispatch per template slug (five templates), shared data views, and `TenantWebsiteChrome` wrapping data routes in each template’s existing **Layout** (header/footer remain inside template layouts rather than separate `Header.tsx`/`Footer.tsx` files).

---

## 2. Backend (Laravel)

### 2.1 Database

| Artifact | Purpose |
|----------|---------|
| Central migration `default_theme_config` on `landing_page_templates` | Default theme JSON for new clones |
| Tenant `tenant_website_settings` | `active_template_slug`, `theme_config` JSON |
| Tenant `tenant_website_display_config` | Display preferences for catalog/blog (tenant admin GET/PUT) |
| Seed migration from `tenant_landing_pages` | Backfill theme for existing tenants from homepage `color_overrides` / `template_slug` |

### 2.2 Domain & configuration

- **`ReservedSlug`:** `courses`, `blog`, `login`, `register`.
- **`LinkType`:** `course_catalog`, `login` (plus existing internal, external, blog).
- **`CloneTemplateUseCase`:** After cloning landing page sections, upserts `tenant_website_settings` via `WebsiteThemeDefaults::mergeWithTemplateDefaults()` and `LandingPageTemplateRepositoryInterface::getDefaultThemeConfigById()`.
- **Repositories:** `TenantWebsiteSettingsRepositoryInterface`, `TenantWebsiteDisplayConfigRepositoryInterface` (Eloquent implementations).

### 2.3 Public HTTP API (read + checkout)

Registered in [`backend/routes/api.php`](../../backend/routes/api.php) under `public/tenants/{tenantSlug}/website`:

| Method | Path (relative to `/api`) | Notes |
|--------|---------------------------|--------|
| GET | `public/tenants/{tenantSlug}/website/theme` | Theme + `tenant_name` |
| GET | `.../courses` | `catalog=1` (or `full`) for paginated catalog; else legacy list with `limit` |
| GET | `.../courses/{courseSlug}` | Published course detail |
| GET | `.../courses/{courseSlug}/curriculum` | Structure only (titles/types); no protected content |
| GET | `.../blog/categories` | |
| GET | `.../blog/posts` | Paginated; `PUBLISHED` posts |
| GET | `.../blog/posts/{postSlug}` | |
| POST | `public/tenants/{tenantSlug}/website/courses/{courseSlug}/checkout` | **Separate route group:** `public.website.tenant`, `auth:tenant_api`, `tenant.active`, `ensure.user.active` |

**Middleware:** [`SetTenantContextFromPublicWebsiteSlug`](../../backend/app/Http/Middleware/SetTenantContextFromPublicWebsiteSlug.php) (alias `public.website.tenant`) sets `TenantContext` from `{tenantSlug}` so `auth:tenant_api` works without `tenant.resolve.token` on this path.

**Checkout controller:** [`PublicWebsiteCourseCheckoutController`](../../backend/app/Http/Controllers/PublicFacing/LandingPage/PublicWebsiteCourseCheckoutController.php) — free courses → `EnrollStudentUseCase`; paid → `InitiateCoursePurchaseUseCase` (same pipeline as tenant dashboard student payments).

### 2.4 Tenant admin API

In [`backend/routes/tenant_dashboard/landing_page.php`](../../backend/routes/tenant_dashboard/landing_page.php) (under authenticated `/api/tenant` group):

- `GET/PUT website-theme`
- `GET/PUT website-display-config`

Controllers: `TenantWebsiteThemeController`, `TenantWebsiteDisplayConfigController` with form requests for JSON payloads.

### 2.5 Query / infrastructure highlights

- **Theme:** `PublicWebsiteThemeQueryServiceInterface` → `EloquentPublicWebsiteThemeQuery`
- **Courses:** `PublicCourseQueryServiceInterface` extended (catalog, detail, curriculum) → `EloquentPublicCourseQuery`
- **Blog:** `PublicBlogQueryServiceInterface` → `EloquentPublicBlogQuery`

Bindings in [`AppServiceProvider`](../../backend/app/Providers/AppServiceProvider.php).

---

## 3. Frontend (Next.js)

### 3.1 Public API client

[`frontend/services/public-website-service.ts`](../../frontend/services/public-website-service.ts) — theme, course catalog/detail/curriculum, checkout, blog endpoints (paths match `/api/public/tenants/{slug}/website/...`).

[`frontend/services/tenant-landing-page-service.ts`](../../frontend/services/tenant-landing-page-service.ts) — `getWebsiteTheme`, `updateWebsiteTheme`, display config helpers.

[`frontend/config/api-endpoints.ts`](../../frontend/config/api-endpoints.ts) — `WEBSITE_THEME`, `WEBSITE_DISPLAY_CONFIG` under `TENANT_LANDING_PAGE`.

### 3.2 Page-type registry & templates

- [`page-type-registry.tsx`](../../frontend/features/landing-page/components/public-renderer/page-type-registry.tsx) maps `(templateSlug, pageType)` → component for: `course_catalog`, `course_detail`, `blog_listing`, `blog_post`, `login`.
- Each of the five template folders includes thin wrappers (e.g. `CoachingProCourseCatalog.tsx`) delegating to shared views under [`data-pages/`](../../frontend/features/landing-page/components/public-renderer/data-pages/).
- [`TenantWebsiteChrome`](../../frontend/features/landing-page/components/public-renderer/tenant-website-chrome.tsx) wraps pages with the selected template’s **Layout** and theme-derived `colorOverrides`.

### 3.3 Navigation

- [`resolve-public-nav-href.ts`](../../frontend/features/landing-page/utils/resolve-public-nav-href.ts) resolves `link_type` + `link_value` to paths under `/{tenantSlug}/...`.
- All five template **Layout** components accept optional `tenantSlug` and use `Link` + resolver for nav items.

### 3.4 App routes (website)

Under `frontend/app/(website)/[tenantSlug]/`:

| Route | Purpose |
|-------|---------|
| `courses/page.tsx` | Course catalog |
| `courses/[courseSlug]/page.tsx` | Course detail |
| `blog/page.tsx` | Blog listing |
| `blog/[postSlug]/page.tsx` | Blog post |
| `auth/login/page.tsx` | Branded login (shell + `TenantLoginView`) |
| `auth/register/page.tsx` | Placeholder / link back to login |

Shared loaders: [`frontend/app/(website)/lib/public-website-loaders.ts`](../../frontend/app/(website)/lib/public-website-loaders.ts).  
Several routes use `export const revalidate = 60` for ISR-style caching.

### 3.5 Tenant admin UI

- [`frontend/app/tenant-admin-dashboard/landing-page/theme/page.tsx`](../../frontend/app/tenant-admin-dashboard/landing-page/theme/page.tsx) — JSON editor for `theme_config`
- [`frontend/app/tenant-admin-dashboard/landing-page/display-config/page.tsx`](../../frontend/app/tenant-admin-dashboard/landing-page/display-config/page.tsx) — JSON editor for display `config`

---

## 4. Testing

| Test | Location |
|------|----------|
| Public theme endpoint | `backend/tests/Feature/Public/LandingPage/PublicWebsiteThemeTest.php` |
| Public blog (empty tenant, 404 slug) | `backend/tests/Feature/Public/LandingPage/PublicBlogTest.php` |
| Reserved slugs | `backend/tests/Unit/Domain/ReservedSlugTest.php` |
| Existing tenant landing clone flow | `TenantLandingPageTest` (still passing after clone/theme changes) |

---

## 5. Deviations from the original written plan

| Plan item | What we shipped |
|-----------|------------------|
| Separate `Header.tsx` / `Footer.tsx` per template | **Not added as standalone files.** Chrome is the existing per-template **Layout** (header + footer embedded), reused via `TenantWebsiteChrome`. |
| `public-navbar.tsx` / `public-footer.tsx` as fallback for templates without custom chrome | Data routes use template Layout via `TenantWebsiteChrome`; legacy non-template pages may still use shared navbar/footer where applicable. |
| `page-type-registry.ts` | Implemented as **`page-type-registry.tsx`** (TSX) for React components. |
| Razorpay widget on course detail | **Not fully wired** — UI can show a message; client should integrate Razorpay Checkout with `checkout` response (`razorpay_order_id`, `key_id`, etc.) in a follow-up. |
| Tenant login `POST` | Form targets `/api/tenant/auth/login`; production may require **subdomain** / `resolve.tenant.subdomain` — verify for your host setup. |

---

## 6. Explicit non-goals (requirements §9)

Unchanged: guest checkout, public reviews, blog comments, sitemap, analytics injection, social login on tenant page, coupons/installments on this checkout, i18n, new section types, full curriculum content preview on public pages.

---

## 7. Recommended next steps

1. **Razorpay Checkout** on the public course detail page using the existing checkout response shape and student `verify` flow after payment.
2. **Navigation UI** in tenant admin: expose `course_catalog` / `login` in the nav editor if not already visible (API supports them).
3. **JSON schema validation** for `theme_config` and display `config` on PUT (server-side) to match a documented v1 schema.
4. **Feature tests:** cross-tenant course access (403/404), unauthenticated checkout (401), reserved slug on landing page create.
5. **Optional:** extract dedicated `Header`/`Footer` components per template if design needs differ from monolithic Layout.

---

## 8. Key file index (quick reference)

| Area | Path |
|------|------|
| Public routes | `backend/routes/api.php` |
| Theme clone | `backend/app/Application/TenantAdminDashboard/LandingPage/UseCases/CloneTemplateUseCase.php` |
| Public course/blog/theme controllers | `backend/app/Http/Controllers/PublicFacing/LandingPage/` |
| Checkout | `PublicWebsiteCourseCheckoutController.php` |
| Middleware | `SetTenantContextFromPublicWebsiteSlug.php`, `bootstrap/app.php` alias `public.website.tenant` |
| Frontend data routes | `frontend/app/(website)/[tenantSlug]/...` |
| Page registry | `frontend/features/landing-page/components/public-renderer/page-type-registry.tsx` |

---

*End of completion document.*
