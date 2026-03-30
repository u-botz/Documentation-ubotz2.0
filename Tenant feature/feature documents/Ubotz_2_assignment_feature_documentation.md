# UBOTZ 2 Assignment Feature Documentation

## 1. Scope
This document defines the tenant-side Assignment feature from the current backend implementation, including routing surface, core modules, and tenant-isolation expectations.

## 2. Business Objectives
- Enable tenant administrators to operate assignment workflows from the Tenant Admin Dashboard.
- Keep all records tenant-scoped and role/capability-protected.
- Provide stable APIs for frontend modules and reporting/status visibility.

## 3. Backend Implementation Footprint
- Application layer files: 15
- Domain layer files: 20
- Infrastructure persistence files: 4
- HTTP/controller files: 4

Primary module roots:
- backend/app/Application/TenantAdminDashboard/Assignment
- backend/app/Domain/TenantAdminDashboard/Assignment
- backend/app/Infrastructure/Persistence/TenantAdminDashboard/Assignment

## 4. API Surface (Tenant Dashboard)
Route definition files:
- backend/routes/tenant_dashboard/assignment.php

Representative endpoints:
- Route::get('/', [AssignmentReadController::class, 'index']);
- Route::get('/{assignmentId}', [AssignmentReadController::class, 'show']);
- Route::post('/{assignmentId}/submit', [AssignmentSubmissionWriteController::class, 'submit']);
- Route::get('/{assignmentId}/my-submission', [AssignmentSubmissionReadController::class, 'mySubmission']);
- Route::delete('/submissions/{submissionId}/retract', [AssignmentSubmissionWriteController::class, 'retract'])
- Route::get('/{assignmentId}/submissions', [AssignmentSubmissionReadController::class, 'index'])
- Route::post('/submissions/{submissionId}/grade', [AssignmentSubmissionWriteController::class, 'grade'])

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
- documentation/Tenant feature/status reports/Assignment_Status_Report.md

## 8. Next Documentation Steps
To match the Platform documentation standard, create alongside this file:
1. Assignment_business_findings.md
2. Assignment_technical_documentation.md
