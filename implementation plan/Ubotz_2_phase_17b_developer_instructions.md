# UBOTZ 2.0 — Phase 17B Developer Instructions

## Tenant Institution Type Categorization

| Field | Value |
|---|---|
| **Document Type** | Developer Instruction (Pre-Implementation Brief) |
| **Phase** | 17B |
| **Date** | March 19, 2026 |
| **Issued By** | Principal Engineer / Architecture Auditor |
| **Audience** | Implementation Developer |
| **Expected Deliverable** | Phase 17B Implementation Plan (same format as 10A–12A plans) |
| **Prerequisites** | Phase 17A (Institution Type Management System) COMPLETE |

> **This phase adds Institution Type assignment to tenants. Every tenant must be classified by Institution Type at creation time. This is a cross-aggregate wiring change — the InstitutionType aggregate (built in 17A) is referenced by the Tenant aggregate via a foreign key. No new aggregates, no new bounded contexts, no new tables.**

---

## 1. Mission Statement

Phase 17B extends the Institution Type system (built in Phase 17A) to classify tenants. When a Super Admin creates a new tenant, they must select an Institution Type. This classification is stored on the tenant record and is visible in the tenant list, tenant detail pages, and available as a filter.

**What this phase includes:**
- Add `institution_type_id` column to `tenants` table (required, FK → `institution_types.id`)
- Update `TenantEntity` to include `institutionTypeId` property
- Update tenant provisioning flow (command, UseCase, request, resource)
- Institution Type dropdown on tenant create/edit forms
- Institution Type column and filter on the Super Admin tenant list page
- Institution Type display on tenant detail page
- Backfill strategy for existing tenants (if any exist without a type)

**What this phase does NOT include:**
- Tenant self-selection of Institution Type (tenants do not see or manage this field)
- Using Institution Type for subscription plan segmentation (future scope)
- Using Institution Type for analytics/reporting dashboards (future scope)
- Any changes to the Institution Type entity itself (fully managed in Phase 17A)
- Any changes to the Landing Page Template ↔ Institution Type relationship (Phase 17A scope)

---

## 2. Business Context

### 2.1 Current State

After Phase 17A, Institution Types exist as a platform-level managed entity used only by the Landing Page Template system. Tenants have no institutional classification — the Super Admin has no structured way to know if a tenant is a coaching institute, a university, or an EdTech company. This limits the platform's ability to serve tenants contextually.

### 2.2 What Changes

After Phase 17B:
1. Every new tenant must be assigned an Institution Type during provisioning.
2. Existing tenants (created before Phase 17B) must be assigned a type via a backfill mechanism.
3. Super Admins can see and filter tenants by Institution Type on the tenant list page.
4. The tenant detail page displays the assigned Institution Type.
5. Super Admins can change a tenant's Institution Type at any time.

### 2.3 Actor Model

| Actor | Context | What They Do |
|---|---|---|
| Super Admin (L1–L4) | SuperAdminDashboard | Assign Institution Type during tenant creation; view type on tenant list/detail; filter tenants by type |
| Super Admin (L1–L2) | SuperAdminDashboard | Change a tenant's Institution Type after creation |

### 2.4 Who Owns This Field?

Institution Type assignment on a tenant is a **platform-level classification** made by Super Admins. Tenant Admins do NOT see, set, or manage their own Institution Type. This is not exposed in the Tenant Admin Dashboard.

---

## 3. Business Rules (NON-NEGOTIABLE)

