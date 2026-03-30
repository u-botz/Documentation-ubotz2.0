# UBOTZ 2.0 — Phase 11B-R + 11D Developer Instructions

## 11B Remediation + Category-Aware Active Student Quota System

| Field | Value |
|---|---|
| **Document Type** | Developer Instruction (Pre-Implementation Brief) |
| **Phase** | 11B-R (Remediation) + 11D (Active Student Quota) |
| **Date** | March 30, 2026 |
| **Issued By** | Principal Engineer / Architecture Auditor |
| **Audience** | Antigravity Implementation Team |
| **Expected Deliverable** | Implementation Plan for review and approval BEFORE any code is written |
| **Prerequisites** | Phase 11A COMPLETE · Phase 11B PARTIAL (65%) · Phase 11C COMPLETE |

> **This document defines WHAT to build, the business rules, constraints, and quality gates. Antigravity must produce a detailed Implementation Plan for Principal Engineer audit before writing any code.**

---

## 1. Mission Statement

This phase has two mandatory parts that must be delivered together as a single Implementation Plan.

**Part A — Phase 11B Remediation (11B-R):** Close the 35% gap left in Phase 11B. Four confirmed defects: empty scheduled commands, business logic in Controller, incomplete API resource, and a missing authorization gate. These are not enhancements — they are incomplete deliverables from Phase 11B. All four must be fixed.

**Part B — Phase 11D: Category-Aware Active Student Quota:** Introduce a Monthly Active Student (MAS) quota system for `edtech` and `standalone_teacher` tenant categories. `offline_institution` tenants retain the existing `max_users` behavior unchanged. This phase extends the quota infrastructure built in 11B without replacing it.

Both parts are scoped into one Implementation Plan because they touch the same files and must ship together to avoid a third partial state.

---

## 2. Part A — Phase 11B Remediation

### 2.1 Defect Inventory (Non-Negotiable Fix List)

The following four defects were confirmed by code audit on March 30, 2026. Each must be resolved completely.

---

#### DEFECT-01 — Scheduled Commands Are Empty Shells

**Confirmed:** `EnforceOverageDeactivationCommand` and `CheckOverageResolutionCommand` exist as files but contain incorrect signatures and zero implementation. They are not registered in the scheduler.

**Required Fix:**

`EnforceOverageDeactivationCommand` must:
- Accept an optional `--dry-run` flag
- Resolve `EnforceOverageDeactivationUseCase` from the container
- Pass `dry_run: bool` to the UseCase
- Log output for each tenant processed (tenant ID, resources deactivated, dry-run status)
- Be registered in `Console/Kernel.php` (or `routes/console.php` in Laravel 11) to run **daily at 02:00 UTC**

`CheckOverageResolutionCommand` must:
- Accept no flags
- Resolve `CheckOverageResolutionUseCase` from the container
- Be registered to run **every 6 hours**

Both commands must be thin — under 30 lines each. All logic lives in their respective UseCases.

---

#### DEFECT-02 — Business Logic Inside PlatformSettingsController

**Confirmed:** `UpdatePlatformSettingsUseCase` does not exist. The Controller is performing UseCase responsibilities directly.

**Required Fix:**

Create `App\Application\SuperAdminDashboard\Subscription\UseCases\UpdatePlatformSettingsUseCase` with:
- Input: typed DTO `UpdatePlatformSettingsInput` (key-value pairs, validated)
- Responsibility: validate allowed keys, write via `PlatformSettingsService`, write audit log entry
- Output: void (throw on failure)

Create `App\Application\SuperAdminDashboard\Subscription\UseCases\EnforceOverageDeactivationUseCase` with:
- Input: `dry_run: bool`
- Responsibility: query all `tenant_overage_records` past grace period with status `pending`, soft-deactivate excess resources in the configured order (LIFO/LRU per platform settings), write audit log per deactivation, dispatch `OverageResourcesDeactivated` domain event **outside the transaction** via `DB::afterCommit()`
- Output: `EnforceOverageDeactivationResult` (count of tenants processed, count of resources deactivated, dry_run flag)

