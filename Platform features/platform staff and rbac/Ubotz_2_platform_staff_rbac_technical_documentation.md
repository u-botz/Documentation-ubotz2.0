# UBOTZ 2.0 — Platform Staff & RBAC: Full Technical Specification

| Field | Value |
|---|---|
| **Document Type** | Principal Engineer — Technical Specification |
| **Feature** | Platform Staff Management & Role-Based Access Control |
| **Date** | 2026-03-27 |
| **Issued By** | Principal Engineer / Architecture Auditor |
| **Scope** | Full-stack technical design — DB schema, domain, application, HTTP, auth, security |
| **Status** | CURRENT — Reflects implemented codebase state |

---

## 1. System Architecture Overview

The Platform Staff & RBAC system spans all four architectural layers of the UBOTZ 2.0 DDD model. The interaction flows strictly downward; no layer accesses a higher layer.

```
HTTP Layer       →  StaffReadController, StaffWriteController, AdminPolicy
Application Layer →  CreateStaffUseCase, ListStaffQuery, PermissionCatalog
Domain Layer      →  AdminEntity, AuthorityLevel, AuthorityValidationService
Infrastructure    →  AdminRecord, EloquentAdminRepository, AdminAuditLogger
```

---

## 2. Database Schema (Central DB)

All staff tables reside in the **Central (Landlord) Database**. There is no `tenant_id` on any of these tables — platform staff are a platform-level concept, not tenant-scoped.

---

### 2.1 Table: `admins`

**Migration:** `2026_02_17_202525_create_admins_table.php`

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | BIGINT (PK, Auto) | No | — | |
| `first_name` | VARCHAR(100) | No | — | |
| `last_name` | VARCHAR(100) | No | — | |
| `email` | VARCHAR(255), Unique | No | — | Primary login identifier. |
| `password` | VARCHAR(255) | No | — | Bcrypt-hashed. Never returned in API responses. |
| `authority_level` | SMALLINT UNSIGNED | No | — | Maps to `AuthorityLevel` enum: L1=90, L2=80, L3=70, L4=60, L5=50, L6=40, L7=30. |
| `status` | VARCHAR(30) | No | `pending_activation` | Allowed: `pending_activation`, `active`, `deactivated`, `locked`. |
| `failed_login_attempts` | SMALLINT UNSIGNED | No | 0 | Incremented on each failed login. Resets on success. |
| `locked_until` | TIMESTAMP | Yes | NULL | Null = not locked. Set by system on 5th failed attempt. |
| `force_password_reset` | BOOLEAN | No | false | If true, user must reset password on next login. |
| `password_changed_at` | TIMESTAMP | Yes | NULL | Updated on each successful password change. |
| `last_login_at` | TIMESTAMP | Yes | NULL | Updated on each successful login. |
| `last_login_ip` | VARCHAR(45) | Yes | NULL | IPv4/IPv6. |
| `phone` | VARCHAR(20) | Yes | NULL | |
| `notes` | TEXT | Yes | NULL | Internal admin notes. |
| `created_by` | BIGINT (FK `admins.id`) | Yes | NULL | NULL for seeded root accounts. |
| `token_version` | INT | No | 1 | Embedded in JWT. Incrementing invalidates all existing tokens. |
| `created_at` | TIMESTAMP | Yes | CURRENT | |
| `updated_at` | TIMESTAMP | Yes | CURRENT | |
| `deleted_at` | TIMESTAMP | Yes | NULL | Soft-delete column. |

**Indexes:**
- `idx_admins_authority` on `authority_level` — used by visibility queries.
- `idx_admins_status` on `status` — used by auth middleware checks.
- `idx_admins_created_by` on `created_by` — used for staff creation audit.

---

### 2.2 Table: `admin_roles`

**Migration:** `2026_02_17_205122_create_admin_roles_table.php`

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | BIGINT (PK) | No | — | |
| `code` | VARCHAR(50), Unique | No | — | Machine-readable slug: `platform_owner`, `root_approver`, etc. |
| `name` | VARCHAR(100) | No | — | Display name: `Platform Owner`, `Root Approver`, etc. |
| `description` | TEXT | Yes | NULL | |
| `authority_level` | SMALLINT UNSIGNED | No | — | Must match an `AuthorityLevel` enum value. |
| `is_immutable` | BOOLEAN | No | false | `true` for system-defined roles. Cannot be deleted or modified. |
| `status` | VARCHAR(20) | No | `active` | |
| `created_at` | TIMESTAMP | — | | |
| `updated_at` | TIMESTAMP | — | | |

