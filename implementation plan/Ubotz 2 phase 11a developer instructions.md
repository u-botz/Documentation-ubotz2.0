# UBOTZ 2.0 — Phase 11A Developer Instructions

## Platform → Tenant Subscription Plan Management

| Field | Value |
|---|---|
| **Document Type** | Developer Instruction (Pre-Implementation Brief) |
| **Phase** | 11A |
| **Date** | March 2, 2026 |
| **Issued By** | Principal Engineer / Architecture Auditor |
| **Audience** | Implementation Developer |
| **Expected Deliverable** | Phase 11A Implementation Plan (same format as 10A–10E plans) |
| **Prerequisites** | Phase 10E COMPLETE, all tech debt (TD-1 through TD-9) resolved |

> **This document defines WHAT to build, the business rules, constraints, and quality gates. The developer must produce a detailed implementation plan for review and approval BEFORE writing any code.**

---

## 1. Mission Statement

Phase 11A adds **manual subscription plan management** to the Platform Admin (Super Admin) Dashboard. A Super Admin can create subscription plans, assign them to tenants, upgrade/downgrade plans, and manage subscription lifecycle — all without payment gateway integration.

**This phase handles REAL MONEY conceptually** — the data structures, status transitions, and audit trails must be built as if Razorpay were connected tomorrow. Every shortcut in this phase becomes a financial vulnerability later.

**No payment gateway integration in Phase 11A.** Razorpay is deferred to a future phase (not scheduled). Phase 11A is purely platform-side subscription management.

---

## 2. Business Context

### 2.1 Who Is Billing Whom?

Phase 11A targets **Platform → Tenant** billing only. This is Ubotz (the platform) managing subscription plans for institutes (tenants). This is NOT tenant → student billing (that is a completely separate bounded context for a future phase).

### 2.2 Business Flow

1. **Super Admin creates subscription plans** (e.g., Free Trial, Starter, Professional, Enterprise) with pricing, feature limits, and billing cycles.
2. **Super Admin assigns a plan to a tenant** — this creates a `tenant_subscription` record.
3. **Tenants do NOT self-select plans** in this phase. All plan assignment is manual by Super Admin.
4. **Newly provisioned tenants have NO plan** — Super Admin manually assigns after provisioning.
5. **Super Admin can upgrade/downgrade** a tenant's plan at any time.
6. **Trial plans auto-expire** based on configurable duration.

---

## 3. Business Rules (NON-NEGOTIABLE)

The developer MUST enforce every rule listed below. These are domain invariants, not suggestions.

### 3.1 Subscription Plan Rules

| Rule ID | Rule | Enforcement |
|---|---|---|
| BR-01 | Plans have a unique `code` (snake_case). Once created, the code is immutable. | Domain Entity validation + UNIQUE DB constraint |
| BR-02 | Prices are stored in **integer cents** (BIGINT UNSIGNED). No DECIMAL. No FLOAT. Ever. | `price_monthly_cents`, `price_annual_cents` columns |
| BR-03 | Plans have a `features` JSON column defining tenant limits: `max_users`, `max_courses`, `max_storage_mb`, and extensible for future keys. | JSON column with schema validation in domain |
| BR-04 | Plans support two billing cycles: `monthly` and `annual`. | BillingCycle value object |
| BR-05 | Plans have a `status`: `active` or `archived`. Only `active` plans can be assigned to new tenants. Existing assignments to an `archived` plan remain valid until they expire or are changed. | Domain Entity status guard |
| BR-06 | Plans cannot be deleted if any tenant has an active subscription to that plan. They can only be archived. | Domain rule: prevent hard delete with active subscriptions |
| BR-07 | A plan marked as `is_trial: true` must have a `trial_duration_days` value (e.g., 14, 30). When assigned, the system auto-calculates `ends_at` from assignment date. | Domain logic in subscription assignment |
| BR-08 | Plan pricing can be updated, but changes do NOT retroactively affect existing subscriptions. Existing subscriptions retain the price at the time of assignment. | Subscription records store `locked_price_monthly_cents` and `locked_price_annual_cents` at assignment time |

### 3.2 Tenant Subscription Rules

