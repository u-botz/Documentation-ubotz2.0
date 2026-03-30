# UBOTZ 2.0 — Phase 15C-II Developer Instructions

## Lead Scoring Engine

| Field | Value |
|---|---|
| **Document Type** | Developer Instruction (Pre-Implementation Brief) |
| **Phase** | 15C-II (of 15C-I / 15C-II / 15C-III) |
| **Date** | March 25, 2026 |
| **Issued By** | Principal Engineer / Architecture Auditor |
| **Audience** | Implementation Developer (Antigravity) |
| **Expected Deliverable** | Phase 15C-II Implementation Plan |
| **Prerequisites** | Phase 15C-I COMPLETE (Structured Lead Activities + Follow-up Tasks with Tiered Escalation) |

> **This phase builds the Lead Scoring Engine — a platform-defined, tenant-configurable scoring formula that automatically prioritizes leads as Hot, Warm, or Cold. The scoring engine consumes the structured activity data built in Phase 15C-I, combined with source attribution, pipeline stage, website visits, and recency decay. Phase 15C-III (Workflow Automation) will use score thresholds as automation triggers. The scoring model must be deterministic, auditable, and recalculable.**

---

## 1. Mission Statement

Phase 15C-II builds a **Lead Scoring Engine** within the existing `TenantAdminDashboard/LeadManagement` bounded context.

The engine computes a numeric score (0–100) for every lead based on a weighted formula. The platform defines the formula structure and default weights. Tenants can adjust weights to match their admission funnel priorities. Scores are recalculated incrementally on relevant events and fully recalculated nightly to account for recency decay.

**What this phase includes:**
- Scoring formula with 5 signal categories: Source, Stage, Engagement (activity count by type), Website Visits, and Recency
- Platform-defined default weights per signal category
- Tenant-configurable weight overrides via CRM Settings (extends 15C-I settings)
- Tenant-configurable source score mapping (which sources are worth more)
- Score storage on the `leads` table (`lead_score` integer, `lead_temperature` enum)
- Event-driven incremental score recalculation on activity creation, stage change, and visit count update
- Nightly full recalculation scheduled command for recency decay
- 3-tier temperature classification: Hot (≥70), Warm (40–69), Cold (0–39) — thresholds tenant-configurable
- Score display: Kanban card badge + lead detail page
- Score-based sorting and filtering on lead list endpoint
- `LeadScoreRecalculated` domain event (consumed by Phase 15C-III automation triggers)

**What this phase does NOT include:**
- Workflow automation rules triggered by score changes (Phase 15C-III)
- Predictive scoring / ML-based scoring models
- Score history / trend tracking over time (future — only current score is stored)
- Custom scoring formulas defined by tenants (tenants adjust weights only, not formula structure)
- Behavioral scoring from email opens/clicks (no email engagement tracking exists)
- Dedicated "Hot Leads" dashboard page (future — Kanban badge + filter is sufficient for Phase 1)

---

## 2. Business Context

### 2.1 Current State

After Phase 15C-I, the system has:
- Structured lead activities with typed categories (Call, WhatsApp, Meeting, Demo Class, Note) — queryable and countable
- `leads.last_activity_at` timestamp updated on every activity
- `leads.stage_changed_at` tracking when the lead last changed pipeline stage
- `leads.source` (LeadSource value object) capturing where the lead came from
- A visit count field on the `leads` table tracking website/landing page visits
- 6-stage pipeline: New Enquiry → Contacted → Interested → App Submitted → Admission Confirmed → Rejected
- No mechanism to automatically rank or prioritize leads — counselors manually scan the Kanban board and decide who to call next

### 2.2 What Changes

After Phase 15C-II:
1. Every lead has a **numeric score (0–100)** that reflects its conversion likelihood based on source quality, pipeline progression, counselor engagement, website interest, and recency of interaction.
2. Leads are classified as **Hot** (≥70), **Warm** (40–69), or **Cold** (0–39) with visual badges on the Kanban board.
3. Counselors can **sort and filter** the lead list by score or temperature, allowing them to focus on the highest-value leads first.
4. Scores **update automatically** when counselors log activities or change pipeline stages, and decay overnight for stale leads.
5. Tenant admins can **tune the scoring weights** in CRM Settings — for example, a coaching center may value walk-in sources higher than website leads, while an online academy values website visits higher.
6. The `LeadScoreRecalculated` domain event is available for Phase 15C-III to trigger automation rules on score threshold crossings.

### 2.3 Why Platform-Defined Formula with Tenant-Adjustable Weights

This is a B2B platform decision. We define the formula structure (the 5 signal categories and how they combine) because:
- It prevents tenants from creating broken scoring rules that produce meaningless numbers
- It keeps the scoring model consistent across the platform for benchmarking
- It simplifies the computation engine — one formula, many weight configurations

Tenants adjust **weights** (how much each signal category matters) and **source mappings** (which sources score higher), not the formula itself. This gives them meaningful customization without formula-level complexity.

---

## 3. Business Rules (NON-NEGOTIABLE)

### 3.1 Scoring Formula

