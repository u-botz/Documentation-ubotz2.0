# UBOTZ 2.0 Role Business Findings

## Executive Summary
The Role module implements a robust Role-Based Access Control (RBAC) system. It allows Tenant administrators to define exactly what each user can see and do within the platform, from high-level "Owner" access to granular "Instructor" or "Staff" permissions.

## Operational Modalities

### 1. Capability-Based Authorization
Unlike rigid, hard-coded roles, Ubotz roles are collections of **Capabilities**.
- **Examples**: `quiz.create`, `payment.view`, `attendance.mark`.
- This allows for flexible staff structures where a "Branch Manager" might have payment viewing rights while a "Teacher" is restricted only to academic content.

### 2. System vs. Custom Roles
- **System Roles**: Pre-defined templates (Owner, Admin, Instructor, Student) that ensure core platform workflows remain intact.
- **Custom Roles**: (Optional/Enterprise) Allows tenants to create bespoke definitions like "Librarian" or "Junior Accountant" by selecting specific capability bundles.

### 3. Hierarchy & Governance
Roles follow a hierarchy that prevents lower-level staff (e.g., an Instructor) from modifying higher-level settings (e.g., Tenant Billing) even if they were inadvertently granted a conflicting capability.

## Staff Role Expansion
Recent updates have expanded the "Staff" role capabilities, especially for Lead Management and CRM functions, allowing localized branch staff to handle the entire lead-to-enrollment funnel.

---

## Linked References
- Related Modules: `User`, `Tenant-Provisioning`.
