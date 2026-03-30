# UBOTZ 2.0 Bundle Technical Specification

Bundles group **courses** into a sellable package per tenant. Application code: `App\Application\TenantAdminDashboard\Bundle`; enrollment aggregates live under `App\Domain\TenantAdminDashboard\Enrollment` (`BundleEnrollmentEntity`, `CourseEnrollmentEntity`).

---

## 1. HTTP surface

Routes: `backend/routes/tenant_dashboard/bundle.php` under **`/api/tenant`**.

| Method | Path | Capability |
|--------|------|------------|
| `GET` | `/bundles/stats` | `bundle.manage` |
| `GET` | `/bundles` | `bundle.manage` |
| `GET` | `/bundles/{bundleId}` | `bundle.manage` |
| `POST` | `/bundles` | `bundle.manage` |
| `PUT` | `/bundles/{bundleId}` | `bundle.manage` |
| `DELETE` | `/bundles/{bundleId}` | `bundle.manage` |
| `POST` | `/bundles/{bundleId}/status` | `bundle.manage` |
| `POST` | `/bundles/{bundleId}/duplicate` | `bundle.manage` |
| `POST` | `/bundles/{bundleId}/courses` | `bundle.manage` |
| `DELETE` | `/bundles/{bundleId}/courses/{courseId}` | `bundle.manage` |
| `POST` | `/bundles/{bundleId}/enroll` | `bundle.manage` |
| `POST` | `/bundle-enrollments` | `bundle.enroll` |

**Note:** Listing and detail require **`bundle.manage`** (not a separate read-only capability in this route file). The **`bundle.enroll`** route accepts enrollment with **`bundle_id`** in the body (legacy shape); prefer **`POST /bundles/{bundleId}/enroll`** for admin enrollment (see `frontend/config/api-endpoints.ts`).

---

## 2. Relational schema (tenant DB)

### 2.1 `bundles`

Base: `2026_03_09_051622_create_bundles_table.php` — `tenant_id`, `title`, `slug`, `description`, `category_id`, `teacher_id`, **`price_cents`**, `access_days`, `status` (default `draft`), timestamps.

Alignment: **`2026_03_20_220001_align_bundle_tables_for_phase_17d.php`** adds among others: `created_by`, `thumbnail_path`, **`price_amount_cents`** (backfilled from `price_cents`), `is_private`, `idempotency_key`, **soft deletes** (`deleted_at`), unique `(tenant_id, idempotency_key)`; maps legacy **`active` → `published`** for `status`.

Canonical price field in newer code paths is typically **`price_amount_cents`** alongside legacy `price_cents` — confirm in `BundleEntity` / resources when integrating.

### 2.2 `bundle_courses`

`2026_03_09_051623_create_bundle_courses_table.php` — `tenant_id`, `bundle_id`, `course_id`; unique `(tenant_id, bundle_id, course_id)`. Phase 17d adds **`sort_order`**.

### 2.3 `bundle_enrollments`

`2026_03_09_051625_create_bundle_enrollments_table.php` — `tenant_id`, `user_id`, `bundle_id`, `sale_id`, `expires_at`.

Phase 17d adds: `source`, `status`, `locked_price_cents`, `bundle_name`, `idempotency_key`, unique `(tenant_id, idempotency_key)`.

---

## 3. Enrollment workflow (implemented)

**`EnrollStudentInBundleUseCase`** (not `InstantiateBundleEnrollmentUseCase`):

1. Loads bundle; rejects **draft** or **archived**.
2. Idempotent **`bundle_enrollment`** row via `idempotency_key`.
3. For each course in the bundle: skips if **course capacity** full; reuses existing **active** `course_enrollment` if present; otherwise creates **`CourseEnrollmentEntity`** with source **`EnrollmentSource::BUNDLE`**.
4. Audits `bundle.student_enrolled`; dispatches **`BundleEnrollmentCreated`** after commit.

There is **no** guarantee in this use case that **`access_days`** from the bundle is applied to each `course_enrollment` `expires_at` (enrollments may be created with `expiresAt: null` — verify product expectations against payment/checkout flows).

---

## 4. Other use cases

`CreateBundleUseCase`, `UpdateBundleUseCase`, `DeleteBundleUseCase`, `ChangeBundleStatusUseCase`, `DuplicateBundleUseCase`, `AddCourseToBundleUseCase`, `RemoveCourseFromBundleUseCase`, `CalculateBundlePriceUseCase`, `CheckBundleAccessUseCase` — see `App\Application\TenantAdminDashboard\Bundle\UseCases`.

**`CheckCourseAccessUseCase`** (enrollment module) can grant course access **via bundle** using bundle enrollment access services.

---

## 5. Frontend

- **`frontend/config/api-endpoints.ts`:** `TENANT_BUNDLE` (`BASE`, `DETAIL`, `STATUS`, `DUPLICATE`, `COURSES`, `ENROLL`, `ENROLL_LEGACY`).
- **Pages:** `frontend/app/tenant-admin-dashboard/bundles/*`.
- **Components:** `frontend/features/tenant-admin/bundles/*` (`use-bundles.ts`, forms, course manager, enroll drawer).

---

## 6. Tenancy & security

All bundle queries must be scoped by **`tenant_id`** in repositories. Capabilities **`bundle.manage`** vs **`bundle.enroll`** separate catalog administration from enrollment-only flows.

---

## 7. Linked code references

| Layer | Path |
|-------|------|
| Application | `backend/app/Application/TenantAdminDashboard/Bundle/` |
| HTTP | `backend/app/Http/Controllers/Api/TenantAdminDashboard/Bundle/` |
| Routes | `backend/routes/tenant_dashboard/bundle.php` |

---

## 8. Document history

- Replaced **`BundlePurchasedEvent` / `InstantiateBundleEnrollmentUseCase`** with **`EnrollStudentInBundleUseCase`** and **`BundleEnrollmentCreated`**.
- Documented **Phase 17d** schema alignment and **dual** enrollment endpoints.
