# UBOTZ 2.0 — Feature Status Report: Course (Catalog, Lifecycle & Access)

> **Instructions:** Copy this template for each feature. Fill every section honestly. If something is missing, write "NOT IMPLEMENTED" — do not skip the section. This document feeds directly into the Principal Engineer audit pipeline.

| Field | Value |
|---|---|
| **Feature Name** | Course (tenant course catalog, CRUD, chapters/content, pricing helpers, student access checks) |
| **Bounded Context** | TenantAdminDashboard / StudentDashboard (consumers) / Enrollment (access) |
| **Date Reported** | 2026-03-21 |
| **Reported By** | AI Agent (verified in source) |
| **Current Status** | Working — core CRUD, status workflow, and access chain implemented; large surface area (see Known Issues) |
| **Has Developer Instructions Doc?** | Yes — `documentation/implementation plan/Ubotz_2_phase_17fe_implementation_plan.md` |
| **Has Implementation Plan?** | Yes — Phase 17-FE (course status/bundles UI) |
| **Was Principal Engineer Audit Done?** | No |

---

## 1. What This Feature Does (2–3 sentences)

The **Course** feature lets each tenant define and manage courses (metadata, pricing, visibility, curriculum links, and rich content such as chapters, files, and lessons). **Tenant admins and instructors** create and publish courses; **students** gain access through direct enrollment, bundle/batch paths, or subscription rules. **Course status** (`draft` → `published` → `archived`, with legacy `active` deprecated) controls whether a course is eligible for publish gates and catalog-style visibility.

---

## 2. Backend Architecture

### 2.1 Controllers

| Controller | Methods | Notes |
|---|---|---|
| `App\Http\TenantAdminDashboard\Course\Controllers\CourseReadController` | `index`, `show`, `stats`, `statistics`, `enrolledStudentIds`, `exportStudents` | List/detail/stats under `tenant.capability:course.view` |
| `App\Http\TenantAdminDashboard\Course\Controllers\CourseWriteController` | `store`, `update`, `changeStatus`, `archive`, `destroy` | Mutations; separate PATCH for status/archive |
| `App\Http\TenantAdminDashboard\Course\Controllers\ChapterController` | `index`, `store`, `update`, `destroy`, `reorder` | Nested under `{courseId}/chapters` |
| `App\Http\TenantAdminDashboard\Course\Controllers\CourseFileController` | `index`, `store`, `update`, `destroy` | Nested under `{chapterId}/files` |
| `App\Http\TenantAdminDashboard\Course\Controllers\TextLessonController` | `index`, `store`, `update`, `destroy` | Nested under `{chapterId}/text-lessons` |
| `App\Http\TenantAdminDashboard\Course\Controllers\TicketController` | `index`, `store`, `update`, `destroy`, `validateCode` | Under `/pricing/courses/{id}/tickets` |
| `App\Http\TenantAdminDashboard\Course\Controllers\SpecialOfferController` | `index`, `store`, `update`, `destroy` | Under `/pricing/` prefix |
| `App\Http\TenantAdminDashboard\Course\Controllers\WaitlistController` | `index`, `toggle`, `clear`, `join`, `leave`, `deleteEntry` | Waitlist management |
| `App\Http\TenantAdminDashboard\Course\Controllers\VideoAttachmentWriteController` | `attach`, `detach` | Video source management |
| `App\Http\TenantAdminDashboard\Course\Controllers\VideoPlayerReadController` | `getToken` | Returns video playback auth tokens |
| `App\Http\TenantAdminDashboard\Course\Controllers\TextLessonAttachmentController` | `index`, `store`, `destroy` | Attachments for text lessons |
| `App\Http\TenantAdminDashboard\Course\Controllers\ContentDeleteRequestController` | `index`, `store`, `review` | Soft-deletion approval workflow for content |
| `App\Http\TenantAdminDashboard\Course\Controllers\CourseReportController` | `index`, `store` | Student-submitted course reports |
| `App\Http\TenantAdminDashboard\Course\Controllers\CoursePartnerTeacherController` | `index`, `sync` | Co-instructor management |
| `App\Http\TenantAdminDashboard\Course\Controllers\CourseExtraDescriptionController` | `index`, `sync` | Supplementary course content blocks |
| `App\Http\TenantAdminDashboard\Course\Controllers\CourseFilterOptionController` | `index`, `sync` | Course-level filter/tag management |
| `App\Http\TenantAdminDashboard\Course\Controllers\CourseShareReadController` | `show` | Share link generation |
| `App\Http\TenantAdminDashboard\Course\Controllers\CourseSubjectController` | `index`, `store`, `update`, `destroy` | Subject nodes per course |
| `App\Http\Controllers\Api\TenantAdminDashboard\Course\CourseDuplicationController` | `duplicate` | Deep-copy course |
| `App\Http\Controllers\Api\TenantAdminDashboard\Course\CourseCommentWriteController` | `store`, `update`, `destroy` | Comments |
| `App\Http\Controllers\Api\TenantAdminDashboard\Course\CourseCommentReadController` | `index` | Comment listing |
| `App\Http\Controllers\Api\TenantAdminDashboard\Course\CourseCommentModerationController` | `approve`, `reply`, `destroy`, `pending` | Comment moderation |
| `App\Http\Controllers\Api\TenantAdminDashboard\Course\CourseTranslationController` | `index`, `sync` | i18n translations |
| `App\Http\Controllers\Api\TenantAdminDashboard\Course\HeartbeatController` | `heartbeat` | Video watch progress heartbeat |
| `App\Http\Controllers\Api\TenantAdminDashboard\Course\CertificateReadController` | multiple | Certificate management |
| `App\Http\Controllers\Api\TenantAdminDashboard\Course\CertificateWriteController` | multiple | Certificate issuance |
| `App\Http\Controllers\Api\TenantAdminDashboard\Course\LearningProgressReadController` | multiple | Progress reporting |
| `App\Http\Controllers\Api\TenantAdminDashboard\Course\LearningProgressWriteController` | multiple | Progress updates |
| `App\Http\Controllers\Api\TenantAdminDashboard\Course\FeaturedCourseReadController` | `index` | Featured list |
| `App\Http\Controllers\Api\TenantAdminDashboard\Course\FeaturedCourseWriteController` | `store`, `destroy` | Featured management |
| `App\Http\Controllers\Api\TenantAdminDashboard\Course\RelatedCourseReadController` | `index` | Related course list |
| `App\Http\Controllers\Api\TenantAdminDashboard\Course\RelatedCourseWriteController` | `store`, `destroy` | Related course management |
| `App\Http\Controllers\Api\TenantAdminDashboard\Course\PartnerTeacherReadController` | `index` | Partners read |
| `App\Http\Controllers\Api\TenantAdminDashboard\Course\PartnerTeacherWriteController` | `store`, `destroy` | Partners write |
| `App\Http\Controllers\Api\TenantAdminDashboard\Course\CourseStatisticsController` | `index` | Stats |

### 2.2 UseCases / Queries

