# UBOTZ 2.0 — Phase 17 Developer Instructions

## Institution Type Management System

| Field | Value |
|---|---|
| **Document Type** | Developer Instruction (Pre-Implementation Brief) |
| **Phase** | 17 |
| **Date** | March 19, 2026 |
| **Issued By** | Principal Engineer / Architecture Auditor |
| **Audience** | Implementation Developer |
| **Expected Deliverable** | Phase 17 Implementation Plan (same format as 10A–12A plans) |
| **Prerequisites** | Phase 13A (Landing Page Template System) COMPLETE |

> **This phase replaces the developer-seeded `landing_page_template_categories` table with a fully managed `institution_types` entity. Institution Types are a platform-level taxonomy describing what kind of educational institution a tenant represents. For now, the only consumer is the Landing Page Template system. The entity is designed for future reuse (tenant classification, plan segmentation, analytics) without requiring schema changes.**

---

## 1. Mission Statement

Phase 17 introduces **Institution Type Management** — a Super Admin–managed platform entity that classifies the kind of educational institution each landing page template targets. This replaces the Phase 13A approach where categories were seeded via migration with a hardcoded `code` column.

**What this phase includes:**
- Institution Type CRUD with name, auto-generated slug, and lifecycle management
- Institution Type lifecycle: `draft → active → archived`
- Dedicated Super Admin management page for Institution Types
- Migration from `landing_page_template_categories` (code-based, migration-seeded) to `institution_types` (managed entity with full lifecycle)
- Update `landing_page_templates.category_code` FK to reference the new `institution_types` table
- Filter dropdown on the Landing Page Templates list page by Institution Type
- Uniqueness enforcement on Institution Type name (case-insensitive)

**What this phase does NOT include:**
- Assigning Institution Types to tenants (future scope)
- Using Institution Types for subscription plan segmentation (future scope)
- Using Institution Types in analytics/reporting (future scope)
- Tenant-facing Institution Type selection during onboarding (future scope)
- Icon, image, or description fields on Institution Type (name only for now)

---

## 2. Business Context

### 2.1 Current State

Phase 13A created a `landing_page_template_categories` table with `code` and `name` columns, seeded via migration. This was a developer-managed, static lookup table. Adding a new category required a code deployment (new migration). The current Templates list page shows "N/A" in the Category column for all templates, indicating categories were either not assigned or the seeded data doesn't match what was expected.

### 2.2 What Changes

After Phase 17:
1. Super Admins (L1–L2) can create, edit, activate, and archive Institution Types from a dedicated management page.
2. Each Institution Type has a unique name and auto-generated slug.
3. Institution Types follow a lifecycle: `draft → active → archived`.
4. When creating or editing a Landing Page Template, Super Admins select an Institution Type from a dropdown showing only `active` types.
5. The Landing Page Templates list page gains a filter dropdown to filter templates by Institution Type.
6. Existing `landing_page_template_categories` data is migrated to the new `institution_types` table.
7. The `landing_page_templates.category_code` column is replaced with `institution_type_id`.

### 2.3 Actor Model

| Actor | Context | What They Do |
|---|---|---|
| Super Admin (L1–L2) | SuperAdminDashboard | Create, edit, activate, archive Institution Types |
| Super Admin (L1–L4) | SuperAdminDashboard | Select Institution Type when creating/editing templates; filter templates by type |

### 2.4 Naming Decision: Why "Institution Type" and Not "Category"

The tenant table already uses `category` for a different purpose (departmental classification within the tenant). To avoid naming collision and semantic ambiguity across the codebase, this entity is named **Institution Type**. It describes the nature of the educational institution (coaching institute, EdTech company, language school, university, etc.) at the platform level.

| Term | Scope | Example |
|---|---|---|
| `category` (tenant table) | Within a tenant — departmental classification | "Science Department", "Arts Department" |
| `institution_type` (this phase) | Platform-level — what kind of institution the tenant is | "Coaching Institute", "EdTech", "University" |

This distinction is permanent. No future phase should introduce ambiguity between these two concepts.

