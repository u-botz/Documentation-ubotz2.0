# UBOTZ 2.0 — Phase 15G Developer Instructions

## Lead Deduplication & Merge

| Field | Value |
|---|---|
| **Document Type** | Developer Instruction (Pre-Implementation Brief) |
| **Phase** | 15G |
| **Date** | March 26, 2026 |
| **Issued By** | Principal Engineer / Architecture Auditor |
| **Audience** | Implementation Developer (Antigravity) |
| **Expected Deliverable** | Phase 15G Implementation Plan |
| **Prerequisites** | Phase 15A COMPLETE (Lead Management), Phase 15C-I COMPLETE (Structured Activities, Follow-up Tasks) |

> **As lead sources multiply (website forms, Meta Lead Ads, WhatsApp inbound, walk-in entry, bulk import), duplicates become inevitable. The same prospect fills out a website form with their email, calls in and gets entered with just a phone number, then messages on WhatsApp — three lead records, one person. Phase 15G detects duplicate candidates using phone and email matching with confidence tiers, presents them in a review queue for human-approved merging, and consolidates all activity history, follow-ups, WhatsApp messages, and metadata into a single clean lead record. Data quality is the foundation of trustworthy CRM metrics.**

---

## 1. Mission Statement

Phase 15G builds **Lead Deduplication & Merge** within the existing `TenantAdminDashboard/LeadManagement` bounded context.

The system has two modes:
1. **Proactive detection** — On lead creation and via a periodic scan, the system identifies potential duplicate leads and presents them in a review queue.
2. **Manual search** — Admins can search for duplicates of a specific lead at any time.

Merging is always **human-approved** — the system never auto-merges. An admin selects a primary lead (to keep) and secondary lead(s) (to absorb), reviews the merge preview, and confirms. All data from secondary leads is transferred to the primary. Secondary leads are soft-deleted with a `merged_into_lead_id` reference.

**What this phase includes:**
- Duplicate detection engine with confidence tiers (High, Medium, Low)
- Detection on lead creation (real-time) — flags potential duplicates before/after creation
- Periodic duplicate scan (scheduled command) across all leads
- Duplicate review queue UI (list of candidate pairs/groups with confidence scores)
- Manual duplicate search (admin searches for matches of a specific lead)
- Merge preview (side-by-side comparison of lead data)
- Human-approved merge operation (select primary, confirm, execute)
- Data consolidation: activities, follow-up tasks, WhatsApp messages, notes, metadata merged to primary
- Score recalculation on primary after merge (if 15C-II is complete)
- Merge audit trail (who merged what, when, what was consolidated)
- Plan-gated via `module.lead_dedup` module entitlement

