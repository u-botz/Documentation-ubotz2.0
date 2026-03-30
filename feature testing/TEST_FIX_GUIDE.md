# Test Fix Guide — Common Patterns & Solutions

This document captures the recurring issues found while fixing test failures across the Ubotz 2.0 codebase. Use it as a reference when debugging similar failures.

---

## 1. Backed Enum Misuse (Most Common)

**Symptom:** `Cannot instantiate enum`, `Call to undefined method ::fromString()`, `Call to undefined method ->getValue()`, `Call to undefined method ->toString()`

**Root Cause:** The codebase uses PHP 8.1+ backed enums (`enum Foo: string`), but many call sites treat them as if they were custom value-object classes with constructors and helper methods.

**Affected enums:**
- `ChapterStatus`, `CourseStatus`, `ContentStatus`
- `FileSource`, `FileType`, `FileAccessibility`

**Fix patterns:**

| Wrong | Correct |
|---|---|
| `new ChapterStatus('active')` | `ChapterStatus::from('active')` |
| `new ContentStatus($value)` | `ContentStatus::from($value)` |
| `FileSource::fromString($value)` | `FileSource::from($value)` |
| `$status->getValue()` | `$status->value` |
| `$source->toString()` | `$source->value` |
| `new ChapterStatus(ChapterStatus::ACTIVE)` | `ChapterStatus::ACTIVE` (already an enum case) |

**Exception type change:** Backed enums throw `ValueError` (not `InvalidArgumentException`) for invalid values. Tests using `$this->expectException(\InvalidArgumentException::class)` on `::from()` need to change to `\ValueError::class`.

**Where to look:** Use cases (`Create*UseCase`, `Update*UseCase`, `Change*UseCase`), resources (`*Resource`), controllers, domain events, and unit tests.

---

## 2. Missing `created_by` on Test Courses (Visibility Filter)

**Symptom:** API returns `404` or empty `data: []` with status `200`. No exception thrown.

**Root Cause:** `GetCourseQuery` and `ListCoursesQuery` apply a security filter for non-admin users:

```php
// Non-admins only see ACTIVE courses or those they own
if (!$isAdmin) {
    $query->where(function ($q) use ($currentUserId) {
        $q->where('status', 'active')
          ->orWhere('teacher_id', $currentUserId)
          ->orWhere('created_by', $currentUserId);
    });
}
```

A user is considered "admin" only if they have the `course.publish` capability. Most test users have `course.view` and `course.edit` but NOT `course.publish`.

**Fix:** Always add `'created_by' => $this->user->id` (or `$this->admin->id`) when creating test courses, especially for `draft` or non-`active` courses. This applies to both Eloquent `::create()` calls and raw `DB::table()->insert()`.

```php
// Before (broken for non-admin viewing draft courses)
CourseRecord::create([
    'tenant_id' => $this->tenant->id,
    'title' => 'Test Course',
    'slug' => 'test-course',
    'status' => 'draft',
]);

// After (user can see their own course)
CourseRecord::create([
    'tenant_id' => $this->tenant->id,
    'title' => 'Test Course',
    'slug' => 'test-course',
    'status' => 'draft',
    'created_by' => $this->user->id,
]);
```

---

## 3. Wrong Namespace Imports

**Symptom:** `Class "App\Infrastructure\Persistence\Models\SomeRecord" not found` or `Class "App\Providers\SomeRepository" not found`

**Root Cause:** A `use` import statement is missing or points to a wrong namespace. PHP resolves unqualified class names relative to the current file's namespace.

**Examples found:**
- `EloquentCourseFileRepository` used in `CourseServiceProvider` without import → resolved as `App\Providers\EloquentCourseFileRepository`
- `TenantRoleRecord` imported from `App\Infrastructure\Persistence\Models\` → should be `App\Infrastructure\Persistence\TenantAdminDashboard\`
- `BelongsToTenant` trait imported from `Shared\Traits\` → should be `Traits\`

**Fix:** Add or correct the `use` import. Check the actual file location to confirm the correct namespace.

---

## 4. Missing Required Fields in Test Data

**Symptom:** `SQLSTATE: NOT NULL constraint failed` on fields like `provider`, `content`, `file_path`, `creator_id`, `description`.

**Root Cause:** Test `::create()` calls omit required database columns that have no default value.

**Common missing fields by table:**

| Table | Commonly Missing Fields |
|---|---|
| `live_sessions` | `provider` (e.g., `'zoom'`), `date` |
| `text_lessons` | `content` |
| `course_files` | `file_path` |
| `assignments` | `creator_id`, `description` |
| `courses` | `created_by` (not DB-required, but needed for visibility) |

**Fix:** Check the migration file to see which columns are non-nullable, then add them to the test data.

---

## 5. Wrong Table Names in Raw Queries

**Symptom:** `no such table: chapters` (SQLite) or `Table 'ubotz_central.chapters' doesn't exist` (MySQL)

**Root Cause:** Some infrastructure query classes reference table names that don't match the actual migration. Example: `chapters` vs `course_chapters`.

**Fix:** Check the migration file name or the Eloquent model's `$table` property to confirm the correct table name.

---

## 6. Missing Service Provider Bindings

**Symptom:** `Target [App\Domain\...\SomeInterface] is not instantiable`

**Root Cause:** The interface→implementation binding is missing from the relevant `ServiceProvider`.

**Fix:** Add `$this->app->bind(InterfaceClass::class, ImplementationClass::class)` to the appropriate service provider's `register()` method. Don't forget to add the `use` import for both classes.

---

## 7. PHPUnit `<env>` vs `<server>` in Docker

**Symptom:** Tests try to connect to MySQL instead of SQLite in-memory. Errors like `table already exists` from MySQL migrations.

**Root Cause:** Docker sets `DB_CONNECTION=mysql` as an OS-level env var, which populates `$_SERVER`. Laravel's Dotenv reads `$_SERVER` first (via `ServerConstAdapter`). PHPUnit's `<env force="true">` only sets `$_ENV` and `putenv()`, NOT `$_SERVER`.

**Fix:** Use `<server>` tags in `phpunit.xml` instead of `<env>`:

```xml
<server name="DB_CONNECTION" value="sqlite"/>
<server name="DB_DATABASE" value=":memory:"/>
```

---

## Quick Debugging Checklist

When a test fails:

1. **500 error?** → Read the exception message in the test output
   - `Cannot instantiate enum` → Fix enum constructor (Pattern #1)
   - `undefined method ::fromString()` → Use `::from()` (Pattern #1)
   - `undefined method ->getValue()` → Use `->value` (Pattern #1)
   - `Class not found` → Fix namespace import (Pattern #3)
   - `NOT NULL constraint` → Add missing test data fields (Pattern #4)
   - `no such table` → Fix table name (Pattern #5)
   - `not instantiable` → Add service provider binding (Pattern #6)

2. **404 or empty results?** → Likely the course visibility filter
   - Add `created_by` to course data (Pattern #2)
   - Or give user `course.publish` capability for admin-level access

3. **Config not taking effect?** → Run `docker exec ubotz_backend php artisan config:clear`
