# UBOTZ 2.0 — Platform Staff & RBAC: Business Findings & Design

| Field | Value |
|---|---|
| **Document Type** | Principal Engineer — Business Logic Audit |
| **Feature** | Platform Staff Management & Role-Based Access Control |
| **Date** | 2026-03-27 |
| **Issued By** | Principal Engineer / Architecture Auditor |
| **Scope** | Admin identity, 7-tier hierarchy, authority enforcement, audit trail |
| **Status** | REVIEWED — Approved for implementation |

---

## 1. Executive Summary

UBOTZ 2.0 operates as a multi-tenant B2B education platform managed by a team of internal platform staff. These staff members — referred to as "Admins" — have varying levels of trust, capability, and responsibility. To prevent privilege misuse, accidental data exposure, and insider threats, the platform implements a **7-tier Authority Hierarchy (L1–L7)** with strict enforcement rules.

This document defines:
1. The business reasoning behind the 7-tier model.
2. What each tier is allowed to do and forbidden from doing.
3. The rules governing how admins can act on other admins (creation, mutation, deletion).
4. The audit and security obligations tied to every action.

---

## 2. The Problem with Flat RBAC (Why 7 Tiers?)

A flat role model (e.g., "Admin" vs "Super Admin") creates the following risks:

| Risk | Description |
|---|---|
| **Privilege escalation** | Any admin can grant themselves or another admin permissions equal to or higher than their own. |
| **Insider threat** | A single compromised admin account has access to all features. |
| **Revenue leakage** | Without financial authority gating, operational admins could grant paid subscriptions for free. |
| **Audit blind spots** | Without tier separation, it is impossible to determine whether a sensitive action was taken by an appropriate authority. |

The 7-tier model solves this by making authority **numerically comparable**, **strictly hierarchical**, and **enforcement-first** at every layer.

---

## 3. The 7-Tier Authority Hierarchy

| Tier | Label | Score | Primary Mission | Who Reports To |
|---|---|---|---|---|
| **L1** | Platform Owner | 90 | Governance, trust, and ultimate authority. | No one. |
| **L2** | Root Approver | 80 | High-impact decision gating and financial approval. | L1 |
| **L3** | Root Operator | 70 | Infrastructure execution (deployments, migrations). | L1/L2 |
| **L4** | Super Admin | 60 | Day-to-day platform operations and tenant support. | L2/L3 |
| **L5** | Tenant Ops | 50 | Direct tenant assistance and onboarding support. | L4 |
| **L6** | Billing Admin | 40 | Financial operations and invoice auditing only. | L2/L3 |
| **L7** | Audit Admin | 30 | Read-only compliance and security oversight. | L1/L2 |

> **Design intent:** The numeric scores have 10-unit gaps (30, 40, 50, 60, 70, 80, 90) so that future intermediate levels can be inserted without schema changes or renumbering. This was a lesson learned from UBOTZ 1.0, which required 9 patch migrations to fix a flat hierarchy.

---

## 4. Business Rules — The "Strictly Above" Principle

This is the most important rule in the entire RBAC system.

> **An actor (Admin A) may ONLY perform a write action on a target (Admin B) if Admin A's authority level is STRICTLY NUMERICALLY GREATER than Admin B's.**

### 4.1 What "Strictly Above" Means

| Action | Requires |
|---|---|
| Create an admin of level X | Actor's level > X (special exception: L1 can create another L1) |
| Update profile of admin of level X | Actor's level > X |
| Deactivate admin of level X | Actor's level > X AND Actor is L2+ |
| Activate (reactivate) admin of level X | Actor's level > X AND Actor is L2+ |
| Assign a role of level X | Actor's level > X (AND only L1 can assign L2/L3 roles) |
| Revoke a role from admin of level X | Actor's level > X |
| Force password reset on admin of level X | Actor's level > X AND Actor is L1 |
| Unlock account of admin of level X | Actor's level > X AND Actor is L2+ |

### 4.2 Special L1 Exception

An L1 (Platform Owner) can create another L1 admin. This is the only case where an actor can act on a peer. This exception exists to prevent a "lock-out scenario" where the last L1 admin cannot be succeeded.

### 4.3 L2/L3 Role Assignment Requires L1

Assigning a role with authority level L2 or L3 requires the actor to be exactly L1. An L3 cannot promote another admin to L3. This is a hard business rule enforced in `AuthorityValidationService`.

