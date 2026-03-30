# UBOTZ 2.0 — Platform Infrastructure & Support: Full Technical Specification

| Field | Value |
|---|---|
| **Document Type** | Principal Engineer — Technical Specification |
| **Feature** | Platform Infrastructure & Support |
| **Date** | 2026-03-27 |
| **Issued By** | Principal Engineer / Architecture Auditor |
| **Scope** | Full-stack: DB schema, services, UseCases, middleware, caching, scheduled automation |
| **Status** | CURRENT — Reflects implemented codebase state |

---

## 1. System Architecture Overview

```
HTTP Layer          → PlatformSettingsReadController, PlatformSettingsWriteController
Application Layer   → UpdatePlatformSettingsUseCase
                    → GetPlatformSettingsQuery
Services            → PlatformSettingsService         (cached key-value access)
                    → AdminAuditLogger                 (platform admin actions)
                    → PlatformSupportAuditLogger       (cross-tenant support access)
                    → TenantAuditLogger                (tenant-level user actions)
                    → TenantAuthAuditLogger            (tenant auth events)
                    → TenantUserAuditLogger            (tenant user management)
Domain Contracts    → AdminAuditLoggerInterface
                    → AuditLoggerInterface
                    → AuditContext (value object)
Infrastructure      → AdminAuditLogRecord              → admin_audit_logs
                    → PlatformSupportAuditLogRecord    → platform_support_audit_logs
                    → TenantAuditLogRecord             → tenant_audit_logs
                    → PlatformSettingRecord            → platform_settings
```

---

## 2. Database Schema (Central DB)

---

### 2.1 Table: `platform_settings`

| Column | Type | Notes |
|---|---|---|
| `id` | BIGINT (PK) | |
| `key` | VARCHAR(100), Unique | Dot-notation key (e.g., `gateway.razorpay.key_id`). |
| `value` | TEXT | Plain text for non-secrets; Laravel-encrypted ciphertext for secrets. |
| `description` | TEXT | Nullable. Admin-readable description of what the setting controls. |
| `updated_by` | BIGINT (FK → `admins.id`) | Who last updated this key. Nullable. |
| `created_at` | TIMESTAMP | |
| `updated_at` | TIMESTAMP | |

**Known Persisted Keys:**

| Key | Type | Encrypted |
|---|---|---|
| `quota.default_max_users` | Integer string | No |
| `quota.default_max_courses` | Integer string | No |
| `quota.default_max_sessions` | Integer string | No |
| `quota.downgrade_grace_period_days` | Integer string | No |
| `quota.deactivation_order` | Comma-separated string | No |
| `quota.session_enforcement_mode` | `strict` \| `soft` | No |
| `gateway.razorpay.key_id` | String | No |
| `gateway.razorpay.key_secret` | Encrypted ciphertext | ✅ Yes (AES-256-CBC) |
| `gateway.razorpay.webhook_secret` | Encrypted ciphertext | ✅ Yes (AES-256-CBC) |

---

### 2.2 Table: `admin_audit_logs`

Records all platform admin actions and all system-automated actions.

| Column | Type | Notes |
|---|---|---|
| `id` | BIGINT (PK) | |
| `admin_id` | BIGINT (FK → `admins.id`), Nullable | NULL = system-initiated action. |
| `action` | VARCHAR(100) | Action code (e.g., `tenant.created`, `subscription.cancelled`, `system.settings_updated`). |
| `entity_type` | VARCHAR(100), Nullable | Resource type affected (e.g., `tenant`, `tenant_subscription`). |
| `entity_id` | BIGINT, Nullable | ID of the affected record. |
| `old_values` | JSON, Nullable | Pre-action state. |
| `new_values` | JSON, Nullable | Post-action state. |
| `metadata` | JSON, Nullable | Contextual data (billing_cycle, idempotency_key, etc.). |
| `ip_address` | VARCHAR(45), Nullable | IPv4 or IPv6. NULL for system actions. |
| `user_agent` | TEXT, Nullable | Browser UA or `system/queue-worker`. |
| `created_at` | TIMESTAMP | Immutable record of when the action occurred. |
| `updated_at` | — | **No `updated_at` column.** `const UPDATED_AT = null`. |

