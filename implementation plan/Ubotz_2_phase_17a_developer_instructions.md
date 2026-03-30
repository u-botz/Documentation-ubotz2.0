# UBOTZ 2.0 — Phase 17A Developer Instructions

## Course Domain Correction Series — Part 1: CourseStatus Cleanup

| Field | Value |
|---|---|
| **Document Type** | Developer Instruction (Pre-Implementation Brief) |
| **Phase** | 17A |
| **Series** | Course Domain Correction (17A → 17B → 17C → 17D) |
| **Date** | 2026-03-20 |
| **Issued By** | Principal Engineer / Architecture Auditor |
| **Audience** | Antigravity Implementation Team |
| **Expected Deliverable** | Phase 17A Implementation Plan |
| **Prerequisites** | Phase 14 COMPLETE, Phase 15A COMPLETE, Phase 16A COMPLETE |

> **This is a correction phase, not a feature phase. No new business functionality is delivered. The output is a cleaner, safer domain model that all subsequent Course-related development depends on. Phases 17B, 17C, and 17D cannot be safely executed until 17A is complete and deployed.**

---

## 1. Mission Statement

Phase 17A corrects three defects in the Course bounded context that were identified during the 2026-03-20 Principal Engineer audit:

1. **`CourseStatus` has undefined business states** (`PENDING`, `INACTIVE`) that no confirmed business workflow uses. Their presence introduces ambiguous transition paths and will mislead every developer who works on course-related features going forward.

2. **`CourseStatus.ACTIVE` is a legacy compatibility state** that was never formally deprecated. It is currently treated as equivalent to `PUBLISHED` in the publish gate but remains as a valid target state in new code. This creates a split canonical state with no migration path.

3. **`CreateCourseUseCase` writes the audit log inside a database transaction**, violating the platform's explicit financial and compliance safety rule. If the transaction rolls back, the audit log entry for a course creation that never completed will persist — a phantom audit record.

These are not cosmetic issues. They are correctness and compliance defects.

---

## 2. What This Phase Includes

- Formally define or remove `PENDING` and `INACTIVE` from `CourseStatus`
- Deprecate `CourseStatus::ACTIVE` with a migration to `PUBLISHED`
- Fix audit log placement in `CreateCourseUseCase` (move outside transaction)
- Update all transition guards, publish gates, and access checks to reflect the clean state set
- Write a data migration moving all `ACTIVE` course records to `PUBLISHED`
- Update all tests that reference the affected states

## 2.1 What This Phase Does NOT Include

- Any new course functionality
- Any changes to course content, curriculum, or enrollment
- Any frontend changes (status display labels are a Phase 17A follow-up task, not blocking)
- Any changes to other bounded contexts

---

## 3. Business Context

### 3.1 Confirmed Valid Course Status States

Based on the 2026-03-20 business requirements session, the following states are confirmed as valid business concepts:

| State | Business Meaning | Terminal? |
|---|---|---|
| `DRAFT` | Course is being built. Not visible to students. | No |
| `PUBLISHED` | Course is live and visible to students. | No |
| `ARCHIVED` | Course is permanently retired. No new enrollments. Existing access preserved. | Yes |

### 3.2 States Requiring a Decision

The following states exist in the current `CourseStatus` enum but have no confirmed business definition:

**`PENDING`**
No business workflow was identified that moves a course into a PENDING state. There is no approval workflow, no content review process, and no external gate described that would hold a course in a waiting state between DRAFT and PUBLISHED. If PENDING records exist in the database, they must be accounted for before removal.

**`INACTIVE`**
No business workflow was identified for taking a published course temporarily offline without archiving it. The transition `PUBLISHED → INACTIVE → PUBLISHED` implies a reversible suspension of a live course. If this capability is intentionally built but undocumented, it must be formally named and described. If it is an artefact of early development, it must be removed.

**`ACTIVE`**
Confirmed as a legacy compatibility alias for `PUBLISHED`. Contains no distinct business meaning. All records and logic must migrate to `PUBLISHED`.

### 3.3 Confirmed Valid Transitions

| From | To | Trigger |
|---|---|---|
| `DRAFT` | `PUBLISHED` | Admin explicitly publishes a course that meets publish requirements |
| `PUBLISHED` | `ARCHIVED` | Admin archives a live course |
| `DRAFT` | `ARCHIVED` | Admin discards a draft course permanently |

No other transitions are confirmed as valid business operations.

---

## 4. Architecture Decisions

### 4.1 PENDING — Remove

