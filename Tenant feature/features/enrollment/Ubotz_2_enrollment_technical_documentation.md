# UBOTZ 2.0 Enrollment Technical Specification

Enrollment ties **users** to **courses** (and indirectly to **bundles** / **batches** / **subscriptions**) for access control. Persistence: **`course_enrollments`** (Eloquent `CourseEnrollmentRecord` with **`BelongsToTenant`**). Domain entities live under `App\Domain\TenantAdminDashboard\Enrollment`.

---

## 1. HTTP surface (tenant API)

Routes: `backend/routes/tenant_dashboard/enrollment.php`, under **`tenant.module:module.lms`**.

### 1.1 Student-facing (`/api/tenant/enrollments`)

| Method | Path | Controller |
|--------|------|------------|
| `GET` | `/my-courses` | `EnrollmentReadController@myCourses` |
| `GET` | `/courses/{course}/check-access` | `EnrollmentReadController@checkAccess` |
| `POST` | `/courses/{course}/enroll` | `EnrollmentWriteController@enroll` |

**Note:** `EnrollmentWriteController@enroll` calls **`EnrollStudentUseCase::execute($tenantId, $userId, $courseId)`** with default source — it does **not** pass an **idempotency key** from the HTTP layer (checkout flows that need idempotency should use use cases / payment paths that supply it).

### 1.2 Admin (`/api/tenant/admin/enrollments`)

| Method | Path | Controller |
|--------|------|------------|
| `GET` | `/` | `AdminEnrollmentReadController@index` |
| `POST` | `/grant` | `AdminEnrollmentWriteController@grant` |
| `DELETE` | `/{enrollmentId}` | `AdminEnrollmentWriteController@revoke` |

Grant uses **`AdminGrantCourseEnrollmentUseCase`** with **`AdminGrantCourseEnrollmentCommand`** (optional **`access_days_override`**).

---

## 2. Schema (`course_enrollments`)

Base: `2026_03_05_052939_create_course_enrollments_table.php`.

| Column | Role |
|--------|------|
| `tenant_id`, `user_id`, `course_id` | **`unique(tenant_id, user_id, course_id)`** — `user_course_enrollment_unique` |
| `source` | e.g. `free`, `purchase`, `subscription`, **`bundle`** (see bundle use case) |
| `expires_at` | Access boundary |
| `status` | e.g. `active`, `expired`, `revoked` |

Later migrations add **idempotency key**, **suspension** fields, etc. — grep `course_enrollments` under `backend/database/migrations/tenant` for the full set.

---

## 3. Core use cases

| Use case | Role |
|----------|------|
| **`EnrollStudentUseCase`** | Free/default enrollment; **`AccessDuration`** from course `access_days`; **`StudentEnrolledEvent`**; optional idempotency; blocks duplicate active enrollment; audit |
| **`AdminGrantCourseEnrollmentUseCase`** | Staff grant with optional access override |
| **`RevokeEnrollmentUseCase`** | Admin revoke |
| **`CheckCourseAccessUseCase`** | Used by **`CourseAccessPolicy`** — true if **active direct** enrollment **or** bundle / batch / subscription access |

**Bundle:** **`EnrollStudentInBundleUseCase`** creates **`bundle_enrollments`** and per-course **`course_enrollments`** with `source` **bundle** (see bundle documentation).

---

## 4. Frontend

`frontend/config/api-endpoints.ts` — **`TENANT_ENROLLMENT`**: `MY_COURSES`, `CHECK_ACCESS`, `ENROLL`, `ADMIN.LIST`, `ADMIN.GRANT`, `ADMIN.REVOKE`.

---

## 5. Linked code references

| Layer | Path |
|-------|------|
| Application (course enroll) | `backend/app/Application/TenantAdminDashboard/Course/UseCases/EnrollStudentUseCase.php` |
| Application (admin) | `backend/app/Application/TenantAdminDashboard/Course/UseCases/AdminGrantCourseEnrollmentUseCase.php`, `RevokeEnrollmentUseCase.php` |
| HTTP | `backend/app/Http/Controllers/Api/TenantAdminDashboard/Enrollment/` |
| Domain | `backend/app/Domain/TenantAdminDashboard/Enrollment/` |
| Routes | `backend/routes/tenant_dashboard/enrollment.php` |

---

## 6. Document history

- Expanded with **routes**, **use-case names**, **bundle** linkage, and removed vague “only payment listeners” coupling; enrollment is also created from **admin grant** and **bundle** flows.
