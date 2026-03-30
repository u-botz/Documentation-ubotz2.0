# UBOTZ 2.0 File Manager Technical Specification

## Core Architecture
The File Manager handles the abstraction between the application and the physical storage layer (Local/S3). The logic resides within the `TenantAdminDashboard\FileManager` bounded context.

## Relational Schema Constraints

### 1. The Managed Repository (`managed_files`)
Used for generic tenant assets.
- **`storage_disk`**: Defaults to `local` or `s3`, allowing the tenant to shift between providers without logic changes.
- **`storage_path`**: The unique pointer to the physical file on the disk or Cloud Bucket.
- **`directory_id`**: Self-referential lookup for folder nesting logic.

### 2. The Curriculum Engine (`course_files`)
Tightly coupled to the academic footprint.
| Field | Technical Significance |
| :--- | :--- |
| `course_id` / `chapter_id` | Foreign-key bounds to the Course Management context. |
| `file_source` | Logic branch for resolving the URI (`upload` vs. `external`). |
| `volume_mb` | Used for quota calculations and front-end pre-fetch hints. |
| `sort_order` | Manages the display sequence within a course chapter view. |

## Key Technical Workflows

### File Upload & Persistence
1. `UploadFileUseCase` validates MIME types and file sizes.
2. The file is streamed to the `storage_disk`.
3. A `managed_files` record is created, and the unique `storage_path` is returned.
4. (Optional) For curriculum assets, a `course_files` bridge record is instantiated linking the file to a course.

### Secure Access (URL Generation)
- **Tokenized Access**: When a student requests a `paid` file, the `GetFileUrlUseCase` verifies the student's active enrollment.
- It then generates a temporary, time-limited S3 signed URL or serves the file through a protected Laravel route proxying the stream.

## Tenancy & Security
- **Multi-Tenancy**: Every query is strictly filtered by `tenant_id`. No scenario allows a user from Tenant A to guess the `storage_path` of an asset belonging to Tenant B.
- **Idempotency Keys**: `file_upload_idempotency_keys` table prevents duplicate S3 uploads during concurrent browser retry attempts.
- **Soft Deletions**: Enabled on high-value metadata to allow administrative rollbacks.

---

## Linked References
- Status report: `../../status reports/FileManager_Status_Report.md`
- Related Modules: `Course`, `Assignment`, `Student Billing`.
