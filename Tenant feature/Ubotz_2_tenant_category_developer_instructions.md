# UBOTZ 2.0 — Tenant Category Developer Instructions

## Phase: TC-1 (Tenant Category Foundation)

| Field | Value |
|---|---|
| **Document Type** | Developer Instructions |
| **Phase** | TC-1 (standalone mini-phase) |
| **Date** | March 29, 2026 |
| **Author** | Principal Engineer (Architecture Auditor) |
| **Prerequisites** | Phase 10A (RBAC infrastructure) COMPLETE, Phase 11A (subscription plans) COMPLETE |
| **Estimated Effort** | 1–2 working days |
| **Blocking Dependency For** | Subscription plan catalog filtering, tenant provisioning accuracy |

---

## 1. Mission Statement

Introduce a **Tenant Category** classification to the platform. Every tenant is categorized as one of three business model types: `offline_institution`, `edtech`, or `standalone_teacher`. This category controls which subscription plans are available to the tenant and how role seeding behaves during provisioning. The category is **immutable after tenant creation** and is **assigned by a Platform Admin during provisioning**.

This is NOT the same as Institution Type (`institution_types` table / `institution_type_id` FK), which is a subject-domain label (SSC coaching, language school, etc.) and has no functional impact on features or plans.

---

## 2. Business Context

### 2.1 Two Classification Axes

The platform has two independent classification dimensions for tenants:

| Axis | Purpose | Storage | Controls | Mutable? |
|---|---|---|---|---|
| **Tenant Category** (NEW) | Business model / operational mode | `tenant_category` VARCHAR on `tenants` table | Plan catalog filtering, role seeding profile | **Immutable** after creation |
| **Institution Type** (EXISTS) | Subject vertical label | `institution_type_id` FK on `tenants` table → `institution_types` table | Nothing functional — metadata for analytics, categorization, landing page templates | Mutable (metadata) |

These two axes must never be conflated. A tenant's category determines *how* it operates; its institution type describes *what* it teaches.

### 2.2 The Three Tenant Categories

| Category | Slug | Description | Role Seeding Profile | Typical Plan Surface |
|---|---|---|---|---|
| **Offline Institution** | `offline_institution` | Physical coaching center, school, or training institute with classrooms, staff, and in-person operations | **Full** — Owner, Admin, Teacher, Staff, Student, Parent | All modules available depending on plan: CRM, branches, timetable, student billing, LMS |
| **EdTech** | `edtech` | Online-first digital education platform selling courses, quizzes, and subscriptions to students | **Full** — Owner, Admin, Teacher, Staff, Student, Parent | Same as offline — plan controls what's visible. Emphasis on LMS, digital delivery, online payments |
| **Standalone Teacher** | `standalone_teacher` | Single individual selling courses online — no staff, no branches, no student billing | **Reduced** — Owner + Student only | Plan enforces: low `max_users`, CRM/branches/timetable/student billing modules disabled |

### 2.3 Key Product Decisions (Locked)

- Standalone Teacher tenants have **no staff hierarchy**. The owner IS the teacher. No Admin, Teacher, Staff, or Parent roles are seeded.
- If a Standalone Teacher outgrows the model and needs staff, they must create a new tenant as `edtech`. The category is immutable — this is a deliberate product constraint, not a technical limitation.
- Category is assigned by **Platform Admin** during tenant provisioning. It is NOT self-selected by the tenant during registration.
- Category is **never changeable** after creation — not by the tenant owner, not by Platform Admin. Immutability is enforced at the domain entity level.

---

## 3. Non-Negotiable Business Rules

