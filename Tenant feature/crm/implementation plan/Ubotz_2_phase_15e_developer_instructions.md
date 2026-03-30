# UBOTZ 2.0 — Phase 15E Developer Instructions

## Source ROI Analytics

| Field | Value |
|---|---|
| **Document Type** | Developer Instruction (Pre-Implementation Brief) |
| **Phase** | 15E |
| **Date** | March 26, 2026 |
| **Issued By** | Principal Engineer / Architecture Auditor |
| **Audience** | Implementation Developer (Antigravity) |
| **Expected Deliverable** | Phase 15E Implementation Plan |
| **Prerequisites** | Phase 15A COMPLETE (Lead Management with source tracking, pipeline stages, lead-to-student conversion), Phase 15C-II RECOMMENDED (Lead Scoring — enriches analytics with temperature data, but not a hard dependency) |

> **This phase answers the question every institution owner asks: "Which marketing channel is actually worth the money?" The CRM already tracks where leads come from (source) and which ones convert to students. Phase 15E adds spend tracking and computes the metrics that connect marketing investment to admission outcomes: Cost per Lead, Cost per Admission, Conversion Rate, ROI, and Lead-to-Admission Time. Manual spend entry in Phase 1, with API auto-fill from ad platforms planned for a future phase.**

---

## 1. Mission Statement

Phase 15E builds a **Source ROI Analytics** dashboard within the existing `TenantAdminDashboard/LeadManagement` bounded context.

The system has two data inputs:
1. **Lead and conversion data** — already tracked by the CRM (source, stage, created_at, converted_at). This is automatic.
2. **Marketing spend data** — new in this phase. Tenant admins manually enter how much they spent per source per month.

From these two inputs, the system computes five key metrics per source, per time period:

| Metric | Formula | What It Answers |
|---|---|---|
| **Cost per Lead (CPL)** | Spend ÷ Leads Generated | "How much does it cost to get one enquiry from this channel?" |
| **Cost per Admission (CPA)** | Spend ÷ Conversions | "How much does it cost to get one actual student from this channel?" |
| **Conversion Rate** | Conversions ÷ Leads Generated × 100 | "What percentage of leads from this channel actually enroll?" |
| **ROI** | (Revenue − Spend) ÷ Spend × 100 | "For every ₹1 spent on this channel, how much profit do we make?" |
| **Lead-to-Admission Time** | Average days from lead created_at to conversion | "How long does it take for leads from this channel to become students?" |

**What this phase includes:**
- Monthly spend entry per source (manual input by tenant admin)
- Spend entry CRUD (create, update, delete entries)
- Source performance dashboard with all 5 metrics
- Time period filtering (month, quarter, year, custom date range)
- Source comparison view (side-by-side metrics across all sources)
- Optional revenue capture at lead conversion (admission fee amount)
- Revenue-per-source aggregation for ROI calculation
- Source performance trend charts (CPL, CPA, conversion rate over months)
- CSV export of analytics data
- Plan-gated via `module.source_analytics` module entitlement

**What this phase does NOT include:**
- API integration with Google Ads / Meta Ads to auto-pull spend data (future phase)
- Campaign-level tracking (future — monthly source-level in Phase 1)
- Attribution modeling (multi-touch attribution, first-touch vs last-touch — future)
- Predictive analytics or forecasting
- Benchmark comparisons across tenants
- Cost tracking for WhatsApp messages (15D) or other platform costs

---

## 2. Business Context

### 2.1 Current State

The CRM tracks lead sources — every lead has a `source` field (referral, walk_in, website, google_ads, facebook_ads, etc.). Stage transitions are timestamped. Lead-to-student conversion is tracked. But there is no mechanism to:
- Record how much was spent on each marketing channel
- Calculate cost-per-lead or cost-per-admission by source
- Compare source effectiveness over time
- Determine which channels deliver positive ROI

Institution owners make marketing budget decisions based on gut feeling: "Google Ads feels like it works, so let's keep spending." They have no data to prove whether ₹50,000/month on Google Ads produces better results than ₹20,000/month on Facebook Ads or ₹0 on referral programs.

### 2.2 What Changes

