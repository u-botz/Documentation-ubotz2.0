# UBOTZ 2.0 — Phase G4 Developer Instructions

## Timezone-Aware Scheduling

| Field | Value |
|---|---|
| **Document Type** | Developer Instruction (Pre-Implementation Brief) |
| **Phase** | G4 |
| **Date** | March 2026 |
| **Issued By** | Principal Engineer / Architecture Auditor |
| **Audience** | Implementation Developer (Antigravity) |
| **Expected Deliverable** | Phase G4 Implementation Plan (same format as prior phase plans) |
| **Prerequisites** | Phase 16A COMPLETE (timetable & scheduling) · Phase 17D COMPLETE (course pricing, live session topics) · Phase 18E COMPLETE (quiz lifecycle, open/close windows) · Assignment feature COMPLETE · Phase 14 COMPLETE (notification infrastructure) · Phase G1 COMPLETE (GCC tenant model with `country` field) |

> **This phase retrofits a scheduling assumption that was baked into every prior feature: that all datetimes are in a single implicit timezone. That assumption is now false. GCC tenants operate in UTC+3 and UTC+4. India tenants operate in UTC+5:30. The correction must be surgical, backward-compatible, and invisible to existing India-market tenants. One wrong migration, one missing conversion, one display layer that forgets to localise — and a student misses a live class or a quiz window closes at the wrong time. Treat every datetime column touched in this phase as financial data: one mistake has immediate, visible, irreversible consequences for real users.**

---

## 1. Mission Statement

Phase G4 makes every time-bearing entity in the platform timezone-aware. All datetimes are stored as UTC in the database. Conversion to the tenant's local timezone happens exclusively at the API response layer and the frontend display layer — never inside domain logic, never inside queries, never inside scheduled commands.

The tenant's timezone is derived automatically from the `country` field on the `tenants` table. No tenant configuration UI is required. No per-student timezone preference exists — all students of a tenant see times in the tenant's local timezone.

**The four pillars of this phase:**

```
1. DERIVE    — Resolve tenant timezone from country. Single source of truth.
2. STORE     — All datetimes written as UTC. No exceptions.
3. CONVERT   — Convert UTC → tenant timezone at the API response boundary only.
4. DISPLAY   — Frontend renders the localised string. No raw UTC shown to users.
```

**What this phase does NOT include:**

- Per-student timezone preference (all students see tenant local time)
- Arabic calendar (Hijri) support — deferred
- Tenant-configurable timezone override (country field is the sole source of truth)
- Per-branch timezone (branches inherit tenant timezone)
- Backfill of existing datetime data (all existing data treated as UTC — safe because server and MySQL session timezone are UTC)
- DST-aware recurrence rules (GCC timezones Asia/Dubai and Asia/Riyadh do not observe DST; Asia/Kolkata does not either — not a concern for current markets)
- Timezone display in notification email templates (deferred; emails show local time string but without explicit timezone label in this phase)

---

## 2. Business Context

### 2.1 The Problem

Every scheduling entity built in Phases 16A, 17D, 18, and the Assignment feature stores datetimes as `DATETIME` or `TIMESTAMP` columns. The server (Contabo VPS) is UTC. MySQL session timezone is UTC. Laravel's application timezone is UTC (`config/app.php → timezone: 'UTC'`).

**This means all existing data is already UTC-correct.** The problem is not in storage. The problem is:

1. **Input**: When a UAE tenant admin types "9:00 AM" into a session scheduler, the frontend currently sends `09:00:00` with no timezone context. The backend stores it as `09:00:00 UTC` — which is `1:00 PM Gulf Standard Time`. The session appears at the wrong time.
2. **Output**: When the API returns `starts_at: "2026-04-15 09:00:00"`, the frontend displays `09:00` to the student — but this is UTC, not the tenant's local time. A UAE student sees `09:00` but the class actually starts at `13:00` their time.
3. **Scheduled commands**: Notification dispatch commands like `NotifyExpiringSubscriptionsCommand` run at `9:00 AM` server time (UTC). For a UAE tenant this means notifications arrive at `1:00 PM` local time — not the intended morning delivery.

### 2.2 The Solution Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  FRONTEND (Next.js)                                             │
│  User types local time → appends tenant offset → sends UTC     │
│  API returns UTC → converts to tenant timezone → displays       │
└────────────────────────────┬────────────────────────────────────┘
                             │ HTTP (UTC datetimes in ISO 8601)
