# UBOTZ 2.0 File Manager Technical Specification

The **file manager** provides **per-user** tenant storage for **managed files** and **directories**, with upload, browse, rename, move, delete, download, and stream. It is separate from **`course_files`** (curriculum assets linked to courses/chapters) but can supply **paths** referenced elsewhere.

Application: `App\Application\TenantAdminDashboard\FileManager`; HTTP: `App\Http\Controllers\Api\TenantAdminDashboard\FileManager`.

---

## 1. HTTP surface

Routes: `backend/routes/tenant_dashboard/file_manager.php` → **`/api/tenant/file-manager`** (no `tenant.module` wrapper in this file — capabilities only).

| Method | Path | Capability |
|--------|------|------------|
| `GET` | `/browse` | `file.view` |
| `GET` | `/files/{id}` | `file.view` |
| `GET` | `/files/{id}/download` | `file.view` |
| `GET` | `/files/{id}/stream` | `file.view` |
| `POST` | `/upload` | `file.upload` |
| `POST` | `/files/{id}/rename` | `file.manage` |
| `POST` | `/files/{id}/move` | `file.manage` |
| `DELETE` | `/files/{id}` | `file.manage` |
| `POST` | `/directories` | `file.create_directory` |
| `DELETE` | `/directories/{id}` | `file.manage` |

**Browse** scopes **directories and files to the authenticated user** (`user_id` matches) — see `FileManagerReadController@browse`.

---

## 2. Schema — `managed_files`

Base: `2026_03_13_114712_create_managed_files_table.php`.

| Column | Role |
|--------|------|
| `tenant_id`, `user_id` | Ownership |
| `file_name`, `original_name`, `mime_type`, `size_bytes` | Metadata |
| `storage_disk` | e.g. `local`, `s3` |
| `storage_path` | Physical key |
| `directory_id` | Optional folder FK |

Additions: **`status`** (`2026_03_20_035101_add_status_to_managed_files_table.php`), **soft deletes** (`2026_03_20_035102_add_soft_deletes_to_managed_files_table.php`), **`file_upload_idempotency_keys`** (`2026_03_20_035104_create_file_upload_idempotency_keys_table.php`).

**Directories:** `managed_directories` (`2026_03_13_114705_create_managed_directories_table.php`, soft deletes).

---

## 3. Curriculum files (`course_files`)

Defined in `2026_03_05_000000_create_course_files_table.php` — **`course_id`**, **`chapter_id`**, **`file_path`**, **`file_source`**, **`file_type`**, **`accessibility`** (`free` vs paid-style gating in product), **`volume_mb`**, **`downloadable`**, **`sort_order`**, **`status`**. Video source columns added in later migrations. Managed via **course** APIs, not the file-manager browse tree.

---

## 4. Application use cases

- **`UploadFileUseCase`**, **`CreateDirectoryUseCase`**, **`RenameManagedFileUseCase`**, **`MoveManagedFileUseCase`**, **`DeleteManagedFileUseCase`**, **`DeleteDirectoryUseCase`**
- Queries: **`ListDirectoryContentsQuery`**, **`GetManagedFileQuery`**, **`GetFileDownloadUrlQuery`**

---

## 5. Security

- **Tenant + user** scoping on browse/list; **never** resolve files by id without tenant (and user) checks consistent with controllers.
- **Course content** access remains enforced via **enrollment** / **course** policies when serving lesson files — file manager paths are generic storage.

---

## 6. Linked code references

| Layer | Path |
|-------|------|
| Application | `backend/app/Application/TenantAdminDashboard/FileManager/` |
| HTTP | `backend/app/Http/Controllers/Api/TenantAdminDashboard/FileManager/` |
| Routes | `backend/routes/tenant_dashboard/file_manager.php` |

---

## 7. Document history

- Aligned with **`file_manager.php`** capabilities and **per-user** browse behavior.
- Clarified **`managed_files`** vs **`course_files`** (`volume_mb` applies to **course_files**, **`size_bytes`** to **managed_files**).
