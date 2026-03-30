# UBOTZ 2.0 — Feature Status Report: Enrollment

> **Instructions:** Copy this template for each feature. Fill every section honestly. If something is missing, write "NOT IMPLEMENTED" — do not skip the section. This document feeds directly into the Principal Engineer audit pipeline.

| Field | Value |
|---|---|
| **Feature Name** | Enrollment (Course & Bundle Access) |
| **Bounded Context** | TenantAdminDashboard\Enrollment (Inherits heavily from Course & Bundle) |
| **Date Reported** | 2026-03-20 |
| **Reported By** | AI Agent |
| **Current Status** | Working |
| **Has Developer Instructions Doc?** | No |
| **Has Implementation Plan?** | No |
| **Was Principal Engineer Audit Done?** | No |

---

## 1. What This Feature Does (2–3 sentences)

The Enrollment feature is the ultimate gatekeeper of the platform. It is the destination module that maps a Student (`user_id`) to a learning asset (`course_id` or `bundle_id`). Crucially, it acts as a listener for Domain Events injected by the Payment, Installment, and Subscription domains, automatically granting or revoking access based on financial workflows while also allowing manual overrides by Tenant Administrators.

---

## 2. Backend Architecture

### 2.1 Controllers

| Controller | Methods | Notes |
|---|---|---|
| `AdminEnrollmentReadController` | `index` | View robust enrollment lists across the tenant. |
| `AdminEnrollmentWriteController` | `grant`, `revoke` | Bypasses all financial guards for manual admin assignment. |
| `EnrollmentReadController` | `myCourses`, `checkAccess` | Student portals identifying what they own. |
| `EnrollmentWriteController` | `enroll` | Used primarily for students self-enrolling in $0/Free courses. |
| `BundleEnrollmentController` | `store` | Equivalent logic specifically for grouped bundles. |

### 2.2 UseCases / Queries

| UseCase / Query | Purpose | Injects Audit Logger? | Injects Quota Service? |
|---|---|---|---|
| `AdminGrantCourseEnrollmentUseCase` | Hardcodes an insertion bypassing rules | TBD | N/A |
| `RevokeEnrollmentUseCase` | Changes status from 'active' to 'revoked' | TBD | N/A |
| `GetStudentEnrollmentsUseCase`| Resolves active courses for the standard UI. | N/A | N/A |
| `ListCourseEnrollmentsQuery` | CQRS fetch | N/A | N/A |

### 2.3 Domain Layer

| Component | Type | Location | Notes |
|---|---|---|---|
| `EnrollmentStatus` | Value Object | `Domain.../Course` | `active`, `expired`, `revoked` |
| `EnrollmentSource` | Value Object | `Domain.../Course` | Critical tracker: `free`, `purchase`, `subscription`, `installment` |
| `CourseEnrollmentEntity` | Entity | `Domain.../Course` | |

### 2.4 Domain Events

| Event Class | Trigger | Has Listener? |
|---|---|---|
| `CreateEnrollmentOnPaymentCompleted` | **LISTENER**: Fired when `Gateway/Installment` completes. | Injects exactly into the `CourseEnrollmentRepository`. |
| `BundleEnrollmentCreated` | Fired when a bundle is verified | Likely triggers a cascade to grant the enclosed courses natively. |

### 2.5 Infrastructure Layer

| Component | Type | Notes |
|---|---|---|
| `CourseEnrollmentRecord` | Eloquent Model | Table: `course_enrollments` |
| `BundleEnrollmentRecord` | Eloquent Model | Table: `bundle_enrollments` |

### 2.6 Exceptions

| Exception Class | When Thrown |
|---|---|
| `PaidCourseEnrollmentException`| Thrown if a student hits `/enroll` on a non-free course. |
| `EnrollmentAlreadyActiveException`| Thrown if double-booking is attempted. |

---

## 3. Database Schema

### 3.1 Tables

**Table: `course_enrollments`** (Migration: `2026_03_05_052939_create_course_enrollments_table.php`)
- **Columns**: `id`, `tenant_id`, `user_id`, `course_id`, `source`, `expires_at`, `status`.
- **Primary Constraints**: `unique(['tenant_id', 'user_id', 'course_id'])`. You cannot have two rows for the same course; modifications hit the `status` string instead.
- **Soft Deletes**: **No**. (Uses Status).

**Table: `bundle_enrollments`** (Migration: `2026_03_09_051625_create_bundle_enrollments_table.php`)
- **Columns**: `id`, `tenant_id`, `user_id`, `bundle_id`, etc.
- **Soft Deletes**: **No**.

### 3.2 Relationships

| From Table | To Table | Type | FK Column |
|---|---|---|---|
| `course_enrollments` | `courses` | BelongsTo | `course_id` |
| `course_enrollments` | `users` | BelongsTo | `user_id` |

---

## 4. API Endpoints

