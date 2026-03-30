# UBOTZ 2.0 — Phase 13E Developer Instructions

## Custom Content Pages

| Field | Value |
|---|---|
| **Document Type** | Developer Instruction (Pre-Implementation Brief) |
| **Phase** | 13E |
| **Date** | March 21, 2026 |
| **Issued By** | Principal Engineer / Architecture Auditor |
| **Audience** | Implementation Developer (Antigravity) |
| **Expected Deliverable** | Phase 13E Implementation Plan |
| **Prerequisites** | Phase 13A (Landing Page Template System — COMPLETE), Phase 13C/13D (Website Template System — COMPLETE) |

> **This is a small, focused phase.** It adds one new entity, one new table, a handful of API endpoints, and one new page-type component per template. The domain model is simple. The rendering reuses existing infrastructure (TenantWebsiteChrome, page-type-registry, template Layout). Estimated effort: 2–3 days for a developer familiar with the codebase.

---

## 1. Mission Statement

Phase 13E adds **Custom Content Pages** — a simple mechanism for tenant admins to create free-form plain text pages (About Us, Terms of Service, Privacy Policy, Refund Policy, etc.) that render within their selected website template's design.

Custom pages are managed alongside landing pages in the tenant admin dashboard under Website > Pages. They share the same `max_landing_pages` quota and the same root-level URL namespace (`/{slug}`). They are deliberately simple — title, auto-generated slug, plain text body with line breaks. No rich text, no sections, no assembly.

**What this phase includes:**
- `TenantCustomPage` domain entity with draft/published lifecycle
- `tenant_custom_pages` database table
- Tenant admin CRUD API (create, read, update, publish, unpublish, delete)
- Public rendering via existing `[pageSlug]/page.tsx` route (extended resolver)
- Per-template `{Template}CustomPage.tsx` component (×5 templates)
- Registration in `page-type-registry.tsx`
- `custom_page` added to `LinkType` for navigation
- Shared slug uniqueness across `landing_pages` and `tenant_custom_pages`
- Quota enforcement counting both landing pages and custom pages together

**What this phase does NOT include:**
- Rich text editor (plain text only — deliberate simplicity)
- Markdown support
- SEO metadata fields (auto-derived from title and body)
- Media/image uploads within custom pages
- Custom page templates or section assembly
- Any changes to the existing landing page system

---

## 2. Business Rules (NON-NEGOTIABLE)

| Rule ID | Rule | Enforcement |
|---|---|---|
| BR-01 | Custom pages have a `title` (required, max 255 chars) and `body` (required, plain text, max 50,000 chars). | Domain entity validation |
| BR-02 | Slug is **auto-generated** from the title (kebab-case). Tenant does NOT manually enter a slug. Slug is generated on create and does NOT change on title update (immutable after creation). | Application layer: slug generated via `Str::slug($title)` on create only |
| BR-03 | Slug must be **unique across both** `landing_pages` AND `tenant_custom_pages` within the same tenant. A custom page cannot have the same slug as a landing page, and vice versa. | Application layer cross-table uniqueness check before insert |
| BR-04 | Slug must NOT collide with reserved paths (`courses`, `blog`, `login`, `register`, `auth`, `panel`, `tenant-admin-dashboard`, `super-admin-dashboard`, `api`, `_next`). | Existing `ReservedSlug::isReserved()` check |
| BR-05 | If auto-generated slug collides (with reserved paths, landing pages, or other custom pages), append a numeric suffix (`-1`, `-2`, etc.) until unique. | Application layer collision resolution |
| BR-06 | Custom pages count toward the existing `max_landing_pages` quota. The quota check must count `landing_pages + tenant_custom_pages` for the tenant. | Modified quota check in create use case |
| BR-07 | Custom pages follow the same `draft → published` lifecycle as landing pages. Only `published` custom pages are visible to public visitors. | `PageStatus` value object (reuse from existing landing page domain) |
| BR-08 | Body text is plain text only. HTML tags in body text are stripped on write. Line breaks (`\n`) are preserved and rendered as `<br>` on the public page. | Backend: `strip_tags()` on write. Frontend: render with CSS `white-space: pre-line` or explicit `\n` → `<br>` conversion |
| BR-09 | Custom pages are tenant-scoped. All queries filtered by `tenant_id`. | Global scope on Eloquent model, same pattern as `landing_pages` |
| BR-10 | Custom pages are visible on the public website only if the tenant has `module.website` entitlement. If module is revoked, custom pages become invisible (same behavior as landing pages). | Public resolver checks module entitlement |
| BR-11 | Deleting a custom page is a hard delete (not soft delete), same as landing page deletion. | Repository delete method |
| BR-12 | Audit-logged events: `custom_page.created`, `custom_page.published`, `custom_page.unpublished`, `custom_page.deleted`. Content edits are NOT audited (same convention as landing pages). | Standard `tenant_audit_logs` pattern |

