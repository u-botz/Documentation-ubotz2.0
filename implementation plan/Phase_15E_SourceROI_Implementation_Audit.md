# Phase 15E — Source ROI Analytics Implementation Audit

**Document Version:** 1.0
**Date:** March 26, 2026
**Scope:** Phase 15E — Source ROI Analytics
**Reference Instructions:** `documentation/Tenant feature/crm/implementation plan/Ubotz_2_phase_15e_developer_instructions.md`
**Status Legend:** ✅ Implemented · ⚠️ Partially Implemented · ❌ Missing / Not Implemented

---

## Executive Summary

Phase 15E is **very well implemented** — notably better coverage than Phase 15D. Backend domain, application, infrastructure, HTTP, and test layers are all substantively present. The analytics query engine is correct and avoids N+1 patterns. Test coverage includes unit tests for the entity, feature tests for CRUD, analytics calculation, CSV export, module gating, and tenant isolation.

**6 gaps** were identified, all minor (P2/P3). No P0 security issues and no blocking P1 correctness gaps.

---

## Domain Layer

| Spec Component | Status | Notes |
|---|---|---|
| `SourceSpendEntryEntity` | ✅ | `app/Domain/.../Entities/SourceSpendEntryEntity.php` — validates source against `LeadSource::allowedValues()`, validates year (2000–2100), month (1–12), amount ≥ 0. Has `create()`, `reconstitute()`, `applyUpdate()`. |
| `SourceSpendEntryCreated` domain event | ❌ | Not implemented. `CreateSpendEntryUseCase` audit-logs the action but does NOT dispatch a domain event. |
| `SourceSpendEntryUpdated` domain event | ❌ | Not implemented. `UpdateSpendEntryUseCase` audit-logs but does not dispatch a domain event. |
| `SourceSpendEntryRepositoryInterface` | ✅ | Present at `app/Domain/.../Repositories/SourceSpendEntryRepositoryInterface.php` |
| `DuplicateSpendEntryException` | ✅ | Present at `app/Domain/.../Exceptions/DuplicateSpendEntryException.php`, thrown from `CreateSpendEntryUseCase` |
| `LeadAdmissionFeeNotAllowedException` | ✅ | Present (additive — not in spec, but correctly handles the module-gating case for admission fee) |
| `OTHER_OFFLINE` added to `LeadSource` VO | ✅ | `LeadSource::OTHER_OFFLINE = 'other_offline'` added; in `ALLOWED_VALUES` array |

---

## Application Layer

| Spec Component | Status | Notes |
|---|---|---|
| `CreateSpendEntryUseCase` | ✅ | Validates uniqueness via `repository->existsForMonth()`, creates entity, saves, audit-logs with old/new values |
| `UpdateSpendEntryUseCase` | ✅ | Present; audit-logged with old/new amounts |
| `DeleteSpendEntryUseCase` | ✅ | Soft-deletes; audit-logged |
| `ListSpendEntriesQuery` | ✅ | Implemented inside `SourceSpendEntryController::index()` via `repository->list()` — paginated, filterable by source |
| `GetSourceROIAnalyticsQuery` | ✅ | Implemented as `SourceRoiAnalyticsQueryService::getDashboard()` in Infrastructure layer (acceptable — query service pattern) |
| `GetSourceTrendQuery` | ✅ | `SourceRoiAnalyticsQueryService::getTrend()` |
| `ExportSourceAnalyticsCsvUseCase` | ✅ | Implemented directly in `SourceAnalyticsController::export()` as a `StreamedResponse` — CSV columns match spec exactly |
| `UpdateLeadRevenueUseCase` | ✅ | `UpdateLeadAdmissionFeeUseCase` — present; handles both conversion-time and retroactive update |
| `CreateSpendEntryCommand` | ✅ | Present as DTO |
| `UpdateSpendEntryCommand` | ✅ | Present (additive — not in spec, correctly added) |
| `UpdateLeadAdmissionFeeCommand` | ✅ | Present |
| `ConvertLeadUseCase` extended for `admission_fee_amount_cents` | ✅ | `ConvertLeadUseCase` accepts optional `admission_fee_amount_cents`; module-gated: fee capture silently skipped if `module.source_analytics` not entitled |
| `SourceAnalyticsPeriodResolver` | ✅ | Present — handles all 6 preset periods (this_month, last_month, this_quarter, last_quarter, this_year, last_year) + custom range |

