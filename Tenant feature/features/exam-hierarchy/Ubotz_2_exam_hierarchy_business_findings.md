# UBOTZ 2.0 Exam Hierarchy Business Findings

## Executive Summary

The **exam hierarchy** gives test-prep and academic tenants a **standard syllabus spine**—**exam**, **subject**, **chapter**, **topic**—so courses, quizzes, and the **question bank** can share one taxonomy. This is separate from **course categories**, which exist for **merchandising** and navigation.

Product teams use the hierarchy to drive **analytics** (“weak topics”) and **content alignment** with real-world exams.

---

## Administration

- **Exams**, **subjects**, **chapters**, and **topics** support **full CRUD** under `/api/tenant/admin/exam-hierarchy` with **`exam.view`** (reads) and **`exam.manage`** (writes). Deletes that would orphan **question bank** rows are rejected (HTTP 409); database cascades apply when deleting subjects/chapters that own child rows without bank references.

---

## Linked references

- **Technical specification:** `Ubotz_2_exam_hierarchy_technical_documentation.md`.
- **Related:** Courses (`exam_id`, `subject_id`, `chapter_id`, `topic_id` on `courses`), **quiz / question bank** indexes, batches/categories where linked to exams.
