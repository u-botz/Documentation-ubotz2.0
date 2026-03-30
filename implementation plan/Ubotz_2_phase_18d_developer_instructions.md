# UBOTZ 2.0 — Phase 18D Developer Instructions

## Quiz Feature Series — Standalone Quiz Lifecycle & Subscription Quiz Entitlements

| Field | Value |
|---|---|
| **Document Type** | Developer Instruction (Pre-Implementation Brief) |
| **Phase** | 18D |
| **Series** | Quiz Feature Series (18A → 18B → 18C → 18D → 18E) |
| **Date** | 2026-03-21 |
| **Issued By** | Principal Engineer / Architecture Auditor |
| **Audience** | Antigravity Implementation Team |
| **Expected Deliverable** | Phase 18D Implementation Plan |
| **Prerequisites** | Phase 18A CERTIFIED COMPLETE |
| **Parallel With** | Phase 18B, Phase 18C (no dependency between them) |

> **This phase makes the quiz a first-class sellable product. Right now a quiz only exists as a child of a course or as an internal assessment. A standalone quiz — the "JEE Full Mock Test Series" that a student subscribes to — has no lifecycle, no access path, and no subscription integration. This phase builds all three. It also introduces a new entitlement model: subscription plans can include specific quiz IDs, which is fundamentally different from the existing module-level entitlement system and requires a careful, non-breaking extension to the Phase 11A subscription infrastructure.**

---

## 1. Mission Statement

Phase 18D delivers two systems:

**System 1 — Standalone Quiz Lifecycle**

A quiz can exist independently of any course — as its own product with its own access rules, pricing-via-subscription, and admin-managed availability window. The existing `quizzes` table already has `access_level` and `is_free` columns and a `course_id` FK that is nullable. The standalone quiz concept is partially implied but never formally designed. This phase formalises it: what makes a quiz "standalone", how it is published, and how its access is controlled independently.

**System 2 — Subscription Quiz Entitlements**

Decision D-3 from the 2026-03-21 business session confirmed: a subscription plan includes specific quiz IDs — subscribing grants access to those exact quizzes. This is a new entitlement model alongside the existing `module.*` feature entitlements. The Phase 11A subscription system stores feature limits in a `features` JSON blob. Individual quiz ID entitlements cannot live there — a JSON blob of quiz IDs is not queryable and cannot be enforced efficiently at access check time. A dedicated `subscription_plan_quiz_entitlements` table is required.

This phase also implements the `QuizAccessService` — the single service that answers "does this student have access to this quiz?" by checking all three possible access paths:
1. Enrolled in a course that contains this quiz
2. Admin-manually assigned
3. Active subscription that includes this quiz ID

---

## 2. What This Phase Includes

**Standalone Quiz:**
- Formal definition of `access_level` value object with `COURSE_ONLY`, `STANDALONE`, `BOTH` values
- `QuizAccessWindow` value object — `start_at`, `end_at`, `admin_controlled` flag
- `OpenQuizUseCase` and `CloseQuizUseCase` — admin manually opens/closes live-proctored style quizzes
- Standalone quiz publish rules (must have questions, pass mark, exam hierarchy — already enforced; standalone additionally requires access_level set to STANDALONE or BOTH)
- Admin-manual quiz enrollment (`EnrollStudentInQuizUseCase`)
- `QuizEnrollmentEntity` in Enrollment bounded context
- `quiz_enrollments` table

**Subscription Quiz Entitlements:**
- `subscription_plan_quiz_entitlements` table (SuperAdminDashboard bounded context)
- `SubscriptionPlanQuizEntitlement` entity
- `AddQuizToSubscriptionPlanUseCase` (Super Admin manages which quizzes a plan includes)
- `RemoveQuizFromSubscriptionPlanUseCase`
- `ListPlanQuizEntitlementsQuery`
- Super Admin API endpoints for managing plan quiz entitlements

**Quiz Access Service:**
- `QuizAccessServiceInterface` in Quiz domain
- `EloquentQuizAccessService` in Infrastructure
- `CheckQuizAccessUseCase` — unified access check
- Integration with existing `quiz.php` route middleware
- `EnrollmentSource::QUIZ_SUBSCRIPTION` added to Enrollment domain

## 2.1 What This Phase Does NOT Include

- Student quiz catalog / browse UI (Phase 18E)
- Student-facing quiz attempt interface (Phase 18E)
- Payment for individual quiz purchase (quiz access is subscription-only per D-3 — individual quiz purchase is not in scope)
- Random question generation from bank per section (Phase 18E, depends on 18B + 18C)
- Quiz access via bundle (bundle → courses → quizzes is handled by course access check, not quiz access check)

---

## 3. Architecture Decisions

### AD-18D-001: `subscription_plan_quiz_entitlements` Lives in SuperAdminDashboard Bounded Context

Quiz entitlements are defined by the platform (Super Admin), not by the tenant. A Super Admin configures which quiz IDs are included in a subscription plan. This is the same ownership model as `subscription_plans` — the Super Admin owns the plan definition, tenants subscribe to it.

**File location:** `Domain/SuperAdminDashboard/Subscription/Entities/SubscriptionPlanQuizEntitlementEntity.php`

