# UBOTZ 2.0 — Phase 15F Developer Instructions

## CRM Reporting Dashboard

| Field | Value |
|---|---|
| **Document Type** | Developer Instruction (Pre-Implementation Brief) |
| **Phase** | 15F |
| **Date** | March 26, 2026 |
| **Issued By** | Principal Engineer / Architecture Auditor |
| **Audience** | Implementation Developer (Antigravity) |
| **Expected Deliverable** | Phase 15F Implementation Plan |
| **Prerequisites** | Phase 15A COMPLETE (Lead Management with pipeline, source, auto-assign), Phase 15C-I COMPLETE (Structured Activities, Follow-up Tasks with statuses), Phase 15C-II RECOMMENDED (Lead Scoring — enriches reports with temperature data) |

> **This phase builds the CRM management reporting layer — 6 reports that give institution owners, branch managers, and admins complete visibility into counselor performance, pipeline health, and operational bottlenecks. Every data point comes from systems already built (leads, activities, follow-ups, conversions, branches). This is a pure read-only analytics layer with zero new data capture. The hardest part is writing efficient aggregation queries, not modeling new domains.**

---

## 1. Mission Statement

Phase 15F builds a **CRM Reporting Dashboard** with 6 distinct reports, all within the existing `TenantAdminDashboard/LeadManagement` bounded context.

The reports answer the management questions that drive admissions team performance:

| # | Report | The Question It Answers |
|---|---|---|
| 1 | **Counselor Performance** | "Who on my team is working leads effectively?" |
| 2 | **Pipeline Velocity** | "How fast do leads move through stages? Where do they get stuck?" |
| 3 | **Branch Comparison** | "Which branch is performing best?" |
| 4 | **Lead Funnel** | "Where are we losing leads in the pipeline?" |
| 5 | **Activity Heatmap** | "When is my team most/least active?" |
| 6 | **Overdue Follow-ups** | "Who has the most missed commitments right now?" |

**What this phase includes:**
- 6 report endpoints with time period filtering
- CRM Reports dashboard page with report navigation
- Per-report visualization (tables, charts, funnel diagram, heatmap grid)
- Scoping: counselors see own metrics, branch managers see branch, admins see all
- CSV export per report
- Plan-gated via `module.crm_reports` module entitlement

**What this phase does NOT include:**
- Real-time live dashboard with auto-refresh (polling at page load is sufficient)
- Custom report builder (tenants cannot create their own report definitions)
- Scheduled report email delivery ("email me the weekly counselor report every Monday")
- Historical trend comparison ("compare this month vs same month last year")
- Predictive analytics or forecasting
- Target/goal setting ("Rahul's target: 50 calls/week") — future enhancement

---

## 2. Business Rules (NON-NEGOTIABLE)

### 2.1 General Report Rules

| Rule ID | Rule | Detail |
|---|---|---|
| BR-01 | All reports support time period filtering: This Week, Last Week, This Month, Last Month, This Quarter, Custom Range. Default: This Month. | Consistent filtering across all 6 reports. |
| BR-02 | Reports respect authorization scoping. Counselors see only their own data. Branch managers see their branch(es). Admins see all data across the tenant. | Same `BranchAccessPolicy` pattern from 15A. |
| BR-03 | All reports are computed on-demand via aggregation queries. No pre-aggregation tables. | Data volumes (< 10,000 leads, < 50,000 activities per tenant) do not justify pre-aggregation. |
| BR-04 | Each report has a CSV export option that downloads the tabular data. | Same export pattern as 15E. |
| BR-05 | Reports exclude soft-deleted leads. | `deleted_at IS NULL` filter on all queries. |
| BR-06 | Reports are gated behind `module.crm_reports` module entitlement. | Navigation item hidden, endpoints return 403 when module absent. |

### 2.2 Access Control

| Capability | Who Has It | What They See |
|---|---|---|
| `crm.reports.view` | Admins | All reports, all data across the entire tenant |
| `crm.reports.view` | Branch Managers | All reports, scoped to leads/counselors in their branch(es) |
| `crm.reports.own` | Counselors | Only Report 1 (Counselor Performance) — their own metrics only |

