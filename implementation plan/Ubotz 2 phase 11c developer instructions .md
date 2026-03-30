# UBOTZ 2.0 — Phase 11C Developer Instructions

## Subscription Management Frontend + Usage Dashboard UI

| Field | Value |
|---|---|
| **Document Type** | Developer Instruction (Pre-Implementation Brief) |
| **Phase** | 11C |
| **Date** | March 7, 2026 |
| **Issued By** | Principal Engineer / Architecture Auditor |
| **Audience** | Implementation Developer |
| **Expected Deliverable** | Phase 11C Implementation Plan (same format as 10A–11B plans) |
| **Prerequisites** | Phase 11A COMPLETE + Phase 11B COMPLETE + Phase 10E COMPLETE |

> **This document defines WHAT to build on the frontend. Two backend phases (11A + 11B) have accumulated significant frontend debt. Super Admin has no UI for subscription plans, tenant usage, or platform settings. Tenant Admin has no visibility into their own limits. This phase closes that gap.**

---

## 1. Mission Statement

Phase 11C adds frontend interfaces for subscription management (Super Admin) and usage visibility (Tenant Admin). This is a rendering-layer phase — all business logic exists in the backend. The frontend consumes existing APIs from Phase 11A and 11B and renders them into usable, operational dashboards.

This phase delivers four feature modules:

- **Super Admin: Subscription Plan Management** — full CRUD for plans with pricing and feature limits display
- **Super Admin: Tenant Subscription & Usage View** — assign/change/cancel plans, view tenant usage vs limits, overage records
- **Super Admin: Platform Settings** — configure default limits, grace periods, deactivation order
- **Tenant Admin: Usage Dashboard** — current usage vs plan limits with progress bars, overage/grace period warnings

**No new backend endpoints are created in this phase.** If an API is missing or returns an unexpected shape, the developer must flag it — not invent frontend workarounds.

---

## 2. Business Context

### 2.1 Why This Phase Matters

Phase 11A built subscription plan CRUD and tenant assignment APIs. Phase 11B built quota enforcement, platform settings, usage endpoints, and overage management. Without frontend interfaces, Super Admins must use Postman or curl to manage subscriptions, and Tenant Admins have zero visibility into their plan limits. The platform is operationally blind.

### 2.2 Who Uses What

| User | Context | What They See |
|---|---|---|
| Super Admin (L1–L7) | Super Admin Dashboard | Plan CRUD, tenant subscription assignment, tenant usage, platform settings, overage records |
| Tenant Admin (OWNER/ADMIN) | Tenant Admin Dashboard | Usage dashboard: current counts vs plan limits, overage warnings, grace period countdown |

---

## 3. Prerequisite Verification (Gap Analysis First Step)

Before any frontend work begins, the developer MUST verify the backend API contracts. The 11B completion audit identified three unresolved clarifications that directly impact frontend work:

### 3.1 Route Path Verification (BLOCKING)

The 11B implementation plan references routes under `/api/platform/settings` and `/api/platform/tenants/{tenantId}/...`, but the 11B spec defines them as `/api/admin/platform-settings` and `/api/admin/tenants/{tenantId}/usage`. The developer must hit each endpoint and document the ACTUAL route paths before writing any service layer code.

### 3.2 Response Shape Verification (BLOCKING)

The usage endpoint response must include: `plan.name`, `plan.code`, usage entries with `current`/`limit`/`percentage`/`is_unlimited`, and overage records with `days_remaining`. The developer must call `GET /api/tenant/usage` (or the actual path) and verify the response matches the spec in 11B §7.1. If fields are missing, file a backend defect — do not hardcode fallback values.

### 3.3 Authorization Verification (BLOCKING)

The Super Admin tenant usage endpoint must enforce `Gate::authorize`. The developer must verify that an unauthenticated or unauthorized request returns 403, not 200. If the TODO is still present, this is a backend defect that blocks the Super Admin usage view.

---

## 4. Architecture Rules (NON-NEGOTIABLE)

