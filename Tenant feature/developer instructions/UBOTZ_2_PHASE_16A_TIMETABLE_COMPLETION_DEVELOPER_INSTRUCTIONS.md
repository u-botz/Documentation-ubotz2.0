# UBOTZ 2.0 — Phase 16A Developer Instructions

## Timetable & Scheduling System — Full Completion (Backend + Frontend)

| Field | Value |
|---|---|
| **Document Type** | Developer Instruction (Pre-Implementation Brief) |
| **Phase** | 16A |
| **Date** | March 18, 2026 |
| **Issued By** | Principal Engineer / Architecture Auditor |
| **Audience** | Implementation Developer (Antigravity) |
| **Expected Deliverable** | Phase 16A Implementation Plan (same format as 10A–14 plans) |
| **Prerequisites** | Timetable domain layer exists (partially implemented), Attendance system complete, Notification infrastructure (Phase 14) complete, RBAC (Phase 10A) complete, Module entitlement (`module.erp.timetable`) seeded |

> **This phase completes the Timetable & Scheduling system end-to-end. The backend has solid domain foundations — entities, value objects, status machines, conflict detection, generation pipeline — but is missing most of the HTTP surface area required to operate the system. The frontend is effectively zero. Phase 16A closes every gap and delivers a production-ready timetable module for Tenant Admins and Coordinators.**

---

## 1. Mission Statement

Phase 16A transforms the partially-implemented timetable backend into a fully operational scheduling system with a complete Tenant Admin frontend. When this phase is done, a Tenant Admin can:

1. Define venues (optional) and holidays for their institution
2. Create a weekly schedule template for a batch
3. Add time slots to that template (Monday Physics 9–10 with Teacher X, Wednesday Chemistry 10–11 with Teacher Y)
4. Publish the template — system auto-generates session instances for the configured look-ahead period
5. View all sessions in a calendar (week/day) or list view, filtered by batch, teacher, or date
6. Reschedule or cancel individual session instances
7. Assign substitute teachers for specific sessions
8. Manage a holiday calendar that automatically suppresses session generation on holidays
9. Students and parents can view their batch schedule (read-only, deferred to Phase 16B)

**The first release targets Tenant Admin / Coordinator users only.** Student/parent read-only views and teacher self-service views are explicitly deferred to Phase 16B.

---

## 2. Current State Assessment

### 2.1 What Exists (Backend)

| Area | Status | Notes |
|---|---|---|
| **Tenant migrations** | ✅ Complete | `timetable_settings`, `schedule_templates`, `template_slots`, `session_instances`, `venues`, `holidays` |
| **Domain layer** | ✅ Mostly complete | Entities, VOs, status machines, domain events, repository interfaces |
| **Schedule templates** | ✅ Create + Publish | `GET /list`, `POST /create`, `POST /{id}/publish` routes exist |
| **Session instances** | ✅ Partial | `GET /list` (with filters), `POST /ad-hoc`, `POST /{id}/cancel` |
| **Template slots** | ⚠️ UseCase exists, NO route | `CreateTemplateSlotUseCase` + `CreateTemplateSlotRequest` + `CreateTemplateSlotCommand` exist. No controller/route. |
| **Generation pipeline** | ✅ Works (when slots exist) | `PublishScheduleTemplateUseCase` → `ScheduleTemplatePublished` event → `TriggerInstanceGeneration` listener → `GenerateSessionInstancesUseCase` |
| **Conflict detection** | ✅ Implemented, NOT reachable | `ConflictDetectionService` checks teacher/venue overlap. Only invoked from `CreateTemplateSlotUseCase`. Not applied to ad-hoc sessions or during generation. |
| **Venue management** | ⚠️ Model + Repo only | `TimetableQueryService::getVenues()` reads. No CRUD routes. |
| **Holiday management** | ⚠️ Model + Repo only | `HolidayRepository` used in generation. `TimetableQueryService::getHolidays()` reads. No CRUD routes. |
| **Session status cron** | ✅ Works | `ubotz:timetable:update-statuses` transitions `scheduled→in_progress→completed` by wall clock |
| **Attendance integration** | ✅ Works | `LinkTimetableSessionUseCase` ties timetable sessions to attendance |
| **Module entitlement** | ✅ Seeded | `module.erp.timetable` with `timetable.view` / `timetable.manage` |
| **Frontend** | ❌ Nothing | Placeholder buttons only |

### 2.2 What Is Missing (Backend Gaps)

| Gap ID | Missing Capability | Priority | Impact |
|---|---|---|---|
| **GAP-01** | Template slot CRUD routes (add/edit/delete slots on a template) | **Critical** | Without this, templates have no slots → generation produces nothing → the entire system is non-functional from the UI |
| **GAP-02** | Template update route (edit name, batch, date range) | **High** | Admin cannot correct a template after creation |
| **GAP-03** | Template delete/archive route | **Medium** | Admin cannot remove obsolete templates |
| **GAP-04** | Session instance reschedule route | **High** | Teacher sick on Wednesday → admin cannot move the class to Thursday |
| **GAP-05** | Substitute teacher assignment route | **High** | Teacher absent → admin cannot assign a replacement for that session |
| **GAP-06** | Venue CRUD routes | **High** | Multi-branch/offline institutions cannot manage rooms |
| **GAP-07** | Holiday CRUD routes | **Critical** | No way to add/edit/remove holidays from the UI → sessions generated on holidays |
| **GAP-08** | Conflict detection on ad-hoc sessions | **Medium** | Ad-hoc session creation bypasses all conflict checks |
| **GAP-09** | Conflict detection during instance generation | **Low** | Cross-template conflicts not caught when materializing instances (rare edge case) |
| **GAP-10** | Status cron bypasses domain entities | **Tech Debt** | `ubotz:timetable:update-statuses` does batch DB updates without going through domain entity transitions |
| **GAP-11** | Batch selector filter on template/session APIs | **High** | Essential for institutions with multiple batches — cannot filter schedule by batch |
| **GAP-12** | Subject/course association on sessions | **Medium** | Sessions lack curriculum context — "Physics" is just text, not linked to a course entity |

### 2.3 What Is Missing (Frontend)

Everything. There are no timetable pages, components, services, or hooks in the frontend application.

