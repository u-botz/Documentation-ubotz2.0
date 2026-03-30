# UBOTZ 2.0 — Teacher Self-Onboarding Developer Instructions

## Phase: TSO-1 (Teacher Self-Onboarding)

| Field | Value |
|---|---|
| **Document Type** | Developer Instructions |
| **Phase** | TSO-1 |
| **Date** | March 30, 2026 |
| **Author** | Principal Engineer (Architecture Auditor) |
| **Prerequisites** | TC-1 (Tenant Category) COMPLETE, Phase 12A (Razorpay Orders) COMPLETE, Phase 14 (Notifications) COMPLETE |
| **Estimated Effort** | 5–7 working days |
| **Security Classification** | HIGH — First public unauthenticated write endpoint in EducoreOS |

> **⚠️ SECURITY WARNING:** This phase introduces the first public-facing, unauthenticated write operation in the platform. Every previous database write required Platform Admin or Tenant User authentication. This endpoint WILL be targeted by bots, squatters, and payment fraud. Every design decision in this document reflects that threat model.

---

## 1. Mission Statement

Enable standalone teachers to self-onboard onto EducoreOS from the marketing website (`educoreos.com`). The teacher clicks "Get Started" on the marketing site, is redirected to `app.educoreos.com/signup/teacher`, fills a signup form, either starts a free trial (with email verification) or pays for a plan (via Razorpay), and receives their fully provisioned tenant with dashboard access.

This is NOT a generic self-registration system. It is a **teacher-specific onboarding flow** restricted to `tenant_category = 'standalone_teacher'`.

---

## 2. System Architecture Overview

### 2.1 System Boundaries

```
educoreos.com (Vercel — static marketing site)
    │
    │  Link: "Get Started" → app.educoreos.com/signup/teacher?plan=starter_teacher
    │  (plan parameter is a HINT only — not trusted)
    │
    ▼
app.educoreos.com/signup/teacher (EducoreOS — Next.js frontend on Contabo)
    │
    │  Signup form: Name, Email, Phone, Subdomain, Institution Type, Plan Selection
    │
    ├─── TRIAL PATH ──────────────────────────────────────────────┐
    │  POST /api/public/teacher-signup/trial                      │
    │  → Creates pending registration                             │
    │  → Sends verification email                                 │
    │  → Teacher clicks email link                                │
    │  → POST /api/public/teacher-signup/verify-email             │
    │  → Tenant provisioned → Welcome email with temp password    │
    │                                                             │
    ├─── PAID PATH ───────────────────────────────────────────────┤
    │  POST /api/public/teacher-signup/checkout                   │
    │  → Creates pending registration + Razorpay Order            │
    │  → Returns checkout_data                                    │
    │  → Razorpay Checkout widget opens                           │
    │  → Payment completes                                        │
    │  → Webhook: POST /api/webhooks/razorpay                     │
    │  → Tenant provisioned → Welcome email with temp password    │
    │                                                             │
    ▼
{teacher-slug}.educoreos.com/auth/login
    │
    │  Teacher logs in with temp password
    │  → Forced password change
    │  → Dashboard
```

### 2.2 Key Architectural Principle

Both paths (trial and paid) converge on the same provisioning pipeline:

```
Pending Registration (verified) → CreateTenantUseCase → TenantCreated event
    → ProvisionDefaultRolesListener (Owner + Student only, per TC-1)
    → CreateOwnerUserListener (NEW — creates the teacher as Owner user)
    → SendWelcomeEmailListener (existing)
    → AssignSubscriptionPlanUseCase (trial or paid plan)
```

The self-signup flow is a **wrapper** around the existing provisioning pipeline. It does NOT duplicate provisioning logic.

---

## 3. Business Rules (NON-NEGOTIABLE)

### 3.1 Registration Rules

| Rule ID | Rule | Enforcement |
|---|---|---|
| BR-01 | Only `standalone_teacher` tenant category is available through self-onboarding. | Hardcoded in the signup flow. No category selection by the teacher. |
| BR-02 | Email must be unique across all pending registrations and existing tenant owner users. | DB unique constraint + application check. Error message must NOT reveal whether the email exists — use generic "If this email is available, you'll receive a verification link." |
| BR-03 | Subdomain (slug) must be unique across both the `tenants` table AND active pending registrations. | Atomic reservation via DB unique constraint on `teacher_signup_requests.subdomain` + check against `tenants.slug`. |
| BR-04 | Subdomain must pass the existing reserved-words blocklist (`auth`, `api`, `app`, `admin`, `panel`, `www`, `mail`, `ftp`, `super-admin-dashboard`, `tenant-admin-dashboard`, `_next`, `signup`, `login`, `register`). | Validated against blocklist in domain layer. |
| BR-05 | Subdomain format: `kebab-case`, 3–40 characters, lowercase alphanumeric and hyphens only, cannot start or end with a hyphen. | `TenantSlug` value object validation (already exists). |
| BR-06 | Phone number is required and must be a valid format. | Validation rule on the form request. |
| BR-07 | Institution type is required. Teacher selects from the existing `institution_types` dropdown. | FK to `institution_types.id`. |
| BR-08 | Only subscription plans with `tenant_category = 'standalone_teacher'` AND `status = 'active'` are shown. | Backend query filter — never trust frontend plan filtering. |
| BR-09 | The `plan_code` URL parameter from the marketing site is a preselection HINT only. The backend independently loads and validates the plan. | Backend fetches plan by code, validates category match and active status. |

