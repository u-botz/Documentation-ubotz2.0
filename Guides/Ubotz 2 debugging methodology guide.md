# UBOTZ 2.0 — Debugging Methodology & Troubleshooting Guide

**How to Find and Fix Bugs in Minutes, Not Hours**

Document Version: 1.0  
Date: March 5, 2026  
Audience: All Backend & Frontend Developers  
Status: **MANDATORY** — Read before your first bug report.

---

> **Why This Document Exists**
>
> UBOTZ 1.0 died because developers spent 10+ hours debugging a login failure caused by an undefined function in middleware. The actual fix was one line. The problem was not the bug — it was the debugging approach. Developers were guessing, not systematically isolating.
>
> This document teaches you how to find any bug in the UBOTZ stack in under 30 minutes using structured methods. If you are spending more than 30 minutes on a bug without progress, you are doing something wrong — stop and use this document.

---

## Table of Contents

1. [The Golden Rule of Debugging](#1-the-golden-rule)
2. [The 5-Minute Triage — Do This First, Every Time](#2-the-5-minute-triage)
3. [The Layer Isolation Method](#3-the-layer-isolation-method)
4. [Debugging by Error Type](#4-debugging-by-error-type)
5. [The UBOTZ Command Toolkit](#5-the-ubotz-command-toolkit)
6. [Reading Error Messages Like a Senior Developer](#6-reading-error-messages-like-a-senior-developer)
7. [The Request Lifecycle — Where Bugs Hide](#7-the-request-lifecycle--where-bugs-hide)
8. [Debugging Authentication & Authorization Issues](#8-debugging-authentication--authorization-issues)
9. [Debugging Tenant Isolation Issues](#9-debugging-tenant-isolation-issues)
10. [Debugging Database & Migration Issues](#10-debugging-database--migration-issues)
11. [Debugging Domain Layer Issues](#11-debugging-domain-layer-issues)
12. [Debugging Test Failures](#12-debugging-test-failures)
13. [Debugging Frontend ↔ Backend Integration](#13-debugging-frontend--backend-integration)
14. [The "I'm Completely Stuck" Escalation Protocol](#14-the-im-completely-stuck-escalation-protocol)
15. [Anti-Patterns — What NOT to Do When Debugging](#15-anti-patterns--what-not-to-do)
16. [The Debugging Cheat Sheet](#16-the-debugging-cheat-sheet)

---

## 1. The Golden Rule

> **"Read the error message. The WHOLE error message. Before you do ANYTHING else."**

90% of bugs tell you exactly what is wrong and exactly where. The error message contains:
- **What** failed (class name, method name)
- **Where** it failed (file path, line number)
- **Why** it failed (the description text)

The #1 reason developers waste hours: **they skim the error message, assume they know the problem, and start changing random things.** 

Stop. Read. Every. Word.

---

## 2. The 5-Minute Triage — Do This First, Every Time

Before writing a single line of fix code, spend exactly 5 minutes on these steps. In order. No skipping.

### Step 1: Reproduce (1 minute)

Can you make the bug happen again, reliably?

```
□ Hit the same endpoint with the same data
□ Run the same test command
□ Follow the same UI steps
```

If you can't reproduce it, you can't fix it. Document the exact steps that trigger it.

### Step 2: Read the Full Error (1 minute)

```
□ Open the Laravel log: docker exec -it ubotz_backend cat storage/logs/laravel.log | tail -100
□ Read the FIRST line of the stack trace — this is the actual error
□ Read the LAST "caused by" line — this is often the root cause
□ Note the file path and line number
```

### Step 3: Locate the Layer (1 minute)

Which architectural layer is the error in?

```
File path contains app/Http/        → HTTP Layer (Controller, FormRequest, Middleware)
File path contains app/Application/ → Application Layer (UseCase, Command, Query)
File path contains app/Domain/      → Domain Layer (Entity, ValueObject, Event)
File path contains app/Infrastructure/ → Infrastructure Layer (Repository, Model)
File path contains database/        → Migration/Seeder issue
File path contains vendor/          → Dependency issue (DO NOT EDIT vendor/)
File path contains config/          → Configuration issue
```

### Step 4: Identify the Error Category (1 minute)

```
"Class not found"              → Autoloading / namespace / typo
"Call to undefined method"     → Wrong class, wrong method name, or wrong import
"Cannot access property"       → Null object (variable is null when you expect an object)
"SQLSTATE"                     → Database error (see Section 10)
"401 Unauthorized"             → Auth/JWT issue (see Section 8)
"403 Forbidden"                → Authorization/permission issue (see Section 8)
"404 Not Found"                → Route not registered, or resource doesn't exist
"422 Unprocessable"            → Validation failure (check FormRequest rules)
"500 Internal Server Error"    → Unhandled exception (check laravel.log)
PHPStan error                  → Type mismatch, missing return type, undefined variable
Test failure                   → See Section 12
```

### Step 5: Form a Hypothesis (1 minute)

Based on steps 1-4, write ONE sentence:

> "I think the bug is caused by [X] in [file:line] because [evidence]."

Now go test that ONE hypothesis. Do not test multiple theories at once.

---

## 3. The Layer Isolation Method

When you don't know which layer is broken, isolate layer by layer. Start from the bottom (Domain) and work up.

### Step 1: Is the Domain Layer Correct?

Run the unit tests for the entity/value object in question:

```powershell
docker exec -it ubotz_backend php artisan test --filter=CourseEntityTest
docker exec -it ubotz_backend php artisan test --filter=CourseStatusTest
```

If domain tests pass → the business logic is correct. The bug is above this layer.

### Step 2: Is the Application Layer Correct?

Run the UseCase test:

```powershell
docker exec -it ubotz_backend php artisan test --filter=CreateCourseUseCaseTest
```

If UseCase tests pass → the orchestration is correct. The bug is in HTTP or Infrastructure.

### Step 3: Is the Infrastructure Layer Correct?

Test the repository directly in Tinker:

```powershell
docker exec -it ubotz_backend php artisan tinker
```

```php
// Test repository fetch
$repo = app(\App\Domain\TenantAdminDashboard\Course\Repositories\CourseRepositoryInterface::class);
$course = $repo->findById(1, 1); // (tenantId, courseId)
dump($course);
```

If the repository returns expected data → Infrastructure is correct. Bug is in HTTP layer.

### Step 4: Is the HTTP Layer Correct?

Test the endpoint directly:

```powershell
curl.exe -X GET "http://localhost:8000/api/tenant/courses/1" `
  -H "Authorization: Bearer YOUR_TOKEN" `
  -H "Accept: application/json" -v
```

Check:
- Is the route registered? (`docker exec -it ubotz_backend php artisan route:list --path=courses`)
- Is the middleware stack correct?
- Is the FormRequest passing?
- Is the Controller calling the right UseCase?

---

## 4. Debugging by Error Type

### 4.1 "Class Not Found" / ReflectionException

**This is the #1 most common error.** It means PHP can't find a class.

**Diagnostic Steps:**

```powershell
# Step 1: Is the namespace correct?
# Open the file and check the namespace matches the folder path
# app/Domain/TenantAdminDashboard/Course/Entities/CourseEntity.php
# MUST have: namespace App\Domain\TenantAdminDashboard\Course\Entities;

# Step 2: Is the class name correct?
# File name MUST match class name exactly (case-sensitive)
# CourseEntity.php must contain: class CourseEntity

# Step 3: Has the autoloader been updated?
docker exec -it ubotz_backend composer dump-autoload

# Step 4: Is the service container binding correct?
docker exec -it ubotz_backend php artisan tinker
>>> app(\App\Domain\TenantAdminDashboard\Course\Repositories\CourseRepositoryInterface::class);
# If this throws → binding is missing from ServiceProvider
```

**Common Causes:**
- Typo in namespace (case-sensitive: `Entities` vs `entities`)
- Forgot to run `composer dump-autoload` after creating new class
- Missing service container binding for interface → implementation
- Imported the wrong class (e.g., importing the Eloquent model instead of the domain entity)

**The Fix Pattern:**
```
1. Check namespace matches directory path
2. Check class name matches filename
3. Run composer dump-autoload
4. Check ServiceProvider bindings
```

---

### 4.2 "Call to Undefined Method"

**Means:** You're calling a method that doesn't exist on that object.

**Diagnostic Steps:**

```php
// Step 1: What is the actual class of the object?
dd(get_class($object));

// Step 2: Does the method exist?
dd(method_exists($object, 'methodName'));

// Step 3: Are you calling it on the right variable?
// Common mistake: calling entity method on Eloquent model or vice versa
```

**Common Causes:**
- Calling an Entity method on an Eloquent Record (or vice versa)
- Repository `toEntity()` mapper returns wrong type
- Method was renamed but caller wasn't updated
- Nullable object — variable is `null` when you expected an object

**The Fix Pattern:**
```
1. dd(get_class($object)) — verify you have the right class
2. Check imports — are you importing the domain Entity or the Eloquent Record?
3. Check repository mapper — does toEntity() return the right class?
```

---

### 4.3 "Cannot Access Property on Null"

**Means:** You're trying to use a variable that is `null`.

**Diagnostic Steps:**

```php
// Step 1: WHICH variable is null?
// Look at the line number. If the line is:
$course->title
// Then $course is null.

// Step 2: WHY is it null?
// Trace backward: where was $course assigned?
$course = $this->courseRepository->findById($tenantId, $courseId);
// findById returned null → course doesn't exist for this tenant+id

// Step 3: Check the data
docker exec -it ubotz_backend php artisan tinker
>>> \App\Infrastructure\Persistence\TenantAdminDashboard\Course\Models\CourseRecord::where('tenant_id', 1)->where('id', 1)->first();
```

**Common Causes:**
- Record doesn't exist in the database
- Tenant scoping filtered it out (it exists for tenant 2, not tenant 1)
- Repository `findById()` returns `null` but caller doesn't check
- Entity `reconstitute()` received null props from mapper

**The Fix Pattern:**
```
1. Identify which variable is null (read the line number)
2. Trace backward to where it was assigned
3. Check the database for the expected record
4. Add null checks where missing
```

---

### 4.4 "SQLSTATE" Database Errors

**Read the SQLSTATE code — it tells you exactly what happened:**

| Code | Meaning | Common Cause |
|------|---------|-------------|
| `23000` | Integrity constraint violation | Duplicate key, foreign key violation, NOT NULL violation |
| `42S02` | Table not found | Migration not run |
| `42S22` | Column not found | Column missing from migration, typo in column name |
| `42000` | Syntax error | Raw SQL error, malformed query |
| `HY000` | General error | Connection refused, timeout, lock wait |

**Diagnostic Steps for 23000 (Most Common):**

```powershell
# "Duplicate entry" → record already exists with that unique key
# Check what's actually in the database:
docker exec -it ubotz_backend php artisan tinker
>>> DB::table('courses')->where('tenant_id', 1)->where('slug', 'my-course')->get();

# "Cannot add or update a child row: foreign key constraint" → FK target doesn't exist
# Check the referenced table:
>>> DB::table('tenants')->where('id', 1)->exists();

# "Column cannot be null" → required field is null
# Check what you're trying to insert:
>>> dd($command->toArray());
```

---

### 4.5 PHPStan Errors

**PHPStan errors are compile-time bugs. They tell you about bugs BEFORE they happen at runtime.**

**How to Read PHPStan Output:**

```
 ------ ----------------------------------------------------------------
  Line   app/Application/TenantAdminDashboard/Course/UseCases/CreateCourseUseCase.php
 ------ ----------------------------------------------------------------
  42     Parameter #1 $tenantId of method findById() expects int, 
         string given.
 ------ ----------------------------------------------------------------
```

This tells you: on line 42, you're passing a string where an int is expected.

**Common PHPStan Errors:**

| Error | Meaning | Fix |
|-------|---------|-----|
| "expects int, string given" | Type mismatch | Cast: `(int) $value` or fix the source |
| "expects X, null given" | Nullable not handled | Add null check before use |
| "Method X not found" | Method doesn't exist | Check class name, check imports |
| "Class X not found" | Missing class | Run `composer dump-autoload`, check namespace |
| "has no return type" | Missing return type hint | Add `: ReturnType` to method signature |
| "Dead code" | Code after return/throw | Remove unreachable code |

**Run PHPStan for a single file:**

```powershell
docker exec -it ubotz_backend vendor/bin/phpstan analyse app/Application/TenantAdminDashboard/Course/UseCases/CreateCourseUseCase.php --level=5
```

---

### 4.6 HTTP Status Code Errors

| Code | Where to Look | Likely Cause |
|------|--------------|-------------|
| **401** | Middleware, JWT | Token expired, invalid, or missing. Check Section 8. |
| **403** | Policy, Gate, Middleware | User lacks required permission or authority level. Check Section 8. |
| **404** | Route registration, Controller | Route not registered OR resource not found. Check `route:list`. |
| **405** | Route definition | Wrong HTTP method (POST vs GET vs PUT). Check route definition. |
| **419** | CSRF | CSRF token mismatch (rare in API — should be stateless). |
| **422** | FormRequest validation | Input validation failed. Check response body for which field. |
| **429** | Throttle middleware | Rate limit exceeded. Wait and retry. |
| **500** | Anywhere | Unhandled exception. Check `storage/logs/laravel.log` immediately. |

---

## 5. The UBOTZ Command Toolkit

Keep this reference open while debugging. All commands run from PowerShell on the host machine.

### Log Inspection

```powershell
# View last 100 lines of Laravel log
docker exec -it ubotz_backend tail -100 storage/logs/laravel.log

# View log in real-time (watch as errors happen)
docker exec -it ubotz_backend tail -f storage/logs/laravel.log

# Clear the log (start fresh before reproducing)
docker exec -it ubotz_backend truncate -s 0 storage/logs/laravel.log

# Search for specific error in log
docker exec -it ubotz_backend grep -n "CourseNotFoundException" storage/logs/laravel.log
```

### Database Inspection

```powershell
# Open Tinker (interactive PHP console)
docker exec -it ubotz_backend php artisan tinker

# Check if table exists
docker exec -it ubotz_backend php artisan tinker --execute="echo Schema::hasTable('courses') ? 'YES' : 'NO';"

# Check migration status
docker exec -it ubotz_backend php artisan migrate:status

# Check a specific record
docker exec -it ubotz_backend php artisan tinker --execute="dump(DB::table('courses')->where('id', 1)->first());"

# Check table structure
docker exec -it ubotz_backend php artisan tinker --execute="dump(Schema::getColumnListing('courses'));"
```

### Route Inspection

```powershell
# List all routes
docker exec -it ubotz_backend php artisan route:list

# Find routes matching a path
docker exec -it ubotz_backend php artisan route:list --path=courses

# Find routes matching a name
docker exec -it ubotz_backend php artisan route:list --name=course
```

### Service Container Inspection

```powershell
# Check if an interface is bound
docker exec -it ubotz_backend php artisan tinker --execute="dump(app()->bound('App\Domain\TenantAdminDashboard\Course\Repositories\CourseRepositoryInterface'));"

# Resolve a binding and check its class
docker exec -it ubotz_backend php artisan tinker --execute="dump(get_class(app('App\Domain\TenantAdminDashboard\Course\Repositories\CourseRepositoryInterface')));"
```

### Testing

```powershell
# Run all tests
docker exec -it ubotz_backend php artisan test

# Run a specific test class
docker exec -it ubotz_backend php artisan test --filter=CreateCourseUseCaseTest

# Run a specific test method
docker exec -it ubotz_backend php artisan test --filter=CreateCourseUseCaseTest::test_creates_course_successfully

# Run tests with verbose output (shows each assertion)
docker exec -it ubotz_backend php artisan test --filter=CreateCourseUseCaseTest -v

# Run PHPStan
docker exec -it ubotz_backend vendor/bin/phpstan analyse app/ --level=5

# Run PHPStan on a specific directory
docker exec -it ubotz_backend vendor/bin/phpstan analyse app/Application/TenantAdminDashboard/Course/ --level=5
```

### Cache Clearing

```powershell
# Clear all caches (nuclear option — use when confused)
docker exec -it ubotz_backend php artisan optimize:clear

# Specific clears
docker exec -it ubotz_backend php artisan config:clear
docker exec -it ubotz_backend php artisan cache:clear
docker exec -it ubotz_backend php artisan route:clear
docker exec -it ubotz_backend php artisan view:clear

# Regenerate autoloader
docker exec -it ubotz_backend composer dump-autoload
```

### API Testing

```powershell
# Login and get token
curl.exe -X POST "http://localhost:8000/api/development/auth/platform/admin/login" `
  -H "Content-Type: application/json" `
  -H "Accept: application/json" `
  -d "{\"email\":\"admin@ubotz.io\",\"password\":\"password\"}" -v

# Test a protected endpoint
curl.exe -X GET "http://localhost:8000/api/admin/courses" `
  -H "Authorization: Bearer YOUR_TOKEN_HERE" `
  -H "Accept: application/json" -v

# Test with POST data
curl.exe -X POST "http://localhost:8000/api/admin/courses" `
  -H "Authorization: Bearer YOUR_TOKEN_HERE" `
  -H "Content-Type: application/json" `
  -H "Accept: application/json" `
  -d "{\"title\":\"Test Course\",\"slug\":\"test-course\"}" -v
```

---

## 6. Reading Error Messages Like a Senior Developer

### Anatomy of a Laravel Stack Trace

```
[2026-03-05 10:30:15] local.ERROR: Call to undefined method 
App\Infrastructure\Persistence\TenantAdminDashboard\Course\Models\CourseRecord::changeStatus() 
in /var/www/html/app/Application/TenantAdminDashboard/Course/UseCases/ChangeCourseStatusUseCase.php:35

Stack trace:
#0 /var/www/html/app/Http/Controllers/Api/.../CourseWriteController.php(22): ...UseCase->execute()
#1 /var/www/html/vendor/laravel/framework/src/Illuminate/Routing/Controller.php(54): ...
#2 ... (framework internals)
```

**How to Read This:**

| Part | What It Tells You |
|------|------------------|
| `Call to undefined method ... CourseRecord::changeStatus()` | You're calling `changeStatus()` on the Eloquent **Record** (infrastructure), but that method only exists on the **Entity** (domain). The repository is returning the wrong type. |
| `in ...ChangeCourseStatusUseCase.php:35` | Line 35 of the UseCase is where the error happens. Open that file, go to line 35. |
| `#0 ...CourseWriteController.php(22)` | The controller called the UseCase on line 22. This is the call chain — read bottom to top for flow, top to bottom for the error. |

**Senior Developer Thought Process:**

1. "The error says `CourseRecord::changeStatus()` — but `changeStatus()` is on `CourseEntity`, not `CourseRecord`."
2. "This means the UseCase is getting a `CourseRecord` (Eloquent model) instead of a `CourseEntity` (domain object)."
3. "The repository's `findById()` is probably returning the raw Eloquent model instead of mapping it through `toEntity()`."
4. Open the repository → check `findById()` → find the missing `toEntity()` call → fix → done. **2 minutes.**

---

### Anatomy of a PHPStan Error

```
 ------ ----------------------------------------------------------------
  Line   Error
 ------ ----------------------------------------------------------------
  42     Method App\Domain\...\CourseEntity::changeStatus() invoked with
         1 parameter, 2 required.
 ------ ----------------------------------------------------------------
```

**How to Read This:**
- Line 42 of the file being analyzed
- `changeStatus()` expects 2 parameters but you're passing 1
- Open the Entity, check the method signature, add the missing parameter

---

## 7. The Request Lifecycle — Where Bugs Hide

Every HTTP request flows through these stages. When debugging, identify which stage fails.

```
[Client Request]
       │
       ▼
┌─── Stage 1: ROUTING ──────────────────────────────────┐
│  Route matched? Method correct (GET/POST/PUT/DELETE)?  │
│  Bug symptoms: 404, 405                                │
│  Debug: php artisan route:list --path=your-path        │
└──────────────────────┬─────────────────────────────────┘
                       │
                       ▼
┌─── Stage 2: MIDDLEWARE ────────────────────────────────┐
│  AddBearerTokenFromCookie → auth:guard → tenant.resolve│
│  → ensure.tenant.active → ensure.user.active           │
│  Bug symptoms: 401, 403, 500 before controller         │
│  Debug: Check middleware stack on the route group       │
└──────────────────────┬─────────────────────────────────┘
                       │
                       ▼
┌─── Stage 3: FORM REQUEST VALIDATION ──────────────────┐
│  Validates input against rules()                       │
│  Bug symptoms: 422 with validation error messages      │
│  Debug: Read the response body — it lists which fields │
└──────────────────────┬─────────────────────────────────┘
                       │
                       ▼
┌─── Stage 4: CONTROLLER ───────────────────────────────┐
│  Builds Command from request, calls UseCase            │
│  Bug symptoms: 500 if Command constructor fails        │
│  Debug: Check Command constructor parameter types      │
└──────────────────────┬─────────────────────────────────┘
                       │
                       ▼
┌─── Stage 5: USE CASE ─────────────────────────────────┐
│  Orchestrates: validate → entity → transaction → audit │
│  Bug symptoms: 500 (domain exception not caught),      │
│  409 (duplicate), 422 (business rule)                  │
│  Debug: Check each step in the UseCase                 │
└──────────────────────┬─────────────────────────────────┘
                       │
                       ▼
┌─── Stage 6: REPOSITORY / DATABASE ────────────────────┐
│  SQL execution, entity mapping                         │
│  Bug symptoms: SQLSTATE errors, wrong data returned    │
│  Debug: Tinker, check SQL, check toEntity mapper       │
└──────────────────────┬─────────────────────────────────┘
                       │
                       ▼
┌─── Stage 7: RESPONSE ─────────────────────────────────┐
│  Resource transforms entity → JSON                     │
│  Bug symptoms: Missing fields, wrong format, wrong code│
│  Debug: Check Resource toArray(), check status code     │
└────────────────────────────────────────────────────────┘
```

**Debugging tip:** Add a temporary `dd()` (dump and die) at the START of each stage. If the `dd()` fires, the bug is AFTER that stage. If it doesn't fire, the bug is BEFORE or AT that stage. Binary search your way to the broken stage.

```php
// Temporary debugging — REMOVE BEFORE COMMIT
public function execute(CreateCourseCommand $command): CourseEntity
{
    dd('UseCase reached', $command); // If you see this, the bug is inside the UseCase
    // ... rest of code
}
```

---

## 8. Debugging Authentication & Authorization Issues

### 401 Unauthorized

**Means:** The JWT token is missing, expired, or invalid.

**Step-by-step diagnosis:**

```powershell
# Step 1: Do you have a token?
# Check if the login response includes a token/cookie
curl.exe -X POST "http://localhost:8000/api/development/auth/platform/admin/login" `
  -H "Content-Type: application/json" `
  -d "{\"email\":\"admin@ubotz.io\",\"password\":\"password\"}" -v
# Look for: Set-Cookie: ubotz_auth_token=...

# Step 2: Is the token being sent?
# Add -v flag to see request headers
curl.exe -X GET "http://localhost:8000/api/admin/me" `
  -H "Authorization: Bearer YOUR_TOKEN" `
  -H "Accept: application/json" -v
# Look for: > Authorization: Bearer eyJ...

# Step 3: Is the token expired?
# Decode the JWT payload (base64 decode the middle section)
# Check the 'exp' claim — is it in the past?
docker exec -it ubotz_backend php artisan tinker
>>> $token = 'YOUR_TOKEN_HERE';
>>> $parts = explode('.', $token);
>>> dump(json_decode(base64_decode($parts[1])));
# Look at 'exp' timestamp vs current time()

# Step 4: Is the token blacklisted?
# After logout, the token is blacklisted in Redis
docker exec -it ubotz_backend php artisan tinker
>>> dump(\JWTAuth::parseToken()->check());
```

**Common Causes:**
- Token expired (15-minute TTL for access tokens)
- Token blacklisted after logout
- Wrong guard — using admin token on tenant route or vice versa
- Cookie not being sent (missing `withCredentials: true` in Axios)
- `AddBearerTokenFromCookie` middleware not reading the cookie

### 403 Forbidden

**Means:** The user IS authenticated but lacks permission.

```powershell
# Step 1: What authority level does the user have?
docker exec -it ubotz_backend php artisan tinker
>>> $admin = \App\Infrastructure\Persistence\SuperAdminDashboard\Staff\Models\AdminRecord::find(1);
>>> dump($admin->authority_level);

# Step 2: What level does the route require?
# Check the route's middleware — look for authority:60 or similar
docker exec -it ubotz_backend php artisan route:list --path=your-path

# Step 3: Does the user have the required permission?
>>> dump($admin->permissions->pluck('code'));
```

---

## 9. Debugging Tenant Isolation Issues

### "I can see another tenant's data"

**This is a CRITICAL security bug. Stop feature work and fix immediately.**

```powershell
# Step 1: Is the global scope applied?
docker exec -it ubotz_backend php artisan tinker
>>> $query = \App\Infrastructure\Persistence\TenantAdminDashboard\Course\Models\CourseRecord::query();
>>> dump($query->toSql());
# MUST contain: "where `courses`.`tenant_id` = ?"

# Step 2: Is TenantContext set?
# In a test or Tinker, check the tenant context:
>>> dump(app(\App\Infrastructure\Persistence\Shared\TenantContext::class)->getId());

# Step 3: Are you using DB::table() instead of Eloquent?
# DB::table() bypasses global scopes!
# Search your code:
docker exec -it ubotz_backend grep -rn "DB::table" app/Application/
# If this returns results → you have a tenant isolation bug
```

### "I can't see my own tenant's data"

```powershell
# Step 1: What tenant context is set?
# Add temporary logging in the UseCase:
\Log::info('Tenant context', ['tenant_id' => $command->tenantId]);

# Step 2: Does the data exist for this tenant?
docker exec -it ubotz_backend php artisan tinker
>>> DB::table('courses')->where('tenant_id', 1)->get();

# Step 3: Is the JWT tenant_id correct?
# Decode the token and check tenant_id claim
```

---

## 10. Debugging Database & Migration Issues

### "Table doesn't exist"

```powershell
# Check migration status
docker exec -it ubotz_backend php artisan migrate:status

# Run pending migrations
docker exec -it ubotz_backend php artisan migrate

# Nuclear option (dev only): fresh rebuild
docker exec -it ubotz_backend php artisan migrate:fresh --seed
```

### "Column not found"

```powershell
# Check actual table structure
docker exec -it ubotz_backend php artisan tinker
>>> dump(Schema::getColumnListing('courses'));

# Compare with what migration defines
# Open the migration file and check column names
```

### "Foreign key constraint fails"

```powershell
# The referenced record doesn't exist
# Check the parent table:
docker exec -it ubotz_backend php artisan tinker
>>> DB::table('tenants')->where('id', $tenantId)->exists();
>>> DB::table('courses')->where('id', $courseId)->exists();
```

### Migration Rollback Fails

```powershell
# Check which migration is problematic
docker exec -it ubotz_backend php artisan migrate:status

# Try rolling back one step
docker exec -it ubotz_backend php artisan migrate:rollback --step=1

# If down() method is broken, fix it, then rollback
```

---

## 11. Debugging Domain Layer Issues

### "Invalid status transition"

This means the domain entity's state machine rejected a transition.

```php
// Check the allowed transitions in the ValueObject
// e.g., CourseStatus::ALLOWED_TRANSITIONS
// Common issue: trying to go from 'published' to 'draft' when only 'archived' is allowed

// Debug in Tinker:
>>> $status = new \App\Domain\TenantAdminDashboard\Course\ValueObjects\CourseStatus('published');
>>> dump($status->canTransitionTo(new \App\Domain\TenantAdminDashboard\Course\ValueObjects\CourseStatus('draft')));
// Returns false → that transition is not allowed
```

### "Entity validation error"

```php
// Value Object constructor is rejecting input
// Debug: what value are you passing?
>>> new \App\Domain\TenantAdminDashboard\Course\ValueObjects\CourseSlug('');
// Throws: "Course slug cannot be empty"
// Fix: validate input before creating the VO, or check the form data
```

---

## 12. Debugging Test Failures

### "Test fails but the code works manually"

```powershell
# Step 1: Run the single test with verbose output
docker exec -it ubotz_backend php artisan test --filter=YourTestName -v

# Step 2: Is the database state correct?
# Tests use RefreshDatabase — each test starts clean
# If your test depends on seeded data, make sure you're calling the seeder

# Step 3: Is the mock set up correctly?
# If testing UseCase with mocked repo, check mock expectations
# Common issue: mock returns null when the test expects an entity
```

### "Test passes locally but fails in CI"

```powershell
# Step 1: Is the .env.ci file correct?
# Check database credentials, Redis connection

# Step 2: Are migrations running in CI?
# Check ci.yml: does it run php artisan migrate:fresh?

# Step 3: Time-dependent test?
# Tests using Carbon::now() may fail in different timezones
# Use Carbon::setTestNow() to freeze time
```

### "PHPStan passes but tests fail (or vice versa)"

PHPStan checks types statically. Tests check runtime behavior. They catch different bugs.

```powershell
# Run both independently
docker exec -it ubotz_backend vendor/bin/phpstan analyse app/ --level=5
docker exec -it ubotz_backend php artisan test
```

---

## 13. Debugging Frontend ↔ Backend Integration

### "CORS error"

```
Access to XMLHttpRequest at 'http://localhost:8000/api/...' from origin 
'http://localhost:3000' has been blocked by CORS policy
```

```powershell
# Check config/cors.php
docker exec -it ubotz_backend cat config/cors.php
# allowed_origins should include your frontend URL
# allowed_methods should include the HTTP method you're using
```

### "Response is HTML instead of JSON"

```
The response is a Laravel error page (HTML) instead of JSON
```

Your request is missing the `Accept: application/json` header. Without it, Laravel returns HTML error pages.

```javascript
// Axios fix:
const apiClient = axios.create({
    baseURL: process.env.NEXT_PUBLIC_API_URL,
    headers: { 'Accept': 'application/json' },
    withCredentials: true,
});
```

### "422 but I'm sending the right data"

```powershell
# Step 1: Check what Laravel actually received
# Temporarily in the controller:
dd($request->all());

# Step 2: Check the response body for validation errors
# The 422 response body contains which fields failed:
{
    "success": false,
    "error": {
        "code": "VALIDATION_ERROR",
        "message": "The given data was invalid.",
        "details": {
            "title": ["The title field is required."],
            "slug": ["The slug has already been taken."]
        }
    }
}

# Step 3: Is the Content-Type header correct?
# Must be: Content-Type: application/json
# If sending FormData (file uploads), must be: multipart/form-data
```

### "Cookie not being sent"

```javascript
// Axios MUST have withCredentials: true
const apiClient = axios.create({
    withCredentials: true,  // ← This sends httpOnly cookies
});

// fetch() equivalent:
fetch(url, { credentials: 'include' });
```

---

## 14. The "I'm Completely Stuck" Escalation Protocol

If you have been debugging for **more than 30 minutes** without progress, follow this protocol:

### Step 1: Document What You Know (5 minutes)

Write down:
```
1. What I expected to happen: ___
2. What actually happens: ___
3. The exact error message: ___
4. The file and line number: ___
5. What I've already tried:
   - ___
   - ___
   - ___
6. My current hypothesis: ___
```

### Step 2: Rubber Duck (5 minutes)

Explain the problem out loud (to yourself, a rubber duck, or a teammate) as if they know nothing about the codebase. Often, verbalizing the problem reveals the assumption you're making that is wrong.

### Step 3: Minimize the Reproduction (10 minutes)

Create the smallest possible reproduction:
```
- Can you reproduce it in Tinker? (eliminates HTTP, middleware, frontend)
- Can you reproduce it in a test? (eliminates environment issues)
- Can you reproduce it with hardcoded values? (eliminates input issues)
```

### Step 4: Ask for Help (with your documentation)

When you ask for help, share:
1. The documented problem from Step 1
2. The minimal reproduction from Step 3
3. What you've ruled out

**A good help request:** "CreateCourseUseCase throws `Call to undefined method changeStatus()` on line 35. I've verified the Entity has the method. The repository's `findById()` is returning the right class (`get_class()` confirms `CourseEntity`). I suspect the `toEntity()` mapper is returning a stale version of the entity. I've been stuck for 30 minutes."

**A bad help request:** "It doesn't work." (This tells the helper nothing and wastes their time.)

---

## 15. Anti-Patterns — What NOT to Do When Debugging

### ❌ "Change random things until it works"

Also known as "shotgun debugging." You change 5 things at once, it starts working, and you don't know which change fixed it. Push to production. Next week, one of the other 4 changes breaks something else.

**Instead:** Change ONE thing. Test. If it doesn't fix it, REVERT and change a different thing.

### ❌ "Add try-catch everywhere to suppress errors"

```php
// ❌ This hides the bug instead of fixing it
try {
    $course = $this->useCase->execute($command);
} catch (\Throwable $e) {
    return response()->json(['error' => 'Something went wrong'], 500);
}
```

The error still happens. You just can't see it anymore. Next week, a customer reports silent data loss.

**Instead:** Fix the root cause. Only catch specific, expected exceptions.

### ❌ "It works on my machine"

If it fails in CI or another developer's environment, the bug is real. Your machine is the exception.

**Instead:** Check: Docker versions match? `.env` files match? Migrations up to date? `composer install` run?

### ❌ "I'll just comment out the failing code"

Commenting out code to "get past" an error means you've removed functionality. The feature is now broken by omission.

**Instead:** Fix the error. If you truly can't fix it right now, create a failing test that documents the bug and assign a ticket.

### ❌ "Let me rewrite the whole thing"

Rewriting is almost never the answer to a bug. The bug is usually one line. Rewriting introduces new bugs.

**Instead:** Find the one line. Use the Layer Isolation Method (Section 3).

### ❌ "I'll debug this in production"

Never `dd()`, `dump()`, or add debug logging directly in production code.

**Instead:** Reproduce locally. Write a test that fails. Fix. Test passes. Deploy.

---

## 16. The Debugging Cheat Sheet

Print this. Keep it at your desk.

```
┌────────────────────────────────────────────────────────────────┐
│  UBOTZ DEBUGGING CHEAT SHEET                                   │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  FIRST 5 MINUTES:                                              │
│    1. Reproduce the bug                                        │
│    2. Read the FULL error message                              │
│    3. Identify the layer (Domain/App/Infra/HTTP)               │
│    4. Identify the error category                              │
│    5. Form ONE hypothesis and test it                          │
│                                                                │
│  MOST COMMON ERRORS:                                           │
│    "Class not found"     → composer dump-autoload              │
│                            check namespace matches folder      │
│    "Undefined method"    → dd(get_class($object))              │
│                            Entity vs Record confusion?         │
│    "Property on null"    → trace backward to find null source  │
│                            check DB: does record exist?        │
│    "SQLSTATE 23000"      → duplicate key or FK violation       │
│                            check DB for existing record        │
│    "401 Unauthorized"    → token expired? missing? wrong guard?│
│    "403 Forbidden"       → check authority_level & permissions │
│    "500 Server Error"    → check storage/logs/laravel.log      │
│                                                                │
│  ESSENTIAL COMMANDS:                                           │
│    Log:   docker exec -it ubotz_backend tail -f                │
│             storage/logs/laravel.log                            │
│    DB:    docker exec -it ubotz_backend php artisan tinker     │
│    Routes: docker exec -it ubotz_backend php artisan           │
│             route:list --path=your-path                        │
│    Tests: docker exec -it ubotz_backend php artisan test       │
│             --filter=YourTest -v                               │
│    PHPStan: docker exec -it ubotz_backend vendor/bin/phpstan   │
│             analyse app/Path/To/File.php --level=5             │
│    Reset: docker exec -it ubotz_backend php artisan            │
│             optimize:clear                                     │
│                                                                │
│  STUCK > 30 MIN? ESCALATION:                                   │
│    1. Document: expected vs actual + error + what you tried    │
│    2. Minimize: reproduce in Tinker or a test                  │
│    3. Ask: share documentation + reproduction + hypothesis     │
│                                                                │
│  GOLDEN RULE: Read the error. The WHOLE error.                 │
│  SILVER RULE: Change ONE thing. Test. Revert if wrong.         │
│  BRONZE RULE: Never suppress errors with try-catch.            │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

---

*End of Document — UBOTZ 2.0 Debugging Methodology & Troubleshooting Guide v1.0*