After Phase 15E:
1. Tenant admin logs monthly marketing spend per source: "March 2026 — Google Ads: ₹50,000, Facebook Ads: ₹30,000, Event Sponsorship: ₹15,000."
2. The dashboard automatically computes: "Google Ads: 120 leads, 18 conversions, CPL ₹417, CPA ₹2,778, Conversion Rate 15%, Lead-to-Admission 12 days."
3. Side-by-side comparison shows: "Referrals: 0 spend, 45 leads, 22 conversions, 49% conversion rate. Google Ads: ₹50,000 spend, 120 leads, 18 conversions, 15% conversion rate."
4. The institution owner sees immediately: referrals convert 3x better than Google Ads, and walk-ins convert better than both. Marketing budget can be reallocated with data backing the decision.
5. If revenue is captured at conversion, ROI shows: "Google Ads: spent ₹50,000, generated ₹1,80,000 in admission fees, ROI = 260%."

### 2.3 Data Flow

```
Manual Input                    Automatic (existing CRM data)
     │                                    │
     ▼                                    ▼
Source Spend Entries          Leads table (source, created_at,
(source, month, amount)       stage, converted_at, revenue_amount)
     │                                    │
     └──────────────┬─────────────────────┘
                    ▼
          Analytics Engine
          (aggregation queries)
                    │
                    ▼
         Source ROI Dashboard
    (CPL, CPA, Conversion Rate, ROI,
     Lead-to-Admission Time, Trends)
```

---

## 3. Business Rules (NON-NEGOTIABLE)

### 3.1 Spend Entry Rules

| Rule ID | Rule | Detail |
|---|---|---|
| BR-01 | Spend entries are recorded per source per month. One entry per (source, year, month) combination per tenant. | Unique constraint: `(tenant_id, source, year, month)`. |
| BR-02 | The source dropdown shows ALL values from the existing `LeadSource` value object plus an "Other / Offline" option for unlisted channels. | Spend sources must match the sources assigned to leads. |
| BR-03 | The amount is stored in `_cents` integer format (₹50,000 = 5000000 cents). No floats. | Consistent with platform financial storage convention. |
| BR-04 | Spend entries can be created, updated, and deleted. Deletion is a soft delete. | Admins may correct mistakes. Soft delete preserves audit trail. |
| BR-05 | Spend entries with amount = 0 are valid and meaningful — they represent channels with zero marketing cost (e.g., referrals, organic walk-ins). This enables the dashboard to show conversion metrics for zero-cost sources. | A source with 0 spend and 20 conversions has CPL = ₹0, CPA = ₹0 — which is the point. |
| BR-06 | Only users with `crm.analytics.manage` capability can create/edit/delete spend entries. | Prevents counselors from modifying financial data. |
| BR-07 | All spend entry changes are audit-logged with old and new values. | Standard audit pattern. |

### 3.2 Revenue Capture Rules

| Rule ID | Rule | Detail |
|---|---|---|
| BR-08 | When a lead is converted to a student (via `ConvertLeadUseCase`), an optional `admission_fee_amount` field is available on the conversion form. | This captures the revenue associated with this lead's conversion. Stored in `_cents` format on the `leads` table. |
| BR-09 | `admission_fee_amount` is optional. If not provided, the lead's revenue contribution is treated as unknown. ROI calculation excludes leads with unknown revenue. | The dashboard shows "ROI: ₹X (based on Y of Z conversions with fee data)" — transparent about data completeness. |
| BR-10 | `admission_fee_amount` can be updated after conversion if the fee was not known at conversion time. | Admin can retroactively add fee data. |
| BR-11 | Revenue per source = SUM of `admission_fee_amount` for all converted leads from that source within the time period. | Simple aggregation. No complex revenue recognition rules. |

### 3.3 Metric Calculation Rules

