# UBOTZ 2.0 — Phase 15B Developer Instructions

## Meta Lead Ads Integration (Facebook + Instagram)

| Field | Value |
|---|---|
| **Document Type** | Developer Instruction (Pre-Implementation Brief) |
| **Phase** | 15B |
| **Date** | March 26, 2026 |
| **Issued By** | Principal Engineer / Architecture Auditor |
| **Audience** | Implementation Developer (Antigravity) |
| **Expected Deliverable** | Phase 15B Implementation Plan |
| **Prerequisites** | Phase 15A COMPLETE (Lead Management with pipeline, auto-assign, source tracking), Phase 14 COMPLETE (Notification Infrastructure), Meta Business Verification COMPLETE, Facebook Developer App CREATED |
| **Parallel With** | Phase 15C (CRM Automation) — no dependency in either direction |

> **This phase connects EducoreOS to Meta's Lead Ads platform. When a prospect fills out a lead form on a tenant's Facebook or Instagram ad, the lead appears in the tenant's CRM Kanban board within seconds — auto-assigned, scored (if 15C-II is live), and ready for counselor action. This is a multi-tenant OAuth integration with webhook fan-out: one EducoreOS webhook endpoint, many tenants, each with their own Facebook Page. Build it secure, build it resilient.**

---

## 1. Mission Statement

Phase 15B builds a **native Meta Lead Ads integration** that allows each tenant to connect their Facebook Page(s) to EducoreOS and receive leads from Facebook and Instagram Lead Ads in real-time.

The integration follows Meta's recommended webhook architecture: Meta sends a notification to EducoreOS's webhook endpoint when a lead form is submitted → EducoreOS resolves the tenant from the Facebook Page ID → fetches the full lead data from Meta's Graph API → creates a Lead record in the tenant's CRM pipeline.

**What this phase includes:**
- Per-tenant OAuth flow for connecting Facebook Pages (self-service from Tenant Admin Dashboard)
- Secure token storage with encryption at rest
- Token refresh and re-authorization flow
- Meta webhook endpoint (single URL, fan-out to tenants by Page ID)
- Webhook signature verification
- Lead data retrieval from Meta Graph API on webhook trigger
- Field mapping: standard fields (name, email, phone) to lead columns, custom form fields to `leads.metadata` JSON
- Lead creation through existing `CreateLeadUseCase` with source = `facebook_ads` or `instagram_ads`
- Auto-assign, scoring, and automation rule triggers (if 15C phases are complete — graceful degradation if not)
- Facebook Page connection management UI (connect, disconnect, view status)
- Integration health monitoring (last webhook received, connection status, error log)
- Plan-gated via `module.meta_leads` capability/module entitlement
- Meta App Review submission preparation (permission justifications, screen recording checklist)

**What this phase does NOT include:**
- WhatsApp Business API integration (separate phase — different API, different permission set)
- Sending messages back to leads via Facebook Messenger
- Meta Conversions API (reporting conversions back to Meta for ad optimization)
- Meta Custom Audience sync (pushing CRM segments back to Meta for retargeting)
- Creating or managing Facebook ad campaigns from within EducoreOS
- Lead form builder within EducoreOS (tenants create lead forms in Meta Ads Manager)
- Google Ads lead form integration (separate phase, different API entirely)

---

## 2. Business Context

### 2.1 Current State

Tenants run Facebook and Instagram ads with Lead Ad forms. When a prospect submits the form, the lead data sits inside Meta's platform. Tenants must either:
- Manually download CSV files from Facebook and upload them to EducoreOS (hours of delay, error-prone)
- Use third-party connectors like Zapier or LeadsBridge (₹1,500–₹5,000/month additional cost, another tool to manage)
- Ignore Facebook leads entirely and rely only on website forms

All three options are bad. The first loses leads to delay (studies show responding within 5 minutes increases conversion 10x). The second adds cost and complexity. The third wastes ad spend.

### 2.2 What Changes

After Phase 15B:
1. Tenant admin connects their Facebook Page to EducoreOS via a one-click OAuth flow in CRM Settings.
2. When a prospect submits a Lead Ad form on Facebook or Instagram, EducoreOS receives the lead data in real-time (typically within 5–15 seconds).
3. A Lead record is automatically created in the tenant's CRM pipeline with source `facebook_ads` or `instagram_ads`, the prospect's form responses mapped to lead fields and metadata, and the lead auto-assigned to a counselor.
4. If Phase 15C is live, the lead is immediately scored and any automation rules (e.g., "website lead → auto follow-up in 2 hours") fire for Meta leads too.
5. The counselor sees the new lead on the Kanban board with all form data — they can call within minutes of the ad submission.

### 2.3 Why This Matters for EducoreOS's Market Position

Most education-specific platforms in India (Meritto, Leadsquared, Extraaedge) offer Meta Lead Ads integration as a premium feature. It's a significant differentiator. For coaching centers and online academies spending ₹50,000–₹5,00,000/month on Facebook/Instagram ads, native lead capture is the single most impactful CRM feature — it directly reduces cost-per-admission by eliminating lead leakage and response delay.

---

## 3. Business Rules (NON-NEGOTIABLE)

### 3.1 OAuth & Connection Rules

