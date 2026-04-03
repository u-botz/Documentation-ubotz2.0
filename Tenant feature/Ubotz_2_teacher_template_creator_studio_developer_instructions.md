# UBOTZ 2.0 — Teacher Landing Page Template: Creator Studio

## Developer Instructions

| Field             | Value                                                          |
|-------------------|----------------------------------------------------------------|
| Document Type     | Developer Instruction (Pre-Implementation Brief)               |
| Template Slug     | `creator-studio`                                               |
| Template Category | `standalone_teacher`                                           |
| Date              | April 2, 2026                                                  |
| Issued By         | Principal Engineer / Architecture Auditor                      |
| Audience          | Antigravity Implementation Developer                           |
| Prerequisite      | `TeacherLandingPageTemplate.tsx` (Educator Pro) must be live   |
| Related Phase     | Phase 13A — Landing Page Template System                       |

---

## 1. Purpose & Scope

This document specifies the **Creator Studio** template — the second teacher landing page
template for `standalone_teacher` tenants on UBOTZ 2.0.

The first template (`educator-pro`) uses a warm, light, serif-led portfolio aesthetic.
This template is a **completely different visual model** targeting teachers who have a strong
personal creator brand — educators who publish content, run a YouTube channel or newsletter,
and lead with authority rather than approachability.

**The implementation output is a single TSX file** following the exact same structure,
prop contract, and section composition as `TeacherLandingPageTemplate.tsx`. The two templates
are **visually distinct but share an identical TypeScript interface**. Antigravity must not
change the prop types, data shapes, or section names — only the visual implementation differs.

---

## 2. Design Direction

### 2.1 Aesthetic Model

**Reference aesthetic:** Dark editorial magazine. Think Typeform's dark velvet landing page,
Kinfolk magazine editorial layouts, and creator-economy personal brands (e.g. Ali Abdaal,
Thomas Frank, Justin Welsh) — dark, high-contrast, large serif type, generous whitespace.

**Core feeling:** Authority. Depth. Substance. A visitor landing on this page should feel they
are reading a premium publication, not browsing a generic EdTech site.

**What this is NOT:** Not dark-and-flashy. Not neon cyberpunk. Not gaming aesthetic.
Dark and refined, like a well-designed book jacket at night.

### 2.2 Color Palette

All values must be defined as CSS custom properties scoped to the template root element.
Do not use Tailwind arbitrary values — map tokens to Tailwind classes where possible
and use `style={{ color: 'var(--cs-accent)' }}` for values without Tailwind equivalents.

```css
/* Scoped to the template root: <div className="creator-studio"> */
.creator-studio {
  /* Base surfaces */
  --cs-bg:          #0A0A0A;   /* near-black page background         */
  --cs-surface:     #141414;   /* card / section surface              */
  --cs-surface-2:   #1E1E1E;   /* elevated card, input bg             */
  --cs-border:      #2A2A2A;   /* subtle dividers                     */

  /* Typography */
  --cs-text-primary:   #F5F0E8;  /* warm off-white — NOT pure white   */
  --cs-text-secondary: #A09A8E;  /* muted warm grey                   */
  --cs-text-muted:     #5C5650;  /* timestamps, labels                 */

  /* Accent — electric lime, used sparingly */
  --cs-accent:         #C8F135;  /* primary accent: CTAs, highlights  */
  --cs-accent-dim:     #8AAF20;  /* hover / pressed state             */
  --cs-accent-glow:    rgba(200, 241, 53, 0.12); /* subtle glow bg   */

  /* Semantic */
  --cs-success:  #4ADE80;
  --cs-danger:   #F87171;
  --cs-warning:  #FCD34D;
}
```

