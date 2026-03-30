# UBOTZ 2.0 — Phase 12D Developer Instructions

## Module Entitlement Middleware Activation

| Field | Value |
|---|---|
| **Document Type** | Developer Instruction (Pre-Implementation Brief) |
| **Phase** | 12D |
| **Date** | March 18, 2026 |
| **Issued By** | Principal Engineer / Architecture Auditor |
| **Audience** | Implementation Developer |
| **Expected Deliverable** | Phase 12D Implementation Plan (same format as 10A–12C plans) |
| **Prerequisites** | Phase 10A–10D COMPLETE (RBAC infrastructure + capability middleware), Phase 11A–11B COMPLETE (subscription plans + module entitlement domain layer), Phase 12A–12C COMPLETE (payment integration) |
| **Estimated Effort** | 1–2 working days |

> **The module entitlement domain layer exists. The resolver works. The checker works. The middleware class exists. But the middleware is not registered and not applied to any route. This means the platform's product tiering — the ability to sell different feature sets at different price points — has no independent enforcement layer. It works today by accident, piggybacking on the capability checker's internal implementation. Phase 13A (Landing Pages) will be the first feature where tenants routinely lack module access. Before that happens, the enforcement must be explicit, independently testable, and returning actionable error messages. This phase makes that real.**

---

## 1. Mission Statement

Phase 12D activates the `EnforceModuleEntitlement` middleware that already exists in the codebase but is neither registered as a route middleware alias nor applied to any route group. After this phase, every tenant route group is wrapped in a `tenant.module` middleware that independently verifies the tenant's subscription plan includes the required module — before any RBAC capability check runs.

**What this phase does:**
- Registers `tenant.module` alias in `bootstrap/app.php`
- Applies `tenant.module:{module_code}` to every tenant route group at the route-file level
- Verifies the middleware returns a distinct `MODULE_NOT_AVAILABLE` error code (not `INSUFFICIENT_CAPABILITY`)
- Updates the `EnforceTenantCapability` middleware pipeline position documentation
- Writes denial tests proving module enforcement works independently of capability checks
- Documents the module-to-route-file mapping as a reference for all future phases

**What this phase does NOT do:**
- No new domain layer code (the entitlement resolver, checker, and value objects already exist)
- No new migrations (module columns on plans and subscriptions already exist)
- No changes to `ModuleCapabilityMap`, `ModuleEntitlementResolver`, or `EloquentTenantModuleEntitlementChecker`
- No frontend changes (frontend module gating is a Phase 13A concern)
- No new module codes added to `ModuleCode` value object
- No changes to the Super Admin module override CRUD (already functional)

---

## 2. Business Context

### 2.1 Current State

The Module Entitlement System has a complete domain and application layer:

| Component | Status | Location |
|---|---|---|
| `ModuleCode` value object | EXISTS | `Domain/SuperAdminDashboard/Subscription/ValueObjects/ModuleCode.php` |
| `ModuleEntitlementSet` value object | EXISTS | `Domain/SuperAdminDashboard/Subscription/ValueObjects/ModuleEntitlementSet.php` |
| `ModuleCapabilityMap` | EXISTS | `Domain/SuperAdminDashboard/Subscription/Services/ModuleCapabilityMap.php` |
| `ModuleEntitlementResolver` | EXISTS | `Domain/SuperAdminDashboard/Subscription/Services/ModuleEntitlementResolver.php` |
| `TenantModuleEntitlementCheckerInterface` | EXISTS | `Domain/SuperAdminDashboard/Subscription/Services/TenantModuleEntitlementCheckerInterface.php` |
| `EloquentTenantModuleEntitlementChecker` | EXISTS | `Infrastructure/Persistence/SuperAdminDashboard/Subscription/` |
| `EnforceModuleEntitlement` middleware class | EXISTS | `Http/Middleware/EnforceModuleEntitlement.php` |
| `tenant.module` alias in `bootstrap/app.php` | **MISSING** | Not registered |
| `tenant.module` on any route file | **NOT APPLIED** | Zero usage in `routes/tenant_dashboard/` |
| `module_entitlement_overrides` table | EXISTS | Migration `2026_03_06_190409` |
| `modules` column on `subscription_plans` | EXISTS | Migration `2026_03_06_190402` |
| `locked_modules` column on `tenant_subscriptions` | EXISTS | Migration `2026_03_06_190405` |
| `CreateModuleOverrideUseCase` | EXISTS | Application layer |
| `RemoveModuleOverrideUseCase` | EXISTS | Application layer |
| `GetTenantEntitlementsQuery` | EXISTS | Application layer |

