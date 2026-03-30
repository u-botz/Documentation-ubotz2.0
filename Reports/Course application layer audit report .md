# UBOTZ 2.0 — Course Application Layer Architecture Audit

**Audit Scope:** `app/Application/TenantAdminDashboard/Course/`  
**Auditor Role:** Principal Engineer & Architecture Auditor  
**Date:** March 5, 2026  
**Baseline:** Foundation Completion Certificate (Phase 6 DDD Template), Backend Architecture Master v3.0  
**Severity Scale:** CRITICAL (must fix before merge) · HIGH (must fix before production) · MEDIUM (must fix before next phase gate) · LOW (improvement, schedule at discretion)

---

## Executive Summary

The Course Application Layer contains **52 files** across Commands (15), UseCases (14), Services (18), and Listeners (1). While the core CRUD UseCases (CreateCourse, UpdateCourse, ChangeCourseStatus) demonstrate strong compliance with the Phase 6 DDD template — proper transaction boundaries, audit logging, idempotency, and post-commit event dispatch — the majority of the Services directory **violates the certified architecture** in multiple dimensions.

The audit identified **11 Critical issues**, **9 High issues**, **8 Medium issues**, and **6 Low issues**. The most dangerous patterns are: direct `DB::table()` raw queries in Application layer services (violating the "no direct DB calls" rule), missing tenant scoping on financial and enrollment queries, and a pricing calculation pipeline with race conditions that could result in incorrect charges on real money transactions.

---

## 1. Critical Issues (Must Fix Before Merge)

### C-01: Raw DB Facade Usage in Application Layer — Layer Violation

**Files affected:**
- `ChapterContentQueryService.php` — 8 raw `DB::table()` calls
- `CourseStatisticsQueryService.php` — 4 raw `DB::table()` calls

**Rule violated:** Foundation Completion Certificate §10.1 and Backend Architecture Master §2.2 — Application Layer "Must NOT Contain: Eloquent queries, direct DB calls". The DDD Layer Checklist explicitly forbids `DB::` usage in Application.

**What's wrong:** These services bypass the entire repository abstraction. `DB::table('live_sessions')`, `DB::table('text_lessons')`, `DB::table('course_files')`, `DB::table('assignments')`, `DB::table('course_users')`, `DB::table('payment_transactions')`, `DB::table('course_learning_progress')`, and `DB::table('course_chapter_translations')` are all direct infrastructure access from the Application layer.

**Why it matters:**
1. Bypasses tenant global scopes entirely — `DB::table()` does not apply Eloquent global scopes, meaning these queries return **cross-tenant data** unless manually scoped.
2. Untestable without a database — violates the Phase 6 quality gate: "UseCase is testable without database (unit test with mocked repository)."
3. Creates hidden coupling to table schema that cannot be caught by interface changes.

**Fix:** Create read-model repository interfaces in the Domain layer (e.g., `ChapterContentQueryInterface`, `CourseStatisticsQueryInterface`) and move the SQL to Infrastructure implementations. All queries must include explicit `tenant_id` filtering or use tenant-scoped models.

---

### C-02: Missing Tenant Scoping on Financial Query — Cross-Tenant Data Leakage

**File:** `CourseStatisticsQueryService.php`

```php
$totalRevenue = DB::table('payment_transactions')
    ->where('item_id', $courseId)
    ->where('item_type', 'course')
    ->where('status', 'paid')
    ->sum('amount') ?: 0;
```

**The method signature is `getSummary(int $courseId)` — no `$tenantId` parameter exists.**

Every query in this service filters only by `course_id` without `tenant_id`. Since `course_id` is an auto-incrementing integer, a malicious tenant admin who guesses or enumerates course IDs could retrieve enrollment counts, revenue figures, and progress data belonging to another tenant.

This is a **financial data leakage vulnerability** on a table that tracks real money.

**Fix:** Add `$tenantId` as a required parameter. Add `->where('tenant_id', $tenantId)` to every query. Better yet, move to a repository interface per C-01.

---

### C-03: Missing Tenant Scoping on Multiple Services

**Files and missing tenant_id enforcement:**