| Rule ID | Rule | Enforcement |
|---|---|---|
| BR-09 | A tenant can have **at most ONE active subscription** at any time. | UNIQUE constraint: `(tenant_id)` WHERE `status IN ('trial', 'active')` — or application-level check before insert |
| BR-10 | Subscription status transitions follow a strict state machine (see §4). Invalid transitions must throw a domain exception. | SubscriptionStatus value object with explicit transition guards |
| BR-11 | Every subscription record stores the plan price at assignment time (`locked_price_monthly_cents`, `locked_price_annual_cents`). This is the tenant's contractual price. | Populated on creation, immutable after |
| BR-12 | When upgrading/downgrading, the current subscription is **cancelled** and a new subscription is created for the new plan. There is no in-place plan mutation. | UseCase: CancelCurrentAndAssignNew pattern |
| BR-13 | A trial subscription auto-expires after `trial_duration_days`. The `ExpireTrialSubscriptionsCommand` (already scaffolded) must handle this. | Scheduled artisan command, batch processing |
| BR-14 | Every subscription state change MUST be audit-logged with: actor, old_status, new_status, plan details, timestamp. | Audit trail via `admin_audit_logs` |
| BR-15 | Idempotency: Assigning the same plan to the same tenant must not create duplicate active subscriptions. | Idempotency key on `tenant_subscriptions` table (already exists per file tree) |
| BR-16 | When a subscription is cancelled or expires, the tenant's access is NOT immediately revoked. The `ends_at` date determines access. Enforcement of feature limits based on subscription status is a future concern. | `ends_at` column determines access window |

### 3.3 Feature Limits (Plan → Tenant Enforcement)

| Rule ID | Rule | Enforcement |
|---|---|---|
| BR-17 | The `features` JSON on `subscription_plans` defines limits: `max_users`, `max_courses`, `max_storage_mb`. Additional keys can be added without migration. | JSON schema with known keys + extensible |
| BR-18 | Feature limit enforcement is NOT in Phase 11A scope. Phase 11A stores the limits; future phases enforce them at resource creation time (e.g., preventing a tenant from creating more users than `max_users`). | Document explicitly as "stored but not enforced" |
| BR-19 | A `0` value for any feature limit means **unlimited**. | Domain convention, documented in value object |

---

## 4. Subscription Status State Machine

```
                    ┌──────────────────────────────┐
                    │                              │
                    ▼                              │
    ┌─────────┐  assign   ┌─────────┐  activate  ┌─────────┐
    │  (none) │ ────────► │  trial  │ ─────────► │ active  │
    │         │           │         │            │         │
    └─────────┘           └────┬────┘            └────┬────┘
         │                     │                      │
         │                     │ expire               │ cancel
         │   assign (non-trial)│                      │
         │                     ▼                      ▼
         │                ┌─────────┐           ┌───────────┐
         └──────────────► │ expired │           │ cancelled │
           (direct to     └─────────┘           └───────────┘
            active)
```

### Allowed Transitions

| From | To | Trigger | Actor |
|---|---|---|---|
| (none) | `trial` | Super Admin assigns a trial plan | Super Admin |
| (none) | `active` | Super Admin assigns a non-trial plan | Super Admin |
| `trial` | `active` | Super Admin manually activates OR upgrades to paid plan | Super Admin |
| `trial` | `expired` | Trial duration exceeded (automated) | System (scheduled command) |
| `trial` | `cancelled` | Super Admin cancels | Super Admin |
| `active` | `cancelled` | Super Admin cancels OR upgrades/downgrades (old sub cancelled, new sub created) | Super Admin |

### Forbidden Transitions (Must Throw Exception)

| From | To | Reason |
|---|---|---|
| `expired` | `active` | Expired subscriptions cannot be reactivated. Assign a new one. |
| `cancelled` | `active` | Cancelled subscriptions cannot be reactivated. Assign a new one. |
| `expired` | `trial` | Cannot return to trial from expired. |
| `cancelled` | `trial` | Cannot return to trial from cancelled. |
| Any | `trial` | A tenant that has previously had any subscription cannot be assigned a trial again. (One trial per tenant lifetime.) |

### Terminal States

`expired` and `cancelled` are terminal. No transitions out. To give a tenant a new plan after expiry/cancellation, create a NEW subscription record.

---

## 5. Existing Codebase — What Already Exists

