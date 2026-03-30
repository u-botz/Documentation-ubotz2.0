# UBOTZ 2 Landing Page Feature Documentation

## 1. Scope
This document defines the tenant-side Landing Page feature from the current backend implementation, including routing surface, core modules, and tenant-isolation expectations.

## 2. Business Objectives
- Enable tenant administrators to operate landing page workflows from the Tenant Admin Dashboard.
- Keep all records tenant-scoped and role/capability-protected.
- Provide stable APIs for frontend modules and reporting/status visibility.

## 3. Backend Implementation Footprint
- Application layer files: 33
- Domain layer files: 26
- Infrastructure persistence files: 13
- HTTP/controller files: 0

Primary module roots:
- backend/app/Application/TenantAdminDashboard/LandingPage
- backend/app/Domain/TenantAdminDashboard/LandingPage
- backend/app/Infrastructure/Persistence/TenantAdminDashboard/LandingPage

## 4. API Surface (Tenant Dashboard)
Route definition files:
- backend/routes/tenant_dashboard/landing_page.php
- backend/routes/tenant_dashboard/custom_domain.php

Representative endpoints:
- Route::get('navigation', [TenantNavigationController::class, 'show'])->name('tenant.navigation.show');
- Route::get('landing-page-templates', [TenantTemplateReadController::class, 'index'])->name('tenant.landing-page-templates.index');
- Route::get('landing-page-templates/{id}', [TenantTemplateReadController::class, 'show'])
- Route::get('landing-pages', [LandingPageReadController::class, 'index'])->name('tenant.landing-pages.index');
- Route::get('landing-pages/{id}', [LandingPageReadController::class, 'show'])->name('tenant.landing-pages.show');
- Route::get('custom-pages', [TenantCustomPageReadController::class, 'index'])->name('tenant.custom-pages.index');
- Route::get('custom-pages/{id}', [TenantCustomPageReadController::class, 'show'])
- Route::get('website-theme', [TenantWebsiteThemeController::class, 'show'])->name('tenant.website-theme.show');
- Route::get('website-display-config', [TenantWebsiteDisplayConfigController::class, 'show'])->name('tenant.website-display-config.show');
- Route::put('navigation', [TenantNavigationController::class, 'update'])->name('tenant.navigation.update');

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
- documentation/Tenant feature/status reports/LandingPage_Status_Report.md

## 8. Next Documentation Steps
To match the Platform documentation standard, create alongside this file:
1. LandingPage_business_findings.md
2. LandingPage_technical_documentation.md
