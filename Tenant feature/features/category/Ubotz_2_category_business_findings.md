# UBOTZ 2.0 Category Business Findings

## Executive Summary

**Categories** provide a **tenant-scoped, hierarchical tree** (`parent_id`) for organizing **courses** and other LMS entities. Each node has a **title**, URL-safe **`slug`** (unique per tenant), optional **icon**, and **`order`** for manual sorting in navigation and admin lists.

This feature is **separate from blog categories**, which belong to the **blog** module and different API paths.

---

## Hierarchy and risk

- **Nesting:** Unlimited depth is allowed by the schema (parent → child → …). Very deep trees can complicate UX and queries; product may impose limits in the UI only.
- **Deletion:** Deleting a category runs **application logic** to remove **descendants** first, and the database also **cascades** child category rows when a parent row is removed via FK. Courses or batches that **reference** a deleted category may need **reassignment** depending on FK rules elsewhere — validate before bulk deletes.

---

## Permissions

- **Viewing** the category tree is available to authenticated tenant users (see technical doc).
- **Creating, updating, and deleting** categories requires the **`category.manage`** capability.

---

## Linked references

- **Technical specification:** `Ubotz_2_category_technical_documentation.md` (routes, schema, delete behavior).
- **Related:** Course catalog, batches (required `category_id`), blog module for **content** categories.