**Immutability enforcement (at model layer):**
```php
public function update(array $attributes = [], array $options = []): never {
    throw new RuntimeException('Audit logs are immutable. Update is forbidden.');
}
public function delete(): never {
    throw new RuntimeException('Audit logs are immutable. Delete is forbidden.');
}
```

---

### 2.3 Table: `platform_support_audit_logs`

Records platform admin cross-tenant access (impersonation, emergency support).

| Column | Type | Notes |
|---|---|---|
| `id` | BIGINT (PK) | |
| `actor_admin_id` | BIGINT (FK → `admins.id`) | The platform admin performing the action. |
| `action` | VARCHAR(100) | E.g., `support.impersonate`, `support.tenant_account_access`. |
| `tenant_id` | BIGINT (FK → `tenants.id`) | Which tenant is being accessed. |
| `target_user_id` | BIGINT, Nullable | Which tenant user is being impersonated (if applicable). |
| `metadata` | JSON, Nullable | Additional context. |
| `ip_address` | VARCHAR(45) | Auto-populated from `request()->ip()` if not explicitly set. |
| `user_agent` | TEXT | Auto-populated from `request()->userAgent()` if not explicitly set. |
| `created_at` | TIMESTAMP | |
| `updated_at` | — | `const UPDATED_AT = null`. |

**Immutability enforcement:** Same as `admin_audit_logs`.

---

### 2.4 Table: `tenant_audit_logs`

Records tenant-level user actions within tenant contexts.

| Column | Likely Type | Notes |
|---|---|---|
| `id` | BIGINT (PK) | |
| `tenant_id` | BIGINT (FK) | Scoped to tenant. |
| `user_id` | BIGINT, Nullable | Tenant user who performed the action. |
| `action` | VARCHAR(100) | Action code. |
| `entity_type` | VARCHAR(100), Nullable | |
| `entity_id` | BIGINT, Nullable | |
| `old_values` | JSON, Nullable | |
| `new_values` | JSON, Nullable | |
| `metadata` | JSON, Nullable | |
| `ip_address` | VARCHAR(45), Nullable | |
| `user_agent` | TEXT, Nullable | |
| `created_at` | TIMESTAMP | |

---

## 3. Service Layer

### 3.1 `PlatformSettingsService`

**File:** `App\Infrastructure\Services\PlatformSettingsService`

**Cache pattern:**
```
Cache Key:     platform_setting_{key}
Cache TTL:     60 seconds
Cache Store:   Redis (default)
Invalidation:  explicit Cache::forget() after every write
```

**Public API:**
```php
getString(string $key, string $default = ''): string
getInt(string $key, int $default = 0): int
invalidateCache(string $key): void
```

**Boot safety:** All DB reads are wrapped in `try-catch (QueryException)`. Returns `null` silently when the `platform_settings` table doesn't exist yet (e.g., before migrations). This prevents artisan commands like `migrate` from crashing on boot.

**Usage pattern across codebase:**
```php
// Razorpay gateway
$keyId = $platformSettingsService->getString('gateway.razorpay.key_id');

// Quota enforcement
$maxUsers = $platformSettingsService->getInt('quota.default_max_users');

// For encrypted secrets, the application reads the encrypted ciphertext and
// passes it to Crypt::decryptString() inside the gateway adapter:
$encryptedSecret = $platformSettingsService->getString('gateway.razorpay.key_secret');
$secret = Crypt::decryptString($encryptedSecret);
```

---

### 3.2 `AdminAuditLogger`

