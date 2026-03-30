# Landing Page Template — Technical & Business Documentation

**Version:** 1.0  
**Last Updated:** 2026-03-21  
**Feature Area:** Marketing / Web Presence  
**Scope:** Platform Admin (SuperAdmin) + Tenant Admin  

---

## 1. Overview

The Landing Page Template feature enables UBOTZ to provide **reusable, institution-type–specific page templates** at the platform level that tenant organizations can clone and customize to build their own public-facing websites. Authentication, branding, and SEO can all be managed from a single coherent interface.

### Business Goals

| Goal | Description |
|---|---|
| Accelerate tenant website setup | Tenants can launch professional pages in minutes by cloning a template |
| Enforce platform design standards | Platform admins control the master templates; tenants can only customize within allowed parameters |
| Support institution-specific layouts | Templates are tagged to institution types (e.g., coaching centers, universities) |
| Maintain editorial control | A publish/archive approval workflow prevents unreviewed templates going live |
| Enable SEO-optimized tenant websites | Every page can configure meta title, meta description, and Open Graph image |

---

## 2. Architecture Overview

The feature is structured following **Domain-Driven Design** with two separate bounded contexts:

```
Platform Admin (SuperAdmin)          Tenant Admin
────────────────────────             ─────────────────────────
LandingPageTemplate (entity)  ──▶    LandingPage (entity)
TemplateSection (VO)                 LandingPageSection (entity)
TemplateStatus (VO)                  PageStatus (VO)

Domain Events:                       Domain Events:
- LandingPageTemplateCreated         - TenantLandingPageCreated
- LandingPageTemplatePublished       - TenantLandingPagePublished
- LandingPageTemplateArchived        - TenantLandingPageUnpublished
                                     - TenantLandingPageDeleted
```

---

## 3. Platform Admin Level

### 3.1 Business Purpose

Platform admins are responsible for creating and governing _master templates_. These templates define the **structural blueprint** of a landing page: which sections exist, their order, and default content. Tenants cannot invent new sections — they can only fill in the ones provided by the template.

The approval workflow ensures that no template goes live without a second pair of eyes (dual control).

---

### 3.2 Data Model — `LandingPageTemplate`

**Namespace:** `App\Domain\SuperAdminDashboard\LandingPage\Entities\LandingPageTemplate`

| Field | Type | Description |
|---|---|---|
| `id` | `?int` | Auto-generated database ID |
| `name` | `string` | Human-readable template name |
| `slug` | `string` | URL-safe identifier for referencing this template globally |
| `institutionTypeId` | `?int` | Links to institution type (e.g., coaching center, university) |
| `status` | `TemplateStatus` | Lifecycle state (see below) |
| `previewImageUrl` | `?string` | Shown in the template catalog to tenants |
| `defaultMetaTitle` | `?string` | Pre-filled SEO title cloned into tenant pages |
| `defaultMetaDescription` | `?string` | Pre-filled SEO description cloned into tenant pages |
| `createdBy` | `?int` | Platform admin id who created the template |
| `sections` | `TemplateSection[]` | Ordered list of sections defining page structure |
| `publishedAt` | `?\DateTimeImmutable` | When template was last published |
| `rejectionReason` | `?string` | Reason if status transitioned to `rejected` |

---

### 3.3 Template Status Lifecycle

```
        ┌────────────────────────────────┐
        │             DRAFT              │
        └────────────┬───────────────────┘
                     │  submitForPublish()
                     ▼
        ┌──────────────────────────────────┐
        │         PENDING_PUBLISH          │
        └───┬─────────────────────────┬───┘
            │ approvePublish()        │ rejectPublish(reason)
            ▼                        ▼
        ┌───────────┐          ┌──────────┐
        │ PUBLISHED │          │ REJECTED │
        └─────┬─────┘          └──────────┘
              │  requestArchive()
              ▼
        ┌─────────────────────┐
        │    PENDING_ARCHIVE  │
        └──┬─────────────┬────┘
           │             │
      approveArchive()   rejectArchive(reason)
           │             │
           ▼             ▼
        ┌──────────┐   ┌──────────┐
        │ ARCHIVED │   │PUBLISHED │  (reverts)
        └──────────┘   └──────────┘
              │
        unarchive() ──► PUBLISHED
```

