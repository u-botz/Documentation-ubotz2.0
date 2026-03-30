# Application Layer Remediation Plan

**Document Version:** 1.0
**Date:** March 5, 2026
**Scope:** All files in `app/Application/`
**Reference:** Ubotz 2 Developer Instruction Manual v1.0
**Priority Legend:** P0 = Security/Data Breach Risk, P1 = Architecture Violation, P2 = Convention Violation

---

## Executive Summary

An audit of 150+ PHP files in `backend/app/Application/` found **~130 violations** across 13 categories. The most critical issues are:

- **Direct Eloquent model usage** in Application layer (~50 instances)
- **9 "Manage*" god-classes** that the manual explicitly forbids
- **10 mutation UseCases with zero audit logging**
- **Auth UseCases** with massive infrastructure leaks (Eloquent, Cache, `request()` helper)
- **HTTP exceptions** thrown from Application layer (~10 instances)

This plan is organized into **8 phases**, ordered by severity. Each phase is independent and can be worked on by different developers in parallel (except Phase 1, which must go first as it establishes shared infrastructure needed by later phases).

---

## Phase 1: Shared Infrastructure (Prerequisite for All Other Phases)

**Priority:** P0
**Estimated Files Changed:** 5-8 new files
**Risk:** Low (additive only, no behavior changes)

Before refactoring individual UseCases, we need domain interfaces that they will depend on.

### Task 1.1: Create Missing Domain Interfaces

These interfaces are needed by multiple phases. They go in `app/Domain/`.

#### 1.1.1: `TenantUserRepositoryInterface` Audit

**File:** `app/Domain/TenantAdminDashboard/User/Repositories/TenantUserRepositoryInterface.php`

Verify this interface already exists and has these methods (it likely does based on `IssueCertificateUseCase` imports). If missing, create:

```php
interface TenantUserRepositoryInterface
{
    public function findById(int $tenantId, int $id): ?UserEntity;
    public function findByEmail(int $tenantId, string $email): ?UserEntity;
    public function save(UserEntity $user): UserEntity;
}
```

#### 1.1.2: `TenantAuthRepositoryInterface` (NEW)

**File:** `app/Domain/TenantAdminDashboard/Auth/Repositories/TenantAuthRepositoryInterface.php`

Needed to replace direct `UserRecord` queries in `LoginTenantUserUseCase` and `ChangeTenantUserPasswordUseCase`.

```php
interface TenantAuthRepositoryInterface
{
    public function findByEmail(int $tenantId, string $email): ?TenantAuthUser;
    public function findById(int $tenantId, int $id): ?TenantAuthUser;
    public function recordLoginSuccess(int $tenantId, int $userId, string $ipAddress): void;
    public function recordFailedAttempt(int $tenantId, int $userId): void;
    public function lockAccount(int $tenantId, int $userId, \DateTimeImmutable $until): void;
    public function changePassword(int $tenantId, int $userId, string $hashedPassword): void;
    public function clearForcePasswordReset(int $tenantId, int $userId): void;
    public function incrementTokenVersion(int $tenantId, int $userId): void;
}
```

#### 1.1.3: `TenantAuditLoggerInterface` (NEW)

**File:** `app/Domain/TenantAdminDashboard/Auth/Services/TenantAuthAuditLoggerInterface.php`

Needed to replace direct `TenantAuditLogRecord::create()` calls in Auth UseCases.

```php
interface TenantAuthAuditLoggerInterface
{
    public function logAuthEvent(int $tenantId, ?int $actorId, string $action, string $ipAddress, array $metadata = []): void;
}
```

#### 1.1.4: `TokenServiceInterface` (NEW)

**File:** `app/Domain/TenantAdminDashboard/Auth/Services/TokenServiceInterface.php`

Needed to replace direct `JWTAuth`, `auth('tenant_api')`, `Cache::lock()` usage.

```php
interface TokenServiceInterface
{
    public function issueToken(int $tenantId, int $userId): string;
    public function decodeResetToken(string $token): array; // returns ['user_id' => int, 'purpose' => string]
    public function invalidateToken(string $token): void;
}
```

#### 1.1.5: `SessionManagerInterface` (NEW)

**File:** `app/Domain/TenantAdminDashboard/Auth/Services/SessionManagerInterface.php`

```php
interface SessionManagerInterface
{
    public function recordSession(int $tenantId, int $userId, string $jti, int $expiresAt): void;
}
```

#### 1.1.6: `PasswordHasherInterface` (NEW)

**File:** `app/Domain/Shared/Services/PasswordHasherInterface.php`

Replaces direct `Hash::check()` / `Hash::make()` facade usage.

```php
interface PasswordHasherInterface
{
    public function hash(string $password): string;
    public function verify(string $password, string $hash): bool;
}
```

#### 1.1.7: `PdfGeneratorInterface` (NEW)

**File:** `app/Domain/TenantAdminDashboard/Certificate/Services/PdfGeneratorInterface.php`

Replaces direct `Pdf::loadHTML()` in `IssueCertificateUseCase`.

```php
interface PdfGeneratorInterface
{
    public function generateFromHtml(string $html): string; // returns raw PDF bytes
}
```

#### 1.1.8: `FileStorageInterface` (NEW)

**File:** `app/Domain/Shared/Services/FileStorageInterface.php`

Replaces direct `Storage::disk('public')->put()`.

```php
interface FileStorageInterface
{
    public function put(string $path, string $contents): void;
    public function delete(string $path): void;
    public function url(string $path): string;
}
```

