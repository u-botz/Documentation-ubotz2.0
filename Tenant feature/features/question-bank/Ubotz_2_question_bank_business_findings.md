# UBOTZ 2.0 — Question Bank — Business Findings

## Executive summary

The **question bank** is a tenant-owned **content library** for assessment items. Authors create or import questions, organize them by **exam and subject** (and optionally chapter/topic), and reuse them across many quizzes. Status and archival rules prevent accidental edits to retired content while preserving history where the product uses soft deletes.

## Who does what

- **View** (`quiz_bank.view`) — Browse the bank and use **add to quiz** (copy into a quiz).
- **Create** (`quiz_bank.create`) — New items and **imports**.
- **Edit** (`quiz_bank.edit`) — Update body/metadata and change **status** (including archiving).

## Content model

- **Hierarchy** — Questions anchor to **exam** and **subject**; finer **chapter/topic** tagging supports filtering and analytics downstream.
- **Difficulty and type** — Support mixed assessments (e.g. MCQ vs numerical) and adaptive selection patterns where the quiz engine uses these fields.
- **Media** — Optional image/video URLs point to tenant-scoped assets; heavy media should follow storage and privacy policies.

## Reuse workflow

Publishing (or equivalent **published** state) is required before a question can be **added to a quiz** from the bank—avoiding draft content leaking into live assessments.

## Imports

Bulk import accelerates migration from spreadsheets or legacy systems; validation and parsing are centralized so bad rows fail fast with consistent errors.

---

## Linked references

- **Quiz** — delivery, scoring, and proctoring
- **Question bank technical doc** — exact routes and capabilities
