# Institution Type Approval Feature — Analysis & Report

**Date:** March 2026  
**Scope:** Require root_approver (L2) approval for platform_owner/L4 actions on Institution Types (create, edit, archive).  
**Reference:** Subscription plan lifecycle and Landing Page template approval flows.

---

## 1. Executive Summary

Today, **Institution Type** create, update, activate, archive, and unarchive are **direct** actions: any admin with **L1–L2 (authority ≥ 80)** can perform them without a second approver. The request is to align with **Subscription** and **Landing Page Template** behaviour: **platform owner / L4 can propose** changes, but **root_approver (L2)** must **approve** (or reject) before they take effect.

This document analyses the existing Subscription and Template approval lifecycles and reports on the current Institution Type flow and what would be needed to add root_approver approval for Institution Type create, edit, and archive.

---

## 2. Subscription Plan Lifecycle (Reference)

### 2.1 Status Model

| Status | Meaning | Who can set |
|--------|--------|-------------|
| `draft` | Plan created, not yet submitted | L4 (manage) |
| `pending_approval` | Submitted for approval | L4 via “Submit for approval” |
| `active` | Live, can be assigned to tenants | **L2 (root_approver)** via “Approve” |
| `rejected` | L2 rejected the submission | **L2** via “Reject” |
| `pending_archive` | Archive requested | L4 via “Request archive” |
| `archived` | No longer assignable | **L2** via “Approve archive” |

### 2.2 Actors and Permissions

| Role | Authority | Permission | Can |
|------|-----------|------------|-----|
| L4 Super Admin | 60 | `subscription.manage` | Create plan (draft), update draft, **submit for approval**, **request archive**, unarchive |
| L2 Root Approver | 80 | `subscription.approve` | **Approve** plan (draft → active), **Reject** plan, **Approve archive**, **Reject archive** |

- **Create:** L4 creates plan in `draft`. Plan is not active until L2 approves.
- **Go live:** L4 calls **Submit for approval** → status `pending_approval`. L2 calls **Approve** → `active`, or **Reject** → `rejected` (with reason).
- **Archive:** L4 calls **Request archive** → `pending_archive` (only if no active subscriptions). L2 calls **Approve archive** → `archived`, or **Reject archive** → back to `active`.

### 2.3 Persistence and Gates

- **Table:** `subscription_plans` has `submitted_by`, `submitted_at`, `approved_by`, `approved_at`, `rejected_by`, `rejected_at`, `rejection_reason`.
- **Controller:** `SubscriptionPlanWriteController` — `store`, `update`, `submit`, `archive` use `Gate::authorize('manage', SubscriptionPlanRecord::class)`. `approve`, `reject`, `approveArchive`, `rejectArchive` use `Gate::authorize('approve', SubscriptionPlanRecord::class)`.
- **Policy:** `SubscriptionPolicy` — `manage()` requires authority ≥ 60 and `subscription.manage`; `approve()` requires authority ≥ **80** and `subscription.approve`.

### 2.4 Dashboard

- **Pending approvals:** `GET /api/platform/dashboard/pending-approvals` (L2+ only) returns counts of pending plan submissions and pending archive requests (and refunds). Used so root_approver sees what needs approval.

---

## 3. Landing Page Template Lifecycle (Reference)

### 3.1 Status Model

| Status | Meaning | Who |
|--------|--------|-----|
| `draft` | Not published | L4 |
| `pending_publish` | Submitted for publish | L4 submit → L2 approve/reject |
| `published` | Live | L2 approve |
| `rejected` | L2 rejected publish | L2 reject |
| `pending_archive` | Archive requested | L4 request → L2 approve/reject |
| `archived` | Archived | L2 approve archive |

### 3.2 Flow

- **Publish:** L4 **Submit for publish** → `pending_publish`. L2 **Approve publish** or **Reject** (template stays draft/rejected).
- **Archive:** L4 **Request archive** → `pending_archive`. L2 **Approve archive** → `archived`, or **Reject archive** → back to `published`.

