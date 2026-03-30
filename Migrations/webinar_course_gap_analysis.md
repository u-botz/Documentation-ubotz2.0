# Webinar → Course Migration Gap Analysis

Full inventory of Mentora's Webinar sub-features versus what Ubotz Course currently implements.

## Legend

| Symbol | Meaning |
|--------|---------|
| ✅ | Implemented in Ubotz |
| ❌ | Missing — needs implementation |
| ⚠️ | Partially implemented |

---

## 1. Core Course CRUD & Metadata

| Feature | Mentora | Ubotz | Gap? |
|---------|---------|-------|------|
| Create course (title, description, category) | ✅ | ✅ | — |
| Update course | ✅ | ✅ | — |
| Slug generation (auto from title) | ✅ (via `Sluggable`) | ✅ (`CourseSlug` VO) | — |
| Status lifecycle (draft → active → archived) | ✅ (`active/pending/is_draft/inactive`) | ✅ (`CourseStatus` VO with transitions) | — |
| Thumbnail & cover image | ✅ | ✅ | — |
| Price & organization price | ✅ | ✅ | — |
| Capacity (enrollment limit) | ✅ | ✅ | — |
| Access days (time-limited access) | ✅ | ✅ | — |
| Private/public toggle | ✅ | ✅ | — |
| Teacher assignment | ✅ | ✅ | — |
| Exam hierarchy (exam → subject → chapter → topic) | ✅ | ✅ | — |
| Category assignment | ✅ | ✅ | — |
| Tags | ✅ | ✅ (`course_tags` table) | — |
| Course type (webinar / course / text_lesson) | ✅ (3 types) | ✅ | — |
| Video demo (upload/youtube/vimeo/external) | ✅ | ✅ | — |
| SEO description (translatable) | ✅ | ⚠️ | ⚠️ Partially (seoDescription exists, translation pending) |
| Multi-language (Translatable) | ✅ (`title`, `description`, `seo_description`) | ✅ | — |
| Soft delete | ✅ | ✅ (`SoftDeletes`) | — |
| Course duplication | ✅ (`duplicate()`) | ✅ (`DuplicateCourseUseCase`) | — |

---

## 2. Content Structure — Chapters

Mentora organizes course content into **chapters** (`webinar_chapters`), each containing files, sessions, text lessons, assignments, and quizzes in a defined order via `WebinarChapterItem`.

| Feature | Mentora | Ubotz | Gap? |
|---------|---------|-------|------|
| `webinar_chapters` table | ✅ | ✅ | — |
| Chapter CRUD (title, type, status, ordering) | ✅ | ✅ | — |
| Chapter items ordering (`WebinarChapterItem`) | ✅ (polymorphic ordering) | ⚠️ | ⚠️ Ordering logic refinement |
| Chapter duration calculation | ✅ | ✅ | — |
| Chapter topic count | ✅ | ✅ | — |
| Translatable chapter titles | ✅ | ✅ | — |

---

## 3. Content Type: Files (Downloadable Content)

Each course can have downloadable/viewable files of various types and from multiple sources.