**What this phase does NOT include:**
- Automatic merging without human review
- Fuzzy name matching (Phase 1 uses exact phone/email matching only — fuzzy deferred)
- Cross-tenant deduplication (duplicates are detected within a single tenant only)
- Bulk merge (merge multiple duplicate groups in one action)
- Undo merge (merges are permanent — the secondary lead's data is moved, not copied)
- Deduplication rules configuration by tenants (detection logic is platform-defined)

---

## 2. Business Context

### 2.1 The Duplicate Problem

Duplicates arise from:

| Scenario | How Duplicate Occurs |
|---|---|
| Multi-channel enquiry | Lead fills website form (email captured) → calls in the next day (phone captured, new lead created manually) |
| Meta Lead Ads + walk-in | Lead clicks Facebook ad and submits form → visits campus the same week → counselor creates a walk-in lead |
| WhatsApp inbound + website | Lead sends WhatsApp message (auto-created with phone) → later fills website form (created with email) |
| Re-enquiry | Lead was rejected 6 months ago → re-enquires through a different channel → new lead created |
| Data entry errors | Two counselors enter the same walk-in lead independently |

### 2.2 Why Duplicates Are Harmful

- **Inflated metrics:** "500 leads this month" means nothing if 80 are duplicates. Source ROI (15E), conversion rates, and counselor performance metrics are all wrong.
- **Counselor confusion:** Two counselors work the same prospect independently, sending duplicate messages and making conflicting promises.
- **Scoring errors:** Lead scoring (15C-II) undervalues the lead because activity is split across two records.
- **Automation misfires:** Automation rules (15C-III) fire twice — one for each duplicate.

### 2.3 What Changes

After Phase 15G:
1. When a new lead is created, the system checks for existing leads with the same phone or email. If found, the counselor is alerted: "Possible duplicate: a lead with this phone number already exists."
2. A nightly scan finds all duplicate candidate pairs across the tenant and populates a review queue.
3. Branch managers and admins review the queue, see side-by-side comparisons, and merge duplicates with one click.
4. After merge, all activities, follow-ups, and WhatsApp messages are consolidated on the surviving lead. The score is recalculated. The merged lead is soft-deleted.

---

## 3. Business Rules (NON-NEGOTIABLE)

### 3.1 Detection Rules

| Rule ID | Rule | Detail |
|---|---|---|
| BR-01 | **High confidence match:** Two leads share the same phone number (exact match, normalized) OR the same email address (exact match, case-insensitive). | These are almost certainly the same person. |
| BR-02 | **Medium confidence match:** Two leads share the same phone but different emails, or the same email but different phones. Both fields are populated on both leads. | Could be the same person with updated info, or a family member. |
| BR-03 | Phone numbers are normalized before comparison: strip spaces, dashes, parentheses, and leading `+`. Compare the last 10 digits (to handle country code variations). | `+91 98765 43210`, `09876543210`, and `9876543210` are all the same number. |
| BR-04 | Email comparison is case-insensitive and trims whitespace. No domain normalization (gmail.com dot-stripping, etc.) in Phase 1. | `Rahul@Example.com` matches `rahul@example.com`. |
| BR-05 | Detection only runs within a single tenant. Cross-tenant matching is never performed. | Tenant isolation. |
| BR-06 | Leads with stage `rejected` ARE included in duplicate detection. A re-enquiry from a previously rejected lead is a common and valuable duplicate to detect. | The merge may reactivate the lead by keeping the newer, active record as primary. |
| BR-07 | Leads already marked as `merged_into_lead_id IS NOT NULL` (previously merged secondaries) are excluded from detection. | Prevents re-flagging already-resolved duplicates. |

### 3.2 Detection Timing Rules

| Rule ID | Rule | Detail |
|---|---|---|
| BR-08 | **On lead creation:** After `CreateLeadUseCase` succeeds, check for existing leads with matching phone or email. If duplicates found, create entries in `lead_duplicate_candidates`. Do NOT block lead creation — create the lead, then flag the duplicate. | The counselor or auto-assign should not be blocked by dedup logic. |
| BR-09 | **Periodic scan:** A scheduled command `crm:scan-duplicates` runs nightly at 1:00 AM. It scans all leads in all active tenants for duplicate candidates not already flagged. | Catches duplicates that predate the real-time detection or were created via bulk import. |
| BR-10 | Detection is **idempotent**: if a duplicate pair (Lead A, Lead B) is already in the candidates table, it is not re-inserted. | Prevents duplicate entries in the review queue. |
| BR-11 | When a lead's phone or email is updated, duplicate detection re-runs for that lead. | An email added to a phone-only lead may now match an email-only lead. |

### 3.3 Review Queue Rules

| Rule ID | Rule | Detail |
|---|---|---|
| BR-12 | Duplicate candidates are stored in a `lead_duplicate_candidates` table with: `lead_id_a`, `lead_id_b`, `confidence` (high/medium), `match_field` (phone/email/both), `status` (pending/merged/dismissed), `detected_at`. | The review queue reads from this table. |
| BR-13 | Candidates can be **dismissed**: the admin reviews and decides these are NOT duplicates (e.g., parent and student sharing a phone). Dismissed candidates are not re-flagged by the periodic scan. | `status = 'dismissed'`, `dismissed_by`, `dismissed_at`. |
| BR-14 | The review queue shows candidates grouped by lead. If Lead A is a potential duplicate of Lead B and Lead C, all three appear as a group. | Grouping prevents the admin from merging A+B but missing A+C. |
| BR-15 | Candidates are sorted by confidence (high first), then by detected_at (newest first). | High-confidence matches deserve attention first. |

### 3.4 Merge Rules

| Rule ID | Rule | Detail |
|---|---|---|
| BR-16 | Merge requires selecting a **primary lead** (the surviving record) and one or more **secondary leads** (to be absorbed). | The admin chooses which lead to keep based on data quality, activity volume, and stage progression. |
| BR-17 | A **merge preview** shows the primary and secondary leads side-by-side with: name, email, phone, source, stage, score, activity count, assigned counselor, created date. Fields where the secondary has data but the primary doesn't are highlighted as "will be added." | The admin sees exactly what will happen before confirming. |
| BR-18 | On merge, the following data is transferred from secondary to primary: | See §3.5 Data Consolidation Rules. |
| BR-19 | The merge operation runs in a **single database transaction** with pessimistic locking on both lead records. | Prevents concurrent modifications during merge. |
| BR-20 | After merge, the secondary lead is **soft-deleted** with `merged_into_lead_id = primary_lead_id` and `merged_at = now()`. | The secondary record is preserved for audit but excluded from all active queries. |
| BR-21 | After merge, `LeadsMerged` domain event is dispatched (outside transaction). If 15C-II is complete, the primary lead's score is recalculated. | The merged lead now has more activities → score should increase. |
| BR-22 | Merge is **irreversible** in Phase 1. No undo functionality. The admin must confirm with a typed confirmation ("MERGE" or similar). | Preventing accidental merges. |
| BR-23 | All merge operations are audit-logged with: who merged, primary lead_id, secondary lead_id(s), timestamp, data transferred summary. | Full audit trail. |
| BR-24 | Only users with `crm.dedup.merge` capability can execute merges. | Admin-only operation. |

### 3.5 Data Consolidation Rules

When secondary lead is merged into primary:

| Data Type | Consolidation Rule |
|---|---|
| **Activities** (`lead_activities`) | All activities from secondary are re-assigned to primary: `UPDATE lead_activities SET lead_id = primary_id WHERE lead_id = secondary_id`. Activity history is preserved chronologically. |
| **Follow-up Tasks** (`lead_follow_up_tasks`) | All tasks from secondary are re-assigned to primary. `pending` and `overdue` tasks remain active under the primary lead. |
| **WhatsApp Messages** (`whatsapp_conversation_messages`) | All messages re-assigned to primary. Conversation thread merges chronologically. |
| **WhatsApp Service Window** (`whatsapp_service_windows`) | If secondary has an active window and primary does not, transfer it. If both have windows, keep the one that expires later. |
| **Notes** (legacy `lead_notes` if still present) | Re-assign to primary. |
| **Follow-ups** (legacy `lead_follow_ups` if still present) | Re-assign to primary. |
| **Lead fields** | If primary has a NULL field and secondary has a value, copy the secondary's value to the primary. Specifically: `email`, `phone`, `address`, `metadata` (deep merge). If both have values, the primary's value wins. |
| **Source** | Primary's source is kept. Secondary's source is noted in metadata: `metadata.merged_sources = ["website", "facebook_ads"]`. |
| **Stage** | Primary's stage is kept (it's typically the more progressed lead). |
| **Score** | Recalculated after merge from the consolidated data. |
| **Assigned counselor** | Primary's assignment is kept. |
| **Branch** | Primary's branch is kept. |
| **Metadata** | Deep merge: secondary's metadata keys are added to primary if they don't already exist in primary. Primary's keys take precedence on conflicts. `meta_form_responses` and `meta_attribution` from secondary are preserved under a `merged_metadata` key. |
| **Audit log entries** | NOT transferred. Audit logs reference the original `lead_id`. A new audit entry records the merge event on the primary lead. |

