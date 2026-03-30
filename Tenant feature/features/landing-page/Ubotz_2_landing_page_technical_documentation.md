# UBOTZ 2 Landing Page Technical Documentation

## Backend Scope
- Application module: backend/app/Application/TenantAdminDashboard/LandingPage
- Domain module: backend/app/Domain/TenantAdminDashboard/LandingPage
- Infrastructure module: backend/app/Infrastructure/Persistence/TenantAdminDashboard/LandingPage
- Route files:
  - backend/routes/tenant_dashboard/landing_page.php
  - backend/routes/tenant_dashboard/custom_domain.php

## Footprint Summary
- Application files: 33
- Domain files: 26
- Infrastructure files: 13
- Endpoint declarations (route files sampled): 33

## Security and Authorization Notes
- Route::middleware(['tenant.module:module.website', 'tenant.capability:landing_page.view'])->group(function () {
- Route::middleware(['tenant.module:module.website', 'tenant.capability:landing_page.manage'])->group(function () {
- ->middleware('tenant.capability:custom_domain.view');
- ->middleware('tenant.capability:custom_domain.manage');
- ->middleware(['tenant.capability:custom_domain.manage', 'throttle:5,1']);

## API and Contract Notes
- Keep request/response payloads stable and tenant-scoped.
- Return explicit validation errors for form-driven workflows.
- Use canonical status values in APIs; normalize legacy values at UI boundary if needed.

## Testing Recommendations
- Feature tests for tenant isolation (Tenant A cannot access Tenant B data).
- Policy tests for all privileged endpoints.
- Regression tests for list/read/create/update/delete/status-change operations.

## Linked References
- Status report: ../../status reports/LandingPage_Status_Report.md
- Consolidated feature doc: ../../feature documents/Ubotz_2_landingpage_feature_documentation.md
