# UBOTZ 2.0 — Reward — Business Findings

## Executive summary

**Rewards** let an institution define **how many points** each supported **event type** is worth (when active) and give learners a **transparent history** and **balance**. Points are stored as **ledger lines** tied to a **source** (for example a quiz attempt), with **idempotent** awarding so the same event does not double-credit if the system retries.

## Configuration

- Administrators tune **points** and **on/off** per reward **type** per tenant.
- Inactive or zero-point rules result in **no** ledger line when an event fires.

## Trust and fairness

- **Source linkage** — Each credit references `source_type` and `source_id`, supporting audits and future reversals if rules change.
- **No double counting** — The application layer refuses a second ledger row for the same user/tenant/source tuple.

## Engagement

Gamification is optional per tenant (**rewards module**). It complements—not replaces—academic grades and formal certificates.

---

## Linked references

- **Quiz** — natural trigger for completion-based rewards
- **User** — balance is per user within the tenant