### 4.4 Self-Action Prohibition

No admin can perform any of the following on themselves:
- Deactivate their own account.
- Activate their own account.
- Assign roles to themselves.
- Force a password reset on themselves.

This prevents "self-elevation" exploits.

---

## 5. Capabilities by Tier

### L1 — Platform Owner
**Permitted:**
- Create, update, deactivate, and activate any admin at any level (including L1).
- Assign and revoke roles at any level.
- Modify global platform settings.
- Force password reset on any admin.
- Unlock any admin account.
- All L2–L7 capabilities.

**Forbidden:** N/A (Full authority).

---

### L2 — Root Approver
**Permitted:**
- Deactivate and activate L3–L7 admins.
- Approve/Reject institution type requests.
- Approve large-scale subscription plan changes.
- Permanently delete tenants (`tenant.hard_delete`).
- Unlock L3–L7 accounts.
- All L4–L7 viewing capabilities.

**Forbidden:**
- Create or update admin profiles (requires L1 via `staff.manage`).
- Assign roles (requires L1).
- Modify global system settings.
- Force password reset (requires L1).

---

### L3 — Root Operator
**Permitted:**
- Trigger system deployments and database migrations.
- Flush application cache.
- View raw system logs.
- Manage tenant users directly.
- All L4–L7 capabilities.

**Forbidden:**
- Any structural approval action (requires L2).
- Permanently delete tenants (requires L2).
- Create or modify admin accounts (requires L1).

---

### L4 — Super Admin
**Permitted:**
- Full tenant lifecycle management: provision, suspend, restore tenants.
- Assign and modify tenant subscription plans.
- Unlock L5–L7 accounts.
- View system health metrics.
- View staff list (L4 and below only).
- Manage landing page templates.

**Forbidden:**
- Infrastructure operations (deployments, migrations, log access): requires L3.
- Permanent tenant deletion: requires L2.
- Any staff write action: requires L1 (staff.manage).

---

### L5 — Tenant Ops
**Permitted:**
- View tenant records and configurations.
- View landing page templates.
- View tenant user lists.

**Forbidden:**
- Modify tenant status (suspend/restore): requires L4.
- Manage billing or subscriptions.
- Any admin write operations.

---

### L6 — Billing Admin
**Permitted:**
- Full billing management: generate invoices, process refunds, freeze billing profiles.
- Read-only access to billing and subscription records.

**Forbidden:**
- Manage tenants or staff.
- Modify system settings.
- Access operational dashboards.

> **Important:** L6 can view billing data for ALL tenants. Their access is platform-wide from a financial perspective.

---

### L7 — Audit Admin
**Permitted (Read-Only):**
- View platform audit logs.
- Export audit data.
- View subscription plan listings.

**Forbidden:**
- ANY state-changing action whatsoever.
- L7 is the "Compliance Observer." It exists to satisfy audit requirements, not to operate the platform.
- Assigning any execution-level permission to L7 is blocked at the domain layer by `AuthorityValidationService::assertNotAuditAdminExecutePermission()`.

---

## 6. Visibility Rules (Who Can See Whom?)

Row-level visibility is enforced to prevent admin enumeration (i.e., an L4 admin should not be able to discover the existence of L1 or L2 admins).

| Actor Level | Can See |
|---|---|
| L1 | All admins (L1–L7) |
| L2 | L2, L3, L4, L5, L6, L7 |
| L3 | L2, L3, L4, L5, L6, L7 |
| L4 | L4, L5 only |
| L5 and below | Middleware blocks access before query is reached |

**Anti-Enumeration Rule:** When an actor requests a staff member by ID who exists but is outside their visible set, the API returns `404 Not Found` — NOT `403 Forbidden`. This prevents the actor from inferring that a hidden admin exists.

---

## 7. Admin Lifecycle — Status State Machine

| Status | Meaning | Who Can Set It |
|---|---|---|
| `pending_activation` | Default on creation. Cannot log in yet. | System (on create) |
| `active` | Can log in and perform permitted actions. | L2+ (via activate) |
| `deactivated` | Permanently blocked from login. Data preserved. | L2+ (via deactivate) |
| `locked` | Temporarily blocked due to 5 failed login attempts. | System (auto), L2+ (manual unlock) |

### 7.1 Status Transition Table

