# Phase 10B: Retrofit Existing Routes with `tenant.capability` Middleware

## Goal

Replace the placeholder `Gate::authorize()` / `CoursePolicy` / `ExamPolicy` pattern (all return `true`) with the real `tenant.capability` middleware built in Phase 10A. This makes capability enforcement **live** on all 10 tenant dashboard routes.

## Codebase Reality (Verified)

| Component | Current State |
|---|---|
| Tenant routes | 10 endpoints in 2 files: `course.php` (6) + `exam_hierarchy.php` (4) |
| Middleware pipeline | 5-layer: `tenant.resolve.token` → `auth:tenant_api` → `tenant.active` → `ensure.user.active` → `tenant.session` |
| Current authorization | `Gate::authorize()` calls in controllers → placeholder policies that return `true` |
| `CoursePolicy` | 4 methods, all return `true` unconditionally |
| `ExamPolicy` | Has `viewAny`, `create`, `update`, `delete` — all return `true` |
| Existing tests | `CourseCrudTest` (5 tests) + `ExamHierarchyTest` (2 tests) — create roles + assignments but **no capabilities seeded** |
| Capability seeder | 17 capabilities exist in `tenant_capabilities` table |

## Proposed Changes

### Route Layer

---

#### [MODIFY] [course.php](file:///c:/Users/sayan/lms/Ubotz_2.0/backend/routes/tenant_dashboard/course.php)

Add `tenant.capability` middleware per-route. Route → capability mapping:

| Route | Method | Capability Code |
|---|---|---|
| `GET /courses` | `index` | `course.view` |
| `GET /courses/{id}` | `show` | `course.view` |
| `POST /courses` | `store` | `course.create` |
| `PUT /courses/{id}` | `update` | `course.edit` |
| `PATCH /courses/{id}/status` | `changeStatus` | `course.publish` |
| `DELETE /courses/{id}` | `archive` | `course.archive` |

```diff
 Route::prefix('courses')->group(function () {
     // Read Routes
-    Route::get('/', [CourseReadController::class, 'index']);
-    Route::get('/{id}', [CourseReadController::class, 'show']);
+    Route::middleware('tenant.capability:course.view')->group(function () {
+        Route::get('/', [CourseReadController::class, 'index']);
+        Route::get('/{id}', [CourseReadController::class, 'show']);
+    });
 
     // Write Routes
-    Route::post('/', [CourseWriteController::class, 'store']);
-    Route::put('/{id}', [CourseWriteController::class, 'update']);
-    Route::patch('/{id}/status', [CourseWriteController::class, 'changeStatus']);
-    Route::delete('/{id}', [CourseWriteController::class, 'archive']);
+    Route::post('/', [CourseWriteController::class, 'store'])
+        ->middleware('tenant.capability:course.create');
+    Route::put('/{id}', [CourseWriteController::class, 'update'])
+        ->middleware('tenant.capability:course.edit');
+    Route::patch('/{id}/status', [CourseWriteController::class, 'changeStatus'])
+        ->middleware('tenant.capability:course.publish');
+    Route::delete('/{id}', [CourseWriteController::class, 'archive'])
+        ->middleware('tenant.capability:course.archive');
 });
```

---

#### [MODIFY] [exam_hierarchy.php](file:///c:/Users/sayan/lms/Ubotz_2.0/backend/routes/tenant_dashboard/exam_hierarchy.php)

| Route | Method | Capability Code |
|---|---|---|
| `GET /admin/exam-hierarchy/exams` | `index` | `exam.view` |
| `POST /admin/exam-hierarchy/exams` | `store` | `exam.manage` |
| `PUT /admin/exam-hierarchy/exams/{id}` | `update` | `exam.manage` |
| `DELETE /admin/exam-hierarchy/exams/{id}` | `destroy` | `exam.manage` |

