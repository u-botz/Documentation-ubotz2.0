# UBOTZ 2.0 — Phase 17D Developer Instructions

## Course Domain Correction Series — Part 4: Bundle Bounded Context

| Field | Value |
|---|---|
| **Document Type** | Developer Instruction (Pre-Implementation Brief) |
| **Phase** | 17D |
| **Series** | Course Domain Correction (17A → 17B → 17C → 17D) |
| **Date** | 2026-03-20 |
| **Issued By** | Principal Engineer / Architecture Auditor |
| **Audience** | Antigravity Implementation Team |
| **Expected Deliverable** | Phase 17D Implementation Plan |
| **Prerequisites** | Phase 17A CERTIFIED COMPLETE, Phase 17C CERTIFIED COMPLETE (Pricing context must exist before Bundle can reference it) |
| **Parallel Dependency** | Phase 17B must be CERTIFIED COMPLETE before the enrollment grant path in §6.3 is built |

> **This phase introduces real money risk. A Bundle is a sellable product with a price. When a student buys a Bundle, real payment is collected and real course access is granted. Every decision in this phase must be made with the assumption that production tenants are selling to real students. Idempotency, audit trails, pessimistic locking, and price immutability are non-negotiable from day one.**

---

## 1. Mission Statement

Phase 17D designs and implements the **Bundle bounded context** — the formal product that allows a tenant admin to package multiple courses together under a single price and sell that package as one unit.

This was confirmed as in-scope during the 2026-03-20 business decisions session (Decision 2):

> *"Bundle pricing is in scope. Needs to be designed now. No bundle entity currently exists."*

A Bundle is not a Course feature. It is not a Pricing feature. It is a standalone **product type** — a first-class sellable entity that sits alongside Course as a purchasable unit in the platform's commerce model.

This phase builds the Bundle domain, application, and infrastructure layers. It does not build checkout UI or payment processing — those are the responsibility of the existing Payment bounded context which will be extended to accept `BUNDLE` as a product type.

---

## 2. What This Phase Includes