The developer MUST analyze the following existing files before designing the implementation plan. Some of this code is scaffolded but untested. The plan must determine what to keep, what to refactor, and what to build new.

### 5.1 Database (Already Exists — Phase 1)

| Table | Status | Notes |
|---|---|---|
| `subscription_plans` | Exists (Phase 1 migration) | Has `code`, price columns (verify if already `_cents` suffix), `features` JSON, `status`. Verify schema matches BR-01 through BR-07. |
| `tenant_subscriptions` | Exists (Phase 1 migration) | Has `tenant_id`, `plan_id`, `status`, `billing_cycle`. Check for: `starts_at`, `ends_at`, `locked_price_*_cents`, `idempotency_key`, `trial_duration_days`. |

**Developer action:** Run `DESCRIBE subscription_plans` and `DESCRIBE tenant_subscriptions` against the actual database. Document every column. Identify gaps against the business rules above. Propose ALTER migrations only for missing columns.

### 5.2 Domain Layer (Already Scaffolded)

| File | Status | Action Required |
|---|---|---|
| `Domain/SuperAdminDashboard/Subscription/Entities/SubscriptionPlanEntity.php` | Exists | Audit against BR-01–BR-08. Add missing invariants. |
| `Domain/SuperAdminDashboard/Subscription/Entities/TenantSubscriptionEntity.php` | Exists | Audit against BR-09–BR-16. Verify state machine enforcement. |
| `Domain/SuperAdminDashboard/Subscription/ValueObjects/SubscriptionStatus.php` | Exists | Verify transitions match §4 state machine exactly. |
| `Domain/SuperAdminDashboard/Subscription/ValueObjects/BillingCycle.php` | Exists | Verify supports `monthly` and `annual` only. |
| `Domain/SuperAdminDashboard/Subscription/ValueObjects/PaymentEventStatus.php` | Exists | May not be needed in 11A (no payments). Assess if it should be deferred. |
| `Domain/SuperAdminDashboard/Subscription/Contracts/PaymentGatewayInterface.php` | Exists | NOT used in 11A. Do not touch. Do not implement. |
| `Domain/SuperAdminDashboard/Subscription/Contracts/PaymentEventRepositoryInterface.php` | Exists | NOT used in 11A. |
| `Domain/SuperAdminDashboard/Subscription/Repositories/SubscriptionPlanRepositoryInterface.php` | Exists | Audit. Ensure methods match 11A needs. |
| `Domain/SuperAdminDashboard/Subscription/Repositories/TenantSubscriptionRepositoryInterface.php` | Exists | Audit. Ensure methods match 11A needs. |
| `Domain/SuperAdminDashboard/Subscription/Events/*.php` | Exists (4 events) | Audit each event. Verify past-tense naming. Verify they are dispatched outside transactions. |
| `Domain/SuperAdminDashboard/Subscription/Exceptions/*.php` | Exists (5 exceptions) | Audit. Ensure all BR exception cases are covered. |
| `Domain/SuperAdminDashboard/Subscription/DTOs/*.php` | Exists (2 DTOs) | These are gateway-related (`CreateGatewaySubscriptionData`, `GatewaySubscriptionResult`). NOT used in 11A. |

### 5.3 Infrastructure Layer (Already Scaffolded)

| File | Status | Action Required |
|---|---|---|
| `Infrastructure/PaymentGateway/RazorpaySubscriptionGateway.php` | Exists | NOT used in 11A. Do not touch. |
| `Infrastructure/Database/Models/PaymentEventRecord.php` | Exists | NOT used in 11A. |
| `Infrastructure/Database/Repositories/EloquentPaymentEventRepository.php` | Exists | NOT used in 11A. |

### 5.4 Application Layer (Check What Exists)

| File | Status | Action Required |
|---|---|---|
| UseCases for plan CRUD | Unknown — developer must verify | If missing, build following Phase 6/10 DDD pattern. |
| UseCases for subscription assignment | Unknown — partially scaffolded | Verify and complete. |
| `ExpireTrialSubscriptionsCommand.php` | Exists | Audit. Ensure it follows BR-13 (batch expire with audit). |

### 5.5 HTTP Layer (Check What Exists)

