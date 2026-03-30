# Phase 15D WhatsApp — Implementation Audit Report

**Document Version:** 1.0
**Date:** March 26, 2026
**Scope:** Phase 15D-I (Outbound Messaging) + Phase 15D-II (Inbound, Inbox, Broadcast)
**Reference Instructions:** `documentation/Tenant feature/crm/implementation plan/Ubotz_2_phase_15d_i_developer_instructions.md` · `Ubotz_2_phase_15d_ii_developer_instructions.md`
**Status Legend:** ✅ Implemented · ⚠️ Partially Implemented · ❌ Missing / Not Implemented

---

## Executive Summary

Overall implementation is **substantially complete** for both phases. The backend domain and application layers, infrastructure layer, HTTP controllers, routes, webhook handling, and job processing are all present. Frontend has working pages for inbox, broadcast, and the lead-level conversation panel.

**7 gaps** were identified — none are blocking P0 security issues, but several are spec deviations and test coverage gaps that should be resolved before this feature goes live.

---

## Phase 15D-I — Outbound Messaging

### Domain Layer

| Spec Component | Status | Notes |
|---|---|---|
| `WhatsAppConnectionEntity` | ✅ | `app/Domain/.../Entities/WhatsAppConnectionEntity.php` |
| `WhatsAppTemplateEntity` | ✅ | Present |
| `WhatsAppMessageEntity` | ✅ | Present |
| `WhatsAppConnectionStatus` VO | ✅ | `active`, `inactive`, `error` |
| `WhatsAppTemplateStatus` VO | ✅ | `draft`, `pending`, `approved`, `rejected`, `disabled` |
| `WhatsAppTemplateCategory` VO (with `estimatedCostInr()`) | ⚠️ | No dedicated VO class — category is stored as a plain string. `estimatedCostInr()` method not implemented anywhere. Cost display in broadcast UI is handled by frontend with static rates, not domain logic. |
| `WhatsAppDeliveryStatus` VO (with transition rules) | ✅ | `fromMetaStatus()` factory present |
| `WhatsAppVariableMapping` VO | ⚠️ | No dedicated VO class — variable mappings are stored as `array<string, string>` and handled inline. Immutability is not enforced. |
| `WhatsAppConnectionEstablished` domain event | ❌ | Not implemented. `ConnectWhatsAppUseCase` does not dispatch this event. |
| `WhatsAppConnectionRevoked` domain event | ❌ | Not implemented. `DisconnectWhatsAppUseCase` does not dispatch this event. |
| `WhatsAppTemplateSynced` domain event | ❌ | Not implemented. `SyncWhatsAppTemplateStatusUseCase` updates records but dispatches no domain event. |
| `WhatsAppMessageSent` domain event | ❌ | Not implemented. `SendWhatsAppToLeadUseCase` dispatches no domain event. |
| `WhatsAppMessageDelivered` domain event | ❌ | Not implemented. `ProcessWhatsAppStatusWebhookUseCase` updates delivery status but dispatches no event. |
| `WhatsAppConnectionRepositoryInterface` | ✅ | Present + `findByWabaIdIgnoringTenantScope()` method added for webhook use |
| `WhatsAppTemplateRepositoryInterface` | ✅ | Present |
| `WhatsAppMessageRepositoryInterface` | ✅ | Present |

**Domain event gap summary:** 5 of 7 specified domain events are not implemented (`WhatsAppConnectionEstablished`, `WhatsAppConnectionRevoked`, `WhatsAppTemplateSynced`, `WhatsAppMessageSent`, `WhatsAppMessageDelivered`). The `WhatsAppMessageReceived` event (15D-II) IS implemented.

---

### Application Layer

