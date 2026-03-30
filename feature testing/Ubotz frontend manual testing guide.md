# UBOTZ 2.0 — Frontend Manual Testing Guide

## Platform Admin + Tenant Admin — Full E2E Verification

| Field | Value |
|---|---|
| **Document Type** | Manual Testing Execution Plan |
| **Scope** | Super Admin Dashboard + Tenant Admin Dashboard |
| **Prerequisites** | Backend 365+ tests green, both frontends running |
| **Estimated Effort** | 2–3 working days |
| **Tester Requirements** | Browser with DevTools, 2 tenants seeded, multiple user roles |

---

## Table of Contents

1. [Test Environment Setup](#1-test-environment-setup)
2. [DevTools Setup & Verification Techniques](#2-devtools-setup--verification-techniques)
3. [SECTION A: Platform Admin Dashboard (Super Admin)](#3-section-a-platform-admin-dashboard)
4. [SECTION B: Tenant Admin Dashboard](#4-section-b-tenant-admin-dashboard)
5. [SECTION C: Cross-Context Security Isolation](#5-section-c-cross-context-security-isolation)
6. [SECTION D: Cross-Tenant Data Isolation](#6-section-d-cross-tenant-data-isolation)
7. [SECTION E: Edge Cases & Error Handling](#7-section-e-edge-cases--error-handling)
8. [SECTION F: Browser Compatibility & Responsiveness](#8-section-f-browser-compatibility)
9. [Defect Triage Matrix](#9-defect-triage-matrix)
10. [Sign-Off Checklist](#10-sign-off-checklist)

---

## 1. Test Environment Setup

### 1.1 — Infrastructure Checklist

Before starting ANY test, verify all of the following:

```
[ ] Backend Docker containers running (ubotz_backend, ubotz_mysql, nginx, redis)
[ ] Frontend dev server running (npm run dev) — typically http://localhost:3000
[ ] Database freshly seeded: docker exec -it ubotz_backend php artisan migrate:fresh --seed
[ ] Backend health check passes: curl.exe http://localhost:8000/api/health → {"status":"ok"}
```

### 1.2 — Required Seed Data

You need the following users and tenants pre-seeded. If they don't exist, create them.

**Platform Admins:**

| User | Authority Level | Login URL |
|---|---|---|
| Root Admin (L1) | L1 — full access | `/auth/platform-login` |
| Operations Admin (L3) | L3 — limited | `/auth/platform-login` |
| Support Staff (L5) | L5 — read-heavy | `/auth/platform-login` |

**Tenant A (e.g., school-a.localhost):**

| User | Tenant Role | Login URL |
|---|---|---|
| Owner A | OWNER (hierarchy 100) | `school-a.localhost:3000/auth/login` |
| Admin A | ADMIN (hierarchy 80) | `school-a.localhost:3000/auth/login` |
| Teacher A | TEACHER (hierarchy 50) | `school-a.localhost:3000/auth/login` |

**Tenant B (e.g., school-b.localhost):**

| User | Tenant Role | Login URL |
|---|---|---|
| Owner B | OWNER (hierarchy 100) | `school-b.localhost:3000/auth/login` |
| Teacher B | TEACHER (hierarchy 50) | `school-b.localhost:3000/auth/login` |

### 1.3 — /etc/hosts Entries

Add these to your hosts file (`C:\Windows\System32\drivers\etc\hosts`):

```
127.0.0.1    school-a.localhost
127.0.0.1    school-b.localhost
```

### 1.4 — Browser Preparation

- Use Chrome or Firefox (both DevTools required)
- Open two browser profiles (or one regular + one incognito) for cross-tenant testing
- Clear all cookies and cache before starting

---

## 2. DevTools Setup & Verification Techniques

Every test in this guide includes DevTools checkpoints. Here's how to use them.

### 2.1 — Cookie Inspection

**How:** DevTools → Application tab → Cookies → select the domain

**What to check:**

| Cookie Name | Context | Expected Properties |
|---|---|---|
| `ubotz_admin_token` | Platform Admin only | httpOnly: ✅, Secure: ✅ (prod), SameSite: Lax or Strict, Path: / |
| `ubotz_auth_token` | Tenant User only | httpOnly: ✅, Secure: ✅ (prod), SameSite: Lax or Strict, Path: / |

**Critical rules:**
- After platform login: ONLY `ubotz_admin_token` exists. NO `ubotz_auth_token`.
- After tenant login: ONLY `ubotz_auth_token` exists. NO `ubotz_admin_token`.
- After logout: The relevant cookie is GONE (not empty — completely absent).

### 2.2 — Network Tab Monitoring

**How:** DevTools → Network tab → check "Preserve log" → filter by `Fetch/XHR`

**What to check on every API call:**

| Check | How | Expected |
|---|---|---|
| Request URL | Click the request | Correct API endpoint (e.g., `/api/tenant/stats`) |
| Request Method | Headers tab | Correct verb (GET, POST, PUT, DELETE) |
| Cookie sent | Request Headers → Cookie | Correct cookie included automatically |
| Response Status | Status column | 200/201 for success, 401/403/404/422 for expected failures |
| Response Body | Response/Preview tab | Valid JSON, correct data structure |
| CORS | Console tab | NO CORS errors |
| withCredentials | Request headers | `credentials: include` or cookies are being sent |

### 2.3 — Console Tab Monitoring

**How:** DevTools → Console tab → keep open during ALL testing

**What to watch for:**

| Issue | Severity | Example |
|---|---|---|
| Red errors | HIGH-CRITICAL | `Unhandled Runtime Error`, `TypeError`, `500 Internal Server Error` |
| CORS errors | CRITICAL | `Access-Control-Allow-Origin` missing |
| 401/403 in console | CHECK | Could be expected (auth test) or bug (should-be-authenticated route) |
| React hydration mismatch | MEDIUM | `Text content did not match` — SSR/CSR mismatch |
| Missing API responses | HIGH | `net::ERR_CONNECTION_REFUSED` — backend not running |

### 2.4 — Taking Evidence

For every CRITICAL and HIGH test, capture:
1. Screenshot of the UI state
2. Screenshot of the Network tab showing the request/response
3. Screenshot of the Cookie state in Application tab

---

## 3. SECTION A: Platform Admin Dashboard (Super Admin)

### A1 — Platform Admin Authentication

| # | Test Case | Steps | Expected Result | DevTools Check | Severity |
|---|---|---|---|---|---|
| A1.1 | Successful login | 1. Navigate to `/auth/platform-login` 2. Enter L1 admin credentials 3. Click Login | Redirect to `/super-admin-dashboard`, user name visible in top bar | **Cookie:** `ubotz_admin_token` present, httpOnly ✅ **Network:** POST `/api/platform/auth/login` → 200 **Cookie check:** NO `ubotz_auth_token` exists | CRITICAL |
| A1.2 | Failed login (wrong password) | 1. Navigate to `/auth/platform-login` 2. Enter wrong password 3. Click Login | Error message shown, stay on login page | **Cookie:** NO `ubotz_admin_token` set **Network:** POST → 401 **Console:** No unhandled errors | CRITICAL |
| A1.3 | Failed login (empty fields) | 1. Navigate to `/auth/platform-login` 2. Click Login without entering credentials | Client-side validation errors shown | **Network:** NO request sent (client-side validation) | MEDIUM |
| A1.4 | Session persistence | 1. Login successfully 2. Close tab 3. Open new tab 4. Navigate to `/super-admin-dashboard` | Still authenticated, dashboard loads | **Cookie:** `ubotz_admin_token` still present **Network:** GET `/api/platform/auth/me` → 200 | HIGH |
| A1.5 | Logout | 1. Login successfully 2. Click Logout button | Redirect to `/auth/platform-login`, dashboard inaccessible | **Cookie:** `ubotz_admin_token` GONE **Network:** POST/DELETE logout endpoint → 200, then redirect **Verify:** Navigate to `/super-admin-dashboard` → redirect to login | CRITICAL |
| A1.6 | Unauthenticated access | 1. Clear all cookies 2. Navigate directly to `/super-admin-dashboard` | Redirect to `/auth/platform-login` | **Network:** No API calls made OR GET `/me` → 401 → redirect | CRITICAL |

---

### A2 — Staff Management

| # | Test Case | Steps | Expected Result | DevTools Check | Severity |
|---|---|---|---|---|---|
| A2.1 | List staff | 1. Login as L1 admin 2. Navigate to Staff page | Staff table loads with list of admins, shows name, email, authority level, status | **Network:** GET `/api/platform/staff` → 200, response contains array of staff **Console:** No errors | HIGH |
| A2.2 | Create staff member | 1. Click "Create Staff" 2. Fill form (name, email, authority level) 3. Submit | Success message, new staff appears in list | **Network:** POST `/api/platform/staff` → 201 **Response:** Contains created staff data **Verify:** Refresh page — new staff persists | HIGH |
| A2.3 | Create staff — validation errors | 1. Click "Create Staff" 2. Submit with empty/invalid fields | Validation errors displayed on form fields | **Network:** POST → 422 **Response:** Validation errors object **Console:** No unhandled errors | MEDIUM |
| A2.4 | Create staff — duplicate email | 1. Create staff with email that already exists | Error message: email already taken | **Network:** POST → 422 (or 409) **UI:** Clear error message on form | MEDIUM |
| A2.5 | Update staff | 1. Click Edit on existing staff 2. Change name or authority level 3. Save | Success message, updated data reflected | **Network:** PUT `/api/platform/staff/{id}` → 200 | HIGH |
| A2.6 | Deactivate staff | 1. Click Deactivate on active staff member | Status changes to "inactive", visual indicator changes | **Network:** PATCH/PUT status change → 200 **Verify:** Deactivated staff cannot login (test in separate browser) | HIGH |
| A2.7 | Force password reset | 1. Click Force Password Reset on a staff member | Success message, staff marked for password reset | **Network:** POST force-password-reset endpoint → 200 | MEDIUM |
| A2.8 | Authority level enforcement | 1. Login as L3 admin 2. Try to create L1 or L2 staff | Action blocked — either button hidden or backend returns 403 | **Network:** If request sent → 403 **UI:** Button may be hidden based on authority | CRITICAL |
| A2.9 | Unlock admin | 1. Login as L1 admin 2. Find locked admin 3. Click Unlock | Admin status changes to active | **Network:** POST unlock endpoint → 200 | MEDIUM |

---

### A3 — Tenant Management

| # | Test Case | Steps | Expected Result | DevTools Check | Severity |
|---|---|---|---|---|---|
| A3.1 | List tenants | 1. Login as platform admin 2. Navigate to Tenants page | Tenant table loads with name, subdomain, status, subscription info | **Network:** GET `/api/platform/tenants` → 200 **Console:** No errors | HIGH |
| A3.2 | Create tenant | 1. Click "Create Tenant" 2. Fill form (name, subdomain, owner email, etc.) 3. Submit | Success message, new tenant in list | **Network:** POST `/api/platform/tenants` → 201 **Response:** Contains tenant + provisioned data **Verify:** Default roles were created (check via backend tinker or tenant login) | HIGH |
| A3.3 | Create tenant — duplicate subdomain | 1. Try to create tenant with existing subdomain | Validation error on subdomain field | **Network:** POST → 422 | MEDIUM |
| A3.4 | View tenant details | 1. Click on a tenant row/name | Detail view showing tenant info, subscription, user count | **Network:** GET `/api/platform/tenants/{id}` → 200 | MEDIUM |
| A3.5 | Suspend tenant | 1. Click Suspend on active tenant 2. Confirm action | Tenant status changes to "suspended" | **Network:** PATCH/PUT status → 200 **Verify (CRITICAL):** Open new browser → login as that tenant's user → should FAIL (tenant suspended, login blocked) | CRITICAL |
| A3.6 | Reactivate tenant | 1. Click Reactivate on suspended tenant | Status returns to "active" | **Network:** PATCH/PUT → 200 **Verify:** Tenant users can now login again | HIGH |
| A3.7 | Tenant onboarding verification | 1. Create a new tenant 2. Login as the new tenant's owner | Dashboard loads, default roles exist, capabilities seeded | **Network (on tenant side):** GET `/api/tenant/roles` returns 6 system roles **This tests the full onboarding pipeline** | CRITICAL |

---

### A4 — Subscription & Billing Management

| # | Test Case | Steps | Expected Result | DevTools Check | Severity |
|---|---|---|---|---|---|
| A4.1 | List subscription plans | 1. Navigate to Billing/Plans page | All plans listed with name, price, billing cycle, features | **Network:** GET `/api/platform/subscription-plans` → 200 | HIGH |
| A4.2 | View plan details | 1. Click on a plan | Plan detail with pricing, limits, features | **Network:** GET `/api/platform/subscription-plans/{id}` → 200 | MEDIUM |
| A4.3 | Assign plan to tenant | 1. Navigate to a tenant's detail 2. Assign a subscription plan | Subscription created, status set correctly (trial/active) | **Network:** POST assign endpoint → 201 **Verify:** Tenant detail shows subscription info | HIGH |
| A4.4 | View tenant subscription | 1. Open tenant detail | Subscription status, plan name, dates visible | **Network:** Response includes subscription data | MEDIUM |
| A4.5 | Subscription status display | 1. Check tenants with different statuses (trial, active, expired, cancelled) | Correct status badges and dates for each | **Visual:** Different colors/badges per status | MEDIUM |

---

## 4. SECTION B: Tenant Admin Dashboard

### B1 — Tenant Authentication

| # | Test Case | Steps | Expected Result | DevTools Check | Severity |
|---|---|---|---|---|---|
| B1.1 | Successful login | 1. Navigate to `school-a.localhost:3000/auth/login` 2. Enter OWNER credentials 3. Click Login | Redirect to `/tenant-admin-dashboard`, user info in top bar | **Cookie:** `ubotz_auth_token` present, httpOnly ✅ **Cookie check:** NO `ubotz_admin_token` exists **Network:** POST `/api/tenant/auth/login` → 200 | CRITICAL |
| B1.2 | Failed login | 1. Enter wrong password | Error message, no redirect | **Cookie:** NO `ubotz_auth_token` set **Network:** POST → 401 | CRITICAL |
| B1.3 | Session persistence | 1. Login 2. Close tab 3. Reopen 4. Navigate to dashboard | Still authenticated | **Cookie:** `ubotz_auth_token` persists **Network:** GET `/api/tenant/auth/me` → 200 | HIGH |
| B1.4 | Logout | 1. Click Logout | Cookie cleared, redirect to login | **Cookie:** `ubotz_auth_token` GONE **Verify:** `/tenant-admin-dashboard` redirects to login | CRITICAL |
| B1.5 | Expired JWT | 1. Login 2. Wait for JWT expiry (or manually delete cookie in DevTools) 3. Click any nav link | Redirect to login page, no broken state | **Network:** API call → 401 → redirect triggered **Console:** No unhandled errors | HIGH |
| B1.6 | Unauthenticated access | 1. Clear cookies 2. Navigate to `/tenant-admin-dashboard` | Redirect to `/auth/login` | **Network:** No data exposed before redirect | CRITICAL |
| B1.7 | Subdomain resolution | 1. Login on `school-a.localhost` 2. Check API requests | All API calls include correct subdomain context | **Network:** Requests go to correct subdomain, tenant resolved from JWT | HIGH |

---

### B2 — Dashboard Stats

| # | Test Case | Steps | Expected Result | DevTools Check | Severity |
|---|---|---|---|---|---|
| B2.1 | OWNER sees full stats | 1. Login as OWNER 2. View dashboard | All stat cards visible (users, courses, exams, domains, storage) | **Network:** GET `/api/tenant/stats` → 200 **Response:** All stat keys present **Console:** No errors | HIGH |
| B2.2 | TEACHER sees partial stats | 1. Login as TEACHER 2. View dashboard | Only course and exam stat cards visible | **Network:** GET `/api/tenant/stats` → 200 **Response:** Only `courses` and `exams` keys (backend filtered) **UI:** No empty/broken cards for missing stats | HIGH |
| B2.3 | Loading state | 1. Open DevTools Network tab 2. Enable throttling (Slow 3G) 3. Navigate to dashboard | Loading skeleton/spinner visible while data loads | **Visual:** Skeleton or spinner, no layout shift when data arrives | MEDIUM |
| B2.4 | Stats accuracy | 1. Note the user count from dashboard 2. Navigate to Users page 3. Count users | Numbers match between dashboard stats and actual data | **Cross-check:** Stats endpoint vs list endpoint counts align | HIGH |

---

### B3 — Role Management

| # | Test Case | Steps | Expected Result | DevTools Check | Severity |
|---|---|---|---|---|---|
| B3.1 | List roles | 1. Login as OWNER 2. Navigate to Roles page | All roles listed with name, hierarchy level, capability count, status badge | **Network:** GET `/api/tenant/roles` → 200 **Response:** Array of roles with nested capabilities | HIGH |
| B3.2 | System roles marked | 1. View roles list | System roles (OWNER, ADMIN, TEACHER, etc.) visually distinct from custom roles, edit/delete restricted | **UI:** System roles have lock icon or "System" badge, delete button disabled/hidden | HIGH |
| B3.3 | Create custom role | 1. Click "Create Role" 2. Enter name, select hierarchy level, check capabilities 3. Submit | Role created, appears in list | **Network:** POST `/api/tenant/roles` → 201 **Response:** Created role with capabilities **Refresh:** Role persists after page reload | HIGH |
| B3.4 | Hierarchy violation (create) | 1. Login as ADMIN (hierarchy 80) 2. Try to create role with hierarchy_level < 80 (higher authority) | Blocked — either form prevents it or backend returns 403 | **Network:** If request sent → 403 with HIERARCHY_VIOLATION **UI:** Hierarchy dropdown may only show valid levels | CRITICAL |
| B3.5 | Invalid capability IDs | 1. Attempt to create role with manipulated/invalid capability IDs (via DevTools) | Backend rejects with 422 | **Network:** POST → 422 **This tests backend defense even if frontend prevents it** | HIGH |
| B3.6 | Update custom role | 1. Click Edit on custom role 2. Change name, modify capabilities 3. Save | Changes saved, reflected in list | **Network:** PUT `/api/tenant/roles/{id}` → 200 | HIGH |
| B3.7 | Delete custom role (no users) | 1. Find custom role with no assigned users 2. Click Delete 3. Confirm | Role removed from list | **Network:** DELETE `/api/tenant/roles/{id}` → 200 **Refresh:** Role gone after reload | HIGH |
| B3.8 | Delete role blocked (has users) | 1. Find role with assigned users 2. Try to delete | Error message: "Role has active user assignments" | **Network:** DELETE → 409 (or 422) **UI:** Clear error message explaining why | HIGH |
| B3.9 | Deactivate role toggle | 1. Click toggle/deactivate on a custom role | Role shows as inactive (muted visual) | **Network:** PATCH toggle endpoint → 200 **Verify (CRITICAL):** Login as user with that role → capabilities stripped (backend enforces) | HIGH |
| B3.10 | System role protection | 1. Try to delete OWNER role 2. Try to deactivate ADMIN role | Both actions blocked | **Network:** If requests reach backend → 403 or 422 **UI:** Buttons should be disabled/hidden for system roles | CRITICAL |
| B3.11 | Capability grid display | 1. Open Create/Edit role form | All 17 capabilities shown, grouped by category (course, exam, user, etc.) | **Visual:** Capabilities organized logically, checkboxes work | MEDIUM |

---

### B4 — Course Management

| # | Test Case | Steps | Expected Result | DevTools Check | Severity |
|---|---|---|---|---|---|
| B4.1 | List courses | 1. Login as OWNER 2. Navigate to Courses page | Course table with title, status, author, dates | **Network:** GET `/api/tenant/courses` → 200 | HIGH |
| B4.2 | Create course | 1. Click "Create Course" 2. Fill form (title, description, etc.) 3. Submit | Success, course in list as draft | **Network:** POST `/api/tenant/courses` → 201 | HIGH |
| B4.3 | Create course — validation | 1. Submit empty form | Validation errors on required fields | **Network:** POST → 422 **UI:** Inline field errors | MEDIUM |
| B4.4 | Edit course | 1. Click Edit on existing course 2. Modify fields 3. Save | Updated data reflected | **Network:** PUT `/api/tenant/courses/{id}` → 200 | HIGH |
| B4.5 | Publish course | 1. Click Publish on draft course | Status changes to "published" | **Network:** POST `/api/tenant/courses/{id}/status` → 200 | HIGH |
| B4.6 | Archive course | 1. Click Archive on published course | Status changes to "archived" | **Network:** POST `/api/tenant/courses/{id}/archive` → 200 | HIGH |
| B4.7 | TEACHER sees only own courses | 1. Login as TEACHER A 2. View courses | Only courses created by TEACHER A visible (if backend enforces author scope) | **Network:** Response contains only TEACHER A's courses | HIGH |
| B4.8 | Pagination | 1. Ensure 25+ courses exist 2. Navigate pages | Correct page numbers, data changes per page | **Network:** `?page=2` parameter sent, different data returned | MEDIUM |
| B4.9 | Filtering | 1. Use status filter (draft/published/archived) | Only matching courses shown | **Network:** Query params include filter, response filtered | MEDIUM |

---

### B5 — User Management

| # | Test Case | Steps | Expected Result | DevTools Check | Severity |
|---|---|---|---|---|---|
| B5.1 | List users | 1. Login as OWNER 2. Navigate to Users page | User table with name, email, role, status | **Network:** GET `/api/tenant/users` → 200 | HIGH |
| B5.2 | Create/invite user | 1. Click "Create User" or "Invite" 2. Fill form (name, email, role) 3. Submit | User created, appears in list | **Network:** POST `/api/tenant/users` → 201 | HIGH |
| B5.3 | Duplicate email | 1. Create user with email already in this tenant | Validation error: email already exists | **Network:** POST → 422 | MEDIUM |
| B5.4 | Suspend user | 1. Click Suspend on active user | Status changes to "suspended" | **Network:** POST/PATCH suspend endpoint → 200 **Verify:** Suspended user cannot login (test separately) | HIGH |
| B5.5 | Reactivate user | 1. Click Reactivate on suspended user | Status returns to active | **Network:** POST/PATCH → 200 | HIGH |
| B5.6 | ADMIN cannot manage OWNER | 1. Login as ADMIN 2. Try to suspend/edit the OWNER user | Action blocked (button hidden or backend 403) | **Network:** If request sent → 403 **This tests hierarchy enforcement at user level** | CRITICAL |
| B5.7 | Role visibility | 1. Login as TEACHER 2. Navigate to Users (if accessible) | Page blocked (capability `user.view` not granted) OR 403 redirect | **Network:** GET → 403 OR redirect before request | HIGH |

---

### B6 — Exam Hierarchy Management

| # | Test Case | Steps | Expected Result | DevTools Check | Severity |
|---|---|---|---|---|---|
| B6.1 | List exams | 1. Navigate to Exams page | Exam list with subjects count | **Network:** GET `/api/tenant/exams` → 200 | HIGH |
| B6.2 | Create exam | 1. Click "Create Exam" 2. Fill form 3. Submit | Exam created | **Network:** POST → 201 | HIGH |
| B6.3 | Nested CRUD — subjects | 1. Open an exam 2. Add subjects | Subjects appear under the exam | **Network:** POST `/api/tenant/exams/{id}/subjects` → 201 | HIGH |
| B6.4 | Nested CRUD — chapters | 1. Open a subject 2. Add chapters | Chapters appear under the subject | **Network:** POST subjects/{id}/chapters → 201 | HIGH |
| B6.5 | Delete exam with children | 1. Try to delete exam that has subjects | Either cascades or blocks with warning | **Network:** Check response behavior — cascading delete or 409 | MEDIUM |

---

### B7 — Audit Log Viewer

| # | Test Case | Steps | Expected Result | DevTools Check | Severity |
|---|---|---|---|---|---|
| B7.1 | View audit logs | 1. Login as OWNER 2. Navigate to Audit Logs | Paginated list: timestamp, actor, action, resource, details | **Network:** GET `/api/tenant/audit-logs` → 200 **Response:** Paginated structure with data array | HIGH |
| B7.2 | Recent action appears | 1. Create a course (in another tab) 2. Return to audit logs 3. Refresh | New "course.created" entry at top | **Verify:** Log entry matches the action just performed | HIGH |
| B7.3 | Filter by action | 1. Select action filter (e.g., "course.created") 2. Apply | Only course.created entries shown | **Network:** `?action=course.created` in request | MEDIUM |
| B7.4 | Filter by date range | 1. Set date range 2. Apply | Only entries within range | **Network:** `?from=...&to=...` parameters | MEDIUM |
| B7.5 | Pagination | 1. Navigate to page 2 | Different set of entries | **Network:** `?page=2` sent, new data returned | MEDIUM |
| B7.6 | TEACHER cannot access | 1. Login as TEACHER 2. Navigate to Audit Logs (if nav shows it) | 403 or page redirects | **Network:** GET → 403 (TEACHER lacks `audit.view`) | HIGH |
| B7.7 | Expand details | 1. Click on a settings change entry | Shows `old_values` and `new_values` | **UI:** JSON or diff view of what changed | MEDIUM |

---

### B8 — Tenant Settings

| # | Test Case | Steps | Expected Result | DevTools Check | Severity |
|---|---|---|---|---|---|
| B8.1 | View settings | 1. Login as OWNER 2. Navigate to Settings | Current timezone and currency displayed | **Network:** GET `/api/tenant/settings` → 200 **Response:** Merged defaults with any saved values | HIGH |
| B8.2 | Update timezone | 1. Change timezone to "Asia/Kolkata" 2. Save | Success toast, value persisted | **Network:** PUT `/api/tenant/settings` → 200 **Refresh:** Value persists after page reload | HIGH |
| B8.3 | Update currency | 1. Change currency 2. Save | Success toast, value persisted | **Network:** PUT → 200 | MEDIUM |
| B8.4 | Invalid timezone | 1. Manipulate form to send invalid timezone (via DevTools) | Backend rejects with 422 | **Network:** PUT → 422 **UI:** Error displayed | MEDIUM |
| B8.5 | Audit trail created | 1. Update a setting 2. Go to Audit Logs | Entry shows "settings.updated" with old_values and new_values | **Verify:** Audit log captures what changed | HIGH |
| B8.6 | TEACHER cannot access | 1. Login as TEACHER 2. Navigate to Settings | Blocked (no `settings.view` capability) | **Network:** 403 or redirect | HIGH |

---

### B9 — Sidebar Navigation & Capability Gating

| # | Test Case | Steps | Expected Result | DevTools Check | Severity |
|---|---|---|---|---|---|
| B9.1 | OWNER sees all nav items | 1. Login as OWNER | All sidebar items visible: Dashboard, Courses, Users, Roles, Audit Logs, Settings | **Network:** GET `/api/tenant/auth/me` returns all capabilities | HIGH |
| B9.2 | TEACHER sees limited nav | 1. Login as TEACHER | Only: Dashboard, Courses, Exams (based on capabilities) | **Network:** `/me` returns limited capabilities **UI:** No Users, Roles, Audit Logs, Settings in sidebar | HIGH |
| B9.3 | ADMIN sees admin nav | 1. Login as ADMIN | Dashboard, Courses, Users, Roles, Audit Logs — but NOT Settings (unless admin has `settings.view`) | **Verify against actual capability mapping** | HIGH |
| B9.4 | Direct URL bypass attempt | 1. Login as TEACHER 2. Manually type `/tenant-admin-dashboard/roles` in URL bar | Either page shows 403 message OR redirects, backend definitely returns 403 | **Network:** GET roles endpoint → 403 **UI:** Meaningful "access denied" page, not broken layout | CRITICAL |

---

## 5. SECTION C: Cross-Context Security Isolation

**These are the most critical tests in the entire guide.** They prove the two dashboard contexts cannot bleed into each other.

| # | Test Case | Steps | Expected Result | DevTools Check | Severity |
|---|---|---|---|---|---|
| C1 | Platform admin → tenant dashboard | 1. Login as platform admin at `/auth/platform-login` 2. Navigate to `/tenant-admin-dashboard` | NOT authenticated on tenant side — redirect to `/auth/login` | **Cookie:** Only `ubotz_admin_token` exists, no `ubotz_auth_token` **Network:** No tenant data exposed **THE PLATFORM COOKIE MUST NOT GRANT TENANT ACCESS** | 🔴 CRITICAL |
| C2 | Tenant user → platform dashboard | 1. Login as tenant user at `school-a.localhost/auth/login` 2. Navigate to `/super-admin-dashboard` | NOT authenticated on platform side — redirect to `/auth/platform-login` | **Cookie:** Only `ubotz_auth_token` exists, no `ubotz_admin_token` **Network:** No platform data exposed | 🔴 CRITICAL |
| C3 | Both logged in simultaneously | 1. Login as platform admin 2. In same browser, login as tenant user on tenant subdomain 3. Check both dashboards | Each dashboard works independently with its own cookie | **Cookie:** Both cookies may coexist but serve different contexts **Verify:** Each dashboard loads its own data correctly | 🔴 CRITICAL |
| C4 | Platform logout doesn't kill tenant | 1. Login as both (platform + tenant) 2. Logout from platform 3. Check tenant dashboard | Tenant dashboard still works | **Cookie:** `ubotz_admin_token` gone, `ubotz_auth_token` remains | HIGH |
| C5 | Tenant logout doesn't kill platform | 1. Login as both 2. Logout from tenant 3. Check platform dashboard | Platform dashboard still works | **Cookie:** `ubotz_auth_token` gone, `ubotz_admin_token` remains | HIGH |
| C6 | API cross-context attack (manual) | 1. Login as platform admin 2. Copy `ubotz_admin_token` value 3. In DevTools Console, try: `fetch('/api/tenant/stats', {credentials: 'include'})` | 401 response — platform token rejected by tenant API | **Network:** Response is 401, no tenant data | 🔴 CRITICAL |
| C7 | API cross-context reverse | 1. Login as tenant user 2. Try: `fetch('/api/platform/staff', {credentials: 'include'})` | 401 response — tenant token rejected by platform API | **Network:** Response is 401, no platform data | 🔴 CRITICAL |

---

## 6. SECTION D: Cross-Tenant Data Isolation

**Use TWO browser profiles** (e.g., Chrome regular + Chrome incognito) to test simultaneously.

| # | Test Case | Steps | Expected Result | DevTools Check | Severity |
|---|---|---|---|---|---|
| D1 | Tenant A sees only Tenant A data | 1. Browser 1: Login as Owner A on school-a.localhost 2. View roles | Only Tenant A's roles visible | **Network:** Response contains only Tenant A data | 🔴 CRITICAL |
| D2 | Tenant B sees only Tenant B data | 1. Browser 2: Login as Owner B on school-b.localhost 2. View roles | Only Tenant B's roles visible, different from Tenant A | **Compare:** Role lists differ between browsers | 🔴 CRITICAL |
| D3 | Tenant A courses isolated | 1. Browser 1: Create course "Physics 101" as Tenant A 2. Browser 2: View courses as Tenant B | "Physics 101" NOT visible in Tenant B | **Network:** Tenant B's courses response has no Tenant A data | 🔴 CRITICAL |
| D4 | Tenant A users isolated | 1. Browser 1: View users as Tenant A 2. Browser 2: View users as Tenant B | Completely different user lists | **Compare:** No overlapping users (except by coincidence of email if different tenants) | 🔴 CRITICAL |
| D5 | Tenant A audit logs isolated | 1. Browser 1: Perform action in Tenant A 2. Browser 2: View audit logs in Tenant B | Tenant A's action NOT in Tenant B's logs | **Network:** Tenant B's audit response has zero Tenant A entries | 🔴 CRITICAL |
| D6 | URL manipulation (role ID) | 1. Login as Tenant A Owner 2. Note a role ID from Tenant A 3. Note a role ID from Tenant B (via DB or API) 4. Manually change role ID in URL to Tenant B's ID | 404 page — NOT 403, NOT Tenant B's data | **Network:** GET/PUT/DELETE with Tenant B's ID → 404 **CRITICAL:** 403 would confirm the resource exists (enumeration) | 🔴 CRITICAL |
| D7 | URL manipulation (course ID) | Same as D6 but with course IDs | 404 — Tenant B's course invisible | **Network:** → 404 | 🔴 CRITICAL |
| D8 | Tenant A settings isolated | 1. Tenant A: Change timezone to "Asia/Kolkata" 2. Tenant B: View settings | Tenant B's timezone unchanged (still default or their own value) | **Network:** Different settings values per tenant | HIGH |

---

## 7. SECTION E: Edge Cases & Error Handling

| # | Test Case | Steps | Expected Result | DevTools Check | Severity |
|---|---|---|---|---|---|
| E1 | Network failure during form submit | 1. Open DevTools → Network → Offline 2. Submit a create form (course/role/user) | Error toast: "Network error" or similar, form data preserved (not lost) | **Console:** Network error caught, no unhandled exception **UI:** Form fields still contain entered data | HIGH |
| E2 | Backend 500 error | 1. If possible, trigger a server error (or mock one) | Meaningful error message, not raw stack trace | **Network:** 500 response **UI:** "Something went wrong" message, not JSON dump | HIGH |
| E3 | Empty state (new tenant) | 1. Login to a brand-new tenant with zero courses/users/logs | Graceful empty states: "No courses yet. Create your first course." | **UI:** No broken layouts, empty tables show helpful messages | MEDIUM |
| E4 | Rapid double-click on submit | 1. Double-click "Create Course" submit button rapidly | Only ONE course created, not two (idempotency or button disable) | **Network:** Only 1 POST request sent OR backend handles duplicate **UI:** Button disabled after first click | HIGH |
| E5 | Concurrent tab operations | 1. Open two tabs on same tenant dashboard 2. Create course in Tab 1 3. Refresh Tab 2 | Tab 2 shows new course | **Network:** Tab 2's GET returns fresh data including new course | MEDIUM |
| E6 | Password reset required flag | 1. Login as user who has `password_reset_required` set | Redirected to password change form, CANNOT access dashboard until password changed | **Network:** `/me` response includes flag **UI:** Forced redirect, no dashboard access | HIGH |
| E7 | Suspended tenant login | 1. Platform admin suspends Tenant A 2. Try to login as Tenant A user | Login fails with clear message: "Your organization is suspended" | **Network:** POST login → 403 with suspension message | CRITICAL |
| E8 | Very long content | 1. Create course with very long title (200+ chars) 2. Create role with long name | UI handles gracefully — truncation, no layout break | **Visual:** Text truncated with ellipsis, table columns don't blow out | LOW |
| E9 | Special characters | 1. Create course with title containing `<script>alert('xss')</script>` | Text rendered as text, NOT executed as HTML | **Console:** No script execution **UI:** Literal text displayed | CRITICAL |
| E10 | Browser back button | 1. Navigate Dashboard → Courses → Create → submit → back | Back goes to courses list (or form), no broken state | **UI:** Predictable navigation, no white screen | MEDIUM |

---

## 8. SECTION F: Browser Compatibility & Responsiveness

| # | Test Case | Steps | Expected | Severity |
|---|---|---|---|---|
| F1 | Chrome — full flow | Run full A1 + B1 + C1 test suite in Chrome | All pass | HIGH |
| F2 | Firefox — full flow | Run full A1 + B1 + C1 test suite in Firefox | All pass, cookies work identically | HIGH |
| F3 | Safari (if available) | At minimum: login + dashboard + logout on both contexts | No cookie issues (Safari is strict on 3rd party cookies) | MEDIUM |
| F4 | Mobile viewport | 1. Open DevTools → Toggle device toolbar 2. Set to iPhone 14 / Pixel 7 3. Navigate key pages | Responsive layout, sidebar collapses, tables scroll horizontally | MEDIUM |
| F5 | Tablet viewport | 1. Set to iPad 2. Check dashboard + table pages | Reasonable layout, not broken | LOW |

---

## 9. Defect Triage Matrix

When you find a bug, classify it immediately:

| Severity | Definition | Action | Examples |
|---|---|---|---|
| 🔴 **CRITICAL** | Security boundary broken, data leaks, auth bypass | **STOP all testing. Fix immediately.** | Cross-tenant data visible, platform token grants tenant access, XSS executes |
| 🟠 **HIGH** | Feature broken, data corruption, wrong authorization | Fix before continuing to next test section | CRUD fails, wrong capabilities enforced, double-submit creates duplicates |
| 🟡 **MEDIUM** | UX issue, wrong error message, minor display bug | Document and fix before sign-off | Wrong toast message, pagination off-by-one, missing loading state |
| 🟢 **LOW** | Polish, performance, non-blocking cosmetic | Document for post-release | Slow animation, minor alignment, icon inconsistency |

---

## 10. Sign-Off Checklist

**ALL items must be checked before declaring manual testing complete.**

### Platform Admin Dashboard

```
[ ] A1: All 6 auth tests pass
[ ] A2: All 9 staff management tests pass
[ ] A3: All 7 tenant management tests pass
[ ] A4: All 5 subscription tests pass
```

### Tenant Admin Dashboard

```
[ ] B1: All 7 auth tests pass
[ ] B2: All 4 dashboard stats tests pass
[ ] B3: All 11 role management tests pass
[ ] B4: All 9 course management tests pass
[ ] B5: All 7 user management tests pass
[ ] B6: All 5 exam hierarchy tests pass
[ ] B7: All 7 audit log tests pass
[ ] B8: All 6 settings tests pass
[ ] B9: All 4 navigation/capability tests pass
```

### Security Boundaries (NON-NEGOTIABLE)

```
[ ] C1–C7: ALL 7 cross-context isolation tests pass
[ ] D1–D8: ALL 8 cross-tenant isolation tests pass
[ ] E9: XSS test passes (script not executed)
[ ] E7: Suspended tenant login blocked
```

### Edge Cases

```
[ ] E1–E10: Edge case tests documented (pass or documented as known issues with severity)
```

### Final Verification

```
[ ] Zero CRITICAL defects remaining
[ ] Zero HIGH defects remaining
[ ] All MEDIUM defects documented with tickets
[ ] DevTools console shows zero unhandled errors during normal flows
[ ] Backend test suite still green: docker exec -it ubotz_backend php artisan test
```

---

> **This guide tests the SYSTEM, not just the UI. Every test includes a DevTools checkpoint because pretty pixels on screen mean nothing if the wrong cookie is being sent, the wrong API is being called, or data from another tenant is leaking through.**
>
> **If any CRITICAL test fails, STOP testing and fix it. Security boundaries are not negotiable.**

*End of Document — UBOTZ 2.0 Frontend Manual Testing Guide*