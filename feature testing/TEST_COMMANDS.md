# Ubotz Backend Test Commands

Run the following commands from the `backend/` directory. All commands use the project's Docker environment as per `CLAUDE.md`.

> **All paths below are verified against the actual test file structure.**

---

## 🚀 Phase 11B: Feature Quotas & Overage Handling

### Feature Tests
```powershell
# Usage Dashboard (Super Admin)
docker exec -it ubotz_backend php artisan test tests/Feature/SuperAdminDashboard/Usage/TenantUsageControllerTest.php

# Platform Settings
docker exec -it ubotz_backend php artisan test tests/Feature/SuperAdminDashboard/PlatformSettingsTest.php

# Subscription: Downgrade Overage
docker exec -it ubotz_backend php artisan test tests/Feature/TenantAdminDashboard/Subscription/DowngradeOverageListenerTest.php

# User Creation Quota
docker exec -it ubotz_backend php artisan test tests/Feature/TenantAdminDashboard/User/UserCreationQuotaTest.php
docker exec -it ubotz_backend php artisan test tests/Feature/TenantAdminDashboard/User/UserQuotaConcurrencyTest.php

# Login Session Quota
docker exec -it ubotz_backend php artisan test tests/Feature/TenantAdminDashboard/Auth/LoginSessionQuotaTest.php 
```

### Unit Tests
```powershell
# Overage Domain
docker exec -it ubotz_backend php artisan test tests/Unit/Domain/Subscription/OverageRecordEntityTest.php

# Use Cases
docker exec -it ubotz_backend php artisan test tests/Unit/Application/SuperAdminDashboard/Subscription/UseCases/ExpireTrialsUseCaseTest.php
docker exec -it ubotz_backend php artisan test tests/Unit/Application/SuperAdminDashboard/Subscription/UseCases/ProcessWebhookUseCaseTest.php

# Infrastructure
docker exec -it ubotz_backend php artisan test tests/Unit/Infrastructure/Services/TenantQuotaServiceTest.php
docker exec -it ubotz_backend php artisan test tests/Unit/Infrastructure/Services/PlatformSettingsServiceTest.php
```

---

## 📅 Phase 11A & 8A: Subscription & Plan Management

### Feature Tests
```powershell
docker exec -it ubotz_backend php artisan test tests/Feature/Subscription/SubscriptionPlanCrudTest.php
docker exec -it ubotz_backend php artisan test tests/Feature/Subscription/SubscriptionPlanListTest.php
docker exec -it ubotz_backend php artisan test tests/Feature/Subscription/SubscriptionPlanApprovalTest.php 
docker exec -it ubotz_backend php artisan test tests/Feature/Subscription/SubscriptionPlanArchiveApprovalTest.php - fail
docker exec -it ubotz_backend php artisan test tests/Feature/Subscription/TenantSubscriptionAssignmentTest.php
docker exec -it ubotz_backend php artisan test tests/Feature/Subscription/TenantSubscriptionCancelTest.php
docker exec -it ubotz_backend php artisan test tests/Feature/Subscription/TenantSubscriptionChangePlanTest.php
docker exec -it ubotz_backend php artisan test tests/Feature/Subscription/AllSubscriptionsListTest.php
docker exec -it ubotz_backend php artisan test tests/Feature/Subscription/TenantExistenceValidationTest.php
docker exec -it ubotz_backend php artisan test tests/Feature/Subscription/SubscriptionAuthorityTest.php
docker exec -it ubotz_backend php artisan test tests/Feature/Subscription/SubscriptionPermissionTest.php
docker exec -it ubotz_backend php artisan test tests/Feature/Subscription/SubscriptionConcurrencyTest.php
docker exec -it ubotz_backend php artisan test tests/Feature/Subscription/SubscriptionDebugTest.php

# Expire Trials Integration
docker exec -it ubotz_backend php artisan test "tests/Feature/Feature/Subscription/ExpireTrialsIntegrationTest.php"
```