| Rule ID | Rule | Detail |
|---|---|---|
| BR-01 | The lead score is computed as: `Score = (Source × W_source) + (Stage × W_stage) + (Engagement × W_engagement) + (Visits × W_visit) + (Recency × W_recency)` where each signal is normalized to 0–100 and weights sum to 1.0. | The `LeadScoringFormula` service encapsulates this computation. |
| BR-02 | Each signal category produces a normalized sub-score (0–100). The final score is the weighted sum of sub-scores, capped at 0–100. | No lead can score below 0 or above 100. |
| BR-03 | The platform defines default weights. Tenants override weights via CRM Settings. If a tenant has not configured weights, platform defaults apply. | Defaults defined in `config/crm.php`. |

**Platform Default Weights:**

| Signal Category | Default Weight | Description |
|---|---|---|
| Source | 0.15 | How valuable is this lead's origin? |
| Stage | 0.30 | How far along the pipeline? |
| Engagement | 0.25 | How much counselor interaction? |
| Visits | 0.10 | How interested is the lead (website visits)? |
| Recency | 0.20 | How recent was the last interaction? |

### 3.2 Signal Calculation Rules

| Rule ID | Rule | Detail |
|---|---|---|
| BR-04 | **Source Signal**: Each lead source is mapped to a score (0–100). Platform provides default mappings. Tenants can override per-source scores. | See §3.3 Source Score Mapping. |
| BR-05 | **Stage Signal**: Each pipeline stage maps to a fixed score reflecting conversion proximity. | New Enquiry: 10, Contacted: 25, Interested: 50, App Submitted: 75, Admission Confirmed: 100, Rejected: 0. |
| BR-06 | **Engagement Signal**: Computed from activity count and type diversity. Formula: `min(100, (total_activities × 10) + (unique_types × 15))`. | A lead with 5 activities across 3 types scores: min(100, 50 + 45) = 95. A lead with 1 note scores: min(100, 10 + 15) = 25. |
| BR-07 | **Visits Signal**: Computed from the visit count field. Formula: `min(100, visit_count × 20)`. | 1 visit = 20, 3 visits = 60, 5+ visits = 100 (capped). |
| BR-08 | **Recency Signal**: Based on days since `last_activity_at` (from 15C-I) OR `stage_changed_at`, whichever is more recent. Formula: `max(0, 100 - (days_since_last_interaction × 5))`. | Today = 100, 5 days ago = 75, 10 days ago = 50, 20+ days ago = 0. This is the decay function that makes the nightly recalculation essential. |
| BR-09 | If `last_activity_at` is NULL and `stage_changed_at` is NULL, recency defaults to the lead's `created_at`. | Newly created leads start with high recency. |
| BR-10 | If a lead's stage is `Rejected`, the final score is forced to 0 regardless of other signals. | Rejected leads should not appear as "Hot". |
| BR-11 | If a lead's stage is `Admission Confirmed`, the final score is forced to 100. | Converted leads are always at maximum. |

### 3.3 Source Score Mapping

**Platform Default Source Scores:**

| Source | Default Score | Rationale |
|---|---|---|
| `referral` | 90 | Highest conversion rate in education |
| `walk_in` | 85 | Direct interest, high intent |
| `website` | 60 | Moderate intent, needs nurturing |
| `social_media` | 50 | Moderate, depends on campaign quality |
| `google_ads` | 55 | Paid intent, slightly higher than organic social |
| `facebook_ads` | 50 | Paid but broad targeting |
| `event` | 70 | In-person interest, strong signal |
| `other` | 40 | Unknown quality |

Tenants override individual source scores via CRM Settings. The `TenantCrmSettingsService` (extended from 15C-I) resolves tenant overrides with platform defaults as fallback.

### 3.4 Temperature Classification Rules

| Rule ID | Rule | Detail |
|---|---|---|
| BR-12 | Leads are classified into 3 temperature tiers based on score thresholds: **Hot** (≥ hot_threshold), **Warm** (≥ warm_threshold AND < hot_threshold), **Cold** (< warm_threshold). | Default thresholds: Hot ≥ 70, Warm ≥ 40. |
| BR-13 | Temperature thresholds are tenant-configurable via CRM Settings. | Keys: `crm.score_threshold_hot` (default: 70), `crm.score_threshold_warm` (default: 40). |
| BR-14 | The `lead_temperature` column stores the current classification (`hot`, `warm`, `cold`). It is updated whenever the score is recalculated. | Stored for efficient querying — avoids recomputing thresholds on every list request. |

### 3.5 Recalculation Rules

| Rule ID | Rule | Detail |
|---|---|---|
| BR-15 | **Event-driven recalculation**: The score for a SINGLE lead is recalculated when: (a) `LeadActivityCreated` fires for that lead, (b) `LeadStageChanged` fires for that lead, (c) the lead's visit count is updated. | Listener calls `RecalculateLeadScoreUseCase` with the specific `lead_id`. |
| BR-16 | **Nightly full recalculation**: A scheduled command recalculates scores for ALL leads in ALL active tenants. This catches recency decay for leads with no recent events. | `crm:recalculate-lead-scores` command. Runs nightly at 2:00 AM. |
| BR-17 | The `LeadScoreRecalculated` domain event is dispatched ONLY when the score actually changes (old_score ≠ new_score). This prevents event storms during nightly recalculation where most scores remain unchanged. | Conditional dispatch in the scoring service. |
| BR-18 | The `LeadScoreRecalculated` event payload includes `lead_id`, `old_score`, `new_score`, `old_temperature`, `new_temperature`. Phase 15C-III uses `new_temperature ≠ old_temperature` as an automation trigger. | Future-proofing for workflow automation. |
| BR-19 | Score recalculation is **idempotent**. Recalculating the same lead twice with the same underlying data produces the same score. | The formula is deterministic — no randomness, no external state. |
| BR-20 | During nightly recalculation, leads with stage `Rejected` are skipped (score is already forced to 0) and leads with stage `Admission Confirmed` are skipped (score is already forced to 100). | Performance optimization — no point recalculating fixed scores. |

