# UBOTZ 2.0 — Phase AR1 Developer Instructions

## Arabic RTL UI — Bilingual Support (Tenant Admin Dashboard + Student Portal)

| Field | Value |
|---|---|
| **Document Type** | Developer Instruction (Pre-Implementation Brief) |
| **Phase** | AR1 |
| **Date** | March 2026 |
| **Issued By** | Principal Engineer / Architecture Auditor |
| **Audience** | Implementation Developer (Antigravity) |
| **Expected Deliverable** | Phase AR1 Implementation Plan (same format as prior phase plans) |
| **Prerequisites** | Phase G1 COMPLETE (GCC tenant model + `CAP_RTL_UI` capability infrastructure) · Phase G4 COMPLETE (timezone-aware scheduling — datetime display must be localised before RTL is layered on top) · All Tenant Admin Dashboard features through Phase 20B COMPLETE · Student Portal (Panel) through Phase 19C COMPLETE |

> **Arabic RTL is the most architecturally pervasive frontend change in the platform's history. It is not a translation task. It is not a CSS tweak. It is a systematic inversion of every spatial assumption built into the UI — layout direction, icon mirroring, animation direction, scroll behaviour, form field alignment, and third-party component configuration — applied simultaneously to two portals across hundreds of components. One component missed, one Tailwind class that uses `left`/`right` instead of `start`/`end`, one third-party library left without an RTL config — and the result is a broken, unprofessional interface that will disqualify Ubotz from GCC deals on first demo. Treat this phase with the same rigour as a financial feature.**

---

## 1. Mission Statement

Phase AR1 introduces full bilingual (English / Arabic) support with proper RTL layout to the **Tenant Admin Dashboard** and the **Student Portal (Panel)**. The Super Admin Dashboard and public landing pages are explicitly out of scope for this phase.

Any tenant with the `CAP_RTL_UI` capability on their subscription plan can enable Arabic. The Tenant Admin configures the portal's default language. Each user can personally override the language for their session. Language preference persists in the user's profile. Switching language requires a page reload.

All UI strings are fully translated to Arabic. Translations ship as a machine-translated first pass and are human-reviewed before GCC market launch. Developers mark strings using the i18n library — they do not provide translations.

**The four deliverables of this phase:**

```
1. I18N INFRASTRUCTURE   — next-intl installed, locale routing, translation
                           file structure, language context, reload-on-switch

2. RTL LAYOUT ENGINE     — Tailwind CSS logical properties enforced,
                           dir="rtl" on html element, per-portal CSS layer

3. COMPONENT AUDIT       — Every component in both portals audited and
                           fixed for RTL correctness

4. THIRD-PARTY RTL       — FullCalendar, rich text editor, charts,
                           PDF generation, data tables each explicitly
                           configured for RTL
```

**What this phase does NOT include:**

- Super Admin Dashboard Arabic support (deferred)
- Public landing page Arabic support (deferred)
- Hijri (Islamic) calendar — deferred, separate phase
- Arabic numeral system (Eastern Arabic-Indic digits) — uses Western digits throughout
- Per-student language preference persisted to backend (persisted to localStorage only in AR1; backend sync deferred)
- Arabic email notification templates (deferred — Phase 14 templates remain English)
- Arabic PDF certificates — RTL PDF is a separate sub-phase (AR1-PDF)
- Arabic SEO meta tags on public pages (out of scope)
- Machine translation engine or translation management system — static JSON files only
- Tenant-provided custom translation overrides

---

## 2. Business Context

### 2.1 Who Gets Arabic

Arabic RTL is gated by the `CAP_RTL_UI` capability. This capability is assigned to subscription plans that target the GCC market. Any tenant whose plan includes `CAP_RTL_UI` sees the language toggle in their portal. Tenants without `CAP_RTL_UI` see English only — no language toggle is shown, no Arabic routes are accessible.

The capability check happens at:
1. **Backend**: `EnforceTenantCapability` middleware on any API endpoint that returns language/locale settings
2. **Frontend**: Capability-driven navigation rendering hides the language toggle for non-entitled tenants
3. **Middleware**: Next.js middleware checks the locale prefix against the tenant's capability before serving the page

### 2.2 Language Scope

| Portal | In Scope | Default Language Source |
|---|---|---|
| Tenant Admin Dashboard | ✅ Full bilingual | Tenant Admin configures default in Settings → Language |
| Student Portal (Panel) | ✅ Full bilingual | Inherits tenant default; student can override per-session |
| Super Admin Dashboard | ❌ Out of scope | English only, always |
| Public Landing Pages | ❌ Out of scope | English only in AR1 |

### 2.3 Language Switching Model

- Language preference is stored in: `localStorage` (student, per-device) and tenant user profile API (`users.locale` column — new column, see §5)
- Switching language triggers a full page reload. The new locale is read from the stored preference on reload.
- The URL does NOT encode the locale (no `/ar/tenant-admin-dashboard` prefix). Locale is resolved from user preference, not URL.
- Rationale: URL-based locale routing requires every internal link, redirect, and API endpoint to be locale-aware. Preference-based routing is simpler, sufficient for a B2B SaaS where users do not share URLs expecting a specific language.