### Unit Tests
```powershell
docker exec -it ubotz_backend php artisan test tests/Unit/Domain/SubscriptionPlanEntityTest.php
docker exec -it ubotz_backend php artisan test tests/Unit/Domain/PlanStatusTest.php
docker exec -it ubotz_backend php artisan test tests/Unit/Domain/PlanFeaturesTest.php
docker exec -it ubotz_backend php artisan test tests/Unit/Domain/SubscriptionStatusTest.php
docker exec -it ubotz_backend php artisan test tests/Unit/Domain/TenantSubscriptionEntityTest.php
docker exec -it ubotz_backend php artisan test tests/Unit/Domain/SuperAdminDashboard/Subscription/SubscriptionStatusTest.php
docker exec -it ubotz_backend php artisan test tests/Unit/Domain/SuperAdminDashboard/Subscription/TenantSubscriptionEntityTest.php

# Payment Infrastructure
docker exec -it ubotz_backend php artisan test tests/Unit/Infrastructure/Database/Repositories/EloquentPaymentEventRepositoryTest.php
docker exec -it ubotz_backend php artisan test tests/Unit/Infrastructure/PaymentGateway/RazorpaySubscriptionGatewayTest.php

# Payment Use Cases
docker exec -it ubotz_backend php artisan test tests/Unit/Application/TenantAdminDashboard/Payment/InitializeCheckoutUseCaseTest.php  
docker exec -it ubotz_backend php artisan test tests/Unit/Application/TenantAdminDashboard/Payment/ProcessPaymentWebhookUseCaseTest.php

# Pricing Use Cases (Refactored to Course Domain)
docker exec -it ubotz_backend php artisan test tests/Unit/Application/TenantAdminDashboard/Course/ApplyTicketUseCaseTest.php 
docker exec -it ubotz_backend php artisan test tests/Unit/Application/TenantAdminDashboard/Course/CalculateCoursePriceUseCaseTest.php 
```

---

## 🛠️ Phase 10: Instructor Productivity

### Feature Tests
```powershell
# Chapters 
docker exec -it ubotz_backend php artisan test tests/Feature/TenantAdminDashboard/Course/ChapterCrudTest.php
docker exec -it ubotz_backend php artisan test tests/Feature/TenantAdminDashboard/Course/ChapterEnhancementsTest.php

# Course Files & Lessons
docker exec -it ubotz_backend php artisan test tests/Feature/TenantAdminDashboard/Course/CourseFileCrudTest.php 
docker exec -it ubotz_backend php artisan test tests/Feature/TenantAdminDashboard/Course/TextLessonCrudTest.php
docker exec -it ubotz_backend php artisan test tests/Feature/TenantAdminDashboard/Course/TextLessonAttachmentCrudTest.php

# Stats
docker exec -it ubotz_backend php artisan test tests/Feature/TenantAdminDashboard/Stats/DashboardStatsTest.php

# Phase 10C Integration
docker exec -it ubotz_backend php artisan test tests/Feature/TenantAdminDashboard/TenantSettingsAndRoleIntegrationTest.php
```

### Unit Tests
```powershell
docker exec -it ubotz_backend php artisan test tests/Unit/TenantAdminDashboard/Course/Entities/ChapterEntityTest.php
docker exec -it ubotz_backend php artisan test tests/Unit/TenantAdminDashboard/Course/Entities/CourseFileEntityTest.php
docker exec -it ubotz_backend php artisan test tests/Unit/TenantAdminDashboard/Course/ValueObjects/ChapterStatusTest.php
```

---

## 🎓 Phase 9: Course & Exam Domain