The Quiz domain knows nothing about subscription plans. The subscription domain knows nothing about quiz content. The entitlement table is a join between them, owned by the subscription domain.

### AD-18D-002: Quiz Access Check Is a Domain Service, Not a Repository

The question "does this student have access to this quiz?" crosses three bounded contexts:
- Course enrollment (Enrollment domain)
- Direct quiz enrollment (Enrollment domain)
- Subscription quiz entitlement (SuperAdminDashboard/Subscription domain)

A repository cannot span contexts. A domain service interface defined in the Quiz domain, implemented in Infrastructure, with injections from multiple repositories is the correct pattern.

```php
// Domain/TenantAdminDashboard/Quiz/Services/QuizAccessServiceInterface.php
interface QuizAccessServiceInterface
{
    public function canAccess(int $tenantId, int $userId, int $quizId): bool;

    /**
     * Returns the reason access was granted, or null if denied.
     * Used by audit logs and diagnostic endpoints.
     */
    public function resolveAccessPath(int $tenantId, int $userId, int $quizId): ?QuizAccessPath;
}
```

`QuizAccessPath` is a value object: `{ granted: bool, reason: 'course_enrollment' | 'direct_enrollment' | 'subscription' | null }`

### AD-18D-003: `QuizEnrollmentEntity` Lives in the Enrollment Bounded Context

Direct quiz enrollment (admin assigns a student to a standalone quiz) follows the exact same pattern as `CourseEnrollmentEntity` established in Phase 17B. It is not owned by the Quiz domain. The Enrollment bounded context owns all access grants.

### AD-18D-004: `EnrollmentSource::QUIZ_SUBSCRIPTION` Added to Enrollment Domain

A new case is added to `EnrollmentSource` in `Domain/TenantAdminDashboard/Enrollment/ValueObjects/EnrollmentSource.php`. This follows the same pattern as `BUNDLE` was added in Phase 17D.

### AD-18D-005: `access_level` Column Semantics Are Formally Defined

The existing `access_level VARCHAR` column on `quizzes` has no documented semantics. Phase 18D formalises it as an enum:

```php
enum QuizAccessLevel: string
{
    case COURSE_ONLY = 'course_only';   // Quiz only accessible via course enrollment
    case STANDALONE  = 'standalone';    // Quiz accessible as standalone product
    case BOTH        = 'both';          // Accessible both ways
}
```

Default for existing records: `COURSE_ONLY`. No data migration needed — existing quizzes that have `access_level = null` or an old string value are treated as `COURSE_ONLY` by the access service.

### AD-18D-006: Subscription Plan Quiz Entitlements Are Tenant-Scoped Quizzes

A Super Admin adds a specific quiz (by `quiz_id + tenant_id`) to a subscription plan. This means the entitlement is: "any student of tenant X who subscribes to plan Y gets access to quiz Z of tenant X."

**Critical:** The quiz must belong to the same tenant as the subscribing students. A Super Admin cannot accidentally add Quiz ID 42 from Tenant A to a plan and have Tenant B students access it. The entitlement stores `tenant_id` + `quiz_id` + `plan_id`.

```
subscription_plan_quiz_entitlements
├── id
├── plan_id (FK → subscription_plans)
├── tenant_id (FK → tenants) — the tenant who owns this quiz
├── quiz_id (INT, NOT FK — quiz may be soft-deleted per 18A)
├── created_by (admin user_id)
├── created_at
├── deleted_at (soft deletes — removing entitlement is a soft delete)
UNIQUE (plan_id, tenant_id, quiz_id)
```

### AD-18D-007: `QuizAccessService` Access Check Order

```
1. Check if quiz.access_level allows standalone access
   → if COURSE_ONLY: check only course enrollment path
   → if STANDALONE or BOTH: check all paths

2. Course enrollment path:
   → Does student have active course enrollment for any course containing this quiz?
   → Delegates to CourseEnrollmentRepositoryInterface

3. Direct quiz enrollment path:
   → Does student have active quiz enrollment record?
   → Delegates to QuizEnrollmentRepositoryInterface

4. Subscription path:
   → Does student have an active subscription?
   → Does that subscription plan have this quiz in its entitlements?
   → Must check: plan has entitlement AND tenant_id matches AND quiz_id matches
   → Delegates to SubscriptionQuizEntitlementQueryInterface

5. Return access path result
```

### AD-18D-008: Admin Open/Close Is a Status Extension, Not a New Table

The `quizzes.status` state machine is extended:

```
DRAFT → ACTIVE → ARCHIVED (existing)
ACTIVE → CLOSED (new — admin manually closes a live exam)
CLOSED → ACTIVE (admin re-opens — for windowed quizzes like mock tests)
```

`CLOSED` quizzes do not accept new attempts. Students with in-progress attempts (started but not submitted) at close time retain access to submit. The `CloseQuizUseCase` must NOT forcefully submit in-progress attempts — that is a future concern.

`QuizStatus` value object gains two new cases: `CLOSED` and potentially `SCHEDULED` (for future use — deferred, not implemented in 18D).

---

## 4. Domain Layer

### 4.1 Quiz Domain Additions

