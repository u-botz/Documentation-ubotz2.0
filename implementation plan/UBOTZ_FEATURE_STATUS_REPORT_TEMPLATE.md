# UBOTZ 2.0 — Feature Status Report: [FEATURE NAME]

> **Instructions:** Copy this template for each feature. Fill every section honestly. If something is missing, write "NOT IMPLEMENTED" — do not skip the section. This document feeds directly into the Principal Engineer audit pipeline.

| Field | Value |
|---|---|
| **Feature Name** | [e.g., File Manager, Quiz Engine, Assignment System] |
| **Bounded Context** | [e.g., TenantAdminDashboard / SuperAdminDashboard / Public] |
| **Date Reported** | [YYYY-MM-DD] |
| **Reported By** | [Name / Role] |
| **Current Status** | [Working / Partially Working / Broken / Deployed to Production] |
| **Has Developer Instructions Doc?** | [Yes — link/filename / No] |
| **Has Implementation Plan?** | [Yes — link/filename / No] |
| **Was Principal Engineer Audit Done?** | [Yes — link/filename / No] |

---

## 1. What This Feature Does (2–3 sentences)

[Plain English summary. What problem does it solve? Who uses it?]

---

## 2. Backend Architecture

### 2.1 Controllers

| Controller | Methods | Notes |
|---|---|---|
| [e.g., `QuizReadController`] | [e.g., `index`, `show`] | [Any issues or deviations] |
| | | |

### 2.2 UseCases / Queries

| UseCase / Query | Purpose | Injects Audit Logger? | Injects Quota Service? |
|---|---|---|---|
| [e.g., `CreateQuizUseCase`] | [e.g., Creates a quiz for a course] | [Yes / No] | [Yes / No / N/A] |
| | | | |

### 2.3 Domain Layer

| Component | Type | Location | Notes |
|---|---|---|---|
| [e.g., `QuizEntity`] | Entity | [e.g., `Domain/TenantAdminDashboard/Quiz/Entities/`] | [Any issues] |
| [e.g., `QuizStatus`] | Value Object | [e.g., `Domain/TenantAdminDashboard/Quiz/ValueObjects/`] | |
| | | | |

### 2.4 Domain Events

| Event Class | Trigger | Has Listener? |
|---|---|---|
| [e.g., `QuizCreated`] | [e.g., After quiz saved] | [Yes — what listener / No] |
| | | |

If no domain events exist, write: **NO DOMAIN EVENTS DEFINED**

### 2.5 Infrastructure Layer

| Component | Type | Notes |
|---|---|---|
| [e.g., `QuizRecord`] | Eloquent Model | [Has SoftDeletes? Has BelongsToTenant scope?] |
| [e.g., `EloquentQuizRepository`] | Repository | [Implements which interface?] |
| | | |

### 2.6 Exceptions

| Exception Class | When Thrown |
|---|---|
| [e.g., `QuizNotFoundException`] | [e.g., Quiz ID not found for tenant] |
| | |

If no custom exceptions exist, write: **USES GENERIC EXCEPTIONS ONLY**

---

## 3. Database Schema

### 3.1 Tables

For each table this feature owns, list columns. Mark issues inline.

**Table: `[table_name]`** (Migration file: `[migration filename]`)

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | BIGINT UNSIGNED PK | No | |
| `tenant_id` | BIGINT UNSIGNED FK | No | |
| `user_id` | BIGINT UNSIGNED FK | [Yes/No] | [Present or missing?] |
| [etc.] | | | |

**Indexes:**
- [List all indexes, unique constraints]

**Missing columns (known):**
- [e.g., No `deleted_at` for soft deletes]
- [e.g., No `status` column]

### 3.2 Relationships

| From Table | To Table | Type | FK Column |
|---|---|---|---|
| [e.g., `quizzes`] | [e.g., `courses`] | BelongsTo | `course_id` |
| | | | |

---

## 4. API Endpoints

List every route this feature exposes.

| Method | URI | Controller@Method | Middleware | Capability Code |
|---|---|---|---|---|
| `GET` | `/api/tenant/...` | `...@index` | [List all middleware] | [e.g., `quiz.view` / **NONE**] |
| `POST` | `/api/tenant/...` | `...@store` | | |
| | | | | |

