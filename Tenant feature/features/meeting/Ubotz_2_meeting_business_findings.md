# UBOTZ 2.0 Meeting & Live Session Business Findings

## Executive Summary
The Meeting module enables Ubotz 2.0 tenants to offer interactive, synchronous learning experiences. It transitions the platform from a static VOD (Video on Demand) repository into a live, scheduled educational ecosystem where students can book 1-on-1 sessions, attend office hours, or participate in batch-wide webinars.

## Operational Modalities

### 1. Host Availability
- **Recurrence Logic**: Instructors (Hosts) define their "Office Hours" using `meeting_availabilities`. This supports weekly recurrences (e.g., every Tuesday from 10 AM to 12 PM) or specific one-off dates.
- **Slot Management**: Availability is divided into `slot_duration_minutes`, allowing the system to automatically generate bookable windows for students.
- **Overrides**: Hosts can apply "Blocking" overrides to their schedule for holidays or emergencies, ensuring students cannot book time when the instructor is unavailable.

### 2. Booking Workflows
- **Request & Counter-Proposals**: Depending on the `booking_type`, students can request sessions. Hosts can then "Accept", "Reject", or submit a `counter_proposed_start` time.
- **Modes**: Supports `online` (with automated meeting links from Zoom/Jitsi) and `offline` (with physical `venue` pointers).

### 3. Monetization
- **Price in Cents**: Sessions can be monetized. Students pay the `price_cents` during the booking flow, with successful payment acting as the prerequisite for generating the meeting join token.

## Institutional Governance
Administrators monitor `meeting_bookings` to ensure staff members are fulfilling their synchronous obligations. The `outcome_note` field provides a concluding audit trail for every interaction.

---

## Linked References
- Related Modules: `Timetable`, `User`, `Payment`, `Course`.
