# UBOTZ 2.0 — Institution Management: Full Technical Specification

| Field | Value |
|---|---|
| **Document Type** | Principal Engineer — Technical Specification |
| **Feature** | Institution Management |
| **Date** | 2026-03-27 |
| **Issued By** | Principal Engineer / Architecture Auditor |
| **Scope** | Full-stack: DB schema, domain layer, application UseCases, HTTP layer, policies, events |
| **Status** | CURRENT — Reflects implemented codebase state |

---

## 1. System Architecture Overview

```
HTTP Layer          → InstitutionTypeReadController
                    → InstitutionTypeWriteController   (L4: create, update, submit, request-archive, unarchive)
                    → InstitutionTypeApprovalController (L2: approve, reject, approve-archive, reject-archive)
Application Layer   → CreateInstitutionTypeUseCase
                    → UpdateInstitutionTypeUseCase
                    → SubmitInstitutionTypeForApprovalUseCase
                    → ApproveInstitutionTypeUseCase
                    → RejectInstitutionTypeUseCase
                    → RequestInstitutionTypeArchiveUseCase
                    → ApproveInstitutionTypeArchiveUseCase
                    → RejectInstitutionTypeArchiveUseCase
                    → ArchiveInstitutionTypeUseCase
                    → UnarchiveInstitutionTypeUseCase
                    → ActivateInstitutionTypeUseCase
                    → UpdateTenantInstitutionTypeUseCase
Domain Layer        → InstitutionType (entity)
                    → InstitutionTypeStatus (value object)
                    → InstitutionTypeRepositoryInterface
Infrastructure      → InstitutionTypeRecord (Eloquent)
                    → EloquentInstitutionTypeRepository
Policies            → InstitutionTypePolicy (manage / approve)
Events              → InstitutionTypeCreated, InstitutionTypeActivated
                    → InstitutionTypeArchived, InstitutionTypeUnarchived, InstitutionTypeUpdated
```

---

## 2. Database Schema (Central DB)

### Table: `institution_types`

| Column | Type | Notes |
|---|---|---|
| `id` | BIGINT (PK) | |
| `name` | VARCHAR(255), Unique | Display name (e.g., "Coaching Institute"). Required. |
| `slug` | VARCHAR(255), Unique | URL-safe identifier (e.g., `coaching-institute`). Required. Immutable after first activation. |
| `status` | VARCHAR(30) | `draft`, `pending_approval`, `active`, `rejected`, `pending_archive`, `archived`. |
| `created_by` | BIGINT (FK → `admins.id`) | Which admin created this type. |
| `activated_at` | TIMESTAMP, Nullable | Set when first activated. Also signals slug immutability. |
| `submitted_by` | BIGINT (FK → `admins.id`), Nullable | Who submitted for approval. |
| `submitted_at` | TIMESTAMP, Nullable | When submitted. |
| `approved_by` | BIGINT (FK → `admins.id`), Nullable | Who approved (last). `ON DELETE SET NULL`. |
| `approved_at` | TIMESTAMP, Nullable | When approved (last). |
| `rejected_by` | BIGINT (FK → `admins.id`), Nullable | Who rejected (last). `ON DELETE SET NULL`. |
| `rejected_at` | TIMESTAMP, Nullable | When rejected (last). |
| `rejection_reason` | TEXT, Nullable | Mandatory on rejection. Cleared on next approval. |
| `created_at` | TIMESTAMP | |
| `updated_at` | TIMESTAMP | |

**Applied migrations (in order):**
1. `2026_03_19_140000_create_institution_types_table.php` — Base table with name, slug, status, created_by, activated_at.
2. `2026_03_19_140001_migrate_categories_to_institution_types.php` — Data migration from a legacy `categories` table.
3. `2026_03_19_140002_add_unique_name_to_institution_types.php` — Added unique index on `name`.
4. `2026_03_19_150000_add_institution_type_id_to_tenants_table.php` — Added `institution_type_id` FK to `tenants`.
5. `2026_03_19_150001_make_tenants_institution_type_id_required.php` — Made `institution_type_id` NOT NULL.
6. `2026_03_19_160000_add_approval_fields_to_institution_types_table.php` — Added 7 approval/rejection columns.