---

## 3. Business Rules (NON-NEGOTIABLE)

| Rule ID | Rule | Enforcement |
|---|---|---|
| BR-01 | Institution Type `name` must be unique across the platform (case-insensitive). | UseCase uniqueness check via repository query + UNIQUE DB constraint on normalized name |
| BR-02 | Institution Type `slug` is auto-generated from `name` at creation time using kebab-case transformation. Slug is immutable after creation. | Domain Entity enforces immutability; slug generation in UseCase |
| BR-03 | Institution Type `slug` must be unique. | UNIQUE DB constraint + UseCase collision check |
| BR-04 | Institution Type lifecycle follows: `draft → active → archived`. Only `active` types appear in template assignment dropdowns. | `InstitutionTypeStatus` value object with transition guards |
| BR-05 | A `draft` Institution Type can be freely edited (name changes regenerate slug only if type has never been activated). | Domain Entity status guards |
| BR-06 | An `active` Institution Type can have its name edited, but the slug remains immutable. | Domain Entity enforces slug immutability after first activation |
| BR-07 | An `archived` Institution Type cannot be edited. It can be unarchived back to `active`. | Domain Entity status guards; `archived → active` is a valid transition |
| BR-08 | Archiving an Institution Type with assigned templates is permitted. A confirmation warning must show the count of affected templates. Archived types stop appearing in assignment dropdowns. Existing templates retain the FK reference. | UseCase checks template count; frontend shows confirmation dialog |
| BR-09 | Templates assigned to an archived Institution Type display the type name with an "(Archived)" visual indicator in the UI. No data change occurs on the template. | Frontend rendering logic only |
| BR-10 | Deleting an Institution Type is NOT permitted. Archival is the only removal mechanism. | No delete endpoint. No soft-delete column. |
| BR-11 | Only Super Admins at L1–L2 (Founder, Strategic Manager) can manage Institution Types. L3–L4 can view and use them (template assignment, filtering) but cannot create/edit/archive. | Capability-based authorization: `CAP_MANAGE_INSTITUTION_TYPES` for L1–L2; read access via existing template management capabilities |

### 3.1 Status Transition Matrix

| From | To | Allowed | Notes |
|---|---|---|---|
| `draft` | `active` | Yes | Activates the type, makes it available for template assignment |
| `draft` | `archived` | No | Must be activated before archiving (prevents accidental dead entries) |
| `active` | `archived` | Yes | Soft-retires the type; existing template references preserved |
| `active` | `draft` | No | Once activated, cannot go back to draft |
| `archived` | `active` | Yes | Unarchive — restores availability in dropdowns |
| `archived` | `draft` | No | Cannot revert to draft |

---

## 4. Domain Model

### 4.1 Bounded Context Placement

| Entity | Bounded Context | Rationale |
|---|---|---|
| `InstitutionType` (aggregate root) | SuperAdminDashboard | Platform-level asset managed by L1–L2 |

This is a standalone aggregate. It has no child entities. It lives in the SuperAdminDashboard bounded context alongside the existing Landing Page Template entities.

### 4.2 Aggregate Definition

```
InstitutionType (aggregate root)
├── id: int
├── name: string (unique, max 100 chars)
├── slug: string (unique, immutable after first activation, kebab-case)
├── status: InstitutionTypeStatus (draft | active | archived)
├── created_by: int (FK → admins.id)
├── activated_at: timestamp (nullable — set on first activation)
├── created_at: timestamp
└── updated_at: timestamp
```

### 4.3 Value Objects

| Value Object | Values | Location |
|---|---|---|
| `InstitutionTypeStatus` | `draft`, `active`, `archived` | `Domain/SuperAdminDashboard/InstitutionType/ValueObjects/` |

The value object must enforce the transition matrix from §3.1. Invalid transitions throw `InvalidInstitutionTypeStatusTransitionException`.

### 4.4 Domain Events

