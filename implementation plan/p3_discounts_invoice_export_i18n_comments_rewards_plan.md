# Implementation Plan — P3 Features Migration
## User Group Discounts · Invoice Generation · Student Export · i18n/Translations · Comments System · Reward Points

**Document Version:** 1.0  
**Date:** March 17, 2026  
**Status:** DRAFT — Pending Developer Assignment  
**Source Codebase:** `mentora_production`  
**Target Codebase:** `backend` (UBOTZ 2.0 DDD Architecture)  
**Mandatory Pre-reading:**  
- `backend/documentation/Ubotz 2 developer instruction manual .md`  
- `backend/documentation/Feature Migration Guide - Mentora to UBOTZ 2.md`

---

> [!CAUTION]
> These are P3 features — lower priority but must be implemented with **identical architectural rigor** to P0/P1/P2. Do NOT take shortcuts because these are "low complexity." Every feature must follow the DDD layer model from the developer instruction manual.

---

## Table of Contents

1. [Current State Assessment](#1-current-state-assessment)
2. [Feature 5: User Group Discounts](#2-feature-5-user-group-discounts)
3. [Feature 6: Student Invoice Generation](#3-feature-6-student-invoice-generation)
4. [Feature 7: Student List Export (Excel)](#4-feature-7-student-list-export-excel)
5. [Feature 8: i18n / Translations](#5-feature-8-i18n--translations)
6. [Feature 9: Comments System](#6-feature-9-comments-system)
7. [Feature 10: Reward Points Integration](#7-feature-10-reward-points-integration)
8. [Implementation Sequence](#8-implementation-sequence)
9. [Pre-Commit Checklist](#9-pre-commit-checklist)

---

## 1. Current State Assessment

### 1.1 Mentora Source Inventory

| Feature | Key Legacy Files |
|---------|-----------------|
| **User Group Discounts** | `app/Models/Group.php`, `app/Models/GroupUser.php`, `app/Models/DiscountGroup.php`, `app/Models/Discount.php` → `checkValidDiscount()` (lines 217–223 check group membership), `database/migrations/2022_01_28_094527_create_discount_groups_table.php` |
| **Invoice** | `app/Http/Controllers/Panel/WebinarController.php` → `invoice($webinarId, $saleId)` (lines 1001–1078); `app/Http/Controllers/Panel/Store/SaleController.php` → `invoice($saleId, $orderId)`; `app/Http/Controllers/Panel/Store/MyPurchaseController.php` → `invoice($saleId, $orderId)` |
| **Student Export** | `app/Exports/WebinarStudents.php` (Maatwebsite Excel); `app/Http/Controllers/Api/Instructor/WebinarsController.php` → `exportStudentsList($id)` (lines 880–919); `app/Http/Controllers/Panel/WebinarController.php` → `exportStudentsList($id)` (lines 865–938) |
| **i18n** | `database/migrations/2021_09_22_120723_create_webinar_translations_table.php`; `app/Models/Webinar.php` uses `Astrotomic\Translatable`; `$translatedAttributes = ['title', 'description', 'seo_description']` |
| **Comments** | `app/Models/Comment.php`; `app/Http/Controllers/Panel/CommentController.php` (store, update, destroy, reply, report, myClassComments, myComments); `app/Models/CommentReport.php`; `database/migrations/2020_09_24_132242_create_comment_table.php` |
| **Rewards** | `app/Models/Reward.php` (21 reward type constants); `app/Models/RewardAccounting.php` (`makeRewardAccounting()`, `calculateScore()`); `app/Models/Webinar.php` → `handleLearningProgress100Reward()` (lines 791–797); `database/migrations/2022_01_02_142927_create_rewards_table.php`; `database/migrations/2022_01_03_153517_create_rewards_accounting_table.php` |

### 1.2 Backend Current State

| Feature | Status | What Exists |
|---------|--------|-------------|
| **User Group Discounts** | ⚠️ PARTIAL | `UserGroupEntity`, `UserGroupRepositoryInterface` (with `getUserGroupIds`), `TicketEntity` has `allowedGroupIds` + `isGroupAllowed()`, `DiscountPercentage` VO, `CalculateCoursePriceUseCase` uses group IDs for ticket filtering — group-restricted tickets are done; **missing**: standalone `DiscountGroup` (coupon codes restricted to groups), CRUD for creating group-restricted discounts |
| **Student Invoice** | ❌ NOT STARTED | Nothing (Must create separate `student_invoices` table) |
| **Student Export** | ⚠️ PARTIAL | Route `GET /courses/{id}/export-students` exists in `course.php`; `CourseStudentExportQueryInterface` bound in `CourseServiceProvider`; the controller method and underlying query implementation need verification |
| **i18n** | ❌ NOT STARTED | No translation table, no locale-aware querying |
| **Comments** | ❌ NOT STARTED | `BlogCommentEntity` in Blog bounded context (usable as pattern); no `CourseCommentEntity` |
| **Rewards** | ❌ NOT STARTED | No `RewardEntity`, no `RewardLedgerEntity`, no `RewardType` VO, no accounting logic |

---

## 2. Feature 5: User Group Discounts

### 2.1 Mentora Behaviour Analysis

In Mentora, user groups (`groups` table) are pools of users managed by admins. A discount code (coupon) can be restricted to one or more groups via `discount_groups` (pivot). When a user applies a discount code at checkout, `Discount::checkValidDiscount()` checks:

```php
// mentora_production/app/Models/Discount.php — lines 217–223
if (!empty($this->discountGroups) and count($this->discountGroups)) {
    $groupsIds = $this->discountGroups()->pluck('group_id')->toArray();

    if (empty($user->userGroup) or !in_array($user->userGroup->group_id, $groupsIds)) {
        return trans('update.discount_code_group_error'); // rejected
    }
}
```

Key business rules:
1. A discount code **may** have zero group restrictions (available to all eligible users)
2. A discount code **may** have one or more group IDs attached — only users in those groups can apply it
3. User group membership is checked at checkout, not at ticket creation time
4. A user can belong to only one group in Mentora (`$user->userGroup`) — in UBOTZ 2.0, `UserGroupRepositoryInterface::getUserGroupIds()` returns an array, so users can be in multiple groups

### 2.2 What's Already Done vs. Missing

**Already done (ticket-level group restriction):**
- `TicketEntity::allowedGroupIds` + `isGroupAllowed(array $userGroupIds): bool`
- `CalculateCoursePriceUseCase` fetches user's group IDs and passes them to ticket validation
- This covers **time-limited percentage ticket codes restricted to user groups**

**Missing (standalone coupon/discount code system):**
Mentora has a separate `discounts` table for coupon codes distinct from course tickets. A coupon code can be:
- Global (any course/category/all)
- Source-scoped: course-specific, category-specific, bundle-specific
- User-type scoped: all users vs. specific users
- **Group-restricted:** only users in allowed groups can apply it

This standalone coupon system is a wider feature than just "user group" restriction — it is the full **Discount/Coupon bounded context**, of which user group restriction is one aspect. The scope for this P3 task is specifically the **group-restriction layer** applied within the existing ticket system AND the foundation for a standalone coupon code system.

### 2.3 Scope Decision

> [!IMPORTANT]
> Building the full standalone coupon system (all sources, all types) is equivalent to the entire Payment/Cart/Discount bounded context migration — that is scope for a future P1/P2 ticket. **This P3 ticket covers only:**
> 1. Ensuring ticket-level group restrictions work end-to-end (already partially done — verify and fix)
> 2. Adding an admin endpoint to configure which user groups are allowed on a given ticket
> 3. Adding the foundation `DiscountEntity` for standalone coupon codes (domain model only, no HTTP endpoints in this P3)

### 2.4 Phase 2 — Domain Layer

#### Part A: Verify and Complete Ticket Group Restriction

**Check:** Does `TicketRepositoryInterface` and its Eloquent implementation load `allowedGroupIds` correctly?

Locate `app/Infrastructure/Persistence/TenantAdminDashboard/Course/EloquentTicketRepository.php`.  
Verify `toEntity()` maps `allowed_group_ids` (JSON column or pivot table) to `TicketEntity::$allowedGroupIds`.

If the column/pivot is missing from the migration, add it:

```php
// database/migrations/tenant/YYYY_MM_DD_add_allowed_group_ids_to_tickets_table.php
Schema::table('tickets', function (Blueprint $table) {
    $table->json('allowed_group_ids')->nullable()->after('capacity');
    // Stores [] or [1, 3, 7] — JSON array of UserGroup IDs
});
```

> **Why JSON column instead of pivot?** The `tickets` table is tenant-scoped and user groups are tenant-scoped. A JSON column avoids a separate pivot migration for this P3 task and is sufficient for the current use case (read and match in-memory via `isGroupAllowed()`). A proper pivot table can be introduced if reporting on group-discount usage becomes needed.

#### Part B: `DiscountEntity` (Domain Foundation for Future Coupon System)

**File 1: `DiscountEntity`**  
`app/Domain/TenantAdminDashboard/Discount/Entities/DiscountEntity.php`

```php
<?php

declare(strict_types=1);

namespace App\Domain\TenantAdminDashboard\Discount\Entities;

use App\Domain\TenantAdminDashboard\Discount\ValueObjects\DiscountCode;
use App\Domain\TenantAdminDashboard\Discount\ValueObjects\DiscountSource;
use App\Domain\TenantAdminDashboard\Discount\ValueObjects\DiscountType;
use App\Domain\TenantAdminDashboard\Discount\Exceptions\DiscountExpiredException;
use App\Domain\TenantAdminDashboard\Discount\Exceptions\DiscountGroupRestrictionException;
use App\Domain\TenantAdminDashboard\Discount\Exceptions\DiscountCapacityExceededException;
use Carbon\CarbonImmutable;

final class DiscountEntity
{
    /**
     * @param int[]   $allowedGroupIds  Empty = available to all groups
     * @param int[]   $allowedCourseIds Empty = applies to all courses (when source = 'course')
     */
    public function __construct(
        public readonly ?int           $id,
        public readonly int            $tenantId,
        public readonly string         $title,
        public readonly DiscountCode   $code,
        public readonly DiscountType   $type,         // 'percentage' | 'fixed_amount'
        public readonly DiscountSource $source,       // 'all' | 'course' | 'category'
        public readonly int            $discountValue, // percent (0-100) or cents
        public readonly int            $usageLimit,
        public readonly int            $usedCount,
        public readonly CarbonImmutable $expiresAt,
        public readonly bool           $isActive,
        public readonly array          $allowedGroupIds  = [],
        public readonly array          $allowedCourseIds = [],
        public readonly ?int           $minimumOrderCents = null,
        public readonly bool           $forFirstPurchaseOnly = false,
    ) {}

    /** Business rule: can this user (with these group memberships) apply this discount? */
    public function assertEligible(array $userGroupIds, CarbonImmutable $now): void
    {
        if ($now->isAfter($this->expiresAt)) {
            throw DiscountExpiredException::forCode($this->code->getValue());
        }

        if ($this->usedCount >= $this->usageLimit) {
            throw DiscountCapacityExceededException::forCode($this->code->getValue());
        }

        if (!empty($this->allowedGroupIds)) {
            $overlap = array_intersect($this->allowedGroupIds, $userGroupIds);
            if (empty($overlap)) {
                throw DiscountGroupRestrictionException::forCode($this->code->getValue());
            }
        }
    }

    public function apply(int $amountCents): int
    {
        if ($this->type->isPercentage()) {
            return (int) round($amountCents * $this->discountValue / 100);
        }

        // fixed_amount: discount value IS in cents
        return min($this->discountValue, $amountCents);
    }
}
```

**File 2: `DiscountCode` Value Object**  
`app/Domain/TenantAdminDashboard/Discount/ValueObjects/DiscountCode.php`

```php
<?php

declare(strict_types=1);

namespace App\Domain\TenantAdminDashboard\Discount\ValueObjects;

final class DiscountCode
{
    public function __construct(private readonly string $value)
    {
        if (strlen(trim($value)) < 3 || strlen($value) > 64) {
            throw new \InvalidArgumentException("Discount code must be 3–64 characters.");
        }
    }

    public function getValue(): string { return strtoupper(trim($this->value)); }
    public function equals(self $other): bool { return $this->getValue() === $other->getValue(); }
}
```

**File 3: `DiscountType` Value Object**  
`app/Domain/TenantAdminDashboard/Discount/ValueObjects/DiscountType.php`

```php
<?php

declare(strict_types=1);

namespace App\Domain\TenantAdminDashboard\Discount\ValueObjects;

final class DiscountType
{
    private const PERCENTAGE   = 'percentage';
    private const FIXED_AMOUNT = 'fixed_amount';
    private const ALLOWED      = [self::PERCENTAGE, self::FIXED_AMOUNT];

    public function __construct(private readonly string $value)
    {
        if (!in_array($value, self::ALLOWED, true)) {
            throw new \InvalidArgumentException("Invalid discount type: {$value}");
        }
    }

    public function isPercentage(): bool { return $this->value === self::PERCENTAGE; }
    public function isFixedAmount(): bool { return $this->value === self::FIXED_AMOUNT; }
    public function getValue(): string { return $this->value; }

    public static function percentage(): self { return new self(self::PERCENTAGE); }
    public static function fixedAmount(): self { return new self(self::FIXED_AMOUNT); }
}
```

**File 4: `DiscountSource` Value Object**  
`app/Domain/TenantAdminDashboard/Discount/ValueObjects/DiscountSource.php`

```php
<?php

declare(strict_types=1);

namespace App\Domain\TenantAdminDashboard\Discount\ValueObjects;

final class DiscountSource
{
    private const ALL      = 'all';
    private const COURSE   = 'course';
    private const CATEGORY = 'category';
    private const ALLOWED  = [self::ALL, self::COURSE, self::CATEGORY];

    public function __construct(private readonly string $value)
    {
        if (!in_array($value, self::ALLOWED, true)) {
            throw new \InvalidArgumentException("Invalid discount source: {$value}");
        }
    }

    public function getValue(): string { return $this->value; }
    public static function all(): self { return new self(self::ALL); }
    public static function course(): self { return new self(self::COURSE); }
    public static function category(): self { return new self(self::CATEGORY); }
}
```

**File 5: Domain Exceptions**

```
app/Domain/TenantAdminDashboard/Discount/Exceptions/DiscountNotFoundException.php
app/Domain/TenantAdminDashboard/Discount/Exceptions/DiscountExpiredException.php
app/Domain/TenantAdminDashboard/Discount/Exceptions/DiscountCapacityExceededException.php
app/Domain/TenantAdminDashboard/Discount/Exceptions/DiscountGroupRestrictionException.php
```

Each follows the standard pattern:

```php
final class DiscountNotFoundException extends \DomainException
{
    public static function forCode(string $code): self
    {
        return new self("Discount code not found: {$code}");
    }
}
```

**File 6: `DiscountRepositoryInterface`**  
`app/Domain/TenantAdminDashboard/Discount/Repositories/DiscountRepositoryInterface.php`

```php
interface DiscountRepositoryInterface
{
    public function findByCode(int $tenantId, string $code): ?DiscountEntity;
    public function findById(int $tenantId, int $id): ?DiscountEntity;
    public function save(DiscountEntity $discount): DiscountEntity;
    public function delete(int $tenantId, int $id): void;
    /** Atomically increments used_count — must use pessimistic lock. */
    public function incrementUsage(int $tenantId, int $id): void;
}
```

### 2.5 Phase 6 — Database Migration

**File 7: Migration**  
`database/migrations/tenant/YYYY_MM_DD_create_discount_codes_table.php`

```php
Schema::create('discount_codes', function (Blueprint $table) {
    $table->id();
    $table->unsignedBigInteger('tenant_id');
    $table->string('title', 255);
    $table->string('code', 64);
    $table->string('type', 30)->default('percentage');      // 'percentage' | 'fixed_amount'
    $table->string('source', 30)->default('all');           // 'all' | 'course' | 'category'
    $table->unsignedBigInteger('discount_value');           // percent (0-100) or cents
    $table->unsignedInteger('usage_limit')->default(1);
    $table->unsignedInteger('used_count')->default(0);
    $table->timestamp('expires_at');
    $table->boolean('is_active')->default(true);
    $table->json('allowed_group_ids')->nullable();          // [] or [1,3]
    $table->json('allowed_course_ids')->nullable();         // for source='course'
    $table->unsignedBigInteger('minimum_order_cents')->nullable();
    $table->boolean('for_first_purchase_only')->default(false);
    $table->timestamps();

    $table->unique(['tenant_id', 'code'], 'unq_discount_codes_tenant_code');
    $table->index(['tenant_id', 'is_active'], 'idx_discount_codes_tenant_active');
    $table->foreign('tenant_id', 'fk_discount_codes_tenants')
        ->references('id')->on('tenants')->onDelete('cascade');
});
```

> **Column naming:** `discount_value` stores percent OR cents depending on `type`. This avoids two nullable columns. Application layer interprets based on `type`. The `_cents` suffix is NOT used here because the value is context-dependent (it is only in cents when `type = fixed_amount`).

### 2.6 Tests to Write

`tests/Feature/TenantDashboard/Discount/DiscountGroupRestrictionTest.php`

- `discount_code_is_rejected_when_user_not_in_allowed_group`
- `discount_code_is_accepted_when_user_in_allowed_group`
- `discount_code_with_no_group_restriction_is_accepted_by_all_users`
- `tenant_a_cannot_use_tenant_b_discount_code`

---

## 3. Feature 6: Student Invoice Generation

### 3.1 Mentora Behaviour Analysis

Mentora's `WebinarController::invoice($webinarId, $saleId)` fetches:
1. The `Sale` record, verified to belong to the requesting user (or via gift)
2. The `Webinar` (course) — must be `active`
3. Renders a Blade view: `panel.webinar.invoice` containing: sale details, buyer name, course title, teacher name, order amount, created_at

The `SaleController::invoice()` and `MyPurchaseController::invoice()` serve the same data from the store/purchase perspective. All three render a **Blade view** for web.

**UBOTZ 2.0 approach:** Return a **JSON response** with invoice data (the frontend renders it), with an optional **PDF download endpoint** using a PHP PDF library. Do NOT render Blade views — UBOTZ is a headless API.

### 3.2 Business Rules

1. Only the buyer can view their own invoice (anti-enumeration: return 404 if not found/not theirs)
2. The sale must NOT have `refund_at` set (not refunded)
3. Include: invoice number, buyer name, course title, teacher name, purchase date, amount paid, discount applied (if any)
4. An invoice is **immutable** — once generated, the data it displays is locked to what was recorded at time of sale

### 3.3 Files to Create

#### Phase 2 — Domain Layer

**File 1: `StudentInvoiceEntity`**  
`app/Domain/TenantAdminDashboard/Payment/Entities/StudentInvoiceEntity.php`

```php
<?php

declare(strict_types=1);

namespace App\Domain\TenantAdminDashboard\Payment\Entities;

use App\Domain\TenantAdminDashboard\Payment\ValueObjects\InvoiceNumber;
use DateTimeImmutable;

final class StudentInvoiceEntity
{
    public function __construct(
        public readonly ?int            $id,
        public readonly InvoiceNumber   $invoiceNumber,
        public readonly int             $tenantId,
        public readonly int             $saleId,
        public readonly int             $buyerUserId,
        public readonly string          $buyerName,
        public readonly string          $courseTitle,
        public readonly string          $teacherName,
        public readonly int             $courseId,
        public readonly int             $amountPaidCents,
        public readonly int             $discountAmountCents,
        public readonly string          $currency,
        public readonly string          $paymentMethod,
        public readonly ?string         $orderReference,
        public readonly DateTimeImmutable $purchasedAt,
        public readonly DateTimeImmutable $generatedAt,
    ) {}
}
```

**File 2: `StudentInvoiceRepositoryInterface`**  
`app/Domain/TenantAdminDashboard/Payment/Repositories/StudentInvoiceRepositoryInterface.php`

```php
interface StudentInvoiceRepositoryInterface
{
    public function findById(int $tenantId, int $id): ?StudentInvoiceEntity;
    public function findBySaleId(int $tenantId, int $saleId): ?StudentInvoiceEntity;
    public function save(StudentInvoiceEntity $invoice): void;
    public function nextInvoiceNumber(int $tenantId): string;
}
```

**File 3: Domain Exception**  
`app/Domain/TenantAdminDashboard/Payment/Exceptions/InvoiceNotFoundException.php`

```php
final class InvoiceNotFoundException extends \DomainException
{
    public static function forSale(int $saleId): self
    {
        return new self("Invoice not found for sale: {$saleId}");
    }
}
```

#### Phase 3 — Application Layer

**File 4: Query — `GetStudentInvoiceQuery`**  
`app/Application/TenantAdminDashboard/Payment/Queries/GetStudentInvoiceQuery.php`

```php
final class GetStudentInvoiceQuery
{
    public function __construct(
        private readonly StudentInvoiceRepositoryInterface $invoiceRepository,
    ) {}

    public function execute(int $tenantId, int $invoiceId): StudentInvoiceEntity
    {
        $invoice = $this->invoiceRepository->findById($tenantId, $invoiceId);
        if ($invoice === null) {
            throw StudentInvoiceNotFoundException::withId($invoiceId);
        }
        return $invoice;
    }
}
```

**File 5: UseCase — `GenerateStudentInvoiceUseCase`**  
`app/Application/TenantAdminDashboard/Payment/UseCases/GenerateStudentInvoiceUseCase.php`
- Orchestrates fetching sale data and persisting it to `student_invoices`.

#### Phase 4 — Infrastructure Layer

**File 6: `EloquentStudentInvoiceRepository`**  
`app/Infrastructure/Persistence/TenantAdminDashboard/Payment/EloquentStudentInvoiceRepository.php`
- Handles persistence for the `student_invoices` table.

**File 7: `StudentInvoiceRecord` (Eloquent Model)**  
`app/Infrastructure/Persistence/TenantAdminDashboard/Payment/StudentInvoiceRecord.php`

**File 8: PDF Service Implementation**  
`app/Infrastructure/Services/StudentInvoicePdfGenerator.php`

#### Phase 6 — Database Migration

**File 9: Migration `create_student_invoices_table`**
```php
Schema::create('student_invoices', function (Blueprint $table) {
    $table->id();
    $table->unsignedBigInteger('tenant_id')->index();
    $table->unsignedBigInteger('sale_id')->index();
    $table->string('invoice_number')->unique();
    $table->unsignedBigInteger('buyer_user_id');
    $table->string('buyer_name');
    $table->string('course_title');
    $table->string('teacher_name');
    $table->unsignedBigInteger('course_id');
    $table->unsignedBigInteger('amount_paid_cents');
    $table->unsignedBigInteger('discount_amount_cents');
    $table->string('currency', 3);
    $table->string('payment_method');
    $table->string('order_reference')->nullable();
    $table->timestamp('purchased_at');
    $table->timestamp('generated_at');
    $table->timestamps();
});
```

#### Phase 5 — HTTP Layer

**File 10: Controller — `StudentInvoiceReadController`**  

```php
final class StudentInvoiceReadController extends Controller
{
    public function show(int $id, GetStudentInvoiceQuery $query): JsonResponse
    {
        $tenantId = app(TenantContext::class)->getIdOrFail();
        $invoice = $query->execute($tenantId, $id);

        return response()->json(['data' => new StudentInvoiceResource($invoice)]);
    }

    public function download(int $id, GetStudentInvoiceQuery $query, StudentInvoicePdfGeneratorInterface $pdfGenerator): Response
    {
        $tenantId = app(TenantContext::class)->getIdOrFail();
        $invoice = $query->execute($tenantId, $id);
        $pdf = $pdfGenerator->generate($invoice);

        return response($pdf, 200, [
            'Content-Type' => 'application/pdf',
            'Content-Disposition' => "attachment; filename=\"{$invoice->invoiceNumber->toString()}.pdf\"",
        ]);
    }
}
```

**File 8: Routes**  
`routes/tenant_dashboard/payment.php` — add:

```php
Route::prefix('student-invoices')->group(function () {
    Route::get('/{id}',          [StudentInvoiceReadController::class, 'show']);
    Route::get('/{id}/download', [StudentInvoiceReadController::class, 'download']);
});
```

**File 9: `InvoiceResource`**  
`app/Http/Resources/TenantAdminDashboard/Payment/InvoiceResource.php`

Returns: `invoice_number`, `buyer_name`, `course_title`, `teacher_name`, `amount_paid` (in currency units), `discount_amount`, `payment_method`, `order_reference`, `purchased_at`.

### 3.4 Tests to Write

`tests/Feature/TenantDashboard/Payment/InvoiceTest.php`

- `buyer_can_view_own_invoice`
- `buyer_cannot_view_another_buyers_invoice` → 404
- `refunded_sale_returns_404`
- `invoice_number_format_is_correct`
- `pdf_download_returns_content_type_pdf`
- `tenant_a_cannot_view_tenant_b_invoice` → 404

---

## 4. Feature 7: Student List Export (Excel)

### 4.1 Mentora Behaviour Analysis

```php
// mentora_production/app/Http/Controllers/Api/Instructor/WebinarsController.php — lines 880-919
$sales = Sale::where('type', 'webinar')
    ->where('webinar_id', $webinar->id)
    ->whereNull('refund_at')
    ->whereHas('buyer')
    ->with(['buyer' => fn($q) => $q->select('id', 'full_name', 'email', 'mobile')])
    ->get();

$export = new WebinarStudents($sales);
return Excel::download($export, trans('panel.users') . '.xlsx');
```

`WebinarStudents` export class maps each sale to: `full_name`, `email`, `mobile`, `purchase_date`.

### 4.2 Backend Current State

The route `GET /courses/{id}/export-students` already exists in `routes/tenant_dashboard/course.php`. The `CourseStudentExportQueryInterface` is already bound in `CourseServiceProvider`.

**Verify these files exist and are complete:**

1. `app/Domain/TenantAdminDashboard/Course/Repositories/CourseStudentExportQueryInterface.php` — interface
2. `app/Infrastructure/Persistence/TenantAdminDashboard/Course/EloquentCourseStudentExportQuery.php` — implementation  
3. The controller method `CourseReadController::exportStudents()` — must call the query and stream a file

If any of these are stubs (empty or partial), complete them as described below.

### 4.3 Files to Create/Complete

#### Phase 3 — Application Layer

**File 1: Query (if stub) — `ExportCourseStudentsQuery`**  
`app/Application/TenantAdminDashboard/Course/Queries/ExportCourseStudentsQuery.php`

```php
<?php

declare(strict_types=1);

namespace App\Application\TenantAdminDashboard\Course\Queries;

use App\Domain\TenantAdminDashboard\Course\Repositories\CourseRepositoryInterface;
use App\Domain\TenantAdminDashboard\Course\Repositories\CourseStudentExportQueryInterface;
use App\Domain\Shared\Exceptions\EntityNotFoundException;

final class ExportCourseStudentsQuery
{
    public function __construct(
        private readonly CourseRepositoryInterface $courseRepository,
        private readonly CourseStudentExportQueryInterface $exportQuery,
    ) {}

    /** @return array<array{full_name: string, email: string, mobile: ?string, purchased_at: string}> */
    public function execute(int $tenantId, int $courseId): array
    {
        $course = $this->courseRepository->findById($tenantId, $courseId);

        if ($course === null) {
            throw EntityNotFoundException::fromId('Course', $courseId);
        }

        return $this->exportQuery->getEnrolledStudentRows($tenantId, $courseId);
    }
}
```

**File 2: Repository Interface (if not complete)**  
`app/Domain/TenantAdminDashboard/Course/Repositories/CourseStudentExportQueryInterface.php`

```php
interface CourseStudentExportQueryInterface
{
    /**
     * @return array<array{full_name: string, email: string, mobile: ?string, purchased_at: string}>
     */
    public function getEnrolledStudentRows(int $tenantId, int $courseId): array;
}
```

#### Phase 4 — Infrastructure Layer

**File 3: Excel Export Service Interface**  
`app/Domain/Shared/Export/SpreadsheetExporterInterface.php`

```php
interface SpreadsheetExporterInterface
{
    /**
     * @param string[][] $headers  Column headers
     * @param array[]    $rows
     * @return string  Raw Excel binary content
     */
    public function export(array $headers, array $rows): string;
}
```

Infrastructure implementation uses `maatwebsite/excel` (already in the project per Mentora legacy) or `phpoffice/phpspreadsheet`.

**File 4: `EloquentCourseStudentExportQuery`** (if stub/missing)  
`app/Infrastructure/Persistence/TenantAdminDashboard/Course/EloquentCourseStudentExportQuery.php`

```php
public function getEnrolledStudentRows(int $tenantId, int $courseId): array
{
    // Join sales → users (buyer)
    // WHERE sales.tenant_id = $tenantId
    //   AND sales.course_id = $courseId
    //   AND sales.refund_at IS NULL
    // SELECT buyer.full_name, buyer.email, buyer.mobile, sales.created_at
    // ORDER BY sales.created_at ASC
}
```

#### Phase 5 — HTTP Layer

**File 5: Controller method in `CourseReadController`**

```php
public function exportStudents(
    int $courseId,
    ExportCourseStudentsQuery $query,
    SpreadsheetExporterInterface $exporter,
): Response {
    $tenantId = app(TenantContext::class)->getIdOrFail();

    $rows = $query->execute($tenantId, $courseId);

    $headers = ['Full Name', 'Email', 'Mobile', 'Purchase Date'];
    $data    = array_map(fn($r) => [
        $r['full_name'],
        $r['email'],
        $r['mobile'] ?? '',
        $r['purchased_at'],
    ], $rows);

    $content = $exporter->export($headers, $data);

    return response($content, 200, [
        'Content-Type'        => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition' => "attachment; filename=\"students-course-{$courseId}.xlsx\"",
    ]);
}
```

### 4.4 Tests to Write

`tests/Feature/TenantDashboard/Course/CourseStudentExportTest.php`

- `instructor_can_export_student_list`
- `export_excludes_refunded_enrollments`
- `export_returns_correct_columns`
- `tenant_a_cannot_export_tenant_b_course_students` → 404

---

## 5. Feature 8: i18n / Translations

### 5.1 Mentora Behaviour Analysis

Mentora uses `astrotomic/laravel-translatable`. Course (`Webinar`) model has:

```php
// mentora_production/app/Models/Webinar.php
public $translatedAttributes = ['title', 'description', 'seo_description'];
```

Translation records live in `webinar_translations` table:

```sql
CREATE TABLE webinar_translations (
    id BIGINT UNSIGNED PRIMARY KEY,
    webinar_id INT UNSIGNED,
    locale VARCHAR(191),  -- 'en', 'ar', 'hi', etc.
    title VARCHAR(255),
    seo_description TEXT NULL,
    description LONGTEXT NULL,
    FOREIGN KEY (webinar_id) REFERENCES webinars(id) ON DELETE CASCADE
)
```

Title, description, and SEO description are fetched in the request's current locale, falling back to the default locale.

### 5.2 UBOTZ 2.0 Design Decisions

> [!IMPORTANT]
> **Do NOT add `astrotomic/laravel-translatable` to UBOTZ 2.0.** That package ties translation logic to Eloquent models — an infrastructure concern. In UBOTZ 2.0, translation is handled via:
> 1. A separate `course_translations` table
> 2. An explicit `locale` parameter in queries (no magic locale detection in Eloquent)
> 3. `CourseTranslationEntity` in the Domain layer
> 4. The `CourseEntity` holds a `translations` array of `CourseTranslationEntity` objects

### 5.3 Scope

Translate: `title`, `description`, `seo_description` for courses.  
Apply the same pattern to `chapters` (title) if desired in this sprint, but it's optional for P3.

### 5.4 Files to Create

#### Phase 2 — Domain Layer

**File 1: `CourseTranslationEntity`**  
`app/Domain/TenantAdminDashboard/Course/Entities/CourseTranslationEntity.php`

```php
<?php

declare(strict_types=1);

namespace App\Domain\TenantAdminDashboard\Course\Entities;

final class CourseTranslationEntity
{
    public function __construct(
        public readonly ?int    $id,
        public readonly int     $courseId,
        public readonly string  $locale,   // 'en', 'ar', 'hi', etc.
        public readonly string  $title,
        public readonly ?string $description    = null,
        public readonly ?string $seoDescription = null,
    ) {}

    public static function create(
        int $courseId, string $locale, string $title,
        ?string $description = null, ?string $seoDescription = null,
    ): self {
        if (strlen(trim($locale)) !== 2 && strlen(trim($locale)) !== 5) {
            throw new \InvalidArgumentException("Locale must be 2 or 5 chars (e.g. 'en', 'ar', 'hi-IN').");
        }

        if (empty(trim($title))) {
            throw new \InvalidArgumentException("Translation title cannot be empty.");
        }

        return new self(null, $courseId, strtolower(trim($locale)), trim($title), $description, $seoDescription);
    }
}
```

**File 2: `CourseTranslationRepositoryInterface`**  
`app/Domain/TenantAdminDashboard/Course/Repositories/CourseTranslationRepositoryInterface.php`

```php
interface CourseTranslationRepositoryInterface
{
    /** @return CourseTranslationEntity[] */
    public function findByCourseId(int $tenantId, int $courseId): array;

    public function findByCourseIdAndLocale(int $tenantId, int $courseId, string $locale): ?CourseTranslationEntity;

    public function save(int $tenantId, CourseTranslationEntity $translation): CourseTranslationEntity;

    public function deleteByLocale(int $tenantId, int $courseId, string $locale): void;

    /** Replace all translations for a course with the given array (upsert). */
    public function syncAll(int $tenantId, int $courseId, array $translations): void;
}
```

**File 3: Domain Events**

```
CourseTranslationSaved.php
CourseTranslationDeleted.php
```

Both are pure PHP, immutable, past-tense named.

#### Phase 3 — Application Layer

**File 4: `SyncCourseTranslationsCommand`**  
`app/Application/TenantAdminDashboard/Course/Commands/SyncCourseTranslationsCommand.php`

```php
<?php

declare(strict_types=1);

namespace App\Application\TenantAdminDashboard\Course\Commands;

final class SyncCourseTranslationsCommand
{
    /**
     * @param array<array{locale: string, title: string, description: ?string, seo_description: ?string}> $translations
     */
    public function __construct(
        public readonly int   $tenantId,
        public readonly int   $courseId,
        public readonly array $translations,
        public readonly ?int  $actorId = null,
    ) {}
}
```

**File 5: `SyncCourseTranslationsUseCase`**  
`app/Application/TenantAdminDashboard/Course/UseCases/SyncCourseTranslationsUseCase.php`

```php
public function execute(SyncCourseTranslationsCommand $command): void
{
    $course = $this->courseRepository->findById($command->tenantId, $command->courseId);
    if (!$course) { throw CourseNotFoundException::withId($command->courseId); }

    $entities = [];
    foreach ($command->translations as $t) {
        $entities[] = CourseTranslationEntity::create(
            $command->courseId,
            $t['locale'],
            $t['title'],
            $t['description'] ?? null,
            $t['seo_description'] ?? null,
        );
    }

    DB::transaction(function () use ($command, $entities) {
        $this->translationRepository->syncAll($command->tenantId, $command->courseId, $entities);

        $this->auditLogger->log(new AuditContext(
            tenantId: $command->tenantId,
            userId: $command->actorId ?? 0,
            action: 'course.translations_synced',
            entityType: 'course',
            entityId: $command->courseId,
            metadata: ['locale_count' => count($entities)],
        ));
    });
}
```

**File 6: `GetCourseTranslationsQuery`**  
`app/Application/TenantAdminDashboard/Course/Queries/GetCourseTranslationsQuery.php`

```php
public function execute(int $tenantId, int $courseId): array
{
    // Returns array of CourseTranslationEntity
}
```

#### Phase 4 — Infrastructure Layer

**File 7: `CourseTranslationRecord`**  
`app/Infrastructure/Persistence/TenantAdminDashboard/Course/CourseTranslationRecord.php`

```php
final class CourseTranslationRecord extends Model
{
    use BelongsToTenant;

    protected $table = 'course_translations';
    protected $fillable = ['tenant_id', 'course_id', 'locale', 'title', 'description', 'seo_description'];
}
```

**File 8: `EloquentCourseTranslationRepository`**  
Implements `CourseTranslationRepositoryInterface`.  
`syncAll()` uses `upsert()` keyed on `[tenant_id, course_id, locale]` then deletes locales not in the new set.

#### Phase 6 — Database Migration

**File 9: Migration**  
`database/migrations/tenant/YYYY_MM_DD_create_course_translations_table.php`

```php
Schema::create('course_translations', function (Blueprint $table) {
    $table->id();
    $table->unsignedBigInteger('tenant_id');
    $table->unsignedBigInteger('course_id');
    $table->string('locale', 10);              // 'en', 'ar', 'hi', etc.
    $table->string('title', 500);
    $table->longText('description')->nullable();
    $table->text('seo_description')->nullable();
    $table->timestamps();

    $table->unique(['tenant_id', 'course_id', 'locale'], 'unq_course_translations_tenant_course_locale');
    $table->index(['tenant_id', 'course_id'], 'idx_course_translations_tenant_course');
    $table->foreign('tenant_id', 'fk_course_translations_tenants')
        ->references('id')->on('tenants')->onDelete('cascade');
    $table->foreign('course_id', 'fk_course_translations_courses')
        ->references('id')->on('courses')->onDelete('cascade');
});
```

> **Note:** `title`, `description`, `seo_description` remain on the `courses` table as the **default locale** values. The `course_translations` table is for additional locales only. This avoids breaking existing queries.

#### Phase 5 — HTTP Layer

**File 10: Routes**  
Add inside `courses/{courseId}` prefix group in `course.php`:

```php
Route::get('/translations',  [CourseTranslationController::class, 'index']);
Route::post('/translations', [CourseTranslationController::class, 'sync']);
```

**File 11: `CourseTranslationController`**

```php
final class CourseTranslationController extends Controller
{
    public function index(int $courseId, GetCourseTranslationsQuery $query): JsonResponse
    {
        // return all translations for the course
    }

    public function sync(SyncCourseTranslationsRequest $request, int $courseId, SyncCourseTranslationsUseCase $useCase): JsonResponse
    {
        // build command, execute, return 200
    }
}
```

**File 12: `SyncCourseTranslationsRequest`**

```php
public function rules(): array
{
    return [
        'translations'                  => ['required', 'array', 'min:1'],
        'translations.*.locale'         => ['required', 'string', 'size:2'],
        'translations.*.title'          => ['required', 'string', 'max:500'],
        'translations.*.description'    => ['sometimes', 'nullable', 'string'],
        'translations.*.seo_description' => ['sometimes', 'nullable', 'string', 'max:500'],
    ];
}
```

### 5.5 Tests to Write

`tests/Feature/TenantDashboard/Course/CourseTranslationTest.php`

- `instructor_can_sync_translations_for_multiple_locales`
- `syncing_translations_replaces_previous_locales`
- `invalid_locale_format_returns_422`
- `empty_title_returns_422`
- `tenant_a_cannot_edit_tenant_b_translations` → 404

---

## 6. Feature 9: Comments System

### 6.1 Mentora Behaviour Analysis

The Mentora `comments` table is polymorphic-ish: it has nullable `webinar_id`, `bundle_id`, `review_id`, `blog_id`, `product_id`. Comments are threaded via `reply_id` (self-referential). 

**Operations:**
- `store()` — student/user posts a comment on a course (requires `webinar_id`)
- `reply()` — instructor or original commenter replies to a comment
- `update()` — user edits their own comment (returns to `pending` status)
- `destroy()` — user deletes their own comment
- `report()` — user/instructor reports a comment to admin
- `myClassComments()` — instructor sees comments on their courses
- `myComments()` — student sees their own comments

**Status lifecycle:** `pending` → `active`; instructor reply auto-sets to `active`; edit resets to `pending`.

**In UBOTZ 2.0:** Scope to **course comments only** (not bundle/blog/product — those are separate bounded contexts). Use `BlogCommentEntity` in the Blog bounded context as the reference pattern.

### 6.2 Files to Create

#### Phase 2 — Domain Layer

**File 1: `CourseCommentEntity`**  
`app/Domain/TenantAdminDashboard/Course/Entities/CourseCommentEntity.php`

Model after `BlogCommentEntity` (which is already DDD-compliant):

```php
<?php

declare(strict_types=1);

namespace App\Domain\TenantAdminDashboard\Course\Entities;

use App\Domain\Shared\Aggregate\AggregateRoot;
use App\Domain\TenantAdminDashboard\Course\Events\CourseCommentPosted;
use App\Domain\TenantAdminDashboard\Course\Events\CourseCommentApproved;
use App\Domain\TenantAdminDashboard\Course\Events\CourseCommentDeleted;
use App\Domain\TenantAdminDashboard\Course\ValueObjects\CommentStatus;

final class CourseCommentEntity extends AggregateRoot
{
    private function __construct(
        private readonly ?int         $id,
        private readonly int          $tenantId,
        private readonly int          $courseId,
        private readonly int          $authorUserId,
        private readonly ?int         $parentCommentId, // null = top-level
        private string                $body,
        private CommentStatus         $status,
    ) {}

    public static function create(
        int $tenantId, int $courseId, int $authorUserId,
        ?int $parentCommentId, string $body,
    ): self {
        if (empty(trim($body))) {
            throw new \InvalidArgumentException("Comment body cannot be empty.");
        }

        $entity = new self(
            id: null,
            tenantId: $tenantId,
            courseId: $courseId,
            authorUserId: $authorUserId,
            parentCommentId: $parentCommentId,
            body: trim($body),
            status: CommentStatus::pending(),
        );

        $entity->recordEvent(new CourseCommentPosted(
            tenantId: $tenantId,
            courseId: $courseId,
            authorUserId: $authorUserId,
            isReply: $parentCommentId !== null,
        ));

        return $entity;
    }

    public static function reconstitute(
        int $id, int $tenantId, int $courseId, int $authorUserId,
        ?int $parentCommentId, string $body, CommentStatus $status,
    ): self {
        return new self($id, $tenantId, $courseId, $authorUserId, $parentCommentId, $body, $status);
    }

    public function approve(): void
    {
        $this->status = CommentStatus::active();
        $this->recordEvent(new CourseCommentApproved(
            tenantId: $this->tenantId,
            courseId: $this->courseId,
            commentId: $this->id,
        ));
    }

    /** Instructor replies auto-approve. */
    public function replyAsInstructor(int $tenantId, int $courseId, int $instructorId, string $body): self
    {
        $reply = new self(
            id: null,
            tenantId: $tenantId,
            courseId: $courseId,
            authorUserId: $instructorId,
            parentCommentId: $this->id,
            body: trim($body),
            status: CommentStatus::active(), // instructor replies are pre-approved
        );

        $reply->recordEvent(new CourseCommentPosted(
            tenantId: $tenantId,
            courseId: $courseId,
            authorUserId: $instructorId,
            isReply: true,
        ));

        return $reply;
    }

    public function editBody(string $newBody): void
    {
        if (empty(trim($newBody))) {
            throw new \InvalidArgumentException("Comment body cannot be empty.");
        }
        $this->body   = trim($newBody);
        $this->status = CommentStatus::pending(); // edit resets to pending
    }

    // Getters
    public function getId(): ?int { return $this->id; }
    public function getTenantId(): int { return $this->tenantId; }
    public function getCourseId(): int { return $this->courseId; }
    public function getAuthorUserId(): int { return $this->authorUserId; }
    public function getParentCommentId(): ?int { return $this->parentCommentId; }
    public function getBody(): string { return $this->body; }
    public function getStatus(): CommentStatus { return $this->status; }
    public function isTopLevel(): bool { return $this->parentCommentId === null; }
}
```

**File 2: `CommentStatus` Value Object**  
`app/Domain/TenantAdminDashboard/Course/ValueObjects/CommentStatus.php`

```php
final class CommentStatus
{
    private const PENDING = 'pending';
    private const ACTIVE  = 'active';
    private const ALLOWED = [self::PENDING, self::ACTIVE];

    public function __construct(private readonly string $value)
    {
        if (!in_array($value, self::ALLOWED, true)) {
            throw new \InvalidArgumentException("Invalid comment status: {$value}");
        }
    }

    public function isPending(): bool { return $this->value === self::PENDING; }
    public function isActive(): bool  { return $this->value === self::ACTIVE; }
    public function getValue(): string { return $this->value; }

    public static function pending(): self { return new self(self::PENDING); }
    public static function active(): self  { return new self(self::ACTIVE); }
}
```

**File 3: Domain Events**

```
app/Domain/TenantAdminDashboard/Course/Events/CourseCommentPosted.php
app/Domain/TenantAdminDashboard/Course/Events/CourseCommentApproved.php
app/Domain/TenantAdminDashboard/Course/Events/CourseCommentDeleted.php
```

**File 4: Domain Exceptions**

```
CourseCommentNotFoundException.php
CommentNotOwnedByUserException.php  -- 'user tried to edit/delete someone else's comment'
```

**File 5: `CourseCommentRepositoryInterface`**  
`app/Domain/TenantAdminDashboard/Course/Repositories/CourseCommentRepositoryInterface.php`

```php
interface CourseCommentRepositoryInterface
{
    public function findById(int $tenantId, int $id): ?CourseCommentEntity;

    /** Returns top-level comments (no parentCommentId) with active status, paginated. */
    public function listByCourse(int $tenantId, int $courseId, int $page, int $perPage): array;

    /** Returns approved replies for a given parent comment. */
    public function listReplies(int $tenantId, int $parentCommentId): array;

    /** Returns comments pending moderation for an instructor's courses. */
    public function listPendingByInstructor(int $tenantId, int $instructorUserId, int $page, int $perPage): array;

    public function save(CourseCommentEntity $comment): CourseCommentEntity;

    public function delete(int $tenantId, int $id): void;
}
```

#### Phase 3 — Application Layer (Commands + UseCases)

**Commands:**

```
PostCourseCommentCommand.php          (tenantId, courseId, authorUserId, parentCommentId, body, actorId)
EditCourseCommentCommand.php          (tenantId, commentId, authorUserId, newBody, actorId)
DeleteCourseCommentCommand.php        (tenantId, commentId, requestingUserId, actorId)
ApproveCourseCommentCommand.php       (tenantId, commentId, actorId)
ReplyToCourseCommentCommand.php       (tenantId, courseId, parentCommentId, instructorUserId, body, actorId)
```

**UseCases:**

```
PostCourseCommentUseCase.php
EditCourseCommentUseCase.php
DeleteCourseCommentUseCase.php
ApproveCourseCommentUseCase.php
ReplyToCourseCommentUseCase.php
```

All follow the standard template: precondition → entity mutation → DB::transaction(persist + audit) → dispatch events post-commit.

**Authorization rule for delete:**  
```php
// In DeleteCourseCommentUseCase:
$comment = $this->commentRepository->findById($command->tenantId, $command->commentId);
if ($comment === null) { throw CourseCommentNotFoundException::withId($command->commentId); }
// Only owner or instructor of the course can delete
if ($comment->getAuthorUserId() !== $command->requestingUserId) {
    $course = $this->courseRepository->findById($command->tenantId, $comment->getCourseId());
    if ($course === null || ($course->teacherId !== $command->requestingUserId && $course->createdBy !== $command->requestingUserId)) {
        throw new CommentNotOwnedByUserException("Not authorized to delete this comment.");
    }
}
```

**Queries:**

```
ListCourseCommentsQuery.php      -- public list of active comments for a course
ListInstructorPendingCommentsQuery.php  -- comments pending moderation
```

#### Phase 4 — Infrastructure Layer

**File 6: `CourseCommentRecord`**  
`app/Infrastructure/Persistence/TenantAdminDashboard/Course/CourseCommentRecord.php`

```php
final class CourseCommentRecord extends Model
{
    use BelongsToTenant;
    protected $table    = 'course_comments';
    protected $fillable = ['tenant_id', 'course_id', 'author_user_id', 'parent_comment_id', 'body', 'status'];
}
```

**File 7: `EloquentCourseCommentRepository`** — implements `CourseCommentRepositoryInterface`.

#### Phase 6 — Database Migration

**File 8: Migration**  
`database/migrations/tenant/YYYY_MM_DD_create_course_comments_table.php`

```php
Schema::create('course_comments', function (Blueprint $table) {
    $table->id();
    $table->unsignedBigInteger('tenant_id');
    $table->unsignedBigInteger('course_id');
    $table->unsignedBigInteger('author_user_id');
    $table->unsignedBigInteger('parent_comment_id')->nullable();  // null = top-level
    $table->text('body');
    $table->string('status', 30)->default('pending');  // 'pending' | 'active'
    $table->timestamps();

    $table->index(['tenant_id', 'course_id', 'status'], 'idx_course_comments_tenant_course_status');
    $table->index(['tenant_id', 'parent_comment_id'],   'idx_course_comments_tenant_parent');
    $table->foreign('tenant_id', 'fk_course_comments_tenants')
        ->references('id')->on('tenants')->onDelete('cascade');
});
```

#### Phase 5 — HTTP Layer

**Routes** (`routes/tenant_dashboard/course.php`):

```php
Route::prefix('{courseId}/comments')->group(function () {
    Route::get('/',                [CourseCommentReadController::class, 'index']);
    Route::post('/',               [CourseCommentWriteController::class, 'store']);
    Route::post('/{id}/reply',     [CourseCommentWriteController::class, 'reply']);
    Route::put('/{id}',            [CourseCommentWriteController::class, 'update']);
    Route::delete('/{id}',         [CourseCommentWriteController::class, 'destroy']);
    Route::patch('/{id}/approve',  [CourseCommentWriteController::class, 'approve']);
});

// Instructor-level moderation (pending comments across courses)
Route::get('/comments/pending', [CourseCommentReadController::class, 'pendingModeration']);
```

### 6.3 Tests to Write

`tests/Feature/TenantDashboard/Course/CourseCommentTest.php`

- `student_can_post_comment_on_enrolled_course`
- `comment_starts_in_pending_status`
- `instructor_reply_is_auto_approved`
- `instructor_can_approve_pending_comment`
- `user_can_edit_own_comment` and edit resets to pending
- `user_cannot_edit_other_users_comment` → 403
- `user_can_delete_own_comment`
- `instructor_can_delete_any_comment_on_their_course`
- `only_active_comments_shown_in_public_listing`
- `tenant_a_cannot_see_tenant_b_comments` → 404

---

## 7. Feature 10: Reward Points Integration

### 7.1 Mentora Behaviour Analysis

Mentora has a two-table reward system:

**`rewards` table** — configuration: each reward type has a score and optional condition.

**`rewards_accounting` table** — the ledger: every point earned/deducted creates a row.

`RewardAccounting::makeRewardAccounting($userId, $score, $type, $itemId, $checkDuplicate, $status)`:
1. Checks global rewards system is enabled (`getRewardsSettings()`)
2. If `$checkDuplicate = true`, checks if user already earned this type for this item
3. Creates ledger entry
4. Sends notification `user_get_new_point` to user

Course-specific trigger:

```php
// mentora_production/app/Models/Webinar.php — lines 791–797
public function handleLearningProgress100Reward($progress, $userId, $itemId)
{
    if ($progress >= 100) {
        $rewardScore = RewardAccounting::calculateScore(Reward::LEARNING_PROGRESS_100);
        RewardAccounting::makeRewardAccounting($userId, $rewardScore, Reward::LEARNING_PROGRESS_100, $itemId, true);
    }
}
```

Other reward triggers relevant to this P3 scope:
- `PASS_THE_QUIZ` — student passes a quiz
- `CERTIFICATE` — certificate is issued to student
- `LEARNING_PROGRESS_100` — student reaches 100% course progress

### 7.2 Design

This is a **new bounded context**: `app/Domain/TenantAdminDashboard/Reward/`.

Key design decisions:
1. **Reward configuration is tenant-specific** — each tenant can enable/disable reward types and set point values
2. **Double-spend prevention**: an event type + itemId combination can only earn points once per user (idempotency by `(tenant_id, user_id, reward_type, item_id)`)
3. **The ledger is append-only**: no updates, no deletes
4. **Point awards are triggered by domain events** — `ProgressReachedHundredPercent`, `QuizPassed`, `CertificateIssued` → listener awards points
5. **Certificate reward**: `CertificateIssued` domain event already exists (check `app/Domain/TenantAdminDashboard/Course/Events/`) — if so, wire into reward listener

### 7.3 Files to Create

#### Phase 2 — Domain Layer

**File 1: `RewardConfigEntity`**  
`app/Domain/TenantAdminDashboard/Reward/Entities/RewardConfigEntity.php`

```php
final class RewardConfigEntity
{
    public function __construct(
        public readonly ?int          $id,
        public readonly int           $tenantId,
        public readonly RewardType    $type,
        public readonly int           $pointsAwarded,  // positive integer
        public readonly bool          $isEnabled,
        public readonly ?string       $condition,      // optional threshold condition
    ) {}

    public function canAward(): bool { return $this->isEnabled && $this->pointsAwarded > 0; }
}
```

**File 2: `RewardType` Value Object**  
`app/Domain/TenantAdminDashboard/Reward/ValueObjects/RewardType.php`

```php
final class RewardType
{
    // P3 scope: only course-related reward types
    public const LEARNING_PROGRESS_100 = 'learning_progress_100';
    public const PASS_THE_QUIZ         = 'pass_the_quiz';
    public const CERTIFICATE           = 'certificate';
    public const REVIEW_COURSES        = 'review_courses';
    public const REGISTER              = 'register';

    private const ALLOWED = [
        self::LEARNING_PROGRESS_100,
        self::PASS_THE_QUIZ,
        self::CERTIFICATE,
        self::REVIEW_COURSES,
        self::REGISTER,
    ];

    public function __construct(private readonly string $value)
    {
        if (!in_array($value, self::ALLOWED, true)) {
            throw new \InvalidArgumentException("Invalid reward type: {$value}");
        }
    }

    public function getValue(): string { return $this->value; }
    public static function learningProgress100(): self { return new self(self::LEARNING_PROGRESS_100); }
    public static function passTheQuiz(): self         { return new self(self::PASS_THE_QUIZ); }
    public static function certificate(): self         { return new self(self::CERTIFICATE); }
}
```

**File 3: `RewardLedgerEntity`** (the ledger entry — append-only)  
`app/Domain/TenantAdminDashboard/Reward/Entities/RewardLedgerEntity.php`

```php
final class RewardLedgerEntity
{
    public const CREDIT = 'credit';
    public const DEBIT  = 'debit';

    public function __construct(
        public readonly ?int           $id,
        public readonly int            $tenantId,
        public readonly int            $userId,
        public readonly RewardType     $type,
        public readonly int            $points,
        public readonly string         $direction,  // 'credit' | 'debit'
        public readonly ?int           $itemId,     // courseId, quizId, etc.
        public readonly \DateTimeImmutable $createdAt,
    ) {}

    public static function credit(int $tenantId, int $userId, RewardType $type, int $points, ?int $itemId): self
    {
        return new self(null, $tenantId, $userId, $type, $points, self::CREDIT, $itemId, new \DateTimeImmutable());
    }
}
```

**File 4: Domain Event — `RewardPointsAwarded`**  
`app/Domain/TenantAdminDashboard/Reward/Events/RewardPointsAwarded.php`

```php
final class RewardPointsAwarded
{
    public function __construct(
        public readonly int        $tenantId,
        public readonly int        $userId,
        public readonly RewardType $type,
        public readonly int        $points,
        public readonly ?int       $itemId,
        public readonly \DateTimeImmutable $occurredAt = new \DateTimeImmutable(),
    ) {}
}
```

**File 5: Repository Interfaces**

`RewardConfigRepositoryInterface`:
```php
public function findByType(int $tenantId, RewardType $type): ?RewardConfigEntity;
public function findAll(int $tenantId): array;
public function save(RewardConfigEntity $config): RewardConfigEntity;
```

`RewardLedgerRepositoryInterface`:
```php
public function save(RewardLedgerEntity $entry): RewardLedgerEntity;
public function hasEntry(int $tenantId, int $userId, RewardType $type, int $itemId): bool;
public function getTotalPointsForUser(int $tenantId, int $userId): int;
public function getRecentForUser(int $tenantId, int $userId, int $limit): array;
```

**File 6: Domain Exception**  
`RewardAlreadyAwardedException.php` — thrown when duplicate award is attempted.

#### Phase 3 — Application Layer

**File 7: `AwardRewardPointsUseCase`**  
`app/Application/TenantAdminDashboard/Reward/UseCases/AwardRewardPointsUseCase.php`

This is the **central award logic**, called by all event listeners:

```php
final class AwardRewardPointsUseCase
{
    public function __construct(
        private readonly RewardConfigRepositoryInterface $configRepository,
        private readonly RewardLedgerRepositoryInterface $ledgerRepository,
        private readonly AuditLoggerInterface $auditLogger,
    ) {}

    public function execute(AwardRewardPointsCommand $command): void
    {
        // 1. Look up reward config for this type
        $config = $this->configRepository->findByType($command->tenantId, $command->rewardType);

        if ($config === null || !$config->canAward()) {
            return; // reward type not configured or disabled — silently skip
        }

        // 2. Idempotency: check if already awarded for this item
        if ($command->itemId !== null) {
            if ($this->ledgerRepository->hasEntry($command->tenantId, $command->userId, $command->rewardType, $command->itemId)) {
                return; // already awarded — idempotent no-op
            }
        }

        // 3. Create ledger entry
        $entry = RewardLedgerEntity::credit(
            $command->tenantId,
            $command->userId,
            $command->rewardType,
            $config->pointsAwarded,
            $command->itemId,
        );

        // 4. Transaction: persist + audit
        $savedEntry = DB::transaction(function () use ($entry, $command, $config) {
            $saved = $this->ledgerRepository->save($entry);

            $this->auditLogger->log(new AuditContext(
                tenantId: $command->tenantId,
                userId: $command->userId,
                action: 'reward.points_awarded',
                entityType: 'reward_ledger',
                entityId: $saved->id ?? 0,
                metadata: [
                    'type'   => $command->rewardType->getValue(),
                    'points' => $config->pointsAwarded,
                    'item_id' => $command->itemId,
                ],
            ));

            return $saved;
        });

        // 5. Dispatch event AFTER commit
        event(new RewardPointsAwarded(
            tenantId: $command->tenantId,
            userId: $command->userId,
            type: $command->rewardType,
            points: $config->pointsAwarded,
            itemId: $command->itemId,
        ));
    }
}
```

**File 8: `AwardRewardPointsCommand`**

```php
final class AwardRewardPointsCommand
{
    public function __construct(
        public readonly int        $tenantId,
        public readonly int        $userId,
        public readonly RewardType $rewardType,
        public readonly ?int       $itemId    = null,   // courseId, quizId, etc.
        public readonly ?int       $actorId   = null,   // 0 = system
    ) {}
}
```

**File 9: Event Listeners (trigger point awards)**

These are the wired event-to-reward pathways:

```
// In a RewardServiceProvider:
Event::listen(
    \App\Domain\TenantAdminDashboard\Course\Events\CourseProgressCompletedEvent::class,
    \App\Application\TenantAdminDashboard\Reward\Listeners\AwardProgressCompletionRewardListener::class
);
Event::listen(
    \App\Domain\TenantAdminDashboard\Quiz\Events\QuizPassedEvent::class,
    \App\Application\TenantAdminDashboard\Reward\Listeners\AwardQuizPassRewardListener::class
);
Event::listen(
    \App\Domain\TenantAdminDashboard\Course\Events\CertificateIssued::class,
    \App\Application\TenantAdminDashboard\Reward\Listeners\AwardCertificateRewardListener::class
);
Event::listen(
    \App\Domain\TenantAdminDashboard\Reward\Events\RewardPointsAwarded::class,
    \App\Application\TenantAdminDashboard\Notification\UseCases\NotifyUserRewardPointsEarnedUseCase::class
);
```

**Each listener is thin:**

```php
// AwardProgressCompletionRewardListener
public function handle(CourseProgressCompletedEvent $event): void
{
    $command = new AwardRewardPointsCommand(
        tenantId:   $event->tenantId,
        userId:     $event->userId,
        rewardType: RewardType::learningProgress100(),
        itemId:     $event->courseId,
        actorId:    0, // system
    );

    app(AwardRewardPointsUseCase::class)->execute($command);
}
```

> **Prerequisite:** `CourseProgressCompletedEvent` must exist. Check `app/Domain/TenantAdminDashboard/Course/Events/` — if only `VideoLessonCompleted` exists, the `GetCourseProgressUseCase` must be updated to fire `CourseProgressCompletedEvent` when progress hits 100%.

#### Phase 4 — Infrastructure Layer

**File 10: `RewardConfigRecord`** + **`RewardLedgerRecord`** (Eloquent `*Record` models)

**File 11: `EloquentRewardConfigRepository`** + **`EloquentRewardLedgerRepository`**

`EloquentRewardLedgerRepository::hasEntry()` must use an explicit `tenant_id` scope + `user_id` + `type` + `item_id` query (not ORM magic).

#### Phase 5 — HTTP Layer (Admin Management)

**Routes** (`routes/tenant_dashboard/reward.php`):

```php
Route::prefix('rewards')->group(function () {
    Route::get('/config',            [RewardConfigReadController::class, 'index']);   // list all config
    Route::put('/config/{type}',     [RewardConfigWriteController::class, 'update']); // update points/enable
    Route::get('/my-points',         [RewardLedgerReadController::class, 'myPoints']); // user's total + history
    Route::get('/leaderboard',       [RewardLedgerReadController::class, 'leaderboard']); // top earners
});
```

#### Phase 6 — Database Migration

**File 12: Migrations**

`database/migrations/tenant/YYYY_MM_DD_create_reward_configs_table.php`:

```php
Schema::create('reward_configs', function (Blueprint $table) {
    $table->id();
    $table->unsignedBigInteger('tenant_id');
    $table->string('type', 60);            // reward type key
    $table->unsignedInteger('points_awarded')->default(0);
    $table->boolean('is_enabled')->default(true);
    $table->string('condition', 255)->nullable();
    $table->timestamps();

    $table->unique(['tenant_id', 'type'], 'unq_reward_configs_tenant_type');
    $table->foreign('tenant_id', 'fk_reward_configs_tenants')
        ->references('id')->on('tenants')->onDelete('cascade');
});
```

`database/migrations/tenant/YYYY_MM_DD_create_reward_ledger_table.php`:

```php
Schema::create('reward_ledger', function (Blueprint $table) {
    $table->id();
    $table->unsignedBigInteger('tenant_id');
    $table->unsignedBigInteger('user_id');
    $table->string('type', 60);
    $table->unsignedInteger('points');
    $table->string('direction', 10)->default('credit'); // 'credit' | 'debit'
    $table->unsignedBigInteger('item_id')->nullable();
    $table->timestamp('created_at');
    // NO updated_at — audit tables are append-only (Developer Manual §14)

    $table->index(['tenant_id', 'user_id'],               'idx_reward_ledger_tenant_user');
    $table->unique(['tenant_id', 'user_id', 'type', 'item_id'], 'unq_reward_ledger_idempotency');
    $table->foreign('tenant_id', 'fk_reward_ledger_tenants')
        ->references('id')->on('tenants')->onDelete('cascade');
});
```

> **No `updated_at`** — the ledger is append-only per Developer Manual §14: "Audit tables have NO `updated_at` column."

**File 13: Seed Initial Reward Configs** (optional seeder)  
Seed default reward configs (disabled, 0 points) for all types so tenant admins can enable them without creating rows.

### 7.4 Tests to Write

`tests/Feature/TenantDashboard/Reward/RewardPointsTest.php`

- `points_are_awarded_on_course_completion`
- `points_are_not_awarded_twice_for_same_course` (idempotency)
- `points_are_not_awarded_when_reward_type_is_disabled`
- `points_are_not_awarded_when_reward_points_is_zero`
- `points_are_awarded_on_quiz_pass`
- `tenant_admin_can_update_reward_config`
- `user_can_view_own_points_total_and_history`
- `tenant_a_cannot_see_tenant_b_reward_history` → 404

---

## 8. Implementation Sequence

```
 Order │ Feature              │ Phase  │ Key files
───────┼──────────────────────┼────────┼─────────────────────────────────────────────────────────────
   1   │ Student Export       │ Check  │ Verify existing ExportStudents route/query stub is complete
   2   │ Student Export       │ Infra  │ EloquentCourseStudentExportQuery (if stub)
   3   │ Student Export       │ Infra  │ SpreadsheetExporterInterface + impl
   4   │ Student Export       │ HTTP   │ CourseReadController::exportStudents() (if stub)
   5   │ Student Export       │ Test   │ CourseStudentExportTest.php
───────┼──────────────────────┼────────┼─────────────────────────────────────────────────────────────
   6   │ Invoice              │ Domain │ InvoiceEntity, InvoiceQueryInterface, InvoiceNotFoundException
   7   │ Invoice              │ App    │ GetInvoiceQuery
   8   │ Invoice              │ Infra  │ EloquentInvoiceQuery
   9   │ Invoice              │ Infra  │ InvoicePdfGeneratorInterface + DomPdfInvoiceGenerator
  10   │ Invoice              │ HTTP   │ InvoiceReadController (show + download)
  11   │ Invoice              │ HTTP   │ InvoiceResource
  12   │ Invoice              │ Route  │ routes/tenant_dashboard/payment.php
  13   │ Invoice              │ Test   │ InvoiceTest.php
───────┼──────────────────────┼────────┼─────────────────────────────────────────────────────────────
  14   │ Comments             │ Domain │ CommentStatus VO
  15   │ Comments             │ Domain │ CourseCommentEntity
  16   │ Comments             │ Domain │ 3 domain events + 2 exceptions
  17   │ Comments             │ Domain │ CourseCommentRepositoryInterface
  18   │ Comments             │ App    │ 5 Commands
  19   │ Comments             │ App    │ 5 UseCases (Post, Edit, Delete, Approve, Reply)
  20   │ Comments             │ App    │ 2 Queries (List, Pending)
  21   │ Comments             │ Infra  │ CourseCommentRecord + EloquentCourseCommentRepository
  22   │ Comments             │ DB     │ create_course_comments_table migration
  23   │ Comments             │ HTTP   │ CourseCommentReadController + CourseCommentWriteController
  24   │ Comments             │ HTTP   │ FormRequests + CourseCommentResource
  25   │ Comments             │ Route  │ Add comment routes in course.php
  26   │ Comments             │ Test   │ CourseCommentTest.php
───────┼──────────────────────┼────────┼─────────────────────────────────────────────────────────────
  27   │ i18n                 │ Domain │ CourseTranslationEntity
  28   │ i18n                 │ Domain │ CourseTranslationRepositoryInterface
  29   │ i18n                 │ App    │ SyncCourseTranslationsCommand + SyncCourseTranslationsUseCase
  30   │ i18n                 │ App    │ GetCourseTranslationsQuery
  31   │ i18n                 │ Infra  │ CourseTranslationRecord + EloquentCourseTranslationRepository
  32   │ i18n                 │ DB     │ create_course_translations_table migration
  33   │ i18n                 │ HTTP   │ CourseTranslationController + SyncCourseTranslationsRequest
  34   │ i18n                 │ Route  │ Add translation routes in course.php
  35   │ i18n                 │ Test   │ CourseTranslationTest.php
───────┼──────────────────────┼────────┼─────────────────────────────────────────────────────────────
  36   │ User Group Discounts │ DB     │ Verify/add allowed_group_ids column to tickets migration
  37   │ User Group Discounts │ Domain │ DiscountCode, DiscountType, DiscountSource VOs
  38   │ User Group Discounts │ Domain │ DiscountEntity (foundation only, no HTTP endpoints yet)
  39   │ User Group Discounts │ Domain │ 4 Discount exceptions
  40   │ User Group Discounts │ Domain │ DiscountRepositoryInterface
  41   │ User Group Discounts │ DB     │ create_discount_codes_table migration
  42   │ User Group Discounts │ Infra  │ DiscountRecord + EloquentDiscountRepository
  43   │ User Group Discounts │ Test   │ DiscountGroupRestrictionTest.php
───────┼──────────────────────┼────────┼─────────────────────────────────────────────────────────────
  44   │ Rewards              │ Domain │ RewardType VO
  45   │ Rewards              │ Domain │ RewardConfigEntity + RewardLedgerEntity
  46   │ Rewards              │ Domain │ RewardPointsAwarded event
  47   │ Rewards              │ Domain │ RewardAlreadyAwardedException
  48   │ Rewards              │ Domain │ 2 Repository interfaces
  49   │ Rewards              │ App    │ AwardRewardPointsCommand + AwardRewardPointsUseCase
  50   │ Rewards              │ App    │ 3 Listener classes (Progress100, QuizPass, Certificate)
  51   │ Rewards              │ App    │ NotifyUserRewardPointsEarnedUseCase (in Notification)
  52   │ Rewards              │ Infra  │ RewardConfigRecord + RewardLedgerRecord
  53   │ Rewards              │ Infra  │ EloquentRewardConfigRepository + EloquentRewardLedgerRepository
  54   │ Rewards              │ DB     │ create_reward_configs_table migration
  55   │ Rewards              │ DB     │ create_reward_ledger_table migration
  56   │ Rewards              │ HTTP   │ RewardConfigReadController + RewardConfigWriteController
  57   │ Rewards              │ HTTP   │ RewardLedgerReadController (my-points + leaderboard)
  58   │ Rewards              │ Route  │ routes/tenant_dashboard/reward.php (new file)
  59   │ Rewards              │ Wire   │ RewardServiceProvider (event → listener bindings)
  60   │ Rewards              │ Wire   │ Check CourseProgressCompletedEvent exists, fire from UseCase
  61   │ Rewards              │ Test   │ RewardPointsTest.php
```

---

## 9. Pre-Commit Checklist

```
Architecture Guards (run for ALL P3 features):
□ docker exec -it ubotz_backend grep -rn "use Illuminate" app/Domain/  → 0 results
□ docker exec -it ubotz_backend grep -rn "DB::table" app/Application/  → 0 results
□ docker exec -it ubotz_backend grep -rn "->enum(" database/migrations/ → 0 results
□ PHPStan Level 5 passes
□ All tests pass

Feature 5 — User Group Discounts:
□ DiscountCode, DiscountType, DiscountSource VOs: pure PHP, no Illuminate imports
□ DiscountEntity enforces group restriction in assertEligible() — not in UseCase or controller
□ discount_codes migration uses VARCHAR(30) not ENUMs
□ discount_codes.code is UNIQUE per tenant
□ Tenant isolation: tenant A cannot apply tenant B discount code

Feature 6 — Invoice:
□ InvoiceEntity is pure PHP (no Eloquent)
□ InvoiceQueryInterface is in Domain layer
□ EloquentInvoiceQuery scopes all queries by tenant_id AND buyer_user_id
□ PDF generation in Infrastructure layer (not in Application/Domain)
□ Invoice 404 covers: not found, wrong buyer, wrong tenant, refunded — all identical response
□ Tenant A cannot view Tenant B invoice

Feature 7 — Student Export:
□ ExportCourseStudentsQuery uses repository interface (not DB::table)
□ SpreadsheetExporterInterface defined in Domain/Shared (file I/O = Infrastructure concern)
□ Export excludes refunded enrollments
□ Export scoped by tenant_id
□ Tenant isolation test passing

Feature 8 — i18n:
□ CourseTranslationEntity is pure PHP, enforces locale format in create()
□ Default locale fields remain in courses table (no breakage)
□ course_translations.locale is NOT MySQL ENUM
□ syncAll() is atomic (within DB::transaction)
□ Audit log entry created on sync
□ Tenant isolation: tenant A cannot view/edit tenant B translations

Feature 9 — Comments:
□ CourseCommentEntity enforces business rules (no empty body, status transitions)
□ CommentStatus VO used (no magic strings 'pending'/'active')
□ Instructor reply auto-approved is in entity method, not UseCase
□ Delete authorization check: owner OR instructor — in UseCase, not controller
□ Audit log on all mutations (post, edit, delete, approve)
□ Events dispatched AFTER DB::transaction()
□ Tenant isolation test: only active comments visible cross-tenant, no access to other tenant comments
□ NO BlogCommentEntity imported from Blog bounded context — separate entity required

Feature 10 — Rewards:
□ RewardType VO: pure PHP
□ AwardRewardPointsUseCase: idempotency check BEFORE transaction
□ Reward ledger has NO updated_at column
□ Unique constraint on (tenant_id, user_id, type, item_id) in migration
□ Listeners delegate to AwardRewardPointsUseCase — no award logic IN listener
□ RewardPointsAwarded event dispatched AFTER DB::transaction()
□ reward_configs and reward_ledger use VARCHAR(30), not ENUMs
□ User's point total and history scoped by tenant_id
□ Tenant A cannot see Tenant B reward history
□ Reward award is silent no-op when type disabled (does not throw exception)
□ CourseProgressCompletedEvent exists and fires when GetCourseProgressUseCase returns 100%
□ RewardServiceProvider registered in config/app.php providers list
```

---

*End of Document — P3 Feature Implementation Plan v1.0*  
*Companion: `backend/documentation/Ubotz 2 developer instruction manual .md` · `backend/documentation/Feature Migration Guide - Mentora to UBOTZ 2.md`*  
*See also: `documentation/implementation plan/p2_social_waitlist_notifications_plan.md` (P2 features)*
