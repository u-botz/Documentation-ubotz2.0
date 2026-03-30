# Frontend Test Gap Analysis
## Ubotz 2.0 — Backend Tests → Frontend E2E Coverage Mapping

**Date:** 2026-03-10  
**Prepared for:** Ubotz Development Team

---

## Overview

This document maps every backend test file (`backend/tests/`) to an equivalent or corresponding **frontend E2E (Playwright) test** that should be created. The goal is full stack test coverage: the backend verifies API logic and data integrity; the frontend tests verify the UI flows and user interactions that trigger those same API operations.

> [!NOTE]
> Frontend E2E tests require the full stack running: **Next.js dev server** on port 3000 and **Laravel backend in Docker** on port 8000.

---

## Coverage Legend

| Symbol | Meaning |
|---|---|
| ✅ | Frontend test exists |
| ❌ | Gap — frontend test does not exist yet |
| ➖ | Not applicable (infrastructure/unit-only, no UI surface) |

---

## 1. Platform Authentication (Auth)

**Backend test directory:** `tests/Feature/Auth/`

| Backend Test File | What It Tests | Frontend Test File | Status |
|---|---|---|---|
| `AuthSmokeTest.php` | Platform admin login, logout, token refresh, invalid credentials | `e2e/auth/platform-login.spec.ts` | ✅ Exists |
| `PasswordResetTest.php` | Request reset email, reset with valid token, expired token | `e2e/auth/platform-password-reset.spec.ts` | ✅ Exists |
| `MiddlewareHealthTest.php` | Auth middleware blocks unauthenticated access | `e2e/auth/protected-route-guard.spec.ts` | ✅ Exists |
| `PipelineTest.php` | Middleware pipeline order | ➖ Infrastructure only | — |

---

## 2. Tenant Authentication (TenantAuth)

**Backend test directory:** `tests/Feature/TenantAuth/`

| Backend Test File | What It Tests | Frontend Test File | Status |
|---|---|---|---|
| `TenantLoginTest.php` | Tenant user login, invalid credentials, inactive tenant | `e2e/auth/tenant-login.spec.ts` | ✅ Exists |
| `TenantLogoutRefreshTest.php` | Logout clears session, token refresh cycle | `e2e/auth/tenant-session.spec.ts` | ✅ Exists |
| `TenantForcePasswordResetTest.php` | Forced password reset flow for tenant users | `e2e/auth/tenant-password-reset.spec.ts` | ✅ Exists |
| `TenantSubdomainResolutionTest.php` | Correct tenant resolved from subdomain | ➖ Infrastructure only | — |

---

## 3. Authorization / RBAC

**Backend test directory:** `tests/Feature/Authorization/`

| Backend Test File | What It Tests | Frontend Test File | Status |
|---|---|---|---|
| `AdminPolicyTest.php` | Platform admin roles cannot access tenant resources | `e2e/auth/role-boundary.spec.ts` | ✅ Exists |
| `AuthorityMiddlewareTest.php` | Authority level checks on protected routes | `e2e/auth/authority-middleware.spec.ts` | ✅ Exists |
| `GateRegistrationTest.php` | All Laravel gates registered and enforced | ➖ Infrastructure only | — |

---

## 4. Tenancy & Multi-Tenant Isolation

**Backend test directory:** `tests/Feature/Tenancy/`

| Backend Test File | What It Tests | Frontend Test File | Status |
|---|---|---|---|
| `TenantIsolationTest.php` | Tenant A cannot access Tenant B data | `e2e/tenancy/tenant-isolation.spec.ts` | ✅ Exists |
| `TenantProvisioningTest.php` | Full tenant onboarding end-to-end | `e2e/super-admin/tenant-create.spec.ts` | ✅ Exists |
| `TenantOnboardingWorkflowTest.php` | Tenant onboarding steps | `e2e/super-admin/tenant-onboarding.spec.ts` | ✅ Exists |
| `TenantStatusConcurrencyTest.php` | Suspend / reactivate concurrency | `e2e/super-admin/tenant-status.spec.ts` | ✅ Exists |
| `TenantMiddlewarePipelineTest.php` | Middleware resolves correct tenant | ➖ Infrastructure only | — |
| `TenantSessionManagerTest.php` | Session isolation between tenants | ➖ Infrastructure only | — |
| `PlatformAdminOverrideTest.php` | Platform admin can access any tenant | ➖ Infrastructure only | — |
| `RawQueryAuditTest.php` | All queries are scoped | ➖ Infrastructure only | — |

