# UBOTZ 2.0 — System Notifications: Full Technical Specification

| Field | Value |
|---|---|
| **Document Type** | Principal Engineer — Technical Specification |
| **Feature** | System Notifications (Communication Hub) |
| **Date** | 2026-03-27 |
| **Issued By** | Principal Engineer / Architecture Auditor |
| **Scope** | Full-stack design — DB schema, domain, application, infrastructure, channels, jobs |
| **Status** | CURRENT — Reflects implemented codebase state |

---

## 1. System Architecture Overview

```
Domain Layer        →  NotificationPayload, ValueObjects (Category, Channel, Priority)
                    →  NotificationRepositoryInterface, NotificationPreferenceRepositoryInterface
Application Layer   →  NotificationDispatcher, NotificationPreferenceService
                    →  ListNotificationsUseCase, MarkNotificationsReadUseCase
                    →  UpdateNotificationPreferencesUseCase
Infrastructure      →  InAppChannel, EmailChannel, WhatsAppChannel
                    →  SendNotificationEmail Job, SendWhatsAppNotificationJob
                    →  NotificationRecord (Eloquent), NotificationPreferenceRecord
                    →  EloquentNotificationLogRepository
Scheduled Commands  →  notifications:cleanup, notifications:retry-failed
HTTP Layer          →  AdminNotificationController, NotificationController (TenantAdminDashboard)
                    →  AdminNotificationPreferenceController, TenantNotificationPreferenceController
```

---

## 2. Database Schema

### 2.1 Table: `notifications`

The primary in-app notification store. Persisted by `InAppChannel` and also created by `EmailChannel` as an email tracking record.

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | BIGINT (PK) | No | |
| `notifiable_type` | VARCHAR | No | Polymorphic type: `admin` or `user`. |
| `notifiable_id` | BIGINT | No | FK to `admins.id` or `users.id`. |
| `tenant_id` | BIGINT | Yes | `null` for platform-level notifications. |
| `type` | VARCHAR | No | Notification type code: e.g., `payment_successful`, `quiz_completed`. |
| `category` | VARCHAR | No | One of: `billing`, `security`, `system`, `communication`, `leave`. |
| `title` | VARCHAR | No | Short subject line. |
| `body` | TEXT | No | Plain-text summary. |
| `data` | JSON | Yes | Template variables and contextual data. |
| `action_url` | VARCHAR | Yes | Optional CTA link. |
| `read_at` | TIMESTAMP | Yes | `null` = unread. |
| `email_sent_at` | TIMESTAMP | Yes | Set by `SendNotificationEmail` job on success. |
| `email_failed_at` | TIMESTAMP | Yes | Set after all email retries exhausted. |
| `created_at` | TIMESTAMP | No | |

> **No `updated_at`** — `AdminRecord` sets `public const UPDATED_AT = null` on the Eloquent model.

**Scopes on `NotificationRecord`:**
- `scopeUnread(Builder $query)` — `WHERE read_at IS NULL`
- `scopeRead(Builder $query)` — `WHERE read_at IS NOT NULL`

---

### 2.2 Table: `notification_preferences`

Stores explicit user opt-outs per category/channel combination. This table is sparse — only populated when a user deviates from the default (enabled).

| Column | Type | Notes |
|---|---|---|
| `id` | BIGINT (PK) | |
| `preferable_type` | VARCHAR | Polymorphic: `admin` or `user`. |
| `preferable_id` | BIGINT | FK to the recipient. |
| `category` | VARCHAR | Notification category value. |
| `channel` | VARCHAR | Channel value: `email`, `in_app`, `whatsapp`. |
| `is_enabled` | BOOLEAN | `false` = user has opted out. |
| `created_at` | TIMESTAMP | |
| `updated_at` | TIMESTAMP | |

**Logic:** If a row exists and `is_enabled = false`, the channel is suppressed. If no row exists, the default is **enabled**.

---

### 2.3 Table: `notification_sent_log`

Tracks sent notifications for idempotency and deduplication, particularly for scheduled notification commands.

| Column | Type | Notes |
|---|---|---|
| `id` | BIGINT (PK) | |
| `notifiable_type` | VARCHAR | |
| `notifiable_id` | BIGINT | |
| `notification_type` | VARCHAR | Type code. |
| `sent_at` | TIMESTAMP | When it was sent. |