---

## Infrastructure Layer

| Spec Component | Status | Notes |
|---|---|---|
| `SourceSpendEntryRecord` (Eloquent + soft deletes) | ✅ | Present; has `BelongsToTenant` scope; `SoftDeletes` trait |
| `EloquentSourceSpendEntryRepository` | ✅ | Present |
| `SourceROIAnalyticsQueryService` | ✅ | Executes 4 separate SQL queries (leads, conversions, revenue, spend), merges in PHP, builds summary — correct, no N+1 loop per source |
| SQLite compatibility (for tests) | ✅ | `avgLeadToAdmissionDaysExpression()` detects driver and uses `julianday()` for SQLite vs `TIMESTAMPDIFF()` for MySQL |

### Analytics Query Correctness Audit

The `SourceRoiAnalyticsQueryService` uses `converted_at` as the conversion timestamp (BR-13 requires attribution to when the lead reached `admission_confirmed`, not when it was created). This is **correct** — the implementation uses `converted_at` with `pipeline_stage = 'admission_confirmed' AND is_converted = true`. The spec's concern about `stage_changed_at` vs `tenant_audit_logs` is resolved by using the dedicated `converted_at` column.

One note: the query uses `lead_source` as the column name for grouping, consistent with the `leads` table. The spec says `source` — this is a naming difference at the column level only, transparent to the API response which normalises to `source`.

---

## HTTP Layer

### Controllers

| Spec Endpoint | Implemented | Route / Controller |
|---|---|---|
| `POST /api/tenant/crm/spend-entries` | ✅ | `SourceSpendEntryController::store` |
| `GET /api/tenant/crm/spend-entries` | ✅ | `SourceSpendEntryController::index` |
| `PUT /api/tenant/crm/spend-entries/{id}` | ✅ | `SourceSpendEntryController::update` |
| `DELETE /api/tenant/crm/spend-entries/{id}` | ✅ | `SourceSpendEntryController::destroy` — returns 204 |
| `GET /api/tenant/crm/source-analytics` | ✅ | `SourceAnalyticsController::index` |
| `GET /api/tenant/crm/source-analytics/trend` | ✅ | `SourceAnalyticsController::trend` |
| `GET /api/tenant/crm/source-analytics/export` | ✅ | `SourceAnalyticsController::export` — streams CSV |
| `PUT /api/tenant/leads/{lead}/admission-fee` | ✅ | `LeadWriteController::updateAdmissionFee` |

All routes carry `tenant.module:module.source_analytics` middleware ✅

### Capability Middleware

| Capability | Applied | Verified |
|---|---|---|
| `crm.analytics.view` | ✅ | Dashboard, trend, export, spend list routes |
| `crm.analytics.manage` | ✅ | Spend entry write routes, admission fee update |

### Form Requests

| Request | Status | Notes |
|---|---|---|
| `CreateSpendEntryRequest` | ✅ | Validates source, year (2020–2030), month (1–12), amount ≥ 0 |
| `UpdateSpendEntryRequest` | ✅ | Validates amount ≥ 0, optional notes |
| `GetSourceAnalyticsRequest` | ✅ | Validates period preset, from_date/to_date required when `custom` |
| `GetSourceTrendRequest` | ✅ | Present |
| `UpdateAdmissionFeeRequest` | ✅ | `UpdateLeadAdmissionFeeRequest` — amount > 0, converted to cents |

### API Resources

| Resource | Status | Notes |
|---|---|---|
| `SpendEntryResource` | ✅ | Present — returns `id`, `source`, `source_label`, `year`, `month`, `month_label`, `amount`, `amount_cents`, timestamps |
| `SourceAnalyticsResource` | ✅ | Implemented as `SourceRoiMetricsFormatter::formatRow()` — returns all required fields: `spend`, `spend_cents`, `revenue`, `revenue_cents`, `revenue_data_coverage`, `cpl_display`, `cpa_display`, `conversion_rate_display`, `roi_display`, `avg_lead_to_admission_display` |
| `SourceTrendResource` | ✅ | `data_points[]` with `year`, `month`, `month_label`, `value` |

