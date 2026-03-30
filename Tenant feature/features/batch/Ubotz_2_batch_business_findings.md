# UBOTZ 2.0 Batch Business Findings

## Executive Summary
For the UBOTZ platform, a `Course` dictates **what** is taught, while a `Batch` dictates **when** and to **whom**. Batches act as the fundamental student containment vessels (Cohorts). They represent scheduled executions of academic material bound tightly to performance timetables.

## Operational Modalities
- **Bounded Enrollment:** Batches bypass the global Course capacity bounds via their own `max_capacity` limit. E.g. A course may handle 10,000 students via video, but a specific live webinar Batch is strictly constrained to 50 active learners.
- **Schedules (`start_date`, `end_date`)**: Limits the exact lifecycle of the interaction. When the `end_date` triggers, automation processes optionally revoke interactive permissions (like live classes) while retaining VOD (Video on Demand) access depending on broader Tenant policies.
- **Lifecycle Overhaul**: Unlike standard deletions which destroy data integrity, assigning an `archived_at` timestamp safely tucks a completed Batch away while maintaining its connection to past `enrollment_histories`.

### The `code` Paradigm
- Business operators enforce internal SKUs like "JEE-2026-WKND-A" across the `code` attribute. This matches B2B accounting ledgers ensuring LMS data exports map seamlessly to third-party CRM ingestion tools.
