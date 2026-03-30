# UBOTZ 2.0 — Phase 13F Developer Instructions

## Default Placeholder Website

| Field | Value |
|---|---|
| **Document Type** | Developer Instruction (Pre-Implementation Brief) |
| **Phase** | 13F |
| **Date** | March 21, 2026 |
| **Issued By** | Principal Engineer / Architecture Auditor |
| **Audience** | Implementation Developer (Antigravity) |
| **Expected Deliverable** | Phase 13F Implementation Plan |
| **Prerequisites** | Phase 13A (COMPLETE), Phase 13C/13D (COMPLETE), Phase 13E (Custom Content Pages — in progress or complete) |

> **This is a small, surgical phase.** No new database tables. No new domain entities. No new API endpoints for CRUD. The deliverable is one new frontend component, a minor backend API extension, and a routing condition change. Estimated effort: 1 day.

---

## 1. Mission Statement

Phase 13F ensures that **every tenant has a functional public website from the moment they are provisioned** — without requiring any admin action. Currently, a new tenant's subdomain shows a hardcoded "Coming Soon" placeholder until they select a template and publish pages. This is a dead end for visitors and makes the platform look unfinished.

After Phase 13F, a new tenant's website immediately shows a clean, platform-standard page displaying the institution name and a login link. This minimal website is replaced entirely when the tenant selects a real template from the catalog.

**What this phase includes:**
- A single platform-standard placeholder page component (not template-dependent)
- Dynamic rendering based on tenant state — no database page records created
- Tenant name pulled from existing tenant settings
- Login link pointing to the tenant's branded auth route
- Automatic transition: placeholder disappears when tenant selects a template

**What this phase does NOT include:**
- Any new database tables or entities
- Any new API endpoints for managing the placeholder
- Template selection or catalog changes
- Any modification to the tenant provisioning flow (no new records created during provisioning)
- Logo display (tenant may not have uploaded a logo yet at provisioning time)
- Contact info, tagline, or description on the placeholder

---

## 2. How It Works

### 2.1 The Condition

The entire feature is driven by a single condition:

```
Does this tenant have an active_template_slug in tenant_website_settings?
```

- **`active_template_slug` is NULL or no `tenant_website_settings` row exists** → Render the default placeholder
- **`active_template_slug` has a value** → Render the real template website (existing behavior)

This condition is checked on the **public page resolution path** — the same code path that currently decides between rendering a published page or the "Coming Soon" fallback.

### 2.2 When Does `active_template_slug` Get Set?

It is already set by the existing `CloneTemplateUseCase` (Phase 13C/13D). When a tenant clones a template, the use case upserts `tenant_website_settings` with the template slug. No changes to this flow are needed.

### 2.3 What About Newly Provisioned Tenants?

A newly provisioned tenant has:
- A row in the `tenants` table with `name`, `slug`, etc.
- No row in `tenant_website_settings` (or a row with `active_template_slug = NULL`)
- No rows in `landing_pages`
- No rows in `tenant_custom_pages`

The placeholder renders dynamically from the tenant's core settings. **No records need to be created during provisioning.** The absence of template selection IS the trigger for the placeholder.

### 2.4 Replacement Flow

```
Tenant provisioned → No template selected → Placeholder renders
         ↓
Tenant admin logs in → Goes to Website > Pages > Templates
         ↓
Selects "Coaching Pro" → CloneTemplateUseCase runs → active_template_slug = "coaching-pro"
         ↓
Next public visit → active_template_slug is set → Real template renders → Placeholder gone forever
```

The placeholder does not need to be "deleted" — it simply stops rendering because the condition is no longer true.

---

## 3. Business Rules