### 3.2 Subdomain Reservation Rules

| Rule ID | Rule | Enforcement |
|---|---|---|
| BR-10 | Subdomain is reserved for **30 minutes** after form submission. If payment/verification is not completed within 30 minutes, the reservation expires and the subdomain becomes available again. | `expires_at` column on `teacher_signup_requests`. Scheduled cleanup command. |
| BR-11 | The real-time subdomain availability check (`GET /api/public/teacher-signup/check-subdomain`) is informational only. The actual reservation happens atomically at form submission time via DB constraint. | Availability endpoint returns `available: true/false`. Form submission uses `INSERT ... WHERE NOT EXISTS` pattern with unique constraint. |
| BR-12 | A subdomain reservation race condition (two simultaneous submissions for the same slug) is resolved by the database unique constraint — the second insert fails and returns a user-friendly error. | Catch unique constraint violation, return 409 Conflict with message "This subdomain was just taken. Please choose another." |

### 3.3 Trial Rules

| Rule ID | Rule | Enforcement |
|---|---|---|
| BR-13 | Free trial requires email verification BEFORE the tenant is provisioned. | Pending registration created with `status = 'pending_email_verification'`. Verification email sent via Amazon SES. Tenant created only after email link is clicked. |
| BR-14 | Email verification link expires in **24 hours**. After expiry, the pending registration is cleaned up and the subdomain is released. | `email_verification_expires_at` column. Signed URL with HMAC. |
| BR-15 | Email verification link is single-use. Once clicked, it cannot be reused. | `email_verified_at` timestamp set on first click. Subsequent clicks return "Already verified." |
| BR-16 | Trial duration is determined by the selected trial plan's `trial_duration_days` configuration. | Standard Phase 11A trial subscription logic. |
| BR-17 | One trial per email per lifetime. A teacher who has already had a trial cannot sign up for another one — even with a different subdomain. | Check `tenants` table + `teacher_signup_requests` for any previous trial by this email. |
| BR-18 | Trial tenants that never log in within 7 days of provisioning are flagged for cleanup (future automated process). | `last_login_at` check — NOT implemented in TSO-1, but schema supports it. |

### 3.4 Paid Signup Rules

| Rule ID | Rule | Enforcement |
|---|---|---|
| BR-19 | Paid signup uses the existing Phase 12A Razorpay Orders API flow. No new payment infrastructure. | `PaymentGatewayInterface::createOrder()` called before DB transaction. |
| BR-20 | Razorpay Order is created OUTSIDE the database transaction. Sequence: validate form → create Razorpay Order → DB transaction (create pending registration with order_id) → commit. | Same pattern as Phase 12A. No external API calls inside transactions. |
| BR-21 | Tenant is provisioned ONLY after the Razorpay webhook confirms payment (`payment.captured` or `order.paid`). The frontend Razorpay handler is informational only. | Webhook handler converts pending registration → tenant. |
| BR-22 | Amount verification: webhook amount must match the plan's price. Mismatch → log error, do NOT provision. | `PaymentAmountMismatchException` (existing from Phase 12A). |
| BR-23 | If payment fails, the pending registration remains in `pending_payment` status until the 30-minute expiry, after which it's cleaned up. The teacher can retry by submitting the form again. | No retry mechanism on the same pending registration — simpler and safer. |

### 3.5 Provisioning Rules

| Rule ID | Rule | Enforcement |
|---|---|---|
| BR-24 | Tenant provisioning uses the existing `CreateTenantUseCase` + `TenantCreated` event pipeline. No duplicate provisioning logic. | The self-signup webhook/verification handler calls the same use case that Platform Admin uses. |
| BR-25 | `tenant_category` is set to `standalone_teacher`. Immutable per TC-1. | Hardcoded in the self-signup provisioning flow. |
| BR-26 | Roles seeded: Owner + Student only (per TC-1 `TenantCategory::roleSeedingProfile()`). | Handled by existing `ProvisionDefaultRolesListener` with TC-1 conditional seeding. |
| BR-27 | The teacher is created as the Owner user with a temporary random password (32-character alphanumeric). | New `CreateOwnerUserListener` on `TenantCreated` event — OR integrated into provisioning use case. |
| BR-28 | First login forces password change. The temp password is invalidated atomically upon change. | Existing forced password change flow (JWT with `purpose: password_reset` claim). |
| BR-29 | Welcome email includes: subdomain URL (`{slug}.educoreos.com`), login email, temp password, and a "Set Your Password" CTA link. | Amazon SES via Phase 14 notification infrastructure. |
| BR-30 | The provisioning actor in audit logs is recorded as `system` with metadata `source: teacher_self_onboarding`. | Audit log with `provisioned_by: null` (system), metadata includes signup request ID. |