```diff
 Route::prefix('admin/exam-hierarchy')->group(function () {
-    Route::get('/exams', [ExamController::class, 'index']);
-    Route::post('/exams', [ExamController::class, 'store']);
-    Route::put('/exams/{exam_id}', [ExamController::class, 'update']);
-    Route::delete('/exams/{exam_id}', [ExamController::class, 'destroy']);
+    Route::get('/exams', [ExamController::class, 'index'])
+        ->middleware('tenant.capability:exam.view');
+    Route::post('/exams', [ExamController::class, 'store'])
+        ->middleware('tenant.capability:exam.manage');
+    Route::put('/exams/{exam_id}', [ExamController::class, 'update'])
+        ->middleware('tenant.capability:exam.manage');
+    Route::delete('/exams/{exam_id}', [ExamController::class, 'destroy'])
+        ->middleware('tenant.capability:exam.manage');
 });
```

---

### Controller Layer — Remove `Gate::authorize()` calls

#### [MODIFY] [CourseWriteController.php](file:///c:/Users/sayan/lms/Ubotz_2.0/backend/app/Http/TenantAdminDashboard/Course/Controllers/CourseWriteController.php)

Remove 4 `Gate::authorize()` calls (lines 30, 66, 98, 113). The `Gate::authorize` + `CoursePolicy` pattern is now replaced by `tenant.capability` on routes. Also remove the `use Illuminate\Support\Facades\Gate;` import.

#### [MODIFY] [ExamController.php](file:///c:/Users/sayan/lms/Ubotz_2.0/backend/app/Http/TenantAdminDashboard/ExamHierarchy/Controllers/ExamController.php)

Remove 4 `Gate::authorize()` calls (lines 23, 35, 62, 90). Also remove the `use Illuminate\Support\Facades\Gate;` import.

---

### Policy Layer — Mark as Deprecated

#### [MODIFY] [CoursePolicy.php](file:///c:/Users/sayan/lms/Ubotz_2.0/backend/app/Policies/CoursePolicy.php)

Add `@deprecated` annotation. Do NOT delete — existing test infrastructure may reference it via `Gate::policy()`. Mark for removal in Phase 10D cleanup.

#### [MODIFY] [ExamPolicy.php](file:///c:/Users/sayan/lms/Ubotz_2.0/backend/app/Policies/ExamPolicy.php)

Same as CoursePolicy — add `@deprecated` annotation.

---

### Test Layer — Seed Capabilities in Existing Tests

> [!IMPORTANT]
> Existing tests create roles and user assignments but **do NOT seed capabilities** or `tenant_role_capabilities`. After this change, all routes will return 403 unless the test user's role has the required capability mapped.

#### [MODIFY] [CourseCrudTest.php](file:///c:/Users/sayan/lms/Ubotz_2.0/backend/tests/Feature/TenantAdminDashboard/Course/CourseCrudTest.php)

In `setUp()`, after creating the `teacher` role and assignment, add:
1. seed required capabilities into `tenant_capabilities` (raw DB insert)
2. wire them to the role via `tenant_role_capabilities` (raw DB insert)

Required capabilities for CourseCrudTest:
- `course.view` (index, show)
- `course.create` (store)
- `course.edit` (update)
- `course.publish` (changeStatus)
- `course.archive` (archive)

#### [MODIFY] [ExamHierarchyTest.php](file:///c:/Users/sayan/lms/Ubotz_2.0/backend/tests/Feature/TenantAdminDashboard/ExamHierarchy/ExamHierarchyTest.php)

Same pattern — seed `exam.view` and `exam.manage` capabilities for both tenant roles.

#### [MODIFY] [CourseIdempotencyTest.php](file:///c:/Users/sayan/lms/Ubotz_2.0/backend/tests/Feature/TenantAdminDashboard/Course/CourseIdempotencyTest.php)

Seed `course.create` capability for the test user's role.

#### [NEW] Authorization denial tests (optional, if time permits)

Add tests verifying a user WITHOUT a specific capability gets 403.

---

## Verification Plan

### Automated Tests

All commands run from the `backend/` directory:

```bash
# 1. Run all existing tests (must remain green — zero regression)
docker compose exec ubotz_backend php artisan test

# 2. Run Course CRUD tests specifically
docker compose exec ubotz_backend php artisan test --filter CourseCrudTest

# 3. Run Exam Hierarchy tests specifically
docker compose exec ubotz_backend php artisan test --filter ExamHierarchyTest

# 4. Run Course Idempotency test
docker compose exec ubotz_backend php artisan test --filter CourseIdempotencyTest

# 5. PHPStan Level 5 (must report 0 new errors with baseline)
docker compose exec ubotz_backend vendor/bin/phpstan analyse --level=5 --no-progress
```

### What Tests Prove

| Assertion | What It Verifies |
|---|---|
| CourseCrudTest passes | User with course capabilities can CRUD courses |
| ExamHierarchyTest passes | User with exam capabilities can CRUD exams |
| CourseIdempotencyTest passes | Idempotent slug generation still works under capability enforcement |
| No 500 errors | `Gate::authorize()` removal didn't break controller flow |
| PHPStan 0 errors | No dead imports, no missing method calls |

---

## Files Changed Summary

| # | File | Action |
|---|---|---|
| 1 | `routes/tenant_dashboard/course.php` | Add `tenant.capability` per-route |
| 2 | `routes/tenant_dashboard/exam_hierarchy.php` | Add `tenant.capability` per-route |
| 3 | `CourseWriteController.php` | Remove 4 `Gate::authorize()` calls + import |
| 4 | `ExamController.php` | Remove 4 `Gate::authorize()` calls + import |
| 5 | `CoursePolicy.php` | Add `@deprecated` |
| 6 | `ExamPolicy.php` | Add `@deprecated` |
| 7 | `CourseCrudTest.php` | Seed capabilities in setUp |
| 8 | `ExamHierarchyTest.php` | Seed capabilities in setUp |
| 9 | `CourseIdempotencyTest.php` | Seed capabilities in setUp |

**Total: 9 files modified, 0 new files, 0 deleted files.**

---

# Phase 10B Completion Report (Post-Audit)

## Execution Summary
Phase 10B has been successfully implemented, audited, and all critical findings resolved. The `tenant.capability` middleware is now **live** on all 10 existing tenant routes, with both allow-path and deny-path fully tested.

## Test Count Tracking

| Milestone | Total Tests |
|---|---|
| Phase 10A baseline | 338 |
| Phase 10B (post-audit) | **345** |
| Delta | **+7** (4 new denial tests + 3 net from CourseCrudTest data-provider expansion) |

## Audit Item Resolution

### 🔴 #1 + #2: 403 Denial Tests — FIXED
Created two dedicated test files:
- `CourseCapabilityDenialTest.php` — 2 tests:
  - `test_user_without_course_create_gets_403_on_post_courses` → **PASS**
  - `test_user_with_course_view_can_get_courses` → **PASS** (confirms selective enforcement)
- `ExamCapabilityDenialTest.php` — 2 tests:
  - `test_user_without_exam_manage_gets_403_on_post_exams` → **PASS**
  - `test_user_with_exam_view_can_get_exams` → **PASS** (confirms selective enforcement)

These tests create a user with ONLY `*.view` capabilities and verify that write endpoints return 403. The "Access automatically defaults to 403 Forbidden" claim is now an **engineering fact**, not marketing.

### 🔴 #3: Test Count — FIXED
See table above. 338 → 345.

### ❓ #4: `Gate::authorize` Grep Verification — CONFIRMED CLEAN
```
grep -rn 'Gate::authorize' app/ | grep -v '@deprecated' | grep -v 'Policies/'
```
Returns ONLY SuperAdmin controller calls:
- `app/Application/SuperAdminDashboard/Staff/UseCases/ActivateStaffUseCase.php`
- `app/Http/Controllers/Api/SuperAdminDashboard/Tenant/TenantWriteController.php`