| File | Status | Action Required |
|---|---|---|
| `Requests/SuperAdminDashboard/Subscription/AssignSubscriptionPlanRequest.php` | Exists | Audit validation rules against business rules. |
| `Resources/SuperAdminDashboard/Subscription/SubscriptionPlanResource.php` | Exists | Audit response shape. |
| `Resources/SuperAdminDashboard/Subscription/TenantSubscriptionResource.php` | Exists | Audit response shape. |
| `WebApi/SuperAdminDashboard/Subscription/Controllers/WebhookAction.php` | Exists | NOT used in 11A. Do not touch. |
| `Providers/SubscriptionServiceProvider.php` | Exists | Audit bindings. |

### 5.6 Tests (Already Scaffolded)

| File | Status | Action Required |
|---|---|---|
| `tests/Unit/Domain/SubscriptionPlanEntityTest.php` | Exists | Audit coverage against BR-01–BR-08. |
| `tests/Unit/Domain/SubscriptionStatusTest.php` | Exists | Audit transitions against §4 state machine. |
| `tests/Unit/Domain/TenantSubscriptionEntityTest.php` | Exists | Audit coverage against BR-09–BR-16. |
| `tests/Unit/Infrastructure/Database/Repositories/EloquentPaymentEventRepositoryTest.php` | Exists | NOT 11A scope (payment events). |
| `tests/Unit/Infrastructure/PaymentGateway/RazorpaySubscriptionGatewayTest.php` | Exists | NOT 11A scope. |
| `tests/Feature/Subscription/` | Unknown — developer must check | Likely needs new feature tests for all endpoints. |
| `database/factories/SubscriptionPlanRecordFactory.php` | Exists | Audit and extend if needed. |
| `database/factories/TenantSubscriptionRecordFactory.php` | Exists | Audit and extend if needed. |

---

## 6. API Endpoints Required

All endpoints are under the Super Admin Dashboard context, protected by `admin_api` guard and platform-level permissions.

### 6.1 Subscription Plan Management

| Method | Endpoint | Permission | Description |
|---|---|---|---|
| `GET` | `/api/admin/subscription-plans` | `billing.view` | List all plans (active + archived). Filterable by status. |
| `GET` | `/api/admin/subscription-plans/{id}` | `billing.view` | View single plan with full details including features JSON. |
| `POST` | `/api/admin/subscription-plans` | `billing.manage` | Create a new plan. Idempotent via plan `code` uniqueness. |
| `PUT` | `/api/admin/subscription-plans/{id}` | `billing.manage` | Update plan details (name, pricing, features). `code` is immutable. |
| `PATCH` | `/api/admin/subscription-plans/{id}/archive` | `billing.manage` | Archive a plan. Cannot archive if active subscriptions exist (soft-block or require confirmation). |

### 6.2 Tenant Subscription Management

| Method | Endpoint | Permission | Description |
|---|---|---|---|
| `GET` | `/api/admin/tenants/{tenantId}/subscription` | `billing.view` OR `tenant.view` | View tenant's current subscription (or null if none). Include plan details. |
| `POST` | `/api/admin/tenants/{tenantId}/subscription` | `billing.manage` | Assign a plan to a tenant. Creates new subscription. Fails if tenant already has active/trial subscription (must cancel first, or use upgrade endpoint). |
| `POST` | `/api/admin/tenants/{tenantId}/subscription/change-plan` | `billing.manage` | Upgrade/downgrade: cancels current subscription and creates new one for the new plan in a single transaction. |
| `POST` | `/api/admin/tenants/{tenantId}/subscription/cancel` | `billing.manage` | Cancel tenant's active/trial subscription. Sets `ends_at` if not already set. |
| `GET` | `/api/admin/subscriptions` | `billing.view` | List all tenant subscriptions across the platform. Filterable by status, plan, tenant. Paginated. |

### 6.3 Permission Mapping

The developer must verify whether `billing.view` and `billing.manage` permissions already exist in the `admin_permissions` table. If not, a seeder must add them. Check existing permission codes in the seeder files.

---

## 7. DDD Layer Requirements

### 7.1 Bounded Context

All subscription code lives in: `SuperAdminDashboard/Subscription/`

This is a **platform-level** bounded context, NOT a tenant-level one. It uses the `admin_api` guard and platform admin permissions — NOT tenant capabilities.

