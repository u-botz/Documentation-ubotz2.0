# UBOTZ 2.0 — Feature Status Report: Tenant Provisioning

> **Instructions:** Copy this template for each feature. Fill every section honestly. If something is missing, write "NOT IMPLEMENTED" — do not skip the section. This document feeds directly into the Principal Engineer audit pipeline.

| Field | Value |
|---|---|
| **Feature Name** | Tenant Provisioning (Organization creation, subscription assignment, initial owner setup, capability grants) |
| **Bounded Context** | Tenant Management (SuperAdminDashboard / Platform) |
| **Date Reported** | 2026-03-23 |
| **Reported By** | AI Agent (verified in source) |
| **Current Status** | Working — core provisioning, onboarding, idempotent creation, event-driven module assignments |
| **Has Developer Instructions Doc?** | N/A |
| **Has Implementation Plan?** | N/A |
| **Was Principal Engineer Audit Done?** | No |

---

## 1. What This Feature Does (2–3 sentences)

The **Tenant Provisioning** feature enables L4+ Platform Super Admins to create new tenant organizations in a single, atomic operation. It coordinates creating the core tenant record with a unique slug, attaching an initial subscription plan, creating the first `owner` user account, and dispatching event-driven listeners to provision default roles (RBAC) and module entitlements (e.g., website/LMS access).

---

## 2. Backend Architecture

### 2.1 Controllers

| Controller | Methods | Notes |
|---|---|---|
| `App\Http\Controllers\Api\SuperAdminDashboard\Tenant\TenantWriteController` | `store` | Primary provisioning endpoint. Maps form data into `CreateTenantCommand` and `ProvisionOnboardingInput`. Handles exceptions like `TenantSlugAlreadyExistsException` and returns 201 Created or 200 OK (if idempotent). |
| `App\Http\Controllers\Api\SuperAdminDashboard\Tenant\TenantWriteController` | `updateStatus`, `updateInstitutionType` | Handles updates post-provisioning. |
| `App\Http\Controllers\Api\SuperAdminDashboard\Tenant\TenantReadController` | `index`, `show`, `stats` | Lists provisioned tenants and aggregate stats. |

### 2.2 UseCases / Queries

| UseCase / Query | Purpose | Injects Audit Logger? |
|---|---|---|
| `ProvisionTenantWithOnboardingUseCase` | Master orchestrator. Runs CreateTenant, AssignSubscription, and CreateTenantUser in sequence. Derives subscription idempotency keys securely from parent key. | N/A (Delegates) |
| `CreateTenantUseCase` | Handles raw tenant insertion, slug validation, and idempotency checks. Generates `TenantCreated` domain event. | Yes (`tenant.created`) |
| `AssignSubscriptionToTenantUseCase` | Sets up the billing cycle, plan ID, and optional payment skip logic for the new tenant. | Yes |
| `CreateTenantUserUseCase` | Creates the first tenant user (the owner) and attaches them to the `owner` role. | Yes |

### 2.3 Domain Layer

| Component | Type | Location | Notes |
|---|---|---|---|
| `TenantEntity` | Entity | `Domain/SuperAdminDashboard/Tenant/Entities/` | Aggregate root representing the organization. |
| `TenantProvisioningService` | Domain Service | `Domain/SuperAdminDashboard/Tenant/Services/` | Validates domain invariants (e.g., slug availability). |
| `ProvisionOnboardingInput` | Value Object | `Application/SuperAdminDashboard/Tenant/Commands/` | Holds onboarding credentials (owner password, plan ID). |
| `CreateTenantResult` | DTO | `Application/SuperAdminDashboard/Tenant/Results/` | Returns tenant entity + idempotency boolean. |
| `ProvisionTenantOnboardingResult`| DTO | `Application/SuperAdminDashboard/Tenant/Results/` | Aggregates results from tenant, sub, and user creation. |

### 2.4 Domain Events & Listeners

| Event Class | Trigger | Listeners Triggered |
|---|---|---|
| `TenantCreated` | Fired via `DB::afterCommit` in `CreateTenantUseCase` | `ProvisionDefaultRolesListener`, `CreateTenantConfigListener`, `NotifyTenantProvisionedListener`, `GrantDefaultModulesOnProvisioningListener` |
| `SubscriptionPlanAssigned` | Fired when the onboarding subscription is created | `EnsureDefaultTenantWebsiteSettingsListener` |

