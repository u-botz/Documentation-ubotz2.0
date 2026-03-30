# ADR Reality Verification - Phase 10A Extended Baseline

## CoursePolicy

### CoursePolicy.php (`app/Policies/CoursePolicy.php`)

```php
<?php

declare(strict_types=1);

namespace App\Policies;

use App\Infrastructure\Persistence\Shared\UserRecord;

class CoursePolicy
{
    /**
     * Create a new policy instance.
     */
    public function __construct()
    {
        //
    }

    /**
     * Phase 9: Returns true unconditionally.
     * Phase 10 will implement Tenant RBAC with tenant_role_permission checks.
     * @see UBOTZ_2_POST_FOUNDATION_ROADMAP_ANALYSIS — Phase 10 Tenant RBAC
     */
    public function create(UserRecord $user): bool
    {
        return true; 
    }

    /**
     * Phase 9: Returns true unconditionally.
     * Phase 10 will implement Tenant RBAC with tenant_role_permission checks.
     * @see UBOTZ_2_POST_FOUNDATION_ROADMAP_ANALYSIS — Phase 10 Tenant RBAC
     */
    public function update(UserRecord $user): bool
    {
        return true;
    }

    /**
     * Phase 9: Returns true unconditionally.
     * Phase 10 will implement Tenant RBAC with tenant_role_permission checks.
     * @see UBOTZ_2_POST_FOUNDATION_ROADMAP_ANALYSIS — Phase 10 Tenant RBAC
     */
    public function changeStatus(UserRecord $user): bool
    {
        return true;
    }

    /**
     * Phase 9: Returns true unconditionally.
     * Phase 10 will implement Tenant RBAC with tenant_role_permission checks.
     * @see UBOTZ_2_POST_FOUNDATION_ROADMAP_ANALYSIS — Phase 10 Tenant RBAC
     */
    public function archive(UserRecord $user): bool
    {
        return true;
    }
}

```

## Tenant Dashboard Route Group

### api.php (`routes/api.php`)

