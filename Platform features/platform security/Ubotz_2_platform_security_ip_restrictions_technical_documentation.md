# UBOTZ 2.0 — Platform Security — Technical Specification

| Field | Value |
|---|---|
| **Document Type** | Principal Engineer — Technical Specification |
| **Feature** | Platform Security (IP Restrictions + Security Headers) |
| **Date** | 2026-03-27 |
| **Issued By** | Principal Engineer / Architecture Auditor |
| **Scope** | Full-stack: DB migration, domain layer, application layer, infrastructure (caching/middleware), HTTP layer, API routes, test coverage |
| **Status** | COMPLETE — Reflects full codebase analysis |

---

## 1. System Architecture Overview

```
┌──────────────────────────────────────────────────────────────┐
│                     HTTP Layer                                │
│                                                              │
│   [Every Request]                                            │
│     → SecurityHeaders Middleware (global response headers)   │
│     → CheckIpRestriction Middleware (network-level gate)     │
│                                                              │
│   [Super Admin — Read, authority ≥ 60]                       │
│     → IpRestrictionReadController::index()                   │
│                                                              │
│   [Super Admin — Write, authority = 90]                      │
│     → IpRestrictionWriteController::store()                  │
│     → IpRestrictionWriteController::destroy()                │
└──────────────────────────────────────────────────────────────┘
                          │
┌──────────────────────────────────────────────────────────────┐
│                  Application Layer                            │
│                                                              │
│   Commands:                                                  │
│     CreateIpRestrictionCommand (type, value, reason, actorId)│
│     DeleteIpRestrictionCommand (id, actorId)                 │
│                                                              │
│   Use Cases:                                                 │
│     CreateIpRestrictionUseCase  → idempotency + persist + audit│
│     DeleteIpRestrictionUseCase  → load + delete + audit      │
│                                                              │
│   Queries:                                                   │
│     ListIpRestrictionsQuery  → paginated read                │
└──────────────────────────────────────────────────────────────┘
                          │
┌──────────────────────────────────────────────────────────────┐
│                    Domain Layer                               │
│                                                              │
│   Entity:   IpRestrictionEntity (AggregateRoot)              │
│   Value Object: RestrictionType (full_ip | ip_range | country)│
│   Events:   IpRestrictionCreated, IpRestrictionDeleted       │
│   Exceptions: InvalidIpRestrictionValueException,            │
│               IpRestrictionNotFoundException                 │
│   Interfaces: IpRestrictionRepositoryInterface,              │
│               IpRestrictionQueryInterface                    │
└──────────────────────────────────────────────────────────────┘
                          │
┌──────────────────────────────────────────────────────────────┐
│               Infrastructure Layer (Central DB)              │
│                                                              │
│   EloquentIpRestrictionRepository                            │
│     implements IpRestrictionRepositoryInterface              │
│     implements IpRestrictionQueryInterface                   │
│                                                              │
│   IpRestrictionRecord (Eloquent) → ip_restrictions table     │
│                                                              │
│   Cache: Cache::rememberForever('platform:ip_restrictions')  │
│   Invalidation: Cache::forget() on save() and delete()       │
└──────────────────────────────────────────────────────────────┘
```

---

## 2. Database Layer

### 2.1 Migration

**File:** `database/migrations/central/2026_03_10_161352_create_ip_restrictions_table.php`

The table lives in the **central database** (not a tenant database). There is no tenant scoping on this table — it is a platform-wide control.

```php
Schema::create('ip_restrictions', function (Blueprint $table) {
    $table->id();
    $table->string('type', 30);   // full_ip | ip_range | country
    $table->string('value');       // IP address, CIDR, or ISO country code
    $table->text('reason');        // Mandatory justification
    $table->timestamps();
});
```

### 2.2 Table: `ip_restrictions`

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | BIGINT UNSIGNED (PK) | No | Auto-increment |
| `type` | VARCHAR(30) | No | Enum: `full_ip`, `ip_range`, `country` |
| `value` | VARCHAR(255) | No | The blocked network identifier |
| `reason` | TEXT | No | Mandatory justification — auditing requirement |
| `created_at` | TIMESTAMP | Yes | Laravel standard |
| `updated_at` | TIMESTAMP | Yes | Laravel standard |

### 2.3 Eloquent Model: `IpRestrictionRecord`

**File:** `app/Infrastructure/Persistence/SuperAdminDashboard/Security/IpRestrictionRecord.php`
**Namespace:** `App\Infrastructure\Persistence\SuperAdminDashboard\Security`

```php
final class IpRestrictionRecord extends Model
{
    protected $table = 'ip_restrictions';
    protected $fillable = ['type', 'value', 'reason'];
    protected $casts = [
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];
}
```

> **Key note:** No `BelongsToTenant` scope — this is intentionally a central/platform-level table without any tenant context.

---

## 3. Domain Layer

### 3.1 Value Object: `RestrictionType`

**File:** `app/Domain/SuperAdminDashboard/Security/ValueObjects/RestrictionType.php`
**Namespace:** `App\Domain\SuperAdminDashboard\Security\ValueObjects`

An immutable value object that enforces type safety for restriction categories. Construction fails immediately with `InvalidArgumentException` for any unrecognized value.

| Constant | String value | Meaning |
|---|---|---|
| `FULL_IP` | `full_ip` | Exact IPv4 or IPv6 address match |
| `IP_RANGE` | `ip_range` | Wildcard (`192.168.1.*`) or CIDR (`10.0.0.0/24`) range |
| `COUNTRY` | `country` | ISO 3166-1 alpha-2 two-letter country code |