**`QuizAccessLevel` Value Object**
`Domain/TenantAdminDashboard/Quiz/ValueObjects/QuizAccessLevel.php`
Three cases: `COURSE_ONLY`, `STANDALONE`, `BOTH`. No lifecycle — pure enum.

**`QuizAccessPath` Value Object**
`Domain/TenantAdminDashboard/Quiz/ValueObjects/QuizAccessPath.php`

```php
final readonly class QuizAccessPath
{
    public function __construct(
        public readonly bool    $granted,
        public readonly ?string $reason, // 'course_enrollment' | 'direct_enrollment' | 'subscription' | null
    ) {}

    public static function denied(): self
    {
        return new self(granted: false, reason: null);
    }

    public static function viaCourseEnrollment(): self
    {
        return new self(granted: true, reason: 'course_enrollment');
    }

    public static function viaDirectEnrollment(): self
    {
        return new self(granted: true, reason: 'direct_enrollment');
    }

    public static function viaSubscription(): self
    {
        return new self(granted: true, reason: 'subscription');
    }
}
```

**`QuizAccessServiceInterface`**
`Domain/TenantAdminDashboard/Quiz/Services/QuizAccessServiceInterface.php`
As specified in AD-18D-002.

**`QuizStatus` Update**
Add `CLOSED = 'closed'` case. Update `canTransitionTo()`:
- `ACTIVE → CLOSED` (valid)
- `CLOSED → ACTIVE` (valid — re-open)
- `CLOSED → ARCHIVED` (valid — permanently retire)

**`QuizAccessWindowProps` Value Object**
`Domain/TenantAdminDashboard/Quiz/ValueObjects/QuizAccessWindowProps.php`

```php
final readonly class QuizAccessWindowProps
{
    public function __construct(
        public readonly ?DateTimeImmutable $startAt,
        public readonly ?DateTimeImmutable $endAt,
        public readonly bool               $adminControlled,
    ) {}

    public function isCurrentlyOpen(DateTimeImmutable $now): bool
    {
        if ($this->adminControlled) {
            return true; // admin-controlled = always open when status is ACTIVE
        }

        $afterStart = $this->startAt === null || $now >= $this->startAt;
        $beforeEnd  = $this->endAt === null   || $now <= $this->endAt;

        return $afterStart && $beforeEnd;
    }
}
```

### 4.2 Enrollment Domain Additions

**`QuizEnrollmentEntity`**
`Domain/TenantAdminDashboard/Enrollment/Entities/QuizEnrollmentEntity.php`

Mirrors `CourseEnrollmentEntity` exactly, substituting `quizId` for `courseId` and `quizName` for `courseName`. Same fields: `tenantId`, `userId`, `quizId`, `quizName`, `source`, `status`, `expiresAt`, `idempotencyKey`, `lockedAt`.

Domain event fired: `StudentEnrolledInQuizEvent`

**`QuizEnrollmentRepositoryInterface`**
`Domain/TenantAdminDashboard/Enrollment/Repositories/QuizEnrollmentRepositoryInterface.php`

```php
interface QuizEnrollmentRepositoryInterface
{
    public function save(QuizEnrollmentEntity $entity): QuizEnrollmentEntity;
    public function findActive(int $tenantId, int $userId, int $quizId): ?QuizEnrollmentEntity;
    public function findByUserId(int $tenantId, int $userId, int $page, int $perPage): PaginatedResult;
}
```

**`EnrollmentSource` Update**
Add `QUIZ_SUBSCRIPTION = 'quiz_subscription'` to the existing enum in `Domain/TenantAdminDashboard/Enrollment/ValueObjects/EnrollmentSource.php`.

### 4.3 SuperAdminDashboard Subscription Domain Additions

**`SubscriptionPlanQuizEntitlementEntity`**
`Domain/SuperAdminDashboard/Subscription/Entities/SubscriptionPlanQuizEntitlementEntity.php`

Fields: `id`, `planId`, `tenantId`, `quizId`, `createdBy`, `createdAt`

Invariants:
- `planId` must reference an existing non-archived plan
- `quizId` must be positive
- `tenantId` must be positive
- The combination `(planId, tenantId, quizId)` must be unique — enforced at DB level and application level

**`SubscriptionQuizEntitlementQueryInterface`**
`Domain/SuperAdminDashboard/Subscription/Repositories/SubscriptionQuizEntitlementQueryInterface.php`

```php
interface SubscriptionQuizEntitlementQueryInterface
{
    /**
     * Returns true if the tenant's active subscription plan
     * includes the specified quiz.
     */
    public function tenantSubscriptionIncludesQuiz(
        int $tenantId,
        int $userId,
        int $quizId
    ): bool;

    public function findByPlan(int $planId): array;
}
```

This interface is defined in the SuperAdminDashboard subscription domain but its implementation is injected into `EloquentQuizAccessService` in Infrastructure — a cross-context read that is legitimate at the infrastructure layer.

---

## 5. Application Layer

### 5.1 Quiz Domain Use Cases (New)

**`OpenQuizUseCase`**
Transitions quiz from `DRAFT` → `ACTIVE` (existing `ChangeQuizStatusUseCase` may handle this — confirm and extend if needed, or create a dedicated use case for clarity on windowed/admin-controlled semantics).

