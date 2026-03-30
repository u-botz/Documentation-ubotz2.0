# File Manager: Comprehensive Architectural & Implementation Report

## 1. Overview
The File Manager is a multi-tenant asset management system designed for the Tenant Admin Dashboard. While it implements a functional file/directory tree with storage integration, it currently contains several **critical architectural violations** that must be remediated to meet UBOTZ 2.0 standards.

---

## 2. Technical Architecture (DDD Layers)

| Layer | Component | Responsibility / Status |
| :--- | :--- | :--- |
| **HTTP** | `FileManagerReadController` | Handles browsing and file retrieval. |
| | `FileManagerWriteController` | Handles mutations (rename, move, delete, create dir). |
| | `FileManagerUploadController` | **[VIOLATION]** Non-standard split; should be merged into `FileManagerWriteController`. |
| **Application** | `UploadFileUseCase` | **[CRITICAL RISK]** Executes storage writes before DB persistence (Risk of orphaned files). |
| | `UseCases` | Missing `TenantAuditLogger` injection (Violates "Every Mutation Gets Logged" rule). |
| **Domain** | `FileManagerEntity` | **[VIOLATION]** Misnamed aggregate root for a single file. Should be `ManagedFileEntity`. |
| | `DirectoryEntity` | Aggregate root for a directory node. |
| | `FileStorageInterface` | Located in `App\Domain\Shared\Services\`. Correct placement for shared contracts. |
| **Infrastructure** | `ManagedFileRecord` | Eloquent model for files. |
| | `DirectoryRecord` | Eloquent model for directories (Includes `user_id` for isolation). |
| | `LaravelFileStorage` | Implementation of the shared interface using Laravel's Storage facade. |

---

## 3. Critical Security & Architectural Issues

### Type C: Security & Core Logic
*   **C1: User Isolation in Directories**: The `managed_directories` table **successfully includes** `user_id`, ensuring a baseline for user-level isolation. However, this must be strictly enforced at the RBAC layer.
*   **C2: Missing Capability Gating**: **[CRITICAL]** Routes in `file_manager.php` lack the `tenant.capability` middleware. Currently, any authenticated user (including students) can perform administrative file operations.
*   **C3: Missing Audit Logging**: **[CRITICAL]** UseCases do not inject or use `TenantAuditLogger`. Mutations are not being recorded in the platform's audit trail.

### Type S: Data & Security Risks
*   **S1: Path Traversal Defenses**: The `StoragePath` value object strictly blocks traversal by enforcing a `^[a-zA-Z0-9_-]+$` regex and explicitly rejecting `..` and `/`. While secure, stripping all other characters (like spaces or periods in directory names) may be overly restrictive for UX.
*   **S2: MIME Type Spoofing Risk**: The `FileUploadPolicy` validates MIME types. It is critical that the application layer passes the true MIME type (detected via PHP's `finfo_file` or Laravel's `$file->getMimeType()`) and **not** the client-provided `Content-Type` header, as a spoofed header could allow a renamed `.php` file to bypass the whitelist.
*   **S3: Insecure Download URLs**: **[CRITICAL]** `FileManagerReadController@download` verifies tenant and user permissions, but returns a direct public URL (`$this->fileStorage->url(...)`). If the storage is public, any leaked URL exposes the file globally without authentication. Downloads must use time-limited signed URLs or stream the file content directly through the authenticated controller.

### Type M: Maintainability & Resiliency Concerns
*   **M1: Domain Events Unwired from Audit Trail**: The system defines core domain events (`ManagedFileUploaded`, `ManagedFileRenamed`, `ManagedFileMoved`, `ManagedFileDeleted`, `DirectoryCreated`, `DirectoryDeleted`) in the `Events` directory. However, since the UseCases do not implement `TenantAuditLogger`, these events are effectively disconnected from the platform's required audit logging mechanisms.
*   **M2: Missing Upload Idempotency**: `UploadFileUseCase` does not require or utilize an idempotency key. Without this, a retried request from a client (due to network timeout) will create duplicate file entries and double-charge the tenant's storage quota.
*   **M3: Unbounded Recursive Directories**: The `DirectoryEntity` permits infinitely deep nesting (`parent_id`). There is no maximum depth constraint (e.g., 5-10 levels) enforced, creating a risk of recursion overflow and performance degradation on directory tree traversals.
*   **M4: File Size Schema**: *Verified Secure*. The `size_bytes` column in the `managed_files` migration correctly uses `unsignedBigInteger`. It is not vulnerable to integer overflow on large files (>2.1GB).
*   **M5: Permanent File Deletion**: `ManagedFileRecord` does not implement Laravel's `SoftDeletes` trait, and `DeleteManagedFileUseCase` performs a hard delete from the database and storage. Per platform principles ("No Irreversibility"), file deletion should be soft-deleted to allow recovery of educational resources.

### Type F: Future-Proofing & Enhancements (Non-Blocking)
*   **F1: Lack of Version Control Schema**: The `managed_files` table does not contain a `version` or `parent_file_id` column. If file auto-versioning and rollback are implemented in the future, it will require a complex schema migration and data backfill.
*   **F2: No External Link Support**: The schema relies solely on `storage_disk` and `storage_path`. To support YouTube, Vimeo, or Google Drive linking as specified in the Product Handbook, a `source_type` ENUM (e.g., `local`, `s3`, `external`) and a flexible `source_url` field should be introduced.
*   **F3: Missing Bulk Operations**: The current UseCases (`DeleteManagedFileUseCase`, `MoveManagedFileUseCase`) only accept a single `fileId`. Deleting or moving multiple files currently requires an inefficient $O(N)$ API calls from the client. The UseCase contracts should be refactored to accept collections of IDs for bulk operations.

### Type A: Domain & Design Patterns
*   **A1: Aggregate Boundary Confusion**: `FileManagerEntity` acts as an aggregate root for a single file, but its name suggests a god-entity. Standard patterns require `ManagedFileEntity` and `DirectoryEntity`, each independently enforcing invariants.
*   **A2: LaravelFileStorage Placement Ambiguity**: While correctly placed in Infrastructure, the domain's dependency is on the shared `FileStorageInterface.php` in `Domain/Shared/Services/`. Any deviation or duplication here violates the DDD contract.
*   **A3: Controller Pattern Breach**: The platform uses a **Read/Write split**. Splitting "Upload" into its own controller (`FileManagerUploadController`) breaks this pattern without architectural justification.
*   **A4: Flawed Upload Orchestration**: The current `Storage write` → `DB Persistence` sequence is high-risk. A DB failure leaves an orphaned file without a cleanup path.
    *   *Correction Reference*: Use a **Pending -> Active** state transition (DB record → Storage write → Update record).

---

## 4. Implementation Details

### Frontend (Next.js/React)
Located at `frontend/features/tenant-admin/file-manager`:
*   **`FileManagerBrowser.tsx`**: Main UI coordinator.
*   **`UploadDropzone`**: Client-side validation for quotas and MIME types.
*   **Storage Monitor**: Visual representation of tenant-level storage usage.

### Data Schema
#### `managed_files`
*   `tenant_id`, `user_id`, `original_name`, `storage_path`, `size_bytes`, `mime_type`.

#### `managed_directories`
*   `tenant_id`, `user_id`, `parent_id`, `name`, `path` (materialized path).

---

## 5. File Structure

### Backend (Laravel)
```text
app/
├── Http/Controllers/Api/TenantAdminDashboard/FileManager/
│   ├── FileManagerReadController.php
│   ├── FileManagerUploadController.php
│   └── FileManagerWriteController.php
├── Application/TenantAdminDashboard/FileManager/
│   ├── Commands/ (CreateDirectoryCommand, UploadFileCommand, etc.)
│   └── UseCases/
│       ├── CreateDirectoryUseCase.php
│       ├── DeleteDirectoryUseCase.php
│       ├── DeleteManagedFileUseCase.php
│       ├── MoveManagedFileUseCase.php
│       ├── RenameManagedFileUseCase.php
│       └── UploadFileUseCase.php
├── Domain/TenantAdminDashboard/FileManager/
│   ├── Entities/ (DirectoryEntity.php, FileManagerEntity.php)
│   ├── Events/ (ManagedFileUploaded.php, etc.)
│   ├── Exceptions/ (FileNotFoundException.php, etc.)
│   ├── Repositories/ (ManagedFileRepositoryInterface.php, etc.)
│   └── ValueObjects/ (ManagedFileProps.php, etc.)
├── Infrastructure/Persistence/TenantAdminDashboard/FileManager/
│   ├── DirectoryRecord.php
│   ├── ManagedFileRecord.php
│   ├── EloquentDirectoryRepository.php
│   └── EloquentManagedFileRepository.php
└── routes/tenant_dashboard/file_manager.php
```

### Frontend (Next.js/React)
```text
frontend/features/tenant-admin/file-manager/
├── components/
│   ├── CreateDirectoryModal.tsx
│   ├── FileManagerBrowser.tsx
│   ├── FileManagerToolbar.tsx
│   ├── FileGrid.tsx
│   ├── MoveFileModal.tsx
│   ├── RenameFileModal.tsx
│   └── UploadDropzone.tsx
├── hooks/
│   ├── use-file-manager.ts
│   ├── use-browse.ts
│   └── use-upload-file.ts
└── types/
    └── index.ts
```