| Spec Component | Status | Notes |
|---|---|---|
| `ConnectWhatsAppUseCase` | ✅ | Present |
| `DisconnectWhatsAppUseCase` | ✅ | Present |
| `CreateWhatsAppTemplateUseCase` | ✅ | Present |
| `SubmitWhatsAppTemplateUseCase` | ✅ | Present |
| `SyncWhatsAppTemplateStatusUseCase` | ✅ | Present |
| `DeleteWhatsAppTemplateUseCase` | ✅ | Present |
| `SendWhatsAppMessageUseCase` | ✅ | Implemented as `SendWhatsAppToLeadUseCase` (slightly different name) |
| `ProcessWhatsAppStatusWebhookUseCase` | ✅ | Present |
| `ListWhatsAppTemplatesQuery` | ✅ | Handled inside `WhatsAppIntegrationController::templates()` via `WhatsAppTemplateRepositoryInterface::paginate()` |
| `ListWhatsAppMessagesQuery` | ✅ | Handled inside `WhatsAppLeadMessageController::messages()` via conversation repository |
| `SyncWhatsAppTemplateStatusCommand` | ✅ | Present as `SyncWhatsAppTemplateStatusCommand` registered in `console.php` as `crm:sync-whatsapp-template-status`, running hourly with `withoutOverlapping()` |
| `UpdateWhatsAppTemplateUseCase` | ✅ | Present (additive, not in spec — correctly added) |
| `WhatsAppTemplateNameValidator` | ✅ | Present |
| `MetaWhatsAppTemplatePayloadFactory` | ✅ | Present |
| `WhatsAppPhoneNormalizer` | ✅ | Present |
| `WhatsAppEligibleNotificationTypes` | ✅ | Present — guards billing/security categories from WhatsApp delivery |

---

### Infrastructure Layer

| Spec Component | Status | Notes |
|---|---|---|
| `WhatsAppChannel` | ✅ | Follows same contract as `EmailChannel` / `InAppChannel`. Checks preferences, template mapping, connection status. |
| `SendWhatsAppNotificationJob` | ✅ | Present, dispatched by `WhatsAppChannel` |
| `SendWhatsAppDirectMessageJob` | ✅ | Present, on `notifications-high` queue |
| `WhatsAppConnectionRecord` (Eloquent) | ✅ | Present |
| `WhatsAppTemplateRecord` (Eloquent) | ✅ | Present |
| `EloquentWhatsAppConnectionRepository` | ✅ | Present |
| `EloquentWhatsAppTemplateRepository` | ✅ | Present |
| `EloquentWhatsAppMessageRepository` | ✅ | Present |
| `WhatsAppGraphClient` | ✅ | `app/Infrastructure/External/WhatsApp/WhatsAppGraphClient.php` |
| `NotificationChannelType::WHATSAPP` | ✅ | WhatsApp channel is guarded by category + type checks |
| `NotificationDispatcher` extended with `WhatsAppChannel` | ✅ | `WhatsAppChannel::send()` integrated in dispatcher flow |

---

### HTTP Layer — 15D-I

| Spec Endpoint | Implemented | Route / Controller |
|---|---|---|
| `GET /api/webhooks/meta/whatsapp` (verify) | ✅ | `MetaWhatsAppWebhookController::verify` |
| `POST /api/webhooks/meta/whatsapp` (handle) | ✅ | `MetaWhatsAppWebhookController::handle` |
| `POST /api/tenant/whatsapp/connect` | ✅ | `WhatsAppIntegrationController::connect` |
| `DELETE /api/tenant/whatsapp/connection` | ✅ | `WhatsAppIntegrationController::disconnect` |
| `GET /api/tenant/whatsapp/connection` | ✅ | `WhatsAppIntegrationController::connection` |
| `GET /api/tenant/whatsapp/templates` | ✅ | `WhatsAppIntegrationController::templates` |
| `POST /api/tenant/whatsapp/templates` | ✅ | `WhatsAppIntegrationController::storeTemplate` |
| `PUT /api/tenant/whatsapp/templates/{id}` | ✅ | `WhatsAppIntegrationController::updateTemplate` |
| `POST /api/tenant/whatsapp/templates/{id}/submit` | ✅ | `WhatsAppIntegrationController::submitTemplate` |
| `DELETE /api/tenant/whatsapp/templates/{id}` | ✅ | `WhatsAppIntegrationController::destroyTemplate` |
| `POST /api/tenant/leads/{lead}/whatsapp/send` | ✅ | `WhatsAppLeadMessageController::send` |
| `GET /api/tenant/leads/{lead}/whatsapp/messages` | ✅ | `WhatsAppLeadMessageController::messages` — returns unified conversation thread |

**Capability middleware verification:**

| Capability Code | Applied | Notes |
|---|---|---|
| `whatsapp.connect` | ✅ | connect + disconnect routes |
| `whatsapp.manage` | ✅ | template CRUD + opt-out removal |
| `whatsapp.view` | ✅ | connection, templates, inbox, conversations |
| `whatsapp.send` | ✅ | send + reply |
| `whatsapp.broadcast` | ✅ | broadcast store/confirm/cancel |