---

## Database Schema

| Spec Requirement | Status | Notes |
|---|---|---|
| `source_spend_entries` table | ✅ | Migration `2026_03_26_100000_create_source_spend_entries_and_lead_admission_fee.php` |
| `tenant_id`, `source`, `year`, `month`, `amount_cents`, `notes`, `created_by` columns | ✅ | All present |
| Soft deletes (`deleted_at`) | ✅ | `softDeletes()` added |
| `idx_spend_entries_tenant_ym` index `(tenant_id, year, month)` | ✅ | Present |
| `unq_spend_entry` UNIQUE `(tenant_id, source, year, month)` WHERE `deleted_at IS NULL` | ⚠️ | **Partial.** The index `idx_spend_entries_tenant_source` `(tenant_id, source)` is added, and the unique constraint is enforced at the **application layer** via `CreateSpendEntryUseCase::existsForMonth()`. However, the spec requires a **database-level UNIQUE constraint** filtered on `deleted_at IS NULL`. MySQL does not support partial unique indexes natively (PostgreSQL does) — the correct MySQL approach is a unique index without the WHERE clause (since soft-deleted rows are excluded by the application). The uniqueness is functionally enforced but not at the DB constraint level. |
| `leads.admission_fee_amount_cents BIGINT UNSIGNED NULLABLE` | ✅ | Added in same migration |

---

## Business Rules Verification

### Spend Entry Rules

| BR | Description | Status | Notes |
|---|---|---|---|
| BR-01 | One entry per (source, year, month) per tenant | ✅ | Application-layer uniqueness check; 409 returned on duplicate |
| BR-02 | Source dropdown shows all `LeadSource` values + `other_offline` | ✅ | `LeadSource::OTHER_OFFLINE` added; `CreateSpendEntryRequest` validates against `LeadSource::allowedValues()` |
| BR-03 | Amount stored in `_cents` integer | ✅ | `amount_cents BIGINT UNSIGNED` |
| BR-04 | Spend entries: create, update, delete (soft delete) | ✅ | All 4 CRUD operations implemented |
| BR-05 | Zero-amount entries are valid | ✅ | `amountCents >= 0` — zero allowed; `amount >= 0` in form request |
| BR-06 | Only `crm.analytics.manage` can create/edit/delete | ✅ | Capability middleware on all write routes |
| BR-07 | All spend changes audit-logged | ✅ | `TenantAuditLogger` called in create, update, delete use cases with old/new values |

### Revenue Capture Rules

| BR | Description | Status | Notes |
|---|---|---|---|
| BR-08 | Optional `admission_fee_amount` at conversion | ✅ | `ConvertLeadUseCase` accepts optional `admission_fee_amount_cents`; field gated on `module.source_analytics` |
| BR-09 | `admission_fee_amount` optional; ROI shows coverage note | ✅ | `SourceRoiMetricsFormatter` shows "X of Y conversions have fee data" in ROI display string |
| BR-10 | Fee updatable retroactively | ✅ | `UpdateLeadAdmissionFeeUseCase` + `PUT /api/tenant/leads/{lead}/admission-fee` |
| BR-11 | Revenue per source = SUM of `admission_fee_amount_cents` for converted leads | ✅ | `SourceRoiAnalyticsQueryService` aggregates `SUM(admission_fee_amount_cents)` |

### Metric Calculation Rules