---

## 4. Database Schema

### 4.1 New Table: `teacher_signup_requests`

This is a **central (landlord) table** — not tenant-scoped.

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | BIGINT UNSIGNED PK | No | Auto-increment |
| `idempotency_key` | VARCHAR(100) UNIQUE | No | UUID v4, generated client-side |
| `name` | VARCHAR(255) | No | Teacher's full name |
| `email` | VARCHAR(255) | No | Teacher's email |
| `phone` | VARCHAR(20) | No | Teacher's phone |
| `subdomain` | VARCHAR(100) | No | Requested subdomain slug |
| `institution_type_id` | BIGINT UNSIGNED FK | No | FK → `institution_types.id` |
| `plan_id` | BIGINT UNSIGNED FK | No | FK → `subscription_plans.id` |
| `signup_type` | VARCHAR(20) | No | `trial` or `paid` |
| `status` | VARCHAR(30) | No | See status machine below |
| `razorpay_order_id` | VARCHAR(50) | Yes | Set for paid signups only |
| `amount_cents` | BIGINT UNSIGNED | Yes | Locked price at signup time |
| `currency` | VARCHAR(3) | No | Default `INR` |
| `email_verification_token` | VARCHAR(64) | Yes | HMAC-signed token for email verification |
| `email_verified_at` | TIMESTAMP | Yes | When email was verified |
| `email_verification_expires_at` | TIMESTAMP | Yes | 24 hours after creation (trial) |
| `expires_at` | TIMESTAMP | No | 30 min for paid, 24 hours for trial |
| `provisioned_tenant_id` | BIGINT UNSIGNED | Yes | FK → `tenants.id`. Set after provisioning. |
| `provisioned_at` | TIMESTAMP | Yes | When tenant was created |
| `ip_address` | VARCHAR(45) | No | For rate limiting and audit |
| `user_agent` | VARCHAR(500) | Yes | For audit |
| `created_at` | TIMESTAMP | No | |
| `updated_at` | TIMESTAMP | No | |

**Indexes:**
- `UNIQUE (subdomain)` WHERE `status IN ('pending_email_verification', 'pending_payment', 'email_verified')` — partial unique (or application-level enforcement if MySQL doesn't support partial unique indexes; use a composite approach: `UNIQUE (subdomain, status)` won't work — instead enforce via application + cleanup)
- `idx_teacher_signup_email` on `email`
- `idx_teacher_signup_status_expires` on `(status, expires_at)` for cleanup queries
- `idx_teacher_signup_razorpay_order` on `razorpay_order_id`

**MySQL partial unique index workaround:** Since MySQL doesn't support partial unique indexes natively, the developer must enforce subdomain uniqueness via: (1) application-level check in a transaction with `SELECT FOR UPDATE`, and (2) periodic cleanup of expired records so the table doesn't accumulate stale reservations that block legitimate signups.

### 4.2 Status Machine for `teacher_signup_requests`

```
                TRIAL PATH                           PAID PATH
                    │                                    │
                    ▼                                    ▼
        ┌───────────────────────┐          ┌────────────────────────┐
        │ pending_email_        │          │ pending_payment        │
        │ verification          │          │                        │
        └──────────┬────────────┘          └──────────┬─────────────┘
                   │                                  │
           verify email                         webhook confirms
                   │                                  │
                   ▼                                  ▼
        ┌───────────────────────┐          ┌────────────────────────┐
        │ email_verified        │          │ payment_confirmed      │
        │                       │          │                        │
        └──────────┬────────────┘          └──────────┬─────────────┘
                   │                                  │
             provision tenant                   provision tenant
                   │                                  │
                   ▼                                  ▼
        ┌──────────────────────────────────────────────────────────┐
        │                      provisioned                         │
        └──────────────────────────────────────────────────────────┘

        EXPIRY: pending_email_verification → expired (after 24 hours)
                pending_payment → expired (after 30 minutes)
```

| From | To | Trigger |
|---|---|---|
| (new) | `pending_email_verification` | Trial signup form submitted |
| (new) | `pending_payment` | Paid signup form submitted |
| `pending_email_verification` | `email_verified` | Email link clicked |
| `pending_email_verification` | `expired` | 24 hours elapsed without verification |
| `email_verified` | `provisioned` | Tenant created successfully |
| `pending_payment` | `payment_confirmed` | Razorpay webhook confirms payment |
| `pending_payment` | `expired` | 30 minutes elapsed without payment |
| `payment_confirmed` | `provisioned` | Tenant created successfully |

### 4.3 No Other Schema Changes

The `tenants`, `subscription_plans`, and `users` tables require no modifications. TC-1 (tenant category) changes are prerequisites.

---

## 5. API Design

### 5.1 Public Endpoints (No Authentication)

All endpoints under `/api/public/teacher-signup/` — no auth middleware. Rate limiting and CAPTCHA are the only protections.