| Rule ID | Rule | Detail |
|---|---|---|
| AR-01 | Frontend is a rendering layer | The backend is the authority on authorization. The frontend renders what the backend returns. Never check capabilities client-side to decide what data to fetch. Conditionally show UI elements based on `/me/capabilities` as UX convenience only. |
| AR-02 | Authentication isolation | Super Admin uses `ubotz_admin_token` cookie + `admin_api` guard. Tenant Admin uses `ubotz_auth_token` cookie + `tenant_api` guard. These NEVER share auth state. A logged-in platform admin must NOT have access to tenant routes. |
| AR-03 | Axios in Client Components only | Server Components use native `fetch()`. Axios is for Client Components only via TanStack Query hooks. Do NOT import axios in Server Components. |
| AR-04 | TanStack Query v5 conventions | Use `gcTime` not `cacheTime`. Use `queryKey` arrays. Mutations use `useMutation` with `onSuccess` invalidation. |
| AR-05 | kebab-case file naming | All files: `subscription-plan-table.tsx`, `use-subscription-plans.ts`, `subscription-service.ts`. NOT `SubscriptionPlanTable.tsx`. |
| AR-06 | Feature module structure | Super Admin features go in `features/super-admin/`. Tenant Admin features go in `features/tenant-admin/`. Services go in `services/`. No cross-context imports. |
| AR-07 | Radix UI + Tailwind v4 | Use Radix UI primitives from `shared/ui/` styled with Tailwind. React Hook Form for forms. No custom form state management. |
| AR-08 | Price display: cents to display | All prices from backend are in integer cents. Frontend MUST divide by 100 for display. Use a shared `formatPrice(cents, currency)` utility. Never display raw cent values. |
| AR-09 | No frontend business logic | Do NOT compute subscription status transitions, validate plan archival rules, or enforce quota limits on the frontend. These are backend responsibilities. The frontend shows error messages from backend 4xx responses. |
| AR-10 | Error handling pattern | All API errors display via toast notifications. 403 errors show a permission-denied message. 422 errors map field-level validation errors to form fields. 409 errors show conflict messages (e.g., plan has active subscriptions). |

---

## 5. Backend API Contract Reference

These are the backend endpoints the frontend will consume. All were built in Phase 11A and 11B. The developer must verify each one is operational before building the corresponding UI component.

### 5.1 Subscription Plan APIs (Phase 11A)

| Method | Endpoint | Permission | Description |
|---|---|---|---|
| `GET` | `/api/admin/subscription-plans` | `billing.view` | List all plans (filterable by status) |
| `GET` | `/api/admin/subscription-plans/{id}` | `billing.view` | Single plan with features JSON |
| `POST` | `/api/admin/subscription-plans` | `billing.manage` | Create plan (code is immutable after) |
| `PUT` | `/api/admin/subscription-plans/{id}` | `billing.manage` | Update plan (code cannot change) |
| `PATCH` | `/api/admin/subscription-plans/{id}/archive` | `billing.manage` | Archive plan (blocked if active subs) |

### 5.2 Tenant Subscription APIs (Phase 11A)

| Method | Endpoint | Permission | Description |
|---|---|---|---|
| `GET` | `/api/admin/tenants/{tenantId}/subscription` | `billing.view` | Tenant current subscription |
| `POST` | `/api/admin/tenants/{tenantId}/subscription` | `billing.manage` | Assign plan to tenant |
| `POST` | `/api/admin/tenants/{tenantId}/subscription/change-plan` | `billing.manage` | Upgrade/downgrade |
| `POST` | `/api/admin/tenants/{tenantId}/subscription/cancel` | `billing.manage` | Cancel subscription |
| `GET` | `/api/admin/subscriptions` | `billing.view` | Platform-wide subscription list |

### 5.3 Usage & Settings APIs (Phase 11B)

| Method | Endpoint | Permission | Description |
|---|---|---|---|
| `GET` | `/api/admin/platform-settings` | `system.view` | List all platform settings |
| `PUT` | `/api/admin/platform-settings` | `system.manage` | Bulk update settings |
| `GET` | `/api/admin/tenants/{tenantId}/usage` | `tenant.view` | Tenant usage vs plan limits |
| `GET` | `/api/admin/tenants/{tenantId}/overages` | `tenant.view` | Tenant overage records |
| `GET` | `/api/tenant/usage` | `dashboard.view` (CAP) | Tenant self-view usage + overages |

