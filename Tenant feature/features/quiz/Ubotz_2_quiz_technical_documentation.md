# UBOTZ 2 Quiz Technical Documentation

## Backend Scope
- Application module: backend/app/Application/TenantAdminDashboard/Quiz
- Domain module: backend/app/Domain/TenantAdminDashboard/Quiz
- Infrastructure module: backend/app/Infrastructure/Persistence/TenantAdminDashboard/Quiz
- Route files:
  - backend/routes/tenant_dashboard/quiz.php

## Footprint Summary
- Application files: 62
- Domain files: 58
- Infrastructure files: 25
- Endpoint declarations (route files sampled): 33

## Security and Authorization Notes
- Route::middleware('tenant.capability:quiz.view')->group(function () {
- ->middleware('tenant.capability:quiz.create');
- ->middleware('tenant.capability:quiz.edit');
- ->middleware('tenant.capability:quiz.publish');
- ->middleware('tenant.capability:quiz.archive');
- ->middleware('tenant.capability:quiz.view');

## API and Contract Notes
- Keep request/response payloads stable and tenant-scoped.
- Return explicit validation errors for form-driven workflows.
- Use canonical status values in APIs; normalize legacy values at UI boundary if needed.

## Testing Recommendations
- Feature tests for tenant isolation (Tenant A cannot access Tenant B data).
- Policy tests for all privileged endpoints.
- Regression tests for list/read/create/update/delete/status-change operations.

## Linked References
- Status report: ../../status reports/Quiz_Status_Report.md
- Consolidated feature doc: ../../feature documents/Ubotz_2_quiz_feature_documentation.md
