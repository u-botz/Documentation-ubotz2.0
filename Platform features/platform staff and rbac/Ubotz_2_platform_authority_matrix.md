# UBOTZ 2.0 — Platform Authority Matrix

This document defines the roles, responsibilities, and specific capabilities of each administrative tier within the UBOTZ 2.0 platform.

| Tier | Label | Primary Mission |
|---|---|---|
| **L1** | Platform Owner | Ultimate governance and trust. |
| **L2** | Root Approver | High-impact decision gating. |
| **L3** | Root Operator | Infrastructure and technical execution. |
| **L4** | Super Admin | Day-to-day platform operations and support. |
| **L5** | Tenant Ops | Direct tenant assistance and onboarding support. |
| **L6** | Billing Admin | Financial operations and auditing. |
| **L7** | Audit Admin | Read-only compliance and security oversight. |

---

## 1. Capabilities by Level

### L1 — Platform Owner (Score: 90)
**The "Governance" Tier.**
- **Can Do**: 
  - Modify platform-level system settings (`system.manage`).
  - Manage all platform staff, including L1-L7 creation and role assignment (`staff.manage`).
  - All L2-L7 capabilities.
- **Cannot Do**: N/A (Root-level access).

### L2 — Root Approver (Score: 80)
**The "Gating" Tier.**
- **Can Do**:
  - Permanently delete tenants (`tenant.hard_delete`).
  - Approve/Reject institution type requests (`institution_type.approve`).
  - Activate/Deactivate platform staff (`staff.activate`, `staff.deactivate`).
- **Cannot Do**:
  - Modify global system settings.
  - Create or assign roles to other staff.

### L3 — Root Operator (Score: 70)
**The "Execution" Tier.**
- **Can Do**:
  - Trigger system deployments and database migrations (`system.deploy`, `system.db_migrate`).
  - Flush application cache and view raw system logs (`system.cache_flush`, `system.view_logs`).
  - Manage tenant users directly (`tenant_user.manage`).
- **Cannot Do**:
  - Approve high-impact structural changes (Requires L2).
  - Delete tenants permanently.

### L4 — Super Admin (Score: 60)
**The "Operational" Tier.**
- **Can Do**:
  - Full tenant lifecycle management (Provisioning, Suspension, Restore).
  - Manage tenant subscriptions and assign plans.
  - Handle admin account resets (Unlock, Force Password Reset).
  - View system health metrics.
- **Cannot Do**:
  - Perform infrastructure-level operations (Migrations, Logs).
  - Execute permanent deletions.

### L5 — Tenant Ops (Score: 50)
**The "Support" Tier.**
- **Can Do**:
  - View tenant records and configurations.
  - View landing page templates.
  - View tenant user lists.
- **Cannot Do**:
  - Change tenant status (Suspend/Restore).
  - Manage subscriptions or billing.

### L6 — Billing Admin (Score: 40)
**The "Financial" Tier.**
- **Can Do**:
  - Full billing management (Generate invoices, process refunds, freeze profiles).
- **Cannot Do**:
  - Manage tenants or staff.
  - Modify system settings.

### L7 — Audit Admin (Score: 30)
**The "Compliance" Tier.**
- **Can Do**: 
  - Read-only access to audit trails and system exports.
  - View subscription plans.
- **Cannot Do**:
  - ANY state-changing action.
  - View PII of higher-tier admins (Gated by row-level security).

---

## 2. Decision Matrix (Coarse Permissions)

| Category | Action | Min Level |
|---|---|---|
| **System** | Modify Global Settings | **L1** |
| | DB Migrations / Deployment | **L3** |
| | View Logs | **L3** |
| | View Health | **L4** |
| **Staff** | Manage Roles / Creation | **L1** |
| | Activate / Deactivate | **L2** |
| | Unlock / Password Reset | **L4** |
| | View Staff List | **L4** |
| **Tenant** | Permanent (Hard) Delete | **L2** |
| | Provision / Suspend / Restore | **L4** |
| | View Tenant Details | **L5** |
| **Billing** | Refund / Freeze / Manage | **L6** |
| | View Subscriptions | **L7** |
| **Audit** | View Audit Trail | **L7** |

---

## 3. Strict Rules of Authority

1. **The "Strictly Above" Rule**: No admin can perform a write operation on another admin unless they are of a strictly higher tier (e.g., L4 can manage L5, but L4 cannot manage L4).
2. **Coarse vs Fine Grained**: Access is checked in two layers. First, the user's `AuthorityLevel` must meet the minimum floor. Second, the user must have the specific `Permission` code assigned via their role.
3. **Hierarchy is Additive**: A Platform Owner (L1) inherently meets the level requirement for all L2-L7 actions, but they still require the specific permission assigned to their role to satisfy Layer 2 checks.

---

*End of Document — UBOTZ 2.0 Platform Authority Matrix — March 27, 2026*
