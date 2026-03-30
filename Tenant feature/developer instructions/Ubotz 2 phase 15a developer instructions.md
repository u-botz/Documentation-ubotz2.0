# UBOTZ 2.0 — Phase 15A Developer Instructions

## CRM Extension: Multi-Branch Support, Counselor Assignment & Stale Lead Alerting

| Field | Value |
|---|---|
| **Document Type** | Developer Instruction (Pre-Implementation Brief) |
| **Phase** | 15A |
| **Date** | March 17, 2026 |
| **Issued By** | Principal Engineer / Architecture Auditor |
| **Audience** | Implementation Developer |
| **Expected Deliverable** | Phase 15A Implementation Plan (same format as prior phase plans) |
| **Prerequisites** | Phase 13A COMPLETE (landing page + public lead form), Phase 14 COMPLETE (notification infrastructure live) |

> **This phase extends an existing, working system. The LeadManagement bounded context is solid. You are adding multi-branch dimensionality, completing counselor assignment, and closing the stale lead gap. Do not rewrite what works. Extend it precisely where the gaps are.**

---

## 1. Current State Assessment

### 1.1 What Is Already Built (Do Not Touch Without Reason)

The LeadManagement bounded context at `app/Domain/TenantAdminDashboard/LeadManagement/` is complete and architecturally sound with the following verified capabilities:

- `LeadEntity` aggregate root with full pipeline lifecycle and transition guards
- Six pipeline stages: `new_enquiry → contacted → interested → application_submitted → admission_confirmed → rejected`
- `LeadFollowUpEntity` and `LeadNoteEntity` as subordinate entities
- Value objects: `LeadSource`, `LeadContactInfo`, `PipelineStage`
- Use Cases: Create, Update, ChangeStage, Assign, Convert, AddNote, follow-up CRUD
- Queries: ListLeads (filterable), GetLead, GetPipelineSummary
- Repositories: `LeadRepositoryInterface` with Eloquent implementation
- Controllers: `LeadWriteController`, `LeadReadController`, `LeadFollowUpController`, `LeadNoteController`
- Public entry point: `PublicLeadFormController` (integrated with Phase 13A landing pages)
- RBAC capabilities: `lead.view`, `lead.manage`, `crm.view`, `crm.manage`
- Security: Tenant-scoped via `tenant_id`, conversion lock on `admission_confirmed`

### 1.2 Confirmed Gaps (What This Phase Builds)

| Gap | Description | Severity |
|---|---|---|
| G-1 | No `branches` table, no Branch domain entity, no Branch bounded context | **Critical** |
| G-2 | `leads` table has no `branch_id` column — all multi-branch queries impossible | **Critical** |
| G-3 | No user-to-branch assignment model — counselors cannot be scoped to branches | **Critical** |
| G-4 | Branch-level security isolation not enforced — counselors can see all tenant leads | **Critical** |
| G-5 | Auto-assign (round-robin) not implemented — web form leads have no assignment logic | **High** |
| G-6 | Counselor workload visibility missing — no endpoint for open leads per counselor | **High** |
| G-7 | Stale lead detection missing — no mechanism to surface uncontacted leads | **High** |
| G-8 | Notification integration missing — no CRM domain events wired to Phase 14 infrastructure | **Medium** |

### 1.3 What This Phase Does NOT Build

| Excluded Item | Reason | Deferred To |
|---|---|---|
| Lead-to-UserRecord conversion | Decided: admin creates student manually after conversion | Future admission phase |
| Meta Lead Ads webhook integration | Separate Phase 15B | Phase 15B |
| WhatsApp Business API | Separate Phase 15B | Phase 15B |
| Branch-level billing or quota enforcement | Branch is organisational, not a billing unit | Future |
| Branch-specific LMS content | No LMS-to-branch scoping in this phase | Future |
| Cross-branch lead transfer UI | Uncommon operation, defer after core is stable | Future |

---

## 2. Architecture Decisions (NON-NEGOTIABLE)

### 2.1 Branch as a Shared Tenant-Level Concept

A `Branch` is a organisational sub-unit within a tenant. It is not an independent billing entity. It is not a sub-tenant. It shares the tenant's data, subscription, and quota.

**Branch belongs to a new `Branch` bounded context** within `TenantAdminDashboard`, separate from `LeadManagement`. This is correct DDD — Branch is a domain concept that will eventually affect users, attendance, courses, and reporting. It must not be buried inside LeadManagement.

