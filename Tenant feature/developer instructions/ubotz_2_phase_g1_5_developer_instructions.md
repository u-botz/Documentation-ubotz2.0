# Phase G1.5 — VAT Invoice Compliance (Country-Aware Invoicing)

## Developer Instructions

**Document Version:** 1.0
**Date:** 2026-03-27
**Author:** Principal Engineer (Claude)
**Phase Dependency:** Requires Phase G1 COMPLETE (country/currency/gateway on tenants) + Phase 12C COMPLETE (invoice generation + refund workflows)
**Target:** Antigravity Implementation Team

---

## 1. Executive Summary

### What Gets Built

Phase G1.5 makes the platform invoicing system country-aware so that GCC tenants receive legally compliant invoices. Specifically:

1. **Country-prefixed invoice numbering** — India uses `INV-IN/2025-26/0001` (April–March FY), GCC uses `INV-AE/2026/0001` or `INV-SA/2026/0001` (January–December FY). Separate gapless sequences per country.
2. **Multi-entity seller details** — Platform settings store separate legal entity details per country (`billing.in.*`, `billing.ae.*`, `billing.sa.*`). The correct seller entity is resolved from the tenant's `country_code` at invoice generation time.
3. **VAT calculation** — UAE invoices include 5% VAT. Saudi invoices include 15% VAT. Indian invoices continue with tax = 0 (GST calculation remains deferred).
4. **Generic tax identifier** — Rename `gst_number` to `tax_id` on `tenant_billing_profiles` and throughout the domain layer. The seller snapshot `gst` key becomes `tax_id`. Supports both GST (India) and VAT TRN (UAE/Saudi).
5. **Stripe payment reference on invoices** — Add `stripe_payment_intent_id` and `stripe_checkout_session_id` columns to the `invoices` table alongside existing Razorpay columns.
6. **Currency-aware PDF rendering** — Invoice PDFs display amounts with the correct currency symbol and tax label.

### What Does NOT Get Built

| Excluded Item | Reason | Deferred To |
|---|---|---|
| Indian GST calculation (CGST/SGST/IGST) | Complex state-based splitting | Future GST engine phase |
| ZATCA e-invoicing (Saudi XML format) | Not required for small/medium institutes yet | Future |
| Credit notes | Requires separate workflow | Future |
| Tax-exempt invoice support | No exemption scenarios identified | Future |
| Tenant logo on invoices | Already deferred from 12C | Future |
| Tax rate configurability by Super Admin | Hardcoded in domain for safety | Future |

---

## 2. Architecture — What Already Exists

### 2.1 Invoice Infrastructure (Phase 12C)

| Component | Location | Status |
|---|---|---|
| `InvoiceEntity` | `Domain/SuperAdminDashboard/Billing/Entities/` | EXISTS — immutable after construction |
| `InvoiceNumber` | `Domain/SuperAdminDashboard/Billing/ValueObjects/` | EXISTS — regex `^INV/(\d{4}-\d{2})/(\d{4,})$` — **MUST CHANGE** |
| `InvoiceNumberGeneratorInterface` | `Domain/SuperAdminDashboard/Billing/Services/` | EXISTS — `generate(): InvoiceNumber` — **MUST CHANGE** |
| `SequentialInvoiceNumberGenerator` | `Infrastructure/Services/` | EXISTS — hardcoded Indian FY (April–March) — **MUST CHANGE** |
| `GenerateInvoiceUseCase` | `Application/SuperAdminDashboard/Billing/UseCases/` | EXISTS |
| `InvoicePdfGenerator` | Infrastructure | EXISTS — DomPDF + Blade |
| `invoices` table | DB | EXISTS — has `currency VARCHAR(3) DEFAULT 'INR'` |
| `invoice_number_sequences` table | DB | EXISTS — `financial_year` UNIQUE + `last_sequence` |

### 2.2 Platform Settings (Seller Entity)

| Key | Status |
|---|---|
| `billing.company_name` | EXISTS — single India entity |
| `billing.company_address` | EXISTS |
| `billing.company_gst` | EXISTS |
| `billing.company_email` | EXISTS |
| `billing.company_phone` | EXISTS |

**No GCC entity keys exist. No country-scoping mechanism.**

### 2.3 Tenant Billing Profile (Buyer Side)

| Component | Issue |
|---|---|
| `tenant_billing_profiles.gst_number` VARCHAR(20) | **GST-specific naming — must rename to `tax_id`** |
| `TenantBillingProfileEntity.$gstNumber` | **Must rename to `$taxId`** |
| `toSnapshotArray()` outputs `'gst_number'` key | **Must change to `'tax_id'`** |