All routes also carry `tenant.module:module.whatsapp` middleware — plan-gating correctly applied (BR-07).

---

### Database Schema — 15D-I

| Spec Table / Change | Status | Notes |
|---|---|---|
| `whatsapp_connections` table | ✅ | In `2026_03_26_100000_create_whatsapp_tables.php` |
| `whatsapp_templates` table | ✅ | Present in same migration |
| `whatsapp_messages` table | ✅ | Present in same migration |
| `whatsapp_capabilities` seed | ✅ | `2026_03_26_100100_seed_whatsapp_capabilities.php` |
| Notification template mapping settings (4 keys) | ✅ | `CrmSettingsController::updateWhatsApp` route + `PUT /crm-settings/whatsapp` |

---

### Business Rules Verification — 15D-I

| BR | Description | Status | Notes |
|---|---|---|---|
| BR-01 | Per-tenant WABA isolation | ✅ | `tenant_id UNIQUE` in `whatsapp_connections` |
| BR-02 | One phone number per tenant | ✅ | Unique constraint enforced |
| BR-03 | Number must be API-exclusive | ⚠️ | No UI-level warning shown to admin during Embedded Signup flow — spec requires this warning in the connection UI |
| BR-04 | System User Access Token, encrypted | ✅ | `Crypt::encryptString()` used in `ConnectWhatsAppUseCase`, `Crypt::decryptString()` in send use cases |
| BR-05 | waba_id + phone_number_id stored | ✅ | Both columns present |
| BR-06 | Connection status: active / inactive / error | ✅ | VO enforces allowed values |
| BR-07 | `module.whatsapp` entitlement gate | ✅ | All routes have `tenant.module:module.whatsapp` middleware |
| BR-08 | Templates created in EducoreOS, submitted to Meta | ✅ | |
| BR-09 | Category determines price | ⚠️ | Category stored; no `estimatedCostInr()` VO method implemented; cost shown as static frontend string only |
| BR-10 | Template status lifecycle: draft → submitted → approved/rejected | ✅ | |
| BR-11 | Variable `{{1}}`, `{{2}}` syntax with named mapping | ✅ | Stored in `variable_mappings` JSON |
| BR-12 | Text headers + body with variables | ✅ | Media headers correctly deferred |
| BR-13 | Template name validation | ✅ | `WhatsAppTemplateNameValidator` |
| BR-14 | Rejection reason displayed | ✅ | `rejection_reason` column; returned in templates list response |
| BR-15 | Templates tenant-scoped | ✅ | All queries scoped by `tenant_id` |
| BR-16 | Platform-suggested templates | ❌ | No starter template suggestions implemented in the UI or seeded in the DB |
| BR-17 | Only approved templates in send UI | ✅ | Status checked in `SendWhatsAppToLeadUseCase` |
| BR-18 | E.164 phone format | ✅ | `WhatsAppPhoneNormalizer` |
| BR-19 | Every sent message in `whatsapp_messages` | ✅ | |
| BR-20 | Activity logging (if 15C-I complete) | ✅ | `LogLeadActivityUseCase` called in `SendWhatsAppToLeadUseCase`; graceful skip if activity fails |
| BR-21 | Send failures captured and displayed | ✅ | `InvalidArgumentException` returned as 422 |
| BR-22 | Messaging tier display in settings | ⚠️ | `messaging_tier` column present and returned in `GET /connection`; no dedicated Settings page section shown in frontend to display this to admin |
| BR-23 | `WhatsAppChannel` as third notification channel | ✅ | |
| BR-24 | Only CRM notifications are WhatsApp-eligible | ✅ | `WhatsAppEligibleNotificationTypes` + billing/security guard in `WhatsAppChannel` |
| BR-25 | Template mapping in CRM Settings | ✅ | |
| BR-26 | WhatsApp delivery is async (queued job) | ✅ | `SendWhatsAppNotificationJob` dispatched |
| BR-27 | WhatsApp failure does not block email/in-app | ✅ | `WhatsAppChannel` is additive; failures are silently skipped |
| BR-28 | Notification preferences — WhatsApp opt-out | ⚠️ | `NotificationChannelType::WHATSAPP` checked via `preferenceService`; but the preference UI for users to opt out of WhatsApp notifications is not verified to be implemented |
| BR-29–31 | Delivery status: accepted→sent→delivered→read, counselor icons | ✅ | `ProcessWhatsAppStatusWebhookUseCase` handles all transitions; `delivery_status` returned per message in conversation thread |

