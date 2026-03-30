# Database Migration Performance & Security Remediation Plan

**Document Version:** 1.0
**Date:** March 26, 2026
**Scope:** All migration files in `backend/database/migrations/`
**Reference:** CLAUDE.md — UBOTZ Platform Architecture Rules
**Priority Legend:** P0 = Security / Data Breach Risk · P1 = Performance / Correctness · P2 = Scalability / Design · P3 = Convention / Maintainability

---

## Executive Summary

A full audit of 268 migration files identified **46 distinct issues** across 9 categories. The most critical findings are:

- **3 tenant tables with no `tenant_id` column** — cross-tenant data exposure is possible today
- **WhatsApp broadcast recipients stored as a JSON array** — cannot be queried, cascade-deleted, or retry-delivered per recipient
- **15+ foreign key columns with no index** — JOINs and relationship lookups cause full table scans
- **7 missing composite indexes** — high-frequency query patterns (subscription renewals, payment reports, quiz listings) run unoptimised
- **FLOAT used for average rating** — floating-point arithmetic corrupts displayed values
- **`amount_cents` as INTEGER in payment_transactions** — overflows at ~$21M per transaction

This plan is organised into **7 phases**, ordered strictly by severity. Phases 1 and 2 (P0) must ship before any production data enters the system. Phases 3–5 (P1) should land before the first paid tenant. Phases 6–7 (P2/P3) are hardening work to complete before scale.

Each phase produces one or more new migration files. **Never alter an already-ran migration file.** All fixes are additive ALTERs or new table creations.

---

## Phase 1 — Critical Security Fixes (P0 · Ship Before Any Production Data)

**Risk if skipped:** Cross-tenant data leaks, GDPR violations, silent privilege escalation
**Files touched:** 4 new ALTER migrations
**Blocking:** Yes — Phases 2–7 may proceed in parallel after this lands

### 1.1 Add `tenant_id` to `live_sessions`

**Problem:** `live_sessions` has `course_id`, `chapter_id`, `creator_id` but no `tenant_id`. Any authenticated user can query all live sessions across all tenants.

**New migration:** `backend/database/migrations/tenant/2026_03_26_300001_add_tenant_id_to_live_sessions.php`

```php
Schema::table('live_sessions', function (Blueprint $table) {
    $table->unsignedBigInteger('tenant_id')->after('id');
    $table->index('tenant_id', 'idx_live_sessions_tenant');
    $table->foreign('tenant_id', 'fk_live_sessions_tenant')
          ->references('id')->on('tenants')->onDelete('cascade');
});
```

**Follow-up required (application layer):**
- Add `tenant_id` to `LiveSession` Eloquent model `$fillable`
- Add global scope `TenantScope` to `LiveSession` model if not already applied via base model
- Backfill: derive `tenant_id` from `course_id → courses.tenant_id` before running this migration in staging

---

### 1.2 Add `tenant_id` to `course_reviews`

**Problem:** `course_reviews` has no `tenant_id`. Reviews from Tenant A are visible to Tenant B.

**New migration:** `backend/database/migrations/tenant/2026_03_26_300002_add_tenant_id_to_course_reviews.php`

```php
Schema::table('course_reviews', function (Blueprint $table) {
    $table->unsignedBigInteger('tenant_id')->after('id');
    $table->index('tenant_id', 'idx_course_reviews_tenant');
    $table->foreign('tenant_id', 'fk_course_reviews_tenant')
          ->references('id')->on('tenants')->onDelete('cascade');
});
```

**Backfill:** derive from `course_id → courses.tenant_id`.

---

### 1.3 Add `tenant_id` to `certificates` and `certificate_templates`

**Problem:** Both tables in `create_certificates_tables.php` lack `tenant_id`. Certificate verification endpoints can expose another tenant's certificates.

**New migration:** `backend/database/migrations/tenant/2026_03_26_300003_add_tenant_id_to_certificates.php`

```php
Schema::table('certificate_templates', function (Blueprint $table) {
    $table->unsignedBigInteger('tenant_id')->after('id');
    $table->index('tenant_id', 'idx_cert_templates_tenant');
    $table->foreign('tenant_id', 'fk_cert_templates_tenant')
          ->references('id')->on('tenants')->onDelete('cascade');
});

Schema::table('certificates', function (Blueprint $table) {
    $table->unsignedBigInteger('tenant_id')->after('id');
    $table->index('tenant_id', 'idx_certificates_tenant');
    $table->foreign('tenant_id', 'fk_certificates_tenant')
          ->references('id')->on('tenants')->onDelete('cascade');
});
```

