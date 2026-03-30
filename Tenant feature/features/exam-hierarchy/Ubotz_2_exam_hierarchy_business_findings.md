# UBOTZ 2.0 Exam Hierarchy Business Findings

## Executive Summary

The **exam hierarchy** gives test-prep and academic tenants a **standard syllabus spine**—**exam**, **subject**, **chapter**, **topic**—so courses, quizzes, and the **question bank** can share one taxonomy. This is separate from **course categories**, which exist for **merchandising** and navigation.

Product teams use the hierarchy to drive **analytics** (“weak topics”) and **content alignment** with real-world exams.

---

## Administration

- **Exams** can be created, updated, and deleted (subject to downstream FK usage) via tenant APIs with **`exam.manage`**.
- **Lower levels** (subjects, chapters, topics) are exposed as **list** endpoints in the current API surface for **selection** and **filtering**; confirm roadmap if full CRUD for every level is required in-app.

---

## Linked references

- **Technical specification:** `Ubotz_2_exam_hierarchy_technical_documentation.md`.
- **Related:** Courses (`exam_id`, `subject_id`, `chapter_id`, `topic_id` on `courses`), **quiz / question bank** indexes, batches/categories where linked to exams.