**Key methods:**

| Method | Returns | Notes |
|---|---|---|
| `new RestrictionType($value)` | `self` | Throws `InvalidArgumentException` if value not in allowed list |
| `RestrictionType::fullIp()` | `self` | Named constructor for `full_ip` |
| `RestrictionType::ipRange()` | `self` | Named constructor for `ip_range` |
| `RestrictionType::country()` | `self` | Named constructor for `country` |
| `getValue()` | `string` | Returns the raw string value |
| `equals(self $other)` | `bool` | Value equality check |

**Validation rule:** Type strings are case-sensitive. `FULL_IP` is rejected; only lowercase `full_ip` is valid.

---

### 3.2 Domain Entity: `IpRestrictionEntity`

**File:** `app/Domain/SuperAdminDashboard/Security/Entities/IpRestrictionEntity.php`
**Namespace:** `App\Domain\SuperAdminDashboard\Security\Entities`
**Extends:** `App\Domain\Shared\Aggregate\AggregateRoot`

`IpRestrictionEntity` is the core aggregate root for the security domain. It enforces all business invariants at the point of creation and records domain events for every lifecycle transition.

#### 3.2.1 Constructor (private)

The constructor is private. All instances must be created through the factory methods below.

```php
private function __construct(
    private readonly ?int $id,
    private readonly RestrictionType $type,
    private readonly string $value,
    private readonly string $reason,
    private readonly ?\DateTimeImmutable $createdAt,
)
```

#### 3.2.2 Factory Methods

**`IpRestrictionEntity::create(...)`**

Called when creating a brand-new restriction. Performs full validation and records the `IpRestrictionCreated` domain event.

| Validation Step | Enforced By | Exception |
|---|---|---|
| Reason must not be blank or whitespace-only | Entity guard | `InvalidArgumentException` |
| `full_ip` value must pass `FILTER_VALIDATE_IP` | `validateValueForType()` | `InvalidIpRestrictionValueException` |
| `ip_range` value must not be blank | `validateValueForType()` | `InvalidIpRestrictionValueException` |
| `country` value must be exactly 2 characters | `validateValueForType()` | `InvalidIpRestrictionValueException` |

After validation, `IpRestrictionCreated` is recorded into the aggregate's internal event queue. Events are released after persistence via `releaseEvents()`.

**`IpRestrictionEntity::reconstitute(...)`**

Called by the repository when rehydrating an entity from a database record. Does **not** fire any events — it is a pure state reconstruction without side effects.

#### 3.2.3 `markForDeletion(actorId)`

Transitions the entity toward deletion. Records `IpRestrictionDeleted` event only if the entity has a non-null `id` (i.e., it has been persisted). Unsaved entities produce no deletion event.

#### 3.2.4 Public Accessors

| Method | Returns |
|---|---|
| `getId()` | `?int` — `null` before first persistence |
| `getType()` | `RestrictionType` |
| `getValue()` | `string` |
| `getReason()` | `string` |
| `getCreatedAt()` | `?\DateTimeImmutable` |

---

### 3.3 Domain Events

**Files:** `app/Domain/SuperAdminDashboard/Security/Events/`

Both events are simple readonly data transfer objects dispatched **after** the database transaction commits.

#### `IpRestrictionCreated`

| Property | Type | Notes |
|---|---|---|
| `$restrictionId` | `int` | Always `0` at creation time; updated after persistence |
| `$type` | `string` | The restriction type string |
| `$value` | `string` | The blocked value |
| `$actorId` | `?int` | ID of the admin who created the restriction |
| `$createdAt` | `\DateTimeImmutable` | Defaults to `new \DateTimeImmutable()` |

#### `IpRestrictionDeleted`

| Property | Type | Notes |
|---|---|---|
| `$restrictionId` | `int` | The ID of the deleted restriction |
| `$type` | `string` | The restriction type string |
| `$value` | `string` | The value that was blocked |
| `$actorId` | `?int` | ID of the admin who deleted the restriction |
| `$deletedAt` | `\DateTimeImmutable` | Defaults to `new \DateTimeImmutable()` |

---

### 3.4 Domain Exceptions

**Files:** `app/Domain/SuperAdminDashboard/Security/Exceptions/`

| Exception | Extends | Factory Method | Message Pattern |
|---|---|---|---|
| `InvalidIpRestrictionValueException` | `\DomainException` | `::forValue(string $type, string $value)` | `"Invalid value format for restriction type {$type}: {$value}"` |
| `IpRestrictionNotFoundException` | `\DomainException` | `::withId(int $id)` | `"IP Restriction not found: {$id}"` |

---

### 3.5 Repository Interfaces

**Files:** `app/Domain/SuperAdminDashboard/Security/Repositories/`

#### `IpRestrictionRepositoryInterface`

The write-side and middleware-side repository contract.

| Method | Returns | Purpose |
|---|---|---|
| `findById(int $id)` | `?IpRestrictionEntity` | Used by delete use case to load entity |
| `exists(string $type, string $value)` | `bool` | Idempotency check before creation |
| `save(IpRestrictionEntity $entity)` | `IpRestrictionEntity` | Upsert (create or update); **invalidates cache** |
| `delete(int $id)` | `void` | Hard delete by ID; **invalidates cache** |
| `getAllCached()` | `array<int, array{type: string, value: string}>` | Cache-first bulk retrieval for middleware |