| Rule ID | Rule | Enforcement |
|---|---|---|
| BR-01 | Every new tenant must have an `institution_type_id` assigned at creation time. It is a required field in the provisioning request. | `ProvisionTenantRequest` validation: `required, integer, exists:institution_types,id` + UseCase validates the referenced type is `active` |
| BR-02 | Only `active` Institution Types can be assigned to tenants. Assigning a `draft` or `archived` type is rejected. | UseCase validation before persistence |
| BR-03 | A tenant's Institution Type can be changed at any time by L1–L2 Super Admins. The change is audit-logged. | Update UseCase with capability check + audit log |
| BR-04 | If a tenant's assigned Institution Type is later archived (via Phase 17A), the tenant retains the reference. The UI shows the type name with an "(Archived)" indicator. No automatic reassignment occurs. | FK is preserved; frontend rendering handles the visual indicator |
| BR-05 | Changing a tenant's Institution Type does NOT affect any landing pages cloned from templates of the old type. Cloned pages are snapshots — fully independent. | No cascading logic. This is already enforced by the snapshot model (Phase 13A). |
| BR-06 | Tenant list supports filtering by Institution Type. | Query parameter on list endpoint; filter dropdown on frontend |
| BR-07 | All existing tenants created before Phase 17B must be backfilled with an Institution Type before the `institution_type_id` column is made NOT NULL. | Data migration with backfill strategy (see §7) |

---

## 4. Domain Model Changes

### 4.1 TenantEntity Modification

The existing `TenantEntity` (in `Domain/SuperAdminDashboard/Tenant/Entities/`) gains one new property:

```
TenantEntity (existing aggregate root)
├── ... (all existing properties unchanged)
└── institutionTypeId: int          ← NEW (required, non-nullable)
```

This is a simple scalar FK reference — not an embedded value object, not a nested entity. The `TenantEntity` does NOT hold the full `InstitutionTypeEntity`. It holds only the ID. The full type data is loaded via the Resource layer (eager load or separate query) for API responses.

### 4.2 Cross-Aggregate Reference Pattern

`TenantEntity` references `InstitutionType` by ID only. This follows the established DDD pattern in Ubotz: aggregates reference other aggregates by identity, never by embedding the full object. The read layer (Resource/Query) is responsible for hydrating the full object for API responses.

### 4.3 No New Domain Events

Changing a tenant's Institution Type is a metadata update, not a business-critical state transition. It is captured via the standard `admin_audit_logs` entry. No new domain event is required.

**Rationale:** Domain events signal facts that other parts of the system need to react to. No system component currently needs to react to a tenant's Institution Type change. If a future phase (e.g., analytics, plan segmentation) needs to react, a domain event can be added at that time. Over-eventing is an anti-pattern.

### 4.4 No New Exceptions

Existing exceptions cover all failure modes:
- Invalid Institution Type ID → standard 422 validation error
- Institution Type not `active` → UseCase returns appropriate error response
- Unauthorized user → existing capability middleware returns 403

---

## 5. Database Schema Changes

### 5.1 Migration: Add `institution_type_id` to `tenants` Table

**Step 1 — Add nullable column:**
```sql
ALTER TABLE tenants
ADD COLUMN institution_type_id BIGINT UNSIGNED NULL
AFTER status;

ALTER TABLE tenants
ADD CONSTRAINT fk_tenants_institution_type
FOREIGN KEY (institution_type_id) REFERENCES institution_types(id)
ON DELETE RESTRICT;
```

`ON DELETE RESTRICT` ensures an Institution Type cannot be deleted if tenants reference it. Since Phase 17A already prohibits deletion (archive-only), this is a defense-in-depth safety net.

**Step 2 — Backfill existing tenants** (see §7)

**Step 3 — Make column NOT NULL:**
```sql
ALTER TABLE tenants
MODIFY COLUMN institution_type_id BIGINT UNSIGNED NOT NULL;
```

This three-step approach ensures zero downtime and no data integrity violations during deployment.

### 5.2 New Index

```sql
CREATE INDEX idx_tenants_institution_type ON tenants(institution_type_id);
```

Supports the filter query on the tenant list page.

### 5.3 No Other Table Changes

No changes to `tenant_landing_pages`, `landing_page_templates`, or any other table. This phase touches only the `tenants` table.

---

## 6. API Changes

### 6.1 Tenant Provisioning Endpoint (Modified)

**POST /api/v1/admin/tenants**

Request body adds one required field:

```json
{
  "name": "ABC Coaching Center",
  "slug": "abc-coaching",
  "institution_type_id": 3,
  "...": "existing fields unchanged"
}
```

Validation: `institution_type_id` — required, integer, exists in `institution_types` table, referenced type must have `status = active`.

### 6.2 Tenant Update Endpoint (Modified or New)

Depending on the current implementation, either modify the existing tenant update endpoint or create a dedicated endpoint:

**PATCH /api/v1/admin/tenants/{id}/institution-type**

```json
// Request
{
  "institution_type_id": 5
}

// Response (200)
{
  "success": true,
  "data": {
    "id": 1,
    "name": "ABC Coaching Center",
    "slug": "abc-coaching",
    "institution_type": {
      "id": 5,
      "name": "Language Institute",
      "slug": "language-institute",
      "status": "active"
    },
    "...": "rest of tenant data"
  }
}
```

Capability required: `CAP_MANAGE_INSTITUTION_TYPES` (L1–L2) or a new capability `CAP_UPDATE_TENANT_INSTITUTION_TYPE`. **Implementation plan must decide** — recommendation is to reuse `CAP_MANAGE_INSTITUTION_TYPES` since it's the same domain concept.

**Alternative:** If the existing `PUT /api/v1/admin/tenants/{id}` already handles general tenant updates, `institution_type_id` can be added as a field there. The implementation plan must document which approach is taken and why.

### 6.3 Tenant List Endpoint (Modified)

**GET /api/v1/admin/tenants**

New query parameter: `?institution_type_id={id}`

Filters tenants by assigned Institution Type. Combinable with existing filters (status, search, etc.).

### 6.4 Tenant Resource Response (Modified)

All tenant API responses that currently return tenant data must include the Institution Type:

```json
{
  "id": 1,
  "name": "ABC Coaching Center",
  "slug": "abc-coaching",
  "status": "active",
  "institution_type": {
    "id": 3,
    "name": "Coaching Institute",
    "slug": "coaching-institute",
    "status": "active"
  },
  "...": "rest of tenant fields"
}
```

If the assigned Institution Type has been archived, the response still includes it:

```json
{
  "institution_type": {
    "id": 7,
    "name": "Corporate Training",
    "slug": "corporate-training",
    "status": "archived"
  }
}
```

The frontend uses the `status` field to render the "(Archived)" indicator.

---

## 7. Backfill Strategy for Existing Tenants

### 7.1 Problem

The `institution_type_id` column will be NOT NULL, but existing tenants were created without this field. These tenants must be assigned a type before the column constraint is applied.

### 7.2 Approach: Interactive Backfill via Admin UI

**Do NOT auto-assign a default type.** Guessing is worse than asking. The correct approach:

1. **Migration adds the column as NULLABLE** (Step 1 in §5.1).
2. **Deploy the code** — the tenant list page now shows an Institution Type column. Existing tenants show "Unassigned" with a visual warning indicator.
3. **Super Admin manually assigns types** to existing tenants via the edit/update flow.
4. **A follow-up migration** (run manually after all tenants are assigned) makes the column NOT NULL.

**If the number of existing tenants is small** (< 50, which is likely at this stage), this is the cleanest approach. It respects data accuracy over automation convenience.

### 7.3 Alternative: Seeded Default with Override

If manual assignment is impractical:

1. Create a special Institution Type: `"Uncategorized"` (status = `active`).
2. Backfill all existing tenants with `institution_type_id = uncategorized.id`.
3. Make column NOT NULL.
4. Super Admin reclassifies tenants over time.
5. Once no tenants reference "Uncategorized", it can be archived.

**The implementation plan must document which approach is used.** If the platform currently has fewer than ~20 tenants, the interactive approach (§7.2) is strongly recommended.

### 7.4 Migration Sequence

The migration must be structured as **two separate migration files**:

**Migration 1 (runs during deploy):**
- Add `institution_type_id` NULLABLE column
- Add FK constraint
- Add index

