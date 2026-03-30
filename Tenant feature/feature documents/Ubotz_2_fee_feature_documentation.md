# UBOTZ 2 Fee Feature Documentation

## 1. Scope
This document defines the tenant-side Fee feature from the current backend implementation, including routing surface, core modules, and tenant-isolation expectations.

## 2. Business Objectives
- Enable tenant administrators to operate fee workflows from the Tenant Admin Dashboard.
- Keep all records tenant-scoped and role/capability-protected.
- Provide stable APIs for frontend modules and reporting/status visibility.

## 3. Backend Implementation Footprint
- Application layer files: 52
- Domain layer files: 44
- Infrastructure persistence files: 17
- HTTP/controller files: 35

Primary module roots:
- backend/app/Application/TenantAdminDashboard/Fee
- backend/app/Domain/TenantAdminDashboard/Fee
- backend/app/Infrastructure/Persistence/TenantAdminDashboard/Fee

## 4. API Surface (Tenant Dashboard)
Route definition files:
- backend/routes/tenant_dashboard/fees.php

Representative endpoints:
- Route::post('/fees/offline-payment', [OfflineFeePaymentController::class, 'store']);
- Route::get('/ledger', [AdminFeeReadController::class, 'ledger']);
- Route::get('/students/{userId}/ledger', [StudentFeeLedgerController::class, 'show'])->whereNumber('userId');
- Route::get('/aging-report', [FeeAgingReportController::class, 'index']);
- Route::get('/financial-health', [FinancialHealthController::class, 'index']);
- Route::get('/late-fees/student/{userId}', [LateFeeController::class, 'byStudent'])->whereNumber('userId');
- Route::get('/stats', [AdminFeeReadController::class, 'stats']);
- Route::get('/overdue-installments', [AdminFeeReadController::class, 'overdueInstallments']);
- Route::get('/transactions', [AdminFeeReadController::class, 'transactions']);
- Route::get('/transactions/{transactionId}/receipt', [AdminFeeReadController::class, 'downloadReceipt'])

## 5. Security and Tenant Isolation Requirements
- All queries and mutations must execute inside resolved tenant context (TenantContext).
- Endpoints should enforce capability middleware where required (for example tenant.capability:*).
- Responses must not leak cross-tenant entities through joins, eager loads, or error payloads.
- Audit-sensitive actions (status changes, destructive updates, impersonation-type flows) should remain logged.

## 6. Frontend Contract Notes
- Frontend pages should treat empty datasets as a normal state, not an error state.
- Validation failures should surface backend field messages directly.
- Lifecycle/status values should be normalized at UI boundaries where legacy values exist.

## 7. Status Tracking Reference
- documentation/Tenant feature/status reports/Fee_Status_Report.md

## 8. Next Documentation Steps
To match the Platform documentation standard, create alongside this file:
1. Fee_business_findings.md
2. Fee_technical_documentation.md
