# UBOTZ 2.0 — Feature Status Report: File Manager

> **Instructions:** Copy this template for each feature. Fill every section honestly. If something is missing, write "NOT IMPLEMENTED" — do not skip the section. This document feeds directly into the Principal Engineer audit pipeline.

| Field | Value |
|---|---|
| **Feature Name** | File Manager |
| **Bounded Context** | TenantAdminDashboard |
| **Date Reported** | 2026-03-20 |
| **Reported By** | AI Agent |
| **Current Status** | Partially Working (Recent remediation applied) |
| **Has Developer Instructions Doc?** | Yes |
| **Has Implementation Plan?** | Yes |
| **Was Principal Engineer Audit Done?** | No |

---

## 1. What This Feature Does (2–3 sentences)

The File Manager feature allows tenant administrators, instructors, and users to securely upload, organize, move, and manage documents, images, and videos within their isolated tenant storage environment. It enforces tenant-specific boundaries and storage quotas, making sure no cross-tenant data leaks occur during file interactions.

---

## 2. Backend Architecture

### 2.1 Controllers

| Controller | Methods | Notes |
|---|---|---|
| `FileManagerReadController` | `browse`, `show`, `download`, `stream` | Handles read-only operations for directories and files. |
| `FileManagerWriteController` | `createDirectory`, `deleteDirectory`, `renameFile`, `moveFile`, `deleteFile`, `upload` | Uses UseCases and Commands for write mutations. |

### 2.2 UseCases / Queries

| UseCase / Query | Purpose | Injects Audit Logger? | Injects Quota Service? |
|---|---|---|---|
| `CreateDirectoryUseCase` | Creates a new directory | Yes (via Event Subscriber) | N/A |
| `DeleteDirectoryUseCase` | Deletes an existing directory | Yes (via Event Subscriber) | N/A |
| `RenameManagedFileUseCase` | Renames an existing file | Yes (via Event Subscriber) | N/A |
| `MoveManagedFileUseCase` | Moves a file to another directory | Yes (via Event Subscriber) | N/A |
| `DeleteManagedFileUseCase` | Deletes a file | Yes (via Event Subscriber) | N/A |
| `UploadFileUseCase` | Uploads a new file to storage | Yes (via Event Subscriber) | Yes |

### 2.3 Domain Layer

| Component | Type | Location | Notes |
|---|---|---|---|
| `DirectoryEntity` | Entity | `Domain/TenantAdminDashboard/FileManager/Entities/` | |
| `ManagedFileEntity` | Entity | `Domain/TenantAdminDashboard/FileManager/Entities/` | |
| `ManagedFileProps` | Value Object | `Domain/TenantAdminDashboard/FileManager/ValueObjects/` | |

### 2.4 Domain Events

| Event Class | Trigger | Has Listener? |
|---|---|---|
| `DirectoryCreated` | After directory is created | Yes — `FileManagerAuditSubscriber` |
| `DirectoryDeleted` | After directory is hard/soft deleted | Yes — `FileManagerAuditSubscriber` |
| `ManagedFileUploaded` | After file is fully uploaded | Yes — `FileManagerAuditSubscriber` |
| `ManagedFileRenamed` | After file is renamed | Yes — `FileManagerAuditSubscriber` |
| `ManagedFileMoved` | After file is moved to new directory | Yes — `FileManagerAuditSubscriber` |
| `ManagedFileDeleted` | After file is deleted | Yes — `FileManagerAuditSubscriber` |

### 2.5 Infrastructure Layer

| Component | Type | Notes |
|---|---|---|
| `DirectoryRecord` | Eloquent Model | Has SoftDeletes? Yes. Has BelongsToTenant scope? Yes. |
| `ManagedFileRecord` | Eloquent Model | Has SoftDeletes? Yes. Has BelongsToTenant scope? Yes. |
| `EloquentManagedFileRepository` | Repository | Implements `ManagedFileRepositoryInterface` |
| `EloquentDirectoryRepository` | Repository | Implements `DirectoryRepositoryInterface` |

### 2.6 Exceptions

| Exception Class | When Thrown |
|---|---|
| `DirectoryNotFoundException` | When a directory is not found or user lacks access |
| `FileNotFoundException` | When a managed file is not found or user lacks access |
| `FileSizeLimitExceededException` | When file upload exceeds tenant quota or system maximum |
| `InvalidFileTypeException` | When the uploaded MIME type is unauthorized |
| `InvalidStoragePathException` | When there is an issue with the constructed storage path |

