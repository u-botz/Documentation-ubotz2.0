# UBOTZ 2 File Manager Technical Documentation

## Backend Scope
- Application module: backend/app/Application/TenantAdminDashboard/FileManager
- Domain module: backend/app/Domain/TenantAdminDashboard/FileManager
- Infrastructure module: backend/app/Infrastructure/Persistence/TenantAdminDashboard/FileManager
- Route files:
  - backend/routes/tenant_dashboard/file_manager.php

## Footprint Summary
- Application files: 16
- Domain files: 19
- Infrastructure files: 4
- Endpoint declarations (route files sampled): 10

## Security and Authorization Notes
- Route::get('/browse', [FileManagerReadController::class, 'browse'])->middleware('tenant.capability:file.view');
- Route::get('/files/{id}', [FileManagerReadController::class, 'show'])->middleware('tenant.capability:file.view');
- Route::get('/files/{id}/download', [FileManagerReadController::class, 'download'])->middleware('tenant.capability:file.view');
- Route::post('/upload', [FileManagerWriteController::class, 'upload'])->middleware('tenant.capability:file.upload');
- Route::post('/files/{id}/rename', [FileManagerWriteController::class, 'renameFile'])->middleware('tenant.capability:file.manage');
- Route::post('/files/{id}/move', [FileManagerWriteController::class, 'moveFile'])->middleware('tenant.capability:file.manage');
- Route::delete('/files/{id}', [FileManagerWriteController::class, 'deleteFile'])->middleware('tenant.capability:file.manage');
- Route::post('/directories', [FileManagerWriteController::class, 'createDirectory'])->middleware('tenant.capability:file.create_directory');

## API and Contract Notes
- Keep request/response payloads stable and tenant-scoped.
- Return explicit validation errors for form-driven workflows.
- Use canonical status values in APIs; normalize legacy values at UI boundary if needed.

## Testing Recommendations
- Feature tests for tenant isolation (Tenant A cannot access Tenant B data).
- Policy tests for all privileged endpoints.
- Regression tests for list/read/create/update/delete/status-change operations.

## Linked References
- Status report: ../../status reports/FileManager_Status_Report.md
- Consolidated feature doc: ../../feature documents/Ubotz_2_filemanager_feature_documentation.md
