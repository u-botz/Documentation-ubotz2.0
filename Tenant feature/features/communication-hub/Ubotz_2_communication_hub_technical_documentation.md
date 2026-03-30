# UBOTZ 2.0 Communication Hub Technical Specification

“Communication” in UBOTZ spans **two** surfaces under `backend/routes/tenant_dashboard/communication.php`:

1. **Institution Communication Hub** — tenant-wide announcements (`communication_messages`, audiences, recipients, revisions).
2. **Course communication modules** — per-course **FAQ**, **forum**, and **noticeboard** (separate tables; gated by `module.faq`, `module.forum`, `module.noticeboard`).

Application code for the hub: `App\Application\TenantAdminDashboard\CommunicationHub`; domain: `App\Domain\TenantAdminDashboard\CommunicationHub`.

---

## 1. HTTP surface (tenant API)

**Prefix:** `/api/tenant/communication` (inside the standard `/api/tenant` authenticated group).

### 1.1 Communication Hub (institution messages)

Requires **`tenant.module:module.communication_hub`**.

| Capability | Routes |
|------------|--------|
| **`communication.view`** | `GET communication/inbox`, `GET communication/inbox/unread-count`, `GET communication/inbox/{messageId}`, `POST communication/inbox/{messageId}/acknowledge` |
| **`communication.create`** | `GET communication/messages`, `POST communication/messages`, `GET communication/messages/{id}`, `PUT communication/messages/{id}`, `POST communication/messages/{id}/publish`, `GET communication/messages/{id}/analytics` |
| **`communication.manage`** | `POST communication/messages/{id}/archive`, `DELETE communication/messages/{id}`, `GET communication/messages/{id}/revisions` |

**Note:** Publishing is **`POST …/messages/{id}/publish`**, guarded by **`communication.create`**, not a separate `communication.publish` capability.

### 1.2 Course FAQ (`module.faq`)

| Method | Path |
|--------|------|
| `GET` | `/courses/{courseId}/faqs` |
| `POST` | `/courses/{courseId}/faqs` |
| `PUT` | `/faqs/{id}` |
| `DELETE` | `/faqs/{id}` |

### 1.3 Course forum (`module.forum`)

| Method | Path |
|--------|------|
| `GET` | `/courses/{courseId}/forum` |
| `GET` | `/forum/topics/{topicId}/answers` |
| `POST` | `/courses/{courseId}/forum` |
| `POST` | `/forum/{id}/pin` |
| `POST` | `/forum/topics/{topicId}/answers` |
| `POST` | `/forum/answers/{id}/resolve` |

### 1.4 Course noticeboard (`module.noticeboard`)

| Method | Path |
|--------|------|
| `GET` | `/courses/{courseId}/noticeboards` |
| `POST` | `/courses/{courseId}/noticeboards` |
| `DELETE` | `/noticeboards/{id}` |
| `POST` | `/noticeboards/{id}/mark-read` |

**Frontend:** `frontend/config/api-endpoints.ts` — `TENANT_COMMUNICATION.*` for course-scoped paths. Hub APIs are used from `frontend/features/communication/api/messages-api.ts` and `inbox-api.ts`.

---

## 2. Relational schema — Communication Hub (tenant DB)

Migration: `2026_03_22_100000_create_communication_hub_tables.php`.

### 2.1 `communication_messages`

| Column | Role |
|--------|------|
| `tenant_id` | FK `fk_comm_msg_tenant` |
| `title`, `body`, `type`, `status` | Content and lifecycle (default `draft`) |
| `requires_acknowledgment` | Drives inbox acknowledge flow |
| `created_by_user_id` | Author |
| `published_at`, `archived_at`, `deleted_at` | Lifecycle / soft delete |
| `revision_count` | Bumps when revisions stored |

Indexes include `idx_comm_msg_tenant_status`, `idx_comm_msg_published_at`.

### 2.2 `communication_message_audiences`

`scope_type` + optional `scope_id` (polymorphic targeting). FK to message, cascade on delete.

### 2.3 `communication_message_recipients`

Per-user ledger: `communication_message_id`, `user_id`, **`tenant_id`** (redundant FK for inbox scoping), `read_at`, `acknowledged_at`. Unique `(communication_message_id, user_id)`.

### 2.4 `communication_message_revisions`

Append-only history: `revision_number`, `title`, `body`, `edited_by_user_id`.

---

## 3. Relational schema — course communication (tenant DB)

Migration: `2026_03_05_190000_create_communication_tables.php`.

- **`course_faqs`** — `course_id`, `title`, `answer`, `order_index`.
- **`course_forum_topics`** / **`course_forum_answers`** — topics and threaded answers; pin/resolve flags.
- **`course_noticeboards`** / **`course_noticeboard_reads`** — notices and per-user read state.

---

## 4. Key workflows (hub)

### 4.1 Publish

**`PublishCommunicationMessageUseCase`** (not a generically named “dispatch job” in routes):

- Validates draft status, audiences (or loads saved audiences), **`AudienceTargetValidator`**, and **scope enforcement** (`ScopeEnforcementPolicyFactoryInterface` — branch/teacher/admin policies in `Infrastructure\Persistence\TenantAdminDashboard\CommunicationHub\ScopePolicies\`).
- Persists publish state and **`RecipientMaterializationServiceInterface`** expands audiences into **`communication_message_recipients`**.
- Dispatches **`CommunicationMessagePublished`**; **`SendCommunicationMessagePublishedListener`** is registered in `NotificationServiceProvider` for downstream notification handling.

### 4.2 Revisions

Updates bump **`revision_count`** and persist rows in **`communication_message_revisions`** (see write use cases / repository).

### 4.3 Inbox

Read/ack flows use **`CommunicationHubInboxController`** with **`CommunicationHubQueryServiceInterface`**, **`MarkMessageAsReadUseCase`**, **`AcknowledgeMessageUseCase`**.

---

## 5. Central platform entitlements

`2026_03_29_120000_split_communication_module_entitlements.php` (central DB) may split module flags for communication products — see migration for subscription/plan wiring.

---

## 6. Linked code references

| Layer | Path |
|-------|------|
| Application (hub) | `backend/app/Application/TenantAdminDashboard/CommunicationHub/` |
| Domain (hub) | `backend/app/Domain/TenantAdminDashboard/CommunicationHub/` |
| HTTP (hub) | `backend/app/Http/TenantAdminDashboard/CommunicationHub/Controllers/` |
| Course comms | `backend/app/Http/Controllers/Api/TenantAdminDashboard/CourseCommunication/` |
| Routes | `backend/routes/tenant_dashboard/communication.php` |

---

## 7. Document history

- Replaced **`DispatchCommunicationJob`** and **`communication.publish`** with **actual** use cases, event/listener names, and **route capabilities**.
- Documented **course-level** FAQ/forum/noticeboard as part of the same route file but **different modules and tables**.
