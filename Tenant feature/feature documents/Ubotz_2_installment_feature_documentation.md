# UBOTZ 2 Installment Feature Documentation

## 1. Scope
This document defines the tenant-side Installment feature from the current backend implementation, including routing surface, core modules, and tenant-isolation expectations.

## 2. Business Objectives
- Enable tenant administrators to operate installment workflows from the Tenant Admin Dashboard.
- Keep all records tenant-scoped and role/capability-protected.
- Provide stable APIs for frontend modules and reporting/status visibility.

## 3. Backend Implementation Footprint
- Application layer files: 23
- Domain layer files: 24
- Infrastructure persistence files: 13
- HTTP/controller files: 6

Primary module roots:
- backend/app/Application/TenantAdminDashboard/Installment
- backend/app/Domain/TenantAdminDashboard/Installment
- backend/app/Infrastructure/Persistence/TenantAdminDashboard/Installment

## 4. API Surface (Tenant Dashboard)
Route definition files:
- backend/routes/tenant_dashboard/installment.php

Representative endpoints:
- Route::get('/', [InstallmentPlanReadController::class, 'index']);
- Route::post('/', [InstallmentPlanWriteController::class, 'store']);
- Route::get('/{plan}', [InstallmentPlanReadController::class, 'show']);
- Route::put('/{plan}', [InstallmentPlanWriteController::class, 'update']);
- Route::delete('/{plan}', [InstallmentPlanWriteController::class, 'destroy']);
- Route::post('/{plan}/steps', [InstallmentStepController::class, 'store']);
- Route::delete('/{plan}/steps/{step}', [InstallmentStepController::class, 'destroy']);
- Route::get('/', [InstallmentOrderReadController::class, 'index']);
- Route::post('/', [InstallmentOrderWriteController::class, 'store']);
- Route::get('/{order}', [InstallmentOrderReadController::class, 'show']);

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
- documentation/Tenant feature/status reports/Installment_Status_Report.md

## 8. Next Documentation Steps
To match the Platform documentation standard, create alongside this file:
1. Installment_business_findings.md
2. Installment_technical_documentation.md