#### 1.1.9: `TenantRoleRepositoryInterface` (NEW or VERIFY)

**File:** `app/Domain/TenantAdminDashboard/Role/Repositories/TenantRoleRepositoryInterface.php`

Needed to replace direct `TenantRoleRecord` usage in Role UseCases.

```php
interface TenantRoleRepositoryInterface
{
    public function findById(int $tenantId, int $id): ?TenantRoleEntity;
    public function findAll(int $tenantId): array;
    public function save(TenantRoleEntity $role): TenantRoleEntity;
    public function delete(int $tenantId, int $id): void;
    public function attachCapabilities(int $roleId, array $capabilityIds): void;
    public function syncCapabilities(int $roleId, array $capabilityIds): void;
}
```

### Task 1.2: Create Infrastructure Implementations

For each new interface above, create the corresponding Eloquent/Laravel implementation in `app/Infrastructure/`. These implementations contain the facade calls, Eloquent queries, etc. that are currently incorrectly placed in the Application layer.

**Files to create:**
- `app/Infrastructure/Persistence/TenantAdminDashboard/Auth/EloquentTenantAuthRepository.php`
- `app/Infrastructure/Services/TenantAuthAuditLogger.php`
- `app/Infrastructure/Services/JwtTokenService.php`
- `app/Infrastructure/Services/TenantSessionManagerAdapter.php`
- `app/Infrastructure/Services/LaravelPasswordHasher.php`
- `app/Infrastructure/Services/DomPdfGenerator.php`
- `app/Infrastructure/Services/LaravelFileStorage.php`
- `app/Infrastructure/Persistence/TenantAdminDashboard/EloquentTenantRoleRepository.php`

### Task 1.3: Register Bindings in ServiceProvider

**File:** `app/Providers/AppServiceProvider.php` (or domain-specific provider)

Register all new interface → implementation bindings.

---

## Phase 2: Tenant Auth UseCases (Security-Critical)

**Priority:** P0
**Estimated Files Changed:** 4 files refactored, 2 new exceptions
**Risk:** HIGH — Auth is security-critical. Requires thorough testing.
**Dependencies:** Phase 1 (interfaces + implementations)

### Task 2.1: Refactor `LoginTenantUserUseCase`

**File:** `app/Application/TenantAdminDashboard/Auth/UseCases/LoginTenantUserUseCase.php`

**Current violations (7):**
1. Imports `UserRecord` (Eloquent model) — lines 11, 37
2. Imports `TenantAuditLogRecord` (Eloquent model) — line 10, 139
3. Imports `TenantContext` (infrastructure) — line 12
4. Imports `TenantSessionManager` (concrete infrastructure) — line 13
5. Uses `Cache::lock()` facade — line 83
6. Uses `Hash::check()` facade — line 50
7. Uses `auth('tenant_api')` guard — line 87
8. Missing `final class`
9. Uses `Illuminate\Auth\AuthenticationException` instead of domain exception

**Fix instructions:**

1. Add `final` to class declaration
2. Replace constructor dependencies:
   - `TenantContext` → accept `int $tenantId` via the Command (see Task 2.3)
   - `TenantSessionManager` → inject `SessionManagerInterface`
   - Add `TenantAuthRepositoryInterface`
   - Add `TenantAuthAuditLoggerInterface`
   - Add `PasswordHasherInterface`
   - Add `TokenServiceInterface`
   - Keep `TenantQuotaServiceInterface` (already a domain interface)

3. Replace all `UserRecord::where(...)` with `$this->authRepository->findByEmail($tenantId, ...)`
4. Replace `Hash::check()` with `$this->passwordHasher->verify()`
5. Replace `Cache::lock()` + `auth('tenant_api')` block with `$this->tokenService->issueToken()`
6. Replace `$user->update([...])` calls with repository methods (`recordLoginSuccess`, `recordFailedAttempt`, `lockAccount`)
7. Replace `TenantAuditLogRecord::create()` with `$this->auditLogger->logAuthEvent()`
8. Replace `AuthenticationException` with new domain exception:

**New file:** `app/Domain/TenantAdminDashboard/Auth/Exceptions/InvalidCredentialsException.php`
```php
final class InvalidCredentialsException extends \DomainException
{
    public static function invalidCredentials(): self { return new self('Invalid credentials.'); }
    public static function accountLocked(): self { return new self('Account is temporarily locked.'); }
    public static function accountInactive(): self { return new self('Account is not active.'); }
}
```

9. Remove `$user->load('roleAssignments.role')` — this Eloquent eager-loading belongs in the repository. Add a `getUserRoleSlug(int $tenantId, int $userId): string` method to the auth repository.

### Task 2.2: Refactor `ChangeTenantUserPasswordUseCase`

**File:** `app/Application/TenantAdminDashboard/Auth/UseCases/ChangeTenantUserPasswordUseCase.php`

**Current violations (8):**
1. Imports `TenantAuditLogRecord` (Eloquent) — line 8
2. Imports `UserRecord` (Eloquent) — line 9
3. Imports `TenantContext` (infrastructure) — line 10
4. Uses `JWTAuth` facade — line 13
5. Uses `Hash::check()` / `Hash::make()` — line 12
6. Uses `request()->ip()` global helper — line 69
7. Missing `final class`
8. Uses `AuthenticationException` and `InvalidArgumentException` instead of domain exceptions