---

## 3. Domain Model

### 3.1 Bounded Context

`TenantAdminDashboard` — same context as the existing landing page entities.

### 3.2 Entity: `TenantCustomPage`

**Namespace:** `App\Domain\TenantAdminDashboard\CustomPage\Entities\TenantCustomPage`

```
TenantCustomPage (aggregate root)
├── id: ?int
├── tenantId: int
├── title: string (max 255)
├── slug: string (auto-generated, immutable after create, unique across landing_pages + tenant_custom_pages per tenant)
├── body: string (plain text, max 50,000 chars, HTML stripped)
├── status: PageStatus (draft | published) — REUSE existing value object
├── publishedAt: ?DateTimeImmutable
├── createdAt: ?DateTimeImmutable
├── updatedAt: ?DateTimeImmutable
```

**Domain methods:**
- `publish(): void` — transitions draft → published, sets `publishedAt`
- `unpublish(): void` — transitions published → draft, clears `publishedAt`
- `updateContent(string $title, string $body): void` — updates title and body. Does NOT change slug.

**Constructor:** accepts `tenantId`, `title`, `slug`, `body`. Status starts as `draft`.

### 3.3 Value Objects (reused)

| Value Object | Source | Usage |
|---|---|---|
| `PageStatus` | `Domain/TenantAdminDashboard/LandingPage/ValueObjects/PageStatus` | Reuse directly — same `draft`/`published` lifecycle |

No new value objects needed.

### 3.4 Domain Events

| Event | Trigger |
|---|---|
| `TenantCustomPageCreated` | Custom page created |
| `TenantCustomPagePublished` | Status → published |
| `TenantCustomPageUnpublished` | Status → draft |
| `TenantCustomPageDeleted` | Custom page deleted |

All events are past-tense facts, dispatched outside database transactions, per established convention.

### 3.5 Domain Exceptions

| Exception | HTTP | Trigger |
|---|---|---|
| `CustomPageNotFoundException` | 404 | Page not found for the authenticated tenant |
| `DuplicateCustomPageSlugException` | 422 | Slug collides with existing landing page or custom page |
| `InvalidPageStatusTransitionException` | 422 | Reuse existing exception from landing page domain |

### 3.6 Repository Interface

**Namespace:** `App\Domain\TenantAdminDashboard\CustomPage\Repositories\TenantCustomPageRepositoryInterface`

```php
interface TenantCustomPageRepositoryInterface
{
    public function findById(int $tenantId, int $id): ?TenantCustomPage;
    public function findBySlug(int $tenantId, string $slug): ?TenantCustomPage;
    public function findAllByTenant(int $tenantId, array $criteria = []): LengthAwarePaginator;
    public function save(TenantCustomPage $page): TenantCustomPage;
    public function delete(int $tenantId, int $id): void;
    public function slugExistsForTenant(int $tenantId, string $slug): bool;
    public function countByTenant(int $tenantId): int;
}
```

---

## 4. Application Layer

### 4.1 Use Cases

| Use Case | Command | Purpose |
|---|---|---|
| `CreateCustomPageUseCase` | `CreateCustomPageCommand` | Validate → check quota (landing pages + custom pages combined) → generate slug → check cross-table uniqueness → create entity → transaction → audit → event |
| `UpdateCustomPageUseCase` | `UpdateCustomPageCommand` | Validate → load entity → update title + body (slug unchanged) → transaction → audit |
| `PublishCustomPageUseCase` | `PublishCustomPageCommand` | Load → transition status → transaction → audit → event |
| `UnpublishCustomPageUseCase` | `UnpublishCustomPageCommand` | Load → transition status → transaction → audit → event |
| `DeleteCustomPageUseCase` | `DeleteCustomPageCommand` | Load → delete → audit → event |

