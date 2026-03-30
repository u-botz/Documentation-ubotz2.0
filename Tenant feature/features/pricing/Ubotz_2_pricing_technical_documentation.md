# UBOTZ 2.0 — Pricing (Tickets & special offers) — Technical Specification

## Scope

Per-**course** discount **tickets** (coupon-style) and time-bounded **special offers**, implemented in the Course/Pricing application layer and exposed under a dedicated URL prefix (not nested under `/courses/{id}/...` for all actions).

## Route entry point

| File | Location in file |
|------|------------------|
| `backend/routes/tenant_dashboard/course.php` | `Route::prefix('pricing')->group(...)` inside `Route::middleware('tenant.module:module.lms')->group(...)` |

**Base path:** `/api/tenant/pricing` (with global `/api/tenant` prefix).

**Capability middleware:** The `pricing` group does **not** add `tenant.capability:*` in the route file; access relies on **`module.lms`** and controller/context behavior. Tighten with policies if product requires role-based separation.

## HTTP map

| Area | Methods | Path pattern |
|------|---------|----------------|
| Tickets | GET, POST | `/pricing/courses/{courseId}/tickets` |
| Tickets | PUT, DELETE | `/pricing/tickets/{id}` |
| Tickets | POST | `/pricing/courses/{courseId}/tickets/validate` |
| Special offers | GET, POST | `/pricing/courses/{courseId}/special-offers` |
| Special offers | PUT, DELETE | `/pricing/special-offers/{id}` |

Controllers:

- `App\Http\TenantAdminDashboard\Course\Controllers\TicketController`
- `App\Http\TenantAdminDashboard\Course\Controllers\SpecialOfferController`

## Application layer (examples)

**Tickets:** `ListCourseTicketsQuery`, `CreateTicketUseCase`, `UpdateTicketUseCase`, `DeleteTicketUseCase` (commands in `Course\Commands\`).

**Special offers:** `ListCourseSpecialOffersQuery`, `CreateSpecialOfferUseCase`, `UpdateSpecialOfferUseCase`, `DeleteSpecialOfferUseCase`.

Domain repositories live under `App\Domain\TenantAdminDashboard\Pricing\Repositories\` (e.g. `TicketRepositoryInterface`).

## Persistence (tenant)

Initial tables: `backend/database/migrations/tenant/2026_03_05_180000_create_pricing_tables.php`

| Table | Purpose |
|-------|---------|
| `tickets` | Course-scoped ticket: title, integer `discount`, `start_date` / `end_date`, `capacity`, `used_count` |
| `special_offers` | Course offer: `percent`, `from_date` / `to_date`, `status` active/inactive |
| `ticket_users` | Ticket redemption rows (legacy name in early migration) |

Later migrations extend behavior (e.g. **`ticket_user_groups`** `2026_03_09_162754_...`, **`allowed_group_ids`** on tickets `2026_03_17_105341_...`, **`special_offer_user_groups`** `2026_03_09_162758_...`) for targeting **user groups**.

> Naming: tables are **`tickets`** / **`special_offers`**, not `discount_tickets` / generic “offers only” without course FK—always scope by tenant context in repositories.

## Frontend

`frontend/config/api-endpoints.ts` → **`TENANT_COURSE`**: `COURSE_TICKETS`, `TICKET_DETAIL`, `VALIDATE_TICKET`, `COURSE_OFFERS`, `OFFER_DETAIL` (paths match the routes above).

---

## Linked references

- **Course** — offers attach to `course_id`
- **Payment** — checkout consumes pricing outcome where integrated
- **User groups** — optional eligibility for tickets/offers