| Event | Trigger | Dispatched After |
|---|---|---|
| `InstitutionTypeCreated` | New Institution Type created | Transaction commit |
| `InstitutionTypeActivated` | Status changed to `active` | Transaction commit |
| `InstitutionTypeArchived` | Status changed to `archived` | Transaction commit |
| `InstitutionTypeUnarchived` | Status changed from `archived` to `active` | Transaction commit |
| `InstitutionTypeUpdated` | Name edited | Transaction commit |

All events are past-tense facts, dispatched outside database transactions, per established convention.

### 4.5 Domain Exceptions

| Exception | When Thrown |
|---|---|
| `InvalidInstitutionTypeStatusTransitionException` | Forbidden status transition attempted |
| `InstitutionTypeNameAlreadyExistsException` | Duplicate name (case-insensitive) |
| `InstitutionTypeSlugAlreadyExistsException` | Duplicate slug (edge case with manual override or collision) |
| `InstitutionTypeImmutableSlugException` | Attempt to change slug after first activation |
| `InstitutionTypeNotEditableException` | Attempt to edit an archived Institution Type |

### 4.6 Repository Interface

```
InstitutionTypeRepositoryInterface
├── findById(int $id): ?InstitutionTypeEntity
├── findBySlug(string $slug): ?InstitutionTypeEntity
├── existsByName(string $name, ?int $excludeId = null): bool
├── existsBySlug(string $slug, ?int $excludeId = null): bool
├── save(InstitutionTypeEntity $entity): InstitutionTypeEntity
├── list(ListInstitutionTypesQuery $query): PaginatedResult
└── countTemplatesByInstitutionTypeId(int $id): int
```

Note: `countTemplatesByInstitutionTypeId` is a cross-aggregate read. It queries the `landing_page_templates` table. This is acceptable as a **read-only query** in the repository — it does NOT mutate template data. The alternative (a query service) is acceptable but overkill for a single count query. The implementation plan must document this decision.

---

## 5. Database Schema

### 5.1 New Table: `institution_types`

| Column | Type | Notes |
|---|---|---|
| `id` | BIGINT UNSIGNED PK | Auto-increment |
| `name` | VARCHAR(100) | Display name. Unique (case-insensitive). |
| `slug` | VARCHAR(120) UNIQUE | Kebab-case, auto-generated from name. Immutable after first activation. |
| `status` | VARCHAR(20) DEFAULT 'draft' | `draft`, `active`, `archived` |
| `created_by` | BIGINT UNSIGNED | FK → `admins.id` |
| `activated_at` | TIMESTAMP NULLABLE | Set on first transition to `active` |
| `created_at` | TIMESTAMP | |
| `updated_at` | TIMESTAMP | |

Indexes: `slug` (UNIQUE), `status`, `name` (UNIQUE — case-insensitive collation or functional index).

**Case-insensitive uniqueness:** Use MySQL's default `utf8mb4_unicode_ci` collation on the `name` column. This makes `UNIQUE(name)` case-insensitive by default. No application-level lowercasing needed for the constraint, but the UseCase should still normalize for the `existsByName` check to be explicit.

### 5.2 Migration: `landing_page_templates` FK Change

**Current state (Phase 13A):**
```
landing_page_templates.category_code VARCHAR(50) → FK landing_page_template_categories.code
```

**Target state (Phase 17):**
```
landing_page_templates.institution_type_id BIGINT UNSIGNED NULLABLE → FK institution_types.id
```

**Migration strategy:**
1. Create `institution_types` table.
2. Migrate data from `landing_page_template_categories` into `institution_types` (map `code` → `slug`, `name` → `name`, set `status` = `active`, set `activated_at` = `NOW()`).
3. Add `institution_type_id` column to `landing_page_templates` (NULLABLE initially).
4. Populate `institution_type_id` by joining on the migrated slug/code mapping.
5. Drop `category_code` column from `landing_page_templates`.
6. Drop `landing_page_template_categories` table.
7. If no data exists in `landing_page_template_categories`, steps 2 and 4 are no-ops.

**CRITICAL:** The `institution_type_id` FK is NULLABLE. A template without an Institution Type assignment is valid. This is important because:
- Existing templates may not have had a category assigned.
- The field is set when creating/editing a template — it is not a required field at template creation (but SHOULD be required when publishing — flag this in the implementation plan).