Create `App\Application\SuperAdminDashboard\Subscription\UseCases\CheckOverageResolutionUseCase` with:
- Responsibility: query `tenant_overage_records` with status `pending`, check if current usage is now within limits (tenant may have manually removed users/courses), resolve records where usage is compliant, dispatch `OverageResolved` domain event outside transaction

`PlatformSettingsController` must be reduced to: validate request → call UseCase → return response. No business logic.

---

#### DEFECT-03 — TenantUsageResource Is Incomplete

**Confirmed:** Missing `plan`, `percentage`, and `is_unlimited` fields.

**Required Fix:**

`TenantUsageResource` must return this shape for every quota dimension:

```json
{
  "plan": {
    "name": "Starter",
    "code": "starter_offline_in"
  },
  "quota": {
    "users": {
      "used": 42,
      "limit": 50,
      "percentage": 84,
      "is_unlimited": false
    },
    "courses": {
      "used": 8,
      "limit": 10,
      "percentage": 80,
      "is_unlimited": false
    },
    "storage_mb": {
      "used": 450,
      "limit": 10240,
      "percentage": 4,
      "is_unlimited": false
    },
    "sessions": {
      "used": 3,
      "limit": 25,
      "percentage": 12,
      "is_unlimited": false
    }
  },
  "overages": []
}
```

`percentage` is computed in the Resource (not the Service): `round(($used / $limit) * 100)`. When `is_unlimited` is true, `percentage` is `null` and `limit` is `null`.

---

#### DEFECT-04 — Missing Authorization on TenantUsageController

**Confirmed:** `TenantUsageController::show()` has a TODO comment and no `Gate::authorize()` call. Any authenticated Super Admin can read any tenant's usage data.

**Required Fix:**

Add `Gate::authorize('tenant.view', $tenant)` before the UseCase call. The existing `tenant.view` permission must be verified to exist in the permissions seeder. If it does not exist, add it. Do not proceed without this gate in place.

---

### 2.2 11B-R Quality Gates

All four defects must pass these gates before the Implementation Plan is approved:

- [ ] `EnforceOverageDeactivationCommand --dry-run` runs without side effects and logs correctly
- [ ] Both commands are registered and appear in `php artisan schedule:list`
- [ ] `UpdatePlatformSettingsUseCase` exists; Controller has zero business logic
- [ ] `EnforceOverageDeactivationUseCase` exists and is called by the command
- [ ] Domain events dispatched via `DB::afterCommit()` — never inside transactions
- [ ] `TenantUsageResource` returns `plan`, `percentage`, `is_unlimited` on every response
- [ ] `TenantUsageController::show()` has `Gate::authorize()` — no exceptions
- [ ] PHPStan Level 5: zero new errors

---

## 3. Part B — Phase 11D: Category-Aware Active Student Quota

### 3.1 Locked Business Decisions

The following decisions were made by the Principal / Product Owner on March 30, 2026. They are locked. Do not re-open them in the Implementation Plan.

| Decision | Locked Value |
|---|---|
| Active student definition | Any content interaction (login OR video view OR quiz attempt OR assignment submission) within the current **calendar month** |
| Enforcement point | Student **login is blocked** when MAS limit is reached. Existing active students for that month are never blocked. Only new activations are blocked. |
| Plan catalog strategy | **Separate plan tracks per category.** Offline plans carry `max_users`. EdTech/Teacher plans carry `max_monthly_active_students`. The irrelevant field is set to `0` (unlimited) on each plan type. |
| Mid-month overage behavior | **Soft warning to tenant admin for 48 hours, then hard block on new student activations.** Existing active students for that month are never affected. |
| MAS reset timing | **1st of every calendar month, fixed.** Not rolling. Not billing-date-aligned. |
| Staff/admin quota for edtech | **Separate `max_users` limit for staff headcount** (admins + teachers). Students are counted separately via MAS. `max_users` on edtech plans covers non-student roles only. |

---

### 3.2 Terminology Definitions (Use These Exactly)