┌────────────────────────────▼────────────────────────────────────┐
│  API BOUNDARY (Laravel Controllers)                             │
│  Inbound:  parse UTC ISO 8601 from request                      │
│  Outbound: add timezone_offset and local_display to response    │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│  APPLICATION / DOMAIN LAYER                                     │
│  Works exclusively in UTC Carbon instances                      │
│  Never calls date() or now() without UTC context                │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│  DATABASE (MySQL UTC)                                           │
│  TIMESTAMP columns: stored and retrieved as UTC                 │
│  DATETIME columns: treated as UTC (server session is UTC)       │
└─────────────────────────────────────────────────────────────────┘
```

### 2.3 Country → Timezone Mapping

The mapping is static, developer-managed, and immutable at runtime:

| Country | IANA Timezone | UTC Offset | DST |
|---|---|---|---|
| `India` | `Asia/Kolkata` | +05:30 | None |
| `UAE` | `Asia/Dubai` | +04:00 | None |
| `Saudi Arabia` | `Asia/Riyadh` | +03:00 | None |

This mapping lives in a `TenantTimezoneResolver` domain service. It is the single place in the entire codebase where country-to-timezone mapping exists. If a new country is added, this service is updated — nowhere else.

If a tenant's `country` field does not match any known mapping (legacy data or future countries), the resolver returns `UTC` as the safe default and logs a warning.

### 2.4 Impact on Existing India Tenants

All existing India-market tenants have `country = 'India'` (or equivalent). Their timezone resolves to `Asia/Kolkata` (UTC+5:30). Because all existing datetime data is stored as UTC, the display layer will now show these times offset by +5:30 — which is **correct**. A session stored as `04:30:00 UTC` will display as `10:00 AM IST` — which is the time the tenant admin intended when they created it on an IST server during Phase 16A development.

**No migration is needed. No backfill is needed. No data is touched.** Only the display and input layers change.

---

## 3. Business Rules (NON-NEGOTIABLE)

### 3.1 Timezone Resolution Rules

| Rule ID | Rule | Detail |
|---|---|---|
| BR-01 | The tenant's timezone is derived solely from the `tenants.country` field via `TenantTimezoneResolver`. | No other source of timezone truth exists. No `timezone` column on any table. No runtime override. |
| BR-02 | `TenantTimezoneResolver` is a domain service. It has no infrastructure dependencies. It takes a `Country` value object and returns an IANA timezone string. | Pure PHP. Testable without database. |
| BR-03 | If `country` is null or unmapped, `TenantTimezoneResolver` returns `'UTC'` and logs a `WARNING` level entry. Scheduling continues. No exception is thrown. | Fail-safe default. Prevents scheduling breakage for incomplete tenant profiles. |
| BR-04 | The resolved timezone is NEVER cached per request or stored on the tenant record. It is computed on demand from the `country` field. | Country changes are rare but must take immediate effect. Caching would require invalidation logic that adds complexity without measurable performance benefit. |

### 3.2 Storage Rules

| Rule ID | Rule | Detail |
|---|---|---|
| BR-05 | All datetime values are stored as UTC in the database. This is already true for all existing data. Phase G4 enforces it for all new writes. | MySQL server timezone: UTC. Laravel app timezone: UTC. No deviation. |
| BR-06 | The `TIMESTAMP` column type is preferred over `DATETIME` for all scheduling columns. `TIMESTAMP` is always UTC-aware in MySQL. `DATETIME` is timezone-naive. | Where existing columns are `DATETIME`, no migration is required — the data is already UTC. Future columns must use `TIMESTAMP`. |
| BR-07 | `Carbon::now()` called anywhere in scheduling-related code must use `CarbonImmutable::now('UTC')`. Never `Carbon::now()` without explicit UTC — Laravel's default app timezone is UTC, but explicit is safer and self-documenting. | Domain layer uses `ClockInterface::now()` returning `CarbonImmutable` in UTC. |
| BR-08 | Existing datetime data in timetable sessions, quiz windows, and assignment due dates is treated as UTC with no backfill. | Decision: Safe because VPS and MySQL session were UTC throughout development. |

### 3.3 Input (Frontend → Backend) Rules

| Rule ID | Rule | Detail |
|---|---|---|
| BR-09 | The frontend sends all datetime values as UTC ISO 8601 strings: `2026-04-15T09:00:00Z`. | The `Z` suffix is mandatory. Backend rejects datetime strings without a timezone indicator. |
| BR-10 | The frontend is responsible for converting the user's local time input to UTC before sending. The tenant's IANA timezone is available to the frontend via the tenant profile API response. | The backend never performs "assume this is local time and convert it" — that logic belongs at the input boundary. |
| BR-11 | The backend validates that incoming datetimes parse correctly as UTC. Invalid or ambiguous datetime strings return HTTP 422. | Use Laravel's `date` validation rule with format `Y-m-d\TH:i:s\Z` or Carbon parsing with explicit UTC. |
| BR-12 | For time-only inputs (e.g., timetable recurring slot times like "every Monday at 09:00"), the frontend sends the time component as UTC. The tenant's offset is applied by the frontend before submission. | Example: UAE tenant sets class at 09:00 GST → frontend sends `05:00:00Z` (09:00 - 04:00). |

### 3.4 Output (Backend → Frontend) Rules

| Rule ID | Rule | Detail |
|---|---|---|
| BR-13 | Every API response that includes a datetime field must include two representations: raw UTC ISO 8601 and localised display string in tenant timezone. | Format: `{ "starts_at_utc": "2026-04-15T05:00:00Z", "starts_at_local": "2026-04-15T09:00:00+04:00", "timezone": "Asia/Dubai" }` |
| BR-14 | The `timezone` field is included at the response root level (not per-field) when the response contains datetime fields. | Avoids repetition. Frontend reads it once per response. |
| BR-15 | The localised datetime string includes the UTC offset in ISO 8601 format (`+04:00`, `+05:30`, `+03:00`). It does NOT include the timezone name abbreviation (e.g., `GST`, `IST`) — abbreviations are ambiguous across regions. | The frontend can derive a human-readable label from the IANA timezone string if needed. |
| BR-16 | The frontend uses ONLY the `*_local` fields for display. The `*_utc` fields are used for API submissions, comparisons, and sorting. | Frontend must never display raw UTC to any user. |

### 3.5 Affected Scheduling Entities

The following entities are in scope for G4. Each has datetime columns that must comply with BR-09 through BR-16:

| Entity | Table | Datetime Columns in Scope | Context |
|---|---|---|---|
| Timetable Session | `timetable_sessions` | `starts_at`, `ends_at` | Phase 16A |
| Timetable Template Slot | `timetable_template_slots` | `start_time`, `end_time` (time-only) | Phase 16A |
| Live Class Topic | `course_topic_sessions` (or equivalent) | `scheduled_at`, `ends_at` | Phase 17D |
| Quiz Window | `quizzes` | `available_from`, `available_until` | Phase 18 |
| Assignment | `assignments` | `due_at`, `available_from` | Assignment feature |
| Scheduled Notifications | `notifications` dispatch logic | Dispatch time computation | Phase 14 |

### 3.6 Notification Dispatch Timezone Rules

| Rule ID | Rule | Detail |
|---|---|---|
| BR-17 | Scheduled notification commands (Phase 14) that dispatch at a fixed server time must be made timezone-aware in G4. | Commands like `NotifyExpiringSubscriptionsCommand` currently run at `9:00 AM UTC`. For UAE tenants this is `1:00 PM GST` — wrong. |
| BR-18 | Tenant-targeted scheduled notifications must compute dispatch eligibility in the tenant's local time. | Example: "send at 9:00 AM local time" → for UAE tenant, enqueue when server UTC time is `05:00 UTC`; for India tenant, enqueue when server UTC is `03:30 UTC`. |
| BR-19 | The `notification_sent_log` idempotency key (Phase 14) must include the tenant timezone date, not the UTC date. | Prevents a notification intended for "9 AM local Monday" from firing on UTC Monday (which may be Sunday local time for UTC+ tenants). |
| BR-20 | Ad-hoc notification dispatch (event-driven, not scheduled) requires no timezone changes. Events fire in real time; the notification content may include a localised time string, which the listener must compute using `TenantTimezoneResolver`. | Affects notification templates that display scheduled event times (e.g., "Your class starts at 09:00 GST"). |

### 3.7 Conflict Detection Rules

| Rule ID | Rule | Detail |
|---|---|---|
| BR-21 | The timetable conflict guard (Phase 16A) operates on UTC datetimes. No change required. Comparing UTC timestamps for overlap is correct regardless of timezone. | Timezone is irrelevant for overlap detection. Two sessions overlap if their UTC ranges intersect. This is already correct. |
| BR-22 | Quiz window enforcement (is the quiz currently open?) uses UTC `now()` compared against UTC `available_from` / `available_until`. No change required. | The enforcement logic is already timezone-correct. Only display changes. |
| BR-23 | Assignment due date enforcement uses UTC. No change required. | Same as BR-22. |

---

## 4. Domain Model

### 4.1 New Domain Service: `TenantTimezoneResolver`

Location: `Domain/Shared/Timezone/TenantTimezoneResolver.php`

```php
final class TenantTimezoneResolver
{
    private const COUNTRY_TIMEZONE_MAP = [
        'India'        => 'Asia/Kolkata',
        'UAE'          => 'Asia/Dubai',
        'Saudi Arabia' => 'Asia/Riyadh',
    ];

