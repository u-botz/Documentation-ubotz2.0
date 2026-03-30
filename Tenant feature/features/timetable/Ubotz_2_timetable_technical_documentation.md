# UBOTZ 2.0 — Timetable — Technical Specification

## Scope

Venues, holidays, **schedule templates**, **template slots**, and **session instances** (including ad-hoc sessions, cancel, reschedule, substitute). Registered in `TimetableServiceProvider` with prefix **`api/tenant/timetable`**. Routes: `backend/routes/api/tenant/timetable.php`.

## Capabilities

| Capability | Routes |
|------------|--------|
| `timetable.view` | GET venues, holidays, templates (+ slots, show), sessions index |
| `timetable.manage` | Mutations: venues/holidays CRUD; templates CRUD + publish/unpublish; template slots CRUD; ad-hoc session; cancel/reschedule/substitute |

Seeded in `TenantCapabilitySeeder` under group `timetable`. Product may also gate via **`module.erp.timetable`** entitlements (see seeder comment).

## HTTP map (base `/api/tenant/timetable`)

Paths align with `frontend/config/api-endpoints.ts` → **`TENANT_TIMETABLE`**.

**View:** `venues`, `holidays`, `templates`, `templates/{id}`, `templates/{templateId}/slots`, `sessions`.

**Manage:** POST/PUT/DELETE `venues`, `holidays`; template lifecycle; `templates/{templateId}/slots`; `sessions/ad-hoc`; `sessions/{id}/cancel|reschedule|substitute`.

## Middleware stack

Same as other tenant APIs: `tenant.resolve.token`, `auth:tenant_api`, `tenant.active`, `ensure.user.active`, `tenant.session`, `tenant.timezone`, `throttle:tenant_api` (`TimetableServiceProvider::registerRoutes`).

## Application use cases (examples)

`App\Application\TenantAdminDashboard\Timetable\UseCases\`: `CreateScheduleTemplateUseCase`, `UpdateScheduleTemplateUseCase`, `PublishScheduleTemplateUseCase`, `UnpublishScheduleTemplateUseCase`, `ArchiveScheduleTemplateUseCase`, slot CRUD, venue/holiday CRUD, `CreateAdHocSessionUseCase`, `GenerateSessionInstancesUseCase`, `CancelSessionInstanceUseCase`, `RescheduleSessionInstanceUseCase`, `AssignSubstituteTeacherUseCase`.

**Events:** `ScheduleTemplatePublished` → `TriggerInstanceGeneration` listener (see provider).

## Console

`GenerateSessionInstancesCommand`, `UpdateSessionStatusesCommand` (registered in `TimetableServiceProvider`).

## Persistence (tenant)

| Migration | Tables |
|-----------|--------|
| `2026_03_16_062851_create_timetable_settings_table.php` | **`timetable_settings`** — `conflict_mode`, `week_starts_on`, `working_days`, `timezone`, … |
| `2026_03_16_062900_create_venues_table.php` | **`venues`** |
| `2026_03_16_062922_create_schedule_templates_table.php` | **`schedule_templates`** |
| `2026_03_16_062932_create_template_slots_table.php` | **`template_slots`** |
| `2026_03_16_062938_create_session_instances_table.php` | **`session_instances`** |
| + later (e.g. `2026_03_18_120000_phase16a_timetable_session_reschedule_and_indexes.php`) | Reschedule / indexes |

Primary scheduling entities are **`schedule_templates`** / **`session_instances`**, not a generic `timetable_sessions` table name.

---

## Linked references

- **Batch** — templates link to batches (see `schedule_templates` migration)
- **Attendance** — `attendance_sessions` may reference timetable session ids where integrated
