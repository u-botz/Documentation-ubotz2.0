# UBOTZ 2.0 — Phase 15C-III Developer Instructions

## CRM Workflow Automation Rules

| Field | Value |
|---|---|
| **Document Type** | Developer Instruction (Pre-Implementation Brief) |
| **Phase** | 15C-III (of 15C-I / 15C-II / 15C-III) |
| **Date** | March 25, 2026 |
| **Issued By** | Principal Engineer / Architecture Auditor |
| **Audience** | Implementation Developer (Antigravity) |
| **Expected Deliverable** | Phase 15C-III Implementation Plan |
| **Prerequisites** | Phase 15C-I COMPLETE (Structured Activities, Follow-up Tasks, Tiered Escalation), Phase 15C-II COMPLETE (Lead Scoring Engine with temperature classification and `LeadScoreRecalculated` event) |

> **This is the final phase of the CRM Automation trilogy. Phase 15C-I built the structured data layer (activities, tasks). Phase 15C-II built the intelligence layer (scoring). Phase 15C-III builds the action layer — a configurable rule engine that reacts to CRM events and executes automated actions. The rule engine is the bridge between "something happened" and "something should happen next." It must be simple enough for a non-technical tenant admin to configure, but precise enough that it never fires incorrectly.**

---

## 1. Mission Statement

Phase 15C-III builds a **CRM Workflow Automation Rule Engine** within the existing `TenantAdminDashboard/LeadManagement` bounded context.

The engine follows a **Trigger → Condition → Action** model:
- **Trigger**: A domain event fires (lead stage changed, score crossed a threshold, lead created, activity logged, lead went stale)
- **Condition** (optional): A filter narrows when the rule applies (only if source = referral, only if temperature = hot, only if stage = interested)
- **Action**: The system executes an automated response (send notification, create follow-up task, reassign lead, change stage)

The platform defines the catalog of available triggers, conditions, and actions. Tenants configure rules by selecting from dropdowns — no code, no visual builder, no custom expressions.

**What this phase includes:**
- Automation rule CRUD (create, update, enable/disable, delete)
- Rule engine that evaluates rules on domain events
- Platform-defined trigger catalog (7 triggers)
- Platform-defined condition catalog (6 condition types)
- Platform-defined action catalog (5 action types)
- Rule execution logging for auditability and debugging
- Rule ordering (priority) for deterministic execution
- Per-rule enable/disable toggle
- Tenant admin UI for rule configuration (dropdown-based)
- Rule execution via asynchronous queued jobs (never block the triggering event)
- Safeguards against infinite loops (action → trigger → action cycles)
- Maximum rules per tenant (quota-enforced via subscription plan)

**What this phase does NOT include:**
- Visual drag-and-drop workflow builder (future — the same rule engine powers both UIs)
- Branching logic (if-else trees, parallel paths)
- Delay/wait steps ("wait 3 days, then send email") — all actions execute immediately on trigger
- Multi-step workflows (rule chains where one rule's action is another rule's trigger are explicitly blocked)
- Drip campaigns / timed email sequences (requires a sequence engine — different domain)
- Custom trigger/condition/action definitions by tenants
- Webhook actions (call external URL)
- SMS or WhatsApp delivery as notification actions (depends on future notification channels)

---

## 2. Business Context

### 2.1 Current State

After Phase 15C-I and 15C-II, the system has:
- Structured lead activities (Call, WhatsApp, Meeting, Demo Class, Note) — countable and filterable
- Follow-up task system with tiered escalation
- Lead scoring engine with Hot/Warm/Cold temperature classification
- Domain events firing on every significant CRM action: `LeadCreated`, `LeadStageChanged`, `LeadAssigned`, `LeadConverted`, `LeadStaleDetected`, `LeadActivityCreated`, `FollowUpTaskCreated`, `FollowUpTaskCompleted`, `FollowUpTaskOverdue`, `LeadScoreRecalculated`
- No mechanism for tenants to define "when X happens, automatically do Y"

Counselors manually react to everything. If a coaching center wants "when a website lead is created, automatically create a follow-up task to call within 2 hours" — a counselor must remember to do this every time. If an online academy wants "when a lead becomes Hot, notify the branch manager" — there is no way to configure this.

### 2.2 What Changes

After Phase 15C-III:
1. Tenant admins configure automation rules via a dropdown-based UI: select a trigger, optionally add conditions, choose an action.
2. When a matching domain event fires and conditions are met, the rule engine executes the configured action asynchronously.
3. Every rule execution is logged — the tenant admin can see "Rule X fired for Lead Y at time Z, action was: created follow-up task #123".
4. Rules can be enabled/disabled without deletion, allowing tenants to experiment safely.
5. The platform controls the universe of available triggers, conditions, and actions — tenants compose, they don't extend.

### 2.3 Architecture: Why Not a Generic Workflow Engine?

A generic workflow engine (like Temporal, n8n, or a custom BPMN interpreter) would be over-engineered for this use case. Education CRM automation needs are well-bounded:
- Triggers are a closed set of domain events
- Conditions are simple field comparisons
- Actions are a closed set of system operations
- No branching, no parallelism, no delays, no human approval steps

The architecture is a **flat rule evaluator**: event fires → scan matching rules → evaluate conditions → execute actions. This is one database query (find rules by trigger type) + one condition check per rule + one action dispatch per match. It scales to hundreds of rules per tenant without complexity.

The same `automation_rules` table and `RuleEngine` service can later be fronted by a visual builder UI — the backend doesn't change.

---

## 3. Business Rules (NON-NEGOTIABLE)

### 3.1 Rule Structure Rules

| Rule ID | Rule | Detail |
|---|---|---|
| BR-01 | Every rule has exactly one trigger, zero or more conditions, and exactly one action. | No multi-trigger rules. No multi-action rules. If a tenant wants two actions on the same trigger, they create two rules. |
| BR-02 | Rules belong to a tenant. They are tenant-scoped and tenant-isolated. | `BelongsToTenant` trait. |
| BR-03 | Rules have a `priority` field (integer, lower = higher priority). Rules matching the same event are evaluated in priority order. | Default priority = 100. Tenant admin can reorder. |
| BR-04 | Rules have an `is_active` boolean. Inactive rules are never evaluated. | Toggle endpoint. No deletion required to stop a rule. |
| BR-05 | Rule names must be unique per tenant. | Database constraint + validation. |
| BR-06 | The maximum number of active rules per tenant is controlled by the subscription plan quota system (existing `TenantQuotaService`). | Quota key: `max_automation_rules`. Default limit depends on plan tier. |

### 3.2 Trigger Catalog