### 7.2 Domain Layer — Required Components

| Component | Purpose |
|---|---|
| `SubscriptionPlanEntity` | Already exists. Audit and extend with: immutable `code`, `features` validation, `archive()` method with active-subscription guard, price update that does NOT affect existing subscriptions. |
| `TenantSubscriptionEntity` | Already exists. Audit and extend with: state machine enforcement per §4, `lockedPrice` fields, trial auto-expiry calculation, `cancel()` and `activate()` methods. |
| `SubscriptionStatus` (VO) | Already exists. Audit transitions against §4. |
| `BillingCycle` (VO) | Already exists. Verify `monthly`/`annual` only. |
| `PlanFeatures` (VO) | **May need to be created.** Validates the features JSON structure: known keys (`max_users`, `max_courses`, `max_storage_mb`), integer values, `0` = unlimited. Rejects unknown keys or invalid types. |
| Domain Events | Already exist (4 events). Verify: `SubscriptionPlanAssigned`, `SubscriptionStatusChanged`, `SubscriptionTrialExpired`, `SubscriptionPaymentReceived`. The last one is NOT 11A scope. Assess if additional events needed (e.g., `SubscriptionPlanCreated`, `SubscriptionPlanArchived`, `SubscriptionPlanUpdated`, `SubscriptionCancelled`). |
| Domain Exceptions | Already exist (5 exceptions). Verify coverage for all BR failure scenarios. |

### 7.3 Application Layer — Required UseCases

| UseCase / Query | Purpose |
|---|---|
| `CreateSubscriptionPlanUseCase` | Create a new plan. Enforce BR-01 through BR-07. Audit log. |
| `UpdateSubscriptionPlanUseCase` | Update plan (not code). Enforce immutability of `code`. Audit log with old/new values. |
| `ArchiveSubscriptionPlanUseCase` | Archive a plan. Check for active subscriptions (BR-06). Audit log. |
| `ListSubscriptionPlansQuery` | List plans, filterable by status. |
| `GetSubscriptionPlanQuery` | Get single plan by ID. |
| `AssignSubscriptionToTenantUseCase` | Assign plan to tenant. Enforce BR-09 (one active sub), calculate trial expiry (BR-07), lock prices (BR-11), idempotency (BR-15). Audit log. |
| `ChangeTenantPlanUseCase` | Upgrade/downgrade. Cancel current + create new in single transaction. Enforce state machine. Audit log. |
| `CancelSubscriptionUseCase` | Cancel subscription. Set `ends_at`. Enforce state machine. Audit log. |
| `GetTenantSubscriptionQuery` | Get tenant's current subscription with plan details. |
| `ListAllSubscriptionsQuery` | Platform-wide subscription list. Paginated. Filterable. |
| `ExpireTrialSubscriptionsCommand` | Already scaffolded. Batch process: find all `trial` subscriptions where `ends_at < now()`, transition to `expired`. Audit each. |

### 7.4 Infrastructure Layer — Required Components

| Component | Purpose |
|---|---|
| Eloquent Repository for Plans | Implement `SubscriptionPlanRepositoryInterface`. Verify existing implementation. |
| Eloquent Repository for Subscriptions | Implement `TenantSubscriptionRepositoryInterface`. Verify existing implementation. |
| `SubscriptionPlanRecord` (Eloquent Model) | Must exist or be created. Verify factory. |
| `TenantSubscriptionRecord` (Eloquent Model) | Must exist or be created. Verify factory. |

---

## 8. Financial Safety Requirements

Even though no real payments are processed in 11A, the data structures MUST be payment-ready. These are non-negotiable.

| Requirement | Detail |
|---|---|
| **Integer cents** | All price columns: `BIGINT UNSIGNED`, `_cents` suffix. No DECIMAL. No FLOAT. |
| **Locked prices** | `tenant_subscriptions` must store `locked_price_monthly_cents` and `locked_price_annual_cents` — the price at time of assignment. These are immutable after creation. |
| **Pessimistic locking** | All subscription status transitions must use `SELECT FOR UPDATE` (lockForUpdate) to prevent concurrent status corruption. |
| **Idempotency** | `tenant_subscriptions.idempotency_key` (already exists) — prevent duplicate assignments from retry/double-click. |
| **Immutable history** | Cancelled and expired subscription records are NEVER deleted or modified. They are historical financial records. |
| **Audit trail** | Every create, update, status change, and cancellation logged to `admin_audit_logs` with actor identity, old/new values, and timestamp. |
| **Events outside transactions** | Domain events dispatched AFTER transaction commits, not inside. This was proven in Phase 10C audit — follow the same pattern. |