`PENDING` is removed from `CourseStatus`. It has no business definition, no API endpoint that sets it, and no listener that responds to it. Before removal, a database check must confirm zero `PENDING` records exist in production. If any exist, they must be migrated to `DRAFT` (most conservative assumption — a pending course was not yet published).

**Rationale for removal over retention:** Keeping undefined states in a status enum is more dangerous than removing them. Any developer seeing `PENDING` in the enum will assume it has meaning and may write code targeting it. The cost of re-adding a state later if a review workflow is designed is far lower than the cost of a developer silently misusing an undefined state.

### 4.2 INACTIVE — Remove

`INACTIVE` is removed from `CourseStatus` for the same reason. The transition `PUBLISHED → INACTIVE` implies a "take offline" capability that was never formally designed. If a tenant admin needs to hide a course from students without archiving it, this requires a formal business design session — it cannot be inferred from a status enum value. Before removal, a database check must confirm zero `INACTIVE` records exist in production. If any exist, they must be migrated based on the following rule: if the course has active enrollments, migrate to `PUBLISHED`; otherwise migrate to `ARCHIVED`.

### 4.3 ACTIVE — Deprecate and Migrate

`ACTIVE` is kept in the enum temporarily but marked as deprecated. A data migration moves all `status = 'active'` records to `status = 'published'`. After the migration is verified in production, `ACTIVE` is removed from the enum in a follow-up PR. The two-step approach prevents a breaking change if any external consumer (frontend, cached response, Razorpay webhook payload) references the string `'active'`.

**Deprecation marker required in enum:**
```php
/** @deprecated Use PUBLISHED. Migration: 2026-03-XX. Remove after verified migration. */
case ACTIVE = 'active';
```

### 4.4 Transition Map — Clean Version

The new authoritative transition map after this phase:

```
DRAFT     → PUBLISHED  (requires ensureCanBePublished())
DRAFT     → ARCHIVED   (no publish requirements check)
PUBLISHED → ARCHIVED   (no requirements check)
ACTIVE    → PUBLISHED  (migration path only — not a user-triggered transition)
ACTIVE    → ARCHIVED   (legacy compatibility only)
```

`ACTIVE → PUBLISHED` is a migration-only transition, not a user-triggered business operation. It must be callable only from the migration use case, not from any API endpoint.

### 4.5 Audit Log — Move Outside Transaction

Platform rule (established Phase 6, enforced platform-wide):

> Audit logs must be written OUTSIDE database transactions to prevent phantom records on rollback.

The current `CreateCourseUseCase` sequence:
```
1. Begin DB transaction
...
8. Write audit log ← VIOLATION
...
11. Commit transaction
12. Dispatch events after commit
```

Corrected sequence:
```
1. Begin DB transaction
...
[audit log removed from here]
...
10. Commit transaction
11. Write audit log  ← CORRECT POSITION
12. Dispatch events after commit
```

The audit log write moves to step 11, after commit and before event dispatch. If the commit fails, no audit log is written — which is correct. A course that was never created must not appear in audit logs.

---

## 5. Domain Layer Changes

### 5.1 `CourseStatus` Value Object

**File:** `app/Domain/TenantAdminDashboard/Course/ValueObjects/CourseStatus.php`

**Changes required:**

Remove `PENDING` and `INACTIVE` cases after database migration confirms zero records.

Mark `ACTIVE` as deprecated with a `@deprecated` docblock.

Update `canTransitionTo()` to reflect the clean transition map:

```php
public function canTransitionTo(self $newStatus): bool
{
    return match($this) {
        self::DRAFT     => in_array($newStatus, [self::PUBLISHED, self::ARCHIVED], true),
        self::PUBLISHED => in_array($newStatus, [self::ARCHIVED], true),
        self::ACTIVE    => in_array($newStatus, [self::PUBLISHED, self::ARCHIVED], true), // legacy only
        self::ARCHIVED  => false,
    };
}
```

Add a static helper for publish gate equivalence that is explicit about legacy handling:

```php
public function isPubliclyVisible(): bool
{
    return $this === self::PUBLISHED || $this === self::ACTIVE;
}
```

This makes the legacy equivalence explicit and searchable. Any code checking "is this course live?" must call `isPubliclyVisible()` — not compare against both enum values manually.

Add a static helper for the migration transition (callable only by the migration service):

