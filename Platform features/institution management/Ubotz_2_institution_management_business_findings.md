# UBOTZ 2.0 — Institution Management: Business Findings & Design

| Field | Value |
|---|---|
| **Document Type** | Principal Engineer — Business Logic Audit |
| **Feature** | Institution Management |
| **Date** | 2026-03-27 |
| **Issued By** | Principal Engineer / Architecture Auditor |
| **Scope** | Institution Type lifecycle, approval workflows, tenant classification, governance |
| **Status** | REVIEWED — Reflects current implemented state |

---

## 1. Executive Summary

Institution Management is the **tenant classification layer** of the UBOTZ 2.0 platform. It defines the categories (types) that tenants can belong to — such as Coaching Institutes, Schools, Skill Academies, or Corporate Training centres.

These institution types serve three purposes:

1. **Tenant Classification** — Every tenant must belong to one institution type. This determines the nature of their organization and anchors downstream features.
2. **Landing Page Template Pairing** — Institution types link tenants to appropriate landing page template presets suited to their sector (e.g., a coaching institute gets a different default layout than a school).
3. **Platform Segmentation & Reporting** — Platform admins can filter the tenant list by institution type for reporting, support, and analytics.

Institution types have a **6-state lifecycle** with a **formal approval workflow** — consistent with the Subscription Plan and Landing Page Template governance patterns. Platform Owners (L4) can propose changes; Root Approvers (L2) must approve them before they take effect.

---

## 2. Institution Type Lifecycle — 6-State Machine

| Status | DB Value | Meaning |
|---|---|---|
| `DRAFT` | `draft` | Newly created. Not visible to tenants. Editable. |
| `PENDING_APPROVAL` | `pending_approval` | Submitted for L2 review. Locked from edits. |
| `ACTIVE` | `active` | Live. Tenants can be assigned to this type. |
| `REJECTED` | `rejected` | Sent back from L2 review with a mandatory reason. Returns to editable. |
| `PENDING_ARCHIVE` | `pending_archive` | Archive requested by L4. Awaiting L2 approval. |
| `ARCHIVED` | `archived` | Retired. Cannot be assigned to new tenants. Existing tenants are unaffected. |

### 2.1 State Transition Map

```
DRAFT → (Submit)          → PENDING_APPROVAL → (Approve)         → ACTIVE
                                              → (Reject + reason) → REJECTED
REJECTED → (Re-submit)                        → PENDING_APPROVAL

ACTIVE → (Request Archive) → PENDING_ARCHIVE → (Approve Archive)        → ARCHIVED
                                             → (Reject Archive + reason) → ACTIVE

ARCHIVED → (Unarchive)                        → ACTIVE
```

### 2.2 Approval Workflow — Who Does What

| Actor | Authority Level | Allowed Actions |
|---|---|---|
| **Platform Owner (L4)** | ≥ 60 (`institution_type.manage`) | Create (draft), update (draft/rejected only), submit for approval, request archive, unarchive |
| **Root Approver (L2)** | ≥ 80 (`institution_type.approve`) | Approve activation, reject (with reason), approve archive, reject archive (with reason) |

**No L4 admin can make an institution type live without L2 approval.** This ensures that all active institution types on the platform have been explicitly reviewed by a Root Approver.

---

## 3. Business Rules

### 3.1 Slug Immutability

Every institution type has a unique `slug` (URL-safe identifier, e.g., `coaching-institute`). The slug can be freely changed while the type is in `DRAFT` or `REJECTED`. **Once the type has been approved for the first time (`activatedAt` is set), the slug becomes permanently immutable.**

**Why:** Institution type slugs may be referenced in landing page templates, tenant configurations, and external integrations. Allowing changes post-activation would silently break these references.

### 3.2 Edit Restriction

Edits (`rename()`) are only permitted when the institution type is in `DRAFT` or `REJECTED` status. Attempting to rename an `ACTIVE`, `PENDING_APPROVAL`, `PENDING_ARCHIVE`, or `ARCHIVED` type throws `InstitutionTypeNotEditableException`.

