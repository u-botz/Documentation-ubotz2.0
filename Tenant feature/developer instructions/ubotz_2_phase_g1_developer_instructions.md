# Phase G1 — GCC Foundation & Stripe Platform Billing

## Developer Instructions

**Document Version:** 1.0
**Date:** 2026-03-27
**Author:** Principal Engineer (Claude)
**Phase Dependency:** Requires Phases 12A–12C complete (Razorpay platform billing live)
**Target:** Antigravity Implementation Team

---

## 1. Executive Summary

### What Gets Built

Phase G1 extends the EducoreOS platform to support GCC market entry (UAE + Saudi Arabia) by:

1. Adding country-awareness to tenants and subscription plans
2. Adding multi-currency support (AED, SAR alongside existing INR)
3. Implementing Stripe as a second payment gateway for platform-level billing (Ubotz → Tenant)
4. Auto-selecting the correct gateway based on tenant country (India = Razorpay, GCC = Stripe)

### What Does NOT Get Built

| Excluded Item | Reason | Deferred To |
|---|---|---|
| Tenant → Student Stripe billing | Separate bounded context | Phase G2 |
| Tap Payments | UAE + Saudi covered by Stripe | Future (if Oman/Kuwait/Bahrain/Qatar needed) |
| WhatsApp Business API | Separate infrastructure | Phase G3 |
| Timezone-aware scheduling | Deferred from G1 scope | Phase G4 |
| Multi-curriculum batch tagging | Not needed for GCC Phase 1 | Future |
| Arabic RTL UI | Not needed for Indian-expat ICP | Future |
| Exchange rate tracking | Single currency per tenant — no cross-currency | Future |
| OMR (Omani Rial) support | UAE + Saudi only in scope | Future |
| Tenant → Student fee collection via Stripe | G1 is platform billing only | Phase G2 |

### Currency Convention

The `_cents` column naming convention is retained. OMR (3 decimal places) is out of scope. For AED and SAR, the subunit is 100 (fils and halalas respectively), which maps 1:1 to the `_cents` convention — same as INR paise.

---

## 2. Architecture — What Already Exists

### 2.1 Payment Gateway Infrastructure (Phases 12A–12C)

| Component | Location | Status |
|---|---|---|
| `PaymentGatewayInterface` | `Domain/SuperAdminDashboard/Subscription/Contracts/` | EXISTS |
| `RazorpaySubscriptionGateway` | `Infrastructure/PaymentGateway/` | EXISTS |
| `FakePaymentGateway` | `tests/Fakes/` | EXISTS |
| `ProcessWebhookUseCase` | `Application/SuperAdminDashboard/Subscription/UseCases/` | EXISTS |
| `WebhookAction` (controller) | `WebApi/SuperAdminDashboard/Subscription/Controllers/` | EXISTS |
| `PaymentEventRecord` | `Infrastructure/Database/Models/` | EXISTS |
| `payment_events` table | Central database | EXISTS |
| `SubscriptionServiceProvider` | `app/Providers/` | EXISTS — binds `PaymentGatewayInterface` → `RazorpaySubscriptionGateway` |
| `config/services.php` | Razorpay keys | EXISTS |

### 2.2 Subscription Infrastructure (Phases 11A–11C)

| Component | Status |
|---|---|
| `subscription_plans` table | EXISTS — has `code`, `tier`, `price_monthly_cents`, `price_annual_cents`, `price_one_time_cents`, `currency`, `features`, `modules`, `status`, `is_trial`, `trial_duration_days`, `gateway_plan_id`, approval fields |
| `tenant_subscriptions` table | EXISTS — has `locked_price_monthly_cents`, `locked_price_annual_cents`, `razorpay_order_id`, `gateway_subscription_id`, `gateway_plan_id`, idempotency key |
| `SubscriptionStatus` value object | EXISTS — `trial`, `active`, `pending_payment`, `cancelled`, `expired` |
| `AssignSubscriptionToTenantUseCase` | EXISTS — branches on trial vs paid |
| `ProcessWebhookUseCase` | EXISTS — Razorpay signature verification + event routing |
| Pessimistic locking on all transitions | EXISTS |

### 2.3 Tenants Table (Current Schema)

| Column | Type | Notes |
|---|---|---|
| `id` | BIGINT PK | |
| `slug` | VARCHAR(100) UNIQUE | URL-safe identifier |
| `name` | VARCHAR(255) | |
| `domain` | VARCHAR(255) NULLABLE UNIQUE | Custom domain |
| `status` | VARCHAR(30) | pending, active, suspended, archived |
| `deployment_tier` | VARCHAR(20) | shared, dedicated, lifetime |
| `institution_type_id` | FK NULLABLE | |
| `provisioned_by` | BIGINT NULLABLE | |
| `settings` | JSON NULLABLE | Flexible config blob |
| `contact_email` | VARCHAR(255) NULLABLE | |
| `contact_phone` | VARCHAR(20) NULLABLE | |
| `idempotency_key` | VARCHAR(100) UNIQUE NULLABLE | |
| Timestamps | | `provisioned_at`, `suspended_at`, `archived_at`, `created_at`, `updated_at`, `deleted_at` |

**Does NOT have:** `country_code`, `default_currency`, `payment_gateway`

### 2.4 Users Table (Tenant-Scoped)

The `users` table already has a `timezone` column (added in `2026_03_10_163436_add_extended_profile_to_users_table.php`). No changes needed.

---

## 3. What Must Be Built or Modified

| # | Component | Action | Severity |
|---|---|---|---|
| 1 | `tenants` table migration | Add `country_code`, `default_currency`, `payment_gateway` columns | **CRITICAL** |
| 2 | `subscription_plans` table migration | Add `country_code` column | **CRITICAL** |
| 3 | `tenant_subscriptions` table migration | Add `stripe_payment_intent_id`, `gateway_provider` columns | **CRITICAL** |
| 4 | `Currency` value object | NEW — currency code validation + subunit registry | **HIGH** |
| 5 | `CountryCode` value object | NEW — ISO 3166-1 alpha-2 validation | **HIGH** |
| 6 | `GatewayProvider` value object | NEW — enum: `razorpay`, `stripe` | **HIGH** |
| 7 | `PaymentGatewayInterface` | MODIFY — make `createOrder` currency-aware | **CRITICAL** |
| 8 | `StripePaymentGateway` | NEW — implements `PaymentGatewayInterface` for Stripe | **CRITICAL** |
| 9 | `PaymentGatewayFactory` | NEW — resolves correct gateway implementation based on tenant country | **CRITICAL** |
| 10 | `SubscriptionServiceProvider` | MODIFY — register factory instead of direct binding | **HIGH** |
| 11 | `ProcessWebhookUseCase` | MODIFY — handle Stripe webhook events alongside Razorpay | **CRITICAL** |
| 12 | Stripe webhook endpoint | NEW — `POST /api/webhooks/stripe` with Stripe signature verification | **HIGH** |
| 13 | `RazorpaySubscriptionGateway` | MODIFY — conform to updated interface signature | **HIGH** |
| 14 | `FakePaymentGateway` | MODIFY — support both gateway behaviors | **HIGH** |
| 15 | `AssignSubscriptionToTenantUseCase` | MODIFY — use factory to resolve gateway; pass currency | **HIGH** |
| 16 | `TenantEntity` | MODIFY — add country, currency, gateway properties | **MEDIUM** |
| 17 | `SubscriptionPlanEntity` | MODIFY — add country_code property | **MEDIUM** |
| 18 | `TenantSubscriptionEntity` | MODIFY — add gateway_provider, stripe fields | **MEDIUM** |
| 19 | Tenant provisioning flow | MODIFY — accept country_code; derive currency + gateway | **HIGH** |
| 20 | Plan assignment validation | MODIFY — reject plan if plan.country_code ≠ tenant.country_code | **HIGH** |
| 21 | `config/services.php` | MODIFY — add Stripe configuration keys | **MEDIUM** |
| 22 | Tests | NEW + MODIFIED — full coverage for Stripe flow | **HIGH** |