---

## 3. Business Rules (NON-NEGOTIABLE)

### 3.1 Capability and Entitlement Rules

| Rule ID | Rule | Detail |
|---|---|---|
| BR-01 | The language toggle UI element (switcher button/dropdown) is rendered ONLY if the tenant has `CAP_RTL_UI`. | Capability check in the layout component using the existing capability-driven rendering pattern. Non-entitled tenants see no language option — not a disabled button, not a locked state. Hidden entirely. |
| BR-02 | If a tenant loses `CAP_RTL_UI` (plan downgrade), users who had Arabic set as their preference fall back to English on next login. | Frontend reads capability on app load. If `CAP_RTL_UI` absent, override stored preference to `en` for that session. Do not delete the stored preference — if they regain the capability, Arabic resumes. |
| BR-03 | The Tenant Admin can set the portal default language in Settings → Language. This default applies to all users of that tenant who have not personally set a preference. | Stored as `tenant_locale_settings.default_locale` — new table, see §5. |

### 3.2 Translation Completeness Rules

| Rule ID | Rule | Detail |
|---|---|---|
| BR-04 | Every user-visible string in both portals must be extracted into translation files. Hard-coded strings in JSX are a blocking quality gate failure. | Use `next-intl`'s `useTranslations()` hook for Client Components and `getTranslations()` for Server Components. Zero raw string literals in JSX. |
| BR-05 | If a translation key is missing in the Arabic file, the English fallback is shown — never an empty string, never a key identifier like `[common.save]`. | Configure `next-intl` with `onError: 'ignore'` and English as the fallback locale. |
| BR-06 | Translations ship as a machine-translated first pass. The translation JSON files are committed to the repository. Human review happens before GCC launch — this is a product team responsibility, not a developer responsibility. | Developers mark strings only. The machine-translated JSON is a placeholder. Developers must NOT manually write Arabic translations. |
| BR-07 | Dynamic content (user-entered data: course names, quiz questions, student names, CRM lead notes) is NOT translated. It renders as-is in whatever language the user entered it. | The i18n layer translates UI chrome only — labels, buttons, navigation, error messages, empty states, confirmation dialogs. |
| BR-08 | Numbers, dates, and currency amounts use Western (Latin) digits throughout — `١٢٣` Eastern Arabic-Indic digits are NOT used. | Explicitly configure `Intl.NumberFormat` and `Intl.DateTimeFormat` with `numberingSystem: 'latn'` when formatting for Arabic locale. |

### 3.3 RTL Layout Rules

| Rule ID | Rule | Detail |
|---|---|---|
| BR-09 | When Arabic is active, `<html dir="rtl" lang="ar">` is set. When English is active, `<html dir="ltr" lang="en">`. | Set in the root layout via Next.js `generateMetadata` or directly in the layout component. The `dir` attribute on `<html>` is the single source of RTL truth — all CSS logical properties derive from it. |
| BR-10 | All layout spacing and positioning must use Tailwind CSS **logical properties** exclusively: `ms-*`, `me-*`, `ps-*`, `pe-*`, `start-*`, `end-*`, `rounded-s-*`, `rounded-e-*`. Physical properties `ml-*`, `mr-*`, `pl-*`, `pr-*`, `left-*`, `right-*`, `rounded-l-*`, `rounded-r-*` are BANNED in all components touched by AR1. | A grep gate is enforced at audit: `grep -rn 'ml-\|mr-\|pl-\|pr-\| left-\| right-\|rounded-l-\|rounded-r-' features/tenant-admin/ features/panel/` must return zero results in AR1-touched files. |
| BR-11 | Icons that are directionally meaningful must be mirrored in RTL. Icons that are not directional must NOT be mirrored. | Directional icons (arrows, chevrons, back/forward, send, navigation indicators) get `rtl:scale-x-[-1]` Tailwind class. Non-directional icons (settings gear, user avatar, bell, checkmark, close X) must NOT be mirrored. A reference list of mirrored vs non-mirrored icons is in §7. |
| BR-12 | Animations and transitions that move in a horizontal direction must reverse in RTL. Slide-in from left in LTR becomes slide-in from right in RTL. | Use CSS logical properties in keyframe animations or detect `dir` in Framer Motion variants. |
| BR-13 | The sidebar navigation collapses and expands from the correct side in RTL. In LTR it is on the left. In RTL it must be on the right. | The sidebar is a layout-level component. Its `position`, `transform`, and `transition` must use logical properties or RTL-specific overrides. |
| BR-14 | Text alignment defaults to `text-start` (not `text-left`). Explicit `text-center` is acceptable where centred text is intentional. `text-left` and `text-right` are banned in RTL-affected components. | Same grep gate as BR-10. |

### 3.4 Font Rules

