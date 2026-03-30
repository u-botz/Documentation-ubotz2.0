# UBOTZ 2 Subscription Feature Documentation

## 1. Scope
This document defines the tenant-side Subscription feature from the current backend implementation, including routing surface, core modules, and tenant-isolation expectations.

## 2. Business Objectives
- Enable tenant administrators to operate subscription workflows from the Tenant Admin Dashboard.
- Keep all records tenant-scoped and role/capability-protected.
- Provide stable APIs for frontend modules and reporting/status visibility.

## 3. Backend Implementation Footprint
- Application layer files: 17
- Domain layer files: 23
- Infrastructure persistence files: 8
- HTTP/controller files: 4

Primary module roots:
- backend/app/Application/TenantAdminDashboard/Subscription
- backend/app/Domain/TenantAdminDashboard/Subscription
- backend/app/Infrastructure/Persistence/TenantAdminDashboard/Subscription

## 4. API Surface (Tenant Dashboard)
Route definition files:
- backend/routes/tenant_dashboard/subscription.php

Representative endpoints:
- Route::get('/', [SubscriptionPlanReadController::class, 'index']);
- Route::post('/', [SubscriptionPlanWriteController::class, 'store']);
- Route::post('/enroll', EnrollSubscriptionPlanController::class)->middleware('tenant.capability:subscription.enroll');
- Route::get('/{planId}', [SubscriptionPlanReadController::class, 'show']);
- Route::put('/{planId}', [SubscriptionPlanWriteController::class, 'update']);
- Route::delete('/{planId}', [SubscriptionPlanWriteController::class, 'destroy']);

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
- documentation/Tenant feature/status reports/Subscription_Status_Report.md

## 8. Next Documentation Steps
To match the Platform documentation standard, create alongside this file:
1. Subscription_business_findings.md
2. Subscription_technical_documentation.md