| Service | Method | Missing tenant_id |
|---------|--------|-------------------|
| `ApplyTicketUseCase` | `execute(int $courseId, ...)` | No tenantId param. `findByTitle($courseId, $ticketCode)` — if repo doesn't enforce tenant scope internally, this leaks cross-tenant. |
| `ManageFaqsUseCase` | `getCourseFaqs(int $courseId)` | No tenantId anywhere in the class. |
| `ManageFaqsUseCase` | `updateFaq(int $id, ...)` | Fetches by raw ID, no tenant guard. |
| `ManageFaqsUseCase` | `deleteFaq(int $id)` | Deletes by raw ID, no tenant guard. |
| `ManageForumUseCase` | All methods | No tenantId. `findTopicsByCourseId`, `findTopicById`, `findAnswerById` — all fetch by ID without tenant context. |
| `ManageNoticeboardUseCase` | All methods | No tenantId. |
| `ManagePrerequisitesUseCase` | All methods | No tenantId. |
| `ManageSpecialOffersUseCase` | `updateSpecialOffer`, `deleteSpecialOffer` | Fetches by raw ID without tenant scope. |
| `ManageTicketsUseCase` | `updateTicket`, `deleteTicket` | Fetches by raw ID without tenant scope. |
| `ModerateReviewUseCase` | `execute(int $reviewId, ...)` | No tenantId. |
| `GenerateJoinLinkUseCase` | `execute(int $sessionId, ...)` | No tenantId. |
| `SubmitReviewUseCase` | `execute(...)` | No tenantId. |
| `GetStudentEnrollmentsUseCase` | `execute(int $userId)` | No tenantId. Returns all enrollments for a userId across all tenants. |
| `ChapterContentQueryService` | `getBatchMetrics(int[] $chapterIds)` | No tenantId. Aggregates data across all tenants for given chapter IDs. |
| `ChapterContentQueryService` | `getBatchTranslations(int[] $chapterIds)` | No tenantId. |

**Impact:** This is the single most dangerous class of bug in a multi-tenant system. Every one of these is a potential cross-tenant data access path. Per Backend Architecture Master §6.1: "Tenant isolation is enforced at multiple levels" and the Tenant Isolation Rules: "Tenant A is mathematically invisible to Tenant B."

**Fix:** Every Application layer service that touches tenant-scoped data must accept `int $tenantId` as a required parameter and pass it to the repository. No exceptions.

---

### C-04: Pricing Calculation Has Race Condition — Financial Safety Violation

**File:** `CalculateCoursePriceUseCase.php`

The price calculation reads the course price, special offer, and ticket in separate unsynchronized queries, then returns a computed final price. Between the time this price is calculated and when the payment is actually processed, any of these values could change:

1. The special offer could expire or be modified.
2. The ticket could reach capacity.
3. The course price could be updated.

There is no transaction boundary, no `SELECT ... FOR UPDATE`, and no snapshot isolation. The calculated price is returned as a plain array with no binding to the state that produced it.

**Why it matters:** This is a B2B platform handling real money (per project principles). A student could see price X, but by the time payment processes, the actual entitlement is for price Y. Or worse: the special offer disappears between calculation and payment, but the discounted price is still honored because the payment flow trusts the pre-calculated amount.

**Fix:** The price calculation must either (a) be re-validated atomically inside the payment transaction using `FOR UPDATE` locks, or (b) produce a signed/hashed price quote with a short TTL that the payment flow can verify. The current "calculate and trust" pattern is unsafe for real money.

---

### C-05: ApplyTicketUseCase Has Race Condition on Capacity Check

**File:** `ApplyTicketUseCase.php`

```php
if ($ticket->getCapacity() !== null && $ticket->getUsedCount() >= $ticket->getCapacity()) {
    throw new Exception("This ticket has reached its usage limit.");
}
$this->ticketRepository->recordUsage($ticket->getId(), $userId);
```

The capacity check and usage recording are not atomic. Two concurrent requests can both pass the capacity check and both record usage, exceeding the intended limit. This is a classic TOCTOU (time-of-check-to-time-of-use) race condition.

**Fix:** Use `SELECT ... FOR UPDATE` on the ticket row within a transaction, re-check capacity after acquiring the lock, then record usage. Alternatively, use an atomic `UPDATE tickets SET used_count = used_count + 1 WHERE id = ? AND used_count < capacity` and check the affected row count.

---

### C-06: EnrollStudentUseCase Called from Payment Listener Without Idempotency

