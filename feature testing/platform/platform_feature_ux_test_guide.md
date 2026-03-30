# Platform Admin: Feature, UX & Visual Testing Guide

This comprehensive guide covers **Feature (Functional)**, **UX (Experience)**, and **Visual (UI)** testing for the UBOTZ 2.0 Platform Super Admin Dashboard. Use this to verify that the platform is robust, intuitive, and visually consistent.

---

## 1. Tenant Provisioning & Management
*Access: `/super-admin-dashboard/tenants`*

### A. Feature Testing (Functional)
- [ ] **Successful Creation**: Provision a tenant. Verify `tenants` table has the record and status is `PROVISIONED`.
- [ ] **Default Seeding**: Verify 6 default roles (Owner, Admin, Teacher, Staff, Student, Parent) are created.
- [ ] **Config Setup**: Verify default settings (timezone, currency) are persisted in `tenant_configs`.
- [ ] **Idempotency**: Resubmit the same request. Verify blue alert: "Tenant already provisioned (idempotent request)."

### B. UX & Visual Testing
- [ ] **Auto-slug Generation**: Type "Global Academy" in Name. Verify Slug auto-fills with `global-academy` on blur.
- [ ] **Real-time Feedback**: Verify button becomes "Provisioning..." and a spinner appears upon submission.
- [ ] **Status Badge UI**: 
    - `ACTIVE`: Emerald (`bg-emerald-100 text-emerald-800`)
    - `SUSPENDED`: Red (`bg-red-100 text-red-800`)
    - `PROVISIONED`: Blue (`bg-blue-100 text-blue-800`)

---

## 2. Staff Management & RBAC
*Access: `/super-admin-dashboard/staff`*

### A. Feature Testing (Functional)
- [ ] **Hierarchy Shield**: A Super Admin (L60) **cannot** deactivate a Platform Owner (L90).
- [ ] **Account Protection**: A logged-in user **cannot** deactivate their own account (Action disabled).
- [ ] **Invite Flow**: Verify new staff receives an email to set their password.

### B. UX & Visual Testing
- [ ] **Sheet Interaction**: Use the slide-out "Create Staff" sheet. Verify you can still see the underlying list while the sheet is open.
- [ ] **Authority Clarity**: Dropdown must show human-readable labels (e.g., "Root Operator") instead of IDs.
- [ ] **Empty State**: Search for a non-existent name. Verify "No staff members found" view appears.

---

## 3. Subscription & Landing Page Workflows
*Access: `/super-admin-dashboard/subscription-plans` & `/landing-pages`*

### A. Feature Testing (Functional)
- [ ] **Workflow Integrity**: A Draft plan/template **must** be "Submitted" before a Root Approver (L2) can see the Approve/Reject buttons.
- [ ] **Rejection Enforcement**: Rejecting a request **requires** a reason (3-1000 chars). Verify reason is stored and visible to the requester.
- [ ] **Preview Logic**: Verify the "Preview" link for Landing Pages opens the correct template version.

### B. UX & Visual Testing
- [ ] **Action Visibility**: Actions like "Archive" or "Reject" should only appear for eligible statuses.
- [ ] **Feedback Loops**: After approval, verify the status badge updates instantly to `PUBLISHED` or `ACTIVE`.

---

## 4. Notification Center & Alerts
*Access: `/super-admin-dashboard/notifications`*

### A. Feature Testing (Functional)
- [ ] **Category Filtering**: Verify tabs (Billing, Security, System) filter the notification list correctly.
- [ ] **Mark as Read**: Click a notification. Verify its unread indicator disappears and the "Unread" count decrements.
- [ ] **Global Actions**: Use "Mark all as read". Verify all notifications update their status in the backend.

### B. UX & Visual Testing
- [ ] **Unread Marker**: Unread notifications should have a subtle blue highlight or dot indicator.
- [ ] **Preferences Panel**: Verify the "Notification Preferences" panel allows toggling specific channels.

---

## 5. System Health & Monitoring
*Access: `/super-admin-dashboard/system/monitoring`*

### A. Feature Testing (Functional)
- [ ] **Real-time Polling**: Metrics (MySQL, Redis, Queues) must update every 15 seconds.
- [ ] **Deep Dive Links**: Grafana (3001) and Prometheus (9090) links must open in a new tab.

### B. UX & Visual Testing
- [ ] **Service Status Cards**: 
    - Green "Online" (Operational)
    - Red "Offline" (Failing)
- [ ] **Queue Meter**: High/Default/Low queue sizes should have distinct color backgrounds (e.g., blue, slate, amber).

---

## 6. General Platform UX Standards
- [ ] **Navigation**: Sidebar correctly highlights the active route.
- [ ] **Toasts**: "sonner" toast notifications appear on top-right for all state-changing operations.
- [ ] **Responsive Design**: KPI cards and tables remain functional on tablet/mobile view-ports.
- [ ] **Performance**: Search/Filter operations should be debounced (300-500ms) to ensure smooth typing.