| Rule ID | Rule | Detail |
|---|---|---|
| BR-15 | The Arabic typeface is **Cairo** (Google Fonts). The existing English typeface is **Geist Sans** (as per Frontend Architecture Master). | Load both fonts. Apply Cairo when `lang="ar"`, Geist Sans when `lang="en"`. Use CSS font-family with `lang` attribute selector: `html[lang="ar"] { font-family: 'Cairo', sans-serif; }` |
| BR-16 | Cairo is loaded via `next/font/google` — not via a `<link>` tag in `<head>`. | Avoids FOUT (Flash of Unstyled Text) and respects Next.js font optimisation pipeline. |
| BR-17 | Font weight mapping: Cairo `400` = Regular body text, Cairo `500` = Medium (labels, nav items), Cairo `600` = SemiBold (headings, card titles), Cairo `700` = Bold (page titles, emphasis). | Match the existing Geist Sans weight usage to maintain visual hierarchy parity between languages. |
| BR-18 | Line height for Arabic text must be increased. Arabic script with diacritics is taller than Latin script. Apply `leading-relaxed` (1.625) for Arabic body text vs `leading-normal` (1.5) for English. | Add to the `html[lang="ar"]` global CSS rule. |

### 3.5 Language Persistence Rules

| Rule ID | Rule | Detail |
|---|---|---|
| BR-19 | User language preference is stored in: (1) `localStorage` key `ubotz_locale` for immediate read on next load, and (2) `users.locale` column via API call after preference change. | Both storage locations must be written on language switch. localStorage is read first (fast); API sync is fire-and-forget. |
| BR-20 | On app load, locale resolution order: (1) user's profile `locale` from API (authoritative), (2) `localStorage` fallback (if API not yet loaded), (3) tenant default locale, (4) `'en'` (hard fallback). | The locale is resolved in the root layout before any page content renders. |
| BR-21 | After the user clicks the language switcher and confirms, write to localStorage immediately, call the profile update API (fire-and-forget), then trigger `window.location.reload()`. | The reload reads the new localStorage value and renders the new locale instantly. |

---

## 4. I18N Infrastructure

### 4.1 Library

**`next-intl`** is the chosen i18n library. It integrates natively with Next.js App Router, supports both Server Components and Client Components, has no runtime overhead for unused locales, and handles RTL-aware pluralisation rules for Arabic (Arabic has six plural forms — `next-intl` via ICU message format handles this correctly).

Do NOT use `react-i18next`, `i18next`, or `next-translate`. These libraries require additional bridging to work correctly with Next.js App Router Server Components.

### 4.2 Supported Locales

```typescript
// config/i18n.ts
export const locales = ['en', 'ar'] as const;
export type Locale = typeof locales[number];
export const defaultLocale: Locale = 'en';
export const rtlLocales: Locale[] = ['ar'];

export function isRtl(locale: Locale): boolean {
  return rtlLocales.includes(locale);
}
```

### 4.3 Translation File Structure

```
messages/
├── en/
│   ├── common.json          # Shared: buttons, labels, errors, confirmations
│   ├── auth.json            # Login, logout, password reset
│   ├── tenant-admin/
│   │   ├── navigation.json  # Sidebar nav labels
│   │   ├── dashboard.json   # Dashboard page strings
│   │   ├── courses.json     # Course management strings
│   │   ├── students.json    # Student management strings
│   │   ├── finance.json     # Finance/billing strings
│   │   ├── timetable.json   # Scheduling strings
│   │   ├── crm.json         # CRM pipeline strings
│   │   ├── quizzes.json     # Quiz management strings
│   │   ├── assignments.json # Assignment strings
│   │   ├── settings.json    # Settings page strings
│   │   └── notifications.json
│   └── panel/
│       ├── navigation.json
│       ├── dashboard.json
│       ├── courses.json     # Student course view strings
│       ├── quizzes.json     # Student quiz-taking strings
│       ├── assignments.json
│       └── profile.json
└── ar/
    └── [mirrors en/ structure exactly — machine translated]
```

**Key naming convention:** `namespace.component.element` — e.g., `courses.courseCard.enrollButton`, `common.actions.save`, `common.errors.required`.

### 4.4 next-intl Configuration

```typescript
// next-intl.config.ts
import { getRequestConfig } from 'next-intl/server';
import { getUserLocale } from '@/shared/lib/locale';

export default getRequestConfig(async () => {
  const locale = await getUserLocale(); // reads from cookie set on login/switch
  return {
    locale,
    messages: (await import(`../messages/${locale}/index`)).default,
    onError(error) {
      // Log missing keys — never throw, never show key identifier
      console.warn('[i18n]', error.message);
    },
    getMessageFallback({ key }) {
      // Fall back to the last segment of the key as a readable label
      return key.split('.').pop() ?? key;
    }
  };
});
```

### 4.5 Locale Cookie Strategy

Locale is communicated to Next.js Server Components via an **httpOnly cookie** `ubotz_locale`. This cookie is set by the API route handler when the user switches language (after writing to `users.locale`). It is read in `getUserLocale()` in the `next-intl` config.

This is the only way to make the locale available to Server Components without URL encoding. The cookie is:
- `SameSite: Lax`
- `Secure` in production
- No expiry (session cookie) — refreshed on each login from user profile

### 4.6 Usage Pattern — Client Components

```tsx
// Client Component
import { useTranslations } from 'next-intl';

export function SaveButton() {
  const t = useTranslations('common.actions');
  return <button>{t('save')}</button>;
}
```

### 4.7 Usage Pattern — Server Components

