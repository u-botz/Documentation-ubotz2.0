# UBOTZ 2.0 — Batch Management Implementation Plan

| Field | Value |
|-------|--------|
| **Reference** | `Ubotz_2_batch_management_developer_instructions.md` |
| **Architecture** | `backend/documentation/Ubotz 2 developer instruction manual .md` |
| **Last updated** | March 18, 2026 |

---

## 0. Scope & product decisions

### In scope (Phase 1 — Fixed cohort)

- `batches` + `batch_courses` + `batch_students` + `batch_faculty`
- Batch CRUD, course link/unlink, students (add/remove/bulk/transfer), faculty assign/unassign
- FK wiring from Timetable + Attendance to `batches`
- Capabilities, audit patterns, tenant isolation, tests per spec §13

### Product alignment (vs original doc)

| Doc wording | Implementation |
|-------------|----------------|
| “Department” / `departments` | **`category_id` → `categories`** (existing tenant table; do not rename `categories` to `departments`) |
| Hierarchy | **Category → Batch → Courses** (via pivot) |

### Explicitly out of scope (per doc §1 / §15)

Evergreen/hybrid types, auto-enrollment on batch join, Communication Hub batch targeting, panel UIs, cloning, waitlist, batch fees, progress copy on transfer (Phase 2).

---

## 1. Prerequisites (gates)

| # | Gate | Owner |
|---|------|--------|
| G1 | Tenant DB: `categories`, `courses`, `users`, `branches` (if used elsewhere) stable | Done |
| G2 | Courses have publish/status model for **BR-25** (only published linkable) | Verify |
| G3 | Role checks: resolve how **student** / **teacher** roles are stored (`user_role_assignments` or equivalent) | Verify before student/faculty use cases |
| G4 | **Production / staging**: inventory orphan `batch_id` on `schedule_templates`, `session_instances`, `attendance_sessions` before FK migrations | Ops + dev |

---

## 2. Phased delivery

### Phase A — Core batch (mostly done; harden)

**Goal:** Single aggregate CRUD, list/detail, archive, tenant-safe.

| Task | Detail |
|------|--------|
| A.1 | Migration `batches`: `tenant_id`, `category_id` FK → `categories`, unique `(tenant_id, code)`, indexes per spec §5.1 (adjusted for `category_id`) |
| A.2 | Domain: `BatchEntity`, VOs, repo interface, exceptions/events for create/status |
| A.3 | Use cases: Create, Update, ChangeStatus, Archive; **no `DB::` in Application** — use shared transaction port if enforced |
| A.4 | Audit: **after commit** for mutations (spec §10 + manual §17) |
| A.5 | `BatchCreated` / `BatchStatusChanged`: correct IDs, dispatch after commit |
| A.6 | HTTP: FormRequests, resources, read/write controllers, routes under tenant API |
| A.7 | **Capabilities**: seed `batch.view`, `batch.create`, `batch.update`, `batch.delete`, `batch.manage_students`, `batch.manage_faculty` in `TenantCapabilitySeeder`; map in `TenantRoleCapabilitySeeder` (Owner/Admin full; Teacher `batch.view` only per §7) |
| A.8 | List/detail: until B/C exist, return **0** for counts or remove subqueries to non-existent tables; switch to real aggregates when pivots exist |
| A.9 | Feature tests: CRUD, 404 cross-tenant, duplicate code, invalid status transition, capability middleware |

**Exit criteria:** Migrations run clean; batch APIs usable; capabilities assigned; core tests green.

---

### Phase B — Batch ↔ courses & faculty

**Goal:** Many-to-many batch–course; faculty at (batch, course, teacher).

