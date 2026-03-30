# UBOTZ 2.0 — Phase 18E Developer Instructions

## Quiz Feature Series — Student Quiz-Taking UI & Experience

| Field | Value |
|---|---|
| **Document Type** | Developer Instruction (Pre-Implementation Brief) |
| **Phase** | 18E |
| **Series** | Quiz Feature Series (18A → 18B → 18C → 18D → 18E) |
| **Date** | 2026-03-21 |
| **Issued By** | Principal Engineer / Architecture Auditor |
| **Audience** | Antigravity Implementation Team |
| **Expected Deliverable** | Phase 18E Implementation Plan |
| **Prerequisites** | Phase 18A CERTIFIED, Phase 18B CERTIFIED, Phase 18C CERTIFIED, Phase 18D CERTIFIED — all four must be complete |

> **This is the only phase in the 18 series that students will actually see. Every previous phase built infrastructure that students will never interact with directly. Phase 18E is where all of that work becomes visible: the quiz attempt interface, the timer, section navigation, the result screen, the leaderboard. This phase is also the first to require significant frontend engineering — it is the most user-experience-intensive phase in the quiz series. Build it as if it is a product exam. Because it is.**

---

## 1. Mission Statement

Phase 18E builds the **student-facing quiz experience** in full. It covers three user surfaces:

**Surface 1 — Quiz Discovery**
Students browse available quizzes they have access to: quizzes embedded in their enrolled courses, standalone quizzes they are enrolled in, and quizzes accessible via their subscription. A unified quiz catalog with access-level awareness.

**Surface 2 — Quiz Attempt Interface (CBT Mode)**
The core exam-taking UI. A focused, distraction-free interface supporting: sectioned navigation, per-question timer, mark-for-review, question palette, image rendering in questions and options, all eight question type renderers, and graceful auto-submit on time expiry.

**Surface 3 — Results & Performance**
Post-submission result screen: score, pass/fail, per-question breakdown, correct answers (if configured to show), explanation per question, rank and percentile on the leaderboard, and a waiting state for partially-graded results pending manual grading.

This phase also implements **random question selection from bank per section** — the feature deferred from 18B, which requires 18C's section entities to be in place. When a quiz section is configured for random selection, questions are drawn dynamically from the question bank at attempt start time rather than from a fixed `quiz_questions` list.

---

## 2. Prerequisites Verified

This phase depends on the following being complete and certified:

| Phase | What This Phase Uses |
|---|---|
| **18A** | `quiz_result_responses` table, `quiz_attempt_snapshots`, question types (fill-in-blank, match, numerical), `QuizResultStatus.PARTIALLY_GRADED` |
| **18B** | `question_bank` table, `QuestionBankEntity`, bank question browsing — required for random question selection |
| **18C** | `quiz_sections` table, independent section config, `CompleteGradingUseCase`, manual grading completion events |
| **18D** | `QuizAccessServiceInterface`, `CheckQuizAccessUseCase`, quiz enrollment, `QuizStatus.CLOSED`, access window |

---

## 3. What This Phase Includes

**Backend (new API endpoints only — all domain work done in 18A-18D):**
- `GET /api/student/quizzes` — accessible quiz catalog for current student
- `GET /api/student/quizzes/{quizId}` — quiz detail with access verification
- `POST /api/student/quizzes/{quizId}/start` — start attempt (wraps existing `StartQuizAttemptUseCase`)
- `GET /api/student/quizzes/{quizId}/attempt/{resultId}` — load in-progress attempt with snapshot data
- `POST /api/student/quizzes/{quizId}/attempt/{resultId}/submit` — submit answers (wraps `SubmitQuizAnswersUseCase`)
- `GET /api/student/quizzes/{quizId}/result/{resultId}` — get result with per-question breakdown
- `GET /api/student/quizzes/{quizId}/leaderboard` — top scorers for this quiz

**Backend (new feature — random question selection per section):**
- `RandomSectionQuestionSelector` service
- Updated `StartQuizAttemptUseCase` to support random selection mode

**Frontend (primary deliverable):**
- Quiz catalog page (student-facing)
- Quiz detail / pre-attempt page
- Quiz attempt interface (CBT mode)
- Timer component (quiz-level and section-level)
- Question palette component
- All eight question type renderers
- Mark-for-review system
- Auto-submit on time expiry
- Submission confirmation modal
- Result screen with per-question breakdown
- Leaderboard component
- Waiting-for-grading state
- Mobile-responsive layout for all surfaces

## 3.1 What This Phase Does NOT Include

- Admin quiz builder UI (already exists from Phase 10E)
- Admin question bank browser UI (Phase 18B was backend-only — the admin UI for the question bank is a separate future phase)
- Admin grading queue UI (Phase 18C was backend-only for grading — admin grading UI is a separate future phase)
- Video playback within quiz questions (media in questions is image-only per Phase 18A; video deferred)
- Offline mode / PWA (deferred — platform-wide decision)
- Push notifications for grading completion (deferred)

---

## 4. Architecture Decisions

### AD-18E-001: Quiz Attempt Interface Is a Client Component Island, Not a Server Component

The quiz attempt interface requires: real-time timer state, answer draft saving, question navigation, network submission. This cannot be a React Server Component. The attempt interface is a fully client-side component tree rendered inside a server-side layout shell.

