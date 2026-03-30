# UBOTZ 2.0 — Phase 17B Implementation Plan

## Tenant Institution Type Categorization

| Field | Value |
|-------|--------|
| **Document Type** | Implementation Plan |
| **Phase** | 17B |
| **Date** | March 19, 2026 |
| **Authority** | [Ubotz_2_phase_17b_developer_instructions.md](./Ubotz_2_phase_17b_developer_instructions.md) |
| **Manual** | [Ubotz 2 developer instruction manual .md](../Ubotz%202%20developer%20instruction%20manual%20.md) |
| **Prerequisites** | Phase 17A (Institution Type Management System) COMPLETE |
| **Audit** | Principal Engineer conditional approval — revisions applied (A-01, A-02, S-01, M-01, M-02, M-03). |

---

## 1. Executive Summary

Phase 17B wires **Institution Type** (from Phase 17A) into the **Tenant** aggregate. Every tenant is classified by an Institution Type at creation; the type is stored on the tenant record, shown on list/detail, and used for filtering. No new aggregates or bounded contexts.

**In scope:**
- Add `institution_type_id` to `tenants` (required after backfill); two-migration pattern.
- Extend Tenant entity, provisioning command/UseCase, and persistence to include `institutionTypeId`.
- Validate at create time: `institution_type_id` required and must reference an **active** Institution Type.
- Allow L1–L2 to change a tenant’s Institution Type (dedicated or existing update endpoint); audit `tenant.institution_type_changed`.
- Tenant list: filter by `institution_type_id`; Tenant resource: nested `institution_type` (id, name, slug, status); archived types shown with status so frontend can display “(Archived)”.
- Frontend: Institution Type dropdown on tenant create (required); column and filter on tenant list; display + L1–L2 edit on tenant detail.
- Backfill: **Interactive** — Migration 1 adds nullable column; deploy; Super Admin assigns types in UI; Migration 2 (run after backfill) makes column NOT NULL.

**Out of scope:**
- Tenant self-selection of Institution Type; subscription/analytics use of Institution Type; changes to Institution Type entity or template ↔ type relationship.

**Architecture (per developer manual):**
- Domain: Tenant entity gains `institutionTypeId: ?int` (nullable; required for new creates after backfill; null during backfill for existing tenants — see A-02 resolution).
- Application: UseCases depend on `InstitutionTypeRepositoryInterface` for active check; one UseCase per operation; audit **after** transaction commit (never inside transaction); no domain events for type change.
- HTTP: Controllers &lt; 20 lines; FormRequest syntax only (`required|integer|exists:institution_types,id`); business rule “must be active” enforced in UseCase.
- Migrations: central; no ENUM; index `idx_tenants_institution_type`; FK `ON DELETE RESTRICT`.

---

## 2. Gap Analysis

**Process requirement:** During implementation, the developer must populate this section with actual codebase and database inspection (e.g. `DESCRIBE tenants` output, existing Tenant entity/record paths, controller and route file locations). This ensures the plan reflects the real state and avoids incorrect assumptions.

| Asset | Location | Notes |
|-------|----------|--------|
| `tenants` table | Central | No `institution_type_id` — verify with DESCRIBE during implementation |
| Tenant entity | Domain/SuperAdminDashboard/Tenant (or equivalent) | No institutionTypeId — confirm namespace and file path |
| CreateTenantCommand | Application/.../Tenant/Commands/ | Add `institutionTypeId: int` |
| CreateTenantUseCase | Application/.../Tenant/UseCases/ | Add Institution Type validation (active) |
| TenantRecord (Eloquent) | Infrastructure/.../Tenant/ | Add `institution_type_id`, relation to InstitutionTypeRecord |
| Tenant write controller | Http/Controllers/.../Tenant/ | Pass `institution_type_id`; add PATCH for institution-type |
| ProvisionTenantRequest | Http/Requests/.../ | Add validation rule |
| TenantResource | Http/Resources/.../ | Add nested `institution_type` |
| Tenant list query/read model | Application or Infrastructure | Add filter by `institution_type_id` |
| Frontend tenant create/edit/list | Frontend | Add dropdown, column, filter, detail display |

**Decision — Update Institution Type endpoint:** Use a **dedicated PATCH** endpoint (`PATCH /api/platform/tenants/{id}/institution-type`). Gating: **CAP_MANAGE_INSTITUTION_TYPES** capability only (consistent with Phase 17A). No alternative middleware (e.g. admin.authority) — this is the single gating mechanism.

---

## 3. Implementation Phases

### Phase A — Database (Two-Migration Pattern)