| Rule ID | Rule | Detail |
|---|---|---|
| BR-12 | **Leads Generated** = COUNT of leads WHERE `source = X` AND `created_at` within the time period. | Includes all leads regardless of current stage (even rejected). A lead that was created counts as "generated." |
| BR-13 | **Conversions** = COUNT of leads WHERE `source = X` AND `stage = 'admission_confirmed'` AND the stage transition to `admission_confirmed` occurred within the time period. | The conversion is attributed to the period when admission was confirmed, NOT when the lead was created. A lead created in January and converted in March counts as a March conversion. |
| BR-14 | **CPL** = spend_cents ÷ leads_generated. If leads_generated = 0, CPL = "N/A". | Cannot divide by zero. Display "N/A" or "—" in the dashboard. |
| BR-15 | **CPA** = spend_cents ÷ conversions. If conversions = 0, CPA = "N/A". | Same zero-division handling. |
| BR-16 | **Conversion Rate** = (conversions ÷ leads_generated) × 100. If leads_generated = 0, rate = "N/A". | Percentage with one decimal place (e.g., 15.0%). |
| BR-17 | **ROI** = ((revenue_cents − spend_cents) ÷ spend_cents) × 100. If spend = 0, ROI = "∞" (infinite return). If revenue data is incomplete, ROI shows with a caveat. | Zero spend with conversions = infinite ROI (organic/referral channels). |
| BR-18 | **Lead-to-Admission Time** = AVERAGE of (conversion_timestamp − lead_created_at) in days, for all converted leads from that source within the time period. | Rounded to 1 decimal place (e.g., 12.3 days). |
| BR-19 | All monetary metrics are displayed in the tenant's configured currency (from tenant settings). | Default: INR (₹). Uses existing tenant currency configuration from Phase 10C. |
| BR-20 | Metrics are computed **on-demand** via aggregation queries, NOT pre-calculated and stored. The data volume (spend entries + leads) is small enough for real-time computation. | No materialized views or pre-aggregation tables in Phase 1. If performance becomes an issue at scale, add caching later. |

### 3.4 Time Period Rules

| Rule ID | Rule | Detail |
|---|---|---|
| BR-21 | The dashboard supports these time period filters: **This Month**, **Last Month**, **This Quarter**, **Last Quarter**, **This Year**, **Last Year**, **Custom Range** (date picker). | Default view: This Month. |
| BR-22 | Spend data is monthly — if a custom range spans partial months, the spend is NOT prorated. The full monthly spend is included if any day of that month falls within the range. | Example: Custom range March 15–April 15 includes full March spend + full April spend. This is simpler and more honest than prorating. |
| BR-23 | Lead and conversion counts use exact date filtering — a lead created on March 15 is included in March 15–April 15 range. | Precise filtering on `created_at` and conversion timestamp. |

---

## 4. Domain Model

### 4.1 Bounded Context Placement

All components live within `TenantAdminDashboard/LeadManagement/` — extending the existing CRM bounded context. Source ROI Analytics is a read-heavy reporting feature with one write model (spend entries).

### 4.2 New Domain Layer Components

**Path:** `app/Domain/TenantAdminDashboard/LeadManagement/`

| Component | Type | Location | Purpose |
|---|---|---|---|
| `SourceSpendEntryEntity` | Entity | `Entities/SourceSpendEntryEntity.php` | Represents a monthly spend record for a source. Holds source, year, month, amount_cents. Validates amount ≥ 0, month 1–12. |
| `SourceSpendEntryCreated` | Domain Event | `Events/SourceSpendEntryCreated.php` | Dispatched when a spend entry is created. |
| `SourceSpendEntryUpdated` | Domain Event | `Events/SourceSpendEntryUpdated.php` | Dispatched when a spend entry is updated. |
| `SourceSpendEntryRepositoryInterface` | Repository Interface | `Repositories/SourceSpendEntryRepositoryInterface.php` | CRUD for spend entries. Query by source, date range. |
| `DuplicateSpendEntryException` | Exception | `Exceptions/DuplicateSpendEntryException.php` | Thrown when a spend entry already exists for (source, year, month). |

### 4.3 New Application Layer Components

**Path:** `app/Application/TenantAdminDashboard/LeadManagement/`

| Component | Type | Purpose |
|---|---|---|
| `CreateSpendEntryUseCase` | Use Case | Creates a monthly spend entry. Validates uniqueness (source + month). Dispatches event. |
| `UpdateSpendEntryUseCase` | Use Case | Updates an existing spend entry's amount. Audit-logged with old/new values. |
| `DeleteSpendEntryUseCase` | Use Case | Soft-deletes a spend entry. Audit-logged. |
| `ListSpendEntriesQuery` | Query | Paginated list of spend entries. Filterable by source, date range. |
| `GetSourceROIAnalyticsQuery` | Query | **The core analytics query.** Accepts a time period, aggregates leads, conversions, spend, revenue per source, and computes all 5 metrics. Returns a structured result set. |
| `GetSourceTrendQuery` | Query | Returns monthly metric values for a single source over a date range (for trend charts). |
| `ExportSourceAnalyticsCsvUseCase` | Use Case | Generates a CSV file of the analytics data for download. |
| `UpdateLeadRevenueUseCase` | Use Case | Updates `admission_fee_amount` on a converted lead. Can be called at conversion time or retroactively. |
| `CreateSpendEntryCommand` | Command DTO | `source` (string), `year` (int), `month` (int), `amount_cents` (int). |