The page component (`app/(student)/[slug]/quizzes/[quizId]/attempt/[resultId]/page.tsx`) is a thin RSC that:
1. Verifies student auth (server-side)
2. Loads the attempt snapshot data (server-side fetch — one request)
3. Renders the `<QuizAttemptInterface>` client component with the snapshot as initial props

All subsequent state (current question index, timer countdown, draft answers, mark-for-review flags) lives in client state. No further server fetches until submission.

### AD-18E-002: Answer Drafts Are Saved to `localStorage` with Attempt ID as Key

Network failures happen. Students lose attempts. Answer drafts must be saved locally so a page refresh does not lose all work.

```typescript
const DRAFT_KEY = (resultId: number) => `quiz_draft_${resultId}`;

// Save on every answer change (debounced 500ms)
localStorage.setItem(DRAFT_KEY(resultId), JSON.stringify(drafts));

// On mount: restore drafts from localStorage if attempt is in-progress
const savedDrafts = localStorage.getItem(DRAFT_KEY(resultId));
if (savedDrafts) {
    setDrafts(JSON.parse(savedDrafts));
}

// On successful submission: clear draft
localStorage.removeItem(DRAFT_KEY(resultId));
```

**Security note:** `localStorage` is used here for draft persistence only — not for auth or access control. The backend is the authority on whether the submission is valid.

### AD-18E-003: Timer Is Client-Side Only, Server Validates at Submission

The countdown timer runs in the browser. The server does NOT stream time updates to the client. This is correct for an honour-system proctoring approach (D-6).

When the student submits, the server calculates `time_taken_seconds` from `quiz_results.started_at` to `now()`. If the student manually submits after the timer expires, the server still accepts it (honour system). The timer expiry triggers auto-submit on the frontend — a best-effort mechanism, not a security boundary.

**Section-level timers** are independent countdowns per section, drawn from `quiz_attempt_snapshots.question_version.section.resolved_time_minutes`. When a section timer expires, the student is automatically advanced to the next section (remaining answers in the expired section are preserved as-is).

### AD-18E-004: Random Question Selection Happens at Attempt Start, Not at Quiz Creation

When a quiz section is configured for random selection (a new `is_random: bool` and `question_count: int` field on `quiz_sections` added in this phase), the `StartQuizAttemptUseCase` draws questions from the bank at attempt start time rather than from `quiz_questions`.

This means two students starting the same quiz at the same time may get different questions. The snapshot system (18A) handles this correctly — each attempt's snapshot is independent.

**Random selection query:** Draw `question_count` questions from `question_bank` WHERE `tenant_id = ?` AND `exam_id` matches section's hierarchy AND `status = published` AND `difficulty` matches section config (if configured) — ORDER BY RAND() LIMIT `question_count`.

The drawn questions are immediately snapshotted into `quiz_attempt_snapshots` — the randomisation is frozen at attempt start.

### AD-18E-005: Result Screen Has Three States

```
GRADED → Show full result (score, pass/fail, per-question breakdown)
PARTIALLY_GRADED → Show partial result (auto-graded score shown, manual-graded questions shown as "Pending review")
SUBMITTED → Show "Under review — your result will be available shortly"
```

The result page polls the backend every 30 seconds when in SUBMITTED or PARTIALLY_GRADED state until it transitions to GRADED. Polling stops on GRADED or on page unload.

### AD-18E-006: Leaderboard Anonymity

The leaderboard shows rank, score, and time taken. Student names are shown by default. If a student's profile `is_public = false`, they appear as "Anonymous Student" on the leaderboard — consistent with the existing student settings (product handbook §2.2).

### AD-18E-007: Student Quiz Portal Routes Are Separate from Tenant Admin Routes

Student quiz routes live in the Student portal (`app/(student)/[slug]/`) — not in the Tenant Admin dashboard. The Student portal already exists (established Phase 10E). Quiz routes are added to it:

```
app/(student)/[slug]/
├── quizzes/
│   ├── page.tsx                    ← Quiz catalog
│   ├── [quizId]/
│   │   ├── page.tsx                ← Quiz detail / pre-attempt
│   │   ├── attempt/
│   │   │   └── [resultId]/
│   │   │       └── page.tsx        ← Quiz attempt interface
│   │   └── result/
│   │       └── [resultId]/
│   │           └── page.tsx        ← Result screen
```

---

## 5. Backend — New API Endpoints

### 5.1 Student Quiz Controller

**New file:** `app/Http/Controllers/Api/TenantAdminDashboard/Quiz/StudentQuizController.php`

All routes under student auth guard (`tenant_api`). No capability codes required — these are student-facing endpoints, not admin endpoints. Access is controlled by `CheckQuizAccessUseCase`.

| Method | URI | Method | Purpose |
|---|---|---|---|
| `GET` | `/api/student/quizzes` | `catalog` | List accessible quizzes for current student |
| `GET` | `/api/student/quizzes/{quizId}` | `show` | Quiz detail + access verification |
| `POST` | `/api/student/quizzes/{quizId}/start` | `start` | Start a new attempt |
| `GET` | `/api/student/quizzes/{quizId}/attempt/{resultId}` | `attempt` | Load in-progress attempt |
| `POST` | `/api/student/quizzes/{quizId}/attempt/{resultId}/submit` | `submit` | Submit answers |
| `GET` | `/api/student/quizzes/{quizId}/result/{resultId}` | `result` | Get result |
| `GET` | `/api/student/quizzes/{quizId}/leaderboard` | `leaderboard` | Top scorers |