> **No `timestamps()`** — uses only `sent_at`, set manually.

---

## 3. Domain Layer

### 3.1 `NotificationPayload` (Value Object)

**File:** `App\Domain\Shared\Notification\NotificationPayload`

An immutable, framework-agnostic value object that carries all data required to deliver a notification. Constructed by domain event listeners; passed to the `NotificationDispatcher`.

**Constructor Parameters:**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `type` | `string` | Yes | Unique notification type code (e.g., `payment_successful`). |
| `category` | `NotificationCategory` | Yes | One of: `billing`, `security`, `system`, `communication`, `leave`. |
| `priority` | `NotificationPriority` | Yes | `high`, `default`, or `low`. |
| `recipientType` | `string` | Yes | `admin` or `user`. Validated in constructor. |
| `recipientId` | `int` | Yes | PK of the admin or user. |
| `tenantId` | `?int` | Yes | `null` for platform-level events. |
| `subject` | `string` | Yes | Email subject / in-app title. |
| `body` | `string` | Yes | Plain text body for in-app. |
| `data` | `array` | No | Template variables (e.g., `user_name`, `invoice_amount`). |
| `actionUrl` | `?string` | No | Deep link URL for CTAs. |
| `emailTemplate` | `?string` | No | Blade template path. **Required to trigger email dispatch.** |
| `channels` | `NotificationChannelType[]` | No | Empty = dispatcher defaults to Email + In-App. |

---

### 3.2 `NotificationCategory` (Value Object)

**File:** `App\Domain\Shared\Notification\ValueObjects\NotificationCategory`

| Constant | DB Value | Mandatory |
|---|---|---|
| `BILLING` | `billing` | ✅ Yes |
| `SECURITY` | `security` | ✅ Yes |
| `SYSTEM` | `system` | No |
| `COMMUNICATION` | `communication` | No |
| `LEAVE` | `leave` | No |

**Key Method:** `isMandatory(): bool` — returns `true` for `billing` and `security`. Used by `NotificationPreferenceService` to bypass opt-out checks.

---

### 3.3 `NotificationChannelType` (Value Object)

**File:** `App\Domain\Shared\Notification\ValueObjects\NotificationChannelType`

| Constant | Value |
|---|---|
| `EMAIL` | `email` |
| `IN_APP` | `in_app` |
| `WHATSAPP` | `whatsapp` |

---

### 3.4 `NotificationPriority` (Value Object)

**File:** `App\Domain\Shared\Notification\ValueObjects\NotificationPriority`

| Constant | Value | Queue Name |
|---|---|---|
| `HIGH` | `high` | `notifications-high` |
| `DEFAULT` | `default` | `notifications-default` |
| `LOW` | `low` | `notifications-low` |

**Key Method:** `toQueueName(): string` — returns the queue configuration key. Used by `EmailChannel::send()` to dispatch onto the correct priority lane via `dispatch(...)->onQueue($queueName)`.

---

## 4. Application Layer

### 4.1 `NotificationDispatcher`

**File:** `App\Infrastructure\Shared\Notification\NotificationDispatcher`

The central routing service. Called by event listeners after any domain event that requires notification.

**Execution flow:**
1. Determine channels to try: `payload->channels` if set, else default to `[EMAIL, IN_APP]`.
2. For each channel:
   - Call `NotificationPreferenceService::shouldDeliver()`.
   - If category is mandatory → skip preference check, deliver.
   - If preference exists and `is_enabled = false` → skip channel.
   - Route to the corresponding channel class (`EmailChannel`, `InAppChannel`).
3. After the loop — call `WhatsAppChannel::send()` as an additive best-effort pass.

---

### 4.2 `NotificationPreferenceService`

**File:** `App\Application\Shared\Notification\NotificationPreferenceService`

Resolves delivery eligibility per notification per channel.

```php
public function shouldDeliver(
    string $userType,
    int $userId,
    NotificationCategory $category,
    NotificationChannelType $channel
): bool
```

**Logic:**
1. If `$category->isMandatory()` → return `true` immediately (no DB hit).
2. Query `NotificationPreferenceRepositoryInterface::getPreference()`.
3. If preference exists → return `$preference` (the `is_enabled` flag).
4. If no record → return `true` (default = enable).

---