**Business Invariants enforced by the domain:**
- A template cannot be published without an `institutionTypeId` assigned.
- Rejection reason must be non-empty when rejecting.
- Invalid status transitions throw `InvalidTemplateStatusTransitionException`.

---

### 3.4 API Endpoints — Platform Admin

**Base path:** `/api/platform/landing-page-templates`

| Method | Endpoint | Authority | Description |
|---|---|---|---|
| `GET` | `/` | L1+ (60+) | List all templates (filterable) |
| `GET` | `/{id}` | L1+ (60+) | Get template details with sections |
| `GET` | `/categories` | L1+ (60+) | List template categories |
| `POST` | `/` | L4 (60–79) | Create new template (starts as `draft`) |
| `DELETE` | `/{id}` | L4 (60–79) | Hard delete a draft template |
| `DELETE` | `/{id}/sections/{sectionId}` | L4 (60–79) | Remove a section from a template |
| `POST` | `/{id}/submit-for-publish` | L4 (60–79) | Submit for review → `pending_publish` |
| `POST` | `/{id}/request-archive` | L4 (60–79) | Request archiving → `pending_archive` |
| `POST` | `/{id}/unarchive` | L4 (60–79) | Restore archived template → `published` |
| `POST` | `/{id}/approve-publish` | L2 (80–89) | Approve publish → `published` |
| `POST` | `/{id}/reject-publish` | L2 (80–89) | Reject with reason → `rejected` |
| `POST` | `/{id}/approve-archive` | L2 (80–89) | Approve archive → `archived` |
| `POST` | `/{id}/reject-archive` | L2 (80–89) | Reject archive → back to `published` |

**Role based access:**
- **L4 (authority 60–79):** Content operators — can create/edit/delete, submit/request-archive
- **L2 (authority 80–89):** Approvers — approve or reject publish/archive decisions
- **L1 (authority 90):** View only

---

### 3.5 Key Application Services (Platform)

| Use Case Class | Command/Query | Purpose |
|---|---|---|
| `CreateTemplateUseCase` | `CreateTemplateCommand` | Create a new draft template |
| `SubmitForPublishUseCase` | `SubmitForPublishCommand` | Move to `pending_publish` |
| `ApprovePublishUseCase` | `ApprovePublishCommand` | Move to `published` |
| `RejectPublishUseCase` | `RejectPublishCommand` | Move to `rejected` with reason |
| `RequestArchiveUseCase` | `RequestArchiveCommand` | Move to `pending_archive` |
| `ApproveArchiveUseCase` | `ApproveArchiveCommand` | Move to `archived` |
| `EloquentLandingPageReadModel` | Read model | Paginated list with filters |

---

### 3.6 Frontend (Platform Admin)

**Service:** `frontend/services/platform-landing-page-service.ts`

Key methods:
- `getTemplates(params?)` — Paginated list with status filter
- `getTemplate(id)` — Full detail including sections
- `submitForPublish(id)` — Trigger publish approval workflow
- `approvePublish(id)` / `rejectPublish(id, reason)` — Approval actions (L2 only)
- `requestArchive(id)` / `approveArchive(id)` / `rejectArchive(id, reason)` — Archive workflow
- `unarchiveTemplate(id)` — Restore an archived template

**Frontend pages:** `app/super-admin-dashboard/landing-pages/`

---

## 4. Tenant Admin Level

### 4.1 Business Purpose