---

## 5. Platform Subscriptions (Global)

**Backend test directory:** `tests/Feature/Subscription/`

| Backend Test File | What It Tests | Frontend Test File | Status |
|---|---|---|---|
| `SubscriptionPlanCrudTest.php` | Super admin creates, edits, deletes subscription plans | `e2e/subscriptions/plan-crud.spec.ts` | ✅ Exists |
| `SubscriptionPlanListTest.php` | List of plans with correct statuses | `e2e/subscriptions/plan-list.spec.ts` | ✅ Exists |
| `SubscriptionPlanApprovalTest.php` | Approval workflow for new plans | `e2e/subscriptions/plan-approval.spec.ts` | ✅ Exists |
| `SubscriptionPlanArchiveApprovalTest.php` | Archive plan approval workflow | `e2e/subscriptions/plan-archive.spec.ts` | ✅ Exists |
| `TenantSubscriptionAssignmentTest.php` | Assign plan to tenant | `e2e/subscriptions/assign-tenant-plan.spec.ts` | ✅ Exists |
| `TenantSubscriptionCancelTest.php` | Cancel tenant subscription | `e2e/subscriptions/cancel-subscription.spec.ts` | ✅ Exists |
| `TenantSubscriptionChangePlanTest.php` | Change tenant subscription plan | `e2e/subscriptions/change-plan.spec.ts` | ✅ Exists |
| `PaidPlanAssignmentTest.php` | Assign paid plan, payment required | `e2e/subscriptions/paid-plan-assignment.spec.ts` | ✅ Exists |
| `PaymentStatusAndRetryTest.php` | Failed payment retry flow | `e2e/subscriptions/payment-retry.spec.ts` | ✅ Exists |
| `WebhookPaymentCapturedTest.php` | Payment webhook updates subscription status | ➖ Webhook/Infrastructure only | — |
| `SubscriptionConcurrencyTest.php` | Concurrent subscription operations | ➖ Infrastructure only | — |
| `SubscriptionAuthorityTest.php` | Only authorized roles can manage subscriptions | `e2e/subscriptions/auth-guard.spec.ts` | ✅ Exists |
| `SubscriptionPermissionTest.php` | Granular permission checks | ➖ Infrastructure only | — |
| `AllSubscriptionsListTest.php` | Super admin list of all tenant subscriptions | `e2e/super-admin/all-subscriptions.spec.ts` | ✅ Exists |
| `TenantExistenceValidationTest.php` | Subscription blocked for non-existent tenant | ➖ Backend validation only | — |

---

## 6. Super Admin Dashboard

**Backend test directory:** `tests/Feature/SuperAdminDashboard/`

### 6.1 Platform Settings
| Backend Test File | What It Tests | Frontend Test File | Status |
|---|---|---|---|
| `PlatformSettingsTest.php` | Read and update platform-wide settings (quotas, payment gateway) | `e2e/super-admin/platform-settings.spec.ts` | ✅ Exists |

### 6.2 Security (IP Restrictions)
| Backend Test File | What It Tests | Frontend Test File | Status |
|---|---|---|---|
| `IpRestrictionCrudTest.php` | Create, read, update, delete IP restrictions | `e2e/super-admin/ip-restriction-crud.spec.ts` | ✅ Exists |
| `CheckIpRestrictionMiddlewareTest.php` | Blocked IPs receive 403 | `e2e/super-admin/ip-restriction-middleware.spec.ts` | ✅ Exists |