**Fix instructions:**

1. Add `final` to class declaration
2. Replace constructor: inject `TenantAuthRepositoryInterface`, `TokenServiceInterface`, `PasswordHasherInterface`, `TenantAuthAuditLoggerInterface`
3. Remove `TenantContext` — get `tenantId` from Command (see Task 2.3)
4. Replace `app('tymon.jwt.provider.jwt')->decode(...)` with `$this->tokenService->decodeResetToken($command->tempToken)`
5. Replace `UserRecord::find($userId)` with `$this->authRepository->findById($tenantId, $userId)`
6. Replace `Hash::check()` / `Hash::make()` with `$this->passwordHasher->verify()` / `->hash()`
7. Replace `$user->update([...])` with `$this->authRepository->changePassword()` + `->clearForcePasswordReset()` + `->incrementTokenVersion()`
8. Replace `request()->ip()` — add `ipAddress` to the Command (see Task 2.3)
9. Replace `TenantAuditLogRecord::create()` with `$this->auditLogger->logAuthEvent()`

**New file:** `app/Domain/TenantAdminDashboard/Auth/Exceptions/PasswordChangeException.php`
```php
final class PasswordChangeException extends \DomainException
{
    public static function invalidCurrentPassword(): self { ... }
    public static function newPasswordSameAsCurrent(): self { ... }
    public static function invalidResetToken(): self { ... }
}
```

### Task 2.3: Fix Tenant Auth Commands

**File:** `app/Application/TenantAdminDashboard/Auth/Commands/LoginTenantUserCommand.php`

Add `tenantId` as first parameter (currently missing — it relies on runtime `TenantContext`):
```php
final readonly class LoginTenantUserCommand
{
    public function __construct(
        public int $tenantId,      // ← ADD: was missing
        public string $email,
        public string $password,
        public string $ipAddress,
    ) {}
}
```

**File:** `app/Application/TenantAdminDashboard/Auth/Commands/ChangeTenantUserPasswordCommand.php`

Add `tenantId`, `actorId`, and `ipAddress`:
```php
final readonly class ChangeTenantUserPasswordCommand
{
    public function __construct(
        public int $tenantId,          // ← ADD
        public string $tempToken,
        public string $currentPassword,
        public string $newPassword,
        public ?int $actorId = null,   // ← ADD
        public string $ipAddress = '', // ← ADD (for audit)
    ) {}
}
```

### Task 2.4: Update Controllers Calling Auth UseCases

After changing Command signatures, update the controllers that create these Commands to pass `tenantId` (from `$request->user()->tenant_id` or middleware) and `ipAddress` (from `$request->ip()`).

**Test Plan:**
- Existing auth feature tests must still pass
- Add test: tenant A user cannot authenticate against tenant B context
- Add test: password change with invalid token returns domain exception, not HTTP exception

---

## Phase 3: Role UseCases (Complete Repository Bypass)

**Priority:** P0
**Estimated Files Changed:** 5 files refactored
**Risk:** Medium — Role management is sensitive but less frequently called than auth
**Dependencies:** Phase 1 (TenantRoleRepositoryInterface)

### Task 3.1: Refactor `CreateTenantRoleUseCase`

**File:** `app/Application/TenantAdminDashboard/Role/UseCases/CreateTenantRoleUseCase.php`