*(Note: `GrantDefaultModulesOnProvisioningListener` atomically grants modules like `module.website` and bootstraps `TenantWebsiteSettings` so new tenants resolve template queries seamlessly.)*

### 2.5 Infrastructure Layer

| Component | Type | Notes |
|---|---|---|
| `TenantRecord` | Eloquent Model | Maps to `tenants` table. Handles `HasFactory`, `SoftDeletes`. |
| `TenantIdempotencyKeyRecord` | Eloquent Model | Maps to `tenant_idempotency_keys` table. Ensures duplicate provision requests are safely ignored. |
| `EloquentTenantRepository` | Repository | Implements `TenantRepositoryInterface`. Handles `findByIdempotencyKey` and `save`. |

### 2.6 Exceptions

| Exception Class | When Thrown |
|---|---|
| `TenantSlugAlreadyExistsException` | Requested URL slug is already taken globally. |
| `DuplicateTenantUserEmailException` | The provided owner email already exists across the platform. |
| `SubscriptionPlanNotFoundException` | The selected sub plan ID is invalid. |
| `DuplicateTenantProvisioningException` | (If strict idempotency was structurally bypassed). |

---

## 3. Database Schema

### 3.1 Tables

**Table: `tenants`**

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | BIGINT UNSIGNED PK | No | |
| `name` | VARCHAR(255) | No | Organization Name |
| `slug` | VARCHAR(255) | No | Unique globally |
| `status` | VARCHAR(50) | No | `active`, `suspended`, `pending` |
| `institution_type_id` | BIGINT UNSIGNED FK | Yes | Associates tenant w/ specific B2B type (e.g., Coaching) |
| `contact_email`, `phone` | VARCHAR | Yes | |
| `deleted_at` | TIMESTAMP | Yes | **Soft Deletes enabled** |
| `created_at`, `updated_at` | TIMESTAMP | Yes | |

**Table: `tenant_idempotency_keys`**

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | BIGINT UNSIGNED PK | No | |
| `idempotency_key` | VARCHAR(255) | No | Unique idempotency string from client |
| `tenant_id` | BIGINT UNSIGNED FK | No | |
| `created_at`, `updated_at` | TIMESTAMP | Yes | |

*(Additional cascading tables created during provisioning: `tenant_users`, `subscriptions`, `module_entitlement_overrides`, `tenant_website_settings`, `roles`).*

---

## 4. API Endpoints

| Method | URI | Controller@Method | Middleware | Capability Code |
|---|---|---|---|---|
| `POST` | `/api/platform/tenants` | `TenantWriteController@store` | `admin.authority:60`, `admin.authority.max:69` | (Super Admin Level Access Required) |
| `PATCH`| `/api/platform/tenants/{id}/status` | `TenantWriteController@updateStatus` | `admin.authority:60` | |
| `PATCH`| `/api/platform/tenants/{id}/institution-type`| `TenantWriteController@updateInstitutionType`| `admin.authority:80` | |

---

## 5. Security Checklist

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | All queries scoped by `tenant_id`? | N/A | Sub-records are; `tenants` table itself is platform-level. |
| 2 | `tenant.capability` middleware on all routes? | N/A | Uses platform `admin.authority` gating instead of tenant caps. |
| 3 | Audit log written for every mutation? | Yes | `CreateTenantUseCase` initiates `adminAuditLogger->log()`. |
| 4 | Audit log written OUTSIDE `DB::transaction()`? | False | Currently logged *inside* the transaction block before commit. |
| 5 | Domain events dispatched via `DB::afterCommit`? | Yes | `TenantCreated` is properly deferred. |
| 6 | Idempotency keys used for create operations? | Yes | `X-Idempotency-Key` is parsed and checked via `TenantIdempotencyKeyRecord`. |
| 7 | Input validation via FormRequest? | Yes | `ProvisionTenantRequest` validates slugs, emails, and passwords. |

---