| Trigger Code | Domain Event | Description | Available Event Data |
|---|---|---|---|
| `lead.created` | `LeadCreated` | A new lead enters the pipeline | `lead_id`, `source`, `branch_id`, `assigned_to` |
| `lead.stage_changed` | `LeadStageChanged` | A lead moves to a different pipeline stage | `lead_id`, `old_stage`, `new_stage`, `changed_by` |
| `lead.assigned` | `LeadAssigned` | A lead is assigned (or reassigned) to a counselor | `lead_id`, `old_assignee`, `new_assignee` |
| `lead.activity_logged` | `LeadActivityCreated` | A counselor logs an activity on a lead | `lead_id`, `activity_type`, `activity_outcome`, `performed_by` |
| `lead.score_changed` | `LeadScoreRecalculated` | A lead's score or temperature changes | `lead_id`, `old_score`, `new_score`, `old_temperature`, `new_temperature` |
| `lead.stale_detected` | `LeadStaleDetected` | The stale lead detection command flags a lead | `lead_id`, `days_inactive` |
| `lead.follow_up_overdue` | `FollowUpTaskOverdue` | A scheduled follow-up task becomes overdue | `lead_id`, `task_id`, `assigned_to`, `task_type` |

This is a **closed catalog**. New triggers are added by developers in future phases — tenants cannot define custom triggers.

### 3.3 Condition Catalog

Conditions are optional filters that narrow when a rule fires. A rule with no conditions fires on every occurrence of the trigger. A rule with multiple conditions requires ALL conditions to be true (AND logic — no OR in Phase 1).

| Condition Type | Applicable Triggers | Operator Options | Value Type |
|---|---|---|---|
| `source_is` | `lead.created`, `lead.stage_changed`, `lead.activity_logged`, `lead.score_changed`, `lead.stale_detected` | `equals`, `not_equals`, `in` | LeadSource value(s) |
| `stage_is` | `lead.stage_changed`, `lead.activity_logged`, `lead.score_changed`, `lead.stale_detected` | `equals`, `not_equals`, `in` | PipelineStage value(s) |
| `new_stage_is` | `lead.stage_changed` | `equals`, `in` | PipelineStage value(s) — the stage the lead moved TO |
| `temperature_is` | `lead.score_changed`, `lead.activity_logged`, `lead.stage_changed` | `equals`, `not_equals`, `in` | LeadTemperature value(s): `hot`, `warm`, `cold` |
| `temperature_changed_to` | `lead.score_changed` | `equals` | LeadTemperature value — fires only when temperature actually transitions to this value |
| `activity_type_is` | `lead.activity_logged` | `equals`, `in` | LeadActivityType value(s) |

**Condition validation rules:**
- BR-07: The API rejects conditions that reference data not available in the selected trigger's event payload. For example, `activity_type_is` is not valid on `lead.created` (no activity data in that event).
- BR-08: Condition values must come from valid domain value sets (e.g., `source_is = 'invalid_source'` is rejected).
- BR-09: The `in` operator accepts an array of values (max 10 items).

### 3.4 Action Catalog

| Action Code | Description | Parameters | Execution Detail |
|---|---|---|---|
| `send_notification` | Send an in-app + email notification to a specified recipient | `recipient_type` (`assignee`, `branch_manager`, `specific_user`), `recipient_user_id` (if `specific_user`), `notification_title`, `notification_body` | Constructs `NotificationPayload` and dispatches via Phase 14 `NotificationDispatcher`. Category: `system`. Priority: `default`. |
| `create_follow_up_task` | Create a follow-up task on the lead | `task_type` (from `FollowUpTaskType`: `call`, `whatsapp`, `meeting`, `demo_class`), `due_in_hours` (integer, 1–720), `description` (optional text) | Calls `CreateFollowUpTaskUseCase` (15C-I). `due_at` = now() + `due_in_hours`. Assigned to the lead's current assignee. |
| `reassign_lead` | Reassign the lead to a different counselor | `assignment_strategy`: `round_robin` (use existing `LeadAutoAssignService`) or `specific_user` with `user_id` | Calls `AssignLeadUseCase` (15A). |
| `change_stage` | Move the lead to a specific pipeline stage | `target_stage` (from `PipelineStage`) | Calls `ChangeLeadStageUseCase` (15A). Must validate that the target stage is a valid transition from the lead's current stage. |
| `log_system_activity` | Log a system-generated activity note on the lead | `body` (text template with variable placeholders) | Calls `LogLeadActivityUseCase` (15C-I) with `type = 'note'` and `performed_by = system_user_id`. |

**Action validation rules:**
- BR-10: `send_notification` requires `notification_title` (max 200 chars) and `notification_body` (max 1000 chars). Body supports variable placeholders: `{lead_name}`, `{lead_source}`, `{lead_stage}`, `{lead_score}`, `{lead_temperature}`, `{assignee_name}`.
- BR-11: `create_follow_up_task` requires `task_type` and `due_in_hours`. The minimum `due_in_hours` is 1 (no immediate tasks — that would bypass the follow-up scheduling purpose).
- BR-12: `change_stage` validates that the target stage is reachable from the lead's current stage via valid transitions. If the transition is invalid at execution time (lead may have moved since the trigger fired), the action is skipped and logged as a failed execution.
- BR-13: `reassign_lead` with `round_robin` uses the same `LeadAutoAssignService` from 15A. The lead's current branch is used to find eligible counselors.
- BR-14: All actions are executed as the **system user**, not as the tenant admin who created the rule. Audit logs record `actor = system_automation` with a reference to the rule ID.

### 3.5 Loop Prevention Rules

| Rule ID | Rule | Detail |
|---|---|---|
| BR-15 | **Actions executed by the rule engine do NOT trigger other rules.** This is the primary loop prevention mechanism. | The rule engine sets a `is_automation_context` flag (via a context service or request attribute). All domain event listeners for the rule engine check this flag and skip evaluation if true. |
| BR-16 | The `is_automation_context` flag is scoped to the current execution — it does NOT persist across requests or queue jobs. | Thread-local or request-scoped context. Cleared after the action completes. |
| BR-17 | The rule engine logs a warning if an action would have triggered a matching rule but was suppressed by loop prevention. | Visible in the rule execution log for debugging. |
| BR-18 | A single event can match and fire multiple rules (ordered by priority). But the actions from those rules do NOT chain into further rule evaluations. | Event → Rule A fires → Action A executes (in automation context) → Rule B fires → Action B executes (in automation context). Done. No second pass. |

### 3.6 Execution Rules

