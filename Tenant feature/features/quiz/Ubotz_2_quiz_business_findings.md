# UBOTZ 2.0 Quiz Business Findings & Requirements

## Executive Summary
The Quiz feature is a foundational assessment engine for UBotz 2.0 tenants. It is designed to evaluate student comprehension through flexible structures ranging from low-stakes practice quizzes to high-stakes, exam-simulating mock tests. The module is fully isolated per tenant and provides powerful monetization and access control levers to administrators and instructors.

---

## 1. Assessment Types & CBT Simulation
The platform supports distinct modalities for quizzes to align with various pedagogical and business goals:

- **Practice Quizzes (`practice_quiz`)**: Standard assessments typically attached to course material for continuous evaluation.
- **Mock Tests (`mock_test`)**: Architected to simulate real-world entrance examinations (e.g., JEE, NEET). 
- **Previous Year Questions (`pyq`)**: Archives of past examinations, primarily used as a monetization or lead-generation tool.

### Computer-Based Testing (CBT) Simulation
For tenants catering to competitive exam preparation, the system provides strict CBT configurations that mimic actual testing environments. Toggling CBT mode enables features such as:
- A real-time **Question Palette** showing answered, unanswered, and "marked for review" statuses.
- **Mark for Review** capabilities, allowing users to bookmark difficult questions and resolve them later in the session.
- **Sectional Summaries**, providing macro-level insights before final submission.

---

## 2. Monetization & Access Models

The quiz engine is tightly integrated with the platform's commercial strategy, offering flexible access boundaries.

### Access Levels (`access_level`)
- **Course Only (`course_only`)**: The quiz is strictly bound to a specific course. Only students with an active enrollment in the parent course can access it.
- **Standalone (`standalone`)**: The quiz exists independently of courses. It can be sold as a distinct product or offered directly to registered users.
- **Hybrid (`both`)**: The quiz serves both course-enrolled students and independent purchasers.

### Pricing Mechanism
- **Free vs. Paid (`is_free`)**: Quizzes can be offered at no cost (excellent for lead generation or introductory material) or locked behind the tenant's payment gateway.

---

## 3. Operations & Question Management

### The Question Bank
To maximize instructor efficiency, the platform utilizes a robust, centralized **Question Bank**.
- Instructors can import questions in bulk, tag them with metadata (subject, topic, chapter), and reuse them across multiple quizzes.
- Reusing questions ensures parity when analyzing difficulty metrics across different cohorts over time.

### Quiz Construction
Quizzes are built linearly or organized into **Sections** (critical for Mock Tests mirroring standard exam formats).
- **Randomization:** Instructors can shuffle question order (`display_questions_randomly`) or cap the total questions displayed from a much larger pool (`display_limited_questions`).
- **Scheduling:** Quizzes operate strictly within a defined validity window (`access_starts_at` and `expiry_days`) while actively tracking attempts against the `max_attempts` ceiling.

---

## 4. Evaluation & Grading Strategies

The business supports complex grading configurations to mirror rigorous academic standards:
- **Automated Grading:** For objective question types (MCQs), the platform computes scores instantly upon submission based on `default_mcq_grade` and `pass_mark` thresholds.
- **Negative Marking:** For competitive exam simulations, the system calculates exact penalties utilizing the `negative_marking` penalty coefficients.
- **Manual Evaluation Workflows:** For subjective responses, workflows exist to assign human graders, process items via a `BulkGradeByQuestion` pipeline, and execute a formalized `CompleteGrading` sign-off.

---

## 5. Linked References
- Status report: `../../status reports/Quiz_Status_Report.md`
- Original feature doc: `../../feature documents/Ubotz_2_quiz_feature_documentation.md`
