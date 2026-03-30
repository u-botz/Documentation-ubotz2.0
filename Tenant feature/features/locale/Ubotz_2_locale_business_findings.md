# UBOTZ 2.0 — Locale & RTL — Business Findings

## Executive summary

The product supports **English** and **Arabic** for tenant-facing experiences. Institutions can set a **default portal language** (tenant owner, with the right capability and subscription module). Each user can set a **personal language** that applies to their session, subject to the same RTL entitlement and per-user RTL permission.

## Who controls what

- **Tenant default language** — Only the **tenant owner** may change it, and only if they hold **`locale.settings.manage`** and the tenant has the **RTL UI** feature on the plan. This sets expectations for new users and institution-wide defaults where the product uses them.
- **Personal language** — Any authenticated tenant user can call the personal-locale endpoint (within the same `en` / `ar` rules): Arabic requires the RTL feature on the subscription **and** the **`rtl.ui`** capability for that user.

## RTL and markets

Right-to-left layout is not a separate “skin”: it is tied to the **RTL UI** module and capability model so that institutions only expose Arabic when licensed and roles allow it.

## Timezone vs language

**Timezone** (when classes and meetings occur) is governed separately from **language** (which labels and messages the user sees). Both matter for a good experience but are configured through different settings and middleware.

---

## Linked references

- **Subscription / modules** — `feature.rtl_ui` gates Arabic
- **User roles** — owner-only default language change