| Rule ID | Rule | Detail |
|---|---|---|
| BR-19 | Rule evaluation and action execution happen **asynchronously** via a queued job. The triggering event handler dispatches the job and returns immediately. | `EvaluateAutomationRulesJob` on the `default` queue. The original use case (e.g., `ChangeLeadStageUseCase`) is never blocked by rule evaluation. |
| BR-20 | Each rule execution is logged to `automation_rule_executions` with: rule_id, lead_id, trigger_code, conditions_met (boolean), action_code, action_result (`success`, `skipped`, `failed`), error_message (if failed), executed_at. | This is the tenant admin's debugging tool. |
| BR-21 | A failed action does NOT retry automatically. It is logged as `failed` and the tenant admin can investigate via the execution log. | No retry queue for automation actions. Actions use existing UseCases which have their own error handling. |
| BR-22 | If rule evaluation itself fails (e.g., database error loading rules), the failure is logged but does NOT affect the triggering event. The lead stage still changes, the activity is still logged — automation is a side effect, not a prerequisite. | Try-catch in the job. Rule engine failures are isolated from core CRM operations. |
| BR-23 | The rule engine processes rules for the tenant identified by the event. It sets `TenantContext` from the event payload. | Same tenant iteration pattern as all CRM automation. |

---

## 4. Domain Model

### 4.1 Bounded Context Placement

The automation rule engine lives within `TenantAdminDashboard/LeadManagement`. It is NOT a separate bounded context — the rules are tightly coupled to lead management triggers, conditions, and actions. If we later add automation for other modules (e.g., "when a course enrollment happens, send X"), that would be a new bounded context. CRM automation stays in CRM.

### 4.2 New Domain Layer Components

**Path:** `app/Domain/TenantAdminDashboard/LeadManagement/`

| Component | Type | Location | Purpose |
|---|---|---|---|
| `AutomationRuleEntity` | Entity | `Entities/AutomationRuleEntity.php` | Root entity. Holds trigger_code, conditions (array of condition objects), action_code, action_params, priority, is_active, name, description. |
| `AutomationTrigger` | Value Object | `ValueObjects/AutomationTrigger.php` | Closed enum of trigger codes. Validates against the trigger catalog. Exposes `availableEventData(): array` returning the field names available for condition evaluation. |
| `AutomationCondition` | Value Object | `ValueObjects/AutomationCondition.php` | Immutable: `condition_type`, `operator`, `value`. Includes `evaluate(array $eventData): bool` method. |
| `AutomationConditionType` | Value Object | `ValueObjects/AutomationConditionType.php` | Closed enum: `source_is`, `stage_is`, `new_stage_is`, `temperature_is`, `temperature_changed_to`, `activity_type_is`. Knows which triggers it's compatible with. |
| `AutomationConditionOperator` | Value Object | `ValueObjects/AutomationConditionOperator.php` | Closed enum: `equals`, `not_equals`, `in`. |
| `AutomationAction` | Value Object | `ValueObjects/AutomationAction.php` | Closed enum of action codes. Validates action_params against the required parameter schema per action code. |
| `AutomationRuleCreated` | Domain Event | `Events/AutomationRuleCreated.php` | Dispatched when a rule is created. |
| `AutomationRuleUpdated` | Domain Event | `Events/AutomationRuleUpdated.php` | Dispatched when a rule is modified. |
| `AutomationRuleToggled` | Domain Event | `Events/AutomationRuleToggled.php` | Dispatched when a rule is enabled/disabled. |
| `AutomationRuleRepositoryInterface` | Repository Interface | `Repositories/AutomationRuleRepositoryInterface.php` | CRUD + `findActiveByTrigger(string $triggerCode): array`. |
| `AutomationExecutionLogRepositoryInterface` | Repository Interface | `Repositories/AutomationExecutionLogRepositoryInterface.php` | Write execution logs. Query execution history. |
| `InvalidConditionForTriggerException` | Exception | `Exceptions/InvalidConditionForTriggerException.php` | Thrown when a condition type is incompatible with the selected trigger. |
| `AutomationRuleLimitExceededException` | Exception | `Exceptions/AutomationRuleLimitExceededException.php` | Thrown when the tenant has reached their max_automation_rules quota. |

### 4.3 New Application Layer Components

**Path:** `app/Application/TenantAdminDashboard/LeadManagement/`

| Component | Type | Location | Purpose |
|---|---|---|---|
| `CreateAutomationRuleUseCase` | Use Case | `UseCases/CreateAutomationRuleUseCase.php` | Creates a rule. Validates trigger/condition compatibility. Checks quota. Dispatches `AutomationRuleCreated`. |
| `UpdateAutomationRuleUseCase` | Use Case | `UseCases/UpdateAutomationRuleUseCase.php` | Updates a rule. Revalidates all fields. Dispatches `AutomationRuleUpdated`. |
| `ToggleAutomationRuleUseCase` | Use Case | `UseCases/ToggleAutomationRuleUseCase.php` | Enable/disable a rule. Dispatches `AutomationRuleToggled`. |
| `DeleteAutomationRuleUseCase` | Use Case | `UseCases/DeleteAutomationRuleUseCase.php` | Hard deletes a rule. Audit-logged. Associated execution logs are preserved (orphaned). |
| `ListAutomationRulesQuery` | Query | `Queries/ListAutomationRulesQuery.php` | Paginated list of rules for the tenant. Filterable by trigger, is_active. |
| `ListRuleExecutionLogsQuery` | Query | `Queries/ListRuleExecutionLogsQuery.php` | Paginated execution history for a specific rule or all rules. Filterable by result (success/failed/skipped), date range. |
| `GetAutomationCatalogQuery` | Query | `Queries/GetAutomationCatalogQuery.php` | Returns the full catalog of available triggers, conditions, and actions with their parameter schemas. This powers the frontend dropdown builder. |
| `CreateAutomationRuleCommand` | Command DTO | `Commands/CreateAutomationRuleCommand.php` | Input DTO for rule creation. |
| `UpdateAutomationRuleCommand` | Command DTO | `Commands/UpdateAutomationRuleCommand.php` | Input DTO for rule update. |

### 4.4 New Application Layer — Rule Engine

**Path:** `app/Application/TenantAdminDashboard/LeadManagement/Automation/`

