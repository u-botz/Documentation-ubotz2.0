# UBOTZ 2.0 — Teacher Landing Page Templates

## Content & Design Specification Document

| Field | Value |
|---|---|
| **Document Type** | Template Design Specification |
| **Phase** | 13A-T (Teacher Templates — sub-phase of Phase 13A) |
| **Date** | March 29, 2026 |
| **Author** | Principal Engineer (Architecture Auditor) |
| **Prerequisites** | Phase 13A Landing Page Template System COMPLETE |
| **Audience** | Frontend developer + Super Admin (template creator) |
| **Deliverable** | 2 production-ready teacher landing page templates + 1 new section type |

---

## 1. Mission Statement

Create two professional, conversion-focused landing page templates designed specifically for **standalone teachers** — individual educators selling courses online. These templates must feel like a personal brand portfolio, not an institutional website. The teacher IS the brand.

The existing 5 institution templates (Phase 13A) were designed for schools and coaching centers — "About Us", "Our Faculty", "Our Branches." These don't work for a solo teacher. A standalone teacher's landing page must answer three questions within 5 seconds of page load: **Who is this person? What do they teach? Why should I trust them?**

---

## 2. Competitive Research Summary

Analysis of Teachable, Thinkific, Graphy, Kajabi, and top-performing independent educator sites reveals a consistent pattern for high-converting teacher landing pages:

**What works:**
- Teacher's face and name front and center in the hero — personal, not institutional
- Headline focuses on student transformation, not teacher credentials ("Master IELTS in 90 Days" not "IELTS Coaching by Dr. Kumar")
- Social proof early — student count, testimonials, or media logos within the first scroll
- Course catalog as a visual grid with prices and "Enroll Now" CTAs — this is the revenue engine
- Minimal navigation — most content is on a single scrolling page
- Strong credential section — but positioned AFTER the value proposition, not before
- Mobile-first — 60%+ of traffic from mobile in the Indian edtech market

**What fails:**
- Institutional language ("Our Academy", "Our Team") — feels fake for a solo teacher
- Too many menu items — overwhelming for a creator site
- Hidden pricing — visitors want to see course prices without clicking through
- Stock photos instead of the teacher's actual photo — destroys trust
- No clear CTA above the fold

---

## 3. Section Type Gap Analysis

### 3.1 Existing Section Types (Phase 13A)

| Section Type | Usable for Teacher Templates? | Notes |
|---|---|---|
| `hero` | **Yes** — core section | Works perfectly. Teacher photo + headline + CTA |
| `about` | **Partially** | Current schema has `mission_text` which is institutional language. Usable but the default content must be rewritten for a personal context |
| `features` | **Yes** | Repurposed as "What You'll Learn" or "Why Learn From Me" — icon + title + description grid |
| `courses` | **Yes** — critical section | Dynamic course catalog. This is the revenue engine of the page |
| `stats` | **Yes** | "500+ Students", "10 Courses", "2000+ Enrollments" — powerful social proof |
| `testimonials` | **Yes** — critical section | Student testimonials build trust. Essential for solo teachers |
| `faq` | **Yes** | "How do I access courses?", "Is there a refund policy?", "Can I get a certificate?" |
| `contact` | **Yes** | Simplified — email, social links, lead form. No address/phone for solo teachers |

### 3.2 New Section Type Required: `credentials`

The existing section types do NOT adequately cover the teacher's professional background. The `about` section handles a general bio, but a standalone teacher needs a dedicated **credentials/qualifications** section that communicates authority and trust. This is the "Why should I trust this person?" section.

**New Section Type: `credentials`**

| Field | Type | Purpose |
|---|---|---|
| `title` | string | Section heading (default: "My Background") |
| `subtitle` | string | Optional subtitle |
| `bio_text` | string (rich text) | 2-3 paragraph professional bio |
| `photo_url` | string | Teacher's professional photo |
| `highlights[]` | array of objects | Key achievements/credentials |
| `highlights[].icon` | string | Icon identifier |
| `highlights[].label` | string | e.g. "10+ Years Teaching" |
| `highlights[].description` | string | Brief elaboration |
| `social_links[]` | array of objects | Social media / professional links |
| `social_links[].platform` | string | `youtube`, `linkedin`, `twitter`, `instagram`, `website` |
| `social_links[].url` | string | Profile URL |