| Method | Endpoint | Rate Limit | Purpose |
|---|---|---|---|
| `GET` | `/api/public/teacher-signup/plans` | 30/min per IP | List active plans for standalone teachers |
| `GET` | `/api/public/teacher-signup/check-subdomain?slug={slug}` | 20/min per IP | Real-time subdomain availability check |
| `GET` | `/api/public/teacher-signup/institution-types` | 30/min per IP | List active institution types for dropdown |
| `POST` | `/api/public/teacher-signup/trial` | 5/min per IP | Submit trial signup (creates pending registration, sends verification email) |
| `POST` | `/api/public/teacher-signup/checkout` | 5/min per IP | Submit paid signup (creates pending registration + Razorpay Order) |
| `GET` | `/api/public/teacher-signup/verify-email?token={token}&id={id}` | 10/min per IP | Email verification link handler |

### 5.2 Webhook Endpoint (Existing — Extended)

| Method | Endpoint | Auth | Change |
|---|---|---|---|
| `POST` | `/api/webhooks/razorpay` | Signature verification | Extended to check `teacher_signup_requests` when `order_id` matches a pending signup (not just `tenant_subscriptions`) |

### 5.3 Endpoint Details

**`GET /api/public/teacher-signup/plans`**

Response:
```json
{
  "data": [
    {
      "id": 5,
      "code": "teacher_starter_monthly",
      "name": "Starter",
      "price_monthly_cents": 29900,
      "price_annual_cents": 299000,
      "is_trial": false,
      "features": { "max_users": 50, "max_courses": 5, "max_storage_mb": 1024 },
      "modules": ["module.lms", "module.website"]
    },
    {
      "id": 6,
      "code": "teacher_free_trial",
      "name": "Free Trial (14 Days)",
      "is_trial": true,
      "trial_duration_days": 14,
      "features": { "max_users": 10, "max_courses": 2, "max_storage_mb": 256 },
      "modules": ["module.lms", "module.website"]
    }
  ]
}
```

**`GET /api/public/teacher-signup/check-subdomain?slug=kumar-sir`**

Response:
```json
{ "available": true, "slug": "kumar-sir" }
```

Or:
```json
{ "available": false, "slug": "kumar-sir", "suggestions": ["kumar-sir-academy", "kumar-sir-classes"] }
```

**`POST /api/public/teacher-signup/trial`**

Request:
```json
{
  "name": "Dr. Kumar",
  "email": "kumar@example.com",
  "phone": "+919876543210",
  "subdomain": "kumar-sir",
  "institution_type_id": 3,
  "plan_id": 6,
  "idempotency_key": "550e8400-e29b-41d4-a716-446655440000",
  "captcha_token": "..."
}
```

Response (always same regardless of email existence — prevents enumeration):
```json
{
  "message": "If this email is available, you will receive a verification link shortly.",
  "status": "pending_verification"
}
```

**`POST /api/public/teacher-signup/checkout`**

Request: Same as trial, but `plan_id` references a paid plan. Plus `billing_cycle: "monthly" | "annual"`.

Response:
```json
{
  "status": "pending_payment",
  "checkout_data": {
    "key_id": "rzp_live_xxxxx",
    "order_id": "order_EKwxwAgItmmXdp",
    "amount": 29900,
    "currency": "INR",
    "name": "EducoreOS",
    "description": "Starter Teacher Plan — Monthly",
    "prefill": {
      "name": "Dr. Kumar",
      "email": "kumar@example.com",
      "contact": "+919876543210"
    }
  }
}
```

---

## 6. Security Requirements (NON-NEGOTIABLE)

### 6.1 Rate Limiting

| Endpoint | Limit | Key |
|---|---|---|
| Read endpoints (plans, check-subdomain, institution-types) | 30/min | Per IP |
| Write endpoints (trial, checkout) | 5/min | Per IP |
| Email verification | 10/min | Per IP |
| Razorpay webhook | Existing throttle | Signature-verified |

### 6.2 Bot Prevention

- **CAPTCHA:** Integrate a CAPTCHA solution (reCAPTCHA v3 or hCaptcha) on the trial and checkout form submissions. The `captcha_token` field is validated server-side before any database write or Razorpay API call.
- **Honeypot field:** Include a hidden field (e.g., `website_url`) in the form. If populated, reject silently (bots auto-fill hidden fields).
- Both mechanisms must be present. CAPTCHA alone is insufficient — sophisticated bots can solve reCAPTCHA v2. Honeypot alone is insufficient — targeted bots skip hidden fields.

### 6.3 Information Disclosure Prevention

- The trial signup endpoint returns the SAME response regardless of whether the email already exists. No enumeration.
- The subdomain check endpoint reveals availability (by design — UX requirement), but is rate-limited to prevent mass enumeration.
- Error messages never reveal internal state: no "This email already has a tenant" — instead "If this email is available, you'll receive a verification link."
- Invalid `plan_id` returns 422 "Invalid plan selected" — not 404 (prevents plan ID enumeration).

### 6.4 Email Verification Security