### 5.2 Student Quiz Catalog API Response Shape

```json
{
  "data": [
    {
      "id": 42,
      "title": "JEE Mock Test 3 — Full Paper",
      "quiz_type": "mock_test",
      "duration_minutes": 180,
      "total_questions": 90,
      "total_marks": 360,
      "pass_mark": 120,
      "max_attempts": 1,
      "access_source": "subscription",
      "status": "active",
      "access_window": {
        "starts_at": null,
        "ends_at": null
      },
      "my_attempts": {
        "count": 0,
        "best_score": null,
        "last_attempt_status": null
      }
    }
  ],
  "meta": { "total": 12, "page": 1, "per_page": 20 }
}
```

`access_source` is derived from `QuizAccessPath.reason` — tells the student why they have access.
`my_attempts` is a lightweight aggregate from `quiz_results` for this student.

### 5.3 Attempt Load Response Shape

```json
{
  "data": {
    "result_id": 101,
    "quiz_id": 42,
    "started_at": "2026-03-21T10:00:00Z",
    "time_limit_seconds": 10800,
    "elapsed_seconds": 342,
    "sections": [
      {
        "id": 7,
        "key": "physics",
        "title": "Section A: Physics",
        "time_limit_seconds": 3600,
        "question_ids": [1, 2, 3, ...]
      }
    ],
    "questions": [
      {
        "id": 1,
        "section_key": "physics",
        "type": "multiple",
        "title": "What is kinetic energy?",
        "image_url": null,
        "grade": 4.0,
        "options": [
          { "id": 10, "title": "½mv²", "image_url": null },
          { "id": 11, "title": "mv²", "image_url": null },
          { "id": 12, "title": "2mv", "image_url": null },
          { "id": 13, "title": "m²v", "image_url": null }
        ]
      }
    ]
  }
}
```

**Critical:** The `questions` array is sourced from `quiz_attempt_snapshots` — not from live `quiz_questions`. This is the snapshot frozen at attempt start (18A). `is_correct` flags on options are NOT included in the response — students cannot see correct answers during an attempt.

### 5.4 New Backend Feature: `RandomSectionQuestionSelector`

**File:** `app/Application/TenantAdminDashboard/Quiz/Services/RandomSectionQuestionSelector.php`

Called by `StartQuizAttemptUseCase` when `quiz_sections.is_random = true`.

```php
final class RandomSectionQuestionSelector
{
    public function __construct(
        private readonly QuestionBankRepositoryInterface $bankRepository,
    ) {}

    public function selectForSection(
        int    $tenantId,
        int    $quizSectionId,
        int    $questionCount,
        ?int   $examId,
        ?int   $subjectId,
        ?int   $chapterId,
        ?int   $topicId,
        ?string $difficulty,
    ): array  // returns array of QuestionBankEntity
    {
        return $this->bankRepository->selectRandom(
            tenantId:      $tenantId,
            count:         $questionCount,
            examId:        $examId,
            subjectId:     $subjectId,
            chapterId:     $chapterId,
            topicId:       $topicId,
            difficulty:    $difficulty,
            status:        QuestionBankStatus::PUBLISHED,
        );
    }
}
```

`QuestionBankRepositoryInterface` gains a new `selectRandom()` method. The Eloquent implementation uses `orderByRaw('RAND()') LIMIT ?`.

### 5.5 Schema Change: `quiz_sections` Gets Random Selection Columns

**Migration:** `2026_03_21_180E_000001_add_random_selection_to_quiz_sections.php`

```php
Schema::table('quiz_sections', function (Blueprint $table) {
    $table->boolean('is_random')->default(false)->after('default_mark');
    $table->unsignedSmallInteger('random_question_count')->nullable()->after('is_random');
    // Null = use all questions in section (non-random mode)
    // Set = number of questions to draw randomly from bank
});
```

### 5.6 `StartQuizAttemptUseCase` — Random Selection Integration

If any section has `is_random = true`:

```
For each random section:
1. Call RandomSectionQuestionSelector::selectForSection(...)
2. Convert bank questions to snapshot format
3. Add to snapshots array

For non-random sections:
4. Load questions from quiz_questions as before (18A behaviour)

Merge all snapshots and persist together in same transaction
```

---

## 6. Frontend — Feature Structure

### 6.1 Directory Structure

