# UBOTZ 2.0 — Phase 17 Frontend Implementation Plan

## Course Domain Correction Series — Frontend Integration (17A → 17D)

| Field | Value |
|---|---|
| **Document Type** | Implementation Plan |
| **Phase** | 17-FE (Frontend) |
| **Covers Backend Phases** | 17A, 17B, 17C, 17D |
| **Date** | 2026-03-20 |
| **Produced By** | Antigravity Implementation Team |
| **Awaiting** | Principal Engineer Audit Approval before implementation begins |
| **Prerequisites** | Phase 17A CERTIFIED, 17B CERTIFIED, 17C CERTIFIED, 17D CERTIFIED |
| **Baseline** | Phase 10E frontend complete — Tenant Admin Dashboard operational |

> **This document is submitted for Principal Engineer audit before any frontend code is written. No implementation begins until audit approval is received.**

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Gap Analysis — What Changed in the Backend](#2-gap-analysis--what-changed-in-the-backend)
3. [Architecture Decision Records](#3-architecture-decision-records)
4. [17A Frontend Work — CourseStatus Cleanup](#4-17a-frontend-work--coursestatus-cleanup)
5. [17B Frontend Work — Enrollment Source Display](#5-17b-frontend-work--enrollment-source-display)
6. [17C Frontend Work — Pricing API Alignment](#6-17c-frontend-work--pricing-api-alignment)
7. [17D Frontend Work — Bundle Feature UI](#7-17d-frontend-work--bundle-feature-ui)
8. [Shared Components Required](#8-shared-components-required)
9. [API Contract Reference](#9-api-contract-reference)
10. [Implementation Sequence](#10-implementation-sequence)
11. [Test Plan](#11-test-plan)
12. [Quality Gate](#12-quality-gate)
13. [File Manifest](#13-file-manifest)

---

## 1. Executive Summary

The Phase 17 backend series made four categories of changes that have frontend implications:

| Backend Phase | Frontend Impact | Severity |
|---|---|---|
| **17A** — CourseStatus cleanup | Remove ACTIVE/INACTIVE/PENDING from status UI | Medium — existing UI has stale states |
| **17B** — Enrollment extraction | Display `BUNDLE` and `SUBSCRIPTION` enrollment sources | Low — additive label changes |
| **17C** — Pricing context move | Verify price calculation API endpoint is unchanged | Low — backend internal move |
| **17D** — Bundle bounded context | Entire new feature: list, create, manage, publish, enroll | High — net new UI |

**What gets built:**
- CourseStatus badge and filter cleanup (remove dead states)
- Enrollment source label additions (BATCH, SUBSCRIPTION, BUNDLE)
- Bundle feature module: full CRUD UI for the Tenant Admin Dashboard
- Bundle course management UI (add/remove courses from a bundle)
- Bundle publish flow with requirements gate
- Bundle manual enrollment UI (admin enrolls student)
- Navigation update (Bundles nav item, capability-gated)
- Sidebar `bundle.view` capability check

**What does NOT get built:**
- Student-facing bundle catalog or purchase UI (future)
- Bundle checkout / payment flow (future — Payment bounded context extension)
- Bundle analytics/statistics page (future)
- Any Super Admin bundle visibility (bundles are tenant-owned)

---

## 2. Gap Analysis — What Changed in the Backend

### 2.1 17A — CourseStatus Changes

The backend `courses` table `status` column now contains only:
- `draft`
- `published`
- `archived`

The strings `active`, `inactive`, `pending` no longer exist in production data after the migration. Any frontend code that references these strings will silently render blank badges or broken filters.

**Affected frontend areas (confirmed from Phase 10E):**
- Course list table `StatusBadge` — renders a colored badge per status string
- Course filter bar — has a status dropdown with options
- Course detail page — displays current status
- Course status change button/menu — shows valid next states

### 2.2 17B — New EnrollmentSource Values

The backend `EnrollmentSource` enum now has: `PURCHASE`, `ADMIN_MANUAL`, `BATCH`, `SUBSCRIPTION`, `BUNDLE`.

**Affected frontend areas:**
- Student enrollment list (if it shows source)
- Any enrollment detail view that displays how a student got access

### 2.3 17C — Pricing API

`CalculateCoursePriceUseCase` moved internally. The API endpoint path (`GET /api/tenant/courses/{id}/price` or equivalent) is **unchanged** — this was a backend namespace move only. Verify endpoint still responds correctly.

**Required action:** Smoke test the price calculation endpoint after 17C deployment. No code changes expected unless the endpoint was renamed.

### 2.4 17D — Bundle APIs (All New)

Eight new endpoints added:

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/api/tenant/bundles` | List bundles |
| `GET` | `/api/tenant/bundles/{id}` | Get single bundle |
| `POST` | `/api/tenant/bundles` | Create bundle |
| `PUT` | `/api/tenant/bundles/{id}` | Update bundle |
| `POST` | `/api/tenant/bundles/{id}/status` | Change status (publish/archive) |
| `POST` | `/api/tenant/bundles/{id}/courses` | Add course to bundle |
| `DELETE` | `/api/tenant/bundles/{id}/courses/{courseId}` | Remove course from bundle |
| `POST` | `/api/tenant/bundles/{id}/enroll` | Enroll student in bundle |

---

## 3. Architecture Decision Records

### DR-FE-001: Bundle Is a Separate Feature Slice

Bundle UI lives at `features/tenant-admin/bundles/` — it does not extend or wrap the course feature. The two features share no components. They may share types from `shared/types/` where appropriate.

**Rationale:** Course and Bundle are distinct domain concepts. Reusing the course form would create coupling that makes future Bundle-specific changes harder.

### DR-FE-002: CourseStatusBadge Is a Shared Component

`CourseStatusBadge` is promoted from an inline component to `shared/ui/data-display/CourseStatusBadge.tsx`. It will be used on the course list table, course detail header, and any future page that needs to display a course status. Centralising it means the status→label→color map is maintained in one place.

**Same pattern for BundleStatusBadge** — created as `shared/ui/data-display/BundleStatusBadge.tsx`.

### DR-FE-003: Bundle Course Manager Uses Existing Course API

The course picker inside the Bundle course manager calls the existing `GET /api/tenant/courses` endpoint with a search param. No new course endpoint is needed. The bundle course manager is a feature-level UI component that wires into the existing courses API hook.

### DR-FE-004: Price Display Always Formats from Cents

All monetary values from the API are in cents (integers). A shared utility `formatCents(cents: number, currency: string): string` handles display. This utility already exists if Phase 12A frontend was built — if not, it must be created in `lib/format.ts`.

---

## 4. 17A Frontend Work — CourseStatus Cleanup

### 4.1 `CourseStatusBadge` Component

**File:** `shared/ui/data-display/CourseStatusBadge.tsx`

Remove `active`, `inactive`, `pending` from the status map. The canonical map after 17A:

```typescript
const STATUS_CONFIG: Record<CourseStatus, {
  label: string;
  className: string;
}> = {
  draft:     { label: 'Draft',     className: 'bg-gray-100 text-gray-600' },
  published: { label: 'Published', className: 'bg-green-100 text-green-700' },
  archived:  { label: 'Archived',  className: 'bg-red-50 text-red-500' },
};

type CourseStatus = 'draft' | 'published' | 'archived';
```

The TypeScript union type must be updated. If the API ever returns an unrecognised status, the component falls back gracefully:

```typescript
export function CourseStatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status as CourseStatus] ?? {
    label: status,
    className: 'bg-gray-100 text-gray-500',
  };

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${config.className}`}>
      {config.label}
    </span>
  );
}
```

### 4.2 Course Status Filter Dropdown

**File:** `features/tenant-admin/courses/ui/course-filter-bar.tsx`

Remove `active`, `inactive`, `pending` from the status filter options. New options:

```typescript
const STATUS_FILTER_OPTIONS = [
  { value: '',          label: 'All Statuses' },
  { value: 'draft',     label: 'Draft'        },
  { value: 'published', label: 'Published'    },
  { value: 'archived',  label: 'Archived'     },
];
```

### 4.3 Course Status Change Menu

**File:** `features/tenant-admin/courses/ui/course-actions-menu.tsx`

The status change dropdown must show only valid transitions from the current status:

```typescript
const VALID_TRANSITIONS: Record<CourseStatus, CourseStatus[]> = {
  draft:     ['published', 'archived'],
  published: ['archived'],
  archived:  [],
};

function getStatusActions(current: CourseStatus): CourseStatus[] {
  return VALID_TRANSITIONS[current] ?? [];
}
```

If `archived`, the status change menu must be hidden entirely — no transitions out of archived.

### 4.4 Zod Schema Update

**File:** `features/tenant-admin/courses/model/course-types.ts`

Update the `CourseStatus` Zod schema:

```typescript
export const CourseStatusSchema = z.enum(['draft', 'published', 'archived']);
export type CourseStatus = z.infer<typeof CourseStatusSchema>;
```

---

## 5. 17B Frontend Work — Enrollment Source Display

### 5.1 Enrollment Source Label Map

**File:** `features/tenant-admin/enrollments/model/enrollment-types.ts`

Add the new source values to the label map:

```typescript
export const ENROLLMENT_SOURCE_LABELS: Record<string, string> = {
  purchase:     'Self Purchase',
  admin_manual: 'Admin Assigned',
  batch:        'Batch Enrollment',
  subscription: 'Subscription',
  bundle:       'Bundle Purchase',
};
```

This is used wherever enrollment source is displayed in the UI — enrollment list table, enrollment detail drawer, etc.

### 5.2 No Structural Changes

Phase 17B was a backend boundary correction. No new API endpoints were added or changed. No new pages are required. This is a label/type update only.

---

## 6. 17C Frontend Work — Pricing API Alignment

### 6.1 Smoke Test Only

After 17C is deployed, run a manual smoke test against the price calculation endpoint:

```
GET /api/tenant/courses/{id}/price?userId={userId}&ticketCode={code}
```

If the response shape has changed (different key names, different error codes), update `features/tenant-admin/courses/api/use-course-price.ts` accordingly.

**Expected:** No changes needed — 17C was an internal backend namespace move with no API contract changes.

### 6.2 `formatCents` Utility — Create If Missing

**File:** `lib/format.ts`

```typescript
/**
 * Converts an integer cents value to a formatted currency string.
 * @param cents - Integer value in the smallest currency unit
 * @param currency - ISO 4217 currency code (default: 'INR')
 */
export function formatCents(cents: number, currency = 'INR'): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}
```

This utility is required by both the Course pricing display and the new Bundle pricing display.

---

## 7. 17D Frontend Work — Bundle Feature UI

This is the primary deliverable. The Bundle feature is a complete new section in the Tenant Admin Dashboard.

### 7.1 Feature Directory Structure

```
features/tenant-admin/bundles/
├── api/
│   ├── use-bundles.ts              ← list + get hooks (TanStack Query)
│   ├── use-bundle-mutations.ts     ← create, update, status, courses, enroll
│   └── bundle-api.ts               ← raw API call functions
├── model/
│   ├── bundle-types.ts             ← Zod schemas + inferred types
│   └── bundle-transforms.ts        ← API response → UI model mappers
├── ui/
│   ├── bundle-list-table.tsx       ← Paginated data table
│   ├── bundle-form.tsx             ← Create / edit form
│   ├── bundle-status-actions.tsx   ← Publish / archive button group
│   ├── bundle-course-manager.tsx   ← Add/remove courses UI
│   ├── bundle-enroll-drawer.tsx    ← Admin manual enrollment
│   ├── bundle-publish-gate.tsx     ← Requirements checklist before publish
│   └── bundle-detail-header.tsx    ← Title, status, price display
└── index.ts                        ← Public API of the feature
```

### 7.2 Type Definitions

**File:** `features/tenant-admin/bundles/model/bundle-types.ts`

```typescript
import { z } from 'zod';

export const BundleStatusSchema = z.enum(['draft', 'published', 'archived']);
export type BundleStatus = z.infer<typeof BundleStatusSchema>;

export const BundleCourseSchema = z.object({
  id:         z.number(),
  courseId:   z.number(),
  title:      z.string(),
  thumbnail:  z.string().nullable(),
  sortOrder:  z.number(),
});

export const BundleSchema = z.object({
  id:               z.number(),
  title:            z.string(),
  slug:             z.string(),
  description:      z.string().nullable(),
  status:           BundleStatusSchema,
  thumbnailPath:    z.string().nullable(),
  priceAmountCents: z.number(),
  isPrivate:        z.boolean(),
  courseCount:      z.number(),
  courses:          z.array(BundleCourseSchema).optional(),
  createdAt:        z.string(),
  updatedAt:        z.string(),
});

export type Bundle = z.infer<typeof BundleSchema>;

export const CreateBundleSchema = z.object({
  title:            z.string().min(5).max(255),
  description:      z.string().max(5000).optional(),
  priceAmountCents: z.number().int().min(0),
  isPrivate:        z.boolean().default(false),
});
export type CreateBundleInput = z.infer<typeof CreateBundleSchema>;

export const UpdateBundleSchema = CreateBundleSchema.partial();
export type UpdateBundleInput = z.infer<typeof UpdateBundleSchema>;
```

### 7.3 API Hooks

**File:** `features/tenant-admin/bundles/api/use-bundles.ts`

```typescript
'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/shared/api/client';
import { BundleSchema } from '../model/bundle-types';
import { z } from 'zod';

const BundleListSchema = z.object({
  data:  z.array(BundleSchema),
  meta:  z.object({ total: z.number(), page: z.number(), perPage: z.number() }),
});

export function useBundles(params?: {
  page?: number;
  perPage?: number;
  search?: string;
  status?: string;
}) {
  return useQuery({
    queryKey: ['tenant', 'bundles', params],
    queryFn:  () => apiFetch('/api/tenant/bundles', { params })
      .then(r => BundleListSchema.parse(r)),
    staleTime: 30_000,
  });
}

export function useBundle(id: number) {
  return useQuery({
    queryKey: ['tenant', 'bundles', id],
    queryFn:  () => apiFetch(`/api/tenant/bundles/${id}`)
      .then(r => BundleSchema.parse(r.data)),
    enabled:  !!id,
  });
}
```

**File:** `features/tenant-admin/bundles/api/use-bundle-mutations.ts`

```typescript
'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/shared/api/client';
import type { CreateBundleInput, UpdateBundleInput, BundleStatus } from '../model/bundle-types';

export function useCreateBundle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateBundleInput) =>
      apiFetch('/api/tenant/bundles', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tenant', 'bundles'] }),
  });
}

export function useUpdateBundle(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: UpdateBundleInput) =>
      apiFetch(`/api/tenant/bundles/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tenant', 'bundles'] });
      qc.invalidateQueries({ queryKey: ['tenant', 'bundles', id] });
    },
  });
}

export function useChangeBundleStatus(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (status: BundleStatus) =>
      apiFetch(`/api/tenant/bundles/${id}/status`, {
        method: 'POST',
        body:   JSON.stringify({ status }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tenant', 'bundles'] });
      qc.invalidateQueries({ queryKey: ['tenant', 'bundles', id] });
    },
  });
}

export function useAddCourseToBundle(bundleId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (courseId: number) =>
      apiFetch(`/api/tenant/bundles/${bundleId}/courses`, {
        method: 'POST',
        body:   JSON.stringify({ course_id: courseId }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tenant', 'bundles', bundleId] }),
  });
}

export function useRemoveCourseFromBundle(bundleId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (courseId: number) =>
      apiFetch(`/api/tenant/bundles/${bundleId}/courses/${courseId}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tenant', 'bundles', bundleId] }),
  });
}

export function useEnrollStudentInBundle(bundleId: number) {
  return useMutation({
    mutationFn: (data: { userId: number; idempotencyKey: string }) =>
      apiFetch(`/api/tenant/bundles/${bundleId}/enroll`, {
        method: 'POST',
        body:   JSON.stringify({
          user_id:          data.userId,
          idempotency_key:  data.idempotencyKey,
        }),
      }),
  });
}
```

### 7.4 Bundle List Table

**File:** `features/tenant-admin/bundles/ui/bundle-list-table.tsx`

Required columns:

| Column | Source | Notes |
|---|---|---|
| Title | `bundle.title` | Clickable → detail page |
| Status | `bundle.status` | `BundleStatusBadge` component |
| Price | `bundle.priceAmountCents` | `formatCents()` — show "Free" if 0 |
| Courses | `bundle.courseCount` | "N courses" |
| Visibility | `bundle.isPrivate` | "Private" / "Public" badge |
| Created | `bundle.createdAt` | Relative date |
| Actions | — | Dropdown: Edit, Publish/Archive, Delete |

Table state:
```typescript
interface BundleTableState {
  page:    number;
  perPage: number;
  search:  string | null;
  status:  BundleStatus | null;
  sortBy:  'title' | 'created_at' | 'status';
  sortDir: 'asc' | 'desc';
}
```

Required states: loading skeleton (6 rows × 6 columns), empty state ("No bundles yet. Create your first bundle."), error state with retry.

### 7.5 Bundle Form

**File:** `features/tenant-admin/bundles/ui/bundle-form.tsx`

Used for both create and edit. Fields:

| Field | Type | Validation |
|---|---|---|
| Title | Text input | Required, 5–255 chars |
| Description | Textarea | Optional, max 5000 chars |
| Price | Number input (displays in rupees, stores as cents) | Min 0, integer only |
| Visibility | Toggle (Public / Private) | Boolean |
| Thumbnail | File upload | Optional — image only, max 2MB |

**Price input pattern** — always display in whole currency units, convert to cents on submit:

```typescript
// Display: user types "500" (rupees)
// Stored: 50000 (cents)

const priceInRupees = watch('priceDisplay');
const priceAmountCents = Math.round(parseFloat(priceInRupees || '0') * 100);
```

**Zod schema for form:**
```typescript
const bundleFormSchema = z.object({
  title:        z.string().min(5, 'Title must be at least 5 characters').max(255),
  description:  z.string().max(5000).optional(),
  priceDisplay: z.string().regex(/^\d+(\.\d{1,2})?$/, 'Enter a valid price'),
  isPrivate:    z.boolean(),
});
```

### 7.6 Bundle Publish Gate Component

**File:** `features/tenant-admin/bundles/ui/bundle-publish-gate.tsx`

Before showing the "Publish" button as active, display a requirements checklist:

```
✅ Title set
✅ Thumbnail uploaded
⚠️ Minimum 2 courses required (currently: 1)
```

When all requirements are met, the Publish button becomes enabled. This is a UX hint — the backend enforces the real gate. If the backend returns a 422 with validation errors on publish attempt, display those errors at the form level.

```typescript
interface PublishRequirements {
  hasTitle:            boolean;
  hasThumbnail:        boolean;
  hasMinimumCourses:   boolean;  // courseCount >= 2
}

function meetsPublishRequirements(bundle: Bundle): PublishRequirements {
  return {
    hasTitle:          bundle.title.length >= 5,
    hasThumbnail:      bundle.thumbnailPath !== null,
    hasMinimumCourses: bundle.courseCount >= 2,
  };
}
```

### 7.7 Bundle Course Manager

**File:** `features/tenant-admin/bundles/ui/bundle-course-manager.tsx`

Two-panel UI:

**Left panel — Courses in this bundle:**
- List of courses currently added (title, thumbnail, sort order)
- Remove button per course (calls `useRemoveCourseFromBundle`)
- Drag-to-reorder (optional — sort order update is a future enhancement)

**Right panel — Add courses:**
- Searchable course picker (calls existing `GET /api/tenant/courses?search=...&status=published`)
- Only shows PUBLISHED courses
- "Add" button per course
- Disabled if the course is already in the bundle

```typescript
// Only show published courses in the picker
const { data: publishedCourses } = useCourses({
  status: 'published',
  search: courseSearch,
});

// Filter out already-added courses
const availableCourses = publishedCourses?.data.filter(
  c => !bundleCourseIds.includes(c.id)
) ?? [];
```

### 7.8 Bundle Enrollment Drawer

**File:** `features/tenant-admin/bundles/ui/bundle-enroll-drawer.tsx`

A right-side drawer for admin-manual enrollment:

Fields:
- Student picker (searchable user dropdown — calls `GET /api/tenant/users?search=...`)
- Expiry type: Lifetime / Fixed date / Days from now
- Expiry value (shown when not Lifetime)

On submit:
- Generate `idempotencyKey` client-side: `crypto.randomUUID()`
- Call `useEnrollStudentInBundle`
- Show result: enrolled courses list + skipped courses (if any were at capacity)

**Skipped courses display:**
```typescript
// API returns: { bundleEnrollmentId, enrolledCourses: [], skippedCourses: [] }
// If skippedCourses.length > 0, show warning:
// "Enrolled in bundle. 2 courses were skipped (at capacity): Physics 101, Chemistry Advanced"
```

### 7.9 Bundle Detail Page Layout

**File:** `app/(tenant)/[slug]/dashboard/bundles/[id]/page.tsx`

```
┌──────────────────────────────────────────────────┐
│ [Back to Bundles]                                │
│ Bundle Title                    [Status Badge]   │
│ ₹4,999  ·  6 Courses  ·  Public                  │
│ ─────────────────────────────────────────────── │
│ [Edit]  [Manage Courses]  [Publish / Archive]    │
├──────────────┬───────────────────────────────────┤
│              │ Courses in this Bundle             │
│ Thumbnail    │ ┌────────────────────────────────┐│
│              │ │ 1. Course Title    [Remove]    ││
│ Description  │ │ 2. Course Title    [Remove]    ││
│              │ └────────────────────────────────┘│
│              │                                   │
│              │ [+ Add Courses]                   │
└──────────────┴───────────────────────────────────┘
```

### 7.10 Navigation Update

**File:** `shared/ui/navigation/tenant-sidebar-nav.tsx` (or equivalent)

Add Bundles to the sidebar nav, capability-gated:

```typescript
const NAV_ITEMS = [
  // ... existing items
  {
    label:      'Bundles',
    href:       `/${slug}/dashboard/bundles`,
    capability: 'bundle.view',
    icon:       PackageIcon,  // lucide-react
  },
];
```

Position: after Courses, before Reports.

---

## 8. Shared Components Required

### 8.1 `BundleStatusBadge`

**File:** `shared/ui/data-display/BundleStatusBadge.tsx`

```typescript
const BUNDLE_STATUS_CONFIG = {
  draft:     { label: 'Draft',     className: 'bg-gray-100 text-gray-600'  },
  published: { label: 'Published', className: 'bg-green-100 text-green-700' },
  archived:  { label: 'Archived',  className: 'bg-red-50 text-red-500'     },
} satisfies Record<string, { label: string; className: string }>;
```

Identical structure to the updated `CourseStatusBadge`. Both are required — they are separate components for separate domain entities.

### 8.2 `formatCents` Utility

Already specified in §6.2. Used by both Course and Bundle price displays.

### 8.3 `PriceDisplay` Component

**File:** `shared/ui/data-display/PriceDisplay.tsx`

```typescript
interface PriceDisplayProps {
  cents:    number;
  currency?: string;
  freLabel?: string;  // default: 'Free'
}

export function PriceDisplay({ cents, currency = 'INR', freeLabel = 'Free' }: PriceDisplayProps) {
  if (cents === 0) return <span className="text-green-600 font-medium">{freeLabel}</span>;
  return <span>{formatCents(cents, currency)}</span>;
}
```

---

## 9. API Contract Reference

### 9.1 Bundle List Response Shape

```typescript
// GET /api/tenant/bundles
{
  data: Bundle[];
  meta: {
    total:   number;
    page:    number;
    perPage: number;
  };
}
```

### 9.2 Bundle Create Request

```typescript
// POST /api/tenant/bundles
{
  title:              string;       // 5–255
  description?:       string;       // max 5000
  price_amount_cents: number;       // integer, min 0
  is_private:         boolean;
  idempotency_key:    string;       // UUID generated client-side
}
```

### 9.3 Bundle Status Change Request

```typescript
// POST /api/tenant/bundles/{id}/status
{
  status: 'published' | 'archived';
}
```

### 9.4 Bundle Enroll Request

```typescript
// POST /api/tenant/bundles/{id}/enroll
{
  user_id:         number;
  idempotency_key: string;   // UUID generated client-side
  expires_at?:     string;   // ISO 8601 datetime, null = lifetime
}
```

### 9.5 Bundle Enroll Response

```typescript
{
  data: {
    bundleEnrollmentId: number;
    enrolledCourses:    { id: number; title: string }[];
    skippedCourses:     { id: number; title: string; reason: string }[];
  }
}
```

### 9.6 Error Handling

| Status | Cause | Frontend Action |
|---|---|---|
| `422` | Validation error (e.g. min 2 courses, title too short) | Display field-level errors inline |
| `403` | Missing `bundle.edit` or `bundle.create` capability | Show permission denied state |
| `404` | Bundle not found or belongs to another tenant | Redirect to bundles list |
| `409` | Duplicate slug | Display "A bundle with this title already exists" inline |

---

## 10. Implementation Sequence

```
Step 1  — Update CourseStatusBadge (remove dead states, update TypeScript union)
Step 2  — Update course filter bar (remove dead status options)
Step 3  — Update course status change menu (use VALID_TRANSITIONS map)
Step 4  — Update CourseStatus Zod schema
Step 5  — Update enrollment source label map (add BATCH, SUBSCRIPTION, BUNDLE)
Step 6  — Create/verify formatCents utility in lib/format.ts
Step 7  — Smoke test price calculation endpoint post-17C
Step 8  — Create BundleStatusBadge shared component
Step 9  — Create PriceDisplay shared component
Step 10 — Create bundle-types.ts (Zod schemas + inferred types)
Step 11 — Create bundle-api.ts (raw API functions)
Step 12 — Create use-bundles.ts (TanStack Query hooks)
Step 13 — Create use-bundle-mutations.ts (mutation hooks)
Step 14 — Create bundle-list-table.tsx
Step 15 — Create bundle-form.tsx (create + edit)
Step 16 — Create bundle-publish-gate.tsx
Step 17 — Create bundle-course-manager.tsx
Step 18 — Create bundle-enroll-drawer.tsx
Step 19 — Create bundle-detail-header.tsx
Step 20 — Create bundle-status-actions.tsx
Step 21 — Create app pages: bundles/page.tsx, bundles/[id]/page.tsx, bundles/new/page.tsx
Step 22 — Add Bundles nav item to sidebar (capability-gated: bundle.view)
Step 23 — Run: npm run build (TypeScript strict — zero errors)
Step 24 — Manual test execution (§11.2)
```

Steps 1–6 are corrections to existing code. Steps 7 onward are net new. Steps 1–6 must complete before any new bundle work begins — do not mix correction and new feature work in the same commit.

---

## 11. Test Plan

### 11.1 Component Tests

**File:** `features/tenant-admin/bundles/ui/__tests__/bundle-status-badge.test.tsx`

| Test | Description |
|---|---|
| `renders draft badge` | Correct label and color class |
| `renders published badge` | Correct label and color class |
| `renders archived badge` | Correct label and color class |
| `renders fallback for unknown status` | Does not crash |

**File:** `features/tenant-admin/courses/ui/__tests__/course-status-badge.test.tsx`

| Test | Description |
|---|---|
| `does not render active badge` | String 'active' uses fallback, not a defined style |
| `does not render inactive badge` | Same |
| `does not render pending badge` | Same |

**File:** `features/tenant-admin/bundles/ui/__tests__/bundle-publish-gate.test.tsx`

| Test | Description |
|---|---|
| `publish button disabled when courseCount < 2` | UX gate |
| `publish button enabled when all requirements met` | Happy path |
| `shows checklist items` | Requirements rendered |

### 11.2 Manual Test Checklist

**17A — CourseStatus Cleanup:**
- [ ] Course list filter dropdown shows only: All, Draft, Published, Archived
- [ ] Course status badges show only: Draft (gray), Published (green), Archived (red)
- [ ] Status change menu for a Draft course shows only: Publish, Archive
- [ ] Status change menu for a Published course shows only: Archive
- [ ] Status change menu for an Archived course is hidden or disabled

**17D — Bundle Feature:**
- [ ] Bundles nav item is visible for users with `bundle.view` capability
- [ ] Bundles nav item is hidden for users without `bundle.view`
- [ ] Bundle list loads with correct pagination
- [ ] Bundle list search filters by title
- [ ] Bundle list status filter works
- [ ] Create bundle form validates: title min 5 chars, price non-negative
- [ ] Create bundle sets status to Draft
- [ ] Price input of "500" submits as 50000 cents
- [ ] Price display of 50000 cents shows "₹500"
- [ ] Price display of 0 cents shows "Free"
- [ ] Bundle course manager only shows Published courses in picker
- [ ] Cannot add the same course twice to a bundle
- [ ] Publish button is disabled when fewer than 2 courses in bundle
- [ ] Publish succeeds when requirements met
- [ ] Archived bundle shows no publish/archive actions
- [ ] Enrollment drawer generates and submits idempotency key
- [ ] Enrollment response shows enrolled and skipped courses
- [ ] TypeScript build passes: `npm run build`

### 11.3 TypeScript Build Gate

```powershell
cd frontend && npm run build
```

Must complete with zero TypeScript errors and zero `any` warnings. This is a hard gate — no conditional approval.

---

## 12. Quality Gate

All items must pass before Phase 17-FE is certified:

| # | Check | How to Verify |
|---|---|---|
| 1 | `CourseStatusBadge` has no 'active', 'inactive', 'pending' cases | Code review |
| 2 | Course filter bar has no 'active', 'inactive', 'pending' options | Code review + manual test |
| 3 | Course status transitions map matches 17A confirmed business rules | Code review |
| 4 | `ENROLLMENT_SOURCE_LABELS` includes BATCH, SUBSCRIPTION, BUNDLE | Code review |
| 5 | `formatCents` exists in `lib/format.ts` | File check |
| 6 | Price inputs store cents, display rupees | Manual test |
| 7 | Bundle feature module exists at `features/tenant-admin/bundles/` | File check |
| 8 | All Zod schemas parse actual API responses without errors | Manual test with real API |
| 9 | Bundles nav item is capability-gated on `bundle.view` | Manual test with role without capability |
| 10 | Bundle publish gate is disabled with < 2 courses | Manual test |
| 11 | Bundle enrollment generates idempotency key client-side | Code review |
| 12 | Skipped courses shown in enrollment result | Manual test |
| 13 | `npm run build` passes with zero TypeScript errors | Build output |
| 14 | No hardcoded hex values in any new component | Code review |
| 15 | All new components have loading, empty, and error states | Code review + manual test |
| 16 | Mobile layout tested at 375px — no horizontal scroll | Browser devtools |

---

## 13. File Manifest

### Modified Files

| File | Change |
|---|---|
| `shared/ui/data-display/CourseStatusBadge.tsx` | Remove dead states, update TypeScript union |
| `features/tenant-admin/courses/ui/course-filter-bar.tsx` | Remove dead status options |
| `features/tenant-admin/courses/ui/course-actions-menu.tsx` | Use VALID_TRANSITIONS map |
| `features/tenant-admin/courses/model/course-types.ts` | Update CourseStatus Zod enum |
| `features/tenant-admin/enrollments/model/enrollment-types.ts` | Add BATCH, SUBSCRIPTION, BUNDLE to source labels |
| `shared/ui/navigation/tenant-sidebar-nav.tsx` | Add Bundles nav item |

### New Files

| File | Purpose |
|---|---|
| `lib/format.ts` | formatCents utility (create if missing) |
| `shared/ui/data-display/BundleStatusBadge.tsx` | Bundle status badge |
| `shared/ui/data-display/PriceDisplay.tsx` | Formatted price with "Free" fallback |
| `features/tenant-admin/bundles/model/bundle-types.ts` | Zod schemas + types |
| `features/tenant-admin/bundles/model/bundle-transforms.ts` | API response mappers |
| `features/tenant-admin/bundles/api/bundle-api.ts` | Raw API call functions |
| `features/tenant-admin/bundles/api/use-bundles.ts` | TanStack Query read hooks |
| `features/tenant-admin/bundles/api/use-bundle-mutations.ts` | Mutation hooks |
| `features/tenant-admin/bundles/ui/bundle-list-table.tsx` | Paginated data table |
| `features/tenant-admin/bundles/ui/bundle-form.tsx` | Create + edit form |
| `features/tenant-admin/bundles/ui/bundle-status-actions.tsx` | Publish / archive actions |
| `features/tenant-admin/bundles/ui/bundle-course-manager.tsx` | Add/remove courses UI |
| `features/tenant-admin/bundles/ui/bundle-enroll-drawer.tsx` | Admin enrollment drawer |
| `features/tenant-admin/bundles/ui/bundle-publish-gate.tsx` | Requirements checklist |
| `features/tenant-admin/bundles/ui/bundle-detail-header.tsx` | Title, status, price header |
| `features/tenant-admin/bundles/index.ts` | Feature public API |
| `app/(tenant)/[slug]/dashboard/bundles/page.tsx` | Bundles list page |
| `app/(tenant)/[slug]/dashboard/bundles/new/page.tsx` | Create bundle page |
| `app/(tenant)/[slug]/dashboard/bundles/[id]/page.tsx` | Bundle detail page |
| `app/(tenant)/[slug]/dashboard/bundles/[id]/edit/page.tsx` | Edit bundle page |
| `app/(tenant)/[slug]/dashboard/bundles/[id]/loading.tsx` | Suspense skeleton |
| `app/(tenant)/[slug]/dashboard/bundles/[id]/error.tsx` | Error boundary |
| `features/tenant-admin/bundles/ui/__tests__/bundle-status-badge.test.tsx` | Component test |
| `features/tenant-admin/courses/ui/__tests__/course-status-badge.test.tsx` | Regression test |
| `features/tenant-admin/bundles/ui/__tests__/bundle-publish-gate.test.tsx` | Component test |

---

*End of Phase 17-FE Implementation Plan*
*Produced by Antigravity — 2026-03-20*
*Submitted to Principal Engineer for audit. No implementation begins until audit approval is received.*
