# UBOTZ 2.0 Assignment Business Findings

## Executive Summary
The Assignment feature operates as a subjective, interaction-rich assessment module for Ubotz 2.0 tenants. Unlike the highly automated, objective nature of the primary Quiz engine, Assignments facilitate long-form problem solving, iterative student-instructor dialogue, and file-based submissions tied directly to course chapters.

---

## 1. Assignment Structuring & Boundaries

Instructors author assignments anchored deeply within the course taxonomy.
- **Course & Chapter Binding:** Every assignment is strictly linked to a parent `course_id` and `chapter_id`. It ensures assignments align with specific modules and cannot exist as standalone products detached from curriculum progress.
- **Performance Thresholds:** Assignments explicitly govern passing states through `max_grade` and `pass_grade` parameters, ensuring students must demonstrate minimum competencies.
- **Attempt Enforcement:** Through the `attempts` cap and dynamic `deadline_days`, administrators can enforce strict operational boundaries preventing infinite revisions while simulating real-world academic constraints.
- **Progression Gates:** The optional `check_previous_parts` toggle mandates sequential completion prerequisites, heavily influencing the student's progression UX.

---

## 2. Iterative Submission & Grading Workflow

The business value of Assignments stems from the interactive evaluation pipeline.

### The Student Submission Phase
Students interact with the assignment primarily by uploading contextual documents and explanatory text. Unlike tests which conclude abruptly at a timer's expiry, assignment submissions open a dedicated communication channel. 
- Students can intentionally **Retract** a submission (`RetractSubmissionUseCase`) prior to grading if they discover a fatal flaw in their work, saving instructor review time.

### The Moderation & Messaging Funnel
Instructors do not simply issue a pass/fail. The relationship between a submission and grading involves a two-way dialogue model.
- **Messaging Exchange:** Instructors and students can iterate over a submission via attached `messages`. Instructors can critique a file submission, request specific amendments, and allow the student to resubmit within the bounds of their `attempts`.
- **Final Grading:** Upon satisfactory verification, instructors execute a final grading sign-off matching the `pass_grade` logic.

---

## 3. Linked References
- Status report: `../../status reports/Assignment_Status_Report.md`
- Original feature doc: `../../feature documents/Ubotz_2_assignment_feature_documentation.md`
- Linked Domain Context: `Course Management` and `Assessment` flows.
