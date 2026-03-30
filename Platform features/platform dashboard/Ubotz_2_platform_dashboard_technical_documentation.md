# UBOTZ 2.0 — Platform Hub (Command Center): Technical Specification

| Field | Value |
|---|---|
| **Document Type** | Principal Engineer — Technical Specification |
| **Feature** | Platform Hub (Command Center) |
| **Date** | 2026-03-27 |
| **Issued By** | Principal Engineer / Architecture Auditor |
| **Scope** | Aggregator layer: Dashboard queries, analytics, and unified approval queues |
| **Status** | CURRENT — Reflects implemented codebase state (verified against source) |

---

## 1. System Architecture Overview

```
HTTP Layer (Super Admin)
  → DashboardStatsController    (GET /api/platform/dashboard/stats)
  → PendingApprovalsController  (GET /api/platform/dashboard/pending-approvals)

Application Layer (Query Interfaces)
  → GetDashboardStatsQuery      (Interface — App\Application\SuperAdminDashboard\Dashboard\Queries)
  → GetPendingApprovalsQuery    (Interface — App\Application\SuperAdminDashboard\Dashboard\Queries)

Infrastructure Layer (Eloquent Implementations)
  → EloquentDashboardStatsQuery    (App\Infrastructure\Persistence\SuperAdminDashboard\Dashboard)
  → EloquentPendingApprovalsQuery  (App\Infrastructure\Persistence\SuperAdminDashboard\Dashboard)
```

Both controllers are **thin read-only orchestrators**: they receive the injected query, call `execute()`, and return `['data' => ...]` in JSON.

---

## 2. Global Platform Statistics

**Class:** `App\Infrastructure\Persistence\SuperAdminDashboard\Dashboard\EloquentDashboardStatsQuery`
**Interface:** `App\Application\SuperAdminDashboard\Dashboard\Queries\GetDashboardStatsQuery`

This query aggregates high-level business metrics from the **central database** using raw `DB::table()` calls (no Eloquent model hydration).

| Response Key | Source Table | Exact Query Logic |
|---|---|---|
| `total_tenants` | `tenants` | `DB::table('tenants')->count()` — counts **all** rows; no `removed_at` filter applied. |
| `total_revenue_cents` | `invoices` | `(int) DB::table('invoices')->sum('total_amount_cents')` |
| `active_subscriptions_count` | `tenant_subscriptions` | `->where('status', 'active')->count()` |
| `total_pending_approvals` | `subscription_plans` + `refund_requests` | `pendingPlans + pendingRefunds + pendingArchives` where `pendingPlans = subscription_plans WHERE status='pending_approval'`, `pendingRefunds = refund_requests WHERE status='pending'`, `pendingArchives = subscription_plans WHERE status='archive_requested'`. |
| `currency` | — | Hardcoded string `'INR'`. |

> **Implementation Note:** `total_pending_approvals` is a **3-signal roll-up** (plan submissions + refunds + plan archive requests). It does NOT sum every category returned by the Pending Approvals Queue endpoint — it is a different, reduced computation for the stat headline card.

---

## 3. Unified Pending Approvals Queue

**Class:** `App\Infrastructure\Persistence\SuperAdminDashboard\Dashboard\EloquentPendingApprovalsQuery`
**Interface:** `App\Application\SuperAdminDashboard\Dashboard\Queries\GetPendingApprovalsQuery`

This query serves as the source of truth for the L2/L1 decision-making dashboard. All data is read from the **Central Infrastructure DB** only — tenant-isolated databases are never queried.

### 3.1 Response Structure & Source Mapping

| Response Key | Source Table | Filter Criteria | Notes |
|---|---|---|---|
| `pending_plan_submissions` | `subscription_plans` | `submitted_at IS NOT NULL AND approved_at IS NULL AND rejected_at IS NULL` | Submitted-but-unresolved plans. |
| `pending_archive_requests` | — | Hardcoded `0` | Archive requests are signalled via `archive_requested` status counted in the stats headline; this discrete queue slot is reserved for future use. |
| `pending_refunds` | `refund_requests` | `status = 'pending'` | |
| `pending_institution_type_submissions` | `institution_types` | `status = 'pending_approval'` | |
| `pending_institution_type_archives` | `institution_types` | `status = 'pending_archive'` | |
| `pending_tenant_payments` | `tenants` | `status = 'pending_payment'` | Tenants awaiting manual payment verification. |
| `pending_tenant_hard_deletions` | `tenant_hard_deletion_requests` | `status = 'pending_approval'` | |
| `pending_tenant_suspensions` | `tenant_suspension_requests` | `status = 'pending_approval'` | |