```tsx
// Server Component
import { getTranslations } from 'next-intl/server';

export async function CourseListPage() {
  const t = await getTranslations('tenant-admin.courses');
  return <h1>{t('pageTitle')}</h1>;
}
```

### 4.8 Arabic Plural Rules

Arabic has six grammatical number forms. `next-intl` handles this via ICU message syntax:

```json
// ar/common.json
{
  "studentsCount": "{count, plural, =0 {لا يوجد طلاب} one {طالب واحد} two {طالبان} few {{count} طلاب} many {{count} طالبًا} other {{count} طالب}}"
}
```

Developers mark English strings with simple `{count, plural, one {...} other {...}}`. Arabic plural forms are filled in by the human reviewer before GCC launch.

---

## 5. Database Schema

### 5.1 New Column: `users.locale`

```sql
ALTER TABLE users
ADD COLUMN locale VARCHAR(5) NOT NULL DEFAULT 'en'
AFTER timezone; -- or after an appropriate existing column
```

Valid values: `'en'`, `'ar'`. Validated at the API layer. No enum constraint — allows future locale additions without migration.

### 5.2 New Table: `tenant_locale_settings`

| Column | Type | Notes |
|---|---|---|
| `id` | BIGINT UNSIGNED PK | |
| `tenant_id` | BIGINT UNSIGNED UNIQUE FK | One row per tenant |
| `default_locale` | VARCHAR(5) NOT NULL DEFAULT 'en' | `'en'` or `'ar'` |
| `rtl_enabled` | BOOLEAN NOT NULL DEFAULT FALSE | Mirrors `CAP_RTL_UI` capability — set by system when capability assigned |
| `created_at` | TIMESTAMP | |
| `updated_at` | TIMESTAMP | |

`rtl_enabled` is a denormalised convenience flag. It is set `TRUE` when `CAP_RTL_UI` is assigned to the tenant's plan and `FALSE` when removed. It is NOT the source of truth for capability enforcement — `EnforceTenantCapability` middleware remains authoritative.

---

## 6. API Changes

### 6.1 New Endpoints

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/api/tenant/locale-settings` | Tenant user | Returns `default_locale`, `rtl_enabled`, current user's `locale` preference |
| `PUT` | `/api/tenant/locale-settings` | Tenant Admin (OWNER) + `CAP_RTL_UI` | Update tenant default locale. Body: `{ default_locale: 'ar' \| 'en' }` |
| `PATCH` | `/api/tenant/profile/locale` | Any tenant user | Update own locale preference. Body: `{ locale: 'ar' \| 'en' }`. Also sets `ubotz_locale` cookie. |

### 6.2 Modified Endpoints

`GET /api/tenant/profile` — add `locale` field to response:
```json
{
  "user": {
    "id": 1,
    "name": "Ahmed Al-Rashid",
    "locale": "ar",
    "...": "..."
  },
  "tenant": {
    "default_locale": "ar",
    "rtl_enabled": true,
    "...": "..."
  }
}
```

---

## 7. RTL Component Audit — Scope and Rules

### 7.1 Icon Mirroring Reference

Icons that ARE mirrored in RTL (directional — their meaning depends on direction):

| Icon | Usage |
|---|---|
| `ChevronLeft` / `ChevronRight` | Pagination, breadcrumb back, collapse/expand |
| `ArrowLeft` / `ArrowRight` | Navigation back/forward, next step |
| `ArrowLeftCircle` / `ArrowRightCircle` | Wizard navigation |
| `Send` | Message send button |
| `Reply` | Reply to message |
| `ExternalLink` | Opens in new tab (arrow direction) |
| `ChevronsLeft` / `ChevronsRight` | First/last page pagination |
| `MoveLeft` / `MoveRight` | Drag handles |

Icons that are NOT mirrored in RTL (non-directional — their meaning is universal):

| Icon | Reason |
|---|---|
| `Settings` (gear) | Rotational, no direction |
| `Bell` | Symmetric |
| `X` (close) | Symmetric |
| `Check` / `CheckCircle` | Symmetric |
| `User` / `Users` | Symmetric |
| `Search` | The magnifying glass loop is on the left universally |
| `Trash` | Symmetric |
| `Edit` / `Pencil` | Symmetric |
| `Download` / `Upload` | Vertical direction only |
| `Calendar` | Symmetric |
| `Clock` | Symmetric (clock hands run clockwise universally) |

Apply mirroring with: `className="rtl:scale-x-[-1]"` on the icon component.

### 7.2 Component Categories Requiring RTL Audit

**Category A — Layout Components (highest risk, audit first):**
- Root layout (`app/(tenant-admin-dashboard)/layout.tsx`)
- Sidebar navigation component
- Top navigation / header bar
- Breadcrumb component
- Page header component (title + action buttons)
- Modal / drawer components
- Toast / notification components

**Category B — Form Components:**
- All `Input`, `Textarea`, `Select` components — text alignment, placeholder direction
- `DatePicker` — calendar grid direction
- `TimePicker`
- `SearchInput` — icon position
- Form error messages — alignment

**Category C — Data Display Components:**
- `DataTable` — column order, sort indicators, pagination arrows
- `Card` — icon and text alignment within cards
- `Badge` / `Chip` — padding direction
- `Stat` cards (dashboard metrics)
- `Progress` bar — fill direction (must fill from right in RTL)
- `Timeline` — direction of progression

**Category D — Navigation Components:**
- `Tabs` — tab order and active indicator
- `Breadcrumb` — separator direction
- `Pagination` — previous/next arrows
- `Stepper` / `Wizard` — step progression direction
- `Dropdown` / `Menu` — submenu opening direction (opens to left in RTL)

**Category E — Portal-Specific Components:**
- Kanban board (CRM pipeline) — column order
- Calendar / FullCalendar — see §8.1
- Rich text editor — see §8.2
- Chart components — see §8.4
- Course content viewer
- Quiz taking interface

### 7.3 Tailwind RTL Utility Classes

Tailwind CSS v4 supports logical properties natively. The following substitutions are mandatory across all AR1-touched files:

| Physical (BANNED) | Logical (REQUIRED) |
|---|---|
| `ml-*` | `ms-*` (margin-inline-start) |
| `mr-*` | `me-*` (margin-inline-end) |
| `pl-*` | `ps-*` (padding-inline-start) |
| `pr-*` | `pe-*` (padding-inline-end) |
| `left-*` (positioning) | `start-*` |
| `right-*` (positioning) | `end-*` |
| `rounded-l-*` | `rounded-s-*` |
| `rounded-r-*` | `rounded-e-*` |
| `rounded-tl-*` | `rounded-ss-*` |
| `rounded-tr-*` | `rounded-se-*` |
| `rounded-bl-*` | `rounded-es-*` |
| `rounded-br-*` | `rounded-ee-*` |
| `text-left` | `text-start` |
| `text-right` | `text-end` |
| `border-l-*` | `border-s-*` |
| `border-r-*` | `border-e-*` |

**Exception:** `text-center`, `mx-auto`, `px-*`, `py-*`, `m-*`, `p-*` (symmetric) are allowed as-is.

For RTL-specific overrides that cannot be expressed with logical properties, use the `rtl:` Tailwind variant: `rtl:origin-top-right`, `rtl:translate-x-full`.

---

## 8. Third-Party Component RTL Configuration

### 8.1 FullCalendar (Timetable Views)

FullCalendar has built-in RTL support via the `direction` prop.

```tsx
import FullCalendar from '@fullcalendar/react';
import { useLocale } from 'next-intl';

