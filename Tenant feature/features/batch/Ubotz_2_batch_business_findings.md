# UBOTZ 2.0 Batch Business Findings

## Executive Summary

A **batch** is a tenant-scoped **cohort**: a named, dated program slice with a **capacity**, **category**, and **internal code** (`tenant_id` + `code` must be unique). Courses are **linked** to batches; **faculty** are assigned per **batch + course + user**; **students** are associated via `batch_students` with optional removal history.

Archiving uses **`archived_at`** (there is no `deleted_at` on `batches`); deleting via API performs this archive operation.

---

## Operational picture

- **Course vs batch:** A **course** defines content; a **batch** defines **who** runs through it **when**, subject to **max_capacity** and date bounds.
- **Faculty:** Instructors are tied to specific **courses within the batch**, supporting split teaching loads.
- **Lifecycle:** Status changes (e.g. draft to active) are explicit API operations; archiving hides the batch from day-to-day operations while retaining history.

---

## Linked references

- **Technical specification:** `Ubotz_2_batch_technical_documentation.md` (routes, capabilities, schema).
- **Related:** Course catalog, enrollment/access rules, installments where `default_installment_plan` applies, exam `batch_id` linkage if used.
