# UBOTZ 2.0 — Dashboard Design Specification
## Standalone Teacher & EdTech Tenant Categories

| Field | Value |
|---|---|
| **Document Type** | Dashboard Feature Design Specification |
| **Phase** | Pre-Implementation — Pending Developer Instructions |
| **Date** | April 2026 |
| **Issued By** | Principal Engineer / Architecture Auditor |
| **Audience** | Product Owner, Antigravity Implementation Team |
| **Status** | Draft — Pending Sign-off |

---

## Context & Scope

The existing dashboard implementation is built exclusively for the `offline_institution` tenant category. It covers physical ERP operations: staff attendance, fee ledger, timetable, CRM pipeline, and batch-level fee collection. That implementation is **not modified by this document**.

This document defines the dashboard specification for the two remaining tenant categories:

- **Standalone Teacher** (`standalone_teacher`) — single Owner role, no staff, no CRM, no physical ERP
- **EdTech** (`edtech`) — multi-role online operation, three dashboard variants (Owner/Admin, Teacher, Staff)

The offline institution dashboard (including its Teacher and Staff role variants) is the reference baseline for structure and layout conventions. Where possible, widget names, data shapes, and UX patterns are reused. Where they are not applicable, they are explicitly replaced or removed.

---

## Architectural Note — How Dashboard Variants Are Served

The dashboard variant rendered to a user is determined by:

1. **Tenant category** (`tenants.category` — `standalone_teacher` | `edtech` | `offline_institution`)
2. **User role** (resolved from `user_role_assignments` for the authenticated user)

The frontend must resolve the correct dashboard layout from these two signals. The backend does not serve a "dashboard config" endpoint — the frontend owns the layout decision tree using the tenant context and role already available in the auth session.

**Decision tree:**

```
tenant.category === 'standalone_teacher'
  → render: StandaloneTeacherDashboard (single layout, Owner role only)

tenant.category === 'edtech'
  → user.role === 'owner' || 'admin'  → render: EdTechOwnerDashboard
  → user.role === 'teacher'           → render: EdTechTeacherDashboard
  → user.role === 'staff'             → render: EdTechStaffDashboard
  → user.role === 'student'           → redirect to /panel (not dashboard)

tenant.category === 'offline_institution'
  → existing implementation (unchanged)
```

---

## Part 1 — Standalone Teacher Dashboard

### 1.1 Overview

A standalone teacher is a solo operator. They are simultaneously the owner, the instructor, and the administrator. There is no staff, no sales team, no physical operation. The dashboard must reflect this reality: it is a **personal business cockpit**, not an institutional admin panel.

Every widget serves one of three purposes:
1. Know how the business is performing (revenue, students, course health)
2. Know what needs action today (queries, submissions, sessions)
3. Act quickly on the most common tasks

Widgets that serve institutional operations (staff, fee ledger, timetable, CRM pipeline) are absent entirely.

---

### 1.2 Header Strip

| Element | Detail |
|---|---|
| Greeting | "Good morning, [First Name]" + current date |
| Subtitle | Motivational context line: e.g., "You have 3 sessions today and 2 unread queries." |
| Last synced | Lightweight sync status indicator (same pattern as offline institution) |

---

### 1.3 Quick Actions

Six actions. Ordered by daily-use frequency.

| # | Action | Destination |
|---|---|---|
| 1 | **Add Student** | Opens manual enrollment modal — search/invite student by email |
| 2 | **Create Course** | Navigates to course builder → new course wizard |
| 3 | **Schedule Session** | Opens live session scheduler modal |
| 4 | **Write Blog Post** | Navigates to blog post editor → new post |
| 5 | **Send Announcement** | Opens announcement composer (noticeboard broadcast to all enrolled students) |
| 6 | **View My Site** | Opens `teacher-slug.educoreos.com` in a new tab |

> **Note:** "Record payment" and "Add lead" are absent — these are offline institution and CRM concepts respectively. Billing is handled automatically via Razorpay/Stripe; no manual payment recording.

---

### 1.4 Needs Your Attention