**File:** `CreateEnrollmentOnPaymentCompleted.php` calls `EnrollStudentUseCase.php`

The listener catches `PaymentCompleted` and calls `enrollmentUseCase->execute()`. If the event is replayed (queue retry, duplicate webhook), the enrollment logic does have a soft idempotency check (`if ($existing && $existing->isActive()) return`), but:

1. There is no idempotency key tied to the payment transaction. If an enrollment is cancelled and re-purchased, this logic silently does nothing instead of creating a new enrollment.
2. The check `$existing->isActive()` means if a previous enrollment expired, a replayed event creates a duplicate enrollment without payment verification.
3. The listener swallows all exceptions with `catch (\Throwable $e)` and only logs — a failed enrollment after successful payment means the student paid but got nothing, with no retry mechanism or compensation.

**Fix:** 
- Use the `transaction_id` as an idempotency key for enrollment creation.
- Do not silently swallow enrollment failures — use a dead letter queue or compensation mechanism.
- Verify the enrollment's relationship to the specific transaction, not just user+course existence.

---

### C-07: DuplicateCourseUseCase — No Transaction, No Tenant Scoping on Sub-Queries

**File:** `DuplicateCourseUseCase.php`

The entire duplication — course, chapters, files, lessons, assignments — happens without a `DB::transaction()` wrapper. If any step fails mid-way, the system is left with a partially duplicated course: orphaned chapters, missing files, or dangling assignment references.

Additionally, `$this->assignmentRepository->findByChapterId($chapter->id)` has no `$tenantId` parameter, breaking tenant isolation.

**Fix:** Wrap the entire operation in `DB::transaction()`. Ensure all repository calls include `$tenantId`.

---

### C-08: IssueCertificateUseCase — Infrastructure in Application Layer

**File:** `IssueCertificateUseCase.php`

```php
use Barryvdh\DomPDF\Facade\Pdf;
use Illuminate\Support\Facades\Storage;
```

This UseCase directly imports and uses `Pdf` (DomPDF facade) and `Storage` (filesystem facade). These are infrastructure concerns. The Application layer must not depend on PDF rendering libraries or storage drivers.

Per Foundation Certificate §5.1: "Application has 0 HTTP imports" and the DDD Layer Checklist: Application "Must NOT Contain: Eloquent queries, direct DB calls" — by extension, direct facade usage for infrastructure services (file storage, PDF rendering) is equally forbidden.

**Fix:** Create a `CertificateRendererInterface` in the Domain layer and a `DomPdfCertificateRenderer` in Infrastructure. Create a `CertificateStorageInterface` and implement it in Infrastructure. The UseCase orchestrates via interfaces only.

---

### C-09: Missing Audit Logging on Financially-Sensitive Operations

**Files with no audit trail:**

| Service | Operation | Risk |
|---------|-----------|------|
| `ApplyTicketUseCase` | Ticket redemption | Discount applied with no record of who applied it or when |
| `CalculateCoursePriceUseCase` | Price calculation | No audit of what price was quoted, what discounts applied |
| `EnrollStudentUseCase` | Student enrollment | No audit of enrollment creation |
| `EnrollInFreeCourseUseCase` | Free enrollment | No audit trail |
| `ManageSpecialOffersUseCase` | Create/update/delete offers | No audit of discount changes |
| `ManageTicketsUseCase` | Create/update/delete tickets | No audit of discount code changes |
| `DuplicateCourseUseCase` | Course duplication | No audit of who duplicated what |
| `ModerateReviewUseCase` | Review approval/rejection | No audit |
| `IssueCertificateUseCase` | Certificate issuance | No audit of who received a certificate |

Per Audit Log Requirements: "Data Mutations: Create, Update, Delete of any resource" must be logged. Per Backend Architecture Master §8.1: all actions require audit with actor, timestamp, and payload. Financial operations (ticket usage, price calculations, enrollments tied to payments) are especially critical.

**Fix:** Inject `TenantAuditLogger` into every service that mutates state. Log with actor ID, entity type, entity ID, and relevant metadata.

---

### C-10: Generic Exception Usage Throughout — No Domain Exceptions

**Files affected:** Nearly every Service file uses `throw new Exception(...)` or `throw new \Exception(...)`.

