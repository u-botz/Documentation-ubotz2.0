# UBOTZ 2.0 — Tenant Admin Dashboard UI/UX Design Guidelines

**Document Type**: UI/UX Design Standard  
**Scope**: Tenant Admin Dashboard — Institution Owner, Teacher/Instructor, Staff/Admin  
**Status**: Draft v1.0  
**Applies To**: All frontend work within the Tenant Admin portal  

---

## 1. Purpose & Scope

This document defines the UI/UX design principles, layout standards, component behaviour, and interaction patterns for the **UBOTZ Tenant Admin Dashboard**. It serves as the authoritative design reference for all frontend development targeting the tenant-facing portal.

The Tenant Admin Dashboard is used by three distinct role personas within an institution:

| Persona | Mental Model | Primary Goal |
|---|---|---|
| **Institution Owner** | School director / principal | Full visibility, configuration, oversight |
| **Teacher / Instructor** | Classroom operator | Daily class actions — attendance, completion, content |
| **Staff / Admin** | Operations support | User management, reports, administrative tasks |

All three personas share the **same dashboard layout and navigation structure**. Role differences are expressed through **permission-based visibility** — menu items and actions that a role cannot access are hidden, not disabled with grey-out. This keeps the interface clean and non-confusing for lower-privilege roles.

---

## 2. Design System Foundation

### 2.1 Color Tokens

The UBOTZ tenant dashboard uses a **tenant-themeable, neutral-first, accent-driven** token system. All colors are defined as CSS custom properties. Hard-coded hex values in components are a violation.

```css
/* Base tokens — always present regardless of tenant theme */
:root {
  /* Neutrals */
  --color-background:      #F9FAFB;
  --color-surface:         #FFFFFF;
  --color-border:          #E5E7EB;
  --color-text-primary:    #111827;
  --color-text-secondary:  #6B7280;
  --color-text-muted:      #9CA3AF;

  /* Semantic — never override these with tenant theme */
  --color-success:         #10B981;
  --color-warning:         #F59E0B;
  --color-danger:          #EF4444;
  --color-info:            #6366F1;

  /* Tenant-themeable accent — overridden at runtime */
  --color-brand-50:        #EFF6FF;
  --color-brand-100:       #DBEAFE;
  --color-brand-500:       #3B82F6;   /* primary actions */
  --color-brand-600:       #2563EB;   /* hover state */
  --color-brand-900:       #1E3A8A;   /* sidebar background */
}
```

The `--color-brand-*` family is the **tenant theme slot**. When an Institution Owner customises their theme, only this family is overridden. Semantic colors (danger, success, warning) are **never themeable** — they carry functional meaning and must remain consistent across all tenants.

### 2.2 Tenant Theme Customisation

Institution Owners can customise their institution's brand appearance via the Settings → Appearance panel.

**Customisation model:**
- **Preset palettes** — a curated grid of 12–16 pre-approved brand palettes (safe, accessible, professional)
- **Custom hex input** — Owner may enter any hex value; the system auto-generates the full `brand-50` through `brand-900` shade ramp using lightness interpolation
- **Theme scope** — one theme per tenant, applied uniformly to all roles (Owner, Teacher, Staff)
- **Live preview** — theme changes must show a real-time preview before saving

**Contrast enforcement rule:**
Before saving a custom color, the system must validate that the chosen accent color meets **WCAG AA contrast (4.5:1)** against white (`#FFFFFF`) when used as button background with white text. If it fails, the system must warn the user and suggest the nearest accessible shade. It must never silently save a failing color.

**Token override pattern (runtime injection):**
```css
/* Injected via <style> tag on tenant layout root at SSR time */
[data-tenant="tenant-slug"] {
  --color-brand-50:   /* computed */;
  --color-brand-100:  /* computed */;
  --color-brand-500:  /* owner-chosen primary */;
  --color-brand-600:  /* hover — auto-darkened by 10% */;
  --color-brand-900:  /* sidebar — auto-darkened by 40% */;
}
```

### 2.3 Typography Scale

