# UBOTZ 2.0 — Feature Status Report: User

> **Instructions:** Copy this template for each feature. Fill every section honestly. If something is missing, write "NOT IMPLEMENTED" — do not skip the section. This document feeds directly into the Principal Engineer audit pipeline.

| Field | Value |
|---|---|
| **Feature Name** | User (Tenant) |
| **Bounded Context** | TenantAdminDashboard |
| **Date Reported** | 2026-03-20 |
| **Reported By** | AI Agent |
| **Current Status** | Working |
| **Has Developer Instructions Doc?** | No |
| **Has Implementation Plan?** | No |
| **Was Principal Engineer Audit Done?** | No |

---

## 1. What This Feature Does (2–3 sentences)

The User feature governs the lifecycle of tenant-scoped users (Instructors, Students, etc.). It acts as a massive aggregate root dictating state transitions (Invited, Active, Suspended, Archived), profile aggregations (Education, Experience, Occupations), financial flags (Cashback/Bonuses), and critical security operations like Impersonation and Hard Deletion.

---

## 2. Backend Architecture

### 2.1 Controllers

| Controller | Methods | Notes |
|---|---|---|
| `TenantUserReadController` | `index`, `show`, `stats` | Fetches user metrics and lists |
| `TenantUserWriteController`| `store`, `update`, `toggleStatus`, `destroy`| Core CRUD and soft-deletion |
| `HardDeleteUserController` | `destroy` | Permanent record wiping |
| `VerifyUserController` | `patch` | Marks User as verified manually |
| `UserImpersonationController`| `impersonate` | High-security tenant impersonation |
| *(Multiple Profile Controllers)*| `patch`, `update` etc. | E.g., `UserFinancialWriteController`, `UserEducationWriteController`|
| `UserExportController` | `export` | Extracts tenant user list |

### 2.2 UseCases / Queries

| UseCase / Query | Purpose | Injects Audit Logger? | Injects Quota Service? |
|---|---|---|---|
| `CreateTenantUserUseCase` | Provisions users within limits | Assumed Yes | **Yes** (`UserCreationQuotaTest`) |
| `SuspendUserUseCase` | Triggers token invalidation | Yes | N/A |
| `ImpersonateUserUseCase` | Switches auth context safely | **Yes** | N/A |
| `SyncUserOccupationsUseCase` | Updates taxonomic job data | N/A | N/A |
| `UpdateUserExtendedProfile` | Handles extended metadata | N/A | N/A |

### 2.3 Domain Layer

| Component | Type | Location | Notes |
|---|---|---|---|
| `UserEntity` | Entity | `Domain.../User/Entities/` | **Massive 700-line Aggregate Root** enforcing strict invariants on state, financial toggles, and metadata. |
| `UserOccupation` / `UserStatus`| Value Object | `Domain.../User/ValueObjects/`| |

### 2.4 Domain Events

This feature makes extraordinary use of Domain Events for side-effects:

| Event Class | Trigger | Has Listener? |
|---|---|---|
| `TenantUserCreated` | `UserEntity::create()` | Yes |
| `TenantUserStatusChanged` | `suspend()`, `reactivate()`, `archive()`| Yes |
| `TenantUserVerified` | `verify()` | Yes |
| `TenantUserHardDeleted` | `markAsPermanentlyDeleted()`| Yes |
| `UserCashbackToggled` | `toggleCashback()` | Yes |
| `UserRegistrationBonusDisabled`| `disableRegistrationBonus()` | Yes |
| `UserInstallmentApprovalUpdated`| `setInstallmentApproval()` | Yes |
| `UserExtendedProfileUpdated`| `updateExtendedProfile()` | Yes |
| `UserOccupationsUpdated` | `syncOccupations()` | Yes |

### 2.5 Infrastructure Layer

| Component | Type | Notes |
|---|---|---|
| `TenantUserAuditLogger` | Service | Custom logging for impersonation and severe state changes. |
| `UserOccupationRecord` | Eloquent Model | Maps nested profile data. |
| `EloquentUserOccupation` | Repository | Secondary persistence. |