**System Roles (Seeded as Immutable):**

| Code | Name | Authority Level |
|---|---|---|
| `platform_owner` | Platform Owner | 90 |
| `root_approver` | Root Approver | 80 |
| `root_operator` | Root Operator | 70 |
| `super_admin` | Super Admin | 60 |
| `tenant_ops` | Tenant Ops | 50 |
| `billing_admin` | Billing Admin | 40 |
| `audit_admin` | Audit Admin | 30 |

---

### 2.3 Table: `admin_permissions`

**Migration:** `2026_02_17_205933_create_admin_permissions_table.php`

| Column | Type | Notes |
|---|---|---|
| `id` | BIGINT (PK) | |
| `code` | VARCHAR(100), Unique | Dot-notation: `tenant.suspend`, `billing.refund`. |
| `name` | VARCHAR(150) | Display name. |
| `description` | TEXT | |
| `created_at` | TIMESTAMP | |
| `updated_at` | TIMESTAMP | |

**Permission Registry (from `PermissionCatalog`):**

| Permission Code | Minimum Level | Category |
|---|---|---|
| `staff.manage` | L1 (90) | Staff Admin |
| `staff.view` | L4 (60) | Staff Admin |
| `staff.deactivate` | L2 (80) | Staff Admin |
| `staff.activate` | L2 (80) | Staff Admin |
| `tenant.manage` | L4 (60) | Tenant |
| `tenant.view` | L5 (50) | Tenant |
| `tenant.suspend` | L4 (60) | Tenant |
| `tenant.restore` | L4 (60) | Tenant |
| `tenant.hard_delete` | L2 (80) | Tenant |
| `billing.manage` | L6 (40) | Billing |
| `billing.read` | L6 (40) | Billing |
| `billing.refund` | L6 (40) | Billing |
| `billing.freeze` | L6 (40) | Billing |
| `subscription.view` | L7 (30) | Subscription |
| `subscription.manage` | L4 (60) | Subscription |
| `institution_type.manage` | L4 (60) | Content |
| `institution_type.approve` | L2 (80) | Content |
| `landing_page_templates.manage` | L4 (60) | Content |
| `landing_page_templates.view` | L5 (50) | Content |
| `audit.view` | L7 (30) | Audit |
| `audit.export` | L7 (30) | Audit |
| `system.view` | L4 (60) | System |
| `system.manage` | L1 (90) | System |
| `system.deploy` | L3 (70) | System |
| `system.db_migrate` | L3 (70) | System |
| `system.cache_flush` | L3 (70) | System |
| `system.view_logs` | L3 (70) | System |
| `system.view_health` | L4 (60) | System |
| `admin.unlock` | L4 (60) | Admin Ops |
| `admin.password_reset` | L4 (60) | Admin Ops |
| `tenant_user.manage` | L3 (70) | Tenant Users |
| `tenant_user.view` | L5 (50) | Tenant Users |

---

### 2.4 Table: `admin_role_assignments`

**Migration:** `2026_02_17_212315_create_admin_role_assignments_table.php`

| Column | Type | Notes |
|---|---|---|
| `id` | BIGINT (PK) | |
| `admin_id` | BIGINT (FK → `admins.id`) | |
| `role_id` | BIGINT (FK → `admin_roles.id`) | |
| `is_active` | BOOLEAN | Allows soft-disabling a role without deleting the assignment record. |
| `assigned_by` | BIGINT (FK → `admins.id`) | Who assigned the role. |
| `assigned_at` | TIMESTAMP | |
| `created_at` | TIMESTAMP | |
| `updated_at` | TIMESTAMP | |

**Indexes:** `idx_ara_admin_id, idx_ara_role_id` — optimized for FK joins on permission resolution. Added in migration `2026_03_26_320004_index_admin_role_assignments_fk_columns.php`.

---

### 2.5 Table: `admin_audit_logs`

**Migration:** `2026_02_17_213440_create_admin_audit_logs_table.php`

