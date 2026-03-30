# UBOTZ 2.0 — Support & Diagnostics Suite: Full Technical Specification

| Field | Value |
|---|---|
| **Document Type** | Principal Engineer — Technical Specification |
| **Feature** | Support & Diagnostics Suite |
| **Date** | 2026-03-27 |
| **Issued By** | Principal Engineer / Architecture Auditor |
| **Scope** | Full-stack: DB schema, application layer (UseCases/Queries), infrastructure loggers, domain events |
| **Status** | CURRENT — Reflects implemented codebase state (verified against source) |

---

## 1. System Architecture Overview

```
HTTP Layer  (all routed under /api/platform/tenants/{tenantId}/support)
  → TenantImpersonationWriteController    POST /impersonate
                                          POST /stop-impersonation
  → TenantAccountManagementWriteController POST /users/{userId}/disable
                                           POST /users/{userId}/enable
                                           POST /users/{userId}/unlock
                                           POST /users/{userId}/force-password-reset
                                           POST /users/{userId}/force-logout
  → TenantActivityTimelineReadController   GET  /activity-timeline
  → TenantAppLogReadController             GET  /app-logs
  → TenantErrorLogReadController           GET  /error-logs
  → TenantSupportSnapshotReadController    GET  /snapshot

Application Layer (App\Application\SuperAdminDashboard\Support)
  → UseCases\ImpersonateTenantAdminUseCase
  → UseCases\StopTenantImpersonationUseCase
  → UseCases\DisableTenantAccountUseCase
  → UseCases\EnableTenantAccountUseCase
  → UseCases\UnlockTenantAccountUseCase
  → UseCases\ForcePasswordResetUseCase
  → UseCases\ForceLogoutTenantUserUseCase
  → Queries\GetTenantActivityTimelineQuery
  → Queries\GetTenantActiveSessionsQuery
  → Queries\GetTenantAppLogsQuery
  → Queries\GetTenantErrorLogsQuery
  → Queries\GetTenantSupportSnapshotQuery

Domain Layer (App\Domain\SuperAdminDashboard\Support)
  → Events: TenantImpersonationStarted, TenantImpersonationEnded
  → Repositories: TenantAccountManagementRepositoryInterface, TenantSnapshotQueryInterface, TenantSessionQueryInterface
  → Exceptions: InsufficientImpersonationAuthorityException, TenantAccountNotFoundException
  → ValueObjects: LogLevel

Infrastructure
  → PlatformSupportAuditLogger  (App\Infrastructure\Services)
  → PlatformSupportAuditLogRecord  (Eloquent → platform_support_audit_logs — Central DB)
  → TokenServiceInterface  (App\Domain\TenantAdminDashboard\Auth\Services)
```

---

## 2. Database Schema (Central DB)

### 2.1 Table: `platform_support_audit_logs`

This table is **APPEND-ONLY** and **IMMUTABLE**. The Eloquent model (`PlatformSupportAuditLogRecord`) enforces this by throwing `RuntimeException` on `update()` or `delete()` calls. There is no `updated_at` column (`UPDATED_AT = null`).

| Column | Type | Notes |
|---|---|---|
| `id` | BIGINT (PK) | |
| `actor_admin_id` | BIGINT (FK → `admins.id`) | The platform staff member performing the action. |
| `action` | VARCHAR | E.g., `tenant.impersonation_started`, `tenant_admin.account_disabled`. See §4 for full list. |
| `tenant_id` | BIGINT (FK → `tenants.id`) | The affected tenant. |
| `target_user_id` | BIGINT (FK → `users.id`, nullable) | The affected user within the tenant (null for tenant-level actions). |
| `metadata` | JSON | Key-value pairs: `reason`, `target_user_email`, `actor_authority`, etc. Cast to array. |
| `ip_address` | VARCHAR(45) | Falls back to `request()->ip()` if not explicitly passed. |
| `user_agent` | TEXT | Falls back to `request()->userAgent()` if not explicitly passed. |
| `created_at` | TIMESTAMP | Insertion timestamp. `updated_at` does not exist. |