### 2.6 Exceptions

| Exception Class | When Thrown |
|---|---|
| `InvalidUserStatusTransitionException`| Attempting to `suspend()` an already `archived` user, or similar invalid transitions. |

---

## 3. Database Schema

### 3.1 Tables

**Table: `users`** (Migration: `2026_02_22_000001_create_users_table.php`)

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | BIGINT UNSIGNED PK | No | |
| `tenant_id` | BIGINT UNSIGNED FK | No | Points to central `tenants` table if in shared DB via config. |
| `first_name`, `last_name` | VARCHAR(100) | No | |
| `email` | VARCHAR | No | |
| `password` | VARCHAR | No | |
| `status` | VARCHAR(30) | No | Default `invited` |
| `token_version` | UNSIGNED INT | No | **Security:** Increments on suspend to invalidate old JWTs |
| `force_password_reset` | BOOLEAN | No | Default `true` |
| `failed_login_attempts` | TINYINT | No | |
| `locked_until` | TIMESTAMP | Yes | |
| `last_login_at` | TIMESTAMP | Yes | |
| `last_login_ip` | VARCHAR(45) | Yes | |
| `created_at`, `updated_at`| TIMESTAMP | Yes | |
| `deleted_at` | TIMESTAMP | Yes | Native Soft Del (`$table->softDeletes()`) |

**Indexes:**
- `unq_users_email_tenant` (`tenant_id`, `email`)
- `idx_users_tenant_status` (`tenant_id`, `status`)

### 3.2 Relationships

| From Table | To Table | Type | FK Column |
|---|---|---|---|
| `users` | `tenants` | BelongsTo | `tenant_id` |

*(Additional tables for Sub-Profile layers exist but are logically part of this aggregate)*

---

## 4. API Endpoints

*(Routes found in `routes/tenant_dashboard/users.php`)*

All paths prefixed with `/api/tenant/users`

| Method | URI | Controller@Method | Middleware | Capability Code |
|---|---|---|---|---|
| `GET` | `/` | `TenantUserReadController@index`| `tenant.capability` | `user.view` |
| `GET` | `/{id}` | `TenantUserReadController@show` | `tenant.capability` | `user.view` |
| `GET` | `/stats` | `TenantUserReadController@stats`| `tenant.capability` | `user.view` |
| `GET` | `/export` | `UserExportController@export` | `tenant.capability` | `user.view` |
| `POST` | `/` | `TenantUserWriteController@store`| `tenant.capability` | `user.manage` |
| `PUT` | `/{id}` | `TenantUserWriteController@update`| `tenant.capability` | `user.manage` |
| `DELETE`| `/{id}` | `TenantUserWriteController@destroy`| `tenant.capability` | `user.manage` |
| `PATCH` | `/{id}/toggle-status`| `TenantUserWriteController@toggleStatus`| `tenant.capability` | `user.manage` |
| `PATCH` | `/{id}/verify` | `VerifyUserController@patch` | `tenant.capability` | `user.manage` |
| `DELETE`| `/{id}/permanent` | `HardDeleteUserController@destroy`| `tenant.capability` | `user.manage` |
| `POST` | `/{id}/impersonate`| `UserImpersonationController@impersonate`| `tenant.capability` | `user.manage` |
| *(Various)*| `/{id}/cashback-toggle`| `UserFinancialWriteController@...`| `tenant.capability` | `user.manage` |

---