> **IMMUTABLE — APPEND ONLY. No `updated_at` column. No soft deletes. No `UPDATE` or `DELETE` statements ever run against this table.**

| Column | Type | Notes |
|---|---|---|
| `id` | BIGINT (PK) | |
| `admin_id` | BIGINT (Nullable FK) | Nullable for system-triggered actions (cron, queue). |
| `action` | VARCHAR(100) | Dot-notation: `staff.create`, `tenant.suspend`, `role.assign`. |
| `entity_type` | VARCHAR(100) | e.g. `Admin`, `Tenant`. |
| `entity_id` | BIGINT UNSIGNED | Target entity's PK. |
| `old_values` | JSON | Snapshot of values before the action. |
| `new_values` | JSON | Snapshot of values after the action. |
| `metadata` | JSON | Context data: actor level, target level, reason. |
| `ip_address` | VARCHAR(45) | Request IP. |
| `user_agent` | TEXT | Browser/client info. |
| `created_at` | TIMESTAMP (useCurrent) | When the action occurred. |

**Indexes for Performance:**
- `idx_audit_admin_created` on `(admin_id, created_at)` — per-admin audit queries.
- `idx_audit_entity` on `(entity_type, entity_id)` — entity-based audit lookup.
- `idx_audit_action` on `action` — filter by action type.
- `idx_audit_created` on `created_at`.

---

## 3. Domain Layer

### 3.1 `AuthorityLevel` (Backed Enum)

**File:** `App\Domain\Shared\ValueObjects\AuthorityLevel`

A PHP 8.1 Backed Enum. The backing type is `int`, with values corresponding to numerical authority scores.

```php
enum AuthorityLevel: int {
    case L7 = 30; // Audit Admin
    case L6 = 40; // Billing Admin
    case L5 = 50; // Tenant Ops
    case L4 = 60; // Super Admin
    case L3 = 70; // Root Operator
    case L2 = 80; // Root Approver
    case L1 = 90; // Platform Owner
}
```

**Key Methods:**

| Method | Signature | Description |
|---|---|---|
| `meetsMinimum` | `bool meetsMinimum(self $required)` | Checks `$this->value >= $required->value`. Used in Gate checks. |
| `isAbove` | `bool isAbove(self $other)` | Checks `$this->value > $other->value`. Used in hierarchy enforcement. |
| `isBelow` | `bool isBelow(self $other)` | Inverse of `isAbove`. |
| `label` | `string label()` | Returns human-readable name. |
| `fromInt` | `static self fromInt(int $value)` | Construct from DB integer. Throws `\ValueError` for unknown values. |
| `tryFromInt` | `static ?self tryFromInt(int $value)` | Safe version for untrusted input; returns null. |

---

### 3.2 `AdminEntity` (Domain Entity)

**File:** `App\Domain\SuperAdminDashboard\Staff\Entities\AdminEntity`

Pure PHP domain entity. Zero Laravel imports. All business invariants are enforced here.

**Properties (all `readonly`):**
`id`, `firstName`, `lastName`, `email`, `passwordHash`, `authorityLevel`, `status`, `phone`, `notes`, `createdBy`, `createdAt`, `updatedAt`

**Factories:**

| Method | Description |
|---|---|
| `AdminEntity::create(...)` | Creates a new entity. Enforces "actor must be above target" invariant. Dispatches `AdminCreated` event. |
| `AdminEntity::reconstitute(...)` | Rebuilds entity from persisted data. Bypasses invariant checks. |

**Mutators (all return a new immutable instance):**

| Method | Invariant Enforced | Event Dispatched |
|---|---|---|
| `deactivate(AuthorityLevel $actorLevel)` | Actor must be above target. Valid status transition. | `AdminStatusChanged` |
| `activate(AuthorityLevel $actorLevel)` | Actor must be above target. Valid status transition. | `AdminStatusChanged` |
| `updateProfile(AuthorityLevel $actorLevel, ...)` | Actor must be above target. | None |

**Event Sourcing Pattern:**
- `recordEvent(object $event)`: Internal method to queue domain events.
- `releaseEvents(): array`: Called by UseCases after persistence. Returns array of queued events for dispatch.

---

### 3.3 `AuthorityValidationService` (Domain Service)

