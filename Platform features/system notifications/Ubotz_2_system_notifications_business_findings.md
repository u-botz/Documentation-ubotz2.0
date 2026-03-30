# UBOTZ 2.0 — System Notifications: Business Findings & Design

| Field | Value |
|---|---|
| **Document Type** | Principal Engineer — Business Logic Audit |
| **Feature** | System Notifications (Communication Hub) |
| **Date** | 2026-03-27 |
| **Issued By** | Principal Engineer / Architecture Auditor |
| **Scope** | Multi-channel notification delivery, preference management, retention policy |
| **Status** | REVIEWED — Reflects implemented codebase state |

---

## 1. Executive Summary

UBOTZ 2.0 requires a reliable, multi-channel notification system that serves two distinct audiences:

1. **Platform Admins** — Receive alerts for platform-level events (security, billing, system).
2. **Tenant Users** — Receive alerts for tenant-level events (enrollment, quiz results, lead assignment).

The system currently delivers notifications across three channels — **In-App**, **Email**, and **WhatsApp** — driven by a unified `NotificationPayload` value object that all domain events produce and the `NotificationDispatcher` routes.

This document defines the business rules governing what is notified, to whom, via which channel, and what users can opt out of.

---

## 2. Current State — What Exists Today

### 2.1 What Is Implemented

| Component | Status |
|---|---|
| `NotificationPayload` value object (unified envelope) | ✅ Implemented |
| `NotificationDispatcher` (multi-channel router) | ✅ Implemented |
| `InAppChannel` (DB persistence for in-app bell) | ✅ Implemented |
| `EmailChannel` (queued email with retry) | ✅ Implemented |
| `WhatsAppChannel` (tenant WABA via CRM, additive) | ✅ Implemented |
| `NotificationPreferenceService` (opt-out gating) | ✅ Implemented |
| `UpdateNotificationPreferencesUseCase` | ✅ Implemented |
| `notifications:cleanup` scheduled command | ✅ Implemented |
| `notifications:retry-failed` scheduled command | ⚠️ Stubbed — retry logic incomplete |

### 2.2 What Is Fragmented

Despite having a dispatcher, some bounded contexts still send notifications ad-hoc without going through the `NotificationDispatcher`:
- **Enrollment**: `SendEnrollmentNotificationUseCase` sends email directly.
- **Tenant Provisioning**: Welcome email listener separately handles the `TenantCreated` event.
- **Lead Management**: `SendNotificationExecutor` dispatches WhatsApp messages outside the dispatcher.

**Business Impact:** Opt-out preferences are not checked for ad-hoc notifications. Categories like `SECURITY` and `BILLING` are correctly mandatory for the dispatcher path, but the ad-hoc paths bypass this entirely.

---

## 3. Notification Categories & Mandatory Rules

The system classifies every notification into one of four categories:

| Category | Value | Mandatory? | Opt-Out Allowed? |
|---|---|---|---|
| **Security** | `security` | ✅ YES | ❌ Never |
| **Billing** | `billing` | ✅ YES | ❌ Never |
| **System** | `system` | ❌ No | ✅ User can opt out |
| **Communication** | `communication` | ❌ No | ✅ User can opt out |
| **Leave** | `leave` | ❌ No | ✅ User can opt out |

**Mandatory Rule:** `NotificationCategory::isMandatory()` returns `true` for `security` and `billing`. The `NotificationPreferenceService::shouldDeliver()` skips the preference DB lookup entirely for mandatory categories and always returns `true`.

---

## 4. Notification Channels

### 4.1 In-App (Dashboard Bell)

All notifications are always persisted in-app (subject to preference check). The record appears in the user's dashboard notification list.

- **Delivery**: Synchronous — written to the `notifications` table directly.
- **Read tracking**: `read_at` TIMESTAMP — NULL = unread.
- **Opt-out**: Subject to preference check for non-mandatory categories.

### 4.2 Email

Email delivery is asynchronous — a job (`SendNotificationEmail`) is queued onto a prioritized queue.

- **Prerequisite**: `emailTemplate` must be provided in the payload.
- **Retry Policy**: 3 attempts, with exponential backoff: 60s → 300s → 900s.
- **Failure tracking**: `email_failed_at` timestamp set after all retries exhausted.
- **Success tracking**: `email_sent_at` timestamp set on confirmation.
- **Opt-out**: Subject to preference check (mandatory categories bypass).

### 4.3 WhatsApp (Tenant CRM — Additive)

WhatsApp is an **additive best-effort channel** exclusively for tenant-scoped notifications. It fires independently from the main dispatcher loop and requires multiple eligibility checks before dispatching.