| Rule ID | Rule | Enforcement |
|---|---|---|
| BR-01 | The placeholder renders when the tenant has no `active_template_slug` set (NULL or missing row). | Public page resolution logic |
| BR-02 | The placeholder shows the **institution name** from the tenant's core settings (`tenants.name`). | Public API includes tenant name in placeholder response |
| BR-03 | The placeholder includes a **login link** pointing to `/{tenantSlug}/auth/login`. | Frontend component renders the link |
| BR-04 | The placeholder uses a **platform-standard fixed design** — not template-dependent. One layout for all tenants in placeholder state. | Single hardcoded React component, no template dispatch |
| BR-05 | The placeholder is replaced entirely when the tenant selects a template. No cleanup, no deletion — the condition simply stops matching. | `active_template_slug` being set causes the real template path to execute |
| BR-06 | The placeholder must respect `module.website` entitlement. If the tenant does not have `module.website`, return 404 (same as real template pages). | Existing module entitlement check in public resolver |
| BR-07 | The placeholder must work on both subdomain (`school-a.educoreos.com`) and custom domain (`school.com`) if configured. | Same public routing as existing pages |
| BR-08 | All routes except the root `/` should return 404 when in placeholder mode. There are no sub-pages (no `/courses`, no `/blog`, no `/about-us`). Only the root URL renders the placeholder. | Public resolver: if no template and path is not root → 404 |

---

## 4. Backend Changes

### 4.1 Public API — Theme Endpoint Extension

The existing `GET /api/public/tenants/{tenantSlug}/website/theme` endpoint returns theme config. This endpoint (or a lightweight variant) must also indicate whether the tenant is in **placeholder mode**.

**Option A (recommended):** Extend the existing theme endpoint response:

```json
{
    "has_template": false,
    "tenant_name": "ABC Coaching Institute",
    "tenant_slug": "abc-coaching",
    "theme_config": null
}
```

vs. when a template is selected:

```json
{
    "has_template": true,
    "active_template_slug": "coaching-pro",
    "tenant_name": "ABC Coaching Institute",
    "tenant_slug": "abc-coaching",
    "theme_config": { ... }
}
```

The `has_template` boolean is the discriminator the frontend uses to decide which rendering path to take.

**Option B:** Add `has_template` and `tenant_name` to the existing homepage endpoint response.

The developer must choose in the implementation plan. Option A is recommended because the theme endpoint is already called on every public page load as the first data fetch.

### 4.2 PublicWebsiteThemeQuery Extension

The `PublicWebsiteThemeQueryServiceInterface` (or its Eloquent implementation) must:

1. Check if `tenant_website_settings` exists for the tenant AND `active_template_slug` is not null
2. If no template → return a response with `has_template: false` and `tenant_name` from the `tenants` table
3. If template exists → return existing behavior with `has_template: true`

This is a minor modification to the existing query service. The tenant name is already available from the tenant resolution step — it just needs to be included in the response.

### 4.3 Public Page Resolver — Root Route Behavior

The existing public homepage resolver (`GET /api/public/tenants/{tenantSlug}/website/homepage` or equivalent) currently returns the homepage landing page.

When in placeholder mode (no template), the homepage endpoint should return a minimal response:

```json
{
    "page_type": "placeholder",
    "tenant_name": "ABC Coaching Institute"
}
```

This tells the frontend to render the placeholder component instead of the section-assembled renderer.

### 4.4 Public Page Resolver — Non-Root Routes

When in placeholder mode, ALL non-root public page routes must return **404**:

- `/courses` → 404
- `/courses/{slug}` → 404
- `/blog` → 404
- `/{anySlug}` → 404

Only the root `/` renders the placeholder. This prevents confusing half-functional states.

**Implementation:** The public page resolver should check `has_template` early. If false and the requested path is not the root homepage, return 404 immediately.

---

## 5. Frontend Changes

### 5.1 New Component: `DefaultPlaceholderPage`

**File:** `features/landing-page/components/public-renderer/DefaultPlaceholderPage.tsx`

A single, self-contained React component. Platform-standard design — no template dispatch, no `TenantWebsiteChrome`, no `page-type-registry` involvement.

**What it renders:**

```
┌─────────────────────────────────────────┐
│                                         │
│                                         │
│                                         │
│          [Institution Name]             │
│                                         │
│          ─────────────────              │
│                                         │
│          [ Login →  ]                   │
│                                         │
│                                         │
│                                         │
│                                         │
│  ─────────────────────────────────────  │
│  Powered by EducoreOS                   │
└─────────────────────────────────────────┘
```

