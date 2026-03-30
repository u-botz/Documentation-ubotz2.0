# UBOTZ 2.0 — Meeting System Developer Instructions

## Institutional Meeting Booking & Scheduling

| Field | Value |
|---|---|
| **Document Type** | Developer Instruction (Pre-Implementation Brief) |
| **Date** | March 18, 2026 |
| **Issued By** | Principal Engineer / Architecture Auditor |
| **Audience** | Implementation Developer (Antigravity) |
| **Expected Deliverable** | Implementation Plan (same format as 10A–14 plans) |
| **Prerequisites** | User CRUD COMPLETE (Phase 7B), RBAC COMPLETE (Phase 10A–10E), Notification Infrastructure COMPLETE (Phase 14), Department COMPLETE, Batch COMPLETE (for optional tagging), Student Panel DESIGNED |

> **This is an institutional Calendly — a structured booking system that connects students, parents, teachers, and administrators for 1-to-1 meetings. UBOTZ handles scheduling, availability, and booking workflows. Video calls happen on external platforms (Zoom/Google Meet) via manually provided links. The system is NOT a video conferencing platform.**

---

## 1. Mission Statement

This feature builds the **Meeting System** — a booking and scheduling layer that enables structured 1-to-1 interactions between institutional stakeholders. It serves the fundamental operational need of educational institutions: students need academic help from teachers, parents need progress discussions with teachers, and both need administrative meetings with counselors and owners.

The system has two sides:
1. **Host side** (Teacher, Admin, Owner) — publishes availability, manages bookings, marks outcomes
2. **Requester side** (Student, Parent) — browses availability, books slots, requests meetings

Two initiation models coexist:
1. **Availability-based booking** — Host publishes open time slots. Requesters browse and book directly. No approval needed.
2. **Request-based booking** — Requester proposes a specific date/time. Host accepts, rejects, or suggests an alternative.

**What this phase includes:**
- Meeting availability management (recurring patterns + one-off slots)
- Availability-based direct booking (student picks a slot → confirmed immediately)
- Request-based booking with accept/reject/counter-propose workflow
- Physical and online meeting modes (requester chooses at booking time)
- Manual meeting link entry (host pastes Zoom/Google Meet URL)
- Meeting lifecycle: `requested → confirmed → completed/no_show/cancelled`
- Outcome tracking: host marks meeting as completed (with optional notes), no-show, or cancelled
- Four relationship types: Student↔Teacher, Parent↔Teacher, Parent↔Admin, Student↔Admin
- Optional course/subject tagging on meetings
- Free cancellation by either party anytime before the meeting
- Backend APIs for both host and requester sides
- Frontend: Host management in Tenant Admin Dashboard + Student booking in Student Panel
- Notification integration: booking confirmations, cancellations, reminders
- Audit logging for all meeting lifecycle events

**What this phase does NOT include:**
- Parent Panel frontend (Parent↔Teacher and Parent↔Admin APIs exist, frontend deferred until Parent Panel is built)
- Paid meetings / payment integration (schema has `price_cents` column ready, payment flow deferred)
- Auto-generated Zoom/Google Meet links via API (manual link paste only)
- Timetable conflict checking (host manages their own schedule conflicts manually)
- Rate limiting on bookings (no max bookings per student — add later if abused)
- Group meetings (this is strictly 1-to-1; one host + one requester per meeting)
- Meeting recordings or transcripts
- In-meeting chat or collaboration tools
- Calendar sync (Google Calendar / Outlook export — future)
- Recurring meetings (each meeting is a single occurrence; recurring availability generates individual bookable slots)
- Waiting room / queue when no slots available
- Admin bulk-scheduling meetings on behalf of others

---

## 2. Business Context

### 2.1 Why This Feature Matters

**For a Coaching Institute (200 students, 15 teachers):**
The owner thinks: "My students struggle with specific topics. They need a way to book a 15-minute doubt-clearing session with their Physics teacher outside of regular class hours. Right now, they crowd around the teacher after class or message on WhatsApp. I need this structured — I want to see who's meeting whom, how often, and about what."

"Parents call my front desk asking to speak with teachers. My staff manually coordinates availability over phone calls. It takes 3 phone calls to schedule one PTM. I need a system where parents can see teacher availability and book directly."

**For an Online EdTech Platform (2000 learners, 30 instructors):**
The owner thinks: "Doubt-clearing sessions are my differentiator. I want teachers to publish office hours. Students browse and book a 20-minute video call. The teacher pastes a Google Meet link. Eventually, I'll charge ₹200 per premium session — but for now, free is fine."

"Career counseling is part of my product. Students book sessions with our counselors for course guidance. This needs to feel like a professional booking experience, not a support ticket."

### 2.2 Current State

No meeting or booking infrastructure exists in the platform. The Timetable system handles batch-level class scheduling (one teacher → many students) but has no concept of 1-to-1 bookings, availability publishing, or request/accept workflows. Meetings are a fundamentally different domain — they are relationship-driven, not schedule-driven.

The Teacher Dashboard in the Product Handbook references `/meetings` as a navigation item. The Parent Communication spec describes PTM slot booking with "Three-Click Booking: Select Teacher → Select Date → Click Time Slot → Confirm." This feature fulfills both of those specifications.

### 2.3 What Changes After This Phase

1. Teachers and admins can publish recurring and one-off availability windows for meetings.
2. Students can browse a teacher's available slots and book directly (availability-based) or propose a time (request-based).
3. Each meeting has a clear lifecycle with outcome tracking (completed, no-show, cancelled).
4. The institution gains visibility into meeting activity — who's meeting whom, how often, completion rates.
5. Notifications fire on booking confirmation, cancellation, and upcoming meeting reminders.

### 2.4 Stakeholder Perspectives

**Teacher** thinks: "I set my office hours — every Tuesday and Thursday 4–6 PM. Students book 20-minute slots. I see my upcoming meetings on my dashboard. After each meeting, I mark it as completed or no-show and optionally write a note like 'Covered projectile motion doubts.' For online meetings, I paste my Google Meet link."

**Student** thinks: "I go to the Meetings section in my panel, pick my Physics teacher, see their available slots this week, and book a 20-minute slot for Thursday at 4:20 PM. I choose 'Online' and the teacher sends me a Google Meet link. If something comes up, I cancel."

**Parent** thinks: "I want to discuss my child's performance with their Maths teacher. I see the teacher's available PTM slots, pick one for Saturday morning, and choose 'Physical — School Office.' After the meeting, the teacher marks it as completed." *(Parent frontend deferred — API ready.)*

