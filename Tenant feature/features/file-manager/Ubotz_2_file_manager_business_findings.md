# UBOTZ 2.0 File Manager Business Findings

## Executive Summary
The File Manager is the centralized asset repository for Ubotz 2.0 tenants. It acts as a digital cross-reference engine for educational materials (PDFs, Videos), marketing assets (Logos, Banners), and student submissions (Assignments). It provides a unified, secure, and structured interface for managing all binary data across the tenant ecosystem.

## Operational Modalities

### 1. Centralized vs. Contextual Storage
The system distinguishes between general administrative assets and curriculum-bound materials:
- **Managed Files (`managed_files`)**: General-purpose files (e.g., student profile pictures, receipt PDFs, tenant branding assets) authored by specific users.
- **Course Files (`course_files`)**: Instructional materials bound to specific **Courses** and **Chapters**. These files are the core educational deliverables students consume during their learning journey.

### 2. Media Rendering & Accessibility
- **`accessibility`**: Determines whether a file is `free` (publicly accessible) or `paid` (locked behind a Course Enrollment gate).
- **`downloadable`**: A business-level toggle allowing instructors to restrict students from locally saving high-value proprietary assets.
- **Streaming Support**: Through `file_source` (e.g., `upload` or `vimeo`/`youtube`), the system handles both local S3 storage and external video providers.

### 3. Hierarchical Organization
- **Directory Structure**: Using `directory_id`, the system allows admins to organize thousands of assets into logical folders, preventing "file clutter" in large enterprise deployments.

## Commercial Integration
- **Revenue Protection**: By mapping files to specific `course_id` entries and enforcing enrollment-based tokens, the system prevents unauthorized sharing of proprietary curriculum content.
- **Auditing**: `size_bytes` tracking allows the Platform Root to monitor storage quotas per tenant, ensuring billing accuracy for high-volume media usage.

---

## Linked References
- Status report: `../../status reports/FileManager_Status_Report.md`
- Related Modules: `Course`, `Assignment`, `Student Billing`.
