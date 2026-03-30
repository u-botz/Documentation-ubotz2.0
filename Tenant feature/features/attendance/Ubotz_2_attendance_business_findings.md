# UBOTZ 2.0 Attendance Business Findings

## Executive Summary

Attendance links **scheduled teaching moments** (optionally tied to **batches**, **subjects**, **teachers**, and **branches**) to **per-student marks** within a tenant. It supports **bulk marking**, **session completion**, **tenant-wide settings** (thresholds, lock timing, default modes), and an **audit trail** in persistence for defensible records.

**Operational reports** (batch, low attendance, teacher compliance, export), **staff attendance** listing and reporting, and **student self-service** (`/api/tenant/my/attendance`) are **exposed in the current backend** subject to **`attendance.view`** / **`attendance.manage`** and tenant entitlement **`module.erp.attendance`**. Parent/guardian **child** attendance remains a **placeholder** (HTTP **501**). A dedicated **audit log read** by record id is **not** exposed yet.

Use **`Ubotz_2_attendance_technical_documentation.md`** as the integration checklist for paths, capabilities, and gaps.

---

## Session lifecycle

- **Sessions** carry date/time, context (batch/subject/teacher/branch), marking state, cancellation, and notes.
- **Completion** records who finalized the roster (`marked_by` / `marked_at`).
- **Locking** (`locked_at`) is the primary control for **when** ordinary edits should stop; **overrides** are reserved for roles with **`attendance.manage`** (see technical doc).

---

## Policy & thresholds

- **`attendance_settings`** holds tenant rules such as **lock period**, **attendance threshold** (percentage and period), and whether **excused** absences adjust denominators.
- These settings feed application logic (e.g. threshold events during marking) rather than being “documentation-only” fields.

---

## Integrations & roadmap

- **Timetable:** optional `timetable_session_id` with uniqueness per tenant to avoid duplicate attendance shells for the same timetable slot.
- **CRM / notifications:** domain events exist; listener wire-up depends on tenant configuration.
- **Dashboard:** global and teacher dashboards can show high-level attendance KPIs; **report** and **staff** HTTP endpoints are available for richer operational views.
- **Parent/child:** product rules for `GET /api/tenant/my/children/{id}/attendance` are **not** finalized — API returns **501** until implemented.

---

## Linked references

- **Technical specification:** `Ubotz_2_attendance_technical_documentation.md` (full route list, capabilities, `my/*` self-service, known gaps).
