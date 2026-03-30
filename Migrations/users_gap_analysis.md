# Feature Migration Guide — Mentora to UBOTZ 2 (Users / Admin Panel)

## Legend

| Symbol | Meaning |
|--------|---------|
| ✅ | Implemented in Ubotz |
| ❌ | Missing — needs implementation |
| ⚠️ | Partially implemented |

---

## Target Audience
This guide analyzes the migration of the **User Management** feature set from the Mentora admin/organization panel to UBOTZ 2.0.
Users in Mentora are managed at two levels:
- **Admin Panel** (`Admin/UserController.php` — 1590 lines, 40 methods): Global platform admin managing staffs, instructors, students, organizations.
- **Organization Panel** (`Panel/UserController.php` — 926 lines, 22 methods): Organization-level admin managing their own instructors and students.

---

## 🏗️ Architectural Paradigm Shift

### How it worked in Mentora (Active Record / Laravel MVC)
* **Controllers:** Two massive controllers (Admin: 1590 lines, Panel: 926 lines) handling everything — validation, business logic, rendering, role checks, financial settings, Eloquent queries.
* **Models:** The `User` model (+ 25+ related models like `UserMeta`, `UserBank`, `UserOccupation`, `UserBadge`, `UserCommission`, `UserLoginHistory`, etc.) carries significant logic.
* **Roles:** Differentiated by `role_name` field (`admin`, `teacher`, `user`, `organization`) and a `Role` model. An organization can create students/teachers under its `organ_id`.
* **Multi-step profile:** A complex 8-step profile editor covering basic info, avatar, about/bio, education/experience, occupations, identity/financial, extra form fields, and location.
* **Tenant Isolation:** Non-existent at the platform level. Organizations isolate users via `organ_id` foreign key checks.

