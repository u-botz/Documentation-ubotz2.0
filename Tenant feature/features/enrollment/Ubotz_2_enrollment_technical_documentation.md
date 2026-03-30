# UBOTZ 2 Enrollment Technical Documentation

## Backend Scope
- Application module: backend/app/Application/TenantAdminDashboard/
- Domain module: backend/app/Domain/TenantAdminDashboard/
- Infrastructure module: backend/app/Infrastructure/Persistence/TenantAdminDashboard/
- Route files:
  - backend/routes/tenant_dashboard/enrollment.php

## Footprint Summary
- Application files: 0
- Domain files: 0
- Infrastructure files: 0
- Endpoint declarations (route files sampled): 6

## Security and Authorization Notes
- Capability middleware usage should be reviewed per route group and policy checks.

## API and Contract Notes
- Keep request/response payloads stable and tenant-scoped.
- Return explicit validation errors for form-driven workflows.
- Use canonical status values in APIs; normalize legacy values at UI boundary if needed.

## Testing Recommendations
- Feature tests for tenant isolation (Tenant A cannot access Tenant B data).
- Policy tests for all privileged endpoints.
- Regression tests for list/read/create/update/delete/status-change operations.

## Linked References
- Status report: ../../status reports/Enrollment_Status_Report.md
- Consolidated feature doc: ../../feature documents/Ubotz_2_enrollment_feature_documentation.md
