# UBOTZ 2.0 Attendance Business Findings

## Executive Summary
For LMS tenants augmenting online operations with physical classrooms or mandated live digital cohorts, the Attendance infrastructure satisfies rigorous structural reporting. It enforces pedagogical oversight and guarantees parents/organizations visibility over student consistency.

## Operational Modalities

### The Session Roster
- The system hinges on generating formal `Attendance Sessions`. These sessions outline the *expected* temporal boundaries (`start_time`, `end_time`) attached closely to specific B2B `batches` and geographic `branches`.

### Auditing and Immutability (`locked_at`)
- Most B2B LMS operations suffer from post-facto modification fraud (markings changed weeks later to satisfy performance bonuses). UBOTZ implements a strict `locked_at` mechanism. Once the instructor finalizes the roster and the system locks it, historical tampering is permanently barred.
- The `marked_by` audit column directly tracks the exact staff ID applying the final sign-off, facilitating dispute resolutions.

### Administrative Triggers
Attendance directly feeds broader business CRM pipelines. Consistent flagging of individual "absent" markings can dynamically invoke parent notification systems or retention/outreach interventions by the tenant's support team.
