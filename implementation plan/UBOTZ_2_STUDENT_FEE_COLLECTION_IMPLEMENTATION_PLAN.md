# UBOTZ 2.0 — Student Fee Collection Implementation Plan

| Field | Value |
|-------|--------|
| **Document type** | Implementation plan |
| **Date** | March 18, 2026 |
| **Prerequisite spec** | `Ubotz_2_student_fee_collection_developer_instructions.md` |
| **Architecture rules** | `Ubotz 2 developer instruction manual .md` |

---

## 0. Scope boundary (read first)

| Payment rail | Actor | Controller | This plan |
|--------------|-------|------------|-----------|
| **Platform subscription** | Tenant pays UBOTZ | Platform admins, central Razorpay, `tenant_subscriptions` | **Out of scope** |
| **Student fees** | Student pays school | Tenant admin config + student checkout, **tenant** Razorpay | **In scope** |

Do not route student checkout through the platform `PaymentGatewayInterface` used for subscription billing. Student money must settle in the **tenant’s** Razorpay account.

---

## 1. Current backend baseline

| Asset | State |
|-------|--------|
| `installment_orders` / `installment_order_payments` | Exists; steps `pending` / `paid` / `overdue` |
| Admin step recording | `POST .../installment-orders/{order}/payments` (reference + cents) |
| Student installment pay (online) | `POST .../student/payments/installment-step/initiate|verify` — **`installment_order_payment_id`** |
| Offline fee record (admin) | `POST .../fees/offline-payment` — **`fee.record_payment`** |
| Student fee webhook (Razorpay) | `POST /api/tenant/{tenantSlug}/webhooks/razorpay/student-payment` — configure URL in Razorpay dashboard per tenant account |
| `InstallmentOrderCompleted` + `GrantAccessOnInstallmentCompleted` | Fires when all steps paid — **reuse** after online/offline step pay |
| `payment_transactions` (tenant) | **Narrow schema** — must be **extended** (see §4) |
| `InitializeCheckoutUseCase` | Uses **platform** gateway — **not** for student fees |
| `course_enrollments` | Add `suspended` + suspension metadata for overdue enforcement |
| `notification_sent_log` | Exists — use for idempotent fee reminders |

---

## 2. Architecture (Developer Instruction Manual)

- **HTTP**: Thin controllers, Form Requests (syntax only), JSON Resources.
- **Application**: Commands + UseCases only; **no** Eloquent, `DB::`, HTTP, Razorpay, Storage, PDF in UseCases — inject **domain ports** (repositories + `TenantStudentRazorpayGatewayInterface`, `PaymentReceiptGeneratorInterface`, etc.) implemented in **Infrastructure**.
- **Domain**: Entities/VOs/events/exceptions + repository **interfaces** for fee config, transactions, receipt sequences.
- **Infrastructure**: Eloquent repos, encrypted config, Razorpay HTTP client, PDF queue job, file storage.
- **Tenant isolation**: Every command/query passes `tenant_id`; webhook resolves tenant → tenant DB context; queue jobs bind tenant.
- **Financial**: Amounts in **cents** (unsigned BIGINT where possible); **no Razorpay API inside `DB::transaction()`**; idempotency on transactions; signature before state change; pessimistic lock on `installment_order_payments` when marking step paid; **audit for payment mutations after DB commit** (per fee spec FR-06).

---

## 3. Implementation phases

### Phase A — Schema & domain ports ✅ *migrations + config path delivered*

| # | Task |
|---|------|
| A.1 | Migration: `tenant_payment_configs` (encrypted `razorpay_key_id`, `key_secret`, `webhook_secret`, `currency`, `overdue_suspend_days`, `is_active`) — **tenant DB**, scoped by `tenant_id`. |
| A.2 | Migration: extend `payment_transactions` — add columns per fee spec (`idempotency_key` UNIQUE per tenant, `transaction_type`, `installment_order_id`, `installment_order_payment_id`, `gateway`, `gateway_order_id`, `gateway_payment_id`, `offline_*`, `recorded_by`, `receipt_*`, `completed_at`, …); backfill strategy for legacy rows; align `amount_cents` unsigned. *(Central DB: nullable `tenant_id` + idempotent index adds where needed for SQLite/MySQL tests.)* |
| A.3 | Migration: `receipt_sequences` (`tenant_id`, `year`, `last_sequence` UNIQUE per tenant+year). |
| A.4 | Migration: `course_enrollments` — `suspended_at`, `suspension_reason`; allow status `suspended`. |
| A.5 | Domain: `Fee` context — **config** snapshot VO + `TenantPaymentConfigRepositoryInterface`; transaction/receipt interfaces **pending** (purchase flow). |
| A.6 | Infrastructure: Eloquent config repo; **`TenantRazorpayCredentialsTesterInterface`** + `RazorpayTenantCredentialsTester` (connection test). **Razorpay Orders** for checkout — **not yet**. |
| A.7 | **`FeeServiceProvider`** registers fee bindings. |

