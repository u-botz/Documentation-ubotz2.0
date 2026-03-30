# UBOTZ 2.0 — Landing Page: Business Findings & Design

| Field | Value |
|---|---|
| **Document Type** | Principal Engineer — Business Logic Audit |
| **Feature** | Landing Page Management |
| **Date** | 2026-03-27 |
| **Issued By** | Principal Engineer / Architecture Auditor |
| **Scope** | Platform-level template governance, tenant-level page builder, public page delivery |
| **Status** | REVIEWED — Reflects current implemented state |

---

## 1. Executive Summary

The Landing Page system in UBOTZ 2.0 operates at **two distinct layers**:

1. **Platform Level — Template Library:** Platform admins design and maintain a curated set of reusable landing page templates. Each template is scoped to an institution type (e.g., Coaching Pro, School & College). Templates go through a formal approval workflow before tenants can use them.

2. **Tenant Level — Page Builder:** Tenant admins create their own landing pages by instantiating platform-approved templates. They customize sections, content, SEO fields, and color overrides within the tenant's website. Pages are then published to be publicly accessible.

The system generates the **public-facing website** for each tenant — it is what prospective students see when they visit the tenant's URL before logging in.

---

## 2. Platform Level — Template Lifecycle (6-State Machine)

Platform admins design master templates that tenants use as starting points. Each template goes through a governed approval workflow identical in structure to Subscription Plans and Institution Types.

| Status | DB Value | Meaning |
|---|---|---|
| `DRAFT` | `draft` | Template being designed. Not available to tenants. |
| `PENDING_PUBLISH` | `pending_publish` | Submitted for L2 review. Locked. |
| `PUBLISHED` | `published` | Live. Tenants can create pages from this template. |
| `REJECTED` | `rejected` | Returned from review with a mandatory reason. |
| `PENDING_ARCHIVE` | `pending_archive` | Archive requested. Awaiting L2 approval. |
| `ARCHIVED` | `archived` | Retired. Not available for new usage. |

### 2.1 Template Approval Workflow

```
DRAFT → (Submit for Publish) → PENDING_PUBLISH → (Approve) → PUBLISHED
                                               → (Reject + reason) → REJECTED
REJECTED → (Re-submit)       → PENDING_PUBLISH

PUBLISHED → (Request Archive) → PENDING_ARCHIVE → (Approve Archive) → ARCHIVED
                                                → (Reject Archive + reason) → PUBLISHED

ARCHIVED → (Unarchive) → PUBLISHED
```

**Key Guards:**
- A template **cannot be published** unless it has an `institution_type_id` assigned. Attempting to approve a template without an institution type throws a `DomainException`.
- Rejection reason is mandatory (empty string throws `InvalidArgumentException` at entity level).
- Unarchiving restores directly to `PUBLISHED` (not `DRAFT`).

### 2.2 Template → Institution Type Relationship

Each template is scoped to one institution type (e.g., a "Coaching Pro" template is for Coaching Institute tenants). This scoping ensures:
- The template's design and section defaults match the institution's typical content structure.
- When a tenant creates a landing page, the displayed templates are filtered to their institution type — tenants only see templates relevant to them.

### 2.3 Template Sections

Templates define a **section structure** — the blocks that compose the page (hero banner, about, courses list, testimonials, contact form, etc.). These sections are inherited by tenant pages when they instantiate the template. Tenants can then customize section content, toggle visibility, and reorder them.

---

## 3. Tenant Level — Landing Page Lifecycle (2-State Machine)

Tenant admins create and manage their own landing pages within the page builder.

| Status | DB Value | Publicly Visible? | Meaning |
|---|---|---|---|
| `DRAFT` | `draft` | ❌ No | Under construction. Not live. |
| `PUBLISHED` | `published` | ✅ Yes | Live and accessible at the tenant's public URL. |

Tenants can toggle between draft and published. Unpublishing a page reverts it to `DRAFT`.