**Why a new section type and not reusing `about`:** The `about` section has a `mission_text` field designed for institutional mission statements. The `credentials` section serves a fundamentally different purpose — it establishes personal authority through achievements, qualifications, experience years, and social proof links. Trying to shoehorn both purposes into `about` would require the tenant to mentally translate "mission_text" into "professional bio," which creates a confusing editing experience.

**Implementation cost:** Per Phase 13A §4.1, adding a new section type requires: (1) content schema definition, (2) React rendering component, (3) tenant editing form, (4) Super Admin configuration form, (5) registration in `SectionType` value object. No database migration needed.

---

## 4. Template 1: "Educator Pro"

### 4.1 Design Philosophy

**Keyword: Authority.** This template is for the established educator — someone with years of experience, credentials, and student success stories. Think: a UPSC mentor with 500+ selections, an IELTS coach with a 8.5 band score, a CA teacher with 15 years of experience. The design is clean, professional, and confidence-inspiring. Muted color palette with a strong accent color. Large whitespace. Typography-driven.

**Visual reference:** Think of a hybrid between a LinkedIn profile's authority feel and a Teachable sales page's conversion focus.

### 4.2 Color Palette (Default — overridable by tenant)

```json
{
  "primary": "#1E293B",
  "secondary": "#475569",
  "accent": "#2563EB",
  "background": "#FFFFFF",
  "surface": "#F8FAFC",
  "text_primary": "#0F172A",
  "text_secondary": "#64748B"
}
```

Deep slate tones with a blue accent. Professional, trustworthy, gender-neutral.

### 4.3 Section Layout (Top to Bottom)

**Section 1: `hero`**

- **Layout:** Split — teacher photo on the right (large, professional headshot), text on the left
- **Default content:**
  - Headline: `"Master [Your Subject] with Confidence"`
  - Subheadline: `"Learn from an educator who has helped 500+ students achieve their goals. Structured courses, live classes, and personal attention."`
  - CTA: `"Browse Courses"` → scrolls to courses section
  - Background: Subtle gradient from white to light slate (`#F8FAFC`)
- **Mobile:** Photo stacks above text. CTA becomes full-width button.
- **Design notes:** No background video for this template — keeps it clean. The teacher's photo IS the visual element.

**Section 2: `stats`**

- **Layout:** Horizontal bar with 3-4 stat counters, centered, on a contrasting background (`#1E293B` dark)
- **Default metrics:**
  - `total_students` → "Students Taught"
  - `total_courses` → "Courses Available"
  - `total_enrollments` → "Enrollments"
- **Design notes:** White text on dark background. Animated count-up on scroll (if supported by renderer). This section is narrow — 80px vertical padding max. It's a trust band, not a feature section.

**Section 3: `credentials` (NEW)**

- **Layout:** Two-column — photo on left, bio + highlights on right
- **Default content:**
  - Title: `"About Me"`
  - Bio: `"I am [Name], a [subject] educator with [X] years of experience. I believe in making complex topics simple and accessible. My teaching approach focuses on [methodology]. I've helped students from [backgrounds] achieve [outcomes]."`
  - Highlights (4 items):
    - "10+ Years Experience" (icon: `briefcase`)
    - "500+ Students Mentored" (icon: `users`)
    - "Published Author" (icon: `book-open`)
    - "Available for Live Sessions" (icon: `video`)
  - Social links: YouTube, LinkedIn (empty URLs — tenant fills in)
- **Mobile:** Photo stacks above bio. Highlights become a 2×2 grid.

**Section 4: `features`**