- Verification token is an HMAC-SHA256 signature of `signup_request_id + email + secret_key`.
- Token is NOT stored raw in the database — store the `signup_request_id` and recompute the HMAC on verification to compare.
- Verification URL format: `app.educoreos.com/signup/teacher/verify?id={signup_request_id}&token={hmac_token}`
- The link is single-use — `email_verified_at` is set on first use. Replay returns "Already verified — check your email for login details."

### 6.5 Temporary Password Security

- Generated using `Str::random(32)` — 32-character alphanumeric string.
- Stored as a bcrypt hash in the `users` table (standard Laravel password hashing).
- The user record is created with `must_change_password: true` (or equivalent flag — verify existing implementation).
- On first login, the auth flow detects the forced change requirement and issues a temp JWT with `purpose: password_reset` (existing Phase 7 flow).
- After password change, the temp password is permanently invalidated (new bcrypt hash replaces it).

### 6.6 Payment Security

- All Phase 12A financial safety requirements apply: webhook signature verification, amount verification, idempotency, pessimistic locking, no external API calls inside transactions.
- Razorpay `key_secret` never leaves the server. Only `key_id` goes to the frontend.
- No financial data in browser localStorage.

---

## 7. Application Layer

### 7.1 New Use Cases

| UseCase | Layer | Purpose |
|---|---|---|
| `CreateTrialSignupRequestUseCase` | Application/Public/TeacherSignup/ | Validates form, checks email/subdomain uniqueness, creates pending registration, sends verification email |
| `CreatePaidSignupRequestUseCase` | Application/Public/TeacherSignup/ | Validates form, creates Razorpay Order (outside transaction), creates pending registration with order_id |
| `VerifySignupEmailUseCase` | Application/Public/TeacherSignup/ | Validates HMAC token, sets `email_verified_at`, triggers provisioning |
| `ProvisionTeacherTenantUseCase` | Application/Public/TeacherSignup/ | Converts a verified/paid signup request into a real tenant — calls `CreateTenantUseCase`, creates owner user, assigns plan |
| `CheckSubdomainAvailabilityUseCase` | Application/Public/TeacherSignup/ | Checks `tenants.slug` + active `teacher_signup_requests.subdomain` |
| `CleanupExpiredSignupRequestsCommand` | Console command | Scheduled: marks expired pending registrations, releases subdomain reservations |

### 7.2 Modified Components

| Component | Change |
|---|---|
| `ProcessWebhookUseCase` (existing) | Extended: when a `payment.captured` event arrives, check if the `razorpay_order_id` matches a `teacher_signup_requests` record. If yes, transition to `payment_confirmed` and trigger `ProvisionTeacherTenantUseCase`. |
| `CreateTenantUseCase` (existing) | No modification — called by `ProvisionTeacherTenantUseCase` with appropriate parameters. |
| `ProvisionDefaultRolesListener` (existing) | No modification — TC-1 already handles conditional role seeding based on `tenant_category`. |

### 7.3 Provisioning Sequence (Critical)

```
ProvisionTeacherTenantUseCase:
    1. Load the signup request (verified or payment confirmed)
    2. Validate: status is correct, not already provisioned, not expired
    3. BEGIN TRANSACTION
        a. Call CreateTenantUseCase (creates tenant record, fires TenantCreated event)
           - slug = signup_request.subdomain
           - name = signup_request.name (tenant name = teacher name for standalone)
           - tenant_category = 'standalone_teacher' (hardcoded)
           - institution_type_id = signup_request.institution_type_id
           - provisioned_by = null (system action)
        b. Create Owner user record in the new tenant
           - email = signup_request.email
           - name = signup_request.name
           - phone = signup_request.phone
           - password = bcrypt(random 32-char string)
           - role = 'owner' (assign to the Owner role seeded by ProvisionDefaultRolesListener)
           - status = 'active'
           - must_change_password = true
        c. Update signup_request: status = 'provisioned', provisioned_tenant_id = tenant.id, provisioned_at = now()
    4. COMMIT
    5. DB::afterCommit:
        a. Assign subscription plan (trial or paid) via AssignSubscriptionToTenantUseCase
        b. Send welcome email with: subdomain URL, login email, temp password
        c. Log to admin_audit_logs: action = 'system.teacher.self_onboarded', metadata = { signup_request_id, source: 'teacher_self_onboarding' }
```

**Critical ordering notes:**
- User creation MUST happen after `TenantCreated` event fires (because `ProvisionDefaultRolesListener` creates the Owner role that the user will be assigned to). If the listener is synchronous, the role exists by the time user creation runs. If the listener is queued, user creation must also be deferred or the role must be created inline.
- The developer MUST verify whether `ProvisionDefaultRolesListener` is synchronous or queued. If queued, the provisioning sequence needs adjustment — either make it synchronous for this flow, or defer user creation to a chained job.

---

## 8. Frontend Design

### 8.1 Route

`app.educoreos.com/signup/teacher` — public page, no authentication required.

This is a Next.js page in the public context (similar to landing pages). No tenant resolution needed — this is a platform-level page.

### 8.2 Page Structure

