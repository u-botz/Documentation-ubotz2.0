# UBOTZ 2.0 Bundle Technical Specification

## Core Architecture
The Bundle module acts as a "Collection" layer over the `Course` aggregate. It resides in the `TenantAdminDashboard\Bundle` context.

## Relational Schema Constraints

### 1. Identity (`bundles`)
- **`tenant_id`**: Structural isolation key.
- **`slug`**: Unique per tenant for vanity URL resolution.
- **`price_cents`**: BigInt storing the package cost.

### 2. Relationship (`bundle_courses`)
- Many-to-Many join table mapping `bundles.id` to `courses.id`.
- Deletions are typically `restricted` to prevent breaking active bundle sales if a core course is deleted.

### 3. Attendance & Access (`bundle_enrollments`)
- Tracks the student's overall access to the package.
- Serves as the source of truth for the bulk-enrollment generator.

## Key Technical Workflows

### Bulk Enrollment Generation
1. `BundlePurchasedEvent` is received.
2. `InstantiateBundleEnrollmentUseCase` identifies all courses in `bundle_courses`.
3. It iterates and creates `course_enrollments` for the student, using the bundle's `access_days` as the default expiry.

## Tenancy & Security
Every query against the bundle catalog is filtered by `tenant_id`. Multi-tenant isolation ensures that a student cannot gain access to a bundle from "Tenant A" by manipulating URLs while authenticated on "Tenant B".

---

## Linked References
- Related Modules: `Course`, `Enrollment`, `Payment`.
