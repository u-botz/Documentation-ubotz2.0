# UBOTZ 2 File Manager Feature Documentation

## 1. Scope
This document defines the tenant-side File Manager feature from the current backend implementation, including routing surface, core modules, and tenant-isolation expectations.

## 2. Business Objectives
- Enable tenant administrators to operate file manager workflows from the Tenant Admin Dashboard.
- Keep all records tenant-scoped and role/capability-protected.
- Provide stable APIs for frontend modules and reporting/status visibility.

## 3. Backend Implementation Footprint
- Application layer files: 16
- Domain layer files: 19
- Infrastructure persistence files: 4
- HTTP/controller files: 2

Primary module roots:
- backend/app/Application/TenantAdminDashboard/FileManager
- backend/app/Domain/TenantAdminDashboard/FileManager
- backend/app/Infrastructure/Persistence/TenantAdminDashboard/FileManager

## 4. API Surface (Tenant Dashboard)
Route definition files:
- backend/routes/tenant_dashboard/file_manager.php

Representative endpoints:
- Route::get('/browse', [FileManagerReadController::class, 'browse'])->middleware('tenant.capability:file.view');
- Route::get('/files/{id}', [FileManagerReadController::class, 'show'])->middleware('tenant.capability:file.view');
- Route::get('/files/{id}/download', [FileManagerReadController::class, 'download'])->middleware('tenant.capability:file.view');
- Route::get('/files/{id}/stream', [FileManagerReadController::class, 'stream'])->name('tenant.file-manager.stream');
- Route::post('/upload', [FileManagerWriteController::class, 'upload'])->middleware('tenant.capability:file.upload');
- Route::post('/files/{id}/rename', [FileManagerWriteController::class, 'renameFile'])->middleware('tenant.capability:file.manage');
- Route::post('/files/{id}/move', [FileManagerWriteController::class, 'moveFile'])->middleware('tenant.capability:file.manage');
- Route::delete('/files/{id}', [FileManagerWriteController::class, 'deleteFile'])->middleware('tenant.capability:file.manage');
- Route::post('/directories', [FileManagerWriteController::class, 'createDirectory'])->middleware('tenant.capability:file.create_directory');
- Route::delete('/directories/{id}', [FileManagerWriteController::class, 'deleteDirectory'])->middleware('tenant.capability:file.manage');

## 5. Security and Tenant Isolation Requirements
- All queries and mutations must execute inside resolved tenant context (TenantContext).
- Endpoints should enforce capability middleware where required (for example tenant.capability:*).
- Responses must not leak cross-tenant entities through joins, eager loads, or error payloads.
- Audit-sensitive actions (status changes, destructive updates, impersonation-type flows) should remain logged.

## 6. Frontend Contract Notes
- Frontend pages should treat empty datasets as a normal state, not an error state.
- Validation failures should surface backend field messages directly.
- Lifecycle/status values should be normalized at UI boundaries where legacy values exist.

## 7. Status Tracking Reference
- documentation/Tenant feature/status reports/FileManager_Status_Report.md

## 8. Next Documentation Steps
To match the Platform documentation standard, create alongside this file:
1. FileManager_business_findings.md
2. FileManager_technical_documentation.md