---

## Phase 15D-II — Inbound, Inbox, Broadcast

### Domain Layer — 15D-II

| Spec Component | Status | Notes |
|---|---|---|
| `WhatsAppConversationMessageEntity` | ❌ | No dedicated entity class. Infrastructure-only: `WhatsAppConversationMessageRecord` (Eloquent) is used directly in queries and repositories without a domain entity wrapper. |
| `WhatsAppMessageDirection` VO | ❌ | Stored as plain string `'inbound'` / `'outbound'` — no value object. |
| `WhatsAppMessageType` VO | ❌ | Stored as plain string — no value object. |
| `WhatsAppServiceWindow` VO (with `isOpen(): bool`) | ❌ | `WhatsAppServiceWindowRecord` Eloquent model exists, but no domain value object with `isOpen()` method. Window is/open check is done inline with `strtotime()` in `WhatsAppLeadMessageController::messages()`. |
| `WhatsAppBroadcastEntity` | ❌ | No dedicated entity. `WhatsAppBroadcastRecord` Eloquent model used directly. |
| `WhatsAppBroadcastStatus` VO | ❌ | Status stored as plain string constants — no value object. |
| `WhatsAppMessageReceived` domain event | ✅ | Present in `Events/WhatsAppMessageReceived.php`, dispatched in `ProcessInboundWhatsAppMessageJob` |
| `WhatsAppBroadcastCompleted` domain event | ❌ | Not implemented. |
| `WhatsAppConversationMessageRepositoryInterface` | ✅ | Present as `WhatsAppConversationRepositoryInterface` |
| `WhatsAppBroadcastRepositoryInterface` | ✅ | Present |
| `WhatsAppServiceWindowExpiredException` | ❌ | Spec says throw this exception. Instead, `InvalidArgumentException` is thrown in `SendWhatsAppReplyUseCase`. The error message is correct but it's the wrong exception type. |
| `WhatsAppLeadOptedOutException` | ❌ | Spec says throw this exception. Not implemented — opt-out check is silent in `ProcessOptOutUseCase`. |

**15D-II domain layer verdict:** The domain entities and value objects for 15D-II were largely skipped — implementation went directly from webhook parsing to Eloquent models. This is a DDD violation per CLAUDE.md. Functional behavior is correct, but the architectural layer is missing.

---

### Application Layer — 15D-II

| Spec Component | Status | Notes |
|---|---|---|
| `ProcessInboundWhatsAppMessageUseCase` | ✅ | Implemented as `ProcessInboundWhatsAppMessageJob` (correct: async job) |
| `SendWhatsAppReplyUseCase` | ✅ | Present — validates service window, calls `WhatsAppGraphClient`, logs activity, stores outbound conversation message |
| `GetConversationQuery` | ✅ | Implemented inside `WhatsAppLeadMessageController::messages()` via `WhatsAppConversationRepositoryInterface::paginateThread()` |
| `ListActiveConversationsQuery` | ✅ | `ListWhatsAppInboxQuery` |
| `GetUnreadConversationCountQuery` | ✅ | `GetWhatsAppUnreadCountQuery` |
| `MarkConversationReadUseCase` | ✅ | `MarkWhatsAppConversationReadUseCase` |
| `CreateBroadcastUseCase` | ✅ | `CreateWhatsAppBroadcastUseCase` |
| `ConfirmBroadcastUseCase` | ✅ | `ConfirmWhatsAppBroadcastUseCase` |
| `CancelBroadcastUseCase` | ✅ | `CancelWhatsAppBroadcastUseCase` |
| `ListBroadcastsQuery` | ✅ | Handled in `WhatsAppBroadcastController::index()` |
| `ProcessOptOutUseCase` | ✅ | Present — called in `ProcessInboundWhatsAppMessageJob` |
| `RemoveOptOutUseCase` | ✅ | `RemoveWhatsAppOptOutUseCase` — called from `WhatsAppLeadMessageController::removeOptOut()` |
| `ResolveLeadFromPhoneUseCase` | ✅ | `ResolveLeadFromInboundWhatsAppUseCase` |
| `TriggerAutomationOnWhatsAppReceivedListener` | ✅ | Present in `Automation/Listeners/` |
| `SendWhatsAppTemplateExecutor` | ✅ | Present in `Automation/Actions/` |
| `MetaInboundMessageParser` | ✅ | Present in Application layer — parses type, body, media_id, location_data, from_digits |