**The only missing piece is activation — registration and route application.**

### 2.2 Why This Matters Now

Currently, module enforcement exists only as a side effect inside `EloquentTenantCapabilityChecker.userHasCapability()`. This creates three problems:

1. **No defense in depth.** If the capability checker is ever refactored and the module check is accidentally removed, every route in the system loses module enforcement silently.

2. **Unprotected routes.** Any tenant route that does not have a `tenant.capability` middleware (settings reads, health endpoints, future public-within-tenant routes) has zero module gating. The `tenant.module` middleware on the route group catches these.

3. **Wrong error message.** When a tenant lacks a module, they receive `403 INSUFFICIENT_CAPABILITY` — the same response as a user without the right RBAC role. The tenant admin cannot distinguish "your plan doesn't include this feature" (upgrade your plan) from "your role doesn't have this permission" (ask your admin for access). These require different remediation actions.

### 2.3 Why Before Phase 13A

Phase 13A (Landing Page Template System) introduces `module.website` — the first module where significant numbers of tenants will NOT be entitled. Every tenant on a basic LMS plan hitting any website-builder route will need a clear `MODULE_NOT_AVAILABLE` response, not a generic capability denial. The middleware must be active and tested before that phase begins.

---

## 3. Architecture Decisions

### AD-01: Middleware Pipeline Position

`tenant.module` runs AFTER tenant authentication and context resolution, but BEFORE `tenant.capability`.

```
tenant.resolve.token → auth:tenant_api → tenant.active → ensure.user.active → tenant.session → tenant.module:{code} → tenant.capability:{code}
```

**Rationale:** Module entitlement is a tenant-level gate (does this tenant's plan include this feature?). Capability is a user-level gate (does this user's role have this permission?). Checking the tenant's plan before checking the user's role avoids wasting a database query on RBAC resolution for a module the tenant doesn't even have.

### AD-02: Route Group Level, Not Per-Route

`tenant.module` is applied at the route **group** level (wrapping the entire route file), not per-route.

```php
// In routes/tenant_dashboard/quiz.php
Route::middleware('tenant.module:module.exams')->group(function () {
    Route::get('/', [QuizReadController::class, 'index'])
        ->middleware('tenant.capability:quiz.view');
    // ... all quiz routes
});
```

**Rationale:** A module is an all-or-nothing feature gate. If a tenant doesn't have `module.exams`, they cannot access ANY quiz, exam, or question bank route — not just specific ones. Per-route application would be redundant and error-prone (risk of forgetting one route).

### AD-03: Capability Checker's Internal Module Check Remains

The module check inside `EloquentTenantCapabilityChecker.userHasCapability()` is NOT removed. It stays as a defense-in-depth safety net.

**Rationale:** Belt and suspenders. If a developer adds a new route and forgets `tenant.module`, the capability checker still catches it. Two independent layers checking the same condition is correct for a security boundary. The middleware is the primary enforcement; the checker is the fallback.

### AD-04: Distinct Error Code and HTTP Response

`tenant.module` returns a response body structurally distinct from `tenant.capability`:

```json
{
    "error": {
        "code": "MODULE_NOT_AVAILABLE",
        "message": "Your subscription plan does not include this feature. Please contact your administrator to upgrade."
    }
}
```

This is different from the capability middleware's `INSUFFICIENT_CAPABILITY` response. The frontend can use this to show upgrade prompts vs. permission-request prompts.

**HTTP status remains 403.** The tenant is authenticated but not authorized for this module. 403 is semantically correct.

### AD-05: `module.lms` Routes Still Get the Middleware

Even though `module.lms` is mandatory and can never be revoked, routes in the LMS module group still apply `tenant.module:module.lms`.

**Rationale:** Consistency. Every route group follows the same pattern. If `module.lms` ever becomes revocable (unlikely but possible in a partner-reseller context), the enforcement is already in place. The runtime cost is negligible — the entitlement resolver will always return `true` for `module.lms`.

---

## 4. Module-to-Route-File Mapping (NON-NEGOTIABLE)

This is the canonical mapping. The developer MUST verify each route file exists and apply the correct module code.