**File:** `App\Infrastructure\Services\AdminAuditLogger`
**Interface:** `App\Application\Shared\Services\AdminAuditLoggerInterface`

**Two log methods:**

```php
// Human actor (HTTP request context)
log(
    ?int    $adminId,
    string  $action,
    ?string $entityType = null,
    ?int    $entityId = null,
    ?array  $oldValues = null,
    ?array  $newValues = null,
    ?array  $metadata = null,
    ?string $ipAddress = null,
    ?string $userAgent = null,
): void

// System actor (scheduled jobs, queue workers)
logSystem(
    string $action,
    string $entityType,
    int    $entityId,
    array  $metadata = [],
    ?array $newValues = null,
): void  // Sets admin_id=null, user_agent='system/queue-worker'
```

**Failure safety:** Both methods catch all `Throwable` exceptions and log to `Log::critical()` without re-throwing.

---

### 3.3 `PlatformSupportAuditLogger`

**File:** `App\Infrastructure\Services\PlatformSupportAuditLogger`

```php
log(
    int     $actorAdminId,
    string  $action,
    int     $tenantId,
    ?int    $targetUserId = null,
    ?array  $metadata = null,
    ?string $ipAddress = null,     // Auto-fetches from request() if null
    ?string $userAgent = null,     // Auto-fetches from request() if null
): void
```

---

## 4. Application Layer — UseCases

### 4.1 `UpdatePlatformSettingsUseCase`

**File:** `App\Application\SuperAdminDashboard\PlatformSettings\UseCases\UpdatePlatformSettingsUseCase`

**Execution flow:**
```
For each field in validatedData:
  1. Map field name → DB key via FIELD_TO_DB_KEY constant
  2. If secret key AND value is blank → skip (preserve existing secret)
  3. Read current record → capture old_value (*** if secret)
  4. Encrypt value if secret key (Crypt::encryptString)
  5. PlatformSettingRecord::updateOrCreate(['key' => $dbKey], ['value' => $storedValue, 'updated_by' => $adminId])
  6. platformSettingsService->invalidateCache($dbKey)
  7. Capture new_value (*** if secret)

After loop:
  8. auditLogger->log('system.settings_updated', oldValues, newValues)
```

**Key-to-field mapping (`FIELD_TO_DB_KEY`):**

| HTTP Request Field | DB Key |
|---|---|
| `quota_default_max_users` | `quota.default_max_users` |
| `quota_default_max_courses` | `quota.default_max_courses` |
| `quota_default_max_sessions` | `quota.default_max_sessions` |
| `quota_downgrade_grace_period_days` | `quota.downgrade_grace_period_days` |
| `quota_deactivation_order` | `quota.deactivation_order` |
| `quota_session_enforcement_mode` | `quota.session_enforcement_mode` |
| `gateway_razorpay_key_id` | `gateway.razorpay.key_id` |
| `gateway_razorpay_key_secret` | `gateway.razorpay.key_secret` |
| `gateway_razorpay_webhook_secret` | `gateway.razorpay.webhook_secret` |

---

## 5. HTTP Layer

| Method | URI | UseCase / Query | Min Auth |
|---|---|---|---|
| GET | `/platform/settings` | `GetPlatformSettingsQuery` | L2 |
| PUT | `/platform/settings` | `UpdatePlatformSettingsUseCase` | L2 |
| GET | `/platform/admin-audit-logs` | Paginated query on `admin_audit_logs` | L2 |
| GET | `/platform/support-audit-logs` | Paginated query on `platform_support_audit_logs` | L2 |

---

## 6. Caching Architecture

| Cache Key Pattern | Service | TTL | Invalidated By |
|---|---|---|---|
| `platform_setting_{key}` | `PlatformSettingsService` | 60s | `invalidateCache()` on every settings write |
| `tenant:{id}:status` | `UpdateTenantStatusUseCase` | Indefinite | Status change / hard deletion |
| `tenant_resolution:{slug}` | Tenant middleware | Indefinite | Tenant hard deletion |
| `tenant:{slug}:config` | Tenant config middleware | Configurable | Settings update |