| UseCase / Query | Purpose | Injects Audit Logger? | Injects Quota Service? |
|---|---|---|---|
| `CreateCourseUseCase` | Create course with idempotency, quota lock, slug uniqueness | Yes (`course.created`) | Yes (quota via tenant lock) |
| `UpdateCourseUseCase` | Update course fields | Yes | N/A |
| `ChangeCourseStatusUseCase` | Status transitions (`draft`→`published`→`archived`) | Yes | N/A |
| `ArchiveCourseUseCase` | Archive course | Yes | N/A |
| `DeleteCourseUseCase` | Soft-delete course | Yes | N/A |
| `DuplicateCourseUseCase` | Deep copy course tree | Yes (`course.duplicated`) | N/A |
| `CheckCourseAccessUseCase` | Student access: enrollment→bundle→batch→subscription | N/A | N/A |
| `CalculateCoursePriceUseCase` (Service) | Resolve price after tickets/special offers/groups | N/A | N/A |
| `CreateChapterUseCase` / `UpdateChapterUseCase` / `DeleteChapterUseCase` / `ReorderChaptersUseCase` | Chapter CRUD & ordering | Yes | N/A |
| `CreateCourseFileUseCase` / `UpdateCourseFileUseCase` / `DeleteCourseFileUseCase` | File/video material lifecycle | Yes | N/A |
| `CreateTextLessonUseCase` / `UpdateTextLessonUseCase` / `DeleteTextLessonUseCase` | Text lesson lifecycle | Yes | N/A |
| `AddTextLessonAttachmentUseCase` / `RemoveTextLessonAttachmentUseCase` | Lesson attachments | Yes | N/A |
| `AttachVideoFromFileManagerUseCase` / `AttachVideoFromUrlUseCase` / `DetachVideoFromLessonUseCase` | Video source management | Yes | N/A |
| `CreateTicketUseCase` / `UpdateTicketUseCase` / `DeleteTicketUseCase` / `ApplyTicketUseCase` | Pricing tickets | Yes | N/A |
| `CreateSpecialOfferUseCase` / `UpdateSpecialOfferUseCase` / `DeleteSpecialOfferUseCase` | Special offers | Yes | N/A |
| `PostCourseCommentUseCase` / `UpdateCourseCommentUseCase` / `DeleteCourseCommentUseCase` / `ApproveCourseCommentUseCase` / `ReplyToCourseCommentUseCase` | Comment lifecycle | Yes | N/A |
| `EnrollStudentUseCase` / `AdminGrantCourseEnrollmentUseCase` / `RevokeEnrollmentUseCase` | Enrollment management | Yes | N/A |
| `IssueCertificateUseCase` / `VerifyCertificateUseCase` | Certificate lifecycle | Yes | N/A |
| `AddPrerequisiteUseCase` / `RemovePrerequisiteUseCase` / `CheckPrerequisitesUseCase` | Prerequisites | Yes | N/A |
| `GetCourseProgressUseCase` / `ToggleItemProgressUseCase` / `RecordLastViewUseCase` | Learning progress tracking | N/A | N/A |
| `UpdateWatchProgressUseCase` | Video watch progress | N/A | N/A |
| `GetVideoLessonTokenUseCase` | Secure video playback token | N/A | N/A |
| `CreateGiftUseCase` / `ActivateGiftUseCase` | Course gifting | Yes | N/A |
| `CreateNoticeboardUseCase` / `UpdateNoticeboardUseCase` / `DeleteNoticeboardUseCase` / `MarkNoticeboardAsReadUseCase` | Course noticeboard | Yes | N/A |
| `CreateForumTopicUseCase` / `PostForumAnswerUseCase` / `ToggleForumTopicPinUseCase` / `ToggleForumAnswerResolveUseCase` | Forum discussions | Yes | N/A |
| `CreateContentDeleteRequestUseCase` / `ReviewContentDeleteRequestUseCase` | Content removal request workflow | Yes | N/A |
| `SyncCourseTranslationsUseCase` / `SyncCourseExtraDescriptionsUseCase` / `SyncCoursePartnerTeachersUseCase` / `SyncCourseFilterOptionsUseCase` | Batch sync operations | Yes | N/A |
| `CreateCourseReportUseCase` | Student course reporting | Yes | N/A |
| `CreateLiveSessionUseCase` / `UpdateLiveSessionUseCase` / `StartAgoraSessionUseCase` / `EndAgoraSessionUseCase` | Live session (Agora) management | Yes | N/A |
| `GetCourseStatisticsUseCase` / `ExportCourseStudentsQuery` | Stats and exports | N/A | N/A |

### 2.3 Domain Layer

| Component | Type | Location | Notes |
|---|---|---|---|
| `CourseEntity` | Entity | `Domain/TenantAdminDashboard/Course/Entities/` | Aggregate root; enforces publish invariants, status transitions |
| `ChapterEntity` | Entity | `Domain/TenantAdminDashboard/Course/Entities/` | Chapter node with status and sort order |
| `CourseFileEntity` | Entity | `Domain/TenantAdminDashboard/Course/Entities/` | File/video material |
| `TextLessonEntity` | Entity | `Domain/TenantAdminDashboard/Course/Entities/` | Text-format lesson node |
| `TextLessonAttachmentEntity` | Entity | `Domain/TenantAdminDashboard/Course/Entities/` | Downloadable attachment |
| `CourseCommentEntity` | Entity | `Domain/TenantAdminDashboard/Course/Entities/` | Threaded comment with moderation state |
| `CourseReviewEntity` | Entity | `Domain/TenantAdminDashboard/Course/Entities/` | Rating/review |
| `GiftEntity` | Entity | `Domain/TenantAdminDashboard/Course/Entities/` | Gifted course license |
| `LiveSessionEntity` | Entity | `Domain/TenantAdminDashboard/Course/Entities/` | Agora live session |
| `CertificateEntity` / `CertificateTemplateEntity` | Entity | `Domain/TenantAdminDashboard/Course/Entities/` | Certificate data |
| `FaqEntity`, `FilterOptionEntity`, `ForumTopicEntity`, `ForumAnswerEntity`, `NoticeboardEntity`, `PrerequisiteEntity`, `WaitlistEntryEntity`, `VideoWatchProgressEntity`, `CourseLearningEntity`, `ContentDeleteRequestEntity` | Entity | `Domain/TenantAdminDashboard/Course/Entities/` | Supporting entities |
| `CourseStatus` | Value Object (enum) | `Domain/TenantAdminDashboard/Course/ValueObjects/` | `draft`, `published`, `archived`; `active` deprecated |
| `CourseSlug` | Value Object | `Domain/TenantAdminDashboard/Course/ValueObjects/` | Enforces slug format/uniqueness |
| `CourseProps` | Value Object | `Domain/TenantAdminDashboard/Course/ValueObjects/` | Constructor aggregate |
| `CourseType` | Value Object | `Domain/TenantAdminDashboard/Course/ValueObjects/` | e.g. `course`, `bundle` type |
| `ChapterStatus`, `ContentStatus`, `ChapterProps`, `TextLessonProps`, `FileType`, `FileSource`, `FileAccessibility`, `VideoSource`, `VideoSourceType`, `VideoDemoSource` | Value Objects | `Domain/TenantAdminDashboard/Course/ValueObjects/` | Content-node value types |
| `CertificateType`, `SessionProvider`, `GiftStatus`, `CommentStatus`, `ContentDeleteRequestStatus`, `DiscountType`, `GiftItemType` | Value Objects | `Domain/TenantAdminDashboard/Course/ValueObjects/` | Lifecycle/state types |

**Domain invariants (summary):** Title length, non-negative price, capacity/access-days when set; publish readiness (category, teacher, thumbnail, min description) enforced in `CourseEntity::changeStatus()`; verify against current `CourseEntity` source.

### 2.4 Domain Events

| Event Class | Trigger | Has Listener? |
|---|---|---|
| `CourseCreated` | After course persisted | Yes — audit |
| `CourseUpdated` | After course update | Yes — audit |
| `CourseStatusChanged` | After status transition | Yes — audit |
| `CourseArchived` | After archive | Yes — audit |
| `ChapterCreated` / `ChapterUpdated` / `ChapterDeleted` | Chapter mutations | Yes — audit |
| `CourseFileCreated` / `CourseFileUpdated` / `CourseFileDeleted` | File mutations | Yes — audit |
| `TextLessonCreated` / `TextLessonUpdated` / `TextLessonDeleted` | Lesson mutations | Yes — audit |
| `TextLessonAttachmentAdded` | Attachment added | Yes |
| `VideoAttachedToLesson` / `VideoDetachedFromLesson` | Video lifecycle | Yes |
| `VideoLessonCompleted` | Watch completion threshold | Yes |
| `CourseCommentPosted` / `CourseCommentApproved` / `CourseCommentDeleted` | Comment lifecycle | Yes |
| `CourseReported` | Student abuse report | Yes |
| `CertificateIssuedEvent` | Certificate generated | Yes |
| `CourseCompletedEvent` | Learning progress hit 100% | Yes |
| `StudentJoinedWaitlistEvent` / `WaitlistSlotAvailable` | Waitlist events | Yes |
| `ContentDeletionRequested` / `ContentDeleteRequestStatusChanged` | Content removal workflow | Yes |
| `GiftActivated` | Gift code used | Yes — `GiftActivatedListener` |
| `LiveSessionRescheduled` | Session time changed | Yes |
| `CourseNoticeboardPosted` | New announcement | Yes |

### 2.5 Infrastructure Layer