Priority-flagged items surfaced automatically. Sorted by severity (Critical → Warning → Info). Each item has a severity dot and a deep link.

| Severity | Trigger Condition | Deep Link |
|---|---|---|
| 🔴 Critical | Failed/declined payment order (student could not enroll) | `/billing/orders` |
| 🔴 Critical | Certificate issuance failed (auto-issue error) | `/certificates` |
| 🟡 Warning | Ungraded assignment submissions older than 48 hours | `/assignments` |
| 🟡 Warning | Unread student queries older than 24 hours | `/communication` |
| 🟡 Warning | Draft course unpublished for more than 7 days | `/courses` |
| 🔵 Info | New student enrollment (last 24 hours) | `/students` |
| 🔵 Info | Course nearing quota limit (`max_courses`) | `/courses` |

Maximum 6 items shown. "View all" link if more exist.

---

### 1.5 KPI Cards — Today's Snapshot

Four cards. These are the top-line numbers the teacher checks every morning.

| Card | Metric | Data Source |
|---|---|---|
| **Total Students** | Count of all active enrolled students across all courses | `enrollments` (active, tenant-scoped) |
| **Revenue This Month** | Sum of completed payment orders in the current calendar month (INR or AED/SAR depending on market) | `student_payment_orders` |
| **Active Courses** | Count of published courses | `courses` (published, tenant-scoped) |
| **Pending Queries** | Count of unread/open communication threads | `communication_threads` (unread) |

> No attendance strip. Standalone teacher has no physical attendance concept. Student engagement is tracked via course progress, not daily attendance.

---

### 1.6 Widgets

Widgets are arranged in a responsive grid. Order below reflects default priority (top-left to bottom-right on desktop).

---

#### Widget 1 — Revenue Overview (Primary Financial Widget)

**Purpose:** Understand business financial health at a glance.

| Element | Detail |
|---|---|
| Chart | Monthly revenue bar chart — last 6 months |
| Summary row | **This month:** `₹X` | **Last month:** `₹X` | **All time:** `₹X` |
| Pending payouts | If applicable (Razorpay/Stripe payout pending): shown as a callout below chart |
| Recent orders | Last 5 payment orders — student name, course, amount, status (Paid / Failed / Refunded) |
| Link | "View all orders →" to `/billing/orders` |

> This widget replaces the offline institution "Financial Overview" (fee collection trend). The data model is `student_payment_orders`, not the fee ledger.

---

#### Widget 2 — Today's Live Sessions

**Purpose:** Know exactly what is happening in class today.

| Element | Detail |
|---|---|
| Session list | All sessions scheduled for today — course name, time, status badge (Upcoming / Live / Done / Cancelled) |
| Join button | "Join" CTA on Live sessions |
| Empty state | "No sessions scheduled today. [Schedule one →]" |
| Link | "Full schedule →" to `/live-sessions` |

Same structure as offline institution "Today's Classes" widget. Powered by live session data, not timetable.

---

#### Widget 3 — Course Performance

**Purpose:** Spot which courses are thriving and which need attention.

| Element | Detail |
|---|---|
| List | All active courses — name, enrolled student count, avg completion %, last enrollment date |
| Highlight | Courses with zero new enrollments in last 14 days shown with a warning indicator |
| Highlight | Courses with avg completion < 20% shown with an info indicator |
| Link | "Manage courses →" to `/courses` |

---

#### Widget 4 — Recent Student Activity

**Purpose:** Stay close to what students are actually doing.

| Element | Detail |
|---|---|
| Feed items | Last 10 events: new enrollment, course completion, assignment submission, quiz attempt, certificate issued |
| Format | "[Student Name] completed [Course Name] · 2 hours ago" |
| Link | "View all activity →" to `/students` |

---

#### Widget 5 — Upcoming Assessments

**Purpose:** Know which quizzes or assignments are due soon so students can be prompted.

