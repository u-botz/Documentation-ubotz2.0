# UBOTZ 2 Assignment Technical Documentation

## Backend Scope
- Application module: backend/app/Application/TenantAdminDashboard/Assignment
- Domain module: backend/app/Domain/TenantAdminDashboard/Assignment
- Infrastructure module: backend/app/Infrastructure/Persistence/TenantAdminDashboard/Assignment
- Route files:
  - backend/routes/tenant_dashboard/assignment.php

## Footprint Summary
- Application files: 15
- Domain files: 20
- Infrastructure files: 4
- Endpoint declarations (route files sampled): 7

## Security and Authorization Notes
- Route::middleware('tenant.capability:assignment.create')->post('/', [AssignmentWriteController::class, 'store']);
- Route::middleware('tenant.capability:assignment.edit')->put('/{assignmentId}', [AssignmentWriteController::class, 'update']);
- Route::middleware('tenant.capability:assignment.delete')->delete('/{assignmentId}', [AssignmentWriteController::class, 'destroy']);
- Route::middleware('tenant.capability:assignment.view')->group(function () {
- ->middleware('tenant.capability:assignment_submission.retract');
- ->middleware('tenant.capability:assignment.view');
- ->middleware('tenant.capability:assignment_submission.grade');

## API and Contract Notes
- Keep request/response payloads stable and tenant-scoped.
- Return explicit validation errors for form-driven workflows.
- Use canonical status values in APIs; normalize legacy values at UI boundary if needed.

## Testing Recommendations
- Feature tests for tenant isolation (Tenant A cannot access Tenant B data).
- Policy tests for all privileged endpoints.
- Regression tests for list/read/create/update/delete/status-change operations.

## Linked References
- Status report: ../../status reports/Assignment_Status_Report.md
- Consolidated feature doc: ../../feature documents/Ubotz_2_assignment_feature_documentation.md
