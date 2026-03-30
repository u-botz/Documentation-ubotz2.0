# UBOTZ 2 Exam Hierarchy Technical Documentation

## Backend Scope
- Application module: backend/app/Application/TenantAdminDashboard/ExamHierarchy
- Domain module: backend/app/Domain/TenantAdminDashboard/ExamHierarchy
- Infrastructure module: backend/app/Infrastructure/Persistence/TenantAdminDashboard/ExamHierarchy
- Route files:
  - backend/routes/tenant_dashboard/exam_hierarchy.php

## Footprint Summary
- Application files: 9
- Domain files: 15
- Infrastructure files: 9
- Endpoint declarations (route files sampled): 7

## Security and Authorization Notes
- ->middleware('tenant.capability:exam.view');
- ->middleware('tenant.capability:exam.manage');

## API and Contract Notes
- Keep request/response payloads stable and tenant-scoped.
- Return explicit validation errors for form-driven workflows.
- Use canonical status values in APIs; normalize legacy values at UI boundary if needed.

## Testing Recommendations
- Feature tests for tenant isolation (Tenant A cannot access Tenant B data).
- Policy tests for all privileged endpoints.
- Regression tests for list/read/create/update/delete/status-change operations.

## Linked References
- Status report: ../../status reports/ExamHierarchy_Status_Report.md
- Consolidated feature doc: ../../feature documents/Ubotz_2_examhierarchy_feature_documentation.md