Controllers: `TemplateLifecycleController` (L4: submit, request archive, unarchive); `TemplateApprovalController` (L2: approve publish, approve archive). Routes gated by `admin.authority:80` for approval endpoints.

---

## 4. Institution Type — Current Behaviour

### 4.1 Status Model (Current)

| Status | Meaning | Who can set |
|--------|--------|-------------|
| `draft` | Created, not active | L1–L2 on create |
| `active` | Available for tenants/templates | L1–L2 via **Activate** (direct) |
| `archived` | No longer available for new use | L1–L2 via **Archive** (direct) |

- **No** `pending_approval`, `pending_archive`, or `rejected` states.
- **No** submit / approve / reject flow. Create, update, activate, archive, unarchive are **immediate** for anyone with authority ≥ 80.

### 4.2 Routes and Authority

- **Read:** `admin.authority:50` — list, show.
- **Write:** `admin.authority:80` — store, update, activate, archive, unarchive.

So today **only L1–L2** can write; there is no L4 “manage” vs L2 “approve” split. Institution Type has no policy and no `institution_type.approve` (or similar) permission.

### 4.3 Domain and Persistence

- **Entity:** `InstitutionType` (Domain) — status is `InstitutionTypeStatus`: `draft`, `active`, `archived`. Transitions: draft→active, active→archived, archived→active (no pending/rejected).
- **Table:** `institution_types` — `name`, `slug`, `status`, `created_by`, `activated_at`, timestamps. **No** `submitted_by`, `approved_by`, `approved_at`, `rejected_by`, `rejection_reason`, etc.

---

## 5. Gap Summary: Institution Type vs Subscription/Template

| Aspect | Subscription / Template | Institution Type (current) |
|--------|--------------------------|----------------------------|
| Create | L4 creates draft; L2 approves → active | L1–L2 create draft; **no approval** |
| Activate / Publish | L4 submits; L2 approves | L1–L2 **activate directly** |
| Edit | L4 can edit draft; after approval, changes follow same submit/approve if needed | L1–L2 **edit directly** (no submit/approve) |
| Archive | L4 requests archive; L2 approves archive | L1–L2 **archive directly** |
| Reject | L2 can reject with reason | **Not applicable** (no pending state) |
| Pending dashboard | Pending plans/archives/refunds counted for L2 | **No** institution type pending count |
| Permissions | `subscription.manage` (L4) vs `subscription.approve` (L2) | Only route-level authority:80 (L1–L2) |
| DB approval fields | `submitted_at`, `approved_at`, `rejected_at`, etc. | **None** |

---

## 6. Feature Requirement (Interpreted)

- **Platform owner / L4** should be able to:
  - **Create** an institution type (as draft),
  - **Propose edits** (e.g. submit for approval),
  - **Request archive.**
- **Root_approver (L2)** must:
  - **Approve** (or reject) **create** (draft → active),
  - **Approve** (or reject) **edit**,
  - **Approve** (or reject) **archive**.

So the desired behaviour mirrors Subscription: **L4 proposes**, **L2 approves**.

---

## 7. What Would Need to Change (High-Level)

### 7.1 Domain

- **InstitutionTypeStatus:** Add `pending_approval` (for first-time activation / create approval) and `pending_archive` (for archive approval). Optionally `rejected` with reason.
- **InstitutionType entity:** Add methods and invariants for:
  - `submitForApproval(adminId)` (draft → pending_approval),
  - `approve(adminId)` (pending_approval → active),
  - `reject(adminId, reason)` (pending_approval → rejected),
  - `requestArchive(adminId)` (active → pending_archive),
  - `approveArchive(adminId)` (pending_archive → archived),
  - `rejectArchive(adminId, reason)` (pending_archive → active).
- **Edit flow:** Either (a) only allow edits in draft/rejected and require submit+approve again to go active, or (b) introduce “pending_edit” and L2 approve edit (similar to plan update in subscription if that exists). Clarify with product.

