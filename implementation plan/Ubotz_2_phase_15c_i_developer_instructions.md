# UBOTZ 2.0 — Phase 15C-I Developer Instructions

## Structured Lead Activities + Follow-up Tasks with Tiered Escalation

| Field | Value |
|---|---|
| **Document Type** | Developer Instruction (Pre-Implementation Brief) |
| **Phase** | 15C-I (of 15C-I / 15C-II / 15C-III) |
| **Date** | March 25, 2026 |
| **Issued By** | Principal Engineer / Architecture Auditor |
| **Audience** | Implementation Developer (Antigravity) |
| **Expected Deliverable** | Phase 15C-I Implementation Plan |
| **Prerequisites** | Phase 15A COMPLETE (Lead Management with pipeline, Kanban, notes, follow-ups, auto-assign, stale detection), Phase 14 COMPLETE (Notification Infrastructure with dispatcher, email/in-app channels, priority queues) |

> **This phase replaces unstructured lead notes and follow-ups with a typed activity system and builds scheduled follow-up tasks with tiered escalation. It is the prerequisite for Phase 15C-II (Lead Scoring) and Phase 15C-III (Workflow Automation Rules). Every scoring signal and automation trigger in those phases depends on the structured data model built here. Build it clean.**

---

## 1. Mission Statement

Phase 15C-I builds two capabilities within the existing LeadManagement bounded context:

1. **Structured Lead Activity System** — Every counselor interaction with a lead becomes a typed, filterable, countable activity record. The existing unstructured `lead_notes` and `lead_follow_ups` tables are superseded by a unified `lead_activities` model with typed activity categories, structured metadata, and outcome tracking.

2. **Follow-up Task System with Tiered Escalation** — Counselors schedule follow-up tasks (with due date, linked lead, and activity type). The system sends reminder notifications before due time. If a follow-up is missed, escalation proceeds in two tiers: re-notify the assigned counselor → escalate to the branch manager. Escalation thresholds are tenant-configurable with platform defaults.

**What this phase includes:**
- Lead Activity entity with typed categories (Call, WhatsApp, Meeting, Demo Class, Note)
- Activity CRUD endpoints (create, list by lead, list by counselor)
- Follow-up Task entity with due date, status lifecycle, and linked activity type
- Follow-up task CRUD endpoints (create, update, complete, cancel, list overdue)
- Scheduled command to detect overdue follow-ups and trigger escalation
- Reminder notification before follow-up due time
- Tiered escalation notifications (counselor re-notify → branch manager escalation)
- Tenant CRM Settings for escalation threshold configuration
- Migration of existing `lead_notes` and `lead_follow_ups` data to the new schema
- Blade email templates for reminder and escalation notifications
- New notification types registered in Phase 14 infrastructure

**What this phase does NOT include:**
- Lead scoring (Phase 15C-II)
- Workflow automation rules / rule engine (Phase 15C-III)
- Drip campaigns / automated email sequences to leads
- SMS or WhatsApp delivery channel for notifications (future channel addition)
- Auto-logging of external activities (e.g., auto-detect that an email was sent via SMTP integration)
- Activity analytics / reporting dashboard (future)
- Modification to the Kanban board UI (existing drag-and-drop unaffected)

---

## 2. Business Context

### 2.1 Current State

Phase 15A delivered lead management with:
- A 6-stage pipeline (New Enquiry → Contacted → Interested → App Submitted → Admission Confirmed → Rejected)
- Kanban board UI with drag-and-drop stage changes
- `lead_notes` table — free-text notes on a lead
- `lead_follow_ups` table — free-text follow-up records with no structured type, no due time enforcement, no escalation
- `stage_changed_at` field on `leads` table + full transition history in `tenant_audit_logs`
- Workload-balanced round-robin auto-assign in `CreateLeadUseCase`
- `crm:detect-stale-leads` command (3-day inactivity → notify assigned counselor)
- Lead-to-Student conversion path

**The problem:** Notes and follow-ups are generic text fields. A counselor can type "Called lead" in a note, but the system cannot:
- Filter leads by "last activity type was Call"
- Count how many calls were made on a lead (for scoring in 15C-II)
- Trigger automation rules based on activity type (for 15C-III)
- Schedule a follow-up with a due time and enforce it
- Detect that a scheduled follow-up was missed and escalate

### 2.2 What Changes

After Phase 15C-I:
1. Every counselor interaction is recorded as a **typed activity** with a category (Call, WhatsApp, Meeting, Demo Class, Note), optional outcome, and structured metadata.
2. Counselors create **follow-up tasks** with a specific due date/time and linked activity type ("Call back on March 28 at 2 PM").
3. The system sends a **reminder notification** before the due time (configurable lead time, default: 1 hour before).
4. If the follow-up is not completed by due time, the system **re-notifies the counselor** after a configurable grace period (default: 2 hours).
5. If still not completed after a second threshold, the system **escalates to the branch manager** (default: 24 hours after due time).
6. Escalation thresholds are **tenant-configurable** — the tenant admin sets them in CRM Settings. The platform provides sensible defaults.
7. Existing `lead_notes` and `lead_follow_ups` data is **migrated** to the new `lead_activities` table with `type = 'note'` and appropriate metadata mapping.

### 2.3 Relationship to Existing Stale Lead Detection

The `crm:detect-stale-leads` command remains unchanged. It operates on a different axis — it detects leads with **no activity at all** for 3+ days. The follow-up escalation system operates on **scheduled tasks that were not completed by their due time**. These are complementary, not overlapping:

| System | Trigger | What It Detects |
|---|---|---|
| Stale Lead Detection (15A) | No activity on lead for X days | Abandoned leads — counselor forgot about them entirely |
| Follow-up Escalation (15C-I) | Scheduled follow-up not completed by due time | Missed commitments — counselor scheduled but didn't execute |

---

## 3. Business Rules (NON-NEGOTIABLE)

