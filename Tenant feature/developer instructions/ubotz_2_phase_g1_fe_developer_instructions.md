# Phase G1-FE — Frontend Stripe Checkout Flow

## Developer Instructions

**Document Version:** 1.0
**Date:** 2026-03-27
**Author:** Principal Engineer (Claude)
**Phase Dependency:** Requires Phase G1 COMPLETE (Stripe backend, gateway_provider on responses)
**Target:** Antigravity Implementation Team

---

## 1. Executive Summary

### What Gets Built

Phase G1-FE adds Stripe checkout support to the Super Admin dashboard frontend. The backend (G1) already returns `gateway_provider` and `checkout_data` in plan assignment responses. This phase makes the frontend branch its payment flow based on that field:

1. **Gateway-aware checkout branching** — When `gateway_provider === 'stripe'`, redirect to Stripe Checkout URL instead of opening the Razorpay inline modal.
2. **Stripe success page** — `/super-admin-dashboard/payment/success` receives the redirect from Stripe, extracts `session_id`, polls the backend for subscription activation status.
3. **Stripe cancel page** — `/super-admin-dashboard/payment/cancel` shows a "Payment cancelled" message with a retry option.
4. **Payment status polling** — The success page polls `GET /api/admin/tenants/{tenantId}/subscription/payment-status` at intervals until the subscription transitions from `pending_payment` to `active` (webhook-driven activation).
5. **Currency display** — Plan assignment UI shows amounts in the tenant's configured currency (AED/SAR/INR), not hardcoded INR.

### What Does NOT Get Built

| Excluded Item | Reason | Deferred To |
|---|---|---|
| Tenant → Student Stripe checkout | G1 is platform billing only | Phase G2 |
| Stripe Elements (embedded card form) | Using Stripe Checkout (hosted page) — simpler, PCI-compliant | Future if needed |
| Webhook status push via WebSocket | Polling is sufficient for Super Admin flow | Future |
| Tenant Admin payment UI changes | No tenant-level Stripe yet | Phase G2 |
| Student-facing Stripe payments | Out of scope | Phase G2 |

### Why This Is Frontend-Only

Phase G1 already built:
- `StripePaymentGateway::createOrder()` → returns `checkout_url` and `session_id`
- `POST /api/webhooks/stripe` → processes `checkout.session.completed`
- `GET /api/admin/tenants/{tenantId}/subscription/payment-status` → returns current status
- Plan assignment response includes `gateway_provider`, `checkout_data.checkout_url`, `checkout_data.session_id`

No new backend endpoints or domain changes are needed. This phase is purely about the frontend consuming the G1 API contract.

---

## 2. Current Frontend Architecture (What Exists)

### 2.1 Plan Assignment Flow

| Component | File | Role |
|---|---|---|
| `ProvisionTenantDialog` | `provision-tenant-form.tsx` | Initial tenant creation + plan assignment |
| `PlanSelectorModal` | `plan-selector-modal.tsx` | Plan change for existing tenants |
| `TenantSubscriptionPanel` | `tenant-subscription-panel.tsx` | Subscription management + payment retry |
| `openPlatformRazorpayCheckout` | `razorpay-platform-checkout.ts` | Loads Razorpay SDK, opens inline modal |

### 2.2 Current Payment Flow (Razorpay)

```
1. Super Admin selects plan + billing cycle
2. Frontend calls backend (assign subscription)
3. Backend returns { status: "pending_payment", checkout_data: { key_id, order_id, amount, currency } }
4. Frontend calls openPlatformRazorpayCheckout(checkout_data)
5. Razorpay SDK loads checkout.js, opens inline modal
6. User completes payment in modal
7. Modal closes, toast shown: "Payment submitted, awaiting confirmation"
8. Backend webhook activates subscription asynchronously
```

### 2.3 Existing Redirect Pattern

`use-checkout.ts` already has a `handleCourseCheckout` function that redirects to a `checkout_url` if provided. This pattern can be adapted for Stripe, but the platform subscription flow currently doesn't use it.

---

## 3. Target Payment Flow (Gateway-Branched)

