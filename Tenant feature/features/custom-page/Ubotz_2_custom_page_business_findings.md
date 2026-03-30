# UBOTZ 2.0 Custom Page Business Findings

## Executive Summary

**Custom pages** let a tenant publish **extra static content** (policies, about pages, program details) under the **same website module** as the visual landing builder. Pages move between **draft** and **published**, carry a **unique slug per tenant**, and appear in the **public website** slug list alongside **landing pages**.

Authoring requires **`landing_page.manage`**; viewing configuration requires **`landing_page.view`**, within **`module.website`**.

---

## Operations

- **Publishing:** Dedicated **publish** / **unpublish** endpoints update visibility; **`published_at`** supports audit of go-live timing.
- **Discovery:** Public visitors resolve content by **slug** through the shared public page API (together with template-driven landing pages).

---

## Linked references

- **Technical specification:** `Ubotz_2_custom_page_technical_documentation.md`.
- **Related:** Landing page templates, website theme/display config, custom domain for branded hostnames.