**Admin/Owner** thinks: "I publish my availability for student career counseling — Mondays 10 AM–12 PM. I can also see all meetings across the institution: which teachers are getting booked the most, are there no-shows, are students actually using this feature."

---

## 3. Business Rules (NON-NEGOTIABLE)

### 3.1 Availability Rules

| Rule ID | Rule | Enforcement |
|---|---|---|
| BR-01 | An availability window defines a time range during which the host accepts meetings. It does NOT define individual slots — slots are derived by dividing the window by the configured slot duration. | Application logic: window `4:00–6:00 PM` with `duration=20min` yields 6 bookable slots |
| BR-02 | Recurring availability patterns generate concrete availability windows for a configurable horizon (e.g., next 4 weeks). The system materializes recurring patterns into date-specific windows. | Scheduled command or on-demand materialization |
| BR-03 | A host can override/block specific dates within a recurring pattern (e.g., "I'm available every Tuesday 4–6 PM EXCEPT March 25"). | `availability_overrides` table with `is_blocked=true` for excluded dates |
| BR-04 | One-off availability windows have a specific date and time range. They are not recurring. | `recurrence_type = none` on the availability record |
| BR-05 | A host can have multiple availability windows (e.g., Tuesday 4–6 PM for doubt-clearing AND Saturday 10 AM–12 PM for PTMs). Each window can have different slot durations and meeting types. | Multiple availability records per host |
| BR-06 | Availability windows must not overlap for the same host. Two windows on the same day and overlapping time ranges are rejected. | Application-layer validation in `CreateAvailabilityUseCase` |
| BR-07 | Buffer time between consecutive meetings is configurable per availability window (e.g., 5 minutes between slots). Default: 0 minutes. | `buffer_minutes` column on availability |

### 3.2 Booking Rules (Availability-Based)

| Rule ID | Rule | Enforcement |
|---|---|---|
| BR-08 | When a requester books a slot from published availability, the booking is **immediately confirmed**. No host approval needed. | Status set to `confirmed` on creation |
| BR-09 | A slot can only be booked by one requester. Once booked, the slot disappears from availability for other requesters. | Uniqueness check within transaction: no existing booking for the same host + time window |
| BR-10 | Double-booking prevention: if two requesters attempt to book the same slot simultaneously, only one succeeds. The second receives an error. | Pessimistic locking or atomic check-and-insert within DB transaction |
| BR-11 | A requester cannot book a slot in the past. Only future slots are bookable. | Application validation: `slot_start_time > now()` |
| BR-12 | A requester cannot book multiple meetings with the same host on the same day. One meeting per host per day per requester. | Application validation with existing booking query |

### 3.3 Booking Rules (Request-Based)

| Rule ID | Rule | Enforcement |
|---|---|---|
| BR-13 | A requester can propose a meeting at a specific date/time with a host, even outside published availability. This creates a booking in `requested` status. | Status set to `requested` on creation |
| BR-14 | The host can **accept** (→ `confirmed`), **reject** (→ `rejected`), or **counter-propose** (→ `counter_proposed`, with a new suggested time). | Status transitions in `RespondToMeetingRequestUseCase` |
| BR-15 | When the host counter-proposes, the requester can **accept the counter** (→ `confirmed`) or **decline** (→ `declined`). | Status transitions in `RespondToCounterProposalUseCase` |
| BR-16 | A meeting request expires if the host does not respond within 48 hours. Status → `expired`. | Scheduled command checks for unresponded requests older than 48 hours |
| BR-17 | Request-based bookings do NOT check against published availability. The host decides whether to accept regardless of their availability windows. | No availability validation for request-based flow |

### 3.4 Meeting Lifecycle Rules

| Rule ID | Rule | Enforcement |
|---|---|---|
| BR-18 | Meeting status lifecycle for availability-based: `confirmed → completed / no_show / cancelled` | Domain entity status transition validation |
| BR-19 | Meeting status lifecycle for request-based: `requested → confirmed / rejected / counter_proposed / expired`. After `confirmed`: same as BR-18. After `counter_proposed`: `accepted (→ confirmed) / declined`. | Domain entity status transition validation |
| BR-20 | Either party (host or requester) can cancel a confirmed meeting at any time before the meeting start time. | `CancelMeetingUseCase` checks `start_time > now()` |
| BR-21 | After the meeting's scheduled end time passes, the host can mark the outcome: `completed` (with optional notes) or `no_show`. | `RecordMeetingOutcomeUseCase` validates meeting time has passed |
| BR-22 | If the host does not mark an outcome within 24 hours after the meeting end time, the system auto-marks as `completed` (assumption: most meetings happen as planned). | Scheduled command: find meetings past end_time + 24h with status `confirmed`, set to `completed` |
| BR-23 | Cancelled meetings record who cancelled (host or requester) and an optional reason. | `cancelled_by`, `cancellation_reason` columns |

### 3.5 Meeting Mode Rules

| Rule ID | Rule | Enforcement |
|---|---|---|
| BR-24 | Meeting mode is `physical` or `online`. The requester selects the mode when booking. | `mode` column on meeting record |
| BR-25 | For **physical** meetings, an optional `venue` text field captures the location (e.g., "Room 204", "Principal's Office"). The host can set a default venue on the availability window. | `venue` column, nullable |
| BR-26 | For **online** meetings, the host provides a meeting link (Zoom/Google Meet URL). The link can be set on the availability window (reused for all bookings) or per individual meeting. | `meeting_link` column, nullable. Host can add/update the link before or after booking |
| BR-27 | The meeting link is only visible to confirmed participants (host + requester). It must NOT be exposed in public availability listings. | API response filtering: link only included for the host and the booked requester |

### 3.6 Visibility & Access Rules

| Rule ID | Rule | Enforcement |
|---|---|---|
| BR-28 | Any active student in the tenant can browse any teacher/admin's published availability and book a meeting. No relationship scoping in Phase 1. | Tenant-scoped queries only — no batch or course filtering on availability |
| BR-29 | A student can only see their own bookings. A teacher can only see bookings where they are the host. An admin with `meeting.view_all` capability can see all meetings in the institution. | Capability-gated queries |
| BR-30 | Parents can book meetings via API (all four relationship types supported in the backend), but Parent Panel frontend is deferred. | API endpoints exist, no frontend for parent context |