---

## 4. Domain Model

### 4.1 Bounded Context Placement

All components within `TenantAdminDashboard/LeadManagement/`. Deduplication is a lead management concern, not a separate context.

### 4.2 New Domain Layer Components

**Path:** `app/Domain/TenantAdminDashboard/LeadManagement/`

| Component | Type | Purpose |
|---|---|---|
| `DuplicateCandidate` | Value Object | Holds lead_id_a, lead_id_b, confidence (high/medium), match_field (phone/email/both). Immutable. |
| `DuplicateConfidence` | Value Object | `high`, `medium`. |
| `DuplicateCandidateStatus` | Value Object | `pending`, `merged`, `dismissed`. |
| `MergePreview` | Value Object | Side-by-side data comparison between primary and secondary. Lists which fields will be added/overwritten. |
| `LeadsMerged` | Domain Event | Dispatched after merge. Carries primary_lead_id, secondary_lead_ids[], merge_summary. |
| `DuplicateCandidateRepositoryInterface` | Repository Interface | CRUD for candidates. Query pending candidates grouped by lead. Dismiss candidates. |

### 4.3 New Application Layer Components

| Component | Type | Purpose |
|---|---|---|
| `DetectDuplicatesForLeadUseCase` | Use Case | Takes a lead_id, finds matching leads by phone/email. Creates candidate records if matches found. Called after lead creation and on lead update. |
| `ScanAllDuplicatesCommand` | Console Command | `crm:scan-duplicates`. Nightly scan across all tenants. |
| `GetDuplicateQueueQuery` | Query | Returns pending duplicate candidates grouped by lead, with confidence, match field, and both leads' summary data. Paginated. |
| `GetMergePreviewQuery` | Query | Returns a detailed side-by-side comparison for a specific candidate pair. Shows what data will be transferred. |
| `MergeLeadsUseCase` | Use Case | The core merge operation. Accepts primary_id + secondary_id(s). Validates both leads exist and are in the same tenant. Runs data consolidation in a transaction. Soft-deletes secondary. Dispatches `LeadsMerged`. |
| `DismissDuplicateCandidateUseCase` | Use Case | Marks a candidate as dismissed. Prevents re-flagging. |
| `SearchDuplicatesForLeadQuery` | Query | Manual search: takes a lead_id, returns all potential matches (same logic as `DetectDuplicatesForLeadUseCase` but read-only). |
| `RecalculateScoreAfterMergeListener` | Listener | Listens to `LeadsMerged`. Calls `RecalculateLeadScoreUseCase` (15C-II) for the primary lead. Graceful if 15C-II not present. |