```
app/Domain/TenantAdminDashboard/Branch/
    Entities/
        BranchEntity.php
    Events/
        BranchCreated.php
        BranchUpdated.php
        BranchDeactivated.php
    Exceptions/
        BranchNotFoundException.php
        DuplicateBranchCodeException.php
        CannotDeactivateBranchWithActiveLeadsException.php
    Repositories/
        BranchRepositoryInterface.php
    ValueObjects/
        BranchCode.php
```

### 2.2 Branch ID is Nullable on Leads — No Auto-Creation

`leads.branch_id` is nullable. A tenant that does not use branches leaves all leads with `branch_id = null`. There is no silent "Main Branch" auto-creation. Tenants opt into multi-branch explicitly by creating their first branch record.

**Rationale:** Silent auto-creation creates orphan data that is hard to reason about. Explicit opt-in means the absence of a branch is meaningful — it signals a single-branch tenant, not a misconfigured one.

**Impact on queries:** All lead list and pipeline summary queries must handle `branch_id IS NULL` as a valid, non-error state. Filtering by branch is optional. If no branch filter is supplied, the query returns all leads the requesting user is entitled to see (see §2.3).

### 2.3 Branch Security — Backend Enforced, Not UI-Only

**This is a security boundary, not a filter preference.**

A counselor assigned to Branch A must receive HTTP 403 if they attempt to read or action a lead belonging to Branch B. This enforcement happens in the Application layer Use Cases — not in the Controller, not in the frontend.

The enforcement model:

1. `users` table gains a `branch_assignments` relationship via a new `user_branch_assignments` pivot table.
2. Every Use Case that reads or modifies a lead checks: "Does the requesting user have access to this lead's branch?"
3. The check is: if `lead.branch_id IS NULL` → accessible by all counselors within the tenant. If `lead.branch_id IS NOT NULL` → requesting user must have an assignment to that branch OR hold the `crm.manage` capability (which grants cross-branch access for managers).

```
Access Matrix:
                            branch_id = NULL    branch_id = Branch A
Counselor (branch A only)       ✅ Yes               ✅ Yes
Counselor (branch B only)       ✅ Yes               ❌ 403
Manager (crm.manage)            ✅ Yes               ✅ Yes
```

**This logic lives in a dedicated `BranchAccessPolicy` service**, injected into lead Use Cases. It must not be duplicated across Use Cases.

### 2.4 Auto-Assign is Round-Robin Within Branch

When a lead arrives via the `PublicLeadFormController` with a `branch_id` (because the landing page is associated with a branch), auto-assignment selects the counselor with the fewest open leads within that branch.

"Open leads" = leads where `assigned_to` = counselor AND stage NOT IN (`admission_confirmed`, `rejected`).

If no counselors are assigned to the branch, the lead is created unassigned. It is not an error.

If `branch_id` is null (landing page not branch-scoped), auto-assignment selects from all counselors across the tenant using the same fewest-open-leads logic.

**Auto-assign does NOT fire for manually created leads.** Manual creation allows explicit assignment or intentional no-assignment.

### 2.5 Stale Lead Definition

A lead is stale when ALL of the following are true:
- Stage is NOT `admission_confirmed` and NOT `rejected`
- No `lead_follow_ups` record with `completed_at IS NULL` (i.e., no pending follow-up scheduled)
- No `lead_notes` record created in the last N days (configurable per tenant, default 5 days)
- No `stage_changed_at` in the last N days

Stale detection runs as a **scheduled command** (`crm:detect-stale-leads`), not real-time. It runs daily. It creates a notification via the Phase 14 `NotificationDispatcher` to the assigned counselor (if any) or the tenant admin (if unassigned).

Stale leads also surface via a **dedicated query endpoint** (`GET /api/tenant-dashboard/crm/leads/stale`) that returns leads meeting the stale criteria. This powers the "Stale Leads" view in the dashboard.

---

## 3. Database Schema

### 3.1 New Table: `branches`

```sql
CREATE TABLE branches (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    tenant_id       BIGINT UNSIGNED NOT NULL,
    name            VARCHAR(150) NOT NULL,
    code            VARCHAR(30) NOT NULL,          -- Short identifier e.g. "HQ", "BR-KL-01"
    address         TEXT NULL,
    phone           VARCHAR(20) NULL,
    email           VARCHAR(150) NULL,
    is_active       TINYINT(1) NOT NULL DEFAULT 1,
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    UNIQUE KEY unq_branches_tenant_code (tenant_id, code),
    INDEX idx_branches_tenant_active (tenant_id, is_active),
    CONSTRAINT fk_branches_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);
```

