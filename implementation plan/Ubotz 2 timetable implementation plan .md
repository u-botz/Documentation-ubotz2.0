# UBOTZ 2.0 — Timetable & Scheduling: Developer Implementation Plan

**Companion to:** Timetable & Scheduling Feature Document v1.0  
**Instruction Reference:** UBOTZ 2 Developer Instruction Manual v1.0  
**Date:** March 16, 2026  
**Author:** Principal Engineer  
**Status:** Ready for Development

---

> **Read This First**
>
> This plan operationalizes the feature document into concrete files, classes, and sequences. Every file here follows the mandatory architecture from the Developer Instruction Manual: Domain → Application → Infrastructure → HTTP. Do not skip steps or reorder layers. Each section builds on the previous.

---

## Architecture Decision: Bounded Context Placement

The Timetable module is placed at:

```
Domain/TenantAdminDashboard/Timetable/
Application/TenantAdminDashboard/Timetable/
Infrastructure/Persistence/TenantAdminDashboard/Timetable/
Http/Controllers/Api/TenantAdminDashboard/Timetable/
Http/Requests/TenantAdminDashboard/Timetable/
Http/Resources/TenantAdminDashboard/Timetable/
```

**Rationale:** Consistent with existing module placement (Attendance, Course, Quiz). The feature document's open question #1 is answered here in favour of existing convention.

