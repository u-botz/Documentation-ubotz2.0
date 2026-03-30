# Feature Migration Guide — Mentora Production → UBOTZ 2.0 Backend

**How to Properly Migrate Features from Legacy Monolith to DDD Architecture**

Document Version: 1.0  
Date: March 7, 2026  
Authority: Principal Engineer  
Audience: All Backend Developers  
Status: **MANDATORY** — Read the [Developer Instruction Manual](file:///c:/Users/sayan/lms/Ubotz_2.0/backend/documentation/Ubotz%202%20developer%20instruction%20manual%20.md) FIRST before reading this document.

---

> [!CAUTION]
> **Previous migration attempts (Course, Quiz) transferred files WITHOUT proper tenant context, WITHOUT DDD layer separation, and WITHOUT following the developer instruction manual. This document exists to prevent that from happening again. Every future migration MUST follow this guide exactly.**

---

## Table of Contents

1. [Why This Document Exists — Lessons from Failed Migrations](#1-why-this-document-exists)
2. [The Two Codebases](#2-the-two-codebases)
3. [Migration Anti-Patterns — What Went Wrong](#3-migration-anti-patterns--what-went-wrong)
4. [The Migration Workflow — Step by Step](#4-the-migration-workflow--step-by-step)
5. [Phase 1: Feature Analysis and Scoping](#5-phase-1-feature-analysis-and-scoping)
6. [Phase 2: Domain Layer First](#6-phase-2-domain-layer-first)
7. [Phase 3: Application Layer](#7-phase-3-application-layer)
8. [Phase 4: Infrastructure Layer](#8-phase-4-infrastructure-layer)
9. [Phase 5: HTTP Layer](#9-phase-5-http-layer)
10. [Phase 6: Database Migration](#10-phase-6-database-migration)
11. [Phase 7: Tenant Context Integration](#11-phase-7-tenant-context-integration)
12. [Phase 8: Verification](#12-phase-8-verification)
13. [Feature Migration Map — What Exists Where](#13-feature-migration-map--what-exists-where)
14. [Worked Example: Migrating a Legacy Controller](#14-worked-example-migrating-a-legacy-controller)
15. [Pre-Migration Checklist](#15-pre-migration-checklist)
16. [Post-Migration Checklist](#16-post-migration-checklist)

---

## 1. Why This Document Exists

The first migration attempt (Course and Quiz features) resulted in code that:

- **Copied legacy controller logic** directly into UBOTZ 2.0 files instead of decomposing into Domain/Application/Infrastructure layers
- **Skipped tenant context entirely** — queries ran without `tenant_id` scoping, risking cross-tenant data leakage
- **Used Eloquent models as domain entities** — violating the core DDD boundary
- **Put business logic in controllers** — violating the thin-controller rule (≤20 lines per method)
- **Combined CRUD operations into single classes** — creating god-classes instead of one-UseCase-per-operation

**This guide ensures every developer follows a rigorous, layer-by-layer migration process.**

---

## 2. The Two Codebases

### Source: `mentora_production` (Legacy Monolith)

```
C:\Users\sayan\lms\Ubotz_2.0\mentora_production\
├── app/
│   ├── Models/           ← 196 Eloquent models (business logic mixed in)
│   ├── Http/
│   │   ├── Controllers/
│   │   │   ├── Admin/    ← 142 admin controllers
│   │   │   ├── Api/      ← 95 API controllers (Panel/ has 50 feature controllers)
│   │   │   ├── Panel/    ← 62 instructor panel controllers
│   │   │   └── Web/      ← 60 web controllers
│   │   └── Resources/    ← 33 API resources
│   ├── Mixins/           ← 17 trait-like behavior extensions
│   ├── Jobs/             ← 8 queue jobs
│   └── Services/         ← 2 service classes
├── routes/
│   └── api/              ← auth.php, guest.php, instructor.php, user.php
└── database/
```

**Key characteristics of the legacy code:**
- Business logic scattered across Controllers, Models, and Mixins
- No layer separation — controllers query the database directly
- No tenant isolation — single-tenant design, uses a single database
- Eloquent models contain relationship definitions, scopes, and business methods
- Magic strings everywhere — no Value Objects
- No audit logging
- No domain events

### Target: `backend` (UBOTZ 2.0 DDD Architecture)

```
C:\Users\sayan\lms\Ubotz_2.0\backend\
├── app/
│   ├── Domain/                          ← Pure PHP. ZERO framework imports.
│   │   ├── TenantAdminDashboard/
│   │   │   ├── Course/                  ← 25 entities, 27 VOs, 16 events, 28 repo interfaces
│   │   │   ├── Quiz/                    ← 26 domain files
│   │   │   ├── Assignment/              ← 6 domain files
│   │   │   ├── Payment/                 ← 6 domain files
│   │   │   ├── User/                    ← 8 domain files
│   │   │   ├── Role/                    ← 10 domain files
│   │   │   └── ExamHierarchy/           ← 9 domain files
│   │   ├── SuperAdminDashboard/         ← 86 domain files
│   │   └── Shared/                      ← Shared domain concepts
│   ├── Application/                     ← Commands, UseCases, Queries
│   │   └── TenantAdminDashboard/
│   │       └── Course/                  ← 45 commands, 78 use cases, 8 queries
│   ├── Infrastructure/                  ← Eloquent repos, *Record models
│   │   └── Persistence/
│   │       └── TenantAdminDashboard/    ← 94 infrastructure files
│   └── Http/
│       └── Controllers/Api/             ← Thin controllers, FormRequests
│           └── TenantAdminDashboard/    ← 40 controller files
├── documentation/                       ← Architecture docs (you are here)
└── database/
    └── migrations/                      ← central/ and tenant/ separated
```

---

## 3. Migration Anti-Patterns — What Went Wrong

### ❌ Anti-Pattern 1: Copy-Paste Migration

```php
// WHAT WAS DONE (WRONG):
// Legacy: mentora_production/app/Http/Controllers/Api/Panel/QuizzesController.php
public function store(Request $request) {
    $quiz = Quiz::create($request->all());  // ← Copied to UBOTZ 2.0 as-is
    return response()->json($quiz);
}

// This was placed in backend/app/Http/Controllers/... with minimal changes
// Result: No domain layer, no tenant scoping, no audit, no events
```

### ❌ Anti-Pattern 2: Missing Tenant Context

```php
// WHAT WAS DONE (WRONG):
// Queries ran without tenant_id — the legacy code is single-tenant
$quizzes = Quiz::where('creator_id', $userId)->get();

// In a multi-tenant system, this MUST be:
$quizzes = QuizRecord::where('tenant_id', $tenantId)
    ->where('creator_id', $userId)
    ->get();
```

### ❌ Anti-Pattern 3: Skipping Layer Decomposition

```php
// WHAT WAS DONE (WRONG):
// A 200-line controller method was moved from mentora_production to UBOTZ 2.0
// containing DB queries, business validation, side effects, and response formatting
// all in one controller method.

// CORRECT approach requires splitting into:
// 1. Domain Entity (business rules)
// 2. Command (data carrier)
// 3. UseCase (orchestration)
// 4. Repository Interface + Eloquent Implementation
// 5. Controller (thin coordinator ≤20 lines)
// 6. FormRequest (syntax validation)
```

---

## 4. The Migration Workflow — Step by Step

```
┌─────────────────────────────────────────────────────────────────────┐
│                    FEATURE MIGRATION WORKFLOW                        │
│                                                                      │
│  Phase 1: ANALYSIS         Read legacy code, identify business rules │
│           ↓                                                          │
│  Phase 2: DOMAIN           Entities, VOs, Events, Exceptions,        │
│                            Repo Interfaces (Pure PHP, ZERO imports)  │
│           ↓                                                          │
│  Phase 3: APPLICATION      Commands, UseCases, Queries               │
│                            (orchestration only)                      │
│           ↓                                                          │
│  Phase 4: INFRASTRUCTURE   *Record models, Eloquent Repos,          │
│                            toEntity/fromEntity mappers               │
│           ↓                                                          │
│  Phase 5: HTTP             Thin controllers, FormRequests, Resources │
│           ↓                                                          │
│  Phase 6: DATABASE         Migrations (tenant-scoped, no ENUMs)      │
│           ↓                                                          │
│  Phase 7: TENANT CONTEXT   BelongsToTenant trait, explicit scoping   │
│           ↓                                                          │
│  Phase 8: VERIFICATION     Tests, grep checks, architecture audit    │
└─────────────────────────────────────────────────────────────────────┘
```

> [!IMPORTANT]
> **You MUST work from bottom-up: Domain → Application → Infrastructure → HTTP.** Never start with controllers. The Domain layer has zero dependencies and must be built first.

---

## 5. Phase 1: Feature Analysis and Scoping

Before writing any code, perform a thorough analysis of the legacy feature.

### Step 1.1: Identify All Legacy Source Files

For each feature in `mentora_production`, locate ALL relevant files:

| File Type | Location Pattern | What to Extract |
|-----------|-----------------|-----------------|
| **Controller** | `app/Http/Controllers/Api/Panel/{Feature}Controller.php` | Business logic buried in controller methods |
| **Model** | `app/Models/{Entity}.php` or `app/Models/Api/{Entity}.php` | Relationships, scopes, accessor/mutator logic |
| **Mixin** | `app/Mixins/{Feature}/` | Business behavior mixed into models |
| **Translation Model** | `app/Models/Translation/{Entity}Translation.php` | i18n fields |
| **Routes** | `routes/api/user.php`, `routes/panel.php` | Endpoint definitions |
| **Migration** | `database/migrations/` | Table structure, column types |
| **Resources** | `app/Http/Resources/` | Response shape |
| **Jobs** | `app/Jobs/` | Async operations |

### Step 1.2: Map Legacy Operations to UBOTZ Operations

For each controller method in the legacy code, create a mapping:

```markdown
| Legacy Method                          | UBOTZ UseCase            | Type  |
|----------------------------------------|--------------------------|-------|
| WebinarsController@store               | CreateCourseUseCase      | Write |
| WebinarsController@show                | GetCourseQuery           | Read  |
| WebinarsController@list                | ListCoursesQuery         | Read  |
| WebinarsController@free                | EnrollFreeUseCase        | Write |
| WebinarsController@purchases           | ListPurchasesQuery       | Read  |
| QuizzesController@store                | CreateQuizUseCase        | Write |
| QuizzesController@show                 | GetQuizQuery             | Read  |
```

### Step 1.3: Identify Business Rules Hidden in Legacy Code

Legacy controllers and models contain business rules that must be extracted to the Domain layer. Look for:

```php
// Business rules disguised as controller logic:
if ($webinar->status !== 'active') { ... }           // → CourseStatus Value Object
if ($webinar->capacity <= $enrollmentCount) { ... }   // → CourseEntity.canEnroll()
if ($quiz->pass_mark > $score) { ... }                // → QuizEntity.checkPassStatus()
if ($sale->type === 'subscribe') { ... }              // → SaleType Value Object
$price = $webinar->price - $discount->percent * ...;  // → PricingService in Domain
```

### Step 1.4: Identify Multi-Tenancy Requirements

The legacy system is **single-tenant**. Every feature must be adapted for multi-tenancy:

| Legacy Concept | UBOTZ 2.0 Equivalent |
|---------------|----------------------|
| `$user->id` as the only scope | `$tenantId` + `$userId` double scope |
| `Webinar::find($id)` | `CourseRecord::where('tenant_id', $tenantId)->where('id', $id)` |
| No `tenant_id` column | Every tenant table MUST have `tenant_id BIGINT UNSIGNED NOT NULL` |
| Single database | Tenant-scoped queries with belt-and-suspenders approach |

---

## 6. Phase 2: Domain Layer First

**Location:** `app/Domain/{Context}/{Subdomain}/`

### Step 2.1: Create Entity

Extract business rules from legacy models and controllers into pure PHP entities.

**Source analysis checklist:**
- [ ] Read the legacy Model file for relationship definitions, accessor logic, and scope methods
- [ ] Read the legacy Controller for business validation, state checks, and side effects
- [ ] Read the legacy Mixin files for behavior extensions
- [ ] Identify all state transitions and their invariants

**Rules recap:**
- Pure PHP — ZERO `use Illuminate\...` imports
- Private constructor, factory methods (`create()`, `reconstitute()`)
- Business rules enforced in entity methods
- Domain events recorded via `$this->recordEvent()`, never dispatched
- See [Developer Manual §6](file:///c:/Users/sayan/lms/Ubotz_2.0/backend/documentation/Ubotz%202%20developer%20instruction%20manual%20.md) for the full template

### Step 2.2: Create Value Objects

Convert every magic string, enum-like value, and compound data in the legacy code into Value Objects.

**Common legacy patterns to convert:**

| Legacy Pattern | Value Object |
|---------------|-------------|
| `$webinar->status` (string: 'active', 'pending', 'inactive') | `CourseStatus` |
| `$quiz->pass_mark` (raw integer) | `PassMark` |
| `$sale->total_amount` (decimal/float) | `Money` (stored as cents) |
| `$webinar->type` (string: 'webinar', 'course', 'text_lesson') | `CourseType` |
| `$session->date` + `$session->duration` | `SessionSchedule` |

### Step 2.3: Create Domain Events

For every state mutation in the entity, create a corresponding domain event.

**Naming rule:** Past tense. `CourseCreated`, `QuizAttemptCompleted`, `TicketRedeemed`.

### Step 2.4: Create Domain Exceptions

For every business error condition, create a domain-specific exception.

### Step 2.5: Create Repository Interface

Every data access need gets an interface in the Domain layer.

```php
// app/Domain/TenantAdminDashboard/{Subdomain}/Repositories/

interface {Entity}RepositoryInterface
{
    // EVERY method MUST accept int $tenantId for tenant-scoped data
    public function findById(int $tenantId, int $id): ?{Entity}Entity;
    public function save({Entity}Entity $entity): {Entity}Entity;
    public function delete(int $tenantId, int $id): void;
}
```

> [!WARNING]
> **Missing `$tenantId` in a repository interface method is a SECURITY BUG.** The legacy code has no `$tenantId` anywhere — you must ADD it to every method signature during migration.

---

## 7. Phase 3: Application Layer

**Location:** `app/Application/{Context}/{Subdomain}/`

### Step 3.1: Create Commands

For each write operation, create an immutable Command class:

```php
// Always: declare(strict_types=1), final class
// Always: int $tenantId as FIRST parameter
// Always: ?int $actorId for audit trail
// Never: logic, validation, or method calls
```

### Step 3.2: Create UseCases

For each write operation, create ONE UseCase class following the fixed orchestration:

```
1. Idempotency check (if applicable)
2. Precondition validation (tenant-scoped!)
3. Domain entity operation
4. DB::transaction() wraps persistence + audit
5. Persist via repository
6. Audit log (inside transaction)
7. Collect events
8. Dispatch events AFTER commit
```

**Critical rules when migrating from legacy:**
- **NEVER copy controller logic into UseCase** — decompose it
- **One operation per UseCase** — if the legacy controller has `store()`, `update()`, `destroy()`, that's THREE UseCase files
- **No `DB::table()`, no Eloquent, no facades** — use injected repository interfaces only

### Step 3.3: Create Queries

For each read operation, create a Query class:
- Returns DTOs or arrays, NEVER entities
- Always accepts `int $tenantId` as first parameter
- Uses repository interfaces for data access

---

## 8. Phase 4: Infrastructure Layer

**Location:** `app/Infrastructure/Persistence/{Context}/{Subdomain}/`

### Step 4.1: Create `*Record` Eloquent Models

Eloquent models in UBOTZ 2.0 are **persistence concerns only**. They are named `{Entity}Record`.

```php
// ✅ CORRECT naming
class CourseRecord extends Model { ... }
class QuizRecord extends Model { ... }

// ❌ WRONG (legacy style)
class Course extends Model { ... }
class Webinar extends Model { ... }
```

**Every tenant-scoped Record MUST use the `BelongsToTenant` trait:**

```php
use App\Infrastructure\Persistence\Traits\BelongsToTenant;

class CourseRecord extends Model
{
    use BelongsToTenant;  // ← Layer 1 defense: global scope + auto-assignment

    protected $table = 'courses';
    protected $fillable = [...];
}
```

### Step 4.2: Create Eloquent Repository

Implements the domain interface. Contains `toEntity()` and `fromEntity()` mapping methods.

**Belt-and-suspenders — always include explicit `tenant_id` in queries:**

```php
// Even though BelongsToTenant adds a global scope, ALWAYS specify tenant_id explicitly
$record = CourseRecord::where('tenant_id', $tenantId)
    ->where('id', $id)
    ->first();
```

### Step 4.3: Register Service Provider Bindings

Every repository interface must be bound to its Eloquent implementation:

```php
// In a ServiceProvider
$this->app->bind(
    CourseRepositoryInterface::class,
    EloquentCourseRepository::class
);
```

---

## 9. Phase 5: HTTP Layer

**Location:** `app/Http/Controllers/Api/{Context}/{Subdomain}/`

### Step 5.1: Create Thin Controllers

Split legacy controllers into Read/Write controllers:

```
Legacy:   WebinarsController (365 lines, 11 methods, mixed read/write)
UBOTZ:    CourseReadController  (list, show)
          CourseWriteController (store, update, destroy, changeStatus)
```

**Each method ≤ 20 lines:**
1. Accept FormRequest
2. Build Command
3. Call UseCase
4. Return Response

### Step 5.2: Create FormRequests

Syntax validation ONLY. No business rules. No database queries.

### Step 5.3: Create API Resources

Shape the output. No logic.

### Step 5.4: Define Routes

```php
// Platform APIs: /api/platform/{resource}
// Tenant APIs:   /api/tenant/{resource}
// NEVER mix platform and tenant routes
```

---

## 10. Phase 6: Database Migration

### Step 6.1: Analyze Legacy Schema

Read the legacy migration files in `mentora_production/database/migrations/` to understand table structures.

### Step 6.2: Create UBOTZ 2.0 Migrations

**Rules:**
- Tenant tables go in `database/migrations/tenant/`
- Central tables go in `database/migrations/central/`
- Every tenant table MUST have `tenant_id BIGINT UNSIGNED NOT NULL`
- No MySQL ENUMs — use `VARCHAR(30)`
- Financial columns use `_cents` suffix with `BIGINT UNSIGNED`
- See [Developer Manual §14](file:///c:/Users/sayan/lms/Ubotz_2.0/backend/documentation/Ubotz%202%20developer%20instruction%20manual%20.md) for the full template

### Step 6.3: Legacy Column Mapping

Common legacy-to-UBOTZ column transformations:

| Legacy Column | UBOTZ 2.0 Column | Reason |
|--------------|-------------------|--------|
| `status ENUM('active','inactive')` | `status VARCHAR(30) DEFAULT 'active'` | No ENUMs |
| `price DECIMAL(10,2)` | `price_cents BIGINT UNSIGNED DEFAULT 0` | Financial safety |
| `type ENUM(...)` | `type VARCHAR(30)` | No ENUMs |
| No `tenant_id` | `tenant_id BIGINT UNSIGNED NOT NULL` | Multi-tenancy |
| `creator_id` | `creator_id` + proper FK | Same but with FK |

---

## 11. Phase 7: Tenant Context Integration

This is the phase most commonly skipped. **It is the most critical.**

### Step 7.1: Understand the Three-Layer Defense

| Layer | Mechanism | Your Responsibility |
|-------|-----------|---------------------|
| **Layer 1: Trait** | `BelongsToTenant` trait on Eloquent models | Apply trait to every `*Record` model |
| **Layer 2: Middleware** | JWT `tenant_id` claim → `TenantContext` | Already handled by infrastructure |
| **Layer 3: Explicit** | `WHERE tenant_id = ?` in every query | Always pass `$tenantId` explicitly |

### Step 7.2: How `BelongsToTenant` Works

The [BelongsToTenant](file:///c:/Users/sayan/lms/Ubotz_2.0/backend/app/Infrastructure/Persistence/Traits/BelongsToTenant.php) trait provides:

1. **Auto-assignment on creation:** When a record is created, `tenant_id` is automatically set from `TenantContext`
2. **Global scope:** All queries are automatically scoped to the current tenant
3. **Fail-safe:** If `TenantContext` is not resolved, queries return empty results (`WHERE 1=0`)

### Step 7.3: Your Responsibilities Beyond the Trait

Even with `BelongsToTenant`, you MUST:

```php
// ✅ Belt-and-suspenders: Always pass tenantId explicitly
public function findById(int $tenantId, int $id): ?CourseEntity
{
    $record = CourseRecord::where('tenant_id', $tenantId)  // ← Explicit, even with global scope
        ->where('id', $id)
        ->first();
    // ...
}

// ❌ NEVER rely solely on the global scope
public function findById(int $id): ?CourseEntity
{
    $record = CourseRecord::find($id);  // ← DANGEROUS: what if scope is bypassed?
    // ...
}
```

### Step 7.4: Where `$tenantId` Flows

```
Request (JWT)
  → Middleware extracts tenant_id → TenantContext (scoped singleton)
    → Controller reads $request->user()->tenant_id
      → Command carries tenantId as first parameter
        → UseCase passes tenantId to repository calls
          → Repository passes tenantId in WHERE clauses
            → Global scope ALSO filters by tenant_id (double protection)
```

---

## 12. Phase 8: Verification

### Step 8.1: Architecture Verification

Run these checks after every feature migration:

```powershell
# 1. No Illuminate imports in Domain layer
docker exec -it ubotz_backend grep -rn "use Illuminate" app/Domain/
# Expected: 0 results

# 2. No DB::table() in Application layer
docker exec -it ubotz_backend grep -rn "DB::table" app/Application/
# Expected: 0 results

# 3. No MySQL ENUMs in migrations
docker exec -it ubotz_backend grep -rn "->enum(" database/migrations/
# Expected: 0 results

# 4. No env() in application code
docker exec -it ubotz_backend grep -rn "env(" app/ routes/ database/
# Expected: 0 results (only allowed in config/ files)

# 5. Every Record model uses BelongsToTenant (for tenant-scoped models)
docker exec -it ubotz_backend grep -rLn "BelongsToTenant" app/Infrastructure/Persistence/TenantAdminDashboard/
# Check output — any tenant-scoped model WITHOUT the trait is a security bug
```

### Step 8.2: Tenant Isolation Tests

For every migrated feature, write this test:

```php
/** @test */
public function tenant_a_cannot_access_tenant_b_data(): void
{
    // Create two tenants
    // Create data for tenant A
    // Authenticate as tenant B
    // Try to access tenant A's data
    // Assert 404 (NOT 403)
}
```

### Step 8.3: Run Test Suite

```powershell
docker exec -it ubotz_backend php artisan test
docker exec -it ubotz_backend php artisan test --filter={FeatureName}Test
```

---

## 13. Feature Migration Map — What Exists Where

### Already Migrated to Backend (Needs Audit for Compliance)

| Feature Area | Legacy Files | Backend Domain | Status |
|-------------|-------------|---------------|--------|
| **Course (Core)** | `Webinar.php`, `WebinarChapter.php`, `WebinarChapterItem.php` + 4 Controllers | `Domain/TenantAdminDashboard/Course/` (25 entities, 78 UseCases) | ⚠️ Migrated — needs DDD compliance audit |
| **Quiz (Core)** | `Quiz.php`, `QuizzesQuestion.php`, `QuizzesQuestionsAnswer.php`, `QuizzesResult.php` | `Domain/TenantAdminDashboard/Quiz/` (26 domain files) | ⚠️ Migrated — needs DDD compliance audit |
| **Assignment** | `WebinarAssignment.php` + related models | `Domain/TenantAdminDashboard/Assignment/` | ⚠️ Partially migrated |
| **Roles & Permissions** | `Role.php`, `Permission.php` | `Domain/TenantAdminDashboard/Role/` | ⚠️ Partially migrated |
| **User Management** | `User.php` + auth controllers | `Domain/TenantAdminDashboard/User/` | ⚠️ Partially migrated |

### NOT YET Migrated (Full List from Legacy)

| Feature Area | Key Legacy Files | Priority | Complexity |
|-------------|-----------------|----------|------------|
| **Payments & Sales** | `Sale.php` (11K), `Order.php`, `OrderItem.php`, `PaymentChannel.php`, `CartController.php` (30K), `PaymentsController.php` (11K) | 🔴 Critical | Very High |
| **Subscriptions** | `Subscribe.php` (4K), `SubscribeUse.php`, `SubscribesController.php` (9K) | 🔴 Critical | High |
| **Discounts & Coupons** | `Discount.php` (8K), `DiscountBundle.php`, `DiscountCategory.php`, `DiscountCourse.php`, `DiscountGroup.php`, `DiscountUser.php` | 🟡 High | High |
| **Installments** | `Installment.php` (7K), `InstallmentOrder.php` (6K), + 5 related models | 🟡 High | Very High |
| **Cart & Checkout** | `Cart.php`, `CartDiscount.php`, `AddCartController.php`, `CartController.php` | 🟡 High | High |
| **Certificates** | `Certificate.php`, `CertificateTemplate.php`, `CertificatesController.php` | 🟢 Medium | Medium |
| **Meetings** | `Meeting.php`, `MeetingTime.php`, `ReserveMeeting.php`, `MeetingsController.php` (10K) | 🟢 Medium | Medium |
| **Rewards / Badges** | `Reward.php`, `RewardAccounting.php`, `Badge.php` (10K), `RewardsController.php` | 🟢 Medium | Medium |
| **Product Store** | `Product.php` (11K) + 16 related models, `ProductController.php` | 🟡 High | Very High |
| **Forums** | `Forum.php`, `ForumTopic.php`, `ForumTopicPost.php` + 5 related models | 🟢 Medium | Medium |
| **Blog** | `Blog.php`, `BlogCategory.php`, `BlogCommentController.php` | 🔵 Low | Low |
| **Notifications** | `Notification.php`, `NotificationTemplate.php` (5K), `NotificationsController.php` | 🟢 Medium | Medium |
| **Support / Tickets** | `Support.php`, `SupportConversation.php`, `SupportsController.php` (7K) | 🟢 Medium | Medium |
| **Bundles** | `Bundle.php` (18K), `BundleWebinar.php`, `BundleController.php` | 🟡 High | High |
| **Categories & Filters** | `Category.php`, `Filter.php`, `FilterOption.php` | 🟢 Medium | Low |
| **Advertising** | `AdvertisingBanner.php`, `FloatingBar.php` | 🔵 Low | Low |
| **Affiliate Program** | `Affiliate.php`, `AffiliateCode.php` | 🟢 Medium | Medium |
| **Cashback** | `CashbackRule.php` + 2 related models | 🟢 Medium | Medium |
| **Gifts** | `Gift.php` (4K) | 🔵 Low | Medium |
| **User Financials** | `AccountingsController.php`, `PayoutsController.php`, `SalesController.php` | 🔴 Critical | High |

---

## 14. Worked Example: Migrating a Legacy Controller

### Legacy Source: `QuizzesController@store` (from `mentora_production`)

```php
// Legacy: app/Http/Controllers/Api/Panel/QuizzesController.php
public function store(Request $request)
{
    $user = apiAuth();
    $webinar = Webinar::find($request->input('webinar_id'));

    if (!$webinar || $webinar->teacher_id !== $user->id) {
        abort(403);
    }

    $quiz = Quiz::create([
        'creator_id'     => $user->id,
        'webinar_id'     => $webinar->id,
        'chapter_id'     => $request->input('chapter_id'),
        'title'          => $request->input('title'),
        'time'           => $request->input('time'),
        'pass_mark'      => $request->input('pass_mark'),
        'attempt'        => $request->input('attempt'),
        'status'         => Quiz::$active,
    ]);

    return apiResponse2(1, 'stored', trans('quiz.stored_successfully'), $quiz);
}
```

### Migration Decomposition

This single legacy method becomes **7 files** in UBOTZ 2.0:

---

#### File 1: Domain Entity

```php
// app/Domain/TenantAdminDashboard/Quiz/Entities/QuizEntity.php
declare(strict_types=1);

namespace App\Domain\TenantAdminDashboard\Quiz\Entities;

// Pure PHP — NO Illuminate imports
final class QuizEntity extends AggregateRoot
{
    private function __construct(private readonly QuizProps $props) {}

    public static function create(QuizProps $props): self
    {
        // Business rules enforced HERE
        $props->passMark->validate();  // Value Object validates itself
        $props->timeLimit->validate(); // Value Object validates itself

        $entity = new self($props);
        $entity->recordEvent(new QuizCreated(
            quizId: $props->id,
            tenantId: $props->tenantId,
            courseId: $props->courseId,
        ));
        return $entity;
    }
}
```

#### File 2: Command

```php
// app/Application/TenantAdminDashboard/Quiz/Commands/CreateQuizCommand.php
declare(strict_types=1);

final class CreateQuizCommand
{
    public function __construct(
        public readonly int $tenantId,        // ← ALWAYS FIRST
        public readonly int $courseId,
        public readonly ?int $chapterId,
        public readonly string $title,
        public readonly int $timeMinutes,
        public readonly int $passMark,
        public readonly int $attemptLimit,
        public readonly ?int $actorId = null, // ← ALWAYS PRESENT
    ) {}
}
```

#### File 3: UseCase

```php
// app/Application/TenantAdminDashboard/Quiz/UseCases/CreateQuizUseCase.php
declare(strict_types=1);

final class CreateQuizUseCase
{
    public function __construct(
        private readonly QuizRepositoryInterface $quizRepository,
        private readonly CourseRepositoryInterface $courseRepository,
        private readonly TenantAuditLogger $auditLogger,
    ) {}

    public function execute(CreateQuizCommand $command): QuizEntity
    {
        // Step 2: Tenant-scoped precondition check
        $course = $this->courseRepository->findById(
            $command->tenantId,   // ← ALWAYS pass tenantId
            $command->courseId
        );
        if ($course === null) {
            throw CourseNotFoundException::withId($command->courseId);
        }

        // Step 3: Domain entity creation (business rules inside)
        $quiz = QuizEntity::create(new QuizProps(/* ... */));

        // Steps 4-7: Transaction
        $result = DB::transaction(function () use ($quiz, $command) {
            $saved = $this->quizRepository->save($quiz);

            $this->auditLogger->log(new AuditContext(
                tenantId: $command->tenantId,
                userId: $command->actorId ?? 0,
                action: 'quiz.created',
                entityType: 'quiz',
                entityId: $saved->getId(),
            ));

            return [$saved, $quiz->releaseEvents()];
        });

        // Step 8: Events AFTER commit
        foreach ($result[1] as $event) {
            event($event);
        }

        return $result[0];
    }
}
```

#### File 4: Repository Interface (Domain)

```php
// app/Domain/TenantAdminDashboard/Quiz/Repositories/QuizRepositoryInterface.php
interface QuizRepositoryInterface
{
    public function findById(int $tenantId, int $id): ?QuizEntity;
    public function save(QuizEntity $quiz): QuizEntity;
}
```

#### File 5: Eloquent Repository (Infrastructure)

```php
// app/Infrastructure/Persistence/TenantAdminDashboard/Quiz/EloquentQuizRepository.php
final class EloquentQuizRepository implements QuizRepositoryInterface
{
    public function findById(int $tenantId, int $id): ?QuizEntity
    {
        $record = QuizRecord::where('tenant_id', $tenantId)  // ← Explicit scope
            ->where('id', $id)
            ->first();
        return $record ? $this->toEntity($record) : null;
    }
}
```

#### File 6: Controller (HTTP)

```php
// app/Http/Controllers/Api/TenantAdminDashboard/Quiz/QuizWriteController.php
final class QuizWriteController extends Controller
{
    public function store(
        CreateQuizRequest $request,
        CreateQuizUseCase $useCase,
    ): JsonResponse {
        $command = new CreateQuizCommand(
            tenantId: $request->user()->tenant_id,  // ← From JWT
            courseId: (int) $request->input('course_id'),
            chapterId: $request->input('chapter_id') ? (int) $request->input('chapter_id') : null,
            title: $request->input('title'),
            timeMinutes: (int) $request->input('time'),
            passMark: (int) $request->input('pass_mark'),
            attemptLimit: (int) $request->input('attempt'),
            actorId: $request->user()->id,
        );

        $quiz = $useCase->execute($command);

        return response()->json(new QuizResource($quiz), 201);
    }
}
```

#### File 7: FormRequest (HTTP)

```php
// app/Http/Requests/TenantAdminDashboard/Quiz/CreateQuizRequest.php
final class CreateQuizRequest extends FormRequest
{
    public function rules(): array
    {
        return [
            'course_id'  => ['required', 'integer'],
            'chapter_id' => ['sometimes', 'nullable', 'integer'],
            'title'      => ['required', 'string', 'max:255'],
            'time'       => ['required', 'integer', 'min:1'],
            'pass_mark'  => ['required', 'integer', 'min:0', 'max:100'],
            'attempt'    => ['required', 'integer', 'min:1'],
        ];
    }
}
```

---

## 15. Pre-Migration Checklist

Run this before starting migration of any feature:

```
□ Have I read the Developer Instruction Manual?
□ Have I identified ALL legacy files for this feature?
   □ Controllers (Admin, Api/Panel, Web)
   □ Models (app/Models/)
   □ Mixins (app/Mixins/)
   □ Translations (app/Models/Translation/)
   □ Routes (routes/api/, routes/panel.php)
   □ Migrations (database/migrations/)
   □ Resources (app/Http/Resources/)
   □ Jobs (app/Jobs/)
□ Have I mapped every legacy method to a UBOTZ 2.0 UseCase or Query?
□ Have I identified all business rules in legacy code?
□ Have I identified all data access patterns?
□ Have I planned the tenant_id integration?
□ Have I identified Value Objects that replace magic strings?
□ Have I verified this feature doesn't cross bounded contexts?
   (If it does → flag for architectural review)
```

---

## 16. Post-Migration Checklist

Run this after completing migration of any feature:

```
□ Architecture Checks:
  □ grep -rn 'use Illuminate' app/Domain/  → 0 results
  □ grep -rn 'DB::table' app/Application/  → 0 results
  □ grep -rn '->enum(' database/migrations/ → 0 results
  □ All controllers ≤ 20 lines per method
  □ All UseCases: one operation per class
  □ All Commands: declare(strict_types=1), final class, tenantId first
  □ All Repository methods: $tenantId parameter for tenant-scoped data

□ Tenant Isolation:
  □ Every *Record model uses BelongsToTenant trait
  □ Every Eloquent query has explicit WHERE tenant_id = ?
  □ Tenant isolation test written and passing
  □ No cross-tenant data leakage possible

□ Audit & Events:
  □ Every mutation UseCase has audit logging (inside transaction)
  □ All domain events dispatched AFTER transaction commit
  □ Event names are past tense

□ Tests:
  □ php artisan test --filter={FeatureName} passes
  □ Tenant isolation test passes
  □ Business rule tests pass

□ Migration Record:
  □ Legacy source files documented in this feature's PR description
  □ Any deviations from legacy behavior documented and justified
```

---

## Quick Decision Tree

```
I need to migrate a feature from mentora_production...

1. Is the logic in a Controller?
   → Extract business rules → Domain Entity
   → Extract orchestration → UseCase
   → Leave only request/response → Controller

2. Is the logic in a Model?
   → Extract relationships → Repository Interface + Eloquent Repository
   → Extract business methods → Domain Entity
   → Extract scopes → Repository methods
   → Leave only persistence config → *Record model

3. Does it query the database?
   → Write query → Read: create Query class → define Repository Interface
   → Mutate data → Write: create UseCase + Command

4. Does it touch money?
   → Use BIGINT _cents, idempotency keys, pessimistic locking
   → See Developer Manual §16

5. Does it cross bounded contexts?
   → STOP → Use Domain Events for communication
   → Never import across domain boundaries
```

---

*End of Document — Feature Migration Guide v1.0*  
*Companion to: [Developer Instruction Manual v1.0](file:///c:/Users/sayan/lms/Ubotz_2.0/backend/documentation/Ubotz%202%20developer%20instruction%20manual%20.md)*
