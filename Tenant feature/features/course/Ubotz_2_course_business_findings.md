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
- **Learning Tracking**: The system maintains a per-student ledger of completed lessons and files (`course_learnings`), allowing students to resume their progress across multiple sessions.
- **Reviews & Feedback**: Students provide qualitative feedback and star ratings via `course_reviews`. These metrics are syndicated back to the `Landing Page` to build institutional social proof.

## Operational & Commercial Modalities

### 1. Monetization Strategy
- **Tuition & Pricing**: Courses support fixed-price enrollments with integration into the `Payment` and `Installment` engines.
- **Access Windows**: The `access_days` attribute enforces time-limited enrollment. Upon expiry, the student’s access to lessons and assessments is automatically revoked, driving subscription renewals.
- **Capacity Governance**: Hard ceilings on student count ensure that live-heavy or resource-intensive courses maintain a high quality of service.

### 2. Visibility & Marketing
- **Private vs. Public**: The `is_private` flag allows for corporate-only (B2B) courses that do not appear in the public catalog but remain accessible via direct enrollment links or administrative assignment.
- **Branding**: Every course supports SEO-optimized titles, meta-descriptions, and featured media to ensure maximum visibility in search engine results.

## Lifecycle Management
1. **Draft**: Content creation phase. The course is invisible to students while instructors upload videos and create assessments.
2. **Published**: The course becomes "Live". It appears on the institution's storefront and begins accepting enrollments via the `Payment` gateway.
3. **Archived**: (Legacy/Future) Historic courses where enrollments are closed, but existing student progress records are preserved for compliance.

---

## Linked References
- **Related Modules**: `Enrollment`, `Chapter`, `Payment`, `Exam-Hierarchy`, `Reward`.
- **Infrastructure**: `File-Manager` for asset hosting.