**Decision on publish requirement:** When a template transitions from `draft → published`, it MUST have an `institution_type_id` assigned. Draft templates may exist without one. This ensures all published (tenant-visible) templates are categorized.

### 5.3 No Changes to Tenant Tables

`tenant_landing_pages` has a `source_template_id` (informational reference to the template it was cloned from). No changes needed. The Institution Type classification lives on the template, not on the tenant page clone.

---

## 6. API Design

### 6.1 Institution Type Endpoints (Super Admin)

All endpoints require `admin` auth guard + session middleware.

| Method | Endpoint | Capability | Description |
|---|---|---|---|
| `GET` | `/api/v1/admin/institution-types` | Read: any L1–L4; Write: L1–L2 | List all Institution Types (filterable by status) |
| `POST` | `/api/v1/admin/institution-types` | `CAP_MANAGE_INSTITUTION_TYPES` (L1–L2) | Create Institution Type |
| `GET` | `/api/v1/admin/institution-types/{id}` | Any L1–L4 | View single Institution Type |
| `PUT` | `/api/v1/admin/institution-types/{id}` | `CAP_MANAGE_INSTITUTION_TYPES` (L1–L2) | Update Institution Type (name only if allowed by status) |
| `PATCH` | `/api/v1/admin/institution-types/{id}/activate` | `CAP_MANAGE_INSTITUTION_TYPES` | Transition: draft → active |
| `PATCH` | `/api/v1/admin/institution-types/{id}/archive` | `CAP_MANAGE_INSTITUTION_TYPES` | Transition: active → archived |
| `PATCH` | `/api/v1/admin/institution-types/{id}/unarchive` | `CAP_MANAGE_INSTITUTION_TYPES` | Transition: archived → active |

### 6.2 Request/Response Shapes

**POST /api/v1/admin/institution-types**
```json
// Request
{
  "name": "Coaching Institute"
}

// Response (201)
{
  "success": true,
  "data": {
    "id": 1,
    "name": "Coaching Institute",
    "slug": "coaching-institute",
    "status": "draft",
    "created_by": 1,
    "activated_at": null,
    "template_count": 0,
    "created_at": "2026-03-19T10:00:00Z",
    "updated_at": "2026-03-19T10:00:00Z"
  }
}
```

**GET /api/v1/admin/institution-types** (list)
```json
// Query params: ?status=active&page=1&per_page=20
// Response
{
  "success": true,
  "data": [
    {
      "id": 1,
      "name": "Coaching Institute",
      "slug": "coaching-institute",
      "status": "active",
      "template_count": 5,
      "activated_at": "2026-03-19T10:05:00Z",
      "created_at": "2026-03-19T10:00:00Z"
    }
  ],
  "meta": { "page": 1, "per_page": 20, "total": 1 }
}
```

**PATCH /api/v1/admin/institution-types/{id}/archive**
```json
// Response includes template count warning
{
  "success": true,
  "data": {
    "id": 1,
    "name": "Coaching Institute",
    "slug": "coaching-institute",
    "status": "archived",
    "template_count": 5,
    "activated_at": "2026-03-19T10:05:00Z"
  },
  "meta": {
    "warning": "5 templates are assigned to this institution type. They will retain their assignment but the type will no longer be available for new templates."
  }
}
```

### 6.3 Modifications to Existing Template Endpoints

The existing Landing Page Template create/update endpoints must be modified:

**Template Create/Update Request:** Add `institution_type_id` field (nullable integer).

**Template List Endpoint:** Add `?institution_type_id={id}` query parameter for filtering.

**Template Resource Response:** Replace `category_code` with:
```json
{
  "institution_type": {
    "id": 1,
    "name": "Coaching Institute",
    "slug": "coaching-institute",
    "status": "active"
  }
}
```
If the template has no Institution Type assigned, this field is `null`.

### 6.4 Dropdown Endpoint

For the template form's Institution Type selector dropdown:

**GET /api/v1/admin/institution-types?status=active&per_page=100&fields=id,name**

This reuses the list endpoint with a status filter. No separate "dropdown" endpoint needed. The frontend requests only `active` types for the dropdown.

---

## 7. Application Layer

### 7.1 UseCases

| UseCase | Description | Key Logic |
|---|---|---|
| `CreateInstitutionTypeUseCase` | Creates a new Institution Type in `draft` status | Validate name uniqueness → generate slug → check slug uniqueness → persist → audit log → dispatch event |
| `UpdateInstitutionTypeUseCase` | Updates name (and slug if still in draft and never activated) | Validate status allows editing → validate name uniqueness → conditionally regenerate slug → persist → audit log → dispatch event |
| `ActivateInstitutionTypeUseCase` | Transitions from `draft` to `active` | Validate current status → transition → set `activated_at` if first activation → persist → audit log → dispatch event |
| `ArchiveInstitutionTypeUseCase` | Transitions from `active` to `archived` | Validate current status → count assigned templates (for warning metadata) → transition → persist → audit log → dispatch event |
| `UnarchiveInstitutionTypeUseCase` | Transitions from `archived` to `active` | Validate current status → transition → persist → audit log → dispatch event |
| `ListInstitutionTypesQuery` | Lists Institution Types with optional status filter | Standard paginated query with status filter |
| `GetInstitutionTypeQuery` | Gets a single Institution Type by ID | Standard single-entity read |

### 7.2 Slug Generation Rules

1. Convert name to kebab-case: `"Coaching Institute"` → `"coaching-institute"`
2. Strip non-alphanumeric characters (except hyphens): `"EdTech & Online"` → `"edtech-online"`
3. Collapse consecutive hyphens: `"a--b"` → `"a-b"`
4. Trim leading/trailing hyphens
5. If generated slug collides with an existing slug, append a numeric suffix: `"coaching-institute-2"`
6. Slug is immutable after the Institution Type is first activated (BR-06)

Slug generation logic should be a **pure function** in the Domain layer (e.g., a static method on a `SlugGenerator` value object or a domain service), not in the UseCase.

### 7.3 Audit Log Actions

| Action | Actor | Context |
|---|---|---|
| `institution_type.created` | Super Admin | `admin_audit_logs` |
| `institution_type.updated` | Super Admin | `admin_audit_logs` |
| `institution_type.activated` | Super Admin | `admin_audit_logs` |
| `institution_type.archived` | Super Admin | `admin_audit_logs` |
| `institution_type.unarchived` | Super Admin | `admin_audit_logs` |

---

## 8. HTTP Layer

### 8.1 Controllers

| Controller | Methods | Notes |
|---|---|---|
| `InstitutionTypeReadController` | `index`, `show` | Read operations, accessible to L1–L4 |
| `InstitutionTypeWriteController` | `store`, `update`, `activate`, `archive`, `unarchive` | Write operations, require `CAP_MANAGE_INSTITUTION_TYPES` |

Controllers must be thin (<20 lines per method), delegating entirely to UseCases.

### 8.2 FormRequests

| Request | Validation Rules |
|---|---|
| `CreateInstitutionTypeRequest` | `name`: required, string, max:100 |
| `UpdateInstitutionTypeRequest` | `name`: required, string, max:100 |

**No business logic in FormRequests.** Name uniqueness is checked in the UseCase, not here. FormRequests validate syntax only.

### 8.3 Resources

| Resource | Fields |
|---|---|
| `InstitutionTypeResource` | `id`, `name`, `slug`, `status`, `created_by`, `activated_at`, `template_count`, `created_at`, `updated_at` |

`template_count` is a computed field from the repository's `countTemplatesByInstitutionTypeId` method or an eager-loaded `withCount` on the Eloquent model.

---

## 9. Frontend Requirements

### 9.1 New Pages

| Page | Route | Description |
|---|---|---|
| Institution Types List | `/super-admin-dashboard/institution-types` | Data table with status badges, template count, and action buttons |
| Create Institution Type | Modal or inline form on list page | Name input only, simple creation |
| Edit Institution Type | Modal or inline form on list page | Name edit only (if status allows) |

