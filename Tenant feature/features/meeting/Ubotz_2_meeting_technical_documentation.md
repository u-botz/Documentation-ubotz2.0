# UBOTZ 2.0 — Meeting — Technical Specification

## Scope

Scheduling for hosts (availability, overrides), booking flows (instant book vs request), host responses, meeting links and outcomes, student self-service, and admin-wide visibility. Application code: `App\Application\TenantAdminDashboard\Meeting\UseCases\` and controllers under `App\Http\Controllers\Api\TenantAdminDashboard\Meeting\`.

## Route entry point

| File | Prefix |
|------|--------|
| `backend/routes/tenant_dashboard/meeting.php` | `/api/tenant/meetings` |

## Capabilities

| Capability | Routes |
|------------|--------|
| `meeting.manage_availability` | `/meetings/availabilities/*` — CRUD availability, deactivate, add/remove overrides |
| `meeting.manage_bookings` | `/meetings/bookings/*` — list/show host bookings, respond, link, outcome, cancel |
| `meeting.view_all` | `/meetings/admin/bookings`, `/meetings/admin/stats` |
| *(none on student group)* | `/meetings/student/*` — exposed to authenticated tenant users per controller/policy logic |

### Authorization: student routes (by design)

Student routes **`/meetings/student/*`** intentionally omit `tenant.capability:*` middleware. Access control is **not** absent: it is enforced in **application use cases** (e.g. requester vs host, booking ownership, slot availability) inside `MeetingStudentController` and related use cases. This avoids assigning a dedicated “student meeting” capability to every student role while still preventing cross-tenant and cross-user data access when implemented correctly.

## HTTP map (summary)

| Prefix | Purpose |
|--------|---------|
| `GET/POST /meetings/availabilities`, `GET/PUT /meetings/availabilities/{id}`, `PATCH .../deactivate`, `POST .../overrides`, `DELETE .../overrides/{overrideId}` | Host availability management |
| `GET /meetings/bookings`, `GET /meetings/bookings/{id}`, `PATCH .../respond`, `link`, `outcome`, `cancel` | Host booking management |
| `GET /meetings/admin/bookings`, `GET /meetings/admin/stats` | Admin overview |
| `GET /meetings/student/hosts`, `GET .../hosts/{hostId}/slots`, `POST .../book`, `POST .../request`, `GET .../my-bookings`, `GET .../my-bookings/{id}`, `PATCH .../cancel`, `PATCH .../respond-counter` | Student flows |

Paths match `frontend/config/api-endpoints.ts` → **`TENANT_MEETING`**.

## Application use cases (examples)

Under `Meeting\UseCases\`:

- Availability: `CreateMeetingAvailabilityUseCase`, `UpdateMeetingAvailabilityUseCase`, `DeactivateMeetingAvailabilityUseCase`, `AddMeetingAvailabilityOverrideUseCase`, `RemoveMeetingAvailabilityOverrideUseCase`
- Booking: `BookMeetingFromAvailabilityUseCase`, `RequestMeetingUseCase`, `RespondToMeetingRequestUseCase`, `RespondToMeetingCounterUseCase`, `UpdateMeetingBookingLinkUseCase`, `RecordMeetingOutcomeUseCase`, `CancelMeetingUseCase`

## Persistence (tenant)

Single migration bundle: `backend/database/migrations/tenant/2026_03_18_120000_create_meeting_system_tables.php`

| Table | Notes |
|-------|--------|
| `meeting_availabilities` | Host, recurrence (`recurrence_type`, `recurrence_day`, `specific_date`), time window, slot/buffer minutes, defaults for mode/venue/link, `effective_from` / `effective_until` |
| `meeting_availability_overrides` | Per-date block/override; unique `(availability_id, override_date)` |
| `meeting_bookings` | Host, requester, optional `availability_id`, `booking_type`, `status`, `mode`, time range, venue, `meeting_link`, optional `course_id`, counter-proposal fields, `price_cents`, cancellation/outcome fields |
| `meeting_slot_claims` | **Unique** `(tenant_id, host_id, start_time)` as `unq_meeting_slot_claim` — concurrency guard for the same host slot |

## Scheduling (console)

`backend/routes/console.php`:

- `meeting:expire-requests` — hourly
- `meeting:auto-complete` — daily at `00:30`

---

## Document history

- **2026-03-31:** Clarified student-route authorization model (no route-level capability; use-case enforcement).

## Linked references

- **Users** — hosts and requesters
- **Courses** — optional `course_id` on bookings
- **Locale / timezone** — display of times in clients uses tenant timezone context where applicable
