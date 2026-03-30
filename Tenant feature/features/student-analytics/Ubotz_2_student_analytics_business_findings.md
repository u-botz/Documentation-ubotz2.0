# UBOTZ 2.0 — Student Analytics — Business Findings

## Executive summary

**Student analytics** turns activity across assessments and related signals into **cohort and individual insight**: class or **batch** views, per-student history, and **topic-level** mastery. Administrators can tune **dimension weights** so the composite score reflects institutional priorities (for example balancing quizzes vs attendance where the product supports those dimensions).

## Who can see what

- **Configuration** of weights requires **`student_analytics.configure`**.
- **Viewing** dashboards for arbitrary students and batches requires **`student_analytics.view`**.
- The **`my-analytics`** surface is for the **signed-in user** (module must be entitled); it does not expose other learners’ data through the same routes.

## Freshness and cost

Heavy recomputation runs in **background jobs** and scheduled rebuilds so interactive pages stay fast. A **recalculation log** supports operational monitoring when jobs fail or run slowly.

## Pedagogy

Topic and batch views help staff intervene early—for example extra practice in weak areas—without replacing official transcripts or manual instructor judgment.

---

## Linked references

- **Quiz** — primary assessment input
- **Attendance / assignments** — where listeners integrate those signals
