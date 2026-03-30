# UBOTZ 2.0 - Phase 17A Implementation Plan

## 1) Objective

Implement Phase 17A as a correction release (not a feature release) to:

1. Remove undefined `CourseStatus` states (`PENDING`, `INACTIVE`).
2. Deprecate and migrate legacy `ACTIVE` to `PUBLISHED`.
3. Move `CreateCourseUseCase` audit logging outside the DB transaction to prevent phantom audit records on rollback.

This plan is aligned to:
- `documentation/implementation plan/Ubotz_2_phase_17a_developer_instructions.md`
- `documentation/Guides/Ubotz 2 developer instruction manual .md`

---

## 2) Scope Boundaries

### In Scope
- Course domain status cleanup and transition guard updates.
- One-time data migration for legacy statuses.
- `CreateCourseUseCase` transaction/audit sequence correction.
- New and updated tests for status rules, migration, and audit behavior.

### Out of Scope
- Frontend/UI status label changes.
- New course business features.
- Route/controller behavior expansion.
- Any changes to non-course bounded contexts.

---

## 3) Architecture Constraints To Enforce

1. **Layer boundaries**
   - Domain: pure PHP only.
   - Application: orchestration only.
   - Infrastructure: persistence implementation details.
2. **Tenant safety**
   - Every tenant-scoped query and repository method must remain explicitly tenant-scoped.
3. **Auditability**
   - Every mutation remains auditable with actor, tenant, entity, and context.
4. **No forbidden patterns**
   - No `use Illuminate\...` in Domain.
   - No `DB::table()` in Application layer.
   - No business logic in controllers.

---

## 4) Standards Conflict and Resolution

There is a conflict between documents:

- Developer manual section on UseCase template says audit log should be inside transaction.
- Phase 17A instruction explicitly requires moving `CreateCourseUseCase` audit log outside transaction to prevent phantom records.

### Resolution for this phase

Phase 17A instruction is treated as a targeted correction directive for this specific use case and takes precedence here.

Implementation rule for this phase:
1. Persist and commit transaction first.
2. Write audit log after successful commit.
3. Dispatch events after audit log.

This applies to `CreateCourseUseCase` only in this phase.

---

## 5) Work Breakdown Structure

## A. Baseline and Impact Scan

1. Locate all references to course statuses (`active`, `inactive`, `pending`, `published`, `draft`, `archived`).
2. Locate all direct `'active'` string comparisons.
3. Confirm all status transitions currently enforced in domain entity/value object.
4. Identify tests relying on undefined states.

Deliverable:
- Impact map of files requiring modification.

## B. Domain Layer Changes

### B1. Update `CourseStatus` value object
Target file:
- `app/Domain/TenantAdminDashboard/Course/ValueObjects/CourseStatus.php`

Tasks:
1. Keep canonical states: `DRAFT`, `PUBLISHED`, `ARCHIVED`.
2. Keep `ACTIVE` temporarily with `@deprecated` annotation.
3. Remove operational use of `PENDING` and `INACTIVE` from normal transitions.
4. Update `canTransitionTo()` to only allow:
   - `DRAFT -> PUBLISHED|ARCHIVED`
   - `PUBLISHED -> ARCHIVED`
   - `ACTIVE -> PUBLISHED|ARCHIVED` (legacy compatibility only)
   - `ARCHIVED -> (none)`
5. Add `isPubliclyVisible()` helper that returns true for `PUBLISHED` and legacy `ACTIVE`.
6. Add migration helper (`migrationTargetFor`) for legacy mapping paths.

### B2. Update `CourseEntity` publish gate usage
Target file:
- `app/Domain/TenantAdminDashboard/Course/Entities/CourseEntity.php`

Tasks:
1. Ensure `changeStatus()` checks transition via updated `canTransitionTo()`.
2. Ensure publish readiness gate executes when target status is publicly visible via `isPubliclyVisible()`.
3. Preserve domain event behavior.

Deliverable:
- Domain status model is explicit, minimal, and migration-aware.

## C. Application Layer Changes

### C1. Fix `CreateCourseUseCase` transaction/audit order
Target file:
- `app/Application/TenantAdminDashboard/Course/UseCases/CreateCourseUseCase.php`

Tasks:
1. Remove audit log call from transaction closure.
2. Return required data from transaction closure.
3. Write audit log after commit succeeds.
4. Dispatch captured domain events after audit log write.
5. Ensure no mutable closure hacks; pass explicit values.

### C2. Add migration orchestration service
Target file:
- `app/Application/TenantAdminDashboard/Course/Services/CourseStatusMigrationService.php`