**`CloseQuizUseCase`**
Transitions quiz from `ACTIVE` → `CLOSED`. Does not affect in-progress attempts.

```
1. Load quiz — must be ACTIVE
2. Validate actor has quiz.publish capability
3. Transition status to CLOSED
4. Persist
5. Dispatch QuizStatusChanged event
6. Write audit log (quiz.closed) — OUTSIDE transaction
```

**`CheckQuizAccessUseCase`**
```
Inputs: tenantId, userId, quizId

1. Load quiz — if not found or wrong tenant: deny
2. Check quiz.status — if not ACTIVE: deny (CLOSED = not accepting new attempts)
3. Check quiz access level and access window:
   — if access window is defined and not currently open: deny
4. Call QuizAccessServiceInterface::canAccess(tenantId, userId, quizId)
5. Return access result
```

**`EnrollStudentInQuizUseCase`**
Admin-manual enrollment for standalone quizzes.

```
Inputs: tenantId, quizId, userId, actorId, expiresAt (optional), idempotencyKey

1. Validate quiz exists, belongs to tenant, is STANDALONE or BOTH
2. Validate quiz is ACTIVE (cannot enroll in archived or closed quizzes)
3. Idempotency check
4. Begin DB transaction
5. Create QuizEnrollmentEntity (source = ADMIN_MANUAL)
6. Persist via QuizEnrollmentRepositoryInterface
7. Capture StudentEnrolledInQuizEvent
8. Commit transaction
9. Write audit log (quiz_enrollment.created) — OUTSIDE transaction
10. Dispatch events
```

### 5.2 SuperAdminDashboard Use Cases (New)

**`AddQuizToSubscriptionPlanUseCase`**
Super Admin adds a specific quiz (by tenant + quiz ID) to a plan's entitlements.

```
Inputs: planId, tenantId, quizId, actorId

1. Validate plan exists and is not ARCHIVED
2. Validate tenantId is a valid active tenant
3. Validate quizId > 0 (existence check is best-effort — quiz may be created later)
4. Check entitlement does not already exist — throw DuplicateEntitlementException if so
5. Begin DB transaction
6. Create SubscriptionPlanQuizEntitlementEntity
7. Persist
8. Commit transaction
9. Write audit log (subscription_plan.quiz_entitlement_added) — OUTSIDE transaction
```

**Note on Step 3:** We do NOT validate that the quiz actually exists in the database. A Super Admin may be configuring a plan before the tenant has created a quiz. The access check at runtime is the final authority. This avoids a cross-context dependency at the use case level.

**`RemoveQuizFromSubscriptionPlanUseCase`**
Soft-deletes the entitlement row.

```
1. Load entitlement by (planId, tenantId, quizId) — throw if not found
2. Soft delete (deleted_at = now)
3. Write audit log (subscription_plan.quiz_entitlement_removed) — OUTSIDE transaction
```

**`ListPlanQuizEntitlementsQuery`**
Returns all non-deleted entitlements for a plan, grouped by tenant.

### 5.3 `SubmitQuizAnswersUseCase` Update

Must verify quiz access before accepting an answer submission. If the student's attempt is for a standalone quiz, call `QuizAccessServiceInterface::canAccess()` before writing responses. If the quiz is CLOSED mid-attempt, allow submission of already-started attempts (access is granted for started attempts regardless of close status — the attempt was legitimately started while ACTIVE).

---

## 6. Infrastructure Layer

### 6.1 Database Schema

**Table: `quiz_enrollments`**
`database/migrations/tenant/2026_03_21_180D_000001_create_quiz_enrollments_table.php`

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | BIGINT UNSIGNED PK | No | |
| `tenant_id` | BIGINT UNSIGNED FK | No | `tenants` |
| `user_id` | BIGINT UNSIGNED FK | No | `users` |
| `quiz_id` | BIGINT UNSIGNED | No | NOT FK — quiz may be soft-deleted |
| `quiz_name` | VARCHAR(255) | No | Denormalized at enrollment time |
| `source` | VARCHAR(50) | No | EnrollmentSource value |
| `status` | VARCHAR(50) | No | EnrollmentStatus value |
| `expires_at` | TIMESTAMP | Yes | Null = lifetime |
| `idempotency_key` | VARCHAR(255) | No | |
| `created_at` | TIMESTAMP | Yes | |
| `updated_at` | TIMESTAMP | Yes | |

**Indexes:**
- `idx_quiz_enrollments_tenant` (`tenant_id`)
- `UNIQUE idx_quiz_enrollments_user_quiz` (`tenant_id`, `user_id`, `quiz_id`)
- `UNIQUE idx_quiz_enrollments_idempotency` (`tenant_id`, `idempotency_key`)

**Table: `subscription_plan_quiz_entitlements`**
`database/migrations/central/2026_03_21_180D_000002_create_subscription_plan_quiz_entitlements_table.php`

