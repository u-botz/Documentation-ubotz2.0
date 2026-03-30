# UBOTZ 2.0 — Lead Management (CRM) — Technical Specification

## Scope

Tenant-scoped CRM: leads, pipeline, notes, follow-ups, scoring, automation rules, optional WhatsApp integration, source analytics, CRM reports, and duplicate handling. Data lives in the **tenant** database.

## Route entry points

| Layer | File |
|--------|------|
| Tenant dashboard (authenticated) | `backend/routes/tenant_dashboard/lead_management.php` |
| Public ingestion (throttled) | `backend/routes/api.php` (lead form + visit tracking) |

**Tenant API prefix:** `/api/tenant` (same group as other tenant dashboard routes).

**Public (no tenant JWT):**

- `POST /api/public/tenants/{tenantSlug}/leads` — submit lead form (`PublicLeadFormController`), throttle `10,1`
- `POST /api/public/tenants/{tenantSlug}/leads/{leadId}/track-visit` — visit tracking (`PublicLeadTrackVisitController`), throttle `60,1`

## Capabilities and modules (high level)

Capabilities are enforced via `tenant.capability:*` middleware on routes. Representative keys:

| Area | Examples |
|------|-----------|
| Core leads | `lead_management.view`, `lead_management.manage` |
| Activities | `lead.activity.view`, `lead.activity.log` |
| Follow-ups (on-lead) | `lead.follow_up.view`, `lead.follow_up.manage` |
| Follow-up tasks (global list) | Same `lead.follow_up.*` on `/api/tenant/follow-up-tasks` |
| CRM settings / scoring | `crm.settings.manage`; automation `crm.automation.view` / `crm.automation.manage` |
| Source ROI | `crm.analytics.view` / `crm.analytics.manage` + `tenant.module:module.source_analytics` |
| CRM reports | `crm.reports.view`, `crm.reports.own` + `tenant.module:module.crm_reports` |
| Dedup | `crm.dedup.view`, `crm.dedup.merge` + `tenant.module:module.lead_dedup` |
| WhatsApp | `tenant.module:module.whatsapp` + `whatsapp.connect` / `view` / `manage` / `send` / `broadcast` (combined with lead capabilities on several routes) |

Admission fee on a lead (source analytics path): `PUT /api/tenant/leads/{leadId}/admission-fee` requires `module.source_analytics`, `crm.analytics.manage`, and `lead_management.manage`.

## Tenant routes (summary)

Mounted from `lead_management.php` (all under `/api/tenant`):

- **Automation:** `GET /automation-catalog`; CRUD + executions under `/automation-rules`
- **CRM settings:** `/crm-settings` (scoring weights, source scores, temperature thresholds, general settings; WhatsApp subsection gated by `module.whatsapp`)
- **WhatsApp:** `/whatsapp/*` — connect/disconnect, templates, inbox, unread count, broadcasts (when module enabled)
- **Counselor activity feed:** `GET /counselor/activities`
- **Follow-up tasks:** `/follow-up-tasks` (index; update/complete/cancel)
- **Leads:** `/leads` — list, pipeline summary, CRUD, stage/assign/convert, notes, follow-ups, activities, per-lead follow-up tasks, score breakdown; nested `/leads/{id}/whatsapp/*` when `module.whatsapp` applies
- **CRM analytics:** `/crm/source-analytics`, `/crm/spend-entries` (module `source_analytics`)
- **CRM reports:** `/crm/reports/*` (pipeline velocity, branch comparison, lead funnel, overdue follow-ups; counselor performance & heatmap under `crm.reports.own`; CSV export route)
- **Duplicates:** `/crm/duplicates/*` and `GET /leads/{leadId}/duplicates`

## Application layer

Primary use cases live under `App\Application\TenantAdminDashboard\LeadManagement\UseCases\` and `...\LeadManagement\WhatsAppIntegration\`, for example:

- Lead lifecycle: `CreateLeadUseCase`, `UpdateLeadUseCase`, `DeleteLeadUseCase`, `ChangeLeadStageUseCase`, `AssignLeadUseCase`, `ConvertLeadUseCase`, `AddLeadNoteUseCase`
- Follow-ups: `CreateFollowUpUseCase`, `CompleteFollowUpUseCase`, `DeleteFollowUpUseCase`; tasks: `CreateFollowUpTaskUseCase`, `UpdateFollowUpTaskUseCase`, `CompleteFollowUpTaskUseCase`, `CancelFollowUpTaskUseCase`
- Activities: `LogLeadActivityUseCase`
- Scoring: `RecalculateLeadScoreUseCase`, `UpdateScoringWeightsUseCase`, `UpdateSourceScoresUseCase`, `UpdateTemperatureThresholdsUseCase`
- Dedup: `DetectDuplicatesForLeadUseCase`, `MergeLeadsUseCase`, `DismissDuplicateCandidateUseCase`
- Spend / admission fee: `CreateSpendEntryUseCase`, `UpdateSpendEntryUseCase`, `DeleteSpendEntryUseCase`, `UpdateLeadAdmissionFeeUseCase`
- Automation: `CreateAutomationRuleUseCase`, `UpdateAutomationRuleUseCase`, `ToggleAutomationRuleUseCase`, `DeleteAutomationRuleUseCase`
- Reports export: `ExportCrmReportCsvUseCase`
- Public tracking: `IncrementLeadVisitUseCase` (used from public track-visit flow)

**Phone normalization** for dedup/search is applied in persistence (e.g. `EloquentLeadRepository`) using last-10-digit logic on `phone_normalized`, not a separate `NormalizePhoneNumberUseCase` class.

## Persistence (tenant migrations — non-exhaustive)

Representative files under `backend/database/migrations/tenant/`:

- `2026_03_13_105344_create_leads_table.php` — core `leads` (tenant isolation, pipeline, assignment; extended by later migrations)
- `2026_03_13_105353_create_lead_notes_table.php`, `2026_03_13_105359_create_lead_follow_ups_table.php`
- `2026_03_25_120000_create_lead_activities_table.php`, `2026_03_25_120001_create_lead_follow_up_tasks_table.php`
- `2026_03_25_150000_add_lead_scoring_columns_to_leads_table.php`
- `2026_03_26_100000_create_source_spend_entries_and_lead_admission_fee.php`
- `2026_03_26_370003_create_lead_duplicate_candidates_table.php` (+ `add_dedup_columns_to_leads_table`, `backfill_phone_normalized_for_leads`)

Indexes and soft deletes are applied in follow-up migrations (see `*_lead_*` files).

## Scheduling

`backend/routes/console.php` registers `crm:recalculate-lead-scores` (daily).

## Frontend references

- Lead CRUD and pipeline: `frontend/services/tenant-lead-service.ts` (`/api/tenant/leads`, `pipeline-summary`, etc.)
- WhatsApp CRM: `frontend/services/tenant-whatsapp-service.ts` (`/api/tenant/whatsapp/*`, `/api/tenant/leads/{id}/whatsapp/*`)
- Dedup UI: `frontend/services/leadDedupService.ts`
- CRM report paths and lead admission fee: `frontend/config/api-endpoints.ts` — `TENANT.CRM_*`, `TENANT.LEAD_ADMISSION_FEE`

---

## Linked references

- Public website (landing) contact and lead capture; optional `Landing Page` / `Blog` modules
- `Identity` (staff users, assignment); conversion flow ties to `ConvertLeadUseCase` and admission-fee fields where configured
