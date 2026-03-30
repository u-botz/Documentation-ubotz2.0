# UBOTZ 2.0 — Meeting — Business Findings

## Executive summary

Meetings let a tenant offer **bookable time** with designated hosts (for example instructors or counselors), optional **request** flows when a simple slot pick is not enough, and **admin visibility** into bookings and volume. Hosts maintain **availabilities** and can block specific dates; students discover hosts, see open slots, book or request, and manage **their** bookings.

## Roles

- **Hosts** need capabilities to manage **availability** and **bookings** (`meeting.manage_availability`, `meeting.manage_bookings`) so they can publish windows, respond to requests, set meeting links, record outcomes, and cancel when appropriate.
- **Administrators** with **view all** can see cross-institution booking lists and stats for oversight.
- **Students** (or other requesters) use the student API surface to find hosts, book slots, request meetings, and cancel or respond to counter-proposals within product rules.

## Booking concepts

- **Availability** — Recurring or one-off windows, split into slots using duration and buffer settings; **overrides** block or adjust specific dates.
- **Booking types and status** — The system supports structured states (pending, confirmed, counter-proposals, completion, cancellation) suitable for counseling or office hours, not only ad-hoc video links.
- **Pricing** — Bookings may carry **`price_cents`**; whether payment is collected in-app is determined by the wider product flow, not by this document alone.

## Automation

Scheduled jobs expire stale requests and complete meetings so dashboards stay accurate without manual cleanup.

---

## Linked references

- **Users & roles** — who may host vs book
- **Courses** — optional linkage for course-specific meetings