---

## 3. Business Context — Why This Matters

### 3.1 Institution Owner Perspective

I run a coaching institute with 200 students across 4 batches. Today I manage my timetable in a paper register and WhatsApp groups. Here's what I need from EducoreOS:

**Week 1 setup (one-time):** I create a template for "JEE Morning Batch" and define the weekly pattern — Monday Physics 9:00–10:30 with Sharma Sir, Tuesday Chemistry 9:00–10:30 with Gupta Ma'am, and so on. I add my venue (Room 101) if I care about room tracking. I add holidays (Republic Day, Holi, summer break). I publish. The system generates all my sessions for the next 4 weeks.

**Daily operation:** I open the timetable, see today's sessions. Sharma Sir calls in sick — I tap his 9 AM session, assign Verma Sir as substitute. A parent calls asking "is there class tomorrow?" — I check the calendar. Tomorrow is a holiday I added → no sessions shown. Done.

**What breaks my trust:** If I add a holiday and the system still shows a session on that day. If I reschedule a class and the old time still shows up. If I can't see which batch has which schedule. If the system double-books a teacher and nobody catches it.

### 3.2 EdTech Product Owner Perspective

I run an online academy with 5,000 students across 15 cohort batches. My "sessions" are live Zoom classes.

**What I need:** Define the weekly live class schedule per batch. When I publish, the system generates the session instances. My operations team can see the full calendar, filter by batch or instructor, and reschedule when needed. Later phases will auto-generate Zoom links and send "class starting in 15 min" notifications — but for now, the scheduling engine must be solid.

**What differentiates a good timetable from a bad one:** Conflict detection (don't double-book my star instructor), holiday awareness (don't generate sessions during Diwali break), and the ability to make surgical changes (move one session, substitute one teacher) without blowing up the entire template.

---

## 4. Sub-Phase Breakdown

Phase 16A is split into **three sub-phases** to manage scope and enable incremental delivery:

| Sub-Phase | Scope | Depends On |
|---|---|---|
| **16A-I: Backend Completion** | Close all backend gaps (GAP-01 through GAP-12). Expose full HTTP CRUD for templates, slots, sessions, venues, holidays. Fix tech debt. | Existing timetable domain layer |
| **16A-II: Tenant Admin Frontend** | Build the complete timetable UI for Tenant Admin dashboard — template builder, calendar view, session management, venue/holiday management | 16A-I (needs working APIs) |
| **16A-III: Integration & Polish** | End-to-end testing, conflict detection UX, batch filter integration, status lifecycle validation, attendance linking verification | 16A-I + 16A-II |

**Phase 16B (future, NOT this document):** Student/parent read-only views, teacher self-service view, notification hooks ("class starting soon"), live class provider integration.

---

## 5. Sub-Phase 16A-I: Backend Completion

### 5.1 Venue Management CRUD

**Routes (under `/api/tenant/timetable/venues`):**

| Method | Path | UseCase | Capability |
|---|---|---|---|
| `GET` | `/` | `ListVenuesQuery` | `timetable.view` |
| `POST` | `/` | `CreateVenueUseCase` | `timetable.manage` |
| `PUT` | `/{id}` | `UpdateVenueUseCase` | `timetable.manage` |
| `DELETE` | `/{id}` | `ArchiveVenueUseCase` | `timetable.manage` |

**Business Rules:**

| Rule ID | Rule |
|---|---|
| VN-01 | Venue name must be unique within the tenant (case-insensitive). |
| VN-02 | Venue cannot be hard-deleted if it is referenced by any session instance. Soft-archive only (set `is_active = false`). |
| VN-03 | Archived venues do not appear in venue dropdowns but remain visible on historical sessions. |
| VN-04 | Optional fields: `capacity` (integer, nullable), `location_description` (text, nullable), `branch_id` (nullable FK — for multi-branch institutions). |

**Venue Entity fields:** `id`, `tenant_id`, `name`, `capacity`, `location_description`, `branch_id`, `is_active`, `created_at`, `updated_at`

---

### 5.2 Holiday Calendar CRUD

**Routes (under `/api/tenant/timetable/holidays`):**

| Method | Path | UseCase | Capability |
|---|---|---|---|
| `GET` | `/` | `ListHolidaysQuery` | `timetable.view` |
| `POST` | `/` | `CreateHolidayUseCase` | `timetable.manage` |
| `PUT` | `/{id}` | `UpdateHolidayUseCase` | `timetable.manage` |
| `DELETE` | `/{id}` | `DeleteHolidayUseCase` | `timetable.manage` |

**Business Rules:**

| Rule ID | Rule |
|---|---|
| HL-01 | A holiday is defined by: `date` (DATE), `name` (string), `branch_id` (nullable — null means all branches), `is_recurring` (boolean — e.g., Republic Day recurs yearly). |
| HL-02 | Duplicate date + branch_id combination is rejected (409 Conflict). |
| HL-03 | When a holiday is created for a date that has existing `scheduled` session instances, the system MUST NOT auto-cancel them. Instead, it flags them with `holiday_conflict = true`. The admin reviews and cancels manually. This prevents silent data destruction. |
| HL-04 | When a holiday is deleted, any `holiday_conflict` flags on that date's sessions are cleared. |
| HL-05 | The generation pipeline already skips holidays — this is implemented and working. No changes needed there. |
| HL-06 | `GET` supports filtering by year and branch_id. |

**Holiday Entity fields:** `id`, `tenant_id`, `date`, `name`, `branch_id`, `is_recurring`, `created_at`, `updated_at`

---

### 5.3 Template Slot CRUD (GAP-01 — Critical)

This is the most critical backend gap. Without exposed slot routes, the entire timetable system is non-functional from the UI.

**Routes (under `/api/tenant/timetable/templates/{templateId}/slots`):**

| Method | Path | UseCase | Capability |
|---|---|---|---|
| `GET` | `/` | `ListTemplateSlotsQuery` | `timetable.view` |
| `POST` | `/` | `CreateTemplateSlotUseCase` (already exists) | `timetable.manage` |
| `PUT` | `/{slotId}` | `UpdateTemplateSlotUseCase` (NEW) | `timetable.manage` |
| `DELETE` | `/{slotId}` | `DeleteTemplateSlotUseCase` (NEW) | `timetable.manage` |

