# UBOTZ 2.0 — Meeting System Implementation Plan

| Field | Value |
|-------|--------|
| **Document Type** | Implementation Plan (post-analysis) |
| **Date** | March 18, 2026 |
| **Source Spec** | `Ubotz_2_meeting_system_developer_instructions (1).md` |
| **Architecture Authority** | `Ubotz 2 developer instruction manual .md` (mandatory compliance) |

---

## 1. Purpose

This plan translates the **Meeting System** brief into implementable work that **strictly follows** the Developer Instruction Manual (layering, commands, use cases, tenant isolation, audit, events-after-commit, no business logic in controllers).

---

## 2. Existing Backend Analysis — No Duplication

| Area | What exists today | Relationship to Meeting System |
|------|-------------------|--------------------------------|
| **Live Sessions** (`/api/tenant/live-sessions`, `live_sessions` table) | Course/chapter-scoped sessions; providers (Zoom, Agora, Jitsi, BBB, local); join links; Agora start/end; **many students** per session | **Different domain.** Live sessions are tied to **course content** and scheduled class delivery. Meeting system is **1-to-1**, **relationship-driven**, **not** chapter-bound. **Do not** extend `live_sessions` or reuse Live Session use cases for Calendly-style booking. |
| **Timetable** (`/api/tenant/timetable/...`, batch templates, session instances) | Batch-level class scheduling; template slots; ad-hoc sessions; venues/holidays | **Different domain** per DR-MEET-001. Timetable = one teacher → many students, admin/template driven. **No** imports from Timetable into Meeting; **no** timetable conflict checks in Phase 1 (per spec). |
| **Enrollments** (`/api/tenant/enrollments/my-courses`, etc.) | Student course access | **Reuse only** the pattern: same `tenant_api` auth for student-facing routes. Optional `course_id` tag on meetings validates against `courses` — **no** new enrollment logic. |
| **Users / RBAC** | Tenant users, roles, capabilities | **Reuse** for host identity (`users.id`), capability gates (`meeting.*`). |
| **Notifications (Phase 14)** | Dispatcher, listeners | **Reuse** infrastructure; add meeting-specific listeners only. |
| **Audit** | `TenantAuditLogger` | **Reuse**; new action codes per spec §10. |

**Conclusion:** There is **no** meeting booking, availability, or 1-to-1 scheduling feature in the codebase. Implementation is **greenfield** in a new **Meeting** subdomain. **Explicitly avoid:** merging with Live Sessions, Timetable entities, or storing derived slots as DB rows.

---

## 3. Architectural Compliance (Developer Manual)

| Rule | Application |
|------|-------------|
| **Layers** | Domain (`Meeting` under `TenantAdminDashboard`): Entities, VOs, Events, Exceptions, Repository interfaces, pure services (e.g. slot math). Application: Commands, Queries, UseCases, Listeners. Infrastructure: `*Record`, Eloquent repos. HTTP: thin Controllers, FormRequests, Resources. |
| **Commands** | `final`, `readonly`, **`tenantId` first**, `actorId` where applicable, zero logic. |
| **UseCases** | One class per operation, `execute()`, orchestration order: validate → entity → `DB::transaction` → persist → audit → release events → **dispatch after commit**. |
| **Domain purity** | `grep Illuminate app/Domain/.../Meeting` → **0 results**. |
| **Tenant isolation** | Every query/command scoped by `tenant_id`; 404 for cross-tenant access; meeting link only for host + requester on detail APIs. |
| **Controllers** | Delegate to UseCase/Query only; map domain exceptions to HTTP in `bootstrap/app.php` (or existing handler). |
| **Forbidden** | Eloquent/DB in UseCase body outside transaction boundary patterns; business rules in FormRequest beyond syntax validation. |

---

## 4. API Route Convention (Codebase Alignment)

The spec references `/api/v1/tenant/...` and `/api/v1/panel/...`. **UBOTZ tenant APIs use `/api/tenant/...`** (no `v1` segment; see batch, timetable, live-sessions).