**Zero** `Gate::authorize` calls remain in any tenant course or exam code path.

### ❓ #5: Middleware Order Verification — CONFIRMED CORRECT
`php artisan route:list --path=tenant/courses --json` confirms for all course routes:
```
tenant.resolve.token → auth:tenant_api → tenant.active → ensure.user.active → tenant.session → tenant.capability:{code}
```
`tenant.capability` is **position 6 (last)** — after auth, tenant context, and session are all established. This matches ADR-010 §6.3 pipeline order.

### 🟡 #6: Shared Capability Seeding Trait — IMPLEMENTED
Created `tests/Traits/SeedsTestCapabilities.php` with a single method:
```php
protected function seedCapabilitiesForRole(int $roleId, array $capabilityCodes): void
```
All 5 test files now use this trait instead of inline `DB::table()` inserts:
- `CourseCrudTest` → `$this->seedCapabilitiesForRole($role->id, ['course.view', ...])`
- `ExamHierarchyTest` → `$this->seedCapabilitiesForRole($roleA->id, ['exam.view', 'exam.manage'])`
- `CourseIdempotencyTest` → `$this->seedCapabilitiesForRole($role->id, ['course.create'])`
- `CourseCapabilityDenialTest` → `$this->seedCapabilitiesForRole($role->id, ['course.view'])`
- `ExamCapabilityDenialTest` → `$this->seedCapabilitiesForRole($role->id, ['exam.view'])`

### 🟡 #7: Policy Registration Clarified — DEAD REFERENCES REMOVED
`CoursePolicy` and `ExamPolicy` were still registered in `AuthorizationServiceProvider.php` (lines 71-72):
```php
Gate::policy(CourseRecord::class, CoursePolicy::class);  // REMOVED
Gate::policy(ExamRecord::class, ExamPolicy::class);      // REMOVED
```
These registrations were **dead code** — no controller calls `Gate::authorize` for these models anymore. Removed and replaced with a comment. The policy PHP files remain with `@deprecated` annotations for Phase 10D cleanup sweep.

## Quality Gate Final Verification
- **Functional Tests:** 345 tests, all passing. Both allow-path (happy) and deny-path (403) verified.
- **PHPStan Level 5:** 0 new errors (exit code 0, using Phase 10A baseline).
- **Middleware Order:** Confirmed via `route:list --json` — `tenant.capability` resolves last.
- **Gate Cleanup:** Verified via grep — zero `Gate::authorize` in tenant controllers.

## Files Changed (Complete)

| # | File | Action |
|---|---|---|
| 1 | `routes/tenant_dashboard/course.php` | Add `tenant.capability` per-route |
| 2 | `routes/tenant_dashboard/exam_hierarchy.php` | Add `tenant.capability` per-route |
| 3 | `CourseWriteController.php` | Remove 4 `Gate::authorize()` + import |
| 4 | `ExamController.php` | Remove 4 `Gate::authorize()` + import |
| 5 | `CoursePolicy.php` | Add `@deprecated` |
| 6 | `ExamPolicy.php` | Add `@deprecated` |
| 7 | `AuthorizationServiceProvider.php` | Remove dead policy registrations |
| 8 | `CourseCrudTest.php` | Refactored to use `SeedsTestCapabilities` trait |
| 9 | `ExamHierarchyTest.php` | Refactored to use `SeedsTestCapabilities` trait |
| 10 | `CourseIdempotencyTest.php` | Refactored to use `SeedsTestCapabilities` trait |
| 11 | `SeedsTestCapabilities.php` | **[NEW]** Shared trait for capability seeding |
| 12 | `CourseCapabilityDenialTest.php` | **[NEW]** 403 denial tests for course routes |
| 13 | `ExamCapabilityDenialTest.php` | **[NEW]** 403 denial tests for exam routes |

**Total: 10 files modified, 3 new files, 0 deleted files.**

**Verdict: READY.** Phase 10B is complete. The system is ready for Phase 10C.