- **Layout:** 3-column grid of cards with icons
- **Repurposed as:** "Why Learn From Me"
- **Default content:**
  - Title: `"Why Learn From Me"`
  - Items:
    - Icon: `play-circle` | Title: `"Structured Video Courses"` | Desc: `"Well-organized courses with clear learning paths, from fundamentals to advanced topics."`
    - Icon: `video` | Title: `"Live Interactive Classes"` | Desc: `"Regular live sessions where you can ask questions and get real-time guidance."`
    - Icon: `file-text` | Title: `"Practice Materials & Quizzes"` | Desc: `"Comprehensive study materials, practice tests, and assessments to reinforce your learning."`
    - Icon: `award` | Title: `"Completion Certificates"` | Desc: `"Earn verifiable certificates upon completing each course to showcase your skills."`

**Section 5: `courses`**

- **Layout:** Grid — 3 columns desktop, 2 tablet, 1 mobile. Course cards with thumbnail, title, price, rating, and "Enroll Now" CTA
- **Default content:**
  - Title: `"My Courses"`
  - Subtitle: `"Start your learning journey today"`
  - Max display: 6
  - Sort: newest
- **Design notes:** This is the revenue section. Each course card must have a clear price tag and a prominent CTA button. If the course is free, show "Free" badge instead of price. The entire card should be clickable.

**Section 6: `testimonials`**

- **Layout:** Carousel or stacked cards — 2 visible at a time on desktop, 1 on mobile
- **Default content:**
  - Title: `"What My Students Say"`
  - 3 placeholder testimonials:
    - Name: `"Student Name"` | Role: `"Course Name"` | Quote: `"This course completely transformed my understanding of the subject. The teaching style is clear and the content is well-structured."` | Avatar: placeholder
    - Name: `"Student Name"` | Role: `"Course Name"` | Quote: `"The live sessions were incredibly helpful. Being able to ask questions directly made all the difference."` | Avatar: placeholder
    - Name: `"Student Name"` | Role: `"Course Name"` | Quote: `"I tried many online courses before, but this was the first time I actually completed one and felt confident about the material."` | Avatar: placeholder
- **Design notes:** Light background. Large quotation marks as decorative element. Stars or rating indicators optional.

**Section 7: `faq`**

- **Layout:** Accordion — single column, centered, max-width 720px
- **Default content:**
  - Title: `"Frequently Asked Questions"`
  - Items:
    - Q: `"How do I access the courses after purchase?"` | A: `"Once you complete the payment, you'll receive instant access. Simply log in to your account and start learning."`
    - Q: `"Are the courses self-paced or scheduled?"` | A: `"Most courses are self-paced — you can learn at your own speed. Live sessions are scheduled and you'll be notified in advance."`
    - Q: `"Do I get a certificate?"` | A: `"Yes, you receive a verifiable completion certificate after finishing each course."`
    - Q: `"What if I have questions during the course?"` | A: `"You can ask questions during live sessions. For self-paced courses, submit your doubts through the assignment system and I'll respond personally."`
    - Q: `"Is there a refund policy?"` | A: `"Please check the specific course page for refund terms. Most courses offer a satisfaction guarantee within the first 7 days."`

**Section 8: `contact`**

- **Layout:** Centered, minimal — email + social icons + optional lead form
- **Default content:**
  - Title: `"Get In Touch"`
  - Subtitle: `"Have a question? Want to discuss a course? Reach out."`
  - Show address: false
  - Show phone: false
  - Show email: true
  - Show lead form: true
  - Lead form config: Name + Email + Message fields
- **Design notes:** Dark background (`#1E293B`) with light text. Feels like a footer section. Social icons row below the form.

---

## 5. Template 2: "Creator Studio"

### 5.1 Design Philosophy

**Keyword: Energy.** This template is for the dynamic, younger educator — a coding bootcamp instructor, a digital marketing teacher, a creative arts coach. Someone whose brand is vibrant, modern, and content-driven. Think: a YouTube educator who now sells structured courses. Bold colors, gradient accents, slightly more playful than Educator Pro. Card-heavy layout with visual emphasis on course thumbnails and video previews.

**Visual reference:** Think of a hybrid between a Dribbble portfolio and a Graphy course catalog.

### 5.2 Color Palette (Default — overridable by tenant)

```json
{
  "primary": "#7C3AED",
  "secondary": "#A78BFA",
  "accent": "#F59E0B",
  "background": "#0F172A",
  "surface": "#1E293B",
  "text_primary": "#F1F5F9",
  "text_secondary": "#94A3B8"
}
```