```php
/**
 * Used exclusively by CourseStatusMigrationService.
 * Not a valid user-triggered transition.
 */
public static function migrationTargetFor(self $legacyStatus): self
{
    return match($legacyStatus) {
        self::ACTIVE   => self::PUBLISHED,
        self::INACTIVE => self::ARCHIVED,  // if INACTIVE records exist
        self::PENDING  => self::DRAFT,     // if PENDING records exist
        default        => throw new \LogicException("Not a migration source: {$legacyStatus->value}"),
    };
}
```

### 5.2 `CourseEntity` — Publish Gate

**File:** `app/Domain/TenantAdminDashboard/Course/Entities/CourseEntity.php`

The `changeStatus()` method currently triggers `ensureCanBePublished()` for both `ACTIVE` and `PUBLISHED`. This must remain correct after cleanup. No logic change needed here — the `canTransitionTo()` update handles the transition guard. Confirm that `ensureCanBePublished()` is called when the target state `isPubliclyVisible()` returns true.

```php
public function changeStatus(CourseStatus $newStatus): void
{
    if (!$this->props->status->canTransitionTo($newStatus)) {
        throw new InvalidCourseStatusTransitionException(
            from: $this->props->status,
            to: $newStatus,
        );
    }

    if ($newStatus->isPubliclyVisible()) {
        $this->ensureCanBePublished();
    }

    // update status, record CourseStatusChanged event
}
```

---

## 6. Application Layer Changes

### 6.1 `CreateCourseUseCase` — Audit Log Fix

**File:** `app/Application/TenantAdminDashboard/Course/UseCases/CreateCourseUseCase.php`

**Current (incorrect) sequence:**
```php
DB::transaction(function () use ($command) {
    // ... entity creation, persist ...
    $this->auditLogger->log('course.created', ...); // ← INSIDE TRANSACTION
    // ... idempotency record ...
});
// dispatch events
```

**Required (correct) sequence:**
```php
$result = DB::transaction(function () use ($command) {
    // ... entity creation, persist ...
    // ... idempotency record ...
    return $courseId; // return what audit log needs
});

// After commit:
$this->auditLogger->log('course.created', [
    'course_id'  => $result,
    'tenant_id'  => $command->tenantId,
    'actor_id'   => $command->createdBy,
    'created_at' => now(),
]);

// Then dispatch events:
foreach ($capturedEvents as $event) {
    event($event);
}
```

The audit logger call must receive all necessary context as parameters passed out of the transaction closure. Do not use closures that capture mutable state to work around this — pass explicit return values.

### 6.2 New: `CourseStatusMigrationService`

**File:** `app/Application/TenantAdminDashboard/Course/Services/CourseStatusMigrationService.php`

This service is responsible for the one-time data migration of legacy status values. It must not be callable from any HTTP endpoint — it is invoked only from the migration command and the database migration.

```php
final class CourseStatusMigrationService
{
    public function __construct(
        private readonly CourseRepositoryInterface $courseRepository,
        private readonly AuditLoggerInterface $auditLogger,
    ) {}

    public function migrateLegacyStatuses(): MigrationResult
    {
        // 1. Find all ACTIVE records → migrate to PUBLISHED
        // 2. Find all INACTIVE records (if any) → apply migration rule
        // 3. Find all PENDING records (if any) → apply migration rule
        // 4. Write audit log entries for each migrated record
        // 5. Return result summary (counts per status)
    }
}
```

Each migrated record must produce an audit log entry:
```
course.status_migrated | course_id: X | from: active | to: published | reason: legacy_cleanup_17A
```

---

## 7. Infrastructure Layer Changes

### 7.1 Database Migration

**File:** `database/migrations/2026_03_XX_000001_migrate_course_legacy_statuses.php`

This migration runs the `CourseStatusMigrationService` logic at the database level as a safety net. It must:

1. Count and log `ACTIVE`, `INACTIVE`, and `PENDING` records before migrating.
2. Update `status = 'active'` → `status = 'published'`.
3. Update `status = 'inactive'` → based on enrollment presence (see §4.2).
4. Update `status = 'pending'` → `status = 'draft'`.
5. Be idempotent — running it twice must produce no additional changes.
6. Be wrapped in a transaction.