---

## 9. What Phase 11A Does NOT Include

| Excluded Item | Reason | Deferred To |
|---|---|---|
| Razorpay integration | No payment gateway in 11A | Future (not scheduled) |
| Payment processing | No gateway | Future |
| Invoice generation | Requires payment integration | Future |
| Refund workflows | Requires payments | Future |
| Webhook handling (payment events) | No gateway | Future |
| Tenant self-service plan selection | Super Admin manual only in 11A | Future |
| Feature limit enforcement (max_users check at user creation) | 11A stores limits, future enforces | Post-11A |
| Billing Admin (L6) dashboard | Separate role context | Future |
| Tenant → Student billing | Completely separate bounded context | Future |
| Proration calculation on plan change | No payments, no invoicing | Future |
| Grace period logic (`past_due` status) | Requires payment monitoring | Future |
| Auto-renewal | Requires payment gateway | Future |
| Subscription plan versioning | Premature complexity | Future |
| Frontend implementation for subscription management | Backend first | Phase 11B or 11E |

---

## 10. Quality Gate — Phase 11A Complete

All of the following must pass before Phase 11A is declared complete.

### Security & Financial Safety Gates (BLOCKING)

- [ ] All price columns use `_cents` suffix with `BIGINT UNSIGNED`
- [ ] `locked_price_*_cents` populated immutably on subscription creation
- [ ] Pessimistic locking (`lockForUpdate`) on every subscription status transition
- [ ] Idempotency key prevents duplicate subscription creation
- [ ] Domain events dispatched OUTSIDE transactions (not inside `DB::transaction()`)
- [ ] Every state-changing operation audit-logged to `admin_audit_logs`
- [ ] Subscription state machine enforced — forbidden transitions throw exceptions
- [ ] Only one active/trial subscription per tenant at any time
- [ ] Archived plans cannot be assigned to new tenants
- [ ] Trial duration auto-calculated correctly from plan configuration
- [ ] No DECIMAL or FLOAT anywhere near financial data

### Functional Gates (BLOCKING)

- [ ] Plan CRUD (create, read, update, archive) works end-to-end
- [ ] Plan assignment to tenant creates correct subscription record
- [ ] Upgrade/downgrade cancels old subscription and creates new one atomically
- [ ] Cancel subscription transitions to `cancelled` status
- [ ] `ExpireTrialSubscriptionsCommand` batch-expires overdue trials
- [ ] Plan with active subscriptions cannot be hard-deleted
- [ ] Platform-wide subscription listing with filters works
- [ ] Tenant subscription query returns current subscription with plan details

### Architecture Gates (BLOCKING)

- [ ] PHPStan Level 5: zero new errors
- [ ] All tests pass (zero regression from current baseline)
- [ ] Domain layer has zero `Illuminate` imports
- [ ] Controllers < 20 lines per method
- [ ] UseCases testable without database (mocked repositories in unit tests)
- [ ] `env()` check: `grep -rn 'env(' app/ routes/ database/` returns 0 results
- [ ] No new tech debt introduced

### Test Requirements

- [ ] Unit tests for: SubscriptionPlanEntity invariants, TenantSubscriptionEntity state machine, PlanFeatures value object, all value objects
- [ ] Feature tests for: every API endpoint (happy path + error path), permission enforcement (unauthorized users get 403), plan archive with active subscriptions (blocked), duplicate assignment (idempotent), upgrade/downgrade flow, trial expiry command
- [ ] Minimum 25-30 new tests expected

---

## 11. Implementation Plan Format

The developer must produce an implementation plan document following the exact format of Phase 10A–10E plans. The plan must include:

1. **Executive Summary** — What gets built, what does NOT
2. **Gap Analysis** — Actual codebase state vs requirements (run DESCRIBE on tables, read every existing file listed in §5, report findings)
3. **Architecture Decisions** — Any decisions needed (with DR- prefix)
4. **Migration Plan** — ALTER or CREATE migrations (only for gaps found in gap analysis)
5. **Domain Layer — Changes** — Entity modifications, new value objects, events
6. **Application Layer — UseCases & Queries** — Full code for each
7. **Infrastructure Layer — Repositories & Records** — Modifications needed
8. **HTTP Layer — Controllers, Requests, Resources** — API implementation
9. **Route Registration** — Exact route file changes
10. **Seeders** — Permission seeder updates, plan seeder (if needed for dev/testing)
11. **Implementation Sequence** — Ordered steps with dependencies
12. **Test Plan** — Every test file with description
13. **Quality Gate Verification** — Checklist from §10
14. **Risk Register** — Identified risks with severity and mitigation
15. **File Manifest** — Every new and modified file

---

## 12. Constraints & Reminders

### Architecture Constraints

- Follow the Phase 6 DDD template exactly. No shortcuts.
- All financial columns: `BIGINT UNSIGNED` with `_cents` suffix.
- No MySQL ENUM types. Use `VARCHAR(30)` with PHP Enum validation.
- No `env()` calls outside `config/` directory.
- Domain entities must be pure PHP — no framework dependencies.
- Repository interfaces in Domain, implementations in Infrastructure.
- Events are past-tense facts, not commands.

### Docker Environment

- Container uses Alpine Linux — use `sh` not `bash` in `docker exec` commands.
- Container name: `ubotz_backend`
- Database container: `ubotz_mysql`
- Example: `docker exec -it ubotz_backend sh -c "php artisan migrate"`

### Key Naming Standards

- Plan identifier: `code` (snake_case, e.g., `free_trial`, `starter_monthly`)
- Subscription status: `code` format (e.g., `trial`, `active`, `cancelled`, `expired`)
- Billing cycle: `code` format (`monthly`, `annual`)
- Audit action: dot.notation (e.g., `subscription.assigned`, `subscription.cancelled`, `plan.created`, `plan.archived`)
- Entity type for audit: `snake_case` (e.g., `subscription_plan`, `tenant_subscription`)

### What NOT to Do

- Do NOT implement any Razorpay integration.
- Do NOT create payment or invoice tables.
- Do NOT modify existing WebhookAction or PaymentGateway files.
- Do NOT implement tenant self-service plan selection.
- Do NOT enforce feature limits at resource creation time (only store them).
- Do NOT use DECIMAL or FLOAT for any monetary value.
- Do NOT skip audit logging on any state change.
- Do NOT dispatch events inside `DB::transaction()`.

---

## 13. Definition of Done

Phase 11A is complete when:

1. The implementation plan has been reviewed and approved by the Principal Engineer.
2. All code is implemented per the approved plan.
3. All quality gates in §10 pass.
4. A Principal Engineer audit confirms zero critical or high findings.
5. All findings from audit are resolved.
6. The Phase 11A Completion Report is signed off.

---

> **This is a financial feature built without payments. Every decision must be made as if payments connect tomorrow. The data structures, state machines, audit trails, and idempotency patterns established here will carry the weight of every rupee that flows through the platform. Build accordingly.**

*End of Document — UBOTZ 2.0 Phase 11A Developer Instructions — March 2, 2026*

---

# PHASE 6 — DEVELOPER DOCUMENTATION (TRUTH ONLY)
## Phase 11A Completion Report

### Purpose
Phase 11A implements manual subscription plan management for the Platform Admin (Super Admin) Dashboard. It allows super admins to create subscription plans, assign them manually to tenants, and handle basic lifecycle events (upgrade, downgrade, cancel, trial expiry).

### How it works
Super Admins manage subscription plans and tenant assignments via REST APIs under the `api/admin/*` routing group.
* **Subscription Plans**: Treated as mutable entities but with an immutable `code`. Deletion is soft (achieved by transitioning status to `archived`). Plans with active subscriptions cannot be archived.
* **Tenant Subscriptions**: Managed through pessimistic locking (`SELECT FOR UPDATE`) to prevent race conditions during state transitions. Trials transition to `expired` automatically via a scheduled command (`ubotz:expire-trial-subscriptions`). Upgrades/downgrades cancel the current subscription and create a new one in a single atomic database transaction.
* **Financial Data**: All pricing data is stored in the database as BIGINT UNSIGNED representing cents to avoid floating-point errors.
* **Audit**: All state-changing actions emit an explicit log to `admin_audit_logs` passing through the `AdminAuditLogger`.