**File:** `App\Domain\SuperAdminDashboard\Staff\Services\AuthorityValidationService`

Pure PHP service used by multiple UseCases. Centralizes all hierarchy validation logic.

| Method | Rule Enforced |
|---|---|
| `canAssignAuthorityLevel($actor, $target)` | Actor must be above target. L1 can assign L1 (self-level exception). |
| `canModifyAdmin($actor, $target)` | Actor must be strictly above target. |
| `canAssignRole($actor, $roleLevel)` | Actor must be above role level. L2/L3 roles require exactly L1. |
| `canRevokeRole($actor, $target)` | Actor must be strictly above target. |
| `assertCanActOn($actor, $target, $operation)` | Throws `\DomainException` if `canModifyAdmin` returns false. Fail-fast helper for UseCases. |
| `assertNotAuditAdminExecutePermission($level, $permCode)` | Throws `\DomainException` if L7 target would receive any non-read-only permission. |

---

## 4. Application Layer

### 4.1 `CreateStaffUseCase`

**File:** `App\Application\SuperAdminDashboard\Staff\UseCases\CreateStaffUseCase`

**Step-by-step execution:**
1. **Email uniqueness check**: Queries `AdminRepositoryInterface::findByEmail()`. Throws `ValidationException` on duplicate.
2. **Hash password**: `Hash::make($command->password)`.
3. **Build domain entity**: `AdminEntity::create(...)`. Enforces authority invariant in the entity constructor.
4. **DB Transaction begins:**
   - **Persist**: `AdminRepositoryInterface::save($entity)`.
   - **Auto-assign role**: `AdminRepositoryInterface::assignRole($id, $authorityLevel)` — links the system-level role that matches the authority level.
   - **Audit log**: `AdminAuditLogger::log()` with action `staff.create` and metadata.
5. **After DB commit**: Domain events released and dispatched (e.g., `AdminCreated` → email listener).

**Command object: `CreateAdminCommand`**
```
firstName, lastName, email, password, authorityLevel, 
actorId, actorAuthorityLevel, ipAddress, userAgent
```

---

### 4.2 `DeactivateStaffUseCase`

1. Load target entity via repository.
2. Call `$targetEntity->deactivate($actorLevel)` — raises `InsufficientAuthorityException` if actor is not above target.
3. Persist updated entity.
4. Increment `token_version` to invalidate active JWTs for the deactivated admin.
5. Write audit log with `staff.deactivate`.

---

### 4.3 `ActivateStaffUseCase`

Mirror of `DeactivateStaffUseCase`. Calls `$targetEntity->activate($actorLevel)`.

---

### 4.4 `UpdateStaffUseCase`

1. Load target entity.
2. Call `$targetEntity->updateProfile($actorLevel, ...)`.
3. Persist.
4. Audit log with `staff.update` and `old_values`/`new_values` diff.

---

### 4.5 `ForcePasswordResetUseCase`

1. Gate check: `AdminPolicy::forcePasswordReset()` — requires L1.
2. Sets `force_password_reset = true` and increments `token_version`.
3. Audit log with `admin.force_password_reset`.

---

### 4.6 `UnlockAdminUseCase`

1. Gate check: `AdminPolicy::unlock()` — requires L2+.
2. Sets `failed_login_attempts = 0`, `locked_until = null`, `status = active`.
3. Audit log with `admin.unlock`.

---

### 4.7 `ListStaffQuery`

**Visibility rules (from code):**

| Actor Level | `getVisibleLevels()` Returns |
|---|---|
| L1 | [90, 80, 70, 60, 50, 40, 30] |
| L2 or L3 | [80, 70, 60, 50, 40, 30] |
| L4 or below | Route blocked by middleware before query runs |

> **Anti-enumeration:** The `total` count in the paginated response reflects **only visible records**, not the full table count. An L4 admin querying totals will see a count that excludes L1/L2/L3 rows.

**`show()` (Single record):** If the target's `authority_level` is not in `getVisibleLevels(actorLevel)`, returns `404` — not `403`.

---

## 5. HTTP Layer

### 5.1 Controllers