    public function resolve(string $country): string
    {
        if (isset(self::COUNTRY_TIMEZONE_MAP[$country])) {
            return self::COUNTRY_TIMEZONE_MAP[$country];
        }

        // Log warning — unknown country, fallback to UTC
        return 'UTC';
    }
}
```

This class has zero dependencies. It is pure PHP. It is testable with no framework. It must not be modified to accept anything other than the canonical country string from the `tenants` table.

### 4.2 New Value Object: `TenantTimezone`

Location: `Domain/Shared/Timezone/TenantTimezone.php`

Wraps the resolved IANA timezone string. Provides:
- `->toIana(): string` — e.g., `'Asia/Dubai'`
- `->toOffset(): string` — e.g., `'+04:00'`
- `->toCarbon(CarbonImmutable $utc): CarbonImmutable` — converts UTC Carbon to tenant local Carbon
- `->fromLocal(CarbonImmutable $local): CarbonImmutable` — converts tenant local Carbon to UTC

Rejects invalid IANA timezone strings in its constructor (validate via `DateTimeZone` constructor which throws on invalid input).

### 4.3 New Infrastructure Service: `TimezoneAwareResponseFormatter`

Location: `Infrastructure/Shared/Timezone/TimezoneAwareResponseFormatter.php`

A utility class called from API Resource classes. Takes a UTC `CarbonImmutable` and a `TenantTimezone` and returns the dual-representation array defined in BR-13.

```php
public function format(CarbonImmutable $utc, TenantTimezone $tz): array
{
    $local = $tz->toCarbon($utc);
    return [
        'utc'   => $utc->toIso8601String(),      // "2026-04-15T05:00:00+00:00"
        'local' => $local->toIso8601String(),     // "2026-04-15T09:00:00+04:00"
    ];
}
```

### 4.4 Modification: `ClockInterface`

The existing `ClockInterface` already returns `CarbonImmutable::now('UTC')`. No change required. This is confirmed as the correct implementation.

---

## 5. API Changes

### 5.1 Tenant Profile API — Timezone Addition

`GET /api/tenant/profile` (and any endpoint that returns tenant metadata) must include the resolved timezone:

```json
{
  "tenant": {
    "id": 42,
    "name": "Dubai Academy",
    "country": "UAE",
    "timezone": "Asia/Dubai",
    "timezone_offset": "+04:00"
  }
}
```

The frontend caches this on app load. All datetime localisation on the frontend derives from this single value.

### 5.2 Timetable Session API (Phase 16A — Modified)

`GET /api/tenant/timetable/sessions` response — datetime fields before G4:

```json
{ "starts_at": "2026-04-15 09:00:00" }
```

After G4:

```json
{
  "timezone": "Asia/Dubai",
  "sessions": [
    {
      "id": 1,
      "starts_at": {
        "utc": "2026-04-15T05:00:00+00:00",
        "local": "2026-04-15T09:00:00+04:00"
      },
      "ends_at": {
        "utc": "2026-04-15T06:30:00+00:00",
        "local": "2026-04-15T10:30:00+04:00"
      }
    }
  ]
}
```

`POST /api/tenant/timetable/sessions` request — before G4:

```json
{ "starts_at": "2026-04-15 09:00:00" }
```

After G4:

```json
{ "starts_at": "2026-04-15T05:00:00Z" }
```

### 5.3 Quiz Window API (Phase 18 — Modified)

`GET /api/tenant/quizzes/{id}` — adds timezone-aware window display:

```json
{
  "timezone": "Asia/Dubai",
  "available_from": {
    "utc": "2026-04-15T04:00:00+00:00",
    "local": "2026-04-15T08:00:00+04:00"
  },
  "available_until": {
    "utc": "2026-04-15T16:00:00+00:00",
    "local": "2026-04-15T20:00:00+04:00"
  }
}
```

`POST /api/tenant/quizzes` request — `available_from` and `available_until` must be UTC ISO 8601.

### 5.4 Assignment Due Date API — Modified

`GET /api/tenant/assignments/{id}` — adds timezone-aware due date:

```json
{
  "timezone": "Asia/Dubai",
  "due_at": {
    "utc": "2026-04-20T18:59:00+00:00",
    "local": "2026-04-20T22:59:00+04:00"
  }
}
```

### 5.5 Live Class Session API (Phase 17D — Modified)

`GET /api/tenant/courses/{id}/topics` — session-type topics include:

```json
{
  "timezone": "Asia/Dubai",
  "scheduled_at": {
    "utc": "2026-04-15T05:00:00+00:00",
    "local": "2026-04-15T09:00:00+04:00"
  }
}
```

### 5.6 Student-Facing APIs

All student-facing equivalents of the above endpoints follow identical timezone response format. Students always see tenant local time. No student-level timezone parameter is accepted.

---

## 6. Application Layer — Use Cases Modified

G4 does not introduce new UseCases for scheduling. It modifies the input/output contracts of existing UseCases across four bounded contexts. The following changes apply uniformly:

### 6.1 Inbound Change (All Scheduling UseCases)

All UseCases that accept datetime parameters must:
1. Accept `CarbonImmutable` in UTC (not a raw string)
2. The controller parses the incoming UTC ISO 8601 string into `CarbonImmutable::parse($request->input('starts_at'), 'UTC')`
3. The UseCase stores the UTC value directly — no conversion inside the UseCase

This is already the correct pattern if `ClockInterface` was used. The only change is enforcing that the controller always passes UTC Carbon, not a raw string.

### 6.2 Outbound Change (All Scheduling API Resources)

All Laravel API Resource classes (`TimetableSessionResource`, `QuizResource`, `AssignmentResource`, `LiveClassTopicResource`) must:
1. Inject or receive the tenant's resolved `TenantTimezone`
2. Pass all datetime fields through `TimezoneAwareResponseFormatter::format()`
3. Include the `timezone` key at the resource root level

The `TenantTimezone` is resolved once per request in the controller and passed to the Resource. It is not resolved inside the Resource class itself (avoids N+1 resolver calls on collection responses).

---

## 7. Notification Dispatch Timezone Fix

### 7.1 Affected Scheduled Commands (Phase 14)

| Command | Current Behaviour | G4 Behaviour |
|---|---|---|
| `NotifyExpiringSubscriptionsCommand` | Fires at 9:00 AM UTC for all tenants | Fires per-tenant when 9:00 AM local time is reached |
| `NotifyExpiringTrialsCommand` | Fires at 9:00 AM UTC | Per-tenant local 9:00 AM |
| `NotifyOverageGraceEndingCommand` | Fires at 9:00 AM UTC | Per-tenant local 9:00 AM |

### 7.2 Implementation Pattern for Timezone-Aware Scheduled Commands

All three commands follow this pattern after G4:

```
1. Load all tenants with pending notification candidates
2. Group tenants by resolved timezone
3. For each timezone group:
   a. Compute the tenant's "9:00 AM today" in local time → convert to UTC
   b. If current UTC time >= tenant local 9:00 AM UTC equivalent AND
      current UTC time < tenant local 10:00 AM UTC equivalent (1-hour window):
      → process this tenant's notifications