### 3.1 Razorpay Flow (Unchanged)

```
Backend response: { gateway_provider: "razorpay", checkout_data: { key_id, order_id, amount, currency } }
→ Frontend opens Razorpay inline modal (existing behavior, zero changes)
```

### 3.2 Stripe Flow (New)

```
Backend response: {
    gateway_provider: "stripe",
    checkout_data: {
        checkout_url: "https://checkout.stripe.com/c/pay/cs_xxx",
        session_id: "cs_xxx"
    }
}
→ Frontend redirects browser to checkout_url
→ User completes payment on Stripe's hosted page
→ Stripe redirects to /super-admin-dashboard/payment/success?session_id=cs_xxx
→ Success page extracts session_id, polls backend for activation status
→ Once active, shows confirmation + link back to tenant detail
```

### 3.3 Branching Logic

The branch point is in the plan assignment response handler — wherever `openPlatformRazorpayCheckout` is currently called:

```typescript
// BEFORE (Razorpay only)
if (response.checkout_data) {
    openPlatformRazorpayCheckout(response.checkout_data);
}

// AFTER (Gateway-branched)
if (response.checkout_data) {
    if (response.gateway_provider === 'stripe') {
        // Store tenant context for success page
        sessionStorage.setItem('stripe_payment_context', JSON.stringify({
            tenantId: response.tenant_id,
            tenantName: response.tenant_name,
            planName: response.plan.name,
            sessionId: response.checkout_data.session_id,
        }));
        // Redirect to Stripe Checkout
        window.location.href = response.checkout_data.checkout_url;
    } else {
        // Existing Razorpay inline modal
        openPlatformRazorpayCheckout(response.checkout_data);
    }
}
```

**Why `sessionStorage`?** The redirect to Stripe and back loses React state. We need the tenant context (ID, name, plan) on the success page to poll the correct endpoint and show meaningful information. `sessionStorage` survives the redirect within the same tab but doesn't persist across tabs or sessions. This is the correct scope — if the user closes the tab, they'll check subscription status manually.

**Note on `localStorage`:** Per artifact restrictions, `localStorage` is not available in Claude artifacts, but this is production Next.js code running in the browser — `sessionStorage` is fully available and appropriate here.

---

## 4. New Pages

### 4.1 Success Page

**Route:** `/super-admin-dashboard/payment/success`
**File:** `app/(super-admin-dashboard)/payment/success/page.tsx`

**Behavior:**

1. On mount, extract `session_id` from URL query parameter
2. Read `stripe_payment_context` from `sessionStorage` to get `tenantId`, `tenantName`, `planName`
3. If context is missing, show a generic "Payment processing" message with a link to the tenant list
4. Start polling `GET /api/admin/tenants/{tenantId}/subscription/payment-status` every 5 seconds
5. Display a status indicator with three states:

| State | UI | Condition |
|---|---|---|
| **Processing** | Spinner + "Payment is being verified..." | `status === 'pending_payment'` |
| **Active** | Green checkmark + "Subscription activated!" | `status === 'active'` |
| **Failed** | Red X + "Payment could not be verified" | Polling times out (60 seconds) or status === error |

6. On activation confirmed:
   - Clear `stripe_payment_context` from `sessionStorage`
   - Show success details: tenant name, plan name, "Subscription is now active"
   - Show "View Tenant" button linking to `/super-admin-dashboard/tenants/{tenantId}`
7. On timeout (12 polls × 5 seconds = 60 seconds without activation):
   - Stop polling
   - Show "Payment is taking longer than expected. The subscription will activate automatically once confirmed."
   - Show "View Tenant" button (subscription may activate later via webhook)

**Polling implementation using TanStack Query:**

```typescript
const { data: paymentStatus } = useQuery({
    queryKey: ['payment-status', tenantId],
    queryFn: () => subscriptionService.getPaymentStatus(tenantId),
    enabled: !!tenantId && !isActivated,
    refetchInterval: 5000,         // Poll every 5 seconds
    refetchIntervalInBackground: false,  // Stop when tab not visible
    retry: false,
});

// Stop polling once activated
useEffect(() => {
    if (paymentStatus?.status === 'active') {
        setIsActivated(true);
    }
}, [paymentStatus]);
```