### Feature Tests
```powershell
# Course CRUD & Security
docker exec -it ubotz_backend php artisan test tests/Feature/TenantAdminDashboard/Course/CourseCrudTest.php 
docker exec -it ubotz_backend php artisan test tests/Feature/TenantAdminDashboard/Course/CourseFilteringTest.php
docker exec -it ubotz_backend php artisan test tests/Feature/TenantAdminDashboard/Course/CourseValidationTest.php
docker exec -it ubotz_backend php artisan test tests/Feature/TenantAdminDashboard/Course/CourseIdempotencyTest.php
docker exec -it ubotz_backend php artisan test tests/Feature/TenantAdminDashboard/Course/CourseIsolationTest.php
docker exec -it ubotz_backend php artisan test tests/Feature/TenantAdminDashboard/Course/CourseCapabilityDenialTest.php
docker exec -it ubotz_backend php artisan test tests/Feature/TenantAdminDashboard/Course/PartnerTeacherTest.php

# Quiz
docker exec -it ubotz_backend php artisan test tests/Feature/TenantAdminDashboard/Quiz/QuizCrudTest.php 
docker exec -it ubotz_backend php artisan test tests/Feature/TenantAdminDashboard/Quiz/QuizQuestionCrudTest.php

# Exam Hierarchy
docker exec -it ubotz_backend php artisan test tests/Feature/TenantAdminDashboard/ExamHierarchy/ExamHierarchyTest.php
docker exec -it ubotz_backend php artisan test tests/Feature/TenantAdminDashboard/ExamHierarchy/ExamCapabilityDenialTest.php

# Enrollment & Payment
docker exec -it ubotz_backend php artisan test tests/Feature/TenantAdminDashboard/Course/PaymentEnrollmentIntegrationTest.php
docker exec -it ubotz_backend php artisan test tests/Feature/TenantAdminDashboard/Enrollment/EnrollmentControllerTest.php 

# Learning Progress
docker exec -it ubotz_backend php artisan test tests/Feature/TenantAdminDashboard/LearningProgress/LearningProgressTest.php

# Prerequisites & Pricing
docker exec -it ubotz_backend php artisan test tests/Feature/TenantAdminDashboard/Prerequisite/PrerequisiteIntegrationTest.php
docker exec -it ubotz_backend php artisan test tests/Feature/TenantAdminDashboard/Course/PricingIntegrationTest.php

# Assignments
docker exec -it ubotz_backend php artisan test tests/Feature/TenantAdminDashboard/Assignment/AssignmentIntegrationTest.php 

# Reviews
docker exec -it ubotz_backend php artisan test tests/Feature/TenantAdminDashboard/Review/ReviewIntegrationTest.php  

# Live Sessions
docker exec -it ubotz_backend php artisan test tests/Feature/TenantAdminDashboard/LiveSession/LiveSessionIntegrationTest.php 

# Certificates
docker exec -it ubotz_backend php artisan test tests/Feature/TenantAdminDashboard/Course/CertificateIntegrationTest.php  
```

### Unit Tests
```powershell
docker exec -it ubotz_backend php artisan test tests/Unit/TenantAdminDashboard/Course/Entities/CourseEntityTest.php 
docker exec -it ubotz_backend php artisan test tests/Unit/TenantAdminDashboard/Course/UseCases/CreateCourseUseCaseTest.php
docker exec -it ubotz_backend php artisan test tests/Unit/TenantAdminDashboard/Course/ValueObjects/CourseSlugTest.php
docker exec -it ubotz_backend php artisan test tests/Unit/TenantAdminDashboard/Course/ValueObjects/CourseStatusTest.php
docker exec -it ubotz_backend php artisan test tests/Unit/TenantAdminDashboard/Quiz/Entities/QuizEntityTest.php
docker exec -it ubotz_backend php artisan test tests/Unit/TenantAdminDashboard/Quiz/Entities/QuizQuestionEntityTest.php

# Use Cases
docker exec -it ubotz_backend php artisan test tests/Unit/Application/TenantAdminDashboard/Assignment/CreateAssignmentUseCaseTest.php 
docker exec -it ubotz_backend php artisan test tests/Unit/Application/TenantAdminDashboard/Assignment/GradeSubmissionUseCaseTest.php
docker exec -it ubotz_backend php artisan test tests/Unit/Application/TenantAdminDashboard/Assignment/SubmitAssignmentMessageUseCaseTest.php
docker exec -it ubotz_backend php artisan test tests/Unit/Application/TenantAdminDashboard/Course/IssueCertificateUseCaseTest.php 
docker exec -it ubotz_backend php artisan test tests/Unit/Application/TenantAdminDashboard/LiveSession/CreateLiveSessionUseCaseTest.php
docker exec -it ubotz_backend php artisan test tests/Unit/Application/TenantAdminDashboard/LiveSession/GenerateJoinLinkUseCaseTest.php 
docker exec -it ubotz_backend php artisan test tests/Unit/Application/TenantAdminDashboard/Prerequisite/CheckPrerequisitesUseCaseTest.php 
docker exec -it ubotz_backend php artisan test tests/Unit/Application/TenantAdminDashboard/Review/ModerateReviewUseCaseTest.php 
docker exec -it ubotz_backend php artisan test tests/Unit/Application/TenantAdminDashboard/Review/SubmitReviewUseCaseTest.php 

# Quiz Use Case (Feature-level)
docker exec -it ubotz_backend php artisan test tests/Feature/Application/TenantAdminDashboard/Quiz/QuizUseCaseTest.php
```

