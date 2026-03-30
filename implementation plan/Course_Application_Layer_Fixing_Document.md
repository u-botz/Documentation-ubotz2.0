# UBOTZ 2.0 — Course Application Layer Fixing Document

## Overview
This document serves as the actionable remediation plan for the 29 issues identified in the "Course Application Layer Architecture Audit" report (dated March 5, 2026). The fixes address critical layer violations, tenant isolation breaches, financial safety risks, and architectural inconsistencies against the Phase 6 DDD Template.

The plan is divided into 4 prioritized phases.

---

## Phase 1 — Immediate Remediation (Blockers)
*Focus: Security, Tenant Isolation, Layer Violations*

### 1. Enforce Strict Tenant Scoping (C-02, C-03, S-01, S-02)
**Vulnerability:** Major cross-tenant data leakage due to missing `$tenantId` parameters in queries, repositories, and enumeration endpoints.
**Actions:**
- **CourseStatisticsQueryService:** Add `int $tenantId` as a required parameter to `getSummary()`. Apply `->where('tenant_id', $tenantId)` to all queries.
- **Application Services (15 affected):** Add `int $tenantId` to the method signatures of:
  - `ApplyTicketUseCase`, `ManageFaqsUseCase`, `ManageForumUseCase`, `ManageNoticeboardUseCase`, `ManagePrerequisitesUseCase`, `ManageSpecialOffersUseCase`, `ManageTicketsUseCase`, `ModerateReviewUseCase`, `GenerateJoinLinkUseCase`, `SubmitReviewUseCase`, `GetStudentEnrollmentsUseCase`, `ChapterContentQueryService`, `VerifyCertificateUseCase`.
- **Enumeration Prevention:** Ensure all missing resources or resources belonging to another tenant return a uniform Domain Exception (mapped to 404 Not Found), avoiding 403s on unknown IDs.

