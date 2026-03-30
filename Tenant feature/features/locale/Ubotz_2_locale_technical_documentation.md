# UBOTZ 2.0 — Locale & RTL — Technical Specification

## Scope

Tenant default language, per-user locale preference, and RTL availability when the subscription includes the RTL UI module. Implemented under `App\Application\TenantAdminDashboard\Locale\` and `App\Http\Controllers\Api\Tenant\TenantLocaleController`.

## Route entry point

| File | Effective paths (prefix `/api/tenant`) |
|------|----------------------------------------|
| `backend/routes/tenant_dashboard/locale.php` | See below |

Routes are registered inside the authenticated tenant group in `backend/routes/api.php` (middleware includes `tenant.resolve.token`, `auth:tenant_api`, `tenant.active`, `ensure.user.active`, `tenant.session`, `tenant.timezone`, `throttle:tenant_api`).

| Method | Path | Controller action |
|--------|------|-------------------|
| `GET` | `/locale-settings` | `TenantLocaleController::show` |
| `PUT` | `/locale-settings` | `TenantLocaleController::update` |
| `PATCH` | `/me/locale` | `TenantLocaleController::patch` |

**Full URLs:** `/api/tenant/locale-settings`, `/api/tenant/me/locale`.

## Capabilities and entitlements

From `TenantCapabilitySeeder` (representative):

| Key | Role |
|-----|------|
| `locale.settings.manage` | Required to change **tenant default** locale (in addition to being **tenant owner** — enforced in `UpdateTenantDefaultLocaleUseCase`) |
| `rtl.ui` | Required for a user to select **Arabic (`ar`)** as their locale when RTL is enabled |

**Subscription module:** `ModuleCode::FEATURE_RTL_UI` (`feature.rtl_ui`) must be entitled for: updating tenant default to `ar`, or setting user locale to `ar`. The `show` action exposes `rtl_enabled` from entitlements and syncs `tenant_locale_settings.rtl_enabled` when it drifts.

**Supported locales (current implementation):** `en`, `ar` only — validated in both update use cases.

## Application use cases

| Use case | Purpose |
|----------|---------|
| `UpdateTenantDefaultLocaleUseCase` | Owner-only; checks `locale.settings.manage`, RTL module, and `rtl.ui` when default is `ar`; upserts `tenant_locale_settings`; audits |
| `UpdateUserLocaleUseCase` | Current user updates `users.locale`; Arabic requires RTL module + `rtl.ui`; audits; controller sets `TenantLocaleCookie` on `PATCH /me/locale` |

## Persistence (tenant DB)

| Migration | Table / change |
|-----------|----------------|
| `2026_03_29_200001_add_locale_to_users_table.php` | `users.locale` (per-user preference) |
| `2026_03_29_200002_create_tenant_locale_settings_table.php` | `tenant_locale_settings`: `tenant_id` (unique), `default_locale` (string, default `en`), `rtl_enabled` (bool) |

Column names are **`default_locale`** and **`rtl_enabled`**, not `primary_locale` / `is_rtl`.

## Related runtime behavior

- **`tenant.timezone` middleware** (`AttachTenantTimezoneToRequest`) attaches tenant timezone context for API consumers; it is separate from language locale.
- There is **no** dedicated `SetLocaleMiddleware` in the route stack for these APIs; the SPA reads API payloads and cookies for display language.

## Frontend references

- `frontend/services/locale-settings-service.ts` — `GET`/`PUT` `/api/tenant/locale-settings`
- `frontend/shared/hooks/use-language-switch.ts` — `PATCH /api/tenant/me/locale`

---

## Linked references

- **Meeting / Timetable** — time display uses tenant timezone; copy uses locale when translated in the client
- **Roles** — owner vs other roles for default language changes