**Backfill:** derive from `student_id → users.tenant_id`.

---

### 1.4 Add `tenant_id` to `assignment_submissions`

**Problem:** `assignment_submissions` is tenant data but scoped only indirectly through `assignment_id`. Direct queries without a tenant scope leak data.

**New migration:** `backend/database/migrations/tenant/2026_03_26_300004_add_tenant_id_to_assignment_submissions.php`

```php
Schema::table('assignment_submissions', function (Blueprint $table) {
    $table->unsignedBigInteger('tenant_id')->after('id');
    $table->index('tenant_id', 'idx_assignment_submissions_tenant');
    $table->foreign('tenant_id', 'fk_assignment_submissions_tenant')
          ->references('id')->on('tenants')->onDelete('cascade');
});
```

**Backfill:** derive from `assignment_id → assignments.tenant_id`.

---

## Phase 2 — Critical Architecture Fix: WhatsApp Recipient Junction Table (P0)

**Risk if skipped:** Cannot query "was lead X sent this broadcast?", cannot retry failed recipients, cannot cascade-delete leads, O(n) JSON scans on every recipient lookup
**Files touched:** 1 new table migration, 1 DROP COLUMN migration
**Blocking:** Yes — WhatsApp broadcast send/retry logic depends on this structure

### 2.1 Replace `recipient_lead_ids` JSON Column with Junction Table

**Problem:** `whatsapp_broadcasts_recipient_lead_ids.php` adds a JSON column `recipient_lead_ids` to `whatsapp_broadcasts`. This stores an array of lead IDs inline, making per-recipient queries impossible in SQL.

**Step A — Create junction table**

**New migration:** `backend/database/migrations/2026_03_26_310001_create_whatsapp_broadcast_recipients_table.php`

```php
Schema::create('whatsapp_broadcast_recipients', function (Blueprint $table) {
    $table->id();
    $table->unsignedBigInteger('broadcast_id');
    $table->unsignedBigInteger('lead_id');
    $table->string('status', 20)->default('queued');  // queued, sent, delivered, read, failed
    $table->timestamp('sent_at')->nullable();
    $table->timestamp('delivered_at')->nullable();
    $table->timestamp('read_at')->nullable();
    $table->timestamp('failed_at')->nullable();
    $table->string('failure_reason', 255)->nullable();
    $table->timestamps();

    $table->unique(['broadcast_id', 'lead_id'], 'uq_broadcast_lead');
    $table->index(['broadcast_id', 'status'], 'idx_wbr_broadcast_status');
    $table->index(['lead_id', 'status'], 'idx_wbr_lead_status');
    $table->index('status', 'idx_wbr_status');

    $table->foreign('broadcast_id')
          ->references('id')->on('whatsapp_broadcasts')->onDelete('cascade');
    $table->foreign('lead_id')
          ->references('id')->on('leads')->onDelete('cascade');
});
```

**Step B — Backfill from existing JSON column (run before Step C)**

In a one-time Artisan command or tinker script (not inside migration):

```php
// Pseudo-code — adapt to actual model names
WhatsappBroadcast::whereNotNull('recipient_lead_ids')->each(function ($broadcast) {
    $leadIds = $broadcast->recipient_lead_ids; // already decoded by cast
    foreach ($leadIds as $leadId) {
        WhatsappBroadcastRecipient::firstOrCreate([
            'broadcast_id' => $broadcast->id,
            'lead_id'      => $leadId,
        ], ['status' => 'queued']);
    }
});
```

**Step C — Drop the JSON column**

**New migration:** `backend/database/migrations/2026_03_26_310002_drop_recipient_lead_ids_from_whatsapp_broadcasts.php`

```php
Schema::table('whatsapp_broadcasts', function (Blueprint $table) {
    $table->dropColumn('recipient_lead_ids');
});
```

> **Important:** Run Step B (backfill command) between applying Step A and Step C migrations in production. In staging it can be a single deploy with seeded data.

