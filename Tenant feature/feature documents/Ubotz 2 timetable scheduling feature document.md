# UBOTZ 2.0 — Timetable & Scheduling System Feature Document

## Universal Session Scheduling for Institutions and EdTech

| Field | Value |
|---|---|
| **Document Type** | Feature Specification (Pre-Architecture) |
| **Version** | 1.0 |
| **Date** | March 16, 2026 |
| **Issued By** | Product & Architecture Team |
| **Audience** | Principal Engineer, Implementation Developer, Product Owner |
| **Status** | Draft — Pending Architecture Review |
| **Dependencies** | Tenant RBAC (Phase 10A — complete), Batch/Cohort system (existing), Course & Subject system (Phase 9 — complete) |
| **Downstream Dependents** | Attendance Module, Live Classes Module, Exam Scheduling, Student/Parent Dashboard, Teacher Workload Reports |

> **Design Principle:** The Timetable is a scheduling engine that answers one question: "Who teaches what to whom, when, and where?" Whether "where" is a physical classroom, a Zoom call, or a pre-recorded video slot — the engine does not care. It must work for a 2-teacher coaching class that sets a weekly pattern once per quarter AND a 40-teacher multi-branch institution that reschedules daily. Features that only serve large institutions are configurable, not imposed.

---

## 1. Problem Statement

### 1.1 What Institutions Face Today

**Small coaching institutes:**
- The weekly schedule lives in the owner's head or on a whiteboard photo shared in a WhatsApp group
- Students and parents call asking "is there class tomorrow?" because there's no accessible digital schedule
- When a teacher is sick, the owner manually messages each student about the cancellation — no systematic way to communicate schedule changes
- Ad-hoc sessions (doubt clearing, extra revision) are announced verbally and have no record
- The same weekly pattern repeats for months, but the owner has no way to "set it and forget it" digitally

**Multi-branch institutions:**
- Each branch coordinator manages their own schedule independently, often in Excel or Google Sheets
- The institution owner has no consolidated view of what's happening across branches at any given time
- Double-booking happens — a teacher accidentally assigned to two batches at the same time, or two batches assigned to the same room
- When exam week comes, the entire regular timetable needs to be suspended and replaced — there's no clean way to do this without losing the original schedule
- Planning next term's schedule while the current term is still running is impossible without a draft/publish model

**EdTech companies:**
- Sessions are live classes (Zoom/Meet) and the timetable is defined per-cohort at batch creation
- Instructors teach across multiple cohorts with different schedules — tracking their total load is manual
- There's no single place where a student sees "all my upcoming classes across all my enrolled courses"
- Timezone differences mean a "10 AM class" means different things to different students — the system doesn't account for this
- Integration with live class providers is manual — someone copies Zoom links into messages instead of the system generating them automatically

### 1.2 What This Module Solves

The Timetable module provides a template-based, instance-driven scheduling system that:

1. Lets institutions define a recurring weekly pattern once and auto-generates individual session instances from it
2. Allows specific instances to be overridden (cancelled, rescheduled, substituted) without affecting the template
3. Detects conflicts (teacher double-booking, venue double-booking) before they happen
4. Provides role-appropriate views — owners see everything, teachers see their schedule, students see their classes
5. Supports ad-hoc one-off sessions outside the regular template
6. Exposes sessions as the connective tissue for downstream modules (attendance, live classes, exams)
7. Gracefully scales from zero configuration (single-room, no venues) to full multi-branch operations

---

## 2. Core Concepts & Domain Vocabulary

Before defining features, the following terms must be understood identically by product, engineering, and users.

### 2.1 Schedule Template

A **Schedule Template** is a recurring weekly pattern for a batch. It defines: "Every Monday from 9:00–10:30, Batch JEE-A has Physics with Teacher Suresh in Room 101."

A template belongs to exactly one batch. A batch can have exactly one active template at a time (but may have draft templates being prepared for the next term).

The template contains a collection of **Template Slots** — each slot is one recurring weekly session (day of week + time + subject + teacher + optional venue).

A template has a **validity period** (`effective_from`, `effective_until`) that defines when it generates session instances. This allows "Term 1 template" (Jun–Oct) and "Term 2 template" (Nov–Mar) to coexist without conflict.

### 2.2 Session Instance

A **Session Instance** is a concrete, dated occurrence of a class. It represents "Physics class on Monday, March 18, 2026, 9:00–10:30, Teacher Suresh, Room 101, Batch JEE-A."

Session instances are generated from template slots (for recurring sessions) or created manually (for ad-hoc sessions). Once generated, an instance is an independent entity — it can be modified, cancelled, or rescheduled without affecting the template or other instances.

### 2.3 Ad-Hoc Session

An **Ad-Hoc Session** is a one-off session instance that is not generated from any template. It exists independently — doubt-clearing sessions, guest lectures, workshops, parent-teacher meetings, extra revision classes.

Ad-hoc sessions share the same data structure as template-generated instances but have `template_slot_id = NULL`.

### 2.4 Venue (Optional)

A **Venue** is a physical or virtual location where a session takes place. For physical institutions: "Room 101", "Lab A", "Auditorium". For EdTech: typically unused (sessions happen on Zoom/Meet).

Venues are optional. If a tenant does not configure venues, all venue fields are NULL and venue conflict detection is skipped. The system never forces venue assignment.

### 2.5 Session Type

Every session has a type that defines its nature:

| Type | Description | Examples |
|---|---|---|
| `offline_class` | In-person class at a physical location | Regular classroom teaching |
| `online_class` | Live virtual class via video provider | Zoom/Meet/Jitsi session |
| `hybrid_class` | Simultaneous in-person + virtual | Teacher in room, some students join online |
| `exam` | Assessment session (links to Exam module) | Unit test, mid-term, mock test |
| `lab` | Practical/laboratory session | Physics lab, computer lab |
| `event` | Non-academic session | Workshop, guest lecture, PTM, sports day |

### 2.6 Holiday Calendar

A **Holiday Calendar** is a tenant-level list of dates when no sessions should be generated or scheduled. Holidays can be branch-specific (only Branch A is closed) or institution-wide (national holiday — all branches closed).

When the instance generation engine encounters a holiday date, it skips generating instances for that date. Existing instances on a date that is later marked as a holiday are flagged for review (not auto-cancelled — the admin decides).

---

## 3. Scope Definition

### 3.1 In Scope (Phase 1 — This Document)