### 3.7 Tagging Rules

| Rule ID | Rule | Enforcement |
|---|---|---|
| BR-31 | Meetings can optionally be tagged with a `course_id` or a free-text `subject` field for context (e.g., "Physics doubt clearing"). Neither is required. | Nullable `course_id` FK and nullable `subject` VARCHAR |
| BR-32 | The optional `course_id` must reference a valid course in the tenant if provided. | FK constraint + application validation |

---

## 4. Domain Model

### 4.1 Bounded Context Placement

This feature creates a new **Meeting** bounded context under `TenantAdminDashboard` (host side) with requester-side APIs exposed to the Panel context.

| Component | Location | Rationale |
|---|---|---|
| `MeetingAvailabilityEntity` | `Domain/TenantAdminDashboard/Meeting/Entities/` | Host's availability window — the supply side |
| `MeetingBookingEntity` | `Domain/TenantAdminDashboard/Meeting/Entities/` | A booked/requested meeting — the demand side |
| `MeetingStatus` | `Domain/TenantAdminDashboard/Meeting/ValueObjects/` | Enum: `requested`, `confirmed`, `rejected`, `counter_proposed`, `accepted`, `declined`, `expired`, `completed`, `no_show`, `cancelled` |
| `MeetingMode` | `Domain/TenantAdminDashboard/Meeting/ValueObjects/` | Enum: `physical`, `online` |
| `BookingType` | `Domain/TenantAdminDashboard/Meeting/ValueObjects/` | Enum: `availability_based`, `request_based` |
| `RecurrenceType` | `Domain/TenantAdminDashboard/Meeting/ValueObjects/` | Enum: `none`, `daily`, `weekly` (expandable) |
| `MeetingAvailabilityRepositoryInterface` | `Domain/TenantAdminDashboard/Meeting/Repositories/` | Contract for availability persistence |
| `MeetingBookingRepositoryInterface` | `Domain/TenantAdminDashboard/Meeting/Repositories/` | Contract for booking persistence |
| Domain Events | `Domain/TenantAdminDashboard/Meeting/Events/` | See §4.4 |
| Domain Exceptions | `Domain/TenantAdminDashboard/Meeting/Exceptions/` | `SlotAlreadyBookedException`, `InvalidMeetingStatusTransitionException`, `AvailabilityOverlapException`, `MeetingInPastException`, `DuplicateBookingOnSameDayException`, `MeetingRequestExpiredException` |

### 4.2 Entity: MeetingAvailabilityEntity

```
MeetingAvailabilityEntity
├── id: int
├── tenantId: int
├── hostId: int (user_id of the teacher/admin)
├── title: string (e.g., "Doubt Clearing Office Hours", "PTM Slots")
├── description: string|null
├── recurrenceType: RecurrenceType (none, daily, weekly)
├── recurrenceDay: int|null (0=Sunday...6=Saturday, for weekly recurrence)
├── startTime: string (HH:MM — time of day the window starts, e.g., "16:00")
├── endTime: string (HH:MM — time of day the window ends, e.g., "18:00")
├── specificDate: Date|null (for one-off: the exact date; for recurring: null)
├── effectiveFrom: Date (for recurring: when the pattern starts)
├── effectiveUntil: Date|null (for recurring: when the pattern ends; null = indefinite)
├── slotDurationMinutes: int (e.g., 15, 20, 30, 45, 60 — free-form)
├── bufferMinutes: int (gap between consecutive slots, default 0)
├── defaultMode: MeetingMode|null (suggested mode, requester can override)
├── defaultVenue: string|null (for physical meetings)
├── defaultMeetingLink: string|null (for online meetings — reused across bookings)
├── isActive: bool (host can deactivate without deleting)
├── createdAt: DateTimeImmutable
├── updatedAt: DateTimeImmutable
│
├── Methods:
│   ├── generateSlots(date: Date): Slot[] — derives bookable time slots for a given date
│   ├── overlaps(other: MeetingAvailabilityEntity): bool
│   ├── deactivate(): void
│   └── isRecurring(): bool
│
└── Invariants:
    ├── startTime < endTime
    ├── slotDurationMinutes > 0
    ├── slotDurationMinutes fits within (endTime - startTime)
    ├── bufferMinutes >= 0
    ├── if recurrenceType == weekly: recurrenceDay is required
    ├── if recurrenceType == none: specificDate is required
    └── effectiveFrom <= effectiveUntil (when effectiveUntil is set)
```

### 4.3 Entity: MeetingBookingEntity

```
MeetingBookingEntity
├── id: int
├── tenantId: int
├── hostId: int (teacher/admin user_id)
├── requesterId: int (student/parent user_id)
├── availabilityId: int|null (FK — null for request-based bookings)
├── bookingType: BookingType (availability_based, request_based)
├── status: MeetingStatus
├── mode: MeetingMode (physical, online)
├── startTime: DateTimeImmutable
├── endTime: DateTimeImmutable
├── venue: string|null (for physical meetings)
├── meetingLink: string|null (for online — host-provided URL)
├── courseId: int|null (optional context tagging)
├── subject: string|null (free-text subject, e.g., "Kinematics doubt")
├── requesterNote: string|null (note from requester at booking time)
├── hostNote: string|null (note from host — added after meeting or on accept)
├── counterProposedStartTime: DateTimeImmutable|null (when host counter-proposes)
├── counterProposedEndTime: DateTimeImmutable|null
├── outcomeNote: string|null (host's summary after meeting)
├── cancelledBy: int|null (user_id of who cancelled)
├── cancellationReason: string|null
├── cancelledAt: DateTimeImmutable|null
├── completedAt: DateTimeImmutable|null
├── priceCents: int (default 0 — ready for future paid meetings)
├── createdAt: DateTimeImmutable
├── updatedAt: DateTimeImmutable
│
├── Methods:
│   ├── confirm(): void — transitions to confirmed
│   ├── reject(): void — transitions to rejected (request-based only)
│   ├── counterPropose(newStart, newEnd): void — host suggests alternative time
│   ├── acceptCounter(): void — requester accepts counter-proposal → confirmed
│   ├── declineCounter(): void — requester declines counter-proposal → declined
│   ├── cancel(userId, reason?): void — either party cancels before start time
│   ├── markCompleted(outcomeNote?): void — host marks after meeting
│   ├── markNoShow(): void — host marks requester as no-show
│   ├── expire(): void — system marks unresponded requests
│   ├── isUpcoming(): bool — confirmed and start_time > now
│   ├── isPast(): bool — end_time < now
│   └── canBeCancelledBy(userId): bool
│
└── Invariants:
    ├── startTime < endTime
    ├── if availability_based: status starts as confirmed
    ├── if request_based: status starts as requested
    ├── cancel only allowed when status == confirmed AND startTime > now
    ├── outcome (completed/no_show) only allowed when endTime < now
    └── counter-propose only allowed when status == requested
```