Counselors cannot see other counselors' performance, branch comparisons, or the overdue follow-ups of other team members. They can see their own performance metrics as a self-assessment tool.

---

## 3. Report Specifications

### 3.1 Report 1 — Counselor Performance

**Purpose:** Rank counselors by activity volume and effectiveness.

**Metrics per counselor (for the selected period):**

| Metric | Source | Calculation |
|---|---|---|
| Total Activities | `lead_activities` | COUNT WHERE `performed_by = counselor_id` |
| Calls Made | `lead_activities` | COUNT WHERE `type = 'call'` |
| WhatsApp Messages | `lead_activities` | COUNT WHERE `type = 'whatsapp'` |
| Meetings | `lead_activities` | COUNT WHERE `type = 'meeting'` |
| Demo Classes | `lead_activities` | COUNT WHERE `type = 'demo_class'` |
| Unique Leads Contacted | `lead_activities` | COUNT DISTINCT `lead_id` |
| Follow-ups Completed | `lead_follow_up_tasks` | COUNT WHERE `assigned_to = counselor_id` AND `status = 'completed'` |
| Follow-ups Missed | `lead_follow_up_tasks` | COUNT WHERE `assigned_to = counselor_id` AND `status = 'overdue'` |
| Follow-up Completion Rate | Derived | Completed ÷ (Completed + Missed) × 100 |
| Leads Converted | `leads` | COUNT WHERE `assigned_to = counselor_id` AND stage transitioned to `admission_confirmed` in period |
| Conversion Rate | Derived | Leads Converted ÷ Unique Leads Contacted × 100 |

**Display:** Sortable table, one row per counselor. Default sort: Total Activities descending.

**Visualization:** Horizontal bar chart comparing top 10 counselors by Total Activities or Conversion Rate (toggle).

---

### 3.2 Report 2 — Pipeline Velocity

**Purpose:** Measure how fast leads move through each stage and identify bottlenecks.

**Metrics per stage transition (for leads that completed the transition in the selected period):**

| Metric | Calculation |
|---|---|
| Average Time in Stage (days) | AVG of (exit_timestamp − entry_timestamp) for all leads that exited this stage in the period |
| Median Time in Stage (days) | MEDIAN of the same (if feasible in SQL; otherwise P50 approximation) |
| Leads Currently in Stage | COUNT of leads with `stage = X` right now (snapshot, not period-filtered) |
| Leads that Exited Stage | COUNT of leads that moved OUT of this stage in the period |

**Stage transition timing:** Derived from `tenant_audit_logs` entries with action `lead.stage_changed`. Each log entry records `old_stage`, `new_stage`, and timestamp. Time in stage = timestamp of exit audit log − timestamp of entry audit log.

**Important implementation note:** The developer must query `tenant_audit_logs` for stage transition timestamps, NOT rely solely on `leads.stage_changed_at` (which only stores the latest change). The audit log has the full history.