---

## 4. Country → Currency → Gateway Mapping

This is the single source of truth for region-based resolution. It lives in the Domain layer as a deterministic mapping.

| Country Code | Country | Currency | Gateway Provider | Gateway Available |
|---|---|---|---|---|
| `IN` | India | `INR` | `razorpay` | Yes (live) |
| `AE` | UAE | `AED` | `stripe` | Yes (G1) |
| `SA` | Saudi Arabia | `SAR` | `stripe` | Yes (G1) |

### Resolution Rules

1. Super Admin sets `country_code` on tenant during provisioning
2. `default_currency` is derived from `country_code` (not independently set)
3. `payment_gateway` is derived from `country_code` (not independently set)
4. Once set, `country_code` is **immutable** on the tenant record (changing country would break financial history)
5. The derivation logic lives in a `TenantRegionResolver` domain service — NOT in the controller, NOT in the migration default

### Why Not Store Currency/Gateway as Derived?

We store all three (`country_code`, `default_currency`, `payment_gateway`) as physical columns despite them being derivable because:

- Queries filter by these columns independently (plan filtering by currency, gateway resolution)
- Avoiding repeated resolution on every request
- Explicit > implicit — a developer reading the tenants table sees the full picture
- The derivation happens exactly once (at provisioning time) and is immutable thereafter

---

## 5. Schema Changes

### 5.1 Migration: Add Country/Currency/Gateway to Tenants

**File:** `database/migrations/central/2026_03_27_000001_add_country_currency_gateway_to_tenants.php`

```php
<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('tenants', function (Blueprint $table) {
            // ISO 3166-1 alpha-2 country code (e.g., 'IN', 'AE', 'SA')
            // Immutable after provisioning — changing country would break financial history
            $table->string('country_code', 2)
                ->after('deployment_tier')
                ->default('IN')
                ->comment('ISO 3166-1 alpha-2. Immutable after provisioning.');

            // ISO 4217 currency code, derived from country_code at provisioning time
            $table->string('default_currency', 3)
                ->after('country_code')
                ->default('INR')
                ->comment('ISO 4217. Derived from country_code. Immutable.');

            // Payment gateway provider, derived from country_code at provisioning time
            $table->string('payment_gateway', 20)
                ->after('default_currency')
                ->default('razorpay')
                ->comment('Gateway provider slug. Derived from country_code. Immutable.');

            $table->index('country_code', 'idx_tenants_country_code');
            $table->index('default_currency', 'idx_tenants_default_currency');
            $table->index('payment_gateway', 'idx_tenants_payment_gateway');
        });
    }

    public function down(): void
    {
        Schema::table('tenants', function (Blueprint $table) {
            $table->dropIndex('idx_tenants_country_code');
            $table->dropIndex('idx_tenants_default_currency');
            $table->dropIndex('idx_tenants_payment_gateway');
            $table->dropColumn(['country_code', 'default_currency', 'payment_gateway']);
        });
    }
};
```

**Notes:**
- Default `'IN'` / `'INR'` / `'razorpay'` ensures backward compatibility for existing tenants — all current tenants are Indian.
- These columns are **immutable after provisioning**. The `TenantEntity` domain object must enforce this — no setter, no update method. The Eloquent model should NOT have these in `$fillable` after initial creation.

### 5.2 Migration: Add Country Code to Subscription Plans

**File:** `database/migrations/central/2026_03_27_000002_add_country_code_to_subscription_plans.php`

```php
<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('subscription_plans', function (Blueprint $table) {
            // Each plan is scoped to ONE country.
            // 'GCC Professional' for UAE is a separate plan from 'GCC Professional' for Saudi.
            $table->string('country_code', 2)
                ->after('code')
                ->default('IN')
                ->comment('ISO 3166-1 alpha-2. Plan is only assignable to tenants with matching country_code.');

            $table->index('country_code', 'idx_subscription_plans_country_code');

            // Composite index: filter plans by country + status (the primary query pattern)
            $table->index(['country_code', 'status'], 'idx_subscription_plans_country_status');
        });
    }

    public function down(): void
    {
        Schema::table('subscription_plans', function (Blueprint $table) {
            $table->dropIndex('idx_subscription_plans_country_status');
            $table->dropIndex('idx_subscription_plans_country_code');
            $table->dropColumn('country_code');
        });
    }
};
```

**Notes:**
- Default `'IN'` ensures all existing plans are automatically India-scoped.
- The existing `currency` column on `subscription_plans` already stores `'INR'`. For GCC plans, this will be `'AED'` or `'SAR'`. The `currency` column on `subscription_plans` must match the `default_currency` of the tenant's country. This is validated at plan assignment time, not enforced at the schema level.

### 5.3 Migration: Add Gateway Tracking to Tenant Subscriptions

**File:** `database/migrations/central/2026_03_27_000003_add_gateway_fields_to_tenant_subscriptions.php`

```php
<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('tenant_subscriptions', function (Blueprint $table) {
            // Which gateway processed this subscription's payment
            $table->string('gateway_provider', 20)
                ->after('gateway_plan_id')
                ->nullable()
                ->comment('razorpay or stripe. Set when payment is initiated.');

            // Stripe Payment Intent ID (equivalent of razorpay_order_id for Stripe)
            $table->string('stripe_payment_intent_id', 100)
                ->after('razorpay_order_id')
                ->nullable()
                ->comment('Stripe PaymentIntent ID. Immutable after set.');

            // Stripe Checkout Session ID (for hosted checkout flow)
            $table->string('stripe_checkout_session_id', 200)
                ->after('stripe_payment_intent_id')
                ->nullable()
                ->comment('Stripe Checkout Session ID. Used for redirect-based payment.');

            $table->index('stripe_payment_intent_id', 'idx_tenant_subscriptions_stripe_pi');
            $table->index('stripe_checkout_session_id', 'idx_tenant_subscriptions_stripe_cs');
            $table->index('gateway_provider', 'idx_tenant_subscriptions_gateway_provider');
        });
    }

    public function down(): void
    {
        Schema::table('tenant_subscriptions', function (Blueprint $table) {
            $table->dropIndex('idx_tenant_subscriptions_stripe_pi');
            $table->dropIndex('idx_tenant_subscriptions_stripe_cs');
            $table->dropIndex('idx_tenant_subscriptions_gateway_provider');
            $table->dropColumn([
                'gateway_provider',
                'stripe_payment_intent_id',
                'stripe_checkout_session_id',
            ]);
        });
    }
};
```

---

## 6. Domain Layer Changes

### 6.1 New: `Currency` Value Object

**File:** `Domain/Shared/ValueObjects/Currency.php`

```php
<?php

declare(strict_types=1);

namespace Domain\Shared\ValueObjects;

use InvalidArgumentException;

final class Currency
{
    private const SUPPORTED_CURRENCIES = [
        'INR' => ['name' => 'Indian Rupee', 'subunit' => 100, 'symbol' => '₹'],
        'AED' => ['name' => 'UAE Dirham', 'subunit' => 100, 'symbol' => 'د.إ'],
        'SAR' => ['name' => 'Saudi Riyal', 'subunit' => 100, 'symbol' => '﷼'],
    ];

    private function __construct(
        public readonly string $code,
    ) {
    }

    public static function fromCode(string $code): self
    {
        $code = strtoupper(trim($code));

        if (!isset(self::SUPPORTED_CURRENCIES[$code])) {
            throw new InvalidArgumentException(
                "Unsupported currency: {$code}. Supported: " . implode(', ', array_keys(self::SUPPORTED_CURRENCIES))
            );
        }

        return new self($code);
    }

    public static function INR(): self
    {
        return new self('INR');
    }

    public static function AED(): self
    {
        return new self('AED');
    }

    public static function SAR(): self
    {
        return new self('SAR');
    }

    public function subunitFactor(): int
    {
        return self::SUPPORTED_CURRENCIES[$this->code]['subunit'];
    }

    public function symbol(): string
    {
        return self::SUPPORTED_CURRENCIES[$this->code]['symbol'];
    }

    public function name(): string
    {
        return self::SUPPORTED_CURRENCIES[$this->code]['name'];
    }

    public function equals(self $other): bool
    {
        return $this->code === $other->code;
    }

    public function __toString(): string
    {
        return $this->code;
    }
}
```

