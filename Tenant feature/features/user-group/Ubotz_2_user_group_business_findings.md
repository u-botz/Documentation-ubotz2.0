# UBOTZ 2.0 — User group — Business Findings

## Executive summary

**User groups** let staff organize learners into **named segments** (scholarship cohorts, weekend batches, marketing lists) **without** changing their **role**. Groups power **targeted pricing** (tickets and special offers), **CRM**-style campaigns, and other features that join on `user_group_*` tables.

## Operations

- **View** — See groups and membership lists.
- **Manage** — Create, rename, retire groups, and **add/remove** members.

## Many-to-many

A user may belong to **several** groups simultaneously, supporting overlapping segments (for example both “Year 12” and “Scholarship”).

## Not a permission system

Groups are **not** RBAC: they do not replace **roles** and **capabilities** for authorization. They are a **business classification** layer.

---

## Linked references

- **User** — who can be added to groups
- **Pricing / Lead management** — targeting and eligibility
