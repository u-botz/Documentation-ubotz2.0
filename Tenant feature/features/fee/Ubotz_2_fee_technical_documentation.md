# UBOTZ 2.0 Fee Technical Specification

## Core Architecture
The Fee module is part of the `G2 Student Billing` upgrade. It handles the logic for calculating student dues, applying concessions, and managing late fee penalties.

## Relational Schema Constraints

### 1. Concessions & Adjustments
- **`fee_concessions`**: Stores the root discount entity applied to a student.
- **`concession_types`**: Lookup table for categorizing discounts.
- **`fee_concession_step_adjustments`**: Technical bridge used to apply portions of a total concession to individual installment steps.

### 2. Late Fee Management
- **`late_fee_charges`**: Records the actual penalty instances applied to overdue orders.
- **`installment_plans` (late fee config)**: Migrations add `late_fee_amount_cents` and `late_fee_grace_days` to the plan configuration.

## Key Technical Workflows

### Concession Application Logic
When a concession is granted, the system must redistribute the remaining balance across existing or future `student_orders`. This is orchestrated via the `CalculateFeeConcessionUseCase`.

### Late Fee Calculation
Triggered via the `ApplyLateFeesJob` (scheduled task).
1. Identify `student_orders` with status `pending_payment` where `due_at` + `grace_days` < `now()`.
2. Generate a `late_fee_charges` record.
3. Update the `student_order` total amount or generate a sub-order depending on the tenant's configuration.

## Tenancy & Security
- **Branch Binding**: Migrations (`2026_03_26_200003_backfill_branch_id_on_fee_tables.php`) backfill `branch_id` to all fee tables. This allows for localized financial reporting at the branch level.
- **Multi-Tenancy**: All queries are strictly scoped via `tenant_id` invariants.