### 4.4 Domain Events

All events dispatched **after transaction commit**.

| Event | Payload | Triggered By |
|---|---|---|
| `MeetingAvailabilityCreated` | availability_id, tenant_id, host_id | `CreateAvailabilityUseCase` |
| `MeetingAvailabilityUpdated` | availability_id, tenant_id, host_id | `UpdateAvailabilityUseCase` |
| `MeetingAvailabilityDeactivated` | availability_id, tenant_id, host_id | `DeactivateAvailabilityUseCase` |
| `MeetingBooked` | booking_id, tenant_id, host_id, requester_id, booking_type, mode | `BookMeetingUseCase` |
| `MeetingRequestReceived` | booking_id, tenant_id, host_id, requester_id | `RequestMeetingUseCase` |
| `MeetingConfirmed` | booking_id, tenant_id, host_id, requester_id | `RespondToMeetingRequestUseCase` (accept) |
| `MeetingRejected` | booking_id, tenant_id, host_id, requester_id | `RespondToMeetingRequestUseCase` (reject) |
| `MeetingCounterProposed` | booking_id, tenant_id, host_id, requester_id, new_start, new_end | `RespondToMeetingRequestUseCase` (counter) |
| `MeetingCounterAccepted` | booking_id, tenant_id, host_id, requester_id | `RespondToCounterProposalUseCase` (accept) |
| `MeetingCounterDeclined` | booking_id, tenant_id, host_id, requester_id | `RespondToCounterProposalUseCase` (decline) |
| `MeetingCancelled` | booking_id, tenant_id, cancelled_by, reason | `CancelMeetingUseCase` |
| `MeetingCompleted` | booking_id, tenant_id, host_id, requester_id | `RecordMeetingOutcomeUseCase` |
| `MeetingNoShow` | booking_id, tenant_id, host_id, requester_id | `RecordMeetingOutcomeUseCase` |
| `MeetingRequestExpired` | booking_id, tenant_id, host_id, requester_id | `ExpireUnrespondedRequestsCommand` |

---

## 5. Database Schema

### 5.1 New Tables

**Table: `meeting_availabilities`** (tenant-scoped)

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | BIGINT UNSIGNED PK | NO | auto-increment | |
| `tenant_id` | BIGINT UNSIGNED FK → `tenants(id)` | NO | — | ON DELETE CASCADE |
| `host_id` | BIGINT UNSIGNED FK → `users(id)` | NO | — | Teacher/Admin. ON DELETE CASCADE |
| `title` | VARCHAR(255) | NO | — | e.g., "Physics Office Hours" |
| `description` | TEXT | YES | NULL | |
| `recurrence_type` | VARCHAR(20) | NO | `none` | `none`, `daily`, `weekly` |
| `recurrence_day` | TINYINT UNSIGNED | YES | NULL | 0=Sun..6=Sat (required if weekly) |
| `start_time` | TIME | NO | — | Window start (e.g., 16:00:00) |
| `end_time` | TIME | NO | — | Window end (e.g., 18:00:00) |
| `specific_date` | DATE | YES | NULL | For one-off availability |
| `effective_from` | DATE | NO | — | Pattern active from this date |
| `effective_until` | DATE | YES | NULL | Pattern active until (NULL = indefinite) |
| `slot_duration_minutes` | SMALLINT UNSIGNED | NO | — | Free-form: 10, 15, 20, 30, 45, 60 etc. |
| `buffer_minutes` | SMALLINT UNSIGNED | NO | 0 | Gap between consecutive slots |
| `default_mode` | VARCHAR(20) | YES | NULL | `physical`, `online` — suggested default |
| `default_venue` | VARCHAR(500) | YES | NULL | For physical meetings |
| `default_meeting_link` | VARCHAR(1000) | YES | NULL | For online meetings |
| `is_active` | BOOLEAN | NO | true | Soft toggle |
| `created_at` | TIMESTAMP | NO | CURRENT_TIMESTAMP | |
| `updated_at` | TIMESTAMP | NO | CURRENT_TIMESTAMP | |

**Indexes:**
- `idx_meeting_avail_tenant_host` — (`tenant_id`, `host_id`)
- `idx_meeting_avail_tenant_active` — (`tenant_id`, `is_active`)
- `idx_meeting_avail_host_day` — (`host_id`, `recurrence_day`) for weekly lookups
- `idx_meeting_avail_host_date` — (`host_id`, `specific_date`) for one-off lookups

---

**Table: `meeting_availability_overrides`** (tenant-scoped)

Allows hosts to block specific dates within a recurring pattern.

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | BIGINT UNSIGNED PK | NO | auto-increment | |
| `tenant_id` | BIGINT UNSIGNED FK → `tenants(id)` | NO | — | ON DELETE CASCADE |
| `availability_id` | BIGINT UNSIGNED FK → `meeting_availabilities(id)` | NO | — | ON DELETE CASCADE |
| `override_date` | DATE | NO | — | The specific date being overridden |
| `is_blocked` | BOOLEAN | NO | true | true = unavailable on this date |
| `reason` | VARCHAR(255) | YES | NULL | e.g., "Public holiday", "Personal leave" |
| `created_at` | TIMESTAMP | NO | CURRENT_TIMESTAMP | |

**Indexes:**
- `unq_meeting_override_avail_date` — UNIQUE(`availability_id`, `override_date`)
- `idx_meeting_override_tenant` — (`tenant_id`)

---