### Phase B — Tenant payment settings (admin) ✅ *delivered*

| # | Task |
|---|------|
| B.1 | UseCases: get masked config, upsert credentials (encrypt), test connection (Razorpay **outside** transaction). |
| B.2 | Routes: **`GET/PUT /api/tenant/settings/student-payment`**, **`POST .../student-payment/verify`** — `settings.view` (read) / `settings.manage` (write + verify). |
| B.3 | Responses: `razorpay_configured: true/false` only — **never** return secrets. |

### Phase C — One-time course purchase (student online) ✅ *delivered (backend)*

| # | Task |
|---|------|
| C.1 | `InitiateCoursePurchaseUseCase` + Razorpay Orders port — pending `payment_transactions` row, deterministic idempotency key. |
| C.2 | `VerifyCoursePurchaseUseCase` — HMAC verify → mark paid → `EnrollStudentUseCase` (purchase + idempotency); post-commit audit (**no** `PaymentCompleted` / legacy invoice). Receipt job: Phase G. |
| C.3 | `POST /api/tenant/student/payments/course-purchase/initiate` & `.../verify` (`auth:tenant_api`, `tenant.module:module.lms`). |
| C.4 | `StudentCoursePurchaseFeatureTest` — happy path, idempotent initiate/verify, 422/401/404 cases. |

**Detailed implementation plan:** `documentation/UBOTZ_2_PHASE_C_COURSE_PURCHASE_PLAN.md` (ports, APIs, enrollment strategy, tests, invoice listener note).

### Phase D — Installment step (student online) ✅ *delivered (backend)*

| # | Task |
|---|------|
| D.1 | `InitiateInstallmentStepPurchaseUseCase`: `InstallmentOrderRepositoryInterface::resolveStudentPayableStep` (order `open`, step `pending`/`overdue`, prior steps paid, exact step amount) → Razorpay Order + pending `payment_transactions` (`fee_transaction_type=installment_step`, idempotency per `installment_order_payment_id`). |
| D.2 | `VerifyInstallmentStepPurchaseUseCase`: HMAC verify → `FOR UPDATE` on `installment_order_payments` + `payment_transactions` → mark fee row paid → **`RecordInstallmentStepPaymentUseCase`** (same path as admin) → `InstallmentOrderCompleted` / listener when order completes. *(Lift suspension on overdue pay: Phase H.)* |
| D.3 | **`POST /api/tenant/student/payments/installment-step/initiate`** & **`.../verify`** — body includes `installment_order_payment_id` on both; verify also sends Razorpay ids + signature. |
| D.4 | **Unified** with admin installment recording via `RecordInstallmentStepPaymentUseCase` after online verify. |

### Phase E — Offline payments (tenant admin) ✅ *delivered (backend)*

| # | Task |
|---|------|
| E.1 | `RecordOfflineFeePaymentUseCase` — capability **`fee.record_payment`**; `recorded_by` → `payment_transactions.recorded_by`; **`kind`**: `course` (enroll via `EnrollStudentUseCase` + paid row) or `installment` (`resolveOfflinePayableStep` + paid row + `RecordInstallmentStepPaymentUseCase`). |
| E.2 | **`POST /api/tenant/fees/offline-payment`** (`tenant.module:module.lms`, **`tenant.capability:fee.record_payment`**). |

### Phase F — Razorpay webhook (safety net) ✅ *delivered (backend)*

