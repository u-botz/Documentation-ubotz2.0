# UBOTZ 2.0 — Landing Page: Full Technical Specification

| Field | Value |
|---|---|
| **Document Type** | Principal Engineer — Technical Specification |
| **Feature** | Landing Page Management |
| **Date** | 2026-03-27 |
| **Issued By** | Principal Engineer / Architecture Auditor |
| **Scope** | Full-stack: DB schemas, domain layer, application layer, HTTP layer, public delivery |
| **Status** | CURRENT — Reflects implemented codebase state |

---

## 1. System Architecture Overview

```
HTTP Layer (Platform Admin)
  → LandingPageTemplateController (CRUD, submit, approve, reject, archive)

HTTP Layer (Tenant Admin)
  → LandingPageReadController   (list, get single page)
  → LandingPageWriteController  (create, update, publish, unpublish, delete, sections)
  → LandingPageMediaController  (OG image upload)

HTTP Layer (Public)
  → PublicLandingPageController (serve tenant pages to unauthenticated visitors)

Application Layer
  → SuperAdminDashboard/LandingPage: ReadModel, UseCases
  → TenantAdminDashboard/LandingPage: Queries (GetLandingPageQuery, ListLandingPagesQuery)

Domain Layer
  → LandingPageTemplate   (platform entity — template governance)
  → TemplateStatus        (value object — 6 states)
  → LandingPage           (tenant entity — page builder)
  → LandingPageSection    (child entity — section content)
  → PageStatus            (value object — 2 states)
  → ReservedSlug          (value object — slug guard)

Infrastructure (Central DB)
  → LandingPageTemplateRecord         → landing_page_templates
  → EloquentLandingPageTemplateRepository
  → EloquentLandingPageReadModel

Infrastructure (Tenant DB)
  → LandingPageRecord                 → landing_pages
  → LandingPageSectionRecord          → landing_page_sections
  → LandingPageMediaRecord            → landing_page_media
  → EloquentLandingPageRepository
  → EloquentLandingPageSectionRepository
  → EloquentLandingPageMediaRepository
```

---

## 2. Database Schema

### 2.1 Table: `landing_page_templates` (Central DB)

| Column | Type | Notes |
|---|---|---|
| `id` | BIGINT (PK) | |
| `name` | VARCHAR(255) | Display name of the template. |
| `slug` | VARCHAR(255), Unique | URL-safe identifier. |
| `institution_type_id` | BIGINT (FK → `institution_types.id`), Nullable | Required before template can be published. |
| `status` | VARCHAR(30) | `draft`, `pending_publish`, `published`, `rejected`, `pending_archive`, `archived`. |
| `preview_image_url` | TEXT, Nullable | Thumbnail for template selection UI. |
| `default_meta_title` | VARCHAR(255), Nullable | Inherited by tenant pages at creation. |
| `default_meta_description` | TEXT, Nullable | Inherited by tenant pages at creation. |
| `rejection_reason` | TEXT, Nullable | Set on rejection. Cleared on next approval. |
| `published_at` | TIMESTAMP, Nullable | When first published. |
| `created_by` | BIGINT (FK → `admins.id`), Nullable | |
| `created_at` | TIMESTAMP | |
| `updated_at` | TIMESTAMP | |

---

### 2.2 Table: `landing_pages` (Tenant DB — per tenant)

| Column | Type | Notes |
|---|---|---|
| `id` | BIGINT (PK) | |
| `tenant_id` | BIGINT | Tenant scoped — all queries must filter by this. |
| `source_template_id` | BIGINT, Nullable | FK to platform `landing_page_templates.id`. Informational only after creation. |
| `template_slug` | VARCHAR(255), Nullable | Slug of source template at time of creation. |
| `title` | VARCHAR(255) | Tenant-defined page title. |
| `slug` | VARCHAR(255) | Tenant-unique URL slug (e.g., `about-us`). |
| `is_homepage` | BOOLEAN | True if this is the root-URL page. |
| `status` | VARCHAR(20) | `draft` or `published`. |
| `meta_title` | VARCHAR(255), Nullable | SEO title. |
| `meta_description` | TEXT, Nullable | SEO description. |
| `og_image_url` | TEXT, Nullable | Open Graph image for social sharing. |
| `color_overrides` | JSON, Nullable | Tenant brand colors (key-value pairs). |
| `published_at` | TIMESTAMP, Nullable | When the page was first published. |
| `created_at` | TIMESTAMP | |
| `updated_at` | TIMESTAMP | |

