<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use App\Domain\TenantAdminDashboard\Role\Services\TenantCapabilityCheckerInterface;
use App\Infrastructure\Tenant\TenantContext;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * EnforceTenantCapability
 *
 * Middleware Alias: `tenant.capability`
 *
 * Route-level capability enforcement for tenant dashboard endpoints.
 * Usage: Route::middleware('tenant.capability:course.view')
 *
 * MUST run AFTER the full tenant auth pipeline (steps 1–6 in ADR-010).
 * This is step 7 — the per-route capability check.
 *
 * Returns 403 if the authenticated user lacks the required capability.
 * The response intentionally does NOT reveal which capability was missing
 * to prevent capability enumeration attacks.
 */
class EnforceTenantCapability
{
    public function __construct(
        private readonly TenantCapabilityCheckerInterface $capabilityChecker,
        private readonly TenantContext $tenantContext,
    ) {}

    /**
     * @param string $capabilityCode The required capability code (e.g. "course.view")
     */
    public function handle(Request $request, Closure $next, string $capabilityCode): Response
    {
        $user = auth('tenant_api')->user();

        if (!$user) {
            return response()->json([
                'error' => [
                    'code' => 'AUTH_REQUIRED',
                    'message' => 'Authentication required.',
                ]
            ], 401);
        }

        $tenantId = $this->tenantContext->getId();

        if (!$tenantId) {
            return response()->json([
                'error' => [
                    'code' => 'TENANT_NOT_RESOLVED',
                    'message' => 'Tenant context is required.',
                ]
            ], 403);
        }

        $hasCapability = $this->capabilityChecker->userHasCapability(
            userId: (int) $user->getKey(),
            tenantId: $tenantId,
            capabilityCode: $capabilityCode,
        );

        if (!$hasCapability) {
            return response()->json([
                'error' => [
                    'code' => 'INSUFFICIENT_CAPABILITY',
                    'message' => 'You do not have permission to perform this action.',
                ]
            ], 403);
        }

        return $next($request);
    }
}


<?php

declare(strict_types=1);

namespace App\Http\Traits;

use App\Infrastructure\Persistence\Shared\AdminRecord;
use App\Infrastructure\Persistence\Shared\UserRecord;
use Illuminate\Http\Request;

/**
 * ResolvesTenantActor
 *
 * Provides typed access to the authenticated tenant user in controllers.
 * Mirrors ResolvesPlatformActor for the tenant dashboard context.
 *
 * Usage:
 *   use ResolvesTenantActor;
 *   $actor = $this->resolveActor($request);
 *
 * Aborts with 403 if:
 *   - No authenticated user
 *   - Authenticated user is an AdminRecord (platform admin on tenant endpoint)
 *   - Authenticated user is not a UserRecord
 */
trait ResolvesTenantActor
{
    /**
     * Resolve the authenticated tenant user from the request.
     *
     * @throws \Illuminate\Http\Exceptions\HttpResponseException (403)
     */
    protected function resolveActor(Request $request): UserRecord
    {
        $user = $request->user('tenant_api');

        if ($user instanceof AdminRecord) {
            abort(403, 'Platform admin tokens cannot access tenant endpoints.');
        }

        if (!$user instanceof UserRecord) {
            abort(403, 'Tenant user access required.');
        }

        return $user;
    }
}

<?php

declare(strict_types=1);

namespace App\Http\TenantAdminDashboard\Role\Controllers;

use App\Application\TenantAdminDashboard\Role\Commands\CreateTenantRoleCommand;
use App\Application\TenantAdminDashboard\Role\Queries\ListTenantRolesQuery;
use App\Application\TenantAdminDashboard\Role\UseCases\CreateTenantRoleUseCase;
use App\Application\TenantAdminDashboard\Role\Queries\GetActorHierarchyLevelQuery;
use App\Http\Controllers\Controller;
use App\Http\TenantAdminDashboard\Role\Requests\CreateTenantRoleRequest;
use App\Http\Traits\ResolvesTenantActor;
use App\Infrastructure\Tenant\TenantContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class TenantRoleController extends Controller
{
    use ResolvesTenantActor;

    public function index(Request $request, ListTenantRolesQuery $query): JsonResponse
    {
        $tenantId = app(TenantContext::class)->getIdOrFail();
        $roles = $query->execute($tenantId);

        return response()->json(['data' => $roles]);
    }

    public function store(
        CreateTenantRoleRequest $request,
        CreateTenantRoleUseCase $useCase,
    ): JsonResponse {
        $actor = $this->resolveActor($request);
        $tenantId = app(TenantContext::class)->getIdOrFail();

        $actorLevel = app(GetActorHierarchyLevelQuery::class)->execute((int) $actor->getKey(), $tenantId);

        $command = new CreateTenantRoleCommand(
            tenantId: $tenantId,
            actorId: (int) $actor->getKey(),
            actorHierarchyLevel: $actorLevel,
            displayName: $request->validated('display_name'),
            description: $request->validated('description'),
            hierarchyLevel: $request->validated('hierarchy_level'),
            capabilityIds: $request->validated('capability_ids'),
        );

        try {
            $result = $useCase->execute($command);
            return response()->json(['data' => $result], 201);
        } catch (\DomainException $e) {
            $status = $e->getCode() === 409 ? 409 : 403;
            $errorCode = $e->getCode() === 409 ? 'DUPLICATE_ROLE' : 'HIERARCHY_VIOLATION';
            return response()->json([
                'error' => [
                    'code' => $errorCode,
                    'message' => $e->getMessage(),
                ]
            ], $status);
        }
    }
}