| # | Task |
|---|------|
| F.1 | **`POST /api/tenant/{tenantSlug}/webhooks/razorpay/student-payment`** — no JWT; **`X-Razorpay-Signature`** = HMAC-SHA256(raw body, tenant `razorpay_webhook_secret`); throttle; tenant resolved by **slug** (central `tenants`), **404** if not `active`. |
| F.2 | **`HandleRazorpayStudentWebhookUseCase`**: **`payment.captured`** → find pending student fee row by `razorpay_order_id` + amount match → course: lock/mark paid/enroll; installment: lock IOP + fee row / `RecordInstallmentStepPaymentUseCase`. Unknown order → **200 ack** (ignore). **`payment.failed`** → pending row → **`failed`**. Duplicate capture → **200**, idempotent. |

### Phase G — Receipts ✅ *delivered (backend)*

| # | Task |
|---|------|
| G.1 | **`GenerateStudentFeeReceiptJob`** (`ShouldQueue`): after successful pay, **`QueueStudentFeeReceipt::afterPayment`** (via `DB::afterCommit`) from verify course/installment, offline record, webhook capture. Locks `payment_transactions` + **`receipt_sequences`**; number **`{TENANTCODE}-RCP-{YEAR}-{#####}`** (code from tenant **slug**); Blade **`pdf.student_fee_receipt`** → DomPDF → **`Storage` disk `local`** under `fee_receipts/{tenantId}/…pdf`; updates **`receipt_number`** / **`receipt_file_path`**. Idempotent if already generated. **Production:** run queue workers. |

### Phase H — Overdue, reminders, suspension ✅ *delivered (backend)*

| # | Task |
|---|------|
| H.1 | **`fee:detect-overdue`** — `DetectOverdueInstallmentPaymentsUseCase`; per active tenant (with `TenantContext` for audit); `pending` + `due_date` &lt; start of today → `overdue`; audit `fee.installment_overdue_detected`. |
| H.2 | **`fee:send-reminders`** — T−7: `pending` + `due_date` = today+7d; T+1 overdue: `overdue` + `due_date` = yesterday; in-app billing notifications; dedupe `notification_sent_log` (`fee_reminder_due_in_7d` / `fee_reminder_overdue_day1` + `installment_order_payment` id). |
| H.3 | **`fee:enforce-overdue-suspension`** — course orders only; `due_date` ≤ today − `overdue_suspend_days` (skip if days &lt; 1); `FeeInstallmentEnrollmentLifecycleService` sets `suspended` + `fee_installment_overdue`; audit `fee.enrollment_suspended_overdue`. |
| H.4 | **`RecordInstallmentStepPaymentUseCase`** after save: if step was overdue and item is **course**, `reactivateAfterOverdueStepPaid` + audit `fee.enrollment_reactivated_after_overdue_payment`. |
| H.5 | **`routes/console.php`**: `fee:detect-overdue` daily **00:15**, `fee:send-reminders` daily **08:00**, `fee:enforce-overdue-suspension` daily **01:00**. |
| — | Tests: `FeeOverdueSuspensionPhaseHFeatureTest`; `EnrollmentStatus::SUSPENDED`. |

### Phase I — Read APIs ✅ *delivered (backend)*

| # | Task |
|---|------|
| I.1 | **Student** (`auth:tenant_api`, `module.lms`): **`GET /api/tenant/student/payments/fees/summary`**, **`.../installments`**, **`.../transactions`**, **`.../transactions/{id}/receipt`** (PDF). `FeeReadQueryInterface` + `EloquentFeeReadQuery`. |
| I.2 | **Admin** **`fee.view`**: **`GET /api/tenant/fees/ledger`**, **`.../stats`**, **`.../overdue-installments`**, **`.../transactions`**, **`.../students/{userId}`**, **`.../transactions/{id}/receipt`**. Query params: `search`, `page`, `per_page`, `user_id`, `status`. |
| I.3 | **`fee.view`** / **`fee.record_payment`** already in **`TenantCapabilitySeeder`**. |
| — | Tests: **`FeeReadApisPhaseIFeatureTest`**. |

### Phase J — Frontend ✅ *delivered*

