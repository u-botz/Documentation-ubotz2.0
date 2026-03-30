# UBOTZ 2.0 Question Bank Business Findings

## Executive Summary
The Question Bank represents the centralized repository for academic content management within the Ubotz 2.0 tenant ecosystem. It serves as the foundational data source feeding the Quiz, Mock Test, and CBT (Computer-Based Testing) engines. A strictly organized, multi-tenant isolated repository empowers educators to author, import, review, and infinitely reuse instructional content.

---

## 1. Taxonomic Hierarchy
Content within the Question Bank cannot exist in a vacuum; it is strictly categorized to support complex analytical matrices and dynamic quiz creation down the line.

- **Exam & Subject Anchors**: Every question mandates an assignment to an `exam_id` (e.g., JEE Mains) and a `subject_id` (e.g., Physics). This is the bedrock of syllabus management.
- **Granular Syllabus Mapping**: Questions are optionally mapped down to `chapter_id` and `topic_id`, enabling deep-dive performance analytics for students (e.g., scoring low on 'Thermodynamics' specifically).
- **Difficulty Layering**: Instructors enforce a `difficulty_level` across the repository. This permits dynamic generation of quizzes that target specific student proficiencies.

---

## 2. Operational Workflows & Content Types

The Question Bank supports massive scale, accommodating various modalities of testing.

### Supported Modalities (`type`)
The repository is fundamentally agnostic to the rendering format, absorbing schemas like:
- Singular MCQs (Multiple-Choice Questions)
- Multi-Select objective questions
- Numerical/Integer Value Types (evaluated directly against `correct_numerical_value`)
- Rich-Text / Subjective Questions

### Media Attachments
Questions natively expose properties to decouple content text from heavy media vectors. This includes embedded images (`image_url`) and explainer videos (`video_url`) which are crucial for detailed post-exam resolutions.

### The Moderation Pipeline (`status`)
Creating a question does not immediately syndicate it to live quizzes. A moderation pipeline acts as a buffer:
- Questions are introduced usually in an unverified state via bulk imports.
- Only entities toggled to the `published` status become accessible to the `AddQuestionFromBankUseCase` for quiz construction.

---

## 3. The Reuse Factor
The business value of the Question Bank lies in its capability for infinite reuse without duplication overhead. 
Instead of cloning questions inside every new quiz, quizzes dynamically reference items from the Bank. Should an error in an answer key be discovered post-publish, correcting the singular repository record implicitly resolves the key across all linked historical and active quizzes.

---

## 4. Linked References
- Status report: `../../status reports/QuestionBank_Status_Report.md`
- Original feature doc: `../../feature documents/Ubotz_2_question_bank_feature_documentation.md`
- Bounded Context: Tightly integrated with the `Quiz` infrastructure.