### How it works in UBOTZ 2.0 (Domain-Driven Design)
* **Tenant Data Isolation:** Automatic via `BelongsToTenant` trait and tenant-scoped repositories.
* **Pure Domain Entity:** `UserEntity` (287 lines) — no framework dependencies, enforces invariants.
* **Value Object Status:** `UserStatus` enum (`INVITED`, `ACTIVE`, `SUSPENDED`, `ARCHIVED`) with a strict transition matrix.
* **Use Cases:** Focused single-responsibility classes: `CreateTenantUserUseCase`, `UpdateUserProfileUseCase`, `SuspendUserUseCase`, `ReactivateUserUseCase`, `ArchiveUserUseCase`.
* **Quota Enforcement:** `CreateTenantUserUseCase` checks `TenantQuotaServiceInterface` before creation (replaces Mentora's `UserPackage` limit check).
* **Audit Logging:** `TenantUserAuditLoggerInterface` logs user creation, role assignment, status changes with actor/IP/user-agent.
* **API-First:** Thin Read/Write controllers returning `TenantUserResource` JSON.

---

## 📊 Feature Gap Analysis

### 1. User CRUD (Core)

| Feature | Mentora Source | UBOTZ Status | Notes |
|---------|---------------|:------------:|-------|
| Create Student | `Panel/UserController::storeUser()` | ✅ | `CreateTenantUserUseCase` with `role_slug=student` |
| Create Instructor/Teacher | `Panel/UserController::storeUser()` | ✅ | Same UseCase with `role_slug=teacher` |
| Create User (Admin) | `Admin/UserController::store()` | ✅ | Same UseCase |
| List Students | `Admin/UserController::students()` | ✅ | `ListTenantUsersQuery` with role filter |
| List Instructors | `Admin/UserController::instructors()` | ✅ | `ListTenantUsersQuery` with role filter |
| List Organizations | `Admin/UserController::organizations()` | ❌ | Multi-tenant replaces this concept; organizations are now tenants |
| List Staffs | `Admin/UserController::staffs()` | ❌ | Platform-level admin staffing (not tenant level) |
| View User Detail | `Admin/UserController::edit()` | ✅ | `GetTenantUserQuery` |
| Update User Profile | `Panel/UserController::update()` | ✅ | `UpdateUserProfileUseCase` (first_name, last_name, phone) |
| Delete/Remove User | `Panel/UserController::deleteUser()` | ✅ | `ArchiveUserUseCase` (soft-delete via ARCHIVED status) |
| Destroy User (Hard Delete) | `Admin/UserController::destroy()` | ✅ | `HardDeleteUserUseCase` (available for archived users) |

### 2. User Status Management

| Feature | Mentora Source | UBOTZ Status | Notes |
|---------|---------------|:------------:|-------|
| Active/Inactive toggle | `Admin/UserController::update()` | ✅ | `SuspendUserUseCase` / `ReactivateUserUseCase` |
| Status state machine | Implicit in Mentora | ✅ | `UserStatus` enum with `canTransitionTo()` transition matrix |
| Verify user | `Admin/UserController::update()` | ✅ | `VerifyUserUseCase` and `verified` flag implemented |
| Ban/Unban user | `Admin/UserController::update()` | ⚠️ | Covered by SUSPENDED status, but no explicit "ban" concept |

### 3. User Profile — Extended Fields

| Feature | Mentora Source | UBOTZ Status | Notes |
|---------|---------------|:------------:|-------|
| Email | User model direct field | ✅ | In `UserEntity` |
| Mobile/Phone | User model direct field | ✅ | In `UserEntity` |
| Full Name (first + last) | `full_name` single field | ✅ | Split into `firstName`/`lastName` in UBOTZ |
| Avatar/Profile Image | `Panel/UserController::createImage()` | ✅ | `avatar_path` implemented |
| Cover Image | `Panel/UserController::update()` step 2 | ✅ | `cover_image_path` implemented |
| Bio/About | `Panel/UserController::update()` step 3 | ✅ | `bio` and `about` fields implemented |
| Language/Timezone/Currency | `Panel/UserController::update()` step 1 | ✅ | `language`, `timezone`, `currency` fields implemented |
| Location (Country/Province/City/District/Lat-Lng) | `Panel/UserController::update()` step 8 | ✅ | Implemented in `UserEntity` |
| Gender/Age/Address | `UserMeta` (step 8) | ✅ | Explicit fields implemented |
| Signature Image | `UserMeta` (step 2) | ✅ | `signature_path` implemented |

### 4. User Meta (Education, Experience, etc.)

| Feature | Mentora Source | UBOTZ Status | Notes |
|---------|---------------|:------------:|-------|
| Store/Update/Delete Meta | `Panel/UserController::storeMetas/updateMeta/deleteMeta()` | ✅ | Implemented via explicit Domain Entities |
| Education records | `UserMeta` where `name=education` | ✅ | `EducationRecordEntity` implemented |
| Experience records | `UserMeta` where `name=experience` | ✅ | `ExperienceRecordEntity` implemented |

### 5. User Occupations & Categories

| Feature | Mentora Source | UBOTZ Status | Notes |
|---------|---------------|:------------:|-------|
| Assign occupations | `Panel/UserController::update()` step 6 | ✅ | `UserOccupation` sync implemented |
| Occupation categories | `Admin/UserController::occupationsUpdate()` | ✅ | Occupation category sync implemented |

### 6. User Financial/Banking

| Feature | Mentora Source | UBOTZ Status | Notes |
|---------|---------------|:------------:|-------|
| Identity scan upload | `Panel/UserController::handleUserIdentityAndFinancial()` | ❌ | Not modelled |
| Certificate upload | Same | ❌ | Not modelled |
| Bank selection | `UserSelectedBank`, `UserSelectedBankSpecification` | ❌ | Not modelled |
| Financial update (Admin) | `Admin/UserController::financialUpdate()` | ❌ | Not modelled |
| User Commissions | `Admin/UserController::storeUserCommissions()` | ❌ | Not modelled |

### 7. User Badges

| Feature | Mentora Source | UBOTZ Status | Notes |
|---------|---------------|:------------:|-------|
| Assign badges | `Admin/UserController::badgesUpdate()` | ❌ | `UserBadge` not migrated |
| Delete badge | `Admin/UserController::deleteBadge()` | ❌ | Not modelled |

### 8. Search & Filtering

| Feature | Mentora Source | UBOTZ Status | Notes |
|---------|---------------|:------------:|-------|
| Basic search (name/email/phone) | `Panel/UserController::search()` | ✅ | `ListTenantUsersQuery` supports `search` param |
| Advanced filters (date range, status, role, verified, etc.) | `Admin/UserController::filters()` | ⚠️ | Status and role filters exist; date, verified, org filters missing |
| Contact Info lookup | `Panel/UserController::contactInfo()` | ❌ | Not implemented |

### 9. Login History & Sessions

| Feature | Mentora Source | UBOTZ Status | Notes |
|---------|---------------|:------------:|-------|
| View login history | `UserLoginHistory` model + `Panel/UserLoginHistoryController` | ❌ | Not modelled |
| End active session | `Panel/UserLoginHistoryController::endSession()` | ❌ | Not modelled |

### 10. Admin-Level Advanced Features

| Feature | Mentora Source | UBOTZ Status | Notes |
|---------|---------------|:------------:|-------|
| Impersonate user | `Admin/UserController::impersonate()` | ✅ | JWT-based stateless impersonation with audit trail |
| Export users to Excel | `Admin/UserController::exportExcelStudents/Instructors/Organizations()` | ✅ | Streaming CSV export service implemented |
| Accept "Become Instructor" request | `Admin/UserController::acceptRequestToInstructor()` | ✅ | InstructorRequestEntity and promotional workflow implemented |
| Registration packages (limits) | `Admin/UserController::userRegistrationPackage()` | ⚠️ | Quota system exists (`TenantQuotaServiceInterface`) but no admin UI/management |
| Meeting settings (Zoom) | `Admin/UserController::meetingSettings()` | ❌ | Not modelled |
| Cashback toggle | `Admin/UserController::disableCashbackToggle()` | ✅ | Domain-level flag with event audit implemented |
| Registration bonus toggle | `Admin/UserController::disableRegitrationBonusStatus()` | ✅ | Domain-level flag with event audit implemented |
| Installment approval toggle | `Admin/UserController::disableInstallmentApproval()` | ✅ | Domain-level flag with event audit implemented |
| Store subscription (Admin grant) | `Admin/UserController::storeSubscription()` | ✅ | Cross-domain orchestration via Subscription context implemented |
| Revoke subscription | `Admin/UserController::revokeSubscription()` | ✅ | Cross-domain orchestration via Subscription context implemented |

### 11. Newsletter

| Feature | Mentora Source | UBOTZ Status | Notes |
|---------|---------------|:------------:|-------|
| Join/Leave newsletter | `Panel/UserController::handleNewsletter()` | ❌ | Not modelled — likely a separate bounded context |

### 12. Offline/Online Status

| Feature | Mentora Source | UBOTZ Status | Notes |
|---------|---------------|:------------:|-------|
| Toggle offline mode + message | `Panel/UserController::offlineToggle()` | ❌ | Instructor-facing feature, not modelled |

### 13. Delete Account Request

| Feature | Mentora Source | UBOTZ Status | Notes |
|---------|---------------|:------------:|-------|
| Request account deletion | `Panel/UserController::deleteAccount()` | ❌ | `DeleteAccountRequest` model not migrated |

### 14. Extra Form Fields (Dynamic)

| Feature | Mentora Source | UBOTZ Status | Notes |
|---------|---------------|:------------:|-------|
| Render custom form fields per role | `Panel/UserController::handleUserExtraForm()` | ❌ | Dynamic form fields via `UserFormFieldsTrait` not modelled |
| Admin manage form fields | `Admin/UserController::updateFormFields()` | ❌ | Not modelled |

---

## 📈 Summary Scorecard

| Category | Total Features | ✅ Implemented | ⚠️ Partial | ❌ Missing |
|----------|:--------------:|:--------------:|:-----------:|:----------:|
| User CRUD (Core) | 11 | 9 | 0 | 2 |
| Status Management | 4 | 3 | 1 | 0 |
| Extended Profile Fields | 10 | 10 | 0 | 0 |
| User Meta | 3 | 3 | 0 | 0 |
| Occupations & Categories | 2 | 2 | 0 | 0 |
| Financial/Banking | 5 | 0 | 0 | 5 |
| Badges | 2 | 0 | 0 | 2 |
| Search & Filtering | 3 | 1 | 1 | 1 |
| Login History & Sessions | 2 | 0 | 0 | 2 |
| Admin Advanced Features | 11 | 8 | 1 | 2 |
| Newsletter | 1 | 0 | 0 | 1 |
| Offline Status | 1 | 0 | 0 | 1 |
| Delete Account | 1 | 0 | 0 | 1 |
| Dynamic Form Fields | 2 | 0 | 0 | 2 |
| **TOTAL** | **58** | **36** | **3** | **19** |

---

## 🚀 Recommended Migration Priority

### Priority 1 — Core Gaps (High Business Impact)
1. **Extended Profile Fields** — Add avatar, bio, language/timezone to `UserEntity` and profile update flow.
2. **User Verified Flag** — Model a `verified` boolean in domain for admin approval workflows.
3. **Hard Delete** — Implement permanent user removal (with data anonymization for GDPR).
4. **Advanced Filters** — Extend `ListTenantUsersQuery` with date range, verified flag, pagination improvements.

### Priority 2 — Admin Tooling
5. **Impersonation** — Critical for tenant support. Must include full audit trail (actor, target, timestamp, reason).
6. **Excel Export** — Implement student/instructor export via a dedicated service (not in controller).
7. **Login History** — Create `UserLoginHistory` entity and session management.

### Priority 3 — Profile Enrichment
8. **User Meta (EAV → Explicit)** — Instead of replicating Mentora's EAV pattern, model specific fields (education, experience) as first-class entities or value objects.
9. **Occupations** — Model `UserOccupation` as a many-to-many relationship.
10. **Financial/Banking** — Model as a sub-domain within the Payment bounded context.

### Priority 4 — Nice-to-Have / Defer
11. **Newsletter** — Separate bounded context, not core user management.
12. **Offline Toggle** — Instructor-specific, low priority for initial migration.
13. **Dynamic Form Fields** — Complex feature, defer until form builder is designed.
14. **Meeting Settings (Zoom)** — Depends on meeting/video bounded context.
15. **Cashback/Bonus/Installment Toggles** — Belong to Payment/Subscription bounded contexts.

---

## ⚠️ Key Differences & Gotchas

1. **Role System Redesign:** Mentora uses `role_name` (string on User) + `Role` model. UBOTZ 2.0 uses a separate `TenantRoleRepository` with role assignment via a pivot table. The `role_slug` is passed during creation and validated against tenant-specific roles.
2. **Organization → Tenant:** Mentora's "Organization" user type (with `organ_id`) is replaced by UBOTZ's first-class Tenant concept. There is no "organization user type" — the tenant IS the organization.
3. **Multi-step Profile → API-first:** Mentora's 8-step form wizard is a frontend concern. The backend should expose atomic update endpoints (update profile, update avatar, update preferences).
4. **EAV Removal:** Mentora's `UserMeta` table (EAV for education, experience, gender, age, address, etc.) should NOT be replicated. Model important fields explicitly; use a structured JSON column for truly dynamic metadata.
5. **Quota vs Package Limits:** Mentora's `UserPackage::checkPackageLimit()` is replaced by UBOTZ's `TenantQuotaServiceInterface::checkQuota()`. The concepts map cleanly.
6. **Soft Delete vs Archive:** Mentora removes `organ_id` to "delete" a user from an org. UBOTZ uses `ARCHIVED` status with proper state machine transition, which is more robust.