**Application layer changes required:**
- Create `WhatsappBroadcastRecipient` Eloquent model with `$fillable`, relationship to `WhatsappBroadcast` and `Lead`
- Update `WhatsappBroadcast` model: replace `recipient_lead_ids` cast with `hasMany(WhatsappBroadcastRecipient::class)`
- Update broadcast dispatch job to insert rows into `whatsapp_broadcast_recipients` instead of building a JSON array
- Update status webhook handler to update the individual recipient row instead of a broadcast-level flag

---

## Phase 3 — Missing Indexes on Foreign Keys (P1)

**Risk if skipped:** Full table scans on every JOIN and relationship eager-load; these become progressively worse as data grows
**Files touched:** 4 new ALTER migrations
**Blocking:** No — can ship independently after Phase 1

All index names follow the convention `idx_{table}_{column}`.

### 3.1 Index Foreign Keys in `live_sessions`

**New migration:** `backend/database/migrations/tenant/2026_03_26_320001_index_live_sessions_fk_columns.php`

```php
Schema::table('live_sessions', function (Blueprint $table) {
    $table->index('course_id',   'idx_live_sessions_course');
    $table->index('chapter_id',  'idx_live_sessions_chapter');
    $table->index('creator_id',  'idx_live_sessions_creator');
});
```

### 3.2 Index Foreign Keys in `course_reviews`

**New migration:** `backend/database/migrations/tenant/2026_03_26_320002_index_course_reviews_fk_columns.php`

```php
Schema::table('course_reviews', function (Blueprint $table) {
    $table->index('course_id',   'idx_course_reviews_course');
    $table->index('creator_id',  'idx_course_reviews_creator');
});
```

### 3.3 Index Foreign Keys in `certificates`

**New migration:** `backend/database/migrations/tenant/2026_03_26_320003_index_certificates_fk_columns.php`

```php
Schema::table('certificates', function (Blueprint $table) {
    $table->index('student_id',     'idx_certificates_student');
    $table->index('course_id',      'idx_certificates_course');
    $table->index('quiz_id',        'idx_certificates_quiz');
    $table->index('quiz_result_id', 'idx_certificates_quiz_result');
});
```

### 3.4 Index Foreign Keys in `admin_role_assignments`

**New migration:** `backend/database/migrations/central/2026_03_26_320004_index_admin_role_assignments_fk_columns.php`

```php
Schema::table('admin_role_assignments', function (Blueprint $table) {
    $table->index('role_id',     'idx_ara_role');
    $table->index('assigned_by', 'idx_ara_assigned_by');
    $table->index('revoked_by',  'idx_ara_revoked_by');
});
```

### 3.5 Index `author_id` in `lead_notes`

**New migration:** `backend/database/migrations/tenant/2026_03_26_320005_index_lead_notes_author.php`

```php
Schema::table('lead_notes', function (Blueprint $table) {
    $table->index('author_id', 'idx_lead_notes_author');
});
```

---

## Phase 4 — Missing Composite Indexes for Query Patterns (P1)

**Risk if skipped:** Subscription renewal jobs, payment reports, quiz listing endpoints, and plan management pages all degrade at scale
**Files touched:** 5 new ALTER migrations

### 4.1 Composite Indexes on `tenant_subscriptions`

**Query patterns addressed:**
- Renewal job: `WHERE status = 'active' AND current_period_ends_at < NOW()`
- Plan report: `WHERE plan_id = ? AND status = ?`

**New migration:** `backend/database/migrations/central/2026_03_26_330001_add_composite_indexes_to_tenant_subscriptions.php`

```php
Schema::table('tenant_subscriptions', function (Blueprint $table) {
    // For renewal sweeper jobs
    $table->index(['status', 'current_period_ends_at'], 'idx_ts_status_period_end');
    // For plan-level reporting
    $table->index(['plan_id', 'status'], 'idx_ts_plan_status');
});
```

### 4.2 Composite Index on `payment_transactions`

**Query pattern:** Tenant-wide payment report filtered by status

**New migration:** `backend/database/migrations/tenant/2026_03_26_330002_add_composite_index_to_payment_transactions.php`

```php
Schema::table('payment_transactions', function (Blueprint $table) {
    $table->index(['tenant_id', 'status'], 'idx_pt_tenant_status');
    $table->index(['tenant_id', 'created_at'], 'idx_pt_tenant_created');
});
```

