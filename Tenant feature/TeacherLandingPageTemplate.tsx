'use client';

/**
 * TeacherLandingPageTemplate.tsx
 *
 * UBOTZ 2.0 — Phase 13A Public Renderer
 * Template Slug : educator-pro
 * Category      : standalone_teacher
 * Author        : Principal Engineer / Architecture Auditor
 *
 * ─── FONT SETUP ────────────────────────────────────────────────────────────────
 * Add to app/layout.tsx (or the public layout that wraps tenant public pages):
 *
 *   import { Playfair_Display, DM_Sans } from 'next/font/google';
 *   const playfair = Playfair_Display({
 *     subsets: ['latin'],
 *     variable: '--font-display',
 *     display: 'swap',
 *   });
 *   const dmSans = DM_Sans({
 *     subsets: ['latin'],
 *     variable: '--font-body',
 *     display: 'swap',
 *   });
 *   // Apply both variables to <html> className
 *
 * ─── INTEGRATION NOTES FOR ANTIGRAVITY ─────────────────────────────────────────
 * • [LIVE DATA] props are populated by server-side fetch in the ISR page before
 *   this component is rendered. See Phase 13A §7.3 Public Endpoints.
 * • All monetary amounts are in the SMALLEST currency unit (paisa / fils).
 * • leadFormApiEndpoint → /api/public/{tenantSlug}/lead-forms  (Phase 13A §7.3)
 * • This component is 'use client' because FAQ accordion and the contact form
 *   require client-side state. If you want RSC+ISR for the rest of the page,
 *   extract <FaqSection> and <ContactSection> as separate client island files.
 * • No dangerouslySetInnerHTML is used anywhere in this file.
 */

import React, { useState, useCallback, useId } from 'react';
import Image from 'next/image';
import Link from 'next/link';

// ─────────────────────────────────────────────────────────────────────────────
// TYPE DEFINITIONS  — mirrors Phase 13A section content JSON schemas
// ─────────────────────────────────────────────────────────────────────────────

export type SocialPlatform = 'twitter' | 'linkedin' | 'youtube' | 'instagram';

export interface NavItem {
  label: string;
  href: string;
  isExternal?: boolean;
}

export interface HeroContent {
  teacherName: string;
  /** e.g. "Physics Teacher & Online Educator" */
  title: string;
  tagline: string;
  photoUrl: string;
  photoAlt: string;
  ctaPrimaryLabel: string;
  ctaPrimaryHref: string;
  ctaSecondaryLabel: string;
  ctaSecondaryHref: string;
  socialLinks: Array<{ platform: SocialPlatform; url: string }>;
}

export interface AboutContent {
  sectionLabel: string;
  headline: string;
  /** Plain text. Use \n to separate paragraphs. */
  bio: string;
  photoUrl: string;
  photoAlt: string;
  /** Displayed as a pull-quote / philosophy statement. */
  teachingPhilosophy: string;
}

export type CredentialType = 'degree' | 'certification' | 'award' | 'institution';

export interface Credential {
  type: CredentialType;
  title: string;
  issuer: string;
  year: string;
}

export interface CredentialsContent {
  sectionLabel: string;
  headline: string;
  items: Credential[];
}

export type StatIcon = 'students' | 'courses' | 'years' | 'rating' | 'enrollments';

export interface StatItem {
  /** [LIVE DATA] — resolved by public stats API for live metrics */
  value: string | number;
  label: string;
  icon: StatIcon;
}

export interface StatsContent {
  items: StatItem[];
}

export interface CourseCard {
  id: string;
  title: string;
  thumbnailUrl: string;
  /** In smallest currency unit (paisa / fils). Ignored when isFree is true. */
  priceInSmallestUnit: number;
  currency: 'INR' | 'AED' | 'SAR';
  isFree: boolean;
  enrollmentCount: number;
  slug: string;
  level?: 'Beginner' | 'Intermediate' | 'Advanced';
}

export interface CoursesContent {
  sectionLabel: string;
  headline: string;
  subtitle: string;
  viewAllHref: string;
  /** [LIVE DATA] — injected by server-side fetch from published courses */
  courses: CourseCard[];
}

export interface BlogPost {
  id: string;
  title: string;
  excerpt: string;
  thumbnailUrl: string;
  /** ISO 8601 date string */
  publishedAt: string;
  slug: string;
  readTimeMinutes: number;
}

export interface BlogPreviewContent {
  sectionLabel: string;
  headline: string;
  viewAllHref: string;
  /** [LIVE DATA] — max 3, injected by server-side fetch from published posts */
  posts: BlogPost[];
}

export interface Testimonial {
  name: string;
  role: string;
  courseName: string;
  quote: string;
  avatarUrl?: string;
  rating: 1 | 2 | 3 | 4 | 5;
}

export interface TestimonialsContent {
  sectionLabel: string;
  headline: string;
  items: Testimonial[];
}

export interface FaqItem {
  question: string;
  answer: string;
}

export interface FaqContent {
  sectionLabel: string;
  headline: string;
  items: FaqItem[];
}

export interface ContactContent {
  sectionLabel: string;
  headline: string;
  subtitle: string;
  showEmail: boolean;
  email?: string;
  showPhone: boolean;
  phone?: string;
  showAddress: boolean;
  address?: string;
  /** Phase 13A §7.3 — /api/public/{tenantSlug}/lead-forms */
  leadFormApiEndpoint: string;
}

// ─── Master props ──────────────────────────────────────────────────────────────