This migration goes in `database/migrations/central/` — it is a platform-level (Super Admin) table, not tenant-scoped.

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | BIGINT UNSIGNED PK | No | |
| `plan_id` | BIGINT UNSIGNED FK | No | `subscription_plans` |
| `tenant_id` | BIGINT UNSIGNED FK | No | `tenants` |
| `quiz_id` | BIGINT UNSIGNED | No | NOT FK — quiz may not exist yet |
| `created_by` | BIGINT UNSIGNED | No | Admin user_id |
| `created_at` | TIMESTAMP | Yes | |
| `deleted_at` | TIMESTAMP | Yes | Soft deletes |

**Indexes:**
- `UNIQUE idx_plan_quiz_entitlement` (`plan_id`, `tenant_id`, `quiz_id`) WHERE `deleted_at IS NULL`
- `idx_entitlement_plan` (`plan_id`)
- `idx_entitlement_tenant_quiz` (`tenant_id`, `quiz_id`) — used by access check query

**Migration 3: Add columns to `quizzes` table**
`database/migrations/tenant/2026_03_21_180D_000003_extend_quizzes_for_standalone.php`

```php
Schema::table('quizzes', function (Blueprint $table) {
    // Formalise access_level as string (was already VARCHAR, now has documented values)
    // No type change needed — just document via migration comment
    $table->timestamp('access_starts_at')->nullable()->after('max_attempts');
    $table->timestamp('access_ends_at')->nullable()->after('access_starts_at');
    $table->boolean('admin_controlled_access')->default(false)->after('access_ends_at');
});
```

The `access_level` column already exists — no migration needed for the column itself, only for the formal enum values which are enforced at the application layer.

### 6.2 New Eloquent Models

| Model | Table | Notes |
|---|---|---|
| `QuizEnrollmentRecord` | `quiz_enrollments` | `BelongsToTenant` |
| `SubscriptionPlanQuizEntitlementRecord` | `subscription_plan_quiz_entitlements` | No `BelongsToTenant` — central table. `SoftDeletes`. |

### 6.3 New Repository Implementations

| Interface | Implementation | Location |
|---|---|---|
| `QuizEnrollmentRepositoryInterface` | `EloquentQuizEnrollmentRepository` | `Infrastructure/Persistence/TenantAdminDashboard/Enrollment/` |
| `SubscriptionQuizEntitlementQueryInterface` | `EloquentSubscriptionQuizEntitlementQuery` | `Infrastructure/Persistence/SuperAdminDashboard/Subscription/` |

### 6.4 `EloquentQuizAccessService`

**File:** `Infrastructure/Persistence/TenantAdminDashboard/Quiz/EloquentQuizAccessService.php`

Implements `QuizAccessServiceInterface`. Injects:
- `CourseEnrollmentRepositoryInterface` (from Enrollment domain)
- `QuizEnrollmentRepositoryInterface` (from Enrollment domain)
- `SubscriptionQuizEntitlementQueryInterface` (from Subscription domain)

```php
public function resolveAccessPath(int $tenantId, int $userId, int $quizId): ?QuizAccessPath
{
    // 1. Check course enrollment path
    // Find any course that contains this quiz
    // Check if student is enrolled in that course
    $courseIds = $this->quizCourseQuery->findCourseIdsContainingQuiz($tenantId, $quizId);
    foreach ($courseIds as $courseId) {
        $enrollment = $this->courseEnrollmentRepo->findActive($tenantId, $userId, $courseId);
        if ($enrollment !== null) {
            return QuizAccessPath::viaCourseEnrollment();
        }
    }

    // 2. Check direct quiz enrollment
    $quizEnrollment = $this->quizEnrollmentRepo->findActive($tenantId, $userId, $quizId);
    if ($quizEnrollment !== null) {
        return QuizAccessPath::viaDirectEnrollment();
    }

    // 3. Check subscription entitlement
    $hasSubscriptionAccess = $this->entitlementQuery
        ->tenantSubscriptionIncludesQuiz($tenantId, $userId, $quizId);
    if ($hasSubscriptionAccess) {
        return QuizAccessPath::viaSubscription();
    }

    return QuizAccessPath::denied();
}

public function canAccess(int $tenantId, int $userId, int $quizId): bool
{
    return $this->resolveAccessPath($tenantId, $userId, $quizId)?->granted ?? false;
}
```

Note: `quizCourseQuery` needs a new interface `QuizCourseQueryInterface` in the Quiz domain — a simple query that returns course IDs for quizzes associated with a given quiz ID via `quizzes.course_id`.

---

## 7. HTTP Layer

### 7.1 New Capability Codes

No new quiz capability codes are needed — `quiz.view`, `quiz.create`, `quiz.edit`, `quiz.publish`, `quiz.archive` already cover all operations.

Super Admin entitlement management uses existing `billing.manage` capability.

### 7.2 New Quiz API Endpoints

Added to `routes/tenant_dashboard/quiz.php`:

| Method | URI | Purpose | Capability |
|---|---|---|---|
| `POST` | `/api/tenant/quizzes/{quizId}/close` | Close an active quiz | `quiz.publish` |
| `POST` | `/api/tenant/quizzes/{quizId}/enroll` | Admin-enroll student in quiz | `quiz.edit` |
| `GET` | `/api/tenant/quizzes/{quizId}/access-check` | Check if current student can access quiz | (student-facing, no capability required — auth only) |

### 7.3 New Super Admin API Endpoints

