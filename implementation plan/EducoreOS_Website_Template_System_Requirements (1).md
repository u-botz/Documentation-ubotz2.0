# EducoreOS — Website Template System — Requirements & Architecture

**Document Type:** Business Requirements & Architecture Decision Record  
**Date:** March 21, 2026  
**Status:** Requirements Discussion Output — Pre-Developer-Instructions  
**Participants:** Product Owner (ubotz) + Principal Engineer / Architecture Auditor (Claude)  
**Prerequisite Phases:** Phase 13A (Landing Page Template System — COMPLETE), Phase 13B (Custom Domain — COMPLETE)

---

## 1. Problem Statement

Phase 13A delivered a **single-page template system**. Each template produces one scrollable page assembled from typed sections (hero, about, features, courses, stats, testimonials, FAQ, contact). A tenant can create multiple landing pages, but every page is the same structural type — a section-assembled page.

A real institution website is not a single page. It requires structurally different page types that serve different purposes:

| Missing Page Type | Business Purpose | Why It Matters |
|---|---|---|
| Course Catalog | Browsable listing of all published courses with filtering | Visitors cannot discover courses beyond the capped preview in the `courses` section |
| Course Detail | Full course page — description, curriculum, pricing, teacher, reviews, purchase CTA | **This is the conversion page.** Without it, there is no path from "interested visitor" to "paying student" |
| Blog Listing | Index of published blog posts | Blog system exists but has no public-facing page integrated into the tenant's website design |
| Blog Post Detail | Individual blog post rendered within the tenant's website design | Blog posts render outside the tenant's visual identity |
| Tenant-Branded Login/Register | Authentication page styled with the tenant's website theme | Currently login lives at a generic platform auth page, breaking the tenant's brand experience |

Additionally, the current system has **no shared website chrome concept**. The `public-navbar.tsx` and `public-footer.tsx` are shared across all templates — there are no per-template header/footer designs. A coaching institute and an online academy should not have identical headers and footers.

---

## 2. Agreed Architecture: Website Template = Complete Website

### 2.1 Core Decision

A **Website Template** is a complete, self-contained website design. One template = one full visual identity covering every page type a tenant's website needs.

This is NOT a component mix-and-match system. When a tenant selects "Coaching Pro", they get the Coaching Pro header, footer, homepage, course catalog, course detail, blog pages, and login page — all designed to work together as a cohesive website.

Each template is organized as a **separate folder** containing all its page-type files. This matches the existing pattern where `features/landing-page/templates/coaching-pro/` already contains per-section components, and extends it to include per-page-type layouts.

### 2.2 Two Categories of Pages

The system distinguishes between two fundamentally different page types:

**Section-Assembled Pages** — The tenant controls which sections appear and customizes content within each section. The page structure is flexible (sections can be reordered, hidden, content edited). This is what Phase 13A built. Examples: Homepage, About page, generic landing pages.

**Data-Driven Pages** — The page layout is standardized by the platform. Content comes from the database (courses, blog posts). The tenant does NOT assemble sections — they configure display options (e.g., how many courses per row, which categories to highlight) and the template applies their branding. Examples: Course Catalog, Course Detail, Blog Listing, Blog Post, Login/Register.

This distinction is architecturally non-negotiable. A Course Detail page's structure is dictated by the course data schema (title, description, curriculum, pricing, teacher, reviews). Trying to force it into the section-assembly model would be architecturally wrong.

### 2.3 What a Template Contains

```
Template "Coaching Pro" (folder: coaching-pro/)
│
├── Chrome (shared across all pages)
│   ├── Header          → logo placement, nav style, CTA button, mobile menu
│   └── Footer          → contact columns, social links, copyright, branding
│
├── Section-Assembled Page Layouts (existing Phase 13A pattern)
│   ├── Homepage        → CoachingProHero, CoachingProFeatures, etc.
│   └── Generic Pages   → reuses same section components
│
├── Data-Driven Page Layouts (NEW)
│   ├── Course Catalog  → grid/list layout, filter sidebar, search bar
│   ├── Course Detail   → hero banner, curriculum accordion, pricing card, teacher bio, reviews, purchase CTA
│   ├── Blog Listing    → post cards, category filter, pagination
│   ├── Blog Post       → article layout, author info, related posts, share buttons
│   └── Login/Register  → branded auth form, tenant logo, theme colors
│
└── Theme Config
    ├── Color tokens     → primary, secondary, accent, background defaults
    ├── Typography       → font pairing defaults
    └── Layout settings  → spacing, border-radius, shadow style
```

