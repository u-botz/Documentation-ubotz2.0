# UBOTZ 2.0 — Feature Status Report: Landing Page

> **Instructions:** Copy this template for each feature. Fill every section honestly. If something is missing, write "NOT IMPLEMENTED" — do not skip the section. This document feeds directly into the Principal Engineer audit pipeline.

| Field | Value |
|---|---|
| **Feature Name** | Landing Page |
| **Bounded Context** | TenantAdminDashboard (also has PublicFacing & SuperAdmin components) |
| **Date Reported** | 2026-03-20 (updated) |
| **Reported By** | AI Agent |
| **Current Status** | Working |
| **Has Developer Instructions Doc?** | Yes — `backend/documentation/Ubotz 2 phase 13a developer instructions.md` (and related Phase 13 docs) |
| **Has Implementation Plan?** | See Phase 13A / 13B implementation plans under `backend/documentation/platformm features/landing page/` |
| **Was Principal Engineer Audit Done?** | No |

---

## 1. What This Feature Does (2–3 sentences)

The Landing Page feature enables tenant administrators to create, customize, and manage public-facing informational pages (like homepages, course lists, and contact forms). It supports cloning from central templates, managing distinct page sections (e.g., hero, testimonials), customizing branding/SEO, navigation, and media uploads, and compiling these settings into a live public view for students and prospects.

---

## 2. Backend Architecture

### 2.1 Controllers

| Controller | Methods | Notes |
|---|---|---|
| `LandingPageReadController` | `index`, `show` | Tenant pages list & detail |
| `LandingPageWriteController` | `clone`, `updateMetadata`, `updateSeo`, `updateColors`, `publish`, `unpublish`, `destroy` | Page lifecycle & settings |
| `LandingPageMediaController` | `upload`, `destroy` | Hero images, logos, etc. |
| `TenantPageSectionController` | `reorder`, `update`, `toggleVisibility` | Section content & ordering |
| `TenantNavigationController` | `show`, `update` | Tenant website navigation |
| `TenantTemplateReadController` | `index` | Published template catalog (central templates) |
| `PublicPageController` (PublicFacing) | `listPageSlugs`, `getHomepage`, `getPageBySlug` | Unauthenticated public delivery under `/api/public/tenants/{tenantSlug}/website/...` |
| `PublicNavigationController` | `index` | Public navigation for website |

### 2.2 UseCases / Queries

| UseCase / Query | Purpose | Injects Audit Logger? | Injects Quota Service? |
|---|---|---|---|
| `CloneTemplateUseCase` | Creates a tenant page from a central template | Yes (via events) | Yes (page quota) |
| `UpdatePageMetadataUseCase` | Updates title, slug, homepage flag | Yes (via events) | N/A |
| `UpdatePageSeoUseCase` | Meta title, description, OG image | Yes (via events) | N/A |
| `UpdatePageColorsUseCase` | Branding / color overrides | Yes (via events) | N/A |
| `PublishPageUseCase` / `UnpublishPageUseCase` | Status transitions | Yes (via events) | N/A |
| `GetLandingPageQuery` / `ListLandingPagesQuery` | Read models | N/A | N/A |

### 2.3 Domain Layer

| Component | Type | Location | Notes |
|---|---|---|---|
| `LandingPage` | Entity | `Domain/TenantAdminDashboard/LandingPage/Entities/` | |
| `LandingPageSection` | Entity | `Domain/TenantAdminDashboard/LandingPage/Entities/` | |
| `PageStatus` | Value Object | `Domain/TenantAdminDashboard/LandingPage/ValueObjects/` | |
| Reserved slug rules | Various | Domain / use cases | Prevents routing collisions |

### 2.4 Domain Events

| Event Class | Trigger | Has Listener? |
|---|---|---|
| `TenantLandingPageCreated` | After clone / creation | Yes |
| `TenantLandingPageDeleted` | After page removed | Yes |
| `TenantLandingPagePublished` | After publish | Yes |
| `TenantLandingPageUnpublished` | After unpublish / draft | Yes |
| `TenantNavigationUpdated` | After navigation replace | Yes (if wired) |

### 2.5 Infrastructure Layer

| Component | Type | Notes |
|---|---|---|
| `EloquentLandingPageRepository` | Repository | Tenant-scoped |
| `EloquentLandingPageSectionRepository` | Repository | |
| `EloquentLandingPageMediaRepository` | Repository | |
| Persistence models | Eloquent | Under `Infrastructure/Persistence/.../LandingPage/` |

### 2.6 Exceptions

| Exception Class | When Thrown |
|---|---|
| `LandingPageNotFoundException` | ID/slug not found for tenant |
| `LandingPageQuotaExceededException` | Clone/create beyond plan limits |
| `ReservedPageSlugException` | Reserved slug |
| `DuplicatePageSlugException` | Slug already in use |
| `InvalidPageStatusTransitionException` | Invalid state transition |

---

## 3. Database Schema

### 3.1 Tables

