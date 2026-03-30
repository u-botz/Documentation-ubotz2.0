# P16A — Timetable Frontend Integration Plan

| Field | Value |
|-------|--------|
| **Phase** | 16A-II (Tenant Admin UI) + touchpoints for 16A-III |
| **Depends on** | Backend `api/tenant/timetable/*` (16A-I complete) |
| **Stack** | Next.js App Router, `apiClient` (`frontend/services/api-client.ts`), TanStack Query (align with existing tenant-admin features) |
| **Reference** | `backend/documentation/UBOTZ_2_PHASE_16A_TIMETABLE_COMPLETION_DEVELOPER_INSTRUCTIONS.md` §6 |

---

## 1. Goals

1. Deliver **full Tenant Admin timetable UX**: calendar, templates + weekly slot builder, venues, holidays.
2. Enforce **capability gating** in UI: `timetable.view` (read/nav), `timetable.manage` (mutations). Backend remains source of truth; UI hides/disables actions without capability.
3. Handle **409 hard conflicts** and **warnings[]** (soft mode) consistently across slot create, ad-hoc, and related flows.
4. Align types with **actual API** (numeric IDs, `data` envelope); extend display with **joined data** (batch/teacher names) via existing tenant endpoints where needed.

---

## 2. Prerequisites & Discovery (Sprint 0 — 1–2 days)

| Task | Outcome |
|------|---------|
| Confirm `NEXT_PUBLIC_API_URL` / proxy calls reach `/api/tenant/timetable/*` with tenant JWT | Smoke: GET templates with Postman/curl |
| Map how **capabilities** are exposed to the client (e.g. `/api/tenant/me`, JWT claims, or role hook) | Document flag: `canViewTimetable`, `canManageTimetable` |
| List existing patterns: **TanStack Query** hooks (e.g. courses, users), **toast** errors, **modal** forms | Copy conventions (folder layout, naming) |
| Identify **batches** API, **users/teachers** filter, **subjects** (exam hierarchy), **branches** | For dropdowns in slot/ad-hoc forms |
| Optional: GET timetable **settings** (look-ahead, conflict mode) if/when backend exposes `GET /timetable/settings` | Default look-ahead weeks on template form |

**Deliverable:** Short “API & UX assumptions” note in repo or appendix to this doc.

---

## 3. Architecture

### 3.1 Layering

```
app/tenant-admin-dashboard/timetable/**     → Pages, redirects, layout wrappers
features/tenant-admin/timetable/
  ├── services/timetable-api.ts           → Thin axios wrappers (all timetable paths)
  ├── types/timetable.ts                  → DTOs matching backend JSON
  ├── hooks/*.ts                          → useQuery / useMutation + cache keys
  └── components/*.tsx                    → Presentational + composed flows
config/api-endpoints.ts                   → TIMETABLE: { ... } constants
```

### 3.2 API client

- Add `API_ENDPOINTS.TENANT_TIMETABLE` (or `TENANT.TIMETABLE`) with base `/api/tenant/timetable`.
- Centralize paths in one object to avoid string drift.

### 3.3 Cache strategy (TanStack Query)

| Query key prefix | Invalidation triggers |
|------------------|----------------------|
| `['timetable','sessions', filters]` | After reschedule, substitute, cancel, ad-hoc, unpublish (affects instances) |
| `['timetable','templates']` | After create/update/publish/unpublish/archive |
| `['timetable','template', id, 'slots']` | After slot CRUD |
| `['timetable','venues']` | After venue archive/update/create |
| `['timetable','holidays', year, branchId]` | After holiday CRUD |

---

## 4. Implementation Phases

### Phase F1 — Shell, nav, capability gate (2–3 days)

| # | Work item | Acceptance |
|---|-----------|------------|
| F1.1 | Add sidebar entries under **Academic**: Timetable → Calendar, Templates, Venues, Holidays | Visible only if `timetable.view` (or module `module.erp.timetable` entitled + view cap) |
| F1.2 | Routes: `/tenant-admin-dashboard/timetable` → redirect to `.../calendar` | Match doc §6.1 |
| F1.3 | Placeholder pages for calendar, templates, venues, holidays | Shared layout (title, breadcrumbs) |
| F1.4 | `timetable-api.ts` + endpoints in `api-endpoints.ts` | Typed fetch for GET templates, GET sessions |
| F1.5 | `useTimetableSessions`, `useScheduleTemplates` (read-only) | Prove data on placeholder or minimal list |