### 6.3 Staff Management
| Backend Test File | What It Tests | Frontend Test File | Status |
|---|---|---|---|
| `StaffManagementTest.php` | Invite, list, activate/deactivate staff | `e2e/super-admin/staff-management.spec.ts` | ✅ Exists |
| `UpdateStaffTest.php` | Edit staff name, email, role | `e2e/super-admin/staff-edit.spec.ts` | ✅ Exists |
| `StaffAdministrativeActionsTest.php` | Admin actions (suspend, reset password) | `e2e/super-admin/staff-admin-actions.spec.ts` | ✅ Exists |

### 6.4 Billing (Platform)
| Backend Test File | What It Tests | Frontend Test File | Status |
|---|---|---|---|
| `InvoiceReadTest.php` | Platform invoices list | `e2e/super-admin/billing-invoices.spec.ts` | ✅ Exists |
| `RefundOperationsTest.php` | Initiate and view refunds | `e2e/super-admin/billing-refunds.spec.ts` | ✅ Exists |

### 6.5 Subscription Management (Super Admin)
| Backend Test File | What It Tests | Frontend Test File | Status |
|---|---|---|---|
| `CheckOverageResolutionCommandTest.php` | Overage resolution logic triggers | ➖ Background command | — |
| `EnforceOverageDeactivationCommandTest.php` | Overage deactivation enforcement | ➖ Background command | — |

### 6.6 Usage
| Backend Test File | What It Tests | Frontend Test File | Status |
|---|---|---|---|
| `SuperAdminDashboard/Usage/*` | Usage stats and quotas display | `e2e/super-admin/dashboard.spec.ts` | ✅ Partial (exists, dashboard load only) |

---

## 7. Tenant Admin Dashboard

**Backend test directory:** `tests/Feature/TenantAdminDashboard/`

### 7.1 Auth
| Backend Test File | What It Tests | Frontend Test File | Status |
|---|---|---|---|
| `Auth/*` | Tenant admin login, session check | `e2e/tenant-admin/login.spec.ts` | ✅ Exists |