### 2. Remove Raw DB Queries from Application Layer (C-01)
**Vulnerability:** Direct `DB::table()` calls bypass Eloquent global scopes, breaking tenant isolation, and violate DDD Application Layer rules.
**Actions:**
- Extract all raw DB interactions from `ChapterContentQueryService` and `CourseStatisticsQueryService`.
- Create new read-model Repository Interfaces (e.g., `CourseStatisticsQueryInterface`) in the `Domain` namespace.
- Implement these repositories in the `Infrastructure\Persistence\` layer using specific Eloquent query builder logic that respects global `/` explicit tenant scopes.

### 3. Implement Proper Domain Exceptions (C-10, M-03)
**Vulnerability:** Generic `\Exception` usage prevents accurate HTTP code mapping (400 vs 404). HTTP exceptions are imported into the Application layer.
**Actions:**
- Eradicate `\Exception` and `App\Http\Shared\Exceptions\NotFoundException` from the Application layer.
- Create specific Domain Exceptions within `App\Domain\TenantAdminDashboard\Shared\Exceptions` (or Course specifically), such as:
  - `EntityNotFoundException` (Mapped to 404)
  - `TicketCapacityExceededException`, `InvalidTicketException`, `DomainRuleViolationException` (Mapped to 400).
- Update controllers to map these domain exceptions to appropriate HTTP responses.

---

## Phase 2 — Financial & Mutational Safety
*Focus: Race conditions, idempotency, audit trails.*

### 1. Resolve Pricing and Capacity Race Conditions (C-04, C-05)
**Actions:**
- **CalculateCoursePriceUseCase & Payment Flow:** Implement pessimistic locking. The actual payment completion flow must lock (`SELECT ... FOR UPDATE`) the Ticket and Special Offer rows to guarantee valid discounts before persisting the transaction. Alternatively, emit a short-TTL signed "Price Quote" DTO.
- **ApplyTicketUseCase:** Wrap the capacity check and usage increment inside a `DB::transaction()`. Lock the ticket row with `FOR UPDATE` before evaluating `$ticket->getUsedCount() >= $ticket->getCapacity()`.

### 2. Impose Idempotency in Payment-to-Enrollment Flow (C-06)
**Actions:**
- **CreateEnrollmentOnPaymentCompleted:** Pass the `$transaction->getId()` into `EnrollStudentUseCase` as an explicit `$idempotencyKey`.
- **EnrollStudentUseCase:** Validate the idempotency key. Do not swallow exceptions with a generic `catch (\Throwable $e)`; instead, implement a dead-letter/retry queue strategy to prevent paid students from failing enrollment silently.

### 3. Mandate Audit Logging for Mutations (C-09)
**Actions:**
- Inject `TenantAuditLogger` (or equivalent) into all mutational UseCases (e.g., `ApplyTicketUseCase`, `EnrollStudentUseCase`, `ModerateReviewUseCase`, `IssueCertificateUseCase`, `DuplicateCourseUseCase`).
- Log the Actor ID, Target Entity ID, and the payload (e.g., "Ticket Code Applied") for full compliance.

---

## Phase 3 — Architectural Compliance & Transaction Boundaries
*Focus: Correcting structural deviations from the Phase 6 DDD Template.*

### 1. Restructure Services Directory (A-01, A-02, C-08, A-04)
**Actions:**
- **Dismantle "Manage*" God-Classes:** Split classes like `ManageFaqsUseCase` and `ManageForumUseCase` into SRP-compliant classes (`CreateFaqUseCase`, `UpdateFaqUseCase`, `DeleteFaqUseCase`).
- **Relocate Classes:** 
  - Move Orchestration workflows into the `UseCases/` directory.
  - Move Data retrieval services into a new `Queries/` directory.
- **IssueCertificateUseCase:** Remove DomPDF (`Pdf` facade) and `Storage` facade from the Application layer. Define `CertificateRendererInterface` and `CertificateStorageInterface` in Domain and implement them in Infrastructure.
- **Relocate Listeners:** Move `CreateEnrollmentOnPaymentCompleted` out of the Course Application layer to the Enrollment Bounded Context or a dedicated `Integration` layer.

### 2. Safeguard Cross-Table Mutations with Transactions (C-07, C-11, M-05)
**Actions:**
- **DuplicateCourseUseCase:** Wrap the entire chapter, lesson, and assignment loop in a single `DB::transaction()`. Add `$tenantId` to all sub-queries (e.g., `$this->assignmentRepository->findByChapterId`).
- **DeleteChapterUseCase:** Move the cache clearing, deletion, and audit logging into a `DB::transaction()`, keeping `event()` dispatches in `DB::afterCommit`.
- **CreateLiveSessionUseCase:** Bring up to Phase 6 standards by injecting `$tenantId`, wrapping in a transaction, adding audit logging, and deferring domain event dispatching.

### 3. Remove Redundant Logic (M-01)
**Actions:**
- Delete `EnrollInFreeCourseUseCase`. Refactor callers to invoke `EnrollStudentUseCase::execute(..., EnrollmentSource::FREE)`, which intrinsically enforces the zero-price requirement.

---

## Phase 4 — Code Quality, Robustness & Cleanup (Scheduled)
*Focus: Maintainability, Type Safety, and Optimization.*

### 1. Consistency and Typing (A-03, M-02, M-04, M-08, M-09, M-10)
- Add `final class` and `declare(strict_types=1)` to all Commands (e.g., `CreateCourseFileCommand`).
- Convert `UpdateCourseCommand` constructor properties to strictly typed `?nullable` parameters to support partial updates.
- Refactor Magic Strings (`'text_lesson'`, `'course_file'`) into an `ItemType` Value Object or Enum.
- Update `DuplicateCourseUseCase` to invoke encapsulation-respecting duplication methods on Entities (e.g., `$course->createDraftClone()`) instead of reading internal entity properties.
- **Certificate Blocker (M-04):** Rectify the hardcoded `$passedQuizzes = 0` in `GetCourseProgressUseCase` so students can achieve 100% progress and generate certificates.

### 2. UI Safety and Authorization (S-03, S-04)
- **PDF Generation XSS:** Apply `htmlspecialchars($value, ENT_QUOTES, 'UTF-8')` to all placeholder substitutions in the Infrastructure integration of `IssueCertificateUseCase` to neutralize HTML injection vulnerabilities.
- **Authorization Assertions:** Include Domain-level Capability verification blocks within destructive/sensitive UseCases (e.g., Pricing override, Course Archive).

### 3. Write Volume Profiling (M-06, M-07)
- **RecordLastViewUseCase:** Refactor repeated `INSERT`s into `upsert()` logic (`updateOrCreate`) to prevent unbounded table growth.
- **ToggleItemProgressUseCase:** Replace the current "Delete-and-Recreate" approach with explicit status fields (`completed` boolean, `completed_at` timestamp) to historically preserve audit and progress records.