### 9.2 Institution Types List Page

**Table columns:**
- Name
- Slug
- Status (badge: Draft = yellow, Active = green, Archived = gray)
- Templates (count of assigned templates)
- Actions

**Action buttons per row (conditional on status and user capability):**

| Status | Available Actions (L1–L2 only) |
|---|---|
| `draft` | Edit, Activate |
| `active` | Edit, Archive |
| `archived` | Unarchive |

L3–L4 users see the list page (read-only) but no action buttons.

**Page-level actions:**
- "Create Institution Type" button (L1–L2 only)
- Status filter dropdown: All, Draft, Active, Archived

### 9.3 Archive Confirmation Dialog

When archiving an Institution Type that has assigned templates, show a confirmation dialog:

> **Archive "{name}"?**
>
> {n} template(s) are currently assigned to this institution type. They will retain their assignment, but this type will no longer be available for new template assignments.
>
> [Cancel] [Archive]

If `template_count` is 0, show a simpler confirmation:

> **Archive "{name}"?**
>
> This institution type will no longer be available for new template assignments.
>
> [Cancel] [Archive]

### 9.4 Modifications to Existing Template Pages

**Template Create/Edit Form:**
- Add "Institution Type" dropdown field (select from `active` types only)
- Field is optional during draft, but required validation should trigger if attempting to publish without one

**Template List Page:**
- Replace the current "N/A" in the Category column with the assigned Institution Type name (or "—" if unassigned)
- For archived Institution Types, display: `"Coaching Institute (Archived)"` with muted/gray styling
- Add a filter dropdown: "All Institution Types" + list of active types + "Archived Types" + "Unassigned"

### 9.5 Navigation

Add "Institution Types" as a menu item in the Super Admin sidebar, placed logically near "Landing Page Templates" (under a "Website" or "Content" section group if one exists, or adjacent to the Templates link).

---

## 10. Capability & Authorization

### 10.1 New Capability

| Code | Name | Assigned To | Description |
|---|---|---|---|
| `CAP_MANAGE_INSTITUTION_TYPES` | Manage Institution Types | L1 (Founder), L2 (Strategic Manager) | Create, update, activate, archive, unarchive Institution Types |

This capability must be added via migration to the `capabilities` table and assigned to the appropriate authority levels.

### 10.2 Read Access

Reading Institution Types (list, show) does NOT require a special capability. Any authenticated Super Admin (L1–L4) can read them. This is gated by the existing admin auth middleware, not by a specific capability.

---

## 11. Migration from Phase 13A Categories

### 11.1 Data Migration Plan

The existing `landing_page_template_categories` table (if populated) must be migrated into the new `institution_types` table. This is a one-time, irreversible migration.

| Source (`landing_page_template_categories`) | Target (`institution_types`) |
|---|---|
| `code` | `slug` (kebab-case, should already be compatible) |
| `name` | `name` |
| `sort_order` | Dropped (no `sort_order` on new table) |
| — | `status` = `active` |
| — | `created_by` = ID of the first L1 admin (or a system sentinel value) |
| — | `activated_at` = migration timestamp |

### 11.2 Template FK Migration

After data migration:
1. Add `institution_type_id` column to `landing_page_templates` (NULLABLE, UNSIGNED BIGINT)
2. `UPDATE landing_page_templates t JOIN institution_types it ON it.slug = t.category_code SET t.institution_type_id = it.id`
3. Drop `category_code` column
4. Drop `landing_page_template_categories` table
5. Add FK constraint: `landing_page_templates.institution_type_id` → `institution_types.id` (SET NULL on delete — though deletion is not exposed, this is a safety net)

### 11.3 Rollback Considerations

If migration fails midway:
- `institution_types` table can be dropped
- `category_code` column is not dropped until step 3, so data is preserved until that point
- The migration should be structured as a single migration file with both up() and down() methods

The implementation plan must detail the exact migration steps and verify them against the actual database state.