---

### Tenant FK: `tenants.institution_type_id`

| Column | Type | Notes |
|---|---|---|
| `institution_type_id` | BIGINT (FK → `institution_types.id`), NOT NULL | Every tenant must have an institution type. |

---

## 3. Domain Layer

### 3.1 `InstitutionType` Entity

**File:** `App\Domain\SuperAdminDashboard\InstitutionType\Entities\InstitutionType`

**Construction:** Private constructor — use `create()` or `reconstitute()` static factories only.

**Key domain methods:**

| Method | From Status | To Status | Side Effects |
|---|---|---|---|
| `create(name, slug, createdBy)` | — | `DRAFT` | Sets `createdAt`, `updatedAt`. |
| `submitForApproval(adminId)` | `DRAFT` / `REJECTED` | `PENDING_APPROVAL` | Sets `submittedBy`, `submittedAt`. Clears `rejectedBy`, `rejectedAt`, `rejectionReason`. |
| `approve(adminId)` | `PENDING_APPROVAL` | `ACTIVE` | Sets `approvedBy`, `approvedAt`. Sets `activatedAt` if null. Clears rejection fields. |
| `reject(adminId, reason)` | `PENDING_APPROVAL` | `REJECTED` | Sets `rejectedBy`, `rejectedAt`, `rejectionReason`. |
| `requestArchive(adminId)` | `ACTIVE` | `PENDING_ARCHIVE` | Updates `updatedAt`. |
| `approveArchive(adminId)` | `PENDING_ARCHIVE` | `ARCHIVED` | Sets `approvedBy`, `approvedAt`. Clears rejection fields. |
| `rejectArchive(adminId, reason)` | `PENDING_ARCHIVE` | `ACTIVE` | Sets `rejectedBy`, `rejectedAt`, `rejectionReason`. |
| `activate()` | `DRAFT` | `ACTIVE` | Direct activation (L2 shortcut — no approval flow). Sets `activatedAt` if null. |
| `archive()` | `ACTIVE` | `ARCHIVED` | Direct archive (L2 shortcut). |
| `unarchive()` | `ARCHIVED` | `ACTIVE` | Restores directly to active. |
| `rename(name, newSlug, slugImmutable)` | `DRAFT` / `REJECTED` only | unchanged | Throws `InstitutionTypeNotEditableException` if active/pending. Throws `InstitutionTypeImmutableSlugException` if `slugImmutable=true` and slug differs. |

**`isSlugImmutable()`:** Returns `true` if `activatedAt !== null`. Used by `UpdateInstitutionTypeUseCase` to pass the immutability flag to `rename()`.

---

### 3.2 `InstitutionTypeStatus` (Value Object)

**File:** `App\Domain\SuperAdminDashboard\InstitutionType\ValueObjects\InstitutionTypeStatus`

**Valid values:** `draft`, `pending_approval`, `active`, `rejected`, `pending_archive`, `archived`.

**Transition matrix (`canTransitionTo()`):**

| From | Allowed → To |
|---|---|
| `DRAFT` | `ACTIVE`, `PENDING_APPROVAL` |
| `PENDING_APPROVAL` | `ACTIVE`, `REJECTED` |
| `REJECTED` | `PENDING_APPROVAL` |
| `ACTIVE` | `ARCHIVED`, `PENDING_ARCHIVE` |
| `PENDING_ARCHIVE` | `ARCHIVED`, `ACTIVE` |
| `ARCHIVED` | `ACTIVE` |

`transitionTo(target)` enforces the matrix and throws `InvalidInstitutionTypeStatusTransitionException` for disallowed transitions.

**Helper predicates:** `isDraft()`, `isPendingApproval()`, `isActive()`, `isRejected()`, `isPendingArchive()`, `isArchived()`.

---

## 4. Application Layer — UseCases

### 4.1 `CreateInstitutionTypeUseCase`