| # | Task | Details |
|---|------|---------|
| A.1 | **Migration 1** | Add `institution_type_id` BIGINT UNSIGNED **NULLABLE** to `tenants` (after `status` or agreed column). Add FK to `institution_types(id)` ON DELETE RESTRICT. Add index `idx_tenants_institution_type`. Single migration file; no NOT NULL. |
| A.2 | **Migration 2** | New migration (run **manually** after backfill): assert `SELECT COUNT(*) FROM tenants WHERE institution_type_id IS NULL` = 0; if not, abort with clear message. Then `ALTER TABLE tenants MODIFY institution_type_id BIGINT UNSIGNED NOT NULL`. |

**Rationale (per 17B §7.4):** Prevents integrity violations during deploy; allows interactive backfill before enforcing NOT NULL.

---

### Phase B — Domain & Persistence

| # | Task | Details |
|---|------|---------|
| B.1 | **TenantEntity** | Add `institutionTypeId: ?int` (nullable). During backfill, existing tenants have `institution_type_id = NULL`; `toEntity()` must pass null — a non-nullable `int` would cause a runtime error. Use `?int` in the entity. Option: keep `?int` permanently (simpler, safer); or tighten to `int` in a follow-up after Migration 2. No embedded InstitutionType; ID only (per developer manual). |
| B.2 | **CreateTenantCommand** | Add `institutionTypeId: int` (required). Keep `declare(strict_types=1)`, `final class`, `readonly` (manual §3). |
| B.3 | **TenantRecord** | Add `institution_type_id` to fillable. Add `institutionType()` BelongsTo relationship to InstitutionTypeRecord. |
| B.4 | **EloquentTenantRepository** | In `toEntity()`: map `institution_type_id` to entity. In `fromEntity()` (or equivalent): map `getInstitutionTypeId()` to record. Ensure tenant is always loaded with tenant-scoping (manual §15). |

---

### Phase C — Application Layer

| # | Task | Details |
|---|------|---------|
| C.1 | **CreateTenantUseCase** | After existing validations, load Institution Type: `$institutionType = $this->institutionTypeRepository->findById($command->institutionTypeId)`. If null → throw domain exception (or return 422). If not `$institutionType->getStatus()->isActive()` → throw or return 422 with message "Institution Type must be active". Pass `institutionTypeId` into Tenant entity creation. Inject `InstitutionTypeRepositoryInterface` (cross-sub-domain within SuperAdminDashboard is allowed per 17B §8.4). |
| C.2 | **UpdateTenantInstitutionTypeUseCase** (new) | **(1)** Capture `previousInstitutionTypeId` from the loaded tenant before any mutation. **(2)** Validate new type exists and is active; load tenant; set `institutionTypeId`; persist **inside** `DB::transaction()`. **(3)** **After** the transaction commits, write audit log `tenant.institution_type_changed` with `oldValues: ['institution_type_id' => previousInstitutionTypeId]`, `newValues: ['institution_type_id' => newId]`, actor ID, timestamp. Follow the existing UseCase audit pattern used elsewhere in the codebase (audit never inside the transaction — see §7). No domain event (17B §4.3). |
| C.3 | **UpdateTenantInstitutionTypeCommand** (new) | `tenantId` (or tenant identifier), `institutionTypeId: int`, `actorId: ?int`. |
| C.4 | **Tenant list query / read model** | Add optional filter `institution_type_id` (query param). When present, add `WHERE tenants.institution_type_id = ?` (or `IS NULL` for “Unassigned” during backfill). |

---

### Phase D — HTTP Layer

| # | Task | Details |
|---|------|---------|
| D.1 | **ProvisionTenantRequest** | Add rule: `'institution_type_id' => 'required|integer|exists:institution_types,id'`. Syntax only; “must be active” enforced in UseCase (manual §13). |
| D.2 | **UpdateTenantInstitutionTypeRequest** (new, if dedicated endpoint) | `'institution_type_id' => 'required|integer|exists:institution_types,id'`. |
| D.3 | **TenantWriteController** | In `store`: pass `institution_type_id` from request to CreateTenantCommand. Add method `updateInstitutionType(UpdateTenantInstitutionTypeRequest $request, int $id)` (or equivalent): build command, call UpdateTenantInstitutionTypeUseCase, return TenantResource. Catch domain exceptions; map to 422/404. Each method &lt; 20 lines (manual §12). |
| D.4 | **TenantResource** | Add `institution_type` key: object with `id`, `name`, `slug`, `status` (eager-load or resolve from TenantRecord→institutionType). If tenant has no type (backfill period), return `institution_type: null`. |
| D.5 | **Routes** | Ensure POST tenant creation and tenant list accept/use `institution_type_id`. Add `PATCH /api/platform/tenants/{id}/institution-type` with capability middleware: **CAP_MANAGE_INSTITUTION_TYPES** (single gating mechanism; consistent with Phase 17A). Use existing platform prefix (e.g. `/api/platform/tenants`). |