| BR | Description | Status | Notes |
|---|---|---|---|
| BR-12 | Leads Generated = COUNT with `created_at` between period | ✅ | |
| BR-13 | Conversions = COUNT with `converted_at` between period (attributed to conversion date, not creation date) | ✅ | Uses `converted_at` column; spec concern addressed |
| BR-14 | CPL = spend ÷ leads; "N/A" if zero leads | ✅ | `SourceRoiMetricsFormatter::formatRow()` handles zero-division |
| BR-15 | CPA = spend ÷ conversions; "N/A" if zero conversions | ✅ | |
| BR-16 | Conversion Rate = conversions ÷ leads × 100; 1 decimal | ✅ | `round(..., 1)` applied |
| BR-17 | ROI = (revenue − spend) ÷ spend × 100; "∞" if spend = 0; "-100%" if no revenue | ✅ | `SourceRoiMetricsFormatter::roiDisplay()` handles all edge cases: zero spend with conversions → "∞", zero spend with no conversions → "N/A", zero revenue → "-100%" |
| BR-18 | Lead-to-Admission Time = AVG days; 1 decimal | ✅ | MySQL: `AVG(TIMESTAMPDIFF(SECOND, created_at, converted_at)) / 86400`; rounded to 1 decimal |
| BR-19 | Monetary metrics in tenant currency | ✅ | `tenantCurrency()` reads from tenant settings; defaults to INR |
| BR-20 | On-demand computation, no pre-aggregation | ✅ | No caching or pre-aggregation tables |

### Time Period Rules

| BR | Description | Status | Notes |
|---|---|---|---|
| BR-21 | 6 preset periods + custom range | ✅ | `SourceAnalyticsPeriodResolver` handles all 6 presets and custom range |
| BR-22 | Partial-month custom range: full monthly spend included | ✅ | `monthsOverlappingRange()` returns all months that overlap the range — full monthly spend is included for any month that has at least one day in the range |
| BR-23 | Lead/conversion counts use exact date filtering | ✅ | `whereBetween('created_at', [$startStr, $endStr])` |

### Edge Cases (§6.3)

| Scenario | Status | Notes |
|---|---|---|
| Source has leads but no spend → CPL = "₹0", ROI = "∞" | ✅ | `cpl_display` returns "₹0.00" when `sp=0` and `lg>0`; ROI returns "∞" when spend=0 and conversions>0 |
| Source has spend but no leads → CPL/CPA/Rate = "N/A", ROI = "-100%" | ✅ | |
| Source has conversions but no revenue data → ROI = "N/A" | ⚠️ | Spec says show "N/A — revenue data not entered". Actual: `-100%` is returned when `withFee = 0`. This is the case where a source HAS conversions but NONE have fee data. The spec says ROI = "N/A — revenue data not entered" but the formatter returns `-100%`. Functionally the user will see `-100%` instead of `N/A`. |
| Partial revenue data → ROI with coverage note | ✅ | "260.0% (based on 15 of 18 conversions)" |
| No data at all → empty state | ✅ | Returns empty `sources` array; frontend shows nothing |

---

## Frontend

