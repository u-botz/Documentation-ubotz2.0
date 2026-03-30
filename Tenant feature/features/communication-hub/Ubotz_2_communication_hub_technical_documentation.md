# UBOTZ 2.0 Communication Hub Technical Specification

## Core Architecture
The Communication Hub uses an "Append-Only" revision model for its message engine (`TenantAdminDashboard\CommunicationHub`). It manages the lifecycle of high-volume mass notifications.

## Relational Schema Constraints

### 1. Message Definitions (`communication_messages`)
- **`tenant_id`**: Structural isolation key.
- **`revision_count`**: Counter for tracking the number of edits stored in `communication_message_revisions`.
- **Indices**: `idx_comm_msg_tenant_status` ensures that background dispatchers can rapidly find `published` messages for delivery.

### 2. Audience & Delivery
- **`communication_message_audiences`**: Defines the "Who". Uses a generic `scope_type`/`scope_id` pattern (e.g. `scope_type: batch`).
- **`communication_message_recipients`**: The delivery ledger. Maps messages to specific `user_id` entries.
  - **Read Tracking**: Stores `read_at` and `acknowledged_at`.
  - **Index**: `idx_comm_recip_user_inbox` optimizes the student's personal notification feed query.

## Key Technical Workflows

### The Dispatch Pipeline
1. Message transitioned to `status: published`.
2. `DispatchCommunicationJob` resolves the `Audiences` into a collection of `UserIds`.
3. Bulk inserts are executed in the `communication_message_recipients` table.
4. Downstream triggers fire Push/Email events via the `Notification` context.

### Revision Immutability
When a message is edited, a snapshot is taken and saved to `communication_message_revisions`. The main message body is updated, but the historical trail is preserved for auditing purposes.

## Tenancy & Security
Every recipient record is tagged with `tenant_id` (`fk_comm_recip_tenant`). This is a redundancy measure ensuring that even under misconfiguration, user IDs cannot be leaked cross-tenant during broadcast expansion.

---

## Linked References
- Related Modules: `Notification`, `User`, `Role`.
