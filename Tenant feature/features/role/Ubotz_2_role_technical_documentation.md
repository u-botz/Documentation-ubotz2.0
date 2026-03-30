# UBOTZ 2 Role Technical Documentation

## Backend Scope
- Application module: backend/app/Application/TenantAdminDashboard/Role
- Domain module: backend/app/Domain/TenantAdminDashboard/Role
- Infrastructure module: backend/app/Infrastructure/Persistence/TenantAdminDashboard/Role
- Route files:
  - backend/routes/tenant_dashboard/roles.php

## Footprint Summary
- Application files: 9
- Domain files: 12
- Infrastructure files: 3
- Endpoint declarations (route files sampled): 7

## Security and Authorization Notes
- ->middleware('tenant.capability:role.view');
- ->middleware('tenant.capability:role.manage');

## API and Contract Notes
- Keep request/response payloads stable and tenant-scoped.
- Return explicit validation errors for form-driven workflows.
- Use canonical status values in APIs; normalize legacy values at UI boundary if needed.

## Testing Recommendations
- Feature tests for tenant isolation (Tenant A cannot access Tenant B data).
- Policy tests for all privileged endpoints.
- Regression tests for list/read/create/update/delete/status-change operations.

## Linked References
- Status report: ../../status reports/Role_Status_Report.md
- Consolidated feature doc: ../../feature documents/Ubotz_2_role_feature_documentation.md