### 3.1 Activity Rules

| Rule ID | Rule | Enforcement |
|---|---|---|
| BR-01 | Every activity must have a `type` from the closed set: `call`, `whatsapp`, `meeting`, `demo_class`, `note`. | `LeadActivityType` value object with validation. No custom types in Phase 1. |
| BR-02 | Every activity is linked to exactly one lead (`lead_id` FK). | Database constraint + domain validation. |
| BR-03 | Every activity records the counselor who performed it (`performed_by` FK to `users.id`). | Set from authenticated user context. Cannot be overridden. |
| BR-04 | Activities are append-only. Once created, they cannot be edited or deleted. | No update/delete endpoints. No soft deletes. Activities are a historical record. |
| BR-05 | Each activity type has an optional `outcome` field from a type-specific outcome set. | Call: `answered`, `no_answer`, `voicemail`, `busy`, `callback_requested`. WhatsApp: `sent`, `delivered`, `read`, `replied`. Meeting: `attended`, `no_show`, `rescheduled`. Demo Class: `attended`, `no_show`, `rescheduled`. Note: no outcome (always null). |
| BR-06 | Activities must be tenant-scoped. A counselor in Tenant A must never see activities from Tenant B. | `BelongsToTenant` trait on Eloquent model. Global scope. |
| BR-07 | Creating an activity on a lead updates the lead's `last_activity_at` timestamp. | `LeadActivityCreated` domain event → handler updates `leads.last_activity_at`. This replaces the implicit "last note created" tracking. |
| BR-08 | The `lead_notes` and `lead_follow_ups` tables remain in the database but are **deprecated**. All new interactions use `lead_activities`. A data migration maps existing records to activities. | Migration command, not a destructive migration. Old tables are not dropped. |

### 3.2 Follow-up Task Rules

| Rule ID | Rule | Enforcement |
|---|---|---|
| BR-09 | A follow-up task has a `due_at` timestamp (date + time). It must be in the future at creation time. | Domain validation in `FollowUpTaskEntity`. |
| BR-10 | A follow-up task has a `type` indicating the planned activity type (Call, WhatsApp, Meeting, Demo Class). Note is NOT a valid follow-up type — you don't schedule a "note". | `FollowUpTaskType` value object. Subset of `LeadActivityType` excluding `note`. |
| BR-11 | Follow-up task statuses: `pending` → `completed`, `pending` → `overdue`, `pending` → `cancelled`, `overdue` → `completed`, `overdue` → `cancelled`. | `FollowUpTaskStatus` value object with explicit transition rules. |
| BR-12 | A follow-up task transitions to `overdue` when `now() > due_at` AND status is `pending`. This is detected by the scheduled command, NOT by a realtime check. | `crm:process-follow-up-escalations` command. |
| BR-13 | Completing a follow-up task requires creating an associated activity. The counselor completes the task by logging the activity that fulfills it. | `CompleteFollowUpTaskUseCase` accepts an activity payload. It creates the activity AND completes the task in a single transaction. |
| BR-14 | A lead can have multiple pending follow-up tasks. There is no limit. | No uniqueness constraint on `(lead_id, status)`. |
| BR-15 | Cancelling a follow-up task requires a `cancellation_reason` (free text). | Domain validation. Audit-logged. |
| BR-16 | Follow-up tasks are tenant-scoped. | `BelongsToTenant` trait. |

### 3.3 Escalation Rules

| Rule ID | Rule | Enforcement |
|---|---|---|
| BR-17 | A **reminder notification** is sent to the assigned counselor `X` minutes before the follow-up due time. Default: 60 minutes. Tenant-configurable. | `crm:send-follow-up-reminders` scheduled command. Runs every 15 minutes. |
| BR-18 | **Escalation Tier 1**: If a follow-up is overdue and has not been completed or cancelled, the system re-notifies the assigned counselor after `Y` hours past the due time. Default: 2 hours. Tenant-configurable. | `crm:process-follow-up-escalations` scheduled command. |
| BR-19 | **Escalation Tier 2**: If Tier 1 was sent and the follow-up is STILL not completed/cancelled after `Z` hours past the due time, the system notifies the **branch manager**. Default: 24 hours. Tenant-configurable. | Same scheduled command. Branch manager is resolved via the lead's `branch_id` → branch → manager. |
| BR-20 | Escalation notifications are **idempotent**. The system tracks which escalation tier has been sent for each follow-up task. Sending the same tier twice is prevented. | `escalation_tier_1_sent_at` and `escalation_tier_2_sent_at` columns on `lead_follow_up_tasks`. |
| BR-21 | If the lead has no `branch_id` or the branch has no manager assigned, Tier 2 escalation is skipped (logged as warning, not an error). | Defensive check in escalation command. |
| BR-22 | Escalation thresholds are stored in the tenant CRM settings. If not configured, platform defaults are used. | `TenantCrmSettingsService` with fallback to config values. |
| BR-23 | All escalation actions are audit-logged: reminder sent, tier 1 sent, tier 2 sent. | `tenant_audit_logs` entries with action codes `follow_up.reminder_sent`, `follow_up.escalation_tier_1`, `follow_up.escalation_tier_2`. |
| BR-24 | Reminder and escalation notifications use the Phase 14 `NotificationDispatcher`. They are `system` category (opt-out eligible) and `high` priority. | Listeners construct `NotificationPayload` with category `system` and priority `high`. |

### 3.4 Tenant CRM Settings Rules

| Rule ID | Rule | Enforcement |
|---|---|---|
| BR-25 | CRM settings are an extension of the existing tenant settings system (Phase 10C). New CRM-specific keys are added to the settings whitelist. | Extend `UpdateTenantSettingsUseCase` whitelist OR create a dedicated `TenantCrmSettings` model. Developer decides in implementation plan — both approaches are acceptable. |
| BR-26 | CRM setting keys and defaults: `crm.follow_up_reminder_minutes` (default: 60), `crm.escalation_tier_1_hours` (default: 2), `crm.escalation_tier_2_hours` (default: 24). | Config fallbacks in `config/crm.php`. |
| BR-27 | CRM settings changes are audit-logged with old and new values. | Consistent with existing settings audit pattern. |

