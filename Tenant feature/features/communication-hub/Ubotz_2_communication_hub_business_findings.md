# UBOTZ 2.0 Communication Hub Business Findings

## Executive Summary
The Communication Hub is the central broadcasting center for Ubotz 2.0 tenants. It replaces siloed email or SMS tools with an integrated platform for institutional announcements, course-specific updates, and administrative notifications.

## Operational Modalities

### 1. Multi-Channel Broadcasting
Administrators can compose a single message and dispatch it to multiple channels simultaneously (Push, In-App, and potentially WhatsApp/Email).
- **Revision Control**: Messages support drafts and versioning (`revision_count`), allowing multiple staff members to collaborate on a broadcast before publication.
- **Acknowledgments**: High-priority announcements can require a student "Acknowledgment", providing the institution with a legal audit trail that a student has read a specific policy or notice.

### 2. Audience Segmentation
Targeting is governed by "Scopes", allowing messages to be laser-focused:
- **Batch Scoping**: "All students in the JEE 2026 Morning Batch".
- **Course Scoping**: "Everyone enrolled in the Advanced Physics course".
- **Global Scoping**: "Platform-wide holiday announcement".

### 3. Read Receipts
The system tracks `read_at` timestamps for every recipient, enabling instructors to identify students who are not engaging with course updates.

## Governance
Only users with the `communication.publish` capability can distribute messages to large audiences, preventing unauthorized mass-messaging by junior staff.

---

## Linked References
- Related Modules: `User`, `Batch`, `Course`, `Notification`.