#### `IpRestrictionQueryInterface`

The read-side query contract, separated from write operations (CQRS).

| Method | Returns | Purpose |
|---|---|---|
| `getPaginated(int $page, int $perPage)` | Paginated array | Used by `ListIpRestrictionsQuery` for the admin UI |

**Return shape for `getPaginated`:**
```php
[
    'data' => [
        ['id' => int, 'type' => string, 'value' => string, 'reason' => string, 'created_at' => int (Unix timestamp)]
    ],
    'total' => int,
    'per_page' => int,
    'current_page' => int,
    'last_page' => int,
]
```

---

## 4. Application Layer

### 4.1 Commands

**Files:** `app/Application/SuperAdminDashboard/Security/Commands/`

Commands are immutable data transfer objects that carry the intent from the HTTP layer to the use case.

#### `CreateIpRestrictionCommand`

| Property | Type | Required | Notes |
|---|---|---|---|
| `$type` | `string` | Yes | One of `full_ip`, `ip_range`, `country` |
| `$value` | `string` | Yes | The IP/range/country code |
| `$reason` | `string` | Yes | Justification |
| `$actorId` | `?int` | No | Authenticated admin ID; `null` skips audit log |

#### `DeleteIpRestrictionCommand`

| Property | Type | Required | Notes |
|---|---|---|---|
| `$id` | `int` | Yes | The restriction to delete |
| `$actorId` | `?int` | No | Authenticated admin ID |

---

### 4.2 Use Cases

**Files:** `app/Application/SuperAdminDashboard/Security/UseCases/`

Both use cases inject `IpRestrictionRepositoryInterface` and `AdminAuditLoggerInterface` via constructor.

#### `CreateIpRestrictionUseCase::execute(CreateIpRestrictionCommand)`

**Full execution flow:**

```
1. Idempotency check:
   repository->exists(type, value)
   → If true: throw ValidationException("already exists") → 422

2. Construct RestrictionType value object from command.type

3. Domain creation:
   IpRestrictionEntity::create(type, value, reason, actorId)
   → Domain validates reason (not blank)
   → Domain validates value format for the given type
   → Records IpRestrictionCreated domain event

4. Database transaction:
   a. repository->save(entity)       → INSERT + Cache::forget()
   b. auditLogger->log(adminId, 'platform.security.ip_restriction.created', ...)
   c. entity->releaseEvents()        → Returns events array from transaction

5. Post-commit domain event dispatch:
   event($ipRestrictionCreated)

6. Returns: saved IpRestrictionEntity (with ID populated)
```

**Audit log action name:** `platform.security.ip_restriction.created`
**Audit log entity type:** `ip_restriction`
**Audit log metadata:** `['type' => $command->type, 'value' => $command->value]`

#### `DeleteIpRestrictionUseCase::execute(DeleteIpRestrictionCommand)`

**Full execution flow:**

```
1. Load entity:
   repository->findById(id)
   → If null: throw IpRestrictionNotFoundException → 404

2. markForDeletion(actorId):
   → Records IpRestrictionDeleted domain event (if ID is not null)

3. Database transaction:
   a. repository->delete(id)         → DELETE + Cache::forget()
   b. auditLogger->log(adminId, 'platform.security.ip_restriction.deleted', ...)
   c. entity->releaseEvents()        → Returns events array from transaction

4. Post-commit domain event dispatch:
   event($ipRestrictionDeleted)
```

**Audit log action name:** `platform.security.ip_restriction.deleted`
**Audit log entity type:** `ip_restriction`
**Audit log entity ID:** the restriction ID
**Audit log metadata:** `['type' => $restriction->getType()->getValue(), 'value' => $restriction->getValue()]`

---

### 4.3 Query

**File:** `app/Application/SuperAdminDashboard/Security/Queries/ListIpRestrictionsQuery.php`

A thin query object wrapping `IpRestrictionQueryInterface::getPaginated()`. Accepts `$page` and `$perPage` and returns the paginated response shape directly.

---

## 5. Infrastructure Layer

### 5.1 `EloquentIpRestrictionRepository`

**File:** `app/Infrastructure/Persistence/SuperAdminDashboard/Security/EloquentIpRestrictionRepository.php`
**Implements:** `IpRestrictionRepositoryInterface`, `IpRestrictionQueryInterface`

This single class satisfies both interfaces — the repository contract for writes and the query interface for reads.

#### Cache Architecture

| Cache Key | `platform:ip_restrictions` |
|---|---|
| **Strategy** | `Cache::rememberForever(...)` — stored indefinitely |
| **Population** | Lazily on first `getAllCached()` call after a miss |
| **Shape** | `array<int, ['id' => int, 'type' => string, 'value' => string]>` |
| **Invalidation** | `Cache::forget('platform:ip_restrictions')` called in `save()` AND `delete()` |
| **Columns cached** | Only `id`, `type`, `value` — `reason` and `created_at` are NOT in the cache (optimization) |

#### Method Implementation Details

**`findById(int $id)`**
- Calls `IpRestrictionRecord::find($id)`.
- Returns `null` if not found, or a reconstituted `IpRestrictionEntity`.

**`exists(string $type, string $value)`**
- Direct database query: `IpRestrictionRecord::where('type', $type)->where('value', $value)->exists()`.
- Intentionally bypasses cache to guarantee real-time accuracy for idempotency checks.