**Design requirements:**
- Centered layout, vertically and horizontally
- Clean, minimal, professional — white/light background
- Institution name as the primary heading (large, bold)
- A simple horizontal divider
- "Login" as a clear CTA button/link pointing to `/{tenantSlug}/auth/login`
- Small "Powered by EducoreOS" footer text at the bottom
- Responsive — works on mobile
- No tenant color overrides (tenant hasn't configured any yet) — use platform neutral colors
- No images or logo (tenant may not have uploaded one yet)

**Props:**
```typescript
interface DefaultPlaceholderPageProps {
    tenantName: string;
    tenantSlug: string;
}
```

**Approximately 40–60 lines of code.** This is intentionally simple.

### 5.2 Modified: Homepage Resolver

**File:** `app/(website)/[tenantSlug]/page.tsx` (or the homepage route)

Currently this page fetches the homepage data and renders the template. After this phase:

1. Fetch theme data (existing call) — now includes `has_template`
2. If `has_template === false` → render `<DefaultPlaceholderPage tenantName={...} tenantSlug={...} />`
3. If `has_template === true` → existing behavior (fetch homepage, render via TemplateRenderer)

### 5.3 Modified: Sub-Route Pages

The following route pages must handle the placeholder state:

- `app/(website)/[tenantSlug]/[pageSlug]/page.tsx`
- `app/(website)/[tenantSlug]/courses/page.tsx`
- `app/(website)/[tenantSlug]/courses/[courseSlug]/page.tsx`
- `app/(website)/[tenantSlug]/blog/page.tsx`
- `app/(website)/[tenantSlug]/blog/[postSlug]/page.tsx`

Each of these can either:

**Option A (recommended):** Handle it at the layout level. The `app/(website)/[tenantSlug]/layout.tsx` fetches theme data. If `has_template === false` and the current path is NOT the root, render a 404 page (or redirect to root). This centralizes the check in one place.

**Option B:** Each page individually checks and returns `notFound()` if no template.

The developer must choose in the implementation plan. Option A is strongly recommended — one check in the layout prevents every sub-page from duplicating the logic.

### 5.4 Auth Routes in Placeholder Mode

The `app/(website)/[tenantSlug]/auth/login/page.tsx` must still work in placeholder mode. The login page should render even when no template is selected — but since there's no template, it cannot use `TenantWebsiteChrome` or any template-specific Login component.

**Solution:** The login page checks `has_template`:
- If true → render template-branded login (existing behavior via `page-type-registry`)
- If false → render a **platform-standard login form** (no template chrome, just a clean centered login form with the institution name as heading)

This platform-standard login form can be a simple variant of the `DefaultPlaceholderPage` with an embedded login form, or a separate minimal component. The auth backend call is the same regardless.

### 5.5 Replacing the "Coming Soon" Page

The existing `app/(website)/[tenantSlug]/coming-soon/page.tsx` (from Phase 13A) is effectively **superseded** by the `DefaultPlaceholderPage`. The "Coming Soon" page was a hardcoded fallback for tenants with no published pages.

After Phase 13F:
- Tenant with no template selected → `DefaultPlaceholderPage` (new)
- Tenant with template selected but no published pages → This edge case should show the "Coming Soon" page (existing behavior)
- Tenant with template selected and published pages → Real website (existing behavior)

The "Coming Soon" page remains for the second case. The `DefaultPlaceholderPage` covers the first case. These are distinct states.

---

## 6. Security Requirements

| Concern | Enforcement |
|---|---|
| Tenant isolation | Tenant name fetched via existing tenant resolution (slug → tenant_id). No cross-tenant data exposed. |
| Module entitlement | If tenant lacks `module.website`, return 404 even in placeholder mode. |
| XSS | Tenant name rendered via React JSX escaping (no `dangerouslySetInnerHTML`). |
| No data leakage | Placeholder exposes only the institution name — no internal IDs, no admin info, no user counts. |
| Login link safety | Points to `/{tenantSlug}/auth/login` — a known, validated route. No user-provided URLs. |

---

## 7. Quality Gates

Phase 13F is NOT complete until ALL of these pass:

### 7.1 Functional Gates

- [ ] New tenant with no template selected → root URL shows placeholder with institution name and login link
- [ ] Same tenant → `/courses` returns 404
- [ ] Same tenant → `/blog` returns 404
- [ ] Same tenant → `/{any-slug}` returns 404
- [ ] Same tenant → `/auth/login` renders a working login form (platform-standard, no template chrome)
- [ ] Tenant selects a template → root URL now shows the real homepage (placeholder gone)
- [ ] Tenant selects a template → `/courses`, `/blog`, etc. work as expected
- [ ] Placeholder renders correctly on subdomain (`school-a.educoreos.com`)
- [ ] Placeholder renders correctly on custom domain (if configured)
- [ ] Placeholder respects `module.website` — returns 404 if module not entitled
- [ ] "Coming Soon" page still works for tenants WITH a template but NO published pages

### 7.2 Security Gates

- [ ] Tenant name is escaped (no XSS)
- [ ] No internal data exposed in placeholder response
- [ ] Login form submits to correct tenant auth endpoint

---

## 8. File Manifest

### 8.1 New Files

| File | Purpose |
|---|---|
| `frontend/features/landing-page/components/public-renderer/DefaultPlaceholderPage.tsx` | Platform-standard placeholder page component |

That's it. **One new file.**

### 8.2 Modified Files

| File | Change |
|---|---|
| Backend: `PublicWebsiteThemeQuery` (Eloquent impl) | Return `has_template: false` + `tenant_name` when no template selected |
| Backend: Public homepage resolver (controller/query) | Return `page_type: "placeholder"` response when no template |
| Frontend: `app/(website)/[tenantSlug]/page.tsx` | Check `has_template`, render `DefaultPlaceholderPage` if false |
| Frontend: `app/(website)/[tenantSlug]/layout.tsx` | Centralized check — if no template and path is not root/auth, render 404 |
| Frontend: `app/(website)/[tenantSlug]/auth/login/page.tsx` | Handle no-template state with platform-standard login form |

### 8.3 No Changes Needed

| Component | Reason |
|---|---|
| Tenant provisioning flow | No records created — placeholder is dynamic based on absence of `active_template_slug` |
| `CloneTemplateUseCase` | Already sets `active_template_slug` — no change needed |
| Database tables | No new tables, no migrations |
| `tenant_website_settings` | Existing table, existing behavior — NULL `active_template_slug` is the trigger |
| Navigation system | No navigation in placeholder mode |
| "Coming Soon" page | Remains for the "template selected but no published pages" case |

---

## 9. Constraints & Reminders

- **No database records for the placeholder.** The placeholder is a dynamic render based on tenant state. Zero records created, zero records to clean up.
- **Slug `active_template_slug` is the single source of truth.** NULL = placeholder. Non-NULL = real template. No additional flags or status fields.
- **The placeholder is deliberately minimal.** Do not add features to it (course preview, blog preview, contact form, etc.). Its purpose is to not look broken while the tenant sets up their real website.
- **Auth must work in placeholder mode.** The login link is the one functional feature on the placeholder. If login doesn't work, the tenant admin cannot even access the dashboard to select a template.
- **Do not remove the "Coming Soon" page.** It serves a different state (template selected, no published pages). The placeholder serves the earlier state (no template selected at all).

### Docker Environment

- Container: Alpine Linux — use `sh` not `bash`
- Container name: `ubotz_backend`

---

## 10. Definition of Done

Phase 13F is complete when:

1. The implementation plan has been reviewed and approved by the Principal Engineer.
2. All code is implemented per the approved plan.
3. All quality gates in §7 pass.
4. A Principal Engineer audit confirms zero critical or high findings.
5. A successful end-to-end demonstration: new tenant created → visit subdomain → placeholder shows institution name + login link → tenant selects template → placeholder replaced by real website.
6. The Phase 13F Completion Report is signed off.

---

*End of Document — UBOTZ 2.0 Phase 13F Developer Instructions — March 21, 2026*