**Table: `meeting_bookings`** (tenant-scoped)

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | BIGINT UNSIGNED PK | NO | auto-increment | |
| `tenant_id` | BIGINT UNSIGNED FK → `tenants(id)` | NO | — | ON DELETE CASCADE |
| `host_id` | BIGINT UNSIGNED FK → `users(id)` | NO | — | Teacher/Admin. ON DELETE RESTRICT |
| `requester_id` | BIGINT UNSIGNED FK → `users(id)` | NO | — | Student/Parent. ON DELETE RESTRICT |
| `availability_id` | BIGINT UNSIGNED FK → `meeting_availabilities(id)` | YES | NULL | NULL for request-based bookings |
| `booking_type` | VARCHAR(30) | NO | — | `availability_based`, `request_based` |
| `status` | VARCHAR(30) | NO | — | `requested`, `confirmed`, `rejected`, `counter_proposed`, `accepted`, `declined`, `expired`, `completed`, `no_show`, `cancelled` |
| `mode` | VARCHAR(20) | NO | — | `physical`, `online` |
| `start_time` | DATETIME | NO | — | Meeting start |
| `end_time` | DATETIME | NO | — | Meeting end |
| `venue` | VARCHAR(500) | YES | NULL | For physical meetings |
| `meeting_link` | VARCHAR(1000) | YES | NULL | For online meetings — host-provided URL |
| `course_id` | BIGINT UNSIGNED FK → `courses(id)` | YES | NULL | Optional context tag. ON DELETE SET NULL |
| `subject` | VARCHAR(255) | YES | NULL | Free-text subject tag |
| `requester_note` | TEXT | YES | NULL | Note from requester at booking time |
| `host_note` | TEXT | YES | NULL | Host note on accept or after meeting |
| `counter_proposed_start` | DATETIME | YES | NULL | When host counter-proposes |
| `counter_proposed_end` | DATETIME | YES | NULL | |
| `outcome_note` | TEXT | YES | NULL | Host summary after completion |
| `cancelled_by` | BIGINT UNSIGNED FK → `users(id)` | YES | NULL | ON DELETE SET NULL |
| `cancellation_reason` | VARCHAR(500) | YES | NULL | |
| `cancelled_at` | TIMESTAMP | YES | NULL | |
| `completed_at` | TIMESTAMP | YES | NULL | |
| `price_cents` | INT UNSIGNED | NO | 0 | Ready for future paid meetings |
| `created_at` | TIMESTAMP | NO | CURRENT_TIMESTAMP | |
| `updated_at` | TIMESTAMP | NO | CURRENT_TIMESTAMP | |

**Indexes:**
- `idx_meeting_bookings_tenant_status` — (`tenant_id`, `status`)
- `idx_meeting_bookings_host` — (`host_id`, `status`)
- `idx_meeting_bookings_requester` — (`requester_id`, `status`)
- `idx_meeting_bookings_host_time` — (`host_id`, `start_time`) for conflict/overlap queries
- `idx_meeting_bookings_availability` — (`availability_id`) for slot occupancy queries
- `idx_meeting_bookings_tenant_time` — (`tenant_id`, `start_time`) for admin overview

---

## 6. API Design

### 6.1 Availability Management (Host Side — Tenant Admin Dashboard)

| Method | Endpoint | Purpose | Capability Required |
|---|---|---|---|
| POST | `/api/v1/tenant/meetings/availabilities` | Create availability window | `meeting.manage_availability` |
| GET | `/api/v1/tenant/meetings/availabilities` | List host's own availability windows | `meeting.manage_availability` |
| GET | `/api/v1/tenant/meetings/availabilities/{id}` | Get availability detail | `meeting.manage_availability` |
| PUT | `/api/v1/tenant/meetings/availabilities/{id}` | Update availability window | `meeting.manage_availability` |
| PATCH | `/api/v1/tenant/meetings/availabilities/{id}/deactivate` | Deactivate availability | `meeting.manage_availability` |
| POST | `/api/v1/tenant/meetings/availabilities/{id}/overrides` | Add date override (block a specific date) | `meeting.manage_availability` |
| DELETE | `/api/v1/tenant/meetings/availabilities/{id}/overrides/{overrideId}` | Remove date override | `meeting.manage_availability` |

### 6.2 Booking Management (Host Side — Tenant Admin Dashboard)

| Method | Endpoint | Purpose | Capability Required |
|---|---|---|---|
| GET | `/api/v1/tenant/meetings/bookings` | List bookings (as host) — filterable by status, date range | `meeting.manage_bookings` |
| GET | `/api/v1/tenant/meetings/bookings/{id}` | Get booking detail | `meeting.manage_bookings` |
| PATCH | `/api/v1/tenant/meetings/bookings/{id}/respond` | Accept / Reject / Counter-propose a request-based booking | `meeting.manage_bookings` |
| PATCH | `/api/v1/tenant/meetings/bookings/{id}/add-link` | Add/update meeting link for an online booking | `meeting.manage_bookings` |
| PATCH | `/api/v1/tenant/meetings/bookings/{id}/outcome` | Mark outcome: completed (with notes) or no-show | `meeting.manage_bookings` |
| PATCH | `/api/v1/tenant/meetings/bookings/{id}/cancel` | Cancel a confirmed booking (host-initiated) | `meeting.manage_bookings` |

### 6.3 Admin Overview (Tenant Admin Dashboard)

| Method | Endpoint | Purpose | Capability Required |
|---|---|---|---|
| GET | `/api/v1/tenant/meetings/admin/bookings` | List ALL bookings across institution | `meeting.view_all` |
| GET | `/api/v1/tenant/meetings/admin/stats` | Meeting stats: total, completed, no-show rate, busiest hosts | `meeting.view_all` |

### 6.4 Student Booking Side (Student Panel)

| Method | Endpoint | Purpose | Auth |
|---|---|---|---|
| GET | `/api/v1/panel/meetings/hosts` | List teachers/admins who have active availability | `tenant_api` (student) |
| GET | `/api/v1/panel/meetings/hosts/{hostId}/slots` | Get available slots for a specific host on a date range | `tenant_api` (student) |
| POST | `/api/v1/panel/meetings/book` | Book a slot (availability-based) | `tenant_api` (student) |
| POST | `/api/v1/panel/meetings/request` | Request a meeting (request-based — propose a time) | `tenant_api` (student) |
| GET | `/api/v1/panel/meetings/my-bookings` | List student's own bookings | `tenant_api` (student) |
| GET | `/api/v1/panel/meetings/my-bookings/{id}` | Get booking detail (includes meeting link if confirmed) | `tenant_api` (student) |
| PATCH | `/api/v1/panel/meetings/my-bookings/{id}/cancel` | Cancel a confirmed booking (requester-initiated) | `tenant_api` (student) |
| PATCH | `/api/v1/panel/meetings/my-bookings/{id}/respond-counter` | Accept or decline a counter-proposal | `tenant_api` (student) |

### 6.5 Available Slots Response Shape