**Business Rules:**

| Rule ID | Rule |
|---|---|
| TS-01 | Slots can only be added/edited/deleted on templates in `draft` status. If the template is `published`, slot mutations are blocked (409 Conflict). To change a published template's slots, the admin must create a new template version or the system must support "unpublish" (see TS-07). |
| TS-02 | Conflict detection (existing `ConflictDetectionService`) MUST run on both create and update. If `ConflictMode` is `hard`, reject with 409. If `warn`, return a `warnings` array in the response and proceed. |
| TS-03 | A slot is defined by: `day_of_week` (0=Sunday through 6=Saturday), `start_time` (HH:MM), `end_time` (HH:MM), `teacher_id` (FK to tenant user), `subject_id` (nullable FK — see §5.8), `venue_id` (nullable FK), `session_type` (enum: `offline_class`, `live_session`, `meeting`, `exam`). |
| TS-04 | `end_time` must be after `start_time`. No overnight slots (end_time > start_time within the same day). |
| TS-05 | `teacher_id` must reference a user within the same tenant who has a teacher-capable role. Cross-tenant teacher references are a **security violation**. |
| TS-06 | Deleting a slot from a draft template is a hard delete (no soft-delete needed — draft templates have no generated instances). |
| TS-07 | **Unpublish flow:** A published template can be transitioned back to `draft` status ONLY IF the admin explicitly confirms. This clears all **future** session instances generated from this template (instances in the past or with `completed`/`cancelled` status are preserved). Domain event: `ScheduleTemplateUnpublished`. |

**Template Slot Entity fields (existing):** `id`, `tenant_id`, `schedule_template_id`, `day_of_week`, `start_time`, `end_time`, `teacher_id`, `venue_id`, `subject_id`, `session_type`, `created_at`, `updated_at`

---

### 5.4 Template Update & Lifecycle (GAP-02, GAP-03)

**New routes (under `/api/tenant/timetable/templates`):**

| Method | Path | UseCase | Capability |
|---|---|---|---|
| `PUT` | `/{id}` | `UpdateScheduleTemplateUseCase` (NEW) | `timetable.manage` |
| `POST` | `/{id}/unpublish` | `UnpublishScheduleTemplateUseCase` (NEW) | `timetable.manage` |
| `DELETE` | `/{id}` | `ArchiveScheduleTemplateUseCase` (NEW) | `timetable.manage` |

**Business Rules:**

| Rule ID | Rule |
|---|---|
| TM-01 | Template `name` and `batch_id` can be updated in both `draft` and `published` states. Date range (`effective_from`, `effective_until`) can only be changed in `draft`. |
| TM-02 | Updating `effective_from`/`effective_until` on a draft template does not trigger regeneration (only publish does). |
| TM-03 | Archiving a template is a soft-delete. Archived templates do not appear in active lists. Historical session instances generated from archived templates remain intact. |
| TM-04 | A template cannot be archived while in `published` status with future scheduled instances. Admin must unpublish first or confirm cascade cancellation. |
| TM-05 | Unpublish (TS-07): transitions `published → draft`, cancels all **future scheduled** instances from this template, preserves past/completed/cancelled instances. Audit logged. |

---

### 5.5 Session Instance Reschedule (GAP-04)

**New route:**

| Method | Path | UseCase | Capability |
|---|---|---|---|
| `POST` | `/sessions/{id}/reschedule` | `RescheduleSessionInstanceUseCase` (NEW) | `timetable.manage` |

**Request body:** `{ "new_date": "2026-04-15", "new_start_time": "10:00", "new_end_time": "11:30", "reason": "Teacher unavailable" }`

**Business Rules:**

| Rule ID | Rule |
|---|---|
| RS-01 | Only sessions in `scheduled` status can be rescheduled. `in_progress`, `completed`, `cancelled` sessions cannot be rescheduled. |
| RS-02 | The original session's status transitions to `rescheduled`. The `rescheduled_to_date`, `rescheduled_to_start_time`, `rescheduled_to_end_time` fields are populated on the original record. |
| RS-03 | A NEW session instance is created with the new date/time, linked back to the original via `rescheduled_from_id`. The new session starts as `scheduled`. |
| RS-04 | Conflict detection MUST run on the new date/time for the teacher and venue. If conflict, reject with 409. |
| RS-05 | `reason` is mandatory (min 5 characters). Stored in audit log. |
| RS-06 | Domain event: `SessionInstanceRescheduled` (carries both original and new session IDs). |
| RS-07 | If the rescheduled session was already linked to an attendance session, the attendance link is NOT automatically transferred. The admin must re-link attendance manually (or the system creates a new attendance session for the new instance). |

---

### 5.6 Substitute Teacher Assignment (GAP-05)

**New route:**

| Method | Path | UseCase | Capability |
|---|---|---|---|
| `POST` | `/sessions/{id}/substitute` | `AssignSubstituteTeacherUseCase` (NEW) | `timetable.manage` |

**Request body:** `{ "substitute_teacher_id": "uuid", "reason": "Original teacher on medical leave" }`

**Business Rules:**

| Rule ID | Rule |
|---|---|
| SB-01 | Only sessions in `scheduled` status can have a substitute assigned. |
| SB-02 | The `original_teacher_id` field (already exists on `session_instances`) is populated with the current teacher, and `teacher_id` is updated to the substitute. |
| SB-03 | `substitute_teacher_id` must be a valid teacher within the same tenant. Cross-tenant assignment is a **security violation**. |
| SB-04 | Conflict detection MUST check if the substitute teacher is already scheduled for another session at the same time. If conflict, reject with 409. |
| SB-05 | `reason` is mandatory (min 5 characters). Audit logged. |
| SB-06 | Domain event: `SessionTeacherSubstituted` (carries session ID, original teacher, substitute teacher). |
| SB-07 | A substitute can be "reverted" by calling the same endpoint with the original teacher's ID. The system treats this as another substitution (audit trail preserved). |

---

### 5.7 Ad-hoc Session Conflict Detection (GAP-08)

**Modification to existing `CreateAdHocSessionUseCase`:**

