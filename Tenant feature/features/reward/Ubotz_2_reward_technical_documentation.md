# UBOTZ 2.0 — Reward — Technical Specification

## Scope

Per-tenant **reward configuration** (points per event type) and an append-only **ledger** of point movements. Optional domain events when points are awarded. Routes: `backend/routes/tenant_dashboard/reward.php`.

## Module and capabilities

- **`tenant.module:module.rewards`** gates the entire file (subscription entitlement).
- **`tenant.capability:reward.view`** — `GET /rewards/configs` (read reward type configuration).
- **`tenant.capability:reward.manage`** — `PUT /rewards/configs/{type}` (update configuration).
- **Ledger self-service** — `GET /rewards/history` and `GET /rewards/balance` use **module gate only**; responses are scoped to the authenticated user in the controller. Students receive `reward.view` on the default student role so they can read configs where needed; ledger routes do not add an extra capability middleware by design.

Capabilities are seeded in `TenantCapabilitySeeder` / migration `2026_03_31_000001_seed_store_and_reward_capabilities.php` and mapped in `TenantRoleCapabilitySeeder`.

## HTTP map (base `/api/tenant`)

| Method | Path | Controller | Capability |
|--------|------|--------------|------------|
| GET | `/rewards/configs` | `RewardConfigController::index` | `reward.view` |
| PUT | `/rewards/configs/{type}` | `RewardConfigController::update` — `{type}` is the reward type string | `reward.manage` |
| GET | `/rewards/history` | `RewardLedgerController::index` — current user’s ledger | (module only) |
| GET | `/rewards/balance` | `RewardLedgerController::balance` — aggregated balance | (module only) |

`RewardConfigController` resolves `tenant_id` from `X-Tenant-Id` header or `auth('tenant_api')->user()->tenant_id`.

## Application layer

| Component | Role |
|-----------|------|
| `AwardRewardPointsUseCase` | Loads config by `RewardType`, skips inactive/zero; **idempotent** per `(tenant, user, source_type, source_id)`; persists `RewardLedgerEntity`; dispatches `RewardPointsAwarded` |
| `RewardConfigRepositoryInterface` / `RewardLedgerRepositoryInterface` | Persistence |

## Persistence (tenant)

`backend/database/migrations/tenant/2026_03_17_110009_create_reward_tables.php`

| Table | Notes |
|-------|--------|
| `reward_configs` | `tenant_id`, `type`, `points`, `is_active`; **unique** `(tenant_id, type)` |
| `reward_ledger` | `tenant_id`, `user_id`, signed `points`, `source_type`, `source_id`, `description`, `created_at`; indexes on `(tenant_id, user_id)` and `(source_type, source_id)` |

Balance is derived from ledger sums (see `getBalance` in repository).

## Frontend

- **`API_ENDPOINTS.TENANT_REWARD`** in [`frontend/config/api-endpoints.ts`](../../../../frontend/config/api-endpoints.ts) (`configs`, `history`, `balance`).
- [`frontend/services/tenant-reward-service.ts`](../../../../frontend/services/tenant-reward-service.ts) — thin wrappers for config and ledger calls.

---

## Linked references

- **Quiz** — common source events for awarding points (callers invoke `AwardRewardPointsUseCase` where integrated)

## Document history

- **2026-03-30:** Centralized frontend API paths (`TENANT_REWARD`) and `tenant-reward-service.ts`.
- **2026-03-31:** Documented `reward.view` / `reward.manage` on config routes; ledger remains module-only.