| Rule ID | Rule | Implementation Notes |
|---|---|---|
| BR-01 | Every tenant MUST have a `tenant_category` value. No null, no default. | `VARCHAR(30) NOT NULL` — no default value. Provisioning use case must supply it. |
| BR-02 | Valid categories are exactly: `offline_institution`, `edtech`, `standalone_teacher`. No other values accepted. | PHP backed enum `TenantCategory`. VARCHAR with application-layer validation (no MySQL ENUM per platform standard). |
| BR-03 | `tenant_category` is **immutable** after tenant creation. No update endpoint, no setter, no migration path. | `TenantEntity` must reject any attempt to change category after initial assignment. No `setCategory()` method — only constructor assignment. |
| BR-04 | Platform Admin assigns the category during tenant provisioning. | `CreateTenantUseCase` (or equivalent provisioning use case) must accept `tenant_category` as a required parameter. |
| BR-05 | Standalone Teacher tenants are provisioned with **only Owner and Student** system roles. | `ProvisionDefaultRolesListener` must check `tenant_category` and conditionally seed roles. |
| BR-06 | Offline Institution and EdTech tenants are provisioned with the **full** system role set (Owner, Admin, Teacher, Staff, Student, Parent). | No change from current behavior for these categories. |
| BR-07 | Subscription plans may be scoped to a specific tenant category. A plan with `tenant_category = 'standalone_teacher'` is only visible/assignable to standalone teacher tenants. | `subscription_plans` table gets a `tenant_category` column (nullable). NULL = available to all categories. |
| BR-08 | A plan CANNOT be assigned to a tenant whose category does not match the plan's `tenant_category` (when non-null). | Enforced in `AssignSubscriptionPlanUseCase` (or equivalent). Domain-level validation, not just query filtering. |
| BR-09 | The tenant provisioning audit log MUST record the assigned `tenant_category`. | Existing audit log metadata extended — no new table. |
| BR-10 | Existing tenants in the database MUST be backfilled with a `tenant_category` value before the column becomes NOT NULL. | Migration uses a two-step approach: add nullable → backfill → alter to NOT NULL. |
| BR-11 | Tenant Category and Institution Type are independent. Changing institution type does NOT affect tenant category, and vice versa. | No FK relationship, no validation coupling, no shared logic. |

---

## 4. Domain Model

### 4.1 New Value Object: `TenantCategory`

**Location:** `app/Domain/SuperAdminDashboard/Tenant/ValueObjects/TenantCategory.php`

```php
enum TenantCategory: string
{
    case OFFLINE_INSTITUTION = 'offline_institution';
    case EDTECH = 'edtech';
    case STANDALONE_TEACHER = 'standalone_teacher';

    /**
     * Returns the role codes that should be seeded for this category.
     */
    public function roleSeedingProfile(): array
    {
        return match ($this) {
            self::OFFLINE_INSTITUTION,
            self::EDTECH => ['owner', 'admin', 'teacher', 'staff', 'student', 'parent'],
            self::STANDALONE_TEACHER => ['owner', 'student'],
        };
    }

    /**
     * Human-readable label for admin UI.
     */
    public function label(): string
    {
        return match ($this) {
            self::OFFLINE_INSTITUTION => 'Offline Institution',
            self::EDTECH => 'EdTech',
            self::STANDALONE_TEACHER => 'Standalone Teacher',
        };
    }
}
```

**Architecture notes:**
- This is a PHP 8.1+ backed enum — the single source of truth for valid tenant categories.
- The `roleSeedingProfile()` method keeps provisioning logic in the domain, not scattered across listeners.
- The database column is `VARCHAR(30)` per platform standard (no MySQL ENUM).

### 4.2 Modified Entity: `TenantEntity`

**Location:** `app/Domain/SuperAdminDashboard/Tenant/Entities/TenantEntity.php`

The developer must add:
- A `tenantCategory` property of type `TenantCategory` (the value object above).
- The property is set via constructor or a factory method during creation.
- There is NO setter method for `tenantCategory`. Immutability is enforced by omission.
- Any reconstruction from persistence (e.g., `fromRecord()`) hydrates the category from the stored string value via `TenantCategory::from()`.

### 4.3 Modified DTO: `TenantData`

**Location:** `app/Domain/SuperAdminDashboard/Tenant/DTOs/TenantData.php`

Add `public readonly TenantCategory $tenantCategory` as a required property. This DTO is used by the provisioning use case.

---

## 5. Database Schema

### 5.1 Migration 1: Add `tenant_category` to `tenants` Table

**File:** `database/migrations/central/2026_03_29_100001_add_tenant_category_to_tenants_table.php`

**Strategy:** Two-step migration. First add as nullable, then a second migration (or a seeder) backfills existing tenants, then a third migration makes it NOT NULL.

```
Step 1: ALTER TABLE tenants ADD COLUMN tenant_category VARCHAR(30) NULL AFTER institution_type_id;
Step 2: UPDATE tenants SET tenant_category = 'edtech' WHERE tenant_category IS NULL;
Step 3: ALTER TABLE tenants MODIFY tenant_category VARCHAR(30) NOT NULL;
```

**Index:** Add `idx_tenants_category` on `tenant_category` for plan catalog filtering queries.

**Important:** The backfill value `'edtech'` is chosen because existing test/demo tenants are online-first. The developer MUST confirm with the platform owner if any existing tenants should be `offline_institution` instead. If all existing tenants are test data, `edtech` is a safe default.