```css
:root {
  --font-display: 'Plus Jakarta Sans', sans-serif;  /* page headings */
  --font-body:    'Inter', sans-serif;              /* all UI text */
  --font-mono:    'JetBrains Mono', monospace;      /* IDs, codes */

  --text-xs:   0.75rem;    /* 12px — labels, badges, helper text */
  --text-sm:   0.875rem;   /* 14px — table rows, captions */
  --text-base: 1rem;       /* 16px — body, form fields */
  --text-lg:   1.125rem;   /* 18px — card titles */
  --text-xl:   1.25rem;    /* 20px — section headings */
  --text-2xl:  1.5rem;     /* 24px — page headings */
  --text-3xl:  1.875rem;   /* 30px — KPI numbers */
}
```

### 2.4 Spacing & Radius

All spacing follows an **8px base grid**. No arbitrary pixel values in components.

```css
:root {
  --radius-sm:   4px;    /* chips, badges */
  --radius-md:   8px;    /* inputs, small cards */
  --radius-lg:   12px;   /* cards, modals */
  --radius-xl:   16px;   /* large panels */
  --radius-full: 9999px; /* avatars, pill buttons */
}
```

---

## 3. Layout Architecture

### 3.1 Desktop Layout (≥ 1024px)

The desktop layout uses a fixed **three-zone** structure:

```
┌─────────────────────────────────────────────────────┐
│  TOP BAR (64px fixed)                               │
│  [Institution Logo + Name] ── [Search] ── [Profile] │
├────────────┬────────────────────────────────────────┤
│  SIDEBAR   │  MAIN CONTENT AREA                     │
│  (240px    │                                        │
│   fixed)   │  ┌──────────────────────────────────┐ │
│            │  │  PageHeader                      │ │
│  Nav       │  │  (title + breadcrumb + CTA)      │ │
│  Groups    │  └──────────────────────────────────┘ │
│            │  ┌──────────────────────────────────┐ │
│            │  │  Page Content                    │ │
│            │  │  (SectionCards, Tables, Forms)   │ │
│            │  └──────────────────────────────────┘ │
└────────────┴────────────────────────────────────────┘
```

**Top Bar rules:**
- Always shows the **institution name and logo** — never "Tenant Dashboard" as a static string
- Logged-in user's name and avatar on the right
- Notification bell with unread count badge
- Logout is accessible but not prominent (user menu dropdown, not top-level button)

**Sidebar rules:**
- Width: 240px fixed on desktop, collapsible to 64px icon-only rail via toggle
- Background: `--color-brand-900` (tenant-themed dark)
- Active item: left-border accent (`4px solid --color-brand-500`) + subtle background tint (`--color-brand-50` at 10% opacity)
- Active item text: `--color-surface` (white)
- Inactive item text: `--color-text-muted` lightened for dark background contrast
- Section group labels (`GENERAL`, `LMS MANAGEMENT` etc.): `--text-xs`, uppercase, `--color-text-muted`, not clickable
- Items hidden if role lacks permission — never shown as disabled/greyed

### 3.2 Mobile Layout (< 768px)

Mobile receives a **dedicated simplified view** — not a compressed version of desktop. The sidebar is replaced by a **bottom navigation bar** for primary actions, and a hamburger drawer for secondary navigation.

```
┌────────────────────────────────┐
│  TOP BAR (56px)                │
│  [☰] [Institution Name] [🔔👤] │
├────────────────────────────────┤
│                                │
│   MAIN CONTENT AREA            │
│   (scrollable)                 │
│                                │
│   Role-specific quick actions  │
│   and focused content          │
│                                │
├────────────────────────────────┤
│  BOTTOM NAV (56px fixed)       │
│  [Home] [Classes] [+] [Reports]│
│                                [Profile]│
└────────────────────────────────┘
```

**Bottom nav tab rules:**
- Maximum 5 tabs
- Centre tab (`+`) is a **floating action button (FAB)** for the role's primary action:
  - Owner: Add Course / Add User
  - Teacher: Start Class / Mark Attendance
  - Staff: Add User / Generate Report
- Active tab: icon + label in `--color-brand-500`
- Inactive: icon only in `--color-text-muted`
- Touch targets: minimum 44×44px per tab

**Hamburger drawer rules:**
- Full-height right-to-left slide-in drawer (80% viewport width)
- Contains the full navigation tree for secondary items
- Closes on backdrop tap or swipe-right gesture

### 3.3 Tablet Layout (768px – 1023px)