<?php

declare(strict_types=1);

namespace App\Application\TenantAdminDashboard\Role\UseCases;

use App\Application\TenantAdminDashboard\Role\Commands\CreateTenantRoleCommand;
use App\Domain\TenantAdminDashboard\Role\Entities\TenantRoleEntity;
use App\Domain\TenantAdminDashboard\Role\Events\TenantRoleCreated;
use App\Domain\TenantAdminDashboard\Role\ValueObjects\HierarchyLevel;
use App\Infrastructure\Persistence\Shared\AuditContext;
use App\Infrastructure\Persistence\Shared\TenantAuditLogger;
use App\Infrastructure\Persistence\TenantAdminDashboard\TenantRoleCapabilityRecord;
use App\Infrastructure\Persistence\TenantAdminDashboard\TenantRoleRecord;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * CreateTenantRoleUseCase
 *
 * Creates a custom (non-system) tenant role with capability assignments.
 *
 * Invariants enforced:
 *   1. Actor's hierarchy level must be HIGHER than the new role's level
 *   2. System roles cannot be created via this endpoint
 *   3. All capability IDs must exist in tenant_capabilities
 *   4. Role code is auto-generated from display_name (slug format)
 */
final class CreateTenantRoleUseCase
{
    public function __construct(
        private readonly TenantAuditLogger $auditLogger,
    ) {}

    public function execute(CreateTenantRoleCommand $command): array
    {
        // Domain invariant: actor must have higher hierarchy
        $actorLevel = new HierarchyLevel($command->actorHierarchyLevel);
        $newRoleLevel = new HierarchyLevel($command->hierarchyLevel);

        $entity = new TenantRoleEntity(
            id: null,
            tenantId: $command->tenantId,
            code: Str::slug($command->displayName, '_'),
            displayName: $command->displayName,
            description: $command->description,
            isSystem: false,
            isActive: true,
            hierarchyLevel: $newRoleLevel,
        );

        // Hierarchy check: actor must be strictly higher
        $entity->ensureAssignableBy($actorLevel);

        $result = DB::transaction(function () use ($command, $entity) {
            // Persist role
            try {
                $record = TenantRoleRecord::create([
                    'tenant_id' => $entity->tenantId,
                    'code' => $entity->code,
                    'display_name' => $entity->displayName,
                    'description' => $entity->description,
                    'is_system' => false,
                    'is_active' => true,
                    'hierarchy_level' => $entity->hierarchyLevel->getValue(),
                ]);
            } catch (\Illuminate\Database\QueryException $e) {
                if ($e->errorInfo[1] === 1062) { // MySQL unique constraint violation error code
                    throw new \DomainException("A role with a similar name already exists.", 409);
                }
                throw $e;
            }

            // Attach capabilities
            foreach ($command->capabilityIds as $capabilityId) {
                TenantRoleCapabilityRecord::create([
                    'role_id' => $record->id,
                    'capability_id' => $capabilityId,
                ]);
            }

            return $record;
        });

        // Audit log (outside transaction so it survives rollbacks)
        $this->auditLogger->log(new AuditContext(
            tenantId: $command->tenantId,
            userId: $command->actorId,
            action: 'role.created',
            entityType: 'tenant_role',
            entityId: (int) $result->id,
            metadata: [
                'code' => $entity->code,
                'display_name' => $entity->displayName,
                'hierarchy_level' => $entity->hierarchyLevel->getValue(),
                'capability_count' => count($command->capabilityIds),
            ],
        ));

        // Dispatch domain event after commit
        event(new TenantRoleCreated(
            tenantId: $command->tenantId,
            roleId: (int) $result->id,
            roleCode: $entity->code,
            isSystem: false,
            actorId: $command->actorId,
        ));

        // Reload with capabilities
        $result->load('capabilityRecords:id,code,display_name,group');

        return [
            'id' => $result->id,
            'code' => $result->code,
            'display_name' => $result->display_name,
            'description' => $result->description,
            'hierarchy_level' => $result->hierarchy_level,
            'is_system' => $result->is_system,
            'is_active' => $result->is_active,
            'capabilities' => $result->capabilityRecords->map(fn (\App\Infrastructure\Persistence\TenantAdminDashboard\TenantCapabilityRecord $cap) => [
                'id' => $cap->id,
                'code' => $cap->code,
                'display_name' => $cap->display_name,
                'group' => $cap->group,
            ])->toArray(),
        ];
    }
}