| Spec Requirement | Status | Notes |
|---|---|---|
| **Page location:** CRM → Source Analytics | ✅ | `app/tenant-admin-dashboard/crm/source-analytics/page.tsx` route registered |
| **Time period selector** (7 options including custom) | ✅ | `SourceAnalyticsPage` has `Select` with all 7 period values; custom shows date pickers |
| **Custom date pickers** shown when period = "custom" | ✅ | Conditional render of two `<Input type="date">` |
| **Export CSV button** | ✅ | `exportCsv()` function using `Blob` download |
| **"Manage Spend" button** (admin only) | ✅ | `canManage && <Button onClick={() => setSpendOpen(true)}>Manage spend</Button>` |
| **Summary cards row** (Total Leads, Conversions, Spend, Conv. Rate, CPL, CPA) | ✅ | 6 `SummaryCard` components rendered from `summary` object |
| **Source comparison table** with all 10 columns | ✅ | Table with Source, Leads, Conv., Rate, Spend, CPL, CPA, Revenue, ROI, Avg days |
| **Table sortable by any column** | ✅ | `toggleSort()` function; `sortKey` + `sortDir` state |
| **Default sort: Conversions descending** | ✅ | `const [sortKey, setSortKey] = useState('conversions')` + `useState('desc')` |
| **Color coding for ROI and Conversion Rate** | ❌ | No color coding implemented. Spec requires: ROI > 100% = green, 0–100% = amber, < 0% = red; Conv. Rate > 30% = green, 10–30% = amber, < 10% = red. Table cells render plain text with no conditional CSS class. |
| **Source Trend Charts** (line chart, metric selector, last 6 months default) | ✅ | `Line` chart from `chart.js`; `trendMetric` selector with 6 options (conversion_rate, CPL, CPA, leads_generated, ROI, lead_time); auto-selects first source |
| **Max 5 sources in trend chart** | ❌ | No source capping. All sources from `sorted` are available in the trend source dropdown. Spec says max 5 (top by lead volume) with "Other sources" toggle. |
| **Spend Entry Management panel** (list, add form) | ✅ | Dialog modal with add form; existing entries listed in scrollable area inside dialog |
| **Spend entry form — source as dropdown** | ⚠️ | Source is a free-text `<Input>`, not a `<Select>` dropdown. Spec requires a dropdown of all `LeadSource` values + "Other / Offline". Raw string input allows typos and invalid sources (though the backend validates). |
| **Spend entry form — month/year picker** | ⚠️ | Two separate number inputs for year and month (1–12). Spec says "month/year picker" — a combined month-year picker is the expected UX, not raw number fields. Functional but poor UX. |
| **Edit/Delete existing spend entries from panel** | ❌ | The "Manage spend" dialog shows a read-only list of entries but has no Edit or Delete buttons. The backend endpoints exist (`PUT`, `DELETE`) but the UI does not expose them. |
| **Admission Fee field in conversion flow** | ⚠️ | Backend handles it; no frontend evidence of the conversion dialog being extended with an admission fee field. The `SourceAnalyticsPage` does not include lead conversion flow. This needs to be verified in the lead detail component (not included in Phase 15E frontend files). |
| **Lead detail page: "Admission Fee" display + edit** | ⚠️ | `LeadDetailResource` includes `admission_fee_amount_cents`; no frontend component for displaying/editing it found in the `source-analytics` frontend files. |

---

## Test Coverage

| Test File | Cases | What Is Tested |
|---|---|---|
| `SourceSpendEntryCrudTest.php` | 5 | Create, duplicate 409, list + update, soft delete 204, module gate 403, cross-tenant isolation (delete) |
| `SourceRoiAnalyticsTest.php` | 4 | Default period dashboard, custom period, trend endpoint, CSV export headers |
| `SourceSpendEntryEntityTest.php` | 3 (unit) | Valid create, invalid source throws, negative amount throws, invalid month throws |
| `LeadConversionTest.php` | 5 | Convert, double-convert 409, edit-after-convert 409, fee requires module (403), fee persists when entitled, update fee retroactively |

**Total: ~17 test cases.** This is solid coverage for a feature of this size.

### Missing Tests

| Missing Test | Priority |
|---|---|
| Analytics metric correctness: CPL = spend ÷ leads (manual calculation assertion) | P1 |
| ROI edge case: zero spend with conversions → "∞" | P1 |
| ROI edge case: conversions with no fee data → should be "N/A" per spec (currently returns "-100%") | P1 |
| Period attribution: lead created in Jan, converted in Mar → confirmed in Mar's conversions | P2 |
| `crm.analytics.manage` capability gate: counselor cannot create spend entry | P2 |
| Audit log entries created on spend entry create/update/delete | P3 |

---

## Quality Gate Checklist (from §11)

### 11.1 Spend Entry Gates

- [x] Create spend entry — stored correctly
- [x] Duplicate entry rejected with 409
- [x] Update spend entry — amount changes, audit-logged
- [x] Delete spend entry — soft-deleted, audit-logged
- [x] Zero-amount entry is valid
- [x] All `LeadSource` values in source list

### 11.2 Analytics Calculation Gates