- Sidebar collapses to 64px icon-rail by default (user can expand)
- Top bar and main content behave identically to desktop
- No bottom navigation bar on tablet — use the rail sidebar instead

---

## 4. Role-Based Navigation & Permission Visibility

### 4.1 Shared Navigation Structure

All three roles see the same sidebar navigation groups. Items are shown or hidden based on the role's capabilities. The navigation groups are:

| Group | Items |
|---|---|
| **General** | Dashboard, Notifications |
| **LMS Management** | Departments, Courses, Enrollments, Bundles, Quizzes |
| **Attendance & Classes** | Classes, Attendance |
| **User & CRM** | Leads, Users, Roles |
| **Content & CMS** | Blog, Landing Page, File Manager |
| **Sales & ERP** | Installments, Fees |
| **Settings** | Appearance, General Settings, Billing |

### 4.2 Role Visibility Matrix

| Nav Item | Institution Owner | Teacher | Staff |
|---|---|---|---|
| Dashboard | ✅ Full | ✅ Role-scoped | ✅ Role-scoped |
| Departments | ✅ | ❌ Hidden | ✅ |
| Courses | ✅ | ✅ (own courses) | ✅ |
| Enrollments | ✅ | ✅ (own students) | ✅ |
| Classes | ✅ | ✅ | ✅ |
| Attendance | ✅ | ✅ | ✅ |
| Users | ✅ | ❌ Hidden | ✅ |
| Roles | ✅ | ❌ Hidden | ❌ Hidden |
| Leads | ✅ | ❌ Hidden | ✅ |
| Appearance | ✅ | ❌ Hidden | ❌ Hidden |
| Billing | ✅ | ❌ Hidden | ❌ Hidden |

**Rule**: Never show a navigation item and then display a "403 Forbidden" page. If the role cannot access it, the item must not render at all. The backend enforces authorization independently — the frontend hide is a UX courtesy only.

### 4.3 Dashboard Home — Role-Scoped Content

All roles land on the same Dashboard route (`/dashboard`). The content rendered is role-scoped:

**Institution Owner home:**
- KPI row: Total Students, Active Courses, Today's Classes, Monthly Revenue
- Recent enrollment activity feed
- Class schedule for today (overview)
- Quick links: Add Course, Add User, View Reports

**Teacher home:**
- KPI row: My Courses, My Students, Today's Classes, Pending Attendance
- Today's class schedule (their classes only)
- Quick action card: "Mark Today's Attendance" (prominent, above fold)
- Recent student activity in their courses

**Staff home:**
- KPI row: Total Users, Open Leads, Pending Fees, Today's Tasks
- Recent user registrations
- Pending administrative tasks

---

## 5. Page Layout Standard

Every page inside the dashboard must follow the **three-layer page structure**:

```
Layer 1: PageHeader
  ├── Page title (--text-2xl, --font-display)
  ├── Breadcrumb navigation
  ├── Page description (--text-sm, --color-text-secondary)
  └── Primary CTA button (top-right, brand-colored)

Layer 2: Toolbar (when applicable)
  ├── Search input (left-aligned)
  ├── Filter controls (inline with search)
  └── Secondary actions (right-aligned: export, refresh, etc.)

Layer 3: Content
  └── SectionCard(s) containing tables, forms, or detail panels
```

**SectionCard standard:**
- Background: `--color-surface` (`#FFFFFF`)
- Border: `1px solid --color-border`
- Border radius: `--radius-lg` (12px)
- Padding: `24px` (desktop), `16px` (mobile)
- Box shadow: `0 1px 3px rgba(0,0,0,0.06)` — subtle, not elevated

---

## 6. Attendance & Class Management UX

This section is the **highest priority** interaction area. The UI must be optimised for speed and reliability — teachers use this in a live classroom environment.

### 6.1 Desktop — Classes List Page

**Layout:**
```
PageHeader: "Classes"  [breadcrumb]          [+ Schedule Class]
Toolbar:    [Search classes...]  [Date filter]  [Status filter]

SectionCard:
  Table columns: Class Name | Course | Date & Time | Type | Students | Status | Actions
  Row actions: [View] [Mark Attendance] [End Class]
```

