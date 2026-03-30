# Policy Directory Consolidation

The platform currently has policies scattered across two root locations (`app/Policies/` and `app/Http/Policies/`). The `AuthorizationServiceProvider` inconsistently points to both. This plan consolidates all Laravel policies into `app/Http/Policies/` as the single canonical location and removes the stale `app/Policies/` directory.

## Current State vs. Target

| File | Current Namespace | Current Gate Registration | Action |
|---|---|---|---|
| `app/Policies/AdminPolicy.php` | `App\Policies` | `App\Policies\AdminPolicy` | **MOVE** → `app/Http/Policies/`, update namespace |
| `app/Policies/TenantAdminDashboard/QuizPolicy.php` | `App\Policies\TenantAdminDashboard` | `App\Policies\TenantAdminDashboard\QuizPolicy` | **MOVE** → `app/Http/Policies/TenantAdminDashboard/`, update namespace |
| `app/Policies/TenantDashboard/CourseAccessPolicy.php` | `App\Policies\TenantDashboard` | `App\Policies\TenantDashboard\CourseAccessPolicy` | **MOVE** → `app/Http/Policies/TenantDashboard/`, update namespace |
| `app/Policies/SuperAdminDashboard/SubscriptionPolicy.php` | `App\Policies\SuperAdminDashboard` | **NOT REGISTERED** (unused — `Http\Policies` version is already active) | **DELETE** (legacy/stale) |
| `app/Http/Policies/SuperAdminDashboard/SubscriptionPolicy.php` | `App\Http\Policies\SuperAdminDashboard` | Correctly registered | ✅ No change |
| `app/Http/Policies/SuperAdminDashboard/InstitutionTypePolicy.php` | `App\Http\Policies\SuperAdminDashboard` | Correctly registered | ✅ No change |

---

## Proposed Changes

### 1. Move Policies to `app/Http/Policies/`

#### [MODIFY] [AdminPolicy.php](file:///c:/Users/sayan/lms/Ubotz_2.0/backend/app/Policies/AdminPolicy.php)
- Move to `app/Http/Policies/AdminPolicy.php`
- Change namespace: `App\Policies` → `App\Http\Policies`

#### [MODIFY] [QuizPolicy.php](file:///c:/Users/sayan/lms/Ubotz_2.0/backend/app/Policies/TenantAdminDashboard/QuizPolicy.php)
- Move to `app/Http/Policies/TenantAdminDashboard/QuizPolicy.php`
- Change namespace: `App\Policies\TenantAdminDashboard` → `App\Http\Policies\TenantAdminDashboard`

#### [MODIFY] [CourseAccessPolicy.php](file:///c:/Users/sayan/lms/Ubotz_2.0/backend/app/Policies/TenantDashboard/CourseAccessPolicy.php)
- Move to `app/Http/Policies/TenantDashboard/CourseAccessPolicy.php`
- Change namespace: `App\Policies\TenantDashboard` → `App\Http\Policies\TenantDashboard`

---

### 2. Update AuthorizationServiceProvider Registrations

#### [MODIFY] [AuthorizationServiceProvider.php](file:///c:/Users/sayan/lms/Ubotz_2.0/backend/app/Providers/AuthorizationServiceProvider.php)
Update three `use` statements and `Gate::policy()` registrations:

```diff
-use App\Policies\AdminPolicy;
+use App\Http\Policies\AdminPolicy;
```

```diff
-Gate::policy(QuizRecord::class, \App\Policies\TenantAdminDashboard\QuizPolicy::class);
+Gate::policy(QuizRecord::class, \App\Http\Policies\TenantAdminDashboard\QuizPolicy::class);

-Gate::policy(CourseRecord::class, \App\Policies\TenantDashboard\CourseAccessPolicy::class);
+Gate::policy(CourseRecord::class, \App\Http\Policies\TenantDashboard\CourseAccessPolicy::class);
```

---

### 3. Delete Stale/Legacy Policies

#### [DELETE] `app/Policies/SuperAdminDashboard/SubscriptionPolicy.php`
This is the old unreferenced version that is completely superseded by the `Http\Policies` version currently registered in `AuthorizationServiceProvider`. The two differ significantly (old one: returns `bool`, injects `$model`; new one: returns `Response`, final class).

#### [DELETE] `app/Policies/` (entire directory — once empty after moves)

---

## Risk Analysis

| Risk | Mitigation |
|---|---|
| `AdminPolicy` namespace change breaks a `use` statement somewhere else | Run `grep_search` for `App\Policies\AdminPolicy` before deleting |
| `QuizPolicy` / `CourseAccessPolicy` referenced elsewhere | Run `grep_search` for old namespace before deleting |
| Legacy `SubscriptionPolicy` was still used in some controller | Confirmed NOT in `AuthorizationServiceProvider` — confirm once via grep |

---

## Verification Plan

### Automated Tests

After making changes, run the full test suite to confirm no authorization regressions:

```powershell
docker exec -it ubotz_backend php artisan test
```

Run specifically targeted policy/auth tests:
```powershell
docker exec -it ubotz_backend php artisan test --filter=Policy
docker exec -it ubotz_backend php artisan test --filter=Admin
docker exec -it ubotz_backend php artisan test --filter=Quiz
```

Verify the autoloader still resolves:
```powershell
docker exec -it ubotz_backend php artisan optimize:clear
docker exec -it ubotz_backend php artisan route:list
```

> [!CAUTION]
> Do NOT delete `app/Policies/SuperAdminDashboard/SubscriptionPolicy.php` until you have confirmed via grep that no file references `App\Policies\SuperAdminDashboard\SubscriptionPolicy`.
