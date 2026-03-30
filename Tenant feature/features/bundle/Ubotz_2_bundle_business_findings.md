# UBOTZ 2.0 Bundle Business Findings

## Executive Summary
Bundles are a primary commercial tool for Ubotz 2.0 tenants. They allow institutions to group multiple existing `Courses` into a single sellable package (e.g., "Complete Web Development Path" containing HTML, CSS, and JS courses). Bundles drive higher Average Order Value (AOV) and simplify the enrollment process for long-term academic tracts.

## Operational Modalities

### 1. Composition
- **`bundle_courses`**: Admins select which courses belong to the bundle.
- **Independent Lifecycle**: Prices for bundles are distinct from the individual sum of their parts, allowing for "Bundle Discounts".
- **`access_days`**: Defines the global tenure for the entire package.

### 2. Enrollment Lifecycle
When a student purchases a **Bundle**, the system automatically generates **Course Enrollments** for every child course inside the package. This ensures that the student immediately gains access to all pedagogical materials with a single transaction.

### 3. Publication State
Bundles follow the standard state machine (`draft` $\rightarrow$ `published`). This allows marketing teams to prepare the bundle structure and marketing copy before syndeicating the SKU to the public landing page.

## Commercial Integration
Bundles are treated as a first-class `orderable_type` in the Payment module. Successful settlement of a bundle purchase emits a `BundlePurchasedEvent`, which triggers the bulk-enrollment listeners.

---

## Linked References
- Related Modules: `Course`, `Enrollment`, `Payment`.