### 4.4 Modified Application Layer Components

| Component | Modification |
|---|---|
| `ConvertLeadUseCase` (15A) | Extended to accept optional `admission_fee_amount_cents` parameter. If provided, stored on the lead record. |
| `ConvertLeadCommand` (15A) | Extended with optional `admission_fee_amount_cents` field. |

### 4.5 New Infrastructure Layer Components

| Component | Type | Purpose |
|---|---|---|
| `SourceSpendEntryRecord` | Eloquent Model | Maps to `source_spend_entries`. `BelongsToTenant` trait. Soft deletes. |
| `EloquentSourceSpendEntryRepository` | Repository | Implements `SourceSpendEntryRepositoryInterface`. |
| `SourceROIAnalyticsQueryService` | Infrastructure Query Service | Executes the aggregation queries for the analytics dashboard. Uses raw SQL for performance (GROUP BY source, JOINs with spend entries). |

### 4.6 HTTP Layer

**Controllers:**

`app/Http/Controllers/Api/TenantAdminDashboard/LeadManagement/`

| Endpoint | Method | Capability |
|---|---|---|
| `POST /api/tenant/crm/spend-entries` | Create spend entry | `crm.analytics.manage` |
| `GET /api/tenant/crm/spend-entries` | List spend entries | `crm.analytics.view` |
| `PUT /api/tenant/crm/spend-entries/{id}` | Update spend entry | `crm.analytics.manage` |
| `DELETE /api/tenant/crm/spend-entries/{id}` | Delete spend entry | `crm.analytics.manage` |
| `GET /api/tenant/crm/source-analytics` | Get source ROI dashboard data | `crm.analytics.view` |
| `GET /api/tenant/crm/source-analytics/trend` | Get source trend data (for charts) | `crm.analytics.view` |
| `GET /api/tenant/crm/source-analytics/export` | Download CSV export | `crm.analytics.view` |
| `PUT /api/tenant/leads/{lead}/admission-fee` | Update admission fee on a converted lead | `crm.analytics.manage` |

**Form Requests:**

| Request | Validates |
|---|---|
| `CreateSpendEntryRequest` | `source` (required, from `LeadSource` values + `other_offline`), `year` (required, integer, 2020–2030), `month` (required, integer, 1–12), `amount` (required, numeric, ≥ 0, converted to cents). |
| `UpdateSpendEntryRequest` | `amount` (required, numeric, ≥ 0, converted to cents). |
| `GetSourceAnalyticsRequest` | `period` (optional: `this_month`, `last_month`, `this_quarter`, `last_quarter`, `this_year`, `last_year`, `custom`), `from_date` (required if period = custom), `to_date` (required if period = custom). |
| `GetSourceTrendRequest` | `source` (required), `from_date` (required), `to_date` (required), `metric` (required: `cpl`, `cpa`, `conversion_rate`, `roi`, `lead_time`). |
| `UpdateAdmissionFeeRequest` | `admission_fee_amount` (required, numeric, > 0, converted to cents). |

**API Resources:**

| Resource | Shapes |
|---|---|
| `SpendEntryResource` | `id`, `source`, `source_label`, `year`, `month`, `month_label` (e.g., "March 2026"), `amount` (formatted ₹), `amount_cents`, `created_at`, `updated_at` |
| `SourceAnalyticsResource` | `source`, `source_label`, `leads_generated`, `conversions`, `spend` (formatted), `spend_cents`, `revenue` (formatted), `revenue_cents`, `revenue_data_coverage` (e.g., "15 of 18 conversions have fee data"), `cpl` (formatted or "N/A"), `cpa` (formatted or "N/A"), `conversion_rate` (% or "N/A"), `roi` (% or "N/A" or "∞"), `avg_lead_to_admission_days` (number or "N/A") |
| `SourceTrendResource` | `source`, `data_points[]` → `{ month, year, month_label, value }` |

**Capability Codes:**

| Code | Who Has It | Purpose |
|---|---|---|
| `crm.analytics.view` | Admins, Branch Managers | View source analytics dashboard |
| `crm.analytics.manage` | Admins only | Create/edit/delete spend entries, update admission fees |

---

## 5. Database Schema

### 5.1 New Tables

**`source_spend_entries`** (tenant-scoped)

