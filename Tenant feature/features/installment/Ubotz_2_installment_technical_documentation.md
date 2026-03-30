# UBOTZ 2.0 Installment Technical Specification

## Core Architecture
The Installment module resides within the `TenantAdminDashboard\Installment` bounded context. It provides a state-machine-driven interface for managing multi-step payment obligations.

## Relational Schema Constraints

### 1. Configuration Layer
- **`installment_plans`**: Root metadata for the plan (title, description, upfront config).
- **`installment_steps`**: Defines the individual milestones (percentage/amount, due days relative to start).

### 2. Execution Layer
- **`installment_orders`**: The active instance of a plan attached to a specific student and course.
- **`installment_order_payments`**: Represents individual payment attempts or partial settlements against an installment step.
- **`idx_courses_installment_plan`**: (Optional) Courses can define a `default_installment_plan_id`.

## Key Technical Workflows

### Generating Installment Orders
1. Student selects a course and chooses an installment plan.
2. `GenerateInstallmentOrderUseCase` calculates the exact `due_at` dates and amounts (cents) based on the plan's `upfront_value` and subsequent `installment_steps`.
3. An `installment_order` is instantiated, and a `student_order` (type: `installment`) is created for the initial upfront payment.

### Processing Payments
1. When a `student_order` for an installment is marked `paid`, the `UpdateInstallmentOrderPaymentUseCase` is triggered.
2. The logic marks the specific installment step as `settled` and checks if further blocks on the student's `course_enrollment` should be lifted.

## Tenancy & Security
- **Multi-Tenancy**: Every query is strictly scoped against `tenant_id`. 
- **Integrity**: `installment_order_payments` is tightly coupled to the parent `installment_orders` table via cascading foreign keys, preventing orphaned payment records.
- **Branch Context**: Installment orders are tagged with `branch_id` for localized financial auditing.
