# Phase C — One-time course purchase (student online) — Implementation plan

| Field | Value |
|-------|--------|
| **Parent doc** | `UBOTZ_2_STUDENT_FEE_COLLECTION_IMPLEMENTATION_PLAN.md` |
| **Spec** | `Ubotz_2_student_fee_collection_developer_instructions.md` (FR-01–04, FR-08–15) |
| **Date** | March 2026 |

---

## 1. Goal

Enable an authenticated **tenant student** to pay for a **paid course** in one shot using the **tenant’s** Razorpay account (Orders API + client-side checkout + server-side verify). Money must not use the platform `PaymentGatewayInterface` / subscription checkout.

**Out of scope for Phase C:** webhooks (Phase F), PDF receipt job (Phase G — stub queue OK), installment flows (Phase D), offline (Phase E).

---

## 2. Existing code to reuse

| Piece | Location | How to use |
|-------|----------|------------|
| Enrollment after pay | `EnrollStudentUseCase` | `execute($tenantId, $userId, $courseId, EnrollmentSource::PURCHASE->value, $idempotencyKey)` — already supports idempotency + paid course when source is `purchase`. |
| Purchase enrollment proof | `PaymentEnrollmentIntegrationTest` | Listener path works when `PaymentCompleted` + `itemType === 'course'`. |
| `PaymentCompleted` + `CreateEnrollmentOnPaymentCompleted` | `PaymentServiceProvider` | **Option A:** Dispatch `PaymentCompleted` after verify so enrollment stays event-driven. **Option B:** Call `EnrollStudentUseCase` directly in verify UseCase (simpler, fewer side effects). **Recommendation:** **Option B** for Phase C to avoid `GenerateStudentInvoiceOnPaymentCompleted` treating tenant Razorpay like legacy checkout (see §7). |
| Tenant Razorpay config | `TenantPaymentConfigRepositoryInterface` | `is_active`, credentials, `currency`. |
| Credential test | `TenantRazorpayCredentialsTesterInterface` | Pattern only; Orders API needs **new port** (create order). |
| DB columns | `payment_transactions` migration `2026_03_21_100001_*` | `tenant_id`, `idempotency_key`, `fee_transaction_type`, `fee_gateway`, `razorpay_order_id`, `razorpay_payment_id`, `razorpay_signature`, `completed_at`, etc. |
| Student API shell | `routes/api.php` → `auth:tenant_api` group | Add new route file e.g. `tenant_dashboard/student_payments.php` (no admin capability; any authenticated tenant user). |

---

## 3. Architecture (DDD)

| Layer | Responsibility |
|-------|----------------|
| **Domain** | New port: `TenantStudentRazorpayOrderGatewayInterface` — `createOrder(amountCents, currency, receiptId, notes): RazorpayOrderResult` (order id + amount for client). Optional: `verifyPaymentSignature(orderId, paymentId, signature, keySecret): bool` (or inline in UseCase). |
| **Application** | `InitiateCoursePurchaseCommand` / `InitiateCoursePurchaseUseCase`; `VerifyCoursePurchaseCommand` / `VerifyCoursePurchaseUseCase`. No HTTP, no Eloquent inside UseCases. |
| **Infrastructure** | HTTP client to Razorpay Orders API using decrypted key id/secret from config repo; Eloquent repository for **student fee** rows on `payment_transactions` (extend or add `StudentFeePaymentTransactionRepositoryInterface`). |
| **HTTP** | Thin controller + Form Requests; JSON: initiate returns `{ order_id, amount, currency, key_id }` (Razorpay standard checkout fields); verify accepts `razorpay_order_id`, `razorpay_payment_id`, `razorpay_signature`. |

**FR-02:** Create Razorpay Order **outside** `DB::transaction()`. Persist pending row **after** successful API response.

**FR-03 / FR-04:** Idempotency + signature verification **before** marking paid or enrolling.

---

## 4. Business rules checklist (Phase C)

| Rule | Implementation note |
|------|----------------------|
| FR-12 | Razorpay Order amount = course `price_amount_cents` (or domain equivalent). |
| FR-13 | If price is 0, return 422 / direct user to free enroll path (do not create order). |
| FR-14 | Reject if active enrollment already exists for `(user, course)`. |
| FR-09 | Tenant must have Razorpay configured **and** `is_active` on student payments. |
| FR-01 | Store amounts as cents (BIGINT) on transaction row; align with existing `payment_transactions.amount` if present. |
| Course published | Only `published` / `active` courses (match existing catalog rules). |

---

## 5. API design

**Prefix:** `/api/tenant/student/payments` (or `/api/tenant/student/fees/purchase` — pick one and document).

| Method | Path | Body | Response |
|--------|------|------|----------|
| `POST` | `.../course-purchase/initiate` | `{ "course_id": int }` | `{ "data": { "razorpay_order_id", "amount", "currency", "key_id" } }` |
| `POST` | `.../course-purchase/verify` | `{ "course_id", "razorpay_order_id", "razorpay_payment_id", "razorpay_signature" }` | `{ "data": { "enrolled": true } }` |

