# UBOTZ 2.0 — Phase 15D-II Developer Instructions

## WhatsApp Business API — Inbound Messaging, Conversation Inbox & Broadcast

| Field | Value |
|---|---|
| **Document Type** | Developer Instruction (Pre-Implementation Brief) |
| **Phase** | 15D-II (of 15D-I / 15D-II) |
| **Date** | March 26, 2026 |
| **Issued By** | Principal Engineer / Architecture Auditor |
| **Audience** | Implementation Developer (Antigravity) |
| **Expected Deliverable** | Phase 15D-II Implementation Plan |
| **Prerequisites** | Phase 15D-I COMPLETE (WABA connection, template management, outbound messaging, WhatsApp notification channel, delivery status webhooks), Phase 15C-I COMPLETE (structured activities), Phase 15C-III COMPLETE or IN PROGRESS (automation rule engine — for WhatsApp trigger addition) |

> **Phase 15D-I built the outbound pipe — EducoreOS can send template messages to leads. Phase 15D-II completes the circle: receiving inbound messages from leads, enabling free-form replies within the 24-hour service window, presenting conversations in a chat-like inbox, supporting bulk broadcast campaigns, and adding WhatsApp as an automation trigger. This turns WhatsApp from a notification channel into a full conversation channel for admissions teams.**

---

## 1. Mission Statement

Phase 15D-II extends the WhatsApp integration from outbound-only to **full two-way messaging** with three capabilities:

1. **Inbound Message Reception** — When a lead sends a WhatsApp message to the institution's number, EducoreOS receives it via webhook, resolves the lead, and stores the message. This opens Meta's 24-hour service window, enabling free-form replies without templates.

2. **Conversation Inbox** — A chat-like UI where counselors can view threaded WhatsApp conversations per lead, see inbound messages alongside outbound template sends, and reply with free-form text within the 24-hour window.

3. **Bulk Broadcast** — Tenant admins can send an approved template message to a filtered set of leads in a single action, with queue management, rate limiting, cost estimation, and opt-out tracking.

Additionally, this phase extends the Phase 15C-III automation rule engine with a new trigger (`lead.whatsapp_received`) so tenants can automate actions when a lead messages them on WhatsApp.

**What this phase includes:**
- Inbound message webhook processing (receive text, image, document, audio, video, contacts, location messages from leads)
- 24-hour service window tracking per lead (window opens on inbound message, resets on each new inbound)
- Free-form reply capability within the service window (text + media)
- Conversation inbox UI (per-lead chat view, counselor inbox with all active conversations)
- Unread message count and real-time polling for new messages
- Lead resolution from inbound phone number (match to existing lead or create new lead)
- Bulk broadcast: select template → filter/select leads → preview cost estimate → send → track delivery
- Opt-out tracking: leads who reply "STOP" are marked opted-out, no further business-initiated messages
- New automation trigger: `lead.whatsapp_received` added to 15C-III catalog
- New automation condition: `whatsapp_message_contains` (keyword matching on inbound message body)
- New automation action: `send_whatsapp_template` added to 15C-III action catalog
- Inbound message activity auto-logging as `whatsapp` activity with outcome `replied`
- Media message storage (images, documents sent by leads are downloaded and stored via File Manager)

**What this phase does NOT include:**
- WhatsApp Flows (in-chat forms, surveys — future)
- WhatsApp Calling API (voice/video calls — future)
- Chatbot / automated reply sequences (future — requires a conversation flow engine)
- WhatsApp catalog / product messaging (e-commerce feature — not relevant to CRM)
- Group messaging (WhatsApp API does not support business-to-group messaging)
- Message scheduling (send at a future time — future enhancement)
- Conversation assignment to specific counselors (conversations follow lead assignment from 15A)
- WhatsApp status/story posting

---

## 2. Business Context

### 2.1 Current State

After Phase 15D-I, the system can send template messages to leads and track delivery status. But it's one-directional — EducoreOS talks, leads cannot reply back through the platform. If a lead replies on WhatsApp, the counselor sees it on their personal phone, not in the CRM. There's no way to:
- See what leads are saying in response to outbound messages
- Reply to leads from within EducoreOS
- Track the full WhatsApp conversation history per lead
- Send a single template message to hundreds of leads at once
- Automatically react when a lead messages the institution

### 2.2 What Changes

After Phase 15D-II:
1. When a lead sends a WhatsApp message to the institution's connected number, the message appears in EducoreOS — both in the **conversation inbox** and on the **lead's activity feed**.
2. The counselor can **reply with free-form text** directly from the inbox within Meta's 24-hour service window. Outside the window, only template messages are available.
3. The conversation inbox shows a **threaded chat view** — inbound and outbound messages in chronological order, like a real WhatsApp conversation.
4. Counselors see an **unread conversations count** in the CRM navigation — they know immediately when a lead has messaged.
5. Tenant admins can run a **bulk broadcast** — select an approved template, filter leads by stage/temperature/source/branch, see a cost estimate, and send to hundreds of leads at once.
6. If Phase 15C-III is complete, the `lead.whatsapp_received` trigger enables automation rules like "when a lead messages us → create a follow-up task" or "when a lead messages with keyword 'admission' → notify branch manager."

### 2.3 The 24-Hour Service Window

Meta's pricing and messaging rules revolve around the **24-hour service window**:

