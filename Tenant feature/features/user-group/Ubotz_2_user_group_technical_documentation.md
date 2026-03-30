# UBOTZ 2 User Group Technical Documentation

## Backend Scope
- Application module: backend/app/Application/TenantAdminDashboard/UserGroup
- Domain module: backend/app/Domain/TenantAdminDashboard/UserGroup
- Infrastructure module: backend/app/Infrastructure/Persistence/TenantAdminDashboard/UserGroup
- Route files:
  - backend/routes/tenant_dashboard/user_groups.php

## Footprint Summary
- Application files: 6
- Domain files: 2
- Infrastructure files: 3
- Endpoint declarations (route files sampled): 6

## Security and Authorization Notes
- ->middleware('tenant.capability:user_group.view');
- ->middleware('tenant.capability:user_group.manage');

## API and Contract Notes
- Keep request/response payloads stable and tenant-scoped.
- Return explicit validation errors for form-driven workflows.
- Use canonical status values in APIs; normalize legacy values at UI boundary if needed.

## Testing Recommendations
- Feature tests for tenant isolation (Tenant A cannot access Tenant B data).
- Policy tests for all privileged endpoints.
- Regression tests for list/read/create/update/delete/status-change operations.

## Linked References
- Status report: ../../status reports/UserGroup_Status_Report.md
- Consolidated feature doc: ../../feature documents/Ubotz_2_usergroup_feature_documentation.md