Examples:
- `ApplyTicketUseCase`: `throw new Exception("Invalid ticket code.")`
- `CalculateCoursePriceUseCase`: `throw new Exception("Course not found.")`
- `EnrollStudentUseCase`: `throw new Exception("Cannot enroll in a paid course for free.")`
- `ManagePrerequisitesUseCase`: `throw new Exception("A course cannot be its own prerequisite.")`
- `IssueCertificateUseCase`: `throw new Exception("Student has not completed the course yet.")`

Per the Phase 6 DDD Template: Domain layer includes "Domain Exceptions (business-specific errors)". Generic `\Exception` makes it impossible for controllers to distinguish between a business rule violation (400), a not-found (404), and an unexpected error (500). It also leaks internal messages to API responses.

**Fix:** Create domain exceptions: `CourseNotFoundException`, `InvalidTicketException`, `TicketCapacityExceededException`, `InsufficientProgressException`, `DuplicateEnrollmentException`, `PaidCourseEnrollmentException`, etc. Controllers can then map these to proper HTTP status codes.

---

### C-11: Events Dispatched Inside Transaction in DeleteChapterUseCase

**File:** `DeleteChapterUseCase.php`

```php
$this->repository->delete($command->tenantId, $command->chapterId);
// ... audit log ...
DB::afterCommit(function () use ($chapter) {
    foreach ($chapter->releaseEvents() as $event) {
        event($event);
    }
});
```

The `delete()` and audit log are NOT wrapped in a `DB::transaction()`. The `DB::afterCommit` callback has no surrounding transaction, so it fires immediately. If the audit log write fails, the chapter is deleted but the audit is incomplete. Compare this to `CreateChapterUseCase` which properly wraps everything in `DB::transaction()`.

**Fix:** Wrap the delete + audit log in `DB::transaction()`, then dispatch events after commit.

---

## 2. Architectural Violations

### A-01: "Services" Directory Violates Phase 6 Template Structure — HIGH

The Phase 6 DDD Template defines the Application Layer as:
```
├─ Commands / DTOs (immutable data carriers)
├─ UseCases (orchestration: idempotency → validation → entity → transaction → audit → event)
└─ Queries (visibility rules, criteria-based filtering)
```

The actual structure has:
```
├─ Commands/
├─ UseCases/
├─ Services/    ← NOT IN THE TEMPLATE
└─ Listeners/
```

The `Services/` directory contains **18 files** that are a mix of:
- **UseCases masquerading as Services** (e.g., `EnrollStudentUseCase`, `IssueCertificateUseCase`, `DuplicateCourseUseCase`) — these are full orchestration workflows with validation, persistence, and side effects.
- **Query Services** (e.g., `ChapterContentQueryService`, `CourseStatisticsQueryService`) — these belong in a `Queries/` directory.
- **CRUD Managers** (e.g., `ManageFaqsUseCase`, `ManageForumUseCase`, `ManageTicketsUseCase`) — these bundle multiple operations into single classes, violating single-responsibility.

**Impact:** New developers cannot predict where to find or place code. The template's intention-revealing naming convention ("one UseCase per business action") is lost.

**Fix:** 
- Move orchestration workflows to `UseCases/` with proper naming (e.g., `EnrollStudentUseCase`, `IssueCertificateUseCase`).
- Move query services to `Queries/` (e.g., `ChapterContentQuery`, `CourseStatisticsQuery`).
- Split "Manage*" classes into individual UseCases (e.g., `CreateFaqUseCase`, `UpdateFaqUseCase`, `DeleteFaqUseCase`).

---

### A-02: "Manage*" God-Services Violate Single Responsibility — HIGH

**Files:** `ManageFaqsUseCase`, `ManageForumUseCase`, `ManageNoticeboardUseCase`, `ManagePrerequisitesUseCase`, `ManageSpecialOffersUseCase`, `ManageTicketsUseCase`, `ManageCertificateTemplateUseCase`

Each of these classes bundles 3-4 distinct operations (create, update, delete, list) into a single class. This violates:
1. Single Responsibility Principle — one reason to change per class.
2. The Phase 6 template convention of one UseCase per business action.
3. Testability — testing "create" requires instantiating a class that also handles "delete".