```
features/student/quizzes/
├── api/
│   ├── use-quiz-catalog.ts          ← List accessible quizzes
│   ├── use-quiz-detail.ts           ← Single quiz detail
│   ├── use-quiz-attempt.ts          ← Load/start/submit attempt
│   ├── use-quiz-result.ts           ← Result + polling
│   └── use-quiz-leaderboard.ts      ← Leaderboard
├── model/
│   ├── quiz-types.ts                ← Zod schemas for all response shapes
│   ├── attempt-types.ts             ← Attempt state types
│   └── result-types.ts              ← Result + leaderboard types
├── ui/
│   ├── catalog/
│   │   ├── quiz-catalog-list.tsx    ← Grid of quiz cards
│   │   └── quiz-catalog-card.tsx    ← Individual quiz card
│   ├── detail/
│   │   └── quiz-detail-view.tsx     ← Pre-attempt info + start button
│   ├── attempt/
│   │   ├── quiz-attempt-interface.tsx   ← Main attempt shell
│   │   ├── quiz-timer.tsx               ← Countdown timer
│   │   ├── quiz-question-palette.tsx    ← Question number grid
│   │   ├── quiz-section-nav.tsx         ← Section tabs
│   │   ├── quiz-question-renderer.tsx   ← Dispatcher to type renderers
│   │   ├── renderers/
│   │   │   ├── mcq-renderer.tsx         ← Multiple choice
│   │   │   ├── descriptive-renderer.tsx ← Short/long answer
│   │   │   ├── fill-blank-renderer.tsx  ← Fill in the blank
│   │   │   ├── match-renderer.tsx       ← Match the following
│   │   │   └── numerical-renderer.tsx   ← Numerical answer
│   │   ├── quiz-submit-modal.tsx        ← Confirmation before submit
│   │   └── quiz-autosave-indicator.tsx  ← Draft save status
│   └── result/
│       ├── quiz-result-screen.tsx       ← Main result container
│       ├── quiz-score-summary.tsx       ← Score, pass/fail, rank
│       ├── quiz-response-breakdown.tsx  ← Per-question review
│       ├── quiz-leaderboard.tsx         ← Top scorers
│       └── quiz-pending-grading.tsx     ← Waiting state
└── index.ts
```

### 6.2 Type Definitions

**File:** `features/student/quizzes/model/attempt-types.ts`

```typescript
// Question types from Phase 18A
export type QuestionType =
  | 'multiple'
  | 'descriptive'
  | 'fill_in_blank'
  | 'numerical'
  | 'match_following';

// Student's draft answer — varies by question type
export type DraftAnswer =
  | { type: 'multiple';      selectedOptionIds: number[] }
  | { type: 'descriptive';   text: string }
  | { type: 'fill_in_blank'; text: string }
  | { type: 'numerical';     value: string }
  | { type: 'match_following'; pairs: { leftId: number; rightId: number }[] };

// Question as loaded from snapshot (no correct answer flags)
export interface AttemptQuestion {
  id:          number;
  sectionKey:  string | null;
  type:        QuestionType;
  title:       string;
  imageUrl:    string | null;
  grade:       number;
  options?:    { id: number; title: string; imageUrl: string | null }[];
  pairs?:      { id: number; leftText: string; leftImageUrl: string | null; rightText: string; rightImageUrl: string | null }[];
  // fill_in_blank: student types text; no options shown
  // numerical: student types number; no options shown
}

// Full attempt state — lives in client state only
export interface AttemptState {
  resultId:          number;
  quizId:            number;
  startedAt:         string;
  timeLimitSeconds:  number | null;
  elapsedSeconds:    number;
  currentQuestionIndex: number;
  currentSectionKey: string | null;
  drafts:            Record<number, DraftAnswer>;  // questionId → draft
  markedForReview:   Set<number>;                  // questionId
  sections:          AttemptSection[];
  questions:         AttemptQuestion[];
  isSubmitting:      boolean;
  autoSaveStatus:    'idle' | 'saving' | 'saved' | 'error';
}
```

### 6.3 Quiz Attempt Interface — Component Architecture

**`quiz-attempt-interface.tsx`** is the root client component. It receives the initial attempt data as props (server-fetched) and manages all state.

Layout structure:
```
┌───────────────────────────────────────────────────────┐
│  [Quiz Title]          [Timer: 02:47:33]  [Submit]    │  ← TopBar
├─────────────────┬─────────────────────────────────────┤
│                 │  Section A  Section B  Section C     │  ← SectionNav
│  Question       │  ─────────────────────────────────  │
│  Palette        │                                     │
│                 │  Q12. What is kinetic energy?        │
│  [1][2][3]...   │  [Image if present]                  │
│  ■ Answered     │                                     │
│  □ Not answered │  ○ ½mv²                             │
│  ◈ Marked       │  ○ mv²                              │
│                 │  ○ 2mv                              │
│                 │  ○ m²v                              │
│                 │                                     │
│                 │  [Mark for Review]  [← Prev] [Next →]│
└─────────────────┴─────────────────────────────────────┘
```

**State management pattern:** Use `useReducer` with an `AttemptAction` discriminated union. Do NOT use multiple `useState` calls for attempt state — they will go out of sync. The reducer handles all state transitions atomically.

```typescript
type AttemptAction =
  | { type: 'SET_ANSWER';        questionId: number; answer: DraftAnswer }
  | { type: 'TOGGLE_REVIEW';     questionId: number }
  | { type: 'NAVIGATE';          questionIndex: number }
  | { type: 'NAVIGATE_SECTION';  sectionKey: string }
  | { type: 'TICK';              elapsedSeconds: number }
  | { type: 'SET_SUBMITTING';    value: boolean }
  | { type: 'SET_AUTOSAVE';      status: 'idle' | 'saving' | 'saved' | 'error' };
```

### 6.4 Timer Component

**File:** `features/student/quizzes/ui/attempt/quiz-timer.tsx`

```typescript
'use client';

interface QuizTimerProps {
  limitSeconds:    number;
  elapsedSeconds:  number;
  onExpiry:        () => void;
  label?:          string;    // e.g. "Section A" for section timers
}

export function QuizTimer({ limitSeconds, elapsedSeconds, onExpiry, label }: QuizTimerProps) {
  const remaining = limitSeconds - elapsedSeconds;

  useEffect(() => {
    const interval = setInterval(() => {
      // Dispatch TICK action to parent reducer
      // When remaining hits 0: call onExpiry
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const isUrgent = remaining <= 300; // last 5 minutes = red

  return (
    <div className={`font-mono text-lg font-bold ${isUrgent ? 'text-[var(--color-danger)]' : ''}`}>
      {label && <span className="text-xs text-[var(--color-text-secondary)] mr-2">{label}</span>}
      {formatTime(remaining)}
    </div>
  );
}
```

