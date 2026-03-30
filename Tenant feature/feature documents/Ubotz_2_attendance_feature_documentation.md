# UBOTZ 2 Attendance Feature Documentation

## 1. Scope
This document defines the tenant-side Attendance feature from the current backend implementation, including routing surface, core modules, and tenant-isolation expectations.

## 2. Business Objectives
- Manage attendance sessions, bulk marking, overrides, and completion workflows.
- Provide settings and reporting for student/staff attendance compliance.
- Ensure tenant-scoped visibility and policy-driven write operations.

## 3. Backend Implementation Footprint
- Application layer files: 22
- Domain layer files: 32
- Infrastructure persistence files: 13
- HTTP/controller files: 5

Primary module roots:
- backend/app/Application/TenantAdminDashboard/Attendance
- backend/app/Domain/TenantAdminDashboard/Attendance
- backend/app/Infrastructure/Persistence/TenantAdminDashboard/Attendance

## 4. API Surface (Tenant Dashboard)
Route definition files:
- backend/routes/tenant_dashboard/attendance.php

Representative endpoints:
- Route::get('sessions', [AttendanceSessionReadController::class, 'index']);
- Route::post('sessions', [AttendanceSessionWriteController::class, 'store']);
- Route::get('sessions/{id}', [AttendanceSessionReadController::class, 'show']);
- Route::post('sessions/{id}/mark', [AttendanceRecordWriteController::class, 'bulkMark']);
- Route::post('sessions/{id}/complete', [AttendanceSessionWriteController::class, 'complete']);
- Route::patch('records/{id}', [AttendanceRecordWriteController::class, 'update']);
- Route::post('records/{id}/override', [AttendanceRecordWriteController::class, 'override']);
- // Route::get('records/{id}/audit', [AttendanceAuditReadController::class, 'show']);
- Route::get('settings', [AttendanceSettingsReadController::class, 'show']);
- Route::put('settings', [AttendanceSettingsWriteController::class, 'update']);

## 5. Security and Tenant Isolation Requirements
- Tenant context must be resolved for every read/write/report endpoint.
- Role/capability gates should be enforced for admin/staff operations.
- Override and completion actions should remain auditable.

## 6. Frontend Contract Notes
- Session lifecycle and status should be explicit in UI state.
- Reporting endpoints should support empty-state rendering without error fallbacks.
- Bulk mark and override responses should return actionable validation messages.

## 7. Status Tracking Reference
- documentation/Tenant feature/status reports/Attendance_Status_Report.md

## 8. Next Documentation Steps
To match the Platform documentation standard, create alongside this file:
1. Attendance_business_findings.md
2. Attendance_technical_documentation.md