| Column | Type | Notes |
|---|---|---|
| `id` | BIGINT UNSIGNED PK | Auto-increment |
| `tenant_id` | BIGINT UNSIGNED NOT NULL | FK → `tenants.id`. Global scope enforced. |
| `source` | VARCHAR(30) NOT NULL | Lead source code (from `LeadSource` value object + `other_offline`). |
| `year` | SMALLINT UNSIGNED NOT NULL | e.g., 2026. |
| `month` | TINYINT UNSIGNED NOT NULL | 1–12. |
| `amount_cents` | BIGINT UNSIGNED NOT NULL | Spend in smallest currency unit (paise for INR). ₹50,000 = 5000000. |
| `notes` | VARCHAR(500) NULLABLE | Optional notes (e.g., "Includes agency fee"). |
| `created_by` | BIGINT UNSIGNED NOT NULL | FK → `users.id`. |
| `deleted_at` | TIMESTAMP NULLABLE | Soft delete. |
| `created_at` | TIMESTAMP | |
| `updated_at` | TIMESTAMP | |

**Indexes:**
- `unq_spend_entry` → `(tenant_id, source, year, month)` UNIQUE WHERE `deleted_at IS NULL` — one entry per source per month per tenant
- `idx_spend_entries_tenant` → `(tenant_id, year, month)`

### 5.2 Modified Tables

**`leads`** — Add column:

| Column | Type | Notes |
|---|---|---|
| `admission_fee_amount_cents` | BIGINT UNSIGNED NULLABLE | Fee amount captured at or after conversion. NULL = not provided. |

### 5.3 Existing Data Dependencies

The analytics queries depend on these existing columns:

| Table | Column | Used For |
|---|---|---|
| `leads` | `source` | Grouping leads by source |
| `leads` | `created_at` | Counting leads generated per period |
| `leads` | `stage` | Identifying converted leads (`admission_confirmed`) |
| `leads` | `stage_changed_at` | Determining when conversion happened (for period attribution) |
| `tenant_audit_logs` | Stage transition records | Alternative source for conversion timestamps if `stage_changed_at` only stores the latest transition |

**Important verification for the implementation plan:** The developer must verify how conversion timing is tracked. If `stage_changed_at` on the `leads` table only reflects the LATEST stage change (not specifically the admission_confirmed transition), the analytics query may need to look at `tenant_audit_logs` for the exact timestamp when the lead reached `admission_confirmed`. The implementation plan must document which data source is used and why.

---

## 6. Analytics Query — Detailed Specification

### 6.1 Core Analytics Query

The `GetSourceROIAnalyticsQuery` returns one row per source with all metrics. Conceptually:

```sql
-- Leads generated per source in the period
SELECT source, COUNT(*) as leads_generated
FROM leads
WHERE tenant_id = ? AND created_at BETWEEN ? AND ?
  AND deleted_at IS NULL
GROUP BY source

-- Conversions per source in the period
-- (leads whose stage became 'admission_confirmed' within the period)
SELECT source, COUNT(*) as conversions
FROM leads
WHERE tenant_id = ? AND stage = 'admission_confirmed'
  AND [conversion_timestamp] BETWEEN ? AND ?
  AND deleted_at IS NULL
GROUP BY source

-- Revenue per source in the period
SELECT source,
       SUM(admission_fee_amount_cents) as revenue_cents,
       COUNT(admission_fee_amount_cents) as revenue_data_count
FROM leads
WHERE tenant_id = ? AND stage = 'admission_confirmed'
  AND [conversion_timestamp] BETWEEN ? AND ?
  AND admission_fee_amount_cents IS NOT NULL
  AND deleted_at IS NULL
GROUP BY source

-- Spend per source in the period
SELECT source, SUM(amount_cents) as spend_cents
FROM source_spend_entries
WHERE tenant_id = ? AND deleted_at IS NULL
  AND (year, month) within the period range
GROUP BY source

-- Lead-to-admission time per source
SELECT source, AVG(DATEDIFF([conversion_timestamp], created_at)) as avg_days
FROM leads
WHERE tenant_id = ? AND stage = 'admission_confirmed'
  AND [conversion_timestamp] BETWEEN ? AND ?
  AND deleted_at IS NULL
GROUP BY source
```

The application layer combines these results per source and computes the derived metrics (CPL, CPA, conversion rate, ROI).

### 6.2 Performance Considerations

- **No pre-aggregation in Phase 1.** A typical tenant has 500–5,000 leads and 12–24 spend entries. These queries complete in < 100ms on MySQL 8.0 with proper indexes.
- **If performance becomes an issue** at scale (10,000+ leads per tenant), the implementation plan can propose a `source_analytics_cache` table refreshed nightly. But this is premature optimization for Phase 1.
- **The query should be a single, well-optimized SQL query** (or at most 2–3 queries joined in PHP), NOT a loop that queries per source. The developer must avoid N+1 patterns.

