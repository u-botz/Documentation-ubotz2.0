# UBOTZ 2.0 — Feature Status Report: Subscription

> **Instructions:** Copy this template for each feature. Fill every section honestly. If something is missing, write "NOT IMPLEMENTED" — do not skip the section. This document feeds directly into the Principal Engineer audit pipeline.

| Field | Value |
|---|---|
| **Feature Name** | Subscription (Platform B2B & Tenant B2C) |
| **Bounded Context** | SuperAdminDashboard & TenantAdminDashboard |
| **Date Reported** | 2026-03-20 |
| **Reported By** | AI Agent |
| **Current Status** | Working |
| **Has Developer Instructions Doc?** | No |
| **Has Implementation Plan?** | No |
| **Was Principal Engineer Audit Done?** | No |

---

## 1. What This Feature Does (2–3 sentences)

The Subscription feature manages a dual-layered billing ecosystem. At the Platform level (B2B), it dictates what features, storage, and user quotas a Tenant is allowed to use based on their tier. At the Tenant level (B2C), it allows Tenant Administrators to create their own custom subscription plans (based on days & usage counts) and enroll or sell them to their Students. 

---

## 2. Backend Architecture

Because of the dual nature, the architecture is heavily segregated into two distinct namespaces.

### 2.1 Controllers

| Controller | Methods | Notes |
|---|---|---|
| **[SuperAdmin Level]** |
| `SubscriptionPlanWriteController` | `store`, `update`, `submit`, `archive`, `approve` | Governs the global SaaS catalog. |
| `TenantSubscriptionWriteController`| `assign`, `changePlan`, `cancel` | Manages a tenant's billing state. |
| `SubscriptionOverrideController` | `extend`, `reactivate` | Platform admin manual overrides. |
| **[Tenant Level]** |
| `SubscriptionPlanWriteController` | `store`, `update`, `destroy` | Tenant creates plans for students. |
| `EnrollSubscriptionPlanController`| `__invoke` | Students self-enrolling. |
| `AdminSubscriptionWriteController`| `store`, `destroy` | Admin forcefully assigning a plan to a user. |

### 2.2 UseCases / Queries

| UseCase / Query | Purpose | Injects Audit Logger? | Injects Quota Service? |
|---|---|---|---|
| `EloquentListSubscriptionPlansQuery` | CQRS display of plans | N/A | N/A |
| `EloquentGetActiveSubscriptionQuery` | Locates current billing tier | N/A | N/A |
| `EloquentSubscriptionAccessQuery` | Acts as a gatekeeper for courses | N/A | N/A |

### 2.3 Domain Layer

| Component | Type | Location | Notes |
|---|---|---|---|
| `SubscriptionPlanProps` | Value Object| `Domain.../Subscription` | |
| `SubscriptionStatus` | Value Object| `Domain.../Subscription` | Validates active, past-due, expired states. |
| `SubscriptionPolicy` | Policy | `app/Policies/SuperAdminDashboard/`| Extensive RBAC gating for Platform actions. |

### 2.4 Domain Events

| Event Class | Trigger | Has Listener? |
|---|---|---|
| *Not Investigated Fully*| | Primarily utilizes Console/Cron jobs for state transfers. |

### 2.5 Infrastructure Layer

| Component | Type | Notes |
|---|---|---|
| `TenantSubscriptionPlanRecord` | Eloquent Model | Hits Tenant DB (B2C catalog) |
| `TenantSubscriptionEnrollmentRecord`| Eloquent Model | Hits Tenant DB (Student map) |
| `SubscriptionPlanRecord` | Eloquent Model | Hits Central DB (B2B catalog) |
| `TenantSubscriptionRecord` | Eloquent Model | Hits Central DB (Tenant map) |

### 2.6 Exceptions

| Exception Class | When Thrown |
|---|---|
| *Not Implemented/Found*| Rely heavily on strict policies and validation boundaries. |

---

## 3. Database Schema

### 3.1 Tables

**Table: `subscription_plans` [CENTRAL DB]** (Migration: `2026_02_17_214822_create_subscription_plans_table.php`)
- **Purpose**: Platform Landlord defining B2B tiers.
- **Columns**: `code`, `name`, `price_monthly`, `price_annual`, `currency`, `max_users`, `max_courses`, `max_storage_bytes`, `features` (JSON).
- **Soft Deletes**: **Yes** (`$table->softDeletes()`)

**Table: `tenant_subscriptions` [CENTRAL DB]**
- **Purpose**: Maps the `tenant_id` to the `subscription_plan_id`.

**Table: `tenant_subscription_plans` [TENANT DB]** (Migration: `2026_03_09_045728_create_tenant_subscription_plans_table.php`)
- **Purpose**: Custom B2C plans created by the Tenant.
- **Columns**: `id`, `tenant_id`, `title`, `days`, `usable_count`, `infinite_use`, `price_cents`, `status`.
- **Soft Deletes**: **No**