**Placement rationale:** `Domain/Shared/ValueObjects/` because currency is used across multiple bounded contexts (Subscription, Student Fee Collection, future invoicing). It is NOT specific to the Subscription context.

### 6.2 New: `CountryCode` Value Object

**File:** `Domain/Shared/ValueObjects/CountryCode.php`

```php
<?php

declare(strict_types=1);

namespace Domain\Shared\ValueObjects;

use InvalidArgumentException;

final class CountryCode
{
    /**
     * Supported countries with their default currency and gateway.
     * This is the SINGLE SOURCE OF TRUTH for region → currency → gateway resolution.
     */
    private const SUPPORTED_COUNTRIES = [
        'IN' => ['currency' => 'INR', 'gateway' => 'razorpay', 'name' => 'India'],
        'AE' => ['currency' => 'AED', 'gateway' => 'stripe', 'name' => 'United Arab Emirates'],
        'SA' => ['currency' => 'SAR', 'gateway' => 'stripe', 'name' => 'Saudi Arabia'],
    ];

    private function __construct(
        public readonly string $code,
    ) {
    }

    public static function fromCode(string $code): self
    {
        $code = strtoupper(trim($code));

        if (!isset(self::SUPPORTED_COUNTRIES[$code])) {
            throw new InvalidArgumentException(
                "Unsupported country: {$code}. Supported: " . implode(', ', array_keys(self::SUPPORTED_COUNTRIES))
            );
        }

        return new self($code);
    }

    public function defaultCurrency(): Currency
    {
        return Currency::fromCode(self::SUPPORTED_COUNTRIES[$this->code]['currency']);
    }

    public function defaultGateway(): GatewayProvider
    {
        return GatewayProvider::from(self::SUPPORTED_COUNTRIES[$this->code]['gateway']);
    }

    public function name(): string
    {
        return self::SUPPORTED_COUNTRIES[$this->code]['name'];
    }

    public function equals(self $other): bool
    {
        return $this->code === $other->code;
    }

    public function __toString(): string
    {
        return $this->code;
    }

    /**
     * @return array<string, array{currency: string, gateway: string, name: string}>
     */
    public static function supportedCountries(): array
    {
        return self::SUPPORTED_COUNTRIES;
    }
}
```

### 6.3 New: `GatewayProvider` Value Object

**File:** `Domain/Shared/ValueObjects/GatewayProvider.php`

```php
<?php

declare(strict_types=1);

namespace Domain\Shared\ValueObjects;

enum GatewayProvider: string
{
    case RAZORPAY = 'razorpay';
    case STRIPE = 'stripe';

    public function label(): string
    {
        return match ($this) {
            self::RAZORPAY => 'Razorpay',
            self::STRIPE => 'Stripe',
        };
    }
}
```

### 6.4 Modified: `PaymentGatewayInterface`

**File:** `Domain/SuperAdminDashboard/Subscription/Contracts/PaymentGatewayInterface.php`

The existing interface has a `createOrder` method that takes `int $amountPaise`. This must be made currency-neutral.

**Current signature (Phase 12A):**
```php
public function createOrder(int $amountPaise, string $currency, string $receiptId, array $notes = []): OrderResult;
```

**Note:** The parameter is named `$amountPaise` but the `$currency` parameter already exists in the interface from Phase 12A. Verify the actual parameter name in the codebase. If it is `$amountPaise`, rename it to `$amountSubunits` for clarity. If it is already `$amount`, no rename needed.

**Changes to the interface:**

```php
<?php

declare(strict_types=1);

namespace Domain\SuperAdminDashboard\Subscription\Contracts;

use Domain\SuperAdminDashboard\Subscription\DTOs\OrderResult;
use Domain\Shared\ValueObjects\GatewayProvider;

interface PaymentGatewayInterface
{
    /**
     * Create a payment order/session for the given amount.
     *
     * @param int $amountSubunits Amount in smallest currency unit (paise, fils, halalas)
     * @param string $currency ISO 4217 currency code
     * @param string $receiptId Internal receipt/subscription ID for reconciliation
     * @param array<string, mixed> $notes Metadata to attach to the order
     * @return OrderResult Gateway-specific order/session identifiers
     */
    public function createOrder(
        int $amountSubunits,
        string $currency,
        string $receiptId,
        array $notes = [],
    ): OrderResult;

    /**
     * Verify a webhook signature.
     *
     * @param string $payload Raw request body
     * @param string $signature Signature header value
     * @return bool True if signature is valid
     */
    public function verifyWebhookSignature(string $payload, string $signature): bool;

    /**
     * Identify this gateway implementation.
     */
    public function provider(): GatewayProvider;
}
```

**Breaking changes:**
- `$amountPaise` → `$amountSubunits` (parameter rename for currency-neutrality)
- Added `provider(): GatewayProvider` method
- `verifyWebhookSignature()` — verify this method exists or needs to be extracted from `ProcessWebhookUseCase`

**Action for Antigravity:** Check the current `PaymentGatewayInterface` file. If `verifyWebhookSignature` is not already on the interface (it may be inline in the UseCase), extract it to the interface. The Stripe implementation needs a different verification algorithm.

### 6.5 Modified: `OrderResult` DTO

**File:** `Domain/SuperAdminDashboard/Subscription/DTOs/OrderResult.php`

Extend to carry both Razorpay and Stripe identifiers:

```php
<?php

declare(strict_types=1);

namespace Domain\SuperAdminDashboard\Subscription\DTOs;

use Domain\Shared\ValueObjects\GatewayProvider;

final readonly class OrderResult
{
    public function __construct(
        public GatewayProvider $provider,
        public string $orderId,           // Razorpay order_id OR Stripe PaymentIntent ID
        public int $amount,               // Amount in subunits
        public string $currency,          // ISO 4217
        public string $status,            // Gateway-specific status string
        public ?string $checkoutSessionId = null, // Stripe Checkout Session ID (null for Razorpay)
        public ?string $checkoutUrl = null,       // Stripe Checkout Session URL (null for Razorpay)
        public ?string $clientSecret = null,      // Stripe PaymentIntent client_secret (null for Razorpay)
    ) {
    }
}
```

### 6.6 New: `PlanCountryMismatchException`

**File:** `Domain/SuperAdminDashboard/Subscription/Exceptions/PlanCountryMismatchException.php`

```php
<?php

declare(strict_types=1);

namespace Domain\SuperAdminDashboard\Subscription\Exceptions;

use DomainException;

final class PlanCountryMismatchException extends DomainException
{
    public static function create(string $planCountry, string $tenantCountry): self
    {
        return new self(
            "Plan country ({$planCountry}) does not match tenant country ({$tenantCountry}). "
            . 'Plans can only be assigned to tenants in the same country.'
        );
    }
}
```

### 6.7 Modified: `TenantEntity`

Add the three new properties. They are set at construction time (provisioning) and are immutable.

```php
// New properties (add to existing TenantEntity)
private CountryCode $countryCode;
private Currency $defaultCurrency;
private GatewayProvider $paymentGateway;

// Constructor must accept these
// Getters only — no setters (immutable after provisioning)
public function countryCode(): CountryCode { return $this->countryCode; }
public function defaultCurrency(): Currency { return $this->defaultCurrency; }
public function paymentGateway(): GatewayProvider { return $this->paymentGateway; }
```

### 6.8 Modified: `SubscriptionPlanEntity`

Add `countryCode` property:

```php
private CountryCode $countryCode;

public function countryCode(): CountryCode { return $this->countryCode; }

public function isAssignableTo(TenantEntity $tenant): bool
{
    return $this->countryCode->equals($tenant->countryCode());
}
```

### 6.9 Modified: `TenantSubscriptionEntity`

Add gateway tracking:

```php
private ?GatewayProvider $gatewayProvider;
private ?string $stripePaymentIntentId;
private ?string $stripeCheckoutSessionId;

public function gatewayProvider(): ?GatewayProvider { return $this->gatewayProvider; }
public function stripePaymentIntentId(): ?string { return $this->stripePaymentIntentId; }
public function stripeCheckoutSessionId(): ?string { return $this->stripeCheckoutSessionId; }
```

---

## 7. Application Layer Changes

### 7.1 New: `PaymentGatewayFactory`

**File:** `Application/SuperAdminDashboard/Subscription/Services/PaymentGatewayFactory.php`

This is an Application-layer service because it resolves infrastructure implementations based on domain context. It replaces the static binding in `SubscriptionServiceProvider`.

```php
<?php

declare(strict_types=1);

namespace Application\SuperAdminDashboard\Subscription\Services;

use Domain\SuperAdminDashboard\Subscription\Contracts\PaymentGatewayInterface;
use Domain\Shared\ValueObjects\GatewayProvider;

interface PaymentGatewayFactoryInterface
{
    /**
     * Resolve the correct gateway implementation for the given provider.
     *
     * @throws \InvalidArgumentException If provider is not supported
     */
    public function resolve(GatewayProvider $provider): PaymentGatewayInterface;
}
```

The concrete implementation lives in Infrastructure:

**File:** `Infrastructure/PaymentGateway/PaymentGatewayFactory.php`

```php
<?php

declare(strict_types=1);

namespace Infrastructure\PaymentGateway;

use Application\SuperAdminDashboard\Subscription\Services\PaymentGatewayFactoryInterface;
use Domain\SuperAdminDashboard\Subscription\Contracts\PaymentGatewayInterface;
use Domain\Shared\ValueObjects\GatewayProvider;
use InvalidArgumentException;

final class PaymentGatewayFactory implements PaymentGatewayFactoryInterface
{
    public function __construct(
        private readonly RazorpaySubscriptionGateway $razorpay,
        private readonly StripePaymentGateway $stripe,
    ) {
    }

    public function resolve(GatewayProvider $provider): PaymentGatewayInterface
    {
        return match ($provider) {
            GatewayProvider::RAZORPAY => $this->razorpay,
            GatewayProvider::STRIPE => $this->stripe,
        };
    }
}
```

### 7.2 Modified: `AssignSubscriptionToTenantUseCase`

**Current behavior:** Calls `PaymentGatewayInterface` directly (injected via constructor).

**New behavior:** Uses `PaymentGatewayFactoryInterface` to resolve the correct gateway based on the tenant's `payment_gateway` value.

```php
// BEFORE (Phase 12A)
public function __construct(
    private readonly PaymentGatewayInterface $gateway,
    // ... other dependencies
) {}

// AFTER (Phase G1)
public function __construct(
    private readonly PaymentGatewayFactoryInterface $gatewayFactory,
    // ... other dependencies
) {}

// In the execute method, when creating a paid subscription:
$gateway = $this->gatewayFactory->resolve($tenant->paymentGateway());
$orderResult = $gateway->createOrder(
    amountSubunits: $lockedPrice,
    currency: $tenant->defaultCurrency()->code,
    receiptId: (string) $subscription->id(),
    notes: [
        'tenant_id' => $tenant->id(),
        'plan_code' => $plan->code(),
        'subscription_id' => $subscription->id(),
    ],
);

// Store gateway-specific identifiers
$subscription->setGatewayProvider($gateway->provider());

if ($gateway->provider() === GatewayProvider::STRIPE) {
    $subscription->setStripePaymentIntentId($orderResult->orderId);
    $subscription->setStripeCheckoutSessionId($orderResult->checkoutSessionId);
} else {
    $subscription->setRazorpayOrderId($orderResult->orderId);
}
```

**Critical:** The same factory pattern must be applied to `ChangeTenantPlanUseCase` and `RetryPaymentUseCase` (if they exist from Phase 12A).

### 7.3 Modified: Plan Assignment Validation

Add country validation to `AssignSubscriptionToTenantUseCase`:

```php
// BEFORE creating the subscription, validate country match
if (!$plan->isAssignableTo($tenant)) {
    throw PlanCountryMismatchException::create(
        $plan->countryCode()->code,
        $tenant->countryCode()->code,
    );
}
```

### 7.4 Modified: Webhook Processing

The `ProcessWebhookUseCase` currently handles Razorpay events only. It must now route to the correct handler based on the webhook source.

**Option A (Recommended):** Keep `ProcessWebhookUseCase` for Razorpay. Create a separate `ProcessStripeWebhookUseCase` for Stripe. Each has its own controller endpoint. This avoids a god-UseCase that knows about both gateways.

**Option B:** Single UseCase with a gateway discriminator. Rejected — violates single responsibility.

**New file:** `Application/SuperAdminDashboard/Subscription/UseCases/ProcessStripeWebhookUseCase.php`

```php
<?php

declare(strict_types=1);

namespace Application\SuperAdminDashboard\Subscription\UseCases;

// Handles:
// - checkout.session.completed → activate subscription
// - payment_intent.succeeded → backup activation trigger (like Razorpay's order.paid)
// - payment_intent.payment_failed → log failure

// Uses the same ActivateSubscriptionOnPaymentUseCase as Razorpay
// for the actual activation logic (transition pending_payment → active)
```

### 7.5 Modified: Tenant Provisioning

The `ProvisionTenantUseCase` (or equivalent) must accept `country_code` and derive `default_currency` + `payment_gateway` using `CountryCode` value object.

```php
// In the provisioning flow:
$countryCode = CountryCode::fromCode($command->countryCode); // Validates supported country
$currency = $countryCode->defaultCurrency();                  // Derives currency
$gateway = $countryCode->defaultGateway();                    // Derives gateway

$tenant = TenantEntity::create(
    // ... existing fields ...
    countryCode: $countryCode,
    defaultCurrency: $currency,
    paymentGateway: $gateway,
);
```

---

## 8. Infrastructure Layer Changes

### 8.1 New: `StripePaymentGateway`

**File:** `Infrastructure/PaymentGateway/StripePaymentGateway.php`

```php
<?php

declare(strict_types=1);

namespace Infrastructure\PaymentGateway;

use Domain\SuperAdminDashboard\Subscription\Contracts\PaymentGatewayInterface;
use Domain\SuperAdminDashboard\Subscription\DTOs\OrderResult;
use Domain\SuperAdminDashboard\Subscription\Exceptions\PaymentGatewayException;
use Domain\Shared\ValueObjects\GatewayProvider;
use Stripe\Checkout\Session as StripeCheckoutSession;
use Stripe\Exception\ApiErrorException;
use Stripe\Stripe;
use Stripe\Webhook as StripeWebhook;

final class StripePaymentGateway implements PaymentGatewayInterface
{
    public function __construct()
    {
        Stripe::setApiKey(config('services.stripe.secret_key'));
    }

    public function createOrder(
        int $amountSubunits,
        string $currency,
        string $receiptId,
        array $notes = [],
    ): OrderResult {
        try {
            // Use Stripe Checkout Session for redirect-based payment
            // This is the recommended flow for platform billing
            $session = StripeCheckoutSession::create([
                'payment_method_types' => ['card'],
                'mode' => 'payment',
                'line_items' => [
                    [
                        'price_data' => [
                            'currency' => strtolower($currency),
                            'unit_amount' => $amountSubunits,
                            'product_data' => [
                                'name' => $notes['plan_description'] ?? 'EducoreOS Subscription',
                                'metadata' => $notes,
                            ],
                        ],
                        'quantity' => 1,
                    ],
                ],
                'metadata' => array_merge($notes, [
                    'receipt_id' => $receiptId,
                ]),
                'success_url' => config('services.stripe.success_url') . '?session_id={CHECKOUT_SESSION_ID}',
                'cancel_url' => config('services.stripe.cancel_url'),
            ]);

            return new OrderResult(
                provider: GatewayProvider::STRIPE,
                orderId: $session->payment_intent,
                amount: $amountSubunits,
                currency: strtoupper($currency),
                status: $session->payment_status,
                checkoutSessionId: $session->id,
                checkoutUrl: $session->url,
                clientSecret: null, // Not needed for Checkout Session flow
            );
        } catch (ApiErrorException $e) {
            throw PaymentGatewayException::fromStripe($e->getMessage(), $e->getCode());
        }
    }

    public function verifyWebhookSignature(string $payload, string $signature): bool
    {
        try {
            StripeWebhook::constructEvent(
                $payload,
                $signature,
                config('services.stripe.webhook_secret'),
            );
            return true;
        } catch (\Exception) {
            return false;
        }
    }

    public function provider(): GatewayProvider
    {
        return GatewayProvider::STRIPE;
    }
}
```