export function TimetableCalendar() {
  const locale = useLocale();
  return (
    <FullCalendar
      direction={locale === 'ar' ? 'rtl' : 'ltr'}
      locale={locale === 'ar' ? arLocale : undefined}
      // ... other props
    />
  );
}
```

Install the FullCalendar Arabic locale package: `@fullcalendar/core` ships locale files. Import `arLocale` from `@fullcalendar/core/locales/ar`.

**Verify:** Day headers, week numbers, event positioning, and the "today" button all render correctly in RTL before marking this complete.

### 8.2 Rich Text Editor (Course Content, Quiz Questions)

The rich text editor used for course content and quiz question authoring must support RTL text input and RTL layout. The specific editor in use (TipTap, Quill, or equivalent) must be identified in the gap analysis.

**Requirements regardless of editor:**
- The editor toolbar must reverse in RTL (buttons flow right-to-left)
- Text direction toggle button must be available (allows mixed LTR/RTL content within a single document — e.g., Arabic instructions with English code snippets)
- Default text direction follows the current locale
- The editor's internal `dir` attribute must be set to `rtl` when locale is Arabic

**For TipTap (if used):**
```tsx
import { useEditor } from '@tiptap/react';
import { useLocale } from 'next-intl';

const locale = useLocale();
const editor = useEditor({
  editorProps: {
    attributes: {
      dir: locale === 'ar' ? 'rtl' : 'ltr',
      class: locale === 'ar' ? 'font-cairo' : 'font-geist',
    },
  },
});
```

### 8.3 PDF Generation — Invoices, Receipts, Certificates

PDF RTL support requires a separate sub-phase (**AR1-PDF**) due to complexity. This is explicitly excluded from AR1 scope.

**Reason:** DomPDF (the existing PDF generator) has limited Arabic support. True Arabic PDF rendering requires either a custom font embedding pipeline (Arabic fonts must be embedded with correct Unicode character mapping) or migration to a more capable PDF library (Puppeteer-based HTML-to-PDF or wkhtmltopdf). This is a multi-day investigation and implementation effort that should not block the rest of AR1.

**AR1 handling:** PDF download buttons (receipts, invoices, certificates) remain functional in AR1. PDFs continue to generate in English layout. An informational note `// Arabic PDF deferred to AR1-PDF phase` is added to all PDF generation call sites.

### 8.4 Chart.js / Recharts (Analytics Dashboards)

Charts are predominantly visual and not inherently directional. RTL handling is limited:

**What changes:**
- Chart legend position: In RTL, legends that are `position: 'left'` must move to `position: 'right'` and vice versa
- Y-axis position: Bar and line charts with Y-axis on the left must mirror to the right in RTL
- Tooltip alignment: Tooltips must open in the appropriate direction based on cursor position and locale