### 4.3 Composite Index on `sales`

**Query pattern:** User purchase history with date-range pagination

**New migration:** `backend/database/migrations/tenant/2026_03_26_330003_add_composite_index_to_sales.php`

```php
Schema::table('sales', function (Blueprint $table) {
    $table->index(['buyer_id', 'created_at'], 'idx_sales_buyer_created');
});
```

### 4.4 Index `parent_id` on `categories`

**Query pattern:** Hierarchical subcategory listing

**New migration:** `backend/database/migrations/tenant/2026_03_26_330004_index_categories_parent_id.php`

```php
Schema::table('categories', function (Blueprint $table) {
    $table->index('parent_id', 'idx_categories_parent');
});
```

### 4.5 Composite Index on `subscription_plans`

**Query pattern:** "Get active plans ordered by sort_order" (plan listing page)

**New migration:** `backend/database/migrations/central/2026_03_26_330005_add_composite_index_to_subscription_plans.php`

```php
Schema::table('subscription_plans', function (Blueprint $table) {
    $table->index(['status', 'sort_order'], 'idx_plans_status_sort');
});
```

### 4.6 Composite Indexes on `quizzes`

**Problem:** Multiple single-column indexes exist on `tenant_id`, `course_id`, `exam_id`, etc. These are redundant when queries always filter by `tenant_id` first.

**New migration:** `backend/database/migrations/tenant/2026_03_26_330006_optimise_quiz_indexes.php`

```php
Schema::table('quizzes', function (Blueprint $table) {
    // Quiz listing for a tenant filtered by status (most common)
    $table->index(['tenant_id', 'status'], 'idx_quizzes_tenant_status');
    // Course quiz tab
    $table->index(['tenant_id', 'course_id'], 'idx_quizzes_tenant_course');
});
```

---

## Phase 5 — Data Type Correctness (P1)

**Risk if skipped:** Rating displays like "4.19999999" to students; payment amounts overflow at $21M
**Files touched:** 2 new ALTER migrations

### 5.1 Fix `average_rating` to `DECIMAL` in `course_reviews`

**Problem:** `average_rating FLOAT` produces floating-point precision errors. `DECIMAL(3,2)` stores values in range 0.00–5.00 exactly.

**New migration:** `backend/database/migrations/tenant/2026_03_26_340001_fix_average_rating_type_in_course_reviews.php`

```php
Schema::table('course_reviews', function (Blueprint $table) {
    $table->decimal('average_rating', 3, 2)
          ->default(0.00)
          ->change();
});
```

> Requires `doctrine/dbal` to be installed for `->change()` support in Laravel.

### 5.2 Fix `amount_cents` to `BIGINT` in `payment_transactions`

**Problem:** `amount_cents INTEGER` overflows at 2,147,483,647 (≈$21.4M). The `sales` table correctly uses `BIGINT`. This inconsistency will cause silent data corruption for large transaction amounts.

**New migration:** `backend/database/migrations/tenant/2026_03_26_340002_fix_amount_cents_type_in_payment_transactions.php`

```php
Schema::table('payment_transactions', function (Blueprint $table) {
    $table->unsignedBigInteger('amount_cents')->change();
});
```

---

## Phase 6 — Scalability: Append-Only Table Hardening (P2)

**Risk if skipped:** Tables grow to millions of rows with no cleanup path; queries degrade over months
**Files touched:** 3 new ALTER migrations + documentation of retention policy

### 6.1 Add `created_at` Index to High-Volume Append-Only Tables

These tables have no date-range index, making time-bounded cleanup queries or archival windows impossible:

- `admin_audit_logs`
- `lead_activities`
- `payment_events`

**New migration:** `backend/database/migrations/2026_03_26_350001_add_created_at_indexes_to_append_tables.php`

```php
// admin_audit_logs (central)
Schema::table('admin_audit_logs', function (Blueprint $table) {
    $table->index('created_at', 'idx_admin_audit_logs_created');
});

// lead_activities (tenant)
Schema::table('lead_activities', function (Blueprint $table) {
    $table->index(['tenant_id', 'created_at'], 'idx_lead_activities_tenant_created');
});

// payment_events (central)
Schema::table('payment_events', function (Blueprint $table) {
    $table->index('created_at', 'idx_payment_events_created');
});
```