| Area | Details |
|---|---|
| **Schedule templates** | Create, edit, activate, deactivate weekly recurring templates per batch |
| **Template slots** | Define day-of-week + time + subject + teacher + optional venue per slot |
| **Instance generation** | Auto-generate session instances from active templates for a configurable period (default: 4 weeks ahead) |
| **Instance overrides** | Cancel, reschedule, substitute teacher for individual instances without affecting template |
| **Ad-hoc sessions** | Create one-off sessions independent of any template |
| **Conflict detection** | Teacher conflict (same teacher, overlapping time). Venue conflict (same venue, overlapping time). Warning or hard block (configurable per tenant). |
| **Holiday calendar** | Tenant-level holiday management. Instance generation skips holidays. |
| **Session lifecycle** | Status flow: `scheduled` → `in_progress` → `completed` / `cancelled` / `rescheduled` |
| **Calendar views** | Weekly and daily views. Filterable by batch, teacher, venue, branch. |
| **Draft/publish** | Templates can be created in `draft` status. Only `published` templates generate instances. |
| **Multi-branch** | Sessions and templates scoped by optional `branch_id`. Branch-level views. |
| **Service interfaces** | Query services for downstream modules (Attendance, Live Classes, Dashboard). |

### 3.2 Explicitly Out of Scope

| Area | Reason |
|---|---|
| **Auto-scheduling / timetable solver** | Algorithmic timetable generation (constraint satisfaction solver) is a complex optimization problem. Phase 1 is manual scheduling with conflict detection. Auto-scheduling is Phase 3+. |
| **Room capacity enforcement** | Requires student headcount per batch vs room capacity. Useful but not essential for Phase 1. Can be added as a venue attribute later. |
| **Drag-and-drop rescheduling** | Frontend UX enhancement. Phase 1 uses form-based reschedule. Drag-and-drop is Phase 2 frontend improvement. |
| **Live class provider integration** | Auto-generating Zoom/Meet links from session instances. Requires Live Classes module. Timetable exposes session data; Live Classes module consumes it and manages provider integration. |
| **Notification on schedule changes** | "Your class has been cancelled" notifications. Requires Notification Infrastructure. Timetable fires domain events; Notification module (when built) listens and delivers. |
| **Timezone display conversion** | Phase 1 stores all times in the tenant's configured timezone. Per-user timezone display conversion is Phase 2. |
| **Recurring patterns beyond weekly** | Bi-weekly, monthly, or custom recurrence patterns. Weekly covers 95% of use cases. Custom recurrence is Phase 3. |

### 3.3 Phasing Strategy

**Phase 1 (Core — this document):** Template-based scheduling, instance generation, conflict detection, holiday calendar, ad-hoc sessions, calendar views, draft/publish, service interfaces.

**Phase 2 (UX & Integration):** Drag-and-drop rescheduling, per-user timezone display, bulk operations (cancel all sessions for a week), teacher substitution workflow with approval, notification hooks, calendar export (iCal/Google Calendar).

**Phase 3 (Intelligence):** Auto-scheduling solver (input constraints → output optimal timetable), room capacity enforcement, teacher workload balancing, utilization analytics.

---

## 4. Business Rules (NON-NEGOTIABLE)

### 4.1 Template Rules

| Rule ID | Rule | Detail |
|---|---|---|
| TT-BR-01 | A batch can have at most one `published` template with overlapping validity period. | If Batch JEE-A has a published template valid Jan–Jun, you cannot publish another template for the same batch valid Mar–Aug. Validity periods must not overlap. Draft templates are exempt from this rule. |
| TT-BR-02 | A template must have at least one slot to be published. | Empty templates cannot be published. They can exist as drafts. |
| TT-BR-03 | Publishing a template triggers instance generation for the configured look-ahead period. | Default: 4 weeks. Configurable per tenant (1–12 weeks). Instances are generated from `effective_from` (or today, whichever is later) through the look-ahead window. |
| TT-BR-04 | Deactivating (unpublishing) a template does NOT delete already-generated instances. | Future instances retain their status. The admin must explicitly cancel them if needed. This prevents accidental mass data loss. |
| TT-BR-05 | Editing a template slot (e.g., changing the teacher) affects only FUTURE instance generation. Already-generated instances are unchanged. | If you change "Monday Physics" from Teacher A to Teacher B in the template, existing Monday Physics instances still show Teacher A. New instances generated after the edit show Teacher B. This is the "Google Calendar recurring event" model. |
| TT-BR-06 | Deleting a template slot stops future instance generation for that slot. Existing instances remain. | Same principle as BR-05. Historical data is never implicitly destroyed. |

### 4.2 Session Instance Rules

| Rule ID | Rule | Detail |
|---|---|---|
| TT-BR-07 | A session instance is immutable once its status is `completed`. | Completed sessions cannot be rescheduled, cancelled, or have their teacher changed. They are historical records. Only an admin with `CAP_TIMETABLE_OVERRIDE` can annotate (add notes) to a completed session. |
| TT-BR-08 | Cancelling a session instance requires a `cancellation_reason`. | Reasons are: `teacher_unavailable`, `holiday`, `venue_unavailable`, `low_attendance`, `administrative`, `other`. If `other`, a free-text reason is mandatory. |
| TT-BR-09 | Rescheduling creates a new session instance and marks the original as `rescheduled`. | The original retains `rescheduled_to_id` pointing to the new instance. The new instance has `rescheduled_from_id` pointing to the original. This maintains full traceability. |
| TT-BR-10 | An ad-hoc session follows all the same rules as a template-generated session (conflict detection, status lifecycle, audit). | The only difference is `template_slot_id = NULL`. |
| TT-BR-11 | Session instances can only transition through valid status paths. | See Section 5 for the complete state machine. |

### 4.3 Conflict Detection Rules

| Rule ID | Rule | Detail |
|---|---|---|
| TT-BR-12 | Teacher conflict: A teacher cannot be assigned to two overlapping sessions on the same date. | Overlap = session A's time range intersects session B's time range. Conflict check runs at: template slot creation, instance creation, instance reschedule, teacher substitution. |
| TT-BR-13 | Venue conflict: A venue cannot be assigned to two overlapping sessions on the same date. | Same overlap logic as teacher conflict. Only checked when `venue_id` is non-NULL on both sessions. |
| TT-BR-14 | Conflict enforcement mode is configurable per tenant: `hard_block` (default) or `warn_and_allow`. | `hard_block`: the operation is rejected with a clear error message identifying the conflicting session. `warn_and_allow`: the operation succeeds but a conflict warning is logged and surfaced on the dashboard. |
| TT-BR-15 | Cancelled sessions do NOT participate in conflict detection. | If Session A is cancelled and Session B is created in the same slot, there is no conflict. |
| TT-BR-16 | Conflict detection is scoped to the same tenant and same branch (if branch is assigned). | A teacher assigned to sessions in Branch A and Branch B on the same time slot IS a conflict (same tenant, teacher is a shared resource regardless of branch). A venue in Branch A does NOT conflict with a venue in Branch B (venues are branch-local physical spaces). |

### 4.4 Instance Generation Rules