| Route File | Module Code | Rationale |
|---|---|---|
| `routes/tenant_dashboard/course.php` | `module.lms` | Core LMS — courses are the base product |
| `routes/tenant_dashboard/course_operations.php` | `module.lms` | Course lifecycle operations |
| `routes/tenant_dashboard/course_review.php` | `module.lms` | Course review system |
| `routes/tenant_dashboard/enrollment.php` | `module.lms` | Student enrollment |
| `routes/tenant_dashboard/learning_progress.php` | `module.lms` | Progress tracking |
| `routes/tenant_dashboard/prerequisite.php` | `module.lms` | Course prerequisites |
| `routes/tenant_dashboard/filter_options.php` | `module.lms` | Course filtering/categorization |
| `routes/tenant_dashboard/live_session.php` | `module.lms` | Live class sessions |
| `routes/tenant_dashboard/exam_hierarchy.php` | `module.exams` | Exam/subject/chapter/topic hierarchy |
| `routes/tenant_dashboard/quiz.php` | `module.exams` | Quiz management |
| `routes/tenant_dashboard/assignment.php` | `module.exams` | Assignment submissions |
| `routes/tenant_dashboard/certificate.php` | `module.certificates` | Certificate templates and issuance |
| `routes/tenant_dashboard/communication.php` | `module.communication` | Blog, messaging, forums |
| `routes/tenant_dashboard/payment.php` | `module.lms` | Tenant-level payment/checkout (core commerce) |

### Routes That Do NOT Get `tenant.module`

| Route File | Reason |
|---|---|
| `routes/tenant_dashboard/users.php` | User management is platform infrastructure, not a gated module. Every tenant manages users. |
| `routes/tenant_dashboard/roles.php` | RBAC management is platform infrastructure. |
| `routes/tenant_dashboard/settings.php` | Tenant configuration is platform infrastructure. |
| `routes/tenant_dashboard/audit_logs.php` | Audit log viewing is platform infrastructure. |
| `routes/tenant_dashboard/stats.php` | Dashboard statistics — aggregates across modules, not gated to one. |
| `routes/tenant_dashboard/usage.php` | Usage/quota dashboard — platform infrastructure. |

### Developer Verification Required

The developer MUST:

1. Run `ls routes/tenant_dashboard/` and compare against this table. If any route file exists that is NOT listed, flag it in the implementation plan.
2. Verify the `ModuleCode` value object contains all module codes referenced in this table. If a module code is missing (e.g., `module.certificates`, `module.communication`), it must be added.
3. Verify the `ModuleCapabilityMap` has entries for every module code used. If a module is listed here but has no capability mapping, flag it.

---

## 5. Middleware Specification

### 5.1 Verify Existing Middleware Class

The developer MUST read `App\Http\Middleware\EnforceModuleEntitlement` and verify it:

1. Accepts a `$moduleCode` string parameter from the route definition.
2. Resolves the tenant context (via `TenantContext` or equivalent).
3. Calls `TenantModuleEntitlementCheckerInterface->isTenantEntitled(tenantId, moduleCode)`.
4. Returns a JSON error response with code `MODULE_NOT_AVAILABLE` on failure.
5. Does NOT reference or check user capabilities — this is tenant-level only.

If the existing middleware class does not match this specification, modify it to conform. Document all modifications in the implementation plan.

### 5.2 Expected Middleware Behavior

| Scenario | Expected Result |
|---|---|
| Tenant has active subscription with module included in plan | Request passes through to next middleware |
| Tenant has active subscription WITHOUT module in plan | 403 with `MODULE_NOT_AVAILABLE` |
| Tenant has module via Super Admin GRANT override | Request passes through (override takes effect) |
| Tenant has module in plan but REVOKE override active | 403 with `MODULE_NOT_AVAILABLE` (revoke wins) |
| Tenant has no active subscription at all | 403 with `MODULE_NOT_AVAILABLE` |
| `module.lms` check for any tenant with active subscription | Always passes (mandatory module) |
| Invalid module code passed to middleware | 500 with logged error (this is a developer mistake, not a user error) |

### 5.3 Response Format

```json
{
    "error": {
        "code": "MODULE_NOT_AVAILABLE",
        "message": "Your subscription plan does not include this feature. Please contact your administrator to upgrade."
    }
}
```

HTTP Status: `403 Forbidden`

---

## 6. Registration

### 6.1 Middleware Alias

Add to `bootstrap/app.php` (or wherever middleware aliases are registered):

```php
'tenant.module' => \App\Http\Middleware\EnforceModuleEntitlement::class,
```

### 6.2 Route Application Pattern

Every eligible route file wraps its entire content in a `tenant.module` group:

```php
<?php
// routes/tenant_dashboard/quiz.php

use App\Http\Controllers\Api\TenantAdminDashboard\Quiz\QuizReadController;
use App\Http\Controllers\Api\TenantAdminDashboard\Quiz\QuizWriteController;
use Illuminate\Support\Facades\Route;

Route::middleware('tenant.module:module.exams')->group(function () {

    Route::prefix('quizzes')->group(function () {
        Route::get('/', [QuizReadController::class, 'index'])
            ->middleware('tenant.capability:quiz.view');
        Route::get('/{id}', [QuizReadController::class, 'show'])
            ->middleware('tenant.capability:quiz.view');
        Route::post('/', [QuizWriteController::class, 'store'])
            ->middleware('tenant.capability:quiz.manage');
        // ... remaining routes
    });

});
```