When a student queries `GET /hosts/{hostId}/slots?from=2026-03-20&to=2026-03-27`, the response returns computed available slots:

```json
{
  "data": [
    {
      "date": "2026-03-24",
      "availability_id": 15,
      "availability_title": "Physics Office Hours",
      "slots": [
        { "start": "16:00", "end": "16:20", "available": true },
        { "start": "16:25", "end": "16:45", "available": true },
        { "start": "16:50", "end": "17:10", "available": false },
        { "start": "17:15", "end": "17:35", "available": true }
      ],
      "default_mode": "online"
    }
  ]
}
```

Slot `available: false` means already booked. The meeting link is NOT included here — only after booking confirmation.

### 6.6 Route Middleware Stack

**Tenant Admin Dashboard endpoints:**
1. `auth:tenant-api`
2. `resolve.tenant.from.token`
3. `ensure.tenant.active`
4. `ensure.user.active`
5. Capability check per endpoint

**Student Panel endpoints:**
1. `auth:tenant-api`
2. `resolve.tenant.from.token`
3. `ensure.tenant.active`
4. `ensure.user.active`
5. Role check: must have `student` role

---

## 7. Capability Registry (New Capabilities)

| Capability Code | Display Name | Module | Default Roles |
|---|---|---|---|
| `meeting.manage_availability` | Manage Meeting Availability | `meeting` | OWNER, ADMIN, TEACHER |
| `meeting.manage_bookings` | Manage Meeting Bookings | `meeting` | OWNER, ADMIN, TEACHER |
| `meeting.view_all` | View All Institution Meetings | `meeting` | OWNER, ADMIN |

Students access meeting booking via the Panel context using role-based auth, not capabilities.

---

## 8. Application Layer — UseCases

### 8.1 Availability UseCases

| UseCase | Key Logic |
|---|---|
| `CreateAvailabilityUseCase` | Validate host exists and has teacher/admin role. Validate time window (start < end, slot fits). Check for overlap with existing host availability. Persist. Audit log. Dispatch `MeetingAvailabilityCreated`. |
| `UpdateAvailabilityUseCase` | Load availability. Verify host ownership. Re-validate time window. Check overlap excluding self. Persist. Audit log. Dispatch `MeetingAvailabilityUpdated`. |
| `DeactivateAvailabilityUseCase` | Load availability. Set `is_active = false`. Existing bookings against this availability remain valid (they are already confirmed). Audit log. Dispatch `MeetingAvailabilityDeactivated`. |
| `AddAvailabilityOverrideUseCase` | Validate availability is recurring. Validate override date falls within effective range. Check no duplicate override for same date. Persist. Audit log. |
| `RemoveAvailabilityOverrideUseCase` | Load override. Verify tenant ownership. Delete. Audit log. |

### 8.2 Booking UseCases (Availability-Based)

| UseCase | Key Logic |
|---|---|
| `BookMeetingUseCase` | Validate availability exists and is active. Compute slot from availability + requested start time. Verify slot is not in the past. Verify slot is not already booked (query existing bookings for this availability + time, within DB transaction with locking). Verify requester has no other booking with same host on same day. Create booking with status `confirmed`. Audit log. Dispatch `MeetingBooked`. Trigger notification to host. |
| `GetAvailableSlotsQuery` | Load host's active availabilities. For each date in the requested range: compute slots (window ÷ duration + buffer). Subtract booked slots (query `meeting_bookings` where `availability_id` matches AND `status IN (confirmed)`). Subtract overridden dates. Return available slots. |

### 8.3 Booking UseCases (Request-Based)

| UseCase | Key Logic |
|---|---|
| `RequestMeetingUseCase` | Validate host exists. Validate requested time is in the future. Verify requester has no other booking with same host on same day. Create booking with status `requested`, `booking_type = request_based`, `availability_id = NULL`. Audit log. Dispatch `MeetingRequestReceived`. Trigger notification to host. |
| `RespondToMeetingRequestUseCase` | Load booking. Verify host ownership. Validate current status is `requested`. Accept: status → `confirmed`, dispatch `MeetingConfirmed`, notify requester. Reject: status → `rejected`, dispatch `MeetingRejected`, notify requester. Counter-propose: set `counter_proposed_start/end`, status → `counter_proposed`, dispatch `MeetingCounterProposed`, notify requester. |
| `RespondToCounterProposalUseCase` | Load booking. Verify requester ownership. Validate current status is `counter_proposed`. Accept: copy counter times to `start_time/end_time`, status → `confirmed`, dispatch `MeetingCounterAccepted`, notify host. Decline: status → `declined`, dispatch `MeetingCounterDeclined`, notify host. |

### 8.4 Lifecycle UseCases

| UseCase | Key Logic |
|---|---|
| `CancelMeetingUseCase` | Load booking. Verify user is host or requester. Validate status is `confirmed`. Validate `start_time > now()`. Set `cancelled_by`, `cancellation_reason`, `cancelled_at`, status → `cancelled`. Audit log. Dispatch `MeetingCancelled`. Notify the other party. |
| `RecordMeetingOutcomeUseCase` | Load booking. Verify host ownership. Validate status is `confirmed`. Validate `end_time < now()`. Set outcome: `completed` (with optional `outcome_note`, set `completed_at`) or `no_show`. Audit log. Dispatch `MeetingCompleted` or `MeetingNoShow`. |

### 8.5 Scheduled Commands

| Command | Schedule | Logic |
|---|---|---|
| `meeting:expire-requests` | Every hour | Find bookings where `status = requested` AND `created_at < now() - 48 hours`. Set status → `expired`. Dispatch `MeetingRequestExpired`. Notify requester. |
| `meeting:auto-complete` | Daily at midnight | Find bookings where `status = confirmed` AND `end_time < now() - 24 hours`. Set status → `completed`, `completed_at = end_time`. No notification (silent auto-complete). |

---

## 9. Notification Integration

These notifications use the Phase 14 Notification Infrastructure. Each event triggers a listener that constructs a `NotificationPayload` and dispatches through the `NotificationDispatcher`.

