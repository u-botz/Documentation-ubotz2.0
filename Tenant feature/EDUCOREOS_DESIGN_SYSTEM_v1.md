# EducoreOS Design System v1.0

**Document Type**: Canonical Design System Specification  
**Status**: v1.0 — Authoritative  
**Scope**: All four visual contexts (Marketing Website, Super Admin Dashboard, Tenant Admin Dashboard, Student Panel)  
**Supersedes**: `ubotz_design_system.md`, all design token sections in Product Handbook (§2 Visual Identity, §8 Design Token Principles), Tenant Dashboard Guidelines (§2 Design System Foundation), Frontend Architecture Master (§9 Design System)  
**Applies To**: All frontend code in the EducoreOS codebase  

---

## Document Authority

This document is the **single source of truth** for all visual design decisions in EducoreOS. When any other document conflicts with this one, this document wins.

The following tokens, namespaces, and conventions from prior documents are **retired and must not be used**:

| Retired Item | Replacement |
|---|---|
| `--color-ubotz-primary`, `--color-ubotz-secondary`, `--color-ubotz-accent`, `--color-ubotz-danger`, `--color-ubotz-success` | Context-specific tokens defined in §3 |
| `Geist Sans` / `Geist Mono` font references | `Inter` / `JetBrains Mono` (§2) |
| `Cascadia Code` monospace reference | `JetBrains Mono` (§2) |
| `Plus Jakarta Sans` display font reference | `Inter` at Semi-Bold/Bold weights (§2) |
| `--font-display` / `--font-body` split | Single `--font-sans` token (§2) |
| 8px spacing grid (Tenant Dashboard Guidelines §2.4) | 4px grid (§2.4) |
| All dark mode token definitions | Deferred — light mode only (§1.3) |
| `.glass-card`, `.btn-gradient`, `.dashboard-glow` in dashboard contexts | Marketing Website context only (§3.1) |
| `bg-ubotz-primary`, `bg-ubotz-secondary` Tailwind classes | `bg-primary-*`, `bg-surface-*` (§3) |

---

## 1. Foundational Principles

### 1.1 Design Philosophy

EducoreOS follows a **"Function-First, Modern Professional"** philosophy. The platform is a cockpit, not a gallery. Users (administrators, teachers, staff, students) perform complex, data-heavy tasks for 4–6 hours per day. Every design decision must prioritise:

1. **Information density** — show data, don't hide it behind clicks
2. **Speed** — every interaction must feel instant; animations < 200ms
3. **Predictability** — standard patterns, no invented UI paradigms
4. **Accessibility** — WCAG 2.1 AA compliance, Radix UI primitives as the interaction layer

### 1.2 Architecture: Four Visual Contexts

EducoreOS has four distinct visual contexts. Each context has its own color overrides, animation rules, and component allowances, but all four share the same foundational tokens (typography, spacing, radius, semantic colors).

| Context | Audience | Palette Character | Animation Budget |
|---|---|---|---|
| **Marketing Website** | Prospective buyers (anonymous) | Deep Navy, glassmorphism, ambient glow | Rich — Framer Motion, 0.8s entrance |
| **Super Admin Dashboard** | Platform operators (Ubotz staff) | Slate, high contrast, fixed Ubotz brand | Minimal — performance-first |
| **Tenant Admin Dashboard** | Institution Owner, Teacher, Staff | Tenant-themeable brand accent, neutral base | Subtle — transitions only |
| **Student Panel** | Enrolled learners | Friendly, accessible, tenant-branded | Engagement — progress animations |

**Enforcement rule**: Components must never leak across context boundaries. A marketing-site glassmorphism card must not appear inside the tenant dashboard. Route isolation and identity prefixing enforce this at the file system level.

### 1.3 Dark Mode

Dark mode is **deferred**. All token definitions in this document are light-mode only. No dark mode CSS variables, no `.dark` class overrides, no `prefers-color-scheme` media queries.

When dark mode is implemented in a future phase, it will be scoped per-context and documented in a v2 of this design system. Until then, any code that references dark mode tokens from prior documents is a violation.

### 1.4 Implementation Stack

| Layer | Technology |
|---|---|
| Styling | Tailwind CSS v4 — `@import "tailwindcss"` + `@theme` in `globals.css` |
| Primitives | Radix UI — headless, WAI-ARIA compliant |
| Components | shadcn/ui — copy/paste, full ownership |
| Variant System | `class-variance-authority` (cva) |
| Class Merging | `cn()` utility (clsx + tailwind-merge) |
| Icons | Lucide React |
| Charts | Recharts |
| Animation (Marketing only) | Framer Motion |

**Tailwind v4 rule**: No `tailwind.config.js` or `tailwind.config.ts` exists. All theming is CSS-first via `@theme` directives. The Oxide engine handles content detection automatically.

---

## 2. Shared Foundation Tokens

