# UBOTZ 2.0 — Tenant provisioning — Business Findings

## Executive summary

**Provisioning** is how a **new institution** is registered on UBOTZ: identity (name, slug, domain), **status** in the lifecycle (`pending` → `active` → …), and the **technical steps** that yield an isolated tenant workspace, default roles, and an owner account. **Super Admin** tools expose **status** and **resume** when a run stalls; **idempotency** keys reduce duplicate organizations from double submissions.

## Actors

- **Platform operators** create or rescue tenants via **platform** APIs (admin JWT, authority tiers).
- **Self-serve teachers** may use the **teacher signup** funnel, which provisions a tenant with explicit `provisioningSource` tracking.

## Operations beyond day one

Provisioning is the start of a longer **lifecycle**: suspension, manual payment, infrastructure activation, and hard-delete workflows are separate platform concerns with their own routes and approvals.

## Separation from tenant admin

Day-to-day **users and courses** inside an institution use **`/api/tenant/...`** and tenant RBAC—not this document.

---

## Linked references

- **Subscription (platform)** — which plan the tenant is on
- **User / Role (tenant)** — staff and students inside the institution after provisioning
