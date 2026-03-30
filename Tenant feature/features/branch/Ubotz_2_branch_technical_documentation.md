# UBOTZ 2 Branch Technical Documentation

## Backend Scope
- Application module: backend/app/Application/TenantAdminDashboard/Branch
- Domain module: backend/app/Domain/TenantAdminDashboard/Branch
- Infrastructure module: backend/app/Infrastructure/Persistence/TenantAdminDashboard/Branch
- Route files:
  - backend/routes/tenant_dashboard/branch.php

## Footprint Summary
- Application files: 10
- Domain files: 12
- Infrastructure files: 3
- Endpoint declarations (route files sampled): 6

## Security and Authorization Notes
- Route::middleware(['tenant.capability:branch.view'])->group(function () {
- Route::middleware(['tenant.capability:branch.manage'])->group(function () {

## API and Contract Notes
- Keep request/response payloads stable and tenant-scoped.
- Return explicit validation errors for form-driven workflows.
- Use canonical status values in APIs; normalize legacy values at UI boundary if needed.

## Testing Recommendations
- Feature tests for tenant isolation (Tenant A cannot access Tenant B data).
- Policy tests for all privileged endpoints.
- Regression tests for list/read/create/update/delete/status-change operations.

## Linked References
- Status report: ../../status reports/Branch_Status_Report.md
- Consolidated feature doc: ../../feature documents/Ubotz_2_branch_feature_documentation.md