```
1. Validate name uniqueness → InstitutionTypeNameAlreadyExistsException
2. Validate slug uniqueness → InstitutionTypeSlugAlreadyExistsException
3. InstitutionType::create(name, slug, adminId)
4. repository->save()
5. dispatch(InstitutionTypeCreated)
6. auditLogger->log('institution_type.created', ...)
```

### 4.2 `SubmitInstitutionTypeForApprovalUseCase`

```
1. repository->findById(id) → InstitutionTypeNotFoundException
2. institutionType->submitForApproval(adminId)
3. repository->save()
4. auditLogger->log('institution_type.submitted', ...)
```

### 4.3 `ApproveInstitutionTypeUseCase`

```
1. repository->findById(id) → InstitutionTypeNotFoundException
2. institutionType->approve(adminId)
3. repository->save()
4. dispatch(InstitutionTypeActivated)
5. auditLogger->log('institution_type.approved', ...)
```

### 4.4 `RejectInstitutionTypeUseCase`

```
1. repository->findById(id) → InstitutionTypeNotFoundException
2. institutionType->reject(adminId, reason)   [reason required — enforced at Form Request]
3. repository->save()
4. auditLogger->log('institution_type.rejected', metadata: ['reason' => reason])
```

### 4.5 `RequestInstitutionTypeArchiveUseCase`

```
1. repository->findById(id) → InstitutionTypeNotFoundException
2. institutionType->requestArchive(adminId)
3. repository->save()
4. auditLogger->log('institution_type.archive_requested', ...)
```

### 4.6 `ApproveInstitutionTypeArchiveUseCase`

```
1. repository->findById(id) → InstitutionTypeNotFoundException
2. institutionType->approveArchive(adminId)
3. repository->save()
4. dispatch(InstitutionTypeArchived)
5. auditLogger->log('institution_type.archive_approved', ...)
```

### 4.7 `RejectInstitutionTypeArchiveUseCase`

```
1. repository->findById(id) → InstitutionTypeNotFoundException
2. institutionType->rejectArchive(adminId, reason)   [reason required]
3. repository->save()
4. auditLogger->log('institution_type.archive_rejected', metadata: ['reason' => reason])
```

### 4.8 `UpdateInstitutionTypeUseCase`

```
1. repository->findById(id) → InstitutionTypeNotFoundException
2. Validate name uniqueness (excluding current id)
3. Validate slug uniqueness (excluding current id)
4. institutionType->rename(name, slug, slugImmutable: isSlugImmutable())
   └─ throws InstitutionTypeNotEditableException if wrong status
   └─ throws InstitutionTypeImmutableSlugException if slug changed after activation
5. repository->save()
6. dispatch(InstitutionTypeUpdated)
7. auditLogger->log('institution_type.updated', ...)
```

---

## 5. HTTP Layer — Routes & Authorization

**Write Controller (L4 — manage permission):**

| Method | URI | UseCase | Auth |
|---|---|---|---|
| POST | `/platform/institution-types` | `CreateInstitutionTypeUseCase` | L4 (manage) |
| PUT | `/platform/institution-types/{id}` | `UpdateInstitutionTypeUseCase` | L4 (manage) |
| POST | `/platform/institution-types/{id}/submit` | `SubmitInstitutionTypeForApprovalUseCase` | L4 (manage) |
| POST | `/platform/institution-types/{id}/request-archive` | `RequestInstitutionTypeArchiveUseCase` | L4 (manage) |
| POST | `/platform/institution-types/{id}/unarchive` | `UnarchiveInstitutionTypeUseCase` | L4 (manage) |

**Approval Controller (L2 — approve permission):**

| Method | URI | UseCase | Auth |
|---|---|---|---|
| POST | `/platform/institution-types/{id}/approve` | `ApproveInstitutionTypeUseCase` | L2 (approve) |
| POST | `/platform/institution-types/{id}/reject` | `RejectInstitutionTypeUseCase` | L2 (approve) |
| POST | `/platform/institution-types/{id}/approve-archive` | `ApproveInstitutionTypeArchiveUseCase` | L2 (approve) |
| POST | `/platform/institution-types/{id}/reject-archive` | `RejectInstitutionTypeArchiveUseCase` | L2 (approve) |