**Exit:** User with `timetable.view` can open Calendar and see empty state or raw session list.

---

### Phase F2 — Calendar (week/day) (5–7 days)

| # | Work item | Acceptance |
|---|-----------|------------|
| F2.1 | **Week grid** Mon–Sun, time axis 07:00–21:00 (configurable) | Sessions positioned by `session_date` + `start_time`/`end_time` |
| F2.2 | **Day view** toggle | Single column, same session card component |
| F2.3 | Week nav: prev/next, Today, date picker | Updates `from_date` / `to_date` query params |
| F2.4 | **Batch** multi-select filter → `GET sessions?batch_id=&from_date=&to_date=` | Refetch on change |
| F2.5 | **Teacher** filter → `teacher_id` | Optional multi-teacher = multiple requests or backend extension (document if client-side filter only MVP) |
| F2.6 | **Session cards**: color by `session_type`, status icon, `holiday_conflict` badge | Match doc §6.2 |
| F2.7 | **Display names**: subject from `subject.name`; batch/teacher — resolve via parallel queries or batch map | Degrade to IDs if name missing |
| F2.8 | Click card → **Session detail panel** (sheet/drawer) | Read-only fields per §6.4 |
| F2.9 | Empty state + CTA to Templates | Copy from doc |
| F2.10 | Toolbar: **Create ad-hoc** (if `timetable.manage`) | Opens modal (stub until F5) |

**Dependencies:** Session list API; optional user/batch list APIs for labels.

**Exit:** Coordinators can browse week schedule with filters.

---

### Phase F3 — Templates list + template form (3–4 days)

| # | Work item | Acceptance |
|---|-----------|------------|
| F3.1 | **Templates table**: name, batch, status badge, effective range, slot count, actions | Slot count: `GET templates/{id}/slots` length or include in list if backend extended later |
| F3.2 | Status filter: All / Draft / Published | Query `status=` + exclude archived unless toggle |
| F3.3 | Create template → `/templates/create` | POST create, redirect to edit |
| F3.4 | Edit template **section 1**: title, batch, dates, look-ahead | PUT template; dates disabled if not draft |
| F3.5 | **Publish** confirmation + POST publish | Toast success; invalidate templates + sessions |
| F3.6 | **Unpublish** confirmation + POST `{ confirm: true }` | Doc copy; invalidate |
| F3.7 | **Archive** confirmation + DELETE template | Handle 409-style message from API |

**Exit:** Full template lifecycle without slots (slot builder in F4).

---

### Phase F4 — Weekly slot builder (6–8 days) — **highest risk**

| # | Work item | Acceptance |
|---|-----------|------------|
| F4.1 | **7-column grid** by `day_of_week` (0–6); stack slots by time | Responsive scroll |
| F4.2 | **Slot card**: time, subject, teacher, venue, type badge, edit/delete | Draft-only enable |
| F4.3 | Add slot modal: fields per doc §6.3 table | POST slot; `conflict_mode` from settings or user override |
| F4.4 | **Hard conflict**: show API error message in toast; no close on success | 409 handling |
| F4.5 | **Soft conflict**: show `warnings` banner; slot still listed | From POST response |
| F4.6 | Edit slot → PUT; Delete → DELETE | Invalidate slots query |
| F4.7 | Block all slot mutations if template **published** | Disable UI + tooltip |

**Exit:** Draft template can be fully configured and published from UI.

---

### Phase F5 — Session actions (4–5 days)

| # | Work item | Acceptance |
|---|-----------|------------|
| F5.1 | **Reschedule** modal → POST reschedule | Invalidate sessions; show link old → new in detail panel |
| F5.2 | **Substitute** modal → POST substitute | Show original vs substitute in card/detail |
| F5.3 | **Cancel** with reason → POST cancel | Card updates / greyed |
| F5.4 | **Ad-hoc** modal → POST ad-hoc | Warnings banner if soft mode; 409 if hard |
| F5.5 | **Link to attendance** | If backend exposes link field: deep link to attendance session; else “Phase 16B” placeholder |

**Exit:** Operational day-to-day changes from calendar + detail panel.

---

### Phase F6 — Venues & holidays (4–5 days)

| # | Work item | Acceptance |
|---|-----------|------------|
| F6.1 | Venues table + create/edit modal + archive | Map `location_description` ↔ API `notes` |
| F6.2 | Archive warning if API returns business rule message | User understands sessions may still reference venue |
| F6.3 | Holidays: **month calendar** + **list panel** | `GET holidays?year=&branch_id=` |
| F6.4 | Holiday CRUD modals; delete confirm copy per doc | Invalidate holidays + sessions (conflict badges) |