**`save(IpRestrictionEntity $entity)`**
- If `entity->getId() === null`: `IpRestrictionRecord::create([...])` (INSERT).
- If `entity->getId() !== null`: `IpRestrictionRecord::findOrFail()->update([...])` (UPDATE).
- Always calls `Cache::forget(CACHE_KEY)` after the DB operation.

**`delete(int $id)`**
- `IpRestrictionRecord::destroy($id)`.
- Always calls `Cache::forget(CACHE_KEY)` after the DB operation.

**`getAllCached()`**
- Uses `Cache::rememberForever` with the key `platform:ip_restrictions`.
- If cache miss: selects only `['id', 'type', 'value']` from the DB.
- Used exclusively by the `CheckIpRestriction` middleware on every request.

**`getPaginated(int $page, int $perPage)`**
- `IpRestrictionRecord::orderBy('id', 'desc')->paginate($perPage, ['*'], 'page', $page)`.
- Maps each record to `['id', 'type', 'value', 'reason', 'created_at' (Unix timestamp)]`.

**Private `toEntity(IpRestrictionRecord $record)`**
- Calls `IpRestrictionEntity::reconstitute(...)` from a database record.
- Converts `$record->created_at` (Carbon/mutable datetime) to `\DateTimeImmutable`.

---

## 6. HTTP Layer

### 6.1 API Routes

**File:** `routes/api.php`

All routes are under the `prefix('platform')` group, which requires `auth:admin_api` and `admin.session` middleware.

| Method | URI | Controller | Min Authority | Notes |
|---|---|---|---|---|
| `GET` | `/api/platform/security/ip-restrictions` | `IpRestrictionReadController@index` | `60` (L4 Super Admin) | Read-only access |
| `POST` | `/api/platform/security/ip-restrictions` | `IpRestrictionWriteController@store` | `90` (L1 Platform Owner) | Create restriction |
| `DELETE` | `/api/platform/security/ip-restrictions/{id}` | `IpRestrictionWriteController@destroy` | `90` (L1 Platform Owner) | Delete restriction |

**Route authority gate summary:**

The authority middleware layer (`admin.authority:{level}`) enforces role-based access:
- `authority:60` group: List (read) — accessible to Platform Admin (L4) and above.
- `authority:90` group: Create + Delete — restricted exclusively to Platform Owner (L1).

---

### 6.2 Form Request: `StoreIpRestrictionRequest`

**File:** `app/Http/Requests/Platform/Security/StoreIpRestrictionRequest.php`

| Field | Rule | Error on |
|---|---|---|
| `type` | `required, string, in:full_ip,ip_range,country` | Missing, not a string, or unknown type value |
| `value` | `required, string, max:255` | Missing or exceeds 255 characters |
| `reason` | `required, string, max:1000` | Missing or exceeds 1000 characters |

> **Note:** `authorize()` returns `true` unconditionally — authorization is delegated to the global `admin.authority` middleware on the route group.

---

### 6.3 Controllers

#### `IpRestrictionReadController`

**File:** `app/Http/Controllers/Api/Platform/Security/IpRestrictionReadController.php`

**`index(Request $request, ListIpRestrictionsQuery $query): JsonResponse`**

- Reads `page` (default `1`) and `per_page` (default `15`) from query string.
- Delegates to `ListIpRestrictionsQuery::execute()`.
- Returns `200 OK` with paginated response body.

#### `IpRestrictionWriteController`

**File:** `app/Http/Controllers/Api/Platform/Security/IpRestrictionWriteController.php`

**`store(StoreIpRestrictionRequest $request, CreateIpRestrictionUseCase $useCase): JsonResponse`**

- Builds `CreateIpRestrictionCommand` from validated request fields.
- `actorId` derived from `$request->user()->id`.
- Returns `201 Created` with the created restriction's `id`, `type`, `value`, `reason`.

**`destroy(int $id, DeleteIpRestrictionUseCase $useCase): JsonResponse`**

- Builds `DeleteIpRestrictionCommand` from route parameter `$id`.
- `actorId` derived from `request()->user()->id`.
- Returns `200 OK` with `{'message': 'IP restriction removed successfully'}`.

---

## 7. Middleware Layer

### 7.1 `CheckIpRestriction` — Network-Level Enforcement

**File:** `app/Http/Middleware/CheckIpRestriction.php`
**Namespace:** `App\Http\Middleware`

This middleware is the active enforcement point for the entire IP restriction system. It runs on **every platform request**.

#### `handle(Request $request, Closure $next): Response`

**Execution logic:**

```
1. If request path is 'api/health':
   → Skip all checks → return $next($request)
   (Health checks must never be blocked)

2. Resolve client IP:
   $ip = $request->ip()
   If $ip === null: skip checks (can't block unknown IP) → return $next($request)

3. repository->getAllCached()
   → Fetches array of {id, type, value} from cache (no DB hit if warm)

4. For each restriction:
   isBlocked($ip, $restriction['type'], $restriction['value'])
   → If any restriction matches: throw HttpException(403, 'Your IP address is blocked.')

5. If no match: return $next($request)
```

#### `isBlocked(string $ip, string $type, string $value): bool`

| Type | Logic |
|---|---|
| `full_ip` | Exact string equality: `$ip === $value` |
| `ip_range` | Delegates to `checkIpRange()` |
| `country` | Always returns `false` (GeoIP integration placeholder — not yet active) |
| Other | Always returns `false` (safe default) |