**Instance generation architecture (Open Question #2):** A single Artisan command iterates all tenants but dispatches individual `GenerateTenantInstancesJob` queue jobs per tenant for failure isolation.

---

## Phase Breakdown

| Phase | Scope | Est. Files |
|---|---|---|
| **A — Database** | 5 migrations | 5 |
| **B — Domain Layer** | Value objects, entities, events, exceptions, repo interfaces | ~30 |
| **C — Infrastructure Layer** | Eloquent models (Records), repositories, query implementations | ~15 |
| **D — Application Layer** | Commands, UseCases, Queries | ~35 |
| **E — HTTP Layer** | Controllers, FormRequests, Resources | ~30 |
| **F — Console Commands & Jobs** | Scheduled Artisan commands, queue jobs | 4 |
| **G — Service Provider & Routes** | Bindings, route registration | 3 |
| **H — Capabilities Seeder** | RBAC capability seed | 1 |
| **I — Tests** | Feature + unit tests | ~20 |

---

## Phase A — Database Migrations

All migrations go into `database/migrations/tenant/`. Run order must match the table list below (foreign key dependencies).

### A-1: `create_timetable_settings_table`

```php
Schema::create('timetable_settings', function (Blueprint $table) {
    $table->id();
    $table->unsignedBigInteger('tenant_id')->unique();
    $table->string('conflict_mode', 20)->default('hard_block');
    $table->unsignedTinyInteger('default_look_ahead_weeks')->default(4);
    $table->string('generation_frequency', 20)->default('daily');
    $table->unsignedTinyInteger('week_starts_on')->default(0); // 0=Sun
    $table->string('working_days', 20)->default('1,2,3,4,5,6');
    $table->string('default_session_type', 30)->default('offline_class');
    $table->string('timezone', 50)->default('Asia/Kolkata');
    $table->timestamps();

    $table->foreign('tenant_id', 'fk_timetable_settings_tenants')
        ->references('id')->on('tenants')->onDelete('cascade');
});
```

### A-2: `create_venues_table`

```php
Schema::create('venues', function (Blueprint $table) {
    $table->id();
    $table->unsignedBigInteger('tenant_id');
    $table->unsignedBigInteger('branch_id')->nullable();
    $table->string('name', 100);
    $table->string('type', 30)->default('classroom');
    $table->unsignedSmallInteger('capacity')->nullable();
    $table->boolean('is_active')->default(true);
    $table->string('notes', 500)->nullable();
    $table->timestamps();
    $table->softDeletes();

    $table->foreign('tenant_id', 'fk_venues_tenants')
        ->references('id')->on('tenants')->onDelete('cascade');
    $table->index(['tenant_id', 'branch_id'], 'idx_venues_tenant_branch');
    $table->index(['tenant_id', 'is_active'], 'idx_venues_tenant_active');
});
```

### A-3: `create_holidays_table`

```php
Schema::create('holidays', function (Blueprint $table) {
    $table->id();
    $table->unsignedBigInteger('tenant_id');
    $table->unsignedBigInteger('branch_id')->nullable(); // NULL = all branches
    $table->date('holiday_date');
    $table->string('name', 100);
    $table->string('type', 30)->default('institutional');
    $table->boolean('is_recurring')->default(false);
    $table->unsignedBigInteger('created_by');
    $table->timestamps();

    $table->foreign('tenant_id', 'fk_holidays_tenants')
        ->references('id')->on('tenants')->onDelete('cascade');
    $table->unique(['tenant_id', 'branch_id', 'holiday_date'], 'unq_holidays_tenant_branch_date');
    $table->index(['tenant_id', 'holiday_date'], 'idx_holidays_tenant_date');
});
```

### A-4: `create_schedule_templates_table`

```php
Schema::create('schedule_templates', function (Blueprint $table) {
    $table->id();
    $table->unsignedBigInteger('tenant_id');
    $table->unsignedBigInteger('batch_id');
    $table->unsignedBigInteger('branch_id')->nullable();
    $table->string('title', 255);
    $table->string('status', 20)->default('draft'); // draft|published|archived
    $table->date('effective_from');
    $table->date('effective_until');
    $table->unsignedTinyInteger('look_ahead_weeks')->default(4);
    $table->unsignedBigInteger('created_by');
    $table->timestamp('published_at')->nullable();
    $table->unsignedBigInteger('published_by')->nullable();
    $table->text('notes')->nullable();
    $table->timestamps();
    $table->softDeletes();

    $table->foreign('tenant_id', 'fk_schedule_templates_tenants')
        ->references('id')->on('tenants')->onDelete('cascade');
    $table->index(['tenant_id', 'batch_id', 'status'], 'idx_schedule_templates_tenant_batch_status');
    $table->index(['tenant_id', 'status', 'effective_from', 'effective_until'],
        'idx_schedule_templates_tenant_status_dates');
});
```

### A-5: `create_template_slots_table`

```php
Schema::create('template_slots', function (Blueprint $table) {
    $table->id();
    $table->unsignedBigInteger('tenant_id');
    $table->unsignedBigInteger('schedule_template_id');
    $table->unsignedTinyInteger('day_of_week'); // 0=Sun..6=Sat
    $table->time('start_time');
    $table->time('end_time');
    $table->unsignedBigInteger('subject_id')->nullable();
    $table->unsignedBigInteger('teacher_id')->nullable();
    $table->unsignedBigInteger('venue_id')->nullable();
    $table->string('session_type', 30)->default('offline_class');
    $table->string('title_override', 255)->nullable();
    $table->unsignedSmallInteger('sort_order')->default(0);
    $table->timestamps();

    $table->foreign('tenant_id', 'fk_template_slots_tenants')
        ->references('id')->on('tenants')->onDelete('cascade');
    $table->foreign('schedule_template_id', 'fk_template_slots_schedule_templates')
        ->references('id')->on('schedule_templates')->onDelete('cascade');
    $table->unique(
        ['tenant_id', 'schedule_template_id', 'day_of_week', 'start_time'],
        'unq_template_slots_unique_slot'
    );
    $table->index(['tenant_id', 'teacher_id'], 'idx_template_slots_tenant_teacher');
});
```

### A-6: `create_session_instances_table`

```php
Schema::create('session_instances', function (Blueprint $table) {
    $table->id();
    $table->unsignedBigInteger('tenant_id');
    $table->unsignedBigInteger('template_slot_id')->nullable(); // NULL = ad-hoc
    $table->unsignedBigInteger('batch_id')->nullable();
    $table->unsignedBigInteger('branch_id')->nullable();
    $table->unsignedBigInteger('subject_id')->nullable();
    $table->unsignedBigInteger('teacher_id')->nullable();
    $table->unsignedBigInteger('venue_id')->nullable();
    $table->date('session_date');
    $table->time('start_time');
    $table->time('end_time');
    $table->string('session_type', 30)->default('offline_class');
    $table->string('title', 255);
    $table->string('status', 20)->default('scheduled');
    // scheduled|in_progress|completed|cancelled|rescheduled
    $table->string('cancellation_reason', 30)->nullable();
    $table->string('cancellation_notes', 500)->nullable();
    $table->unsignedBigInteger('cancelled_by')->nullable();
    $table->timestamp('cancelled_at')->nullable();
    $table->unsignedBigInteger('rescheduled_from_id')->nullable();
    $table->unsignedBigInteger('rescheduled_to_id')->nullable();
    $table->unsignedBigInteger('original_teacher_id')->nullable();
    $table->boolean('holiday_conflict')->default(false);
    $table->text('notes')->nullable();
    $table->timestamps();
    $table->softDeletes();

    $table->foreign('tenant_id', 'fk_session_instances_tenants')
        ->references('id')->on('tenants')->onDelete('cascade');

    // Idempotency unique index
    $table->unique(
        ['tenant_id', 'template_slot_id', 'session_date'],
        'unq_session_instances_idempotency'
    );

    // Query indexes
    $table->index(['tenant_id', 'session_date'], 'idx_session_instances_tenant_date');
    $table->index(['tenant_id', 'teacher_id', 'session_date'], 'idx_session_instances_tenant_teacher_date');
    $table->index(['tenant_id', 'batch_id', 'session_date'], 'idx_session_instances_tenant_batch_date');
    $table->index(['tenant_id', 'venue_id', 'session_date'], 'idx_session_instances_tenant_venue_date');
    $table->index(['tenant_id', 'status', 'session_date'], 'idx_session_instances_tenant_status_date');
});
```

> **Migration execution order:** `timetable_settings` → `venues` → `holidays` → `schedule_templates` → `template_slots` → `session_instances`

---

## Phase B — Domain Layer

### B-1 Value Objects

#### `TemplateStatus`
Path: `app/Domain/TenantAdminDashboard/Timetable/ValueObjects/TemplateStatus.php`

Constants: `DRAFT`, `PUBLISHED`, `ARCHIVED`  
Transitions: `draft → published`, `draft → archived`, `published → archived`  
`archived` is terminal.

#### `SessionStatus`
Path: `app/Domain/TenantAdminDashboard/Timetable/ValueObjects/SessionStatus.php`

Constants: `SCHEDULED`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED`, `RESCHEDULED`  
Transitions per state machine (Section 5 of feature doc):
- `scheduled → in_progress | cancelled | rescheduled`
- `in_progress → completed | cancelled`
- `completed`, `cancelled`, `rescheduled` → terminal (no transitions)

Method `isTerminal(): bool` — returns `true` for completed, cancelled, rescheduled.

#### `SessionType`
Path: `app/Domain/TenantAdminDashboard/Timetable/ValueObjects/SessionType.php`

Constants: `OFFLINE_CLASS`, `ONLINE_CLASS`, `HYBRID_CLASS`, `EXAM`, `LAB`, `EVENT`

#### `DayOfWeek`
Path: `app/Domain/TenantAdminDashboard/Timetable/ValueObjects/DayOfWeek.php`

Wraps 0–6 integer. Validates range. Provides `getLabel(): string` (Monday, Tuesday…).

#### `CancellationReason`
Path: `app/Domain/TenantAdminDashboard/Timetable/ValueObjects/CancellationReason.php`

Constants: `TEACHER_UNAVAILABLE`, `HOLIDAY`, `VENUE_UNAVAILABLE`, `LOW_ATTENDANCE`, `ADMINISTRATIVE`, `OTHER`  
Method: `requiresFreeText(): bool` — returns `true` only for `OTHER`.

#### `ConflictMode`
Path: `app/Domain/TenantAdminDashboard/Timetable/ValueObjects/ConflictMode.php`

Constants: `HARD_BLOCK`, `WARN_AND_ALLOW`

---

### B-2 Domain Exceptions

Path: `app/Domain/TenantAdminDashboard/Timetable/Exceptions/`

| Exception Class | HTTP Code | Trigger |
|---|---|---|
| `ScheduleTemplateNotFoundException` | 404 | Template not found or not in tenant |
| `TemplateSlotNotFoundException` | 404 | Slot not found |
| `SessionInstanceNotFoundException` | 404 | Session not found |
| `VenueNotFoundException` | 404 | Venue not found |
| `HolidayNotFoundException` | 404 | Holiday not found |
| `InvalidTemplateStatusTransitionException` | 422 | Invalid template state transition |
| `InvalidSessionStatusTransitionException` | 422 | Invalid session state transition |
| `OverlappingTemplateValidityException` | 409 | Two published templates overlap for same batch |
| `EmptyTemplatePublishException` | 422 | Attempt to publish template with zero slots |
| `TeacherConflictException` | 409 | Teacher double-booking detected |
| `VenueConflictException` | 409 | Venue double-booking detected |
| `SessionImmutableException` | 422 | Mutation attempt on completed/cancelled/rescheduled session |
| `CancellationNoteRequiredException` | 422 | Reason = `other` without free-text note |
| `VenueDeletionBlockedException` | 409 | Venue has future sessions — deletion blocked |

---

### B-3 Domain Entities

#### `ScheduleTemplateEntity`
Path: `app/Domain/TenantAdminDashboard/Timetable/Entities/ScheduleTemplateEntity.php`

```
Properties (via ScheduleTemplateProps value object):
  id, tenantId, batchId, branchId, title, status (TemplateStatus),
  effectiveFrom (DateTimeImmutable), effectiveUntil (DateTimeImmutable),
  lookAheadWeeks, createdBy, publishedAt, publishedBy, notes, deletedAt

Factory methods:
  create(ScheduleTemplateProps): self  → records ScheduleTemplateCreated
  reconstitute(ScheduleTemplateProps): self

Business methods:
  publish(int $actorId): self
    - validates: status must be DRAFT
    - validates: has at least one slot (passed in as parameter count)
    - validates: no overlapping published template (validated in UseCase, entity enforces status transition)
    - transitions status to PUBLISHED, records ScheduleTemplatePublished

  archive(int $actorId): self
    - validates: status must be PUBLISHED or DRAFT
    - transitions to ARCHIVED, records ScheduleTemplateArchived

  isActiveOn(DateTimeImmutable $date): bool
    - returns true if status=PUBLISHED and effectiveFrom <= date <= effectiveUntil
```

#### `TemplateSlotEntity`
Path: `app/Domain/TenantAdminDashboard/Timetable/Entities/TemplateSlotEntity.php`

```
Properties: id, tenantId, scheduleTemplateId, dayOfWeek (DayOfWeek),
  startTime (string H:i:s), endTime, subjectId, teacherId, venueId,
  sessionType (SessionType), titleOverride, sortOrder

Factory: create(), reconstitute()
Business: update(props) → records TemplateSlotUpdated
  overlapsWith(string $startTime, string $endTime): bool
  — time range overlap check for conflict detection
```

#### `SessionInstanceEntity`
Path: `app/Domain/TenantAdminDashboard/Timetable/Entities/SessionInstanceEntity.php`

```
Properties: id, tenantId, templateSlotId, batchId, branchId, subjectId,
  teacherId, venueId, sessionDate (DateTimeImmutable), startTime, endTime,
  sessionType, title, status (SessionStatus), cancellationReason,
  cancellationNotes, cancelledBy, cancelledAt, rescheduledFromId,
  rescheduledToId, originalTeacherId, holidayConflict, notes

Factory: create(), reconstitute()

Business methods:
  cancel(CancellationReason $reason, ?string $notes, int $actorId): self
    - guards: status.isTerminal() → throw SessionImmutableException
    - guards: reason.requiresFreeText() && empty($notes) → throw CancellationNoteRequiredException
    - transitions to CANCELLED, records SessionCancelled

  markRescheduled(int $newSessionId, int $actorId): self
    - guards: status must be SCHEDULED
    - transitions to RESCHEDULED, sets rescheduledToId, records SessionRescheduled

  substituteTeacher(int $newTeacherId, int $actorId): self
    - guards: status.isTerminal() → throw SessionImmutableException
    - sets originalTeacherId (if not already set), updates teacherId
    - records TeacherSubstituted

  updateStatus(SessionStatus $newStatus): self
    - validates transition via SessionStatus::canTransitionTo()
    - records SessionStatusChanged

  flagHolidayConflict(): self
    - sets holidayConflict = true (no status change)

  isAdHoc(): bool → returns templateSlotId === null
```

#### `VenueEntity`
Path: `app/Domain/TenantAdminDashboard/Timetable/Entities/VenueEntity.php`

Standard entity with `create()`, `reconstitute()`, `deactivate()`, `activate()`.

#### `HolidayEntity`
Path: `app/Domain/TenantAdminDashboard/Timetable/Entities/HolidayEntity.php`

Standard entity with `create()`, `reconstitute()`. Records `HolidayCreated` on create.

---

### B-4 Domain Events

Path: `app/Domain/TenantAdminDashboard/Timetable/Events/`

| Event Class | Recorded By | Payload |
|---|---|---|
| `ScheduleTemplateCreated` | ScheduleTemplateEntity::create | tenantId, templateId, batchId |
| `ScheduleTemplatePublished` | ScheduleTemplateEntity::publish | tenantId, templateId, batchId, effectiveFrom, effectiveUntil |
| `ScheduleTemplateArchived` | ScheduleTemplateEntity::archive | tenantId, templateId, batchId |
| `TemplateSlotUpdated` | TemplateSlotEntity::update | tenantId, slotId, templateId |
| `SessionInstanceGenerated` | Dispatched by GenerateInstancesUseCase (not entity) | tenantId, templateId, count, dateRange |
| `SessionCancelled` | SessionInstanceEntity::cancel | tenantId, sessionId, batchId, teacherId, reason, cancelledBy |
| `SessionRescheduled` | SessionInstanceEntity::markRescheduled | tenantId, originalSessionId, newSessionId, rescheduledBy |
| `TeacherSubstituted` | SessionInstanceEntity::substituteTeacher | tenantId, sessionId, originalTeacherId, newTeacherId, substitutedBy |
| `SessionStatusChanged` | SessionInstanceEntity::updateStatus | tenantId, sessionId, oldStatus, newStatus |
| `HolidayCreated` | HolidayEntity::create | tenantId, holidayDate, branchId, name |
| `ConflictDetected` | Dispatched by conflict detection service | tenantId, sessionId, conflictType, conflictingSessionId |

---

### B-5 Repository Interfaces

Path: `app/Domain/TenantAdminDashboard/Timetable/Repositories/`

**`ScheduleTemplateRepositoryInterface`**
```php
findById(int $tenantId, int $id): ?ScheduleTemplateEntity;
findPublishedForBatch(int $tenantId, int $batchId): array;
findPublishedInDateRange(int $tenantId, DateTimeImmutable $from, DateTimeImmutable $to): array;
hasOverlappingPublished(int $tenantId, int $batchId, DateTimeImmutable $from, DateTimeImmutable $to, ?int $excludeId): bool;
save(ScheduleTemplateEntity $template): ScheduleTemplateEntity;
delete(int $tenantId, int $id): void;
listByTenant(int $tenantId, array $filters): array; // batch_id, status, branch_id
```

**`TemplateSlotRepositoryInterface`**
```php
findById(int $tenantId, int $id): ?TemplateSlotEntity;
findByTemplateId(int $tenantId, int $templateId): array;
save(TemplateSlotEntity $slot): TemplateSlotEntity;
delete(int $tenantId, int $id): void;
countByTemplateId(int $tenantId, int $templateId): int;
```

**`SessionInstanceRepositoryInterface`**
```php
findById(int $tenantId, int $id): ?SessionInstanceEntity;
findBySlotAndDate(int $tenantId, int $slotId, DateTimeImmutable $date): ?SessionInstanceEntity;
findForDateRange(int $tenantId, DateTimeImmutable $start, DateTimeImmutable $end, array $filters): array;
findForDate(int $tenantId, DateTimeImmutable $date, array $filters): array;
findUpcoming(int $tenantId, array $filters, int $limit): array;
findScheduledForStatusUpdate(int $tenantId, DateTimeImmutable $now): array;
saveBatch(array $instances): void; // for bulk insert during generation
save(SessionInstanceEntity $instance): SessionInstanceEntity;
flagHolidayConflicts(int $tenantId, DateTimeImmutable $date, ?int $branchId): int;
```

**`VenueRepositoryInterface`**
```php
findById(int $tenantId, int $id): ?VenueEntity;
findByTenant(int $tenantId, array $filters): array;
hasFutureSessions(int $tenantId, int $venueId): bool;
save(VenueEntity $venue): VenueEntity;
delete(int $tenantId, int $id): void;
```

**`HolidayRepositoryInterface`**
```php
findById(int $tenantId, int $id): ?HolidayEntity;
findForPeriod(int $tenantId, DateTimeImmutable $from, DateTimeImmutable $to, ?int $branchId): array;
isHoliday(int $tenantId, DateTimeImmutable $date, ?int $branchId): bool;
save(HolidayEntity $holiday): HolidayEntity;
delete(int $tenantId, int $id): void;
```

**`TimetableSettingsRepositoryInterface`**
```php
findByTenant(int $tenantId): TimetableSettingsEntity;
save(TimetableSettingsEntity $settings): TimetableSettingsEntity;
findAllTenantIds(): array; // used by scheduled command to iterate tenants
```

**`TimetableConflictQueryInterface`** ← query interface for conflict detection
```php
teacherHasConflict(int $tenantId, int $teacherId, DateTimeImmutable $date, string $startTime, string $endTime, ?int $excludeSessionId): bool;
venueHasConflict(int $tenantId, int $venueId, DateTimeImmutable $date, string $startTime, string $endTime, ?int $excludeSessionId): bool;
templateSlotTeacherHasConflict(int $tenantId, int $teacherId, int $dayOfWeek, string $startTime, string $endTime, ?int $excludeSlotId): bool;
```

---

### B-6 Domain Service: ConflictDetectionService

Path: `app/Domain/TenantAdminDashboard/Timetable/Services/ConflictDetectionService.php`

Pure PHP. Injected with `TimetableConflictQueryInterface`.

```php
checkTeacherConflict(int $tenantId, int $teacherId, DateTimeImmutable $date, string $start, string $end, ConflictMode $mode, ?int $excludeId): ?ConflictDetected
checkVenueConflict(int $tenantId, int $venueId, DateTimeImmutable $date, string $start, string $end, ConflictMode $mode, ?int $excludeId): ?ConflictDetected
```

Returns `null` on no conflict. In `hard_block` mode, throws `TeacherConflictException` or `VenueConflictException`. In `warn_and_allow` mode, returns a `ConflictDetected` event for the UseCase to dispatch.

---

## Phase C — Infrastructure Layer

### C-1 Eloquent Records (Models)

Path: `app/Infrastructure/Persistence/TenantAdminDashboard/Timetable/Models/`

| Record Class | Table | Soft Deletes |
|---|---|---|
| `ScheduleTemplateRecord` | `schedule_templates` | Yes |
| `TemplateSlotRecord` | `template_slots` | No |
| `SessionInstanceRecord` | `session_instances` | Yes |
| `VenueRecord` | `venues` | Yes |
| `HolidayRecord` | `holidays` | No |
| `TimetableSettingsRecord` | `timetable_settings` | No |

All records use `BelongsToTenant` global scope trait (existing). `fillable` arrays match column lists from migrations. No business logic in records.

### C-2 Eloquent Repositories

Path: `app/Infrastructure/Persistence/TenantAdminDashboard/Timetable/`

| Implementation Class | Implements |
|---|---|
| `EloquentScheduleTemplateRepository` | `ScheduleTemplateRepositoryInterface` |
| `EloquentTemplateSlotRepository` | `TemplateSlotRepositoryInterface` |
| `EloquentSessionInstanceRepository` | `SessionInstanceRepositoryInterface` |
| `EloquentVenueRepository` | `VenueRepositoryInterface` |
| `EloquentHolidayRepository` | `HolidayRepositoryInterface` |
| `EloquentTimetableSettingsRepository` | `TimetableSettingsRepositoryInterface` |
| `EloquentTimetableConflictQuery` | `TimetableConflictQueryInterface` |

Each repository has:
- `toEntity(Record): Entity` — maps DB record to domain entity
- `fromEntity(Entity): array` — maps domain entity to DB array
- All queries explicitly scope by `tenant_id`
- `saveBatch()` in SessionInstanceRepository uses `upsert()` for idempotent bulk insert

### C-3 TimetableQueryService (Cross-Module Read)

Path: `app/Infrastructure/Persistence/TenantAdminDashboard/Timetable/TimetableQueryService.php`

Implements `TimetableQueryServiceInterface` (defined in Domain).

Provides the public-facing read API for downstream modules (Attendance, Dashboard, Live Classes). Returns DTOs, not entities. Never mutates data.

---

## Phase D — Application Layer

### D-1 Commands

Path: `app/Application/TenantAdminDashboard/Timetable/Commands/`

All commands: `declare(strict_types=1)`, `final class`, `public readonly` properties, `$tenantId` first, `$actorId` last.

| Command | Key Fields |
|---|---|
| `CreateScheduleTemplateCommand` | tenantId, batchId, branchId?, title, status, effectiveFrom, effectiveUntil, lookAheadWeeks?, notes?, actorId |
| `UpdateScheduleTemplateCommand` | tenantId, templateId, title, effectiveFrom, effectiveUntil, notes?, actorId |
| `PublishScheduleTemplateCommand` | tenantId, templateId, actorId |
| `ArchiveScheduleTemplateCommand` | tenantId, templateId, actorId |
| `DeleteScheduleTemplateCommand` | tenantId, templateId, actorId |
| `AddTemplateSlotCommand` | tenantId, templateId, dayOfWeek, startTime, endTime, subjectId?, teacherId?, venueId?, sessionType, titleOverride?, sortOrder?, actorId |
| `UpdateTemplateSlotCommand` | tenantId, slotId, templateId, dayOfWeek, startTime, endTime, subjectId?, teacherId?, venueId?, sessionType, titleOverride?, sortOrder?, actorId |
| `DeleteTemplateSlotCommand` | tenantId, slotId, templateId, actorId |
| `CreateAdHocSessionCommand` | tenantId, title, sessionDate, startTime, endTime, sessionType, batchId?, branchId?, subjectId?, teacherId?, venueId?, notes?, actorId |
| `CancelSessionCommand` | tenantId, sessionId, cancellationReason, cancellationNotes?, actorId |
| `RescheduleSessionCommand` | tenantId, sessionId, newDate, newStartTime, newEndTime, newTeacherId?, newVenueId?, actorId |
| `SubstituteTeacherCommand` | tenantId, sessionId, newTeacherId, actorId |
| `UpdateSessionStatusCommand` | tenantId, sessionId, newStatus, actorId |
| `CreateVenueCommand` | tenantId, branchId?, name, type, capacity?, notes?, actorId |
| `UpdateVenueCommand` | tenantId, venueId, name, type, capacity?, notes?, actorId |
| `DeleteVenueCommand` | tenantId, venueId, actorId |
| `CreateHolidayCommand` | tenantId, branchId?, holidayDate, name, type, isRecurring?, actorId |
| `UpdateHolidayCommand` | tenantId, holidayId, holidayDate, name, type, isRecurring?, actorId |
| `DeleteHolidayCommand` | tenantId, holidayId, actorId |
| `UpdateTimetableSettingsCommand` | tenantId, conflictMode, defaultLookAheadWeeks, weekStartsOn, workingDays, defaultSessionType, timezone, actorId |
| `GenerateTenantInstancesCommand` | tenantId, upToDate |

---

### D-2 UseCases

Path: `app/Application/TenantAdminDashboard/Timetable/UseCases/`

One class per operation. Follows the standard orchestration: validate → entity → DB::transaction → persist → audit → collect events → dispatch events after commit.

**Key orchestration notes per UseCase:**

**`PublishScheduleTemplateUseCase`**
1. Load template (tenant-scoped 404 if missing)
2. Count slots → if 0 throw `EmptyTemplatePublishException`
3. Check for overlapping published template via repo → throw `OverlappingTemplateValidityException` if conflict
4. Call `entity->publish($actorId)` → entity transitions status
5. In transaction: save template, audit `schedule_template.published`
6. After commit: dispatch `ScheduleTemplatePublished`
7. Dispatch `GenerateTenantInstancesJob` for this template's tenant

**`AddTemplateSlotUseCase`**
1. Load template; verify status is DRAFT or PUBLISHED
2. Run `ConflictDetectionService::checkTeacherConflict()` for the slot's day-of-week + time across template's validity period
3. Run venue conflict check if venueId is set
4. Create entity, persist, audit `template_slot.added`
5. Dispatch events

**`GenerateSessionInstancesUseCase`**
1. Load settings for tenant
2. Load all published templates within look-ahead window
3. Load holidays for the period
4. For each template → each slot → each applicable date:
   - Skip if holiday
   - Skip if not a working day
   - Skip if outside template validity
   - Check idempotency (slot+date already exists)
   - Build `SessionInstanceEntity::create()` (no events recorded during batch generation)
5. Batch-save via `saveBatch()` using upsert
6. Dispatch `SessionInstanceGenerated` event per template

**`RescheduleSessionUseCase`**
1. Load original session → guard terminal status
2. Conflict check new date/time/teacher/venue
3. Create new `SessionInstanceEntity` (status=SCHEDULED, rescheduledFromId=originalId)
4. In transaction:
   - Save new session
   - Call `original->markRescheduled(newId, actorId)` → save original
   - Audit `session_instance.rescheduled`
5. After commit: dispatch `SessionRescheduled`

**`FlagHolidayConflictsUseCase`** (triggered by HolidayCreated listener)
1. Calls `SessionInstanceRepository::flagHolidayConflicts(tenantId, date, branchId)`
2. Audit `holiday_conflict.flagged` with count

---

### D-3 Queries

Path: `app/Application/TenantAdminDashboard/Timetable/Queries/`

| Query Class | Returns | Purpose |
|---|---|---|
| `ListScheduleTemplatesQuery` | array of TemplateDTO | Template list with filters |
| `GetScheduleTemplateQuery` | TemplateWithSlotsDTO | Template detail + slots |
| `ListSessionInstancesQuery` | array of SessionInstanceDTO | Calendar data — date range, filters |
| `GetSessionInstanceQuery` | SessionInstanceDTO | Session detail |
| `ListVenuesQuery` | array of VenueDTO | Venue list |
| `ListHolidaysQuery` | array of HolidayDTO | Holiday list |
| `GetTimetableSettingsQuery` | TimetableSettingsDTO | Settings read |
| `GetMyScheduleQuery` | array of SessionInstanceDTO | Student/teacher self-schedule |
| `GetTeacherWorkloadQuery` | TeacherWorkloadDTO | Teacher workload summary |

---

### D-4 Event Listeners

Path: `app/Application/TenantAdminDashboard/Timetable/Listeners/`

| Listener | Listens To | Action |
|---|---|---|
| `TriggerInstanceGenerationListener` | `ScheduleTemplatePublished` | Dispatches `GenerateTenantInstancesJob` |
| `FlagHolidayConflictsListener` | `HolidayCreated` | Calls `FlagHolidayConflictsUseCase` |

---

## Phase E — HTTP Layer

### E-1 Controllers

Path: `app/Http/Controllers/Api/TenantAdminDashboard/Timetable/`

| Controller | Methods |
|---|---|
| `ScheduleTemplateReadController` | `index()`, `show()` |
| `ScheduleTemplateWriteController` | `store()`, `update()`, `publish()`, `archive()`, `destroy()` |
| `TemplateSlotWriteController` | `store()`, `update()`, `destroy()` |
| `SessionInstanceReadController` | `index()`, `show()`, `mySchedule()`, `childSchedule()` |
| `SessionInstanceWriteController` | `store()` (ad-hoc), `cancel()`, `reschedule()`, `substitute()`, `updateStatus()` |
| `VenueReadController` | `index()` |
| `VenueWriteController` | `store()`, `update()`, `destroy()` |
| `HolidayReadController` | `index()` |
| `HolidayWriteController` | `store()`, `update()`, `destroy()` |
| `TimetableSettingsController` | `show()`, `update()` |

Each method: under 20 lines. Pattern: accept FormRequest → build Command → call UseCase → return Resource.

### E-2 Form Requests

Path: `app/Http/Requests/TenantAdminDashboard/Timetable/`

One FormRequest per write endpoint. Validates syntax only (types, lengths, formats). No business rules.

Key requests: `CreateScheduleTemplateRequest`, `PublishScheduleTemplateRequest` (no body — no request class needed), `AddTemplateSlotRequest`, `UpdateTemplateSlotRequest`, `CreateAdHocSessionRequest`, `CancelSessionRequest`, `RescheduleSessionRequest`, `SubstituteTeacherRequest`, `UpdateSessionStatusRequest`, `CreateVenueRequest`, `UpdateVenueRequest`, `CreateHolidayRequest`, `UpdateHolidayRequest`, `UpdateTimetableSettingsRequest`.

**`CancelSessionRequest` rules:**
```php
'cancellation_reason' => ['required', 'string', Rule::in([...reasons])],
'cancellation_notes'  => ['required_if:cancellation_reason,other', 'nullable', 'string', 'max:500'],
```

**`AddTemplateSlotRequest` rules:**
```php
'day_of_week'    => ['required', 'integer', 'min:0', 'max:6'],
'start_time'     => ['required', 'date_format:H:i'],
'end_time'       => ['required', 'date_format:H:i', 'after:start_time'],
'session_type'   => ['required', 'string', Rule::in([...types])],
'teacher_id'     => ['sometimes', 'integer'],
'venue_id'       => ['sometimes', 'integer', 'nullable'],
```

### E-3 API Resources

Path: `app/Http/Resources/TenantAdminDashboard/Timetable/`

| Resource | Data Exposed |
|---|---|
| `ScheduleTemplateResource` | id, batchId, title, status, effectiveFrom, effectiveUntil, lookAheadWeeks, publishedAt, slots (when loaded) |
| `TemplateSlotResource` | id, dayOfWeek, dayLabel, startTime, endTime, subject, teacher, venue, sessionType |
| `SessionInstanceResource` | id, title, sessionDate, startTime, endTime, status, sessionType, batch, teacher, venue, subject, cancellationReason, rescheduledTo/From links, holidayConflict |
| `VenueResource` | id, name, type, capacity, isActive, branchId |
| `HolidayResource` | id, holidayDate, name, type, isRecurring, branchId |
| `TimetableSettingsResource` | all settings fields |

---

## Phase F — Console Commands & Queue Jobs

### F-1 `timetable:generate-instances`

Path: `app/Console/Commands/Timetable/GenerateSessionInstancesCommand.php`

Schedule: Daily at `01:00 AM` in Kernel.  
Action: Fetches all tenant IDs with active subscriptions. Dispatches `GenerateTenantInstancesJob` per tenant.

### F-2 `timetable:update-session-statuses`

Path: `app/Console/Commands/Timetable/UpdateSessionStatusesCommand.php`

Schedule: Every 5 minutes (`everyFiveMinutes()`).  
Action: For each tenant, queries sessions where status=`scheduled` and `session_date = today AND start_time <= now()`. Transitions to `in_progress`. Then transitions `in_progress` sessions where `end_time <= now()` to `completed`. Dispatches `SessionStatusChanged` events.

### F-3 `GenerateTenantInstancesJob`

Path: `app/Infrastructure/Queue/Timetable/GenerateTenantInstancesJob.php`

- `implements ShouldQueue`
- Constructor receives `int $tenantId` + optional `DateTimeImmutable $upToDate` 
- Sets tenant context explicitly at start of `handle()`
- Calls `GenerateSessionInstancesUseCase::execute()`
- Failed jobs logged to `failed_jobs` table

---

## Phase G — Service Provider & Routes

### G-1 `TimetableServiceProvider`

Path: `app/Providers/TimetableServiceProvider.php`  
Register in `config/app.php` providers array.

Binds all repository interfaces to their Eloquent implementations:
```php
$this->app->bind(ScheduleTemplateRepositoryInterface::class, EloquentScheduleTemplateRepository::class);
// ... all other bindings
$this->app->bind(TimetableQueryServiceInterface::class, TimetableQueryService::class);
```

Registers event listeners:
```php
Event::listen(ScheduleTemplatePublished::class, TriggerInstanceGenerationListener::class);
Event::listen(HolidayCreated::class, FlagHolidayConflictsListener::class);
```

### G-2 Routes

File: `routes/api-tenant-timetable.php` — included from `routes/api.php`

```php
// All under prefix: api/tenant/timetable, middleware: auth:tenant, capability checks via middleware

// Templates
Route::get('/templates', [...]);
Route::post('/templates', [...]);
Route::get('/templates/{id}', [...]);
Route::put('/templates/{id}', [...]);
Route::post('/templates/{id}/publish', [...]);
Route::post('/templates/{id}/archive', [...]);
Route::delete('/templates/{id}', [...]);

// Template Slots
Route::post('/templates/{id}/slots', [...]);
Route::put('/templates/{id}/slots/{slotId}', [...]);
Route::delete('/templates/{id}/slots/{slotId}', [...]);

// Session Instances
Route::get('/sessions', [...]);
Route::post('/sessions', [...]);
Route::get('/sessions/{id}', [...]);
Route::post('/sessions/{id}/cancel', [...]);
Route::post('/sessions/{id}/reschedule', [...]);
Route::patch('/sessions/{id}/substitute', [...]);
Route::patch('/sessions/{id}/status', [...]);

// Venues
Route::apiResource('/venues', VenueWriteController::class)->except(['index', 'show']);
Route::get('/venues', [VenueReadController::class, 'index']);

// Holidays
Route::apiResource('/holidays', HolidayWriteController::class)->except(['index', 'show']);
Route::get('/holidays', [HolidayReadController::class, 'index']);

// Settings
Route::get('/settings', [TimetableSettingsController::class, 'show']);
Route::put('/settings', [TimetableSettingsController::class, 'update']);

// Self-service
Route::get('/my/schedule', [SessionInstanceReadController::class, 'mySchedule']);
Route::get('/my/children/{childId}/schedule', [SessionInstanceReadController::class, 'childSchedule']);
```

---

## Phase H — Capabilities Seeder

Path: `database/seeders/TimetableCapabilitiesSeeder.php`

Seeds all 12 capabilities from Section 8 of the feature document:

```
CAP_TIMETABLE_MANAGE, CAP_TIMETABLE_VIEW_ALL, CAP_TIMETABLE_VIEW_OWN,
CAP_TIMETABLE_VIEW_SELF, CAP_SESSION_MANAGE, CAP_SESSION_CREATE_ADHOC,
CAP_SESSION_STATUS_UPDATE, CAP_TIMETABLE_OVERRIDE, CAP_VENUE_MANAGE,
CAP_HOLIDAY_MANAGE, CAP_TIMETABLE_SETTINGS, CAP_TIMETABLE_EXPORT
```

Add to `DatabaseSeeder::run()`.

---

## Phase I — Tests

### I-1 Feature Tests

Path: `tests/Feature/TenantAdminDashboard/Timetable/`

| Test Class | Coverage |
|---|---|
| `ScheduleTemplateCrudTest` | Create, update, list, show, soft-delete draft template |
| `PublishScheduleTemplateTest` | Publish success, publish empty template (422), overlapping published (409), tenant isolation |
| `TemplateSlotCrudTest` | Add slot, update slot, delete slot, duplicate time-slot (409) |
| `ConflictDetectionTest` | Teacher conflict hard_block (409), warn_and_allow (201 + warning), venue conflict, cancelled session no conflict |
| `SessionInstanceCrudTest` | Ad-hoc session creation, list with filters, detail view |
| `CancelSessionTest` | Cancel with reason, cancel without notes when reason=other (422), cancel completed session (422) |
| `RescheduleSessionTest` | Reschedule success, original marked rescheduled, new session created, conflict on new slot |
| `SubstituteTeacherTest` | Substitute success, conflict check for substitute, audit logged |
| `SessionStatusUpdateTest` | Scheduled→in_progress, in_progress→completed, invalid transitions (422) |
| `HolidayCrudTest` | Create, update, delete, duplicate date (409) |
| `HolidayConflictFlaggingTest` | Adds holiday, generated instances on that date get flagged |
| `VenueCrudTest` | Create, update, deactivate, delete blocked if future sessions |
| `TimetableSettingsTest` | Read, update, conflict mode change |
| `TenantIsolationTest` | Tenant A cannot read/modify Tenant B's templates, sessions, venues, holidays |
| `SelfScheduleTest` | Student only sees enrolled batch sessions, teacher only sees own sessions |

### I-2 Unit Tests

Path: `tests/Unit/Domain/Timetable/`

| Test Class | Coverage |
|---|---|
| `SessionStatusValueObjectTest` | All valid transitions, all invalid transitions, terminal state detection |
| `TemplateStatusValueObjectTest` | Valid transitions, archived is terminal |
| `CancellationReasonValueObjectTest` | requiresFreeText() for `other`, not for others |
| `SessionInstanceEntityTest` | cancel(), markRescheduled(), substituteTeacher(), flagHolidayConflict() |
| `ScheduleTemplateEntityTest` | publish(), archive(), isActiveOn() |
| `ConflictDetectionServiceTest` | hard_block throws, warn_and_allow returns event |

### I-3 Instance Generation Test

Path: `tests/Feature/TenantAdminDashboard/Timetable/InstanceGenerationTest.php`

| Scenario | Expected |
|---|---|
| Publish template → instances generated for look-ahead period | Count matches slots × working days in window |
| Holiday date skipped | No instance for holiday date |
| Non-working day skipped | No instance for day not in working_days |
| Idempotency — run twice | Same count, no duplicates |
| Template validity boundary | No instances before effectiveFrom, none after effectiveUntil |
| Past effectiveFrom — publishes today | Instances from today, not from past date |

---

## Audit Action Codes for This Module

| Action | Code |
|---|---|
| Template created | `schedule_template.created` |
| Template updated | `schedule_template.updated` |
| Template published | `schedule_template.published` |
| Template archived | `schedule_template.archived` |
| Template deleted | `schedule_template.deleted` |
| Slot added | `template_slot.added` |
| Slot updated | `template_slot.updated` |
| Slot deleted | `template_slot.deleted` |
| Ad-hoc session created | `session_instance.created` |
| Session cancelled | `session_instance.cancelled` |
| Session rescheduled | `session_instance.rescheduled` |
| Teacher substituted | `session_instance.teacher_substituted` |
| Session status updated | `session_instance.status_updated` |
| Venue created | `venue.created` |
| Venue updated | `venue.updated` |
| Venue deleted | `venue.deleted` |
| Holiday created | `holiday.created` |
| Holiday updated | `holiday.updated` |
| Holiday deleted | `holiday.deleted` |
| Timetable settings updated | `timetable_settings.updated` |

---

## Answers to Feature Document Open Questions

| # | Question | Decision |
|---|---|---|
| 1 | Bounded context placement | `TenantAdminDashboard/Timetable/` — consistent with existing modules |
| 2 | Single command vs per-tenant jobs | Single command dispatches per-tenant queue jobs for failure isolation |
| 3 | `locked_at` computed column | Attendance module computes independently — avoid cross-module DB coupling |
| 4 | Sync Future Instances capability | Requires `CAP_TIMETABLE_OVERRIDE` — destructive action, owner-only |
| 5 | Auto vs manual status transition | Both: auto by command + manual teacher trigger. Auto transition fires event for Attendance |
| 6 | Self-paced batch exclusion | Validate in `PublishScheduleTemplateUseCase` — if batch type is `self_paced`, throw `SelfPacedBatchTimetableException` |
| 7 | Cross-branch buffer time | Out of scope for Phase 1. Flag it as Phase 2 enhancement. No implementation now. |

---

## Pre-Implementation Checklist

Before writing the first file:

- [ ] Confirm tenant DB migration connection is `tenant` (not `central`)
- [ ] Verify `BelongsToTenant` global scope trait is compatible with all Record models
- [ ] Confirm `TenantAuditLogger` service is injectable — check existing service provider binding
- [ ] Verify batch and subject foreign key targets exist in tenant DB
- [ ] Confirm capability check middleware signature matches existing pattern (Attendance module)
- [ ] Decide on module entitlement check middleware placement for `module.timetable`

---

## Pre-Commit Checklist (Timetable-Specific)

```
□ grep 'use Illuminate' app/Domain/TenantAdminDashboard/Timetable/ → 0 results
□ Every UseCase has: tenantId, DB::transaction(), audit log, events after commit
□ Every Repository method: explicit tenant_id WHERE clause
□ Session status transitions validated by SessionStatus::canTransitionTo()
□ Conflict detection called before ANY session or slot creation/update
□ No MySQL ENUMs in any migration (use VARCHAR(30) for status, session_type, etc.)
□ Idempotency unique index on (tenant_id, template_slot_id, session_date)
□ Tenant isolation test class present and passing
□ GenerateTenantInstancesJob sets tenant context before executing
□ Events dispatched AFTER DB::transaction() commit — never inside
```

---

## Document History

| Version | Date | Author | Changes |
|---|---|---|---|
| 1.0 | March 16, 2026 | Principal Engineer | Initial implementation plan |