### 2.4 Invoices Table — Missing Columns

| Missing | Needed For |
|---|---|
| `country_code` | Which country's rules were applied |
| `subtotal_cents` | Pre-tax amount (currently only `total_amount_cents`) |
| `tax_amount_cents` | Tax amount (deferred as zero in 12C) |
| `tax_rate_bps` | Tax rate snapshot in basis points |
| `tax_label` | Display label for PDF |
| `stripe_payment_intent_id` | Stripe payment reference |
| `stripe_checkout_session_id` | Stripe session reference |
| `gateway_provider` | Which gateway processed payment |

---

## 3. What Must Be Built or Modified

| # | Component | Action | Severity |
|---|---|---|---|
| 1 | `invoices` table migration | Add tax + gateway columns | **CRITICAL** |
| 2 | `invoice_number_sequences` migration | Add `country_code`; composite unique | **CRITICAL** |
| 3 | `tenant_billing_profiles` migration | Rename `gst_number` → `tax_id`; add `tax_id_type` | **HIGH** |
| 4 | `InvoiceNumber` value object | New regex for country-prefixed format + legacy support | **CRITICAL** |
| 5 | `SequentialInvoiceNumberGenerator` | Country-aware FY + sequence | **CRITICAL** |
| 6 | `InvoiceNumberGeneratorInterface` | Signature change: accept `CountryCode` | **CRITICAL** |
| 7 | `TaxCalculator` domain service | NEW — tax rate + label by country | **HIGH** |
| 8 | `FinancialYearResolver` domain service | NEW — country-based FY derivation | **HIGH** |
| 9 | `SellerEntityResolver` application service | NEW — reads `billing.{country}.*` keys | **HIGH** |
| 10 | `InvoiceEntity` | Add tax fields, country_code, Stripe refs | **HIGH** |
| 11 | `GenerateInvoiceUseCase` | Tax calc, seller resolution, gateway refs | **HIGH** |
| 12 | Invoice PDF Blade template | Currency symbol, tax display, gateway ref | **HIGH** |
| 13 | `TenantBillingProfileEntity` | Rename `$gstNumber` → `$taxId` + `$taxIdType` | **MEDIUM** |
| 14 | Platform settings data migration | Rename keys + seed GCC entities | **HIGH** |
| 15 | Tests | New + modified | **HIGH** |

---

## 4. Country-Specific Invoice Rules

Single source of truth for per-country invoicing behavior.

| Attribute | India (`IN`) | UAE (`AE`) | Saudi Arabia (`SA`) |
|---|---|---|---|
| **Financial year** | April 1 – March 31 | January 1 – December 31 | January 1 – December 31 |
| **FY label format** | `2025-26` | `2026` | `2026` |
| **Invoice number format** | `INV-IN/2025-26/0001` | `INV-AE/2026/0001` | `INV-SA/2026/0001` |
| **Tax type** | GST | VAT | VAT |
| **Tax rate** | 0% (deferred) | 5% (flat) | 15% (flat) |
| **Tax label on invoice** | "GST" | "VAT (5%)" | "VAT (15%)" |
| **Seller tax ID label** | "GSTIN" | "TRN" | "VAT Number" |
| **Buyer tax ID label** | "GSTIN" | "TRN" | "VAT Number" |
| **Currency** | INR (₹) | AED (د.إ) | SAR (﷼) |
| **Seller entity keys** | `billing.in.*` | `billing.ae.*` | `billing.sa.*` |

---

## 5. Schema Changes

### 5.1 Migration: Extend Invoices Table

