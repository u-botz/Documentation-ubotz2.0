# UBOTZ 2.0 — Phase 15A Implementation Plan
## CRM Extension: Multi-Branch Support, Counselor Assignment & Stale Lead Alerting

**Document Type:** Implementation Plan  
**Phase:** 15A  
**Version:** 1.0  
**Date:** March 17, 2026  
**Status:** DRAFT — Pending Principal Engineer Review  
**Source Document:** `backend/documentation/Ubotz 2 phase 15a developer instructions .md`  
**Authority:** `backend/documentation/Ubotz 2 developer instruction manual .md` — **MANDATORY**  
**Prerequisites:** Phase 13A COMPLETE (landing pages + public lead form), Phase 14 COMPLETE (notification infrastructure live)

---

> [!CAUTION]
> **This phase extends an existing, working system.** The `LeadManagement` bounded context is solid. Do NOT rewrite what works. Extend it precisely at the gaps. Every new file must comply with the four-layer DDD model enforced by the Developer Instruction Manual. Any deviation is grounds for immediate code review rejection.

---

## Table of Contents

1. [Current State Assessment](#1-current-state-assessment)
2. [Architecture Decisions — Non-Negotiable](#2-architecture-decisions--non-negotiable)
3. [Database Schema — Four Migrations](#3-database-schema--four-migrations)
4. [Domain Layer](#4-domain-layer)
5. [Infrastructure Layer](#5-infrastructure-layer)
6. [Application Layer — Branch Use Cases](#6-application-layer--branch-use-cases)
7. [Application Layer — Modified Lead Use Cases](#7-application-layer--modified-lead-use-cases)
8. [Application Layer — Queries](#8-application-layer--queries)
9. [Application Layer — Services](#9-application-layer--services)
10. [Application Layer — Events & Listeners](#10-application-layer--events--listeners)
11. [HTTP Layer — Controllers, Requests, Routes](#11-http-layer--controllers-requests-routes)
12. [Console Command — DetectStaleLeadsCommand](#12-console-command--detectstaleleadscommand)
13. [Capability Registration](#13-capability-registration)
14. [Service Provider Bindings](#14-service-provider-bindings)
15. [Implementation Sequence](#15-implementation-sequence)
16. [Quality Gates](#16-quality-gates)
17. [Developer Manual Compliance Checklist](#17-developer-manual-compliance-checklist)
18. [Appendix: Complete File Tree](#18-appendix-complete-file-tree)

---

## 1. Current State Assessment

### 1.1 What Is Already Built (Do Not Touch Without Reason)

The `LeadManagement` bounded context at `app/Domain/TenantAdminDashboard/LeadManagement/` is complete and architecturally sound:

| Component | Location | Status |
|-----------|----------|--------|
| `LeadEntity` aggregate root | `Domain/LeadManagement/Entities/LeadEntity.php` | ✅ Complete |
| Six pipeline stages | `Domain/LeadManagement/ValueObjects/PipelineStage.php` | ✅ Complete |
| `LeadFollowUpEntity` | `Domain/LeadManagement/Entities/LeadFollowUpEntity.php` | ✅ Complete |
| `LeadNoteEntity` | `Domain/LeadManagement/Entities/LeadNoteEntity.php` | ✅ Complete |
| Value objects: `LeadSource`, `LeadContactInfo`, `PipelineStage` | `Domain/LeadManagement/ValueObjects/` | ✅ Complete |
| Use Cases: Create, Update, ChangeStage, Assign, Convert, AddNote, follow-up CRUD | `Application/LeadManagement/UseCases/` | ✅ Complete |
| Queries: ListLeads, GetLead, GetPipelineSummary | `Application/LeadManagement/Queries/` | ✅ Complete |
| `LeadRepositoryInterface` + Eloquent impl | `Domain/` + `Infrastructure/Persistence/` | ✅ Complete |
| Controllers: Write, Read, FollowUp, Note | `Http/Controllers/Api/TenantAdminDashboard/CRM/` | ✅ Complete |
| `PublicLeadFormController` | `Http/Controllers/Api/Public/` | ✅ Complete |
| RBAC capabilities: `lead.view`, `lead.manage`, `crm.view`, `crm.manage` | Capability registry | ✅ Complete |

### 1.2 Confirmed Gaps (What This Phase Builds)

| Gap | Description | Severity |
|-----|-------------|----------|
| G-1 | No `branches` table, no `Branch` domain entity, no `Branch` bounded context | **Critical** |
| G-2 | `leads` table has no `branch_id` column — all multi-branch queries impossible | **Critical** |
| G-3 | No `user_branch_assignments` pivot table — counselors cannot be scoped to branches | **Critical** |
| G-4 | Branch-level security isolation not enforced — counselors see all tenant leads | **Critical** |
| G-5 | Auto-assign (fewest-open-leads round-robin) not implemented for web form leads | **High** |
| G-6 | Counselor workload visibility missing — no endpoint for open leads per counselor | **High** |
| G-7 | Stale lead detection missing — no mechanism to surface uncontacted leads | **High** |
| G-8 | Notification integration missing — CRM domain events not wired to Phase 14 | **Medium** |

### 1.3 What This Phase Does NOT Build

| Excluded Item | Deferred To |
|---------------|------------|
| Lead-to-UserRecord conversion | Future admission phase |
| Meta Lead Ads webhook integration | Phase 15B |
| WhatsApp Business API | Phase 15B |
| Branch-level billing or quota enforcement | Future |
| Branch-specific LMS content scoping | Future |
| Cross-branch lead transfer UI | Future |

---

## 2. Architecture Decisions — Non-Negotiable

### 2.1 Branch Bounded Context is Separate from LeadManagement

`Branch` is a new top-level bounded context within `TenantAdminDashboard`. It must NOT be placed inside `LeadManagement`. Branch will eventually affect users, attendance, courses, and reporting — it must stand independently.

```
app/Domain/TenantAdminDashboard/Branch/     ← New bounded context
app/Application/TenantAdminDashboard/Branch/ ← New bounded context
app/Infrastructure/Persistence/TenantAdminDashboard/Branch/ ← New
```

### 2.2 `branch_id` is Nullable on Leads — No Silent Auto-Creation

`leads.branch_id` is **nullable**. A single-branch tenant leaves all leads as `branch_id = NULL`. This is valid, not an error. There is no silent "Main Branch" auto-creation. Tenants opt into multi-branch explicitly.

**Impact:** All lead list and pipeline summary queries must treat `branch_id IS NULL` as valid. Filtering by branch is optional.

### 2.3 Branch Security Enforced in Application Layer, Not Controller

A counselor assigned to Branch A **must** receive HTTP 403 attempting to read or action a Branch B lead. This enforcement lives in Use Cases — never in the Controller or frontend.

**Access Matrix:**

```
                            branch_id = NULL    branch_id = Branch A
Counselor (branch A only)       ✅ Yes               ✅ Yes
Counselor (branch B only)       ✅ Yes               ❌ 403
Manager (crm.manage)            ✅ Yes               ✅ Yes
```

This logic lives exclusively in `BranchAccessPolicy` domain service, injected into lead Use Cases. It must not be duplicated across Use Cases.

### 2.4 Auto-Assign is Round-Robin by Fewest Open Leads

When a lead arrives via `PublicLeadFormController` with a `branch_id`, auto-assignment selects the counselor with the fewest open leads within that branch.

- "Open leads" = stage NOT IN (`admission_confirmed`, `rejected`) AND `assigned_to` = counselor
- Tie-break: counselor with oldest `last_assignment_at` (most idle)
- No eligible counselors → lead created unassigned (not an error)
- Auto-assign fires ONLY for `web_form` source, never for manually created leads

### 2.5 Stale Lead Definition

A lead is stale when ALL of:
- Stage NOT IN (`admission_confirmed`, `rejected`)
- No `lead_follow_ups` record with `completed_at IS NULL`
- No `lead_notes` record created in the last N days (default: 5, configurable per tenant via `tenant_settings.crm.stale_lead_days`)
- `stage_changed_at` is older than N days

---

## 3. Database Schema — Four Migrations

All four migrations go in `database/migrations/tenant/`.

### 3.1 Migration 1: Create `branches` Table

**File:** `database/migrations/tenant/YYYY_MM_DD_HHMMSS_create_branches_table.php`

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('branches', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('tenant_id');
            $table->string('name', 150);
            $table->string('code', 30);
            $table->text('address')->nullable();
            $table->string('phone', 20)->nullable();
            $table->string('email', 150)->nullable();
            $table->tinyInteger('is_active')->default(1);
            $table->timestamps();

            $table->unique(['tenant_id', 'code'], 'unq_branches_tenant_code');
            $table->index(['tenant_id', 'is_active'], 'idx_branches_tenant_active');

            $table->foreign('tenant_id', 'fk_branches_tenant')
                ->references('id')->on('tenants')->onDelete('cascade');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('branches');
    }
};
```

**Rules enforced:**
- No MySQL ENUM — `is_active` uses `tinyInteger(1)` per platform convention
- No soft deletes — deactivation via `is_active = 0` is the lifecycle mechanism
- `code` unique within tenant only (not globally)

### 3.2 Migration 2: Create `user_branch_assignments` Table

**File:** `database/migrations/tenant/YYYY_MM_DD_HHMMSS_create_user_branch_assignments_table.php`

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('user_branch_assignments', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('tenant_id');
            $table->unsignedBigInteger('user_id');
            $table->unsignedBigInteger('branch_id');
            $table->timestamp('assigned_at')->useCurrent();
            $table->unsignedBigInteger('assigned_by')->nullable();

            $table->unique(['tenant_id', 'user_id', 'branch_id'], 'unq_user_branch');
            $table->index(['tenant_id', 'branch_id'], 'idx_user_branch_tenant');

            $table->foreign('tenant_id', 'fk_ubr_tenant')
                ->references('id')->on('tenants')->onDelete('cascade');
            $table->foreign('user_id', 'fk_ubr_user')
                ->references('id')->on('users')->onDelete('cascade');
            $table->foreign('branch_id', 'fk_ubr_branch')
                ->references('id')->on('branches')->onDelete('cascade');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('user_branch_assignments');
    }
};
```

**Rules enforced:**
- A user can be assigned to multiple branches
- `assigned_by` nullable (system-generated assignments have no actor)
- Removing a user from a branch does NOT unassign their existing leads

### 3.3 Migration 3: Add `branch_id` to `leads` Table

**File:** `database/migrations/tenant/YYYY_MM_DD_HHMMSS_add_branch_id_to_leads_table.php`

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('leads', function (Blueprint $table) {
            $table->unsignedBigInteger('branch_id')->nullable()->after('tenant_id');
            $table->index(['tenant_id', 'branch_id'], 'idx_leads_branch');

            $table->foreign('branch_id', 'fk_leads_branch')
                ->references('id')->on('branches')->onDelete('set null');
        });
    }

    public function down(): void
    {
        Schema::table('leads', function (Blueprint $table) {
            $table->dropForeign('fk_leads_branch');
            $table->dropIndex('idx_leads_branch');
            $table->dropColumn('branch_id');
        });
    }
};
```

**Rules enforced:**
- `ON DELETE SET NULL` — defensive fallback if branch is hard-deleted (blocked by Use Case, but defensive)
- Existing leads after migration have `branch_id = NULL` — correct and expected, no backfill required

### 3.4 Migration 4: Add `stage_changed_at` to `leads` Table

**File:** `database/migrations/tenant/YYYY_MM_DD_HHMMSS_add_stage_changed_at_to_leads_table.php`

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('leads', function (Blueprint $table) {
            $table->timestamp('stage_changed_at')->nullable()->after('stage');
            $table->index(['tenant_id', 'stage_changed_at'], 'idx_leads_stage_changed');
        });
    }

    public function down(): void
    {
        Schema::table('leads', function (Blueprint $table) {
            $table->dropIndex('idx_leads_stage_changed');
            $table->dropColumn('stage_changed_at');
        });
    }
};
```

---

## 4. Domain Layer

### 4.1 New Value Object: `BranchCode`

**File:** `app/Domain/TenantAdminDashboard/Branch/ValueObjects/BranchCode.php`

```php
<?php

declare(strict_types=1);

namespace App\Domain\TenantAdminDashboard\Branch\ValueObjects;

final class BranchCode
{
    private readonly string $value;

    public function __construct(string $value)
    {
        $trimmed = strtoupper(trim($value));

        if (empty($trimmed) || strlen($trimmed) > 30) {
            throw new \InvalidArgumentException('Branch code must be 1–30 characters.');
        }

        if (!preg_match('/^[A-Z0-9\-_]+$/', $trimmed)) {
            throw new \InvalidArgumentException(
                'Branch code may only contain letters, digits, hyphens, and underscores.'
            );
        }

        $this->value = $trimmed;
    }

    public function value(): string
    {
        return $this->value;
    }

    public function equals(self $other): bool
    {
        return $this->value === $other->value;
    }
}
```

**Compliance notes:**
- Pure PHP — zero `use Illuminate\...` imports
- Immutable — `readonly` property, no setters
- Self-validating — constructor throws on invalid input (`\InvalidArgumentException`)
- `final class` enforced

### 4.2 New Domain Entity: `BranchEntity`

**File:** `app/Domain/TenantAdminDashboard/Branch/Entities/BranchEntity.php`

```php
<?php

declare(strict_types=1);

namespace App\Domain\TenantAdminDashboard\Branch\Entities;

use App\Domain\Shared\Aggregate\AggregateRoot;
use App\Domain\TenantAdminDashboard\Branch\Events\BranchCreated;
use App\Domain\TenantAdminDashboard\Branch\Events\BranchUpdated;
use App\Domain\TenantAdminDashboard\Branch\Events\BranchDeactivated;
use App\Domain\TenantAdminDashboard\Branch\ValueObjects\BranchCode;

final class BranchEntity extends AggregateRoot
{
    private function __construct(
        private readonly ?int $id,
        private readonly int $tenantId,
        private string $name,
        private readonly BranchCode $code,
        private ?string $address,
        private ?string $phone,
        private ?string $email,
        private bool $isActive,
    ) {}

    public static function create(
        int $tenantId,
        string $name,
        BranchCode $code,
        ?string $address = null,
        ?string $phone = null,
        ?string $email = null,
    ): self {
        $entity = new self(
            id: null,
            tenantId: $tenantId,
            name: $name,
            code: $code,
            address: $address,
            phone: $phone,
            email: $email,
            isActive: true,
        );

        $entity->recordEvent(new BranchCreated(
            tenantId: $tenantId,
            name: $name,
            code: $code->value(),
        ));

        return $entity;
    }

    public static function reconstitute(
        int $id,
        int $tenantId,
        string $name,
        BranchCode $code,
        ?string $address,
        ?string $phone,
        ?string $email,
        bool $isActive,
    ): self {
        return new self(
            id: $id,
            tenantId: $tenantId,
            name: $name,
            code: $code,
            address: $address,
            phone: $phone,
            email: $email,
            isActive: $isActive,
        );
    }

    public function update(
        string $name,
        ?string $address,
        ?string $phone,
        ?string $email,
    ): void {
        $this->name    = $name;
        $this->address = $address;
        $this->phone   = $phone;
        $this->email   = $email;

        $this->recordEvent(new BranchUpdated(
            branchId: $this->id,
            tenantId: $this->tenantId,
            changedFields: ['name', 'address', 'phone', 'email'],
        ));
    }

    /**
     * Deactivation guard is enforced at the Use Case layer before calling this.
     * The entity itself does not query the database.
     */
    public function deactivate(): void
    {
        $this->isActive = false;
        $this->recordEvent(new BranchDeactivated(
            branchId: $this->id,
            tenantId: $this->tenantId,
        ));
    }

    public function getId(): ?int      { return $this->id; }
    public function getTenantId(): int  { return $this->tenantId; }
    public function getName(): string   { return $this->name; }
    public function getCode(): BranchCode { return $this->code; }
    public function getAddress(): ?string { return $this->address; }
    public function getPhone(): ?string   { return $this->phone; }
    public function getEmail(): ?string   { return $this->email; }
    public function isActive(): bool      { return $this->isActive; }
}
```

**Compliance notes:**
- Pure PHP — zero Illuminate imports
- Factory methods `create()` (records event) and `reconstitute()` (no event — loading from DB)
- `deactivate()` does NOT check for active leads — that guard lives in `DeactivateBranchUseCase`
- Code is `readonly` — immutable after creation per architecture decision §2.1

### 4.3 New Repository Interface: `BranchRepositoryInterface`

**File:** `app/Domain/TenantAdminDashboard/Branch/Repositories/BranchRepositoryInterface.php`

```php
<?php

declare(strict_types=1);

namespace App\Domain\TenantAdminDashboard\Branch\Repositories;

use App\Domain\TenantAdminDashboard\Branch\Entities\BranchEntity;

interface BranchRepositoryInterface
{
    public function findById(int $tenantId, int $id): ?BranchEntity;

    public function findByCode(int $tenantId, string $code): ?BranchEntity;

    /** @return BranchEntity[] */
    public function findAllByTenant(int $tenantId, bool $activeOnly = false): array;

    public function save(BranchEntity $branch): BranchEntity;

    public function hasActiveLeads(int $tenantId, int $branchId): bool;

    /** @return int[] */
    public function getUserBranchIds(int $tenantId, int $userId): array;

    /** Replace all branch assignments for a user atomically. */
    public function syncUserBranchAssignments(
        int $tenantId,
        int $userId,
        int $assignedBy,
        array $branchIds,
    ): void;
}
```

**Compliance notes:**
- Every method accepts `int $tenantId` — tenant isolation enforced at contract level
- Returns domain entities, never Eloquent models
- `hasActiveLeads()` here means the repository answers the business question needed by `DeactivateBranchUseCase`

### 4.4 New Domain Events

#### 4.4.1 `BranchCreated`

**File:** `app/Domain/TenantAdminDashboard/Branch/Events/BranchCreated.php`

```php
<?php

declare(strict_types=1);

namespace App\Domain\TenantAdminDashboard\Branch\Events;

final class BranchCreated
{
    public function __construct(
        public readonly int $tenantId,
        public readonly string $name,
        public readonly string $code,
        public readonly \DateTimeImmutable $occurredAt = new \DateTimeImmutable(),
    ) {}
}
```

#### 4.4.2 `BranchUpdated`

**File:** `app/Domain/TenantAdminDashboard\Branch\Events\BranchUpdated.php`

```php
<?php

declare(strict_types=1);

namespace App\Domain\TenantAdminDashboard\Branch\Events;

final class BranchUpdated
{
    public function __construct(
        public readonly ?int $branchId,
        public readonly int $tenantId,
        public readonly array $changedFields,
        public readonly \DateTimeImmutable $occurredAt = new \DateTimeImmutable(),
    ) {}
}
```

#### 4.4.3 `BranchDeactivated`

**File:** `app/Domain/TenantAdminDashboard/Branch/Events/BranchDeactivated.php`

```php
<?php

declare(strict_types=1);

namespace App\Domain\TenantAdminDashboard\Branch\Events;

final class BranchDeactivated
{
    public function __construct(
        public readonly ?int $branchId,
        public readonly int $tenantId,
        public readonly \DateTimeImmutable $occurredAt = new \DateTimeImmutable(),
    ) {}
}
```

#### 4.4.4 `LeadAssigned` (LeadManagement bounded context)

**File:** `app/Domain/TenantAdminDashboard/LeadManagement/Events/LeadAssigned.php`

```php
<?php

declare(strict_types=1);

namespace App\Domain\TenantAdminDashboard\LeadManagement\Events;

final class LeadAssigned
{
    public function __construct(
        public readonly int $leadId,
        public readonly int $tenantId,
        public readonly ?int $branchId,
        public readonly int $assignedToUserId,
        public readonly ?int $assignedByUserId,
        public readonly \DateTimeImmutable $occurredAt = new \DateTimeImmutable(),
    ) {}
}
```

#### 4.4.5 `StaleLeadDetected` (LeadManagement bounded context)

**File:** `app/Domain/TenantAdminDashboard/LeadManagement/Events/StaleLeadDetected.php`

```php
<?php

declare(strict_types=1);

namespace App\Domain\TenantAdminDashboard\LeadManagement\Events;

final class StaleLeadDetected
{
    public function __construct(
        public readonly int $leadId,
        public readonly int $tenantId,
        public readonly ?int $branchId,
        public readonly ?int $assignedToUserId,
        public readonly int $daysStale,
        public readonly \DateTimeImmutable $occurredAt = new \DateTimeImmutable(),
    ) {}
}
```

### 4.5 New Domain Exceptions

#### 4.5.1 `BranchNotFoundException`

**File:** `app/Domain/TenantAdminDashboard/Branch/Exceptions/BranchNotFoundException.php`

```php
<?php

declare(strict_types=1);

namespace App\Domain\TenantAdminDashboard\Branch\Exceptions;

final class BranchNotFoundException extends \DomainException
{
    public static function withId(int $branchId): self
    {
        return new self("Branch not found: {$branchId}");
    }
}
```

#### 4.5.2 `DuplicateBranchCodeException`

**File:** `app/Domain/TenantAdminDashboard/Branch/Exceptions/DuplicateBranchCodeException.php`

```php
<?php

declare(strict_types=1);

namespace App\Domain\TenantAdminDashboard\Branch\Exceptions;

final class DuplicateBranchCodeException extends \DomainException
{
    public static function withCode(string $code): self
    {
        return new self("A branch with code '{$code}' already exists in this tenant.");
    }
}
```

#### 4.5.3 `CannotDeactivateBranchWithActiveLeadsException`

**File:** `app/Domain/TenantAdminDashboard/Branch/Exceptions/CannotDeactivateBranchWithActiveLeadsException.php`

```php
<?php

declare(strict_types=1);

namespace App\Domain\TenantAdminDashboard\Branch\Exceptions;

final class CannotDeactivateBranchWithActiveLeadsException extends \DomainException
{
    public static function forBranch(int $branchId): self
    {
        return new self(
            "Branch {$branchId} cannot be deactivated while it has active (non-terminal) leads."
        );
    }
}
```

#### 4.5.4 `CounselorNotAssignedToBranchException`

**File:** `app/Domain/TenantAdminDashboard/LeadManagement/Exceptions/CounselorNotAssignedToBranchException.php`

```php
<?php

declare(strict_types=1);

namespace App\Domain\TenantAdminDashboard\LeadManagement\Exceptions;

final class CounselorNotAssignedToBranchException extends \DomainException
{
    public static function forCounselorAndBranch(int $userId, int $branchId): self
    {
        return new self(
            "User {$userId} is not assigned to branch {$branchId} and cannot be assigned this lead."
        );
    }
}
```

### 4.6 New Domain Service: `BranchAccessPolicy`

**File:** `app/Domain/TenantAdminDashboard/Branch/Services/BranchAccessPolicy.php`

```php
<?php

declare(strict_types=1);

namespace App\Domain\TenantAdminDashboard\Branch\Services;

/**
 * Pure PHP domain service — answers: "Can this user access this lead?"
 *
 * Rules:
 * - lead.branch_id IS NULL  → always accessible within the tenant
 * - User holds crm.manage   → always accessible (manager cross-branch override)
 * - User has branch assignment matching lead.branch_id → accessible
 * - Otherwise → false (Use Case must throw UnauthorizedException / 403)
 *
 * NO database calls. NO Eloquent. NO framework dependencies.
 * The Use Case is responsible for loading user capabilities and branch IDs before calling this.
 */
final class BranchAccessPolicy
{
    /**
     * @param array<string> $userCapabilities  capability codes for the requesting user
     * @param int[]         $userBranchIds     IDs from user_branch_assignments for the user
     */
    public function canAccess(
        int $userId,
        array $userCapabilities,
        ?int $leadBranchId,
        array $userBranchIds,
    ): bool {
        if ($leadBranchId === null) {
            return true;
        }

        if (in_array('crm.manage', $userCapabilities, true)) {
            return true;
        }

        return in_array($leadBranchId, $userBranchIds, true);
    }
}
```

**Compliance notes — Architecture Gate G-5 from §13.3:**
- Pure PHP — zero Illuminate, Eloquent, or framework imports
- Stateless — no constructor dependencies, no side effects
- Unit-testable without database

### 4.7 Modified: `LeadEntity` — Add Branch Awareness

**File:** `app/Domain/TenantAdminDashboard/LeadManagement/Entities/LeadEntity.php`

Add the following properties to the existing `LeadEntity`. Do not change any existing logic.

```php
// Add these two properties alongside existing ones:
private ?int $branchId;
private ?\DateTimeImmutable $stageChangedAt;
```

**Modify the existing `changeStage()` method** to set `stageChangedAt`:

```php
public function changeStage(PipelineStage $newStage, ?int $actorId): void
{
    // ... existing stage transition guard logic — DO NOT REMOVE ...

    $this->stage = $newStage;
    $this->stageChangedAt = new \DateTimeImmutable();  // ← ADD THIS LINE

    // ... existing recordEvent call — DO NOT REMOVE ...
}
```

**Add getters:**

```php
public function getBranchId(): ?int { return $this->branchId; }
public function getStageChangedAt(): ?\DateTimeImmutable { return $this->stageChangedAt; }
```

**Update `create()` and `reconstitute()` factory methods** to accept and assign `branchId` and `stageChangedAt`. `branchId` defaults to `null`. `stageChangedAt` is set to `now()` on `create()` and loaded from persistence on `reconstitute()`.

---

## 5. Infrastructure Layer

### 5.1 Eloquent Model: `BranchRecord`

**File:** `app/Infrastructure/Persistence/TenantAdminDashboard/Branch/BranchRecord.php`

```php
<?php

declare(strict_types=1);

namespace App\Infrastructure\Persistence\TenantAdminDashboard\Branch;

use Illuminate\Database\Eloquent\Model;

final class BranchRecord extends Model
{
    protected $table = 'branches';

    protected $fillable = [
        'tenant_id',
        'name',
        'code',
        'address',
        'phone',
        'email',
        'is_active',
    ];

    protected $casts = [
        'is_active' => 'boolean',
    ];
}
```

**Naming convention enforced:** Model named `BranchRecord`, not `Branch`.

### 5.2 Eloquent Model: `UserBranchAssignmentRecord`

**File:** `app/Infrastructure/Persistence/TenantAdminDashboard/Branch/UserBranchAssignmentRecord.php`

```php
<?php

declare(strict_types=1);

namespace App\Infrastructure\Persistence\TenantAdminDashboard\Branch;

use Illuminate\Database\Eloquent\Model;

final class UserBranchAssignmentRecord extends Model
{
    protected $table = 'user_branch_assignments';
    public $timestamps = false;

    protected $fillable = [
        'tenant_id',
        'user_id',
        'branch_id',
        'assigned_at',
        'assigned_by',
    ];

    protected $casts = [
        'assigned_at' => 'datetime',
    ];
}
```

### 5.3 Eloquent Repository: `EloquentBranchRepository`

**File:** `app/Infrastructure/Persistence/TenantAdminDashboard/Branch/EloquentBranchRepository.php`

```php
<?php

declare(strict_types=1);

namespace App\Infrastructure\Persistence\TenantAdminDashboard\Branch;

use App\Domain\TenantAdminDashboard\Branch\Entities\BranchEntity;
use App\Domain\TenantAdminDashboard\Branch\Repositories\BranchRepositoryInterface;
use App\Domain\TenantAdminDashboard\Branch\ValueObjects\BranchCode;
use Illuminate\Support\Facades\DB;

final class EloquentBranchRepository implements BranchRepositoryInterface
{
    public function findById(int $tenantId, int $id): ?BranchEntity
    {
        $record = BranchRecord::where('tenant_id', $tenantId)
            ->where('id', $id)
            ->first();

        return $record ? $this->toEntity($record) : null;
    }

    public function findByCode(int $tenantId, string $code): ?BranchEntity
    {
        $record = BranchRecord::where('tenant_id', $tenantId)
            ->where('code', strtoupper(trim($code)))
            ->first();

        return $record ? $this->toEntity($record) : null;
    }

    public function findAllByTenant(int $tenantId, bool $activeOnly = false): array
    {
        $query = BranchRecord::where('tenant_id', $tenantId);

        if ($activeOnly) {
            $query->where('is_active', 1);
        }

        return $query->orderBy('name')
            ->get()
            ->map(fn (BranchRecord $r) => $this->toEntity($r))
            ->all();
    }

    public function save(BranchEntity $branch): BranchEntity
    {
        $record = $branch->getId()
            ? BranchRecord::where('tenant_id', $branch->getTenantId())
                ->where('id', $branch->getId())
                ->firstOrFail()
            : new BranchRecord();

        $record->fill($this->fromEntity($branch));
        $record->save();

        return $this->toEntity($record);
    }

    public function hasActiveLeads(int $tenantId, int $branchId): bool
    {
        return DB::table('leads')
            ->where('tenant_id', $tenantId)
            ->where('branch_id', $branchId)
            ->whereNotIn('stage', ['admission_confirmed', 'rejected'])
            ->exists();
    }

    public function getUserBranchIds(int $tenantId, int $userId): array
    {
        return UserBranchAssignmentRecord::where('tenant_id', $tenantId)
            ->where('user_id', $userId)
            ->pluck('branch_id')
            ->map(fn ($id) => (int) $id)
            ->all();
    }

    public function syncUserBranchAssignments(
        int $tenantId,
        int $userId,
        int $assignedBy,
        array $branchIds,
    ): void {
        DB::transaction(function () use ($tenantId, $userId, $assignedBy, $branchIds) {
            UserBranchAssignmentRecord::where('tenant_id', $tenantId)
                ->where('user_id', $userId)
                ->delete();

            foreach ($branchIds as $branchId) {
                UserBranchAssignmentRecord::create([
                    'tenant_id'   => $tenantId,
                    'user_id'     => $userId,
                    'branch_id'   => $branchId,
                    'assigned_at' => now(),
                    'assigned_by' => $assignedBy,
                ]);
            }
        });
    }

    private function toEntity(BranchRecord $record): BranchEntity
    {
        return BranchEntity::reconstitute(
            id: (int) $record->id,
            tenantId: (int) $record->tenant_id,
            name: $record->name,
            code: new BranchCode($record->code),
            address: $record->address,
            phone: $record->phone,
            email: $record->email,
            isActive: (bool) $record->is_active,
        );
    }

    private function fromEntity(BranchEntity $entity): array
    {
        return [
            'tenant_id' => $entity->getTenantId(),
            'name'      => $entity->getName(),
            'code'      => $entity->getCode()->value(),
            'address'   => $entity->getAddress(),
            'phone'     => $entity->getPhone(),
            'email'     => $entity->getEmail(),
            'is_active' => $entity->isActive() ? 1 : 0,
        ];
    }
}
```

**Compliance notes:**
- Every query scoped by `tenant_id` — belt-and-suspenders
- Named `EloquentBranchRepository` per naming convention
- `toEntity()` and `fromEntity()` mappers present
- `syncUserBranchAssignments()` is atomic (uses `DB::transaction()`)

---

## 6. Application Layer — Branch Use Cases

### 6.1 Commands

#### `CreateBranchCommand`

**File:** `app/Application/TenantAdminDashboard/Branch/Commands/CreateBranchCommand.php`

```php
<?php

declare(strict_types=1);

namespace App\Application\TenantAdminDashboard\Branch\Commands;

final class CreateBranchCommand
{
    public function __construct(
        public readonly int $tenantId,
        public readonly string $name,
        public readonly string $code,
        public readonly ?string $address = null,
        public readonly ?string $phone = null,
        public readonly ?string $email = null,
        public readonly ?int $actorId = null,
    ) {}
}
```

#### `UpdateBranchCommand`

**File:** `app/Application/TenantAdminDashboard/Branch/Commands/UpdateBranchCommand.php`

```php
<?php

declare(strict_types=1);

namespace App\Application\TenantAdminDashboard\Branch\Commands;

final class UpdateBranchCommand
{
    public function __construct(
        public readonly int $tenantId,
        public readonly int $branchId,
        public readonly string $name,
        public readonly ?string $address = null,
        public readonly ?string $phone = null,
        public readonly ?string $email = null,
        public readonly ?int $actorId = null,
    ) {}
}
```

#### `DeactivateBranchCommand`

**File:** `app/Application/TenantAdminDashboard/Branch/Commands/DeactivateBranchCommand.php`

```php
<?php

declare(strict_types=1);

namespace App\Application\TenantAdminDashboard\Branch\Commands;

final class DeactivateBranchCommand
{
    public function __construct(
        public readonly int $tenantId,
        public readonly int $branchId,
        public readonly ?int $actorId = null,
    ) {}
}
```

#### `AssignUserToBranchCommand`

**File:** `app/Application/TenantAdminDashboard/Branch/Commands/AssignUserToBranchCommand.php`

```php
<?php

declare(strict_types=1);

namespace App\Application\TenantAdminDashboard\Branch\Commands;

final class AssignUserToBranchCommand
{
    public function __construct(
        public readonly int $tenantId,
        public readonly int $userId,
        public readonly array $branchIds,
        public readonly ?int $actorId = null,
    ) {}
}
```

### 6.2 `CreateBranchUseCase`

**File:** `app/Application/TenantAdminDashboard/Branch/UseCases/CreateBranchUseCase.php`

```php
<?php

declare(strict_types=1);

namespace App\Application\TenantAdminDashboard\Branch\UseCases;

use App\Application\TenantAdminDashboard\Branch\Commands\CreateBranchCommand;
use App\Domain\TenantAdminDashboard\Branch\Entities\BranchEntity;
use App\Domain\TenantAdminDashboard\Branch\Exceptions\DuplicateBranchCodeException;
use App\Domain\TenantAdminDashboard\Branch\Repositories\BranchRepositoryInterface;
use App\Domain\TenantAdminDashboard\Branch\ValueObjects\BranchCode;
use App\Infrastructure\Persistence\Shared\AuditContext;
use App\Infrastructure\Persistence\Shared\TenantAuditLogger;
use Illuminate\Support\Facades\DB;

final class CreateBranchUseCase
{
    public function __construct(
        private readonly BranchRepositoryInterface $branchRepository,
        private readonly TenantAuditLogger $auditLogger,
    ) {}

    public function execute(CreateBranchCommand $command): BranchEntity
    {
        $code = new BranchCode($command->code);

        $existing = $this->branchRepository->findByCode($command->tenantId, $code->value());
        if ($existing !== null) {
            throw DuplicateBranchCodeException::withCode($code->value());
        }

        $branch = BranchEntity::create(
            tenantId: $command->tenantId,
            name: $command->name,
            code: $code,
            address: $command->address,
            phone: $command->phone,
            email: $command->email,
        );

        $result = DB::transaction(function () use ($branch, $command) {
            $saved = $this->branchRepository->save($branch);

            $this->auditLogger->log(new AuditContext(
                tenantId: $command->tenantId,
                userId: $command->actorId ?? 0,
                action: 'branch.created',
                entityType: 'Branch',
                entityId: $saved->getId(),
                metadata: [
                    'name' => $saved->getName(),
                    'code' => $saved->getCode()->value(),
                ],
            ));

            return [$saved, $branch->releaseEvents()];
        });

        foreach ($result[1] as $event) {
            event($event);
        }

        return $result[0];
    }
}
```

### 6.3 `UpdateBranchUseCase`

**File:** `app/Application/TenantAdminDashboard/Branch/UseCases/UpdateBranchUseCase.php`

```php
<?php

declare(strict_types=1);

namespace App\Application\TenantAdminDashboard\Branch\UseCases;

use App\Application\TenantAdminDashboard\Branch\Commands\UpdateBranchCommand;
use App\Domain\TenantAdminDashboard\Branch\Entities\BranchEntity;
use App\Domain\TenantAdminDashboard\Branch\Exceptions\BranchNotFoundException;
use App\Domain\TenantAdminDashboard\Branch\Repositories\BranchRepositoryInterface;
use App\Infrastructure\Persistence\Shared\AuditContext;
use App\Infrastructure\Persistence\Shared\TenantAuditLogger;
use Illuminate\Support\Facades\DB;

final class UpdateBranchUseCase
{
    public function __construct(
        private readonly BranchRepositoryInterface $branchRepository,
        private readonly TenantAuditLogger $auditLogger,
    ) {}

    public function execute(UpdateBranchCommand $command): BranchEntity
    {
        $branch = $this->branchRepository->findById($command->tenantId, $command->branchId);
        if ($branch === null) {
            throw BranchNotFoundException::withId($command->branchId);
        }

        $branch->update(
            name: $command->name,
            address: $command->address,
            phone: $command->phone,
            email: $command->email,
        );

        $result = DB::transaction(function () use ($branch, $command) {
            $saved = $this->branchRepository->save($branch);

            $this->auditLogger->log(new AuditContext(
                tenantId: $command->tenantId,
                userId: $command->actorId ?? 0,
                action: 'branch.updated',
                entityType: 'Branch',
                entityId: $saved->getId(),
                metadata: ['name' => $saved->getName()],
            ));

            return [$saved, $branch->releaseEvents()];
        });

        foreach ($result[1] as $event) {
            event($event);
        }

        return $result[0];
    }
}
```

### 6.4 `DeactivateBranchUseCase`

**File:** `app/Application/TenantAdminDashboard/Branch/UseCases/DeactivateBranchUseCase.php`

```php
<?php

declare(strict_types=1);

namespace App\Application\TenantAdminDashboard\Branch\UseCases;

use App\Application\TenantAdminDashboard\Branch\Commands\DeactivateBranchCommand;
use App\Domain\TenantAdminDashboard\Branch\Exceptions\BranchNotFoundException;
use App\Domain\TenantAdminDashboard\Branch\Exceptions\CannotDeactivateBranchWithActiveLeadsException;
use App\Domain\TenantAdminDashboard\Branch\Repositories\BranchRepositoryInterface;
use App\Infrastructure\Persistence\Shared\AuditContext;
use App\Infrastructure\Persistence\Shared\TenantAuditLogger;
use Illuminate\Support\Facades\DB;

final class DeactivateBranchUseCase
{
    public function __construct(
        private readonly BranchRepositoryInterface $branchRepository,
        private readonly TenantAuditLogger $auditLogger,
    ) {}

    public function execute(DeactivateBranchCommand $command): void
    {
        $branch = $this->branchRepository->findById($command->tenantId, $command->branchId);
        if ($branch === null) {
            throw BranchNotFoundException::withId($command->branchId);
        }

        // Guard: cannot deactivate with active (non-terminal) leads
        if ($this->branchRepository->hasActiveLeads($command->tenantId, $command->branchId)) {
            throw CannotDeactivateBranchWithActiveLeadsException::forBranch($command->branchId);
        }

        $branch->deactivate();

        $result = DB::transaction(function () use ($branch, $command) {
            $this->branchRepository->save($branch);

            $this->auditLogger->log(new AuditContext(
                tenantId: $command->tenantId,
                userId: $command->actorId ?? 0,
                action: 'branch.deactivated',
                entityType: 'Branch',
                entityId: $command->branchId,
                metadata: [],
            ));

            return $branch->releaseEvents();
        });

        foreach ($result as $event) {
            event($event);
        }
    }
}
```

### 6.5 `AssignUserToBranchUseCase`

**File:** `app/Application/TenantAdminDashboard/Branch/UseCases/AssignUserToBranchUseCase.php`

```php
<?php

declare(strict_types=1);

namespace App\Application\TenantAdminDashboard\Branch\UseCases;

use App\Application\TenantAdminDashboard\Branch\Commands\AssignUserToBranchCommand;
use App\Domain\TenantAdminDashboard\Branch\Exceptions\BranchNotFoundException;
use App\Domain\TenantAdminDashboard\Branch\Repositories\BranchRepositoryInterface;
use App\Infrastructure\Persistence\Shared\AuditContext;
use App\Infrastructure\Persistence\Shared\TenantAuditLogger;
use Illuminate\Support\Facades\DB;

final class AssignUserToBranchUseCase
{
    public function __construct(
        private readonly BranchRepositoryInterface $branchRepository,
        private readonly TenantAuditLogger $auditLogger,
    ) {}

    public function execute(AssignUserToBranchCommand $command): void
    {
        // Verify every branch_id belongs to this tenant
        foreach ($command->branchIds as $branchId) {
            $branch = $this->branchRepository->findById($command->tenantId, $branchId);
            if ($branch === null) {
                throw BranchNotFoundException::withId($branchId);
            }
        }

        DB::transaction(function () use ($command) {
            $this->branchRepository->syncUserBranchAssignments(
                tenantId: $command->tenantId,
                userId: $command->userId,
                assignedBy: $command->actorId ?? 0,
                branchIds: $command->branchIds,
            );

            $this->auditLogger->log(new AuditContext(
                tenantId: $command->tenantId,
                userId: $command->actorId ?? 0,
                action: 'branch.user_assigned',
                entityType: 'UserBranchAssignment',
                entityId: $command->userId,
                metadata: [
                    'user_id'    => $command->userId,
                    'branch_ids' => $command->branchIds,
                ],
            ));
        });
    }
}
```

### 6.6 Branch Queries

#### `ListBranchesQuery`

**File:** `app/Application/TenantAdminDashboard/Branch/Queries/ListBranchesQuery.php`

```php
<?php

declare(strict_types=1);

namespace App\Application\TenantAdminDashboard\Branch\Queries;

use App\Domain\TenantAdminDashboard\Branch\Repositories\BranchRepositoryInterface;

final class ListBranchesQuery
{
    public function __construct(
        private readonly BranchRepositoryInterface $branchRepository,
    ) {}

    public function execute(int $tenantId, bool $activeOnly = false): array
    {
        $branches = $this->branchRepository->findAllByTenant($tenantId, $activeOnly);

        return array_map(fn ($branch) => [
            'id'        => $branch->getId(),
            'name'      => $branch->getName(),
            'code'      => $branch->getCode()->value(),
            'address'   => $branch->getAddress(),
            'phone'     => $branch->getPhone(),
            'email'     => $branch->getEmail(),
            'is_active' => $branch->isActive(),
        ], $branches);
    }
}
```

#### `GetBranchQuery`

**File:** `app/Application/TenantAdminDashboard/Branch/Queries/GetBranchQuery.php`

```php
<?php

declare(strict_types=1);

namespace App\Application\TenantAdminDashboard\Branch\Queries;

use App\Domain\TenantAdminDashboard\Branch\Exceptions\BranchNotFoundException;
use App\Domain\TenantAdminDashboard\Branch\Repositories\BranchRepositoryInterface;

final class GetBranchQuery
{
    public function __construct(
        private readonly BranchRepositoryInterface $branchRepository,
    ) {}

    public function execute(int $tenantId, int $branchId): array
    {
        $branch = $this->branchRepository->findById($tenantId, $branchId);
        if ($branch === null) {
            throw BranchNotFoundException::withId($branchId);
        }

        return [
            'id'        => $branch->getId(),
            'name'      => $branch->getName(),
            'code'      => $branch->getCode()->value(),
            'address'   => $branch->getAddress(),
            'phone'     => $branch->getPhone(),
            'email'     => $branch->getEmail(),
            'is_active' => $branch->isActive(),
        ];
    }
}
```

---

## 7. Application Layer — Modified Lead Use Cases

### 7.1 `CreateLeadUseCase` Modifications

**File:** `app/Application/TenantAdminDashboard/LeadManagement/UseCases/CreateLeadUseCase.php`

Add these changes to the existing `CreateLeadUseCase`. Do not remove existing logic.

**Changes:**
1. Accept optional `branch_id` parameter in the existing `CreateLeadCommand`
2. If `branch_id` is provided, validate it exists and belongs to `tenant_id`
3. If lead source is `web_form` AND auto-assign is enabled for the tenant, call `LeadAutoAssignService`
4. Set `stage_changed_at = now()` via `LeadEntity::create()` (entity change from §4.7)

**`CreateLeadCommand` addition:**

```php
// Add to existing CreateLeadCommand:
public readonly ?int $branchId = null,
```

**Use Case logic additions (inside `execute()`):**

```php
// After existing tenant/source validation, add:
if ($command->branchId !== null) {
    $branch = $this->branchRepository->findById($command->tenantId, $command->branchId);
    if ($branch === null) {
        throw BranchNotFoundException::withId($command->branchId);
    }
}

// After creating the LeadEntity, if source is web_form:
$assignedToUserId = null;
if ($command->source === 'web_form' && $this->isAutoAssignEnabled($command->tenantId)) {
    $assignedToUserId = $this->autoAssignService->findBestCounselor(
        tenantId: $command->tenantId,
        branchId: $command->branchId,
    );
}

// Add audit metadata: 'branch_id' => $command->branchId
// Add audit action for auto-assign if $assignedToUserId !== null:
// action: 'lead.auto_assigned'
```

### 7.2 `AssignLeadUseCase` Modifications

**File:** `app/Application/TenantAdminDashboard/LeadManagement/UseCases/AssignLeadUseCase.php`

Add branch validation before completing assignment:

```php
// Inject BranchRepositoryInterface and BranchAccessPolicy into constructor

// In execute(), after loading the lead entity, before saving:
if ($lead->getBranchId() !== null) {
    $counselorBranchIds = $this->branchRepository->getUserBranchIds(
        $command->tenantId,
        $command->assignToUserId,
    );

    if (!in_array($lead->getBranchId(), $counselorBranchIds, true)) {
        throw CounselorNotAssignedToBranchException::forCounselorAndBranch(
            $command->assignToUserId,
            $lead->getBranchId(),
        );
    }
}

// After assignment, dispatch LeadAssigned event:
$events[] = new LeadAssigned(
    leadId: $lead->getId(),
    tenantId: $command->tenantId,
    branchId: $lead->getBranchId(),
    assignedToUserId: $command->assignToUserId,
    assignedByUserId: $command->actorId,
);
```

### 7.3 `ChangeLeadStageUseCase` Modifications

**File:** `app/Application/TenantAdminDashboard/LeadManagement/UseCases/ChangeLeadStageUseCase.php`

`stage_changed_at` is now set inside `LeadEntity::changeStage()` (§4.7). The repository must persist it. Verify `EloquentLeadRepository::fromEntity()` includes `stage_changed_at` in the mapped array. No other changes needed in the Use Case.

---

## 8. Application Layer — Queries

### 8.1 `ListLeadsQuery` Modifications

**File:** `app/Application/TenantAdminDashboard/LeadManagement/Queries/ListLeadsQuery.php`

Add these parameters to the existing `execute()` signature:

```php
public function execute(
    int $tenantId,
    int $requestingUserId,
    array $requestingUserCapabilities,
    ?int $branchIdFilter = null,
    // ... existing params ...
): array
```

**Branch security scope — applied automatically, not optionally:**

```php
// Load the requesting user's branch assignments
$userBranchIds = $this->branchRepository->getUserBranchIds($tenantId, $requestingUserId);

// If user does NOT hold crm.manage, scope query automatically:
if (!in_array('crm.manage', $requestingUserCapabilities, true)) {
    // Must see: leads where branch_id IS NULL OR branch_id IN user's assignments
    // This is passed to the repository query method
    $branchScope = ['branch_ids' => $userBranchIds, 'include_null' => true];
} else {
    $branchScope = null; // Manager sees all
}

// If explicit branch filter requested, apply it on top of security scope
```

### 8.2 `GetPipelineSummaryQuery` Modifications

**File:** `app/Application/TenantAdminDashboard/LeadManagement/Queries/GetPipelineSummaryQuery.php`

Add:
- Optional `branch_id` filter parameter
- For users with `crm.manage`: return per-branch breakdown when no filter is supplied
- For counselors: apply branch security scope automatically (same as `ListLeadsQuery`)

### 8.3 New: `GetStaleLeadsQuery`

**File:** `app/Application/TenantAdminDashboard/LeadManagement/Queries/GetStaleLeadsQuery.php`

Stale criteria (all must be true):
- Stage NOT IN (`admission_confirmed`, `rejected`)
- No `lead_follow_ups` with `completed_at IS NULL`
- No `lead_notes` created in the last N days (N = tenant setting, default 5)
- `stage_changed_at < now() - N days`

```php
<?php

declare(strict_types=1);

namespace App\Application\TenantAdminDashboard\LeadManagement\Queries;

use App\Domain\TenantAdminDashboard\LeadManagement\Repositories\LeadQueryInterface;

final class GetStaleLeadsQuery
{
    public function __construct(
        private readonly LeadQueryInterface $leadQuery,
    ) {}

    public function execute(
        int $tenantId,
        int $requestingUserId,
        array $requestingUserCapabilities,
        int $staleDays,
        int $page = 1,
        int $perPage = 20,
    ): array {
        // Apply same branch security scope as ListLeadsQuery
        // Delegate actual SQL to Infrastructure via LeadQueryInterface
        return $this->leadQuery->findStale(
            tenantId: $tenantId,
            requestingUserId: $requestingUserId,
            requestingUserCapabilities: $requestingUserCapabilities,
            staleDays: $staleDays,
            page: $page,
            perPage: $perPage,
        );
    }
}
```

### 8.4 New: `GetCounselorWorkloadQuery`

**File:** `app/Application/TenantAdminDashboard/LeadManagement/Queries/GetCounselorWorkloadQuery.php`

Returns open lead count per counselor for users with `crm.manage`.

```php
<?php

declare(strict_types=1);

namespace App\Application\TenantAdminDashboard\LeadManagement\Queries;

use App\Domain\TenantAdminDashboard\LeadManagement\Repositories\LeadQueryInterface;

final class GetCounselorWorkloadQuery
{
    public function __construct(
        private readonly LeadQueryInterface $leadQuery,
    ) {}

    /**
     * Returns array of:
     * [ 'user_id', 'name', 'open_lead_count', 'branch_ids' ]
     */
    public function execute(int $tenantId, ?int $branchId = null): array
    {
        return $this->leadQuery->getCounselorWorkload($tenantId, $branchId);
    }
}
```

---

## 9. Application Layer — Services

### 9.1 `LeadAutoAssignService`

**File:** `app/Application/TenantAdminDashboard/LeadManagement/Services/LeadAutoAssignService.php`

```php
<?php

declare(strict_types=1);

namespace App\Application\TenantAdminDashboard\LeadManagement\Services;

use App\Domain\TenantAdminDashboard\Branch\Repositories\BranchRepositoryInterface;
use App\Domain\TenantAdminDashboard\LeadManagement\Repositories\LeadQueryInterface;

/**
 * Domain service — determines the best counselor to auto-assign a web_form lead.
 *
 * Algorithm:
 * 1. Load all active users assigned to the lead's branch (or all tenant counselors if branch_id is null).
 * 2. Filter to users with capability `lead.manage`.
 * 3. For each candidate, count open leads (stage NOT IN terminal stages AND assigned_to = user_id).
 * 4. Select the candidate with the lowest open lead count.
 * 5. Tie-break: select the one with the oldest last_assignment_at (most recently idle).
 * 6. If no candidates, return null (lead created unassigned, not an error).
 */
final class LeadAutoAssignService
{
    public function __construct(
        private readonly BranchRepositoryInterface $branchRepository,
        private readonly LeadQueryInterface $leadQuery,
    ) {}

    public function findBestCounselor(int $tenantId, ?int $branchId): ?int
    {
        $candidates = $this->leadQuery->getCounselorsForAutoAssign(
            tenantId: $tenantId,
            branchId: $branchId,
        );

        if (empty($candidates)) {
            return null;
        }

        usort($candidates, function (array $a, array $b) {
            if ($a['open_lead_count'] !== $b['open_lead_count']) {
                return $a['open_lead_count'] <=> $b['open_lead_count'];
            }
            // Tie-break: oldest last_assignment_at (most idle) wins
            return $a['last_assignment_at'] <=> $b['last_assignment_at'];
        });

        return (int) $candidates[0]['user_id'];
    }
}
```

**Compliance notes:**
- Domain service — no Eloquent, no framework facades
- Delegates data access to `LeadQueryInterface` (Infrastructure implementation)
- Called only from `CreateLeadUseCase` when source is `web_form` and auto-assign is enabled

---

## 10. Application Layer — Events & Listeners

### 10.1 `NotifyLeadAssignedListener`

**File:** `app/Application/TenantAdminDashboard/LeadManagement/Listeners/NotifyLeadAssignedListener.php`

```php
<?php

declare(strict_types=1);

namespace App\Application\TenantAdminDashboard\LeadManagement\Listeners;

use App\Domain\TenantAdminDashboard\LeadManagement\Events\LeadAssigned;

final class NotifyLeadAssignedListener
{
    public function __construct(
        private readonly \App\Infrastructure\Notifications\NotificationDispatcherInterface $notificationDispatcher,
    ) {}

    public function handle(LeadAssigned $event): void
    {
        $this->notificationDispatcher->dispatch(
            tenantId: $event->tenantId,
            recipientUserId: $event->assignedToUserId,
            type: 'lead_assigned',
            payload: [
                'lead_id'   => $event->leadId,
                'branch_id' => $event->branchId,
            ],
            channels: ['email', 'in_app'],
            priority: 'default',
        );
    }
}
```

### 10.2 `NotifyStaleLeadListener`

**File:** `app/Application/TenantAdminDashboard/LeadManagement/Listeners/NotifyStaleLeadListener.php`

```php
<?php

declare(strict_types=1);

namespace App\Application\TenantAdminDashboard\LeadManagement\Listeners;

use App\Domain\TenantAdminDashboard\LeadManagement\Events\StaleLeadDetected;

final class NotifyStaleLeadListener
{
    public function __construct(
        private readonly \App\Infrastructure\Notifications\NotificationDispatcherInterface $notificationDispatcher,
        private readonly \App\Domain\TenantAdminDashboard\Shared\TenantOwnerResolverInterface $tenantOwnerResolver,
    ) {}

    public function handle(StaleLeadDetected $event): void
    {
        $recipientId = $event->assignedToUserId
            ?? $this->tenantOwnerResolver->getOwnerId($event->tenantId);

        $this->notificationDispatcher->dispatch(
            tenantId: $event->tenantId,
            recipientUserId: $recipientId,
            type: 'stale_lead_detected',
            payload: [
                'lead_id'    => $event->leadId,
                'days_stale' => $event->daysStale,
                'branch_id'  => $event->branchId,
            ],
            channels: ['email', 'in_app'],
            priority: 'low',
        );
    }
}
```

**Compliance notes:**
- Both listeners use `NotificationDispatcher` from Phase 14 — no `Mail::send()` calls
- Listeners registered in `EventServiceProvider`

### 10.3 Event Registration

Register in `app/Providers/EventServiceProvider.php`:

```php
use App\Domain\TenantAdminDashboard\LeadManagement\Events\LeadAssigned;
use App\Domain\TenantAdminDashboard\LeadManagement\Events\StaleLeadDetected;
use App\Application\TenantAdminDashboard\LeadManagement\Listeners\NotifyLeadAssignedListener;
use App\Application\TenantAdminDashboard\LeadManagement\Listeners\NotifyStaleLeadListener;

protected $listen = [
    // ... existing listeners ...
    LeadAssigned::class      => [NotifyLeadAssignedListener::class],
    StaleLeadDetected::class => [NotifyStaleLeadListener::class],
];
```

---

## 11. HTTP Layer — Controllers, Requests, Routes

### 11.1 Form Requests

#### `StoreBranchRequest`

**File:** `app/Http/Requests/TenantAdminDashboard/Branch/StoreBranchRequest.php`

```php
<?php

declare(strict_types=1);

namespace App\Http\Requests\TenantAdminDashboard\Branch;

use Illuminate\Foundation\Http\FormRequest;

final class StoreBranchRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'name'    => ['required', 'string', 'max:150'],
            'code'    => ['required', 'string', 'max:30', 'regex:/^[A-Z0-9\-_]+$/i'],
            'address' => ['nullable', 'string', 'max:500'],
            'phone'   => ['nullable', 'string', 'max:20'],
            'email'   => ['nullable', 'email', 'max:150'],
        ];
    }
}
```

**Note:** Uniqueness of `code` within `tenant_id` is validated at the Use Case layer via `BranchRepositoryInterface::findByCode()`, not in the FormRequest (business rule, not syntax).

#### `UpdateBranchRequest`

**File:** `app/Http/Requests/TenantAdminDashboard/Branch/UpdateBranchRequest.php`

```php
<?php

declare(strict_types=1);

namespace App\Http\Requests\TenantAdminDashboard\Branch;

use Illuminate\Foundation\Http\FormRequest;

final class UpdateBranchRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'name'    => ['required', 'string', 'max:150'],
            'address' => ['nullable', 'string', 'max:500'],
            'phone'   => ['nullable', 'string', 'max:20'],
            'email'   => ['nullable', 'email', 'max:150'],
        ];
    }
}
```

**Note:** `code` is NOT in `UpdateBranchRequest` — code is immutable after creation.

#### `AssignUserBranchesRequest`

**File:** `app/Http/Requests/TenantAdminDashboard/Branch/AssignUserBranchesRequest.php`

```php
<?php

declare(strict_types=1);

namespace App\Http\Requests\TenantAdminDashboard\Branch;

use Illuminate\Foundation\Http\FormRequest;

final class AssignUserBranchesRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'branch_ids'   => ['required', 'array'],
            'branch_ids.*' => ['integer'],
        ];
    }
}
```

**Note:** Existence of each `branch_id` within the tenant is validated at the Use Case layer, not in FormRequest.

### 11.2 Controllers

#### `BranchReadController`

**File:** `app/Http/Controllers/Api/TenantAdminDashboard/Branch/BranchReadController.php`

```php
<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\TenantAdminDashboard\Branch;

use App\Application\TenantAdminDashboard\Branch\Queries\GetBranchQuery;
use App\Application\TenantAdminDashboard\Branch\Queries\ListBranchesQuery;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

final class BranchReadController extends Controller
{
    public function index(Request $request, ListBranchesQuery $query): JsonResponse
    {
        $branches = $query->execute(
            tenantId: $request->user()->tenant_id,
            activeOnly: (bool) $request->query('active_only', false),
        );

        return response()->json(['data' => $branches]);
    }

    public function show(Request $request, GetBranchQuery $query, int $id): JsonResponse
    {
        $branch = $query->execute(
            tenantId: $request->user()->tenant_id,
            branchId: $id,
        );

        return response()->json(['data' => $branch]);
    }
}
```

#### `BranchWriteController`

**File:** `app/Http/Controllers/Api/TenantAdminDashboard/Branch/BranchWriteController.php`

```php
<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\TenantAdminDashboard\Branch;

use App\Application\TenantAdminDashboard\Branch\Commands\AssignUserToBranchCommand;
use App\Application\TenantAdminDashboard\Branch\Commands\CreateBranchCommand;
use App\Application\TenantAdminDashboard\Branch\Commands\DeactivateBranchCommand;
use App\Application\TenantAdminDashboard\Branch\Commands\UpdateBranchCommand;
use App\Application\TenantAdminDashboard\Branch\UseCases\AssignUserToBranchUseCase;
use App\Application\TenantAdminDashboard\Branch\UseCases\CreateBranchUseCase;
use App\Application\TenantAdminDashboard\Branch\UseCases\DeactivateBranchUseCase;
use App\Application\TenantAdminDashboard\Branch\UseCases\UpdateBranchUseCase;
use App\Http\Controllers\Controller;
use App\Http\Requests\TenantAdminDashboard\Branch\AssignUserBranchesRequest;
use App\Http\Requests\TenantAdminDashboard\Branch\StoreBranchRequest;
use App\Http\Requests\TenantAdminDashboard\Branch\UpdateBranchRequest;
use Illuminate\Http\JsonResponse;

final class BranchWriteController extends Controller
{
    public function store(StoreBranchRequest $request, CreateBranchUseCase $useCase): JsonResponse
    {
        $branch = $useCase->execute(new CreateBranchCommand(
            tenantId: $request->user()->tenant_id,
            name: $request->input('name'),
            code: $request->input('code'),
            address: $request->input('address'),
            phone: $request->input('phone'),
            email: $request->input('email'),
            actorId: $request->user()->id,
        ));

        return response()->json(['data' => ['id' => $branch->getId()]], 201);
    }

    public function update(UpdateBranchRequest $request, UpdateBranchUseCase $useCase, int $id): JsonResponse
    {
        $branch = $useCase->execute(new UpdateBranchCommand(
            tenantId: $request->user()->tenant_id,
            branchId: $id,
            name: $request->input('name'),
            address: $request->input('address'),
            phone: $request->input('phone'),
            email: $request->input('email'),
            actorId: $request->user()->id,
        ));

        return response()->json(['data' => ['id' => $branch->getId()]]);
    }

    public function deactivate(\Illuminate\Http\Request $request, DeactivateBranchUseCase $useCase, int $id): JsonResponse
    {
        $useCase->execute(new DeactivateBranchCommand(
            tenantId: $request->user()->tenant_id,
            branchId: $id,
            actorId: $request->user()->id,
        ));

        return response()->json(['data' => ['message' => 'Branch deactivated.']]);
    }

    public function assignUserBranches(
        AssignUserBranchesRequest $request,
        AssignUserToBranchUseCase $useCase,
        int $userId,
    ): JsonResponse {
        $useCase->execute(new AssignUserToBranchCommand(
            tenantId: $request->user()->tenant_id,
            userId: $userId,
            branchIds: $request->input('branch_ids'),
            actorId: $request->user()->id,
        ));

        return response()->json(['data' => ['message' => 'Branch assignments updated.']]);
    }
}
```

**Compliance notes:**
- All methods ≤ 20 lines
- No business logic — pure coordinate: FormRequest → Command → UseCase → Response
- `tenant_id` derived from authenticated user, never from request body

### 11.3 Route File

**File:** `routes/tenant_dashboard/branch.php`

```php
<?php

use App\Http\Controllers\Api\TenantAdminDashboard\Branch\BranchReadController;
use App\Http\Controllers\Api\TenantAdminDashboard\Branch\BranchWriteController;
use Illuminate\Support\Facades\Route;

Route::middleware([
    'tenant.resolve.token',
    'auth:tenant_api',
    'tenant.active',
    'ensure.user.active',
    'tenant.session',
])->prefix('api/tenant-dashboard')->group(function () {

    Route::middleware('tenant.capability:branch.view')->group(function () {
        Route::get('/branches', [BranchReadController::class, 'index']);
        Route::get('/branches/{id}', [BranchReadController::class, 'show']);
    });

    Route::middleware('tenant.capability:branch.manage')->group(function () {
        Route::post('/branches', [BranchWriteController::class, 'store']);
        Route::put('/branches/{id}', [BranchWriteController::class, 'update']);
        Route::post('/branches/{id}/deactivate', [BranchWriteController::class, 'deactivate']);
        Route::put('/users/{userId}/branches', [BranchWriteController::class, 'assignUserBranches']);
    });
});
```

Register in route service provider alongside existing `crm.php`, `lead.php`:

```php
// In RouteServiceProvider or equivalent:
require base_path('routes/tenant_dashboard/branch.php');
```

### 11.4 Modified Lead Routes (additions only)

Add these two new endpoints to the existing `routes/tenant_dashboard/crm.php` or `lead.php`:

```php
Route::middleware('tenant.capability:lead.view')->group(function () {
    Route::get('/crm/leads/stale', [LeadReadController::class, 'stale']);
});

Route::middleware('tenant.capability:crm.manage')->group(function () {
    Route::get('/crm/counselors/workload', [CounselorWorkloadController::class, 'index']);
});
```

---

## 12. Console Command — `DetectStaleLeadsCommand`

**File:** `app/Console/Commands/DetectStaleLeadsCommand.php`

```php
<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Domain\TenantAdminDashboard\LeadManagement\Events\StaleLeadDetected;
use App\Domain\TenantAdminDashboard\LeadManagement\Repositories\LeadQueryInterface;
use App\Infrastructure\Persistence\Shared\TenantSettingsReader;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

final class DetectStaleLeadsCommand extends Command
{
    protected $signature = 'crm:detect-stale-leads';
    protected $description = 'Detect stale CRM leads and dispatch StaleLeadDetected events.';

    public function __construct(
        private readonly LeadQueryInterface $leadQuery,
        private readonly TenantSettingsReader $settingsReader,
    ) {
        parent::__construct();
    }

    public function handle(): int
    {
        $tenantIds = DB::table('tenants')->where('is_active', 1)->pluck('id');

        foreach ($tenantIds as $tenantId) {
            $staleDays = (int) ($this->settingsReader->get(
                (int) $tenantId,
                'crm.stale_lead_days',
                default: 5
            ));

            $staleLeads = $this->leadQuery->findStaleForCommand(
                tenantId: (int) $tenantId,
                staleDays: $staleDays,
            );

            foreach ($staleLeads as $lead) {
                // Deduplication: check notification_sent_log (Phase 14 infrastructure)
                $alreadySent = DB::table('notification_sent_log')
                    ->where('tenant_id', $tenantId)
                    ->where('entity_id', $lead['id'])
                    ->where('type', 'stale_lead_detected')
                    ->whereDate('sent_at', today())
                    ->exists();

                if ($alreadySent) {
                    continue;
                }

                event(new StaleLeadDetected(
                    leadId: (int) $lead['id'],
                    tenantId: (int) $tenantId,
                    branchId: $lead['branch_id'] ? (int) $lead['branch_id'] : null,
                    assignedToUserId: $lead['assigned_to'] ? (int) $lead['assigned_to'] : null,
                    daysStale: $staleDays,
                ));
            }
        }

        return Command::SUCCESS;
    }
}
```

**Schedule registration** in `app/Console/Kernel.php`:

```php
$schedule->command('crm:detect-stale-leads')->dailyAt('08:00');
```

**Compliance notes:**
- Deduplication uses `notification_sent_log` table (Phase 14 infrastructure) — keyed on `(entity_id, type, date)`
- Events dispatched outside any transaction (command context, no transaction needed)
- Tenant context explicit per iteration — no global state

---

## 13. Capability Registration

Add to the tenant capability registry (location depends on existing registration pattern — likely a seeder or config file):

```php
// New capabilities:
[
    'code'          => 'branch.view',
    'description'   => 'View branch list and details',
    'default_roles' => ['OWNER', 'ADMIN'],
],
[
    'code'          => 'branch.manage',
    'description'   => 'Create, update, deactivate branches; assign users to branches',
    'default_roles' => ['OWNER', 'ADMIN'],
],
```

**`crm.manage` already exists** and serves as the cross-branch access override. Do not add a new capability for this.

---

## 14. Service Provider Bindings

Register all new interface → implementation bindings. Add to `app/Providers/BranchServiceProvider.php` (create new) or add to the existing `CrmServiceProvider.php`:

```php
<?php

declare(strict_types=1);

namespace App\Providers;

use App\Application\TenantAdminDashboard\Branch\Queries\GetBranchQuery;
use App\Application\TenantAdminDashboard\Branch\Queries\ListBranchesQuery;
use App\Application\TenantAdminDashboard\Branch\UseCases\AssignUserToBranchUseCase;
use App\Application\TenantAdminDashboard\Branch\UseCases\CreateBranchUseCase;
use App\Application\TenantAdminDashboard\Branch\UseCases\DeactivateBranchUseCase;
use App\Application\TenantAdminDashboard\Branch\UseCases\UpdateBranchUseCase;
use App\Domain\TenantAdminDashboard\Branch\Repositories\BranchRepositoryInterface;
use App\Infrastructure\Persistence\TenantAdminDashboard\Branch\EloquentBranchRepository;
use Illuminate\Support\ServiceProvider;

final class BranchServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->bind(BranchRepositoryInterface::class, EloquentBranchRepository::class);

        $this->app->bind(CreateBranchUseCase::class);
        $this->app->bind(UpdateBranchUseCase::class);
        $this->app->bind(DeactivateBranchUseCase::class);
        $this->app->bind(AssignUserToBranchUseCase::class);
        $this->app->bind(ListBranchesQuery::class);
        $this->app->bind(GetBranchQuery::class);
    }
}
```

Register `BranchServiceProvider` in `config/app.php` providers array.

---

## 15. Implementation Sequence

Follow this exact order. Steps are sequenced to prevent blockers.

| Step | Task | Why This Order |
|------|------|----------------|
| **S1** | Run all four database migrations | Everything depends on schema |
| **S2** | `BranchCode` value object + unit tests | Domain first, no dependencies |
| **S3** | `BranchEntity` + unit tests | Depends on `BranchCode` |
| **S4** | Branch domain events (`BranchCreated`, `BranchUpdated`, `BranchDeactivated`) | Needed by entity |
| **S5** | Branch domain exceptions | Needed by Use Cases |
| **S6** | `BranchRepositoryInterface` | Contract before implementation |
| **S7** | `BranchRecord` + `UserBranchAssignmentRecord` Eloquent models | Infrastructure before repo impl |
| **S8** | `EloquentBranchRepository` + integration tests | Repository before Use Cases |
| **S9** | `BranchAccessPolicy` domain service + unit tests | Security logic proven before Use Cases use it |
| **S10** | Branch Use Cases (Create, Update, Deactivate, AssignUser) + unit/integration tests | Core branch functionality |
| **S11** | Branch Controllers + Requests + Route file | HTTP layer last |
| **S12** | `LeadEntity` modifications (`branch_id`, `stage_changed_at`) | Extend existing entity |
| **S13** | Modified Lead Use Cases (`CreateLeadUseCase`, `AssignLeadUseCase`, `ChangeLeadStageUseCase`) | Extend existing Use Cases |
| **S14** | Modified Lead Queries (`ListLeadsQuery`, `GetPipelineSummaryQuery`) + branch security scope | Security-critical — verify with tests immediately |
| **S15** | `LeadAutoAssignService` + integration into `CreateLeadUseCase` | Depends on S13 |
| **S16** | `GetStaleLeadsQuery` + `GetCounselorWorkloadQuery` | New read paths |
| **S17** | `LeadAssigned` + `StaleLeadDetected` domain events | Event-driven side effects |
| **S18** | `NotifyLeadAssignedListener` + `NotifyStaleLeadListener` + EventServiceProvider registration | Depends on S17 + Phase 14 |
| **S19** | `DetectStaleLeadsCommand` + schedule registration | Depends on S17 |
| **S20** | New capability registration (`branch.view`, `branch.manage`) | Required for middleware checks |
| **S21** | Service provider bindings (`BranchServiceProvider`) | Required for DI resolution |
| **S22** | Full test pass + PHPStan Level 5 | Gate verification |

---

## 16. Quality Gates

All gates must pass before Phase 15A is considered complete. Verify each explicitly.

### 16.1 Functional Gates

- [ ] Branch CRUD works end-to-end: create, update, deactivate, list, show
- [ ] Deactivating a branch with active leads returns 422 with a clear error message (not 500)
- [ ] Leads created with a `branch_id` correctly store and return the branch
- [ ] Leads created without `branch_id` store null and are accessible by all tenant users
- [ ] Auto-assign selects the counselor with the fewest open leads in the correct branch
- [ ] Auto-assign with no eligible counselors creates lead as unassigned — no error raised
- [ ] `GetStaleLeadsQuery` returns only leads meeting all four stale criteria simultaneously
- [ ] `DetectStaleLeadsCommand` dispatches `StaleLeadDetected` to the assigned counselor; if unassigned, to tenant OWNER
- [ ] `DetectStaleLeadsCommand` does NOT send duplicate notifications for the same lead on the same day
- [ ] Counselor workload endpoint returns correct open lead counts per counselor per branch

### 16.2 Security Gates

- [ ] Counselor assigned only to Branch A cannot read leads belonging to Branch B — returns 403
- [ ] Counselor assigned only to Branch A cannot use `AssignLeadUseCase` for a Branch B lead — returns 403
- [ ] User with `crm.manage` can read leads from any branch within the tenant
- [ ] User from Tenant A cannot access branches or leads of Tenant B — returns 404
- [ ] `branch_id` submitted in lead creation is validated against the requesting user's tenant before passing to Use Case
- [ ] Counselor workload endpoint returns 403 for users without `crm.manage` capability

### 16.3 Architecture Gates

- [ ] `BranchAccessPolicy` has zero Illuminate imports — pure PHP confirmed via `grep -rn 'use Illuminate' app/Domain/`
- [ ] `BranchEntity` has zero database calls — no Eloquent, no repositories
- [ ] Auto-assign logic lives exclusively in `LeadAutoAssignService`, not scattered across Use Case or Controller
- [ ] Branch security scope in `ListLeadsQuery` is applied automatically based on user context — not passed as an optional override from the Controller
- [ ] `NotifyLeadAssignedListener` and `NotifyStaleLeadListener` use `NotificationDispatcher` — zero `Mail::send()` calls
- [ ] Stale lead deduplication uses `notification_sent_log` table — no custom lock table or flag column
- [ ] PHPStan Level 5 passes with zero errors: `docker exec -it ubotz_backend vendor/bin/phpstan analyse app/ --level=5`
- [ ] Zero `env()` calls outside `config/` files: `grep -rn 'env(' app/ routes/ database/` → 0 results
- [ ] Zero `->enum()` in migrations: `grep -rn '->enum(' database/migrations/` → 0 results
- [ ] Zero `use Illuminate` in Domain layer: `grep -rn 'use Illuminate' app/Domain/` → 0 results
- [ ] Zero regression on existing test suite

### 16.4 Test Coverage Required

| Test Type | What to Test |
|-----------|--------------|
| **Unit** | `BranchCode` (valid values, invalid values, uppercase normalisation) |
| **Unit** | `BranchEntity` (create, reconstitute, update, deactivate — no db) |
| **Unit** | `BranchAccessPolicy` (all four access matrix cells) |
| **Unit** | `LeadAutoAssignService` (fewest-open-leads selection, tie-break, empty-candidates) |
| **Integration** | `CreateBranchUseCase` (happy path, duplicate code conflict) |
| **Integration** | `UpdateBranchUseCase` (happy path, not found) |
| **Integration** | `DeactivateBranchUseCase` (happy path, active leads guard) |
| **Integration** | `AssignUserToBranchUseCase` (replace assignments atomically, invalid branch_id) |
| **Integration** | `CreateLeadUseCase` (with branch_id, without branch_id, auto-assign trigger, no eligible counselors) |
| **Integration** | `AssignLeadUseCase` (counselor in branch, counselor not in branch → exception) |
| **Integration** | `ChangeLeadStageUseCase` (verify `stage_changed_at` is updated) |
| **Integration** | `GetStaleLeadsQuery` (only leads meeting all four criteria returned) |
| **Feature** | `GET /api/tenant-dashboard/branches` (auth, capability, tenant isolation) |
| **Feature** | `POST /api/tenant-dashboard/branches` (auth, capability, duplicate code) |
| **Feature** | `PUT /api/tenant-dashboard/branches/{id}` (auth, capability, not found) |
| **Feature** | `POST /api/tenant-dashboard/branches/{id}/deactivate` (auth, capability, active leads guard) |
| **Feature** | `PUT /api/tenant-dashboard/users/{userId}/branches` (auth, capability, invalid branch) |
| **Feature** | `GET /api/tenant-dashboard/crm/leads` with branch filter — counselor only sees own branch |
| **Feature** | `GET /api/tenant-dashboard/crm/leads/stale` (branch scoped, returns correct leads) |
| **Feature** | `GET /api/tenant-dashboard/crm/counselors/workload` (403 without crm.manage) |
| **Feature** | Tenant isolation: Tenant A user cannot access Tenant B branches or leads |
| **Command** | `crm:detect-stale-leads` — stale detection logic, correct recipient selection, deduplication |

---

## 17. Developer Manual Compliance Checklist

Before each commit, verify all items. Failure = do not push.

```
□ PHPStan Level 5 passes:
  docker exec -it ubotz_backend vendor/bin/phpstan analyse app/ --level=5

□ All tests pass:
  docker exec -it ubotz_backend php artisan test

□ No env() in app code:
  grep -rn 'env(' app/ routes/ database/ → 0 results

□ No Illuminate in Domain:
  grep -rn 'use Illuminate' app/Domain/ → 0 results

□ No MySQL ENUMs:
  grep -rn '->enum(' database/migrations/ → 0 results

□ Every UseCase has int $tenantId (directly or via Command)
□ Every UseCase has DB::transaction() wrapping persistence + audit
□ Every UseCase dispatches events AFTER DB::transaction() commit
□ Every UseCase has audit logging inside the transaction
□ Every repository method includes tenant_id for tenant-scoped data
□ Every Command has declare(strict_types=1) and final class
□ No "Manage*" god-classes — one operation per UseCase
□ No generic \Exception — domain-specific exceptions only
□ No HTTP exceptions in Application or Domain layers
□ No DB::table() in Application layer
□ No facades (Storage, Mail, Cache, PDF) in Application layer
□ Controllers are < 20 lines per method
□ BranchAccessPolicy has zero Illuminate imports (pure PHP)
□ BranchEntity has zero database calls
□ LeadAutoAssignService has zero DB:: or Eloquent calls (delegates to LeadQueryInterface)
□ Notification listeners use NotificationDispatcher — zero Mail::send() calls
□ Stale lead deduplication uses notification_sent_log (Phase 14) — not a custom flag
□ branch_id validated against tenant_id in controller before passing to Use Case
□ Cross-branch access returns 403, not 404 (confirmed by security gate tests)
```

---

## 18. Appendix: Complete File Tree

### New Files

```
Domain:
  app/Domain/TenantAdminDashboard/Branch/
    Entities/
      BranchEntity.php
    Events/
      BranchCreated.php
      BranchUpdated.php
      BranchDeactivated.php
    Exceptions/
      BranchNotFoundException.php
      DuplicateBranchCodeException.php
      CannotDeactivateBranchWithActiveLeadsException.php
    Repositories/
      BranchRepositoryInterface.php
    Services/
      BranchAccessPolicy.php
    ValueObjects/
      BranchCode.php

  app/Domain/TenantAdminDashboard/LeadManagement/Events/
    LeadAssigned.php
    StaleLeadDetected.php
  app/Domain/TenantAdminDashboard/LeadManagement/Exceptions/
    CounselorNotAssignedToBranchException.php

Application:
  app/Application/TenantAdminDashboard/Branch/
    Commands/
      CreateBranchCommand.php
      UpdateBranchCommand.php
      DeactivateBranchCommand.php
      AssignUserToBranchCommand.php
    UseCases/
      CreateBranchUseCase.php
      UpdateBranchUseCase.php
      DeactivateBranchUseCase.php
      AssignUserToBranchUseCase.php
    Queries/
      ListBranchesQuery.php
      GetBranchQuery.php
  app/Application/TenantAdminDashboard/LeadManagement/
    Services/
      LeadAutoAssignService.php
    Queries/
      GetStaleLeadsQuery.php
      GetCounselorWorkloadQuery.php
    Listeners/
      NotifyLeadAssignedListener.php
      NotifyStaleLeadListener.php

Infrastructure:
  app/Infrastructure/Persistence/TenantAdminDashboard/Branch/
    BranchRecord.php
    UserBranchAssignmentRecord.php
    EloquentBranchRepository.php

HTTP:
  app/Http/Controllers/Api/TenantAdminDashboard/Branch/
    BranchReadController.php
    BranchWriteController.php
  app/Http/Requests/TenantAdminDashboard/Branch/
    StoreBranchRequest.php
    UpdateBranchRequest.php
    AssignUserBranchesRequest.php

Console:
  app/Console/Commands/DetectStaleLeadsCommand.php

Providers:
  app/Providers/BranchServiceProvider.php

Database (tenant migrations):
  database/migrations/tenant/
    YYYY_MM_DD_HHMMSS_create_branches_table.php
    YYYY_MM_DD_HHMMSS_create_user_branch_assignments_table.php
    YYYY_MM_DD_HHMMSS_add_branch_id_to_leads_table.php
    YYYY_MM_DD_HHMMSS_add_stage_changed_at_to_leads_table.php

Routes:
  routes/tenant_dashboard/branch.php
```

### Modified Files

```
app/Domain/TenantAdminDashboard/LeadManagement/Entities/LeadEntity.php
  — ADD: branch_id (nullable int)
  — ADD: stage_changed_at (nullable \DateTimeImmutable)
  — MODIFY: changeStage() to set stage_changed_at = new \DateTimeImmutable()
  — ADD: getBranchId(), getStageChangedAt() getters
  — MODIFY: create() and reconstitute() to accept/assign new fields

app/Application/TenantAdminDashboard/LeadManagement/Commands/CreateLeadCommand.php
  — ADD: branchId (nullable int, default null)

app/Application/TenantAdminDashboard/LeadManagement/UseCases/CreateLeadUseCase.php
  — ADD: branch_id validation against tenant
  — ADD: auto-assign trigger for web_form source
  — ADD: audit metadata for auto-assign

app/Application/TenantAdminDashboard/LeadManagement/UseCases/AssignLeadUseCase.php
  — ADD: BranchAccessPolicy check on counselor assignment
  — ADD: dispatch LeadAssigned event

app/Application/TenantAdminDashboard/LeadManagement/UseCases/ChangeLeadStageUseCase.php
  — Verify: stage_changed_at is persisted (entity change handles this automatically)

app/Application/TenantAdminDashboard/LeadManagement/Queries/ListLeadsQuery.php
  — ADD: requestingUserId, requestingUserCapabilities parameters
  — ADD: automatic branch security scope based on user's branch assignments
  — ADD: optional branch_id filter parameter

app/Application/TenantAdminDashboard/LeadManagement/Queries/GetPipelineSummaryQuery.php
  — ADD: branch_id filter parameter
  — ADD: per-branch breakdown for crm.manage holders

app/Infrastructure/Persistence/TenantAdminDashboard/LeadManagement/EloquentLeadRepository.php
  — ADD: branch_id and stage_changed_at to fromEntity() mapper
  — ADD: branch_id and stage_changed_at to toEntity() mapper

app/Providers/EventServiceProvider.php
  — ADD: LeadAssigned → NotifyLeadAssignedListener
  — ADD: StaleLeadDetected → NotifyStaleLeadListener

app/Console/Kernel.php
  — ADD: $schedule->command('crm:detect-stale-leads')->dailyAt('08:00');

config/app.php
  — ADD: BranchServiceProvider::class to providers array
```

---

## Definition of Done

Phase 15A is complete when:

1. All 22 implementation steps in §15 are complete.
2. All quality gates in §16 pass with zero failures.
3. A Principal Engineer architecture audit confirms zero Critical or Architectural findings.
4. All audit findings are resolved before any merge.
5. End-to-end scenario verified manually:
   - Web form lead arrives → auto-assigned to correct branch counselor
   - Counselor cannot see Branch B leads → 403 returned
   - `DetectStaleLeadsCommand` fires after N days → notification to assigned counselor
   - Same command on day 2 → no duplicate notification
6. Phase 15A Completion Report signed off.

---

*End of Document — UBOTZ 2.0 Phase 15A Implementation Plan — March 17, 2026*
