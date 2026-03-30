# UBOTZ 2.0 Meeting & Live Session Technical Specification

## Core Architecture
The Meeting module is a high-concurrency scheduling context (`TenantAdminDashboard\Meeting`). It utilizes a "Claim-Based" slot reservation model to prevent double-booking.

## Relational Schema Constraints

### 1. Availability Layer (`meeting_availabilities`)
- **`tenant_id`**: Structural isolation.
- **`recurrence_type`**: Logic for expanding slots (e.g., `weekly`, `specific`).
- **Indices**: `idx_meeting_avail_host_day` enables rapid calendar rendering for specific week-view requests.

### 2. Booking Layer (`meeting_bookings`)
- **`host_id` / `requester_id`**: Foreign keys to the `User` context.
- **`status`**: State machine (`pending`, `confirmed`, `countered`, `completed`, `cancelled`).
- **`slot_duration_minutes`**: Drives the logic for `end_time` generation.

### 3. Concurrency Protection (`meeting_slot_claims`)
- **`unq_meeting_slot_claim`**: A critical composite index `(tenant_id, host_id, start_time)`. 
- **Purpose**: Prevents two students from booking the exact same start-time for the same instructor, even if checkout processes are running in parallel.

## Key Technical Workflows

### Generating bookable slots
1. The system fetches `availabilities` and `overrides`.
2. It expands the schedule based on `recurrence_type`.
3. It subtracts existing `meeting_bookings` and `slot_claims`.
4. It returns the remaining non-overlapping windows to the front-end.

### Meeting Provider Integration
- When a booking moves to `confirmed`, the `ResolveMeetingProviderUseCase` generates dynamic links for supported drivers (Zoom/Teams) and stores them in `meeting_link`.

## Tenancy & Security
Every booking and availability is strictly bound by `tenant_id`. The "Slot Claim" engine ensures that cross-tenant availability scans are impossible, as all unique constraints are qualified by the `tenant_id`.

---

## Linked References
- Related Modules: `User`, `Timetable`.
