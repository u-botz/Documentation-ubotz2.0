# UBOTZ 2.0 — Quiz — Technical Specification

## Scope

Assessment lifecycle: authoring (`quizzes`, questions, sections), student attempts/results, analytics, and grading queues. Bounded context: `TenantAdminDashboard\Quiz`. Routes: `backend/routes/tenant_dashboard/quiz.php`.

## Module and capabilities

- **Module:** `tenant.module:module.exams` wraps all routes in this file.

| Capability | Used for (representative) |
|------------|---------------------------|
| `quiz.view` | List/detail/stats, question-type entitlements, access-check, results, analytics, grading queue read |
| `quiz.create` | Create quiz, duplicate |
| `quiz.edit` | Update quiz, questions, sections, reorder, enroll student, grade, bulk grade, reassign grading |
| `quiz.publish` | Status transitions, close quiz |
| `quiz.archive` | Archive (delete route) |

**Student surface** (`/api/tenant/student/quizzes/...`) has **no** `tenant.capability` middleware in the route file; enforcement is in controllers/use cases (enrollment, access rules).

## HTTP map (base `/api/tenant`)

### Student (`/student/quizzes`)

| Method | Path |
|--------|------|
| GET | `/student/quizzes` — catalog |
| GET | `/student/quizzes/{quizId}` |
| POST | `/student/quizzes/{quizId}/start` |
| GET | `/student/quizzes/{quizId}/attempt/{resultId}` |
| POST | `/student/quizzes/{quizId}/attempt/{resultId}/submit` |
| GET | `/student/quizzes/{quizId}/result/{resultId}` |
| GET | `/student/quizzes/{quizId}/leaderboard` |

### Admin/instructor (`/quizzes`)

- Read: `GET /quizzes/stats`, `/quizzes`, `/quizzes/question-type-entitlements`, `/quizzes/{quizId}`, `/quizzes/{quizId}/access-check`
- Write: create, update, `PATCH .../status`, duplicate, delete (archive), close, enroll
- Questions: `/quizzes/{quizId}/questions` CRUD + `POST .../reorder`
- Results: `/quizzes/{quizId}/results`, `/quizzes/{quizId}/results/{resultId}`, `POST .../grade`
- Analytics: `/quizzes/{quizId}/analytics/summary|questions|trends|students`
- Sections: `/quizzes/{quizId}/sections` CRUD + `PATCH .../reorder`
- Grading queue: `GET .../grading-queue`, `POST .../grade/{responseId}`, `POST .../grade-bulk/{questionId}`, `POST .../reassign-grading`

## Application use cases (examples)

Under `App\Application\TenantAdminDashboard\Quiz\UseCases\`:

- Lifecycle: `CreateQuizUseCase`, `UpdateQuizUseCase`, `DuplicateQuizUseCase`, `ChangeQuizStatusUseCase`, `ArchiveQuizUseCase`, `CloseQuizUseCase`, `EnrollStudentInQuizUseCase`
- Sections/questions: `CreateQuizSectionUseCase`, `UpdateQuizSectionUseCase`, `DeleteQuizSectionUseCase`, `ReorderQuizSectionsUseCase`, `CreateQuizQuestionUseCase`, `UpdateQuizQuestionUseCase`, `DeleteQuizQuestionUseCase`, `ReorderQuizQuestionsUseCase`
- Attempts: `CheckQuizAccessUseCase`, `StartQuizAttemptUseCase`, `SubmitQuizAnswersUseCase`
- Grading: `GradeQuizResultUseCase`, `GradeQuizResponseUseCase`, `BulkGradeByQuestionUseCase`, `CompleteGradingUseCase`, `ReassignGradingUseCase`
- Question bank bridge: `AddQuestionFromBankUseCase`, `ImportQuestionBankUseCase` (bank import)

## Persistence (tenant — representative)

| Migration | Purpose |
|-----------|---------|
| `2026_03_03_000001_create_quizzes_table.php` | Core `quizzes` — `quiz_type` (`practice_quiz` \| `mock_test` \| `pyq`), `status`, access/scoring/CBT/display fields, JSON `sections` |
| `2026_03_03_000002_create_quiz_questions_table.php`, `2026_03_03_000003_create_quiz_question_options_table.php` | Inline questions |
| `2026_03_21_180C_000001_create_quiz_sections_table.php` | `quiz_sections` (structured sections) |
| `2026_03_08_034947_create_quiz_results_table.php` + later migrations | Attempts/results/responses |

## Frontend

`frontend/config/api-endpoints.ts` → **`TENANT_QUIZ`** (admin quiz paths). Student quiz paths may be called directly from feature code (e.g. `/api/tenant/student/quizzes/...`).

---

## Linked references

- **Question bank** — reusable items and `bank_question_id` on quiz questions
- **Exam hierarchy** — `exam_id` / `subject_id` linkage on quizzes