---

### Phase E — Frontend

| # | Task | Details |
|---|------|---------|
| E.1 | **Tenant create form** | Add required **Institution Type** dropdown. Data: `GET /api/platform/institution-types?status=active&per_page=100`. Placeholder: "Select Institution Type". Submit payload includes `institution_type_id`. |
| E.2 | **Tenant list page** | Add column **Institution Type** (name; if archived, show "Name (Archived)" with muted style; if null, show "Unassigned" with warning badge during backfill). Add filter dropdown: "All", "Unassigned", then active types (and optionally "Archived" group). Send `institution_type_id` query param when filtering. |
| E.3 | **Tenant detail / edit** | Display assigned Institution Type. If archived, show "(Archived)". L1–L2 (CAP_MANAGE_INSTITUTION_TYPES): show edit control (dropdown) to change type; call PATCH `/api/platform/tenants/{id}/institution-type`. L3–L4: read-only. |
| E.4 | **Backfill-period UI** | When `institution_type` is null: list row shows "Unassigned" with orange/warning badge; detail page shows banner: "This tenant has no Institution Type assigned. Please assign one." Optional: "Unassigned" quick-filter or count in list header. |

---

### Phase F — Tests & Quality

| # | Task | Details |
|---|------|---------|
| F.1 | **CreateTenantUseCase / provisioning tests** | Update to include valid `institution_type_id` (existing active type). Add test: missing `institution_type_id` → 422. Add test: non-existent ID → 422. Add test: draft/archived type → 422 with message "Institution Type must be active". |
| F.2 | **UpdateTenantInstitutionTypeUseCase / endpoint tests** | L1–L2: change type → 200, resource includes new `institution_type`. L3–L4: 403. Invalid or inactive type → 422. |
| F.3 | **Tenant list filter** | Request with `?institution_type_id={id}` returns only tenants with that type; `institution_type_id=unassigned` (or empty) returns only nulls if supported. |
| F.4 | **Quality gates** | Per 17B §13: PHPStan Level 5; no `env()` in app; no Illuminate in Domain; controllers &lt; 20 lines per method; audit log for institution type change with old/new values; tenant creation requires type (422 if missing); only active types accepted (422 if draft/archived); list shows Institution Type correctly; L1–L2 can change type; filter works. |

---

## 4. Quality Gates (per Phase 17B §13)

### Architecture (BLOCKING)
- PHPStan Level 5: zero new errors
- All existing tests pass (zero regression)
- Domain layer: zero `Illuminate` imports
- Controllers &lt; 20 lines per method
- Zero `env()` in application code
- No new tech debt introduced

### Functional (BLOCKING)
- Tenant creation requires `institution_type_id` (422 if missing)
- Only `active` Institution Types can be assigned (422 if draft/archived)
- Tenant list shows Institution Type column correctly
- Tenant list filter by Institution Type works
- L1–L2 can change tenant Institution Type; L3–L4 receive 403
- `tenant.institution_type_changed` audit entry present with previous/new IDs

---

## 5. Migration Detail

### Migration 1: Add nullable `institution_type_id` to tenants

**File:** `database/migrations/central/YYYY_MM_DD_HHMMSS_add_institution_type_id_to_tenants_table.php`

- Add column: `institution_type_id` BIGINT UNSIGNED NULLABLE, after `status` (or as per existing conventions).
- Add FK: `fk_tenants_institution_type` → `institution_types(id)` ON DELETE RESTRICT.
- Add index: `idx_tenants_institution_type` on `institution_type_id`.

**Down:** Drop FK, drop index, drop column.

### Migration 2: Make `institution_type_id` NOT NULL

**File:** `database/migrations/central/YYYY_MM_DD_HHMMSS_make_tenants_institution_type_id_required.php`

- In `up()`: run `SELECT COUNT(*) FROM tenants WHERE institution_type_id IS NULL`. If count &gt; 0, throw (or exit with message) so migration aborts.
- Then: `Schema::table('tenants', fn (Blueprint $t) => $t->unsignedBigInteger('institution_type_id')->nullable(false)->change());` (or equivalent for MySQL).
- **Run this migration only after all tenants have been assigned a type** (manual step or backfill UI).