export interface TeacherLandingPageProps {
  tenantName: string;
  tenantSlug: string;
  logoUrl?: string;
  navigation: NavItem[];
  hero: HeroContent;
  stats: StatsContent;
  about: AboutContent;
  credentials: CredentialsContent;
  courses: CoursesContent;
  blogPreview: BlogPreviewContent;
  testimonials: TestimonialsContent;
  faq: FaqContent;
  contact: ContactContent;
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function formatPrice(amountInSmallestUnit: number, currency: 'INR' | 'AED' | 'SAR'): string {
  const amount = amountInSmallestUnit / 100;
  const localeMap: Record<string, string> = { INR: 'en-IN', AED: 'en-AE', SAR: 'ar-SA' };
  return new Intl.NumberFormat(localeMap[currency] ?? 'en-IN', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDate(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function splitBio(bio: string): string[] {
  return bio.split('\n').filter((p) => p.trim().length > 0);
}

// ─────────────────────────────────────────────────────────────────────────────
// INLINE SVG ICONS  — self-contained, no external icon library dependency
// ─────────────────────────────────────────────────────────────────────────────

const IconStudents = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

const IconCourses = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
    <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
    <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
  </svg>
);

const IconYears = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
  </svg>
);

const IconRating = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
  </svg>
);

const IconEnrollments = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
  </svg>
);

const IconStar = ({ filled }: { filled: boolean }) => (
  <svg viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={1.75} className="w-4 h-4">
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
  </svg>
);

const IconChevronDown = ({ open }: { open: boolean }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={`w-5 h-5 transition-transform duration-300 ${open ? 'rotate-180' : ''}`}>
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

const IconMenu = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
    <line x1="3" y1="6" x2="21" y2="6" />
    <line x1="3" y1="12" x2="21" y2="12" />
    <line x1="3" y1="18" x2="21" y2="18" />
  </svg>
);

const IconClose = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const IconEmail = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
    <polyline points="22,6 12,13 2,6" />
  </svg>
);

const IconPhone = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.42 2 2 0 0 1 3.58 1.25h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.8a16 16 0 0 0 6 6l.92-.92a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
  </svg>
);

const IconLocation = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
    <circle cx="12" cy="10" r="3" />
  </svg>
);

const IconClock = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </svg>
);

const IconArrowRight = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
    <line x1="5" y1="12" x2="19" y2="12" />
    <polyline points="12 5 19 12 12 19" />
  </svg>
);

const SocialIcon = ({ platform }: { platform: SocialPlatform }) => {
  if (platform === 'twitter') return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
  if (platform === 'linkedin') return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
    </svg>
  );
  if (platform === 'youtube') return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
    </svg>
  );
  // instagram
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z" />
    </svg>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// CREDENTIAL TYPE CONFIG
// ─────────────────────────────────────────────────────────────────────────────

const CREDENTIAL_CONFIG: Record<CredentialType, { label: string; bgClass: string; textClass: string }> = {
  degree:        { label: 'Degree',        bgClass: 'bg-blue-50',   textClass: 'text-blue-700' },
  certification: { label: 'Certification', bgClass: 'bg-emerald-50', textClass: 'text-emerald-700' },
  award:         { label: 'Award',         bgClass: 'bg-amber-50',  textClass: 'text-amber-700' },
  institution:   { label: 'Institution',   bgClass: 'bg-purple-50', textClass: 'text-purple-700' },
};

const STAT_ICON_MAP: Record<StatIcon, React.FC> = {
  students:    IconStudents,
  courses:     IconCourses,
  years:       IconYears,
  rating:      IconRating,
  enrollments: IconEnrollments,
};

// ─────────────────────────────────────────────────────────────────────────────
// NAVBAR
// ─────────────────────────────────────────────────────────────────────────────

function Navbar({
  tenantName,
  logoUrl,
  navigation,
  ctaLabel,
  ctaHref,
}: {
  tenantName: string;
  logoUrl?: string;
  navigation: NavItem[];
  ctaLabel: string;
  ctaHref: string;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 bg-white border-b border-stone-100 shadow-sm">
      <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 shrink-0">
          {logoUrl ? (
            <Image src={logoUrl} alt={tenantName} width={36} height={36} className="rounded-lg object-cover" />
          ) : (
            <span className="w-9 h-9 rounded-lg bg-amber-500 flex items-center justify-center text-white font-bold text-sm" style={{ fontFamily: 'var(--font-display, Georgia, serif)' }}>
              {tenantName.charAt(0).toUpperCase()}
            </span>
          )}
          <span className="font-semibold text-stone-900 text-base hidden sm:block" style={{ fontFamily: 'var(--font-display, Georgia, serif)' }}>
            {tenantName}
          </span>
        </Link>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-8">
          {navigation.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              target={item.isExternal ? '_blank' : undefined}
              rel={item.isExternal ? 'noopener noreferrer' : undefined}
              className="text-sm font-medium text-stone-600 hover:text-amber-600 transition-colors duration-200"
            >
              {item.label}
            </Link>
          ))}
        </div>

        {/* Desktop CTA */}
        <Link
          href={ctaHref}
          className="hidden md:inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold transition-colors duration-200"
        >
          {ctaLabel}
        </Link>

        {/* Mobile hamburger */}
        <button
          onClick={() => setMobileOpen((prev) => !prev)}
          className="md:hidden p-2 rounded-lg text-stone-600 hover:bg-stone-100 transition-colors"
          aria-label="Toggle navigation"
        >
          {mobileOpen ? <IconClose /> : <IconMenu />}
        </button>
      </nav>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="md:hidden border-t border-stone-100 bg-white px-4 py-4 flex flex-col gap-4">
          {navigation.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              className="text-base font-medium text-stone-700 hover:text-amber-600 transition-colors"
            >
              {item.label}
            </Link>
          ))}
          <Link
            href={ctaHref}
            onClick={() => setMobileOpen(false)}
            className="mt-2 inline-flex justify-center items-center px-5 py-3 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold transition-colors"
          >
            {ctaLabel}
          </Link>
        </div>
      )}
    </header>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// HERO SECTION
// ─────────────────────────────────────────────────────────────────────────────

