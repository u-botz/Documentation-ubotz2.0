# UBOTZ 2.0 — Subscription (tenant LMS plans) — Technical Specification

## Scope

This feature is **tenant-scoped subscription plans** used to **sell or grant time-bound access** to students inside an institution (e.g. bundled days/uses). It is **not** the same as **UBOTZ platform billing** (the landlord’s subscription for the tenant organization), which lives under `/api/platform/...` and central platform tables.

## Route entry point

| File | Prefix |
|------|--------|
| `backend/routes/tenant_dashboard/subscription.php` | `/api/tenant/subscription-plans` |

| Method | Path | Capability |
|--------|------|------------|
| GET | `/subscription-plans` | `subscription.view` |
| GET | `/subscription-plans/{planId}` | `subscription.view` |
| POST | `/subscription-plans` | `subscription.manage` |
| PUT | `/subscription-plans/{planId}` | `subscription.manage` |
| DELETE | `/subscription-plans/{planId}` | `subscription.manage` |
| POST | `/subscription-plans/enroll` | `subscription.manage` **and** `subscription.enroll` |

Controllers: `SubscriptionPlanReadController`, `SubscriptionPlanWriteController`, invokable `EnrollSubscriptionPlanController` → `ActivateSubscriptionUseCase` with `ActivateSubscriptionCommand` (`user_id`, `plan_id`).

**Read vs write:** Listing and showing plans require **`subscription.view`** only. Creating, updating, deleting plans requires **`subscription.manage`**. Custom roles that have **`subscription.manage`** without **`subscription.view`** will not pass GET routes — grant both when assigning catalog editors.

## Persistence (tenant)

`backend/database/migrations/tenant/2026_03_09_045728_create_tenant_subscription_plans_table.php` → **`tenant_subscription_plans`**:

- `tenant_id`, `title`, `description`, `days`, `usable_count`, `infinite_use`, `price_cents`, `status`, timestamps

Enrollment storage is handled by subscription domain repositories used from `ActivateSubscriptionUseCase` (trace implementation for exact enrollment table names).

## Platform vs tenant (disambiguation)

| Concern | Where |
|---------|--------|
| Institution **pays UBOTZ** | Platform APIs, `subscription_plans` / tenant billing in **central** context — see `PLATFORM_*` in `api-endpoints.ts` |
| Institution **sells a plan to its students** | This document — **`tenant_subscription_plans`** under `/api/tenant/subscription-plans` |

## Frontend

Per-user grant/revoke helpers may appear under **user** APIs (e.g. `TENANT_USER.GRANT_SUBSCRIPTION` in `api-endpoints.ts`); that is a different surface from CRUD on `subscription-plans`.

## Document history

- **2026-03-31:** Split GET plan routes to `subscription.view`; writes remain `subscription.manage`.

---

## Linked references

- **Users** — enrollment targets
- **Payment** — student-side settlement when a plan has a price