---

## 4. Domain Model

### 4.1 Bounded Context Placement

All new components live within the **existing** `TenantAdminDashboard/LeadManagement` bounded context. This is NOT a new bounded context — it extends the Phase 15A lead management domain.

### 4.2 New Domain Layer Components

**Path:** `app/Domain/TenantAdminDashboard/LeadManagement/`

| Component | Type | Location | Purpose |
|---|---|---|---|
| `LeadActivityType` | Value Object | `ValueObjects/LeadActivityType.php` | Closed enum: `call`, `whatsapp`, `meeting`, `demo_class`, `note` |
| `LeadActivityOutcome` | Value Object | `ValueObjects/LeadActivityOutcome.php` | Type-specific outcome values (see BR-05). Validates outcome is valid for the given activity type. |
| `LeadActivityEntity` | Entity | `Entities/LeadActivityEntity.php` | Immutable after creation. Holds type, outcome, body, performed_by, lead_id. |
| `FollowUpTaskType` | Value Object | `ValueObjects/FollowUpTaskType.php` | Subset of `LeadActivityType` excluding `note`: `call`, `whatsapp`, `meeting`, `demo_class` |
| `FollowUpTaskStatus` | Value Object | `ValueObjects/FollowUpTaskStatus.php` | `pending`, `overdue`, `completed`, `cancelled`. Encapsulates transition rules. |
| `FollowUpTaskEntity` | Entity | `Entities/FollowUpTaskEntity.php` | Mutable status. Holds lead_id, assigned_to, type, due_at, status, escalation timestamps. |
| `LeadActivityCreated` | Domain Event | `Events/LeadActivityCreated.php` | Dispatched when an activity is logged. Carries activity_id, lead_id, type, performed_by. |
| `FollowUpTaskCreated` | Domain Event | `Events/FollowUpTaskCreated.php` | Dispatched when a follow-up task is scheduled. |
| `FollowUpTaskCompleted` | Domain Event | `Events/FollowUpTaskCompleted.php` | Dispatched when a task is completed. Carries the linked activity_id. |
| `FollowUpTaskOverdue` | Domain Event | `Events/FollowUpTaskOverdue.php` | Dispatched by the scheduled command when a task becomes overdue. |
| `FollowUpTaskEscalated` | Domain Event | `Events/FollowUpTaskEscalated.php` | Dispatched when escalation tier is triggered. Carries tier (1 or 2). |
| `LeadActivityRepositoryInterface` | Repository Interface | `Repositories/LeadActivityRepositoryInterface.php` | CRUD for activities. |
| `FollowUpTaskRepositoryInterface` | Repository Interface | `Repositories/FollowUpTaskRepositoryInterface.php` | CRUD for follow-up tasks + query overdue tasks. |
| `FollowUpTaskAlreadyCompletedException` | Exception | `Exceptions/FollowUpTaskAlreadyCompletedException.php` | Thrown when completing an already-completed task. |
| `FollowUpTaskAlreadyCancelledException` | Exception | `Exceptions/FollowUpTaskAlreadyCancelledException.php` | Thrown when acting on a cancelled task. |
| `InvalidFollowUpDueDateException` | Exception | `Exceptions/InvalidFollowUpDueDateException.php` | Thrown when due_at is in the past. |

### 4.3 New Application Layer Components

**Path:** `app/Application/TenantAdminDashboard/LeadManagement/`

| Component | Type | Location | Purpose |
|---|---|---|---|
| `LogLeadActivityUseCase` | Use Case | `UseCases/LogLeadActivityUseCase.php` | Creates a lead activity. Updates `leads.last_activity_at`. Dispatches `LeadActivityCreated`. |
| `ListLeadActivitiesQuery` | Query | `Queries/ListLeadActivitiesQuery.php` | Paginated list of activities for a lead. Filterable by type. |
| `ListCounselorActivitiesQuery` | Query | `Queries/ListCounselorActivitiesQuery.php` | Paginated list of activities performed by a specific counselor. |
| `CreateFollowUpTaskUseCase` | Use Case | `UseCases/CreateFollowUpTaskUseCase.php` | Creates a scheduled follow-up task. Dispatches `FollowUpTaskCreated`. |
| `CompleteFollowUpTaskUseCase` | Use Case | `UseCases/CompleteFollowUpTaskUseCase.php` | Completes a task by logging the associated activity. Single transaction. Dispatches `FollowUpTaskCompleted`. |
| `CancelFollowUpTaskUseCase` | Use Case | `UseCases/CancelFollowUpTaskUseCase.php` | Cancels a task with reason. Audit-logged. |
| `UpdateFollowUpTaskUseCase` | Use Case | `UseCases/UpdateFollowUpTaskUseCase.php` | Updates due_at or type on a `pending` task. Cannot update `overdue`, `completed`, or `cancelled` tasks. |
| `ListFollowUpTasksQuery` | Query | `Queries/ListFollowUpTasksQuery.php` | Paginated list of follow-up tasks. Filterable by status, lead_id, assigned_to, due date range. |
| `GetOverdueFollowUpTasksQuery` | Query | `Queries/GetOverdueFollowUpTasksQuery.php` | Returns tasks where `due_at < now()` AND `status = pending`. Used by the scheduled command. |
| `LogLeadActivityCommand` | Command DTO | `Commands/LogLeadActivityCommand.php` | Input DTO for `LogLeadActivityUseCase`. |
| `CreateFollowUpTaskCommand` | Command DTO | `Commands/CreateFollowUpTaskCommand.php` | Input DTO for `CreateFollowUpTaskUseCase`. |

### 4.4 New Application Layer — Automation