| Component | Type | Notes |
|---|---|---|
| `CourseRecord` | Eloquent Model | Maps to `courses`; uses `SoftDeletes`, `BelongsToTenant`, `HasFactory` |
| `ChapterRecord` | Eloquent Model | Maps to `course_chapters`; uses `BelongsToTenant`. **No SoftDeletes** |
| `CourseFileRecord` | Eloquent Model | Maps to `course_files`; uses `BelongsToTenant`. **No SoftDeletes** |
| `TextLessonRecord` | Eloquent Model | Maps to `text_lessons`; uses `BelongsToTenant`. **No SoftDeletes** |
| `CourseEnrollmentRecord` | Eloquent Model | Maps to `course_enrollments`; `BelongsToTenant` |
| `CourseCommentRecord` | Eloquent Model | Maps to `course_comments` |
| `CourseTagRecord`, `CategoryRecord`, `CourseTranslationRecord`, `ChapterTranslationRecord`, `CourseExtraDescriptionRecord` | Eloquent Models | Associated meta records |
| `SpecialOfferRecord`, `TicketRecord`, `TicketUserRecord`, `DiscountCodeRecord` | Eloquent Models | Pricing records |
| `CourseLearningRecord`, `CourseLearningLastViewRecord`, `VideoWatchProgressRecord` | Eloquent Models | Learning progress |
| `ForumTopicRecord`, `ForumAnswerRecord`, `FaqRecord`, `NoticeboardRecord`, `NoticeboardReadRecord` | Eloquent Models | Engagement features |
| `CourseWaitlistRecord`, `CourseFilterOptionRecord`, `ContentDeleteRequestRecord` | Eloquent Models | Waitlist, filter, and request records |
| `FeaturedCourseRecord`, `RelatedCourseRecord`, `CoursePartnerTeacherRecord`, `PartnerTeacherRecord` | Eloquent Models | Discovery/social features |
| `CourseReportRecord`, `FilterOptionRecord` | Eloquent Models | Reporting |
| `EloquentCourseRepository` | Repository | Implements `CourseRepositoryInterface` |
| `EloquentChapterRepository` | Repository | Implements `ChapterRepositoryInterface` |
| `EloquentCourseFileRepository` | Repository | Implements `CourseFileRepositoryInterface` |
| `EloquentTextLessonRepository` | Repository | Implements `TextLessonRepositoryInterface` |
| `EloquentCourseIdempotencyRepository` | Repository | Implements `CourseIdempotencyRepositoryInterface` |
| `EloquentCourseLearningRepository` | Repository | Implements `CourseLearningRepositoryInterface` |
| `EloquentCourseCommentRepository` | Repository | Implements `CourseCommentRepositoryInterface` |
| `EloquentCourseTranslationRepository` | Repository | Implements `CourseTranslationRepositoryInterface` |
| `EloquentFaqRepository`, `EloquentForumRepository`, `EloquentNoticeboardRepository`, `EloquentWaitlistRepository`, `EloquentFeaturedCourseRepository`, `EloquentRelatedCourseRepository`, `EloquentPartnerTeacherRepository`, `EloquentFilterOptionRepository`, `EloquentCategoryRepository`, `EloquentContentDeleteRequestRepository`, `EloquentCourseReportRepository`, `EloquentCourseExtraDescriptionRepository`, `EloquentCourseFilterOptionRepository`, `EloquentVideoWatchProgressRepository`, `EloquentTextLessonAttachmentRepository` | Repositories | Domain repository implementations |
| `ChapterContentQuery`, `CourseStatisticsQuery`, `EloquentCourseStatisticsQuery`, `EloquentCourseStudentExportQuery`, `EloquentListCourseReportsQuery`, `EloquentListContentDeleteRequestsQuery` | Query Objects | Implements read queries |

### 2.6 Exceptions

| Exception Class | When Thrown |
|---|---|
| `CourseNotFoundException` | Course ID not found for tenant |
| `DuplicateCourseSlugException` | Slug already exists within the tenant |
| `InvalidCourseStatusTransitionException` | Illegal state jump (e.g., archived → published) |
| `CoursePublishRequirementsNotMetException` | Publish attempted without required fields (category, teacher, thumbnail, etc.) |
| `CertificateIssuanceException` | Certificate cannot be issued |
| `CommentNotOwnedByUserException` | Edit/delete attempted by non-owner |
| `CourseCommentNotFoundException` | Comment not found |
| `ContentDeleteRequestNotFoundException` | Request ID not found |
| `CourseReportNotFoundException` | Report ID not found |
| `EnrollmentAlreadyActiveException` | Student already enrolled |
| `InvalidContentDeleteRequestTransitionException` | Illegal status change on delete request |
| `InvalidModerationStatusException` | Invalid moderation state provided |
| `InvalidVideoUrlException` | URL provided to video attach is malformed / invalid |
| `VideoNotEnrolledException` | Video access attempted without enrollment |

---

## 3. Database Schema

### 3.1 Tables

**Table: `courses`** (Migration: `2026_02_26_200000_create_courses_table.php`)

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | BIGINT UNSIGNED PK | No | |
| `tenant_id` | BIGINT UNSIGNED FK | No | |
| `teacher_id` | BIGINT UNSIGNED FK | Yes | Nullable — not required at creation |
| `created_by` | BIGINT UNSIGNED | Yes | |
| `exam_id`, `subject_id`, `chapter_id`, `topic_id` | BIGINT UNSIGNED FK | Yes | Optional exam hierarchy links |
| `category_id` | BIGINT UNSIGNED FK | Yes | |
| `title` | VARCHAR(255) | No | |
| `slug` | VARCHAR(255) | No | Unique per `(tenant_id, slug)` |
| `description`, `seo_description` | TEXT | Yes | |
| `status` | VARCHAR(50) | No | Default `draft` |
| `thumbnail_path`, `cover_image_path` | VARCHAR(500) | Yes | |
| `video_demo_source`, `video_demo_path` | VARCHAR | Yes | |
| `price_amount` | BIGINT | No | Stored as integer (minor units) |
| `organization_price_amount` | BIGINT | Yes | B2B pricing |
| `capacity`, `access_days` | INT UNSIGNED | Yes | |
| `is_private` | BOOLEAN | No | Default `false` |
| `enable_waitlist` | BOOLEAN | No | Default `false` |
| `points` | INT | No | Default `0` — gamification |
| `sales_count` | INT | No | Default `0` |
| `duration` | INT | Yes | Minutes |
| `support`, `certificate`, `downloadable`, `partner_instructor`, `forum`, `subscribe` | BOOLEAN | No | Feature toggles |
| `type` | VARCHAR | No | e.g. `course`, `bundle` |
| `badges`, `prerequisites`, `related_courses`, `faqs`, `learning_materials` | JSON | Yes | |
| `deleted_at` | TIMESTAMP | Yes | **Soft Deletes enabled** |
| `created_at`, `updated_at` | TIMESTAMP | Yes | |

**Indexes:** `tenant_id`, unique `(tenant_id, slug)`, `(tenant_id, status)`, `(tenant_id, category_id)`.

**Missing columns (known):**
- Column is named `price_amount` not `price_cents` — non-standard naming vs platform checklist item #10.

---

**Table: `course_idempotency_keys`** (Migration: `2026_02_27_024401_create_course_idempotency_keys_table.php`)

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | BIGINT UNSIGNED PK | No | |
| `tenant_id` | BIGINT UNSIGNED FK | No | |
| `idempotency_key` | VARCHAR(255) | No | Unique per `(tenant_id, idempotency_key)` |
| `course_id` | BIGINT UNSIGNED FK | No | |
| `created_at`, `updated_at` | TIMESTAMP | Yes | |

---

**Table: `course_chapters`** (Migration: `2026_03_04_230000_create_course_chapters_table.php`)

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | BIGINT UNSIGNED PK | No | |
| `tenant_id` | BIGINT UNSIGNED FK | No | |
| `course_id` | BIGINT UNSIGNED FK | No | |
| `subject_id` | BIGINT UNSIGNED FK | Yes | Optional subject link |
| `title` | VARCHAR(255) | No | |
| `status` | VARCHAR(20) | No | |
| `sort_order` | INT UNSIGNED | No | |
| `created_at`, `updated_at` | TIMESTAMP | Yes | |

**Missing columns (known):**
- `deleted_at`: **No SoftDeletes** — chapter deletes are permanent.

---

**Table: `course_files`** (Migration: `2026_03_05_000000_create_course_files_table.php`)

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | BIGINT UNSIGNED PK | No | |
| `tenant_id` | BIGINT UNSIGNED FK | No | |
| `course_id` | BIGINT UNSIGNED FK | No | |
| `chapter_id` | BIGINT UNSIGNED FK | No | |
| `title` | VARCHAR(255) | No | |
| `description` | TEXT | Yes | |
| `file_path` | VARCHAR(500) | Yes | |
| `file_source` | VARCHAR(50) | No | e.g. `upload`, `url`, `youtube`, `vimeo`, `file_manager` |
| `file_type` | VARCHAR(50) | Yes | `video`, `document`, etc. |
| `accessibility` | VARCHAR(20) | Yes | |
| `volume_mb` | DECIMAL | Yes | |
| `downloadable` | BOOLEAN | No | Default `false` |
| `sort_order` | INT UNSIGNED | No | |
| `status` | VARCHAR(20) | No | |
| `source_type`, `source_identifier`, `vimeo_account_mode` | VARCHAR | Yes | Video platform fields |
| `duration_seconds` | INT UNSIGNED | Yes | |
| `created_at`, `updated_at` | TIMESTAMP | Yes | |