| Rule ID | Rule | Detail |
|---|---|---|
| BR-01 | Each tenant connects their own Facebook Page(s) via OAuth. EducoreOS does NOT have a shared/platform-level Facebook credential. | Per-tenant token isolation. One tenant's token compromise does not affect others. |
| BR-02 | A tenant can connect multiple Facebook Pages (e.g., one per branch). Each Page connection is stored as a separate record. | `meta_page_connections` table with `tenant_id` + `page_id`. |
| BR-03 | A Facebook Page can only be connected to ONE tenant at a time. If Page X is connected to Tenant A and Tenant B tries to connect the same Page, the system rejects it with a clear error message. | Unique constraint on `page_id` across all tenants. Prevents webhook routing ambiguity. |
| BR-04 | OAuth tokens are encrypted at rest using Laravel's encryption. Tokens are NEVER logged, NEVER included in API responses, NEVER exposed to the frontend. | The frontend only sees connection status (connected/disconnected), Page name, and Page ID — never the token. |
| BR-05 | When a tenant disconnects a Facebook Page, the token is immediately deleted from the database. The webhook mapping is removed. Existing leads created from that Page are NOT deleted. | Disconnection is a forward-only action. Historical data is preserved. |
| BR-06 | If a token becomes invalid (user revoked access, token expired), the system marks the connection as `inactive` and sends a notification to the tenant admin to re-authorize. | `connection_status`: `active`, `inactive`, `error`. |
| BR-07 | The Meta Lead Ads integration is gated behind the `module.meta_leads` module entitlement. Tenants whose plan does not include this module cannot access the connection UI or receive leads via webhook. | Same module/capability gating pattern as `module.website` in Phase 13A. |

### 3.2 Webhook Rules

| Rule ID | Rule | Detail |
|---|---|---|
| BR-08 | EducoreOS exposes a single webhook endpoint for all tenants: `POST /api/webhooks/meta/leadgen`. Meta sends notifications to this URL for all connected Pages. | The endpoint is public (no auth middleware) but signature-verified. |
| BR-09 | Every incoming webhook request MUST be verified using Meta's signature verification (`X-Hub-Signature-256` header with SHA-256 HMAC of the payload using the App Secret). Unverified requests are rejected with 200 OK (per Meta's requirement — returning errors causes Meta to retry aggressively). | Security-critical. Prevents spoofed lead injection. |
| BR-10 | The webhook endpoint MUST return 200 OK within 20 seconds. All processing (lead data fetch, lead creation, auto-assign) happens asynchronously via a queued job. | Meta retries on non-200 responses and eventually disables the webhook subscription if failures persist. |
| BR-11 | Webhook events are deduplicated using the `leadgen_id` from the webhook payload. If a lead with the same `meta_leadgen_id` already exists for the tenant, the webhook is acknowledged but no duplicate lead is created. | Prevents duplicate leads from Meta retries. |
| BR-12 | The webhook endpoint handles Meta's verification challenge (GET request with `hub.mode=subscribe`, `hub.verify_token`, `hub.challenge`). The verify token is stored in application config. | This is Meta's webhook subscription verification — a one-time handshake when the webhook is first registered. |

### 3.3 Lead Creation Rules

| Rule ID | Rule | Detail |
|---|---|---|
| BR-13 | When a webhook notification arrives, the system resolves the tenant from the `page_id` in the webhook payload → looks up `meta_page_connections` → gets `tenant_id`. | If no connection exists for the Page ID, the webhook is logged as an orphan and discarded. |
| BR-14 | After resolving the tenant, the system fetches the full lead data from Meta's Graph API: `GET /{leadgen_id}?fields=...` using the stored Page Access Token. | The webhook payload contains only the leadgen_id and page_id — the actual form data must be fetched via API. |
| BR-15 | Standard form fields map to Lead columns: `full_name` → `leads.first_name` + `leads.last_name` (split on first space), `email` → `leads.email`, `phone_number` → `leads.phone`. | If Meta's form uses `first_name` and `last_name` separately, use those directly. |
| BR-16 | All non-standard form fields (custom questions like "Which course?", "Preferred batch?") are stored in `leads.metadata` JSON under a `meta_form_responses` key. | Example: `{"meta_form_responses": {"which_course": "Science Batch", "preferred_timing": "Morning"}}` |
| BR-17 | The lead source is set to `facebook_ads` for Facebook Lead Ads and `instagram_ads` for Instagram Lead Ads. The platform determines the source from the `platform` field in the leadgen data (if available) or defaults to `facebook_ads`. | Both are valid values in the existing `LeadSource` value object. If they don't exist, they must be added. |
| BR-18 | The lead is created through the existing `CreateLeadUseCase` — the same UseCase that handles manual and website leads. This ensures auto-assign, domain events, and all downstream side effects (scoring, automation) fire consistently. | The UseCase receives a `CreateLeadCommand` with a `source` field. The Meta integration is just another source. |
| BR-19 | If the `CreateLeadUseCase` fails (e.g., duplicate email within the tenant, missing required fields), the failure is logged to the `meta_webhook_log` table. The lead is NOT retried automatically. The tenant admin can see failed imports in the integration health dashboard. | No silent failures. Every webhook outcome is logged. |
| BR-20 | The `ad_id`, `adgroup_id`, `campaign_id`, and `form_id` from Meta's leadgen data are stored in `leads.metadata` under a `meta_attribution` key. This enables future source ROI reporting. | Example: `{"meta_attribution": {"ad_id": "123", "campaign_id": "456", "form_id": "789"}}` |

### 3.4 Security Rules

