# UBOTZ 2.0 — Institution Type Approval Implementation Plan

## Root Approver Approval for Create, Activate, and Archive

| Field | Value |
|-------|--------|
| **Document Type** | Implementation Plan |
| **Feature** | Institution Type Approval (L4 propose, L2 approve) |
| **Date** | March 2026 |
| **Authority** | [UBOTZ_2_INSTITUTION_TYPE_APPROVAL_FEATURE_ANALYSIS.md](./UBOTZ_2_INSTITUTION_TYPE_APPROVAL_FEATURE_ANALYSIS.md) |
| **Manual** | [Ubotz 2 developer instruction manual .md](../Ubotz%202%20developer%20instruction%20manual%20.md) |
| **Reference** | Subscription plan lifecycle; Landing Page template approval |
| **Prerequisites** | Phase 17A (Institution Type) and Phase 17B (Tenant Institution Type) COMPLETE |

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Gap Analysis](#2-gap-analysis)
3. [Implementation Phases](#3-implementation-phases)
4. [Migration Detail](#4-migration-detail)
5. [API Contract](#5-api-contract)
6. [Audit & Events](#6-audit--events)
7. [Quality Gates & Tests](#7-quality-gates--tests)
8. [Definition of Done](#8-definition-of-done)
9. [Files Manifest](#9-files-manifest)

---

## 1. Executive Summary

Today, Institution Type create, update, activate, archive, and unarchive are **direct** for L1–L2 (authority 80). This plan adds a **submit/approve** flow so that:

- **L4 (Super Admin, authority 60)** can: create (draft), update (draft/rejected only), **submit for approval**, **request archive**, unarchive.
- **L2 (Root Approver, authority 80)** must: **approve** or **reject** activation; **approve** or **reject** archive.

**Edit rule (simplified):** Edits are allowed only when status is `draft` or `rejected`. To make the type live, L4 submits for approval again; L2 approves. No separate "pending_edit" state.

**In scope:**
- New statuses: `pending_approval`, `rejected`, `pending_archive`.
- DB columns: `submitted_by`, `submitted_at`, `approved_by`, `approved_at`, `rejected_by`, `rejected_at`, `rejection_reason`.
- Permissions: `institution_type.manage` (L4), `institution_type.approve` (L2).
- Policy, split routes (manage vs approve), new use cases and endpoints.
- Pending-approvals dashboard includes institution type counts.

**Out of scope:**
- Frontend UI (separate task); self-approval prevention (can be added later); notification on approve/reject.

---

## 2. Gap Analysis

| Asset | Current State | Action |
|-------|---------------|--------|
| `institution_types` table | No approval columns | Add migration (Phase A) |
| `InstitutionTypeStatus` | draft, active, archived only | Add pending_approval, rejected, pending_archive |
| `InstitutionType` entity | activate(), archive(), unarchive() direct | Add submitForApproval, approve, reject, requestArchive, approveArchive, rejectArchive |
| Institution type routes | All write at authority:80 | Split: manage 60, approve 80 |
| Permissions | None for institution type | Add manage + approve; seed and assign |
| Policy | None | Add InstitutionTypePolicy (manage / approve) |
| Controllers | Single InstitutionTypeWriteController | Keep; add approval methods or split approval to InstitutionTypeApprovalController |
| PendingApprovalsController | Plans, refunds, placeholder archives | Add institution type pending counts |
| List/Get institution type | Existing | Optional: filter by status (e.g. pending for L2) |

---

## 3. Implementation Phases

### Phase A — Database

| # | Task | Details |
|---|------|---------|
| A.1 | **Migration** | Add to `institution_types`: `submitted_by` (unsigned bigint nullable), `submitted_at` (timestamp nullable), `approved_by` (unsigned bigint nullable), `approved_at` (timestamp nullable), `rejected_by` (unsigned bigint nullable), `rejected_at` (timestamp nullable), `rejection_reason` (text nullable). FKs for submitted_by, approved_by, rejected_by → `admins.id` ON DELETE SET NULL. Index on `status` if not already (for pending lists). |
| A.2 | **InstitutionTypeRecord** | Add new columns to fillable and casts (datetime for submitted_at, approved_at, rejected_at). |

---

### Phase B — Domain: Status and Entity

| # | Task | Details |
|---|------|---------|
| B.1 | **InstitutionTypeStatus** | Add constants: `PENDING_APPROVAL = 'pending_approval'`, `REJECTED = 'rejected'`, `PENDING_ARCHIVE = 'pending_archive'`. Update constructor validation. Add transitions: draft→pending_approval (submit); pending_approval→active (approve), pending_approval→rejected (reject); active→pending_archive (request archive); pending_archive→archived (approve archive), pending_archive→active (reject archive); rejected→pending_approval (resubmit). Add helpers: `isPendingApproval()`, `isRejected()`, `isPendingArchive()`. |
| B.2 | **InstitutionType entity** | Add properties: `submittedBy`, `submittedAt`, `approvedBy`, `approvedAt`, `rejectedBy`, `rejectedAt`, `rejectionReason` (nullable where appropriate). Add methods: `submitForApproval(int $adminId)`, `approve(int $adminId)`, `reject(int $adminId, string $reason)`, `requestArchive(int $adminId)`, `approveArchive(int $adminId)`, `rejectArchive(int $adminId, string $reason)`. Each method must enforce status transition and set the corresponding approval/rejection fields. Optionally record domain events (e.g. InstitutionTypeSubmittedForApproval, InstitutionTypeApproved, InstitutionTypeRejected, ArchiveRequested, ArchiveApproved, ArchiveRejected). |
| B.3 | **Exceptions** | Reuse or add: invalid transition when status does not allow the operation (e.g. approve when not pending_approval). |

---

### Phase C — Permissions and Policy

| # | Task | Details |
|---|------|---------|
| C.1 | **PermissionSeeder** | Add two permissions: `institution_type.manage` (description: Create and update institution types (draft/rejected), submit for approval, request archive, unarchive), `institution_type.approve` (description: Approve or reject institution type activation and archive requests). Category e.g. content or platform. |
| C.2 | **RolePermissionSeeder** | Assign `institution_type.manage` to L4 (super_admin). Assign `institution_type.manage` and `institution_type.approve` to L2 (root_approver). L1 can have both. Ensure read-only roles (e.g. L5) do not get approve. |
| C.3 | **InstitutionTypePolicy** | New policy for `InstitutionTypeRecord`: `manage(AdminRecord $admin)`: allow if authority ≥ 60 and has `institution_type.manage`. `approve(AdminRecord $admin)`: allow if authority ≥ 80 and has `institution_type.approve`. Register in AuthServiceProvider: `Gate::policy(InstitutionTypeRecord::class, InstitutionTypePolicy::class)`. |
| C.4 | **AuthorizationServiceProvider** | Register `InstitutionTypePolicy` for `InstitutionTypeRecord`. |

---

### Phase D — Application Layer: Use Cases and Commands

| # | Task | Details |
|---|------|---------|
| D.1 | **SubmitForApproval** | Command: `SubmitInstitutionTypeForApprovalCommand(institutionTypeId, adminId)`. Use case: load entity, call `submitForApproval(adminId)`, persist, audit after commit (action e.g. `institution_type.submitted_for_approval`). |
| D.2 | **Approve** | Command: `ApproveInstitutionTypeCommand(id, adminId)`. Use case: load entity, call `approve(adminId)`, persist, audit after commit (`institution_type.approved`). |
| D.3 | **Reject** | Command: `RejectInstitutionTypeCommand(id, adminId, reason)`. Use case: load entity, call `reject(adminId, reason)`, persist, audit after commit (`institution_type.rejected`). |
| D.4 | **RequestArchive** | Command: `RequestInstitutionTypeArchiveCommand(id, adminId)`. Use case: load entity, optionally check no blocking rule (e.g. no new tenants if product requires), call `requestArchive(adminId)`, persist, audit (`institution_type.archive_requested`). |
| D.5 | **ApproveArchive** | Command: `ApproveInstitutionTypeArchiveCommand(id, adminId)`. Use case: load entity, call `approveArchive(adminId)`, persist, audit (`institution_type.archive_approved`). |
| D.6 | **RejectArchive** | Command: `RejectInstitutionTypeArchiveCommand(id, adminId, reason)`. Use case: load entity, call `rejectArchive(adminId, reason)`, persist, audit (`institution_type.archive_rejected`). |
| D.7 | **Restrict Create/Update/Activate/Archive** | CreateInstitutionTypeUseCase: no change (still creates draft). UpdateInstitutionTypeUseCase: allow only when status is draft or rejected (enforce in use case). Remove direct activate/archive from L4: ActivateInstitutionTypeUseCase and ArchiveInstitutionTypeUseCase are only used after approval or by L2 unarchive. So: L4 uses submit for approval instead of activate; L4 uses request archive instead of archive. L2 uses approve/reject and approve archive/reject archive. Unarchive: can remain L4 (archived → active without approval) or require L2; plan assumes L4 can unarchive (like subscription). |

---

### Phase E — Infrastructure: Repository and Record

| # | Task | Details |
|---|------|---------|
| E.1 | **InstitutionTypeRecord** | Add fillable: `submitted_by`, `submitted_at`, `approved_by`, `approved_at`, `rejected_by`, `rejected_at`, `rejection_reason`. Casts: submitted_at, approved_at, rejected_at → datetime. |
| E.2 | **EloquentInstitutionTypeRepository** | Map new fields in toEntity() and in save() from entity. Ensure reconstitute() and create() support new fields where applicable. |
| E.3 | **List/Get** | ListInstitutionTypesQuery / read model: optional filter by status (e.g. for L2 dashboard: pending_approval, pending_archive). |

---

### Phase F — HTTP: Routes and Controllers

| # | Task | Details |
|---|------|---------|
| F.1 | **Routes (manage — L4)** | Under `admin.authority:60` and Gate `manage`: POST create, PUT update, POST `{id}/submit` (submit for approval), POST `{id}/request-archive`, PATCH `{id}/unarchive`. |
| F.2 | **Routes (approve — L2)** | Under `admin.authority:80` and Gate `approve`: POST `{id}/approve`, POST `{id}/reject`, POST `{id}/approve-archive`, POST `{id}/reject-archive`. |
| F.3 | **Remove direct activate/archive for L4** | Current routes: PATCH activate, PATCH archive. Change so that L4 does not call activate or archive directly; L4 calls submit and request-archive. L2 calls approve / reject / approve-archive / reject-archive. So: move PATCH activate and PATCH archive behind approve gate (L2 only), or remove them and replace with approve/reject endpoints. Prefer: keep PATCH activate and PATCH archive but restrict to L2 (approve gate); L4 uses submit and request-archive. Then approve endpoint (L2) effectively “activates” the type (approve → active); reject leaves it rejected. And approve-archive (L2) archives; reject-archive returns to active. So the current “activate” and “archive” actions become L2-only (or we keep them as synonyms for approve/approve-archive for backward compatibility). Clear approach: **Rename/split.** L4: store, update, submit, request-archive, unarchive. L2: approve, reject, approve-archive, reject-archive. The old “activate” is replaced by “approve” (pending_approval → active). The old “archive” is replaced by “request archive” (L4) + “approve archive” (L2). So we **remove** PATCH activate and PATCH archive from the manage group and **add** submit and request-archive. L2 approval controller has approve, reject, approve-archive, reject-archive. |
| F.4 | **InstitutionTypeWriteController** | store: Gate::authorize('manage', InstitutionTypeRecord::class). update: same; use case enforces draft/rejected. Add submit(SubmitInstitutionTypeForApprovalRequest, id), requestArchive(id). Add or move to approval controller: approve(id), reject(RejectInstitutionTypeRequest, id), approveArchive(id), rejectArchive(RejectInstitutionTypeRequest, id). Each controller method &lt; 20 lines. |
| F.5 | **InstitutionTypeApprovalController** (new) | approve(id), reject(request, id), approveArchive(id), rejectArchive(request, id). All Gate::authorize('approve', InstitutionTypeRecord::class). |
| F.6 | **Form requests** | RejectInstitutionTypeRequest: reason required, string, max length. RejectInstitutionTypeArchiveRequest: same. SubmitInstitutionTypeForApprovalRequest: no body (id in URL). |
| F.7 | **InstitutionTypeResource** | Extend to include approval fields when present: submitted_at, approved_at, rejected_at, rejection_reason (for L2/L1 visibility). |

---

### Phase G — Pending Approvals Dashboard

| # | Task | Details |
|---|------|---------|
| G.1 | **PendingApprovalsController** | Add to response: `pending_institution_type_submissions` (count where status = pending_approval), `pending_institution_type_archives` (count where status = pending_archive). Keep existing keys for plans and refunds. |

---

### Phase H — Tests

| # | Task | Details |
|---|------|---------|
| H.1 | **Unit: InstitutionTypeStatus** | Transitions for new statuses; canTransitionTo for submit, approve, reject, request archive, approve archive, reject archive. |
| H.2 | **Unit: InstitutionType entity** | submitForApproval, approve, reject, requestArchive, approveArchive, rejectArchive with valid/invalid state. |
| H.3 | **Feature: L4 can create draft and submit** | L4 creates institution type (draft); L4 calls submit → status pending_approval. L4 cannot approve. |
| H.4 | **Feature: L2 can approve/reject** | L2 approves → active. L2 rejects with reason → rejected. L4 cannot approve. |
| H.5 | **Feature: L4 can request archive; L2 can approve/reject archive** | L4 request archive → pending_archive. L2 approve archive → archived. L2 reject archive → active. |
| H.6 | **Feature: L4 can update only draft/rejected** | Update allowed when draft or rejected; 403 or 422 when active/pending_archive/archived. |
| H.7 | **Feature: Pending approvals dashboard** | L2 gets counts including institution type pending; L4 gets 403 on pending-approvals or does not see approve actions. |
| H.8 | **Feature: Unarchive** | L4 (or L2) can unarchive (archived → active) per product rule; add test. |

---

## 4. Migration Detail

**File:** `database/migrations/central/YYYY_MM_DD_HHMMSS_add_approval_fields_to_institution_types_table.php`

```php
// up()
Schema::table('institution_types', function (Blueprint $table) {
    $table->unsignedBigInteger('submitted_by')->nullable()->after('activated_at');
    $table->timestamp('submitted_at')->nullable()->after('submitted_by');
    $table->unsignedBigInteger('approved_by')->nullable()->after('submitted_at');
    $table->timestamp('approved_at')->nullable()->after('approved_by');
    $table->unsignedBigInteger('rejected_by')->nullable()->after('approved_at');
    $table->timestamp('rejected_at')->nullable()->after('rejected_by');
    $table->text('rejection_reason')->nullable()->after('rejected_at');
    $table->foreign('submitted_by')->references('id')->on('admins')->onDelete('set null');
    $table->foreign('approved_by')->references('id')->on('admins')->onDelete('set null');
    $table->foreign('rejected_by')->references('id')->on('admins')->onDelete('set null');
});
```

**Down:** drop FKs, drop columns.

**Note:** Existing rows have status draft/active/archived; new columns nullable. No data backfill required.

---

## 5. API Contract

### 5.1 Routes Summary

| Method | Path | Gate | Description |
|--------|------|------|-------------|
| GET | /api/platform/institution-types | 50 | List (existing) |
| GET | /api/platform/institution-types/{id} | 50 | Show (existing) |
| POST | /api/platform/institution-types | 60 + manage | Create draft (existing store) |
| PUT | /api/platform/institution-types/{id} | 60 + manage | Update (draft/rejected only) |
| POST | /api/platform/institution-types/{id}/submit | 60 + manage | Submit for approval |
| POST | /api/platform/institution-types/{id}/request-archive | 60 + manage | Request archive |
| PATCH | /api/platform/institution-types/{id}/unarchive | 60 + manage | Unarchive (archived → active) |
| POST | /api/platform/institution-types/{id}/approve | 80 + approve | Approve (pending_approval → active) |
| POST | /api/platform/institution-types/{id}/reject | 80 + approve | Reject (body: reason) |
| POST | /api/platform/institution-types/{id}/approve-archive | 80 + approve | Approve archive |
| POST | /api/platform/institution-types/{id}/reject-archive | 80 + approve | Reject archive (body: reason) |

**Remove or repurpose:** PATCH `{id}/activate` and PATCH `{id}/archive` — either remove (replaced by submit/approve and request-archive/approve-archive) or keep as L2-only synonyms for approve and approve-archive for backward compatibility. Plan recommends **removing** direct activate/archive from public API and using submit/approve and request-archive/approve-archive only.

### 5.2 Request/Response

- **Reject:** Body `{ "reason": "string" }`. Response 200 + institution type resource.
- **Approve / Approve archive:** No body. Response 200 + institution type resource.
- **Submit / Request archive:** No body. Response 200 + message + institution type resource.
- **List/Show:** Resource may include `submitted_at`, `approved_at`, `rejected_at`, `rejection_reason` when present (for L2/L1).

---

## 6. Audit & Events

| Action | Audit action code | When |
|--------|-------------------|------|
| Submit for approval | institution_type.submitted_for_approval | After SubmitForApproval use case |
| Approve | institution_type.approved | After Approve use case |
| Reject | institution_type.rejected | After Reject use case |
| Request archive | institution_type.archive_requested | After RequestArchive use case |
| Approve archive | institution_type.archive_approved | After ApproveArchive use case |
| Reject archive | institution_type.archive_rejected | After RejectArchive use case |

Audit log written **after** transaction commit (never inside transaction). Include actor, entity id, and for reject/reject-archive include reason in metadata or new_values.

---

## 7. Quality Gates & Tests

- PHPStan Level 5; no new errors.
- All existing institution type and tenant tests pass (tenant create still requires active institution type; list/filter unchanged).
- Domain: no Illuminate imports; status transitions covered by unit tests.
- Controllers: &lt; 20 lines per method; FormRequest for reject reason.
- Policy: explicit allow/deny for manage and approve by authority and permission.
- Feature tests: L4 vs L2 separation; L4 cannot approve; L2 can approve/reject; pending dashboard includes institution type counts.

---

## 8. Definition of Done

- [ ] Migration runs; approval columns present on `institution_types`.
- [ ] InstitutionTypeStatus includes pending_approval, rejected, pending_archive with correct transitions.
- [ ] InstitutionType entity has submitForApproval, approve, reject, requestArchive, approveArchive, rejectArchive; persistence and audit updated.
- [ ] Permissions institution_type.manage and institution_type.approve exist and are assigned (L4 manage, L2 manage+approve).
- [ ] InstitutionTypePolicy registered; routes split (manage 60, approve 80).
- [ ] L4 can create draft, update draft/rejected, submit for approval, request archive, unarchive; L4 cannot approve or reject.
- [ ] L2 can approve, reject, approve archive, reject archive; audit log entries present after commit.
- [ ] Pending approvals dashboard includes pending_institution_type_submissions and pending_institution_type_archives.
- [ ] Direct PATCH activate and PATCH archive removed or restricted to L2 (per product choice).
- [ ] All new and existing tests pass; no regression in tenant provisioning (active type required).

---

## 9. Files Manifest

| Layer | File | Change |
|-------|------|--------|
| Migration | central/YYYY_MM_DD_add_approval_fields_to_institution_types.php | New |
| Domain | InstitutionTypeStatus.php | Add constants and transitions |
| Domain | InstitutionType.php | Add approval fields and methods |
| Application | SubmitInstitutionTypeForApprovalCommand, UseCase | New |
| Application | ApproveInstitutionTypeCommand, UseCase | New |
| Application | RejectInstitutionTypeCommand, UseCase | New |
| Application | RequestInstitutionTypeArchiveCommand, UseCase | New |
| Application | ApproveInstitutionTypeArchiveCommand, UseCase | New |
| Application | RejectInstitutionTypeArchiveCommand, UseCase | New |
| Application | UpdateInstitutionTypeUseCase | Restrict to draft/rejected |
| Infrastructure | InstitutionTypeRecord | New columns, casts |
| Infrastructure | EloquentInstitutionTypeRepository | Map approval fields |
| HTTP | InstitutionTypePolicy | New |
| HTTP | InstitutionTypeWriteController | Gate manage; add submit, requestArchive |
| HTTP | InstitutionTypeApprovalController | New; approve, reject, approve-archive, reject-archive |
| HTTP | RejectInstitutionTypeRequest, RejectInstitutionTypeArchiveRequest | New |
| HTTP | InstitutionTypeResource | Optional approval fields |
| Routes | institution_types.php | Split manage (60) vs approve (80); add new routes |
| Seeders | PermissionSeeder | institution_type.manage, institution_type.approve |
| Seeders | RolePermissionSeeder | Assign to L4, L2 |
| Dashboard | PendingApprovalsController | Add institution type pending counts |
| Tests | InstitutionTypeStatusTest (unit) | New transitions |
| Tests | InstitutionTypeApprovalTest (feature) | L4/L2 flows, dashboard |

---

## 10. Post-deploy: Seed permissions (L4 “manage” / L2 “approve”)

After deploying this feature, **re-run the permission seeders** so that the `super_admin` (L4) and `root_approver` (L2) roles have the new permissions. Otherwise L4 will get *"You do not have permission to manage institution types"* when creating, submitting, or requesting archive.

```powershell
docker exec -it ubotz_backend php artisan db:seed --class=PermissionSeeder
docker exec -it ubotz_backend php artisan db:seed --class=RolePermissionSeeder
```

Or run the full system seed (roles + permissions + role-permission mapping):

```powershell
docker exec -it ubotz_backend php artisan db:seed --class=SystemSeeder
```

Verify: L4 must have role `super_admin` with permission `institution_type.manage`; L2 must have `institution_type.approve` (and typically `institution_type.manage` as well).

---

*End of Implementation Plan — Institution Type Approval — March 2026*