---

### 2.3 Table: `landing_page_sections` (Tenant DB)

| Column | Type | Notes |
|---|---|---|
| `id` | BIGINT (PK) | |
| `landing_page_id` | BIGINT (FK → `landing_pages.id`) | |
| `section_type` | VARCHAR(100) | Section type slug (e.g., `hero`, `courses`, `testimonials`). |
| `sort_order` | INT | Display order. Managed by `reorderSections()`. |
| `is_visible` | BOOLEAN | Whether the section renders on the public page. |
| `content` | JSON | Tenant-customized content for this section. |
| `created_at` | TIMESTAMP | |
| `updated_at` | TIMESTAMP | |

---

### 2.4 Table: `landing_page_media` (Tenant DB)

| Column | Type | Notes |
|---|---|---|
| `id` | BIGINT (PK) | |
| `landing_page_id` | BIGINT (FK → `landing_pages.id`) | |
| `file_path` | TEXT | Tenant-scoped storage path. |
| `mime_type` | VARCHAR(100) | |
| `file_size` | BIGINT | In bytes. |
| `created_at` | TIMESTAMP | |
| `updated_at` | TIMESTAMP | |

---

## 3. Domain Layer — Platform Template

### 3.1 `LandingPageTemplate` Entity

**File:** `App\Domain\SuperAdminDashboard\LandingPage\Entities\LandingPageTemplate`

**State transition matrix (`TemplateStatus::canTransitionTo()`):**

| From | Allowed → To |
|---|---|
| `DRAFT` | `PENDING_PUBLISH` |
| `PENDING_PUBLISH` | `PUBLISHED`, `REJECTED` |
| `REJECTED` | `PENDING_PUBLISH` |
| `PUBLISHED` | `PENDING_ARCHIVE` |
| `PENDING_ARCHIVE` | `ARCHIVED`, `PUBLISHED` |
| `ARCHIVED` | `PUBLISHED` |

**Key domain methods:**

| Method | Guard | Side Effect |
|---|---|---|
| `create(...)` | — | Status = `DRAFT`. Fires `LandingPageTemplateCreated`. |
| `submitForPublish()` | Must be `DRAFT` or `REJECTED` | Status → `PENDING_PUBLISH`. Clears `rejectionReason`. |
| `approvePublish()` | Must be `PENDING_PUBLISH`. `institutionTypeId` must NOT be null. | Status → `PUBLISHED`. Sets `publishedAt`. Fires `LandingPageTemplatePublished`. |
| `rejectPublish(reason)` | Must be `PENDING_PUBLISH`. Reason must not be empty. | Status → `REJECTED`. Stores `rejectionReason`. |
| `requestArchive()` | Must be `PUBLISHED` | Status → `PENDING_ARCHIVE`. |
| `approveArchive()` | Must be `PENDING_ARCHIVE` | Status → `ARCHIVED`. Fires `LandingPageTemplateArchived`. |
| `rejectArchive(reason)` | Must be `PENDING_ARCHIVE`. Reason must not be empty. | Status → `PUBLISHED`. Stores `rejectionReason`. |
| `unarchive()` | Must be `ARCHIVED` | Status → `PUBLISHED`. Sets new `publishedAt`. Fires `LandingPageTemplatePublished`. |

---

## 4. Domain Layer — Tenant Landing Page

### 4.1 `LandingPage` Entity

**File:** `App\Domain\TenantAdminDashboard\LandingPage\Entities\LandingPage`

**State transition (`PageStatus::canTransitionTo()`):**

| From | Allowed → To |
|---|---|
| `DRAFT` | `PUBLISHED` |
| `PUBLISHED` | `DRAFT` |

**Key domain methods:**