| Rule ID | Rule | Detail |
|---|---|---|
| BR-21 | OAuth tokens are encrypted using `Crypt::encryptString()` (Laravel's encryption) before storage. Decryption happens only at the moment of API call. | Tokens are never stored in plaintext. |
| BR-22 | The Meta App Secret is stored as an environment variable (`META_APP_SECRET`), never in database or code. | Used for webhook signature verification and OAuth token exchange. |
| BR-23 | The webhook endpoint does NOT trust any data in the webhook payload beyond `page_id` and `leadgen_id`. All lead data is fetched from Meta's API using the stored token — the webhook is a notification trigger, not a data carrier. | Prevents payload injection attacks. |
| BR-24 | Cross-tenant isolation: A webhook for Page X (connected to Tenant A) NEVER creates a lead in Tenant B, even if the same `leadgen_id` somehow appears in both. The Page ID → tenant mapping is the authoritative routing key. | One Page ID maps to exactly one tenant (BR-03). |
| BR-25 | All Meta API calls (token exchange, lead data fetch) happen over HTTPS. No HTTP fallback. | Meta's API enforces HTTPS, but our outbound calls must also verify SSL certificates. |

---

## 4. Meta API Integration — Technical Reference

### 4.1 Required Permissions

The following permissions must be approved via Meta App Review:

| Permission | Purpose | App Review Required |
|---|---|---|
| `pages_show_list` | List the Pages a user manages (for the connection UI) | Yes |
| `leads_retrieval` | Retrieve lead data from Lead Ad forms | Yes |
| `pages_manage_ads` | Subscribe to leadgen webhook events on a Page | Yes |
| `pages_read_engagement` | Read Page engagement data (required dependency for leads_retrieval) | Yes |
| `pages_manage_metadata` | Subscribe the app to Page webhook events | Yes |

### 4.2 OAuth Flow

**Step 1 — Authorization URL:**
Tenant admin clicks "Connect Facebook" → frontend opens Meta's OAuth dialog:
```
https://www.facebook.com/v21.0/dialog/oauth
  ?client_id={META_APP_ID}
  &redirect_uri={EDUCOREOS_CALLBACK_URL}
  &scope=pages_show_list,leads_retrieval,pages_manage_ads,pages_read_engagement,pages_manage_metadata
  &state={encrypted_tenant_id_and_csrf_token}
```

**Step 2 — Token Exchange:**
Meta redirects back with an authorization `code`. EducoreOS exchanges it for a short-lived User Access Token:
```
GET https://graph.facebook.com/v21.0/oauth/access_token
  ?client_id={META_APP_ID}
  &client_secret={META_APP_SECRET}
  &redirect_uri={EDUCOREOS_CALLBACK_URL}
  &code={authorization_code}
```

**Step 3 — Long-Lived Token:**
Exchange short-lived token for a long-lived token (valid ~60 days):
```
GET https://graph.facebook.com/v21.0/oauth/access_token
  ?grant_type=fb_exchange_token
  &client_id={META_APP_ID}
  &client_secret={META_APP_SECRET}
  &fb_exchange_token={short_lived_token}
```

**Step 4 — Page Access Token:**
Use the long-lived User token to get Page Access Tokens (which do not expire if the user's long-lived token was used):
```
GET https://graph.facebook.com/v21.0/me/accounts
  ?access_token={long_lived_user_token}
```

Response includes each Page the user manages with its Page Access Token. The tenant selects which Page(s) to connect.

**Step 5 — Subscribe to Leadgen Webhooks:**
Subscribe the app to the Page's leadgen events:
```
POST https://graph.facebook.com/v21.0/{page_id}/subscribed_apps
  ?subscribed_fields=leadgen
  &access_token={page_access_token}
```

### 4.3 Webhook Payload

When a Lead Ad form is submitted, Meta sends a POST to the configured webhook URL:

```json
{
    "entry": [
        {
            "id": "PAGE_ID",
            "time": 1711432800,
            "changes": [
                {
                    "field": "leadgen",
                    "value": {
                        "created_time": 1711432800,
                        "leadgen_id": "LEAD_ID",
                        "page_id": "PAGE_ID",
                        "form_id": "FORM_ID",
                        "adgroup_id": "ADGROUP_ID",
                        "ad_id": "AD_ID"
                    }
                }
            ]
        }
    ],
    "object": "page"
}
```

### 4.4 Lead Data Retrieval

After receiving the webhook, fetch the full lead data:

```
GET https://graph.facebook.com/v21.0/{leadgen_id}
  ?fields=id,created_time,field_data,ad_id,adset_id,campaign_id,form_id,platform
  &access_token={page_access_token}
```

Response:
```json
{
    "id": "LEAD_ID",
    "created_time": "2026-03-26T10:30:00+0000",
    "field_data": [
        { "name": "full_name", "values": ["Rahul Sharma"] },
        { "name": "email", "values": ["rahul@example.com"] },
        { "name": "phone_number", "values": ["+919876543210"] },
        { "name": "which_course_are_you_interested_in?", "values": ["Science Batch"] },
        { "name": "preferred_timing", "values": ["Morning"] }
    ],
    "platform": "fb",
    "form_id": "FORM_ID",
    "ad_id": "AD_ID",
    "campaign_id": "CAMPAIGN_ID"
}
```

The `platform` field distinguishes Facebook (`fb`) from Instagram (`ig`).

### 4.5 Token Lifecycle

| Token Type | Validity | Action Required |
|---|---|---|
| Short-lived User Token | ~1 hour | Exchange for long-lived immediately |
| Long-lived User Token | ~60 days | Used only to generate Page Access Tokens |
| Page Access Token (from long-lived User Token) | Does not expire | Store this. Monitor for revocation. |

**Page Access Tokens obtained from long-lived User Access Tokens do not expire.** However, they can be invalidated if the user changes their Facebook password, revokes app permissions, or the Meta app is suspended. The system must detect invalid tokens via API error responses and mark connections as `inactive`.

---

## 5. Domain Model

### 5.1 Bounded Context Placement

The Meta integration lives within a **new sub-context** under `TenantAdminDashboard/LeadManagement`:

`TenantAdminDashboard/LeadManagement/MetaIntegration/`

It is NOT a separate bounded context — it's a sub-module of lead management because its sole output is creating leads through the existing `CreateLeadUseCase`.

The webhook endpoint is a **platform-level route** (not tenant-scoped) because Meta sends webhooks to a single URL. The handler resolves the tenant internally from the Page ID.

### 5.2 New Domain Layer Components

**Path:** `app/Domain/TenantAdminDashboard/LeadManagement/MetaIntegration/`

| Component | Type | Purpose |
|---|---|---|
| `MetaPageConnectionEntity` | Entity | Represents a tenant's connection to a Facebook Page. Holds page_id, page_name, connection_status, connected_by. |
| `MetaConnectionStatus` | Value Object | `active`, `inactive`, `error`. Includes transition rules. |
| `MetaLeadMapped` | Domain Event | Dispatched when a Meta lead is successfully mapped and created in the CRM. Carries lead_id, meta_leadgen_id, source. |
| `MetaConnectionEstablished` | Domain Event | Dispatched when a tenant successfully connects a Facebook Page. |
| `MetaConnectionRevoked` | Domain Event | Dispatched when a tenant disconnects or a token becomes invalid. |
| `MetaPageConnectionRepositoryInterface` | Repository Interface | CRUD for page connections. Key method: `findByPageId(string $pageId): ?MetaPageConnectionEntity`. |
| `MetaPageAlreadyConnectedException` | Exception | Thrown when a Page is already connected to another tenant (BR-03). |
| `MetaTokenInvalidException` | Exception | Thrown when a stored token fails API validation. |

### 5.3 New Application Layer Components

**Path:** `app/Application/TenantAdminDashboard/LeadManagement/MetaIntegration/`

| Component | Type | Purpose |
|---|---|---|
| `ConnectMetaPageUseCase` | Use Case | Handles the OAuth callback: exchanges code for token, retrieves Page list, stores selected Page connection(s), subscribes to leadgen webhook. |
| `DisconnectMetaPageUseCase` | Use Case | Removes the Page connection. Deletes the stored token. Unsubscribes from leadgen webhook (best-effort). |
| `ListMetaConnectionsQuery` | Query | Returns all Page connections for the tenant with status, page name, last webhook timestamp. |
| `ProcessMetaLeadWebhookUseCase` | Use Case | The core handler: receives webhook payload → resolves tenant → fetches lead data from Meta API → maps fields → calls `CreateLeadUseCase`. |
| `RefreshMetaConnectionStatusCommand` | Console Command | Scheduled command: validates stored tokens by making a lightweight API call. Marks invalid connections as `inactive`. Notifies tenant admin. |
| `MetaLeadFieldMapper` | Service | Maps Meta's `field_data` array to `CreateLeadCommand` fields + metadata JSON. Handles standard fields and custom fields. |
| `MetaApiClient` | Service | Wrapper around Meta's Graph API. Handles token usage, error detection, rate limit headers. NOT an infrastructure client — it's an application service that orchestrates API calls. |

### 5.4 New Infrastructure Layer Components

**Path:** `app/Infrastructure/`

| Component | Type | Location | Purpose |
|---|---|---|---|
| `MetaPageConnectionRecord` | Eloquent Model | `Persistence/TenantAdminDashboard/LeadManagement/MetaIntegration/` | Maps to `meta_page_connections` table. `BelongsToTenant` trait. Token column uses Laravel `Crypt` accessors. |
| `MetaWebhookLogRecord` | Eloquent Model | `Persistence/TenantAdminDashboard/LeadManagement/MetaIntegration/` | Maps to `meta_webhook_log` table. |
| `EloquentMetaPageConnectionRepository` | Repository | `Persistence/TenantAdminDashboard/LeadManagement/MetaIntegration/` | Implements `MetaPageConnectionRepositoryInterface`. |
| `ProcessMetaLeadWebhookJob` | Queued Job | `Shared/Jobs/` | Dispatched by the webhook controller. Calls `ProcessMetaLeadWebhookUseCase`. `high` priority queue. |
| `MetaGraphApiHttpClient` | HTTP Client | `External/Meta/` | Low-level HTTP client for Meta Graph API calls. Uses Laravel's HTTP client. Handles retries, timeouts, error parsing. |

### 5.5 HTTP Layer

**Webhook Controller (Platform-level, NOT tenant-scoped):**

`app/Http/Controllers/Api/Webhooks/MetaWebhookController.php`

| Endpoint | Method | Purpose | Auth |
|---|---|---|---|
| `GET /api/webhooks/meta/leadgen` | `verify` | Meta webhook verification challenge | None (public, verify token check) |
| `POST /api/webhooks/meta/leadgen` | `handle` | Receive webhook events | None (public, signature verification) |

This controller has NO auth middleware — it's a public endpoint. Security is via Meta's `X-Hub-Signature-256` header verification.

**Tenant Admin Controllers:**

`app/Http/Controllers/Api/TenantAdminDashboard/LeadManagement/MetaIntegration/`

| Endpoint | Method | Purpose | Capability |
|---|---|---|---|
| `GET /api/tenant/meta/auth-url` | `MetaOAuthController@authUrl` | Generate the OAuth authorization URL with state parameter | `meta.connect` |
| `GET /api/tenant/meta/callback` | `MetaOAuthController@callback` | Handle OAuth redirect, exchange token, store connection | `meta.connect` |
| `GET /api/tenant/meta/connections` | `MetaConnectionController@index` | List all Page connections with status | `meta.view` |
| `DELETE /api/tenant/meta/connections/{connectionId}` | `MetaConnectionController@disconnect` | Disconnect a Page | `meta.connect` |
| `GET /api/tenant/meta/connections/{connectionId}/logs` | `MetaConnectionController@logs` | View webhook logs for a connection | `meta.view` |

**Form Requests:**

| Request | Validates |
|---|---|
| `MetaOAuthCallbackRequest` | `code` (required), `state` (required, decrypts to valid tenant_id + CSRF token) |

**API Resources:**

| Resource | Shapes |
|---|---|
| `MetaConnectionResource` | `id`, `page_id`, `page_name`, `page_picture_url`, `status` (active/inactive/error), `connected_at`, `connected_by` (name), `last_webhook_at`, `leads_received_count` |
| `MetaWebhookLogResource` | `id`, `leadgen_id`, `result` (success/failed/duplicate), `error_message`, `lead_id` (if created), `received_at` |

### 5.6 Capability & Module Codes

| Code | Type | Context | Who Has It | Purpose |
|---|---|---|---|---|
| `module.meta_leads` | Module Entitlement | Plan-level | Gated by subscription plan | Controls access to the entire Meta integration feature |
| `meta.connect` | Capability | Tenant Admin | Admins only | Connect/disconnect Facebook Pages |
| `meta.view` | Capability | Tenant Admin | Admins, Branch Managers | View connection status and webhook logs |

When `module.meta_leads` is absent from the tenant's plan, the integration UI is hidden and the webhook handler skips processing for that tenant (logs as `skipped_no_module`).

---

## 6. Database Schema

### 6.1 New Tables

**`meta_page_connections`** (tenant-scoped)

| Column | Type | Notes |
|---|---|---|
| `id` | BIGINT UNSIGNED PK | Auto-increment |
| `tenant_id` | BIGINT UNSIGNED NOT NULL | FK → `tenants.id`. Global scope enforced. |
| `page_id` | VARCHAR(50) NOT NULL | Facebook Page ID. UNIQUE across all tenants (BR-03). |
| `page_name` | VARCHAR(255) NOT NULL | Display name of the Facebook Page. |
| `page_picture_url` | VARCHAR(500) NULLABLE | Page profile picture URL. |
| `page_access_token` | TEXT NOT NULL | Encrypted (Laravel Crypt). Page Access Token for API calls. |
| `connection_status` | VARCHAR(20) NOT NULL DEFAULT 'active' | `active`, `inactive`, `error`. |
| `status_reason` | VARCHAR(255) NULLABLE | Why the status is inactive/error (e.g., "Token revoked by user"). |
| `connected_by` | BIGINT UNSIGNED NOT NULL | FK → `users.id`. The admin who connected the Page. |
| `last_webhook_at` | TIMESTAMP NULLABLE | When the last webhook was received for this Page. |
| `leads_received_count` | INT UNSIGNED NOT NULL DEFAULT 0 | Running count of leads successfully created from this Page. |
| `created_at` | TIMESTAMP | |
| `updated_at` | TIMESTAMP | |

**Indexes:**
- `unq_meta_page_id` → `(page_id)` UNIQUE — prevents cross-tenant conflicts
- `idx_meta_connections_tenant` → `(tenant_id)`
- `idx_meta_connections_status` → `(connection_status)` — for the health check command

---

**`meta_webhook_log`** (tenant-scoped)

| Column | Type | Notes |
|---|---|---|
| `id` | BIGINT UNSIGNED PK | Auto-increment |
| `tenant_id` | BIGINT UNSIGNED NULLABLE | NULL if tenant could not be resolved from page_id. |
| `page_id` | VARCHAR(50) NOT NULL | The Facebook Page that received the lead. |
| `leadgen_id` | VARCHAR(50) NOT NULL | Meta's unique lead ID. |
| `form_id` | VARCHAR(50) NULLABLE | Meta's form ID. |
| `result` | VARCHAR(20) NOT NULL | `success`, `failed`, `duplicate`, `skipped_no_module`, `skipped_inactive`. |
| `error_message` | TEXT NULLABLE | Error detail if `failed`. |
| `lead_id` | BIGINT UNSIGNED NULLABLE | FK → `leads.id`. Set if a lead was successfully created. |
| `raw_payload` | JSON NULLABLE | The webhook payload (for debugging). Retained for 30 days only. |
| `received_at` | TIMESTAMP NOT NULL | When the webhook was received. |

**Indexes:**
- `idx_webhook_log_tenant` → `(tenant_id, received_at DESC)`
- `idx_webhook_log_leadgen` → `(leadgen_id)` — for deduplication lookup
- `idx_webhook_log_result` → `(result)` — for filtering failures

**No `created_at` / `updated_at`.** `received_at` serves as the timestamp.

### 6.2 Modified Tables

**`leads`** — Verify or add columns:

| Column | Type | Notes |
|---|---|---|
| `meta_leadgen_id` | VARCHAR(50) NULLABLE | Meta's unique lead ID. Used for deduplication. Indexed. |
| `metadata` | JSON NULLABLE | Should already exist. Used for `meta_form_responses` and `meta_attribution`. |

**Index:** `idx_leads_meta_leadgen` → `(tenant_id, meta_leadgen_id)` — for deduplication checks.

### 6.3 LeadSource Value Object Extension

Add two new source values to the existing `LeadSource` value object:

| Source Code | Display Name |
|---|---|
| `facebook_ads` | Facebook Lead Ads |
| `instagram_ads` | Instagram Lead Ads |

### 6.4 Webhook Log Cleanup

A scheduled cleanup command deletes webhook log entries older than **30 days**. The `raw_payload` JSON is the primary storage concern — it should not accumulate indefinitely.

**Command:** `meta:cleanup-webhook-logs`
**Schedule:** Daily at 3:00 AM

---

## 7. Webhook Processing Flow

### 7.1 Synchronous Path (in the webhook controller — must complete in < 20 seconds)

```
1. Receive POST /api/webhooks/meta/leadgen
2. Verify X-Hub-Signature-256 header against payload using META_APP_SECRET
   → If invalid: return 200 OK (log as signature_failed, do NOT return error)
3. Parse the payload: extract page_id and leadgen_id from entry[].changes[].value
4. For each leadgen entry in the payload:
   a. Check deduplication: does meta_webhook_log already have this leadgen_id?
      → If yes: return 200 OK (log as duplicate)
   b. Insert a meta_webhook_log record with result = 'processing'
   c. Dispatch ProcessMetaLeadWebhookJob(leadgen_id, page_id, webhook_log_id) on 'notifications-high' queue
5. Return 200 OK
```

### 7.2 Asynchronous Path (in the queued job)

```
1. Look up meta_page_connections WHERE page_id = ?
   → If not found: update webhook_log result = 'skipped_inactive', return
2. Check connection_status = 'active'
   → If not active: update webhook_log result = 'skipped_inactive', return
3. Check tenant has module.meta_leads entitlement
   → If not entitled: update webhook_log result = 'skipped_no_module', return
4. Set TenantContext from connection.tenant_id
5. Fetch lead data from Meta Graph API:
   GET /{leadgen_id}?fields=id,created_time,field_data,ad_id,adset_id,campaign_id,form_id,platform
   Using connection.page_access_token (decrypt first)
   → If 401/token error: mark connection as 'inactive', notify tenant admin, update webhook_log result = 'failed'
   → If rate limited: re-queue job with backoff
   → If other error: update webhook_log result = 'failed' with error message
6. Map field_data using MetaLeadFieldMapper:
   - Standard fields → CreateLeadCommand properties
   - Custom fields → metadata.meta_form_responses JSON
   - Ad attribution → metadata.meta_attribution JSON
   - Determine source: platform = 'ig' → 'instagram_ads', else → 'facebook_ads'
7. Call CreateLeadUseCase with the mapped command
   → If success: update webhook_log result = 'success', set lead_id
   → If failure (duplicate email, validation error): update webhook_log result = 'failed' with error
8. Update connection: last_webhook_at = now(), increment leads_received_count
9. Reset TenantContext
```

### 7.3 Error Handling & Resilience

| Scenario | Handling |
|---|---|
| Meta webhook retries (same leadgen_id) | Deduplicated via `meta_webhook_log` lookup. Logged as `duplicate`. |
| Token expired/revoked | Connection marked `inactive`. Tenant admin notified via Phase 14 notification. Logged as `failed`. |
| Meta API rate limited | Job re-queued with exponential backoff (1 min, 5 min, 15 min). Max 3 retries. |
| Meta API returns 500 | Job retried once. If still failing, logged as `failed`. |
| Lead creation fails (validation) | Logged as `failed` with specific error message. No retry — requires human review. |
| Webhook signature invalid | Logged as `signature_failed`. Returned 200 OK (never return errors to Meta). |
| Page not connected to any tenant | Logged as orphan. No processing. |

---

## 8. OAuth Flow — Detailed Specification

### 8.1 Frontend Flow

1. Tenant admin navigates to CRM Settings → Integrations → Meta Lead Ads
2. Clicks "Connect Facebook Page"
3. Frontend calls `GET /api/tenant/meta/auth-url` → receives the OAuth authorization URL
4. Frontend opens the URL in a popup window (or redirect)
5. User logs into Facebook, grants permissions, selects Page(s)
6. Meta redirects to `GET /api/tenant/meta/callback?code=...&state=...`
7. Backend processes the callback (see §8.2)
8. Popup closes (or redirects back). Connection list refreshes showing the new connection(s).

### 8.2 Backend Callback Processing

The `ConnectMetaPageUseCase` handles the callback:

```
1. Decrypt and validate the state parameter → extract tenant_id + CSRF token
2. Verify CSRF token matches session
3. Exchange authorization code for short-lived User Access Token
4. Exchange short-lived token for long-lived User Access Token
5. Fetch /me/accounts → list of Pages the user manages with Page Access Tokens
6. For each Page the user selected (or all managed Pages):
   a. Check if page_id is already connected to ANY tenant
      → If connected to THIS tenant: update the token (re-authorization flow)
      → If connected to ANOTHER tenant: reject with MetaPageAlreadyConnectedException
   b. Subscribe the app to the Page's leadgen events
   c. Store the connection:
      - page_id, page_name, page_picture_url
      - Encrypt and store page_access_token
      - connection_status = 'active'
      - connected_by = authenticated user
7. Dispatch MetaConnectionEstablished event
8. Return success response
```

### 8.3 Re-authorization Flow

When a token becomes invalid (detected by the health check command or by a failed API call during webhook processing):

1. Connection is marked `inactive` with `status_reason = "Token expired or revoked"`
2. Tenant admin is notified: "Your Facebook connection for Page X has expired. Please re-connect."
3. Tenant admin clicks "Reconnect" → same OAuth flow as initial connection
4. On successful callback, the existing connection record is updated (not recreated) with the new token
5. Connection status returns to `active`

---

## 9. Scheduled Commands

| Command | Signature | Schedule | Purpose |
|---|---|---|---|
| `meta:check-connection-health` | `meta:check-connection-health` | Every 6 hours | Validates all `active` connections by making a lightweight API call (`GET /me?access_token=...`). Marks invalid tokens as `inactive`. Notifies tenant admins. |
| `meta:cleanup-webhook-logs` | `meta:cleanup-webhook-logs` | Daily at 3:00 AM | Deletes webhook log records older than 30 days. |

### 9.1 Connection Health Check Logic

```
1. Find all meta_page_connections WHERE connection_status = 'active'
2. For each connection (chunked, 50 at a time):
   a. Make API call: GET /me?access_token={decrypted_token}
   b. If success: continue (token is valid)
   c. If 401/OAuthException:
      - Update connection_status = 'inactive'
      - Set status_reason = 'Token expired or revoked by user'
      - Dispatch MetaConnectionRevoked event
      - Send notification to the tenant admin who connected the Page
   d. If rate limited or server error: skip (don't mark as inactive on transient errors)
```

---

## 10. Notification Integration

### 10.1 New Notification Types

| # | Notification Type | Trigger | Recipient | Priority | Category | Channels |
|---|---|---|---|---|---|---|
| 23 | Meta Connection Inactive | `MetaConnectionRevoked` event | Tenant admin who connected the Page | `high` | `system` | Email + In-App |
| 24 | Meta Lead Import Failed | Lead creation failure in webhook processing | Tenant admins with `meta.view` capability | `default` | `system` | In-App only |

### 10.2 Email Templates

| Template Path | Notification | Variables |
|---|---|---|
| `emails.crm.meta-connection-inactive` | #23 | `admin_name`, `page_name`, `page_id`, `reason`, `reconnect_url` |

---

## 11. Frontend Requirements

### 11.1 Meta Integration Page

**Location:** CRM Settings → Integrations → Meta Lead Ads

**When module is NOT entitled:** Show a locked state with upgrade prompt.

**When module IS entitled:**

**Connected Pages List:**
- Cards for each connected Page showing: Page name, Page profile picture, Status (Active/Inactive/Error badge), Connected by, Connected date, Leads received count, Last lead received (relative time)
- "Disconnect" button per Page (with confirmation dialog)
- "Reconnect" button for inactive connections

**Connect New Page:**
- "Connect Facebook Page" button
- Opens Meta OAuth popup
- On success: page list refreshes with new connection

**Webhook Logs:**
- Expandable per-connection: last 50 webhook events with result (success/failed/duplicate)
- Filter by result type
- Failed events show the error message

### 11.2 Lead Detail — Meta Attribution

When a lead was created from Meta Lead Ads, the lead detail page shows:

**Source Badge:** "Facebook Lead Ads" or "Instagram Lead Ads" with the platform icon.

**Form Responses Section:** If `metadata.meta_form_responses` exists, render the custom field responses as key-value pairs:
```
Course Interest: Science Batch
Preferred Timing: Morning
```

**Ad Attribution Section (collapsed by default):** If `metadata.meta_attribution` exists, show ad_id, campaign_id, form_id.

---

## 12. Meta App Review Preparation

### 12.1 Permission Justifications

The implementation plan must include draft justification text for each permission. These are submitted during Meta App Review:

| Permission | Justification Template |
|---|---|
| `pages_show_list` | "EducoreOS is an education management platform. Institutions connect their Facebook Pages to automatically receive leads from Lead Ad forms. This permission is needed to display the list of Pages the user manages so they can select which Page to connect." |
| `leads_retrieval` | "EducoreOS uses this permission to retrieve lead data submitted through Lead Ad forms on the institution's Facebook Page. Leads are imported into the institution's CRM for immediate counselor follow-up." |
| `pages_manage_ads` | "EducoreOS requires this permission to subscribe to leadgen webhook events on the institution's Facebook Page, enabling real-time lead delivery when a prospect submits a Lead Ad form." |
| `pages_read_engagement` | "Required as a dependency for leads_retrieval. EducoreOS reads Page engagement data to verify webhook subscriptions and retrieve lead form metadata." |
| `pages_manage_metadata` | "EducoreOS uses this permission to subscribe the application to the Page's webhook events for real-time lead notifications." |

### 12.2 Screen Recording Checklist

Meta requires a screen recording demonstrating each permission's usage. The recording must show:

1. User logs into EducoreOS
2. Navigates to CRM Settings → Integrations → Meta Lead Ads
3. Clicks "Connect Facebook Page"
4. Completes Facebook OAuth (grants permissions)
5. Selects a Page to connect
6. Connection appears as "Active"
7. A test lead is submitted via Meta's Lead Ads Testing Tool
8. The lead appears in EducoreOS's CRM Kanban board within seconds
9. Lead detail shows form responses and source attribution

### 12.3 Test User Requirements

Meta reviewers need a test account to access EducoreOS. Create a dedicated tenant for Meta review with `module.meta_leads` enabled and a test user with `meta.connect` capability.

---

## 13. Implementation Plan Requirements

| # | Section | Content |
|---|---|---|
| 1 | Executive Summary | What gets built, what does NOT |
| 2 | Dependency Verification | Verify: `CreateLeadUseCase` exists with source parameter, `LeadSource` value object supports adding new values, `leads.metadata` column exists, `NotificationDispatcher` works, `TenantQuotaService` can enforce `module.meta_leads`. |
| 3 | Architecture Decisions | Any deviations from this spec |
| 4 | Meta Developer App Setup | Document the existing App ID, verify webhook configuration, confirm required permissions are requested |
| 5 | Migration Plan | New tables, modified columns. Exact SQL. |
| 6 | Domain Layer | Entities, value objects, events, exceptions |
| 7 | Application Layer | UseCases, services, field mapper, API client |
| 8 | Infrastructure Layer | Eloquent models, repositories, queued job, HTTP client |
| 9 | HTTP Layer | Webhook controller, OAuth controllers, tenant controllers, routes with middleware |
| 10 | OAuth Flow | Complete flow with state management, CSRF, token exchange, Page selection |
| 11 | Webhook Processing | Synchronous + async paths, deduplication, error handling |
| 12 | Field Mapping | Standard field mapping table, custom field → metadata mapping, edge cases |
| 13 | Scheduled Commands | Health check, log cleanup |
| 14 | Notification Integration | Listeners, email templates |
| 15 | Frontend Specification | Integration page, lead detail meta attribution |
| 16 | Meta App Review | Permission justifications, recording script, test user setup |
| 17 | Implementation Sequence | Ordered steps with dependencies and day estimates |
| 18 | Test Plan | Every test file with description |
| 19 | Quality Gate Verification | Checklist from §14 |
| 20 | File Manifest | Every new and modified file |

---

## 14. Quality Gates (Must Pass Before Meta Integration Goes Live)

### 14.1 OAuth Gates

- [ ] OAuth flow completes successfully: tenant admin connects a Facebook Page
- [ ] Page Access Token is encrypted at rest — verified by checking database directly
- [ ] Token is NEVER included in any API response
- [ ] Re-authorization flow works: disconnected Page can be reconnected with fresh token
- [ ] Duplicate Page connection rejected: same Page cannot connect to two different tenants
- [ ] Same Page re-connection to same tenant updates token (not duplicate record)
- [ ] State parameter includes CSRF protection — forged callbacks are rejected

### 14.2 Webhook Gates

- [ ] Webhook verification challenge (GET) returns correct response
- [ ] Valid webhook with correct signature creates a lead
- [ ] Invalid signature is rejected (logged, returns 200 OK)
- [ ] Duplicate leadgen_id does NOT create a duplicate lead
- [ ] Webhook returns 200 OK within 20 seconds (processing is async)
- [ ] Meta's Lead Ads Testing Tool successfully creates a lead in EducoreOS

### 14.3 Lead Creation Gates

- [ ] Standard fields (name, email, phone) correctly mapped to lead columns
- [ ] Custom form fields stored in `leads.metadata.meta_form_responses`
- [ ] Ad attribution stored in `leads.metadata.meta_attribution`
- [ ] Source set to `facebook_ads` for Facebook, `instagram_ads` for Instagram
- [ ] Lead created through existing `CreateLeadUseCase` — auto-assign fires
- [ ] If 15C-II is live: lead score is computed on creation
- [ ] If 15C-III is live: automation rules with `lead.created` trigger fire for Meta leads

### 14.4 Security Gates

- [ ] Webhook endpoint has NO auth middleware — it's public but signature-verified
- [ ] Cross-tenant isolation: webhook for Page connected to Tenant A never creates lead in Tenant B
- [ ] Token stored encrypted — plaintext token not visible in database dump
- [ ] Module entitlement enforced: tenant without `module.meta_leads` cannot access integration UI
- [ ] Module entitlement enforced: webhook processing skips tenants without the module
- [ ] OAuth tokens never appear in logs (verify log output during OAuth flow)

### 14.5 Resilience Gates

- [ ] Invalid token detected during webhook processing → connection marked inactive → tenant notified
- [ ] Health check command detects expired tokens and marks connections inactive
- [ ] Rate-limited API calls re-queued with backoff
- [ ] Failed lead creation logged with error message — visible in webhook log UI
- [ ] Webhook log cleanup removes records older than 30 days

### 14.6 Regression Gates

- [ ] All existing lead management tests pass (0 regressions)
- [ ] Manual lead creation unaffected
- [ ] Website lead form unaffected
- [ ] Auto-assign works for Meta leads
- [ ] PHPStan Level 5 passes with 0 new errors

---

## 15. Constraints & Reminders

### Architecture Constraints

- **The webhook controller is stateless.** It verifies the signature, extracts page_id and leadgen_id, dispatches a job, and returns 200 OK. No database queries in the synchronous path except deduplication check and log insert.
- **All Meta API calls happen in the queued job, not in the webhook handler.** The webhook is a notification trigger, not a data pipeline.
- **Lead creation goes through `CreateLeadUseCase`.** Do NOT create leads directly in the webhook handler by inserting into the database. The UseCase contains auto-assign logic, domain event dispatch, and validation that must not be bypassed.
- **One Page = one tenant. No sharing.** The unique constraint on `page_id` enforces this. If two tenants somehow manage the same Facebook Page (unlikely but possible), the first to connect wins.
- **Token encryption is non-negotiable.** Use Laravel's `Crypt::encryptString()` / `Crypt::decryptString()`. Not base64. Not a custom cipher. Laravel's built-in encryption with the APP_KEY.
- **Audit logs OUTSIDE transactions.** Same as all previous phases.
- **No external API calls inside database transactions.** The Meta Graph API call to fetch lead data must NOT be inside a transaction that holds locks on the leads table.

### Docker Environment

- Container: Alpine Linux — use `sh` not `bash`
- Container name: `ubotz_backend`
- Queue: Redis DB 3

### What NOT to Do

- Do NOT return non-200 responses to Meta's webhook. Meta retries aggressively and will eventually disable the subscription. Always return 200 OK, even for invalid signatures or processing errors.
- Do NOT store tokens in plaintext. Not in the database, not in logs, not in error messages.
- Do NOT make synchronous API calls in the webhook controller. Dispatch a job and return immediately.
- Do NOT create a separate lead creation pathway for Meta leads. Use the existing `CreateLeadUseCase` — it already handles source attribution, auto-assign, and domain events.
- Do NOT trust data in the webhook payload as the lead data. The webhook only tells you THAT a lead was submitted. You must fetch the actual data from Meta's API.
- Do NOT log the full OAuth token exchange response. It contains tokens. Log only status codes and non-sensitive metadata.
- Do NOT skip the Meta App Review preparation. Without App Review approval, the integration only works for users with developer/tester roles on the Meta app — no tenant can use it in production.
- Do NOT implement token refresh as a retry loop. If a token is invalid, mark the connection as inactive and notify the tenant. The tenant re-authorizes via OAuth — there is no automatic token refresh for Page Access Tokens.

---

## 16. Definition of Done

Phase 15B is complete when:

1. The implementation plan has been reviewed and approved by the Principal Engineer.
2. All code is implemented per the approved plan.
3. All quality gates in §14 pass.
4. A Principal Engineer audit confirms zero critical or high findings.
5. All findings from audit are resolved.
6. End-to-end demonstration:
   a. Tenant admin connects a Facebook Page via OAuth → connection shows as "Active."
   b. A test lead is submitted via Meta's Lead Ads Testing Tool → webhook received → lead appears on Kanban board within 30 seconds.
   c. Lead shows correct source (facebook_ads), mapped standard fields, custom form responses in metadata.
   d. Lead is auto-assigned to a counselor.
   e. Second submission of the same lead → deduplicated, no duplicate created.
   f. Token is invalidated (simulated) → health check marks connection as inactive → tenant receives notification → tenant re-authorizes → connection restored.
   g. Tenant without `module.meta_leads` cannot access integration UI.
7. Meta App Review submission materials prepared (permission justifications, screen recording, test user).
8. Zero regression in existing test suite.
9. PHPStan Level 5 passes with 0 new errors.
10. The Phase 15B Completion Report is signed off.

---

*End of Document — UBOTZ 2.0 Phase 15B Developer Instructions — March 26, 2026*