---

## 3. Infrastructure — PlatformSupportAuditLogger

**Namespace:** `App\Infrastructure\Services\PlatformSupportAuditLogger`

Used by all Support UseCases to ensure consistent, schema-correct auditing. Falls back to request IP and user agent automatically when values are not explicitly provided.

```php
public function log(
    int $actorAdminId,
    string $action,
    int $tenantId,
    ?int $targetUserId = null,
    ?array $metadata = null,
    ?string $ipAddress = null,     // falls back to request()->ip()
    ?string $userAgent = null      // falls back to request()->userAgent()
): void;
```

---

## 4. Application Layer — UseCases

### 4.1 `ImpersonateTenantAdminUseCase`

**Logic Flow:**
1. **Authority Check**: Load `AdminRecord` by `actorAdminId`; throw `InsufficientImpersonationAuthorityException` if `authority_level < 60`.
2. **Tenant Guard**: Load `TenantRecord`; throw `InvalidArgumentException` if not found or `status !== 'active'`.
3. **User Guard**: Load `UserRecord::withoutGlobalScopes()->where('id', targetId)->where('tenant_id', tenantId)`; throw `InvalidArgumentException` if not found.
4. **Atomic Transaction**:
   - Call `TokenServiceInterface::issueImpersonationToken(tenantId, targetUserId, actorAdminId)` → returns JWT string.
   - Call `PlatformSupportAuditLogger::log(action: 'tenant.impersonation_started', metadata: [reason, actor_authority, target_user_email])`.
   - Construct `TenantImpersonationStarted` event.
5. **Dispatch Event**: `event(TenantImpersonationStarted)`.
6. **Return**: Impersonation token string → response: `{ "data": { "impersonation_token": "..." } }`.

### 4.2 `StopTenantImpersonationUseCase`

Logs session termination. No token mutation is performed (stateless JWT — expiry handles termination on the token side).

**Logic Flow:**
1. Call `PlatformSupportAuditLogger::log(action: 'tenant.impersonation_ended')`.
2. Dispatch `TenantImpersonationEnded` event.

### 4.3 Account Management UseCases

All account management UseCases share the same pattern:
1. Verify user exists via `TenantAccountManagementRepositoryInterface::userExists(tenantId, userId)` → throw `TenantAccountNotFoundException` if not.
2. Fetch `email` via `repository->getUserEmail(tenantId, userId)` for metadata.
3. Inside `DB::transaction()`: mutate state via repository + write audit log.

| UseCase | Repository Method | DB Mutation | Audit Action Key |
|---|---|---|---|
| `DisableTenantAccountUseCase` | `disableAccount()` | Sets `users.status = 'suspended'` | `tenant_admin.account_disabled` |
| `EnableTenantAccountUseCase` | `enableAccount()` | Sets `users.status = 'active'` | `tenant_admin.account_enabled` |
| `UnlockTenantAccountUseCase` | `unlockAccount()` | Resets `users.failed_login_attempts = 0` | `tenant_admin.account_unlocked` |
| `ForcePasswordResetUseCase` | `forcePasswordReset()` | Sets `users.force_password_reset = true` | `tenant_admin.password_reset_forced` |
| `ForceLogoutTenantUserUseCase` | *(log only)* | **Audit log only** — no JWT mutation in current release *(stateless token invalidation is a pending enhancement)*. | `tenant_admin.session_terminated` |

> **Implementation note on ForceLogout**: The code comments in `ForceLogoutTenantUserUseCase` explicitly acknowledge that true JWT invalidation would require changing a user-level JWT secret or tracking tokens. The current implementation records a `tenant_admin.session_terminated` audit entry but does not expire existing tokens.

---

## 5. Application Layer — Queries