**Path:** `app/Application/TenantAdminDashboard/LeadManagement/Automation/`

| Component | Type | Location | Purpose |
|---|---|---|---|
| `ProcessFollowUpEscalationsCommand` | Console Command | `Console/Commands/ProcessFollowUpEscalationsCommand.php` | Artisan command `crm:process-follow-up-escalations`. Runs every 15 minutes. Detects overdue tasks, transitions status, triggers escalation notifications per tier. |
| `SendFollowUpRemindersCommand` | Console Command | `Console/Commands/SendFollowUpRemindersCommand.php` | Artisan command `crm:send-follow-up-reminders`. Runs every 15 minutes. Finds tasks with `due_at` within the reminder window and sends reminder notifications. |
| `NotifyFollowUpReminderListener` | Listener | `Listeners/NotifyFollowUpReminderListener.php` | Constructs `NotificationPayload` for the reminder notification. Dispatches via `NotificationDispatcher`. |
| `NotifyFollowUpEscalationListener` | Listener | `Listeners/NotifyFollowUpEscalationListener.php` | Constructs `NotificationPayload` for escalation (both tiers). Tier 2 resolves branch manager. |
| `UpdateLeadLastActivityListener` | Listener | `Listeners/UpdateLeadLastActivityListener.php` | Listens to `LeadActivityCreated`. Updates `leads.last_activity_at`. |
| `TenantCrmSettingsService` | Service | `Services/TenantCrmSettingsService.php` | Resolves CRM settings for a tenant with platform default fallbacks. |

### 4.5 New Infrastructure Layer Components

**Path:** `app/Infrastructure/Persistence/TenantAdminDashboard/LeadManagement/`

| Component | Type | Purpose |
|---|---|---|
| `LeadActivityRecord` | Eloquent Model | Maps to `lead_activities` table. `BelongsToTenant` trait. |
| `FollowUpTaskRecord` | Eloquent Model | Maps to `lead_follow_up_tasks` table. `BelongsToTenant` trait. |
| `EloquentLeadActivityRepository` | Repository Implementation | Implements `LeadActivityRepositoryInterface`. |
| `EloquentFollowUpTaskRepository` | Repository Implementation | Implements `FollowUpTaskRepositoryInterface`. Includes `findOverdue()` and `findDueForReminder()` query methods. |

### 4.6 New HTTP Layer Components

**Controllers** — `app/Http/Controllers/Api/TenantAdminDashboard/LeadManagement/`

| Controller | Endpoints |
|---|---|
| `LeadActivityController` | `POST /api/tenant/leads/{lead}/activities` — log an activity |
| | `GET /api/tenant/leads/{lead}/activities` — list activities for a lead |
| | `GET /api/tenant/counselor/activities` — list activities for the authenticated counselor |
| `FollowUpTaskController` | `POST /api/tenant/leads/{lead}/follow-up-tasks` — create a follow-up task |
| | `GET /api/tenant/follow-up-tasks` — list all follow-up tasks (filterable) |
| | `PUT /api/tenant/follow-up-tasks/{task}` — update a pending task |
| | `POST /api/tenant/follow-up-tasks/{task}/complete` — complete with activity |
| | `POST /api/tenant/follow-up-tasks/{task}/cancel` — cancel with reason |

**Form Requests** — `app/Http/Requests/TenantAdminDashboard/LeadManagement/`

| Request | Validates |
|---|---|
| `LogLeadActivityRequest` | `type` (required, from closed set), `outcome` (optional, validated per type), `body` (optional string, max 2000 chars), `metadata` (optional JSON) |
| `CreateFollowUpTaskRequest` | `type` (required, from closed set excluding `note`), `due_at` (required, datetime, future), `description` (optional string, max 500 chars) |
| `UpdateFollowUpTaskRequest` | `type` (optional), `due_at` (optional, datetime, future), `description` (optional) |
| `CompleteFollowUpTaskRequest` | `activity_type` (required), `activity_outcome` (optional), `activity_body` (optional) |
| `CancelFollowUpTaskRequest` | `cancellation_reason` (required string, max 500 chars) |

**API Resources** — `app/Http/Resources/TenantAdminDashboard/LeadManagement/`

| Resource | Shapes |
|---|---|
| `LeadActivityResource` | `id`, `lead_id`, `type`, `outcome`, `body`, `metadata`, `performed_by` (id + name), `created_at` |
| `FollowUpTaskResource` | `id`, `lead_id`, `lead_name`, `assigned_to` (id + name), `type`, `status`, `due_at`, `description`, `completed_at`, `cancelled_at`, `cancellation_reason`, `escalation_tier_1_sent_at`, `escalation_tier_2_sent_at`, `created_at` |

### 4.7 Capability Codes

| Code | Context | Who Has It | Purpose |
|---|---|---|---|
| `lead.activity.log` | Tenant Admin | Counselors, Branch Managers, Admins | Log activities on leads assigned to them (or any lead if they have `lead.manage`) |
| `lead.activity.view` | Tenant Admin | Counselors (own leads), Branch Managers (branch leads), Admins (all) | View activity history on leads |
| `lead.follow_up.manage` | Tenant Admin | Counselors, Branch Managers, Admins | Create, complete, cancel follow-up tasks |
| `lead.follow_up.view` | Tenant Admin | Counselors (own), Branch Managers (branch), Admins (all) | View follow-up tasks |
| `crm.settings.manage` | Tenant Admin | Admins only | Configure CRM escalation thresholds |

**Scoping rules:** Counselors can only log activities and manage follow-ups on leads assigned to them. Branch managers can act on all leads within their branch. Admins can act on all leads. This follows the existing `BranchAccessPolicy` pattern from Phase 15A.

---

## 5. Database Schema

### 5.1 New Tables

**`lead_activities`** (tenant-scoped)