**File:** `database/migrations/central/2026_03_27_100001_add_tax_and_gateway_fields_to_invoices.php`

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
        Schema::table('invoices', function (Blueprint $table) {
            $table->string('country_code', 2)
                ->after('invoice_number')
                ->default('IN')
                ->comment('Country whose invoicing rules were applied. Immutable.');

            $table->unsignedBigInteger('subtotal_cents')
                ->after('total_amount_cents')
                ->default(0)
                ->comment('Pre-tax amount in smallest currency unit.');

            $table->unsignedBigInteger('tax_amount_cents')
                ->after('subtotal_cents')
                ->default(0)
                ->comment('Tax amount. total = subtotal + tax.');

            $table->unsignedInteger('tax_rate_bps')
                ->after('tax_amount_cents')
                ->default(0)
                ->comment('Tax rate in basis points. 500 = 5%, 1500 = 15%.');

            $table->string('tax_label', 30)
                ->after('tax_rate_bps')
                ->default('')
                ->comment('Display label: VAT (5%), GST, etc.');

            $table->string('stripe_payment_intent_id', 100)
                ->after('razorpay_order_id')
                ->nullable();

            $table->string('stripe_checkout_session_id', 200)
                ->after('stripe_payment_intent_id')
                ->nullable();

            $table->string('gateway_provider', 20)
                ->after('stripe_checkout_session_id')
                ->nullable()
                ->comment('razorpay or stripe.');

            $table->index('country_code', 'idx_invoices_country_code');
            $table->index('gateway_provider', 'idx_invoices_gateway_provider');
        });
    }

    public function down(): void
    {
        Schema::table('invoices', function (Blueprint $table) {
            $table->dropIndex('idx_invoices_country_code');
            $table->dropIndex('idx_invoices_gateway_provider');
            $table->dropColumn([
                'country_code', 'subtotal_cents', 'tax_amount_cents',
                'tax_rate_bps', 'tax_label', 'stripe_payment_intent_id',
                'stripe_checkout_session_id', 'gateway_provider',
            ]);
        });
    }
};
```

### 5.2 Data Migration: Backfill Existing Invoices

**File:** `database/migrations/central/2026_03_27_100002_backfill_subtotal_on_existing_invoices.php`

```php
<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // Existing invoices had no tax — subtotal equals total
        DB::table('invoices')
            ->where('subtotal_cents', 0)
            ->where('total_amount_cents', '>', 0)
            ->update([
                'subtotal_cents' => DB::raw('total_amount_cents'),
                'country_code' => 'IN',
                'gateway_provider' => 'razorpay',
            ]);
    }

    public function down(): void
    {
        // No reverse needed — data was already correct
    }
};
```

### 5.3 Migration: Country-Scope Invoice Number Sequences

**File:** `database/migrations/central/2026_03_27_100003_add_country_code_to_invoice_number_sequences.php`

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
        Schema::table('invoice_number_sequences', function (Blueprint $table) {
            $table->string('country_code', 2)
                ->after('id')
                ->default('IN');

            $table->dropUnique(['financial_year']);
            $table->unique(['country_code', 'financial_year'], 'uq_inv_seq_country_fy');
        });
    }

    public function down(): void
    {
        Schema::table('invoice_number_sequences', function (Blueprint $table) {
            $table->dropUnique('uq_inv_seq_country_fy');
            $table->unique('financial_year');
            $table->dropColumn('country_code');
        });
    }
};
```

### 5.4 Migration: Rename gst_number → tax_id

**File:** `database/migrations/tenant/2026_03_27_100004_rename_gst_to_tax_id_on_tenant_billing_profiles.php`

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
        Schema::table('tenant_billing_profiles', function (Blueprint $table) {
            $table->renameColumn('gst_number', 'tax_id');
        });

        Schema::table('tenant_billing_profiles', function (Blueprint $table) {
            $table->string('tax_id_type', 10)
                ->after('tax_id')
                ->nullable()
                ->comment('gstin, trn, or vat.');
        });
    }

    public function down(): void
    {
        Schema::table('tenant_billing_profiles', function (Blueprint $table) {
            $table->dropColumn('tax_id_type');
        });

        Schema::table('tenant_billing_profiles', function (Blueprint $table) {
            $table->renameColumn('tax_id', 'gst_number');
        });
    }
};
```

### 5.5 Data Migration: Platform Settings Key Rename + GCC Seed

**File:** `database/migrations/central/2026_03_27_100005_migrate_billing_settings_to_country_prefix.php`

```php
<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // 1. Rename existing India billing keys
        $renames = [
            'billing.company_name' => 'billing.in.company_name',
            'billing.company_address' => 'billing.in.company_address',
            'billing.company_gst' => 'billing.in.company_tax_id',
            'billing.company_email' => 'billing.in.company_email',
            'billing.company_phone' => 'billing.in.company_phone',
        ];

        foreach ($renames as $oldKey => $newKey) {
            DB::table('platform_settings')
                ->where('key', $oldKey)
                ->update(['key' => $newKey, 'updated_at' => now()]);
        }

        DB::table('platform_settings')
            ->where('key', 'billing.in.company_tax_id')
            ->update(['description' => 'India entity GSTIN for invoices']);

        // 2. Seed UAE + Saudi entity keys
        $now = now();
        $gccKeys = [];
        foreach (['ae', 'sa'] as $cc) {
            $label = $cc === 'ae' ? 'UAE' : 'Saudi';
            $taxLabel = $cc === 'ae' ? 'TRN' : 'VAT number';
            $gccKeys[] = ['key' => "billing.{$cc}.company_name", 'value' => '', 'description' => "{$label} entity legal name", 'created_at' => $now, 'updated_at' => $now];
            $gccKeys[] = ['key' => "billing.{$cc}.company_address", 'value' => '', 'description' => "{$label} entity address", 'created_at' => $now, 'updated_at' => $now];
            $gccKeys[] = ['key' => "billing.{$cc}.company_tax_id", 'value' => '', 'description' => "{$label} entity {$taxLabel}", 'created_at' => $now, 'updated_at' => $now];
            $gccKeys[] = ['key' => "billing.{$cc}.company_email", 'value' => '', 'description' => "{$label} entity billing email", 'created_at' => $now, 'updated_at' => $now];
            $gccKeys[] = ['key' => "billing.{$cc}.company_phone", 'value' => '', 'description' => "{$label} entity billing phone", 'created_at' => $now, 'updated_at' => $now];
        }

        DB::table('platform_settings')->insert($gccKeys);
    }

    public function down(): void
    {
        $renames = [
            'billing.in.company_name' => 'billing.company_name',
            'billing.in.company_address' => 'billing.company_address',
            'billing.in.company_tax_id' => 'billing.company_gst',
            'billing.in.company_email' => 'billing.company_email',
            'billing.in.company_phone' => 'billing.company_phone',
        ];

        foreach ($renames as $oldKey => $newKey) {
            DB::table('platform_settings')->where('key', $oldKey)->update(['key' => $newKey]);
        }

        DB::table('platform_settings')->where('key', 'like', 'billing.ae.%')->delete();
        DB::table('platform_settings')->where('key', 'like', 'billing.sa.%')->delete();
    }
};
```

---

## 6. Domain Layer — New Services

### 6.1 `TaxCalculator` (Pure Domain Service)

**File:** `Domain/SuperAdminDashboard/Billing/Services/TaxCalculator.php`

Zero framework dependencies. Tax rates are domain constants — not configurable via settings.

```php
<?php

