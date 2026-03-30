# UBOTZ 2.0 User Group Technical Specification

## Core Architecture
User Groups are implemented as a light-weight organizational layer in the Tenant database. They utilize a standard many-to-many relationship with the `User` entity.

## Relational Schema Constraints

### 1. Definition (`user_groups`)
- **`tenant_id`**: Strict isolation boundary.
- **`name`**: Unique per tenant (`unique(['tenant_id', 'name'])`).
- **`status`**: Boolean-like state (`active`, `inactive`) governing group visibility.

### 2. Membership (`user_group_members`)
- Join table linking `user_groups.id` to `users.id`.
- Enforces an index on `tenant_id` to ensure membership queries remain within the tenant's security boundary.

## Integration Points
- **Support Tickets**: `ticket_user_groups` maps groups to specific helpdesk visibility.
- **Marketing**: `special_offer_user_groups` binds groups to pricing concessions and course bundles.

## Performance Invariants
- **Soft Deletes**: Enabled on the `user_groups` table to prevent catastrophic data loss in cross-referenced modules (like Tickets) if a group is removed.
- **Tenant Scoping**: All group lookups are filtered through the standard global scope.

---

## Linked References
- Related Modules: `User`, `CommunicationHub`.