### 4.2 Cancel Page

**Route:** `/super-admin-dashboard/payment/cancel`
**File:** `app/(super-admin-dashboard)/payment/cancel/page.tsx`

**Behavior:**

1. Read `stripe_payment_context` from `sessionStorage` to get tenant context
2. Display: "Payment was cancelled" with tenant name and plan name (if available)
3. Show two actions:
   - "Retry Payment" → navigates back to tenant detail page where they can re-initiate
   - "Back to Tenants" → navigates to tenant list
4. Clear `stripe_payment_context` from `sessionStorage`

**This page is simple** — no polling, no API calls. The subscription remains in `pending_payment` status. The Super Admin can retry via the existing `TenantSubscriptionPanel` retry flow.

---

## 5. Modified Components

### 5.1 `openPlatformRazorpayCheckout` → `openPlatformCheckout`

**Current file:** `razorpay-platform-checkout.ts`
**Action:** Rename to `platform-checkout.ts` and make gateway-aware.

```typescript
// platform-checkout.ts

export type GatewayProvider = 'razorpay' | 'stripe';

export interface PlatformCheckoutParams {
    gatewayProvider: GatewayProvider;
    checkoutData: RazorpayCheckoutData | StripeCheckoutData;
    tenantContext: {
        tenantId: number;
        tenantName: string;
        planName: string;
    };
}

export interface RazorpayCheckoutData {
    key_id: string;
    order_id: string;
    amount: number;
    currency: string;
    name: string;
    description: string;
}

export interface StripeCheckoutData {
    checkout_url: string;
    session_id: string;
}

export function openPlatformCheckout(params: PlatformCheckoutParams): void {
    if (params.gatewayProvider === 'stripe') {
        // Store context for success page
        sessionStorage.setItem('stripe_payment_context', JSON.stringify({
            tenantId: params.tenantContext.tenantId,
            tenantName: params.tenantContext.tenantName,
            planName: params.tenantContext.planName,
            sessionId: (params.checkoutData as StripeCheckoutData).session_id,
        }));
        // Redirect to Stripe hosted checkout
        window.location.href = (params.checkoutData as StripeCheckoutData).checkout_url;
    } else {
        // Existing Razorpay inline modal (preserve current behavior exactly)
        openRazorpayModal(params.checkoutData as RazorpayCheckoutData);
    }
}

// Extract existing Razorpay modal logic into a private function
function openRazorpayModal(data: RazorpayCheckoutData): void {
    // ... existing openPlatformRazorpayCheckout logic unchanged ...
}
```

### 5.2 `ProvisionTenantDialog`

**File:** `provision-tenant-form.tsx`

Update the post-submission handler to call `openPlatformCheckout` with the gateway provider from the backend response:

```typescript
// After successful provision API call:
const response = await tenantService.provisionTenant(formData);

if (response.checkout_data) {
    openPlatformCheckout({
        gatewayProvider: response.gateway_provider,
        checkoutData: response.checkout_data,
        tenantContext: {
            tenantId: response.data.id,
            tenantName: response.data.name,
            planName: response.data.plan.name,
        },
    });
} else {
    // Trial or skip_payment — no checkout needed
    toast.success('Tenant provisioned successfully');
    onClose();
}
```

### 5.3 `PlanSelectorModal`

**File:** `plan-selector-modal.tsx`

Same branching pattern as `ProvisionTenantDialog` — when the plan assignment response includes `checkout_data`, call `openPlatformCheckout` with the gateway provider.

### 5.4 `TenantSubscriptionPanel`

**File:** `tenant-subscription-panel.tsx`

The retry payment flow must also branch by gateway. When the retry endpoint returns `checkout_data`, use the same `openPlatformCheckout` function.

### 5.5 Plan Listing — Country Filter

When assigning a plan to a tenant, the plan selector should filter plans by the tenant's `country_code`. The backend already supports `?country_code=AE` filtering on the plan listing endpoint (from G1).