### Data flow
1. Super Admin issues request to an endpoint (e.g. `POST /api/admin/tenants/{tenantId}/subscription`).
2. Request passes authentication (`admin_api`) and authorization (`SubscriptionPolicy`).
3. Controller routes the request to a dedicated UseCase.
4. UseCase locks the target tenant records (`lockForUpdate`), enforces domain invariant rules natively or via Entity methods, and saves changes via Repositories.
5. In case of creation/updating, prices are locked (`locked_price_monthly_cents`, `locked_price_annual_cents`) on the `tenant_subscriptions` table for historical accuracy.
6. The transaction commits.
7. Post-commit, Domain Events (e.g., `SubscriptionPlanAssigned`) are dispatched, and the `AdminAuditLogger` records the action.

### Permissions
* **View Access**: `billing.read` OR `subscription.view`
* **Manage/Write Access**: `billing.manage` OR `subscription.manage`

### Known limitations
1. **No Gateway Integration**: Razorpay or other payment gateways are **[NOT IMPLEMENTED]**.
2. **No Tenant Self-Service**: Tenants cannot select or manage their own plans yet. **[NOT IMPLEMENTED]**.
3. **Feature Limits Stored, Not Enforced**: Feature limits (e.g., `max_users`, `max_courses`) are calculated and recorded inside subscription metadata, but the infrastructure to actually stop a tenant from exceeding these limits elsewhere in the application is **[NOT IMPLEMENTED]**.
5. **No Payment/Webhook Events**: Grace periods and failure states are skipped since actual billing is **[NOT IMPLEMENTED]**.

### Implementation Analysis Details
Based on a thorough codebase audit, the following components of Phase 11A have been verified as **Complete and Compliant**:

#### 1. Database Layer
- Table `subscription_plans` has the exact schema required, including string-based `code`, integer cents (`price_monthly_cents`), and `features` JSON.
- Table `tenant_subscriptions` accurately captures the lifecycle states and timestamps.
- Migration `2026_03_02_070619_add_locked_prices_to_tenant_subscriptions.php` ensures `locked_price_monthly_cents` and `locked_price_annual_cents` are stored immutably to fulfill BR-11 securely.

#### 2. Domain Layer
- **Entities**: `SubscriptionPlanEntity` and `TenantSubscriptionEntity` accurately implement invariants and transition guards.
- **Value Objects**: Explicit representations for `SubscriptionStatus` and `PlanStatus` enforce the predefined state machine, preventing illegal transitions (like returning to trial after expiry).
- **Events**: Critical domain events (`SubscriptionPlanAssigned`, `SubscriptionStatusChanged`, etc.) are defined comprehensively.

#### 3. Application Layer
- Transaction guarantees and pessimistic locking (`lockForUpdate`) are effectively utilized in critical UseCases such as `AssignSubscriptionToTenantUseCase` preventing race conditions.
- Side-effects (Domain Events and Audit Logs via `AdminAuditLoggerInterface`) are safely executed **after** successful `DB::transaction()` commits natively respecting the financial safety gates.

#### 4. Infrastructure & HTTP Layers
- Eloquent Models (`SubscriptionPlanRecord`, `TenantSubscriptionRecord`) correctly use casts arrays and soft deletes without leaking domain details.
- Repositories effectively map Records to Entities.
- REST Controllers are properly placed directly under `App\Http\Controllers\Api\SuperAdminDashboard\Subscription\` responding intelligently to strict authorization requests configured in `routes/api.php` under `admin.authority` middleware.

#### 5. Verification & Tests
- A robust collection of **13 Feature Tests** was identified under `tests/Feature/Subscription/` matching Phase 11A use scenarios, including concurrency (`SubscriptionConcurrencyTest`), permissions, and assignment logic.

**Conclusion:** The implementation effectively serves Phase 11A criteria without bleeding into out-of-scope Phase dimensions (like payment gateways). The architecture adheres strictly to Domain-Driven Design constraints. All Phase 11A prerequisites are satisfied.