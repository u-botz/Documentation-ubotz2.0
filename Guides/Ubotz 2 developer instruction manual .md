# UBOTZ 2.0 — Developer Instruction Manual

**How to Write Code That Passes Architecture Review**

Document Version: 1.0  
Date: March 5, 2026  
Authority: Principal Engineer  
Audience: All Backend Developers (Internal + External Agency)  
Status: **MANDATORY** — Every developer must read before writing a single line of code.

---

> **Why This Document Exists**
>
> UBOTZ 1.0 failed because developers wrote code without architectural constraints. Business logic leaked into controllers. Tenant isolation depended on convention. Financial operations had no safety nets. The system became unmaintainable and was abandoned.
>
> UBOTZ 2.0 was rebuilt from scratch with strict architectural rules that took 6 working days and 7 quality gates to establish. This document ensures every developer writes code that respects those rules.
>
> **If you are unsure about anything in this document, ask before writing code. The cost of asking is 5 minutes. The cost of fixing an architectural violation after merge is 5 days.**

---

## Table of Contents

1. [The Mental Model](#1-the-mental-model)
2. [The Four Layers — What Goes Where](#2-the-four-layers--what-goes-where)
3. [How to Write a Command](#3-how-to-write-a-command)
4. [How to Write a UseCase](#4-how-to-write-a-usecase)
5. [How to Write a Query](#5-how-to-write-a-query)
6. [How to Write a Domain Entity](#6-how-to-write-a-domain-entity)
7. [How to Write a Value Object](#7-how-to-write-a-value-object)
8. [How to Write a Domain Event](#8-how-to-write-a-domain-event)
9. [How to Write a Domain Exception](#9-how-to-write-a-domain-exception)
10. [How to Write a Repository Interface](#10-how-to-write-a-repository-interface)
11. [How to Write an Eloquent Repository](#11-how-to-write-an-eloquent-repository)
12. [How to Write a Controller](#12-how-to-write-a-controller)
13. [How to Write a FormRequest](#13-how-to-write-a-formrequest)
14. [How to Write a Database Migration](#14-how-to-write-a-database-migration)
15. [Tenant Isolation — The Iron Rule](#15-tenant-isolation--the-iron-rule)
16. [Financial Safety — The Money Rules](#16-financial-safety--the-money-rules)
17. [Audit Logging — Every Mutation Gets Logged](#17-audit-logging--every-mutation-gets-logged)
18. [Error Handling — The Exception Hierarchy](#18-error-handling--the-exception-hierarchy)
19. [Naming Conventions — The Locked Table](#19-naming-conventions--the-locked-table)
20. [Forbidden Patterns — Instant Code Review Rejection](#20-forbidden-patterns--instant-code-review-rejection)
21. [The Pre-Commit Checklist](#21-the-pre-commit-checklist)
22. [The Complete UseCase Template](#22-the-complete-usecase-template)
23. [Common Mistakes and How to Fix Them](#23-common-mistakes-and-how-to-fix-them)

---

## 1. The Mental Model

Before writing any code, understand how dependencies flow in UBOTZ:

```
┌─────────────────────────────────────────────────────┐
│  HTTP Layer (Controllers, FormRequests, Resources)   │  ← Thin. No logic.
│  Depends on: Application Layer ONLY                  │
└──────────────────────┬──────────────────────────────┘
                       │ calls
┌──────────────────────▼──────────────────────────────┐
│  Application Layer (UseCases, Commands, Queries)     │  ← Orchestration.
│  Depends on: Domain Layer ONLY                       │
└──────────────────────┬──────────────────────────────┘
                       │ uses
┌──────────────────────▼──────────────────────────────┐
│  Domain Layer (Entities, VOs, Events, Repo Interfaces)│  ← Pure PHP. ZERO imports.
│  Depends on: NOTHING. This is the core.              │
└──────────────────────┬──────────────────────────────┘
                       │ implemented by
┌──────────────────────▼──────────────────────────────┐
│  Infrastructure Layer (Eloquent Repos, Models, APIs)  │  ← External world.
│  Implements: Domain interfaces                        │
└─────────────────────────────────────────────────────┘
```

**The Dependency Rule (Memorize This):**

| Direction | Allowed? | Why |
|-----------|----------|-----|
| Controller → Application | ✅ YES | Controller delegates to UseCase |
| Application → Domain | ✅ YES | UseCase uses Entities, Repos |
| Infrastructure → Domain | ✅ YES | Repository implements interface |
| Domain → Infrastructure | ❌ NEVER | Domain must never use Eloquent, Cache, Storage, facades |
| Domain → Application | ❌ NEVER | Domain doesn't know about UseCases |
| Controller → Domain | ❌ NEVER | Controller never touches entities directly |
| Application → HTTP | ❌ NEVER | UseCase never knows about Request/Response |
| Application → Infrastructure | ❌ NEVER | UseCase never uses DB::, Cache::, Storage::, Eloquent |

**If you are importing a class and it crosses a layer boundary that isn't allowed, STOP. You are about to create a violation.**

---

## 2. The Four Layers — What Goes Where

### Domain Layer (`app/Domain/{Context}/{Subdomain}/`)

| Directory | Contains | Rules |
|-----------|----------|-------|
| `Entities/` | Business objects with identity | Pure PHP. No Eloquent. No facades. Enforces invariants. |
| `ValueObjects/` | Immutable, self-validating data | Pure PHP. Validates in constructor. Throws on invalid. |
| `Events/` | Domain events (past tense facts) | Pure PHP. Recorded by entity. Never dispatched here. |
| `Exceptions/` | Business-specific error types | Extends `\DomainException` or custom base. Never generic `\Exception`. |
| `Repositories/` | Interfaces for data access | Interface only. No implementation. No Eloquent. |
| `Services/` | Pure domain logic operations | Pure PHP. No framework. Rare — most logic lives in entities. |

**Verification command:** `grep -rn 'use Illuminate' app/Domain/` → Must return **0 results**.

### Application Layer (`app/Application/{Context}/{Subdomain}/`)

| Directory | Contains | Rules |
|-----------|----------|-------|
| `Commands/` | Immutable data carriers for write operations | `final class`, `declare(strict_types=1)`, `readonly` properties, no logic. |
| `UseCases/` | One business workflow per class | Orchestrates: idempotency → validation → entity → transaction → audit → event. |
| `Queries/` | Read-optimized data retrieval | Visibility rules, criteria filtering. Returns DTOs or arrays, never entities. |
| `Listeners/` | Event handlers for cross-domain side effects | Handles domain events. Must be idempotent. |

**What is FORBIDDEN in Application Layer:**
- `DB::table()` — raw database queries
- `DB::select()` — raw SQL
- `Illuminate\Http\Request` — HTTP awareness
- `Storage::` — file system access
- `Cache::` — cache access
- `Mail::` — email sending
- `Pdf::` — PDF generation
- Any direct Eloquent model usage
- Any facade that touches external systems

**If you need to interact with an external system (storage, PDF, email, cache), define an INTERFACE in the Domain layer and inject it into the UseCase. The implementation lives in Infrastructure.**

### Infrastructure Layer (`app/Infrastructure/Persistence/{Context}/{Subdomain}/`)

| Directory | Contains | Rules |
|-----------|----------|-------|
| `Repositories/` | Eloquent repository implementations | Implements domain interface. Contains `toEntity()`/`fromEntity()` mappers. |
| `Models/` | Eloquent models (named `*Record`) | Persistence only. NOT a domain object. Named `CourseRecord`, not `Course`. |

### HTTP Layer (`app/Http/Controllers/Api/{Context}/{Subdomain}/`)

| Directory | Contains | Rules |
|-----------|----------|-------|
| `Controllers/` | Thin controllers (<20 lines per method) | Read/Write split. Delegates to UseCase. No business logic. |
| `Requests/` | FormRequest classes | Syntax validation only (required, string, max:255). No business rules. |
| `Resources/` | API response transformers | Shapes output. No logic. |

---

## 3. How to Write a Command

Commands are **immutable data carriers**. They carry input from the controller to the UseCase. They contain **zero logic**.

### Rules
1. Always `declare(strict_types=1)`
2. Always `final class`
3. All properties are `public readonly`
4. **Always include `int $tenantId` as the first parameter** for tenant-scoped operations
5. Include `?int $actorId` for audit trail (who did this?)
6. Use Value Objects for domain concepts when sensible, primitive types otherwise
7. No methods. No validation. No logic.

### Template

```php
<?php

declare(strict_types=1);

namespace App\Application\TenantAdminDashboard\Course\Commands;

final class CreateChapterCommand
{
    public function __construct(
        public readonly int $tenantId,          // ← ALWAYS FIRST for tenant-scoped
        public readonly int $courseId,
        public readonly string $title,
        public readonly string $status,
        public readonly array $translations,
        public readonly ?int $actorId = null,   // ← ALWAYS PRESENT for audit
    ) {}
}
```

### Common Mistakes

```php
// ❌ WRONG: Missing strict_types
class CreateFaqCommand { ... }

// ❌ WRONG: Missing final
class CreateFaqCommand { ... }

// ❌ WRONG: Missing tenantId
final class CreateFaqCommand
{
    public function __construct(
        public readonly int $courseId,     // Where is tenantId?
        public readonly string $title,
    ) {}
}

// ❌ WRONG: Contains logic
final class CreateFaqCommand
{
    public function __construct(
        public readonly int $tenantId,
        public readonly string $slug,
    ) {
        $this->slug = Str::slug($this->slug); // ❌ No logic in commands!
    }
}
```

---

## 4. How to Write a UseCase

A UseCase is **one business operation, one class, one public method**. It follows a fixed orchestration sequence.

### Rules
1. `declare(strict_types=1)`, `final class`
2. **One public method: `execute()`** — takes a Command, returns an Entity or void
3. Always inject dependencies via constructor (repository interfaces, audit logger)
4. Always accept `$tenantId` (directly or via Command)
5. **Fixed orchestration order:**
   - Step 1: Idempotency check (if applicable)
   - Step 2: Validation / authorization / precondition checks
   - Step 3: Entity creation or mutation (pure domain logic)
   - Step 4: Wrap in `DB::transaction()`
   - Step 5: Persist via repository
   - Step 6: Audit log (inside transaction)
   - Step 7: Collect domain events
   - Step 8: Dispatch events AFTER transaction commit
6. **Never swallow exceptions** — let them propagate
7. **One UseCase per file** — never combine create + update + delete in one class

### Template

```php
<?php

declare(strict_types=1);

namespace App\Application\TenantAdminDashboard\Course\UseCases;

use App\Application\TenantAdminDashboard\Course\Commands\CreateFaqCommand;
use App\Domain\TenantAdminDashboard\Course\Entities\FaqEntity;
use App\Domain\TenantAdminDashboard\Course\Repositories\FaqRepositoryInterface;
use App\Domain\TenantAdminDashboard\Course\Repositories\CourseRepositoryInterface;
use App\Domain\TenantAdminDashboard\Course\Exceptions\CourseNotFoundException;
use App\Infrastructure\Persistence\Shared\AuditContext;
use App\Infrastructure\Persistence\Shared\TenantAuditLogger;
use Illuminate\Support\Facades\DB;

final class CreateFaqUseCase
{
    public function __construct(
        private readonly FaqRepositoryInterface $faqRepository,
        private readonly CourseRepositoryInterface $courseRepository,
        private readonly TenantAuditLogger $auditLogger,
    ) {}

    public function execute(CreateFaqCommand $command): FaqEntity
    {
        // Step 1: No idempotency needed for FAQ creation

        // Step 2: Validate preconditions (tenant-scoped!)
        $course = $this->courseRepository->findById(
            $command->tenantId,    // ← ALWAYS pass tenantId
            $command->courseId
        );
        if ($course === null) {
            throw new CourseNotFoundException($command->courseId);
        }

        // Step 3: Domain entity creation
        $faq = FaqEntity::create(
            courseId: $command->courseId,
            title: $command->title,
            answer: $command->answer,
            order: $command->order,
        );

        // Step 4-7: Transaction wraps persistence + audit
        $result = DB::transaction(function () use ($faq, $command) {
            // Step 5: Persist
            $savedFaq = $this->faqRepository->save($faq);

            // Step 6: Audit (inside transaction)
            $this->auditLogger->log(new AuditContext(
                tenantId: $command->tenantId,
                userId: $command->actorId ?? 0,
                action: 'faq.created',
                entityType: 'faq',
                entityId: $savedFaq->getId(),
                metadata: [
                    'title' => $savedFaq->getTitle(),
                    'course_id' => $command->courseId,
                ]
            ));

            // Step 7: Collect events
            $events = $faq->releaseEvents();

            return [$savedFaq, $events];
        });

        // Step 8: Dispatch events AFTER commit
        foreach ($result[1] as $event) {
            event($event);
        }

        return $result[0];
    }
}
```

### Why "Manage*UseCase" is FORBIDDEN

```php
// ❌ FORBIDDEN: God-class combining multiple operations
final class ManageFaqsUseCase
{
    public function createFaq(...) { ... }
    public function updateFaq(...) { ... }
    public function deleteFaq(...) { ... }
    public function listFaqs(...) { ... }
}

// ✅ CORRECT: One operation per class
final class CreateFaqUseCase { public function execute(CreateFaqCommand $cmd) { ... } }
final class UpdateFaqUseCase { public function execute(UpdateFaqCommand $cmd) { ... } }
final class DeleteFaqUseCase { public function execute(DeleteFaqCommand $cmd) { ... } }
```

**Why?** Single Responsibility. Each UseCase has exactly one reason to change. Testable in isolation. A new developer can find the operation in < 5 seconds by reading the filename.

---

## 5. How to Write a Query

Queries are for **read operations**. They live in `Application/{Context}/Queries/`.

### Rules
1. Queries return DTOs or arrays, **never domain entities**
2. **Always accept `int $tenantId`** as the first parameter
3. If the query needs database access, use a **repository interface** — NOT `DB::table()`
4. Name format: `List{Entities}Query` or `Get{Entity}Query`
5. Never mutate state inside a query

### Template

```php
<?php

declare(strict_types=1);

namespace App\Application\TenantAdminDashboard\Course\Queries;

use App\Domain\TenantAdminDashboard\Course\Repositories\CourseStatisticsQueryInterface;

final class GetCourseStatisticsQuery
{
    public function __construct(
        private readonly CourseStatisticsQueryInterface $statisticsQuery,
    ) {}

    public function execute(int $tenantId, int $courseId): array
    {
        return $this->statisticsQuery->getSummary($tenantId, $courseId);
    }
}
```

The `CourseStatisticsQueryInterface` is defined in Domain. The SQL implementation (using `DB::table()` or Eloquent) lives in **Infrastructure**.

### Why `DB::table()` is FORBIDDEN in Application Layer

```php
// ❌ FORBIDDEN: Raw DB in Application layer
final class ChapterContentQueryService
{
    public function getBatchMetrics(array $chapterIds): array
    {
        $sessionDurations = DB::table('live_sessions')  // ❌ Infrastructure leak!
            ->whereIn('chapter_id', $chapterIds)        // ❌ No tenant scoping!
            ->groupBy('chapter_id')
            ->select('chapter_id', DB::raw('SUM(duration) as total_duration'))
            ->get();
    }
}

// ✅ CORRECT: Interface in Domain, SQL in Infrastructure
// Domain:
interface ChapterMetricsQueryInterface
{
    public function getBatchMetrics(int $tenantId, array $chapterIds): array;
}

// Infrastructure:
final class EloquentChapterMetricsQuery implements ChapterMetricsQueryInterface
{
    public function getBatchMetrics(int $tenantId, array $chapterIds): array
    {
        // DB::table() is fine HERE — this IS the Infrastructure layer
        return DB::table('live_sessions')
            ->where('tenant_id', $tenantId)  // ← Tenant scoped!
            ->whereIn('chapter_id', $chapterIds)
            // ...
    }
}
```

---

## 6. How to Write a Domain Entity

Entities are the **heart of the business logic**. They enforce invariants and record domain events.

### Rules
1. **Pure PHP** — zero `use Illuminate\...` imports
2. Enforce all business rules in entity methods (not in UseCase, not in controller)
3. Record domain events via `$this->recordEvent()` — never dispatch them
4. Expose behavior, not raw state (prefer methods over public properties)
5. State transitions must validate allowed transitions
6. Entity must NEVER persist itself, call repositories, or dispatch events

### Template

```php
<?php

declare(strict_types=1);

namespace App\Domain\TenantAdminDashboard\Course\Entities;

use App\Domain\Shared\Aggregate\AggregateRoot;
use App\Domain\TenantAdminDashboard\Course\ValueObjects\CourseStatus;
use App\Domain\TenantAdminDashboard\Course\ValueObjects\CourseProps;
use App\Domain\TenantAdminDashboard\Course\Events\CourseCreated;
use App\Domain\TenantAdminDashboard\Course\Events\CourseStatusChanged;
use App\Domain\TenantAdminDashboard\Course\Exceptions\InvalidCourseStatusTransitionException;

final class CourseEntity extends AggregateRoot
{
    // Private constructor — use factory methods
    private function __construct(
        private readonly CourseProps $props,
    ) {}

    // Factory: Create new entity
    public static function create(CourseProps $props): self
    {
        $entity = new self($props);
        $entity->recordEvent(new CourseCreated(
            courseId: $props->id,
            tenantId: $props->tenantId,
            title: $props->title,
        ));
        return $entity;
    }

    // Factory: Reconstitute from persistence (no events)
    public static function reconstitute(CourseProps $props): self
    {
        return new self($props);
    }

    // Business method with invariant enforcement
    public function changeStatus(CourseStatus $newStatus, ?int $actorId): self
    {
        // Invariant: Validate allowed transition
        if (!$this->props->status->canTransitionTo($newStatus)) {
            throw new InvalidCourseStatusTransitionException(
                $this->props->status,
                $newStatus
            );
        }

        // Create new instance (immutability)
        $updated = new self($this->props->with(['status' => $newStatus]));

        // Record event
        $updated->recordEvent(new CourseStatusChanged(
            courseId: $this->props->id,
            oldStatus: $this->props->status->getValue(),
            newStatus: $newStatus->getValue(),
            actorId: $actorId,
        ));

        return $updated;
    }
}
```

### What Does NOT Belong in an Entity

```php
// ❌ WRONG: Entity dispatching events
$this->recordEvent(new CourseCreated(...));
event($this->releaseEvents()); // ❌ NEVER dispatch in entity!

// ❌ WRONG: Entity calling repository
$this->repository->save($this); // ❌ Entity doesn't know about repos!

// ❌ WRONG: Entity using Eloquent
use Illuminate\Database\Eloquent\Model; // ❌ NEVER in Domain layer!

// ❌ WRONG: Entity using facades
use Illuminate\Support\Facades\Cache; // ❌ NEVER in Domain layer!
Cache::put('course_' . $this->id, $this); // ❌ NO!
```

---

## 7. How to Write a Value Object

Value Objects are **immutable, self-validating** data containers with no identity.

### Rules
1. Pure PHP — no framework imports
2. Immutable — all properties are `readonly`, no setters
3. Self-validating — constructor throws on invalid input
4. Equal by value, not by reference
5. Always `final class`

### Template

```php
<?php

declare(strict_types=1);

namespace App\Domain\TenantAdminDashboard\Course\ValueObjects;

use App\Domain\TenantAdminDashboard\Course\Exceptions\InvalidCourseStatusTransitionException;

final class CourseStatus
{
    public const DRAFT = 'draft';
    public const PUBLISHED = 'published';
    public const ARCHIVED = 'archived';

    private const ALLOWED_VALUES = [
        self::DRAFT,
        self::PUBLISHED,
        self::ARCHIVED,
    ];

    private const ALLOWED_TRANSITIONS = [
        self::DRAFT => [self::PUBLISHED, self::ARCHIVED],
        self::PUBLISHED => [self::ARCHIVED],
        self::ARCHIVED => [],  // Terminal state
    ];

    public function __construct(
        private readonly string $value,
    ) {
        if (!in_array($value, self::ALLOWED_VALUES, true)) {
            throw new \InvalidArgumentException(
                "Invalid course status: {$value}. Allowed: " . implode(', ', self::ALLOWED_VALUES)
            );
        }
    }

    public function getValue(): string
    {
        return $this->value;
    }

    public function canTransitionTo(self $newStatus): bool
    {
        return in_array($newStatus->value, self::ALLOWED_TRANSITIONS[$this->value] ?? [], true);
    }

    public function equals(self $other): bool
    {
        return $this->value === $other->value;
    }
}
```

### Common Mistake: Magic Strings Instead of Value Objects

```php
// ❌ WRONG: Magic strings scattered in code
if ($status === 'active') { ... }
$this->toggleProgress($tenantId, $userId, $courseId, 'text_lesson', $itemId);

// ✅ CORRECT: Value Objects with type safety
if ($status->equals(ContentStatus::active())) { ... }
$this->toggleProgress($tenantId, $userId, $courseId, ItemType::TEXT_LESSON, $itemId);
```

---

## 8. How to Write a Domain Event

Domain Events are **past-tense facts** about something that happened.

### Rules
1. **Past tense always**: `CourseCreated`, `ChapterDeleted`, `EnrollmentActivated`
2. **Never imperative**: NOT `CreateCourse`, NOT `DeleteChapter`, NOT `ActivateEnrollment`
3. Pure PHP — no framework imports
4. Immutable — all properties `readonly`
5. Recorded by entity via `$this->recordEvent()` — never dispatched inside entity
6. Dispatched by UseCase AFTER `DB::transaction()` commits

### Template

```php
<?php

declare(strict_types=1);

namespace App\Domain\TenantAdminDashboard\Course\Events;

final class CourseCreated
{
    public function __construct(
        public readonly int $courseId,
        public readonly int $tenantId,
        public readonly string $title,
        public readonly \DateTimeImmutable $createdAt = new \DateTimeImmutable(),
    ) {}
}
```

### Event Dispatch — The ONLY Correct Pattern

```php
// In UseCase — events dispatched AFTER transaction
$result = DB::transaction(function () use ($command) {
    $entity = CourseEntity::create($props);  // Entity records event internally
    $saved = $this->repository->save($entity);
    $events = $entity->releaseEvents();      // Collect events
    return [$saved, $events];
});

// OUTSIDE transaction — safe to dispatch
foreach ($result[1] as $event) {
    event($event);
}
```

```php
// ❌ WRONG: Events dispatched INSIDE transaction
DB::transaction(function () use ($entity) {
    $this->repository->save($entity);
    foreach ($entity->releaseEvents() as $event) {
        event($event);  // ❌ If transaction rolls back, event already fired!
    }
});
```

---

## 9. How to Write a Domain Exception

Domain exceptions are **business-specific error types** that the HTTP layer maps to proper status codes.

### Rules
1. One exception per business error
2. Name describes the business reason: `CourseNotFoundException`, `TicketCapacityExceededException`
3. **Never use generic `\Exception`** — this makes it impossible to map errors to correct HTTP codes
4. Never use HTTP exceptions (`NotFoundHttpException`, `HttpException`) in Domain or Application layer
5. Place in `Domain/{Context}/{Subdomain}/Exceptions/`

### Template

```php
<?php

declare(strict_types=1);

namespace App\Domain\TenantAdminDashboard\Course\Exceptions;

final class CourseNotFoundException extends \DomainException
{
    public static function withId(int $courseId): self
    {
        return new self("Course not found: {$courseId}");
    }
}
```

### The Exception Map

| Business Situation | Domain Exception | HTTP Code |
|---|---|---|
| Resource not found (or not in this tenant) | `CourseNotFoundException` | 404 |
| Invalid state transition | `InvalidCourseStatusTransitionException` | 422 |
| Duplicate slug/key | `DuplicateCourseSlugException` | 409 |
| Business rule violation | `CoursePublishRequirementsNotMetException` | 422 |
| Capacity exceeded | `TicketCapacityExceededException` | 422 |
| Unauthorized | `InsufficientAuthorityException` | 403 |
| Race condition | `ConcurrencyException` | 409 |

### The HTTP Layer Maps Exceptions (in `app/Exceptions/Handler.php`)

```php
// ❌ WRONG: Using HTTP exceptions in Application layer
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;
throw new NotFoundHttpException("Course not found"); // ❌ HTTP awareness in Application!

// ✅ CORRECT: Domain exception in Application, mapped in HTTP layer
// In UseCase:
throw CourseNotFoundException::withId($courseId);

// In Handler.php or Controller:
catch (CourseNotFoundException $e) {
    return response()->json(['error' => 'Resource not available'], 404);
}
```

---

## 10. How to Write a Repository Interface

Repository interfaces define the **contract** for data access. They live in the Domain layer.

### Rules
1. Interface only — no implementation details
2. **Every method that accesses tenant-scoped data MUST accept `int $tenantId`**
3. Return domain entities or value objects, never Eloquent models
4. Never expose Eloquent query builder

### Template

```php
<?php

declare(strict_types=1);

namespace App\Domain\TenantAdminDashboard\Course\Repositories;

use App\Domain\TenantAdminDashboard\Course\Entities\FaqEntity;

interface FaqRepositoryInterface
{
    public function findById(int $tenantId, int $id): ?FaqEntity;

    public function findByCourseId(int $tenantId, int $courseId): array;

    public function save(FaqEntity $faq): FaqEntity;

    public function delete(int $tenantId, int $id): void;
}
```

### Critical Mistake: Missing `$tenantId`

```php
// ❌ DANGEROUS: No tenant scoping
interface FaqRepositoryInterface
{
    public function findById(int $id): ?FaqEntity;          // ❌ Cross-tenant leak!
    public function findByCourseId(int $courseId): array;    // ❌ Cross-tenant leak!
    public function delete(int $id): void;                   // ❌ Cross-tenant delete!
}

// ✅ SAFE: Tenant always scoped
interface FaqRepositoryInterface
{
    public function findById(int $tenantId, int $id): ?FaqEntity;
    public function findByCourseId(int $tenantId, int $courseId): array;
    public function delete(int $tenantId, int $id): void;
}
```

---

## 11. How to Write an Eloquent Repository

The Eloquent Repository **implements** the domain interface and lives in Infrastructure.

### Rules
1. Named `Eloquent{Entity}Repository`
2. Implements the domain interface
3. Contains `toEntity()` and `fromEntity()` mappers
4. Uses the `*Record` Eloquent model (e.g., `FaqRecord`, not `Faq`)
5. **Always scope queries by `tenant_id`** — even if using global scopes, belt-and-suspenders
6. Registered in a ServiceProvider binding

### Template

```php
<?php

declare(strict_types=1);

namespace App\Infrastructure\Persistence\TenantAdminDashboard\Course;

use App\Domain\TenantAdminDashboard\Course\Entities\FaqEntity;
use App\Domain\TenantAdminDashboard\Course\Repositories\FaqRepositoryInterface;

final class EloquentFaqRepository implements FaqRepositoryInterface
{
    public function findById(int $tenantId, int $id): ?FaqEntity
    {
        $record = FaqRecord::where('tenant_id', $tenantId)  // ← Explicit scope
            ->where('id', $id)
            ->first();

        return $record ? $this->toEntity($record) : null;
    }

    public function findByCourseId(int $tenantId, int $courseId): array
    {
        return FaqRecord::where('tenant_id', $tenantId)     // ← Explicit scope
            ->where('course_id', $courseId)
            ->orderBy('order')
            ->get()
            ->map(fn (FaqRecord $r) => $this->toEntity($r))
            ->toArray();
    }

    public function save(FaqEntity $faq): FaqEntity
    {
        $record = $faq->getId()
            ? FaqRecord::where('tenant_id', $faq->getTenantId())
                ->where('id', $faq->getId())
                ->firstOrFail()
            : new FaqRecord();

        $record->fill($this->fromEntity($faq));
        $record->save();

        return $this->toEntity($record);
    }

    public function delete(int $tenantId, int $id): void
    {
        FaqRecord::where('tenant_id', $tenantId)
            ->where('id', $id)
            ->delete();
    }

    private function toEntity(FaqRecord $record): FaqEntity
    {
        return FaqEntity::reconstitute(/* map fields */);
    }

    private function fromEntity(FaqEntity $entity): array
    {
        return [/* map fields */];
    }
}
```

---

## 12. How to Write a Controller

Controllers are **thin request coordinators**. Maximum 20 lines per method.

### Rules
1. Read/Write split: `{Entity}ReadController` and `{Entity}WriteController`
2. Maximum 20 lines per method (excluding comments)
3. **The only things a controller does:**
   - Accept the FormRequest
   - Build the Command from request input
   - Call the UseCase
   - Return the Response (using a Resource)
4. No business logic, no database access, no side effects

### Template

```php
<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\TenantAdminDashboard\Course;

use App\Application\TenantAdminDashboard\Course\Commands\CreateFaqCommand;
use App\Application\TenantAdminDashboard\Course\UseCases\CreateFaqUseCase;
use App\Http\Controllers\Controller;
use App\Http\Requests\TenantAdminDashboard\Course\CreateFaqRequest;
use Illuminate\Http\JsonResponse;

final class FaqWriteController extends Controller
{
    public function store(
        CreateFaqRequest $request,
        CreateFaqUseCase $useCase,
        int $courseId,
    ): JsonResponse {
        $command = new CreateFaqCommand(
            tenantId: $request->user()->tenant_id,
            courseId: $courseId,
            title: $request->input('title'),
            answer: $request->input('answer'),
            order: $request->input('order', 0),
            actorId: $request->user()->id,
        );

        $faq = $useCase->execute($command);

        return response()->json(new FaqResource($faq), 201);
    }
}
```

### What Does NOT Belong in a Controller

```php
// ❌ WRONG: Business logic in controller
public function store(Request $request): JsonResponse
{
    $course = Course::find($request->course_id);           // ❌ Direct Eloquent
    if ($course->status !== 'published') {                  // ❌ Business rule
        return response()->json(['error' => 'Cannot add FAQ to unpublished course'], 422);
    }
    $faq = Faq::create($request->all());                   // ❌ Mass assignment
    Mail::to($course->teacher)->send(new FaqAddedMail());  // ❌ Side effect
    return response()->json($faq);
}
```

---

## 13. How to Write a FormRequest

FormRequests do **syntax validation only**. Business rules belong in the Domain Entity.

### Rules
1. Validate data types, lengths, formats — NOT business logic
2. Never query the database in FormRequest
3. Never check business rules (like "can this course be published?")
4. Use the standard `authorize()` method for route-level authorization

### Template

```php
<?php

declare(strict_types=1);

namespace App\Http\Requests\TenantAdminDashboard\Course;

use Illuminate\Foundation\Http\FormRequest;

final class CreateFaqRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true; // Authorization handled by middleware/policy
    }

    public function rules(): array
    {
        return [
            'title'  => ['required', 'string', 'max:255'],
            'answer' => ['required', 'string', 'max:5000'],
            'order'  => ['sometimes', 'integer', 'min:0'],
        ];
    }
}
```

### What Does NOT Belong in a FormRequest

```php
// ❌ WRONG: Business logic in FormRequest
public function rules(): array
{
    return [
        'course_id' => [
            'required',
            Rule::exists('courses', 'id')->where('status', 'published'), // ❌ Business rule!
        ],
    ];
}
```

---

## 14. How to Write a Database Migration

### Rules
1. **No MySQL ENUMs** — use `VARCHAR(30)` with PHP enum validation
2. **Every tenant-scoped table has `tenant_id`** — `BIGINT UNSIGNED NOT NULL` with foreign key to `tenants(id)`
3. **Financial columns use `_cents` suffix** — `BIGINT UNSIGNED`, never `DECIMAL` or `FLOAT`
4. **Boolean columns use `is_`, `has_`, `can_` prefix**
5. **Index naming**: `idx_{table}_{columns}`, unique: `unq_{table}_{columns}`, foreign key: `fk_{table}_{ref}`
6. **Audit tables have NO `updated_at` column** — append-only
7. **Always include both `up()` and `down()` methods**
8. **Central tables** go in `database/migrations/central/`, **tenant tables** in `database/migrations/tenant/`

### Template: Tenant-Scoped Table

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('faqs', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('tenant_id');
            $table->unsignedBigInteger('course_id');
            $table->string('title', 255);
            $table->text('answer');
            $table->unsignedInteger('sort_order')->default(0);
            $table->timestamps();

            // Foreign keys
            $table->foreign('tenant_id', 'fk_faqs_tenants')
                ->references('id')->on('tenants')->onDelete('cascade');
            $table->foreign('course_id', 'fk_faqs_courses')
                ->references('id')->on('courses')->onDelete('cascade');

            // Indexes
            $table->index(['tenant_id', 'course_id'], 'idx_faqs_tenant_course');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('faqs');
    }
};
```

### Template: Financial Table

```php
$table->unsignedBigInteger('amount_cents')->default(0);       // ← _cents suffix
$table->unsignedBigInteger('tax_cents')->default(0);          // ← BIGINT UNSIGNED
$table->unsignedBigInteger('total_cents')->default(0);        // ← Never DECIMAL
$table->string('currency', 3)->default('INR');
$table->string('idempotency_key', 100)->unique()->nullable(); // ← Mandatory for financial
```

### BANNED in Migrations

```php
$table->enum('status', ['active', 'inactive']);  // ❌ BANNED — use VARCHAR
$table->decimal('amount', 10, 2);                // ❌ BANNED — use BIGINT _cents
$table->float('price');                          // ❌ BANNED — floating point money
```

---

## 15. Tenant Isolation — The Iron Rule

> **"Tenant A is mathematically invisible to Tenant B."**

This is the single most important security rule in the entire platform. Every violation is a potential data breach.

### The Three-Layer Defense

| Layer | Mechanism | What It Does |
|-------|-----------|-------------|
| 1. Middleware | `TenantContext` from JWT `tenant_id` claim | Sets the current tenant for the request |
| 2. Global Scope | `TenantScopedModel` adds `WHERE tenant_id = ?` | Auto-scopes all Eloquent queries |
| 3. Domain Guard | Entity validates `tenant_id` match | Prevents cross-entity cross-tenant operations |

### Your Responsibility as a Developer

Even with global scopes, you MUST:

1. **Accept `int $tenantId` in every UseCase and Repository method** that touches tenant data
2. **Pass `tenant_id` explicitly in every query** — belt-and-suspenders, never rely on global scope alone
3. **Never fetch by ID alone** — always filter by `(tenant_id, id)` pair

```php
// ❌ DANGEROUS: Fetching by ID alone
$faq = FaqRecord::find($id);                    // Bypasses tenant scope if scope is missing
$faq = FaqRecord::where('id', $id)->first();     // Same problem

// ✅ SAFE: Always include tenant_id
$faq = FaqRecord::where('tenant_id', $tenantId)
    ->where('id', $id)
    ->first();
```

### Why Global Scopes Are Not Enough

- `DB::table()` bypasses global scopes entirely
- `withoutGlobalScopes()` bypasses them intentionally
- Console commands run without tenant context
- Queue workers may run without tenant context
- A single forgotten `where('tenant_id')` clause = data breach

### The Test You Must Write

For every new tenant-scoped feature, write this test:

```php
/** @test */
public function tenant_a_cannot_access_tenant_b_data(): void
{
    $tenantA = Tenant::factory()->create();
    $tenantB = Tenant::factory()->create();

    $faqA = Faq::factory()->create(['tenant_id' => $tenantA->id]);
    $faqB = Faq::factory()->create(['tenant_id' => $tenantB->id]);

    // Acting as tenant A, try to access tenant B's FAQ
    $this->actingAsTenantAdmin($tenantA)
        ->getJson("/api/tenant/faqs/{$faqB->id}")
        ->assertNotFound();  // Must be 404, NOT 403 (prevents enumeration)
}
```

---

## 16. Financial Safety — The Money Rules

> **Assume real money is at risk. Every shortcut here costs actual money.**

### The Non-Negotiable Rules

1. **All amounts in cents** — `amount_cents BIGINT UNSIGNED`, never `DECIMAL`, never `FLOAT`
2. **Idempotency key on every financial write** — `UNIQUE(tenant_id, idempotency_key)` in the database
3. **Pessimistic locking on state transitions** — `SELECT ... FOR UPDATE` inside `DB::transaction()`
4. **Immutable after approval** — once a payment, invoice, or grade is finalized, it can NEVER be updated
5. **Audit trail on every financial operation** — who, what, when, old value, new value
6. **Never calculate prices outside a transaction** — TOCTOU (time-of-check-to-time-of-use) race conditions corrupt financial data

### Race Condition Example (What NOT to Do)

```php
// ❌ DANGEROUS: Check-then-act without locking
$ticket = $this->ticketRepo->findByCode($code);
if ($ticket->getUsedCount() >= $ticket->getCapacity()) {  // Check
    throw new CapacityExceededException();
}
$this->ticketRepo->recordUsage($ticket->getId(), $userId); // Act
// Two concurrent requests BOTH pass the check, BOTH record usage → capacity exceeded!

// ✅ SAFE: Atomic check-and-act
DB::transaction(function () use ($ticketId, $userId) {
    // Lock the row
    $ticket = DB::table('tickets')
        ->where('id', $ticketId)
        ->lockForUpdate()
        ->first();

    if ($ticket->used_count >= $ticket->capacity) {
        throw new TicketCapacityExceededException();
    }

    DB::table('tickets')
        ->where('id', $ticketId)
        ->increment('used_count');

    // Record usage...
});
```

---

## 17. Audit Logging — Every Mutation Gets Logged

> **"Every Decision is a Data Point."**

### What Must Be Logged

Every operation that **creates, updates, or deletes** data must have an audit log entry. No exceptions.

### How to Log

```php
$this->auditLogger->log(new AuditContext(
    tenantId: $command->tenantId,
    userId: $command->actorId ?? 0,        // Who did it (0 = system)
    action: 'faq.created',                 // Entity.past_tense_verb
    entityType: 'faq',                     // What type of thing
    entityId: $savedFaq->getId(),          // Which specific thing
    metadata: [                            // Additional context
        'title' => $savedFaq->getTitle(),
        'course_id' => $command->courseId,
    ],
    oldValues: null,                       // For updates: what it was before
    newValues: null,                       // For updates: what it is now
));
```

### Audit Action Naming Convention

Format: `{entity}.{past_tense_verb}`

| Action | Audit Code |
|--------|-----------|
| Course created | `course.created` |
| Course updated | `course.updated` |
| Course status changed | `course.status_changed` |
| Chapter deleted | `chapter.deleted` |
| FAQ created | `faq.created` |
| Ticket redeemed | `ticket.redeemed` |
| Enrollment activated | `enrollment.activated` |
| Certificate issued | `certificate.issued` |
| Review moderated | `review.moderated` |

### Where to Log

Audit logging happens **inside the `DB::transaction()`** in the UseCase, after persistence, before event dispatch. This ensures the audit log is atomically committed with the data change.

---

## 18. Error Handling — The Exception Hierarchy

### The Three-Layer Error Model

| Layer | Throws | Catches |
|-------|--------|---------|
| Domain | `DomainException` subclasses | Nothing — domain doesn't catch |
| Application | Domain exceptions + own exceptions | Nothing — let them propagate |
| HTTP | Nothing | Maps domain exceptions to HTTP status codes |

### Anti-Enumeration Rule

Never reveal whether a resource exists but belongs to another tenant. Always combine "not found" and "forbidden" into a single "not found" response.

```php
// ❌ BAD: Leaks that the resource EXISTS but belongs to someone else
if (!$course) throw new NotFoundException('Course not found');
if (!$this->authorize($course)) throw new ForbiddenException('Not allowed');

// ✅ GOOD: Same response whether it doesn't exist OR isn't yours
$course = $this->courseRepo->findById($tenantId, $courseId);
if ($course === null) {
    throw CourseNotFoundException::withId($courseId);
    // This covers both "doesn't exist" and "belongs to another tenant"
    // because the repo filters by tenant_id
}
```

---

## 19. Naming Conventions — The Locked Table

These conventions are **locked**. No deviations without architecture review.

| Category | Convention | Examples |
|----------|-----------|----------|
| Audit Actions | `{entity}.{past_tense_verb}` | `tenant.created`, `course.status_changed` |
| Domain Events | `{Entity}{PastTense}` | `CourseCreated`, `ChapterDeleted` |
| Domain Exceptions | `{BusinessReason}Exception` | `DuplicateCourseSlugException`, `TicketCapacityExceededException` |
| UseCases | `{Verb}{Entity}UseCase` | `CreateCourseUseCase`, `ArchiveCourseUseCase` |
| Commands | `{Verb}{Entity}Command` | `CreateCourseCommand`, `UpdateChapterCommand` |
| Queries | `List{Entities}Query` or `Get{Entity}Query` | `ListCoursesQuery`, `GetCourseStatisticsQuery` |
| Controllers | `{Entity}{Read\|Write}Controller` | `CourseReadController`, `CourseWriteController` |
| FormRequests | `{Verb}{Entity}Request` | `CreateCourseRequest`, `UpdateChapterRequest` |
| Resources | `{Entity}Resource` | `CourseResource`, `ChapterResource` |
| Eloquent Models | `{Entity}Record` | `CourseRecord`, `ChapterRecord` (NOT `Course`, NOT `Chapter`) |
| Repo Interfaces | `{Entity}RepositoryInterface` | `CourseRepositoryInterface` |
| Repo Implementations | `Eloquent{Entity}Repository` | `EloquentCourseRepository` |
| DB Tables | `plural_snake_case` | `courses`, `course_chapters`, `text_lessons` |
| DB Columns | `snake_case` | `tenant_id`, `created_at`, `is_active` |
| DB Booleans | `is_`, `has_`, `can_` prefix | `is_published`, `has_certificate` |
| DB Financial | `{name}_cents` suffix, `BIGINT UNSIGNED` | `amount_cents`, `tax_cents` |
| DB Status | `VARCHAR(30)`, not ENUM | `status VARCHAR(30) DEFAULT 'active'` |
| DB Indexes | `idx_{table}_{columns}` | `idx_courses_tenant_status` |
| Tenant ID | `tenant_id` everywhere | Never `organization_id` |

---

## 20. Forbidden Patterns — Instant Code Review Rejection

Any of these patterns in your code will result in **immediate code review rejection**. No discussion.

### Layer Violations

```php
// ❌ #1: Illuminate imports in Domain layer
namespace App\Domain\...;
use Illuminate\Support\Facades\DB;    // REJECTED
use Illuminate\Support\Facades\Cache; // REJECTED
use Illuminate\Support\Str;           // REJECTED

// ❌ #2: DB::table() in Application layer
namespace App\Application\...;
$data = DB::table('courses')->where(...);  // REJECTED

// ❌ #3: HTTP exceptions in Application layer
namespace App\Application\...;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException; // REJECTED
throw new NotFoundHttpException('Not found'); // REJECTED

// ❌ #4: Storage/Mail/PDF facades in Application layer
namespace App\Application\...;
use Illuminate\Support\Facades\Storage; // REJECTED
Storage::disk('public')->put(...);      // REJECTED

// ❌ #5: Business logic in Controller
public function store(Request $request) {
    if ($course->status !== 'published') { ... }  // REJECTED — belongs in Entity
}

// ❌ #6: Direct Eloquent in Controller
public function show(int $id) {
    $course = Course::find($id);  // REJECTED — use UseCase/Query
}
```

### Tenant Safety Violations

```php
// ❌ #7: Missing tenant_id in repository method
public function findById(int $id): ?FaqEntity  // REJECTED — where is tenantId?

// ❌ #8: Missing tenant_id in UseCase/Query
public function execute(int $courseId): array  // REJECTED — where is tenantId?

// ❌ #9: Fetching by raw ID without tenant scope
$record = FaqRecord::find($id);  // REJECTED — must scope by tenant_id
```

### Structural Violations

```php
// ❌ #10: Multiple operations in one UseCase (God-class)
final class ManageFaqsUseCase {
    public function create() { ... }
    public function update() { ... }   // REJECTED — split into separate UseCases
    public function delete() { ... }
}

// ❌ #11: Generic Exception
throw new \Exception("Course not found");  // REJECTED — use domain exception

// ❌ #12: Missing audit log on mutation
$this->repository->save($entity);  // Where is the audit log? REJECTED

// ❌ #13: Events dispatched inside transaction
DB::transaction(function () {
    $this->repository->save($entity);
    event(new CourseCreated(...));  // REJECTED — dispatch AFTER commit
});

// ❌ #14: MySQL ENUM in migration
$table->enum('status', ['active', 'inactive']);  // REJECTED — use VARCHAR

// ❌ #15: env() outside config/
$apiKey = env('RAZORPAY_KEY');  // REJECTED — use config('services.razorpay.key')

// ❌ #16: Missing strict_types or final on Command/UseCase
class CreateFaqCommand { ... }  // REJECTED — must be final class with strict_types

// ❌ #17: Swallowing exceptions silently
try { ... } catch (\Throwable $e) {
    Log::error($e->getMessage());  // REJECTED for critical ops — must not silently fail
}
```

---

## 21. The Pre-Commit Checklist

Run this checklist **before every commit**. If any check fails, do not push.

```
□ PHPStan Level 5 passes: vendor/bin/phpstan analyse app/ --level=5
□ All tests pass: php artisan test
□ No env() in app code: grep -rn 'env(' app/ routes/ database/ → 0 results
□ No Illuminate in Domain: grep -rn 'use Illuminate' app/Domain/ → 0 results
□ No MySQL ENUMs: grep -rn '->enum(' database/migrations/ → 0 results
□ Every UseCase has tenantId parameter (for tenant-scoped operations)
□ Every UseCase has audit logging
□ Every UseCase dispatches events AFTER transaction commit
□ Every repository method includes tenant_id for tenant-scoped data
□ Every Command has declare(strict_types=1) and final class
□ No "Manage*" god-classes — one operation per UseCase
□ No generic \Exception — domain-specific exceptions only
□ No HTTP exceptions in Application or Domain layers
□ No DB::table() in Application layer
□ No facades (Storage, Mail, Cache, PDF) in Application layer
□ Controllers are < 20 lines per method
```

---

## 22. The Complete UseCase Template

Copy this template for every new write operation. Fill in the blanks.

```php
<?php

declare(strict_types=1);

namespace App\Application\TenantAdminDashboard\{Subdomain}\UseCases;

use App\Application\TenantAdminDashboard\{Subdomain}\Commands\{Verb}{Entity}Command;
use App\Domain\TenantAdminDashboard\{Subdomain}\Entities\{Entity}Entity;
use App\Domain\TenantAdminDashboard\{Subdomain}\Repositories\{Entity}RepositoryInterface;
use App\Domain\TenantAdminDashboard\{Subdomain}\Exceptions\{Entity}NotFoundException;
use App\Infrastructure\Persistence\Shared\AuditContext;
use App\Infrastructure\Persistence\Shared\TenantAuditLogger;
use Illuminate\Support\Facades\DB;

final class {Verb}{Entity}UseCase
{
    public function __construct(
        private readonly {Entity}RepositoryInterface $repository,
        private readonly TenantAuditLogger $auditLogger,
        // Add other repository interfaces as needed
    ) {}

    public function execute({Verb}{Entity}Command $command): {Entity}Entity
    {
        $result = DB::transaction(function () use ($command) {
            // ── Step 1: Idempotency (if applicable) ──
            // if ($command->idempotencyKey !== null) { ... }

            // ── Step 2: Precondition Validation ──
            // Load parent entities, verify they belong to this tenant
            // $parent = $this->parentRepo->findById($command->tenantId, $command->parentId);
            // if ($parent === null) { throw ParentNotFoundException::withId($command->parentId); }

            // ── Step 3: Domain Entity Operation ──
            // $entity = {Entity}Entity::create($props);
            // OR: $entity = $existingEntity->update($changes, $command->actorId);

            // ── Step 4: Persist ──
            // $saved = $this->repository->save($entity);

            // ── Step 5: Audit Log ──
            $this->auditLogger->log(new AuditContext(
                tenantId: $command->tenantId,
                userId: $command->actorId ?? 0,
                action: '{entity}.{past_tense}',
                entityType: '{entity}',
                entityId: $saved->getId(),
                metadata: [/* relevant context */]
            ));

            // ── Step 6: Collect Events ──
            $events = $entity->releaseEvents();

            return [$saved, $events];
        });

        // ── Step 7: Dispatch Events AFTER Commit ──
        foreach ($result[1] as $event) {
            event($event);
        }

        return $result[0];
    }
}
```

---

## 23. Common Mistakes and How to Fix Them

### Mistake 1: "I'll add tenant scoping later"

**Reality:** There is no "later." If you write a method without `$tenantId`, it gets used without `$tenantId`. Every call site now has a security bug. Fix it before the first line of business code.

### Mistake 2: "The global scope handles tenant isolation"

**Reality:** Global scopes only work on Eloquent queries. `DB::table()`, raw SQL, console commands, and queue workers bypass them. Always pass `tenant_id` explicitly in addition to global scopes.

### Mistake 3: "I put the business logic in the UseCase because the Entity would be too complex"

**Reality:** If the entity is too complex, you probably need to split it into smaller entities or introduce value objects. Business rules MUST live in the domain layer where they can be tested without infrastructure. The UseCase orchestrates; the Entity decides.

### Mistake 4: "I threw a generic Exception because we don't have a specific one yet"

**Reality:** Create the domain exception. It takes 30 seconds to write a new exception class. The cost of a generic exception is: the controller can't distinguish between "not found" (404) and "business rule violated" (422) and "unexpected crash" (500).

### Mistake 5: "I used DB::table() in the Application layer because it was a simple query"

**Reality:** There is no such thing as a "simple query" in a multi-tenant system. Every query must be tenant-scoped. `DB::table()` bypasses tenant scoping. Define an interface in Domain, implement in Infrastructure.

### Mistake 6: "I combined create, update, and delete into one class to keep it organized"

**Reality:** You've created a god-class that violates Single Responsibility. When the delete logic changes, you risk breaking create. When create gets a new parameter, you're editing a class that handles three unrelated operations. One UseCase per operation. Always.

### Mistake 7: "I dispatched the event inside the transaction — what's the difference?"

**Reality:** If the transaction rolls back after the event fires, downstream listeners have already processed a fake event. A payment confirmation email was sent for a payment that doesn't exist. An enrollment was created for a transaction that rolled back. Events MUST fire AFTER `DB::transaction()` commits successfully.

### Mistake 8: "I skipped audit logging because this isn't a critical operation"

**Reality:** Everything is auditable. When a tenant admin asks "who deleted my FAQ?", the answer cannot be "we didn't log that." When a SOC 2 auditor asks for a complete mutation history, gaps are findings. Log every mutation. Always.

### Mistake 9: "I used NotFoundHttpException in the UseCase because that's what the controller expects"

**Reality:** The UseCase must not know it's being called from HTTP. It could be called from a console command, a queue worker, or a test. Throw a domain exception. The HTTP layer maps it to 404. The console command maps it to an error message. The test asserts the exception type.

### Mistake 10: "I built a 'Services' directory because it's a common Laravel pattern"

**Reality:** The UBOTZ Phase 6 template defines three Application directories: `Commands/`, `UseCases/`, `Queries/`. There is no `Services/` directory. If your code orchestrates a write operation → it's a UseCase. If it reads data → it's a Query. If it carries data → it's a Command. If it doesn't fit any of these, ask before creating a new directory.

---

## Quick Reference Card

Print this and keep it at your desk.

```
┌─────────────────────────────────────────────────────────────┐
│  UBOTZ DEVELOPER QUICK REFERENCE                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  EVERY UseCase MUST have:                                   │
│    ✓ int $tenantId                                          │
│    ✓ DB::transaction()                                      │
│    ✓ Audit log (inside transaction)                         │
│    ✓ Events dispatched AFTER commit                         │
│    ✓ Domain exceptions (not generic \Exception)             │
│                                                             │
│  EVERY Repository method MUST have:                         │
│    ✓ int $tenantId for tenant-scoped data                   │
│    ✓ Explicit WHERE tenant_id = ? (belt-and-suspenders)     │
│                                                             │
│  NEVER in Domain Layer:                                     │
│    ✗ use Illuminate\...                                     │
│    ✗ DB::, Cache::, Storage::, Mail::                       │
│    ✗ Eloquent models or queries                             │
│                                                             │
│  NEVER in Application Layer:                                │
│    ✗ DB::table() or raw SQL                                 │
│    ✗ HTTP Request/Response awareness                        │
│    ✗ Infrastructure facades                                 │
│    ✗ Generic \Exception                                     │
│                                                             │
│  NEVER in Controllers:                                      │
│    ✗ Business logic                                         │
│    ✗ Direct database queries                                │
│    ✗ More than 20 lines per method                          │
│                                                             │
│  NEVER in Migrations:                                       │
│    ✗ ->enum() columns                                       │
│    ✗ DECIMAL/FLOAT for money (use BIGINT _cents)            │
│    ✗ Missing tenant_id on tenant-scoped tables              │
│                                                             │
│  BEFORE EVERY COMMIT:                                       │
│    □ PHPStan Level 5 passes                                 │
│    □ All tests pass                                         │
│    □ grep 'use Illuminate' app/Domain/ → 0 results          │
│    □ grep 'env(' app/ routes/ database/ → 0 results         │
│    □ grep '->enum(' database/migrations/ → 0 results        │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

*End of Document — UBOTZ 2.0 Developer Instruction Manual v1.0*