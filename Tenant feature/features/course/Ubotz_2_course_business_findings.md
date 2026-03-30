# UBOTZ 2.0 Course Business Findings

## Executive Summary
The `Course` module is the cornerstone of the Ubotz 2.0 pedagogical ecosystem. It serves as the primary revenue driver and the container for all educational content, including curricula, assessments, and certifications. Every interaction—from a landing page enquiry to a final certificate issuance—revolves around the lifecycle and configuration of the Course entity.

## Educational Taxonomy & Structure

### 1. Curriculum Hierarchy
Courses are organized into a logical, multi-tier structure to facilitate structured learning:
- **Chapters**: High-level modules or sections that group related educational material.
- **Lessons**: Granular content units which can be:
    - **Video Lessons**: Integrated with Vimeo or localized storage for on-demand streaming.
    - **Text Lessons**: HTML-based reading material and research notes.
    - **Course Files**: Downloadable PDF resources, datasets, or laboratory manuals.
- **Assessment Links**: Courses are mapped to `Exam Hierarchy` nodes, ensuring that quizzes and exams are contextually relevant to the subject matter.

### 2. Student Progress & Engagement
- **Learning Tracking**: The system maintains a per-student ledger of completed lessons and files (`course_learnings`), allowing students to resume their progress across multiple sessions. Last-view metadata supports resuming within a course.
- **Reviews & Feedback**: Students submit structured feedback via `course_reviews` (multi-axis scores such as content quality and instructor skills, plus an overall average and optional text). Moderation status controls what appears publicly. These metrics can feed landing-page and catalog experiences for social proof.

## Operational & Commercial Modalities

### 1. Monetization Strategy
- **Tuition & Pricing**: Courses support fixed-price enrollments with integration into payment, checkout, and installment flows (including bundle and batch contexts where applicable).
- **Access Windows**: The `access_days` attribute drives enrollment expiry (`expires_at`). Access checks also consider bundle, batch, and subscription-based entitlements in addition to direct enrollment.
- **Capacity Governance**: Course `capacity` can constrain enrollments in composite flows (e.g. bundles); exact rules depend on product configuration and the enrollment path.

### 2. Visibility & Marketing
- **Private vs. Public**: The `is_private` flag allows for corporate-only (B2B) courses that do not appear in the public catalog but remain accessible via direct enrollment links or administrative assignment.
- **Branding**: Every course supports SEO-optimized titles, meta-descriptions, and featured media to ensure maximum visibility in search engine results.

## Lifecycle Management
1. **Draft**: Content creation phase. The course is invisible to students while instructors upload videos and create assessments.
2. **Published**: The course becomes "Live". It appears on the institution's storefront and begins accepting enrollments via the `Payment` gateway.
3. **Archived**: (Legacy/Future) Historic courses where enrollments are closed, but existing student progress records are preserved for compliance.

---

## Linked References
- **Technical detail**: `Ubotz_2_course_technical_documentation.md` in this folder (API routes, schema, and implementation-aligned workflows).
- **Related Modules**: `Enrollment`, `Chapter`, `Payment`, `Exam-Hierarchy`, `Bundle`, `Batch`, `Subscription`, `Reward`.
- **Infrastructure**: File manager and storage for course media; tenant-scoped paths for uploads.
