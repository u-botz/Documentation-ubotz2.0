# UBOTZ 2 Tenant Provisioning Feature Documentation

## 1. Scope
This document defines the tenant-side Tenant Provisioning feature from the current backend implementation, including routing surface, core modules, and tenant-isolation expectations.

## 2. Business Objectives
- Enable tenant administrators to operate tenant provisioning workflows from the Tenant Admin Dashboard.
- Keep all records tenant-scoped and role/capability-protected.
- Provide stable APIs for frontend modules and reporting/status visibility.

## 3. Backend Implementation Footprint
- Application layer files: 2
- Domain layer files: 0
- Infrastructure persistence files: 1
- HTTP/controller files: 2

Primary module roots:
- backend/app/Application/TenantAdminDashboard/Settings
- backend/app/Http/Controllers/Api/TenantAdminDashboard/Settings
- backend/routes/tenant_dashboard/settings.php
- backend/routes/tenant_dashboard/usage.php

## 4. API Surface (Tenant Dashboard)
Route definition files:
- backend/routes/tenant_dashboard/usage.php
- backend/routes/tenant_dashboard/settings.php

Representative endpoints:
- Route::get('/', [TenantDashboardUsageController::class, 'show']);
- Route::get('/', [TenantSettingsController::class, 'show'])
- Route::put('/', [TenantSettingsController::class, 'update'])
- Route::get('/student-payment', [TenantStudentPaymentSettingsController::class, 'show'])
- Route::put('/student-payment', [TenantStudentPaymentSettingsController::class, 'update'])
- Route::post('/student-payment/verify', [TenantStudentPaymentSettingsController::class, 'verify'])

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
- documentation/Tenant feature/status reports/Tenant_Provisioning_Status_Report.md

## 8. Next Documentation Steps
To match the Platform documentation standard, create alongside this file:
1. Tenant_Provisioning_business_findings.md
2. Tenant_Provisioning_technical_documentation.md