## 6. Frontend

### 6.1 File Location

```
frontend/features/tenants/components/
frontend/app/super-admin-dashboard/tenants/
frontend/services/tenant-service.ts
```

### 6.2 Components

| Component | Purpose | Notes |
|---|---|---|
| `provision-tenant-form.tsx` (Dialog) | Provision Tenant Form | Handles complex state merging for Tenant, User, and Subscription data. Auto-generates slugs from names. |
| `tenant-list.tsx` | UI Table | Renders the provisioned tenants mapped from the API. |

### 6.3 API Hooks

| Hook / Service Call | Endpoint | Notes |
|---|---|---|
| `tenantService.provisionTenant` | `POST /api/platform/tenants` | Generates a UUID `idempotencyKey` on the client. Resolves 200 (Idempotent success) or 201 (Created). |

### 6.4 Capability-Based UI Gating

Visible to L4 (Super Admin) levels. Navigation rendering checks `authInt >= 60 && authInt < 80` + `authInt >= 90` to render the tenant management tabs.

---

## 7. Tests

| Test File | Status | Notes |
|---|---|---|
| `tests/Feature/Tenancy/TenantProvisioningTest.php` | Passing | Asserts atomic success, role creation, and email duplication rejection. |
| `tests/Feature/Tenancy/TenantOnboardingWorkflowTest.php` | Passing | Asserts the workflow integrates successfully with subscriptions. |

---

## 8. Known Issues & Gaps

| # | Issue | Severity Guess | Notes |
|---|---|---|---|
| 1 | Passwords printed in debugging/logs | Low | If `ProvisionOnboardingInput` is aggressively serialized in logger. |
| 2 | React-Hook-Form strict numeric mapping | Low | Native select `<option>` elements occasionally parse to string, requiring explicit `Number()` casting in frontend `validate` rules. FIXED on 2026-03-23. |
| 3 | Audit log written inside transaction | Medium | If transaction fails post-audit-log insert, audit trail is rolled back. Should ideally be written outside or via distinct connection. |

---

## 9. Dependencies on Other Features

| Depends On | How |
|---|---|
| Identity & Access | Platform admins provision tenants; Initial tenant user and roles must be generated. |
| Subscription / Billing | Requires assigning an initial tier (Starter, Pro, etc.) to gate tenant limits. |
| Module Entitlements | Upon creation, the tenant needs default modules (like `module.website`) injected to unlock features. |

---

## 10. File Tree (Backend Only)

```
app/
├── Http/Controllers/Api/SuperAdminDashboard/Tenant/
│   ├── TenantWriteController.php
│   └── TenantReadController.php
├── Application/SuperAdminDashboard/Tenant/
│   ├── Commands/
│   │   ├── CreateTenantCommand.php
│   │   ├── ProvisionOnboardingInput.php
│   │   ├── UpdateTenantInstitutionTypeCommand.php
│   │   └── UpdateTenantStatusCommand.php
│   ├── Results/
│   │   ├── CreateTenantResult.php
│   │   └── ProvisionTenantOnboardingResult.php
│   ├── UseCases/
│   │   ├── CreateTenantUseCase.php
│   │   ├── ProvisionTenantWithOnboardingUseCase.php
│   │   ├── UpdateTenantInstitutionTypeUseCase.php
│   │   └── UpdateTenantStatusUseCase.php
│   └── Listeners/
│       ├── GrantDefaultModulesOnProvisioningListener.php
│       ├── NotifyTenantProvisionedListener.php
│       └── ProvisionDefaultRolesListener.php
├── Domain/SuperAdminDashboard/Tenant/
│   ├── Entities/TenantEntity.php
│   ├── Events/TenantCreated.php
│   ├── Exceptions/TenantSlugAlreadyExistsException.php
│   ├── Repositories/TenantRepositoryInterface.php
│   ├── Services/TenantProvisioningService.php
│   └── ValueObjects/TenantSlug.php
└── Infrastructure/SuperAdminDashboard/Tenant/
    ├── Models/
    │   ├── TenantRecord.php
    │   └── TenantIdempotencyKeyRecord.php
    └── Repositories/EloquentTenantRepository.php
```