Dark mode by default. Purple-to-amber gradient accents. Modern, tech-forward, creator-native feel.

### 5.3 Section Layout (Top to Bottom)

**Section 1: `hero`**

- **Layout:** Full-width with background video or gradient overlay. Teacher photo as a circular cutout floating over the background. Text centered.
- **Default content:**
  - Headline: `"Learn [Subject] the Right Way"`
  - Subheadline: `"Practical, project-based courses designed by an industry practitioner. No fluff, just skills that get you hired."`
  - CTA: `"Explore Courses"` → scrolls to courses section
  - Background: Gradient from `#7C3AED` to `#1E293B` (or background video if teacher uploads one)
- **Mobile:** Circular photo shrinks. Text remains centered. CTA full-width.
- **Design notes:** This hero is bolder than Educator Pro. The gradient background makes the page feel premium even without a professional photoshoot.

**Section 2: `credentials` (NEW)**

- **Layout:** Single column, centered. Large circular photo above, bio text below, credential highlights as pill-shaped badges in a horizontal wrap
- **Default content:**
  - Title: `"Hey, I'm [Your Name]"` (casual, first-person)
  - Bio: `"I've spent [X] years building [things/teaching subject]. Now I package everything I know into structured courses so you can learn without the trial-and-error I went through. I believe in learning by doing — every course includes hands-on projects and real-world exercises."`
  - Highlights (4 items, displayed as horizontal pills/badges):
    - "Industry Professional" (icon: `code`)
    - "1000+ Students" (icon: `users`)
    - "YouTube Educator" (icon: `youtube`)
    - "Live Mentorship" (icon: `message-circle`)
  - Social links: YouTube, Twitter/X, LinkedIn, Instagram
- **Design notes:** The tone is deliberately casual — "Hey, I'm..." not "About Our Founder." Pill badges use the accent color (`#F59E0B`) on dark background. Social links are icon buttons with hover glow effect.

**Section 3: `courses`**

- **Layout:** Large cards — 2 columns desktop, 1 mobile. Each card is tall with a large thumbnail (16:9), course title, short description, price, student count badge, and "Start Learning" CTA button
- **Default content:**
  - Title: `"What I Teach"`
  - Subtitle: `"Pick a course and start building skills today"`
  - Max display: 4
  - Sort: popular
- **Design notes:** This template puts courses HIGHER than Educator Pro — for a creator, the content IS the brand. Cards have a subtle border glow on hover (using accent color). Price is displayed prominently. Free courses show a gradient "FREE" badge.

**Section 4: `stats`**

- **Layout:** Horizontal strip with gradient background (`#7C3AED` → `#2563EB`). 3 stats with large numbers and small labels.
- **Default metrics:**
  - `total_students` → "Learners"
  - `total_courses` → "Courses"
  - `total_enrollments` → "Enrollments"
- **Design notes:** Animated count-up. Compact section — functions as a trust divider between courses and testimonials.

**Section 5: `features`**

- **Repurposed as:** "How My Courses Work"
- **Layout:** 4 items in a horizontal timeline/step flow — numbered circles connected by a line
- **Default content:**
  - Title: `"How It Works"`
  - Items:
    - Icon: `search` | Title: `"Browse & Pick"` | Desc: `"Choose a course that matches your goals and current skill level."`
    - Icon: `credit-card` | Title: `"Enroll Instantly"` | Desc: `"Secure payment. Instant access. No waiting period."`
    - Icon: `play` | Title: `"Learn at Your Pace"` | Desc: `"Watch videos, complete exercises, and attend live sessions on your schedule."`
    - Icon: `award` | Title: `"Earn Your Certificate"` | Desc: `"Complete the course and receive a verifiable certificate."`
- **Design notes:** This section is styled differently from Template 1's features grid. The step/timeline layout communicates process, reducing "what happens after I pay?" anxiety. On mobile, steps stack vertically.

**Section 6: `testimonials`**

