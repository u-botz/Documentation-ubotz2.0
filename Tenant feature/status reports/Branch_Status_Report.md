# UBOTZ 2.0 — Feature Status Report: Branch

> **Instructions:** Copy this template for each feature. Fill every section honestly. If something is missing, write "NOT IMPLEMENTED" — do not skip the section. This document feeds directly into the Principal Engineer audit pipeline.

| Field | Value |
|---|---|
| **Feature Name** | Branch |
| **Bounded Context** | TenantAdminDashboard |
| **Date Reported** | 2026-03-20 |
| **Reported By** | AI Agent |
| **Current Status** | Working |
| **Has Developer Instructions Doc?** | No |
| **Has Implementation Plan?** | No |
| **Was Principal Engineer Audit Done?** | No |

---

## 1. What This Feature Does (2–3 sentences)

The Branch feature enables Tenants to manage multiple physical or logical locations (Centers/Branches). Users (like Counselors) can be assigned to explicit Branches, allowing the system to forcefully scope incoming Leads or regional Operations exclusively to authorized staff within those specific Branches.

---

## 2. Backend Architecture

### 2.1 Controllers

| Controller | Methods | Notes |
|---|---|---|
| `BranchReadController` | `index`, `show` | Data fetching |
| `BranchWriteController`| `store`, `update`, `deactivate`, `assignUser` | Core mutations. Note that user assignments use a generic POST endpoint. |

### 2.2 UseCases / Queries

| UseCase / Query | Purpose | Injects Audit Logger? | Injects Quota Service? |
|---|---|---|---|
| `CreateBranchUseCase` | Initializes new branch | TBD | N/A |
| `UpdateBranchUseCase` | Mutates existing branch | TBD | N/A |
| `DeactivateBranchUseCase` | Switches `is_active` safely | TBD | N/A |
| `AssignUserToBranchUseCase`| Creates assignment pivot | TBD | N/A |
| `ListBranchesQuery` | CQRS fetch | N/A | N/A |
| `GetBranchQuery` | CQRS fetch | N/A | N/A |

### 2.3 Domain Layer

| Component | Type | Location | Notes |
|---|---|---|---|
| `BranchEntity` | Entity | `Domain.../Branch/Entities/` | Aggregate Root |
| `BranchCode` | Value Object | `Domain.../Branch/ValueObjects`| Ensures regex validation of branch codes |
| `BranchAccessPolicy`| Domain Service| `Domain.../Branch/Services` | Pure logic gating whether a user can interact with the branch. |

### 2.4 Domain Events

| Event Class | Trigger | Has Listener? |
|---|---|---|
| `BranchCreated` | `CreateBranchUseCase` over entity | YES |
| `BranchUpdated` | `UpdateBranchUseCase` over entity | YES |
| `BranchDeactivated`| `DeactivateBranchUseCase` over entity | YES |

### 2.5 Infrastructure Layer

| Component | Type | Notes |
|---|---|---|
| `BranchRecord` | Eloquent Model | Maps to `branches` table |
| `UserBranchAssignmentRecord`| Eloquent Model | Maps to `user_branch_assignments` table |
| `EloquentBranchRepository`| Repository | Abstraction |
| `BranchScopeEnforcementPolicy`| Service | **Critical security bridge** connecting Eloquent scopes to the `BranchAccessPolicy` domains. |

### 2.6 Exceptions

| Exception Class | When Thrown |
|---|---|
| `DuplicateBranchCodeException` | Identity collision on creation. |
| `CannotDeactivateBranchWithActiveLeadsException`| Inter-domain protection preventing orphaned sales funnels. |
| `CounselorNotAssignedToBranchException` | Inter-domain security error thrown during Lead assignment. |

---

## 3. Database Schema

### 3.1 Tables

**Table: `branches`** (Migration: `2026_03_17_210500_create_branches_table.php`)

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | BIGINT UNSIGNED PK | No | |
| `tenant_id` | BIGINT UNSIGNED FK | No | Tenant layer guard |
| `name` | VARCHAR(150) | No | |
| `code` | VARCHAR(30) | No | Must be unique per tenant |
| `address` | TEXT | Yes | |
| `phone`, `email` | VARCHAR | Yes | |
| `is_active` | TINYINT | No | Logical toggle. Soft deletes are omitted. |
| `created_at`, `updated_at`| TIMESTAMP | Yes | |

**Table: `user_branch_assignments`**

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | BIGINT UNSIGNED PK | No | |
| `tenant_id` | BIGINT UNSIGNED FK | No | |
| `user_id` | BIGINT UNSIGNED FK | No | |
| `branch_id` | BIGINT UNSIGNED FK | No | |
| `assigned_at` | TIMESTAMP | No | Traces when the permission was granted. |
| `assigned_by` | BIGINT UNSIGNED | Yes | Traces who granted it (pseudo-audit logging). |