### 4.4 Modified Application Layer

| Component | Modification |
|---|---|
| `CreateLeadUseCase` (15A) | After successful lead creation, dispatches `DetectDuplicatesForLeadUseCase` asynchronously (queued job). Does NOT block lead creation. |
| `UpdateLeadUseCase` (15A) | After phone/email update, re-runs duplicate detection for the updated lead. |

### 4.5 Infrastructure Layer

| Component | Type | Purpose |
|---|---|---|
| `LeadDuplicateCandidateRecord` | Eloquent Model | Maps to `lead_duplicate_candidates`. `BelongsToTenant`. |
| `EloquentDuplicateCandidateRepository` | Repository | Implements interface. Includes `findPendingGroupedByLead()` for the review queue. |
| `DetectDuplicatesForLeadJob` | Queued Job | Dispatched by CreateLeadUseCase. Calls `DetectDuplicatesForLeadUseCase`. `default` queue. |
| `PhoneNormalizer` | Utility Service | Normalizes phone numbers: strips spaces, dashes, parens, `+`, compares last 10 digits. Shared utility. |

### 4.6 HTTP Layer

**Controller:**

`app/Http/Controllers/Api/TenantAdminDashboard/LeadManagement/LeadDeduplicationController.php`

| Endpoint | Method | Capability |
|---|---|---|
| `GET /api/tenant/crm/duplicates` | List pending duplicate candidates (review queue) | `crm.dedup.view` |
| `GET /api/tenant/crm/duplicates/{candidateId}/preview` | Merge preview for a candidate pair | `crm.dedup.view` |
| `POST /api/tenant/crm/duplicates/{candidateId}/merge` | Execute merge | `crm.dedup.merge` |
| `POST /api/tenant/crm/duplicates/{candidateId}/dismiss` | Dismiss candidate (not a duplicate) | `crm.dedup.view` |
| `GET /api/tenant/leads/{lead}/duplicates` | Search for duplicates of a specific lead | `crm.dedup.view` |

**Form Requests:**

| Request | Validates |
|---|---|
| `MergeLeadsRequest` | `primary_lead_id` (required, integer, must be one of the leads in the candidate pair), `confirmation` (required, string, must equal "MERGE") |
| `DismissCandidateRequest` | `reason` (optional, string, max 255) |

**Query Parameters for duplicate list:**

| Param | Type | Description |
|---|---|---|
| `confidence` | string | Filter: `high`, `medium`, or `all` (default: all) |
| `page` | integer | Pagination |
| `per_page` | integer | Default 20 |

**API Resources:**

| Resource | Shapes |
|---|---|
| `DuplicateCandidateResource` | `id`, `confidence`, `match_field`, `detected_at`, `lead_a` (summary: id, name, email, phone, source, stage, score, activity_count, created_at), `lead_b` (same summary) |
| `MergePreviewResource` | `primary` (full lead detail), `secondary` (full lead detail), `data_to_transfer` → `{activities_count, follow_ups_count, whatsapp_messages_count, fields_to_fill: ["email", "address"], metadata_keys_to_merge: ["meta_form_responses"]}`, `warnings` (e.g., "Both leads have different assigned counselors — primary's assignment will be kept") |

**Capability Codes:**

| Code | Who Has It | Purpose |
|---|---|---|
| `crm.dedup.view` | Admins, Branch Managers | View duplicate queue, preview merges, dismiss candidates |
| `crm.dedup.merge` | Admins only | Execute merge operations |

---

## 5. Database Schema

### 5.1 New Tables

**`lead_duplicate_candidates`** (tenant-scoped)

| Column | Type | Notes |
|---|---|---|
| `id` | BIGINT UNSIGNED PK | Auto-increment |
| `tenant_id` | BIGINT UNSIGNED NOT NULL | FK → `tenants.id`. |
| `lead_id_a` | BIGINT UNSIGNED NOT NULL | FK → `leads.id`. Always the lower ID of the pair (canonical ordering for dedup). |
| `lead_id_b` | BIGINT UNSIGNED NOT NULL | FK → `leads.id`. Always the higher ID. |
| `confidence` | VARCHAR(10) NOT NULL | `high`, `medium`. |
| `match_field` | VARCHAR(10) NOT NULL | `phone`, `email`, `both`. |
| `status` | VARCHAR(20) NOT NULL DEFAULT 'pending' | `pending`, `merged`, `dismissed`. |
| `dismissed_by` | BIGINT UNSIGNED NULLABLE | FK → `users.id`. Set when dismissed. |
| `dismissed_at` | TIMESTAMP NULLABLE | |
| `dismiss_reason` | VARCHAR(255) NULLABLE | |
| `merged_at` | TIMESTAMP NULLABLE | Set when merge executed. |
| `merged_by` | BIGINT UNSIGNED NULLABLE | FK → `users.id`. |
| `primary_lead_id` | BIGINT UNSIGNED NULLABLE | Set when merged — which lead survived. |
| `detected_at` | TIMESTAMP NOT NULL | When the duplicate was first detected. |
| `created_at` | TIMESTAMP | |