| Element | Detail |
|---|---|
| List | Assignments and quizzes with due dates in the next 7 days — name, course, due date, submission count / total enrolled |
| Indicator | Low submission count (< 30% of enrolled) shown with warning |
| Link | "View all assessments →" to `/assignments` and `/quizzes` |

---

#### Widget 6 — Blog Posts

**Purpose:** Track content publishing without leaving the dashboard.

| Element | Detail |
|---|---|
| Draft count | "X drafts waiting to be published" — shown as a callout if drafts exist |
| Recent posts | Last 3 published posts — title, published date, estimated read time |
| CTA | "Write new post →" to `/blog/new` |
| Link | "Manage blog →" to `/blog` |

> This widget is shown only if `module.blog` is enabled for the tenant's plan. Hidden (not disabled) otherwise.

---

#### Widget 7 — Enrollment Trend

**Purpose:** Visualise student growth momentum.

| Element | Detail |
|---|---|
| Chart | Line chart — new enrollments per day for the last 30 days |
| Summary | This week vs last week comparison |

---

### 1.7 What Is Explicitly Absent

The following widgets from the offline institution dashboard are intentionally absent from the Standalone Teacher dashboard. These must not be added even if technically possible.

| Absent Widget | Reason |
|---|---|
| Attendance strip | No physical attendance concept |
| Staff Overview | No staff |
| CRM Pipeline | No CRM module |
| Fee Collection by Batch | No fee ledger; billing is order-based |
| Today's Timetable (ERP timetable) | No timetable module; replaced by Today's Live Sessions |
| Financial Health (outstanding fees) | No fee receivables; replaced by Revenue Overview |
| Student Attendance Trend | No physical attendance |
| Staff desk view / Teacher view variants | Standalone teacher has only one role (Owner) |

---

---

## Part 2 — EdTech Dashboard

### 2.1 Overview

An EdTech tenant is an online education business with multiple instructors, a sales team, and a growing student base. The dashboard has three role variants:

- **Owner / Admin** — full business intelligence view
- **Teacher** — course delivery and student management focus
- **Staff** — lead management and enrollment operations focus

The EdTech dashboard shares structural patterns with the offline institution dashboard but replaces physical ERP widgets with online business equivalents.

---

## 2A — Owner / Admin Dashboard

### 2A.1 Header Strip

| Element | Detail |
|---|---|
| Greeting | "Good morning, [First Name]" + current date |
| Subtitle | Business context: e.g., "3 new leads today · ₹24,500 collected this week · 2 sessions live now" |
| Last synced | Sync status indicator |

---

### 2A.2 Quick Actions

| # | Action | Destination |
|---|---|---|
| 1 | **Add Student** | Manual enrollment modal |
| 2 | **Add Lead** | New lead form in CRM |
| 3 | **Create Course** | Course builder wizard |
| 4 | **Send Announcement** | Noticeboard broadcast composer |
| 5 | **Invite Teacher** | User invite modal — role pre-set to Teacher |
| 6 | **View Billing** | `/billing` |

---

### 2A.3 Needs Your Attention

| Severity | Trigger | Deep Link |
|---|---|---|
| 🔴 Critical | Failed payment order (student billing) | `/billing/orders` |
| 🔴 Critical | Lead assigned to a teacher/staff with no follow-up in 48 hours | `/crm/leads` |
| 🔴 Critical | Certificate auto-issue failure | `/certificates` |
| 🟡 Warning | Ungraded submissions older than 48 hours across any course | `/assignments` |
| 🟡 Warning | Course unpublished (draft) for more than 7 days | `/courses` |
| 🟡 Warning | Low-enrollment course (< 5 students) published for 30+ days | `/courses` |
| 🟡 Warning | Quota approaching limit (`max_users`, `max_courses`) | `/settings/subscription` |
| 🔵 Info | New student enrolled in last 24 hours | `/students` |
| 🔵 Info | New lead captured via landing page form | `/crm/leads` |

---

### 2A.4 KPI Cards — Today's Snapshot

