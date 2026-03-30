# UBOTZ 2.0 Bundle Business Findings

## Executive Summary

A **bundle** is a **priced package of courses** under one tenant: marketing copy, thumbnail, visibility (**`is_private`**), and lifecycle status (**draft** / **published** / **archived**). Students who enroll receive a **bundle enrollment** record and, typically, **individual course enrollments** for each included course (subject to capacity and existing enrollments).

Commercial checkout may attach **`sale_id`** and pricing snapshots on **`bundle_enrollments`**; admin enrollment APIs support **idempotency** for safe retries.

---

## Operational modalities

- **Composition:** Courses are ordered in **`bundle_courses`** (with **`sort_order`** after alignment migrations).
- **Pricing:** Bundle price is stored in minor units (**cents**); **`locked_price_cents`** on the enrollment preserves the price at purchase when applicable.
- **Access:** Course access for bundle buyers is enforced through the **enrollment / access** layer (bundle + per-course enrollment), not by a single “bundle password.”

---

## Linked references

- **Technical specification:** `Ubotz_2_bundle_technical_documentation.md` (routes, schema, `EnrollStudentInBundleUseCase`).
- **Related:** Courses, course enrollments, payments/sales, subscription plan features if bundles are quota-gated.