The `tenant.module` group wraps everything. Individual routes still have their `tenant.capability` middleware. Both layers apply.

---

## 7. Test Plan

### 7.1 Module Middleware Denial Tests

**File:** `tests/Feature/Middleware/ModuleEntitlementMiddlewareTest.php`

| # | Test Case | Setup | Expected |
|---|---|---|---|
| 1 | Tenant with module entitled can access route | Create subscription with `module.exams`, hit quiz route | 200 (or whatever the normal response is) |
| 2 | Tenant WITHOUT module gets 403 MODULE_NOT_AVAILABLE | Create subscription with `module.lms` only, hit quiz route | 403, error code `MODULE_NOT_AVAILABLE` |
| 3 | Error response body has correct structure | Same as #2 | JSON body contains `error.code` = `MODULE_NOT_AVAILABLE` and `error.message` is a non-empty string |
| 4 | Error code is distinct from capability denial | Tenant has module but user lacks capability | 403, error code `INSUFFICIENT_CAPABILITY` (not `MODULE_NOT_AVAILABLE`) |
| 5 | Super Admin GRANT override enables access | Tenant plan lacks module, but GRANT override exists | 200 |
| 6 | Super Admin REVOKE override blocks access | Tenant plan includes module, but REVOKE override exists | 403, `MODULE_NOT_AVAILABLE` |
| 7 | `module.lms` always passes for active tenant | Any active subscription, hit course route | 200 (module.lms is mandatory) |
| 8 | Tenant with no active subscription gets 403 | No subscription record, hit any module-gated route | 403, `MODULE_NOT_AVAILABLE` |
| 9 | Middleware runs before capability check | Tenant lacks module, user also lacks capability | 403, `MODULE_NOT_AVAILABLE` (NOT `INSUFFICIENT_CAPABILITY` — module check fires first) |

### 7.2 Regression Tests

All existing tests MUST continue to pass. The addition of `tenant.module` to route groups must not break any existing test that creates subscriptions with modules correctly seeded.

**Risk:** Existing tests may not seed modules on subscription plans. If tests create subscriptions without module data, the new middleware will return 403 and break those tests. The developer MUST audit all existing test files that hit tenant routes and ensure they seed plan modules correctly.

**Expected affected test files (non-exhaustive — developer must verify):**
- `CourseCrudTest.php`
- `ExamHierarchyTest.php`
- `CourseIdempotencyTest.php`
- `CourseCapabilityDenialTest.php`
- `ExamCapabilityDenialTest.php`
- `QuizUseCaseTest.php`
- All other tests that call tenant dashboard routes

### 7.3 Running Tests

```bash
# Run new middleware tests
php artisan test --filter=ModuleEntitlementMiddleware

# Full regression
php artisan test

# PHPStan Level 5
vendor/bin/phpstan analyse --level=5
```

---

## 8. Quality Gate

| # | Gate | Verification |
|---|---|---|
| 1 | `tenant.module` alias registered | `grep -rn "tenant.module" bootstrap/` returns the alias registration |
| 2 | All eligible route files wrapped | `grep -rn "tenant.module" routes/tenant_dashboard/` returns one hit per eligible route file (per §4 mapping) |
| 3 | Non-eligible route files NOT wrapped | `grep -rn "tenant.module" routes/tenant_dashboard/users.php routes/tenant_dashboard/roles.php routes/tenant_dashboard/settings.php routes/tenant_dashboard/audit_logs.php routes/tenant_dashboard/stats.php routes/tenant_dashboard/usage.php` returns 0 hits |
| 4 | Middleware returns `MODULE_NOT_AVAILABLE` | Test #2 and #3 pass |
| 5 | Error code is distinct from capability denial | Test #4 and #9 pass |
| 6 | Override GRANT works | Test #5 passes |
| 7 | Override REVOKE works | Test #6 passes |
| 8 | All existing tests pass | Full `php artisan test` — 0 failures, 0 errors |
| 9 | PHPStan Level 5 clean | `vendor/bin/phpstan analyse --level=5` — 0 new errors |
| 10 | No `env()` calls outside config | `grep -rn 'env(' app/ routes/ database/` returns 0 results |
| 11 | Pipeline order verified | `php artisan route:list --path=tenant/quizzes --json` shows `tenant.module` before `tenant.capability` |

