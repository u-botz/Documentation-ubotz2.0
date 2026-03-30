# UBOTZ 2.0 Custom Domain Business Findings

## Executive Summary

**Custom domains** let an institution serve its **public site** and tenant experience from a **branded hostname** (e.g. `learn.institution.org`) instead of only the default tenant subdomain. Tenants register a domain, add **DNS records** (TXT for proof, CNAME/A per platform guidance), and run **verification** until the platform marks the domain ready for **activation**.

Operational safeguards include **deadlines**, **DNS failure** timestamps, and **deactivation** / **removal** reasons so support can explain outages or policy actions.

---

## Verification lifecycle

- **`pending_verification`** — tenant has claimed a hostname and must complete DNS.
- **`verification_deadline_at`** — business window to finish setup (enforced in product/policy).
- **`verified_at` / `activated_at`** — progression toward live routing (exact rules in domain services).
- **Ongoing checks — `last_dns_check_at`** — supports detecting **lapsed DNS** (`dns_failure_detected_at`) to reduce takeover risk if a domain stops pointing at UBOTZ.

---

## Permissions

- **`custom_domain.view`** — read current configuration.
- **`custom_domain.manage`** — register, verify, remove.

---

## Commercial fit

Custom domains are often bundled with **higher tiers** (enterprise / white-label positioning). Technical enforcement may combine **subscription entitlements** with these APIs — confirm in central plan/module configuration.

---

## Linked references

- **Technical specification:** `Ubotz_2_custom_domain_technical_documentation.md`.
- **Related:** Tenant provisioning, landing page / public website, subscription plans.