```php
public function up(): void
{
    // Pre-migration count check
    $counts = DB::table('courses')
        ->whereIn('status', ['active', 'inactive', 'pending'])
        ->selectRaw('status, count(*) as total')
        ->groupBy('status')
        ->get();

    Log::info('Phase 17A: Pre-migration status counts', $counts->toArray());

    DB::transaction(function () {
        // ACTIVE → PUBLISHED
        DB::table('courses')
            ->where('status', 'active')
            ->update(['status' => 'published', 'updated_at' => now()]);

        // PENDING → DRAFT
        DB::table('courses')
            ->where('status', 'pending')
            ->update(['status' => 'draft', 'updated_at' => now()]);

        // INACTIVE with active enrollments → PUBLISHED
        $inactiveWithEnrollments = DB::table('courses')
            ->where('courses.status', 'inactive')
            ->whereExists(function ($query) {
                $query->select(DB::raw(1))
                    ->from('course_enrollments')
                    ->whereColumn('course_enrollments.course_id', 'courses.id')
                    ->where('course_enrollments.status', 'active');
            })
            ->pluck('courses.id');

        if ($inactiveWithEnrollments->isNotEmpty()) {
            DB::table('courses')
                ->whereIn('id', $inactiveWithEnrollments)
                ->update(['status' => 'published', 'updated_at' => now()]);
        }

        // INACTIVE without active enrollments → ARCHIVED
        DB::table('courses')
            ->where('status', 'inactive')
            ->update(['status' => 'archived', 'updated_at' => now()]);
    });

    Log::info('Phase 17A: Migration complete.');
}

public function down(): void
{
    // Intentionally not reversible.
    // ACTIVE, INACTIVE, PENDING records cannot be reliably restored
    // without the original timestamps and business context.
    throw new \RuntimeException(
        'Phase 17A migration is not reversible. Restore from backup if rollback is required.'
    );
}
```

---

## 8. Test Plan

### 8.1 Unit Tests — `CourseStatus` Value Object

**File:** `tests/Unit/Domain/TenantAdminDashboard/Course/ValueObjects/CourseStatusTest.php`

| Test | Description |
|---|---|
| `test_draft_can_transition_to_published` | Valid transition |
| `test_draft_can_transition_to_archived` | Valid transition |
| `test_published_can_transition_to_archived` | Valid transition |
| `test_published_cannot_transition_to_draft` | Invalid — must throw |
| `test_archived_cannot_transition_to_any_state` | Terminal state — all transitions must throw |
| `test_active_is_publicly_visible` | Legacy compatibility |
| `test_published_is_publicly_visible` | Canonical state |
| `test_draft_is_not_publicly_visible` | Not live |
| `test_archived_is_not_publicly_visible` | Retired |
| `test_pending_does_not_exist` | Enum must not contain PENDING case |
| `test_inactive_does_not_exist` | Enum must not contain INACTIVE case |
| `test_migration_target_for_active_returns_published` | Migration helper |
| `test_migration_target_for_invalid_status_throws` | Guard on migration helper |

### 8.2 Unit Tests — `CourseEntity` Status Gate

**File:** `tests/Unit/Domain/TenantAdminDashboard/Course/Entities/CourseEntityStatusTest.php`

| Test | Description |
|---|---|
| `test_change_status_to_published_triggers_publish_gate` | `ensureCanBePublished()` is called |
| `test_change_status_to_archived_skips_publish_gate` | Archive does not require publish readiness |
| `test_invalid_transition_throws_exception` | `InvalidCourseStatusTransitionException` |
| `test_publish_gate_fails_without_teacher` | Missing teacher blocks publish |
| `test_publish_gate_fails_without_thumbnail` | Missing thumbnail blocks publish |
| `test_publish_gate_fails_without_category` | Missing category blocks publish |
| `test_publish_gate_fails_with_short_description` | Less than 20 words blocks publish |

### 8.3 Feature Tests — `CreateCourseUseCase` Audit Log

**File:** `tests/Feature/TenantAdminDashboard/Course/CreateCourseAuditLogTest.php`

| Test | Description |
|---|---|
| `test_audit_log_written_after_transaction_commit` | Audit log record exists after successful creation |
| `test_audit_log_not_written_when_transaction_rolls_back` | Simulate transaction failure — no phantom audit record |
| `test_audit_log_contains_correct_course_id_and_actor` | Payload correctness |

### 8.4 Feature Tests — Database Migration

**File:** `tests/Feature/TenantAdminDashboard/Course/CourseStatusMigrationTest.php`

| Test | Description |
|---|---|
| `test_active_courses_migrated_to_published` | All `status = 'active'` become `'published'` |
| `test_pending_courses_migrated_to_draft` | All `status = 'pending'` become `'draft'` |
| `test_inactive_courses_with_enrollments_migrated_to_published` | Active enrollments preserve access |
| `test_inactive_courses_without_enrollments_migrated_to_archived` | No enrollments → archived |
| `test_migration_is_idempotent` | Running twice produces no change |
| `test_migration_logs_pre_migration_counts` | Log output contains counts |