**Critical constraints:**
- Stripe API calls MUST happen OUTSIDE database transactions (same rule as Razorpay)
- `config()` is used, NOT `env()` — `env()` is forbidden outside config files
- Error handling wraps Stripe exceptions into domain `PaymentGatewayException`

### 8.2 Modified: `RazorpaySubscriptionGateway`

Update to conform to the modified interface:

1. Rename `$amountPaise` parameter to `$amountSubunits` (if applicable — verify current code)
2. Add `provider(): GatewayProvider` method returning `GatewayProvider::RAZORPAY`
3. Add `verifyWebhookSignature()` method if not already on the class (extract from UseCase if needed)

### 8.3 Modified: `FakePaymentGateway`

Update the test fake to support both providers:

```php
<?php

declare(strict_types=1);

namespace Tests\Fakes;

use Domain\SuperAdminDashboard\Subscription\Contracts\PaymentGatewayInterface;
use Domain\SuperAdminDashboard\Subscription\DTOs\OrderResult;
use Domain\Shared\ValueObjects\GatewayProvider;

final class FakePaymentGateway implements PaymentGatewayInterface
{
    private GatewayProvider $simulatedProvider;

    /** @var array<int, array{amount: int, currency: string, receiptId: string}> */
    private array $createdOrders = [];

    private bool $shouldFail = false;

    public function __construct(GatewayProvider $provider = GatewayProvider::RAZORPAY)
    {
        $this->simulatedProvider = $provider;
    }

    public function createOrder(
        int $amountSubunits,
        string $currency,
        string $receiptId,
        array $notes = [],
    ): OrderResult {
        if ($this->shouldFail) {
            throw new \Domain\SuperAdminDashboard\Subscription\Exceptions\PaymentGatewayException(
                'Simulated gateway failure'
            );
        }

        $this->createdOrders[] = [
            'amount' => $amountSubunits,
            'currency' => $currency,
            'receiptId' => $receiptId,
        ];

        $orderId = match ($this->simulatedProvider) {
            GatewayProvider::RAZORPAY => 'order_fake_' . uniqid(),
            GatewayProvider::STRIPE => 'pi_fake_' . uniqid(),
        };

        return new OrderResult(
            provider: $this->simulatedProvider,
            orderId: $orderId,
            amount: $amountSubunits,
            currency: $currency,
            status: 'created',
            checkoutSessionId: $this->simulatedProvider === GatewayProvider::STRIPE
                ? 'cs_fake_' . uniqid()
                : null,
            checkoutUrl: $this->simulatedProvider === GatewayProvider::STRIPE
                ? 'https://checkout.stripe.com/fake-session'
                : null,
        );
    }

    public function verifyWebhookSignature(string $payload, string $signature): bool
    {
        return $signature === 'valid_fake_signature';
    }

    public function provider(): GatewayProvider
    {
        return $this->simulatedProvider;
    }

    // Test helper methods
    public function simulateFailure(): void { $this->shouldFail = true; }
    public function orderCount(): int { return count($this->createdOrders); }
    public function lastOrder(): ?array { return end($this->createdOrders) ?: null; }
    public function reset(): void { $this->createdOrders = []; $this->shouldFail = false; }
}
```

### 8.4 New: `FakePaymentGatewayFactory`

**File:** `tests/Fakes/FakePaymentGatewayFactory.php`

```php
<?php

declare(strict_types=1);

namespace Tests\Fakes;

use Application\SuperAdminDashboard\Subscription\Services\PaymentGatewayFactoryInterface;
use Domain\SuperAdminDashboard\Subscription\Contracts\PaymentGatewayInterface;
use Domain\Shared\ValueObjects\GatewayProvider;

final class FakePaymentGatewayFactory implements PaymentGatewayFactoryInterface
{
    /** @var array<string, FakePaymentGateway> */
    private array $gateways = [];

    public function resolve(GatewayProvider $provider): PaymentGatewayInterface
    {
        if (!isset($this->gateways[$provider->value])) {
            $this->gateways[$provider->value] = new FakePaymentGateway($provider);
        }
        return $this->gateways[$provider->value];
    }

    public function gatewayFor(GatewayProvider $provider): FakePaymentGateway
    {
        return $this->resolve($provider);
    }
}
```

### 8.5 Configuration: `config/services.php`

Add Stripe configuration alongside existing Razorpay config:

```php
// Add to config/services.php
'stripe' => [
    'secret_key' => env('STRIPE_SECRET_KEY'),
    'publishable_key' => env('STRIPE_PUBLISHABLE_KEY'),
    'webhook_secret' => env('STRIPE_WEBHOOK_SECRET'),
    'success_url' => env('STRIPE_SUCCESS_URL', 'https://educoreos.com/payment/success'),
    'cancel_url' => env('STRIPE_CANCEL_URL', 'https://educoreos.com/payment/cancel'),
],
```

**`.env` additions:**
```
STRIPE_SECRET_KEY=sk_test_xxx
STRIPE_PUBLISHABLE_KEY=pk_test_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
STRIPE_SUCCESS_URL=https://educoreos.com/payment/success
STRIPE_CANCEL_URL=https://educoreos.com/payment/cancel
```

### 8.6 Composer Dependency

```bash
composer require stripe/stripe-php
```

---

## 9. HTTP Layer Changes

### 9.1 New: Stripe Webhook Endpoint

**File:** `Http/WebApi/SuperAdminDashboard/Subscription/Controllers/StripeWebhookAction.php`

Pattern B applies even for webhooks in the WebApi namespace.

```php
// Route: POST /api/webhooks/stripe
// Auth: None (signature verification in UseCase)
// Middleware: None (must be accessible by Stripe)
```

**Implementation notes:**
- Stripe sends the signature in the `Stripe-Signature` header (not `X-Razorpay-Signature`)
- The controller reads the raw request body via `file_get_contents('php://input')` or `$request->getContent()`
- Passes body + signature to `ProcessStripeWebhookUseCase`
- Returns 200 on success (Stripe retries on non-2xx)
- Returns 400 on signature failure (do NOT return 401 — Stripe does not send auth credentials)

**Route registration:**
```php
// In routes/api.php (webhook routes — no auth middleware)
Route::post('/webhooks/stripe', StripeWebhookAction::class);
```

### 9.2 Modified: Tenant Provisioning Endpoint

The existing `POST /api/admin/tenants` (or equivalent provisioning endpoint) must accept `country_code` in the request body.

**Request validation addition:**
```php
'country_code' => ['required', 'string', 'size:2', Rule::in(['IN', 'AE', 'SA'])],
```

**Response addition:** Include `country_code`, `default_currency`, `payment_gateway` in the tenant response resource.

### 9.3 Modified: Subscription Plan Endpoints

**Plan creation** (`POST /api/admin/subscription-plans`):
- Add `country_code` to request validation: `'country_code' => ['required', 'string', 'size:2', Rule::in(['IN', 'AE', 'SA'])]`
- Add `country_code` to response resource

**Plan listing** (`GET /api/admin/subscription-plans`):
- Add optional `?country_code=AE` query filter
- When Super Admin is assigning a plan to a tenant, the frontend should filter plans by the tenant's country_code

### 9.4 Modified: Plan Assignment Response

For Stripe-processed subscriptions, the response shape differs from Razorpay:

```json
{
    "data": {
        "id": 456,
        "tenant_id": 78,
        "plan": {
            "id": 12,
            "name": "GCC Professional",
            "code": "gcc_professional_monthly"
        },
        "status": "pending_payment",
        "billing_cycle": "monthly",
        "locked_price_monthly_cents": 36700,
        "currency": "AED",
        "gateway_provider": "stripe",
        "stripe_checkout_session_id": "cs_xxx",
        "checkout_data": {
            "checkout_url": "https://checkout.stripe.com/c/pay/cs_xxx",
            "session_id": "cs_xxx"
        }
    }
}
```

**Key difference from Razorpay:** Stripe uses a redirect-based Checkout Session (the user is redirected to `checkout_url`), while Razorpay uses an embedded widget (the frontend opens the Razorpay modal with `key_id` + `order_id`). The frontend must handle both flows based on `gateway_provider`.

---

## 10. Modified: `SubscriptionServiceProvider`

The current provider binds `PaymentGatewayInterface` → `RazorpaySubscriptionGateway` statically. This must change.

**Before:**
```php
$this->app->bind(PaymentGatewayInterface::class, RazorpaySubscriptionGateway::class);
```

**After:**
```php
// Individual gateway implementations (concrete classes, not bound to interface)
$this->app->singleton(RazorpaySubscriptionGateway::class);
$this->app->singleton(StripePaymentGateway::class);

// Factory for resolving the correct gateway at runtime
$this->app->bind(PaymentGatewayFactoryInterface::class, PaymentGatewayFactory::class);

// REMOVE the direct PaymentGatewayInterface binding
// Code that previously injected PaymentGatewayInterface directly
// must now inject PaymentGatewayFactoryInterface and call ->resolve()
```

**Breaking change:** Any code that currently injects `PaymentGatewayInterface` directly must be updated to use the factory. Grep the codebase for all constructor injections of `PaymentGatewayInterface` and update them.

---

## 11. Stripe Integration — Technical Reference

### 11.1 Stripe Checkout Session Flow

```
1. Super Admin assigns paid plan to GCC tenant
2. Backend creates Stripe Checkout Session via API
3. Backend returns checkout_url to frontend
4. Frontend redirects Super Admin to Stripe-hosted checkout page
5. User completes payment on Stripe
6. Stripe redirects to success_url with session_id
7. Stripe sends webhook (checkout.session.completed)
8. Backend webhook handler verifies signature
9. Backend activates subscription (pending_payment → active)
```

### 11.2 Stripe Webhook Events