### 5.2 Migration 2: Add `tenant_category` to `subscription_plans` Table

**File:** `database/migrations/central/2026_03_29_100002_add_tenant_category_to_subscription_plans_table.php`

```
ALTER TABLE subscription_plans ADD COLUMN tenant_category VARCHAR(30) NULL AFTER status;
```

- **NULL means the plan is available to all tenant categories.** This is the default — existing plans remain universally available until explicitly scoped.
- **Index:** Add `idx_subscription_plans_tenant_category` on `tenant_category`.
- **No FK to a lookup table.** The value is validated at the application layer via `TenantCategory` enum. This follows the platform standard of VARCHAR + PHP enum (no MySQL ENUM, no unnecessary lookup tables for fixed enums).

### 5.3 No New Tables

This phase creates no new tables. Both changes are column additions to existing tables.

---

## 6. API Design

### 6.1 Modified Endpoint: Create Tenant

**Existing endpoint** (verify exact path — likely `POST /api/admin/tenants`):

Add `tenant_category` as a **required** field in the request body.

**Request body addition:**
```json
{
  "tenant_category": "standalone_teacher"
}
```

**Validation rules:**
```
'tenant_category' => ['required', 'string', new Enum(TenantCategory::class)]
```

**Response:** Include `tenant_category` in the tenant response object. Display the human-readable label in `tenant_category_label`.

### 6.2 Modified Endpoint: Get Tenant / List Tenants

Add `tenant_category` and `tenant_category_label` to all tenant response DTOs.

Add `tenant_category` as a **filterable** parameter on the tenant list endpoint:
```
GET /api/admin/tenants?tenant_category=standalone_teacher
```

### 6.3 Modified Endpoint: List Subscription Plans (Tenant-Facing)

When a tenant views available plans (for self-service plan browsing, if applicable), the query MUST filter by the tenant's category:

```sql
SELECT * FROM subscription_plans
WHERE status = 'active'
AND (tenant_category = :tenantCategory OR tenant_category IS NULL)
```

This ensures a standalone teacher never sees plans designed for offline institutions.

### 6.4 Modified Endpoint: Assign Subscription Plan

The `AssignSubscriptionPlanUseCase` (or equivalent) MUST validate category compatibility:

```
IF plan.tenant_category IS NOT NULL
AND plan.tenant_category != tenant.tenant_category
THEN throw PlanCategoryMismatchException
```

This is a **domain-level guard**, not just a query filter. Even if someone crafts a direct API call, the assignment is rejected.

### 6.5 Modified Endpoint: Create / Update Subscription Plan

Add `tenant_category` as an **optional** field when creating or editing a plan:

```json
{
  "tenant_category": "standalone_teacher"
}
```

**Validation:** `['nullable', 'string', new Enum(TenantCategory::class)]`

When null, the plan is available to all categories. When set, only tenants of that category can be assigned this plan.

### 6.6 No New Endpoints

This phase creates no new API endpoints. All changes are modifications to existing endpoints.

---

## 7. Application Layer Use Cases

### 7.1 Modified: `CreateTenantUseCase`

**Changes:**
1. Accept `TenantCategory` as a required parameter (via `TenantData` DTO).
2. Pass it to `TenantEntity` constructor.
3. Persist `tenant_category` to the database.
4. Include `tenant_category` in the `TenantCreated` domain event payload.

### 7.2 Modified: `ProvisionDefaultRolesListener`

**Current behavior:** Seeds all 6 system roles (owner, admin, teacher, staff, student, parent) for every new tenant.

**New behavior:**
1. Read `tenant_category` from the `TenantCreated` event payload.
2. Call `TenantCategory::from($category)->roleSeedingProfile()` to get the list of role codes to seed.
3. Filter the `config('tenant.default_roles')` array to only include roles whose `code` is in the seeding profile.
4. Seed only those roles and their corresponding capabilities.

**Critical:** The `TenantCreated` event MUST carry the `tenantCategory` field. The developer must verify the event class and add this field if missing.

### 7.3 Modified: `AssignSubscriptionPlanUseCase`

**Changes:**
1. After loading the plan and the tenant, check category compatibility.
2. If `plan.tenant_category !== null && plan.tenant_category !== tenant.tenant_category`, throw a new `PlanCategoryMismatchException`.
3. This check happens BEFORE any subscription record creation.

