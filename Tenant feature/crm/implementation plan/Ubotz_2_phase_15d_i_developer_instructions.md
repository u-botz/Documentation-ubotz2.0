# UBOTZ 2.0 — Phase 15D-I Developer Instructions

## WhatsApp Business API Integration — Outbound Messaging

| Field | Value |
|---|---|
| **Document Type** | Developer Instruction (Pre-Implementation Brief) |
| **Phase** | 15D-I (of 15D-I / 15D-II) |
| **Date** | March 26, 2026 |
| **Issued By** | Principal Engineer / Architecture Auditor |
| **Audience** | Implementation Developer (Antigravity) |
| **Expected Deliverable** | Phase 15D-I Implementation Plan |
| **Prerequisites** | Phase 15A COMPLETE (Lead Management), Phase 14 COMPLETE (Notification Infrastructure), Phase 15B COMPLETE or IN PROGRESS (Meta Lead Ads — shares the same Meta Developer App). Phase 15C-I RECOMMENDED but not required (structured activities — if complete, WhatsApp sends are auto-logged as activities). |

> **This phase connects EducoreOS to Meta's WhatsApp Cloud API, enabling tenants to send template-based WhatsApp messages to leads and receive delivery status callbacks. It extends the Phase 14 notification infrastructure with a WhatsApp delivery channel and adds manual WhatsApp send capability from the lead detail page. Each tenant connects their own WhatsApp Business Account (WABA) and bears Meta's per-message costs directly. This is outbound-only — receiving inbound replies from leads is Phase 15D-II.**

---

## 1. Mission Statement

Phase 15D-I builds **outbound WhatsApp messaging** for the CRM within the existing `TenantAdminDashboard/LeadManagement` bounded context.

The integration uses Meta's **WhatsApp Cloud API** — fully hosted by Meta, no on-premise infrastructure required. Each tenant connects their own WhatsApp Business Account (WABA) via Meta's Embedded Signup flow and manages their own message templates. EducoreOS provides the UI for template management, message sending, and delivery tracking. Meta handles message routing, delivery, and per-message billing directly to the tenant.

**What this phase includes:**
- Per-tenant WABA connection via Meta's Embedded Signup (self-service from Tenant Admin Dashboard)
- Secure token storage (System User Access Token, encrypted at rest)
- Message template CRUD within EducoreOS (create, submit to Meta for approval, view status, edit rejected)
- WhatsApp as a new notification channel in Phase 14's `NotificationDispatcher` (`WhatsAppChannel`)
- Manual WhatsApp send from lead detail page (counselor selects template, fills variables, sends)
- Delivery status webhooks (sent → delivered → read → failed) updating activity/notification records
- WhatsApp activity auto-logging as `whatsapp` activity type (if 15C-I is complete)
- Plan-gated via `module.whatsapp` module entitlement
- CRM Settings for WhatsApp preferences (default templates per notification type)
- Per-tenant WhatsApp phone number display on lead-facing communications

