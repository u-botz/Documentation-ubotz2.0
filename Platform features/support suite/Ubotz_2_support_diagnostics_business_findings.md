# UBOTZ 2.0 — Support & Diagnostics Suite: Business Findings

| Field | Value |
|---|---|
| **Document Type** | Principal Engineer — Business Logic Audit |
| **Feature** | Support & Diagnostics Suite |
| **Date** | 2026-03-27 |
| **Issued By** | Principal Engineer / Architecture Auditor |
| **Scope** | Platform-level troubleshooting tools and tenant assistance workflows |
| **Status** | REVIEWED — Reflects current implemented state |

---

## 1. Executive Summary

The **Support & Diagnostics Suite** in UBOTZ 2.0 provides platform administrators with the tools necessary to assist tenants, troubleshoot technical issues, and enforce security without requiring direct database access or compromising tenant data privacy.

The suite follows a **"Safe Support"** philosophy: all support actions are performed through high-level application interfaces that enforce strict authorization and leave an immutable audit trail in `platform_support_audit_logs`.

---

## 2. Core Support Capabilities

### 2.1 Tenant Impersonation
Platform admins can securely log into a tenant's environment as a specific tenant user to replicate reported issues first-hand.

- **Authority Requirement**: Only admins with **Authority Level 60+ (L4 Admin)** can initiate impersonation. Authority 50 (L5 Operator) is explicitly blocked with HTTP 403.
- **Workflow (Start)**: The admin provides a target user ID and a mandatory reason → A short-lived impersonation token is issued via `TokenServiceInterface::issueImpersonationToken()` → Audit log entry written → `TenantImpersonationStarted` domain event dispatched.
- **Workflow (Stop)**: The admin explicitly terminates the session → Audit log entry written (action: `tenant.impersonation_ended`) → `TenantImpersonationEnded` domain event dispatched.
- **Auditing**: Both session start and stop are logged in `platform_support_audit_logs`, capturing actor, tenant, target user, reason, IP address, and user agent.

### 2.2 Account Management Controls
Platform admins can manage individual tenant user accounts to resolve access issues or respond to security threats. All actions require **Authority Level 60+** and are audit-logged.

| Action | Business Purpose | DB Effect | Audit Action Key |
|---|---|---|---|
| **Disable Account** | Revokes all access for a specific tenant user immediately. | Sets `users.status = 'suspended'`. | `tenant_admin.account_disabled` |
| **Enable Account** | Restores access to a previously suspended account. | Sets `users.status = 'active'`. | `tenant_admin.account_enabled` |
| **Unlock Account** | Clears lockouts caused by excessive failed login attempts. | Resets `users.failed_login_attempts` to `0`. | `tenant_admin.account_unlocked` |
| **Force Password Reset** | Flags the user's account to require a new password on next login. | Sets `users.force_password_reset = true`. | `tenant_admin.password_reset_forced` |
| **Force Logout** | Records a session termination audit event for the user. *(Note: As of current implementation, this logs the intent — actual stateless JWT invalidation is a pending enhancement.)* | Audit log only (no token mutation in current release). | `tenant_admin.session_terminated` |

---

## 3. Diagnostics & Observability

Read-only diagnostic tools require **Authority Level 50+** (L5 Platform Operator). Admins below authority 50 are denied with HTTP 403.

### 3.1 Activity Timeline
A chronological stream of all actions performed within a tenant, sourced from `tenant_audit_logs`. Useful for reconstructing incident timelines. Response includes paginated `data` and `meta`.

### 3.2 Support Snapshot
A real-time health check providing a high-level overview of a tenant's operational state:

| Metric | Description |
|---|---|
| `total_users` | Count of registered users for the tenant. |
| `active_sessions` | Count of currently active sessions (via `GetTenantActiveSessionsQuery`). |
| `api_requests_24h` | API call volume in last 24 hours. |
| `errors_24h` | Error count in last 24 hours. |
| `current_subscription` | Active subscription plan and billing state. |

### 3.3 Application Logs
A unified log view that combines informational and error logs via a union query. Useful for support staff investigating the flow of tenant operations.

### 3.4 Error Logs
Technical error log entries scoped to the specific tenant (sourced from `TenantErrorLogRecord`), including `error_id`, `service`, `error_message`, and `severity`. Allows engineers to debug issues without searching global system logs.

---

## 4. Business Rules — Complete Reference

| ID | Rule | Enforcement Point |
|---|---|---|
| BR-SUP-01 | Only Authority Level 60+ (L4 Admin) can perform write actions (impersonation, account management). Authority 50 (Operator) is forbidden. | `ImpersonateTenantAdminUseCase` authority check; write endpoint middleware (authority:60). |
| BR-SUP-02 | Every support write action must be atomically audit-logged in `platform_support_audit_logs` within the same DB transaction as the state mutation. | All Support UseCases — `DB::transaction()` wrapping both mutation and `PlatformSupportAuditLogger::log()`. |
| BR-SUP-03 | Impersonation requires a mandatory `target_tenant_admin_id` and `reason`. | `ImpersonateTenantAdminCommand` — validated at HTTP layer. |
| BR-SUP-04 | The target tenant must be in `active` status before impersonation is allowed. | `ImpersonateTenantAdminUseCase` — `$tenant->status !== 'active'` guard. |
| BR-SUP-05 | The target user must belong to the specified tenant (cross-tenant user impersonation is blocked). | `ImpersonateTenantAdminUseCase` — `where('tenant_id', $tenantId)` filter on `users` table. |
| BR-SUP-06 | Impersonation session termination (stop) is also audited — both start and end are captured. | `StopTenantImpersonationUseCase`. |
| BR-SUP-07 | Read diagnostics (timeline, logs, snapshot) require Authority Level 50+. | Read endpoint middleware (authority:50). |
| BR-SUP-08 | Force Logout logs the termination intent. Actual JWT invalidation is a pending enhancement (current: audit-log only). | `ForceLogoutTenantUserUseCase` — code comment acknowledges limitation. |
| BR-SUP-09 | All account management actions verify user existence before proceeding; throw `TenantAccountNotFoundException` if not found. | All account management UseCases. |

---

## 5. Security Guardrails

1. **Immutable Audit Trail**: The `platform_support_audit_logs` table is append-only. The `PlatformSupportAuditLogRecord` Eloquent model throws a `RuntimeException` on any `update()` or `delete()` attempt — enforced at the model level.
2. **Atomic Write+Log Pattern**: Every mutating UseCase wraps both the state change and the audit log write inside `DB::transaction()`, ensuring no action is recorded without the corresponding mutation succeeding (and vice versa).
3. **Contextual Tenant Isolation**: Every account management UseCase verifies `(user_id, tenant_id)` together. It is impossible to affect a user in Tenant B when the request specifies Tenant A.
4. **No Credential Exposure**: Platform admins can force password resets (sets `force_password_reset = true`) but cannot view or set a specific password. Password hashes are never exposed through support tooling.

---

*End of Document — UBOTZ 2.0 Support & Diagnostics Business Findings — March 27, 2026*
