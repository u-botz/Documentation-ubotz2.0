# UBOTZ 2.0 — Quiz — Business Findings

## Executive summary

Quizzes let a tenant deliver **practice**, **mock-test**, and **previous-year** style assessments with configurable access (course-only, standalone, or both), scoring (including negative marking where enabled), and optional **CBT-style** UX (palette, mark-for-review). Staff author content, monitor **results and analytics**, and work **manual grading** queues when questions are not fully auto-scored.

## Assessment shapes

- **Quiz types** — Modeled in data as `practice_quiz`, `mock_test`, or `pyq`, driving expectations for layout and rigor.
- **Sections** — Supported via dedicated section entities/migrations for multi-part exams; legacy JSON `sections` on `quizzes` may still exist for older rows.
- **Question bank** — Items can be pulled from the bank to avoid duplicating content across many quizzes.

## Access and monetization

- **Access level** — `course_only`, `standalone`, or `both` controls whether enrollment in a parent course is required or the quiz can be sold or listed independently (subject to product rules).
- **Free vs paid** — `is_free` distinguishes complimentary vs paid experiences where pricing is wired.

## Student journey

Students browse available quizzes, **start** an attempt, submit answers, view **results** (per product rules), and may see a **leaderboard** when enabled.

## Staff operations

- **Publish / close / archive** — Govern lifecycle without deleting historical attempts where soft-archive is used.
- **Analytics** — Summary, per-question breakdown, trends, and student insights support instructional decisions.
- **Grading** — Objective items grade automatically; subjective or complex items flow through grading actions and bulk tools.

---

## Linked references

- **Question bank** — authoring reuse
- **Course / enrollment** — access for `course_only` and enroll flows