| Notification | Trigger Event | Recipient | Category | Priority | Channels |
|---|---|---|---|---|---|
| Meeting Booked | `MeetingBooked` | Host | `system` | `default` | Email + In-App |
| Meeting Request Received | `MeetingRequestReceived` | Host | `system` | `default` | Email + In-App |
| Meeting Confirmed | `MeetingConfirmed` | Requester | `system` | `default` | Email + In-App |
| Meeting Rejected | `MeetingRejected` | Requester | `system` | `default` | Email + In-App |
| Meeting Counter-Proposed | `MeetingCounterProposed` | Requester | `system` | `default` | Email + In-App |
| Meeting Cancelled | `MeetingCancelled` | The other party (not the canceller) | `system` | `default` | Email + In-App |
| Meeting Reminder | Scheduled (1 hour before) | Both host and requester | `system` | `default` | Email + In-App |
| Meeting Request Expired | `MeetingRequestExpired` | Requester | `system` | `low` | In-App only |

**Meeting Reminder** requires a scheduled command:

| Command | Schedule | Logic |
|---|---|---|
| `meeting:send-reminders` | Every 15 minutes | Find confirmed meetings starting within the next 60–75 minutes. Send reminder if not already sent (use `notification_sent_log` for idempotency). |

---

## 10. Audit Log Events

| Action | Entity Type | Trigger |
|---|---|---|
| `meeting.availability.created` | `meeting_availability` | CreateAvailabilityUseCase |
| `meeting.availability.updated` | `meeting_availability` | UpdateAvailabilityUseCase |
| `meeting.availability.deactivated` | `meeting_availability` | DeactivateAvailabilityUseCase |
| `meeting.override.added` | `meeting_availability_override` | AddAvailabilityOverrideUseCase |
| `meeting.override.removed` | `meeting_availability_override` | RemoveAvailabilityOverrideUseCase |
| `meeting.booked` | `meeting_booking` | BookMeetingUseCase |
| `meeting.requested` | `meeting_booking` | RequestMeetingUseCase |
| `meeting.confirmed` | `meeting_booking` | RespondToMeetingRequestUseCase |
| `meeting.rejected` | `meeting_booking` | RespondToMeetingRequestUseCase |
| `meeting.counter_proposed` | `meeting_booking` | RespondToMeetingRequestUseCase |
| `meeting.counter_accepted` | `meeting_booking` | RespondToCounterProposalUseCase |
| `meeting.counter_declined` | `meeting_booking` | RespondToCounterProposalUseCase |
| `meeting.cancelled` | `meeting_booking` | CancelMeetingUseCase |
| `meeting.completed` | `meeting_booking` | RecordMeetingOutcomeUseCase |
| `meeting.no_show` | `meeting_booking` | RecordMeetingOutcomeUseCase |
| `meeting.expired` | `meeting_booking` | ExpireUnrespondedRequestsCommand |

---

## 11. Security Considerations

| Concern | Mitigation |
|---|---|
| **Cross-tenant data leakage** | All queries scoped by `tenant_id`. UseCase verifies resource ownership. |
| **Tenant enumeration** | All "not found" responses return 404 regardless of whether resource exists in another tenant. |
| **Meeting link exposure** | Meeting link only included in API responses for confirmed participants (host or requester of that specific booking). Never in public availability listings. |
| **Slot double-booking** | Atomic check-and-insert within DB transaction. Pessimistic locking on availability slot query. |
| **Host impersonation** | Only the host can respond to booking requests, mark outcomes, or manage their own availability. Verified via `host_id == authenticated_user_id`. |
| **Requester impersonation** | Only the requester can cancel their own booking or respond to counter-proposals. Verified via `requester_id == authenticated_user_id`. |
| **Admin override** | Users with `meeting.view_all` can view all meetings but cannot modify them. Modification requires being the host or requester. |
| **Past-time booking** | All booking and request operations validate `start_time > now()`. |

---

## 12. Decision Records

### DR-MEET-001: Separate Bounded Context (Not Timetable Extension)

| Field | Value |
|---|---|
| **Decision** | Meetings are a separate bounded context, not an extension of the Timetable module. |
| **Rationale** | Timetable handles batch-level class scheduling (one host → many students, admin-driven). Meetings handle 1-to-1 relationship-driven bookings with availability/request workflows. They share no domain logic. Merging them creates a God Context with conditional behavior everywhere. |
| **Impact** | New domain layer, new tables, new APIs. No coupling to Timetable. |

### DR-MEET-002: No Timetable Conflict Checking

| Field | Value |
|---|---|
| **Decision** | Meeting availability does not check against the Timetable for conflicts. Hosts manage their own schedule manually. |
| **Rationale** | Cross-context queries violate bounded context isolation. A teacher is responsible for not publishing meeting availability during their class hours. Adding timetable conflict checking requires a cross-context service interface that adds complexity disproportionate to the benefit in Phase 1. |
| **Impact** | Possible double-booking if a teacher publishes availability during class hours. Acceptable risk — the teacher controls their own availability. |
| **Future** | A `ScheduleConflictQueryService` interface can be added later to warn (not block) about timetable overlaps. |

### DR-MEET-003: Two Initiation Models Coexist