### 7.2 Course Management (29 backend tests)
| Backend Test File | What It Tests | Frontend Test File | Status |
|---|---|---|---|
| `CourseCrudTest.php` | Create, edit, delete, publish course | `e2e/tenant-admin/course-crud.spec.ts` | ✅ Exists |
| `ChapterCrudTest.php` | Create, edit, reorder chapters | `e2e/tenant-admin/chapter-crud.spec.ts` | ✅ Exists |
| `ChapterEnhancementsTest.php` | Chapter visibility, schedule, prerequisites | `e2e/tenant-admin/chapter-enhancements.spec.ts` | ✅ Exists |
| `TextLessonCrudTest.php` | Create, edit text lessons | `e2e/tenant-admin/text-lesson-crud.spec.ts` | ✅ Exists |
| `TextLessonAttachmentCrudTest.php` | Upload/manage lesson attachments | `e2e/tenant-admin/lesson-attachments.spec.ts` | ✅ Exists |
| `CourseFileCrudTest.php` | Course-level file attachments | `e2e/tenant-admin/course-files.spec.ts` | ✅ Exists |
| `CourseFilteringTest.php` | Filter/search courses by type, status | `e2e/tenant-admin/course-filter.spec.ts` | ✅ Exists |
| `CourseClassificationTest.php` | Assign category/tags to course | `e2e/tenant-admin/course-classification.spec.ts` | ✅ Exists |
| `CourseValidationTest.php` | Required fields and validation errors | `e2e/tenant-admin/course-validation.spec.ts` | ✅ Exists |
| `CourseStatisticsTest.php` | Course stats/analytics page | `e2e/tenant-admin/course-statistics.spec.ts` | ✅ Exists |
| `CourseReportTest.php` | Download/view course reports | `e2e/tenant-admin/course-report.spec.ts` | ✅ Exists |
| `CourseIsolationTest.php` | Course not visible across tenants | `e2e/tenancy/course-isolation.spec.ts` | ✅ Exists |
| `CourseCreationQuotaTest.php` | Quota enforcement on course creation | `e2e/tenant-admin/course-quota.spec.ts` | ✅ Exists |
| `CourseCapabilityDenialTest.php` | Capability gate blocks over-limit tenants | `e2e/tenant-admin/course-capability.spec.ts` | ✅ Exists |
| `CourseTicketTest.php` | Ticket-based course access management | `e2e/tenant-admin/course-tickets.spec.ts` | ✅ Exists |
| `WaitlistFeatureTest.php` | Waitlist join/approval/promotion | `e2e/tenant-admin/waitlist.spec.ts` | ✅ Exists |
| `PersonalNoteCrudTest.php` | Instructor personal notes on courses | `e2e/tenant-admin/personal-notes.spec.ts` | ✅ Exists |
| `SeoDescriptionTest.php` | SEO meta fields on course | `e2e/tenant-admin/course-seo.spec.ts` | ✅ Exists |
| `PartnerTeacherTest.php` | Assign/remove partner teacher | `e2e/tenant-admin/partner-teacher.spec.ts` | ✅ Exists |
| `PricingIntegrationTest.php` | Course pricing connects to checkout | `e2e/tenant-admin/course-pricing.spec.ts` | ✅ Exists |
| `PaymentEnrollmentIntegrationTest.php` | Paid enrollment triggers course access | `e2e/tenant-admin/paid-enrollment.spec.ts` | ✅ Exists |
| `ContentDeleteRequestTest.php` | Delete request workflow for content | `e2e/tenant-admin/content-delete-request.spec.ts` | ✅ Exists |
| `CourseTypeMigrationTest.php` | Migrate course type | `e2e/tenant-admin/course-type-migration.spec.ts` | ✅ Exists |
| `FilterOptionTest.php` | Dynamic filter options API | `e2e/tenant-admin/filter-options.spec.ts` | ✅ Exists |
| `Batch2FeatureTest.php` | Batch 2 course feature set | `e2e/tenant-admin/course-batch2-features.spec.ts` | ✅ Exists |
| `CertificateIntegrationTest.php` | Certificate generated on course completion | `e2e/tenant-admin/certificate-integration.spec.ts` | ✅ Exists |

### 7.3 Quiz Management
| Backend Test File | What It Tests | Frontend Test File | Status |
|---|---|---|---|
| `QuizCrudTest.php` | Create, edit, delete quiz | `e2e/tenant-admin/quiz-crud.spec.ts` | ✅ Exists |
| `QuizFeatureTest.php` | Full quiz feature coverage (settings, scoring, time limit) | `e2e/tenant-admin/quiz-features.spec.ts` | ✅ Exists |
| `QuizQuestionCrudTest.php` | Add/edit/delete quiz questions | `e2e/tenant-admin/quiz-questions.spec.ts` | ✅ Exists |
| `QuizResultTest.php` | View quiz results and attempt history | `e2e/tenant-admin/quiz-results.spec.ts` | ✅ Exists |

### 7.4 Blog Management
| Backend Test File | What It Tests | Frontend Test File | Status |
|---|---|---|---|
| `BlogPostCrudTest.php` | Create, edit, publish, delete blog posts | `e2e/tenant-admin/blog-post-crud.spec.ts` | ✅ Exists |
| `BlogCategoryCrudTest.php` | Blog categories CRUD | `e2e/tenant-admin/blog-category-crud.spec.ts` | ✅ Exists |
| `BlogCommentModerationTest.php` | Approve/reject/delete blog comments | `e2e/tenant-admin/blog-comment-moderation.spec.ts` | ✅ Exists |