### 8.5 Regression Tests

All existing course tests must pass without modification after this phase. No existing test should need to be updated to accommodate the status cleanup — if any test relies on `PENDING` or `INACTIVE` states, that test was testing undefined behaviour and must be corrected.

---

## 9. Quality Gate

The following checks must all pass before Phase 17A is marked complete:

| # | Check | How to Verify |
|---|---|---|
| 1 | `CourseStatus` enum contains exactly: DRAFT, PUBLISHED, ACTIVE (deprecated), ARCHIVED | Grep enum file |
| 2 | `canTransitionTo()` only allows confirmed valid transitions | Unit test coverage |
| 3 | `ACTIVE` case has `@deprecated` docblock | Code review |
| 4 | Zero `ACTIVE` records in production `courses` table after migration | SQL count check |
| 5 | Zero `INACTIVE` records in production `courses` table after migration | SQL count check |
| 6 | Zero `PENDING` records in production `courses` table after migration | SQL count check |
| 7 | Audit log write is outside `DB::transaction()` in `CreateCourseUseCase` | Code review |
| 8 | No phantom audit records on simulated transaction rollback | Feature test |
| 9 | All existing course tests pass | `php artisan test --filter=Course` |
| 10 | New test files added: 4 files, minimum counts met | Test file review |
| 11 | PHPStan level 5 passes | `./vendor/bin/phpstan analyse` |
| 12 | No direct enum value comparisons to `'active'` string outside migration | Grep codebase |

---

## 10. File Manifest

### Modified Files

| File | Change |
|---|---|
| `app/Domain/TenantAdminDashboard/Course/ValueObjects/CourseStatus.php` | Remove PENDING/INACTIVE, deprecate ACTIVE, update transition map, add `isPubliclyVisible()`, add `migrationTargetFor()` |
| `app/Domain/TenantAdminDashboard/Course/Entities/CourseEntity.php` | Update `changeStatus()` to use `isPubliclyVisible()` |
| `app/Application/TenantAdminDashboard/Course/UseCases/CreateCourseUseCase.php` | Move audit log write outside transaction |

### New Files

| File | Purpose |
|---|---|
| `app/Application/TenantAdminDashboard/Course/Services/CourseStatusMigrationService.php` | One-time migration orchestration service |
| `database/migrations/2026_03_XX_000001_migrate_course_legacy_statuses.php` | Data migration |
| `tests/Unit/Domain/TenantAdminDashboard/Course/ValueObjects/CourseStatusTest.php` | Status VO unit tests |
| `tests/Unit/Domain/TenantAdminDashboard/Course/Entities/CourseEntityStatusTest.php` | Entity status gate unit tests |
| `tests/Feature/TenantAdminDashboard/Course/CreateCourseAuditLogTest.php` | Audit log placement feature tests |
| `tests/Feature/TenantAdminDashboard/Course/CourseStatusMigrationTest.php` | Migration correctness feature tests |

### Files Explicitly NOT Modified

| File | Reason |
|---|---|
| Any controller file | No HTTP behavior changes in this phase |
| Any frontend file | Status display label updates are a follow-up task |
| Any route file | No new endpoints |
| `CourseEnrollmentEntity.php` | Addressed in Phase 17B |
| `DiscountEntity.php` | Addressed in Phase 17C |
| `CalculateCoursePriceUseCase.php` | Addressed in Phase 17C |

---

## 11. Sequence for the 17 Series

For full context, here is the planned correction series this phase opens:

| Phase | Focus | Blocked Until |
|---|---|---|
| **17A** | CourseStatus cleanup + audit log fix | Nothing — starts now |
| **17B** | Extract `CourseEnrollmentEntity` to Enrollment bounded context + fix `StudentEnrolledEvent` | 17A complete |
| **17C** | Move `DiscountEntity` + `CalculateCoursePriceUseCase` to Pricing bounded context | 17A complete |
| **17D** | Bundle bounded context design and implementation | 17C complete |

17B and 17C can run in parallel after 17A is deployed. They do not depend on each other.

---

*End of Phase 17A Developer Instructions*
*Issued by Principal Engineer — 2026-03-20*
*Next step: Antigravity to produce Phase 17A Implementation Plan for audit before implementation begins.*
