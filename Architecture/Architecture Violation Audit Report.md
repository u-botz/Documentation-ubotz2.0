# UBOTZ 2.0 — Architecture Violation Audit Report

**Audited Against:** Ubotz 2 Developer Instruction Manual v1.0
**Date:** March 6, 2026
**Scope:** Full backend codebase (`backend/app/`, `backend/database/migrations/`)
**Status:** 🔴 Multiple critical violations found

---

## Executive Summary

| Category | Violations | Severity |
|----------|-----------|----------|
| Domain Layer Purity | 2 | HIGH |
| Application Layer Forbidden Patterns | 20+ | CRITICAL |
| Controller Violations | 65+ | HIGH |
| Command Structure | 56 | MEDIUM |
| UseCase Violations | 32 | HIGH |
| Repository Tenant Scoping | 8+ | CRITICAL |
| Migration Standards | 30+ | HIGH |
| Naming Conventions | 29 | MEDIUM |
| **Total** | **240+** | |

---

## 1. DOMAIN LAYER VIOLATIONS — Illuminate Imports (CRITICAL)

**Rule:** `grep -rn 'use Illuminate' app/Domain/` → Must return **0 results**.
**Actual:** 2 violations found.

| File | Line | Import |
|------|------|--------|
| [OverageResourcesDeactivated.php](app/Domain/SuperAdminDashboard/Subscription/Events/OverageResourcesDeactivated.php#L8) | 8 | `use Illuminate\Foundation\Events\Dispatchable;` |
| [DowngradeOverageDetected.php](app/Domain/SuperAdminDashboard/Subscription/Events/DowngradeOverageDetected.php#L8) | 8 | `use Illuminate\Foundation\Events\Dispatchable;` |

**Fix:** Domain events must be pure PHP. Remove `Dispatchable` trait. Events should be dispatched by the UseCase using `event()`, not self-dispatched via the trait.

---

## 2. APPLICATION LAYER — DB::table() Usage (CRITICAL)

**Rule:** No `DB::table()`, `DB::select()`, or `DB::raw()` in Application layer.
**Actual:** 20+ violations across 7 files.

### 2.1 Direct DB Queries in UseCases

| File | Lines | Query |
|------|-------|-------|
| [CreateCourseUseCase.php](app/Application/TenantAdminDashboard/Course/UseCases/CreateCourseUseCase.php#L42) | 42, 117, 127 | `DB::table('course_idempotency_keys')` — idempotency check/insert |
| [CreateQuizQuestionUseCase.php](app/Application/TenantAdminDashboard/Quiz/UseCases/CreateQuizQuestionUseCase.php#L82) | 82, 87 | `DB::table('quiz_questions')`, `DB::table('quizzes')` — total mark update |
| [UpdateQuizQuestionUseCase.php](app/Application/TenantAdminDashboard/Quiz/UseCases/UpdateQuizQuestionUseCase.php#L79) | 79, 84 | `DB::table('quiz_questions')`, `DB::table('quizzes')` — total mark recalc |
| [DeleteQuizQuestionUseCase.php](app/Application/TenantAdminDashboard/Quiz/UseCases/DeleteQuizQuestionUseCase.php#L40) | 40, 45 | `DB::table('quiz_questions')`, `DB::table('quizzes')` — total mark recalc |
| [ReorderQuizQuestionsUseCase.php](app/Application/TenantAdminDashboard/Quiz/UseCases/ReorderQuizQuestionsUseCase.php#L22) | 22 | `DB::table('quiz_questions')` — bulk order update |
| [EnforceOverageDeactivationUseCase.php](app/Application/SuperAdminDashboard/Subscription/UseCases/EnforceOverageDeactivationUseCase.php#L59) | 59, 67, 90 | `DB::table('users')`, `DB::table('courses')`, `DB::table($tableName)` |

### 2.2 Direct DB Queries in Queries

| File | Lines | Query |
|------|-------|-------|
| [GetTenantUsageQuery.php](app/Application/Shared/Quota/Queries/GetTenantUsageQuery.php#L30) | 30 | `DB::table('tenant_subscriptions')` |
| [GetDashboardStatsQuery.php](app/Application/TenantAdminDashboard/Stats/Queries/GetDashboardStatsQuery.php#L61) | 61, 80, 89, 108 | `DB::table('courses')`, `DB::table('exams')`, `DB::table('users')`, `DB::table('tenant_roles')` |

### 2.3 Direct DB Queries in Listeners

| File | Line | Query |
|------|------|-------|
| [DowngradeOverageListener.php](app/Application/SuperAdminDashboard/Subscription/Listeners/DowngradeOverageListener.php#L31) | 31 | `DB::table('tenant_subscriptions')` |

**Fix:** Define query interfaces in the Domain layer. Implement with `DB::table()` in Infrastructure layer.

---

## 3. APPLICATION LAYER — Facade Usage (HIGH)

**Rule:** No `Cache::`, `Storage::`, `Mail::`, `PDF::` facades in Application layer.
**Actual:** 1 violation.

| File | Line | Facade |
|------|------|--------|
| [UpdateTenantStatusUseCase.php](app/Application/SuperAdminDashboard/Tenant/UseCases/UpdateTenantStatusUseCase.php#L14) | 14 | `use Illuminate\Support\Facades\Cache;` |

**Fix:** Define a `CacheInterface` in Domain layer. Inject and implement in Infrastructure.

---

## 4. APPLICATION LAYER — Direct Eloquent Model Usage (HIGH)

| File | Line | Model |
|------|------|-------|
| [DeleteExamUseCase.php](app/Application/TenantAdminDashboard/ExamHierarchy/UseCases/DeleteExamUseCase.php#L28) | 28-34 | `CourseRecord::where(...)` — Direct Eloquent model query |

**Fix:** Use a repository interface method instead of querying `CourseRecord` directly.

---

## 5. APPLICATION LAYER — Generic Exception Usage (HIGH)

**Rule:** Never use generic `\Exception`. Always use domain-specific exceptions.

| File | Line | Issue |
|------|------|-------|
| [ChangeTenantUserPasswordUseCase.php](app/Application/TenantAdminDashboard/Auth/UseCases/ChangeTenantUserPasswordUseCase.php#L29) | 29 | `catch (\Exception $e)` |
| [EnrollStudentUseCase.php](app/Application/TenantAdminDashboard/Course/UseCases/EnrollStudentUseCase.php#L50) | 50 | `throw new Exception("Cannot enroll in a paid course for free.")` |
| [ModerateReviewUseCase.php](app/Application/TenantAdminDashboard/Course/UseCases/ModerateReviewUseCase.php#L33) | 33 | `throw new Exception('Invalid status for moderation')` |
| [EnforceOverageDeactivationUseCase.php](app/Application/SuperAdminDashboard/Subscription/UseCases/EnforceOverageDeactivationUseCase.php#L123) | 123 | `catch (\Exception $e)` |

**Fix:** Create domain exceptions: `PaidCourseEnrollmentException`, `InvalidModerationStatusException`, etc.

---

## 6. USECASE STRUCTURAL VIOLATIONS

### 6.1 Missing `final` Class Modifier

11 UseCases are not declared `final`:

| File | Class |
|------|-------|
| [RequestPasswordResetUseCase.php](app/Application/Auth/UseCases/RequestPasswordResetUseCase.php) | `class RequestPasswordResetUseCase` |
| [ResetPasswordUseCase.php](app/Application/Auth/UseCases/ResetPasswordUseCase.php) | `class ResetPasswordUseCase` |
| [UpdatePlatformSettingsUseCase.php](app/Application/SuperAdminDashboard/PlatformSettings/UseCases/UpdatePlatformSettingsUseCase.php) | `class UpdatePlatformSettingsUseCase` |
| [CheckOverageResolutionUseCase.php](app/Application/SuperAdminDashboard/Subscription/UseCases/CheckOverageResolutionUseCase.php) | `class CheckOverageResolutionUseCase` |
| [EnforceOverageDeactivationUseCase.php](app/Application/SuperAdminDashboard/Subscription/UseCases/EnforceOverageDeactivationUseCase.php) | `class EnforceOverageDeactivationUseCase` |
| [ListCoursePartnerTeachersUseCase.php](app/Application/TenantAdminDashboard/Course/UseCases/ListCoursePartnerTeachersUseCase.php) | `class ListCoursePartnerTeachersUseCase` |
| [SyncCoursePartnerTeachersUseCase.php](app/Application/TenantAdminDashboard/Course/UseCases/SyncCoursePartnerTeachersUseCase.php) | `class SyncCoursePartnerTeachersUseCase` |
| [ListCourseFilterOptionsUseCase.php](app/Application/TenantAdminDashboard/Course/UseCases/ListCourseFilterOptionsUseCase.php) | `class ListCourseFilterOptionsUseCase` |
| [SyncCourseFilterOptionsUseCase.php](app/Application/TenantAdminDashboard/Course/UseCases/SyncCourseFilterOptionsUseCase.php) | `class SyncCourseFilterOptionsUseCase` |
| [ListFilterOptionsUseCase.php](app/Application/TenantAdminDashboard/Course/UseCases/ListFilterOptionsUseCase.php) | `class ListFilterOptionsUseCase` |
| [CreateFilterOptionUseCase.php](app/Application/TenantAdminDashboard/Course/UseCases/CreateFilterOptionUseCase.php) | `class CreateFilterOptionUseCase` |

---

## 7. COMMAND VIOLATIONS

### 7.1 Missing `final` or `final readonly` (36 commands)

Commands that are not `final` or not `final readonly`:

- 6 commands are `class` (not `final`): `CreateCourseFileCommand`, `CreateTextLessonCommand`, `DeleteCourseFileCommand`, `DeleteTextLessonCommand`, `UpdateCourseFileCommand`, `UpdateTextLessonCommand`
- 2 commands are `readonly class` (not `final readonly`): `RequestPasswordResetCommand`, `ResetPasswordCommand`
- 28 commands are `final class` but not `final readonly class` (properties use `public readonly` individually but class not marked `readonly`)

### 7.2 `tenantId` Not First Parameter (8 commands)

Subscription commands where `$adminId` precedes `$tenantId`:

| Command | Current Order |
|---------|--------------|
| `AssignSubscriptionPlanCommand` | `int $adminId, int $tenantId, ...` |
| `AssignSubscriptionToTenantCommand` | `int $adminId, int $tenantId, ...` |
| `CancelSubscriptionCommand` | `int $adminId, int $tenantId` |
| `ChangeTenantPlanCommand` | `int $adminId, int $tenantId, ...` |

### 7.3 Missing `?int $actorId` Parameter (5 commands)

| Command | Issue |
|---------|-------|
| `LoginTenantUserCommand` | Missing actorId (auth context) |
| `MarkNoticeboardAsReadCommand` | Has `userId` but no explicit `actorId` |
| `SubmitAssignmentMessageCommand` | Has `studentId` but no `actorId` |
| `GradeSubmissionCommand` | Has `instructorId` but no `actorId` |
| `CreateNoticeboardCommand` | Has `creatorId` but should have `actorId` |

---

## 8. CONTROLLER VIOLATIONS

### 8.1 Read/Write Split Naming (29 controllers)

**Rule:** Controllers must follow `{Entity}ReadController` / `{Entity}WriteController` naming.
**Actual:** 29 out of 38 controllers combine read/write operations in a single class.

Key violators:
- `QuizController` (handles all CRUD + state changes)
- `CertificateController` (read + write + download)
- `FaqController`, `ForumController`, `NoticeboardController` (all CRUD in one)
- `TicketController`, `SpecialOfferController` (CRUD + validation)
- `TenantAuthController`, `AdminAuthController` (mixed auth operations)
- `TenantUserController`, `AssignmentController`, `EnrollmentController`
- All SuperAdmin controllers

### 8.2 Methods Exceeding 20 Lines (11 methods)

| Controller | Method | Lines |
|-----------|--------|-------|
| `TenantAuthController` | `login()` | 35 |
| `TenantAuthController` | `refresh()` | 36 |
| `AdminAuthController` | `login()` | 43 |
| `AdminAuthController` | `refresh()` | 55 |
| `QuizController` | `store()` | 47 |
| `QuizController` | `update()` | 43 |
| `TenantUserController` | `store()` | 32 |
| `SubscriptionPlanController` | `archive()` | 23 |
| `SubscriptionPlanController` | `unarchive()` | 24 |

### 8.3 Direct Eloquent Usage in Controllers (4 violations)

| Controller | Line | Usage |
|-----------|------|-------|
| [StaffWriteController.php](app/Http/Controllers/Api/SuperAdminDashboard/Staff/StaffWriteController.php#L61) | 61, 90, 115, 140, 165 | `AdminRecord::findOrFail($id)` |
| [TenantAuthController.php](app/Http/Controllers/Api/TenantAdminDashboard/Auth/TenantAuthController.php#L171) | 171 | `UserRecord::find($userId)` |
| [TenantAuthController.php](app/Http/Controllers/Api/TenantAdminDashboard/Auth/TenantAuthController.php#L199) | 199 | `TenantAuditLogRecord::create([...])` |

### 8.4 Business Logic in Controllers (7 violations)

| Controller | Issue |
|-----------|-------|
| `TenantAuthController` | Cookie domain detection logic |
| `RelatedCourseController` | Self-reference validation |
| `CertificateController` | Authorization + file existence checks |
| `PrerequisiteController` | Array mapping with domain entities |
| `SpecialOfferController` | Complex cloning/mapping logic |
| `TicketController` | Complex cloning/mapping logic |
| `AllSubscriptionsController` | Manual record-to-entity conversion |

### 8.5 Controllers Directly Using Domain Entities (7 violations)

| Controller | Entity Used |
|-----------|------------|
| `FeaturedCourseController` | `FeaturedCourseEntity::create()` |
| `PartnerTeacherController` | `PartnerTeacherEntity::create()` |
| `RelatedCourseController` | `RelatedCourseEntity::create()` |
| `AllSubscriptionsController` | `TenantSubscriptionEntity` conversion |

### 8.6 Syntax Error

| File | Line | Issue |
|------|------|-------|
| [FeaturedCourseController.php](app/Http/Controllers/Api/TenantAdminDashboard/Course/FeaturedCourseController.php#L21) | 21 | `$this->featuredCourseRepository.getAllActive()` — uses `.` instead of `->` |

---

## 9. REPOSITORY TENANT SCOPING VIOLATIONS (CRITICAL)

### 9.1 Interfaces Missing `int $tenantId` (4 interfaces, 12 methods)

| Interface | Methods Missing tenantId |
|-----------|------------------------|
| **PaymentTransactionRepositoryInterface** | `findById(int $id)`, `findByGatewayTransactionId(string $gatewayTransactionId)` |
| **FeaturedCourseRepositoryInterface** | `getAllActive()`, `delete(int $id)` |
| **RelatedCourseRepositoryInterface** | `findByCourseId(int $courseId)`, `save(...)`, `delete(int $courseId, int $relatedId)` |
| **AssignmentSubmissionRepositoryInterface** | `findSubmissionById(int $id)`, `findSubmissionByStudentAndAssignment(...)`, `findSubmissionsByAssignmentId(...)`, `findMessagesBySubmissionId(...)` |

### 9.2 Implementations Without Tenant Scoping (4 repos, 13 queries)

| Repository | Method | Issue |
|-----------|--------|-------|
| **EloquentPaymentTransactionRepository** | `findById()` | `PaymentTransactionRecord::find($id)` — no tenant scope |
| **EloquentPaymentTransactionRepository** | `findByGatewayTransactionId()` | No tenant_id WHERE clause |
| **EloquentPaymentTransactionRepository** | `findByTenantId()` | 🔴 `PaymentTransactionRecord::all()` — returns ALL tenants' data! |
| **EloquentFeaturedCourseRepository** | `getAllActive()` | No tenant_id in query |
| **EloquentFeaturedCourseRepository** | `delete()` | `FeaturedCourseRecord::destroy($id)` — no tenant scope |
| **EloquentRelatedCourseRepository** | `findByCourseId()` | Missing tenant_id check |
| **EloquentRelatedCourseRepository** | `save()` | No tenant validation |
| **EloquentRelatedCourseRepository** | `delete()` | Missing tenant_id check |
| **EloquentAssignmentSubmissionRepository** | `findSubmissionById()` | `AssignmentSubmissionRecord::find($id)` — no tenant scope |
| **EloquentAssignmentSubmissionRepository** | `findSubmissionByStudentAndAssignment()` | Missing tenant_id |
| **EloquentAssignmentSubmissionRepository** | `findSubmissionsByAssignmentId()` | Missing tenant_id |
| **EloquentAssignmentSubmissionRepository** | `findMessagesBySubmissionId()` | Missing tenant_id |

> **🔴 CRITICAL SECURITY BUG:** `EloquentPaymentTransactionRepository::findByTenantId()` calls `PaymentTransactionRecord::all()` — this returns **every payment transaction from every tenant**. This is a data breach vulnerability.

---

## 10. MIGRATION VIOLATIONS

### 10.1 MySQL ENUM Usage (8 violations in 5 files)

**Rule:** No `->enum()` — use `VARCHAR(30)` with PHP validation.

| File | Table | Column |
|------|-------|--------|
| `2026_03_05_031209_create_text_lessons_table.php` | `text_lessons` | `accessibility`, `status` |
| `tenant/2026_03_05_180000_create_pricing_tables.php` | `special_offers` | `status` |
| `tenant/2026_03_05_190000_create_communication_tables.php` | `notices` | `color` |
| `tenant/2026_03_05_211000_create_featured_courses_table.php` | `featured_courses` | `status` |
| `tenant/2026_03_05_170000_create_certificates_tables.php` | `certificate_templates` | `type`, `status` |
| `tenant/2026_03_05_170000_create_certificates_tables.php` | `certificates` | `type` |

### 10.2 DECIMAL/FLOAT for Financial/Score Columns (6 violations)

**Rule:** Use `BIGINT UNSIGNED` with `_cents` suffix.

| File | Table | Column | Type |
|------|-------|--------|------|
| `tenant/2026_03_03_000001_create_quizzes_table.php` | `quizzes` | `pass_mark`, `negative_marking`, `default_mcq_grade`, `total_mark` | `decimal()` |
| `tenant/2026_03_03_000002_create_quiz_questions_table.php` | `quiz_questions` | `grade` | `decimal(6,2)` |
| `tenant/2026_03_05_150000_create_course_reviews_table.php` | `course_reviews` | `average_rating` | `float()` |
| `tenant/2026_03_05_170000_create_certificates_tables.php` | `certificates` | `user_grade` | `decimal(5,2)` |

### 10.3 Financial Columns Missing `_cents` Suffix (2 violations)

| File | Table | Column | Should Be |
|------|-------|--------|-----------|
| `tenant/2026_02_26_200000_create_courses_table.php` | `courses` | `price_amount` | `price_amount_cents` |
| `tenant/2026_03_05_193524_add_org_pricing_to_courses_table.php` | `courses` | `organization_price_amount` | `organization_price_amount_cents` |

### 10.4 Tenant-Scoped Tables Missing `tenant_id` (8 tables)

| Table | File |
|-------|------|
| `tickets` | `tenant/2026_03_05_180000_create_pricing_tables.php` |
| `special_offers` | `tenant/2026_03_05_180000_create_pricing_tables.php` |
| `ticket_users` | `tenant/2026_03_05_180000_create_pricing_tables.php` |
| `live_sessions` | `tenant/2026_03_05_140000_create_live_sessions_table.php` |
| `course_reviews` | `tenant/2026_03_05_150000_create_course_reviews_table.php` |
| `prerequisites` | `tenant/2026_03_05_160000_create_prerequisites_table.php` |
| `featured_courses` | `tenant/2026_03_05_211000_create_featured_courses_table.php` |
| `related_courses` | `tenant/2026_03_05_212000_create_related_courses_table.php` |

### 10.5 Boolean Columns Missing Proper Prefix (5 violations)

| Table | Column | Should Be |
|-------|--------|-----------|
| `quizzes` | `certificate` | `has_certificate` |
| `quizzes` | `enable_cbt_mode` | `is_cbt_mode_enabled` |
| `course_files` | `downloadable` | `is_downloadable` |
| `admins` | `force_password_reset` | `is_force_password_reset` |
| `assignments` | `check_previous_parts` | `should_check_previous_parts` |

### 10.6 Index Naming Violations (8+ indexes)

Unique indexes using `idx_` prefix instead of `unq_`:
- `idx_categories_tenant_slug`, `idx_exams_tenant_slug`, `idx_subjects_tenant_slug`
- `idx_exam_chapters_tenant_slug`, `idx_exam_topics_tenant_slug`
- `idx_course_tags_unique`, `idx_chapter_translation_unique`
- `course_prerequisite_unique` (missing prefix entirely)

---

## 11. PRIORITY REMEDIATION PLAN

### Priority 1: CRITICAL SECURITY (Fix Immediately)

1. **`EloquentPaymentTransactionRepository::findByTenantId()`** — Returns all tenants' payment data. Fix: scope by `tenant_id`.
2. **8 tenant tables missing `tenant_id`** — Add tenant_id columns and foreign keys.
3. **4 repository interfaces missing `$tenantId` parameters** — Add tenant scoping to all methods.
4. **4 repository implementations with unscoped queries** — Add `where('tenant_id', $tenantId)` to every query.

### Priority 2: ARCHITECTURE VIOLATIONS (Fix This Sprint)

5. **20+ `DB::table()` calls in Application layer** — Extract to repository interfaces in Domain, implement in Infrastructure.
6. **Domain layer Illuminate imports** — Remove `Dispatchable` trait from 2 domain events.
7. **Cache facade in Application layer** — Extract to interface.
8. **Direct Eloquent usage in controllers** — Move to UseCases/repositories.
9. **Generic `\Exception` in UseCases** — Create domain-specific exceptions.

### Priority 3: STRUCTURAL COMPLIANCE (Fix This Milestone)

10. **29 controllers not following Read/Write split** — Refactor into `{Entity}ReadController` / `{Entity}WriteController`.
11. **11 methods exceeding 20 lines** — Extract logic to services/commands.
12. **36 commands missing `final readonly`** — Add modifiers.
13. **11 UseCases missing `final`** — Add modifier.
14. **8 enum columns in migrations** — Replace with `VARCHAR(30)`.
15. **6 decimal/float financial columns** — Convert to `BIGINT UNSIGNED` with `_cents` suffix.
16. **Fix syntax error in FeaturedCourseController** — `.` → `->`.

### Priority 4: CONVENTION COMPLIANCE (Fix Before Next Release)

17. **Boolean column naming** — Rename 5 columns to use `is_`/`has_`/`can_` prefix.
18. **Index naming** — Rename unique indexes to use `unq_` prefix.
19. **Financial column suffixes** — Add `_cents` to 2 price columns.
20. **Command parameter ordering** — Move `$tenantId` to first position in 8 commands.
21. **Command actorId** — Add `?int $actorId` to 5 commands.

---

## 12. PRE-COMMIT CHECKLIST RESULTS

| Check | Status | Details |
|-------|--------|---------|
| No `use Illuminate` in Domain | 🔴 FAIL | 2 files |
| No `DB::table()` in Application | 🔴 FAIL | 20+ occurrences |
| No `->enum()` in migrations | 🔴 FAIL | 8 occurrences |
| No `env()` in app code | ✅ PASS | 0 results |
| Every UseCase has tenantId | ⚠️ PARTIAL | Most compliant, some missing |
| Every UseCase has audit logging | ✅ PASS | All audited |
| Events dispatched after commit | ✅ PASS | Mostly correct |
| Every repo method has tenant_id | 🔴 FAIL | 4 interfaces, 4 implementations |
| Every Command is `final` + `strict_types` | 🔴 FAIL | 36 non-final, 6 non-final-non-readonly |
| No generic `\Exception` | 🔴 FAIL | 4 occurrences |
| No Manage* god-classes | ✅ PASS | Remediated |
| Controllers < 20 lines | 🔴 FAIL | 11 methods |

---

## 13. DETAILED IMPLEMENTATION PLANS FOR DEVELOPERS

> **How to use this section:** Each plan is a self-contained task that one developer can pick up and complete. Work through Priority 1 first — these are security bugs that must be fixed before any other work. Each plan includes the exact files to touch, the before/after code pattern, and a verification command.

---

### PLAN 1: Fix `EloquentPaymentTransactionRepository` — Data Breach (P1-SECURITY)

**Assigned Severity:** 🔴 CRITICAL — Tenant data leaks across boundaries
**Estimated Scope:** 2 files, ~45 minutes
**Files to modify:**
- `app/Domain/TenantAdminDashboard/Payment/Repositories/PaymentTransactionRepositoryInterface.php`
- `app/Infrastructure/Persistence/TenantAdminDashboard/Payment/EloquentPaymentTransactionRepository.php`

**Step 1:** Update the interface — add `int $tenantId` to every method:

```php
// BEFORE (DANGEROUS):
public function findById(int $id): ?PaymentTransaction;
public function findByGatewayTransactionId(string $gatewayTransactionId): ?PaymentTransaction;

// AFTER (SAFE):
public function findById(int $tenantId, int $id): ?PaymentTransaction;
public function findByGatewayTransactionId(int $tenantId, string $gatewayTransactionId): ?PaymentTransaction;
```

**Step 2:** Fix the implementation — scope every query by `tenant_id`:

```php
// BEFORE (DATA BREACH):
public function findById(int $id): ?PaymentTransaction
{
    $record = PaymentTransactionRecord::find($id);
    // ...
}

public function findByTenantId(int $tenantId): array
{
    return PaymentTransactionRecord::all();  // ← RETURNS ALL TENANTS' DATA!
}

// AFTER (SAFE):
public function findById(int $tenantId, int $id): ?PaymentTransaction
{
    $record = PaymentTransactionRecord::where('tenant_id', $tenantId)
        ->where('id', $id)
        ->first();
    // ...
}

public function findByTenantId(int $tenantId): array
{
    return PaymentTransactionRecord::where('tenant_id', $tenantId)
        ->get()
        ->map(fn ($r) => $this->toEntity($r))
        ->toArray();
}
```

**Step 3:** Find and update all call sites. Run:
```bash
docker exec -it ubotz_backend grep -rn 'findById\|findByGatewayTransactionId\|findByTenantId' app/ --include="*.php" | grep -i payment
```
Update every caller to pass `$tenantId` as the first argument.

**Step 4:** Write a cross-tenant isolation test:

```php
/** @test */
public function tenant_a_cannot_access_tenant_b_payment_transactions(): void
{
    $tenantA = Tenant::factory()->create();
    $tenantB = Tenant::factory()->create();

    $txA = PaymentTransactionRecord::factory()->create(['tenant_id' => $tenantA->id]);
    $txB = PaymentTransactionRecord::factory()->create(['tenant_id' => $tenantB->id]);

    $repo = app(PaymentTransactionRepositoryInterface::class);

    // Tenant A should NOT see Tenant B's transaction
    $result = $repo->findById($tenantA->id, $txB->id);
    $this->assertNull($result);
}
```

**Verification:**
```powershell
docker exec -it ubotz_backend grep -rn 'PaymentTransactionRecord::all()' app/
# Must return 0 results
docker exec -it ubotz_backend grep -rn 'PaymentTransactionRecord::find(' app/
# Must return 0 results (use where('tenant_id',...)->where('id',...)->first() instead)
```

---

### PLAN 2: Fix Remaining 3 Repository Interfaces + Implementations — Tenant Scoping (P1-SECURITY)

**Assigned Severity:** 🔴 CRITICAL
**Estimated Scope:** 8 files, ~2 hours
**Files to modify:**

| Interface (Domain) | Implementation (Infrastructure) |
|---|---|
| `FeaturedCourseRepositoryInterface.php` | `EloquentFeaturedCourseRepository.php` |
| `RelatedCourseRepositoryInterface.php` | `EloquentRelatedCourseRepository.php` |
| `AssignmentSubmissionRepositoryInterface.php` | `EloquentAssignmentSubmissionRepository.php` |

**For each pair, repeat the same 4-step process from Plan 1:**

1. Add `int $tenantId` as the first parameter to every interface method
2. Add `->where('tenant_id', $tenantId)` to every Eloquent query in the implementation
3. Update all call sites (grep for method name, add `$tenantId` argument)
4. Write a cross-tenant isolation test for each repository

**Pattern to apply uniformly:**

```php
// Interface — BEFORE:
public function findByCourseId(int $courseId): array;
public function delete(int $id): void;

// Interface — AFTER:
public function findByCourseId(int $tenantId, int $courseId): array;
public function delete(int $tenantId, int $id): void;

// Implementation — BEFORE:
FeaturedCourseRecord::where('status', 'active')->get();
FeaturedCourseRecord::destroy($id);

// Implementation — AFTER:
FeaturedCourseRecord::where('tenant_id', $tenantId)->where('status', 'active')->get();
FeaturedCourseRecord::where('tenant_id', $tenantId)->where('id', $id)->delete();
```

**Verification per repository:**
```powershell
docker exec -it ubotz_backend grep -rn '::find(' app/Infrastructure/Persistence/TenantAdminDashboard/ | grep -v 'tenant_id'
# Must return 0 results
docker exec -it ubotz_backend grep -rn '::destroy(' app/Infrastructure/Persistence/TenantAdminDashboard/
# Must return 0 results (use ->where('tenant_id',...)->delete() instead)
```

---

### PLAN 3: Add `tenant_id` to 8 Tenant-Scoped Migration Tables (P1-SECURITY)

**Assigned Severity:** 🔴 CRITICAL
**Estimated Scope:** 1 new migration file + update 8 tables, ~1.5 hours

**Step 1:** Create a single migration to add `tenant_id` to all 8 tables:

```bash
docker exec -it ubotz_backend php artisan make:migration add_tenant_id_to_missing_tables --path=database/migrations/tenant
```

**Step 2:** Write the migration:

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    private const TABLES = [
        'tickets',
        'special_offers',
        'ticket_users',
        'live_sessions',
        'course_reviews',
        'prerequisites',
        'featured_courses',
        'related_courses',
    ];

    public function up(): void
    {
        foreach (self::TABLES as $table) {
            Schema::table($table, function (Blueprint $t) use ($table) {
                $t->unsignedBigInteger('tenant_id')->after('id');

                $t->foreign('tenant_id', "fk_{$table}_tenants")
                    ->references('id')->on('tenants')
                    ->onDelete('cascade');

                // Add composite index for tenant-scoped lookups
                $t->index(['tenant_id'], "idx_{$table}_tenant");
            });
        }
    }

    public function down(): void
    {
        foreach (self::TABLES as $table) {
            Schema::table($table, function (Blueprint $t) use ($table) {
                $t->dropForeign("fk_{$table}_tenants");
                $t->dropIndex("idx_{$table}_tenant");
                $t->dropColumn('tenant_id');
            });
        }
    }
};
```

**Step 3:** Backfill existing rows with correct `tenant_id` by joining through the parent table relationship (e.g., `tickets` → `courses` → `tenant_id`). Write a data migration or artisan command for this.

**Step 4:** Update every Eloquent model for these 8 tables:
- Add `'tenant_id'` to the `$fillable` array
- Add `TenantScopedModel` trait or global scope if not already present

**Step 5:** Update every repository implementation that queries these tables to include `where('tenant_id', $tenantId)`.

**Verification:**
```powershell
docker exec -it ubotz_backend php artisan migrate --pretend
# Review the SQL output before running
docker exec -it ubotz_backend php artisan migrate
docker exec -it ubotz_backend php artisan test --filter=TenantIsolation
```

---

### PLAN 4: Purify Domain Layer — Remove Illuminate Imports (P2-ARCHITECTURE)

**Assigned Severity:** HIGH
**Estimated Scope:** 2 files, ~20 minutes
**Files to modify:**
- `app/Domain/SuperAdminDashboard/Subscription/Events/OverageResourcesDeactivated.php`
- `app/Domain/SuperAdminDashboard/Subscription/Events/DowngradeOverageDetected.php`

**Step 1:** Remove the `Dispatchable` trait import and usage:

```php
// BEFORE:
namespace App\Domain\SuperAdminDashboard\Subscription\Events;

use Illuminate\Foundation\Events\Dispatchable;  // ← DELETE

final class OverageResourcesDeactivated
{
    use Dispatchable;  // ← DELETE

    public function __construct(
        public readonly int $tenantId,
        public readonly array $deactivatedResources,
    ) {}
}

// AFTER:
namespace App\Domain\SuperAdminDashboard\Subscription\Events;

final class OverageResourcesDeactivated
{
    public function __construct(
        public readonly int $tenantId,
        public readonly array $deactivatedResources,
    ) {}
}
```

**Step 2:** Find call sites that use `OverageResourcesDeactivated::dispatch(...)` and change them to `event(new OverageResourcesDeactivated(...))`:

```bash
docker exec -it ubotz_backend grep -rn 'OverageResourcesDeactivated::dispatch\|DowngradeOverageDetected::dispatch' app/
```

**Verification:**
```powershell
docker exec -it ubotz_backend grep -rn 'use Illuminate' app/Domain/
# Must return 0 results
```

---

### PLAN 5: Extract DB::table() from Application Layer to Infrastructure (P2-ARCHITECTURE)

**Assigned Severity:** HIGH
**Estimated Scope:** ~15 files, ~4–6 hours (largest plan)

This is the most impactful refactoring. There are 20+ `DB::table()` calls scattered across 7 Application layer files. Each must be extracted to a Domain interface + Infrastructure implementation.

**Approach:** Group by bounded context, one interface per concern.

#### 5A: Quiz Total Mark Calculations (4 UseCases)

**Files affected:**
- `CreateQuizQuestionUseCase.php` (lines 82, 87)
- `UpdateQuizQuestionUseCase.php` (lines 79, 84)
- `DeleteQuizQuestionUseCase.php` (lines 40, 45)
- `ReorderQuizQuestionsUseCase.php` (line 22)

**Step 1:** Create a Domain interface:

```php
// app/Domain/TenantAdminDashboard/Quiz/Repositories/QuizAggregateQueryInterface.php
<?php

declare(strict_types=1);

namespace App\Domain\TenantAdminDashboard\Quiz\Repositories;

interface QuizAggregateQueryInterface
{
    /**
     * Calculate total marks for a quiz by summing question grades.
     */
    public function calculateTotalMarks(int $tenantId, int $quizId): float;

    /**
     * Update the total_mark field on the quiz record.
     */
    public function updateQuizTotalMark(int $tenantId, int $quizId, float $totalMark): void;

    /**
     * Bulk update question sort orders.
     * @param array<int, int> $questionIdToOrder  [questionId => newOrder]
     */
    public function bulkUpdateQuestionOrder(int $tenantId, int $quizId, array $questionIdToOrder): void;
}
```

**Step 2:** Create the Infrastructure implementation:

```php
// app/Infrastructure/Persistence/TenantAdminDashboard/Quiz/EloquentQuizAggregateQuery.php
<?php

declare(strict_types=1);

namespace App\Infrastructure\Persistence\TenantAdminDashboard\Quiz;

use App\Domain\TenantAdminDashboard\Quiz\Repositories\QuizAggregateQueryInterface;
use Illuminate\Support\Facades\DB;

final class EloquentQuizAggregateQuery implements QuizAggregateQueryInterface
{
    public function calculateTotalMarks(int $tenantId, int $quizId): float
    {
        return (float) DB::table('quiz_questions')
            ->where('tenant_id', $tenantId)
            ->where('quiz_id', $quizId)
            ->sum('grade');
    }

    public function updateQuizTotalMark(int $tenantId, int $quizId, float $totalMark): void
    {
        DB::table('quizzes')
            ->where('tenant_id', $tenantId)
            ->where('id', $quizId)
            ->update(['total_mark' => $totalMark]);
    }

    public function bulkUpdateQuestionOrder(int $tenantId, int $quizId, array $questionIdToOrder): void
    {
        foreach ($questionIdToOrder as $questionId => $order) {
            DB::table('quiz_questions')
                ->where('tenant_id', $tenantId)
                ->where('quiz_id', $quizId)
                ->where('id', $questionId)
                ->update(['order' => $order]);
        }
    }
}
```

**Step 3:** Register the binding in a ServiceProvider:

```php
// In AppServiceProvider or a dedicated QuizServiceProvider:
$this->app->bind(
    QuizAggregateQueryInterface::class,
    EloquentQuizAggregateQuery::class
);
```

**Step 4:** Refactor each UseCase — inject the interface, replace `DB::table()` calls:

```php
// BEFORE (in CreateQuizQuestionUseCase):
$total = DB::table('quiz_questions')
    ->where('quiz_id', $command->quizId)
    ->sum('grade');
DB::table('quizzes')
    ->where('id', $command->quizId)
    ->update(['total_mark' => $total]);

// AFTER:
$total = $this->quizAggregateQuery->calculateTotalMarks($command->tenantId, $command->quizId);
$this->quizAggregateQuery->updateQuizTotalMark($command->tenantId, $command->quizId, $total);
```

#### 5B: Dashboard Stats Queries

**File:** `GetDashboardStatsQuery.php` (lines 61, 80, 89, 108)

**Step 1:** Create interface:

```php
// app/Domain/TenantAdminDashboard/Stats/Repositories/DashboardStatsQueryInterface.php
interface DashboardStatsQueryInterface
{
    public function getCourseCounts(int $tenantId): array;
    public function getExamCount(int $tenantId): int;
    public function getUserCounts(int $tenantId): array;
    public function getRoleCounts(int $tenantId): array;
}
```

**Step 2:** Implement in Infrastructure with `DB::table()` (same queries, properly tenant-scoped).

**Step 3:** Inject into `GetDashboardStatsQuery` and replace all 4 raw queries.

#### 5C: Course Idempotency (CreateCourseUseCase)

**File:** `CreateCourseUseCase.php` (lines 42, 117, 127)

**Step 1:** Create interface:

```php
// app/Domain/TenantAdminDashboard/Course/Repositories/CourseIdempotencyRepositoryInterface.php
interface CourseIdempotencyRepositoryInterface
{
    public function findByKey(int $tenantId, string $idempotencyKey): ?object;
    public function store(int $tenantId, string $idempotencyKey, int $courseId): void;
}
```

**Step 2:** Implement in Infrastructure. **Step 3:** Inject and refactor UseCase.

#### 5D: Tenant Usage Query + Overage Listener + Overage Deactivation

Apply the same pattern for:
- `GetTenantUsageQuery.php` → `TenantUsageQueryInterface`
- `DowngradeOverageListener.php` → `TenantSubscriptionQueryInterface`
- `EnforceOverageDeactivationUseCase.php` → `OverageEnforcementRepositoryInterface`

**Verification (after all 5A–5D complete):**
```powershell
docker exec -it ubotz_backend grep -rn 'DB::table\|DB::select\|DB::raw' app/Application/
# Must return 0 results
docker exec -it ubotz_backend php artisan test
```

---

### PLAN 6: Extract Cache Facade from Application Layer (P2-ARCHITECTURE)

**Assigned Severity:** HIGH
**Estimated Scope:** 3 files, ~30 minutes
**Files to modify:**
- `app/Domain/Shared/Cache/TenantCacheInterface.php` (new)
- `app/Infrastructure/Cache/LaravelTenantCache.php` (new)
- `app/Application/SuperAdminDashboard/Tenant/UseCases/UpdateTenantStatusUseCase.php`

**Step 1:** Define the Domain interface:

```php
// app/Domain/Shared/Cache/TenantCacheInterface.php
<?php

declare(strict_types=1);

namespace App\Domain\Shared\Cache;

interface TenantCacheInterface
{
    public function forget(string $key): void;
    public function put(string $key, mixed $value, int $ttlSeconds): void;
    public function get(string $key): mixed;
}
```

**Step 2:** Create the Infrastructure implementation:

```php
// app/Infrastructure/Cache/LaravelTenantCache.php
<?php

declare(strict_types=1);

namespace App\Infrastructure\Cache;

use App\Domain\Shared\Cache\TenantCacheInterface;
use Illuminate\Support\Facades\Cache;

final class LaravelTenantCache implements TenantCacheInterface
{
    public function forget(string $key): void
    {
        Cache::forget($key);
    }

    public function put(string $key, mixed $value, int $ttlSeconds): void
    {
        Cache::put($key, $value, $ttlSeconds);
    }

    public function get(string $key): mixed
    {
        return Cache::get($key);
    }
}
```

**Step 3:** Bind in ServiceProvider. **Step 4:** Inject `TenantCacheInterface` into the UseCase, remove `use Illuminate\Support\Facades\Cache;`.

**Verification:**
```powershell
docker exec -it ubotz_backend grep -rn 'Facades\\Cache\|Facades\\Storage\|Facades\\Mail' app/Application/
# Must return 0 results
```

---

### PLAN 7: Create Domain Exceptions for Generic `\Exception` Usage (P2-ARCHITECTURE)

**Assigned Severity:** HIGH
**Estimated Scope:** 4 new exception files + 4 UseCase edits, ~45 minutes

**Step 1:** Create the domain exceptions:

```php
// app/Domain/TenantAdminDashboard/Course/Exceptions/PaidCourseEnrollmentException.php
<?php
declare(strict_types=1);
namespace App\Domain\TenantAdminDashboard\Course\Exceptions;

final class PaidCourseEnrollmentException extends \DomainException
{
    public static function cannotEnrollForFree(int $courseId): self
    {
        return new self("Cannot enroll in paid course {$courseId} without payment.");
    }
}

// app/Domain/TenantAdminDashboard/Course/Exceptions/InvalidModerationStatusException.php
<?php
declare(strict_types=1);
namespace App\Domain\TenantAdminDashboard\Course\Exceptions;

final class InvalidModerationStatusException extends \DomainException
{
    public static function withStatus(string $status): self
    {
        return new self("Invalid moderation status: {$status}");
    }
}
```

**Step 2:** Replace in UseCases:

```php
// EnrollStudentUseCase.php — BEFORE:
throw new Exception("Cannot enroll in a paid course for free.");

// AFTER:
throw PaidCourseEnrollmentException::cannotEnrollForFree($command->courseId);

// ModerateReviewUseCase.php — BEFORE:
throw new Exception('Invalid status for moderation');

// AFTER:
throw InvalidModerationStatusException::withStatus($command->status);
```

**Step 3:** In `ChangeTenantUserPasswordUseCase.php` and `EnforceOverageDeactivationUseCase.php`, replace `catch (\Exception $e)` with the specific domain exception types that can actually be thrown.

**Step 4:** Map the new exceptions to HTTP status codes in `app/Exceptions/Handler.php`:

```php
$this->renderable(function (PaidCourseEnrollmentException $e) {
    return response()->json(['error' => $e->getMessage()], 422);
});
$this->renderable(function (InvalidModerationStatusException $e) {
    return response()->json(['error' => $e->getMessage()], 422);
});
```

**Verification:**
```powershell
docker exec -it ubotz_backend grep -rn 'throw new \\Exception\|throw new Exception\|catch (\\Exception' app/Application/
# Must return 0 results
```

---

### PLAN 8: Fix Direct Eloquent Usage in Controllers (P2-ARCHITECTURE)

**Assigned Severity:** HIGH
**Estimated Scope:** 3 controllers, ~1.5 hours

#### 8A: StaffWriteController — `AdminRecord::findOrFail($id)`

**File:** `app/Http/Controllers/Api/SuperAdminDashboard/Staff/StaffWriteController.php`

The controller calls `AdminRecord::findOrFail($id)` at 5 locations (lines 61, 90, 115, 140, 165). This should delegate to a UseCase or at minimum a repository.

**Fix:** Each action (activate, deactivate, update, etc.) should have its own UseCase that accepts a Command with `$adminId`. The UseCase loads the admin via a repository interface.

```php
// BEFORE (controller):
$admin = AdminRecord::findOrFail($id);
// ... business logic ...

// AFTER (controller):
$command = new ActivateAdminCommand(adminId: $id, actorId: $request->user()->id);
$this->activateAdminUseCase->execute($command);
return response()->json(['message' => 'Admin activated'], 200);
```

#### 8B: TenantAuthController — `UserRecord::find()` and `TenantAuditLogRecord::create()`

**File:** `app/Http/Controllers/Api/TenantAdminDashboard/Auth/TenantAuthController.php`

- Line 171: `UserRecord::find($userId)` → Move to the auth UseCase or a token refresh UseCase
- Line 199: `TenantAuditLogRecord::create([...])` → Move audit logging into the UseCase (it should already be there)

#### 8C: Fix Syntax Error in FeaturedCourseController

**File:** `app/Http/Controllers/Api/TenantAdminDashboard/Course/FeaturedCourseController.php`
**Line 21:** Change `.` to `->`:

```php
// BEFORE:
$this->featuredCourseRepository.getAllActive()

// AFTER:
$this->featuredCourseRepository->getAllActive()
```

---

### PLAN 9: Add `final` / `final readonly` to Commands and UseCases (P3-STRUCTURAL)

**Assigned Severity:** MEDIUM
**Estimated Scope:** 47 files, ~1 hour (mechanical find-and-replace)

This is a safe, mechanical change. No logic changes, no tests should break.

**Step 1:** For 6 commands that are plain `class` (no `final`), add `final`:

```bash
# Files: CreateCourseFileCommand, CreateTextLessonCommand, DeleteCourseFileCommand,
#        DeleteTextLessonCommand, UpdateCourseFileCommand, UpdateTextLessonCommand
```

```php
// BEFORE:
class CreateCourseFileCommand

// AFTER:
final class CreateCourseFileCommand
```

**Step 2:** For 2 commands that are `readonly class` (no `final`), add `final`:

```php
// BEFORE:
readonly class RequestPasswordResetCommand

// AFTER:
final readonly class RequestPasswordResetCommand
```

**Step 3:** For 28 commands that are `final class` but not `final readonly class`, upgrade to `final readonly class` and remove individual `readonly` modifiers from properties:

```php
// BEFORE:
final class CreateChapterCommand
{
    public function __construct(
        public readonly int $tenantId,
        public readonly int $courseId,
    ) {}
}

// AFTER:
final readonly class CreateChapterCommand
{
    public function __construct(
        public int $tenantId,
        public int $courseId,
    ) {}
}
```

**Step 4:** For 11 UseCases missing `final`, add the modifier:

```php
// BEFORE:
class ListCoursePartnerTeachersUseCase

// AFTER:
final class ListCoursePartnerTeachersUseCase
```

**Verification:**
```powershell
docker exec -it ubotz_backend grep -rn '^class \|^readonly class ' app/Application/ --include="*Command.php" --include="*UseCase.php"
# Must return 0 results (all should be 'final class' or 'final readonly class')
docker exec -it ubotz_backend php artisan test
```

---

### PLAN 10: Split Controllers into Read/Write (P3-STRUCTURAL)

**Assigned Severity:** MEDIUM
**Estimated Scope:** 29 controllers → 58 controllers, ~3–5 days
**This is the largest refactoring task. Break it into sub-tasks by bounded context.**

**Pattern to follow for each controller:**

**Step 1:** Identify read methods vs write methods:
- **Read:** `index()`, `show()`, `list()`, `get()`, `statistics()`, `verify()`
- **Write:** `store()`, `update()`, `destroy()`, `archive()`, `activate()`, `moderate()`

**Step 2:** Create `{Entity}ReadController` with read methods:

```php
// app/Http/Controllers/Api/TenantAdminDashboard/Quiz/QuizReadController.php
<?php
declare(strict_types=1);
namespace App\Http\Controllers\Api\TenantAdminDashboard\Quiz;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;

final class QuizReadController extends Controller
{
    public function index(ListQuizzesRequest $request): JsonResponse { /* ... */ }
    public function show(int $quizId): JsonResponse { /* ... */ }
}
```

**Step 3:** Create `{Entity}WriteController` with write methods:

```php
// app/Http/Controllers/Api/TenantAdminDashboard/Quiz/QuizWriteController.php
final class QuizWriteController extends Controller
{
    public function store(CreateQuizRequest $request, CreateQuizUseCase $useCase): JsonResponse { /* ... */ }
    public function update(UpdateQuizRequest $request, UpdateQuizUseCase $useCase, int $quizId): JsonResponse { /* ... */ }
    public function destroy(int $quizId, DeleteQuizUseCase $useCase): JsonResponse { /* ... */ }
    public function changeStatus(ChangeQuizStatusRequest $request, ChangeQuizStatusUseCase $useCase, int $quizId): JsonResponse { /* ... */ }
}
```

**Step 4:** Update routes to point to the new controllers. **Step 5:** Delete the original combined controller.

**Suggested task breakdown (assign to different developers):**

| Sub-Task | Controllers | Est. Time |
|----------|------------|-----------|
| 10A: Quiz controllers | `QuizController`, `QuizQuestionController` | 2 hours |
| 10B: Course Communication | `FaqController`, `ForumController`, `NoticeboardController` | 2 hours |
| 10C: Course Management | `FeaturedCourseController`, `PartnerTeacherController`, `RelatedCourseController` | 1.5 hours |
| 10D: Pricing | `TicketController`, `SpecialOfferController` | 1.5 hours |
| 10E: Certificates | `CertificateController`, `CertificateTemplateController` | 1 hour |
| 10F: Assignments | `AssignmentController`, `AssignmentSubmissionController` | 1.5 hours |
| 10G: Auth | `TenantAuthController`, `AdminAuthController` | 2 hours |
| 10H: Users + Enrollment | `TenantUserController`, `EnrollmentController` | 1.5 hours |
| 10I: SuperAdmin | `SubscriptionPlanController`, `TenantSubscriptionController`, `PlatformSettingsController`, `AllSubscriptionsController` | 2 hours |
| 10J: Remaining | `CheckoutController`, `LearningProgressController`, `LiveSessionController`, `CourseReviewController`, `PrerequisiteController`, Usage controllers | 2 hours |

**Route update pattern:**
```php
// BEFORE:
Route::apiResource('quizzes', QuizController::class);

// AFTER:
Route::get('quizzes', [QuizReadController::class, 'index']);
Route::get('quizzes/{quizId}', [QuizReadController::class, 'show']);
Route::post('quizzes', [QuizWriteController::class, 'store']);
Route::put('quizzes/{quizId}', [QuizWriteController::class, 'update']);
Route::delete('quizzes/{quizId}', [QuizWriteController::class, 'destroy']);
```

---

### PLAN 11: Fix Migration Violations — ENUM, DECIMAL, Boolean Naming (P3-STRUCTURAL)

**Assigned Severity:** HIGH (ENUM/DECIMAL) / MEDIUM (naming)
**Estimated Scope:** 1 migration file, ~1 hour

**Step 1:** Create a migration to fix all column type violations at once:

```bash
docker exec -it ubotz_backend php artisan make:migration fix_column_type_violations
```

**Step 2:** Write the migration:

```php
public function up(): void
{
    // ── ENUM → VARCHAR conversions ──
    $enumToVarchar = [
        ['text_lessons', 'accessibility', 30, 'free'],
        ['text_lessons', 'status', 30, 'active'],
        ['special_offers', 'status', 30, 'active'],
        ['notices', 'color', 30, 'info'],
        ['featured_courses', 'status', 30, 'active'],
        ['certificate_templates', 'type', 30, null],
        ['certificate_templates', 'status', 30, 'draft'],
        ['certificates', 'type', 30, null],
    ];

    foreach ($enumToVarchar as [$table, $column, $length, $default]) {
        // MySQL: ALTER TABLE {table} MODIFY {column} VARCHAR({length})
        $defaultClause = $default ? " DEFAULT '{$default}'" : '';
        DB::statement("ALTER TABLE {$table} MODIFY {$column} VARCHAR({$length}){$defaultClause}");
    }

    // ── Boolean column renames ──
    Schema::table('quizzes', function (Blueprint $t) {
        $t->renameColumn('certificate', 'has_certificate');
    });
    Schema::table('course_files', function (Blueprint $t) {
        $t->renameColumn('downloadable', 'is_downloadable');
    });
    Schema::table('admins', function (Blueprint $t) {
        $t->renameColumn('force_password_reset', 'is_force_password_reset');
    });
    Schema::table('assignments', function (Blueprint $t) {
        $t->renameColumn('check_previous_parts', 'should_check_previous_parts');
    });

    // ── Financial column renames ──
    Schema::table('courses', function (Blueprint $t) {
        $t->renameColumn('price_amount', 'price_amount_cents');
        $t->renameColumn('organization_price_amount', 'organization_price_amount_cents');
    });

    // ── Index renames (unique indexes: idx_ → unq_) ──
    // Note: MySQL requires dropping and recreating indexes to rename them
    // Example for one:
    Schema::table('categories', function (Blueprint $t) {
        $t->dropUnique('idx_categories_tenant_slug');
        $t->unique(['tenant_id', 'slug'], 'unq_categories_tenant_slug');
    });
    // Repeat for: exams, subjects, exam_chapters, exam_topics, course_tags,
    //             course_chapter_translations, prerequisites
}
```

**Step 3:** After migration, update all Eloquent models and code references to use the new column names. Search and replace:

```powershell
docker exec -it ubotz_backend grep -rn "price_amount\b" app/ --include="*.php"
docker exec -it ubotz_backend grep -rn "'certificate'" app/ --include="*.php" | grep -v 'certificate_'
docker exec -it ubotz_backend grep -rn "'downloadable'" app/ --include="*.php"
docker exec -it ubotz_backend grep -rn "'force_password_reset'" app/ --include="*.php"
docker exec -it ubotz_backend grep -rn "'check_previous_parts'" app/ --include="*.php"
```

Update every match to use the new column name.

**Verification:**
```powershell
docker exec -it ubotz_backend grep -rn '->enum(' database/migrations/
# Must return 0 results
docker exec -it ubotz_backend php artisan migrate
docker exec -it ubotz_backend php artisan test
```

---

### PLAN 12: Fix Command Parameter Ordering and Missing actorId (P4-CONVENTION)

**Assigned Severity:** MEDIUM
**Estimated Scope:** 12 files, ~1 hour

#### 12A: Reorder `$tenantId` to first position (4 commands)

```php
// BEFORE:
final readonly class AssignSubscriptionPlanCommand
{
    public function __construct(
        public int $adminId,     // ← wrong position
        public int $tenantId,
        public int $planId,
        public string $idempotencyKey,
    ) {}
}

// AFTER:
final readonly class AssignSubscriptionPlanCommand
{
    public function __construct(
        public int $tenantId,    // ← FIRST for tenant-scoped
        public int $adminId,
        public int $planId,
        public string $idempotencyKey,
    ) {}
}
```

Apply to: `AssignSubscriptionPlanCommand`, `AssignSubscriptionToTenantCommand`, `CancelSubscriptionCommand`, `ChangeTenantPlanCommand`

**After reordering:** Update all call sites (controllers creating these commands) to match the new parameter order. Use named arguments to prevent bugs:

```php
$command = new AssignSubscriptionPlanCommand(
    tenantId: $tenantId,
    adminId: $adminId,
    planId: $planId,
    idempotencyKey: $idempotencyKey,
);
```

#### 12B: Add `?int $actorId` to 5 commands

Add `?int $actorId = null` as the last parameter:

```php
// BEFORE:
final readonly class SubmitAssignmentMessageCommand
{
    public function __construct(
        public int $tenantId,
        public int $studentId,
        public int $assignmentId,
        public string $message,
    ) {}
}

// AFTER:
final readonly class SubmitAssignmentMessageCommand
{
    public function __construct(
        public int $tenantId,
        public int $studentId,
        public int $assignmentId,
        public string $message,
        public ?int $actorId = null,  // ← Added for audit trail
    ) {}
}
```

Apply to: `SubmitAssignmentMessageCommand`, `GradeSubmissionCommand`, `MarkNoticeboardAsReadCommand`, `CreateNoticeboardCommand`, `LoginTenantUserCommand`

Update call sites in controllers to pass `actorId: $request->user()->id`.

---

## 14. DEVELOPER ASSIGNMENT MATRIX

| Plan | Priority | Est. Time | Dependencies | Suggested Assignee |
|------|----------|-----------|-------------|-------------------|
| Plan 1 | P1-SECURITY | 45 min | None | Senior Dev |
| Plan 2 | P1-SECURITY | 2 hrs | None | Senior Dev |
| Plan 3 | P1-SECURITY | 1.5 hrs | None | Senior Dev |
| Plan 4 | P2-ARCH | 20 min | None | Any Dev |
| Plan 5 | P2-ARCH | 4–6 hrs | Plan 1, 2 done first | Senior Dev |
| Plan 6 | P2-ARCH | 30 min | None | Any Dev |
| Plan 7 | P2-ARCH | 45 min | None | Any Dev |
| Plan 8 | P2-ARCH | 1.5 hrs | Plan 1, 2 | Mid-Level Dev |
| Plan 9 | P3-STRUCT | 1 hr | None | Any Dev |
| Plan 10 | P3-STRUCT | 3–5 days | Plan 8 | Full Team |
| Plan 11 | P3-STRUCT | 1 hr | None | Mid-Level Dev |
| Plan 12 | P4-CONV | 1 hr | None | Any Dev |

**Parallelization:** Plans 1, 2, 3 can run in parallel (different files). Plans 4, 6, 7, 9, 12 can run in parallel (no overlapping files). Plan 5 should start after Plans 1–2 are merged. Plan 10 should start after Plan 8 is merged.

---

## 15. VERIFICATION CHECKLIST — Run After All Plans Complete

After all plans are implemented, run this complete verification:

```powershell
# 1. Domain layer purity
docker exec -it ubotz_backend grep -rn 'use Illuminate' app/Domain/
# Expected: 0 results

# 2. Application layer purity
docker exec -it ubotz_backend grep -rn 'DB::table\|DB::select\|DB::raw' app/Application/
# Expected: 0 results

docker exec -it ubotz_backend grep -rn 'Facades\\Cache\|Facades\\Storage\|Facades\\Mail' app/Application/
# Expected: 0 results

docker exec -it ubotz_backend grep -rn 'throw new \\Exception\|throw new Exception(' app/Application/
# Expected: 0 results

# 3. Migration standards
docker exec -it ubotz_backend grep -rn '->enum(' database/migrations/
# Expected: 0 results

# 4. No env() in app code
docker exec -it ubotz_backend grep -rn "env(" app/ routes/ database/ --include="*.php" | grep -v 'config/' | grep -v 'vendor/'
# Expected: 0 results

# 5. No unscoped Record::find() in repositories
docker exec -it ubotz_backend grep -rn '::find(\|::findOrFail(\|::destroy(' app/Infrastructure/Persistence/
# Expected: 0 results

# 6. All Commands are final
docker exec -it ubotz_backend grep -rn '^class \|^readonly class ' app/Application/ --include="*Command.php"
# Expected: 0 results

# 7. All UseCases are final
docker exec -it ubotz_backend grep -rn '^class ' app/Application/ --include="*UseCase.php"
# Expected: 0 results

# 8. Full test suite
docker exec -it ubotz_backend php artisan test
# Expected: All tests pass

# 9. Static analysis
docker exec -it ubotz_backend vendor/bin/phpstan analyse app/ --level=5
# Expected: 0 errors
```

---

*End of Audit Report — UBOTZ 2.0 Architecture Violation Audit*

This session is being continued from a previous conversation that ran out of context. The summary below covers the earlier portion of the conversation.

Analysis:
Let me chronologically analyze the conversation:

1. User opened the Architecture Violation Audit Report and asked to fix issues step by step following the document.

2. I read the full audit report (~1400 lines) which documented 240+ violations across 12 categories with detailed remediation plans (Plan 1-12).

3. I created a todo list with all 12 plans and started working through them in priority order.

**Plan 1 (P1-SECURITY): Fix EloquentPaymentTransactionRepository - Data Breach**
- Read PaymentTransactionRepositoryInterface.php and EloquentPaymentTransactionRepository.php
- Found critical bug: `findByTenantId()` called `PaymentTransactionRecord::all()` returning ALL tenants' data
- Updated interface: added `int $tenantId` to `findById()` and `findByGatewayTransactionId()`, changed `findByTenantId(TenantId)` to `findByTenantId(int)`
- Updated implementation: added `->where('tenant_id', $tenantId)` to all queries
- Updated call site in ProcessPaymentWebhookUseCase.php: added tenant ID extraction from webhook payload
- Status: COMPLETED

**Plan 2 (P1-SECURITY): Fix 3 remaining repository interfaces + implementations**
- Fixed FeaturedCourseRepositoryInterface + EloquentFeaturedCourseRepository
- Fixed RelatedCourseRepositoryInterface + EloquentRelatedCourseRepository
- Fixed AssignmentSubmissionRepositoryInterface + EloquentAssignmentSubmissionRepository
- All got `int $tenantId` as first parameter, all implementations got `->where('tenant_id', $tenantId)`
- Updated call sites in FeaturedCourseController and RelatedCourseController (also fixing the `.` → `->` syntax error)
- Status: COMPLETED

**Plan 3 (P1-SECURITY): Add tenant_id to 8 tables**
- Created migration: `2026_03_06_000001_add_tenant_id_to_missing_tables.php`
- Adds tenant_id to: tickets, special_offers, ticket_users, live_sessions, course_reviews, prerequisites, featured_courses, related_courses
- Status: COMPLETED

**Plan 4 (P2-ARCHITECTURE): Purify Domain Layer**
- Removed `use Illuminate\Foundation\Events\Dispatchable` and `use Dispatchable` from:
  - OverageResourcesDeactivated.php
  - DowngradeOverageDetected.php
- Changed `OverageResourcesDeactivated::dispatch(...)` to `event(new OverageResourcesDeactivated(...))` in EnforceOverageDeactivationUseCase
- Status: COMPLETED

**Plan 5 (P2-ARCHITECTURE): Extract DB::table() from Application Layer**
This was the largest refactoring. Created multiple interface + implementation pairs:

5A: Quiz Total Mark Calculations
- Created QuizAggregateQueryInterface (Domain)
- Created EloquentQuizAggregateQuery (Infrastructure)
- Refactored 4 UseCases: CreateQuizQuestionUseCase, UpdateQuizQuestionUseCase, DeleteQuizQuestionUseCase, ReorderQuizQuestionsUseCase

5B: Dashboard Stats
- Created DashboardStatsQueryInterface (Domain)
- Created EloquentDashboardStatsQuery (Infrastructure)
- Refactored GetDashboardStatsQuery

5C: Course Idempotency
- Created CourseIdempotencyRepositoryInterface (Domain)
- Created EloquentCourseIdempotencyRepository (Infrastructure)
- Refactored CreateCourseUseCase

5D: Tenant Subscription + Overage
- Created TenantSubscriptionQueryInterface (Domain)
- Created EloquentTenantSubscriptionQuery (Infrastructure)
- Created OverageEnforcementRepositoryInterface (Domain)
- Created EloquentOverageEnforcementRepository (Infrastructure)
- Refactored GetTenantUsageQuery, DowngradeOverageListener, EnforceOverageDeactivationUseCase

- Registered all bindings in QuizServiceProvider, CourseServiceProvider, AppServiceProvider
- Status: COMPLETED

**Plan 6 (P2-ARCHITECTURE): Extract Cache Facade**
- Created TenantCacheInterface (Domain)
- Created LaravelTenantCache (Infrastructure)
- Updated UpdateTenantStatusUseCase to inject TenantCacheInterface instead of using Cache facade
- Registered binding in AppServiceProvider
- Status: COMPLETED

**Plan 7 (P2-ARCHITECTURE): Create Domain Exceptions**
- Created PaidCourseEnrollmentException
- Created InvalidModerationStatusException
- Updated EnrollStudentUseCase and ModerateReviewUseCase
- Status: COMPLETED

**Plan 8 (P2-ARCHITECTURE): Fix Direct Eloquent in Controllers**
- StaffWriteController: Replaced `AdminRecord::findOrFail($id)` with `$this->adminRepository->findByIdOrFail($id)`, added AdminRepositoryInterface injection
- TenantAuthController: Replaced `UserRecord::find($userId)` with `$this->authRepository->findById()`, replaced `TenantAuditLogRecord::create()` with `$this->auditLogger->logAuthEvent()`
- FeaturedCourseController syntax error was already fixed in Plan 2
- Status: COMPLETED

**Plan 9 (P3-STRUCTURAL): Add final/final readonly**
- Launched TWO background agents:
  - Agent ad63545: Fix missing `final` on 11 UseCases
  - Agent a66b8d3: Fix Commands (6 plain class → final, 2 readonly → final readonly, 28 final class → final readonly class)
- Status: IN PROGRESS (background agents running)

**Plan 10 (P3-STRUCTURAL): Split Controllers into Read/Write**
- Found 32 controllers needing split
- Created QuizReadController.php and QuizWriteController.php (from QuizController)
- Created QuizQuestionWriteController.php (from QuizQuestionController - write only)
- Created CertificateReadController.php (from CertificateController)
- Launched background agent a86dc6e for CourseCommunication controllers (Faq, Forum, Noticeboard)
- Status: IN PROGRESS (partially done, many controllers remaining)

**Plan 11 (P3-STRUCTURAL): Fix Migration Violations**
- Created migration: `2026_03_06_000002_fix_column_type_violations.php`
- Handles: ENUM→VARCHAR, boolean column renames, financial column renames, index renames
- Status: COMPLETED (migration created)

**Plan 12 (P4-CONVENTION): Fix Command Parameter Ordering**
- Launched background agent a36e7a0 for parameter reordering and actorId addition
- Status: IN PROGRESS (background agent running)

Errors encountered:
- Several "File has not been read yet" errors when trying to Write to files that were read in a previous context window segment. Fixed by re-reading the file first.

Background agents still running at time of summary:
- ad63545: UseCases final modifier
- a66b8d3: Commands final/readonly modifier
- a86dc6e: CourseCommunication controller splits
- a36e7a0: Command parameter ordering

Summary:
1. Primary Request and Intent:
   The user opened `backend\documentation\Architecture Violation Audit Report.md` and instructed: "according to the document, proceed to fix the issues in step by step, strictly follow the document." The document contains 240+ architecture violations across 12 remediation plans (Plan 1-12) organized by priority (P1-SECURITY through P4-CONVENTION). The user wants ALL plans executed sequentially following the exact specifications in the audit report.

2. Key Technical Concepts:
   - **Laravel DDD Architecture**: Domain Layer (pure PHP, no Illuminate), Application Layer (UseCases/Commands), Infrastructure Layer (Eloquent implementations), HTTP Layer (Controllers)
   - **Multi-Tenant Data Isolation**: Every query must be scoped by `tenant_id` — violations are critical security bugs
   - **Repository Pattern**: Domain interfaces in `app/Domain/`, implementations in `app/Infrastructure/Persistence/`
   - **CQRS-style Controller Split**: Read operations in `{Entity}ReadController`, write operations in `{Entity}WriteController`
   - **Command Pattern**: Commands must be `final readonly class` with `$tenantId` as first parameter
   - **Domain Events**: Must be pure PHP (no `Dispatchable` trait), dispatched via `event()` helper
   - **Service Provider Bindings**: Interface→Implementation bindings registered in domain-specific ServiceProviders
   - **Migration Standards**: No ENUM (use VARCHAR), no DECIMAL for money (use BIGINT with _cents suffix), boolean columns use is_/has_/can_ prefix, unique indexes use unq_ prefix

3. Files and Code Sections:

   **PLAN 1 — PaymentTransaction Repository (CRITICAL SECURITY FIX)**
   
   - `app/Domain/TenantAdminDashboard/Payment/Repositories/PaymentTransactionRepositoryInterface.php`
     - Added `int $tenantId` as first param to `findById()`, `findByGatewayTransactionId()`, changed `findByTenantId(TenantId)` to `findByTenantId(int)`
     ```php
     public function findById(int $tenantId, int $id): ?PaymentTransaction;
     public function findByGatewayTransactionId(int $tenantId, string $gatewayTransactionId): ?PaymentTransaction;
     public function findByTenantId(int $tenantId): array;
     ```

   - `app/Infrastructure/Persistence/TenantAdminDashboard/Payment/EloquentPaymentTransactionRepository.php`
     - Fixed DATA BREACH: `findByTenantId()` was calling `PaymentTransactionRecord::all()`. Now uses `->where('tenant_id', $tenantId)`
     - All find methods now scope by tenant_id
     ```php
     public function findById(int $tenantId, int $id): ?PaymentTransaction
     {
         $record = PaymentTransactionRecord::where('tenant_id', $tenantId)
             ->where('id', $id)->first();
         // ...
     }
     public function findByTenantId(int $tenantId): array
     {
         return PaymentTransactionRecord::where('tenant_id', $tenantId)
             ->get()->map(fn ($record) => $this->mapToEntity($record))->toArray();
     }
     ```

   - `app/Application/TenantAdminDashboard/Payment/UseCases/ProcessPaymentWebhookUseCase.php`
     - Added `extractTenantId()` method and passes `$tenantId` to `findById()`

   **PLAN 2 — Three More Repository Pairs (CRITICAL SECURITY)**
   
   - `app/Domain/TenantAdminDashboard/Course/Repositories/FeaturedCourseRepositoryInterface.php`
     - Added `int $tenantId` to all methods
   - `app/Infrastructure/Persistence/TenantAdminDashboard/Course/EloquentFeaturedCourseRepository.php`
     - Added `->where('tenant_id', $tenantId)` to all queries, replaced `::destroy()` with scoped delete
   - `app/Domain/TenantAdminDashboard/Course/Repositories/RelatedCourseRepositoryInterface.php`
     - Added `int $tenantId` to all methods
   - `app/Infrastructure/Persistence/TenantAdminDashboard/Course/EloquentRelatedCourseRepository.php`
     - Added tenant scoping to all queries
   - `app/Domain/TenantAdminDashboard/Assignment/Repositories/AssignmentSubmissionRepositoryInterface.php`
     - Added `int $tenantId` to find methods
   - `app/Infrastructure/Persistence/TenantAdminDashboard/Assignment/EloquentAssignmentSubmissionRepository.php`
     - Replaced `::find($id)` with `->where('tenant_id', $tenantId)->where('id', $id)->first()`
   - `app/Http/Controllers/Api/TenantAdminDashboard/Course/FeaturedCourseController.php`
     - Fixed syntax error (`.` → `->`) and added tenant_id passing from `$request->user()->tenant_id`
   - `app/Http/Controllers/Api/TenantAdminDashboard/Course/RelatedCourseController.php`
     - Added tenant_id passing to all repository calls

   **PLAN 3 — Migration for Missing tenant_id**
   
   - `database/migrations/tenant/2026_03_06_000001_add_tenant_id_to_missing_tables.php` (NEW)
     - Adds `tenant_id` column + foreign key + index to 8 tables: tickets, special_offers, ticket_users, live_sessions, course_reviews, prerequisites, featured_courses, related_courses

   **PLAN 4 — Domain Layer Purity**
   
   - `app/Domain/SuperAdminDashboard/Subscription/Events/OverageResourcesDeactivated.php`
     - Removed `use Illuminate\Foundation\Events\Dispatchable;` and `use Dispatchable;`
   - `app/Domain/SuperAdminDashboard/Subscription/Events/DowngradeOverageDetected.php`
     - Same removal
   - `app/Application/SuperAdminDashboard/Subscription/UseCases/EnforceOverageDeactivationUseCase.php`
     - Changed `OverageResourcesDeactivated::dispatch(...)` to `event(new OverageResourcesDeactivated(...))`

   **PLAN 5 — Extract DB::table() (Largest Refactoring)**
   
   - `app/Domain/TenantAdminDashboard/Quiz/Repositories/QuizAggregateQueryInterface.php` (NEW)
     ```php
     interface QuizAggregateQueryInterface {
         public function calculateTotalMarks(int $tenantId, int $quizId): float;
         public function updateQuizTotalMark(int $tenantId, int $quizId, float $totalMark): void;
         public function bulkUpdateQuestionOrder(int $tenantId, int $quizId, array $questionIdToOrder): void;
     }
     ```
   - `app/Infrastructure/Persistence/TenantAdminDashboard/Quiz/EloquentQuizAggregateQuery.php` (NEW)
   - `app/Application/TenantAdminDashboard/Quiz/UseCases/CreateQuizQuestionUseCase.php` — Refactored to inject QuizAggregateQueryInterface
   - `app/Application/TenantAdminDashboard/Quiz/UseCases/UpdateQuizQuestionUseCase.php` — Same
   - `app/Application/TenantAdminDashboard/Quiz/UseCases/DeleteQuizQuestionUseCase.php` — Same
   - `app/Application/TenantAdminDashboard/Quiz/UseCases/ReorderQuizQuestionsUseCase.php` — Replaced DB::table() with injected interface

   - `app/Domain/TenantAdminDashboard/Stats/Repositories/DashboardStatsQueryInterface.php` (NEW)
   - `app/Infrastructure/Persistence/TenantAdminDashboard/Stats/EloquentDashboardStatsQuery.php` (NEW)
   - `app/Application/TenantAdminDashboard/Stats/Queries/GetDashboardStatsQuery.php` — Refactored to use DashboardStatsQueryInterface

   - `app/Domain/TenantAdminDashboard/Course/Repositories/CourseIdempotencyRepositoryInterface.php` (NEW)
   - `app/Infrastructure/Persistence/TenantAdminDashboard/Course/EloquentCourseIdempotencyRepository.php` (NEW)
   - `app/Application/TenantAdminDashboard/Course/UseCases/CreateCourseUseCase.php` — Refactored to use CourseIdempotencyRepositoryInterface

   - `app/Domain/Shared/Quota/Repositories/TenantSubscriptionQueryInterface.php` (NEW)
   - `app/Infrastructure/Persistence/Shared/EloquentTenantSubscriptionQuery.php` (NEW)
   - `app/Domain/SuperAdminDashboard/Subscription/Repositories/OverageEnforcementRepositoryInterface.php` (NEW)
   - `app/Infrastructure/Persistence/SuperAdminDashboard/Subscription/EloquentOverageEnforcementRepository.php` (NEW)
   - `app/Application/Shared/Quota/Queries/GetTenantUsageQuery.php` — Refactored
   - `app/Application/SuperAdminDashboard/Subscription/Listeners/DowngradeOverageListener.php` — Refactored
   - `app/Application/SuperAdminDashboard/Subscription/UseCases/EnforceOverageDeactivationUseCase.php` — Refactored

   **PLAN 6 — Cache Facade Extraction**
   
   - `app/Domain/Shared/Cache/TenantCacheInterface.php` (NEW)
   - `app/Infrastructure/Cache/LaravelTenantCache.php` (NEW)
   - `app/Application/SuperAdminDashboard/Tenant/UseCases/UpdateTenantStatusUseCase.php` — Replaced `Cache::forget()` with `$this->cache->forget()`

   **Service Provider Bindings Updated:**
   - `app/Providers/QuizServiceProvider.php` — Added QuizAggregateQueryInterface binding
   - `app/Providers/CourseServiceProvider.php` — Added CourseIdempotencyRepositoryInterface binding
   - `app/Providers/AppServiceProvider.php` — Added DashboardStatsQueryInterface, TenantSubscriptionQueryInterface, OverageEnforcementRepositoryInterface, TenantCacheInterface bindings

   **PLAN 7 — Domain Exceptions**
   
   - `app/Domain/TenantAdminDashboard/Course/Exceptions/PaidCourseEnrollmentException.php` (NEW)
   - `app/Domain/TenantAdminDashboard/Course/Exceptions/InvalidModerationStatusException.php` (NEW)
   - `app/Application/TenantAdminDashboard/Course/UseCases/EnrollStudentUseCase.php` — `throw new Exception(...)` → `throw PaidCourseEnrollmentException::cannotEnrollForFree($courseId)`
   - `app/Application/TenantAdminDashboard/Course/UseCases/ModerateReviewUseCase.php` — `throw new Exception(...)` → `throw InvalidModerationStatusException::withStatus($status)`

   **PLAN 8 — Controller Eloquent Removal**
   
   - `app/Http/Controllers/Api/SuperAdminDashboard/Staff/StaffWriteController.php`
     - Replaced `AdminRecord::findOrFail($id)` (5 occurrences) with `$this->adminRepository->findByIdOrFail($id)`
     - Added AdminRepositoryInterface injection via constructor
   - `app/Http/Controllers/Api/TenantAdminDashboard/Auth/TenantAuthController.php`
     - Replaced `UserRecord::find($userId)` with `$this->authRepository->findById($tenantId, $userId)`
     - Replaced `TenantAuditLogRecord::create([...])` with `$this->auditLogger->logAuthEvent(...)`
     - Added TenantAuthRepositoryInterface and TenantAuthAuditLoggerInterface injections

   **PLAN 10 — Controller Read/Write Split (Partial)**
   
   - `app/Http/Controllers/Api/TenantAdminDashboard/Quiz/QuizReadController.php` (NEW) — index, show methods
   - `app/Http/Controllers/Api/TenantAdminDashboard/Quiz/QuizWriteController.php` (NEW) — store, update, status, archive methods
   - `app/Http/Controllers/Api/TenantAdminDashboard/Quiz/QuizQuestionWriteController.php` (NEW) — store, update, destroy, reorder methods
   - `app/Http/Controllers/Api/TenantAdminDashboard/Certificate/CertificateReadController.php` (NEW) — index, download, verify methods

   **PLAN 11 — Migration for Column Type Fixes**
   
   - `database/migrations/tenant/2026_03_06_000002_fix_column_type_violations.php` (NEW)
     - ENUM→VARCHAR for 8 columns, boolean renames (5), financial column renames (2), index renames (8)

4. Errors and Fixes:
   - **"File has not been read yet" errors**: Occurred multiple times when trying to Write to files that were read earlier in the conversation but the tool state didn't retain the read status. Fixed by re-reading the file with a small `limit` parameter before writing.
   - **No user feedback/corrections** were given — user only provided the initial instruction.

5. Problem Solving:
   - Solved the critical data breach in `EloquentPaymentTransactionRepository::findByTenantId()` which returned `PaymentTransactionRecord::all()`
   - Solved cross-tenant data leak vulnerabilities in 4 repository implementations
   - Extracted 20+ `DB::table()` calls from Application layer to proper Infrastructure implementations behind Domain interfaces
   - Removed framework coupling from Domain events (Dispatchable trait)
   - Created proper domain exceptions to replace generic `\Exception` throws
   - Parallelized work using background agents for mechanical tasks (final modifiers, parameter reordering)

6. All User Messages:
   - Message 1: "backend\documentation\Architecture Violation Audit Report.md according to the document, proceed to fix the issues in step by step, strictly follow the document"
   - Messages 2-4: Empty messages (just system reminders about agent progress, no user content)

7. Pending Tasks:
   - **Plan 9**: Background agents (ad63545 for UseCases, a66b8d3 for Commands) adding `final`/`final readonly` modifiers — STILL RUNNING
   - **Plan 10**: Controller Read/Write split — PARTIALLY DONE. Completed: Quiz (2), QuizQuestion (1), Certificate (1). Background agent a86dc6e splitting CourseCommunication controllers (Faq, Forum, Noticeboard) — STILL RUNNING. ~27 controllers remain unsplit.
   - **Plan 12**: Background agent a36e7a0 fixing command parameter ordering and actorId — STILL RUNNING
   - **Route updates**: After controller splits, route files need updating to point to new Read/Write controllers (not yet started)
   - **Eloquent model updates**: After Plan 3 migration, models for 8 tables need `tenant_id` in `$fillable` and tenant scoping traits (not yet started)
   - **Code references**: After Plan 11 migration column renames (boolean/financial), all code referencing old column names needs updating (not yet started)
   - **CertificateWriteController**: Only CertificateReadController was created; the write controller (with `issue()` method) still needs creation
   - **DeleteExamUseCase** (Section 4 of audit): Direct Eloquent `CourseRecord::where(...)` usage not yet fixed

8. Current Work:
   I was actively working on **Plan 10: Split Controllers into Read/Write** when the summary was requested. Specifically:
   - Had just created `CertificateReadController.php` 
   - Had 4 background agents running simultaneously:
     - Agent ad63545: Adding `final` to 11 UseCases (Plan 9)
     - Agent a66b8d3: Adding `final readonly` to ~36 Commands (Plan 9)
     - Agent a86dc6e: Splitting FaqController, ForumController, NoticeboardController (Plan 10)
     - Agent a36e7a0: Reordering command parameters + adding actorId (Plan 12)
   - Approximately 27+ controllers still need Read/Write splitting across: Pricing (Ticket, SpecialOffer), Assignment (2), Enrollment, Auth (AdminAuth, TenantAuth), User, SuperAdmin (Subscription plans, PlatformSettings, Usage), LiveSession, LearningProgress, Payment, Prerequisite, Review, Course (Duplication, Statistics, PartnerTeacher), CertificateTemplate, remaining Dashboard controllers

9. Optional Next Step:
   Continue **Plan 10: Controller Read/Write splitting** for the remaining ~27 controllers. The audit report specifies sub-tasks 10A-10J with specific groupings. The next batch should be:
   - **10D: Pricing** — TicketController, SpecialOfferController
   - **10E: Certificates** — CertificateWriteController (issue method), CertificateTemplateController split
   - **10F: Assignments** — AssignmentController, AssignmentSubmissionController
   
   Also need to check on the 4 background agents' completion status and verify their work.