### 4.3 `UpdateNotificationPreferencesUseCase`

**File:** `App\Application\Shared\Notification\UseCases\UpdateNotificationPreferencesUseCase`

Validates and persists user preference changes.

**Guards:**
- Constructs `NotificationCategory` from the raw string (fails on invalid value).
- If `$category->isMandatory() && $enabled === false` → throws `InvalidArgumentException`. Mandatory categories cannot be disabled.
- Calls repository `save()` with upsert semantics.
- Logs the change via `AuditLoggerInterface` with action `notification_preference.updated`.

---

### 4.4 Tenant-Side UseCases

| UseCase | Action |
|---|---|
| `ListNotificationsUseCase` | Returns unread `NotificationEntity[]` for a `(tenantId, userId)` pair. Scoped by tenant. |
| `MarkNotificationsReadUseCase` | Sets `read_at = now()` on specified notification IDs. Includes tenant isolation guard. |
| `SendEnrollmentNotificationUseCase` | **Ad-hoc path** — sends enrollment emails directly. Does not use `NotificationDispatcher`. |
| `SendWaitlistJoinedNotificationUseCase` | **Ad-hoc path** — sends waitlist emails directly. Does not use `NotificationDispatcher`. |

---

## 5. Infrastructure Layer — Channels

### 5.1 `InAppChannel`

**File:** `App\Infrastructure\Shared\Notification\Channels\InAppChannel`

**Execution:**
1. Creates a new `NotificationRecord`.
2. Maps all payload fields.
3. Calls `$notification->save()` synchronously.

**Critical note:** `InAppChannel` runs **synchronously** inside the `NotificationDispatcher` call. There is no queue. If the DB write fails, it throws and the event listener must handle it.

---

### 5.2 `EmailChannel`

**File:** `App\Infrastructure\Shared\Notification\Channels\EmailChannel`

**Execution:**
1. Check if a `NotificationRecord` for this notification was already created (within 5 seconds) by `InAppChannel` — to reuse the same ID for tracking.
2. If no record found, create a new stub `NotificationRecord` for email-tracking.
3. Determine the queue name from `payload->priority->toQueueName()`.
4. Dispatch `SendNotificationEmail` job onto the priority queue.

**`SendNotificationEmail` Job:**

| Property | Value |
|---|---|
| `$tries` | 3 |
| `$backoff` | `[60, 300, 900]` (seconds) |
| `$timeout` | 30 seconds |

**Job execution:**
1. Resolve recipient's email: query `admins` or `users` table by `recipientId`.
2. If email empty → mark `email_failed_at`, log warning, return.
3. Send via `Mail::send($emailTemplate, $data, ...)`.
4. On success → update `email_sent_at`.
5. On exception → update `email_failed_at`, rethrow (trigger retry).
6. On `failed()` callback (after all retries) → set `email_failed_at`, log error.

---

### 5.3 `WhatsAppChannel`

**File:** `App\Infrastructure\Shared\Notification\Channels\WhatsAppChannel`

**Added in Phase 15D-I.** Best-effort, additive. Silent failure on any guard not met.

**Guard chain (all must pass):**
1. `payload->tenantId !== null` — platform notifications excluded.
2. Category is not `billing` or `security`.
3. `WhatsAppEligibleNotificationTypes::isEligible($payload->type)` — explicit whitelist.
4. `TenantCrmSettingsService::isWhatsAppNotificationsEnabled($tenantId)` — tenant-level feature toggle.
5. `TenantCrmSettingsService::resolveTemplateNameForNotification($tenantId, $type)` — must resolve a non-empty template name.
6. Template found AND `status === APPROVED` (via `WhatsAppTemplateRepositoryInterface`).
7. WABA connection found AND `connectionStatus === ACTIVE` (via `WhatsAppConnectionRepositoryInterface`).
8. `lead_id` exists and is numeric in `payload->data`.
9. `NotificationPreferenceService::shouldDeliver()` confirms channel enabled for recipient.

On passing all guards: dispatches `SendWhatsAppNotificationJob` onto the priority queue.

---

## 6. Queue Architecture

Three dedicated queues for notification email jobs:

| Queue Name | Priority | Worker Configuration |
|---|---|---|
| `notifications-high` | Critical (security/billing) | Dedicated worker — never behind other queues. |
| `notifications-default` | Normal | Standard shared worker. |
| `notifications-low` | Background | Low-priority worker, can be delayed. |