Added to a new route file `routes/api.php` under the super admin context:

| Method | URI | Purpose | Permission |
|---|---|---|---|
| `GET` | `/api/admin/subscription-plans/{planId}/quiz-entitlements` | List quiz entitlements for a plan | `billing.view` |
| `POST` | `/api/admin/subscription-plans/{planId}/quiz-entitlements` | Add quiz to plan | `billing.manage` |
| `DELETE` | `/api/admin/subscription-plans/{planId}/quiz-entitlements/{id}` | Remove quiz from plan | `billing.manage` |

New controller: `SubscriptionPlanQuizEntitlementController` in `Http/Controllers/Api/SuperAdminDashboard/Subscription/`.

---

## 8. Business Rules (Non-Negotiable)

| ID | Rule | Enforcement |
|---|---|---|
| BR-01 | `quiz_id` in subscription entitlements is NOT a FK — quiz may not exist yet when entitlement is configured | Schema decision — plain integer column |
| BR-02 | Entitlement uniqueness: `(plan_id, tenant_id, quiz_id)` — no duplicates where `deleted_at IS NULL` | UNIQUE partial index + application check |
| BR-03 | Closing a quiz does NOT forcefully submit in-progress attempts | `CloseQuizUseCase` only changes status — no attempt mutation |
| BR-04 | Students with started attempts retain submission rights after quiz is CLOSED | `SubmitQuizAnswersUseCase` checks attempt status, not quiz status, when accepting submissions |
| BR-05 | Access check order: course enrollment → direct enrollment → subscription | `EloquentQuizAccessService` enforces this order |
| BR-06 | `QuizEnrollmentEntity.quizName` is denormalized at enrollment time | Invariant in entity constructor — `quizName` cannot be empty |
| BR-07 | Subscription entitlement check must verify same `tenant_id` | `tenantSubscriptionIncludesQuiz()` query includes `tenant_id` condition — cross-tenant access impossible |
| BR-08 | `access_level = COURSE_ONLY` skips standalone access paths — course enrollment is the only check | `EloquentQuizAccessService::resolveAccessPath()` gates paths by access_level |
| BR-09 | Admin-manual quiz enrollment requires quiz to be STANDALONE or BOTH | `EnrollStudentInQuizUseCase` validation |
| BR-10 | `EnrollmentSource::QUIZ_SUBSCRIPTION` is set on enrollment records created by subscription access | Enrollment entity factory for subscription-triggered access |
| BR-11 | All audit logs outside transactions | Platform rule — no exceptions |
| BR-12 | `QuizStatus.CLOSED` → only `ACTIVE` or `ARCHIVED` transitions are valid | `QuizStatus::canTransitionTo()` update |

---

## 9. Test Plan

### 9.1 Unit Tests — Domain

**File:** `tests/Unit/Domain/TenantAdminDashboard/Quiz/ValueObjects/QuizAccessLevelTest.php`

| Test | Description |
|---|---|
| `test_course_only_level_exists` | Enum case |
| `test_standalone_level_exists` | Enum case |
| `test_both_level_exists` | Enum case |

**File:** `tests/Unit/Domain/TenantAdminDashboard/Quiz/ValueObjects/QuizAccessWindowPropsTest.php`

| Test | Description |
|---|---|
| `test_open_when_no_window_defined` | No start/end = always open |
| `test_closed_before_start_date` | Temporal check |
| `test_open_during_window` | Temporal check |
| `test_closed_after_end_date` | Temporal check |
| `test_admin_controlled_always_open` | Flag override |

**File:** `tests/Unit/Domain/TenantAdminDashboard/Quiz/ValueObjects/QuizStatusTest.php`

Add to existing:

| Test | Description |
|---|---|
| `test_active_can_transition_to_closed` | New transition |
| `test_closed_can_transition_to_active` | Re-open |
| `test_closed_can_transition_to_archived` | Retire |
| `test_archived_cannot_transition_to_closed` | Terminal state |

### 9.2 Unit Tests — Application

**File:** `tests/Unit/Application/TenantAdminDashboard/Quiz/UseCases/CheckQuizAccessUseCaseTest.php`

| Test | Description |
|---|---|
| `test_denies_access_when_quiz_not_active` | Status check |
| `test_denies_access_outside_window` | Window check |
| `test_grants_access_via_course_enrollment` | Path 1 |
| `test_grants_access_via_direct_enrollment` | Path 2 |
| `test_grants_access_via_subscription` | Path 3 |
| `test_denies_when_no_access_path` | Full deny |

**File:** `tests/Unit/Application/TenantAdminDashboard/Quiz/UseCases/CloseQuizUseCaseTest.php`

| Test | Description |
|---|---|
| `test_closes_active_quiz` | Happy path |
| `test_cannot_close_draft_quiz` | Invalid transition |
| `test_does_not_affect_in_progress_attempts` | BR-03 |

**File:** `tests/Unit/Application/SuperAdminDashboard/Subscription/UseCases/AddQuizToSubscriptionPlanUseCaseTest.php`

| Test | Description |
|---|---|
| `test_adds_quiz_entitlement_to_plan` | Happy path |
| `test_rejects_archived_plan` | Plan status guard |
| `test_rejects_duplicate_entitlement` | BR-02 |
| `test_audit_log_written_after_commit` | BR-11 |

