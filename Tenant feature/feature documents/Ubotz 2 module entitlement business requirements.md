# UBOTZ 2.0 — Module Entitlement System

## Business Requirements Document

| Field | Value |
|---|---|
| **Document Type** | Business Requirements (Pre-Architecture) |
| **Date** | March 5, 2026 |
| **Status** | AWAITING PRODUCT OWNER SIGN-OFF |
| **Issued By** | Principal Engineer / Architecture Auditor |
| **Audience** | Product Owner, Architecture Team, Implementation Developer |
| **Prerequisites** | Phase 11A (Subscription Plans) COMPLETE, Phase 11B (Quota Enforcement) IN PROGRESS |
| **Relationship** | This system is PARALLEL to Phase 11B quota enforcement, NOT a replacement |

---

## 1. Mission Statement

The Module Entitlement System controls which product modules and features a tenant can access based on their subscription plan. While Phase 11B enforces quantitative limits (how many users, courses, etc.), this system enforces qualitative access: whether a tenant can use the Exam module at all, whether they have access to ERP payroll, whether CRM features exist in their universe.

This is the system that makes different subscription plans feel like different products. A tenant on a Basic LMS plan sees a focused learning platform. A tenant on an Enterprise plan sees a full operating system with LMS, ERP, CRM, and analytics.

---

## 2. Business Context

### 2.1 The Two Enforcement Axes

Ubotz subscription plans control tenant access along two independent axes:

| Axis | System | Question Answered | Example |
|---|---|---|---|
| Quantitative Limits | TenantQuotaService (Phase 11B) | How many of resource X can this tenant create? | max_users: 50, max_courses: 100 |
| Module Entitlements | Module Entitlement System (this document) | Can this tenant access product module Y at all? | module.exams: enabled, module.crm: disabled |

Both axes are independent. A tenant could have unlimited users (quantitative) but no access to the Exam module (entitlement). Or they could have access to every module but be limited to 10 courses. The two systems compose, they do not replace each other.

### 2.2 Enforcement Chain (Three Layers)

Every tenant-context request passes through three authorization layers in strict order:

| Layer | Check | Failure Response | Owner |
|---|---|---|---|
| Layer 1: Module Entitlement | Does the tenant's plan include this module? | HTTP 403 + MODULE_NOT_AVAILABLE | Module Entitlement System |
| Layer 2: RBAC Capability | Does the user's role have this capability? | HTTP 403 + INSUFFICIENT_CAPABILITY | Phase 10A Tenant RBAC |
| Layer 3: Quota Limit | Has the tenant exceeded the numeric limit? | HTTP 403 + QUOTA_EXCEEDED | Phase 11B TenantQuotaService |

If the tenant's plan does not include `module.exams`, Layer 1 blocks the request before RBAC or quota checks are even evaluated.

---

## 3. Architectural Decision: Separate Vocabulary

### 3.1 Decision

Module entitlements use a **SEPARATE vocabulary** from tenant RBAC capabilities. Plan entitlements are defined at the module level (`module.lms`, `module.exams`, `module.erp.payroll`), not at the individual capability level (`course.create`, `exam.manage`).

### 3.2 Rationale

Tenant RBAC capabilities (Phase 10A) answer: "What can this user do within their tenant based on their role?" Module entitlements answer: "What product surface area has this tenant purchased?" These are different bounded contexts with different lifecycles, different actors, and different change frequencies.

Sharing codes would cause: (a) coupling explosion where every RBAC capability change forces plan reconfiguration, (b) granularity mismatch since commercial plans sell modules not individual actions, and (c) role confusion where Super Admins must think in RBAC terms when configuring plans.

### 3.3 The Mapping Layer

Each module entitlement maps to a set of RBAC capabilities it enables. This mapping is a static platform configuration, versioned in code, not stored in the database. If a tenant's plan does not include a module, all RBAC capabilities mapped to that module are suppressed regardless of role assignments.

> **NON-NEGOTIABLE:** The mapping is platform-defined and immutable by tenants. Tenants cannot modify which capabilities belong to which module. They can only create roles that combine the capabilities available within their entitled modules.

---

## 4. Module Entitlement Registry

### 4.1 Module Codes

The following module entitlement codes are defined for the platform. This list is extensible as new product modules are developed.

