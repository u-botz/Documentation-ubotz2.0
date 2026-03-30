# UBOTZ 2.0 Enrollment Technical Specification

## Core Architecture
The Enrollment context dictates the authorization boundary for student access. It serves as the active cross-reference between the Identity bounded context (`users`) and the Product context (`courses`), mapping via `2026_03_05_052939_create_course_enrollments_table.php`.

## Schema Constraints (`course_enrollments`)

| Column | Technical Significance |
| :--- | :--- |
| `tenant_id` | Core isolation barrier. Bound structurally. |
| `source` | Identifies the ingestion mechanism (`free`, `purchase`, `subscription`). Critical for financial reconciliation and preventing operators from refunding internally-granted complimentary access. |
| `expires_at` | Enforced chronologically at the `CheckCourseAccessUseCase` gate. Overrides native course lengths if explicitly set by administrators. |
| `status` | State definitions (`active`, `expired`, `revoked`). Replaces standard deletion models to preserve historical engagement reporting. |

**Crucial Invariant:** `$table->unique(['tenant_id', 'user_id', 'course_id'])` explicitly blocks double-purchasing vectors, ensuring idempotency from external gateway webhook events.

## Dependency Triggers
Enrollment generation is deeply coupled to Domain Events emitted from the `Payment` and `Subscription` Bounded Contexts. Raw execution of `CourseEnrollment` factories outside these listener queues inherently risks desynchronizing financial audit paths.
