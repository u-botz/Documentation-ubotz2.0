# UBOTZ 2.0 — Timetable — Business Findings

## Executive summary

The **timetable** defines **where and when** teaching happens: **venues**, **holidays**, reusable **weekly templates** with **slots**, and concrete **session instances** generated for real calendar dates. Staff with **view** can browse schedules; those with **manage** maintain master data and handle **cancellations**, **reschedules**, and **substitute** instructors when real life intervenes.

## Settings

**`timetable_settings`** (per tenant) capture institutional defaults: conflict handling (`conflict_mode` such as hard block vs softer behavior), week start, which weekdays count as working days, timezone, and generation preferences—so generated sessions match local norms.

## Plan vs attendance

Session instances represent the **planned** calendar. **Attendance** records whether people actually showed; linkage exists in schema (`timetable_session_id` on attendance where migrated)—business rules define when a session is “due” for marking.

## Scale

Templates allow **publish** workflows; publishing can trigger **instance generation** so the live calendar stays in sync without hand-entering every occurrence.

---

## Linked references

- **Batch** — who the schedule serves
- **Meeting** — separate booking product; timetable is institution-wide class scheduling