**Implementation:**
```tsx
const locale = useLocale();
const chartOptions = {
  plugins: {
    legend: {
      position: locale === 'ar' ? 'right' : 'left',
    },
  },
  scales: {
    y: {
      position: locale === 'ar' ? 'right' : 'left',
    },
  },
};
```

**What does NOT change:** Chart data rendering, bar heights, line paths, pie slice positions — these are mathematical and have no direction.

### 8.5 Data Tables with Sorting and Filtering

Data tables are high-risk for RTL because they combine layout direction, icon direction, and interaction direction.

**Required changes per data table instance:**
- Column headers: text aligns to `text-start` (right in RTL)
- Sort indicator arrows: mirrored (ascending/descending arrows flip)
- Action column: moves from the rightmost position (LTR) to the leftmost position (RTL) — use CSS `order` or `flex-row-reverse` on the row
- Filter inputs: placeholder text right-aligned in RTL
- Pagination: previous/next arrows mirrored; page number sequence reads right-to-left
- Row selection checkboxes: move to the end (right side) in RTL

Use a shared `<DataTable>` wrapper component that reads locale and applies RTL classes programmatically. Individual table instances must NOT each implement their own RTL logic.

---

## 9. Application Layer — Backend Changes

### 9.1 New UseCase: `UpdateTenantDefaultLocaleUseCase`

Validates `CAP_RTL_UI` is present, validates locale value (`en` or `ar`), updates `tenant_locale_settings.default_locale`, audit-logs the change.

### 9.2 New UseCase: `UpdateUserLocaleUseCase`

Validates locale value, updates `users.locale`, sets the `ubotz_locale` httpOnly cookie in the response. This is the action that triggers the frontend reload.

### 9.3 Audit Logging

Both locale changes are audit-logged to `tenant_audit_logs`:
- `actor_id`, `action: 'locale.tenant_default_updated'`, `payload: { from, to }`
- `actor_id`, `action: 'locale.user_preference_updated'`, `payload: { user_id, from, to }`

---

## 10. Capability Registry

| Capability Code | Description | Assigned To |
|---|---|---|
| `CAP_RTL_UI` | Enables Arabic RTL UI for the tenant portal | Plan-level capability, assigned by Super Admin via subscription plan configuration |
| `CAP_LOCALE_SETTINGS_MANAGE` | Allows Tenant Admin to set the portal default language | Tenant OWNER only |

`CAP_RTL_UI` is a plan-level module capability, not a role-level capability. It is checked at the middleware and layout level, not per-action.

---

## 11. Frontend File Structure — New Files

```
messages/
├── en/                         # English translation files (full)
└── ar/                         # Arabic translation files (machine-translated)

config/
└── i18n.ts                     # Locale config, isRtl() utility

shared/
├── lib/
│   ├── locale.ts               # getUserLocale(), setUserLocale()
│   └── rtl-utils.ts            # isRtl(), getDirection(), mirrorIcon()
├── hooks/
│   ├── use-locale.ts           # Hook: current locale + isRtl
│   └── use-language-switch.ts  # Hook: switch language with reload
└── ui/
    └── language-switcher.tsx   # Language toggle button/dropdown component

features/
├── tenant-admin/
│   └── settings/
│       └── locale/
│           ├── locale-settings-page.tsx
│           ├── locale-settings-form.tsx
│           └── use-locale-settings.ts
└── panel/
    └── profile/
        └── language-preference-section.tsx  # Student language preference UI
```

---

## 12. Decision Records

| DR | Decision | Rationale |
|---|---|---|
| DR-AR1-01 | Preference-based locale routing (no URL locale prefix) | URL-based routing (`/ar/...`) requires every link, redirect, API endpoint, and middleware rule to be locale-aware. For a B2B SaaS where URLs are not shared for language-specific content, this adds complexity with no benefit. Cookie-based resolution is simpler, equally correct, and invisible to the user. |
| DR-AR1-02 | Page reload on language switch | Live switching requires every component, hook, and third-party library to respond to a React context change in real time. FullCalendar, the rich text editor, and chart libraries all have non-trivial RTL initialisation. A page reload is instantaneous on a SPA and is the universal approach used by Notion, Linear, Figma, and Google Workspace for language switching. |
| DR-AR1-03 | Cairo typeface for Arabic | Cairo is designed for UI at label and heading sizes. Noto Sans Arabic is optimised for dense body text. The Ubotz UI is a dashboard, not a document — UI-sized typography dominates. Cairo also visually pairs better with Geist Sans (both have a geometric, modern construction). |
| DR-AR1-04 | Western (Latin) digits in Arabic locale | Eastern Arabic-Indic digits (`١٢٣`) are culturally authentic but create significant technical friction: chart axis labels, table pagination, date pickers, and financial figures all format numbers differently. GCC professional software increasingly uses Latin digits. Deferred to a future polish phase if market feedback demands it. |
| DR-AR1-05 | PDF RTL deferred to AR1-PDF sub-phase | Arabic PDF generation requires font embedding with correct Unicode shaping. DomPDF does not handle Arabic text correctly without custom configuration. This is a separate technical investigation and must not block the UI RTL work. |
| DR-AR1-06 | Machine-translated first pass committed to repository | Getting human translators involved before the UI string extraction is complete is wasteful — strings change during development. The correct sequence is: (1) extract all strings, (2) machine translate, (3) commit, (4) human review before GCC launch. Developers never write Arabic translations. |
| DR-AR1-07 | Tailwind logical properties enforced via grep gate | Physical directional classes (`ml-`, `mr-`, `pl-`, `pr-`) in RTL components produce incorrect layouts that are invisible in LTR testing and only appear broken when the locale is switched. A automated grep check at the quality gate makes this a build-time failure rather than a QA discovery. |
| DR-AR1-08 | `next-intl` as the i18n library | Native App Router support for both Server Components and Client Components. ICU message format for Arabic plural rules (Arabic has 6 forms — most i18n libraries only support 2). Active maintenance and Next.js official recommendation. |