**Step 1: Plan Selection**
- Display available teacher plans (from `GET /api/public/teacher-signup/plans`)
- Cards showing: plan name, price (or "Free Trial — X days"), features, modules
- URL parameter `?plan=starter_teacher` preselects a plan
- "Start Free Trial" and "Choose Plan" CTAs

**Step 2: Signup Form**
- Fields: Full Name, Email, Phone, Desired Subdomain (with real-time availability check), Institution Type (dropdown from API)
- Subdomain field: shows `{input}.educoreos.com` preview, debounced availability check (300ms), green checkmark / red X indicator
- Honeypot field: hidden `website_url` input
- CAPTCHA widget
- Submit button: "Start Free Trial" or "Proceed to Payment" depending on plan

**Step 3a: Email Verification (Trial)**
- After trial submission: show "Check your email" confirmation page
- "Didn't receive the email? Resend" link (rate-limited)

**Step 3b: Payment (Paid)**
- Razorpay Checkout widget opens
- On client success: show "Payment received — setting up your dashboard..." polling screen
- Poll `GET /api/public/teacher-signup/status?id={signup_request_id}` every 3 seconds until status = `provisioned`
- On provisioned: show "Your dashboard is ready!" with link to `{slug}.educoreos.com`

**Step 4: Success**
- "Your teaching platform is ready!"
- Dashboard link: `{slug}.educoreos.com`
- Instructions: "Check your email for login credentials"

### 8.3 Razorpay Integration

Same pattern as Phase 12A §9.3. Load Razorpay script from CDN. Open checkout with `checkout_data` from API response. Client handler is informational only — webhook handles activation.

---

## 9. Scheduled Commands

### 9.1 `CleanupExpiredSignupRequestsCommand`

**Schedule:** Every 5 minutes.

**Logic:**
1. Find all `teacher_signup_requests` WHERE `status IN ('pending_email_verification', 'pending_payment')` AND `expires_at < NOW()`
2. Update `status = 'expired'`
3. Log count to application log (not audit log — these are not tenant operations)

This releases reserved subdomains and prevents table bloat.

### 9.2 Existing `ExpireTrialSubscriptionsCommand`

No modification needed — trial subscriptions created through self-onboarding use the same `trial` status and `ends_at` logic as admin-assigned trials.

---

## 10. Trial-to-Paid Upgrade Path (v1)

### 10.1 Tenant Dashboard Upgrade Button

After the trial tenant is provisioned, the teacher's dashboard shows an "Upgrade" banner/button. This is a new component in the tenant admin dashboard.

**Location:** Tenant Admin Dashboard → top banner or billing section.

**Flow:**
1. Teacher clicks "Upgrade"
2. Frontend fetches available paid plans: `GET /api/tenant-dashboard/billing/upgrade-plans` (NEW endpoint, authenticated)
3. Teacher selects a plan and billing cycle
4. Frontend calls `POST /api/tenant-dashboard/billing/upgrade` (NEW endpoint, authenticated)
5. Backend creates Razorpay Order (same Phase 12A pattern)
6. Razorpay Checkout opens
7. Webhook confirms payment → subscription transitions from `trial` to `active` with the paid plan

### 10.2 New Tenant-Facing Billing Endpoints

| Method | Endpoint | Auth | Purpose |
|---|---|---|---|
| `GET` | `/api/tenant-dashboard/billing/upgrade-plans` | `auth:tenant_api` | List paid plans available for upgrade (filtered by `tenant_category`) |
| `POST` | `/api/tenant-dashboard/billing/upgrade` | `auth:tenant_api` + `billing.view` capability | Create Razorpay Order for plan upgrade, return checkout_data |

**Important:** These endpoints are tenant-scoped. The teacher is authenticated. The `billing.view` capability must be assigned to the Owner role for standalone teacher tenants. The actual subscription change happens via webhook (same as Platform Admin flow).

---

## 11. Explicit Exclusions

| # | What Is Excluded | Why | When |
|---|---|---|---|
| EX-01 | GCC self-onboarding (Stripe) | Razorpay only for v1 per business decision | Future GCC phase |
| EX-02 | Self-service plan downgrade | Downgrade has financial implications (refunds, proration) | Future |
| EX-03 | Self-service cancellation with refund | Requires refund workflow | Future |
| EX-04 | Social login (Google) on signup | Adds auth complexity | Future |
| EX-05 | Custom domain setup during onboarding | Phase 13B exists separately | Post-onboarding |
| EX-06 | Onboarding wizard (guided setup after first login) | UX improvement, not architectural | Future sprint |
| EX-07 | Referral/coupon codes on signup | No coupon system exists yet | Future |
| EX-08 | Bulk/institution self-onboarding | Only `standalone_teacher` for now | Future when edtech/offline onboarding is designed |
| EX-09 | Auto-deletion of inactive trial tenants | Schema supports it, automation deferred | Future scheduled command |

---

## 12. Quality Gates

### Security Gates (BLOCKING)

