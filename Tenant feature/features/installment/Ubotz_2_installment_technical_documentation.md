# UBOTZ 2 Installment Technical Documentation

## Backend Scope
- Application module: backend/app/Application/TenantAdminDashboard/Installment
- Domain module: backend/app/Domain/TenantAdminDashboard/Installment
- Infrastructure module: backend/app/Infrastructure/Persistence/TenantAdminDashboard/Installment
- Route files:
  - backend/routes/tenant_dashboard/installment.php

## Footprint Summary
- Application files: 23
- Domain files: 24
- Infrastructure files: 13
- Endpoint declarations (route files sampled): 13

## Security and Authorization Notes
- Route::prefix('installment-plans')->middleware('tenant.capability:installment.manage')->group(function () {
- Route::prefix('installment-orders')->middleware('tenant.capability:installment.manage')->group(function () {

## API and Contract Notes
- Keep request/response payloads stable and tenant-scoped.
- Return explicit validation errors for form-driven workflows.
- Use canonical status values in APIs; normalize legacy values at UI boundary if needed.

## Testing Recommendations
- Feature tests for tenant isolation (Tenant A cannot access Tenant B data).
- Policy tests for all privileged endpoints.
- Regression tests for list/read/create/update/delete/status-change operations.

## Linked References
- Status report: ../../status reports/Installment_Status_Report.md
- Consolidated feature doc: ../../feature documents/Ubotz_2_installment_feature_documentation.md
