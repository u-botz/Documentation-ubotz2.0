# UBOTZ 2.0 Course Technical Specification

This document reflects the **current** Laravel + Next.js implementation. Persistence lives under `App\Infrastructure\Persistence\…` (Eloquent `*Record` models with `BelongsToTenant`). Domain contracts and value objects live under `App\Domain\TenantAdminDashboard\Course` (and `Enrollment` where enrollment aggregates are defined). Application orchestration is in `App\Application\TenantAdminDashboard\Course\UseCases\`.

---

## 1. Module boundaries & HTTP surface

### Tenant API prefix

Authenticated tenant user routes are mounted under **`/api/tenant`** with middleware `tenant.resolve.token`, `auth:tenant_api`, `tenant.active`, `ensure.user.active`, `tenant.session`, `tenant.timezone`, `throttle:tenant_api` (see `backend/routes/api.php`).

### LMS gating

Course routes in `backend/routes/tenant_dashboard/course.php` are wrapped in:

- `tenant.module:module.lms` — course features require the LMS module for the tenant.
- `tenant.capability:course.*` — read vs write operations use capabilities such as `course.view`, `course.create`, `course.edit`, `course.publish`, `course.archive`.

### Primary route files

| Concern | Route file |
|--------|------------|
| CRUD, chapters, files, text lessons, notes, waitlist, share links, subjects | `backend/routes/tenant_dashboard/course.php` |
| Student/admin enrollment | `backend/routes/tenant_dashboard/enrollment.php` |
| Learning progress (toggle completion, last view) | `backend/routes/tenant_dashboard/learning_progress.php` |
| Pricing (tickets, special offers) | continued in `course.php` under `pricing/…` |
| Public catalog (landing) | `backend/routes/api.php` — `PublicCourseController` |

---

## 2. Relational schema (tenant DB)

### 2.1 Core aggregate: `courses`

Created in `2026_02_26_200000_create_courses_table.php` and extended by later migrations (e.g. type, org pricing, SEO, video, points, waitlist, installments).

| Column / area | Role |
|----------------|------|
| `tenant_id` | Isolation; FK to `tenants` |
| `teacher_id`, `created_by` | Ownership / audit |
| `exam_id`, `subject_id`, `chapter_id`, `topic_id` | Optional links into **exam hierarchy** |
| `category_id` | Taxonomy |
| `title`, `slug`, `description` | Identity & SEO; **`unique(tenant_id, slug)`** as `idx_courses_tenant_slug` |
| `status` | See **§3** (`CourseStatus` enum) |
| `thumbnail_path`, `cover_image_path` | Media |
| `price_amount` | Minor units (integer) |
| `capacity` | Optional enrollment cap (used e.g. in bundle enrollment when `salesCount` is present) |
| `access_days` | Drives **enrollment expiry** via `AccessDuration` in `EnrollStudentUseCase` |
| `is_private` | Visibility |
| `softDeletes` | Soft delete support |

`course_tags` is created in the same migration (tenant-scoped tags per course).

### 2.2 Curriculum structure

- **`course_chapters`** — ordered sections (`sort_order`, reorder API).
- **`course_files`** — chapter-scoped assets; video attach/detach, playback token, heartbeat (progress).
- **`text_lessons`** — HTML content per chapter; attachments sub-resource.
- **`text_lesson_attachments`** — files linked to text lessons (via controller/use cases).

### 2.3 Progress & engagement

- **`course_learnings`** — completion rows keyed by `text_lesson_id`, `course_file_id`, and optionally `session_id` (session FK deferred in migration comment). Composite index **`idx_learnings_tenant_user_course`** on `(tenant_id, user_id, course_id)`.
- **`course_learning_last_views`** — resume / last position (see learning progress routes).

### 2.4 Enrollment & idempotency

- **`course_enrollments`** — `tenant_id`, `user_id`, `course_id`, `source`, `expires_at`, `status`; unique `(tenant_id, user_id, course_id)`. Additional migrations add idempotency key, suspension, etc.
- **`course_idempotency_keys`** — supports idempotent enrollments / checkout (see `EnrollStudentUseCase`).

### 2.5 Reviews, social, and extensions

- **`course_reviews`** — multi-axis scores (`content_quality`, `instructor_skills`, `purchase_worth`, `support_quality`) plus `average_rating` and moderation `status`; later migrations add `tenant_id` and indexing.
- **`course_comments`**, **`course_translations`**, **`course_chapter_translations`** — comments and i18n.
- **`course_waitlists`**, **`bundle_courses`**, **`batch_courses`**, **`related_courses`**, **`featured_courses`**, **`course_extra_descriptions`**, **`course_filter_options`**, **`course_partner_teachers`**, **`course_reports`** — operational and marketing features matching tenant-admin UI.

---

## 3. Course status model

Domain enum: `App\Domain\TenantAdminDashboard\Course\ValueObjects\CourseStatus`.

- **`draft`**, **`published`**, **`archived`** — primary lifecycle.
- **`active`** — **deprecated** legacy value; still treated as publicly visible alongside `published` via `isPubliclyVisible()` until fully migrated (`2026_03_20_170000_migrate_course_legacy_statuses.php`).

Write API: `CourseWriteController::changeStatus`, `archive`, etc., guarded by capabilities (`course.publish`, `course.archive`).

---

## 4. Key technical workflows (as implemented)

### 4.1 Enrollment (free / sourced)

- **Use case:** `App\Application\TenantAdminDashboard\Course\UseCases\EnrollStudentUseCase`.
- Computes `expires_at` from `course.access_days` using **`AccessDuration`** (not a class named `CreateCourseEnrollmentUseCase`).
- Persists via `CourseEnrollmentRepositoryInterface`; optional **idempotency** key deduplicates work.
- Dispatches **`StudentEnrolledEvent`** (not `CourseEnrolledEvent`) after successful enrollment.
- **Capacity:** not enforced inside `EnrollStudentUseCase`; bundle enrollment (`EnrollStudentInBundleUseCase`) can skip courses when `capacity` vs `salesCount` indicates full.

**HTTP:** `POST /api/tenant/enrollments/courses/{course}/enroll` (`EnrollmentWriteController`).

### 4.2 Access control for lesson/content

There is **no** `VerifyEnrollmentMiddleware` or `ResolveCourseCurriculumUseCase` in the codebase under those names.

Actual pattern:

- **`CheckCourseAccessUseCase`** — returns true if the user has **active** direct enrollment **or** access via **bundle**, **batch**, or **subscription** query (`SubscriptionAccessQueryInterface`).
- **`CourseAccessPolicy`** (`viewContent`) delegates to `CheckCourseAccessUseCase` for policy-style checks.

**HTTP:** `GET /api/tenant/enrollments/courses/{course}/check-access` (`EnrollmentReadController`).

### 4.3 Curriculum / progress for UI

- Chapters, files, and text lessons are loaded through **`CourseReadController`** and nested chapter/file/lesson controllers (see `course.php`).
- Completion toggling and last-view: **`LearningProgressReadController` / `LearningProgressWriteController`** under `/api/tenant/courses/{courseId}/learning-progress/…`.

### 4.4 Video & MAS-related telemetry

- Video tokens: `VideoPlayerReadController`, `GetVideoLessonTokenUseCase` (enrollment verified).
- **Heartbeat:** `HeartbeatController` — used for watch progress and can tie into platform activity/recording where integrated.

---

## 5. Frontend (Next.js)

### 5.1 API client configuration

Central path constants: `frontend/config/api-endpoints.ts` — e.g. `TENANT.COURSES`, nested `CHAPTERS`, `TEXT_LESSONS`, `ENROLLMENTS.MY_COURSES`, `CHECK_ACCESS`, `ENROLL`, pricing and communication prefixes.

### 5.2 Tenant admin UI

| Area | Location |
|------|----------|
| Course list & KPIs | `frontend/app/tenant-admin-dashboard/courses/page.tsx` |
| Create / edit / detail | `frontend/app/tenant-admin-dashboard/courses/create/page.tsx`, `[id]/page.tsx` |
| Feature components | `frontend/features/tenant-admin/courses/components/*` — form, chapters, files, text lessons, quizzes, assignments, live sessions, certificates, waitlist, forums, FAQs, pricing, etc. |
| Data hooks | `frontend/features/tenant-admin/courses/hooks/use-courses.ts` (and related hooks) |

### 5.3 Student UI

| Area | Location |
|------|----------|
| My courses / browse / learning | `frontend/features/student/courses/*` — `my-courses-page`, `browse-courses-page`, `learning-page`, purchase flows |
| App routes | e.g. `frontend/app/student-dashboard/courses/[id]/page.tsx` |

### 5.4 Course-scoped communication (not the institution Hub)

Per-course **FAQ**, **forum**, and **noticeboard** are mounted under the same **`/api/tenant/communication`** prefix but separate **modules**: `module.faq`, `module.forum`, `module.noticeboard` (see `backend/routes/tenant_dashboard/communication.php`). Tables include **`course_faqs`**, **`course_forum_topics`**, **`course_forum_answers`**, **`course_noticeboards`**, **`course_noticeboard_reads`** (`2026_03_05_190000_create_communication_tables.php`).

**Frontend:** `frontend/config/api-endpoints.ts` — `TENANT_COMMUNICATION` (`COURSE_FAQS`, `COURSE_FORUM`, `COURSE_NOTICEBOARDS`, etc.). Do not confuse this with **`module.communication_hub`** broadcast messages (`communication_messages`).

---

## 6. Public catalog (unauthenticated)

Marketing / catalog JSON for a tenant website:

- `GET /api/public/tenants/{tenantSlug}/website/courses`
- `GET /api/public/tenants/{tenantSlug}/website/courses/{courseSlug}`
- `GET /api/public/tenants/{tenantSlug}/website/courses/{courseSlug}/curriculum`

See `PublicCourseController` in `backend/routes/api.php` (throttled public group).

---

## 7. Performance & indexing

- Tenant-scoped composite indexes on course-related tables (e.g. `idx_courses_tenant_status`, `idx_learnings_tenant_user_course`) match high-frequency list and progress queries.
- Review aggregates: implementation may use caching or aggregated fields; confirm in read models / resources for a given endpoint before assuming materialized views.

---

## 8. Linked code references

| Layer | Path |
|-------|------|
| Domain (Course) | `backend/app/Domain/TenantAdminDashboard/Course/` |
| Domain (Enrollment) | `backend/app/Domain/TenantAdminDashboard/Enrollment/` |
| Application use cases | `backend/app/Application/TenantAdminDashboard/Course/UseCases/` |
| HTTP (tenant admin course) | `backend/app/Http/TenantAdminDashboard/Course/Controllers/` |
| Persistence | `backend/app/Infrastructure/Persistence/TenantAdminDashboard/Course/*Record.php` |

---

## 9. Document history

- Original draft referenced middleware/use-case names not present in the repository; **§4** and **§2** were aligned with migrations and PHP classes as of the last review.
- Added **§5.4** (course FAQ/forum/noticeboard vs Communication Hub), **§6** (public catalog routes), and renumbered subsequent sections.