---

## 13. What Phase AR1 Does NOT Include

| Excluded Item | Reason | Deferred To |
|---|---|---|
| Super Admin Dashboard Arabic | Platform admins are Ubotz staff — English only | AR2 (if demanded) |
| Public landing page Arabic | Separate rendering context, SEO complexity | AR2 |
| Hijri (Islamic) calendar | Separate domain concern beyond RTL layout | AR-Hijri phase |
| Eastern Arabic-Indic digits | Technical friction outweighs cultural benefit at this stage | Future polish phase |
| Arabic email notification templates | Phase 14 infrastructure is English-only | AR-Notifications phase |
| Arabic PDF certificates, invoices, receipts | DomPDF Arabic support requires custom pipeline | AR1-PDF sub-phase |
| Translation Management System (TMS) | Static JSON files sufficient at current scale | Future if translation volume demands |
| Tenant-provided translation overrides | Custom translations per-tenant add sync complexity | Future |
| Backend API error messages in Arabic | Error messages are developer-facing; user-facing errors are translated on the frontend | Future |
| Arabic keyboard input method integration | Handled natively by the OS/browser | N/A |
| RTL support for mobile app | Separate React Native project | Mobile AR phase |

---

## 14. Quality Gates — Phase AR1 Complete

### I18N Completeness Gates (BLOCKING)

- [ ] Zero hard-coded user-visible strings in JSX across both portals — verified by `grep -rn '"[A-Z][a-z]' features/tenant-admin/ features/panel/` (no raw capitalized strings in JSX)
- [ ] All translation keys present in both `en/` and `ar/` JSON files — `next-intl` reports zero missing key warnings in test run
- [ ] English fallback works for every missing Arabic key — no empty strings or key identifiers visible in UI
- [ ] Arabic plural forms present for all count-bearing strings (students, courses, sessions)
- [ ] Number formatting uses Latin digits in Arabic locale — verified by visual test

### RTL Layout Gates (BLOCKING)

- [ ] `<html dir="rtl" lang="ar">` set correctly when Arabic is active — inspect element verification
- [ ] Grep gate passes: `grep -rn 'ml-\|mr-\|pl-\|pr-\|text-left\|text-right\|rounded-l-\|rounded-r-' features/tenant-admin/ features/panel/` → zero results in AR1-touched files
- [ ] Sidebar renders on the correct side in both locales
- [ ] All directional icons mirrored in RTL per §7.1 reference list
- [ ] Non-directional icons NOT mirrored in RTL
- [ ] Progress bars fill from right in RTL
- [ ] Modal/drawer slides in from the correct side in RTL
- [ ] Dropdown menus open in the correct direction in RTL
- [ ] Form validation errors aligned correctly in RTL

### Font Gates (BLOCKING)

- [ ] Cairo font loaded via `next/font/google` — no `<link>` tag
- [ ] Cairo applies when `lang="ar"`, Geist Sans when `lang="en"` — verify via computed styles
- [ ] No FOUT (Flash of Unstyled Text) on language switch
- [ ] Arabic line height `leading-relaxed` applied — verify computed `line-height`

### Capability Gates (BLOCKING)

- [ ] Language switcher hidden entirely for tenants without `CAP_RTL_UI` — not disabled, not greyed, not present in DOM
- [ ] Tenant without `CAP_RTL_UI` cannot access locale settings API — returns 403
- [ ] Tenant with `CAP_RTL_UI` revoked falls back to English on next session
- [ ] `CAP_LOCALE_SETTINGS_MANAGE` required for Tenant Admin to change default locale

### Third-Party Component Gates (BLOCKING)

- [ ] FullCalendar renders in RTL with correct day-header order and event positioning
- [ ] Rich text editor toolbar reverses in RTL; default input direction is RTL
- [ ] Chart Y-axis and legend position mirrors in RTL
- [ ] Data table action column, sort indicators, and pagination arrows correct in RTL

### Language Switch Gates (BLOCKING)

- [ ] Language switch writes to `localStorage` immediately
- [ ] Language switch calls `PATCH /api/tenant/profile/locale` (fire-and-forget)
- [ ] `ubotz_locale` cookie set by API on locale update
- [ ] Page reloads after switch and renders in the new locale
- [ ] User preference persists across sessions (reads from user profile on login)
- [ ] Tenant default locale respected for users with no personal preference set