### 7.2 Database

- **Migration:** Add to `institution_types`: `submitted_by`, `submitted_at`, `approved_by`, `approved_at`, `rejected_by`, `rejected_at`, `rejection_reason` (and any “pending_edit” snapshot if needed for edit approval).

### 7.3 Application Layer

- **Use cases:**  
  - **Submit for approval** (create activation): draft → pending_approval.  
  - **Approve / Reject** (L2): pending_approval → active / rejected.  
  - **Request archive** (L4): active → pending_archive (with any business rule, e.g. no new tenants if required).  
  - **Approve archive / Reject archive** (L2): pending_archive → archived / active.  
- **Commands/Queries:** New commands for submit, approve, reject, request archive, approve archive, reject archive; list “pending” for L2 dashboard.

### 7.4 HTTP and Authorization

- **Permissions:** Add e.g. `institution_type.manage` (L4) and `institution_type.approve` (L2). Assign in `RolePermissionSeeder` (e.g. L4: manage; L2: manage + approve).
- **Policy:** New `InstitutionTypePolicy` (or gate on `InstitutionTypeRecord`) with `manage()` (authority ≥ 60, manage permission) and `approve()` (authority ≥ 80, approve permission).
- **Routes:**
  - L4 (e.g. authority 60): create (draft), update (draft/rejected), **submit for approval**, **request archive**, unarchive (archived → active if allowed).
  - L2 (authority 80): **approve**, **reject**, **approve archive**, **reject archive**.
- **Controllers:** Split or extend so that “submit / request archive” use `manage`, and “approve / reject” use `approve`.

### 7.5 Dashboard and Listing

- **Pending approvals:** Include institution type pending counts in `PendingApprovalsController` (e.g. pending_approval count, pending_archive count for institution types) so root_approver sees them in the same dashboard.

### 7.6 Audit and Events

- **Audit:** Log submit, approve, reject, request archive, approve archive, reject archive (actor, action, entity id, reason if any).
- **Domain events:** Optional events for approved/rejected (e.g. for notifications or downstream systems).

---

## 8. Recommendation

- **Align Institution Type with Subscription (and Template) lifecycle** so that:
  - **L4** can create (draft), submit for approval, request archive, and unarchive; **L2 (root_approver)** must approve or reject activation and archive.
- **Reuse the same patterns:** status values (`pending_approval`, `pending_archive`, `rejected`), approval/rejection columns in DB, separate “manage” vs “approve” permission and policy, and a single pending-approvals endpoint that includes institution types.
- **Edit:** Define whether “edit” is only on draft/rejected (then submit again for approval) or requires a dedicated “pending_edit” and approve-edit flow; the former is simpler and consistent with “only approved (active) types are visible to tenants.”

---

## 9. Files and Components Referenced

| Area | Subscription | Landing Template | Institution Type (current) |
|------|--------------|------------------|----------------------------|
| Entity status VO | `PlanStatus` | `TemplateStatus` | `InstitutionTypeStatus` |
| Entity | `SubscriptionPlanEntity` | `LandingPageTemplate` | `InstitutionType` |
| Submit/Approve use cases | `SubmitPlanForApprovalUseCase`, `ApprovePlanUseCase`, etc. | `SubmitTemplateForPublishUseCase`, `ApproveTemplatePublishUseCase`, etc. | None (direct activate/archive) |
| Write controller | `SubscriptionPlanWriteController` | `TemplateLifecycleController` + `TemplateApprovalController` | `InstitutionTypeWriteController` (single) |
| Policy | `SubscriptionPolicy` (manage / approve) | Route-level authority | None |
| Pending dashboard | `PendingApprovalsController` (plans, archives, refunds) | — | Not included |
| Routes | `api.php` (manage 60, approve 80) | `landing_page_templates.php` | `institution_types.php` (all write 80) |

---

*End of report. Implementation would require a detailed implementation plan (phases, migrations, API contract, and tests) once product confirms the exact edit and archive rules.*
