# UBOTZ 2.0 — Phase 19C Developer Instructions

## Student Analytics — Frontend Dashboard Views

| Field | Value |
|---|---|
| **Document Type** | Developer Instruction (Pre-Implementation Brief) |
| **Phase** | 19C |
| **Date** | March 26, 2026 |
| **Issued By** | Principal Engineer / Architecture Auditor |
| **Audience** | Implementation Developer (Antigravity) |
| **Expected Deliverable** | Phase 19C Implementation Plan (same format as 10A–15C plans) |
| **Prerequisites** | Phase 19A COMPLETE (aggregation pipeline live, weight config API working), Phase 19B COMPLETE (all 11 API endpoints live and tested, risk alerts dispatching via Phase 14) |

> **Phase 19A built the data. Phase 19B exposed it. Phase 19C renders it. This is the final phase of the Student Analytics feature — the part the institution owner, teacher, and student actually interact with. The frontend must faithfully render backend-provided data without recalculating or reinterpreting scores. The backend is the authority; the frontend is the rendering layer.**

---

## 1. Mission Statement

Phase 19C builds the **frontend dashboard views** for Student Analytics. Three views are implemented across two dashboard contexts (Tenant Admin Dashboard for admins/teachers, and Panel for students):

1. **Student Performance Profile** — a per-student 360° view with scores, dimension breakdowns, trend chart, and topic mastery
2. **Batch Comparison Dashboard** — side-by-side batch performance cards with drill-down to individual students
3. **Topic Mastery Heatmap** — a matrix view of students × topics with color-coded mastery cells

Additionally, a **Weight Configuration page** is built for tenant admins to adjust analytics scoring weights.

**What this phase builds:**