**WhatsApp is NOT delivered if any of the following are true:**
1. `tenantId` is `null` (platform-level notifications never go to WhatsApp).
2. Category is `billing` or `security`.
3. The notification `type` is not in `WhatsAppEligibleNotificationTypes`.
4. The tenant does not have WhatsApp notifications enabled in CRM settings.
5. No matching approved WhatsApp template exists for the notification type.
6. The tenant's WABA connection is not `ACTIVE`.
7. No `lead_id` is found in `payload.data`.
8. The user has opted out of WhatsApp for this category.

---

## 5. Priority & Queue Architecture

Every notification has a priority that maps to a dedicated queue. This ensures critical notifications (security/billing) are never delayed by a backlog of low-priority alerts.

| Priority | Label | Queue | Use Cases |
|---|---|---|---|
| `high` | High | `notifications-high` | Security alerts, payment failures, account locks. |
| `default` | Default | `notifications-default` | System updates, enrollment confirmations. |
| `low` | Low | `notifications-low` | Reminders, achievement notifications. |

---

## 6. Dispatch Decision Logic

The dispatcher checks preferences per channel before routing. The full decision tree for each channel:

```
For each channel in payload.channels:
  1. Is the category mandatory? → SKIP preference check, deliver.
  2. Does preference exist for (userType, userId, category, channel)? → Check enabled flag.
  3. No preference record? → Default = DELIVER (opt-in by default).
```

WhatsApp runs AFTER the channel loop as a separate additive pass with its own full eligibility check (§4.3).

---

## 7. Notification Preference Rules

Users can opt out of non-mandatory notification categories per channel.

**Rules:**
- `BILLING` and `SECURITY` categories **cannot be disabled**. The `UpdateNotificationPreferencesUseCase` throws `InvalidArgumentException` if a user attempts to disable a mandatory category.
- If no preference record exists for a (userType, userId, category, channel) combination, the **default is to deliver** (opt-in mode).
- Preference changes are audit-logged via `AuditLoggerInterface`.

---

## 8. Recipient Types

The system supports two recipient types:

| Type | Maps To | Table |
|---|---|---|
| `admin` | Platform administrators | `admins` |
| `user` | Tenant users | `users` |

The recipient type determines:
- Which DB table is queried to resolve the email address in `SendNotificationEmail`.
- How `ListNotificationsUseCase` filters the `notifications` table for in-app display.

---

## 9. Retention Policy

A scheduled `notifications:cleanup` command enforces data retention:

| Notification State | Retention Period |
|---|---|
| **Read notifications** | 30 days |
| **Unread notifications** | 90 days |
| **Sent log records** (`notification_sent_log`) | 90 days |

---

## 10. Business Rules — Complete Reference

| ID | Rule | Enforcement Point |
|---|---|---|
| BR-NOTIF-01 | `billing` and `security` categories cannot be disabled by the user. | `UpdateNotificationPreferencesUseCase`, `NotificationPreferenceService::shouldDeliver()`. |
| BR-NOTIF-02 | WhatsApp is never sent for platform-level notifications (`tenantId = null`). | `WhatsAppChannel::send()` early return. |
| BR-NOTIF-03 | WhatsApp is never sent for `billing` or `security` categories. | `WhatsAppChannel::send()` category guard. |
| BR-NOTIF-04 | WhatsApp requires an approved template AND active WABA connection. | `WhatsAppChannel::send()` repository checks. |
| BR-NOTIF-05 | If no preference record exists, delivery defaults to enabled (opt-in). | `NotificationPreferenceService::shouldDeliver()`. |
| BR-NOTIF-06 | Email delivery requires `emailTemplate` to be set in the payload. | `NotificationDispatcher::dispatch()` — `EmailChannel` is skipped if template is null. |
| BR-NOTIF-07 | Email jobs retry 3 times with backoff (60s, 300s, 900s) before marking failed. | `SendNotificationEmail::$tries`, `$backoff`. |
| BR-NOTIF-08 | Read notifications expire after 30 days; unread after 90 days. | `CleanupNotifications` scheduled command. |
| BR-NOTIF-09 | Notifications are scoped to the correct tenant — `tenantId` is always set for tenant events. | `NotificationPayload::$tenantId`. |
| BR-NOTIF-10 | All ad-hoc notification paths (enrollment, provisioning) must be migrated to go through `NotificationDispatcher` so preference gating applies. | **Gap — Future remediation required.** |

---

## 11. Open Questions for Product Owner

| # | Question | Impact |
|---|---|---|
| 1 | Should unread notifications older than 90 days show a warning before deletion vs. silently purged? | User experience on re-visiting old accounts. |
| 2 | Should `notifications:retry-failed` perform actual re-dispatch, or only alert platform admins of stuck failures? | Currently stubbed — requires product decision on retry ownership. |
| 3 | Should WhatsApp notifications for `system` category be allowed in a future phase? | Eligibility exception list expansion. |
| 4 | Should platform admins (L4+) have a "Notification Health" dashboard showing failed email counts? | Monitoring and ops visibility. |

---

*End of Document — UBOTZ 2.0 System Notifications Business Findings — March 27, 2026*