- [ ] Rate limiting enforced on all public endpoints (verified via test)
- [ ] CAPTCHA validated server-side before any DB write
- [ ] Honeypot field rejects bot submissions silently
- [ ] Email enumeration impossible — same response for existing/new emails
- [ ] Subdomain reservation is atomic — race condition cannot produce duplicate tenants
- [ ] Email verification token is HMAC-signed and single-use
- [ ] Temp password is 32 chars, bcrypt-hashed, forces change on first login
- [ ] Razorpay webhook signature verified for self-signup orders
- [ ] Amount verification matches plan price — mismatch blocks provisioning
- [ ] No Razorpay secrets in frontend responses
- [ ] No PII in application logs (email/phone not logged)
- [ ] Reserved subdomain blocklist enforced

### Functional Gates (BLOCKING)

- [ ] Trial flow: form → email verification → tenant provisioned → welcome email sent
- [ ] Paid flow: form → Razorpay checkout → webhook → tenant provisioned → welcome email sent
- [ ] Subdomain real-time availability check works with debounce
- [ ] Plan listing shows only `standalone_teacher` active plans
- [ ] Teacher can log in to provisioned subdomain with temp password
- [ ] First login forces password change
- [ ] After password change, teacher accesses the Owner dashboard
- [ ] Only Owner + Student roles exist on the provisioned tenant
- [ ] Subscription plan correctly assigned (trial or paid)
- [ ] Expired pending registrations cleaned up by scheduled command
- [ ] Subdomain released after expiry — available for new signups
- [ ] Duplicate email signup returns generic message (no leak)
- [ ] Duplicate subdomain signup returns user-friendly conflict error
- [ ] One trial per email enforced
- [ ] Upgrade button visible on trial tenant dashboard
- [ ] Upgrade flow creates Razorpay Order and completes via webhook
- [ ] Idempotency key prevents duplicate pending registrations

### Architecture Gates (BLOCKING)

- [ ] PHPStan Level 5: zero new errors
- [ ] All existing tests pass (zero regression)
- [ ] Public endpoints have NO auth middleware — only rate limiting and CAPTCHA
- [ ] Provisioning reuses existing `CreateTenantUseCase` — no duplicate logic
- [ ] Domain events dispatched outside transactions
- [ ] Audit logs written outside transactions
- [ ] No `env()` calls in new code
- [ ] `teacher_signup_requests` table is in `central/` migrations directory
- [ ] Controllers < 20 lines per method

### Test Requirements (Minimum 25-30 new tests)

- [ ] Unit: signup request entity status transitions
- [ ] Unit: HMAC token generation and verification
- [ ] Unit: subdomain validation against blocklist
- [ ] Feature: trial signup → email verification → tenant provisioned
- [ ] Feature: paid signup → Razorpay Order created → webhook → tenant provisioned
- [ ] Feature: duplicate email returns generic response (no enumeration)
- [ ] Feature: duplicate subdomain returns 409 conflict
- [ ] Feature: expired pending registration → subdomain released
- [ ] Feature: email verification link single-use
- [ ] Feature: email verification link expired → 410 Gone
- [ ] Feature: one trial per email enforced
- [ ] Feature: invalid plan_id → 422
- [ ] Feature: plan with wrong tenant_category → 422
- [ ] Feature: rate limiting blocks excessive requests
- [ ] Feature: honeypot field populated → silent rejection
- [ ] Feature: provisioned tenant has Owner + Student roles only
- [ ] Feature: provisioned tenant has correct tenant_category
- [ ] Feature: welcome email sent after provisioning
- [ ] Feature: upgrade from trial → paid plan via tenant dashboard
- [ ] Feature: amount mismatch on webhook → provisioning blocked
- [ ] Integration: full trial flow end-to-end
- [ ] Integration: full paid flow end-to-end

---

## 13. Risk Register

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| R1 | `ProvisionDefaultRolesListener` is queued — owner user creation fails because Owner role doesn't exist yet | **CRITICAL** | Developer must verify if listener is sync or queued. If queued, either make it sync for this flow or create Owner role inline before user creation. |
| R2 | Razorpay webhook arrives before the `teacher_signup_requests` DB transaction commits (race condition) | **HIGH** | Use `DB::afterCommit()` to ensure the pending registration is committed before Razorpay can possibly send a webhook. The webhook handler must handle "record not found" by retrying (Razorpay retries webhooks). |
| R3 | MySQL doesn't support partial unique indexes — subdomain uniqueness for active registrations is hard to enforce at DB level | **HIGH** | Application-level enforcement with `SELECT FOR UPDATE` inside a transaction. Cleanup command prevents stale records from blocking. |
| R4 | Email delivery delay causes teacher to click "Resend" multiple times, creating multiple verification tokens | **MEDIUM** | Only one active pending registration per email. Resend updates the existing record's token, doesn't create a new one. |
| R5 | Razorpay Order created but form submission DB transaction fails — orphan order in Razorpay | **LOW** | Razorpay orders auto-expire after 30 minutes. No cleanup needed. Financial impact: zero (order was never paid). |
| R6 | Marketing site passes invalid `plan_code` parameter — page shows no plan preselected | **LOW** | Frontend treats URL parameter as a hint. If plan not found, show all plans without preselection. |
| R7 | High volume of trial signups used for subdomain squatting despite CAPTCHA | **MEDIUM** | Monitor signup volume. If abuse detected, add email domain restrictions (block disposable email providers) or require phone OTP verification. Not in v1 scope — documented as future hardening. |

