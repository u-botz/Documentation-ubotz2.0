# UBOTZ 2.0 Enrollment Business Findings

## Executive Summary

A **course enrollment** records that a **student** (user) may access a **course**: **source** (how access was granted), **expiry**, and **status**. The platform uses this row to drive **learning**, **attendance**, and **commerce** reporting. **CheckCourseAccessUseCase** also treats **bundle**, **batch**, and **subscription** entitlements as first-class access paths, not only the single `course_enrollments` row.

---

## Acquisition paths

- **Self-serve free enroll:** `POST /api/tenant/enrollments/courses/{course}/enroll` for eligible free courses.
- **Paid / checkout:** Payment and fee flows create or confirm enrollments with appropriate **source** and **idempotency** where implemented.
- **Admin grant:** Staff assign access with optional **access window** overrides.
- **Bundle purchase:** Enrolls the student in the bundle and **each** included course (subject to capacity), per **`EnrollStudentInBundleUseCase`**.

---

## Lifecycle

- **Expiry:** `expires_at` ends access when the domain logic evaluates it (with bundle/batch/subscription rules layered on top).
- **Revocation:** Admin **revoke** marks enrollment ended while retaining history.

---

## Linked references

- **Technical specification:** `Ubotz_2_enrollment_technical_documentation.md`.
- **Related:** Courses, payments, bundles, batches, subscriptions, **`CheckCourseAccessUseCase`**.