These tokens apply to **all four contexts**. They are defined once in `globals.css` and never overridden per-context.

### 2.1 Typography

```css
@theme {
  --font-sans: 'Inter', system-ui, -apple-system, sans-serif;
  --font-mono: 'JetBrains Mono', ui-monospace, monospace;
}
```

**Rules**:
- `Inter` is the sole sans-serif font. Heading hierarchy is achieved through weight and size, never a second font family.
- `JetBrains Mono` is used for: code snippets, tenant IDs, invoice numbers, financial data columns, and any content where character-width alignment matters.
- Headings use `Inter` at Semi-Bold (600) or Bold (700). Body text uses Regular (400) or Medium (500).
- Inter's default tabular figures are relied upon for all numeric display. Do not override with proportional figures.
- Arabic/RTL: Inter supports Arabic glyphs natively. For Arabic page headings where Inter's Arabic rendering is insufficient, the system font stack (`system-ui`) provides the fallback.

### 2.2 Typography Scale

```css
:root {
  --text-xs:    0.75rem;    /* 12px — badges, helper text, labels */
  --text-sm:    0.875rem;   /* 14px — table rows, captions, secondary text */
  --text-base:  1rem;       /* 16px — body, form fields, inputs */
  --text-lg:    1.125rem;   /* 18px — card titles */
  --text-xl:    1.25rem;    /* 20px — section headings */
  --text-2xl:   1.5rem;     /* 24px — page headings */
  --text-3xl:   1.875rem;   /* 30px — KPI numbers, hero stats */
  --text-4xl:   2.25rem;    /* 36px — marketing hero headings only */
}
```

**Rules**:
- `--text-4xl` is reserved for the Marketing Website context. Dashboard and panel contexts must not exceed `--text-3xl`.
- Do not define custom font sizes. Every text element must map to one of these scale steps.
- Line heights: headings use 1.2–1.3, body uses 1.5–1.6, dense tables use 1.4.

### 2.3 Font Weight Hierarchy

| Weight | Token | Usage |
|---|---|---|
| 400 | `font-normal` | Body text, table cells, input values |
| 500 | `font-medium` | Labels, navigation items, form field labels |
| 600 | `font-semibold` | Card titles, section headings, button text |
| 700 | `font-bold` | Page headings, KPI values, emphasis |

### 2.4 Spacing Grid (4px Base)

All spacing uses a strict **4px grid**. Tailwind's default spacing scale aligns to this grid. Never use arbitrary pixel values.

| Token | Value | Usage |
|---|---|---|
| `space-0.5` | 2px | Micro — icon-to-label gap |
| `space-1` | 4px | Tight — badge padding, inline gaps |
| `space-2` | 8px | Compact — input padding, small gaps |
| `space-3` | 12px | Standard — card inner padding (mobile) |
| `space-4` | 16px | Default — card inner padding (desktop), section gap |
| `space-5` | 20px | Comfortable — between form groups |
| `space-6` | 24px | Section — between content sections |
| `space-8` | 32px | Large — page-level vertical spacing |
| `space-10` | 40px | XL — hero section padding |
| `space-12` | 48px | 2XL — marketing section spacing |

**Rule**: `margin: 13px`, `padding: 7px`, `gap: 15px` — these are violations. Use the nearest 4px-aligned token.

### 2.5 Border Radius

```css
@theme {
  --radius-sm:   4px;     /* chips, badges, small tags */
  --radius-md:   8px;     /* inputs, buttons, small cards */
  --radius-lg:   12px;    /* cards, modals, panels */
  --radius-xl:   16px;    /* large panels, marketing cards */
  --radius-full: 9999px;  /* avatars, pill buttons, status dots */
}
```

Default component radius is `--radius-md` (8px). Marketing Website may use `--radius-xl` for larger containers.

### 2.6 Shadows

```css
@theme {
  --shadow-sm:  0 1px 2px 0 rgba(0, 0, 0, 0.05);
  --shadow-md:  0 1px 3px 0 rgba(0, 0, 0, 0.06), 0 1px 2px -1px rgba(0, 0, 0, 0.06);
  --shadow-lg:  0 4px 6px -1px rgba(0, 0, 0, 0.07), 0 2px 4px -2px rgba(0, 0, 0, 0.05);
  --shadow-xl:  0 10px 15px -3px rgba(0, 0, 0, 0.08), 0 4px 6px -4px rgba(0, 0, 0, 0.04);
}
```

Dashboard contexts use `--shadow-sm` and `--shadow-md` only. `--shadow-lg` and `--shadow-xl` are reserved for modals, drawers, and the marketing website.

### 2.7 Semantic Status Colors (Non-Themeable)

These colors carry **functional meaning** and are **never overridden** by tenant themes, context switches, or any customisation. They are identical across all four contexts.