**Down:** Change column back to nullable (optional; only if rollback is required).

---

## 6. Backfill Strategy (Interactive — Recommended)

1. Deploy Migration 1 (nullable column).
2. Deploy application and frontend; tenant list shows "Unassigned" for existing tenants.
3. Super Admin uses tenant edit/detail to assign Institution Type per tenant.
4. When `SELECT COUNT(*) FROM tenants WHERE institution_type_id IS NULL` = 0, run Migration 2 to set NOT NULL.

**Alternative (seeded default):** If product decides, create an "Uncategorized" active Institution Type and backfill all NULLs to its ID in a data migration, then run Migration 2. Document choice in implementation.

---

## 7. Audit Logging

| Action | Audit Code | When |
|--------|------------|------|
| Tenant created (with type) | Existing `tenant.created` | No separate action for type; type is part of create. |
| Institution Type changed | `tenant.institution_type_changed` | When UpdateTenantInstitutionTypeUseCase runs. Include `previous_institution_type_id`, `new_institution_type_id`, actor ID, timestamp (standard audit fields). |

**Platform convention:** Audit logs must **never** be written inside database transactions (data loss on rollback). The UpdateTenantInstitutionTypeUseCase must follow: `DB::transaction(fn() => persist changes)` → **then** write the audit log **after** the transaction commits. Use the existing UseCase audit pattern used throughout the codebase.

---

## 8. Files Affected (Summary)

| Layer | File | Change |
|-------|------|--------|
| Domain | Tenant entity | Add `institutionTypeId: ?int`, getter, constructor/factory param (nullable for backfill compatibility) |
| Application | CreateTenantCommand | Add `institutionTypeId` |
| Application | CreateTenantUseCase | Inject InstitutionTypeRepositoryInterface; validate type exists and is active |
| Application | UpdateTenantInstitutionTypeCommand (new) | tenantId, institutionTypeId, actorId |
| Application | UpdateTenantInstitutionTypeUseCase (new) | Validate active type; load tenant; update; persist; audit |
| Infrastructure | TenantRecord | Add `institution_type_id`, `institutionType()` relation |
| Infrastructure | EloquentTenantRepository | toEntity/fromEntity include institution_type_id |
| Infrastructure | Tenant list query/read model | Filter by institution_type_id; ensure join or eager load for resource |
| HTTP | ProvisionTenantRequest | Add validation rule |
| HTTP | UpdateTenantInstitutionTypeRequest (new) | institution_type_id required, integer, exists |
| HTTP | TenantWriteController | store: pass institution_type_id; new method for PATCH institution-type |
| HTTP | TenantResource | Add nested `institution_type` |
| Routes | Platform tenant routes | Add PATCH tenant/{id}/institution-type (CAP_MANAGE_INSTITUTION_TYPES) |
| Frontend | Tenant create form | Institution Type dropdown (required) |
| Frontend | Tenant list | Column + filter |
| Frontend | Tenant detail/edit | Display type; L1–L2 edit control |
| Migrations | Central | Migration 1 (nullable + FK + index); Migration 2 (NOT NULL, run after backfill) |

---

## 9. Definition of Done (per Phase 17B §16)

- [ ] Implementation plan reviewed and approved.
- [ ] Migration 1 runs cleanly (column nullable, FK and index in place); Migration 2 run after backfill (NOT NULL enforced); all tenants backfilled or backfill UI demonstrated.
- [ ] Tenant creation requires `institution_type_id`; only active types accepted (422 otherwise).
- [ ] Tenant list shows Institution Type column and filter; Tenant resource includes `institution_type`.
- [ ] L1–L2 (CAP_MANAGE_INSTITUTION_TYPES) can change tenant Institution Type; L3–L4 cannot (403).
- [ ] `tenant.institution_type_changed` audit entry written **after** transaction commit, with previous/new IDs.
- [ ] Frontend: create dropdown (required), list column + filter, detail display + L1–L2 edit; backfill-period UI for unassigned tenants.
- [ ] All existing tenant provisioning tests updated; 8+ new/updated tests for 17B.
- [ ] PHPStan Level 5; no new manual violations; controllers &lt; 20 lines per method.
- [ ] Principal Engineer audit confirms zero critical or high findings; all findings resolved.
- [ ] End-to-end demo: Create Institution Type (17A) → Activate → Create Tenant with type → List filter → Change type → Verify audit log.
- [ ] Phase 17B Completion Report signed off.

---

*End of Implementation Plan — UBOTZ 2.0 Phase 17B — March 19, 2026*