### 3.1 Homepage Flag

Each tenant can designate exactly one page as the **homepage** (`is_homepage = true`). This is the page served at the tenant's root URL. The application does not enforce uniqueness of `is_homepage` at the DB level — business logic in the use case must handle this.

### 3.2 Template-Based Creation

Tenant landing pages are always created from a platform-published template (`createFromTemplate()`). The page inherits:
- The template's section structure (copied at creation time, not live-linked).
- Default meta title and meta description from the template.

After creation, the tenant's page is fully independent of the source template — changes to the platform template do not affect existing tenant pages.

### 3.3 Slug Rules

- Each page has a tenant-unique `slug` (e.g., `about-us`, `courses`).
- Certain slugs are reserved by the platform (`ReservedSlug` value object) and cannot be used by tenants.
- Reserved slug validation fires on page creation **and** on metadata updates.

### 3.4 Quota Enforcement

`LandingPageQuotaExceededException` exists — indicating that tenants have a limit on the number of landing pages they can create. The limit is tied to the tenant's subscription plan.

---

## 4. Public Page Delivery

`PublicLandingPageController` serves tenant pages to unauthenticated visitors:
- The route resolves the tenant from the host/subdomain.
- The page is looked up by slug (or homepage flag if no slug is given).
- Only `PUBLISHED` pages are served. Draft pages return 404 to the public.

**SEO fields exposed per page:**
- `meta_title`
- `meta_description`
- `og_image_url`
- Color overrides for brand theming

---

## 5. Business Rules — Complete Reference

| ID | Rule | Enforcement Point |
|---|---|---|
| BR-LP-01 | Templates can only be published if they have an institution type assigned. | `LandingPageTemplate::approvePublish()` — throws `DomainException`. |
| BR-LP-02 | Rejection reason is mandatory for both `rejectPublish()` and `rejectArchive()`. | `LandingPageTemplate` entity. |
| BR-LP-03 | Unarchiving a template restores it directly to `PUBLISHED`. | `LandingPageTemplate::unarchive()`. |
| BR-LP-04 | Tenant pages are always created from a platform-published template. | `LandingPage::createFromTemplate()`. |
| BR-LP-05 | Reserved slugs cannot be used by tenant pages. | `ReservedSlug::isReserved()` — throws `ReservedPageSlugException`. |
| BR-LP-06 | Only `PUBLISHED` pages are served to the public — draft pages return 404. | `PublicLandingPageController`. |
| BR-LP-07 | Tenants have a landing page quota enforced against their subscription plan. | `LandingPageQuotaExceededException`. |
| BR-LP-08 | Tenant pages inherit sections from the template at creation time. Changes to the source template do not affect existing pages. | `createFromTemplate()` deep-copies sections. |
| BR-LP-09 | Color overrides allow tenants to apply brand theming without editing section content. | `LandingPage::updateColorOverrides()`. |
| BR-LP-10 | Template availability is filtered by institution type when tenants browse templates. | `LandingPageTemplateRepository` filter by `institution_type_id`. |

---

## 6. Open Questions for Product Owner

| # | Question | Impact |
|---|---|---|
| 1 | Should template changes (post-publish) be propagated back to tenant pages that use that template? | Currently changes are one-time inherited at creation only. |
| 2 | Is the homepage uniqueness rule enforced per tenant in code, or is it a UI-only concern? | `is_homepage` field exists but uniqueness is not confirmed at DB level. |
| 3 | What is the tenant's landing page quota limit? Is it configurable per plan tier? | `LandingPageQuotaExceededException` exists but quota value is not visible in config. |
| 4 | Can tenants upload custom images for OG (`og_image_url`) or only the SEO title/description? | Image upload endpoint exists via `LandingPageMediaController`. |

---

*End of Document — UBOTZ 2.0 Landing Page Business Findings — March 27, 2026*