---

## 7. Audit Action Codes — Reference

The following action codes are currently used across the platform:

### Platform Admin Actions

| Action Code | Context |
|---|---|
| `tenant.created` | `CreateTenantUseCase` |
| `tenant.suspension.requested` | `RequestTenantSuspensionUseCase` |
| `tenant.suspension.approved` | `ApproveTenantSuspensionUseCase` |
| `tenant.hard_delete.requested` | `RequestTenantHardDeletionUseCase` |
| `tenant.hard_delete.approved` | `ApproveTenantHardDeletionUseCase` |
| `tenant.hard_delete.executed` | `ExecuteTenantHardDeletionUseCase` |
| `subscription.assigned` | `AssignSubscriptionToTenantUseCase` |
| `subscription.cancelled` | `CancelSubscriptionUseCase`, `ChangeTenantPlanUseCase` |
| `subscription.plan_changed` | `ChangeTenantPlanUseCase` |
| `subscription.activated_on_payment` | `ActivateSubscriptionOnPaymentUseCase` |
| `system.settings_updated` | `UpdatePlatformSettingsUseCase` |
| `admin.created` | Admin provisioning |
| `admin.deactivated` | Admin deactivation |

### System-Initiated Actions (null actor)

| Action Code | Scheduled Command |
|---|---|
| `subscription.trial_expired` | `ExpireTrialsUseCase` |
| `suspend_past_due` | `SuspendPastDueUseCase` |

---

## 8. Security Architecture Notes

### 8.1 Secrets Management

All sensitive credentials are protected as follows:

| Credential | Storage | Encryption | Access |
|---|---|---|---|
| Razorpay Key Secret | `platform_settings` | AES-256-CBC (Laravel Crypt) | L2+ via Settings UI |
| Razorpay Webhook Secret | `platform_settings` | AES-256-CBC (Laravel Crypt) | L2+ via Settings UI |
| Razorpay Key ID | `platform_settings` | Plain text | L2+ via Settings UI |
| Stripe Secret Key | `.env` / `config/services.php` | OS-level env var | Server admin |
| Database credentials | `.env` | OS-level env var | Server admin |
| APP_KEY | `.env` | — | Server admin |

> **APP_KEY dependency:** If `APP_KEY` changes, all values encrypted with `Crypt::encryptString()` become undecryptable. This will cause Razorpay payment processing to fail silently. Platform admins must re-enter and re-save `key_secret` and `webhook_secret` after any `APP_KEY` rotation.

### 8.2 Audit Immutability Defence-in-Depth

| Layer | Mechanism |
|---|---|
| Application layer | `update()` / `delete()` throw `RuntimeException` in Eloquent model |
| DB-level (recommended) | Grant only `INSERT`, `SELECT` on audit log tables — revoke `UPDATE`, `DELETE` from the application DB user |
| Rate limiting | Audit log endpoints are read-only and access-gated to L2+ |

---

## 9. Known Gaps & Recommendations

| # | Gap | Recommendation |
|---|---|---|
| 1 | Stripe credentials stored in `.env`, not `platform_settings`. | Move to platform settings with encryption for consistency. |
| 2 | No audit log retention / archival policy. | Define a retention window (e.g., 2 years active, archived to S3 thereafter). |
| 3 | `PlatformSupportAuditLogger` does not have a failure-safe try-catch like `AdminAuditLogger`. | Wrap in try-catch to prevent support access from failing due to audit log DB issues. |
| 4 | No DB-level write-lock on audit tables (application-only immutability). | Add DB grants restricting `UPDATE`/`DELETE` on `admin_audit_logs` and `platform_support_audit_logs`. |

---

*End of Document — UBOTZ 2.0 Platform Infrastructure & Support Full Technical Specification — March 27, 2026*