**Rules:**
- `code` is unique within a tenant. Used for display and import/export identification.
- No MySQL ENUM — `is_active` uses TINYINT(1) per platform convention.
- Soft deletes are NOT used. Deactivation via `is_active = 0` is the lifecycle mechanism.
- A branch with active (non-terminal) leads cannot be deactivated. Enforced at the Use Case layer, not the database layer.

### 3.2 New Table: `user_branch_assignments`

```sql
CREATE TABLE user_branch_assignments (
    id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    tenant_id   BIGINT UNSIGNED NOT NULL,
    user_id     BIGINT UNSIGNED NOT NULL,
    branch_id   BIGINT UNSIGNED NOT NULL,
    assigned_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    assigned_by BIGINT UNSIGNED NULL,              -- user_id of admin who made the assignment

    UNIQUE KEY unq_user_branch (tenant_id, user_id, branch_id),
    INDEX idx_user_branch_tenant (tenant_id, branch_id),
    CONSTRAINT fk_ubr_tenant  FOREIGN KEY (tenant_id)   REFERENCES tenants(id)   ON DELETE CASCADE,
    CONSTRAINT fk_ubr_user    FOREIGN KEY (user_id)     REFERENCES users(id)     ON DELETE CASCADE,
    CONSTRAINT fk_ubr_branch  FOREIGN KEY (branch_id)   REFERENCES branches(id)  ON DELETE CASCADE
);
```

**Rules:**
- A user can be assigned to multiple branches (multi-select at assignment time).
- `assigned_by` is nullable for system-generated assignments.
- Removing a user from a branch does not unassign their existing leads. Existing leads retain the original assignment.

### 3.3 Modify Table: `leads` — Add `branch_id`

```sql
ALTER TABLE leads
    ADD COLUMN branch_id BIGINT UNSIGNED NULL AFTER tenant_id,
    ADD INDEX  idx_leads_branch (tenant_id, branch_id),
    ADD CONSTRAINT fk_leads_branch
        FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL;
```

**Rules:**
- `ON DELETE SET NULL` — if a branch is deleted (which should be blocked by Use Case, but defensively), leads become unscoped rather than orphaned or deleted.
- Existing leads after migration have `branch_id = NULL`. This is correct and expected.
- No backfill required.

### 3.4 Modify Table: `leads` — Add `stage_changed_at`

```sql
ALTER TABLE leads
    ADD COLUMN stage_changed_at TIMESTAMP NULL AFTER stage,
    ADD INDEX  idx_leads_stage_changed (tenant_id, stage_changed_at);
```

This column is set every time `ChangeLeadStageUseCase` runs. It is used by the stale lead detection query to determine recency of pipeline activity.

---

## 4. Domain Layer Changes

### 4.1 New: `BranchEntity`

```php
// app/Domain/TenantAdminDashboard/Branch/Entities/BranchEntity.php

final class BranchEntity
{
    private function __construct(
        private readonly ?int $id,
        private readonly int $tenantId,
        private string $name,
        private BranchCode $code,
        private ?string $address,
        private ?string $phone,
        private ?string $email,
        private bool $isActive,
    ) {}

    public static function create(int $tenantId, string $name, BranchCode $code, ...): self { ... }
    public static function reconstitute(...): self { ... }

    public function deactivate(): void
    {
        // Deactivation guard is enforced at the Use Case layer.
        // The entity itself does not query the database.
        $this->isActive = false;
    }

    public function update(string $name, ?string $address, ?string $phone, ?string $email): void
    {
        $this->name    = $name;
        $this->address = $address;
        $this->phone   = $phone;
        $this->email   = $email;
    }
}
```

**Rule:** `BranchEntity` does NOT check whether active leads exist before deactivation. That guard lives in `DeactivateBranchUseCase`, which queries the repository before calling `deactivate()`.

### 4.2 New: `BranchCode` Value Object