> Note: `lead_activities` runs in tenant DB context; `admin_audit_logs` and `payment_events` run in central DB context. These will need to be separate migrations in the correct connection group.

### 6.2 Define Retention Policy (Non-code deliverable)

Document the agreed retention window for each table in a `documentation/Architecture/data_retention_policy.md` file covering at minimum:

| Table | Retention Period | Archive Target | Purge Mechanism |
|---|---|---|---|
| `admin_audit_logs` | 2 years | S3 cold storage | Scheduled Artisan command |
| `lead_activities` | 1 year | - | Scheduled Artisan command |
| `payment_events` | 7 years (financial) | S3 cold storage | Scheduled Artisan command |
| `lead_notes` | Indefinite (soft delete only) | - | - |
| `jobs` / `failed_jobs` | 30 days | - | `queue:prune-failed` |

The scheduled commands should key on `created_at` and use the indexes added in 6.1.

---

## Phase 7 — Convention & Maintainability Fixes (P3)

**Risk if skipped:** ENUM columns require full table rebuild to add new values; minor UX/dev friction
**Files touched:** 1 new ALTER migration

### 7.1 Convert ENUM Columns to VARCHAR in `text_lessons`

**Problem:** `accessibility` and `status` columns use MySQL ENUM type. Per CLAUDE.md architecture rules, use VARCHAR with application-level validation. Adding a new ENUM value requires a full table rebuild (table lock on large datasets).

**New migration:** `backend/database/migrations/tenant/2026_03_26_360001_convert_enum_to_varchar_in_text_lessons.php`

```php
Schema::table('text_lessons', function (Blueprint $table) {
    // accessibility: e.g. 'public', 'enrolled', 'draft'
    $table->string('accessibility', 30)->default('enrolled')->change();
    // status: e.g. 'active', 'draft', 'archived'
    $table->string('status', 20)->default('draft')->change();
});
```

> Requires `doctrine/dbal`. Existing stored values are preserved; MySQL converts ENUM values to VARCHAR transparently.

---

## Migration Execution Order

The following order must be observed across all phases. Within a phase, migrations can be applied in a single deploy.

```
Phase 1 (P0 — ship first, before any production data)
  └── 2026_03_26_300001_add_tenant_id_to_live_sessions
  └── 2026_03_26_300002_add_tenant_id_to_course_reviews
  └── 2026_03_26_300003_add_tenant_id_to_certificates
  └── 2026_03_26_300004_add_tenant_id_to_assignment_submissions

Phase 2 (P0 — ship with Phase 1 or immediately after)
  └── 2026_03_26_310001_create_whatsapp_broadcast_recipients_table
  [MANUAL STEP: run backfill artisan command]
  └── 2026_03_26_310002_drop_recipient_lead_ids_from_whatsapp_broadcasts

Phase 3 (P1 — ship before first paid tenant)
  └── 2026_03_26_320001 through 2026_03_26_320005 (any order)

Phase 4 (P1 — ship before first paid tenant)
  └── 2026_03_26_330001 through 2026_03_26_330006 (any order)

Phase 5 (P1 — ship before financial transactions go live)
  └── 2026_03_26_340001_fix_average_rating_type
  └── 2026_03_26_340002_fix_amount_cents_type

Phase 6 (P2 — ship before 3-month production mark)
  └── 2026_03_26_350001_add_created_at_indexes_to_append_tables

Phase 7 (P3 — ship as convenient, no deadline pressure)
  └── 2026_03_26_360001_convert_enum_to_varchar_in_text_lessons
```

---

## Backfill Strategy for Phase 1 Tenant ID Columns

All four Phase 1 migrations add a `tenant_id NOT NULL` column to existing tables. In a fresh install this is trivial. In a staging/production environment with existing data, the following applies:

1. **Make column nullable first** — add `tenant_id BIGINT NULL` in the migration
2. **Run backfill command** — derive `tenant_id` from the nearest parent relationship (see each section above)
3. **Add NOT NULL constraint** in a follow-up migration after backfill is verified
4. **Apply global scope** — confirm `TenantScope` is active on the model before go-live

Backfill commands should be idempotent and safe to re-run.