| Column | Type | Notes |
|---|---|---|
| `id` | BIGINT UNSIGNED PK | Auto-increment |
| `tenant_id` | BIGINT UNSIGNED NOT NULL | FK → `tenants.id`. Global scope enforced via `BelongsToTenant`. |
| `lead_id` | BIGINT UNSIGNED NOT NULL | FK → `leads.id` ON DELETE CASCADE |
| `performed_by` | BIGINT UNSIGNED NOT NULL | FK → `users.id`. The counselor who performed the activity. |
| `type` | VARCHAR(30) NOT NULL | `call`, `whatsapp`, `meeting`, `demo_class`, `note` |
| `outcome` | VARCHAR(30) NULLABLE | Type-specific outcome. NULL for `note` type. |
| `body` | TEXT NULLABLE | Free-text description / notes about the activity. |
| `metadata` | JSON NULLABLE | Extensible structured data (e.g., call duration, WhatsApp message ID). |
| `created_at` | TIMESTAMP | When the activity was logged. |

**No `updated_at` column.** Activities are append-only (BR-04).

**Indexes:**
- `idx_lead_activities_tenant` → `(tenant_id)`
- `idx_lead_activities_lead` → `(lead_id, created_at DESC)` — for listing activities per lead
- `idx_lead_activities_performer` → `(performed_by, created_at DESC)` — for counselor activity feed
- `idx_lead_activities_type` → `(tenant_id, type)` — for filtering and counting by type

---

**`lead_follow_up_tasks`** (tenant-scoped)

| Column | Type | Notes |
|---|---|---|
| `id` | BIGINT UNSIGNED PK | Auto-increment |
| `tenant_id` | BIGINT UNSIGNED NOT NULL | FK → `tenants.id`. Global scope enforced. |
| `lead_id` | BIGINT UNSIGNED NOT NULL | FK → `leads.id` ON DELETE CASCADE |
| `assigned_to` | BIGINT UNSIGNED NOT NULL | FK → `users.id`. The counselor responsible. Defaults to lead's current assignee. |
| `type` | VARCHAR(30) NOT NULL | Planned activity type: `call`, `whatsapp`, `meeting`, `demo_class` |
| `status` | VARCHAR(20) NOT NULL DEFAULT 'pending' | `pending`, `overdue`, `completed`, `cancelled` |
| `description` | VARCHAR(500) NULLABLE | Counselor's note about what to do. |
| `due_at` | TIMESTAMP NOT NULL | When this follow-up must be completed by. |
| `completed_at` | TIMESTAMP NULLABLE | When the task was completed. |
| `completed_activity_id` | BIGINT UNSIGNED NULLABLE | FK → `lead_activities.id`. The activity that fulfilled this task. |
| `cancelled_at` | TIMESTAMP NULLABLE | When the task was cancelled. |
| `cancellation_reason` | VARCHAR(500) NULLABLE | Why it was cancelled. |
| `reminder_sent_at` | TIMESTAMP NULLABLE | When the pre-due reminder was sent. Prevents duplicate sends. |
| `escalation_tier_1_sent_at` | TIMESTAMP NULLABLE | When Tier 1 escalation (re-notify counselor) was sent. |
| `escalation_tier_2_sent_at` | TIMESTAMP NULLABLE | When Tier 2 escalation (notify branch manager) was sent. |
| `created_at` | TIMESTAMP | |
| `updated_at` | TIMESTAMP | |

**Indexes:**
- `idx_follow_up_tasks_tenant` → `(tenant_id)`
- `idx_follow_up_tasks_lead` → `(lead_id, due_at)`
- `idx_follow_up_tasks_assignee` → `(assigned_to, status, due_at)` — for counselor's task list
- `idx_follow_up_tasks_overdue` → `(status, due_at)` — for the escalation command to find overdue tasks efficiently
- `idx_follow_up_tasks_reminder` → `(status, due_at, reminder_sent_at)` — for the reminder command

### 5.2 Modified Tables

**`leads`** — Add column:

| Column | Type | Notes |
|---|---|---|
| `last_activity_at` | TIMESTAMP NULLABLE | Updated whenever a `LeadActivityCreated` event fires. Used by stale lead detection and future lead scoring. |

### 5.3 Data Migration

A one-time migration command `crm:migrate-legacy-interactions` converts existing data:

| Source | Target | Mapping |
|---|---|---|
| `lead_notes` records | `lead_activities` with `type = 'note'` | `note.body` → `activity.body`, `note.created_by` → `activity.performed_by`, `note.created_at` → `activity.created_at` |
| `lead_follow_ups` records | `lead_activities` with `type = 'note'` | Map as note activities since existing follow-ups have no structured type. `follow_up.notes` → `activity.body`, prefix body with `[Migrated Follow-up]`. |

**Rules:**
- The migration command is **idempotent** — it checks for existing migrated records before inserting (via a `migrated_from` column in metadata JSON: `{"migrated_from": "lead_notes", "source_id": 42}`).
- The migration does NOT delete data from the old tables.
- The migration runs once manually, NOT as a schema migration.

### 5.4 Tenant CRM Settings

If extending the existing settings system (preferred approach):

Add to the tenant settings key whitelist:

| Key | Type | Default | Description |
|---|---|---|---|
| `crm.follow_up_reminder_minutes` | integer | `60` | Minutes before due time to send reminder |
| `crm.escalation_tier_1_hours` | integer | `2` | Hours after due time to re-notify counselor |
| `crm.escalation_tier_2_hours` | integer | `24` | Hours after due time to notify branch manager |

Platform defaults are in `config/crm.php`. The `TenantCrmSettingsService` first checks tenant settings, then falls back to config defaults.

---

## 6. Notification Integration

### 6.1 New Notification Types

| # | Notification Type | Trigger | Recipient | Priority | Category | Channels |
|---|---|---|---|---|---|---|
| 20 | Follow-up Reminder | `crm:send-follow-up-reminders` command | Assigned counselor | `high` | `system` | Email + In-App |
| 21 | Follow-up Overdue — Tier 1 | `crm:process-follow-up-escalations` command | Assigned counselor | `high` | `system` | Email + In-App |
| 22 | Follow-up Overdue — Tier 2 | `crm:process-follow-up-escalations` command | Branch manager | `high` | `system` | Email + In-App |