### 6.3 Edge Cases

| Scenario | Handling |
|---|---|
| Source has leads but no spend entry | Show leads/conversions/rate. CPL/CPA = "₹0" (organic). ROI = "∞". |
| Source has spend but no leads | Show spend. CPL/CPA/Rate = "N/A". ROI = "-100%". |
| Source has conversions but no revenue data | Show CPL/CPA/Rate. ROI = "N/A — revenue data not entered". |
| Source has partial revenue data (e.g., 15 of 18 conversions have fee amounts) | ROI calculated from available revenue. Show "(based on 15 of 18 conversions)". |
| No data at all for the selected period | Dashboard shows empty state: "No lead or spend data for this period." |
| Lead created in Month A, converted in Month B | Lead counts in Month A's "generated". Conversion counts in Month B's "conversions". Spend from Month B is used for CPA. |

---

## 7. Frontend Requirements

### 7.1 Source ROI Dashboard

**Location:** CRM → Source Analytics (new navigation item)

**Layout:**

**Top bar:** Time period selector (This Month / Last Month / This Quarter / Last Quarter / This Year / Last Year / Custom) + "Export CSV" button.

**Summary cards row:** Total Leads Generated, Total Conversions, Total Spend, Overall Conversion Rate, Overall CPL, Overall CPA — aggregated across ALL sources for the selected period.

**Source comparison table:** One row per source that has any data (leads or spend) in the selected period.

| Column | Description |
|---|---|
| Source | Source name with icon/color |
| Leads | Count of leads generated |
| Conversions | Count of leads that reached Admission Confirmed |
| Conv. Rate | Conversions ÷ Leads × 100 |
| Spend | Total spend formatted (₹50,000) |
| CPL | Cost per Lead (₹417 or "₹0" for organic or "—" if no leads) |
| CPA | Cost per Admission (₹2,778 or "—" if no conversions) |
| Revenue | Sum of admission fees from converted leads (₹1,80,000 or "—" if no data) |
| ROI | Percentage (260% or "∞" for zero-spend or "—" if no revenue data) |
| Avg. Time | Average lead-to-admission days (12.3 days or "—") |

Table sortable by any column. Default sort: Conversions descending.

**Color coding:**
- ROI > 100%: green
- ROI 0–100%: amber
- ROI < 0%: red
- Conversion Rate > 30%: green
- Conversion Rate 10–30%: amber
- Conversion Rate < 10%: red

### 7.2 Source Trend Charts

Below the table, a chart section showing metric trends over time:

- **Chart type:** Line chart (one line per source, X-axis = months, Y-axis = metric value)
- **Metric selector:** Toggle between CPL, CPA, Conversion Rate, Leads Generated (default: Conversion Rate)
- **Time range:** Last 6 months (default), expandable to 12 months
- **Max 5 sources shown** (top 5 by lead volume). Others collapsed under "Other sources" toggle.

### 7.3 Spend Entry Management

**Location:** CRM → Source Analytics → "Manage Spend" button (opens side panel or dedicated page)

**Spend entry list:** Table showing all entries sorted by date (newest first).
- Columns: Source, Month/Year, Amount, Notes, Created By, Actions (Edit, Delete)
- "Add Spend Entry" button → inline form or modal

**Add/Edit Spend Entry Form:**
- Source: dropdown (all `LeadSource` values + "Other / Offline")
- Month: month/year picker
- Amount: currency input (₹)
- Notes: optional text field
- Validation: duplicate (source + month) check inline

### 7.4 Conversion Fee Capture

**Modified Lead Conversion Flow:**

When the counselor clicks "Convert to Student" on a lead, the existing conversion dialog is extended with an optional field:

- **Admission Fee Amount** (₹): optional numeric input
- Helper text: "Enter the admission fee paid by this student. This helps calculate marketing ROI."
- If skipped, the field remains null — ROI is calculated from leads where this data exists.

**Lead Detail Page — Post-Conversion:**

For converted leads, the lead detail page shows:
- "Admission Fee: ₹75,000" (editable by admin via pencil icon)
- Or "Admission Fee: Not entered" with "Add fee" link

### 7.5 CSV Export

The "Export CSV" button generates a downloadable CSV with columns:

```
Source, Leads Generated, Conversions, Conversion Rate (%), Spend (₹), CPL (₹), CPA (₹), Revenue (₹), ROI (%), Avg Lead-to-Admission (days)
```

One row per source. Period noted in the filename: `source_analytics_march_2026.csv`.

---

## 8. Security Boundaries

### 8.1 Tenant Isolation

- Spend entries are tenant-scoped via `BelongsToTenant` trait.
- Analytics queries are tenant-scoped — a tenant never sees another tenant's lead counts, spend, or revenue.
- CSV export contains only the requesting tenant's data.

### 8.2 Authorization

- `crm.analytics.view`: View the dashboard, trend charts, and export CSV. Branch Managers and Admins.
- `crm.analytics.manage`: Create/edit/delete spend entries and update admission fees. Admins only.
- Counselors cannot access source analytics — this is management-level data.

### 8.3 Financial Data

- Spend amounts are stored as `_cents` integers — no float precision issues.
- Admission fee amounts are stored as `_cents` integers — consistent with platform convention.
- No Razorpay or payment gateway integration — revenue is manually entered (or captured at conversion). This is informational data, not transactional.

---

## 9. Module Entitlement

| Module Code | Description | Effect When Absent |
|---|---|---|
| `module.source_analytics` | Source ROI Analytics feature | Analytics navigation item hidden. Spend entry endpoints return 403. Dashboard endpoints return 403. Revenue field hidden from conversion flow. Existing data preserved. |

---

## 10. Implementation Plan Requirements

| # | Section | Content |
|---|---|---|
| 1 | Executive Summary | What gets built, what does NOT |
| 2 | Dependency Verification | Verify: `LeadSource` value object values, `ConvertLeadUseCase` signature, `leads` table schema (confirm `stage_changed_at` tracks admission_confirmed transition correctly or identify alternative data source for conversion timestamps), `tenant_audit_logs` stage transition records. |
| 3 | Architecture Decisions | Any deviations. Conversion timestamp source: `stage_changed_at` vs `tenant_audit_logs`. |
| 4 | Migration Plan | New table, new column on leads. Exact SQL. |
| 5 | Domain Layer | Entity, events, exceptions, repository interface. |
| 6 | Application Layer | UseCases, queries, CSV export. ConvertLeadUseCase modification. |
| 7 | Infrastructure Layer | Eloquent model, repository, analytics query service (raw SQL). |
| 8 | HTTP Layer | Controllers, form requests, resources, routes with capability codes. |
| 9 | Analytics Query Specification | Exact SQL for the core analytics query. Edge case handling. Performance assessment. |
| 10 | Frontend Specification | Dashboard layout, table, charts, spend management UI, conversion fee capture. |
| 11 | Implementation Sequence | Ordered steps with dependencies and day estimates. |
| 12 | Test Plan | Every test file with description. |
| 13 | Quality Gate Verification | Checklist from §11. |
| 14 | File Manifest | Every new and modified file. |

---

## 11. Quality Gates

### 11.1 Spend Entry Gates

- [ ] Create spend entry for a source and month — stored correctly
- [ ] Duplicate entry (same source + month) rejected with clear error
- [ ] Update spend entry — amount changes, audit-logged with old/new values
- [ ] Delete spend entry — soft-deleted, excluded from analytics, audit-logged
- [ ] Zero-amount spend entry is valid and accepted
- [ ] All `LeadSource` values available in the source dropdown

### 11.2 Analytics Calculation Gates

- [ ] CPL = spend ÷ leads. Verified with manual calculation for test data.
- [ ] CPA = spend ÷ conversions. Verified with manual calculation.
- [ ] Conversion Rate = conversions ÷ leads × 100. Verified.
- [ ] ROI = (revenue − spend) ÷ spend × 100. Verified with test data.
- [ ] Lead-to-Admission Time = average days from created_at to conversion. Verified.
- [ ] Zero leads → CPL/CPA/Rate = "N/A"
- [ ] Zero spend → CPL = "₹0", ROI = "∞"
- [ ] Zero conversions → CPA = "N/A", ROI = "-100%"
- [ ] Partial revenue data → ROI shows with coverage note
- [ ] Period filtering works correctly for all preset periods (this month, last month, etc.)
- [ ] Custom date range filtering works correctly
- [ ] Conversion attributed to the period when admission was confirmed, not when lead was created

### 11.3 Revenue Capture Gates