#### `checkIpRange(string $ip, string $range): bool`

| Range Format | Detection | Implementation |
|---|---|---|
| Wildcard (contains `*`) | `str_contains($range, '*')` | Converts to regex: replaces `.` → `\.` and `*` → `.*`, wraps with anchors (`/^...$/' `), uses `preg_match()` |
| CIDR (contains `/`) | `str_contains($range, '/')` | Uses `Symfony\Component\HttpFoundation\IpUtils::checkIp($ip, $range)` |
| Neither | — | Returns `false` |

**Wildcard conversion example:**
- Input range: `192.168.1.*`
- Regex: `/^192\.168\.1\..*$/`
- Correctly matches: `192.168.1.0` through `192.168.1.255`

**CIDR example:**
- Input range: `172.16.0.0/12`
- Delegates to Symfony's `IpUtils` for RFC-compliant CIDR matching.

---

### 7.2 `SecurityHeaders` — HTTP Security Response Headers

**File:** `app/Http/Middleware/SecurityHeaders.php`
**Namespace:** `App\Http\Middleware`

A post-response middleware that appends defensive HTTP headers to every API response. Required for Laravel Cloud deployments where Nginx-level header configuration is not available.

| Header | Value Set | Attack Mitigation |
|---|---|---|
| `X-Frame-Options` | `SAMEORIGIN` | Clickjacking — prevents embedding in cross-origin `<iframe>` |
| `X-Content-Type-Options` | `nosniff` | MIME sniffing — prevents browsers from type-guessing responses |
| `X-XSS-Protection` | `1; mode=block` | Legacy browser XSS filter (IE/older Chrome) |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Referer leakage — limits URL in `Referer` header on cross-origin navigation |

> **Design note:** These headers are applied globally to all responses via `$response->headers->set(...)` in the middleware chain. No route-level override is needed.

---

## 8. Complete Request Flow Diagrams

### 8.1 Create IP Restriction (`POST /api/platform/security/ip-restrictions`)

```
Client (L1 Admin)
     │
     ▼
[auth:admin_api] → Validates JWT → Sets authenticated admin
     │
     ▼
[admin.session] → Validates concurrent session
     │
     ▼
[admin.authority:90] → Confirms authority ≥ 90 → 403 if not
     │
     ▼
StoreIpRestrictionRequest::rules() → 422 if validation fails
     │
     ▼
IpRestrictionWriteController::store()
     │
     ├── builds CreateIpRestrictionCommand
     ▼
CreateIpRestrictionUseCase::execute()
     │
     ├── repository->exists() → 422 if duplicate
     ├── new RestrictionType($type) → 500 if invalid type slips through
     ├── IpRestrictionEntity::create() → domain validation → events recorded
     │
     └── DB::transaction():
           ├── repository->save() → INSERT + Cache::forget()
           └── auditLogger->log('...created') → admin_audit_logs INSERT
     │
     ├── event(IpRestrictionCreated) dispatched post-commit
     ▼
201 Created { "data": { id, type, value, reason } }
```

### 8.2 Incoming Request — Middleware Gate (Any Endpoint)

```
Incoming HTTP Request
     │
     ▼
CheckIpRestriction::handle()
     │
     ├── path === 'api/health'? → PASS THROUGH
     ├── ip === null?           → PASS THROUGH (edge case)
     │
     ├── repository->getAllCached()
     │     └── Cache hit?    → use cached array (no DB query)
     │     └── Cache miss?   → DB query + store in cache forever
     │
     ├── for each restriction:
     │     └── isBlocked($ip, $type, $value)?
     │           full_ip:   exact match?
     │           ip_range:  wildcard regex or Symfony CIDR?
     │           country:   always false (GeoIP pending)
     │
     ├── If blocked: throw HttpException(403, 'Your IP address is blocked.')
     │
     └── PASS THROUGH → next middleware
```

---

## 9. RBAC & Authority Model

| Role | Authority Level | Can List | Can Create | Can Delete |
|---|---|---|---|---|
| Platform Owner (L1) | 90 | ✅ | ✅ | ✅ |
| Super Admin (L2) | 80 | ✅ | ❌ | ❌ |
| Platform Manager (L3) | 70 | ✅ | ❌ | ❌ |
| Platform Admin (L4) | 60 | ✅ | ❌ | ❌ |
| Below L4 | < 60 | ❌ | ❌ | ❌ |

**Design decision:** Write operations (Create + Delete) are explicitly restricted to authority level 90 (Platform Owner / L1) only. The rationale is that adding or removing network-level blocks is a high-impact security action that must not be delegated even to senior platform staff.

---

## 10. Business Rules — Complete Reference