4. Check idempotency via notification_sent_log using local date (not UTC date)
```

The 1-hour window prevents the command (which runs every 15 minutes via scheduler) from firing multiple times for the same tenant on the same day.

### 7.3 Scheduler Frequency Change

The three affected commands must change from `->dailyAt('09:00')` to `->everyFifteenMinutes()`. The timezone window logic inside the command handles the "is it the right time for this tenant?" decision.

### 7.4 Notification Content — Local Time Strings

Any notification template that displays a scheduled event time must use the localised string. The listener must call `TenantTimezoneResolver` to get the timezone, then convert the UTC event time before constructing the `NotificationPayload`.

Example — "Your class is scheduled for April 15 at 09:00 GST" — the listener builds this string, not the template engine. The template receives a pre-formatted string, not a UTC datetime.

---

## 8. Frontend Requirements

### 8.1 Tenant Timezone Availability

The tenant's `timezone` (IANA string) and `timezone_offset` are available from the tenant profile API on app load. Store these in the global tenant context (TanStack Query tenant profile cache). All scheduling UI components read from this context.

### 8.2 Input Components — Datetime Pickers

All datetime picker components used in scheduling forms (timetable session creator, quiz window setter, assignment due date picker, live class scheduler) must:

1. Display times in tenant local timezone (use the tenant `timezone` from context)
2. On form submission, convert the selected local datetime to UTC ISO 8601 before including in the API request body
3. Use the `Intl.DateTimeFormat` API or a library like `date-fns-tz` for conversion — no custom timezone math
4. Show the tenant timezone label (e.g., "GST (UTC+4)") adjacent to all time inputs so the admin knows which timezone they are setting

### 8.3 Display Components — Datetime Rendering

All components that display scheduled datetimes must:

1. Use the `local` field from the dual-representation API response
2. Format using `Intl.DateTimeFormat` with the tenant timezone from context
3. Show a timezone indicator for the admin view (e.g., "09:00 GST")
4. For student view — show time only, without timezone indicator (students have no timezone context to confuse them; they see tenant local time which is their local time in a single-country institution)

### 8.4 Calendar Views (Timetable, Scheduler)

FullCalendar (or equivalent calendar library used in Phase 16A) must be configured with the tenant's IANA timezone string. This ensures:
- Events render at the correct local hour
- Drag-and-drop creates events in local time (library handles UTC conversion)
- "Now" indicator on the calendar reflects local time

Set `timeZone: tenantTimezone` in the FullCalendar options.

---

## 9. Infrastructure: Verification of Server/MySQL UTC Baseline

Before writing any G4 code, the developer MUST verify and document in the Implementation Plan:

```bash
# 1. Verify VPS system timezone
docker exec -it ubotz_backend sh -c "date"
# Expected: UTC time