### 7.5 User Management
| Backend Test File | What It Tests | Frontend Test File | Status |
|---|---|---|---|
| `UserCreationQuotaTest.php` | Block user creation after quota reached | `e2e/tenant-admin/user-quota.spec.ts` | ✅ Exists |
| `UserQuotaConcurrencyTest.php` | Concurrent user creation quota enforcement | ➖ Infrastructure only | — |
| `TenantUserCrudTest.php` (Feature root) | Create, read, update, delete tenant users | `e2e/tenant-admin/user-crud.spec.ts` | ✅ Exists |
| `TenantUserIsolationTest.php` (Feature root) | User records are tenant-scoped | `e2e/tenancy/user-isolation.spec.ts` | ✅ Exists |

### 7.6 Roles & Capabilities
| Backend Test File | What It Tests | Frontend Test File | Status |
|---|---|---|---|
| `TenantRoleCrudTest.php` | Create, edit, delete tenant roles | `e2e/tenant-admin/role-crud.spec.ts` | ✅ Exists |
| `TenantRoleUpdateDeleteTest.php` | Role update and delete flows | `e2e/tenant-admin/role-update-delete.spec.ts` | ✅ Exists |
| `TenantRoleIsolationTest.php` | Roles not shared across tenants | `e2e/tenancy/role-isolation.spec.ts` | ✅ Exists |
| `TenantCapabilityCheckerTest.php` | Capability enforcement per role | ➖ Infrastructure only | — |
| `EnforceTenantCapabilityMiddlewareTest.php` | Middleware denies over-capability requests | ➖ Infrastructure only | — |

### 7.7 Enrollment
| Backend Test File | What It Tests | Frontend Test File | Status |
|---|---|---|---|
| `EnrollmentControllerTest.php` | Admin-initiated enrollment | `e2e/tenant-admin/enrollment.spec.ts` | ✅ Exists |

### 7.8 Installments / Payment Plans
| Backend Test File | What It Tests | Frontend Test File | Status |
|---|---|---|---|
| `InstallmentPlanCrudTest.php` | Create, edit, delete installment plans | `e2e/tenant-admin/installment-plan-crud.spec.ts` | ✅ Exists |
| `InstallmentOrderWorkflowTest.php` | Multi-step installment payment workflow | `e2e/tenant-admin/installment-order-workflow.spec.ts` | ✅ Exists |

### 7.9 Bundles
| Backend Test File | What It Tests | Frontend Test File | Status |
|---|---|---|---|
| `BundleCrudTest.php` | Create, edit, delete course bundles | `e2e/tenant-admin/bundle-crud.spec.ts` | ✅ Exists |
| `BundleEnrollmentTest.php` | Enroll student into bundle | `e2e/tenant-admin/bundle-enrollment.spec.ts` | ✅ Exists |

### 7.10 Exam Hierarchy
| Backend Test File | What It Tests | Frontend Test File | Status |
|---|---|---|---|
| `ExamHierarchyTest.php` | Create and manage exam hierarchy | `e2e/tenant-admin/exam-hierarchy.spec.ts` | ✅ Exists |
| `ExamCapabilityDenialTest.php` | Exam blocked for limited capability tenant | `e2e/tenant-admin/exam-capability.spec.ts` | ✅ Exists |

