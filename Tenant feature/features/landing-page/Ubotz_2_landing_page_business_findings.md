# UBOTZ 2.0 — Landing Page / Tenant Website — Business Findings

## Executive summary

The tenant **website** product lets an institution present a public marketing site: branded landing pages from approved **templates**, optional custom pages, navigation, theme, SEO-oriented settings, and embedded content such as courses and blog. Publishing controls when the public site shows a page. Platform operators maintain the **template catalog**; tenants **select** templates and customize content within policy.

## Who does what

- **Platform (Super Admin)** — Creates and governs **landing page templates** (quality, lifecycle, approval). Tenants do not edit platform template source in production flows.
- **Tenant (Owner / Admin with website permissions)** — Chooses templates, edits page metadata and sections, uploads media, configures navigation and global theme/display options, and publishes or unpublishes. Capabilities are split between **view** (`landing_page.view`) and **manage** (`landing_page.manage`), with the **website module** enabled for the subscription.

## Visitor experience

- Anonymous visitors consume **`/api/public/tenants/{tenantSlug}/website/...`** endpoints: navigation, theme, pages, courses, blog, stats, contact form, and domain-check helpers.
- **Course checkout** uses a dedicated authenticated checkout route where the product requires a logged-in tenant user session.

## Custom pages

Beyond template-driven landing pages, tenants can maintain **custom pages** with their own publish lifecycle, suitable for policies, static information, or campaign URLs.

## Marketing and CRM

- Contact forms on the public site feed **lead capture** (see Lead Management).
- SEO and branding JSON support institutional marketing without code deploys.

## Custom domains

Tenants may connect a custom hostname subject to verification flows documented with the custom-domain feature; the public website API exposes helpers for the frontend to resolve branding and routing.

---

## Linked references

- **Lead management** — enquiry pipeline from public capture
- **Courses / blog** — content surfaced on the public website
- **Subscriptions / modules** — `module.website` gates tenant builder features