- `Bundle` bounded context: Domain, Application, Infrastructure layers
- `BundleEntity` aggregate root with lifecycle (DRAFT → PUBLISHED → ARCHIVED)
- `BundleCourse` join entity (courses that belong to a bundle)
- `BundlePrice` value object (flat price, stored as cents)
- Bundle creation, update, publish, archive use cases
- Bundle course management (add/remove courses from a bundle)
- `BundleRepositoryInterface` and Eloquent implementation
- `CalculateBundlePriceUseCase` in the Pricing bounded context (extends 17C's pricing infrastructure)
- `bundles` and `bundle_courses` database migrations
- Bundle access check — extend `CheckCourseAccessUseCase` to grant access via bundle enrollment
- Admin API endpoints (create, update, publish, archive, manage courses, list, get)
- Capability gating: `bundle.create`, `bundle.edit`, `bundle.view`
- Audit log entries for all mutations
- Full test coverage

## 2.1 What This Phase Does NOT Include

- Student-facing bundle purchase UI (frontend — separate phase)
- Checkout flow for bundle payment (Payment bounded context extension — separate phase)
- Bundle discount/coupon codes (Pricing bounded context extension — future)
- Bundle subscription access (subscription grants bundle access — future)
- Bundle enrollment automatic trigger on payment (requires Payment bounded context extension)
- Bundle analytics or statistics
- Bundle duplication
- Bundle prerequisites

---

## 3. Business Context

### 3.1 What Is a Bundle?

A Bundle is a curated collection of courses sold together at a single price. Examples across institution types:

| Institution Type | Bundle Example | Business Value |
|---|---|---|
| EdTech (B2C) | "Complete JEE Prep 2026" — Physics + Chemistry + Maths + Mock Tests | Higher average order value vs individual course sales |
| Coaching Institute | "Class 10 Annual Pack" — All subjects for the academic year | Simplifies admin enrollment (one purchase, all access) |
| Corporate Training | "New Employee Onboarding Bundle" — 5 mandatory training courses | Admin assigns one product instead of 5 individual courses |

### 3.2 Bundle vs Course — Key Distinctions

| Property | Course | Bundle |
|---|---|---|
| Has content (chapters, lessons) | Yes | No — contains only course references |
| Has its own price | Yes | Yes — flat price independent of course prices |
| Grants access to | Itself | All courses it contains |
| Can be free | Yes | Yes |
| Has capacity (seat limits) | Yes | No — capacity is per-course |
| Has drip content | Yes | No — drip is per-course |
| Can be privately assigned | Yes | Yes |

### 3.3 Access Model — How Bundle Access Works

When a student purchases a Bundle (or is manually enrolled in one):
1. A `BundleEnrollment` record is created linking the student to the bundle
2. For each course in the bundle, a `CourseEnrollment` record is created with `source = BATCH` — wait, this is wrong. Source must be `BUNDLE`. Add `BUNDLE` to `EnrollmentSource` in the Enrollment domain (see §5.4).
3. `CheckCourseAccessUseCase` is extended to check for active bundle enrollment that contains the requested course

This means bundle access is resolved at the course access check level — a student with a bundle enrollment is considered enrolled in each course the bundle contains. The bundle is the purchase vehicle; individual course enrollments are the access grants.

### 3.4 Bundle Pricing Is Independent of Course Prices

A bundle has its own flat price (`price_amount_cents`). It does not auto-calculate from summed course prices. The tenant admin sets the bundle price explicitly. `CalculateBundlePriceUseCase` in the Pricing context applies discount rules and special offers against the bundle base price — same pattern as `CalculatePriceUseCase` for courses.

### 3.5 Confirmed Status Transitions

Matching Course domain decisions from Phase 17A:

```
DRAFT     → PUBLISHED  (requires publish readiness check)
DRAFT     → ARCHIVED
PUBLISHED → ARCHIVED   (terminal)
```

No ACTIVE, INACTIVE, or PENDING states. The lessons from Phase 17A apply directly.

---

## 4. Architecture Decisions

### AD-17D-001: Bundle Is a Standalone Bounded Context, Not a Course Extension

Bundle lives at `Domain/TenantAdminDashboard/Bundle/` — not inside Course. Course does not know about Bundle. Bundle knows about Course (it references course IDs) but only as primitive IDs — no direct entity import from the Course domain.

**Rationale:** Bundle and Course have different lifecycles, different publish requirements, different pricing models. Embedding Bundle inside Course would recreate the same boundary violation we just extracted from the enrollment system.

### AD-17D-002: `BundleEnrollment` Lives in the Enrollment Bounded Context

A `BundleEnrollmentEntity` is created in `Domain/TenantAdminDashboard/Enrollment/` alongside `CourseEnrollmentEntity`. It is not owned by Bundle. The Bundle domain fires a `BundlePublished` or `StudentEnrolledInBundleEvent` — the Enrollment domain creates the access records.

**Rationale:** Enrollment is the access contract layer. All access grants, regardless of source (course purchase, batch, bundle), flow through the Enrollment bounded context. This was established in Phase 17B.

### AD-17D-003: `EnrollmentSource::BUNDLE` Added to Enrollment Domain

The `EnrollmentSource` enum in `Domain/TenantAdminDashboard/Enrollment/ValueObjects/EnrollmentSource.php` must gain a `BUNDLE` case in this phase. Phase 17B added `BATCH` and `SUBSCRIPTION` as forward stubs. `BUNDLE` was not added at that time because the Bundle design was not yet complete.

### AD-17D-004: `CheckCourseAccessUseCase` Gets Bundle Access Path

The access check chain established in Phase 17B:
```
1. Direct enrollment
2. Batch access (NullBatchEnrollmentAccess stub)
3. Subscription access
4. Deny
```

Must be extended in Phase 17D:
```
1. Direct enrollment
2. Bundle enrollment (BundleEnrollmentAccessInterface)
3. Batch access (NullBatchEnrollmentAccess stub — unchanged)
4. Subscription access
5. Deny
```

Bundle access is checked before batch because bundle is a direct purchase (student bought the bundle). Batch is an institutional assignment. The order reflects confidence: direct purchase > bundle purchase > batch assignment > subscription.

`BundleEnrollmentAccessInterface` follows the exact same pattern as `BatchEnrollmentAccessInterface` from Phase 17B — defined in the Enrollment domain, implemented in Enrollment infrastructure, injected into `CheckCourseAccessUseCase`.

### AD-17D-005: Bundle Publish Requirements

A Bundle cannot be published unless:
- It has a title (5–255 chars)
- It has at least 2 courses assigned
- It has a price set (0 is valid — free bundles are allowed)
- It has a thumbnail

Rationale for minimum 2 courses: a single-course bundle is just a course with extra steps. Enforcing minimum 2 courses prevents meaningless bundles and ensures the concept is used correctly.

### AD-17D-006: Financial Safety — Price Immutability After First Enrollment

Once a student enrolls in a bundle (via purchase or manual assignment), the bundle's `price_amount_cents` must not change for that enrollment. The `BundleEnrollmentEntity` stores a `locked_price_cents` at the time of enrollment — same pattern as `locked_price_monthly_cents` on `TenantSubscriptionEntity`.

This means a tenant admin changing the bundle price after launch does not retroactively affect existing students.

### AD-17D-007: No Capacity Limits on Bundle

Bundles have no seat limit. Individual courses within the bundle may have seat limits — those are enforced at the course enrollment level, not at the bundle level. If a course in the bundle is full, the bundle enrollment proceeds but that specific course enrollment fails gracefully with an appropriate exception. The student gets access to all other courses in the bundle.

---

## 5. Domain Layer

### 5.1 Directory Structure

```
app/Domain/TenantAdminDashboard/Bundle/
├── Entities/
│   ├── BundleEntity.php
│   └── BundleCourseEntity.php
├── Events/
│   ├── BundleCreated.php
│   ├── BundleUpdated.php
│   ├── BundleStatusChanged.php
│   └── BundleArchived.php
├── Exceptions/
│   ├── BundlePublishRequirementsNotMetException.php
│   ├── InvalidBundleStatusTransitionException.php
│   ├── BundleMinimumCoursesException.php
│   └── DuplicateBundleCourseException.php
├── Repositories/
│   ├── BundleRepositoryInterface.php
│   └── BundleCourseRepositoryInterface.php
└── ValueObjects/
    ├── BundleProps.php
    ├── BundleStatus.php
    └── BundleSlug.php
```

### 5.2 `BundleEntity` — Aggregate Root

**Invariants to enforce:**

| Invariant | Rule |
|---|---|
| Title | 5–255 characters |
| Slug | Valid URL slug, unique per tenant (enforced at UseCase level) |
| Price | Non-negative integer (cents) |
| Status transitions | Must pass `BundleStatus::canTransitionTo()` |
| Publish gate | Minimum 2 courses, thumbnail present, title set |

**Domain events fired:**

| Event | When |
|---|---|
| `BundleCreated` | On `BundleEntity::create()` |
| `BundleUpdated` | On metadata changes |
| `BundleStatusChanged` | On any status transition |
| `BundleArchived` | On transition to ARCHIVED specifically |

**Important:** `BundleArchived` is a separate event from `BundleStatusChanged` — same pattern as the Course domain's `CourseArchived`. Archiving has distinct side effects (e.g., future notification listeners may want to notify enrolled students).

### 5.3 `BundleStatus` Value Object

```php
enum BundleStatus: string
{
    case DRAFT     = 'draft';
    case PUBLISHED = 'published';
    case ARCHIVED  = 'archived';    // terminal
}
```

Transition map:
```
DRAFT     → PUBLISHED  (ensureCanBePublished())
DRAFT     → ARCHIVED
PUBLISHED → ARCHIVED
ARCHIVED  → (none — terminal)
```

No ACTIVE, INACTIVE, or PENDING. Do not introduce them. Phase 17A established this as the canonical three-state lifecycle for instructional products on this platform.

### 5.4 `EnrollmentSource::BUNDLE` — Addition to Enrollment Domain

**File to modify:** `app/Domain/TenantAdminDashboard/Enrollment/ValueObjects/EnrollmentSource.php`

Add:
```php
case BUNDLE = 'bundle';   // Student enrolled via bundle purchase
```

This is a modification to an Enrollment domain file from Phase 17B. It must be done as part of Phase 17D — not before, because the Bundle concept did not exist when Phase 17B was written.

### 5.5 `BundleCourseEntity`

Represents the relationship between a Bundle and a Course. It is not a join table record — it is a domain entity because the relationship may carry ordering (`sort_order`) and future metadata.

Fields:
- `bundleId: int`
- `courseId: int`
- `tenantId: int`
- `sortOrder: int`
- `addedAt: DateTimeImmutable`

Business rules:
- A course can appear in multiple bundles (no uniqueness constraint across bundles)
- A course cannot appear twice in the same bundle (`DuplicateBundleCourseException`)
- Removing a course from a published bundle is allowed — but does not revoke access for students already enrolled

### 5.6 New Enrollment Domain — `BundleEnrollmentEntity`

**File:** `app/Domain/TenantAdminDashboard/Enrollment/Entities/BundleEnrollmentEntity.php`

Mirrors `CourseEnrollmentEntity` structure but represents enrollment in a Bundle:

Key fields:
- `tenantId`, `userId`, `bundleId`
- `bundleName: string` (denormalized — same reason as `courseName` in `CourseEnrollmentEntity`)
- `lockedPriceCents: int` (price at time of enrollment — financial immutability per AD-17D-006)
- `source: EnrollmentSource` (PURCHASE or ADMIN_MANUAL)
- `status: EnrollmentStatus`
- `expiresAt: ?DateTimeImmutable`
- `idempotencyKey: string`

Domain event fired: `StudentEnrolledInBundleEvent`

This entity must follow the same patterns as `CourseEnrollmentEntity`: immutable via readonly props, `create()` vs `restore()` factory methods, `cancel()` returns new instance.

### 5.7 `BundleEnrollmentAccessInterface`

**File:** `app/Domain/TenantAdminDashboard/Enrollment/Services/BundleEnrollmentAccessInterface.php`

```php
interface BundleEnrollmentAccessInterface
{
    /**
     * Returns true if the user has active access to the course
     * via an active bundle enrollment containing that course.
     */
    public function hasAccessViaBundle(int $tenantId, int $userId, int $courseId): bool;
}
```

**Implementation:** `EloquentBundleEnrollmentAccess` in Infrastructure. Unlike `NullBatchEnrollmentAccess`, this is a **real implementation** — it queries `bundle_enrollments` → `bundle_courses` to check if the user has an active bundle enrollment containing the course.

---

## 6. Application Layer

### 6.1 Directory Structure

```
app/Application/TenantAdminDashboard/Bundle/
├── Commands/
│   ├── CreateBundleCommand.php
│   ├── UpdateBundleCommand.php
│   ├── ChangeBundleStatusCommand.php
│   ├── AddCourseToBundleCommand.php
│   └── RemoveCourseFromBundleCommand.php
├── Queries/
│   ├── GetBundleQuery.php
│   ├── ListBundlesQuery.php
│   └── BundleListCriteria.php
└── UseCases/
    ├── CreateBundleUseCase.php
    ├── UpdateBundleUseCase.php
    ├── ChangeBundleStatusUseCase.php
    ├── AddCourseToBundleUseCase.php
    ├── RemoveCourseFromBundleUseCase.php
    └── EnrollStudentInBundleUseCase.php
```

### 6.2 `CreateBundleUseCase` — Required Orchestration Sequence

This follows the established platform UseCase pattern exactly:

```
1. Begin DB transaction
2. Lock tenant row (lockForUpdate) — quota check if bundle quotas are defined
3. Idempotency lookup by (tenantId, idempotencyKey) → return existing if present
4. Enforce slug uniqueness within tenant
5. Build BundleProps with initial BundleStatus::DRAFT
6. Create BundleEntity
7. Persist bundle (bundleRepository->save)
8. Store idempotency record
9. Capture domain events from entity
10. Commit transaction
11. Write audit log (bundle.created) — OUTSIDE transaction
12. Dispatch captured events after commit
```

This is the same sequence as `CreateCourseUseCase` post-Phase 17A fix. The audit log at step 11 must be outside the transaction — non-negotiable.

### 6.3 `EnrollStudentInBundleUseCase` — Financial Safety Requirements

This use case creates a `BundleEnrollmentEntity` AND individual `CourseEnrollmentEntity` records for each course in the bundle. It is the highest-risk use case in this phase.

**Required safety guarantees:**

| Requirement | Implementation |
|---|---|
| Pessimistic locking | `lockForUpdate` on the bundle record before reading course list |
| Idempotency | `idempotencyKey` required — prevent double-enrollment on retry |
| Locked price | `lockedPriceCents` captured at enrollment time from bundle's current price |
| Partial failure handling | If a course in the bundle has no capacity, that course enrollment is skipped (not failed) — bundle enrollment proceeds. Skipped courses are recorded in the result payload. |
| Audit log | Written outside transaction — `bundle.student_enrolled` |
| Domain event | `StudentEnrolledInBundleEvent` dispatched after commit |
| Transaction scope | Single transaction wraps: bundle enrollment record + all course enrollment records. Commit or rollback together. |

**Sequence:**
```
1. Validate bundle exists and is PUBLISHED
2. Lock bundle record (lockForUpdate)
3. Idempotency check
4. Load all active courses in bundle
5. Begin DB transaction
6. Create BundleEnrollmentEntity with locked_price_cents
7. Persist BundleEnrollmentEntity
8. For each course:
   a. Check course capacity
   b. If capacity available → create CourseEnrollmentEntity (source=BUNDLE)
   c. If capacity full → add to skipped_courses list, continue
9. Persist all CourseEnrollmentEntities
10. Store idempotency record
11. Capture all domain events
12. Commit transaction
13. Write audit log (outside transaction)
14. Dispatch all captured events
15. Return result: { bundleEnrollmentId, enrolledCourses[], skippedCourses[] }
```

### 6.4 `ChangeBundleStatusUseCase`

Handles `DRAFT → PUBLISHED` and `DRAFT/PUBLISHED → ARCHIVED` transitions.

On transition to PUBLISHED:
- Calls `BundleEntity::ensureCanBePublished()` which enforces: minimum 2 courses, thumbnail, title
- Dispatch `BundleStatusChanged` and if PUBLISHED, also `BundleCreated` announcement to notification system

On transition to ARCHIVED:
- Does not check publish requirements
- Dispatch `BundleArchived`
- Does NOT revoke access for currently enrolled students — existing `BundleEnrollmentEntity` records remain ACTIVE

### 6.5 `CalculateBundlePriceUseCase` — Lives in Pricing Context

**File:** `app/Application/TenantAdminDashboard/Pricing/UseCases/CalculateBundlePriceUseCase.php`

This use case lives in the Pricing bounded context (established in Phase 17C), not in Bundle. Same pattern as `CalculatePriceUseCase` for courses:

Inputs: `tenantId`, `bundleId`, `userId?`, `ticketCode?`

Outputs: `{ base_price, final_price, total_discount, discounts[] }`

Processing:
1. Load bundle base price from `BundleRepositoryInterface`
2. Resolve user group IDs (if userId provided)
3. Apply active special offers for bundle (if any)
4. Apply ticket code (if provided)
5. Return normalized result

`BundleRepositoryInterface` is imported from the Bundle domain — this is a legitimate cross-context read (Pricing reads from Bundle base price). The Bundle domain does not import from Pricing.

### 6.6 `CheckCourseAccessUseCase` — Bundle Path Addition

**File to modify:** `app/Application/TenantAdminDashboard/Course/UseCases/CheckCourseAccessUseCase.php`

Updated access chain (per AD-17D-004):
```
1. Direct enrollment check (CourseEnrollmentRepositoryInterface)
2. Bundle enrollment check (BundleEnrollmentAccessInterface) ← NEW, real implementation
3. Batch access check (BatchEnrollmentAccessInterface) ← unchanged stub
4. Subscription access check ← unchanged
5. Deny
```

Inject `BundleEnrollmentAccessInterface`. Replace the `NullBundleEnrollmentAccess` that does not yet exist — this is a new injection, not a stub replacement. The `EloquentBundleEnrollmentAccess` is wired directly.

---

## 7. Infrastructure Layer

### 7.1 Database Schema

#### Table: `bundles`

**Migration file:** `database/migrations/tenant/2026_03_XX_000001_create_bundles_table.php`

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | BIGINT UNSIGNED PK | No | |
| `tenant_id` | BIGINT UNSIGNED FK | No | `tenants` table |
| `created_by` | BIGINT UNSIGNED FK | Yes | `users` table |
| `title` | VARCHAR(255) | No | |
| `slug` | VARCHAR(255) | No | |
| `description` | TEXT | Yes | |
| `status` | VARCHAR(50) | No | Default 'draft' |
| `thumbnail_path` | VARCHAR(500) | Yes | |
| `price_amount_cents` | BIGINT UNSIGNED | No | Default 0. `_cents` suffix mandatory. |
| `is_private` | BOOLEAN | No | Default false |
| `idempotency_key` | VARCHAR(255) | Yes | Unique per tenant |
| `created_at` | TIMESTAMP | Yes | |
| `updated_at` | TIMESTAMP | Yes | |
| `deleted_at` | TIMESTAMP | Yes | Soft deletes |

**Indexes:**
- `idx_bundles_tenant` (`tenant_id`)
- `UNIQUE idx_bundles_tenant_slug` (`tenant_id`, `slug`)
- `idx_bundles_tenant_status` (`tenant_id`, `status`)
- `UNIQUE idx_bundles_idempotency` (`tenant_id`, `idempotency_key`)

#### Table: `bundle_courses`

**Migration file:** `database/migrations/tenant/2026_03_XX_000002_create_bundle_courses_table.php`

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | BIGINT UNSIGNED PK | No | |
| `tenant_id` | BIGINT UNSIGNED FK | No | |
| `bundle_id` | BIGINT UNSIGNED FK | No | `bundles` table |
| `course_id` | BIGINT UNSIGNED FK | No | `courses` table |
| `sort_order` | UNSIGNED TINYINT | No | Default 0 |
| `created_at` | TIMESTAMP | Yes | |

**Indexes:**
- `UNIQUE idx_bundle_courses_unique` (`bundle_id`, `course_id`) — prevents duplicate course in same bundle
- `idx_bundle_courses_tenant` (`tenant_id`)

#### Table: `bundle_enrollments`

**Migration file:** `database/migrations/tenant/2026_03_XX_000003_create_bundle_enrollments_table.php`

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | BIGINT UNSIGNED PK | No | |
| `tenant_id` | BIGINT UNSIGNED FK | No | |
| `user_id` | BIGINT UNSIGNED FK | No | |
| `bundle_id` | BIGINT UNSIGNED FK | No | |
| `source` | VARCHAR(50) | No | EnrollmentSource value |
| `status` | VARCHAR(50) | No | EnrollmentStatus value |
| `locked_price_cents` | BIGINT UNSIGNED | No | Price at enrollment time — immutable |
| `expires_at` | TIMESTAMP | Yes | Null = lifetime |
| `idempotency_key` | VARCHAR(255) | No | |
| `created_at` | TIMESTAMP | Yes | |
| `updated_at` | TIMESTAMP | Yes | |

**Indexes:**
- `idx_bundle_enrollments_tenant` (`tenant_id`)
- `UNIQUE idx_bundle_enrollments_user_bundle` (`tenant_id`, `user_id`, `bundle_id`) — one active enrollment per user per bundle
- `UNIQUE idx_bundle_enrollments_idempotency` (`tenant_id`, `idempotency_key`)

### 7.2 Eloquent Models

| Model | Table | Traits |
|---|---|---|
| `BundleRecord` | `bundles` | `BelongsToTenant`, `SoftDeletes` |
| `BundleCourseRecord` | `bundle_courses` | `BelongsToTenant` |
| `BundleEnrollmentRecord` | `bundle_enrollments` | `BelongsToTenant` |

### 7.3 Repositories

| Interface | Implementation |
|---|---|
| `BundleRepositoryInterface` | `EloquentBundleRepository` |
| `BundleCourseRepositoryInterface` | `EloquentBundleCourseRepository` |
| `BundleEnrollmentRepositoryInterface` (in Enrollment domain) | `EloquentBundleEnrollmentRepository` |
| `BundleEnrollmentAccessInterface` (in Enrollment domain) | `EloquentBundleEnrollmentAccess` |

### 7.4 `EloquentBundleEnrollmentAccess` — Query Pattern

This is the real implementation of `BundleEnrollmentAccessInterface`. It must be efficient:

```sql
SELECT 1
FROM bundle_enrollments be
INNER JOIN bundle_courses bc ON bc.bundle_id = be.bundle_id
WHERE be.tenant_id = ?
  AND be.user_id = ?
  AND bc.course_id = ?
  AND be.status = 'active'
  AND (be.expires_at IS NULL OR be.expires_at > NOW())
LIMIT 1
```

This query must be covered by an index. The composite index on `bundle_enrollments (tenant_id, user_id, bundle_id)` combined with `bundle_courses (bundle_id, course_id)` will satisfy this efficiently.

---

## 8. HTTP Layer

### 8.1 Capability Codes

Three new capability codes must be added to the platform's capability seeder:

| Code | Group | Description |
|---|---|---|
| `bundle.view` | bundle | View bundle list and details |
| `bundle.create` | bundle | Create new bundles |
| `bundle.edit` | bundle | Edit, publish, archive bundles and manage courses |

### 8.2 API Endpoints

All routes grouped under `tenant.auth`, `tenant.active`, `tenant.user_active` middleware. Capability middleware applied per route.

| Method | URI | Use Case | Capability |
|---|---|---|---|
| `GET` | `/api/tenant/bundles` | `ListBundlesQuery` | `bundle.view` |
| `GET` | `/api/tenant/bundles/{id}` | `GetBundleQuery` | `bundle.view` |
| `POST` | `/api/tenant/bundles` | `CreateBundleUseCase` | `bundle.create` |
| `PUT` | `/api/tenant/bundles/{id}` | `UpdateBundleUseCase` | `bundle.edit` |
| `POST` | `/api/tenant/bundles/{id}/status` | `ChangeBundleStatusUseCase` | `bundle.edit` |
| `POST` | `/api/tenant/bundles/{id}/courses` | `AddCourseToBundleUseCase` | `bundle.edit` |
| `DELETE` | `/api/tenant/bundles/{id}/courses/{courseId}` | `RemoveCourseFromBundleUseCase` | `bundle.edit` |
| `POST` | `/api/tenant/bundles/{id}/enroll` | `EnrollStudentInBundleUseCase` | `bundle.edit` |

### 8.3 Controllers

| Controller | Methods |
|---|---|
| `BundleReadController` | `index`, `show` |
| `BundleWriteController` | `store`, `update`, `changeStatus` |
| `BundleCourseController` | `store`, `destroy` |
| `BundleEnrollmentController` | `store` |

All controllers must be thin — maximum 15 lines per method, delegate entirely to use cases via commands.

---

## 9. Business Rules (Non-Negotiable)

| ID | Rule | Enforcement |
|---|---|---|
| BR-01 | Bundle price stored as `price_amount_cents` BIGINT — no DECIMAL | Migration schema + PHPStan |
| BR-02 | `locked_price_cents` on `bundle_enrollments` is set at enrollment time and is immutable | No update method on `BundleEnrollmentEntity` for price field |
| BR-03 | A bundle cannot be published with fewer than 2 courses | `ensureCanBePublished()` in `BundleEntity` |
| BR-04 | Archiving a published bundle does NOT revoke access for enrolled students | `ChangeBundleStatusUseCase` must not cancel enrollments |
| BR-05 | All mutations (create, update, status change, course add/remove, enrollment) must produce audit log entries | Written outside DB transaction |
| BR-06 | Domain events dispatched via `DB::afterCommit` — never inside transaction | All use cases follow Phase 17A corrected pattern |
| BR-07 | `EnrollStudentInBundleUseCase` must be idempotent — double-enrollment on retry returns existing record | Idempotency key required on all enrollment requests |
| BR-08 | If a course in the bundle is at capacity, skip that course enrollment, do not fail the whole bundle enrollment | Partial enrollment is valid — result payload reports skipped courses |
| BR-09 | `bundle.view` capability is required to list/get bundles via API | `EnforceTenantCapability` middleware |
| BR-10 | Tenant isolation — all queries must be scoped by `tenant_id` | `BelongsToTenant` trait on all Eloquent models |
| BR-11 | Bundle slug must be unique per tenant | UNIQUE index + `DuplicateBundleSlugException` at UseCase level |

---

## 10. Security Checklist

| # | Check | Enforcement |
|---|---|---|
| 1 | All bundle queries scoped by `tenant_id` | `BelongsToTenant` trait |
| 2 | Students cannot access bundle endpoints with only `bundle.view` — enrollment requires `bundle.edit` | Capability middleware per route |
| 3 | Audit log for every mutation | Written outside transaction |
| 4 | No Razorpay API calls in this phase | Bundle enrollment in 17D is admin-manual only — payment-triggered enrollment is a future Payment extension |
| 5 | `locked_price_cents` never updated after creation | No price update method on `BundleEnrollmentEntity` |
| 6 | Slug enumeration prevention | 404 response (not 403) for bundles not belonging to tenant |

---

## 11. Test Plan

### 11.1 Domain Unit Tests

**File:** `tests/Unit/Domain/TenantAdminDashboard/Bundle/Entities/BundleEntityTest.php`

| Test | Description |
|---|---|
| `test_create_records_bundle_created_event` | Event fires on create |
| `test_publish_gate_fails_with_fewer_than_two_courses` | BR-03 |
| `test_publish_gate_fails_without_thumbnail` | Publish requirement |
| `test_draft_can_transition_to_published` | Valid transition |
| `test_draft_can_transition_to_archived` | Valid transition |
| `test_published_can_transition_to_archived` | Valid transition |
| `test_published_cannot_transition_to_draft` | Invalid transition throws |
| `test_archived_is_terminal` | No transitions out of ARCHIVED |

**File:** `tests/Unit/Domain/TenantAdminDashboard/Enrollment/ValueObjects/EnrollmentSourceTest.php`

Add: `test_bundle_source_exists`

### 11.2 Application Unit Tests

**File:** `tests/Unit/Application/TenantAdminDashboard/Bundle/UseCases/CreateBundleUseCaseTest.php`

| Test | Description |
|---|---|
| `test_creates_bundle_in_draft_state` | Initial status |
| `test_audit_log_written_after_commit` | Not inside transaction |
| `test_idempotency_returns_existing_on_retry` | Idempotency key |
| `test_slug_uniqueness_enforced` | DuplicateBundleSlugException |

**File:** `tests/Unit/Application/TenantAdminDashboard/Bundle/UseCases/EnrollStudentInBundleUseCaseTest.php`

| Test | Description |
|---|---|
| `test_creates_bundle_enrollment` | Core happy path |
| `test_creates_course_enrollments_for_each_bundle_course` | Access grants |
| `test_locked_price_matches_bundle_price_at_enrollment_time` | Financial immutability |
| `test_skips_full_courses_without_failing_bundle_enrollment` | BR-08 |
| `test_idempotency_returns_existing_on_retry` | Double-enrollment prevention |
| `test_audit_log_written_after_commit` | Outside transaction |

### 11.3 Feature Tests

**File:** `tests/Feature/TenantAdminDashboard/Bundle/BundleIsolationTest.php`

| Test | Description |
|---|---|
| `test_tenant_a_cannot_see_tenant_b_bundles` | Tenant isolation |
| `test_bundle_slug_unique_per_tenant_not_globally` | Tenant-scoped uniqueness |

**File:** `tests/Feature/TenantAdminDashboard/Bundle/BundleCapabilityTest.php`

| Test | Description |
|---|---|
| `test_bundle_create_requires_bundle_create_capability` | RBAC enforcement |
| `test_bundle_view_requires_bundle_view_capability` | RBAC enforcement |

**File:** `tests/Feature/TenantAdminDashboard/Bundle/BundleAccessCheckTest.php`

| Test | Description |
|---|---|
| `test_student_with_bundle_enrollment_can_access_bundle_courses` | Access chain |
| `test_student_without_enrollment_cannot_access_bundle_courses` | Access denial |
| `test_expired_bundle_enrollment_denies_access` | Expiry enforcement |

---

## 12. Quality Gate

All items must pass before Phase 17D is certified complete:

| # | Check | How to Verify |
|---|---|---|
| 1 | `BundleEntity` exists in `Domain/.../Bundle/Entities/` | File check |
| 2 | `BundleStatus` has exactly DRAFT, PUBLISHED, ARCHIVED — no ACTIVE/INACTIVE/PENDING | Enum inspection |
| 3 | `bundle.price_amount_cents` column is BIGINT — no DECIMAL | Migration review |
| 4 | `bundle_enrollments.locked_price_cents` is BIGINT and set at enrollment time | Migration + UseCase review |
| 5 | Audit log writes are outside DB transactions in all Bundle use cases | Code review |
| 6 | `EnrollmentSource::BUNDLE` exists in Enrollment domain | Enum check |
| 7 | `BundleEnrollmentAccessInterface` is injected into `CheckCourseAccessUseCase` | Code review |
| 8 | `EloquentBundleEnrollmentAccess` is a real implementation — not a null stub | Code review |
| 9 | Archiving a bundle does not cancel existing enrollments | Feature test + code review |
| 10 | Partial bundle enrollment (skipped full courses) does not fail the use case | Unit test |
| 11 | `php artisan test --filter=Bundle` passes | Test output |
| 12 | `php artisan test` (full suite) passes | Test output |
| 13 | PHPStan level 5 passes on all new files | PHPStan output — zero errors |
| 14 | Zero risky tests in full output | Test output |
| 15 | Capability seeds include `bundle.view`, `bundle.create`, `bundle.edit` | DB seeder + migration |

---

## 13. What This Phase Completes — 17 Series Summary

After Phase 17D is certified, the 17 series correction work is complete. The combined PHPStan + full regression run deferred from 17A/17B/17C must be run across the entire codebase:

```powershell
docker exec -it ubotz_backend sh -c "cd /var/www && ./vendor/bin/phpstan analyse app/ --level=5 --memory-limit=2G 2>&1 | tail -20"
docker exec -it ubotz_backend sh -c "cd /var/www && php artisan test 2>&1 | tail -5"
```

Both must pass with zero errors and zero risky tests before the 17 series is signed off and Phase 18 planning begins.

---

## 14. File Manifest (New Files Only)

| File | Purpose |
|---|---|
| `app/Domain/TenantAdminDashboard/Bundle/Entities/BundleEntity.php` | Aggregate root |
| `app/Domain/TenantAdminDashboard/Bundle/Entities/BundleCourseEntity.php` | Course membership entity |
| `app/Domain/TenantAdminDashboard/Bundle/Events/BundleCreated.php` | Domain event |
| `app/Domain/TenantAdminDashboard/Bundle/Events/BundleUpdated.php` | Domain event |
| `app/Domain/TenantAdminDashboard/Bundle/Events/BundleStatusChanged.php` | Domain event |
| `app/Domain/TenantAdminDashboard/Bundle/Events/BundleArchived.php` | Domain event |
| `app/Domain/TenantAdminDashboard/Bundle/Exceptions/BundlePublishRequirementsNotMetException.php` | Domain exception |
| `app/Domain/TenantAdminDashboard/Bundle/Exceptions/InvalidBundleStatusTransitionException.php` | Domain exception |
| `app/Domain/TenantAdminDashboard/Bundle/Exceptions/BundleMinimumCoursesException.php` | Domain exception |
| `app/Domain/TenantAdminDashboard/Bundle/Exceptions/DuplicateBundleCourseException.php` | Domain exception |
| `app/Domain/TenantAdminDashboard/Bundle/Repositories/BundleRepositoryInterface.php` | Domain contract |
| `app/Domain/TenantAdminDashboard/Bundle/Repositories/BundleCourseRepositoryInterface.php` | Domain contract |
| `app/Domain/TenantAdminDashboard/Bundle/ValueObjects/BundleProps.php` | Value object |
| `app/Domain/TenantAdminDashboard/Bundle/ValueObjects/BundleStatus.php` | Value object |
| `app/Domain/TenantAdminDashboard/Bundle/ValueObjects/BundleSlug.php` | Value object |
| `app/Domain/TenantAdminDashboard/Enrollment/Entities/BundleEnrollmentEntity.php` | Enrollment aggregate |
| `app/Domain/TenantAdminDashboard/Enrollment/Events/StudentEnrolledInBundleEvent.php` | Domain event |
| `app/Domain/TenantAdminDashboard/Enrollment/Repositories/BundleEnrollmentRepositoryInterface.php` | Domain contract |
| `app/Domain/TenantAdminDashboard/Enrollment/Services/BundleEnrollmentAccessInterface.php` | Service interface |
| `app/Application/TenantAdminDashboard/Bundle/Commands/CreateBundleCommand.php` | DTO |
| `app/Application/TenantAdminDashboard/Bundle/Commands/UpdateBundleCommand.php` | DTO |
| `app/Application/TenantAdminDashboard/Bundle/Commands/ChangeBundleStatusCommand.php` | DTO |
| `app/Application/TenantAdminDashboard/Bundle/Commands/AddCourseToBundleCommand.php` | DTO |
| `app/Application/TenantAdminDashboard/Bundle/Commands/RemoveCourseFromBundleCommand.php` | DTO |
| `app/Application/TenantAdminDashboard/Bundle/Queries/GetBundleQuery.php` | Query |
| `app/Application/TenantAdminDashboard/Bundle/Queries/ListBundlesQuery.php` | Query |
| `app/Application/TenantAdminDashboard/Bundle/Queries/BundleListCriteria.php` | Query criteria |
| `app/Application/TenantAdminDashboard/Bundle/UseCases/CreateBundleUseCase.php` | Use case |
| `app/Application/TenantAdminDashboard/Bundle/UseCases/UpdateBundleUseCase.php` | Use case |
| `app/Application/TenantAdminDashboard/Bundle/UseCases/ChangeBundleStatusUseCase.php` | Use case |
| `app/Application/TenantAdminDashboard/Bundle/UseCases/AddCourseToBundleUseCase.php` | Use case |
| `app/Application/TenantAdminDashboard/Bundle/UseCases/RemoveCourseFromBundleUseCase.php` | Use case |
| `app/Application/TenantAdminDashboard/Bundle/UseCases/EnrollStudentInBundleUseCase.php` | Use case |
| `app/Application/TenantAdminDashboard/Pricing/UseCases/CalculateBundlePriceUseCase.php` | Pricing use case |
| `app/Infrastructure/Persistence/TenantAdminDashboard/Bundle/BundleRecord.php` | Eloquent model |
| `app/Infrastructure/Persistence/TenantAdminDashboard/Bundle/BundleCourseRecord.php` | Eloquent model |
| `app/Infrastructure/Persistence/TenantAdminDashboard/Bundle/EloquentBundleRepository.php` | Repository impl |
| `app/Infrastructure/Persistence/TenantAdminDashboard/Bundle/EloquentBundleCourseRepository.php` | Repository impl |
| `app/Infrastructure/Persistence/TenantAdminDashboard/Enrollment/BundleEnrollmentRecord.php` | Eloquent model |
| `app/Infrastructure/Persistence/TenantAdminDashboard/Enrollment/EloquentBundleEnrollmentRepository.php` | Repository impl |
| `app/Infrastructure/Persistence/TenantAdminDashboard/Enrollment/EloquentBundleEnrollmentAccess.php` | Access impl |
| `app/Http/Controllers/Api/TenantAdminDashboard/Bundle/BundleReadController.php` | HTTP controller |
| `app/Http/Controllers/Api/TenantAdminDashboard/Bundle/BundleWriteController.php` | HTTP controller |
| `app/Http/Controllers/Api/TenantAdminDashboard/Bundle/BundleCourseController.php` | HTTP controller |
| `app/Http/Controllers/Api/TenantAdminDashboard/Bundle/BundleEnrollmentController.php` | HTTP controller |
| `database/migrations/tenant/2026_03_XX_000001_create_bundles_table.php` | Migration |
| `database/migrations/tenant/2026_03_XX_000002_create_bundle_courses_table.php` | Migration |
| `database/migrations/tenant/2026_03_XX_000003_create_bundle_enrollments_table.php` | Migration |
| `tests/Unit/Domain/TenantAdminDashboard/Bundle/Entities/BundleEntityTest.php` | Unit test |
| `tests/Unit/Application/TenantAdminDashboard/Bundle/UseCases/CreateBundleUseCaseTest.php` | Unit test |
| `tests/Unit/Application/TenantAdminDashboard/Bundle/UseCases/EnrollStudentInBundleUseCaseTest.php` | Unit test |
| `tests/Feature/TenantAdminDashboard/Bundle/BundleIsolationTest.php` | Feature test |
| `tests/Feature/TenantAdminDashboard/Bundle/BundleCapabilityTest.php` | Feature test |
| `tests/Feature/TenantAdminDashboard/Bundle/BundleAccessCheckTest.php` | Feature test |

### Modified Files

| File | Change |
|---|---|
| `app/Domain/TenantAdminDashboard/Enrollment/ValueObjects/EnrollmentSource.php` | Add `BUNDLE` case |
| `app/Application/TenantAdminDashboard/Course/UseCases/CheckCourseAccessUseCase.php` | Add bundle access path |
| Service provider(s) | Add Bundle + BundleEnrollment repository bindings |
| Capability seeder | Add `bundle.view`, `bundle.create`, `bundle.edit` |

---

*End of Phase 17D Developer Instructions*
*Issued by Principal Engineer — 2026-03-20*
*Next step: Antigravity to produce Phase 17D Implementation Plan for Principal Engineer audit before implementation begins.*
*Note: PHPStan full-suite run is a hard gate at 17D completion before the 17 series is signed off.*