### 9.3 Unit Tests — Infrastructure

**File:** `tests/Unit/Infrastructure/Quiz/EloquentQuizAccessServiceTest.php`

| Test | Description |
|---|---|
| `test_access_via_course_enrollment` | Path 1 |
| `test_access_via_direct_enrollment_skips_course_check` | Efficiency |
| `test_access_via_subscription` | Path 3 |
| `test_course_only_quiz_skips_subscription_check` | BR-08 |
| `test_cross_tenant_subscription_denied` | BR-07 |

### 9.4 Feature Tests

**File:** `tests/Feature/TenantAdminDashboard/Quiz/QuizAccessTest.php`

| Test | Description |
|---|---|
| `test_student_without_any_access_denied` | Full stack |
| `test_student_with_course_enrollment_granted` | Full stack |
| `test_student_with_direct_enrollment_granted` | Full stack |
| `test_student_with_subscription_entitlement_granted` | Full stack |
| `test_closed_quiz_denies_new_attempts` | Status check |
| `test_started_attempt_can_submit_after_quiz_closed` | BR-04 |

**File:** `tests/Feature/SuperAdminDashboard/Subscription/SubscriptionPlanQuizEntitlementTest.php`

| Test | Description |
|---|---|
| `test_add_quiz_to_plan` | Full stack |
| `test_remove_quiz_from_plan` | Soft delete |
| `test_cannot_add_duplicate_entitlement` | BR-02 |
| `test_list_plan_entitlements` | Query |

### 9.5 Regression

```powershell
docker exec -it ubotz_backend sh -c "cd /var/www && php artisan test --filter=Quiz 2>&1 | tail -5"
docker exec -it ubotz_backend sh -c "cd /var/www && php artisan test --filter=Subscription 2>&1 | tail -5"
```

Both must pass. The subscription tests are included because `subscription_plan_quiz_entitlements` extends the subscription domain.

---

## 10. Quality Gate

| # | Check | How to Verify |
|---|---|---|
| 1 | `quiz_enrollments` table exists with correct schema | Migration + `DESCRIBE` |
| 2 | `subscription_plan_quiz_entitlements` table in `central/` migrations | Migration location check |
| 3 | `quiz_id` on both new tables is NOT a FK constraint | Migration inspection |
| 4 | `QuizAccessLevel` enum has COURSE_ONLY, STANDALONE, BOTH | Code review |
| 5 | `QuizStatus` has CLOSED case with correct transitions | Unit test |
| 6 | `EloquentQuizAccessService` checks access_level before subscription path | Unit test |
| 7 | `tenantSubscriptionIncludesQuiz()` query includes `tenant_id` filter | Code review |
| 8 | Cross-tenant subscription access denied | Unit test |
| 9 | `CloseQuizUseCase` does not affect in-progress attempts | Unit test |
| 10 | Started attempts can submit after quiz is closed | Feature test |
| 11 | Duplicate entitlement rejected at both DB and application level | Unit test |
| 12 | `EnrollmentSource::QUIZ_SUBSCRIPTION` exists | Enum inspection |
| 13 | `StudentEnrolledInQuizEvent` fires on direct enrollment | Unit test |
| 14 | Audit logs outside transactions — no regression | Code review |
| 15 | `php artisan test --filter=Quiz` zero failures, zero risky | Test output |
| 16 | `php artisan test --filter=Subscription` zero failures | Test output |
| 17 | PHPStan level 5 on all new and modified files | PHPStan output |

---

## 11. File Manifest

### New Files