| Rule ID | Rule |
|---|---|
| AH-01 | Before creating an ad-hoc session, run `ConflictDetectionService` against all existing session instances for the same date, checking teacher and venue overlaps. |
| AH-02 | Conflict mode uses the tenant's `timetable_settings.conflict_mode` value (hard block or warn). |
| AH-03 | If warn mode: return `warnings` array in the response body alongside the created session. |

---

### 5.8 Subject/Course Association on Sessions (GAP-12)

**This is a data linkage enhancement, not a new CRUD vertical.**

| Rule ID | Rule |
|---|---|
| SJ-01 | `template_slots.subject_id` already exists. Ensure it references the tenant's `subjects` table (from the exam hierarchy bounded context). |
| SJ-02 | The API response for both slots and session instances must include `subject` as an expanded object: `{ "id": "...", "name": "Physics" }`. |
| SJ-03 | Subject assignment is optional. Sessions without a subject are valid (meetings, doubt sessions, etc.). |
| SJ-04 | Subject is inherited from template slot to session instance during generation. Ad-hoc sessions accept `subject_id` as an optional parameter. |
| SJ-05 | Subject filtering on the session list API: `GET /sessions?subject_id=uuid` |

---

### 5.9 Batch Filter Enhancement (GAP-11)

| Rule ID | Rule |
|---|---|
| BF-01 | Templates are already associated with a `batch_id`. Session instances inherit `batch_id` from their parent template. |
| BF-02 | The session list API `GET /sessions` must support `?batch_id=uuid` filter. |
| BF-03 | The template list API `GET /templates` must support `?batch_id=uuid` filter. |
| BF-04 | The calendar frontend view defaults to showing all batches, with a batch selector dropdown to filter. |

---

### 5.10 Tech Debt: Status Cron Domain Bypass (GAP-10)

