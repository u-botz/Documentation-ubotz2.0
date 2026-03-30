# UBOTZ 2.0 Course Technical Specification

## Core Architecture
The `Course` domain in Ubotz 2.0 is a highly-coupled aggregate within the `TenantAdminDashboard\Course` context. It manages the intersection of pedagogical content, commercial availability, and student progress tracking. All models in this domain strictly implement the `BelongsToTenant` trait, ensuring that every query is implicitly scoped by the active `tenant_id`.

## Relational Schema Constraints

### 1. The Course Aggregate (`courses`)
The primary registry for courses, mapping instructors, categories, and exam hierarchies.
- **`tenant_id`**: Structural isolation invariant.
- **`status`**: Enforced state machine (`draft`, `published`, `archived`) filtered via `idx_courses_tenant_status`.
- **`slug`**: Unique per tenant (`unq_courses_tenant_slug`) for SEO-optimized URL resolution.
- **`teacher_id`**: Foreign key to `users`, defining the instructional owner.

### 2. Curriculum & Content Structure
The curriculum is organized into a nested hierarchy:
- **`course_chapters`**: Logical groupings of lessons. Ordered via `sort_order`.
- **`text_lessons`**: HTML-based instructional content linked to chapters. 
- **`course_files`**: Physical assets (PDFs, Videos) linked via the `File-Manager`.
- **`course_learnings`**: The progress ledger. Tracks the completion of `text_lesson_id`, `course_file_id`, or `session_id` for every student.
    - **Optimization**: `idx_learnings_tenant_user_course` allows for $O(1)$ progress bar calculations in the student dashboard.

### 3. Access & Enrollment (`course_enrollments`)
- **`access_days`**: An integer defining the valid window. The `CheckCourseAccessUseCase` calculates `expiry_at` by adding this value to the `enrolled_at` timestamp.
- **Idempotency**: `course_idempotency_keys` prevents duplicate enrollment records during high-traffic checkout flows or webhook retries.

### 4. Feedbacks & Social Proof (`course_reviews`)
- **`rating`**: Decimal-based star rating (e.g., 4.5).
- **Indices**: `idx_course_reviews_course` and `idx_course_reviews_creator` optimize the "Recent Reviews" widgets on course landing pages.

## Key Technical Workflows

### The Content Resolution Engine
When a student requests a course lesson:
1. `VerifyEnrollmentMiddleware` checks for an active, non-expired record in `course_enrollments`.
2. `ResolveCourseCurriculumUseCase` eager-loads `chapters` $\rightarrow$ `lessons` $\rightarrow$ `files`.
3. The system joins with `course_learnings` to mark completed items in the UI.

### Enrollment State Machine
1. Purchase event triggers `CreateCourseEnrollmentUseCase`.
2. System checks `courses.capacity` against `course_enrollments.count()` for the given course.
3. If capacity allows, a new record is inserted, and a `CourseEnrolledEvent` is dispatched (used for Welcome emails and reward points).

## Performance & Indexing Strategy
- **Composite Scoping**: Almost all `course_*` tables utilize a composite index on `(tenant_id, course_id)` to ensure that institutional data remains isolated and performant even as the global `courses` table grows to millions of rows.
- **Rating Aggregates**: Average ratings are typically cached using a materialized view or `Cache::remember` closures to avoid expensive `AVG()` calculations on every page load.

---

## Linked References
- **Domain Logic**: `App\Domain\TenantAdminDashboard\Course`.
- **Service Layer**: `App\Application\TenantAdminDashboard\Enrollment`.
- **Related Modules**: `Exam-Hierarchy`, `Payment`, `User`.
