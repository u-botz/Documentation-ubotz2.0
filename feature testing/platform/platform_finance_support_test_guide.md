# Platform Admin: Finance, Support & Security Testing Guide

This guide covers the "Other" critical platform management features: **Finance (Billing/Refunds)**, **Support (Troubleshooting/Impersonation)**, and **Security (IP Restrictions/Settings)**.

---

## 1. Finance & Billing Operations
*Access: `/super-admin-dashboard/billing` & `/refunds`*

### A. Feature Testing (Functional)
- [ ] **Tiered Refund Approval**: 
    - Tier 2 (Medium): Verify L4 (60) cannot approve; L2 (80) is required.
    - Tier 3 (High): Verify L2 (80) cannot approve; Platform Owner (L90) is required.
- [ ] **Four-Eyes Principle**: Create a refund request as Admin A. Verify Admin A **cannot** approve their own request even if they have the authority.
- [ ] **Invoice Generation**: Select a tenant and click "Download Invoice". Verify the PDF contains correct branding, line items (users/storage), and tax calculations.
- [ ] **Audit Trail**: Verify every refund state change (Request -> Approve -> Process) is logged in `admin_audit_logs`.

### B. UX & Visual Testing
- [ ] **Refund Modal**: Should clearly display the Tier, Reason, and Amount in a contrasting `CurrencyFormatter`.
- [ ] **Status Badges**: 
    - `Approved`: Green
    - `Pending Approval`: Amber
    - `Processed`: Blue/Slate
- [ ] **Action Blockers**: If the user lacks authority, show a yellow alert box within the modal explaining why buttons are disabled.

---

## 2. Support & Troubleshooting
*Access: `/super-admin-dashboard/tenants/{id}/support`*

### A. Feature Testing (Functional)
- [ ] **Full Impersonation**: Start impersonation of a Tenant Admin.
    - Verify the API client switches to the impersonation token.
    - Verify all actions taken are marked in logs with `actor_id` (Real Admin) and `subject_id` (Impersonated User).
- [ ] **Session Management**: List active sessions for a tenant. Perform a "Force Logout" on a user. Verify that user's JWT is immediately blacklisted.
- [ ] **Error Logs**: Trigger a deliberate error in a tenant. Verify the "Error Logs" view in the Super Admin dashboard captures it within 60 seconds.

### B. UX & Visual Testing
- [ ] **Impersonation Banner**: A **RED STICKY BANNER** must appear at the top of the entire app. It must show "Operating as [User Name]".
- [ ] **Support Snapshot**: KPI cards for "Active Sessions (24h)" and "Errors (24h)" should provide a quick "Health Pulse" of the tenant.
- [ ] **Timeline View**: The activity timeline should use distinct icons for different event types (Login, Payment, Quiz Submit).

---

## 3. Platform Security & Settings
*Access: `/super-admin-dashboard/system`*

### A. Feature Testing (Functional)
- [ ] **IP Whitelisting**: Add your current IP to the restriction list. Then try to login from a different IP (VPN). Verify access is blocked with a 403.
- [ ] **Global Setting Lockdown**: Change the "Platform Name" or "Default Currency". Verify the change propagates to all newly created tenants but doesn't overwrite existing tenant overrides.
- [ ] **Authority Elevation**: Verify only a Platform Owner (L90) can add new IP restrictions.

### B. UX & Visual Testing
- [ ] **Setting Groups**: Settings should be logically grouped (General, Security, Email, Integrations) in a tabbed or sidebar layout.
- [ ] **Safety Confirmation**: State-changing actions in Security (like deleting an IP restriction) must require a double-confirmation dialog.
- [ ] **Audit Review**: A central "Platform Audit" table should allow filtering by Admin ID and Action Type.

---

## 4. General Support UX Standards
- [ ] **Context Preservation**: Stopping impersonation should return the Admin to the exact Support page they started from.
- [ ] **Live Telemetry**: Monitoring dashboards should show a "Last Updated" timestamp to confirm the data is fresh.
- [ ] **Deep Linking**: Admins should be able to share a direct link to a specific Error Log entry for collaboration.