**Design intent:** Edits to an active institution type must follow the submit-for-approval workflow (revert to rejected via a reject action then resubmit). This prevents mid-approval changes from invalidating the reviewer's context.

### 3.3 Rejection Requires a Reason

Both `reject(adminId, reason)` and `rejectArchive(adminId, reason)` require a non-empty `reason` string. This is enforced at the entity level. The reason is stored in `rejection_reason` and surfaced to the submitter.

### 3.4 Uniqueness Constraints

- `name` — Must be unique across all institution types (enforced at DB level via unique index).
- `slug` — Must be unique across all institution types (enforced at DB level via unique index).

Duplicate name → `InstitutionTypeNameAlreadyExistsException`.
Duplicate slug → `InstitutionTypeSlugAlreadyExistsException`.

### 3.5 Tenant Assignment

The `tenants.institution_type_id` column is **required** (NOT NULL). Every tenant must be assigned an institution type. Platform admins can update a tenant's institution type using `UpdateTenantInstitutionTypeUseCase`.

### 3.6 Archived Types and Existing Tenants

When an institution type is archived, existing tenants assigned to that type are **not automatically reassigned**. Archived types remain referenced by existing tenants — archiving simply prevents new tenants from being assigned to the type.

---

## 4. Institution Types — Pending Approvals Dashboard

Institution types integrate with the L2 **Pending Approvals Dashboard**:

- `GET /platform/dashboard/pending-approvals` returns a count of institution types in `pending_approval` and `pending_archive` states.
- Root Approvers see all pending items in one view — subscription plans, archive requests, institution types — without having to navigate to each feature separately.

---

## 5. Business Rules — Complete Reference

| ID | Rule | Enforcement Point |
|---|---|---|
| BR-IT-01 | Institution types can only be created in `DRAFT` status. | `InstitutionType::create()`. |
| BR-IT-02 | Only L4+ (`institution_type.manage`) can create, update, submit, or request archive. | `InstitutionTypePolicy::manage()`. |
| BR-IT-03 | Only L2+ (`institution_type.approve`) can approve, reject, approve archive, or reject archive. | `InstitutionTypePolicy::approve()`. |
| BR-IT-04 | Edits are only allowed when status is `DRAFT` or `REJECTED`. | `InstitutionType::rename()` → `InstitutionTypeNotEditableException`. |
| BR-IT-05 | Slug is immutable after first activation. | `InstitutionType::isSlugImmutable()` → `InstitutionTypeImmutableSlugException`. |
| BR-IT-06 | Name must be unique across all institution types. | DB unique index + `InstitutionTypeNameAlreadyExistsException`. |
| BR-IT-07 | Slug must be unique across all institution types. | DB unique index + `InstitutionTypeSlugAlreadyExistsException`. |
| BR-IT-08 | Rejection reason is mandatory for both `reject()` and `rejectArchive()`. | `InstitutionType` entity + Form Request validation. |
| BR-IT-09 | Every tenant must have a non-null institution type. | `tenants.institution_type_id` NOT NULL constraint. |
| BR-IT-10 | Archiving a type does not affect existing tenant assignments. | No cascade update on `tenants.institution_type_id`. |
| BR-IT-11 | Pending institution types appear in the L2 Pending Approvals Dashboard. | `PendingApprovalsController` includes institution type counts. |
| BR-IT-12 | Unarchiving an archived type (`archived → active`) is permitted. | `InstitutionType::unarchive()`. |

---

## 6. Open Questions for Product Owner

| # | Question | Impact |
|---|---|---|
| 1 | Should archiving a type prevent it from appearing in the tenant creation dropdown only, or also hide it from existing tenant profiles? | Currently existing tenants keep the archived type label. |
| 2 | Should there be a notification to the submitter when their institution type is approved or rejected? | Currently no notification is sent on approval/rejection. |
| 3 | Should platform operators be able to update a tenant's institution type, or only Root Approvers? | Currently `UpdateTenantInstitutionTypeUseCase` authority requirements need confirmation. |

---

*End of Document — UBOTZ 2.0 Institution Management Business Findings — March 27, 2026*