**Indexes:**
- `unq_dedup_pair` → `(tenant_id, lead_id_a, lead_id_b)` UNIQUE WHERE `status = 'pending'` — prevents duplicate entries for the same pair. Canonical ordering (lower ID always lead_id_a) ensures (A,B) and (B,A) are the same entry.
- `idx_dedup_tenant_status` → `(tenant_id, status, confidence)` — for the review queue query
- `idx_dedup_lead_a` → `(lead_id_a)` — for finding candidates involving a specific lead
- `idx_dedup_lead_b` → `(lead_id_b)` — same

### 5.2 Modified Tables

**`leads`** — Add columns:

| Column | Type | Notes |
|---|---|---|
| `merged_into_lead_id` | BIGINT UNSIGNED NULLABLE | FK → `leads.id`. Set when this lead is merged into another. |
| `merged_at` | TIMESTAMP NULLABLE | When the merge occurred. |
| `phone_normalized` | VARCHAR(20) NULLABLE | Normalized phone number (last 10 digits, no formatting). Indexed. Used for duplicate detection queries. |

**Indexes:**
- `idx_leads_phone_normalized` → `(tenant_id, phone_normalized)` — for fast phone-based duplicate detection
- `idx_leads_email_lower` → `(tenant_id, LOWER(email))` — for fast email-based duplicate detection (functional index if MySQL 8.0 supports, otherwise application-level normalization)

**Important:** The `phone_normalized` column must be populated for all existing leads via a data migration. New leads compute it on creation.

---

## 6. Detection Algorithm

### 6.1 For a Single Lead (Real-time and Manual Search)

```
Input: lead_id
Output: list of DuplicateCandidate

1. Load the lead's phone_normalized and email (lowercased)
2. If phone_normalized is NOT NULL:
   a. Find all leads WHERE phone_normalized = lead.phone_normalized
      AND id != lead.id AND merged_into_lead_id IS NULL AND tenant_id = lead.tenant_id
3. If email is NOT NULL:
   b. Find all leads WHERE LOWER(email) = LOWER(lead.email)
      AND id != lead.id AND merged_into_lead_id IS NULL AND tenant_id = lead.tenant_id
4. Combine results:
   - If a lead appears in BOTH phone and email results → confidence = HIGH, match_field = 'both'
   - If a lead appears in phone results only → confidence = HIGH, match_field = 'phone'
   - If a lead appears in email results only → confidence = HIGH, match_field = 'email'
   - If a lead appears in phone results but has a DIFFERENT non-null email than our lead → confidence = MEDIUM, match_field = 'phone'
   - If a lead appears in email results but has a DIFFERENT non-null phone than our lead → confidence = MEDIUM, match_field = 'email'
5. For each match, check if a candidate already exists (same pair, status = pending or dismissed)
   - If pending: skip (already in queue)
   - If dismissed: skip (admin already reviewed)
   - If not exists: insert new candidate
```

### 6.2 Nightly Full Scan

```
crm:scan-duplicates command:

1. For each active tenant:
   a. Set TenantContext
   b. Find all leads WHERE merged_into_lead_id IS NULL AND deleted_at IS NULL

   Phone-based detection:
   c. SELECT phone_normalized, GROUP_CONCAT(id) as lead_ids, COUNT(*) as cnt
      FROM leads
      WHERE phone_normalized IS NOT NULL AND merged_into_lead_id IS NULL AND deleted_at IS NULL
      GROUP BY phone_normalized
      HAVING cnt > 1
   d. For each group: create candidate pairs for all combinations (if not already flagged)

   Email-based detection:
   e. SELECT LOWER(email) as email_lower, GROUP_CONCAT(id) as lead_ids, COUNT(*) as cnt
      FROM leads
      WHERE email IS NOT NULL AND merged_into_lead_id IS NULL AND deleted_at IS NULL
      GROUP BY LOWER(email)
      HAVING cnt > 1
   f. For each group: create candidate pairs for all combinations (if not already flagged)

   g. Assign confidence per §6.1 logic
   h. Reset TenantContext
```

**Canonical pair ordering:** When creating a candidate, always store `lead_id_a = MIN(id)` and `lead_id_b = MAX(id)`. This ensures the unique constraint prevents (A,B) and (B,A) from being stored as separate records.