| File | Purpose |
|---|---|
| `app/Domain/TenantAdminDashboard/Quiz/ValueObjects/QuizAccessLevel.php` | Access level enum |
| `app/Domain/TenantAdminDashboard/Quiz/ValueObjects/QuizAccessPath.php` | Access result VO |
| `app/Domain/TenantAdminDashboard/Quiz/ValueObjects/QuizAccessWindowProps.php` | Window VO |
| `app/Domain/TenantAdminDashboard/Quiz/Services/QuizAccessServiceInterface.php` | Service interface |
| `app/Domain/TenantAdminDashboard/Quiz/Services/QuizCourseQueryInterface.php` | Cross-context query |
| `app/Domain/TenantAdminDashboard/Enrollment/Entities/QuizEnrollmentEntity.php` | Enrollment aggregate |
| `app/Domain/TenantAdminDashboard/Enrollment/Events/StudentEnrolledInQuizEvent.php` | Domain event |
| `app/Domain/TenantAdminDashboard/Enrollment/Repositories/QuizEnrollmentRepositoryInterface.php` | Domain contract |
| `app/Domain/SuperAdminDashboard/Subscription/Entities/SubscriptionPlanQuizEntitlementEntity.php` | Entitlement entity |
| `app/Domain/SuperAdminDashboard/Subscription/Repositories/SubscriptionQuizEntitlementQueryInterface.php` | Domain contract |
| `app/Application/TenantAdminDashboard/Quiz/UseCases/CloseQuizUseCase.php` | Use case |
| `app/Application/TenantAdminDashboard/Quiz/UseCases/CheckQuizAccessUseCase.php` | Use case |
| `app/Application/TenantAdminDashboard/Quiz/UseCases/EnrollStudentInQuizUseCase.php` | Use case |
| `app/Application/SuperAdminDashboard/Subscription/Commands/AddQuizEntitlementCommand.php` | DTO |
| `app/Application/SuperAdminDashboard/Subscription/Commands/RemoveQuizEntitlementCommand.php` | DTO |
| `app/Application/SuperAdminDashboard/Subscription/Queries/ListPlanQuizEntitlementsQuery.php` | Query |
| `app/Application/SuperAdminDashboard/Subscription/UseCases/AddQuizToSubscriptionPlanUseCase.php` | Use case |
| `app/Application/SuperAdminDashboard/Subscription/UseCases/RemoveQuizFromSubscriptionPlanUseCase.php` | Use case |
| `app/Infrastructure/Persistence/TenantAdminDashboard/Enrollment/QuizEnrollmentRecord.php` | Eloquent model |
| `app/Infrastructure/Persistence/TenantAdminDashboard/Enrollment/EloquentQuizEnrollmentRepository.php` | Repository |
| `app/Infrastructure/Persistence/TenantAdminDashboard/Quiz/EloquentQuizAccessService.php` | Service impl |
| `app/Infrastructure/Persistence/TenantAdminDashboard/Quiz/EloquentQuizCourseQuery.php` | Query impl |
| `app/Infrastructure/Persistence/SuperAdminDashboard/Subscription/SubscriptionPlanQuizEntitlementRecord.php` | Eloquent model |
| `app/Infrastructure/Persistence/SuperAdminDashboard/Subscription/EloquentSubscriptionQuizEntitlementQuery.php` | Query impl |
| `app/Http/Controllers/Api/SuperAdminDashboard/Subscription/SubscriptionPlanQuizEntitlementController.php` | Controller |
| `database/migrations/tenant/2026_03_21_180D_000001_create_quiz_enrollments_table.php` | Migration |
| `database/migrations/central/2026_03_21_180D_000002_create_subscription_plan_quiz_entitlements_table.php` | Migration |
| `database/migrations/tenant/2026_03_21_180D_000003_extend_quizzes_for_standalone.php` | Migration |
| `tests/Unit/Domain/TenantAdminDashboard/Quiz/ValueObjects/QuizAccessLevelTest.php` | Unit test |
| `tests/Unit/Domain/TenantAdminDashboard/Quiz/ValueObjects/QuizAccessWindowPropsTest.php` | Unit test |
| `tests/Unit/Application/TenantAdminDashboard/Quiz/UseCases/CheckQuizAccessUseCaseTest.php` | Unit test |
| `tests/Unit/Application/TenantAdminDashboard/Quiz/UseCases/CloseQuizUseCaseTest.php` | Unit test |
| `tests/Unit/Application/SuperAdminDashboard/Subscription/UseCases/AddQuizToSubscriptionPlanUseCaseTest.php` | Unit test |
| `tests/Unit/Infrastructure/Quiz/EloquentQuizAccessServiceTest.php` | Unit test |
| `tests/Feature/TenantAdminDashboard/Quiz/QuizAccessTest.php` | Feature test |
| `tests/Feature/SuperAdminDashboard/Subscription/SubscriptionPlanQuizEntitlementTest.php` | Feature test |

### Modified Files

| File | Change |
|---|---|
| `app/Domain/TenantAdminDashboard/Quiz/ValueObjects/QuizStatus.php` | Add CLOSED case + transitions |
| `app/Domain/TenantAdminDashboard/Enrollment/ValueObjects/EnrollmentSource.php` | Add QUIZ_SUBSCRIPTION case |
| `app/Application/TenantAdminDashboard/Quiz/UseCases/StartQuizAttemptUseCase.php` | Integrate QuizAccessServiceInterface check |
| `app/Application/TenantAdminDashboard/Quiz/UseCases/SubmitQuizAnswersUseCase.php` | BR-04: accept submission regardless of quiz closed status if attempt started |
| Service provider for quiz bindings | Add QuizAccessServiceInterface, QuizCourseQueryInterface, QuizEnrollmentRepositoryInterface |
| Service provider for subscription bindings | Add SubscriptionQuizEntitlementQueryInterface |
| `routes/tenant_dashboard/quiz.php` | Add close and enroll endpoints |

---

## 12. Phase 18 Series — Completion Dependencies

After Phase 18D is certified, three phases are unblocked:

| Phase | Can Start When |
|---|---|
| **18E** (Student UI) | 18A + 18B + 18C + 18D all certified |
| **18B** | Was parallel to 18C/18D — should already be running |
| **18C** | Was parallel to 18B/18D — should already be running |

The full quiz feature is production-ready for admin use after 18A + 18B + 18C + 18D. Phase 18E makes it student-facing.

---

*End of Phase 18D Developer Instructions*
*Issued by Principal Engineer — 2026-03-21*
*Next step: Antigravity to produce Phase 18D Implementation Plan for Principal Engineer audit before implementation begins.*
*Note: 18B, 18C, and 18D can run in parallel after 18A is certified. All three must be certified before 18E begins.*