### 2.4 What Happens When a Tenant Selects a Template

The clone operation extends Phase 13A's snapshot model:

1. Tenant selects a published Website Template from the catalog
2. **Section-assembled pages** are deep-cloned as today (snapshot clone — sections copied into tenant-owned records, independent from template)
3. **Website theme settings** are cloned into a new `TenantWebsiteSettings` record — header config, footer config, color defaults, typography, layout settings
4. **Data-driven pages are NOT cloned** — they don't need to be. The course catalog, course detail, blog pages, and login page are platform-standard layouts that simply apply the tenant's theme. There is no tenant-specific content to clone — the content comes from the database (courses, blog posts) and the styling comes from the theme settings.

The tenant can then customize:
- Section-assembled pages → same as Phase 13A (edit section content, reorder, hide)
- Website theme settings → header config, footer config, colors, typography
- Data-driven page display configs → catalog layout preferences, course detail feature toggles
- Navigation → extended link types to include course catalog and login

---

## 3. Current Implementation Baseline

### 3.1 Backend (from Phase 13A completion)

| Component | Location | Status |
|---|---|---|
| `LandingPageTemplate` entity | `Domain/SuperAdminDashboard/LandingPage/Entities/` | EXISTS |
| `LandingPage` entity | `Domain/TenantAdminDashboard/LandingPage/Entities/` | EXISTS |
| `LandingPageSection` entity | `Domain/TenantAdminDashboard/LandingPage/Entities/` | EXISTS |
| `TemplateSection` VO | `Domain/SuperAdminDashboard/LandingPage/` | EXISTS |
| `TemplateStatus` VO | `Domain/SuperAdminDashboard/LandingPage/ValueObjects/` | EXISTS |
| `PageStatus` VO | `Domain/TenantAdminDashboard/LandingPage/ValueObjects/` | EXISTS |
| `SectionType` VO (shared) | `Domain/Shared/ValueObjects/` | EXISTS — `hero`, `about`, `features`, `courses`, `stats`, `testimonials`, `faq`, `contact` |
| `LinkType` VO | `Domain/TenantAdminDashboard/LandingPage/ValueObjects/` | EXISTS — `internal_page`, `external_url`, `blog` |
| `CloneTemplateUseCase` | `Application/TenantAdminDashboard/LandingPage/UseCases/` | EXISTS |
| `PublicLandingPageController` | `Http/Controllers/Api/Public/` | EXISTS |
| `PublicCourseQueryService` | `Application/Public/QueryServices/` | EXISTS — returns `PublicCourseDTO[]` (title, thumbnail, short_description, price, slug) |
| `PublicStatsQueryService` | `Application/Public/QueryServices/` | EXISTS |
| `PublicContactController` | `Http/Controllers/Api/Public/` | EXISTS — delegates to Lead Form |
| Navigation aggregate | `Domain/TenantAdminDashboard/LandingPage/` | EXISTS |
| `TenantCustomDomain` entity | Phase 13B | EXISTS — custom domain with SSL |

**Database Tables (existing):**
- `landing_page_templates` — Central DB
- `landing_page_template_sections` — Central DB
- `landing_pages` — Tenant-scoped
- `landing_page_sections` — Tenant-scoped
- `landing_page_media` — Tenant-scoped
- `tenant_navigation_items` — Tenant-scoped
- `tenant_custom_domains` — Tenant-scoped (Phase 13B)

### 3.2 Frontend (from Phase 13A completion)

