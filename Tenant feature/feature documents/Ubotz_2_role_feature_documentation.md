# UBOTZ 2 Role Feature Documentation

## 1. Scope
This document defines the tenant-side Role feature from the current backend implementation, including routing surface, core modules, and tenant-isolation expectations.

## 2. Business Objectives
- Enable tenant administrators to operate role workflows from the Tenant Admin Dashboard.
- Keep all records tenant-scoped and role/capability-protected.
- Provide stable APIs for frontend modules and reporting/status visibility.

## 3. Backend Implementation Footprint
- Application layer files: 9
- Domain layer files: 12
- Infrastructure persistence files: 3
- HTTP/controller files: 3

Primary module roots:
- backend/app/Application/TenantAdminDashboard/Role
- backend/app/Domain/TenantAdminDashboard/Role
- backend/app/Infrastructure/Persistence/TenantAdminDashboard/Role

## 4. API Surface (Tenant Dashboard)
Route definition files:
- backend/routes/tenant_dashboard/roles.php

Representative endpoints:
- Route::get('/', [TenantRoleController::class, 'index'])
- Route::get('/stats', [TenantRoleController::class, 'stats'])
- Route::get('/capabilities', [TenantRoleController::class, 'capabilities'])
- Route::post('/', [TenantRoleController::class, 'store'])
- Route::put('/{id}', [TenantRoleController::class, 'update'])
- Route::delete('/{id}', [TenantRoleController::class, 'destroy'])
- Route::patch('/{id}/toggle-active', [TenantRoleController::class, 'toggleActive'])

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
- documentation/Tenant feature/status reports/Role_Status_Report.md

## 8. Next Documentation Steps
To match the Platform documentation standard, create alongside this file:
1. Role_business_findings.md
2. Role_technical_documentation.md