| Rule ID | Rule | Detail |
|---|---|---|
| TT-BR-17 | Instance generation runs as a scheduled command (daily) and on-demand (when a template is published or edited). | The scheduled command generates instances for the next N days within the look-ahead window. On-demand generation fills the look-ahead window immediately upon template publish. |
| TT-BR-18 | Instance generation skips dates in the holiday calendar. | If Monday March 18 is a holiday, no instances are generated for that date, even if the template has Monday slots. |
| TT-BR-19 | Instance generation is idempotent. | If an instance already exists for a given `template_slot_id + date`, it is not re-created. Running generation twice produces the same result. The idempotency key is `(tenant_id, template_slot_id, session_date)`. |
| TT-BR-20 | Instances are generated only within the template's validity period. | If the template is valid Jan 1 – Jun 30, no instances are generated for July dates even if the look-ahead window extends into July. |

### 4.5 Holiday Calendar Rules

| Rule ID | Rule | Detail |
|---|---|---|
| TT-BR-21 | Holidays can be institution-wide or branch-specific. | An institution-wide holiday applies to all branches. A branch-specific holiday only affects that branch's sessions. |
| TT-BR-22 | Adding a holiday for a future date flags already-generated instances on that date for review. | The system does NOT auto-cancel them. It marks them with `holiday_conflict = true` and surfaces them on the admin dashboard: "3 sessions on March 21 conflict with newly added holiday — review required." The admin decides: cancel all, cancel some, or keep (override). |
| TT-BR-23 | Removing a holiday does NOT auto-regenerate skipped instances. | If instances were never generated because of the holiday, and the holiday is later removed, the admin must manually trigger regeneration or wait for the next scheduled generation run. |

---

## 5. Session Instance State Machine

```
                    ┌────────────┐
                    │  scheduled  │ (initial state — generated or manually created)
                    └─────┬──────┘
                          │
              ┌───────────┼───────────┐
              ▼           ▼           ▼
       ┌────────────┐ ┌──────────┐ ┌──────────────┐
       │ in_progress │ │cancelled │ │ rescheduled  │
       └─────┬──────┘ └──────────┘ └──────┬───────┘
             │                             │
             ▼                             ▼
       ┌────────────┐               (new instance
       │  completed  │                created as
       └────────────┘                `scheduled`)
```

| Transition | Trigger | Rules |
|---|---|---|
| `scheduled` → `in_progress` | System (current time reaches session start time) OR manual trigger by teacher/admin | Automatic transition via scheduled command or on-demand when teacher opens session. |
| `scheduled` → `cancelled` | Admin/coordinator cancels session | Requires `cancellation_reason`. Cancellation is irreversible. |
| `scheduled` → `rescheduled` | Admin/coordinator reschedules session | Creates new `scheduled` instance with new date/time. Original marked `rescheduled` with link to new instance. |
| `in_progress` → `completed` | System (current time reaches session end time) OR manual trigger | Automatic transition via scheduled command. Completed is terminal — no further transitions. |
| `in_progress` → `cancelled` | Admin cancels a running session (rare — emergency) | Requires `cancellation_reason`. Exceptional case. |

**Invalid transitions (rejected by domain):**
- `completed` → anything (terminal state)
- `cancelled` → anything (terminal state)
- `rescheduled` → anything (terminal state)
- `in_progress` → `scheduled` (cannot go backwards)
- `in_progress` → `rescheduled` (must cancel and create new, not reschedule mid-session)

---

## 6. User Stories by Role

### 6.1 Institution Owner (OWNER)

| ID | Story | Acceptance Criteria |
|---|---|---|
| US-01 | As an owner, I want to create a weekly schedule template for a batch so I don't have to create individual sessions every week. | Template creation form: select batch → add slots (day, time, subject, teacher, optional venue) → save as draft or publish. Published template auto-generates session instances for the look-ahead period. |
| US-02 | As an owner, I want to see a weekly calendar view of all sessions across all batches so I know what's happening in my institution this week. | Weekly calendar shows sessions as colored blocks. Color-coded by batch or session type (configurable). Filterable by batch, teacher, venue, branch. Shows cancelled sessions as greyed-out with strikethrough. |
| US-03 | As an owner, I want the system to prevent double-booking my teachers so I don't discover conflicts after students are already waiting. | When creating/editing a template slot or session, the system checks for teacher time overlap. In `hard_block` mode: slot creation fails with error "Teacher Suresh already assigned to Physics (JEE-A) at this time." In `warn_and_allow` mode: slot creates with a warning badge. |
| US-04 | As an owner, I want to prepare next term's timetable while the current term is still running. | Create a new template for the same batch with a future `effective_from` date in `draft` status. Edit freely. When ready, publish — instances generate starting from `effective_from`. Current term's template remains active until its `effective_until`. |
| US-05 | As an owner, I want to add holidays to my institutional calendar so sessions are not generated on those days. | Holiday management page: add date, name, scope (all branches or specific branch). Future instance generation skips these dates. Already-generated instances on newly-added holiday dates are flagged for review. |
| US-06 | As an owner of multiple branches, I want to see each branch's timetable separately and also a consolidated view. | Branch filter on calendar view. Default: all branches. Selecting a branch scopes all sessions. Consolidated view shows all branches with branch badge on each session. |

### 6.2 Admin/Coordinator (ADMIN)

| ID | Story | Acceptance Criteria |
|---|---|---|
| US-07 | As a coordinator, I want to cancel a specific session (teacher is sick today) and optionally reschedule it to another date. | On the session instance: "Cancel" action (requires reason selection). "Reschedule" action opens a form with new date/time/teacher (pre-filled from original). Conflict check runs on new date/time. Original session marked `rescheduled`, new instance created as `scheduled`. |
| US-08 | As a coordinator, I want to assign a substitute teacher for a specific session without changing the template. | On the session instance: "Change Teacher" action. Dropdown shows available teachers (filtered by subject capability if configured). Conflict check for the substitute teacher. Change saved on this instance only. Template unchanged. Audit-logged. |
| US-09 | As a coordinator, I want to create ad-hoc sessions for events not in the regular template. | "New Session" button. Form: title, date, start time, end time, session type, batch (optional), subject (optional), teacher (optional), venue (optional). Conflict check runs. Session created as `scheduled` with `template_slot_id = NULL`. |
| US-10 | As a coordinator, I want to cancel all sessions for a specific week (exam week) and create an exam schedule instead. | Bulk cancel: select date range + batch → preview affected sessions → confirm with reason "exam_week". Then create ad-hoc sessions for the exam schedule. (Phase 1: sequential workflow. Phase 2: "exam week mode" shortcut.) |

### 6.3 Teacher (TEACHER)

| ID | Story | Acceptance Criteria |
|---|---|---|
| US-11 | As a teacher, I want to see my teaching schedule for this week so I know what I'm teaching, when, and where. | "My Schedule" view: daily or weekly. Shows only sessions where `teacher_id` matches the logged-in teacher. Each session shows: time, subject, batch, venue (if assigned), status. |
| US-12 | As a teacher, I want to see my total teaching load (hours per week, sessions per day) so I can manage my time. | "My Workload" summary: total sessions this week, total hours, sessions per day breakdown. Visible on the teacher dashboard widget. |
| US-13 | As a teacher, I want to mark a session as started (when I begin class) and completed (when I finish). | "Start Session" button on a `scheduled` session (available within 15 minutes of start time). "End Session" button on an `in_progress` session. These manual triggers supplement the automatic status transitions. |

