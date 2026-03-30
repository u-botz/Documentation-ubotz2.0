# UBOTZ 2.0 — Phase 17C Implementation Plan

## Course Domain Correction Series — Part 3: Pricing Bounded Context Extraction

| Field | Value |
|---|---|
| **Document Type** | Implementation Plan |
| **Phase** | 17C |
| **Series** | Course Domain Correction (17A → 17B → 17C → 17D) |
| **Date** | 2026-03-20 |
| **Produced By** | Antigravity Implementation Team |
| **Awaiting** | Principal Engineer Audit Approval before implementation begins |
| **Prerequisite** | Phase 17A CERTIFIED COMPLETE |
| **Parallel With** | Phase 17B (no dependency between 17B and 17C) |
| **Baseline Tests** | 312 passed (post-17A) |

> **This document reflects the real codebase state as of 2026-03-20. Every claim has been verified against actual files. No assumptions. This plan is submitted for Principal Engineer audit before any code is written.**

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Gap Analysis — Current State vs Target State](#2-gap-analysis--current-state-vs-target-state)
3. [Architecture Decision Records](#3-architecture-decision-records)
4. [What Moves — Complete Inventory](#4-what-moves--complete-inventory)
5. [Domain Layer — Pricing Bounded Context](#5-domain-layer--pricing-bounded-context)
6. [Application Layer — Pricing Bounded Context](#6-application-layer--pricing-bounded-context)
7. [Infrastructure Layer](#7-infrastructure-layer)
8. [Service Container Binding Updates](#8-service-container-binding-updates)
9. [Course Domain Cleanup](#9-course-domain-cleanup)
10. [Implementation Sequence](#10-implementation-sequence)
11. [Test Plan](#11-test-plan)
12. [Quality Gate](#12-quality-gate)
13. [Risk Register](#13-risk-register)
14. [File Manifest](#14-file-manifest)

---

## 1. Executive Summary

Phase 17C moves two misplaced components out of the Course bounded context into a new standalone `Pricing` bounded context:

1. **`DiscountEntity`** — currently in `Domain/TenantAdminDashboard/Course/Entities/`. The audit confirmed this entity is a platform-level coupon/discount engine (it has `code`, `capacity`, `usedCount`, `allowedGroupIds`, `startDate`, `endDate`) — not a course property. It is replaced in the Course domain with a lightweight `CourseDiscount` value object carrying only `type` and `value`.

2. **`CalculateCoursePriceUseCase`** — currently in `Application/TenantAdminDashboard/Course/UseCases/`. The audit confirmed this use case injects `TicketRepositoryInterface` and `SpecialOfferRepositoryInterface` — neither of which are Course domain concerns. Pricing calculation belongs in the Pricing bounded context.

**What gets built:**
- New `Pricing` bounded context (Domain + Application + Infrastructure layers)
- `CourseDiscount` value object in the Course domain (replaces `DiscountEntity`)
- Moved and namespace-updated `DiscountEntity` → `PricingRuleEntity` in Pricing domain
- Moved `CalculateCoursePriceUseCase` → `CalculatePriceUseCase` in Pricing application layer
- `SpecialOfferEntity` and `TicketEntity` reclassified to Pricing domain
- All repository interfaces that serve pricing logic moved to Pricing domain
- Service container bindings updated
- All imports updated across Application and HTTP layers

**What does NOT get built:**
- No new pricing features or UI
- No checkout flow changes (Phase 17D scope)
- No bundle pricing (Phase 17D scope)
- No frontend changes
- No database schema changes

---

## 2. Gap Analysis — Current State vs Target State

### 2.1 Verified Misplacements in Current Codebase

| Component | Current Location | Problem | Target Location |
|---|---|---|---|
| `DiscountEntity` | `Domain/.../Course/Entities/` | Contains coupon code, campaign dates, usage capacity — not course data | `Domain/.../Pricing/Entities/PricingRuleEntity` |
| `SpecialOfferEntity` | `Domain/.../Course/Entities/` | Promotional campaign entity — Pricing concern | `Domain/.../Pricing/Entities/` |
| `TicketEntity` | `Domain/.../Course/Entities/` | Coupon/voucher entity — Pricing concern | `Domain/.../Pricing/Entities/` |
| `CalculateCoursePriceUseCase` | `Application/.../Course/UseCases/` | Injects TicketRepo + SpecialOfferRepo — not Course concerns | `Application/.../Pricing/UseCases/CalculatePriceUseCase` |
| `SpecialOfferRepositoryInterface` | `Domain/.../Course/Repositories/` | Serves SpecialOfferEntity — not a Course contract | `Domain/.../Pricing/Repositories/` |
| `TicketRepositoryInterface` | `Domain/.../Course/Repositories/` | Serves TicketEntity — not a Course contract | `Domain/.../Pricing/Repositories/` |
| `DiscountPercentage` | `Domain/.../Course/ValueObjects/` | Pricing concern | `Domain/.../Pricing/ValueObjects/` |

### 2.2 What Stays in the Course Domain

| Component | Reason |
|---|---|
| `CourseEntity` — `price_amount` field | Base price is a Course property |
| `CourseRepositoryInterface` | Course domain contract |
| `UserGroupRepositoryInterface` (if exists in Course) | Verify location — may already be in User domain |

### 2.3 `Pricing` Context Exists But Is Empty

Confirmed: `Domain/TenantAdminDashboard/Pricing/` and `Http/Controllers/Api/TenantAdminDashboard/Pricing/` directories exist in the file tree but are empty. This phase populates the domain and application layers. The HTTP layer has a placeholder controller directory — no new controllers are added in this phase.

---

## 3. Architecture Decision Records

### DR-17C-001: `DiscountEntity` Renamed to `PricingRuleEntity`

| Field | Value |
|---|---|
| **Decision** | Rename `DiscountEntity` to `PricingRuleEntity` in the Pricing bounded context |
| **Rationale** | `DiscountEntity` is a misleading name inside the Pricing context — it describes a coupon/voucher/promotional rule system, not just a discount. The entity has `code`, `capacity`, `usedCount`, `allowedGroupIds`, `startDate`, `endDate` — this is a fully featured pricing rule, not a simple discount. The name `PricingRuleEntity` is accurate. |
| **Impact** | All references to `DiscountEntity` in application layer use cases and the `CalculateCoursePriceUseCase` (now `CalculatePriceUseCase`) must be updated to `PricingRuleEntity`. |
| **Risk** | Low — rename is internal to the move. No API contract exposes this type name. |

### DR-17C-002: New `CourseDiscount` Value Object Replaces `DiscountEntity` in Course Domain

| Field | Value |
|---|---|
| **Decision** | A new `CourseDiscount` value object is created in `Domain/.../Course/ValueObjects/` to represent the course-level discount set by a tenant admin |
| **Rationale** | Per the 2026-03-20 business decisions: course-level discounts (a flat amount or percentage set directly on a course by the admin) are a Course domain concern. Coupon codes, campaigns, and group-based eligibility are Pricing domain concerns. The Course domain needs only two fields: discount type and discount value. |
| **What it contains** | `type: DiscountType` (PERCENTAGE or FLAT_AMOUNT), `value: int` (stored as integer — percentage points or cents) |
| **What it does NOT contain** | No code, no capacity, no dates, no group IDs — those all live in `PricingRuleEntity` |
| **Risk** | None — this is a new, additive value object. No existing code is broken. |

### DR-17C-003: `CalculateCoursePriceUseCase` Renamed to `CalculatePriceUseCase`

| Field | Value |
|---|---|
| **Decision** | Rename to `CalculatePriceUseCase` in the Pricing application layer |
| **Rationale** | In the Pricing bounded context, the use case is no longer scoped to a single entity type. It calculates the final price of a purchasable product — which may be a course, and in Phase 17D will also be a bundle. The name `CalculatePriceUseCase` is accurate and forward-compatible. |
| **Impact** | The one caller of this use case (`CheckoutController` or equivalent) must update its import. |
| **Risk** | Low — single caller. PHPStan catches missed references. |

### DR-17C-004: `UserGroupRepositoryInterface` Stays in Course Domain Temporarily

| Field | Value |
|---|---|
| **Decision** | `UserGroupRepositoryInterface` (injected by `CalculatePriceUseCase` for group eligibility checks) is NOT moved in this phase |
| **Rationale** | User groups are a User/Identity concern, not a Pricing concern. The correct long-term home is `Domain/TenantAdminDashboard/User/`. However, moving it in this phase adds scope and introduces a three-context refactor. Phase 17C is scoped to Course → Pricing extraction only. The `CalculatePriceUseCase` in Pricing will import `UserGroupRepositoryInterface` from its current location. This is a known cross-context import that is explicitly accepted as temporary tech debt, to be resolved when the User domain is audited. |
| **Recorded debt** | `UserGroupRepositoryInterface` import in `CalculatePriceUseCase` is a cross-context reference. Must be resolved before the User domain is formally audited. |
| **Risk** | Low — import-only coupling, no domain logic crossing. |

### DR-17C-005: No Database Changes in This Phase

| Field | Value |
|---|---|
| **Decision** | No migrations are written for Phase 17C |
| **Rationale** | The tables that back `SpecialOfferEntity`, `TicketEntity`, and `DiscountEntity` (`special_offers`, `tickets`, `discounts` or equivalent) are not being renamed or restructured. Only the PHP domain and application layer namespaces are changing. The Eloquent models in Infrastructure will have updated namespace declarations but will map to the same tables. |
| **Risk** | None — zero schema changes. |

---

## 4. What Moves — Complete Inventory

### 4.1 Domain Layer Moves

| File | From Namespace | To Namespace | Rename? |
|---|---|---|---|
| `DiscountEntity.php` | `Domain/.../Course/Entities/` | `Domain/.../Pricing/Entities/` | → `PricingRuleEntity.php` |
| `SpecialOfferEntity.php` | `Domain/.../Course/Entities/` | `Domain/.../Pricing/Entities/` | No |
| `TicketEntity.php` | `Domain/.../Course/Entities/` | `Domain/.../Pricing/Entities/` | No |
| `SpecialOfferRepositoryInterface.php` | `Domain/.../Course/Repositories/` | `Domain/.../Pricing/Repositories/` | No |
| `TicketRepositoryInterface.php` | `Domain/.../Course/Repositories/` | `Domain/.../Pricing/Repositories/` | No |
| `DiscountPercentage.php` | `Domain/.../Course/ValueObjects/` | `Domain/.../Pricing/ValueObjects/` | No |

### 4.2 Application Layer Moves

| File | From Namespace | To Namespace | Rename? |
|---|---|---|---|
| `CalculateCoursePriceUseCase.php` | `Application/.../Course/UseCases/` | `Application/.../Pricing/UseCases/` | → `CalculatePriceUseCase.php` |

### 4.3 Infrastructure Layer Moves

| File | From Namespace | To Namespace | Rename? |
|---|---|---|---|
| `EloquentSpecialOfferRepository.php` | `Infrastructure/.../Course/` | `Infrastructure/.../Pricing/` | No |
| `EloquentTicketRepository.php` | `Infrastructure/.../Course/` | `Infrastructure/.../Pricing/` | No |
| `EloquentDiscountRepository.php` (if exists) | `Infrastructure/.../Course/` | `Infrastructure/.../Pricing/` | → `EloquentPricingRuleRepository.php` |

> **Developer note:** Confirm exact filenames for Eloquent repositories against the actual codebase before moving. The names above are inferred from convention. Report any discrepancies in the implementation plan audit response.

### 4.4 New Files Created in This Phase

| File | Purpose |
|---|---|
| `Domain/.../Course/ValueObjects/CourseDiscount.php` | Lightweight course-level discount VO |
| `Domain/.../Pricing/Repositories/PricingRuleRepositoryInterface.php` | Repository contract for `PricingRuleEntity` |

---

## 5. Domain Layer — Pricing Bounded Context

### 5.1 Directory Structure After This Phase

```
app/Domain/TenantAdminDashboard/Pricing/
├── Entities/
│   ├── PricingRuleEntity.php          ← from DiscountEntity (renamed)
│   ├── SpecialOfferEntity.php         ← from Course domain
│   └── TicketEntity.php               ← from Course domain
├── Repositories/
│   ├── PricingRuleRepositoryInterface.php   ← new (replaces DiscountRepositoryInterface if it existed)
│   ├── SpecialOfferRepositoryInterface.php  ← from Course domain
│   └── TicketRepositoryInterface.php        ← from Course domain
└── ValueObjects/
    └── DiscountPercentage.php         ← from Course domain
```

### 5.2 New `CourseDiscount` Value Object

**File:** `app/Domain/TenantAdminDashboard/Course/ValueObjects/CourseDiscount.php`

```php
<?php

declare(strict_types=1);

namespace App\Domain\TenantAdminDashboard\Course\ValueObjects;

use InvalidArgumentException;

/**
 * Represents a course-level discount set directly on a course
 * by a tenant administrator.
 *
 * This is NOT a coupon code system. It is a simple price reduction
 * applied to a single course at the admin's discretion.
 *
 * For coupon codes, campaign pricing, and group-based eligibility,
 * see PricingRuleEntity in the Pricing bounded context.
 */
final readonly class CourseDiscount
{
    public function __construct(
        public readonly CourseDiscountType $type,
        public readonly int                $value,  // percentage points OR cents — depends on type
    ) {
        $this->validate();
    }

    private function validate(): void
    {
        if ($this->value < 0) {
            throw new InvalidArgumentException(
                "CourseDiscount value cannot be negative. Got: {$this->value}"
            );
        }

        if ($this->type === CourseDiscountType::PERCENTAGE && $this->value > 100) {
            throw new InvalidArgumentException(
                "Percentage discount cannot exceed 100. Got: {$this->value}"
            );
        }
    }

    public function isZero(): bool
    {
        return $this->value === 0;
    }

    public function equals(self $other): bool
    {
        return $this->type === $other->type && $this->value === $other->value;
    }
}
```

**File:** `app/Domain/TenantAdminDashboard/Course/ValueObjects/CourseDiscountType.php`

```php
<?php

declare(strict_types=1);

namespace App\Domain\TenantAdminDashboard\Course\ValueObjects;

enum CourseDiscountType: string
{
    case PERCENTAGE  = 'percentage';
    case FLAT_AMOUNT = 'flat_amount';   // stored as cents
}
```

### 5.3 `PricingRuleEntity` — Namespace and Name Update Only

The entity content is unchanged from `DiscountEntity`. Only the namespace declaration and class name change:

```php
// OLD
namespace App\Domain\TenantAdminDashboard\Course\Entities;
final class DiscountEntity { ... }

// NEW
namespace App\Domain\TenantAdminDashboard\Pricing\Entities;
final class PricingRuleEntity { ... }
```

All field names, constructor signature, and business logic remain identical. No behavioural changes.

### 5.4 `PricingRuleRepositoryInterface`

**File:** `app/Domain/TenantAdminDashboard/Pricing/Repositories/PricingRuleRepositoryInterface.php`

```php
<?php

declare(strict_types=1);

namespace App\Domain\TenantAdminDashboard\Pricing\Repositories;

use App\Domain\TenantAdminDashboard\Pricing\Entities\PricingRuleEntity;

interface PricingRuleRepositoryInterface
{
    public function findById(int $tenantId, int $id): ?PricingRuleEntity;

    public function findActiveByGroupIds(int $tenantId, array $groupIds): array;

    public function save(PricingRuleEntity $entity): PricingRuleEntity;
}
```

> **Developer note:** Align method signatures with whatever currently exists on the old `DiscountRepositoryInterface` or equivalent. If no repository interface existed for `DiscountEntity` in the Course domain (i.e., it was queried directly via Eloquent), create this interface fresh and implement it in Infrastructure.

---

## 6. Application Layer — Pricing Bounded Context

### 6.1 Directory Structure After This Phase

```
app/Application/TenantAdminDashboard/Pricing/
└── UseCases/
    └── CalculatePriceUseCase.php     ← from CalculateCoursePriceUseCase (renamed)
```

### 6.2 `CalculatePriceUseCase` — Changes from Original

**Namespace update:**
```php
// OLD
namespace App\Application\TenantAdminDashboard\Course\UseCases;
final class CalculateCoursePriceUseCase { ... }

// NEW
namespace App\Application\TenantAdminDashboard\Pricing\UseCases;
final class CalculatePriceUseCase { ... }
```

**Import updates:**
```php
// OLD imports (Course namespace)
use App\Domain\TenantAdminDashboard\Course\Repositories\TicketRepositoryInterface;
use App\Domain\TenantAdminDashboard\Course\Repositories\SpecialOfferRepositoryInterface;

// NEW imports (Pricing namespace)
use App\Domain\TenantAdminDashboard\Pricing\Repositories\TicketRepositoryInterface;
use App\Domain\TenantAdminDashboard\Pricing\Repositories\SpecialOfferRepositoryInterface;
```

**`CourseRepositoryInterface` import stays as-is** — the use case still loads the course to get its base price. This is a legitimate cross-context read (Pricing reads from Course). This is acceptable — the dependency direction is Pricing → Course, which is correct. The Course domain does not import from Pricing.

**All business logic, method signatures, inputs, and outputs are unchanged.** This is a move, not a rewrite.

### 6.3 Command Object — Rename Only

If a `CalculateCoursePriceCommand` exists as a DTO for this use case, it must be renamed to `CalculatePriceCommand` and moved to `Application/TenantAdminDashboard/Pricing/Commands/`. Method signature and fields unchanged.

---

## 7. Infrastructure Layer

### 7.1 Eloquent Repository Moves

Each repository implementation moves to the new Pricing infrastructure path. Namespace declaration updated. Table names, query logic, and Eloquent model references are unchanged.

```
Infrastructure/Persistence/TenantAdminDashboard/Course/EloquentSpecialOfferRepository.php
→ Infrastructure/Persistence/TenantAdminDashboard/Pricing/EloquentSpecialOfferRepository.php

Infrastructure/Persistence/TenantAdminDashboard/Course/EloquentTicketRepository.php
→ Infrastructure/Persistence/TenantAdminDashboard/Pricing/EloquentTicketRepository.php
```

### 7.2 Eloquent Model Handling — `DiscountRecord` / `SpecialOfferRecord` / `TicketRecord`

These Eloquent models may be located in `Infrastructure/Persistence/TenantAdminDashboard/Course/`. They must be evaluated:

- If they are **only used by the moved repositories**, move them to the Pricing infrastructure path.
- If they are **referenced by any Course infrastructure component** (e.g., `CourseRecord` has a relationship to `DiscountRecord`), do not move the model — only move the repository. Leave a `// TODO: Phase 17D — move model after relationship audit` comment.

The developer must grep for all usages of each Eloquent model before deciding:

```powershell
docker exec -it ubotz_backend sh -c "grep -r 'DiscountRecord\|SpecialOfferRecord\|TicketRecord' /var/www/app --include='*.php' -l"
```

Report findings in the implementation plan response to the Principal Engineer.

---

## 8. Service Container Binding Updates

All service provider bindings for moved repository interfaces must be updated. The developer must locate the relevant service provider (likely `TenantAdminDashboardServiceProvider` or equivalent) and update:

```php
// REMOVE — old Course namespace bindings
$this->app->bind(
    \App\Domain\TenantAdminDashboard\Course\Repositories\SpecialOfferRepositoryInterface::class,
    \App\Infrastructure\Persistence\TenantAdminDashboard\Course\EloquentSpecialOfferRepository::class,
);
$this->app->bind(
    \App\Domain\TenantAdminDashboard\Course\Repositories\TicketRepositoryInterface::class,
    \App\Infrastructure\Persistence\TenantAdminDashboard\Course\EloquentTicketRepository::class,
);

// ADD — new Pricing namespace bindings
$this->app->bind(
    \App\Domain\TenantAdminDashboard\Pricing\Repositories\SpecialOfferRepositoryInterface::class,
    \App\Infrastructure\Persistence\TenantAdminDashboard\Pricing\EloquentSpecialOfferRepository::class,
);
$this->app->bind(
    \App\Domain\TenantAdminDashboard\Pricing\Repositories\TicketRepositoryInterface::class,
    \App\Infrastructure\Persistence\TenantAdminDashboard\Pricing\EloquentTicketRepository::class,
);
$this->app->bind(
    \App\Domain\TenantAdminDashboard\Pricing\Repositories\PricingRuleRepositoryInterface::class,
    \App\Infrastructure\Persistence\TenantAdminDashboard\Pricing\EloquentPricingRuleRepository::class,
);
```

The `CalculatePriceUseCase` is resolved via the service container through constructor injection. Confirm the use case is not manually instantiated anywhere — if it is, update the instantiation site to use the new class name.

---

## 9. Course Domain Cleanup

After all moves are confirmed and tests pass, the following files must be deleted from the Course domain:

| File | Delete Condition |
|---|---|
| `Domain/.../Course/Entities/DiscountEntity.php` | After `PricingRuleEntity` confirmed in Pricing |
| `Domain/.../Course/Entities/SpecialOfferEntity.php` | After move confirmed |
| `Domain/.../Course/Entities/TicketEntity.php` | After move confirmed |
| `Domain/.../Course/Repositories/SpecialOfferRepositoryInterface.php` | After Pricing binding confirmed |
| `Domain/.../Course/Repositories/TicketRepositoryInterface.php` | After Pricing binding confirmed |
| `Domain/.../Course/ValueObjects/DiscountPercentage.php` | After move to Pricing confirmed |
| `Application/.../Course/UseCases/CalculateCoursePriceUseCase.php` | After `CalculatePriceUseCase` confirmed in Pricing |

Pre-deletion grep to confirm zero remaining imports:

```powershell
docker exec -it ubotz_backend sh -c "grep -r 'TenantAdminDashboard\\\\Course\\\\.*Discount\|TenantAdminDashboard\\\\Course\\\\.*SpecialOffer\|TenantAdminDashboard\\\\Course\\\\.*Ticket\|CalculateCoursePriceUseCase' /var/www/app --include='*.php'"
```

Expected output: empty. Any match is a missed import update.

---

## 10. Implementation Sequence

```
Step 1  — Create Pricing bounded context directory structure (all empty)
Step 2  — Copy Domain entities to Pricing (update namespace + rename DiscountEntity → PricingRuleEntity)
Step 3  — Copy Domain repository interfaces to Pricing (update namespaces)
Step 4  — Create PricingRuleRepositoryInterface (new file)
Step 5  — Copy DiscountPercentage VO to Pricing ValueObjects (update namespace)
Step 6  — Create CourseDiscount VO in Course domain (new file)
Step 7  — Create CourseDiscountType enum in Course domain (new file)
Step 8  — Copy Infrastructure repositories to Pricing path (update namespaces)
Step 9  — Evaluate Eloquent model locations (grep per §7.2 — report before proceeding)
Step 10 — Copy CalculateCoursePriceUseCase to Pricing, rename to CalculatePriceUseCase
Step 11 — Update all imports inside CalculatePriceUseCase (Pricing namespace)
Step 12 — Update service container bindings (§8)
Step 13 — Grep and update all callers of CalculateCoursePriceUseCase → CalculatePriceUseCase
Step 14 — Run: php artisan test --filter=Course
Step 15 — Run: php artisan test --filter=Pricing
Step 16 — Run PHPStan level 5 on all modified and new files
Step 17 — Run deletion grep (§9) — confirm empty output
Step 18 — Delete old Course context files
Step 19 — Re-run full test suite: php artisan test
Step 20 — Re-run PHPStan on deleted-file consumers to confirm nothing is broken
```

Steps 9 must produce a report before Step 10 proceeds. If Eloquent models have cross-context relationships, the move strategy must be confirmed with the Principal Engineer before continuing.

---

## 11. Test Plan

### 11.1 Unit Tests — Pricing Domain

**File:** `tests/Unit/Domain/TenantAdminDashboard/Pricing/Entities/PricingRuleEntityTest.php`

| Test | Description |
|---|---|
| `test_pricing_rule_entity_has_correct_fields` | All fields accessible and correctly typed |
| `test_pricing_rule_entity_namespace_is_pricing` | Confirm class is in Pricing namespace, not Course |

**File:** `tests/Unit/Domain/TenantAdminDashboard/Course/ValueObjects/CourseDiscountTest.php`

| Test | Description |
|---|---|
| `test_percentage_discount_validates_max_100` | Value > 100 throws InvalidArgumentException |
| `test_negative_value_throws` | Value < 0 throws InvalidArgumentException |
| `test_zero_discount_is_zero` | `isZero()` returns true |
| `test_equals_returns_true_for_matching_type_and_value` | Equality check |
| `test_flat_amount_allows_values_above_100` | Flat amount is not bound by 100 |

### 11.2 Unit Tests — Pricing Application Layer

**File:** `tests/Unit/Application/TenantAdminDashboard/Pricing/UseCases/CalculatePriceUseCaseTest.php`

| Test | Description |
|---|---|
| `test_returns_base_price_when_no_discounts` | No offers, no ticket → base price returned |
| `test_applies_special_offer_when_eligible` | Group matches → offer applied |
| `test_applies_ticket_when_valid` | Valid ticket → ticket discount applied |
| `test_rejects_invalid_ticket_code` | Invalid ticket → validation exception |
| `test_use_case_is_in_pricing_namespace` | Class is not in Course namespace |
| `test_does_not_import_course_domain_types_directly` | Cross-namespace pollution check — only `CourseRepositoryInterface` is acceptable |

### 11.3 Regression Tests

All existing tests in `--filter=Course` must pass without modification. Any test that was testing `DiscountEntity` behaviour from the Course test suite must now reference the Pricing namespace. If such tests exist in `tests/Feature/TenantAdminDashboard/Course/`, they must be moved to `tests/Feature/TenantAdminDashboard/Pricing/` as part of this phase.

### 11.4 PHPStan

```powershell
docker exec -it ubotz_backend sh -c "cd /var/www && ./vendor/bin/phpstan analyse app/Domain/TenantAdminDashboard/Pricing app/Application/TenantAdminDashboard/Pricing app/Infrastructure/Persistence/TenantAdminDashboard/Pricing app/Domain/TenantAdminDashboard/Course/ValueObjects/CourseDiscount.php app/Domain/TenantAdminDashboard/Course/ValueObjects/CourseDiscountType.php --level=5"
```

Must pass with zero errors.

---

## 12. Quality Gate

All items must be confirmed before Phase 17C is marked complete and submitted to Principal Engineer:

| # | Check | How to Verify |
|---|---|---|
| 1 | `DiscountEntity` does not exist in Course domain | Grep — must return empty |
| 2 | `SpecialOfferEntity` does not exist in Course domain | Grep — must return empty |
| 3 | `TicketEntity` does not exist in Course domain | Grep — must return empty |
| 4 | `CalculateCoursePriceUseCase` does not exist in Course application layer | Grep — must return empty |
| 5 | `PricingRuleEntity` exists in `Domain/.../Pricing/Entities/` | File exists + namespace correct |
| 6 | `CalculatePriceUseCase` exists in `Application/.../Pricing/UseCases/` | File exists + namespace correct |
| 7 | `CourseDiscount` VO exists in `Domain/.../Course/ValueObjects/` | File exists |
| 8 | `CourseDiscountType` enum exists in `Domain/.../Course/ValueObjects/` | File exists |
| 9 | No Course domain file imports from Pricing domain | Grep cross-namespace imports |
| 10 | Service container has bindings for all Pricing repositories | ServiceProvider review |
| 11 | `php artisan test --filter=Course` passes | Test output — zero failures |
| 12 | `php artisan test --filter=Pricing` passes | Test output — zero failures |
| 13 | PHPStan level 5 passes on all modified and new files | PHPStan output — zero errors |
| 14 | Zero risky tests in full output | Test output |
| 15 | Eloquent model location decision is documented | Implementation notes |

---

## 13. Risk Register

| # | Risk | Likelihood | Severity | Mitigation |
|---|---|---|---|---|
| R-01 | Eloquent model has cross-context relationships making it immovable in this phase | Medium | Low | Per DR-17C-004 — leave in place, add TODO, document. Does not block phase. |
| R-02 | Missed import reference causes runtime 500 after old files deleted | Medium | High | Deletion grep (§9) must return empty before any deletion. PHPStan must pass. |
| R-03 | `CalculateCoursePriceUseCase` has multiple callers not identified by grep | Low | Medium | Grep is comprehensive — also check route files and FormRequests for any direct class references |
| R-04 | A test was directly asserting Course namespace on pricing types | Low | Low | Any such test is corrected by moving it to Pricing test suite — not by changing the assertion |

---

## 14. File Manifest

### New Files

| File | Purpose |
|---|---|
| `app/Domain/TenantAdminDashboard/Pricing/Entities/PricingRuleEntity.php` | Moved + renamed from DiscountEntity |
| `app/Domain/TenantAdminDashboard/Pricing/Entities/SpecialOfferEntity.php` | Moved from Course |
| `app/Domain/TenantAdminDashboard/Pricing/Entities/TicketEntity.php` | Moved from Course |
| `app/Domain/TenantAdminDashboard/Pricing/Repositories/PricingRuleRepositoryInterface.php` | New |
| `app/Domain/TenantAdminDashboard/Pricing/Repositories/SpecialOfferRepositoryInterface.php` | Moved from Course |
| `app/Domain/TenantAdminDashboard/Pricing/Repositories/TicketRepositoryInterface.php` | Moved from Course |
| `app/Domain/TenantAdminDashboard/Pricing/ValueObjects/DiscountPercentage.php` | Moved from Course |
| `app/Domain/TenantAdminDashboard/Course/ValueObjects/CourseDiscount.php` | New |
| `app/Domain/TenantAdminDashboard/Course/ValueObjects/CourseDiscountType.php` | New |
| `app/Application/TenantAdminDashboard/Pricing/UseCases/CalculatePriceUseCase.php` | Moved + renamed |
| `app/Infrastructure/Persistence/TenantAdminDashboard/Pricing/EloquentSpecialOfferRepository.php` | Moved from Course |
| `app/Infrastructure/Persistence/TenantAdminDashboard/Pricing/EloquentTicketRepository.php` | Moved from Course |
| `app/Infrastructure/Persistence/TenantAdminDashboard/Pricing/EloquentPricingRuleRepository.php` | Moved + renamed |
| `tests/Unit/Domain/TenantAdminDashboard/Pricing/Entities/PricingRuleEntityTest.php` | New |
| `tests/Unit/Domain/TenantAdminDashboard/Course/ValueObjects/CourseDiscountTest.php` | New |
| `tests/Unit/Application/TenantAdminDashboard/Pricing/UseCases/CalculatePriceUseCaseTest.php` | New |

### Modified Files

| File | Change |
|---|---|
| Service provider with Course/Pricing repository bindings | Update bindings (§8) |
| Any controller or use case calling `CalculateCoursePriceUseCase` | Update import + class name |

### Deleted Files (after all tests green + deletion grep is empty)

| File |
|---|
| `app/Domain/TenantAdminDashboard/Course/Entities/DiscountEntity.php` |
| `app/Domain/TenantAdminDashboard/Course/Entities/SpecialOfferEntity.php` |
| `app/Domain/TenantAdminDashboard/Course/Entities/TicketEntity.php` |
| `app/Domain/TenantAdminDashboard/Course/Repositories/SpecialOfferRepositoryInterface.php` |
| `app/Domain/TenantAdminDashboard/Course/Repositories/TicketRepositoryInterface.php` |
| `app/Domain/TenantAdminDashboard/Course/ValueObjects/DiscountPercentage.php` |
| `app/Application/TenantAdminDashboard/Course/UseCases/CalculateCoursePriceUseCase.php` |

---

*End of Phase 17C Implementation Plan*
*Produced by Antigravity — 2026-03-20*
*Submitted to Principal Engineer for audit. No implementation begins until audit approval is received.*