### 6.2 Notification Dispatch Pattern

Follow the Phase 14 architecture exactly:

```
Scheduled Command detects condition
    ↓
Command dispatches domain event (FollowUpTaskOverdue / FollowUpTaskEscalated)
    ↓
Listener constructs NotificationPayload
    ↓
NotificationDispatcher routes to channels
```

**The scheduled command does NOT send notifications directly.** It dispatches domain events. Listeners handle notification construction and dispatch. This is the established Phase 14 pattern and must not be violated.

### 6.3 Idempotency

Each notification maps to a timestamp column on `lead_follow_up_tasks`:

| Notification | Idempotency Column | Prevents |
|---|---|---|
| Reminder | `reminder_sent_at` | Duplicate reminders |
| Tier 1 Escalation | `escalation_tier_1_sent_at` | Duplicate Tier 1 notifications |
| Tier 2 Escalation | `escalation_tier_2_sent_at` | Duplicate Tier 2 notifications |

The scheduled commands check these columns before dispatching events. If the column is NOT NULL, the notification has already been sent for this task.

Additionally, use the `notification_sent_log` table (from Phase 14) for cross-cutting deduplication: `entity_type = 'lead_follow_up_task'`, `entity_id = {task_id}`, `notification_type = 'follow_up_reminder'`.

### 6.4 Email Templates

| Template Path | Notification | Variables |
|---|---|---|
| `emails.crm.follow-up-reminder` | #20 | `counselor_name`, `lead_name`, `follow_up_type`, `due_at`, `lead_url` |
| `emails.crm.follow-up-overdue-counselor` | #21 | `counselor_name`, `lead_name`, `follow_up_type`, `due_at`, `hours_overdue`, `lead_url` |
| `emails.crm.follow-up-overdue-manager` | #22 | `manager_name`, `counselor_name`, `lead_name`, `follow_up_type`, `due_at`, `hours_overdue`, `lead_url` |

All templates extend `emails.layouts.branded` (existing Phase 14 layout).

---

## 7. Scheduled Commands

### 7.1 Command Summary

| Command | Signature | Schedule | Purpose |
|---|---|---|---|
| `crm:send-follow-up-reminders` | `crm:send-follow-up-reminders` | Every 15 minutes | Find pending tasks with `due_at` within reminder window, dispatch reminder events |
| `crm:process-follow-up-escalations` | `crm:process-follow-up-escalations` | Every 15 minutes | Find overdue tasks, transition to `overdue` status, dispatch escalation events per tier |

### 7.2 `crm:send-follow-up-reminders` Logic

```
1. For each tenant (iterate all active tenants):
   a. Load tenant CRM settings (reminder_minutes)
   b. Find all follow-up tasks WHERE:
      - status = 'pending'
      - due_at BETWEEN now() AND now() + reminder_minutes
      - reminder_sent_at IS NULL
   c. For each matching task:
      - Dispatch FollowUpTaskReminder event (NOT a domain event — a notification-specific event)
      - Set reminder_sent_at = now()
```

### 7.3 `crm:process-follow-up-escalations` Logic

```
1. For each tenant (iterate all active tenants):
   a. Load tenant CRM settings (tier_1_hours, tier_2_hours)
   b. Find all follow-up tasks WHERE:
      - status = 'pending' AND due_at < now()
      → Transition status to 'overdue', dispatch FollowUpTaskOverdue event
   c. Find all follow-up tasks WHERE:
      - status = 'overdue'
      - due_at + tier_1_hours < now()
      - escalation_tier_1_sent_at IS NULL
      → Dispatch FollowUpTaskEscalated(tier: 1), set escalation_tier_1_sent_at = now()
   d. Find all follow-up tasks WHERE:
      - status = 'overdue'
      - due_at + tier_2_hours < now()
      - escalation_tier_2_sent_at IS NULL
      - escalation_tier_1_sent_at IS NOT NULL (Tier 1 must have been sent first)
      → Resolve branch manager via lead.branch_id
      → If branch manager exists: dispatch FollowUpTaskEscalated(tier: 2), set escalation_tier_2_sent_at = now()
      → If no branch manager: log warning, skip Tier 2 for this task
```

### 7.4 Tenant Iteration Pattern

Both commands iterate over active tenants. Use `TenantContext::setId()` for each tenant (same pattern as `crm:detect-stale-leads` and the Phase 14 scheduled notification commands). Reset context between tenants to prevent cross-tenant data leakage.

---

## 8. API Contracts

### 8.1 Activity Endpoints

**`POST /api/tenant/leads/{lead}/activities`** — Log an activity

Request:
```json
{
    "type": "call",
    "outcome": "answered",
    "body": "Discussed admission requirements. Lead interested in Science batch.",
    "metadata": {
        "call_duration_seconds": 180
    }
}
```

Response: `201 Created` — `LeadActivityResource`

Capability: `lead.activity.log`. Scoping: counselor must be assigned to this lead OR have `lead.manage` capability.

---

**`GET /api/tenant/leads/{lead}/activities?type=call&page=1&per_page=20`** — List activities for a lead

Response: Paginated `LeadActivityResource[]`

Capability: `lead.activity.view`. Scoping: per BranchAccessPolicy.

---

**`GET /api/tenant/counselor/activities?page=1&per_page=20`** — List authenticated counselor's activities

Response: Paginated `LeadActivityResource[]`

Capability: `lead.activity.view`.

---

### 8.2 Follow-up Task Endpoints

**`POST /api/tenant/leads/{lead}/follow-up-tasks`** — Create a follow-up task