| ID | Rule | Layer | Enforcement Point |
|---|---|---|---|
| BR-SEC-01 | All platform requests except `/api/health` are subject to IP restriction checks | Middleware | `CheckIpRestriction::handle()` |
| BR-SEC-02 | Blocked IP requests receive `403 Forbidden` | Middleware | `throw new HttpException(403, ...)` |
| BR-SEC-03 | Reason is mandatory; blank or whitespace-only reason is rejected | Domain Entity | `IpRestrictionEntity::create()` → `InvalidArgumentException` |
| BR-SEC-04 | Duplicate restrictions (same type + value) are forbidden | Application Use Case | `CreateIpRestrictionUseCase` → `ValidationException` (422) |
| BR-SEC-05 | `full_ip` value must be a valid IP address (v4 or v6) | Domain Entity | `validateValueForType()` → `InvalidIpRestrictionValueException` |
| BR-SEC-06 | `ip_range` value must not be empty | Domain Entity | `validateValueForType()` → `InvalidIpRestrictionValueException` |
| BR-SEC-07 | `country` value must be exactly 2 characters (ISO code) | Domain Entity | `validateValueForType()` → `InvalidIpRestrictionValueException` |
| BR-SEC-08 | Country-based enforcement is inactive (GeoIP not yet integrated) | Middleware | `checkIpRange()` → always `false` for `country` type |
| BR-SEC-09 | IP range blocking supports two formats: wildcard (`*`) and CIDR (`/`) | Middleware | `checkIpRange()` routing logic |
| BR-SEC-10 | Write operations (create/delete) require admin authority level ≥ 90 | HTTP Route | `admin.authority:90` middleware |
| BR-SEC-11 | Read operations (list) require admin authority level ≥ 60 | HTTP Route | `admin.authority:60` middleware |
| BR-SEC-12 | Every create and delete action is written to `admin_audit_logs` | Application Use Case | `AdminAuditLoggerInterface::log()` |
| BR-SEC-13 | Cache is invalidated immediately after any write operation | Infrastructure | `Cache::forget('platform:ip_restrictions')` in `save()` and `delete()` |
| BR-SEC-14 | On deletion of non-existent restriction, 404 is returned | Domain Exception | `IpRestrictionNotFoundException` → HTTP 404 |

---

## 11. Test Coverage

### 11.1 Unit Tests — Domain Layer

**File:** `tests/Unit/Domain/Security/RestrictionTypeTest.php`

| Test | Scenario |
|---|---|
| it_accepts_full_ip_type | `new RestrictionType('full_ip')` succeeds |
| it_accepts_ip_range_type | `new RestrictionType('ip_range')` succeeds |
| it_accepts_country_type | `new RestrictionType('country')` succeeds |
| factory_method_full_ip_returns_correct_type | `RestrictionType::fullIp()->getValue()` → `'full_ip'` |
| factory_method_ip_range_returns_correct_type | `RestrictionType::ipRange()->getValue()` → `'ip_range'` |
| factory_method_country_returns_correct_type | `RestrictionType::country()->getValue()` → `'country'` |
| equals_returns_true_for_same_type | Two `full_ip` instances are equal |
| equals_returns_false_for_different_types | `full_ip` ≠ `country` |
| it_rejects_invalid_type | `'invalid_type'` throws `InvalidArgumentException` |
| it_rejects_empty_string | `''` throws `InvalidArgumentException` |
| it_rejects_uppercase_type | `'FULL_IP'` throws `InvalidArgumentException` |
| it_accepts_all_valid_types (DataProvider) | Parameterized test across all 3 valid types |

---

**File:** `tests/Unit/Domain/Security/IpRestrictionEntityTest.php`

| Test | Scenario |
|---|---|
| it_creates_a_full_ip_restriction | Valid `full_ip` entity; ID is null before persist |
| it_creates_an_ip_range_restriction | Valid `ip_range` entity with wildcard value |
| it_creates_a_country_restriction_with_iso_code | Valid 2-char country code |
| it_records_ip_restriction_created_event_on_creation | `releaseEvents()` returns 1 event of type `IpRestrictionCreated` |
| releaseEvents_clears_event_queue | Second `releaseEvents()` returns empty array |
| it_records_ip_restriction_deleted_event_on_mark_for_deletion | Reconstituted entity fires `IpRestrictionDeleted` with correct payload |
| mark_for_deletion_on_unsaved_entity_does_not_record_event | Entity with null ID → no deletion event recorded |
| it_reconstitutes_entity_without_recording_events | `reconstitute()` fires zero events |
| it_rejects_invalid_ipv4_for_full_ip_type | `'not-an-ip'` → `InvalidIpRestrictionValueException` |
| it_rejects_empty_value_for_ip_range_type | Whitespace-only value → `InvalidIpRestrictionValueException` |
| it_rejects_country_code_not_two_characters | `'CHINA'` → `InvalidIpRestrictionValueException` |
| it_rejects_empty_reason | Empty string reason → `InvalidArgumentException` |
| it_rejects_whitespace_only_reason | `'   '` reason → `InvalidArgumentException` |

---

### 11.2 Unit Tests — Application Layer

**File:** `tests/Unit/Application/Security/CreateIpRestrictionUseCaseTest.php`

Mocks: `IpRestrictionRepositoryInterface`, `AdminAuditLoggerInterface`.

| Test | Scenario |
|---|---|
| it_creates_a_full_ip_restriction_successfully | `exists()` returns false → `save()` called once → auditLogger called → returns saved entity |
| it_throws_if_restriction_already_exists | `exists()` returns true → `save()` NOT called → `ValidationException` thrown |
| it_logs_audit_entry_on_successful_creation | Verifies audit action is `'platform.security.ip_restriction.created'` and entity type is `'ip_restriction'` |

---

**File:** `tests/Unit/Application/Security/DeleteIpRestrictionUseCaseTest.php`

Mocks: `IpRestrictionRepositoryInterface`, `AdminAuditLoggerInterface`.