### 4.2 Commands (DTOs)

**`CreateCustomPageCommand`:**
```php
final readonly class CreateCustomPageCommand
{
    public function __construct(
        public int $tenantId,
        public int $actorUserId,
        public string $title,
        public string $body,
    ) {}
}
```

**`UpdateCustomPageCommand`:**
```php
final readonly class UpdateCustomPageCommand
{
    public function __construct(
        public int $tenantId,
        public int $actorUserId,
        public int $pageId,
        public string $title,
        public string $body,
    ) {}
}
```

**`PublishCustomPageCommand` / `UnpublishCustomPageCommand` / `DeleteCustomPageCommand`:**
```php
final readonly class PublishCustomPageCommand
{
    public function __construct(
        public int $tenantId,
        public int $actorUserId,
        public int $pageId,
    ) {}
}
```

### 4.3 Slug Generation & Cross-Table Uniqueness

The `CreateCustomPageUseCase` must:

1. Generate slug: `$slug = Str::slug($command->title)`
2. Check `ReservedSlug::isReserved($slug)` — if reserved, append `-page` (e.g., `blog` → `blog-page`)
3. Check uniqueness across BOTH tables:
   - `$this->customPageRepo->slugExistsForTenant($tenantId, $slug)`
   - `$this->landingPageRepo->slugExistsForTenant($tenantId, $slug)` ← **requires this method on the existing landing page repository interface**
4. If collision, append numeric suffix: `$slug-1`, `$slug-2`, etc. (max 10 attempts, then throw exception)
5. The final resolved slug is stored on the entity

**Important:** The `LandingPageRepositoryInterface` (existing) must expose a `slugExistsForTenant(int $tenantId, string $slug): bool` method. Check if this already exists. If not, add it.

### 4.4 Quota Check (Modified)

The existing quota check in `CloneTemplateUseCase` counts `landing_pages` only. The new `CreateCustomPageUseCase` must count BOTH:

```php
$landingPageCount = $this->landingPageRepo->countByTenant($tenantId);
$customPageCount = $this->customPageRepo->countByTenant($tenantId);
$totalPageCount = $landingPageCount + $customPageCount;

// Check against max_landing_pages quota
```

**Also:** The existing `CloneTemplateUseCase` must be updated to count both tables when checking quota. Otherwise a tenant at quota limit could still create custom pages (or vice versa). This is a modification to an existing use case — handle carefully.

---

## 5. Infrastructure Layer

### 5.1 Database Migration

**Table:** `tenant_custom_pages`

```sql
CREATE TABLE tenant_custom_pages (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    tenant_id BIGINT UNSIGNED NOT NULL,
    title VARCHAR(255) NOT NULL,
    slug VARCHAR(255) NOT NULL,
    body TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'draft',
    published_at TIMESTAMP NULL,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL,
    
    UNIQUE KEY uq_tenant_custom_page_slug (tenant_id, slug),
    INDEX idx_tenant_custom_pages_tenant (tenant_id),
    INDEX idx_tenant_custom_pages_status (tenant_id, status)
);
```

**Note:** The cross-table uniqueness (slug unique across `landing_pages` AND `tenant_custom_pages`) is enforced at the application layer, NOT via database constraint. Database constraint only ensures uniqueness within `tenant_custom_pages` itself.

### 5.2 Eloquent Model

**File:** `App\Infrastructure\Persistence\TenantAdminDashboard\CustomPage\TenantCustomPageRecord`

Standard Eloquent model with `BelongsToTenant` trait (same as `LandingPageRecord`). Global scope applied for tenant isolation.

### 5.3 Repository Implementation

**File:** `App\Infrastructure\Persistence\TenantAdminDashboard\CustomPage\EloquentTenantCustomPageRepository`

Implements `TenantCustomPageRepositoryInterface`. Standard `toEntity()` / `fromEntity()` mapper pattern.

### 5.4 Service Container Binding

In `AppServiceProvider`:
```php
$this->app->bind(
    TenantCustomPageRepositoryInterface::class,
    EloquentTenantCustomPageRepository::class
);
```

---

## 6. HTTP Layer

### 6.1 Tenant Admin Endpoints

**Route file:** `routes/tenant_dashboard/landing_page.php` (add to existing file)

**Middleware:** Same as existing landing page routes — `tenant.resolve.token → auth:tenant_api → tenant.active → ensure.user.active → tenant.session → tenant.capability:website.manage`