---

## 12. Backend DDD File Structure

```
Domain/SuperAdminDashboard/InstitutionType/
├── Entities/
│   └── InstitutionTypeEntity.php
├── ValueObjects/
│   └── InstitutionTypeStatus.php
├── Events/
│   ├── InstitutionTypeCreated.php
│   ├── InstitutionTypeActivated.php
│   ├── InstitutionTypeArchived.php
│   ├── InstitutionTypeUnarchived.php
│   └── InstitutionTypeUpdated.php
├── Exceptions/
│   ├── InvalidInstitutionTypeStatusTransitionException.php
│   ├── InstitutionTypeNameAlreadyExistsException.php
│   ├── InstitutionTypeSlugAlreadyExistsException.php
│   ├── InstitutionTypeImmutableSlugException.php
│   └── InstitutionTypeNotEditableException.php
└── Repositories/
    └── InstitutionTypeRepositoryInterface.php

Application/SuperAdminDashboard/InstitutionType/
├── Commands/
│   ├── CreateInstitutionTypeCommand.php
│   └── UpdateInstitutionTypeCommand.php
├── Queries/
│   ├── ListInstitutionTypesQuery.php
│   └── GetInstitutionTypeQuery.php
└── UseCases/
    ├── CreateInstitutionTypeUseCase.php
    ├── UpdateInstitutionTypeUseCase.php
    ├── ActivateInstitutionTypeUseCase.php
    ├── ArchiveInstitutionTypeUseCase.php
    └── UnarchiveInstitutionTypeUseCase.php

Infrastructure/Persistence/SuperAdminDashboard/InstitutionType/
├── InstitutionTypeRecord.php
└── EloquentInstitutionTypeRepository.php

Http/Controllers/Api/SuperAdminDashboard/InstitutionType/
├── InstitutionTypeReadController.php
└── InstitutionTypeWriteController.php

Http/Requests/SuperAdminDashboard/InstitutionType/
├── CreateInstitutionTypeRequest.php
└── UpdateInstitutionTypeRequest.php

Http/Resources/SuperAdminDashboard/InstitutionType/
└── InstitutionTypeResource.php
```

---

## 13. Quality Gates

### 13.1 Architecture Gates (BLOCKING)

- [ ] PHPStan Level 5: zero new errors
- [ ] All existing tests pass (zero regression)
- [ ] Domain layer has zero `Illuminate` imports
- [ ] Controllers < 20 lines per method
- [ ] UseCases testable without database (mocked repositories)
- [ ] `env()` check: `grep -rn 'env(' app/ routes/ database/` returns 0 results
- [ ] No new tech debt introduced

### 13.2 Functional Gates (BLOCKING)

- [ ] Institution Type CRUD works end-to-end
- [ ] Status transitions enforce the transition matrix (§3.1)
- [ ] Name uniqueness enforced (case-insensitive)
- [ ] Slug auto-generated correctly from name
- [ ] Slug immutability enforced after first activation
- [ ] Archived types do not appear in template assignment dropdown
- [ ] Templates with archived types display "(Archived)" indicator
- [ ] Template list page filter by Institution Type works
- [ ] Template publish blocked if `institution_type_id` is null
- [ ] Migration from `landing_page_template_categories` completes without data loss

### 13.3 Security Gates (BLOCKING)

- [ ] `CAP_MANAGE_INSTITUTION_TYPES` correctly gates write endpoints
- [ ] L3–L4 users can read but not write Institution Types
- [ ] L5+ users cannot access Institution Type endpoints
- [ ] All write operations audit-logged to `admin_audit_logs`

### 13.4 Test Requirements

- [ ] Unit tests for: `InstitutionTypeEntity` invariants, `InstitutionTypeStatus` transitions, slug generation
- [ ] Feature tests for: every API endpoint (happy path + error path), capability enforcement (unauthorized users get 403), name uniqueness (409), slug immutability enforcement, archive with templates (success + warning), migration correctness
- [ ] Minimum 15–20 new tests expected

---

## 14. Constraints & Reminders

