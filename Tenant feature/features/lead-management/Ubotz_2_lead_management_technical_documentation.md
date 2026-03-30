# UBOTZ 2.0 Lead Management Technical Specification

## Core Architecture
Lead management is handled by the `TenantAdminDashboard\LeadManagement` bounded context. It integrates directly with the `Identity` and `Payment` contexts to facilitate the conversion workflow.

## Relational Schema Constraints (`leads`)
Derived from the `2026_03_13_105344_create_leads_table.php` schema:

| Column | Technical Significance |
| :--- | :--- |
| **`tenant_id`** | Structural isolation invariant. |
| **`pipeline_stage`** | Tracks state via a defined string enum (e.g., `new_enquiry`). Optimized via `idx_leads_tenant_stage`. |
| **`phone_normalized`** | Used for $O(1)$ duplicate lookups. Cleaned via the `NormalizePhoneNumberUseCase`. |
| **`assigned_staff_id`** | Foreign key to `users`. Deletions trigger `onDelete('set null')` to preserve lead history even if staff accounts are removed. |

## Advanced Integrity Features

### 1. Duplicate Detection Engine
The `lead_duplicate_candidates` table stores potential collisions identified by the system.
- **Workflow**: Upon new lead creation, a `IdentifyLeadDuplicatesJob` scans for matching `phone_normalized` or `email` within the same `tenant_id`.

### 2. Conversion Hook
The `ConvertLeadToStudentUseCase` handles the transition:
1. Validates the Lead's current status.
2. Instantiates a `User` record in the Tenant DB.
3. Maps the `lead_id` to the new `user_id` for historical ROI tracking.
4. Toggles `is_converted` and sets `converted_at`.

## Performance & Indexing
- **Inbound Filtering**: `idx_leads_tenant_source` enables rapid reporting on marketing channel performance.
- **Staff Auditing**: `lead_activities` tracks every mutation (stage changes, assignments) for administrative compliance.

---

## Linked References
- Related Modules: `User`, `Branch`, `Landing-Page`.