**Status badges:**
- `Scheduled` — `--color-info` (indigo) pill badge
- `Ongoing` — `--color-success` (green) pill badge with pulsing dot indicator
- `Completed` — neutral grey pill badge
- `Cancelled` — `--color-danger` (red) pill badge

**"Mark Attendance" action:**
- Only visible when class status is `Ongoing`
- Opens a full-page view or large right-side drawer (not a small modal — the student list can be long)

**"End Class" action:**
- Only visible when class status is `Ongoing`
- Triggers a **confirmation dialog** (not inline) — "Are you sure you want to end this class? This cannot be undone."
- Confirmation button labeled "End Class" in `--color-danger`, cancel button secondary
- After confirmation: status updates to `Completed`, row reflects change immediately (optimistic UI)

### 6.2 Desktop — Attendance Marking View

The attendance marking view opens as a **full-page route** (`/classes/{id}/attendance`) — not a modal. Modals are inappropriate for student lists that can exceed 50+ rows.

```
PageHeader: "Attendance — [Class Name]"   [Save & Close]
            [Course Name] · [Date] · [Teacher Name]

Toolbar:    Summary chips: [Present: 42] [Absent: 0] [Late: 0]
            [Search student name...]

Student List:
  ┌──────────────────────────────────────────────────────┐
  │ Avatar  Student Name      Roll No.   ● Present  ▼   │
  │                                      (dropdown: Present / Absent / Late) │
  └──────────────────────────────────────────────────────┘
```

**Hybrid default behaviour:**
- On load, **all students default to Present** — teacher only changes exceptions
- The default state is visually communicated: a banner reads "All students marked Present by default. Change exceptions below."
- Status selector per student: three-option segmented control or compact dropdown: `Present` / `Absent` / `Late`
- Changed rows are visually highlighted (light yellow tint) so teacher can see what they modified
- Summary chips update in real-time as teacher makes changes

**Save behaviour:**
- "Save Attendance" button is sticky at the bottom of the page (always visible without scrolling)
- On save: success toast — "Attendance saved for [Class Name]"
- Unsaved changes warning: if teacher navigates away with unsaved changes, show a browser-native confirm dialog or custom modal

### 6.3 Mobile — Class & Attendance UX (Priority View)

Mobile is the **primary device for Teachers during live class**. The mobile experience must be faster and more focused than desktop.

**Mobile Classes Tab (bottom nav):**
```
┌────────────────────────────────┐
│  Today's Classes               │
│  Wednesday, 11 Mar             │
├────────────────────────────────┤
│  ┌──────────────────────────┐  │
│  │ 🟢 ONGOING               │  │
│  │ Mathematics — Grade 10   │  │
│  │ 09:00 AM · Room 204      │  │
│  │ [Mark Attendance] [End]  │  │
│  └──────────────────────────┘  │
│  ┌──────────────────────────┐  │
│  │ 🔵 UPCOMING              │  │
│  │ Physics — Grade 11       │  │
│  │ 11:00 AM · Online        │  │
│  └──────────────────────────┘  │
│  ┌──────────────────────────┐  │
│  │ ✅ COMPLETED             │  │
│  │ Chemistry — Grade 10     │  │
│  │ 07:30 AM · Lab 1         │  │
│  └──────────────────────────┘  │
└────────────────────────────────┘
```

- Classes are grouped by status: Ongoing first, then Upcoming, then Completed
- Card-based layout — each class is a card, not a table row
- Touch targets: action buttons minimum 44px height, full-width on small screens
- "Ongoing" card has a **green pulsing border** to draw immediate visual attention

**Mobile Attendance Screen:**
```
┌────────────────────────────────┐
│ ← Attendance                   │
│  Mathematics · Grade 10        │
│  42 students · All Present ✓   │
├────────────────────────────────┤
│  [🔍 Search student...]        │
├────────────────────────────────┤
│  Arjun Kumar                   │
│  ● Present  ○ Absent  ○ Late   │
├────────────────────────────────┤
│  Priya Nair                    │
│  ● Present  ○ Absent  ○ Late   │
├────────────────────────────────┤
│  ...                           │
├────────────────────────────────┤
│  [    Save Attendance    ]     │  ← Sticky bottom CTA
└────────────────────────────────┘
```