---

## 7. Merge Operation — Detailed Specification

### 7.1 Merge Flow

```
MergeLeadsUseCase(primary_lead_id, secondary_lead_id, confirmed_by_user_id):

1. Validate both leads exist, are in the same tenant, neither is already merged
2. Validate user has crm.dedup.merge capability
3. Begin database transaction with pessimistic locking:
   a. SELECT FOR UPDATE on both lead records (primary first, then secondary — consistent lock ordering to prevent deadlocks)

4. Transfer activities:
   UPDATE lead_activities SET lead_id = primary_id WHERE lead_id = secondary_id

5. Transfer follow-up tasks:
   UPDATE lead_follow_up_tasks SET lead_id = primary_id WHERE lead_id = secondary_id

6. Transfer WhatsApp conversation messages (if table exists):
   UPDATE whatsapp_conversation_messages SET lead_id = primary_id WHERE lead_id = secondary_id

7. Transfer WhatsApp service window (if exists):
   - If secondary has window and primary doesn't: UPDATE SET lead_id = primary_id
   - If both have windows: keep the one with later expires_at, delete the other
   - If only primary has window: no action

8. Transfer legacy notes and follow-ups (if tables exist):
   UPDATE lead_notes SET lead_id = primary_id WHERE lead_id = secondary_id
   UPDATE lead_follow_ups SET lead_id = primary_id WHERE lead_id = secondary_id

9. Fill missing fields on primary from secondary:
   FOR EACH field IN [email, phone, phone_normalized, address, ...]:
     IF primary.field IS NULL AND secondary.field IS NOT NULL:
       primary.field = secondary.field

10. Merge metadata:
    primary.metadata = deep_merge(primary.metadata, secondary.metadata)
    — Primary keys take precedence on conflict
    — Secondary's unique keys are preserved

11. Record merged sources:
    primary.metadata.merged_sources = [secondary.source]
    primary.metadata.merged_lead_ids = [secondary.id]

12. Mark secondary as merged:
    secondary.merged_into_lead_id = primary.id
    secondary.merged_at = now()
    secondary.deleted_at = now()  (soft delete)

13. Update candidate record:
    candidate.status = 'merged'
    candidate.merged_at = now()
    candidate.merged_by = user_id
    candidate.primary_lead_id = primary.id

14. Update any other pending candidates involving the secondary lead:
    - If secondary was lead_id_a or lead_id_b in other pending candidates,
      re-point them to the primary lead (or dismiss if primary is already the other lead in the pair)

15. Commit transaction

16. OUTSIDE transaction:
    a. Dispatch LeadsMerged event
    b. Audit log: action = 'lead.merged', entity = primary_lead_id,
       metadata = { secondary_lead_ids, activities_transferred, fields_filled, ... }
    c. Update leads.last_activity_at on primary (may have changed due to transferred activities)
```

### 7.2 Lock Ordering

**Critical:** Always lock leads in ID order (lower ID first) to prevent deadlocks when two concurrent merge operations involve overlapping leads. The `MergeLeadsUseCase` must sort the lead IDs before acquiring locks.

---

## 8. Frontend Requirements

### 8.1 Duplicate Review Queue

**Location:** CRM → Duplicates (new navigation item, badge showing pending count)

**Layout:**

**Summary bar:** "X pending duplicates (Y high confidence, Z medium confidence)"

**Candidate list:** Each card/row shows a pair of leads:

```
┌─────────────────────────────────────────────────────────────┐
│  🔴 HIGH CONFIDENCE — Phone Match                          │
│                                                             │
│  Lead A: Rahul Sharma          Lead B: Rahul S              │
│  📧 rahul@example.com          📧 (none)                    │
│  📱 +91 98765 43210            📱 +91 98765 43210           │
│  Source: Website               Source: Walk-in               │
│  Stage: Interested             Stage: New Enquiry            │
│  Activities: 5                 Activities: 1                 │
│  Created: March 1              Created: March 15             │
│                                                             │
│  [Review & Merge]  [Not a Duplicate]                        │
└─────────────────────────────────────────────────────────────┘
```

**Filters:** Confidence (High / Medium / All), Date range.

### 8.2 Merge Preview & Confirmation

Clicking "Review & Merge" opens a full-screen merge view:

**Side-by-side comparison table:**

| Field | Lead A (Rahul Sharma) | Lead B (Rahul S) | After Merge |
|---|---|---|---|
| Name | Rahul Sharma | Rahul S | Rahul Sharma ← (primary) |
| Email | rahul@example.com | (empty) | rahul@example.com |
| Phone | +91 98765 43210 | +91 98765 43210 | +91 98765 43210 |
| Source | Website | Walk-in | Website + "Walk-in noted" |
| Stage | Interested | New Enquiry | Interested ← (more progressed) |
| Activities | 5 | 1 | 6 (combined) |
| Follow-ups | 2 pending | 0 | 2 pending |
| Score | 72 (Hot) | 15 (Cold) | Recalculated after merge |