**Current violations (5):**
1. Imports `TenantRoleRecord` (Eloquent) — line 14, uses `TenantRoleRecord::create()` at line 58
2. Imports `TenantRoleCapabilityRecord` (Eloquent) — line 13, uses `::create()` at line 76
3. Uses `Illuminate\Support\Str` — line 16 (minor, but domain shouldn't depend on it)
4. Catches `\Illuminate\Database\QueryException` — line 67 (infrastructure concern)
5. Throws bare `\DomainException` with HTTP status code `409` embedded — line 69
6. Audit log is OUTSIDE transaction (line 86) — manual says it should be INSIDE

**Fix instructions:**

1. Inject `TenantRoleRepositoryInterface` instead of using Eloquent directly
2. Move `Str::slug()` generation into the domain entity or a value object (`RoleCode::fromDisplayName($name)`)
3. Move duplicate check into repository: `$this->roleRepository->existsByCode($tenantId, $code)` — throw `DuplicateRoleCodeException` if true
4. Replace `TenantRoleRecord::create()` with `$this->roleRepository->save($entity)`
5. Replace `TenantRoleCapabilityRecord::create()` loop with `$this->roleRepository->attachCapabilities($roleId, $capabilityIds)`
6. Move audit log INSIDE `DB::transaction()`, dispatch events AFTER
7. Return `TenantRoleEntity` instead of raw array — let the controller/resource handle formatting

**New file:** `app/Domain/TenantAdminDashboard/Role/Exceptions/DuplicateRoleCodeException.php`

### Task 3.2: Refactor `UpdateTenantRoleUseCase`

**File:** `app/Application/TenantAdminDashboard/Role/UseCases/UpdateTenantRoleUseCase.php`

Same pattern as Task 3.1. Replace all `TenantRoleRecord` direct queries with repository methods. Add audit logging inside transaction.

### Task 3.3: Refactor `DeleteTenantRoleUseCase`

**File:** `app/Application/TenantAdminDashboard/Role/UseCases/DeleteTenantRoleUseCase.php`

Replace `TenantRoleRecord` usage with repository. Add audit logging.

### Task 3.4: Refactor Role Queries

**Files:**
- `app/Application/TenantAdminDashboard/Role/Queries/ListTenantRolesQuery.php`
- `app/Application/TenantAdminDashboard/Role/Queries/GetActorHierarchyLevelQuery.php`

Both import `TenantRoleRecord` directly. Create a `TenantRoleQueryInterface` in Domain, implement in Infrastructure, inject into these Queries.

**Test Plan:**
- All role CRUD endpoints return correct data
- Test: creating duplicate role code throws `DuplicateRoleCodeException`
- Test: deleting system role is rejected
- Test: audit logs are created for each role mutation

---

## Phase 4: Split "Manage*" God-Classes (9 files)

**Priority:** P1
**Estimated Files Changed:** 9 files deleted, ~25 new files created
**Risk:** Medium — requires updating controller references
**Dependencies:** None (can be done in parallel with Phase 2/3)

The manual explicitly states: *"Why 'Manage*UseCase' is FORBIDDEN"*. Each must be split into single-operation UseCases.

### Task 4.1: Split `ManageFaqsUseCase`

**Current file:** `app/Application/TenantAdminDashboard/Course/UseCases/ManageFaqsUseCase.php`
**Methods:** `getCourseFaqs`, `createFaq`, `updateFaq`, `deleteFaq`

**Replace with:**

| New File | Method | Notes |
|---|---|---|
| `Queries/ListCourseFaqsQuery.php` | `execute(int $tenantId, int $courseId): array` | Read operation → Query class |
| `UseCases/CreateFaqUseCase.php` | `execute(CreateFaqCommand $cmd): FaqEntity` | Add `tenantId` + `actorId` to new Command. Add audit log. Wrap in `DB::transaction()` |
| `UseCases/UpdateFaqUseCase.php` | `execute(UpdateFaqCommand $cmd): FaqEntity` | Add audit log with old/new values |
| `UseCases/DeleteFaqUseCase.php` | `execute(DeleteFaqCommand $cmd): void` | Add audit log |

**New Commands needed:**
- `Commands/CreateFaqCommand.php` — `final readonly class` with `tenantId`, `courseId`, `title`, `answer`, `order`, `actorId`
- `Commands/UpdateFaqCommand.php` — `final readonly class` with `tenantId`, `id`, `title`, `answer`, `order`, `actorId`
- `Commands/DeleteFaqCommand.php` — `final readonly class` with `tenantId`, `id`, `actorId`

**Additional fix:** `createFaq()` currently does NOT accept `tenantId` (line 21 comment says "we don't need tenantId here"). This is a tenant isolation risk — fix it.

**Controller update:** Find the FAQ controller(s) that call `ManageFaqsUseCase` and update them to inject the individual UseCases/Queries instead.

### Task 4.2: Split `ManageForumUseCase`

**Current file:** `app/Application/TenantAdminDashboard/Course/UseCases/ManageForumUseCase.php`
**Methods:** `getTopics`, `createTopic`, `pinTopic`, `getAnswers`, `postAnswer`, `resolveAnswer` (6 methods!)

**Replace with:**

| New File | Notes |
|---|---|
| `Queries/ListForumTopicsQuery.php` | |
| `Queries/ListForumAnswersQuery.php` | |
| `UseCases/CreateForumTopicUseCase.php` | Add Command, audit log, `tenantId` |
| `UseCases/PinForumTopicUseCase.php` | Add Command, audit log |
| `UseCases/PostForumAnswerUseCase.php` | Add Command, audit log |
| `UseCases/ResolveForumAnswerUseCase.php` | Add Command, audit log |

**Additional fix:** `createTopic()` missing `tenantId` parameter (line 23). Same `pinTopic` creates entity via `new ForumTopicEntity(...)` constructor directly instead of using a domain method — should use `$topic->pin()` / `$topic->unpin()`.

### Task 4.3: Split `ManageNoticeboardUseCase`

**Current file:** `app/Application/TenantAdminDashboard/Course/UseCases/ManageNoticeboardUseCase.php`
**Methods:** `getCourseNoticeboards`, `createNoticeboard`, `deleteNoticeboard`, `markAsRead`

**Replace with:**

| New File | Notes |
|---|---|
| `Queries/ListCourseNoticeboardsQuery.php` | |
| `UseCases/CreateNoticeboardUseCase.php` | `createNoticeboard()` missing `tenantId` — fix. Add audit log. |
| `UseCases/DeleteNoticeboardUseCase.php` | Add audit log |
| `UseCases/MarkNoticeboardAsReadUseCase.php` | May not need audit for read-marking |

### Task 4.4: Split `ManagePrerequisitesUseCase`

**Current file:** `app/Application/TenantAdminDashboard/Course/UseCases/ManagePrerequisitesUseCase.php`
**Methods:** `addPrerequisite`, `removePrerequisite`

**Replace with:**

| New File | Notes |
|---|---|
| `UseCases/AddPrerequisiteUseCase.php` | Add Command with `tenantId`, `actorId`. Add audit log. |
| `UseCases/RemovePrerequisiteUseCase.php` | Add Command with `tenantId`, `actorId`. Add audit log. |

**Additional fix:** Uses `App\Domain\Shared\Exceptions\ValidationException` — verify this is a proper domain exception and not a framework one.

### Task 4.5: Split `ManageSpecialOffersUseCase`

**Current file:** `app/Application/TenantAdminDashboard/Course/UseCases/ManageSpecialOffersUseCase.php`
**Methods:** `createSpecialOffer`, `updateSpecialOffer`, `deleteSpecialOffer`

**Replace with:**

| New File | Notes |
|---|---|
| `UseCases/CreateSpecialOfferUseCase.php` | Add Command, audit log, `DB::transaction()` |
| `UseCases/UpdateSpecialOfferUseCase.php` | Replace bare `\Exception` (line 48) with `EntityNotFoundException`. Add audit. |
| `UseCases/DeleteSpecialOfferUseCase.php` | Add audit log |

### Task 4.6: Split `ManageTicketsUseCase`

**Current file:** `app/Application/TenantAdminDashboard/Course/UseCases/ManageTicketsUseCase.php`
**Methods:** `createTicket`, `updateTicket`, `deleteTicket`

**Replace with:**

| New File | Notes |
|---|---|
| `UseCases/CreateTicketUseCase.php` | Add Command, audit log, `DB::transaction()`. This is financial — needs idempotency key per manual Section 16. |
| `UseCases/UpdateTicketUseCase.php` | Replace bare `\Exception` (line 52) with domain exception. Add audit. |
| `UseCases/DeleteTicketUseCase.php` | Add audit log |

### Task 4.7: Split `ManageCertificateTemplateUseCase`

**Current file:** `app/Application/TenantAdminDashboard/Course/UseCases/ManageCertificateTemplateUseCase.php`
**Methods:** `createTemplate`, `updateTemplate`, `deleteTemplate`

**Replace with:**

| New File | Notes |
|---|---|
| `UseCases/CreateCertificateTemplateUseCase.php` | Add Command, audit log |
| `UseCases/UpdateCertificateTemplateUseCase.php` | Comment on line 33 says "Ideally we should verify existence and tenant ownership here" — DO IT. Add audit. |
| `UseCases/DeleteCertificateTemplateUseCase.php` | Add audit log |

### Task 4.8: Refactor Assignment God-Classes

**Files (in wrong directory `Services/`):**
- `app/Application/TenantAdminDashboard/Assignment/Services/CreateAssignmentUseCase.php` — has 3 public methods (`execute`, `executeIndex`, `executeShow`)
- `app/Application/TenantAdminDashboard/Assignment/Services/SubmitAssignmentMessageUseCase.php` — has 4 public methods
- `app/Application/TenantAdminDashboard/Assignment/Services/GradeSubmissionUseCase.php` — uses bare `Exception`

**Step 1:** Create proper directory: `app/Application/TenantAdminDashboard/Assignment/UseCases/` and `app/Application/TenantAdminDashboard/Assignment/Queries/`

**Step 2:** Split into:

| New File | Source | Notes |
|---|---|---|
| `UseCases/CreateAssignmentUseCase.php` | `Services/CreateAssignmentUseCase::execute()` | Add Command, audit log. `executeIndex` and `executeShow` should NOT be in this class. |
| `Queries/ListChapterAssignmentsQuery.php` | `Services/CreateAssignmentUseCase::executeIndex()` | Missing `tenantId` — `findByChapterId($chapterId)` has no tenant scope! **P0 tenant isolation bug.** |
| `Queries/GetAssignmentQuery.php` | `Services/CreateAssignmentUseCase::executeShow()` | |
| `UseCases/SubmitAssignmentMessageUseCase.php` | `Services/SubmitAssignmentMessageUseCase::execute()` | Replace bare `Exception` (line 37). Add `tenantId` to Command. |
| `Queries/ListAssignmentSubmissionsQuery.php` | `Services/SubmitAssignmentMessageUseCase::executeGetSubmissions()` | Missing `tenantId`! **P0 bug.** |
| `Queries/GetStudentSubmissionQuery.php` | `Services/SubmitAssignmentMessageUseCase::executeGetStudentSubmission()` | |
| `Queries/ListSubmissionMessagesQuery.php` | `Services/SubmitAssignmentMessageUseCase::executeGetMessages()` | |
| `UseCases/GradeSubmissionUseCase.php` | `Services/GradeSubmissionUseCase::execute()` | Replace bare `Exception`. Add `tenantId` to method/Command. `findSubmissionById($submissionId)` has NO tenant scope — **P0 tenant isolation bug.** Add audit log (grading is sensitive). |

**Step 3:** Delete the old `Services/` directory after migration.

**Test Plan for all Phase 4:**
- Every controller that previously injected a `Manage*UseCase` must be updated
- Run all existing feature tests after each split to verify no regressions
- Write new tests for the audit log assertions on each new UseCase

---

## Phase 5: Fix `IssueCertificateUseCase` (Infrastructure Facades)

**Priority:** P1
**Estimated Files Changed:** 1 file refactored
**Dependencies:** Phase 1 (PdfGeneratorInterface, FileStorageInterface)

### Task 5.1: Refactor `IssueCertificateUseCase`

**File:** `app/Application/TenantAdminDashboard/Course/UseCases/IssueCertificateUseCase.php`

**Current violations (3):**
1. Imports `Barryvdh\DomPDF\Facade\Pdf` — line 15
2. Imports `Illuminate\Support\Facades\Storage` — line 16
3. Throws bare `Exception` — lines 40, 47

**Fix instructions:**

1. Replace `Pdf::loadHTML($html)` with `$this->pdfGenerator->generateFromHtml($html)` (inject `PdfGeneratorInterface`)
2. Replace `Storage::disk('public')->put(...)` with `$this->fileStorage->put(...)` (inject `FileStorageInterface`)
3. Replace `throw new Exception("Student has not completed...")` with `throw CertificateIssuanceException::courseNotCompleted($courseId)`
4. Replace `throw new Exception("No active course certificate template...")` with `throw CertificateIssuanceException::noActiveTemplate($tenantId)`

**New file:** `app/Domain/TenantAdminDashboard/Course/Exceptions/CertificateIssuanceException.php`

---

## Phase 6: Fix HTTP Exceptions in Application Layer (~10 files)

**Priority:** P1
**Estimated Files Changed:** ~10
**Dependencies:** None

These files throw `NotFoundHttpException`, `AccessDeniedHttpException`, or `BadRequestHttpException` from the Application layer. The manual says: *"The UseCase must not know it's being called from HTTP."*

### Task 6.1: Staff UseCases

**Files:**
- `app/Application/SuperAdminDashboard/Staff/UseCases/ActivateStaffUseCase.php`
- `app/Application/SuperAdminDashboard/Staff/UseCases/DeactivateStaffUseCase.php`
- `app/Application/SuperAdminDashboard/Staff/UseCases/UpdateStaffUseCase.php`

**Pattern in `ActivateStaffUseCase` (lines 29, 43, 45):**
```php
// CURRENT (wrong):
throw new NotFoundHttpException('Staff member not found.');
// ...
} catch (InsufficientAuthorityException $e) {
    throw new AccessDeniedHttpException($e->getMessage());
} catch (InvalidStatusTransitionException $e) {
    throw new BadRequestHttpException($e->getMessage());
}
```

**Fix:** Remove the try-catch entirely. The domain exceptions `InsufficientAuthorityException` and `InvalidStatusTransitionException` already exist — let them propagate. Map them in the Exception Handler or Controller:

```php
// FIXED (just let domain exceptions propagate):
$entity = $this->adminRepository->findById($command->targetId);
if (!$entity) {
    throw AdminNotFoundException::withId($command->targetId);
}
$activatedEntity = $entity->activate($command->actorAuthorityLevel);
// No more try-catch — domain exceptions propagate naturally
```

**New file (if not exists):** `app/Domain/SuperAdminDashboard/Staff/Exceptions/AdminNotFoundException.php`

**Handler mapping (add to `app/Exceptions/Handler.php`):**
```php
AdminNotFoundException::class => 404,
InsufficientAuthorityException::class => 403,
InvalidStatusTransitionException::class => 422,
```

### Task 6.2: Course UseCases

**Files:**
- `app/Application/TenantAdminDashboard/Course/UseCases/UpdateCourseUseCase.php` — throws `NotFoundHttpException`
- `app/Application/TenantAdminDashboard/Course/UseCases/ChangeCourseStatusUseCase.php` — throws `NotFoundHttpException`
- `app/Application/TenantAdminDashboard/Course/UseCases/CreateCourseFileUseCase.php` — imports `App\Http\Shared\Exceptions\NotFoundException`
- `app/Application/TenantAdminDashboard/Course/UseCases/CreateTextLessonUseCase.php` — imports HTTP exception
- `app/Application/TenantAdminDashboard/Course/UseCases/DeleteCourseFileUseCase.php` — imports HTTP exception
- `app/Application/TenantAdminDashboard/Course/UseCases/DeleteTextLessonUseCase.php` — imports HTTP exception

**Fix:** Replace all with `CourseNotFoundException::withId($courseId)` or `ChapterNotFoundException::withId($chapterId)` (domain exceptions that should already exist).

### Task 6.3: ExamHierarchy UseCases

**File:** `app/Application/TenantAdminDashboard/ExamHierarchy/UseCases/DeleteExamUseCase.php`

Throws `NotFoundHttpException` (line 25). Replace with `ExamNotFoundException::withId($examId)`.

Also imports `CourseRecord` (Eloquent model, line 12) — replace with repository call.

**Test Plan:** Verify that the Exception Handler correctly maps all new domain exceptions to the right HTTP status codes.

---

## Phase 7: Fix ExamHierarchy `auth()` Guard Access

**Priority:** P1
**Estimated Files Changed:** 4 (3 UseCases + 1 Command)
**Dependencies:** None

### Task 7.1: Add `actorId` to `ManageExamCommand`

**File:** `app/Application/TenantAdminDashboard/ExamHierarchy/Commands/ManageExamCommand.php`

Add `?int $actorId = null` property. Also rename this to two separate commands per naming convention:

**Better:** Split into `CreateExamCommand` and `UpdateExamCommand` (the current `ManageExamCommand` name violates naming conventions).

### Task 7.2: Remove `auth()` calls from UseCases

**Files:**
- `app/Application/TenantAdminDashboard/ExamHierarchy/UseCases/CreateExamUseCase.php` — line 38: `auth('tenant_api')->id()`
- `app/Application/TenantAdminDashboard/ExamHierarchy/UseCases/UpdateExamUseCase.php` — line 40: same
- `app/Application/TenantAdminDashboard/ExamHierarchy/UseCases/DeleteExamUseCase.php` — line 45: same

**Fix:** Replace `auth('tenant_api')->id() ?? 0` with `$command->actorId ?? 0` in all three files.

**Controller update:** Pass `actorId: $request->user()->id` when constructing the Command.

---

## Phase 8: Bulk Convention Fixes (~30 files)

**Priority:** P2
**Estimated Files Changed:** ~30
**Risk:** Low (mechanical changes)
**Dependencies:** None (can be done any time)

### Task 8.1: Add Missing `final` Keyword (~30 files)

These classes are missing `final`:

**Auth domain:**
- `RequestPasswordResetCommand.php` — `readonly class` → `final readonly class`
- `ResetPasswordCommand.php` — `readonly class` → `final readonly class`
- `InvalidResetTokenException.php` — `class` → `final class`
- `PasswordReusedException.php` — `class` → `final class`
- `LoginAdminUseCase.php` — `class` → `final class`
- `RequestPasswordResetUseCase.php` — `class` → `final class`
- `ResetPasswordUseCase.php` — `class` → `final class`
- `TenantPasswordResetRequiredException.php` — `class` → `final class`

**Shared:**
- `CrossTenantLeakageException.php` — `class` → `final class`
- `GetPlatformSettingsQuery.php` — `class` → `final class`
- `GetTenantUsageQuery.php` — `class` → `final class`

**SuperAdmin Staff:**
- `ForcePasswordResetCommand.php` — `readonly class` → `final readonly class`
- `UnlockAdminCommand.php` — `readonly class` → `final readonly class`
- `CreateStaffUseCase.php` — `class` → `final class`
- `DeactivateStaffUseCase.php` — `class` → `final class`
- `ForcePasswordResetUseCase.php` — `class` → `final class`
- `UnlockAdminUseCase.php` — `class` → `final class`
- `UpdateStaffUseCase.php` — `class` → `final class` (verify not already)

**SuperAdmin Tenant:**
- `CreateTenantConfigListener.php` — `class` → `final class`
- `ProvisionDefaultRolesListener.php` — `class` → `final class`
- `ListTenantsQuery.php` — `class` → `final class`
- `CreateTenantUseCase.php` — `class` → `final class`
- `UpdateTenantStatusUseCase.php` — `class` → `final class`

**SuperAdmin Subscription:**
- `DowngradeOverageListener.php` — `class` → `final class`

**TenantAdmin Auth:**
- `LoginTenantUserUseCase.php` — `class` → `final class`
- `ChangeTenantUserPasswordUseCase.php` — `class` → `final class`

### Task 8.2: Add Missing `declare(strict_types=1)` (6 files)

**Course Commands:**
- `CreateCourseFileCommand.php`
- `CreateTextLessonCommand.php`
- `DeleteCourseFileCommand.php`
- `DeleteTextLessonCommand.php`
- `UpdateCourseFileCommand.php`
- `UpdateTextLessonCommand.php`

**Course UseCases:**
- `CreateCourseFileUseCase.php`
- `CreateTextLessonUseCase.php`
- `DeleteCourseFileUseCase.php`
- `DeleteTextLessonUseCase.php`

Add `declare(strict_types=1);` as the first statement after `<?php`.

### Task 8.3: Fix Naming Convention Violations

1. **`CreateTenantUseCase::handle()`** → rename method to `execute()`
2. **`UpdateTenantStatusUseCase::handle()`** → rename method to `execute()`
3. **`ListAllSubscriptionsHandler`** → rename to `ListAllSubscriptionsQuery` if it's a query, or keep as-is if it's a CQRS handler (clarify intent)
4. **`ManageExamCommand`** → split into `CreateExamCommand` + `UpdateExamCommand` (covered in Phase 7)

### Task 8.4: Remove `fromRequestData()` Factory Methods from Commands

**Files:**
- `app/Application/SuperAdminDashboard/Tenant/Commands/CreateTenantCommand.php` — line 31
- `app/Application/SuperAdminDashboard/Tenant/Commands/UpdateTenantStatusCommand.php` — line 28

Commands must be pure data carriers with zero logic. Remove the `fromRequestData()` static methods. The controller should construct the Command directly.

### Task 8.5: Replace Generic Exceptions

| File | Current | Replace With |
|---|---|---|
| `ForcePasswordResetUseCase.php` | `\InvalidArgumentException` | `AdminNotFoundException` |
| `UnlockAdminUseCase.php` | `\InvalidArgumentException` | `AdminNotFoundException` |
| `UpdateTenantStatusUseCase.php` | `InvalidArgumentException` | `TenantNotFoundException` / `InvalidTenantStatusTransitionException` |
| `GatewayAssignSubscriptionPlanUseCase.php` | `\RuntimeException` | Domain-specific exception |
| `UpdateExamUseCase.php` | `\InvalidArgumentException` | `ExamNotFoundException` |
| `DuplicateCourseUseCase.php` | `Exception` | `CourseNotFoundException` |
| `EnrollStudentUseCase.php` | `Exception` | Domain-specific enrollment exception |
| `ManageTicketsUseCase.php` | `\Exception` | `TicketNotFoundException` |
| `ManageSpecialOffersUseCase.php` | `\Exception` | `SpecialOfferNotFoundException` |

### Task 8.6: Fix Remaining Eloquent Leaks in Queries

These Query classes directly import Eloquent models. Create read-model interfaces in Domain and implement in Infrastructure:

| File | Violation |
|---|---|
| `GetStaffMemberQuery.php` | Uses `AdminRecord::find()` |
| `GetPlatformSettingsQuery.php` | Uses `PlatformSettingRecord` |
| `GetTenantUsageQuery.php` | Uses `DB::table()` |
| `ListExamsQuery.php` | Uses `ExamRecord` |
| `GetQuizQuery.php` | Uses `QuizRecord` |
| `ListTenantRolesQuery.php` | Uses `TenantRoleRecord`, `TenantCapabilityRecord` |
| `GetActorHierarchyLevelQuery.php` | Uses `TenantRoleRecord` |
| `ListTenantAuditLogsQuery.php` | Uses `TenantAuditLogRecord` |
| `GetTenantUserQuery.php` | Uses `UserRecord` |
| `ListTenantUsersQuery.php` | Uses `UserRecord` |
| `GetTenantSettingsQuery.php` | Uses `TenantRecord` |
| `GetDashboardStatsQuery.php` | Uses `DB::table()` |

For each: define an interface in Domain (e.g., `StaffReadModelInterface`), implement in Infrastructure with the Eloquent queries, inject into the Query class.

### Task 8.7: Fix `ProvisionDefaultRolesListener` Infrastructure Leak

**File:** `app/Application/SuperAdminDashboard/Tenant/Listeners/ProvisionDefaultRolesListener.php`

This listener directly uses `TenantRoleRecord`, `TenantContext`, and `DB::table()`. This is the most complex listener to refactor because it needs to:

1. Set tenant context for the new tenant
2. Create system roles
3. Seed capabilities via pivot table

**Fix:** Create a `TenantProvisioningServiceInterface` in Domain with a `provisionDefaultRoles(int $tenantId): void` method. The Infrastructure implementation handles `TenantContext` setup, Eloquent operations, and raw DB queries.

### Task 8.8: Fix Payment UseCases

**Files:**
- `ProcessPaymentWebhookUseCase.php` — uses `Event::dispatch()` (line 66) and `Log::` facade (lines 28, 41, 48, 53, 68)

**Fix for Event:** Replace `Event::dispatch(new PaymentCompleted(...))` with collecting events and dispatching after transaction (standard pattern). Since there's no explicit transaction here, wrap the save + event in one.

**Fix for Log:** Create a `PaymentLoggerInterface` in Domain, implement in Infrastructure with Laravel's `Log` facade. Inject into UseCase.

---

## Execution Order & Dependencies

```
Phase 1 (Shared Infrastructure) ──────────────────────────────┐
    │                                                          │
    ├── Phase 2 (Auth) ← depends on Phase 1 interfaces        │
    │                                                          │
    ├── Phase 3 (Role) ← depends on Phase 1 interfaces        │
    │                                                          │
    └── Phase 5 (Certificate) ← depends on Phase 1 interfaces │
                                                               │
Phase 4 (Split God-Classes) ← independent, parallel OK ───────┤
                                                               │
Phase 6 (HTTP Exceptions) ← independent, parallel OK ─────────┤
                                                               │
Phase 7 (ExamHierarchy auth()) ← independent, parallel OK ────┤
                                                               │
Phase 8 (Bulk Convention Fixes) ← independent, parallel OK ───┘
```

**Recommended developer assignment:**
- Developer A: Phase 1 → Phase 2 → Phase 3 (sequential, security-critical)
- Developer B: Phase 4 (Tasks 4.1–4.4) + Phase 6
- Developer C: Phase 4 (Tasks 4.5–4.8) + Phase 7
- Developer D: Phase 5 + Phase 8

---

## Verification Checklist (Run After Each Phase)

```bash
# Inside Docker container:

# 1. No Illuminate imports in Domain layer
docker exec -it ubotz_backend grep -rn 'use Illuminate' app/Domain/
# Expected: 0 results

# 2. No DB::table() in Application layer
docker exec -it ubotz_backend grep -rn 'DB::table' app/Application/
# Expected: 0 results

# 3. No HTTP exceptions in Application layer
docker exec -it ubotz_backend grep -rn 'HttpException\|NotFoundHttpException\|AccessDeniedHttpException\|BadRequestHttpException' app/Application/
# Expected: 0 results

# 4. No Eloquent models imported in Application layer
docker exec -it ubotz_backend grep -rn 'Infrastructure\\Persistence' app/Application/
# Expected: 0 results (except AuditContext/AuditLogger which are shared infra)

# 5. No bare Exception in Application layer
docker exec -it ubotz_backend grep -rn 'throw new \\Exception\|throw new Exception\|use Exception;' app/Application/
# Expected: 0 results

# 6. No Manage* UseCases
docker exec -it ubotz_backend find app/Application -name 'Manage*UseCase.php'
# Expected: 0 results

# 7. No UseCases in Services/ directories
docker exec -it ubotz_backend find app/Application -path '*/Services/*UseCase.php'
# Expected: 0 results

# 8. All Commands have strict_types and final
docker exec -it ubotz_backend grep -rL 'declare(strict_types=1)' app/Application/*/Commands/ app/Application/*/*/Commands/
# Expected: 0 results

# 9. Run full test suite
docker exec -it ubotz_backend php artisan test
# Expected: All tests pass
```

---

## Risk Mitigation

| Risk | Mitigation |
|---|---|
| Controller breaks after UseCase split | Search all controller files for the old class name before deleting. Run tests after each split. |
| ServiceProvider binding missing | Create a checklist of every new interface. Register each binding immediately after implementation. |
| Auth refactor breaks login | Write feature tests for login flow BEFORE refactoring. Run after. |
| Tenant isolation bugs during refactor | Run tenant isolation tests after every Phase. Never merge without green tests. |
| Too many files changed at once | Each Phase is independently mergeable. Use feature branches per phase. |

---

*End of Document — Application Layer Remediation Plan v1.0*