```css
:root {
  /* Success — confirmations, completed states, positive metrics */
  --color-success-50:   #ECFDF5;
  --color-success-100:  #D1FAE5;
  --color-success-500:  #10B981;
  --color-success-600:  #059669;
  --color-success-700:  #047857;

  /* Warning — attention needed, approaching limits, pending actions */
  --color-warning-50:   #FFFBEB;
  --color-warning-100:  #FEF3C7;
  --color-warning-500:  #F59E0B;
  --color-warning-600:  #D97706;
  --color-warning-700:  #B45309;

  /* Danger — errors, destructive actions, critical alerts */
  --color-danger-50:    #FEF2F2;
  --color-danger-100:   #FEE2E2;
  --color-danger-500:   #EF4444;
  --color-danger-600:   #DC2626;
  --color-danger-700:   #B91C1C;

  /* Info — informational notices, help text, neutral highlights */
  --color-info-50:      #EEF2FF;
  --color-info-100:     #E0E7FF;
  --color-info-500:     #6366F1;
  --color-info-600:     #4F46E5;
  --color-info-700:     #4338CA;
}
```

**Mapping to Tailwind**: These are registered as `@theme` variables so utility classes like `bg-success-500`, `text-danger-600`, `border-warning-500` work natively.

### 2.8 Neutral Palette (Shared Base)

The neutral palette is shared across all four contexts for backgrounds, borders, and text. Individual contexts may use different subsets but never redefine these values.

```css
:root {
  --color-gray-50:   #F9FAFB;
  --color-gray-100:  #F3F4F6;
  --color-gray-200:  #E5E7EB;
  --color-gray-300:  #D1D5DB;
  --color-gray-400:  #9CA3AF;
  --color-gray-500:  #6B7280;
  --color-gray-600:  #4B5563;
  --color-gray-700:  #374151;
  --color-gray-800:  #1F2937;
  --color-gray-900:  #111827;
}
```

---

## 3. Context-Specific Token Definitions

Each context defines six **themable color roles** (modeled on the Wedges architecture). These are the only colors that change between contexts.

### Themable Color Roles

| Role | Purpose | Button Usage |
|---|---|---|
| `background` | Page/viewport background | — |
| `foreground` | Default text color on `background` | — |
| `primary` | Primary actions, active states, links | Default/primary button fill |
| `secondary` | Secondary surfaces, muted backgrounds | Secondary button fill (subtle) |
| `surface` | Card/panel/container backgrounds | — |
| `destructive` | Danger actions (delete, cancel, remove) | Destructive button fill |

---

### 3.1 Marketing Website

**Philosophy**: "Calm Authority" — deep navy, enterprise-grade, trust-projecting.

```css
/* Context: Marketing Website — applied via layout root */
:root {
  /* Themable roles */
  --color-background:   #020817;   /* Deep Space Navy */
  --color-foreground:   #F8FAFC;   /* Signal White */
  --color-primary-50:   #EFF6FF;
  --color-primary-100:  #DBEAFE;
  --color-primary-500:  #3B82F6;   /* Glow Blue — CTAs */
  --color-primary-600:  #2563EB;   /* Hover */
  --color-primary-700:  #1D4ED8;
  --color-secondary-50: #F8FAFC;
  --color-secondary-100:#F1F5F9;
  --color-secondary-500:#64748B;   /* Slate — secondary text */
  --color-secondary-900:#0F172A;
  --color-surface-50:   #0F172A;   /* Dark cards on dark background */
  --color-surface-100:  #1E293B;
  --color-surface-500:  #334155;
  --color-destructive-500: #EF4444;
  --color-destructive-600: #DC2626;
}
```

**Marketing-only effects (not available in other contexts)**:
- `.glass-card` — `backdrop-filter: blur(12px)`, semi-transparent backgrounds
- `.ambient-glow` — large blurred gradient backgrounds
- `.btn-gradient` — gradient button fills for hero CTAs
- Framer Motion entrance animations (opacity + Y-axis slide, 0.8s duration, 0.1–0.2s stagger)

**Animation budget**: Rich. Framer Motion is imported only in the `(website)` route group.

### 3.2 Super Admin Dashboard

**Philosophy**: Fixed Ubotz brand. High contrast. Performance-first. This is the platform operator's cockpit.

```css
/* Context: Super Admin Dashboard */
:root {
  --color-background:   #F9FAFB;   /* Gray 50 */
  --color-foreground:   #111827;   /* Gray 900 */
  --color-primary-50:   #EFF6FF;
  --color-primary-100:  #DBEAFE;
  --color-primary-500:  #3B82F6;   /* Blue 500 — fixed, not tenant-themeable */
  --color-primary-600:  #2563EB;
  --color-primary-700:  #1D4ED8;
  --color-secondary-50: #F9FAFB;
  --color-secondary-100:#F3F4F6;
  --color-secondary-500:#6B7280;
  --color-secondary-900:#111827;
  --color-surface-50:   #FFFFFF;
  --color-surface-100:  #F9FAFB;
  --color-surface-500:  #F3F4F6;
  --color-destructive-500: #EF4444;
  --color-destructive-600: #DC2626;
}
```

