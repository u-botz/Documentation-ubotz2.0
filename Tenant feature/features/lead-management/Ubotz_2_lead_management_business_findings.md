# UBOTZ 2.0 Lead Management Business Findings

## Executive Summary
The Lead Management module is the primary B2B CRM engine for Ubotz 2.0 tenants. It governs the top-of-funnel acquisition process, allowing institutions to capture enquiries from landing pages, track staff follow-ups, and automate the conversion of prospects into enrolled students.

## Operational Modalities

### 1. Capture & Pipelines
- **Automated Capture**: Leads are primarily spawned from the `Landing-Page` enquire forms (`lead_source: landing_page`).
- **Pipeline Stages**: Leads transition through a defined lifecycle (e.g., `new_enquiry` $\rightarrow$ `follow_up` $\rightarrow$ `converted`).
- **Staff Assignment**: Administrators assign leads to specific staff members (`assigned_staff_id`) to ensure accountability and follow-up consistency.

### 2. Follow-up & Integrity
- **Lead Notes**: Every interaction (phone call, email) is recorded in `lead_notes` to maintain a unified institutional memory of the prospect's history.
- **Duplicate Protection**: The system employs a "Dedup" engine (`lead_duplicate_candidates`) based on normalized phone numbers and emails to prevent multiple staff members from competing for the same student.

### 3. Conversion
- When a lead settles their first payment or manually enrolls, the `is_converted` flag is toggled. This creates a permanent link between the marketing acquisition cost and the final student identity, enabling precise ROI reporting.

## Branch Scoping
Leads are tagged with a `branch_id`. This ensures that a "Delhi Campus" staff member only sees leads interested in their local center, preventing cross-branch lead poaching and data leaks.

---

## Linked References
- Related Modules: `User`, `Landing-Page`, `Payment`, `CommunicationHub`.
