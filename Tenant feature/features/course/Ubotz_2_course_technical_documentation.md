# UBOTZ 2.0 Course Technical Specification

## Context & Architectural Precedence
The `TenantAdminDashboard\Course` aggregate is the most heavily-coupled entity in the multi-tenant architecture. The implementation resides primarily mapped via `2026_02_26_200000_create_courses_table.php`. It binds instructors, commercial categorization, and pedagogical taxonomy tightly while functioning as the prerequisite boundary for assignments and enrollment access records.

## Heavy Relational Schema Constraints (`courses`)
| FK Origin | Key Property | Technical Significance |
| :--- | :--- | :--- |
| **Tenancy** | `tenant_id` | **CRITICAL:** Universal barrier mapped to `idx_courses_tenant`. Must be passed via `BelongsToTenant` scope. |
| **Authentication/Identity** | `teacher_id` | Mapped to `users`. Defines internal capability parameters (e.g. an Instructor claiming assignment evaluations scoped strictly to their matched courses). |
| **Commercial Layout** | `category_id` | Maps back to recursive `$O(1)` classification groupings. |
| **Syllabus Identity** | `exam_id`, `subject_id`, etc. | Allows quizzes generated under same `exam_id` taxonomy to automatically cluster. |

## Payload Metrics and Invariants
- **`status`**: Operates on a defined state machine (`draft`, `published`, `archived`) preventing students from inadvertently discovering half-built content bodies (`idx_courses_tenant_status`).
- **`slug`**: A highly constrained unique pointer `$table->unique(['tenant_id', 'slug'])` powering SEO ingestion and Vanity-URL resolution.
- **Constraints (`capacity`, `access_days`)**: Checked at run-time by `CheckCourseAccessUseCase` middleware prior to yielding the session tokens.

### Tag Bindings
A polymorphic sub-graph via `course_tags(course_id, tag_name)` implements light-weight, high cardinality metadata beyond rigid Categories. Restricted securely with `idx_course_tags_unique`.