| Event | When | Action |
|---|---|---|
| `checkout.session.completed` | Payment successful via Checkout | Activate subscription |
| `payment_intent.succeeded` | PaymentIntent confirmed | Backup activation trigger (redundant safety, same as Razorpay's `order.paid`) |
| `payment_intent.payment_failed` | Payment attempt failed | Log event, subscription stays `pending_payment` |

### 11.3 Stripe Signature Verification

Stripe uses a different signature scheme than Razorpay:

- Header: `Stripe-Signature` (contains `t=timestamp,v1=signature`)
- Algorithm: `HMAC-SHA256(timestamp + '.' + payload, webhook_secret)`
- Stripe PHP SDK provides `Webhook::constructEvent()` which handles verification

### 11.4 Amount Convention

| Our System | Stripe | Conversion |
|---|---|---|
| `price_monthly_cents` (integer) | `unit_amount` (integer, smallest currency unit) | **1:1 mapping** for INR, AED, SAR |
| AED 367.00 | `36700` fils | Direct pass-through |
| SAR 500.00 | `50000` halalas | Direct pass-through |
| INR 499.00 | `49900` paise | Direct pass-through (but INR uses Razorpay, not Stripe) |

### 11.5 Stripe Test Mode

Stripe provides a full test environment with `sk_test_` and `pk_test_` prefixed keys. Test card numbers:

| Scenario | Card Number |
|---|---|
| Success | `4242 4242 4242 4242` |
| Declined | `4000 0000 0000 0002` |
| Requires 3DS | `4000 0027 6000 3184` |

---

## 12. Idempotency & Safety Rules

All existing financial safety rules from Phases 12A–12C continue to apply. Additionally:

| Rule | Enforcement |
|---|---|
| Stripe API calls OUTSIDE database transactions | Same as Razorpay — never hold a DB lock while calling Stripe |
| Stripe webhook idempotency | Use `payment_events` table with Stripe event ID. Duplicate events are rejected. |
| `stripe_payment_intent_id` immutable after set | Domain entity enforces — no update method |
| `stripe_checkout_session_id` immutable after set | Domain entity enforces — no update method |
| No Stripe secrets in API responses | `secret_key` and `webhook_secret` never appear in any response. Only `publishable_key` is sent to frontend. |
| `country_code` immutable on tenants | Domain entity enforces — no setter after construction |
| `default_currency` immutable on tenants | Derived from `country_code` — no independent setter |
| `payment_gateway` immutable on tenants | Derived from `country_code` — no independent setter |
| Plan-country validation | `AssignSubscriptionToTenantUseCase` rejects plan.country_code ≠ tenant.country_code |
| Pessimistic locking on `pending_payment` → `active` | Same as Razorpay — `lockForUpdate` on subscription record |
| Audit logging on all payment events | `TenantAuditLogger` via `DB::afterCommit()` — same pattern |

---

## 13. What NOT to Do

- Do NOT call Stripe API inside `DB::transaction()`
- Do NOT trust the success_url redirect for subscription activation — ONLY the webhook activates
- Do NOT store `secret_key` or `webhook_secret` in API responses or database
- Do NOT create a combined webhook endpoint for both Razorpay and Stripe — separate endpoints, separate UseCases
- Do NOT modify the existing Razorpay flow behavior — extend, don't break
- Do NOT use `env()` anywhere in `app/` — only in `config/` files
- Do NOT use DECIMAL or FLOAT for any amount
- Do NOT skip audit logging on any payment-related action
- Do NOT allow `country_code` to be updated after tenant provisioning
- Do NOT allow plan assignment where plan.country_code ≠ tenant.country_code
- Do NOT hardcode gateway selection — always use `PaymentGatewayFactoryInterface`
- Do NOT import Stripe SDK classes in the Domain layer — Stripe imports belong in `Infrastructure/PaymentGateway/` only
- Do NOT use `stancl/tenancy` package

---

## 14. Implementation Sequence

| Step | Task | Depends On | Files |
|---|---|---|---|
| 1 | Install `stripe/stripe-php` via Composer | — | `composer.json`, `composer.lock` |
| 2 | Create value objects (`Currency`, `CountryCode`, `GatewayProvider`) | — | `Domain/Shared/ValueObjects/` |
| 3 | Run migration: add columns to `tenants` | — | `database/migrations/central/` |
| 4 | Run migration: add `country_code` to `subscription_plans` | — | `database/migrations/central/` |
| 5 | Run migration: add gateway fields to `tenant_subscriptions` | — | `database/migrations/central/` |
| 6 | Update `TenantEntity` with new properties | Step 2 | `Domain/SuperAdminDashboard/Tenant/` |
| 7 | Update `SubscriptionPlanEntity` with `countryCode` | Step 2 | `Domain/SuperAdminDashboard/Subscription/` |
| 8 | Update `TenantSubscriptionEntity` with gateway fields | Step 2 | `Domain/SuperAdminDashboard/Subscription/` |
| 9 | Create `PlanCountryMismatchException` | — | `Domain/SuperAdminDashboard/Subscription/Exceptions/` |
| 10 | Modify `PaymentGatewayInterface` (currency-neutral + `provider()`) | Step 2 | `Domain/SuperAdminDashboard/Subscription/Contracts/` |
| 11 | Update `OrderResult` DTO | Step 2, 10 | `Domain/SuperAdminDashboard/Subscription/DTOs/` |
| 12 | Update `RazorpaySubscriptionGateway` to conform to new interface | Step 10 | `Infrastructure/PaymentGateway/` |
| 13 | Create `StripePaymentGateway` | Step 1, 10 | `Infrastructure/PaymentGateway/` |
| 14 | Create `PaymentGatewayFactory` (interface + implementation) | Step 12, 13 | `Application/…/Services/`, `Infrastructure/PaymentGateway/` |
| 15 | Update `SubscriptionServiceProvider` (factory binding) | Step 14 | `app/Providers/` |
| 16 | Add Stripe config to `config/services.php` + `.env` | Step 1 | `config/`, `.env.example` |
| 17 | Modify `AssignSubscriptionToTenantUseCase` (factory + country validation) | Step 14, 9 | `Application/…/UseCases/` |
| 18 | Modify `ChangeTenantPlanUseCase` (same factory pattern) | Step 14 | `Application/…/UseCases/` |
| 19 | Modify `RetryPaymentUseCase` (if exists — same factory pattern) | Step 14 | `Application/…/UseCases/` |
| 20 | Create `ProcessStripeWebhookUseCase` | Step 13, 8 | `Application/…/UseCases/` |
| 21 | Create `StripeWebhookAction` controller | Step 20 | `Http/WebApi/…/Controllers/` |
| 22 | Register Stripe webhook route | Step 21 | `routes/api.php` |
| 23 | Update `FakePaymentGateway` + create `FakePaymentGatewayFactory` | Step 10, 14 | `tests/Fakes/` |
| 24 | Modify tenant provisioning (accept `country_code`, derive currency + gateway) | Step 6 | Application + HTTP layers |
| 25 | Modify plan CRUD endpoints (accept + filter by `country_code`) | Step 7 | HTTP layer |
| 26 | Update Eloquent models (`SubscriptionPlanRecord`, `TenantRecord`, `TenantSubscriptionRecord`) | Steps 3-5 | `Infrastructure/Database/Models/` |
| 27 | Update repositories | Step 26 | `Infrastructure/Database/Repositories/` |
| 28 | Update request validators + API resources | Steps 24, 25 | `Http/Requests/`, `Http/Resources/` |
| 29 | Write tests | All above | `tests/` |
| 30 | PHPStan Level 5 pass | All above | — |

---

## 15. Test Requirements

### Unit Tests

- [ ] `Currency` value object: construction, validation, subunit factor, equality
- [ ] `CountryCode` value object: construction, validation, `defaultCurrency()`, `defaultGateway()`, unsupported country rejection
- [ ] `GatewayProvider` enum: values, labels
- [ ] `StripePaymentGateway::createOrder()` — verify Checkout Session parameters (use Stripe test mode or mock)
- [ ] `StripePaymentGateway::verifyWebhookSignature()` — valid and invalid signatures
- [ ] `PaymentGatewayFactory::resolve()` — returns correct implementation for each provider
- [ ] `SubscriptionPlanEntity::isAssignableTo()` — country match and mismatch
- [ ] `TenantEntity` — immutability of country/currency/gateway after construction
- [ ] `ProcessStripeWebhookUseCase` — `checkout.session.completed` happy path, duplicate event (idempotent), invalid signature
- [ ] `AssignSubscriptionToTenantUseCase` — country mismatch throws `PlanCountryMismatchException`
- [ ] `AssignSubscriptionToTenantUseCase` — Stripe tenant gets Stripe checkout flow
- [ ] `AssignSubscriptionToTenantUseCase` — Razorpay tenant behavior unchanged

### Feature Tests

- [ ] Tenant provisioning with `country_code: 'AE'` → tenant gets `default_currency: 'AED'`, `payment_gateway: 'stripe'`
- [ ] Tenant provisioning with `country_code: 'IN'` → tenant gets `default_currency: 'INR'`, `payment_gateway: 'razorpay'`
- [ ] Tenant provisioning with unsupported country → 422 validation error
- [ ] Plan creation with `country_code: 'AE'` → plan stored with country_code
- [ ] Plan listing with `?country_code=AE` filter → only AE plans returned
- [ ] Assign India plan to UAE tenant → 422 (country mismatch)
- [ ] Assign UAE plan to UAE tenant → 200 with Stripe checkout URL
- [ ] Assign India plan to India tenant → 200 with Razorpay checkout data (unchanged behavior)
- [ ] Stripe webhook `checkout.session.completed` → subscription activated
- [ ] Stripe webhook with invalid signature → 400
- [ ] Stripe webhook with duplicate event_id → 200 (idempotent)
- [ ] Trial plan assignment → unchanged behavior (no gateway involved)
- [ ] `skip_payment` flag → unchanged behavior

### Regression Tests

- [ ] ALL existing Razorpay payment flow tests pass without modification
- [ ] ALL existing subscription management tests pass
- [ ] ALL existing tenant provisioning tests pass (with `country_code` defaulting to `'IN'`)

### Minimum Test Count

**25–35 new tests expected** across unit and feature test suites.

---

## 16. Quality Gate — Phase G1 Complete

### Security & Financial Safety Gates (BLOCKING)

- [ ] Stripe webhook signature verification works for `checkout.session.completed` and `payment_intent.succeeded`
- [ ] Duplicate Stripe webhook events rejected (idempotency via `payment_events`)
- [ ] No Stripe secrets (`secret_key`, `webhook_secret`) exposed in API responses
- [ ] No Stripe API calls inside database transactions
- [ ] Pessimistic locking on Stripe-initiated `pending_payment` → `active` transition
- [ ] `stripe_payment_intent_id` immutable after set
- [ ] `country_code`, `default_currency`, `payment_gateway` immutable on tenants after provisioning
- [ ] Plan-country mismatch validation enforced on assignment
- [ ] Every Stripe payment event logged to `payment_events` and audit logs
- [ ] `env()` check: zero results in `app/`, `routes/`, `database/`

### Functional Gates (BLOCKING)

- [ ] UAE tenant provisioning works end-to-end (country → currency → gateway derived correctly)
- [ ] Saudi tenant provisioning works end-to-end
- [ ] India tenant provisioning unchanged
- [ ] GCC plan creation with `country_code` works
- [ ] Plan filtering by `country_code` works
- [ ] UAE tenant + UAE plan → Stripe Checkout Session created, `checkout_url` returned
- [ ] India tenant + India plan → Razorpay flow unchanged
- [ ] Cross-country plan assignment rejected
- [ ] Stripe webhook activates subscription correctly
- [ ] Trial plan assignment works unchanged (no gateway)
- [ ] `skip_payment` flag works unchanged

### Architecture Gates (BLOCKING)

- [ ] PHPStan Level 5: zero new errors
- [ ] All tests pass (zero regression)
- [ ] `PaymentGatewayInterface` extended, not replaced — existing method signatures preserved (with rename)
- [ ] `FakePaymentGateway` updated for all new methods
- [ ] `FakePaymentGatewayFactory` created and used in all tests
- [ ] Domain layer has zero `Illuminate` imports in new files
- [ ] Domain layer has zero Stripe SDK imports
- [ ] Controllers < 20 lines per method
- [ ] `ClockInterface` used for all time operations
- [ ] Events dispatched outside transactions (`DB::afterCommit()`)
- [ ] Audit logs written outside transactions (`DB::afterCommit()`)
- [ ] No `stancl/tenancy` usage anywhere

---

## 17. Implementation Plan Format

Same format as previous phases:

| # | Section | Description |
|---|---|---|
| 1 | Executive Summary | What gets built, what does NOT |
| 2 | Gap Analysis | Verify existing gateway code, interface shape, tenant provisioning flow |
| 3 | Architecture Decisions | Any deviations from this spec |
| 4 | Migration Plan | Three new migrations — verify column conflicts |
| 5 | Domain Layer Changes | Value objects, entity modifications, new exception |
| 6 | Application Layer Changes | Factory interface, UseCase modifications, new webhook UseCase |
| 7 | Infrastructure Layer Changes | StripePaymentGateway, factory implementation, config, Composer |
| 8 | HTTP Layer Changes | Webhook controller, provisioning endpoint, plan endpoints |
| 9 | Provider Changes | SubscriptionServiceProvider refactoring |
| 10 | Implementation Sequence | Ordered steps with dependencies |
| 11 | Test Plan | Every test file with description |
| 12 | Quality Gate Verification | Checklist from §16 |
| 13 | Risk Register | Identified risks with severity and mitigation |
| 14 | File Manifest | Every new and modified file |

---

## 18. Constraints & Reminders

### Architecture Constraints

- `PaymentGatewayInterface` is extended with `provider()` and parameter rename. All existing methods remain functional.
- Stripe imports belong ONLY in `Infrastructure/PaymentGateway/`. Zero Stripe classes in Domain or Application layers.
- `CountryCode` value object is the single source of truth for country → currency → gateway mapping. Do NOT duplicate this logic elsewhere.
- Gateway resolution is through the factory, NEVER through direct instantiation or static binding.
- `FakePaymentGatewayFactory` must be used in ALL tests. No test should instantiate a real gateway.
- HTTP layer follows Pattern B: `Http/WebApi/SuperAdminDashboard/Subscription/Controllers/StripeWebhookAction.php`

### Docker Environment

- Container: Alpine Linux — use `sh` not `bash`
- Container name: `ubotz_backend`
- Database: `ubotz_mysql`

### What NOT to Do

See §13 for the complete list.

---

## 19. Definition of Done

Phase G1 is complete when:

1. The implementation plan has been reviewed and approved by the Principal Engineer.
2. All code is implemented per the approved plan.
3. All quality gates in §16 pass.
4. A Principal Engineer audit confirms zero critical or high findings.
5. All findings from audit are resolved.
6. A successful end-to-end Stripe payment has been demonstrated with Stripe Test Mode.
7. All existing Razorpay flows verified unchanged via regression tests.
8. The Phase G1 Completion Report is signed off.

---

## 20. Risk Register

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| R-01 | Breaking existing Razorpay flow during interface refactoring | **HIGH** | Run ALL existing payment tests after each interface change. Factory must resolve Razorpay correctly for existing tenants. |
| R-02 | `PaymentGatewayInterface` parameter rename breaks existing callers | **HIGH** | Grep ALL usages of `createOrder` and update parameter names. PHPStan will catch type errors. |
| R-03 | Stripe Checkout Session URL expiration (24 hours) | **MEDIUM** | Same pattern as Razorpay — `RetryPaymentUseCase` creates a new session. |
| R-04 | Stripe webhook delivery failures | **LOW** | Stripe retries webhooks for up to 72 hours. Idempotency prevents double-activation. |
| R-05 | Existing tests break due to `SubscriptionServiceProvider` refactoring | **HIGH** | All existing tests must bind `FakePaymentGatewayFactory` instead of `FakePaymentGateway`. Update test setup. |
| R-06 | `country_code` default on existing tenants may cause confusion | **LOW** | All existing tenants are Indian — `'IN'` default is correct. Document this in migration comments. |
| R-07 | Stripe account not yet created by Ubotz for GCC | **MEDIUM** | G1 can be fully tested with Stripe Test Mode. Live keys needed before production GCC launch. |

---

## 21. File Manifest

### New Files

| File | Layer | Purpose |
|---|---|---|
| `Domain/Shared/ValueObjects/Currency.php` | Domain | Currency code validation + subunit registry |
| `Domain/Shared/ValueObjects/CountryCode.php` | Domain | Country validation + region resolution |
| `Domain/Shared/ValueObjects/GatewayProvider.php` | Domain | Gateway provider enum |
| `Domain/SuperAdminDashboard/Subscription/Exceptions/PlanCountryMismatchException.php` | Domain | Plan-tenant country validation |
| `Application/SuperAdminDashboard/Subscription/Services/PaymentGatewayFactoryInterface.php` | Application | Factory contract |
| `Application/SuperAdminDashboard/Subscription/UseCases/ProcessStripeWebhookUseCase.php` | Application | Stripe webhook processing |
| `Infrastructure/PaymentGateway/StripePaymentGateway.php` | Infrastructure | Stripe API adapter |
| `Infrastructure/PaymentGateway/PaymentGatewayFactory.php` | Infrastructure | Factory implementation |
| `Http/WebApi/SuperAdminDashboard/Subscription/Controllers/StripeWebhookAction.php` | HTTP | Stripe webhook endpoint |
| `database/migrations/central/2026_03_27_000001_add_country_currency_gateway_to_tenants.php` | Database | Tenants schema extension |
| `database/migrations/central/2026_03_27_000002_add_country_code_to_subscription_plans.php` | Database | Plans schema extension |
| `database/migrations/central/2026_03_27_000003_add_gateway_fields_to_tenant_subscriptions.php` | Database | Subscriptions schema extension |
| `tests/Fakes/FakePaymentGatewayFactory.php` | Test | Factory test double |
| `tests/Unit/Domain/Shared/ValueObjects/CurrencyTest.php` | Test | Currency VO tests |
| `tests/Unit/Domain/Shared/ValueObjects/CountryCodeTest.php` | Test | CountryCode VO tests |
| `tests/Unit/Infrastructure/PaymentGateway/StripePaymentGatewayTest.php` | Test | Stripe gateway tests |
| `tests/Unit/Infrastructure/PaymentGateway/PaymentGatewayFactoryTest.php` | Test | Factory tests |
| `tests/Unit/Application/SuperAdminDashboard/Subscription/UseCases/ProcessStripeWebhookUseCaseTest.php` | Test | Stripe webhook tests |
| `tests/Feature/WebApi/SuperAdminDashboard/Subscription/Controllers/StripeWebhookActionTest.php` | Test | Stripe webhook feature tests |

### Modified Files

| File | Layer | Change |
|---|---|---|
| `Domain/SuperAdminDashboard/Subscription/Contracts/PaymentGatewayInterface.php` | Domain | Parameter rename + `provider()` method |
| `Domain/SuperAdminDashboard/Subscription/DTOs/OrderResult.php` | Domain | Add Stripe fields + `GatewayProvider` |
| `Domain/SuperAdminDashboard/Tenant/Entities/TenantEntity.php` | Domain | Add country/currency/gateway properties |
| `Domain/SuperAdminDashboard/Subscription/Entities/SubscriptionPlanEntity.php` | Domain | Add `countryCode` + `isAssignableTo()` |
| `Domain/SuperAdminDashboard/Subscription/Entities/TenantSubscriptionEntity.php` | Domain | Add gateway tracking fields |
| `Infrastructure/PaymentGateway/RazorpaySubscriptionGateway.php` | Infrastructure | Conform to updated interface |
| `Infrastructure/Database/Models/SubscriptionPlanRecord.php` | Infrastructure | Add `country_code` to fillable/casts |
| `Infrastructure/Database/Models/TenantRecord.php` (or equivalent) | Infrastructure | Add new columns |
| `Infrastructure/Database/Models/TenantSubscriptionRecord.php` (or equivalent) | Infrastructure | Add Stripe columns |
| `Application/SuperAdminDashboard/Subscription/UseCases/AssignSubscriptionToTenantUseCase.php` | Application | Factory pattern + country validation |
| `Application/SuperAdminDashboard/Subscription/UseCases/ChangeTenantPlanUseCase.php` | Application | Factory pattern |
| `app/Providers/SubscriptionServiceProvider.php` | Provider | Factory binding instead of direct binding |
| `config/services.php` | Config | Add Stripe configuration |
| `.env.example` | Config | Add Stripe env vars |
| `composer.json` | Root | Add `stripe/stripe-php` |
| `routes/api.php` | Routes | Add Stripe webhook route |
| `tests/Fakes/FakePaymentGateway.php` | Test | Support both providers |
| All existing tests injecting `PaymentGatewayInterface` | Test | Switch to `FakePaymentGatewayFactory` |
| `Http/Requests/SuperAdminDashboard/ProvisionTenantRequest.php` | HTTP | Add `country_code` validation |
| `Http/Requests/SuperAdminDashboard/Subscription/CreateSubscriptionPlanRequest.php` | HTTP | Add `country_code` validation |

---

*End of Phase G1 Developer Instructions*