### Architecture Gates (BLOCKING)

- [ ] `next-intl` used exclusively — no `react-i18next`, no raw `Intl` usage for UI strings
- [ ] `getUserLocale()` is the single locale resolution function — no other locale reads in the codebase
- [ ] `TenantTimezoneResolver` (G4) and locale resolution are independent — locale change does not affect timezone
- [ ] PHPStan Level 5: zero new errors on backend changes
- [ ] All new backend UseCases have zero `Illuminate` domain imports
- [ ] Audit logs written for both tenant default and user preference locale changes

### Test Requirements

- [ ] Unit: `isRtl()` utility — `'ar'` returns true, `'en'` returns false, unknown locale returns false
- [ ] Unit: `UpdateTenantDefaultLocaleUseCase` — success, `CAP_RTL_UI` missing → 403, invalid locale → 422
- [ ] Unit: `UpdateUserLocaleUseCase` — success, cookie set, invalid locale → 422
- [ ] Feature: `GET /api/tenant/locale-settings` — returns correct defaults, RTL-enabled flag
- [ ] Feature: `PUT /api/tenant/locale-settings` — OWNER updates default, non-OWNER rejected, no capability → 403
- [ ] Feature: `PATCH /api/tenant/profile/locale` — updates `users.locale`, sets cookie
- [ ] Feature: `GET /api/tenant/profile` — includes `locale` and `tenant.default_locale`
- [ ] Frontend: Language switcher absent in DOM for tenant without `CAP_RTL_UI`
- [ ] Frontend: Language switcher present for entitled tenant
- [ ] Frontend: Switch to Arabic → reload → `<html dir="rtl" lang="ar">` confirmed
- [ ] Frontend: Switch back to English → reload → `<html dir="ltr" lang="en">` confirmed
- [ ] Frontend: Sidebar on correct side in both locales
- [ ] Frontend: DataTable pagination arrows correct in both locales
- [ ] Frontend: Form inputs right-aligned in Arabic locale
- [ ] Frontend: FullCalendar direction correct in both locales
- [ ] Minimum 35 new tests expected

---

## 15. Implementation Guidance for Antigravity

### 15.1 Gap Analysis Requirement

Before writing the implementation plan, the developer MUST:

1. Identify the exact rich text editor library in use (package name and version) — RTL configuration differs significantly between TipTap, Quill, and Slate
2. Identify the exact chart library in use (Chart.js vs Recharts) — Y-axis mirroring API differs
3. Run a grep to count the total number of hard-coded strings in both portals:
   ```bash
   grep -rn '"[A-Z][a-z]\|>[A-Z][a-z]' frontend/features/tenant-admin/ frontend/features/panel/ | wc -l
   ```
   This count determines the translation extraction effort estimate
4. Verify Tailwind CSS v4 logical property support is active (test with `ms-4` class in a component)
5. Confirm `next-intl` is not already installed (check `package.json`)

### 15.2 Rollout Order

This is the mandatory implementation sequence. Do not deviate:

```
Step 1:  Install next-intl, create i18n config, create empty translation files
Step 2:  Add locale cookie infrastructure (getUserLocale, setUserLocale)
Step 3:  Add users.locale migration and tenant_locale_settings migration
Step 4:  Build locale API endpoints and UseCases (backend)
Step 5:  Extract ALL strings in Tenant Admin Dashboard → populate en/ files
Step 6:  Extract ALL strings in Student Portal → populate en/ JSON files
Step 7:  Machine-translate all en/ files → populate ar/ files
Step 8:  Build language switcher component + capability gate
Step 9:  Implement page reload on switch + cookie write + API call
Step 10: Apply Tailwind logical properties across ALL AR1-touched components
         (do this systematically — one component category at a time per §7.2)
Step 11: Configure third-party libraries (FullCalendar, editor, charts, tables)
Step 12: Apply Cairo font for Arabic locale
Step 13: Fix icon mirroring per §7.1 reference list
Step 14: Full RTL visual QA pass — every page in both portals in Arabic locale
Step 15: Run grep quality gates — fix all physical-property violations
Step 16: Run full test suite — fix all regressions
```

Steps 5–7 (string extraction and machine translation) are the longest and most tedious steps. Allocate realistic time. A portal with hundreds of components will have thousands of strings.

### 15.3 String Extraction Strategy

Do not extract strings manually one-by-one. Use this approach:

1. For each component file, identify all user-visible strings
2. Replace inline strings with `t('key')` calls
3. Add the key and English value to the appropriate namespace JSON file immediately (not at the end)
4. Run the app in English to verify no regressions before moving to the next component

Do not batch all string extraction and then fix all breakages at once — this creates an impossible debugging session.

### 15.4 The Sidebar is the Highest-Risk Component

The sidebar navigation contains direction-sensitive layout, icons, collapse/expand animation, active state indicators, and sub-menu behaviour. It is the most visible component in the dashboard and the first thing a user sees when switching to Arabic. Implement and fully test the sidebar RTL behaviour before touching any other component.

---

*Document version: AR1-v1.0. This document is locked for implementation. Superseding documents must be versioned AR1-v1.1 or higher and must not alter this document in place.*