When section timer expires: advance to next section (preserve answers in expired section).
When quiz-level timer expires: trigger auto-submit flow.

**Auto-submit on expiry:**
```typescript
const handleTimerExpiry = useCallback(() => {
  // Show 10-second countdown: "Time's up! Submitting in 10s..."
  // After 10 seconds: call submitAttempt()
  // If already submitting: no-op
}, [submitAttempt]);
```

### 6.5 Question Type Renderers

Each renderer is a pure presentational component. It receives the question and current draft answer, and emits an `onAnswer` callback.

**MCQ Renderer (`mcq-renderer.tsx`):**
- Single select: radio button group
- Multi-select: checkbox group (determined by whether quiz has `partial_marks` configured — if multiple options can be correct, show checkboxes)
- True/False: special case of MCQ with exactly 2 options — render as button pair, not radio group

```typescript
interface McqRendererProps {
  question:       AttemptQuestion;
  draft:          DraftAnswer | undefined;
  onAnswer:       (answer: DraftAnswer) => void;
  isMultiSelect?: boolean;
}
```

**Descriptive Renderer (`descriptive-renderer.tsx`):**
- `<Textarea>` with character count
- Short answer: max 500 chars
- Essay: max 5000 chars (determine from quiz config or default by type)
- Autogrow height

**Fill in Blank Renderer (`fill-blank-renderer.tsx`):**
- Single text input, no hints about accepted answers
- Do NOT show accepted answers — that is a post-submission result screen concern

**Numerical Renderer (`numerical-renderer.tsx`):**
- Number input, allows decimals
- Pattern validation: `^\-?\d+(\.\d+)?$`
- Do NOT show correct value

**Match Following Renderer (`match-renderer.tsx`):**
- Left column: stems (fixed position)
- Right column: matches (draggable / selectable)
- For each left item: a dropdown or drag target mapping to a right item
- Simple mode (1:1): each right item can only be used once
- Complex mode (1:many): right items can be reused
- Use `@dnd-kit/core` for drag-and-drop — already confirmed available