| Field | Value |
|---|---|
| **Decision** | Both availability-based (immediate confirmation) and request-based (accept/reject workflow) booking models are supported simultaneously. |
| **Rationale** | Availability-based covers the common case (student picks an open slot). Request-based covers the edge case (student needs a meeting outside published hours, or the host hasn't published any availability). Both are real institutional workflows. |
| **Impact** | `MeetingBookingEntity` has a richer status machine. `booking_type` column distinguishes the two flows. |

### DR-MEET-004: Parent API Without Frontend

| Field | Value |
|---|---|
| **Decision** | Backend APIs support all four relationship types (including Parent→Teacher, Parent→Admin). Parent Panel frontend is deferred. |
| **Rationale** | The Student Panel exists and is the primary frontend for Phase 1. Parent Panel is not yet designed. Building parent-specific APIs now ensures no backend rework when the Parent Panel is built. |
| **Impact** | Parent booking is testable via API but has no UI in Phase 1. |

### DR-MEET-005: Manual Meeting Links

| Field | Value |
|---|---|
| **Decision** | Online meeting links are manually pasted by the host. No Zoom/Google Meet API auto-generation. |
| **Rationale** | API integrations with Zoom/Google require OAuth flows, webhook handlers, and per-tenant credential management — significant infrastructure work. Manual paste delivers 95% of the value with near-zero implementation cost. |
| **Impact** | Slight UX friction (host must create a Zoom meeting separately and paste the link). Acceptable for Phase 1. |
| **Future** | Zoom API / Google Calendar API integration can auto-generate links when the Live Session infrastructure is built. |

### DR-MEET-006: No Paid Meetings in Phase 1

| Field | Value |
|---|---|
| **Decision** | `price_cents` column exists in schema (default 0) but no payment flow is wired. All meetings are free. |
| **Rationale** | Payment integration requires Razorpay student-facing checkout, refund-on-cancellation logic, and settlement workflows. This is a separate sub-phase. |
| **Impact** | Schema ready for paid meetings. No code changes needed to add the column later. |

---

## 13. Testing Strategy

| Category | What to Test |
|---|---|
| **Unit Tests (Domain)** | MeetingBookingEntity status transitions (all valid and invalid paths). MeetingAvailabilityEntity slot generation logic. Overlap detection. |
| **UseCase Tests** | Each UseCase with mocked repository. Verify: slot availability computation, double-booking prevention, role checks, status guards, time validation. |
| **Integration Tests** | Full API endpoint tests. Availability CRUD. Booking flow (availability-based + request-based). Cancel. Outcome recording. Admin overview. |
| **Concurrency Tests** | Two simultaneous booking requests for the same slot — only one succeeds. |
| **Cross-Tenant Isolation** | Student in Tenant A cannot see or book availability from Tenant B. |
| **Status Machine Tests** | Exhaustive test of all valid and invalid status transitions for both booking types. |
| **Slot Computation Tests** | Verify correct slot generation: window ÷ duration + buffer. Override exclusion. Already-booked exclusion. Edge cases: window not evenly divisible by slot duration. |
| **Scheduled Command Tests** | Request expiration after 48 hours. Auto-complete after 24 hours past meeting end. Reminder idempotency. |

---

## 14. Implementation Guidance

### 14.1 Suggested Sub-Phasing

- **Sub-Phase A:** `meeting_availabilities` table + Availability CRUD (Entity, Repository, UseCases, Controller). Recurring pattern + one-off support. Override mechanism.
- **Sub-Phase B:** `meeting_bookings` table + Availability-based booking flow. Slot computation query. Student Panel API for browsing and booking.
- **Sub-Phase C:** Request-based booking flow. Accept/reject/counter-propose workflow. Counter-response from requester.
- **Sub-Phase D:** Meeting lifecycle: cancel, outcome recording (completed/no-show). Scheduled commands (expire requests, auto-complete, send reminders).
- **Sub-Phase E:** Notification listeners. Admin overview API. Frontend for both Tenant Admin Dashboard and Student Panel.

### 14.2 Slot Computation Algorithm

This is the core algorithmic challenge of the feature. Pseudo-code:

```
function getAvailableSlots(hostId, dateRange):
    availabilities = loadActiveAvailabilities(hostId)
    overrides = loadOverrides(availabilities.ids, dateRange)
    existingBookings = loadConfirmedBookings(hostId, dateRange)

    for each date in dateRange:
        for each availability matching this date:
            if override exists for (availability, date) AND is_blocked:
                skip this availability for this date

            slots = []
            currentStart = availability.startTime
            while currentStart + availability.slotDuration <= availability.endTime:
                slotEnd = currentStart + availability.slotDuration
                isBooked = existingBookings.any(b =>
                    b.availabilityId == availability.id AND
                    b.startTime == date + currentStart AND
                    b.status IN ('confirmed')
                )
                slots.add({ start: currentStart, end: slotEnd, available: !isBooked })
                currentStart = slotEnd + availability.bufferMinutes

            yield { date, availabilityId, slots }
```

**Performance note:** For the `existingBookings` query, fetch all confirmed bookings for the host within the date range in a single query, then match in-memory. Do not query per-slot.

### 14.3 What NOT to Do

- Do NOT couple this to the Timetable module. No cross-context imports.
- Do NOT use Laravel's built-in scheduling for slot computation. Slots are computed on-demand from availability rules, not stored as individual database rows.
- Do NOT store individual slots as rows. Slots are derived from availability windows. Only booked meetings are stored as rows.
- Do NOT expose meeting links in availability listing APIs. Links are only in booking detail responses for confirmed participants.
- Do NOT send meeting reminders synchronously. Use the scheduled command + notification infrastructure.
- Do NOT allow status transitions that skip steps (e.g., `requested` → `completed` without going through `confirmed`).

---

## 15. Future Phases (Out of Scope — Documented for Awareness)

| Feature | Dependency | Notes |
|---|---|---|
| Paid meetings | Razorpay student-facing checkout | Host sets price, requester pays at booking, refund on cancellation |
| Parent Panel frontend | Parent Panel design + build | Parent booking UI for PTM and admin meetings |
| Auto-generated Zoom links | Zoom OAuth integration | Per-tenant Zoom credentials, auto-create meeting room |
| Google Calendar sync | Google Calendar API | Export confirmed meetings to host's and requester's calendar |
| Timetable conflict warning | Cross-context query service | Warn host if availability overlaps with timetable sessions |
| Rate limiting | Configurable per tenant | Max N bookings per student per week |
| Meeting room / venue management | Venue entity (shared with Timetable) | Admin manages rooms, meetings check room availability |
| Group meetings | Schema extension | Allow multiple requesters per booking (e.g., 3 students meet a teacher together) |
| Recurring meetings | Booking extension | "Meet every Tuesday at 4 PM" — generates individual bookings from a template |
| Meeting analytics dashboard | Admin dashboard widgets | Most booked teachers, no-show rates, peak hours, subject distribution |
| Feedback/rating | Post-meeting survey | Student rates the meeting experience (1–5 stars) |

---

## 16. Definition of Done

This feature is complete when:

1. The implementation plan has been reviewed and approved by the Principal Engineer.
2. All code is implemented per the approved plan.
3. All quality gates pass.
4. A Principal Engineer audit confirms zero critical or high findings.
5. End-to-end demonstration: Teacher creates recurring availability → Student browses slots → Student books a slot → Both parties receive notification → Meeting time passes → Teacher marks completed with notes.
6. Request-based flow verified: Student requests meeting → Teacher counter-proposes → Student accepts counter → Confirmed.
7. Cancellation flow verified: Either party cancels → Other party notified.
8. Scheduled commands verified: Unresponded requests expire after 48 hours. Unresolved meetings auto-complete after 24 hours. Reminders fire 1 hour before.
9. Double-booking prevention verified: Two concurrent booking attempts for the same slot — only one succeeds.
10. Cross-tenant isolation verified.
11. Meeting link security verified: link not visible in availability listings.

---

*End of Document — UBOTZ 2.0 Meeting System Developer Instructions — March 18, 2026*