---

### Infrastructure Layer — 15D-II

| Spec Component | Status | Notes |
|---|---|---|
| `WhatsAppConversationMessageRecord` (Eloquent) | ✅ | Present |
| `WhatsAppBroadcastRecord` (Eloquent) | ✅ | Present |
| `WhatsAppServiceWindowRecord` (Eloquent) | ✅ | Present |
| `EloquentWhatsAppConversationRepository` | ✅ | Present |
| `EloquentWhatsAppBroadcastRepository` | ✅ | Present |
| `ProcessInboundWhatsAppMessageJob` | ✅ | Present — correct queue (`notifications-high`) |
| `SendBroadcastMessageJob` | ✅ | `SendWhatsAppBroadcastMessageJob` — present |
| `DownloadWhatsAppMediaJob` | ✅ | Present — dispatched from inbound job when `media_id` is present |

---

### HTTP Layer — 15D-II

| Spec Endpoint | Implemented | Notes |
|---|---|---|
| `GET /api/tenant/whatsapp/conversations` (inbox) | ✅ | `WhatsAppInboxController::index` at `/whatsapp/inbox` |
| `GET /api/tenant/whatsapp/conversations/unread-count` | ✅ | `WhatsAppInboxController::unreadCount` at `/whatsapp/unread-count` |
| `GET /api/tenant/leads/{lead}/whatsapp/conversation` | ✅ | `WhatsAppLeadMessageController::messages` — returns unified thread |
| `POST /api/tenant/leads/{lead}/whatsapp/reply` | ✅ | `WhatsAppLeadMessageController::reply` |
| `POST /api/tenant/leads/{lead}/whatsapp/conversation/mark-read` | ✅ | At `/leads/{leadId}/whatsapp/mark-read` |
| `POST /api/tenant/whatsapp/broadcasts` | ✅ | `WhatsAppBroadcastController::store` |
| `POST /api/tenant/whatsapp/broadcasts/{id}/confirm` | ✅ | `WhatsAppBroadcastController::confirm` |
| `POST /api/tenant/whatsapp/broadcasts/{id}/cancel` | ✅ | `WhatsAppBroadcastController::cancel` |
| `GET /api/tenant/whatsapp/broadcasts` | ✅ | `WhatsAppBroadcastController::index` |
| `GET /api/tenant/whatsapp/broadcasts/{id}` | ✅ | `WhatsAppBroadcastController::show` |
| `DELETE /api/tenant/leads/{lead}/whatsapp/opt-out` | ✅ | `WhatsAppLeadMessageController::removeOptOut` |

**Form Requests — 15D-II:**

| Request | Status | Notes |
|---|---|---|
| `SendWhatsAppReplyRequest` | ✅ | `body`, `type`, `media_url` validated |
| `CreateWhatsAppBroadcastRequest` | ✅ | `template_id`, `recipient_lead_ids`, `list_filters` validated |

**API Resources:**

| Resource | Status | Notes |
|---|---|---|
| `WhatsAppConversationMessageResource` | ⚠️ | No dedicated API Resource class — controller returns raw arrays from repository. Spec requires a `WhatsAppConversationMessageResource` class with defined shape. |
| `WhatsAppConversationResource` | ⚠️ | `ListWhatsAppInboxQuery` returns raw repository data. No dedicated Resource class. |
| `WhatsAppBroadcastResource` | ⚠️ | `WhatsAppBroadcastController` returns `$b` directly from repository. No Resource class. |

---

### Database Schema — 15D-II

