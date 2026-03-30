# UBOTZ 2 Subscription Technical Documentation

## Backend Scope
- Application module: backend/app/Application/TenantAdminDashboard/Subscription
- Domain module: backend/app/Domain/TenantAdminDashboard/Subscription
- Infrastructure module: backend/app/Infrastructure/Persistence/TenantAdminDashboard/Subscription
- Route files:
  - backend/routes/tenant_dashboard/subscription.php

## Footprint Summary
- Application files: 17
- Domain files: 23
- Infrastructure files: 8
- Endpoint declarations (route files sampled): 6

## Security and Authorization Notes
- Route::prefix('subscription-plans')->middleware('tenant.capability:subscription.manage')->group(function () {
- Route::post('/enroll', EnrollSubscriptionPlanController::class)->middleware('tenant.capability:subscription.enroll');

## API and Contract Notes
- Keep request/response payloads stable and tenant-scoped.
- Return explicit validation errors for form-driven workflows.
- Use canonical status values in APIs; normalize legacy values at UI boundary if needed.

## Testing Recommendations
- Feature tests for tenant isolation (Tenant A cannot access Tenant B data).
- Policy tests for all privileged endpoints.
- Regression tests for list/read/create/update/delete/status-change operations.

## Linked References
- Status report: ../../status reports/Subscription_Status_Report.md
- Consolidated feature doc: ../../feature documents/Ubotz_2_subscription_feature_documentation.md
