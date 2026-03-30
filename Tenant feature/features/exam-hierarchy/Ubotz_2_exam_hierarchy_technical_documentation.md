# UBOTZ 2.0 Exam Hierarchy Technical Specification

## Core Architecture
The `exam-hierarchy` fundamentally bounds the core educational payload. It differs from `Category` which organizes commercial presentation; instead, this defines strict pedagogical outlines required by competitive testing modules.

## Relational Schema Constraints 
Defined across multiple incremental migrations (`2026_02_26_195600_create_exams_table.php`, `subjects`, `exam_chapters`, `exam_topics`).

### Root: `exams`
- **`tenant_id`**: Structural invariant. Covered by `idx_exams_tenant`.
- **`slug`**: A tenant-unique string identifier `idx_exams_tenant_slug(tenant_id, slug)`.
- Validates status downstream via `is_active` boolean integer.

### The Downstream Nesting Vectors
Although they map identically conceptually to categories, these are rigorously defined tables:
1. `exams` (Root, e.g., NEET)
2. `subjects` (Child, e.g., Biology)
3. `exam_chapters` (Grandchild, e.g., Human Physiology)
4. `exam_topics` (Great-Grandchild, e.g., Digestion)

**Key Technical Differentiator**: Because these tables are partitioned instead of recursively pointing to themselves (unlike `categories` table's `parent_id`), queries executing `$O(1)` joins between `subjects` $\rightarrow$ `exams` are significantly faster and easier to index than infinite recursive CTE depth.

## Dependencies Context
These tables are rigorously referenced by the `question_bank` composite indices (`idx_qbank_hierarchy`) to pull test questions instantaneously against specific Syllabus components. Deleting an `exam_id` forces restrict constraints.