```php
// app/Domain/TenantAdminDashboard/Branch/ValueObjects/BranchCode.php

final class BranchCode
{
    public function __construct(private readonly string $value)
    {
        $trimmed = strtoupper(trim($value));
        if (empty($trimmed) || strlen($trimmed) > 30) {
            throw new \InvalidArgumentException('Branch code must be 1–30 characters.');
        }
        if (!preg_match('/^[A-Z0-9\-_]+$/', $trimmed)) {
            throw new \InvalidArgumentException('Branch code may only contain letters, digits, hyphens, and underscores.');
        }
        $this->value = $trimmed;
    }

    public function value(): string { return $this->value; }
    public function equals(self $other): bool { return $this->value === $other->value; }
}
```

### 4.3 Modified: `LeadEntity` — Add Branch Awareness

Add to `LeadEntity`:

```php
private ?int $branchId;
private ?Carbon $stageChangedAt;
```

- `branchId` is nullable. No guard required on null — it is a valid state.
- `stageChangedAt` is set in the `changeStage()` method alongside the existing stage transition logic.
- No other `LeadEntity` behavior changes.

### 4.4 New: `BranchAccessPolicy` Domain Service

This service answers one question: "Can this user access this lead?"

```php
// app/Domain/TenantAdminDashboard/Branch/Services/BranchAccessPolicy.php

final class BranchAccessPolicy
{
    /**
     * Returns true if the user may read or action the given lead.
     *
     * Rules:
     * - lead.branch_id IS NULL  → always accessible within the tenant
     * - User holds crm.manage   → always accessible (manager override)
     * - User has branch assignment matching lead.branch_id → accessible
     * - Otherwise → false (Use Case must throw 403)
     */
    public function canAccess(
        int $userId,
        array $userCapabilities,
        ?int $leadBranchId,
        array $userBranchIds,   // IDs from user_branch_assignments
    ): bool {
        if ($leadBranchId === null) {
            return true;
        }
        if (in_array('crm.manage', $userCapabilities, true)) {
            return true;
        }
        return in_array($leadBranchId, $userBranchIds, true);
    }
}
```

**This service is pure PHP — no database calls, no Eloquent, no framework dependencies.** The Use Case is responsible for loading the user's branch IDs from the repository before calling this service.

---

## 5. Application Layer — New Use Cases

### 5.1 Branch Use Cases

Located at `app/Application/TenantAdminDashboard/Branch/UseCases/`.

| Use Case | Input | Business Rules |
|---|---|---|
| `CreateBranchUseCase` | tenant_id, name, code, address?, phone?, email? | Code must be unique within tenant. Dispatches `BranchCreated` event. |
| `UpdateBranchUseCase` | branch_id, tenant_id, name, address?, phone?, email? | Code is immutable after creation. Name and contact details are mutable. |
| `DeactivateBranchUseCase` | branch_id, tenant_id | Guard: cannot deactivate if branch has leads with stage NOT IN (`admission_confirmed`, `rejected`). If guard fails, throw `CannotDeactivateBranchWithActiveLeadsException`. |
| `AssignUserToBranchUseCase` | tenant_id, user_id, branch_id[] | Replaces all existing branch assignments for the user with the new list. Atomic operation. |

### 5.2 Modified Lead Use Cases

**`CreateLeadUseCase`** — Add:
- Accept optional `branch_id` parameter.
- Validate `branch_id` exists and belongs to the same `tenant_id`.
- If `branch_id` provided and lead source is `web_form`, trigger auto-assign logic (see §5.3).
- Set `stage_changed_at = now()` on creation.

**`ChangeLeadStageUseCase`** — Add:
- Set `stage_changed_at = now()` on every stage transition.

**`AssignLeadUseCase`** — Add:
- Before assignment, verify the target counselor has a branch assignment matching the lead's `branch_id`.
- If `lead.branch_id IS NULL`, any tenant user may be assigned.
- If mismatch, throw `CounselorNotAssignedToBranchException`.

**`ListLeadsQuery`** — Add:
- Optional `branch_id` filter parameter.
- Branch security enforcement: if requesting user does NOT hold `crm.manage`, automatically scope query to leads where `branch_id IN (user's assigned branch IDs) OR branch_id IS NULL`.
- This scope is NOT optional — it is applied automatically based on the requesting user's branch assignments.

**`GetPipelineSummaryQuery`** — Add:
- Optional `branch_id` filter.
- Returns counts per stage, broken down per branch if no filter supplied and user holds `crm.manage`.

### 5.3 New: Auto-Assign Service