| Task | Detail |
|------|--------|
| B.1 | Migration `batch_courses`: tenant_id, batch_id, course_id, linked_by, unique `(batch_id, course_id)` |
| B.2 | Migration `batch_faculty`: tenant_id, batch_id, user_id, course_id, assigned_by, unique `(batch_id, user_id, course_id)` |
| B.3 | Domain events: `BatchCourseLinked`, `BatchCourseUnlinked`, `BatchFacultyAssigned`, `BatchFacultyUnassigned` (+ exceptions as needed) |
| B.4 | Use cases: LinkCourse (batch draft/active; course **published** — BR-25); UnlinkCourse (BR-26, BR-27); AssignFaculty (teacher role, course linked — BR-19–BR-21); UnassignFaculty |
| B.5 | HTTP: §6.2, §6.4 endpoints + capabilities |
| B.6 | Audit actions: `batch.course_linked`, etc. |
| B.7 | Tests: link draft course rejected; unlink with dependents rejected; duplicate faculty rejected; tenant isolation |

**Exit criteria:** All B APIs + rules covered by tests.

---

### Phase C — Students & transfer

**Goal:** Membership with capacity, soft remove, bulk add, transfer.

| Task | Detail |
|------|--------|
| C.1 | Migration `batch_students`: tenant_id, batch_id, user_id, added_by, removed_at/removed_by/removal_reason (BR-13) |
| C.2 | Use cases: AddStudent (batch **active**, student role, capacity, no duplicate active row — BR-09–BR-12); BulkAdd (atomic all-or-nothing); RemoveStudent (soft remove); Transfer (BR-15–BR-17: shared course, capacity, single transaction) |
| C.3 | Domain events + `BatchCapacityExceededException` where applicable |
| C.4 | HTTP: §6.3 |
| C.5 | Audit: student added/removed/transferred |
| C.6 | Tests: capacity edge cases, concurrent last-seat (§13), transfer rollback, cross-tenant |

**Exit criteria:** Student + transfer flows production-ready.

---

### Phase D — Downstream FKs & integration

**Goal:** Phantom `batch_id` becomes real FKs; attendance validation works.

| Task | Detail |
|------|--------|
| D.1 | Data fix: resolve orphan `batch_id` on timetable/attendance (placeholder batches or cleanup) |
| D.2 | Migration: `schedule_templates.batch_id` → FK `batches(id)` ON DELETE RESTRICT |
| D.3 | Migration: `session_instances.batch_id` → FK (nullable OK) |
| D.4 | Migration: `attendance_sessions.batch_id` → FK |
| D.5 | Timetable: enforce **active** batch for **new** templates where spec requires (BR-03/BR-28) — extend Timetable use case or Batch port |
| D.6 | Integration tests: invalid batch_id rejected; delete batch with templates blocked |

**Exit criteria:** FK migrations applied in staging; integration tests pass.

---

## 3. Cross-cutting (all phases)

| Topic | Action |
|-------|--------|
| **Tenant isolation** | Every query/command scoped by `tenant_id`; 404 for cross-tenant (§11) |
| **403 vs 404** | No leakage on missing resources |
| **Idempotency** | Where doc requires (payments N/A here); duplicate-safe where useful |
| **Documentation** | Update `Ubotz_2_batch_management_developer_instructions.md` appendix: Department → Category/`category_id` |

---

## 4. Suggested schedule (indicative)

| Sprint / week | Focus |
|----------------|--------|
| 1 | Close Phase A (capabilities, audit/transaction polish, list counts, tests) |
| 2 | Phase B (migrations + APIs + tests) — **migrations + course/faculty APIs done**; add feature tests |
| 3 | Phase C (migrations + APIs + transfer + tests) |
| 4 | Phase D (data audit, FK migrations, timetable hooks, integration tests) |

Adjust based on team size and dependency on Course/RBAC clarity.

---

## 5. Definition of done (Phase 1 batch)

- [ ] All tables in §5.1 (with `category_id` on `batches`) migrated  
- [ ] All APIs in §6.1–§6.4 implemented and capability-gated  
- [ ] §7 capabilities seeded and role-mapped  
- [ ] BR-01–BR-08, BR-09–BR-18, BR-19–BR-27 enforced in use cases where applicable  
- [ ] §10 audit events for listed mutations  
- [ ] §13 test categories addressed at minimum: domain VOs/entity, feature API, cross-tenant, FK (post D), transfer atomicity, capacity race  

---

*End of plan.*
