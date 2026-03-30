# UBOTZ 2.0 File Manager Business Findings

## Executive Summary

The **file manager** is the tenant’s **user-scoped** library for uploads: folders and files stored on the configured **disk** (e.g. local or S3) with metadata for name, MIME type, and size. It is used for **general assets** (branding, documents) whose paths can be referenced from other features.

**Course materials** are primarily modeled as **`course_files`** (bound to **courses** and **chapters**) with business rules for **accessibility**, **downloadability**, and **video** sources — overlapping with the file manager only when a workflow stores a **path** into a course.

---

## Permissions

- **`file.view`** — browse, download, stream.
- **`file.upload`** — upload.
- **`file.create_directory`** — new folders.
- **`file.manage`** — rename, move, delete files and directories.

---

## Linked references

- **Technical specification:** `Ubotz_2_file_manager_technical_documentation.md`.
- **Related:** Courses (chapter files), assignments (file paths), fee receipts (downloads).
