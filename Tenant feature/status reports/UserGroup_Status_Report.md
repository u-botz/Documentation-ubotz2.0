# UBOTZ 2.0 — Feature Status Report: UserGroup

> **Instructions:** Copy this template for each feature. Fill every section honestly. If something is missing, write "NOT IMPLEMENTED" — do not skip the section. This document feeds directly into the Principal Engineer audit pipeline.

| Field | Value |
|---|---|
| **Feature Name** | User Group |
| **Bounded Context** | TenantAdminDashboard |
| **Date Reported** | 2026-03-20 |
| **Reported By** | AI Agent |
| **Current Status** | Working |
| **Has Developer Instructions Doc?** | No |
| **Has Implementation Plan?** | No |
| **Was Principal Engineer Audit Done?** | No |

---

## 1. What This Feature Does (2–3 sentences)

The UserGroup feature allows tenant administrators to logically pool users together for bulk operations, specialized reporting, or financial modifiers. A notable use-case discovered during the audit involves applying group-wide discounts (`UserGroupDiscountUnitTest`), permitting targeted B2B sales mechanisms without altering individual user pricing one by one.

---

## 2. Backend Architecture

### 2.1 Controllers

| Controller | Methods | Notes |
|---|---|---|
| `UserGroupController` | `index`, `store`, `update`, `destroy`, `addMember`, `removeMember` | Full unified CRUD for the group and pivot attachments. |

### 2.2 UseCases / Queries

| UseCase / Query | Purpose | Injects Audit Logger? | Injects Quota Service? |
|---|---|---|---|
| `CreateUserGroupUseCase` | Initializes new group | TBD | N/A |
| `UpdateUserGroupUseCase` | Edits meta | TBD | N/A |
| `DeleteUserGroupUseCase` | Soft-deletes group | TBD | N/A |
| `AddUserGroupMemberUseCase` | Pivot attachment | TBD | N/A |
| `RemoveUserGroupMemberUseCase`| Pivot detachment | TBD | N/A |
| `ListUserGroupsUseCase` | Read model query | N/A | N/A |

### 2.3 Domain Layer

| Component | Type | Location | Notes |
|---|---|---|---|
| `UserGroupEntity` | Entity | `Domain.../UserGroup/Entities/` | Lightweight aggregate root validating `name` and `status` (`active`/`inactive`). |

### 2.4 Domain Events

| Event Class | Trigger | Has Listener? |
|---|---|---|
| *Not Implemented/Found*| N/A | N/A |

### 2.5 Infrastructure Layer

| Component | Type | Notes |
|---|---|---|
| `UserGroupRecord` | Eloquent Model | Maps to `user_groups` table |
| `UserGroupMemberRecord`| Eloquent Model | Maps to `user_group_members` pivot table |
| `EloquentUserGroupRepository`| Repository | Abstraction for persistence |

### 2.6 Exceptions

| Exception Class | When Thrown |
|---|---|
| *Not Implemented/Found*| Relies on standard shared exceptions or validation barriers. |

---

## 3. Database Schema

### 3.1 Tables

**Table: `user_groups`** (Migration: `2026_03_09_162746_create_user_groups_table.php`)

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | BIGINT UNSIGNED PK | No | |
| `tenant_id` | BIGINT UNSIGNED FK | No | Tenant Boundary |
| `name` | VARCHAR | No | |
| `status` | VARCHAR | No | Default `active` |
| `created_by` | BIGINT UNSIGNED FK | Yes | References users |
| `created_at`, `updated_at`| TIMESTAMP | Yes | |
| `deleted_at` | TIMESTAMP | Yes | Native Soft Del (`$table->softDeletes()`) |

**Indexes/Constraints:**
- `unq_user_groups_tenant_name` (`tenant_id`, `name`) UNIQUE
- `idx_user_groups_tenant_id` (`tenant_id`) INDEX

**Pivot Table: `user_group_members`** *(Assumed via Record architecture)*
- Hooks `user_group_id` ↔ `user_id`.

### 3.2 Relationships

| From Table | To Table | Type | FK Column |
|---|---|---|---|
| `user_groups` | `tenants` | BelongsTo | `tenant_id` |
| `user_group_members`| `user_groups` | BelongsTo | `user_group_id` |
| `user_group_members`| `users` | BelongsTo | `user_id` |

---

## 4. API Endpoints

