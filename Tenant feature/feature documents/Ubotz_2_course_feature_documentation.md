# UBOTZ 2 Course Feature Documentation

## 1. Scope
This document defines the tenant-side Course feature from the current backend implementation, including routing surface, core modules, and tenant-isolation expectations.

## 2. Business Objectives
- Enable tenant administrators to operate course workflows from the Tenant Admin Dashboard.
- Keep all records tenant-scoped and role/capability-protected.
- Provide stable APIs for frontend modules and reporting/status visibility.

## 3. Backend Implementation Footprint
- Application layer files: 190
- Domain layer files: 154
- Infrastructure persistence files: 66
- HTTP/controller files: 63

Primary module roots:
- backend/app/Application/TenantAdminDashboard/Course
- backend/app/Domain/TenantAdminDashboard/Course
- backend/app/Infrastructure/Persistence/TenantAdminDashboard/Course

## 4. API Surface (Tenant Dashboard)
Route definition files:
- backend/routes/tenant_dashboard/course.php
- backend/routes/tenant_dashboard/course_operations.php
- backend/routes/tenant_dashboard/course_review.php
- backend/routes/tenant_dashboard/prerequisite.php
- backend/routes/tenant_dashboard/learning_progress.php
- backend/routes/tenant_dashboard/filter_options.php

Representative endpoints:
- Route::get('/', [CourseReadController::class, 'index']);
- Route::get('/stats', [CourseReadController::class, 'stats']);
- Route::get('/{id}', [CourseReadController::class, 'show']);
- Route::get('/{id}/statistics', [CourseReadController::class, 'statistics']);
- Route::get('/{id}/enrolled-student-ids', [CourseReadController::class, 'enrolledStudentIds']);
- Route::get('/{id}/export-students', [CourseReadController::class, 'exportStudents']);
- Route::get('/{courseId}/reports', [\App\Http\TenantAdminDashboard\Course\Controllers\CourseReportController::class, 'index']);
- Route::post('/', [CourseWriteController::class, 'store'])
- Route::put('/{id}', [CourseWriteController::class, 'update'])
- Route::patch('/{id}/status', [CourseWriteController::class, 'changeStatus'])

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
- documentation/Tenant feature/status reports/Course_Status_Report.md

## 8. Next Documentation Steps
To match the Platform documentation standard, create alongside this file:
1. Course_business_findings.md
2. Course_technical_documentation.md