### 7.4 Modified: `CreateSubscriptionPlanUseCase` / `UpdateSubscriptionPlanUseCase`

**Changes:**
1. Accept optional `tenant_category` field.
2. Validate via `TenantCategory` enum (or null).
3. Persist to `subscription_plans.tenant_category`.

---

## 8. New Exception

### `PlanCategoryMismatchException`

**Location:** `app/Domain/SuperAdminDashboard/Subscription/Exceptions/PlanCategoryMismatchException.php`

```php
class PlanCategoryMismatchException extends DomainException
{
    public function __construct(string $planCategory, string $tenantCategory)
    {
        parent::__construct(
            "Plan is restricted to '{$planCategory}' tenants but tenant is '{$tenantCategory}'."
        );
    }
}
```

**HTTP mapping:** 422 Unprocessable Entity. Error code: `PLAN_CATEGORY_MISMATCH`.

---

## 9. Domain Events

### Modified: `TenantCreated`

Add `tenantCategory` (string) to the event payload. The `ProvisionDefaultRolesListener` reads this to determine the role seeding profile.

No new domain events are introduced.

---

## 10. Decision Records

| # | Decision | Rationale | Alternatives Rejected |
|---|---|---|---|
| DR-01 | Tenant category stored as VARCHAR(30), validated by PHP enum | Platform standard — no MySQL ENUMs. Consistent with `TenantStatus`, `PlanStatus`, etc. | MySQL ENUM (banned), lookup table (unnecessary for a fixed 3-value enum) |
| DR-02 | Category is immutable — no setter, no update endpoint | Prevents mid-lifecycle category changes that would invalidate the role seeding profile and plan assignments. A standalone teacher with 2 roles cannot become an offline institution expecting 6 roles without reprovisioning. | Allowing Platform Admin to change (creates orphan role/capability state) |
| DR-03 | `subscription_plans.tenant_category` is nullable (NULL = all categories) | Allows existing plans to remain universally available without a data migration to tag them all. New plans can be category-scoped. | Required field with a default (forces a backfill decision for existing plans), separate pivot table (over-engineered for 3 values) |
| DR-04 | Role seeding profile lives in `TenantCategory` value object, not in config | The seeding profile is a domain invariant — which roles a category seeds is a product decision, not a deployment configuration. Keeping it in the enum makes it impossible to accidentally misconfigure. | `config/tenant.php` array (too easy to drift from product intent), separate service (unnecessary abstraction for a pure function) |
| DR-05 | Category assignment by Platform Admin only, not self-service | The category determines plan visibility and provisioning behavior. Allowing tenants to self-select could lead to incorrect categorization (e.g., a coaching center picking "standalone teacher" to see cheaper plans). | Self-service during registration (gaming risk), auto-detection (no reliable signal) |
| DR-06 | Backfill existing tenants as `edtech` | Existing tenants are test/demo data with full role sets, which matches the edtech profile. No production customers exist yet. | Leave nullable (violates BR-01), backfill as offline_institution (less accurate for current test data) |

---

## 11. Explicit Exclusions

| # | What Is Excluded | Why | When It Should Be Built |
|---|---|---|---|
| EX-01 | Different onboarding flows per category | Not needed — category is assigned by Platform Admin, not self-selected | If self-service registration is ever introduced |
| EX-02 | Category-specific dashboard layouts | Plan's module entitlements already control sidebar visibility | Never — capability system handles this |
| EX-03 | Category-specific middleware or route groups | Plan enforcement via `EnforceTenantCapability` already handles access control | Never — capability system handles this |
| EX-04 | Category change workflow (upgrade standalone → edtech) | Immutability is a deliberate product constraint. New tenant must be created. | Only if a strong business case emerges for tenant migration |
| EX-05 | Retroactive role seeding when category changes | N/A — category does not change | N/A |
| EX-06 | Frontend changes to tenant provisioning form | Frontend will need a dropdown, but this document covers backend only. Frontend work is a separate task. | Immediately after this phase — can be a 1-ticket frontend addition |
| EX-07 | Seeder for category-specific subscription plans | Plan creation is a Platform Admin operation. This phase adds the column and validation; actual plan data is created by the admin. | When the first real subscription plans are defined per category |

---

## 12. Blocking Quality Gates

### Security & Data Safety Gates (BLOCKING)