```typescript
// In PlanSelectorModal, when fetching available plans:
const { data: plans } = useQuery({
    queryKey: ['subscription-plans', tenant.country_code],
    queryFn: () => planService.listPlans({ country_code: tenant.country_code }),
});
```

This prevents showing India plans to UAE tenants and vice versa.

### 5.6 Currency Display

All plan pricing displayed in the UI must use the plan's `currency` field, not hardcoded `₹`:

```typescript
// Currency formatting utility
const CURRENCY_SYMBOLS: Record<string, string> = {
    INR: '₹',
    AED: 'د.إ',
    SAR: '﷼',
};

export function formatCurrency(amountCents: number, currency: string): string {
    const symbol = CURRENCY_SYMBOLS[currency] || currency;
    return `${symbol}${(amountCents / 100).toFixed(2)}`;
}
```

Replace all hardcoded `₹` in:
- `PlanSelectorModal` (plan price display)
- `TenantSubscriptionPanel` (current plan price, payment amount)
- `ProvisionTenantDialog` (plan price during provisioning)
- Any billing-related data table columns

---

## 6. API Contract Reference (From G1 Backend)

### 6.1 Plan Assignment Response — Stripe

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
        "checkout_data": {
            "checkout_url": "https://checkout.stripe.com/c/pay/cs_xxx",
            "session_id": "cs_xxx"
        }
    }
}
```

### 6.2 Plan Assignment Response — Razorpay (Unchanged)

```json
{
    "data": {
        "id": 123,
        "tenant_id": 42,
        "plan": {
            "id": 5,
            "name": "Starter",
            "code": "starter_monthly"
        },
        "status": "pending_payment",
        "billing_cycle": "monthly",
        "locked_price_monthly_cents": 49900,
        "currency": "INR",
        "gateway_provider": "razorpay",
        "checkout_data": {
            "key_id": "rzp_live_xxxxx",
            "order_id": "order_EKwxwAgItmmXdp",
            "amount": 49900,
            "currency": "INR",
            "name": "Ubotz Platform",
            "description": "Starter Monthly Plan"
        }
    }
}
```

### 6.3 Payment Status Endpoint

```
GET /api/admin/tenants/{tenantId}/subscription/payment-status
```

Response:
```json
{
    "data": {
        "subscription_id": 456,
        "status": "pending_payment",
        "gateway_provider": "stripe",
        "amount_cents": 36700,
        "currency": "AED",
        "created_at": "2026-03-27T10:00:00Z"
    }
}
```

Status transitions: `pending_payment` → `active` (on webhook confirmation).

---

## 7. Stripe Redirect URLs

### 7.1 Configuration

The Stripe Checkout Session is created with these URLs (configured in G1 backend):

```
success_url: https://educoreos.com/super-admin-dashboard/payment/success?session_id={CHECKOUT_SESSION_ID}
cancel_url: https://educoreos.com/super-admin-dashboard/payment/cancel
```

`{CHECKOUT_SESSION_ID}` is a Stripe template variable — Stripe replaces it with the actual session ID before redirecting.

### 7.2 Environment Consideration

The `success_url` and `cancel_url` are configured in the backend `.env` (`STRIPE_SUCCESS_URL`, `STRIPE_CANCEL_URL`). For development/staging, these should point to the local/staging frontend URL. Ensure the frontend routes exist before testing the Stripe flow end-to-end.

---

## 8. Edge Cases

### 8.1 User Closes Stripe Checkout Tab

If the user closes the Stripe checkout page without completing or cancelling, they won't be redirected to either success or cancel URL. The subscription remains `pending_payment`. The Super Admin can retry via `TenantSubscriptionPanel`.

### 8.2 Webhook Arrives Before Redirect

Stripe may process the webhook faster than the browser redirect. When the success page loads and starts polling, the subscription might already be `active`. The polling logic handles this — if the first poll returns `active`, immediately show the success state.

### 8.3 Webhook Delayed

The success page polls for 60 seconds. If the webhook hasn't arrived, the page shows a "taking longer than expected" message. This is not an error — the subscription will activate when the webhook arrives (Stripe retries for 72 hours).

### 8.4 Session Expired

Stripe Checkout Sessions expire after 24 hours. If the user returns to the `checkout_url` after expiry, Stripe shows its own error page. The user must retry via `TenantSubscriptionPanel` which creates a new session.

### 8.5 `sessionStorage` Cleared

If the user navigates to the success page without `stripe_payment_context` in sessionStorage (e.g., direct URL access, different tab), the page should handle this gracefully:

- Show generic "Payment processing" message
- Cannot poll without `tenantId` — show "Please check the tenant's subscription status in the dashboard"
- Provide link to tenant list

---

## 9. What NOT to Do

- Do NOT load the Stripe.js SDK — we're using Stripe Checkout (hosted page), not Stripe Elements. No Stripe client-side SDK is needed.
- Do NOT modify the Razorpay flow — the existing inline modal behavior must remain identical for India tenants.
- Do NOT store sensitive data in `sessionStorage` — only tenant ID, name, plan name, session ID. No amounts, no secrets.
- Do NOT rely on the success page redirect for activation — activation only happens via webhook. The success page is informational.
- Do NOT use `localStorage` — `sessionStorage` is the correct scope (single tab, cleared on close).
- Do NOT hardcode `₹` anywhere — use `formatCurrency()` utility with the plan/tenant currency.
- Do NOT show Stripe-specific UI elements (logos, badges) for Razorpay payments and vice versa.
- Do NOT poll indefinitely — cap at 60 seconds (12 × 5s), then show timeout message.

---

## 10. Implementation Sequence

| Step | Task | Depends On |
|---|---|---|
| 1 | Create `formatCurrency()` utility function | — |
| 2 | Create TypeScript types for gateway-branched responses (`GatewayProvider`, `StripeCheckoutData`, `RazorpayCheckoutData`) | — |
| 3 | Refactor `razorpay-platform-checkout.ts` → `platform-checkout.ts` with `openPlatformCheckout()` | Steps 1, 2 |
| 4 | Create success page `/super-admin-dashboard/payment/success` with polling | Step 2 |
| 5 | Create cancel page `/super-admin-dashboard/payment/cancel` | — |
| 6 | Modify `ProvisionTenantDialog` — use `openPlatformCheckout`, pass `gateway_provider` | Step 3 |
| 7 | Modify `PlanSelectorModal` — same branching + country filter on plan list | Step 3 |
| 8 | Modify `TenantSubscriptionPanel` — retry flow branching | Step 3 |
| 9 | Replace all hardcoded `₹` with `formatCurrency()` in billing components | Step 1 |
| 10 | Add `payment-status` query to subscription service | — |
| 11 | Test end-to-end with Stripe test mode | All above |

---

## 11. File Manifest

### New Files

| File | Purpose |
|---|---|
| `app/(super-admin-dashboard)/payment/success/page.tsx` | Stripe payment success page with status polling |
| `app/(super-admin-dashboard)/payment/cancel/page.tsx` | Stripe payment cancel page with retry option |
| `lib/utils/format-currency.ts` | Currency formatting utility (symbol lookup + formatting) |
| `types/payment.ts` | TypeScript types for gateway-branched checkout data |

### Modified Files

| File | Change |
|---|---|
| `razorpay-platform-checkout.ts` → `platform-checkout.ts` | Rename + gateway branching logic |
| `provision-tenant-form.tsx` | Call `openPlatformCheckout` with gateway context |
| `plan-selector-modal.tsx` | Gateway branching + country filter on plan list |
| `tenant-subscription-panel.tsx` | Retry flow gateway branching |
| `services/subscription-service.ts` (or equivalent) | Add `getPaymentStatus()` method |
| All components displaying plan prices | Replace `₹` with `formatCurrency()` |

### Deleted Files

| File | Reason |
|---|---|
| `razorpay-platform-checkout.ts` | Renamed to `platform-checkout.ts` (or kept as import alias if breaking change is too wide) |

---

## 12. Test Requirements

### Component Tests

- [ ] Success page: renders "Processing" state when `pending_payment`
- [ ] Success page: transitions to "Activated" state when poll returns `active`
- [ ] Success page: shows timeout message after 60 seconds
- [ ] Success page: handles missing `sessionStorage` context gracefully
- [ ] Cancel page: renders cancellation message and retry link
- [ ] Cancel page: handles missing `sessionStorage` context gracefully
- [ ] `openPlatformCheckout`: calls `window.location.href` for Stripe
- [ ] `openPlatformCheckout`: calls Razorpay modal for Razorpay (unchanged behavior)
- [ ] `formatCurrency`: formats INR, AED, SAR correctly
- [ ] Plan selector: filters plans by `country_code`

### Integration Tests

- [ ] Provision UAE tenant → response has `gateway_provider: 'stripe'` → redirect triggered
- [ ] Provision India tenant → response has `gateway_provider: 'razorpay'` → Razorpay modal opens
- [ ] Retry payment for Stripe tenant → redirect to new checkout URL
- [ ] Plan list for UAE tenant → only AE plans shown

### Manual E2E Tests (Stripe Test Mode)

- [ ] Full flow: Assign paid plan to UAE tenant → redirect to Stripe → complete with test card `4242...` → redirect to success page → polling confirms activation
- [ ] Cancel flow: Assign plan → redirect to Stripe → click "Back" → lands on cancel page → retry navigates to tenant detail
- [ ] Timeout: Assign plan → complete payment → delay webhook (disconnect webhook endpoint temporarily) → success page shows timeout message after 60s
- [ ] India tenant: Full Razorpay flow unchanged

### Minimum: 10–15 tests.

---

## 13. Quality Gate — Phase G1-FE Complete

### Functional Gates (BLOCKING)

- [ ] UAE tenant plan assignment → Stripe redirect works
- [ ] India tenant plan assignment → Razorpay modal unchanged
- [ ] Success page polls and shows activation confirmation
- [ ] Success page handles timeout gracefully
- [ ] Cancel page shows retry option
- [ ] Plan selector filters by tenant country
- [ ] All currency displays use tenant/plan currency (no hardcoded ₹)
- [ ] Retry payment works for both gateways

### UX Gates (BLOCKING)

- [ ] Success page shows spinner during polling
- [ ] Success page shows clear green confirmation on activation
- [ ] Cancel page provides clear path to retry
- [ ] No flash of wrong content during page transitions
- [ ] Missing sessionStorage handled without crash

### Architecture Gates (BLOCKING)

- [ ] No Stripe.js SDK loaded (not needed for Checkout redirect)
- [ ] Razorpay flow code unchanged (zero regression)
- [ ] TypeScript strict mode: zero type errors
- [ ] No `localStorage` usage (sessionStorage only)
- [ ] `formatCurrency` used consistently (grep for hardcoded ₹/AED/SAR)

---

## 14. Risk Register

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| R-01 | `sessionStorage` lost if user opens success URL in new tab | **MEDIUM** | Graceful fallback — show generic message with link to tenant list |
| R-02 | Renaming `razorpay-platform-checkout.ts` breaks imports | **LOW** | Update all import paths. Alternatively keep old file as re-export wrapper. |
| R-03 | Stripe Checkout Session URL expires (24h) | **LOW** | Same as Razorpay order expiry — retry creates new session. Already handled by `TenantSubscriptionPanel`. |
| R-04 | Backend `payment-status` endpoint not yet verified | **MEDIUM** | Confirm endpoint exists from G1. If missing, this becomes a backend + frontend phase. |
| R-05 | Browser popup blockers interfering with `window.location.href` | **NONE** | `window.location.href` is a same-page redirect, not a popup. Popup blockers don't affect it. |

---

## 15. Definition of Done

Phase G1-FE is complete when:

1. Implementation plan reviewed and approved by Principal Engineer.
2. All quality gates in §13 pass.
3. End-to-end Stripe flow demonstrated with Stripe Test Mode: plan assignment → Stripe checkout → success page → activation confirmed via polling.
4. Razorpay flow verified unchanged for India tenants.
5. Currency display verified for AED, SAR, INR across all billing components.
6. Phase G1-FE Completion Report signed off.

---

*End of Phase G1-FE Developer Instructions*