declare(strict_types=1);

namespace Domain\SuperAdminDashboard\Billing\Services;

use Domain\Shared\ValueObjects\CountryCode;

final class TaxCalculator
{
    // Basis points: 100 bps = 1%. Integer storage avoids floats.
    private const TAX_RATES_BPS = [
        'IN' => 0,      // GST deferred
        'AE' => 500,    // UAE VAT 5%
        'SA' => 1500,   // Saudi VAT 15%
    ];

    private const TAX_LABELS = [
        'IN' => 'GST',
        'AE' => 'VAT (5%)',
        'SA' => 'VAT (15%)',
    ];

    private const TAX_ID_LABELS = [
        'IN' => 'GSTIN',
        'AE' => 'TRN',
        'SA' => 'VAT Number',
    ];

    /**
     * @return array{tax_amount_cents: int, tax_rate_bps: int, tax_label: string}
     */
    public static function calculate(int $subtotalCents, CountryCode $country): array
    {
        $rateBps = self::TAX_RATES_BPS[$country->code] ?? 0;
        // Integer math: multiply first, then divide. floor() for conservative rounding.
        $taxCents = (int) floor(($subtotalCents * $rateBps) / 10000);

        return [
            'tax_amount_cents' => $taxCents,
            'tax_rate_bps' => $rateBps,
            'tax_label' => self::TAX_LABELS[$country->code] ?? '',
        ];
    }

    public static function taxIdLabel(CountryCode $country): string
    {
        return self::TAX_ID_LABELS[$country->code] ?? 'Tax ID';
    }
}
```

### 6.2 `FinancialYearResolver` (Pure Domain Service)

**File:** `Domain/SuperAdminDashboard/Billing/Services/FinancialYearResolver.php`

```php
<?php

declare(strict_types=1);

namespace Domain\SuperAdminDashboard\Billing\Services;

use DateTimeImmutable;
use Domain\Shared\ValueObjects\CountryCode;

final class FinancialYearResolver
{
    private const CALENDAR_YEAR_COUNTRIES = ['AE', 'SA'];

    /**
     * @return string FY label: '2025-26' (India) or '2026' (calendar year)
     */
    public static function resolve(DateTimeImmutable $date, CountryCode $country): string
    {
        if (in_array($country->code, self::CALENDAR_YEAR_COUNTRIES, true)) {
            return $date->format('Y');
        }

        // Indian FY: April–March
        $month = (int) $date->format('n');
        $year = (int) $date->format('Y');
        $startYear = $month >= 4 ? $year : $year - 1;
        $endYearShort = substr((string) ($startYear + 1), -2);

        return "{$startYear}-{$endYearShort}";
    }
}
```

### 6.3 Modified: `InvoiceNumber` Value Object

**File:** `Domain/SuperAdminDashboard/Billing/ValueObjects/InvoiceNumber.php`

```php
<?php