- [ ] `tenant_category` is NOT NULL on all rows in `tenants` table after migration
- [ ] No tenant can be created without a `tenant_category` value (400/422 on missing field)
- [ ] Invalid category values are rejected (validation test with arbitrary strings)
- [ ] `tenant_category` cannot be updated after creation (no PUT/PATCH modifies it)
- [ ] Standalone teacher provisioning seeds exactly 2 roles: `owner` and `student`
- [ ] Offline institution provisioning seeds exactly 6 roles: `owner`, `admin`, `teacher`, `staff`, `student`, `parent`
- [ ] EdTech provisioning seeds exactly 6 roles (same as offline institution)
- [ ] Plan with `tenant_category = 'standalone_teacher'` cannot be assigned to an `edtech` tenant
- [ ] Plan with `tenant_category = NULL` can be assigned to any tenant category
- [ ] Category mismatch returns 422 with error code `PLAN_CATEGORY_MISMATCH`

### Architecture Gates (BLOCKING)

- [ ] PHPStan Level 5: zero new errors
- [ ] All existing tests pass (zero regression)
- [ ] `TenantCategory` value object is in Domain layer (`Domain/SuperAdminDashboard/Tenant/ValueObjects/`)
- [ ] `PlanCategoryMismatchException` is in Domain layer
- [ ] No `env()` calls in new code: `grep -rn 'env(' app/ routes/ database/` → 0 results
- [ ] Domain layer has zero new `Illuminate` imports
- [ ] Audit log for tenant creation includes `tenant_category` in metadata

### Test Requirements (Minimum 15 new tests)

- [ ] Unit: `TenantCategory` enum — all 3 values valid, `from()` rejects invalid strings
- [ ] Unit: `TenantCategory::roleSeedingProfile()` returns correct role codes per category
- [ ] Unit: `TenantEntity` — category is set on creation, no setter exists
- [ ] Feature: Create tenant with `tenant_category = 'standalone_teacher'` → only owner + student roles seeded
- [ ] Feature: Create tenant with `tenant_category = 'edtech'` → all 6 roles seeded
- [ ] Feature: Create tenant with `tenant_category = 'offline_institution'` → all 6 roles seeded
- [ ] Feature: Create tenant without `tenant_category` → 422 validation error
- [ ] Feature: Create tenant with invalid `tenant_category` → 422 validation error
- [ ] Feature: Assign category-scoped plan to matching tenant → success
- [ ] Feature: Assign category-scoped plan to non-matching tenant → 422 `PLAN_CATEGORY_MISMATCH`
- [ ] Feature: Assign category-null plan to any tenant → success
- [ ] Feature: List plans filtered by tenant category returns only matching + null plans
- [ ] Feature: Tenant response includes `tenant_category` and `tenant_category_label`
- [ ] Feature: Tenant list filterable by `tenant_category`
- [ ] Integration: Full provisioning flow — standalone teacher tenant created, plan assigned, roles verified

---

## 13. Implementation Sequence

| Step | Task | Depends On |
|---|---|---|
| 1 | Create `TenantCategory` value object | — |
| 2 | Migration: Add `tenant_category` to `tenants` (nullable) | Step 1 |
| 3 | Backfill existing tenants with `'edtech'` | Step 2 |
| 4 | Migration: Alter `tenant_category` to NOT NULL | Step 3 |
| 5 | Migration: Add `tenant_category` to `subscription_plans` (nullable) | Step 1 |
| 6 | Modify `TenantEntity` — add category property, constructor assignment, no setter | Step 1 |
| 7 | Modify `TenantData` DTO — add required `tenantCategory` field | Step 1 |
| 8 | Modify `TenantCreated` event — add `tenantCategory` to payload | Step 7 |
| 9 | Modify `CreateTenantUseCase` — accept and persist `tenant_category` | Steps 6, 7, 8 |
| 10 | Modify `ProvisionDefaultRolesListener` — conditional role seeding | Steps 8, 1 |
| 11 | Create `PlanCategoryMismatchException` | — |
| 12 | Modify `AssignSubscriptionPlanUseCase` — category compatibility check | Steps 5, 11 |
| 13 | Modify `CreateSubscriptionPlanUseCase` / `UpdateSubscriptionPlanUseCase` — accept `tenant_category` | Step 5 |
| 14 | Modify create tenant form request — add `tenant_category` validation | Step 1 |
| 15 | Modify tenant response DTOs — include category fields | Step 6 |
| 16 | Modify plan list query — filter by tenant category | Step 5 |
| 17 | Write tests | Steps 1–16 |
| 18 | Run full test suite + PHPStan | Step 17 |

---