| Module Code | Product Area | RBAC Capabilities Unlocked |
|---|---|---|
| `module.lms` | Core LMS — Courses, curriculum, learning player | `course.view`, `course.create`, `course.edit`, `course.publish`, `course.archive` |
| `module.exams` | Exam Hierarchy — Quiz management, assessments | `exam.view`, `exam.manage` |
| `module.erp.attendance` | ERP: Attendance — Tracking, reporting | `attendance.view`, `attendance.manage` (future) |
| `module.erp.payroll` | ERP: Payroll — Salary, deductions | `payroll.view`, `payroll.manage` (future) |
| `module.erp.timetable` | ERP: Timetable — Scheduling | `timetable.view`, `timetable.manage` (future) |
| `module.erp.transport` | ERP: Transport — Routes, vehicles | `transport.view`, `transport.manage` (future) |
| `module.erp.assets` | ERP: Assets — Allocation, tracking | `assets.view`, `assets.manage` (future) |
| `module.crm` | CRM — Leads, marketing, enrollment funnels | `crm.view`, `crm.manage` (future) |
| `module.billing.student` | Student Billing — Fees, payments, invoices | `billing.student.view`, `billing.student.manage` (future) |
| `module.analytics` | Advanced Analytics — Dashboards, reports | `analytics.view`, `analytics.export` (future) |

### 4.2 Mandatory Base Module

> **NON-NEGOTIABLE:** Every subscription plan MUST include `module.lms`. This is a domain invariant enforced at the plan creation level. Ubotz is fundamentally a learning platform; a plan without LMS is architecturally invalid.

### 4.3 ERP Sub-Module Granularity

ERP is NOT a single monolithic module. Each ERP domain (attendance, payroll, timetable, transport, assets) is an independently toggleable sub-module. A tenant can purchase ERP attendance without payroll. This enables fine-grained commercial packaging.

---

## 5. Business Rules (NON-NEGOTIABLE)

### 5.1 Plan-Level Rules

| Rule ID | Rule | Detail |
|---|---|---|
| BR-01 | Every plan MUST include `module.lms` | Domain invariant. Plan creation/update rejects any entitlement set that does not include `module.lms`. |
| BR-02 | Plan entitlements are stored as a JSON array of module codes on the subscription plan | Extends the existing `features` JSON on `subscription_plans`. Module entitlements are stored separately from quantitative limits. |
| BR-03 | Only platform-defined module codes are accepted | Unknown module codes are rejected at plan creation/update. The platform maintains a canonical registry of valid codes. |
| BR-04 | Plan entitlement changes do NOT retroactively affect existing subscriptions | Consistent with Phase 11A BR-08 (price immutability). When a plan's entitlement set changes, existing subscriptions retain their locked entitlements. |
| BR-05 | Entitlements are locked at subscription assignment time | The `tenant_subscriptions` record stores the entitlement set active at the moment of assignment. This is the contractual agreement. |

### 5.2 Enforcement Rules

| Rule ID | Rule | Detail |
|---|---|---|
| BR-06 | When a module is not entitled, ALL capabilities mapped to that module are suppressed | Even if a role explicitly grants `exam.manage`, if the plan does not include `module.exams`, the capability is silently removed from the effective capability set. |
| BR-07 | Enforcement is a hard block, not a soft warning | Requests to module endpoints return HTTP 403 with error code `MODULE_NOT_AVAILABLE`. No ambiguity. |
| BR-08 | Data is preserved when a module is disabled | Disabling `module.exams` does not delete exam data. Courses, exams, and all associated records remain in the database. Re-enabling the module restores full access. |
| BR-09 | Module entitlement check occurs BEFORE RBAC capability check | This is the first gate in the authorization chain. If the module is not entitled, RBAC is never evaluated. |
| BR-10 | Plan changes take effect immediately | When a tenant's plan changes (upgrade or downgrade), the new entitlement set applies instantly. No deferred activation. |

### 5.3 Override Rules

| Rule ID | Rule | Detail |
|---|---|---|
| BR-11 | Super Admin can grant module access beyond the plan (GRANT override) | Example: Tenant X is on Basic LMS plan but Super Admin grants `module.crm` as an override. Tenant X now has CRM access despite plan not including it. |
| BR-12 | Super Admin can revoke module access despite the plan including it (REVOKE override) | Example: Tenant Y is on Enterprise plan with CRM, but Super Admin revokes `module.crm` due to abuse. Tenant Y loses CRM access. |
| BR-13 | Overrides have NO expiry — they persist until manually removed by Super Admin | There is no auto-expiry mechanism. Overrides are intentional administrative actions. |
| BR-14 | REVOKE overrides are auto-cleared on plan change if the new plan includes the module | If a Super Admin revoked `module.crm` for Tenant Y, and Tenant Y upgrades to a plan that includes `module.crm`, the revoke override is automatically removed. Rationale: the plan change is a new contractual agreement that supersedes the previous override. |
| BR-15 | GRANT overrides persist across plan changes | If a Super Admin granted `module.crm` to Tenant X, and Tenant X changes plans, the grant override remains unless manually removed. |
| BR-16 | Every override action MUST be audit-logged | Who created the override, when, what module, grant or revoke, and any reason text. |