---

## 4. API Endpoints & Authorization

| Endpoint | Method | Role Requirement | Authority Level |
|---|---|---|---|
| `/api/platform/dashboard/stats` | GET | Platform Owner only (L1) | 90 |
| `/api/platform/dashboard/pending-approvals` | GET | Root Approver or Platform Owner (L2+) | ≥ 80 |

**Middlewares Applied:**
- `auth:sanctum` — Token/session verification on all platform routes.
- `authority:90` — Strict L1 gate for financial stats endpoint.
- `authority:80` — L2/L1 gate for the approval queue endpoint.

**Controller Namespace:** `App\Http\Controllers\Api\SuperAdminDashboard\Dashboard`
- `DashboardStatsController` — delegates to `GetDashboardStatsQuery::execute()`.
- `PendingApprovalsController` — delegates to `GetPendingApprovalsQuery::execute()`.

Both return: `{ "data": { ... } }` with HTTP 200 on success, 401 on unauthenticated, 403 on insufficient authority.

---

## 5. Frontend Integration

**Service:** `frontend/services/platform-dashboard-service.ts`

Exports two typed methods:

```typescript
platformDashboardService.getStats()
// → Promise<{ data: PlatformStats }>
// PlatformStats: { total_tenants, total_revenue_cents, active_subscriptions_count, total_pending_approvals, currency }

platformDashboardService.getPendingApprovals()
// → Promise<{ data: PendingApprovals }>
// PendingApprovals: { pending_plan_submissions, pending_archive_requests, pending_refunds,
//                    pending_institution_type_submissions, pending_institution_type_archives,
//                    pending_tenant_payments, pending_tenant_hard_deletions, pending_tenant_suspensions }
```

Endpoints are resolved via `API_ENDPOINTS.PLATFORM_SYSTEM.DASHBOARD_STATS` and `API_ENDPOINTS.PLATFORM_SYSTEM.PENDING_APPROVALS`.

---

## 6. Test Coverage

### Backend Feature Tests (`tests/Feature/SuperAdminDashboard/`)

| Test File | Coverage |
|---|---|
| `DashboardStatsTest.php` | L1 can fetch stats with correct tenant count and revenue sum; L4 (authority 60) gets 403; unauthenticated gets 401. |
| `PendingApprovalsTest.php` | L2 gets correct counts for plan submissions, hard deletions, suspensions, and tenant payments; `pending_archive_requests` asserted as `0`; L4 gets 403; unauthenticated gets 401. |

### Frontend Unit Tests (`frontend/services/__tests__/platform-dashboard-service.test.ts`)
- Verifies `getStats()` calls the correct API endpoint and returns response data.
- Verifies API errors are propagated (not swallowed).

### E2E Tests (`frontend/e2e/super-admin/dashboard.spec.ts`)
- Smoke test: authenticated super admin navigates to dashboard route and the page renders (body and H1 heading visible).

---

## 7. Decision Model & Performance

1. **Lazy Aggregation**: All counts are calculated on-demand per request; there is no caching layer. Indexes on `status`, `submitted_at`, `approved_at`, `rejected_at` are required to keep load time < 200ms as the platform scales.
2. **Central DB Only**: Queries exclusively target the central infrastructure database. Tenant-isolated databases are never touched by these aggregators.
3. **Read-Only Contract**: Both endpoints are `GET`-only. Mutations happen in their respective domain endpoints; the dashboard never writes state.
4. **No Eloquent Hydration**: Queries use `DB::table()` directly for maximum performance — no model events, observers, or global scopes are triggered.

---

*End of Document — UBOTZ 2.0 Platform Hub Technical Specification — March 27, 2026*
