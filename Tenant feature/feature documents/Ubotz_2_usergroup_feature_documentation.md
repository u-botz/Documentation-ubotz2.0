# UBOTZ 2 User Group Feature Documentation

## 1. Scope
This document defines the tenant-side User Group feature from the current backend implementation, including routing surface, core modules, and tenant-isolation expectations.

## 2. Business Objectives
- Enable tenant administrators to operate user group workflows from the Tenant Admin Dashboard.
- Keep all records tenant-scoped and role/capability-protected.
- Provide stable APIs for frontend modules and reporting/status visibility.

## 3. Backend Implementation Footprint
- Application layer files: 6
- Domain layer files: 2
- Infrastructure persistence files: 3
- HTTP/controller files: 1

Primary module roots:
- backend/app/Application/TenantAdminDashboard/UserGroup
- backend/app/Domain/TenantAdminDashboard/UserGroup
- backend/app/Infrastructure/Persistence/TenantAdminDashboard/UserGroup

## 4. API Surface (Tenant Dashboard)
Route definition files:
- backend/routes/tenant_dashboard/user_groups.php

Representative endpoints:
- Route::get('/', [\App\Http\TenantAdminDashboard\UserGroup\Controllers\UserGroupController::class, 'index'])
- Route::post('/', [\App\Http\TenantAdminDashboard\UserGroup\Controllers\UserGroupController::class, 'store'])
- Route::put('/{id}', [\App\Http\TenantAdminDashboard\UserGroup\Controllers\UserGroupController::class, 'update'])
- Route::delete('/{id}', [\App\Http\TenantAdminDashboard\UserGroup\Controllers\UserGroupController::class, 'destroy'])
- Route::post('/{id}/members', [\App\Http\TenantAdminDashboard\UserGroup\Controllers\UserGroupController::class, 'addMember'])
- Route::delete('/{id}/members/{userId}', [\App\Http\TenantAdminDashboard\UserGroup\Controllers\UserGroupController::class, 'removeMember'])

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
- documentation/Tenant feature/status reports/UserGroup_Status_Report.md

## 8. Next Documentation Steps
To match the Platform documentation standard, create alongside this file:
1. UserGroup_business_findings.md
2. UserGroup_technical_documentation.md