- **Middleware:** `auth:tenant_api` only (same as student meetings/quiz). **No** `tenant.capability` for students.
- **Idempotency (initiate):** e.g. deterministic key `sha1("course_purchase|{tenant_id}|{user_id}|{course_id}")` or accept optional client `Idempotency-Key` header — must satisfy UNIQUE(`tenant_id`, `idempotency_key`) for new rows.

**Initiate flow**

1. Resolve `tenant_id`, `user_id` from JWT.
2. Load course; validate status, price > 0, not already enrolled.
3. Load tenant payment config; fail if not configured / not active.
4. If pending transaction exists for same idempotency key with same order → return existing order payload (idempotent).
5. **Call Razorpay Orders API** (tenant key).
6. Insert `payment_transactions`: `status=pending`, `fee_transaction_type=course_purchase`, `fee_gateway=razorpay`, `item_type=course`, `item_id=course_id`, `user_id`, `tenant_id`, `idempotency_key`, `razorpay_order_id`, amount fields.

**Verify flow**

1. Load pending transaction by `razorpay_order_id` + `tenant_id` + `user_id` (and matching `course_id` / item).
2. Verify Razorpay signature (`order_id|payment_id` with key_secret).
3. If transaction already `completed` → 200 idempotent.
4. **Inside DB transaction:** update row (payment id, signature, `completed_at`, status paid); call `EnrollStudentUseCase` with `PURCHASE` + stable idempotency key (e.g. same as initiate or `purchase:{transaction_id}`).
5. **After commit:** audit log (FR-06); optional domain event for notifications; **Phase G:** dispatch `GeneratePaymentReceiptJob` stub or TODO.

---

## 6. Implementation tasks (ordered)

| Step | Task |
|------|------|
| C-1 | **Domain:** `TenantStudentRazorpayOrderGatewayInterface` + DTO for order result; signature verify helper (domain service or gateway). |
| C-2 | **Infrastructure:** `RazorpayStudentOrderGateway` (Guzzle/HTTP) — create order; unit test with HTTP fake. |
| C-3 | **Repository:** Interface + Eloquent for insert/update/find pending fee transactions by idempotency key and by `razorpay_order_id` (tenant-scoped). |
| C-4 | **Application:** `InitiateCoursePurchaseUseCase` (command: tenantId, userId, courseId). |
| C-5 | **Application:** `VerifyCoursePurchaseUseCase` (command: tenantId, userId, courseId, orderId, paymentId, signature). |
| C-6 | **HTTP:** Form Requests (validation), controller, register routes under `auth:tenant_api`. |
| C-7 | **FeeServiceProvider / AppServiceProvider:** bind gateway + repository. |
| C-8 | **Tests (per TEST_CREATION_GUIDE):** Feature — happy path initiate+verify, duplicate initiate idempotent, verify wrong signature 422, already enrolled cannot initiate, cross-tenant order id 404, unauthenticated 401. |
| C-9 | **Docs:** Update `UBOTZ_2_STUDENT_FEE_COLLECTION_IMPLEMENTATION_PLAN.md` §9 when Phase C ships. |

---

## 7. Listener / invoice conflict

`GenerateStudentInvoiceOnPaymentCompleted` runs on **every** `PaymentCompleted` with `itemType === 'course'`. Tenant student checkouts should **not** go through legacy invoice flow if it assumes platform gateway data.

**Recommended for Phase C:**

- Do **not** dispatch `PaymentCompleted` for this path **or**
- Extend `GenerateStudentInvoiceOnPaymentCompleted` to **return early** when `fee_gateway` / `fee_transaction_type` indicates tenant student fee (once `PaymentTransaction` entity exposes those fields **or** use a dedicated `StudentFeePaymentCompleted` event for receipt only in Phase G).

Calling **`EnrollStudentUseCase` directly** from `VerifyCoursePurchaseUseCase` after DB commit is the smallest change for C; add `StudentFeePaymentCompleted` later for receipts/notifications if needed.

---

## 8. Frontend (minimal for E2E)

- Student course detail or catalog: “Pay & enroll” → call initiate → Razorpay Checkout.js with returned `order_id`, `key`, `amount` → on success call verify with `razorpay_payment_id` + signature.
- Can be a follow-up ticket **FE-C** after API is stable.

---

## 9. Risks

| Risk | Mitigation |
|------|------------|
| Razorpay test vs live keys | Document test key usage; integration test with mocked HTTP. |
| Race: double verify | Unique constraint on `razorpay_payment_id` per tenant or idempotent verify handler. |
| `payment_transactions` shared with platform | Always set `tenant_id` + `fee_transaction_type` for student rows; grep writers to avoid breaking subscription code. |

---

### 10. Implementation status

| Item | Status |
|------|--------|
| C-1–C-7 | **Done** — gateway, repo, use cases, HTTP, `FeeServiceProvider` bindings |
| C-8 | **Done** — `tests/Feature/TenantDashboard/Fee/StudentCoursePurchaseFeatureTest.php` |
| C-9 | **Done** — this doc + main implementation plan §9 |

**API:** `POST /api/tenant/student/payments/course-purchase/initiate` · `POST .../verify` (requires `module.lms`, tenant student payments **active** + Razorpay keys).