<?php

declare(strict_types=1);

namespace App\Application\TenantAdminDashboard\Role\Queries;

use App\Infrastructure\Persistence\TenantAdminDashboard\TenantRoleRecord;

/**
 * GetActorHierarchyLevelQuery
 *
 * Resolves the highest hierarchy level of a given user within a tenant.
 */
final class GetActorHierarchyLevelQuery
{
    /**
     * @return int The highest hierarchy level assigned to the actor, or 0 if none.
     */
    public function execute(int $actorId, int $tenantId): int
    {
        $actorRole = TenantRoleRecord::whereHas('assignments', function ($q) use ($actorId) {
            $q->where('user_id', $actorId);
        })->where('tenant_id', $tenantId)->orderByDesc('hierarchy_level')->first();

        return $actorRole ? $actorRole->hierarchy_level : 0;
    }
}


<?php

declare(strict_types=1);

namespace App\Domain\TenantAdminDashboard\Role\Entities;

use App\Domain\TenantAdminDashboard\Role\ValueObjects\HierarchyLevel;
use DomainException;

/**
 * TenantRoleEntity
 *
 * Domain entity representing a role within a tenant.
 * Enforces invariants:
 *   - System roles cannot be deleted
 *   - System roles cannot have their code or hierarchy_level changed
 *   - Hierarchy level must be valid
 */
final class TenantRoleEntity
{
    public function __construct(
        public readonly ?int $id,
        public readonly int $tenantId,
        public readonly string $code,
        public readonly string $displayName,
        public readonly ?string $description,
        public readonly bool $isSystem,
        public readonly bool $isActive,
        public readonly HierarchyLevel $hierarchyLevel,
    ) {}

    /**
     * Domain invariant: System roles cannot be deleted.
     *
     * @throws DomainException
     */
    public function ensureDeletable(): void
    {
        if ($this->isSystem) {
            throw new DomainException(
                "System role '{$this->code}' cannot be deleted. System roles are immutable."
            );
        }
    }

    /**
     * Domain invariant: System roles cannot be deactivated.
     *
     * @throws DomainException
     */
    public function ensureDeactivatable(): void
    {
        if ($this->isSystem) {
            throw new DomainException(
                "System role '{$this->code}' cannot be deactivated. System roles are always active."
            );
        }
    }

    /**
     * Domain invariant: Cannot modify a role with higher hierarchy than actor.
     *
     * @throws DomainException
     */
    public function ensureModifiableBy(HierarchyLevel $actorLevel): void
    {
        if (!$actorLevel->isHigherThan($this->hierarchyLevel)) {
            throw new DomainException(
                "Cannot modify role '{$this->code}' (level {$this->hierarchyLevel->getValue()}). "
                . "Actor hierarchy level ({$actorLevel->getValue()}) is not higher."
            );
        }
    }

    /**
     * Validates that this role can be assigned to a user by the given actor.
     * An actor cannot assign a role at their own level or higher.
     *
     * @throws DomainException
     */
    public function ensureAssignableBy(HierarchyLevel $actorLevel): void
    {
        if (!$actorLevel->isHigherThan($this->hierarchyLevel)) {
            throw new DomainException(
                "Cannot assign role '{$this->code}' (level {$this->hierarchyLevel->getValue()}). "
                . "Actor must have higher authority."
            );
        }
    }
}


<?php

declare(strict_types=1);

namespace App\Infrastructure\Persistence\TenantAdminDashboard;

use App\Infrastructure\Persistence\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * TenantRoleRecord
 *
 * Eloquent model for the `tenant_roles` table.
 * Tenant-scoped via BelongsToTenant trait — enforces isolation.
 *
 * Phase 10A: Added BelongsToTenant, updated fillable for code + hierarchy_level.
 */
class TenantRoleRecord extends Model
{
    use BelongsToTenant;

    protected $table = 'tenant_roles';

    protected $fillable = [
        'tenant_id',
        'code',
        'display_name',
        'description',
        'is_system',
        'is_active',
        'hierarchy_level',
    ];

    protected $casts = [
        'is_system'       => 'boolean',
        'is_active'       => 'boolean',
        'hierarchy_level' => 'integer',
    ];

    /**
     * Pivot records linking this role to capabilities.
     * Use capabilityRecords() instead for most queries.
     */
    public function capabilities(): HasMany
    {
        return $this->hasMany(TenantRoleCapabilityRecord::class, 'role_id');
    }

