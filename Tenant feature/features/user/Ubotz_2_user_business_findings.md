# UBOTZ 2.0 — User — Business Findings

## Executive summary

The **tenant user directory** is the institution’s roster: learners, faculty, and administrators. Emails are unique **within** the tenant, so the same person could theoretically exist on two different institutions without collision. Profiles can include **education**, **experience**, and **occupation** data for verification or display; **financial** flags and **subscription** grants support fee and access policies.

## Roles vs users

**Roles** (RBAC) answer “what may they do?”; **user records** answer “who are they?”. Assignment of roles to users is a separate concern (see Role feature).

## Lifecycle

Administrators **invite or create** users, **activate** or **suspend** them, and in controlled cases **verify** or **hard-delete** records. **Impersonation** (where permitted) helps support staff reproduce issues safely under audit policy.

## Multi-entity profile

Splitting **education**, **experience**, and **occupations** allows structured CV-style data instead of a single blob—useful for instructor vetting and compliance.

---

## Linked references

- **User groups** — segmentation beyond roles
- **Subscription (tenant LMS)** — granting plan access per user