**Primary lead selector:** Radio buttons to choose which lead survives. Default: the lead with more activities / higher stage / older created_at.

**Data transfer summary:** "1 activity, 0 follow-ups, and 0 WhatsApp messages will be transferred from Lead B to Lead A."

**Confirmation:** Type "MERGE" in a text input to confirm. "Cancel" button returns to the queue.

### 8.3 Manual Duplicate Search

On the lead detail page, add a "Find Duplicates" button (visible to admins and branch managers):
- Click opens a modal showing potential matches for this lead
- If matches found: same card layout as the review queue
- If no matches: "No potential duplicates found for this lead."

### 8.4 Duplicate Warning on Lead Creation

When a counselor creates a new lead (manual entry), after entering the phone or email field:
- The system checks for existing matches (inline, before form submission)
- If match found: warning banner: "A lead with this phone number already exists: Rahul Sharma (Interested, assigned to Priya). Are you sure you want to create a new lead?"
- The counselor can proceed anyway (legitimate cases exist — e.g., different person with shared family phone) or navigate to the existing lead

This is a **frontend-only check** — it calls the detection endpoint before form submission. It does NOT block creation.

---

## 9. Scheduled Commands

| Command | Schedule | Purpose |
|---|---|---|
| `crm:scan-duplicates` | Daily at 1:00 AM | Full scan across all tenants for duplicate candidates not already flagged. |

---

## 10. Security Boundaries

### 10.1 Tenant Isolation

- Duplicate detection is strictly within a single tenant. No cross-tenant matching.
- Candidate records are tenant-scoped via `BelongsToTenant`.
- Merge operates within a single tenant — impossible to merge leads from different tenants.

### 10.2 Authorization

- Viewing the duplicate queue and previewing merges requires `crm.dedup.view`.
- Executing merges requires `crm.dedup.merge` (admin-only).
- Counselors cannot access the dedup feature — they only see the inline creation warning.
- The inline creation warning (§8.4) uses the lead search endpoint that counselors already have access to.

### 10.3 Data Integrity

- Merge runs in a single transaction with pessimistic locking.
- Lock ordering (lower ID first) prevents deadlocks.
- The secondary lead is soft-deleted with `merged_into_lead_id` — preserving the audit trail.
- All transferred data maintains referential integrity (foreign keys point to the surviving primary lead).
- No external API calls inside the merge transaction.

---

## 11. Module Entitlement

| Module Code | Description | Effect When Absent |
|---|---|---|
| `module.lead_dedup` | Lead Deduplication & Merge | Duplicate queue hidden. Merge endpoints return 403. Nightly scan skips the tenant. Inline creation warning still works (uses existing lead search — not gated). |

---

## 12. Implementation Plan Requirements

| # | Section | Content |
|---|---|---|
| 1 | Executive Summary | What gets built, what does NOT |
| 2 | Dependency Verification | Verify: `leads` table schema (phone, email columns, existing indexes), `lead_activities` table, `lead_follow_up_tasks` table, `whatsapp_conversation_messages` table (if 15D exists). Verify soft delete column on leads. |
| 3 | Architecture Decisions | Any deviations. Phone normalization strategy. MySQL functional index feasibility for LOWER(email). |
| 4 | Migration Plan | New table, new columns on leads, phone_normalized data migration for existing leads. Exact SQL. |
| 5 | Domain Layer | Value objects, events, repository interface. |
| 6 | Application Layer | Detection use case, scan command, merge use case, queries. |
| 7 | Infrastructure Layer | Eloquent model, repository, queued job, phone normalizer. |
| 8 | HTTP Layer | Controller, form requests, resources, routes. |
| 9 | Detection Algorithm | Exact detection logic, candidate creation, idempotency checks. |
| 10 | Merge Operation | Step-by-step merge with lock ordering, data transfer SQL, edge cases. |
| 11 | Frontend Specification | Review queue, merge preview, inline creation warning. |
| 12 | Implementation Sequence | Ordered steps with day estimates. |
| 13 | Test Plan | Every test file. |
| 14 | Quality Gate Verification | Checklist from §13. |
| 15 | File Manifest | Every new and modified file. |

---

## 13. Quality Gates

### 13.1 Detection Gates