## 14. Risk Register

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| R1 | Existing tests break because `CreateTenantUseCase` now requires `tenant_category` | **HIGH** | Every test that calls the create tenant flow must be updated to pass a valid `tenant_category`. Run full test suite early in Step 17. |
| R2 | `ProvisionDefaultRolesListener` change breaks existing tenant provisioning tests | **HIGH** | The listener must still work correctly for full-seeding categories. Test all three categories explicitly. |
| R3 | Backfill value `'edtech'` is incorrect for some existing tenants | **LOW** | No real customers exist. Confirm with platform owner. If needed, update specific tenants via a targeted SQL update before the NOT NULL migration runs. |
| R4 | `TenantCreated` event payload change breaks existing event listeners | **MEDIUM** | Adding a new field to an event payload is backward-compatible — existing listeners ignore unknown fields. The developer must verify that no listener destructures the event in a way that breaks on new fields. |
| R5 | Plan assignment use case not found at expected location | **LOW** | The developer must search the codebase for the actual use case name (likely `AssignPlanToTenantUseCase` or `ChangeTenantPlanUseCase`). Multiple use cases may need the category guard. |

---

## 15. File Manifest

### New Files (~3)

| # | Path | Purpose |
|---|---|---|
| 1 | `app/Domain/SuperAdminDashboard/Tenant/ValueObjects/TenantCategory.php` | Tenant category enum value object |
| 2 | `app/Domain/SuperAdminDashboard/Subscription/Exceptions/PlanCategoryMismatchException.php` | Domain exception for category mismatch on plan assignment |
| 3 | `database/migrations/central/2026_03_29_100001_add_tenant_category_to_tenants_table.php` | Migration: add + backfill + NOT NULL |

### Modified Files (~10-12)

| # | Path | Change |
|---|---|---|
| 1 | `database/migrations/central/2026_03_29_100002_add_tenant_category_to_subscription_plans_table.php` | New migration file for subscription_plans column |
| 2 | `app/Domain/SuperAdminDashboard/Tenant/Entities/TenantEntity.php` | Add `tenantCategory` property |
| 3 | `app/Domain/SuperAdminDashboard/Tenant/DTOs/TenantData.php` | Add `tenantCategory` field |
| 4 | `app/Domain/SuperAdminDashboard/Tenant/Events/TenantCreated.php` | Add `tenantCategory` to payload |
| 5 | `app/Application/SuperAdminDashboard/Tenant/UseCases/CreateTenantUseCase.php` | Accept and persist category |
| 6 | `app/Application/SuperAdminDashboard/Tenant/Listeners/ProvisionDefaultRolesListener.php` | Conditional role seeding |
| 7 | `app/Application/SuperAdminDashboard/Subscription/UseCases/AssignSubscriptionPlanUseCase.php` (or equivalent) | Category compatibility guard |
| 8 | `app/Application/SuperAdminDashboard/Subscription/UseCases/CreateSubscriptionPlanUseCase.php` | Accept optional `tenant_category` |
| 9 | `app/Application/SuperAdminDashboard/Subscription/UseCases/UpdateSubscriptionPlanUseCase.php` | Accept optional `tenant_category` |
| 10 | Create tenant form request (verify exact path) | Add `tenant_category` validation rule |
| 11 | Tenant response transformer/resource (verify exact path) | Include `tenant_category` + label |
| 12 | Subscription plan response transformer/resource (verify exact path) | Include `tenant_category` |

### New Test Files (~2)

| # | Path | Purpose |
|---|---|---|
| 1 | `tests/Unit/Domain/Tenant/ValueObjects/TenantCategoryTest.php` | Unit tests for the enum and seeding profile |
| 2 | `tests/Feature/TenantCategory/TenantCategoryProvisioningTest.php` | Feature tests for category-aware provisioning and plan assignment |

---

## 16. Handbook Update Required

After this phase is complete, the Product Handbook section `05_Tenant_Model/TENANT_VARIANTS.md` must be updated to reflect:

1. The old terminology (`ONLINE`, `OFFLINE`, `HYBRID`) is superseded by `edtech`, `offline_institution`, `standalone_teacher`.
2. The `Tenant.Mode` ENUM reference is replaced by `tenant_category VARCHAR(30)` on the `tenants` table.
3. The Tenant Category controls plan visibility and role seeding — not sidebar module visibility directly (that's the plan's job).
4. Institution Type (`institution_type_id`) remains a separate, independent classification axis.

This handbook update is a documentation task, not a code task. It should be done after implementation is verified.