| Component | Type | Location | Purpose |
|---|---|---|---|
| `RuleEngineService` | Service | `Services/RuleEngineService.php` | Core engine. Receives a trigger code + event data → loads matching active rules → evaluates conditions → dispatches action execution. |
| `AutomationContextService` | Service | `Services/AutomationContextService.php` | Manages the `is_automation_context` flag. `enter()`, `exit()`, `isActive(): bool`. Request-scoped. |
| `EvaluateAutomationRulesJob` | Queued Job | `Jobs/EvaluateAutomationRulesJob.php` | Queued job dispatched by trigger listeners. Calls `RuleEngineService`. |
| `TriggerAutomationOnLeadCreatedListener` | Listener | `Listeners/TriggerAutomationOnLeadCreatedListener.php` | Listens to `LeadCreated`. Dispatches `EvaluateAutomationRulesJob`. |
| `TriggerAutomationOnStageChangedListener` | Listener | `Listeners/TriggerAutomationOnStageChangedListener.php` | Listens to `LeadStageChanged`. Dispatches `EvaluateAutomationRulesJob`. |
| `TriggerAutomationOnLeadAssignedListener` | Listener | `Listeners/TriggerAutomationOnLeadAssignedListener.php` | Listens to `LeadAssigned`. Dispatches `EvaluateAutomationRulesJob`. |
| `TriggerAutomationOnActivityLoggedListener` | Listener | `Listeners/TriggerAutomationOnActivityLoggedListener.php` | Listens to `LeadActivityCreated`. Dispatches `EvaluateAutomationRulesJob`. |
| `TriggerAutomationOnScoreChangedListener` | Listener | `Listeners/TriggerAutomationOnScoreChangedListener.php` | Listens to `LeadScoreRecalculated`. Dispatches `EvaluateAutomationRulesJob`. |
| `TriggerAutomationOnStaleDetectedListener` | Listener | `Listeners/TriggerAutomationOnStaleDetectedListener.php` | Listens to `LeadStaleDetected`. Dispatches `EvaluateAutomationRulesJob`. |
| `TriggerAutomationOnFollowUpOverdueListener` | Listener | `Listeners/TriggerAutomationOnFollowUpOverdueListener.php` | Listens to `FollowUpTaskOverdue`. Dispatches `EvaluateAutomationRulesJob`. |

**All 7 listeners follow the same pattern:**
1. Check `AutomationContextService::isActive()` — if true, skip (loop prevention per BR-15)
2. Extract event data into a normalized `array` matching the trigger's `availableEventData` schema
3. Dispatch `EvaluateAutomationRulesJob` with trigger_code, event_data, tenant_id, lead_id

### 4.5 New Application Layer — Action Executors

**Path:** `app/Application/TenantAdminDashboard/LeadManagement/Automation/Actions/`

Each action code has a dedicated executor class implementing a common `ActionExecutorInterface`:

```
interface ActionExecutorInterface
{
    public function execute(int $leadId, array $actionParams, array $eventData): ActionResult;
    public function supports(string $actionCode): bool;
}
```

| Executor | Action Code | Delegates To |
|---|---|---|
| `SendNotificationExecutor` | `send_notification` | `NotificationDispatcher` (Phase 14) |
| `CreateFollowUpTaskExecutor` | `create_follow_up_task` | `CreateFollowUpTaskUseCase` (15C-I) |
| `ReassignLeadExecutor` | `reassign_lead` | `AssignLeadUseCase` (15A) or `LeadAutoAssignService` (15A) |
| `ChangeStageExecutor` | `change_stage` | `ChangeLeadStageUseCase` (15A) |
| `LogSystemActivityExecutor` | `log_system_activity` | `LogLeadActivityUseCase` (15C-I) |

Each executor wraps its delegation in a try-catch and returns an `ActionResult` (success/skipped/failed with optional error message). The `RuleEngineService` logs the result.

### 4.6 New Infrastructure Layer Components

**Path:** `app/Infrastructure/Persistence/TenantAdminDashboard/LeadManagement/`

| Component | Type | Purpose |
|---|---|---|
| `AutomationRuleRecord` | Eloquent Model | Maps to `automation_rules` table. `BelongsToTenant` trait. |
| `AutomationExecutionLogRecord` | Eloquent Model | Maps to `automation_rule_executions` table. `BelongsToTenant` trait. |
| `EloquentAutomationRuleRepository` | Repository | Implements `AutomationRuleRepositoryInterface`. Key method: `findActiveByTrigger(string $triggerCode)` — indexed query. |
| `EloquentAutomationExecutionLogRepository` | Repository | Implements `AutomationExecutionLogRepositoryInterface`. |

### 4.7 HTTP Layer

**Controllers** — `app/Http/Controllers/Api/TenantAdminDashboard/LeadManagement/`

| Controller | Endpoints |
|---|---|
| `AutomationRuleController` | `POST /api/tenant/automation-rules` — create rule |
| | `GET /api/tenant/automation-rules` — list rules |
| | `GET /api/tenant/automation-rules/{rule}` — get rule detail |
| | `PUT /api/tenant/automation-rules/{rule}` — update rule |
| | `POST /api/tenant/automation-rules/{rule}/toggle` — enable/disable |
| | `DELETE /api/tenant/automation-rules/{rule}` — delete rule |
| | `GET /api/tenant/automation-rules/{rule}/executions` — rule execution history |
| `AutomationCatalogController` | `GET /api/tenant/automation-catalog` — get available triggers, conditions, actions |

**Form Requests:**

| Request | Validates |
|---|---|
| `CreateAutomationRuleRequest` | `name` (required, string, max 100), `description` (optional, max 500), `trigger_code` (required, from trigger catalog), `conditions` (optional array, each validated per §3.3), `action_code` (required, from action catalog), `action_params` (required, validated per action code schema), `priority` (optional, integer 1–999, default 100) |
| `UpdateAutomationRuleRequest` | Same fields as create, all optional (partial update). Revalidates the full rule after merge. |

**API Resources:**

| Resource | Shapes |
|---|---|
| `AutomationRuleResource` | `id`, `name`, `description`, `trigger_code`, `trigger_label`, `conditions` (array of {type, operator, value, label}), `action_code`, `action_label`, `action_params`, `priority`, `is_active`, `execution_count`, `last_executed_at`, `created_at`, `updated_at` |
| `AutomationExecutionLogResource` | `id`, `rule_id`, `rule_name`, `lead_id`, `lead_name`, `trigger_code`, `conditions_met`, `action_code`, `action_result`, `error_message`, `executed_at` |
| `AutomationCatalogResource` | `triggers[]` (code, label, description, available_event_data[]), `conditions[]` (type, label, applicable_triggers[], operators[], value_type, value_options[]), `actions[]` (code, label, description, parameters[]) |

**Capability Codes:**

| Code | Context | Who Has It | Purpose |
|---|---|---|---|
| `crm.automation.view` | Tenant Admin | Branch Managers, Admins | View automation rules and execution logs |
| `crm.automation.manage` | Tenant Admin | Admins only | Create, update, toggle, delete automation rules |

---

## 5. Database Schema

### 5.1 New Tables

**`automation_rules`** (tenant-scoped)