    /**
     * Capability records (actual TenantCapabilityRecord models).
     * Use this for queries that need capability code/display_name.
     * 
     * @return \Illuminate\Database\Eloquent\Relations\BelongsToMany<TenantCapabilityRecord>
     */
    public function capabilityRecords(): \Illuminate\Database\Eloquent\Relations\BelongsToMany
    {
        return $this->belongsToMany(
            TenantCapabilityRecord::class,
            'tenant_role_capabilities',
            'role_id',
            'capability_id',
        );
    }

    /**
     * User-role assignments for this role.
     */
    public function assignments(): HasMany
    {
        return $this->hasMany(\App\Infrastructure\Persistence\TenantAdminDashboard\UserRoleAssignmentRecord::class, 'role_id');
    }
}

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
    require base_path('routes/tenant_dashboard/stats.php');
    require base_path('routes/tenant_dashboard/roles.php');
    require base_path('routes/tenant_dashboard/audit_logs.php');
    require base_path('routes/tenant_dashboard/settings.php');
});


<?php

use App\Http\TenantAdminDashboard\Role\Controllers\TenantRoleController;
use Illuminate\Support\Facades\Route;

Route::prefix('roles')->group(function () {
    Route::get('/', [TenantRoleController::class, 'index'])
        ->middleware('tenant.capability:role.view');
    Route::post('/', [TenantRoleController::class, 'store'])
        ->middleware('tenant.capability:role.manage');
});


<?php

return [
    /*
    |--------------------------------------------------------------------------
    | Default Tenant Configs
    |--------------------------------------------------------------------------
    */
    'defaults' => [
        'timezone'    => 'Asia/Kolkata',
        'locale'      => 'en',
        'date_format' => 'd/m/Y',
        'currency'    => 'INR',
        'features'    => [],
    ],

    /*
    |--------------------------------------------------------------------------
    | Allowed Settings Keys
    |--------------------------------------------------------------------------
    |
    | Whitelist of keys that tenants can update via the settings endpoint.
    | Any key not in this list is silently ignored.
    | Must match the keys in 'defaults' above.
    |
    */
    'allowed_settings_keys' => [
        'timezone', 'locale', 'date_format', 'currency', 'features',
    ],

    /*
    |--------------------------------------------------------------------------
    | Default Tenant Roles
    |--------------------------------------------------------------------------
    |
    | System roles provisioned for every new tenant.
    | is_system = true is set by ProvisionDefaultRolesListener, not here.
    |
    | hierarchy_level defines authority ranking (higher = more authority).
    | OWNER (100) > ADMIN (80) > TEACHER (60) > STAFF (40) > STUDENT (20) > PARENT (10)
    |
    | CRITICAL: 'code' is the machine-readable identifier stored in tenant_roles.code.
    | Column was renamed from 'slug' in Phase 10A migration.
    |
    */
    'default_roles' => [
        [
            'code'            => 'owner',
            'display_name'    => 'Owner',
            'description'     => 'Tenant owner with full authority. Cannot be deleted or demoted.',
            'hierarchy_level' => 100,
        ],
        [
            'code'            => 'admin',
            'display_name'    => 'Administrator',
            'description'     => 'Tenant-level administrator with broad organizational access.',
            'hierarchy_level' => 80,
        ],
        [
            'code'            => 'teacher',
            'display_name'    => 'Teacher',
            'description'     => 'Instructor role for course management and student interaction.',
            'hierarchy_level' => 60,
        ],
        [
            'code'            => 'staff',
            'display_name'    => 'Staff',
            'description'     => 'Non-teaching staff for administrative operations.',
            'hierarchy_level' => 40,
        ],
        [
            'code'            => 'student',
            'display_name'    => 'Student',
            'description'     => 'Learner role for accessing courses and assessments.',
            'hierarchy_level' => 20,
        ],
        [
            'code'            => 'parent',
            'display_name'    => 'Parent/Guardian',
            'description'     => 'Guardian role for monitoring student progress.',
            'hierarchy_level' => 10,
        ],
    ],

    /*
    |--------------------------------------------------------------------------
    | Default Role-Capability Mapping
    |--------------------------------------------------------------------------
    |
    | Maps system role codes to their default capability codes.
    | Applied during tenant provisioning (ProvisionDefaultRolesListener).
    |
    | Capabilities are platform-defined in tenant_capabilities table.
    | Tenants cannot create custom capabilities — only custom roles
    | that combine existing capabilities.
    |
    | See ADR-010 Section 6.2 for the canonical mapping.
    |
    */
    'default_role_capabilities' => [
        'owner' => [
            'dashboard.view', 'course.view', 'course.create', 'course.edit',
            'course.publish', 'course.archive', 'exam.view', 'exam.manage',
            'user.view', 'user.invite', 'user.manage', 'role.view', 'role.manage',
            'audit.view', 'settings.view', 'settings.manage', 'billing.view',
        ],
        'admin' => [
            'dashboard.view', 'course.view', 'course.create', 'course.edit',
            'course.publish', 'course.archive', 'exam.view', 'exam.manage',
            'user.view', 'user.invite', 'user.manage', 'role.view',
            'audit.view', 'settings.view', 'billing.view',
        ],
        'teacher' => [
            'dashboard.view', 'course.view', 'course.create', 'course.edit',
            'exam.view',
        ],
        'staff' => [
            'dashboard.view',
        ],
        'student' => [],
        'parent'  => [],
    ],
];