| Audience | Planned prefix (align with existing stack) |
|----------|--------------------------------------------|
| Host + admin overview | `/api/tenant/meetings/...` under existing tenant route group (`tenant.resolve.token`, `auth:tenant_api`, …) |
| Student / requester | `/api/tenant/meetings/student/...` **or** parallel group `/api/tenant/student-meetings/...` — **pick one** and document; same auth as enrollments, plus **role/policy** so only appropriate requester roles hit student endpoints. Parent flows: same student-style auth when Parent Panel exists; until then, APIs accept parent `users` as requester (no duplicate user system). |

Capability middleware: `meeting.manage_availability`, `meeting.manage_bookings`, `meeting.view_all` (seed + `TenantRoleCapabilitySeeder`).

**Module entitlement:** Add `module.meeting` (or nest under LMS) consistently with other features; gate routes if the product uses `tenant.module:*` elsewhere.

---

## 5. Database (Per Spec §5)

Implement in order:

1. **`meeting_availabilities`** — as specified; indexes as in brief.
2. **`meeting_availability_overrides`** — unique `(availability_id, override_date)`.
3. **`meeting_bookings`** — FKs to `tenants`, `users` (host/requester/cancelled_by), optional `courses`; status + booking_type columns as spec.

**Migrations:** tenant DB (same as other tenant-scoped tables). No shared “slot” table — slots are **computed**, not persisted (per spec §14.3).

---

## 6. Domain Layer Deliverables

| Item | Location |
|------|----------|
| `MeetingAvailabilityEntity` | `app/Domain/TenantAdminDashboard/Meeting/Entities/` |
| `MeetingBookingEntity` | same |
| VOs: `MeetingStatus`, `MeetingMode`, `BookingType`, `RecurrenceType` (+ time window helpers if needed) | `ValueObjects/` |
| Events | `Events/` (all listed in spec §4.4) |
| Exceptions | `Exceptions/` (`SlotAlreadyBookedException`, `InvalidMeetingStatusTransitionException`, `AvailabilityOverlapException`, `MeetingInPastException`, `DuplicateBookingOnSameDayException`, `MeetingRequestExpiredException`, etc.) |
| Repository interfaces | `Repositories/` (`MeetingAvailabilityRepositoryInterface`, `MeetingBookingRepositoryInterface`) |
| Optional pure service | e.g. `SlotGenerationService` / overlap checker — **no framework** |

---

## 7. Application Layer Deliverables

### 7.1 Availability (Sub-Phase A)

| UseCase | Command(s) |
|---------|------------|
| CreateAvailabilityUseCase | CreateAvailabilityCommand |
| UpdateAvailabilityUseCase | UpdateAvailabilityCommand |
| DeactivateAvailabilityUseCase | … |
| AddAvailabilityOverrideUseCase | … |
| RemoveAvailabilityOverrideUseCase | … |

Queries: list/detail for host’s availabilities (tenant + host scoped).

### 7.2 Availability-based booking (Sub-Phase B)

| UseCase / Query | Notes |
|-----------------|-------|
| BookMeetingUseCase | Transaction + **pessimistic lock** or atomic unique constraint on `(tenant_id, host_id, availability_id, start_time)` for confirmed rows; enforce BR-09–BR-12 |
| GetAvailableSlotsQuery | In-memory slot build + subtract bookings + overrides; **single query** for host confirmed bookings in range |

### 7.3 Request-based flow (Sub-Phase C)

| UseCase | Notes |
|---------|-------|
| RequestMeetingUseCase | `requested`, `availability_id` null |
| RespondToMeetingRequestUseCase | accept / reject / counter |
| RespondToCounterProposalUseCase | accept / decline counter |

### 7.4 Lifecycle + schedules (Sub-Phase D)

| UseCase / Artisan command | Schedule |
|---------------------------|----------|
| CancelMeetingUseCase | Before start only |
| RecordMeetingOutcomeUseCase | After end; host only |
| `meeting:expire-requests` | Hourly — 48h `requested` → `expired` |
| `meeting:auto-complete` | Daily — confirmed, end + 24h → `completed` |
| `meeting:send-reminders` | Every 15 min — idempotent via notification log |