| # | Task |
|---|------|
| J.1 | **`/tenant-admin-dashboard/fees`** — stats, ledger (search/pagination), overdue list, transactions + receipt download; **Record offline** tab (`fee.record_payment`); user search (`user.view`) or numeric user ID; course picker (`course.view`) or course ID; **`/fees/students/[userId]`** detail. Sidebar: **Student fees** if `fee.view` **or** `fee.record_payment`. Settings: **`/settings/student-payment`**. |
| J.2 | **`/student-dashboard/fees`** — **My fees**: summary, installment steps with **Razorpay Pay**, payment history + receipt download. Sidebar **My fees** (`course.view`). Course browse still uses existing **Pay & enroll** checkout. |
| — | **E2E (Playwright):** `frontend/e2e/fees/` — guest redirect tests; optional `E2E_TENANT_ADMIN_*` / `E2E_STUDENT_*` for full UI. Run `npm run e2e:fees`. See **`e2e/fees/README.md`**. |

---

## 4. `payment_transactions` evolution

- **Preferred**: single table extended with nullable new columns; legacy rows remain valid for non-fee features until migrated.
- Add **UNIQUE(`tenant_id`, `idempotency_key`)** for new flows.
- Deprecate or map `gateway_name` / `gateway_transaction_id` to new `gateway` / `gateway_payment_id` for new code paths.

---

## 5. API naming

- Follow existing project convention **`/api/tenant/...`** (avoid introducing `/api/v1/...` unless platform-wide decision).
- Student endpoints under authenticated **tenant student** prefix consistent with quizzes/meetings.

---

## 6. Testing (minimum)

- Same webhook twice → one completed transaction (Phase F).
- Concurrent two verifies on same installment step → one wins (**`FOR UPDATE`** on `installment_order_payments` + fee row in D.2).
- Cross-tenant webhook / student cannot pay another tenant’s course.
- Offline payment creates same enrollment as online for equivalent one-time purchase (**`OfflineFeePaymentFeatureTest`**).
- **`StudentInstallmentStepPurchaseFeatureTest`** — installment initiate/verify + paid step + `installment_step` transaction row.
- Receipt PDF + **`receipt_number`** after course verify (**`StudentCoursePurchaseFeatureTest`**).
- Overdue → suspend → pay → active (Phase H).

---

## 7. Definition of done

Matches fee instruction doc §18: tenant config, student purchase + installment + offline, webhook, receipts, overdue cycle, dashboards, isolation, cents-only, no Razorpay-in-transaction, locked step updates.

---

## 8. Dependencies & risks

| Risk | Mitigation |
|------|------------|
| Schema clash with old `payment_transactions` writers | Grep all usages; migrate `AdminGrantSubscriptionUseCase` / tests if they share table. |
| Order status naming (`open` vs doc `active`) | Explicit mapping table in UseCase docblock. |
| Queue workers multi-tenant | Pass `tenant_id` into job; switch connection/context at start of `handle()`. |

---

## 9. Implementation status (March 2026)

### 9.1 Summary

| Phase | Status |
|-------|--------|
| **A** | **Done (partial):** schema A.1–A.4 incl. **`receipt_sequences`**; Fee config + receipt job on paid rows. |
| **B** | **Done:** tenant student-payment settings HTTP API + Form Requests + UseCases. |
| **C** | **Done:** backend initiate/verify + **student UI** — Browse courses, course page, Razorpay Checkout.js. |
| **D** | **Done (backend):** student installment-step initiate/verify; shared `RecordInstallmentStepPaymentUseCase`. |
| **E** | **Done (backend):** offline course + offline installment; **`fee.record_payment`**. |
| **F** | **Done (backend):** tenant-scoped student payment webhook (`payment.captured` / `payment.failed`). |
| **G** | **Done (backend):** queued PDF receipt + sequence (sync in PHPUnit). |
| **H** | **Not started** (overdue jobs / suspension). |
| **I** | **Partial:** capabilities seeded; no fee ledger/read APIs yet. |
| **J** | **Partial (FE-A):** tenant admin **Student payment settings** UI only; installment checkout + offline form + ledger UIs still pending. |

### 9.2 Backend deliverables (completed)