<?php

declare(strict_types=1);

namespace App\Infrastructure\Persistence\Shared;

class TenantAuditLogger
{
    public function log(AuditContext $context): void
    {
        TenantAuditLogRecord::create([
            'tenant_id' => $context->tenantId,
            'actor_id' => $context->userId,
            'actor_type' => 'user',
            'action' => $context->action,
            'entity_type' => $context->entityType,
            'entity_id' => $context->entityId,
            'metadata' => $context->metadata,
            'ip_address' => request()?->ip(),
            'old_values' => $context->oldValues,
            'new_values' => $context->newValues,
        ]);
    }
}

<?php

declare(strict_types=1);

namespace App\Infrastructure\Persistence\Shared;

class AuditContext
{
    public function __construct(
        public readonly int $tenantId,
        public readonly int $userId,
        public readonly string $action,
        public readonly string $entityType,
        public readonly int $entityId,
        public readonly array $metadata = [],
        public readonly ?array $oldValues = null,
        public readonly ?array $newValues = null
    ) {}
}

<?php

declare(strict_types=1);

namespace Tests\Traits;

use Illuminate\Support\Facades\DB;

/**
 * Shared test helper for seeding tenant capabilities and wiring them to roles.
 *
 * Usage in setUp():
 *   $this->seedCapabilitiesForRole($role->id, ['course.view', 'course.create']);
 *
 * This trait eliminates duplication across test files that need to set up
 * the capability graph (tenant_capabilities + tenant_role_capabilities).
 *
 * @see \App\Http\Middleware\TenantAdminDashboard\EnforceTenantCapability
 */