- When a lead sends a message to the institution, a 24-hour window opens.
- Within this window, the institution can reply with **free-form messages** (text, media) at **no per-message cost** (service messages are free).
- **Utility templates** sent within this window are also **free**.
- **Marketing and authentication templates** are still charged even within the window.
- Once the window closes (24 hours since the lead's last inbound message), only template messages can be sent (at standard per-message rates).
- Each new inbound message from the lead **resets** the 24-hour timer.

This window is critical for the conversation inbox UX — the counselor must know whether the window is open (free-form replies allowed) or closed (template-only).

---

## 3. Business Rules (NON-NEGOTIABLE)

### 3.1 Inbound Message Rules

| Rule ID | Rule | Detail |
|---|---|---|
| BR-01 | Inbound WhatsApp messages are received via the same webhook endpoint as 15D-I delivery status updates. The webhook payload differentiates: `statuses` array = delivery updates, `messages` array = inbound messages. | Single webhook, multiple event types. |
| BR-02 | Inbound messages are matched to a lead by phone number: look up `leads.phone` WHERE phone matches the sender's `wa_id` (WhatsApp ID = phone number without +). | If multiple leads have the same phone (across tenants), the tenant is resolved first from the WABA ID, then the lead is matched within that tenant. |
| BR-03 | If no lead exists with the sender's phone number, a **new lead is automatically created** with source = `whatsapp`, stage = `new_enquiry`, and the phone number as the primary contact. The lead is auto-assigned via the existing `LeadAutoAssignService`. | This captures walk-in WhatsApp enquiries — leads who message the institution without going through any form. |
| BR-04 | Inbound messages are stored in a `whatsapp_conversations` table (see §6) with the full message content, message type (text, image, document, audio, video, location, contacts), and media URLs. | Messages are the conversation record. |
| BR-05 | Each inbound message opens or resets the **24-hour service window** for that lead. The window expiry is calculated as `inbound_message_timestamp + 24 hours` and stored on the conversation record. | The counselor inbox displays a countdown timer showing when the window expires. |
| BR-06 | Every inbound message creates a `whatsapp` activity on the lead via `LogLeadActivityUseCase` with outcome = `replied`. | This feeds into lead scoring (15C-II: engagement signal increases) and automation rules. |
| BR-07 | Inbound messages dispatch a `WhatsAppMessageReceived` domain event carrying `lead_id`, `message_body`, `message_type`, `sender_phone`. | Consumed by the automation rule engine (15C-III) and by the unread count updater. |
| BR-08 | Message deduplication: each inbound message has a unique `meta_message_id` (wamid). Duplicate webhook deliveries for the same wamid are ignored. | Prevents duplicate messages from Meta retries. |

### 3.2 Reply & Service Window Rules

| Rule ID | Rule | Detail |
|---|---|---|
| BR-09 | Within the 24-hour service window, counselors can send **free-form text messages** and **media messages** (image, document). These are NOT template messages. | The Cloud API call uses `type: "text"` or `type: "image"` instead of `type: "template"`. |
| BR-10 | Outside the 24-hour service window, the reply input is disabled and replaced with a "Send Template" button that opens the template selector. | Clear UX boundary: free-form inside window, template-only outside. |
| BR-11 | The service window status is displayed prominently in the conversation inbox: "Window open — expires in 4h 23m" (green) or "Window closed — template only" (gray). | Countdown timer, updated via polling or calculated client-side from stored window_expires_at. |
| BR-12 | Free-form replies within the service window are free (Meta does not charge for service messages). Utility templates within the window are also free. Marketing/authentication templates are charged regardless. | EducoreOS displays a cost indicator: "Free" for service messages and in-window utility templates, "₹X.XX" for marketing/authentication templates. |
| BR-13 | Outbound replies (both free-form and template) are stored in the same `whatsapp_conversations` table as inbound messages, with a `direction` field (`inbound` / `outbound`). | Unified conversation thread. |
| BR-14 | Outbound free-form replies are also logged as `whatsapp` activities on the lead with outcome = `sent`. | Consistent with 15D-I's outbound activity logging. |

### 3.3 Conversation Management Rules

| Rule ID | Rule | Detail |
|---|---|---|
| BR-15 | Each lead has at most one active WhatsApp conversation thread. Messages are appended chronologically. There is no concept of "closing" and "opening" conversations in Phase 15D-II. | Simple threading: all messages for a lead in one stream. |
| BR-16 | Conversations follow lead assignment: the counselor assigned to the lead owns the conversation. If the lead is reassigned, the conversation moves with it. | No separate conversation assignment. Uses existing lead assignment from 15A. |
| BR-17 | Counselors can see conversations only for leads they have access to (per `BranchAccessPolicy` from 15A). Branch managers see all conversations in their branch. Admins see all. | Same scoping as lead access — no new authorization layer. |
| BR-18 | Unread messages are tracked per counselor. When an inbound message arrives, the assigned counselor's unread count increments. Reading the conversation marks messages as read. | Unread count is displayed in the CRM navigation bar (badge on "WhatsApp" menu item). |
| BR-19 | When a lead sends a message, the assigned counselor receives an **in-app notification** (via Phase 14 NotificationDispatcher). The notification links to the conversation. | Notification type: `whatsapp_message_received`. Category: `system`. Priority: `high`. |

### 3.4 Bulk Broadcast Rules

| Rule ID | Rule | Detail |
|---|---|---|
| BR-20 | Bulk broadcast sends an approved template message to a filtered set of leads. | Only approved templates. No free-form broadcast. |
| BR-21 | Lead selection filters: stage, temperature, source, branch, assigned counselor, tag. Multiple filters combine with AND logic. | Reuses existing lead list filter infrastructure from `ListLeadsQuery`. |
| BR-22 | Before sending, the system displays a **cost estimate**: `number_of_recipients × per_message_cost_for_template_category`. The admin must confirm before proceeding. | Cost is calculated from the template's category and India rates (or the tenant's configured region). |
| BR-23 | Broadcast execution is asynchronous. Messages are dispatched as individual queued jobs, processed in batches respecting Meta's rate limits. | A `BroadcastBatch` record tracks overall progress: total, sent, delivered, failed. |
| BR-24 | Broadcast respects **opt-out**: leads who have opted out of WhatsApp messages are excluded from the recipient list automatically. The admin sees "X leads excluded (opted out)" in the preview. | Opt-out is tracked via `leads.whatsapp_opted_out` boolean. |
| BR-25 | Each broadcast is logged as a `whatsapp_broadcasts` record with: template used, filter criteria, total recipients, delivery stats, created_by, timestamp. | Audit trail for broadcast activity. |
| BR-26 | Broadcast sending respects Meta's messaging tier limits. If the tenant's tier is 250 messages/24h and they try to broadcast to 500 leads, the system warns: "Your current messaging limit is 250/day. This broadcast will be sent in batches over multiple days." | Alternatively, the system can queue and drip-send over multiple 24h windows. Developer decides the approach in the implementation plan. |
| BR-27 | A tenant can have only one active broadcast in progress at a time. Starting a new broadcast while one is running is blocked. | Prevents queue flooding and cost surprises. |
| BR-28 | Maximum broadcast recipients per batch: 1,000 leads. Larger audiences must be segmented into multiple broadcasts. | Practical limit to manage queue and cost. |