function HeroSection({ hero }: { hero: HeroContent }) {
  return (
    <section className="relative bg-stone-50 overflow-hidden">
      {/* Subtle dot-grid background */}
      <div
        className="absolute inset-0 opacity-30"
        style={{
          backgroundImage: 'radial-gradient(circle, #d6d3d1 1px, transparent 1px)',
          backgroundSize: '28px 28px',
        }}
      />
      {/* Amber blob */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-amber-100 rounded-full blur-3xl opacity-50 translate-x-1/3 -translate-y-1/4 pointer-events-none" />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 lg:py-28">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">

          {/* Left — Content */}
          <div className="flex flex-col gap-6">
            <span className="inline-flex w-fit items-center gap-2 px-3 py-1.5 rounded-full bg-amber-100 text-amber-700 text-xs font-semibold tracking-wide uppercase">
              ✦ {hero.title}
            </span>

            <h1
              className="text-4xl sm:text-5xl lg:text-6xl font-bold text-stone-900 leading-tight"
              style={{ fontFamily: 'var(--font-display, Georgia, serif)' }}
            >
              Hi, I&apos;m{' '}
              <span className="text-amber-500">{hero.teacherName}</span>
            </h1>

            <p className="text-lg text-stone-600 leading-relaxed max-w-lg" style={{ fontFamily: 'var(--font-body, system-ui, sans-serif)' }}>
              {hero.tagline}
            </p>

            <div className="flex flex-wrap gap-3">
              <Link
                href={hero.ctaPrimaryHref}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-semibold text-sm transition-all duration-200 shadow-lg shadow-amber-200"
              >
                {hero.ctaPrimaryLabel}
                <IconArrowRight />
              </Link>
              <Link
                href={hero.ctaSecondaryHref}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl border-2 border-stone-300 hover:border-amber-400 text-stone-700 hover:text-amber-600 font-semibold text-sm transition-all duration-200"
              >
                {hero.ctaSecondaryLabel}
              </Link>
            </div>

            {/* Social links */}
            {hero.socialLinks.length > 0 && (
              <div className="flex items-center gap-4 pt-2">
                <span className="text-xs text-stone-400 font-medium uppercase tracking-wide">Follow me</span>
                <div className="flex items-center gap-3">
                  {hero.socialLinks.map(({ platform, url }) => (
                    <a
                      key={platform}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-9 h-9 rounded-lg flex items-center justify-center text-stone-400 hover:text-amber-600 hover:bg-amber-50 transition-all duration-200"
                      aria-label={platform}
                    >
                      <SocialIcon platform={platform} />
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right — Photo */}
          <div className="relative flex justify-center lg:justify-end">
            {/* Decorative amber square behind photo */}
            <div className="absolute top-6 right-6 w-64 h-64 lg:w-80 lg:h-80 rounded-3xl bg-amber-400 opacity-20" />
            <div className="relative w-64 h-64 sm:w-72 sm:h-72 lg:w-96 lg:h-96 rounded-3xl overflow-hidden border-4 border-white shadow-2xl">
              <Image
                src={hero.photoUrl}
                alt={hero.photoAlt}
                fill
                className="object-cover"
                sizes="(max-width: 1024px) 18rem, 24rem"
                priority
              />
            </div>
            {/* Floating badge */}
            <div className="absolute bottom-4 left-4 sm:left-auto sm:right-4 lg:left-4 bg-white rounded-2xl px-4 py-3 shadow-xl flex items-center gap-3 border border-stone-100">
              <span className="text-2xl">🎓</span>
              <div>
                <p className="text-xs text-stone-500 font-medium">Verified Educator</p>
                <p className="text-sm font-bold text-stone-900" style={{ fontFamily: 'var(--font-display, Georgia, serif)' }}>EducoreOS</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// STATS SECTION
// ─────────────────────────────────────────────────────────────────────────────

function StatsSection({ stats }: { stats: StatsContent }) {
  return (
    <section className="bg-stone-900 py-14">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className={`grid grid-cols-2 ${stats.items.length >= 4 ? 'lg:grid-cols-4' : 'lg:grid-cols-3'} gap-8`}>
          {stats.items.map((stat, idx) => {
            const IconComponent = STAT_ICON_MAP[stat.icon];
            return (
              <div key={idx} className="flex flex-col items-center text-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-amber-500 bg-opacity-20 text-amber-400 flex items-center justify-center">
                  <IconComponent />
                </div>
                <p
                  className="text-3xl sm:text-4xl font-bold text-white"
                  style={{ fontFamily: 'var(--font-display, Georgia, serif)' }}
                >
                  {stat.value}
                </p>
                <p className="text-sm text-stone-400 font-medium">{stat.label}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ABOUT SECTION
// ─────────────────────────────────────────────────────────────────────────────

function AboutSection({ about }: { about: AboutContent }) {
  const paragraphs = splitBio(about.bio);

  return (
    <section id="about" className="bg-white py-20 lg:py-28">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-14 items-center">

          {/* Left — Photo with decorative accent */}
          <div className="relative flex justify-center lg:justify-start order-2 lg:order-1">
            <div className="absolute -bottom-4 -left-4 w-56 h-56 bg-amber-400 rounded-3xl opacity-15" />
            <div className="relative w-64 h-80 sm:w-72 sm:h-96 rounded-3xl overflow-hidden shadow-xl border border-stone-100">
              <Image
                src={about.photoUrl}
                alt={about.photoAlt}
                fill
                className="object-cover"
                sizes="(max-width: 1024px) 18rem, 22rem"
              />
            </div>
          </div>

          {/* Right — Content */}
          <div className="flex flex-col gap-6 order-1 lg:order-2">
            <span className="text-xs font-bold text-amber-600 uppercase tracking-widest">{about.sectionLabel}</span>

            <h2
              className="text-3xl sm:text-4xl font-bold text-stone-900 leading-snug"
              style={{ fontFamily: 'var(--font-display, Georgia, serif)' }}
            >
              {about.headline}
            </h2>

            <div className="flex flex-col gap-4">
              {paragraphs.map((para, idx) => (
                <p key={idx} className="text-stone-600 leading-relaxed text-base">
                  {para}
                </p>
              ))}
            </div>

            {/* Philosophy pull-quote */}
            <blockquote className="mt-2 border-l-4 border-amber-400 pl-5 py-1">
              <p
                className="text-stone-800 font-medium italic text-lg leading-snug"
                style={{ fontFamily: 'var(--font-display, Georgia, serif)' }}
              >
                &ldquo;{about.teachingPhilosophy}&rdquo;
              </p>
            </blockquote>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CREDENTIALS SECTION
// ─────────────────────────────────────────────────────────────────────────────

function CredentialsSection({ credentials }: { credentials: CredentialsContent }) {
  return (
    <section id="credentials" className="bg-stone-50 py-20 lg:py-28">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-14">
          <span className="text-xs font-bold text-amber-600 uppercase tracking-widest">{credentials.sectionLabel}</span>
          <h2
            className="mt-3 text-3xl sm:text-4xl font-bold text-stone-900"
            style={{ fontFamily: 'var(--font-display, Georgia, serif)' }}
          >
            {credentials.headline}
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {credentials.items.map((item, idx) => {
            const config = CREDENTIAL_CONFIG[item.type];
            return (
              <div
                key={idx}
                className="bg-white rounded-2xl p-6 border border-stone-100 shadow-sm hover:shadow-md transition-shadow duration-200 flex flex-col gap-3"
              >
                <div className="flex items-center justify-between">
                  <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold ${config.bgClass} ${config.textClass}`}>
                    {config.label}
                  </span>
                  <span className="text-sm font-medium text-stone-400">{item.year}</span>
                </div>

                <h3 className="font-semibold text-stone-900 text-base leading-snug" style={{ fontFamily: 'var(--font-display, Georgia, serif)' }}>
                  {item.title}
                </h3>

                <p className="text-sm text-stone-500 font-medium">{item.issuer}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// COURSES SECTION  — [LIVE DATA]
// ─────────────────────────────────────────────────────────────────────────────

const LEVEL_COLORS: Record<string, string> = {
  Beginner:     'bg-emerald-50 text-emerald-700',
  Intermediate: 'bg-blue-50 text-blue-700',
  Advanced:     'bg-rose-50 text-rose-700',
};

function CoursesSection({ courses, tenantSlug }: { courses: CoursesContent; tenantSlug: string }) {
  if (courses.courses.length === 0) {
    return (
      <section id="courses" className="bg-white py-20">
        <div className="max-w-7xl mx-auto px-4 text-center">
          <span className="text-xs font-bold text-amber-600 uppercase tracking-widest">{courses.sectionLabel}</span>
          <h2 className="mt-3 text-3xl font-bold text-stone-900" style={{ fontFamily: 'var(--font-display, Georgia, serif)' }}>
            {courses.headline}
          </h2>
          <p className="mt-6 text-stone-500">Courses coming soon. Stay tuned!</p>
        </div>
      </section>
    );
  }

  return (
    <section id="courses" className="bg-white py-20 lg:py-28">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-12">
          <div>
            <span className="text-xs font-bold text-amber-600 uppercase tracking-widest">{courses.sectionLabel}</span>
            <h2
              className="mt-3 text-3xl sm:text-4xl font-bold text-stone-900"
              style={{ fontFamily: 'var(--font-display, Georgia, serif)' }}
            >
              {courses.headline}
            </h2>
            <p className="mt-2 text-stone-500 text-base max-w-xl">{courses.subtitle}</p>
          </div>
          <Link
            href={courses.viewAllHref}
            className="shrink-0 inline-flex items-center gap-2 text-sm font-semibold text-amber-600 hover:text-amber-700 transition-colors"
          >
            View All Courses <IconArrowRight />
          </Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {courses.courses.map((course) => (
            <Link
              key={course.id}
              href={`/${tenantSlug}/courses/${course.slug}`}
              className="group bg-white rounded-2xl border border-stone-100 shadow-sm hover:shadow-lg transition-all duration-300 overflow-hidden flex flex-col"
            >
              {/* Thumbnail */}
              <div className="relative w-full h-44 bg-stone-100">
                <Image
                  src={course.thumbnailUrl}
                  alt={course.title}
                  fill
                  className="object-cover group-hover:scale-105 transition-transform duration-500"
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                />
                {course.level && (
                  <span className={`absolute top-3 left-3 px-2.5 py-1 rounded-md text-xs font-semibold ${LEVEL_COLORS[course.level] ?? 'bg-stone-100 text-stone-600'}`}>
                    {course.level}
                  </span>
                )}
              </div>

              {/* Body */}
              <div className="flex flex-col gap-3 p-5 flex-1">
                <h3 className="font-semibold text-stone-900 text-base leading-snug group-hover:text-amber-600 transition-colors" style={{ fontFamily: 'var(--font-display, Georgia, serif)' }}>
                  {course.title}
                </h3>

                <div className="flex items-center justify-between mt-auto pt-3 border-t border-stone-100">
                  <span className="text-sm text-stone-500">
                    {course.enrollmentCount.toLocaleString()} enrolled
                  </span>
                  <span className={`text-base font-bold ${course.isFree ? 'text-emerald-600' : 'text-stone-900'}`}>
                    {course.isFree ? 'Free' : formatPrice(course.priceInSmallestUnit, course.currency)}
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// BLOG PREVIEW SECTION  — [LIVE DATA]
// ─────────────────────────────────────────────────────────────────────────────

function BlogPreviewSection({ blogPreview, tenantSlug }: { blogPreview: BlogPreviewContent; tenantSlug: string }) {
  if (blogPreview.posts.length === 0) {
    return null; // Hide section entirely when no posts — do not render empty state on public page
  }

  return (
    <section id="blog" className="bg-stone-50 py-20 lg:py-28">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-12">
          <div>
            <span className="text-xs font-bold text-amber-600 uppercase tracking-widest">{blogPreview.sectionLabel}</span>
            <h2
              className="mt-3 text-3xl sm:text-4xl font-bold text-stone-900"
              style={{ fontFamily: 'var(--font-display, Georgia, serif)' }}
            >
              {blogPreview.headline}
            </h2>
          </div>
          <Link
            href={blogPreview.viewAllHref}
            className="shrink-0 inline-flex items-center gap-2 text-sm font-semibold text-amber-600 hover:text-amber-700 transition-colors"
          >
            All Articles <IconArrowRight />
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {blogPreview.posts.map((post) => (
            <Link
              key={post.id}
              href={`/${tenantSlug}/blog/${post.slug}`}
              className="group bg-white rounded-2xl border border-stone-100 shadow-sm hover:shadow-lg transition-all duration-300 overflow-hidden flex flex-col"
            >
              {/* Thumbnail */}
              <div className="relative w-full h-44 bg-stone-100">
                <Image
                  src={post.thumbnailUrl}
                  alt={post.title}
                  fill
                  className="object-cover group-hover:scale-105 transition-transform duration-500"
                  sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw"
                />
              </div>

              {/* Body */}
              <div className="flex flex-col gap-3 p-5 flex-1">
                <div className="flex items-center gap-3 text-xs text-stone-400 font-medium">
                  <span>{formatDate(post.publishedAt)}</span>
                  <span className="w-1 h-1 rounded-full bg-stone-300" />
                  <span className="flex items-center gap-1">
                    <IconClock /> {post.readTimeMinutes} min read
                  </span>
                </div>

                <h3 className="font-semibold text-stone-900 text-base leading-snug group-hover:text-amber-600 transition-colors" style={{ fontFamily: 'var(--font-display, Georgia, serif)' }}>
                  {post.title}
                </h3>

                <p className="text-sm text-stone-500 leading-relaxed line-clamp-2">{post.excerpt}</p>

                <div className="mt-auto pt-3 flex items-center gap-1 text-sm font-semibold text-amber-600 group-hover:gap-2 transition-all">
                  Read more <IconArrowRight />
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TESTIMONIALS SECTION
// ─────────────────────────────────────────────────────────────────────────────

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5 text-amber-400">
      {Array.from({ length: 5 }, (_, i) => (
        <IconStar key={i} filled={i < rating} />
      ))}
    </div>
  );
}

function TestimonialsSection({ testimonials }: { testimonials: TestimonialsContent }) {
  return (
    <section className="bg-stone-900 py-20 lg:py-28">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-14">
          <span className="text-xs font-bold text-amber-400 uppercase tracking-widest">{testimonials.sectionLabel}</span>
          <h2
            className="mt-3 text-3xl sm:text-4xl font-bold text-white"
            style={{ fontFamily: 'var(--font-display, Georgia, serif)' }}
          >
            {testimonials.headline}
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {testimonials.items.map((item, idx) => (
            <div key={idx} className="bg-stone-800 rounded-2xl p-6 border border-stone-700 flex flex-col gap-4">
              <StarRating rating={item.rating} />

              <p className="text-stone-300 leading-relaxed text-base italic">
                &ldquo;{item.quote}&rdquo;
              </p>

              <div className="flex items-center gap-3 mt-auto pt-4 border-t border-stone-700">
                {item.avatarUrl ? (
                  <div className="relative w-10 h-10 rounded-full overflow-hidden shrink-0">
                    <Image src={item.avatarUrl} alt={item.name} fill className="object-cover" sizes="40px" />
                  </div>
                ) : (
                  <div className="w-10 h-10 rounded-full bg-amber-500 flex items-center justify-center text-white font-semibold text-sm shrink-0">
                    {item.name.charAt(0).toUpperCase()}
                  </div>
                )}
                <div>
                  <p className="font-semibold text-white text-sm">{item.name}</p>
                  <p className="text-stone-400 text-xs">{item.role} · {item.courseName}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// FAQ SECTION
// ─────────────────────────────────────────────────────────────────────────────

function FaqItem({ item, isOpen, onToggle }: { item: FaqItem; isOpen: boolean; onToggle: () => void }) {
  const id = useId();
  return (
    <div className="border border-stone-200 rounded-2xl overflow-hidden">
      <button
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-controls={id}
        className="w-full flex items-center justify-between px-6 py-5 text-left hover:bg-stone-50 transition-colors duration-200 gap-4"
      >
        <span className="font-semibold text-stone-900 text-base" style={{ fontFamily: 'var(--font-display, Georgia, serif)' }}>
          {item.question}
        </span>
        <span className="shrink-0 text-stone-400">
          <IconChevronDown open={isOpen} />
        </span>
      </button>

      {isOpen && (
        <div id={id} className="px-6 pb-5">
          <p className="text-stone-600 leading-relaxed text-sm">{item.answer}</p>
        </div>
      )}
    </div>
  );
}

function FaqSection({ faq }: { faq: FaqContent }) {
  const [openIdx, setOpenIdx] = useState<number | null>(0);

  const handleToggle = useCallback((idx: number) => {
    setOpenIdx((prev) => (prev === idx ? null : idx));
  }, []);

  return (
    <section id="faq" className="bg-white py-20 lg:py-28">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <span className="text-xs font-bold text-amber-600 uppercase tracking-widest">{faq.sectionLabel}</span>
          <h2
            className="mt-3 text-3xl sm:text-4xl font-bold text-stone-900"
            style={{ fontFamily: 'var(--font-display, Georgia, serif)' }}
          >
            {faq.headline}
          </h2>
        </div>

        <div className="flex flex-col gap-3">
          {faq.items.map((item, idx) => (
            <FaqItem
              key={idx}
              item={item}
              isOpen={openIdx === idx}
              onToggle={() => handleToggle(idx)}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CONTACT SECTION
// ─────────────────────────────────────────────────────────────────────────────

type FormState = 'idle' | 'loading' | 'success' | 'error';

interface LeadFormData {
  name: string;
  email: string;
  phone: string;
  subject: string;
  message: string;
}

const EMPTY_FORM: LeadFormData = { name: '', email: '', phone: '', subject: '', message: '' };

function ContactSection({ contact }: { contact: ContactContent }) {
  const [formData, setFormData] = useState<LeadFormData>(EMPTY_FORM);
  const [formState, setFormState] = useState<FormState>('idle');

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  }, []);

  const handleSubmit = useCallback(async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFormState('loading');
    try {
      const res = await fetch(contact.leadFormApiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setFormState('success');
      setFormData(EMPTY_FORM);
    } catch {
      setFormState('error');
    }
  }, [formData, contact.leadFormApiEndpoint]);

  const inputClass = 'w-full px-4 py-3 rounded-xl border border-stone-200 bg-stone-50 text-stone-900 text-sm placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent transition-all duration-200';
  const labelClass = 'block text-sm font-medium text-stone-700 mb-1.5';

  return (
    <section id="contact" className="bg-stone-50 py-20 lg:py-28">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-14">
          <span className="text-xs font-bold text-amber-600 uppercase tracking-widest">{contact.sectionLabel}</span>
          <h2
            className="mt-3 text-3xl sm:text-4xl font-bold text-stone-900"
            style={{ fontFamily: 'var(--font-display, Georgia, serif)' }}
          >
            {contact.headline}
          </h2>
          <p className="mt-3 text-stone-500 max-w-xl mx-auto">{contact.subtitle}</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-10">

          {/* Contact info — 2/5 */}
          <div className="lg:col-span-2 flex flex-col gap-6">
            <div className="bg-white rounded-2xl p-6 border border-stone-100 shadow-sm flex flex-col gap-5">
              {contact.showEmail && contact.email && (
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                    <IconEmail />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-stone-400 uppercase tracking-wide mb-0.5">Email</p>
                    <a href={`mailto:${contact.email}`} className="text-stone-800 font-medium hover:text-amber-600 transition-colors text-sm break-all">
                      {contact.email}
                    </a>
                  </div>
                </div>
              )}

              {contact.showPhone && contact.phone && (
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                    <IconPhone />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-stone-400 uppercase tracking-wide mb-0.5">Phone</p>
                    <a href={`tel:${contact.phone}`} className="text-stone-800 font-medium hover:text-amber-600 transition-colors text-sm">
                      {contact.phone}
                    </a>
                  </div>
                </div>
              )}

              {contact.showAddress && contact.address && (
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                    <IconLocation />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-stone-400 uppercase tracking-wide mb-0.5">Location</p>
                    <p className="text-stone-800 font-medium text-sm">{contact.address}</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Lead form — 3/5 */}
          <div className="lg:col-span-3 bg-white rounded-2xl p-6 sm:p-8 border border-stone-100 shadow-sm">
            {formState === 'success' ? (
              <div className="flex flex-col items-center justify-center h-full min-h-64 gap-4 text-center py-10">
                <div className="w-16 h-16 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center text-2xl">✓</div>
                <h3 className="text-xl font-bold text-stone-900" style={{ fontFamily: 'var(--font-display, Georgia, serif)' }}>
                  Message Sent!
                </h3>
                <p className="text-stone-500 text-sm max-w-sm">
                  Thank you for reaching out. I&apos;ll get back to you as soon as possible.
                </p>
                <button
                  onClick={() => setFormState('idle')}
                  className="mt-2 text-sm text-amber-600 font-semibold hover:text-amber-700 transition-colors"
                >
                  Send another message
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div>
                    <label htmlFor="contact-name" className={labelClass}>Full Name *</label>
                    <input
                      id="contact-name"
                      name="name"
                      type="text"
                      required
                      value={formData.name}
                      onChange={handleChange}
                      placeholder="Your full name"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label htmlFor="contact-email" className={labelClass}>Email Address *</label>
                    <input
                      id="contact-email"
                      name="email"
                      type="email"
                      required
                      value={formData.email}
                      onChange={handleChange}
                      placeholder="your@email.com"
                      className={inputClass}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div>
                    <label htmlFor="contact-phone" className={labelClass}>Phone Number</label>
                    <input
                      id="contact-phone"
                      name="phone"
                      type="tel"
                      value={formData.phone}
                      onChange={handleChange}
                      placeholder="+91 98765 43210"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label htmlFor="contact-subject" className={labelClass}>Subject *</label>
                    <input
                      id="contact-subject"
                      name="subject"
                      type="text"
                      required
                      value={formData.subject}
                      onChange={handleChange}
                      placeholder="e.g. Course Enquiry"
                      className={inputClass}
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="contact-message" className={labelClass}>Message *</label>
                  <textarea
                    id="contact-message"
                    name="message"
                    required
                    rows={5}
                    value={formData.message}
                    onChange={handleChange}
                    placeholder="Tell me what you're looking to learn..."
                    className={`${inputClass} resize-none`}
                  />
                </div>

                {formState === 'error' && (
                  <p className="text-sm text-rose-600 font-medium">
                    Something went wrong. Please try again or email me directly.
                  </p>
                )}

                <button
                  type="submit"
                  disabled={formState === 'loading'}
                  className="w-full py-3.5 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold text-sm transition-colors duration-200 flex items-center justify-center gap-2"
                >
                  {formState === 'loading' ? 'Sending…' : 'Send Message'}
                  {formState !== 'loading' && <IconArrowRight />}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// FOOTER
// ─────────────────────────────────────────────────────────────────────────────

function Footer({
  tenantName,
  logoUrl,
  navigation,
  socialLinks,
}: {
  tenantName: string;
  logoUrl?: string;
  navigation: NavItem[];
  socialLinks: Array<{ platform: SocialPlatform; url: string }>;
}) {
  const year = new Date().getFullYear();
  return (
    <footer className="bg-stone-900 border-t border-stone-800 py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-8">

          {/* Brand */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              {logoUrl ? (
                <Image src={logoUrl} alt={tenantName} width={32} height={32} className="rounded-lg object-cover" />
              ) : (
                <span className="w-8 h-8 rounded-lg bg-amber-500 flex items-center justify-center text-white font-bold text-sm" style={{ fontFamily: 'var(--font-display, Georgia, serif)' }}>
                  {tenantName.charAt(0).toUpperCase()}
                </span>
              )}
              <span className="font-semibold text-white" style={{ fontFamily: 'var(--font-display, Georgia, serif)' }}>
                {tenantName}
              </span>
            </div>
            <p className="text-stone-500 text-sm max-w-xs">Empowering learners, one lesson at a time.</p>

            {/* Social */}
            {socialLinks.length > 0 && (
              <div className="flex items-center gap-3 mt-1">
                {socialLinks.map(({ platform, url }) => (
                  <a
                    key={platform}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-stone-500 hover:text-amber-400 hover:bg-stone-800 transition-all"
                    aria-label={platform}
                  >
                    <SocialIcon platform={platform} />
                  </a>
                ))}
              </div>
            )}
          </div>

          {/* Nav links */}
          <div className="flex flex-wrap gap-x-8 gap-y-3">
            {navigation.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                target={item.isExternal ? '_blank' : undefined}
                rel={item.isExternal ? 'noopener noreferrer' : undefined}
                className="text-sm text-stone-400 hover:text-amber-400 transition-colors"
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>

        <div className="mt-10 pt-6 border-t border-stone-800 flex flex-col sm:flex-row items-center justify-between gap-2">
          <p className="text-xs text-stone-600">© {year} {tenantName}. All rights reserved.</p>
          <p className="text-xs text-stone-600">Powered by <span className="text-amber-600 font-medium">EducoreOS</span></p>
        </div>
      </div>
    </footer>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN EXPORT
// ─────────────────────────────────────────────────────────────────────────────

export default function TeacherLandingPageTemplate(props: TeacherLandingPageProps) {
  const {
    tenantName,
    tenantSlug,
    logoUrl,
    navigation,
    hero,
    stats,
    about,
    credentials,
    courses,
    blogPreview,
    testimonials,
    faq,
    contact,
  } = props;

  return (
    <div className="min-h-screen bg-stone-50" style={{ fontFamily: 'var(--font-body, system-ui, sans-serif)' }}>
      <Navbar
        tenantName={tenantName}
        logoUrl={logoUrl}
        navigation={navigation}
        ctaLabel={hero.ctaPrimaryLabel}
        ctaHref={hero.ctaPrimaryHref}
      />

      <main>
        <HeroSection hero={hero} />
        <StatsSection stats={stats} />
        <AboutSection about={about} />
        <CredentialsSection credentials={credentials} />
        <CoursesSection courses={courses} tenantSlug={tenantSlug} />
        <BlogPreviewSection blogPreview={blogPreview} tenantSlug={tenantSlug} />
        <TestimonialsSection testimonials={testimonials} />
        <FaqSection faq={faq} />
        <ContactSection contact={contact} />
      </main>

      <Footer
        tenantName={tenantName}
        logoUrl={logoUrl}
        navigation={navigation}
        socialLinks={hero.socialLinks}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SAMPLE DATA — for Antigravity local development & template preview only
// Replace with real API data in production.
// ─────────────────────────────────────────────────────────────────────────────

export const SAMPLE_TEACHER_PAGE_DATA: TeacherLandingPageProps = {
  tenantName: 'Priya Sharma',
  tenantSlug: 'priya-sharma',
  logoUrl: '',

  navigation: [
    { label: 'About',       href: '#about' },
    { label: 'Credentials', href: '#credentials' },
    { label: 'Courses',     href: '#courses' },
    { label: 'Blog',        href: '#blog' },
    { label: 'Contact',     href: '#contact' },
  ],

  hero: {
    teacherName:        'Priya Sharma',
    title:              'Mathematics Teacher & Online Educator',
    tagline:            'I help students crack competitive exams with clarity, confidence, and a curriculum that actually works.',
    photoUrl:           '/placeholder-teacher.jpg',
    photoAlt:           'Priya Sharma — Mathematics Teacher',
    ctaPrimaryLabel:    'Explore My Courses',
    ctaPrimaryHref:     '#courses',
    ctaSecondaryLabel:  'Read My Blog',
    ctaSecondaryHref:   '#blog',
    socialLinks: [
      { platform: 'youtube',   url: 'https://youtube.com' },
      { platform: 'linkedin',  url: 'https://linkedin.com' },
      { platform: 'instagram', url: 'https://instagram.com' },
    ],
  },

  stats: {
    items: [
      { value: '4,200+', label: 'Students Taught',     icon: 'students' },
      { value: '18',     label: 'Courses Published',   icon: 'courses' },
      { value: '12',     label: 'Years Experience',    icon: 'years' },
      { value: '4.9★',   label: 'Average Rating',      icon: 'rating' },
    ],
  },

  about: {
    sectionLabel:       'About Me',
    headline:           'A Decade of Turning Confusion Into Clarity',
    photoUrl:           '/placeholder-about.jpg',
    photoAlt:           'Priya teaching in her studio',
    bio:
      'I am a Mathematics teacher based in Bengaluru with over 12 years of experience preparing students for IIT-JEE, NEET, and board exams. I started teaching after realising that most students fear maths not because it is hard, but because it was never explained properly.\n\nMy approach is rooted in first principles — I believe every formula has a story and every problem has a pattern. Once students see that, the subject transforms from a wall into a door.\n\nI have taught over 4,000 students, and my students have secured ranks in the top 500 of IIT-JEE Advanced. I run live cohorts every semester, along with self-paced recorded courses available on this platform.',
    teachingPhilosophy: 'A student who understands the why will always outperform a student who only memorises the what.',
  },

  credentials: {
    sectionLabel: 'Credentials',
    headline:     'Qualifications & Recognition',
    items: [
      { type: 'degree',        title: 'M.Sc. Mathematics',               issuer: 'Indian Institute of Science, Bengaluru',  year: '2012' },
      { type: 'degree',        title: 'B.Sc. Mathematics (Hons.)',        issuer: 'St. Josephs College, Bengaluru',          year: '2010' },
      { type: 'certification', title: 'Certified Online Educator',        issuer: 'Coursera / Johns Hopkins University',     year: '2020' },
      { type: 'certification', title: 'Advanced Pedagogy in STEM',        issuer: 'CBSE Teacher Training Programme',         year: '2018' },
      { type: 'award',         title: 'Best Educator Award',              issuer: 'EdTech India Summit 2023',               year: '2023' },
      { type: 'institution',   title: 'Senior Faculty — JEE Mathematics', issuer: 'FIITJEE Bengaluru Centre',               year: '2013–2021' },
    ],
  },

  courses: {
    sectionLabel: 'My Courses',
    headline:     'Learn at Your Own Pace',
    subtitle:     'Structured, exam-focused courses built from 12 years of classroom experience.',
    viewAllHref:  '/priya-sharma/courses',
    courses: [
      {
        id: '1', slug: 'iit-jee-maths-complete', level: 'Advanced',
        title: 'IIT-JEE Mathematics — Complete Course',
        thumbnailUrl: '/placeholder-course-1.jpg',
        priceInSmallestUnit: 599900, currency: 'INR', isFree: false, enrollmentCount: 1243,
      },
      {
        id: '2', slug: 'class-12-boards-maths', level: 'Intermediate',
        title: 'Class 12 Boards Mathematics — Full Syllabus',
        thumbnailUrl: '/placeholder-course-2.jpg',
        priceInSmallestUnit: 299900, currency: 'INR', isFree: false, enrollmentCount: 876,
      },
      {
        id: '3', slug: 'maths-foundations-free', level: 'Beginner',
        title: 'Mathematical Thinking — Free Foundations Course',
        thumbnailUrl: '/placeholder-course-3.jpg',
        priceInSmallestUnit: 0, currency: 'INR', isFree: true, enrollmentCount: 3210,
      },
    ],
  },

  blogPreview: {
    sectionLabel: 'From My Blog',
    headline:     'Insights, Tips & Study Strategies',
    viewAllHref:  '/priya-sharma/blog',
    posts: [
      {
        id: '1', slug: 'how-to-study-calculus',
        title: 'How to Study Calculus Without Losing Your Mind',
        excerpt: 'Most students approach calculus the wrong way — memorising formulas instead of understanding limits. Here is how I teach it differently.',
        thumbnailUrl: '/placeholder-blog-1.jpg',
        publishedAt: '2026-03-18T09:00:00Z',
        readTimeMinutes: 7,
      },
      {
        id: '2', slug: 'iit-jee-preparation-timeline',
        title: 'The 18-Month IIT-JEE Preparation Timeline That Actually Works',
        excerpt: 'A month-by-month breakdown of how my top-ranking students planned their two-year journey to IIT-JEE Advanced.',
        thumbnailUrl: '/placeholder-blog-2.jpg',
        publishedAt: '2026-02-28T09:00:00Z',
        readTimeMinutes: 11,
      },
      {
        id: '3', slug: 'mistakes-in-board-exams',
        title: '5 Mistakes Students Make in Class 12 Board Exams',
        excerpt: 'After 12 years of reviewing answer scripts, these are the five most common — and most avoidable — mistakes I see every year.',
        thumbnailUrl: '/placeholder-blog-3.jpg',
        publishedAt: '2026-02-10T09:00:00Z',
        readTimeMinutes: 5,
      },
    ],
  },

  testimonials: {
    sectionLabel: 'Student Reviews',
    headline:     'What My Students Say',
    items: [
      {
        name: 'Arjun Mehta', role: 'IIT-JEE 2025 (AIR 214)', courseName: 'IIT-JEE Mathematics — Complete',
        quote: 'Priya ma\'am\'s approach completely changed how I think about problems. I went from struggling with integration to solving JEE Advanced questions in under 3 minutes.',
        rating: 5,
      },
      {
        name: 'Sneha Iyer', role: 'Class 12 Student', courseName: 'Class 12 Boards Mathematics',
        quote: 'I was terrified of coordinate geometry. After just four weeks of this course, it became my strongest chapter. The explanations are unlike anything I have seen.',
        rating: 5,
      },
      {
        name: 'Rohan Desai', role: 'Engineering Student', courseName: 'Mathematical Thinking',
        quote: 'The free foundations course is genuinely better than most paid ones I have tried. It completely reset how I think about numbers and proofs.',
        rating: 5,
      },
    ],
  },

  faq: {
    sectionLabel: 'FAQ',
    headline:     'Frequently Asked Questions',
    items: [
      {
        question: 'How do I access the course after purchasing?',
        answer:   'You will receive instant access immediately after payment. Simply log in to your student account and the course will appear in your dashboard under My Courses.',
      },
      {
        question: 'Are the courses self-paced or do they follow a schedule?',
        answer:   'Recorded courses are fully self-paced — watch anytime, pause, rewind, and revisit as many times as you need. Live cohort courses follow a fixed schedule, which is published in advance on the course page.',
      },
      {
        question: 'Do I receive a certificate upon completion?',
        answer:   'Yes. A completion certificate is issued automatically once you finish all lessons and pass the end-of-course assessment. Certificates can be downloaded as PDFs and shared on LinkedIn.',
      },
      {
        question: 'What if I have questions while going through the course?',
        answer:   'Each course includes a discussion forum where you can post questions. I personally review and answer questions every weekday. Live cohort students also get two live doubt-clearing sessions per week.',
      },
      {
        question: 'Is there a refund policy?',
        answer:   'Yes. If you are not satisfied within the first 7 days of purchase, contact me and I will issue a full refund — no questions asked.',
      },
    ],
  },

  contact: {
    sectionLabel:        'Get In Touch',
    headline:            'Let\'s Start a Conversation',
    subtitle:            'Have a question about a course, or just want to say hello? I read every message personally.',
    showEmail:           true,
    email:               'priya@priyasharma.edu',
    showPhone:           true,
    phone:               '+91 98765 43210',
    showAddress:         true,
    address:             'Bengaluru, Karnataka, India',
    leadFormApiEndpoint: '/api/public/priya-sharma/lead-forms',
  },
};