- Each student row shows name + inline radio-style status selector (`Present / Absent / Late`)
- Default: all `Present` pre-selected
- Rows where status was changed from default show a subtle left-border accent
- "Save Attendance" is a **full-width sticky button** at the bottom — always reachable without scrolling
- After save: auto-navigate back to class detail, show success banner

**End Class on Mobile:**
- "End Class" button on the class card (mobile) is a **secondary button** (outlined, not filled) to prevent accidental taps
- Tap triggers a bottom sheet confirmation — not a full modal
- Bottom sheet: "End this class?", two buttons: [Cancel] [End Class (red)]

---

## 7. Data Table UX Standard

All list/management pages use a consistent table pattern.

### 7.1 Table Anatomy

```
[Search input]                    [Filter chips]    [Secondary actions]
─────────────────────────────────────────────────────────────────────
 COLUMN HEADER (sortable)   COLUMN HEADER    COLUMN HEADER   ACTIONS
─────────────────────────────────────────────────────────────────────
 Row data                   Row data         Row data        [Edit][Delete]
 Row data                   Row data         Row data        [Edit][Delete]
─────────────────────────────────────────────────────────────────────
Showing 1–10 of 42 records          Rows per page: [10 ▼]  [< Prev] [1] [Next >]
```

### 7.2 Table Rules

- **Column headers**: uppercase, `--text-xs`, `--color-text-secondary`, letter-spacing `0.05em`
- **Row hover**: `--color-brand-50` background tint
- **Row height**: 56px minimum (desktop), 64px minimum (mobile)
- **Actions column**: right-aligned, always last column
  - Edit icon: `--color-text-secondary`, hover `--color-brand-500`
  - Delete icon: `--color-text-secondary`, hover `--color-danger` — visually distinct from edit
  - Icon-only buttons must have `aria-label` and tooltip on hover
- **Destructive actions** (delete, deactivate): always require a confirmation dialog before execution — never immediate
- **Pagination**: hide Previous/Next when not applicable; disable (not hide) when at boundary

### 7.3 Empty State

Every table must define an empty state — never render an empty table shell.

```
┌─────────────────────────────────────────┐
│                                         │
│         [Illustration / Icon]           │
│                                         │
│      No departments found               │
│   Organise your courses by creating     │
│   your first department.                │
│                                         │
│      [+ Add Department]                 │
│                                         │
└─────────────────────────────────────────┘
```

- Empty state illustration: simple, on-brand SVG — not a generic sad-face
- Title: concise, context-aware ("No classes today", not "No data")
- Body: one sentence explaining what this section is for
- CTA: primary action relevant to the context

### 7.4 Loading State

Every table must define a skeleton loading state shown during data fetch:

- Render 5 skeleton rows as shimmer placeholders
- Skeleton rows match the real row height and column structure
- Use `animate-pulse` (Tailwind) on placeholder blocks
- Never show a full-page spinner for table loads — partial skeleton is less disruptive

---

## 8. Form UX Standard

### 8.1 Form Layout

- Single-column forms for simple entities (Department, Role)
- Two-column grid for dense forms (User creation, Course creation) on desktop — single column on mobile
- Labels above inputs, never placeholder-as-label
- Required field indicator: red asterisk (`*`) after label
- Helper text: `--text-xs`, `--color-text-muted`, below the input

### 8.2 Validation

- **Inline validation**: show errors on field blur, not only on submit
- Error message: `--text-xs`, `--color-danger`, with a `⚠` icon, directly below the field
- Error border: `1px solid --color-danger` on the input
- On submit with errors: scroll to first errored field, focus it

### 8.3 Destructive Form Actions

- Destructive actions (delete, deactivate, reset) must be visually separated from constructive actions
- Use `--color-danger` for destructive buttons
- Position: left side of form footer (opposite to Save/Submit)
- Always require secondary confirmation

---

## 9. Feedback & State Patterns

### 9.1 Toast Notifications

- Position: bottom-right on desktop, bottom-center on mobile
- Duration: 4 seconds auto-dismiss for success/info; persistent (manual dismiss) for errors
- Types: Success (green), Error (red), Warning (amber), Info (indigo)
- Maximum 3 toasts visible simultaneously — queue the rest

### 9.2 Confirmation Dialogs

Use for: delete, deactivate, end class, bulk actions.