---

## 6. UI Behavior

### 6.1 Tenant Admin Experience

When a module is NOT entitled for a tenant, the associated features are completely hidden from the tenant admin UI. Navigation items, dashboard widgets, and any references to the module are removed as if the feature does not exist. This is not a greyed-out or disabled state — it is complete absence.

| Scenario | UI Behavior |
|---|---|
| Plan includes `module.exams` | Exam menu item visible in sidebar. Exam dashboard widget shown. Exam-related capabilities appear in role configuration. |
| Plan does NOT include `module.exams` | No exam menu item. No exam dashboard widget. Exam capabilities do not appear in role configuration. No upgrade prompts. |
| Plan does NOT include `module.erp.payroll` | No payroll menu item. Other ERP sub-modules (if entitled) remain visible. |

### 6.2 Frontend Authorization Flow

The frontend receives the tenant's effective entitlement set (plan entitlements + overrides) as part of the tenant context API response. The frontend uses this set to conditionally render navigation, routes, and UI components. The frontend entitlement check is a UX convenience only — the backend is the security authority.

### 6.3 Super Admin Experience

Super Admins manage module entitlements at two levels: (a) when creating or editing subscription plans, they configure which modules the plan includes, and (b) when managing individual tenants, they can apply GRANT or REVOKE overrides. The override management UI must clearly show: current plan entitlements, active overrides (with type: grant/revoke), the effective entitlement set (plan + overrides), and an audit trail of override history.

---

## 7. Effective Entitlement Resolution

### 7.1 Resolution Algorithm

The effective entitlement set for a tenant is computed as follows:

**Step 1:** Start with the locked entitlements from the tenant's active subscription. If no active subscription exists, start with an empty set (only platform defaults apply).

**Step 2:** Apply all GRANT overrides — add any granted modules to the set.

**Step 3:** Apply all REVOKE overrides — remove any revoked modules from the set.

**Step 4:** The resulting set is the tenant's effective module entitlements.

> **NON-NEGOTIABLE:** REVOKE overrides take precedence over GRANT overrides. If the same module has both a GRANT and a REVOKE override (which should not normally happen but could via admin error), the REVOKE wins. The system should warn the Super Admin if conflicting overrides exist.

### 7.2 Override Cleanup on Plan Change

When a tenant's plan changes (via upgrade, downgrade, or new assignment):

**Step 1:** Lock the new plan's entitlement set onto the subscription record.

**Step 2:** Scan all REVOKE overrides for the tenant. If the new plan includes a module that has a REVOKE override, auto-remove that override.

**Step 3:** GRANT overrides are NOT affected by plan changes. They persist.

**Step 4:** Audit-log all auto-removed overrides with reason: "Auto-cleared: new plan includes module."

---

## 8. Example Plan Configurations

| Plan Name | Modules Included | Use Case |
|---|---|---|
| Starter LMS | `module.lms` | Small coaching centers. Courses only, no exams, no ERP. |
| Standard LMS | `module.lms`, `module.exams` | Exam-prep institutions. Courses + quiz/exam management. |
| School Basic | `module.lms`, `module.exams`, `module.erp.attendance`, `module.erp.timetable` | Schools needing LMS + basic operations. |
| School Complete | `module.lms`, `module.exams`, `module.erp.attendance`, `module.erp.timetable`, `module.erp.transport`, `module.billing.student` | Full school management. |
| Enterprise | All modules | Large institutions needing the complete operating system. |

---

## 9. Relationship to Existing Systems

### 9.1 Phase 11A (Subscription Plans)

Module entitlements extend the subscription plan model. The existing `features` JSON on `subscription_plans` currently stores quantitative limits (`max_users`, `max_courses`, etc.). Module entitlements add a new dimension: a `modules` array (or separate column) storing which module codes the plan includes. Both coexist on the same plan entity.

### 9.2 Phase 11B (Quota Enforcement)