| Query Class | Interface | Description |
|---|---|---|
| `GetTenantActivityTimelineQuery` | — | Fetches paginated events from `tenant_audit_logs`. Response fields include `event_type`. |
| `GetTenantActiveSessionsQuery` | `TenantSessionQueryInterface` | Fetches active sessions for a tenant with pagination (`page`, `perPage`). |
| `GetTenantAppLogsQuery` | — | Combines informational and error logs via a **union query** — returns `≥ 2` rows when both log types exist. |
| `GetTenantErrorLogsQuery` | — | Fetches `TenantErrorLogRecord` rows (`error_id`, `service`, `error_message`, `severity`). |
| `GetTenantSupportSnapshotQuery` | `TenantSnapshotQueryInterface` | Delegates to `snapshotQuery->getSnapshot(tenantId)`; returns `{total_users, active_sessions, api_requests_24h, errors_24h, current_subscription}`. |

---

## 6. Domain Events

| Event | Class | Fired By | Payload |
|---|---|---|---|
| `TenantImpersonationStarted` | `App\Domain\SuperAdminDashboard\Support\Events\TenantImpersonationStarted` | `ImpersonateTenantAdminUseCase` | `tenantId`, `targetUserId`, `actorAdminId`, `reason` |
| `TenantImpersonationEnded` | `App\Domain\SuperAdminDashboard\Support\Events\TenantImpersonationEnded` | `StopTenantImpersonationUseCase` | `tenantId`, `actorAdminId` |

> **Note:** `TenantAccountStatusChanged` and `TenantUserSessionTerminated` domain events are **not implemented** in current codebase. Account management UseCases do not dispatch domain events — only audit logs are written.

---

## 7. API Endpoints & Authority Matrix

All routes are prefixed: `/api/platform/tenants/{tenantId}/support`

| Endpoint | Method | Min Authority | Description |
|---|---|---|---|
| `/impersonate` | POST | **60** (L4 Admin) | Start impersonation session. |
| `/stop-impersonation` | POST | **60** (L4 Admin) | End impersonation session and audit. |
| `/users/{userId}/disable` | POST | **60** (L4 Admin) | Suspend a tenant user. |
| `/users/{userId}/enable` | POST | **60** (L4 Admin) | Re-activate a suspended user. |
| `/users/{userId}/unlock` | POST | **60** (L4 Admin) | Clear failed login lockout. |
| `/users/{userId}/force-password-reset` | POST | **60** (L4 Admin) | Flag account for mandatory password change. |
| `/users/{userId}/force-logout` | POST | **60** (L4 Admin) | Record session termination (audit-only in current release). |
| `/activity-timeline` | GET | **50** (L5 Operator) | View tenant audit log timeline. |
| `/app-logs` | GET | **50** (L5 Operator) | View combined app logs (union query). |
| `/error-logs` | GET | **50** (L5 Operator) | View tenant error logs. |
| `/snapshot` | GET | **50** (L5 Operator) | View live support snapshot metrics. |

---

## 8. Test Coverage

### Backend Feature Tests (`tests/Feature/SuperAdminDashboard/Support/`)

| Test File | Coverage |
|---|---|
| `TenantSupportToolsWriteTest.php` | L4 (auth 60) can impersonate, force password reset, unlock, disable, enable, force logout; L5 (auth 50) is blocked (403) on impersonation and force-logout; asserts `users.force_password_reset=1`, `users.failed_login_attempts=0`, `users.status='suspended'/'active'`; asserts audit log entries in `platform_support_audit_logs`. |
| `TenantSupportToolsReadTest.php` | L5 (auth 50) can access activity timeline, error logs, app logs, snapshot; auth 40 is blocked (403); asserts response structures `['data', 'meta']`; asserts snapshot contains 5 expected keys. |

---

*End of Document — UBOTZ 2.0 Support & Diagnostics Technical Specification — March 27, 2026*