| Term | Definition |
|---|---|
| **MAS** | Monthly Active Student — a student who has performed at least one content interaction in the current calendar month |
| **Content Interaction** | Any of: authenticated login, video/content view event, quiz attempt start, assignment submission |
| **MAS Limit** | `max_monthly_active_students` — stored in `subscription_plans.features` JSON |
| **Staff Limit** | `max_users` — covers non-student roles (Admin, Teacher, Staff) on edtech/teacher plans |
| **Activation** | The moment a student's first content interaction is recorded in the current calendar month, incrementing the MAS count |
| **MAS Reset** | Truncation of the current month's active student count at 00:00 UTC on the 1st of each calendar month |

---

### 3.3 New Database Components

#### Table: `student_activity_months`

```sql
CREATE TABLE student_activity_months (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id     BIGINT UNSIGNED NOT NULL,
  user_id       BIGINT UNSIGNED NOT NULL,
  activity_month CHAR(7) NOT NULL,        -- format: 'YYYY-MM'
  first_active_at TIMESTAMP NOT NULL,     -- first interaction timestamp this month
  last_active_at  TIMESTAMP NOT NULL,     -- most recent interaction this month
  PRIMARY KEY (id),
  UNIQUE KEY uq_tenant_user_month (tenant_id, user_id, activity_month),
  INDEX idx_tenant_month (tenant_id, activity_month),
  CONSTRAINT fk_sam_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  CONSTRAINT fk_sam_user   FOREIGN KEY (user_id)   REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

**Design rationale:** The `UNIQUE KEY` on `(tenant_id, user_id, activity_month)` makes upserts idempotent. Inserting the same student twice in a month is a no-op conflict — not a double-count. This is the primary safety guarantee.

#### Column additions to `subscription_plans.features` JSON

No migration needed — the `features` JSON column is already extensible. New keys introduced:

| Key | Type | Used By |
|---|---|---|
| `max_monthly_active_students` | int (0 = unlimited) | `edtech`, `standalone_teacher` plans |
| `max_users` (existing) | int (0 = unlimited) | All plans — on edtech/teacher plans, covers non-student roles only |

#### Column additions to `subscription_plans`

Add a dedicated column (not just JSON) for query efficiency:

```sql
ALTER TABLE subscription_plans
  ADD COLUMN `max_monthly_active_students` INT UNSIGNED DEFAULT NULL
  AFTER `max_courses`;
```

Rationale: `max_users` and `max_courses` are already dedicated columns (not only in JSON). Consistency requires `max_monthly_active_students` to follow the same pattern.

---

### 3.4 New Domain Components

#### 3.4.1 ResourceQuotaType Enum — Extension

Add two new cases to the existing enum:

```php
case MONTHLY_ACTIVE_STUDENTS = 'monthly_active_students';
case STAFF_USERS = 'staff_users';
```

`STAFF_USERS` replaces the role of the current `USERS` type for edtech/teacher tenants. `USERS` remains for offline institutions.

#### 3.4.2 New Value Object: `ActivityMonth`

Location: `App\Domain\Shared\Quota\ValueObjects\ActivityMonth`

```php
final class ActivityMonth
{
    private function __construct(private readonly string $value) {}

    public static function current(): self
    {
        return new self(now()->format('Y-m'));
    }

    public static function fromString(string $value): self
    {
        if (!preg_match('/^\d{4}-\d{2}$/', $value)) {
            throw new \InvalidArgumentException("Invalid activity month format: {$value}");
        }
        return new self($value);
    }

    public function toString(): string { return $this->value; }
}
```

#### 3.4.3 New Domain Service Interface: `StudentActivityRecorderInterface`

Location: `App\Domain\Shared\Quota\Services\StudentActivityRecorderInterface`

```php
interface StudentActivityRecorderInterface
{
    /**
     * Records a content interaction for a student.
     * Implementation must be idempotent — calling this multiple times
     * for the same student in the same month must not increment the count.
     * Returns true if this is the student's FIRST activation this month.
     */
    public function record(int $tenantId, int $userId, ActivityMonth $month): bool;