| Component | Path | Status |
|---|---|---|
| Template themes (5) | `features/landing-page/templates/{slug}/` | EXISTS — `coaching-pro`, `online-academy`, `prestige-institute`, `school-college`, `skill-academy` |
| Per-theme section components | `templates/{slug}/{TemplateSlug}{SectionType}.tsx` | EXISTS — Hero, Features, Courses, Stats, Testimonials, FAQ, Contact (some have About) |
| Per-theme Layout wrapper | `templates/{slug}/{TemplateSlug}Layout.tsx` | EXISTS |
| `TemplateRenderer.tsx` | `features/landing-page/components/public-renderer/` | EXISTS — slug-to-theme dispatch |
| `section-registry.ts` | `features/landing-page/components/public-renderer/` | EXISTS — generic fallback components |
| `public-navbar.tsx` | `features/landing-page/components/public-renderer/` | EXISTS — **shared across all templates (not per-template)** |
| `public-footer.tsx` | `features/landing-page/components/public-renderer/` | EXISTS — **shared across all templates (not per-template)** |
| Generic section renderers | `features/landing-page/components/public-renderer/sections/` | EXISTS — hero, features, testimonials, courses, stats, faq, about, contact, default |
| `PublicLeadForm.tsx` | `features/landing-page/components/` | EXISTS |
| `TemplateLivePreview.tsx` | `features/landing-page/components/` | EXISTS |
| `safe-url.ts` | `features/landing-page/utils/` | EXISTS |
| SuperAdmin pages | `app/super-admin-dashboard/landing-pages/` | EXISTS |
| Tenant Admin pages | `app/tenant-admin-dashboard/landing-page/` | EXISTS — list, templates, edit, navigation |
| Public pages | `app/(website)/[tenantSlug]/` | EXISTS — homepage resolver, `[pageSlug]/page.tsx`, coming-soon |
| API services | `services/platform-landing-page-service.ts`, `services/tenant-landing-page-service.ts` | EXISTS |

### 3.3 Public API Endpoints (existing)

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/api/public/{tenantSlug}/pages` | List published page slugs + titles |
| `GET` | `/api/public/{tenantSlug}/pages/{pageSlug}` | Full page data with sections |
| `GET` | `/api/public/{tenantSlug}/homepage` | Homepage shortcut |
| `GET` | `/api/public/{tenantSlug}/courses` | Published courses for dynamic section (paginated) |
| `GET` | `/api/public/{tenantSlug}/stats` | Aggregate counts for Stats section |
| `POST` | `/api/public/{tenantSlug}/contact` | Lead form submission |
| `GET` | `/api/public/{tenantSlug}/navigation` | Navigation config |

---

## 4. What Needs to Be Built

### 4.1 Backend — New Components

**New Domain Concepts:**

| Component | Bounded Context | Purpose |
|---|---|---|
| `WebsiteThemeConfig` (value object or entity) | TenantAdminDashboard | Stores tenant's cloned theme settings — header config, footer config, default colors, typography, layout preferences |
| `WebsiteDisplayConfig` (value object) | TenantAdminDashboard | Stores tenant's display preferences for data-driven pages — course catalog layout, blog layout options |
| Extended `LinkType` values | TenantAdminDashboard | Add `course_catalog` and `login` to the existing `internal_page`, `external_url`, `blog` set |

**New Public API Endpoints (read-only, no auth):**

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/api/public/{tenantSlug}/website-theme` | Returns theme config (header, footer, colors, typography) for the website chrome |
| `GET` | `/api/public/{tenantSlug}/courses` | **EXISTS** — needs extension: add category filter, search, price filter, sort options |
| `GET` | `/api/public/{tenantSlug}/courses/{courseSlug}` | **NEW** — Full course detail: description, curriculum structure, pricing, teacher info, reviews, FAQs |
| `GET` | `/api/public/{tenantSlug}/courses/{courseSlug}/curriculum` | **NEW** — Curriculum tree (subjects → chapters → topics, without content — just titles and types) |
| `POST` | `/api/public/{tenantSlug}/courses/{courseSlug}/checkout` | **NEW** — Create Razorpay order for course purchase (requires authenticated user) |
| `GET` | `/api/public/{tenantSlug}/blog/posts` | **NEW or verify existing** — Blog post listing (paginated, filterable by category) |
| `GET` | `/api/public/{tenantSlug}/blog/posts/{postSlug}` | **NEW or verify existing** — Full blog post content |
| `GET` | `/api/public/{tenantSlug}/blog/categories` | **NEW or verify existing** — Blog category list |