**Missing columns (known):**
- `deleted_at`: **No SoftDeletes** — course file deletes are permanent.

---

**Table: `text_lessons`** (part of above migrations)

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | BIGINT UNSIGNED PK | No | |
| `tenant_id` | BIGINT UNSIGNED FK | No | |
| `course_id`, `chapter_id` | BIGINT UNSIGNED FK | No | |
| `title` | VARCHAR(255) | No | |
| `summary`, `content` | TEXT | Yes | |
| `image_path` | VARCHAR(500) | Yes | |
| `study_time` | INT | Yes | Minutes |
| `accessibility` | VARCHAR(20) | Yes | |
| `sort_order` | INT UNSIGNED | No | |
| `status` | VARCHAR(20) | No | |
| `created_at`, `updated_at` | TIMESTAMP | Yes | |

**Missing columns (known):**
- `deleted_at`: **No SoftDeletes** — text lesson deletes are permanent.

---

**Table: `course_enrollments`** (Migration: `2026_03_05_052939_create_course_enrollments_table.php`)

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | BIGINT UNSIGNED PK | No | |
| `tenant_id` | BIGINT UNSIGNED FK | No | |
| `user_id` | BIGINT UNSIGNED FK | No | The enrolled student |
| `course_id` | BIGINT UNSIGNED FK | No | |
| `status` | VARCHAR | No | e.g. `active`, `revoked`, `expired` |
| `enrolled_at`, `expires_at` | TIMESTAMP | Yes | |
| `created_at`, `updated_at` | TIMESTAMP | Yes | |

### 3.2 Relationships

| From Table | To Table | Type | FK Column |
|---|---|---|---|
| `courses` | `tenants` | BelongsTo | `tenant_id` |
| `courses` | `users` (teacher) | BelongsTo | `teacher_id` |
| `courses` | `users` (creator) | BelongsTo | `created_by` |
| `courses` | `categories` | BelongsTo | `category_id` |
| `courses` | `course_tags` | HasMany | `course_id` |
| `courses` | `course_translations` | HasMany | `course_id` |
| `course_chapters` | `courses` | BelongsTo | `course_id` |
| `course_chapters` | `subjects` | BelongsTo | `subject_id` |
| `course_chapters` | `course_files` | HasMany | `chapter_id` |
| `course_chapters` | `text_lessons` | HasMany | `chapter_id` |
| `course_files` | `course_chapters` | BelongsTo | `chapter_id` |
| `text_lessons` | `course_chapters` | BelongsTo | `chapter_id` |
| `course_enrollments` | `courses` | BelongsTo | `course_id` |
| `course_enrollments` | `users` | BelongsTo | `user_id` |

---

## 4. API Endpoints

*(Capability middleware: All routes under `routes/tenant_dashboard/course.php` are scoped by `tenant.module:module.lms` and individual `tenant.capability:course.*` gates. Pricing routes lack explicit capability middleware — **VERIFY**.)*

| Method | URI | Controller@Method | Middleware | Capability Code |
|---|---|---|---|---|
| `GET` | `/api/tenant/courses` | `CourseReadController@index` | `tenant.module` + `tenant.capability` | `course.view` |
| `GET` | `/api/tenant/courses/stats` | `CourseReadController@stats` | same | `course.view` |
| `GET` | `/api/tenant/courses/{id}` | `CourseReadController@show` | same | `course.view` |
| `GET` | `/api/tenant/courses/{id}/statistics` | `CourseReadController@statistics` | same | `course.view` |
| `GET` | `/api/tenant/courses/{id}/enrolled-student-ids` | `CourseReadController@enrolledStudentIds` | same | `course.view` |
| `GET` | `/api/tenant/courses/{id}/export-students` | `CourseReadController@exportStudents` | same | `course.view` |
| `POST` | `/api/tenant/courses` | `CourseWriteController@store` | `tenant.module` | `course.create` |
| `PUT` | `/api/tenant/courses/{id}` | `CourseWriteController@update` | `tenant.module` | `course.edit` |
| `PATCH` | `/api/tenant/courses/{id}/status` | `CourseWriteController@changeStatus` | `tenant.module` | `course.publish` |
| `PATCH` | `/api/tenant/courses/{id}/archive` | `CourseWriteController@archive` | `tenant.module` | `course.archive` |
| `DELETE` | `/api/tenant/courses/{id}` | `CourseWriteController@destroy` | `tenant.module` | `course.archive` |
| `POST` | `/api/tenant/courses/{id}/duplicate` | `CourseDuplicationController@duplicate` | `tenant.module` | **VERIFY** |
| `GET` | `/api/tenant/courses/{cId}/chapters` | `ChapterController@index` | `tenant.module` | `course.view` |
| `POST` | `/api/tenant/courses/{cId}/chapters` | `ChapterController@store` | `tenant.module` | `course.edit` |
| `PUT` | `/api/tenant/courses/{cId}/chapters/{chId}` | `ChapterController@update` | `tenant.module` | `course.edit` |
| `DELETE` | `/api/tenant/courses/{cId}/chapters/{chId}` | `ChapterController@destroy` | `tenant.module` | `course.edit` |
| `POST` | `/api/tenant/courses/{cId}/chapters/reorder` | `ChapterController@reorder` | `tenant.module` | `course.edit` |
| `GET` | `/api/tenant/courses/{cId}/chapters/{chId}/files` | `CourseFileController@index` | `tenant.module` | `course.view` |
| `POST` | `/api/tenant/courses/{cId}/chapters/{chId}/files` | `CourseFileController@store` | `tenant.module` | `course.edit` |
| `PUT` | `/api/tenant/courses/{cId}/chapters/{chId}/files/{fId}` | `CourseFileController@update` | `tenant.module` | `course.edit` |
| `DELETE` | `/api/tenant/courses/{cId}/chapters/{chId}/files/{fId}` | `CourseFileController@destroy` | `tenant.module` | `course.edit` |
| `POST` | `.../files/{fId}/video` | `VideoAttachmentWriteController@attach` | `tenant.module` | `course.edit` |
| `DELETE` | `.../files/{fId}/video` | `VideoAttachmentWriteController@detach` | `tenant.module` | `course.edit` |
| `GET` | `.../files/{fId}/token` | `VideoPlayerReadController@getToken` | `tenant.module` | `course.view` |
| `POST` | `.../files/{fId}/heartbeat` | `HeartbeatController@heartbeat` | `tenant.module` | `course.view` |
| `GET` | `.../text-lessons` | `TextLessonController@index` | `tenant.module` | `course.view` |
| `POST` | `.../text-lessons` | `TextLessonController@store` | `tenant.module` | `course.edit` |
| `GET` | `/api/tenant/pricing/courses/{cId}/tickets` | `TicketController@index` | `tenant.module` | **NONE — missing capability** |
| `POST` | `/api/tenant/pricing/courses/{cId}/tickets` | `TicketController@store` | `tenant.module` | **NONE — missing capability** |
| `POST` | `/api/tenant/pricing/courses/{cId}/special-offers` | `SpecialOfferController@store` | `tenant.module` | **NONE — missing capability** |
| `GET` / `POST` | `/api/tenant/content-delete-requests` | `ContentDeleteRequestController` | `tenant.module` | **VERIFY** |
| `GET` / `POST` | `/api/tenant/courses/{cId}/waitlist` | `WaitlistController` | `tenant.module` | varies |

---

## 5. Security Checklist

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | All queries scoped by `tenant_id`? | Yes | `BelongsToTenant` trait and FK enforced on all records |
| 2 | User-level isolation enforced where needed? (`user_id` check) | Partial | Teacher/ownership checks policy-dependent; comment edit/delete enforced via `CommentNotOwnedByUserException` |
| 3 | `tenant.capability` middleware on all routes? | Partial | Pricing (`/pricing/...`) and comment routes lack explicit capability codes — **must audit** |
| 4 | Audit log written for every mutation? | Partial | Core Create/Update/Status/Duplicate documented; Noticeboard, Forum, Comment — verify |
| 5 | Audit log written OUTSIDE `DB::transaction()`? | Yes | Confirmed in `CreateCourseUseCase` — audit after commit |
| 6 | Domain events dispatched via `DB::afterCommit`? | Yes | Events dispatched post-transaction commit |
| 7 | Idempotency keys used for create operations? | Yes | `CreateCourseUseCase` fully implements via `CourseIdempotencyRepositoryInterface` |
| 8 | Input validation via FormRequest (not in controller)? | Partial | Core course CRUD uses FormRequests; some nested routes — verify |
| 9 | File uploads validated server-side (MIME via `finfo`)? | Partial | `CourseFileUseCase` handles — verify MIME enforcement |
| 10 | Financial values stored as `_cents` integer? | Partial | Stored as `price_amount` (naming non-standard vs platform checklist) |
| 11 | Soft deletes used (no hard delete of user data)? | Partial | `courses` ✅ has `SoftDeletes`. `course_chapters`, `course_files`, `text_lessons` ❌ do NOT — permanent deletes possible |
| 12 | No raw SQL in controllers or UseCases? | Yes | Queries via Eloquent repositories |
| 13 | Eloquent models have `BelongsToTenant` trait/scope? | Yes | Verified on `CourseRecord`, `ChapterRecord`, `CourseFileRecord`, `TextLessonRecord`, `CourseEnrollmentRecord` |
| 14 | Sensitive data not exposed in API responses? | Yes | Resources filter accordingly |