---

## 🏢 Roles & RBAC

### Feature Tests
```powershell
docker exec -it ubotz_backend php artisan test tests/Feature/TenantAdminDashboard/Role/TenantRoleCrudTest.php 
docker exec -it ubotz_backend php artisan test tests/Feature/TenantAdminDashboard/Role/TenantRoleUpdateDeleteTest.php 
docker exec -it ubotz_backend php artisan test tests/Feature/TenantAdminDashboard/Role/TenantRoleIsolationTest.php
docker exec -it ubotz_backend php artisan test tests/Feature/TenantAdminDashboard/Role/TenantCapabilityCheckerTest.php
docker exec -it ubotz_backend php artisan test tests/Feature/TenantAdminDashboard/Role/EnforceTenantCapabilityMiddlewareTest.php 
```

### Unit Tests
```powershell
docker exec -it ubotz_backend php artisan test tests/Unit/Domain/TenantAdminDashboard/Role/Entities/TenantRoleEntityTest.php
docker exec -it ubotz_backend php artisan test tests/Unit/Domain/TenantAdminDashboard/Role/ValueObjects/HierarchyLevelTest.php
docker exec -it ubotz_backend php artisan test tests/Unit/Domain/TenantAdminDashboard/Role/ValueObjects/TenantCapabilityCodeTest.php
```

---

## 🛡️ Core: Multi-Tenancy & Data Isolation

### Feature Tests (Critical Security)
```powershell
docker exec -it ubotz_backend php artisan test tests/Feature/Tenancy/TenantIsolationTest.php 
docker exec -it ubotz_backend php artisan test tests/Feature/Tenancy/TenantProvisioningTest.php
docker exec -it ubotz_backend php artisan test tests/Feature/Tenancy/RawQueryAuditTest.php 
docker exec -it ubotz_backend php artisan test tests/Feature/Tenancy/PlatformAdminOverrideTest.php
docker exec -it ubotz_backend php artisan test tests/Feature/Tenancy/TenantMiddlewarePipelineTest.php
docker exec -it ubotz_backend php artisan test tests/Feature/Tenancy/TenantOnboardingWorkflowTest.php
docker exec -it ubotz_backend php artisan test tests/Feature/Tenancy/TenantSessionManagerTest.php
docker exec -it ubotz_backend php artisan test tests/Feature/Tenancy/TenantStatusConcurrencyTest.php

# Security Boundaries
docker exec -it ubotz_backend php artisan test tests/Feature/SecurityBoundary/CrossTenantDataIsolationTest.php
docker exec -it ubotz_backend php artisan test tests/Feature/SecurityBoundary/CrossContextIsolationTest.php
```

### Unit Tests
```powershell
docker exec -it ubotz_backend php artisan test tests/Unit/Domain/TenantSlugTest.php
docker exec -it ubotz_backend php artisan test tests/Unit/Domain/TenantStatusTest.php
docker exec -it ubotz_backend php artisan test tests/Unit/Infrastructure/Services/TenantSessionManagerTest.php
docker exec -it ubotz_backend php artisan test tests/Unit/Listeners/CreateTenantConfigListenerTest.php
docker exec -it ubotz_backend php artisan test tests/Unit/Listeners/ProvisionDefaultRolesListenerTest.php
docker exec -it ubotz_backend php artisan test tests/Unit/Listeners/SendWelcomeEmailListenerTest.php
```

---

## 🔐 Core: Authentication & Security