---

## 9. Risk Register

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| R1 | Existing tests break because subscriptions don't seed modules | **HIGH** | Audit every test file that hits tenant routes. Add module seeding to test setup. This is the primary effort in this phase. |
| R2 | `ModuleCode` value object missing codes referenced in §4 mapping | **MEDIUM** | Developer verifies all codes exist before applying middleware. Add missing codes if needed. |
| R3 | `ModuleCapabilityMap` missing entries for new module codes | **MEDIUM** | Developer verifies map completeness. Add entries if needed. |
| R4 | Route file has mixed module routes (e.g., one file serves both LMS and CRM endpoints) | **LOW** | If discovered, split the route file or apply the more restrictive module. Flag in implementation plan. |
| R5 | `EnforceModuleEntitlement` middleware class has incorrect implementation | **MEDIUM** | Developer reads the class, verifies against §5.1 spec, modifies if needed. |
| R6 | Middleware pipeline order incorrect — `tenant.module` runs after `tenant.capability` | **HIGH** | Verify via `php artisan route:list --json`. The route group nesting order determines middleware sequence. Module group must be the outermost wrapper. |

---

## 10. Implementation Plan Format

Same format as Phase 10A–12C:

| # | Section | Description |
|---|---|---|
| 1 | Executive Summary | What gets built, what does NOT |
| 2 | Gap Analysis | Read `EnforceModuleEntitlement.php`, verify response format. Read `ModuleCode.php`, verify all codes exist. Read `ModuleCapabilityMap.php`, verify all mappings. Read `bootstrap/app.php`, confirm alias is missing. Read every route file, confirm `tenant.module` is absent. |
| 3 | Architecture Decisions | Any deviations from this spec |
| 4 | Middleware Verification/Modification | Changes needed to existing middleware class (if any) |
| 5 | Registration | Alias addition to `bootstrap/app.php` |
| 6 | Route File Modifications | Exact diff for every route file being wrapped |
| 7 | Test Fixture Updates | Every existing test file that needs module seeding added |
| 8 | New Tests | Module middleware denial tests per §7.1 |
| 9 | Implementation Sequence | Ordered steps with dependencies |
| 10 | Quality Gate Verification | Checklist from §8 |
| 11 | Risk Register | Identified risks with severity and mitigation |
| 12 | File Manifest | Every new and modified file |

---

## 11. Constraints & Reminders

### Architecture Constraints

- `tenant.module` checks tenant entitlement ONLY. It does not check user permissions. That is `tenant.capability`'s job.
- Do NOT remove the module check from inside `EloquentTenantCapabilityChecker`. Both layers coexist (defense in depth).
- Do NOT create new migrations. All schema changes for module entitlements already exist.
- Do NOT modify `ModuleEntitlementResolver` or `EloquentTenantModuleEntitlementChecker` unless the gap analysis reveals a bug.
- If a module code referenced in §4 does not exist in `ModuleCode`, add it to the value object — do NOT skip the route file.

### Docker Environment

- Container: Alpine Linux — use `sh` not `bash`
- Container name: `ubotz_backend`
- Database: `ubotz_mysql`

### What NOT to Do

- Do NOT apply `tenant.module` to Super Admin routes. Module entitlement is a tenant concept.
- Do NOT apply `tenant.module` to platform infrastructure routes (users, roles, settings, audit logs, stats, usage).
- Do NOT make the middleware return 404 instead of 403. The tenant is authenticated; they're just not authorized for this module. 403 is correct.
- Do NOT log a warning on every successful module check. Only log on failures (and only at `info` level — not `warning` or `error`, as this is expected behavior for tenants on lower-tier plans).
- Do NOT cache module entitlement results in the middleware. The checker implementation may already cache internally; the middleware should call the checker cleanly on every request.
- Do NOT skip test fixture updates. Broken existing tests are the highest risk in this phase.

---

## 12. Definition of Done

Phase 12D is complete when:

1. The implementation plan has been reviewed and approved by the Principal Engineer.
2. All code is implemented per the approved plan.
3. All quality gates in §8 pass.
4. A Principal Engineer audit confirms zero critical or high findings.
5. All findings from audit are resolved.
6. `php artisan route:list --json` confirms `tenant.module` appears before `tenant.capability` on all eligible routes.
7. The Phase 12D Completion Report is signed off.

---

> **The domain layer knew what modules a tenant could access. The application layer could resolve it. The infrastructure layer could check it. But no route in the system asked. Phase 12D is the phase where the system starts asking.**

*End of Document — UBOTZ 2.0 Phase 12D Developer Instructions — March 18, 2026*