### Architecture Constraints

- **InstitutionType is a standalone aggregate.** It has no child entities. Do not overcomplicate the domain model.
- **No delete endpoint.** Archival is the only removal mechanism. This prevents orphaned FK references.
- **Slug generation is Domain logic**, not infrastructure. Keep it in a pure function.
- **Cross-aggregate read for `template_count` is acceptable** as a read-only query. It must NOT mutate template data.
- **The `landing_page_template_categories` table must be fully removed** after migration. No zombie tables.
- **Institution Type is a platform-level entity** — no `tenant_id` column. It lives entirely in the SuperAdminDashboard context.

### Docker Environment

- Container: Alpine Linux — use `sh` not `bash`
- Container name: `ubotz_backend`
- Database: `ubotz_mysql`

### What NOT to Do

- Do NOT add `tenant_id` to the `institution_types` table. This is a platform-level entity.
- Do NOT add description, icon, or image fields. Name only for now.
- Do NOT create a `sort_order` column. The list is sorted alphabetically by name.
- Do NOT allow hard deletion. No `DELETE` endpoint. No soft-delete `deleted_at` column.
- Do NOT put slug generation in the Controller or FormRequest. It belongs in the Domain layer.
- Do NOT make `institution_type_id` required on `landing_page_templates` at the database level. It must be NULLABLE. Publish-time validation enforces assignment.
- Do NOT skip the data migration from `landing_page_template_categories`. Even if the table is empty, the migration must handle both cases cleanly.
- Do NOT create separate API endpoints for "dropdown" data. Reuse the list endpoint with status filter.

---

## 15. Modifications to Phase 13A Entities

### 15.1 LandingPageTemplate Entity

The `LandingPageTemplate` entity's `category_code: string` property must be replaced with `institutionTypeId: ?int`. This is a breaking change to the entity and must be handled carefully:

1. Update `LandingPageTemplateEntity` to replace `categoryCode` with `institutionTypeId`
2. Update `toEntity()` / `fromEntity()` mappers in the repository
3. Update the `LandingPageTemplateResource` to include the nested `institution_type` object
4. Update the template create/update UseCases to accept and validate `institution_type_id`
5. Add publish-time validation: `institution_type_id` must not be null when transitioning to `published`

### 15.2 Impact Assessment

| Affected Component | Change Required |
|---|---|
| `LandingPageTemplateEntity` | Replace `categoryCode` with `institutionTypeId` |
| `CreateLandingPageTemplateCommand` | Replace `categoryCode` with `institutionTypeId` |
| `UpdateLandingPageTemplateCommand` | Replace `categoryCode` with `institutionTypeId` |
| `CreateLandingPageTemplateUseCase` | Validate `institutionTypeId` exists and is `active` (or null) |
| `PublishLandingPageTemplateUseCase` | Add validation: `institutionTypeId` must not be null |
| `LandingPageTemplateResource` | Replace `category_code` with nested `institution_type` object |
| `LandingPageTemplateRecord` | Update column name in model |
| `EloquentLandingPageTemplateRepository` | Update `toEntity`/`fromEntity` mappers |
| Template list query | Add `institution_type_id` filter support |
| Template create/edit FormRequests | Replace `category_code` with `institution_type_id` (nullable integer) |

---

## 16. Definition of Done

Phase 17 is complete when:

1. The implementation plan has been reviewed and approved by the Principal Engineer.
2. All code is implemented per the approved plan.
3. All quality gates in §13 pass.
4. A Principal Engineer audit confirms zero critical or high findings.
5. All findings from audit are resolved.
6. A successful end-to-end demonstration has been performed: Create Institution Type → Activate → Assign to Template → Filter templates by type → Archive type → Verify template display.
7. Data migration from `landing_page_template_categories` verified.
8. `landing_page_template_categories` table removed.
9. Frontend Institution Types management page functional.
10. Template list page filter by Institution Type functional.
11. The Phase 17 Completion Report is signed off.

---

*End of Document — UBOTZ 2.0 Phase 17 Developer Instructions — March 19, 2026*