| From | To | Trigger | Authority Required |
|---|---|---|---|
| `pending_activation` | `active` | L2+ activates the account | L2+ |
| `active` | `deactivated` | L2+ deactivates | L2+, must be above target |
| `deactivated` | `active` | L2+ reactivates | L2+, must be above target |
| `active` | `locked` | 5 consecutive failed logins | System (automatic) |
| `locked` | `active` | Manual unlock | L2+, must be above target |

---

## 8. Token Revocation & Session Security

**Problem:** When an admin is deactivated or their role is changed, existing JWT tokens remain valid until they expire (usually 60–120 minutes). This is a real-world risk window.

**Solution — `token_version`:** Every `AdminRecord` has a `token_version` INT column. This version is embedded in every JWT issued to the admin. The auth middleware checks that the JWT's `token_version` matches the DB record. When the version is incremented (e.g., on deactivation or role change), all existing tokens are immediately invalidated.

---

## 9. Audit Trail — Business Requirements

Every sensitive action MUST be logged in the `admin_audit_logs` table. This table is:
- **Append-only**: No `UPDATE`, No `DELETE`, No soft deletes.
- **Indexed** for time-based queries and entity-based queries.

Entries must capture:
- `admin_id`: Who performed the action.
- `action`: Dot-notation verb (e.g., `staff.create`, `staff.deactivate`).
- `entity_type` + `entity_id`: The target of the action.
- `old_values` / `new_values`: JSON snapshot of changed fields (never passwords).
- `metadata`: Contextual data (e.g., authority level of the target).
- `ip_address` + `user_agent`: Request context.
- `created_at`: When it happened.

---

## 10. Business Rules — Complete Reference

| ID | Rule | Enforcement Point |
|---|---|---|
| BR-RBAC-01 | Actor must be strictly above target for any write operation. | `AdminEntity` domain invariants, `AuthorityValidationService`. |
| BR-RBAC-02 | Actor can only see staff within their visible set. | `ListStaffQuery::getVisibleLevels()`. |
| BR-RBAC-03 | Admins cannot mutate themselves (no self-deactivation, no self-role assignment). | `AdminPolicy` checks `$actor->id !== $target->id`. |
| BR-RBAC-04 | Only L1 can assign L2/L3 roles. | `AuthorityValidationService::canAssignRole()`. |
| BR-RBAC-05 | L7 (Audit Admin) can NEVER be given execution permissions. | `AuthorityValidationService::assertNotAuditAdminExecutePermission()`. |
| BR-RBAC-06 | Only L1 can create new admin accounts. | `AdminPolicy::create()` requires level >= 90. |
| BR-RBAC-07 | Deactivation requires L2+ authority, plus the actor must be above the target. | `AdminPolicy::delete()`. |
| BR-RBAC-08 | Force password reset requires L1, plus actor must be above target. | `AdminPolicy::forcePasswordReset()`. |
| BR-RBAC-09 | All admin mutations are logged in `admin_audit_logs` (append-only). | `AdminAuditLogger` in all UseCases. |
| BR-RBAC-10 | API returns 404 (not 403) when actor requests a staff member outside their visibility set. | `StaffReadController::show()`. |
| BR-RBAC-11 | Token version is incremented on role change or deactivation, immediately invalidating all JWTs. | Auth middleware + UseCase event. |
| BR-RBAC-12 | Password is Bcrypt-hashed before persistence. It is never returned in any API response. | `AdminRecord::$hidden`, `CreateStaffUseCase`. |

---

## 11. Open Questions for Product Owner

| # | Question | Impact |
|---|---|---|
| 1 | Should there be a "Two-Person Integrity" rule for L1 account creation (requires sign-off from an existing L1)? | Major security uplift, adds an approval workflow for highest-risk action. |
| 2 | Should "Billing Admin" (L6) be able to see admin PII (names, emails) when viewing audit logs? | Privacy vs. auditing tradeoff. |
| 3 | Do we need Temporary Delegation — where an L4 can be granted temporary L3 capabilities for maintenance windows? | Time-bounded RBAC, requires scheduler integration. |
| 4 | Should locked accounts automatically unlock after a cooling-off period (e.g., 24 hours)? | Currently manual-unlock only. |

---

*End of Document — UBOTZ 2.0 Platform Staff & RBAC Business Findings — March 27, 2026*
