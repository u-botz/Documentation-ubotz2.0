# UBOTZ 2.0 — Reward — Technical Specification

## Scope

Per-tenant **reward configuration** (points per event type) and an append-only **ledger** of point movements. Optional domain events when points are awarded. Routes: `backend/routes/tenant_dashboard/reward.php`.

## Module

- **`tenant.module:module.rewards`** gates the entire file.

**Capabilities:** The route file does **not** attach `tenant.capability:*`; only authenticated tenant context and module entitlement apply. Tighten with policies if product requires admin-only config.

## HTTP map (base `/api/tenant`)

| Method | Path | Controller |
|--------|------|--------------|
| GET | `/rewards/configs` | `RewardConfigController::index` |
| PUT | `/rewards/configs/{type}` | `RewardConfigController::update` — `{type}` is the reward type string |
| GET | `/rewards/history` | `RewardLedgerController::index` — current user’s ledger |
| GET | `/rewards/balance` | `RewardLedgerController::balance` — aggregated balance |

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

No dedicated block in `api-endpoints.ts` at the time of writing; use the paths above or add constants alongside other tenant features.

---

## Linked references

- **Quiz** — common source events for awarding points (callers invoke `AwardRewardPointsUseCase` where integrated)