**New Tenant Admin API Endpoints:**

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/api/tenant-dashboard/website-theme` | Get current theme settings |
| `PUT` | `/api/tenant-dashboard/website-theme` | Update theme settings (header config, footer config, colors, typography) |
| `GET` | `/api/tenant-dashboard/website-display-config` | Get display config for data-driven pages |
| `PUT` | `/api/tenant-dashboard/website-display-config` | Update display config |

**New Query Services (Public context, read-only):**

| Service | Purpose |
|---|---|
| `PublicCourseDetailQueryService` | Full course detail for public display — extends existing `PublicCourseQueryService` |
| `PublicCourseCurriculumQueryService` | Curriculum tree without content (titles and types only — no video URLs, no lesson text) |
| `PublicBlogQueryService` | Blog post listing and detail for public display |
| `PublicWebsiteThemeQueryService` | Theme config for public rendering |

**Modified Components:**

| Component | Change |
|---|---|
| `CloneTemplateUseCase` | Extended to also clone website theme settings from the template |
| `LinkType` VO | Add `course_catalog`, `login` values |
| `ReservedSlug` | Add `courses`, `blog`, `login`, `register` to reserved paths |
| `LandingPageTemplate` entity (SuperAdmin) | Extended with theme config fields (header_variant, footer_variant, default_typography, default_colors) |

**New Database Tables:**

| Table | Context | Purpose |
|---|---|---|
| `tenant_website_settings` | Tenant-scoped | Theme config (header, footer, colors, typography, layout) |
| `tenant_website_display_config` | Tenant-scoped | Display preferences for data-driven pages |

**Modified Database Tables:**

| Table | Change |
|---|---|
| `landing_page_templates` | Add columns for theme config defaults (header_variant, footer_variant, default_typography JSON, default_layout_config JSON) |

### 4.2 Frontend — Edit Existing Templates + Add New Page Components

The core deliverable is **editing the 5 existing template folders** to add new page-type components alongside the existing section components. No new template folders are created — the existing ones are extended.

**Template 1: `coaching-pro/` — Full File Listing After Changes:**

```
features/landing-page/templates/coaching-pro/
├── CoachingProLayout.tsx              # EXISTS — no change
├── CoachingProHero.tsx                # EXISTS — no change
├── CoachingProFeatures.tsx            # EXISTS — no change
├── CoachingProCourses.tsx             # EXISTS — no change (homepage courses section)
├── CoachingProTestimonials.tsx        # EXISTS — no change
├── CoachingProStats.tsx               # EXISTS — no change
├── CoachingProFaq.tsx                 # EXISTS — no change
├── CoachingProContact.tsx             # EXISTS — no change
│
├── CoachingProHeader.tsx              # NEW — template-specific header (replaces shared public-navbar for this template)
├── CoachingProFooter.tsx              # NEW — template-specific footer (replaces shared public-footer for this template)
├── CoachingProCourseCatalog.tsx       # NEW — /courses page layout (grid, filters, search, pagination)
├── CoachingProCourseDetail.tsx        # NEW — /courses/{slug} page layout (hero, curriculum, pricing, teacher, purchase CTA)
├── CoachingProBlogListing.tsx         # NEW — /blog page layout (post cards, category filter, pagination)
├── CoachingProBlogPost.tsx            # NEW — /blog/{slug} page layout (article, author, related posts)
├── CoachingProLogin.tsx               # NEW — /auth/login page layout (branded login form within template chrome)
└── index.ts                           # MODIFY — add exports for all new components
```

**Template 2: `online-academy/` — Full File Listing After Changes:**

```
features/landing-page/templates/online-academy/
├── OnlineAcademyLayout.tsx            # EXISTS — no change
├── OnlineAcademyHero.tsx              # EXISTS — no change
├── OnlineAcademyFeatures.tsx          # EXISTS — no change
├── OnlineAcademyCourses.tsx           # EXISTS — no change
├── OnlineAcademyTestimonials.tsx      # EXISTS — no change
├── OnlineAcademyStats.tsx             # EXISTS — no change
├── OnlineAcademyFaq.tsx               # EXISTS — no change
├── OnlineAcademyContact.tsx           # EXISTS — no change
│
├── OnlineAcademyHeader.tsx            # NEW
├── OnlineAcademyFooter.tsx            # NEW
├── OnlineAcademyCourseCatalog.tsx     # NEW
├── OnlineAcademyCourseDetail.tsx      # NEW
├── OnlineAcademyBlogListing.tsx       # NEW
├── OnlineAcademyBlogPost.tsx          # NEW
├── OnlineAcademyLogin.tsx             # NEW
└── index.ts                           # MODIFY
```

**Template 3: `prestige-institute/` — Full File Listing After Changes:**

```
features/landing-page/templates/prestige-institute/
├── PrestigeInstituteLayout.tsx        # EXISTS — no change
├── PrestigeInstituteHero.tsx          # EXISTS — no change
├── PrestigeInstituteAbout.tsx         # EXISTS — no change
├── PrestigeInstituteFeatures.tsx      # EXISTS — no change
├── PrestigeInstituteCourses.tsx       # EXISTS — no change
├── PrestigeInstituteTestimonials.tsx  # EXISTS — no change
├── PrestigeInstituteStats.tsx         # EXISTS — no change
├── PrestigeInstituteFaq.tsx           # EXISTS — no change
├── PrestigeInstituteContact.tsx       # EXISTS — no change
│
├── PrestigeInstituteHeader.tsx        # NEW
├── PrestigeInstituteFooter.tsx        # NEW
├── PrestigeInstituteCourseCatalog.tsx # NEW
├── PrestigeInstituteCourseDetail.tsx  # NEW
├── PrestigeInstituteBlogListing.tsx   # NEW
├── PrestigeInstituteBlogPost.tsx      # NEW
├── PrestigeInstituteLogin.tsx         # NEW
└── index.ts                           # MODIFY
```

**Template 4: `school-college/` — Full File Listing After Changes:**

```
features/landing-page/templates/school-college/
├── SchoolCollegeLayout.tsx            # EXISTS — no change
├── SchoolCollegeHero.tsx              # EXISTS — no change
├── SchoolCollegeAbout.tsx             # EXISTS — no change
├── SchoolCollegeFeatures.tsx          # EXISTS — no change
├── SchoolCollegeTestimonials.tsx      # EXISTS — no change
├── SchoolCollegeStats.tsx             # EXISTS — no change
├── SchoolCollegeFaq.tsx               # EXISTS — no change
├── SchoolCollegeContact.tsx           # EXISTS — no change
│
├── SchoolCollegeHeader.tsx            # NEW
├── SchoolCollegeFooter.tsx            # NEW
├── SchoolCollegeCourseCatalog.tsx     # NEW
├── SchoolCollegeCourseDetail.tsx      # NEW
├── SchoolCollegeBlogListing.tsx       # NEW
├── SchoolCollegeBlogPost.tsx          # NEW
├── SchoolCollegeLogin.tsx             # NEW
└── index.ts                           # MODIFY
```

**Template 5: `skill-academy/` — Full File Listing After Changes:**

```
features/landing-page/templates/skill-academy/
├── SkillAcademyLayout.tsx             # EXISTS — no change
├── SkillAcademyHero.tsx               # EXISTS — no change
├── SkillAcademyFeatures.tsx           # EXISTS — no change
├── SkillAcademyCourses.tsx            # EXISTS — no change
├── SkillAcademyTestimonials.tsx       # EXISTS — no change
├── SkillAcademyStats.tsx              # EXISTS — no change
├── SkillAcademyFaq.tsx                # EXISTS — no change
├── SkillAcademyContact.tsx            # EXISTS — no change
│
├── SkillAcademyHeader.tsx             # NEW
├── SkillAcademyFooter.tsx             # NEW
├── SkillAcademyCourseCatalog.tsx      # NEW
├── SkillAcademyCourseDetail.tsx       # NEW
├── SkillAcademyBlogListing.tsx        # NEW
├── SkillAcademyBlogPost.tsx           # NEW
├── SkillAcademyLogin.tsx              # NEW
└── index.ts                           # MODIFY
```

**Summary — New Files Per Template:**

| New Component | File Count × 5 Templates | Total New Files |
|---|---|---|
| Header | 5 | 5 |
| Footer | 5 | 5 |
| Course Catalog | 5 | 5 |
| Course Detail | 5 | 5 |
| Blog Listing | 5 | 5 |
| Blog Post | 5 | 5 |
| Login | 5 | 5 |
| **Total new files across all templates** | | **35** |
| Modified `index.ts` (barrel exports) | 5 | 5 |

**Shared Renderer Changes (edit existing files):**

| File | Change |
|---|---|
| `TemplateRenderer.tsx` | **MODIFY** — extend slug-to-theme dispatch to include page-type component resolution (not just section-type) |
| `public-navbar.tsx` | **MODIFY** — becomes the fallback; per-template headers take priority when available |
| `public-footer.tsx` | **MODIFY** — becomes the fallback; per-template footers take priority when available |

**New Page-Type Registry (alongside existing `section-registry.ts`):**

```
features/landing-page/components/public-renderer/
├── section-registry.ts                # EXISTS — no change (section-assembled pages)
├── page-type-registry.ts             # NEW — maps templateSlug + pageType → component
```

The `page-type-registry.ts` follows the same dispatch pattern as `section-registry.ts` but resolves by `(templateSlug, pageType)` instead of `(sectionType)`:

```typescript
// Conceptual pattern — exact API defined in developer instructions
type PageType = 'course_catalog' | 'course_detail' | 'blog_listing' | 'blog_post' | 'login';