| Method | Endpoint | Controller | Description |
|---|---|---|---|
| `GET` | `/api/tenant-dashboard/custom-pages` | `TenantCustomPageReadController` | List custom pages (paginated, filterable by status) |
| `GET` | `/api/tenant-dashboard/custom-pages/{id}` | `TenantCustomPageReadController` | Get custom page detail |
| `POST` | `/api/tenant-dashboard/custom-pages` | `TenantCustomPageWriteController` | Create custom page |
| `PUT` | `/api/tenant-dashboard/custom-pages/{id}` | `TenantCustomPageWriteController` | Update title + body |
| `POST` | `/api/tenant-dashboard/custom-pages/{id}/publish` | `TenantCustomPageWriteController` | Publish |
| `POST` | `/api/tenant-dashboard/custom-pages/{id}/unpublish` | `TenantCustomPageWriteController` | Unpublish |
| `DELETE` | `/api/tenant-dashboard/custom-pages/{id}` | `TenantCustomPageWriteController` | Delete |

### 6.2 FormRequests

**`CreateCustomPageRequest`:**
```php
public function rules(): array
{
    return [
        'title' => ['required', 'string', 'max:255'],
        'body'  => ['required', 'string', 'max:50000'],
    ];
}
```

**`UpdateCustomPageRequest`:** Same rules as create.

### 6.3 Resource

**`TenantCustomPageResource`:**
```json
{
    "id": 1,
    "title": "About Us",
    "slug": "about-us",
    "body": "We are a coaching institute founded in 2010...\n\nOur mission is...",
    "status": "draft",
    "published_at": null,
    "created_at": "2026-03-21T10:00:00Z",
    "updated_at": "2026-03-21T10:00:00Z"
}
```

### 6.4 Public Page Resolution (Modified)

The existing `PublicPageController` (or `PublicLandingPageController`) resolves `/{pageSlug}` by looking up `landing_pages` where `slug = $pageSlug AND tenant_id = $tenantId AND status = 'published'`.

**This must be extended** to also check `tenant_custom_pages` if the slug is not found in `landing_pages`:

```
1. Query landing_pages for slug → if found, return section-assembled page data (existing behavior)
2. If not found → query tenant_custom_pages for slug → if found, return custom page data
3. If not found in either → 404
```

The response shape for a custom page is different from a landing page (no sections). The controller must return a discriminator field so the frontend knows which type of page it received:

```json
{
    "page_type": "custom",
    "title": "About Us",
    "slug": "about-us",
    "body": "We are a coaching institute...\n\nOur mission is...",
    "meta_title": "About Us",
    "meta_description": "We are a coaching institute founded in 2010..."
}
```

vs. the existing landing page response:

```json
{
    "page_type": "landing",
    "title": "Home",
    "slug": "home",
    "sections": [...],
    ...
}
```

**`meta_title`** defaults to the page title. **`meta_description`** defaults to the first 160 characters of the body text (truncated at a word boundary).

### 6.5 LinkType Extension

Add `custom_page` to the `LinkType` value object. Navigation items can now link to custom pages using `link_type: 'custom_page'` and `link_value: '{slug}'`.

The navigation resolver (`resolve-public-nav-href.ts` on frontend) must handle this new type — it resolves to `/{tenantSlug}/{slug}` (same as `internal_page`).

---

## 7. Frontend

### 7.1 Public Page Resolution (Modified)

The existing `app/(website)/[tenantSlug]/[pageSlug]/page.tsx` fetches page data from the public API. After this phase, the response includes a `page_type` discriminator.

The page component must:
1. Fetch page data (existing call)
2. Check `page_type`:
   - `"landing"` → render via existing `TemplateRenderer` (section-assembled)
   - `"custom"` → render via `page-type-registry.tsx` with `pageType: 'custom_page'`

### 7.2 Per-Template Custom Page Component

Each template folder gets one new file:

| Template | New File |
|---|---|
| `coaching-pro/` | `CoachingProCustomPage.tsx` |
| `online-academy/` | `OnlineAcademyCustomPage.tsx` |
| `prestige-institute/` | `PrestigeInstituteCustomPage.tsx` |
| `school-college/` | `SchoolCollegeCustomPage.tsx` |
| `skill-academy/` | `SkillAcademyCustomPage.tsx` |