**Image rendering in questions and options:**
All renderers must handle `imageUrl` on both the question stem and individual options. Use `next/image` with `unoptimized` for external URLs (media URLs come from tenant's storage, not the Next.js origin):

```typescript
{question.imageUrl && (
  <div className="mb-4 rounded-lg overflow-hidden">
    <img
      src={question.imageUrl}
      alt="Question image"
      className="max-w-full h-auto"
      loading="lazy"
    />
  </div>
)}
```

### 6.6 Question Palette

**File:** `features/student/quizzes/ui/attempt/quiz-question-palette.tsx`

A grid of question numbers. Each number has a visual state:

| State | Visual | Condition |
|---|---|---|
| Not visited | White/outlined | No draft set |
| Answered | Green filled | Draft is set and not empty |
| Marked for review | Orange/yellow | `markedForReview.has(questionId)` |
| Answered + marked | Green with dot | Both answered and marked |
| Current | Blue border | `currentQuestionIndex === index` |

On click: navigate to that question index.

Palette is collapsible on mobile — default collapsed, toggled via a palette icon button.

### 6.7 Submit Modal

**File:** `features/student/quizzes/ui/attempt/quiz-submit-modal.tsx`

Shows before final submission:

```
┌──────────────────────────────────────────┐
│ Ready to submit?                         │
│                                          │
│ Answered:       72 / 90                  │
│ Not answered:   18                       │
│ Marked for review: 5                     │
│                                          │
│ ⚠️  You have 18 unanswered questions.    │
│     Are you sure you want to submit?     │
│                                          │
│ [Cancel]                    [Submit Now] │
└──────────────────────────────────────────┘
```

The modal also shows remaining time so students can make an informed decision.

### 6.8 Result Screen

**File:** `features/student/quizzes/ui/result/quiz-result-screen.tsx`

Three states as per AD-18E-005:

**State: GRADED**
```
┌──────────────────────────────────────────┐
│ JEE Mock Test 3                          │
│                                          │
│  248 / 360                               │
│  ✅ PASSED  |  Rank #12 of 847 students  │
│  Better than 98.6% of students           │
│                                          │
│  [View Answers]  [Leaderboard]           │
└──────────────────────────────────────────┘
```

**Per-question breakdown (shown when "View Answers" expanded):**

| Question | Your Answer | Correct | Marks | Explanation |
|---|---|---|---|---|
| Q1. What is kinetic energy? | ½mv² | ½mv² ✅ | +4 | Kinetic energy is... |
| Q2. Essay: Explain... | [Your text] | Manual grade: 3/10 | +3 | — |
| Q3. Fill in blank | photosythesis | photosynthesis ❌ | -1 | Correct: photosynthesis |

**State: PARTIALLY_GRADED**
Show auto-graded questions as above. For pending questions show "Awaiting review" badge. Show partial score with "(+X pending review)" note.

**State: SUBMITTED (fully manual quiz)**
Show a calm waiting screen — no score yet:
```
Your answers have been submitted.
Your teacher will grade your responses shortly.
We'll notify you when your result is ready.
```

Poll every 30 seconds. On state change to PARTIALLY_GRADED or GRADED: reload result data without requiring page refresh.

### 6.9 Leaderboard Component

**File:** `features/student/quizzes/ui/result/quiz-leaderboard.tsx`

```
Rank  Student              Score   Time Taken
─────────────────────────────────────────────
🥇 1   Rahul Kumar          356/360  2h 14m
🥈 2   Priya Sharma         352/360  2h 31m
🥉 3   Anonymous Student    348/360  2h 18m
...
─────────────────────────────────────────────
#12  You (Arjun Singh)      248/360  1h 47m
```

Always show the current student's row with "You" label — even if they are not in the top displayed results. The current student row is always highlighted.

Private-profile students appear as "Anonymous Student" per AD-18E-006.

Pagination: show top 20 by default, "Show more" loads next 20.

### 6.10 Quiz Catalog Card

**File:** `features/student/quizzes/ui/catalog/quiz-catalog-card.tsx`

```typescript
interface QuizCatalogCardProps {
  quiz: {
    id:                 number;
    title:              string;
    quizType:           string;
    durationMinutes:    number;
    totalQuestions:     number;
    totalMarks:         number;
    accessSource:       string;
    myAttempts:         { count: number; bestScore: number | null };
  };
}
```

Card shows:
- Quiz type badge (Practice / Mock Test / etc.)
- Duration and question count
- Access source badge ("Subscription" / "Course" / "Assigned")
- Attempt history: "0 attempts" or "Best: 248/360"
- CTA: "Start Quiz" (if attempts remaining) or "Retake" or "View Result" (if max attempts reached)

---

## 7. Business Rules (Non-Negotiable)

| ID | Rule | Enforcement |
|---|---|---|
| BR-01 | Correct answer flags (`is_correct`) are NEVER sent to the client during an active attempt | `StudentQuizController@attempt` response strips `is_correct` from snapshot data |
| BR-02 | Answer drafts are saved to `localStorage` — cleared on successful submission | AD-18E-002 |
| BR-03 | Timer is client-side only — server uses `started_at` to calculate time taken | AD-18E-003 |
| BR-04 | Auto-submit on timer expiry is best-effort — server accepts late submissions from started attempts | Honour system per D-6 |
| BR-05 | Private-profile students appear as "Anonymous Student" on leaderboard | `quiz-leaderboard.tsx` checks `student.isPublic` flag from API |
| BR-06 | Result polling interval is 30 seconds — not shorter | Prevents server load from impatient students |
| BR-07 | Random question selection uses `RAND()` at attempt start — not re-randomised on page refresh | Snapshot system from 18A freezes selection at start |
| BR-08 | Match-following drag-and-drop uses `@dnd-kit/core` — no other DnD library | Consistency with platform drag patterns |
| BR-09 | All monetary values (marks) use `formatCents` — quiz grades are stored as `DECIMAL` not cents, but displayed with 1 decimal place | `formatGrade(grade: number): string` utility |
| BR-10 | Student cannot access attempt interface without a valid `result_id` from a legitimate `start` call | Server validates `result_id` belongs to student and quiz |
| BR-11 | Quiz attempt interface has no sidebar navigation — fullscreen focus mode | Layout constraint in attempt page |
| BR-12 | `localStorage` draft key includes `result_id` — not just `quiz_id` | Prevents draft collision across multiple attempts |

---

## 8. Test Plan

### 8.1 Backend Unit Tests

**File:** `tests/Unit/Application/TenantAdminDashboard/Quiz/Services/RandomSectionQuestionSelectorTest.php`

| Test | Description |
|---|---|
| `test_selects_correct_count_from_bank` | Returns exactly `question_count` questions |
| `test_filters_by_hierarchy` | Exam/subject/chapter/topic filters applied |
| `test_filters_by_difficulty` | Difficulty filter applied when set |
| `test_only_published_questions_selected` | Status filter enforced |

### 8.2 Backend Feature Tests

**File:** `tests/Feature/TenantAdminDashboard/Quiz/StudentQuizApiTest.php`

| Test | Description |
|---|---|
| `test_student_can_list_accessible_quizzes` | Catalog endpoint |
| `test_student_cannot_see_inaccessible_quizzes` | Access control |
| `test_start_attempt_creates_result` | StartQuizAttemptUseCase integration |
| `test_attempt_response_excludes_correct_answers` | BR-01 |
| `test_submit_answers_creates_responses` | SubmitQuizAnswersUseCase integration |
| `test_result_shows_graded_status` | Result endpoint |
| `test_leaderboard_anonymises_private_profiles` | BR-05 |

**File:** `tests/Feature/TenantAdminDashboard/Quiz/RandomQuizSelectionTest.php`

| Test | Description |
|---|---|
| `test_random_section_draws_from_bank` | End-to-end random selection |
| `test_two_attempts_can_have_different_questions` | Randomisation verified |
| `test_snapshot_freezes_random_selection` | 18A snapshot system |

### 8.3 Frontend Component Tests

**File:** `features/student/quizzes/ui/attempt/__tests__/quiz-timer.test.tsx`

| Test | Description |
|---|---|
| `test_displays_correct_remaining_time` | Time formatting |
| `test_shows_urgent_style_under_5_minutes` | Visual state |
| `test_calls_on_expiry_at_zero` | Callback fires |

**File:** `features/student/quizzes/ui/attempt/__tests__/quiz-question-palette.test.tsx`

| Test | Description |
|---|---|
| `test_renders_all_question_numbers` | Count check |
| `test_answered_questions_show_green` | Visual state |
| `test_marked_questions_show_orange` | Visual state |
| `test_click_navigates_to_question` | Callback fires |

**File:** `features/student/quizzes/ui/attempt/renderers/__tests__/mcq-renderer.test.tsx`

| Test | Description |
|---|---|
| `test_renders_options_without_correct_flags` | BR-01 frontend enforcement |
| `test_single_select_uses_radio` | Input type |
| `test_multi_select_uses_checkbox` | Input type |
| `test_selecting_option_calls_on_answer` | Callback |

### 8.4 Manual Test Checklist

**Quiz Catalog:**
- [ ] Student sees only quizzes they have access to
- [ ] Access source badge shows correctly (Subscription / Course / Assigned)
- [ ] Attempt count shown correctly

**Quiz Attempt:**
- [ ] Timer counts down correctly
- [ ] Section navigation switches visible questions
- [ ] Section timer is independent of quiz timer
- [ ] Answer palette shows correct states (answered/unanswered/marked)
- [ ] Mark for review toggles correctly
- [ ] MCQ single-select: selecting new option deselects previous
- [ ] MCQ multi-select: multiple options selectable
- [ ] True/False renders as button pair
- [ ] Fill-in-blank accepts text input
- [ ] Numerical accepts decimal numbers only
- [ ] Match-following: left items map to right items
- [ ] Image in question stem renders
- [ ] Image in MCQ options renders
- [ ] Draft saved to localStorage on answer change
- [ ] Page refresh restores draft answers
- [ ] Submit modal shows correct counts
- [ ] Submit modal shows remaining time
- [ ] Auto-submit fires 10 seconds after timer expiry
- [ ] Successful submission clears localStorage draft

**Result Screen:**
- [ ] GRADED: score, pass/fail, rank shown
- [ ] GRADED: per-question breakdown shows correct/incorrect
- [ ] GRADED: explanation shown per question (if configured)
- [ ] PARTIALLY_GRADED: partial score shown with pending note
- [ ] PARTIALLY_GRADED: pending questions show "Awaiting review"
- [ ] SUBMITTED: waiting screen shown
- [ ] Polling updates result screen when status changes
- [ ] Leaderboard shows top 20 with "Show more"
- [ ] Current student row always visible
- [ ] Private students show as "Anonymous Student"

**Mobile:**
- [ ] Timer visible on mobile (top bar)
- [ ] Question palette collapses on mobile
- [ ] Question content scrollable on small screens
- [ ] Touch targets ≥ 44px
- [ ] No horizontal scroll

### 8.5 Regression

```powershell
# Backend regression
docker exec -it ubotz_backend sh -c "cd /var/www && php artisan test --filter=Quiz 2>&1 | tail -5"

# Frontend build
cd frontend && npm run build
```

Both must pass with zero errors.

---

## 9. Quality Gate

| # | Check | How to Verify |
|---|---|---|
| 1 | `is_correct` flags absent from attempt API response | Feature test + manual check |
| 2 | `localStorage` draft uses `result_id` in key | Code review |
| 3 | Timer is client-side only — no server time sync | Code review |
| 4 | Auto-submit fires after expiry countdown | Manual test |
| 5 | All 8 question type renderers implemented | Code review |
| 6 | Images render in both question stems and options | Manual test |
| 7 | Match-following uses `@dnd-kit/core` | Code review |
| 8 | `useReducer` used for attempt state (not multiple `useState`) | Code review |
| 9 | Result screen polls every 30 seconds when not GRADED | Code review |
| 10 | Private students anonymous on leaderboard | Manual test |
| 11 | Random section draws from question bank | Feature test |
| 12 | Two attempts of same random quiz can have different questions | Feature test |
| 13 | `npm run build` passes zero TypeScript errors | Build output |
| 14 | Mobile layout tested at 375px — no horizontal scroll | Browser devtools |
| 15 | PHPStan level 5 on all new and modified backend files | PHPStan output |
| 16 | `php artisan test --filter=Quiz` zero failures, zero risky | Test output |
| 17 | All manual test checklist items pass | Manual test record |

---

## 10. File Manifest

### New Backend Files

| File | Purpose |
|---|---|
| `app/Application/TenantAdminDashboard/Quiz/Services/RandomSectionQuestionSelector.php` | Random question selection service |
| `app/Http/Controllers/Api/TenantAdminDashboard/Quiz/StudentQuizController.php` | Student-facing quiz API |
| `database/migrations/tenant/2026_03_21_180E_000001_add_random_selection_to_quiz_sections.php` | Schema extension |
| `tests/Unit/Application/TenantAdminDashboard/Quiz/Services/RandomSectionQuestionSelectorTest.php` | Unit test |
| `tests/Feature/TenantAdminDashboard/Quiz/StudentQuizApiTest.php` | Feature test |
| `tests/Feature/TenantAdminDashboard/Quiz/RandomQuizSelectionTest.php` | Feature test |

### Modified Backend Files

| File | Change |
|---|---|
| `app/Domain/TenantAdminDashboard/Quiz/Repositories/QuestionBankRepositoryInterface.php` | Add `selectRandom()` method |
| `app/Infrastructure/Persistence/TenantAdminDashboard/Quiz/EloquentQuestionBankRepository.php` | Implement `selectRandom()` with RAND() |
| `app/Application/TenantAdminDashboard/Quiz/UseCases/StartQuizAttemptUseCase.php` | Integrate random selection for random sections |
| `routes/tenant_dashboard/quiz.php` | Add student quiz routes (under student auth guard) |
| Service provider for quiz bindings | Add `RandomSectionQuestionSelector` binding |

### New Frontend Files

| File | Purpose |
|---|---|
| `features/student/quizzes/model/quiz-types.ts` | Zod schemas + inferred types |
| `features/student/quizzes/model/attempt-types.ts` | Attempt state types |
| `features/student/quizzes/model/result-types.ts` | Result + leaderboard types |
| `features/student/quizzes/api/use-quiz-catalog.ts` | Catalog hook |
| `features/student/quizzes/api/use-quiz-detail.ts` | Detail hook |
| `features/student/quizzes/api/use-quiz-attempt.ts` | Attempt hook |
| `features/student/quizzes/api/use-quiz-result.ts` | Result hook with polling |
| `features/student/quizzes/api/use-quiz-leaderboard.ts` | Leaderboard hook |
| `features/student/quizzes/ui/catalog/quiz-catalog-list.tsx` | Catalog grid |
| `features/student/quizzes/ui/catalog/quiz-catalog-card.tsx` | Quiz card |
| `features/student/quizzes/ui/detail/quiz-detail-view.tsx` | Pre-attempt screen |
| `features/student/quizzes/ui/attempt/quiz-attempt-interface.tsx` | Main attempt shell |
| `features/student/quizzes/ui/attempt/quiz-timer.tsx` | Timer component |
| `features/student/quizzes/ui/attempt/quiz-question-palette.tsx` | Question grid |
| `features/student/quizzes/ui/attempt/quiz-section-nav.tsx` | Section tabs |
| `features/student/quizzes/ui/attempt/quiz-question-renderer.tsx` | Type dispatcher |
| `features/student/quizzes/ui/attempt/renderers/mcq-renderer.tsx` | MCQ |
| `features/student/quizzes/ui/attempt/renderers/descriptive-renderer.tsx` | Short/essay |
| `features/student/quizzes/ui/attempt/renderers/fill-blank-renderer.tsx` | Fill-in-blank |
| `features/student/quizzes/ui/attempt/renderers/match-renderer.tsx` | Match-following |
| `features/student/quizzes/ui/attempt/renderers/numerical-renderer.tsx` | Numerical |
| `features/student/quizzes/ui/attempt/quiz-submit-modal.tsx` | Submit confirmation |
| `features/student/quizzes/ui/attempt/quiz-autosave-indicator.tsx` | Save status |
| `features/student/quizzes/ui/result/quiz-result-screen.tsx` | Result container |
| `features/student/quizzes/ui/result/quiz-score-summary.tsx` | Score display |
| `features/student/quizzes/ui/result/quiz-response-breakdown.tsx` | Per-question review |
| `features/student/quizzes/ui/result/quiz-leaderboard.tsx` | Leaderboard |
| `features/student/quizzes/ui/result/quiz-pending-grading.tsx` | Waiting state |
| `features/student/quizzes/index.ts` | Feature public API |
| `app/(student)/[slug]/quizzes/page.tsx` | Catalog page |
| `app/(student)/[slug]/quizzes/[quizId]/page.tsx` | Detail page |
| `app/(student)/[slug]/quizzes/[quizId]/attempt/[resultId]/page.tsx` | Attempt page |
| `app/(student)/[slug]/quizzes/[quizId]/result/[resultId]/page.tsx` | Result page |
| `app/(student)/[slug]/quizzes/[quizId]/attempt/[resultId]/loading.tsx` | Skeleton |
| `app/(student)/[slug]/quizzes/[quizId]/result/[resultId]/loading.tsx` | Skeleton |
| `features/student/quizzes/ui/attempt/__tests__/quiz-timer.test.tsx` | Component test |
| `features/student/quizzes/ui/attempt/__tests__/quiz-question-palette.test.tsx` | Component test |
| `features/student/quizzes/ui/attempt/renderers/__tests__/mcq-renderer.test.tsx` | Component test |

---

## 11. Phase 18 Series — Completion

Phase 18E is the final phase in the Quiz feature series. When 18E is certified:

- **18A** — Safety fixes, question types, snapshot system ✓
- **18B** — Question bank, reuse, import ✓
- **18C** — Sections, manual grading queue ✓
- **18D** — Standalone quiz, subscription entitlements ✓
- **18E** — Student UI, random selection ✓

The quiz feature is production-complete. Run the full series regression at 18E certification:

```powershell
# Full backend regression
docker exec -it ubotz_backend sh -c "cd /var/www && php artisan test 2>&1 | tail -5"

# Full PHPStan
docker exec -it ubotz_backend sh -c "cd /var/www && ./vendor/bin/phpstan analyse app/ --level=5 --memory-limit=2G 2>&1 | tail -20"

# Frontend build
cd frontend && npm run build
```

All three must pass before the 18 series is signed off.

---

*End of Phase 18E Developer Instructions*
*Issued by Principal Engineer — 2026-03-21*
*Next step: Antigravity to produce Phase 18E Implementation Plan for Principal Engineer audit before implementation begins.*
*Note: This is the final phase of the Quiz feature series. All five phases (18A–18E) must be certified before the quiz feature is considered production-ready.*