| Card | Metric | Data Source |
|---|---|---|
| **Total Students** | Active enrolled students (all courses, all teachers) | `enrollments` |
| **Revenue This Month** | Completed payment orders, current calendar month | `student_payment_orders` |
| **Open Leads** | Leads in active pipeline stages (not won/lost) | `leads` |
| **Active Courses** | Published courses across all teachers | `courses` |

---

### 2A.5 Widgets

---

#### Widget 1 — Revenue Overview

| Element | Detail |
|---|---|
| Chart | Monthly revenue bar chart — last 6 months |
| Summary row | **This month** / **Last month** / **All time** |
| Breakdown | Revenue by course (top 5 courses by revenue this month) |
| Orders summary | Paid / Pending / Failed order counts for current month |
| Link | "View all orders →" to `/billing/orders` |

---

#### Widget 2 — CRM Pipeline

Same structure as offline institution CRM pipeline widget.

| Element | Detail |
|---|---|
| View | Stage-wise lead count: New → Contacted → Demo → Proposal → Won / Lost |
| Chart | Horizontal funnel bar or stage count chips |
| Summary | Conversion rate this month (Won / Total entered pipeline) |
| Link | "View all leads →" to `/crm/leads` |

---

#### Widget 3 — Today's Classes

| Element | Detail |
|---|---|
| List | All live sessions across all teachers today — course, teacher name, time, status badge (Upcoming / Live / Done / Cancelled) |
| Filter | All teachers (default) / My sessions |
| Link | "Full schedule →" to `/live-sessions` |

---

#### Widget 4 — Courses & Enrollments

| Element | Detail |
|---|---|
| Summary chips | Active courses count / New enrollments this week / Courses with 0 new enrollments this month |
| List | Top 5 courses by enrollment — name, teacher, enrolled count, completion rate |
| Alert row | Low-enrollment courses (< 5 students, published 30+ days) |
| Link | "Manage courses →" to `/courses` |

---

#### Widget 5 — Teacher Overview

> Replaces "Staff Overview" from offline institution. EdTech has no physical staff attendance.

| Element | Detail |
|---|---|
| Summary | Total teachers / Active today (has a session scheduled) / With unpublished courses |
| List | Each teacher — name, active courses count, students assigned, last login |
| Alert | Teachers with no activity in last 7 days |
| Link | "Manage teachers →" to `/users?role=teacher` |

---

#### Widget 6 — Upcoming Assessments

| Element | Detail |
|---|---|
| List | Assignments and quizzes due in next 7 days — name, course, teacher, due date, submission count |
| Indicator | Low submission rate warning (< 30% submitted) |
| Link | "View all →" to `/assignments` |

---

#### Widget 7 — Recent Activity Feed

| Element | Detail |
|---|---|
| Feed | Last 15 events: enrollments, lead captures, course publications, session completions, payment events |
| Format | "[Student / Lead / Teacher Name] [action] · [time ago]" |
| Filter | All activity (default) / Financial only / CRM only |

---

#### Widget 8 — Enrollment Trend

| Element | Detail |
|---|---|
| Chart | Line chart — new enrollments per day, last 30 days |
| Comparison | This month vs last month |

---

#### Widget 9 — Financial Health

| Element | Detail |
|---|---|
| Pending orders | Count and total value of orders in pending/processing state |
| Failed orders | Count of failed orders this month — with retry prompt |
| Recent transactions | Last 5 transactions — student, course, amount, status |
| Link | "View billing →" to `/billing` |

---

### 2A.6 What Is Explicitly Absent (Owner/Admin)

| Absent Widget | Reason |
|---|---|
| Staff attendance strip | No physical attendance in EdTech |
| Fee collection by batch | No fee ledger; replaced by order-based billing |
| Student attendance trend | No physical attendance |
| Outstanding fees / overdue payments | No fee receivable model |
| Payroll widget | No payroll module in EdTech |

---

---

## 2B — EdTech Teacher Dashboard

### 2B.1 Overview

An EdTech teacher is an instructor employed or contracted by the EdTech organisation. Their dashboard is scoped entirely to their own courses and students. They cannot see business-level financials, CRM pipelines, or other teachers' data.

