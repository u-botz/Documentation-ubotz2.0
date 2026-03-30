# UBOTZ 2 User Feature Documentation

## 1. Scope
This document defines the tenant-side User feature from the current backend implementation, including routing surface, core modules, and tenant-isolation expectations.

## 2. Business Objectives
- Enable tenant administrators to operate user workflows from the Tenant Admin Dashboard.
- Keep all records tenant-scoped and role/capability-protected.
- Provide stable APIs for frontend modules and reporting/status visibility.

## 3. Backend Implementation Footprint
- Application layer files: 45
- Domain layer files: 43
- Infrastructure persistence files: 11
- HTTP/controller files: 14

Primary module roots:
- backend/app/Application/TenantAdminDashboard/User
- backend/app/Domain/TenantAdminDashboard/User
- backend/app/Infrastructure/Persistence/TenantAdminDashboard/User

## 4. API Surface (Tenant Dashboard)
Route definition files:
- backend/routes/tenant_dashboard/users.php

Representative endpoints:
- Route::get('/export', [UserExportController::class, 'export'])
- Route::get('/stats', [TenantUserReadController::class, 'stats'])
- Route::get('/', [TenantUserReadController::class, 'index'])
- Route::get('/{id}', [TenantUserReadController::class, 'show'])
- Route::post('/', [TenantUserWriteController::class, 'store'])
- Route::put('/{id}', [TenantUserWriteController::class, 'update'])
- Route::patch('/{id}/toggle-status', [TenantUserWriteController::class, 'toggleStatus'])
- Route::delete('/{id}', [TenantUserWriteController::class, 'destroy'])
- Route::patch('/{id}/verify', [VerifyUserController::class, 'patch'])
- Route::delete('/{id}/permanent', [HardDeleteUserController::class, 'destroy'])

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
- documentation/Tenant feature/status reports/User_Status_Report.md

## 8. Next Documentation Steps
To match the Platform documentation standard, create alongside this file:
1. User_business_findings.md
2. User_technical_documentation.md