Tenant admins use the Landing Page feature to build and maintain their **organization's public website**. Rather than starting from scratch, they clone a platform-approved template and:
- Customize section content (text, images, CTA buttons)
- Set SEO metadata per page
- Override brand colors (within the template's design system)
- Control section visibility
- Manage navigation structure
- Publish/unpublish pages independently

A **quota system** limits how many landing pages a tenant can create (enforced by `LandingPageQuotaExceededException`).

---

### 4.2 Data Model — `LandingPage`

**Namespace:** `App\Domain\TenantAdminDashboard\LandingPage\Entities\LandingPage`

| Field | Type | Description |
|---|---|---|
| `id` | `?int` | Database ID |
| `tenantId` | `int` | Owner tenant (enforces isolation) |
| `sourceTemplateId` | `?int` | Reference to the platform template this was cloned from |
| `templateSlug` | `?string` | Slug of the source template |
| `title` | `string` | Internal page name |
| `slug` | `string` | Public URL path (e.g., `/home`, `/about`) |
| `isHomepage` | `bool` | If true, served at the tenant's root URL |
| `status` | `PageStatus` | `draft` or `published` |
| `metaTitle` | `?string` | SEO title |
| `metaDescription` | `?string` | SEO description |
| `ogImageUrl` | `?string` | Social sharing image URL |
| `colorOverrides` | `?array` | Key/value brand color overrides (e.g., `primary_color`) |
| `sections` | `LandingPageSection[]` | Ordered, visible/hidden sections |
| `publishedAt` | `?\DateTimeImmutable` | When the page was last published |

---

### 4.3 `LandingPageSection` Data Model

**Namespace:** `App\Domain\TenantAdminDashboard\LandingPage\Entities\LandingPageSection`

| Field | Type | Description |
|---|---|---|
| `id` | `?int` | Database ID |
| `sectionType` | `SectionType` | Type identifier (hero, features, testimonials, etc.) |
| `name` | `string` | Display name |
| `sortOrder` | `int` | Position index within the page |
| `isVisible` | `bool` | Toggle visibility without deleting |
| `content` | `?array` | JSON blob of editable section content (text, images, links) |

---

### 4.4 Page Status Lifecycle

```
   ┌──────┐  publish()   ┌───────────┐
   │DRAFT │─────────────▶│ PUBLISHED │
   └──────┘◀─────────────└───────────┘
             unpublish()
```

Simpler than the template lifecycle — tenant pages do not require platform approval to publish. The tenant admin has full control over their own pages.

**Business Invariants:**
- `slug` cannot be a reserved system path (validated by `ReservedSlug`). Reserved slugs include paths like `/api`, `/admin`, etc.
- Duplicate slugs within the same tenant are rejected.

---

### 4.5 API Endpoints — Tenant Admin

**Base path:** `/api/tenant/`  
**Required Capability:** `landing_page.view` (read) / `landing_page.manage` (write)

#### Read (requires `landing_page.view`)

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/landing-page-templates` | Browse platform-published template catalog |
| `GET` | `/landing-page-templates/{id}` | Preview a specific template |
| `GET` | `/landing-pages` | List tenant's own pages |
| `GET` | `/landing-pages/{id}` | Get full page with sections |
| `GET` | `/navigation` | Get website navigation config |

#### Write (requires `landing_page.manage`)

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/landing-pages/clone` | Clone a template → creates a new draft page |
| `PUT` | `/landing-pages/{id}/metadata` | Update title, slug, homepage flag |
| `PUT` | `/landing-pages/{id}/seo` | Update meta title, description, OG image |
| `PUT` | `/landing-pages/{id}/colors` | Update brand color overrides |
| `POST` | `/landing-pages/{id}/publish` | Publish the page (makes it publicly visible) |
| `POST` | `/landing-pages/{id}/unpublish` | Unpublish (reverts to draft, page goes offline) |
| `DELETE` | `/landing-pages/{id}` | Delete a landing page |
| `PUT` | `/landing-pages/{pageId}/sections/reorder` | Reorder sections by providing sorted IDs |
| `PUT` | `/landing-pages/{pageId}/sections/{sectionId}` | Update section content JSON |
| `PATCH` | `/landing-pages/{pageId}/sections/{sectionId}/visibility` | Toggle section visibility |
| `POST` | `/landing-page/media` | Upload image/media asset for use in sections |
| `DELETE` | `/landing-page/media/{id}` | Delete a previously uploaded media asset |
| `PUT` | `/navigation` | Update the website navigation menu structure |

---

### 4.6 Clone Workflow (Most Important Tenant Action)

When a tenant clones a template:

1. Tenant selects a published template from the catalog
2. Provides: `template_id`, `title`, `slug`, `is_homepage`
3. System calls `CloneTemplateUseCase`:
   - Verifies template is `published`
   - Checks tenant page quota (throws `LandingPageQuotaExceededException` at 403 if exceeded)
   - Deep-copies all `TemplateSection[]` into tenant-owned `LandingPageSection[]`
   - Copies `defaultMetaTitle` and `defaultMetaDescription` as starting SEO values
   - Creates the page in `draft` status
4. Tenant then customizes sections and publishes when ready

---

### 4.7 Key Application Services (Tenant)

| Use Case | Command | Purpose |
|---|---|---|
| `CloneTemplateUseCase` | `CloneTemplateCommand` | Clone platform template into tenant draft page |
| `UpdatePageMetadataUseCase` | `UpdatePageMetadataCommand` | Update title, slug, homepage |
| `UpdatePageSeoUseCase` | `UpdatePageSeoCommand` | Update meta tags and OG image |
| `UpdatePageColorsUseCase` | `UpdatePageColorsCommand` | Set brand color overrides |
| `PublishPageUseCase` | `PublishPageCommand` | Publish → `published` |
| `UnpublishPageUseCase` | `UnpublishPageCommand` | Unpublish → `draft` |
| `DeletePageUseCase` | `DeletePageCommand` | Remove the page entirely |
| `UpdateSectionContentUseCase` | (via controller) | Update section JSON content |
| `ToggleSectionVisibilityUseCase` | (via controller) | Show/hide individual sections |
| `ReorderSectionsUseCase` | (via controller) | Reorder sections within the page |

---

### 4.8 Frontend (Tenant Admin)

**Service:** `frontend/services/tenant-landing-page-service.ts`

**Frontend pages:** `app/tenant-admin-dashboard/landing-page/`

Key capabilities:
- Template catalog browsing with preview
- Page list with publish status indicators
- Section editor (content JSON editor per section type)
- SEO panel
- Color override panel
- Section reordering (drag & drop in UI)
- Media upload library
- Navigation editor

---

## 5. Public Facing (Read Side)

**Controller:** `PublicLandingPageController`  
**Route prefix:** `/api/public/` or public web routes

The public-facing layer serves published landing pages to unauthenticated visitors. It resolves pages by:
1. Tenant domain/slug
2. Page slug (or homepage flag for root URL)

It returns only `published` pages — draft pages are invisible to the public.

**Tenant isolation is guaranteed**: all public queries include `tenant_id` in the query scope.

---

## 6. Security & Multi-Tenancy

| Concern | Enforcement |
|---|---|
| Tenant data isolation | All `LandingPage` queries scoped to `tenantId` via global scope |
| Capability enforcement | `tenant.capability:landing_page.view/manage` middleware on all tenant routes |
| Authority enforcement | `admin.authority:60-79` and `admin.authority:80-89` on platform routes |
| Reserved slug protection | `ReservedSlug::isReserved($slug)` checked before any slug assignment |
| Media path isolation | Uploaded media stored under tenant-scoped paths |
| Quota enforcement | `LandingPageQuotaExceededException` thrown at the application layer before DB writes |

---

## 7. Domain Events

| Event | Context | Fired When |
|---|---|---|
| `LandingPageTemplateCreated` | Platform | New template is created |
| `LandingPageTemplatePublished` | Platform | Template is approved and published (or unarchived) |
| `LandingPageTemplateArchived` | Platform | Template is successfully archived |
| `TenantLandingPageCreated` | Tenant | A page is cloned from a template |
| `TenantLandingPagePublished` | Tenant | A tenant page is published |
| `TenantLandingPageUnpublished` | Tenant | A tenant page is unpublished |
| `TenantLandingPageDeleted` | Tenant | A tenant page is deleted |

---

## 8. Database Tables

| Table | Context | Purpose |
|---|---|---|
| `landing_page_templates` | Central DB | Platform template registry |
| `landing_page_template_sections` | Central DB | Sections belonging to a template |
| `landing_pages` | Tenant DB | Tenant-owned pages |
| `landing_page_sections` | Tenant DB | Sections belonging to a tenant page |
| `landing_page_media` | Tenant DB | Uploaded media assets |

---

## 9. Common Error Conditions

| Exception | HTTP Code | Cause |
|---|---|---|
| `LandingPageNotFoundException` | 404 | Page not found for the authenticated tenant |
| `LandingPageQuotaExceededException` | 403 | Tenant has reached the max allowed pages |
| `ReservedPageSlugException` | 422 | Slug conflicts with a system-reserved path |
| `DuplicatePageSlugException` | 422 | Another tenant page already uses this slug |
| `InvalidPageStatusTransitionException` | 422 | Invalid publish/unpublish transition |
| `InvalidTemplateStatusTransitionException` | 422 | Invalid template lifecycle transition |

---

## 10. Key Design Decisions

1. **Templates are platform-owned, pages are tenant-owned.** This hard boundary means tenant admins can never modify the master template — only their local copy.

2. **Dual-level approval on templates.** The `submitForPublish → approvePublish` workflow requires at least two different authority levels before a template reaches tenants.

3. **Color overrides, not full design freedom.** Tenants can change brand colors within the template's design system but cannot arbitrarily inject CSS, ensuring visual consistency.

4. **Sections are typed.** Each section has a `SectionType` value object, which allows the frontend to render the correct editing UI for each section kind (hero, features, testimonials, FAQ, etc.).

5. **Homepage flag is exclusive.** Business logic should ensure only one page per tenant can be the homepage at a time (enforced at the application layer).

6. **Soft lifecycle via `isVisible`.** Tenants can hide sections without deleting them, preserving previously entered content for later re-activation.

---

## 11. Frontend File Structure

The frontend is organized into three layers: **route pages** (Next.js App Router), a **shared features library**, and **API services**.

### 11.1 Platform Admin (SuperAdmin) — Route Pages

```
frontend/app/super-admin-dashboard/landing-pages/
├── page.tsx                          # Template list page — shows all templates with status badges,
│                                     # approve/reject/archive actions
├── create/                           # (reserved for future create flow)
├── [id]/
│   ├── edit/                         # Template editor — sections, metadata, institution type
│   └── preview/
│       └── page.tsx                  # Live render preview of a template before publishing
└── components/                       # (currently empty — uses shared feature components)
```

**Key user flows on platform pages:**

| Page | Purpose |
|---|---|
| `page.tsx` | Browse, filter, submit-for-publish, approve/reject |
| `[id]/edit/` | Edit template name, slug, institution type, sections |
| `[id]/preview/page.tsx` | Render the template using actual section data |

---

### 11.2 Tenant Admin — Route Pages

```
frontend/app/tenant-admin-dashboard/landing-page/
├── page.tsx                          # Landing pages list — shows all tenant pages, status, set homepage
├── templates/
│   ├── page.tsx                      # Template catalog — browse published platform templates
│   └── preview/
│       └── [templateId]/
│           └── page.tsx              # Live preview of a specific template before cloning
├── edit/
│   └── [id]/
│       └── page.tsx                  # Full page editor — metadata, SEO, colors, sections
└── navigation/
    └── page.tsx                      # Navigation menu editor for the tenant website
```

**Key user flows on tenant pages:**

| Page | Purpose |
|---|---|
| `page.tsx` | View all pages, publish/unpublish, set homepage, delete |
| `templates/page.tsx` | Browse catalog, select a template to clone |
| `templates/preview/[templateId]/page.tsx` | Preview a template with real section data |
| `edit/[id]/page.tsx` | Edit metadata, SEO, brand colors, section content, section order/visibility |
| `navigation/page.tsx` | Edit website top navigation links and structure |

---

### 11.3 Shared Feature Library

```
frontend/features/landing-page/
├── components/
│   ├── PublicLeadForm.tsx             # Lead capture form rendered in contact/hero sections
│   ├── TemplateLivePreview.tsx        # Wrapper: renders a full template using tenant's color overrides
│   ├── public-renderer.tsx            # Thin export re-exporting TemplateRenderer
│   └── public-renderer/
│       ├── TemplateRenderer.tsx       # Root renderer: resolves template slug → renders correct theme
│       ├── public-navbar.tsx          # Navigation bar rendered in public page (reads tenant nav config)
│       ├── public-footer.tsx          # Footer rendered in public pages
│       ├── section-registry.ts        # Maps SectionType → React component for generic rendering
│       └── sections/                  # Generic section renderers (fallback / non-template-specific)
│           ├── hero-section.tsx
│           ├── features-section.tsx
│           ├── testimonials-section.tsx
│           ├── courses-section.tsx
│           ├── stats-section.tsx
│           ├── faq-section.tsx
│           ├── about-section.tsx
│           ├── contact-section.tsx
│           └── default-section.tsx    # Fallback for unrecognized section types
│
├── templates/                         # Per-template themed section implementations
│   ├── coaching-pro/                  # "Coaching Pro" template theme
│   │   ├── CoachingProLayout.tsx      # Page layout / wrapper with theme styles
│   │   ├── CoachingProHero.tsx
│   │   ├── CoachingProFeatures.tsx
│   │   ├── CoachingProCourses.tsx
│   │   ├── CoachingProTestimonials.tsx
│   │   ├── CoachingProStats.tsx
│   │   ├── CoachingProFaq.tsx
│   │   ├── CoachingProContact.tsx
│   │   └── index.ts                   # Barrel export
│   │
│   ├── online-academy/                # "Online Academy" template theme
│   │   ├── OnlineAcademyLayout.tsx
│   │   ├── OnlineAcademyHero.tsx
│   │   ├── OnlineAcademyFeatures.tsx
│   │   ├── OnlineAcademyCourses.tsx
│   │   ├── OnlineAcademyTestimonials.tsx
│   │   ├── OnlineAcademyStats.tsx
│   │   ├── OnlineAcademyFaq.tsx
│   │   ├── OnlineAcademyContact.tsx
│   │   └── index.ts
│   │
│   ├── prestige-institute/            # "Prestige Institute" template theme
│   │   ├── PrestigeInstituteLayout.tsx
│   │   ├── PrestigeInstituteHero.tsx
│   │   ├── PrestigeInstituteAbout.tsx
│   │   ├── PrestigeInstituteFeatures.tsx
│   │   ├── PrestigeInstituteCourses.tsx
│   │   ├── PrestigeInstituteTestimonials.tsx
│   │   ├── PrestigeInstituteStats.tsx
│   │   ├── PrestigeInstituteFaq.tsx
│   │   ├── PrestigeInstituteContact.tsx
│   │   └── index.ts
│   │
│   ├── school-college/                # "School & College" template theme
│   │   ├── SchoolCollegeLayout.tsx
│   │   ├── SchoolCollegeHero.tsx
│   │   ├── SchoolCollegeAbout.tsx
│   │   ├── SchoolCollegeFeatures.tsx
│   │   ├── SchoolCollegeTestimonials.tsx
│   │   ├── SchoolCollegeStats.tsx
│   │   ├── SchoolCollegeFaq.tsx
│   │   ├── SchoolCollegeContact.tsx
│   │   └── index.ts
│   │
│   └── skill-academy/                 # "Skill Academy" template theme
│       ├── SkillAcademyLayout.tsx
│       ├── SkillAcademyHero.tsx
│       ├── SkillAcademyFeatures.tsx
│       ├── SkillAcademyCourses.tsx
│       ├── SkillAcademyTestimonials.tsx
│       ├── SkillAcademyStats.tsx
│       ├── SkillAcademyFaq.tsx
│       ├── SkillAcademyContact.tsx
│       └── index.ts
│
└── utils/
    └── safe-url.ts                    # Utility for safely building tenant page URLs
```

---

### 11.4 API Services

```
frontend/services/
├── platform-landing-page-service.ts   # Platform admin API client
└── tenant-landing-page-service.ts     # Tenant admin API client
```

#### `platform-landing-page-service.ts` — Key Methods

| Method | API Call | Purpose |
|---|---|---|
| `getTemplates(params?)` | `GET /platform/landing-page-templates` | List with status filter |
| `getTemplate(id)` | `GET /platform/landing-page-templates/{id}` | Full detail with sections |
| `getCategories()` | `GET /platform/landing-page-templates/categories` | List institution type categories |
| `submitForPublish(id)` | `POST /{id}/submit-for-publish` | Begin approval workflow |
| `approvePublish(id)` | `POST /{id}/approve-publish` | Approve (L2 only) |
| `rejectPublish(id, reason)` | `POST /{id}/reject-publish` | Reject with reason |
| `requestArchive(id)` | `POST /{id}/request-archive` | Request archive |
| `approveArchive(id)` | `POST /{id}/approve-archive` | Approve archive |
| `rejectArchive(id, reason)` | `POST /{id}/reject-archive` | Cancel archive request |
| `unarchiveTemplate(id)` | `POST /{id}/unarchive` | Restore from archive |

#### `tenant-landing-page-service.ts` — Key Methods

| Method | API Call | Purpose |
|---|---|---|
| `getPages(params?)` | `GET /tenant/landing-pages` | List all tenant pages |
| `getPage(id)` | `GET /tenant/landing-pages/{id}` | Page detail with sections |
| `createPage(data)` | `POST /tenant/landing-pages/clone` | Clone a template (main creation flow) |
| `updatePage(id, data)` | Multiple PUTs | Fans out to metadata + SEO + colors endpoints |
| `deletePage(id)` | `DELETE /tenant/landing-pages/{id}` | Delete a page |
| `updatePageStatus(id, 'published')` | `POST /{id}/publish` | Publish page |
| `updatePageStatus(id, 'draft')` | `POST /{id}/unpublish` | Unpublish page |
| `setAsHomepage(id)` | Load page then `PUT /{id}/metadata` with `is_homepage: true` | Set as homepage |
| `getTemplates(params?)` | `GET /tenant/landing-page-templates` | Browse template catalog |
| `getTemplate(id)` | `GET /tenant/landing-page-templates/{id}` | Template preview data |
| `getPageSections(pageId)` | `GET /tenant/landing-pages/{id}` | Sections included in page response |
| `updatePageSection(pageId, sectionId, data)` | `PUT /sections/{sectionId}` | Update section content |
| `togglePageSection(pageId, sectionId, isVisible)` | `PATCH /sections/{sectionId}/visibility` | Show/hide section |
| `reorderPageSections(pageId, sectionIds)` | `PUT /sections/reorder` | Re-order via sorted ID array |
| `getNavigation()` | `GET /tenant/navigation` | Fetch nav configuration |
| `saveNavigation(data)` | `PUT /tenant/navigation` | Save nav changes |

---

### 11.5 Template Rendering Architecture

The `TemplateRenderer` implements a **slug-to-theme dispatch pattern**:

```
templateSlug
     │
     ▼
TemplateRenderer.tsx
     │
     ├── "coaching-pro"     ──▶  CoachingProLayout  + section mapping
     ├── "online-academy"   ──▶  OnlineAcademyLayout + section mapping
     ├── "prestige-institute" ──▶ PrestigeInstituteLayout + section mapping
     ├── "school-college"   ──▶  SchoolCollegeLayout + section mapping
     ├── "skill-academy"    ──▶  SkillAcademyLayout + section mapping
     └── (unknown)          ──▶  section-registry.ts  (generic fallback)
                                       │
                                       └── default-section.tsx
```

Each template folder provides its own styled component per `SectionType`. The `section-registry.ts` acts as a fallback registry for sections that don't belong to a named template theme.

**Color overrides** are injected as CSS custom properties (`--primary-color`, etc.) at the layout wrapper level, allowing brand customization without changing component code.

---