Module entitlements and quota enforcement are independent, composable systems. Quota checks only fire for resources within entitled modules. If `module.exams` is not entitled, there is no need to check exam quotas because the module gate already blocked the request.

### 9.3 Phase 10A (Tenant RBAC)

The module entitlement system sits above RBAC in the authorization chain. It filters the effective capability set: a role's capabilities are intersected with the capabilities unlocked by the tenant's entitled modules. Capabilities belonging to non-entitled modules are silently excluded from the effective set. This means a tenant admin configuring roles will never see capabilities for modules they don't have access to.

---

## 10. Scope Boundaries

### 10.1 What This System IS

| In Scope | Detail |
|---|---|
| Module entitlement storage on subscription plans | Which modules each plan includes |
| Entitlement locking on tenant subscriptions | Immutable snapshot at assignment time |
| Per-tenant GRANT and REVOKE overrides | Super Admin manual adjustments |
| Override auto-cleanup on plan change | REVOKE overrides cleared when new plan includes module |
| Enforcement gate in the authorization chain | HTTP 403 for non-entitled modules |
| Effective entitlement resolution | Plan + overrides computed to effective set |
| Frontend entitlement filtering | UI hides non-entitled features |
| Full audit trail | Every entitlement and override change logged |

### 10.2 What This System is NOT

| Out of Scope | Reason |
|---|---|
| Module-specific pricing (module.crm costs extra $X) | Pricing is plan-level, not module-level. Deferred to payment integration phase. |
| Tenant self-service module selection | Tenants do not pick modules. Plans define them. Super Admin assigns plans. |
| Module-level usage analytics | Future phase. Track which modules tenants actually use. |
| Module marketplace / add-on store | Violates platform product model. Ubotz is not a marketplace. |
| Automatic module recommendations | AI/ML-driven upselling. Future consideration. |
| Grace period on module removal | Per business decision: hard block, immediate effect, data preserved. |

---

## 11. Sign-Off

This document defines the complete business requirements for the Module Entitlement System. All decisions documented here were made collaboratively between the Product Owner and the Principal Engineer / Architecture Auditor.

No architecture design, implementation planning, or code should proceed until this document receives explicit Product Owner sign-off.

| | |
|---|---|
| **Product Owner Sign-Off** | ____________________________ |
| **Date** | ____________________________ |
| **Status** | PENDING |

> **NON-NEGOTIABLE:** Implementation of this system is gated behind Phase 11B completion. This document establishes business requirements only. The next step after sign-off is a Developer Instruction Document, followed by an Implementation Plan, followed by a Principal Engineer Audit, and only then implementation.

---

## Appendix A: Decision Log

All business decisions made during requirements gathering, with rationale.

| Decision | Choice | Rationale |
|---|---|---|
| Entitlement granularity | Module-level with RBAC capability mapping | Avoids coupling explosion between plan configuration and RBAC evolution. Commercially meaningful. |
| Vocabulary | Separate from RBAC codes (`module.*` namespace) | Different bounded contexts, different lifecycles, different actors. |
| Control model | Plan-driven with per-tenant Super Admin overrides | Plans are the primary driver. Overrides handle exceptions without creating custom plans. |
| Downgrade behavior | Hard block, data preserved, re-enable restores access | No data loss. Simpler implementation. Better tenant experience on re-upgrade. |
| UI behavior | Features completely hidden (not greyed out) | Clean UX. No upgrade prompts. No confusion about unavailable features. |
| Override expiry | No expiry — persists until manually removed | Administrative intent is explicit. No surprise re-activations. |
| Override conflict resolution | REVOKE overrides auto-cleared on plan change if new plan includes module | Plan change is a new contract that supersedes previous restrictions. |
| GRANT override on plan change | Persists across plan changes | Grant overrides are explicit admin decisions independent of plan. |
| Mandatory base module | `module.lms` required on every plan | Ubotz is fundamentally a learning platform. A plan without LMS is invalid. |
| ERP granularity | Split into sub-modules (attendance, payroll, timetable, transport, assets) | Enables fine-grained commercial packaging. Schools may need attendance but not payroll. |
| Plan change timing | Immediate effect | No deferred activation complexity. Simpler implementation and clearer tenant experience. |
| Conflict precedence | REVOKE wins over GRANT if both exist for same module | Safety-first. Explicit blocks take priority. |

---

*End of Document — UBOTZ 2.0 Module Entitlement System — Business Requirements — March 5, 2026*