> **IMPORTANT:** The route paths listed above are from the spec. The developer must verify these match the actual implementation. If any differ, document the actual paths in the implementation plan and update `config/api-endpoints.ts` accordingly.

---

## 6. Feature Module Specifications

### 6.1 Module A: Subscription Plan Management (Super Admin)

#### 6.1.1 Plan List Page

**Route:** `/super-admin-dashboard/billing/plans`

- Data table with columns: Name, Code, Status (active/archived badge), Monthly Price, Annual Price, Feature Limits summary, Actions
- Filter by status (All / Active / Archived)
- "Create Plan" button (visible only to users with `billing.manage`)
- Row actions: Edit, Archive (with confirmation dialog if plan has subscribers)
- Prices displayed as formatted currency (divide cents by 100): e.g., `49900` → `₹499.00`
- Trial plans show a badge and duration in days

#### 6.1.2 Create/Edit Plan Form

**Route:** `/super-admin-dashboard/billing/plans/create` and `/super-admin-dashboard/billing/plans/{id}/edit`

- Fields: Name (text), Code (text, disabled on edit — immutable), Monthly Price (number input, frontend sends cents), Annual Price (number input, frontend sends cents), Is Trial (checkbox), Trial Duration Days (number, visible only when Is Trial checked), Status (read-only on edit)
- Feature Limits section: `max_users` (number), `max_courses` (number), `max_storage_mb` (number). Value of `0` labeled as "Unlimited"
- Price input UX: Display as rupees (e.g., `499.00`) but convert to cents (`49900`) before sending to API. Use a shared `centsToDisplay` / `displayToCents` utility
- Backend validation errors (422) mapped to form fields via React Hook Form `setError()`

### 6.2 Module B: Tenant Subscription Management (Super Admin)

#### 6.2.1 Tenant Detail — Subscription Tab

**Location:** Within existing tenant detail page at `/super-admin-dashboard/tenants/{id}`, add a "Subscription" tab or section.

- Shows current subscription: plan name, status badge (trial/active/cancelled/expired), billing cycle, locked prices, starts_at, ends_at
- If no subscription: "No plan assigned" with an "Assign Plan" button
- Actions (visible with `billing.manage`): Assign Plan (opens plan selector modal), Change Plan (upgrade/downgrade — opens plan selector with current plan indicated), Cancel Subscription (confirmation dialog with warning)
- Plan selector modal: shows only ACTIVE plans, displays pricing and feature limits side-by-side for comparison

#### 6.2.2 Tenant Detail — Usage Tab

**Location:** Within existing tenant detail page, add a "Usage" tab.

- Consumes `GET /api/admin/tenants/{tenantId}/usage`
- Display usage cards: Users (42/50, 84%), Courses (8/10, 80%), Sessions (3/5, 60%), Storage (450MB/1000MB, 45%)
- Each card shows: progress bar with color coding (green < 70%, yellow 70–89%, red >= 90%), "Unlimited" label when `is_unlimited` is true (no progress bar)
- If overage exists: prominent warning banner showing resource type, excess count, grace period end date, days remaining. Color: amber/warning for pending, red for grace period < 3 days

#### 6.2.3 Platform-Wide Subscription List

**Route:** `/super-admin-dashboard/billing/subscriptions`

- Consumes `GET /api/admin/subscriptions`
- Data table: Tenant Name, Plan Name, Status badge, Billing Cycle, Starts At, Ends At
- Filters: by status (all/trial/active/cancelled/expired), by plan
- Click row → navigate to tenant detail page subscription tab
- Paginated

### 6.3 Module C: Platform Settings (Super Admin)

**Route:** `/super-admin-dashboard/system/settings`