// Each template registers its page-type components
// Fallback to generic components if a template doesn't define one
```

**New Public Route Pages:**

```
app/(website)/[tenantSlug]/
├── page.tsx                           # EXISTS — homepage resolver
├── [pageSlug]/page.tsx                # EXISTS — section-assembled pages
├── coming-soon/page.tsx               # EXISTS
│
├── courses/                           # NEW
│   ├── page.tsx                       # Course Catalog page
│   └── [courseSlug]/
│       └── page.tsx                   # Course Detail page
│
├── blog/                              # NEW
│   ├── page.tsx                       # Blog Listing page
│   └── [postSlug]/
│       └── page.tsx                   # Blog Post Detail page
│
├── auth/                              # NEW
│   ├── login/
│   │   └── page.tsx                   # Tenant-branded login
│   └── register/
│       └── page.tsx                   # Tenant-branded register
│
└── layout.tsx                         # MODIFIED — inject website theme (header/footer chrome)
```

**Modified Shared Components:**

| Component | Change |
|---|---|
| `TemplateRenderer.tsx` | Extended to dispatch page-type-specific components, not just section-type components |
| `public-navbar.tsx` | Replaced by per-template header dispatch (falls back to current shared header for backward compatibility) |
| `public-footer.tsx` | Replaced by per-template footer dispatch (falls back to current shared footer for backward compatibility) |
| `section-registry.ts` | No change — continues to serve section-assembled pages |

**New Tenant Admin Pages:**

```
app/tenant-admin-dashboard/landing-page/
├── ... (existing pages)
│
├── theme/
│   └── page.tsx                       # NEW — Website theme settings editor (header config, footer config, colors, typography)
│
└── display-config/
    └── page.tsx                       # NEW — Data-driven page display settings (catalog layout, blog layout)