- 4 new pages in the Tenant Admin Dashboard (analytics overview, student profile, batch comparison, topic heatmap)
- 1 new page in the Panel context (student's own analytics — "My Performance")
- Weight configuration settings page (Tenant Admin)
- Sidebar navigation entries for analytics
- ~30 new frontend files (pages, components, hooks, services, types)

**What this phase does NOT build:**

- Super Admin analytics views (platform-level analytics across tenants — future)
- Parent portal analytics view (requires parent panel — future)
- Export/download functionality (deferred beyond Phase 19)
- Real-time WebSocket updates (polling via TanStack Query `refetchInterval` is sufficient)
- Mobile-native views (responsive web is sufficient for Phase 19)

---

## 2. Route Structure

### 2.1 Tenant Admin Dashboard Routes

```
frontend/app/(tenant-admin-dashboard)/
└── tenant-admin-dashboard/
    └── analytics/
        ├── page.tsx                            → Analytics overview (student list with scores)
        ├── loading.tsx                         → Skeleton loader
        ├── error.tsx                           → Error boundary
        ├── students/
        │   └── [studentId]/
        │       └── page.tsx                    → Student performance profile (detail)
        ├── batches/
        │   ├── page.tsx                        → Batch comparison dashboard
        │   └── [batchId]/
        │       └── page.tsx                    → Single batch drill-down (student list)
        ├── topics/
        │   └── page.tsx                        → Topic mastery heatmap
        └── settings/
            └── page.tsx                        → Weight configuration
```

### 2.2 Panel Routes (Student Self-Access)

```
frontend/app/(panel)/
└── panel/
    └── my-performance/
        ├── page.tsx                            → Student's own performance profile
        ├── loading.tsx
        └── error.tsx
```

### 2.3 Navigation Integration

**Tenant Admin Sidebar — new navigation group:**

```
ANALYTICS (section label)
├── Overview          → /tenant-admin-dashboard/analytics
├── Batch Comparison  → /tenant-admin-dashboard/analytics/batches
├── Topic Mastery     → /tenant-admin-dashboard/analytics/topics
└── Settings          → /tenant-admin-dashboard/analytics/settings
```

Visibility: hidden unless the user has `student_analytics.view` capability. The Settings item is additionally hidden unless the user has `student_analytics.configure` capability.

**Panel Sidebar — new entry:**

```
MY LEARNING (existing section)
├── ... (existing items)
└── My Performance    → /panel/my-performance
```

Visibility: always visible to students when `module.student_analytics` is enabled for the tenant.

---

## 3. Feature Module Structure

### 3.1 Tenant Admin Analytics Feature

```
frontend/features/tenant-admin/analytics/
├── components/
│   ├── student-list-table.tsx              → Paginated table with score columns + risk badges
│   ├── student-list-filters.tsx            → Batch, risk level, search filters
│   ├── student-performance-card.tsx        → Overview card with score ring/gauge
│   ├── dimension-breakdown.tsx             → Four-dimension score cards with raw metrics
│   ├── performance-trend-chart.tsx         → Line chart (Recharts) for score history
│   ├── topic-mastery-list.tsx              → Topic mastery table for single student
│   ├── batch-comparison-grid.tsx           → Side-by-side batch performance cards
│   ├── batch-risk-distribution.tsx         → Stacked bar showing risk level counts per batch
│   ├── topic-heatmap-grid.tsx              → Matrix grid: students (rows) × topics (columns)
│   ├── heatmap-cell.tsx                    → Single mastery cell with color + tooltip
│   ├── heatmap-legend.tsx                  → Color legend for mastery levels
│   ├── risk-level-badge.tsx                → Colored badge: low/medium/high/critical
│   ├── score-gauge.tsx                     → Circular gauge for overall score (0–100)
│   ├── weight-config-form.tsx              → Weight sliders/inputs with sum=100 validation
│   └── analytics-empty-state.tsx           → Empty state when no data computed yet
├── hooks/
│   ├── use-student-analytics.ts            → List students with performance scores
│   ├── use-student-performance.ts          → Single student detail
│   ├── use-student-history.ts              → Performance trend data
│   ├── use-student-topics.ts               → Topic mastery for single student
│   ├── use-batch-analytics.ts              → Batch list with aggregates
│   ├── use-batch-detail.ts                 → Single batch detail
│   ├── use-batch-students.ts               → Students within a batch
│   ├── use-topic-heatmap.ts                → Heatmap matrix data
│   ├── use-analytics-config.ts             → Weight config read + mutation
│   └── use-subject-list.ts                 → Subject dropdown data (from exam hierarchy)
└── types/
    └── analytics-types.ts                  → TypeScript interfaces matching API contracts
```

### 3.2 Panel (Student) Analytics Feature

```
frontend/features/panel/my-performance/
├── components/
│   ├── my-performance-overview.tsx          → Student's own score overview
│   ├── my-dimension-cards.tsx               → Four dimension cards (reuses shared components)
│   ├── my-trend-chart.tsx                   → Personal trend chart
│   └── my-topic-mastery.tsx                 → Personal topic strengths/weaknesses
├── hooks/
│   ├── use-my-performance.ts                → Calls /api/tenant-dashboard/my-analytics
│   ├── use-my-history.ts                    → Calls /api/tenant-dashboard/my-analytics/history
│   └── use-my-topics.ts                     → Calls /api/tenant-dashboard/my-analytics/topics
└── types/
    └── my-performance-types.ts
```

### 3.3 Services

```
frontend/services/
├── student-analytics-service.ts             → API calls for admin/teacher analytics endpoints
└── my-analytics-service.ts                  → API calls for student self-access endpoints
```

### 3.4 Shared Components (if not already existing)

```
frontend/shared/ui/
├── score-ring.tsx                           → Circular score visualisation (reusable)
└── color-legend.tsx                         → Generic color legend component
```

**Estimated total: ~35 new files.**

---

## 4. API Service Layer

### 4.1 `student-analytics-service.ts`

```typescript
// services/student-analytics-service.ts
import apiClient from "./api-client";

export const studentAnalyticsService = {
  // Student endpoints
  listStudents: (params: StudentAnalyticsParams) =>
    apiClient.get("/api/tenant-dashboard/analytics/students", { params }).then(r => r.data),

  getStudent: (studentId: number) =>
    apiClient.get(`/api/tenant-dashboard/analytics/students/${studentId}`).then(r => r.data),

  getStudentHistory: (studentId: number, params?: HistoryParams) =>
    apiClient.get(`/api/tenant-dashboard/analytics/students/${studentId}/history`, { params }).then(r => r.data),

  getStudentTopics: (studentId: number, params?: TopicParams) =>
    apiClient.get(`/api/tenant-dashboard/analytics/students/${studentId}/topics`, { params }).then(r => r.data),

  // Batch endpoints
  listBatches: (params?: BatchAnalyticsParams) =>
    apiClient.get("/api/tenant-dashboard/analytics/batches", { params }).then(r => r.data),

  getBatch: (batchId: number) =>
    apiClient.get(`/api/tenant-dashboard/analytics/batches/${batchId}`).then(r => r.data),

  getBatchStudents: (batchId: number, params?: BatchStudentsParams) =>
    apiClient.get(`/api/tenant-dashboard/analytics/batches/${batchId}/students`, { params }).then(r => r.data),

  // Topic heatmap
  getTopicHeatmap: (params: TopicHeatmapParams) =>
    apiClient.get("/api/tenant-dashboard/analytics/topics", { params }).then(r => r.data),

  // Config
  getConfig: () =>
    apiClient.get("/api/tenant-dashboard/analytics/config").then(r => r.data),

  updateConfig: (weights: WeightConfig) =>
    apiClient.put("/api/tenant-dashboard/analytics/config", { weights }).then(r => r.data),
};
```

### 4.2 `my-analytics-service.ts`

```typescript
// services/my-analytics-service.ts
import apiClient from "./api-client";

export const myAnalyticsService = {
  getMyPerformance: () =>
    apiClient.get("/api/tenant-dashboard/my-analytics").then(r => r.data),

  getMyHistory: (params?: HistoryParams) =>
    apiClient.get("/api/tenant-dashboard/my-analytics/history", { params }).then(r => r.data),

  getMyTopics: (params?: TopicParams) =>
    apiClient.get("/api/tenant-dashboard/my-analytics/topics", { params }).then(r => r.data),
};
```

---

## 5. TypeScript Interfaces

### 5.1 Core Types (`analytics-types.ts`)

```typescript
// features/tenant-admin/analytics/types/analytics-types.ts

export type RiskLevel = "low" | "medium" | "high" | "critical";
export type MasteryLevel = "not_attempted" | "weak" | "developing" | "proficient" | "mastered";
export type AnalyticsDimension = "quiz" | "course" | "attendance" | "assignment";

export interface StudentPerformanceSummary {
  student_id: number;
  student_name: string;
  student_email: string;
  overall_score: number;
  risk_level: RiskLevel;
  quiz_score: number;
  course_score: number;
  attendance_score: number;
  assignment_score: number;
  quizzes_attempted: number;
  courses_enrolled: number;
  attendance_rate_pct: number;
  last_recalculated_at: string;
  batches: BatchRef[];
}

export interface BatchRef {
  id: number;
  name: string;
  code: string;
}

export interface DimensionMetrics {
  score: number;
  weight: number;
  metrics: Record<string, number>;
}

export interface StudentPerformanceDetail {
  student_id: number;
  student_name: string;
  student_email: string;
  overall_score: number;
  risk_level: RiskLevel;
  dimensions: Record<AnalyticsDimension, DimensionMetrics>;
  batches: BatchRef[];
  last_recalculated_at: string;
}

export interface PerformanceHistoryPoint {
  date: string;
  overall_score: number;
  quiz_score: number;
  course_score: number;
  attendance_score: number;
  assignment_score: number;
  risk_level: RiskLevel;
}

export interface TopicMasteryEntry {
  subject_id: number;
  subject_name: string;
  chapter_id: number | null;
  chapter_name: string | null;
  topic_id: number | null;
  topic_name: string | null;
  questions_attempted: number;
  questions_correct: number;
  correctness_rate_pct: number;
  mastery_level: MasteryLevel;
}

export interface BatchPerformanceSummary {
  batch_id: number;
  batch_name: string;
  batch_code: string;
  status: string;
  start_date: string;
  end_date: string;
  students_total: number;
  avg_overall_score: number;
  avg_quiz_score: number;
  avg_course_score: number;
  avg_attendance_score: number;
  avg_assignment_score: number;
  risk_distribution: Record<RiskLevel, number>;
  last_recalculated_at: string;
}

export interface HeatmapTopic {
  topic_id: number;
  topic_name: string;
  chapter_name: string;
}

export interface HeatmapStudentRow {
  student_id: number;
  student_name: string;
  masteries: {
    topic_id: number;
    mastery_level: MasteryLevel;
    correctness_rate_pct: number;
  }[];
}

export interface TopicAggregate {
  topic_id: number;
  avg_correctness_pct: number;
  mastered_pct: number;
  weak_pct: number;
}

export interface HeatmapResponse {
  subject_id: number;
  subject_name: string;
  topics: HeatmapTopic[];
  students: HeatmapStudentRow[];
  topic_aggregates: TopicAggregate[];
}

export interface WeightConfig {
  quiz: number;
  course: number;
  attendance: number;
  assignment: number;
}

export interface PaginationMeta {
  current_page: number;
  per_page: number;
  total: number;
  last_page: number;
}

// Query params
export interface StudentAnalyticsParams {
  batch_id?: number;
  risk_level?: RiskLevel;
  search?: string;
  sort_by?: string;
  sort_order?: "asc" | "desc";
  page?: number;
  per_page?: number;
}

export interface HistoryParams {
  from_date?: string;
  to_date?: string;
}

export interface TopicParams {
  subject_id?: number;
  chapter_id?: number;
}

export interface BatchAnalyticsParams {
  status?: "active" | "archived" | "all";
  sort_by?: string;
  sort_order?: "asc" | "desc";
}

export interface BatchStudentsParams {
  risk_level?: RiskLevel;
  sort_by?: string;
  sort_order?: "asc" | "desc";
  page?: number;
  per_page?: number;
}

export interface TopicHeatmapParams {
  batch_id?: number;
  subject_id: number;
  chapter_id?: number;
  page?: number;
  per_page?: number;
}
```

---

## 6. TanStack Query Hooks

### 6.1 Pattern

All hooks follow the established TanStack Query v5 pattern. Use `gcTime` (not `cacheTime`). Analytics data is refreshed on a moderate interval since it's near-real-time, not instant.

```typescript
// features/tenant-admin/analytics/hooks/use-student-analytics.ts
"use client";
import { useQuery } from "@tanstack/react-query";
import { studentAnalyticsService } from "@/services/student-analytics-service";
import type { StudentAnalyticsParams } from "../types/analytics-types";

export function useStudentAnalytics(params: StudentAnalyticsParams) {
  return useQuery({
    queryKey: ["analytics", "students", params],
    queryFn: () => studentAnalyticsService.listStudents(params),
    staleTime: 5 * 60 * 1000,   // 5 minutes — near-real-time acceptable
    gcTime: 10 * 60 * 1000,     // 10 minutes
  });
}
```

### 6.2 Hook Registry

| Hook | Query Key | Service Method | staleTime |
|---|---|---|---|
| `useStudentAnalytics(params)` | `["analytics", "students", params]` | `listStudents` | 5 min |
| `useStudentPerformance(studentId)` | `["analytics", "student", studentId]` | `getStudent` | 5 min |
| `useStudentHistory(studentId, params)` | `["analytics", "student", studentId, "history", params]` | `getStudentHistory` | 10 min |
| `useStudentTopics(studentId, params)` | `["analytics", "student", studentId, "topics", params]` | `getStudentTopics` | 10 min |
| `useBatchAnalytics(params)` | `["analytics", "batches", params]` | `listBatches` | 5 min |
| `useBatchDetail(batchId)` | `["analytics", "batch", batchId]` | `getBatch` | 5 min |
| `useBatchStudents(batchId, params)` | `["analytics", "batch", batchId, "students", params]` | `getBatchStudents` | 5 min |
| `useTopicHeatmap(params)` | `["analytics", "topics", params]` | `getTopicHeatmap` | 10 min |
| `useAnalyticsConfig()` | `["analytics", "config"]` | `getConfig` | 30 min |
| `useMyPerformance()` | `["my-analytics"]` | `getMyPerformance` | 5 min |
| `useMyHistory(params)` | `["my-analytics", "history", params]` | `getMyHistory` | 10 min |
| `useMyTopics(params)` | `["my-analytics", "topics", params]` | `getMyTopics` | 10 min |

### 6.3 Config Mutation Hook

```typescript
// features/tenant-admin/analytics/hooks/use-analytics-config.ts
"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { studentAnalyticsService } from "@/services/student-analytics-service";

export function useAnalyticsConfig() {
  return useQuery({
    queryKey: ["analytics", "config"],
    queryFn: studentAnalyticsService.getConfig,
    staleTime: 30 * 60 * 1000,
  });
}

export function useUpdateAnalyticsConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: studentAnalyticsService.updateConfig,
    onSuccess: () => {
      // Invalidate config AND all analytics data (weights changed = scores change)
      qc.invalidateQueries({ queryKey: ["analytics"] });
    },
  });
}
```

**Important:** When weights are updated, ALL analytics query caches are invalidated (using the broad `["analytics"]` key prefix). This forces the UI to refetch with the recalculated scores once the backend rebuild job completes.

---

## 7. View Specifications

### 7.1 View 1: Analytics Overview (Student List)

**Route:** `/tenant-admin-dashboard/analytics`
**Page file:** `app/(tenant-admin-dashboard)/tenant-admin-dashboard/analytics/page.tsx`

**Layout:**

```
┌──────────────────────────────────────────────────────────┐
│  PageHeader: "Student Analytics"                         │
│  Subtitle: "Performance overview across all students"    │
├──────────────────────────────────────────────────────────┤
│  ┌──────────────────────────────────────────────────┐   │
│  │ Filters Row                                       │   │
│  │ [Batch ▼] [Risk Level ▼] [Search...] [Sort ▼]    │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │ Student Table                                     │   │
│  │ ┌────────┬───────┬──────┬──────┬──────┬──────┐   │   │
│  │ │ Name   │Overall│ Quiz │Course│Attend│Assign│   │   │
│  │ ├────────┼───────┼──────┼──────┼──────┼──────┤   │   │
│  │ │ Ravi K │ 73 🟢 │  80  │  65  │  85  │  62  │   │   │
│  │ │ Priya  │ 45 🟡 │  50  │  30  │  60  │  40  │   │   │
│  │ │ Arjun  │ 28 🔴 │  20  │  35  │  25  │  30  │   │   │
│  │ └────────┴───────┴──────┴──────┴──────┴──────┘   │   │
│  │ Pagination: < 1 2 3 ... 8 >                       │   │
│  └──────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────┘
```

**Component breakdown:**

| Component | Responsibility |
|---|---|
| `student-list-filters.tsx` | Batch dropdown (from batch list), risk level pills, search input, sort dropdown |
| `student-list-table.tsx` | Data table with sortable columns, row click navigates to student profile |
| `risk-level-badge.tsx` | Colored badge showing risk level with appropriate semantic color |

**Behaviors:**
- Table rows are clickable → navigate to `/tenant-admin-dashboard/analytics/students/{studentId}`
- Sort by clicking column headers (toggles asc/desc)
- Filters update URL query params for shareable/bookmarkable state
- Skeleton rows during loading (not full-page spinner)
- Empty state when no students have analytics data yet (`analytics-empty-state.tsx`)
- Pagination uses the `meta` object from the API response

**Risk level colors (using semantic design tokens):**

| Level | Color Token | Visual |
|---|---|---|
| `low` | `--color-success` (#10B981) | Green badge |
| `medium` | `--color-warning` (#F59E0B) | Amber badge |
| `high` | `--color-danger` (#EF4444) | Red badge |
| `critical` | `--color-danger` with dark variant | Dark red badge, bold text |

### 7.2 View 2: Student Performance Profile

**Route:** `/tenant-admin-dashboard/analytics/students/{studentId}`
**Page file:** `app/(tenant-admin-dashboard)/tenant-admin-dashboard/analytics/students/[studentId]/page.tsx`

**Layout:**

```
┌───────────────────────────────────────────────────────────────┐
│  PageHeader: "← Back to Overview"   "Ravi Kumar"              │
│  Subtitle: "JEE Batch A · JEE-2026-A"                        │
├───────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌─────────────┐  ┌──────────────────────────────────────┐   │
│  │  Score Ring  │  │  Risk Level: 🟢 LOW                  │   │
│  │     73       │  │  Last updated: 2 hours ago            │   │
│  │   / 100      │  │                                       │   │
│  └─────────────┘  └──────────────────────────────────────┘   │
│                                                               │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐        │
│  │ Quiz     │ │ Course   │ │ Attend.  │ │ Assign.  │        │
│  │ Score:80 │ │ Score:65 │ │ Score:85 │ │ Score:62 │        │
│  │ Wt: 35%  │ │ Wt: 25%  │ │ Wt: 25%  │ │ Wt: 15%  │        │
│  │ ──────── │ │ ──────── │ │ ──────── │ │ ──────── │        │
│  │ Pass: 75%│ │ Comp: 58%│ │ Rate: 93%│ │ Avg: 69% │        │
│  │ Att: 12  │ │ Enrl: 3  │ │ Late: 5% │ │ Pass: 80%│        │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘        │
│                                                               │
│  ┌───────────────────────────────────────────────────────┐   │
│  │  Performance Trend (90 days)                           │   │
│  │  [Line Chart: overall + 4 dimensions over time]        │   │
│  │  Date range selector: [30d] [60d] [90d]                │   │
│  └───────────────────────────────────────────────────────┘   │
│                                                               │
│  ┌───────────────────────────────────────────────────────┐   │
│  │  Topic Mastery                                         │   │
│  │  Subject filter: [Physics ▼]                           │   │
│  │  ┌──────────────────┬───────┬──────┬─────────┐        │   │
│  │  │ Topic            │Correct│Total │ Mastery  │        │   │
│  │  ├──────────────────┼───────┼──────┼─────────┤        │   │
│  │  │ Projectile Motion│  12   │  15  │ 🟢 MAST │        │   │
│  │  │ Newton's 3rd Law │   3   │   8  │ 🔴 WEAK │        │   │
│  │  └──────────────────┴───────┴──────┴─────────┘        │   │
│  └───────────────────────────────────────────────────────┘   │
└───────────────────────────────────────────────────────────────┘
```

**Component breakdown:**

| Component | Props | Responsibility |
|---|---|---|
| `score-gauge.tsx` | `score: number` | Circular gauge visualization (SVG-based, 0–100, color transitions at risk thresholds) |
| `risk-level-badge.tsx` | `level: RiskLevel` | Colored risk indicator |
| `dimension-breakdown.tsx` | `dimensions: Record<AnalyticsDimension, DimensionMetrics>` | Four cards showing per-dimension score, weight, and raw metrics |
| `performance-trend-chart.tsx` | `history: PerformanceHistoryPoint[]` | Recharts `LineChart` with 5 series (overall + 4 dimensions), toggleable legend, date range buttons |
| `topic-mastery-list.tsx` | `topics: TopicMasteryEntry[]` | Table of topics with mastery badge, filterable by subject |

**Data fetching pattern:**

The page component fetches two queries in parallel:
1. `useStudentPerformance(studentId)` — profile data + dimensions
2. `useStudentHistory(studentId, { from_date, to_date })` — trend chart data

Topic mastery is loaded lazily when the section scrolls into view or on user interaction (subject filter change), since it's below the fold.

**Trend chart specifics:**
- Library: **Recharts** (already available per artifact guidelines)
- Chart type: `LineChart` with `ResponsiveContainer`
- Series: 5 lines (overall in bold, 4 dimensions in lighter weight)
- X-axis: dates (formatted as "Mar 1", "Mar 15", etc.)
- Y-axis: 0–100
- Tooltip: shows all 5 values for the hovered date
- Date range buttons: 30d / 60d / 90d (default 90d) — these update the `from_date` query param on the history hook

**Mastery level colors:**

| Level | Color Token | Text |
|---|---|---|
| `not_attempted` | `--color-text-muted` | Grey, italic |
| `weak` | `--color-danger` | Red |
| `developing` | `--color-warning` | Amber |
| `proficient` | `--color-info` | Indigo |
| `mastered` | `--color-success` | Green |

### 7.3 View 3: Batch Comparison Dashboard

**Route:** `/tenant-admin-dashboard/analytics/batches`
**Page file:** `app/(tenant-admin-dashboard)/tenant-admin-dashboard/analytics/batches/page.tsx`

**Layout:**

```
┌──────────────────────────────────────────────────────────┐
│  PageHeader: "Batch Comparison"                          │
│  Subtitle: "Compare performance across batches"          │
├──────────────────────────────────────────────────────────┤
│  Filters: [Status: Active ▼] [Sort: Avg Score ▼]        │
│                                                          │
│  ┌─────────────────────┐  ┌─────────────────────┐       │
│  │ JEE Batch A          │  │ JEE Batch B          │       │
│  │ Code: JEE-2026-A     │  │ Code: JEE-2026-B     │       │
│  │ Students: 45          │  │ Students: 38          │       │
│  │ Avg Score: 68.4       │  │ Avg Score: 55.2       │       │
│  │ ┌──────────────────┐ │  │ ┌──────────────────┐ │       │
│  │ │ Quiz:   72.1     │ │  │ │ Quiz:   58.3     │ │       │
│  │ │ Course: 61.5     │ │  │ │ Course: 49.1     │ │       │
│  │ │ Attend: 78.3     │ │  │ │ Attend: 65.0     │ │       │
│  │ │ Assign: 55.9     │ │  │ │ Assign: 48.2     │ │       │
│  │ └──────────────────┘ │  │ └──────────────────┘ │       │
│  │ Risk: 🟢28 🟡10 🔴5 ⚫2│  │ Risk: 🟢15 🟡12 🔴8 ⚫3│       │
│  │ [View Students →]     │  │ [View Students →]     │       │
│  └─────────────────────┘  └─────────────────────┘       │
│                                                          │
│  ┌─────────────────────┐                                │
│  │ Physics Special      │                                │
│  │ ...                   │                                │
│  └─────────────────────┘                                │
└──────────────────────────────────────────────────────────┘
```

**Component breakdown:**

| Component | Responsibility |
|---|---|
| `batch-comparison-grid.tsx` | CSS Grid of batch cards (responsive: 1 col mobile, 2 col tablet, 3 col desktop) |
| `batch-risk-distribution.tsx` | Inline horizontal stacked bar showing risk distribution within a batch card |

**Behaviors:**
- Cards are clickable → navigate to `/tenant-admin-dashboard/analytics/batches/{batchId}`
- "View Students" link also navigates to batch detail
- Batch detail page (`[batchId]/page.tsx`) reuses `student-list-table.tsx` and `student-list-filters.tsx` from View 1, pre-filtered to the selected batch

### 7.4 View 4: Topic Mastery Heatmap

**Route:** `/tenant-admin-dashboard/analytics/topics`
**Page file:** `app/(tenant-admin-dashboard)/tenant-admin-dashboard/analytics/topics/page.tsx`

**Layout:**

```
┌─────────────────────────────────────────────────────────────┐
│  PageHeader: "Topic Mastery Heatmap"                        │
│  Subtitle: "Student strengths and weaknesses by topic"      │
├─────────────────────────────────────────────────────────────┤
│  Filters: [Subject: Physics ▼] [Batch: All ▼] [Chapter ▼]  │
│  Legend: ■ Mastered ■ Proficient ■ Developing ■ Weak ■ N/A  │
│                                                             │
│  ┌───────────┬────────────┬───────────┬──────────┬────────┐│
│  │ Student   │ Projectile │ Newton 3  │ Friction │ Energy ││
│  │           │ Motion     │           │          │        ││
│  ├───────────┼────────────┼───────────┼──────────┼────────┤│
│  │ Ravi K    │  🟢 80%    │  🔴 38%   │  🟡 55%  │  🟣 72%││
│  │ Priya S   │  🟣 70%    │  🟡 50%   │  🟢 90%  │  🔴 25%││
│  │ Arjun M   │  🔴 30%    │  🔴 20%   │  🟡 45%  │  🟡 48%││
│  ├───────────┼────────────┼───────────┼──────────┼────────┤│
│  │ Average   │    75%     │    43%    │    45%   │    61% ││
│  │ Mastered% │    45%     │    15%    │    20%   │    35% ││
│  │ Weak%     │    10%     │    35%    │    25%   │    20% ││
│  └───────────┴────────────┴───────────┴──────────┴────────┘│
│  Pagination: < 1 2 3 >                                      │
└─────────────────────────────────────────────────────────────┘
```

**Component breakdown:**

| Component | Responsibility |
|---|---|
| `topic-heatmap-grid.tsx` | Full matrix render — sticky first column (student names), scrollable topic columns, aggregate footer row |
| `heatmap-cell.tsx` | Single cell: background color from mastery level, shows correctness % on hover (tooltip) |
| `heatmap-legend.tsx` | Color legend bar showing all 5 mastery levels |

**Behaviors:**
- Subject selector is **required** — the page shows a prompt to select a subject if none is selected
- Cells have tooltips showing: topic name, questions attempted, questions correct, correctness %
- Student name column is clickable → navigates to student profile
- Aggregate footer row (Average, Mastered%, Weak%) shows column-level stats from `topic_aggregates`
- Student rows are paginated (max 50 per page per 19B contract)
- Table scrolls horizontally on smaller screens with sticky student name column

**Responsive behavior:**
- Desktop (≥1024px): full grid with horizontal scroll if > 8 topics
- Tablet (768–1023px): same grid, narrower cells, smaller text
- Mobile (<768px): rotated view or list-based fallback showing one student at a time with their topic mastery (heatmap is inherently desktop-oriented; on mobile, show per-student topic list instead)

### 7.5 View 5: Student Self-Access ("My Performance")

**Route:** `/panel/my-performance`
**Page file:** `app/(panel)/panel/my-performance/page.tsx`

This is the **student's own** view. It reuses the same visual components as the admin student profile view but with these differences:

| Aspect | Admin View | Student Self-View |
|---|---|---|
| Data source | `useStudentPerformance(studentId)` | `useMyPerformance()` |
| Header | Shows student name + email + batches | Shows "My Performance" (no need to show own name) |
| Risk level badge | Visible | **Hidden** — students should not see their risk classification |
| Dimension weights | Visible (shows "Weight: 35%") | **Hidden** — students don't need to know the internal weighting |
| Trend chart | Full 5-series chart | Same |
| Topic mastery | Full table | Same |
| Back navigation | "← Back to Overview" | "← Back to Dashboard" |

**Critical UX decision:** Students see their scores and trends but NOT their risk level or the weight configuration. The risk level is an internal admin/teacher tool. Showing "CRITICAL RISK" to a student would be discouraging and counterproductive. Instead, the student sees their overall score (which speaks for itself) and their topic-level strengths/weaknesses (which is actionable).

### 7.6 Weight Configuration Page

**Route:** `/tenant-admin-dashboard/analytics/settings`
**Page file:** `app/(tenant-admin-dashboard)/tenant-admin-dashboard/analytics/settings/page.tsx`

**Layout:**

```
┌──────────────────────────────────────────────────────────┐
│  PageHeader: "Analytics Settings"                        │
│  Subtitle: "Configure how student performance is scored" │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │  Performance Weight Configuration                  │  │
│  │                                                    │  │
│  │  Quiz Score Weight        [====35====] 35%         │  │
│  │  Course Progress Weight   [===25===]   25%         │  │
│  │  Attendance Weight        [===25===]   25%         │  │
│  │  Assignment Weight        [==15==]     15%         │  │
│  │                                                    │  │
│  │  Total: 100% ✓                                     │  │
│  │                                                    │  │
│  │  ⚠ Changing weights will trigger a full            │  │
│  │    recalculation of all student analytics.          │  │
│  │    This may take a few minutes.                    │  │
│  │                                                    │  │
│  │  [Reset to Defaults]              [Save Changes]   │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

**Component: `weight-config-form.tsx`**

- Four numeric inputs (or range sliders) with real-time sum display
- Client-side validation: each field 0–100, sum must equal 100, at least two fields > 0
- "Total" indicator turns red with error message if sum ≠ 100
- Warning message about recalculation impact
- "Reset to Defaults" button restores Quiz=35, Course=25, Attendance=25, Assignment=15
- On save: calls `useUpdateAnalyticsConfig()` mutation, shows success toast, invalidates all analytics caches
- Use React Hook Form for form state management with Zod validation

---

## 8. Shared UI Components

### 8.1 `score-gauge.tsx`

A circular SVG gauge showing a score from 0–100. Color transitions based on risk thresholds.

Props:
```typescript
interface ScoreGaugeProps {
  score: number;       // 0-100
  size?: "sm" | "md" | "lg";   // sm=64px, md=96px, lg=128px
  showLabel?: boolean; // show "/100" below the score number
}
```

Color logic:
- score ≥ 70: `--color-success`
- score ≥ 50: `--color-warning`
- score ≥ 30: `--color-danger`
- score < 30: `--color-danger` (darker variant)

Implementation: SVG circle with `stroke-dasharray` and `stroke-dashoffset` for the arc. Use CSS transitions for smooth animation on score change.

### 8.2 `risk-level-badge.tsx`

A pill-shaped badge with semantic coloring.

Props:
```typescript
interface RiskLevelBadgeProps {
  level: RiskLevel;
  size?: "sm" | "md";
}
```

Uses `class-variance-authority` for variant management. Never use hardcoded hex colors — always CSS tokens.

---

## 9. State Management & Data Flow

### 9.1 URL-Driven State

Filter and sort state is stored in URL search params (not React state). This enables:
- Shareable/bookmarkable filtered views
- Browser back/forward navigation works correctly
- Refreshing the page preserves filter state

Use `useSearchParams()` from Next.js to read and update URL params. When a filter changes, update the URL param, which triggers the TanStack Query hook to refetch with new params.

### 9.2 No Client-Side Score Calculation

The frontend NEVER calculates scores, risk levels, or mastery levels. All values come from the API. The frontend renders what the backend returns. This is a hard rule from the platform architecture principle: "The backend is the authority on what data to return. The frontend is a rendering layer."

### 9.3 Polling / Refresh

Analytics data is not real-time. The `staleTime` values on TanStack Query hooks (5–10 minutes) naturally cause refetches when the user navigates back to an analytics page. There is no manual "Refresh" button needed for Phase 19C. If a user changes weights, all analytics queries are invalidated, causing immediate refetch.

---

## 10. Responsive Design

### 10.1 Breakpoints

Per the Tenant Admin Dashboard UI/UX Guidelines:

| Breakpoint | Width | Layout Adaptation |
|---|---|---|
| Mobile | < 768px | Single column, bottom nav, simplified components |
| Tablet | 768–1023px | Two-column where applicable |
| Desktop | ≥ 1024px | Full layout with sidebar |

### 10.2 Per-View Responsive Behavior

| View | Mobile Adaptation |
|---|---|
| Student List (View 1) | Filters collapse into a slide-out panel. Table shows only Name, Overall Score, Risk. Tap to expand row details. |
| Student Profile (View 2) | Dimension cards stack vertically. Chart is full-width. Topic table scrolls horizontally. |
| Batch Comparison (View 3) | Cards stack into single column. Full-width cards. |
| Topic Heatmap (View 4) | Switch to per-student list view instead of matrix. Each student card shows their topic masteries as a vertical list. |
| My Performance (View 5) | Same as Student Profile mobile adaptation. |
| Weight Config (View 6) | Sliders become full-width. Save button becomes sticky at bottom. |

### 10.3 Touch Targets

All interactive elements must have minimum 44×44px touch targets per the UI/UX guidelines. This especially applies to:
- Table row tap targets
- Filter dropdowns
- Pagination controls
- Heatmap cells (on tablet — on mobile the heatmap is replaced)

---

## 11. Loading & Error States

### 11.1 Loading States

Every data-dependent component must show skeleton loaders during fetch. Per UI/UX guidelines: use skeleton rows for tables, skeleton cards for batch comparison, skeleton chart placeholder for trend chart. Never use a full-page spinner.

| Component | Skeleton Pattern |
|---|---|
| Student table | 5 skeleton rows with column placeholders |
| Score gauge | Circular skeleton ring |
| Dimension cards | 4 rectangular skeletons in a row |
| Trend chart | Rectangular placeholder with animated pulse |
| Heatmap | Grid of square skeleton cells |
| Batch cards | 3 card-shaped skeletons |

### 11.2 Error States

Each route has an `error.tsx` boundary. Component-level errors show inline error messages with a "Retry" button that calls `refetch()` on the TanStack Query hook.

### 11.3 Empty States

| View | Empty State Message | Visual |
|---|---|---|
| Student list (no students) | "No analytics data yet. Student performance will appear here after quizzes, assignments, and attendance are recorded." | Illustration + message |
| Student profile (all zeros) | No special empty state — show zeros naturally with dimension cards showing "No data" where values are 0 |
| Batch comparison (no batches) | "No batches found. Create batches and assign students to see performance comparisons." | |
| Topic heatmap (no quiz data) | "No quiz data available for this subject. Topic mastery appears after students attempt quizzes with tagged questions." | |
| My Performance (student, no data) | "Your performance profile will appear here as you complete quizzes, assignments, and attend classes." | Friendly illustration |

---

## 12. Accessibility

Per the Tenant Admin Dashboard UI/UX Guidelines, all components must meet:

- Color contrast ≥ 4.5:1 (WCAG AA)
- Keyboard navigable: tab through filters, table rows, chart controls
- `aria-label` on all icon-only buttons (filter icons, sort indicators)
- Score gauge: `role="meter"` with `aria-valuenow`, `aria-valuemin="0"`, `aria-valuemax="100"`
- Heatmap cells: `aria-label` describing the value (e.g., "Ravi Kumar, Projectile Motion: 80% correct, Mastered")
- Risk badge: `aria-label` with full text (e.g., "Risk level: high")
- Trend chart: provide a visually hidden data table alternative for screen readers
- Mastery colors must be paired with text labels (never color-alone) per UI/UX guideline: "color alone must not convey meaning"

---

## 13. What Phase 19C Does NOT Include

| Excluded Item | Reason | Deferred To |
|---|---|---|
| Super Admin analytics views | Platform-level analytics not scoped | Future |
| Parent portal analytics view | Requires parent panel | Future |
| Export/download buttons (CSV, PDF) | Dashboard-only scope | Phase 19D |
| Manual "Recalculate" button for admins | Recalculation is automatic (event-driven + nightly) | Future if needed |
| Real-time score updates via WebSocket | Polling + staleTime is sufficient | Future |
| Dark mode | Not in current design system scope | Future platform-wide |
| Animated transitions between score states | Nice-to-have, not required | Polish pass |
| Mobile-native app views (React Native) | Responsive web first | Post-PWA phase |
| Drill-down from batch card directly to heatmap for that batch | Nice cross-view navigation | Future |

---

## 14. Quality Gates — Phase 19C Complete

### 14.1 Architecture Gates

- [ ] All components use CSS variable tokens — no hardcoded hex values
- [ ] All data fetching via TanStack Query hooks — no raw `fetch()` or `axios` in components
- [ ] Service layer matches API contracts from Phase 19B exactly
- [ ] TypeScript types match API response shapes — no `any` types
- [ ] No client-side score calculations — all values from API
- [ ] URL-driven filter state (searchParams), not React state
- [ ] Feature modules follow `features/tenant-admin/analytics/` structure
- [ ] Panel module follows `features/panel/my-performance/` structure
- [ ] File naming is kebab-case throughout

### 14.2 UX Gates

- [ ] All five views render correctly with real data
- [ ] Skeleton loaders for every data-dependent component
- [ ] Empty states for every view when no data exists
- [ ] Error boundaries catch and display component-level errors with retry
- [ ] Filter changes update URL and trigger data refetch
- [ ] Table column sort works (toggles asc/desc)
- [ ] Pagination works correctly across all paginated views
- [ ] Trend chart renders with toggleable series
- [ ] Heatmap renders with tooltips on cell hover
- [ ] Weight config form validates sum=100 in real-time
- [ ] Toast notification on successful weight save
- [ ] Student self-view hides risk level and weights
- [ ] Clickable rows/cards navigate to detail pages

### 14.3 Responsive Gates

- [ ] All views functional at 375px (mobile)
- [ ] All views functional at 768px (tablet)
- [ ] All views functional at 1280px (desktop)
- [ ] No horizontal scroll on mobile except intentional scrollable areas (heatmap on tablet)
- [ ] Touch targets ≥ 44px on all interactive elements
- [ ] Heatmap degrades to list view on mobile
- [ ] Filter panels collapse to slide-out on mobile

### 14.4 Accessibility Gates

- [ ] Color contrast ≥ 4.5:1 on all text and badges
- [ ] Keyboard navigation works through all interactive elements
- [ ] `aria-label` on icon-only buttons and score gauge
- [ ] Mastery levels communicated via text + color (never color alone)
- [ ] Trend chart has visually hidden data table alternative
- [ ] Labels on all form inputs (weight config)

### 14.5 Integration Gates

- [ ] All 11 API endpoints (19B) consumed correctly by frontend hooks
- [ ] Teacher-scoped view: teacher sees only their batch students
- [ ] Admin view: admin sees all students and batches
- [ ] Student self-view: student sees only own data via `/my-analytics` endpoints
- [ ] Weight config mutation invalidates all analytics caches
- [ ] Navigation entries visible/hidden based on capability

---

## 15. Constraints & Reminders

### Technology Constraints

- **TanStack Query v5:** Use `gcTime` not `cacheTime`. Always provide `queryKey` as an array.
- **Tailwind v4:** CSS-first config via `@import "tailwindcss"` + `@theme`. No `tailwind.config.js`.
- **Recharts** for charts. Already available in the artifact stack. Do NOT introduce Chart.js or D3 for this phase.
- **React Hook Form + Zod** for the weight config form. No uncontrolled forms.
- **Radix UI** for dropdown menus, tooltips, and select components. Style with Tailwind.
- **No `localStorage`/`sessionStorage`** — use URL params for filter state, TanStack Query cache for data state.
- **kebab-case** file naming for all new files.

### What NOT to Do

- Do NOT calculate scores, risk levels, or mastery levels in the frontend. The backend is the authority.
- Do NOT use full-page spinners. Use skeleton loaders per UI/UX guidelines.
- Do NOT grey-out navigation items the role cannot access. Hide them entirely.
- Do NOT show risk level or weight configuration to students in the self-access view.
- Do NOT use `window.confirm()` for the weight save warning. Use a styled confirmation dialog (Radix AlertDialog).
- Do NOT hardcode hex colors. Use CSS variable tokens.
- Do NOT create separate "admin" and "teacher" versions of the same page. One page, role-based data scoping from the backend.
- Do NOT use `useEffect` for data fetching. Use TanStack Query hooks.
- Do NOT import Axios in Server Components. Use it only via TanStack Query hooks in Client Components.

---

## 16. Implementation Plan Requirements

The Implementation Plan produced by Antigravity must include:

1. **Sidebar integration plan:** Show exactly which files are modified to add the analytics navigation group and how capability-based visibility is implemented.
2. **Component hierarchy:** For each view, a component tree showing parent → child relationships and which hooks each component consumes.
3. **Responsive breakpoint evidence:** For the heatmap view specifically, show the mobile fallback design (list view) with wireframe.
4. **Shared component reuse map:** Identify which components from `features/tenant-admin/analytics/components/` are reused in the Panel (`my-performance`) context and how they're imported.
5. **File manifest:** Complete list of all new files with paths and single-line descriptions (~35 files expected).

---

## 17. Definition of Done

Phase 19C is complete when:

1. The implementation plan has been reviewed and approved by the Principal Engineer.
2. All code is implemented per the approved plan.
3. All quality gates in §14 pass.
4. A Principal Engineer audit confirms zero critical or high findings.
5. All findings from audit are resolved.
6. End-to-end demonstration: Tenant Admin navigates to analytics → sees student list → clicks student → sees profile with trend chart and topic mastery → navigates to batch comparison → navigates to heatmap → configures weights → sees recalculated data.
7. Student self-access demonstration: Student logs in → navigates to My Performance → sees own scores, trend, and topic mastery without risk level or weights.
8. Teacher scoped demonstration: Teacher logs in → analytics views show only their batch students.
9. Responsive demonstration: all views functional on mobile (375px) and tablet (768px).
10. The Phase 19C Completion Report is signed off.

---

*End of Document — UBOTZ 2.0 Phase 19C Developer Instructions — March 26, 2026*
