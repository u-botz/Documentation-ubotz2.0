# UBOTZ 2.0 Attendance Business Findings

## Executive Summary

Attendance links **scheduled teaching moments** (optionally tied to **batches**, **subjects**, **teachers**, and **branches**) to **per-student marks** within a tenant. It supports **bulk marking**, **session completion**, **tenant-wide settings** (thresholds, lock timing, default modes), and an **audit trail** for defensible records.

Operational **reports**, **staff attendance**, and **student self-service** summaries are only partially reflected in **live HTTP routes** — several endpoints remain commented out in `attendance.php`. Product planning should treat the technical specification as the checklist of what is actually exposed.

---

## Session lifecycle

- **Sessions** carry date/time, context (batch/subject/teacher/branch), marking state, cancellation, and notes.
- **Completion** records who finalized the roster (`marked_by` / `marked_at`).
- **Locking** (`locked_at`) is the primary control for **when** ordinary edits should stop; **overrides** are reserved for roles with explicit override permission (see technical doc).

---

## Policy & thresholds

- **`attendance_settings`** holds tenant rules such as **lock period**, **attendance threshold** (percentage and period), and whether **excused** absences adjust denominators.
- These settings feed application logic (e.g. threshold events during marking) rather than being “documentation-only” fields.

---

## Integrations & roadmap

- **Timetable:** optional `timetable_session_id` with uniqueness per tenant to avoid duplicate attendance shells for the same timetable slot.
- **CRM / notifications:** domain events and listeners can connect to parent outreach; wire-up depends on tenant configuration.
- **Dashboard:** global and teacher dashboards can show high-level attendance KPIs without exposing the full session API in the SPA.

---

## Linked references

- **Technical specification:** `Ubotz_2_attendance_technical_documentation.md` (routes, schema, capabilities, commented routes).