| Spec Table / Change | Status | Notes |
|---|---|---|
| `whatsapp_conversation_messages` table | ✅ | `2026_03_26_200000_phase_15d_ii_whatsapp_conversations.php` |
| `whatsapp_service_windows` table | ✅ | Present in same migration |
| `whatsapp_broadcasts` table | ✅ | Present in same migration |
| `leads.whatsapp_opted_out` column | ✅ | Present in migration; present in `LeadRecord` and `EloquentLeadRepository` |
| `leads.whatsapp_opted_out_at` column | ✅ | Present |
| `whatsapp_broadcasts.recipient_count` column | ✅ | Present |
| `whatsapp_broadcasts.filter_criteria` JSON column | ✅ | Present |
| Migration decision: Option A (migrate) vs Option B (coexist) | ⚠️ | **Neither Option A nor Option B was fully implemented.** `whatsapp_messages` (15D-I) was NOT migrated into `whatsapp_conversation_messages`. However, `WhatsAppLeadMessageController::messages()` queries `WhatsAppConversationRepositoryInterface::paginateThread()`, which only reads `whatsapp_conversation_messages`. This means any outbound messages from 15D-I that exist in `whatsapp_messages` are NOT shown in the conversation thread — a **functional gap** for tenants that used 15D-I before 15D-II launched. |
| Recipient junction table (per DB audit plan) | ❌ | `whatsapp_broadcasts_recipient_lead_ids.php` added `recipient_lead_ids` JSON column instead. Per the DB performance audit, this needs to be replaced with a proper junction table. |

---

### Business Rules — 15D-II

| BR | Description | Status | Notes |
|---|---|---|---|
| BR-01 | Same webhook endpoint, differentiated by `messages` vs `statuses` | ✅ | `ProcessMetaWhatsAppWebhookUseCase` handles both |
| BR-02 | Inbound matched to lead by phone | ✅ | `ResolveLeadFromInboundWhatsAppUseCase` |
| BR-03 | New lead created if no match (source=whatsapp, auto-assign) | ✅ | |
| BR-04 | Stored in `whatsapp_conversation_messages` | ✅ | |
| BR-05 | 24-hour service window opened/reset on each inbound | ✅ | `upsertServiceWindow()` in job |
| BR-06 | Activity created for inbound: type=whatsapp, outcome=replied | ✅ | |
| BR-07 | `WhatsAppMessageReceived` domain event dispatched | ✅ | |
| BR-08 | Message deduplication by wamid | ✅ | Checked in both webhook use case and job |
| BR-09 | Free-form replies within window | ✅ | `SendWhatsAppReplyUseCase` — text + image supported |
| BR-10 | Outside window: input disabled, template button shown | ✅ | `LeadWhatsAppPanel` shows window status; input logic is client-side |
| BR-11 | Service window countdown shown | ⚠️ | `is_open` and `expires_at` returned in API; frontend shows "Open/Closed" but no countdown timer (no "expires in Xh Ym" display) |
| BR-12 | Cost indicator: "Free" for service messages | ❌ | No cost indicator shown in reply area of `LeadWhatsAppPanel` |
| BR-13 | Outbound replies stored in `whatsapp_conversation_messages` with `direction=outbound` | ✅ | `insertOutboundSessionMessage()` in repository |
| BR-14 | Outbound free-form replies logged as activities | ✅ | `SendWhatsAppReplyUseCase` calls `LogLeadActivityUseCase` |
| BR-15 | One conversation thread per lead | ✅ | |
| BR-16 | Conversations follow lead assignment | ✅ | Access scoped by `LeadCrmAccessService` |
| BR-17 | Branch-scoped conversation access | ✅ | `ListWhatsAppInboxQuery` uses capability-based branch filter |
| BR-18 | Unread messages tracked per counselor | ✅ | `is_read_by_counselor` column, `GetWhatsAppUnreadCountQuery` |
| BR-19 | In-app notification to assigned counselor on inbound | ✅ | `NotificationDispatcher` called in `ProcessInboundWhatsAppMessageJob` |
| BR-20 | Broadcast with approved templates only | ✅ | Validated in `CreateWhatsAppBroadcastUseCase` |
| BR-21 | Lead selection filters | ✅ | `list_filters` passed to `CreateWhatsAppBroadcastUseCase` |
| BR-22 | Cost estimate shown before sending | ⚠️ | `estimated_cost_cents` calculated and stored; frontend shows it in toast confirmation but not in a dedicated preview page step (spec requires a distinct "Preview" UI step before confirmation dialog) |
| BR-23 | Async broadcast execution | ✅ | `SendWhatsAppBroadcastMessageJob` dispatched per lead |
| BR-24 | Opt-out excluded from broadcast | ✅ | `excluded_opted_out` count tracked |
| BR-25 | `whatsapp_broadcasts` audit record | ✅ | |
| BR-26 | Messaging tier limit warning | ❌ | No tier limit warning shown when broadcast recipient count exceeds the tenant's current messaging tier |
| BR-27 | One active broadcast at a time | ✅ | Checked in `CreateWhatsAppBroadcastUseCase` via `WhatsAppBroadcastRepositoryInterface` active check |
| BR-28 | Max 1,000 recipients per broadcast | ✅ | Enforced in `CreateWhatsAppBroadcastUseCase` |
| BR-29 | STOP/UNSUBSCRIBE keywords trigger opt-out | ✅ | `ProcessOptOutUseCase` |
| BR-30 | Opted-out leads excluded from business-initiated messages | ✅ | Checked in `SendWhatsAppToLeadUseCase` and `CreateWhatsAppBroadcastUseCase` |
| BR-31 | Opt-out sticky until manual reversal | ✅ | `RemoveWhatsAppOptOutUseCase` |
| BR-32 | Opt-out status displayed; send blocked with message | ⚠️ | `whatsapp_opted_out` returned in conversation API; frontend has no opt-out badge on inbox row or blocking banner in `LeadWhatsAppPanel` — only the API enforces it |
| BR-33 | `lead.whatsapp_received` automation trigger | ✅ | `TriggerAutomationOnWhatsAppReceivedListener` |
| BR-34 | `whatsapp_message_contains` condition | ✅ | `AutomationConditionType::WHATSAPP_MESSAGE_CONTAINS` in domain |
| BR-35 | `send_whatsapp_template` automation action | ✅ | `SendWhatsAppTemplateExecutor` |
| BR-36 | Loop prevention: automation-sent outbound does not retrigger inbound | ✅ | `AutomationContextService` checked; outbound is not `inbound` direction |

