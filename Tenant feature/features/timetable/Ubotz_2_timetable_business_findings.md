# UBOTZ 2.0 Timetable Business Findings

## Executive Summary
The Timetable module handles the temporal orchestration of institutional activities. It is the "Brain" of the physical and digital campus, managing when batches meet, where they meet (Venue/Branch), and who is teaching them.

## Operational Modalities

### 1. Global Settings
Tenants define institutional working parameters:
- **`week_starts_on`**: Crucial for regional variations (e.g., Sunday-start vs. Monday-start).
- **`working_days`**: Defines the "Active Week" for the institution.
- **Conflict Mode**: `hard_block` prevents overlapping sessions, while `soft_warning` allows for administrative flexibility during high-density scheduling cycles.

### 2. Session Lifecycle
- **Recurrence**: Supports automated generation of sessions for a full academic term (e.g. "Generate sessions for English Batch A every MWF for the next 12 weeks").
- **Rescheduling**: Accommodates real-world disruptions (Staff illness, public holidays) by allowing individual sessions to be moved or cancelled without destroying the underlying schedule template.

### 3. Timetable vs. Attendance
A `Timetable Session` represents the **Plan**. Once the session time arrives, it serves as the parent record for an `Attendance Session`, which tracks the **Actual** physical participation.

## Coordination
The Timetable ensures that a single Branch Classroom or Instructor isn't booked for two different batches at the same hour, significantly reducing institutional friction.

---

## Linked References
- Related Modules: `Batch`, `Branch`, `Attendance`, `Meeting`.