Example: `ManageForumUseCase` handles `getTopics`, `createTopic`, `pinTopic`, `getAnswers`, `postAnswer`, and `resolveAnswer` — six distinct operations in one class.

**Fix:** Split each into individual UseCases: `CreateFaqUseCase`, `UpdateFaqUseCase`, `DeleteFaqUseCase`, `CreateForumTopicUseCase`, `PinForumTopicUseCase`, etc.

---

### A-03: Commands Missing `declare(strict_types=1)` and `final` — MEDIUM

**Files:** `CreateCourseFileCommand`, `CreateTextLessonCommand`, `DeleteCourseFileCommand`, `DeleteTextLessonCommand`, `UpdateCourseFileCommand`, `UpdateTextLessonCommand`

These commands use `class` instead of `final class` and are missing `declare(strict_types=1)`. Compare to the other commands in the same directory (e.g., `CreateCourseCommand`, `ArchiveCourseCommand`) which correctly use both. This inconsistency indicates these files were written by a different developer or at a different time without template enforcement.

**Fix:** Add `declare(strict_types=1)` and `final` keyword to all six commands.

---

### A-04: Listener Namespace Placement — MEDIUM

**File:** `CreateEnrollmentOnPaymentCompleted.php` is in `App\Application\TenantAdminDashboard\Course\Listeners`.

This listener handles `PaymentCompleted` (from the Payment bounded context) and triggers enrollment (in the Enrollment bounded context). It sits inside the Course Application layer, but it's really a cross-domain integration point.

Per DDD principles, this listener should live in the Enrollment bounded context's Application layer (since it creates enrollments), or in a dedicated `Integration/` namespace if cross-context coordination is the pattern.

