# UBOTZ 2.0 User Group Business Findings

## Executive Summary
User Groups provide a logical layer for clustering users beyond their standardized Roles. They are primarily used by administrators for bulk communication, targeted promotional offers, and specialized reporting segments (e.g., "Scholarship Students", "Weekend Batch Users").

## Operational Modalities

### 1. Segmentation & Targeting
- **Bulk Actions**: Allows administrators to send notifications or emails to a specific subset of users without manually selecting individuals.
- **Special Offers**: Groups can be used as the target for `special_offer_user_groups`, unlocking specific pricing or course access only for group members.
- **Ticketing**: Support tickets can be routed or restricted based on group membership (`ticket_user_groups`).

### 2. Management Workflow
- **Creation**: Groups are created with a simple `name` and `status` (active/inactive).
- **Membership**: Users can belong to multiple groups simultaneously, allowing for many-to-many organizational structures.

## Commercial Integration
Groups are a powerful CRM tool. By segmenting students by performance or demographic into groups, tenants can execute highly targeted re-engagement campaigns or offer "Early Bird" discounts to loyal student clusters.

---

## Linked References
- Related Modules: `User`, `Notification`, `Subscription`.
