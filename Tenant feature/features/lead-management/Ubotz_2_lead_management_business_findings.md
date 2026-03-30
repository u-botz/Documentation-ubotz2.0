# UBOTZ 2.0 — Lead Management — Business Findings

## Executive summary

Lead management is the tenant’s CRM for enquiries and counseling. Institutions capture prospects (including from public web properties), organize them in a pipeline, assign staff, record notes and follow-ups, score and prioritize leads, and optionally use WhatsApp and marketing source analytics. Duplicate detection and merge workflows reduce conflicting records; CRM reports support funnel and counselor performance insight.

## How leads enter the system

- **Public forms:** Throttled public endpoints submit leads against a **tenant slug** (`POST /api/public/tenants/{tenantSlug}/leads`). This supports landing-page and marketing capture without tenant-admin login.
- **Visit tracking:** A separate public endpoint records visits for a known lead id where applicable.
- **Manual entry:** Authorized staff create and edit leads in the tenant dashboard (`lead_management.manage`).

## Day-to-day operations

- **Pipeline and ownership:** Leads move through stages; staff assignment clarifies responsibility. Stage changes and assignments are auditable via activities.
- **Notes and follow-ups:** Notes document conversations; follow-ups and follow-up tasks schedule next actions. Permissions split **view** vs **manage** for follow-up work.
- **Conversion:** Converting a lead is a dedicated business action (admission-oriented), not merely a flag change; admission fee can be tied to analytics where the source-analytics module and roles allow it.
- **Temperature / scoring:** Configurable scoring and temperature help prioritize outreach; scheduled score recalculation keeps lists current.

## Optional modules

- **WhatsApp:** When the WhatsApp module is enabled, tenants can connect Meta/WhatsApp, manage templates, use inbox and broadcasts, and message individual leads subject to capability checks.
- **Source analytics and spend:** Marketing spend and ROI views require the source-analytics module; admission fee updates on leads sit behind the same product boundary.
- **CRM reports:** Funnel, velocity, branch comparison, counselor views, and exports are gated by report capabilities and the CRM reports module.
- **Duplicate handling:** Dedup surfaces candidate pairs; merge and dismiss operations require explicit merge permission.

## Branch and tenancy

Leads are tenant-isolated. Branch fields (where present in data model) support organizing enquiries by campus or region for routing and reporting.

## Compliance and safety

Public submission endpoints are rate-limited. Sensitive integrations (WhatsApp, spend data) are capability- and module-gated so small teams do not accidentally expose or change financial or messaging configuration.

---

## Linked references

- **Landing page / public website** — discovery and contact flows
- **Users & roles** — who can view vs manage CRM objects
- **Platform** — landing page *templates* are curated separately; tenants consume templates in the website builder
