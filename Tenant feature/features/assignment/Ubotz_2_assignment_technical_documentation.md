# UBOTZ 2.0 Assignment Technical Specification

## 1. Context & Architectural Overview

The Assignment bounded context encapsulates the lifecycle of a student's file-based and subjective submissions against long-form instructional prompts. It is inherently tied to the `TenantAdminDashboard\Assignment` footprint.

### Primary Application UseCases

Under the `app/Application/TenantAdminDashboard/Assignment/UseCases` namespace:
- `CreateAssignmentUseCase`: Instantiates the configuration block tied tightly to a `course_id`/`chapter_id` boundary.
- `SubmitAssignmentUseCase`: Coordinates the file ingestion and persistence of a student's `assignment_submissions` baseline record.
- `RetractSubmissionUseCase`: Modifies the underlying submission state before an instructor interacts with the workflow.
- `GradeSubmissionUseCase`: The terminal function that evaluates `max_grade` capabilities, asserts a final score, and closes communication on the submission payload.

---

## 2. Relational Schema & Invariants

The architecture leans heavily on a tripartite schema structure established in `2026_03_05_130000_create_assignments_tables.php`. 

### A. The Definition Layer (`assignments`)
The parent table establishing the contract constraints.
| Column | Technical Significance |
| :--- | :--- |
| `tenant_id` | **CRITICAL:** Globally enforced via the `BelongsToTenant` scope trait. Isolated rigorously across tenants. |
| `course_id` / `chapter_id` | Mandatory structural integrity anchors connecting the payload to the Course Management framework. |
| `max_grade` / `pass_grade` | Integer boundaries verified during the `GradeSubmissionUseCase`. |

### B. The State Engine (`assignment_submissions`)
The tracking mechanism for independent student interactions.
| Column | Technical Significance |
| :--- | :--- |
| `assignment_id` | Maps back to the Definition Layer via a cascading foreign key. |
| `status` | The state machine governing the entity. Typically shifting between states like `submitted`, `under_review`, `graded`, `retracted`. |
| `instructor_id` | Nullable property populated dynamically upon claiming by a staff member or grading workflow. |

### C. The Interaction Channel (`assignment_messages`)
The normalized dialogue layer preventing monolithic JSON structures.
| Column | Technical Significance |
| :--- | :--- |
| `submission_id` | Maps to the internal State Engine record via a cascading foreign key. |
| `sender_id` | Supports polymorphism—acting dynamically as either the `student` or the `instructor` issuing critique. |
| `file_path` | Pointers to the tenant's isolated S3 artifact storage bucket mapping. |

---

## 3. Strict Security & Tenancy Rules

> [!WARNING]
> Multi-Tenancy invariants are enforced structurally only at the parent `assignments` table level via the `tenant_id` column.

1. **Foreign Key Delegation:** As noted in the schema, the sub-tables (`assignment_submissions` and `assignment_messages`) rely structurally on the parent's `tenant_id` boundaries. 
   - **Crucial Rule:** Any query extracting `assignment_messages` must `JOIN` or eagerly constrain through relationships proving `assignments.tenant_id = currentTenant()`. Direct extraction bypassing the parent model creates a catastrophic cross-tenant data leak if ids collide.

2. **Access Middleware:** `CreateAssignmentUseCase` enforces the `assignment.create` capability attached to the staff role. File payloads received via `SubmitAssignmentUseCase` are rigorously clamped against MIME type extensions via the underlying Ubotz File Manager integration rules.
