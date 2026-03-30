# UBOTZ 2.0 Assignment Business Findings

## Executive Summary

Assignments let tenants collect **text and file-based work** from students, tied to **courses and chapters**, with **deadline rules**, **instructor grading**, and **pass/fail** against configurable thresholds. The feature is distinct from the automated Quiz engine: it emphasizes subjective review, feedback, and optional file evidence.

For implementation detail (APIs, schema, status values, and known integration gaps), see **`Ubotz_2_assignment_technical_documentation.md`** in this folder.

---

## 1. Structuring & boundaries

- **Course & chapter binding:** Each assignment is anchored to a **`course_id`** and **`chapter_id`** so it appears in curriculum context and can be listed per chapter in the admin and learning UI.
- **Grading thresholds:** **`max_grade`** and **`pass_grade`** define the scale and the minimum score to pass; the domain enforces that pass does not exceed max.
- **Deadlines:** Operators configure how deadlines work using **`deadline_type`** — for example none, a **fixed date**, or **days after enrollment** (with supporting fields). Exact business behavior for “days after enrollment” should stay aligned with how enrollment dates are supplied in the submit flow (see technical doc).
- **Assignment lifecycle:** Assignments support an **active** vs **archived** style lifecycle at the data layer (see technical specification for enum/DB alignment).

**Product note:** Earlier product drafts mentioned **attempt caps** and **“check previous parts”** gating. Those columns were **removed** from the database in favor of the current deadline model; any restored “attempts” or prerequisite behavior would be **new work**, not a description of the current schema.

---

## 2. Submission & grading workflow

### Student experience

- Students submit **text** and/or a **file reference** (storage path produced by the tenant’s file workflow).
- Typically **one active submission** per student per assignment; **retraction** is allowed only while the work is still **pending review** (before grading), so instructors are not asked to review work the student has withdrawn.

### Instructor experience

- Instructors (or permitted roles) see the list of submissions for an assignment, **grade** within the configured maximum, provide **feedback**, and record **pass/fail**.
- Notifications can fire on submission and on grade (listeners in the application layer).

### Messaging / threaded dialogue

- Historical designs described a **separate message thread** per submission. The **`assignment_messages`** table was **removed** in a migration; there is **no** persisted threaded chat in the current model. Feedback is carried on the **submission record** (`feedback`, grade, status). Restoring threaded dialogue would require a new persistence design.

---

## 3. Operational considerations

- **Module flag:** Tenants must have the **assignments** module enabled to expose APIs and admin UX.
- **Roles & capabilities:** Creating, editing, viewing, grading, and retracting (where restricted) map to **tenant capabilities** on the technical routes — see the technical document for the exact capability names.
- **Student “my assignments” listing:** Some client code may call a dedicated “my assignments” API; confirm that route exists in production before promising a global student assignments dashboard.

---

## 4. Linked references

- **Technical specification (authoritative for APIs & schema):** `Ubotz_2_assignment_technical_documentation.md`
- **Related product areas:** Course curriculum (chapters), file manager (upload paths), notifications, optional student activity / engagement metrics when submissions occur.
