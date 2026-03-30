# UBOTZ 2 Enrollment Feature Documentation

## 1. Scope
This document defines the tenant-side Enrollment feature from the current backend implementation, including routing surface, core modules, and tenant-isolation expectations.

## 2. Business Objectives
- Enable tenant administrators to operate enrollment workflows from the Tenant Admin Dashboard.
- Keep all records tenant-scoped and role/capability-protected.
- Provide stable APIs for frontend modules and reporting/status visibility.

## 3. Backend Implementation Footprint
- Application layer files: 0
- Domain layer files: 0
- Infrastructure persistence files: 0
- HTTP/controller files: 0

Primary module roots:
- backend/app/Http/Controllers/Api/TenantAdminDashboard/Enrollment
- backend/routes/tenant_dashboard/enrollment.php
- Enrollment domain/application logic is currently orchestrated primarily through controller + shared service layers.

## 4. API Surface (Tenant Dashboard)
Route definition files:
- backend/routes/tenant_dashboard/enrollment.php

Representative endpoints:
- Route::get('/my-courses', [EnrollmentReadController::class, 'myCourses']);
- Route::get('/courses/{course}/check-access', [EnrollmentReadController::class, 'checkAccess']);
- Route::post('/courses/{course}/enroll', [EnrollmentWriteController::class, 'enroll']);
- Route::get('/', [AdminEnrollmentReadController::class, 'index']);
- Route::post('/grant', [AdminEnrollmentWriteController::class, 'grant']);
- Route::delete('/{enrollmentId}', [AdminEnrollmentWriteController::class, 'revoke']);

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
- documentation/Tenant feature/status reports/Enrollment_Status_Report.md

## 8. Next Documentation Steps
To match the Platform documentation standard, create alongside this file:
1. Enrollment_business_findings.md
2. Enrollment_technical_documentation.md