**Table: `landing_pages`** (evolved from earlier `tenant_landing_pages` naming in some environments)

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | BIGINT UNSIGNED PK | No | |
| `tenant_id` | BIGINT UNSIGNED FK | No | Scopes all data |
| `template_id` | BIGINT UNSIGNED | Yes | References central template |
| `template_slug` | VARCHAR | Yes | Decoupling / audit |
| Branding / `color_overrides` | JSON | Yes | |
| `seo_config` | JSON | Yes | |
| `status` | VARCHAR(30) | No | Default `draft` |
| `published_at` | TIMESTAMP | Yes | |
| `created_at` / `updated_at` | TIMESTAMP | No | |

**Table: `landing_page_sections`**

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | BIGINT UNSIGNED PK | No | |
| `tenant_id` | BIGINT UNSIGNED FK | No | |
| `landing_page_id` | BIGINT UNSIGNED FK | No | |
| `section_type` | VARCHAR(50) | No | |
| `title` | VARCHAR | Yes | |
| `content` | JSON | Yes | |
| `sort_order` | INTEGER | No | |
| `is_enabled` | BOOLEAN | No | |
| `created_at` / `updated_at` | TIMESTAMP | No | |

### 3.2 Relationships

| From Table | To Table | Type | FK Column |
|---|---|---|---|
| `landing_pages` | `tenants` | BelongsTo | `tenant_id` |
| `landing_page_sections` | `landing_pages` | BelongsTo | `landing_page_id` |
| `landing_page_media` | `landing_pages` | BelongsTo | `landing_page_id` |

---

## 4. API Endpoints

**Prefix:** All tenant routes below are mounted under `Route::prefix('tenant')` in `routes/api.php` → full path **`/api/tenant/{path}`**.

### 4.1 Tenant capabilities (RBAC)

Capabilities are defined in **`database/seeders/TenantCapabilitySeeder.php`** and assigned to **owner** and **admin** in **`database/seeders/TenantRoleCapabilitySeeder.php`**:

| Capability code | Meaning |
|---|---|
| `landing_page.view` | List/read pages, templates catalog, navigation (GET) |
| `landing_page.manage` | Clone, edit metadata/SEO/colors, publish/unpublish, sections, media, navigation (mutations) |

**Implementation note (2026-03):** Tenant routes in `routes/tenant_dashboard/landing_page.php` use **`tenant.capability:landing_page.view`** for read operations and **`tenant.capability:landing_page.manage`** for writes. Older docs referenced `website.manage`, which was **not** present in `tenant_capabilities` — that mismatch caused **403** for correctly seeded tenants; routes are now aligned with seeded codes.

### 4.2 Tenant admin API (authenticated)

| Method | URI | Controller | Capability |
|---|---|---|---|
| `GET` | `/api/tenant/navigation` | `TenantNavigationController@show` | `landing_page.view` |
| `PUT` | `/api/tenant/navigation` | `TenantNavigationController@update` | `landing_page.manage` |
| `GET` | `/api/tenant/landing-page-templates` | `TenantTemplateReadController@index` | `landing_page.view` |
| `GET` | `/api/tenant/landing-pages` | `LandingPageReadController@index` | `landing_page.view` |
| `GET` | `/api/tenant/landing-pages/{id}` | `LandingPageReadController@show` | `landing_page.view` |
| `POST` | `/api/tenant/landing-pages/clone` | `LandingPageWriteController@clone` | `landing_page.manage` |
| `DELETE` | `/api/tenant/landing-pages/{id}` | `LandingPageWriteController@destroy` | `landing_page.manage` |
| `PUT` | `/api/tenant/landing-pages/{id}/metadata` | `LandingPageWriteController@updateMetadata` | `landing_page.manage` |
| `PUT` | `/api/tenant/landing-pages/{id}/seo` | `LandingPageWriteController@updateSeo` | `landing_page.manage` |
| `PUT` | `/api/tenant/landing-pages/{id}/colors` | `LandingPageWriteController@updateColors` | `landing_page.manage` |
| `POST` | `/api/tenant/landing-pages/{id}/publish` | `LandingPageWriteController@publish` | `landing_page.manage` |
| `POST` | `/api/tenant/landing-pages/{id}/unpublish` | `LandingPageWriteController@unpublish` | `landing_page.manage` |
| `PUT` | `/api/tenant/landing-pages/{pageId}/sections/reorder` | `TenantPageSectionController@reorder` | `landing_page.manage` |
| `PUT` | `/api/tenant/landing-pages/{pageId}/sections/{sectionId}` | `TenantPageSectionController@update` | `landing_page.manage` |
| `PATCH` | `/api/tenant/landing-pages/{pageId}/sections/{sectionId}/visibility` | `TenantPageSectionController@toggleVisibility` | `landing_page.manage` |
| `POST` | `/api/tenant/landing-page/media` | `LandingPageMediaController@upload` | `landing_page.manage` |
| `DELETE` | `/api/tenant/landing-page/media/{id}` | `LandingPageMediaController@destroy` | `landing_page.manage` |

