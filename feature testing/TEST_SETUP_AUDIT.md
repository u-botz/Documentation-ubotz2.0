# Test Setup Audit Report

> **Date:** 2026-03-06  
> **Purpose:** Document the current test infrastructure so test **files** are written to match it — not the other way around.

---

## Executive Summary

The test setup is **sound** in design but **fragile in practice** because test files use it inconsistently. The setup should NOT be changed. Instead, every test file must follow the rules documented below.

> [!CAUTION]
> The **one exception** is a genuine bug in `PlatformSettingsSeeder.php` (line 63) that uses MySQL-only SQL syntax and breaks SQLite :memory: tests. This is the only seeder-level fix needed — everything else is a test file problem.

---

## 1. Test Infrastructure Overview

### 1.1 Database Engine

| Setting | Value | Set In |
|---|---|---|
| DB_CONNECTION | `sqlite` | `phpunit.xml` (`<server>` tag) |
| DB_DATABASE | `:memory:` | `phpunit.xml` (`<server>` tag) |

All tests run against **SQLite in-memory**. This means:
- ❌ No MySQL-specific syntax (`NOW()`, `COALESCE` on raw column refs, `ENUM` types)
- ❌ No foreign key enforcement (SQLite doesn't enforce FKs by default)
- ✅ Fast, isolated, no Docker dependency for test execution

### 1.2 Migration Loading

Migrations are loaded from **three** directories via [AppServiceProvider.php](file:///c:/Users/sayan/lms/Ubotz_2.0/backend/app/Providers/AppServiceProvider.php#L118-L121):

```
database/migrations/        (default — currently empty)
database/migrations/central/ (29 files — platform tables)
database/migrations/tenant/  (42 files — tenant-scoped tables)
```

All 71 migrations run on the **single SQLite :memory:** database. There is no multi-database split in tests.

### 1.3 Base Test Case

[TestCase.php](file:///c:/Users/sayan/lms/Ubotz_2.0/backend/tests/TestCase.php) does three things in `setUp()`:

1. **Disables rate limiting** — `withoutMiddleware(ThrottleRequests::class)`
2. **Swaps payment gateway** — Binds `FakePaymentGateway` into the container
3. **Fixes JWT secret** — Sets `config('jwt.secret')` from `env()` if cached config has `null`

### 1.4 Available Test Traits

| Trait | Purpose | Key Methods |
|---|---|---|
| [AuthenticatesWithJwt](file:///c:/Users/sayan/lms/Ubotz_2.0/backend/tests/Traits/AuthenticatesWithJwt.php) | Real JWT tokens for admin/tenant API guards | `getJsonAsAdmin()`, `postJsonAsAdmin()`, `createAdminWithAuthority(int)`, `tokenForTenantUser()` |
| [ActsAsTenant](file:///c:/Users/sayan/lms/Ubotz_2.0/backend/tests/Traits/ActsAsTenant.php) | Set/clear `TenantContext` | `setTenantContext(int)`, `createTenantWithContext()`, auto-clears in `tearDown()` |
| [SeedsTestCapabilities](file:///c:/Users/sayan/lms/Ubotz_2.0/backend/tests/Traits/SeedsTestCapabilities.php) | Seed capabilities + wire to roles | `seedCapabilitiesForRole(int, string[])` |

### 1.5 Support Classes

| Class | Purpose |
|---|---|
| [FrozenClock](file:///c:/Users/sayan/lms/Ubotz_2.0/backend/tests/Support/FrozenClock.php) | Implements `ClockInterface` with a fixed `DateTimeImmutable` |
| [FakePaymentGateway](file:///c:/Users/sayan/lms/Ubotz_2.0/backend/tests/Fakes/FakePaymentGateway.php) | No-op payment gateway bound globally in `TestCase::setUp()` |

### 1.6 Factories Available

8 model factories exist in `database/factories/`:

| Factory | Model |
|---|---|
| `TenantFactory` | `TenantRecord` |
| `UserFactory` | `UserRecord` |
| `CourseRecordFactory` | `CourseRecord` |
| `ChapterRecordFactory` | `ChapterRecord` |
| `CourseFileRecordFactory` | `CourseFileRecord` |
| `TextLessonRecordFactory` | `TextLessonRecord` |
| `SubscriptionPlanRecordFactory` | `SubscriptionPlanRecord` |
| `TenantSubscriptionRecordFactory` | `TenantSubscriptionRecord` |

---

## 2. The Seeder Chain (`$seed = true`)

When a test sets `protected $seed = true`, Laravel runs `DatabaseSeeder`, which calls **12 seeders in strict order**:

```
1. RoleSeeder               — 7 admin roles (L1-L7)
2. PermissionSeeder          — 27 platform permissions
3. RolePermissionSeeder      — wires roles ↔ permissions
4. AdminSeeder               — L1 admin + L2-L7 test admins
5. TenantCapabilitySeeder    — 22 tenant capabilities
6. TenantSeeder              — 4 tenants (Demo School, Ubotz Academy, School A, School B)
7. TenantRoleCapabilitySeeder — tenant roles + capability assignments
8. SubscriptionPlanSeeder    — 3 plans (trial_14, basic, pro)
9. TenantUserSeeder          — users for School A & B with role assignments
10. CourseSeeder             — 25 courses for Tenant A, 5 for Tenant B
11. ExamHierarchySeeder     — exam/subject/chapter hierarchy for School A
12. PlatformSettingsSeeder   — 7 quota settings ⚠️ BROKEN ON SQLITE
```

> [!IMPORTANT]
> **Only 6 out of 83 test files use `$seed = true`.**  
> The vast majority of tests create their own data in `setUp()` using factories, `DB::table()` inserts, or model `::create()` calls. This is the **intended pattern** for most tests.

### 2.1 Tests Currently Using `$seed = true`

| Test File | Why It Needs Seeds |
|---|---|
| `AdminPolicyTest` | Tests Gate definitions that rely on seeded roles/permissions |
| `StaffManagementTest` | Tests staff CRUD against seeded admin hierarchy |
| `UpdateStaffTest` | Tests staff updates against seeded roles |
| `PlatformSettingsTest` | Tests platform settings API (relies on seeded settings) |
| `TenantUsageControllerTest` | Tests usage API (relies on seeded tenants + settings) |
| `TenantDashboardUsageControllerTest` | Tests tenant-side usage view |

---

## 3. Root Causes of Test Failures

### 🔴 Problem 1: `PlatformSettingsSeeder` Uses MySQL-Only Syntax

**This is the ONLY setup bug.** All other failures are test file problems.

```php
// PlatformSettingsSeeder.php:63 — BROKEN ON SQLITE
'created_at' => DB::raw('COALESCE(created_at, NOW())')
```

SQLite's `updateOrInsert` method sees `created_at` in the column list but the `COALESCE(created_at, NOW())` expression references a column that doesn't exist in an INSERT context. SQLite throws:

```
General error: 1 no such column: created_at
```

**Impact:** Every test with `$seed = true` fails at seeder #12.

**Fix (only allowed change to setup):** Replace line 63 with a simple `$now` timestamp:

```php
'created_at' => $now,
```

The COALESCE pattern was intended to preserve existing `created_at` on update, but `updateOrInsert` already handles this — it only sets `created_at` during an INSERT (when the row doesn't exist). On UPDATE, the `created_at` column is not touched because it's in the "update values" array, not the "match" array.

---

### 🟡 Problem 2: `AdminSeeder` Aborts Silently Without Config

`AdminSeeder` reads `config('seeding.admin_email')` and `config('seeding.admin_password')`. If these are not in `.env`, the seeder prints a warning and **returns early** — meaning no L1 admin is created, and the L2-L7 admins also don't get seeded.

**Impact:** Tests using `$seed = true` that expect specific seeded admins (e.g., `l5@ubotz.com`) may find no admins at all.

**Fix for test files:** Tests should **not rely on AdminSeeder's hardcoded emails**. Instead, use `$this->createAdminWithAuthority(50)` from the `AuthenticatesWithJwt` trait to create admins dynamically. This is already what most tests do correctly.

For the 6 files using `$seed = true`, they should also create their admins via `createAdminWithAuthority()` and not assume specific emails exist from the seeder.

---

### 🟡 Problem 3: Tests Incorrectly Relying on Seeded Data IDs

Some tests hardcode `tenant_id => 1` or `'/api/platform/tenants/1/usage'` expecting the first seeded tenant to have ID 1.

**Why it breaks:** SQLite auto-increment may not always produce predictable IDs, and if AdminSeeder aborts early, downstream seeders (TenantSeeder, etc.) may also produce different IDs.

**Fix for test files:** Create test data in `setUp()` and use the returned model's `->id` in URLs and assertions.

---

### 🟡 Problem 4: Missing Role/Permission Setup in Non-Seeded Tests

Tests that **don't** use `$seed = true` but use `createAdminWithAuthority()` need `admin_roles` in the database. The trait queries `DB::table('admin_roles')->where('code', $roleSlug)->first()`. Without seeding, this returns `null`.

**Fix for test files:** Either:
- (a) Set `$seed = true` to get the full seeder chain, **or**
- (b) Run only the seeders you need in `setUp()`:

```php
protected function setUp(): void
{
    parent::setUp();
    $this->seed(RoleSeeder::class);
    $this->seed(PermissionSeeder::class);
    $this->seed(RolePermissionSeeder::class);
}
```

---

### 🟡 Problem 5: Tenant Context Not Set for Tenant-Scoped Operations

Tests that create/query tenant-scoped models (courses, users, quizzes) without setting `TenantContext` will silently get wrong data or constraints.

**Fix for test files:** Use the `ActsAsTenant` trait:

```php
use RefreshDatabase, AuthenticatesWithJwt, ActsAsTenant;

protected function setUp(): void
{
    parent::setUp();
    $this->tenant = $this->createTenantWithContext();
}
```

---

### 🟡 Problem 6: Backed Enum Misuse

Already documented in [TEST_FIX_GUIDE.md](file:///c:/Users/sayan/lms/Ubotz_2.0/backend/documentation/TEST_FIX_GUIDE.md). PHP 8.1 backed enums use `::from()` / `->value`, not constructors or `fromString()`.

---

## 4. Decision Tree: Which Setup Pattern to Use

```
Does your test need platform admin authentication?
├─ YES → use AuthenticatesWithJwt trait
│   ├─ Need roles/permissions in DB?
│   │   ├─ YES → seed RoleSeeder + PermissionSeeder + RolePermissionSeeder in setUp()
│   │   │        OR set $seed = true (heavier but complete)
│   │   └─ NO  → createAdminWithAuthority() works without roles
│   │            (admin gets authority_level directly, role assignment is optional)
│   └─ Need specific seeded data (tenants, plans, settings)?
│       ├─ YES → $seed = true (but fix PlatformSettingsSeeder first)
│       └─ NO  → create data in setUp() with factories
│
├─ NO, but testing tenant-scoped features
│   ├─ Use ActsAsTenant trait
│   ├─ Use SeedsTestCapabilities if testing capability-gated endpoints
│   └─ Create tenant + user + role in setUp()
│
└─ NO, unit testing domain logic
    └─ No database traits needed. Mock dependencies.
```

---

## 5. Canonical Test File Template

### Platform Admin API Test (most common)

```php
<?php

declare(strict_types=1);

namespace Tests\Feature\SuperAdminDashboard;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;
use Tests\Traits\AuthenticatesWithJwt;

class ExamplePlatformTest extends TestCase
{
    use RefreshDatabase, AuthenticatesWithJwt;

    // Option A: Full seeder chain (when you need lots of reference data)
    // protected $seed = true;

    // Option B: Selective seeding (lighter, faster)
    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(\Database\Seeders\RoleSeeder::class);
        $this->seed(\Database\Seeders\PermissionSeeder::class);
        $this->seed(\Database\Seeders\RolePermissionSeeder::class);
    }

    public function test_example(): void
    {
        $admin = $this->createAdminWithAuthority(50); // L5 Tenant Ops

        $response = $this->getJsonAsAdmin($admin, '/api/platform/some-endpoint');

        $response->assertStatus(200);
    }
}
```

### Tenant Dashboard API Test

```php
<?php

declare(strict_types=1);

namespace Tests\Feature\TenantAdminDashboard;

use App\Infrastructure\Persistence\Shared\TenantRecord;
use App\Infrastructure\Persistence\Shared\UserRecord;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;
use Tests\Traits\AuthenticatesWithJwt;
use Tests\Traits\ActsAsTenant;
use Tests\Traits\SeedsTestCapabilities;

class ExampleTenantTest extends TestCase
{
    use RefreshDatabase, AuthenticatesWithJwt, ActsAsTenant, SeedsTestCapabilities;

    private TenantRecord $tenant;
    private UserRecord $user;

    protected function setUp(): void
    {
        parent::setUp();
        
        // Create tenant and set context
        $this->tenant = $this->createTenantWithContext();
        
        // Create user and role
        $role = \DB::table('tenant_roles')->insertGetId([
            'tenant_id' => $this->tenant->id,
            'code' => 'admin',
            'display_name' => 'Admin',
            'hierarchy_level' => 80,
            'is_system' => true,
            'is_active' => true,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $this->user = UserRecord::factory()->create([
            'tenant_id' => $this->tenant->id,
        ]);
        
        // Wire capabilities
        $this->seedCapabilitiesForRole($role, ['course.view', 'course.create']);
    }
}
```

---

## 6. Summary of Required Changes

| What | Action | Who Changes |
|---|---|---|
| `PlatformSettingsSeeder.php:63` | Replace `COALESCE` with `$now` | **Seeder fix** (the only setup change allowed) |
| Tests hardcoding `tenant_id => 1` | Use dynamically created IDs | **Test file fix** |
| Tests relying on `AdminSeeder` emails | Use `createAdminWithAuthority()` | **Test file fix** |
| Tests missing role/permission seeding | Add selective `$this->seed()` calls in `setUp()` | **Test file fix** |
| Tests missing `TenantContext` | Add `ActsAsTenant` trait | **Test file fix** |
| Enum misuse (`new Enum()`, `fromString()`) | Use `::from()` / `->value` | **Test file fix** |

> [!NOTE]
> The test setup infrastructure (`phpunit.xml`, `TestCase.php`, traits, seeders 1-11) is architecturally correct. The failures stem from test files not following the established patterns, and one MySQL-specific line in seeder #12.