**Table: `tenant_subscription_enrollments` [TENANT DB]**
- **Purpose**: Maps the `user_id` to the `tenant_subscription_plan_id`.
- **Columns**: `user_id`, `plan_id`, `sale_id`, `installment_order_id`, `purchased_at`, `expires_at`.
- **Soft Deletes**: **No**

### 3.2 Relationships

- `tenant_subscription_enrollments` maps backwards heavily into the `sales` and `installment_orders` tables depending on how the plan was purchased.

---

## 4. API Endpoints

*(Tenant B2C Routes found in `routes/tenant_dashboard/subscription.php` and `users.php`)*
- `GET /api/tenant/subscription-plans`
- `POST /api/tenant/subscription-plans/enroll` (Capability: `subscription.enroll`)
- `POST /api/tenant/subscription-plans` (Capability: `subscription.manage`)
- `POST /api/tenant/users/{id}/subscriptions`

*(Platform B2B Routes found in `routes/api.php`)*
- `GET /api/development/subscriptions`
- `POST /api/development/subscription-plans/{id}/approve`
- `POST /api/development/tenants/{tenantId}/subscription` (Assign B2B plan)
- `POST /api/development/tenants/{tenantId}/subscription/retry-payment`
- `POST /api/development/subscriptions/{id}/extend`

---

## 5. Security Checklist

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | All queries scoped by `tenant_id`? | Yes | Done perfectly across the database split. |
| 2 | User-level isolation enforced where needed? | Yes | |
| 3 | `tenant.capability` middleware on all routes? | Yes | `subscription.manage` and `subscription.enroll` applied on tenant APIs. |
| 4 | Audit log written for every mutation? | TBD | |
| 5 | Audit log written OUTSIDE `DB::transaction()`? | TBD | |
| 6 | Domain events dispatched via `DB::afterCommit`? | TBD | |
| 7 | Idempotency keys used for create operations? | TBD | Subscriptions usually rely on webhook keys from Stripe/Razorpay. |
| 8 | Input validation via FormRequest? | Yes | |
| 9 | File uploads validated? | N/A | |
| 10 | Financial values stored as `_cents` integer? | **Yes** | `price_cents`, `price_monthly` all heavily integer based. |
| 11 | Soft deletes used? | Mixed | Yes in the Platform DB. No in the Tenant DB. |
| 12 | No raw SQL in controllers or UseCases? | Yes | |
| 13 | Eloquent models have `BelongsToTenant` trait/scope? | Yes | For B2C models. |

---

## 6. Frontend

N/A

---

## 7. Tests

| Test File | Test Count | Passing? |
|---|---|---|
| `CheckOverageResolutionCommandTest.php`| Multiple | Yes |
| `EnforceOverageDeactivationCommandTest.php`| Multiple | Yes |

*Note: The platform is heavily reliant on Cron-driven console commands (`Schedule::command('subscription:expire-trials')->daily();`) to enforce state changes over time, and the unit tests reflect this.*

---

## 8. Known Issues & Gaps

| # | Issue | Severity Guess | Notes |
|---|---|---|---|
| 1 | No Soft Deletes in Tenant Subscriptions | Medium | If an admin deletes a `tenant_subscription_plans` row, any active `tenant_subscription_enrollments` tied to it will likely vanish due to DB cascades, meaning students will silently lose access they paid for without any recovery state. |

---

## 9. Dependencies on Other Features

| Depends On | How |
|---|---|
| Core System Quotas | B2B subscriptions govern literal system architecture boundaries (e.g., `max_users`, `max_storage_bytes`). |
| Installment / Sales | Enrollments can be granted as a result of a completed Sale or Installment Order. |

---

## 10. File Tree (Backend Only)

```
app/
├── Http/Controllers/Api/SuperAdminDashboard/Subscription/
│   ├── SubscriptionPlanWriteController.php
│   └── TenantSubscriptionWriteController.php
├── Http/Controllers/Api/TenantAdminDashboard/Subscription/
│   ├── SubscriptionPlanWriteController.php
│   └── AdminSubscriptionWriteController.php
├── Infrastructure/Persistence/SuperAdminDashboard/Subscription/
│   ├── SubscriptionPlanRecord.php
│   └── TenantSubscriptionRecord.php
├── Infrastructure/Persistence/TenantAdminDashboard/Subscription/
│   ├── Models/
│   │   ├── TenantSubscriptionPlanRecord.php
│   │   └── TenantSubscriptionEnrollmentRecord.php
│   └── Repositories/
└── routes/
    ├── api.php
    └── tenant_dashboard/subscription.php
```

---

> **Reminder:** This report is input for the Principal Engineer audit. Incomplete or inaccurate information here means the audit will miss real issues or flag false positives. When in doubt, check the actual code — do not guess.

*End of Template*