### 3.6 Weight Configuration Rules

| Rule ID | Rule | Detail |
|---|---|---|
| BR-21 | Tenant-configured weights must sum to exactly 1.0. The API validates this constraint. If weights do not sum to 1.0, the request is rejected with a validation error. | `UpdateCrmSettingsRequest` validates `array_sum($weights) === 1.0` (with float tolerance of ±0.01). |
| BR-22 | Each individual weight must be between 0.0 and 1.0 (inclusive). A weight of 0.0 effectively disables that signal category. | Validation in the request. |
| BR-23 | If a tenant has configured only SOME weights (e.g., only `source`), the remaining weights use platform defaults — BUT only if the partial set + defaults sum to 1.0. If not, the API rejects partial updates. **Recommended approach:** require tenants to submit ALL 5 weights together. | Prevents invalid partial states. |

---

## 4. Domain Model

### 4.1 Bounded Context Placement

All new components live within the **existing** `TenantAdminDashboard/LeadManagement` bounded context, extending the 15C-I structure.

### 4.2 New Domain Layer Components

**Path:** `app/Domain/TenantAdminDashboard/LeadManagement/`

| Component | Type | Location | Purpose |
|---|---|---|---|
| `LeadTemperature` | Value Object | `ValueObjects/LeadTemperature.php` | Enum: `hot`, `warm`, `cold`. Includes `fromScore(int $score, int $hotThreshold, int $warmThreshold): self` factory method. |
| `LeadScoreSignals` | Value Object | `ValueObjects/LeadScoreSignals.php` | Immutable container holding the 5 normalized sub-scores (source, stage, engagement, visits, recency) and the weights used. Used for auditability — the "receipt" of how a score was computed. |
| `ScoringWeights` | Value Object | `ValueObjects/ScoringWeights.php` | Immutable container for the 5 weights. Validates sum = 1.0 on construction. |
| `LeadScoreRecalculated` | Domain Event | `Events/LeadScoreRecalculated.php` | Dispatched when score changes. Carries `lead_id`, `old_score`, `new_score`, `old_temperature`, `new_temperature`, `signals` (LeadScoreSignals). |
| `LeadScoringFormulaInterface` | Service Interface | `Services/LeadScoringFormulaInterface.php` | Contract for the scoring computation. `calculate(LeadEntity $lead, ScoringWeights $weights, array $sourceScoreMap, array $activityCounts): LeadScoreResult`. |

### 4.3 New Application Layer Components

**Path:** `app/Application/TenantAdminDashboard/LeadManagement/`