```php
<?php

declare(strict_types=1);

use App\Http\Controllers\Api\Auth\AdminAuthController;
use App\Http\Controllers\HealthController;
use Illuminate\Support\Facades\Route;

Route::get('/health', HealthController::class);

// ── Platform Admin Auth ────────────────────────────────────────────────────
// Public routes (no auth required)
Route::prefix('auth')->group(function () {
    Route::post('/login', [AdminAuthController::class, 'login'])
        ->middleware('throttle:login');
});

// Password Reset — No auth required. Rate limited.
Route::prefix('auth')->middleware(['throttle:password_reset'])->group(function () {
    Route::post('/password-reset/request', [AdminAuthController::class, 'requestPasswordReset']);
    Route::post('/password-reset/reset',   [AdminAuthController::class, 'resetPassword']);
});

// Protected routes (valid JWT required)
// Session-validated: resource endpoints that must pass concurrent session check
Route::prefix('auth')->middleware(['auth:admin_api', 'admin.session'])->group(function () {
    Route::get('/me', [AdminAuthController::class, 'me']);
});

// Session-lifecycle: endpoints that manage the session itself.
// NOT behind admin.session because:
//   - refresh: admin.session calls $guard->payload() which consumes the JWT
//     guard's internal token state, preventing $guard->refresh() from working.
//   - logout: revokes the session directly via ConcurrentSessionManager.
// Both already handle session tracking internally in AdminAuthController.
Route::prefix('auth')->middleware(['auth:admin_api'])->group(function () {
    Route::post('/logout',  [AdminAuthController::class, 'logout']);
    Route::post('/refresh', [AdminAuthController::class, 'refresh']);
});

/*
|--------------------------------------------------------------------------
| Webhooks
|--------------------------------------------------------------------------
| Public, unauthenticated endpoints for receiving third-party events.
| These endpoints use their own signature validation mechanisms.
*/
Route::prefix('webhooks')->middleware(['throttle:60,1'])->group(function () {
    Route::post('razorpay', \App\WebApi\SuperAdminDashboard\Subscription\Controllers\WebhookAction::class);
});

// ── Platform Protected Routes (Phase 3 — Authorization gate stubs) ─────────
// These routes exist to verify the authorization layer works correctly.
// Business logic is in Phase 5. Stub responses (200/403) confirm gate checks.
Route::middleware(['auth:admin_api', 'admin.session'])->prefix('platform')->group(function () {

    // Tenant management — Read: L5+ (tenant.view)
    Route::middleware(['admin.authority:50'])->group(function () {
        Route::get('/tenants', [\App\Http\Controllers\Api\SuperAdminDashboard\Tenant\TenantReadController::class, 'index']);
        Route::get('/tenants/{id}', [\App\Http\Controllers\Api\SuperAdminDashboard\Tenant\TenantReadController::class, 'show']);
    });

    // Tenant management — Write: L4+ (super_admin)
    Route::middleware(['admin.authority:60'])->group(function () {
        Route::post('/tenants', [\App\Http\Controllers\Api\SuperAdminDashboard\Tenant\TenantWriteController::class, 'store']);
        Route::patch('/tenants/{id}/status', [\App\Http\Controllers\Api\SuperAdminDashboard\Tenant\TenantWriteController::class, 'updateStatus']);
    });

    // Staff management — Read: L4+ (super_admin)
    Route::middleware(['admin.authority:60'])->group(function () {
        Route::get('/staff', [\App\Http\Controllers\Api\SuperAdminDashboard\Staff\StaffReadController::class, 'index']);
        Route::get('/staff/{id}', [\App\Http\Controllers\Api\SuperAdminDashboard\Staff\StaffReadController::class, 'show']);
    });

    // Staff management — Write: L1 only (platform_owner)
    // Actually, Phase 5 Quality Gate says L4 Super Admin can create staff? 
    // "Quality Gate: L5 user cannot see staff management... L4+ can"
    // Wait, the stub said "Write: L1 only". I'll keep the middleware as-is but map to controller.
    Route::middleware(['admin.authority:90'])->group(function () {
        Route::post('/staff', [\App\Http\Controllers\Api\SuperAdminDashboard\Staff\StaffWriteController::class, 'store']);
        Route::put('/staff/{id}', [\App\Http\Controllers\Api\SuperAdminDashboard\Staff\StaffWriteController::class, 'update']);
        Route::delete('/staff/{id}', [\App\Http\Controllers\Api\SuperAdminDashboard\Staff\StaffWriteController::class, 'destroy']);
        Route::patch('/staff/{id}/activate', [\App\Http\Controllers\Api\SuperAdminDashboard\Staff\StaffWriteController::class, 'activate']);
        Route::patch('/staff/{id}/force-password-reset', [\App\Http\Controllers\Api\SuperAdminDashboard\Staff\StaffWriteController::class, 'forcePasswordReset']);
    });

    // Staff management — Administrative Actions: L2+ (super_admin). Specifically, unlock.
    Route::middleware(['admin.authority:80'])->group(function () {
        Route::patch('/staff/{id}/unlock', [\App\Http\Controllers\Api\SuperAdminDashboard\Staff\StaffWriteController::class, 'unlock']);
    });

    // ── Tenant User Management (Phase 7B) ─────────────────────────────────────
    Route::middleware(['admin.authority:50'])->group(function () {
        Route::get('/tenants/{tenantId}/users', [\App\Http\Controllers\Api\TenantAdminDashboard\User\TenantUserController::class, 'index']);
        Route::get('/tenants/{tenantId}/users/{userId}', [\App\Http\Controllers\Api\TenantAdminDashboard\User\TenantUserController::class, 'show']);
    });
    Route::middleware(['admin.authority:70'])->group(function () {
        Route::post('/tenants/{tenantId}/users', [\App\Http\Controllers\Api\TenantAdminDashboard\User\TenantUserController::class, 'store']);
        Route::put('/tenants/{tenantId}/users/{userId}', [\App\Http\Controllers\Api\TenantAdminDashboard\User\TenantUserController::class, 'update']);
        Route::post('/tenants/{tenantId}/users/{userId}/suspend', [\App\Http\Controllers\Api\TenantAdminDashboard\User\TenantUserController::class, 'suspend']);
        Route::post('/tenants/{tenantId}/users/{userId}/reactivate', [\App\Http\Controllers\Api\TenantAdminDashboard\User\TenantUserController::class, 'reactivate']);
        Route::post('/tenants/{tenantId}/users/{userId}/archive', [\App\Http\Controllers\Api\TenantAdminDashboard\User\TenantUserController::class, 'archive']);
    });

    // ── Subscription Management (Phase 8A) ────────────────────────────────────
    // Read: L7+ (authority_level >= 30)
    Route::middleware(['admin.authority:30'])->group(function () {
        Route::get('/subscription-plans', [\App\Http\Controllers\Api\SuperAdminDashboard\Subscription\SubscriptionPlanController::class, 'index']);
        Route::get('/subscription-plans/{id}', [\App\Http\Controllers\Api\SuperAdminDashboard\Subscription\SubscriptionPlanController::class, 'show']);
        Route::get('/tenants/{tenantId}/subscription', [\App\Http\Controllers\Api\SuperAdminDashboard\Subscription\TenantSubscriptionController::class, 'show']);
    });
    
    // Write: L4+ (authority_level >= 60)
    Route::middleware(['admin.authority:60'])->group(function () {
        Route::post('/tenants/{tenantId}/subscription', [\App\Http\Controllers\Api\SuperAdminDashboard\Subscription\TenantSubscriptionController::class, 'assign']);
    });
});


// ── Tenant Auth Routes (Phase 7C) ──────────────────────────────────────────
Route::prefix('tenant/auth')->group(function () {
    // Public routes (no JWT required)
    Route::middleware(['resolve.tenant.subdomain', 'throttle:tenant_login'])->group(function () {
        Route::post('/login', [\App\Http\Controllers\Api\TenantAdminDashboard\Auth\TenantAuthController::class, 'login']);
        Route::post('/change-password', [\App\Http\Controllers\Api\TenantAdminDashboard\Auth\TenantAuthController::class, 'changePassword']);
    });

    // Authenticated routes (JWT required)
    Route::middleware([
        'tenant.resolve.token',
        'auth:tenant_api'
    ])->group(function () {
        Route::post('/logout', [\App\Http\Controllers\Api\TenantAdminDashboard\Auth\TenantAuthController::class, 'logout']);
        Route::post('/refresh', [\App\Http\Controllers\Api\TenantAdminDashboard\Auth\TenantAuthController::class, 'refresh']);
    });
});

// ── Tenant User Routes (Phase 7A) ──────────────────────────────────────────
// Pipeline order is critical — tenant.resolve.token MUST be first.
// It does a lightweight JWT decode to extract tenant_id and set TenantContext.
// auth:tenant_api then uses the Eloquent provider (UserRecord) which has
// BelongsToTenant global scope — that scope needs TenantContext to be set
// or it adds WHERE 1 = 0 and blocks all queries.
Route::prefix('tenant')->middleware([
    'tenant.resolve.token',
    'auth:tenant_api',
    'tenant.active',
    'ensure.user.active',
    'tenant.session',
])->group(function () {
    Route::get('/me', function () {
        $user = auth('tenant_api')->user();
        return response()->json([
            'data' => [
                'id'         => $user->id,
                'tenant_id'  => $user->tenant_id,
                'email'      => $user->email,
                'first_name' => $user->first_name,
                'last_name'  => $user->last_name,
                'status'     => $user->status,
            ]
        ]);
    });

    // Phase 9: Course & Exam Hierarchy
    require base_path('routes/tenant_dashboard/course.php');
    require base_path('routes/tenant_dashboard/exam_hierarchy.php');
});

```