# 2. Verify PHP/Laravel timezone
docker exec -it ubotz_backend sh -c "php -r \"echo date_default_timezone_get();\""
# Expected: UTC

# 3. Verify MySQL session timezone
docker exec -it ubotz_mysql mysql -u root -p -e "SELECT @@global.time_zone, @@session.time_zone;"
# Expected: +00:00 or UTC for both

# 4. Verify Laravel app timezone config
docker exec -it ubotz_backend sh -c "php artisan tinker --execute=\"echo config('app.timezone');\""
# Expected: UTC

# 5. Sample existing timetable data to confirm UTC storage
docker exec -it ubotz_mysql mysql -u root -p ubotz -e \
  "SELECT id, starts_at, ends_at FROM timetable_sessions LIMIT 5;"
```

If any of these return a non-UTC timezone, STOP. This is a critical finding that must be escalated before G4 proceeds. Existing data assumptions are invalid if the server was ever in a non-UTC timezone.

---

## 10. Capability Registry

No new capabilities are introduced in G4. This phase modifies existing scheduling feature behaviour — it does not introduce new actions requiring permission gates.

---

## 11. Domain Events

G4 does not introduce new domain events. It modifies the content of existing notification listeners that embed time strings in notification payloads (see §7.4). The events themselves are unchanged.

---

## 12. Decision Records

| DR | Decision | Rationale |
|---|---|---|
| DR-G4-01 | Country field is the sole timezone source of truth. No `timezone` column on tenants table. | Adding a `timezone` column creates a second source of truth. Country and timezone could diverge. A UAE tenant would not operate in `Asia/Kolkata`. The mapping is deterministic and derived — storing derived data violates normalization and creates a sync problem. |
| DR-G4-02 | UTC storage. Convert at display layer only. | This is the universal industry standard. Storing local time makes aggregate queries, sorting, conflict detection, and cross-tenant operations incorrect. UTC storage is the only architecturally safe option. |
| DR-G4-03 | No backfill of existing datetime data. Treat as UTC. | Server and MySQL session have been UTC throughout development. All stored datetimes are already UTC. Backfilling assumes they were stored in a different timezone — a false assumption that would corrupt correct data. |
| DR-G4-04 | All tenants migrated simultaneously — India tenants get `Asia/Kolkata` timezone. | Selective migration would require maintaining two code paths indefinitely. India tenants are unaffected in practice because `Asia/Kolkata` offset correctly interprets their existing UTC data. |
| DR-G4-05 | Student always sees tenant local time. No student timezone preference. | GCC coaching institutes enrol local students. A student in Dubai attending a Dubai academy should see Gulf time — not their device timezone which may be set incorrectly. Per-student timezone is a complexity multiplier with no current demand. |
| DR-G4-06 | Scheduled notification commands change to every-15-minutes with internal timezone window logic, rather than per-timezone cron jobs. | Per-timezone cron jobs would require dynamic cron registration or hardcoded entries for every supported timezone. The internal window approach is self-contained and extensible to new timezones without cron changes. |
| DR-G4-07 | `TenantTimezoneResolver` returns `'UTC'` on unknown country rather than throwing. | Throwing would break scheduling for any tenant with an incomplete profile. Silent degradation to UTC, combined with a warning log, is the safe default. The ops team can detect and correct via log monitoring. |
| DR-G4-08 | `TenantTimezone` value object wraps the IANA string rather than passing raw strings through the codebase. | Raw string timezone identifiers scattered through the codebase are impossible to grep, easy to mistype, and carry no type safety. The value object provides a typed, validated, behaviour-rich container. |

---

## 13. Security Checklist

| # | Requirement |
|---|---|
| S-01 | The tenant timezone is resolved server-side from the tenant's `country` field. It is NEVER accepted as a client request parameter. |
| S-02 | All scheduling API endpoints that accept datetime input validate the timezone indicator (`Z` suffix or explicit offset). Bare datetime strings without timezone indication are rejected with HTTP 422. |
| S-03 | Cross-tenant datetime leakage: scheduling API responses are scoped to `tenant_id` via existing `BelongsToTenant` global scopes. G4 does not relax these scopes. |
| S-04 | The `TimezoneAwareResponseFormatter` does not log or persist the UTC datetime it converts. It is a pure transformation utility. |
| S-05 | Notification content that includes localised time strings must sanitize tenant-provided names before embedding in notification body (existing Phase 14 rule — G4 does not relax it). |

---

## 14. What Phase G4 Does NOT Include

| Excluded Item | Reason | Deferred To |
|---|---|---|
| Per-student timezone preference | No current demand; complexity multiplier | Future student settings phase |
| Hijri (Islamic) calendar support | Separate UI and domain concern | Arabic RTL phase |
| Per-branch timezone | Branches inherit tenant timezone; single-country institutions | Future if multi-country branches arise |
| Tenant-configurable timezone override | Country field is deterministic source of truth | Formal review required to change this |
| Timezone label in notification emails (e.g., "GST") | Abbreviations are ambiguous; deferred for safety | Future notification template phase |
| DST transition handling | GCC and India timezones do not observe DST | Relevant only if European/US markets added |
| Timezone conversion UI in student profile | Students see tenant local time only | Future |
| Historical data timezone audit tool | Existing data confirmed UTC; audit tool is ops tooling | Future ops phase |

---

## 15. Quality Gates — Phase G4 Complete

### Architecture Gates (BLOCKING)

- [ ] `TenantTimezoneResolver` has zero `Illuminate` imports — pure PHP
- [ ] `TenantTimezone` value object throws on invalid IANA string construction
- [ ] `TimezoneAwareResponseFormatter` has no database or HTTP dependencies
- [ ] No raw IANA timezone string passed as a plain `string` parameter across more than one layer — must be wrapped in `TenantTimezone` value object
- [ ] PHPStan Level 5: zero new errors
- [ ] All tests pass — zero regression from prior phases
- [ ] `env()` check: zero results in `app/`, `routes/`, `database/`

### Storage & Correctness Gates (BLOCKING)

- [ ] Server UTC baseline verified and documented in Implementation Plan (§9 checks all pass)
- [ ] All new datetime columns introduced in G4 (if any) use `TIMESTAMP` type, not `DATETIME`
- [ ] No datetime column stores a non-UTC value (verify via test: write a local-time value, read it back, assert it was stored as UTC)
- [ ] `CarbonImmutable::now('UTC')` used in all scheduling-related domain/application code — grep for bare `Carbon::now()` returns zero results in G4-touched files

### Input/Output Contract Gates (BLOCKING)

- [ ] All scheduling POST/PATCH endpoints reject datetime strings without timezone indicator — test with `"2026-04-15 09:00:00"` (no Z) → HTTP 422
- [ ] All scheduling GET endpoints return dual-representation datetime (`utc` + `local`) for all affected entities
- [ ] `timezone` key present at response root level for all scheduling list and detail endpoints
- [ ] Tenant profile API returns `timezone` and `timezone_offset`
- [ ] India tenant (`Asia/Kolkata`, +05:30) response verified: `utc: 2026-04-15T03:30:00Z`, `local: 2026-04-15T09:00:00+05:30`
- [ ] UAE tenant (`Asia/Dubai`, +04:00) response verified: `utc: 2026-04-15T05:00:00Z`, `local: 2026-04-15T09:00:00+04:00`
- [ ] Saudi tenant (`Asia/Riyadh`, +03:00) response verified: `utc: 2026-04-15T06:00:00Z`, `local: 2026-04-15T09:00:00+03:00`

### Notification Gates (BLOCKING)

- [ ] `NotifyExpiringSubscriptionsCommand` scheduler frequency changed to `everyFifteenMinutes()`
- [ ] UAE tenant receives notification at 9:00 AM GST (05:00 UTC) not at 9:00 AM UTC
- [ ] India tenant receives notification at 9:00 AM IST (03:30 UTC) not at 9:00 AM UTC
- [ ] Idempotency key uses local date — same notification not sent twice on same local calendar day
- [ ] Notification templates that embed event times use localised string, not raw UTC

### Frontend Gates (BLOCKING)

- [ ] All scheduling datetime pickers display in tenant local timezone
- [ ] All scheduling datetime pickers submit UTC ISO 8601 (`Z` suffix) to API
- [ ] Tenant timezone label displayed adjacent to all time input fields in admin views
- [ ] FullCalendar (timetable view) configured with tenant IANA timezone string
- [ ] Student scheduling views display tenant local time with no UTC leakage

### Test Requirements

- [ ] Unit: `TenantTimezoneResolver` — India → `Asia/Kolkata`, UAE → `Asia/Dubai`, Saudi → `Asia/Riyadh`, unknown → `UTC` + warning logged
- [ ] Unit: `TenantTimezone` value object — valid IANA string accepted, invalid string throws, `toOffset()` correct for all three markets, `toCarbon()` conversion correct
- [ ] Unit: `TimezoneAwareResponseFormatter` — correct dual output for all three timezones, correct ISO 8601 format including offset
- [ ] Unit: Scheduled command timezone window logic — UAE tenant processed at 05:00 UTC, skipped at 04:50 UTC and 06:10 UTC
- [ ] Unit: Idempotency key includes local date — UAE tenant at 23:30 UTC (03:30 GST next day) uses next local day's key
- [ ] Feature: `POST /api/tenant/timetable/sessions` with bare datetime string → HTTP 422
- [ ] Feature: `POST /api/tenant/timetable/sessions` with UTC `Z` datetime → stored as UTC, returned as dual-representation
- [ ] Feature: `GET /api/tenant/timetable/sessions` for UAE tenant — `local` field is UTC+4
- [ ] Feature: `GET /api/tenant/timetable/sessions` for India tenant — `local` field is UTC+5:30
- [ ] Feature: `GET /api/tenant/quizzes/{id}` — window dates in dual representation
- [ ] Feature: `GET /api/tenant/assignments/{id}` — due date in dual representation
- [ ] Feature: `GET /api/tenant/profile` — includes `timezone` and `timezone_offset`
- [ ] Feature: Unknown country tenant — response includes `timezone: "UTC"`, no 500 error
- [ ] Feature: Cross-timezone conflict detection — two sessions at same UTC time conflict regardless of display timezone
- [ ] Minimum 30 new tests expected

---

## 16. Implementation Guidance for Antigravity

### 16.1 Gap Analysis Requirement

Before writing the implementation plan, the developer MUST:

1. Execute all five server baseline checks from §9 and include results verbatim in the plan
2. Inspect the actual column types of all affected datetime columns:
   ```sql
   SHOW COLUMNS FROM timetable_sessions WHERE Field IN ('starts_at', 'ends_at');
   SHOW COLUMNS FROM quizzes WHERE Field IN ('available_from', 'available_until');
   SHOW COLUMNS FROM assignments WHERE Field IN ('due_at', 'available_from');
   ```
3. Identify all existing API Resource classes that return datetime fields across the five affected entities — list them explicitly
4. Identify all existing scheduled command classes from Phase 14 — list their current `->dailyAt()` schedule and the notification types they dispatch
5. Confirm the FullCalendar version and `timeZone` configuration option availability in the frontend codebase

### 16.2 Scope Discipline

G4 touches many files across many bounded contexts. The risk of scope creep is high. The implementation plan must list every file that will be modified, grouped by bounded context. Any file not on that list must not be modified. Any required modification to an unlisted file is an architectural finding that must be escalated before proceeding.

### 16.3 Rollout Order

The implementation must follow this sequence to avoid breaking existing functionality mid-deployment:

```
Step 1: Implement TenantTimezoneResolver + TenantTimezone (domain layer — no DB changes)
Step 2: Implement TimezoneAwareResponseFormatter (infrastructure — no DB changes)
Step 3: Update Tenant Profile API to include timezone fields
Step 4: Update all GET endpoints (read-only — no input validation yet)
Step 5: Update frontend to read and display local times
Step 6: Update all POST/PATCH input validation (reject bare datetimes)
Step 7: Update frontend datetime pickers to submit UTC
Step 8: Update scheduled notification commands
Step 9: Full regression test run across all five scheduling entities
```

Steps 4 and 5 can deploy to production together (read-only, backward-compatible). Steps 6 and 7 must deploy together (input contract change requires frontend and backend simultaneously).

### 16.4 Library Recommendation

For frontend timezone conversion: use `date-fns-tz` (already likely in the Next.js project for other date formatting). Do not use `moment-timezone` (deprecated ecosystem). Do not write custom UTC offset arithmetic. Use `Intl.DateTimeFormat` for display formatting.

For backend PHP timezone conversion: use `CarbonImmutable::setTimezone()`. Do not use PHP's `date_create` or `strtotime` with timezone strings — these are error-prone with half-hour offsets like `+05:30`.

---

*Document version: G4-v1.0. This document is locked for implementation. Superseding documents must be versioned G4-v1.1 or higher and must not alter this document in place.*