---

## 6. Frontend

### 6.1 File Location

```
frontend/features/tenant-admin/courses/
frontend/app/tenant-admin-dashboard/courses/
```

### 6.2 Components

| Component | Purpose | Notes |
|---|---|---|
| `course-list-table.tsx` | Course list, status badge, row actions | Uses `CourseStatusBadge`, publish/archive actions |
| `course-form.tsx` | Create/edit course | Handles `draft` / `published` / `archived` |
| `courses/page.tsx` | Filters, KPIs, navigation to create | Create button → `/tenant-admin-dashboard/courses/create` |
| `chapter-list-item.tsx` | Chapter rendering | Embeds `QuizManager` for chapter-level quizzes |
| `quiz-manager.tsx` | Quiz config within chapters | Under courses feature folder |
| Chapter/file/lesson managers | Content authoring | Large subtree |

### 6.3 API Hooks

| Hook | Endpoint | Notes |
|---|---|---|
| `useCourses`, `useCourse`, `useCreateCourse`, `useUpdateCourse`, `useChangeCourseStatus`, etc. | `/api/tenant/courses...` | `tenant-course-service.ts` |
| `useCourses` params | Filters including `status` | Aligns with `draft` / `published` / `archived` |

### 6.4 Capability-Based UI Gating

| UI Element | Hidden When Missing Capability | Implemented? |
|---|---|---|
| Course list / create | `course.view` / `course.create` | Partial — verify `useTenantAuth` on every page |
| Edit/Archive/Delete actions | `course.edit` / `course.archive` | Partial — not all buttons verified |

---

## 7. Tests

| Test File | Test Count | Passing? |
|---|---|---|
| `tests/Feature/TenantAdminDashboard/Course/CourseCrudTest.php` | Multiple | Yes — verify locally |
| `tests/Feature/TenantAdminDashboard/Course/CourseIsolationTest.php` | Multiple | Yes |
| `tests/Feature/TenantAdminDashboard/Course/CourseIdempotencyTest.php` | Multiple | Yes |
| `tests/Feature/TenantAdminDashboard/Course/CourseValidationTest.php` | Multiple | Yes |
| `tests/Feature/TenantAdminDashboard/Course/CourseFilteringTest.php` | Multiple | Yes |
| `tests/Feature/TenantAdminDashboard/Course/CourseCapabilityDenialTest.php` | Multiple | Yes |
| `tests/Feature/TenantAdminDashboard/Course/CourseCreationQuotaTest.php` | Multiple | Yes |
| `tests/Feature/TenantAdminDashboard/Course/CourseClassificationTest.php` | Multiple | Yes |
| `tests/Feature/TenantAdminDashboard/Course/CourseStatisticsTest.php` | Multiple | Yes |
| `tests/Feature/TenantAdminDashboard/Course/CourseStatusMigrationTest.php` | Multiple | Yes |
| `tests/Feature/TenantAdminDashboard/Course/CourseTypeMigrationTest.php` | Multiple | Yes |
| `tests/Feature/TenantAdminDashboard/Course/CreateCourseAuditLogTest.php` | Multiple | Yes |
| `tests/Feature/TenantAdminDashboard/Course/ChapterCrudTest.php` | Multiple | Yes |
| `tests/Feature/TenantAdminDashboard/Course/ChapterEnhancementsTest.php` | Multiple | Yes |
| `tests/Feature/TenantAdminDashboard/Course/CourseFileCrudTest.php` | Multiple | Yes |
| `tests/Feature/TenantAdminDashboard/Course/TextLessonCrudTest.php` | Multiple | Yes |
| `tests/Feature/TenantAdminDashboard/Course/TextLessonAttachmentCrudTest.php` | Multiple | Yes |
| `tests/Feature/TenantAdminDashboard/Course/TextLessonAttachmentTest.php` | Multiple | Yes |
| `tests/Feature/TenantAdminDashboard/Course/VideoAttachmentTest.php` | Multiple | Yes |
| `tests/Feature/TenantAdminDashboard/Course/CourseTicketTest.php` | Multiple | Yes |
| `tests/Feature/TenantAdminDashboard/Course/WaitlistFeatureTest.php` | Multiple | Yes |
| `tests/Feature/TenantAdminDashboard/Course/FilterOptionTest.php` | Multiple | Yes |
| `tests/Feature/TenantAdminDashboard/Course/PartnerTeacherTest.php` | Multiple | Yes |
| `tests/Feature/TenantAdminDashboard/Course/ContentDeleteRequestTest.php` | Multiple | Yes |
| `tests/Feature/TenantAdminDashboard/Course/CourseReportTest.php` | Multiple | Yes |
| `tests/Feature/TenantAdminDashboard/Course/SeoDescriptionTest.php` | Multiple | Yes |
| `tests/Feature/TenantAdminDashboard/Course/CourseShareLinksTest.php` | Multiple | Yes |
| `tests/Feature/TenantAdminDashboard/Course/CourseStudentExportTest.php` | Multiple | Yes |
| `tests/Feature/TenantAdminDashboard/Course/Batch2FeatureTest.php` | Multiple | Yes |
| `tests/Feature/TenantAdminDashboard/Course/CertificateIntegrationTest.php` | Multiple | Yes |
| `tests/Feature/TenantAdminDashboard/Course/PricingIntegrationTest.php` | Multiple | Yes |
| `tests/Feature/TenantAdminDashboard/Course/PaymentEnrollmentIntegrationTest.php` | Multiple | Yes |
| `tests/Unit/TenantAdminDashboard/Course/Entities/CourseEntityTest.php` | Multiple | Yes |
| `tests/Unit/TenantAdminDashboard/Course/Entities/ChapterEntityTest.php` | Multiple | Yes |
| `tests/Unit/TenantAdminDashboard/Course/Entities/CourseFileEntityTest.php` | Multiple | Yes |
| `tests/Unit/TenantAdminDashboard/Course/ValueObjects/CourseStatusTest.php` | Multiple | Yes |
| `tests/Unit/TenantAdminDashboard/Course/ValueObjects/CourseSlugTest.php` | Multiple | Yes |
| `tests/Unit/TenantAdminDashboard/Course/ValueObjects/ChapterStatusTest.php` | Multiple | Yes |
| `tests/Unit/TenantAdminDashboard/Course/UseCases/CreateCourseUseCaseTest.php` | Multiple | Yes |
| `tests/Unit/Application/TenantAdminDashboard/Course/UseCases/CheckCourseAccessUseCaseTest.php` | Multiple | Yes |

**Command (Docker):** `docker exec ubotz_backend php artisan test --filter=Course`

---

## 8. Known Issues & Gaps

| # | Issue | Severity Guess | Notes |
|---|---|---|---|
| 1 | Hard deletes on nested content | High | `course_chapters`, `course_files`, and `text_lessons` lack `deleted_at`. Instructor/admin can permanently destroy lesson content with no recovery path. |
| 2 | Pricing routes missing `tenant.capability` middleware | Medium | `GET/POST /pricing/courses/{id}/tickets` and special offer routes inside `Route::prefix('pricing')` do not set explicit capability codes |
| 3 | Duplicate endpoint idempotency not guaranteed | Low | `DuplicateCourseUseCase` does not track idempotency — re-submitting will create multiple copies |
| 4 | Legacy `active` status | Low | Previously mapped to `published`; `CourseStatusMigrationService` handles migration but verify DB state |
| 5 | `price_amount` column naming | Low | Non-standard naming vs platform `_cents` convention — UI must convert carefully |

---

## 9. Dependencies on Other Features