| Component | Type | Location | Purpose |
|---|---|---|---|
| `RecalculateLeadScoreUseCase` | Use Case | `UseCases/RecalculateLeadScoreUseCase.php` | Recalculates score for a single lead. Loads current data, calls formula service, persists new score + temperature, dispatches `LeadScoreRecalculated` if changed. |
| `RecalculateAllLeadScoresCommand` | Console Command | `Automation/Console/Commands/RecalculateAllLeadScoresCommand.php` | Artisan command `crm:recalculate-lead-scores`. Iterates all active tenants, recalculates all non-terminal leads. Runs nightly. |
| `RecalculateLeadScoreOnActivityListener` | Listener | `Listeners/RecalculateLeadScoreOnActivityListener.php` | Listens to `LeadActivityCreated`. Calls `RecalculateLeadScoreUseCase` for the affected lead. |
| `RecalculateLeadScoreOnStageChangeListener` | Listener | `Listeners/RecalculateLeadScoreOnStageChangeListener.php` | Listens to `LeadStageChanged`. Calls `RecalculateLeadScoreUseCase` for the affected lead. |
| `GetLeadScoreBreakdownQuery` | Query | `Queries/GetLeadScoreBreakdownQuery.php` | Returns the score breakdown (each signal's sub-score and weight) for a single lead. Used on lead detail page to show "why this score". |
| `UpdateScoringWeightsUseCase` | Use Case | `UseCases/UpdateScoringWeightsUseCase.php` | Updates tenant scoring weights in CRM Settings. Validates sum = 1.0. Triggers full recalculation for the tenant (async via queued job). |
| `UpdateSourceScoresUseCase` | Use Case | `UseCases/UpdateSourceScoresUseCase.php` | Updates tenant source-to-score mappings in CRM Settings. Triggers full recalculation for the tenant (async via queued job). |

### 4.4 New Infrastructure Layer Components

**Path:** `app/Infrastructure/Persistence/TenantAdminDashboard/LeadManagement/`

| Component | Type | Purpose |
|---|---|---|
| `LeadScoringFormula` | Service Implementation | Implements `LeadScoringFormulaInterface`. Pure computation — no database access. Receives all data as arguments. |

**Path:** `app/Infrastructure/Shared/`

| Component | Type | Purpose |
|---|---|---|
| `RecalculateTenantLeadScoresJob` | Queued Job | Dispatched when weights or source scores change. Recalculates all leads for a tenant in the background. Uses `default` queue priority. |

### 4.5 Modified Application Layer Components

The following existing components are modified:

| Component | Modification |
|---|---|
| `TenantCrmSettingsService` (15C-I) | Extended with methods: `getScoringWeights(): ScoringWeights`, `getSourceScoreMap(): array`, `getTemperatureThresholds(): array`. Resolves tenant overrides with platform default fallback. |
| `ListLeadsQuery` | Extended with `sort_by=score` and `filter[temperature]=hot,warm,cold` query parameters. |
| `LeadResource` / `LeadDetailResource` | Extended to include `score`, `temperature` fields. `LeadDetailResource` additionally includes `score_breakdown` (the 5 sub-scores). |

### 4.6 HTTP Layer — New Endpoints

**Controllers** — extend existing controllers or add new:

| Endpoint | Method | Purpose | Capability |
|---|---|---|---|
| `GET /api/tenant/leads/{lead}/score-breakdown` | `LeadScoreController` | Returns detailed score breakdown for a single lead | `lead.view` |
| `PUT /api/tenant/crm-settings/scoring-weights` | `CrmSettingsController` | Update scoring weights (all 5 required) | `crm.settings.manage` |
| `PUT /api/tenant/crm-settings/source-scores` | `CrmSettingsController` | Update source-to-score mappings | `crm.settings.manage` |
| `PUT /api/tenant/crm-settings/temperature-thresholds` | `CrmSettingsController` | Update Hot/Warm thresholds | `crm.settings.manage` |
| `GET /api/tenant/crm-settings/scoring-config` | `CrmSettingsController` | Get current scoring configuration (weights + source scores + thresholds) | `crm.settings.manage` |

**Form Requests:**

| Request | Validates |
|---|---|
| `UpdateScoringWeightsRequest` | `source` (numeric, 0–1), `stage` (numeric, 0–1), `engagement` (numeric, 0–1), `visits` (numeric, 0–1), `recency` (numeric, 0–1). Custom rule: sum must equal 1.0 (±0.01 tolerance). |
| `UpdateSourceScoresRequest` | Object of `{source_code: score}` pairs. Each score must be integer 0–100. Source codes must be from the valid `LeadSource` set. |
| `UpdateTemperatureThresholdsRequest` | `hot` (integer, 1–100), `warm` (integer, 1–99). Custom rule: `hot > warm`. |

**API Resources:**

| Resource | Shapes |
|---|---|
| `LeadScoreBreakdownResource` | `score`, `temperature`, `signals.source` (sub-score + weight), `signals.stage`, `signals.engagement`, `signals.visits`, `signals.recency`, `computed_at` |
| `ScoringConfigResource` | `weights` (5 values), `source_scores` (source → score map), `thresholds` (hot, warm), `is_custom` (boolean — whether tenant has overridden defaults) |

---

## 5. Database Schema

### 5.1 Modified Tables

**`leads`** — Add columns:

| Column | Type | Notes |
|---|---|---|
| `lead_score` | TINYINT UNSIGNED NOT NULL DEFAULT 0 | 0–100. The computed lead score. |
| `lead_temperature` | VARCHAR(10) NOT NULL DEFAULT 'cold' | `hot`, `warm`, `cold`. Denormalized for efficient filtering. |
| `score_calculated_at` | TIMESTAMP NULLABLE | When the score was last computed. Used to detect stale scores. |

**Indexes:**
- `idx_leads_score` → `(tenant_id, lead_score DESC)` — for sorting by score
- `idx_leads_temperature` → `(tenant_id, lead_temperature)` — for filtering by temperature

### 5.2 CRM Settings Keys

Extend the CRM settings (introduced in 15C-I) with scoring-specific keys:

| Key | Type | Default | Description |
|---|---|---|---|
| `crm.scoring_weights` | JSON | `{"source":0.15,"stage":0.30,"engagement":0.25,"visits":0.10,"recency":0.20}` | Weight per signal category. Must sum to 1.0. |
| `crm.source_scores` | JSON | `{"referral":90,"walk_in":85,"website":60,"social_media":50,"google_ads":55,"facebook_ads":50,"event":70,"other":40}` | Score per lead source. 0–100. |
| `crm.score_threshold_hot` | integer | `70` | Score ≥ this = Hot |
| `crm.score_threshold_warm` | integer | `40` | Score ≥ this AND < hot = Warm. Below this = Cold. |

These are stored using the same tenant settings mechanism as the 15C-I escalation thresholds. The `TenantCrmSettingsService` is the single resolver for all CRM configuration.

### 5.3 No New Tables

The scoring engine does **not** require new tables. Scores are stored on the `leads` table. Configuration is stored in the existing tenant settings system. Score breakdown is computed on-demand by the `GetLeadScoreBreakdownQuery` — it is NOT persisted as a separate record.

**Rationale:** Storing score history (score snapshots over time) would be useful for trend analysis but is out of scope for Phase 1. The current architecture supports adding a `lead_score_history` table later without structural changes.

---

## 6. Scoring Formula — Detailed Specification

### 6.1 Input Data

The `LeadScoringFormula` service receives all data as arguments — it has NO database access. The calling use case is responsible for gathering the data.

```
Input:
├── lead_source: string (e.g., 'referral', 'website')
├── pipeline_stage: string (e.g., 'new_enquiry', 'contacted')
├── activity_counts: { call: int, whatsapp: int, meeting: int, demo_class: int, note: int }
├── unique_activity_types: int (count of distinct non-zero activity types)
├── total_activities: int (sum of all activity counts)
├── visit_count: int (from leads.visit_count or equivalent column)
├── days_since_last_interaction: int (from last_activity_at or stage_changed_at or created_at)
├── weights: ScoringWeights (5 floats summing to 1.0)
├── source_score_map: { source_code: int (0-100) }
├── temperature_thresholds: { hot: int, warm: int }

Output:
├── score: int (0-100)
├── temperature: LeadTemperature (hot | warm | cold)
├── signals: LeadScoreSignals (5 sub-scores)
```

### 6.2 Sub-Score Calculations

**Source Sub-Score (0–100):**
```
source_sub_score = source_score_map[lead_source] ?? source_score_map['other'] ?? 40
```

**Stage Sub-Score (0–100):**
```
stage_map = {
    'new_enquiry': 10,
    'contacted': 25,
    'interested': 50,
    'app_submitted': 75,
    'admission_confirmed': 100,
    'rejected': 0
}
stage_sub_score = stage_map[pipeline_stage] ?? 0
```

**Engagement Sub-Score (0–100):**
```
engagement_sub_score = min(100, (total_activities × 10) + (unique_activity_types × 15))
```

**Visits Sub-Score (0–100):**
```
visits_sub_score = min(100, visit_count × 20)
```

**Recency Sub-Score (0–100):**
```
recency_sub_score = max(0, 100 - (days_since_last_interaction × 5))
```

### 6.3 Final Score Computation

```
raw_score = (source_sub_score × W_source)
          + (stage_sub_score × W_stage)
          + (engagement_sub_score × W_engagement)
          + (visits_sub_score × W_visit)
          + (recency_sub_score × W_recency)

score = round(raw_score)  // Round to nearest integer
score = max(0, min(100, score))  // Clamp to 0-100

// Terminal stage overrides
if (pipeline_stage === 'rejected') score = 0
if (pipeline_stage === 'admission_confirmed') score = 100

temperature = LeadTemperature::fromScore(score, hot_threshold, warm_threshold)
```

### 6.4 Example Calculations

**Example 1 — Hot Lead:**
- Source: `referral` (90) × 0.15 = 13.5
- Stage: `interested` (50) × 0.30 = 15.0
- Engagement: 6 activities, 3 types → min(100, 60 + 45) = 100 × 0.25 = 25.0
- Visits: 4 → min(100, 80) = 80 × 0.10 = 8.0
- Recency: 1 day ago → max(0, 100 - 5) = 95 × 0.20 = 19.0
- **Score: round(80.5) = 81 → Hot**

**Example 2 — Cold Lead:**
- Source: `other` (40) × 0.15 = 6.0
- Stage: `new_enquiry` (10) × 0.30 = 3.0
- Engagement: 0 activities → 0 × 0.25 = 0.0
- Visits: 0 → 0 × 0.10 = 0.0
- Recency: 15 days ago → max(0, 100 - 75) = 25 × 0.20 = 5.0
- **Score: round(14.0) = 14 → Cold**

**Example 3 — Rejected Lead:**
- All signals may be high, but stage is `rejected` → **Score forced to 0 → Cold**

---

## 7. Recalculation Strategy

### 7.1 Event-Driven Incremental Recalculation

| Trigger Event | Listener | Action |
|---|---|---|
| `LeadActivityCreated` (15C-I) | `RecalculateLeadScoreOnActivityListener` | Call `RecalculateLeadScoreUseCase` for `event->leadId` |
| `LeadStageChanged` (15A) | `RecalculateLeadScoreOnStageChangeListener` | Call `RecalculateLeadScoreUseCase` for `event->leadId` |

**Visit count update:** When the visit count on a lead is updated (however this currently works — direct column update or via an API endpoint), the recalculation should be triggered. The developer must identify the existing mechanism for incrementing visit count and wire a listener or inline call to `RecalculateLeadScoreUseCase`.

**Performance:** Each incremental recalculation queries:
1. The lead record (1 query)
2. Activity counts grouped by type for this lead (1 query: `SELECT type, COUNT(*) FROM lead_activities WHERE lead_id = ? GROUP BY type`)
3. Tenant CRM settings (1 query, cacheable)

Total: 2–3 queries per event. This is acceptable for event-driven recalculation.

### 7.2 Nightly Full Recalculation

**Command:** `crm:recalculate-lead-scores`
**Schedule:** Daily at 2:00 AM
**Pattern:** Same tenant iteration pattern as all other CRM scheduled commands (15C-I)

```
1. For each active tenant:
   a. Set TenantContext
   b. Load tenant scoring configuration (weights, source scores, thresholds)
   c. Find all leads WHERE stage NOT IN ('rejected', 'admission_confirmed')
   d. For each lead in chunks of 100:
      - Load activity counts for all leads in chunk (batch query)
      - Compute score for each lead
      - Bulk update leads table with new scores and temperatures
      - Dispatch LeadScoreRecalculated events only for leads whose score changed
   e. Reset TenantContext
```

**Chunking is mandatory.** A tenant with 5,000 leads must not load all leads into memory at once. Process in chunks of 100.

**Batch activity query optimization:** Instead of querying activity counts per-lead in a loop, use a single grouped query:
```sql
SELECT lead_id, type, COUNT(*) as count
FROM lead_activities
WHERE lead_id IN (?, ?, ...)
GROUP BY lead_id, type
```
Then pivot the results in PHP. This reduces the nightly recalculation from O(N) queries to O(N/100) batch queries.

### 7.3 Recalculation After Weight/Source/Threshold Changes

When a tenant admin updates scoring weights, source scores, or temperature thresholds, ALL leads in that tenant must be recalculated. This is dispatched as an asynchronous queued job (`RecalculateTenantLeadScoresJob`) on the `default` queue. The API response returns immediately — the recalculation happens in the background.

The job follows the same chunked processing pattern as the nightly command.

---

## 8. API Contracts

### 8.1 Score Breakdown Endpoint

**`GET /api/tenant/leads/{lead}/score-breakdown`**

Response:
```json
{
    "score": 81,
    "temperature": "hot",
    "computed_at": "2026-03-25T14:30:00+05:30",
    "signals": {
        "source": {
            "value": "referral",
            "sub_score": 90,
            "weight": 0.15,
            "weighted_score": 13.5
        },
        "stage": {
            "value": "interested",
            "sub_score": 50,
            "weight": 0.30,
            "weighted_score": 15.0
        },
        "engagement": {
            "total_activities": 6,
            "unique_types": 3,
            "sub_score": 100,
            "weight": 0.25,
            "weighted_score": 25.0
        },
        "visits": {
            "visit_count": 4,
            "sub_score": 80,
            "weight": 0.10,
            "weighted_score": 8.0
        },
        "recency": {
            "days_since_last_interaction": 1,
            "sub_score": 95,
            "weight": 0.20,
            "weighted_score": 19.0
        }
    }
}
```

Capability: `lead.view`.

### 8.2 Scoring Configuration Endpoints

**`GET /api/tenant/crm-settings/scoring-config`**

Response:
```json
{
    "weights": {
        "source": 0.15,
        "stage": 0.30,
        "engagement": 0.25,
        "visits": 0.10,
        "recency": 0.20
    },
    "source_scores": {
        "referral": 90,
        "walk_in": 85,
        "website": 60,
        "social_media": 50,
        "google_ads": 55,
        "facebook_ads": 50,
        "event": 70,
        "other": 40
    },
    "thresholds": {
        "hot": 70,
        "warm": 40
    },
    "is_custom": false
}
```

Capability: `crm.settings.manage`.

---

**`PUT /api/tenant/crm-settings/scoring-weights`**

Request:
```json
{
    "source": 0.20,
    "stage": 0.25,
    "engagement": 0.25,
    "visits": 0.15,
    "recency": 0.15
}
```

Response: `200 OK` — Updated `ScoringConfigResource`.

Side effect: Dispatches `RecalculateTenantLeadScoresJob` asynchronously.

Capability: `crm.settings.manage`. Audit-logged with old and new values.

---

**`PUT /api/tenant/crm-settings/source-scores`**

Request:
```json
{
    "referral": 95,
    "walk_in": 90,
    "website": 50,
    "other": 30
}
```

Partial updates allowed — only submitted sources are overridden. Others retain platform defaults.

Response: `200 OK` — Updated `ScoringConfigResource`.

Side effect: Dispatches `RecalculateTenantLeadScoresJob` asynchronously.

Capability: `crm.settings.manage`. Audit-logged.

---

**`PUT /api/tenant/crm-settings/temperature-thresholds`**

Request:
```json
{
    "hot": 75,
    "warm": 45
}
```

Validation: `hot > warm`, both 1–100.

Response: `200 OK` — Updated `ScoringConfigResource`.

Side effect: Dispatches `RecalculateTenantLeadScoresJob` asynchronously (temperatures may change even if scores don't).

Capability: `crm.settings.manage`. Audit-logged.

---

### 8.3 Extended Lead List Endpoint

The existing `GET /api/tenant/leads` endpoint is extended:

**New query parameters:**

| Parameter | Type | Description |
|---|---|---|
| `sort_by` | string | Add `score` as a valid sort option (descending by default). Existing sort options remain. |
| `filter[temperature]` | string (comma-separated) | Filter by temperature: `hot`, `warm`, `cold`, or combinations like `hot,warm`. |

**Example:** `GET /api/tenant/leads?sort_by=score&filter[temperature]=hot,warm&page=1&per_page=20`

### 8.4 Extended Lead Resources

**`LeadResource`** (Kanban card) — Add fields:

```json
{
    "id": 42,
    "name": "John Doe",
    "stage": "interested",
    "...existing fields...",
    "score": 81,
    "temperature": "hot"
}
```

**`LeadDetailResource`** (Lead detail page) — Add fields:

```json
{
    "id": 42,
    "...existing fields...",
    "score": 81,
    "temperature": "hot",
    "score_breakdown": {
        "source": { "sub_score": 90, "weight": 0.15 },
        "stage": { "sub_score": 50, "weight": 0.30 },
        "engagement": { "sub_score": 100, "weight": 0.25 },
        "visits": { "sub_score": 80, "weight": 0.10 },
        "recency": { "sub_score": 95, "weight": 0.20 }
    }
}
```

---

## 9. Frontend Requirements

### 9.1 Kanban Board — Score Badge

Each lead card on the Kanban board displays a small badge showing the temperature:
- **Hot**: Red/orange badge with flame icon or "Hot" label
- **Warm**: Yellow/amber badge with "Warm" label
- **Cold**: Blue/gray badge with "Cold" label

The numeric score is NOT shown on the Kanban card — only the temperature badge. The numeric score is visible on hover tooltip or on the lead detail page.

### 9.2 Lead Detail Page — Score Section

The lead detail page includes a "Lead Score" section showing:
- The numeric score (e.g., "81 / 100") with temperature badge
- A breakdown bar or simple list showing each signal's contribution
- Last computed timestamp

### 9.3 CRM Settings — Scoring Configuration

Under CRM Settings (introduced in 15C-I), add a "Lead Scoring" section:
- Weight sliders or number inputs for 5 signal categories (must sum to 1.0, show real-time sum validation)
- Source score table: list of sources with editable score values
- Temperature threshold inputs (Hot ≥ X, Warm ≥ Y)
- "Reset to Defaults" button that restores platform defaults
- Note: "Changes trigger a background recalculation of all lead scores"

---

## 10. Security Boundaries

### 10.1 Tenant Isolation

- Lead scores are derived from tenant-scoped data (activities, leads). No cross-tenant data is ever accessed.
- The `LeadScoringFormula` service is stateless and receives all data as arguments — it has no database access and cannot leak data.
- Scoring configuration (weights, source scores, thresholds) is stored in the tenant settings system which is tenant-isolated by design.

### 10.2 Authorization

- Score breakdown is visible to anyone with `lead.view` capability (same as viewing lead details).
- Scoring configuration is managed by `crm.settings.manage` capability (admin-only).
- There is no separate "scoring" capability — it follows the existing lead/CRM capability hierarchy.

### 10.3 Data Integrity

- Scores are derived data, not source of truth. If scores become corrupted, running `crm:recalculate-lead-scores` regenerates them from source data.
- The formula is deterministic — same inputs always produce the same output. No randomness, no external dependencies.
- Weight validation (sum = 1.0) is enforced at both the request validation layer and the `ScoringWeights` value object construction.

---

## 11. Implementation Plan Requirements

The developer's Implementation Plan must include the following sections:

| # | Section | Content |
|---|---|---|
| 1 | Executive Summary | What gets built, what does NOT |
| 2 | Dependency Verification | Verify 15C-I is complete: `lead_activities` table exists, `LeadActivityCreated` event fires, `leads.last_activity_at` is populated, `TenantCrmSettingsService` exists. Verify existing `LeadSource` values match the source score map. Verify the visit count column name and update mechanism. |
| 3 | Architecture Decisions | Any deviations from this spec, with justification |
| 4 | Migration Plan | New columns on `leads` table. Exact SQL. |
| 5 | Domain Layer | Value objects, events, service interface — with full class definitions |
| 6 | Application Layer | UseCases, queries, listeners, console command — with method signatures |
| 7 | Infrastructure Layer | Formula implementation, queued job — with full computation logic |
| 8 | HTTP Layer | Controllers, FormRequests, Resources, route definitions |
| 9 | CRM Settings Extension | New keys, resolver methods, default config |
| 10 | Event Wiring | Listener registration for incremental recalculation |
| 11 | Nightly Command | Full chunked processing logic with batch optimization |
| 12 | Frontend Specification | Kanban badge, lead detail score section, CRM settings scoring UI |
| 13 | Implementation Sequence | Ordered steps with dependencies and day estimates |
| 14 | Test Plan | Every test file with description |
| 15 | Quality Gate Verification | Checklist from §12 |
| 16 | File Manifest | Every new and modified file |

---

## 12. Quality Gates (Must Pass Before Phase 15C-III)

### 12.1 Scoring Accuracy Gates

- [ ] Score computation matches the documented formula for all 3 example calculations in §6.4
- [ ] Source sub-score uses tenant override when configured, platform default otherwise
- [ ] Stage sub-score maps correctly for all 6 pipeline stages
- [ ] Engagement sub-score formula produces correct values for: 0 activities, 1 activity, 10+ activities
- [ ] Visits sub-score caps at 100 for 5+ visits
- [ ] Recency sub-score decays correctly: 0 days = 100, 10 days = 50, 20+ days = 0
- [ ] Rejected leads always score 0 regardless of other signals
- [ ] Admission Confirmed leads always score 100 regardless of other signals
- [ ] Temperature classification matches thresholds: score 70+ = Hot, 40-69 = Warm, 0-39 = Cold (default thresholds)
- [ ] Weights summing to != 1.0 are rejected by the API

### 12.2 Recalculation Gates

- [ ] Score recalculates when a new activity is logged on a lead (event-driven)
- [ ] Score recalculates when a lead's stage changes (event-driven)
- [ ] `LeadScoreRecalculated` event dispatches ONLY when score actually changes
- [ ] `LeadScoreRecalculated` event contains old_score, new_score, old_temperature, new_temperature
- [ ] Nightly command processes all non-terminal leads across all tenants
- [ ] Nightly command uses chunked processing (no single query loading all leads)
- [ ] Nightly command correctly applies recency decay (lead untouched for 20 days scores 0 on recency)
- [ ] Recalculation is idempotent: running twice produces the same result
- [ ] Weight/source/threshold change triggers async full recalculation via queued job

### 12.3 API Gates

- [ ] `GET /api/tenant/leads/{lead}/score-breakdown` returns correct breakdown with all 5 signals
- [ ] `GET /api/tenant/leads?sort_by=score` returns leads sorted by score descending
- [ ] `GET /api/tenant/leads?filter[temperature]=hot` returns only Hot leads
- [ ] `GET /api/tenant/crm-settings/scoring-config` returns merged config (tenant overrides + platform defaults)
- [ ] `PUT /api/tenant/crm-settings/scoring-weights` validates sum = 1.0 and rejects invalid input
- [ ] `PUT /api/tenant/crm-settings/source-scores` accepts partial updates
- [ ] `PUT /api/tenant/crm-settings/temperature-thresholds` validates hot > warm

### 12.4 Security Gates

- [ ] Tenant isolation: Tenant A's scoring data never leaks to Tenant B
- [ ] Score breakdown endpoint respects `lead.view` capability
- [ ] Scoring config endpoints respect `crm.settings.manage` capability
- [ ] All CRM settings changes are audit-logged with old and new values

### 12.5 Frontend Gates

- [ ] Kanban cards show temperature badge (Hot/Warm/Cold with appropriate color)
- [ ] Lead detail page shows numeric score + temperature + breakdown
- [ ] CRM Settings page shows scoring configuration with editable weights, source scores, and thresholds
- [ ] Weight inputs enforce sum = 1.0 with real-time validation feedback

### 12.6 Regression Gates

- [ ] All existing lead management tests pass (0 regressions)
- [ ] All Phase 15C-I tests pass (activities, follow-ups, escalation)
- [ ] Stale lead detection continues to work
- [ ] Kanban drag-and-drop unaffected
- [ ] PHPStan Level 5 passes with 0 new errors

---

## 13. Constraints & Reminders

### Architecture Constraints

- **The `LeadScoringFormula` is a pure computation service.** It receives all data as arguments and returns a result. It does NOT query the database. It does NOT dispatch events. The calling use case is responsible for data loading and event dispatch. This makes the formula unit-testable without any database.
- **Score is derived data, not authoritative data.** If scores are ever inconsistent, the nightly recalculation regenerates them. No business logic should depend on score values being perfectly real-time — they are best-effort with eventual consistency via the nightly pass.
- **`LeadScoreRecalculated` event dispatches conditionally.** Only when old_score ≠ new_score. During nightly recalculation of 500 leads where 480 haven't changed, only 20 events fire. This is critical for Phase 15C-III — a workflow rule on "score crosses Hot threshold" should not fire 480 times.
- **Weight validation is enforced at two layers.** The `UpdateScoringWeightsRequest` (HTTP layer) validates sum = 1.0. The `ScoringWeights` value object (domain layer) also validates on construction. Belt and suspenders — invalid weights must never reach the formula.
- **Audit logs OUTSIDE transactions.** Same constraint as all previous phases.

### Docker Environment

- Container: Alpine Linux — use `sh` not `bash`
- Container name: `ubotz_backend`
- Queue: Redis DB 3

### What NOT to Do

- Do NOT store score history. Only the current score is persisted on the `leads` table. Score trend tracking is a future feature.
- Do NOT add ML or predictive scoring. The formula is deterministic and configurable — no black-box models.
- Do NOT make the formula structure tenant-configurable. Tenants adjust weights and source scores, not the formula itself (source × weight + stage × weight + ...).
- Do NOT send notifications from the scoring engine. Scoring computes and stores — it dispatches `LeadScoreRecalculated` events. Phase 15C-III's automation rules will decide what to do with score changes.
- Do NOT query the database from inside `LeadScoringFormula`. All data must be passed in as arguments. This is a hard DDD boundary.
- Do NOT show the numeric score on Kanban cards. Only the temperature badge (Hot/Warm/Cold) is visible on cards. Numeric score is on the detail page and tooltip.
- Do NOT load all leads into memory for nightly recalculation. Chunk in batches of 100. A tenant with 10,000 leads must not OOM the queue worker.
- Do NOT recalculate terminal leads (Rejected, Admission Confirmed) during nightly runs. Their scores are fixed by business rule.

---

## 14. Definition of Done

Phase 15C-II is complete when:

1. The implementation plan has been reviewed and approved by the Principal Engineer.
2. All code is implemented per the approved plan.
3. All quality gates in §12 pass.
4. A Principal Engineer audit confirms zero critical or high findings.
5. All findings from audit are resolved.
6. End-to-end demonstration:
   a. A new lead with source `referral` is created → score computes to a non-zero value → Kanban card shows temperature badge.
   b. Counselor logs 3 Call activities → score increases → temperature may change from Cold to Warm.
   c. Lead stage changes to `interested` → score increases → Kanban badge updates.
   d. 20 days pass (simulated) → nightly recalculation runs → recency signal drops → score decreases.
   e. Lead is rejected → score forced to 0 → badge shows Cold.
   f. Tenant admin changes weights → background job recalculates all leads → scores reflect new weights.
7. Score breakdown endpoint returns correct sub-scores matching the formula.
8. Zero regression in existing test suite (including all 15C-I tests).
9. PHPStan Level 5 passes with 0 new errors.
10. The Phase 15C-II Completion Report is signed off.

---

*End of Document — UBOTZ 2.0 Phase 15C-II Developer Instructions — March 25, 2026*
