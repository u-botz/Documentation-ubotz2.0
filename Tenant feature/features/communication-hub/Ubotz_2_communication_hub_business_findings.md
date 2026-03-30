# UBOTZ 2.0 Communication Hub Business Findings

## Executive Summary

The **Communication Hub** lets staff compose **institution-wide messages**, define **audiences** (e.g. batch, branch, or other supported scopes), **publish** to materialize recipient rows, and track **reads** and optional **acknowledgments** for compliance. It is gated by **`module.communication_hub`** and capabilities **`communication.view`** (inbox), **`communication.create`** (authoring and publish), and **`communication.manage`** (archive, delete, revisions).

**Separately**, the same API prefix exposes **course-local** **FAQs**, **forums**, and **noticeboards** under **`module.faq`**, **`module.forum`**, and **`module.noticeboard`** — these are pedagogical/community features tied to courses, not the hub broadcast tables.

---

## Operational modalities

- **Draft → published:** Messages start as drafts; publication runs validation, scope checks, and recipient expansion.
- **Acknowledgment:** When **`requires_acknowledgment`** is set, recipients may need to **acknowledge** after reading (see inbox API).
- **Revisions:** Edits can be tracked via **revision** rows for audit and collaboration.
- **Notifications:** **`CommunicationMessagePublished`** connects to the **notification** subsystem for delivery channels configured in the platform (email/push/etc. as implemented in listeners).

---

## Governance

- **Scope enforcement** ensures staff only target audiences their role may address (policies vary by scope type — see technical doc).
- **Capabilities** replace a single “publish” permission: **`communication.create`** covers publishing in the current route design.

---

## Linked references

- **Technical specification:** `Ubotz_2_communication_hub_technical_documentation.md`.
- **Related:** Courses (noticeboard/forum/FAQ), batches/branches (audience scopes), notifications.