**Migration 2 (runs manually after backfill):**
- Verify no NULL values exist: `SELECT COUNT(*) FROM tenants WHERE institution_type_id IS NULL`
- If count > 0, abort with error message
- If count = 0, `ALTER COLUMN institution_type_id SET NOT NULL`

This two-migration pattern prevents data integrity violations during deployment.

---

## 8. Application Layer Changes

### 8.1 Modified Commands

| Command | Change |
|---|---|
| `CreateTenantCommand` | Add `institutionTypeId: int` property (required) |

### 8.2 Modified UseCases

| UseCase | Change |
|---|---|
| `CreateTenantUseCase` | After existing validations, verify `institutionTypeId` references an `active` Institution Type via `InstitutionTypeRepositoryInterface::findById()`. If not found → 422. If not `active` → 422 with message "Institution Type must be active". Pass to entity constructor. |

### 8.3 New UseCase (if dedicated endpoint approach)

| UseCase | Description |
|---|---|
| `UpdateTenantInstitutionTypeUseCase` | Validates new `institutionTypeId` is active → loads tenant → updates property → persists → audit log. No domain event. |

### 8.4 Cross-Context Repository Access

`CreateTenantUseCase` lives in `Application/SuperAdminDashboard/Tenant/`. It needs to call `InstitutionTypeRepositoryInterface::findById()` which lives in the `InstitutionType` context.

**This is acceptable.** Both are within the `SuperAdminDashboard` bounded context. The repository interface is in the Domain layer. The UseCase depends on the interface, not the implementation. No architectural violation.

If they were in different bounded contexts, a query service interface would be required. But since both Tenant and InstitutionType are sub-domains of SuperAdminDashboard, direct repository access across sub-domains within the same bounded context is the established Ubotz pattern.

---

## 9. HTTP Layer Changes

### 9.1 Modified FormRequests

| Request | Change |
|---|---|
| `ProvisionTenantRequest` | Add rule: `'institution_type_id' => 'required|integer|exists:institution_types,id'` |

**Note:** The `exists` rule checks database existence at the validation layer. The UseCase additionally checks that the type is `active`. This two-layer validation is intentional: FormRequest catches syntax errors (non-existent ID), UseCase enforces business rules (must be active).

### 9.2 Modified Resources

| Resource | Change |
|---|---|
| `TenantResource` | Add `institution_type` key with nested object (eager-loaded from relationship or separate query). Include `id`, `name`, `slug`, `status`. |

### 9.3 Modified Controllers

| Controller | Change |
|---|---|
| `TenantWriteController` | Pass `institution_type_id` from request to command in the `store` method. Add `updateInstitutionType` method if using dedicated endpoint approach. |

All controller methods must remain < 20 lines.

---

## 10. Frontend Requirements

### 10.1 Tenant Create Form

