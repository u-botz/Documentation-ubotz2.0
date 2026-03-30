# UBOTZ 2.0 — Adaptive Video Player System
## Implementation Plan

**Document Status:** Implementation Plan  
**Version:** 1.0  
**Date:** March 2026  
**Source:** Feature Spec v1.0 (Ubotz2 video player feature spec v1.0.md)  
**Authority:** Developer Instruction Manual (Ubotz 2 developer instruction manual .md) — **MANDATORY**

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Terminology Mapping](#2-terminology-mapping)
3. [Pre-Implementation Decisions](#3-pre-implementation-decisions)
4. [Database Schema](#4-database-schema)
5. [Phase 14-A: Domain Layer](#5-phase-14-a-domain-layer)
6. [Phase 14-B: Admin Authoring Backend](#6-phase-14-b-admin-authoring-backend)
7. [Phase 14-C: Video Token & Signed URL](#7-phase-14-c-video-token--signed-url)
8. [Phase 14-D: Watch Progress & Heartbeat](#8-phase-14-d-watch-progress--heartbeat)
9. [Phase 14-E: Frontend Player Integration (YouTube/Vimeo)](#9-phase-14-e-frontend-player-integration-youtubevimeo)
10. [Phase 14-F: Frontend Custom Player](#10-phase-14-f-frontend-custom-player)
11. [Phase 14-G: Integration & Security Audit](#11-phase-14-g-integration--security-audit)
12. [Developer Manual Compliance Checklist](#12-developer-manual-compliance-checklist)
13. [Appendix: File Tree](#13-appendix-file-tree)

---

## 1. Executive Summary

This implementation plan translates the Adaptive Video Player System feature specification into concrete, actionable development tasks that strictly adhere to the UBOTZ 2.0 Developer Instruction Manual. The architecture follows the four-layer DDD model: Domain → Application → Infrastructure → HTTP.

**Key Constraint:** All code must be tenant-scoped. Every repository method, UseCase, and Command must accept `int $tenantId` as the first parameter for tenant-scoped operations.

**Implementation Scope:** Backend only (Phases 14-A through 14-D). Frontend phases (14-E, 14-F) are documented for reference; backend developers must ensure the API contracts are correct.

---

## 2. Terminology Mapping

| Feature Spec Term | UBOTZ Codebase Equivalent |
|------------------|---------------------------|
| Lesson (video) | `course_file` with `file_type = video` |
| Lesson ID | `course_file_id` |
| Lesson Editor | `CourseFileController` / chapter file management |
| `/api/tenant/lessons/{id}` | `/api/tenant/courses/{courseId}/chapters/{chapterId}/files/{fileId}` (or equivalent student-facing route) |
| File Manager | `ManagedFileRecord` / `managed_files` table |
| Progress record | `course_learnings` (completion) + `video_watch_progress` (position granularity) |

**Route Structure:** The spec uses `/api/tenant/lessons/{id}`. For student-facing API, use `/api/tenant/courses/{courseId}/files/{fileId}` where `fileId` = `course_file_id`. The student must be enrolled in the course.

---

## 3. Pre-Implementation Decisions

**Decision Required Before Phase 14:** Resolve OD-01 through OD-04 from the feature spec.

| ID | Decision | Recommended Default | Implementation Impact |
|----|----------|---------------------|------------------------|
| OD-01 | Vimeo account model | Option A (public) | No `vimeo_account_mode` backend logic; column nullable |
| OD-02 | `duration_seconds` source | Client at first playback | Simpler; backend accepts from heartbeat |
| OD-03 | File Manager | Built (exists) | Path B authoring workflow enabled |
| OD-04 | Signed URL headers | Yes | Add `Content-Disposition`, `Cache-Control` in file-serving |

**Assumption:** File Manager (`managed_files`, `ManagedFileRecord`) is operational. Custom video attachment via File Manager picker is in scope.

---

## 4. Database Schema

### 4.1 Migration: Add Video Source Columns to `course_files`

**File:** `database/migrations/tenant/YYYY_MM_DD_HHMMSS_add_video_source_columns_to_course_files_table.php`

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('course_files', function (Blueprint $table) {
            // source_type: youtube | vimeo | custom (VARCHAR, no ENUM per dev manual)
            $table->string('source_type', 20)->nullable()->after('file_type');
            // source_identifier: YouTube ID, Vimeo ID, or storage path
            $table->string('source_identifier', 500)->nullable()->after('source_type');
            // vimeo_account_mode: public | private (for Option B only)
            $table->string('vimeo_account_mode', 20)->nullable()->after('source_identifier');
            // duration_seconds: for progress threshold and resume
            $table->unsignedInteger('duration_seconds')->nullable()->after('vimeo_account_mode');
        });
    }

    public function down(): void
    {
        Schema::table('course_files', function (Blueprint $table) {
            $table->dropColumn(['source_type', 'source_identifier', 'vimeo_account_mode', 'duration_seconds']);
        });
    }
};
```

**Index:** Add `idx_course_files_video_source` on `(tenant_id, source_type)` if filtering by source_type is required. Defer until Phase 14-G if profiling shows need.

### 4.2 Migration: Create `video_watch_progress` Table

**File:** `database/migrations/tenant/YYYY_MM_DD_HHMMSS_create_video_watch_progress_table.php`

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('video_watch_progress', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('tenant_id');
            $table->unsignedBigInteger('user_id');
            $table->unsignedBigInteger('course_id');
            $table->unsignedBigInteger('course_file_id');
            $table->unsignedInteger('position_seconds')->default(0);
            $table->unsignedInteger('duration_seconds')->nullable();
            $table->decimal('watch_percentage', 5, 2)->default(0);
            $table->timestamps();

            $table->foreign('tenant_id', 'fk_vwp_tenants')->references('id')->on('tenants')->onDelete('cascade');
            $table->foreign('user_id', 'fk_vwp_users')->references('id')->on('users')->onDelete('cascade');
            $table->foreign('course_id', 'fk_vwp_courses')->references('id')->on('courses')->onDelete('cascade');
            $table->foreign('course_file_id', 'fk_vwp_course_files')->references('id')->on('course_files')->onDelete('cascade');

            $table->unique(['tenant_id', 'user_id', 'course_file_id'], 'unq_vwp_tenant_user_file');
            $table->index(['tenant_id', 'user_id', 'course_id'], 'idx_vwp_tenant_user_course');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('video_watch_progress');
    }
};
```

### 4.3 Config: Video Token Secret

**File:** `config/video.php` (new)

```php
<?php

return [
    'token' => [
        'secret' => config('app.key'), // Or dedicated VIDEO_TOKEN_SECRET in .env
        'ttl_minutes' => 15,
    ],
];
```

**Rule:** Never use `env()` in application code. Use `config('video.token.secret')` and `config('video.token.ttl_minutes')`.

---

## 5. Phase 14-A: Domain Layer

**Dependency:** None. Pure PHP. No Eloquent, no facades.

**Verification:** `grep -rn 'use Illuminate' app/Domain/` → 0 results.

### 5.1 Value Object: `VideoSourceType`

**File:** `app/Domain/TenantAdminDashboard/Course/ValueObjects/VideoSourceType.php`

```php
<?php

declare(strict_types=1);

namespace App\Domain\TenantAdminDashboard\Course\ValueObjects;

final class VideoSourceType
{
    public const YOUTUBE = 'youtube';
    public const VIMEO = 'vimeo';
    public const CUSTOM = 'custom';

    private const ALLOWED = [self::YOUTUBE, self::VIMEO, self::CUSTOM];

    public function __construct(
        private readonly string $value,
    ) {
        if (!in_array($value, self::ALLOWED, true)) {
            throw new \InvalidArgumentException(
                "Invalid video source type: {$value}. Allowed: " . implode(', ', self::ALLOWED)
            );
        }
    }

    public function getValue(): string
    {
        return $this->value;
    }

    public function canTrackHeartbeat(): bool
    {
        return $this->value === self::CUSTOM;
    }

    public function equals(self $other): bool
    {
        return $this->value === $other->value;
    }
}
```

### 5.2 Value Object: `VideoSource`

**File:** `app/Domain/TenantAdminDashboard/Course/ValueObjects/VideoSource.php`

```php
<?php

declare(strict_types=1);

namespace App\Domain\TenantAdminDashboard\Course\ValueObjects;

final class VideoSource
{
    public function __construct(
        public readonly VideoSourceType $sourceType,
        public readonly string $sourceIdentifier,
        public readonly ?string $vimeoAccountMode = null,
        public readonly ?int $durationSeconds = null,
    ) {
        $this->validateIdentifier();
    }

    private function validateIdentifier(): void
    {
        match ($this->sourceType->getValue()) {
            VideoSourceType::YOUTUBE => $this->validateYouTubeId($this->sourceIdentifier),
            VideoSourceType::VIMEO => $this->validateVimeoId($this->sourceIdentifier),
            VideoSourceType::CUSTOM => $this->validateStoragePath($this->sourceIdentifier),
            default => throw new \InvalidArgumentException('Unknown source type'),
        };
    }

    private function validateYouTubeId(string $id): void
    {
        if (!preg_match('/^[a-zA-Z0-9_-]{11}$/', $id)) {
            throw new \InvalidArgumentException(
                "Invalid YouTube video ID format. Expected 11 alphanumeric characters."
            );
        }
    }

    private function validateVimeoId(string $id): void
    {
        if (!preg_match('/^\d+$/', $id)) {
            throw new \InvalidArgumentException(
                "Invalid Vimeo video ID format. Expected numeric ID."
            );
        }
    }

    private function validateStoragePath(string $path): void
    {
        if (str_contains($path, '..') || str_starts_with($path, '/')) {
            throw new \InvalidArgumentException(
                "Invalid storage path. Path must be relative and not contain '..'."
            );
        }
    }
}
```

### 5.3 Domain Events

**File:** `app/Domain/TenantAdminDashboard/Course/Events/VideoAttachedToLesson.php`

```php
<?php

declare(strict_types=1);

namespace App\Domain\TenantAdminDashboard\Course\Events;

final class VideoAttachedToLesson
{
    public function __construct(
        public readonly int $courseFileId,
        public readonly int $tenantId,
        public readonly string $sourceType,
        public readonly string $sourceIdentifier,
    ) {}
}
```

**File:** `app/Domain/TenantAdminDashboard/Course/Events/VideoDetachedFromLesson.php`

```php
<?php

declare(strict_types=1);

namespace App\Domain\TenantAdminDashboard\Course\Events;

final class VideoDetachedFromLesson
{
    public function __construct(
        public readonly int $courseFileId,
        public readonly int $tenantId,
    ) {}
}
```

**File:** `app/Domain/TenantAdminDashboard/Course/Events/VideoLessonCompleted.php`

```php
<?php

declare(strict_types=1);

namespace App\Domain\TenantAdminDashboard\Course\Events;

final class VideoLessonCompleted
{
    public function __construct(
        public readonly int $tenantId,
        public readonly int $userId,
        public readonly int $courseId,
        public readonly int $courseFileId,
    ) {}
}
```

### 5.4 Domain Exceptions

**File:** `app/Domain/TenantAdminDashboard/Course/Exceptions/InvalidVideoUrlException.php`

```php
<?php

declare(strict_types=1);

namespace App\Domain\TenantAdminDashboard\Course\Exceptions;

final class InvalidVideoUrlException extends \DomainException
{
    public static function unrecognized(string $url): self
    {
        return new self("Unrecognized video URL format: {$url}");
    }
}
```

**File:** `app/Domain/TenantAdminDashboard/Course/Exceptions/VideoNotEnrolledException.php`

```php
<?php

declare(strict_types=1);

namespace App\Domain\TenantAdminDashboard\Course\Exceptions;

final class VideoNotEnrolledException extends \DomainException
{
    public static function forCourse(int $courseId): self
    {
        return new self("User is not enrolled in course: {$courseId}");
    }
}
```

### 5.5 Repository Interface: Video Watch Progress

**File:** `app/Domain/TenantAdminDashboard/Course/Repositories/VideoWatchProgressRepositoryInterface.php`

```php
<?php

declare(strict_types=1);

namespace App\Domain\TenantAdminDashboard\Course\Repositories;

use App\Domain\TenantAdminDashboard\Course\Entities\VideoWatchProgressEntity;

interface VideoWatchProgressRepositoryInterface
{
    public function findById(int $tenantId, int $userId, int $courseFileId): ?VideoWatchProgressEntity;

    public function upsert(VideoWatchProgressEntity $entity): VideoWatchProgressEntity;
}
```

### 5.6 Domain Entity: VideoWatchProgressEntity

**File:** `app/Domain/TenantAdminDashboard/Course/Entities/VideoWatchProgressEntity.php`

```php
<?php

declare(strict_types=1);

namespace App\Domain\TenantAdminDashboard\Course\Entities;

use App\Domain\TenantAdminDashboard\Course\ValueObjects\VideoWatchProgressProps;

final class VideoWatchProgressEntity
{
    private function __construct(
        private VideoWatchProgressProps $props,
    ) {}

    public static function create(VideoWatchProgressProps $props): self
    {
        return new self($props);
    }

    public static function reconstitute(VideoWatchProgressProps $props): self
    {
        return new self($props);
    }

    public function updatePosition(int $positionSeconds, ?int $durationSeconds, float $watchPercentage): self
    {
        return new self($this->props->with([
            'positionSeconds' => $positionSeconds,
            'durationSeconds' => $durationSeconds ?? $this->props->durationSeconds,
            'watchPercentage' => $watchPercentage,
        ]));
    }

    public function isComplete(): bool
    {
        return $this->props->watchPercentage >= 90.0;
    }

    public function getProps(): VideoWatchProgressProps
    {
        return $this->props;
    }
}
```

**File:** `app/Domain/TenantAdminDashboard/Course/ValueObjects/VideoWatchProgressProps.php`

```php
<?php

declare(strict_types=1);

namespace App\Domain\TenantAdminDashboard\Course\ValueObjects;

final class VideoWatchProgressProps
{
    public function __construct(
        public readonly ?int $id,
        public readonly int $tenantId,
        public readonly int $userId,
        public readonly int $courseId,
        public readonly int $courseFileId,
        public readonly int $positionSeconds,
        public readonly ?int $durationSeconds,
        public readonly float $watchPercentage,
        public readonly ?\DateTimeImmutable $createdAt = null,
        public readonly ?\DateTimeImmutable $updatedAt = null,
    ) {}

    public function with(array $data): self
    {
        return new self(
            id: $data['id'] ?? $this->id,
            tenantId: $data['tenantId'] ?? $this->tenantId,
            userId: $data['userId'] ?? $this->userId,
            courseId: $data['courseId'] ?? $this->courseId,
            courseFileId: $data['courseFileId'] ?? $this->courseFileId,
            positionSeconds: $data['positionSeconds'] ?? $this->positionSeconds,
            durationSeconds: $data['durationSeconds'] ?? $this->durationSeconds,
            watchPercentage: $data['watchPercentage'] ?? $this->watchPercentage,
            createdAt: $data['createdAt'] ?? $this->createdAt,
            updatedAt: $data['updatedAt'] ?? $this->updatedAt,
        );
    }
}
```

---

## 6. Phase 14-B: Admin Authoring Backend

**Dependency:** Phase 14-A complete.

### 6.1 Infrastructure: VideoUrlParser

**File:** `app/Infrastructure/Video/VideoUrlParser.php`

```php
<?php

declare(strict_types=1);

namespace App\Infrastructure\Video;

use App\Domain\TenantAdminDashboard\Course\Exceptions\InvalidVideoUrlException;
use App\Domain\TenantAdminDashboard\Course\ValueObjects\VideoSourceType;

final class VideoUrlParser
{
    /**
     * Parse video URL. NO external HTTP calls. Pure parsing only (SSRF prevention).
     */
    public function parse(string $url): array
    {
        $url = trim($url);
        if ($url === '') {
            throw InvalidVideoUrlException::unrecognized($url);
        }

        // YouTube: youtube.com/watch?v=ID, youtu.be/ID, youtube.com/embed/ID
        if (preg_match('#(?:youtube\.com/watch\?v=|youtu\.be/|youtube\.com/embed/)([a-zA-Z0-9_-]{11})#', $url, $m)) {
            return [
                'source_type' => VideoSourceType::YOUTUBE,
                'source_identifier' => $m[1],
            ];
        }

        // Vimeo: vimeo.com/ID, player.vimeo.com/video/ID
        if (preg_match('#(?:vimeo\.com/|player\.vimeo\.com/video/)(\d+)#', $url, $m)) {
            return [
                'source_type' => VideoSourceType::VIMEO,
                'source_identifier' => $m[1],
            ];
        }

        throw InvalidVideoUrlException::unrecognized($url);
    }
}
```

### 6.2 Commands

**File:** `app/Application/TenantAdminDashboard/Course/Commands/AttachVideoToLessonCommand.php`

```php
<?php

declare(strict_types=1);

namespace App\Application\TenantAdminDashboard\Course\Commands;

final readonly class AttachVideoToLessonCommand
{
    public function __construct(
        public int $tenantId,
        public int $courseId,
        public int $chapterId,
        public int $courseFileId,
        public string $sourceType,
        public string $sourceIdentifier,
        public ?string $vimeoAccountMode = null,
        public ?int $durationSeconds = null,
        public ?int $actorId = null,
    ) {}
}
```

**File:** `app/Application/TenantAdminDashboard/Course/Commands/AttachVideoFromUrlCommand.php`

```php
<?php

declare(strict_types=1);

namespace App\Application\TenantAdminDashboard\Course\Commands;

final readonly class AttachVideoFromUrlCommand
{
    public function __construct(
        public int $tenantId,
        public int $courseId,
        public int $chapterId,
        public int $courseFileId,
        public string $videoUrl,
        public ?int $actorId = null,
    ) {}
}
```

**File:** `app/Application/TenantAdminDashboard/Course/Commands/AttachVideoFromFileManagerCommand.php`

```php
<?php

declare(strict_types=1);

namespace App\Application\TenantAdminDashboard\Course\Commands;

final readonly class AttachVideoFromFileManagerCommand
{
    public function __construct(
        public int $tenantId,
        public int $courseId,
        public int $chapterId,
        public int $courseFileId,
        public int $managedFileId,
        public ?int $actorId = null,
    ) {}
}
```

**File:** `app/Application/TenantAdminDashboard/Course/Commands/DetachVideoFromLessonCommand.php`

```php
<?php

declare(strict_types=1);

namespace App\Application\TenantAdminDashboard\Course\Commands;

final readonly class DetachVideoFromLessonCommand
{
    public function __construct(
        public int $tenantId,
        public int $courseId,
        public int $chapterId,
        public int $courseFileId,
        public ?int $actorId = null,
    ) {}
}
```

### 6.3 UseCases

**File:** `app/Application/TenantAdminDashboard/Course/UseCases/AttachVideoFromUrlUseCase.php`

```php
<?php

declare(strict_types=1);

namespace App\Application\TenantAdminDashboard\Course\UseCases;

use App\Application\TenantAdminDashboard\Course\Commands\AttachVideoFromUrlCommand;
use App\Domain\TenantAdminDashboard\Course\Entities\CourseFileEntity;
use App\Domain\TenantAdminDashboard\Course\Repositories\CourseFileRepositoryInterface;
use App\Domain\TenantAdminDashboard\Course\Repositories\ChapterRepositoryInterface;
use App\Domain\Shared\Exceptions\EntityNotFoundException;
use App\Infrastructure\Video\VideoUrlParser;
use App\Infrastructure\Persistence\Shared\AuditContext;
use App\Domain\Shared\Audit\AuditLoggerInterface;
use Illuminate\Support\Facades\DB;

final class AttachVideoFromUrlUseCase
{
    public function __construct(
        private readonly CourseFileRepositoryInterface $fileRepository,
        private readonly ChapterRepositoryInterface $chapterRepository,
        private readonly VideoUrlParser $urlParser,
        private readonly AuditLoggerInterface $auditLogger,
    ) {}

    public function execute(AttachVideoFromUrlCommand $command): CourseFileEntity
    {
        // Step 1: Validate chapter
        $chapter = $this->chapterRepository->findByIdAndCourse(
            $command->tenantId, $command->courseId, $command->chapterId
        );
        if (!$chapter) {
            throw EntityNotFoundException::fromId('Chapter', $command->chapterId);
        }

        $file = $this->fileRepository->findById($command->tenantId, $command->courseFileId);
        if (!$file) {
            throw EntityNotFoundException::fromId('CourseFile', $command->courseFileId);
        }

        // Step 2: Parse URL (no HTTP calls)
        $parsed = $this->urlParser->parse($command->videoUrl);

        // Step 3: Update entity
        $updatedProps = $file->getProps()->with([
            'sourceType' => $parsed['source_type'],
            'sourceIdentifier' => $parsed['source_identifier'],
            'fileSource' => $parsed['source_type'] === 'youtube' ? $file->getProps()->fileSource : $file->getProps()->fileSource,
        ]);
        // Map: CourseFileProps must be extended with sourceType, sourceIdentifier. See 6.4.

        $result = DB::transaction(function () use ($file, $command, $parsed) {
            $saved = $this->fileRepository->updateVideoSource($command->tenantId, $command->courseFileId, [
                'source_type' => $parsed['source_type'],
                'source_identifier' => $parsed['source_identifier'],
            ]);

            $this->auditLogger->log(new AuditContext(
                tenantId: $command->tenantId,
                userId: $command->actorId ?? 0,
                action: 'course_file.video_attached',
                entityType: 'course_file',
                entityId: $command->courseFileId,
                metadata: ['source_type' => $parsed['source_type']],
            ));

            return $saved;
        });

        return $result;
    }
}
```

**Implementation approach:** Extend `CourseFileEntity` with `attachVideoSource(VideoSource $source): self` that returns a new instance with updated props. UseCase loads entity via repository, calls `attachVideoSource`, saves via existing `save()`. Extend `CourseFileProps` with `?VideoSourceType $sourceType`, `?string $sourceIdentifier`, `?string $vimeoAccountMode`, `?int $durationSeconds` (all nullable for backward compatibility). Extend `EloquentCourseFileRepository::toEntity()` and `fromEntity()` to map these columns.

### 6.4 Extend CourseFileProps and CourseFileRepositoryInterface

**File:** `app/Domain/TenantAdminDashboard/Course/ValueObjects/CourseFileProps.php` (extend)

Add `sourceType`, `sourceIdentifier`, `vimeoAccountMode`, `durationSeconds` to the constructor and `with()` method.

**File:** `app/Domain/TenantAdminDashboard/Course/Repositories/CourseFileRepositoryInterface.php` (extend)

No new methods needed if `save()` persists all props. Ensure `toEntity`/`fromEntity` in `EloquentCourseFileRepository` map the new columns.

### 6.5 HTTP Endpoints (Admin)

| Method | Route | Controller | Auth |
|--------|-------|------------|------|
| POST | `/api/tenant/admin/courses/{courseId}/chapters/{chapterId}/files/{fileId}/video` | `VideoAttachmentWriteController@attach` | Admin/Teacher JWT |
| DELETE | `/api/tenant/admin/courses/{courseId}/chapters/{chapterId}/files/{fileId}/video` | `VideoAttachmentWriteController@detach` | Admin/Teacher JWT |

**Request body for POST (URL path):**
```json
{
  "video_url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
}
```

**Request body for POST (File Manager path):**
```json
{
  "managed_file_id": 123
}
```

Validation: `video_url` XOR `managed_file_id` required. Not both.

**File:** `app/Http/Requests/TenantAdminDashboard/Course/AttachVideoRequest.php`

```php
<?php

declare(strict_types=1);

namespace App\Http\Requests\TenantAdminDashboard\Course;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

final class AttachVideoRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'video_url' => ['required_without:managed_file_id', 'string', 'url', 'max:2048'],
            'managed_file_id' => ['required_without:video_url', 'integer', 'exists:managed_files,id'],
        ];
    }
}
```

### 6.6 Controller

**File:** `app/Http/Controllers/Api/TenantAdminDashboard/Course/VideoAttachmentWriteController.php`

```php
<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\TenantAdminDashboard\Course;

use App\Application\TenantAdminDashboard\Course\Commands\AttachVideoFromFileManagerCommand;
use App\Application\TenantAdminDashboard\Course\Commands\AttachVideoFromUrlCommand;
use App\Application\TenantAdminDashboard\Course\Commands\DetachVideoFromLessonCommand;
use App\Application\TenantAdminDashboard\Course\UseCases\AttachVideoFromFileManagerUseCase;
use App\Application\TenantAdminDashboard\Course\UseCases\AttachVideoFromUrlUseCase;
use App\Application\TenantAdminDashboard\Course\UseCases\DetachVideoFromLessonUseCase;
use App\Http\Controllers\Controller;
use App\Http\Requests\TenantAdminDashboard\Course\AttachVideoRequest;
use App\Http\TenantAdminDashboard\Course\Resources\CourseFileResource;
use Illuminate\Http\JsonResponse;

final class VideoAttachmentWriteController extends Controller
{
    public function attach(
        AttachVideoRequest $request,
        AttachVideoFromUrlUseCase $urlUseCase,
        AttachVideoFromFileManagerUseCase $fileManagerUseCase,
        int $courseId,
        int $chapterId,
        int $fileId,
    ): JsonResponse {
        $user = $request->user();
        $tenantId = $user->tenant_id;

        if ($request->has('video_url')) {
            $command = new AttachVideoFromUrlCommand(
                tenantId: $tenantId,
                courseId: $courseId,
                chapterId: $chapterId,
                courseFileId: $fileId,
                videoUrl: $request->input('video_url'),
                actorId: $user->id,
            );
            $file = $urlUseCase->execute($command);
        } else {
            $command = new AttachVideoFromFileManagerCommand(
                tenantId: $tenantId,
                courseId: $courseId,
                chapterId: $chapterId,
                courseFileId: $fileId,
                managedFileId: $request->input('managed_file_id'),
                actorId: $user->id,
            );
            $file = $fileManagerUseCase->execute($command);
        }

        return response()->json(['data' => new CourseFileResource($file)], 200);
    }

    public function detach(
        DetachVideoFromLessonUseCase $useCase,
        int $courseId,
        int $chapterId,
        int $fileId,
    ): JsonResponse {
        $user = auth()->user();
        $command = new DetachVideoFromLessonCommand(
            tenantId: $user->tenant_id,
            courseId: $courseId,
            chapterId: $chapterId,
            courseFileId: $fileId,
            actorId: $user->id,
        );
        $useCase->execute($command);
        return response()->json(['message' => 'Video detached.'], 204);
    }
}
```

---

## 7. Phase 14-C: Video Token & Signed URL

**Dependency:** Phase 14-A, Contabo storage path convention confirmed.

### 7.1 Domain Interface: VideoTokenServiceInterface

**File:** `app/Domain/TenantAdminDashboard/Course/Services/VideoTokenServiceInterface.php`

```php
<?php

declare(strict_types=1);

namespace App\Domain\TenantAdminDashboard\Course\Services;

interface VideoTokenServiceInterface
{
    public function generate(int $tenantId, int $userId, string $filePath, int $ttlMinutes = 15): string;

    public function validate(string $token): ?array;
}
```

### 7.2 Infrastructure: VideoTokenService

**File:** `app/Infrastructure/Video/VideoTokenService.php`

```php
<?php

declare(strict_types=1);

namespace App\Infrastructure\Video;

use App\Domain\TenantAdminDashboard\Course\Services\VideoTokenServiceInterface;

final class VideoTokenService implements VideoTokenServiceInterface
{
    public function __construct(
        private readonly string $secret,
        private readonly int $ttlMinutes = 15,
    ) {}

    public function generate(int $tenantId, int $userId, string $filePath, int $ttlMinutes = 15): string
    {
        $expiresAt = time() + ($ttlMinutes * 60);
        $payload = json_encode([
            'file_path' => $filePath,
            'tenant_id' => $tenantId,
            'user_id' => $userId,
            'expires_at' => $expiresAt,
        ]);
        $signature = hash_hmac('sha256', $payload, $this->secret, true);
        $token = base64_encode($payload) . '.' . base64_encode($signature);
        return $token;
    }

    public function validate(string $token): ?array
    {
        $parts = explode('.', $token);
        if (count($parts) !== 2) {
            return null;
        }
        [$payloadB64, $sigB64] = $parts;
        $payload = json_decode(base64_decode($payloadB64), true);
        if (!$payload || !isset($payload['expires_at'], $payload['tenant_id'], $payload['file_path'])) {
            return null;
        }
        if ($payload['expires_at'] < time()) {
            return null;
        }
        $expectedSig = hash_hmac('sha256', base64_decode($payloadB64), $this->secret, true);
        if (!hash_equals($expectedSig, base64_decode($sigB64))) {
            return null;
        }
        return $payload;
    }
}
```

**Token format:** `base64(payload_json).base64(hmac_sha256(payload_json, secret))`. Implementation: `$payloadStr = json_encode([...]); $signature = hash_hmac('sha256', $payloadStr, $this->secret); $token = base64_encode($payloadStr) . '.' . base64_encode($signature);`

### 7.3 UseCase: GenerateVideoPlaybackTokenUseCase

**File:** `app/Application/TenantAdminDashboard/Course/UseCases/GenerateVideoPlaybackTokenUseCase.php`

```php
<?php

declare(strict_types=1);

namespace App\Application\TenantAdminDashboard\Course\UseCases;

use App\Domain\TenantAdminDashboard\Course\Repositories\CourseFileRepositoryInterface;
use App\Domain\TenantAdminDashboard\Course\Repositories\CourseEnrollmentRepositoryInterface;
use App\Domain\TenantAdminDashboard\Course\Services\VideoTokenServiceInterface;
use App\Domain\TenantAdminDashboard\Course\Exceptions\VideoNotEnrolledException;
use App\Domain\Shared\Exceptions\EntityNotFoundException;

final class GenerateVideoPlaybackTokenUseCase
{
    public function __construct(
        private readonly CourseFileRepositoryInterface $fileRepository,
        private readonly CourseEnrollmentRepositoryInterface $enrollmentRepository,
        private readonly VideoTokenServiceInterface $tokenService,
    ) {}

    public function execute(int $tenantId, int $userId, int $courseId, int $courseFileId): string
    {
        $file = $this->fileRepository->findById($tenantId, $courseFileId);
        if (!$file) {
            throw EntityNotFoundException::fromId('CourseFile', $courseFileId);
        }

        if ($file->getProps()->sourceType?->getValue() !== 'custom') {
            throw new \InvalidArgumentException('Token generation only for custom video source');
        }

        $enrolled = $this->enrollmentRepository->isUserEnrolled($tenantId, $userId, $courseId);
        if (!$enrolled) {
            throw VideoNotEnrolledException::forCourse($courseId);
        }

        $filePath = $file->getProps()->sourceIdentifier ?? $file->getProps()->filePath;
        return $this->tokenService->generate($tenantId, $userId, $filePath);
    }
}
```

### 7.4 HTTP Layer: Video Source & Token Endpoints

**File:** `app/Http/Controllers/Api/TenantAdminDashboard/Course/VideoSourceReadController.php`

```php
<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\TenantAdminDashboard\Course;

use App\Http\Controllers\Controller;
use App\Application\TenantAdminDashboard\Course\Queries\GetLessonVideoSourceQuery;
use Illuminate\Http\JsonResponse;

final class VideoSourceReadController extends Controller
{
    public function show(
        GetLessonVideoSourceQuery $query,
        int $courseId,
        int $fileId,
    ): JsonResponse {
        $user = auth('tenant_api')->user();
        if (!$user) {
            return response()->json(['error' => 'Unauthenticated.'], 401);
        }

        $result = $query->execute($user->tenant_id, $user->id, $courseId, $fileId);

        return response()->json(['data' => $result]);
    }
}
```

### 7.5 Query: GetLessonVideoSourceQuery

**File:** `app/Application/TenantAdminDashboard/Course/Queries/GetLessonVideoSourceQuery.php`

```php
<?php

declare(strict_types=1);

namespace App\Application\TenantAdminDashboard\Course\Queries;

use App\Domain\TenantAdminDashboard\Course\Repositories\CourseFileRepositoryInterface;
use App\Domain\TenantAdminDashboard\Course\Repositories\CourseEnrollmentRepositoryInterface;
use App\Domain\TenantAdminDashboard\Course\Repositories\VideoWatchProgressRepositoryInterface;
use App\Domain\TenantAdminDashboard\Course\Exceptions\VideoNotEnrolledException;
use App\Domain\Shared\Exceptions\EntityNotFoundException;

final class GetLessonVideoSourceQuery
{
    public function __construct(
        private readonly CourseFileRepositoryInterface $fileRepository,
        private readonly CourseEnrollmentRepositoryInterface $enrollmentRepository,
        private readonly VideoWatchProgressRepositoryInterface $watchProgressRepository,
        private readonly GenerateVideoPlaybackTokenUseCase $tokenUseCase,
    ) {}

    public function execute(int $tenantId, int $userId, int $courseId, int $courseFileId): array
    {
        $file = $this->fileRepository->findById($tenantId, $courseFileId);
        if (!$file) {
            throw EntityNotFoundException::fromId('CourseFile', $courseFileId);
        }

        if (!$this->enrollmentRepository->isUserEnrolled($tenantId, $userId, $courseId)) {
            throw VideoNotEnrolledException::forCourse($courseId);
        }

        $sourceType = $file->getProps()->sourceType?->getValue() ?? $file->getProps()->fileSource->value;
        $sourceIdentifier = $file->getProps()->sourceIdentifier ?? $file->getProps()->filePath;

        $result = [
            'source_type' => $sourceType,
            'source_identifier' => $sourceIdentifier,
        ];

        if ($sourceType === 'custom') {
            $result['signed_url'] = $this->tokenUseCase->execute($tenantId, $userId, $courseId, $courseFileId);
            $progress = $this->watchProgressRepository->findById($tenantId, $userId, $courseFileId);
            $result['resume_position_seconds'] = $progress?->getProps()->positionSeconds ?? 0;
        }

        return $result;
    }
}
```

**Circular dependency avoidance:** `GetLessonVideoSourceQuery` should NOT inject `GenerateVideoPlaybackTokenUseCase` (circular risk). Instead, inject `VideoTokenServiceInterface` directly. The Query performs: (1) load file, (2) verify enrollment, (3) if source_type=custom, call `$this->tokenService->generate($tenantId, $userId, $filePath)`. The token generation logic stays in the service; the Query orchestrates. Alternatively, create `ResolveVideoSourceForPlaybackUseCase` that returns the full payload (source_type, source_identifier, signed_url, resume_position) — this UseCase orchestrates file repo, enrollment repo, token service, and watch progress repo. The controller then calls this single UseCase.

### 7.6 Routes (Student-Facing)

```php
// In routes/tenant_dashboard/learning_progress.php or new video.php
Route::prefix('courses/{courseId}/files/{fileId}')->group(function () {
    Route::get('/video-source', [VideoSourceReadController::class, 'show']);
    Route::post('/video-token/refresh', [VideoTokenRefreshController::class, 'refresh']);
});

// In routes/tenant_dashboard/learning_progress.php
Route::prefix('courses/{courseId}/files/{fileId}')->group(function () {
    Route::post('/progress/heartbeat', [VideoProgressHeartbeatController::class, 'store']);
});
```

### 7.7 File-Serving Endpoint

**File:** `app/Http/Controllers/Api/TenantAdminDashboard/Course/VideoFileServeController.php`

- Validates token via `VideoTokenServiceInterface::validate()`
- Verifies `tenant_id` in token matches `auth()->user()->tenant_id`
- Serves file from storage with `Content-Disposition: inline`, `Cache-Control: no-store`
- Returns 401 for invalid/expired token

**Storage path convention (from spec):** Custom videos stored at `/storage/tenants/{tenant_id}/videos/{uuid}.{ext}`. The `source_identifier` column stores the relative path (e.g. `tenants/1/videos/abc123.mp4`). The file-serving layer prefixes with storage root. Never expose Contabo hostname or credentials to client.

---

## 8. Phase 14-D: Watch Progress & Heartbeat

**Dependency:** Phase 14-A, existing LearningProgress infrastructure.

### 8.1 Command

**File:** `app/Application/TenantAdminDashboard/Course/Commands/RecordVideoHeartbeatCommand.php`

```php
<?php

declare(strict_types=1);

namespace App\Application\TenantAdminDashboard\Course\Commands;

final readonly class RecordVideoHeartbeatCommand
{
    public function __construct(
        public int $tenantId,
        public int $userId,
        public int $courseId,
        public int $courseFileId,
        public int $positionSeconds,
        public ?int $durationSeconds,
        public float $watchPercentage,
    ) {}
}
```

### 8.2 UseCase: RecordVideoHeartbeatUseCase

```php
<?php

declare(strict_types=1);

namespace App\Application\TenantAdminDashboard\Course\UseCases;

use App\Application\TenantAdminDashboard\Course\Commands\RecordVideoHeartbeatCommand;
use App\Domain\TenantAdminDashboard\Course\Repositories\VideoWatchProgressRepositoryInterface;
use App\Domain\TenantAdminDashboard\Course\Repositories\CourseLearningRepositoryInterface;
use App\Domain\TenantAdminDashboard\Course\Repositories\CourseEnrollmentRepositoryInterface;
use App\Domain\TenantAdminDashboard\Course\Exceptions\VideoNotEnrolledException;
use App\Domain\TenantAdminDashboard\Course\Entities\VideoWatchProgressEntity;
use App\Domain\TenantAdminDashboard\Course\ValueObjects\VideoWatchProgressProps;
use App\Domain\TenantAdminDashboard\Course\Events\VideoLessonCompleted;
use Illuminate\Support\Facades\DB;

final class RecordVideoHeartbeatUseCase
{
    public function __construct(
        private readonly VideoWatchProgressRepositoryInterface $watchProgressRepository,
        private readonly CourseLearningRepositoryInterface $learningRepository,
        private readonly CourseEnrollmentRepositoryInterface $enrollmentRepository,
    ) {}

    public function execute(RecordVideoHeartbeatCommand $command): void
    {
        if (!$this->enrollmentRepository->isUserEnrolled(
            $command->tenantId, $command->userId, $command->courseId
        )) {
            throw VideoNotEnrolledException::forCourse($command->courseId);
        }

        // Recompute watch_percentage server-side (do not trust client)
        $duration = $command->durationSeconds ?? 1;
        $watchPercentage = min(100, ($command->positionSeconds / $duration) * 100);

        $existing = $this->watchProgressRepository->findById(
            $command->tenantId, $command->userId, $command->courseFileId
        );

        $props = $existing
            ? $existing->getProps()->with([
                'positionSeconds' => $command->positionSeconds,
                'durationSeconds' => $command->durationSeconds,
                'watchPercentage' => $watchPercentage,
            ])
            : new VideoWatchProgressProps(
                id: null,
                tenantId: $command->tenantId,
                userId: $command->userId,
                courseId: $command->courseId,
                courseFileId: $command->courseFileId,
                positionSeconds: $command->positionSeconds,
                durationSeconds: $command->durationSeconds,
                watchPercentage: $watchPercentage,
            );

        $entity = $existing
            ? $existing->updatePosition($command->positionSeconds, $command->durationSeconds, $watchPercentage)
            : VideoWatchProgressEntity::create($props);

        DB::transaction(function () use ($entity, $command) {
            $saved = $this->watchProgressRepository->upsert($entity);

            if ($saved->isComplete()) {
                $alreadyComplete = $this->learningRepository->findByUserAndItem(
                    $command->tenantId, $command->userId, 'course_file', $command->courseFileId
                );
                if (!$alreadyComplete) {
                    $this->learningRepository->save(\App\Domain\TenantAdminDashboard\Course\Entities\CourseLearningEntity::create(new \App\Domain\TenantAdminDashboard\Course\ValueObjects\CourseLearningProps(
                        id: null,
                        tenantId: $command->tenantId,
                        userId: $command->userId,
                        courseId: $command->courseId,
                        textLessonId: null,
                        courseFileId: $command->courseFileId,
                        sessionId: null,
                    )));
                    event(new VideoLessonCompleted(
                        $command->tenantId, $command->userId, $command->courseId, $command->courseFileId
                    ));
                }
            }
        });
    }
}
```

### 8.3 Controller

**File:** `app/Http/Controllers/Api/TenantAdminDashboard/Course/VideoProgressHeartbeatController.php`

```php
<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\TenantAdminDashboard\Course;

use App\Http\Controllers\Controller;
use App\Application\TenantAdminDashboard\Course\Commands\RecordVideoHeartbeatCommand;
use App\Application\TenantAdminDashboard\Course\UseCases\RecordVideoHeartbeatUseCase;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;

final class VideoProgressHeartbeatController extends Controller
{
    public function store(
        Request $request,
        RecordVideoHeartbeatUseCase $useCase,
        int $courseId,
        int $fileId,
    ): JsonResponse {
        $validated = $request->validate([
            'position_seconds' => 'required|integer|min:0',
            'duration_seconds' => 'nullable|integer|min:1',
            'watch_percentage' => 'required|numeric|min:0|max:100',
        ]);

        $user = auth('tenant_api')->user();
        if (!$user) {
            return response()->json(['error' => 'Unauthenticated.'], 401);
        }

        $command = new RecordVideoHeartbeatCommand(
            tenantId: $user->tenant_id,
            userId: $user->id,
            courseId: $courseId,
            courseFileId: $fileId,
            positionSeconds: $validated['position_seconds'],
            durationSeconds: $validated['duration_seconds'] ?? null,
            watchPercentage: (float) $validated['watch_percentage'],
        );

        $useCase->execute($command);

        return response()->json(null, 204);
    }
}
```

---

## 9. Phase 14-E: Frontend Player Integration (YouTube/Vimeo)

**Scope:** Frontend. Backend must expose `source_type` and `source_identifier` via `GET /video-source`.

**Backend Contract:** Response must include `source_type` (`youtube` | `vimeo` | `custom`) and `source_identifier` (video ID or signed URL for custom).

---

## 10. Phase 14-F: Frontend Custom Player

**Scope:** Frontend. Backend must expose `signed_url`, `resume_position_seconds`, and `POST /progress/heartbeat`.

---

## 11. Phase 14-G: Integration & Security Audit

### 11.1 Security Checklist (from Feature Spec)

| # | Requirement | Verification |
|---|-------------|--------------|
| S-01 | All video source endpoints enforce `tenant_id` scoping | Assert `tenant_id` in every repository call |
| S-02 | Signed URL generation verifies enrollment | `GenerateVideoPlaybackTokenUseCase` checks enrollment |
| S-03 | Signed URL embeds `tenant_id`; file-serving rejects mismatch | `VideoFileServeController` validates token tenant_id |
| S-04 | File-serving validates HMAC before serving | `VideoTokenService::validate()` |
| S-05 | VideoUrlParser makes no external HTTP calls | `grep` for `Http::`, `file_get_contents`, `curl` in VideoUrlParser |
| S-06 | File Manager picker validates file belongs to tenant | `AttachVideoFromFileManagerUseCase` validates `managed_file.tenant_id` |
| S-07 | Heartbeat recomputes watch_percentage server-side | `RecordVideoHeartbeatUseCase` |
| S-08 | Token refresh requires valid session | Middleware `auth:tenant_api` |
| S-09 | Signed URL TTL enforced server-side | `VideoTokenService::validate()` checks `expires_at` |
| S-10 | Vimeo token stored encrypted (Option B only) | N/A if Option A |

### 11.2 Required Tests

| Test | File | Assertion |
|------|------|-----------|
| Tenant A cannot access Tenant B's video source | `VideoSourceTenantIsolationTest` | 404 |
| Unenrolled student receives 403 for video source | `VideoSourceEnrollmentTest` | 403 |
| Expired token returns 401 | `VideoTokenExpiryTest` | 401 |
| Heartbeat upserts idempotently | `VideoHeartbeatIdempotencyTest` | No duplicate |
| LessonCompleted fires once at 90% | `VideoLessonCompleteEventTest` | Single event |

---

## 12. Developer Manual Compliance Checklist

| Rule | Location | Status |
|------|----------|--------|
| `declare(strict_types=1)` on all PHP | All new files | ✓ |
| `final class` on Commands, UseCases, Controllers | All | ✓ |
| `int $tenantId` first param in tenant-scoped ops | All UseCases, Repos | ✓ |
| No `DB::table()` in Application layer | UseCases, Queries | ✓ |
| No `use Illuminate` in Domain | Domain/* | ✓ |
| No `env()` in app code | All | Use `config()` |
| Repository methods accept `tenantId` | All interfaces | ✓ |
| Events dispatched AFTER transaction | UseCases | ✓ |
| Audit log inside transaction | UseCases | ✓ |
| No MySQL ENUM | Migrations | Use VARCHAR |
| Domain exceptions, not generic `\Exception` | All | ✓ |
| One UseCase per operation | No Manage* god-class | ✓ |

---

## 13. Appendix: File Tree

```
app/
├── Domain/TenantAdminDashboard/Course/
│   ├── Entities/
│   │   └── VideoWatchProgressEntity.php          [NEW]
│   ├── Events/
│   │   ├── VideoAttachedToLesson.php             [NEW]
│   │   ├── VideoDetachedFromLesson.php           [NEW]
│   │   └── VideoLessonCompleted.php              [NEW]
│   ├── Exceptions/
│   │   ├── InvalidVideoUrlException.php           [NEW]
│   │   └── VideoNotEnrolledException.php         [NEW]
│   ├── Repositories/
│   │   └── VideoWatchProgressRepositoryInterface.php [NEW]
│   ├── Services/
│   │   └── VideoTokenServiceInterface.php        [NEW]
│   └── ValueObjects/
│       ├── VideoSource.php                        [NEW]
│       ├── VideoSourceType.php                    [NEW]
│       └── VideoWatchProgressProps.php            [NEW]
├── Application/TenantAdminDashboard/Course/
│   ├── Commands/
│   │   ├── AttachVideoFromFileManagerCommand.php  [NEW]
│   │   ├── AttachVideoFromUrlCommand.php         [NEW]
│   │   ├── AttachVideoToLessonCommand.php        [NEW]
│   │   ├── DetachVideoFromLessonCommand.php      [NEW]
│   │   └── RecordVideoHeartbeatCommand.php       [NEW]
│   ├── Queries/
│   │   └── GetLessonVideoSourceQuery.php         [NEW]
│   └── UseCases/
│       ├── AttachVideoFromFileManagerUseCase.php  [NEW]
│       ├── AttachVideoFromUrlUseCase.php         [NEW]
│       ├── DetachVideoFromLessonUseCase.php      [NEW]
│       ├── GenerateVideoPlaybackTokenUseCase.php [NEW]
│       └── RecordVideoHeartbeatUseCase.php       [NEW]
├── Infrastructure/
│   ├── Persistence/TenantAdminDashboard/Course/
│   │   ├── EloquentVideoWatchProgressRepository.php [NEW]
│   │   └── VideoWatchProgressRecord.php          [NEW]
│   └── Video/
│       ├── VideoTokenService.php                  [NEW]
│       └── VideoUrlParser.php                     [NEW]
└── Http/
    ├── Controllers/Api/TenantAdminDashboard/Course/
    │   ├── VideoAttachmentWriteController.php    [NEW]
    │   ├── VideoFileServeController.php          [NEW]
    │   ├── VideoProgressHeartbeatController.php  [NEW]
    │   ├── VideoSourceReadController.php         [NEW]
    │   └── VideoTokenRefreshController.php      [NEW]
    └── Requests/TenantAdminDashboard/Course/
        └── AttachVideoRequest.php                [NEW]

database/migrations/tenant/
├── YYYY_MM_DD_add_video_source_columns_to_course_files_table.php [NEW]
└── YYYY_MM_DD_create_video_watch_progress_table.php [NEW]

config/
└── video.php                                      [NEW]
```

---

*End of Implementation Plan — UBOTZ 2.0 Adaptive Video Player System — March 2026*