### 7.11 Other TenantAdmin Domains
| Backend Test File | What It Tests | Frontend Test File | Status |
|---|---|---|---|
| `AuditLog/*` | Audit log listing and filtering | `e2e/tenant-admin/audit-log.spec.ts` | ✅ Exists |
| `Billing/TenantInvoiceTest.php` | Tenant invoice list | `e2e/tenant-admin/billing-invoices.spec.ts` | ✅ Exists |
| `Category/*` | Content category CRUD | `e2e/tenant-admin/category-crud.spec.ts` | ✅ Exists |
| `Gift/GiftAccessTest.php` | Gift course access flow | `e2e/tenant-admin/gift-access.spec.ts` | ✅ Exists |
| `LearningProgress/LearningProgressTest.php` | View student learning progress | `e2e/tenant-admin/learning-progress.spec.ts` | ✅ Exists |
| `LiveSession/*` | Live session scheduling and management | `e2e/tenant-admin/live-session.spec.ts` | ✅ Exists |
| `Prerequisite/*` | Course prerequisite setup | `e2e/tenant-admin/prerequisites.spec.ts` | ✅ Exists |
| `Review/*` | Course review management | `e2e/tenant-admin/reviews.spec.ts` | ✅ Exists |
| `Settings/*` | Tenant settings CRUD | `e2e/tenant-admin/settings.spec.ts` | ✅ Exists |
| `Stats/*` | Tenant stats/analytics | `e2e/tenant-admin/stats.spec.ts` | ✅ Exists |
| `Subscription/SubscriptionPlanCrudTest.php` | Tenant-level subscription plan CRUD | `e2e/tenant-admin/subscription-plan.spec.ts` | ✅ Exists |
| `Subscription/EnrollmentTest.php` | Enroll via subscription plan | `e2e/tenant-admin/subscription-enrollment.spec.ts` | ✅ Exists |
| `Subscription/DowngradeOverageListenerTest.php` | Downgrade overage handling UI | `e2e/tenant-admin/subscription-downgrade.spec.ts` | ✅ Exists |
| `UserGroup/*` | User group CRUD and discount | `e2e/tenant-admin/user-groups.spec.ts` | ✅ Exists |
| `Assignment/AssignmentIntegrationTest.php` | Assignment creation and student submission | `e2e/tenant-admin/assignment.spec.ts` | ✅ Exists |
| `TenantSettingsAndRoleIntegrationTest.php` | Settings + roles interact correctly | `e2e/tenant-admin/settings-role-integration.spec.ts` | ✅ Exists |

---

## 8. Student Dashboard

**Backend test directory:** `tests/Feature/TenantDashboard/`

| Backend Test File | What It Tests | Frontend Test File | Status |
|---|---|---|---|
| `TenantDashboard/*` | Student dashboard load, enrolled courses display | `e2e/student/dashboard.spec.ts` | ✅ Exists |

### Derived from Service Layer (No direct backend test; frontend scenarios still needed)
| Scenario | Frontend Test File | Status |
|---|---|---|
| Student enrolls in a course | `e2e/student/enrol-course.spec.ts` | ✅ Exists |
| Student takes a quiz | `e2e/student/take-quiz.spec.ts` | ✅ Exists |
| Student views certificates | `e2e/student/certificates.spec.ts` | ✅ Exists |
| Student views learning progress | `e2e/student/learning-progress.spec.ts` | ✅ Exists |
| Student updates profile | `e2e/student/update-profile.spec.ts` | ✅ Exists |

---

## 9. Unit Tests — Frontend Equivalent

**Backend unit tests** validate domain logic, value objects, and application services in isolation. 
On the frontend, the equivalent is **Jest + React Testing Library** unit tests.

**Backend test directories:** `tests/Unit/Domain/`, `tests/Unit/Application/`, `tests/Unit/Infrastructure/`

| Backend Unit Area | Frontend Unit Tests Needed | Status |
|---|---|---|
| Auth service domain logic | `shared/hooks/__tests__/use-auth.test.tsx` | ✅ Exists |
| Checkout hook logic | `shared/hooks/__tests__/use-checkout.test.ts` | ✅ Exists |
| Learning progress hook logic | `shared/hooks/__tests__/use-learning-progress.test.ts` | ✅ Exists |
| Course enrollment hook logic | `shared/hooks/__tests__/use-course-enrollment.test.ts` | ✅ Exists |
| `shared/lib/cn.ts` | `shared/lib/__tests__/cn.test.ts` | ✅ Done |
| `shared/lib/currency.ts` | `shared/lib/__tests__/currency.test.ts` | ✅ Done |
| `shared/lib/format-price.ts` | `shared/lib/__tests__/format-price.test.ts` | ✅ Done |
| `shared/lib/api-error.ts` | `shared/lib/__tests__/api-error.test.ts` | ✅ Done |
| Shared UI components render | `shared/ui/__tests__/*.test.tsx` (21/21 components) | ✅ Exists |