| Item | Location / notes |
|------|------------------|
| Migrations | `tenant_payment_configs`; extended `payment_transactions`; `receipt_sequences`; `course_enrollments` suspension fields |
| Settings API | `TenantStudentPaymentSettingsController`; `GetTenantStudentPaymentConfigUseCase`, `UpsertTenantStudentPaymentConfigUseCase`, `VerifyTenantStudentPaymentRazorpayUseCase` |
| Routes | `routes/tenant_dashboard/settings.php` — `/student-payment` (+ verify) |
| Model | `TenantPaymentConfigRecord` (encrypted casts) |
| Capabilities | `settings.view` / `settings.manage` on routes; `fee.view`, `fee.record_payment` in seeder for later phases |
| Phase C API | `StudentCoursePurchaseController`; `InitiateCoursePurchaseUseCase`, `VerifyCoursePurchaseUseCase`; `RazorpayStudentOrderGateway`; `StudentFeePaymentTransactionRepository` (`payment_transactions`; idempotency scoped by `fee_transaction_type`: `course_purchase` / `installment_step`) |
| Phase C routes | `routes/tenant_dashboard/student_payments.php` — `course-purchase/initiate`, `course-purchase/verify` |
| Phase D API | `StudentInstallmentStepPurchaseController`; `InitiateInstallmentStepPurchaseUseCase`, `VerifyInstallmentStepPurchaseUseCase` |
| Phase D routes | Same file — `installment-step/initiate`, `installment-step/verify` |
| Installment pay context | `StudentInstallmentStepPayContext`; `InstallmentOrderRepositoryInterface::resolveStudentPayableStep`, `resolveOfflinePayableStep` |
| Phase E API | `OfflineFeePaymentController`; `RecordOfflineFeePaymentUseCase` |
| Phase E routes | `routes/tenant_dashboard/fees.php` — `POST /api/tenant/fees/offline-payment` |
| Phase F API | `StudentRazorpayWebhookController`; `HandleRazorpayStudentWebhookUseCase`; repo: `findPendingStudentFeeByRazorpayOrderId`, `markFailed`; `getRazorpayWebhookSecretForVerification` |
| Phase F route | `routes/api.php` (public) — `tenant/{tenantSlug}/webhooks/razorpay/student-payment` |
| Phase G | `GenerateStudentFeeReceiptJob`; `QueueStudentFeeReceipt`; view `resources/views/pdf/student_fee_receipt.blade.php` |

### 9.3 Frontend deliverables (completed — FE-A)

| Item | Location / notes |
|------|------------------|
| Page | `frontend/app/tenant-admin-dashboard/settings/student-payment/page.tsx` |
| Service + hooks | `tenant-student-payment-settings-service.ts`, `use-tenant-student-payment-settings.ts` |
| Navigation | Sidebar **Student payments**; settings hub card; top bar title |
| API config | `TENANT.STUDENT_PAYMENT_SETTINGS`, `..._VERIFY` in `api-endpoints.ts` |

### 9.4 Automated tests (completed)

Per `TEST_CREATION_GUIDE.md`:

| Suite | File |
|-------|------|
| Feature | `tests/Feature/TenantAdminDashboard/Settings/TenantStudentPaymentSettingsTest.php` — GET defaults, auth, capabilities, PUT persist/validation/activate rules, verify inline/stored, tenant isolation |
| Feature | `tests/Feature/TenantDashboard/Fee/StudentCoursePurchaseFeatureTest.php` — Phase C purchase flow |
| Feature | `tests/Feature/TenantDashboard/Fee/StudentInstallmentStepPurchaseFeatureTest.php` — Phase D initiate/verify + step paid + fee row |
| Feature | `tests/Feature/TenantDashboard/Fee/OfflineFeePaymentFeatureTest.php` — Phase E course + installment offline; 403 without `fee.record_payment` |
| Feature | `tests/Feature/TenantDashboard/Fee/StudentRazorpayStudentPaymentWebhookTest.php` — Phase F capture/fail/signature/404/duplicate |
| Unit | `tests/Unit/Application/TenantAdminDashboard/Fee/UpsertTenantStudentPaymentConfigUseCaseTest.php` |
| Unit | `tests/Unit/Application/TenantAdminDashboard/Fee/VerifyTenantStudentPaymentRazorpayUseCaseTest.php` |

### 9.5 Next up (suggested order)

1. **Phase H** — overdue / reminders / suspension commands + scheduler; reactivate enrollment when overdue step paid.  
2. **Phase I** — read APIs + **receipt download** (signed URL or stream from `receipt_file_path`).  
3. **Phase J** — ledger / My Fees / offline form UI. **Ops:** `php artisan queue:work` so receipt PDFs generate after payment in production.

*End of implementation plan.*