```

**New/Modified API Services:**

| Service | Change |
|---|---|
| `tenant-landing-page-service.ts` | Add `getWebsiteTheme()`, `updateWebsiteTheme()`, `getDisplayConfig()`, `updateDisplayConfig()` |
| `public-website-service.ts` | **NEW** — Public API client for course catalog, course detail, blog, theme endpoints |

---

## 5. Course Detail Purchase Flow

When a visitor lands on a course detail page and wants to purchase:

1. Visitor views course detail page (public, no auth required for viewing)
2. Visitor clicks "Enroll Now" / "Buy Course" CTA
3. System checks if visitor is authenticated (JWT cookie present)
4. **If NOT authenticated** → redirect to tenant-branded login page with return URL parameter (`/auth/login?redirect=/courses/{courseSlug}`)
5. **If authenticated** → call `POST /api/public/{tenantSlug}/courses/{courseSlug}/checkout`
6. Backend creates Razorpay Order (same pattern as Phase 12A — order created outside DB transaction, idempotency key, amount verification)
7. Frontend receives `checkout_data` and launches Razorpay Checkout widget
8. Payment completion handled by webhook (same `ProcessWebhookUseCase` pattern — signature verification, idempotent processing)
9. On successful payment → enrollment created → student redirected to course player in panel

**Key Safety Rules (same as Phase 12A):**
- No Razorpay API calls inside database transactions
- Amount verification on webhook — must match course price at order creation time
- Idempotency via `payment_events` table
- `key_secret` never reaches frontend
- Free courses skip payment — direct enrollment on CTA click (still requires auth)

---

## 6. Login Page Architecture

The tenant-branded login page is NOT a separate configurable entity. It automatically inherits the website theme:

- Same header (per-template styled)
- Same footer (per-template styled)
- Same color scheme (tenant's brand overrides)
- Same logo (from tenant settings)
- The login form itself is a standard platform component — only the surrounding chrome is themed

The auth backend is unchanged. The tenant-branded login page calls the same `POST /api/auth/tenant/login` endpoint. The only difference is visual — the page is rendered within the tenant's website design rather than the generic platform auth layout.

**Routing:** When a visitor on `school-a.educoreos.com` (or `school.com` via custom domain) clicks "Login" in the navigation, they go to `school-a.educoreos.com/auth/login`. This is a public route that renders the tenant-branded login page. After successful login, the user is redirected to the tenant admin dashboard or student panel depending on their role.

---

## 7. Phasing Recommendation

This feature is large. Delivering everything in a single phase creates risk. The recommended split:

### Phase 13C — Website Theme + Course Pages (Revenue-Critical)

**Scope:**
- Website Theme infrastructure (new domain concept, clone operation extension, tenant settings)
- Per-template Header and Footer components (replace shared `public-navbar.tsx` / `public-footer.tsx` with per-template dispatch)
- Course Catalog page (public route, query service, per-template layout, filtering/search/sort)
- Course Detail page (public route, query service, per-template layout, curriculum display, pricing, teacher info)
- Course Purchase flow (Razorpay checkout on course detail page, auth-gated)
- Navigation system extension (add `course_catalog` and `login` link types)
- Updated `CloneTemplateUseCase` to clone theme settings
- Tenant Admin theme settings editor
- Extended reserved slugs list (`courses`, `blog`, `login`, `register`)
- New `page-type-registry.ts` in shared public-renderer

**Frontend file work — 13C:**

| File Type | Action | Per Template | × 5 Templates | Total |
|---|---|---|---|---|
| `{Template}Header.tsx` | CREATE | 1 | 5 | 5 |
| `{Template}Footer.tsx` | CREATE | 1 | 5 | 5 |
| `{Template}CourseCatalog.tsx` | CREATE | 1 | 5 | 5 |
| `{Template}CourseDetail.tsx` | CREATE | 1 | 5 | 5 |
| `index.ts` | EDIT | 1 | 5 | 5 |
| **13C new template files** | | | | **20 new + 5 edits** |

Plus: 2 new public route pages (`courses/page.tsx`, `courses/[courseSlug]/page.tsx`), 1 new `page-type-registry.ts`, edits to `TemplateRenderer.tsx`, `public-navbar.tsx`, `public-footer.tsx`, `layout.tsx`, new tenant admin page (`theme/page.tsx`), new API service file.

**Rationale:** The course catalog and detail page are the conversion funnel. Without them, visitors cannot discover courses, evaluate them, or purchase them. This is the highest-revenue-impact delivery. The website theme (header/footer) is a prerequisite because the course pages need the website chrome to render correctly.

**Estimated complexity:** HIGH — new public API endpoints, Razorpay integration on public routes, per-template page layouts × 5 templates, theme clone operation.

### Phase 13D — Blog Pages + Branded Auth

**Scope:**
- Blog Listing page (public route, query service, per-template layout)
- Blog Post Detail page (public route, query service, per-template layout)
- Tenant-branded Login page (public route, themed auth form)
- Tenant-branded Register page (public route, themed register form)
- Blog public API endpoints (verify existing or build new)
- Display config for blog layout preferences

**Frontend file work — 13D:**

| File Type | Action | Per Template | × 5 Templates | Total |
|---|---|---|---|---|
| `{Template}BlogListing.tsx` | CREATE | 1 | 5 | 5 |
| `{Template}BlogPost.tsx` | CREATE | 1 | 5 | 5 |
| `{Template}Login.tsx` | CREATE | 1 | 5 | 5 |
| `index.ts` | EDIT | 1 | 5 | 5 |
| **13D new template files** | | | | **15 new + 5 edits** |

Plus: 3 new public route pages (`blog/page.tsx`, `blog/[postSlug]/page.tsx`, `auth/login/page.tsx`, `auth/register/page.tsx`), edits to `page-type-registry.ts`, new API service methods.

**Rationale:** Blog and login are important for a complete website but don't directly drive revenue. They can ship behind Phase 13C without blocking tenant value. The blog system already exists — this phase is primarily about public rendering within the tenant's website design. The login page is a visual wrapper around existing auth infrastructure.

**Estimated complexity:** MEDIUM — lower than 13C because no payment flow, blog system already exists, login is a themed wrapper.

---

## 8. Key Design Decisions

| # | Decision | Rationale |
|---|---|---|
| 1 | **One template = one complete website** | Ensures design coherence. Prevents Frankenstein combinations of mismatched header/footer/page layouts. |
| 2 | **Per-template folders, not monolithic files** | Maintainability. Each template's files live in their own directory. Adding a new template means adding a new folder — no modification to existing templates. |
| 3 | **Section-assembled vs. data-driven page split** | Course/blog pages have fixed data structures that shouldn't be arbitrarily rearranged. Section-assembled pages remain flexible. |
| 4 | **Data-driven pages are NOT snapshot-cloned** | Their content comes from the database (courses, blog posts). Only display config (layout preferences) is stored per-tenant. |
| 5 | **Theme settings cloned on template selection** | Tenant gets a copy of the template's default theme (colors, typography, header/footer config). This copy is independent — template updates don't propagate. Consistent with Phase 13A snapshot model. |
| 6 | **Login page inherits website theme automatically** | No separate login page configuration. Whatever theme settings the tenant has for their website apply to the login page. Reduces configuration surface. |
| 7 | **Course purchase requires login first** | Simpler than guest checkout. Reuses existing auth system. No need for auto-account-creation flow. |
| 8 | **Per-template header/footer with shared fallback** | New templates get custom header/footer components. The existing shared `public-navbar.tsx` / `public-footer.tsx` become the fallback for any template that doesn't define its own. Backward compatible. |
| 9 | **Revenue-first phasing (13C before 13D)** | Course pages unblock the purchase funnel. Blog and login are important but don't block revenue. |

---

## 9. Scope Boundaries (What This Does NOT Include)

| Excluded | Reason | Deferred To |
|---|---|---|
| Guest checkout (buy without account) | Adds account auto-creation complexity | Future |
| Course reviews/ratings on public page | Requires review moderation system | Future |
| Course comparison feature | Low priority, adds frontend complexity | Future |
| Blog comments | Requires comment moderation system | Future |
| Sitemap generation | SEO improvement, not core functionality | Future |
| Google Analytics / tracking script injection | Tenant-specific config, separate concern | Future |
| Social login (Google/Facebook) on tenant login page | Auth system extension, separate phase | Future |
| Coupon/discount code on checkout | Pricing complexity, separate phase | Future |
| Installment payment on checkout | Separate financial flow | Future |
| Multi-language page content | i18n, separate concern | Future |
| New section types beyond v1 set | Developer deployment required, as designed | Future |
| Course curriculum content preview (video/text) on public page | Content access is post-enrollment only | Future |

---

## 10. Open Questions for Developer Instructions Phase

These questions must be resolved during the developer instructions authoring (next step in the phase-gate process):

1. **Blog system public API** — Does the existing blog bounded context already expose public-facing endpoints (`/api/public/{tenantSlug}/blog/posts`), or do these need to be created? This must be verified against the actual codebase before writing Phase 13D instructions.

2. **Course catalog filtering** — The exact filter set (category, price, search, sort) should be defined in the developer instructions based on what course data is currently available in the `PublicCourseQueryService` response.

3. **Theme config schema** — The exact JSON structure for header config, footer config, typography, and layout settings needs to be specified. This should be designed during developer instructions to accommodate the 5 existing template variants.

4. **ISR strategy for data-driven pages** — Course catalog and blog listing pages contain dynamic data that changes more frequently than section-assembled pages. The revalidation strategy (time-based vs. on-demand) needs to be defined.

5. **Backward compatibility** — Existing tenants who already have landing pages from Phase 13A need a migration path. They should get default theme settings auto-generated from their current `colorOverrides` and the shared header/footer config.

6. **Razorpay integration scope on public routes** — The existing Razorpay integration is on admin routes. The checkout endpoint on public routes needs careful consideration: it requires authentication (JWT) but runs on a public domain. The auth middleware chain needs to be specified.

---

## 11. Next Steps

This document completes the **business requirements discussion** step in the phase-gate process. The next steps are:

1. **Product Owner reviews and approves** this requirements document
2. **Developer Instructions for Phase 13C** are authored (by Principal Engineer)
3. **Antigravity produces Implementation Plan** for Phase 13C
4. **Principal Engineer audits** the implementation plan
5. **Implementation** proceeds
6. After Phase 13C completion → repeat for Phase 13D

---

*End of Document — EducoreOS Website Template System Requirements — March 21, 2026*
