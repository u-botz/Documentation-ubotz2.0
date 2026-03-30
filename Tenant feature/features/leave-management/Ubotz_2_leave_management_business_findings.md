# UBOTZ 2.0 — Leave Management — Business Findings

## Executive summary

Leave management gives each tenant a formal way to define leave categories, let people request time off, and let managers approve or reject requests against balances. Half-day and fractional-day requests are supported. Administrators configure types, allocate balances, run year-end rollover, and can use a team calendar view where the product exposes it.

## Roles and permissions

- **Requesters** need **`leave.request`** to see active leave types and submit requests. They typically also have **`leave.view`** to see their own requests and personal balance (`balances/me`).
- **Approvers** need **`leave.approve`** to see pending counts and to approve or reject; rejection should carry a reason when the product requires it.
- **Administrators** need **`leave.manage`** to define leave types, maintain organization-wide balances, allocate credits, execute rollover, and access administrative calendar views.

Capabilities are independent: a requester does not need `leave.manage` to submit leave.

## Operational flow

1. **Configure types** — Paid leave, sick leave, etc., with rules (e.g. negative balance) enforced in the domain layer.
2. **Allocate balances** — Per user, per type, per year as implemented.
3. **Submit request** — Date range, optional half-day, reason; overlap rules prevent conflicting bookings.
4. **Approve or reject** — Approver actions update status and, on approval, deduct from balance atomically.
5. **Year-end rollover** — Preview then execute where the institution uses carry-forward rules.

## What this module does not promise by itself

Integration with **attendance** or payroll is not described here as automatic: those would be separate product decisions (events, exports, or scheduled jobs). The technical layer focuses on leave state and balances within the tenant.

---

## Linked references

- **User directory** — who can approve and who requests
- **Reporting** — optional exports or dashboards if added later