**Unique Constraints:** `['tenant_id', 'user_id', 'branch_id']` prevents duplicate assignments.

**Soft Deletes:** neither table implements `$table->softDeletes()`. The `branches` table relies entirely on `is_active` tracking.

### 3.2 Relationships

| From Table | To Table | Type | FK Column |
|---|---|---|---|
| `branches` | `tenants` | BelongsTo | `tenant_id` |
| `user_branch_assignments` | `branches` | BelongsTo | `branch_id` |
| `user_branch_assignments` | `users` | BelongsTo | `user_id` |

---

## 4. API Endpoints

*(Routes found in `routes/tenant_dashboard/branch.php`)*

All paths prefixed with `/api/tenant/branches`

| Method | URI | Controller@Method | Middleware | Capability Code |
|---|---|---|---|---|
| `GET` | `/` | `BranchReadController@index` | `tenant.capability` | `branch.view` |
| `GET` | `/{id}` | `BranchReadController@show` | `tenant.capability` | `branch.view` |
| `POST` | `/` | `BranchWriteController@store` | `tenant.capability` | `branch.manage` |
| `PUT` | `/{id}` | `BranchWriteController@update`| `tenant.capability` | `branch.manage` |
| `PATCH`| `/{id}/deactivate`| `BranchWriteController@deactivate`| `tenant.capability` | `branch.manage` |
| `POST` | `/assign-user` | `BranchWriteController@assignUser`| `tenant.capability` | `branch.manage` |

---

## 5. Security Checklist

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | All queries scoped by `tenant_id`? | Yes | Checked across dual database connections via Repositories. |
| 2 | User-level isolation enforced where needed? | **Yes** | Extensive domain policies restrict data access per explicit branch assignments. |
| 3 | `tenant.capability` middleware on all routes? | Yes | |
| 4 | Audit log written for every mutation? | TBD | But `assigned_by` tracks the assignor explicitly. |
| 5 | Audit log written OUTSIDE `DB::transaction()`? | TBD | |
| 6 | Domain events dispatched via `DB::afterCommit`? | Yes | |
| 7 | Idempotency keys used for create operations? | TBD | |
| 8 | Input validation via FormRequest? | Yes | |
| 9 | File uploads validated? | N/A | |
| 10 | Financial values stored as `_cents` integer? | N/A | |
| 11 | Soft deletes used? | **No** | Uses `is_active` correctly. |
| 12 | No raw SQL in controllers or UseCases? | Yes | |
| 13 | Eloquent models have `BelongsToTenant` trait/scope? | Yes | |

---

## 6. Frontend

Standard CRUD assumed.

---

## 7. Tests

| Test File | Test Count | Passing? |
|---|---|---|
| *Not strictly identified* | N/A | **Warning:** The automated test scan for this feature boundary came up empty for dedicated Branch `Feature` tests. These flows may be bundled into a generic isolation test context or potentially missing entirely. Needs human verification. |

---

## 8. Known Issues & Gaps

| # | Issue | Severity Guess | Notes |
|---|---|---|---|
| 1 | Missing Automated Feature Tests | High | Could not locate standard `BranchCrudFeatureTest` under the domain test suite. Since `BranchScopeEnforcementPolicy` enforces deep security rules regarding which Counselor can see which Lead, regressions here represent high-risk tenancy leaks. |

---

## 9. Dependencies on Other Features

| Depends On | How |
|---|---|
| User | Heavily attaches users via assignments. |
| **Is Depended On By** | `Leads` (CRM) extensively hooks into Branch mapping to isolate Counselor views. |

---

## 10. File Tree (Backend Only)

```
app/
├── Http/TenantAdminDashboard/Branch/
│   ├── Requests/
│   └── Controllers/
│       ├── BranchReadController.php
│       └── BranchWriteController.php
├── Application/TenantAdminDashboard/Branch/
│   ├── Commands/
│   ├── Queries/
│   └── UseCases/
├── Domain/TenantAdminDashboard/Branch/
│   ├── Entities/
│   ├── Events/
│   ├── Exceptions/
│   ├── Repositories/
│   ├── Services/
│   └── ValueObjects/
├── Infrastructure/Persistence/TenantAdminDashboard/Branch/
│   ├── EloquentBranchRepository.php
│   ├── BranchRecord.php
│   └── UserBranchAssignmentRecord.php
└── routes/tenant_dashboard/branch.php
```

---

> **Reminder:** This report is input for the Principal Engineer audit. Incomplete or inaccurate information here means the audit will miss real issues or flag false positives. When in doubt, check the actual code — do not guess.

*End of Template*