**Total: 5 new files + 5 `index.ts` edits**

Each component receives `{ title, body }` as props and renders:
- Page title as an `<h1>`
- Body text in a content area with `white-space: pre-line` (preserves line breaks)
- Wrapped in `TenantWebsiteChrome` (same as other data-driven pages — gets template header/footer/colors)

The component is simple — roughly 20–30 lines. The visual styling should match the template's design language (typography, spacing, content width). Think of it as a "blog post without metadata" — a clean content page.

### 7.3 Page-Type Registry Update

**File:** `features/landing-page/components/public-renderer/page-type-registry.tsx`

Add `custom_page` to the registry mapping:

```typescript
// Add to existing registry
'custom_page': {
    'coaching-pro': CoachingProCustomPage,
    'online-academy': OnlineAcademyCustomPage,
    'prestige-institute': PrestigeInstituteCustomPage,
    'school-college': SchoolCollegeCustomPage,
    'skill-academy': SkillAcademyCustomPage,
}
```

### 7.4 Tenant Admin UI

Custom pages appear in the **existing** Website > Pages section alongside landing pages. The page list must be extended to show both types.

**Option A (recommended):** Add a tab or filter to the existing pages list — "Landing Pages" / "Custom Pages" / "All". Each custom page row shows: title, slug, status badge (draft/published), created date, actions (edit/publish/unpublish/delete).

**Option B:** Mixed list with a type indicator column.

The **create flow** needs a new entry point. The existing "Create Page" flow goes to the template catalog (clone). Add a second option: "Create Custom Page" which opens a simple form with title and body textarea.

**Edit page:** Simple form — title field (editable), slug field (read-only, shown for reference), body textarea, publish/unpublish button.

### 7.5 Navigation Editor

The tenant admin navigation editor must support the new `custom_page` link type. When adding a nav item, the tenant should be able to select from their published custom pages (dropdown populated from `GET /api/tenant-dashboard/custom-pages?status=published`).

### 7.6 API Service Extension

**File:** `services/tenant-landing-page-service.ts` — add:

```typescript
getCustomPages(params?): Promise<PaginatedResponse<CustomPage>>
getCustomPage(id: number): Promise<CustomPage>
createCustomPage(data: { title: string; body: string }): Promise<CustomPage>
updateCustomPage(id: number, data: { title: string; body: string }): Promise<CustomPage>
publishCustomPage(id: number): Promise<CustomPage>
unpublishCustomPage(id: number): Promise<CustomPage>
deleteCustomPage(id: number): Promise<void>
```

---

## 8. Security Requirements

| Concern | Enforcement |
|---|---|
| Tenant isolation | `tenant_id` column + global scope on `TenantCustomPageRecord`. All queries scoped. |
| XSS prevention | `strip_tags()` on body text at write time. Frontend renders with `white-space: pre-line` (no `dangerouslySetInnerHTML`). Title escaped by React's default JSX escaping. |
| Capability enforcement | `website.manage` capability required on all tenant admin endpoints (same as landing pages). |
| Module entitlement | Public resolver returns 404 for tenants without `module.website` (same as landing pages). |
| Slug validation | `ReservedSlug::isReserved()` + cross-table uniqueness check. |
| Quota enforcement | Combined count of `landing_pages + tenant_custom_pages` checked against `max_landing_pages`. |
| Enumeration prevention | Public API returns 404 for non-existent slugs (not "page not found" message). Same as landing pages. |

---

## 9. Quality Gates

Phase 13E is NOT complete until ALL of these pass:

### 9.1 Architecture Gates

- [ ] `TenantCustomPage` entity is pure PHP with zero framework imports
- [ ] Use cases follow established pattern: validation → entity → transaction → audit → event
- [ ] Events dispatched outside database transactions
- [ ] Audit logs written outside database transactions
- [ ] No Eloquent models used in Domain or Application layers
- [ ] `PageStatus` value object reused from landing page domain (not duplicated)

### 9.2 Security Gates

- [ ] `tenant_custom_pages` has `tenant_id` with global scope applied
- [ ] Public API returns 404 for invalid tenant slugs
- [ ] Public API returns 404 for tenants without `module.website`
- [ ] Body text stripped of HTML tags on write
- [ ] No `dangerouslySetInnerHTML` on body text
- [ ] Slug validated against reserved words

