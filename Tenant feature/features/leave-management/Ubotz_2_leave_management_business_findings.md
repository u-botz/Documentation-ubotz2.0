# UBOTZ 2.0 Leave Management Business Findings

## Executive Summary
Leave Management provides workforce and student lifecycle governance. It transitions the institution from informal "Absence Notices" to a formal, credit-based request and approval workflow, integrated directly with the academic `Attendance` calendar.

## Operational Modalities

### 1. Multi-Dimensional Leaves
Supports diverse institutional needs via `leave_types`:
- **Staff Leaves**: Sick Leave, Casual Leave, Paid Time Off.
- **Student Leaves**: Medical emergencies, verified absence for competitive exams.

### 2. Credit Governance
- **`leave_balances`**: Tracks available vs. used days per category. 
- **Half-Day Logic**: Supports fractional requests (`requested_days: 0.5`), essential for staff duty shifts or afternoon-session absences.

### 3. Approval Workflow
Requests flow through a `status` hierarchy (`pending` $\rightarrow$ `approved` / `rejected`).
- **Transparency**: Every rejection requires a `rejection_reason`.
- **Accountability**: Tracks `approved_by_user_id`, providing a clear audit trail of administrative decisions.

## Academic Integrity
When a student's leave is **Approved** for a specific date range, the system can automatically mark them as "Excused Absence" in the `Attendance` module, preventing unjustified penalties on their performance indexes.

---

## Linked References
- Related Modules: `Attendance`, `User`.