| Method | Action |
|---|---|
| `createFromTemplate(tenantId, templateId, templateSlug, title, slug, isHomepage, sections, metaTitle, metaDescription)` | Creates page in `DRAFT`. Guards `ReservedSlug`. |
| `publish()` | `DRAFT → PUBLISHED`. Sets `publishedAt`. |
| `unpublish()` | `PUBLISHED → DRAFT`. Clears published state. |
| `updateMetadata(title, slug, isHomepage)` | Updates basic page identity. Guards `ReservedSlug` on slug change. |
| `updateSeo(metaTitle, metaDescription, ogImageUrl)` | Updates SEO fields. |
| `updateColorOverrides(colorOverrides)` | Updates brand color overrides (JSON). |
| `reorderSections(orderedSectionIds)` | Updates `sortOrder` on each section; re-sorts `sections` array. |
| `updateSectionContent(sectionId, content)` | Updates `content` JSON on the matching section. |
| `toggleSectionVisibility(sectionId, isVisible)` | Sets `is_visible` on the matching section. |
| `addSection(LandingPageSection)` | Appends and re-sorts sections. |
| `removeSection(sectionId)` | Removes section from array. |

---

### 4.2 `LandingPageSection` Entity

**File:** `App\Domain\TenantAdminDashboard\LandingPage\Entities\LandingPageSection`

Represents a single content block on a tenant landing page. Managed as a child of `LandingPage`.

Methods: `getContent()`, `updateContent(array)`, `getSortOrder()`, `updateSortOrder(int)`, `toggleVisibility(bool)`.

---

### 4.3 `ReservedSlug` (Value Object)

**File:** `App\Domain\Shared\ValueObjects\ReservedSlug`

Guards against tenants using platform-reserved URL slugs (e.g., `api`, `admin`, `login`, `register`). Applied on page creation and slug updates. Throws `ReservedPageSlugException`.

---

## 5. Application Layer — UseCases & Queries

### Platform Template

| UseCase | Action |
|---|---|
| `CreateTemplateUseCase` | Create template in DRAFT. |
| `UpdateTemplateUseCase` | Update name, slug, institution type, preview image, meta defaults. |
| `SubmitTemplateForPublishUseCase` | DRAFT/REJECTED → PENDING_PUBLISH. |
| `ApproveTemplatePublishUseCase` | PENDING_PUBLISH → PUBLISHED (L2). |
| `RejectTemplatePublishUseCase` | PENDING_PUBLISH → REJECTED (L2). |
| `RequestTemplateArchiveUseCase` | PUBLISHED → PENDING_ARCHIVE. |
| `ApproveTemplateArchiveUseCase` | PENDING_ARCHIVE → ARCHIVED (L2). |
| `RejectTemplateArchiveUseCase` | PENDING_ARCHIVE → PUBLISHED (L2). |
| `UnarchiveTemplateUseCase` | ARCHIVED → PUBLISHED. |

### Tenant Page

| Query / UseCase | Action |
|---|---|
| `GetLandingPageQuery` | Fetch a single tenant page with sections. |
| `ListLandingPagesQuery` | Paginated list of tenant's pages. |
| `CreateLandingPageFromTemplateUseCase` | (inferred) Create page from template — quota check, slug uniqueness, section deep-copy. |
| `PublishLandingPageUseCase` | (inferred) DRAFT → PUBLISHED. |
| `UnpublishLandingPageUseCase` | (inferred) PUBLISHED → DRAFT. |
| `UpdateLandingPageMetadataUseCase` | (inferred) Update title, slug, homepage flag. |
| `UpdateLandingPageSeoUseCase` | (inferred) Update SEO fields. |
| `UpdateSectionContentUseCase` | (inferred) Update a section's JSON content. |
| `ToggleSectionVisibilityUseCase` | (inferred) Show/hide a section. |
| `ReorderSectionsUseCase` | (inferred) Update sort order. |
| `DeleteLandingPageUseCase` | (inferred) Fires `TenantLandingPageDeleted`. |

---

## 6. HTTP Layer — Routes

### Platform Admin Routes

| Method | URI | Action |
|---|---|---|
| GET | `/platform/landing-page-templates` | List all templates (filterable by status, institution type) |
| POST | `/platform/landing-page-templates` | Create template |
| GET | `/platform/landing-page-templates/{id}` | Get single template |
| PUT | `/platform/landing-page-templates/{id}` | Update template |
| POST | `/platform/landing-page-templates/{id}/submit` | Submit for publish (L4) |
| POST | `/platform/landing-page-templates/{id}/approve-publish` | Approve publish (L2) |
| POST | `/platform/landing-page-templates/{id}/reject-publish` | Reject publish (L2) |
| POST | `/platform/landing-page-templates/{id}/request-archive` | Request archive (L4) |
| POST | `/platform/landing-page-templates/{id}/approve-archive` | Approve archive (L2) |
| POST | `/platform/landing-page-templates/{id}/reject-archive` | Reject archive (L2) |
| POST | `/platform/landing-page-templates/{id}/unarchive` | Unarchive (L4/L2) |

