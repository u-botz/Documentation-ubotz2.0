# UBOTZ 2.0 — Notifications — Technical Specification

## Scope

Two surfaces:

1. **Tenant users** — in-app notification inbox + per-user channel preferences (`/api/tenant/...`).
2. **Platform admins** — separate inbox under `/api/platform/...` (Super Admin JWT), defined in `backend/routes/api.php`.

This document focuses on the **tenant** feature; platform routes are listed for orientation only.

## Tenant route entry point

| File | Prefix |
|------|--------|
| `backend/routes/tenant_dashboard/notification.php` | `/api/tenant/notifications` |

Registered inside the same authenticated `tenant` route group as other dashboard APIs (`backend/routes/api.php`).

| Method | Path | Handler |
|--------|------|---------|
| `GET` | `/notifications` | `NotificationController::index` — paginated list; supports `unread_only` (see `ListNotificationsRequest`) |
| `GET` | `/notifications/unread-count` | `NotificationController::unreadCount` |
| `POST` | `/notifications/{id}/read` | `NotificationController::markRead` |
| `POST` | `/notifications/read-all` | `NotificationController::markAllRead` |
| `GET` | `/notifications/preferences` | `TenantNotificationPreferenceController::index` |
| `PUT` | `/notifications/preferences` | `TenantNotificationPreferenceController::update` — batch update via `UpdateNotificationPreferencesUseCase` |

**Canonical base URL:** `https://{host}/api/tenant/notifications` — mirrored in `frontend/config/api-endpoints.ts` as **`TENANT_NOTIFICATIONS`**.

## Data model (tenant DB)

| Migration | Artifact |
|-----------|----------|
| `2026_03_14_101112_create_notifications_table.php` | **`notifications`** — `notifiable_type` / `notifiable_id`, `tenant_id`, `type`, `category`, `title`, `body`, `data` (JSON), `action_url`, `read_at`, email send/fail timestamps |
| `2026_03_14_101525_create_notification_preferences_table.php` | **`notification_preferences`** — polymorphic `preferable_type` / `preferable_id`, `category`, `channel`, `enabled`; unique `(preferable_type, preferable_id, category, channel)` |
| `2026_03_14_101546_create_notification_sent_log_table.php` | **`notification_sent_log`** — dedup key `unq_notif_sent_log` on `(notification_type, entity_type, entity_id)` (later migrations may extend columns) |

An older **`tenant_notifications`** migration exists; the **tenant inbox API** queries the **`notifications`** table via `NotificationRecord` (`App\Infrastructure\Database\Models\NotificationRecord`), scoped by `TenantContext` and `notifiable_id` = current user.

## Application layer (examples)

- **Preferences:** `ListNotificationPreferencesQuery`, `UpdateNotificationPreferencesUseCase` (`App\Application\Shared\Notification\`)
- **Email delivery:** `SendNotificationEmailJob` (`ShouldQueue`) — used by multiple domain use cases (enrollment, waitlist, course notices, etc.)
- **In-app persistence:** Domain/application services create rows consumers read through `NotificationController`

## Platform admin notifications (reference)

Under `Route::prefix('platform')` + `auth:admin_api` (see `api.php`):

- `GET /api/platform/notifications`, `unread-count`, `POST .../read`, `read-all`, preferences — **not** the same codebase path as tenant routes; different controllers (`AdminNotificationController`).

## Scheduling

`backend/routes/console.php`:

- `notifications:cleanup` — daily `02:20`
- `notifications:process-overages` — every 15 minutes
- `notifications:retry-failed` — hourly
- `notifications:preaggregate-unread` — every 15 minutes

---

## Linked references

- **Tenant context** — `TenantContext` scopes inbox queries
- **Other domains** — course, enrollment, waitlist, etc. emit notifications via application services and jobs