### 6.4 Student (STUDENT)

| ID | Story | Acceptance Criteria |
|---|---|---|
| US-14 | As a student, I want to see my class schedule for this week so I know when and where to attend. | "My Classes" view: shows sessions for batches the student is enrolled in. Daily or weekly view. Each session shows: time, subject, teacher name, venue/link, status. Read-only. |
| US-15 | As a student, I want to know if a session has been cancelled or rescheduled so I don't show up unnecessarily. | Cancelled sessions appear greyed out with "Cancelled" badge and reason. Rescheduled sessions show "Rescheduled to [new date/time]" with a link to the new session. |

### 6.5 Parent (PARENT)

| ID | Story | Acceptance Criteria |
|---|---|---|
| US-16 | As a parent, I want to see my child's class schedule so I can plan pickups and track their academic commitment. | Parent dashboard: "Child's Schedule" widget showing today's sessions and upcoming sessions for the week. Same data as student view, scoped to the linked child. |

---

## 7. Data Model (Conceptual)

> **Note:** All tables follow project conventions: `tenant_id` scoping, `created_at`/`updated_at`, soft deletes where specified, VARCHAR for status fields (no MySQL ENUMs), `_cents` suffix for financial columns (not applicable here).

### 7.1 Core Tables

**`schedule_templates`** — The recurring weekly pattern container.

| Column | Type | Notes |
|---|---|---|
| `id` | BIGINT UNSIGNED PK | Auto-increment |
| `tenant_id` | BIGINT UNSIGNED FK | Tenant isolation |
| `batch_id` | BIGINT UNSIGNED FK | The batch this template belongs to |
| `branch_id` | BIGINT UNSIGNED FK, NULLABLE | For multi-branch institutions |
| `title` | VARCHAR(255) | e.g., "JEE-A Term 1 Schedule" |
| `status` | VARCHAR(20) | `draft`, `published`, `archived` |
| `effective_from` | DATE | Start of validity period |
| `effective_until` | DATE | End of validity period |
| `look_ahead_weeks` | TINYINT UNSIGNED | Default: 4. How many weeks ahead to generate instances. |
| `created_by` | BIGINT UNSIGNED FK | User who created the template |
| `published_at` | TIMESTAMP, NULLABLE | When the template was published |
| `published_by` | BIGINT UNSIGNED FK, NULLABLE | Who published it |
| `notes` | TEXT, NULLABLE | |
| `created_at` | TIMESTAMP | |
| `updated_at` | TIMESTAMP | |
| `deleted_at` | TIMESTAMP, NULLABLE | Soft delete |

**Unique constraint:** No two `published` templates for the same `(tenant_id, batch_id)` with overlapping `(effective_from, effective_until)` ranges. Enforced at the application layer (UseCase validation) because MySQL cannot express overlapping date range uniqueness in a standard unique index.

**`template_slots`** — Individual recurring session definitions within a template.