| Column | Type | Notes |
|---|---|---|
| `id` | BIGINT UNSIGNED PK | Auto-increment |
| `tenant_id` | BIGINT UNSIGNED NOT NULL | FK → `tenants.id`. Global scope enforced. |
| `name` | VARCHAR(100) NOT NULL | Human-readable rule name. Unique per tenant. |
| `description` | VARCHAR(500) NULLABLE | Optional description of what the rule does. |
| `trigger_code` | VARCHAR(50) NOT NULL | From trigger catalog (e.g., `lead.stage_changed`). |
| `conditions` | JSON NOT NULL DEFAULT '[]' | Array of condition objects: `[{"type": "source_is", "operator": "equals", "value": "referral"}]`. Empty array = no conditions. |
| `action_code` | VARCHAR(50) NOT NULL | From action catalog (e.g., `send_notification`). |
| `action_params` | JSON NOT NULL | Action-specific parameters. Schema validated per action code. |
| `priority` | INT UNSIGNED NOT NULL DEFAULT 100 | Lower = higher priority. Rules with the same trigger are evaluated in priority order. |
| `is_active` | BOOLEAN NOT NULL DEFAULT TRUE | Inactive rules are never evaluated. |
| `execution_count` | INT UNSIGNED NOT NULL DEFAULT 0 | Running count of successful executions. Incremented by the rule engine. |
| `last_executed_at` | TIMESTAMP NULLABLE | When this rule last fired successfully. |
| `created_by` | BIGINT UNSIGNED NOT NULL | FK → `users.id`. The admin who created the rule. |
| `created_at` | TIMESTAMP | |
| `updated_at` | TIMESTAMP | |

**Indexes:**
- `idx_automation_rules_tenant` → `(tenant_id)`
- `idx_automation_rules_trigger` → `(tenant_id, trigger_code, is_active)` — the primary query path for the rule engine
- `unq_automation_rules_name` → `(tenant_id, name)` UNIQUE

---

**`automation_rule_executions`** (tenant-scoped)

| Column | Type | Notes |
|---|---|---|
| `id` | BIGINT UNSIGNED PK | Auto-increment |
| `tenant_id` | BIGINT UNSIGNED NOT NULL | FK → `tenants.id`. |
| `rule_id` | BIGINT UNSIGNED NULLABLE | FK → `automation_rules.id` ON DELETE SET NULL. NULL if rule was deleted after execution. |
| `lead_id` | BIGINT UNSIGNED NOT NULL | FK → `leads.id`. The lead that triggered the rule. |
| `trigger_code` | VARCHAR(50) NOT NULL | Which trigger fired. Stored separately from rule in case rule is later modified. |
| `conditions_met` | BOOLEAN NOT NULL | Whether all conditions evaluated to true. |
| `action_code` | VARCHAR(50) NOT NULL | Which action was attempted. |
| `action_result` | VARCHAR(20) NOT NULL | `success`, `skipped`, `failed`. |
| `error_message` | TEXT NULLABLE | Error detail if `failed`. |
| `event_data` | JSON NULLABLE | Snapshot of the event data at execution time. For debugging. |
| `executed_at` | TIMESTAMP NOT NULL | When the rule was evaluated. |

**Indexes:**
- `idx_execution_log_tenant` → `(tenant_id)`
- `idx_execution_log_rule` → `(rule_id, executed_at DESC)` — for per-rule execution history
- `idx_execution_log_lead` → `(lead_id, executed_at DESC)` — for per-lead automation history
- `idx_execution_log_result` → `(tenant_id, action_result)` — for filtering failures

**No `created_at` / `updated_at`.** Execution logs are append-only. `executed_at` serves as the timestamp.

### 5.2 Execution Log Cleanup

Execution logs grow linearly with automation activity. A scheduled cleanup command deletes execution logs older than **90 days** (configurable). This is analogous to the Phase 14 notification cleanup command.

**Command:** `crm:cleanup-automation-logs`
**Schedule:** Daily at 3:00 AM
**Default retention:** 90 days

### 5.3 Subscription Plan Quota

Add a new quota key to the subscription plan system:

| Quota Key | Type | Description | Suggested Limits |
|---|---|---|---|
| `max_automation_rules` | integer | Maximum active automation rules per tenant | Free: 3, Starter: 10, Pro: 50, Enterprise: unlimited (-1) |

Enforced by `TenantQuotaService` (existing Phase 11B infrastructure) when creating or activating a rule.

---

## 6. Rule Engine — Detailed Specification

### 6.1 Evaluation Flow

```
1. Domain event fires (e.g., LeadStageChanged)
   ↓
2. Trigger listener checks AutomationContextService.isActive()
   → If true: SKIP (loop prevention). Return.
   → If false: continue
   ↓
3. Listener extracts event data into normalized array
   ↓
4. Listener dispatches EvaluateAutomationRulesJob(trigger_code, event_data, tenant_id, lead_id)
   ↓ (async, via queue)
5. Job calls RuleEngineService.evaluate(trigger_code, event_data, tenant_id, lead_id)
   ↓
6. RuleEngineService:
   a. Set TenantContext from tenant_id
   b. Load active rules WHERE trigger_code = ? AND is_active = true, ORDER BY priority ASC
   c. For each matching rule:
      i.   Evaluate all conditions against event_data
      ii.  If ANY condition fails → log execution as "skipped", continue to next rule
      iii. If ALL conditions pass (or no conditions):
           - Enter automation context (AutomationContextService.enter())
           - Resolve the action executor for the rule's action_code
           - Execute action with (lead_id, action_params, event_data)
           - Exit automation context (AutomationContextService.exit())
           - Log execution result (success/failed)
           - Increment rule execution_count and update last_executed_at
   d. Reset TenantContext
```

### 6.2 Condition Evaluation

Each `AutomationCondition` value object has an `evaluate(array $eventData): bool` method:

```
evaluate($eventData):
    $actualValue = $eventData[$this->fieldName] ?? null
    if ($actualValue === null) return false  // missing data = condition not met

    switch ($this->operator):
        'equals':     return $actualValue === $this->value
        'not_equals': return $actualValue !== $this->value
        'in':         return in_array($actualValue, $this->value, true)
```

The `fieldName` is derived from the `condition_type`:
- `source_is` → field `source`
- `stage_is` → field `stage` (current stage of the lead, loaded fresh)
- `new_stage_is` → field `new_stage` (from event data)
- `temperature_is` → field `temperature` (current temperature, loaded fresh)
- `temperature_changed_to` → field `new_temperature` (from event data)
- `activity_type_is` → field `activity_type` (from event data)

**Important:** For conditions that reference the lead's **current state** (like `stage_is`, `temperature_is`) rather than event data, the rule engine must load the current lead record. This is because by the time the async job runs, the lead's state might differ from when the event was dispatched. The engine should evaluate against the **current state**, not the event snapshot, for current-state conditions. Event-data conditions (`new_stage_is`, `temperature_changed_to`, `activity_type_is`) use the event payload.

### 6.3 Action Execution

Each `ActionExecutorInterface` implementation:
1. Receives `leadId`, `actionParams`, `eventData`
2. Loads necessary data (lead record, assignee, branch)
3. Calls the existing UseCase (delegated execution)
4. Returns `ActionResult::success()` or `ActionResult::failed($message)` or `ActionResult::skipped($reason)`

**Variable substitution in notification body:**