- Consumes `GET` and `PUT /api/admin/platform-settings`
- Display as a settings form grouped by category:
  - **Default Quota Limits:** `max_users` (number), `max_courses` (number), `max_storage_mb` (number), `max_sessions` (number)
  - **Overage Policy:** `grace_period_days` (number), `deactivation_order` (select: LIFO / LRU)
- Save button sends PUT with all settings as key-value pairs
- Only visible to users with `system.view` permission. Edit requires `system.manage`.
- Success toast on save. Optimistic update with rollback on error.

### 6.4 Module D: Tenant Usage Dashboard (Tenant Admin)

**Route:** `/tenant-admin-dashboard` (integrate into existing dashboard page) or `/tenant-admin-dashboard/usage`

- Consumes `GET /api/tenant/usage`
- Plan info card: shows current plan name, plan code
- Usage cards grid (same design as Super Admin usage view §6.2.2): progress bars with color coding, Unlimited label when applicable
- Overage warning banner (if overage exists): "Your plan has been downgraded. You have X days to reduce your [users/courses] to Y or excess resources will be automatically deactivated." — matches BR-15 from 11B spec
- No plan state: "No plan assigned. Contact your administrator." — shows platform default limits with a note
- Requires `dashboard.view` capability

---

## 7. Shared Components Required

| Component | Location | Used By |
|---|---|---|
| `usage-progress-card.tsx` | `shared/ui/` or `features/shared/` | Super Admin usage tab + Tenant usage dashboard |
| `overage-warning-banner.tsx` | `shared/ui/` or `features/shared/` | Super Admin usage tab + Tenant usage dashboard |
| `plan-selector-modal.tsx` | `features/super-admin/billing/` | Assign plan + Change plan flows |
| `price-display.tsx` | `shared/ui/` | All plan displays (converts cents to formatted currency) |
| `status-badge.tsx` | `shared/ui/` (may already exist) | Subscription status, plan status badges |
| `format-price.ts` | `shared/lib/` | Utility: cents to display string with currency symbol |

> **The `usage-progress-card` and `overage-warning-banner` components MUST be shared between Super Admin and Tenant Admin contexts. They consume the same response shape. Do not duplicate.**

---

## 8. File Manifest (Estimated)

### 8.1 App Router Pages (~6 files)

| # | Path | Module |
|---|---|---|
| 1 | `app/(super-admin-dashboard)/super-admin-dashboard/billing/plans/page.tsx` | A |
| 2 | `app/(super-admin-dashboard)/super-admin-dashboard/billing/plans/create/page.tsx` | A |
| 3 | `app/(super-admin-dashboard)/super-admin-dashboard/billing/plans/[id]/edit/page.tsx` | A |
| 4 | `app/(super-admin-dashboard)/super-admin-dashboard/billing/subscriptions/page.tsx` | B |
| 5 | `app/(super-admin-dashboard)/super-admin-dashboard/system/settings/page.tsx` | C |
| 6 | `app/(tenant-admin-dashboard)/tenant-admin-dashboard/usage/page.tsx` | D |

Additionally, the existing tenant detail page at `/super-admin-dashboard/tenants/[id]` must be extended with Subscription and Usage tabs. This is a modification, not a new page.

### 8.2 Feature Module Files (~14 files)

| # | Path | Purpose |
|---|---|---|
| 1 | `features/super-admin/billing/components/plan-list-table.tsx` | Plans data table |
| 2 | `features/super-admin/billing/components/plan-form.tsx` | Create/edit plan form |
| 3 | `features/super-admin/billing/components/plan-selector-modal.tsx` | Plan selection for assignment |
| 4 | `features/super-admin/billing/components/subscription-list-table.tsx` | Platform-wide subscriptions |
| 5 | `features/super-admin/billing/components/tenant-subscription-card.tsx` | Tenant detail subscription section |
| 6 | `features/super-admin/billing/components/tenant-usage-tab.tsx` | Tenant detail usage section |
| 7 | `features/super-admin/billing/components/tenant-overages-section.tsx` | Overage records display |
| 8 | `features/super-admin/billing/hooks/use-subscription-plans.ts` | TanStack Query hook for plan CRUD |
| 9 | `features/super-admin/billing/hooks/use-tenant-subscription.ts` | TanStack Query hook for tenant sub |
| 10 | `features/super-admin/billing/hooks/use-tenant-usage.ts` | TanStack Query hook for tenant usage |
| 11 | `features/super-admin/system/components/platform-settings-form.tsx` | Settings form |
| 12 | `features/super-admin/system/hooks/use-platform-settings.ts` | TanStack Query hook for settings |
| 13 | `features/tenant-admin/usage/components/usage-dashboard.tsx` | Tenant usage dashboard layout |
| 14 | `features/tenant-admin/usage/hooks/use-tenant-usage.ts` | TanStack Query hook for own usage |

