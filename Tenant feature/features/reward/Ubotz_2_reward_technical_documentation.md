# UBOTZ 2.0 Reward System Technical Specification

## Core Architecture
The Reward module handles event-driven point allocation (`TenantAdminDashboard\Reward`). It utilizes a ledger-based "Double Entry" design for data integrity.

## Relational Schema Constraints

### 1. Configuration (`reward_configs`)
- **`tenant_id`**: isolation key.
- **`type`**: The event category (e.g., `quiz_completion`).
- **`unique(['tenant_id', 'type'])`**: Prevents duplicate point-allocation rules for the same event category.

### 2. Ledger Tracking (`reward_ledger`)
- **`points`**: Integer value (can be negative for redemptions or claw-backs).
- **`source_type` / `source_id`**: Polymorphic relationship pointers to the event that triggered the reward.
- **Indices**: `idx_reward_ledger_tenant_user` optimizes the calculation of the student's current total balance.

## Key Technical Workflows

### The Reward Listener
1. A Domain Event (e.g., `QuizCompletedEvent`) is fired.
2. The `AllocatePointsListener` checks if any `reward_configs` exist for the given `type`.
3. If active, it calculates the points and creates an entry in `reward_ledger`.

### Balance Calculation
Instead of storing a `total_points` column on the `users` table (which is prone to desynchronization), the system computes balances on-demand or uses a materialized cache derived from the `reward_ledger` totals.

## Tenancy & Security
The `reward_ledger` is strictly siloed. `fk_reward_ledger_tenants` ensures that points cannot be "Injected" into one tenant from another's dashboard events. Deleting a tenant (`onDelete: cascade`) wipes all associated ledger history.

---

## Linked References
- Related Modules: `Quiz`, `User`.