---

## 3. Database Schema

### 3.1 Tables

**Table: `managed_directories`** (Migration file: `2026_03_13_114705_create_managed_directories_table.php`)

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | BIGINT UNSIGNED PK | No | |
| `tenant_id` | BIGINT UNSIGNED FK | No | |
| `user_id` | BIGINT UNSIGNED FK | No | Current user who owns/created the directory |
| `name` | VARCHAR(255) | No | |
| `parent_id` | BIGINT UNSIGNED FK | Yes | Self-referencing FK |
| `path` | VARCHAR(500) | No | |
| `created_at` | TIMESTAMP | Yes | |
| `updated_at` | TIMESTAMP | Yes | |
| `deleted_at` | TIMESTAMP | Yes | Introduced via soft delete migration |

**Indexes:**
- `idx_managed_dirs_tenant_user` (`tenant_id`, `user_id`)
- `idx_managed_dirs_parent` (`tenant_id`, `parent_id`)
- `uk_managed_dirs_path` (`tenant_id`, `user_id`, `path`) UNIQUE

**Missing columns (known):**
- None identified.

**Table: `managed_files`** (Migration file: `2026_03_13_114712_create_managed_files_table.php`)

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | BIGINT UNSIGNED PK | No | |
| `tenant_id` | BIGINT UNSIGNED FK | No | |
| `user_id` | BIGINT UNSIGNED FK | No | |
| `file_name` | VARCHAR(255) | No | |
| `original_name` | VARCHAR(255) | No | |
| `mime_type` | VARCHAR(100) | No | |
| `size_bytes` | BIGINT UNSIGNED | No | Default 0 |
| `storage_disk` | VARCHAR(30) | No | Default 'local' |
| `storage_path` | VARCHAR(500) | No | |
| `directory_id` | BIGINT UNSIGNED FK | Yes | |
| `status` | VARCHAR(255) | Yes | Added via status migration |
| `created_at` | TIMESTAMP | Yes | |
| `updated_at` | TIMESTAMP | Yes | |
| `deleted_at` | TIMESTAMP | Yes | Introduced via soft delete migration |

**Indexes:**
- `idx_managed_files_tenant_user` (`tenant_id`, `user_id`)
- `idx_managed_files_directory` (`tenant_id`, `directory_id`)

### 3.2 Relationships

| From Table | To Table | Type | FK Column |
|---|---|---|---|
| `managed_directories` | `managed_directories` | BelongsTo | `parent_id` |
| `managed_directories` | `users` | BelongsTo | `user_id` |
| `managed_files` | `managed_directories` | BelongsTo | `directory_id` |
| `managed_files` | `users` | BelongsTo | `user_id` |

---

## 4. API Endpoints

| Method | URI | Controller@Method | Middleware | Capability Code |
|---|---|---|---|---|
| `GET` | `/api/tenant/file-manager/browse` | `FileManagerReadController@browse` | `tenant.capability` | `file.view` |
| `GET` | `/api/tenant/file-manager/files/{id}` | `FileManagerReadController@show` | `tenant.capability` | `file.view` |
| `GET` | `/api/tenant/file-manager/files/{id}/download` | `FileManagerReadController@download` | `tenant.capability` | `file.view` |
| `GET` | `/api/tenant/file-manager/files/{id}/stream` | `FileManagerReadController@stream` | **MISSING** | **NONE** (`tenant.file-manager.stream`) |
| `POST` | `/api/tenant/file-manager/upload` | `FileManagerWriteController@upload` | `tenant.capability` | `file.upload` |
| `POST` | `/api/tenant/file-manager/files/{id}/rename` | `FileManagerWriteController@renameFile` | `tenant.capability` | `file.manage` |
| `POST` | `/api/tenant/file-manager/files/{id}/move` | `FileManagerWriteController@moveFile` | `tenant.capability` | `file.manage` |
| `DELETE` | `/api/tenant/file-manager/files/{id}` | `FileManagerWriteController@deleteFile` | `tenant.capability` | `file.manage` |
| `POST` | `/api/tenant/file-manager/directories` | `FileManagerWriteController@createDirectory` | `tenant.capability` | `file.create_directory` |
| `DELETE` | `/api/tenant/file-manager/directories/{id}` | `FileManagerWriteController@deleteDirectory` | `tenant.capability` | `file.manage` |