- [ ] Admission fee field appears in conversion flow (optional)
- [ ] Fee amount stored in `_cents` format on leads table
- [ ] Fee can be updated retroactively from lead detail page
- [ ] Revenue aggregation includes only leads with fee data
- [ ] Revenue data coverage shown in dashboard ("15 of 18 conversions")

### 11.4 Frontend Gates

- [ ] Dashboard displays all 5 metrics per source in a comparison table
- [ ] Table sortable by any column
- [ ] Trend chart shows metric over months for selected sources
- [ ] Spend management UI: create, edit, delete entries
- [ ] CSV export downloads with correct data
- [ ] Color coding applied to ROI and conversion rate values
- [ ] Summary cards show aggregated totals across all sources

### 11.5 Security Gates

- [ ] Tenant isolation: Tenant A cannot see Tenant B's analytics
- [ ] `crm.analytics.view` capability required for dashboard access
- [ ] `crm.analytics.manage` capability required for spend entry CRUD and fee updates
- [ ] Module entitlement enforced: tenant without `module.source_analytics` gets 403
- [ ] All spend entry changes audit-logged

### 11.6 Regression Gates

- [ ] Existing lead management tests pass (0 regressions)
- [ ] Lead conversion flow works with and without the fee amount field
- [ ] PHPStan Level 5 passes with 0 new errors

---

## 12. Constraints & Reminders

### Architecture Constraints

- **Analytics are computed on-demand, not pre-aggregated.** No caching tables, no materialized views. The data volume does not justify the complexity. If this changes at scale, add caching as a performance optimization — not an architectural change.
- **The analytics query service uses raw SQL, not Eloquent.** GROUP BY + SUM + COUNT + JOIN queries are cleaner and faster in raw SQL than Eloquent's query builder for analytics use cases. The service lives in the Infrastructure layer.
- **Revenue is optional and self-reported.** Do NOT block the analytics dashboard on revenue data. CPL, CPA, conversion rate, and lead-to-admission time all work without revenue. ROI is the only metric that requires it.
- **Spend is monthly granularity.** Do NOT add daily or weekly spend tracking. Monthly is the standard budget cycle for education marketing. Campaign-level tracking is a future phase.
- **The `ConvertLeadUseCase` modification is minimal.** Add one optional parameter (`admission_fee_amount_cents`). Do NOT refactor the conversion flow.
- **Audit logs OUTSIDE transactions.** Same as all previous phases.

### Docker Environment

- Container: Alpine Linux — use `sh` not `bash`
- Container name: `ubotz_backend`

### What NOT to Do

- Do NOT build API integrations with Google Ads or Meta Ads. Manual spend entry only in Phase 15E.
- Do NOT build campaign-level tracking. Source-level monthly spend only.
- Do NOT build multi-touch attribution models. Leads have one source (first-touch) — that's the attribution model.
- Do NOT pre-aggregate analytics into summary tables. Compute on demand.
- Do NOT make `admission_fee_amount` a required field on conversion. It must remain optional.
- Do NOT store spend amounts as floats or decimals. Use `_cents` integer format.
- Do NOT expose revenue data to counselors. Only admins and branch managers via `crm.analytics.view`.
- Do NOT build predictive analytics or forecasting. This is a retrospective reporting tool.

---

## 13. Definition of Done

Phase 15E is complete when:

1. The implementation plan has been reviewed and approved by the Principal Engineer.
2. All code is implemented per the approved plan.
3. All quality gates in §11 pass.
4. A Principal Engineer audit confirms zero critical or high findings.
5. All findings from audit are resolved.
6. End-to-end demonstration:
   a. Admin enters spend: "Google Ads — March 2026 — ₹50,000."
   b. The CRM has 120 leads from Google Ads in March, 18 converted.
   c. Dashboard shows: CPL ₹417, CPA ₹2,778, Conversion Rate 15.0%.
   d. 15 of 18 conversions have admission fee data totaling ₹13,50,000.
   e. Dashboard shows: Revenue ₹13,50,000 (based on 15 of 18), ROI 2600%.
   f. Referral source shows: 0 spend, 45 leads, 22 conversions, 49% rate, CPL ₹0, ROI ∞.
   g. Trend chart shows conversion rate by source over last 6 months.
   h. CSV export downloads with correct data.
   i. Tenant without `module.source_analytics` cannot access the feature.
7. Zero regression in existing test suite.
8. PHPStan Level 5 passes with 0 new errors.
9. The Phase 15E Completion Report is signed off.

---

*End of Document — UBOTZ 2.0 Phase 15E Developer Instructions — March 26, 2026*