### Feature Tests
```powershell
docker exec -it ubotz_backend php artisan test tests/Feature/Auth/AuthSmokeTest.php
docker exec -it ubotz_backend php artisan test tests/Feature/Auth/PipelineTest.php
docker exec -it ubotz_backend php artisan test tests/Feature/Auth/PasswordResetTest.php
docker exec -it ubotz_backend php artisan test tests/Feature/Auth/MiddlewareHealthTest.php
```

### Tenant Authentication
```powershell
docker exec -it ubotz_backend php artisan test tests/Feature/TenantAuth/TenantForcePasswordResetTest.php
docker exec -it ubotz_backend php artisan test tests/Feature/TenantAuth/TenantLoginTest.php
docker exec -it ubotz_backend php artisan test tests/Feature/TenantAuth/TenantSubdomainResolutionTest.php
docker exec -it ubotz_backend php artisan test tests/Feature/TenantAuth/TenantLogoutRefreshTest.php
```

### Authorization Tests
```powershell
docker exec -it ubotz_backend php artisan test tests/Feature/Authorization/AdminPolicyTest.php
docker exec -it ubotz_backend php artisan test tests/Feature/Authorization/AuthorityMiddlewareTest.php
docker exec -it ubotz_backend php artisan test tests/Feature/Authorization/GateRegistrationTest.php
```

---

## 👑 Core: Super Admin (Staff & Roles)

### Feature Tests
```powershell
docker exec -it ubotz_backend php artisan test tests/Feature/SuperAdminDashboard/Staff/StaffManagementTest.php 
docker exec -it ubotz_backend php artisan test tests/Feature/SuperAdminDashboard/Staff/StaffAdministrativeActionsTest.php 
docker exec -it ubotz_backend php artisan test tests/Feature/SuperAdminDashboard/Staff/UpdateStaffTest.php 
```

### Unit Tests
```powershell
docker exec -it ubotz_backend php artisan test tests/Unit/UseCases/CreateStaffUseCaseTest.php
docker exec -it ubotz_backend php artisan test tests/Unit/UseCases/UpdateStaffUseCaseTest.php
docker exec -it ubotz_backend php artisan test tests/Unit/UseCases/UnlockAdminUseCaseTest.php
docker exec -it ubotz_backend php artisan test tests/Unit/UseCases/DeactivateStaffUseCaseTest.php
docker exec -it ubotz_backend php artisan test tests/Unit/UseCases/ForcePasswordResetUseCaseTest.php
docker exec -it ubotz_backend php artisan test tests/Unit/UseCases/SuspendUserUseCaseTest.php
docker exec -it ubotz_backend php artisan test tests/Unit/UseCases/CreateTenantUserUseCaseTest.php

# Admin Domain
docker exec -it ubotz_backend php artisan test tests/Unit/Domain/AdminEntityTest.php
docker exec -it ubotz_backend php artisan test tests/Unit/Domain/AdminStatusTest.php
docker exec -it ubotz_backend php artisan test tests/Unit/Domain/AuthorityLevelTest.php
docker exec -it ubotz_backend php artisan test tests/Unit/Domain/UserEntityTest.php
docker exec -it ubotz_backend php artisan test tests/Unit/Domain/UserStatusTest.php
```

---

## 📋 Misc / Support

```powershell
# Tenant Settings
docker exec -it ubotz_backend php artisan test tests/Feature/TenantAdminDashboard/Settings/TenantSettingsTest.php

# Audit Log
docker exec -it ubotz_backend php artisan test tests/Feature/TenantAdminDashboard/AuditLog/TenantAuditLogTest.php

# Schema Integrity
docker exec -it ubotz_backend php artisan test tests/Unit/SchemaIntegrityTest.php

# Http Trait
docker exec -it ubotz_backend php artisan test tests/Unit/Http/Traits/ResolvesTenantActorTest.php

# Static Analysis (PHPStan)
docker exec -it ubotz_backend ./vendor/bin/phpstan analyse
```

---

## 🧪 All Tests (Full Suite)

```powershell
# Run the entire test suite
docker exec -it ubotz_backend php artisan test

# Run only feature tests
docker exec -it ubotz_backend php artisan test --testsuite=Feature

# Run only unit tests
docker exec -it ubotz_backend php artisan test --testsuite=Unit

# Filter by test name pattern
docker exec -it ubotz_backend php artisan test --filter=TenantUsage
```