### 9.3 Functional Gates

- [ ] Tenant admin can create a custom page (title + body → slug auto-generated)
- [ ] Tenant admin can edit title and body (slug does NOT change)
- [ ] Tenant admin can publish/unpublish custom pages
- [ ] Tenant admin can delete custom pages
- [ ] Custom pages appear in the pages list alongside landing pages
- [ ] Published custom pages render at `/{slug}` on the public website
- [ ] Custom pages render within the correct template's design (header/footer/colors)
- [ ] Line breaks in body text are preserved on public render
- [ ] Slug auto-generation handles collisions (appends numeric suffix)
- [ ] Cross-table slug uniqueness enforced (custom page slug cannot match landing page slug)
- [ ] Quota counts both landing pages and custom pages
- [ ] `custom_page` link type works in navigation
- [ ] `CloneTemplateUseCase` quota check updated to count both tables

### 9.4 Audit Gates

- [ ] `custom_page.created`, `custom_page.published`, `custom_page.unpublished`, `custom_page.deleted` logged
- [ ] Audit entries include actor, timestamp, and entity ID

---

## 10. File Manifest

### 10.1 New Backend Files

| File | Purpose |
|---|---|
| `Domain/TenantAdminDashboard/CustomPage/Entities/TenantCustomPage.php` | Domain entity |
| `Domain/TenantAdminDashboard/CustomPage/Events/TenantCustomPageCreated.php` | Domain event |
| `Domain/TenantAdminDashboard/CustomPage/Events/TenantCustomPagePublished.php` | Domain event |
| `Domain/TenantAdminDashboard/CustomPage/Events/TenantCustomPageUnpublished.php` | Domain event |
| `Domain/TenantAdminDashboard/CustomPage/Events/TenantCustomPageDeleted.php` | Domain event |
| `Domain/TenantAdminDashboard/CustomPage/Exceptions/CustomPageNotFoundException.php` | Domain exception |
| `Domain/TenantAdminDashboard/CustomPage/Exceptions/DuplicateCustomPageSlugException.php` | Domain exception |
| `Domain/TenantAdminDashboard/CustomPage/Repositories/TenantCustomPageRepositoryInterface.php` | Repository contract |
| `Application/TenantAdminDashboard/CustomPage/Commands/CreateCustomPageCommand.php` | DTO |
| `Application/TenantAdminDashboard/CustomPage/Commands/UpdateCustomPageCommand.php` | DTO |
| `Application/TenantAdminDashboard/CustomPage/Commands/PublishCustomPageCommand.php` | DTO |
| `Application/TenantAdminDashboard/CustomPage/Commands/UnpublishCustomPageCommand.php` | DTO |
| `Application/TenantAdminDashboard/CustomPage/Commands/DeleteCustomPageCommand.php` | DTO |
| `Application/TenantAdminDashboard/CustomPage/UseCases/CreateCustomPageUseCase.php` | Use case |
| `Application/TenantAdminDashboard/CustomPage/UseCases/UpdateCustomPageUseCase.php` | Use case |
| `Application/TenantAdminDashboard/CustomPage/UseCases/PublishCustomPageUseCase.php` | Use case |
| `Application/TenantAdminDashboard/CustomPage/UseCases/UnpublishCustomPageUseCase.php` | Use case |
| `Application/TenantAdminDashboard/CustomPage/UseCases/DeleteCustomPageUseCase.php` | Use case |
| `Infrastructure/Persistence/TenantAdminDashboard/CustomPage/TenantCustomPageRecord.php` | Eloquent model |
| `Infrastructure/Persistence/TenantAdminDashboard/CustomPage/EloquentTenantCustomPageRepository.php` | Repository impl |
| `Http/Controllers/Api/TenantAdminDashboard/CustomPage/TenantCustomPageReadController.php` | Read controller |
| `Http/Controllers/Api/TenantAdminDashboard/CustomPage/TenantCustomPageWriteController.php` | Write controller |
| `Http/Requests/TenantAdminDashboard/CustomPage/CreateCustomPageRequest.php` | Form request |
| `Http/Requests/TenantAdminDashboard/CustomPage/UpdateCustomPageRequest.php` | Form request |
| `Http/Resources/TenantAdminDashboard/CustomPage/TenantCustomPageResource.php` | API resource |
| `database/migrations/xxxx_create_tenant_custom_pages_table.php` | Migration |