Request:
```json
{
    "type": "call",
    "due_at": "2026-03-28T14:00:00+05:30",
    "description": "Call to confirm campus visit scheduled for March 30"
}
```

Response: `201 Created` — `FollowUpTaskResource`

Capability: `lead.follow_up.manage`.

---

**`GET /api/tenant/follow-up-tasks?status=pending&assigned_to=5&page=1&per_page=20`** — List follow-up tasks

Query params: `status`, `assigned_to`, `lead_id`, `due_from`, `due_to`, `page`, `per_page`

Response: Paginated `FollowUpTaskResource[]`

Capability: `lead.follow_up.view`. Scoping: counselors see only their own tasks. Branch managers see branch tasks. Admins see all.

---

**`PUT /api/tenant/follow-up-tasks/{task}`** — Update a pending task

Request:
```json
{
    "due_at": "2026-03-29T10:00:00+05:30",
    "type": "meeting"
}
```

Response: `200 OK` — `FollowUpTaskResource`

Capability: `lead.follow_up.manage`. Only `pending` tasks can be updated. Returns `422` if task is `overdue`, `completed`, or `cancelled`.

---

**`POST /api/tenant/follow-up-tasks/{task}/complete`** — Complete with activity

Request:
```json
{
    "activity_type": "call",
    "activity_outcome": "answered",
    "activity_body": "Called and confirmed visit. Lead confirmed for March 30."
}
```

Response: `200 OK` — `FollowUpTaskResource` (includes `completed_activity_id`)

Capability: `lead.follow_up.manage`. Creates the activity AND completes the task atomically.

---

**`POST /api/tenant/follow-up-tasks/{task}/cancel`** — Cancel with reason

Request:
```json
{
    "cancellation_reason": "Lead already converted to student by walk-in team"
}
```

Response: `200 OK` — `FollowUpTaskResource`

Capability: `lead.follow_up.manage`.

---

### 8.3 CRM Settings Endpoints

Extend existing tenant settings endpoints OR add dedicated CRM settings endpoints:

**`GET /api/tenant/crm-settings`** — Get CRM configuration

Response:
```json
{
    "follow_up_reminder_minutes": 60,
    "escalation_tier_1_hours": 2,
    "escalation_tier_2_hours": 24
}
```

Capability: `crm.settings.manage`.

---

**`PUT /api/tenant/crm-settings`** — Update CRM configuration

Request:
```json
{
    "follow_up_reminder_minutes": 30,
    "escalation_tier_1_hours": 4,
    "escalation_tier_2_hours": 48
}
```

Response: `200 OK` — Updated settings.

Capability: `crm.settings.manage`. Audit-logged with old and new values.

Validation: `follow_up_reminder_minutes` (integer, 15–1440), `escalation_tier_1_hours` (integer, 1–72), `escalation_tier_2_hours` (integer, 1–168, must be > tier_1_hours).

---

## 9. Security Boundaries

### 9.1 Tenant Isolation

- All new tables (`lead_activities`, `lead_follow_up_tasks`) have `tenant_id` NOT NULL with `BelongsToTenant` trait enforcing global scope.
- All API endpoints are behind `tenant.resolve.token → auth:tenant_api → tenant.active → ensure.user.active → tenant.session → tenant.capability:{code}` middleware pipeline (same as all existing tenant endpoints).
- Cross-tenant access returns **404** (not 403) — consistent with existing isolation pattern.

### 9.2 Authorization Scoping

- **Counselor** sees/acts on leads assigned to them only.
- **Branch Manager** sees/acts on all leads in their branch(es).
- **Admin** sees/acts on all leads in the tenant.
- This is enforced by `BranchAccessPolicy` (existing Phase 15A mechanism). The implementation plan must specify exactly how this policy is applied to activity and follow-up task queries.

### 9.3 Data Integrity

- Activities are append-only. No update, no delete, no soft delete.
- Follow-up task status transitions are enforced at the domain level (`FollowUpTaskStatus` value object).
- `completed_activity_id` is set atomically with the activity creation (single transaction in `CompleteFollowUpTaskUseCase`).
- Escalation timestamp columns prevent duplicate notifications even if the scheduled command runs more frequently than expected.

---

## 10. Implementation Plan Requirements

The developer's Implementation Plan must include the following sections:

| # | Section | Content |
|---|---|---|
| 1 | Executive Summary | What gets built, what does NOT |
| 2 | Dependency Verification | Verify existing systems: Lead entity, LeadNote/LeadFollowUp models, BranchAccessPolicy, NotificationDispatcher, TenantCrmSettings (or tenant settings). Document actual class paths, method signatures, and table schemas. |
| 3 | Architecture Decisions | Any deviations from this spec, with justification |
| 4 | Migration Plan | New tables, modified columns, data migration command. Include exact SQL for each migration. |
| 5 | Domain Layer | Entities, value objects, events, exceptions — with full class definitions |
| 6 | Application Layer | UseCases, queries, commands, services, listeners — with method signatures |
| 7 | Infrastructure Layer | Eloquent models, repositories — with relationships and query methods |
| 8 | HTTP Layer | Controllers, FormRequests, Resources, route definitions with middleware |
| 9 | Notification Integration | Listeners, NotificationPayload construction, email templates |
| 10 | Scheduled Commands | Full logic for both commands, including tenant iteration and idempotency |
| 11 | Data Migration Command | Mapping logic, idempotency, verification steps |
| 12 | Capability Seeding | New capability codes to seed, role assignments |
| 13 | Security Implementation | BranchAccessPolicy application to new endpoints, tenant isolation verification |
| 14 | Implementation Sequence | Ordered steps with dependencies and day estimates |
| 15 | Test Plan | Every test file with description |
| 16 | Quality Gate Verification | Checklist from §11 |
| 17 | File Manifest | Every new and modified file |

---

## 11. Quality Gates (Must Pass Before Phase 15C-II)

### 11.1 Functional Gates