The `SendNotificationExecutor` replaces placeholders in `notification_title` and `notification_body` before dispatching:

| Placeholder | Resolved From |
|---|---|
| `{lead_name}` | Lead record |
| `{lead_source}` | Lead record |
| `{lead_stage}` | Lead record (current stage) |
| `{lead_score}` | Lead record |
| `{lead_temperature}` | Lead record |
| `{assignee_name}` | Lead's assigned counselor |
| `{branch_name}` | Lead's branch |

If a placeholder cannot be resolved, it is replaced with an empty string (not left as `{lead_name}`).

### 6.4 Example Rules

**Example 1: "When a website lead is created, auto-create a call follow-up in 2 hours"**
```json
{
    "name": "Website Lead Auto Follow-up",
    "trigger_code": "lead.created",
    "conditions": [
        { "type": "source_is", "operator": "equals", "value": "website" }
    ],
    "action_code": "create_follow_up_task",
    "action_params": {
        "task_type": "call",
        "due_in_hours": 2,
        "description": "Auto-generated: Call new website lead within 2 hours"
    },
    "priority": 10
}
```

**Example 2: "When a lead becomes Hot, notify the branch manager"**
```json
{
    "name": "Hot Lead Alert to Manager",
    "trigger_code": "lead.score_changed",
    "conditions": [
        { "type": "temperature_changed_to", "operator": "equals", "value": "hot" }
    ],
    "action_code": "send_notification",
    "action_params": {
        "recipient_type": "branch_manager",
        "notification_title": "Hot Lead Alert: {lead_name}",
        "notification_body": "{lead_name} from {lead_source} is now Hot (score: {lead_score}). Currently at stage: {lead_stage}. Assigned to: {assignee_name}."
    },
    "priority": 20
}
```

**Example 3: "When a lead is stale, reassign via round-robin"**
```json
{
    "name": "Stale Lead Auto-Reassign",
    "trigger_code": "lead.stale_detected",
    "conditions": [],
    "action_code": "reassign_lead",
    "action_params": {
        "assignment_strategy": "round_robin"
    },
    "priority": 50
}
```

**Example 4: "When a demo class activity is logged, move lead to Interested"**
```json
{
    "name": "Demo Attended → Interested",
    "trigger_code": "lead.activity_logged",
    "conditions": [
        { "type": "activity_type_is", "operator": "equals", "value": "demo_class" }
    ],
    "action_code": "change_stage",
    "action_params": {
        "target_stage": "interested"
    },
    "priority": 30
}
```

---

## 7. API Contracts

### 7.1 Automation Catalog Endpoint

**`GET /api/tenant/automation-catalog`**

Response:
```json
{
    "triggers": [
        {
            "code": "lead.created",
            "label": "Lead Created",
            "description": "Fires when a new lead enters the pipeline",
            "available_event_data": ["lead_id", "source", "branch_id", "assigned_to"]
        },
        {
            "code": "lead.stage_changed",
            "label": "Lead Stage Changed",
            "description": "Fires when a lead moves to a different pipeline stage",
            "available_event_data": ["lead_id", "old_stage", "new_stage", "changed_by"]
        }
    ],
    "conditions": [
        {
            "type": "source_is",
            "label": "Lead Source",
            "applicable_triggers": ["lead.created", "lead.stage_changed", "lead.activity_logged", "lead.score_changed", "lead.stale_detected"],
            "operators": ["equals", "not_equals", "in"],
            "value_type": "lead_source",
            "value_options": ["referral", "walk_in", "website", "social_media", "google_ads", "facebook_ads", "event", "other"]
        },
        {
            "type": "temperature_changed_to",
            "label": "Temperature Changed To",
            "applicable_triggers": ["lead.score_changed"],
            "operators": ["equals"],
            "value_type": "lead_temperature",
            "value_options": ["hot", "warm", "cold"]
        }
    ],
    "actions": [
        {
            "code": "send_notification",
            "label": "Send Notification",
            "description": "Send an in-app and email notification",
            "parameters": [
                { "name": "recipient_type", "type": "select", "required": true, "options": ["assignee", "branch_manager", "specific_user"] },
                { "name": "recipient_user_id", "type": "user_select", "required": false, "condition": "recipient_type === 'specific_user'" },
                { "name": "notification_title", "type": "text", "required": true, "max_length": 200, "supports_variables": true },
                { "name": "notification_body", "type": "textarea", "required": true, "max_length": 1000, "supports_variables": true }
            ],
            "available_variables": ["{lead_name}", "{lead_source}", "{lead_stage}", "{lead_score}", "{lead_temperature}", "{assignee_name}", "{branch_name}"]
        },
        {
            "code": "create_follow_up_task",
            "label": "Create Follow-up Task",
            "description": "Schedule a follow-up task on the lead",
            "parameters": [
                { "name": "task_type", "type": "select", "required": true, "options": ["call", "whatsapp", "meeting", "demo_class"] },
                { "name": "due_in_hours", "type": "number", "required": true, "min": 1, "max": 720 },
                { "name": "description", "type": "text", "required": false, "max_length": 500 }
            ]
        }
    ]
}
```

Capability: `crm.automation.view`.

This endpoint is the **single source of truth** for the frontend rule builder UI. The frontend does NOT hardcode any trigger/condition/action lists — it renders dynamically from this catalog.

### 7.2 Rule CRUD Endpoints

**`POST /api/tenant/automation-rules`** — Create rule

Request:
```json
{
    "name": "Website Lead Auto Follow-up",
    "description": "Automatically create a call follow-up for website leads",
    "trigger_code": "lead.created",
    "conditions": [
        { "type": "source_is", "operator": "equals", "value": "website" }
    ],
    "action_code": "create_follow_up_task",
    "action_params": {
        "task_type": "call",
        "due_in_hours": 2,
        "description": "Auto-generated: Call new website lead"
    },
    "priority": 10
}
```

Response: `201 Created` — `AutomationRuleResource`

Capability: `crm.automation.manage`. Quota check: `max_automation_rules`.

---

**`GET /api/tenant/automation-rules?is_active=true&trigger_code=lead.created&page=1&per_page=20`**

Response: Paginated `AutomationRuleResource[]`

Capability: `crm.automation.view`.

---

**`GET /api/tenant/automation-rules/{rule}`**

Response: `AutomationRuleResource` with full detail.

Capability: `crm.automation.view`.

---

**`PUT /api/tenant/automation-rules/{rule}`**

Request: Same shape as create. All fields optional (partial update). The engine revalidates the full rule state after merging.

Response: `200 OK` — `AutomationRuleResource`

Capability: `crm.automation.manage`.

---

**`POST /api/tenant/automation-rules/{rule}/toggle`**

No request body. Flips `is_active`. If activating, checks quota.

Response: `200 OK` — `AutomationRuleResource`

Capability: `crm.automation.manage`.