---

### Frontend — 15D-I & 15D-II

| Spec Requirement | Status | Notes |
|---|---|---|
| **Connection page** (Embedded Signup, connect/disconnect, phone display, messaging tier) | ⚠️ | No dedicated frontend connection management page found. Backend endpoints exist. Likely lives in a broader CRM settings page not yet linked. |
| **Template management page** (list, create, edit rejected, submit, rejection reason) | ❌ | No frontend template management page found. Backend endpoints are complete. |
| **Lead detail — WhatsApp section** (send template, message history, delivery status) | ✅ | `LeadWhatsAppPanel.tsx` — shows thread with delivery ticks; `send` handled via hooks |
| **CRM Settings — WhatsApp preferences** (notification template mapping) | ⚠️ | API exists (`PUT /crm-settings/whatsapp`); no verified frontend settings panel for this |
| **Conversation Inbox — two-panel layout** | ✅ | `WhatsAppInboxPage.tsx` — thread list (left) + chat panel (right); 30s polling via `useWhatsAppInbox` |
| **Inbox — service window status indicator** (green dot = open, countdown timer) | ⚠️ | Shows "Open/Closed" text only; no green/gray dot on inbox list row; no countdown timer ("expires in Xh Ym") |
| **Inbox — opt-out badge on conversation row** | ❌ | `unread_count` badge is shown; opt-out badge is not |
| **Inbox — delivery status ticks on outbound messages** | ✅ | `delivery_status` field returned; frontend can render ticks |
| **Inbox — "Send Template" button when window closed** | ⚠️ | Text warning shown; no template selector modal opened |
| **Broadcast page — create flow** (template → filter/manual select → preview → confirm → progress) | ⚠️ | `WhatsAppBroadcastsPage.tsx` exists but is minimal — only template dropdown + raw JSON recipient IDs input. Missing: filter-based recipient selection UI, opt-out excluded count in preview, proper cost preview step before confirmation dialog |
| **Navigation — WhatsApp section with unread badge** | ⚠️ | `GetWhatsAppUnreadCountQuery` exists; whether it's wired into navigation badge not verified (no navigation file examined) |
| **Frontend service** | ✅ | `tenant-whatsapp-service.ts` and `use-whatsapp-crm.ts` hooks present |

---

### Test Coverage