| Rule ID | Rule |
|---|---|
| TD-01 | `ubotz:timetable:update-statuses` currently performs batch SQL updates directly on `session_instances` records, bypassing domain entity status transitions. |
| TD-02 | **Recommended fix:** Load each affected session instance as a domain entity, call the appropriate transition method (`markInProgress()`, `markCompleted()`), and persist via the repository. This ensures domain invariants are enforced and domain events are dispatched. |
| TD-03 | **Performance trade-off:** For tenants with hundreds of daily sessions, loading entities individually is expensive. Acceptable approach: batch-load, transition in memory, batch-persist. Domain events can be collected and dispatched after the batch. |
| TD-04 | **Minimum viable fix for Phase 16A:** At minimum, ensure the cron only transitions sessions through valid state transitions (don't transition `cancelled` to `completed`). If the current implementation already does this correctly, document it as acceptable tech debt and defer full domain-entity migration to a future performance optimization phase. |

---

## 6. Sub-Phase 16A-II: Tenant Admin Frontend

### 6.1 Navigation & Entry Points

**Sidebar placement:** Under "Academic" section in the Tenant Admin sidebar.

| Menu Item | Route | Capability Required |
|---|---|---|
| Timetable | `/tenant-admin-dashboard/timetable` | `timetable.view` |
| → Calendar | `/tenant-admin-dashboard/timetable/calendar` | `timetable.view` |
| → Templates | `/tenant-admin-dashboard/timetable/templates` | `timetable.view` |
| → Venues | `/tenant-admin-dashboard/timetable/venues` | `timetable.view` |
| → Holidays | `/tenant-admin-dashboard/timetable/holidays` | `timetable.view` |

The default `/timetable` route redirects to `/timetable/calendar`.

---

### 6.2 Calendar View (Primary Interface)

**Route:** `/tenant-admin-dashboard/timetable/calendar`

This is the primary interface. It answers: "What's happening today/this week?"

**Layout:**

- **Week view** as the default (7 columns, time rows from 7 AM to 9 PM)
- **Day view** toggle (single column, expanded detail)
- **Navigation:** Previous/Next week arrows + "Today" button + date picker
- **Batch filter dropdown** at the top (default: All Batches) — multi-select
- **Teacher filter dropdown** (default: All Teachers) — for coordinators managing teacher schedules

**Session cards on the calendar:**

Each session appears as a colored block in the time grid:
- **Color coding by session type:** Offline Class = blue, Live Session = green, Meeting = amber, Exam = red
- **Card content:** Subject name (or "Ad-hoc Session"), Teacher name, Venue (if assigned), Batch name
- **Status indicator:** Small icon for `scheduled` (clock), `in_progress` (play), `completed` (checkmark), `cancelled` (strikethrough), `rescheduled` (arrow)
- **Holiday conflict badge:** Orange warning icon if `holiday_conflict = true`

**Click actions on a session card:**
- Opens a **session detail panel** (slide-over or modal) showing full details
- Actions available (gated by `timetable.manage`): Reschedule, Assign Substitute, Cancel, Link to Attendance

**Empty state:** If no sessions exist for the selected week, show: "No sessions scheduled for this week. Create a schedule template to get started." with a CTA to the Templates page.

---

### 6.3 Schedule Template Builder

**Route:** `/tenant-admin-dashboard/timetable/templates`

**Template List Page:**

- Data table with columns: Template Name, Batch, Status (draft/published badge), Effective From, Effective Until, Slot Count, Actions
- Filter by status (All / Draft / Published)
- "Create Template" button (gated by `timetable.manage`)
- Row actions: Edit, Publish (if draft), Unpublish (if published), Archive (with confirmation)

**Create/Edit Template Page:**

**Route:** `/tenant-admin-dashboard/timetable/templates/create` and `/tenant-admin-dashboard/timetable/templates/{id}/edit`

**Two-section layout:**

**Section 1: Template Details (top)**
- Fields: Name (text), Batch (dropdown — required), Effective From (date picker), Effective Until (date picker, nullable — ongoing templates), Look-ahead Weeks (number, default from tenant settings)
- On edit: name and batch always editable. Date range only editable if status is `draft`.

**Section 2: Weekly Slot Builder (bottom — the core UX)**

This is the most important UI element in the entire timetable module.

**Visual layout:** A 7-column grid (Mon–Sun, configurable start day). Each column represents a day of the week. Slots within each day are stacked vertically in time order.

**Each slot card shows:**
- Time range (e.g., "9:00 AM – 10:30 AM")
- Subject name (if assigned)
- Teacher name
- Venue (if assigned)
- Session type badge
- Edit (pencil) and Delete (trash) icons

**"Add Slot" button** at the bottom of each day column (or a floating "+" button). Clicking opens an **Add Slot form** (inline or modal):

| Field | Type | Required | Notes |
|---|---|---|---|
| Day of Week | Pre-filled from column clicked | Yes | Read-only if opened from a specific day column |
| Start Time | Time picker | Yes | — |
| End Time | Time picker | Yes | Must be after start time |
| Teacher | Dropdown (tenant users with teacher role) | Yes | — |
| Subject | Dropdown (tenant subjects from exam hierarchy) | No | "No subject" option for meetings/doubt sessions |
| Venue | Dropdown (active venues) | No | "No venue" for online/EdTech |
| Session Type | Radio/Select: Offline Class, Live Session, Meeting, Exam | Yes | Default: Offline Class |

**On save:** Calls `POST /templates/{id}/slots`. If conflict detected:
- Hard mode: show error toast with conflict details ("Teacher X is already scheduled for JEE Morning Batch on Monday 9:00–10:30")
- Warn mode: show warning banner with conflict details, slot is created anyway

**Publish action:** Available on the template detail page (button). Confirmation dialog: "Publishing will generate session instances for the next N weeks. Proceed?" On confirm, calls `POST /templates/{id}/publish`. Success state: template status badge changes to "Published", user sees a count of instances generated.

**Unpublish action:** Confirmation dialog: "Unpublishing will cancel all future scheduled sessions from this template. Past and completed sessions are preserved. This cannot be undone. Proceed?" Calls `POST /templates/{id}/unpublish`.

---

### 6.4 Session Management

**Session Detail Panel (slide-over):**

Opened from the calendar view when clicking a session card.

**Display fields:**
- Session date and time
- Subject
- Teacher (with badge if substitute)
- Original teacher (shown only if substitute was assigned)
- Venue
- Batch
- Session type
- Status (with colored badge)
- Source: "From template: {template_name}" or "Ad-hoc"
- Holiday conflict flag (if applicable)
- Linked attendance session (if any) — with link to attendance page

**Actions (gated by `timetable.manage`):**

| Action | When Available | UI Element |
|---|---|---|
| Reschedule | Status = `scheduled` | Button → opens Reschedule form |
| Assign Substitute | Status = `scheduled` | Button → opens Substitute form |
| Cancel | Status = `scheduled` | Button → confirmation dialog with mandatory reason |
| Create Ad-hoc Session | Always (from calendar header) | Button on calendar toolbar |

**Reschedule Form (modal):**
- New Date (date picker)
- New Start Time (time picker)
- New End Time (time picker)
- Reason (textarea, required, min 5 chars)
- On submit: calls `POST /sessions/{id}/reschedule`. On success, old session shows as "rescheduled" with link to new session. New session appears on the calendar.

**Substitute Form (modal):**
- Substitute Teacher (dropdown — same as slot builder teacher dropdown)
- Reason (textarea, required, min 5 chars)
- On submit: calls `POST /sessions/{id}/substitute`. On success, session card updates to show new teacher with "substitute" badge.

**Ad-hoc Session Creation (modal):**
- Date (date picker)
- Start Time, End Time (time pickers)
- Teacher (dropdown)
- Batch (dropdown)
- Subject (optional dropdown)
- Venue (optional dropdown)
- Session type (select)
- On submit: calls `POST /sessions/ad-hoc`. If conflict detected, same UX as slot creation.

---

### 6.5 Venue Management Page

**Route:** `/tenant-admin-dashboard/timetable/venues`

**Simple CRUD table:**
- Columns: Name, Capacity, Location, Branch, Status (Active/Archived), Actions
- "Add Venue" button (gated by `timetable.manage`)
- Row actions: Edit (modal), Archive (confirmation dialog — warns if venue has future sessions)
- Inline form for create/edit: Name (required), Capacity (optional number), Location Description (optional text), Branch (optional dropdown)

---

### 6.6 Holiday Calendar Page

**Route:** `/tenant-admin-dashboard/timetable/holidays`

**Two-panel layout:**

**Left panel: Calendar visualization**
- Monthly calendar grid with holiday dates highlighted in red
- Navigation: Previous/Next month + year selector
- Click on a holiday date to view/edit details

**Right panel: Holiday list**
- Sorted by date (upcoming first)
- Each row: Date, Name, Branch ("All" if null), Recurring badge
- "Add Holiday" button
- Row actions: Edit, Delete (confirmation if sessions exist on that date — "X sessions exist on this date. They will be flagged as holiday conflicts.")

**Add/Edit Holiday Form (modal):**
- Date (date picker)
- Name (text, required)
- Branch (dropdown with "All Branches" default)
- Recurring (checkbox — "Repeat every year")

---

### 6.7 Frontend File Manifest (Estimated)

**App Router Pages (~8 files):**

| # | Path |
|---|---|
| 1 | `app/(tenant-admin-dashboard)/tenant-admin-dashboard/timetable/page.tsx` (redirect to calendar) |
| 2 | `app/(tenant-admin-dashboard)/tenant-admin-dashboard/timetable/calendar/page.tsx` |
| 3 | `app/(tenant-admin-dashboard)/tenant-admin-dashboard/timetable/templates/page.tsx` |
| 4 | `app/(tenant-admin-dashboard)/tenant-admin-dashboard/timetable/templates/create/page.tsx` |
| 5 | `app/(tenant-admin-dashboard)/tenant-admin-dashboard/timetable/templates/[id]/edit/page.tsx` |
| 6 | `app/(tenant-admin-dashboard)/tenant-admin-dashboard/timetable/venues/page.tsx` |
| 7 | `app/(tenant-admin-dashboard)/tenant-admin-dashboard/timetable/holidays/page.tsx` |

**Feature Module Components (~18 files):**

| # | Path | Purpose |
|---|---|---|
| 1 | `features/tenant-admin/timetable/components/calendar-view.tsx` | Week/day calendar grid with session cards |
| 2 | `features/tenant-admin/timetable/components/session-card.tsx` | Individual session block on calendar |
| 3 | `features/tenant-admin/timetable/components/session-detail-panel.tsx` | Slide-over with full session details + actions |
| 4 | `features/tenant-admin/timetable/components/reschedule-form.tsx` | Reschedule modal form |
| 5 | `features/tenant-admin/timetable/components/substitute-form.tsx` | Substitute teacher modal form |
| 6 | `features/tenant-admin/timetable/components/adhoc-session-form.tsx` | Ad-hoc session creation modal |
| 7 | `features/tenant-admin/timetable/components/template-list-table.tsx` | Templates data table |
| 8 | `features/tenant-admin/timetable/components/template-form.tsx` | Template create/edit form (details section) |
| 9 | `features/tenant-admin/timetable/components/weekly-slot-builder.tsx` | 7-column weekly slot grid — the core UX |
| 10 | `features/tenant-admin/timetable/components/slot-card.tsx` | Individual slot in the weekly builder |
| 11 | `features/tenant-admin/timetable/components/slot-form.tsx` | Add/edit slot modal form |
| 12 | `features/tenant-admin/timetable/components/venue-list-table.tsx` | Venues data table |
| 13 | `features/tenant-admin/timetable/components/venue-form.tsx` | Venue create/edit modal form |
| 14 | `features/tenant-admin/timetable/components/holiday-calendar.tsx` | Monthly calendar with holiday highlights |
| 15 | `features/tenant-admin/timetable/components/holiday-list.tsx` | Holiday list panel |
| 16 | `features/tenant-admin/timetable/components/holiday-form.tsx` | Holiday create/edit modal form |
| 17 | `features/tenant-admin/timetable/components/batch-filter.tsx` | Batch selector dropdown (reusable) |
| 18 | `features/tenant-admin/timetable/components/conflict-warning.tsx` | Conflict detection warning display |

**Hooks (~6 files):**

| # | Path | Purpose |
|---|---|---|
| 1 | `features/tenant-admin/timetable/hooks/use-timetable-sessions.ts` | TanStack Query hook for session list (with filters) |
| 2 | `features/tenant-admin/timetable/hooks/use-schedule-templates.ts` | TanStack Query hook for template CRUD |
| 3 | `features/tenant-admin/timetable/hooks/use-template-slots.ts` | TanStack Query hook for slot CRUD within a template |
| 4 | `features/tenant-admin/timetable/hooks/use-venues.ts` | TanStack Query hook for venue CRUD |
| 5 | `features/tenant-admin/timetable/hooks/use-holidays.ts` | TanStack Query hook for holiday CRUD |
| 6 | `features/tenant-admin/timetable/hooks/use-timetable-filters.ts` | Filter state management (batch, teacher, date range) |

**Services (~1 file):**

| # | Path | Purpose |
|---|---|---|
| 1 | `services/timetable-service.ts` | All timetable API calls (templates, slots, sessions, venues, holidays) |

**Total estimated: ~33 new files.**

---

## 7. Sub-Phase 16A-III: Integration & Polish

### 7.1 End-to-End Flow Verification

The implementation plan must include an E2E verification checklist:

| # | Flow | Expected Result |
|---|---|---|
| 1 | Create venue → Create holiday → Create template → Add 5 slots → Publish → Verify instances generated | Instances exist for correct dates, skip holidays, correct teacher/venue/subject |
| 2 | Cancel a session → Verify status = cancelled → Verify it does not appear as "scheduled" in calendar | Calendar shows strikethrough or hides cancelled sessions (configurable) |
| 3 | Reschedule a session → Verify original = rescheduled → Verify new session created → Verify calendar shows both | Old session shows "rescheduled to April 15" link, new session appears on April 15 |
| 4 | Assign substitute → Verify teacher_id updated → Verify original_teacher_id preserved → Verify calendar shows substitute badge | Card shows "Substitute: Verma Sir (for: Sharma Sir)" |
| 5 | Add holiday on a date with sessions → Verify sessions flagged `holiday_conflict = true` → Verify calendar shows warning | Orange badge on affected sessions |
| 6 | Unpublish template → Verify future scheduled instances cancelled → Verify past/completed instances preserved | Only future `scheduled` instances are cancelled |
| 7 | Create ad-hoc session with teacher conflict → Verify conflict detected | 409 error (hard mode) or warning (warn mode) |
| 8 | Batch filter on calendar → Verify only selected batch's sessions shown | Calendar updates correctly |
| 9 | Attendance linking → Create timetable session → Verify `LinkTimetableSessionUseCase` works from attendance module | Attendance session shows timetable link |

### 7.2 Conflict Detection UX

When a conflict is detected (on slot creation, ad-hoc session, reschedule, or substitute assignment):

**Hard mode (409 response):**
- Toast notification: "Conflict detected: {teacher/venue} is already booked for {batch name} at {time}"
- Form does NOT submit. User must change the conflicting field.

**Warn mode (200 response with warnings):**
- Yellow banner at the top of the form: "Warning: {conflict details}. Session was created despite the conflict."
- Session/slot is created. Warning is informational only.

### 7.3 Audit Logging Requirements

Every write operation in the timetable module MUST produce an audit log entry in `tenant_audit_logs`:

| Action | Audit Event Name |
|---|---|
| Create template | `timetable.template.created` |
| Update template | `timetable.template.updated` |
| Publish template | `timetable.template.published` |
| Unpublish template | `timetable.template.unpublished` |
| Archive template | `timetable.template.archived` |
| Create slot | `timetable.slot.created` |
| Update slot | `timetable.slot.updated` |
| Delete slot | `timetable.slot.deleted` |
| Cancel session | `timetable.session.cancelled` |
| Reschedule session | `timetable.session.rescheduled` |
| Substitute teacher | `timetable.session.teacher_substituted` |
| Create ad-hoc session | `timetable.session.adhoc_created` |
| Create venue | `timetable.venue.created` |
| Update venue | `timetable.venue.updated` |
| Archive venue | `timetable.venue.archived` |
| Create holiday | `timetable.holiday.created` |
| Update holiday | `timetable.holiday.updated` |
| Delete holiday | `timetable.holiday.deleted` |

All audit entries include `before_state` and `after_state` JSON payloads. Audit logs are written **outside the main database transaction** (existing platform pattern).

---

## 8. API Response Shapes

### 8.1 Session Instance Response

```json
{
  "id": "uuid",
  "tenant_id": "uuid",
  "schedule_template_id": "uuid | null",
  "template_slot_id": "uuid | null",
  "batch_id": "uuid",
  "batch": { "id": "uuid", "name": "JEE Morning Batch" },
  "session_date": "2026-04-15",
  "start_time": "09:00",
  "end_time": "10:30",
  "teacher_id": "uuid",
  "teacher": { "id": "uuid", "name": "Sharma Sir" },
  "original_teacher_id": "uuid | null",
  "original_teacher": { "id": "uuid", "name": "..." } ,
  "venue_id": "uuid | null",
  "venue": { "id": "uuid", "name": "Room 101" },
  "subject_id": "uuid | null",
  "subject": { "id": "uuid", "name": "Physics" },
  "session_type": "offline_class",
  "status": "scheduled",
  "is_adhoc": false,
  "holiday_conflict": false,
  "rescheduled_from_id": "uuid | null",
  "rescheduled_to_date": "2026-04-17 | null",
  "rescheduled_to_start_time": "10:00 | null",
  "rescheduled_to_end_time": "11:30 | null",
  "cancellation_reason": "string | null",
  "created_at": "2026-04-01T10:00:00Z",
  "updated_at": "2026-04-01T10:00:00Z"
}
```

### 8.2 Template Slot Response

```json
{
  "id": "uuid",
  "schedule_template_id": "uuid",
  "day_of_week": 1,
  "day_of_week_label": "Monday",
  "start_time": "09:00",
  "end_time": "10:30",
  "teacher_id": "uuid",
  "teacher": { "id": "uuid", "name": "Sharma Sir" },
  "subject_id": "uuid | null",
  "subject": { "id": "uuid", "name": "Physics" },
  "venue_id": "uuid | null",
  "venue": { "id": "uuid", "name": "Room 101" },
  "session_type": "offline_class",
  "created_at": "2026-04-01T10:00:00Z",
  "updated_at": "2026-04-01T10:00:00Z"
}
```

### 8.3 Schedule Template Response

```json
{
  "id": "uuid",
  "tenant_id": "uuid",
  "name": "JEE Morning Batch - Term 1",
  "batch_id": "uuid",
  "batch": { "id": "uuid", "name": "JEE Morning Batch" },
  "status": "draft",
  "effective_from": "2026-04-01",
  "effective_until": "2026-06-30 | null",
  "look_ahead_weeks": 4,
  "slot_count": 5,
  "slots": [ "...array of slot objects (when included)" ],
  "created_at": "2026-04-01T10:00:00Z",
  "updated_at": "2026-04-01T10:00:00Z"
}
```

---

## 9. Constraints & Reminders

### 9.1 Architecture Constraints

- All UseCases follow the existing DDD pattern: idempotency check → validation → entity construction → transaction → audit → domain event (dispatched outside transaction).
- `ClockInterface` for all time operations. No `now()` in application or domain layers.
- `ConflictDetectionService` is a domain service, not an infrastructure service. It queries via repository interfaces.
- Template slots are a child aggregate of the Schedule Template. Access is always scoped through the template (never a top-level `/slots` route without a template context).
- Session instances are their own aggregate. They reference templates/slots via FK but are independently queryable and mutable.
- Cross-context communication with Attendance is via `TimetableQueryServiceInterface` only. No direct imports of Timetable domain entities from Attendance.

### 9.2 Security Constraints

- Every query MUST be tenant-scoped. The `BelongsToTenant` trait and `tenant_id` scoping are non-negotiable.
- Teacher ID validation: `teacher_id` and `substitute_teacher_id` must reference users within the authenticated tenant. A request with a teacher ID from another tenant must return 404 (not 403 — no enumeration).
- Venue/subject/batch ID validation: same cross-tenant protection applies.
- Capability gating: `timetable.view` for all read operations, `timetable.manage` for all write operations.
- Module entitlement: tenant must have `module.erp.timetable` in their subscription's locked modules. If not entitled, all timetable routes return 403.

### 9.3 Docker Environment

- Container: Alpine Linux — use `sh` not `bash`
- Container name: `ubotz_backend`
- Database: `ubotz_mysql`

### 9.4 Frontend Constraints

- Follow the established Feature-Sliced Design pattern from the frontend skill.
- TanStack Query v5 for all data fetching. No `useEffect` + `fetch` patterns.
- React Hook Form for all forms. Backend 422 errors mapped to form fields via `setError()`.
- Capability gating in UI: hide write-action buttons when user lacks `timetable.manage`. Never rely solely on frontend gating — backend always enforces.
- Calendar rendering: evaluate `@fullcalendar/react` or build a lightweight custom grid. If FullCalendar, use the `@fullcalendar/timegrid` plugin for week/day views. Document the choice in the implementation plan.

---

## 10. What Phase 16A Does NOT Include

| Excluded Item | Reason | Deferred To |
|---|---|---|
| Student/parent read-only timetable view | First release is Tenant Admin only | 16B |
| Teacher self-service view ("my schedule") | First release is Tenant Admin only | 16B |
| Live class provider integration (Zoom link generation) | Separate bounded context | Future |
| "Class starting in 15 min" notifications | Requires Phase 14 notification hooks wired to timetable events | 16B |
| Drag-and-drop rescheduling on calendar | Complex UX, not essential for first release | 16B |
| Multi-week bulk generation trigger from UI | Cron `ubotz:timetable:generate` handles this | Future |
| Academic period / semester association | Optional complexity, not needed for MVP | Future |
| Branch-level coordinator delegation (coordinator manages only their branch) | Requires branch-scoped RBAC | Future |
| Exam week schedule override (suspend regular timetable during exams) | Complex workflow | Future |
| Recurring session bulk edit ("change all future Mondays") | Complex operation — unpublish + re-publish covers this | Future |
| Export timetable as PDF/image | Nice-to-have, not core | Future |
| E2E automated tests (Playwright/Cypress) | Manual testing first | Post-16A |

---

## 11. Execution Sequence

| Step | Task | Sub-Phase | Effort Estimate | Dependencies |
|---|---|---|---|---|
| **S1** | Prerequisite verification: hit all existing timetable endpoints, document actual routes and response shapes, confirm domain layer completeness | 16A-I | 0.5 day | None |
| **S2** | Venue CRUD (routes + controller + UseCase + request validation) | 16A-I | 1 day | S1 |
| **S3** | Holiday CRUD (routes + controller + UseCase + request validation + holiday-conflict flagging on existing sessions) | 16A-I | 1.5 days | S1 |
| **S4** | Template slot CRUD (expose existing UseCase + new Update/Delete UseCases + routes) | 16A-I | 2 days | S1 |
| **S5** | Template update + unpublish + archive routes | 16A-I | 1.5 days | S4 |
| **S6** | Session reschedule + substitute teacher routes | 16A-I | 2 days | S1 |
| **S7** | Ad-hoc session conflict detection enhancement | 16A-I | 0.5 day | S1 |
| **S8** | Subject/course association + batch filter enhancement on APIs | 16A-I | 1 day | S1 |
| **S9** | Tech debt: status cron review (verify correctness, document decision) | 16A-I | 0.5 day | S1 |
| **S10** | Frontend: shared service layer (`timetable-service.ts`) + all hooks | 16A-II | 1.5 days | S2–S8 |
| **S11** | Frontend: venue management page | 16A-II | 1 day | S10 |
| **S12** | Frontend: holiday calendar page | 16A-II | 1.5 days | S10 |
| **S13** | Frontend: template list page + template form (details section) | 16A-II | 1.5 days | S10 |
| **S14** | Frontend: weekly slot builder (the core UX) + slot form | 16A-II | 3 days | S13 |
| **S15** | Frontend: calendar view (week/day grid + session cards) | 16A-II | 3 days | S10 |
| **S16** | Frontend: session detail panel + reschedule/substitute/cancel forms | 16A-II | 2 days | S15 |
| **S17** | Frontend: ad-hoc session creation form | 16A-II | 1 day | S15 |
| **S18** | Frontend: batch filter + teacher filter integration | 16A-II | 1 day | S15 |
| **S19** | Integration testing: E2E flow verification (§7.1 checklist) | 16A-III | 2 days | All |
| **S20** | Conflict detection UX polish + audit log verification | 16A-III | 1 day | S19 |
| **S21** | Navigation integration + sidebar updates + empty states | 16A-III | 0.5 day | S19 |

**Total estimated: ~26 working days (~5 weeks)**

Backend (S1–S9): ~10.5 days
Frontend (S10–S18): ~15.5 days (frontend-heavy due to calendar + slot builder complexity)
Integration (S19–S21): ~3.5 days

---

## 12. Risk Register

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| 1 | Calendar library (FullCalendar) adds significant bundle size and may conflict with existing Tailwind/Radix styling | Medium | Evaluate lightweight alternatives first. If FullCalendar, isolate in a wrapper component with scoped CSS. Document the choice in implementation plan. |
| 2 | Unpublish + re-publish workflow may confuse users ("where did my sessions go?") | Medium | Clear confirmation dialogs with session counts. Audit trail shows who unpublished and when. |
| 3 | Conflict detection false positives if tenant has many overlapping batches with shared teachers | Low | Conflict messages must include full context (batch name, time, teacher) so the admin can decide. Warn mode exists as a safety valve. |
| 4 | Weekly slot builder is the most complex frontend component in the platform so far | High | Allocate 3 full days. Build incrementally: static grid first → add/delete slots → edit slots → conflict warnings. |
| 5 | Generation pipeline may timeout for templates with large date ranges (6+ months) | Low | Generation already handles look-ahead chunking. Verify with 6-month template in testing. |
| 6 | Status cron domain bypass (GAP-10) could cause subtle bugs if domain invariants evolve | Low | Document current behavior. Flag for future refactor. Does not block Phase 16A. |

---

## 13. Definition of Done

Phase 16A is complete when:

1. The implementation plan has been reviewed and approved by the Principal Engineer.
2. All backend gaps (GAP-01 through GAP-12) are closed with working HTTP routes.
3. All frontend pages and components are implemented per this document.
4. All 9 E2E flow verifications in §7.1 pass.
5. All audit log events in §7.3 are verified.
6. All quality gates from the implementation plan pass.
7. A Principal Engineer audit confirms zero critical or high findings.
8. All findings from audit are resolved.
9. The Phase 16A Completion Report is signed off.

---

## 14. Answers to Your Two Open Questions

### Q: Status cron bypasses domain entities — fix or accept?

**Recommendation: Accept for Phase 16A with a documented review.**

The cron (`ubotz:timetable:update-statuses`) performs batch SQL status transitions. This is a pragmatic shortcut that works at current scale. The risk is low because:
- The transitions it performs (scheduled → in_progress → completed) are simple clock-based transitions with no business side effects
- No domain events need to fire on these transitions (no downstream listeners depend on `SessionMarkedCompleted`)
- Loading hundreds of entities individually for clock-based transitions adds latency without benefit

**Action in Phase 16A (S9):** Verify the cron correctly skips `cancelled` and `rescheduled` sessions. If it does, document as acceptable and defer full entity-based migration. If it doesn't, fix the SQL WHERE clause as a minimum viable fix.

### Q: Ad-hoc sessions have no conflict detection — enforce or skip?

**Recommendation: Enforce in Phase 16A (included as GAP-08 / §5.7).**

The reasoning: an admin creating an ad-hoc session is still capable of accidentally double-booking a teacher. The conflict detection service already exists and is tested. Wiring it into `CreateAdHocSessionUseCase` is ~30 minutes of work. Using the tenant's configured `conflict_mode` (hard or warn) means institutions that want flexibility can set "warn" mode. There's no good reason to leave this gap open.

---

> **The timetable is the heartbeat of an institution. Every other module — attendance, exams, live classes, notifications — depends on "what's scheduled and when." A broken timetable doesn't just inconvenience the admin; it cascades into every downstream workflow. Build this right.**

*End of Document — UBOTZ 2.0 Phase 16A Developer Instructions — March 18, 2026*
