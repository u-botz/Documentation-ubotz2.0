# UBOTZ 2.0 User Business Findings

## Executive Summary
The User entity is the fundamental actor within the Ubotz 2.0 ecosystem. It represents students, instructors, and administrative staff. Users are strictly siloed within their respective Tenants, ensuring that a professional or student's interaction remains private and isolated to the institution they belong to.

## Operational Modalities

### 1. Identity & Profile
- **Core Identity**: Basic information including names, email, and phone.
- **Extended Profile**: Support for detailed academic and professional history (Education, Experience, Occupations) used primarily for instructor verification and student record-keeping.
- **Financial Flags**: Tracks internal billing states and creditworthiness for fee-based interactions.

### 2. Status & Lifecycle
- **Invited**: Initial state when an administrator creates a user or a teacher signup is pending.
- **Active**: Fully verified and authorized user.
- **Locked**: Safety mechanism triggered by failed login attempts or administrative suspension to prevent unauthorized access.

### 3. Authentication Policy
- **Force Password Reset**: New users or those with compromised accounts can be forced to reset their passwords on their next login.
- **Audit Trail**: Every user record tracks the `last_login_at` and `last_login_ip`, satisfying security compliance for B2B institutions.

## Multi-Tenant Isolation
User emails are unique **per tenant**. This allows a user to potentially exist on multiple Ubotz tenants using the same email address without account collisions, as their identity is always qualified by the `tenant_id`.

---

## Linked References
- Related Modules: `Role`, `User-Group`, `Attendance`.