### 10.2 Modified Backend Files

| File | Change |
|---|---|
| `Domain/TenantAdminDashboard/LandingPage/ValueObjects/LinkType.php` | Add `CUSTOM_PAGE = 'custom_page'` |
| `Application/TenantAdminDashboard/LandingPage/UseCases/CloneTemplateUseCase.php` | Update quota check to count both tables |
| `Http/Controllers/PublicFacing/LandingPage/PublicPageController.php` (or equivalent) | Extend slug resolution to check `tenant_custom_pages` as fallback |
| `Providers/AppServiceProvider.php` | Add repository binding |
| `routes/tenant_dashboard/landing_page.php` | Add custom page routes |

### 10.3 New Frontend Files

| File | Purpose |
|---|---|
| `features/landing-page/templates/coaching-pro/CoachingProCustomPage.tsx` | Template-styled custom page |
| `features/landing-page/templates/online-academy/OnlineAcademyCustomPage.tsx` | Template-styled custom page |
| `features/landing-page/templates/prestige-institute/PrestigeInstituteCustomPage.tsx` | Template-styled custom page |
| `features/landing-page/templates/school-college/SchoolCollegeCustomPage.tsx` | Template-styled custom page |
| `features/landing-page/templates/skill-academy/SkillAcademyCustomPage.tsx` | Template-styled custom page |

### 10.4 Modified Frontend Files

| File | Change |
|---|---|
| `features/landing-page/components/public-renderer/page-type-registry.tsx` | Add `custom_page` page type |
| `features/landing-page/templates/coaching-pro/index.ts` | Export new component |
| `features/landing-page/templates/online-academy/index.ts` | Export new component |
| `features/landing-page/templates/prestige-institute/index.ts` | Export new component |
| `features/landing-page/templates/school-college/index.ts` | Export new component |
| `features/landing-page/templates/skill-academy/index.ts` | Export new component |
| `features/landing-page/utils/resolve-public-nav-href.ts` | Handle `custom_page` link type |
| `app/(website)/[tenantSlug]/[pageSlug]/page.tsx` | Check `page_type` discriminator, dispatch to custom page renderer |
| `services/tenant-landing-page-service.ts` | Add custom page CRUD methods |
| Tenant admin pages list page | Show custom pages alongside landing pages |

---

## 11. Constraints & Reminders

### Architecture Constraints

- **Slug is immutable after creation.** If the tenant changes the title, the slug stays the same. This prevents broken links and SEO damage.
- **Cross-table uniqueness is application-enforced.** There is no database foreign key or cross-table unique constraint. The use case must check both tables before insert.
- **Body text is always sanitized on write.** Never trust client input. `strip_tags()` on every write, even updates.
- **Events outside transactions.** Standard convention. Do not dispatch domain events inside `DB::transaction()`.
- **Audit logs outside transactions.** Standard convention. Do not write audit logs inside `DB::transaction()`.

### Docker Environment

- Container: Alpine Linux — use `sh` not `bash`
- Container name: `ubotz_backend`
- Database: `ubotz_mysql`

### What NOT to Do

- Do NOT add rich text or markdown support. Plain text with line breaks only.
- Do NOT add SEO metadata fields to the custom page entity. Auto-derive from title and body.
- Do NOT create a separate quota field. Reuse `max_landing_pages`.
- Do NOT add sections or any assembly mechanism. Custom pages are a single text blob.
- Do NOT modify the existing landing page entity or table schema.
- Do NOT soft-delete custom pages. Hard delete only.
- Do NOT allow slug editing after creation.

---

## 12. Definition of Done

Phase 13E is complete when:

1. The implementation plan has been reviewed and approved by the Principal Engineer.
2. All code is implemented per the approved plan.
3. All quality gates in §9 pass.
4. A Principal Engineer audit confirms zero critical or high findings.
5. All findings from audit are resolved.
6. A successful end-to-end demonstration: tenant creates custom page → publishes → page renders at `/{slug}` with correct template chrome → navigation links to it.
7. Cross-table slug uniqueness verified — cannot create custom page with same slug as existing landing page.
8. Quota enforcement verified — combined count blocks creation at limit.
9. The Phase 13E Completion Report is signed off.

---

*End of Document — UBOTZ 2.0 Phase 13E Developer Instructions — March 21, 2026*