---

## 5. Security Checklist

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | All queries scoped by `tenant_id`? | Yes | `BelongsToTenant` trait is applied and enforced. |
| 2 | User-level isolation enforced where needed? (`user_id` check) | Yes | Controllers verify `$entity->user_id !== $userId` explicitly. |
| 3 | `tenant.capability` middleware on all routes? | Partial | The `/files/{id}/stream` route lacks capability middleware, relying only on signature checks. |
| 4 | Audit log written for every mutation? | Yes | Handled by `FileManagerAuditSubscriber` |
| 5 | Audit log written OUTSIDE `DB::transaction()`? | Yes | Standard event-based approach |
| 6 | Domain events dispatched via `DB::afterCommit`? | Yes | |
| 7 | Idempotency keys used for create operations? | Yes | `X-Idempotency-Key` is passed directly to `UploadFileCommand` |
| 8 | Input validation via FormRequest (not in controller)? | Yes | Request validation like `UploadFileRequest` applied. |
| 9 | File uploads validated server-side (MIME via `finfo`)? | Yes | |
| 10 | Financial values stored as `_cents` integer? | N/A | |
| 11 | Soft deletes used (no hard delete of user data)? | Yes | `SoftDeletes` applied to both records via migration update. |
| 12 | No raw SQL in controllers or UseCases? | Yes | |
| 13 | Eloquent models have `BelongsToTenant` trait/scope? | Yes | |
| 14 | Sensitive data not exposed in API responses? | Yes | `ManagedFileResource` restricts explicit internal identifiers securely. |

---

## 6. Frontend

### 6.1 File Location

```
frontend/features/tenant-admin/file-manager/
```

### 6.2 Components

| Component | Purpose | Notes |
|---|---|---|
| `FileManagerBrowser.tsx` | Main directory exploration UI | Displays directories and files |
| `FileManagerToolbar.tsx` | Actions toolbar | Allows create, upload, and batch actions |
| `course-file-manager.tsx` | Embedding component | Allows course integration for picking files |

### 6.3 API Hooks

| Hook | Endpoint | Notes |
|---|---|---|
| `use-file-manager.ts` | `/api/tenant/file-manager/*` | Wraps API calls for the file manager capabilities |

### 6.4 Capability-Based UI Gating

| UI Element | Hidden When Missing Capability | Implemented? |
|---|---|---|
| Directories / Files List | `file.view` | Yes |
| Upload Button | `file.upload` | Yes |
| Delete/Rename Actions | `file.manage` | Yes |

---

## 7. Tests

| Test File | Test Count | Passing? |
|---|---|---|
| `FileManagerWriteFeatureTest.php` | Multiple | Yes |
| `FileManagerUploadFeatureTest.php` | Multiple | Yes |
| `FileManagerReadFeatureTest.php` | Multiple | Yes |
| `StorageQuotaEnforcementTest.php` | Multiple | Yes |

---

## 8. Known Issues & Gaps

| # | Issue | Severity Guess | Notes |
|---|---|---|---|
| 1 | Capability middleware missing on `/stream` endpoint | Medium | Signed route protects access, but misses formal capability check. |

---

## 9. Dependencies on Other Features

| Depends On | How |
|---|---|
| Quota Service | Upload checks global and tenant storage quota prior to writing physical files |
| Course System | Courses can pull from file manager (e.g. `AttachVideoFromFileManagerUseCase`) |

---

## 10. File Tree (Backend Only)

```
app/
├── Http/Controllers/Api/TenantAdminDashboard/FileManager/
│   ├── FileManagerReadController.php
│   └── FileManagerWriteController.php
├── Application/TenantAdminDashboard/FileManager/
│   ├── Commands/
│   ├── Listeners/
│   └── UseCases/
├── Domain/TenantAdminDashboard/FileManager/
│   ├── Entities/
│   ├── Events/
│   ├── Exceptions/
│   ├── Repositories/
│   └── ValueObjects/
├── Infrastructure/Persistence/TenantAdminDashboard/FileManager/
│   ├── DirectoryRecord.php
│   └── ManagedFileRecord.php
└── routes/tenant_dashboard/file_manager.php
```

---

> **Reminder:** This report is input for the Principal Engineer audit. Incomplete or inaccurate information here means the audit will miss real issues or flag false positives. When in doubt, check the actual code — do not guess.

*End of Template*