declare(strict_types=1);

namespace Domain\SuperAdminDashboard\Billing\ValueObjects;

use InvalidArgumentException;

final class InvoiceNumber
{
    /**
     * New format: INV-IN/2025-26/0001, INV-AE/2026/0001
     * Group 1: Country code (2 uppercase letters)
     * Group 2: Financial year (YYYY-YY or YYYY)
     * Group 3: Sequence (4+ digits)
     */
    private const PATTERN = '/^INV-([A-Z]{2})\/([\d]{4}(?:-\d{2})?)\/(\d{4,})$/';

    /** Legacy format from Phase 12C: INV/2025-26/0001 */
    private const LEGACY_PATTERN = '/^INV\/(\d{4}-\d{2})\/(\d{4,})$/';

    private function __construct(
        public readonly string $value,
    ) {
    }

    /** Accepts both new and legacy formats for reading existing invoices. */
    public static function fromString(string $value): self
    {
        if (!preg_match(self::PATTERN, $value) && !preg_match(self::LEGACY_PATTERN, $value)) {
            throw new InvalidArgumentException(
                "Invalid invoice number: {$value}. Expected: INV-CC/YYYY-YY/NNNN or INV-CC/YYYY/NNNN"
            );
        }

        return new self($value);
    }

    /** Build new invoice numbers — always produces the new format. */
    public static function fromComponents(string $countryCode, string $financialYear, int $sequence): self
    {
        if (!preg_match('/^[A-Z]{2}$/', $countryCode)) {
            throw new InvalidArgumentException("Invalid country code: {$countryCode}");
        }
        if (!preg_match('/^\d{4}(-\d{2})?$/', $financialYear)) {
            throw new InvalidArgumentException("Invalid financial year: {$financialYear}");
        }
        if ($sequence < 1) {
            throw new InvalidArgumentException('Sequence must be positive.');
        }

        return new self(sprintf(
            'INV-%s/%s/%s',
            $countryCode,
            $financialYear,
            str_pad((string) $sequence, 4, '0', STR_PAD_LEFT),
        ));
    }

    public function countryCode(): string
    {
        if (preg_match(self::PATTERN, $this->value, $m)) {
            return $m[1];
        }
        return 'IN'; // Legacy invoices are Indian
    }

    public function financialYear(): string
    {
        if (preg_match(self::PATTERN, $this->value, $m)) {
            return $m[2];
        }
        if (preg_match(self::LEGACY_PATTERN, $this->value, $m)) {
            return $m[1];
        }
        throw new \LogicException("Cannot extract FY from: {$this->value}");
    }

    public function sequence(): int
    {
        if (preg_match(self::PATTERN, $this->value, $m)) {
            return (int) $m[3];
        }
        if (preg_match(self::LEGACY_PATTERN, $this->value, $m)) {
            return (int) $m[2];
        }
        throw new \LogicException("Cannot extract sequence from: {$this->value}");
    }

    public function isLegacyFormat(): bool
    {
        return (bool) preg_match(self::LEGACY_PATTERN, $this->value);
    }

    public function equals(self $other): bool { return $this->value === $other->value; }
    public function toString(): string { return $this->value; }
    public function __toString(): string { return $this->value; }
}
```

### 6.4 Modified: `InvoiceNumberGeneratorInterface`

```php
// BEFORE (12C)
public function generate(): InvoiceNumber;

// AFTER (G1.5)
public function generate(CountryCode $country): InvoiceNumber;
```

### 6.5 Modified: `InvoiceEntity`

New properties (add to existing):

```php
private string $countryCode;
private int $subtotalCents;
private int $taxAmountCents;
private int $taxRateBps;
private string $taxLabel;
private ?string $stripePaymentIntentId;
private ?string $stripeCheckoutSessionId;
private ?string $gatewayProvider;
```

**Critical invariant enforced in constructor:**
```php
if ($totalAmountCents !== $subtotalCents + $taxAmountCents) {
    throw new \DomainException(
        "Invoice total ({$totalAmountCents}) must equal subtotal ({$subtotalCents}) + tax ({$taxAmountCents})"
    );
}
```

### 6.6 Modified: `TenantBillingProfileEntity`

```php
// BEFORE
private ?string $gstNumber;
public function gstNumber(): ?string { return $this->gstNumber; }

// AFTER
private ?string $taxId;
private ?string $taxIdType; // 'gstin', 'trn', 'vat'
public function taxId(): ?string { return $this->taxId; }
public function taxIdType(): ?string { return $this->taxIdType; }