If no `tenant.capability` middleware is applied, write **CAPABILITY MIDDLEWARE: MISSING** at the top of this section.

---

## 5. Security Checklist

Answer each question. Be honest — "No" is better than a wrong "Yes".

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | All queries scoped by `tenant_id`? | [Yes / No / Partial] | |
| 2 | User-level isolation enforced where needed? (`user_id` check) | [Yes / No / N/A] | |
| 3 | `tenant.capability` middleware on all routes? | [Yes / No] | [List ungated routes if partial] |
| 4 | Audit log written for every mutation? | [Yes / No / Partial] | |
| 5 | Audit log written OUTSIDE `DB::transaction()`? | [Yes / No / Not Applicable] | |
| 6 | Domain events dispatched via `DB::afterCommit`? | [Yes / No / No Events] | |
| 7 | Idempotency keys used for create operations? | [Yes / No] | |
| 8 | Input validation via FormRequest (not in controller)? | [Yes / No / Partial] | |
| 9 | File uploads validated server-side (MIME via `finfo`)? | [Yes / No / N/A] | |
| 10 | Financial values stored as `_cents` integer? | [Yes / No / N/A] | |
| 11 | Soft deletes used (no hard delete of user data)? | [Yes / No] | |
| 12 | No raw SQL in controllers or UseCases? | [Yes / No] | |
| 13 | Eloquent models have `BelongsToTenant` trait/scope? | [Yes / No] | |
| 14 | Sensitive data not exposed in API responses? | [Yes / No] | |

---

## 6. Frontend

### 6.1 File Location

```
frontend/features/[context]/[feature]/
```

### 6.2 Components

| Component | Purpose | Notes |
|---|---|---|
| [e.g., `QuizBuilder.tsx`] | [e.g., Main quiz creation form] | |
| | | |

### 6.3 API Hooks

| Hook | Endpoint | Notes |
|---|---|---|
| [e.g., `use-create-quiz.ts`] | `POST /api/tenant/quizzes` | |
| | | |

### 6.4 Capability-Based UI Gating

| UI Element | Hidden When Missing Capability | Implemented? |
|---|---|---|
| [e.g., "Create Quiz" button] | `quiz.create` | [Yes / No] |
| | | |

If no UI capability gating exists, write: **NO FRONTEND CAPABILITY GATING**

---

## 7. Tests

| Test File | Test Count | Passing? |
|---|---|---|
| [e.g., `QuizCrudTest.php`] | [e.g., 8] | [Yes / No / Partial — list failures] |
| | | |

If no tests exist, write: **NO TESTS**

---

## 8. Known Issues & Gaps

List anything you know is wrong, incomplete, or missing. Be blunt.

| # | Issue | Severity Guess | Notes |
|---|---|---|---|
| 1 | [e.g., No capability middleware on routes] | [Critical / High / Medium / Low] | |
| 2 | [e.g., Audit logging missing from delete] | | |
| 3 | [e.g., Entity named wrong] | | |
| | | | |

---

## 9. Dependencies on Other Features

| Depends On | How |
|---|---|
| [e.g., Course system] | [e.g., Quizzes belong to a course chapter] |
| [e.g., Quota Service] | [e.g., Upload checks storage quota] |
| | |

---

## 10. File Tree (Backend Only)

Paste the actual file tree for this feature. Use the output of `find` or `tree` scoped to the feature directories.

```
app/
├── Http/Controllers/Api/TenantAdminDashboard/[Feature]/
│   ├── ...
├── Application/TenantAdminDashboard/[Feature]/
│   ├── Commands/
│   ├── Queries/
│   └── UseCases/
├── Domain/TenantAdminDashboard/[Feature]/
│   ├── Entities/
│   ├── Events/
│   ├── Exceptions/
│   ├── Repositories/
│   └── ValueObjects/
├── Infrastructure/Persistence/TenantAdminDashboard/[Feature]/
│   ├── ...
└── routes/tenant_dashboard/[feature].php
```

---

> **Reminder:** This report is input for the Principal Engineer audit. Incomplete or inaccurate information here means the audit will miss real issues or flag false positives. When in doubt, check the actual code — do not guess.

*End of Template*