---

**`DELETE /api/tenant/automation-rules/{rule}`**

Response: `204 No Content`

Capability: `crm.automation.manage`. Audit-logged.

---

**`GET /api/tenant/automation-rules/{rule}/executions?result=failed&page=1&per_page=20`**

Response: Paginated `AutomationExecutionLogResource[]`

Capability: `crm.automation.view`.

---

## 8. Frontend Requirements

### 8.1 Automation Rules List Page

**Location:** CRM → Automation Rules

A table listing all automation rules for the tenant:
- Columns: Name, Trigger (human-readable label), Action (human-readable label), Status (Active/Inactive toggle), Executions (count), Last Fired (relative time), Priority
- Actions: Edit, Toggle, Delete
- "Create Rule" button (disabled with tooltip if quota reached)
- Filter by trigger type, active/inactive

### 8.2 Rule Builder Form

A step-by-step form (not a visual workflow builder):

**Step 1 — Trigger:** Dropdown of available triggers from the catalog. Selecting a trigger updates available conditions and shows the trigger description.

**Step 2 — Conditions (optional):** "Add Condition" button. Each condition row: condition type dropdown (filtered by selected trigger's applicable conditions) → operator dropdown → value input (dropdown for enums, text for free-form). Multiple conditions displayed as an AND chain. "Remove" button per condition.

**Step 3 — Action:** Dropdown of available actions. Selecting an action reveals the parameter form (dynamic from catalog). For `send_notification`, show a text area with variable insertion buttons (click to insert `{lead_name}` etc.).

**Step 4 — Settings:** Name (required), description (optional), priority (number input, default 100).

### 8.3 Execution Log View

**Location:** CRM → Automation Rules → [Rule] → Executions tab

A table of execution history:
- Columns: Time, Lead Name, Trigger, Conditions Met (✓/✗), Result (Success/Skipped/Failed), Error (if failed)
- Clicking a row expands to show the event data snapshot
- Filterable by result type, date range

---

## 9. Security Boundaries

### 9.1 Tenant Isolation

- Automation rules are tenant-scoped via `BelongsToTenant` trait and global scope.
- The rule engine loads rules only for the tenant identified by the triggering event. Cross-tenant rule evaluation is impossible.
- Execution logs are tenant-scoped.

### 9.2 Authorization

- Rule CRUD requires `crm.automation.manage` (admin-only).
- Viewing rules and execution logs requires `crm.automation.view` (branch managers + admins).
- Counselors cannot create or view automation rules.

### 9.3 Action Authorization

- Actions are executed as the **system user** — they bypass capability checks on the underlying UseCases. This is intentional: an automation rule configured by an admin should execute even if the lead's assigned counselor doesn't have the relevant capability.
- BR-14 already specifies: audit logs record `actor = system_automation` with the rule ID.
- The `AutomationContextService` ensures the system identity is used for the action execution scope.

### 9.4 Injection Prevention

- `notification_body` and `notification_title` support only the predefined variable placeholders listed in §6.3. The variable resolver does NOT use `eval()`, `preg_replace_callback` with arbitrary patterns, or any form of template engine. It is a simple `str_replace` on a fixed set of placeholders.
- `conditions` JSON is validated against the condition catalog schema. Arbitrary JSON structures are rejected.
- `action_params` JSON is validated against the action parameter schema. Arbitrary parameters are rejected.

---

## 10. Implementation Plan Requirements

The developer's Implementation Plan must include the following sections:

| # | Section | Content |
|---|---|---|
| 1 | Executive Summary | What gets built, what does NOT |
| 2 | Dependency Verification | Verify 15C-I and 15C-II are complete: all domain events fire correctly, `LeadAutoAssignService` exists, all UseCases called by action executors exist and have correct signatures. Verify `TenantQuotaService` can enforce `max_automation_rules`. |
| 3 | Architecture Decisions | Any deviations from this spec, with justification |
| 4 | Migration Plan | New tables with exact SQL. Quota key seeding. |
| 5 | Domain Layer | Entities, value objects, events, exceptions — with full class definitions. Special attention to the condition evaluation logic and trigger/condition compatibility matrix. |
| 6 | Application Layer | UseCases, queries, commands, rule engine service, automation context service, action executors — with method signatures |
| 7 | Infrastructure Layer | Eloquent models, repositories, queued job |
| 8 | HTTP Layer | Controllers, FormRequests, Resources, route definitions with middleware and capability codes |
| 9 | Rule Engine Specification | Full evaluation flow, condition evaluation, action dispatch, loop prevention mechanism |
| 10 | Action Executors | Each executor's delegation pattern, error handling, result reporting |
| 11 | Trigger Listener Wiring | All 7 listeners, event data extraction, job dispatch |
| 12 | Frontend Specification | Rule list page, rule builder form, execution log view |
| 13 | Catalog Endpoint | Full catalog response structure with all triggers, conditions, actions, parameters |
| 14 | Execution Log Cleanup | Command specification |
| 15 | Implementation Sequence | Ordered steps with dependencies and day estimates |
| 16 | Test Plan | Every test file with description |
| 17 | Quality Gate Verification | Checklist from §11 |
| 18 | File Manifest | Every new and modified file |

---

## 11. Quality Gates (Must Pass Before CRM Automation is Production-Ready)

### 11.1 Rule CRUD Gates

- [ ] Create automation rule with trigger, conditions, action, and priority
- [ ] Update rule — partial updates work, full revalidation applied
- [ ] Toggle rule active/inactive — inactive rules never evaluated
- [ ] Delete rule — execution logs preserved with `rule_id = NULL`
- [ ] Unique rule name per tenant enforced
- [ ] Quota enforcement: cannot create/activate beyond `max_automation_rules` limit
- [ ] Condition-trigger compatibility validated: `activity_type_is` rejected on `lead.created`
- [ ] Invalid action params rejected: `send_notification` without `notification_title` fails validation

### 11.2 Rule Engine Gates

- [ ] Rule fires when trigger event matches and all conditions are true
- [ ] Rule does NOT fire when trigger matches but a condition fails
- [ ] Rules with no conditions fire on every trigger occurrence
- [ ] Multiple rules on the same trigger execute in priority order (lower number first)
- [ ] `LeadScoreRecalculated` with `temperature_changed_to: hot` condition fires only when temperature actually changes to hot, not when it was already hot
- [ ] Actions delegate correctly to existing UseCases (verify each of 5 action types)
- [ ] Failed action logged as `failed` with error message — does not crash the rule engine

### 11.3 Loop Prevention Gates

- [ ] Action-triggered domain events do NOT cause further rule evaluation
- [ ] `AutomationContextService.isActive()` returns true during action execution
- [ ] `AutomationContextService.isActive()` returns false after action completes
- [ ] Loop prevention warning logged when a suppressed rule match is detected
- [ ] Actions from multiple rules on the same event all execute (no short-circuit), but none chain

### 11.4 Action-Specific Gates

- [ ] `send_notification`: Variable placeholders resolve correctly in title and body
- [ ] `send_notification`: Unresolvable placeholders replaced with empty string
- [ ] `send_notification`: Notification dispatched via Phase 14 NotificationDispatcher
- [ ] `create_follow_up_task`: Task created with correct `due_at` (now + due_in_hours)
- [ ] `create_follow_up_task`: Task assigned to lead's current assignee
- [ ] `reassign_lead` with `round_robin`: Uses existing LeadAutoAssignService
- [ ] `reassign_lead` with `specific_user`: Assigns to the specified user (must be in same tenant)
- [ ] `change_stage`: Validates transition is legal. Skips (not fails) if transition is invalid.
- [ ] `log_system_activity`: Creates a note activity with `performed_by = system_user`

### 11.5 Execution Log Gates

- [ ] Every rule evaluation (fire, skip, fail) creates an execution log record
- [ ] Execution log records event data snapshot
- [ ] Execution log query by rule_id returns correct history
- [ ] Execution log query by lead_id returns all rules that fired for that lead
- [ ] Cleanup command deletes logs older than 90 days
- [ ] Execution count and last_executed_at on the rule record update correctly

### 11.6 Security Gates

- [ ] Tenant isolation: Tenant A's rules never evaluate for Tenant B's events
- [ ] Rule CRUD requires `crm.automation.manage` capability
- [ ] Rule viewing requires `crm.automation.view` capability
- [ ] Actions execute as system user — audit logs show `actor = system_automation`
- [ ] Notification body variable substitution uses simple str_replace, no eval or template engine
- [ ] Conditions JSON rejects arbitrary structures not in the condition catalog

### 11.7 Frontend Gates

- [ ] Automation rules list page shows all rules with status, trigger, action, execution count
- [ ] Rule builder form dynamically filters conditions based on selected trigger
- [ ] Rule builder form dynamically shows action parameters based on selected action
- [ ] Notification body text area supports variable insertion buttons
- [ ] Execution log view shows history with expandable event data
- [ ] Quota limit message shown when creating/activating beyond limit

### 11.8 Regression Gates

- [ ] All existing lead management tests pass (0 regressions)
- [ ] All Phase 15C-I tests pass (activities, follow-ups, escalation)
- [ ] All Phase 15C-II tests pass (scoring, temperature, recalculation)
- [ ] Stale lead detection continues to work AND triggers automation rules
- [ ] Kanban drag-and-drop stage changes trigger automation rules
- [ ] PHPStan Level 5 passes with 0 new errors

---

## 12. Constraints & Reminders

### Architecture Constraints

- **The rule engine is a side effect, not a prerequisite.** If the rule engine fails, the triggering event (stage change, activity log, etc.) must still succeed. The `EvaluateAutomationRulesJob` is dispatched asynchronously — the triggering use case never waits for it.
- **Actions delegate to existing UseCases.** Action executors do NOT contain business logic. They construct the input DTO and call the UseCase. All validation and domain rules in the UseCase still apply.
- **Loop prevention is non-negotiable.** The `AutomationContextService` flag MUST be checked by every trigger listener. If a new trigger listener is added in the future without this check, infinite loops become possible. The implementation plan must include a test that verifies loop prevention for each trigger/action combination that could theoretically chain.
- **The catalog endpoint is the single source of truth.** The frontend must render the rule builder dynamically from the catalog response. No hardcoded trigger/condition/action lists in the frontend. This means adding a new trigger in the future is a backend-only change — the frontend adapts automatically.
- **One rule = one action.** Do NOT implement multi-action rules. If a tenant wants "on stage change → send notification AND create follow-up", they create two rules with the same trigger. This keeps the rule model simple and the execution log unambiguous.
- **Audit logs OUTSIDE transactions.** Same as all previous phases.

### Docker Environment

- Container: Alpine Linux — use `sh` not `bash`
- Container name: `ubotz_backend`
- Queue: Redis DB 3

### What NOT to Do

- Do NOT build a visual workflow builder. The UI is dropdown-based form fields. A visual builder is a future phase if tenant demand justifies it.
- Do NOT implement delay/wait steps. All actions execute immediately when the trigger fires. Delayed actions require a scheduler/timer system that doesn't exist yet.
- Do NOT allow actions to trigger further rule evaluation. The `AutomationContextService` flag prevents this. No exceptions.
- Do NOT store the full lead entity in the execution log. Store `lead_id` and the event data snapshot. The execution log is for debugging, not data warehousing.
- Do NOT create custom notification types for automation. Use the Phase 14 `NotificationDispatcher` with `system` category and `default` priority. The notification `type` field should be `automation_rule_notification`.
- Do NOT implement rule chains or dependencies between rules. Rules are flat and independent. A rule cannot reference another rule's output.
- Do NOT bypass capability checks in action executors by calling repository methods directly. Always delegate to the existing UseCase. The UseCase contains business validation that must not be skipped.
- Do NOT hardcode the trigger/condition/action catalog in the frontend. Use the catalog endpoint.
- Do NOT allow `eval()` or any dynamic code execution in variable substitution. Simple `str_replace` only.

---

## 13. Definition of Done

Phase 15C-III is complete when:

1. The implementation plan has been reviewed and approved by the Principal Engineer.
2. All code is implemented per the approved plan.
3. All quality gates in §11 pass.
4. A Principal Engineer audit confirms zero critical or high findings.
5. All findings from audit are resolved.
6. End-to-end demonstration:
   a. Tenant admin creates a rule: "When a website lead is created → create a call follow-up in 2 hours."
   b. A website lead is created → the rule engine fires → a follow-up task appears on the lead.
   c. Tenant admin creates a rule: "When a lead becomes Hot → notify branch manager."
   d. A lead's score crosses the Hot threshold → the branch manager receives a notification with the lead's name and score.
   e. Tenant admin creates a rule: "When a demo class is logged → move to Interested."
   f. A counselor logs a demo class activity → the lead automatically moves to Interested stage.
   g. The above stage change (from action) does NOT trigger further rule evaluation (loop prevention verified).
   h. Tenant admin views the execution log and sees all 3 rule firings with correct data.
   i. Tenant admin disables a rule → it stops firing. Re-enables → it starts firing again.
7. Quota enforcement verified: tenant at limit cannot create/activate more rules.
8. Execution log cleanup command removes logs older than 90 days.
9. Zero regression in existing test suite (including all 15C-I and 15C-II tests).
10. PHPStan Level 5 passes with 0 new errors.
11. The Phase 15C-III Completion Report is signed off.

---

*End of Document — UBOTZ 2.0 Phase 15C-III Developer Instructions — March 25, 2026*
