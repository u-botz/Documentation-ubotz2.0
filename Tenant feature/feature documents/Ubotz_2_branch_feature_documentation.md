# UBOTZ 2 Branch Feature Documentation

## 1. Scope
This document defines the tenant-side Branch feature from the current backend implementation, including routing surface, core modules, and tenant-isolation expectations.

## 2. Business Objectives
- Enable tenant administrators to operate branch workflows from the Tenant Admin Dashboard.
- Keep all records tenant-scoped and role/capability-protected.
- Provide stable APIs for frontend modules and reporting/status visibility.

## 3. Backend Implementation Footprint
- Application layer files: 10
- Domain layer files: 12
- Infrastructure persistence files: 3
- HTTP/controller files: 2

Primary module roots:
- backend/app/Application/TenantAdminDashboard/Branch
- backend/app/Domain/TenantAdminDashboard/Branch
- backend/app/Infrastructure/Persistence/TenantAdminDashboard/Branch

## 4. API Surface (Tenant Dashboard)
Route definition files:
- backend/routes/tenant_dashboard/branch.php

Representative endpoints:
- Route::get('/', [BranchReadController::class, 'index']);
- Route::get('/{branchId}', [BranchReadController::class, 'show']);
- Route::post('/', [BranchWriteController::class, 'store']);
- Route::put('/{branchId}', [BranchWriteController::class, 'update']);
- Route::patch('/{branchId}/deactivate', [BranchWriteController::class, 'deactivate']);
- Route::post('/assign-user', [BranchWriteController::class, 'assignUser']);

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
- documentation/Tenant feature/status reports/Branch_Status_Report.md

## 8. Next Documentation Steps
To match the Platform documentation standard, create alongside this file:
1. Branch_business_findings.md
2. Branch_technical_documentation.md