| Test | Scenario |
|---|---|
| it_deletes_a_restriction_that_exists | `findById()` returns entity → `delete()` called → auditLogger called |
| it_throws_if_restriction_not_found | `findById()` returns null → `delete()` NOT called → `IpRestrictionNotFoundException` |
| it_logs_audit_entry_referencing_correct_entity | Verifies audit action `'platform.security.ip_restriction.deleted'`, entity ID, and metadata `{type, value}` |

---

### 11.3 Feature Tests — CRUD

**File:** `tests/Feature/SuperAdminDashboard/Security/IpRestrictionCrudTest.php`

Uses `RefreshDatabase`. Two fixture actors: `platformOwner` (authority=90) and `platformAdmin` (authority=60). Fakes `IpRestrictionCreated` and `IpRestrictionDeleted` events selectively.

**LIST tests:**

| Test | Expected |
|---|---|
| platform_owner_can_list_ip_restrictions | `200` with paginated structure `{data, total, per_page, current_page, last_page}` |
| platform_admin_can_list_ip_restrictions | `200` (authority=60 has read access) |
| list_returns_empty_data_when_no_restrictions_exist | `200` with `{data: [], total: 0}` |
| list_requires_authentication | `401` for unauthenticated request |

**CREATE tests:**

| Test | Expected |
|---|---|
| platform_owner_can_create_full_ip_restriction | `201`, DB has record, `IpRestrictionCreated` dispatched |
| platform_owner_can_create_ip_range_restriction | `201`, DB has `ip_range` record |
| platform_owner_can_create_country_restriction | `201`, DB has `country` record |
| platform_admin_cannot_create_restriction | `403` (authority=60 below write gate) |
| create_requires_authentication | `401` |
| create_fails_when_type_is_missing | `422` with `type` validation error |
| create_fails_when_type_is_invalid | `422` with `type` validation error |
| create_fails_when_value_is_missing | `422` with `value` validation error |
| create_fails_when_reason_is_missing | `422` with `reason` validation error |
| create_fails_with_invalid_ip_address | `422` (domain entity rejects `'not-an-ip-address'`) |
| create_fails_with_country_code_longer_than_two_chars | `422` (domain entity rejects `'CHINA'`) |
| create_fails_when_restriction_already_exists | `422` (use case idempotency check), only 1 DB row |

**DELETE tests:**

| Test | Expected |
|---|---|
| platform_owner_can_delete_a_restriction | `200` with `'IP restriction removed successfully'`, DB row removed, `IpRestrictionDeleted` dispatched |
| delete_returns_404_for_non_existent_restriction | `404` with `error.code = 'RESOURCE_NOT_FOUND'` |
| platform_admin_cannot_delete_restriction | `403`, DB row still present |
| delete_requires_authentication | `401` |

---

### 11.4 Feature Tests — Middleware

**File:** `tests/Feature/SuperAdminDashboard/Security/CheckIpRestrictionMiddlewareTest.php`

Uses `RefreshDatabase`. All tests treat the test environment IP (`127.0.0.1`) as the request source.

| Test | Scenario | Expected |
|---|---|---|
| blocked_full_ip_receives_403_on_any_endpoint | Block `127.0.0.1` as `full_ip`, clear cache | `403` on list endpoint |
| non_blocked_ip_is_allowed_through | Block `8.8.8.8` (not the test IP) | `200` for authenticated L1 admin |
| blocked_ip_range_wildcard_rejects_matching_ip | Block `127.*.*.*`, clear cache | `403` on list endpoint |
| adding_a_restriction_invalidates_the_cache | Prime empty cache, create via API | `Cache::get('platform:ip_restrictions')` returns `null` after create |
| deleting_a_restriction_invalidates_the_cache | Prime cache with 1 entry, delete via API | `Cache::get('platform:ip_restrictions')` returns `null` after delete |
| middleware_uses_cache_and_does_not_query_db_on_every_request | Seed cache directly (no DB row), non-matching IP | `200` — proves cache is used, not DB |
| health_route_is_not_blocked_by_middleware | Request `GET /api/health` | `200` unconditionally |

---

## 12. Security Design Analysis

### 12.1 Strengths

1. **Cache-first enforcement**: Every request hits the cache, not the database. This prevents the IP restriction system itself from becoming a denial-of-service vector via DB load. Invalidation is immediate and deterministic.

2. **Domain-layer validation**: All format validation occurs in `IpRestrictionEntity` before any persistence. The database can never contain a malformed restriction rule.

3. **Idempotent creation**: The `exists()` check in the use case prevents duplicate rules, keeping the restriction set clean and auditable.

4. **Post-commit event dispatch**: Events are collected during the transaction and dispatched only after successful commit. This prevents ghost events for failed transactions.

5. **No tenant scope**: Correctly absent. This is a central-platform control that governs the entire platform, not tenant-specific data.

6. **Mandatory reason**: Every restriction requires a documented justification, enforced at the domain level.

### 12.2 Known Gaps

| Gap | Impact | Notes |
|---|---|---|
| Country blocking is inactive | `country` type can be created and stored, but the middleware always returns `false` for it | Requires GeoIP package integration (e.g., `torann/geoip`, `stevebauman/location`) |
| No update endpoint | Restrictions can only be created or deleted, never edited | Intentional — reduces attack surface. To change a rule, delete and re-create. |
| `ip_range` validation is minimal | The domain only checks non-emptiness; structurally invalid ranges (e.g., `abc.*`) are persisted but silently fail to match | Could be hardened with regex pre-validation in the entity |
| No CIDR blocking for IPv6 | `FILTER_VALIDATE_IP` supports IPv6 for `full_ip`, but CIDR range support for IPv6 ranges depends on Symfony's `IpUtils` behavior | Should be verified against production requirements |