Register commands in `routes/console.php` / Laravel scheduler.

### 7.5 Admin / host read APIs

- List host bookings (filters).
- **List all bookings** + **stats** query for `meeting.view_all` (read-only aggregates).

---

## 8. Infrastructure Layer

- `MeetingAvailabilityRecord`, `MeetingAvailabilityOverrideRecord`, `MeetingBookingRecord` under `Infrastructure/Persistence/TenantAdminDashboard/Meeting/Models/`.
- Eloquent repositories implementing domain interfaces; mappers `toEntity` / `fromEntity`.
- **MeetingServiceProvider** binding interfaces → implementations.

---

## 9. HTTP Layer

- Controllers split read/write where consistent with Batch/Timetable patterns.
- FormRequests: field rules only; existence checks may delegate to UseCase via NotFound exceptions.
- Resources: **strip `meeting_link`** unless actor is host or requester of that booking.
- Exception → HTTP mapping for all domain exceptions (409 conflict, 422 validation-like domain errors, 404).

---

## 10. Notifications & Audit (Sub-Phase E partial)

- Listeners subscribed to §4.4 events → Phase 14 dispatcher.
- Reminder command + idempotency table/log as spec §9.
- Audit actions §10 — every mutating UseCase.

---

## 11. Capabilities & Seeding

Add to `TenantCapabilitySeeder` + `TenantRoleCapabilitySeeder`:

- `meeting.manage_availability`
- `meeting.manage_bookings`
- `meeting.view_all`

Students: **no** meeting capabilities; authorization via role + ownership on student routes.

---

## 12. Testing (Manual §21 + Spec §13)

| Type | Focus |
|------|-------|
| Unit | Entity status machine, slot generation, overlap |
| Feature | Full HTTP flows; **cross-tenant 404**; link leakage tests |
| Concurrency | Two parallel POST book same slot → one 201, one 409 |

Run via Docker: `docker exec -it ubotz_backend php artisan test --filter=Meeting`.

---

## 13. Implementation Phasing (Execution Order)

| Phase | Scope | Exit criteria |
|-------|--------|---------------|
| **A** | Migrations + Availability CRUD + overrides + overlap rules | Host can create recurring/one-off windows and block dates |
| **B** | Bookings table + BookMeeting + GetAvailableSlots + student list/book APIs | Student can list slots and book; double-book prevented |
| **C** | Request / respond / counter flows | Full status machine for request-based path |
| **D** | Cancel, outcome, three scheduled commands | BR-20–BR-22 + expiry + reminders |
| **E** | Notifications, admin overview/stats, frontend (tenant admin + student panel) | DoD items 5–8 in spec §16 |

---

## 14. Explicit Non-Goals (Reconfirm)

- No Live Session or Timetable coupling.
- No stored slot rows.
- No Zoom/Google auto-links; no payments in Phase 1.
- No Parent Panel UI (APIs still support parent as requester user).

---

## 15. Approval Gate

Principal Engineer sign-off on this plan before **Phase A** migration merge, per spec §16.

---

## 16. Implementation status (March 18, 2026)

| Item | Status |
|------|--------|
| Migrations `meeting_availabilities`, `meeting_availability_overrides`, `meeting_bookings`, `meeting_slot_claims` | Done |
| Domain VOs, `MeetingAvailabilityEntity`, overlap detector, exceptions | Done |
| Availability CRUD + overrides + deactivate | Done |
| Slot query, book from availability, request/respond/counter, cancel, outcome, link | Done |
| Host / admin / student HTTP APIs under `/api/tenant/meetings/...` | Done |
| Capabilities + role seeding | Done |
| `meeting:expire-requests`, `meeting:auto-complete` scheduled | Done |
| Notification listeners + reminders + full test suite | Pending (Phase E) |

---

*End of Implementation Plan*