- **Layout:** Card grid — 3 columns, each card has a gradient left border, quote text, student name, and course taken
- **Default content:**
  - Title: `"From My Students"`
  - 3 placeholder testimonials (similar to Template 1 but with more outcome-focused language):
    - Quote: `"I went from zero coding knowledge to building my own portfolio website in 6 weeks. The project-based approach made everything click."`
    - Quote: `"The live sessions are gold. Being able to code alongside the instructor and get real-time feedback accelerated my learning massively."`
    - Quote: `"Best investment I've made in my career. The course content is up-to-date and practical — not theoretical textbook stuff."`
- **Design notes:** Cards on dark surface color (`#1E293B`). Gradient border uses primary → accent. Testimonials feel like social media endorsements — short, punchy, outcome-focused.

**Section 7: `faq`**

- **Layout:** Two-column accordion — questions split into left and right columns on desktop, single stack on mobile
- **Default content:** Same questions as Template 1 (universal for course sellers)

**Section 8: `contact`**

- **Layout:** Split — left side has heading + social links as large icon buttons, right side has lead form
- **Default content:**
  - Title: `"Let's Connect"`
  - Subtitle: `"DM me, email me, or drop a message below"`
  - Show address: false
  - Show phone: false
  - Show email: true
  - Show lead form: true
- **Design notes:** Social icons are large (48px) with brand colors per platform (YouTube red, LinkedIn blue, etc.). Lead form has a gradient submit button.

---

## 6. Implementation Requirements

### 6.1 New Section Type: `credentials`

This is the only code change required. Everything else is Super Admin content operations within the existing template system.

**Backend (Laravel):**
1. Add `credentials` to the `SectionType` value object (Domain/Shared/ValueObjects/)
2. Define the JSON validation schema for the `credentials` content structure
3. Register in the section type registry

**Frontend (Next.js):**
1. Create `CredentialsSection` React component in `features/website/components/public-renderer/`
2. Create the Super Admin configuration form for the `credentials` section type
3. Create the Tenant Admin editing form for the `credentials` section type
4. Register in the section component registry (`section-registry.ts`)

**Estimated effort for `credentials` section type:** 0.5–1 day.

### 6.2 Template Creation (Super Admin Operations)

After the `credentials` section type is deployed, the Super Admin creates both templates through the existing template management UI. No developer involvement required for template content.

**However:** The Super Admin will need design guidance. This document serves as that guidance. The section layouts, default content, and color palettes defined above should be followed exactly.

### 6.3 Template Category