Tasks:
1. Implement one-time legacy status migration orchestration.
2. Migrate:
   - `ACTIVE -> PUBLISHED`
   - `PENDING -> DRAFT`
   - `INACTIVE -> PUBLISHED` if active enrollments exist, else `ARCHIVED`
3. Emit audit entries for migrated records with action `course.status_migrated`.
4. Return structured result counts by source and target statuses.
5. Ensure service is not exposed by HTTP endpoint.

Deliverable:
- Application orchestration supports safe migration and auditable status correction.

## D. Infrastructure / Database Migration

Target file:
- `database/migrations/2026_03_XX_000001_migrate_course_legacy_statuses.php`

Tasks:
1. Pre-count legacy statuses and log counts.
2. Execute status updates in transaction.
3. Apply enrollment-based branch for `inactive`.
4. Keep migration idempotent.
5. Implement non-reversible `down()` with explicit exception message.

Notes:
- No schema enum changes are introduced here; data correction only.
- Migration should be safe for repeat execution.

Deliverable:
- Legacy status data is normalized with safety logging and deterministic behavior.

## E. Test Implementation

### E1. Unit tests
- `tests/Unit/Domain/TenantAdminDashboard/Course/ValueObjects/CourseStatusTest.php`
- `tests/Unit/Domain/TenantAdminDashboard/Course/Entities/CourseEntityStatusTest.php`

### E2. Feature tests
- `tests/Feature/TenantAdminDashboard/Course/CreateCourseAuditLogTest.php`
- `tests/Feature/TenantAdminDashboard/Course/CourseStatusMigrationTest.php`

Minimum assertions:
1. Valid/invalid transition coverage.
2. `isPubliclyVisible()` behavior.
3. Deprecated `ACTIVE` compatibility.
4. Audit is written only after successful commit.
5. No audit on rollback.
6. Migration branch correctness and idempotency.

Deliverable:
- Regression-safe test suite that captures correction intent.

---

## 6) Execution Sequence

1. Baseline scan + impact list.
2. Implement Domain changes (`CourseStatus`, `CourseEntity`).
3. Implement `CreateCourseUseCase` audit sequence fix.
4. Add migration service.
5. Add DB migration.
6. Add/update tests.
7. Run targeted test suite.
8. Run course-wide regression tests.
9. Run static analysis and rule checks.
10. Final review against quality gate checklist.

---

## 7) Verification Checklist (Quality Gate)

1. `CourseStatus` has exactly `DRAFT`, `PUBLISHED`, `ACTIVE` (deprecated), `ARCHIVED`.
2. No runtime transitions depend on `PENDING` or `INACTIVE`.
3. Zero records remain in `courses` with `status in ('active','inactive','pending')` after migration.
4. `CreateCourseUseCase` audit write is outside `DB::transaction()`.
5. Rollback scenario does not create phantom audit records.
6. No direct `'active'` string checks outside migration contexts.
7. All new tests pass.
8. Existing course tests pass.
9. No layer boundary violations introduced.
10. No tenant-scope regression in repository access paths.

---

## 8) Validation Commands (PowerShell + Docker-Aware)

```powershell
docker exec -it ubotz_backend php artisan test --filter=CourseStatusTest
docker exec -it ubotz_backend php artisan test --filter=CourseEntityStatusTest
docker exec -it ubotz_backend php artisan test --filter=CreateCourseAuditLogTest
docker exec -it ubotz_backend php artisan test --filter=CourseStatusMigrationTest
docker exec -it ubotz_backend php artisan test --filter=Course
docker exec -it ubotz_backend ./vendor/bin/phpstan analyse --level=5
```

Optional verification queries (run in DB client or tinker context):
- Count legacy statuses before and after migration.
- Confirm no cross-tenant records are touched during migration execution.

---

## 9) Risk Register and Mitigations

1. **Risk: Hidden dependencies on `active` string**
   - Mitigation: full codebase scan and targeted replacement to helper-based checks.

2. **Risk: Incorrect `inactive` migration for enrolled courses**
   - Mitigation: feature tests for with/without active enrollment branches.

3. **Risk: Audit sequence regression**
   - Mitigation: explicit rollback simulation test asserting no audit write.

4. **Risk: Layering violation while adding migration service**
   - Mitigation: keep database-heavy logic in Infrastructure/migration context; service orchestrates through interfaces.

---

## 10) Completion Criteria

Phase 17A is complete when:
1. All quality gate checks pass.
2. Migration runs successfully and leaves zero legacy statuses.
3. `CreateCourseUseCase` no longer produces phantom audits on rollback paths.
4. Tests and static analysis pass without architectural violations.

---

*Prepared for implementation audit under Phase 17A correction series.*