- [ ] Activity CRUD works: log Call, WhatsApp, Meeting, Demo Class, Note activities on a lead
- [ ] Activity type validation rejects invalid types
- [ ] Activity outcome validation rejects outcomes not valid for the given type
- [ ] Activities are append-only: no update or delete endpoint exists
- [ ] `leads.last_activity_at` updates on every new activity
- [ ] Follow-up task CRUD works: create, update (pending only), complete (with activity), cancel (with reason)
- [ ] Follow-up task status transitions enforced: cannot complete a cancelled task, cannot cancel a completed task
- [ ] `CompleteFollowUpTaskUseCase` creates activity + completes task in single transaction
- [ ] Follow-up task `due_at` must be in the future at creation time
- [ ] CRM settings CRUD works with validation (tier_2 > tier_1)

### 11.2 Notification Gates

- [ ] Reminder notification sent to counselor before due time
- [ ] No duplicate reminders (idempotency via `reminder_sent_at`)
- [ ] Tier 1 escalation sent to counselor after configurable hours past due
- [ ] Tier 2 escalation sent to branch manager after configurable hours past due
- [ ] Tier 2 only sent after Tier 1 has been sent
- [ ] Tier 2 gracefully skipped if no branch manager (logged as warning)
- [ ] All escalation notifications use Phase 14 NotificationDispatcher pattern
- [ ] Escalation timestamps prevent duplicate sends
- [ ] Email templates render correctly with all variables

### 11.3 Security Gates

- [ ] Tenant isolation: Counselor in Tenant A cannot see activities or tasks from Tenant B (returns 404)
- [ ] Authorization scoping: Counselor cannot see/act on leads not assigned to them (403 or empty result)
- [ ] Branch manager sees all leads in their branch(es)
- [ ] Admin sees all leads in tenant
- [ ] All write operations audit-logged to `tenant_audit_logs`
- [ ] Audit logs written OUTSIDE database transactions (existing pattern)

### 11.4 Data Migration Gates

- [ ] Legacy `lead_notes` migrated to `lead_activities` with `type = 'note'`
- [ ] Legacy `lead_follow_ups` migrated to `lead_activities` with `type = 'note'` and `[Migrated Follow-up]` prefix
- [ ] Migration command is idempotent (running twice does not create duplicates)
- [ ] Old tables remain untouched (no data deleted)

### 11.5 Regression Gates

- [ ] All existing lead management tests pass (0 regressions)
- [ ] Stale lead detection (`crm:detect-stale-leads`) continues to work
- [ ] Kanban board drag-and-drop stage changes unaffected
- [ ] Lead-to-Student conversion path unaffected
- [ ] PHPStan Level 5 passes with 0 new errors

---

## 12. Constraints & Reminders

### Architecture Constraints

- **Activities are append-only.** Do NOT add update or delete methods to the repository interface. This is not negotiable — activities are a historical record used for scoring in 15C-II.
- **Follow-up task completion requires an activity.** The `CompleteFollowUpTaskUseCase` MUST create the activity in the same transaction. A completed task without a linked activity is invalid.
- **Scheduled commands dispatch domain events, NOT notifications directly.** The commands detect conditions and dispatch events. Listeners handle notification construction and dispatch via `NotificationDispatcher`. This is the Phase 14 pattern.
- **One listener per notification type.** Do NOT create a single listener for all three notification types. Three notification types = three listeners (or two listeners if reminder is handled separately from escalation tiers).
- **Audit logs OUTSIDE transactions.** This was a critical finding in Phase 10C. All audit log writes must happen after the database transaction commits.
- **BranchAccessPolicy for scoping.** Do NOT reimplement lead access control. Use the existing `BranchAccessPolicy` from Phase 15A.

### Docker Environment

- Container: Alpine Linux — use `sh` not `bash`
- Container name: `ubotz_backend`
- Database: `ubotz_mysql`
- Queue: Redis DB 3

### What NOT to Do

- Do NOT modify the existing `lead_notes` or `lead_follow_ups` table schemas. They are deprecated but preserved.
- Do NOT add notification dispatch logic into UseCases. Notifications are side effects via domain event listeners.
- Do NOT make activities editable. Not even soft-deletable. They are immutable records.
- Do NOT send escalation notifications synchronously from the scheduled command. Always go through the event → listener → dispatcher pipeline.
- Do NOT create custom notification categories. Use the existing `system` category from Phase 14.
- Do NOT skip the data migration command. Existing counselor interactions must be preserved in the new schema.
- Do NOT allow `note` as a valid follow-up task type. You don't schedule a "note" — it makes no business sense.
- Do NOT assume the lead's assigned counselor is the same user who creates the follow-up task. The `assigned_to` on the follow-up task defaults to the lead's assignee but could be different if a manager creates a task for a subordinate.

---

## 13. Definition of Done

Phase 15C-I is complete when:

1. The implementation plan has been reviewed and approved by the Principal Engineer.
2. All code is implemented per the approved plan.
3. All quality gates in §11 pass.
4. A Principal Engineer audit confirms zero critical or high findings.
5. All findings from audit are resolved.
6. End-to-end demonstration:
   a. Counselor logs a Call activity on a lead → `last_activity_at` updates → activity appears in lead activity feed.
   b. Counselor creates a follow-up task due in 1 hour → reminder notification arrives → task shows in counselor's task list.
   c. Counselor does NOT complete the task → task transitions to `overdue` → Tier 1 re-notification arrives → Tier 2 escalation arrives to branch manager.
   d. Counselor completes the overdue task → activity logged + task marked completed in single action.
7. Data migration verified: existing notes and follow-ups appear as activities.
8. Escalation thresholds configurable by tenant admin and verified with non-default values.
9. Zero regression in existing test suite.
10. PHPStan Level 5 passes with 0 new errors.
11. The Phase 15C-I Completion Report is signed off.

---

*End of Document — UBOTZ 2.0 Phase 15C-I Developer Instructions — March 25, 2026*
