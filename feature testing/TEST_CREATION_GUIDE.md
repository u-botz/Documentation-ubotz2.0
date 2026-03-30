# Test Creation Guide - UBOTZ 2.0

This guide covers everything a developer needs to know to write correct, reliable tests for the UBOTZ multi-tenant platform.

---

## Table of Contents

1. [Quick Reference](#1-quick-reference)
2. [Directory Structure](#2-directory-structure)
3. [Running Tests](#3-running-tests)
4. [Base TestCase](#4-base-testcase)
5. [Test Traits](#5-test-traits)
6. [Feature Test Patterns](#6-feature-test-patterns)
7. [Unit Test Patterns](#7-unit-test-patterns)
8. [Factories](#8-factories)
9. [Exception-to-HTTP Mapping](#9-exception-to-http-mapping)
10. [Critical Pitfalls](#10-critical-pitfalls)
11. [Checklist for New Features](#11-checklist-for-new-features)
12. [Complete Example](#12-complete-example)

---

## 1. Quick Reference

### Model Namespaces

There is **no `App\Models\`** namespace. All Eloquent models live under `App\Infrastructure\Persistence\`:

| Model | Class |
|-------|-------|
| Tenant | `App\Infrastructure\Persistence\Shared\TenantRecord` |
| User (tenant) | `App\Infrastructure\Persistence\Shared\UserRecord` |
| Admin (platform) | `App\Infrastructure\Persistence\Shared\AdminRecord` |
| Tenant Role | `App\Infrastructure\Persistence\TenantAdminDashboard\TenantRoleRecord` |
| Role Assignment | `App\Infrastructure\Persistence\TenantAdminDashboard\UserRoleAssignmentRecord` |
| Audit Log | `App\Infrastructure\Persistence\Shared\TenantAuditLogRecord` |
| Category | `App\Infrastructure\Persistence\TenantAdminDashboard\Category\CategoryRecord` |
| Course | `App\Infrastructure\Persistence\TenantAdminDashboard\Course\CourseRecord` |

### Required Traits (Feature Tests)

| Trait | When to Use |
|-------|-------------|
| `RefreshDatabase` | Always. Wraps each test in a transaction for isolation. |
| `AuthenticatesWithJwt` | Any test making HTTP requests to JWT-protected endpoints. |
| `SeedsTestCapabilities` | Any test hitting tenant endpoints guarded by `tenant.capability`. |
| `ActsAsTenant` | When you switch tenant context mid-test or need defensive tearDown. |

### Authentication Pattern

```php
// Tenant user
$token = $this->tokenForTenantUser($user, $tenant);
$this->withHeaders(['Authorization' => "Bearer {$token}"])
    ->postJson('/api/tenant/resource', $data);

// Platform admin
$token = $this->tokenForAdmin($admin);
$this->withHeaders(['Authorization' => "Bearer {$token}"])
    ->getJson('/api/platform/resource');
```

> **Never use `actingAs()` for JWT guards.** It does not issue a real JWT and the middleware rejects the request with 401.

---

## 2. Directory Structure

```
tests/
├── TestCase.php                        # Base class — all tests extend this
├── Traits/
│   ├── ActsAsTenant.php               # TenantContext lifecycle management
│   ├── AuthenticatesWithJwt.php        # Real JWT token generation
│   └── SeedsTestCapabilities.php       # Capability + role seeding
├── Fakes/
│   └── FakePaymentGateway.php          # Payment stub (auto-bound in TestCase)
├── Feature/                            # Full HTTP request/response tests
│   ├── TenantAdminDashboard/           # Tenant-scoped feature tests
│   │   ├── Category/
│   │   ├── Course/
│   │   ├── Quiz/
│   │   ├── Role/
│   │   ├── User/
│   │   ├── Stats/
│   │   ├── Settings/
│   │   ├── AuditLog/
│   │   ├── Batch/
│   │   ├── Meeting/                   # Availability CRUD/overrides, student book & request, host respond/outcome, admin stats
│   │   └── Timetable/                 # Venues, holidays, templates, slots, session instances
│   ├── SuperAdminDashboard/            # Platform-level feature tests
│   ├── SecurityBoundary/              # Cross-tenant isolation tests
│   ├── Subscription/
│   ├── TenantAuth/
│   ├── Tenancy/
│   └── Authorization/
└── Unit/                               # Isolated logic tests (no HTTP, no DB)
    ├── Domain/                         # Entity, ValueObject, Service tests
    │   └── Meeting/                    # Availability overlap detector, slot generation (pure domain)
    ├── Application/                    # Use case tests with mocked repos
    └── Http/                           # Middleware/trait tests
```

**Rule**: Test directory structure mirrors `app/` structure. Place tests in the domain they belong to.

---

## 3. Running Tests

All commands run through Docker. Never run `php artisan test` directly on the host.

```powershell
# All tests
docker exec -it ubotz_backend php artisan test

# Specific test file
docker exec -it ubotz_backend php artisan test --filter=CategoryCrudTest

# Specific test method
docker exec -it ubotz_backend php artisan test --filter=test_it_can_create_a_category

# By test suite
docker exec -it ubotz_backend php artisan test --testsuite=Unit
docker exec -it ubotz_backend php artisan test --testsuite=Feature
```

Tests run against **SQLite in-memory** (configured in `phpunit.xml`). Each test gets a fresh database via `RefreshDatabase`.

---

## 4. Base TestCase

Every test class extends `Tests\TestCase`, which provides:

```php
abstract class TestCase extends BaseTestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        // 1. Disable rate limiting globally
        //    Re-enable via $this->withMiddleware(ThrottleRequests::class)
        //    for rate-limit-specific tests
        $this->withoutMiddleware(ThrottleRequests::class);

        // 2. Swap payment gateway with fake
        $this->app->instance(
            PaymentGatewayInterface::class,
            new FakePaymentGateway()
        );

        // 3. Ensure JWT secret is available (bypasses config cache)
        if (is_null(config('jwt.secret'))) {
            config()->set('jwt.secret', env('JWT_SECRET'));
        }
    }

    // Convenience method
    protected function setTenant(int $tenantId): void
    {
        app(TenantContext::class)->setId($tenantId);
    }
}
```

---

## 5. Test Traits

### 5.1 AuthenticatesWithJwt

**Purpose**: Generate real signed JWT tokens for authenticated test requests.

**Why**: Laravel's `actingAs($user, 'tenant_api')` does NOT work with JWT-based guards. The `auth:tenant_api` middleware validates the `Authorization: Bearer` header via JWTAuth. Without a real token, the middleware returns 401.

**Key Methods**:

```php
// Generate JWT for a tenant user
$token = $this->tokenForTenantUser(UserRecord $user, TenantRecord $tenant): string;

// Generate JWT for a platform admin
$token = $this->tokenForAdmin(AdminRecord $admin): string;

// Convenience request methods (admin)
$this->getJsonAsAdmin($admin, '/api/platform/resource');
$this->postJsonAsAdmin($admin, '/api/platform/resource', $data);
$this->putJsonAsAdmin($admin, '/api/platform/resource', $data);
$this->deleteJsonAsAdmin($admin, '/api/platform/resource');

// Convenience request methods (tenant user)
$this->getJsonAsTenantUser($user, $tenant, '/api/tenant/resource');
$this->postJsonAsTenantUser($user, $tenant, '/api/tenant/resource', $data);
$this->putJsonAsTenantUser($user, $tenant, '/api/tenant/resource', $data);
$this->deleteJsonAsTenantUser($user, $tenant, '/api/tenant/resource');

// Create admin with specific authority level
$admin = $this->createAdminWithAuthority(90); // L1 Platform Owner
```

**How it works**: `tokenForTenantUser()` calls `auth('tenant_api')->login($user)` which generates a real signed JWT containing `tenant_id` in its custom claims. The `ResolveTenantFromToken` middleware then extracts `tenant_id` from the JWT payload during the request, setting `TenantContext` for the entire request lifecycle.

### 5.2 ActsAsTenant

**Purpose**: Safely manage the `TenantContext` scoped singleton across tests.

**Why**: `TenantContext::setId()` is immutable — calling it twice throws `LogicException`. If a test fails mid-execution, the context may survive into the next test. This trait provides `clear()` + `setId()` helpers and a defensive `tearDown()`.

**Key Methods**:

```php
// Clear previous context, then set new one (safe to call multiple times)
$this->setTenantContext(int $tenantId): void;

// Create active tenant and immediately set context
$tenant = $this->createTenantWithContext(): TenantRecord;

// Clears tenant context (called automatically after every test)
// Prevents cascade LogicException failures
protected function tearDown(): void;
```

**When to use**: When you need to switch tenant context within a single test (e.g., creating data for two tenants), or as a safety net against context leaks.

### 5.3 SeedsTestCapabilities

**Purpose**: Seed `tenant_capabilities` and `tenant_role_capabilities` tables.

**Why**: Tenant API endpoints use the `tenant.capability:xxx` middleware. Without seeded capabilities, every request returns 403.

**Key Method**:

```php
// Seed capabilities and assign them to a role (idempotent)
$this->seedCapabilitiesForRole(int $roleId, array $capabilityCodes): void;

// Example
$this->seedCapabilitiesForRole($role->id, [
    'course.view',
    'course.create',
    'course.edit',
    'category.manage',
]);
```

---

## 6. Feature Test Patterns

### 6.1 Standard setUp Pattern (Tenant CRUD Test)

```php
class MyCrudTest extends TestCase
{
    use RefreshDatabase, AuthenticatesWithJwt, SeedsTestCapabilities;

    private TenantRecord $tenant;
    private UserRecord $user;
    private int $tenantId;

    protected function setUp(): void
    {
        parent::setUp();

        // 1. Clear previous tenant context
        app(TenantContext::class)->clear();

        // 2. Create active tenant
        $this->tenant = TenantRecord::factory()->create(['status' => 'active']);
        $this->tenantId = $this->tenant->id;

        // 3. Set tenant context (required for BelongsToTenant trait on models)
        app(TenantContext::class)->setId($this->tenantId);

        // 4. Create user
        $this->user = UserRecord::factory()->create([
            'tenant_id' => $this->tenantId,
            'status'    => 'active',
            'force_password_reset' => false,
        ]);

        // 5. Create role using Eloquent (BelongsToTenant auto-assigns tenant_id)
        $role = TenantRoleRecord::create([
            'tenant_id'       => $this->tenantId,
            'code'            => 'admin',
            'hierarchy_level' => 100,
            'display_name'    => 'Admin',
        ]);

        // 6. Assign role to user
        UserRoleAssignmentRecord::create([
            'tenant_id' => $this->tenantId,
            'user_id'   => $this->user->id,
            'role_id'   => $role->id,
        ]);

        // 7. Seed capabilities required by the endpoints under test
        $this->seedCapabilitiesForRole($role->id, ['my_resource.manage']);
    }
}
```

### 6.2 Making Authenticated Requests

```php
public function test_it_can_create_a_resource(): void
{
    // Generate real JWT (per-test, not in setUp)
    $token = $this->tokenForTenantUser($this->user, $this->tenant);

    $response = $this->withHeaders(['Authorization' => "Bearer {$token}"])
        ->postJson('/api/tenant/my-resource', [
            'title' => 'My Resource',
        ]);

    $response->assertStatus(201)
        ->assertJsonStructure(['data' => ['id']]);

    $this->assertDatabaseHas('my_resources', [
        'tenant_id' => $this->tenantId,
        'title'     => 'My Resource',
    ]);
}
```

### 6.3 Meeting system (tenant)

| Area | Path prefix | Capability middleware |
|------|-------------|------------------------|
| Availability CRUD / overrides | `POST|GET|PUT /api/tenant/meetings/availabilities…` | `meeting.manage_availability` |
| Host bookings (respond, link, outcome, cancel) | `/api/tenant/meetings/bookings…` | `meeting.manage_bookings` |
| Admin list + stats | `/api/tenant/meetings/admin/…` | `meeting.view_all` |
| Student (hosts, slots, book, request, my-bookings) | `/api/tenant/meetings/student/…` | **None** (any authenticated tenant user) |

Use **`Carbon::setTestNow()`** (or `$this->travelTo()`) when testing book/cancel/outcome: those flows depend on “now” vs slot or meeting end time. Reference: `MeetingAvailabilityFeatureTest`, `MeetingBookingFeatureTest`. Domain-only tests: `tests/Unit/Domain/Meeting/MeetingAvailabilityDomainTest.php`.

### 6.4 Event Assertions

```php
protected function setUp(): void
{
    parent::setUp();

    // ONLY fake specific domain events — never blanket Event::fake()
    Event::fake([
        ResourceCreated::class,
        ResourceUpdated::class,
    ]);

    // ... rest of setUp
}

public function test_event_is_dispatched(): void
{
    // ... make request ...

    Event::assertDispatched(ResourceCreated::class);
    Event::assertNotDispatched(ResourceUpdated::class);
}
```

### 6.5 Cross-Tenant Isolation Test

```php
public function test_cannot_access_other_tenant_data(): void
{
    // Create "enemy" tenant data via raw DB insert
    // (Eloquent BelongsToTenant hook would override tenant_id)
    $enemyResourceId = DB::table('my_resources')->insertGetId([
        'tenant_id'  => $this->tenantB->id,
        'title'      => 'Enemy Resource',
        'slug'       => 'enemy-resource',
        'created_at' => now(),
        'updated_at' => now(),
    ]);

    $token = $this->tokenForTenantUser($this->user, $this->tenantA);

    // Must return 404 (not 403) to prevent enumeration
    $this->withHeaders(['Authorization' => "Bearer {$token}"])
        ->getJson("/api/tenant/my-resources/{$enemyResourceId}")
        ->assertStatus(404);

    $this->withHeaders(['Authorization' => "Bearer {$token}"])
        ->putJson("/api/tenant/my-resources/{$enemyResourceId}", ['title' => 'Hacked'])
        ->assertStatus(404);

    $this->withHeaders(['Authorization' => "Bearer {$token}"])
        ->deleteJson("/api/tenant/my-resources/{$enemyResourceId}")
        ->assertStatus(404);
}
```

### 6.6 Platform Admin Test

```php
class StaffManagementTest extends TestCase
{
    use RefreshDatabase, AuthenticatesWithJwt;

    protected $seed = true; // Seeds admin_roles table

    private AdminRecord $platformOwner;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed([RoleSeeder::class]);

        $this->platformOwner = $this->createAdminWithAuthority(90); // L1
    }

    public function test_platform_owner_can_list_staff(): void
    {
        $response = $this->getJsonAsAdmin(
            $this->platformOwner,
            '/api/platform/staff'
        );

        $response->assertStatus(200)
            ->assertJsonStructure(['data']);
    }
}
```

### 6.7 Authorization/Capability Test

```php
public function test_user_without_capability_gets_403(): void
{
    // Create user with NO capabilities
    $viewer = UserRecord::factory()->create([
        'tenant_id' => $this->tenantId,
        'status'    => 'active',
    ]);

    $viewerRole = TenantRoleRecord::create([
        'tenant_id'    => $this->tenantId,
        'code'         => 'viewer',
        'display_name' => 'Viewer',
    ]);

    UserRoleAssignmentRecord::create([
        'tenant_id' => $this->tenantId,
        'user_id'   => $viewer->id,
        'role_id'   => $viewerRole->id,
    ]);

    // Seed only 'read' capability, NOT 'manage'
    $this->seedCapabilitiesForRole($viewerRole->id, ['my_resource.view']);

    $token = $this->tokenForTenantUser($viewer, $this->tenant);

    // Write endpoint requires 'my_resource.manage'
    $this->withHeaders(['Authorization' => "Bearer {$token}"])
        ->postJson('/api/tenant/my-resources', ['title' => 'Test'])
        ->assertStatus(403);
}
```

---

## 7. Unit Test Patterns

Unit tests isolate domain logic from the framework. No HTTP, no database, mocked dependencies.

```php
class CreateAssignmentUseCaseTest extends TestCase
{
    public function test_it_creates_an_assignment(): void
    {
        // Mock dependencies
        $repository = Mockery::mock(AssignmentRepositoryInterface::class);
        $auditLogger = Mockery::mock(AuditLoggerInterface::class);

        $auditLogger->shouldReceive('log')->once();

        $repository->shouldReceive('save')
            ->once()
            ->with(Mockery::on(function (AssignmentEntity $entity) {
                return $entity->getTitle() === 'Homework 1'
                    && $entity->getCourseId() === 1;
            }));

        $useCase = new CreateAssignmentUseCase($repository, $auditLogger);

        $command = new CreateAssignmentCommand(
            tenantId: 1,
            creatorId: 10,
            courseId: 1,
            title: 'Homework 1',
        );

        $useCase->execute($command);

        // Mockery auto-verifies expectations
        $this->assertTrue(true);
    }
}
```

### Value Object Tests

```php
class CategorySlugTest extends TestCase
{
    public function test_it_rejects_empty_slug(): void
    {
        $this->expectException(InvalidArgumentException::class);
        new CategorySlug('');
    }

    public function test_it_normalizes_slug(): void
    {
        $slug = new CategorySlug('Web Development');
        $this->assertEquals('web-development', $slug->getValue());
    }
}
```

---

## 8. Factories

### TenantRecord Factory

```php
TenantRecord::factory()->create();                     // Default (pending status)
TenantRecord::factory()->active()->create();            // Active tenant
TenantRecord::factory()->suspended()->create();         // Suspended tenant
TenantRecord::factory()->create(['status' => 'active']); // Explicit override
```

### UserRecord Factory

```php
UserRecord::factory()->create([
    'tenant_id'            => $tenant->id,
    'status'               => 'active',
    'force_password_reset' => false,
]);
```

> **Important**: The `BelongsToTenant` trait's `creating` hook always overrides `tenant_id` with the value from `TenantContext`. The factory's `tenant_id` default is a fallback that only matters if the trait doesn't fire (which should never happen in normal operation).

---

## 9. Exception-to-HTTP Mapping

Domain exceptions are mapped to HTTP status codes in `bootstrap/app.php`:

| Exception | HTTP Status | Error Code |
|-----------|-------------|------------|
| `EntityNotFoundException` | 404 | `RESOURCE_NOT_FOUND` |
| `CategoryNotFoundException` | 404 | `RESOURCE_NOT_FOUND` |
| `AdminNotFoundException` | 404 | `ADMIN_NOT_FOUND` |
| `ValidationException` (domain) | 422 | `VALIDATION_ERROR` |
| `QuotaExceededException` | 409 | `Quota Exceeded` |
| `InsufficientAuthorityException` | 403 | `FORBIDDEN` |
| Batch `*Exception` under `App\Domain\TenantAdminDashboard\Batch\Exceptions\` | 404 or 422 | Exception short class name (see `bootstrap/app.php`) |
| `JWTException` | 401 | `AUTH_REQUIRED` |
| `TenantNotResolvedException` | 500 | (unhandled) |

**When adding a new domain exception**: Register it in `bootstrap/app.php` so tests can assert on the expected HTTP status code. If your "not found" exception isn't registered, the test will receive a 500 instead of 404.

---

## 10. Critical Pitfalls

### Pitfall 1: Blanket `Event::fake()`

```php
// BAD - Suppresses ALL events including Eloquent model events
Event::fake();

// The BelongsToTenant trait registers a `creating` callback via Eloquent events.
// Event::fake() suppresses it, so tenant_id is never set on new models.
// This causes: "NOT NULL constraint failed: tenant_audit_logs.tenant_id"
```

```php
// GOOD - Only fake the specific domain events you need to assert
Event::fake([
    CategoryCreated::class,
    CategoryUpdated::class,
]);
```

**Why**: `Event::fake()` replaces Laravel's event dispatcher with a fake that swallows ALL events. Eloquent model events (`creating`, `created`, `updating`, etc.) are dispatched through the same system. The `BelongsToTenant` trait registers a `creating` callback that auto-assigns `tenant_id` from `TenantContext`. When faked, this callback never fires, and `tenant_id` remains `null`.

### Pitfall 2: Using `actingAs()` with JWT Guards

```php
// BAD - No real JWT is issued, middleware returns 401
$this->actingAs($user, 'tenant_api')
    ->postJson('/api/tenant/resource', $data);
```

```php
// GOOD - Real signed JWT with tenant_id claim
$token = $this->tokenForTenantUser($user, $tenant);
$this->withHeaders(['Authorization' => "Bearer {$token}"])
    ->postJson('/api/tenant/resource', $data);
```

**Why**: The `auth:tenant_api` guard validates a Bearer token from the request header. `actingAs()` bypasses this by setting the user directly on the guard — but the `ResolveTenantFromToken` middleware (which runs before auth) reads the JWT payload to set `TenantContext`. Without a real JWT, `TenantContext` is never set, and all tenant-scoped queries return empty results.

### Pitfall 3: Creating Cross-Tenant Data with Eloquent

```php
// BAD - BelongsToTenant creating hook overrides tenant_id to active context
$tenantBRecord = MyRecord::withoutGlobalScopes()->create([
    'tenant_id' => $tenantB->id,  // This gets OVERRIDDEN to tenantA->id!
    'title' => 'Enemy Data',
]);
```

```php
// GOOD - Raw DB insert bypasses Eloquent hooks entirely
$enemyId = DB::table('my_table')->insertGetId([
    'tenant_id'  => $tenantB->id,  // Actually saved as tenantB
    'title'      => 'Enemy Data',
    'created_at' => now(),
    'updated_at' => now(),
]);
```

**Why**: `withoutGlobalScopes()` only removes the query scope (WHERE clause). It does NOT disable the `creating` callback that sets `$model->tenant_id = TenantContext::getId()`. The trait comment says _"Always enforce context — the active TenantContext is the single source of truth."_

### Pitfall 4: Wrong Model Namespaces

```php
// BAD - These classes do not exist
use App\Models\Tenant;
use App\Models\User;
```

```php
// GOOD - Correct namespaces
use App\Infrastructure\Persistence\Shared\TenantRecord;
use App\Infrastructure\Persistence\Shared\UserRecord;
use App\Infrastructure\Persistence\Shared\AdminRecord;
use App\Infrastructure\Persistence\TenantAdminDashboard\TenantRoleRecord;
use App\Infrastructure\Persistence\TenantAdminDashboard\UserRoleAssignmentRecord;
```

### Pitfall 5: Cross-Tenant Access Returns 403

```php
// BAD - Reveals that the resource exists (enumeration attack vector)
->assertStatus(403);
```

```php
// GOOD - Resource appears to not exist at all
->assertStatus(404);
```

### Pitfall 6: Forgetting to Seed Capabilities

If your endpoint uses `tenant.capability:xxx` middleware and you don't seed the capability, the test gets 403.

```php
// Check your route file for the required capability:
Route::post('/', [Controller::class, 'store'])
    ->middleware('tenant.capability:category.manage');

// Then seed it in setUp:
$this->seedCapabilitiesForRole($role->id, ['category.manage']);
```

### Pitfall 7: Wrong Middleware on Tenant Routes

```php
// BAD - admin.authority checks AdminRecord via auth('admin_api')
// Tenant users always get 403 from this
Route::middleware(['admin.authority:60'])->group(function () {
    Route::post('/', [TenantController::class, 'store']);
});
```

```php
// GOOD - tenant.capability checks UserRecord via auth('tenant_api')
Route::post('/', [TenantController::class, 'store'])
    ->middleware('tenant.capability:resource.manage');
```

### Pitfall 8: TenantContext Scoped Singleton Lifecycle

`TenantContext` is registered as `$this->app->scoped(...)`. This means:

- A **new instance** is created for each HTTP request (including test HTTP requests)
- The context set in `setUp()` is a **different instance** from the one used during the request
- During a test HTTP request, `ResolveTenantFromToken` middleware sets the context on the request's instance by reading `tenant_id` from the JWT payload

**This is why real JWT tokens are required**: the JWT carries `tenant_id` which the middleware uses to set context on the request-scoped `TenantContext` instance.

---

## 11. Checklist for New Features

Before submitting a pull request, verify:

### Feature Tests

- [ ] Happy path — successful CRUD operations return correct status codes
- [ ] Input validation — invalid data returns 422 with `assertJsonValidationErrors()`
- [ ] Authorization — requests without required capability return 403
- [ ] Tenant isolation — cross-tenant access returns 404 (not 403)
- [ ] Domain events — correct events dispatched (use selective `Event::fake()`)
- [ ] Database state — `assertDatabaseHas()` / `assertDatabaseMissing()` verify persistence
- [ ] Edge cases — duplicate slugs, concurrent requests, empty collections

### Security Tests

- [ ] Cross-tenant data never leaks (list, show, update, delete)
- [ ] No enumeration (cross-tenant returns 404, not 403)
- [ ] Background jobs scoped to correct tenant
- [ ] Audit log entries created for sensitive operations

### Unit Tests

- [ ] Domain entity/value object invariants
- [ ] Use case orchestration logic with mocked repositories
- [ ] Policy allow/deny for each permission scenario

### Infrastructure

- [ ] New domain exception registered in `bootstrap/app.php` for correct HTTP mapping
- [ ] New capability code documented and seeded in test
- [ ] Route middleware uses `tenant.capability:xxx` (not `admin.authority:xx`)

---

## 12. Complete Example

A full test file for a category CRUD feature:

```php
<?php

declare(strict_types=1);

namespace Tests\Feature\TenantAdminDashboard\Category;

use App\Domain\TenantAdminDashboard\Category\Events\CategoryCreated;
use App\Domain\TenantAdminDashboard\Category\Events\CategoryDeleted;
use App\Domain\TenantAdminDashboard\Category\Events\CategoryUpdated;
use App\Infrastructure\Persistence\Shared\TenantRecord;
use App\Infrastructure\Persistence\Shared\UserRecord;
use App\Infrastructure\Persistence\TenantAdminDashboard\Category\CategoryRecord;
use App\Infrastructure\Persistence\TenantAdminDashboard\TenantRoleRecord;
use App\Infrastructure\Persistence\TenantAdminDashboard\UserRoleAssignmentRecord;
use App\Infrastructure\Tenant\TenantContext;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Tests\TestCase;
use Tests\Traits\AuthenticatesWithJwt;
use Tests\Traits\SeedsTestCapabilities;

class CategoryCrudTest extends TestCase
{
    use RefreshDatabase, AuthenticatesWithJwt, SeedsTestCapabilities;

    private UserRecord $tenantAdmin;
    private TenantRecord $tenantA;
    private TenantRecord $tenantB;
    private int $tenantIdA;

    protected function setUp(): void
    {
        parent::setUp();

        // Only fake specific domain events — NEVER blanket Event::fake()
        Event::fake([
            CategoryCreated::class,
            CategoryUpdated::class,
            CategoryDeleted::class,
        ]);

        app(TenantContext::class)->clear();

        // Tenant A — the actor's tenant
        $this->tenantA = TenantRecord::factory()->create(['status' => 'active']);
        $this->tenantIdA = $this->tenantA->id;
        app(TenantContext::class)->setId($this->tenantIdA);

        // Tenant B — for isolation tests
        $this->tenantB = TenantRecord::factory()->create(['status' => 'active']);

        // Create user
        $this->tenantAdmin = UserRecord::factory()->create([
            'tenant_id'            => $this->tenantIdA,
            'status'               => 'active',
            'force_password_reset' => false,
        ]);

        // Create role (Eloquent — BelongsToTenant auto-assigns tenant_id)
        $role = TenantRoleRecord::create([
            'tenant_id'       => $this->tenantIdA,
            'code'            => 'admin',
            'hierarchy_level' => 100,
            'display_name'    => 'Admin',
        ]);

        UserRoleAssignmentRecord::create([
            'tenant_id' => $this->tenantIdA,
            'user_id'   => $this->tenantAdmin->id,
            'role_id'   => $role->id,
        ]);

        // Seed capabilities required by category endpoints
        $this->seedCapabilitiesForRole($role->id, ['category.manage']);
    }

    public function test_it_can_create_a_category(): void
    {
        $token = $this->tokenForTenantUser($this->tenantAdmin, $this->tenantA);

        $response = $this->withHeaders(['Authorization' => "Bearer {$token}"])
            ->postJson('/api/tenant/categories', [
                'title' => 'Web Development',
            ]);

        $response->assertStatus(201)
            ->assertJsonStructure(['data' => ['id']]);

        $this->assertDatabaseHas('categories', [
            'tenant_id' => $this->tenantIdA,
            'title'     => 'Web Development',
            'slug'      => 'web-development',
            'order'     => 1,
        ]);

        Event::assertDispatched(CategoryCreated::class);
    }

    public function test_it_can_update_a_category(): void
    {
        $category = CategoryRecord::create([
            'tenant_id' => $this->tenantIdA,
            'title'     => 'Old Title',
            'slug'      => 'old-title',
            'order'     => 1,
        ]);

        $token = $this->tokenForTenantUser($this->tenantAdmin, $this->tenantA);

        $response = $this->withHeaders(['Authorization' => "Bearer {$token}"])
            ->putJson("/api/tenant/categories/{$category->id}", [
                'title' => 'New Title',
                'slug'  => 'new-title-slug',
            ]);

        $response->assertStatus(200);

        $this->assertDatabaseHas('categories', [
            'id'    => $category->id,
            'title' => 'New Title',
            'slug'  => 'new-title-slug',
        ]);

        Event::assertDispatched(CategoryUpdated::class);
    }

    public function test_it_can_delete_a_category_and_cascade_children(): void
    {
        $parent = CategoryRecord::create([
            'tenant_id' => $this->tenantIdA,
            'title'     => 'Parent',
            'slug'      => 'parent',
        ]);

        $child = CategoryRecord::create([
            'tenant_id' => $this->tenantIdA,
            'parent_id' => $parent->id,
            'title'     => 'Child',
            'slug'      => 'child',
        ]);

        $token = $this->tokenForTenantUser($this->tenantAdmin, $this->tenantA);

        $response = $this->withHeaders(['Authorization' => "Bearer {$token}"])
            ->deleteJson("/api/tenant/categories/{$parent->id}");

        $response->assertStatus(204);

        $this->assertDatabaseMissing('categories', ['id' => $parent->id]);
        $this->assertDatabaseMissing('categories', ['id' => $child->id]);

        Event::assertDispatched(CategoryDeleted::class);
    }

    public function test_tenant_cannot_access_other_tenant_categories(): void
    {
        // Raw DB insert — bypasses BelongsToTenant creating hook
        $enemyId = DB::table('categories')->insertGetId([
            'tenant_id'  => $this->tenantB->id,
            'title'      => 'Tenant B Category',
            'slug'       => 'tenant-b-cat',
            'order'      => 1,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $token = $this->tokenForTenantUser($this->tenantAdmin, $this->tenantA);

        // All operations return 404 — resource is invisible
        $this->withHeaders(['Authorization' => "Bearer {$token}"])
            ->getJson("/api/tenant/categories/{$enemyId}")
            ->assertStatus(404);

        $this->withHeaders(['Authorization' => "Bearer {$token}"])
            ->putJson("/api/tenant/categories/{$enemyId}", ['title' => 'Hacked'])
            ->assertStatus(404);

        $this->withHeaders(['Authorization' => "Bearer {$token}"])
            ->deleteJson("/api/tenant/categories/{$enemyId}")
            ->assertStatus(404);
    }
}
```