**Note:** WhatsApp jobs also honor `payload->priority->toQueueName()` for queue selection, meaning a high-priority WhatsApp notification lands on `notifications-high`.

---

## 7. HTTP Layer

### 7.1 Platform Admin Notifications (/api/development/super-admin)

**Controller:** `AdminNotificationController`

| Method | Route | Action |
|---|---|---|
| GET | `/notifications` | `index()` — Paginated list for authenticated admin. Filterable by `unread_only=true`. |
| GET | `/notifications/unread-count` | `unreadCount()` — Returns integer count for polling. |
| POST | `/notifications/{id}/mark-read` | `markRead()` — Marks single notification read. |
| POST | `/notifications/mark-all-read` | `markAllRead()` — Marks all as read for authenticated admin. |

**Controller:** `AdminNotificationPreferenceController`

| Method | Route | Action |
|---|---|---|
| GET | `/notification-preferences` | List current preferences for authenticated admin. |
| PUT | `/notification-preferences` | Update via `UpdateNotificationPreferencesUseCase`. |

---

### 7.2 Tenant User Notifications (/api/development/tenant-admin)

**Controller:** `NotificationController` (TenantAdminDashboard)

| Method | Route | Action |
|---|---|---|
| GET | `/notifications` | `index()` — Unread notifications for current tenant user. |
| POST | `/notifications/{id}/mark-read` | `markRead()`. |
| POST | `/notifications/mark-all-read` | `markAllRead()`. |

**Controller:** `TenantNotificationPreferenceController`

| Method | Route | Action |
|---|---|---|
| GET | `/notification-preferences` | List preferences. |
| PUT | `/notification-preferences` | Update via `UpdateNotificationPreferencesUseCase`. |

---

## 8. Scheduled Commands

### 8.1 `notifications:cleanup`

**Schedule:** Daily (recommended — confirm in `Console/Kernel.php`).

**Actions:**
1. Delete READ notifications where `created_at < now() - 30 days`.
2. Delete UNREAD notifications where `created_at < now() - 90 days`.
3. Delete `notification_sent_log` records where `sent_at < now() - 90 days`.

**Run manually:**
```powershell
docker exec -it ubotz_backend php artisan notifications:cleanup
```

---

### 8.2 `notifications:retry-failed`

**Status: ⚠️ STUBBED — Retry logic not implemented.**

**What it will do (when complete):**
- Find `NotificationRecord` rows where `email_failed_at IS NOT NULL AND email_sent_at IS NULL AND created_at >= now() - 7 days`.
- Reconstruct the payload and re-dispatch `SendNotificationEmail`.

**Run manually:**
```powershell
docker exec -it ubotz_backend php artisan notifications:retry-failed
```

---

## 9. API Response Format

All notification endpoints return the standard JSON envelope:

```json
{
  "data": [
    {
      "id": 42,
      "type": "payment_successful",
      "category": "billing",
      "title": "Invoice #1234 Paid",
      "body": "Your invoice of ₹4,999 has been paid.",
      "action_url": "/billing/invoices/1234",
      "read_at": null,
      "created_at": "2026-03-27T05:41:00Z"
    }
  ],
  "meta": {
    "current_page": 1,
    "last_page": 3,
    "per_page": 20,
    "total": 52
  },
  "errors": []
}
```

---

## 10. Known Implementation Gaps

| Gap | Description | Severity |
|---|---|---|
| **Ad-hoc paths bypass dispatcher** | `SendEnrollmentNotificationUseCase`, `SendWaitlistJoinedNotificationUseCase`, and `NotifyTenantProvisionedListener` bypass `NotificationDispatcher` — preference gating not applied. | High |
| **`retry-failed` is stubbed** | `notifications:retry-failed` does not actually re-dispatch jobs. Only counts failures. | Medium |
| **No SuperAdmin broadcast capability** | Platform-wide broadcasts (maintenance alerts, feature announcements) to all tenants are not implemented. | Medium |
| **No template engine** | Email and in-app content is hardcoded per event listener. No dynamic template resolution from DB. | Low (future) |

---

*End of Document — UBOTZ 2.0 System Notifications Full Technical Specification — March 27, 2026*