    /**
     * Returns the count of distinct active students for a tenant in a given month.
     */
    public function countForMonth(int $tenantId, ActivityMonth $month): int;
}
```

#### 3.4.4 New Domain Event: `StudentActivationAttemptedAtLimit`

Location: `App\Domain\Shared\Quota\Events\StudentActivationAttemptedAtLimit`

Fired when a student login is blocked due to MAS limit. Payload: `tenant_id`, `user_id`, `current_mas`, `limit`, `activity_month`.

#### 3.4.5 New Domain Event: `MasWarningThresholdReached`

Location: `App\Domain\Shared\Quota\Events\MasWarningThresholdReached`

Fired when MAS count first reaches 100% for a tenant. Payload: `tenant_id`, `current_mas`, `limit`, `activity_month`, `block_at` (timestamp: 48 hours from now).

---

### 3.5 New Application Components

#### 3.5.1 RecordStudentActivityUseCase

Location: `App\Application\Shared\Quota\UseCases\RecordStudentActivityUseCase`

**This UseCase is the single entry point for all MAS tracking. It is NOT called inside login transactions.**

Responsibilities (in order):
1. Verify user role is `student` — non-students are ignored silently
2. Verify tenant category is `edtech` or `standalone_teacher` — offline tenants are ignored silently
3. Call `StudentActivityRecorderInterface::record()` — idempotent upsert
4. If `record()` returns `false` (student already active this month) → return immediately, no further action
5. If `record()` returns `true` (first activation this month):
   a. Re-count MAS via `StudentActivityRecorderInterface::countForMonth()`
   b. Compare against plan's `max_monthly_active_students`
   c. If count equals limit → dispatch `MasWarningThresholdReached` event
6. Write the activity record to `student_activity_months` — this is the persistence step

**Critical constraint:** This UseCase must be called **asynchronously via a queued job** from content interaction points. It must never block the student's request. See §3.6 for the integration pattern.

#### 3.5.2 CheckMasQuotaUseCase

Location: `App\Application\Shared\Quota\UseCases\CheckMasQuotaUseCase`

Called at **login time only** for student users on edtech/teacher tenants.

Responsibilities:
1. Check tenant category — if `offline_institution`, return allowed immediately
2. Check user role — if not `student`, return allowed immediately
3. Check if student already has an entry in `student_activity_months` for the current month → if yes, return allowed (existing active student is never blocked)
4. Count current MAS for the tenant
5. Get plan limit (`max_monthly_active_students`)
6. If limit is 0 (unlimited) → return allowed
7. Check if a `MasOverageWarning` record exists for this tenant/month with `block_after` timestamp in the past → if yes, return **blocked** with error code `MAS_LIMIT_ENFORCED`
8. If count >= limit and no existing warning record → create `MasOverageWarning` record with `block_after = now() + 48 hours`, dispatch `MasWarningThresholdReached` event, return **allowed** (this student's login still succeeds — the 48hr clock just started)
9. If count < limit → return allowed

#### 3.5.3 MasOverageWarning Record

This is a lightweight record tracking the 48-hour warning window per tenant per month.

New table:

```sql
CREATE TABLE mas_overage_warnings (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id      BIGINT UNSIGNED NOT NULL,
  activity_month CHAR(7) NOT NULL,
  triggered_at   TIMESTAMP NOT NULL,
  block_after    TIMESTAMP NOT NULL,        -- triggered_at + 48 hours
  notified_at    TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_tenant_month (tenant_id, activity_month),
  INDEX idx_block_after (block_after)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

#### 3.5.4 ResetMonthlyActiveStudentsCommand

Runs at **00:05 UTC on the 1st of every calendar month** (5 minutes after midnight to avoid race with any end-of-month jobs).

Responsibilities:
- Truncate `student_activity_months` for the previous month — **do not delete, archive instead**
- Actually: do nothing to the records (they are historical data). The reset is implicit — `countForMonth` always queries the current month only.
- Delete all `mas_overage_warnings` records where `activity_month` is the previous month
- Log completion

Note: No data deletion of `student_activity_months` — these are permanent records for analytics. Only `mas_overage_warnings` is cleaned up monthly.

#### 3.5.5 NotifyMasWarningListener

Listens to `MasWarningThresholdReached`. Responsibilities:
- Send in-app notification to all Tenant Admin users of the tenant via Phase 14 `NotificationDispatcher`
- Notification content: "Your active student limit has been reached. New student logins will be blocked in 48 hours unless you upgrade your plan."
- Include `block_after` timestamp in the notification payload
- Update `mas_overage_warnings.notified_at` timestamp

---

### 3.6 Integration Points (Where Existing Code Must Change)

#### 3.6.1 Login Flow Integration

Location: The existing student authentication UseCase / login handler.

**Change:** After successful authentication, if the user role is `student`:
1. Call `CheckMasQuotaUseCase` synchronously — this is a blocking check
2. If result is `blocked` → return HTTP 403 with error code `MAS_LIMIT_ENFORCED` and message: "This institution has reached its active student limit for this month. Please contact your administrator."
3. If result is `allowed` → dispatch `RecordStudentActivityJob` (queued, async) and proceed with login

**Critical:** The `RecordStudentActivityJob` is queued — it does not block the login response. The student is logged in immediately. The activity recording happens in the background.

#### 3.6.2 Content Interaction Integration Points

The following events must dispatch `RecordStudentActivityJob` asynchronously. These are fire-and-forget — they must never slow down the student's request:

| Interaction | Where to Dispatch |
|---|---|
| Video/content view | Content view endpoint (after successful response) |
| Quiz attempt start | `StartQuizAttemptUseCase` — after attempt record is created |
| Assignment submission | `SubmitAssignmentUseCase` — after submission is stored |

Pattern for all three:

```php
// After the primary UseCase completes successfully
dispatch(new RecordStudentActivityJob(
    tenantId: $tenantId,
    userId: $userId,
    month: ActivityMonth::current()
))->onQueue('low');
```

Queue: `low` priority — activity recording is never urgent.

#### 3.6.3 TenantQuotaService — Category-Aware Routing

The existing `EloquentTenantQuotaService::getCurrentUsage()` must be extended:

```php
public function getCurrentUsage(int $tenantId, ResourceQuotaType $type): int
{
    return match ($type) {
        ResourceQuotaType::USERS          => $this->countActiveUsers($tenantId),         // offline: all roles
        ResourceQuotaType::STAFF_USERS    => $this->countActiveStaffUsers($tenantId),    // edtech: non-student roles
        ResourceQuotaType::MONTHLY_ACTIVE_STUDENTS => $this->countMasForCurrentMonth($tenantId),
        ResourceQuotaType::COURSES        => $this->countNonArchivedCourses($tenantId),
        ResourceQuotaType::STORAGE        => $this->countStorageUsed($tenantId),
        ResourceQuotaType::SESSIONS       => $this->sessionManager->countActiveTenantSessions($tenantId),
        ResourceQuotaType::AUTOMATION_RULES => $this->countActiveAutomationRules($tenantId),
    };
}

private function countActiveStaffUsers(int $tenantId): int
{
    return DB::table('users')
        ->where('tenant_id', $tenantId)
        ->where('status', 'active')
        ->whereNotIn('role', ['student'])  // use the actual role identifier from the codebase
        ->count();
}

private function countMasForCurrentMonth(int $tenantId): int
{
    return DB::table('student_activity_months')
        ->where('tenant_id', $tenantId)
        ->where('activity_month', ActivityMonth::current()->toString())
        ->count();
}
```

#### 3.6.4 CreateTenantUserUseCase — Staff Limit for EdTech

When creating a non-student user on an `edtech` or `standalone_teacher` tenant:
- Quota check must use `ResourceQuotaType::STAFF_USERS` against `max_users` plan limit
- When creating a student user on these tenant categories:
  - No quota check at creation time — students can be registered freely
  - MAS quota is enforced only at login (§3.6.1)

---

### 3.7 Plan Migration for Existing EdTech Tenants

Existing edtech tenants may be on plans that predate this phase. A one-time migration is required:

1. Identify all active `subscription_plans` where `tenant_category = 'edtech'` or `tenant_category = 'standalone_teacher'`
2. For each, set `max_monthly_active_students` to a sensible default (suggested: current `max_users` value, or a configurable platform default)
3. Set `max_users` on these plans to represent staff headcount only (suggested: 10 as a default, configurable)
4. This migration must be a named Laravel migration with a `--dry-run` option logged before execution

**The developer must flag any existing tenant whose current active user count would immediately exceed the new limits before running this migration.**

---

### 3.8 Updated TenantUsageResource for EdTech Tenants

For `edtech` and `standalone_teacher` tenants, the usage response shape changes:

```json
{
  "plan": {
    "name": "EdTech Growth",
    "code": "growth_edtech_in"
  },
  "quota": {
    "monthly_active_students": {
      "used": 340,
      "limit": 500,
      "percentage": 68,
      "is_unlimited": false,
      "resets_on": "2026-04-01"
    },
    "staff_users": {
      "used": 4,
      "limit": 10,
      "percentage": 40,
      "is_unlimited": false
    },
    "courses": {
      "used": 12,
      "limit": 50,
      "percentage": 24,
      "is_unlimited": false
    },
    "storage_mb": {
      "used": 2048,
      "limit": 51200,
      "percentage": 4,
      "is_unlimited": false
    },
    "sessions": {
      "used": 8,
      "limit": 100,
      "percentage": 8,
      "is_unlimited": false
    }
  },
  "mas_warning": {
    "active": true,
    "block_after": "2026-03-31T02:00:00Z",
    "hours_remaining": 36
  },
  "overages": []
}
```

`resets_on` is always the 1st of the next calendar month. `mas_warning` is `null` when no active warning exists.

---

### 3.9 Business Rules (NON-NEGOTIABLE)

| Rule ID | Rule |
|---|---|
| BR-01 | A student with at least one entry in `student_activity_months` for the current calendar month is an active student. No other definition applies. |
| BR-02 | A student already active this month can ALWAYS log in, regardless of the MAS count. The block applies only to NEW activations. |
| BR-03 | The 48-hour warning window starts the moment the MAS count first reaches the plan limit. The exact timestamp is stored in `mas_overage_warnings.block_after`. |
| BR-04 | After `block_after` is in the past, all new student login attempts on that tenant are blocked until: (a) the calendar month resets, or (b) the tenant upgrades to a higher plan. |
| BR-05 | Upgrading a plan with a higher `max_monthly_active_students` must immediately delete the active `mas_overage_warnings` record for the current month, restoring login access. |
| BR-06 | `RecordStudentActivityJob` is always idempotent. Replaying it 100 times for the same student/month must produce exactly one `student_activity_months` record. |
| BR-07 | `offline_institution` tenants are completely unaffected by this phase. Their `max_users` behavior is unchanged. |
| BR-08 | For `edtech` and `standalone_teacher` tenants, student registration (user creation) has no quota check. Only activation (first login of the month) is quota-enforced. |
| BR-09 | `max_monthly_active_students = 0` means unlimited. The quota check must short-circuit immediately without a database query. |
| BR-10 | All MAS-related blocking events must be audit-logged: student ID, tenant ID, month, current count, limit, timestamp. |
| BR-11 | `student_activity_months` records are permanent historical data. They are never deleted. Only `mas_overage_warnings` is cleaned up monthly. |
| BR-12 | Plan downgrade to a lower MAS limit does not immediately block existing active students. It takes effect on the 1st of the next calendar month when the new limit is lower than the current month's final MAS count. |

---

## 4. New Commands Summary

| Command | Schedule | Responsibility |
|---|---|---|
| `quota:enforce-overage` | Daily 02:00 UTC | Deactivate resources past grace period (11B-R DEFECT-01) |
| `quota:check-overage-resolution` | Every 6 hours | Resolve overages where tenant has self-corrected (11B-R DEFECT-01) |
| `quota:reset-mas-warnings` | 00:05 UTC on 1st of month | Delete previous month's `mas_overage_warnings` records |

---

## 5. New Permissions Required

| Code | Category | Description | Roles |
|---|---|---|---|
| `quota.mas.view` | quota | View MAS usage and warning status for a tenant | Tenant Admin, Tenant Owner |
| `quota.mas.warn.dismiss` | quota | Dismiss MAS warning notification (does not remove the block) | Tenant Admin, Tenant Owner |

---

## 6. Quality Gates — Phase 11B-R + 11D Complete

### Security & Data Safety Gates (BLOCKING)

- [ ] `TenantUsageController::show()` has `Gate::authorize()` — verified in code, not just planned
- [ ] `RecordStudentActivityJob` is idempotent — duplicate dispatches produce one DB record
- [ ] `student_activity_months` UNIQUE constraint verified to reject duplicate upserts at DB level
- [ ] `offline_institution` tenants: zero changes to existing quota behavior — confirmed by test
- [ ] MAS block does not affect students already active this month — confirmed by test
- [ ] Plan upgrade immediately clears `mas_overage_warnings` — confirmed by test
- [ ] All MAS blocking events are audit-logged with full payload
- [ ] No external API calls inside database transactions
- [ ] `DB::afterCommit()` used for all domain event dispatch

### Functional Gates (BLOCKING)

- [ ] `EnforceOverageDeactivationCommand --dry-run` produces log output with zero DB writes
- [ ] Both 11B-R commands appear in `php artisan schedule:list` with correct frequencies
- [ ] `TenantUsageResource` returns `plan`, `percentage`, `is_unlimited` for all tenant categories
- [ ] EdTech usage response includes `monthly_active_students`, `staff_users`, `mas_warning` fields
- [ ] Student login blocked after `block_after` timestamp for tenants at MAS limit
- [ ] Student login allowed for already-active students regardless of MAS count
- [ ] `ResetMonthlyActiveStudentsCommand` clears `mas_overage_warnings` only — `student_activity_months` untouched
- [ ] Plan migration identifies at-risk tenants before executing
- [ ] `max_monthly_active_students = 0` bypasses all MAS checks (no DB query)

### Architecture Gates (BLOCKING)

- [ ] PHPStan Level 5: zero new errors
- [ ] All existing tests pass — zero regression
- [ ] `UpdatePlatformSettingsUseCase` exists; `PlatformSettingsController` has zero business logic
- [ ] `EnforceOverageDeactivationUseCase` exists; command is a thin wrapper
- [ ] Domain layer has zero `Illuminate` imports
- [ ] Controllers < 20 lines per method
- [ ] `RecordStudentActivityJob` dispatched on `low` queue — never on `sync` or `default`
- [ ] `ActivityMonth` value object used everywhere — no raw `date('Y-m')` calls in business logic
- [ ] `student_activity_months` writes never inside login transaction

### Test Requirements (Minimum)

**11B-R Tests (minimum 15 new tests):**
- [ ] `EnforceOverageDeactivationUseCase` deactivates correct resources in correct order
- [ ] `--dry-run` produces no DB writes
- [ ] `UpdatePlatformSettingsUseCase` writes settings and audit log
- [ ] `CheckOverageResolutionUseCase` resolves compliant tenants
- [ ] `TenantUsageResource` returns all required fields
- [ ] `TenantUsageController` rejects unauthorized access

**11D Tests (minimum 25 new tests):**
- [ ] Student first login this month: activity recorded, count incremented
- [ ] Student second login this month: no count increment (idempotent)
- [ ] MAS at limit: warning created, login still succeeds, notification dispatched
- [ ] MAS at limit + 48hr passed: new student login blocked with correct error code
- [ ] MAS at limit + 48hr passed: existing active student login succeeds
- [ ] Plan upgrade: `mas_overage_warnings` record deleted, logins unblocked
- [ ] `offline_institution` tenant: MAS checks never executed
- [ ] Non-student user: MAS checks never executed
- [ ] `max_monthly_active_students = 0`: all checks bypassed
- [ ] `RecordStudentActivityJob`: 10 dispatches for same student/month = 1 DB record
- [ ] `ResetMonthlyActiveStudentsCommand`: clears warnings, preserves activity records
- [ ] Staff user creation on edtech tenant: checked against `max_users` (staff limit)
- [ ] Student creation on edtech tenant: no quota check

---

## 7. Files Expected to Change (Checklist for Implementation Plan)

The developer's Implementation Plan must account for every file in this list. Any additional files must be justified.

**New files:**
- `database/migrations/xxxx_create_student_activity_months_table.php`
- `database/migrations/xxxx_create_mas_overage_warnings_table.php`
- `database/migrations/xxxx_add_max_monthly_active_students_to_subscription_plans.php`
- `database/migrations/xxxx_migrate_edtech_plan_limits.php`
- `App/Domain/Shared/Quota/ValueObjects/ActivityMonth.php`
- `App/Domain/Shared/Quota/Services/StudentActivityRecorderInterface.php`
- `App/Domain/Shared/Quota/Events/StudentActivationAttemptedAtLimit.php`
- `App/Domain/Shared/Quota/Events/MasWarningThresholdReached.php`
- `App/Application/Shared/Quota/UseCases/RecordStudentActivityUseCase.php`
- `App/Application/Shared/Quota/UseCases/CheckMasQuotaUseCase.php`
- `App/Application/SuperAdminDashboard/Subscription/UseCases/UpdatePlatformSettingsUseCase.php`
- `App/Application/SuperAdminDashboard/Subscription/UseCases/EnforceOverageDeactivationUseCase.php`
- `App/Application/SuperAdminDashboard/Subscription/UseCases/CheckOverageResolutionUseCase.php`
- `App/Infrastructure/Shared/Quota/EloquentStudentActivityRecorder.php`
- `App/Infrastructure/Shared/Quota/MasOverageWarningRecord.php` (Eloquent model)
- `App/Infrastructure/Shared/Quota/StudentActivityMonthRecord.php` (Eloquent model)
- `App/Jobs/RecordStudentActivityJob.php`
- `App/Listeners/NotifyMasWarningListener.php`
- `App/Console/Commands/ResetMonthlyActiveStudentsCommand.php`

**Modified files:**
- `App/Domain/Shared/Quota/ValueObjects/ResourceQuotaType.php` — add `MONTHLY_ACTIVE_STUDENTS`, `STAFF_USERS`
- `App/Infrastructure/Shared/Quota/EloquentTenantQuotaService.php` — add category-aware routing
- `App/Http/.../TenantUsageController.php` — add `Gate::authorize()`
- `App/Http/.../PlatformSettingsController.php` — extract logic to UseCase
- `App/Http/Resources/TenantUsageResource.php` — add missing fields + edtech shape
- `App/Console/Commands/EnforceOverageDeactivationCommand.php` — implement (currently empty)
- `App/Console/Commands/CheckOverageResolutionCommand.php` — implement (currently empty)
- `routes/console.php` (or `Kernel.php`) — register all three scheduled commands
- Login UseCase — add `CheckMasQuotaUseCase` call post-authentication
- `CreateTenantUserUseCase` — add category-aware quota type selection
- `EventServiceProvider` — register `NotifyMasWarningListener`

---

## 8. What This Phase Does NOT Include

The following are explicitly out of scope. Do not implement them.

- MAS-based billing (usage-based billing, overage charges) — future phase
- Historical MAS analytics dashboard — future phase
- MAS-based plan upgrade prompts in the frontend — Phase 11E (separate)
- `standalone_teacher` self-onboarding MAS enforcement — covered by existing teacher onboarding phase
- Arabic/RTL UI for MAS warnings — covered by AR1 phase conventions
- ZATCA e-invoicing implications of MAS limits — future GCC phase

---

*End of Developer Instructions*
*Ubotz 2.0 — Phase 11B-R + 11D — Issued March 30, 2026*
*Principal Engineer / Architecture Auditor*
