# UBOTZ 2.0 Locale & Internationalization Technical Specification

## Core Architecture
Locale is a foundational utility context (`TenantAdminDashboard\Locale`) that impacts the presentation layer across every other module.

## Relational Schema Constraints

### 1. Strategy Layer (`tenant_locale_settings`)
- **`tenant_id`**: Structural isolation.
- **`primary_locale`**: Default ISO-639-1 code.
- **`is_rtl`**: Boolean flag injected into the front-end layout CSS (e.g. `dir="rtl"`).

### 2. User Overrides (`users.locale`)
- Added via the `2029_200001_add_locale_to_users_table.php` migration.
- Allows for per-session language persistence.

## Key Technical Workflows

### The Localization Middleware
1. Incoming request is intercepted by `SetLocaleMiddleware`.
2. It first checks for a `User` override.
3. If not found, it falls back to the `tenant_locale_settings`.
4. It sets the Laravel `App::setLocale()` and `Carbon::setLocale()` based on the result.

## Front-end Integration
- **RTL Injection**: When `is_rtl` is true, the server-side renderer (Inertia/Blade) applies a `.rtl-enabled` class to the HTML body, triggering the CSS-logical properties (`margin-inline-start`, etc.) to flip the UI.
- **Currency Helper**: Uses the `Money` value object which reads `currency` and `locale` settings to format `price_cents` correctly.

## Tenancy & Security
Locale settings are cached at the `tenant_id` level to avoid database overhead on every stateless API request.

---

## Linked References
- Related Modules: `User`, `Blog`, `Timetable`.
