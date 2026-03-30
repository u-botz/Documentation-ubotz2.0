# UBOTZ 2.0 Exam Hierarchy Technical Specification

The exam hierarchy models a **syllabus tree**: **exam → subject → chapter → topic**, used to tag **courses** and **question bank** content. It is **not** the same as **commercial categories** (`categories` with recursive `parent_id`).

Tables live in the **tenant** database. Domain/application code under `App\Domain\TenantAdminDashboard\ExamHierarchy` and `App\Application\TenantAdminDashboard\ExamHierarchy\Queries` (list queries).

---

## 1. HTTP surface (tenant API)

Routes: `backend/routes/tenant_dashboard/exam_hierarchy.php` → prefix **`/api/tenant/admin/exam-hierarchy`**.

**Capabilities:** **`exam.view`** (reads), **`exam.manage`** (exam writes).

| Method | Path | Middleware |
|--------|------|------------|
| `GET` | `/exams` | `exam.view` |
| `POST` | `/exams` | `exam.manage` |
| `PUT` | `/exams/{exam_id}` | `exam.manage` |
| `DELETE` | `/exams/{exam_id}` | `exam.manage` |
| `GET` | `/subjects` | `exam.view` |
| `GET` | `/chapters` | `exam.view` |
| `GET` | `/topics` | `exam.view` |

**Important:** At the time of writing, **only `exams`** expose **create/update/delete** in this route file. **`subjects`**, **`chapters`**, and **`topics`** are **list/index** endpoints (with query params such as `exam_id` on subjects — see `SubjectController`). If your product needs CRUD for lower levels, confirm whether another route file or admin tool provides it.

**Frontend:** `frontend/config/api-endpoints.ts` — `TENANT_EXAM_HIERARCHY.*` under `/api/tenant/admin/exam-hierarchy/...`.

---

## 2. Relational schema (tenant DB)

### 2.1 `exams`

`2026_02_26_195600_create_exams_table.php`: `tenant_id`, `name`, `slug`, `description`, `is_active`, `sort_order`; **`unique(tenant_id, slug)`** — `idx_exams_tenant_slug`.

Later migrations may add **`category_id`**, **`batch_id`**, etc. — see `2026_03_28_*` under tenant migrations.

### 2.2 `subjects`

`2026_02_26_195700_create_subjects_table.php`: `tenant_id`, **`exam_id`** (FK → `exams`, cascade), `name`, `slug`, …; **`unique(tenant_id, slug)`**.

`2026_03_15_041527_make_exam_id_nullable_on_subjects_table.php` — **`exam_id`** can be **nullable** for flexible curriculum modeling.

### 2.3 `exam_chapters`

`2026_02_26_195800_create_exam_chapters_table.php`: `tenant_id`, **`subject_id`** → `subjects`, `name`, `slug`, …; **`unique(tenant_id, slug)`**.

### 2.4 `exam_topics`

`2026_02_26_195900_create_exam_topics_table.php`: `tenant_id`, **`chapter_id`** → `exam_chapters`, `name`, `slug`, …; **`unique(tenant_id, slug)`**.

**Design note:** Slugs are **unique per tenant** within each table, not globally across all four levels in one column — composite uniqueness is per table as defined above.

---

## 3. Differentiation from `categories`

- **`categories`:** Recursive **retail** tree for course catalog (`parent_id`).
- **Exam hierarchy:** Fixed **four-level** FK chain (`exams` → `subjects` → `exam_chapters` → `exam_topics`) with explicit FKs — optimized for **syllabus-aligned** indexing and question tagging.

---

## 4. Linked code references

| Layer | Path |
|-------|------|
| HTTP | `backend/app/Http/TenantAdminDashboard/ExamHierarchy/Controllers/` |
| Queries | `backend/app/Application/TenantAdminDashboard/ExamHierarchy/Queries/` |
| Routes | `backend/routes/tenant_dashboard/exam_hierarchy.php` |

---

## 5. Document history

- Aligned route prefix **admin/exam-hierarchy** and capabilities **`exam.view`** / **`exam.manage`**.
- Documented **read-only** nature of subject/chapter/topic routes in `exam_hierarchy.php` vs **exam** CRUD.
- Noted **nullable `exam_id`** on subjects and follow-up migrations on `exams`.