- [ ] Two leads with the same phone number detected as HIGH confidence duplicates
- [ ] Two leads with the same email (case-insensitive) detected as HIGH confidence
- [ ] Phone normalization: `+91 98765 43210` and `09876543210` detected as same number
- [ ] Email normalization: `Rahul@Example.com` and `rahul@example.com` detected as match
- [ ] Detection on lead creation: new lead with duplicate phone triggers candidate creation
- [ ] Detection on lead update: adding an email that matches another lead triggers candidate
- [ ] Nightly scan finds duplicates across the entire tenant
- [ ] Already-merged leads excluded from detection
- [ ] Dismissed candidates not re-flagged by nightly scan
- [ ] Candidate deduplication: same pair not inserted twice

### 13.2 Merge Gates

- [ ] Merge transfers all activities from secondary to primary
- [ ] Merge transfers all follow-up tasks from secondary to primary
- [ ] Merge transfers WhatsApp messages from secondary to primary (if 15D exists)
- [ ] Missing fields on primary filled from secondary (email, phone, address)
- [ ] Metadata deep-merged correctly (primary keys win on conflict)
- [ ] Secondary lead soft-deleted with `merged_into_lead_id` set
- [ ] Score recalculated on primary after merge (if 15C-II complete)
- [ ] Candidate status updated to `merged`
- [ ] Other pending candidates involving the secondary lead are cleaned up
- [ ] Merge audit log created with full details
- [ ] Concurrent merge attempts on overlapping leads do not deadlock (lock ordering verified)
- [ ] Merge transaction rolls back completely on any failure

### 13.3 UI Gates

- [ ] Review queue shows pending candidates sorted by confidence
- [ ] Merge preview shows accurate side-by-side comparison
- [ ] Primary lead selector works — admin can choose which lead survives
- [ ] "MERGE" confirmation required — cannot merge without typing confirmation
- [ ] Dismissed candidates disappear from queue
- [ ] Inline creation warning shows when creating a lead with duplicate phone/email
- [ ] Inline warning does NOT block lead creation

### 13.4 Security Gates

- [ ] Tenant isolation: Tenant A's duplicates never match Tenant B's leads
- [ ] Merge requires `crm.dedup.merge` capability (admin only)
- [ ] Queue viewing requires `crm.dedup.view` capability
- [ ] Module entitlement enforced
- [ ] All merge operations audit-logged

### 13.5 Regression Gates

- [ ] All existing lead management tests pass (0 regressions)
- [ ] Lead creation flow unaffected (dedup is async, non-blocking)
- [ ] PHPStan Level 5 passes with 0 new errors

---

## 14. Constraints & Reminders

### Architecture Constraints

- **Detection is async, never blocking.** Lead creation must never wait for duplicate detection. The `DetectDuplicatesForLeadJob` runs in the background.
- **Merges are transactional with pessimistic locking.** Lock ordering (lower ID first) is mandatory to prevent deadlocks.
- **No external API calls inside the merge transaction.** Score recalculation happens AFTER the transaction commits (via domain event listener).
- **Canonical pair ordering.** Always store `lead_id_a = MIN(id)`, `lead_id_b = MAX(id)`. This plus the unique constraint prevents duplicate candidate entries.
- **Audit logs OUTSIDE transactions.** Same as all previous phases.

### What NOT to Do

- Do NOT auto-merge. Always require human review and confirmation.
- Do NOT implement fuzzy name matching. Phase 1 uses exact phone/email matching only.
- Do NOT block lead creation on duplicate detection. Create first, flag second.
- Do NOT delete the secondary lead's data. Transfer it to the primary. The secondary is soft-deleted.
- Do NOT implement undo/rollback for merges. Merges are permanent in Phase 1.
- Do NOT match across tenants. Deduplication is strictly within a single tenant.
- Do NOT store plaintext phone numbers for comparison. Use the normalized `phone_normalized` column.

---

## 15. Definition of Done

Phase 15G is complete when:

1. All quality gates in §13 pass.
2. End-to-end demonstration:
   a. Two leads created with the same phone number → duplicate candidate appears in review queue with HIGH confidence.
   b. Admin opens merge preview → sees side-by-side comparison → selects primary → types "MERGE" → merge executes.
   c. All activities from secondary appear on primary's activity feed. Secondary is soft-deleted.
   d. Primary's score recalculates with the combined activity data.
   e. Nightly scan detects a pair of leads with the same email → candidate appears in queue.
   f. Admin dismisses a candidate → it no longer appears in the queue → nightly scan does not re-flag it.
   g. Counselor creates a new lead with a phone number that matches an existing lead → warning banner appears → counselor can proceed or navigate to existing lead.
   h. Tenant without `module.lead_dedup` cannot access the duplicate queue.
3. Zero regression in existing test suite.
4. PHPStan Level 5 passes with 0 new errors.
5. The Phase 15G Completion Report is signed off.

---

*End of Document — UBOTZ 2.0 Phase 15G Developer Instructions — March 26, 2026*
