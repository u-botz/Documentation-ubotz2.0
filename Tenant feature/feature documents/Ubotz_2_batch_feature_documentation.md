# UBOTZ 2 Batch Feature Documentation

## 1. Scope
This document defines the tenant-side Batch feature from the current backend implementation, including routing surface, core modules, and tenant-isolation expectations.

## 2. Business Objectives
- Enable tenant administrators to operate batch workflows from the Tenant Admin Dashboard.
- Keep all records tenant-scoped and role/capability-protected.
- Provide stable APIs for frontend modules and reporting/status visibility.

## 3. Backend Implementation Footprint
- Application layer files: 15
- Domain layer files: 26
- Infrastructure persistence files: 9
- HTTP/controller files: 4

Primary module roots:
- backend/app/Application/TenantAdminDashboard/Batch
- backend/app/Domain/TenantAdminDashboard/Batch
- backend/app/Infrastructure/Persistence/TenantAdminDashboard/Batch

## 4. API Surface (Tenant Dashboard)
Route definition files:
- backend/routes/tenant_dashboard/batch.php

Representative endpoints:
- Route::get('/{batchId}/courses', [BatchCourseController::class, 'index'])
- Route::get('/{batchId}/faculty', [BatchFacultyController::class, 'index'])
- Route::post('/{batchId}/courses', [BatchCourseController::class, 'store'])
- Route::delete('/{batchId}/courses/{courseId}', [BatchCourseController::class, 'destroy'])
- Route::post('/{batchId}/faculty', [BatchFacultyController::class, 'store'])
- Route::delete('/{batchId}/faculty/{assignmentId}', [BatchFacultyController::class, 'destroy'])
- Route::get('/', [BatchReadController::class, 'index']);
- Route::get('/{id}', [BatchReadController::class, 'show'])->whereNumber('id');
- Route::post('/', [BatchWriteController::class, 'store'])
- Route::put('/{id}', [BatchWriteController::class, 'update'])

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
- documentation/Tenant feature/status reports/Batch_Status_Report.md

## 8. Next Documentation Steps
To match the Platform documentation standard, create alongside this file:
1. Batch_business_findings.md
2. Batch_technical_documentation.md