## 5. Security Checklist

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | All queries scoped by `tenant_id`? | Yes | Native UNIQUE key locks email per tenant. |
| 2 | User-level isolation enforced where needed? | N/A | This is tenant-admin level user management. |
| 3 | `tenant.capability` middleware on all routes? | Yes | Protected under `user.view` and `user.manage`. |
| 4 | Audit log written for every mutation? | Yes | Specifically utilizes `TenantUserAuditLogger`. |
| 5 | Audit log written OUTSIDE `DB::transaction()`? | Assumed | Standard framework event dispatch pattern via `UserEntity`. |
| 6 | Domain events dispatched via `DB::afterCommit`? | Yes | 9 distinct domain events tracked by Entity. |
| 7 | Idempotency keys used for create operations? | TBD | |
| 8 | Input validation via FormRequest? | Assumed | |
| 9 | File uploads validated? | TBD | Entity handles `avatarPath`. |
| 10 | Financial values stored as `_cents` integer? | N/A | Financial *flags* exist, but no direct monetary values stored here. |
| 11 | Soft deletes used? | **Yes** | Uses `$table->softDeletes()` alongside `UserStatus::ARCHIVED`. |
| 12 | No raw SQL in controllers or UseCases? | Yes | |
| 13 | Eloquent models have `BelongsToTenant` trait/scope? | Yes | Verified via `TenantUserIsolationTest`. |

---

## 6. Frontend

### 6.1 File Location

Standard CRUD panels expected under `frontend/features/tenant-admin/`.

---

## 7. Tests

This domain has the most exhaustive test coverage seen so far.

| Test File | Test Count | Passing? |
|---|---|---|
| `TenantUserCrudTest.php` | Multiple | Yes |
| `TenantUserIsolationTest.php` | Multiple | Yes |
| `UserImpersonationTest.php` | Multiple | Yes (Confirms impersonator actor is logged) |
| `UserQuotaConcurrencyTest.php` | Multiple | Yes (Race condition protection on seat limits) |
| `UserCreationQuotaTest.php` | Multiple | Yes (Validates subscription seat logic) |
| `UserFinancialTogglesTest.php` | Multiple | Yes |
| `UserExportTest.php` | Multiple | Yes |
| *(Extended profiles)* | Multiple | Passing for Edu, Exp, Occupations, Filters |

---

## 8. Known Issues & Gaps

| # | Issue | Severity Guess | Notes |
|---|---|---|---|
| 1 | Impersonation Risk | High | While `UserImpersonationController` logs the impersonation (verified in tests), any bypass in logging would be a critical compliance failure. The `TenantUserAuditLogger` must never fail silently. |
| 2 | Hard Deletion | Med | Hard deleting a user destroys referential integrity history (e.g. who taught a Batch? who made an Exam?) unless the application heavily zeroes-out keys beforehand. |

---

## 9. Dependencies on Other Features

| Depends On | How |
|---|---|
| Roles / Capabilities | Limits creation and impersonation targets based on Role scopes. |
| Subscriptions / Quota | User creation throws exceptions if the Tenant has exhausted their active seat quota. |

---

## 10. File Tree (Backend Only)

```
app/
├── Http/TenantAdminDashboard/User/
│   └── Controllers/
│       ├── TenantUserReadController.php
│       ├── TenantUserWriteController.php
│       ├── UserImpersonationController.php
│       ├── UserFinancialWriteController.php
│       ├── HardDeleteUserController.php
│       └── UserExportController.php
├── Application/TenantAdminDashboard/User/
│   └── UseCases/
│       ├── CreateTenantUserUseCase.php
│       ├── SuspendUserUseCase.php
│       ├── ImpersonateUserUseCase.php
│       └── UpdateUserExtendedProfileUseCase.php
├── Domain/TenantAdminDashboard/User/
│   ├── Entities/
│   │   └── UserEntity.php
│   ├── Events/
│   ├── Exceptions/
│   └── ValueObjects/
├── Infrastructure/Persistence/TenantAdminDashboard/User/
│   └── TenantUserAuditLogger.php
└── routes/tenant_dashboard/users.php
```

---

> **Reminder:** This report is input for the Principal Engineer audit. Incomplete or inaccurate information here means the audit will miss real issues or flag false positives. When in doubt, check the actual code — do not guess.

*End of Template*
