# UBOTZ 2 Fee Technical Documentation

## Backend Scope
- Application module: backend/app/Application/TenantAdminDashboard/Fee
- Domain module: backend/app/Domain/TenantAdminDashboard/Fee
- Infrastructure module: backend/app/Infrastructure/Persistence/TenantAdminDashboard/Fee
- Route files:
  - backend/routes/tenant_dashboard/fees.php

## Footprint Summary
- Application files: 52
- Domain files: 44
- Infrastructure files: 17
- Endpoint declarations (route files sampled): 33

## Security and Authorization Notes
- Route::middleware(['tenant.module:module.lms', 'tenant.capability:fee.record_payment'])->group(function () {
- Route::middleware(['tenant.module:module.lms', 'tenant.capability:fee.view'])->group(function () {
- Route::middleware(['tenant.module:module.lms', 'tenant.capability:fee.approve_payment'])->group(function () {
- Route::middleware(['tenant.module:module.lms', 'tenant.capability:fee.manage'])->group(function () {
- Route::middleware(['tenant.module:module.lms', 'tenant.capability:fee.approve_concession'])->group(function () {

## API and Contract Notes
- Keep request/response payloads stable and tenant-scoped.
- Return explicit validation errors for form-driven workflows.
- Use canonical status values in APIs; normalize legacy values at UI boundary if needed.

## Testing Recommendations
- Feature tests for tenant isolation (Tenant A cannot access Tenant B data).
- Policy tests for all privileged endpoints.
- Regression tests for list/read/create/update/delete/status-change operations.

## Linked References
- Status report: ../../status reports/Fee_Status_Report.md
- Consolidated feature doc: ../../feature documents/Ubotz_2_fee_feature_documentation.md