Located at `app/Application/TenantAdminDashboard/LeadManagement/Services/LeadAutoAssignService.php`.

```
Algorithm:
1. Load all active users assigned to the lead's branch (or all tenant counselors if branch_id is null).
2. Filter to users with capability `lead.manage`.
3. For each candidate, count open leads (stage NOT IN admission_confirmed, rejected AND assigned_to = user_id).
4. Select the candidate with the lowest open lead count.
5. If tied, select the one with the oldest last_assignment_at (most recently idle).
6. If no candidates, return null (lead created unassigned).
```

This is a domain service, not a Use Case. It is called from `CreateLeadUseCase` when source is `web_form` and auto-assign is enabled for the tenant (configurable flag on tenant settings — default: true).

### 5.4 New: Stale Lead Detection Command

`app/Console/Commands/DetectStaleLeadsCommand.php` — Artisan command `crm:detect-stale-leads`.

```
Schedule: Daily at 08:00 tenant local time (UTC initially, tenant timezone config is future).

Algorithm per tenant:
1. Load all leads where:
   - stage NOT IN (admission_confirmed, rejected)
   - AND (
       last follow_up note created_at < now() - N days
       OR (no notes exist AND created_at < now() - N days)
     )
   - AND stage_changed_at < now() - N days

2. For each stale lead:
   a. If assigned_to is set → dispatch StaleLeadDetected event with assigned user as recipient.
   b. If unassigned → dispatch StaleLeadDetected event with tenant OWNER as recipient.

3. Deduplicate: use notification_sent_log (Phase 14 infrastructure) to avoid sending the same
   stale alert for the same lead more than once per day.
```

N defaults to 5 days. It must be configurable per tenant via `tenant_settings` table key `crm.stale_lead_days`. The command reads this setting per tenant.

### 5.5 New: `GetStaleLeadsQuery`

Endpoint: `GET /api/tenant-dashboard/crm/leads/stale`

Returns leads meeting the stale criteria for the requesting user's branch scope. Uses the same branch security enforcement as `ListLeadsQuery`. Supports pagination. This powers the "Needs Attention" view in the CRM dashboard.

---

## 6. New Domain Events

All events are dispatched **outside database transactions**, consistent with established platform pattern.

| Event | Dispatched By | Payload |
|---|---|---|
| `BranchCreated` | `CreateBranchUseCase` | branch_id, tenant_id, name, code |
| `BranchUpdated` | `UpdateBranchUseCase` | branch_id, tenant_id, changed fields |
| `BranchDeactivated` | `DeactivateBranchUseCase` | branch_id, tenant_id |
| `LeadAssigned` | `AssignLeadUseCase` | lead_id, tenant_id, branch_id, assigned_to_user_id, assigned_by_user_id |
| `StaleLeadDetected` | `DetectStaleLeadsCommand` | lead_id, tenant_id, branch_id, assigned_to_user_id (nullable), days_stale |

### 6.1 Notification Listeners (Phase 14 Integration)

These listeners use the `NotificationDispatcher` from Phase 14. They live in the Application layer of their respective bounded contexts.

| Listener | Event | Recipient | Channel | Priority |
|---|---|---|---|---|
| `NotifyLeadAssignedListener` | `LeadAssigned` | Assigned counselor | Email + In-App | `default` |
| `NotifyStaleLeadListener` | `StaleLeadDetected` | Assigned counselor or tenant OWNER | Email + In-App | `low` |

**These are the only two new notification types.** Do not add notification listeners for `BranchCreated` or `BranchUpdated` — branch management events are administrative, not user-facing.

---

## 7. API Endpoints

### 7.1 Branch Endpoints

All branch endpoints are under `/api/tenant-dashboard/branches/`.

Middleware chain (same as all tenant dashboard routes):
`tenant.resolve.token → auth:tenant_api → tenant.active → ensure.user.active → tenant.session → tenant.capability:{code}`

| Method | URI | Capability | Controller Action |
|---|---|---|---|
| GET | `/api/tenant-dashboard/branches` | `branch.view` | `BranchReadController@index` |
| GET | `/api/tenant-dashboard/branches/{id}` | `branch.view` | `BranchReadController@show` |
| POST | `/api/tenant-dashboard/branches` | `branch.manage` | `BranchWriteController@store` |
| PUT | `/api/tenant-dashboard/branches/{id}` | `branch.manage` | `BranchWriteController@update` |
| POST | `/api/tenant-dashboard/branches/{id}/deactivate` | `branch.manage` | `BranchWriteController@deactivate` |
| PUT | `/api/tenant-dashboard/users/{userId}/branches` | `branch.manage` | `BranchWriteController@assignUserBranches` |