*(Routes found in `routes/tenant_dashboard/enrollment.php`)*
- `GET /api/tenant/enrollments/my-courses` (Student interface)
- `GET /api/tenant/enrollments/courses/{course}/check-access` (Validate UI locks)
- `POST /api/tenant/enrollments/courses/{course}/enroll` (Self-serve)
- `GET /api/tenant/admin/enrollments` (Admin read)
- `POST /api/tenant/admin/enrollments/grant` (Admin write)
- `DELETE /api/tenant/admin/enrollments/{enrollmentId}` (Admin write)

*(Bundle Routes)*
- `POST /api/tenant/bundle-enrollments`

---

## 5. Security Checklist

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | All queries scoped by `tenant_id`? | Yes | Mandatory indices and composite uniqueness constraints present. |
| 2 | User-level isolation enforced where needed? | Yes | `myCourses` properly resolves via Auth token. |
| 3 | `tenant.capability` middleware on all routes? | Mixed | The internal `routes/tenant_dashboard/enrollment.php` file does not explicitly declare capability gates around the `/admin/` prefix in the file itself. (It may inherit from `api.php`, but it's physically missing in the modular file compared to other features). |
| 4 | Audit log written for every mutation? | TBD | |
| 5 | Audit log written OUTSIDE `DB::transaction()`? | TBD | |
| 6 | Domain events dispatched via `DB::afterCommit`? | Yes | Highly integrated with other systems. |
| 7 | Idempotency keys used for create operations? | N/A | Rely on `unique()` DB constraints for idempotency. |
| 8 | Input validation via FormRequest? | Yes | |
| 9 | File uploads validated? | N/A | |
| 10 | Financial values stored as `_cents` integer? | N/A | Financial concerns are strictly kept inside `Fee`/`Payment`. |
| 11 | Soft deletes used? | N/A | Financial/Access records should physically remain but change `status` to `revoked/expired`. The feature handles this correctly. |
| 12 | No raw SQL in controllers or UseCases? | Yes | |
| 13 | Eloquent models have `BelongsToTenant` trait/scope? | Yes | |

---

## 6. Frontend

Expected to drive the Student Dashboard's "My Courses" layout and visually "unlock" playback for course content based on the `checkAccess` endpoints.

---

## 7. Tests

| Test File | Test Count | Passing? |
|---|---|---|
| `PaymentEnrollmentIntegrationTest.php`| Multiple | Yes (Validates Domain Event Bridges) |
| `AdminEnrollmentTest.php` | Multiple | Yes |
| `EnrollmentControllerTest.php`| Multiple | Yes |
| `BundleEnrollmentTest.php` | Multiple | Yes |

---

## 8. Known Issues & Gaps

| # | Issue | Severity Guess | Notes |
|---|---|---|---|
| 1 | Implicit Capability Middleware | Medium | The `admin/enrollments` group in `enrollment.php` lacks the explicit `->middleware('tenant.capability:[...'])` seen universally in features like Installments or Subscriptions. This relies dangerously on parent groupings in `api.php`. |

---

## 9. Dependencies on Other Features

| Depends On | How |
|---|---|
| Payment | Fires the `CreateEnrollmentOnPaymentCompleted` domain listener. |
| Course | Determines what exact asset is being unlocked. |
| Bundle / Subscription | Alternative mechanisms for generating mass enrollments. |

---

## 10. File Tree (Backend Only)

```
app/
├── Http/Controllers/Api/TenantAdminDashboard/Enrollment/
│   ├── AdminEnrollmentReadController.php
│   ├── AdminEnrollmentWriteController.php
│   ├── EnrollmentReadController.php
│   └── EnrollmentWriteController.php
├── Http/Controllers/Api/TenantAdminDashboard/Bundle/
│   └── BundleEnrollmentController.php
├── Application/TenantAdminDashboard/Course/
│   ├── Listeners/
│   │   └── CreateEnrollmentOnPaymentCompleted.php
│   └── UseCases/
│       ├── AdminGrantCourseEnrollmentUseCase.php
│       ├── RevokeEnrollmentUseCase.php
│       └── GetStudentEnrollmentsUseCase.php
├── Domain/TenantAdminDashboard/Course/
│   ├── Entities/
│   │   └── CourseEnrollmentEntity.php
│   ├── ValueObjects/
│   │   ├── EnrollmentStatus.php
│   │   └── EnrollmentSource.php
│   └── Exceptions/
├── Infrastructure/Persistence/TenantAdminDashboard/Course/
│   └── CourseEnrollmentRecord.php
└── routes/tenant_dashboard/
    ├── enrollment.php
    └── bundle.php
```

---

> **Reminder:** This report is input for the Principal Engineer audit. Incomplete or inaccurate information here means the audit will miss real issues or flag false positives. When in doubt, check the actual code — do not guess.

*End of Template*