**Read Controller (L3+):**

| Method | URI | Notes |
|---|---|---|
| GET | `/platform/institution-types` | Paginated list. Filterable by status. |
| GET | `/platform/institution-types/{id}` | Single type detail. |

---

## 6. Authorization — `InstitutionTypePolicy`

**File:** `App\Http\Policies\SuperAdminDashboard\InstitutionTypePolicy`

| Policy Method | Min Authority | Required Permission |
|---|---|---|
| `manage()` | ≥ 60 | `institution_type.manage` |
| `approve()` | ≥ 80 | `institution_type.approve` |

---

## 7. Domain Events

| Event | Fired By | Payload |
|---|---|---|
| `InstitutionTypeCreated` | `CreateInstitutionTypeUseCase` | `id`, `name`, `slug` |
| `InstitutionTypeActivated` | `ApproveInstitutionTypeUseCase`, `ActivateInstitutionTypeUseCase` | `id`, `name` |
| `InstitutionTypeUpdated` | `UpdateInstitutionTypeUseCase` | `id`, `name` |
| `InstitutionTypeArchived` | `ApproveInstitutionTypeArchiveUseCase`, `ArchiveInstitutionTypeUseCase` | `id`, `name` |
| `InstitutionTypeUnarchived` | `UnarchiveInstitutionTypeUseCase` | `id`, `name` |

---

## 8. Exceptions Reference

| Exception | When Thrown |
|---|---|
| `InstitutionTypeNotFoundException` | ID not found in repository. |
| `InstitutionTypeNameAlreadyExistsException` | Duplicate name on create or update. |
| `InstitutionTypeSlugAlreadyExistsException` | Duplicate slug on create or update. |
| `InstitutionTypeNotEditableException` | `rename()` called on non-DRAFT/REJECTED type. |
| `InstitutionTypeImmutableSlugException` | Slug change attempted after first activation. |
| `InvalidInstitutionTypeStatusTransitionException` | `transitionTo()` called with a disallowed target status. |

---

## 9. Tenant Assignment Flow

When creating or editing a tenant, `institution_type_id` must be provided.

`UpdateTenantInstitutionTypeUseCase` handles post-creation reassignment:
```
1. Validate tenant exists
2. Validate new institution type exists AND isActive()
3. tenant.institutionTypeId = newTypeId
4. tenantRepository.save()
5. auditLogger.log('tenant.institution_type_updated', ...)
```

> Only `ACTIVE` institution types can be assigned to tenants. Assigning a `DRAFT`, `ARCHIVED`, or pending type is rejected.

---

## 10. Critical Test Scenarios

1. **Create + submit + approve** — Full happy path; type ends in `ACTIVE`.
2. **Create + submit + reject** — Type returns to `REJECTED`; reason stored.
3. **Re-submit after rejection** — `REJECTED → PENDING_APPROVAL` transition allowed.
4. **Edit active type** — `InstitutionTypeNotEditableException` thrown.
5. **Slug change after activation** — `InstitutionTypeImmutableSlugException` thrown.
6. **Duplicate name** — `InstitutionTypeNameAlreadyExistsException` on create and update.
7. **Archive flow** — `ACTIVE → PENDING_ARCHIVE → ARCHIVED` via request + approve.
8. **Reject archive** — `PENDING_ARCHIVE → ACTIVE` with reason stored.
9. **Unarchive** — `ARCHIVED → ACTIVE` direct transition.
10. **Assign DRAFT type to tenant** — Should fail with validation error (only ACTIVE allowed).
11. **L4 attempting approve** — Should return `403 Forbidden`.
12. **L2 attempting to create** — Should succeed (L2 has `manage` permission via higher authority).

---

*End of Document — UBOTZ 2.0 Institution Management Full Technical Specification — March 27, 2026*
