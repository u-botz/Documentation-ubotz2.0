# UBOTZ 2.0 Installment Business Findings

## Executive Summary
Installment plans are the primary financial flexibility tool for Ubotz 2.0 tenants, especially those offering high-cost courses. They divide a singular `Fee` into a structured timeline of scheduled payments, lowering the barrier to entry for students while maintaining a rigorous collection pipeline for the institution.

## Operational Modalities

### 1. Installment Plans & Steps
A **Plan** (e.g., "3-Month Term") defines the global configuration.
- **Upfront Type**: Dictates the initial commitment (e.g., `fixed_amount` or `percent`).
- **Steps**: The individual payment milestones (e.g., "Month 1 Payment", "Final Balance").
- **Verification**: Toggles like `request_verify` and `bypass_verification` determine the amount of administrative friction required to unlock a student’s access during the payment lifecycle.

### 2. Enrollment Lifecycle Coupling
The `Enrollment` module is fundamentally tied to the Installment state.
- **Blocked Access**: In most tenant configurations, student access to course material is restricted if an installment step is overdue.
- **Unlocking**: Successful payment of an `Installment Order` (via Stripe/Razorpay) emits a domain event that automatically clears the block on the student's enrollment record.

### 3. Grace Periods & Overdue handling
- **Grace Periods**: Configurable buffers allowing for late payments without incurring penalties.
- **Automatic Enforcement**: If a student misses a deadline and the grace period expires, the system can automatically suspend the student's active `course_enrollment` session.

## Commercial Integration
Installments are the primary bridge between highly academic `Courses` and strictly financial `Payments`. They convert a tuition liability into a series of `Student Orders` that can be tracked, notified (via email/SMS), and settled independently.

---

## Linked References
- Status report: `../../status reports/Installment_Status_Report.md`
- Related Modules: `Fee`, `Payment`, `Enrollment`.