---

## Checklist: Pre-Production Verification

Before any migration phase ships to production, verify:

- [ ] Migration has been applied to a staging environment and tested
- [ ] `php artisan migrate:status` shows no missing migrations
- [ ] Feature tests covering the affected table still pass
- [ ] For Phase 1: run cross-tenant access test (authenticated as Tenant A, attempt to query Tenant B's data → expect 403/404)
- [ ] For Phase 2: confirm `WhatsappBroadcastRecipient` model exists and `recipient_lead_ids` column is absent
- [ ] For Phase 5: insert a transaction with `amount_cents = 5000000000` (50M USD) and verify it persists correctly
- [ ] Backfill counts match: `SELECT COUNT(*) FROM new_table` equals expected row count derived from source data
- [ ] No `withoutGlobalScope()` calls added to bypass the new tenant scopes

---

## Files Created by This Plan

| Phase | New Migration File | Target DB |
|---|---|---|
| 1 | `tenant/2026_03_26_300001_add_tenant_id_to_live_sessions.php` | Tenant |
| 1 | `tenant/2026_03_26_300002_add_tenant_id_to_course_reviews.php` | Tenant |
| 1 | `tenant/2026_03_26_300003_add_tenant_id_to_certificates.php` | Tenant |
| 1 | `tenant/2026_03_26_300004_add_tenant_id_to_assignment_submissions.php` | Tenant |
| 2 | `2026_03_26_310001_create_whatsapp_broadcast_recipients_table.php` | Tenant |
| 2 | `2026_03_26_310002_drop_recipient_lead_ids_from_whatsapp_broadcasts.php` | Tenant |
| 3 | `tenant/2026_03_26_320001_index_live_sessions_fk_columns.php` | Tenant |
| 3 | `tenant/2026_03_26_320002_index_course_reviews_fk_columns.php` | Tenant |
| 3 | `tenant/2026_03_26_320003_index_certificates_fk_columns.php` | Tenant |
| 3 | `central/2026_03_26_320004_index_admin_role_assignments_fk_columns.php` | Central |
| 3 | `tenant/2026_03_26_320005_index_lead_notes_author.php` | Tenant |
| 4 | `central/2026_03_26_330001_add_composite_indexes_to_tenant_subscriptions.php` | Central |
| 4 | `tenant/2026_03_26_330002_add_composite_index_to_payment_transactions.php` | Tenant |
| 4 | `tenant/2026_03_26_330003_add_composite_index_to_sales.php` | Tenant |
| 4 | `tenant/2026_03_26_330004_index_categories_parent_id.php` | Tenant |
| 4 | `central/2026_03_26_330005_add_composite_index_to_subscription_plans.php` | Central |
| 4 | `tenant/2026_03_26_330006_optimise_quiz_indexes.php` | Tenant |
| 5 | `tenant/2026_03_26_340001_fix_average_rating_type_in_course_reviews.php` | Tenant |
| 5 | `tenant/2026_03_26_340002_fix_amount_cents_type_in_payment_transactions.php` | Tenant |
| 6 | `2026_03_26_350001_add_created_at_indexes_to_append_tables.php` | Central + Tenant |
| 7 | `tenant/2026_03_26_360001_convert_enum_to_varchar_in_text_lessons.php` | Tenant |

**Total: 21 new migration files across 7 phases.**

---

## Issues Deferred (Out of Scope — Architectural Decisions Required)

The following issues were identified but require a separate architectural decision before a fix can be drafted:

| Issue | Reason Deferred |
|---|---|
| Partitioning of `admin_audit_logs`, `lead_activities`, `payment_events` by date | Requires MySQL 5.7+/8.0 partition strategy decision and DBA review |
| `onDelete('restrict')` on `plan_id` in `tenant_subscriptions` | Business rule: should cancelling a plan hard-delete subscriptions? Needs product decision |
| JSON columns in `whatsapp_messages` (`location_data`, `variables_used`) | Generated columns + index possible, but query patterns need to be defined first |
| Cache key collision prevention (tenant namespace) | Application-layer concern, not migration-level |
| `recipient_lead_ids` JSON in `whatsapp_broadcasts` — legacy rows with very large arrays | Handled by Phase 2 backfill, but capacity planning needed if array sizes exceed 50K IDs |
