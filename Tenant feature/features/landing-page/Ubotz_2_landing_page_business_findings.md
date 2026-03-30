# UBOTZ 2.0 Landing Page Business Findings

## Executive Summary
For the UBOTZ Tenant, the Landing Page acts as the digital storefront and initial point of sales acquisition. B2B operators leverage landing pages to rapidly construct marketing funnels, inject bespoke branding, and govern SEO footprints for their explicitly published competitive exam arrays or B2C catalog offerings.

## Operational Modalities

### Global Templating
- **`template_id`**: Tenants are shielded from coding HTML. They inherit structural blueprints (Templates) curated by the **Platform Root/Super Admins**. 

### JSON Styling & Analytics Configs
- Tenants control visual variables (Color palettes, Logos, Hero text bounds) through intuitive backend forms parameterized directly into `branding`.
- **Acquisition Hooks**: The `seo_config` dynamically drives meta descriptions, Open Graph (OG) shares for social networks, and integrates vital marketing tools (Facebook Pixels, Google Tag Manager scripts).

### Publication State
- Deployments operate via standard state cycles (`draft` $\rightarrow$ `published`). Subdomains map instantly to `published` layouts. Nullifying or pulling down the page enforces maintenance mode or internal redirects logic without requiring server-side Apache/Nginx DNS restarts.