---

## 13. Operational Reference

### 13.1 Quick API Reference

```powershell
# List all IP restrictions (L4+ admin)
curl.exe -X GET "http://localhost:8000/api/platform/security/ip-restrictions" `
  -H "Authorization: Bearer $TOKEN" `
  -H "Accept: application/json"

# Create a restriction (L1 platform owner only)
curl.exe -X POST "http://localhost:8000/api/platform/security/ip-restrictions" `
  -H "Authorization: Bearer $TOKEN" `
  -H "Content-Type: application/json" `
  -H "Accept: application/json" `
  -d "{\"type\":\"full_ip\",\"value\":\"203.0.113.5\",\"reason\":\"Confirmed malicious actor\"}"

# Create a CIDR range restriction
curl.exe -X POST "http://localhost:8000/api/platform/security/ip-restrictions" `
  -H "Authorization: Bearer $TOKEN" `
  -H "Content-Type: application/json" `
  -H "Accept: application/json" `
  -d "{\"type\":\"ip_range\",\"value\":\"10.0.0.0/24\",\"reason\":\"Internal network test block\"}"

# Delete a restriction (L1 platform owner only)
curl.exe -X DELETE "http://localhost:8000/api/platform/security/ip-restrictions/5" `
  -H "Authorization: Bearer $TOKEN" `
  -H "Accept: application/json"
```

### 13.2 Run Tests

```powershell
# All security tests
docker exec -it ubotz_backend php artisan test --filter=Security

# Unit tests only
docker exec -it ubotz_backend php artisan test tests/Unit/Domain/Security
docker exec -it ubotz_backend php artisan test tests/Unit/Application/Security

# Feature tests only
docker exec -it ubotz_backend php artisan test tests/Feature/SuperAdminDashboard/Security
```

### 13.3 Flush Cache Manually (if needed)

```powershell
# From inside the container
docker exec -it ubotz_backend php artisan tinker --execute="Cache::forget('platform:ip_restrictions');"
```

---

## 14. File Index

| File | Role |
|---|---|
| `database/migrations/central/2026_03_10_161352_create_ip_restrictions_table.php` | DB migration |
| `app/Domain/SuperAdminDashboard/Security/ValueObjects/RestrictionType.php` | Value object |
| `app/Domain/SuperAdminDashboard/Security/Entities/IpRestrictionEntity.php` | Aggregate root |
| `app/Domain/SuperAdminDashboard/Security/Events/IpRestrictionCreated.php` | Domain event |
| `app/Domain/SuperAdminDashboard/Security/Events/IpRestrictionDeleted.php` | Domain event |
| `app/Domain/SuperAdminDashboard/Security/Exceptions/InvalidIpRestrictionValueException.php` | Domain exception |
| `app/Domain/SuperAdminDashboard/Security/Exceptions/IpRestrictionNotFoundException.php` | Domain exception |
| `app/Domain/SuperAdminDashboard/Security/Repositories/IpRestrictionRepositoryInterface.php` | Repository contract |
| `app/Domain/SuperAdminDashboard/Security/Repositories/IpRestrictionQueryInterface.php` | Query contract |
| `app/Application/SuperAdminDashboard/Security/Commands/CreateIpRestrictionCommand.php` | Command DTO |
| `app/Application/SuperAdminDashboard/Security/Commands/DeleteIpRestrictionCommand.php` | Command DTO |
| `app/Application/SuperAdminDashboard/Security/UseCases/CreateIpRestrictionUseCase.php` | Application use case |
| `app/Application/SuperAdminDashboard/Security/UseCases/DeleteIpRestrictionUseCase.php` | Application use case |
| `app/Application/SuperAdminDashboard/Security/Queries/ListIpRestrictionsQuery.php` | Read query |
| `app/Infrastructure/Persistence/SuperAdminDashboard/Security/IpRestrictionRecord.php` | Eloquent model |
| `app/Infrastructure/Persistence/SuperAdminDashboard/Security/EloquentIpRestrictionRepository.php` | Repository + Query impl |
| `app/Http/Requests/Platform/Security/StoreIpRestrictionRequest.php` | Form request |
| `app/Http/Controllers/Api/Platform/Security/IpRestrictionReadController.php` | HTTP read controller |
| `app/Http/Controllers/Api/Platform/Security/IpRestrictionWriteController.php` | HTTP write controller |
| `app/Http/Middleware/CheckIpRestriction.php` | Enforcement middleware |
| `app/Http/Middleware/SecurityHeaders.php` | Response header middleware |
| `tests/Unit/Domain/Security/RestrictionTypeTest.php` | Unit test |
| `tests/Unit/Domain/Security/IpRestrictionEntityTest.php` | Unit test |
| `tests/Unit/Application/Security/CreateIpRestrictionUseCaseTest.php` | Unit test |
| `tests/Unit/Application/Security/DeleteIpRestrictionUseCaseTest.php` | Unit test |
| `tests/Feature/SuperAdminDashboard/Security/IpRestrictionCrudTest.php` | Feature test |
| `tests/Feature/SuperAdminDashboard/Security/CheckIpRestrictionMiddlewareTest.php` | Feature test |

---

*End of Document — UBOTZ 2.0 Platform Security Technical Specification — March 27, 2026*