// Updated snapshot
public function toSnapshotArray(): array
{
    return [
        'name' => $this->organizationName,
        'address' => $this->billingAddress,
        'tax_id' => $this->taxId,
        'tax_id_type' => $this->taxIdType,
        'email' => $this->contactEmail,
    ];
}
```

---

## 7. Infrastructure Layer Changes

### 7.1 Modified: `SequentialInvoiceNumberGenerator`

```php
public function generate(CountryCode $country): InvoiceNumber
{
    $now = $this->clock->now();
    $financialYear = FinancialYearResolver::resolve($now, $country);

    return DB::transaction(function () use ($country, $financialYear) {
        $sequence = InvoiceNumberSequenceRecord::query()
            ->lockForUpdate()
            ->firstOrCreate(
                ['country_code' => $country->code, 'financial_year' => $financialYear],
                ['last_sequence' => 0],
            );

        $sequence->last_sequence++;
        $sequence->save();

        return InvoiceNumber::fromComponents($country->code, $financialYear, $sequence->last_sequence);
    });
}
```

### 7.2 New: `SellerEntityResolver`

**File:** `Application/SuperAdminDashboard/Billing/Services/SellerEntityResolver.php`

```php
public function resolve(CountryCode $country): array
{
    $prefix = 'billing.' . strtolower($country->code) . '.';
    $settings = PlatformSettingRecord::where('key', 'like', $prefix . '%')
        ->pluck('value', 'key');

    if ($settings->isEmpty() && $country->code !== 'IN') {
        $prefix = 'billing.in.';
        $settings = PlatformSettingRecord::where('key', 'like', $prefix . '%')
            ->pluck('value', 'key');
    }

    return [
        'name' => $settings->get($prefix . 'company_name', 'EducoreOS'),
        'address' => $settings->get($prefix . 'company_address', ''),
        'tax_id' => $settings->get($prefix . 'company_tax_id', ''),
        'tax_id_type' => TaxCalculator::taxIdLabel($country),
        'email' => $settings->get($prefix . 'company_email', ''),
        'phone' => $settings->get($prefix . 'company_phone', ''),
    ];
}
```

---

## 8. Application Layer Changes

### 8.1 Modified: `GenerateInvoiceUseCase`

Updated flow:

1. Read tenant's `country_code` (from G1's `TenantEntity`)
2. Generate country-scoped invoice number via `InvoiceNumberGeneratorInterface::generate($country)`
3. Resolve seller entity via `SellerEntityResolver::resolve($country)`
4. Calculate tax via `TaxCalculator::calculate($subtotalCents, $country)`
5. Build buyer snapshot with `tax_id` (not `gst_number`)
6. Store gateway-specific payment references (Razorpay OR Stripe)
7. Construct `InvoiceEntity` with total = subtotal + tax invariant
8. Generate PDF, persist, dispatch event outside transaction

### 8.2 Modified: `GenerateInvoiceCommand` DTO

Add fields:

```php
public readonly ?string $gatewayProvider;      // 'razorpay' or 'stripe'
public readonly ?string $stripePaymentIntentId;
public readonly ?string $stripeCheckoutSessionId;
```

### 8.3 Modified: Invoice Event Listeners

Listeners that construct `GenerateInvoiceCommand` from payment events must pass gateway provider and gateway-specific IDs. The event payload (from G1's modified payment activation) should already carry this information.

---

## 9. Invoice PDF Template Changes

**File:** `resources/views/invoices/platform-invoice.blade.php`

Key changes:

1. **Currency symbol** — resolve from `$invoice->currency` (₹ / د.إ / ﷼)
2. **Tax section** — show `subtotal`, `tax_label: tax_amount`, `total`. Hide tax line if `tax_amount_cents === 0`
3. **Seller tax ID label** — use `$seller['tax_id_type']` (GSTIN / TRN / VAT Number)
4. **Buyer tax ID label** — use `$buyer['tax_id_type']`. Handle legacy snapshots that have `gst_number` key
5. **Payment gateway** — show "Razorpay" or "Stripe" with correct transaction ID
6. **Legacy buyer snapshot compatibility** — template should check for both `tax_id` and `gst_number` keys:

```php
@php
    $buyerTaxId = $buyer['tax_id'] ?? $buyer['gst_number'] ?? '';
    $buyerTaxLabel = $buyer['tax_id_type'] ?? 'GSTIN';
