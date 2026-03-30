# UBOTZ 2.0 — Platform Infrastructure & Support: Business Findings & Design

| Field | Value |
|---|---|
| **Document Type** | Principal Engineer — Business Logic Audit |
| **Feature** | Platform Infrastructure & Support |
| **Date** | 2026-03-27 |
| **Issued By** | Principal Engineer / Architecture Auditor |
| **Scope** | Platform settings, audit logging, quota management, payment gateway configuration, scheduled automation |
| **Status** | REVIEWED — Reflects current implemented state |

---

## 1. Executive Summary

Platform Infrastructure & Support encompasses the foundational services that every other feature in UBOTZ 2.0 depends upon. It is not a user-visible feature but the operational backbone of the platform. It governs:

1. **Platform Settings Service** — A secure, encrypted, centralized key-value store for platform-wide configuration.
2. **Audit Logging** — Three independent, immutable audit trails covering platform admin actions, cross-tenant support access, and tenant-level user actions.
3. **Quota Management** — Global default resource limits that govern what tenants can consume before triggering overage enforcement.
4. **Payment Gateway Configuration** — Secure storage of Razorpay API credentials used for all platform billing.
5. **Scheduled Automation** — Multiple artisan commands that run on schedule to automate lifecycle management across subscriptions, notifications, and quota enforcement.

---

## 2. Platform Settings Service

### 2.1 Purpose

The `PlatformSettingsService` provides typed, cached access to platform-wide configuration stored in the central database. It is the single source of truth for operational settings that may change without a code deployment.

### 2.2 What Can Be Configured

All settings are keyed strings stored in the `platform_settings` table. There are two categories:

#### Quota Settings (6 keys)

| Setting Key | UI Field | Description |
|---|---|---|
| `quota.default_max_users` | Default Max Users | Default user limit for new plans. |
| `quota.default_max_courses` | Default Max Courses | Default course limit for new plans. |
| `quota.default_max_sessions` | Default Max Sessions | Default concurrent live sessions limit. |
| `quota.downgrade_grace_period_days` | Downgrade Grace Period | Days a tenant has to reduce usage after a plan downgrade. |
| `quota.deactivation_order` | Deactivation Order | Which resources are deactivated first during overage enforcement. |
| `quota.session_enforcement_mode` | Session Mode | `strict` (block new sessions) or `soft` (warn but allow). |

#### Payment Gateway Credentials (3 keys — SECRET)

| Setting Key | UI Field | Encrypted? |
|---|---|---|
| `gateway.razorpay.key_id` | Razorpay Key ID | ❌ Plain text |
| `gateway.razorpay.key_secret` | Razorpay Key Secret | ✅ Encrypted |
| `gateway.razorpay.webhook_secret` | Razorpay Webhook Secret | ✅ Encrypted |

### 2.3 How Settings Are Secured