## BelongsToTenant Trait

### BelongsToTenant.php (`app/Infrastructure/Persistence/Traits/BelongsToTenant.php`)

```php
<?php

declare(strict_types=1);

namespace App\Infrastructure\Persistence\Traits;

use App\Infrastructure\Persistence\Shared\TenantRecord;
use App\Infrastructure\Tenant\TenantContext;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * BelongsToTenant
 *
 * Multi-tenancy layer 1 defense: applied to tenant-scoped Eloquent models.
 * Automatically scopes all queries to the current tenant ID via global scope,
 * and sets the tenant ID automatically on creation.
 */
trait BelongsToTenant
{
    /**
     * Boot the trait on the model.
     * Registers the tenant global scope.
     */
    protected static function bootBelongsToTenant(): void
    {
        // ── Auto-assignment on creation ───────────────────────────
        static::creating(function ($model) {
            // Retrieve from scoped singleton
            $context = app(TenantContext::class);

            // Throws TenantNotResolvedException if missing!
            $tenantId = $context->getIdOrFail();

            $model->tenant_id = $tenantId;
        });

        // ── Global scoped querying ────────────────────────────────
        static::addGlobalScope('tenant', function (Builder $builder) {
            $context = app(TenantContext::class);
            
            // If context is resolved, scope the query.
            if ($context->isResolved()) {
                $builder->where($builder->getModel()->getTable() . '.tenant_id', $context->getId());
            } else {
                // If not resolved: We force the query to return empty by adding a 1=0 where clause.
                // This prevents cross-tenant data leakage if someone forgets to set context.
                // Exception: if withoutGlobalScopes() is used.
                // If we are seeding we use withoutGlobalScopes if needed.
                $builder->whereRaw('1 = 0');
            }
        });
    }

    public function tenant(): BelongsTo
    {
        return $this->belongsTo(TenantRecord::class, 'tenant_id');
    }
}

```

## TenantContext Class

### TenantContext.php (`app/Infrastructure/Tenant/TenantContext.php`)