| Column | Type | Notes |
|---|---|---|
| `id` | BIGINT UNSIGNED PK | Auto-increment |
| `tenant_id` | BIGINT UNSIGNED FK | Tenant isolation |
| `schedule_template_id` | BIGINT UNSIGNED FK | Parent template |
| `day_of_week` | TINYINT UNSIGNED | 0 = Sunday, 1 = Monday, ..., 6 = Saturday |
| `start_time` | TIME | Session start time (in tenant's timezone) |
| `end_time` | TIME | Session end time |
| `subject_id` | BIGINT UNSIGNED FK, NULLABLE | The subject being taught |
| `teacher_id` | BIGINT UNSIGNED FK, NULLABLE | Assigned teacher |
| `venue_id` | BIGINT UNSIGNED FK, NULLABLE | Assigned venue (optional) |
| `session_type` | VARCHAR(30) | `offline_class`, `online_class`, `hybrid_class`, `lab`, `exam`, `event` |
| `title_override` | VARCHAR(255), NULLABLE | Custom title (overrides auto-generated "Subject - Batch" title) |
| `sort_order` | SMALLINT UNSIGNED | Display order within same day |
| `created_at` | TIMESTAMP | |
| `updated_at` | TIMESTAMP | |

**Unique constraint:** `(tenant_id, schedule_template_id, day_of_week, start_time)` — prevents duplicate slots at the same time on the same day within a template.

**`session_instances`** — Concrete dated session occurrences.

| Column | Type | Notes |
|---|---|---|
| `id` | BIGINT UNSIGNED PK | Auto-increment |
| `tenant_id` | BIGINT UNSIGNED FK | Tenant isolation |
| `template_slot_id` | BIGINT UNSIGNED FK, NULLABLE | NULL for ad-hoc sessions. Links back to the generating slot. |
| `batch_id` | BIGINT UNSIGNED FK, NULLABLE | The batch |
| `branch_id` | BIGINT UNSIGNED FK, NULLABLE | For multi-branch |
| `subject_id` | BIGINT UNSIGNED FK, NULLABLE | |
| `teacher_id` | BIGINT UNSIGNED FK, NULLABLE | Can differ from template (substitution) |
| `venue_id` | BIGINT UNSIGNED FK, NULLABLE | Can differ from template (room change) |
| `session_date` | DATE | The actual date |
| `start_time` | TIME | Actual start time (may differ from template if rescheduled) |
| `end_time` | TIME | Actual end time |
| `session_type` | VARCHAR(30) | Inherited from template slot or set directly for ad-hoc |
| `title` | VARCHAR(255) | Auto-generated or custom |
| `status` | VARCHAR(20) | `scheduled`, `in_progress`, `completed`, `cancelled`, `rescheduled` |
| `cancellation_reason` | VARCHAR(30), NULLABLE | `teacher_unavailable`, `holiday`, `venue_unavailable`, `low_attendance`, `administrative`, `other` |
| `cancellation_notes` | VARCHAR(500), NULLABLE | Free-text (mandatory when reason = `other`) |
| `cancelled_by` | BIGINT UNSIGNED FK, NULLABLE | |
| `cancelled_at` | TIMESTAMP, NULLABLE | |
| `rescheduled_from_id` | BIGINT UNSIGNED FK, NULLABLE | If this instance was created by rescheduling another |
| `rescheduled_to_id` | BIGINT UNSIGNED FK, NULLABLE | If this instance was rescheduled TO a new instance |
| `original_teacher_id` | BIGINT UNSIGNED FK, NULLABLE | Tracks original teacher when a substitute is assigned |
| `holiday_conflict` | BOOLEAN | TRUE if a holiday was added after this instance was generated |
| `notes` | TEXT, NULLABLE | |
| `created_at` | TIMESTAMP | |
| `updated_at` | TIMESTAMP | |
| `deleted_at` | TIMESTAMP, NULLABLE | Soft delete |

**Unique constraint (idempotency):** `(tenant_id, template_slot_id, session_date)` WHERE `template_slot_id IS NOT NULL` — one instance per slot per date.

**Index strategy:**
- `(tenant_id, session_date)` — primary query pattern for calendar views
- `(tenant_id, teacher_id, session_date)` — teacher schedule lookups
- `(tenant_id, batch_id, session_date)` — batch schedule lookups
- `(tenant_id, venue_id, session_date)` — venue conflict checks
- `(tenant_id, status, session_date)` — filtering by status

### 7.2 Supporting Tables

**`venues`** — Physical or virtual locations (optional).

| Column | Type | Notes |
|---|---|---|
| `id` | BIGINT UNSIGNED PK | Auto-increment |
| `tenant_id` | BIGINT UNSIGNED FK | Tenant isolation |
| `branch_id` | BIGINT UNSIGNED FK, NULLABLE | Branch this venue belongs to |
| `name` | VARCHAR(100) | e.g., "Room 101", "Lab A", "Auditorium" |
| `type` | VARCHAR(30) | `classroom`, `lab`, `auditorium`, `online`, `other` |
| `capacity` | SMALLINT UNSIGNED, NULLABLE | Max occupancy (Phase 1: informational only, not enforced) |
| `is_active` | BOOLEAN | Soft toggle for temporarily unavailable venues |
| `notes` | VARCHAR(500), NULLABLE | |
| `created_at` | TIMESTAMP | |
| `updated_at` | TIMESTAMP | |
| `deleted_at` | TIMESTAMP, NULLABLE | Soft delete |

**`holidays`** — Institutional holiday calendar.

| Column | Type | Notes |
|---|---|---|
| `id` | BIGINT UNSIGNED PK | Auto-increment |
| `tenant_id` | BIGINT UNSIGNED FK | Tenant isolation |
| `branch_id` | BIGINT UNSIGNED FK, NULLABLE | NULL = all branches |
| `holiday_date` | DATE | |
| `name` | VARCHAR(100) | e.g., "Republic Day", "Onam" |
| `type` | VARCHAR(30) | `national`, `regional`, `institutional`, `exam_break`, `other` |
| `is_recurring` | BOOLEAN | If TRUE, recurs annually (same month+day). Instance generation checks both fixed dates and recurring pattern. |
| `created_by` | BIGINT UNSIGNED FK | |
| `created_at` | TIMESTAMP | |
| `updated_at` | TIMESTAMP | |

**Unique constraint:** `(tenant_id, branch_id, holiday_date)` — one holiday per date per branch (or per institution if `branch_id` is NULL).

### 7.3 Configuration Table

**`timetable_settings`** — Per-tenant timetable configuration.

| Column | Type | Notes |
|---|---|---|
| `id` | BIGINT UNSIGNED PK | Auto-increment |
| `tenant_id` | BIGINT UNSIGNED FK, UNIQUE | One row per tenant |
| `conflict_mode` | VARCHAR(20) | `hard_block` (default) or `warn_and_allow` |
| `default_look_ahead_weeks` | TINYINT UNSIGNED | Default: 4 |
| `generation_frequency` | VARCHAR(20) | `daily` (default), `weekly` |
| `week_starts_on` | TINYINT UNSIGNED | 0 = Sunday (default), 1 = Monday |
| `working_days` | VARCHAR(20) | Comma-separated day numbers, e.g., "1,2,3,4,5,6" for Mon–Sat. Default: "1,2,3,4,5,6" |
| `default_session_type` | VARCHAR(30) | Default: `offline_class` |
| `timezone` | VARCHAR(50) | Tenant's timezone. Default: `Asia/Kolkata`. All times stored relative to this. |
| `created_at` | TIMESTAMP | |
| `updated_at` | TIMESTAMP | |

---

## 8. Capability Requirements (Tenant RBAC)

| Capability Code | Display Name | Description | Default Roles |
|---|---|---|---|
| `CAP_TIMETABLE_MANAGE` | Manage timetable | Create/edit/publish/archive templates and slots | OWNER, ADMIN |
| `CAP_TIMETABLE_VIEW_ALL` | View all schedules | View sessions across all batches, teachers, branches | OWNER, ADMIN |
| `CAP_TIMETABLE_VIEW_OWN` | View own schedule | View sessions assigned to the logged-in teacher | TEACHER |
| `CAP_TIMETABLE_VIEW_SELF` | View own class schedule | Students/parents view sessions for enrolled batches/linked children | STUDENT, PARENT |
| `CAP_SESSION_MANAGE` | Manage sessions | Cancel, reschedule, substitute individual session instances | OWNER, ADMIN |
| `CAP_SESSION_CREATE_ADHOC` | Create ad-hoc sessions | Create one-off sessions outside templates | OWNER, ADMIN, TEACHER |
| `CAP_SESSION_STATUS_UPDATE` | Update session status | Mark sessions as started/completed | OWNER, ADMIN, TEACHER |
| `CAP_TIMETABLE_OVERRIDE` | Override completed sessions | Annotate completed session records (exceptional) | OWNER |
| `CAP_VENUE_MANAGE` | Manage venues | Create/edit/deactivate venue records | OWNER, ADMIN |
| `CAP_HOLIDAY_MANAGE` | Manage holidays | Add/edit/remove holidays from the calendar | OWNER, ADMIN |
| `CAP_TIMETABLE_SETTINGS` | Manage timetable settings | Configure conflict mode, look-ahead, working days, timezone | OWNER |
| `CAP_TIMETABLE_EXPORT` | Export timetable | Export schedule data as PDF/Excel/iCal | OWNER, ADMIN, TEACHER |

---

## 9. Service Interfaces (Cross-Module Integration)

The Timetable bounded context exposes read-only query interfaces for downstream modules. Other modules MUST NOT directly query timetable tables.

### 9.1 TimetableQueryService

```
Interface: TimetableQueryServiceInterface

Methods:

getSessionsForDate(
    tenantId: int,
    date: DateTimeImmutable,
    batchId: ?int = null,
    teacherId: ?int = null,
    branchId: ?int = null
): array<SessionInstanceDTO>
    // Returns all non-cancelled sessions for a given date, with optional filters.

getSessionsForDateRange(
    tenantId: int,
    startDate: DateTimeImmutable,
    endDate: DateTimeImmutable,
    batchId: ?int = null,
    teacherId: ?int = null
): array<SessionInstanceDTO>
    // Returns sessions across a date range. Used by calendar views and reports.

getSessionById(
    tenantId: int,
    sessionId: int
): ?SessionInstanceDTO
    // Returns a single session with full details. Used by Attendance module
    // to link attendance to a specific session.

getUpcomingSessions(
    tenantId: int,
    batchId: ?int = null,
    limit: int = 10
): array<SessionInstanceDTO>
    // Returns the next N upcoming sessions (status = scheduled).
    // Used by dashboard widgets.

getTeacherWorkload(
    tenantId: int,
    teacherId: int,
    startDate: DateTimeImmutable,
    endDate: DateTimeImmutable
): TeacherWorkloadDTO
    // Returns: total_sessions, total_hours, sessions_per_day breakdown,
    // unique_batches, unique_subjects. Used by teacher dashboard and
    // workload reports.

isTeacherAvailable(
    tenantId: int,
    teacherId: int,
    date: DateTimeImmutable,
    startTime: TimeImmutable,
    endTime: TimeImmutable,
    excludeSessionId: ?int = null
): bool
    // Conflict check for external modules (e.g., Exam module scheduling
    // an exam and checking teacher/invigilator availability).

isVenueAvailable(
    tenantId: int,
    venueId: int,
    date: DateTimeImmutable,
    startTime: TimeImmutable,
    endTime: TimeImmutable,
    excludeSessionId: ?int = null
): bool
    // Venue conflict check for external modules.

getHolidaysForPeriod(
    tenantId: int,
    startDate: DateTimeImmutable,
    endDate: DateTimeImmutable,
    branchId: ?int = null
): array<HolidayDTO>
    // Returns holidays within a period. Used by Attendance module
    // (exclude holiday dates from attendance calculations) and
    // Dashboard (show upcoming holidays).
```

### 9.2 Consuming Modules

| Module | What It Reads | Purpose |
|---|---|---|
| **Attendance** | `getSessionsForDate()`, `getSessionById()` | Link attendance records to session instances. Populate "today's sessions" for attendance marking. |
| **Live Classes** | `getUpcomingSessions()` (filtered by `session_type = online_class`) | Auto-generate Zoom/Meet links for upcoming online sessions. |
| **Exam Management** | `isTeacherAvailable()`, `isVenueAvailable()` | Check teacher/room availability when scheduling exams. |
| **Student Dashboard** | `getSessionsForDateRange()` (filtered by enrolled batch) | Show "My Classes This Week" widget. |
| **Parent Dashboard** | `getSessionsForDateRange()` (filtered by child's batch) | Show "Child's Schedule" widget. |
| **Teacher Dashboard** | `getSessionsForDate()` (filtered by teacher_id), `getTeacherWorkload()` | Show "My Classes Today" and workload summary. |
| **Institution Dashboard** | `getSessionsForDate()`, `getUpcomingSessions()` | Show "Today's Classes" widget with status. |

---

## 10. Domain Events

All events are past-tense facts, dispatched outside database transactions (per project convention).

| Event | Trigger | Payload | Potential Consumers |
|---|---|---|---|
| `ScheduleTemplatePublished` | Template transitions from `draft` to `published` | `tenant_id`, `template_id`, `batch_id`, `effective_from`, `effective_until` | Instance generation command |
| `ScheduleTemplateArchived` | Template transitions to `archived` | `tenant_id`, `template_id`, `batch_id` | Dashboard cleanup |
| `SessionInstanceGenerated` | Batch of instances generated from template | `tenant_id`, `template_id`, `count`, `date_range` | Logging, analytics |
| `SessionCancelled` | A session instance is cancelled | `tenant_id`, `session_id`, `batch_id`, `teacher_id`, `reason`, `cancelled_by` | Notification system (Phase 2), attendance (exclude from calculations) |
| `SessionRescheduled` | A session is rescheduled to a new date/time | `tenant_id`, `original_session_id`, `new_session_id`, `old_datetime`, `new_datetime`, `rescheduled_by` | Notification system (Phase 2), student dashboard update |
| `TeacherSubstituted` | A different teacher assigned to a session | `tenant_id`, `session_id`, `original_teacher_id`, `substitute_teacher_id`, `substituted_by` | Notification system (Phase 2), teacher workload recalculation |
| `SessionStatusChanged` | Session transitions between statuses | `tenant_id`, `session_id`, `old_status`, `new_status` | Attendance module (session in_progress → allow attendance marking) |
| `HolidayCreated` | A new holiday is added | `tenant_id`, `holiday_date`, `branch_id`, `name` | Instance generation (skip), dashboard (show upcoming holidays) |
| `ConflictDetected` | A scheduling conflict is detected (in `warn_and_allow` mode) | `tenant_id`, `session_id`, `conflict_type`, `conflicting_session_id` | Dashboard alerts |

---

## 11. API Endpoints (Conceptual)

All endpoints under the tenant-scoped API with standard middleware chain.

### 11.1 Schedule Templates

| Method | Endpoint | Capability | Description |
|---|---|---|---|
| `GET` | `/api/tenant/timetable/templates` | `CAP_TIMETABLE_MANAGE` | List templates (filterable by batch, status, branch) |
| `POST` | `/api/tenant/timetable/templates` | `CAP_TIMETABLE_MANAGE` | Create a new template |
| `GET` | `/api/tenant/timetable/templates/{id}` | `CAP_TIMETABLE_MANAGE` | Get template with all its slots |
| `PUT` | `/api/tenant/timetable/templates/{id}` | `CAP_TIMETABLE_MANAGE` | Update template metadata (title, dates, notes) |
| `POST` | `/api/tenant/timetable/templates/{id}/publish` | `CAP_TIMETABLE_MANAGE` | Publish a draft template (triggers instance generation) |
| `POST` | `/api/tenant/timetable/templates/{id}/archive` | `CAP_TIMETABLE_MANAGE` | Archive a published template (stops future generation) |
| `DELETE` | `/api/tenant/timetable/templates/{id}` | `CAP_TIMETABLE_MANAGE` | Soft-delete a draft template (published templates cannot be deleted, only archived) |

### 11.2 Template Slots

| Method | Endpoint | Capability | Description |
|---|---|---|---|
| `POST` | `/api/tenant/timetable/templates/{id}/slots` | `CAP_TIMETABLE_MANAGE` | Add a slot to a template (runs conflict check against other slots in same template) |
| `PUT` | `/api/tenant/timetable/templates/{id}/slots/{slotId}` | `CAP_TIMETABLE_MANAGE` | Update a slot (affects future instance generation only) |
| `DELETE` | `/api/tenant/timetable/templates/{id}/slots/{slotId}` | `CAP_TIMETABLE_MANAGE` | Remove a slot (stops future instance generation for this slot) |

### 11.3 Session Instances

| Method | Endpoint | Capability | Description |
|---|---|---|---|
| `GET` | `/api/tenant/timetable/sessions` | `CAP_TIMETABLE_VIEW_ALL` or `CAP_TIMETABLE_VIEW_OWN` | List sessions (date range, batch, teacher, venue, branch, status filters) |
| `POST` | `/api/tenant/timetable/sessions` | `CAP_SESSION_CREATE_ADHOC` | Create an ad-hoc session |
| `GET` | `/api/tenant/timetable/sessions/{id}` | `CAP_TIMETABLE_VIEW_ALL` or `CAP_TIMETABLE_VIEW_OWN` | Get session detail |
| `POST` | `/api/tenant/timetable/sessions/{id}/cancel` | `CAP_SESSION_MANAGE` | Cancel a session (requires reason) |
| `POST` | `/api/tenant/timetable/sessions/{id}/reschedule` | `CAP_SESSION_MANAGE` | Reschedule a session (creates new instance) |
| `PATCH` | `/api/tenant/timetable/sessions/{id}/substitute` | `CAP_SESSION_MANAGE` | Assign substitute teacher |
| `PATCH` | `/api/tenant/timetable/sessions/{id}/status` | `CAP_SESSION_STATUS_UPDATE` | Manually update session status (start/complete) |

### 11.4 Venues

| Method | Endpoint | Capability | Description |
|---|---|---|---|
| `GET` | `/api/tenant/timetable/venues` | `CAP_VENUE_MANAGE` or `CAP_TIMETABLE_MANAGE` | List venues (branch filter) |
| `POST` | `/api/tenant/timetable/venues` | `CAP_VENUE_MANAGE` | Create a venue |
| `PUT` | `/api/tenant/timetable/venues/{id}` | `CAP_VENUE_MANAGE` | Update a venue |
| `DELETE` | `/api/tenant/timetable/venues/{id}` | `CAP_VENUE_MANAGE` | Soft-delete a venue (fails if assigned to future sessions) |

### 11.5 Holidays

| Method | Endpoint | Capability | Description |
|---|---|---|---|
| `GET` | `/api/tenant/timetable/holidays` | `CAP_HOLIDAY_MANAGE` or `CAP_TIMETABLE_VIEW_ALL` | List holidays (year, branch filter) |
| `POST` | `/api/tenant/timetable/holidays` | `CAP_HOLIDAY_MANAGE` | Add a holiday |
| `PUT` | `/api/tenant/timetable/holidays/{id}` | `CAP_HOLIDAY_MANAGE` | Update a holiday |
| `DELETE` | `/api/tenant/timetable/holidays/{id}` | `CAP_HOLIDAY_MANAGE` | Remove a holiday |

### 11.6 Settings

| Method | Endpoint | Capability | Description |
|---|---|---|---|
| `GET` | `/api/tenant/timetable/settings` | `CAP_TIMETABLE_SETTINGS` | Get current timetable settings |
| `PUT` | `/api/tenant/timetable/settings` | `CAP_TIMETABLE_SETTINGS` | Update timetable settings |

### 11.7 Student/Parent Self-Service (Read-Only)

| Method | Endpoint | Capability | Description |
|---|---|---|---|
| `GET` | `/api/tenant/my/schedule` | `CAP_TIMETABLE_VIEW_SELF` | Get own class schedule (student: enrolled batches) |
| `GET` | `/api/tenant/my/children/{id}/schedule` | `CAP_TIMETABLE_VIEW_SELF` (parent) | Get linked child's schedule |

---

## 12. Instance Generation Engine

### 12.1 How It Works

The instance generation engine is a **scheduled command** that runs daily (configurable) and an **on-demand trigger** fired when a template is published.

**Algorithm:**

```
For each tenant with timetable module enabled:
    Load timetable_settings (look_ahead_weeks, working_days, timezone)
    Load all published templates where effective_from <= today + look_ahead AND effective_until >= today
    Load holiday calendar for the look-ahead period

    For each template:
        For each slot in template:
            For each date from max(today, template.effective_from) to min(today + look_ahead, template.effective_until):
                If date.day_of_week != slot.day_of_week → skip
                If date.day_of_week not in working_days → skip
                If date is a holiday (institution-wide or branch-matching) → skip
                If instance already exists for (tenant_id, slot_id, date) → skip (idempotent)

                Create session_instance:
                    tenant_id = template.tenant_id
                    template_slot_id = slot.id
                    batch_id = template.batch_id
                    branch_id = template.branch_id
                    subject_id = slot.subject_id
                    teacher_id = slot.teacher_id
                    venue_id = slot.venue_id
                    session_date = date
                    start_time = slot.start_time
                    end_time = slot.end_time
                    session_type = slot.session_type
                    title = auto_generate(slot, date)
                    status = 'scheduled'

    Dispatch SessionInstanceGenerated event with count and date range
```

### 12.2 Scheduled Commands

| Command | Schedule | Purpose |
|---|---|---|
| `timetable:generate-instances` | Daily at 01:00 AM (tenant timezone) | Generate session instances for the look-ahead window |
| `timetable:update-session-statuses` | Every 5 minutes | Transition `scheduled` → `in_progress` (when current time >= start_time) and `in_progress` → `completed` (when current time >= end_time) |
| `timetable:flag-holiday-conflicts` | On-demand (triggered by `HolidayCreated` event) | Flag already-generated instances that conflict with newly added holidays |

---

## 13. Dashboard Widgets

### 13.1 Institution Owner Dashboard

**Widget: Today's Classes**
- Total sessions today: X | Completed: Y | In Progress: Z | Upcoming: W | Cancelled: C
- List view: time, subject, batch, teacher, venue, status badge
- Click-through to session detail

**Widget: This Week Overview**
- Mini calendar (Mon–Sat/Sun) with session count per day
- Color intensity by session density
- Highlight today

**Widget: Scheduling Alerts**
- Holiday conflicts flagged but not resolved
- Conflict warnings (in `warn_and_allow` mode)
- Templates expiring within 2 weeks (effective_until approaching)
- Batches without any published template

### 13.2 Teacher Dashboard

**Widget: My Classes Today**
- List of today's sessions: time, subject, batch, venue, status
- "Start Session" / "Mark Attendance" actions
- Count: X sessions today, Y hours total

### 13.3 Student Dashboard

**Widget: My Classes Today**
- List of today's sessions: time, subject, teacher, venue
- Cancelled sessions shown with reason
- "Next Class" highlight at the top

---

## 14. Edge Cases & Error Handling

| Scenario | Behavior |
|---|---|
| Template published with past `effective_from` | Instances generated from today forward, not from the past date. Past dates are skipped. |
| Two templates with overlapping validity for same batch | Publishing the second template is rejected with error: "Batch JEE-A already has a published template valid during this period." Admin must archive the existing template first or adjust validity dates. |
| Teacher deleted/deactivated while assigned to future sessions | Future sessions retain the teacher assignment but are flagged: "Assigned teacher is inactive." Admin receives dashboard alert to assign substitutes. |
| Venue deactivated while assigned to future sessions | Same approach: sessions flagged, admin alerted. Venue deletion blocked if assigned to future sessions. |
| Student enrolled in batch mid-term | Student sees all future sessions from enrollment date. Past sessions are visible but marked as "Enrolled after this session." |
| Student transferred between batches | New batch's sessions appear from transfer date. Old batch's sessions remain in history. |
| Template edited while instances exist | Only future generation is affected (TT-BR-05). Existing instances unchanged. A "Sync Future Instances" action is available that regenerates future instances from the updated template (with confirmation, since this overwrites any per-instance overrides). |
| Bulk cancel for exam week creates many cancellations | Each cancellation is individually logged. A batch operation ID links them for audit purposes. |
| Instance generation runs but tenant's subscription is expired | Instance generation skips tenants without active subscriptions. No error — just skip. |
| Overlapping time calculation edge case: Session A ends at 10:30, Session B starts at 10:30 | NOT a conflict. Overlap requires `A.start < B.end AND B.start < A.end`. Sessions that are back-to-back (end time = start time) do not overlap. |

---

## 15. Module Entitlement Integration

The Timetable module is entitled under the code `module.timetable`. When not entitled:

- All timetable API endpoints return `403 Module Not Entitled`
- Dashboard timetable widgets do not render
- Timetable data is preserved if the module is later disabled
- Downstream modules (Attendance) that depend on Timetable data gracefully degrade to ad-hoc mode
- The Attendance module checks `module.timetable` entitlement; if absent, it hides the "link to timetable session" option and operates purely on ad-hoc sessions

---

## 16. Security Requirements

| Requirement | Implementation |
|---|---|
| Tenant isolation | All queries scoped by `tenant_id` via `BelongsToTenant` trait |
| Capability enforcement | Backend UseCase layer checks capabilities. Frontend hides UI but backend is authority. |
| Teacher scope enforcement | Teachers with `CAP_TIMETABLE_VIEW_OWN` only see sessions where `teacher_id` matches their user ID |
| Student scope enforcement | Students with `CAP_TIMETABLE_VIEW_SELF` only see sessions for batches they are enrolled in |
| Parent scope enforcement | Parents with `CAP_TIMETABLE_VIEW_SELF` only see sessions for their linked child's batches |
| Audit trail | Template creation/edit/publish, session cancel/reschedule/substitute all logged via existing `AuditService` |
| Enumeration prevention | 404 responses are generic. Session IDs do not leak cross-tenant. |

---

## 17. Performance Considerations

| Concern | Approach |
|---|---|
| Instance generation for large tenant (50 batches, 6 slots each, 4 weeks) | ~1,200 instances per generation run. Batch insert with chunking (100 per batch). Expected time: < 5 seconds per tenant. |
| Calendar view query (all sessions for a week across all batches) | Indexed by `(tenant_id, session_date)`. For a tenant with 100 sessions/day, weekly view loads ~600 rows. Well within acceptable query time (< 200ms). |
| Conflict detection on slot creation | Query existing sessions for same teacher/venue on the same day-of-week within template validity. Index on `(tenant_id, teacher_id, session_date)`. |
| Status update command (every 5 minutes) | Queries `WHERE status = 'scheduled' AND session_date = today AND start_time <= now()`. Very selective with composite index. |
| Large multi-branch institution (5 branches, 200 sessions/day) | Weekly view: ~1,000 sessions. Paginate or filter by branch. Branch filter is the primary UX pattern — owners rarely view all branches simultaneously. |

---

## 18. Relationship to Product Handbook

The Product Handbook's existing Timetable & Scheduling Feature Specification (Section 3.2) describes high-level capabilities: calendar view, conflict guard, gated assignment, drag-and-drop, and integrations. This feature document operationalizes those capabilities with the following alignment:

| Handbook Capability | This Document's Implementation |
|---|---|
| Calendar View (FullCalendar) | Weekly/daily views with batch/teacher/venue/branch filters (Section 6, 13) |
| Conflict Guard | Teacher and venue conflict detection, configurable mode (Section 4.3) |
| Gated Assignment | Deferred to Phase 2. Phase 1 does not check teacher capability codes for subject assignment. The capability infrastructure exists (Tenant RBAC) but gating assignment by subject-teacher certification is a policy engine concern beyond core scheduling. |
| Drag-and-Drop | Deferred to Phase 2. Phase 1 uses form-based reschedule. |
| Zoom/Agora/Jitsi integration | Deferred to Live Classes module. Timetable exposes sessions; Live Classes adds provider links. |
| Google Calendar integration | Deferred to Phase 2 (iCal export). |

---

## 19. Non-Functional Requirements

| Requirement | Target |
|---|---|
| Template creation response time | < 500ms |
| Instance generation (per tenant) | < 10 seconds for 4-week look-ahead |
| Calendar view load time | < 1 second for weekly view |
| Conflict check response time | < 200ms per check |
| Data retention | Session instances retained for tenant's subscription lifetime |
| Mobile responsiveness | Calendar view and teacher "My Schedule" must work on mobile browsers |
| Timezone consistency | All times stored in tenant's configured timezone. Display is consistent across all views. |

---

## 20. Open Questions for Architecture Review

| # | Question | Impact |
|---|---|---|
| 1 | Should the Timetable bounded context be `Domain/Timetable/` (top-level) or nested under `Domain/AcademicOperations/Timetable/`? Same question applies to the Attendance module. | Directory structure consistency |
| 2 | The instance generation engine needs to run per-tenant with tenant-specific timezone. Should it be a single command iterating all tenants, or dispatched as individual queue jobs per tenant? | Queue architecture, failure isolation |
| 3 | Should the `session_instances` table use a `GENERATED` column for `locked_at` (computed from session end_time + tenant lock_period) or should Attendance module compute this independently? | Cross-module coupling |
| 4 | The "Sync Future Instances" action (regenerate future instances from updated template) is destructive — it overwrites per-instance overrides. Should it require `CAP_TIMETABLE_OVERRIDE` or is `CAP_TIMETABLE_MANAGE` sufficient? | Capability granularity |
| 5 | Should the 5-minute status update command transition sessions to `in_progress` automatically, or should this only happen when a teacher explicitly "starts" the session? Auto-transition is cleaner for attendance integration but doesn't confirm the teacher actually showed up. | Session lifecycle accuracy |
| 6 | Batch types in the Product Handbook include "Evergreen (Self-Paced)" batches with no fixed schedule. Should the Timetable module explicitly exclude self-paced batches from template creation, or leave it open? | Template-batch validation rules |
| 7 | For multi-branch teacher conflict: Teacher X teaches at Branch A 9–10 AM and Branch B 10–10:30 AM. The times don't overlap, but physical travel makes this impossible. Should we add a configurable "buffer time" between sessions for the same teacher across different branches? | Conflict detection sophistication |

---

## 21. What This Document Does NOT Cover

- **HOW it is implemented** — Developer Instructions document (next step)
- **Database migration SQL** — Implementation Plan
- **Eloquent model / Entity code** — Implementation Plan
- **Frontend component design** — Frontend Implementation Plan
- **Auto-scheduling algorithm** — Phase 3 feature document
- **Live class provider integration** — Live Classes module feature document
- **Test strategy** — Test Strategy document

---

## Document History

| Version | Date | Author | Changes |
|---|---|---|---|
| 1.0 | March 16, 2026 | Product & Architecture Team | Initial draft |

---

*This document follows the UBOTZ phase-gate methodology. The next step is Principal Engineer architecture review, followed by Developer Instructions document, then Implementation Plan.*