Add an **Institution Type** dropdown field:
- Data source: `GET /api/v1/admin/institution-types?status=active`
- Field is **required** — form cannot be submitted without selection
- Placed logically near the tenant name/slug fields (top of form, as it's a primary classification)
- Dropdown shows: Institution Type name
- Default: no selection (placeholder: "Select Institution Type")

### 10.2 Tenant Edit / Detail View

- Display the assigned Institution Type name
- If the type is archived, show: `"Corporate Training (Archived)"` with muted styling
- L1–L2 users see an edit control (dropdown or inline edit) to change the type
- L3–L4 users see the type as read-only text

### 10.3 Tenant List Page

**New column:** "Institution Type" — displays the type name. Archived types show with "(Archived)" muted text.

**New filter:** Dropdown filter above or alongside existing filters:
- Options: "All Institution Types" (default) + list of active types + "Archived Types" group + "Unassigned" (only during backfill period)
- Sends `?institution_type_id={id}` query parameter to the list endpoint

### 10.4 Backfill Period UI

During the period between Migration 1 (column added as NULLABLE) and Migration 2 (column made NOT NULL):

- Tenants without an Institution Type show **"Unassigned"** in the list with an orange warning badge
- The tenant detail page shows a prominent banner: "This tenant has no Institution Type assigned. Please assign one."
- Optionally: a dedicated "Unassigned Tenants" quick-filter or count badge on the tenant list page header

This UI pressure ensures Super Admins complete the backfill promptly.

---

## 11. Audit Logging

| Action | Actor | Context | When |
|---|---|---|---|
| `tenant.institution_type_assigned` | Super Admin | `admin_audit_logs` | Institution Type set during tenant creation (logged as part of `tenant.created` — no separate entry needed) |
| `tenant.institution_type_changed` | Super Admin | `admin_audit_logs` | Institution Type changed after creation |

The `tenant.institution_type_changed` audit entry must include:
- `previous_institution_type_id`
- `new_institution_type_id`
- Actor ID and timestamp (standard audit fields)

---

## 12. Files Affected (Estimated)

### Backend — Modified Files

| File | Change |
|---|---|
| `Domain/.../Tenant/Entities/TenantEntity.php` | Add `institutionTypeId` property, constructor param, getter |
| `Application/.../Tenant/Commands/CreateTenantCommand.php` | Add `institutionTypeId` property |
| `Application/.../Tenant/UseCases/CreateTenantUseCase.php` | Add Institution Type validation (active check) |
| `Infrastructure/.../Tenant/TenantRecord.php` | Add `institution_type_id` to fillable, relationship method |
| `Infrastructure/.../Tenant/EloquentTenantRepository.php` | Update `toEntity()`/`fromEntity()` mappers |
| `Http/.../Tenant/TenantWriteController.php` | Pass `institution_type_id` to command |
| `Http/Requests/.../ProvisionTenantRequest.php` | Add validation rule |
| `Http/Resources/.../TenantResource.php` | Add nested `institution_type` object |

### Backend — New Files (only if dedicated endpoint approach)

| File | Purpose |
|---|---|
| `Application/.../Tenant/Commands/UpdateTenantInstitutionTypeCommand.php` | Command DTO |
| `Application/.../Tenant/UseCases/UpdateTenantInstitutionTypeUseCase.php` | Orchestration |
| `Http/Requests/.../UpdateTenantInstitutionTypeRequest.php` | Validation |

### Backend — Migrations

| File | Purpose |
|---|---|
| `xxxx_add_institution_type_id_to_tenants_table.php` | Add NULLABLE column + FK + index |
| `xxxx_make_institution_type_id_required_on_tenants.php` | NOT NULL constraint (run manually after backfill) |

### Frontend — Modified Files

| File | Change |
|---|---|
| Tenant create form component | Add Institution Type dropdown (required) |
| Tenant edit/detail component | Display Institution Type + edit control for L1–L2 |
| Tenant list page | Add Institution Type column + filter dropdown |
| Tenant API service/hooks | Add `institution_type_id` to create/update payloads; add filter param to list query |

**Estimated total: ~12–15 files touched, ~2–3 new files.**

---

## 13. Quality Gates

### 13.1 Architecture Gates (BLOCKING)

- [ ] PHPStan Level 5: zero new errors
- [ ] All existing tests pass (zero regression)
- [ ] Domain layer has zero `Illuminate` imports
- [ ] Controllers < 20 lines per method
- [ ] `env()` check: zero results
- [ ] No new tech debt introduced

### 13.2 Functional Gates (BLOCKING)

- [ ] Tenant creation requires `institution_type_id` (422 if missing)
- [ ] Only `active` Institution Types can be assigned (422 if draft/archived)
- [ ] Tenant list shows Institution Type column correctly
- [ ] Tenant list filter by Institution Type works
- [ ] Tenant detail page displays Institution Type
- [ ] Institution Type change works for L1–L2 users
- [ ] Institution Type change blocked for L3–L4 users (403)
- [ ] Archived Institution Types display "(Archived)" indicator on tenant records
- [ ] Migration 1 runs cleanly (NULLABLE column added)
- [ ] Migration 2 runs cleanly after backfill (NOT NULL enforced)

### 13.3 Security Gates (BLOCKING)

- [ ] Institution Type change audit-logged with old/new values
- [ ] L3–L4 cannot change a tenant's Institution Type
- [ ] L5+ cannot access tenant endpoints (existing gate — verify no regression)
- [ ] Invalid `institution_type_id` values return 422, not 500

### 13.4 Test Requirements

- [ ] Update existing `CreateTenantUseCase` tests to include `institutionTypeId`
- [ ] New test: tenant creation fails without `institution_type_id` (422)
- [ ] New test: tenant creation fails with non-active Institution Type (422)
- [ ] New test: tenant creation fails with non-existent Institution Type (422)
- [ ] New test: Institution Type change succeeds for L1–L2
- [ ] New test: Institution Type change fails for L3–L4 (403)
- [ ] New test: tenant list filter by `institution_type_id` returns correct results
- [ ] Minimum 8–12 new tests expected

---

## 14. Constraints & Reminders

### Architecture Constraints

- **TenantEntity references InstitutionType by ID only.** Do not embed the full InstitutionType entity inside TenantEntity. The Resource layer handles hydration.
- **No new domain events.** Institution Type assignment is metadata, not a state transition. Audit log is sufficient.
- **Cross-sub-domain repository access within SuperAdminDashboard is acceptable.** No query service needed.
- **Two-migration pattern is mandatory.** Do not make the column NOT NULL in the first migration.
- **Tenant Admins never see this field.** It is not exposed in the Tenant Admin Dashboard.

### Docker Environment

- Container: Alpine Linux — use `sh` not `bash`
- Container name: `ubotz_backend`
- Database: `ubotz_mysql`

### What NOT to Do

- Do NOT embed the full `InstitutionTypeEntity` inside `TenantEntity`. Reference by ID only.
- Do NOT auto-assign a default Institution Type during migration. Use the interactive backfill approach (§7.2) unless the implementation plan justifies the alternative.
- Do NOT create a new bounded context for this. Tenant and InstitutionType both live in SuperAdminDashboard.
- Do NOT expose Institution Type in the Tenant Admin Dashboard. This is a platform-level classification.
- Do NOT create a domain event for Institution Type changes on tenants. Audit log is sufficient.
- Do NOT make `institution_type_id` NOT NULL in the first migration. The two-migration pattern (§7.4) is mandatory.
- Do NOT skip updating existing tests. The `CreateTenantUseCase` tests must be updated to include the new required field or they will break.

---

## 15. Dependency on Phase 17A

Phase 17B has a hard dependency on Phase 17A. Specifically:

| Phase 17A Deliverable | Phase 17B Dependency |
|---|---|
| `institution_types` table | FK target for `tenants.institution_type_id` |
| `InstitutionTypeRepositoryInterface` | Used by `CreateTenantUseCase` to validate active status |
| `InstitutionTypeEntity` | Used for status check in UseCase |
| `GET /api/v1/admin/institution-types?status=active` | Data source for frontend dropdown on tenant form |
| `InstitutionTypeResource` | Nested in `TenantResource` response |

Phase 17B cannot begin implementation until Phase 17A has passed its quality gate and completion report.

---

## 16. Definition of Done

Phase 17B is complete when:

1. The implementation plan has been reviewed and approved by the Principal Engineer.
2. All code is implemented per the approved plan.
3. All quality gates in §13 pass.
4. A Principal Engineer audit confirms zero critical or high findings.
5. All findings from audit are resolved.
6. A successful end-to-end demonstration: Create Institution Type (17A) → Activate → Create Tenant with type assigned → Verify list filter → Change type → Verify audit log.
7. Migration 1 runs cleanly in production.
8. All existing tenants backfilled (or backfill UI demonstrated working).
9. Migration 2 runs cleanly after backfill (NOT NULL enforced).
10. No regression in existing tenant provisioning tests.
11. The Phase 17B Completion Report is signed off.

---

*End of Document — UBOTZ 2.0 Phase 17B Developer Instructions — March 19, 2026*