| Depends On | How |
|---|---|
| Categories | `category_id` on course |
| Users (instructors) | `teacher_id`, `created_by` on `courses` |
| Exam Hierarchy | Optional `exam_id` / `subject_id` / `chapter_id` / `topic_id` |
| Enrollment | Direct enrollments; `CheckCourseAccessUseCase` checks first |
| Bundle / Batch | `BundleEnrollmentAccessInterface`, `BatchEnrollmentAccessInterface` in access chain |
| Subscription | `SubscriptionAccessQueryInterface` — last fallback in access chain |
| Pricing (Tickets & Offers) | `CalculateCoursePriceUseCase` computes effective price |
| Quota / Tenant Plan | `TenantQuotaServiceInterface` checked on course creation |
| File Manager | `AttachVideoFromFileManagerUseCase` references managed files |
| Rewards | `CourseCompletedEvent` → potential reward trigger |

---

## 10. File Tree (Backend Only)

```
app/
├── Http/TenantAdminDashboard/Course/Controllers/
│   ├── CourseReadController.php
│   ├── CourseWriteController.php
│   ├── ChapterController.php
│   ├── CourseFileController.php
│   ├── TextLessonController.php
│   ├── TextLessonAttachmentController.php
│   ├── TicketController.php
│   ├── SpecialOfferController.php
│   ├── WaitlistController.php
│   ├── VideoAttachmentWriteController.php
│   ├── VideoPlayerReadController.php
│   ├── ContentDeleteRequestController.php
│   ├── CourseReportController.php
│   ├── CoursePartnerTeacherController.php
│   ├── CourseExtraDescriptionController.php
│   ├── CourseFilterOptionController.php
│   ├── CourseShareReadController.php
│   └── CourseSubjectController.php
├── Http/Controllers/Api/TenantAdminDashboard/Course/
│   ├── CourseDuplicationController.php
│   ├── CourseCommentReadController.php
│   ├── CourseCommentWriteController.php
│   ├── CourseCommentModerationController.php
│   ├── CourseTranslationController.php
│   ├── HeartbeatController.php
│   ├── CertificateReadController.php
│   ├── CertificateWriteController.php
│   ├── CertificateTemplateReadController.php
│   ├── CertificateTemplateWriteController.php
│   ├── LearningProgressReadController.php
│   ├── LearningProgressWriteController.php
│   ├── FeaturedCourseReadController.php
│   ├── FeaturedCourseWriteController.php
│   ├── RelatedCourseReadController.php
│   ├── RelatedCourseWriteController.php
│   ├── PartnerTeacherReadController.php
│   ├── PartnerTeacherWriteController.php
│   └── CourseStatisticsController.php
├── Application/TenantAdminDashboard/Course/
│   ├── Commands/
│   │   ├── AddPrerequisiteCommand.php
│   │   ├── AddTextLessonAttachmentCommand.php
│   │   ├── AdminGrantCourseEnrollmentCommand.php
│   │   ├── ApproveCourseCommentCommand.php
│   │   ├── ArchiveCourseCommand.php
│   │   ├── AttachVideoFromFileManagerCommand.php
│   │   ├── AttachVideoFromUrlCommand.php
│   │   ├── AttachVideoToLessonCommand.php
│   │   ├── ChangeCourseStatusCommand.php
│   │   ├── CreateCertificateTemplateCommand.php
│   │   ├── CreateChapterCommand.php
│   │   ├── CreateContentDeleteRequestCommand.php
│   │   ├── CreateCourseCommand.php
│   │   ├── CreateCourseFileCommand.php
│   │   ├── CreateCourseReportCommand.php
│   │   ├── CreateFaqCommand.php
│   │   ├── CreateFilterOptionCommand.php
│   │   ├── CreateForumTopicCommand.php
│   │   ├── CreateGiftCommand.php
│   │   ├── CreateNoticeboardCommand.php
│   │   ├── CreateSpecialOfferCommand.php
│   │   ├── CreateTextLessonCommand.php
│   │   ├── CreateTicketCommand.php
│   │   ├── DeleteCertificateTemplateCommand.php
│   │   ├── DeleteChapterCommand.php
│   │   ├── DeleteCourseCommand.php
│   │   ├── DeleteCourseCommentCommand.php
│   │   ├── DeleteCourseFileCommand.php
│   │   ├── DeleteFaqCommand.php
│   │   ├── DeleteNoticeboardCommand.php
│   │   ├── DeleteSpecialOfferCommand.php
│   │   ├── DeleteTextLessonCommand.php
│   │   ├── DeleteTicketCommand.php
│   │   ├── DetachVideoFromLessonCommand.php
│   │   ├── MarkNoticeboardAsReadCommand.php
│   │   ├── PostCourseCommentCommand.php
│   │   ├── PostForumAnswerCommand.php
│   │   ├── RemovePrerequisiteCommand.php
│   │   ├── RemoveTextLessonAttachmentCommand.php
│   │   ├── ReorderChaptersCommand.php
│   │   ├── ReplyToCourseCommentCommand.php
│   │   ├── ReviewContentDeleteRequestCommand.php
│   │   ├── RevokeEnrollmentCommand.php
│   │   ├── SyncCourseExtraDescriptionsCommand.php
│   │   ├── SyncCourseFilterOptionsCommand.php
│   │   ├── SyncCoursePartnerTeachersCommand.php
│   │   ├── SyncCourseTranslationsCommand.php
│   │   ├── ToggleForumAnswerResolveCommand.php
│   │   ├── ToggleForumTopicPinCommand.php
│   │   ├── UpdateCertificateTemplateCommand.php
│   │   ├── UpdateChapterCommand.php
│   │   ├── UpdateCourseCommand.php
│   │   ├── UpdateCourseCommentCommand.php
│   │   ├── UpdateCourseFileCommand.php
│   │   ├── UpdateFaqCommand.php
│   │   ├── UpdateLiveSessionCommand.php
│   │   ├── UpdateSpecialOfferCommand.php
│   │   ├── UpdateTextLessonCommand.php
│   │   ├── UpdateTicketCommand.php
│   │   ├── UpdateWatchProgressCommand.php
│   │   └── Waitlist/
│   │       ├── ClearWaitlistCommand.php
│   │       ├── DeleteWaitlistEntryCommand.php
│   │       ├── JoinWaitlistCommand.php
│   │       ├── LeaveWaitlistCommand.php
│   │       └── ToggleWaitlistCommand.php
│   ├── Queries/
│   │   ├── ExportCourseStudentsQuery.php
│   │   ├── GetCourseShareLinksQuery.php
│   │   ├── GetCourseStatisticsQuery.php
│   │   ├── GetCourseTranslationsQuery.php
│   │   ├── GetEnrolledStudentIdsQuery.php
│   │   ├── ListCertificateTemplatesQuery.php
│   │   ├── ListContentDeleteRequestsQuery.php
│   │   ├── ListCourseCommentsQuery.php
│   │   ├── ListCourseEnrollmentsQuery.php
│   │   ├── ListCourseFaqsQuery.php
│   │   ├── ListCourseNoticeboardsQuery.php
│   │   ├── ListCoursePrerequisitesQuery.php
│   │   ├── ListCourseReportsQuery.php
│   │   ├── ListCourseSpecialOffersQuery.php
│   │   ├── ListCourseTicketsQuery.php
│   │   ├── ListForumAnswersQuery.php
│   │   ├── ListForumTopicsQuery.php
│   │   ├── ListInstructorPendingCommentsQuery.php
│   │   └── ListSentGiftsQuery.php
│   ├── UseCases/
│   │   ├── ActivateGiftUseCase.php
│   │   ├── AddPrerequisiteUseCase.php
│   │   ├── AddSessionReminderUseCase.php
│   │   ├── AddTextLessonAttachmentUseCase.php
│   │   ├── AdminGrantCourseEnrollmentUseCase.php
│   │   ├── ApplyTicketUseCase.php
│   │   ├── ApproveCourseCommentUseCase.php
│   │   ├── ArchiveCourseUseCase.php
│   │   ├── AttachVideoFromFileManagerUseCase.php
│   │   ├── AttachVideoFromUrlUseCase.php
│   │   ├── ChangeCourseStatusUseCase.php
│   │   ├── CheckCourseAccessUseCase.php
│   │   ├── CheckPrerequisitesUseCase.php
│   │   ├── CreateCertificateTemplateUseCase.php
│   │   ├── CreateChapterUseCase.php
│   │   ├── CreateContentDeleteRequestUseCase.php
│   │   ├── CreateCourseFileUseCase.php
│   │   ├── CreateCourseReportUseCase.php
│   │   ├── CreateCourseUseCase.php
│   │   ├── CreateFaqUseCase.php
│   │   ├── CreateFilterOptionUseCase.php
│   │   ├── CreateForumTopicUseCase.php
│   │   ├── CreateGiftUseCase.php
│   │   ├── CreateLiveSessionUseCase.php
│   │   ├── CreateNoticeboardUseCase.php
│   │   ├── CreateSpecialOfferUseCase.php
│   │   ├── CreateTextLessonUseCase.php
│   │   ├── CreateTicketUseCase.php
│   │   ├── DeleteCertificateTemplateUseCase.php
│   │   ├── DeleteChapterUseCase.php
│   │   ├── DeleteCourseCommentUseCase.php
│   │   ├── DeleteCourseFileUseCase.php
│   │   ├── DeleteCourseUseCase.php
│   │   ├── DeleteFaqUseCase.php
│   │   ├── DeleteNoticeboardUseCase.php
│   │   ├── DeleteSpecialOfferUseCase.php
│   │   ├── DeleteTextLessonUseCase.php
│   │   ├── DeleteTicketUseCase.php
│   │   ├── DetachVideoFromLessonUseCase.php
│   │   ├── DuplicateCourseUseCase.php
│   │   ├── EndAgoraSessionUseCase.php
│   │   ├── EnrollStudentUseCase.php
│   │   ├── GenerateJoinLinkUseCase.php
│   │   ├── GetChapterContentUseCase.php
│   │   ├── GetCoursePersonalNotesUseCase.php
│   │   ├── GetCourseProgressInterface.php
│   │   ├── GetCourseProgressUseCase.php
│   │   ├── GetCourseStatisticsUseCase.php
│   │   ├── GetStudentEnrollmentsUseCase.php
│   │   ├── GetTextLessonAttachmentsUseCase.php
│   │   ├── GetVideoLessonTokenUseCase.php
│   │   ├── IssueCertificateUseCase.php
│   │   ├── ListCourseExtraDescriptionsUseCase.php
│   │   ├── ListCourseFilterOptionsUseCase.php
│   │   ├── ListCoursePartnerTeachersUseCase.php
│   │   ├── ListFilterOptionsUseCase.php
│   │   ├── ManageCertificateTemplateUseCase.php
│   │   ├── ManageFaqsUseCase.php
│   │   ├── ManageForumUseCase.php
│   │   ├── ManageNoticeboardUseCase.php
│   │   ├── ManagePrerequisitesUseCase.php
│   │   ├── ManageSpecialOffersUseCase.php
│   │   ├── ManageTicketsUseCase.php
│   │   ├── MarkNoticeboardAsReadUseCase.php
│   │   ├── ModerateReviewUseCase.php
│   │   ├── PostCourseCommentUseCase.php
│   │   ├── PostForumAnswerUseCase.php
│   │   ├── RecordLastViewUseCase.php
│   │   ├── RemovePrerequisiteUseCase.php
│   │   ├── RemoveTextLessonAttachmentUseCase.php
│   │   ├── ReorderChaptersUseCase.php
│   │   ├── ReplyToCourseCommentUseCase.php
│   │   ├── ReviewContentDeleteRequestUseCase.php
│   │   ├── RevokeEnrollmentUseCase.php
│   │   ├── StartAgoraSessionUseCase.php
│   │   ├── SubmitReviewUseCase.php
│   │   ├── SyncCourseExtraDescriptionsUseCase.php
│   │   ├── SyncCourseFilterOptionsUseCase.php
│   │   ├── SyncCoursePartnerTeachersUseCase.php
│   │   ├── SyncCourseTranslationsUseCase.php
│   │   ├── ToggleAgoraUserJoinUseCase.php
│   │   ├── ToggleForumAnswerResolveUseCase.php
│   │   ├── ToggleForumTopicPinUseCase.php
│   │   ├── ToggleItemProgressUseCase.php
│   │   ├── UpdateCertificateTemplateUseCase.php
│   │   ├── UpdateChapterUseCase.php
│   │   ├── UpdateCourseCommentUseCase.php
│   │   ├── UpdateCourseFileUseCase.php
│   │   ├── UpdateCourseUseCase.php
│   │   ├── UpdateFaqUseCase.php
│   │   ├── UpdateLiveSessionUseCase.php
│   │   ├── UpdateSpecialOfferUseCase.php
│   │   ├── UpdateTextLessonUseCase.php
│   │   ├── UpdateTicketUseCase.php
│   │   ├── UpdateWatchProgressUseCase.php
│   │   ├── VerifyCertificateUseCase.php
│   │   └── Waitlist/
│   │       ├── ClearCourseWaitlistUseCase.php
│   │       ├── DeleteWaitlistEntryUseCase.php
│   │       ├── GetCourseWaitlistUseCase.php
│   │       ├── JoinCourseWaitlistUseCase.php
│   │       ├── LeaveCourseWaitlistUseCase.php
│   │       └── ToggleCourseWaitlistUseCase.php
│   ├── Listeners/
│   │   ├── CreateEnrollmentOnPaymentCompleted.php
│   │   └── GiftActivatedListener.php
│   └── Services/
│       ├── CalculateCoursePriceUseCase.php
│       └── CourseStatusMigrationService.php
├── Domain/TenantAdminDashboard/Course/
│   ├── Entities/
│   │   ├── AgoraHistoryEntity.php
│   │   ├── CertificateEntity.php
│   │   ├── CertificateTemplateEntity.php
│   │   ├── ChapterEntity.php
│   │   ├── ContentDeleteRequestEntity.php
│   │   ├── CourseCommentEntity.php
│   │   ├── CourseEntity.php
│   │   ├── CourseExtraDescriptionEntity.php
│   │   ├── CourseFileEntity.php
│   │   ├── CourseLearningEntity.php
│   │   ├── CourseLearningLastViewEntity.php
│   │   ├── CourseReportEntity.php
│   │   ├── CourseReviewEntity.php
│   │   ├── FaqEntity.php
│   │   ├── FeaturedCourseEntity.php
│   │   ├── FilterOptionEntity.php
│   │   ├── ForumAnswerEntity.php
│   │   ├── ForumTopicEntity.php
│   │   ├── GiftEntity.php
│   │   ├── LiveSessionEntity.php
│   │   ├── NoticeboardEntity.php
│   │   ├── PartnerTeacherEntity.php
│   │   ├── PrerequisiteEntity.php
│   │   ├── RelatedCourseEntity.php
│   │   ├── SessionReminderEntity.php
│   │   ├── TextLessonAttachmentEntity.php
│   │   ├── TextLessonEntity.php
│   │   ├── VideoWatchProgressEntity.php
│   │   └── WaitlistEntryEntity.php
│   ├── Events/
│   │   ├── CertificateIssuedEvent.php
│   │   ├── ChapterCreated.php
│   │   ├── ChapterDeleted.php
│   │   ├── ChapterUpdated.php
│   │   ├── ContentDeleteRequestStatusChanged.php
│   │   ├── ContentDeletionRequested.php
│   │   ├── CourseArchived.php
│   │   ├── CourseCommentApproved.php
│   │   ├── CourseCommentDeleted.php
│   │   ├── CourseCommentPosted.php
│   │   ├── CourseCompletedEvent.php
│   │   ├── CourseCreated.php
│   │   ├── CourseFileCreated.php
│   │   ├── CourseFileDeleted.php
│   │   ├── CourseFileUpdated.php
│   │   ├── CourseNoticeboardPosted.php
│   │   ├── CourseReported.php
│   │   ├── CourseStatusChanged.php
│   │   ├── CourseUpdated.php
│   │   ├── GiftActivated.php
│   │   ├── LiveSessionRescheduled.php
│   │   ├── StudentJoinedWaitlistEvent.php
│   │   ├── TextLessonAttachmentAdded.php
│   │   ├── TextLessonCreated.php
│   │   ├── TextLessonDeleted.php
│   │   ├── TextLessonUpdated.php
│   │   ├── VideoAttachedToLesson.php
│   │   ├── VideoDetachedFromLesson.php
│   │   ├── VideoLessonCompleted.php
│   │   └── WaitlistSlotAvailable.php
│   ├── Exceptions/
│   │   ├── CertificateIssuanceException.php
│   │   ├── CommentNotOwnedByUserException.php
│   │   ├── ContentDeleteRequestNotFoundException.php
│   │   ├── CourseCommentNotFoundException.php
│   │   ├── CourseNotFoundException.php
│   │   ├── CoursePublishRequirementsNotMetException.php
│   │   ├── CourseReportNotFoundException.php
│   │   ├── DuplicateCourseSlugException.php
│   │   ├── EnrollmentAlreadyActiveException.php
│   │   ├── InvalidContentDeleteRequestTransitionException.php
│   │   ├── InvalidCourseStatusTransitionException.php
│   │   ├── InvalidModerationStatusException.php
│   │   ├── InvalidVideoUrlException.php
│   │   └── VideoNotEnrolledException.php
│   ├── Repositories/
│   │   ├── AgoraHistoryRepositoryInterface.php
│   │   ├── CategoryRepositoryInterface.php
│   │   ├── CertificateRepositoryInterface.php
│   │   ├── CertificateTemplateRepositoryInterface.php
│   │   ├── ChapterContentQueryInterface.php
│   │   ├── ChapterRepositoryInterface.php
│   │   ├── ContentDeleteRequestQueryInterface.php
│   │   ├── ContentDeleteRequestRepositoryInterface.php
│   │   ├── CourseCommentRepositoryInterface.php
│   │   ├── CourseExtraDescriptionRepositoryInterface.php
│   │   ├── CourseFileRepositoryInterface.php
│   │   ├── CourseFilterOptionRepositoryInterface.php
│   │   ├── CourseIdempotencyRepositoryInterface.php
│   │   ├── CourseLearningRepositoryInterface.php
│   │   ├── CourseReportQueryInterface.php
│   │   ├── CourseReportRepositoryInterface.php
│   │   ├── CourseRepositoryInterface.php
│   │   ├── CourseReviewRepositoryInterface.php
│   │   ├── CourseStatisticsQueryInterface.php
│   │   ├── CourseStudentExportQueryInterface.php
│   │   ├── CourseTranslationRepositoryInterface.php
│   │   ├── FaqRepositoryInterface.php
│   │   ├── FeaturedCourseRepositoryInterface.php
│   │   ├── FilterOptionRepositoryInterface.php
│   │   ├── ForumRepositoryInterface.php
│   │   ├── GiftQueryInterface.php
│   │   ├── GiftRepositoryInterface.php
│   │   ├── LiveSessionRepositoryInterface.php
│   │   ├── NoticeboardRepositoryInterface.php
│   │   ├── PartnerTeacherRepositoryInterface.php
│   │   ├── PrerequisiteRepositoryInterface.php
│   │   ├── RelatedCourseRepositoryInterface.php
│   │   ├── SalesQueryInterface.php
│   │   ├── SessionReminderRepositoryInterface.php
│   │   ├── SubscriptionAccessQueryInterface.php
│   │   ├── TextLessonAttachmentRepositoryInterface.php
│   │   ├── TextLessonRepositoryInterface.php
│   │   ├── VideoWatchProgressRepositoryInterface.php
│   │   └── WaitlistRepositoryInterface.php
│   └── ValueObjects/
│       ├── AccessDuration.php
│       ├── AgoraSettings.php
│       ├── CertificateType.php
│       ├── ChapterProps.php
│       ├── ChapterStatus.php
│       ├── CommentStatus.php
│       ├── ContentDeleteRequestProps.php
│       ├── ContentDeleteRequestStatus.php
│       ├── ContentStatus.php
│       ├── CourseDiscount.php
│       ├── CourseDiscountType.php
│       ├── CourseFileProps.php
│       ├── CourseLearningLastViewProps.php
│       ├── CourseLearningProps.php
│       ├── CourseProps.php
│       ├── CourseReportProps.php
│       ├── CourseSlug.php
│       ├── CourseStatus.php
│       ├── CourseType.php
│       ├── DiscountCode.php
│       ├── DiscountType.php
│       ├── ExtraDescriptionType.php
│       ├── FileAccessibility.php
│       ├── FileSource.php
│       ├── FileType.php
│       ├── GiftItemType.php
│       ├── GiftStatus.php
│       ├── LearningProgressPercentage.php
│       ├── RatingCriteria.php
│       ├── SessionProvider.php
│       ├── SessionStreamType.php
│       ├── SocialPlatform.php
│       ├── TextLessonProps.php
│       ├── VideoDemoSource.php
│       ├── VideoSource.php
│       ├── VideoSourceType.php
│       └── VideoWatchProgressProps.php
├── Infrastructure/Persistence/TenantAdminDashboard/Course/
│   ├── CategoryRecord.php
│   ├── ChapterContentQuery.php
│   ├── ChapterRecord.php
│   ├── ChapterTranslationRecord.php
│   ├── ContentDeleteRequestRecord.php
│   ├── CourseCommentRecord.php
│   ├── CourseEnrollmentRecord.php
│   ├── CourseExtraDescriptionRecord.php
│   ├── CourseFileRecord.php
│   ├── CourseFilterOptionRecord.php
│   ├── CourseLearningLastViewRecord.php
│   ├── CourseLearningRecord.php
│   ├── CoursePartnerTeacherRecord.php
│   ├── CourseRecord.php
│   ├── CourseReportRecord.php
│   ├── CourseStatisticsQuery.php
│   ├── CourseTagRecord.php
│   ├── CourseTranslationRecord.php
│   ├── CourseWaitlistRecord.php
│   ├── DiscountCodeRecord.php
│   ├── EloquentCategoryRepository.php
│   ├── EloquentChapterRepository.php
│   ├── EloquentContentDeleteRequestRepository.php
│   ├── EloquentCourseCommentRepository.php
│   ├── EloquentCourseExtraDescriptionRepository.php
│   ├── EloquentCourseFileRepository.php
│   ├── EloquentCourseFilterOptionRepository.php
│   ├── EloquentCourseIdempotencyRepository.php
│   ├── EloquentCourseLearningRepository.php
│   ├── EloquentCourseReportRepository.php
│   ├── EloquentCourseRepository.php
│   ├── EloquentCourseStatisticsQuery.php
│   ├── EloquentCourseStudentExportQuery.php
│   ├── EloquentCourseTranslationRepository.php
│   ├── EloquentFaqRepository.php
│   ├── EloquentFeaturedCourseRepository.php
│   ├── EloquentFilterOptionRepository.php
│   ├── EloquentForumRepository.php
│   ├── EloquentListContentDeleteRequestsQuery.php
│   ├── EloquentListCourseReportsQuery.php
│   ├── EloquentNoticeboardRepository.php
│   ├── EloquentPartnerTeacherRepository.php
│   ├── EloquentRelatedCourseRepository.php
│   ├── EloquentTextLessonAttachmentRepository.php
│   ├── EloquentTextLessonRepository.php
│   ├── EloquentVideoWatchProgressRepository.php
│   ├── EloquentWaitlistRepository.php
│   ├── FaqRecord.php
│   ├── FeaturedCourseRecord.php
│   ├── FilterOptionRecord.php
│   ├── ForumAnswerRecord.php
│   ├── ForumTopicRecord.php
│   ├── NoticeboardReadRecord.php
│   ├── NoticeboardRecord.php
│   ├── PartnerTeacherRecord.php
│   ├── RelatedCourseRecord.php
│   ├── SpecialOfferRecord.php
│   ├── TextLessonAttachmentRecord.php
│   ├── TextLessonRecord.php
│   ├── TicketRecord.php
│   ├── TicketUserRecord.php
│   ├── VideoWatchProgressRecord.php
│   └── Queries/
│       ├── EloquentGiftQuery.php
│       ├── EloquentListCourseEnrollmentsQuery.php
│       ├── EloquentSalesQuery.php
│       └── EloquentSubscriptionAccessQuery.php
└── routes/tenant_dashboard/
    ├── course.php
    ├── course_operations.php
    └── course_review.php
```