### 7.2 New/Modified Lead Endpoints

| Method | URI | Change | Capability |
|---|---|---|---|
| GET | `/api/tenant-dashboard/crm/leads` | Add `branch_id` filter; enforce branch scope | `lead.view` |
| POST | `/api/tenant-dashboard/crm/leads` | Add optional `branch_id` field | `lead.manage` |
| GET | `/api/tenant-dashboard/crm/leads/stale` | **NEW** — stale leads list | `lead.view` |
| GET | `/api/tenant-dashboard/crm/pipeline-summary` | Add `branch_id` filter; branch breakdown for managers | `lead.view` |
| GET | `/api/tenant-dashboard/crm/counselors/workload` | **NEW** — open lead count per counselor | `crm.manage` |

### 7.3 New Capability Codes

Add to the tenant capability registry:

| Code | Description | Default Roles |
|---|---|---|
| `branch.view` | View branch list and details | OWNER, ADMIN |
| `branch.manage` | Create, update, deactivate branches; assign users to branches | OWNER, ADMIN |

**`crm.manage` already exists and serves as the cross-branch access override.** Do not add a new capability for this — use what exists.

---

## 8. Request Validation

### 8.1 `StoreBranchRequest`

```
name        required, string, max:150
code        required, string, max:30, regex:/^[A-Z0-9\-_]+$/i, unique:branches,code,NULL,id,tenant_id,{tenant_id}
address     nullable, string, max:500
phone       nullable, string, max:20
email       nullable, email, max:150
```

### 8.2 `StoreLeadRequest` (Modified)

Add:
```
branch_id   nullable, integer, exists:branches,id (scoped to tenant_id in controller)
```

### 8.3 `AssignUserBranchesRequest`

```
branch_ids          required, array
branch_ids.*        integer, exists:branches,id (scoped to tenant_id)
```

---

## 9. Route File

Add a new route file: `routes/tenant_dashboard/branch.php`.

Register it in the route service provider alongside the existing `crm.php`, `lead.php` etc. files.

---

## 10. Security Requirements (Non-Negotiable)

| Requirement | Enforcement Point |
|---|---|
| Branch IDs are validated against `tenant_id` before use | Controller — validate `branch_id` belongs to requesting user's tenant before passing to Use Case |
| Cross-branch lead access returns 403, not 404 | Use Case — throw `UnauthorizedException` when `BranchAccessPolicy::canAccess()` returns false |
| Counselor workload endpoint restricted to `crm.manage` | Middleware capability check |
| Stale lead command deduplicates notifications | `notification_sent_log` table (Phase 14) — keyed on `(lead_id, type, date)` |
| Branch deactivation with active leads is blocked | `DeactivateBranchUseCase` — query before action, throw before persisting |
| Auto-assign is only triggered for `web_form` source | `CreateLeadUseCase` — source type check before calling `LeadAutoAssignService` |

---

## 11. Audit Logging

All branch write operations must be logged to `tenant_audit_logs`. The existing audit log infrastructure handles this. Use the established pattern from other write Use Cases.

| Event | entity_type | action |
|---|---|---|
| Branch created | `Branch` | `branch.created` |
| Branch updated | `Branch` | `branch.updated` |
| Branch deactivated | `Branch` | `branch.deactivated` |
| User assigned to branches | `UserBranchAssignment` | `branch.user_assigned` |
| Lead auto-assigned | `Lead` | `lead.auto_assigned` |

---

## 12. File Manifest (New Files)

