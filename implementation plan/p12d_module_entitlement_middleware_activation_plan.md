# UBOTZ 2.0 — Phase 12D Implementation Plan
## Module Entitlement Middleware Activation

**Document Type:** Implementation Plan
**Phase:** 12D
**Version:** 1.0
**Date:** March 18, 2026
**Status:** DRAFT — Pending Principal Engineer Review
**Source Document:** `backend/documentation/Ubotz 2 phase 12d module middleware activation developer instructions.md`
**Authority:** `backend/documentation/Ubotz 2 developer instruction manual .md` — **MANDATORY**
**Prerequisites:** Phase 10A–10D COMPLETE (RBAC + capability middleware), Phase 11A–11B COMPLETE (subscription module domain layer), Phase 12A–12C COMPLETE (payment integration)

---

> [!CAUTION]
> **This phase activates, not builds.** The domain layer, resolver, checker, and middleware class all exist. The only work is registration, route application, test fixture updates, and new denial tests. Do NOT modify `ModuleEntitlementResolver`, `EloquentTenantModuleEntitlementChecker`, or the Super Admin override CRUD. Every change must stay within the scope defined in §1.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Gap Analysis](#2-gap-analysis)
3. [Architecture Decisions](#3-architecture-decisions)
4. [Middleware Verification and Modification](#4-middleware-verification-and-modification)
5. [Registration](#5-registration)
6. [Route File Modifications](#6-route-file-modifications)
7. [Test Fixture Updates — Existing Tests](#7-test-fixture-updates--existing-tests)
8. [New Tests](#8-new-tests)
9. [Implementation Sequence](#9-implementation-sequence)
10. [Quality Gate Verification](#10-quality-gate-verification)
11. [Risk Register](#11-risk-register)
12. [File Manifest](#12-file-manifest)

---

## 1. Executive Summary

### 1.1 What This Phase Builds

| Deliverable | Description |
|---|---|
| `tenant.module` middleware alias registered | Add `'tenant.module' => EnforceModuleEntitlement::class` to `bootstrap/app.php` |
| Middleware message corrected | Change error message to user-friendly text per spec (no module code exposure) |
| `module.certificates` added to `ModuleCode` | New constant + allowed code + `ModuleCapabilityMap` entry |
| `module.communication` added to `ModuleCode` | New constant + allowed code + `ModuleCapabilityMap` entry |
| 14 route files wrapped in `tenant.module` | Per the §4 canonical mapping in the developer instructions |
| 9 new middleware denial tests | Covering all scenarios from §7.1 of the developer instructions |
| Existing test fixture updates | Mock `TenantModuleEntitlementCheckerInterface` in all tests hitting module-gated routes |
| Unlisted route file flag report | Documented in §2.5 for Principal Engineer resolution |

### 1.2 What This Phase Does NOT Build

| Excluded Item | Reason |
|---|---|
| New domain layer code | Entitlement resolver, checker, value objects already exist |
| New migrations | `module_entitlement_overrides`, `modules` column on plans, `locked_modules` on subscriptions — all exist |
| Changes to `ModuleEntitlementResolver` or `EloquentTenantModuleEntitlementChecker` | Existing implementation is correct |
| Frontend module gating | Phase 13A concern |
| New module codes beyond `module.certificates` and `module.communication` | Only what the §4 mapping requires |
| Changes to Super Admin module override CRUD | Already functional |
| Middleware for unlisted route files | Flagged for Principal Engineer architectural decision (§2.5) |

---

## 2. Gap Analysis

### 2.1 Middleware Class Verification

**File:** `app/Http/Middleware/EnforceModuleEntitlement.php`

**Verification against §5.1 spec:**

| Spec Requirement | Status | Finding |
|---|---|---|
| Accepts `$moduleCode` string parameter | ✅ PASS | `handle(Request $request, Closure $next, string $moduleCode)` |
| Resolves tenant context via `TenantContext` | ✅ PASS | `$this->tenantContext->getId()` |
| Calls `TenantModuleEntitlementCheckerInterface->isModuleEntitled()` | ✅ PASS | Method name matches interface |
| Returns JSON with `MODULE_NOT_AVAILABLE` error code | ✅ PASS | Error code correct |
| Does NOT reference user capabilities | ✅ PASS | No auth/user checks |
| Class is `final` | ❌ FAIL | Class is declared as `class EnforceModuleEntitlement` — not `final` |
| Error message is user-friendly (no module code exposed) | ❌ FAIL | Current message: `"This tenant is not entitled to use the {$moduleCode} module."` — exposes `$moduleCode` to client |
| Handles missing tenant context gracefully | ✅ PASS | Returns 403 with `TENANT_NOT_RESOLVED` |

**Required modifications:** Two changes needed (see §4).

### 2.2 ModuleCode Value Object Analysis

**File:** `app/Domain/SuperAdminDashboard/Subscription/ValueObjects/ModuleCode.php`

**Existing constants:**

| Constant | Value |
|---|---|
| `LMS` | `module.lms` |
| `EXAMS` | `module.exams` |
| `ERP_ATTENDANCE` | `module.erp.attendance` |
| `ERP_PAYROLL` | `module.erp.payroll` |
| `ERP_TIMETABLE` | `module.erp.timetable` |
| `ERP_TRANSPORT` | `module.erp.transport` |
| `ERP_ASSETS` | `module.erp.assets` |
| `CRM` | `module.crm` |
| `BILLING_STUDENT` | `module.billing.student` |
| `ANALYTICS` | `module.analytics` |

**Missing codes required by §4 mapping:**

| Required Code | Constant Name | Route File Using It | Status |
|---|---|---|---|
| `module.certificates` | `CERTIFICATES` | `certificate.php` | ❌ MISSING |
| `module.communication` | `COMMUNICATION` | `communication.php` | ❌ MISSING |

**Resolution:** Both constants must be added to `ModuleCode` before route middleware can be applied.

### 2.3 ModuleCapabilityMap Analysis

**File:** `app/Domain/SuperAdminDashboard/Subscription/Services/ModuleCapabilityMap.php`

**Existing entries:** `module.lms`, `module.exams`, `module.erp.attendance`, `module.erp.payroll`, `module.erp.timetable`, `module.erp.transport`, `module.erp.assets`, `module.crm`, `module.billing.student`, `module.analytics` — all have capability mappings.

**Missing entries for new module codes:**

| Module Code | Required Capabilities |
|---|---|
| `module.certificates` | `certificate.view`, `certificate.manage`, `certificate_template.view`, `certificate_template.manage` |
| `module.communication` | `faq.view`, `faq.manage`, `forum.view`, `forum.manage`, `noticeboard.view`, `noticeboard.manage`, `blog.view`, `blog.manage` |

> **Note on certificate capabilities:** `certificate.view` and `certificate.manage` are currently mapped under `module.lms` in the existing `ModuleCapabilityMap`. After adding `module.certificates`, these capabilities will be duplicated across `module.lms` and `module.certificates`. The `getCapabilitiesForModules` method uses `array_unique`, so this is safe for capability lookups. The `module.lms` mapping should retain these capabilities for backward compatibility (belt-and-suspenders). This is consistent with AD-03 (defense in depth).

> **Note on landing_page capabilities:** `landing_page.view` and `landing_page.manage` are currently in `module.lms`. Per the developer instructions, `landing_page.php` routes map to `module.lms`. There is no separate `module.website` or `module.landing_page` in this phase. Phase 13A will determine if these capabilities need reclassification.

### 2.4 bootstrap/app.php State

**Confirmed:** `tenant.module` alias is **NOT registered**. Existing aliases:

```
'admin.authority'          → EnforceAdminAuthority
'admin.session'            → EnforceValidAdminSession
'tenant.resolve'           → ResolveTenantContext
'tenant.resolve.token'     → ResolveTenantFromToken
'tenant.active'            → EnsureTenantActive
'ensure.user.active'       → EnsureUserActive
'tenant.session'           → EnsureValidTenantSession
'resolve.tenant.subdomain' → ResolveTenantFromSubdomain
'tenant.capability'        → EnforceTenantCapability
```

`tenant.module` must be added to this alias block.

### 2.5 Route File Analysis

#### 2.5.1 Route Files in §4 Mapping (14 files)

All 14 route files specified in the §4 mapping **exist** in `routes/tenant_dashboard/`:

| Route File | Module Code | File Exists | Currently Wrapped |
|---|---|---|---|
| `course.php` | `module.lms` | ✅ | ❌ |
| `course_operations.php` | `module.lms` | ✅ | ❌ |
| `course_review.php` | `module.lms` | ✅ | ❌ |
| `enrollment.php` | `module.lms` | ✅ | ❌ |
| `learning_progress.php` | `module.lms` | ✅ | ❌ |
| `prerequisite.php` | `module.lms` | ✅ | ❌ |
| `filter_options.php` | `module.lms` | ✅ | ❌ |
| `live_session.php` | `module.lms` | ✅ | ❌ |
| `exam_hierarchy.php` | `module.exams` | ✅ | ❌ |
| `quiz.php` | `module.exams` | ✅ | ❌ |
| `assignment.php` | `module.exams` | ✅ | ❌ |
| `certificate.php` | `module.certificates` | ✅ | ❌ |
| `communication.php` | `module.communication` | ✅ | ❌ |
| `payment.php` | `module.lms` | ✅ | ❌ |

#### 2.5.2 Route Files NOT in §4 Mapping — Flagged for Principal Engineer Decision

The following route files exist in `routes/tenant_dashboard/` but are NOT listed in the §4 mapping. They are **flagged** for architectural review. No `tenant.module` middleware will be applied to these files in Phase 12D without explicit Principal Engineer sign-off.

| Route File | Contents (from file header inspection) | Developer Recommendation | Decision Needed |
|---|---|---|---|
| `attendance.php` | Attendance sessions and records | `module.erp.attendance` — clear mapping exists in `ModuleCode` and `ModuleCapabilityMap` | **YES — included in Phase 12D if approved** |
| `billing.php` | Tenant invoice and payment history | Platform infrastructure (tenant viewing their own platform billing) | NO module gate |
| `blog.php` | Blog categories, posts, comments | `module.communication` — blog is communication content | **YES — flag for approval, likely Phase 12D extension** |
| `branch.php` | Branch management (from Phase 15A CRM) | `module.crm` — branches are a CRM construct per Phase 15A | **YES — flag for approval** |
| `bundle.php` | Course bundles and bundle enrollment | `module.lms` — bundles are a core LMS feature | **YES — flag for approval** |
| `categories.php` | Course/content categories | `module.lms` — categories are used for course classification | **YES — flag for approval** |
| `custom_domain.php` | Custom domain management | Platform infrastructure (tenant configuration) | NO module gate |
| `file_manager.php` | File browsing, upload, management | `module.lms` — `file_manager.view/manage` are in `ModuleCode::LMS` map | **YES — flag for approval** |
| `gift.php` | Gift course/subscription access | `module.lms` — gift is a course purchase/enrollment variant | **YES — flag for approval** |
| `installment.php` | Installment payment plans and orders | `module.lms` — installment is an LMS commerce feature for course enrollment | **YES — flag for approval** |
| `landing_page.php` | Landing page and navigation | `module.lms` — `landing_page.view/manage` are in `ModuleCode::LMS` map | **YES — flag for approval** |
| `lead_management.php` | Lead CRUD, follow-ups, notes, pipeline | `module.crm` — clear mapping exists in `ModuleCode` and `ModuleCapabilityMap` | **YES — included in Phase 12D if approved** |
| `notification.php` | In-app notifications and preferences | Platform infrastructure — notifications are cross-module system infrastructure | NO module gate |
| `reward.php` | Reward configuration and ledger | No module code exists for rewards in `ModuleCode` | **FLAG — needs new module code or defer** |
| `store.php` | Product catalog, orders, files | `module.lms` — digital product store for educational content | **YES — flag for approval** |
| `subscription.php` | Tenant-facing subscription plan listing | Platform infrastructure (tenant viewing available plans) | NO module gate |
| `user_groups.php` | User group management | Platform infrastructure (user management extends the base user system) | NO module gate |

> **ACTION REQUIRED (Principal Engineer):** For each flagged file marked "YES — included in Phase 12D if approved," confirm the module mapping or defer to a subsequent phase. The `reward.php` file requires a new `module.rewards` code if it is to be gated. The developer will NOT apply middleware to any flagged file until this decision is received in writing.

#### 2.5.3 Route Files Confirmed as Platform Infrastructure (No Module Gate)

Per §4 of the developer instructions, these files do NOT receive `tenant.module`:

| Route File | Reason |
|---|---|
| `users.php` | User management — platform infrastructure |
| `roles.php` | RBAC management — platform infrastructure |
| `settings.php` | Tenant configuration — platform infrastructure |
| `audit_logs.php` | Audit log viewing — platform infrastructure |
| `stats.php` | Dashboard statistics — cross-module aggregate |
| `usage.php` | Usage/quota dashboard — platform infrastructure |
| `billing.php` | Platform billing invoices — platform infrastructure |
| `custom_domain.php` | Tenant configuration — platform infrastructure |
| `notification.php` | Cross-module notification system |
| `subscription.php` | Tenant viewing available plans — platform infrastructure |
| `user_groups.php` | User management extension |

### 2.6 Existing Test Audit

**Concern:** When `tenant.module` is applied to route groups, any existing test that hits a module-gated route WITHOUT mocking `TenantModuleEntitlementCheckerInterface` will receive a 403 `MODULE_NOT_AVAILABLE` response and fail.

**Tests that already mock `TenantModuleEntitlementCheckerInterface` (SAFE):**

| Test File | Module Mocked |
|---|---|
| `ExamHierarchy/ExamCapabilityDenialTest.php` | `module.lms`, `module.exams` |
| `ExamHierarchy/ExamHierarchyTest.php` | `module.lms`, `module.exams` |
| `Quiz/QuizCrudTest.php` | `module.lms`, `module.exams` |
| `Quiz/QuizFeatureTest.php` | `module.lms`, `module.exams` |
| `Quiz/QuizFilteringTest.php` | `module.lms`, `module.exams` |
| `Quiz/QuizResultTest.php` | `module.lms`, `module.exams` |
| `Quiz/QuizStatsTest.php` | `module.lms`, `module.exams` |
| `Course/CourseFilteringTest.php` | `module.lms` |
| `Stats/DashboardStatsTest.php` | mocks entitlement |

**Tests that do NOT mock `TenantModuleEntitlementCheckerInterface` and WILL BREAK:**

| Test File | Routes Hit | Module Required | Fix Needed |
|---|---|---|---|
| `Course/CourseCrudTest.php` | `/api/tenant/courses` | `module.lms` | Add entitlement mock |
| `Course/CourseCapabilityDenialTest.php` | `/api/tenant/courses` | `module.lms` | Add entitlement mock |
| `Course/CourseIdempotencyTest.php` | `/api/tenant/courses` | `module.lms` | Add entitlement mock |
| `Course/CourseIsolationTest.php` | `/api/tenant/courses` | `module.lms` | Add entitlement mock |
| `Course/CourseValidationTest.php` | `/api/tenant/courses` | `module.lms` | Add entitlement mock |
| `Course/CourseClassificationTest.php` | `/api/tenant/courses` | `module.lms` | Add entitlement mock |
| `Course/CourseCreationQuotaTest.php` | `/api/tenant/courses` | `module.lms` | Add entitlement mock |
| `Course/CourseStatisticsTest.php` | `/api/tenant/courses` | `module.lms` | Add entitlement mock |
| `Course/CourseReportTest.php` | `/api/tenant/courses` | `module.lms` | Add entitlement mock |
| `Course/CourseShareLinksTest.php` | `/api/tenant/courses` | `module.lms` | Add entitlement mock |
| `Course/CourseSeoDescriptionTest.php` | `/api/tenant/courses` | `module.lms` | Add entitlement mock |
| `Course/CourseTicketTest.php` | `/api/tenant/courses` | `module.lms` | Add entitlement mock |
| `Course/CourseTypeMigrationTest.php` | `/api/tenant/courses` | `module.lms` | Add entitlement mock |
| `Course/CourseStudentExportTest.php` | `/api/tenant/courses` | `module.lms` | Add entitlement mock |
| `Course/CourseFileCrudTest.php` | `/api/tenant/courses` | `module.lms` | Add entitlement mock |
| `Course/CourseWaitlistFeatureTest.php` | `/api/tenant/courses` | `module.lms` | Add entitlement mock |
| `Course/Batch2FeatureTest.php` | `/api/tenant/courses` | `module.lms` | Add entitlement mock |
| `Course/ChapterCrudTest.php` | `/api/tenant/courses/chapters` | `module.lms` | Add entitlement mock |
| `Course/ChapterEnhancementsTest.php` | `/api/tenant/courses/chapters` | `module.lms` | Add entitlement mock |
| `Course/TextLessonCrudTest.php` | `/api/tenant/courses/chapters/text-lessons` | `module.lms` | Add entitlement mock |
| `Course/TextLessonAttachmentCrudTest.php` | `/api/tenant/courses` | `module.lms` | Add entitlement mock |
| `Course/TextLessonAttachmentTest.php` | `/api/tenant/courses` | `module.lms` | Add entitlement mock |
| `Course/VideoAttachmentTest.php` | `/api/tenant/courses` | `module.lms` | Add entitlement mock |
| `Course/ContentDeleteRequestTest.php` | `/api/tenant/courses` | `module.lms` | Add entitlement mock |
| `Course/FilterOptionTest.php` | `/api/tenant/filter-options` | `module.lms` | Add entitlement mock |
| `Course/PartnerTeacherTest.php` | `/api/tenant/courses` | `module.lms` | Add entitlement mock |
| `Course/PricingIntegrationTest.php` | `/api/tenant/courses` + `/api/tenant/payment` | `module.lms` | Add entitlement mock |
| `Course/PaymentEnrollmentIntegrationTest.php` | `/api/tenant/payment` + `/api/tenant/enrollment` | `module.lms` | Add entitlement mock |
| `Course/CertificateIntegrationTest.php` | `/api/tenant/certificate` | `module.lms`, `module.certificates` | Add entitlement mock |
| `Enrollment/AdminEnrollmentTest.php` | `/api/tenant/enrollments` | `module.lms` | Add entitlement mock |
| `Enrollment/EnrollmentControllerTest.php` | `/api/tenant/enrollments` | `module.lms` | Add entitlement mock |
| `LearningProgress/LearningProgressTest.php` | `/api/tenant/learning-progress` | `module.lms` | Add entitlement mock |
| `LiveSession/LiveSessionIntegrationTest.php` | `/api/tenant/live-sessions` | `module.lms` | Add entitlement mock |
| `Prerequisite/PrerequisiteIntegrationTest.php` | `/api/tenant/prerequisites` | `module.lms` | Add entitlement mock |
| `Review/ReviewIntegrationTest.php` | `/api/tenant/courses` | `module.lms` | Add entitlement mock |
| `Assignment/AssignmentIntegrationTest.php` | `/api/tenant/assignments` | `module.exams` | Add entitlement mock |
| `Quiz/QuizQuestionCrudTest.php` | `/api/tenant/quizzes` | `module.exams` | Add entitlement mock |
| `Quiz/QuizQuestionBankHierarchyTest.php` | `/api/tenant/quizzes` | `module.exams` | Uses override table — verify mock or DB approach |
| `Blog/BlogCategoryCrudTest.php` | `/api/tenant/blog` | `module.communication` | Add entitlement mock (if `blog.php` gated) |
| `Blog/BlogPostCrudTest.php` | `/api/tenant/blog` | `module.communication` | Add entitlement mock (if `blog.php` gated) |
| `Blog/BlogCommentModerationTest.php` | `/api/tenant/blog` | `module.communication` | Add entitlement mock (if `blog.php` gated) |
| `Attendance/AttendanceSessionCrudTest.php` | `/api/tenant/attendance` | `module.erp.attendance` | Add entitlement mock (if `attendance.php` gated) |
| `Attendance/AttendanceRecordMarkingTest.php` | `/api/tenant/attendance` | `module.erp.attendance` | Add entitlement mock (if `attendance.php` gated) |
| `Attendance/SettingsUpdateTest.php` | `/api/tenant/attendance` | `module.erp.attendance` | Uses override table — verify mock |
| `LeadManagement/*Test.php` (7 files) | `/api/tenant/leads` | `module.crm` | Add entitlement mock (if `lead_management.php` gated) |
| `LandingPage/*Test.php` (4 files) | `/api/tenant/landing-pages` | `module.lms` | Add entitlement mock (if `landing_page.php` gated) |
| `Billing/TenantInvoiceTest.php` | `/api/tenant/billing` | Platform infra — NO gate | No change needed |
| `FileManager/*Test.php` (4 files) | `/api/tenant/file-manager` | `module.lms` | Add entitlement mock (if `file_manager.php` gated) |
| `Bundle/BundleCrudTest.php` | `/api/tenant/bundle` | `module.lms` | Add entitlement mock (if `bundle.php` gated) |
| `Bundle/BundleEnrollmentTest.php` | `/api/tenant/bundle` | `module.lms` | Add entitlement mock (if `bundle.php` gated) |
| `Installment/*Test.php` (2 files) | `/api/tenant/installments` | `module.lms` | Add entitlement mock (if `installment.php` gated) |

> **Important:** Tests hitting flagged route files (attendance, blog, lead_management, landing_page, file_manager, bundle, installment) only need the mock IF the corresponding route file is approved for gating in Phase 12D. If deferred, those tests remain unaffected.

---

## 3. Architecture Decisions

### AD-01: Middleware Pipeline Position — ADOPTED AS SPECIFIED

`tenant.module` runs AFTER `tenant.session` (which runs after auth), BEFORE `tenant.capability`.

```
tenant.resolve.token → auth:tenant_api → tenant.active → ensure.user.active → tenant.session → [tenant.module:{code}] → tenant.capability:{code}
```

The route group wrapping `tenant.module` must be the **outermost** wrapper so it fires before `tenant.capability` middleware that is applied per-route.

### AD-02: Route Group Level, Not Per-Route — ADOPTED AS SPECIFIED

`tenant.module` is applied at the route **group** level wrapping the entire route file content. Per-route application is explicitly forbidden.

### AD-03: Capability Checker's Internal Module Check Remains — ADOPTED AS SPECIFIED

The module check inside `EloquentTenantCapabilityChecker.userHasCapability()` is NOT removed. Both layers coexist as defense-in-depth. No changes to that class.

### AD-04: Distinct Error Code — ADOPTED AS SPECIFIED

`MODULE_NOT_AVAILABLE` (403) for middleware denial. `INSUFFICIENT_CAPABILITY` (403) for capability denial. These must remain distinct.

### AD-05: `module.lms` Routes Still Get the Middleware — ADOPTED AS SPECIFIED

Even mandatory modules are gated at the route group level for consistency and future-proofing.

### AD-06 (NEW): `module.certificates` Split from `module.lms` — ARCHITECTURAL FLAG

The `certificate.php` route file is assigned to `module.certificates` per §4. However, `certificate.view` and `certificate.manage` capabilities are currently also listed under `module.lms` in `ModuleCapabilityMap`. These capabilities are NOT removed from `module.lms` — they remain there as well. The `module.certificates` entry adds these capabilities a second time. `array_unique` in `getCapabilitiesForModules` handles deduplication safely. This dual-listing is intentional belt-and-suspenders (a tenant with only `module.lms` who somehow reaches a certificate route will still have the capability — the `tenant.module:module.certificates` check is the authoritative gate).

### AD-07 (NEW): `communication.php` Contains Course-Level Communication, Not Blog

On inspection, `communication.php` contains: course FAQs, course forums, course noticeboards. This is course-scoped communication. The `blog.php` route file contains: blog categories, blog posts, blog comments — which are tenant-wide blog/content features. Both are gated under `module.communication` since communication is the umbrella module for all content-sharing features. This is flagged for Principal Engineer confirmation.

### AD-08 (NEW): Error Message Must Not Expose Module Code

The current middleware message exposes the internal module code string to the API client. This is changed to a user-facing message per the spec. Internal module codes are implementation details that should not leak to tenant admin frontends.

---

## 4. Middleware Verification and Modification

### 4.1 Current State

`app/Http/Middleware/EnforceModuleEntitlement.php` — EXISTS with two deviations from spec:

1. **Not `final`:** Class is declared as `class EnforceModuleEntitlement`. Must become `final class EnforceModuleEntitlement`.
2. **Error message exposes internal module code:** Current: `"This tenant is not entitled to use the {$moduleCode} module. Please upgrade your subscription plan."` — Must become: `"Your subscription plan does not include this feature. Please contact your administrator to upgrade."`

### 4.2 Required Modification

**File:** `app/Http/Middleware/EnforceModuleEntitlement.php`

Change 1: Add `final` modifier to class declaration.

Change 2: Replace the module-code-exposing error message with the user-friendly message from §5.3 of the developer instructions.

**After modification, the `handle()` method's denial branch must be:**

```php
if (!$isEntitled) {
    return response()->json([
        'error' => [
            'code'    => 'MODULE_NOT_AVAILABLE',
            'message' => 'Your subscription plan does not include this feature. Please contact your administrator to upgrade.',
        ]
    ], 403);
}
```

The `TENANT_NOT_RESOLVED` branch (missing tenant context) is an unexpected state (developer mistake), not a user-facing scenario. It is retained as-is since it handles an edge case that should never occur in a correctly configured request pipeline.

### 4.3 No Other Middleware Changes

The entitlement checker injection, tenant context resolution, and `$next($request)` pass-through are all correct. No other changes.

---

## 5. Registration

### 5.1 Middleware Alias in `bootstrap/app.php`

**File:** `bootstrap/app.php`

Add to the `$middleware->alias([...])` block:

```php
'tenant.module' => \App\Http\Middleware\EnforceModuleEntitlement::class,
```

**Full updated alias block:**

```php
$middleware->alias([
    'admin.authority'          => \App\Http\Middleware\EnforceAdminAuthority::class,
    'admin.session'            => \App\Http\Middleware\EnforceValidAdminSession::class,
    'tenant.resolve'           => \App\Http\Middleware\ResolveTenantContext::class,
    'tenant.resolve.token'     => \App\Http\Middleware\ResolveTenantFromToken::class,
    'tenant.active'            => \App\Http\Middleware\EnsureTenantActive::class,
    'ensure.user.active'       => \App\Http\Middleware\EnsureUserActive::class,
    'tenant.session'           => \App\Http\Middleware\EnsureValidTenantSession::class,
    'resolve.tenant.subdomain' => \App\Http\Middleware\ResolveTenantFromSubdomain::class,
    'tenant.capability'        => \App\Http\Middleware\EnforceTenantCapability::class,
    'tenant.module'            => \App\Http\Middleware\EnforceModuleEntitlement::class,  // Phase 12D
]);
```

### 5.2 `ModuleCode` Value Object — Add Missing Constants

**File:** `app/Domain/SuperAdminDashboard/Subscription/ValueObjects/ModuleCode.php`

Add two constants and include them in `ALLOWED_CODES`:

```php
public const CERTIFICATES = 'module.certificates';
public const COMMUNICATION = 'module.communication';
```

Include in `private const ALLOWED_CODES`:

```php
private const ALLOWED_CODES = [
    self::LMS,
    self::EXAMS,
    self::ERP_ATTENDANCE,
    self::ERP_PAYROLL,
    self::ERP_TIMETABLE,
    self::ERP_TRANSPORT,
    self::ERP_ASSETS,
    self::CRM,
    self::BILLING_STUDENT,
    self::ANALYTICS,
    self::CERTIFICATES,   // Phase 12D
    self::COMMUNICATION,  // Phase 12D
];
```

### 5.3 `ModuleCapabilityMap` — Add Missing Entries

**File:** `app/Domain/SuperAdminDashboard/Subscription/Services/ModuleCapabilityMap.php`

Add to `private const MAP`:

```php
ModuleCode::CERTIFICATES => [
    'certificate.view',
    'certificate.manage',
    'certificate_template.view',
    'certificate_template.manage',
],
ModuleCode::COMMUNICATION => [
    'faq.view',
    'faq.manage',
    'forum.view',
    'forum.manage',
    'noticeboard.view',
    'noticeboard.manage',
    'blog.view',
    'blog.manage',
],
```

---

## 6. Route File Modifications

All 14 route files in the §4 mapping are wrapped in a `Route::middleware('tenant.module:{code}')->group(function () { ... })` block. The wrapping group is the **outermost** wrapper — existing prefix groups and per-route capability middleware stay exactly as they are, nested inside.

### 6.1 Wrapping Pattern

```php
<?php
// routes/tenant_dashboard/{file}.php

// [imports unchanged]

Route::middleware('tenant.module:{module_code}')->group(function () {

    // [ALL existing route definitions unchanged, indented one level]

});
```

No existing routes, prefixes, middleware, or controller references are changed — only the outer group wrapper is added.

### 6.2 File-by-File Change Summary

| # | File | Module Code | Change Type |
|---|---|---|---|
| 1 | `routes/tenant_dashboard/course.php` | `module.lms` | Add outer group wrapper |
| 2 | `routes/tenant_dashboard/course_operations.php` | `module.lms` | Add outer group wrapper |
| 3 | `routes/tenant_dashboard/course_review.php` | `module.lms` | Add outer group wrapper |
| 4 | `routes/tenant_dashboard/enrollment.php` | `module.lms` | Add outer group wrapper |
| 5 | `routes/tenant_dashboard/learning_progress.php` | `module.lms` | Add outer group wrapper |
| 6 | `routes/tenant_dashboard/prerequisite.php` | `module.lms` | Add outer group wrapper |
| 7 | `routes/tenant_dashboard/filter_options.php` | `module.lms` | Add outer group wrapper |
| 8 | `routes/tenant_dashboard/live_session.php` | `module.lms` | Add outer group wrapper |
| 9 | `routes/tenant_dashboard/exam_hierarchy.php` | `module.exams` | Add outer group wrapper |
| 10 | `routes/tenant_dashboard/quiz.php` | `module.exams` | Add outer group wrapper |
| 11 | `routes/tenant_dashboard/assignment.php` | `module.exams` | Add outer group wrapper |
| 12 | `routes/tenant_dashboard/certificate.php` | `module.certificates` | Add outer group wrapper |
| 13 | `routes/tenant_dashboard/communication.php` | `module.communication` | Add outer group wrapper |
| 14 | `routes/tenant_dashboard/payment.php` | `module.lms` | Add outer group wrapper |

### 6.3 Illustrative Diff: `quiz.php`

Before:
```php
<?php

use App\Http\Controllers\Api\TenantAdminDashboard\Quiz\QuizReadController;
use App\Http\Controllers\Api\TenantAdminDashboard\Quiz\QuizWriteController;
use Illuminate\Support\Facades\Route;

Route::prefix('quizzes')->group(function () {
    Route::get('/', [QuizReadController::class, 'index'])
        ->middleware('tenant.capability:quiz.view');
    Route::post('/', [QuizWriteController::class, 'store'])
        ->middleware('tenant.capability:quiz.manage');
    // ... remaining routes
});
```

After:
```php
<?php

use App\Http\Controllers\Api\TenantAdminDashboard\Quiz\QuizReadController;
use App\Http\Controllers\Api\TenantAdminDashboard\Quiz\QuizWriteController;
use Illuminate\Support\Facades\Route;

Route::middleware('tenant.module:module.exams')->group(function () {

    Route::prefix('quizzes')->group(function () {
        Route::get('/', [QuizReadController::class, 'index'])
            ->middleware('tenant.capability:quiz.view');
        Route::post('/', [QuizWriteController::class, 'store'])
            ->middleware('tenant.capability:quiz.manage');
        // ... remaining routes unchanged
    });

});
```

The `tenant.capability` middleware on individual routes is preserved exactly. Only the outer `tenant.module` group is added.

---

## 7. Test Fixture Updates — Existing Tests

### 7.1 The Standard Mock Pattern

Every test class that hits a module-gated route must add the following to its `setUp()` method **before** any test runs. This must appear before the `TenantRecord::factory()->create()` call so the mock is in place when the route pipeline resolves.

```php
use App\Domain\SuperAdminDashboard\Subscription\Services\TenantModuleEntitlementCheckerInterface;
use App\Domain\SuperAdminDashboard\Subscription\ValueObjects\ModuleEntitlementSet;

// In setUp():
$entitlementChecker = $this->createMock(TenantModuleEntitlementCheckerInterface::class);
$entitlementChecker->method('isModuleEntitled')->willReturn(true);
$entitlementChecker->method('getEffectiveEntitlements')->willReturn(
    ModuleEntitlementSet::fromArray(['module.lms', 'module.exams', 'module.certificates', 'module.communication'])
);
$this->app->instance(TenantModuleEntitlementCheckerInterface::class, $entitlementChecker);
```

The mock grants ALL modules (`module.lms`, `module.exams`, `module.certificates`, `module.communication`) for standard functional tests. Tests that specifically test denial behavior (like `CourseCapabilityDenialTest`) should only grant the modules they need and explicitly deny others.

### 7.2 Files Requiring Update (Core 14-File Scope)

These files hit routes in the 14 §4-specified route files and do NOT already mock the entitlement checker:

| Test File | Modules to Grant in Mock |
|---|---|
| `Course/CourseCrudTest.php` | `module.lms` |
| `Course/CourseCapabilityDenialTest.php` | `module.lms` (test verifies RBAC denial, NOT module denial) |
| `Course/CourseIdempotencyTest.php` | `module.lms` |
| `Course/CourseIsolationTest.php` | `module.lms` |
| `Course/CourseValidationTest.php` | `module.lms` |
| `Course/CourseClassificationTest.php` | `module.lms` |
| `Course/CourseCreationQuotaTest.php` | `module.lms` |
| `Course/CourseStatisticsTest.php` | `module.lms` |
| `Course/CourseReportTest.php` | `module.lms` |
| `Course/CourseShareLinksTest.php` | `module.lms` |
| `Course/CourseSeoDescriptionTest.php` | `module.lms` |
| `Course/CourseTicketTest.php` | `module.lms` |
| `Course/CourseTypeMigrationTest.php` | `module.lms` |
| `Course/CourseStudentExportTest.php` | `module.lms` |
| `Course/CourseFileCrudTest.php` | `module.lms` |
| `Course/CourseWaitlistFeatureTest.php` | `module.lms` |
| `Course/Batch2FeatureTest.php` | `module.lms` |
| `Course/ChapterCrudTest.php` | `module.lms` |
| `Course/ChapterEnhancementsTest.php` | `module.lms` |
| `Course/TextLessonCrudTest.php` | `module.lms` |
| `Course/TextLessonAttachmentCrudTest.php` | `module.lms` |
| `Course/TextLessonAttachmentTest.php` | `module.lms` |
| `Course/VideoAttachmentTest.php` | `module.lms` |
| `Course/ContentDeleteRequestTest.php` | `module.lms` |
| `Course/FilterOptionTest.php` | `module.lms` |
| `Course/PartnerTeacherTest.php` | `module.lms` |
| `Course/PricingIntegrationTest.php` | `module.lms` |
| `Course/PaymentEnrollmentIntegrationTest.php` | `module.lms` |
| `Course/CertificateIntegrationTest.php` | `module.lms`, `module.certificates` |
| `Enrollment/AdminEnrollmentTest.php` | `module.lms` |
| `Enrollment/EnrollmentControllerTest.php` | `module.lms` |
| `LearningProgress/LearningProgressTest.php` | `module.lms` |
| `LiveSession/LiveSessionIntegrationTest.php` | `module.lms` |
| `Prerequisite/PrerequisiteIntegrationTest.php` | `module.lms` |
| `Review/ReviewIntegrationTest.php` | `module.lms` |
| `Assignment/AssignmentIntegrationTest.php` | `module.exams` |
| `Quiz/QuizQuestionCrudTest.php` | `module.lms`, `module.exams` |
| `Quiz/QuizQuestionBankHierarchyTest.php` | `module.lms`, `module.exams` |

### 7.3 `CourseCapabilityDenialTest.php` — Special Case

This test verifies that a user WITHOUT the required RBAC capability is denied access. The test must NOT use `willReturn(false)` for `isModuleEntitled` — it must grant the module (so `tenant.module` passes) but deny the capability at the `tenant.capability` layer. Verify that the test's existing assertions check for `INSUFFICIENT_CAPABILITY` (not `MODULE_NOT_AVAILABLE`).

**Required mock for this test:**
```php
$entitlementChecker->method('isModuleEntitled')->willReturn(true);  // Module IS entitled
// Role has no capabilities → tenant.capability returns INSUFFICIENT_CAPABILITY
```

### 7.4 `TenantDashboard/Course/VideoPlaybackTest.php` and Student Dashboard Tests

Student dashboard tests hit different route groups than tenant admin dashboard routes. Verify whether they are behind the same `tenant.module` middleware. If they use a different route file not in the §4 mapping, they are unaffected.

---

## 8. New Tests

### 8.1 Test File

**File:** `tests/Feature/Middleware/ModuleEntitlementMiddlewareTest.php`

**Namespace:** `Tests\Feature\Middleware`

### 8.2 Test Suite Setup Pattern

The test class must:
- Use `RefreshDatabase`, `AuthenticatesWithJwt`, `SeedsTestCapabilities`
- Create a real tenant and user in `setUp()`
- Use the quiz route (`/api/tenant/quizzes`) as the primary test route (requires `module.exams`) because:
  - It is a simple GET endpoint with low fixture requirements
  - It verifies both module-level and capability-level gating in isolation
- Use the course route (`/api/tenant/courses`) for `module.lms` tests

### 8.3 Test Cases (all 9 from §7.1)

| # | Test Method | Setup | Route | Expected |
|---|---|---|---|---|
| 1 | `test_tenant_with_module_entitled_can_access_route` | Mock: `isModuleEntitled` returns `true` for `module.exams`. Role has `quiz.view`. | `GET /api/tenant/quizzes` | 200 |
| 2 | `test_tenant_without_module_gets_403_module_not_available` | Mock: `isModuleEntitled` returns `false` for `module.exams`. | `GET /api/tenant/quizzes` | 403 |
| 3 | `test_module_denial_response_has_correct_structure` | Same as #2 | `GET /api/tenant/quizzes` | 403, `error.code` = `MODULE_NOT_AVAILABLE`, `error.message` is non-empty string |
| 4 | `test_error_code_is_distinct_from_capability_denial` | Mock: `isModuleEntitled` returns `true` (module granted). Role has NO capabilities. | `GET /api/tenant/quizzes` | 403, `error.code` = `INSUFFICIENT_CAPABILITY` (NOT `MODULE_NOT_AVAILABLE`) |
| 5 | `test_super_admin_grant_override_enables_access` | DB: `module_entitlement_overrides` row with `type=grant` for `module.exams`. Plan does NOT include module. | `GET /api/tenant/quizzes` | 200 |
| 6 | `test_super_admin_revoke_override_blocks_access` | DB: Plan INCLUDES `module.exams`. DB: `module_entitlement_overrides` row with `type=revoke` for `module.exams`. | `GET /api/tenant/quizzes` | 403, `MODULE_NOT_AVAILABLE` |
| 7 | `test_module_lms_always_passes_for_active_tenant` | Real subscription with `module.lms`. Role has `course.view`. | `GET /api/tenant/courses` | 200 |
| 8 | `test_tenant_with_no_active_subscription_gets_403` | No subscription record created. Mock uses real `EloquentTenantModuleEntitlementChecker` (no mock — let real implementation run). | `GET /api/tenant/quizzes` | 403, `MODULE_NOT_AVAILABLE` |
| 9 | `test_middleware_runs_before_capability_check` | Mock: `isModuleEntitled` returns `false` for `module.exams`. Role also has NO capabilities. | `GET /api/tenant/quizzes` | 403, `MODULE_NOT_AVAILABLE` (NOT `INSUFFICIENT_CAPABILITY` — module check fires first) |

### 8.4 Test Implementation Notes

**For tests #5 and #6** (real override behavior): These tests should use real DB setup with `module_entitlement_overrides` table rows rather than mocking, so they exercise the actual `EloquentTenantModuleEntitlementChecker`. The `subscription_plans` table must have a plan with the `modules` JSON column set correctly.

**For test #8** (no subscription): Do NOT mock the entitlement checker. Let the real `EloquentTenantModuleEntitlementChecker` run. It will look up the subscription and find none, returning `false`. The middleware will then return 403.

**For test #4** (capability distinct from module): Grant the module via mock but assign the user to a role with zero capabilities seeded via `SeedsTestCapabilities`.

**Template for test #2 (denial test):**

```php
public function test_tenant_without_module_gets_403_module_not_available(): void
{
    $entitlementChecker = $this->createMock(TenantModuleEntitlementCheckerInterface::class);
    $entitlementChecker->method('isModuleEntitled')->willReturn(false);
    $entitlementChecker->method('getEffectiveEntitlements')
        ->willReturn(ModuleEntitlementSet::fromArray([]));
    $this->app->instance(TenantModuleEntitlementCheckerInterface::class, $entitlementChecker);

    $response = $this->getJsonAsTenantUser($this->user, $this->tenant, '/api/tenant/quizzes');

    $response->assertStatus(403)
             ->assertJsonPath('error.code', 'MODULE_NOT_AVAILABLE');
}
```

**Template for test #9 (pipeline order):**

```php
public function test_middleware_runs_before_capability_check(): void
{
    // Module is NOT entitled
    $entitlementChecker = $this->createMock(TenantModuleEntitlementCheckerInterface::class);
    $entitlementChecker->method('isModuleEntitled')->willReturn(false);
    $this->app->instance(TenantModuleEntitlementCheckerInterface::class, $entitlementChecker);

    // User also has NO capabilities — if capability check runs first, it returns INSUFFICIENT_CAPABILITY
    // If module check runs first (correct behavior), it returns MODULE_NOT_AVAILABLE

    $response = $this->getJsonAsTenantUser($this->user, $this->tenant, '/api/tenant/quizzes');

    $response->assertStatus(403)
             ->assertJsonPath('error.code', 'MODULE_NOT_AVAILABLE');
             // Must NOT be 'INSUFFICIENT_CAPABILITY'
}
```

---

## 9. Implementation Sequence

Tasks must be completed in this order. Each step depends on the previous.

| Step | Task | Files Touched | Dependency |
|---|---|---|---|
| 1 | Add `module.certificates` and `module.communication` to `ModuleCode` | `ValueObjects/ModuleCode.php` | None |
| 2 | Add `module.certificates` and `module.communication` to `ModuleCapabilityMap` | `Services/ModuleCapabilityMap.php` | Step 1 |
| 3 | Make `EnforceModuleEntitlement` `final` and fix error message | `Http/Middleware/EnforceModuleEntitlement.php` | None |
| 4 | Register `tenant.module` alias in `bootstrap/app.php` | `bootstrap/app.php` | Step 3 |
| 5 | Run PHPStan to confirm no errors before touching routes | — | Steps 1–4 |
| 6 | Add `tenant.module` outer group to all 14 route files (§4 mapping) | `routes/tenant_dashboard/*.php` × 14 | Step 4 |
| 7 | Run full test suite — identify which tests now fail due to missing module mock | — | Step 6 |
| 8 | Add entitlement checker mock to all identified failing tests | `tests/Feature/TenantAdminDashboard/**/*Test.php` | Step 7 |
| 9 | Run full test suite again — all pre-existing tests must pass | — | Step 8 |
| 10 | Write new `ModuleEntitlementMiddlewareTest.php` with all 9 test cases | `tests/Feature/Middleware/ModuleEntitlementMiddlewareTest.php` | Step 4, 6 |
| 11 | Run new test suite — all 9 new tests must pass | — | Step 10 |
| 12 | Run PHPStan Level 5 — confirm zero new errors | — | Steps 1–11 |
| 13 | Verify middleware pipeline order via `php artisan route:list` | — | Step 6 |
| 14 | Submit plan for Principal Engineer review of flagged route files | — | Step 13 |

---

## 10. Quality Gate Verification

| # | Gate | Verification Command | Pass Condition |
|---|---|---|---|
| QG-1 | `tenant.module` alias registered | `docker exec -it ubotz_backend grep -rn "tenant.module" bootstrap/` | Returns one line with the alias registration |
| QG-2 | All 14 eligible route files wrapped | `docker exec -it ubotz_backend grep -rn "tenant.module" routes/tenant_dashboard/` | Returns exactly 14 lines, one per eligible route file |
| QG-3 | Non-eligible route files NOT wrapped | `docker exec -it ubotz_backend grep -rn "tenant.module" routes/tenant_dashboard/users.php routes/tenant_dashboard/roles.php routes/tenant_dashboard/settings.php routes/tenant_dashboard/audit_logs.php routes/tenant_dashboard/stats.php routes/tenant_dashboard/usage.php` | 0 results |
| QG-4 | `ModuleCode` has all required constants | `docker exec -it ubotz_backend grep -rn "module.certificates\|module.communication" app/Domain/SuperAdminDashboard/Subscription/ValueObjects/ModuleCode.php` | Both codes found |
| QG-5 | `ModuleCapabilityMap` has entries for new codes | `docker exec -it ubotz_backend grep -rn "CERTIFICATES\|COMMUNICATION" app/Domain/SuperAdminDashboard/Subscription/Services/ModuleCapabilityMap.php` | Both constants found |
| QG-6 | Middleware returns `MODULE_NOT_AVAILABLE` | Test #2 and #3 pass | Green |
| QG-7 | Error code distinct from capability denial | Test #4 and #9 pass | Green |
| QG-8 | Override GRANT works | Test #5 passes | Green |
| QG-9 | Override REVOKE works | Test #6 passes | Green |
| QG-10 | All existing tests pass | `docker exec -it ubotz_backend php artisan test` | 0 failures, 0 errors |
| QG-11 | PHPStan Level 5 clean | `docker exec -it ubotz_backend vendor/bin/phpstan analyse --level=5` | 0 new errors |
| QG-12 | No `env()` outside config | `docker exec -it ubotz_backend grep -rn "env(" app/ routes/ database/` | 0 results |
| QG-13 | Pipeline order verified — `tenant.module` before `tenant.capability` | `docker exec -it ubotz_backend php artisan route:list --path=tenant/quizzes --json` | `tenant.module` middleware appears before `tenant.capability` in the middleware array |
| QG-14 | No Illuminate imports in Domain layer | `docker exec -it ubotz_backend grep -rn "use Illuminate" app/Domain/` | 0 results |
| QG-15 | `EnforceModuleEntitlement` is `final` | `docker exec -it ubotz_backend grep -n "final class EnforceModuleEntitlement" app/Http/Middleware/EnforceModuleEntitlement.php` | 1 result |

---

## 11. Risk Register

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| R1 | Existing tests break because subscriptions don't seed modules | **HIGH** | This is the primary effort. Step 7–8 in the implementation sequence is dedicated to discovering and fixing all such tests. Run the full suite after adding middleware (Step 7) before writing new tests. |
| R2 | `QuizQuestionBankHierarchyTest.php` uses `module_entitlement_overrides` DB rows — may conflict with new middleware mock | **MEDIUM** | Inspect the test. If it already uses override rows, it may work without a mock (real checker respects overrides). If it mocks, verify the mock is complete. |
| R3 | `module.certificates` introduction causes `CertificateIntegrationTest.php` to fail | **HIGH** | Add `module.certificates` to the entitlement mock in that test's setUp. Verified in §2.6 — test is listed for update. |
| R4 | `communication.php` maps to `module.communication` which is new — any tests for FAQs/forums/noticeboards will break | **MEDIUM** | Add `module.communication` to entitlement mocks for any tests hitting `/api/tenant/communication/*` routes. Check `TenantAdminDashboard/Notification/CourseNoticeboardNotificationTest.php` — it may hit communication routes. |
| R5 | Route pipeline order incorrect — `tenant.module` fires AFTER `tenant.capability` | **HIGH** | Verified by QG-13. The outer `Route::middleware('tenant.module')` group must wrap the inner per-route `tenant.capability`. Do not nest them in reverse order. |
| R6 | `EnforceModuleEntitlement` not injecting `TenantModuleEntitlementCheckerInterface` correctly | **MEDIUM** | The interface is already bound in a service provider (from Phase 11). Verify the binding exists via `docker exec -it ubotz_backend php artisan tinker` and `app(TenantModuleEntitlementCheckerInterface::class)`. |
| R7 | Flagged route files later added to Phase 12D without full test audit | **MEDIUM** | Any Principal Engineer approval to add flagged route files to Phase 12D MUST be accompanied by a full test audit for that route file's test suite. Do NOT add any flagged route file without updating corresponding tests. |
| R8 | `CourseCapabilityDenialTest.php` asserts `INSUFFICIENT_CAPABILITY` — with module middleware active, the mock must grant the module | **MEDIUM** | The mock must set `isModuleEntitled` to `true` while the role has no capabilities. Verify the test still asserts `INSUFFICIENT_CAPABILITY` after update (test #4 in new suite validates this distinction). |
| R9 | `DashboardStatsTest.php` listed as already mocking entitlement — verify it hits stats routes only | **LOW** | Stats routes are NOT module-gated. Verify the test does not accidentally hit gated routes. If it does, the mock is already present and should be sufficient. |

---

## 12. File Manifest

### 12.1 Modified Files

| File | Change |
|---|---|
| `app/Http/Middleware/EnforceModuleEntitlement.php` | Add `final`, fix error message to user-friendly text |
| `bootstrap/app.php` | Add `tenant.module` alias |
| `app/Domain/SuperAdminDashboard/Subscription/ValueObjects/ModuleCode.php` | Add `CERTIFICATES` and `COMMUNICATION` constants |
| `app/Domain/SuperAdminDashboard/Subscription/Services/ModuleCapabilityMap.php` | Add entries for `module.certificates` and `module.communication` |
| `routes/tenant_dashboard/course.php` | Wrap in `tenant.module:module.lms` group |
| `routes/tenant_dashboard/course_operations.php` | Wrap in `tenant.module:module.lms` group |
| `routes/tenant_dashboard/course_review.php` | Wrap in `tenant.module:module.lms` group |
| `routes/tenant_dashboard/enrollment.php` | Wrap in `tenant.module:module.lms` group |
| `routes/tenant_dashboard/learning_progress.php` | Wrap in `tenant.module:module.lms` group |
| `routes/tenant_dashboard/prerequisite.php` | Wrap in `tenant.module:module.lms` group |
| `routes/tenant_dashboard/filter_options.php` | Wrap in `tenant.module:module.lms` group |
| `routes/tenant_dashboard/live_session.php` | Wrap in `tenant.module:module.lms` group |
| `routes/tenant_dashboard/exam_hierarchy.php` | Wrap in `tenant.module:module.exams` group |
| `routes/tenant_dashboard/quiz.php` | Wrap in `tenant.module:module.exams` group |
| `routes/tenant_dashboard/assignment.php` | Wrap in `tenant.module:module.exams` group |
| `routes/tenant_dashboard/certificate.php` | Wrap in `tenant.module:module.certificates` group |
| `routes/tenant_dashboard/communication.php` | Wrap in `tenant.module:module.communication` group |
| `routes/tenant_dashboard/payment.php` | Wrap in `tenant.module:module.lms` group |
| `tests/Feature/TenantAdminDashboard/Course/CourseCrudTest.php` | Add entitlement mock to setUp |
| `tests/Feature/TenantAdminDashboard/Course/CourseCapabilityDenialTest.php` | Add entitlement mock to setUp (grants module, denies capability) |
| `tests/Feature/TenantAdminDashboard/Course/CourseIdempotencyTest.php` | Add entitlement mock to setUp |
| `tests/Feature/TenantAdminDashboard/Course/CourseIsolationTest.php` | Add entitlement mock to setUp |
| `tests/Feature/TenantAdminDashboard/Course/CourseValidationTest.php` | Add entitlement mock to setUp |
| `tests/Feature/TenantAdminDashboard/Course/CourseClassificationTest.php` | Add entitlement mock to setUp |
| `tests/Feature/TenantAdminDashboard/Course/CourseCreationQuotaTest.php` | Add entitlement mock to setUp |
| `tests/Feature/TenantAdminDashboard/Course/CourseStatisticsTest.php` | Add entitlement mock to setUp |
| `tests/Feature/TenantAdminDashboard/Course/CourseReportTest.php` | Add entitlement mock to setUp |
| `tests/Feature/TenantAdminDashboard/Course/CourseShareLinksTest.php` | Add entitlement mock to setUp |
| `tests/Feature/TenantAdminDashboard/Course/CourseSeoDescriptionTest.php` | Add entitlement mock to setUp |
| `tests/Feature/TenantAdminDashboard/Course/CourseTicketTest.php` | Add entitlement mock to setUp |
| `tests/Feature/TenantAdminDashboard/Course/CourseTypeMigrationTest.php` | Add entitlement mock to setUp |
| `tests/Feature/TenantAdminDashboard/Course/CourseStudentExportTest.php` | Add entitlement mock to setUp |
| `tests/Feature/TenantAdminDashboard/Course/CourseFileCrudTest.php` | Add entitlement mock to setUp |
| `tests/Feature/TenantAdminDashboard/Course/CourseWaitlistFeatureTest.php` | Add entitlement mock to setUp |
| `tests/Feature/TenantAdminDashboard/Course/Batch2FeatureTest.php` | Add entitlement mock to setUp |
| `tests/Feature/TenantAdminDashboard/Course/ChapterCrudTest.php` | Add entitlement mock to setUp |
| `tests/Feature/TenantAdminDashboard/Course/ChapterEnhancementsTest.php` | Add entitlement mock to setUp |
| `tests/Feature/TenantAdminDashboard/Course/TextLessonCrudTest.php` | Add entitlement mock to setUp |
| `tests/Feature/TenantAdminDashboard/Course/TextLessonAttachmentCrudTest.php` | Add entitlement mock to setUp |
| `tests/Feature/TenantAdminDashboard/Course/TextLessonAttachmentTest.php` | Add entitlement mock to setUp |
| `tests/Feature/TenantAdminDashboard/Course/VideoAttachmentTest.php` | Add entitlement mock to setUp |
| `tests/Feature/TenantAdminDashboard/Course/ContentDeleteRequestTest.php` | Add entitlement mock to setUp |
| `tests/Feature/TenantAdminDashboard/Course/FilterOptionTest.php` | Add entitlement mock to setUp |
| `tests/Feature/TenantAdminDashboard/Course/PartnerTeacherTest.php` | Add entitlement mock to setUp |
| `tests/Feature/TenantAdminDashboard/Course/PricingIntegrationTest.php` | Add entitlement mock to setUp |
| `tests/Feature/TenantAdminDashboard/Course/PaymentEnrollmentIntegrationTest.php` | Add entitlement mock to setUp |
| `tests/Feature/TenantAdminDashboard/Course/CertificateIntegrationTest.php` | Add entitlement mock — grant `module.lms` AND `module.certificates` |
| `tests/Feature/TenantAdminDashboard/Enrollment/AdminEnrollmentTest.php` | Add entitlement mock to setUp |
| `tests/Feature/TenantAdminDashboard/Enrollment/EnrollmentControllerTest.php` | Add entitlement mock to setUp |
| `tests/Feature/TenantAdminDashboard/LearningProgress/LearningProgressTest.php` | Add entitlement mock to setUp |
| `tests/Feature/TenantAdminDashboard/LiveSession/LiveSessionIntegrationTest.php` | Add entitlement mock to setUp |
| `tests/Feature/TenantAdminDashboard/Prerequisite/PrerequisiteIntegrationTest.php` | Add entitlement mock to setUp |
| `tests/Feature/TenantAdminDashboard/Review/ReviewIntegrationTest.php` | Add entitlement mock to setUp |
| `tests/Feature/TenantAdminDashboard/Assignment/AssignmentIntegrationTest.php` | Add entitlement mock to setUp — grant `module.exams` |
| `tests/Feature/TenantAdminDashboard/Quiz/QuizQuestionCrudTest.php` | Add entitlement mock to setUp — grant `module.lms`, `module.exams` |
| `tests/Feature/TenantAdminDashboard/Quiz/QuizQuestionBankHierarchyTest.php` | Verify: uses override table — confirm mock OR DB approach is complete |

### 12.2 New Files

| File | Description |
|---|---|
| `tests/Feature/Middleware/ModuleEntitlementMiddlewareTest.php` | 9 new denial and pass-through tests for the `tenant.module` middleware |

### 12.3 Files NOT Changed

| File | Reason |
|---|---|
| `app/Domain/SuperAdminDashboard/Subscription/Services/ModuleEntitlementResolver.php` | No changes needed |
| `app/Infrastructure/Persistence/SuperAdminDashboard/Subscription/EloquentTenantModuleEntitlementChecker.php` | No changes needed |
| `app/Http/Middleware/EnforceTenantCapability.php` | No changes — internal module check remains (defense in depth) |
| All Super Admin override controllers and use cases | Already functional |
| All migration files | Schema already complete |
| All non-tenant-dashboard route files | Not in scope |

---

## Developer Manual Compliance Checklist

Per the Developer Instruction Manual (`Ubotz 2 developer instruction manual .md`), this phase must comply with:

| Rule | Application in Phase 12D |
|---|---|
| No business logic in controllers | ✅ Not applicable — no new controllers |
| No Eloquent in Application layer | ✅ Not applicable — no new use cases |
| No `Illuminate` imports in Domain layer | ✅ `ModuleCode` and `ModuleCapabilityMap` are pure PHP — no Laravel imports |
| `final class` and `declare(strict_types=1)` on all new/modified classes | ✅ `EnforceModuleEntitlement` gets `final`. `ModuleCode` already has `declare(strict_types=1)` and `final`. `ModuleCapabilityMap` already has `declare(strict_types=1)` and `final`. |
| Tenant isolation — every query scoped | ✅ `EnforceModuleEntitlement` uses `TenantContext->getId()` — always tenant-scoped |
| Error responses never expose internals | ✅ Fixed — module code removed from error message |
| PHPStan Level 5 | ✅ Must pass QG-11 |
| All tests pass | ✅ Must pass QG-10 |
| No `env()` outside config | ✅ No new `env()` calls introduced |
| No MySQL ENUMs in migrations | ✅ No new migrations |

---

*End of Document — UBOTZ 2.0 Phase 12D Implementation Plan v1.0 — March 18, 2026*
---

## 13. Current Progress & Status (March 18, 2026)

### 13.1 Completed Actions
The following steps from the Implementation Sequence (§9) have been completed:

1.  **Domain Layer Updates:**
    *   `ModuleCode.php`: Added `CERTIFICATES` and `COMMUNICATION` constants.
    *   `ModuleCapabilityMap.php`: Added mappings for certificates and communication.
2.  **Middleware Registration:**
    *   `EnforceModuleEntitlement.php`: Class made `final`; error message updated to user-friendly version.
    *   `bootstrap/app.php`: `tenant.module` alias registered.
3.  **Route Activation:** All 14 core route files have been wrapped with the `tenant.module` middleware.
    *   *Note:* A syntax error in `course.php` was identified and corrected.

### 13.2 Files Modified
- `app/Domain/SuperAdminDashboard/Subscription/ValueObjects/ModuleCode.php`
- `app/Domain/SuperAdminDashboard/Subscription/Services/ModuleCapabilityMap.php`
- `app/Http/Middleware/EnforceModuleEntitlement.php`
- `bootstrap/app.php`
- `routes/tenant_dashboard/course.php`
- `routes/tenant_dashboard/course_operations.php`
- `routes/tenant_dashboard/course_review.php`
- `routes/tenant_dashboard/enrollment.php`
- `routes/tenant_dashboard/learning_progress.php`
- `routes/tenant_dashboard/prerequisite.php`
- `routes/tenant_dashboard/filter_options.php`
- `routes/tenant_dashboard/live_session.php`
- `routes/tenant_dashboard/exam_hierarchy.php`
- `routes/tenant_dashboard/quiz.php`
- `routes/tenant_dashboard/assignment.php`
- `routes/tenant_dashboard/certificate.php`
- `routes/tenant_dashboard/communication.php`
- `routes/tenant_dashboard/payment.php`

### 13.3 Current Status: Verification & Refinement
We are currently in **Step 7 of the Implementation Sequence**. Initial test runs have identified regressions where module entitlement mocks are missing.

### 13.4 Failing Tests Identifying (Requiring Mocks)
The following test classes are currently failing with `403 MODULE_NOT_AVAILABLE` and require entitlement mocks in their `setUp()` method:

| Test Class | Module(s) Needing Mock |
|---|---|
| `Tests\Feature\TenantAdminDashboard\Course\CertificateIntegrationTest` | `module.certificates` |
| `Tests\Feature\TenantAdminDashboard\Quiz\QuizQuestionBankHierarchyTest` | `module.exams` |
| `Tests\Feature\TenantAdminDashboard\Quiz\QuizQuestionCrudTest` | `module.exams` |
| `Tests\Feature\TenantAdminDashboard\Subscription\SubscriptionEnrollmentTest` | `module.subscription` |
| `Tests\Feature\TenantAdminDashboard\Subscription\SubscriptionPlanCrudTest` | `module.subscription` |

**Next Step:** Implement a shared trait `Tests\Traits\MocksModuleEntitlement` and apply it to these (and other identified) test classes.
