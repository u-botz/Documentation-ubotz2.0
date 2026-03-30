# UBOTZ 2.0 — Role — Business Findings

## Executive summary

**Roles** bundle **capabilities** (fine-grained permissions) so institutions can mirror real staff structure: owners and admins manage **roles**, while instructors, students, and custom roles receive only what they need. **System roles** protect core workflows; **custom roles** extend the model when the product allows creation.

## Capabilities vs roles

- A **role** is a named set of allowed actions (`quiz.edit`, `role.manage`, etc.).
- A **user** receives one or more role assignments; effective access is the union of capabilities on those roles, subject to middleware and any hierarchy rules enforced in use cases.

## Administration

- Viewing roles and the capability catalog requires **`role.view`**.
- Creating, editing, deleting, and toggling roles requires **`role.manage`**.
- The API can **filter** which capabilities appear when building a role of a given **type** (staff vs student, etc.), reducing accidental over-permissioning.

## Governance

- **Hierarchy** checks in role mutations prevent lower-privilege actors from elevating others beyond policy.
- **System roles** may be protected from destructive edits depending on product rules in the use cases.

---

## Linked references

- **Users** — assignment of roles to people
- **Audit** — role changes may be logged where the application records admin actions