@endphp
```

---

## 10. What NOT to Do

- Do NOT calculate Indian GST — India tax rate stays 0% in `TaxCalculator`
- Do NOT make tax rates configurable — domain constants, not settings
- Do NOT modify existing invoice records — immutable. Old invoices keep legacy format
- Do NOT delete old `billing.company_*` keys before confirming all references updated
- Do NOT store tax rates as DECIMAL or FLOAT — basis points only
- Do NOT use `env()` in `app/`
- Do NOT compute `total_amount_cents` outside the entity — constructor enforces invariant
- Do NOT break existing `InvoiceNumber::fromString()` for legacy format values

---

## 11. Implementation Sequence

| Step | Task | Depends On |
|---|---|---|
| 1 | Create `FinancialYearResolver` + `TaxCalculator` (pure domain services) | — |
| 2 | Modify `InvoiceNumber` value object | — |
| 3 | Modify `InvoiceNumberGeneratorInterface` signature | Step 2 |
| 4 | Run migration: invoices table (tax + gateway columns) | — |
| 5 | Run migration: backfill existing invoices | Step 4 |
| 6 | Run migration: invoice_number_sequences (country_code + composite unique) | — |
| 7 | Run migration: tenant_billing_profiles (gst_number → tax_id) | — |
| 8 | Run migration: platform_settings key rename + GCC seed | — |
| 9 | Modify `TenantBillingProfileEntity` + Record | Step 7 |
| 10 | Modify `InvoiceEntity` + Record | Step 4 |
| 11 | Modify `SequentialInvoiceNumberGenerator` | Steps 1, 3, 6 |
| 12 | Create `SellerEntityResolver` | Step 8 |
| 13 | Modify `GenerateInvoiceCommand` DTO | — |
| 14 | Modify `GenerateInvoiceUseCase` | Steps 1, 10, 11, 12, 13 |
| 15 | Modify invoice event listeners | Steps 13, 14 |
| 16 | Modify invoice PDF Blade template | Step 14 |
| 17 | Update billing profile CRUD endpoints (`gst_number` → `tax_id`) | Step 9 |
| 18 | Update platform settings management (new key structure) | Step 8 |
| 19 | Grep + update ALL `gst_number` / `billing.company_*` references | Steps 7, 8 |
| 20 | Write tests | All above |
| 21 | PHPStan Level 5 pass | All above |

---

## 12. Test Requirements

### Unit Tests

- [ ] `InvoiceNumber::fromComponents()` — new format for IN, AE, SA
- [ ] `InvoiceNumber::fromString()` — accepts both legacy and new formats
- [ ] `InvoiceNumber::countryCode()` — correct for both formats (legacy returns 'IN')
- [ ] `InvoiceNumber::financialYear()` — Indian FY vs calendar year
- [ ] `InvoiceNumber::isLegacyFormat()` — correctly identifies old format
- [ ] `FinancialYearResolver` — India: Apr 1 = current year, Mar 31 = previous year start
- [ ] `FinancialYearResolver` — GCC: always calendar year
- [ ] `FinancialYearResolver` — boundary dates (Mar 31 → Apr 1; Dec 31 → Jan 1)
- [ ] `TaxCalculator` — UAE 5% on various amounts (integer math verification)
- [ ] `TaxCalculator` — Saudi 15% on various amounts
- [ ] `TaxCalculator` — India 0%
- [ ] `TaxCalculator` — edge case: 1 cent subtotal
- [ ] `InvoiceEntity` — constructor enforces `total = subtotal + tax`
- [ ] `InvoiceEntity` — rejects mismatched totals
- [ ] `TenantBillingProfileEntity::toSnapshotArray()` — outputs `tax_id` not `gst_number`
- [ ] `SellerEntityResolver` — resolves correct country keys
- [ ] `SellerEntityResolver` — falls back to India when country keys missing
- [ ] `SequentialInvoiceNumberGenerator` — correct format per country
- [ ] `SequentialInvoiceNumberGenerator` — separate sequences per country
- [ ] `SequentialInvoiceNumberGenerator` — FY rollover for both India and GCC

### Feature Tests

- [ ] UAE tenant payment → invoice with `INV-AE/2026/0001`, 5% VAT, AED, UAE seller
- [ ] Saudi tenant payment → invoice with `INV-SA/2026/0001`, 15% VAT, SAR
- [ ] India tenant payment → `INV-IN/2025-26/NNNN`, 0% tax, INR, India seller
- [ ] Stripe payment → `stripe_payment_intent_id` populated, `razorpay_*` null
- [ ] Razorpay payment → `razorpay_*` populated, `stripe_*` null
- [ ] Invoice PDF downloads with correct currency symbol and tax line
- [ ] Billing profile CRUD with `tax_id` (not `gst_number`)
- [ ] Concurrent generation same country → gapless sequence
- [ ] Concurrent generation different countries → independent sequences

### Regression Tests

- [ ] Legacy invoices (`INV/2025-26/0001`) still readable and downloadable
- [ ] All existing billing profile tests pass with renamed field
- [ ] All existing refund workflow tests pass
- [ ] All existing payment → invoice generation tests pass

### Minimum: 20–25 new tests.

---

## 13. Quality Gate — Phase G1.5 Complete

### Financial Safety Gates (BLOCKING)

- [ ] Gapless sequences per (country, FY) under concurrency
- [ ] Invoices immutable after generation
- [ ] `total = subtotal + tax` invariant enforced
- [ ] Integer arithmetic only (no float in tax chain)
- [ ] UAE VAT = 5% verified on test invoice
- [ ] Saudi VAT = 15% verified on test invoice
- [ ] India tax = 0% unchanged
- [ ] Seller/buyer snapshots frozen at generation time
- [ ] All amounts BIGINT UNSIGNED

### Architecture Gates (BLOCKING)

- [ ] PHPStan Level 5: zero new errors
- [ ] All tests pass (zero regression)
- [ ] `TaxCalculator` and `FinancialYearResolver` have zero framework imports
- [ ] Domain layer has zero `Illuminate` imports in new files
- [ ] Events dispatched outside transactions
- [ ] `ClockInterface` used for all time operations
- [ ] `env()` check: zero results in `app/`, `routes/`, `database/`

---

## 14. Risk Register

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| R-01 | `InvoiceNumber` regex change breaks existing reads | **HIGH** | Legacy pattern support. All existing tests must pass. |
| R-02 | `gst_number` → `tax_id` rename breaks code | **HIGH** | Codebase-wide grep before migration. |
| R-03 | Platform settings key rename breaks frontend | **HIGH** | Coordinate key change with frontend team. |
| R-04 | `invoice_number_sequences` unique constraint change | **MEDIUM** | Run during low-traffic. `lockForUpdate` prevents races. |
| R-05 | Old `buyer_snapshot` has `gst_number` key | **LOW** | PDF template handles both keys. Old invoices immutable. |
| R-06 | UAE entity not registered yet — seller details empty | **MEDIUM** | Invoices work with empty details (12C BR-09). Business ops task. |

---

## 15. File Manifest

### New Files

| File | Layer |
|---|---|
| `Domain/SuperAdminDashboard/Billing/Services/TaxCalculator.php` | Domain |
| `Domain/SuperAdminDashboard/Billing/Services/FinancialYearResolver.php` | Domain |
| `Application/SuperAdminDashboard/Billing/Services/SellerEntityResolver.php` | Application |
| 5 migration files | Database |
| Unit + feature test files | Tests |

### Modified Files

| File | Change |
|---|---|
| `InvoiceNumber.php` | New regex, `fromComponents` with country, legacy support |
| `InvoiceNumberGeneratorInterface.php` | `generate(CountryCode)` signature |
| `InvoiceEntity.php` | Tax fields, Stripe refs, country, total invariant |
| `TenantBillingProfileEntity.php` | `$gstNumber` → `$taxId` + `$taxIdType` |
| `SequentialInvoiceNumberGenerator.php` | Country-aware FY + sequence |
| `InvoiceRecord.php` | New column mappings |
| `InvoiceNumberSequenceRecord.php` | `country_code` column |
| `TenantBillingProfileRecord.php` | Column rename |
| `GenerateInvoiceUseCase.php` | Tax calc, seller resolution, gateway refs |
| `GenerateInvoiceCommand.php` | Gateway fields |
| Invoice event listener(s) | Gateway info forwarding |
| `platform-invoice.blade.php` | Currency, tax, gateway display |
| Billing profile HTTP requests/resources | `gst_number` → `tax_id` |
| Platform settings endpoints + frontend | New key structure |
| All tests referencing `gst_number` or `billing.company_*` | Updated names |

---

## 16. Definition of Done

Phase G1.5 is complete when:

1. Implementation plan reviewed and approved by Principal Engineer.
2. All quality gates in §13 pass.
3. Principal Engineer audit confirms zero critical or high findings.
4. End-to-end: UAE tenant payment → `INV-AE/2026/0001`, 5% VAT, AED, UAE seller on PDF.
5. End-to-end: India tenant payment → `INV-IN/2025-26/NNNN`, 0% tax, INR, India seller. Legacy compatibility confirmed.
6. Legacy invoices still downloadable with correct rendering.
7. Phase G1.5 Completion Report signed off.

---

*End of Phase G1.5 Developer Instructions*
