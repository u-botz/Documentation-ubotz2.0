# UBOTZ 2.0 — Platform Hub (Command Center): Business Findings

| Field | Value |
|---|---|
| **Document Type** | Principal Engineer — Business Logic Audit |
| **Feature** | Platform Hub (Command Center) |
| **Date** | 2026-03-27 |
| **Issued By** | Principal Engineer / Architecture Auditor |
| **Scope** | Platform-level monitoring and unified decision-making hub |
| **Status** | REVIEWED — Reflects current implemented state |

---

## 1. Executive Summary

The **Platform Hub (Command Center)** is the primary entry point for high-level platform administrators (Root Approvers and Platform Owners). It serves as a "control tower," providing real-time visibility into platform health, financial performance, and a consolidated queue of all items requiring formal approval according to the platform's multi-level governance model.

The Hub enforces the **Propose (L4) / Approve (L2/L1)** separation of concerns. It is a **read-only aggregator** — it does not hold or mutate approval state itself.

---

## 2. Core Components

### 2.1 Global Platform Statistics
A high-level dashboard providing real-time business health metrics. Due to the sensitive nature of financial data, this view is restricted to the **Platform Owner (Authority Level 90)** only.

- **Total Tenants**: Count of all tenants registered on the platform (including suspended tenants; soft-deleted/`removed_at` filtering is **not** applied at this layer).
- **Total Revenue**: Sum of all invoice amounts in cents (`invoices.total_amount_cents`), denominated in **INR** (platform default currency, hardcoded).
- **Active Subscriptions**: Count of `tenant_subscriptions` with `status = 'active'`.
- **Total Pending Approvals**: A combined signal computed as: pending plan submissions + pending refunds + pending plan archive requests. This is a headline roll-up number for the stat card only — the granular breakdown is provided by the Pending Approvals Queue (Section 2.2).

### 2.2 Unified Pending Approvals Queue
A centralized "To-Do" list for Root Approvers and Platform Owners. Instead of forcing admins to navigate between modules, all actionable items are surfaced in one place.

The queue aggregates **7 distinct categories** of pending actions:

| # | Category | Source |
|---|---|---|
| 1 | **Plan Submissions** | New subscription plans submitted by L4 staff, awaiting L2/L1 approval. |
| 2 | **Plan Archive Requests** | Plans whose archival has been requested. *(Currently returned as `0` — tracked as a status flag in the Stats headline, not yet a discrete queue item.)* |
| 3 | **Institution Type Submissions** | New institution classifications awaiting approval. |
| 4 | **Institution Type Archives** | Requests to retire institution categories. |
| 5 | **Refund Requests** | Financial reversal requests requiring manual verification. |
| 6 | **Tenant Payments** | Manual payment verifications (e.g., bank-transfer tenants in `pending_payment` status). |
| 7 | **Hard Deletion Requests** | Irreversible tenant data purge requests awaiting L2/L1 sign-off. |
| 8 | **Suspension Requests** | Tenant accounts flagged for disciplinary or billing suspension, pending approval. |

> **Note:** The "Plan Archive" queue slot (`pending_archive_requests`) is present in the API contract but is always `0` in the current implementation. Plan archival signals are instead folded into the `total_pending_approvals` stat headline via the `archive_requested` status on `subscription_plans`.

---

## 3. Authority & Governance

Access to the Command Center is strictly governed by the **Authority Matrix**:

| Role | Authority | Access Level |
|---|---|---|
| **Platform Owner** | 90 (L1) | Full access: Global Stats + Approval Queue. |
| **Root Approver** | 80 (L2) | Access to Approval Queue; no access to Global Stats. |
| **Platform Admin / Operator** | < 80 | No access to the Command Center. |

---

## 4. Business Rules — Complete Reference

| ID | Rule | Enforcement Point |
|---|---|---|
| BR-HUB-01 | Global business stats are visible only to the Platform Owner (Authority 90). | `DashboardStatsController` — authority middleware. |
| BR-HUB-02 | Items only appear in the Pending Queue if they have entered the correct pending state (e.g., `submitted_at IS NOT NULL` for plans, `status = 'pending_approval'` for deletion/suspension requests). | `EloquentPendingApprovalsQuery` filter logic. |
| BR-HUB-03 | The Approval Queue is accessible to Authority ≥ 80 (both Root Approver and Platform Owner). | `authority:80` middleware on the pending-approvals endpoint. |
| BR-HUB-04 | Revenue metrics are aggregated in the platform's default currency (INR, hardcoded). Multi-currency normalization is not performed at this layer. | `EloquentDashboardStatsQuery` — `currency: 'INR'`. |
| BR-HUB-05 | `total_pending_approvals` (stats headline) is computed as: `pending_plan_submissions + pending_refunds + pending_plan_archive_requests` — it is NOT a sum of all queue categories. | `EloquentDashboardStatsQuery`. |
| BR-HUB-06 | Hard Deletion and Suspension requests flow through dedicated request tables (`tenant_hard_deletion_requests`, `tenant_suspension_requests`), keeping audit trails separate from the tenant record itself. | Schema design. |
| BR-HUB-07 | Tenant count includes all registered tenants (no soft-delete filter). Suspended or payment-pending tenants are counted. | `EloquentDashboardStatsQuery` — no `removed_at` filter on `tenants`. |

---

## 5. Decision Support Guardrails

1. **Real-time, Lazy Aggregation**: Queue counts are computed on-the-fly on each request. Once an L2 admin processes an item in its own module, the count automatically drops on the next load.
2. **Action Ownership**: Approval/rejection actions are audited in `admin_audit_logs`, linking each action to the actor, timestamp, and context.
3. **View-Only Contract**: The Command Center API is strictly read-only (`GET` only). All mutations happen in their respective domain endpoints.

---

*End of Document — UBOTZ 2.0 Platform Hub (Command Center) Business Findings — March 27, 2026*
