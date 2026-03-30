# UBOTZ 2.0 — Performance Remediation Developer Instructions

## Dashboard & Scheduler Performance Fixes

| Field | Value |
|---|---|
| **Document Type** | Developer Instruction (Pre-Implementation Brief) |
| **Phase** | PERF-QW (Performance Quick Wins) + PERF-DEF (Deferred Structural Fixes) |
| **Date** | March 30, 2026 |
| **Issued By** | Principal Engineer / Architecture Auditor |
| **Audience** | Implementation Developer (Antigravity) |
| **Expected Deliverable** | Implementation Plan (same format as 10A–20B plans) |
| **Prerequisites** | All current phases through 20B operational. Dashboard stats endpoint functional. Scheduled commands running in production. |

> **This document addresses measured performance bottlenecks in production code. The dashboard stats query file alone fires 18–25 uncached DB queries per request. Five heavy scheduled commands collide at 02:00 UTC. These are not theoretical concerns — they degrade response times linearly as tenant data grows and will cause visible latency for GCC tenants (02:00 UTC = 06:00 GST). Every fix in Part A (Quick Wins) is safe, isolated, and must ship as a single deployment. Part B (Deferred Structural Fixes) requires separate implementation planning.**

---

## Table of Contents

1. [Mission Statement](#1-mission-statement)
2. [Scope & Boundaries](#2-scope--boundaries)
3. [Part A — Quick Wins (Ship Together)](#3-part-a--quick-wins-ship-together)
   - [QW-01: Memoize Repeated Lookups in EloquentDashboardStatsQuery](#qw-01-memoize-repeated-lookups-in-eloquentdashboardstatsquery)
   - [QW-02: Add Cache::remember to Dashboard Widget Builders](#qw-02-add-cacheremember-to-dashboard-widget-builders)
   - [QW-03: Replace LIKE Title Scan with session_type Column](#qw-03-replace-like-title-scan-with-session_type-column)
   - [QW-04: Stagger 02:00 UTC Cron Cluster](#qw-04-stagger-0200-utc-cron-cluster)
   - [QW-05: Add withoutOverlapping to All Batch Scheduled Commands](#qw-05-add-withoutoverlapping-to-all-batch-scheduled-commands)
   - [QW-06: Add Time-Window Filter to buildFeeByBatch](#qw-06-add-time-window-filter-to-buildfeebyBatch)
   - [QW-07: Replace Correlated Subquery in buildCourseEnrollmentOverview](#qw-07-replace-correlated-subquery-in-buildcourseenrollmentoverview)
4. [Part B — Deferred Structural Fixes (Separate Sprint)](#4-part-b--deferred-structural-fixes-separate-sprint)
   - [DEF-01: Session Count Redis Architecture Refactor](#def-01-session-count-redis-architecture-refactor)
   - [DEF-02: Scheduled Command Queue Dispatch Pattern](#def-02-scheduled-command-queue-dispatch-pattern)
   - [DEF-03: ExpireTrialsUseCase Query-Level Chunking](#def-03-expiretrialsusecase-query-level-chunking)
5. [Implementation Sequence](#5-implementation-sequence)
6. [Gap Analysis Requirements](#6-gap-analysis-requirements)
7. [Test Plan](#7-test-plan)
8. [Quality Gates](#8-quality-gates)
9. [Constraints & Reminders](#9-constraints--reminders)
10. [Risk Register](#10-risk-register)
11. [What This Document Does NOT Include](#11-what-this-document-does-not-include)

---

## 1. Mission Statement

This document instructs the implementation of **seven quick-win performance fixes** (Part A) and **three deferred structural fixes** (Part B) targeting measured bottlenecks in the dashboard stats query layer and the scheduled command infrastructure.

**Part A** eliminates approximately 75–90% of unnecessary database pressure from dashboard endpoints and prevents scheduled command collisions. All seven quick wins are low-risk, require no new database tables, no new API endpoints, and no domain model changes. They modify only the infrastructure query layer and the scheduler configuration.

**Part B** addresses deeper structural patterns (Redis session counting, serial tenant iteration in scheduled commands, and in-memory collection loading) that require careful design and separate implementation planning. Part B items are documented here for architectural completeness but are NOT expected to ship with Part A.

**Combined impact of Part A:**
- Dashboard DB queries per request: **~25 → ~2** (on cache hit, which is >95% of requests after first load)
- Redundant identical queries per request: **13+ → 0** (memoization)
- Full-table LIKE scans: **eliminated** (replaced by indexed column filter)
- Scheduled command collision window: **5 commands at 02:00 → staggered across 50 minutes**
- Unbounded fee aggregation: **all-time → current fiscal year**

---

## 2. Scope & Boundaries

### What Part A Includes (Quick Wins — Ship Together)

| ID | Fix | File(s) Modified | Estimated Effort |
|---|---|---|---|
| QW-01 | Memoize `studentRoleIds`, `staffRoleIds`, `getTeacherCourseIds()` | `EloquentDashboardStatsQuery.php` | 30 minutes |
| QW-02 | Wrap dashboard widget builders in `Cache::remember()` | `EloquentDashboardStatsQuery.php` | 45 minutes |
| QW-03 | Replace `LIKE '%test%'` with `whereIn('session_type', [...])` | `EloquentDashboardStatsQuery.php` | 15 minutes |
| QW-04 | Stagger the 02:00 UTC cron cluster | `routes/console.php` | 15 minutes |
| QW-05 | Add `withoutOverlapping()` to all batch commands | `routes/console.php` | 15 minutes |
| QW-06 | Add fiscal year time-window to `buildFeeByBatch` | `EloquentDashboardStatsQuery.php` | 20 minutes |
| QW-07 | Replace correlated subquery with LEFT JOIN ... HAVING | `EloquentDashboardStatsQuery.php` | 30 minutes |

### What Part B Includes (Deferred — Separate Sprint)

| ID | Fix | File(s) Modified | Estimated Effort |
|---|---|---|---|
| DEF-01 | Redis SADD/SCARD refactor for session counting | `TenantSessionManager.php` | 3–4 hours |
| DEF-02 | Convert serial tenant iteration to dispatched jobs | `FeeSendRemindersCommand.php` + 4 similar commands | 4–6 hours |
| DEF-03 | Query-level chunking for expired trial processing | `ExpireTrialsUseCase.php` + repository | 1–2 hours |

### What This Document Does NOT Include

- No new API endpoints
- No new database tables or migrations (QW-03 leverages the existing `session_type` column)
- No domain model changes
- No frontend changes
- No new bounded contexts
- No materialized summary tables (deferred beyond Part B — future performance phase)

---

## 3. Part A — Quick Wins (Ship Together)

### QW-01: Memoize Repeated Lookups in EloquentDashboardStatsQuery

**Problem:** Three lookup patterns are repeated multiple times per single dashboard request, producing 13+ identical DB queries that return static data.

**Pattern 1 — `studentRoleIds` (5 occurrences)**

The query `DB::table('tenant_roles')->where('code', 'student')->pluck('id')` is executed independently at approximately lines 103, 128, 830, 1082, and 1167. Role IDs do not change during a request lifecycle.

**Pattern 2 — `staffRoleIds` (similar repetition)**

Same pattern for staff role lookups.

**Pattern 3 — `getTeacherCourseIds()` (4 occurrences)**

Called at approximately lines 228, 253, 271, and 517. Each call fires 2 DB queries (primary courses + partner courses). Total: 8 DB queries for data that is constant within the request.

**Fix — Request-scoped memoization via private properties:**

```php
// Add to EloquentDashboardStatsQuery class body

/** @var array<int, array<int>> Memoized student role IDs keyed by tenantId */
private array $studentRoleIdCache = [];

/** @var array<int, array<int>> Memoized staff role IDs keyed by tenantId */
private array $staffRoleIdCache = [];

/** @var array<string, array<int>> Memoized teacher course IDs keyed by "{tenantId}:{userId}" */
private array $teacherCourseIdCache = [];

private function getStudentRoleIds(int $tenantId): array
{
    if (!isset($this->studentRoleIdCache[$tenantId])) {
        $this->studentRoleIdCache[$tenantId] = DB::table('tenant_roles')
            ->where('tenant_id', $tenantId)
            ->where('code', 'student')
            ->pluck('id')
            ->all();
    }
    return $this->studentRoleIdCache[$tenantId];
}

private function getStaffRoleIds(int $tenantId): array
{
    if (!isset($this->staffRoleIdCache[$tenantId])) {
        $this->staffRoleIdCache[$tenantId] = DB::table('tenant_roles')
            ->where('tenant_id', $tenantId)
            ->where('code', 'staff')
            ->pluck('id')
            ->all();
    }
    return $this->staffRoleIdCache[$tenantId];
}

private function getTeacherCourseIds(int $tenantId, int $teacherUserId): array
{
    $cacheKey = "{$tenantId}:{$teacherUserId}";
    if (!isset($this->teacherCourseIdCache[$cacheKey])) {
        $this->teacherCourseIdCache[$cacheKey] = $this->fetchTeacherCourseIds($tenantId, $teacherUserId);
    }
    return $this->teacherCourseIdCache[$cacheKey];
}
```

**Implementation rules:**

1. The existing `getTeacherCourseIds()` method body (the actual 2-query fetch) must be extracted into a new `fetchTeacherCourseIds()` private method. The original method name becomes the memoized wrapper.
2. All 5 `studentRoleIds` inline queries must be replaced with calls to `$this->getStudentRoleIds($tenantId)`.
3. All `staffRoleIds` inline queries must be replaced with calls to `$this->getStaffRoleIds($tenantId)`.
4. All 4 `getTeacherCourseIds()` call sites already call the method — no call-site changes needed, only the method internals change.
5. Cache keys are scoped by `tenantId` (roles) and `tenantId:userId` (teacher courses) to ensure correctness if the class is ever reused across tenants in a single process (it currently is not, but defensive coding costs nothing).
6. The cache properties are instance-level arrays, not static. This ensures they reset per request when Laravel creates a new instance.

**Queries eliminated:** 13+ per dashboard request → 3 (one per unique lookup, on first call only).

---

### QW-02: Add Cache::remember to Dashboard Widget Builders

**Problem:** `getDashboardOverview()` calls 8 private builder methods that together fire 18–25 sequential DB queries. The same data is re-queried on every dashboard load, every page refresh, every browser tab. For 5 concurrent admin sessions refreshing dashboards: 75–125 DB queries/minute from dashboard alone.

**Fix — Wrap each builder method's result in `Cache::remember()` with a 60-second TTL:**

```php
// Pattern to apply to each builder method
private function buildAttentionItems(int $tenantId): array
{
    return Cache::remember(
        "dashboard:{$tenantId}:attention_items",
        60, // 60 seconds — acceptable staleness for all dashboard widgets
        fn () => $this->computeAttentionItems($tenantId)
    );
}

// The existing buildAttentionItems logic moves into computeAttentionItems
private function computeAttentionItems(int $tenantId): array
{
    // ... existing query logic unchanged ...
}
```

**Apply this pattern to ALL of these builder methods:**

| Original Method | Cache Key | TTL | Notes |
|---|---|---|---|
| `buildAttentionItems` | `dashboard:{$tenantId}:attention_items` | 60s | |
| `buildActivityFeed` | `dashboard:{$tenantId}:activity_feed` | 60s | |
| `buildAttendanceTrend30d` | `dashboard:{$tenantId}:attendance_trend_30d` | 300s | 5 min — trend data is inherently stale |
| `buildUpcomingAssessments` | `dashboard:{$tenantId}:upcoming_assessments` | 120s | |
| `buildFeeByBatch` | `dashboard:{$tenantId}:fee_by_batch` | 300s | Financial summary, 5 min acceptable |
| `buildCrmPipelineSummary` | `dashboard:{$tenantId}:crm_pipeline` | 120s | |
| `buildCourseEnrollmentOverview` | `dashboard:{$tenantId}:course_enrollment` | 120s | |
| `buildStaffOverview` | `dashboard:{$tenantId}:staff_overview` | 120s | |

**Apply the same pattern to teacher and staff dashboard methods:**

| Original Method | Cache Key | TTL |
|---|---|---|
| `getTeacherDashboard` sub-methods | `dashboard:{$tenantId}:teacher:{$userId}:*` | 60–120s |
| `getStaffDeskDashboard` sub-methods | `dashboard:{$tenantId}:staff_desk:*` | 60–120s |

**For teacher-specific dashboard caches**, the key must include `$userId` because each teacher sees different data scoped to their own courses.

**Implementation rules:**

1. Use `Cache::remember()` (the default cache store, which is Redis). Do NOT use `Cache::store('file')` or any other store.
2. The rename pattern is: `buildX()` becomes the cached wrapper, existing logic moves to `computeX()`. This preserves all existing call sites.
3. Cache keys MUST include `$tenantId` to maintain tenant isolation. This is non-negotiable.
4. Teacher dashboard cache keys MUST include `$userId` in addition to `$tenantId`.
5. Staff desk dashboard cache keys use only `$tenantId` (staff desk shows aggregate tenant data, not user-specific data). Verify this assumption during gap analysis — if staff desk is also user-scoped, add `$userId`.
6. All TTLs are in seconds (integer), not `Carbon` intervals.
7. Do NOT add cache invalidation listeners or event-driven cache busting for this phase. The short TTLs (60–300 seconds) make explicit invalidation unnecessary. The marginal staleness is acceptable for all dashboard widgets.
8. The `getDailySnapshotStats()` method (which provides the top-line counts: total students, total courses, etc.) should also be cached with a 60-second TTL using the same pattern.

**Cache key namespace safety:** All keys start with `dashboard:` which does not conflict with any existing cache key namespace in the platform (existing namespaces include `tenant_resolution:`, `tenant_entitlements:`, `notification_preferences:`).

**Queries eliminated:** On cache hit (>95% of requests after first load), dashboard endpoint drops from 18–25 DB queries to 0–2 (only the initial tenant context resolution queries remain).

---

### QW-03: Replace LIKE Title Scan with session_type Column

**Problem:** The dashboard queries use `LOWER(si.title) LIKE '%test%'` (and similar patterns for 'exam' and 'assessment') to identify assessment-type sessions. Leading-wildcard `LIKE` with `LOWER()` wrapping forces a full-table scan on the unindexed `title` column.

**Existing infrastructure:** The `session_instances` table already has a `session_type` column (`VARCHAR(30)`, default `'offline_class'`). This column is the correct discriminator for session type.

**Fix — Replace all LIKE-based title scanning with `session_type` column filtering:**

**Before (current code, approximately lines 559–563 and 1328–1332):**
```php
// ❌ Full-table scan, cannot use any index
->where(function ($q) {
    $q->whereRaw("LOWER(si.title) LIKE '%test%'")
      ->orWhereRaw("LOWER(si.title) LIKE '%exam%'")
      ->orWhereRaw("LOWER(si.title) LIKE '%assessment%'");
})
```

**After:**
```php
// ✅ Uses indexed session_type column
->whereIn('si.session_type', ['assessment', 'exam', 'test'])
```

**Implementation rules:**

1. The developer MUST run a gap analysis query during implementation planning to determine the **exact set of `session_type` values** currently stored in the `session_instances` table across all tenants:
   ```sql
   SELECT DISTINCT session_type, COUNT(*) as count
   FROM session_instances
   GROUP BY session_type
   ORDER BY count DESC;
   ```
2. The `whereIn` values must match the actual `session_type` values used by the timetable/scheduling system for assessment-type sessions. The values listed above (`assessment`, `exam`, `test`) are based on the bottleneck report — the gap analysis query will confirm the exact values.
3. If the gap analysis reveals that assessment-type sessions are currently stored with `session_type = 'offline_class'` (because the session type wasn't being set correctly when sessions were created as exams), then this fix cannot be applied until the timetable system is verified to correctly set `session_type` on creation. In that case, flag this finding in the implementation plan and skip QW-03.
4. Locate ALL occurrences of the LIKE-based title pattern in `EloquentDashboardStatsQuery.php` and replace them. The bottleneck report identifies two locations (approximately lines 559–563 and 1328–1332), but the developer must search the entire file for any other occurrences.
5. The existing composite indexes on `session_instances` include `['tenant_id', 'status', 'session_date']`. Since the `session_type` filter will be combined with `tenant_id` and often `session_date`, the existing indexes provide adequate coverage. No new index is required unless the gap analysis shows poor query plan performance — in that case, propose a covering index in the implementation plan.

---

### QW-04: Stagger 02:00 UTC Cron Cluster

**Problem:** Five (or more) heavy scheduled commands all start at exactly `02:00 UTC`:

```
02:00 — quota:enforce-overage       (iterates all tenants)
02:00 — billing:generate-renewal-orders (iterates all active subscriptions)
02:00 — notifications:cleanup       (scans all notifications)
02:00 — file-manager:cleanup        (scans all files)
02:00 — crm:recalculate-lead-scores (recomputes all lead scores)
02:00 — analytics:rebuild           (rebuilds analytics)
```

These commands compete for DB connections, memory, and Redis capacity simultaneously on a single Contabo VPS.

**Fix — Stagger across the 02:00–03:00 window with 10-minute gaps:**

| Time (UTC) | Command | Rationale for Order |
|---|---|---|
| 02:00 | `quota:enforce-overage` | Must run first — downstream commands may depend on quota state |
| 02:10 | `billing:generate-renewal-orders` | Depends on current quota/subscription state |
| 02:20 | `notifications:cleanup` | Lightweight scan, no dependencies |
| 02:30 | `file-manager:cleanup` | Lightweight scan, no dependencies |
| 02:40 | `crm:recalculate-lead-scores` | CPU-intensive, runs after lighter cleanup tasks finish |
| 02:50 | `analytics:rebuild` | Heaviest rebuild, runs last when other commands have completed |

**Implementation rules:**

1. The developer MUST first produce a **complete inventory** of ALL scheduled commands in `routes/console.php` with their current schedule times. The bottleneck report lists the ones above, but there may be others. The implementation plan must include the full list with before/after times.
2. Do NOT change the schedule of commands that run at times OTHER than the 02:00–03:00 window (e.g., the 15-minute interval commands, the 9:00 AM notification commands). Only stagger the clustered midnight/early-morning batch.
3. If the `billing:transition-past-due` command currently runs at `03:00`, leave it at `03:00` — it is already outside the collision window.
4. If `meeting:auto-complete` currently runs at `02:30`, move it to `03:00` or `03:10` to avoid colliding with the newly staggered commands.
5. The stagger order above is a recommendation. If the developer identifies a dependency that requires a different order (e.g., `analytics:rebuild` must run after `crm:recalculate-lead-scores`), document the dependency and adjust accordingly in the implementation plan.

---

### QW-05: Add withoutOverlapping to All Batch Scheduled Commands

**Problem:** Most batch-processing scheduled commands lack `withoutOverlapping()`, meaning a slow run can overlap with the next scheduled execution, causing double-processing and resource contention.

**Fix — Add `->withoutOverlapping()` to every scheduled command that iterates tenants, subscriptions, or large datasets:**

```php
// Pattern
Schedule::command('quota:enforce-overage')->dailyAt('02:00')->withoutOverlapping();
Schedule::command('fee:send-reminders')->everyFifteenMinutes()->withoutOverlapping();
// ... apply to all batch commands
```

**Implementation rules:**

1. The developer MUST audit every `Schedule::command()` entry in `routes/console.php` and categorize each as:
   - **Batch command** (iterates tenants, subscriptions, or large datasets) → MUST have `withoutOverlapping()`
   - **Targeted command** (processes a specific entity or small fixed set) → `withoutOverlapping()` recommended but not required
2. Commands that ALREADY have `withoutOverlapping()` (e.g., `custom-domain:verify-pending`, `custom-domain:reverify-active`) — leave unchanged.
3. The implementation plan must include the complete list of commands with their current and updated chain methods.
4. `withoutOverlapping()` uses the cache (Redis) to acquire a mutex. The default expiration is 24 hours. For commands that run every 15 minutes, add an explicit expiration: `->withoutOverlapping(expiresAt: 30)` (30 minutes). This prevents a crashed command from holding the lock for 24 hours.
   ```php
   Schedule::command('fee:send-reminders')
       ->everyFifteenMinutes()
       ->withoutOverlapping(expiresAt: 30); // Lock expires after 30 min max
   ```
5. For daily commands, the default 24-hour expiration is acceptable.

---

### QW-06: Add Time-Window Filter to buildFeeByBatch

**Problem:** `buildFeeByBatch()` (approximately lines 1383–1421) joins `payment_transactions`, `batch_students`, and `batches` with NO time-window filter. It sums all-time payment collection across all batches on every dashboard load.

**Fix — Add a fiscal year filter to the payment transactions query:**

```php
// Add to the $paidRows query builder chain, BEFORE ->get()
->where('pt.created_at', '>=', Carbon::now()->startOfYear()->toDateString())
```

**Implementation rules:**

1. Apply the filter to BOTH the `$paidRows` (paid transactions) and `$dueRows` (pending fees) queries within `buildFeeByBatch`, if both exist.
2. Use `Carbon::now()->startOfYear()` for the fiscal year boundary. Indian fiscal year runs April–March, but for V1, calendar year is acceptable. If a tenant-configurable fiscal year start is needed, that is a separate feature — not in scope here.
3. The widget title or response key should indicate the time scope. Add a `period` field to the returned array:
   ```php
   return [
       'period' => 'ytd', // Year-to-date
       'period_start' => Carbon::now()->startOfYear()->toDateString(),
       'batches' => $mergedResult,
   ];
   ```
   This allows the frontend to display "Fee Collection (YTD)" without ambiguity.
4. This fix applies to the raw query BEFORE the QW-02 caching wrapper is applied. The execution order is: QW-06 fixes the query, QW-02 caches the result.

---

### QW-07: Replace Correlated Subquery in buildCourseEnrollmentOverview

**Problem:** The `buildCourseEnrollmentOverview` method (approximately line 1141) uses a correlated subquery that runs a `COUNT(*)` on `course_enrollments` for EVERY published course:

```php
// ❌ Correlated subquery — executes N times (once per published course)
->whereRaw(
    '(SELECT COUNT(*) FROM course_enrollments ce WHERE ce.tenant_id = c.tenant_id
     AND ce.course_id = c.id AND ce.status = ?) <= ?',
    ['active', self::LOW_ENROLLMENT_THRESHOLD]
)
```

**Fix — Replace with a LEFT JOIN and HAVING clause:**

```php
// ✅ Single pass — join once, filter by aggregate
$lowEnrollmentCourses = DB::table('courses as c')
    ->leftJoin('course_enrollments as ce', function ($join) {
        $join->on('ce.course_id', '=', 'c.id')
             ->on('ce.tenant_id', '=', 'c.tenant_id')
             ->where('ce.status', '=', 'active');
    })
    ->where('c.tenant_id', $tenantId)
    ->where('c.status', 'published')
    ->groupBy('c.id', 'c.title', 'c.slug')
    ->havingRaw('COUNT(ce.id) <= ?', [self::LOW_ENROLLMENT_THRESHOLD])
    ->select('c.id', 'c.title', 'c.slug', DB::raw('COUNT(ce.id) as enrollment_count'))
    ->get();
```

**Implementation rules:**

1. The developer MUST verify that a composite index exists on `course_enrollments(tenant_id, course_id, status)`. Run:
   ```sql
   SHOW INDEX FROM course_enrollments;
   ```
   If this index does NOT exist, the implementation plan must include adding it:
   ```sql
   CREATE INDEX idx_course_enrollments_tenant_course_status
   ON course_enrollments (tenant_id, course_id, status);
   ```
2. The `LEFT JOIN` approach returns courses with zero enrollments (COUNT = 0), which is correct — courses with no enrollments are "low enrollment" by definition. The correlated subquery approach also handled this case. Verify behavior parity.
3. The `HAVING` clause filters AFTER grouping. The `self::LOW_ENROLLMENT_THRESHOLD` constant must remain unchanged — do not hardcode a number.
4. Test with a tenant that has: (a) courses with zero enrollments, (b) courses at exactly the threshold, (c) courses above the threshold. Verify results match the old correlated subquery output exactly.

---

## 4. Part B — Deferred Structural Fixes (Separate Sprint)

> **Part B items are documented for architectural completeness. They require their own implementation plan and should NOT ship with Part A. Each item describes the problem, the target architecture, and the constraints the implementation plan must respect.**

---

### DEF-01: Session Count Redis Architecture Refactor

**Problem:** `TenantSessionManager.php` (lines 121–132) counts active sessions by: (1) querying ALL active user IDs from the `users` table, then (2) performing N individual Redis `GET` commands to check each user's session cache key. For a tenant with 500 active users: 1 DB query + 500 Redis roundtrips per call. This method is called by the usage dashboard.

**Target Architecture:**

Replace the iterate-and-check pattern with a Redis Set per tenant:

```
Key: tenant_sessions:{tenantId}    (Redis SET)
Members: userId values of users with active sessions
```

**Operations:**
- **Session created/refreshed:** `SADD tenant_sessions:{tenantId} {userId}` + set TTL on member tracking key
- **Session revoked/expired:** `SREM tenant_sessions:{tenantId} {userId}`
- **Count active sessions:** `SCARD tenant_sessions:{tenantId}` — single Redis command, O(1)

**Constraints for the implementation plan:**

1. The refactor touches `TenantSessionManager`, which is integrated with the auth flow. The implementation plan must map every call site of `countActiveTenantSessions()` and `recordSession()` / `revokeSession()` to ensure no path is missed.
2. Session TTL management: when a session expires naturally (user closes browser, JWT expires), the userId must be removed from the Redis set. This requires either: (a) a periodic cleanup command that checks the set members against actual session validity, or (b) using a separate per-user TTL key (`tenant_session_alive:{tenantId}:{userId}`) as a heartbeat, with the cleanup command pruning the set of members whose heartbeat key has expired.
3. The migration from old to new pattern must be backwards-compatible. During deployment, the old pattern and new pattern must produce consistent counts. A one-time backfill of the Redis set from existing session data is required.
4. The `users` table query (`DB::table('users')->where('tenant_id', ...)->where('status', 'active')`) must be eliminated entirely from the session counting path. After this refactor, counting sessions should require ZERO database queries.
5. This refactor must NOT change the public API of `TenantSessionManager` — the `countActiveTenantSessions(int $tenantId): int` signature remains unchanged. Only the internal implementation changes.

**Estimated effort:** 3–4 hours implementation + 1–2 hours testing.

---

### DEF-02: Scheduled Command Queue Dispatch Pattern

**Problem:** Five scheduled commands iterate ALL active tenants serially within the command's `handle()` method:

- `fee:send-reminders` (every 15 minutes)
- `crm:send-follow-up-reminders` (every 15 minutes)
- `crm:process-follow-up-escalations` (every 15 minutes)
- `custom-domain:verify-pending` (every 15 minutes)
- `notifications:process-overages` (schedule TBD)

With 100 tenants at 200ms each: 20 seconds of synchronous execution per run. No timeout guard. The `withoutOverlapping()` added in QW-05 prevents overlap but does not solve the serial execution problem.

**Target Architecture — Dispatcher Pattern:**

```
FeeSendRemindersCommand::handle()
├── Query: SELECT id FROM tenants WHERE status = 'active'
├── For each tenant_id:
│   └── dispatch(new ProcessTenantFeeRemindersJob($tenantId))
└── Log: "Dispatched {count} tenant fee reminder jobs"

ProcessTenantFeeRemindersJob::handle()
├── Receives single $tenantId
├── Runs the existing per-tenant reminder logic
└── Self-contained, retryable, isolated
```

**Constraints for the implementation plan:**

1. The command becomes a dispatcher only — zero processing logic in the command itself.
2. Each dispatched job must be self-contained: it receives a `$tenantId`, resolves the tenant context internally, and processes that single tenant's reminders.
3. Jobs must be dispatched to a dedicated queue name (e.g., `tenant-batch-processing`) to avoid competing with user-facing queue jobs on the default queue.
4. Each job class must implement `ShouldBeUnique` with a `uniqueId()` based on `$tenantId` to prevent duplicate processing if the command runs again before all jobs complete.
5. Job failure must NOT affect other tenants. Each job handles its own exceptions, logs failures, and does not re-throw unless retry is appropriate.
6. The existing per-tenant processing logic must be extracted into a UseCase or Service that the Job calls — NOT copied into the Job class. The Job is a thin wrapper.
7. Apply this pattern to ALL five commands listed above. Do not refactor one and leave the others serial.

**Estimated effort:** 4–6 hours (1 hour per command + shared job infrastructure).

---

### DEF-03: ExpireTrialsUseCase Query-Level Chunking

**Problem:** `ExpireTrialsUseCase.php` (lines 38–53) loads the entire collection of expired trial subscriptions into memory before PHP-side chunking:

```php
$expiredSubscriptions = $this->subscriptionRepository->findExpiredTrials($now);
$chunks = array_chunk($expiredSubscriptions, self::CHUNK_SIZE);
```

If 10,000 trials expire simultaneously (after a long outage or a mass trial campaign), all 10,000 objects are hydrated into PHP memory at once.

**Target Architecture:**

Replace `findExpiredTrials()` with a chunked query method on the repository:

```php
// Repository Interface (Domain layer)
public function chunkExpiredTrials(
    \DateTimeImmutable $asOf,
    int $chunkSize,
    callable $callback
): void;

// Repository Implementation (Infrastructure layer)
public function chunkExpiredTrials(
    \DateTimeImmutable $asOf,
    int $chunkSize,
    callable $callback
): void {
    TenantSubscriptionRecord::query()
        ->where('status', SubscriptionStatus::TRIAL->value)
        ->where('ends_at', '<', $asOf->format('Y-m-d H:i:s'))
        ->chunkById($chunkSize, function ($chunk) use ($callback) {
            $callback($chunk->all());
        });
}
```

**Constraints for the implementation plan:**

1. The `findExpiredTrials()` method on `TenantSubscriptionRepositoryInterface` must be REPLACED by `chunkExpiredTrials()`. Do not keep both — the old method invites misuse.
2. The `chunkById()` method is used instead of `chunk()` because `chunk()` uses OFFSET pagination which skips records when rows are modified during iteration. `chunkById()` uses cursor-based pagination on the primary key.
3. The UseCase's internal processing logic (status transition, audit logging, event dispatch) must work on each chunk independently. No state should accumulate across chunks.
4. The `CHUNK_SIZE` constant remains on the UseCase, not on the repository. The UseCase passes it to the repository method.
5. All existing tests for `ExpireTrialsUseCase` must be updated to work with the chunked interface. The test should verify that the callback is invoked with correctly-sized chunks.

**Estimated effort:** 1–2 hours implementation + 30 minutes test updates.

---

## 5. Implementation Sequence

### Part A — Quick Wins (Single Deployment)

```
Step 1: QW-01 (Memoization)
  └── No dependencies. Pure refactor within EloquentDashboardStatsQuery.
  └── Test: Run existing DashboardStatsTest. All must pass.

Step 2: QW-07 (Correlated subquery replacement)
  └── Depends on: gap analysis confirming index on course_enrollments.
  └── If index missing: create migration FIRST, then apply fix.
  └── Test: Compare output of old vs new query on test dataset.

Step 3: QW-03 (session_type replacement)
  └── Depends on: gap analysis confirming session_type values.
  └── If session_type values don't include assessment types: SKIP (flag in plan).
  └── Test: Verify assessment filtering returns same results.

Step 4: QW-06 (Fee time-window filter)
  └── No dependencies. Additive filter on existing query.
  └── Test: Verify fee summary returns YTD data only.

Step 5: QW-02 (Cache::remember wrappers)
  └── Depends on: QW-01, QW-03, QW-06, QW-07 all applied first.
  └── Rationale: Cache the FIXED queries, not the broken ones.
  └── Test: Verify cache hit/miss behavior. Verify tenant isolation of cache keys.

Step 6: QW-04 + QW-05 (Cron stagger + withoutOverlapping)
  └── No code dependencies. Modifies routes/console.php only.
  └── Test: Verify schedule output via `php artisan schedule:list`.
```

**Critical ordering rule:** QW-02 (caching) MUST be applied LAST within the `EloquentDashboardStatsQuery.php` changes. Caching broken queries locks in bad data for the TTL duration. Fix the queries first, then cache them.

### Part B — Deferred (Separate Deployment, After Part A)

```
Step 1: DEF-03 (ExpireTrials chunking) — lowest risk, good warmup
Step 2: DEF-02 (Command dispatch pattern) — medium complexity, high impact
Step 3: DEF-01 (Session count Redis refactor) — highest complexity, touches auth
```

---

## 6. Gap Analysis Requirements

The implementation plan MUST include these verified findings before any code is written:

### For QW-01 (Memoization)
- [ ] List every occurrence of inline `DB::table('tenant_roles')->where('code', 'student')` queries in `EloquentDashboardStatsQuery.php` with exact line numbers
- [ ] List every occurrence of inline staff role lookups with exact line numbers
- [ ] Confirm `getTeacherCourseIds()` call count and line numbers

### For QW-02 (Caching)
- [ ] List every builder method name in `getDashboardOverview()`, `getTeacherDashboard()`, and `getStaffDeskDashboard()` with exact line numbers
- [ ] Confirm which dashboard methods are user-scoped vs tenant-scoped (affects cache key design)
- [ ] Run `php artisan tinker` → `Cache::getPrefix()` to confirm the cache key prefix and verify no namespace collisions with `dashboard:*` keys

### For QW-03 (session_type)
- [ ] Run `SELECT DISTINCT session_type, COUNT(*) FROM session_instances GROUP BY session_type ORDER BY count DESC;` and include results
- [ ] Confirm which `session_type` values represent assessment/exam/test sessions
- [ ] If no assessment-type values exist in `session_type`, report this as a blocker for QW-03

### For QW-04/QW-05 (Cron stagger)
- [ ] Produce COMPLETE inventory of `routes/console.php`: every `Schedule::command()` entry with current time, chain methods, and whether `withoutOverlapping()` is present
- [ ] Identify any inter-command dependencies (e.g., must command A finish before command B runs?)

### For QW-06 (Fee time-window)
- [ ] Confirm the column name and type used for transaction timestamps in `payment_transactions` (is it `created_at`, `paid_at`, or another column?)
- [ ] Confirm whether `buildFeeByBatch` has both "paid" and "due" sub-queries or only "paid"

### For QW-07 (Correlated subquery)
- [ ] Run `SHOW INDEX FROM course_enrollments;` and include results
- [ ] Confirm whether `idx_course_enrollments_tenant_course_status` (or equivalent) exists
- [ ] If missing, include the index creation migration in the implementation plan

---

## 7. Test Plan

### Part A Tests

| Test | Type | What It Verifies |
|---|---|---|
| `DashboardStatsMemoizationTest` | Unit | Calling `getStudentRoleIds()` twice returns same result with only 1 DB query (use `DB::getQueryLog()`) |
| `DashboardStatsCacheTest` | Integration | First call populates cache, second call returns cached result with 0 DB queries. Verify cache key contains `tenantId`. Verify different tenants get different cache entries. |
| `DashboardStatsCacheTenantIsolationTest` | Integration | Tenant A's cache NEVER returns Tenant B's data. Populate cache for Tenant A, request as Tenant B, verify miss + independent data. |
| `DashboardStatsSessionTypeFilterTest` | Integration | Assessment widget returns correct sessions when filtered by `session_type` instead of LIKE. Test with sessions of type `offline_class`, `assessment`, `exam` — verify only assessment types are returned. |
| `DashboardStatsFeeWindowTest` | Integration | `buildFeeByBatch` returns only current-year transactions. Insert transactions from previous year and current year, verify only current year appears in results. |
| `DashboardStatsCorrelatedSubqueryTest` | Integration | `buildCourseEnrollmentOverview` low-enrollment detection returns correct courses. Test with: 0 enrollments, threshold enrollments, above-threshold enrollments. |
| `ScheduleCommandListTest` | Unit | `php artisan schedule:list` output shows staggered times and `withoutOverlapping` on all batch commands. |

### Part B Tests (To Be Written with Part B Implementation Plan)

| Test | Type | What It Verifies |
|---|---|---|
| `TenantSessionManagerRedisSetTest` | Integration | `SADD`/`SREM`/`SCARD` operations produce correct session counts |
| `TenantSessionManagerMigrationTest` | Integration | Backfill from old pattern populates Redis set correctly |
| `FeeReminderDispatcherTest` | Integration | Command dispatches N jobs for N active tenants, jobs process independently |
| `ExpireTrialsChunkingTest` | Unit | Callback invoked with correct chunk sizes, no full collection in memory |

---

## 8. Quality Gates

### Part A — ALL Must Pass Before Deployment

- [ ] All existing `DashboardStatsTest` tests pass with zero failures
- [ ] All existing test suites pass (`php artisan test`) — zero regressions
- [ ] PHPStan Level 5 passes with zero new errors
- [ ] Cache keys are tenant-isolated — verified by `DashboardStatsCacheTenantIsolationTest`
- [ ] No `LIKE '%...'` patterns remain in `EloquentDashboardStatsQuery.php` (grep verification)
- [ ] `routes/console.php` shows no two batch commands scheduled at the same minute
- [ ] Every batch command in `routes/console.php` has `withoutOverlapping()`
- [ ] `buildFeeByBatch` query includes a time-window filter (verified by code review)
- [ ] No correlated subqueries remain in `EloquentDashboardStatsQuery.php` (verified by code review)
- [ ] Manual verification: load dashboard for a test tenant, confirm response time improvement (before/after timing logged)

### Part B — Quality Gates Defined in Part B Implementation Plan

---

## 9. Constraints & Reminders

### Architecture Constraints

- Follow the existing DDD structure. These fixes are all in the Infrastructure layer (`EloquentDashboardStatsQuery` is an Infrastructure Query class) and the scheduler config (`routes/console.php`). No Domain or Application layer changes.
- Do NOT introduce new Service classes, new Repositories, or new Interfaces for Part A. The fixes are in-place modifications to existing files.
- Do NOT add event-driven cache invalidation for dashboard caches. Short TTLs are the invalidation strategy for Part A.
- The `Cache::remember()` calls use the default Redis cache store. Do NOT specify a different store.

### Docker Environment

- Container uses Alpine Linux — use `sh` not `bash` in `docker exec` commands.
- Container name: `ubotz_backend`
- Example: `docker exec -it ubotz_backend sh -c "php artisan schedule:list"`

### What NOT to Do

- Do NOT create new database migrations for Part A (unless QW-07 gap analysis reveals a missing index — that is the only exception).
- Do NOT modify any Controller, UseCase, FormRequest, or Resource class.
- Do NOT add new API endpoints.
- Do NOT change the response structure of the dashboard stats API. The cached data must be identical in shape to the uncached data.
- Do NOT use `Cache::forever()` — all dashboard caches must have explicit finite TTLs.
- Do NOT use `Cache::tags()` — Redis in cluster mode does not support tags. Use explicit key naming with `Cache::forget()` if targeted invalidation is ever needed in the future.
- Do NOT refactor the `EloquentDashboardStatsQuery` class structure (e.g., splitting into multiple classes). That is a separate improvement and out of scope for this performance fix.
- Do NOT implement Part B items. Document them in the implementation plan's "Future Work" section but do not implement them.

---

## 10. Risk Register

| # | Risk | Impact | Severity | Mitigation |
|---|---|---|---|---|
| R-01 | `session_type` column values do not include assessment types | QW-03 cannot be applied | MEDIUM | Gap analysis query (§6) detects this. If confirmed, skip QW-03 and flag for timetable team to fix session type assignment. |
| R-02 | Missing index on `course_enrollments(tenant_id, course_id, status)` causes QW-07 LEFT JOIN to perform worse than the correlated subquery | Dashboard regression | HIGH | Gap analysis (§6) checks this. If missing, add index migration. EXPLAIN ANALYZE both queries before shipping. |
| R-03 | Cache key collision between tenants | Cross-tenant data leakage | CRITICAL | All cache keys include `$tenantId`. Verified by `DashboardStatsCacheTenantIsolationTest`. |
| R-04 | `withoutOverlapping()` lock not released after command crash | Command permanently blocked | MEDIUM | Set explicit `expiresAt` on 15-minute commands (30 min expiry). Daily commands use default 24-hour expiry. |
| R-05 | Staggered cron times push last command past 03:00, colliding with `billing:transition-past-due` | Resource contention returns | LOW | Gap analysis confirms actual command durations. If any command takes >10 minutes, increase stagger gaps. |
| R-06 | Caching dashboard data with 60s TTL causes stale attention items (e.g., overdue fee alert disappears for 60 seconds after payment) | Minor UX confusion | LOW | Acceptable trade-off. 60 seconds of staleness is not user-visible for attention items. No mitigation needed. |

---

## 11. What This Document Does NOT Include

- **Materialized summary tables** (e.g., `batch_fee_summaries`, `daily_dashboard_snapshots`) — these are a future performance phase if dashboard data volume outgrows the cached-query approach.
- **Frontend changes** — no dashboard UI modifications. The API response shape is unchanged.
- **Read replica routing** — splitting dashboard reads to a MySQL replica is a future infrastructure decision, not a code fix.
- **Query builder refactoring** — splitting `EloquentDashboardStatsQuery` (1,486 lines) into smaller query classes is a maintainability improvement, not a performance fix. Out of scope.
- **APM/monitoring instrumentation** — adding query timing metrics, slow query logging, or dashboard response time tracking. Recommended as a future improvement but not in scope here.
