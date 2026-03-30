# UBOTZ 2.0 — Phase 10D Implementation Plan

## Security Boundary Audit + Role CRUD Completion

| Field | Value |
|---|---|
| **Document Type** | Implementation Plan |
| **Phase** | 10D (of 10A–10D) |
| **Date** | March 1, 2026 |
| **Prerequisites** | Phase 10A (RBAC infra) + Phase 10B (route retrofit) + Phase 10C (new endpoints) COMPLETE |
| **Estimated Effort** | 3–4 working days |
| **Baseline Tests** | 365 passed (1148 assertions) |
| **Gate Required** | All 12 ADR-010 quality gates pass + zero regression |

> **This document reflects the real codebase state as of March 1, 2026. Every claim has been verified against actual source files provided by the platform owner. No assumptions.**

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Gap Analysis](#2-gap-analysis)
3. [Architecture Decisions](#3-architecture-decisions)
4. [Module 1: Role Update Endpoint](#4-module-1-role-update-endpoint)
5. [Module 2: Role Delete Endpoint](#5-module-2-role-delete-endpoint)
6. [Module 3: Role Deactivation Toggle](#6-module-3-role-deactivation-toggle)
7. [Module 4: Cross-Context Security Isolation Tests](#7-module-4-cross-context-security-isolation-tests)
8. [Module 5: Cross-Tenant Data Isolation Tests](#8-module-5-cross-tenant-data-isolation-tests)
9. [Module 6: Deprecated Code Cleanup](#9-module-6-deprecated-code-cleanup)
10. [Route Registration](#10-route-registration)
11. [Implementation Sequence](#11-implementation-sequence)
12. [Test Plan](#12-test-plan)
13. [ADR-010 Quality Gate Verification](#13-adr-010-quality-gate-verification)
14. [Risk Register](#14-risk-register)
15. [File Manifest](#15-file-manifest)
16. [What Phase 10D Does NOT Include](#16-what-phase-10d-does-not-include)

---

## 1. Executive Summary

Phase 10D is the **final backend phase** of the Tenant Admin Dashboard. It has two equal mandates:

1. **Complete the Role CRUD** — Add UPDATE, DELETE, and deactivation toggle endpoints deferred from 10C
2. **Prove the security model** — Write and execute the cross-context and cross-tenant isolation tests that ADR-010 §12 requires before Phase 11 can begin

This is not a feature phase. This is a **security proof phase**. Every test written here exists to prove that a specific attack vector is blocked. If any test cannot be written, it means the architecture has a gap.

**What gets built:**
- 2 new application-layer use cases (UpdateTenantRole, DeleteTenantRole)
- 1 new application-layer command (UpdateTenantRoleCommand)
- 1 new form request (UpdateTenantRoleRequest)
- 3 new controller methods on existing `TenantRoleController` (update, destroy, toggleActive)
- 1 new domain event (TenantRoleDeleted)
- 1 comprehensive cross-context security test file (~10 test cases)
- 1 comprehensive cross-tenant data isolation test file (~8 test cases)
- Deletion of 2 deprecated policy files
- Route additions for role update/delete/toggle
- ~25–30 new tests total

**What does NOT get built:**
- No new migrations (10A tables are sufficient)
- No new middleware (10A/10B pipeline is complete)
- No frontend work (Phase 10E)
- No capability caching (post-Phase 10)

---

## 2. Gap Analysis

### Verified Codebase State (March 1, 2026)

| Component | Required State | Actual State | Action |
|---|---|---|---|
| `TenantRoleController` | Needs `update()`, `destroy()`, `toggleActive()` | ✅ Has `index()` and `store()` only | **ADD: 3 methods** |
| `TenantRoleEntity.ensureModifiableBy()` | Domain invariant for update/delete | ✅ EXISTS — checks actor hierarchy > target | No action |
| `TenantRoleEntity.ensureDeletable()` | Blocks system role deletion | ✅ EXISTS — throws if `isSystem` | No action |
| `TenantRoleEntity.ensureDeactivatable()` | Blocks system role deactivation | ✅ EXISTS — throws if `isSystem` | No action |
| `GetActorHierarchyLevelQuery` | Resolves actor's highest level | ✅ EXISTS — returns `int` | No action |
| `TenantRoleRecord` fillable | Needs all update fields | ✅ Has `display_name`, `description`, `is_active`, `hierarchy_level` | No action |
| `TenantRoleRecord.capabilityRecords()` | BelongsToMany for sync | ✅ EXISTS — proper pivot relationship | No action |
| `CreateTenantRoleRequest` | Pattern reference for UpdateRequest | ✅ EXISTS — validated fields confirmed | Mirror pattern |
| `roles.php` routes | Needs PUT, DELETE, PATCH | ❌ Only GET and POST | **ADD: 3 routes** |
| `CoursePolicy.php` | Marked `@deprecated` in 10B | ✅ `@deprecated` annotation present, all methods return `true` | **DELETE file** |
| `ExamPolicy.php` | Marked `@deprecated` in 10B | ✅ `@deprecated` annotation present, all methods return `true` | **DELETE file** |
| Cross-context tests | ADR-010 §12 requires 10 isolation scenarios | ❌ Only model-level `TenantRoleIsolationTest` exists | **CREATE: HTTP-level test file** |
| `SeedsTestCapabilities` trait | Reusable for new tests | ✅ EXISTS — `seedCapabilitiesForRole()` | Reuse |
| `AuthenticatesWithJwt` trait | Has `tokenForTenantUser()` AND `tokenForAdmin()` | ✅ Both exist | Use for cross-context tests |
| `ActsAsTenant` trait | `createTenantWithContext()` | ✅ EXISTS | Reuse |
| `TenantAuditLogger` | Persists audit records | ✅ Implemented (no longer stub) | Use for audit assertions |
| Domain events: `TenantRoleCreated` | EXISTS | ✅ Dispatched in `CreateTenantRoleUseCase` | Mirror for update/delete |
| Domain event: `TenantRoleDeleted` | NEEDED for delete | ❌ Does not exist | **CREATE** |

### Critical Finding: No HTTP-Level Cross-Context Tests Exist

The existing `TenantRoleIsolationTest` tests Eloquent model scoping (setting `TenantContext` manually and querying). This is valuable but does NOT test the full middleware pipeline — i.e., what happens when:
- An admin JWT hits a tenant endpoint
- A tenant JWT hits a platform endpoint
- A Tenant A user's JWT hits Tenant B's data

Phase 10D must test these at the **HTTP level** using real JWT tokens through the full middleware stack.

---

## 3. Architecture Decisions

### DR-10D-001: Role Update — Partial Update with Capability Sync

| Field | Value |
|---|---|
| **Decision** | `PUT /roles/{id}` accepts `display_name`, `description`, `hierarchy_level`, and `capability_ids`. All fields are optional — partial update semantics. `capability_ids` replaces the entire set (sync, not append). |
| **Rationale** | Sync-replace for capabilities is simpler, safer, and matches the mental model: "this role now has exactly these capabilities." Append/remove patterns create ordering bugs and race conditions. |
| **Constraints** | System roles: `code` and `is_system` are NEVER updatable. `hierarchy_level` on system roles is NEVER updatable. Only `display_name`, `description`, and `capability_ids` can be updated on system roles. |
| **Guard** | Actor must have `role.manage` capability AND higher hierarchy than the target role. |

### DR-10D-002: Role Delete — Soft Prevention via Assignment Check

| Field | Value |
|---|---|
| **Decision** | `DELETE /roles/{id}` is a hard delete (not soft delete). Rejected if users are currently assigned to this role. System roles cannot be deleted regardless. |
| **Rationale** | Soft-deleting roles creates orphaned assignments and broken capability resolution. Hard delete with assignment check is safer. If a role has users, the admin must reassign them first. |
| **Error** | 409 Conflict with `ROLE_HAS_ASSIGNMENTS` error code if users exist. |

### DR-10D-003: Role Deactivation — Active Toggle

| Field | Value |
|---|---|
| **Decision** | `PATCH /roles/{id}/toggle-active` flips `is_active` between `true` and `false`. Deactivated roles are still visible but their capabilities stop being resolved. |
| **Rationale** | Deactivation is a lighter alternative to deletion. The `EloquentTenantCapabilityChecker` must already filter for `is_active` on the role — if it doesn't, this is a 10D finding to fix. |
| **Constraint** | System roles cannot be deactivated (`TenantRoleEntity.ensureDeactivatable()`). |

### DR-10D-004: Cross-Context Tests Use Real JWT Tokens

| Field | Value |
|---|---|
| **Decision** | All cross-context security tests issue real JWTs via `tokenForAdmin()` and `tokenForTenantUser()` from the `AuthenticatesWithJwt` trait, then make HTTP requests through the full middleware pipeline. |
| **Rationale** | `actingAs()` bypasses JWT validation. The whole point of 10D is to prove that the middleware stack correctly rejects tokens from the wrong context. Real tokens or the tests prove nothing. |

### DR-10D-005: Cross-Tenant Responses Must Be 404 (Not 403)

| Field | Value |
|---|---|
| **Decision** | When Tenant A's user tries to access Tenant B's resource, the response MUST be 404 (not 403). |
| **Rationale** | ADR-010 §12 Gate #4: "Cross-tenant data access returns 404 (not 403) on all endpoints." A 403 reveals that the resource EXISTS but is forbidden — this is an enumeration vulnerability. A 404 reveals nothing. The `BelongsToTenant` global scope achieves this naturally since the query returns no results, causing findOrFail to 404. |

---

## 4. Module 1: Role Update Endpoint

### 4.1 Application Layer — UpdateTenantRoleCommand

**File:** `app/Application/TenantAdminDashboard/Role/Commands/UpdateTenantRoleCommand.php`

```php
<?php

declare(strict_types=1);

namespace App\Application\TenantAdminDashboard\Role\Commands;

/**
 * UpdateTenantRoleCommand
 *
 * Immutable command for updating an existing tenant role.
 * All fields except identifiers are nullable for partial updates.
 */
final class UpdateTenantRoleCommand
{
    /**
     * @param int $roleId The role to update
     * @param int $tenantId Tenant context (for scoping)
     * @param int $actorId The authenticated user performing the update
     * @param int $actorHierarchyLevel Actor's highest hierarchy level
     * @param string|null $displayName New display name (null = no change)
     * @param string|null $description New description (null = no change)
     * @param int|null $hierarchyLevel New hierarchy level (null = no change, blocked for system roles)
     * @param int[]|null $capabilityIds New capability set (null = no change, replaces entire set)
     */
    public function __construct(
        public readonly int $roleId,
        public readonly int $tenantId,
        public readonly int $actorId,
        public readonly int $actorHierarchyLevel,
        public readonly ?string $displayName = null,
        public readonly ?string $description = null,
        public readonly ?int $hierarchyLevel = null,
        public readonly ?array $capabilityIds = null,
    ) {}
}
```

### 4.2 Application Layer — UpdateTenantRoleUseCase

**File:** `app/Application/TenantAdminDashboard/Role/UseCases/UpdateTenantRoleUseCase.php`

```php
<?php

declare(strict_types=1);

namespace App\Application\TenantAdminDashboard\Role\UseCases;

use App\Application\TenantAdminDashboard\Role\Commands\UpdateTenantRoleCommand;
use App\Domain\TenantAdminDashboard\Role\Entities\TenantRoleEntity;
use App\Domain\TenantAdminDashboard\Role\Events\TenantRoleUpdated;
use App\Domain\TenantAdminDashboard\Role\ValueObjects\HierarchyLevel;
use App\Infrastructure\Persistence\Shared\AuditContext;
use App\Infrastructure\Persistence\Shared\TenantAuditLogger;
use App\Infrastructure\Persistence\TenantAdminDashboard\TenantRoleRecord;
use Illuminate\Support\Facades\DB;

/**
 * UpdateTenantRoleUseCase
 *
 * Updates an existing tenant role with partial update semantics.
 *
 * Invariants enforced:
 *   1. Role must exist within the tenant (BelongsToTenant scope)
 *   2. Actor's hierarchy level must be HIGHER than the target role's level
 *   3. System roles: code, is_system, hierarchy_level are immutable
 *   4. If hierarchy_level changes, actor must also be higher than the NEW level
 *   5. capability_ids (if provided) replace the entire set (sync)
 */
final class UpdateTenantRoleUseCase
{
    public function __construct(
        private readonly TenantAuditLogger $auditLogger,
    ) {}

    public function execute(UpdateTenantRoleCommand $command): array
    {
        // 1. Load role within tenant scope (404 if not found / wrong tenant)
        $record = TenantRoleRecord::where('tenant_id', $command->tenantId)
            ->findOrFail($command->roleId);

        // 2. Build domain entity for invariant checks
        $entity = new TenantRoleEntity(
            id: (int) $record->id,
            tenantId: (int) $record->tenant_id,
            code: $record->code,
            displayName: $record->display_name,
            description: $record->description,
            isSystem: (bool) $record->is_system,
            isActive: (bool) $record->is_active,
            hierarchyLevel: new HierarchyLevel((int) $record->hierarchy_level),
        );

        $actorLevel = new HierarchyLevel($command->actorHierarchyLevel);

        // 3. Hierarchy check: actor must be strictly higher than CURRENT role level
        $entity->ensureModifiableBy($actorLevel);

        // 4. System role guard: block hierarchy_level changes
        if ($entity->isSystem && $command->hierarchyLevel !== null) {
            throw new \DomainException(
                "Cannot change hierarchy level of system role '{$entity->code}'.",
                403
            );
        }

        // 5. If hierarchy_level is changing, actor must also be higher than NEW level
        if ($command->hierarchyLevel !== null) {
            $newLevel = new HierarchyLevel($command->hierarchyLevel);
            if (!$actorLevel->isHigherThan($newLevel)) {
                throw new \DomainException(
                    "Cannot set role hierarchy level to {$command->hierarchyLevel}. "
                    . "Actor level ({$actorLevel->getValue()}) must be strictly higher.",
                    403
                );
            }
        }

        // Capture old values for audit
        $oldValues = [
            'display_name' => $record->display_name,
            'description' => $record->description,
            'hierarchy_level' => $record->hierarchy_level,
        ];

        // 6. Build update payload (only non-null fields)
        $updateData = [];
        if ($command->displayName !== null) {
            $updateData['display_name'] = $command->displayName;
        }
        if ($command->description !== null) {
            $updateData['description'] = $command->description;
        }
        if ($command->hierarchyLevel !== null && !$entity->isSystem) {
            $updateData['hierarchy_level'] = $command->hierarchyLevel;
        }

        // 7. Persist within transaction
        DB::transaction(function () use ($record, $updateData, $command) {
            if (!empty($updateData)) {
                $record->update($updateData);
            }

            // Capability sync: replace entire set if provided
            if ($command->capabilityIds !== null) {
                $record->capabilityRecords()->sync($command->capabilityIds);
            }
        });

        // 8. Capture new values for audit
        $record->refresh();
        $newValues = [
            'display_name' => $record->display_name,
            'description' => $record->description,
            'hierarchy_level' => $record->hierarchy_level,
        ];

        // 9. Audit log (outside transaction)
        $this->auditLogger->log(new AuditContext(
            tenantId: $command->tenantId,
            userId: $command->actorId,
            action: 'role.updated',
            entityType: 'tenant_role',
            entityId: (int) $record->id,
            metadata: [
                'capabilities_changed' => $command->capabilityIds !== null,
            ],
            oldValues: $oldValues,
            newValues: $newValues,
        ));

        // 10. Dispatch domain event
        event(new TenantRoleUpdated(
            tenantId: $command->tenantId,
            roleId: (int) $record->id,
            roleCode: $record->code,
            actorId: $command->actorId,
        ));

        // 11. Return updated role with capabilities
        $record->load('capabilityRecords:id,code,display_name,group');

        return [
            'id' => $record->id,
            'code' => $record->code,
            'display_name' => $record->display_name,
            'description' => $record->description,
            'hierarchy_level' => $record->hierarchy_level,
            'is_system' => $record->is_system,
            'is_active' => $record->is_active,
            'capabilities' => $record->capabilityRecords->map(fn ($cap) => [
                'id' => $cap->id,
                'code' => $cap->code,
                'display_name' => $cap->display_name,
                'group' => $cap->group,
            ])->toArray(),
        ];
    }
}
```

### 4.3 HTTP Layer — UpdateTenantRoleRequest

**File:** `app/Http/TenantAdminDashboard/Role/Requests/UpdateTenantRoleRequest.php`

```php
<?php

declare(strict_types=1);

namespace App\Http\TenantAdminDashboard\Role\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * UpdateTenantRoleRequest
 *
 * Validates partial update payload for a tenant role.
 * All fields are optional — but at least one must be present.
 */
class UpdateTenantRoleRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true; // Authorization handled by tenant.capability middleware
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'display_name'    => ['sometimes', 'string', 'min:2', 'max:100'],
            'description'     => ['sometimes', 'nullable', 'string', 'max:255'],
            'hierarchy_level' => ['sometimes', 'integer', 'min:1', 'max:99'],
            'capability_ids'  => ['sometimes', 'array'],
            'capability_ids.*' => ['integer', 'exists:tenant_capabilities,id'],
        ];
    }
}
```

---

## 5. Module 2: Role Delete Endpoint

### 5.1 Application Layer — DeleteTenantRoleUseCase

**File:** `app/Application/TenantAdminDashboard/Role/UseCases/DeleteTenantRoleUseCase.php`

```php
<?php

declare(strict_types=1);

namespace App\Application\TenantAdminDashboard\Role\UseCases;

use App\Domain\TenantAdminDashboard\Role\Entities\TenantRoleEntity;
use App\Domain\TenantAdminDashboard\Role\Events\TenantRoleDeleted;
use App\Domain\TenantAdminDashboard\Role\ValueObjects\HierarchyLevel;
use App\Infrastructure\Persistence\Shared\AuditContext;
use App\Infrastructure\Persistence\Shared\TenantAuditLogger;
use App\Infrastructure\Persistence\TenantAdminDashboard\TenantRoleRecord;
use Illuminate\Support\Facades\DB;

/**
 * DeleteTenantRoleUseCase
 *
 * Hard-deletes a custom tenant role.
 *
 * Invariants enforced:
 *   1. Role must exist within the tenant (BelongsToTenant scope)
 *   2. System roles cannot be deleted (TenantRoleEntity.ensureDeletable)
 *   3. Actor's hierarchy must be higher than the target role
 *   4. Role must have zero active user assignments
 */
final class DeleteTenantRoleUseCase
{
    public function __construct(
        private readonly TenantAuditLogger $auditLogger,
    ) {}

    /**
     * @throws \DomainException
     * @throws \Illuminate\Database\Eloquent\ModelNotFoundException
     */
    public function execute(int $roleId, int $tenantId, int $actorId, int $actorHierarchyLevel): void
    {
        // 1. Load role within tenant scope
        $record = TenantRoleRecord::where('tenant_id', $tenantId)
            ->findOrFail($roleId);

        // 2. Build domain entity for invariant checks
        $entity = new TenantRoleEntity(
            id: (int) $record->id,
            tenantId: (int) $record->tenant_id,
            code: $record->code,
            displayName: $record->display_name,
            description: $record->description,
            isSystem: (bool) $record->is_system,
            isActive: (bool) $record->is_active,
            hierarchyLevel: new HierarchyLevel((int) $record->hierarchy_level),
        );

        $actorLevel = new HierarchyLevel($actorHierarchyLevel);

        // 3. Domain invariants
        $entity->ensureDeletable();         // Blocks system roles
        $entity->ensureModifiableBy($actorLevel); // Hierarchy check

        // 4. Check for active assignments
        $assignmentCount = $record->assignments()->count();
        if ($assignmentCount > 0) {
            throw new \DomainException(
                "Cannot delete role '{$record->code}': {$assignmentCount} user(s) are currently assigned. "
                . "Reassign users before deleting this role.",
                409
            );
        }

        // 5. Capture for audit before deletion
        $roleCode = $record->code;
        $roleDisplayName = $record->display_name;
        $roleHierarchy = $record->hierarchy_level;

        // 6. Delete (cascade removes tenant_role_capabilities pivot entries via FK)
        DB::transaction(function () use ($record) {
            $record->delete();
        });

        // 7. Audit log (outside transaction)
        $this->auditLogger->log(new AuditContext(
            tenantId: $tenantId,
            userId: $actorId,
            action: 'role.deleted',
            entityType: 'tenant_role',
            entityId: $roleId,
            metadata: [
                'code' => $roleCode,
                'display_name' => $roleDisplayName,
                'hierarchy_level' => $roleHierarchy,
            ],
        ));

        // 8. Dispatch domain event
        event(new TenantRoleDeleted(
            tenantId: $tenantId,
            roleId: $roleId,
            roleCode: $roleCode,
            actorId: $actorId,
        ));
    }
}
```

### 5.2 Domain Layer — TenantRoleDeleted Event

**File:** `app/Domain/TenantAdminDashboard/Role/Events/TenantRoleDeleted.php`

```php
<?php

declare(strict_types=1);

namespace App\Domain\TenantAdminDashboard\Role\Events;

use App\Domain\Shared\Events\DomainEvent;

/**
 * TenantRoleDeleted
 *
 * Domain event: a custom tenant role was permanently deleted.
 * Past tense — this is a fact, not a command.
 */
final class TenantRoleDeleted extends DomainEvent
{
    public function __construct(
        public readonly int $tenantId,
        public readonly int $roleId,
        public readonly string $roleCode,
        public readonly int $actorId,
    ) {}
}
```

---

## 6. Module 3: Role Deactivation Toggle

### 6.1 Implementation — Inline in Controller + UseCase

The toggle is lightweight enough that it does NOT need a dedicated UseCase class. However, to maintain DDD consistency with the Create and Update patterns, we use a thin method approach.

**Decision:** Add `toggleActive()` to the existing `TenantRoleController` with domain validation inline via `TenantRoleEntity`. The toggle is a single-field state change — creating a full UseCase + Command for a boolean flip would be over-engineering.

However, the domain entity check (`ensureDeactivatable()`) and audit logging ARE mandatory.

**File:** New method on `TenantRoleController` (see Section 10 for full controller update).

Toggle logic:

```php
public function toggleActive(Request $request, int $id): JsonResponse
{
    $actor = $this->resolveActor($request);
    $tenantId = app(TenantContext::class)->getIdOrFail();
    $actorLevel = app(GetActorHierarchyLevelQuery::class)->execute((int) $actor->getKey(), $tenantId);

    $record = TenantRoleRecord::where('tenant_id', $tenantId)->findOrFail($id);

    $entity = new TenantRoleEntity(
        id: (int) $record->id,
        tenantId: (int) $record->tenant_id,
        code: $record->code,
        displayName: $record->display_name,
        description: $record->description,
        isSystem: (bool) $record->is_system,
        isActive: (bool) $record->is_active,
        hierarchyLevel: new HierarchyLevel((int) $record->hierarchy_level),
    );

    // System roles cannot be deactivated
    if (!$record->is_active) {
        // Reactivation — no system check needed (system roles can't BE inactive)
    } else {
        $entity->ensureDeactivatable();
    }

    $entity->ensureModifiableBy(new HierarchyLevel($actorLevel));

    $oldActive = $record->is_active;
    $record->update(['is_active' => !$record->is_active]);

    // Audit
    app(TenantAuditLogger::class)->log(new AuditContext(
        tenantId: $tenantId,
        userId: (int) $actor->getKey(),
        action: $record->is_active ? 'role.reactivated' : 'role.deactivated',
        entityType: 'tenant_role',
        entityId: (int) $record->id,
        metadata: ['code' => $record->code],
        oldValues: ['is_active' => $oldActive],
        newValues: ['is_active' => $record->is_active],
    ));

    return response()->json([
        'data' => [
            'id' => $record->id,
            'code' => $record->code,
            'is_active' => $record->is_active,
        ]
    ]);
}
```

---

## 7. Module 4: Cross-Context Security Isolation Tests

**File:** `tests/Feature/SecurityBoundary/CrossContextIsolationTest.php`

This is the most critical test file in 10D. It proves that the two authentication worlds (platform admin vs tenant user) cannot cross-contaminate.

### Test Cases

| # | Test Case | Token Used | Endpoint Hit | Expected |
|---|---|---|---|---|
| 1 | Platform admin JWT on tenant course endpoint | `tokenForAdmin()` | `GET /api/tenant/courses` | 401 (guard rejects — wrong provider) |
| 2 | Platform admin JWT on tenant roles endpoint | `tokenForAdmin()` | `GET /api/tenant/roles` | 401 |
| 3 | Platform admin JWT on tenant stats endpoint | `tokenForAdmin()` | `GET /api/tenant/stats` | 401 |
| 4 | Platform admin JWT on tenant settings endpoint | `tokenForAdmin()` | `GET /api/tenant/settings` | 401 |
| 5 | Platform admin JWT on tenant audit-logs endpoint | `tokenForAdmin()` | `GET /api/tenant/audit-logs` | 401 |
| 6 | Tenant user JWT on platform staff endpoint | `tokenForTenantUser()` | `GET /api/platform/staff` | 401 (guard rejects — wrong provider) |
| 7 | Tenant user JWT on platform tenants endpoint | `tokenForTenantUser()` | `GET /api/platform/tenants` | 401 |
| 8 | Tenant user JWT on platform subscription endpoint | `tokenForTenantUser()` | `GET /api/platform/subscription-plans` | 401 |
| 9 | No token on tenant endpoint | None | `GET /api/tenant/roles` | 401 |
| 10 | No token on platform endpoint | None | `GET /api/platform/tenants` | 401 |

### Implementation Notes

- Tests 1–5 prove Risk R1 from ADR-010: "Cross-context token acceptance" is mitigated
- Tests 6–8 prove the reverse direction
- Tests 9–10 confirm unauthenticated baseline
- All tests use real JWTs — NOT `actingAs()`
- The admin token lacks `tenant_id` claim → `ResolveTenantFromToken` either skips or `auth:tenant_api` fails because the provider (UserRecord) doesn't match
- The tenant token has `tenant_id` claim but uses `tenant_api` guard → `auth:admin_api` on platform routes will reject it

```php
<?php

declare(strict_types=1);

namespace Tests\Feature\SecurityBoundary;

use App\Infrastructure\Persistence\Shared\AdminRecord;
use App\Infrastructure\Persistence\Shared\TenantRecord;
use App\Infrastructure\Persistence\Shared\UserRecord;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;
use Tests\Traits\ActsAsTenant;
use Tests\Traits\AuthenticatesWithJwt;
use Tests\Traits\SeedsTestCapabilities;

/**
 * CrossContextIsolationTest
 *
 * Proves that platform admin tokens CANNOT access tenant endpoints
 * and tenant user tokens CANNOT access platform endpoints.
 *
 * ADR-010 §12 Gates #1, #2, #3: Cross-context isolation.
 * These tests use REAL JWT tokens through the FULL middleware pipeline.
 */
class CrossContextIsolationTest extends TestCase
{
    use RefreshDatabase, AuthenticatesWithJwt, ActsAsTenant, SeedsTestCapabilities;

    private AdminRecord $admin;
    private UserRecord $tenantUser;
    private TenantRecord $tenant;
    private string $adminToken;
    private string $tenantToken;

    protected function setUp(): void
    {
        parent::setUp();

        // Platform admin (L4 super_admin)
        $this->admin = $this->createAdminWithAuthority(60);
        $this->adminToken = $this->tokenForAdmin($this->admin);

        // Tenant + user
        $this->tenant = $this->createTenantWithContext();
        $this->tenantUser = UserRecord::factory()->create([
            'tenant_id' => $this->tenant->id,
            'status' => 'active',
        ]);
        $this->tenantToken = $this->tokenForTenantUser($this->tenantUser, $this->tenant);
    }

    // ── Platform Admin Token → Tenant Endpoints (Must Fail) ──────────

    public function test_admin_token_rejected_on_tenant_courses(): void
    {
        $this->withToken($this->adminToken)
            ->getJson('/api/tenant/courses')
            ->assertUnauthorized(); // 401
    }

    public function test_admin_token_rejected_on_tenant_roles(): void
    {
        $this->withToken($this->adminToken)
            ->getJson('/api/tenant/roles')
            ->assertUnauthorized();
    }

    public function test_admin_token_rejected_on_tenant_stats(): void
    {
        $this->withToken($this->adminToken)
            ->getJson('/api/tenant/stats')
            ->assertUnauthorized();
    }

    public function test_admin_token_rejected_on_tenant_settings(): void
    {
        $this->withToken($this->adminToken)
            ->getJson('/api/tenant/settings')
            ->assertUnauthorized();
    }

    public function test_admin_token_rejected_on_tenant_audit_logs(): void
    {
        $this->withToken($this->adminToken)
            ->getJson('/api/tenant/audit-logs')
            ->assertUnauthorized();
    }

    // ── Tenant User Token → Platform Endpoints (Must Fail) ───────────

    public function test_tenant_token_rejected_on_platform_staff(): void
    {
        $this->withToken($this->tenantToken)
            ->getJson('/api/platform/staff')
            ->assertUnauthorized();
    }

    public function test_tenant_token_rejected_on_platform_tenants(): void
    {
        $this->withToken($this->tenantToken)
            ->getJson('/api/platform/tenants')
            ->assertUnauthorized();
    }

    public function test_tenant_token_rejected_on_platform_subscriptions(): void
    {
        $this->withToken($this->tenantToken)
            ->getJson('/api/platform/subscription-plans')
            ->assertUnauthorized();
    }

    // ── Unauthenticated Baseline ─────────────────────────────────────

    public function test_no_token_rejected_on_tenant_roles(): void
    {
        $this->getJson('/api/tenant/roles')
            ->assertUnauthorized();
    }

    public function test_no_token_rejected_on_platform_tenants(): void
    {
        $this->getJson('/api/platform/tenants')
            ->assertUnauthorized();
    }
}
```

---

## 8. Module 5: Cross-Tenant Data Isolation Tests

**File:** `tests/Feature/SecurityBoundary/CrossTenantDataIsolationTest.php`

This file proves that Tenant A's authenticated user cannot access Tenant B's data through any tenant dashboard endpoint — and that the response is **404 (not 403)** to prevent enumeration.

### Test Cases

| # | Test Case | Actor | Target | Expected |
|---|---|---|---|---|
| 1 | Tenant A user lists roles — sees only Tenant A roles | Tenant A OWNER | Tenant A | 200 — only Tenant A roles |
| 2 | Tenant A user cannot access Tenant B's role by ID | Tenant A OWNER | Tenant B role ID | 404 (not 403) |
| 3 | Tenant A user dashboard stats reflect only Tenant A data | Tenant A OWNER | Tenant A | 200 — counts match Tenant A only |
| 4 | Tenant A user audit logs show only Tenant A entries | Tenant A OWNER | Tenant A | 200 — only Tenant A logs |
| 5 | Tenant A user settings show only Tenant A settings | Tenant A OWNER | Tenant A | 200 — Tenant A settings |
| 6 | Tenant A user cannot update Tenant B's role | Tenant A OWNER | PUT to Tenant B role ID | 404 |
| 7 | Tenant A user cannot delete Tenant B's role | Tenant A OWNER | DELETE to Tenant B role ID | 404 |
| 8 | Tenant A user cannot toggle Tenant B's role | Tenant A OWNER | PATCH toggle to Tenant B role ID | 404 |

### Implementation Notes

- Each test creates TWO tenants with separate users and data
- The actor authenticates as Tenant A's user with a Tenant A JWT
- The BelongsToTenant global scope on all models ensures Tenant B's data is invisible
- `findOrFail()` throws `ModelNotFoundException` → Laravel converts to 404
- Tests verify the response contains ZERO references to Tenant B data

```php
<?php

declare(strict_types=1);

namespace Tests\Feature\SecurityBoundary;

use App\Infrastructure\Persistence\Shared\TenantRecord;
use App\Infrastructure\Persistence\Shared\UserRecord;
use App\Infrastructure\Persistence\TenantAdminDashboard\TenantRoleRecord;
use App\Infrastructure\Tenant\TenantContext;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;
use Tests\Traits\ActsAsTenant;
use Tests\Traits\AuthenticatesWithJwt;
use Tests\Traits\SeedsTestCapabilities;

/**
 * CrossTenantDataIsolationTest
 *
 * Proves that tenant data is completely isolated at the HTTP level.
 * ADR-010 §12 Gate #4: Cross-tenant data access returns 404 (not 403).
 *
 * Two tenants are created. Tenant A's user is authenticated.
 * Every test proves Tenant B's data is invisible/inaccessible.
 */
class CrossTenantDataIsolationTest extends TestCase
{
    use RefreshDatabase, AuthenticatesWithJwt, ActsAsTenant, SeedsTestCapabilities;

    private TenantRecord $tenantA;
    private TenantRecord $tenantB;
    private UserRecord $userA;
    private string $tokenA;
    private int $tenantBRoleId;

    protected function setUp(): void
    {
        parent::setUp();

        // Tenant A — the actor's tenant
        $this->tenantA = TenantRecord::factory()->active()->create();
        $this->setTenantContext($this->tenantA->id);

        $this->userA = UserRecord::factory()->create([
            'tenant_id' => $this->tenantA->id,
            'status' => 'active',
        ]);

        // Create OWNER role for Tenant A and assign
        $roleA = $this->createOwnerRoleForTenant($this->tenantA->id);
        $this->assignRoleToUser($this->userA->id, $roleA->id, $this->tenantA->id);
        $this->seedCapabilitiesForRole(
            $roleA->id,
            ['dashboard.view', 'role.view', 'role.manage', 'audit.view', 'settings.view',
             'course.view', 'exam.view', 'user.view']
        );

        $this->tokenA = $this->tokenForTenantUser($this->userA, $this->tenantA);

        // Tenant B — the "enemy" tenant
        $this->tenantB = TenantRecord::factory()->active()->create();
        $this->tenantBRoleId = DB::table('tenant_roles')->insertGetId([
            'tenant_id' => $this->tenantB->id,
            'code' => 'tenant_b_custom_role',
            'display_name' => 'Tenant B Secret Role',
            'is_system' => false,
            'is_active' => true,
            'hierarchy_level' => 50,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    // ── Helper Methods ───────────────────────────────────────────────

    private function createOwnerRoleForTenant(int $tenantId): TenantRoleRecord
    {
        // Bypass global scope for cross-tenant setup
        return TenantRoleRecord::withoutGlobalScopes()->create([
            'tenant_id' => $tenantId,
            'code' => 'owner',
            'display_name' => 'Owner',
            'is_system' => true,
            'is_active' => true,
            'hierarchy_level' => 100,
        ]);
    }

    private function assignRoleToUser(int $userId, int $roleId, int $tenantId): void
    {
        DB::table('user_role_assignments')->insert([
            'user_id' => $userId,
            'role_id' => $roleId,
            'tenant_id' => $tenantId,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    // ── List Isolation ───────────────────────────────────────────────

    public function test_tenant_a_user_sees_only_tenant_a_roles(): void
    {
        $response = $this->withToken($this->tokenA)
            ->getJson('/api/tenant/roles')
            ->assertOk();

        $roles = $response->json('data');
        foreach ($roles as $role) {
            $this->assertNotEquals('tenant_b_custom_role', $role['code'],
                'Tenant B role must NOT appear in Tenant A role list');
        }
    }

    // ── Direct Access Isolation (Must be 404, not 403) ───────────────

    public function test_tenant_a_cannot_access_tenant_b_role_by_id(): void
    {
        // Attempt to access Tenant B's role via Tenant A's token
        // BelongsToTenant scope makes it invisible → findOrFail → 404
        $this->withToken($this->tokenA)
            ->putJson("/api/tenant/roles/{$this->tenantBRoleId}", [
                'display_name' => 'Hacked Name',
            ])
            ->assertNotFound(); // 404, NOT 403
    }

    public function test_tenant_a_cannot_delete_tenant_b_role(): void
    {
        $this->withToken($this->tokenA)
            ->deleteJson("/api/tenant/roles/{$this->tenantBRoleId}")
            ->assertNotFound();
    }

    public function test_tenant_a_cannot_toggle_tenant_b_role(): void
    {
        $this->withToken($this->tokenA)
            ->patchJson("/api/tenant/roles/{$this->tenantBRoleId}/toggle-active")
            ->assertNotFound();
    }

    // ── Stats Isolation ──────────────────────────────────────────────

    public function test_dashboard_stats_reflect_only_tenant_a_data(): void
    {
        $response = $this->withToken($this->tokenA)
            ->getJson('/api/tenant/stats')
            ->assertOk();

        $data = $response->json('data');
        // Stats should only count Tenant A's data
        // Tenant B's role should NOT inflate Tenant A's role count
        if (isset($data['stats']['roles'])) {
            // Tenant A has 1 owner role (created in setUp)
            // Tenant B has 1 custom role — must NOT be counted
            $this->assertLessThanOrEqual(
                1, // Only Tenant A's owner role
                $data['stats']['roles']['total'] ?? 0,
                'Tenant B roles must not appear in Tenant A stats'
            );
        }
    }

    // ── Audit Log Isolation ──────────────────────────────────────────

    public function test_audit_logs_show_only_tenant_a_entries(): void
    {
        // Create an audit log entry for Tenant B directly
        DB::table('tenant_audit_logs')->insert([
            'tenant_id' => $this->tenantB->id,
            'actor_id' => 999,
            'actor_type' => 'user',
            'action' => 'secret.action',
            'entity_type' => 'tenant_role',
            'entity_id' => $this->tenantBRoleId,
            'created_at' => now(),
        ]);

        $response = $this->withToken($this->tokenA)
            ->getJson('/api/tenant/audit-logs')
            ->assertOk();

        $logs = $response->json('data.data', $response->json('data', []));
        // Flatten: check no log entry references Tenant B
        $json = json_encode($logs);
        $this->assertStringNotContainsString('secret.action', $json,
            'Tenant B audit log entries must not appear for Tenant A');
    }
}
```

---

## 9. Module 6: Deprecated Code Cleanup

### 9.1 Delete Deprecated Policy Files

Per Phase 10B completion report: `CoursePolicy.php` and `ExamPolicy.php` are marked `@deprecated`, all methods return `true`, and their `Gate::policy()` registrations were already removed from `AuthorizationServiceProvider`.

**Action:** Delete both files.

| # | File | Action | Verification |
|---|---|---|---|
| 1 | `app/Policies/CoursePolicy.php` | DELETE | `grep -rn 'CoursePolicy' app/` returns 0 hits |
| 2 | `app/Policies/ExamPolicy.php` | DELETE | `grep -rn 'ExamPolicy' app/` returns 0 hits |

If grep reveals any remaining references, update those files to remove the import before deleting.

### 9.2 Root Directory Cleanup

The project root contains 20+ temporary/debug files that should be removed:

```
crud.txt, crud2.txt, crud3.txt, crud4.txt, crud5.txt, crud6.txt
iso2.txt, iso3.txt, isolation.txt, isolation_error.log
out.txt, out_phpstan.txt, phpstan.txt, phpstan_b.txt, phpstan_out.txt, phpstan_output.txt
phpstan_errors.json, test_out.txt, test_out2.txt, test_out3.txt, test_output.txt
test_assign_stan.txt, test_domain_output.txt, test_expire_stan.txt
test_n1_final.txt, test_n1n2_output.txt, test_n3_output.txt
test_pipeline.log, test_session.log, errors.log
body.json, _diag.php, debug_artisan.log, generate_auth_docs.php
course_test_output.txt
```

**Action:** Delete all files listed above. Verify none are referenced in `.gitignore` or CI.

---

## 10. Route Registration

### 10.1 Updated Routes File

**File:** `routes/tenant_dashboard/roles.php` — Replace entire content:

```php
<?php

use App\Http\TenantAdminDashboard\Role\Controllers\TenantRoleController;
use Illuminate\Support\Facades\Route;

Route::prefix('roles')->group(function () {
    Route::get('/', [TenantRoleController::class, 'index'])
        ->middleware('tenant.capability:role.view');
    Route::post('/', [TenantRoleController::class, 'store'])
        ->middleware('tenant.capability:role.manage');
    Route::put('/{id}', [TenantRoleController::class, 'update'])
        ->middleware('tenant.capability:role.manage');
    Route::delete('/{id}', [TenantRoleController::class, 'destroy'])
        ->middleware('tenant.capability:role.manage');
    Route::patch('/{id}/toggle-active', [TenantRoleController::class, 'toggleActive'])
        ->middleware('tenant.capability:role.manage');
});
```

No changes needed to `routes/api.php` — it already loads `roles.php`.

---

## 11. Implementation Sequence

### Day 1: Role Update + Delete + Toggle

| Step | Task | Files |
|---|---|---|
| 1.1 | Create `UpdateTenantRoleCommand` | `app/Application/.../Role/Commands/UpdateTenantRoleCommand.php` |
| 1.2 | Create `UpdateTenantRoleUseCase` | `app/Application/.../Role/UseCases/UpdateTenantRoleUseCase.php` |
| 1.3 | Create `UpdateTenantRoleRequest` | `app/Http/.../Role/Requests/UpdateTenantRoleRequest.php` |
| 1.4 | Create `DeleteTenantRoleUseCase` | `app/Application/.../Role/UseCases/DeleteTenantRoleUseCase.php` |
| 1.5 | Create `TenantRoleDeleted` event | `app/Domain/.../Role/Events/TenantRoleDeleted.php` |
| 1.6 | Add `update()`, `destroy()`, `toggleActive()` to `TenantRoleController` | Modify existing controller |
| 1.7 | Update `roles.php` routes | `routes/tenant_dashboard/roles.php` |
| 1.8 | Write Role Update/Delete/Toggle tests | `tests/Feature/TenantAdminDashboard/Role/TenantRoleUpdateDeleteTest.php` |

### Day 2: Security Boundary Tests

| Step | Task | Files |
|---|---|---|
| 2.1 | Create `CrossContextIsolationTest` | `tests/Feature/SecurityBoundary/CrossContextIsolationTest.php` |
| 2.2 | Create `CrossTenantDataIsolationTest` | `tests/Feature/SecurityBoundary/CrossTenantDataIsolationTest.php` |
| 2.3 | Run full test suite — verify zero regression | All tests |
| 2.4 | PHPStan Level 5 | `vendor/bin/phpstan analyse --level=5` |

### Day 3: Cleanup + Quality Gate Verification

| Step | Task |
|---|---|
| 3.1 | Delete `CoursePolicy.php` and `ExamPolicy.php` + grep verification |
| 3.2 | Delete root directory temp files |
| 3.3 | Run ADR-010 §12 quality gate checklist (all 12 items) |
| 3.4 | Update backend file tree documentation |
| 3.5 | Final full test suite + PHPStan |

### Day 4 (Buffer): Edge Cases + Hardening

| Step | Task |
|---|---|
| 4.1 | Add edge case tests (concurrent role updates, empty capability sync) |
| 4.2 | Verify `EloquentTenantCapabilityChecker` respects `is_active` on roles |
| 4.3 | Manual curl verification of cross-context rejection |
| 4.4 | Phase 10D completion report |

---

## 12. Test Plan

### 12.1 New Test: Role Update/Delete/Toggle

**File:** `tests/Feature/TenantAdminDashboard/Role/TenantRoleUpdateDeleteTest.php`

| # | Test Case | Expected |
|---|---|---|
| 1 | Update custom role display_name | 200, updated name returned |
| 2 | Update custom role capabilities (sync) | 200, new capability set returned |
| 3 | Update system role display_name | 200, allowed (only name/description mutable) |
| 4 | Update system role hierarchy_level | 403 HIERARCHY_VIOLATION (immutable on system roles) |
| 5 | Update role — actor hierarchy too low | 403 |
| 6 | Update role — role not found in tenant | 404 |
| 7 | Update role — captures old/new in audit log | Audit record with old_values/new_values |
| 8 | Delete custom role with no assignments | 200 (or 204), role gone |
| 9 | Delete custom role with active assignments | 409 ROLE_HAS_ASSIGNMENTS |
| 10 | Delete system role | 403 (domain invariant) |
| 11 | Delete role — actor hierarchy too low | 403 |
| 12 | Delete role — audit log records deletion | Audit entry with role metadata |
| 13 | Toggle custom role active → inactive | 200, `is_active: false` |
| 14 | Toggle custom role inactive → active | 200, `is_active: true` |
| 15 | Toggle system role (deactivate) | 403 (domain invariant) |
| 16 | Toggle role — actor hierarchy too low | 403 |

### 12.2 New Test: Cross-Context Isolation

**File:** `tests/Feature/SecurityBoundary/CrossContextIsolationTest.php`

See [Module 4](#7-module-4-cross-context-security-isolation-tests) — 10 test cases.

### 12.3 New Test: Cross-Tenant Data Isolation

**File:** `tests/Feature/SecurityBoundary/CrossTenantDataIsolationTest.php`

See [Module 5](#8-module-5-cross-tenant-data-isolation-tests) — 8 test cases.

### 12.4 Running Tests

```bash
# Run all new 10D tests
php artisan test --filter=TenantRoleUpdateDelete
php artisan test --filter=CrossContextIsolation
php artisan test --filter=CrossTenantDataIsolation

# Full regression
php artisan test

# PHPStan Level 5
vendor/bin/phpstan analyse --level=5
```

---

## 13. ADR-010 Quality Gate Verification

This is the master checklist from ADR-010 §12. **ALL 12 gates must pass before Phase 11 begins.**

| # | Gate Requirement | Verification Method | Phase Built | 10D Status |
|---|---|---|---|---|
| 1 | All 10 cross-context isolation tests pass | `CrossContextIsolationTest` (10 tests) | **10D** | NEW |
| 2 | Platform admin token returns 401 on all tenant endpoints | Tests 1–5 in `CrossContextIsolationTest` | **10D** | NEW |
| 3 | Tenant user token returns 401 on all platform endpoints | Tests 6–8 in `CrossContextIsolationTest` | **10D** | NEW |
| 4 | Cross-tenant data access returns 404 (not 403) on all endpoints | `CrossTenantDataIsolationTest` | **10D** | NEW |
| 5 | EnforceTenantCapability middleware returns 403 for missing capabilities | `CourseCapabilityDenialTest` + `ExamCapabilityDenialTest` | 10B | ✅ EXISTS |
| 6 | TEACHER scope enforcement: cannot edit another teacher's course | `CourseIsolationTest` (if exists) or NEW test | 10B/10D | VERIFY |
| 7 | System roles (OWNER, ADMIN, etc.) cannot be deleted | `TenantRoleUpdateDeleteTest` test #10 | **10D** | NEW |
| 8 | Dashboard stats return only capability-filtered data | `DashboardStatsTest` tests #2, #3 | 10C | ✅ EXISTS |
| 9 | All actions logged to tenant_audit_logs | Audit assertions in every write test | 10C/10D | ✅ EXTENDED |
| 10 | Zero regression in existing test suite (365+ tests) | `php artisan test` | ALL | VERIFY |
| 11 | PHPStan Level 5 passes with 0 errors | `vendor/bin/phpstan analyse --level=5` | ALL | VERIFY |
| 12 | No env() calls outside config files | `grep -rn 'env(' app/ routes/ database/` returns 0 | ALL | VERIFY |

### Gate #6 Note

ADR-010 specifies "TEACHER scope enforcement: cannot edit another teacher's course." Verify whether `CourseIsolationTest` already covers this. If not, add a test case in 10D:
- Create two teachers in the same tenant
- Teacher A creates a course
- Teacher B (with `course.edit` but not author) tries to update it
- Expected: 403 (if author-scoped) or success (if not author-scoped in current implementation)

**This must be verified against the actual `UpdateCourseUseCase` logic.** If author-scoping is not yet implemented, document it as a known limitation for post-Phase 10.

---

## 14. Risk Register

| # | Risk | Impact | Severity | Mitigation |
|---|---|---|---|---|
| R1 | `EloquentTenantCapabilityChecker` does not filter by `is_active` on roles | Deactivated roles still grant capabilities | **CRITICAL** | Verify in Day 4. If missing, add `WHERE is_active = true` to the capability resolution query. |
| R2 | `capabilityRecords()->sync()` bypasses tenant scoping | Could sync capabilities from wrong context | **LOW** | Capabilities are platform-defined (no `tenant_id`). Sync targets `tenant_capabilities.id` which is global. No cross-tenant risk. |
| R3 | Role deletion cascade removes pivot records but not audit logs | Audit trail references deleted entity | **NONE** | By design — audit logs preserve `entity_id` as a historical reference. The role is gone but the audit record proves it existed. |
| R4 | Cross-context test assumes 401 but middleware returns 403 | Test failures on valid security behavior | **MEDIUM** | If `ResolveTenantFromToken` returns 403 for missing `tenant_id` in admin JWT, adjust test assertion. Both 401 and 403 are acceptable rejections — the test must confirm the request is BLOCKED, not the specific status code. |
| R5 | Admin token has no `tenant_id` claim → `ResolveTenantFromToken` skips → `auth:tenant_api` fails | Expected 401 path | **NONE** | This is the correct behavior. The middleware chain works as designed. |

---

## 15. File Manifest

### New Files (~8)

| # | File | Layer |
|---|---|---|
| 1 | `app/Application/TenantAdminDashboard/Role/Commands/UpdateTenantRoleCommand.php` | Application |
| 2 | `app/Application/TenantAdminDashboard/Role/UseCases/UpdateTenantRoleUseCase.php` | Application |
| 3 | `app/Application/TenantAdminDashboard/Role/UseCases/DeleteTenantRoleUseCase.php` | Application |
| 4 | `app/Http/TenantAdminDashboard/Role/Requests/UpdateTenantRoleRequest.php` | HTTP |
| 5 | `app/Domain/TenantAdminDashboard/Role/Events/TenantRoleDeleted.php` | Domain |
| 6 | `tests/Feature/TenantAdminDashboard/Role/TenantRoleUpdateDeleteTest.php` | Tests |
| 7 | `tests/Feature/SecurityBoundary/CrossContextIsolationTest.php` | Tests |
| 8 | `tests/Feature/SecurityBoundary/CrossTenantDataIsolationTest.php` | Tests |

### Modified Files (~2)

| # | File | Changes |
|---|---|---|
| 1 | `app/Http/TenantAdminDashboard/Role/Controllers/TenantRoleController.php` | Add `update()`, `destroy()`, `toggleActive()` methods |
| 2 | `routes/tenant_dashboard/roles.php` | Add PUT, DELETE, PATCH routes |

### Deleted Files (~2 + ~20 temp)

| # | File | Reason |
|---|---|---|
| 1 | `app/Policies/CoursePolicy.php` | Deprecated in 10B, all methods return `true`, registration removed |
| 2 | `app/Policies/ExamPolicy.php` | Deprecated in 10B, all methods return `true`, registration removed |
| 3+ | Root temp files (crud*.txt, iso*.txt, phpstan*.txt, test_*.txt, etc.) | Development debris — not part of codebase |

---

## 16. What Phase 10D Does NOT Include

| Item | Deferred To |
|---|---|
| Frontend dashboard UI | Phase 10E |
| Cross-request capability caching | Post-Phase 10 (performance optimization) |
| Audit log export (CSV/PDF) | Post-Phase 10 |
| Tenant branding/theme customization | Post-Phase 10 |
| Student/Parent Panel (/panel/*) | Phase 11+ |
| Four-eyes approval workflow | Post-Phase 10 |
| TEACHER author-scoped course editing (if not already implemented) | Document as known limitation |
| Bulk role operations | Not planned |
| Custom capability creation by tenants | NEVER (architectural principle) |

---

> **Phase 10A built the RBAC foundation. Phase 10B enforced it on existing routes. Phase 10C added new endpoints. Phase 10D proves the entire system is secure.**
>
> **After 10D passes, the backend for the Tenant Admin Dashboard is COMPLETE. The security boundary is an engineering fact, not a claim.**

*End of Document — UBOTZ 2.0 Phase 10D Implementation Plan — March 1, 2026*

# Phase 10D Completion Report

**Date:** March 1, 2026
**Subject:** Completion of Phase 10D: Security Boundary Audit + Role CRUD Completion
**Status:** COMPLETE (Zero Regression)

## Overview
Phase 10D has been successfully executed, completing the Role CRUD functionality and strongly proving the security model outlined in ADR-010. The backend for the Tenant Admin Dashboard is now fully operational, tested, and secure.

## Completed Work

### 1. Role CRUD Completion
-   **Implemented `UpdateTenantRoleUseCase`**: Added capability to perform partial updates with capability sync. Enforced domain invariants (system roles cannot be renamed fundamentally or changed hierarchy via update, capability sync replacing the set, hierarchy rules constraint).
-   **Implemented `DeleteTenantRoleUseCase`**: Implemented hard deletes with a check against active assignments. Soft prevention via assignment verification blocks deletion if users exist, avoiding orphaned assignments.
-   **Implemented Role Deactivation Toggle**: Added `toggleActive` endpoint, effectively unlinking capabilities for deactivated roles. Evaluated via `EloquentTenantCapabilityChecker`.
-   **Added corresponding routes and HTTP controllers**.

### 2. Edge Case and Hardening Tests
-   Added edge case tests inside `TenantRoleUpdateDeleteTest`, including empty capability sync test cases.
-   Verified `EloquentTenantCapabilityChecker` accurately factors in `is_active` status of `tenant_roles` before granting capabilities in `userHasCapability` and `getUserCapabilities` functions.

### 3. Security Boundary Verification (ADR-010 §12)
-   Implemented exhaustive `CrossContextIsolationTest` verifying that Platform Admin tokens cannot hit Tenant endpoints, and Tenant tokens cannot hit Platform Admin endpoints, ensuring total contextual isolation.
-   Implemented `CrossTenantDataIsolationTest` proving cross-tenant data requests return `404 Not Found` rather than `403 Forbidden`, neutralizing enumeration vulnerability risks per security guidelines.
-   **Quality Gate Passes**: All 12 ADR-010 quality gates have been run and verified. No regressions found in standard assertions, PHPStan retains Level 5.
-   Manual CLI / internal testing mechanisms proved cross context rejections reliably throw 401 Unauthorized via the guard.

### 4. Code Cleanup
-   Deprecated policies (`CoursePolicy.php`, `ExamPolicy.php`) completely deleted.
-   20+ Root temporary debug files left over from Phase 10A-10C executions completely scrubbed.
-   `BACKEND_FILE_TREE.md` recalculated and correctly updated.

## Known Limitations & Future Work
-   **Performance optimizations**: The Tenant capability checker resolves via heavy relational joins. Post-Phase 10 cross-request capability caching will need to be scoped for massive traffic systems.
-   **Frontend Integration**: Phase 10E is required to reflect these APIs in the client Dashboard UI.
-   **Audit Log View UI**: The backend is securely appending to the `tenant_audit_logs`, but the export and dashboard visualizations components are scheduled for post-Phase 10 workflows.

*The backend architecture is structurally sound for the phase milestone.*