---

## Appendix A — Access chain (authoritative)

**`CheckCourseAccessUseCase::execute` order:**

1. Direct course enrollment (active).
2. **Bundle** enrollment access (`BundleEnrollmentAccessInterface::hasAccessViaBundle`).
3. **Batch** enrollment access (`BatchEnrollmentAccessInterface::hasAccessViaBatch`).
4. **Subscription** access (`SubscriptionAccessQueryInterface::hasActiveSubscriptionAccess`).

---

## Appendix B — Prior domain notes (condensed)

- **Publish readiness** (moving to `published`): category, teacher, thumbnail, min description required — enforced in `CourseEntity::changeStatus()`.
- **`CalculateCoursePriceUseCase`**: loads course, applies special offer then ticket, with group eligibility when `userId` present; returns structured money/discount breakdown.
- **`CreateCourseUseCase`**: transaction, tenant quota lock, idempotency, slug uniqueness, audit OUTSIDE transaction, events after commit.
- **`DuplicateCourseUseCase`**: transaction, new slug, status forced to `draft`, deep copy, audit `course.duplicated`; no idempotency key protection.

---

> **Reminder:** This report is input for the Principal Engineer audit. Incomplete or inaccurate information here means the audit will miss real issues or flag false positives. When in doubt, check the actual code — do not guess.

*End of Report*