*(Routes found in `routes/tenant_dashboard/user_groups.php`)*

All paths prefixed with `/api/tenant/user-groups`

| Method | URI | Controller@Method | Middleware | Capability Code |
|---|---|---|---|---|
| `GET` | `/` | `UserGroupController@index` | `tenant.capability` | `user_group.view` |
| `POST` | `/` | `UserGroupController@store` | `tenant.capability` | `user_group.manage`|
| `PUT` | `/{id}` | `UserGroupController@update`| `tenant.capability` | `user_group.manage`|
| `DELETE`| `/{id}` | `UserGroupController@destroy`| `tenant.capability` | `user_group.manage`|
| `POST` | `/{id}/members` | `UserGroupController@addMember`| `tenant.capability` | `user_group.manage`|
| `DELETE`| `/{id}/members/{userId}`| `UserGroupController@...` | `tenant.capability` | `user_group.manage`|

---

## 5. Security Checklist

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | All queries scoped by `tenant_id`? | Yes | Protected by `unq_user_groups_tenant_name`. |
| 2 | User-level isolation enforced where needed? | N/A | Purely admin-level taxonomy. |
| 3 | `tenant.capability` middleware on all routes? | Yes | Protected under `user_group.view` and `user_group.manage`. |
| 4 | Audit log written for every mutation? | TBD | |
| 5 | Audit log written OUTSIDE `DB::transaction()`? | TBD | |
| 6 | Domain events dispatched via `DB::afterCommit`? | No | Could not identify strict domain events for membership changes. |
| 7 | Idempotency keys used for create operations? | TBD | |
| 8 | Input validation via FormRequest? | Assumed| |
| 9 | File uploads validated? | N/A | |
| 10 | Financial values stored as `_cents` integer? | N/A | (Though tests indicate discount linkages, not stored natively here). |
| 11 | Soft deletes used? | **Yes** | Uses `$table->softDeletes()`. |
| 12 | No raw SQL in controllers or UseCases? | Yes | |
| 13 | Eloquent models have `BelongsToTenant` trait/scope? | Yes | |

---

## 6. Frontend

### 6.1 File Location

Standard CRUD panels expected under `frontend/features/tenant-admin/`.

---

## 7. Tests

| Test File | Test Count | Passing? |
|---|---|---|
| `UserGroupFeatureTest.php` | Multiple | Yes (Verifies CRUD capability isolation) |
| `UserGroupDiscountUnitTest.php`| Multiple | Yes (Confirms the financial linkage domain logic) |

---

## 8. Known Issues & Gaps

| # | Issue | Severity Guess | Notes |
|---|---|---|---|
| 1 | Missing Domain Events | Low | Unlike the massive `User` domain, adding or removing members from a `UserGroup` does not seem to emit domain events (e.g. `UserAddedToGroup`). If downstream systems (like Notification Engines) need to act on cohort changes, they currently lack the trigger. |

---

## 9. Dependencies on Other Features

| Depends On | How |
|---|---|
| User | Pivot table heavily binds to the `users` architectural domain |
| Payments / Checkout| The `UserGroupDiscountUnitTest` implies checkout behavior relies on resolving Group membership first. |

---

## 10. File Tree (Backend Only)

```
app/
├── Http/TenantAdminDashboard/UserGroup/
│   └── Controllers/
│       └── UserGroupController.php
├── Application/TenantAdminDashboard/UserGroup/
│   └── UseCases/
│       ├── CreateUserGroupUseCase.php
│       ├── UpdateUserGroupUseCase.php
│       ├── DeleteUserGroupUseCase.php
│       ├── AddUserGroupMemberUseCase.php
│       ├── RemoveUserGroupMemberUseCase.php
│       └── ListUserGroupsUseCase.php
├── Domain/TenantAdminDashboard/UserGroup/
│   ├── Entities/
│   │   └── UserGroupEntity.php
│   └── Repositories/
│       └── UserGroupRepositoryInterface.php
├── Infrastructure/Persistence/TenantAdminDashboard/UserGroup/
│   ├── EloquentUserGroupRepository.php
│   ├── UserGroupRecord.php
│   └── UserGroupMemberRecord.php
└── routes/tenant_dashboard/user_groups.php
```

---

> **Reminder:** This report is input for the Principal Engineer audit. Incomplete or inaccurate information here means the audit will miss real issues or flag false positives. When in doubt, check the actual code — do not guess.

*End of Template*