| Controller | File | Responsibility |
|---|---|---|
| `StaffReadController` | `Http/Controllers/Api/SuperAdminDashboard/Staff/StaffReadController` | `index()`, `show()` — Read-only, visibility-scoped. |
| `StaffWriteController` | `Http/Controllers/Api/SuperAdminDashboard/Staff/StaffWriteController` | `store`, `update`, `destroy`, `activate`, `forcePasswordReset`, `unlock` |

### 5.2 Form Requests

| Request | Validates |
|---|---|
| `CreateStaffRequest` | `first_name`, `last_name`, `email` (unique), `password` (min 8, confirmed), `authority_level` (in [30,40,50,60,70,80,90]). |
| `UpdateStaffRequest` | `first_name`, `last_name`, `phone` (nullable), `notes` (nullable). |

### 5.3 API Routes

All below routes are under the prefix `/api/development/super-admin/staff` and require `admin_api` guard:

| Method | URI | Action | Min Auth |
|---|---|---|---|
| GET | `/` | `StaffReadController@index` | L4 |
| GET | `/{id}` | `StaffReadController@show` | L4 |
| POST | `/` | `StaffWriteController@store` | L1 |
| PUT | `/{id}` | `StaffWriteController@update` | L1 |
| DELETE | `/{id}` | `StaffWriteController@destroy` | L2 |
| POST | `/{id}/activate` | `StaffWriteController@activate` | L2 |
| POST | `/{id}/force-password-reset` | `StaffWriteController@forcePasswordReset` | L1 |
| POST | `/{id}/unlock` | `StaffWriteController@unlock` | L2 |

---

## 6. Authorization Infrastructure

### 6.1 Two-Layer Strategy

Every protected action passes through TWO independent authorization checks:

```
Layer 1 (Coarse): Admin.authority_level >= PermissionCatalog.getMinimumLevel(code)
Layer 2   (Fine): Admin.hasPermission(code) via active role assignments
```

Both must pass. Passing the level check but lacking the explicit permission = DENIED.

### 6.2 `PermissionCatalog`

**File:** `App\Application\SuperAdminDashboard\Authorization\PermissionCatalog`

Single source of truth. Registered in `AuthorizationServiceProvider::boot()` as Laravel Gates:

```php
Gate::define($permissionCode, function (AdminRecord $admin) use ($permissionCode, $minimumLevel) {
    if ($admin->authority_level < $minimumLevel->value) return false; // Layer 1
    return $admin->hasPermission($permissionCode);                    // Layer 2
});
```

### 6.3 `AdminRecord::hasPermission()` — N+1 Prevention

On first call per request, `loadPermissionCache()` runs a single eager-loaded chain:
```
admin → active_role_assignments → role → permissions
```
Result is stored in `$cachedPermissions` for the lifetime of the request. Subsequent `hasPermission()` and `hasRole()` calls hit memory, not the DB.

### 6.4 `AdminPolicy`

**File:** `App\Http\Policies\AdminPolicy`

Provides model-aware authorisation for direct admin-on-admin actions.

| Policy Method | Requirements |
|---|---|
| `viewAny` | `staff.view` permission. |
| `view` | `staff.view` permission. |
| `create` | Level >= 90 (L1) AND `staff.manage` permission. |
| `update` | Level >= 90 (L1) AND actor strictly above target. |
| `delete` | Level >= 80 (L2+) AND actor != target AND actor strictly above target. |
| `restore` | Level >= 80 (L2+) AND actor != target AND actor strictly above target. |
| `assignRole` | `staff.manage` AND actor != target AND actor strictly above target. |
| `forcePasswordReset` | Level >= 90 (L1) AND actor strictly above target. |
| `unlock` | Level >= 80 (L2+) AND actor strictly above target. |

---

## 7. JWT Security & Token Versioning

**Claim payload structure:**
```json
{
  "sub": 42,
  "type": "access",
  "authority_level": 60,
  "token_version": 3
}
```

**Auth middleware check:**
1. Decode and verify JWT signature.
2. Load `AdminRecord` by `sub`.
3. Compare `JWT.token_version` vs `AdminRecord.token_version`.
4. If mismatch → `401 Unauthorized`. The token has been revoked.

**When `token_version` is incremented:**
- Admin is deactivated.
- Admin's role is changed.
- Admin's `force_password_reset` changes to `true`.
- Admin undergoes a manual unlock after lockout.

---

## 8. Domain Events Reference

