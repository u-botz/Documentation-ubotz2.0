# UBOTZ 2.0 — EducoreOS
## Feature Specification: Adaptive Video Player System
### Multi-Source Video Delivery for the Student Learning Experience

---

**Document Status:** DRAFT — Pending Principal Engineer Review  
**Version:** 1.0  
**Date:** March 2026  
**Platform:** EducoreOS (UBOTZ 2.0)  
**Prepared for:** Principal Engineer Audit

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Problem Statement](#2-problem-statement)
3. [Video Source Model](#3-video-source-model)
4. [Player Behaviour by Source Type](#4-player-behaviour-by-source-type)
5. [Open Architecture Decision — Vimeo Account Model](#5-open-architecture-decision--vimeo-account-model)
6. [Admin / Teacher Video Authoring Workflow](#6-admin--teacher-video-authoring-workflow)
7. [Backend Architecture](#7-backend-architecture)
8. [Watch Progress Tracking](#8-watch-progress-tracking)
9. [Security Audit Checklist](#9-security-audit-checklist)
10. [Open Decisions Register](#10-open-decisions-register)
11. [Non-Goals](#11-non-goals-explicitly-out-of-scope)
12. [Implementation Sequencing](#12-implementation-sequencing-recommendation)
13. [Definition of Done](#13-definition-of-done)

---

## 1. Executive Summary

This document defines the Adaptive Video Player System for UBOTZ 2.0 (EducoreOS). The feature enables students to consume video content delivered from three distinct sources, each rendered by the appropriate player. The system is a core component of the Student Learning Player.

The three supported video source types are:

- **YouTube** — embedded via the YouTube IFrame Player API.
- **Vimeo** — embedded via the Vimeo Player SDK.
- **Custom (Tenant-Uploaded)** — served from the platform's Contabo-hosted file storage via a signed URL and played through a native HTML5 video player.

The video source for each lesson is determined at content authoring time by the Tenant Admin or Teacher. At runtime, the frontend resolves the source type and mounts the correct player. No single universal player is used — each source type has its own player to preserve the full capability of that platform.

> **Scope Boundary**
>
> This document covers: video playback, source-type routing, admin video attachment workflow, custom video progress tracking, and the signed URL delivery mechanism.
>
> Out of scope: File Manager implementation, video transcoding pipeline, DRM, video upload chunking, storage quota accounting, and the broader progress/completion engine beyond what is needed to integrate the video heartbeat.

---

## 2. Problem Statement

Tenant Admins use multiple video hosting strategies. Some upload videos directly to the platform. Others host content on YouTube for convenience. Others use Vimeo for its privacy controls and professional embedding options. A single fixed player cannot adequately serve all three scenarios.

A YouTube video rendered through a custom HTML5 player loses critical YouTube features (quality selection, captions, recommendations management). A Vimeo private video cannot be embedded via a raw URL — it requires the Vimeo SDK and, in some tenancy models, an authenticated token. A custom-uploaded video has no external CDN to fall back on and requires tenant-scoped, time-limited access control.

The platform must therefore route each lesson's video to the correct player based on the declared source, while enforcing the security and access control rules appropriate to that source.

---

## 3. Video Source Model

### 3.1 Source Types

Each video lesson carries a `source_type` field that determines which player is mounted. The three valid values are:

| `source_type` Value | Player Used | Identifier Stored | Who Controls Hosting |
|---|---|---|---|
| `youtube` | YouTube IFrame API | YouTube video ID (e.g. `dQw4w9WgXcQ`) | YouTube / Tenant |
| `vimeo` | Vimeo Player SDK | Vimeo video ID (e.g. `123456789`) | Vimeo / Tenant |
| `custom` | HTML5 native player | Internal file path / signed URL reference | Platform (Contabo storage) |

### 3.2 How `source_type` Is Determined

The `source_type` is not inferred at runtime. It is explicitly set at authoring time when the Admin or Teacher attaches a video to a lesson. The two authoring paths are:

- **URL Paste (for YouTube and Vimeo):** The author pastes a video URL into the lesson editor. The backend parses the URL to extract the video ID and sets `source_type` automatically.
- **File Manager Picker (for custom uploads only):** The author opens the File Manager, selects an uploaded video file, and attaches it to the lesson. This path always results in `source_type = custom`.

> **Architectural Constraint**
>
> Custom-uploaded video is never attached via URL paste. A tenant cannot paste a raw Contabo storage URL into the lesson editor — they must go through the File Manager picker. This enforces tenant isolation: the backend validates that the selected file belongs to the requesting tenant before accepting the attachment.

### 3.3 Database Representation

The `course_files` table (already present in the codebase) stores video lesson content. The following columns are relevant to this feature. No new table is required for the source type model — columns are added to the existing lesson / `course_files` record.

| Column | Type | Values / Notes |
|---|---|---|
| `source_type` | `VARCHAR(20)` | `youtube` \| `vimeo` \| `custom` |
| `source_identifier` | `VARCHAR(500)` | YouTube video ID, Vimeo video ID, or internal storage path |
| `vimeo_account_mode` | `VARCHAR(20)` | `public` \| `private` (see Section 5 for the Vimeo account model decision) |
| `duration_seconds` | `INT UNSIGNED NULL` | Total duration; used for progress threshold calculation. Null until resolved. |

No MySQL ENUMs are used. All enumerated values are stored as `VARCHAR` and validated at the application layer, consistent with the platform convention.

---

## 4. Player Behaviour by Source Type

### 4.1 YouTube Player

- **Player:** YouTube IFrame Player API (official JavaScript SDK)
- **Embedding method:** IFrame rendered by the YouTube API — not a raw `<iframe>` tag

The YouTube IFrame Player API is loaded once per page. When the lesson has `source_type = youtube`, the frontend initialises a `YT.Player` instance targeting a DOM container, passing the stored video ID.

**Required player parameters:**

- `rel=0` — suppresses related videos from other channels at the end of playback.
- `modestbranding=1` — reduces YouTube logo prominence.
- `enablejsapi=1` — required to receive playback events from the API.
- `origin` — must be set to the tenant's domain to comply with YouTube's CORS policy.

**Events captured:**

- `onStateChange: YT.PlayerState.ENDED` — used to fire the lesson completion event.
- No heartbeat / seek position is tracked to the backend for YouTube. Completion is binary: the video ends = the lesson is marked complete.

> ⚠️ **Security Note**
>
> The YouTube video ID is public. There is no signed URL or token required. Access control for this lesson type is enforced at the enrollment layer — the frontend only receives the video ID if the user is enrolled. The video itself, once the ID is known, is playable anywhere on YouTube. This is a known and accepted limitation of YouTube embedding.
>
> Tenants who require strict content access control (no external sharing) must use custom-uploaded video, not YouTube.

---

### 4.2 Vimeo Player

- **Player:** Vimeo Player SDK (`@vimeo/player` npm package)
- **Embedding method:** Vimeo Player instantiated on a DOM element with the video ID

When the lesson has `source_type = vimeo`, the frontend instantiates a `Vimeo Player` object targeting a DOM container. The Vimeo SDK handles iframe creation internally.

**Events captured:**

- `ended` — fires when playback reaches the end. Used to trigger lesson completion.
- No heartbeat / seek position is tracked to the backend for Vimeo. Completion is binary.

There are two Vimeo account models. The open decision between them is captured in Section 5. The player initialisation differs as follows:

| Account Mode | Player Init | Backend Involvement |
|---|---|---|
| `public` | `new Player(el, { id: vimeo_video_id })` | None. Video ID sent to frontend directly. |
| `private` | `new Player(el, { id: vimeo_video_id, h: privacy_hash })` or OAuth token if domain restriction is used | Backend resolves the privacy hash or token before sending to frontend. |

---

### 4.3 Custom Player (Tenant-Uploaded Video)

- **Player:** Native HTML5 `<video>` element with a custom control layer
- **Source:** Time-limited signed URL generated by the backend per request

This is the most security-critical player type. The video file is stored on the platform's Contabo-hosted file storage under a tenant-scoped path. The student never receives a persistent URL.

#### 4.3.1 Signed URL Delivery

1. The student navigates to a lesson with `source_type = custom`.
2. The frontend calls `GET /api/tenant/lessons/{id}/video-source`.
3. The backend verifies: (a) the student is enrolled in the course, (b) the file belongs to the requesting tenant, (c) the tenant subscription is active.
4. The backend generates a signed token (HMAC-SHA256) embedding: `file_path`, `tenant_id`, `user_id`, `expiry_timestamp` (15 minutes).
5. The frontend receives the signed URL and passes it as the `src` of the `<video>` element.
6. When the URL expires mid-playback, the frontend requests a refresh token silently.

> **Security Constraints for Signed URLs**
>
> - URL TTL: Maximum 15 minutes. Consistent with the platform's asset isolation policy.
> - The signed token must embed `tenant_id`. A token for Tenant A's file is rejected by the file-serving endpoint even if the signature is valid, if the requesting user belongs to Tenant B.
> - Signed URL generation must NOT be called inside a database transaction.
> - The file-serving endpoint validates the HMAC before serving any bytes. No unauthenticated byte ranges are served.

#### 4.3.2 Custom Player Controls

The native HTML5 controls are suppressed (`controls` attribute removed). A custom control bar is rendered in the frontend. Minimum required controls:

- Play / Pause
- Seek bar with buffered range indicator
- Current time / Total duration display
- Volume control
- Playback speed selector (0.5x, 0.75x, 1x, 1.25x, 1.5x, 2x)
- Fullscreen toggle

#### 4.3.3 Storage Path Convention

Custom video files are stored under a tenant-scoped path on Contabo storage:

```
/storage/tenants/{tenant_id}/videos/{uuid}.{ext}
```

The path is stored in the `source_identifier` column. The file-serving layer prefixes this with the storage root. The path never exposes the Contabo server hostname or credentials to the client.

#### 4.3.4 S3 Migration Readiness

When the platform migrates to S3, only the URL generation logic in the backend service changes. The `source_identifier` column continues to store the relative path. The signed URL construction switches from HMAC-based to AWS S3 pre-signed URLs. No database migration or frontend change is required for this transition.

> **Future Migration Contract**
>
> - `source_identifier` stores relative path only — never an absolute URL or hostname.
> - The `VideoTokenService` (see Section 7) is the single component that changes during S3 migration.
> - The frontend receives only the resolved signed URL — it never constructs storage paths.

---

## 5. Open Architecture Decision — Vimeo Account Model

The Vimeo account model for this platform has not been decided. This section documents both options, their architectural implications, and the questions that must be answered before implementation begins.

### Option A: Public Vimeo URL (No API Key Required)

The tenant pastes a public Vimeo URL. The backend extracts the video ID from the URL. The Vimeo Player SDK embeds the video using only the video ID. No Vimeo API key is stored anywhere in the system.

**Advantages:**
- No tenant credential management required.
- No backend calls to Vimeo API at lesson load time.
- Vimeo's own access controls apply (the video must be set to Public on Vimeo).

**Limitation:** The video is publicly accessible on Vimeo. If the tenant makes it unlisted or private on Vimeo, it breaks. The platform has no control over Vimeo-side access settings.

---

### Option B: Tenant-Owned Vimeo Account (Private Video Support)

Each tenant with Vimeo integration provides their Vimeo API token. This token is stored encrypted in the tenant configuration. When a student accesses a Vimeo lesson, the backend uses the tenant's token to fetch a privacy hash or verify access, then passes the necessary parameters to the frontend player.

**Advantages:**
- Supports Vimeo private and domain-restricted videos.
- Tenant retains full control over who can view their Vimeo content.

**Complexity:** Requires encrypted per-tenant credential storage, a Vimeo API service in the backend, and a new tenant configuration UI for inputting the API token.

---

### Comparison

| Decision Factor | Option A: Public | Option B: Private (Tenant Account) |
|---|---|---|
| Vimeo API key required | No | Yes — per tenant, encrypted at rest |
| Supports private Vimeo videos | No | Yes |
| Backend complexity | Low | Medium (credential store + API service) |
| Tenant configuration required | None | Vimeo API token input in tenant settings |
| External API failure risk | Low (SDK only) | Medium (API call at lesson load) |
| Implementation phase | Can ship with Phase 14 | Requires a separate sub-phase |

> ⚠️ **Decision Required Before Implementation**
>
> - Which Vimeo account model does the platform support at launch?
> - If Option B: Is the Vimeo token stored at the tenant level (one per tenant) or at the video level (one per video)?
> - If Option B: What is the fallback behaviour if the Vimeo API call fails — block playback or fall back to public embed?
>
> **Recommendation:** Ship with Option A at launch. Add Option B as a named sub-phase once the credential management infrastructure (which will also be needed for other third-party integrations) is in place.

---

## 6. Admin / Teacher Video Authoring Workflow

### 6.1 Path A: URL Paste (YouTube or Vimeo)

1. The author opens the Lesson Editor for a video-type lesson.
2. The author selects "Add Video via URL".
3. The author pastes the full video URL (e.g. `https://www.youtube.com/watch?v=XXXX` or `https://vimeo.com/123456789`).
4. The frontend sends the raw URL to the backend for parsing.
5. The backend parses the URL, extracts the video ID, and determines the `source_type` (`youtube` or `vimeo`). If the URL format is unrecognised, a validation error is returned. Partial or malformed video IDs are rejected.
6. The lesson record is updated with `source_type` and `source_identifier`.
7. The lesson editor shows a preview embed to confirm the video is accessible.

> **URL Parsing Rules**
>
> - **YouTube:** Accept `youtube.com/watch?v=ID`, `youtu.be/ID`, `youtube.com/embed/ID`. Extract 11-character video ID.
> - **Vimeo:** Accept `vimeo.com/ID` and `player.vimeo.com/video/ID`. Extract numeric video ID.
> - Any URL not matching these patterns is rejected with a user-facing error message. The backend does NOT accept arbitrary external URLs.

### 6.2 Path B: File Manager Picker (Custom Uploads)

1. The author opens the Lesson Editor for a video-type lesson.
2. The author selects "Choose from File Manager".
3. A File Manager modal opens, filtered to show only video file types (`mp4`, `mov`, `webm`).
4. The author selects a previously uploaded video file.
5. The backend validates: the selected file belongs to the requesting tenant, the file type is a supported video format, and the file status is `upload_complete` (not pending or failed).
6. The lesson record is updated with `source_type = custom` and `source_identifier` = the file's storage path.

> **Constraint:** The File Manager picker is the only valid path for attaching a custom video. There is no "upload from lesson editor" shortcut. The video must be uploaded to the File Manager first.

### 6.3 Detaching / Replacing a Video

- An author can replace the attached video at any time by selecting a new video via either path.
- Replacing a custom video does not delete the original file from storage — it only updates the lesson's `source_identifier` reference.
- Watch progress records for the old video are not automatically invalidated. Progress reset is a separate admin operation.

---

## 7. Backend Architecture

### 7.1 Domain Layer Additions

The following additions are made within the existing **Course bounded context**. No new bounded context is introduced.

#### 7.1.1 Value Objects

- `VideoSource` — encapsulates `source_type` and `source_identifier`. Validates `source_type` is one of the three permitted values. Validates identifier format per source type.
- `VideoSourceType` — enum-equivalent value object: `YOUTUBE | VIMEO | CUSTOM`.

#### 7.1.2 Domain Events

- `VideoAttachedToLesson` — fired when a video is attached to a lesson. Carries `lesson_id`, `source_type`, `source_identifier`, `tenant_id`.
- `VideoDetachedFromLesson` — fired when a video is removed or replaced.

---

### 7.2 Application Layer

#### 7.2.1 Use Cases

- `AttachVideoToLessonUseCase` — accepts the video source data, validates, persists, fires event.
- `DetachVideoFromLessonUseCase` — clears video source from the lesson.
- `GenerateVideoPlaybackTokenUseCase` — validates enrollment, generates signed URL for custom video. Only invoked for `source_type = custom`.

#### 7.2.2 Query

- `GetLessonVideoSourceQuery` — returns `source_type`, resolved `source_identifier`, and for `source_type = custom`, triggers token generation. For YouTube/Vimeo, returns the video ID directly. The frontend never determines the source type independently — it always receives it from this query.

---

### 7.3 Infrastructure Layer

#### 7.3.1 `VideoTokenService`

Responsible for generating and validating signed URLs for custom video access.

- **Token payload:** `{ file_path, tenant_id, user_id, expires_at }`
- **Signature:** HMAC-SHA256 using a server-side secret (separate from `JWT_SECRET`).
- **TTL:** 15 minutes, configurable via platform settings.
- **Refresh endpoint:** `POST /api/tenant/lessons/{id}/video-token/refresh` — requires valid session; does not require re-authentication.
- **S3 migration:** This service is the single swap point. The interface contract to the Application layer remains identical.

#### 7.3.2 `VideoUrlParser`

Infrastructure service used during authoring. Parses raw URLs to extract `source_type` and `source_identifier`. This is a pure parsing utility — it makes **no external HTTP calls**. It does not validate whether the video actually exists on YouTube or Vimeo.

---

### 7.4 HTTP Layer

| Method | Endpoint | Auth | Purpose |
|---|---|---|---|
| `POST` | `/api/tenant/admin/lessons/{id}/video` | Admin/Teacher JWT | Attach video to lesson (both authoring paths) |
| `DELETE` | `/api/tenant/admin/lessons/{id}/video` | Admin/Teacher JWT | Detach video from lesson |
| `GET` | `/api/tenant/lessons/{id}/video-source` | Student JWT | Get video source for playback (includes signed URL for custom) |
| `POST` | `/api/tenant/lessons/{id}/video-token/refresh` | Student JWT | Refresh signed URL for custom video |
| `POST` | `/api/tenant/lessons/{id}/progress/heartbeat` | Student JWT | Report watch position (custom video only) |

All endpoints enforce tenant scoping. A student JWT from Tenant A cannot access lesson data belonging to Tenant B.

---

## 8. Watch Progress Tracking

### 8.1 Scope

Backend progress tracking applies to **custom-uploaded videos only**. YouTube and Vimeo deliver a binary completion signal (video ended) from their respective SDKs. Only the custom player emits a heartbeat with watch position.

| Source Type | Heartbeat to Backend | Completion Trigger | Progress Detail |
|---|---|---|---|
| `youtube` | No | `YT.PlayerState.ENDED` event | Binary — ended or not |
| `vimeo` | No | Vimeo SDK `ended` event | Binary — ended or not |
| `custom` | Yes — every 30 seconds | `watch_percentage >= 90%` | Granular — position + percentage stored |

### 8.2 Heartbeat Mechanism (Custom Video)

The custom player emits a heartbeat every 30 seconds of active playback. Seeking does not trigger a heartbeat — only continuous playback time increments do.

**Heartbeat payload sent to `POST /api/tenant/lessons/{id}/progress/heartbeat`:**

- `lesson_id` — from URL
- `position_seconds` — current playback position
- `duration_seconds` — total video duration (as known to the player)
- `watch_percentage` — `(position / duration) * 100`, computed client-side

**The backend:**

1. Validates the lesson belongs to the tenant and the student is enrolled.
2. Upserts the progress record for this student + lesson.
3. If `watch_percentage >= 90` and current status is not `complete`: marks the lesson as complete and fires the `LessonCompleted` domain event.
4. Returns `HTTP 204`. The frontend does not wait for or act on the response body.

> **Concurrency Note**
>
> The heartbeat endpoint is fire-and-forget from the client. Multiple rapid requests are possible if the user seeks.  The upsert must be idempotent.
>
> The `LessonCompleted` event must only be dispatched once, even if multiple heartbeats arrive above the 90% threshold. The backend checks current status before dispatching.
>
> No pessimistic locking is needed here — the worst case is a duplicate event, which the handler must be idempotent to process.

### 8.3 Resume Playback

When a student opens a custom video lesson, the frontend calls `GET /api/tenant/lessons/{id}/video-source`. The response includes the last recorded `position_seconds` from the progress record. The custom player seeks to this position before beginning playback, enabling seamless resume.

YouTube and Vimeo do not support server-side resume position. The player starts from the beginning on each visit.

---

## 9. Security Audit Checklist

The following security requirements must be verified during the Principal Engineer audit before implementation is approved.

| # | Requirement | Risk if Missed |
|---|---|---|
| S-01 | All video source endpoints enforce `tenant_id` scoping. A student cannot request the video source of a lesson from a different tenant. | Cross-tenant content leakage |
| S-02 | Signed URL generation verifies enrollment before issuing the token. An authenticated but unenrolled student receives `403`. | Paid content access without payment |
| S-03 | Signed URL embeds `tenant_id`. The file-serving endpoint rejects tokens where the embedded `tenant_id` does not match the requesting user's `tenant_id`. | Cross-tenant file serving |
| S-04 | The file-serving endpoint validates HMAC signature before reading any bytes from storage. An invalid or expired token returns `401`. | Direct file access via guessed URL |
| S-05 | `VideoUrlParser` makes no external HTTP requests. It is a pure parsing utility. | SSRF via crafted YouTube/Vimeo URL |
| S-06 | The File Manager picker returns only files belonging to the requesting tenant. The `file_id` in the attach request is validated against `tenant_id` on the server. | Tenant A attaching Tenant B's file to a lesson |
| S-07 | The heartbeat endpoint validates enrollment on every request. It does not trust `watch_percentage` from the client for the completion decision — it recomputes from stored position and duration. | Client-side manipulation to fake course completion |
| S-08 | Video token refresh requires a valid active session. An expired JWT is rejected. The refresh endpoint cannot be used to extend a session. | Token refresh as session bypass |
| S-09 | Signed URL TTL is enforced server-side. A client holding an expired token receives `401` from the file-serving endpoint regardless of client-side clock. | Expired URL reuse |
| S-10 | The Vimeo API token (Option B only) is stored encrypted at rest. It is never logged, never returned in any API response, and never exposed to the frontend. | Vimeo credential exposure |

---

## 10. Open Decisions Register

The following decisions must be resolved before the implementation plan is written. Each is a blocker for a specific area of the design.

| ID | Decision | Blocker For | Options |
|---|---|---|---|
| OD-01 | Vimeo account model: public embed vs. tenant-owned private account. | Section 5, video-source API response design, tenant config UI | Option A (public) or Option B (private). See Section 5. |
| OD-02 | Does `duration_seconds` for custom video come from the upload pipeline (server-side probe) or from the client at first playback? | Heartbeat computation, resume accuracy | Server-side: requires FFprobe or equivalent after upload. Client-side: simpler but trusts client. |
| OD-03 | Is the File Manager built and operational before this feature begins? | Path B authoring workflow (Section 6.2) | If not built: custom video attachment must be deferred to a later sub-phase. |
| OD-04 | Should the signed URL response include `Content-Disposition` and `Cache-Control` headers to discourage browser download of custom video? | Custom player security posture | Yes (add headers) or No (defer to a later security hardening phase). |

---

## 11. Non-Goals (Explicitly Out of Scope)

The following are explicitly out of scope for this feature. They must not be implemented as part of this phase.

- Video transcoding or HLS conversion pipeline. Custom videos are served as-is (raw MP4/WebM). HLS is a future phase.
- DRM (Digital Rights Management). Signed URLs with short TTL are the access control mechanism.
- Adaptive bitrate streaming (ABR). A single video file is served per upload.
- Video upload from the lesson editor directly. Upload happens in the File Manager. The lesson editor only attaches.
- Storage quota tracking integration. The quota system (Phase 11B) tracks storage usage. This feature does not modify quota logic.
- Subtitle / caption management.
- Video analytics (watch heatmaps, drop-off points). The heartbeat provides completion data only.
- Third-party video providers beyond YouTube and Vimeo (e.g. Wistia, Loom, Brightcove).
- Video commenting or annotation.

---

## 12. Implementation Sequencing Recommendation

This feature has dependencies that must be sequenced correctly. The recommended implementation order is:

| Sub-Phase | Deliverable | Dependency |
|---|---|---|
| 14-A | Domain: `VideoSource` value objects, `VideoSourceType`, domain events. | None — pure PHP, no infrastructure dependency. |
| 14-B | Backend: `VideoUrlParser`, `AttachVideoToLessonUseCase`, `DetachVideoFromLessonUseCase`, HTTP endpoints for admin authoring. | Phase 14-A complete. |
| 14-C | Backend: `VideoTokenService` (HMAC signed URL), `GenerateVideoPlaybackTokenUseCase`, video-source and token refresh endpoints. | Phase 14-A, Contabo storage path convention confirmed. |
| 14-D | Backend: Heartbeat endpoint, progress upsert, `LessonCompleted` event dispatch for custom video. | Phase 14-A, existing LearningProgress infrastructure. |
| 14-E | Frontend: YouTube player integration, Vimeo player integration, source-type routing logic. | Phases 14-B, 14-C backend endpoints live. |
| 14-F | Frontend: Custom HTML5 player, signed URL refresh, heartbeat emission, resume playback. | Phases 14-C and 14-D backend endpoints live. |
| 14-G | Integration test: All three source types end-to-end. Security audit. | All above sub-phases complete. |

> OD-01 (Vimeo account model) must be resolved before Phase 14-E begins. All other open decisions must be resolved before Phase 14-C.

---

## 13. Definition of Done

This feature is complete when all of the following conditions are met:

- All open decisions in Section 10 are resolved and documented.
- Principal Engineer audit of the implementation plan returns no Critical or Architectural findings.
- All security checklist items in Section 9 are verified by the audit.
- A student enrolled in a course can play a YouTube lesson, a Vimeo lesson, and a custom-uploaded video lesson without error.
- A student not enrolled in a course receives `403` when requesting the video source.
- A signed URL for a custom video expires after the configured TTL and returns `401` from the file-serving endpoint.
- Watch progress is recorded for custom video and the lesson is marked complete at 90%.
- YouTube and Vimeo lessons are marked complete on the `ended` event.
- The custom player resume position is correct after closing and reopening a lesson.
- No cross-tenant file access is possible via any combination of valid tokens.
- The Phase 14 Completion Report is signed off by the Principal Engineer.

---

*End of Document — UBOTZ 2.0 Adaptive Video Player System Feature Specification v1.0 — March 2026*