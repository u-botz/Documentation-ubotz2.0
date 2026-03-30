# UBOTZ 2.0 Blog Business Findings

## Executive Summary

The Blog gives each tenant a **content marketing** surface: **categories**, **posts** with **translations** (title, body, SEO meta per locale), optional **featured images**, and **comments** with moderation states. **Published** posts can appear on the **public website** (`/api/public/tenants/{tenantSlug}/website/blog/...`), subject to tenant visibility rules.

Administrators manage content through **`/api/tenant/blog/...`** when the **`module.blog`** module is enabled and the user has **`blog.manage`** for write operations.

---

## Multi-lingual content

- **Posts:** Canonical row in `blog_posts`; localized fields live in **`blog_post_translations`** keyed by `locale`.
- **Categories:** Same pattern via **`blog_category_translations`**.
- **Public reads:** The public API chooses a locale from the client’s **`Accept-Language`** header (see technical specification). Fallback behavior for missing translations is implemented in the **public blog query service**, not in a single hard-coded middleware name.

---

## Governance

- **Comments:** `enable_comment` on the post toggles whether discussion is intended; individual comments carry a **status** (e.g. pending vs visible) for moderation workflows.
- **Authors:** `author_id` ties posts to a tenant user for attribution.

---

## SEO & discovery

- **Meta descriptions** exist per translation (`meta_description`).
- **Slugs** identify posts on the public site; they must remain unique within the tenant’s blog.

---

## Linked references

- **Technical specification:** `Ubotz_2_blog_technical_documentation.md` (routes, schema, capabilities, public vs tenant APIs).
- **Related:** Landing page / custom domain, user directory for authors, optional analytics on public content.