```php
<?php

declare(strict_types=1);

namespace App\Infrastructure\Tenant;

use App\Infrastructure\Tenant\Exceptions\TenantNotResolvedException;
use LogicException;

/**
 * TenantContext
 *
 * Implements DR-009: Immutable per-request tenant context.
 * Resolving the tenant sets this singleton. Mid-request modifications are forbidden.
 */
final class TenantContext
{
    private ?int $tenantId = null;

    /**
     * Resolves the current tenant for the request.
     * Can only be called ONCE to prevent mid-request privilege escalation.
     *
     * @throws LogicException
     */
    public function setId(int $tenantId): void
    {
        if ($this->tenantId !== null) {
            throw new LogicException('Tenant context has already been set for this request and cannot be modified.');
        }

        $this->tenantId = $tenantId;
    }

    public function getId(): ?int
    {
        return $this->tenantId;
    }

    /**
     * @throws TenantNotResolvedException
     */
    public function getIdOrFail(): int
    {
        if ($this->tenantId === null) {
            throw new TenantNotResolvedException();
        }

        return $this->tenantId;
    }

    public function isResolved(): bool
    {
        return $this->tenantId !== null;
    }

    /**
     * DANGER: For testing purposes ONLY.
     * Clears the current tenant context.
     */
    public function clear(): void
    {
        $this->tenantId = null;
    }
}

```

## Tenant Audit Logs Migration

### 2026_02_22_000002_create_tenant_audit_logs_table.php (`database/migrations/tenant/2026_02_22_000002_create_tenant_audit_logs_table.php`)

```php
<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Tenant-Scoped Table: tenant_audit_logs
 *
 * Proof-of-pattern tracking tenant events immutably.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('tenant_audit_logs', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('tenant_id');
            $table->foreign('tenant_id')->references('id')->on('tenants')->onDelete('cascade');

            $table->unsignedBigInteger('actor_id')->nullable();
            $table->string('actor_type', 100)->nullable();
            $table->string('action', 100);
            
            $table->string('entity_type', 100)->nullable();
            $table->unsignedBigInteger('entity_id')->nullable();
            
            $table->json('metadata')->nullable();
            $table->string('ip_address', 45)->nullable();

            // ONLY created_at
            $table->timestamp('created_at')->useCurrent();
            
            $table->index(['tenant_id', 'actor_id']);
            $table->index(['tenant_id', 'entity_type', 'entity_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('tenant_audit_logs');
    }
};

```

## Admin Audit Logs Migration

### 2026_02_17_213440_create_admin_audit_logs_table.php (`database/migrations/central/2026_02_17_213440_create_admin_audit_logs_table.php`)

```php
<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Central Platform Table: admin_audit_logs
 *
 * IMMUTABLE audit trail for all platform admin actions.
 * This table is APPEND-ONLY: no update, no delete, no soft delete.
 * NO updated_at column — by design.
 *
 * Follows: Backend Architecture Master § 6.5 — "Audit tables have NO updated_at column"
 * Blueprint reference: Phase 1 — "admin_audit_logs — immutable audit trail"
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('admin_audit_logs', function (Blueprint $table) {
            // -----------------------------------------------
            // Primary key
            // -----------------------------------------------
            $table->id();

            // -----------------------------------------------
            // Actor — who performed the action
            // -----------------------------------------------
            // Nullable because some actions are system-initiated (cron, queue)
            $table->unsignedBigInteger('admin_id')->nullable();

            // -----------------------------------------------
            // Action classification
            // -----------------------------------------------
            // Dot-notation: staff.created, staff.suspended, tenant.provisioned, role.assigned
            $table->string('action', 100);

            // -----------------------------------------------
            // Target — what was acted upon (polymorphic)
            // -----------------------------------------------
            $table->string('entity_type', 100)->nullable();
            $table->unsignedBigInteger('entity_id')->nullable();

            // -----------------------------------------------
            // State capture
            // -----------------------------------------------
            $table->json('old_values')->nullable();
            $table->json('new_values')->nullable();
            $table->json('metadata')->nullable();

            // -----------------------------------------------
            // Request context
            // -----------------------------------------------
            $table->string('ip_address', 45)->nullable();
            $table->text('user_agent')->nullable();

            // -----------------------------------------------
            // Timestamp — ONLY created_at, NO updated_at
            // This is an immutable, append-only table.
            // -----------------------------------------------
            $table->timestamp('created_at')->useCurrent();

            // -----------------------------------------------
            // Indexes
            // -----------------------------------------------
            $table->index(['admin_id', 'created_at'], 'idx_audit_admin_created');
            $table->index(['entity_type', 'entity_id'], 'idx_audit_entity');
            $table->index('action', 'idx_audit_action');
            $table->index('created_at', 'idx_audit_created');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('admin_audit_logs');
    }
};

```

## Tenant Capabilities Migration

*The `tenant_capabilities` migration does not currently exist in the codebase. As assumed by the ADR, this will need to be created as part of Phase 10A.*