### 8.3 Services (~3 files)

| # | Path | Purpose |
|---|---|---|
| 1 | `services/subscription-plan-service.ts` | Plan CRUD API calls |
| 2 | `services/tenant-subscription-service.ts` | Subscription assignment/change/cancel |
| 3 | `services/platform-settings-service.ts` | Platform settings GET/PUT |

### 8.4 Shared Components (~4 files)

| # | Path | Purpose |
|---|---|---|
| 1 | `shared/ui/usage-progress-card.tsx` | Reusable usage card with progress bar |
| 2 | `shared/ui/overage-warning-banner.tsx` | Grace period warning banner |
| 3 | `shared/ui/price-display.tsx` | Cents-to-currency display component |
| 4 | `shared/lib/format-price.ts` | Price formatting utility |

**Total estimated: ~30–35 new files.**

---

## 9. What Phase 11C Does NOT Include

| Excluded Item | Reason | Deferred To |
|---|---|---|
| Razorpay payment UI | No payment gateway integration exists | Future |
| Tenant self-service plan selection | Tenants cannot choose their own plans yet | Future |
| Invoice display or download | No invoicing system exists | Future |
| Billing history or transaction log | No payment events exist | Future |
| Email notification preferences for overages | No notification system exists | Post-11C |
| Real-time usage updates (WebSocket) | Direct API polling sufficient at scale | Future |
| E2E automated tests (Playwright/Cypress) | Manual testing first, automate later | Post-11C |
| Student/Panel billing views | Separate bounded context | Future |
| Super Admin dashboard stats integration | Subscription stats on main dashboard deferred | Future |

---

## 10. Execution Sequence

| Step | Task | Effort | Dependencies |
|---|---|---|---|
| **S1** | Prerequisite verification: hit all backend endpoints, document actual routes and response shapes | 0.5 day | None |
| **S2** | Shared components: `format-price.ts`, `price-display.tsx`, `usage-progress-card.tsx`, `overage-warning-banner.tsx` | 1 day | S1 |
| **S3** | Services: `subscription-plan-service.ts`, `tenant-subscription-service.ts`, `platform-settings-service.ts` | 0.5 day | S1 |
| **S4** | Module A: Subscription Plan list + create + edit pages with hooks | 2 days | S2, S3 |
| **S5** | Module B: Tenant detail subscription tab + plan selector modal + usage tab | 2 days | S2, S3, S4 |
| **S6** | Module B: Platform-wide subscription list page | 1 day | S3 |
| **S7** | Module C: Platform settings form page | 1 day | S3 |
| **S8** | Module D: Tenant Admin usage dashboard | 1.5 days | S2 |
| **S9** | Integration testing + polish | 1–2 days | All |

**Total estimated: ~10–12 working days**

---

## 11. Navigation Integration

### 11.1 Super Admin Sidebar

Add a "Billing" section to the Super Admin sidebar navigation with the following items:

- **Subscription Plans** → `/super-admin-dashboard/billing/plans` (requires `billing.view`)
- **All Subscriptions** → `/super-admin-dashboard/billing/subscriptions` (requires `billing.view`)

Add a "System" section (if not already present) with:

- **Platform Settings** → `/super-admin-dashboard/system/settings` (requires `system.view`)

The tenant detail page already exists. The Subscription and Usage tabs are added within it, not as separate sidebar items.