- **Secrets encrypted at rest:** `key_secret` and `webhook_secret` are encrypted using `Crypt::encryptString()` (Laravel's AES-256-CBC encryption) before being stored in the database.
- **Audit log redaction:** Audit logs for secret updates show `***` instead of the actual value — even in `old_values`.
- **Blank-skip rule:** If an admin submits the settings form with the secret field left empty, the system skips updating that key. This prevents accidentally clearing credentials when editing other settings on the same form.
- **Cache TTL:** Settings are cached for **60 seconds** using `platform_setting_{key}` as the cache key. Cache is invalidated immediately after any update.
- **Boot safety:** `PlatformSettingsService::get()` wraps database queries in a try-catch for `QueryException` — if migrations haven't run yet (e.g., during artisan boot), the service returns `null` silently instead of crashing the entire application.

### 2.4 Who Can Update Settings

Settings are updated via the SuperAdmin dashboard. Only **L2 Root Admins** or above have write access to the platform settings page. All updates are audit-logged with `old_values` and `new_values`.

> **Critical:** Razorpay credentials are stored exclusively in platform settings. They are **NOT** read from `.env`. If the `APP_KEY` ever changes (causing Laravel Crypt to fail), platform admins must re-save the gateway credentials in the settings UI.

---

## 3. Audit Logging — Three Independent Systems

UBOTZ 2.0 operates three separate, immutable audit logs. Each one has a distinct scope and actor model:

### 3.1 Platform Admin Audit Log (`admin_audit_logs`)

**Purpose:** Records every action performed by a platform admin (Super Admin, Root, Platform Operator) on the platform itself.

**Actor:** A platform admin (`admin_id` FK to `admins` table).
**Also supports System actor:** When a scheduled command fires (e.g., auto-expiry, suspension), it logs with `admin_id = null` and `user_agent = 'system/queue-worker'` — making scheduled automation fully traceable.

**Columns captured per entry:**
- `admin_id` — Who performed the action (NULL for system actions)
- `action` — Action code (e.g., `tenant.created`, `subscription.cancelled`, `system.settings_updated`)
- `entity_type` — Which resource type was affected (e.g., `tenant`, `tenant_subscription`, `platform_settings`)
- `entity_id` — The ID of the affected record
- `old_values` — JSON snapshot of the state before the action
- `new_values` — JSON snapshot of the state after the action
- `metadata` — Additional context (e.g., IP address, billing cycle, idempotency key)
- `ip_address` — Originating IP
- `user_agent` — Browser or `system/queue-worker`

**Immutability:** The `AdminAuditLogRecord` Eloquent model overrides `update()` and `delete()` to throw `RuntimeException('Audit logs are immutable.')`. No row in this table can ever be modified or deleted.

**Failure safety:** `AdminAuditLogger::log()` is wrapped in try-catch. If the audit write fails for any reason, it falls back to `Log::critical()` — the audit failure **does not block** authentication, subscriptions, or any other primary operation.

### 3.2 Platform Support Audit Log (`platform_support_audit_logs`)

**Purpose:** A dedicated, specialized audit trail for cross-tenant support actions — specifically platform admins impersonating tenant users or accessing tenant admin accounts.

**Who it tracks:**
- **Actor:** The platform admin performing the impersonation (`actor_admin_id`)
- **Subject:** The tenant that is being accessed (`tenant_id`) and optionally the specific user (`target_user_id`)

**Why a separate table?** Platform support actions (impersonation, emergency account access) carry significant compliance risk. They require their own table so they can be:
- Queried independently of general admin actions
- Exported for compliance audits
- Rolled up into tenant-level "who accessed my account" reports

**Immutability:** Same as `admin_audit_logs` — `update()` and `delete()` throw immediately.

### 3.3 Tenant Audit Log (`tenant_audit_logs`)

**Purpose:** Records actions performed by **tenant-level users** (Tenant Owner, Tenant Admin, Instructor) within the tenant's own environment.

**Scope:** Completely isolated per tenant. A query against this table for Tenant A can never return data from Tenant B.

**Use cases:**
- Tenant admins viewing their own activity history
- Compliance exports per tenant
- Debugging unexpected configuration changes

---

## 4. Quota Management

Quotas are the enforcement layer that translates subscription plan limits (`PlanFeatures`) into runtime access control.

### 4.1 Global Defaults (via Platform Settings)

The `quota.*` settings in `platform_settings` define the **platform-level default limits** applied when no explicit plan limit is specified (i.e., a plan has `0` for a given limit, meaning "use platform default").

### 4.2 Quota Enforcement Flow

1. A tenant performs an action that creates or modifies a quota-limited resource (e.g., creating a new user).
2. The system checks the tenant's active subscription's `locked_features` against current usage.
3. If usage exceeds the plan limit → an `OverageRecord` is created.
4. The scheduled `subscriptions:enforce-overage-deactivation` command deactivates tenants in unresolved overage.

### 4.3 Session Enforcement Mode

The `quota.session_enforcement_mode` setting controls how session-limit breaches are handled:
- **`strict`** — New sessions are blocked once the limit is reached. Users cannot join new live sessions.
- **`soft`** — A warning is issued but new sessions are allowed to proceed over limit. Used during grace periods.

### 4.4 Downgrade Grace Period

When a tenant's plan is downgraded to a lower tier, their existing resources may exceed the new limits. The `quota.downgrade_grace_period_days` setting gives tenants a defined window to bring usage into compliance before enforcement actions begin.

---

## 5. Business Rules — Complete Reference

| ID | Rule | Enforcement Point |
|---|---|---|
| BR-INFRA-01 | All audit log writes must never throw or block primary operations. | `AdminAuditLogger` try-catch with `Log::critical()` fallback. |
| BR-INFRA-02 | Audit log records are immutable. Update and delete operations are rejected. | `AdminAuditLogRecord::update()` / `delete()` throw `RuntimeException`. |
| BR-INFRA-03 | System-initiated actions (scheduled commands) are audit-logged with `admin_id = null` and `user_agent = 'system/queue-worker'`. | `AdminAuditLogger::logSystem()`. |
| BR-INFRA-04 | Platform admin impersonation / cross-tenant support access is logged in a dedicated `platform_support_audit_logs` table (not mixed with general admin logs). | `PlatformSupportAuditLogger`. |
| BR-INFRA-05 | Razorpay `key_secret` and `webhook_secret` are encrypted at rest using AES-256-CBC (Laravel Crypt). | `UpdatePlatformSettingsUseCase::ENCRYPTED_KEYS`. |
| BR-INFRA-06 | Audit log entries for secret keys show `***` in both `old_values` and `new_values`. Actual values are never logged. | `UpdatePlatformSettingsUseCase`. |
| BR-INFRA-07 | If a secret field is submitted blank during a settings update, the existing secret is preserved. | Blank-skip check in `UpdatePlatformSettingsUseCase`. |
| BR-INFRA-08 | Platform settings are cached for 60 seconds. Cache is immediately invalidated on update. | `PlatformSettingsService` (60s TTL, `invalidateCache()` on write). |
| BR-INFRA-09 | `PlatformSettingsService` must not throw during application boot even if the database is unavailable. | `QueryException` caught silently, returns `null`. |
| BR-INFRA-10 | Razorpay gateway credentials are stored exclusively in platform settings (central DB), not in `.env`. | `PlatformSettingsService::getString('gateway.razorpay.*')`. |
| BR-INFRA-11 | Tenant audit logs are fully isolated per tenant — cross-tenant queries are architecturally forbidden. | Tenant scoping on `tenant_audit_logs`. |
| BR-INFRA-12 | Only L2+ admins can modify platform settings. | HTTP controller authorization policy. |

---

## 6. Open Questions for Product Owner

| # | Question | Impact |
|---|---|---|
| 1 | Should audit logs have a retention policy (e.g., purged after 2 years)? | Currently logs are kept indefinitely. Storage cost grows over time. |
| 2 | Should there be a read-only platform settings page for L4 Super Admins? | Currently L4 admins cannot see current gateway configuration at all. |
| 3 | Is `quota.session_enforcement_mode` tenant-configurable or only platform-wide? | Currently platform-wide only. High-volume tenants may need per-tenant overrides. |
| 4 | Should Stripe credentials also be stored in platform settings? | Currently Stripe reads from `.env` (`STRIPE_SECRET`). Inconsistency with Razorpay pattern. |

---

*End of Document — UBOTZ 2.0 Platform Infrastructure & Support Business Findings — March 27, 2026*