### Tenant Admin Routes

| Method | URI | Action |
|---|---|---|
| GET | `/tenant/landing-pages` | List tenant's pages |
| GET | `/tenant/landing-pages/{id}` | Get single page with sections |
| POST | `/tenant/landing-pages` | Create page from template |
| PUT | `/tenant/landing-pages/{id}/metadata` | Update title, slug, homepage |
| PUT | `/tenant/landing-pages/{id}/seo` | Update SEO fields |
| PUT | `/tenant/landing-pages/{id}/color-overrides` | Update brand colors |
| POST | `/tenant/landing-pages/{id}/publish` | Publish page |
| POST | `/tenant/landing-pages/{id}/unpublish` | Unpublish page |
| DELETE | `/tenant/landing-pages/{id}` | Delete page |
| PUT | `/tenant/landing-pages/{id}/sections/{sectionId}/content` | Update section content |
| PUT | `/tenant/landing-pages/{id}/sections/{sectionId}/visibility` | Toggle section visibility |
| POST | `/tenant/landing-pages/{id}/sections/reorder` | Reorder sections |
| POST | `/tenant/landing-pages/{id}/media` | Upload OG image |

### Public Routes

| Method | URI | Action |
|---|---|---|
| GET | `/{slug}` (tenant domain) | Serve published tenant page by slug |
| GET | `/` (tenant domain) | Serve tenant homepage (`is_homepage = true`) |

---

## 7. Domain Events

| Event | Fired By | Context |
|---|---|---|
| `LandingPageTemplateCreated` | `LandingPageTemplate::create()` | Platform template created. |
| `LandingPageTemplatePublished` | `approvePublish()`, `unarchive()` | Template made available to tenants. |
| `LandingPageTemplateArchived` | `approveArchive()` | Template retired. |
| `TenantLandingPageCreated` | `CreateLandingPageFromTemplateUseCase` | Tenant page created. |
| `TenantLandingPagePublished` | `PublishLandingPageUseCase` | Tenant page made public. |
| `TenantLandingPageUnpublished` | `UnpublishLandingPageUseCase` | Tenant page taken offline. |
| `TenantLandingPageDeleted` | `DeleteLandingPageUseCase` | Tenant page deleted. |

---

## 8. Exceptions Reference

| Exception | When Thrown |
|---|---|
| `InvalidTemplateStatusTransitionException` | Platform template: transition not in `TemplateStatus::canTransitionTo()` matrix. |
| `InvalidPageStatusTransitionException` | Tenant page: transition not in `PageStatus::canTransitionTo()` matrix. |
| `ReservedPageSlugException` | Tenant attempts to use a platform-reserved slug. |
| `LandingPageNotFoundException` | Tenant page not found. |
| `LandingPageQuotaExceededException` | Tenant has reached their plan's landing page limit. |
| `DomainException` (no institution type) | `approvePublish()` called without `institutionTypeId` set on template. |

---

## 9. Critical Test Scenarios

1. **Template approve without institution type** — `DomainException` thrown.
2. **Template approval flow** — DRAFT → PENDING_PUBLISH → PUBLISHED (happy path).
3. **Template rejection** — Empty reason → `InvalidArgumentException`.
4. **Unarchive** → restores to `PUBLISHED` (not `DRAFT`).
5. **Tenant creates page from template** — Sections deep-copied; source template changes do not affect this page.
6. **Reserved slug** — Tenant attempts slug `api` → `ReservedPageSlugException`.
7. **Draft page not publicly served** — GET `/about` for a draft page returns 404.
8. **Color overrides** — JSON color map saved and returned in public API response.
9. **Section reorder** — Sort orders updated correctly; sections returned in new order.
10. **Section visibility toggle** — `is_visible = false` → section absent from public render.
11. **Quota check** — Tenant at quota limit → `LandingPageQuotaExceededException` on create.
12. **L4 cannot approve template** — 403 Forbidden on approve endpoint.

---

*End of Document — UBOTZ 2.0 Landing Page Full Technical Specification — March 27, 2026*
