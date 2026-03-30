# UBOTZ 2 Course Technical Documentation

## Backend Scope
- Application module: backend/app/Application/TenantAdminDashboard/Course
- Domain module: backend/app/Domain/TenantAdminDashboard/Course
- Infrastructure module: backend/app/Infrastructure/Persistence/TenantAdminDashboard/Course
- Route files:
  - backend/routes/tenant_dashboard/course.php
  - backend/routes/tenant_dashboard/course_operations.php
  - backend/routes/tenant_dashboard/course_review.php
  - backend/routes/tenant_dashboard/prerequisite.php
  - backend/routes/tenant_dashboard/learning_progress.php
  - backend/routes/tenant_dashboard/filter_options.php

## Footprint Summary
- Application files: 190
- Domain files: 154
- Infrastructure files: 66
- Endpoint declarations (route files sampled): 100

## Security and Authorization Notes
- Route::middleware('tenant.capability:course.view')->group(function () {
- ->middleware('tenant.capability:course.create');
- ->middleware('tenant.capability:course.edit');
- ->middleware('tenant.capability:course.publish');
- ->middleware('tenant.capability:course.archive');
- ->middleware('tenant.capability:course.view');
- Route::middleware('tenant.capability:course.edit')->group(function () {

## API and Contract Notes
- Keep request/response payloads stable and tenant-scoped.
- Return explicit validation errors for form-driven workflows.
- Use canonical status values in APIs; normalize legacy values at UI boundary if needed.

## Testing Recommendations
- Feature tests for tenant isolation (Tenant A cannot access Tenant B data).
- Policy tests for all privileged endpoints.
- Regression tests for list/read/create/update/delete/status-change operations.

## Linked References
- Status report: ../../status reports/Course_Status_Report.md
- Consolidated feature doc: ../../feature documents/Ubotz_2_course_feature_documentation.md