| Event | File | Payload | When Dispatched |
|---|---|---|---|
| `AdminCreated` | `...Staff/Events/AdminCreated` | `adminId`, `authorityLevel`, `createdBy` | After new admin persisted. |
| `AdminStatusChanged` | `...Staff/Events/AdminStatusChanged` | `adminId`, `previousStatus`, `newStatus` | On activate/deactivate. |
| `AdminAuthorityChanged` | `...Staff/Events/AdminAuthorityChanged` | `adminId`, `oldLevel`, `newLevel` | On role promotion/demotion. |
| `AdminRoleAssigned` | `...Staff/Events/AdminRoleAssigned` | `adminId`, `roleId`, `assignedBy` | On role assignment. |
| `AdminRoleRevoked` | `...Staff/Events/AdminRoleRevoked` | `adminId`, `roleId`, `revokedBy` | On role revocation. |
| `AdminForcePasswordReset` | `...Staff/Events/AdminForcePasswordReset` | `adminId` | On force password reset. |
| `AdminUnlocked` | `...Staff/Events/AdminUnlocked` | `adminId` | On manual account unlock. |

**Dispatch pattern:** Events are queued inside `AdminEntity` via `recordEvent()`. After the DB transaction commits, the UseCase calls `$entity->releaseEvents()` and dispatches events via Laravel's `event()` helper inside a `DB::afterCommit()` closure to guarantee events never fire on a rolled-back transaction.

---

## 9. Audit Logging

**Interface:** `App\Application\Shared\Services\AdminAuditLoggerInterface`  
**Implementation:** `App\Infrastructure\Services\AdminAuditLogger`

**Method signature:**
```php
public function log(
    int    $adminId,
    string $action,
    string $entityType,
    int    $entityId,
    string $ipAddress,
    string $userAgent,
    array  $metadata = [],
    array  $oldValues = [],
    array  $newValues = [],
): void;
```

**All actions that MUST be logged:**

| Action | Entity Type | Logged By |
|---|---|---|
| `staff.create` | Admin | `CreateStaffUseCase` |
| `staff.update` | Admin | `UpdateStaffUseCase` |
| `staff.deactivate` | Admin | `DeactivateStaffUseCase` |
| `staff.activate` | Admin | `ActivateStaffUseCase` |
| `admin.force_password_reset` | Admin | `ForcePasswordResetUseCase` |
| `admin.unlock` | Admin | `UnlockAdminUseCase` |
| `role.assign` | AdminRoleAssignment | Role assignment service |
| `role.revoke` | AdminRoleAssignment | Role revocation service |

---

## 10. Exceptions Reference

| Exception | File | When Thrown |
|---|---|---|
| `InsufficientAuthorityException` | `...Staff/Exceptions` | Actor does not meet authority level required to act on target. |
| `InvalidStatusTransitionException` | `...Staff/Exceptions` | Invalid status state machine transition attempted. |
| `AdminNotFoundException` | `...Staff/Exceptions` | `findByIdOrFail()` call returns no record. Returns 404 to caller. |

---

## 11. Testing Notes

### Key Test Files

| Test | Location |
|---|---|
| `StaffReadController` tests | `tests/Feature/SuperAdminDashboard/Staff/` |
| `CreateStaffUseCase` unit tests | `tests/Unit/Application/SuperAdminDashboard/Staff/` |
| `AdminEntity` invariant tests | `tests/Unit/Domain/SuperAdminDashboard/Staff/` |
| `AuthorityValidationService` tests | `tests/Unit/Domain/SuperAdminDashboard/Staff/` |
| `AdminPolicy` tests | `tests/Feature/Policies/` |

### What to Verify in Tests

1. **L4 actor cannot see L1/L2/L3 in the staff list** — Row level security.
2. **L4 actor requesting `show()` for an L1 ID returns `404`** — Anti-enumeration.
3. **L4 cannot create an L4 account** — Strictly above invariant.
4. **L2 cannot assign L2/L3 roles** — only L1 can.
5. **L7 cannot be given execution permissions** — Hard domain stop.
6. **Admin cannot deactivate themselves** — Self-action prohibition.
7. **After deactivation, existing JWT is invalid** — Token version check.

---

*End of Document — UBOTZ 2.0 Platform Staff & RBAC Full Technical Specification — March 27, 2026*