Resource-level scoping is enforced at the UseCase layer — not by UI hiding alone. A teacher can only see courses where `created_by == user.id` OR where they have been explicitly assigned as a co-instructor.

---

### 2B.2 Header Strip

| Element | Detail |
|---|---|
| Greeting | "Good morning, [First Name]" + current date |
| Subtitle | "You have [X] sessions today · [Y] submissions to grade" |

---

### 2B.3 Quick Actions

| # | Action | Destination |
|---|---|---|
| 1 | **Grade Submissions** | `/assignments?filter=pending_grade` |
| 2 | **Schedule Session** | Live session scheduler modal |
| 3 | **My Courses** | `/courses?filter=mine` |
| 4 | **Send Announcement** | Noticeboard composer (scoped to teacher's enrolled students only) |
| 5 | **View Student Queries** | `/communication?filter=unread` |

---

### 2B.4 Needs Your Attention

| Severity | Trigger | Deep Link |
|---|---|---|
| 🔴 Critical | Assignment submissions ungraded for more than 48 hours | `/assignments` |
| 🟡 Warning | Unanswered student queries older than 24 hours | `/communication` |
| 🟡 Warning | Draft course unpublished for more than 7 days | `/courses` |
| 🔵 Info | New student enrolled in one of my courses (last 24 hours) | `/students` |
| 🔵 Info | Upcoming session in less than 30 minutes | `/live-sessions` |

---

### 2B.5 KPI Cards — Teacher Snapshot

| Card | Metric | Scope |
|---|---|---|
| **My Courses** | Count of courses where teacher is author / assigned | Own courses only |
| **My Students** | Count of unique students enrolled in any of teacher's courses | Own courses only |
| **Today's Sessions** | Sessions scheduled for today | Own sessions only |
| **Pending Grades** | Ungraded assignment submissions | Own courses only |

---

### 2B.6 Widgets

---

#### Widget 1 — Today's Schedule

| Element | Detail |
|---|---|
| List | Teacher's sessions for today — course, time, status, join button for Live sessions |
| Empty state | "No sessions today. [Schedule one →]" |
| Link | "Full schedule →" to `/live-sessions` |

---

#### Widget 2 — My Course Performance

| Element | Detail |
|---|---|
| List | Each of the teacher's courses — enrolled count, avg completion %, last enrollment date |
| Alert | Courses with avg completion < 20% |
| Alert | Courses with no new enrollments in last 14 days |
| Link | "Manage courses →" to `/courses` |

---

#### Widget 3 — Pending Submissions

| Element | Detail |
|---|---|
| List | Assignment submissions awaiting grade — student name, assignment name, course, submitted date |
| Sort | Oldest first (by default) |
| CTA | "Grade" button per item — links directly to submission grading view |
| Link | "View all →" to `/assignments` |

---

#### Widget 4 — Upcoming Assessments

| Element | Detail |
|---|---|
| List | Quizzes and assignments due in next 7 days — name, course, due date, submission count vs enrolled |
| Warning | Low submission rate items highlighted |

---

#### Widget 5 — Student Activity (My Courses)

| Element | Detail |
|---|---|
| Feed | Last 10 events scoped to teacher's courses: enrollments, completions, submissions, quiz attempts |
| Format | "[Student Name] [action] in [Course Name] · [time ago]" |

---

#### Widget 6 — Student Queries (Communication)

| Element | Detail |
|---|---|
| List | Last 5 unread communication threads from students in teacher's courses |
| CTA | "Reply" per thread |
| Link | "View all →" to `/communication` |

---

---

## 2C — EdTech Staff Dashboard

### 2C.1 Overview

An EdTech staff member operates at the business operations layer — lead management, enrollment processing, and billing support. They do not manage courses or academic content. Their dashboard is a **sales and operations desk**.

Staff cannot see financial summaries, teacher performance, or other staff members' assigned leads (unless they hold `lead.scope.all` capability).

---

### 2C.2 Header Strip

| Element | Detail |
|---|---|
| Greeting | "Good morning, [First Name]" + current date |
| Subtitle | "You have [X] open leads · [Y] follow-ups due today" |

---

### 2C.3 Quick Actions

| # | Action | Destination |
|---|---|---|
| 1 | **Add Lead** | New lead form |
| 2 | **Add Student** | Manual enrollment modal |
| 3 | **Send Announcement** | Noticeboard broadcast composer |
| 4 | **View Today's Follow-ups** | `/crm/leads?filter=followup_today` |
| 5 | **View Billing Orders** | `/billing/orders` |

> "Record payment" is absent — online billing is handled via Razorpay/Stripe. There is no manual payment recording in the EdTech category.

---

### 2C.4 Needs Your Attention

| Severity | Trigger | Deep Link |
|---|---|---|
| 🔴 Critical | Lead with no follow-up in 48 hours (assigned to this staff member) | `/crm/leads` |
| 🔴 Critical | Failed payment order requiring manual resolution | `/billing/orders` |
| 🟡 Warning | Follow-ups due today not yet acted on | `/crm/leads?filter=followup_today` |
| 🟡 Warning | Lead in "Demo" stage for more than 7 days with no stage progression | `/crm/leads` |
| 🔵 Info | New lead assigned to this staff member | `/crm/leads` |
| 🔵 Info | New student enrolled today | `/students` |

---

### 2C.5 KPI Cards — Staff Snapshot

| Card | Metric | Scope |
|---|---|---|
| **My Open Leads** | Leads in active stages assigned to this staff member | `lead.scope.assigned_only` or `lead.scope.all` |
| **Follow-ups Due Today** | Leads with `follow_up_date = today` | Scoped to staff member |
| **New Enrollments Today** | Students enrolled today (all courses) | Global |
| **Pending Orders** | Payment orders in pending/processing state | Global |

---

### 2C.6 Widgets

---

#### Widget 1 — CRM Pipeline

| Element | Detail |
|---|---|
| View | Stage-wise lead counts: New → Contacted → Demo → Proposal → Won / Lost |
| Scope | `lead.scope.all` → all leads. `lead.scope.assigned_only` → staff member's own leads |
| Summary | Conversion rate this month |
| Link | "View all leads →" to `/crm/leads` |

---

#### Widget 2 — My Follow-ups Today

| Element | Detail |
|---|---|
| List | Leads with follow-up scheduled today — lead name, stage, contact, follow-up note |
| CTA | "Mark done" / "Reschedule" per item |
| Empty state | "All follow-ups done for today ✓" |

---

#### Widget 3 — Recent Lead Activity

| Element | Detail |
|---|---|
| Feed | Last 10 CRM events scoped to staff's leads: new lead, stage change, follow-up logged, won/lost |
| Format | "[Lead Name] moved to [Stage] · [time ago]" |
| Link | "View all →" to `/crm/leads` |

---

#### Widget 4 — Recent Student Registrations

| Element | Detail |
|---|---|
| List | Last 10 new student enrollments — student name, course enrolled, enrollment date, payment status |
| Link | "View all students →" to `/students` |

---

#### Widget 5 — Billing Orders (Compact)

| Element | Detail |
|---|---|
| Summary chips | Paid this week / Pending / Failed |
| List | Last 5 orders — student, course, amount, status |
| Alert | Failed orders with retry indicator |
| Link | "View all orders →" to `/billing/orders` |

---

#### Widget 6 — Today's Live Sessions (Read-only)

| Element | Detail |
|---|---|
| List | All sessions today across all courses — for context when students call in with queries |
| No join button | Staff cannot join teacher sessions |
| Link | "Full schedule →" to `/live-sessions` |

---

### 2C.7 What Is Explicitly Absent (Staff)

| Absent Widget | Reason |
|---|---|
| Revenue Overview / Financial charts | Staff do not see business financials |
| Teacher Overview | Staff manage leads and students, not teachers |
| Course Performance | Not in staff operational scope |
| Student Activity Feed (academic) | Academic events are teacher scope |
| Payroll | No payroll in EdTech |

---

---

## Part 3 — Shared Decisions & Implementation Notes

### 3.1 "Needs Your Attention" — Implementation Rules

Across all three categories and all role variants, the Needs Your Attention section follows these rules:

- Items are generated server-side via a dedicated `DashboardAttentionService` (or equivalent UseCase)
- Maximum 6 items rendered; "View all" link if more exist
- Items are **tenant-scoped and role-scoped** — a Teacher only sees attention items for their own courses/students
- Severity order: Critical → Warning → Info
- Items are dismissible per session (dismissed state is ephemeral, not persisted — it resets on next login)
- Clicking a deep link marks the item as "actioned" for the session

### 3.2 KPI Cards — Data Freshness

KPI cards are **not real-time**. They are cached with a 5-minute TTL using the existing Redis cache layer. A "Last updated X minutes ago" micro-label is shown beneath the cards.

This is consistent with the offline institution dashboard pattern. Do not introduce WebSocket or polling for KPI cards in v1.

### 3.3 Widget Visibility Rules

Widgets that depend on a plan-gated module must be **hidden entirely** (not disabled/greyed) when the module is not enabled. Specifically:

| Widget | Module Gate |
|---|---|
| Blog Posts (Standalone Teacher) | `module.blog` |
| CRM Pipeline (EdTech Owner, EdTech Staff) | `module.crm` |
| CRM Pipeline — WhatsApp events | `module.whatsapp` |
| Upcoming Assessments | `module.assignments` or `feature.quiz.course_bound` |
| Certificates widget | `module.certificates` |

Widget visibility is resolved from the tenant's capability set available in the auth session. Do not make separate API calls to check module entitlement for widget visibility.

### 3.4 Role-Scoping Enforcement

**Frontend:** Renders the correct dashboard layout based on tenant category + user role from the auth session. UI does not show data outside the user's role scope.

**Backend:** Every dashboard data endpoint enforces role-scoping at the UseCase layer. Teacher-scoped endpoints filter by `created_by = authenticated_user_id` or by explicit faculty assignment. Staff-scoped CRM endpoints respect `lead.scope.assigned_only` vs `lead.scope.all` capability.

UI-level hiding is never sufficient. Backend must enforce independently.

### 3.5 Comparison with Offline Institution Dashboard

| Feature Area | Standalone Teacher | EdTech | Offline Institution |
|---|---|---|---|
| Attendance strip | ❌ | ❌ | ✅ |
| Staff Overview | ❌ | ✅ (Teacher Overview) | ✅ |
| CRM Pipeline | ❌ | ✅ | ✅ |
| Fee collection widgets | ❌ | ❌ | ✅ |
| Timetable widget | ❌ | ❌ | ✅ |
| Revenue / Order widgets | ✅ | ✅ | ❌ |
| Blog widget | ✅ | ❌ | ❌ |
| Live sessions widget | ✅ | ✅ | ✅ |
| Course performance | ✅ | ✅ | ✅ |
| Role variants | 1 (Owner only) | 3 (Owner/Admin, Teacher, Staff) | 3 (Owner/Admin, Teacher, Staff) |

---

## Part 4 — Open Decisions (Must Be Resolved Before Developer Instructions)

| # | Decision | Options | Impact |
|---|---|---|---|
| OD-001 | Should EdTech Owner see a "per-teacher revenue breakdown" widget? | Yes (add widget) / No (keep revenue global only) | Adds a new data aggregation requirement if Yes |
| OD-002 | Should EdTech Staff see the "Today's Live Sessions" widget? | Yes (read-only) / No (not in scope) | Currently included in this spec as read-only; confirm |
| OD-003 | Should the Blog widget on Standalone Teacher dashboard show view/read counts per post? | Yes (requires analytics tracking on public blog) / No (title + date only) | Analytics complexity if Yes |
| OD-004 | Should Standalone Teacher KPI cards include a "Certificates Issued" count? | Yes / No | Simple addition if Yes; confirm desirability |

---

*End of document. Superseding documents will be versioned with a new filename — this document is not edited in place.*