trait SeedsTestCapabilities
{
    /**
     * Seed capabilities and assign them to a role.
     *
     * Creates capability records if they don't exist, then wires them
     * to the given role via tenant_role_capabilities.
     *
     * @param int      $roleId          The tenant_roles.id to assign capabilities to.
     * @param string[] $capabilityCodes  e.g. ['course.view', 'course.create']
     */
    protected function seedCapabilitiesForRole(int $roleId, array $capabilityCodes): void
    {
        foreach ($capabilityCodes as $code) {
            $parts = explode('.', $code);
            $group = $parts[0] ?? 'general';

            // insertOrIgnore: idempotent — safe if the capability already exists
            DB::table('tenant_capabilities')->insertOrIgnore([
                'code' => $code,
                'group' => $group,
                'display_name' => collect($parts)->map(fn($w) => ucfirst($w))->implode(' '),
                'created_at' => now(),
                'updated_at' => now(),
            ]);

            $capId = DB::table('tenant_capabilities')->where('code', $code)->value('id');

            DB::table('tenant_role_capabilities')->insertOrIgnore([
                'role_id' => $roleId,
                'capability_id' => $capId,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }
    }
}

<?php

declare(strict_types=1);

namespace Tests\Traits;

use App\Infrastructure\Persistence\Shared\TenantRecord;
use App\Infrastructure\Tenant\TenantContext;
use Exception;

/**
 * ActsAsTenant
 *
 * Test helper to cleanly set and manipulate TenantContext during tests.
 */
trait ActsAsTenant
{
    /**
     * Resolves the given tenant ID into the application container's TenantContext singleton.
     * Prevents logic exceptions from subsequent calls by clearing first (for tests ONLY).
     */
    protected function setTenantContext(int $tenantId): void
    {
        $context = app(TenantContext::class);
        
        // Use the DANGER test-only method to clear previous test state if any
        $context->clear();
        
        $context->setId($tenantId);
    }

    /**
     * Helper to create an active tenant and immediately set the context to it.
     */
    protected function createTenantWithContext(): TenantRecord
    {
        $tenant = TenantRecord::factory()->active()->create();
        
        $this->setTenantContext($tenant->id);

        return $tenant;
    }

    /**
     * Clears the tenant context completely.
     */
    protected function clearTenantContext(): void
    {
        app(TenantContext::class)->clear();
    }

    /**
     * Defensive tearDown — clears tenant context after every test.
     *
     * WHY: TenantContext::setId() is immutable (throws LogicException on second call).
     * If a test fails mid-execution before clear() runs, the context instance
     * may survive into the next test's setUp() via the scoped container binding.
     * That causes a cascade LogicException in unrelated tests.
     *
     * This tearDown acts as a safety net. It runs AFTER every test regardless of
     * pass/fail, ensuring the next test always starts with a clean context.
     */
    protected function tearDown(): void
    {
        if (app()->bound(TenantContext::class)) {
            app(TenantContext::class)->clear();
        }

        parent::tearDown();
    }
}

<?php

declare(strict_types=1);

namespace Tests\Traits;

use App\Infrastructure\Persistence\Shared\AdminRecord;

/**
 * AuthenticatesWithJwt
 *
 * Test helper trait for making authenticated HTTP requests using real JWT tokens
 * against the `admin_api` guard.
 *
 * WHY this is required:
 *   Laravel's `actingAs($admin, 'admin_api')` does NOT work with JWT-based guards.
 *   The `auth:admin_api` middleware validates the `Authorization: Bearer` header via
 *   `PHPOpenSourceSaver\JWTAuth`. When `actingAs()` is used, no real JWT is issued,
 *   so the middleware sees no valid token and returns 401.
 *
 * This trait issues a real signed JWT via `JWTAuth::fromUser()`, identical to what
 * the production login flow does, ensuring the full middleware pipeline is exercised.
 *
 * Usage:
 *   use Tests\Traits\AuthenticatesWithJwt;
 *   class MyTest extends TestCase {
 *       use RefreshDatabase, AuthenticatesWithJwt;
 *   }
 */
trait AuthenticatesWithJwt
{
    /**
     * Send GET request with a real JWT Bearer token for the given admin.
     */
    protected function getJsonAsAdmin(
        AdminRecord $admin,
        string $uri,
    ): \Illuminate\Testing\TestResponse {
        return $this->withToken($this->tokenForAdmin($admin))->getJson($uri);
    }

    /**
     * Send POST request with a real JWT Bearer token for the given admin.
     *
     * @param array<string, mixed> $data
     */
    protected function postJsonAsAdmin(
        AdminRecord $admin,
        string $uri,
        array $data = [],
    ): \Illuminate\Testing\TestResponse {
        return $this->withToken($this->tokenForAdmin($admin))->postJson($uri, $data);
    }

    /**
     * Send PUT request with a real JWT Bearer token for the given admin.
     *
     * @param array<string, mixed> $data
     */
    protected function putJsonAsAdmin(
        AdminRecord $admin,
        string $uri,
        array $data = [],
    ): \Illuminate\Testing\TestResponse {
        return $this->withToken($this->tokenForAdmin($admin))->putJson($uri, $data);
    }

    /**
     * Send PATCH request with a real JWT Bearer token for the given admin.
     *
     * @param array<string, mixed> $data
     */
    protected function patchJsonAsAdmin(
        AdminRecord $admin,
        string $uri,
        array $data = [],
    ): \Illuminate\Testing\TestResponse {
        return $this->withToken($this->tokenForAdmin($admin))->patchJson($uri, $data);
    }

    /**
     * Send DELETE request with a real JWT Bearer token for the given admin.
     */
    protected function deleteJsonAsAdmin(
        AdminRecord $admin,
        string $uri,
    ): \Illuminate\Testing\TestResponse {
        return $this->withToken($this->tokenForAdmin($admin))->deleteJson($uri);
    }

    /**
     * Issue a signed JWT token string for a given admin.
     *
     * Uses the `admin_api` guard explicitly — NOT the default `web` guard.
     * This follows the exact same code path as production login.
     * If the JWT library is ever swapped, this method does not change.
     *
     * Reuse this token for multiple requests within the same test to avoid
     * N+1 token generation.
     */
    protected function tokenForAdmin(AdminRecord $admin): string
    {
        $guard = auth('admin_api');
        /** @var string $token */
        $token = $guard->login($admin);

        // Record session to satisfy EnforceValidAdminSession middleware
        $payload = $guard->payload();
        app(\App\Infrastructure\Services\ConcurrentSessionManager::class)->recordSession(
            $admin->id,
            (string) $payload->get('jti'),
            (int) $payload->get('exp')
        );

        return $token;
    }

    /**
     * Issue a signed JWT token string for a given tenant user.
     */
    protected function tokenForTenantUser(
        \App\Infrastructure\Persistence\Shared\UserRecord $user,
        \App\Infrastructure\Persistence\Shared\TenantRecord $tenant
    ): string {
        $guard = auth('tenant_api');
        /** @var string $token */
        $token = $guard->login($user);

        // Record session to satisfy EnsureValidTenantSession middleware
        $payload = $guard->payload();
        app(\App\Infrastructure\Services\TenantSessionManager::class)->recordSession(
            $tenant->id,
            $user->id,
            (string) $payload->get('jti'),
            (int) $payload->get('exp')
        );

        return $token;
    }

    /**
     * Helper: create an AdminRecord with a given authority level for testing.
     * Centralized from TenantProvisioningTest for M-2.
     */
    protected function createAdminWithAuthority(int $authority): AdminRecord
    {
        // Map authority level to role name based on Ubotz AuthorityLevel catalog:
        // 90 = platform_owner (L1), 80 = platform_director (L2),
        // 70 = platform_manager (L3), 60 = super_admin (L4), <60 = lower
        $roleSlug = match (true) {
            $authority >= 90 => 'platform_owner',
            $authority >= 80 => 'platform_director',
            $authority >= 70 => 'platform_manager',
            $authority >= 60 => 'super_admin',
            default          => 'account_manager',
        };

        /** @var \Illuminate\Database\Eloquent\Collection $role */
        $role = \Illuminate\Support\Facades\DB::table('admin_roles')->where('code', $roleSlug)->first();

        $admin = AdminRecord::create([
            'first_name'      => 'Test',
            'last_name'       => \ucfirst($roleSlug),
            'email'           => "{$roleSlug}-" . \uniqid() . '@test.local',
            'password'        => \bcrypt('password'),
            'authority_level' => $role ? $role->authority_level : $authority,
            'status'          => 'active',
        ]);

        if ($role) {
            \Illuminate\Support\Facades\DB::table('admin_role_assignments')->insert([
                'admin_id'   => $admin->id,
                'role_id'    => $role->id,
                'is_active'  => true,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }

        return $admin;
    }
}

<?php

declare(strict_types=1);

namespace App\Policies;

use App\Infrastructure\Persistence\Shared\UserRecord;

/**
 * @deprecated Phase 10B replaced Gate::authorize with `tenant.capability` middleware. Remove in Phase 10D cleanup.
 */
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
<?php

declare(strict_types=1);

namespace App\Policies;

use App\Infrastructure\Persistence\Shared\UserRecord;

/**
 * @deprecated Phase 10B replaced Gate::authorize with `tenant.capability` middleware. Remove in Phase 10D cleanup.
 */
class ExamPolicy
{
    /**
     * Create a new policy instance.
     */
    public function __construct()
    {
        //
    }

    public function viewAny(UserRecord $user): bool
    {
        // TODO: Enforce exact RBAC rules in Phase 10
        return true;
    }

    public function create(UserRecord $user): bool
    {
        // TODO: Enforce exact RBAC rules in Phase 10
        return true;
    }

    public function update(UserRecord $user): bool
    {
        // TODO: Enforce exact RBAC rules in Phase 10
        return true;
    }

    public function delete(UserRecord $user): bool
    {
        // TODO: Enforce exact RBAC rules in Phase 10
        return true;
    }
}

<?php

declare(strict_types=1);

namespace App\Policies;

use App\Infrastructure\Persistence\Shared\UserRecord;

/**
 * @deprecated Phase 10B replaced Gate::authorize with `tenant.capability` middleware. Remove in Phase 10D cleanup.
 */
class ExamPolicy
{
    /**
     * Create a new policy instance.
     */
    public function __construct()
    {
        //
    }

    public function viewAny(UserRecord $user): bool
    {
        // TODO: Enforce exact RBAC rules in Phase 10
        return true;
    }

    public function create(UserRecord $user): bool
    {
        // TODO: Enforce exact RBAC rules in Phase 10
        return true;
    }

    public function update(UserRecord $user): bool
    {
        // TODO: Enforce exact RBAC rules in Phase 10
        return true;
    }

    public function delete(UserRecord $user): bool
    {
        // TODO: Enforce exact RBAC rules in Phase 10
        return true;
    }
}

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

<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use App\Infrastructure\Tenant\TenantContext;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * ResolveTenantFromToken
 *
 * Middleware Alias: `tenant.resolve.token`
 *
 * Resolves the tenant context by performing a lightweight JWT payload decode
 * to extract the tenant_id claim, then sets the immutable TenantContext.
 *
 * CRITICAL: This middleware MUST run BEFORE auth:tenant_api.
 * The auth guard uses the Eloquent UserRecord model which has a BelongsToTenant
 * global scope. That scope adds WHERE 1 = 0 when TenantContext is not set,
 * making user lookups return null and causing 401. By setting TenantContext first,
 * the Eloquent lookup in auth:tenant_api succeeds.
 *
 * This middleware does NOT authenticate the user — it only reads the JWT payload
 * to extract tenant_id. Full signature validation and user authentication happens
 * in the auth:tenant_api guard that runs after this.
 *
 * SECURITY NOTE: The raw base64 decode does NOT validate the JWT signature.
 * This is intentional — the auth guard validates the signature in the next step.
 * If the token is forged, auth:tenant_api will return 401 and no data access
 * happens. TenantContext may be set to a wrong value briefly, but since auth
 * fails, the request is terminated before any tenant-scoped operation.
 *
 * Pipeline order:
 *   1. AddBearerTokenFromCookie  (api middleware group — sets Authorization header)
 *   2. tenant.resolve.token      <-- We are here (set TenantContext from JWT)
 *   3. auth:tenant_api           (full JWT auth + Eloquent user lookup)
 *   4. tenant.active             (check tenant status)
 *   5. ensure.user.active        (check user status)
 *   6. tenant.session            (concurrent session enforcement)
 */
class ResolveTenantFromToken
{
    public function __construct(
        private readonly TenantContext $tenantContext
    ) {}

    /**
     * Handle an incoming request.
     */
    public function handle(Request $request, Closure $next): Response
    {
        // 1. Get the raw token from the request (already set by AddBearerTokenFromCookie)
        $rawToken = $request->bearerToken();

        if (!$rawToken) {
            // No token at all — let auth:tenant_api handle the 401
            return $next($request);
        }

        // 2. Lightweight JWT payload extraction via raw base64 decode.
        //    A JWT is: header.payload.signature — we only need the middle segment.
        //    This avoids all interaction with the JWTAuth library, preventing
        //    any state interference with the auth guard that runs after this.
        $parts = explode('.', $rawToken);

        if (count($parts) !== 3) {
            // Malformed token — let auth:tenant_api handle the rejection
            return $next($request);
        }

        $payloadJson = base64_decode(strtr($parts[1], '-_', '+/'));
        $payload = json_decode($payloadJson, true);

        if (!is_array($payload)) {
            return $next($request);
        }

        // 3. Extract tenant_id from the JWT custom claims
        $tenantId = $payload['tenant_id'] ?? null;

        if (!$tenantId) {
            return response()->json([
                'error' => [
                    'code' => 'TENANT_NOT_PROVIDED',
                    'message' => 'Valid tenant identification is required for this route.'
                ]
            ], 403);
        }

        // 4. Set the immutable context for the request lifecycle
        $this->tenantContext->setId((int) $tenantId);

        return $next($request);
    }
}

<?php
declare(strict_types=1);
namespace Tests\Feature\TenantAdminDashboard\Role;

use App\Infrastructure\Persistence\TenantAdminDashboard\TenantRoleRecord;
use App\Infrastructure\Persistence\Shared\TenantRecord;
use App\Infrastructure\Tenant\TenantContext;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * TenantRoleIsolationTest
 *
 * Verifies that the BelongsToTenant global scope on TenantRoleRecord
 * prevents cross-tenant data leakage. Two discrete tests:
 *   1. Cross-tenant isolation (Tenant A cannot see Tenant B roles)
 *   2. No-context safety (missing TenantContext returns empty, not all tenants)
 */
class TenantRoleIsolationTest extends TestCase
{
    use RefreshDatabase;

    private int $tenantId1;
    private int $tenantId2;

    protected function setUp(): void
    {
        parent::setUp();

        $this->tenantId1 = TenantRecord::factory()->create()->id;
        $this->tenantId2 = TenantRecord::factory()->create()->id;

        // Raw inserts bypass BelongsToTenant creating hook
        DB::table('tenant_roles')->insert([
            [
                'tenant_id'       => $this->tenantId1,
                'code'            => 't1_role',
                'display_name'    => 'T1 Role',
                'is_system'       => false,
                'is_active'       => true,
                'hierarchy_level' => 50,
                'created_at'      => now(),
                'updated_at'      => now(),
            ],
            [
                'tenant_id'       => $this->tenantId2,
                'code'            => 't2_role',
                'display_name'    => 'T2 Role',
                'is_system'       => false,
                'is_active'       => true,
                'hierarchy_level' => 50,
                'created_at'      => now(),
                'updated_at'      => now(),
            ],
        ]);
    }

    protected function tearDown(): void
    {
        app(TenantContext::class)->clear();
        parent::tearDown();
    }

    public function test_tenant_a_cannot_see_tenant_b_roles(): void
    {
        $tenantContext = app(TenantContext::class);

        // As Tenant 1 — should see only t1_role
        $tenantContext->clear();
        $tenantContext->setId($this->tenantId1);
        $roles1 = TenantRoleRecord::all();
        $this->assertCount(1, $roles1);
        $this->assertEquals('t1_role', $roles1->first()->code);

        // As Tenant 2 — should see only t2_role
        $tenantContext->clear();
        $tenantContext->setId($this->tenantId2);
        $roles2 = TenantRoleRecord::all();
        $this->assertCount(1, $roles2);
        $this->assertEquals('t2_role', $roles2->first()->code);
    }

    public function test_no_tenant_context_returns_empty_collection(): void
    {
        // TenantContext is NOT set (cleared in setUp→tearDown cycle).
        // BelongsToTenant global scope adds WHERE 1 = 0 in this case.
        // This must return empty — NOT all tenants' roles, NOT an exception.
        $tenantContext = app(TenantContext::class);
        $tenantContext->clear();

        $roles = TenantRoleRecord::all();

        $this->assertCount(0, $roles, 'Without TenantContext, query must return empty — not all tenants.');
    }
}