### 3.5 Opt-Out Rules

| Rule ID | Rule | Detail |
|---|---|---|
| BR-29 | If a lead replies with any of the keywords: `STOP`, `UNSUBSCRIBE`, `OPT OUT`, `CANCEL` (case-insensitive), the system marks the lead as `whatsapp_opted_out = true`. | Keyword matching on inbound message body. |
| BR-30 | Opted-out leads cannot receive business-initiated template messages (including broadcasts and automation-triggered templates). Service window replies are still allowed if the lead messages first. | The opt-out blocks outbound-initiated messages, not replies to lead-initiated conversations. |
| BR-31 | If an opted-out lead sends a message that is NOT an opt-out keyword, the opt-out remains. The counselor can manually remove the opt-out flag from the lead detail page if appropriate. | Opt-out is sticky until manually reversed. |
| BR-32 | Opt-out status is displayed on the lead detail page and in the conversation inbox. Attempting to send a template to an opted-out lead shows: "This lead has opted out of WhatsApp messages." | Clear UX preventing accidental sends. |

### 3.6 Automation Integration Rules

| Rule ID | Rule | Detail |
|---|---|---|
| BR-33 | A new trigger `lead.whatsapp_received` is added to the 15C-III automation trigger catalog. It fires when an inbound WhatsApp message is received for a lead. | Available event data: `lead_id`, `message_body`, `message_type`, `sender_phone`. |
| BR-34 | A new condition `whatsapp_message_contains` is added to the condition catalog. It checks if the inbound message body contains a keyword (case-insensitive substring match). | Applicable only to `lead.whatsapp_received` trigger. Operator: `contains`. Value: keyword string. |
| BR-35 | A new action `send_whatsapp_template` is added to the 15C-III action catalog. It sends an approved WhatsApp template message to the lead. | Parameters: `template_name` (must be an approved template), variable mappings auto-resolved from lead data. |
| BR-36 | The `send_whatsapp_template` action is subject to the same loop prevention as all other automation actions (15C-III `AutomationContextService`). An automation-sent WhatsApp template does NOT trigger `lead.whatsapp_received` (it's outbound, not inbound). However, if the lead replies to the automation-sent message, that inbound reply DOES trigger `lead.whatsapp_received`. | This is correct behavior — the lead's reply is a genuine inbound event, not an automation echo. |

---

## 4. Domain Model

### 4.1 Bounded Context Placement

Extends `TenantAdminDashboard/LeadManagement/WhatsAppIntegration/` — the same sub-context as 15D-I.

### 4.2 New & Modified Domain Layer Components

**Path:** `app/Domain/TenantAdminDashboard/LeadManagement/WhatsAppIntegration/`

| Component | Type | Action | Purpose |
|---|---|---|---|
| `WhatsAppConversationMessageEntity` | Entity | NEW | Represents a single message (inbound or outbound) in a conversation. Holds direction, message_type, body, media_url, meta_message_id, timestamps. |
| `WhatsAppMessageDirection` | Value Object | NEW | `inbound`, `outbound`. |
| `WhatsAppMessageType` | Value Object | NEW | `text`, `image`, `document`, `audio`, `video`, `location`, `contacts`, `template`. |
| `WhatsAppServiceWindow` | Value Object | NEW | Holds `opens_at`, `expires_at`. Method `isOpen(): bool`. |
| `WhatsAppBroadcastEntity` | Entity | NEW | Represents a broadcast batch. Holds template_id, filter_criteria, total_recipients, sent_count, delivered_count, failed_count, status. |
| `WhatsAppBroadcastStatus` | Value Object | NEW | `preparing`, `sending`, `completed`, `cancelled`. |
| `WhatsAppMessageReceived` | Domain Event | NEW | Dispatched on inbound message. Carries lead_id, message_body, message_type, sender_phone. |
| `WhatsAppBroadcastCompleted` | Domain Event | NEW | Dispatched when all messages in a broadcast have been processed. |
| `WhatsAppConversationMessageRepositoryInterface` | Repository Interface | NEW | CRUD for conversation messages. Query by lead_id, direction, date range. |
| `WhatsAppBroadcastRepositoryInterface` | Repository Interface | NEW | CRUD for broadcasts. |
| `WhatsAppServiceWindowExpiredException` | Exception | NEW | Thrown when attempting a free-form reply outside the 24-hour window. |
| `WhatsAppLeadOptedOutException` | Exception | NEW | Thrown when attempting to send to an opted-out lead. |

### 4.3 New Application Layer Components

**Path:** `app/Application/TenantAdminDashboard/LeadManagement/WhatsAppIntegration/`

| Component | Type | Purpose |
|---|---|---|
| `ProcessInboundWhatsAppMessageUseCase` | Use Case | Core inbound handler: resolve tenant → resolve/create lead → store message → update service window → log activity → dispatch events → notify counselor. |
| `SendWhatsAppReplyUseCase` | Use Case | Send a free-form reply within the service window. Validates window is open. Calls Cloud API. Stores outbound message. Logs activity. |
| `GetConversationQuery` | Query | Returns the message thread for a lead (paginated, chronological). Includes service window status. |
| `ListActiveConversationsQuery` | Query | Returns leads with recent WhatsApp activity for the counselor's inbox. Sorted by last message time. Includes unread count per lead. |
| `GetUnreadConversationCountQuery` | Query | Returns total unread inbound messages for the authenticated counselor. |
| `MarkConversationReadUseCase` | Use Case | Marks all inbound messages for a lead as read by the counselor. Decrements unread count. |
| `CreateBroadcastUseCase` | Use Case | Creates a broadcast: validates template, applies lead filters, calculates cost estimate, creates batch record. Does NOT send yet. |
| `ConfirmBroadcastUseCase` | Use Case | Confirms and starts a prepared broadcast. Dispatches individual send jobs per lead. |
| `CancelBroadcastUseCase` | Use Case | Cancels an in-progress broadcast. Remaining unsent messages are skipped. |
| `ListBroadcastsQuery` | Query | Paginated list of broadcasts for the tenant. Includes delivery stats. |
| `ProcessOptOutUseCase` | Use Case | Checks inbound message for opt-out keywords. Marks lead as opted-out. |
| `RemoveOptOutUseCase` | Use Case | Admin manually removes opt-out flag from a lead. Audit-logged. |
| `ResolveLeadFromPhoneUseCase` | Use Case | Finds a lead by phone number within the tenant. Creates a new lead if none exists (BR-03). |

### 4.4 New Application Layer — Automation Extension

| Component | Type | Purpose |
|---|---|---|
| `TriggerAutomationOnWhatsAppReceivedListener` | Listener | Listens to `WhatsAppMessageReceived`. Dispatches `EvaluateAutomationRulesJob` with trigger `lead.whatsapp_received`. Checks `AutomationContextService` for loop prevention. |
| `SendWhatsAppTemplateExecutor` | Action Executor | Implements `ActionExecutorInterface` for the `send_whatsapp_template` action. Delegates to `SendWhatsAppMessageUseCase` (15D-I). |

### 4.5 New Infrastructure Layer Components

| Component | Type | Purpose |
|---|---|---|
| `WhatsAppConversationMessageRecord` | Eloquent Model | Maps to `whatsapp_conversation_messages`. `BelongsToTenant`. |
| `WhatsAppBroadcastRecord` | Eloquent Model | Maps to `whatsapp_broadcasts`. `BelongsToTenant`. |
| `EloquentWhatsAppConversationMessageRepository` | Repository | Implements conversation message interface. |
| `EloquentWhatsAppBroadcastRepository` | Repository | Implements broadcast interface. |
| `ProcessInboundWhatsAppMessageJob` | Queued Job | Dispatched by webhook controller on inbound message. `notifications-high` queue. |
| `SendBroadcastMessageJob` | Queued Job | Sends a single template message as part of a broadcast. `notifications-default` queue. Includes rate-limit-aware delay. |
| `DownloadWhatsAppMediaJob` | Queued Job | Downloads media (images, documents) from Meta's CDN and stores in tenant's file storage. `notifications-low` queue. |

### 4.6 HTTP Layer — New Endpoints

**Webhook Controller (extended from 15D-I):**

The existing `POST /api/webhooks/meta/whatsapp` handler is extended to process `messages` array entries (inbound messages) in addition to `statuses` array entries (delivery updates).

**Tenant Admin Controllers:**

| Endpoint | Method | Capability |
|---|---|---|
| `GET /api/tenant/whatsapp/conversations` | List active conversations (counselor inbox) | `whatsapp.view` |
| `GET /api/tenant/whatsapp/conversations/unread-count` | Unread message count | `whatsapp.view` |
| `GET /api/tenant/leads/{lead}/whatsapp/conversation` | Get conversation thread for a lead | `whatsapp.view` |
| `POST /api/tenant/leads/{lead}/whatsapp/reply` | Send free-form reply (within window) | `whatsapp.send` |
| `POST /api/tenant/leads/{lead}/whatsapp/conversation/mark-read` | Mark conversation as read | `whatsapp.view` |
| `POST /api/tenant/whatsapp/broadcasts` | Create/prepare a broadcast | `whatsapp.broadcast` |
| `POST /api/tenant/whatsapp/broadcasts/{id}/confirm` | Confirm and start sending | `whatsapp.broadcast` |
| `POST /api/tenant/whatsapp/broadcasts/{id}/cancel` | Cancel in-progress broadcast | `whatsapp.broadcast` |
| `GET /api/tenant/whatsapp/broadcasts` | List broadcasts | `whatsapp.view` |
| `GET /api/tenant/whatsapp/broadcasts/{id}` | Broadcast detail with delivery stats | `whatsapp.view` |
| `DELETE /api/tenant/leads/{lead}/whatsapp/opt-out` | Remove opt-out flag | `whatsapp.manage` |

**New Capability Code:**

| Code | Who Has It | Purpose |
|---|---|---|
| `whatsapp.broadcast` | Admins only | Create and manage bulk broadcasts |

**Form Requests:**

| Request | Validates |
|---|---|
| `SendWhatsAppReplyRequest` | `body` (required if type=text, max 4096 chars), `type` (required: `text`, `image`, `document`), `media_url` (required if type=image/document) |
| `CreateBroadcastRequest` | `template_id` (required, must be approved), `filters` (optional object: stage, temperature, source, branch_id, assigned_to), `recipient_lead_ids` (optional array, alternative to filters for manual selection) |

**API Resources:**

| Resource | Shapes |
|---|---|
| `WhatsAppConversationMessageResource` | `id`, `direction` (inbound/outbound), `message_type`, `body`, `media_url`, `meta_message_id`, `delivery_status` (for outbound), `timestamp` |
| `WhatsAppConversationResource` | `lead_id`, `lead_name`, `lead_phone`, `lead_stage`, `lead_temperature`, `assigned_to`, `last_message` (preview), `last_message_at`, `unread_count`, `service_window` ({is_open, expires_at}), `is_opted_out` |
| `WhatsAppBroadcastResource` | `id`, `template_name`, `template_category`, `filter_criteria`, `total_recipients`, `excluded_opted_out`, `sent_count`, `delivered_count`, `read_count`, `failed_count`, `estimated_cost`, `status`, `created_by`, `created_at`, `completed_at` |

---

## 5. Database Schema

### 5.1 New Tables

**`whatsapp_conversation_messages`** (tenant-scoped)

| Column | Type | Notes |
|---|---|---|
| `id` | BIGINT UNSIGNED PK | Auto-increment |
| `tenant_id` | BIGINT UNSIGNED NOT NULL | FK → `tenants.id`. |
| `lead_id` | BIGINT UNSIGNED NOT NULL | FK → `leads.id`. |
| `direction` | VARCHAR(10) NOT NULL | `inbound`, `outbound`. |
| `message_type` | VARCHAR(20) NOT NULL | `text`, `image`, `document`, `audio`, `video`, `location`, `contacts`, `template`. |
| `body` | TEXT NULLABLE | Message text content. NULL for media-only messages. |
| `media_url` | VARCHAR(500) NULLABLE | URL of the media file (Meta CDN URL for inbound, local storage URL after download). |
| `media_mime_type` | VARCHAR(50) NULLABLE | e.g., `image/jpeg`, `application/pdf`. |
| `media_filename` | VARCHAR(255) NULLABLE | Original filename for documents. |
| `location_data` | JSON NULLABLE | `{"latitude": ..., "longitude": ..., "name": ..., "address": ...}` for location messages. |
| `template_id` | BIGINT UNSIGNED NULLABLE | FK → `whatsapp_templates.id`. Set for outbound template messages. NULL for free-form and inbound. |
| `meta_message_id` | VARCHAR(100) NOT NULL | Meta's `wamid`. Unique. Used for dedup and status correlation. |
| `meta_context_message_id` | VARCHAR(100) NULLABLE | If this is a reply to a specific message, Meta includes the original message's wamid. |
| `delivery_status` | VARCHAR(20) NULLABLE | For outbound only: `accepted`, `sent`, `delivered`, `read`, `failed`. NULL for inbound. |
| `sent_by` | BIGINT UNSIGNED NULLABLE | FK → `users.id`. For outbound: the counselor. NULL for inbound and system-sent. |
| `is_read_by_counselor` | BOOLEAN NOT NULL DEFAULT FALSE | For inbound only: whether the counselor has seen this message. |
| `linked_activity_id` | BIGINT UNSIGNED NULLABLE | FK → `lead_activities.id`. |
| `broadcast_id` | BIGINT UNSIGNED NULLABLE | FK → `whatsapp_broadcasts.id`. Set if sent as part of a broadcast. |
| `created_at` | TIMESTAMP | Message timestamp. |

**Indexes:**
- `idx_wa_conv_lead` → `(lead_id, created_at DESC)` — conversation thread per lead
- `idx_wa_conv_tenant_unread` → `(tenant_id, direction, is_read_by_counselor)` — unread count queries
- `idx_wa_conv_meta_id` → `(meta_message_id)` UNIQUE — dedup and status correlation
- `idx_wa_conv_broadcast` → `(broadcast_id)` — broadcast delivery tracking

---

**`whatsapp_service_windows`** (tenant-scoped)

| Column | Type | Notes |
|---|---|---|
| `id` | BIGINT UNSIGNED PK | Auto-increment |
| `tenant_id` | BIGINT UNSIGNED NOT NULL | FK → `tenants.id`. |
| `lead_id` | BIGINT UNSIGNED NOT NULL | FK → `leads.id`. UNIQUE per tenant (one active window per lead). |
| `opens_at` | TIMESTAMP NOT NULL | When the last inbound message was received. |
| `expires_at` | TIMESTAMP NOT NULL | `opens_at` + 24 hours. |

**Indexes:**
- `unq_wa_service_window_lead` → `(tenant_id, lead_id)` UNIQUE
- `idx_wa_service_window_expiry` → `(expires_at)` — for cleanup and window status queries

On each inbound message, upsert this record: if exists, update `opens_at` and `expires_at`. If not, insert.

---

**`whatsapp_broadcasts`** (tenant-scoped)

| Column | Type | Notes |
|---|---|---|
| `id` | BIGINT UNSIGNED PK | Auto-increment |
| `tenant_id` | BIGINT UNSIGNED NOT NULL | FK → `tenants.id`. |
| `template_id` | BIGINT UNSIGNED NOT NULL | FK → `whatsapp_templates.id`. |
| `filter_criteria` | JSON NULLABLE | The filters used to select recipients. NULL if manual selection. |
| `recipient_count` | INT UNSIGNED NOT NULL | Total leads targeted (including opted-out). |
| `excluded_opted_out` | INT UNSIGNED NOT NULL DEFAULT 0 | Leads excluded due to opt-out. |
| `sent_count` | INT UNSIGNED NOT NULL DEFAULT 0 | Messages successfully sent to Meta. |
| `delivered_count` | INT UNSIGNED NOT NULL DEFAULT 0 | Messages confirmed delivered. |
| `read_count` | INT UNSIGNED NOT NULL DEFAULT 0 | Messages confirmed read. |
| `failed_count` | INT UNSIGNED NOT NULL DEFAULT 0 | Messages that failed. |
| `estimated_cost_cents` | BIGINT UNSIGNED NOT NULL | Pre-calculated cost estimate in paise (₹ × 100). |
| `status` | VARCHAR(20) NOT NULL DEFAULT 'preparing' | `preparing`, `sending`, `completed`, `cancelled`. |
| `created_by` | BIGINT UNSIGNED NOT NULL | FK → `users.id`. |
| `confirmed_at` | TIMESTAMP NULLABLE | When admin confirmed and started sending. |
| `completed_at` | TIMESTAMP NULLABLE | When all messages processed (sent or failed). |
| `cancelled_at` | TIMESTAMP NULLABLE | When cancelled. |
| `created_at` | TIMESTAMP | |
| `updated_at` | TIMESTAMP | |

**Indexes:**
- `idx_wa_broadcasts_tenant` → `(tenant_id, created_at DESC)`
- `idx_wa_broadcasts_status` → `(tenant_id, status)` — for active broadcast check (BR-27)

### 5.2 Modified Tables

**`leads`** — Add column:

| Column | Type | Notes |
|---|---|---|
| `whatsapp_opted_out` | BOOLEAN NOT NULL DEFAULT FALSE | Whether the lead has opted out of business-initiated WhatsApp messages. |
| `whatsapp_opted_out_at` | TIMESTAMP NULLABLE | When the opt-out was recorded. |

### 5.3 Migration Note — `whatsapp_messages` (15D-I) vs `whatsapp_conversation_messages` (15D-II)

Phase 15D-I created a `whatsapp_messages` table for outbound template messages. Phase 15D-II introduces `whatsapp_conversation_messages` as the unified conversation table for BOTH inbound and outbound messages.

**The implementation plan must address this transition.** Two approaches are acceptable:

**Option A — Migrate:** Move existing `whatsapp_messages` records into `whatsapp_conversation_messages` (with `direction = 'outbound'`), then deprecate `whatsapp_messages`. Clean but requires a data migration.

**Option B — Coexist:** Keep `whatsapp_messages` for 15D-I outbound-only records. Use `whatsapp_conversation_messages` for all new messages (both directions). The conversation inbox queries both tables. Messier but no migration.

**Recommendation:** Option A (migrate) if 15D-I has been live for less than a month with low data volume. Option B if significant data exists. Developer decides in implementation plan with justification.

---

## 6. Inbound Webhook Processing

### 6.1 Webhook Payload for Inbound Messages

```json
{
    "entry": [{
        "id": "WABA_ID",
        "changes": [{
            "field": "messages",
            "value": {
                "messaging_product": "whatsapp",
                "metadata": { "phone_number_id": "PHONE_NUMBER_ID" },
                "contacts": [{ "profile": { "name": "Rahul Sharma" }, "wa_id": "919876543210" }],
                "messages": [{
                    "from": "919876543210",
                    "id": "wamid.ABCxyz123",
                    "timestamp": "1711432800",
                    "type": "text",
                    "text": { "body": "Hi, I'm interested in the Science batch. When is the next demo class?" }
                }]
            }
        }]
    }]
}
```

### 6.2 Processing Flow

```
Webhook received (synchronous — must return 200 within 20 seconds):
1. Verify signature (same as 15D-I)
2. Parse payload: check for 'messages' array (inbound) vs 'statuses' array (delivery updates)
3. For each inbound message:
   a. Dedup check: does whatsapp_conversation_messages already have this meta_message_id?
   b. If new: dispatch ProcessInboundWhatsAppMessageJob
4. Return 200 OK

Async job (ProcessInboundWhatsAppMessageJob):
1. Resolve tenant from WABA ID (via whatsapp_connections table)
2. Check module entitlement → skip if not entitled
3. Set TenantContext
4. Resolve lead from sender phone number (ResolveLeadFromPhoneUseCase)
   → Found: use existing lead
   → Not found: create new lead (source = 'whatsapp', auto-assign)
5. Store message in whatsapp_conversation_messages (direction = 'inbound')
6. Upsert whatsapp_service_windows (opens_at = now, expires_at = now + 24h)
7. If media message: dispatch DownloadWhatsAppMediaJob to fetch and store media
8. Log activity: LogLeadActivityUseCase (type = 'whatsapp', outcome = 'replied', body = message text)
9. Check opt-out keywords (ProcessOptOutUseCase)
10. Dispatch WhatsAppMessageReceived domain event
11. Send notification to assigned counselor (NotificationDispatcher, type = 'whatsapp_message_received')
12. Increment unread count for the assigned counselor
13. Reset TenantContext
```

---

## 7. Frontend Requirements

### 7.1 Conversation Inbox

**Location:** CRM → WhatsApp Inbox (new navigation item)

**Layout:** Two-panel design (responsive):
- **Left panel:** List of active conversations sorted by last message time (most recent first). Each row shows: lead name, lead photo/avatar, last message preview (truncated), last message time, unread badge count, service window status indicator (green dot = open, gray = closed), opt-out badge (if applicable).
- **Right panel:** Selected conversation thread. Messages displayed in a chat bubble layout (inbound on left, outbound on right). Timestamps between message groups. Delivery status ticks on outbound messages.

**Bottom of right panel — Reply area:**
- If service window is open: text input + send button + media attach button. Banner: "Service window open — expires in Xh Ym"
- If service window is closed: text input disabled. "Send Template" button opens template selector modal. Banner: "Service window closed — template only"
- If lead is opted-out: all inputs disabled. Banner: "This lead has opted out of WhatsApp messages."

**Polling:** Conversations list and unread count poll every 30 seconds (or use the existing Phase 14 polling infrastructure).

### 7.2 Lead Detail — WhatsApp Tab

On the lead detail page, add a "WhatsApp" tab showing:
- The full conversation thread (same chat bubble layout as inbox)
- Service window status
- Opt-out status with "Remove opt-out" button (admin only)
- Reply capability (same rules as inbox)

### 7.3 Broadcast Page

**Location:** CRM → WhatsApp → Broadcasts

**Create Broadcast Flow:**
1. Select template from approved templates dropdown (shows category + cost per message)
2. Select recipients:
   - Option A: Filter — stage, temperature, source, branch, assigned counselor dropdowns
   - Option B: Manual — search and select individual leads
3. Preview shows: total recipients, opted-out excluded count, estimated cost (recipients × per-message rate)
4. "Prepare Broadcast" button → creates broadcast in `preparing` status
5. Confirmation dialog: "You are about to send [template_name] to [X] leads. Estimated cost: ₹[Y]. [Z] leads excluded (opted out). Confirm?"
6. "Confirm & Send" → broadcast starts
7. Progress view: real-time counters — Sent: X / Total: Y, Delivered: Z, Failed: W
8. "Cancel" button available while sending

**Broadcast List:**
- Table: Template, Recipients, Sent/Delivered/Read/Failed, Cost Estimate, Status, Created By, Date
- Click to expand: delivery details, failed recipients list

### 7.4 Navigation Updates

- Add "WhatsApp" section in CRM navigation
- Sub-items: Inbox, Broadcasts, Settings (links to existing WhatsApp settings)
- Unread badge on "Inbox" showing total unread conversation count

---

## 8. Automation Rule Engine Extension

### 8.1 New Trigger

Add to the 15C-III trigger catalog:

| Trigger Code | Domain Event | Description | Available Event Data |
|---|---|---|---|
| `lead.whatsapp_received` | `WhatsAppMessageReceived` | A lead sends a WhatsApp message to the institution | `lead_id`, `message_body`, `message_type`, `sender_phone` |

### 8.2 New Condition

Add to the 15C-III condition catalog:

| Condition Type | Applicable Triggers | Operator Options | Value Type |
|---|---|---|---|
| `whatsapp_message_contains` | `lead.whatsapp_received` | `contains` | Keyword string (case-insensitive substring match) |

### 8.3 New Action

Add to the 15C-III action catalog:

| Action Code | Description | Parameters |
|---|---|---|
| `send_whatsapp_template` | Send an approved WhatsApp template to the lead | `template_name` (must be approved), variable values auto-resolved from lead data |

### 8.4 Example Automation Rules

**"When a lead messages us, create a follow-up task to respond"**
```json
{
    "trigger_code": "lead.whatsapp_received",
    "conditions": [],
    "action_code": "create_follow_up_task",
    "action_params": { "task_type": "whatsapp", "due_in_hours": 1, "description": "Respond to WhatsApp message" }
}
```

**"When a lead messages with keyword 'admission', notify branch manager"**
```json
{
    "trigger_code": "lead.whatsapp_received",
    "conditions": [{ "type": "whatsapp_message_contains", "operator": "contains", "value": "admission" }],
    "action_code": "send_notification",
    "action_params": { "recipient_type": "branch_manager", "notification_title": "Admission Inquiry via WhatsApp", "notification_body": "{lead_name} messaged about admission. Message: check conversation." }
}
```

**"Auto-reply with course info template when a lead messages"**
```json
{
    "trigger_code": "lead.whatsapp_received",
    "conditions": [{ "type": "source_is", "operator": "equals", "value": "facebook_ads" }],
    "action_code": "send_whatsapp_template",
    "action_params": { "template_name": "course_info_reply" }
}
```

---

## 9. Security Boundaries

### 9.1 Tenant Isolation

- Inbound messages are routed to the correct tenant via WABA ID → `whatsapp_connections` lookup. No cross-tenant leakage.
- Conversation messages, broadcasts, and service windows are all tenant-scoped via `BelongsToTenant`.
- Counselors see only conversations for leads they have access to (per `BranchAccessPolicy`).

### 9.2 Data Privacy

- Inbound messages may contain sensitive information (phone numbers, personal details, documents). All messages are stored in the tenant-scoped database with the same access controls as lead data.
- Media files downloaded from Meta's CDN are stored in the tenant's file storage area (same storage as File Manager).
- Opt-out status is respected — the system prevents messaging opted-out leads.

### 9.3 Rate Limiting & Abuse Prevention

- Broadcast sending respects Meta's messaging tier limits.
- One active broadcast per tenant prevents queue flooding.
- The 1,000 recipient cap per broadcast prevents accidental mass sends.
- Cost estimation before send prevents bill shock.

---

## 10. Implementation Plan Requirements

| # | Section | Content |
|---|---|---|
| 1 | Executive Summary | What gets built, what does NOT |
| 2 | Dependency Verification | Verify 15D-I complete: WABA connection works, template CRUD works, webhook receives status updates. Verify 15C-I complete: `LogLeadActivityUseCase` exists. Verify 15C-III status for automation extension. |
| 3 | Architecture Decisions | `whatsapp_messages` (15D-I) migration strategy: Option A (migrate) or Option B (coexist). Webhook strategy: shared or separate endpoint for inbound messages. |
| 4 | Migration Plan | New tables, modified columns. `whatsapp_messages` → `whatsapp_conversation_messages` migration (if Option A). |
| 5 | Domain Layer | New entities, value objects, events |
| 6 | Application Layer | UseCases, queries, automation extension |
| 7 | Infrastructure Layer | Eloquent models, repositories, queued jobs, media download |
| 8 | HTTP Layer | Extended webhook controller, new conversation endpoints, broadcast endpoints |
| 9 | Inbound Processing | Full webhook → job → lead resolution → message storage → activity log → notification flow |
| 10 | Service Window | Upsert logic, expiry tracking, frontend display |
| 11 | Conversation Inbox | Frontend specification, polling, reply capability |
| 12 | Broadcast | Creation → confirmation → queue dispatch → rate limiting → delivery tracking |
| 13 | Opt-Out | Keyword detection, flag management, enforcement on sends |
| 14 | Automation Extension | New trigger, condition, action. Listener wiring. |
| 15 | Implementation Sequence | Ordered steps with dependencies and day estimates |
| 16 | Test Plan | Every test file with description |
| 17 | Quality Gate Verification | Checklist from §11 |
| 18 | File Manifest | Every new and modified file |

---

## 11. Quality Gates

### 11.1 Inbound Message Gates

- [ ] Inbound text message from lead appears in conversation inbox
- [ ] Inbound media message (image, document) stored and viewable
- [ ] Lead resolved from phone number — existing lead matched correctly
- [ ] New lead auto-created when phone number doesn't match any existing lead
- [ ] Activity logged as `whatsapp` type with outcome `replied` on inbound message
- [ ] Message deduplication: same wamid processed only once
- [ ] Counselor receives in-app notification on inbound message
- [ ] Unread count increments on inbound, decrements when conversation is read

### 11.2 Service Window Gates

- [ ] Service window opens on inbound message (expires_at = +24h)
- [ ] Service window resets on each new inbound message
- [ ] Free-form reply succeeds within the window
- [ ] Free-form reply blocked outside the window (422 error with clear message)
- [ ] Window status displayed correctly in inbox UI (countdown timer)

### 11.3 Conversation Inbox Gates

- [ ] Conversation thread shows inbound and outbound messages chronologically
- [ ] Chat bubble layout: inbound left, outbound right
- [ ] Delivery status ticks on outbound messages
- [ ] Reply input enabled/disabled based on service window
- [ ] Opt-out badge displayed for opted-out leads
- [ ] Conversations sorted by last message time (most recent first)
- [ ] Counselors see only conversations for their assigned leads

### 11.4 Broadcast Gates

- [ ] Broadcast created with correct recipient count and cost estimate
- [ ] Opted-out leads excluded from recipient count
- [ ] Confirmation step shows accurate cost before sending
- [ ] Messages sent asynchronously in batches
- [ ] Delivery counters update as messages are processed
- [ ] Only one active broadcast per tenant enforced
- [ ] Broadcast can be cancelled mid-send — remaining messages skipped
- [ ] Maximum 1,000 recipients per broadcast enforced

### 11.5 Opt-Out Gates

- [ ] "STOP" reply marks lead as opted-out
- [ ] Opted-out lead cannot receive template messages (manual or broadcast)
- [ ] Opted-out lead can still receive service replies if they message first
- [ ] Admin can manually remove opt-out flag
- [ ] Opt-out status visible on lead detail and conversation inbox

### 11.6 Automation Gates

- [ ] `lead.whatsapp_received` trigger fires on inbound message
- [ ] `whatsapp_message_contains` condition matches keywords correctly (case-insensitive)
- [ ] `send_whatsapp_template` action sends the specified template to the lead
- [ ] Loop prevention: automation-sent template does NOT trigger `lead.whatsapp_received`
- [ ] Lead's reply to automation-sent message DOES trigger `lead.whatsapp_received`

### 11.7 Regression Gates

- [ ] All 15D-I tests pass (outbound messaging, template management, delivery status)
- [ ] All 15C tests pass (activities, scoring, automation)
- [ ] Phase 15B Meta Lead Ads unaffected
- [ ] PHPStan Level 5 passes with 0 new errors

---

## 12. Constraints & Reminders

### Architecture Constraints

- **Conversation messages are the single source of truth.** The inbox reads from `whatsapp_conversation_messages`. Do NOT build a separate "inbox" table. The conversation IS the message history.
- **Service window is calculated, not polled.** Store `opens_at` and `expires_at` on the service window record. The frontend calculates the countdown client-side. Do NOT poll Meta to check if the window is open.
- **Lead resolution happens once per inbound message.** Do NOT re-resolve the lead on every API call. The `ProcessInboundWhatsAppMessageJob` resolves the lead and stores `lead_id` on the message record.
- **Broadcast messages are individual send jobs.** Each recipient gets their own queued job. Do NOT batch API calls — the Cloud API sends to one recipient at a time.
- **Opt-out is enforced at the application layer.** The `SendWhatsAppMessageUseCase` and `SendBroadcastMessageJob` check `whatsapp_opted_out` before calling the API. Do NOT rely on Meta to enforce opt-outs.
- **Audit logs OUTSIDE transactions.** Same as all previous phases.
- **No external API calls inside database transactions.**

### Docker Environment

- Container: Alpine Linux — use `sh` not `bash`
- Container name: `ubotz_backend`
- Queue: Redis DB 3

### What NOT to Do

- Do NOT build a chatbot or auto-reply system. Phase 15D-II receives messages and allows manual/automation-triggered replies. A conversational chatbot is a future feature.
- Do NOT implement message scheduling (send at a future time). All sends are immediate.
- Do NOT build conversation assignment separate from lead assignment. The counselor who owns the lead owns the conversation.
- Do NOT store media files on Meta's CDN long-term. Meta's media URLs expire. Download and store locally via `DownloadWhatsAppMediaJob`.
- Do NOT send free-form messages outside the 24-hour window. The API will reject them. Validate the window before attempting.
- Do NOT skip the cost estimation step in broadcast. Tenants must see the cost before confirming.
- Do NOT allow concurrent broadcasts. One at a time per tenant.
- Do NOT use `eval()` or dynamic code execution for keyword matching in the `whatsapp_message_contains` condition. Simple `stripos()` substring match.

---

## 13. Definition of Done

Phase 15D-II is complete when:

1. The implementation plan has been reviewed and approved by the Principal Engineer.
2. All code is implemented per the approved plan.
3. All quality gates in §11 pass.
4. A Principal Engineer audit confirms zero critical or high findings.
5. All findings from audit are resolved.
6. End-to-end demonstration:
   a. A lead sends "Hi, I'm interested in your Science batch" to the institution's WhatsApp number → message appears in conversation inbox → counselor is notified → unread count shows 1.
   b. Counselor opens the conversation → service window shows "Open — expires in 23h 58m" → types a reply → reply appears in thread with delivery ticks.
   c. Same lead replies again → window timer resets → conversation continues.
   d. 24 hours pass (simulated) → reply input disabled → "Send Template" button appears → counselor sends a template → template message appears in thread.
   e. A new unknown number messages the institution → new lead auto-created with source `whatsapp` → auto-assigned to counselor → conversation appears in inbox.
   f. A lead replies "STOP" → lead marked as opted-out → counselor sees opt-out badge → manual template send blocked.
   g. Admin creates a broadcast → selects "demo class reminder" template → filters leads by stage "Interested" → preview shows 50 recipients, 3 excluded (opted-out), estimated cost ₹7.25 → confirms → messages sent → delivery stats update.
   h. Automation rule fires: "When WhatsApp received with keyword 'admission' → notify branch manager" → verified.
7. Zero regression in existing test suite.
8. PHPStan Level 5 passes with 0 new errors.
9. The Phase 15D-II Completion Report is signed off.

---

*End of Document — UBOTZ 2.0 Phase 15D-II Developer Instructions — March 26, 2026*