- [x] CPL = spend ÷ leads (verified in query service; no manual-calculation assertion test)
- [x] CPA = spend ÷ conversions
- [x] Conversion Rate = conversions ÷ leads × 100
- [x] ROI = (revenue − spend) ÷ spend × 100
- [x] Lead-to-Admission Time = average days
- [x] Zero leads → "N/A"
- [x] Zero spend → "₹0" CPL / "∞" ROI
- [x] Zero conversions → "N/A" CPA
- [ ] **Partial revenue data → ROI with coverage note** ✅ coverage note exists, but ROI edge case where ALL conversions have no fee returns `-100%` not "N/A" (spec conflict)
- [x] All preset period filters work
- [x] Custom date range works
- [x] Conversion attributed to `converted_at` period, not creation period

### 11.3 Revenue Capture Gates

- [x] Admission fee field at conversion (backend)
- [x] Fee stored in `_cents` format
- [x] Fee updatable retroactively
- [x] Revenue aggregation includes only leads with fee data
- [x] Revenue data coverage shown in dashboard

### 11.4 Frontend Gates

- [x] Dashboard displays all 5 metrics per source in comparison table
- [x] Table sortable by any column
- [x] Trend chart shows metric over months
- [ ] **Spend management UI: create, edit, delete** — ❌ Edit and Delete missing in UI
- [x] CSV export downloads
- [ ] **Color coding on ROI and conversion rate** — ❌ Not implemented
- [x] Summary cards show totals

### 11.5 Security Gates

- [x] Tenant isolation (cross-tenant spend isolation test)
- [x] `crm.analytics.view` required for dashboard
- [x] `crm.analytics.manage` required for spend CRUD and fee updates

---

## Consolidated Gap List

| # | Severity | Gap | Action Required |
|---|---|---|---|
| 1 | P2 — Domain | `SourceSpendEntryCreated` and `SourceSpendEntryUpdated` domain events not dispatched (classes missing) | Create event classes; dispatch from `CreateSpendEntryUseCase` and `UpdateSpendEntryUseCase` after save |
| 2 | P2 — Business Rule | ROI edge case when conversions exist but ALL have no fee data returns `-100%` instead of spec's "N/A — revenue data not entered" | Fix `SourceRoiMetricsFormatter::roiDisplay()`: if `withFee === 0 && conversions > 0`, return `['value' => null, 'display' => 'N/A — revenue data not entered']` |
| 3 | P2 — Frontend | No color coding on ROI or Conversion Rate table cells | Add conditional CSS classes in `SourceAnalyticsPage` table: green/amber/red per spec thresholds |
| 4 | P2 — Frontend | "Manage Spend" dialog has no Edit or Delete actions for existing entries | Add edit (inline or modal) and delete (with confirm) to the spend list shown in the dialog |
| 5 | P2 — Frontend | Source input in spend form is free-text `<Input>` not a `<Select>` dropdown | Replace with `<Select>` populated from `LeadSource.allowedValues()` (or a static list matching the backend) |
| 6 | P3 — Frontend | Trend chart shows ALL sources in dropdown; spec says max 5 (top by lead volume) with "Other sources" collapse | Cap `sorted` to top-5 by `leads_generated` for the trend source selector; add "Other sources" toggle |
| 7 | P3 — Tests | No test asserting ROI "N/A" edge case (conversions with no fee data) | Add test case with conversions all having `admission_fee_amount_cents = NULL` and verify `roi_display = 'N/A...'` |
| 8 | P3 — Tests | No test for period attribution correctness (conversion in different month than creation) | Add test: lead created Jan, converted March, verify it appears in March conversions not January |

---

## What Is Working Well

- End-to-end analytics pipeline is correct and production-ready: spend entry CRUD → `SourceRoiAnalyticsQueryService` aggregation → `SourceRoiMetricsFormatter` → controller response
- All 5 metrics computed correctly with proper zero-division handling (except the one edge case noted above)
- `SourceAnalyticsPeriodResolver::monthsOverlappingRange()` correctly implements BR-22 (full monthly spend for partial-month ranges)
- SQLite compatibility in query service makes tests reliable
- Module entitlement gating on every route (`module.source_analytics`)
- Audit logging on all spend entry mutations
- Tenant isolation test explicitly verifies cross-tenant spend entries are blocked
- `OTHER_OFFLINE` source correctly added to `LeadSource` VO
- Test suite is well-structured with reusable `SeedsSourceAnalyticsCapabilities` trait