- Title: action-specific ("Delete Department?", not "Are you sure?")
- Body: one sentence describing consequence ("This will remove the department and unassign all linked courses.")
- Buttons: [Cancel] (secondary) + [Confirm Action] (danger-colored, action-labeled)
- Never use browser `window.confirm()` — always use the shadcn `AlertDialog` component

### 9.3 Error States

All data-fetching components must handle the error state explicitly:

```
[Error icon]
Failed to load classes.
[Try again]
```

- Never show a blank area on API failure
- "Try again" button triggers a fresh fetch

---

## 10. Accessibility Standard

All components must meet the following minimum requirements:

- **Color contrast**: text on background minimum **4.5:1** (WCAG AA). For large text (≥18px bold): minimum **3:1**
- **Keyboard navigation**: all interactive elements reachable and operable via keyboard. Tab order must be logical
- **Focus ring**: visible focus indicator on all interactive elements — never `outline: none` without a replacement
- **Icon-only buttons**: must have `aria-label` attribute. Example: `<button aria-label="Delete department">`
- **Form fields**: every input must have an associated `<label>` (not just placeholder)
- **Status indicators**: color alone must not convey meaning — pair with text or icon (e.g. "🟢 Active", not just a green dot)
- **Touch targets**: minimum **44×44px** on all interactive elements for mobile

---

## 11. Component Checklist

Before any component is considered complete, verify:

**Design tokens**
- [ ] All colors use CSS variable tokens — no hardcoded hex values
- [ ] Typography uses defined scale classes
- [ ] Spacing follows 8px grid

**States**
- [ ] Default state
- [ ] Hover state
- [ ] Focus state (keyboard)
- [ ] Loading / skeleton state
- [ ] Empty state (for data containers)
- [ ] Error state

**Responsiveness**
- [ ] Works at 375px (mobile), 768px (tablet), 1280px (desktop)
- [ ] No horizontal scroll on any breakpoint
- [ ] Touch targets ≥ 44px on mobile

**Role-awareness**
- [ ] Hidden (not disabled) when role lacks permission
- [ ] Does not expose data belonging to another role's scope

**Accessibility**
- [ ] Color contrast ≥ 4.5:1
- [ ] Keyboard accessible
- [ ] `aria-label` on icon-only buttons
- [ ] Labels on all form inputs

---

## 12. Anti-Patterns (What Not To Do)

The following patterns are explicitly prohibited:

| Anti-Pattern | Why Prohibited |
|---|---|
| Hardcoded hex values in components | Breaks tenant theme customisation |
| Placeholder text as the only label | Inaccessible — label disappears on focus |
| Grey-out nav items the role cannot access | Shows hidden platform scope to wrong role |
| `window.confirm()` for destructive actions | Not styleable, not accessible, jarring UX |
| Empty table shell with no empty state | User has no context — looks like a bug |
| Full-page spinner for table load | Overly disruptive — use skeleton rows |
| `outline: none` without replacement focus ring | Breaks keyboard navigation accessibility |
| Static "Tenant Dashboard" in top bar title | Loses page context — must reflect current page |
| Delete icon visually identical to Edit icon | Removes visual warning for destructive action |
| Modals for long student/user lists | Constrained viewport — use full-page route or drawer |
| Showing internal slugs/IDs in tables | Technical noise for non-technical users |
| Browser `alert()` for any feedback | Not styleable, blocks thread, poor UX |

---

## 13. Design Review Gate

Before any UI screen is marked implementation-complete, it must pass this review gate:

1. **Tenant identity visible** — institution name and/or logo present in the top bar
2. **Role scope correct** — the logged-in role sees only their permitted nav items and data
3. **Empty + loading + error states** — all three defined and implemented for every data surface
4. **Destructive actions safe** — confirmation dialogs exist for all delete/end/deactivate actions
5. **Mobile view functional** — tested at 375px, bottom nav present, touch targets ≥ 44px
6. **Tenant theme respected** — brand accent tokens used throughout, no hardcoded colors
7. **Accessibility passed** — contrast checked, keyboard navigation verified, aria-labels on icon buttons
8. **Attendance flow complete** — default-all-Present behaviour, sticky Save CTA, unsaved-changes guard

---

*Document maintained by the UBOTZ Principal Engineer.*  
*Update this document before implementing any new tenant-facing UI surface.*