Both templates should be assigned to a new template category: **"Teacher / Creator"** (or "Personal Brand" — Super Admin's choice). This category must be seeded if it doesn't exist.

Check the existing `landing_page_template_categories` table. If a teacher/creator category doesn't exist, add it via seeder or direct insertion.

### 6.4 Rendering Differences Between Templates

Both templates use the same 8 section types (7 existing + 1 new `credentials`). The visual differences come from:

1. **Color palette** — set via `color_overrides` on the template's default content
2. **Section ordering** — different `sort_order` for each template
3. **Default content text** — professional tone (Educator Pro) vs. casual tone (Creator Studio)
4. **Section visibility defaults** — both templates show all sections by default

The PublicRenderer must already support dark-mode templates (Creator Studio's dark background). If the current renderer assumes a light background, the following must be verified:

- Text color adapts to background luminance (or is driven by the `text_primary` color override)
- Course cards, FAQ accordions, and form inputs are readable on dark backgrounds
- The `color_overrides` JSON on the template is respected by all section components

If dark mode support is not yet in the renderer, this becomes a development task (estimated 1-2 days for the frontend).

---

## 7. Section Order Comparison

| Position | Educator Pro | Creator Studio |
|---|---|---|
| 1 | Hero (split layout, light) | Hero (centered, dark with gradient) |
| 2 | Stats (dark band) | Credentials (casual, centered) |
| 3 | Credentials (two-column) | Courses (large cards, prominent) |
| 4 | Features ("Why Learn From Me") | Stats (gradient strip) |
| 5 | Courses (grid) | Features ("How It Works" timeline) |
| 6 | Testimonials (carousel) | Testimonials (card grid) |
| 7 | FAQ (accordion) | FAQ (two-column accordion) |
| 8 | Contact (dark footer) | Contact (split layout) |

The key difference: **Educator Pro** leads with authority (stats → credentials → why me → then courses). **Creator Studio** leads with content (credentials → courses → then social proof). This reflects two different selling strategies — trust-first vs. product-first.

---

## 8. Mobile Responsiveness Requirements

Both templates MUST be fully responsive. The Indian edtech market sees 60-70% mobile traffic.

**Critical mobile behaviors:**
- Hero section: Photo stacks above text. CTA is full-width.
- Stats: Horizontal scroll or 2×2 grid (never stacked vertically — looks broken)
- Credentials highlights: 2×2 grid on mobile
- Courses: Single column, swipeable on mobile
- Testimonials: Single card, swipeable
- FAQ: Always single column
- Contact form: Full-width inputs, large touch targets

**Performance target:** First Contentful Paint under 2 seconds on 4G mobile (aligned with ISR caching from Phase 13A).

---

## 9. SEO Default Content

Each template should include sensible SEO defaults that the teacher overwrites:

| Field | Educator Pro Default | Creator Studio Default |
|---|---|---|
| Meta Title | `"[Teacher Name] — [Subject] Courses Online"` | `"Learn [Subject] with [Teacher Name]"` |
| Meta Description | `"Expert-led [subject] courses by [name]. Structured learning, live classes, and certificates. Join 500+ students."` | `"Practical, project-based [subject] courses. Learn by doing. Join [name]'s learning community."` |
| OG Image | Teacher's hero photo (if uploaded) | Template gradient background with text overlay |

---

## 10. Quality Checklist

Before publishing either template to the catalog:

- [ ] All 8 sections render correctly on desktop (1440px), tablet (768px), and mobile (375px)
- [ ] Dark mode template (Creator Studio) — all text is readable, no white-on-white or dark-on-dark
- [ ] Course cards display prices correctly in both INR and AED/SAR (GCC tenants)
- [ ] Stats section renders live data when a tenant has courses/students/enrollments
- [ ] Stats section shows "0" gracefully when a tenant has no data yet (not broken UI)
- [ ] Lead form submissions in the contact section are captured by the existing lead system
- [ ] Color overrides applied by tenant are respected across all sections
- [ ] Social links in the `credentials` section open in new tabs
- [ ] No XSS possible in any text field (bio, testimonial quotes, FAQ answers)
- [ ] Template preview in Super Admin dashboard matches public rendering exactly
- [ ] ISR caching works — page loads are sub-2-second on repeat visits
- [ ] Template is assigned to the "Teacher / Creator" category
- [ ] Template slug is meaningful (`educator-pro`, `creator-studio`)

---

## 11. File Manifest

### New Files (Code — `credentials` section type only)

| # | Path | Purpose |
|---|---|---|
| 1 | Backend: `SectionType` value object update | Add `credentials` case |
| 2 | Backend: Validation schema for `credentials` content JSON | Content structure rules |
| 3 | Frontend: `CredentialsSection.tsx` | Public renderer component |
| 4 | Frontend: `CredentialsSectionEditor.tsx` | Tenant admin editing form |
| 5 | Frontend: `CredentialsSectionConfig.tsx` | Super Admin configuration form |
| 6 | Frontend: `section-registry.ts` update | Register `credentials` component |

### No New Files (Content — Super Admin operations)

Template creation, section assembly, and default content configuration are performed through the existing template management UI. No developer file creation needed for the templates themselves.

---

## 12. Dependency Chain

```
1. Deploy `credentials` section type (code change — ~1 day)
     ↓
2. Seed "Teacher / Creator" template category (if needed — seeder or manual)
     ↓
3. Super Admin creates "Educator Pro" template using this document as spec
     ↓
4. Super Admin creates "Creator Studio" template using this document as spec
     ↓
5. Both templates published to catalog
     ↓
6. Standalone teacher tenants can clone and customize
```

Steps 3-6 are operational, not development tasks. The only blocking development work is Step 1.

---

*End of Document — UBOTZ 2.0 Teacher Landing Page Templates Specification — March 29, 2026*