**Exit:** Institution can maintain venues and holidays from UI.

---

### Phase F7 — Polish & 16A-III handoff (3–4 days)

| # | Work item | Acceptance |
|---|-----------|------------|
| F7.1 | Loading skeletons, error boundaries, i18n keys if project uses i18n | No blank flashes |
| F7.2 | Accessibility: keyboard nav on calendar, modal focus trap | Basic a11y pass |
| F7.3 | E2E checklist execution (doc §7.1) | Tracked in test spreadsheet or Playwright later |
| F7.4 | Optional: **GET /timetable/settings** when available — show conflict mode read-only | Helps explain 409 vs warnings |

---

## 5. Backend API Quick Reference (frontend)

Base: `/api/tenant/timetable`

| Capability | Method | Path |
|------------|--------|------|
| view | GET | `/venues`, `/holidays`, `/templates`, `/templates/{id}`, `/templates/{id}/slots`, `/sessions` |
| manage | POST/PUT/DELETE | `/venues`, `/holidays`, `/templates`, `/templates/{id}/publish`, `/unpublish`, slots, `/sessions/ad-hoc`, cancel, reschedule, substitute |

**Sessions query params:** `from_date`, `to_date`, `batch_id`, `teacher_id`, `venue_id`, `subject_id`.

**Unpublish body:** `{ "confirm": true }`.

**Types:** IDs are integers in current API; doc §8 uuid examples are aspirational — **code to actual JSON**.

---

## 6. Capability & module gating

1. **Sidebar:** Hide Timetable group if user lacks `timetable.view` OR tenant lacks `module.erp.timetable` (mirror backend entitlement).
2. **Mutations:** Disable/hide buttons unless `timetable.manage`.
3. **403:** Show generic “no permission” toast; do not enumerate missing capability.

---

## 7. Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Calendar performance (many sessions) | Virtualize time rows or cap visible range; server-side date window only |
| Teacher/batch names not in session payload | Client-side enrichment map or small batch endpoint |
| Timezone drift | Display in tenant timezone if available; document assumption (IST) |
| Published template slot edit blocked | Clear UX: “Unpublish to edit slots” |

---

## 8. File manifest (aligned with doc §6.7)

Approximate **~33 files**; adjust paths to match repo (`app/tenant-admin-dashboard/...`).

| Area | Files |
|------|--------|
| Pages | `timetable/page.tsx`, `calendar/page.tsx`, `templates/page.tsx`, `templates/create/page.tsx`, `templates/[id]/edit/page.tsx`, `venues/page.tsx`, `holidays/page.tsx` |
| Components | `calendar-view`, `session-card`, `session-detail-panel`, `reschedule-form`, `substitute-form`, `adhoc-session-form`, `template-list-table`, `template-form`, `weekly-slot-builder`, `slot-card`, `slot-form`, `venue-*`, `holiday-*`, `batch-filter`, `conflict-warning` |
| Hooks | `use-timetable-sessions`, `use-schedule-templates`, `use-template-slots`, `use-venues`, `use-holidays`, `use-timetable-filters` |
| Service | `timetable-api.ts` (or `services/timetable-service.ts`) |

---

## 9. Suggested sprint breakdown

| Sprint | Phases | Duration (indicative) |
|--------|--------|-------------------------|
| S1 | F1 | 1 week |
| S2 | F2 | 1–1.5 weeks |
| S3 | F3 + F4 | 2 weeks |
| S4 | F5 + F6 | 1.5 weeks |
| S5 | F7 | 1 week |

**Total:** ~6–7 weeks with one full-stack dev (parallel FE+BE fixes as needed).

---

## 10. Definition of Done (16A-II)

- [ ] All routes in §6.1 reachable with correct capability.
- [ ] Calendar week/day + filters + session detail + empty states.
- [ ] Template CRUD + publish/unpublish/archive + weekly slot builder + conflict UX.
- [ ] Reschedule, substitute, cancel, ad-hoc from UI.
- [ ] Venues + holidays CRUD.
- [ ] No write actions visible without `timetable.manage`.
- [ ] Manual E2E checklist §7.1 signed off (or critical paths automated later).

---

*Document version: 1.0 — Frontend integration plan for Phase 16A-II.*