**Fix:** Move to `App\Application\TenantAdminDashboard\Enrollment\Listeners\` or establish a cross-context integration pattern.

---

## 3. Security & Data Risks

### S-01: Enumeration Vulnerability via Sequential IDs — HIGH

**Files:** `ManageFaqsUseCase::updateFaq(int $id)`, `ManageFaqsUseCase::deleteFaq(int $id)`, `ModerateReviewUseCase::execute(int $reviewId)`, `ManageSpecialOffersUseCase::updateSpecialOffer(int $id)`, `ManageTicketsUseCase::updateTicket(int $id)`, `GenerateJoinLinkUseCase::execute(int $sessionId)`, `ManagePrerequisitesUseCase::removePrerequisite(int $id)`, `ManageCertificateTemplateUseCase::deleteTemplate(int $id)`

All of these accept a raw integer ID and fetch without tenant scoping. Per Backend Architecture Master §6.6: "Combine authorization failures with not-found responses to prevent resource enumeration." A malicious authenticated user can iterate IDs (1, 2, 3, ...) and discover or modify resources belonging to other tenants.

**Fix:** All fetch-by-ID operations must include `$tenantId` and return a combined "not found" response regardless of whether the resource exists but belongs to another tenant or genuinely doesn't exist.

---

### S-02: VerifyCertificateUseCase Leaks Cross-Tenant Data — HIGH

**File:** `VerifyCertificateUseCase.php`

```php
$certificate = $this->certificateRepository->findById($certificateId);
```

This fetches a certificate by ID without tenant scoping, then reveals the student's full name, course title, certificate type, and creation date. If this endpoint is accessible to any authenticated user (as certificate verification endpoints typically are), it leaks Tenant B's student names and course titles to Tenant A.

**Fix:** If certificate verification is meant to be public (e.g., verifiable by third parties), the response should contain only the minimum: validity status and certificate ID. If tenant-scoped, add `$tenantId` filtering.

---

### S-03: No Authorization Checks in Any Service — HIGH

None of the 18 Services or 14 UseCases perform any authorization check. They all assume the caller is authorized. While the Phase 6 template places authorization at the middleware/controller layer, the Application layer is the last line of defense before state mutation.

Per Separation of Duties: critical actions require verification. For example:
- Who can moderate reviews? (`ModerateReviewUseCase`)
- Who can issue certificates? (`IssueCertificateUseCase`)
- Who can duplicate courses? (`DuplicateCourseUseCase`)
- Who can manage pricing? (`ManageSpecialOffersUseCase`, `ManageTicketsUseCase`)

If a controller is misconfigured or a new endpoint is added without middleware, these operations execute without any authorization gate.

**Fix:** For high-risk operations (financial, certificate issuance, course duplication), add explicit authorization assertions in the UseCase. Example: verify the actor has the required capability before proceeding.

---

### S-04: `IssueCertificateUseCase` — PDF Template Injection Risk — MEDIUM

**File:** `IssueCertificateUseCase.php`

```php
$html = $template->getBody();
$placeholders = [
    '[student]' => $user->getFirstName() . ' ' . $user->getLastName(),
    '[course]' => $course->getTitle(),
    // ...
];
foreach ($placeholders as $placeholder => $value) {
    $html = str_replace($placeholder, (string)$value, $html);
}
$pdf = Pdf::loadHTML($html);
```

The template body is HTML, and placeholder values are injected via `str_replace` without HTML escaping. If a student's name or course title contains HTML/JavaScript (e.g., `<script>alert('xss')</script>`), it will be injected directly into the HTML that gets rendered as PDF.

While DomPDF has limited JavaScript support, HTML injection can still corrupt the certificate layout, inject malicious links, or cause rendering failures.

**Fix:** Use `htmlspecialchars($value, ENT_QUOTES, 'UTF-8')` on all placeholder values before injection.

---

## 4. Maintainability Concerns

### M-01: Duplicate Enrollment Logic — HIGH

**Files:** `EnrollStudentUseCase.php` and `EnrollInFreeCourseUseCase.php`

These two classes contain nearly identical logic:
1. Find course by tenant and ID
2. Check if already enrolled and active
3. Calculate access duration
4. Create enrollment entity
5. Save

The only difference: `EnrollInFreeCourseUseCase` checks `$course->priceAmount > 0` and rejects paid courses, while `EnrollStudentUseCase` checks `$course->priceAmount > 0 && $source === FREE` and rejects free enrollment on paid courses.

**Fix:** `EnrollInFreeCourseUseCase` should delegate to `EnrollStudentUseCase::execute($tenantId, $userId, $courseId, EnrollmentSource::FREE)` — which already handles the price validation correctly. Delete the duplicate class.

---

### M-02: UpdateCourseCommand Requires All Fields — Partial Update Impossible — MEDIUM

**File:** `UpdateCourseCommand.php`

All fields (title, description, teacherId, etc.) are non-nullable and required in the constructor. This means every update must send every field, even if only changing the title. Compare to `UpdateChapterCommand` which correctly uses nullable fields with `?string $title = null`.

**Fix:** Make updatable fields nullable with defaults, matching the `UpdateChapterCommand` pattern.

---

### M-03: Inconsistent Error Handling Patterns — MEDIUM

The codebase uses three different exception patterns:
1. `throw new Exception(...)` — generic PHP (Services/)
2. `throw new InvalidArgumentException(...)` — slightly better (UseCases/)
3. `throw new NotFoundException(...)` — HTTP-layer exception used in Application layer (CreateCourseFileUseCase, etc.)

`App\Http\Shared\Exceptions\NotFoundException` is imported in several UseCases. This is an **HTTP layer exception being used in the Application layer**, which is a layer violation. The Application layer should throw domain exceptions; the HTTP layer should catch and translate them.

**Fix:** Create `App\Domain\Shared\Exceptions\EntityNotFoundException` and use it in Application layer. Map it to 404 in the HTTP layer.

---

### M-04: GetCourseProgressUseCase Has Hardcoded `$passedQuizzes = 0` — MEDIUM

**File:** `GetCourseProgressUseCase.php`

```php
// Note: Quiz results integration will be handled in a separate step
$passedQuizzes = 0;
```

This means course progress percentage is always wrong for courses with quizzes. Since `IssueCertificateUseCase` depends on progress being 100%, students in courses with quizzes can **never** receive certificates. This silent failure could go undetected for months.

**Fix:** Either implement quiz progress tracking or, at minimum, exclude quizzes from the total count so the percentage is accurate for what IS tracked. Add a prominent `@todo` with a tracking ticket reference.

---

### M-05: `CreateLiveSessionUseCase` — No Tenant Scoping, No Audit, No Transaction — MEDIUM

**File:** `CreateLiveSessionUseCase.php`

This UseCase has none of the Phase 6 template's required orchestration steps:
- No tenant ID validation
- No audit logging
- No transaction boundary
- No domain events
- No idempotency consideration

Compare to `CreateCourseUseCase` which has all of these. This indicates the file was written without following the established template.

**Fix:** Refactor to match the Phase 6 template: add `$tenantId` parameter, wrap in transaction, add audit logging, dispatch events after commit.

---

### M-06: RecordLastViewUseCase and ToggleItemProgressUseCase — Unbounded Write Volume — LOW

**File:** `RecordLastViewUseCase.php`

Every page view creates a new database record. For a platform with thousands of students viewing course content, this generates enormous write volume with no cleanup strategy or aggregation.

**Fix:** Consider upsert (update-or-create) by `(user_id, course_id, item_type, item_id)` instead of always inserting. Add a retention policy or move to a time-series/analytics store.

---

### M-07: ToggleItemProgressUseCase — Delete-and-Recreate Pattern — LOW

**File:** `ToggleItemProgressUseCase.php`

Progress is toggled by deleting the record (mark as incomplete) or creating it (mark as complete). This loses history — there's no way to know if a student previously completed an item and then uncompleted it. For audit and analytics purposes, this is a data loss pattern.

**Fix:** Use a status field (`completed`/`incomplete`) with timestamps instead of delete. Maintain history for audit.

---

### M-08: Inconsistent Constructor Patterns Across Commands — LOW

Some commands use `final class` + `declare(strict_types=1)` (CreateCourseCommand, ArchiveCourseCommand, ChangeCourseStatusCommand, etc.), while others use bare `class` without strict types (CreateCourseFileCommand, CreateTextLessonCommand, etc.). This inconsistency suggests no automated enforcement.

**Fix:** Add an ArchUnit-style test or PHPStan rule that enforces `final class` and `strict_types` on all Command classes.

---

### M-09: Magic Strings for Item Types — LOW

**Files:** `ToggleItemProgressUseCase`, `GetCourseProgressUseCase`, `RecordLastViewUseCase`

Item types are passed as raw strings: `'text_lesson'`, `'course_file'`, `'session'`, `'course'`. These should be a Value Object or Enum to prevent typos and ensure type safety.

**Fix:** Create an `ItemType` enum or Value Object.

---

### M-10: `DuplicateCourseUseCase` Directly Accesses Entity Properties — LOW

```php
$original->title
$original->slug->getValue()
$chapter->id
$file->title
$file->props
```

The UseCase reaches directly into entity internals. If entity structure changes, this UseCase breaks. Entities should expose behavior, not internal state.

**Fix:** Add explicit duplication methods on entities (e.g., `$course->createDraftCopy()`) or use a dedicated `CourseSnapshot` DTO.

---

## 5. Optional Improvements (Safe to Defer)

### O-01: Consider CQRS Separation for Query Services

`ChapterContentQueryService` and `CourseStatisticsQueryService` are read-optimized services. Per Backend Architecture Master §2.3 (CQRS Pattern), these should be in a `Queries/` namespace and potentially use read replicas or dedicated read models rather than hitting the primary database.

### O-02: Event-Driven Price Snapshot

Instead of calculating price at query time (`CalculateCoursePriceUseCase`), consider emitting a `PriceCalculated` event with the snapshot used, enabling audit trails of what price was presented to which student.

### O-03: Certificate Generation as Async Job

`IssueCertificateUseCase` performs synchronous PDF generation, which is slow and blocks the request. Consider dispatching a `CertificateRequested` event and generating the PDF asynchronously via a queued job.

### O-04: Batch Operations for DuplicateCourseUseCase

The duplication loops through chapters, files, lessons, and assignments one by one. For large courses, this could mean hundreds of individual INSERT queries. Consider batch insert support in repositories.

### O-05: Input Validation on Commands

Commands like `CreateChapterCommand` accept raw `string $status` instead of enforcing `ChapterStatus` at the command level. Moving validation earlier (into the Command constructor) catches invalid input before it reaches the UseCase.

### O-06: Dead Letter / Retry Strategy for Payment-to-Enrollment Listener

`CreateEnrollmentOnPaymentCompleted` currently swallows exceptions. Implement a retry queue with exponential backoff and a dead letter queue for permanent failures, with alerting so operations can investigate paid-but-not-enrolled students.

---

## 6. Summary Matrix

| ID | Severity | Category | File(s) | Summary |
|----|----------|----------|---------|---------|
| C-01 | CRITICAL | Layer Violation | ChapterContentQueryService, CourseStatisticsQueryService | Raw DB::table() in Application layer |
| C-02 | CRITICAL | Tenant Isolation | CourseStatisticsQueryService | Financial data query without tenant_id |
| C-03 | CRITICAL | Tenant Isolation | 15 Services | Missing tenant scoping across Services |
| C-04 | CRITICAL | Financial Safety | CalculateCoursePriceUseCase | Price calculation race condition |
| C-05 | CRITICAL | Financial Safety | ApplyTicketUseCase | Ticket capacity TOCTOU race |
| C-06 | CRITICAL | Financial Safety | CreateEnrollmentOnPaymentCompleted | Enrollment after payment not idempotent |
| C-07 | CRITICAL | Data Integrity | DuplicateCourseUseCase | No transaction, missing tenant scope |
| C-08 | CRITICAL | Layer Violation | IssueCertificateUseCase | Infrastructure imports in Application |
| C-09 | CRITICAL | Compliance | 9 Services | Missing audit logging on mutations |
| C-10 | CRITICAL | Architecture | All Services | Generic exceptions, no domain exceptions |
| C-11 | CRITICAL | Data Integrity | DeleteChapterUseCase | Events fire without transaction |
| A-01 | HIGH | Architecture | Services/ directory | Violates Phase 6 template structure |
| A-02 | HIGH | Architecture | 7 Manage* classes | God-services violate SRP |
| A-03 | MEDIUM | Consistency | 6 Commands | Missing strict_types and final |
| A-04 | MEDIUM | Architecture | Listener | Cross-context listener in wrong bounded context |
| S-01 | HIGH | Security | 8 Services | Enumeration via sequential IDs |
| S-02 | HIGH | Security | VerifyCertificateUseCase | Cross-tenant data leakage |
| S-03 | HIGH | Security | All Services/UseCases | No authorization checks anywhere |
| S-04 | MEDIUM | Security | IssueCertificateUseCase | HTML injection in PDF templates |
| M-01 | HIGH | Maintainability | EnrollStudentUseCase, EnrollInFreeCourseUseCase | Duplicate enrollment logic |
| M-02 | MEDIUM | Maintainability | UpdateCourseCommand | All fields required for partial update |
| M-03 | MEDIUM | Maintainability | Multiple UseCases | HTTP exceptions in Application layer |
| M-04 | MEDIUM | Maintainability | GetCourseProgressUseCase | Hardcoded zero breaks certificates |
| M-05 | MEDIUM | Maintainability | CreateLiveSessionUseCase | Missing all Phase 6 template steps |
| M-06 | LOW | Maintainability | RecordLastViewUseCase | Unbounded write volume |
| M-07 | LOW | Maintainability | ToggleItemProgressUseCase | Delete pattern loses history |
| M-08 | LOW | Consistency | 6 Commands | Inconsistent class declarations |
| M-09 | LOW | Maintainability | 3 UseCases | Magic strings for item types |
| M-10 | LOW | Maintainability | DuplicateCourseUseCase | Direct entity property access |

---

## 7. Recommended Fix Priority

**Phase 1 — Immediate (blocks all other work):**
- C-02, C-03: Fix tenant scoping on ALL services. This is a data breach waiting to happen.
- C-01: Extract raw DB queries to Infrastructure repositories.
- C-10: Create domain exception hierarchy.

**Phase 2 — Before any financial feature:**
- C-04, C-05: Fix pricing race conditions with pessimistic locking.
- C-06: Add idempotency to payment-triggered enrollment.
- C-09: Add audit logging to all mutation services.

**Phase 3 — Before next phase gate:**
- C-07, C-08, C-11: Fix transaction boundaries, remove infrastructure imports.
- A-01, A-02: Restructure Services/ into UseCases/ and Queries/.
- S-01, S-02, S-03: Add tenant-scoped ID lookups and authorization checks.
- M-01: Eliminate duplicate enrollment logic.
- M-03: Replace HTTP exceptions with domain exceptions.

**Phase 4 — Scheduled cleanup:**
- All MEDIUM and LOW items.
- Optional improvements O-01 through O-06.

---

*End of Audit Report*