*Dynamic segments `{id}`, `{pageId}`, `{sectionId}` are registered with `whereNumber` where applicable to avoid clashes with literal paths (e.g. `pending-count` patterns elsewhere).*

### 4.3 Public API (unauthenticated)

Prefix: **`/api/public/tenants/{tenantSlug}/website`** (see `routes/api.php`).

| Method | URI | Purpose |
|---|---|---|
| `GET` | `.../navigation` | Public navigation |
| `GET` | `.../pages` | List page slugs |
| `GET` | `.../pages/homepage` | Homepage payload |
| `GET` | `.../pages/{pageSlug}` | Page by slug |
| `GET` | `.../courses` | Public courses listing |
| `GET` | `.../stats` | Public stats |
| `POST` | `.../contact` | Contact form |
| `GET` | `.../custom-domain` | Custom domain hint for frontend |

---

## 5. Security Checklist

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | All queries scoped by `tenant_id`? | Yes | Repositories / tenant context |
| 2 | User-level isolation for pages? | N/A | Pages are tenant-wide (not per end-user file ownership like File Manager) |
| 3 | `tenant.capability` on tenant routes? | Yes | `landing_page.view` / `landing_page.manage` |
| 4 | Audit log for mutations? | Yes | Via domain/application patterns |
| 5 | Audit outside failing transactions where required? | Yes | Follow project audit rules |
| 6 | Domain events after commit where required? | Yes | |
| 7 | Idempotency for clone? | Partial | Upload/idempotency patterns exist in file flows; confirm clone header if product requires |
| 8 | FormRequest for all input? | Partial | Some validation still inline in controllers — prefer FormRequests |
| 9 | Uploads validated (MIME/size)? | Yes | Media controller + policies |
| 10 | Financial `_cents` | N/A | |
| 11 | Soft deletes | Partial | Confirm product stance on page delete |
| 12 | No raw SQL in controllers | Yes | |
| 13 | Tenant global scopes | Yes | |
| 14 | No sensitive leakage in JSON | Yes | |

---

## 6. Frontend

### 6.1 File Location

```
frontend/features/landing-page/
frontend/app/(website)/...
frontend/app/tenant-admin-dashboard/landing-page/...
```

### 6.2 API alignment

Tenant admin UI must call the **actual** backend paths (`/api/tenant/landing-pages`, `/api/tenant/navigation`, etc.). Older client code that used **`/api/tenant/landing-page/pages`** will **404** — align `API_ENDPOINTS` / services with section **4.2**.

### 6.3 Capability-Based UI Gating

| UI Element | Capability | Notes |
|---|---|---|
| View pages / templates | `landing_page.view` | |
| Edit, publish, navigation, media | `landing_page.manage` | |

---

## 7. Tests

| Test file (feature) | Passing? |
|---|---|
| `ManageLandingPageTest.php` | Yes |
| `ManagePageSectionsTest.php` | Yes |
| `MediaUploadTest.php` | Yes |
| `TenantLandingPageTest.php` | Yes |
| `TenantNavigationTest.php` | Yes |
| `LandingPageIsolationTest.php` (security) | Yes |
| Unit tests under `tests/Unit/.../LandingPage/` | Yes |

Run: `php artisan test --filter=LandingPage`

---

## 8. Known Issues & Gaps

| # | Issue | Severity | Notes |
|---|---|---|---|
| 1 | Inline validation in some controllers | Low | Prefer dedicated FormRequests |
| 2 | Hard delete of pages / cascade sections | Medium | Confirm backup / soft-delete product requirement |
| 3 | Frontend endpoint config drift | Medium | Ensure tenant services use `/api/tenant/landing-pages` not legacy paths |

### Resolved / changelog

| Date | Change |
|---|---|
| 2026-03 | Tenant routes aligned with seeded capabilities `landing_page.view` / `landing_page.manage` (replacing non-seeded `website.manage` on routes). |

---

## 9. Dependencies on Other Features

| Depends On | How |
|---|---|
| Central landing page templates | Clone source, institution type linkage |
| Subscription / quotas | Page or storage limits on clone |
| Institution types | Template catalog filtering (where applicable) |
| Courses / bundles | Often embedded in public page payloads |

---

## 10. File Tree (Backend — indicative)

```
routes/tenant_dashboard/landing_page.php
app/Http/Controllers/TenantAdminDashboard/LandingPage/
app/Http/Controllers/PublicFacing/LandingPage/
app/Application/TenantAdminDashboard/LandingPage/
app/Domain/TenantAdminDashboard/LandingPage/
app/Infrastructure/Persistence/TenantAdminDashboard/LandingPage/
database/seeders/TenantCapabilitySeeder.php   # landing_page.view, landing_page.manage
database/seeders/TenantRoleCapabilitySeeder.php # assigns to owner, admin
```

---

> **Reminder:** This report is input for the Principal Engineer audit. Incomplete or inaccurate information here means the audit will miss real issues or flag false positives. When in doubt, check the actual code — do not guess.

*End of report*
