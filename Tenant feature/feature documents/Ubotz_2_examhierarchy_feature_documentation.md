# UBOTZ 2 Exam Hierarchy Feature Documentation

## 1. Scope
This document defines the tenant-side Exam Hierarchy feature from the current backend implementation, including routing surface, core modules, and tenant-isolation expectations.

## 2. Business Objectives
- Enable tenant administrators to operate exam hierarchy workflows from the Tenant Admin Dashboard.
- Keep all records tenant-scoped and role/capability-protected.
- Provide stable APIs for frontend modules and reporting/status visibility.

## 3. Backend Implementation Footprint
- Application layer files: 9
- Domain layer files: 15
- Infrastructure persistence files: 9
- HTTP/controller files: 6

Primary module roots:
- backend/app/Application/TenantAdminDashboard/ExamHierarchy
- backend/app/Domain/TenantAdminDashboard/ExamHierarchy
- backend/app/Infrastructure/Persistence/TenantAdminDashboard/ExamHierarchy

## 4. API Surface (Tenant Dashboard)
Route definition files:
- backend/routes/tenant_dashboard/exam_hierarchy.php

Representative endpoints:
- Route::get('/exams', [ExamController::class, 'index'])
- Route::post('/exams', [ExamController::class, 'store'])
- Route::put('/exams/{exam_id}', [ExamController::class, 'update'])
- Route::delete('/exams/{exam_id}', [ExamController::class, 'destroy'])
- Route::get('/subjects', [\App\Http\TenantAdminDashboard\ExamHierarchy\Controllers\SubjectController::class, 'index'])
- Route::get('/chapters', [\App\Http\TenantAdminDashboard\ExamHierarchy\Controllers\ChapterController::class, 'index'])
- Route::get('/topics', [\App\Http\TenantAdminDashboard\ExamHierarchy\Controllers\TopicController::class, 'index'])

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
- documentation/Tenant feature/status reports/ExamHierarchy_Status_Report.md

## 8. Next Documentation Steps
To match the Platform documentation standard, create alongside this file:
1. ExamHierarchy_business_findings.md
2. ExamHierarchy_technical_documentation.md