**Accent usage rule:** `--cs-accent` (#C8F135) appears on at most 3 elements per
screen viewport at any time. Overuse kills the contrast effect. Use it for:
- Primary CTA button backgrounds
- Section label text
- Active nav underline
- Hover states on links
- Decorative accent marks (the `✦` glyph, horizontal rule before section labels)

Everything else uses the neutral palette.

### 2.3 Typography

Load via `next/font/google`. Add to the public layout that wraps tenant public pages —
the same layout that loads Educator Pro's fonts.

```typescript
// Add to the existing font loader in app/layout.tsx or public layout
import { Cormorant_Garant, Syne } from 'next/font/google';

const cormorant = Cormorant_Garant({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  style: ['normal', 'italic'],
  variable: '--font-cs-display',
  display: 'swap',
});

const syne = Syne({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-cs-body',
  display: 'swap',
});
```

| Role              | Font            | Weight   | Notes                                       |
|-------------------|-----------------|----------|---------------------------------------------|
| Display / Hero    | Cormorant Garant| 700      | Large serif, italic for emphasis            |
| Section headlines | Cormorant Garant| 600      | Mixed with italic for pull-quotes           |
| Body / UI         | Syne            | 400–500  | Geometric sans, very legible on dark bg     |
| Labels / Tags     | Syne            | 700–800  | Uppercase, tight letter-spacing             |
| Stats numbers     | Cormorant Garant| 700      | Very large, tabular nums                    |

**CSS variables to use inside the component:**
```css
--font-cs-display: Cormorant Garant, Georgia, serif;
--font-cs-body:    Syne, system-ui, sans-serif;
```

### 2.4 Spacing & Layout Principles

- Base grid: 8px (same as UBOTZ platform standard)
- Section vertical padding: `py-24 lg:py-32` — more generous than Educator Pro
- Max content width: `max-w-7xl` (same as Educator Pro)
- Hero and Stats sections extend to full viewport width with contained content
- Cards use `rounded-2xl` with `border border-[--cs-border]`
- No drop shadows on cards — borders only (shadows are invisible on dark backgrounds)
- Decorative horizontal rules: `<hr>` styled as `1px solid var(--cs-border)`

---

## 3. Section Specifications

The 9 sections are identical in name and data contract to Educator Pro.
Only the visual implementation differs. Sections render in this order:

```
1. Navbar
2. Hero
3. Stats
4. About
5. Credentials
6. Courses
7. BlogPreview
8. Testimonials
9. FAQ
10. Contact
11. Footer
```

No additional sections. No reordering. This list is final.

---

### 3.1 Navbar

**Layout:** Full-width dark bar. Logo left, nav centre-right, CTA far right.

**Visual spec:**

- Background: `--cs-bg` with `border-b border-[--cs-border]`
- Logo text: `--font-cs-display`, `--cs-text-primary`, italic
- Logo fallback monogram: `--cs-accent` background, `--cs-bg` text
- Nav links: `--font-cs-body`, `--cs-text-secondary`, uppercase, `text-xs tracking-widest`
- Nav link hover: underline animates in using `scaleX` transform from left, `--cs-accent` colour
- CTA button: `--cs-accent` background, `--cs-bg` text, `--font-cs-body font-bold`,
  `rounded-full px-6 py-2.5`, no border-radius square — must be pill shape
- Mobile: hamburger icon in `--cs-text-secondary`, drawer slides from top with dark backdrop

**Active nav state:** A 2px `--cs-accent` underline beneath the active link. Determined by
scroll position (use `IntersectionObserver` on section ids).

---

### 3.2 Hero Section

**Layout:** Full-viewport-width dark section. Two columns on desktop: left = large display
text (60% width), right = teacher photo with editorial framing (40% width).

**Visual spec:**

**Left column:**
- Small label line: `✦ {hero.title}` — `--font-cs-body font-bold uppercase text-xs
  tracking-widest` in `--cs-accent`
- Headline: `"Hi, I'm"` in `--cs-text-secondary`, teacher name on its own line in
  `--cs-text-primary`. Use Cormorant Garant at `text-6xl sm:text-7xl lg:text-8xl`.
  The name should be italic: `font-style: italic`.
- Tagline: `--cs-text-secondary`, `--font-cs-body`, `text-lg`, max-width `28rem`
- Two CTAs:
  - Primary: pill button, `--cs-accent` bg, `--cs-bg` text, `font-bold`
  - Secondary: transparent bg, `--cs-border` border (2px), `--cs-text-secondary` text,
    hover: `--cs-text-primary` text, `--cs-surface-2` bg
- Social links row: icon buttons, `--cs-text-muted` default, `--cs-accent` on hover

**Right column:**
- Photo rendered in a tall portrait container: `aspect-[3/4]` on desktop
- Photo sits inside a `rounded-3xl overflow-hidden` container
- **Decorative framing**: a thin `--cs-accent` border rectangle is offset 12px top-right
  from the photo container (`absolute`, not clipping the photo). Creates an editorial
  "frame within frame" effect.
- "Verified Educator" floating badge: bottom-left of photo, dark card
  (`--cs-surface-2 border border-[--cs-border]`), educator cap emoji, text in
  `--cs-text-primary` and `--cs-text-secondary`

**Background:**
- Page background `--cs-bg`
- A very subtle noise texture overlay (using an SVG `feTurbulence` filter or a CSS
  `background-image` with a base64-encoded noise PNG at `opacity-[0.03]`) gives the
  dark background depth. This is optional if it adds build complexity — skip if it does.

---

### 3.3 Stats Section

**Layout:** Full-width `--cs-surface` band. Stats rendered as a horizontal row.

**Visual spec:**

- Background: `--cs-surface` (slightly lighter than page bg)
- Top border: `1px solid var(--cs-border)`
- Bottom border: `1px solid var(--cs-border)`
- Each stat item:
  - Large number in Cormorant Garant 700 `text-5xl sm:text-6xl` `--cs-text-primary`
  - Label below in Syne 400 `text-sm uppercase tracking-widest` `--cs-text-muted`
  - Icon: NOT rendered in this template. Educator Pro has icon circles; Creator Studio
    uses numbers-only for a cleaner editorial look.
  - Vertical separator between stats: `1px solid var(--cs-border)` (desktop only,
    hidden on mobile)

**Grid:** Same responsive grid as Educator Pro (`grid-cols-2 lg:grid-cols-4`).

---

### 3.4 About Section

**Layout:** Two-column, asymmetric. Photo right (40%), text left (60%). This is the
**reverse** of Educator Pro's layout — intentional to differentiate.

**Visual spec:**

**Left column (text):**
- Section label: `✦ {about.sectionLabel}` — `--cs-accent`, uppercase, Syne 700, `text-xs tracking-widest`
- Headline: Cormorant Garant 600, `text-4xl sm:text-5xl`, `--cs-text-primary`, with at
  least one word in italic (`<em>` wrapping key word, e.g. "Clarity")
  - Default display: the headline renders as-is. Antigravity should NOT auto-italicise
    words. The sample data must include `<em>` in the string. Since we cannot use
    `dangerouslySetInnerHTML`, the headline must be split on `[em]...[/em]` markers
    and rendered as `<>text <em>word</em> text</>` using a helper function.
  - **Implementation note:** Define a `parseHeadlineWithEmphasis(text: string)` helper
    that splits on `[em]` and `[/em]` markers and returns a React node. This is safe —
    no HTML injection, purely string manipulation producing React elements.
- Bio paragraphs: Syne 400, `text-base`, `--cs-text-secondary`, `leading-relaxed`
- Philosophy blockquote:
  - No border-left. Instead: large typographic quotation mark `"` in Cormorant Garant
    at `text-8xl text-[--cs-accent] opacity-30 leading-none` positioned absolutely
    top-left of the blockquote container
  - Quote text: Cormorant Garant italic 500, `text-xl`, `--cs-text-primary`

**Right column (photo):**
- Container: `aspect-[3/4] rounded-3xl overflow-hidden`
- Below photo: a small editorial caption box — dark surface card showing teacher name
  and title, `--cs-text-muted` label, `--cs-text-primary` value
- Decorative: a `--cs-accent` dot (8px circle) appears at the top-right corner of the
  photo container as a subtle accent mark

---

### 3.5 Credentials Section

**Layout:** Centered header, then a **masonry-style** staggered grid on desktop.
On mobile: single column stacked list.

**Visual spec:**

- Background: `--cs-bg` (same as hero — alternating surface/bg for visual rhythm)
- Section label: `✦ {credentials.sectionLabel}` — `--cs-accent`, Syne 700, uppercase
- Headline: Cormorant Garant 600, `--cs-text-primary`

**Credential card:**
- Background: `--cs-surface`
- Border: `1px solid var(--cs-border)`
- `rounded-2xl p-6`
- Type badge: a small pill — background is `--cs-accent-glow`, text is `--cs-accent`,
  Syne 700 uppercase `text-xs tracking-widest`
- Title: Cormorant Garant 600, `text-lg`, `--cs-text-primary`
- Issuer: Syne 400, `text-sm`, `--cs-text-secondary`
- Year: right-aligned, Syne 700, `text-sm`, `--cs-accent`

**Masonry approximation:**
On desktop (`lg:`), use a CSS `columns-3` layout with `break-inside-avoid` on each card,
and `column-gap: 1.5rem`. This gives a staggered feel without requiring a JS masonry
library. Cards with longer titles naturally create height variation.

On tablet (`md:`): `columns-2`. On mobile: `columns-1`.

---

### 3.6 Courses Section (Live Data)

**Layout:** Header left-aligned with "View All" link right, then a horizontal card row.

**Visual spec:**

- Background: `--cs-surface`
- Section label: `✦ {courses.sectionLabel}` — `--cs-accent`

**Course card:**
- Background: `--cs-bg`
- Border: `1px solid var(--cs-border)`
- `rounded-2xl overflow-hidden`
- Thumbnail: `aspect-video` (16:9 — differs from Educator Pro which uses `h-44` fixed)
- On hover: thumbnail zooms 105% (`transition-transform duration-500`)
- Level badge: pill overlaid on thumbnail — `--cs-surface` bg at `opacity-90`,
  `--cs-text-primary` text, Syne 700
- Title: Cormorant Garant 600, `text-lg`, `--cs-text-primary`, hover: `--cs-accent`
- Enrollment count: `--cs-text-muted`, Syne 400, `text-sm`
- Price: right-aligned. Free courses: `--cs-accent`. Paid: `--cs-text-primary`, Syne 700

**Empty state:**
- Dark card with a centered message: `--cs-text-muted` text, Cormorant Garant italic
- No icon — text only: *"Courses are being prepared. Check back soon."*

---

### 3.7 Blog Preview Section (Live Data)

**Layout:** Different from Educator Pro. Uses a **featured + two secondary** layout on
desktop instead of a 3-equal-column grid.

```
Desktop:
┌──────────────────────┬─────────┐
│                      │ Post 2  │
│   Post 1 (large)     ├─────────┤
│                      │ Post 3  │
└──────────────────────┴─────────┘

Mobile: stacked single column
```

**Visual spec:**

**Featured post (Post 1, left column, `lg:col-span-2`):**
- Thumbnail: tall `aspect-[4/5]` container, `rounded-2xl overflow-hidden`
- Overlay: linear gradient from transparent to `--cs-bg` at the bottom 40% of the image
- Text overlaid on the gradient: date, read-time, title, excerpt
- Title: Cormorant Garant 600, `text-2xl`, `--cs-text-primary`
- "Read More" link: `--cs-accent` text with animated underline

**Secondary posts (Post 2 and 3, right column, stacked):**
- Horizontal card: thumbnail left (`w-28 aspect-square rounded-xl`), text right
- Title: Cormorant Garant 600, `text-base`, `--cs-text-primary`
- Date + read-time: Syne 400, `text-xs`, `--cs-text-muted`

**If fewer than 3 posts exist:**
- 1 post: render only the featured layout, no right column
- 2 posts: featured left + one secondary right, vertically centered
- 0 posts: hide section entirely (same as Educator Pro)

---

### 3.8 Testimonials Section

**Layout:** Full-width dark section. Header centred. Cards in a 3-column grid.

**Visual spec:**

- Background: `--cs-surface` (NOT `--cs-bg` — creates visual separation)
- Section label: `✦ {testimonials.sectionLabel}` — `--cs-accent`
- Headline: Cormorant Garant 600 italic, `--cs-text-primary`

**Testimonial card:**
- Background: `--cs-bg`
- Border: `1px solid var(--cs-border)`
- `rounded-2xl p-6`
- Opening quote mark: Cormorant Garant 700, `text-4xl`, `--cs-accent`, `leading-none`
  (purely decorative `"` character, not an HTML entity — use `&ldquo;` in JSX)
- Quote text: Cormorant Garant italic 400, `text-base`, `--cs-text-secondary`
- Divider: `1px solid var(--cs-border)` between quote and attribution
- Avatar: if `avatarUrl` present, `rounded-full w-10 h-10` image;
  if absent, monogram circle with `--cs-accent-glow` bg, `--cs-accent` text
- Name: Syne 600, `--cs-text-primary`, `text-sm`
- Role + course: Syne 400, `--cs-text-muted`, `text-xs`
- Star rating: `--cs-accent` filled stars, `--cs-border` empty stars

---

### 3.9 FAQ Section

**Layout:** Centred, max-width `3xl`, same as Educator Pro.

**Visual spec:**

- Background: `--cs-bg`
- Section label + headline: same pattern as other sections
- Accordion item:
  - Container: `border-b border-[--cs-border]` only (no full border-box — editorial style)
  - No `rounded` corners — full-width flush items
  - Question: Cormorant Garant 600, `text-lg`, `--cs-text-primary`
  - Chevron: `--cs-text-muted`, animates to `--cs-accent` when open
  - Answer: Syne 400, `text-sm`, `--cs-text-secondary`, `leading-relaxed`
  - Open item background: no background change — only chevron colour changes

**Open/close logic:** Same `useState<number | null>` pattern as Educator Pro. Only one
item open at a time.

---

### 3.10 Contact Section

**Layout:** Two columns — info left (`lg:col-span-2`), form right (`lg:col-span-3`).
Same proportions as Educator Pro.

**Visual spec:**

- Background: `--cs-surface`
- Section label + headline: same pattern
- Info card: `--cs-bg border border-[--cs-border] rounded-2xl`
- Info icon containers: `--cs-accent-glow` bg, `--cs-accent` icon colour
- Email/phone/address text: `--cs-text-primary`, Syne 400

**Form:**
- Container: `--cs-bg border border-[--cs-border] rounded-2xl p-6 sm:p-8`
- Input fields:
  - Background: `--cs-surface-2`
  - Border: `1px solid var(--cs-border)`
  - Text: `--cs-text-primary`
  - Placeholder: `--cs-text-muted`
  - Focus ring: `--cs-accent` (2px, `outline-offset-0`)
  - `rounded-xl`
- Labels: Syne 600, `text-xs uppercase tracking-widest`, `--cs-text-muted`
- Submit button: full-width pill, `--cs-accent` bg, `--cs-bg` text, Syne 700
  - Loading state: `opacity-70 cursor-not-allowed`
  - No spinner — text changes to "Sending…"
- Error state: `--cs-danger` text below the submit button
- Success state: replace entire form with a centred confirmation — large `✓` in
  `--cs-accent`, confirmation text in Cormorant Garant italic

---

### 3.11 Footer

**Layout:** Same two-row structure as Educator Pro (brand + nav top, copyright bottom).

**Visual spec:**

- Background: `--cs-bg`
- Top border: `1px solid var(--cs-border)`
- Logo: Cormorant Garant italic, `--cs-text-primary`
- Tagline: Syne 400, `--cs-text-muted`, `text-sm`
- Social icons: `--cs-text-muted` default, `--cs-accent` on hover
- Nav links: Syne 400, `--cs-text-muted`, hover `--cs-text-primary`
- Copyright text: `--cs-text-muted`, `text-xs`
- "Powered by EducoreOS": `--cs-accent`, Syne 600

---

## 4. TypeScript Interface Contract

**The prop interface is identical to `TeacherLandingPageTemplate.tsx`.**

Do not redefine types. Import all types from the Educator Pro file or move shared types
to a separate `teacher-landing-page.types.ts` file that both templates import from.

**Recommended refactor for Antigravity (optional but clean):**

```
src/
└── features/
    └── public-landing/
        ├── types/
        │   └── teacher-landing-page.types.ts   ← shared types extracted here
        ├── templates/
        │   ├── EducatorProTemplate.tsx          ← Educator Pro (renamed)
        │   └── CreatorStudioTemplate.tsx        ← this template
        └── index.ts
```

If this refactor is too large in scope for the current sprint, Antigravity may duplicate
the types in the Creator Studio file temporarily, but must file a task to consolidate.

---

## 5. Sample Data

The file must export a `SAMPLE_CREATOR_STUDIO_DATA` constant of type
`TeacherLandingPageProps` (same type as Educator Pro) for use in:
- Super Admin template preview
- Local development

Sample data should reflect a **different teacher persona** from Educator Pro's sample
to make previews distinct. Suggested persona: a tech educator / full-stack developer
who teaches programming — strong contrast to the maths/IIT-JEE persona in Educator Pro.

The `about.headline` value must use `[em]` markers for the emphasis helper:
```typescript
headline: 'From [em]Confusion[/em] to Code'
```

---

## 6. Implementation Rules (Non-Negotiable)

These rules apply to Creator Studio exactly as they do to Educator Pro.
Any deviation is a critical finding in the implementation plan audit.

| Rule | Enforcement |
|------|-------------|
| No `dangerouslySetInnerHTML` anywhere | The `parseHeadlineWithEmphasis()` helper must produce React elements, not HTML strings |
| No hardcoded hex values in JSX | All colours via `--cs-*` CSS custom properties or Tailwind classes |
| No `any` types | Strict TypeScript throughout |
| All three states required | Every data-driven section must have: loading skeleton, empty state, error state |
| `next/image` for all images | `fill` + `sizes` prop required. Never raw `<img>` |
| Lead form endpoint from props | Never hardcoded in the component |
| Blog section hides when empty | `if (blogPreview.posts.length === 0) return null` — no broken empty section on public page |
| Courses empty state renders | Show text message, not a broken grid |
| Single file output | All sections in one TSX file. No separate CSS file |
| `'use client'` directive at top | Required because FAQ accordion and contact form need client-side state |

---

## 7. File Naming & Delivery

| Artefact | Path |
|----------|------|
| Component file | `src/features/public-landing/templates/CreatorStudioTemplate.tsx` |
| Types file (if extracted) | `src/features/public-landing/types/teacher-landing-page.types.ts` |
| Super Admin preview route | Reuses existing Phase 13A preview infrastructure |

**Deliverable for review:**
Antigravity submits an Implementation Plan in the standard format (same as 10A–12A plans)
before writing any code. The implementation plan must cover:

1. Component file structure
2. Font loading strategy (how it coexists with Educator Pro fonts in the same layout)
3. CSS custom property scoping approach
4. The `parseHeadlineWithEmphasis()` helper design
5. Blog featured/secondary layout implementation
6. Masonry credential grid implementation
7. Sample data persona

Implementation plan is subject to Principal Engineer audit before implementation begins.

---

## 8. Visual Differentiation Summary

This table is for the Super Admin catalog UI — it documents the visible difference between
the two teacher templates so admins can describe them to prospective teacher tenants.

| Dimension          | Educator Pro                    | Creator Studio                        |
|--------------------|---------------------------------|---------------------------------------|
| **Mood**           | Warm, approachable, personal    | Dark, authoritative, editorial        |
| **Background**     | Stone-50 (near-white)           | #0A0A0A (near-black)                  |
| **Display font**   | Playfair Display                | Cormorant Garant                      |
| **Body font**      | DM Sans                         | Syne                                  |
| **Accent colour**  | Amber (#F59E0B)                 | Electric lime (#C8F135)               |
| **Hero layout**    | Photo right, text left          | Photo right (portrait), text left     |
| **Stats style**    | Icon circles + number           | Large number only (no icon)           |
| **About layout**   | Photo left, text right          | Photo right, text left (reversed)     |
| **Credentials**    | Colour-coded grid               | Masonry column layout                 |
| **Blog layout**    | 3-equal-column grid             | Featured + 2 secondary stacked        |
| **Testimonials**   | Dark charcoal bg                | Surface bg with large quote marks     |
| **FAQ style**      | Bordered card accordion         | Flush underline accordion             |
| **Best for**       | Traditional educators, tutors   | Creator educators, YouTubers, coaches |

---

## 9. What This Document Is Not

- This is **not** a TSX file. Antigravity writes the code from this specification.
- This document does **not** change Phase 13A's backend, API contracts, or section type
  registry. The `creator-studio` template is assembled from the same closed section type
  set defined in Phase 13A §4.
- This document does **not** introduce any new section types. The 9 sections specified
  here map 1:1 to existing Phase 13A section types.

---

*End of Document*