---

## 14. Implementation Sequence

| Step | Task | Depends On | Est. Days |
|---|---|---|---|
| 1 | Create `teacher_signup_requests` migration | — | 0.5 |
| 2 | Domain: signup request entity, status value object, HMAC token service | Step 1 | 1 |
| 3 | `CreateTrialSignupRequestUseCase` + email verification flow | Step 2 | 1 |
| 4 | `CreatePaidSignupRequestUseCase` + Razorpay Order integration | Step 2 | 1 |
| 5 | `ProvisionTeacherTenantUseCase` (shared by both paths) | Steps 3, 4 | 1 |
| 6 | Extend `ProcessWebhookUseCase` for self-signup orders | Steps 4, 5 | 0.5 |
| 7 | Public API controllers + rate limiting + CAPTCHA validation | Steps 3, 4 | 0.5 |
| 8 | Frontend: signup page, form, subdomain checker, Razorpay checkout | Step 7 | 1.5 |
| 9 | Upgrade button + tenant-facing billing endpoints | Step 5 | 1 |
| 10 | Scheduled cleanup command | Step 1 | 0.5 |
| 11 | Tests | All steps | 1.5 |
| 12 | Full test suite + PHPStan | Step 11 | 0.5 |

**Total: ~10 days** (5-7 days backend, 2-3 days frontend)

---

## 15. File Manifest

### New Files (~20-25)

**Database:**
- `database/migrations/central/2026_03_30_*_create_teacher_signup_requests_table.php`

**Domain:**
- `app/Domain/Public/TeacherSignup/Entities/TeacherSignupRequestEntity.php`
- `app/Domain/Public/TeacherSignup/ValueObjects/SignupRequestStatus.php`
- `app/Domain/Public/TeacherSignup/ValueObjects/SignupType.php`
- `app/Domain/Public/TeacherSignup/Repositories/TeacherSignupRequestRepositoryInterface.php`
- `app/Domain/Public/TeacherSignup/Exceptions/SubdomainAlreadyReservedException.php`
- `app/Domain/Public/TeacherSignup/Exceptions/EmailAlreadyRegisteredException.php`
- `app/Domain/Public/TeacherSignup/Exceptions/TrialAlreadyUsedException.php`
- `app/Domain/Public/TeacherSignup/Exceptions/SignupRequestExpiredException.php`
- `app/Domain/Public/TeacherSignup/Events/TeacherSignupRequestCreated.php`
- `app/Domain/Public/TeacherSignup/Events/TeacherSignupEmailVerified.php`
- `app/Domain/Public/TeacherSignup/Events/TeacherTenantProvisioned.php`

**Application:**
- `app/Application/Public/TeacherSignup/UseCases/CreateTrialSignupRequestUseCase.php`
- `app/Application/Public/TeacherSignup/UseCases/CreatePaidSignupRequestUseCase.php`
- `app/Application/Public/TeacherSignup/UseCases/VerifySignupEmailUseCase.php`
- `app/Application/Public/TeacherSignup/UseCases/ProvisionTeacherTenantUseCase.php`
- `app/Application/Public/TeacherSignup/UseCases/CheckSubdomainAvailabilityUseCase.php`
- `app/Application/Public/TeacherSignup/Commands/CleanupExpiredSignupRequestsCommand.php`

**Infrastructure:**
- `app/Infrastructure/Persistence/Public/TeacherSignup/EloquentTeacherSignupRequestRepository.php`
- `app/Infrastructure/Persistence/Public/TeacherSignup/TeacherSignupRequestRecord.php`
- `app/Infrastructure/Services/HmacEmailVerificationService.php`

**HTTP:**
- `app/Http/Public/TeacherSignup/Controllers/TeacherSignupReadController.php`
- `app/Http/Public/TeacherSignup/Controllers/TeacherSignupWriteController.php`
- `app/Http/Public/TeacherSignup/Requests/TrialSignupRequest.php`
- `app/Http/Public/TeacherSignup/Requests/PaidSignupRequest.php`

**Routes:**
- `routes/public/teacher_signup.php`

### Modified Files (~3-5)

- `ProcessWebhookUseCase.php` — extended for self-signup order IDs
- `routes/api.php` — include public teacher signup routes
- `app/Console/Kernel.php` (or `routes/console.php`) — register cleanup command schedule
- Tenant-facing billing routes file — add upgrade endpoints

### New Test Files (~3)

- `tests/Unit/Domain/Public/TeacherSignup/`
- `tests/Feature/Public/TeacherSignup/TrialSignupFlowTest.php`
- `tests/Feature/Public/TeacherSignup/PaidSignupFlowTest.php`

---

*End of Document — UBOTZ 2.0 Teacher Self-Onboarding Developer Instructions — March 30, 2026*