**What this phase does NOT include:**
- Receiving inbound WhatsApp messages from leads (Phase 15D-II)
- Two-way conversation inbox / chat UI (Phase 15D-II)
- Bulk broadcast campaigns to multiple leads (Phase 15D-II)
- WhatsApp-triggered automation rules (Phase 15D-II — adds `lead.whatsapp_received` trigger to 15C-III)
- Free-form message sending (only template messages — Meta's 24-hour window rule makes free-form impractical without inbound)
- WhatsApp Business App coexistence (tenant must use API exclusively on the connected number)
- WhatsApp Flows (in-chat forms, surveys — future)
- WhatsApp Calling API (future)

---

## 2. Business Context

### 2.1 Current State

EducoreOS counselors interact with leads via Call, Meeting, Demo Class, and Notes (Phase 15C-I). WhatsApp is the dominant communication channel in India's education sector — counselors already use personal WhatsApp to message leads, but these interactions are invisible to the CRM. There is no institutional control, no audit trail, no automation, and no delivery tracking.

The Phase 14 notification infrastructure delivers via Email and In-App channels. There is no WhatsApp delivery channel.

### 2.2 What Changes

After Phase 15D-I:
1. Tenant admin connects the institution's WhatsApp Business phone number via a one-click Embedded Signup flow.
2. Tenant admin creates message templates ("Demo class confirmation", "Admission status update", "Follow-up reminder") and submits them to Meta for approval — all within EducoreOS.
3. Counselors can send approved WhatsApp templates to leads directly from the lead detail page — selecting a template, filling in variables (lead name, course name, date), and sending with one click.
4. The system tracks delivery status: sent → delivered → read → failed. Counselors can see whether the lead actually read the message.
5. Follow-up reminders (15C-I), escalation notifications, and automation rule actions (15C-III) can optionally deliver via WhatsApp in addition to email and in-app — the `NotificationDispatcher` gains a `WhatsAppChannel`.
6. Every WhatsApp message sent is logged as a structured `whatsapp` activity on the lead (if 15C-I is complete), feeding into lead scoring (15C-II) and providing a complete interaction history.

### 2.3 Cost Model

**EducoreOS does NOT absorb WhatsApp messaging costs.** Each tenant connects their own WABA and is billed directly by Meta for per-message charges. EducoreOS is the sending interface — Meta is the billing party.

Current India rates (as of January 2026):
- Marketing templates: ~₹1.09 per delivered message
- Utility templates: ~₹0.145 per delivered message
- Authentication templates: ~₹0.145 per delivered message
- Service (customer-initiated, within 24h): FREE

EducoreOS must clearly communicate to tenant admins that WhatsApp messages incur per-message costs charged by Meta, not by EducoreOS.

---

## 3. Business Rules (NON-NEGOTIABLE)

### 3.1 WABA Connection Rules

| Rule ID | Rule | Detail |
|---|---|---|
| BR-01 | Each tenant connects their own WABA via Meta's Embedded Signup flow. EducoreOS does NOT share a platform-level WABA. | Per-tenant isolation. Each tenant's WhatsApp costs are their own. |
| BR-02 | A tenant can connect exactly ONE WhatsApp Business phone number. Multi-number support is deferred. | Simplifies the architecture. One WABA → one phone number → one tenant. |
| BR-03 | The connected phone number cannot already be registered on WhatsApp Business App or personal WhatsApp. Meta enforces this — the number must be exclusively on the API. | EducoreOS must communicate this requirement clearly in the connection UI. |
| BR-04 | The WABA connection stores a **System User Access Token** (permanent, non-expiring) generated via Meta Business Manager. This is more reliable than user tokens for server-to-server API calls. | Encrypted at rest using `Crypt::encryptString()`. |
| BR-05 | The WhatsApp Business Account ID (`waba_id`) and Phone Number ID (`phone_number_id`) are stored alongside the token. API calls require `phone_number_id`, not the phone number itself. | These are Meta's internal identifiers, distinct from the actual phone number. |
| BR-06 | Connection status follows the same pattern as Phase 15B: `active`, `inactive`, `error`. Token validity is checked periodically. | `meta:check-connection-health` command (from 15B) is extended to also check WhatsApp connections. |
| BR-07 | The WhatsApp integration is gated behind `module.whatsapp` module entitlement. | Same pattern as `module.meta_leads` in Phase 15B. |

### 3.2 Template Management Rules

| Rule ID | Rule | Detail |
|---|---|---|
| BR-08 | Message templates are created within EducoreOS and submitted to Meta for approval via the Cloud API. Templates are NOT created directly in Meta Business Manager. | EducoreOS is the single interface. Templates are synced to Meta via API. |
| BR-09 | Each template has a `category` set by the tenant: `MARKETING`, `UTILITY`, or `AUTHENTICATION`. The category determines Meta's per-message price and approval criteria. | EducoreOS displays the cost implication per category in the template creation UI. |
| BR-10 | Template `status` lifecycle: `draft` (local only) → `submitted` (sent to Meta) → `approved` / `rejected` by Meta. Only `approved` templates can be used for sending. | Meta typically approves within 24 hours. |
| BR-11 | Templates support **variables** using Meta's `{{1}}`, `{{2}}` numbered placeholder syntax. EducoreOS maps these to named variables for usability (e.g., `{{1}}` = lead_name, `{{2}}` = course_name). | The variable mapping is stored in EducoreOS. Meta only sees `{{1}}`, `{{2}}`. |
| BR-12 | Templates support a **header** (text or media: image/video/document), a **body** (text with variables), a **footer** (text), and **buttons** (Quick Reply or Call-to-Action). | Phase 15D-I supports text headers and body with variables. Media headers deferred to 15D-II. |
| BR-13 | Template names must be lowercase, alphanumeric with underscores only, unique per WABA. | Meta enforces this. EducoreOS validates before submission. |
| BR-14 | Rejected templates include a rejection reason from Meta. The tenant can edit and resubmit. | Rejection reasons are displayed in the template management UI. |
| BR-15 | Templates are tenant-scoped. Tenant A cannot see or use Tenant B's templates. | Each tenant's templates are associated with their own WABA. |
| BR-16 | EducoreOS provides a set of **platform-suggested template texts** for common education CRM use cases. Tenants can use these as starting points and customize. | Suggestions, not enforced. Examples: "demo class confirmation", "admission update", "follow-up reminder". |

### 3.3 Message Sending Rules

| Rule ID | Rule | Detail |
|---|---|---|
| BR-17 | Messages can only be sent using **approved templates**. Free-form messages are not supported in Phase 15D-I (requires inbound message to open 24h window). | The send UI only shows approved templates in the dropdown. |
| BR-18 | The recipient's phone number must be in international format with country code (e.g., `+919876543210`). The lead's `phone` field is validated/formatted before sending. | Phone numbers without country code are rejected with a clear error. |
| BR-19 | Every sent message is recorded in a `whatsapp_messages` table with: template used, recipient, variables filled, send status, delivery status, timestamps. | This is the audit trail for WhatsApp communications. |
| BR-20 | If Phase 15C-I is complete, every sent message also creates a `whatsapp` activity on the lead via `LogLeadActivityUseCase` with outcome = `sent`. The outcome is updated to `delivered` or `read` when delivery webhooks arrive. | Graceful degradation: if 15C-I is not complete, messages are still tracked in `whatsapp_messages` but not as lead activities. |
| BR-21 | Sending failures (invalid number, template not approved, rate limited) are captured and displayed to the counselor immediately. The message record is marked as `failed` with the error reason. | No silent failures. |
| BR-22 | New WhatsApp Business numbers start with a messaging limit of 250 messages per 24 hours. This scales automatically based on Meta's quality rating. EducoreOS does NOT enforce this limit — Meta enforces it via API errors. | EducoreOS displays the tenant's current messaging tier in the settings page (fetched from Meta's API). |

### 3.4 Notification Channel Rules

| Rule ID | Rule | Detail |
|---|---|---|
| BR-23 | `WhatsAppChannel` is added to the Phase 14 `NotificationDispatcher` as a third channel alongside `EmailChannel` and `InAppChannel`. | The dispatcher routes to WhatsApp when the notification type is configured for WhatsApp delivery AND the tenant has an active WhatsApp connection AND the recipient has a valid phone number. |
| BR-24 | Not all notification types should default to WhatsApp. Only CRM-specific notifications (follow-up reminders, escalations, automation rule notifications) are WhatsApp-eligible. Billing, security, and system notifications remain email + in-app only. | A new `NotificationChannelType::WHATSAPP` value is added. Per-notification-type channel configuration determines eligibility. |
| BR-25 | Each WhatsApp-eligible notification type must be mapped to an approved template. The tenant configures this mapping in CRM Settings: "For follow-up reminders, use template X." | If no template is mapped, WhatsApp delivery is skipped for that notification type (falls back to email + in-app). |
| BR-26 | WhatsApp delivery via the `NotificationDispatcher` is asynchronous — dispatched as a queued job on the `notifications-default` queue. | Same pattern as `EmailChannel`. |
| BR-27 | If WhatsApp delivery fails (no connection, template not approved, invalid phone), the notification still delivers via email + in-app. WhatsApp is additive, not exclusive. | WhatsApp failure NEVER blocks other channels. |
| BR-28 | Notification preferences (Phase 14) are extended: users can opt out of WhatsApp notifications for opt-out-eligible categories (system). Mandatory categories (billing, security) are not delivered via WhatsApp in Phase 15D-I regardless. | The preference system gains a `whatsapp` channel option. |

### 3.5 Delivery Status Rules

| Rule ID | Rule | Detail |
|---|---|---|
| BR-29 | Meta sends delivery status webhooks to EducoreOS: `sent`, `delivered`, `read`, `failed`. These are received on the same webhook endpoint as 15B (or a separate WhatsApp webhook endpoint). | The webhook handler updates the `whatsapp_messages` record and the linked activity outcome. |
| BR-30 | Delivery statuses are: `accepted` (queued by Meta) → `sent` (sent to recipient's device) → `delivered` (received by device) → `read` (opened by recipient). `failed` can occur at any stage. | Each status transition updates the record. |
| BR-31 | The counselor can see the delivery status on the lead detail page: a small icon/badge next to each WhatsApp message (✓ sent, ✓✓ delivered, ✓✓ blue = read, ✗ failed). | Familiar WhatsApp UX pattern. |

---

## 4. WhatsApp Cloud API — Technical Reference

### 4.1 Embedded Signup Flow

Meta's Embedded Signup allows tenants to create or connect a WABA directly within EducoreOS's UI without leaving the platform. The flow uses Meta's JavaScript SDK.

**Frontend:**
1. Load Meta's JavaScript SDK
2. Call `FB.login()` with the `whatsapp_business_management` and `whatsapp_business_messaging` permissions
3. On success, receive a temporary auth code
4. Send the code to EducoreOS backend

**Backend:**
1. Exchange the code for a token
2. Use the token to list the tenant's WABA(s) and phone numbers
3. Generate a **System User Access Token** via the Business Management API (permanent, non-expiring)
4. Store the System User token, WABA ID, and Phone Number ID
5. Register the webhook for message status updates
6. Mark connection as `active`

### 4.2 Sending a Template Message

```
POST https://graph.facebook.com/v21.0/{phone_number_id}/messages
Authorization: Bearer {system_user_access_token}
Content-Type: application/json

{
    "messaging_product": "whatsapp",
    "to": "919876543210",
    "type": "template",
    "template": {
        "name": "demo_class_confirmation",
        "language": { "code": "en" },
        "components": [
            {
                "type": "body",
                "parameters": [
                    { "type": "text", "text": "Rahul" },
                    { "type": "text", "text": "Science Batch" },
                    { "type": "text", "text": "March 30, 2026 at 10:00 AM" }
                ]
            }
        ]
    }
}
```

Response:
```json
{
    "messaging_product": "whatsapp",
    "contacts": [{ "input": "919876543210", "wa_id": "919876543210" }],
    "messages": [{ "id": "wamid.HBgLMTIzNDU2Nzg5MA==" }]
}
```

The `messages[0].id` (wamid) is stored as the message's `meta_message_id` for delivery status correlation.

### 4.3 Template Management API

**Create template:**
```
POST https://graph.facebook.com/v21.0/{waba_id}/message_templates
Authorization: Bearer {system_user_access_token}

{
    "name": "demo_class_confirmation",
    "language": "en",
    "category": "UTILITY",
    "components": [
        {
            "type": "BODY",
            "text": "Hi {{1}}, your demo class for {{2}} is confirmed on {{3}}. We look forward to seeing you!",
            "example": {
                "body_text": [["Rahul", "Science Batch", "March 30 at 10 AM"]]
            }
        },
        {
            "type": "FOOTER",
            "text": "Reply STOP to opt out"
        }
    ]
}
```

**Check template status:**
```
GET https://graph.facebook.com/v21.0/{waba_id}/message_templates
  ?name=demo_class_confirmation
  &access_token={token}
```

Response includes `status`: `APPROVED`, `REJECTED`, `PENDING`, `DISABLED`.

### 4.4 Delivery Status Webhooks

Meta sends POST requests to the registered webhook when message status changes:

```json
{
    "entry": [{
        "id": "WABA_ID",
        "changes": [{
            "field": "messages",
            "value": {
                "messaging_product": "whatsapp",
                "metadata": { "phone_number_id": "PHONE_NUMBER_ID" },
                "statuses": [{
                    "id": "wamid.HBgLMTIzNDU2Nzg5MA==",
                    "status": "delivered",
                    "timestamp": "1711432800",
                    "recipient_id": "919876543210"
                }]
            }
        }]
    }]
}
```

The `id` field is the `wamid` from the send response — used to correlate with the `whatsapp_messages` record.

### 4.5 Webhook Configuration

WhatsApp status webhooks can share the same Meta App webhook URL as Phase 15B's Lead Ads webhooks. The `object` field differentiates: `page` for Lead Ads, `whatsapp_business_account` for WhatsApp.

Alternatively, a separate webhook URL can be registered. The developer must decide in the implementation plan which approach is cleaner. Both are architecturally valid.

---

## 5. Domain Model

### 5.1 Bounded Context Placement

The WhatsApp integration lives within `TenantAdminDashboard/LeadManagement/WhatsAppIntegration/` — a sub-context alongside `MetaIntegration/` (15B).

### 5.2 New Domain Layer Components

**Path:** `app/Domain/TenantAdminDashboard/LeadManagement/WhatsAppIntegration/`

| Component | Type | Purpose |
|---|---|---|
| `WhatsAppConnectionEntity` | Entity | Represents a tenant's WABA connection. Holds waba_id, phone_number_id, phone_number_display, connection_status. |
| `WhatsAppTemplateEntity` | Entity | Represents a message template. Holds name, category, components (header/body/footer/buttons), variable mappings, meta_template_id, status. |
| `WhatsAppMessageEntity` | Entity | Represents a sent message. Holds recipient, template used, variables, meta_message_id, delivery_status, timestamps. |
| `WhatsAppConnectionStatus` | Value Object | `active`, `inactive`, `error`. |
| `WhatsAppTemplateStatus` | Value Object | `draft`, `pending`, `approved`, `rejected`, `disabled`. |
| `WhatsAppTemplateCategory` | Value Object | `MARKETING`, `UTILITY`, `AUTHENTICATION`. Includes `estimatedCostInr(): string` for UI display. |
| `WhatsAppDeliveryStatus` | Value Object | `accepted`, `sent`, `delivered`, `read`, `failed`. Includes transition rules. |
| `WhatsAppVariableMapping` | Value Object | Maps Meta's `{{1}}`, `{{2}}` to named variables (`lead_name`, `course_name`). Immutable. |
| `WhatsAppConnectionEstablished` | Domain Event | Dispatched when WABA is connected. |
| `WhatsAppConnectionRevoked` | Domain Event | Dispatched when connection becomes invalid. |
| `WhatsAppTemplateSynced` | Domain Event | Dispatched when template status updates from Meta (approved/rejected). |
| `WhatsAppMessageSent` | Domain Event | Dispatched when a message is successfully queued with Meta. |
| `WhatsAppMessageDelivered` | Domain Event | Dispatched when delivery status reaches `delivered` or `read`. |
| `WhatsAppConnectionRepositoryInterface` | Repository Interface | CRUD for WABA connections. |
| `WhatsAppTemplateRepositoryInterface` | Repository Interface | CRUD for templates. |
| `WhatsAppMessageRepositoryInterface` | Repository Interface | CRUD for sent messages. Delivery status updates. |

### 5.3 New Application Layer Components

**Path:** `app/Application/TenantAdminDashboard/LeadManagement/WhatsAppIntegration/`

| Component | Type | Purpose |
|---|---|---|
| `ConnectWhatsAppUseCase` | Use Case | Handles Embedded Signup callback: exchanges token, stores WABA connection, registers webhook. |
| `DisconnectWhatsAppUseCase` | Use Case | Removes WABA connection, deletes token. Templates are preserved (marked orphaned). |
| `CreateWhatsAppTemplateUseCase` | Use Case | Creates template locally (draft), optionally submits to Meta immediately. |
| `SubmitWhatsAppTemplateUseCase` | Use Case | Submits a draft template to Meta for approval via API. Updates status to `pending`. |
| `SyncWhatsAppTemplateStatusUseCase` | Use Case | Fetches template status from Meta API, updates local record. Called by scheduled command. |
| `DeleteWhatsAppTemplateUseCase` | Use Case | Deletes template from Meta (if submitted) and locally. |
| `SendWhatsAppMessageUseCase` | Use Case | Sends a template message to a lead's phone number. Creates message record. Logs activity (if 15C-I available). Dispatches `WhatsAppMessageSent`. |
| `ProcessWhatsAppStatusWebhookUseCase` | Use Case | Handles delivery status webhooks. Updates message record. Updates activity outcome (if linked). |
| `ListWhatsAppTemplatesQuery` | Query | Paginated list of templates for the tenant. Filterable by status, category. |
| `ListWhatsAppMessagesQuery` | Query | Paginated list of sent messages for a lead. |
| `SyncWhatsAppTemplateStatusCommand` | Console Command | `whatsapp:sync-template-status`. Runs hourly. Syncs template statuses from Meta for all tenants. |

### 5.4 New Infrastructure Layer — WhatsApp Notification Channel

**Path:** `app/Infrastructure/Shared/Notification/Channels/`

| Component | Type | Purpose |
|---|---|---|
| `WhatsAppChannel` | Channel | Implements the same interface as `EmailChannel` and `InAppChannel`. Receives `NotificationPayload`, resolves the tenant's WABA connection, maps notification data to a template, sends via Cloud API. |

**Path:** `app/Infrastructure/Shared/Jobs/`

| Component | Type | Purpose |
|---|---|---|
| `SendWhatsAppNotificationJob` | Queued Job | Dispatched by `WhatsAppChannel`. Handles actual API call and error handling. `notifications-default` queue. |
| `SendWhatsAppDirectMessageJob` | Queued Job | Dispatched by `SendWhatsAppMessageUseCase` for manual sends from lead detail. `notifications-high` queue. |

### 5.5 HTTP Layer

**Webhook Controller (extends or parallels 15B):**

| Endpoint | Method | Purpose | Auth |
|---|---|---|---|
| `POST /api/webhooks/meta/whatsapp` | `handle` | Receive WhatsApp status webhooks | None (public, signature-verified) |
| `GET /api/webhooks/meta/whatsapp` | `verify` | Meta webhook verification challenge | None (public, verify token check) |

**Tenant Admin Controllers:**

`app/Http/Controllers/Api/TenantAdminDashboard/LeadManagement/WhatsAppIntegration/`

| Endpoint | Method | Capability |
|---|---|---|
| `POST /api/tenant/whatsapp/connect` | Handle Embedded Signup callback | `whatsapp.connect` |
| `DELETE /api/tenant/whatsapp/connection` | Disconnect WABA | `whatsapp.connect` |
| `GET /api/tenant/whatsapp/connection` | Get connection status + phone number + messaging tier | `whatsapp.view` |
| `GET /api/tenant/whatsapp/templates` | List templates | `whatsapp.view` |
| `POST /api/tenant/whatsapp/templates` | Create template (draft) | `whatsapp.manage` |
| `PUT /api/tenant/whatsapp/templates/{id}` | Edit draft/rejected template | `whatsapp.manage` |
| `POST /api/tenant/whatsapp/templates/{id}/submit` | Submit to Meta for approval | `whatsapp.manage` |
| `DELETE /api/tenant/whatsapp/templates/{id}` | Delete template | `whatsapp.manage` |
| `POST /api/tenant/leads/{lead}/whatsapp/send` | Send template message to lead | `whatsapp.send` |
| `GET /api/tenant/leads/{lead}/whatsapp/messages` | List sent messages for lead | `whatsapp.view` |

**Capability Codes:**

| Code | Who Has It | Purpose |
|---|---|---|
| `whatsapp.connect` | Admins only | Connect/disconnect WABA |
| `whatsapp.manage` | Admins only | Create, edit, delete, submit templates |
| `whatsapp.view` | Admins, Branch Managers | View connection, templates, message history |
| `whatsapp.send` | Counselors, Branch Managers, Admins | Send WhatsApp messages to leads |

---

## 6. Database Schema

### 6.1 New Tables

**`whatsapp_connections`** (tenant-scoped, one per tenant)

| Column | Type | Notes |
|---|---|---|
| `id` | BIGINT UNSIGNED PK | Auto-increment |
| `tenant_id` | BIGINT UNSIGNED NOT NULL UNIQUE | FK → `tenants.id`. One connection per tenant. |
| `waba_id` | VARCHAR(50) NOT NULL | WhatsApp Business Account ID. |
| `phone_number_id` | VARCHAR(50) NOT NULL | Meta's Phone Number ID (used in API calls). |
| `phone_number_display` | VARCHAR(20) NOT NULL | The actual phone number for display (e.g., +91 98765 43210). |
| `business_name` | VARCHAR(255) NULLABLE | The WABA business name. |
| `system_user_token` | TEXT NOT NULL | Encrypted. System User Access Token (permanent). |
| `connection_status` | VARCHAR(20) NOT NULL DEFAULT 'active' | `active`, `inactive`, `error`. |
| `status_reason` | VARCHAR(255) NULLABLE | Why inactive/error. |
| `messaging_tier` | VARCHAR(50) NULLABLE | Current messaging limit tier (e.g., "TIER_250", "TIER_1K", "UNLIMITED"). Synced from Meta. |
| `quality_rating` | VARCHAR(20) NULLABLE | Meta's quality rating: `GREEN`, `YELLOW`, `RED`. |
| `connected_by` | BIGINT UNSIGNED NOT NULL | FK → `users.id`. |
| `created_at` | TIMESTAMP | |
| `updated_at` | TIMESTAMP | |

---

**`whatsapp_templates`** (tenant-scoped)

| Column | Type | Notes |
|---|---|---|
| `id` | BIGINT UNSIGNED PK | Auto-increment |
| `tenant_id` | BIGINT UNSIGNED NOT NULL | FK → `tenants.id`. |
| `meta_template_id` | VARCHAR(50) NULLABLE | Meta's template ID (set after submission). NULL for drafts. |
| `name` | VARCHAR(100) NOT NULL | Template name (lowercase, alphanumeric + underscores). Unique per tenant. |
| `display_name` | VARCHAR(255) NOT NULL | Human-readable name shown in EducoreOS UI. |
| `category` | VARCHAR(20) NOT NULL | `MARKETING`, `UTILITY`, `AUTHENTICATION`. |
| `language` | VARCHAR(10) NOT NULL DEFAULT 'en' | Template language code. |
| `header_type` | VARCHAR(20) NULLABLE | `text` or NULL. (Media headers deferred.) |
| `header_text` | VARCHAR(60) NULLABLE | Header text (if header_type = text). |
| `body_text` | TEXT NOT NULL | Body text with `{{1}}`, `{{2}}` placeholders. |
| `footer_text` | VARCHAR(60) NULLABLE | Footer text. |
| `buttons` | JSON NULLABLE | Button configuration (Quick Reply or CTA). |
| `variable_mappings` | JSON NOT NULL DEFAULT '{}' | Maps `{"1": "lead_name", "2": "course_name"}`. |
| `example_values` | JSON NULLABLE | Example values for Meta approval (required by Meta). |
| `status` | VARCHAR(20) NOT NULL DEFAULT 'draft' | `draft`, `pending`, `approved`, `rejected`, `disabled`. |
| `rejection_reason` | TEXT NULLABLE | Meta's rejection reason (if rejected). |
| `created_at` | TIMESTAMP | |
| `updated_at` | TIMESTAMP | |

**Indexes:**
- `unq_whatsapp_templates_name` → `(tenant_id, name)` UNIQUE
- `idx_whatsapp_templates_status` → `(tenant_id, status)`

---

**`whatsapp_messages`** (tenant-scoped)

| Column | Type | Notes |
|---|---|---|
| `id` | BIGINT UNSIGNED PK | Auto-increment |
| `tenant_id` | BIGINT UNSIGNED NOT NULL | FK → `tenants.id`. |
| `lead_id` | BIGINT UNSIGNED NOT NULL | FK → `leads.id`. |
| `template_id` | BIGINT UNSIGNED NOT NULL | FK → `whatsapp_templates.id`. |
| `meta_message_id` | VARCHAR(100) NULLABLE | Meta's `wamid`. Set after successful send. Used for status correlation. |
| `recipient_phone` | VARCHAR(20) NOT NULL | The phone number the message was sent to. |
| `variables_used` | JSON NOT NULL | The actual variable values sent: `{"1": "Rahul", "2": "Science Batch"}`. |
| `sent_by` | BIGINT UNSIGNED NULLABLE | FK → `users.id`. NULL for system-sent (automation/notification). |
| `sent_via` | VARCHAR(20) NOT NULL DEFAULT 'manual' | `manual` (counselor sent from UI), `notification` (via NotificationDispatcher), `automation` (via 15C-III rule). |
| `delivery_status` | VARCHAR(20) NOT NULL DEFAULT 'queued' | `queued`, `accepted`, `sent`, `delivered`, `read`, `failed`. |
| `failure_reason` | TEXT NULLABLE | Meta's error detail if failed. |
| `linked_activity_id` | BIGINT UNSIGNED NULLABLE | FK → `lead_activities.id`. Set if 15C-I is complete. |
| `accepted_at` | TIMESTAMP NULLABLE | |
| `sent_at` | TIMESTAMP NULLABLE | |
| `delivered_at` | TIMESTAMP NULLABLE | |
| `read_at` | TIMESTAMP NULLABLE | |
| `failed_at` | TIMESTAMP NULLABLE | |
| `created_at` | TIMESTAMP | When the send was initiated. |

**Indexes:**
- `idx_whatsapp_messages_lead` → `(lead_id, created_at DESC)`
- `idx_whatsapp_messages_meta_id` → `(meta_message_id)` — for webhook status correlation
- `idx_whatsapp_messages_tenant` → `(tenant_id, created_at DESC)`

---

### 6.2 Notification Template Mapping

Extend CRM Settings (15C-I) with WhatsApp template mappings:

| Key | Type | Default | Description |
|---|---|---|---|
| `crm.whatsapp.template.follow_up_reminder` | string (template name) | NULL | Which approved template to use for follow-up reminder notifications |
| `crm.whatsapp.template.escalation_tier_1` | string (template name) | NULL | Template for Tier 1 escalation |
| `crm.whatsapp.template.escalation_tier_2` | string (template name) | NULL | Template for Tier 2 escalation |
| `crm.whatsapp.enabled_for_notifications` | boolean | false | Master toggle for WhatsApp as a notification channel |

If `whatsapp.enabled_for_notifications` is false OR the template mapping is NULL for a given notification type, WhatsApp delivery is skipped.

---

## 7. Notification Channel Integration

### 7.1 WhatsAppChannel Implementation

The `WhatsAppChannel` follows the same contract as `EmailChannel` and `InAppChannel`:

```
WhatsAppChannel::deliver(NotificationPayload $payload): void
    1. Check if tenant has active WhatsApp connection → skip if not
    2. Check if notification type has a mapped template → skip if not
    3. Resolve recipient's phone number → skip if no phone number
    4. Map notification payload data to template variables
    5. Dispatch SendWhatsAppNotificationJob
```

### 7.2 NotificationDispatcher Extension

The `NotificationDispatcher` currently routes to `EmailChannel` and `InAppChannel`. Add `WhatsAppChannel` as a third channel:

```
NotificationDispatcher::dispatch(NotificationPayload $payload):
    1. Check preferences → determine which channels are enabled
    2. Route to InAppChannel (if enabled)
    3. Route to EmailChannel (if enabled)
    4. Route to WhatsAppChannel (if enabled AND tenant has connection AND template mapped)
```

The `NotificationChannelType` value object gains a `WHATSAPP` value.

### 7.3 Notification Preferences Extension

The `notification_preferences` table already supports `(preferable_type, preferable_id, category, channel)`. Adding `whatsapp` as a channel value enables per-user opt-out for WhatsApp notifications.

---

## 8. Platform-Suggested Template Library

EducoreOS provides starter template texts for common education CRM use cases. These are NOT auto-created — they appear as suggestions in the template creation UI that tenants can copy and customize.

| Suggested Name | Category | Body Text | Variables |
|---|---|---|---|
| `demo_class_confirmation` | UTILITY | Hi {{1}}, your demo class for {{2}} is confirmed on {{3}}. We look forward to seeing you! | lead_name, course_name, date_time |
| `follow_up_reminder` | UTILITY | Hi {{1}}, this is a reminder about your upcoming visit on {{2}}. Please confirm your attendance. Reply STOP to opt out. | lead_name, date_time |
| `admission_status_update` | UTILITY | Hi {{1}}, your application for {{2}} has been {{3}}. For details, contact us at {{4}}. | lead_name, course_name, status, phone_number |
| `welcome_new_lead` | MARKETING | Hi {{1}}, thank you for your interest in {{2}}. We'd love to help you find the right course. Our counselor {{3}} will be in touch soon! | lead_name, institution_name, counselor_name |
| `course_offer` | MARKETING | Hi {{1}}, exciting news! {{2}} is now available with a special offer. Enroll before {{3}} to get {{4}}% off! | lead_name, course_name, deadline, discount |

---

## 9. Frontend Requirements

### 9.1 WhatsApp Connection Page

**Location:** CRM Settings → Integrations → WhatsApp Business

**When module is NOT entitled:** Locked state with upgrade prompt.

**When module IS entitled and NOT connected:**
- "Connect WhatsApp Business" button
- Explanation text: "Connect your institution's WhatsApp Business phone number to send template messages to leads. You'll need a phone number not already registered on WhatsApp."
- Clicking triggers Meta's Embedded Signup flow (JavaScript SDK popup)

**When connected:**
- Connection card showing: phone number, business name, status badge, quality rating, messaging tier, connected by, connected date
- "Disconnect" button (with confirmation)
- Link to Template Management

### 9.2 Template Management Page

**Location:** CRM Settings → Integrations → WhatsApp Business → Templates

- Table: Name, Category (with cost badge), Status (Draft/Pending/Approved/Rejected), Created date
- "Create Template" button → opens template builder form
- Template builder: name, display name, category dropdown (with cost note per category), language, header (optional text), body (text area with variable insertion buttons), footer (optional), buttons (optional Quick Reply/CTA)
- Variable insertion: click `{lead_name}` button → inserts `{{1}}` at cursor and adds mapping
- Example values section (required for Meta approval)
- "Save as Draft" and "Submit for Approval" buttons
- Rejected templates: show rejection reason, allow edit and resubmit

### 9.3 Lead Detail — WhatsApp Section

**On lead detail page**, add a "Send WhatsApp" action:

1. Button: "Send WhatsApp" (visible if counselor has `whatsapp.send` capability AND tenant has active connection)
2. Click opens a modal: select approved template from dropdown → preview with variables auto-filled from lead data → "Send" button
3. After sending: message appears in lead's activity feed (if 15C-I) or in a "WhatsApp Messages" tab
4. Delivery status icons: ✓ (sent), ✓✓ (delivered), ✓✓ blue (read), ✗ (failed)

### 9.4 CRM Settings — WhatsApp Notification Mapping

**Location:** CRM Settings → WhatsApp Business → Notification Templates

- Toggle: "Enable WhatsApp for CRM notifications" (master switch)
- Mapping table: Notification Type (Follow-up Reminder, Escalation Tier 1, Escalation Tier 2) → Template dropdown (approved templates only) → Status (Mapped/Not mapped)
- Warning if a mapped template is later rejected/disabled by Meta

---

## 10. Scheduled Commands

| Command | Schedule | Purpose |
|---|---|---|
| `whatsapp:sync-template-status` | Hourly | Fetch template statuses from Meta for all tenants with active connections. Update local records. Notify tenant admin if a template is disabled. |
| `meta:check-connection-health` (extended from 15B) | Every 6 hours | Extended to also validate WhatsApp connections by checking the phone number status via API. |

---

## 11. Security Boundaries

### 11.1 Tenant Isolation

- Each tenant has their own WABA, their own phone number, their own templates, their own messages. Zero shared resources.
- Templates are scoped by `tenant_id`. Messages are scoped by `tenant_id`. Connections are unique per `tenant_id`.
- The webhook handler resolves the tenant from the WABA ID in the webhook payload.

### 11.2 Token Security

- System User Access Tokens are encrypted at rest (`Crypt::encryptString()`).
- Tokens are NEVER in API responses, logs, or error messages.
- Token is decrypted only at the moment of the Cloud API call, in memory, within the queued job.

### 11.3 Data Privacy

- WhatsApp messages may contain PII (lead names, phone numbers). The `whatsapp_messages` table is tenant-scoped and follows the same access control as lead data.
- Delivery status webhooks are verified using Meta's `X-Hub-Signature-256` header.
- Message content is not stored in webhooks — only status updates. The original message content is already in the `whatsapp_messages` record.

---

## 12. Implementation Plan Requirements

| # | Section | Content |
|---|---|---|
| 1 | Executive Summary | What gets built, what does NOT |
| 2 | Dependency Verification | Verify: Phase 14 NotificationDispatcher architecture, Phase 15B Meta App webhook configuration, existing `LeadActivityType` value object (15C-I). Check if WhatsApp permissions are already on the Meta Developer App or need to be added. |
| 3 | Architecture Decisions | Any deviations from this spec. Webhook strategy: shared endpoint with 15B or separate. |
| 4 | Migration Plan | New tables. Exact SQL. CRM Settings keys. |
| 5 | Domain Layer | Entities, value objects, events |
| 6 | Application Layer | UseCases, services, console commands |
| 7 | Infrastructure Layer | Eloquent models, repositories, WhatsAppChannel, queued jobs, Cloud API HTTP client |
| 8 | HTTP Layer | Webhook controller, tenant controllers, form requests, resources, routes |
| 9 | Notification Channel Integration | WhatsAppChannel implementation, NotificationDispatcher extension, preference extension |
| 10 | Embedded Signup Flow | Frontend SDK integration, backend callback processing, token generation |
| 11 | Template Management | CRUD, Meta API submission, status sync, variable mapping |
| 12 | Message Sending | Send flow, delivery status webhook processing, activity logging |
| 13 | Frontend Specification | Connection page, template builder, lead detail WhatsApp section, settings |
| 14 | Scheduled Commands | Template sync, connection health |
| 15 | Implementation Sequence | Ordered steps with dependencies and day estimates |
| 16 | Test Plan | Every test file with description |
| 17 | Quality Gate Verification | Checklist from §13 |
| 18 | File Manifest | Every new and modified file |

---

## 13. Quality Gates (Must Pass Before WhatsApp Goes Live)

### 13.1 Connection Gates

- [ ] Embedded Signup flow completes: tenant connects WABA with phone number
- [ ] System User token is encrypted at rest — verified by checking database
- [ ] Token never appears in API responses or logs
- [ ] Connection status displays correctly (active/inactive/error)
- [ ] Disconnection removes token, preserves templates and message history
- [ ] Health check detects invalid connections and marks inactive

### 13.2 Template Gates

- [ ] Template created as draft (local only, not sent to Meta)
- [ ] Template submitted to Meta — status changes to `pending`
- [ ] Approved template shows as `approved` after sync
- [ ] Rejected template shows rejection reason — can be edited and resubmitted
- [ ] Template name validation: lowercase, alphanumeric, underscores only
- [ ] Variable mappings stored and displayed correctly
- [ ] Only approved templates appear in the send dropdown

### 13.3 Sending Gates

- [ ] Manual send from lead detail: counselor selects template, fills variables, sends successfully
- [ ] Message appears in lead's WhatsApp message history
- [ ] If 15C-I complete: message logged as `whatsapp` activity with outcome = `sent`
- [ ] Delivery status webhook updates: sent → delivered → read (verified with Meta's test tools)
- [ ] Failed send shows clear error to counselor
- [ ] Invalid phone number rejected before API call

### 13.4 Notification Channel Gates

- [ ] `WhatsAppChannel` delivers notifications when: connection active + template mapped + phone exists
- [ ] `WhatsAppChannel` gracefully skips when: no connection, no template, no phone
- [ ] WhatsApp failure does NOT block email/in-app delivery
- [ ] Follow-up reminder delivers via WhatsApp when configured
- [ ] User can opt out of WhatsApp notifications (system category)
- [ ] WhatsApp master toggle (enabled_for_notifications) respected

### 13.5 Security Gates

- [ ] Tenant isolation: Tenant A cannot see Tenant B's templates, messages, or connection
- [ ] Webhook signature verification: invalid signatures rejected
- [ ] Module entitlement enforced: tenant without `module.whatsapp` cannot access features
- [ ] All template/message operations audit-logged

### 13.6 Regression Gates

- [ ] All existing notification tests pass (email + in-app unaffected)
- [ ] All Phase 15C tests pass (activities, scoring, automation)
- [ ] Phase 15B Meta Lead Ads unaffected
- [ ] PHPStan Level 5 passes with 0 new errors

---

## 14. Constraints & Reminders

### Architecture Constraints

- **WhatsApp is a CHANNEL, not a feature.** It extends the existing `NotificationDispatcher` — it does NOT create a parallel notification system. The `WhatsAppChannel` receives the same `NotificationPayload` as `EmailChannel`.
- **Template messages only in Phase 15D-I.** Do NOT implement free-form messaging. Without inbound message support (15D-II), there is no 24-hour window to send free-form messages. Templates are the only legal outbound mechanism.
- **Send via queued job, never synchronously.** The Cloud API call happens in a queued job. The counselor's "Send" click dispatches the job and shows "Sending..." — the UI updates via polling or optimistic update.
- **Each tenant pays their own Meta costs.** EducoreOS does NOT intercept, markup, or subsidize Meta's per-message charges. The cost is between the tenant and Meta via their WABA.
- **No external API calls inside database transactions.** Same as all previous phases.
- **Audit logs OUTSIDE transactions.** Same as all previous phases.

### Docker Environment

- Container: Alpine Linux — use `sh` not `bash`
- Container name: `ubotz_backend`
- Queue: Redis DB 3

### What NOT to Do

- Do NOT build an inbound message inbox. Phase 15D-II scope.
- Do NOT implement bulk broadcast to multiple leads. Phase 15D-II scope.
- Do NOT send free-form messages. Only template messages in Phase 15D-I.
- Do NOT store tokens in plaintext.
- Do NOT make synchronous Cloud API calls from controllers.
- Do NOT bypass the `NotificationDispatcher` for WhatsApp delivery. Use the channel architecture.
- Do NOT create templates directly in Meta Business Manager — EducoreOS is the single management interface.
- Do NOT use unofficial WhatsApp APIs or workarounds. Official Cloud API only. Unofficial APIs risk phone number bans and violate Meta's terms.
- Do NOT absorb or relay Meta's per-message billing. Each tenant's WABA is billed directly by Meta.
- Do NOT implement media message headers (image/video/document in template headers). Text headers only in Phase 15D-I.

---

## 15. Definition of Done

Phase 15D-I is complete when:

1. The implementation plan has been reviewed and approved by the Principal Engineer.
2. All code is implemented per the approved plan.
3. All quality gates in §13 pass.
4. A Principal Engineer audit confirms zero critical or high findings.
5. All findings from audit are resolved.
6. End-to-end demonstration:
   a. Tenant admin connects WABA via Embedded Signup → connection shows as active with phone number.
   b. Tenant admin creates a "demo class confirmation" template → submits to Meta → approved within 24 hours.
   c. Counselor opens a lead → clicks "Send WhatsApp" → selects the approved template → variables auto-fill from lead data → sends.
   d. Message delivery status updates: sent → delivered → read (verified in lead detail UI).
   e. Message is logged as a `whatsapp` activity on the lead (if 15C-I complete).
   f. Tenant admin maps the template to "follow-up reminder" notification type → enables WhatsApp notifications → a follow-up reminder delivers via WhatsApp.
   g. Tenant without `module.whatsapp` cannot access any WhatsApp features.
7. Zero regression in existing test suite.
8. PHPStan Level 5 passes with 0 new errors.
9. The Phase 15D-I Completion Report is signed off.

---

*End of Document — UBOTZ 2.0 Phase 15D-I Developer Instructions — March 26, 2026*