```
Domain:
  app/Domain/TenantAdminDashboard/Branch/
    Entities/BranchEntity.php
    Events/BranchCreated.php
    Events/BranchUpdated.php
    Events/BranchDeactivated.php
    Exceptions/BranchNotFoundException.php
    Exceptions/DuplicateBranchCodeException.php
    Exceptions/CannotDeactivateBranchWithActiveLeadsException.php
    Repositories/BranchRepositoryInterface.php
    Services/BranchAccessPolicy.php
    ValueObjects/BranchCode.php

  app/Domain/TenantAdminDashboard/LeadManagement/Events/LeadAssigned.php
  app/Domain/TenantAdminDashboard/LeadManagement/Events/StaleLeadDetected.php
  app/Domain/TenantAdminDashboard/LeadManagement/Exceptions/CounselorNotAssignedToBranchException.php

Application:
  app/Application/TenantAdminDashboard/Branch/UseCases/
    CreateBranchUseCase.php
    UpdateBranchUseCase.php
    DeactivateBranchUseCase.php
    AssignUserToBranchUseCase.php
  app/Application/TenantAdminDashboard/Branch/Queries/
    ListBranchesQuery.php
    GetBranchQuery.php
  app/Application/TenantAdminDashboard/LeadManagement/Services/
    LeadAutoAssignService.php
  app/Application/TenantAdminDashboard/LeadManagement/Queries/
    GetStaleLeadsQuery.php      (new)
    GetCounselorWorkloadQuery.php (new)
  app/Application/TenantAdminDashboard/LeadManagement/Listeners/
    NotifyLeadAssignedListener.php
    NotifyStaleLeadListener.php

Infrastructure:
  app/Infrastructure/Persistence/TenantAdminDashboard/Branch/
    BranchRepository.php
    BranchEloquentModel.php
  app/Infrastructure/Persistence/TenantAdminDashboard/LeadManagement/
    UserBranchAssignmentEloquentModel.php

HTTP:
  app/Http/Controllers/Api/TenantAdminDashboard/Branch/
    BranchReadController.php
    BranchWriteController.php
  app/Http/Requests/TenantAdminDashboard/Branch/
    StoreBranchRequest.php
    UpdateBranchRequest.php
    AssignUserBranchesRequest.php

Console:
  app/Console/Commands/DetectStaleLeadsCommand.php

Database:
  database/migrations/tenant/
    XXXX_create_branches_table.php
    XXXX_create_user_branch_assignments_table.php
    XXXX_add_branch_id_to_leads_table.php
    XXXX_add_stage_changed_at_to_leads_table.php

Routes:
  routes/tenant_dashboard/branch.php
```

### Modified Files

```
app/Domain/TenantAdminDashboard/LeadManagement/Entities/LeadEntity.php
  — Add: branch_id (nullable int)
  — Add: stage_changed_at (nullable Carbon)
  — Modify: changeStage() to set stage_changed_at

app/Application/TenantAdminDashboard/LeadManagement/UseCases/CreateLeadUseCase.php
  — Add: branch_id handling, branch validation, auto-assign trigger

app/Application/TenantAdminDashboard/LeadManagement/UseCases/AssignLeadUseCase.php
  — Add: BranchAccessPolicy check on counselor assignment

app/Application/TenantAdminDashboard/LeadManagement/UseCases/ChangeLeadStageUseCase.php
  — Add: stage_changed_at update on every transition

app/Application/TenantAdminDashboard/LeadManagement/Queries/ListLeadsQuery.php
  — Add: branch_id filter parameter
  — Add: automatic branch security scope based on user's branch assignments

app/Application/TenantAdminDashboard/LeadManagement/Queries/GetPipelineSummaryQuery.php
  — Add: branch_id filter
  — Add: per-branch breakdown for crm.manage holders
```

---

## 13. Quality Gates

All gates must pass before the Phase 15A implementation plan is considered complete. The developer's implementation plan must include verification steps for each gate.

### 13.1 Functional Gates

- [ ] Branch CRUD works end-to-end: create, update, deactivate, list, show
- [ ] Deactivating a branch with active leads returns a clear error (not 500)
- [ ] Leads created with a `branch_id` correctly store and return the branch
- [ ] Leads created without `branch_id` store null and are accessible by all tenant users
- [ ] Auto-assign selects the counselor with the fewest open leads in the correct branch
- [ ] Auto-assign with no eligible counselors creates lead as unassigned (no error)
- [ ] `GetStaleLeadsQuery` returns only leads meeting all stale criteria
- [ ] `DetectStaleLeadsCommand` sends notification to assigned counselor (or OWNER if unassigned)
- [ ] `DetectStaleLeadsCommand` does not send duplicate notifications for the same lead on the same day
- [ ] Counselor workload endpoint returns correct open lead counts per counselor

### 13.2 Security Gates