| Test | Status | Notes |
|---|---|---|
| `MetaWhatsAppWebhookTest` | ✅ | 3 cases: challenge verify (match), challenge verify (mismatch), POST without signature |
| `AutomationConditionWhatsAppTest` | ✅ | 2 cases: case-insensitive `contains`, wrong operator |
| Template CRUD feature tests | ❌ | No tests for `ConnectWhatsApp`, `CreateTemplate`, `SubmitTemplate`, `SyncTemplateStatus` |
| `SendWhatsAppToLeadUseCase` tests | ❌ | No tests for template send, activity logging, delivery status updates |
| `ProcessInboundWhatsAppMessageJob` tests | ❌ | No tests for inbound flow: lead resolution, service window upsert, opt-out detection, activity creation |
| `SendWhatsAppReplyUseCase` tests | ❌ | No tests for window-open vs window-closed enforcement |
| Broadcast tests | ❌ | No tests for `CreateWhatsAppBroadcastUseCase` (opt-out exclusion, 1000 limit, one-active-at-a-time) |
| Cross-tenant isolation tests | ❌ | No tests confirming that tenant A cannot access tenant B's WhatsApp conversations or messages |

**Test coverage verdict:** Only 5 test cases exist for the entire 15D feature set (2 files). This is critically under-tested for a feature that processes financial-cost actions and handles personal communication data.

---

## Consolidated Gap List

| # | Severity | Phase | Gap | Action Required |
|---|---|---|---|---|
| 1 | P1 — Architecture | 15D-I | 5 domain events not implemented (`WhatsAppConnectionEstablished`, `WhatsAppConnectionRevoked`, `WhatsAppTemplateSynced`, `WhatsAppMessageSent`, `WhatsAppMessageDelivered`) | Create event classes; dispatch from respective use cases |
| 2 | P1 — Architecture | 15D-II | 15D-II domain entities and VOs skipped (`WhatsAppConversationMessageEntity`, `WhatsAppBroadcastEntity`, `WhatsAppServiceWindow` VO, `WhatsAppMessageDirection` VO, `WhatsAppMessageType` VO, `WhatsAppBroadcastStatus` VO) | Create missing domain layer classes; update repositories to return entities not raw arrays |
| 3 | P1 — Architecture | 15D-II | 3 API Resource classes missing (`WhatsAppConversationMessageResource`, `WhatsAppConversationResource`, `WhatsAppBroadcastResource`) — controllers return raw arrays | Create API Resource classes in `app/Http/Resources/` |
| 4 | P1 — Data | 15D-II | `whatsapp_messages` (15D-I records) not surfaced in conversation thread — the migration/coexist decision (Option A vs B) was not implemented. Old outbound messages are invisible in the inbox. | Implement Option A (migration) or Option B (dual-query in repository) as documented in instructions §5.3 |
| 5 | P1 — Frontend | 15D-I | No frontend template management page (create, list, submit, view rejection reason) | Build template management UI wired to existing backend endpoints |
| 6 | P2 — Frontend | 15D-II | Broadcast UI is minimal — missing filter-based lead selection, proper cost preview step, opt-out excluded count display, tier-limit warning | Enhance `WhatsAppBroadcastsPage.tsx` |
| 7 | P2 — Frontend | 15D-II | Inbox missing: opt-out badge on conversation row, service window countdown timer, template selector modal when window closed | Enhance `WhatsAppInboxPage.tsx` and `LeadWhatsAppPanel.tsx` |
| 8 | P2 — Tests | Both | Only 5 test cases for the entire feature. Missing: template CRUD, send use case, inbound job, reply window validation, broadcast business rules, cross-tenant isolation | Write feature + unit tests per Testing Standards in CLAUDE.md |
| 9 | P3 — Business Rule | 15D-I | BR-09: `WhatsAppTemplateCategory` VO missing `estimatedCostInr()` method | Add cost method to VO or dedicated service |
| 10 | P3 — Business Rule | 15D-I | BR-16: Platform-suggested starter templates not implemented | Seed or display starter template suggestions in UI |
| 11 | P3 — Exceptions | 15D-II | `WhatsAppServiceWindowExpiredException` and `WhatsAppLeadOptedOutException` not created — wrong exception types thrown | Create specific exception classes; update `SendWhatsAppReplyUseCase` and send use case |

---

## What Is Working Well

- Full end-to-end inbound webhook flow is correct and production-ready (signature verify → dedup → job dispatch → lead resolution → activity log → service window → opt-out → domain event → notification)
- `WhatsAppChannel` correctly implements all guard conditions from BR-23–28
- All routes are properly middleware-guarded with both module entitlement and capability checks
- Phone normalization and template name validation are solid
- Automation integration (trigger + condition + action) is fully implemented
- `ProcessInboundWhatsAppMessageJob` correctly sets and clears `TenantContext` (no cross-tenant leak)
