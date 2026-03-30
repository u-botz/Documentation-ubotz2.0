# UBOTZ 2.0 — Notifications — Business Findings

## Executive summary

Notifications keep users informed inside the product (**in-app inbox**) and, where the implementation dispatches them, by **email**. Each user can tune **preferences** by category and channel (for example turning off email for a class of alerts). Platform operators have a **separate** notification center from tenant users.

## Tenant experience

- **Inbox** — Users see a paginated list, can filter unread-only, fetch an unread badge count, mark one or all as read.
- **Preferences** — Users update which **categories** are enabled per **channel** (the exact categories and channels are those supported by the product and validation in `UpdateNotificationPreferencesRequest` / use case).
- **Isolation** — Queries are scoped to the **current tenant** and **current user** so one institution never sees another’s notifications.

## Platform vs tenant

- **Tenant APIs** serve institution staff and students authenticated on the tenant realm.
- **Platform APIs** serve UBOTZ operators with admin credentials. They are separate products from a security and UX perspective.

## Delivery expectations

- **In-app** records are durable rows users can revisit.
- **Email** (when used) is typically **queued** (`SendNotificationEmailJob`) so HTTP requests stay fast; failures can be tracked on the notification row where columns exist.
- **Operational jobs** clean up, retry failures, and maintain aggregates on a schedule—supporting scale without manual database hygiene.

## Relation to “Communication”

Automated notifications complement ad-hoc messaging elsewhere: they are often **event-driven** (enrollment, waitlist, notices) rather than free-form chat.

---

## Linked references

- **User & auth** — who receives which notifications
- **Courses / enrollment / waitlist** — common sources of automated messages