**Display:** Table with one row per stage (New Enquiry → Contacted → Interested → App Submitted → Admission Confirmed). Rejected is excluded from velocity (it's an exit, not a progression).

**Visualization:** Horizontal bar chart showing average days per stage. Bottleneck stage highlighted (longest average time) in red/amber.

---

### 3.3 Report 3 — Branch Comparison

**Purpose:** Compare admissions performance across branches.

**Metrics per branch (for the selected period):**

| Metric | Calculation |
|---|---|
| Total Leads | COUNT leads WHERE `branch_id = X` AND `created_at` in period |
| New Leads (created in period) | Same as above |
| Conversions | COUNT leads WHERE `branch_id = X` AND converted in period |
| Conversion Rate | Conversions ÷ Total Leads × 100 |
| Active Counselors | COUNT DISTINCT `assigned_to` for leads in this branch |
| Avg Activities per Lead | Total activities on branch leads ÷ Total Leads |
| Hot Leads (current) | COUNT leads WHERE `branch_id = X` AND `lead_temperature = 'hot'` (snapshot) |
| Overdue Follow-ups (current) | COUNT follow-up tasks WHERE lead's `branch_id = X` AND `status = 'overdue'` (snapshot) |

**Display:** Sortable table, one row per branch. Default sort: Conversions descending.

**Visualization:** Grouped bar chart comparing Leads vs Conversions per branch.

**Scoping:** Admin sees all branches. Branch manager sees only their branch(es) — this report is most useful for admins who manage multiple branches.

---

### 3.4 Report 4 — Lead Funnel

**Purpose:** Show where leads drop off in the pipeline.

**Funnel stages (for leads created in the selected period, tracked to their current stage):**

| Stage | Count | Drop-off % |
|---|---|---|
| New Enquiry (entered pipeline) | 500 | — |
| Contacted | 380 | 24% dropped |
| Interested | 200 | 47% dropped |
| App Submitted | 90 | 55% dropped |
| Admission Confirmed | 45 | 50% dropped |

**Calculation:**
- Take all leads created in the selected period (the cohort)
- For each stage, count how many leads in the cohort reached that stage (ever, not just currently at it)
- "Reached" = the lead's stage is currently at or past this stage, OR the lead has an audit log showing it was at this stage at some point
- Drop-off % = (previous_stage_count − this_stage_count) ÷ previous_stage_count × 100

**Rejected leads:** Shown as a separate "Rejected" bar/count below the funnel. Not part of the funnel progression.

**Display:** Funnel visualization (wide at top, narrow at bottom) with counts and percentages at each stage. Plus a table with exact numbers.

**Key insight this provides:** "47% of leads that reach Contacted never become Interested — we have a nurturing problem" or "Only 50% of App Submitted convert to Confirmed — we have a fee collection problem."

---

### 3.5 Report 5 — Activity Heatmap

**Purpose:** Show when counselors are most and least active — day of week × hour of day.

**Data source:** `lead_activities.created_at` timestamps for all activities in the selected period.

**Grid:** 7 columns (Monday → Sunday) × 12 rows (8 AM → 8 PM, in 1-hour blocks). Each cell shows the total activity count for that day/hour combination.

**Color coding:** Heat gradient from white (0 activities) → light green (low) → dark green (high). The color scale is relative to the max cell value.

**Use case:** "Our team does almost no calling between 12–2 PM (lunch) and very little after 5 PM. If we want to reach leads in the evening, we need to adjust schedules."

**Scoping:** Admin sees all counselors' activities. Branch manager sees their branch. Counselor sees their own heatmap.

**Display:** Heatmap grid (primary). Optional: toggle to see a single counselor's heatmap (dropdown selector, admin/manager only).

---

### 3.6 Report 6 — Overdue Follow-ups Report

**Purpose:** Real-time list of all overdue follow-up tasks — the "action needed NOW" report.

**This is NOT period-filtered.** It shows the current state: all follow-up tasks with `status = 'overdue'` right now.

**Columns:**

| Column | Source |
|---|---|
| Lead Name | `leads.name` |
| Lead Stage | `leads.stage` |
| Lead Temperature | `leads.lead_temperature` (if 15C-II complete) |
| Assigned To | `users.name` (the counselor) |
| Follow-up Type | `lead_follow_up_tasks.type` |
| Due At | `lead_follow_up_tasks.due_at` |
| Hours Overdue | `now() − due_at` |
| Escalation Status | Tier 1 sent? Tier 2 sent? Neither? |
| Branch | `leads.branch` |

**Sorting:** Default: Hours Overdue descending (most overdue first).

**Filters:** Assigned To (counselor dropdown), Branch, Follow-up Type.

**Actionable:** Each row has a "View Lead" link that navigates to the lead detail page.

**Summary cards at top:** Total Overdue Tasks, Tasks Overdue > 24h, Tasks with Tier 2 Escalation Sent, Counselor with Most Overdue Tasks (name + count).

**Scoping:** Admin sees all overdue tasks. Branch manager sees their branch. Counselors do NOT have access to this report (they receive escalation notifications instead).

---

## 4. Domain Model

### 4.1 Bounded Context Placement

All report components live within `TenantAdminDashboard/LeadManagement/`. Reports are read-only query services — no new entities, no new domain events, no new write models.

### 4.2 Application Layer Components

**Path:** `app/Application/TenantAdminDashboard/LeadManagement/`

| Component | Type | Purpose |
|---|---|---|
| `GetCounselorPerformanceQuery` | Query | Aggregates activity counts, follow-up stats, and conversion data per counselor. Accepts period + optional counselor_id (for self-view). |
| `GetPipelineVelocityQuery` | Query | Computes average/median time per stage from audit log transition timestamps. |
| `GetBranchComparisonQuery` | Query | Aggregates lead, conversion, activity, and overdue counts per branch. |
| `GetLeadFunnelQuery` | Query | Computes cohort-based funnel progression: how many leads created in the period reached each stage. |
| `GetActivityHeatmapQuery` | Query | Groups activities by day-of-week and hour-of-day. Returns a 7×12 matrix of counts. |
| `GetOverdueFollowUpsQuery` | Query | Returns all currently overdue follow-up tasks with lead and counselor details. No period filter — current snapshot. |
| `ExportCrmReportCsvUseCase` | Use Case | Generates CSV for any of the 6 reports. Accepts report_type + parameters. |

### 4.3 Infrastructure Layer Components

| Component | Type | Purpose |
|---|---|---|
| `CrmReportQueryService` | Infrastructure Query Service | Executes the raw SQL aggregation queries for all 6 reports. Uses optimized JOINs and GROUP BYs. Lives in Infrastructure layer because it contains SQL, not domain logic. |

### 4.4 HTTP Layer

**Controller:**

`app/Http/Controllers/Api/TenantAdminDashboard/LeadManagement/CrmReportController.php`

| Endpoint | Report | Capability |
|---|---|---|
| `GET /api/tenant/crm/reports/counselor-performance` | Report 1 | `crm.reports.view` or `crm.reports.own` (own data only) |
| `GET /api/tenant/crm/reports/pipeline-velocity` | Report 2 | `crm.reports.view` |
| `GET /api/tenant/crm/reports/branch-comparison` | Report 3 | `crm.reports.view` |
| `GET /api/tenant/crm/reports/lead-funnel` | Report 4 | `crm.reports.view` |
| `GET /api/tenant/crm/reports/activity-heatmap` | Report 5 | `crm.reports.view` or `crm.reports.own` |
| `GET /api/tenant/crm/reports/overdue-follow-ups` | Report 6 | `crm.reports.view` |
| `GET /api/tenant/crm/reports/{type}/export` | CSV export | Same as the respective report |

**Query Parameters (shared across reports):**

| Param | Type | Description |
|---|---|---|
| `period` | string | `this_week`, `last_week`, `this_month`, `last_month`, `this_quarter`, `custom` |
| `from_date` | date | Required if period = custom |
| `to_date` | date | Required if period = custom |
| `branch_id` | integer | Optional filter (admin only — managers are auto-scoped) |
| `counselor_id` | integer | Optional filter for Report 1 and 5 |

**API Resources:**

| Resource | Shapes |
|---|---|
| `CounselorPerformanceResource` | `counselor_id`, `counselor_name`, `branch_name`, `total_activities`, `calls`, `whatsapp_messages`, `meetings`, `demo_classes`, `unique_leads_contacted`, `follow_ups_completed`, `follow_ups_missed`, `follow_up_completion_rate`, `conversions`, `conversion_rate` |
| `PipelineVelocityResource` | `stages[]` → `{stage, stage_label, avg_days, median_days, currently_in_stage, exited_in_period}` |
| `BranchComparisonResource` | `branches[]` → `{branch_id, branch_name, total_leads, conversions, conversion_rate, active_counselors, avg_activities_per_lead, hot_leads, overdue_follow_ups}` |
| `LeadFunnelResource` | `cohort_size`, `stages[]` → `{stage, stage_label, reached_count, drop_off_percent}`, `rejected_count` |
| `ActivityHeatmapResource` | `matrix` (7×12 array of counts), `max_value`, `total_activities`, `peak_day`, `peak_hour` |
| `OverdueFollowUpResource` | `summary` → `{total, overdue_24h_plus, tier_2_escalated, worst_counselor}`, `tasks[]` → `{task_id, lead_id, lead_name, lead_stage, lead_temperature, assigned_to, follow_up_type, due_at, hours_overdue, escalation_status, branch_name}` |

**Capability Codes:**

| Code | Who Has It | Purpose |
|---|---|---|
| `crm.reports.view` | Admins, Branch Managers | Access all 6 reports (scoped by branch for managers) |
| `crm.reports.own` | Counselors | Access Report 1 (own performance) and Report 5 (own heatmap) only |

---

## 5. Database Dependencies

No new tables are required. All reports query existing data:

| Table | Used By Reports | Key Columns |
|---|---|---|
| `leads` | All reports | `source`, `stage`, `branch_id`, `assigned_to`, `created_at`, `lead_temperature`, `deleted_at` |
| `lead_activities` | Reports 1, 5 | `performed_by`, `type`, `lead_id`, `created_at` |
| `lead_follow_up_tasks` | Reports 1, 6 | `assigned_to`, `status`, `due_at`, `type`, `escalation_tier_1_sent_at`, `escalation_tier_2_sent_at` |
| `tenant_audit_logs` | Report 2, 4 | `action = 'lead.stage_changed'`, `old_values`, `new_values`, `created_at` |
| `users` | Reports 1, 3, 6 | `id`, `name` (counselor names) |
| `branches` | Reports 3, 6 | `id`, `name` |

**Index verification:** The implementation plan must verify that existing indexes support the aggregation queries efficiently. Key queries to test:

- `lead_activities` GROUP BY `performed_by` WHERE `created_at` in range — needs `(performed_by, created_at)` index
- `lead_activities` GROUP BY `DAYOFWEEK(created_at)`, `HOUR(created_at)` — may need a covering index or accept a full scan for the period
- `lead_follow_up_tasks` WHERE `status = 'overdue'` — needs `(status)` index (exists from 15C-I)
- `tenant_audit_logs` WHERE `action = 'lead.stage_changed'` — needs `(tenant_id, action, created_at)` index

If any index is missing, the implementation plan must include the migration to add it.

---

## 6. Frontend Requirements

### 6.1 Reports Dashboard Page

**Location:** CRM → Reports (new navigation item)

**Layout:** Report selector (tabs or sidebar navigation) with 6 report options. Each report loads in the main content area.

**Shared controls (top bar):** Period selector + Branch filter (admin only) + Export CSV button.

### 6.2 Per-Report Visualizations

| Report | Primary View | Chart |
|---|---|---|
| Counselor Performance | Sortable table | Horizontal bar chart (top 10 by selected metric) |
| Pipeline Velocity | Stage table with avg/median days | Horizontal bar chart (time per stage, bottleneck highlighted) |
| Branch Comparison | Sortable table | Grouped bar chart (leads vs conversions per branch) |
| Lead Funnel | Funnel visualization + table | Funnel diagram (wide top, narrow bottom, percentages at each tier) |
| Activity Heatmap | 7×12 grid with heat colors | Heatmap grid (day × hour, color gradient) |
| Overdue Follow-ups | Summary cards + sortable table | No chart — this is an action list, not an analytics view |

### 6.3 Counselor Self-View

When a counselor accesses Reports, they see only:
- Report 1 (their own performance metrics — no other counselors visible)
- Report 5 (their own activity heatmap)
- No branch comparison, no pipeline velocity, no funnel, no overdue report

The UI shows a simplified layout without report navigation tabs — just their performance card and heatmap.

---

## 7. Implementation Plan Requirements

| # | Section | Content |
|---|---|---|
| 1 | Executive Summary | What gets built, what does NOT |
| 2 | Dependency Verification | Verify: `lead_activities` table and indexes, `lead_follow_up_tasks` table and indexes, `tenant_audit_logs` stage change records (confirm data format for stage transitions), `branches` table, `BranchAccessPolicy`. Assess whether median calculation is feasible in MySQL 8.0 (window functions). |
| 3 | Architecture Decisions | Any deviations. Median approach: native MySQL vs application-level. |
| 4 | Query Specifications | Exact SQL for all 6 reports. Performance assessment with expected data volumes. Missing indexes identified. |
| 5 | Application Layer | Query classes, CSV export use case. |
| 6 | Infrastructure Layer | Query service with raw SQL. |
| 7 | HTTP Layer | Controller, request validation, resources, routes. |
| 8 | Authorization Scoping | How BranchAccessPolicy is applied per report. Counselor self-view logic. |
| 9 | Frontend Specification | Dashboard layout, per-report visualizations, chart library selection. |
| 10 | Implementation Sequence | Ordered steps with day estimates. |
| 11 | Test Plan | Every test file with description. |
| 12 | Quality Gate Verification | Checklist from §8. |
| 13 | File Manifest | Every new and modified file. |

---

## 8. Quality Gates

### 8.1 Report Accuracy Gates

- [ ] Report 1: Counselor activity counts match manual verification against `lead_activities` data
- [ ] Report 1: Follow-up completion rate calculated correctly (completed ÷ (completed + overdue))
- [ ] Report 1: Conversion count attributed correctly to the counselor assigned at time of conversion
- [ ] Report 2: Average time per stage matches manual calculation from audit log timestamps
- [ ] Report 2: Bottleneck stage (longest average) correctly identified and highlighted
- [ ] Report 3: Branch leads and conversions match data filtered by `branch_id`
- [ ] Report 4: Funnel cohort correctly tracks leads CREATED in the period through their stage progression
- [ ] Report 4: Drop-off percentages are mathematically correct at each stage
- [ ] Report 5: Heatmap grid correctly maps activity timestamps to day-of-week × hour-of-day
- [ ] Report 6: Overdue tasks list matches `lead_follow_up_tasks` WHERE `status = 'overdue'`
- [ ] Report 6: Hours overdue calculated correctly from `now() − due_at`

### 8.2 Period Filtering Gates

- [ ] All reports (except Report 6) correctly filter by: This Week, Last Week, This Month, Last Month, This Quarter, Custom Range
- [ ] Report 6 shows current snapshot regardless of period selection
- [ ] Custom date range works with from_date and to_date

### 8.3 Authorization Gates

- [ ] Admin sees all data across all branches and counselors
- [ ] Branch manager sees only data for leads/counselors in their branch(es)
- [ ] Counselor sees only Report 1 (own metrics) and Report 5 (own heatmap)
- [ ] Counselor cannot access Reports 2, 3, 4, or 6
- [ ] Module entitlement enforced: tenant without `module.crm_reports` gets 403

### 8.4 Export Gates

- [ ] CSV export for each report downloads correct data matching the on-screen display
- [ ] CSV filename includes report type and period

### 8.5 Regression Gates

- [ ] All existing CRM tests pass (0 regressions)
- [ ] PHPStan Level 5 passes with 0 new errors

---

## 9. Constraints & Reminders

### Architecture Constraints

- **Pure read-only.** No new tables, no new entities, no write operations (except CSV file generation). If the implementation plan proposes new tables, it must justify why.
- **Raw SQL in Infrastructure layer.** Complex GROUP BY + JOIN + subquery analytics are cleaner in raw SQL than Eloquent. The `CrmReportQueryService` lives in Infrastructure, not Application.
- **No pre-aggregation.** Compute on demand. Add caching only if performance testing shows > 500ms response times.
- **Audit logs are the source of truth for stage transition timing.** Do NOT compute pipeline velocity from `leads.stage_changed_at` alone — it only has the latest transition. The audit log has the full history.

### What NOT to Do

- Do NOT create summary/aggregation tables. Query existing data directly.
- Do NOT add new columns to existing tables for reporting purposes.
- Do NOT build real-time auto-refreshing dashboards. Load on page view is sufficient.
- Do NOT expose counselor performance data to other counselors. Counselors see only their own metrics.
- Do NOT build a custom report builder. The 6 reports are fixed.

---

## 10. Definition of Done

Phase 15F is complete when:

1. All 6 reports render correctly with accurate data.
2. All quality gates in §8 pass.
3. Period filtering works across all reports.
4. Authorization scoping verified: admin → all, branch manager → branch, counselor → own.
5. CSV export works for all 6 reports.
6. Module entitlement enforced.
7. Zero regression. PHPStan Level 5 passes.
8. The Phase 15F Completion Report is signed off.

---

*End of Document — UBOTZ 2.0 Phase 15F Developer Instructions — March 26, 2026*
