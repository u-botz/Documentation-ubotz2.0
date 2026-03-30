# UBOTZ 2.0 — User (tenant directory) — Technical Specification

## Scope

CRUD and extended profile for **users inside a tenant** (students, instructors, admins): export, verification, impersonation hooks, financial toggles, subscription enrollments, education/experience/occupations, extended profile. Routes: `backend/routes/tenant_dashboard/users.php` → **`/api/tenant/users`**.

## Capabilities

From `TenantCapabilitySeeder`:

| Capability | Typical routes |
|------------|----------------|
| `user.view` | List, stats, show, export, subscriptions index, education/experience/occupations read |
| `user.manage` | Create, update, toggle status, soft delete, verify, hard delete, impersonate, accept instructor request, financial patches, subscription grant/revoke, profile writes |

**Note:** `user.invite` exists in the seeder; this file uses **`user.manage`** for several admin actions—align product docs with actual route middleware.

## HTTP map (summary)

Under `Route::prefix('users')`:

| Area | Examples |
|------|----------|
| Core | `GET/POST /users`, `GET/PUT/PATCH/DELETE /users/{id}`, `GET /export`, `GET /stats` |
| Safety | `PATCH .../toggle-status`, `PATCH .../verify`, `DELETE .../permanent` |
| Support | `POST .../impersonate`, `POST .../instructor-requests/accept` |
| Financial | `PATCH .../cashback-toggle`, `.../registration-bonus/disable`, `.../installment-approval` |
| Subscriptions | `GET/POST /users/{id}/subscriptions`, `DELETE .../subscriptions/{enrollmentId}` |
| Profile satellites | `.../education`, `.../experience`, `.../occupations`, `PUT .../extended-profile` |

Controllers live under `App\Http\TenantAdminDashboard\User\` and `App\Http\Controllers\Api\TenantAdminDashboard\User\`.

## Persistence (tenant)

`users` and related tables (e.g. education/experience) live in the **tenant** database; `tenant_id` + unique email per tenant are standard invariants—see migrations such as `2026_02_22_000001_create_users_table.php` and follow-ups.

## Frontend

`frontend/config/api-endpoints.ts` — **`TENANT_USER`** aggregates many of the paths above (including instructor requests and extended profile URLs used by the SPA).

---

## Linked references

- **Roles** — `user_role_assignments` determines effective capabilities
- **Tenant provisioning** — creates the initial owner user on the platform side
