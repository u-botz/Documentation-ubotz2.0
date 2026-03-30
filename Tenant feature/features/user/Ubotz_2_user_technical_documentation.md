# UBOTZ 2 User Technical Documentation

## Backend Scope
- Application module: backend/app/Application/TenantAdminDashboard/User
- Domain module: backend/app/Domain/TenantAdminDashboard/User
- Infrastructure module: backend/app/Infrastructure/Persistence/TenantAdminDashboard/User
- Route files:
  - backend/routes/tenant_dashboard/users.php

## Footprint Summary
- Application files: 45
- Domain files: 43
- Infrastructure files: 11
- Endpoint declarations (route files sampled): 29

## Security and Authorization Notes
- ->middleware('tenant.capability:user.view');
- ->middleware('tenant.capability:user.manage');
- ->middleware('tenant.capability:user.manage'); // using manage capability for verify
- ->middleware('tenant.capability:user.manage'); // using manage capability for hard delete

## API and Contract Notes
- Keep request/response payloads stable and tenant-scoped.
- Return explicit validation errors for form-driven workflows.
- Use canonical status values in APIs; normalize legacy values at UI boundary if needed.

## Testing Recommendations
- Feature tests for tenant isolation (Tenant A cannot access Tenant B data).
- Policy tests for all privileged endpoints.
- Regression tests for list/read/create/update/delete/status-change operations.

## Linked References
- Status report: ../../status reports/User_Status_Report.md
- Consolidated feature doc: ../../feature documents/Ubotz_2_user_feature_documentation.md