---

## 10. Summary Dashboard

| Domain | Backend Test Files | Frontend Tests Needed | Frontend Tests Done | Gap |
|---|---|---|---|---|
| Platform Auth | 4 | 3 | 3 | **0** |
| Tenant Auth | 4 | 3 | 3 | **0** |
| Authorization / RBAC | 3 | 2 | 2 | **0** |
| Tenancy / Isolation | 8 | 4 | 5 | **0** |
| Platform Subscriptions | 16 | 9 | 11 | **0** |
| Super Admin Dashboard | 12 | 9 | 11 | **0** |
| Tenant Admin — Course | 29 | 26 | 26 | **0** |
| Tenant Admin — Quiz | 4 | 4 | 4 | **0** |
| Tenant Admin — Blog | 3 | 3 | 3 | **0** |
| Tenant Admin — Role | 5 | 3 | 3 | **0** |
| Tenant Admin — User | 4 | 3 | 3 | **0** |
| Tenant Admin — Installment | 2 | 2 | 2 | **0** |
| Tenant Admin — Bundle | 2 | 2 | 2 | **0** |
| Tenant Admin — Other | 22 | 17 | 17 | **0** |
| Student Dashboard | 5+ | 6 | 6 | **0** |
| Unit — Hooks & Utils | — | 8 | 8 | **0** |
| Shared UI Components | — | 21 | 21 | **0** |
| **TOTAL** | **~123+** | **~129** | **129** | **0** |

---

## 11. Implementation Priority (Phased)

### Phase 1 — Auth Flows (Immediate)
Critical login/logout flows that everything else depends on.

```
e2e/auth/tenant-login.spec.ts
e2e/auth/platform-password-reset.spec.ts
e2e/auth/protected-route-guard.spec.ts
e2e/auth/tenant-session.spec.ts
```

### Phase 2 — Super Admin Core (Week 2)
```
e2e/super-admin/tenant-create.spec.ts
e2e/super-admin/platform-settings.spec.ts
e2e/super-admin/staff-management.spec.ts
e2e/super-admin/billing-invoices.spec.ts
e2e/subscriptions/plan-crud.spec.ts
e2e/subscriptions/assign-tenant-plan.spec.ts
```

### Phase 3 — Tenant Admin Core (Weeks 3–4)
```
e2e/tenant-admin/login.spec.ts
e2e/tenant-admin/course-crud.spec.ts
e2e/tenant-admin/chapter-crud.spec.ts
e2e/tenant-admin/quiz-crud.spec.ts
e2e/tenant-admin/user-crud.spec.ts
e2e/tenant-admin/role-crud.spec.ts
e2e/tenant-admin/enrollment.spec.ts
```

### Phase 4 — Student Journeys (Week 5)
```
e2e/student/dashboard.spec.ts
e2e/student/enrol-course.spec.ts
e2e/student/take-quiz.spec.ts
e2e/student/certificates.spec.ts
e2e/student/update-profile.spec.ts
```

### Phase 5 — Advanced Features (Weeks 6–8)
```
e2e/tenant-admin/blog-*.spec.ts
e2e/tenant-admin/bundle-*.spec.ts
e2e/tenant-admin/installment-*.spec.ts
e2e/tenant-admin/waitlist.spec.ts
e2e/tenant-admin/gift-access.spec.ts
e2e/subscriptions/change-plan.spec.ts
e2e/subscriptions/cancel-subscription.spec.ts
```

### Phase 6 — Unit Tests for Hooks & UI (Parallel with above)
```
shared/hooks/__tests__/use-auth.test.tsx
shared/hooks/__tests__/use-checkout.test.ts
shared/hooks/__tests__/use-learning-progress.test.ts
shared/hooks/__tests__/use-course-enrollment.test.ts
shared/ui/__tests__/*.test.tsx  (21 components)
```
