# UBOTZ 2.0 — Adaptive Video Player System
## Frontend Integration Plan

**Document Status:** Implementation Plan  
**Version:** 1.0  
**Date:** March 2026  
**Source:** Backend Implementation Plan (Adaptive_Video_Player_Implementation_Plan.md)  
**Scope:** Frontend integration for Phases 14-E and 14-F

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Frontend Architecture Overview](#2-frontend-architecture-overview)
3. [API Contract Reference](#3-api-contract-reference)
4. [Phase 14-E: YouTube & Vimeo Player Integration](#4-phase-14-e-youtube--vimeo-player-integration)
5. [Phase 14-F: Custom HTML5 Player](#5-phase-14-f-custom-html5-player)
6. [Admin Video Authoring Workflow](#6-admin-video-authoring-workflow)
7. [Student Learning Player Integration](#7-student-learning-player-integration)
8. [Implementation Sequencing](#8-implementation-sequencing)
9. [Appendix: File Tree](#9-appendix-file-tree)

---

## 1. Executive Summary

This document defines the frontend implementation plan for the Adaptive Video Player System. The frontend must:

1. **Admin/Teacher:** Attach videos via URL paste (YouTube/Vimeo) or File Manager picker (custom) using new backend endpoints.
2. **Student:** Consume video content via source-type routing — YouTube IFrame API, Vimeo Player SDK, or custom HTML5 player with signed URL.
3. **Custom video only:** Emit heartbeat every 30 seconds, support resume playback, and refresh signed URL when expired.

**Dependency:** Backend Phases 14-A through 14-D must be complete and deployed before frontend implementation begins.

---

## 2. Frontend Architecture Overview

### 2.1 Technology Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 16 (App Router) |
| UI | React 19, Tailwind CSS 4, Radix UI primitives |
| Data Fetching | TanStack React Query v5 |
| HTTP Client | Axios (`apiClient`) |
| State | React hooks, React Query cache |

### 2.2 Directory Structure (Existing)

```
frontend/
├── app/                          # Next.js App Router pages
│   ├── tenant-admin-dashboard/   # Admin UI
│   │   └── courses/[id]/         # Course edit (curriculum tab)
│   └── student-dashboard/        # Student UI
│       └── my-courses/           # Course list; [id] route for learning (to be added)
├── features/                     # Feature modules
│   ├── tenant-admin/
│   │   ├── courses/              # Course content builder, file manager
│   │   └── file-manager/          # FileManagerBrowser, FilePickerModal
│   └── student/
│       └── courses/              # My courses, enrolled course card
├── services/                     # API service layer
│   ├── api-client.ts             # Axios instance with auth interceptors
│   ├── tenant-course-service.ts  # Course, chapters, files
│   ├── tenant-learning-progress-service.ts
│   └── tenant-file-manager-service.ts
├── shared/
│   ├── hooks/                    # use-learning-progress, use-course-enrollment
│   └── ui/                       # Button, Card, Dialog, etc.
├── config/
│   ├── api-endpoints.ts          # Centralized API paths
│   └── routes.ts                # App routes
└── types/                        # TypeScript interfaces
```

### 2.3 Key Existing Components

| Component | Location | Purpose |
|-----------|----------|---------|
| `CourseFileForm` | `features/tenant-admin/courses/components/` | Admin: Add/edit course file (video, document). Supports file_source: upload, youtube, vimeo. Uses FilePickerModal for upload. |
| `CourseFileManager` | Same | Lists files per chapter, uses `useLearningProgress` for toggle complete. |
| `UnifiedChapterContent` | Same | Combines video (CourseFile), text lessons, quizzes. |
| `FilePickerModal` | `features/tenant-admin/file-manager/components/` | Modal with FileManagerBrowser for selecting managed files. |
| `useLearningProgress` | `shared/hooks/use-learning-progress.ts` | Fetches progress, `toggleItem`, `recordVisit`, `isItemCompleted`. |

### 2.4 Auth Context

- **Admin:** `useTenantAuth()` — JWT via `tenant_api` guard. Used for course edit, file management.
- **Student:** Same tenant auth when viewing enrolled courses. Student dashboard uses `/student-dashboard/*` routes.

---

## 3. API Contract Reference

### 3.1 New Endpoints (from Backend Plan)

| Method | Endpoint | Auth | Purpose |
|--------|----------|------|---------|
| `GET` | `/api/tenant/courses/{courseId}/files/{fileId}/video-source` | Student JWT | Get video source for playback |
| `POST` | `/api/tenant/courses/{courseId}/files/{fileId}/video-token/refresh` | Student JWT | Refresh signed URL (custom only) |
| `POST` | `/api/tenant/courses/{courseId}/files/{fileId}/progress/heartbeat` | Student JWT | Report watch position (custom only) |
| `POST` | `/api/tenant/courses/{courseId}/chapters/{chapterId}/files/{fileId}/video` | Admin JWT | Attach video (URL or File Manager) |
| `DELETE` | `/api/tenant/courses/{courseId}/chapters/{chapterId}/files/{fileId}/video` | Admin JWT | Detach video |

**Note:** Verify actual route prefix from backend. Admin routes may use `/api/tenant-dashboard`; student routes typically use `/api/tenant`. The backend implementation plan defines routes under `Route::prefix('courses/{courseId}/files/{fileId}')` for student video endpoints.

### 3.2 Video Source Response (`GET /video-source`)

```typescript
interface VideoSourceResponse {
  data: {
    source_type: 'youtube' | 'vimeo' | 'custom';
    source_identifier: string;  // YouTube ID, Vimeo ID for youtube/vimeo; for custom, backend returns signed_url separately
    signed_url?: string;        // Present only for custom — full URL to stream video (use as <video src>)
    resume_position_seconds?: number;  // Present only for custom — seek to this position on load
  };
}
```

### 3.3 Heartbeat Request (`POST /progress/heartbeat`)

```typescript
// Request body
{
  position_seconds: number;
  duration_seconds?: number;
  watch_percentage: number;
}

// Response: 204 No Content
```

### 3.4 Attach Video Request (`POST /video`)

**Path A — URL:**
```json
{ "video_url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ" }
```

**Path B — File Manager:**
```json
{ "managed_file_id": 123 }
```

---

## 4. Phase 14-E: YouTube & Vimeo Player Integration

### 4.1 Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `@vimeo/player` | ^2.x | Vimeo Player SDK |
| YouTube IFrame API | Loaded via script | No npm package; load from `https://www.youtube.com/iframe_api` |

**Install:**
```bash
npm install @vimeo/player
```

**YouTube API:** Load dynamically. Create `lib/youtube-iframe-loader.ts` to load the script and expose `YT` when ready.

### 4.2 YouTube Player Component

**File:** `features/student/video-player/components/YouTubePlayer.tsx`

**Requirements (from feature spec):**
- Use YouTube IFrame Player API — not raw `<iframe>` tag
- Parameters: `rel=0`, `modestbranding=1`, `enablejsapi=1`, `origin` = tenant domain
- Event: `onStateChange: YT.PlayerState.ENDED` → fire lesson completion
- No heartbeat; completion is binary (video ended)

**Props:**
```typescript
interface YouTubePlayerProps {
  videoId: string;
  onEnded?: () => void;
  className?: string;
}
```

**Implementation notes:**
- Load YouTube API script once per page (singleton)
- Create `YT.Player` on a div ref
- Call `onEnded` when `YT.PlayerState.ENDED`
- `origin` should be `window.location.origin` for CORS

### 4.3 Vimeo Player Component

**File:** `features/student/video-player/components/VimeoPlayer.tsx`

**Requirements (from feature spec):**
- Use `@vimeo/player` npm package
- `new Player(el, { id: vimeo_video_id })` for public (Option A)
- Event: `ended` → fire lesson completion
- No heartbeat; completion is binary

**Props:**
```typescript
interface VimeoPlayerProps {
  videoId: string;
  onEnded?: () => void;
  className?: string;
}
```

**Implementation notes:**
- Vimeo SDK creates iframe internally
- Listen to `player.on('ended', onEnded)`
- Cleanup: `player.destroy()` on unmount

---

## 5. Phase 14-F: Custom HTML5 Player

### 5.1 Requirements (from feature spec)

- Native `<video>` element with **custom control bar** (suppress `controls` attribute)
- Source: signed URL from `video-source` response
- Controls: Play/Pause, Seek bar with buffered indicator, Time display, Volume, Speed (0.5x–2x), Fullscreen
- Heartbeat every 30 seconds of **continuous playback** (not on seek)
- Resume from `resume_position_seconds` on load
- Refresh signed URL when expired (e.g. `video.error` with `MEDIA_ERR_SRC_NOT_SUPPORTED` or 401)

### 5.2 Custom Player Component

**File:** `features/student/video-player/components/CustomVideoPlayer.tsx`

**Props:**
```typescript
interface CustomVideoPlayerProps {
  signedUrl: string;
  resumePositionSeconds?: number;
  courseId: number;
  fileId: number;
  onComplete?: () => void;
  onTokenExpired?: () => Promise<string>;  // Returns new signed URL
  className?: string;
}
```

**State:**
- `currentTime`, `duration` for display
- `buffered` for seek bar
- `volume`, `playbackRate`
- `isPlaying`, `isFullscreen`

**Heartbeat logic:**
- `setInterval` every 30 seconds when `!paused`
- Reset interval on `pause` or `seeking`
- Payload: `{ position_seconds, duration_seconds, watch_percentage }`
- Fire-and-forget; do not block UI on response

**Token refresh:**
- Listen to `video.onerror` — if `video.error?.code === 4` (MEDIA_ERR_SRC_NOT_SUPPORTED) or fetch fails with 401, call `onTokenExpired()`, set new `src`
- Proactively refresh ~2 minutes before 15-min TTL if known

### 5.3 Custom Control Bar Component

**File:** `features/student/video-player/components/CustomVideoControls.tsx`

**Controls:**
- Play/Pause button
- Seek bar: `<input type="range">` with `value={currentTime}`, `max={duration}`; show buffered range via gradient or overlay
- Time display: `formatTime(currentTime)} / {formatTime(duration)}`
- Volume: slider or mute toggle
- Speed: dropdown `[0.5, 0.75, 1, 1.25, 1.5, 2]`
- Fullscreen: `requestFullscreen()` on container

---

## 6. Admin Video Authoring Workflow

### 6.1 Current State

- `CourseFileForm` supports `file_source`: upload, youtube, vimeo
- For upload: uses `FilePickerModal` → `handleFileSelect` sets `file_path` (storage path)
- For YouTube/Vimeo: user pastes URL in `file_path` input
- Form submits to `tenantCourseService.createFile` / `updateFile` with `file_path`, `file_source`, `file_type`

### 6.2 Required Changes

**Option A: Extend existing flow**

The backend implementation plan introduces **dedicated video attachment endpoints** (`POST /video`, `DELETE /video`). Two approaches:

1. **Use new endpoints:** When adding/editing a **video** file (`file_type === 'video'`), use the new attach/detach endpoints instead of create/update file. The form would:
   - For URL: call `POST .../video` with `{ video_url }`
   - For File Manager: call `POST .../video` with `{ managed_file_id }`
   - Backend parses URL, sets `source_type`, `source_identifier`; or validates managed file and sets `source_type: custom`.

2. **Keep create/update file:** If backend continues to accept `file_path` + `file_source` on create/update, the frontend may not need new endpoints. The backend would need to parse YouTube/Vimeo URLs server-side when `file_path` looks like a URL.

**Recommendation:** Follow backend plan — use new attach/detach endpoints for video. This keeps URL parsing and validation on the server.

### 6.3 Admin Service Extension

**File:** `services/tenant-video-service.ts` (new)

```typescript
import { apiClient } from '@/services/api-client';
import { API_ENDPOINTS } from '@/config/api-endpoints';

export const tenantVideoService = {
  attachVideo: async (
    courseId: number,
    chapterId: number,
    fileId: number,
    data: { video_url?: string; managed_file_id?: number }
  ) => {
    const response = await apiClient.post(
      `${API_ENDPOINTS.TENANT_COURSE.FILES(courseId, chapterId)}/${fileId}/video`,
      data
    );
    return response.data;
  },

  detachVideo: async (
    courseId: number,
    chapterId: number,
    fileId: number
  ) => {
    await apiClient.delete(
      `${API_ENDPOINTS.TENANT_COURSE.FILE_DETAIL(courseId, chapterId, fileId)}/video`
    );
  },
};
```

### 6.4 API Endpoints Config Update

**File:** `config/api-endpoints.ts`

Add under `TENANT_COURSE`:
```typescript
// Video attachment (for video-type files)
FILE_ATTACH_VIDEO: (courseId, chapterId, fileId) =>
  `/api/tenant/courses/${courseId}/chapters/${chapterId}/files/${fileId}/video`,
```

### 6.5 CourseFileForm Changes

- When `file_type === 'video'` and user selects "Add Video":
  - **Path A (URL):** Show URL input; on submit, call `tenantVideoService.attachVideo` with `video_url`.
  - **Path B (File Manager):** Show FilePickerModal filtered to video MIME types (`video/*`). On select, call `attachVideo` with `managed_file_id`.
- For existing video file: "Replace video" triggers same flow.
- **File Manager filter:** Add `acceptMimeTypes?: string[]` to `FilePickerModal` / `FileManagerBrowser` to filter `video/mp4`, `video/webm`, `video/quicktime`.

---

## 7. Student Learning Player Integration

### 7.1 Student Course Learning Page

**Current state:** Links point to `/student-dashboard/my-courses/${course.id}` but the dynamic route `app/student-dashboard/my-courses/[id]/page.tsx` may not exist. Create it if missing.

**File:** `app/student-dashboard/my-courses/[id]/page.tsx`

```typescript
import { StudentCourseLearningPage } from '@/features/student/courses/student-course-learning-page';

export default function Page({ params }: { params: { id: string } }) {
  return <StudentCourseLearningPage courseId={parseInt(params.id, 10)} />;
}
```

### 7.2 Student Course Learning Page Component

**File:** `features/student/courses/student-course-learning-page.tsx`

**Responsibilities:**
- Fetch course structure (chapters, files, text lessons, quizzes)
- Display curriculum tree (chapters → items)
- When user selects a **video** item (course_file with file_type=video): render `AdaptiveVideoPlayer` in content area
- Use `useLearningProgress` for completion state; call `toggleItem` when YouTube/Vimeo fires `ended`; for custom, completion is driven by heartbeat (90% threshold)

### 7.3 Adaptive Video Player (Source Router)

**File:** `features/student/video-player/components/AdaptiveVideoPlayer.tsx`

**Props:**
```typescript
interface AdaptiveVideoPlayerProps {
  courseId: number;
  fileId: number;
  onComplete?: () => void;
  className?: string;
}
```

**Logic:**
1. Call `useVideoSource(courseId, fileId)` to fetch `source_type`, `source_identifier`, `signed_url`, `resume_position_seconds`
2. If loading: show skeleton
3. If error (403, 404): show "Access denied" or "Content not found"
4. Route by `source_type`:
   - `youtube` → `<YouTubePlayer videoId={source_identifier} onEnded={handleComplete} />`
   - `vimeo` → `<VimeoPlayer videoId={source_identifier} onEnded={handleComplete} />`
   - `custom` → `<CustomVideoPlayer signedUrl={signed_url} resumePositionSeconds={resume_position_seconds} ... />`

### 7.4 useVideoSource Hook

**File:** `features/student/video-player/hooks/use-video-source.ts`

```typescript
export function useVideoSource(courseId: number, fileId: number) {
  return useQuery({
    queryKey: ['video-source', courseId, fileId],
    queryFn: () => tenantVideoService.getVideoSource(courseId, fileId),
    enabled: !!courseId && !!fileId,
  });
}
```

### 7.5 useVideoHeartbeat Hook

**File:** `features/student/video-player/hooks/use-video-heartbeat.ts`

```typescript
export function useVideoHeartbeat(
  courseId: number,
  fileId: number
) {
  const mutation = useMutation({
    mutationFn: (payload: {
      position_seconds: number;
      duration_seconds?: number;
      watch_percentage: number;
    }) =>
      tenantVideoService.sendHeartbeat(courseId, fileId, payload),
  });

  return { sendHeartbeat: mutation.mutate };
}
```

### 7.6 tenantVideoService (Student)

**File:** `services/tenant-video-service.ts` (extend)

```typescript
getVideoSource: async (courseId: number, fileId: number) => {
  const response = await apiClient.get<VideoSourceResponse>(
    `/api/tenant/courses/${courseId}/files/${fileId}/video-source`
  );
  return response.data;
},

refreshToken: async (courseId: number, fileId: number) => {
  const response = await apiClient.post<{ data: { signed_url: string } }>(
    `/api/tenant/courses/${courseId}/files/${fileId}/video-token/refresh`
  );
  return response.data.data.signed_url;
},

sendHeartbeat: async (
  courseId: number,
  fileId: number,
  payload: { position_seconds: number; duration_seconds?: number; watch_percentage: number }
) => {
  await apiClient.post(
    `/api/tenant/courses/${courseId}/files/${fileId}/progress/heartbeat`,
    payload
  );
},
```

### 7.7 Completion Handling

| Source | Completion trigger | Frontend action |
|--------|-------------------|-----------------|
| YouTube | `YT.PlayerState.ENDED` | Call `toggleItem('course_file', fileId)` |
| Vimeo | `player.on('ended')` | Call `toggleItem('course_file', fileId)` |
| Custom | Backend marks complete at 90% | No explicit toggle; backend handles via heartbeat. Optionally call `fetchProgress()` after heartbeat to refresh UI. |

---

## 8. Implementation Sequencing

| Step | Task | Dependency |
|------|------|-------------|
| 1 | Add API endpoints to `config/api-endpoints.ts` | None |
| 2 | Create `services/tenant-video-service.ts` | Step 1 |
| 3 | Create `lib/youtube-iframe-loader.ts` | None |
| 4 | Create `YouTubePlayer.tsx` | Step 3 |
| 5 | Install and create `VimeoPlayer.tsx` | None |
| 6 | Create `CustomVideoControls.tsx` | None |
| 7 | Create `CustomVideoPlayer.tsx` | Step 6, `useVideoHeartbeat` |
| 8 | Create `useVideoSource`, `useVideoHeartbeat` | Step 2 |
| 9 | Create `AdaptiveVideoPlayer.tsx` | Steps 4, 5, 7, 8 |
| 10 | Create/update `StudentCourseLearningPage` | Step 9, course structure API |
| 11 | Create `app/student-dashboard/my-courses/[id]/page.tsx` | Step 10 |
| 12 | Admin: Add `tenantVideoService.attachVideo` / `detachVideo` | Step 2 |
| 13 | Admin: Update `CourseFileForm` for video attach flow | Step 12 |
| 14 | Add FilePickerModal video filter (optional) | Step 13 |
| 15 | E2E tests: YouTube, Vimeo, custom playback | All above |

---

## 9. Appendix: File Tree

```
frontend/
├── app/student-dashboard/my-courses/
│   └── [id]/
│       └── page.tsx                    [NEW or UPDATE]
├── features/student/
│   ├── courses/
│   │   └── student-course-learning-page.tsx  [NEW or UPDATE]
│   └── video-player/
│       ├── components/
│       │   ├── AdaptiveVideoPlayer.tsx      [NEW]
│       │   ├── YouTubePlayer.tsx            [NEW]
│       │   ├── VimeoPlayer.tsx              [NEW]
│       │   ├── CustomVideoPlayer.tsx        [NEW]
│       │   └── CustomVideoControls.tsx       [NEW]
│       └── hooks/
│           ├── use-video-source.ts          [NEW]
│           └── use-video-heartbeat.ts       [NEW]
├── features/tenant-admin/courses/components/
│   └── course-file-form.tsx                 [UPDATE - video attach flow]
├── features/tenant-admin/file-manager/components/
│   ├── FilePickerModal.tsx                  [UPDATE - optional video filter]
│   └── FileManagerBrowser.tsx              [UPDATE - optional mime filter]
├── services/
│   └── tenant-video-service.ts             [NEW]
├── lib/
│   └── youtube-iframe-loader.ts            [NEW]
├── config/
│   └── api-endpoints.ts                     [UPDATE - video endpoints]
└── types/
    └── video.types.ts                       [NEW - VideoSourceResponse, etc.]
```

---

## 10. Error Handling & Edge Cases

| Scenario | Frontend behavior |
|----------|-------------------|
| 403 on video-source | Show "You must be enrolled to view this content" |
| 404 on video-source | Show "Content not found" |
| Token expired mid-playback | Call refresh endpoint, update `src`, resume |
| Heartbeat fails (network) | Retry once; do not block playback |
| YouTube/Vimeo video unavailable | Show "Video unavailable" message |
| Custom video load error | Check for 401; trigger token refresh |

---

## 11. Testing Checklist

- [ ] YouTube video plays; `ended` fires; lesson marked complete
- [ ] Vimeo video plays; `ended` fires; lesson marked complete
- [ ] Custom video plays; resume from saved position
- [ ] Custom video: heartbeat sent every 30s during playback
- [ ] Custom video: lesson marked complete at 90%
- [ ] Token refresh: expired URL triggers refresh; playback continues
- [ ] Unenrolled student: 403 on video-source
- [ ] Admin: Attach YouTube via URL; attach custom via File Manager
- [ ] Admin: Detach video; content cleared

---

*End of Frontend Integration Plan — UBOTZ 2.0 Adaptive Video Player System — March 2026*