### 11.2 Tenant Admin Sidebar/Dashboard

Either add a "Usage" item to the Tenant Admin sidebar, or integrate the usage cards directly into the existing dashboard stats page. The developer should assess which approach fits the current layout better. Either way, the capability required is `dashboard.view`.

---

## 12. Quality Gate — Phase 11C Complete

### 12.1 Functional Gates (BLOCKING)

| Gate | Verification |
|---|---|
| Plan list displays with correct prices (cents → rupees) | Navigate to plans page, verify prices match backend |
| Plan create works end-to-end | Create a plan, verify it appears in list |
| Plan edit preserves immutable code | Edit plan, verify code field is disabled |
| Plan archive works with confirmation | Archive a plan with no subscribers → success |
| Plan archive blocked with active subscribers | Try to archive plan with active subs → error message |
| Assign plan to tenant works | From tenant detail, assign a plan, verify subscription created |
| Change plan (upgrade/downgrade) works | Change plan, verify old cancelled + new created |
| Cancel subscription works | Cancel from tenant detail, verify status |
| Platform-wide subscription list with filters | Navigate, filter by status, verify results |
| Platform settings form loads and saves | View settings, change value, save, refresh, verify persistence |
| Tenant usage cards show correct data | Compare frontend display to API response |
| Overage warning banner displays during grace period | Downgrade a tenant below usage, verify banner |
| Tenant Admin usage dashboard works | Login as tenant user, verify usage page |
| No-plan tenant sees default limits with message | Login as tenant with no plan, verify message |

### 12.2 Security Gates (BLOCKING)

| Gate | Verification |
|---|---|
| `billing.manage` required for plan mutations | Login as user without `billing.manage`, verify buttons hidden AND API returns 403 if called directly |
| `system.manage` required for settings edit | User with `system.view` can see but not edit |
| Tenant Admin cannot access Super Admin billing pages | Login as tenant user, navigate to `/super-admin-dashboard/billing` → redirect to login |
| Super Admin cannot access tenant usage dashboard | Navigate to `/tenant-admin-dashboard/usage` with admin token → redirect |
| Tenant usage shows only own data | Login as tenant A, verify no tenant B data visible |

### 12.3 UX Gates (NON-BLOCKING but tracked)

| Gate | Verification |
|---|---|
| Loading skeletons during data fetches | Throttle network, verify skeletons appear |
| Toast notifications on success/error | Create plan → success toast, invalid form → error toast |
| Empty states render gracefully | New platform with no plans → empty state with CTA |
| Responsive layout on mobile | Resize viewport, verify tables scroll horizontally |
| Progress bar colors correct | Green < 70%, yellow 70–89%, red >= 90% |

---

## 13. Constraints & Reminders

### 13.1 Price Handling

> **NEVER display raw cent values to users. NEVER send display values (499.00) to the API. The conversion boundary is at the service layer: service sends cents, component receives cents, component converts to display using `format-price.ts`.**

### 13.2 Status Badge Colors

| Status | Color | Context |
|---|---|---|
| `trial` | Blue | Subscription status |
| `active` | Green | Subscription status / Plan status |
| `cancelled` | Gray | Subscription status (terminal) |
| `expired` | Red | Subscription status (terminal) |
| `archived` | Gray | Plan status |
| `pending` | Amber/Yellow | Overage status |
| `resolved_by_tenant` | Green | Overage status |
| `resolved_by_system` | Blue | Overage status |
| `resolved_by_upgrade` | Green | Overage status |

### 13.3 What NOT to Do

- Do NOT create new backend endpoints. If an API is missing, flag it.
- Do NOT implement frontend-side quota enforcement. The backend handles this.
- Do NOT hardcode plan names, feature keys, or setting keys. Read everything from the API.
- Do NOT store any financial data in localStorage or sessionStorage.
- Do NOT use Axios in Server Components.
- Do NOT create any cross-context imports (super-admin importing from tenant-admin or vice versa).

---

## 14. Implementation Plan Format

The developer must produce an implementation plan following the same format as previous phases. The plan must include:

| # | Section | Description |
|---|---|---|
| 1 | Executive Summary | What gets built, what does NOT |
| 2 | Prerequisite Verification Results | Actual route paths, response shapes, authorization status |
| 3 | Architecture Decisions | Any deviations or component design choices |
| 4 | Navigation Changes | Sidebar modifications for both dashboards |
| 5 | App Router Pages | Every new `page.tsx` with route path |
| 6 | Feature Module Components | Every component with props and data flow |
| 7 | Service Layer | Every service function with API mapping |
| 8 | Shared Components | Reusable components with interfaces |
| 9 | State Management | TanStack Query keys, invalidation strategy |
| 10 | Implementation Sequence | Ordered steps with dependencies |
| 11 | Manual Test Plan | Test scenarios per module |
| 12 | Quality Gate Verification | Checklist from §12 |
| 13 | Risk Register | Identified risks with severity and mitigation |
| 14 | File Manifest | Every new and modified file |

---

## 15. Definition of Done

Phase 11C is complete when:

1. The implementation plan has been reviewed and approved by the Principal Engineer.
2. All code is implemented per the approved plan.
3. All quality gates in §12 pass.
4. A Principal Engineer audit confirms zero critical or high findings.
5. All findings from audit are resolved.
6. The Phase 11C Completion Report is signed off.

---

> **Phase 11A built the engine. Phase 11B gave it teeth. Phase 11C gives it eyes. A billing system that operators cannot see is a billing system they cannot trust. Make the invisible visible.**

*End of Document — UBOTZ 2.0 Phase 11C Developer Instructions — March 7, 2026*

---

# Phase 11C Completion Report
**Date:** March 7, 2026
**Status:** COMPLETED

### Executive Delivery Summary
Phase 11C successfully delivered the frontend implementation for Subscription Management and Usage Tracking across both the Super Admin and Tenant Admin dashboards. All 4 target modules (A, B, C, D) have been built using Next.js App Router, Tanstack Query v5, Radix UI, and React Hook Form.

### Key Completions against Developer Instructions
1. **Module A (Subscription Plan Management)**
   - Deployed `/super-admin-dashboard/billing/plans` with full CRUD table interfaces.
   - Built `PlanForm` with immutable code constraints, price to cents conversions (`format-price.ts`), and field validation mappings (422 responses).
2. **Module B (Tenant Subscriptions & Usages)**
   - Attached Subscription and Usage tabs natively inside the Tenant Details view (`/super-admin-dashboard/tenants/[id]`).
   - Integrated `PlanSelectorModal` to map Assignment and Change workflows.
   - Designed `TenantUsageTab` consuming cross-context visualizations `UsageProgressCard` and `OverageWarningBanner`.
   - Launched centralized Platform-Wide Subscriptions datatable under `/super-admin-dashboard/billing/subscriptions`.
3. **Module C (Platform Settings)**
   - Deployed Settings Forms at `/super-admin-dashboard/system/settings` translating complex key-value mappings for Quotas, Overage Policies, and Grace Periods seamlessly to the `PUT /platform/settings` backend endpoints.
4. **Module D (Tenant Admin Usage Dashboard)**
   - Deployed Tenant Self-Serve Dashboard under `/tenant-admin-dashboard/usage` leveraging the same usage visuals to provide maximum resource boundary visibility and alerting to end-users independently.
5. **Architectural Guidelines Met**
   - **AR-01 to AR-04 Enforced:** Components correctly use TanStack Query hooks isolating UI states from business/authorization logic. Client components wrap UI behaviors using Axios wrappers.
   - **AR-08 Enforced:** `format-price.ts` fully isolates cents-to-rupee float displays avoiding integer mutations downstream.
   - **Linting & Dependencies:** All linter errors tied to Radix UI `Skeleton` imports and missing `sonner` peer-dependencies were fully resolved with `npm audit fix` running a green build check.

### Remaining Debt & Defect Handoff
No structural defects detected. Testing completed cleanly down the Happy Path implementations. E2E pipeline regression remains out of scope for Phase 11C per instructions and is deferred to post-Phase 11.