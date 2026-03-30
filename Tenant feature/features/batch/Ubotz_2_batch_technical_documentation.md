# UBOTZ 2 Batch Technical Documentation

## Backend Scope
- Application module: backend/app/Application/TenantAdminDashboard/Batch
- Domain module: backend/app/Domain/TenantAdminDashboard/Batch
- Infrastructure module: backend/app/Infrastructure/Persistence/TenantAdminDashboard/Batch
- Route files:
  - backend/routes/tenant_dashboard/batch.php

## Footprint Summary
- Application files: 15
- Domain files: 26
- Infrastructure files: 9
- Endpoint declarations (route files sampled): 12

## Security and Authorization Notes
- Route::middleware('tenant.capability:batch.view')->group(function () {
- ->middleware('tenant.capability:batch.update')
- ->middleware('tenant.capability:batch.manage_faculty')
- ->middleware('tenant.capability:batch.create');
- ->middleware('tenant.capability:batch.delete')

## API and Contract Notes
- Keep request/response payloads stable and tenant-scoped.
- Return explicit validation errors for form-driven workflows.
- Use canonical status values in APIs; normalize legacy values at UI boundary if needed.

## Testing Recommendations
- Feature tests for tenant isolation (Tenant A cannot access Tenant B data).
- Policy tests for all privileged endpoints.
- Regression tests for list/read/create/update/delete/status-change operations.

## Linked References
- Status report: ../../status reports/Batch_Status_Report.md
- Consolidated feature doc: ../../feature documents/Ubotz_2_batch_feature_documentation.md
