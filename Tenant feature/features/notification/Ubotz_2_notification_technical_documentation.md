# UBOTZ 2.0 Notification System Technical Specification

## Core Architecture
The Notification system follows an "Observer/Subscriber" pattern (`TenantAdminDashboard\Notification`). It acts as a downstream consumer for almost every other domain context.

## Relational Schema Constraints

### 1. Preferences (`notification_preferences`)
- **`tenant_id` / `user_id`**: Structural isolation.
- **`type`**: The category of notification (e.g., `payment_success`).
- **`is_enabled`**: Boolean flag.

### 2. Audit Trial (`notification_sent_log`)
- **`notification_type`**: The category string.
- **`entity_type` / `entity_id`**: Polymorphic link to the source record (e.g. `Order:123`).
- **Unique Constraint**: `unq_notif_sent_log` prevents duplicate notifications for the same event-entity pair during retry cycles.

## Key Technical Workflows

### The Notification Pipeline
1. A Domain Event is triggered.
2. The `NotificationManager` resolves the recipient's `preferences`.
3. If enabled for the target vector (Email/Push), the system generates a `NotificationJob`.
4. The job logs the attempt in `notification_sent_log` before calling the external provider (SendGrid/Firebase).

## Performance & Scaling
- **Asynchronous**: 100% of external notifications (Email/Push) are processed in the background queue.
- **Index Optimization**: `unq_notif_sent_log` facilitates rapid $O(1)$ deduplication checks before dispatch.

## Tenancy & Security
- **PII Scrubbing**: Logs never store the actual content of the email/message (Passwords, Tokens). They only store the fact that a message was sent.
- **Isolation**: Preferences are strictly scoped; a student's settings in one tenant have no effect on their settings in another.

---

## Linked References
- Related Modules: `User`, `CommunicationHub`.