**Super Admin specifics**:
- Sidebar background: `--color-gray-900` (#111827) — always dark, always Ubotz-branded
- Primary color is **fixed Blue 500** — never changes. There is no tenant theme in this context.
- No glassmorphism, no gradients, no ambient glow.

**Animation budget**: Minimal. CSS transitions only, max 150ms. No JavaScript animation libraries.

### 3.3 Tenant Admin Dashboard

**Philosophy**: Tenant-themeable accent, neutral-first base. The institution's brand is expressed through the `primary` color family.

```css
/* Context: Tenant Admin Dashboard — default values, overridden per-tenant */
:root {
  --color-background:   #F9FAFB;   /* Gray 50 */
  --color-foreground:   #111827;   /* Gray 900 */
  --color-primary-50:   #EFF6FF;
  --color-primary-100:  #DBEAFE;
  --color-primary-500:  #3B82F6;   /* Default Blue — tenant overrides this */
  --color-primary-600:  #2563EB;
  --color-primary-700:  #1D4ED8;
  --color-primary-900:  #1E3A8A;   /* Sidebar background */
  --color-secondary-50: #F9FAFB;
  --color-secondary-100:#F3F4F6;
  --color-secondary-500:#6B7280;
  --color-secondary-900:#111827;
  --color-surface-50:   #FFFFFF;
  --color-surface-100:  #F9FAFB;
  --color-surface-500:  #F3F4F6;
  --color-destructive-500: #EF4444;
  --color-destructive-600: #DC2626;
}
```

**Tenant theme override mechanism**:
```css
/* Injected at SSR time via <style> tag on the tenant layout root */
[data-tenant="tenant-slug"] {
  --color-primary-50:   /* computed from owner's chosen hex */;
  --color-primary-100:  /* computed */;
  --color-primary-500:  /* owner-chosen primary */;
  --color-primary-600:  /* auto-darkened by 10% */;
  --color-primary-700:  /* auto-darkened by 20% */;
  --color-primary-900:  /* auto-darkened by 40% — sidebar */;
}
```

**Tenant theming rules**:
- Only the `--color-primary-*` family is tenant-overridable.
- Semantic colors (success, warning, danger, info) are **never overridden**.
- Neutral palette (gray-*) is **never overridden**.
- `--color-secondary-*`, `--color-surface-*`, `--color-destructive-*` are **never overridden**.
- WCAG AA contrast (4.5:1) is validated before saving a custom color. The system warns and suggests the nearest accessible shade if validation fails. It never silently saves a failing color.
- Tenant slugs used in the `[data-tenant="..."]` CSS selector must contain only `[a-z0-9-]`. This is enforced at tenant creation and must not be bypassed.

**Animation budget**: Subtle. CSS transitions (150–200ms) for hover states, focus rings, and sidebar expansion. No Framer Motion.

### 3.4 Student Panel

**Philosophy**: Friendly, accessible, encouraging. Tenant-branded like the Admin Dashboard, but optimised for learners who interact for shorter bursts focused on content consumption.

```css
/* Context: Student Panel — inherits tenant theme from Tenant Admin */
:root {
  --color-background:   #FFFFFF;   /* White — cleaner reading surface */
  --color-foreground:   #111827;   /* Gray 900 */
  --color-primary-50:   /* inherited from tenant theme */;
  --color-primary-500:  /* inherited from tenant theme */;
  --color-primary-600:  /* inherited from tenant theme */;
  --color-secondary-50: #F9FAFB;
  --color-secondary-100:#F3F4F6;
  --color-secondary-500:#6B7280;
  --color-secondary-900:#111827;
  --color-surface-50:   #FFFFFF;
  --color-surface-100:  #F9FAFB;
  --color-surface-500:  #F3F4F6;
  --color-destructive-500: #EF4444;
  --color-destructive-600: #DC2626;
}
```

**Student Panel specifics**:
- Background is pure white (`#FFFFFF`), not gray-50. Cleaner reading surface for course content.
- Primary color is inherited from the tenant's theme — the student sees the institution's brand.
- Progress indicators use `--color-success-500` (never the brand color) to maintain semantic clarity.
- Achievement/gamification elements may use `--color-warning-500` (amber) for badges and milestones.

**Animation budget**: Engagement. CSS transitions for interactive elements (200ms), progress bar animations (300ms ease-out), subtle celebration animations for quiz completion and course milestones. No Framer Motion; CSS `@keyframes` only.

---

## 4. Tailwind v4 `globals.css` Reference Implementation

This is the canonical `globals.css` structure. All tokens defined above are registered here.

```css
/* app/globals.css */
@import "tailwindcss";

/* ═══════════════════════════════════════════════════════════ */
/* THEME VARIABLES — registered with Tailwind v4              */
/* ═══════════════════════════════════════════════════════════ */

@theme {
  /* Typography */
  --font-sans: 'Inter', system-ui, -apple-system, sans-serif;
  --font-mono: 'JetBrains Mono', ui-monospace, monospace;

  /* Radius */
  --radius-sm:   4px;
  --radius-md:   8px;
  --radius-lg:   12px;
  --radius-xl:   16px;
  --radius-full: 9999px;

  /* Shadows */
  --shadow-sm:  0 1px 2px 0 rgba(0, 0, 0, 0.05);
  --shadow-md:  0 1px 3px 0 rgba(0, 0, 0, 0.06), 0 1px 2px -1px rgba(0, 0, 0, 0.06);
  --shadow-lg:  0 4px 6px -1px rgba(0, 0, 0, 0.07), 0 2px 4px -2px rgba(0, 0, 0, 0.05);
  --shadow-xl:  0 10px 15px -3px rgba(0, 0, 0, 0.08), 0 4px 6px -4px rgba(0, 0, 0, 0.04);

  /* Semantic Status Colors — NEVER tenant-overridable */
  --color-success-50:   #ECFDF5;
  --color-success-100:  #D1FAE5;
  --color-success-500:  #10B981;
  --color-success-600:  #059669;
  --color-success-700:  #047857;

  --color-warning-50:   #FFFBEB;
  --color-warning-100:  #FEF3C7;
  --color-warning-500:  #F59E0B;
  --color-warning-600:  #D97706;
  --color-warning-700:  #B45309;

  --color-danger-50:    #FEF2F2;
  --color-danger-100:   #FEE2E2;
  --color-danger-500:   #EF4444;
  --color-danger-600:   #DC2626;
  --color-danger-700:   #B91C1C;

  --color-info-50:      #EEF2FF;
  --color-info-100:     #E0E7FF;
  --color-info-500:     #6366F1;
  --color-info-600:     #4F46E5;
  --color-info-700:     #4338CA;

  /* Neutral Palette */
  --color-gray-50:   #F9FAFB;
  --color-gray-100:  #F3F4F6;
  --color-gray-200:  #E5E7EB;
  --color-gray-300:  #D1D5DB;
  --color-gray-400:  #9CA3AF;
  --color-gray-500:  #6B7280;
  --color-gray-600:  #4B5563;
  --color-gray-700:  #374151;
  --color-gray-800:  #1F2937;
  --color-gray-900:  #111827;

  /* Themable Role Colors — defaults (Tenant Admin / Super Admin) */
  --color-background:       #F9FAFB;
  --color-foreground:       #111827;

  --color-primary-50:       #EFF6FF;
  --color-primary-100:      #DBEAFE;
  --color-primary-500:      #3B82F6;
  --color-primary-600:      #2563EB;
  --color-primary-700:      #1D4ED8;
  --color-primary-900:      #1E3A8A;

  --color-secondary-50:     #F9FAFB;
  --color-secondary-100:    #F3F4F6;
  --color-secondary-500:    #6B7280;
  --color-secondary-900:    #111827;

  --color-surface-50:       #FFFFFF;
  --color-surface-100:      #F9FAFB;
  --color-surface-500:      #F3F4F6;

  --color-destructive-500:  #EF4444;
  --color-destructive-600:  #DC2626;
}

/* ═══════════════════════════════════════════════════════════ */
/* SEMANTIC ALIASES — regular CSS variables (no utility gen)  */
/* ═══════════════════════════════════════════════════════════ */

:root {
  --color-border:          var(--color-gray-200);
  --color-text-primary:    var(--color-foreground);
  --color-text-secondary:  var(--color-gray-500);
  --color-text-muted:      var(--color-gray-400);
}
```

**Context overrides** are applied via layout-level CSS files scoped to each route group:

- `(website)/globals-marketing.css` — overrides `--color-background`, `--color-foreground`, `--color-surface-*` to dark navy palette
- `(super-admin-dashboard)/globals-superadmin.css` — no overrides needed (defaults match)
- `(tenant-admin-dashboard)/globals-tenant.css` — tenant theme injection via `[data-tenant]` selector
- `(student-panel)/globals-panel.css` — overrides `--color-background` to `#FFFFFF`

---

## 5. Component Color Mapping

### 5.1 Button Variants

All button variants reference the themable role tokens, never hardcoded hex values.

| Variant | Background | Text | Border | Hover Background |
|---|---|---|---|---|
| `default` (Primary) | `--color-primary-500` | `#FFFFFF` | none | `--color-primary-600` |
| `secondary` | `--color-secondary-100` | `--color-secondary-900` | none | `--color-secondary-50` |
| `outline` | transparent | `--color-foreground` | `--color-gray-300` | `--color-gray-100` |
| `ghost` | transparent | `--color-foreground` | none | `--color-gray-100` |
| `destructive` | `--color-destructive-500` | `#FFFFFF` | none | `--color-destructive-600` |
| `link` | transparent | `--color-primary-500` | none | underline |

**Button hierarchy rule**: A page must never show two `default` (primary) buttons side by side. The intended action uses `default`; the alternative uses `secondary`, `outline`, or `ghost`. Destructive actions use `destructive`, positioned left of (opposite to) constructive actions.

**Button sizes**:

| Size | Height | Padding (horizontal) | Font Size |
|---|---|---|---|
| `sm` | 36px (9 × 4px grid) | 12px | `--text-sm` (14px) |
| `default` | 40px (10 × 4px grid) | 16px | `--text-sm` (14px) |
| `lg` | 44px (11 × 4px grid) | 24px | `--text-base` (16px) |
| `icon` | 40px × 40px | — | — |

All sizes align to the 4px grid. Touch targets meet the 44px minimum (mobile uses `lg`).

### 5.2 Badge / Status Variants

| Variant | Background | Text | Usage |
|---|---|---|---|
| `default` | `--color-primary-50` | `--color-primary-700` | Tenant-branded labels |
| `success` | `--color-success-50` | `--color-success-700` | Active, Completed, Paid |
| `warning` | `--color-warning-50` | `--color-warning-700` | Pending, Approaching limit |
| `danger` | `--color-danger-50` | `--color-danger-700` | Failed, Expired, Overdue |
| `info` | `--color-info-50` | `--color-info-700` | Scheduled, Informational |
| `neutral` | `--color-gray-100` | `--color-gray-700` | Completed (past), Inactive |

All badges use `--radius-full` (pill shape).

### 5.3 Card (SectionCard)

| Property | Token |
|---|---|
| Background | `--color-surface-50` (#FFFFFF) |
| Border | `1px solid var(--color-border)` |
| Border radius | `--radius-lg` (12px) |
| Box shadow | `--shadow-md` |
| Padding | `24px` desktop, `16px` mobile |

### 5.4 Input

| Property | Token |
|---|---|
| Height | 40px (`default`), 36px (`sm`) |
| Background | `--color-surface-50` |
| Border | `1px solid var(--color-gray-300)` |
| Border (focus) | `2px solid var(--color-primary-500)` |
| Border (error) | `1px solid var(--color-danger-500)` |
| Border radius | `--radius-md` (8px) |
| Text | `var(--color-foreground)` |
| Placeholder | `var(--color-text-muted)` |

### 5.5 Alert Variants

| Variant | Background | Border-left | Icon Color |
|---|---|---|---|
| `info` | `--color-info-50` | `--color-info-500` | `--color-info-600` |
| `success` | `--color-success-50` | `--color-success-500` | `--color-success-600` |
| `warning` | `--color-warning-50` | `--color-warning-500` | `--color-warning-600` |
| `danger` | `--color-danger-50` | `--color-danger-500` | `--color-danger-600` |

All alerts use a 4px left border accent. Background uses the `-50` tint for subtlety.

### 5.6 Sidebar (Tenant Admin Dashboard)

| Element | Token |
|---|---|
| Background | `--color-primary-900` |
| Active item background | `--color-primary-50` at 10% opacity |
| Active item left border | `4px solid var(--color-primary-500)` |
| Active item text | `#FFFFFF` |
| Inactive item text | `--color-gray-400` (lightened for dark bg contrast) |
| Section group labels | `--text-xs`, uppercase, `--color-gray-400` |
| Width | 240px (desktop), 64px icon-rail (collapsed), hidden (mobile) |

### 5.7 Toast Notifications

| Type | Left Accent | Icon Color |
|---|---|---|
| Success | `--color-success-500` | `--color-success-600` |
| Error | `--color-danger-500` | `--color-danger-600` |
| Warning | `--color-warning-500` | `--color-warning-600` |
| Info | `--color-info-500` | `--color-info-600` |

---

## 6. Component State Requirements

Every interactive component must implement all applicable states. This checklist is a quality gate.

### 6.1 Required States

| State | Requirement |
|---|---|
| Default | Base appearance with all tokens applied |
| Hover | Visual feedback within 50ms. Color shift or background tint. |
| Focus | Visible focus ring — `2px solid var(--color-primary-500)`, `2px offset`. Never `outline: none` without replacement. |
| Active / Pressed | Subtle scale-down or darkened background |
| Disabled | `opacity: 0.5`, `cursor: not-allowed`. Never hide — reduce visual weight. |
| Loading | Skeleton shimmer (`animate-pulse`) for data containers. Spinner for buttons. |
| Empty | Illustration + contextual message + CTA. Never render an empty table shell. |
| Error | `--color-danger-*` border/text. Inline message below the element. |

### 6.2 Data Container States

Tables, lists, and any data-fetching component must handle:
- **Loading**: 5 skeleton rows matching column structure. `animate-pulse`. No full-page spinners.
- **Empty**: SVG illustration + "No [items] found" + primary CTA.
- **Error**: Error icon + "Failed to load [resource]" + "Try again" button.

---

## 7. Interaction Patterns

### 7.1 Feedback

| Pattern | Implementation | Duration |
|---|---|---|
| Toast (success) | Bottom-right (desktop), bottom-center (mobile) | 4s auto-dismiss |
| Toast (error) | Same position | Persistent — manual dismiss |
| Optimistic update | UI updates immediately, rollback on server error | Instant |
| Loading skeleton | Shimmer placeholders matching content layout | Until data arrives |

Maximum 3 toasts visible simultaneously. Queue the rest.

### 7.2 Modals vs Drawers vs Pages

| Content Type | Pattern |
|---|---|
| Confirmations (delete, deactivate) | Small Modal (shadcn `AlertDialog`) |
| Secondary actions (edit profile, filters) | Slide-over Drawer (right-to-left, 80% width on mobile) |
| Primary creation flows (create course, create user) | Full Page route |
| Long lists (students, attendance) | Full Page route — never a modal |

**Never use** `window.confirm()` or `window.alert()`. Never use blocking alert dialogs for success feedback.

### 7.3 Destructive Actions

- Always require secondary confirmation via `AlertDialog`
- Confirmation title must be action-specific: "Delete Department?", not "Are you sure?"
- Confirmation body: one sentence describing consequence
- Buttons: [Cancel] (secondary) + [Confirm Action] (destructive, action-labeled)
- Destructive buttons positioned left, opposite to constructive buttons

---

## 8. Accessibility Requirements

Target: **WCAG 2.1 Level AA**

| Requirement | Standard |
|---|---|
| Color contrast (text on bg) | ≥ 4.5:1 (AA). Large text ≥ 18px bold: ≥ 3:1 |
| Keyboard navigation | All interactive elements reachable via Tab, operable via Space/Enter |
| Focus ring | Visible on all interactive elements. Never remove without replacement. |
| Icon-only buttons | Must have `aria-label`. Example: `<button aria-label="Delete department">` |
| Form fields | Every input must have an associated `<label>`. Placeholder is not a substitute. |
| Status indicators | Color alone must not convey meaning. Pair with text or icon. |
| Touch targets | Minimum 44×44px on all interactive elements |
| Semantic HTML | `<button>` for actions, `<a>` for navigation. Heading hierarchy (`h1` → `h2` → `h3`) without skipping levels. |
| ARIA states | Toggle buttons report `aria-pressed`. Expandable sections use `aria-expanded`. |
| SVG icons | `aria-hidden="true"` if decorative. Descriptive `aria-label` if functional. |

---

## 9. Responsive Breakpoints

| Breakpoint | Width | Layout Behaviour |
|---|---|---|
| Mobile | < 768px | Single column. Bottom nav (5 tabs max). Hamburger drawer for secondary nav. Sidebar hidden. |
| Tablet | 768px – 1023px | Sidebar collapsed to 64px icon-rail. Main content full width. No bottom nav. |
| Desktop | ≥ 1024px | Sidebar 240px fixed. Three-zone layout (topbar + sidebar + content). |

**Mobile specifics**:
- Bottom nav centre tab is a FAB for the role's primary action
- Touch targets ≥ 44px
- Card padding reduces from 24px to 16px
- Dense tables simplify to card views

---

## 10. Anti-Patterns (Explicit Prohibitions)

| Violation | Why |
|---|---|
| Hardcoded hex values in components | Breaks tenant theming and future dark mode |
| `bg-red-500` instead of `bg-danger-500` | Semantic naming required for maintainability |
| Placeholder text as the only label | Inaccessible — label disappears on focus |
| Grey-out nav items the role cannot access | Shows hidden platform scope — hide entirely |
| `window.confirm()` or `window.alert()` | Not styleable, not accessible, blocks thread |
| Empty table with no empty state | Looks like a bug |
| Full-page spinner for table load | Overly disruptive — use skeleton rows |
| `outline: none` without replacement focus ring | Breaks keyboard navigation |
| Static "Tenant Dashboard" in top bar | Must reflect current page title |
| Delete icon visually identical to Edit icon | Removes visual warning for destructive action |
| Modals for long lists (50+ items) | Constrained viewport — use full-page route |
| Internal slugs/IDs in user-facing tables | Technical noise for non-technical users |
| `backdrop-filter: blur()` in dashboard contexts | Performance impact on low-end devices |
| Two primary buttons side by side | Violates visual hierarchy — use primary + secondary/ghost |
| Importing Framer Motion outside `(website)` route group | Performance regression in dashboard contexts |
| Using `--color-ubotz-*` tokens anywhere | Retired namespace — use `--color-primary-*` etc. |

---

## 11. Component Completion Checklist

Before any component is marked implementation-complete:

**Tokens**
- [ ] All colors reference CSS variable tokens — zero hardcoded hex
- [ ] Typography uses the defined scale classes
- [ ] Spacing aligns to the 4px grid
- [ ] Border radius uses `--radius-*` tokens

**States**
- [ ] Default, Hover, Focus, Loading/Skeleton, Empty (data containers), Error

**Responsiveness**
- [ ] Works at 375px (mobile), 768px (tablet), 1280px (desktop)
- [ ] No horizontal scroll on any breakpoint
- [ ] Touch targets ≥ 44px on mobile

**Role-awareness**
- [ ] Hidden (not disabled) when role lacks capability
- [ ] Does not expose data belonging to another role's scope

**Accessibility**
- [ ] Color contrast ≥ 4.5:1
- [ ] Keyboard accessible (Tab + Space/Enter)
- [ ] `aria-label` on icon-only buttons
- [ ] `<label>` on all form inputs
- [ ] Status indicators use text/icon, not color alone

---

## 12. Migration Checklist

For Antigravity to bring the existing codebase into compliance with this document:

1. **`globals.css`**: Replace current `@theme` block with §4 reference implementation. Remove all `--color-ubotz-*` variables. Remove `Cascadia Code` and `Geist` font references. Remove all dark mode token definitions.

2. **Font loading**: Update `next/font` imports to load `Inter` (variable, weight 400–700) and `JetBrains Mono` (variable, weight 400–700). Remove any `Plus Jakarta Sans`, `Geist Sans`, or `Geist Mono` imports.

3. **Button component** (`shared/ui/Button.tsx`): Replace `bg-ubotz-primary` with `bg-primary-500`. Replace `bg-ubotz-secondary` with `bg-secondary-100`. Replace `bg-ubotz-danger` with `bg-destructive-500`. Remove any variant referencing `--color-ubotz-*`.

4. **Badge component**: Replace `bg-ubotz-*` references with semantic badge variants from §5.2.

5. **Alert component**: Replace hardcoded `bg-blue-50`, `bg-emerald-50`, `bg-amber-50` with `bg-info-50`, `bg-success-50`, `bg-warning-50`.

6. **Marketing components**: Scope `.glass-card`, `.btn-gradient`, `.dashboard-glow` classes to files inside the `(website)` route group only. Remove from shared component layer.

7. **Input component**: Replace `focus-visible:ring-ubotz-primary` with `focus-visible:ring-primary-500`.

8. **Search and replace**: Global find `ubotz-primary` → `primary-500`, `ubotz-secondary` → `secondary-100`, `ubotz-accent` → remove (no replacement — accent is retired), `ubotz-danger` → `destructive-500`, `ubotz-success` → `success-500`.

---

## Appendix A: Decision Log

| # | Decision | Options Considered | Chosen | Rationale |
|---|---|---|---|---|
| DS-01 | Integration model | Wedges npm package (v3) vs reference model (v4 native) | Reference model, Tailwind v4 native | Wedges requires TW v3; platform is on TW v4. No npm dependency. |
| DS-02 | Font stack | Inter+PJS+JBM / Geist+GeistMono / Inter+JBM | Inter + JetBrains Mono | Arabic support, tabular figures by default, two families = minimal ambiguity |
| DS-03 | Spacing grid | 4px vs 8px | 4px | Finer control, matches Product Handbook, matches Wedges Figma system |
| DS-04 | Dark mode | Now (all), Now (scoped), Deferred | Deferred | Ship light mode only; prevents inconsistent dark mode implementations |
| DS-05 | Document scope | Single context vs all four | All four visual contexts | Eliminates cross-document conflicts; one authoritative source |

---

## Appendix B: Token Quick Reference

**When to use which color token:**

| I need to style... | Use this token |
|---|---|
| A primary action button | `bg-primary-500`, hover: `bg-primary-600` |
| A secondary/cancel button | `bg-secondary-100`, text: `text-secondary-900` |
| A delete/remove button | `bg-destructive-500`, hover: `bg-destructive-600` |
| A card background | `bg-surface-50` |
| Page background | `bg-background` |
| Body text | `text-foreground` |
| Secondary/label text | `text-gray-500` |
| Muted/placeholder text | `text-gray-400` |
| A border | `border-gray-200` |
| A success badge | `bg-success-50`, text: `text-success-700` |
| A warning alert | `bg-warning-50`, border-left: `border-warning-500` |
| An error message | `text-danger-600` |
| An info tooltip background | `bg-info-50` |
| A sidebar background (tenant) | `bg-primary-900` |
| A sidebar background (super admin) | `bg-gray-900` |
| Code/ID text | `font-mono` |
| KPI number | `font-mono`, `text-3xl`, `font-bold` |
