# UBOTZ 2.0 Student Analytics Business Findings

## Executive Summary
Student Analytics provides deep pedagogical insights beyond basic grading. It enables Ubotz 2.0 tenants to understand the "Subject Matter Competency" of their students by weighting different assessments and aggregating performance across the syllabus hierarchy.

## Operational Modalities

### 1. Dimension Weighting
Not all assessments are equal. Administrators can define `analytics_weight_configs` to prioritize specific dimensions:
- **Assessment Score**: 70%.
- **Attendance Consistency**: 10%.
- **Assignment Completion**: 20%.
- This allows for a holistic "Student Performance Index" rather than a raw GPA.

### 2. Performance Snapshots
Because calculating complex subject-matter competency in real-time is expensive, the system uses "Snapshots" (e.g., `quiz_analytics_snapshots`). These represent the state of a student's knowledge at a specific point in time, allowing for historical growth charting.

### 3. Subject-Matter Competency
By tracking performance against the `Exam Hierarchy` (Subject $\rightarrow$ Chapter $\rightarrow$ Topic), the dashboard can specifically flag: "Student X is struggling with Algebra but excels in Geometry". 

## Real-time Recalculation
When significant assessment data is added, the system logs a `recalculation_request`. This ensures that analytics remain fresh without impacting the performance of the core student-facing testing engine.

---

## Linked References
- Related Modules: `Quiz`, `Exam-Hierarchy`, `Attendance`.