- [ ] Counselor (Branch A only) cannot read leads belonging to Branch B — returns 403
- [ ] Counselor (Branch A only) cannot assign themselves to a Branch B lead — returns 403
- [ ] User with `crm.manage` can read leads from any branch within the tenant
- [ ] User from Tenant A cannot access branches or leads of Tenant B — returns 404
- [ ] Branch ID submitted in lead creation is validated against the requesting user's tenant
- [ ] Counselor workload endpoint returns 403 for users without `crm.manage`

### 13.3 Architecture Gates

- [ ] `BranchAccessPolicy` has no Eloquent or framework imports — pure PHP
- [ ] `BranchEntity` has no database calls — no Eloquent, no repositories
- [ ] Auto-assign logic lives in `LeadAutoAssignService`, not in the Use Case or Controller
- [ ] Branch security scope in `ListLeadsQuery` is applied automatically, not manually per request
- [ ] Notification listeners use `NotificationDispatcher` — no direct `Mail::send()` calls
- [ ] Stale lead deduplication uses `notification_sent_log` — not a custom lock or flag
- [ ] PHPStan Level 5 passes with zero errors
- [ ] No `env()` calls outside `config/` files
- [ ] Zero regression on existing test suite

### 13.4 Test Coverage Required

| Test Type | Coverage Required |
|---|---|
| Unit tests | `BranchEntity`, `BranchCode`, `BranchAccessPolicy`, `LeadAutoAssignService` — no database |
| Integration tests | All 4 branch Use Cases, modified lead Use Cases, stale lead query |
| Feature tests | All branch API endpoints (auth, capability, tenant isolation), branch security on lead endpoints, stale endpoint |
| Command test | `DetectStaleLeadsCommand` — stale detection logic, deduplication, notification dispatch |

---

## 14. Implementation Sequence (Recommended)

The developer's implementation plan must follow this order. Steps are sequenced to prevent blockers.

| Step | Task | Reason |
|---|---|---|
| S1 | Database migrations (all four) | Everything depends on schema |
| S2 | `BranchCode` value object + `BranchEntity` | Domain first |
| S3 | `BranchRepositoryInterface` + Eloquent implementation | Repository before Use Cases |
| S4 | `BranchAccessPolicy` domain service + unit tests | Security logic must be proven before Use Cases use it |
| S5 | Branch Use Cases (Create, Update, Deactivate, AssignUser) + unit/integration tests | Core branch functionality |
| S6 | Branch Controllers + Requests + Route file | HTTP layer last |
| S7 | `LeadEntity` modifications (branch_id, stage_changed_at) | Extend existing entity |
| S8 | Modified Lead Use Cases (Create, Assign, ChangeStage) | Extend existing Use Cases |
| S9 | Modified Lead Queries (List, PipelineSummary) + branch security scope | Security-critical — verify with tests |
| S10 | `LeadAutoAssignService` + integration into `CreateLeadUseCase` | Depends on S8 |
| S11 | `GetStaleLeadsQuery` + `GetCounselorWorkloadQuery` | New read paths |
| S12 | Domain events (LeadAssigned, StaleLeadDetected) + notification listeners | Event-driven side effects last |
| S13 | `DetectStaleLeadsCommand` + schedule registration | Depends on S12 |
| S14 | Full test pass + PHPStan | Gate verification |

---

## 15. Definition of Done

Phase 15A is complete when:

1. The implementation plan has been reviewed and approved by the Principal Engineer.
2. All code is implemented per the approved plan.
3. All quality gates in §13 pass.
4. A Principal Engineer audit confirms zero Critical or Architectural findings.
5. All findings from the audit are resolved before any merge.
6. End-to-end verification: web form lead arrives → auto-assigned to correct branch counselor → counselor cannot see Branch B leads → stale lead command fires notification after N days → no duplicate notification on day 2.
7. The Phase 15A Completion Report is signed off.

---

## 16. What Phase 15B Will Build

Phase 15B is scoped separately and will not begin until Phase 15A is complete and audited.

Phase 15B scope:
- Meta Lead Ads webhook integration (per-tenant Facebook page OAuth, webhook fan-out, signature verification)
- WhatsApp Business API outbound automation (per-tenant phone number registration, template-based messaging, delivery receipt webhooks)

Phase 15B has external dependencies (Meta App Review, WhatsApp number verification) that are outside development control. Phase 15A has no such dependencies.

---

*End of Document — UBOTZ 2.0 Phase 15A Developer Instructions — March 17, 2026*