| Feature | Mentora | Ubotz | Gap? |
|---------|---------|-------|------|
| [files](file:///C:/Users/sayan/lms/Ubotz_2.0/mentora_production/app/Models/WebinarChapter.php#44-48) table | ✅ | ✅ | — |
| File types (pdf, powerpoint, sound, video, image, archive, document, project) | ✅ | ✅ | — |
| File sources (upload, youtube, vimeo, external_link, google_drive, iframe, s3, secure_host) | ✅ | ✅ | — |
| File accessibility (free / paid) | ✅ | ✅ | — |
| File status (active / inactive) | ✅ | ✅ | — |
| Downloadable flag | ✅ | ✅ | — |
| File volume tracking | ✅ | ✅ | — |
| Learning status per file | ✅ | ✅ | — |
| Personal notes on files | ✅ | ✅ | — |

---

## 4. Content Type: Live Sessions

Mentora supports live sessions with multiple video conferencing integrations.

| Feature | Mentora | Ubotz | Gap? |
|---------|---------|-------|------|
| [sessions](file:///C:/Users/sayan/lms/Ubotz_2.0/mentora_production/app/Models/WebinarChapter.php#39-43) table | ✅ | ✅ | — |
| Session APIs (local, BigBlueButton, Zoom, Agora) | ✅ | ✅ | — *(migrated: `SessionProviderFactory`, Agora/Zoom/BBB/Local providers)* |
| Session scheduling (date, duration) | ✅ | ✅ | — |
| Join link generation per API | ✅ | ✅ | — *(migrated: `GenerateJoinLinkUseCase`, all providers)* |
| Session reminders | ✅ | ✅ | — *(migrated: `SessionReminderEntity`, `AddSessionReminderUseCase`)* |
| Agora start / end / toggle-join controls | ✅ | ✅ | — *(migrated: `AgoraSessionUseCase` with lifecycle management)* |
| Agora settings (chat, record, users_join) | ✅ | ✅ | — *(migrated: `AgoraSettings` Value Object)* |
| Agora history tracking | ✅ | ✅ | — *(migrated: `AgoraHistoryEntity`)* |
| Session finished detection | ✅ | ✅ | — *(migrated: status field on `LiveSessionEntity`)* |
| Stream type (single / multiple) | ✅ | ✅ | — *(migrated: `SessionStreamType` VO)* |
| Add to Google Calendar integration | ✅ | ❌ | ❌ *(out of scope — 3rd party OAuth)* |
| Learning status per session | ✅ | ⚠️ | ⚠️ Infrastructure ready |

---

## 5. Content Type: Text Lessons

Rich text content with attachments and study time tracking.

| Feature | Mentora | Ubotz | Gap? |
|---------|---------|-------|------|
| `text_lessons` table | ✅ | ✅ | — |
| Title, summary, content (translatable) | ✅ | ✅ | — |
| Study time tracking | ✅ | ✅ | — |
| Attachments (`text_lesson_attachments`) | ✅ | ✅ | — |
| Learning status per text lesson | ✅ | ✅ | — |

---

## 6. Content Type: Assignments

Graded student submissions with deadlines, file attachments, and instructor review.

| Feature | Mentora | Ubotz | Gap? |
|---------|---------|-------|------|
| `webinar_assignments` table | ✅ | ✅ | — |
| Assignment CRUD (title, description, deadline) | ✅ | ✅ | — |
| Assignment attachments | ✅ | ✅ | — |
| Student submission history (`WebinarAssignmentHistory`) | ✅ | ✅ | — |
| Submission messages (`WebinarAssignmentHistoryMessage`) | ✅ | ✅ | — |
| Grading (pass/fail status) | ✅ | ✅ | — |
| Deadline calculation from purchase date | ✅ | ✅ | — |
| Instructor assignment histories | ✅ | ✅ | — |

---

## 7. Learning Progress Tracking

Mentora tracks per-user progress across all content types.

| Feature | Mentora | Ubotz | Gap? |
|---------|---------|-------|------|
| `course_learnings` table | ✅ | ✅ | — |
| Per-file completion status | ✅ | ✅ | — |
| Per-session completion status | ✅ | ⚠️ | ⚠️ (Infrastructure ready) |
| Per-text-lesson completion status | ✅ | ✅ | — |
| Per-assignment pass/fail tracking | ✅ | ✅ | — |
| Per-quiz pass/fail tracking | ✅ | ✅ | — |
| Overall progress % calculation | ✅ (`getProgress()`) | ✅ (`GetCourseProgressUseCase`) | — |
| Progress-based rewards (100% completion) | ✅ | ✅ | — |
| Learning page last view | ✅ (`CourseLearningLastView`) | ✅ (`RecordLastViewUseCase`) | — |
| Personal notes (polymorphic on content items) | ✅ (`CoursePersonalNote`) | ✅ | — |

---

## 8. Enrollment & Purchase System

| Feature | Mentora | Ubotz | Gap? |
|---------|---------|-------|------|
| Sale-based enrollment ([Sale](file:///C:/Users/sayan/lms/Ubotz_2.0/mentora_production/app/Models/WebinarAssignment.php#91-150) model) | ✅ | ✅ | — |
| `checkUserHasBought()` (complex ownership check) | ✅ | ✅ (`CheckCourseAccessUseCase`) | — |
| Free enrollment vs paid | ✅ | ✅ (Paid & Free implemented) | — |
| Subscription-based access | ✅ | ✅ (`SubscriptionAccessQuery`) | — |
| Bundle-based access (`BundleWebinar`) | ✅ | ✅ (`CheckBundleAccessUseCase`) | — |
| Gift-based access | ✅ | ✅ | — *(migrated: `GiftEntity`, `CreateGiftUseCase`, `ActivateGiftUseCase`)* |
| Installment payment access | ✅ | ✅ (`CreateInstallmentOrderUseCase`) | — |
| Access expiration (via `access_days`) | ✅ | ✅ (`AccessDuration` logic) | — |
| Waitlist system | ✅ (`Waitlist` model) | ✅ | — |
| Invoice generation | ✅ | ✅ | — |
| Export students list (Excel) | ✅ | ✅ | — |
| Student IDs aggregation | ✅ | ✅ | — |

---

## 9. Pricing & Discounts

| Feature | Mentora | Ubotz | Gap? |
|---------|---------|-------|------|
| Base price | ✅ | ✅ | — |
| Organization-specific pricing | ✅ (`organization_price`) | ✅ | — |
| Ticket discounts (`Ticket` model) | ✅ | ✅ | — |
| Special offers (time-limited % discount) | ✅ (`SpecialOffer`) | ✅ | — |
| User group discounts | ✅ | ✅ | — |
| Best ticket calculation | ✅ (`bestTicket()`) | ✅ (`CalculateCoursePriceUseCase`) | — |
| Discount percentage calculation | ✅ | ✅ | — |

---

## 10. Reviews & Ratings

| Feature | Mentora | Ubotz | Gap? |
|---------|---------|-------|------|
| `webinar_reviews` table | ✅ | ✅ | — |
| Star ratings (1-5) | ✅ | ✅ | — |
| Average rate calculation | ✅ (`getRate()`) | ✅ | — |
| Review comments thread | ✅ | ✅ | — |
| Review approval workflow (active status) | ✅ | ✅ | — |

---

## 11. Prerequisites

| Feature | Mentora | Ubotz | Gap? |
|---------|---------|-------|------|
| `prerequisites` table | ✅ | ✅ | — |
| Prerequisite course linking | ✅ | ✅ | — |
| Pre-check before enrollment | ✅ | ✅ (`CheckPrerequisitesUseCase`) | — |

---

## 12. Certificates

| Feature | Mentora | Ubotz | Gap? |
|---------|---------|-------|------|
| Course completion certificate | ✅ (`makeCertificateForUser()`) | ✅ | — |
| Auto-generation on 100% progress | ✅ | ✅ | — |
| Quiz-based certificates | ✅ | ✅ | — |
| Certificate templates | ✅ (`CertificateTemplate`) | ✅ | — |
| Certificate rewards (points) | ✅ | ✅ | — |

---

## 13. Collaboration Features

| Feature | Mentora | Ubotz | Gap? |
|---------|---------|-------|------|
| Partner teachers (`WebinarPartnerTeacher`) | ✅ | ✅ | — |
| Course forum (`CourseForum`, `CourseForumAnswer`) | ✅ | ✅ | — |
| Course noticeboard (`CourseNoticeboard`) | ✅ | ✅ | — |
| Comments system | ✅ | ✅ | — |
| Course reports (`WebinarReport`) | ✅ | ✅ (`CourseReportEntity`) | — |

---

## 14. Additional Features

| Feature | Mentora | Ubotz | Gap? |
|---------|---------|-------|------|
| FAQs per course | ✅ | ✅ | — |
| Extra descriptions (`WebinarExtraDescription`) | ✅ | ✅ | — |
| Filter options per course (`WebinarFilterOption`) | ✅ | ✅ | — |
| Related courses (polymorphic) | ✅ | ✅ | — |
| Featured courses (`FeatureWebinar`) | ✅ | ✅ | — |
| Social sharing links | ✅ | ✅ | — |
| Notifications to enrolled students | ✅ | ✅ | — |
| Statistics dashboard | ✅ (`WebinarStatisticController`) | ✅ (`GetCourseStatisticsUseCase`) | — |
| Content deletion requests | ✅ (`ContentDeleteRequest`) | ✅ (`ContentDeleteRequestEntity`) | — |

---

## Summary: What Ubotz Currently Has vs What's Missing

### ✅ Already Implemented (Core Shell & Interaction)
- Course CRUD with DDD architecture (Entity, VO, Use Cases, Repository)
- Status transitions (`draft` → `active` → `archived`) with business rules
- Listing with filters (status, category, teacher, search, pagination)
- Thumbnail & cover image paths
- Tags system (`course_tags`)
- Exam hierarchy linking
- Capacity & access days fields
- Soft deletes
- Multi-tenancy isolation (`BelongsToTenant`)
- API Resources for serialization
- **Chapter System** (CRUD, tenant isolation, repository logic)
- **File Content** (Upload, Youtube, Vimeo, S3 support, CRUD, volume tracking)
- **Text Lessons** (Rich text content, study time tracking, tenant isolation)
- **Assignments** (Full student submission, messaging, and grading system)
- **Course Reviews** (Granular ratings, moderation workflow, average calculation)
- **Live Sessions** — Full integration: Multi-provider (Agora, Zoom, BigBlueButton, Local), join link generation per provider, Agora lifecycle controls (start/end/toggle), `AgoraSettings` VO, session reminders, history tracking, stream type VO
- **Gift Access System** — Full `GiftEntity` + `CreateGiftUseCase` + `ActivateGiftUseCase`; gift code generation, status lifecycle (pending/active/failed), scheduled delivery
- **Learning Progress** (Per-item tracking, overall %, last view record)
- **Enrollment System** (Course access check, free enrollment, paid enrollment, access duration logic)
- **Payment Bounded Context** (Initialize checkout, process webhooks, transaction tracking)
- **Prerequisites** (Course dependency chain with hard enforcement)
- **Certificates** (DDD-based generation using DomPDF, template management)
- **Pricing & Discounts** (Multiplicative stacking of tickets and special offers, Org pricing)
- **Feature Consolidation** (Enrollment, Learning Progress, Usage, and Payment moved to `TenantAdminDashboard`)
- **Course Type Classification** (Webinar, Course, Text Lesson VO + migration)
- **Content Attachments & Notes** (Text Lesson Attachments, Personal Notes)
- **Course Content Interaction** (FAQs, Forum, Noticeboard, Course Reports, Content Deletion Requests)
- **Course Discovery** (Featured Courses, Related Courses, Video Demos)
- **Instructor Productivity** (Course Duplication, Partner Teachers, Statistics Dashboard)
- **Advanced Metadata** (Extra Descriptions, SEO Description, Filter Options)

### ✅ Recently Completed (This Migration Wave)

| Feature Area | Status | Details |
|---|---|---|
| **Live Session Integrations** | ✅ Done | Agora, Zoom, BigBlueButton, Local; join links, Agora lifecycle, reminders, history, stream types |
| **Gift Access System** | ✅ Done | Gift entity, create/activate use cases, gift code generation, scheduled delivery |
| **Quiz Feature Tests** | ✅ Done | Comprehensive `QuizFeatureTest.php` — 20 tests covering duplication, reordering, CBT, auth, tenant isolation |
| **P2 Features (Social/Waitlist)** | ✅ Done | Social sharing links, Waitlist system, and Notifications to enrolled students |
| **P3 Features (Admin/Ops)** | ✅ Done | Student Export, Invoice Generation, Comments, i18n/Translations, User Group Discounts, Rewards |

### ❌ Remaining Missing Feature Areas (Prioritized)

| Priority | Feature Area | Complexity | Notes |
|----------|-------------|------------|-------|
| **P1** | **Google Calendar Sync** | Medium | OAuth-based add-to-calendar for sessions |

> [!IMPORTANT]
> **P0** (Chapters, Files, Text Lessons, Assignments, Learning Progress, Enrollment, Payments), **P1** (Live Session Integrations, Gift Access System), and **P2** (Social Sharing, Waitlist, Notifications) are now fully implemented. Focus should shift to Google Calendar sync and the remaining P3 gaps.

> [!NOTE]
> The **Enrollment**, **Learning Progress**, **Usage**, and **Payment** domains have been consolidated into the `TenantAdminDashboard` namespace to align with the platform's multi-tenant architecture.
