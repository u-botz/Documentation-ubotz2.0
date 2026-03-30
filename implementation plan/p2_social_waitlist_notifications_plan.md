# Implementation Plan — P2 Features Migration
## Social Sharing Links · Notifications to Enrolled Students · Waitlist System

**Document Version:** 1.0  
**Date:** March 17, 2026  
**Status:** DRAFT — Pending Developer Assignment  
**Source Codebase:** `mentora_production`  
**Target Codebase:** `backend` (UBOTZ 2.0 DDD Architecture)  
**Mandatory Pre-reading:**  
- `backend/documentation/Ubotz 2 developer instruction manual .md`  
- `backend/documentation/Feature Migration Guide - Mentora to UBOTZ 2.md`

---

> [!IMPORTANT]
> **Read both mandatory documents IN FULL before writing a single line of code.** This plan references their rules throughout. Any code written without following those documents will be rejected at architecture review.

---

## Table of Contents

1. [Feature Overview & Current State Assessment](#1-feature-overview--current-state-assessment)
2. [Feature A: Social Sharing Links](#2-feature-a-social-sharing-links)
3. [Feature B: Notifications to Enrolled Students](#3-feature-b-notifications-to-enrolled-students)
4. [Feature C: Waitlist System — Compliance & Completion](#4-feature-c-waitlist-system--compliance--completion)
5. [Shared Cross-Cutting Concerns](#5-shared-cross-cutting-concerns)
6. [Implementation Sequence](#6-implementation-sequence)
7. [Pre-Commit Checklist](#7-pre-commit-checklist)

---

## 1. Feature Overview & Current State Assessment

### 1.1 Mentora Source Inventory

| Feature | Legacy Source Files |
|---------|-------------------|
| Social Sharing | `app/Models/Webinar.php` → `getShareLink($social)` method (line 996–1006); uses `Jorenvh\Share\ShareFacade`; generates Facebook, Twitter, WhatsApp, Telegram links |
| Notifications (General) | `app/Models/Notification.php`, `app/Models/NotificationStatus.php`, `app/Models/NotificationTemplate.php`, `app/Http/Controllers/Api/Panel/NotificationsController.php`, `app/Jobs/SendNotificationEmail.php`, `app/Jobs/SendBulkNotifications.php` |
| Notifications (Course-specific) | `app/Models/NotificationTemplate.php` → `misc` group contains `new_course_notice` template key; `course` group contains `new_comment`, `new_rating`, `new_question_in_forum` |
| Waitlist | `app/Models/Waitlist.php`, `app/Http/Controllers/Web/WaitlistController.php`, `app/Http/Controllers/Admin/WaitlistController.php`, `database/migrations/2023_02_11_144743_create_waitlists_table.php`, `database/migrations/2023_02_11_135759_add_enable_waitlist_column_to_webinars_table.php` |

### 1.2 Backend Current State

| Feature | Status | What Exists |
|---------|--------|-------------|
| **Social Sharing** | ❌ NOT STARTED | Nothing |
| **Notifications — Enrollment** | ✅ DONE | `StudentEnrolledEvent` + `SendEnrollmentNotificationUseCase` + listener registered |
| **Notifications — Waitlist joined** | ✅ DONE | `StudentJoinedWaitlistEvent` + `SendWaitlistJoinedNotificationUseCase` + listener registered |
| **Notifications — Course content/notices** | ❌ MISSING | No event, no UseCase, no listener for course content updates or instructor notices |
| **Waitlist — Core CRUD** | ✅ DONE | Domain entity, repo interface, 5 UseCases, Eloquent repo, Record model, Controller, Routes, Migration, ServiceProvider binding |
| **Waitlist — Architecture compliance** | ⚠️ GAPS | Missing Commands, missing audit logging, missing `DB::transaction()`, event dispatched inside UseCase body instead of post-commit, `SendWaitlistJoinedNotificationUseCase` wrongly implements `ShouldQueue` in Application layer |
| **Waitlist — Slot available notification** | ❌ MISSING | No `WaitlistSlotAvailableEvent`, no use case to notify waitlisted students when capacity opens |
| **Waitlist — Admin single-entry delete** | ❌ MISSING | No `DeleteWaitlistEntryUseCase` |
| **Waitlist — FormRequests** | ❌ MISSING | No `JoinWaitlistRequest`, `LeaveWaitlistRequest`, `ToggleWaitlistRequest` |

---

## 2. Feature A: Social Sharing Links

### 2.1 Mentora Behaviour Analysis

```php
// mentora_production/app/Models/Webinar.php — lines 996–1006
public function getShareLink($social)
{
    $link = ShareFacade::page($this->getUrl(), $this->title)
        ->facebook()
        ->twitter()
        ->whatsapp()
        ->telegram()
        ->getRawLinks();

    return !empty($link[$social]) ? $link[$social] : '';
}
```

**What it does:** Given a course slug and title, generates platform-specific share URLs for Facebook, Twitter, WhatsApp, and Telegram. The `getUrl()` method returns `url('/course/' . $this->slug)`.

**Business rules:**
- The sharing URL is derived from the course's public-facing URL + title
- Supported platforms: `facebook`, `twitter`, `whatsapp`, `telegram`
- This is a read-only, stateless operation — no database writes, no domain events
- The course must exist and belong to the requesting tenant

### 2.2 UBOTZ 2.0 Design Decision

Social sharing is a **pure query operation** (read-only, no mutations). It does NOT require:
- A domain entity (no business invariants to enforce)
- Domain events (nothing happened)
- Audit logging (no state changed)
- `DB::transaction()` (no writes)

It requires:
- An Application **Query** class
- A **domain interface** for the URL generation service (so Application layer doesn't call Laravel facades directly)
- An **Infrastructure implementation** of that interface (which uses `Jorenvh\Share\ShareFacade` or equivalent URL construction)
- A thin **ReadController**
- A **Route**

### 2.3 Files to Create

#### Phase 2 — Domain Layer

**File 1: Value Object — `SocialPlatform`**  
`app/Domain/TenantAdminDashboard/Course/ValueObjects/SocialPlatform.php`

```php
<?php

declare(strict_types=1);

namespace App\Domain\TenantAdminDashboard\Course\ValueObjects;

final class SocialPlatform
{
    public const FACEBOOK  = 'facebook';
    public const TWITTER   = 'twitter';
    public const WHATSAPP  = 'whatsapp';
    public const TELEGRAM  = 'telegram';

    private const ALLOWED = [
        self::FACEBOOK,
        self::TWITTER,
        self::WHATSAPP,
        self::TELEGRAM,
    ];

    public function __construct(
        private readonly string $value,
    ) {
        if (!in_array($value, self::ALLOWED, true)) {
            throw new \InvalidArgumentException(
                "Invalid social platform: {$value}. Allowed: " . implode(', ', self::ALLOWED)
            );
        }
    }

    public function getValue(): string
    {
        return $this->value;
    }

    /** @return string[] */
    public static function allValues(): array
    {
        return self::ALLOWED;
    }
}
```

**File 2: Domain Service Interface — `CourseShareLinkGeneratorInterface`**  
`app/Domain/TenantAdminDashboard/Course/Services/CourseShareLinkGeneratorInterface.php`

```php
<?php

declare(strict_types=1);

namespace App\Domain\TenantAdminDashboard\Course\Services;

interface CourseShareLinkGeneratorInterface
{
    /**
     * Generate share links for all supported social platforms.
     *
     * @param string $courseUrl  The public-facing course URL
     * @param string $courseTitle
     * @return array<string, string>  Platform => URL map, e.g. ['facebook' => 'https://...']
     */
    public function generateAll(string $courseUrl, string $courseTitle): array;
}
```

> **Why an interface in Domain?** The Application layer (Query) must not import `ShareFacade` or any Laravel/Composer facade — that would be an infrastructure leak. The interface lives in Domain; the implementation (which can use any URL-building library or manual string concatenation) lives in Infrastructure.

#### Phase 3 — Application Layer

**File 3: Query — `GetCourseShareLinksQuery`**  
`app/Application/TenantAdminDashboard/Course/Queries/GetCourseShareLinksQuery.php`

```php
<?php

declare(strict_types=1);

namespace App\Application\TenantAdminDashboard\Course\Queries;

use App\Domain\TenantAdminDashboard\Course\Repositories\CourseRepositoryInterface;
use App\Domain\TenantAdminDashboard\Course\Services\CourseShareLinkGeneratorInterface;
use App\Domain\TenantAdminDashboard\Course\Exceptions\CourseNotFoundException;

final class GetCourseShareLinksQuery
{
    public function __construct(
        private readonly CourseRepositoryInterface $courseRepository,
        private readonly CourseShareLinkGeneratorInterface $linkGenerator,
    ) {}

    /**
     * @return array<string, string>  e.g. ['facebook' => 'https://...', 'twitter' => '...']
     */
    public function execute(int $tenantId, int $courseId): array
    {
        $course = $this->courseRepository->findById($tenantId, $courseId);

        if ($course === null) {
            throw CourseNotFoundException::withId($courseId);
        }

        // Build public course URL using the tenant's domain or the platform URL
        // The URL format should be determined by the tenant's configured domain
        $courseUrl = config('app.url') . '/courses/' . $course->slug->getValue();

        return $this->linkGenerator->generateAll($courseUrl, $course->title);
    }
}
```

#### Phase 4 — Infrastructure Layer

**File 4: Infrastructure Implementation — `SocialShareLinkGenerator`**  
`app/Infrastructure/Shared/Course/SocialShareLinkGenerator.php`

```php
<?php

declare(strict_types=1);

namespace App\Infrastructure\Shared\Course;

use App\Domain\TenantAdminDashboard\Course\Services\CourseShareLinkGeneratorInterface;

final class SocialShareLinkGenerator implements CourseShareLinkGeneratorInterface
{
    public function generateAll(string $courseUrl, string $courseTitle): array
    {
        $encodedUrl   = urlencode($courseUrl);
        $encodedTitle = urlencode($courseTitle);

        return [
            'facebook'  => "https://www.facebook.com/sharer/sharer.php?u={$encodedUrl}",
            'twitter'   => "https://twitter.com/intent/tweet?url={$encodedUrl}&text={$encodedTitle}",
            'whatsapp'  => "https://wa.me/?text={$encodedTitle}%20{$encodedUrl}",
            'telegram'  => "https://t.me/share/url?url={$encodedUrl}&text={$encodedTitle}",
        ];
    }
}
```

> **Note:** This implementation uses direct URL construction instead of the Mentora `Jorenvh\Share` package. This removes a legacy dependency and keeps the implementation transparent and testable. The URL patterns match the official platform share endpoints.

**File 5: Register Binding in `CourseServiceProvider`**  
Add to `app/Providers/CourseServiceProvider.php`:

```php
// In register() method:
$this->app->bind(
    \App\Domain\TenantAdminDashboard\Course\Services\CourseShareLinkGeneratorInterface::class,
    \App\Infrastructure\Shared\Course\SocialShareLinkGenerator::class
);
```

#### Phase 5 — HTTP Layer

**File 6: Controller — `CourseShareReadController`**  
`app/Http/TenantAdminDashboard/Course/Controllers/CourseShareReadController.php`

```php
<?php

declare(strict_types=1);

namespace App\Http\TenantAdminDashboard\Course\Controllers;

use App\Application\TenantAdminDashboard\Course\Queries\GetCourseShareLinksQuery;
use App\Http\Controllers\Controller;
use App\Infrastructure\Tenant\TenantContext;
use Illuminate\Http\JsonResponse;

final class CourseShareReadController extends Controller
{
    public function __construct(
        private readonly TenantContext $tenantContext,
    ) {}

    public function shareLinks(
        int $courseId,
        GetCourseShareLinksQuery $query,
    ): JsonResponse {
        $tenantId = $this->tenantContext->getIdOrFail();

        $links = $query->execute($tenantId, $courseId);

        return response()->json([
            'data'   => $links,
            'meta'   => [],
            'errors' => [],
        ]);
    }
}
```

**File 7: Add Route to `routes/tenant_dashboard/course.php`**

Add inside the `Route::prefix('courses')` group, under the read routes middleware:

```php
// Share Links
Route::get('/{courseId}/share-links', [
    \App\Http\TenantAdminDashboard\Course\Controllers\CourseShareReadController::class,
    'shareLinks',
])->middleware('tenant.capability:course.view');
```

### 2.4 Exception Handling

`CourseNotFoundException` already exists at:  
`app/Domain/TenantAdminDashboard/Course/Exceptions/CourseNotFoundException.php`

Verify it has a `withId(int $courseId): self` static factory. If not, add it.

### 2.5 Tests to Write

**File 8: Feature Test**  
`tests/Feature/TenantDashboard/Course/CourseShareLinksTest.php`

Test cases:
- `returns_share_links_for_published_course` — authenticated as tenant admin, GET `/{courseId}/share-links`, assert 200, assert all four platforms present
- `returns_404_for_course_not_belonging_to_tenant` — Tenant A's user requests Tenant B's course ID, assert 404 (NOT 403)
- `returns_404_for_nonexistent_course` — invalid course ID, assert 404
- `share_links_contain_valid_urls` — assert each link starts with `https://`

### 2.6 Architecture Checklist

```
□ SocialPlatform VO: pure PHP, no Illuminate imports
□ CourseShareLinkGeneratorInterface: lives in Domain/Services/, pure PHP
□ SocialShareLinkGenerator: lives in Infrastructure/Shared/, only URL string ops
□ GetCourseShareLinksQuery: no DB::table(), no facades, uses repo interface
□ Controller: < 20 lines, delegates to Query, returns JSON
□ No audit log needed (read-only operation)
□ No domain event needed (no state mutation)
□ CourseServiceProvider binding registered
□ Route under tenant.capability:course.view middleware
```

---

## 3. Feature B: Notifications to Enrolled Students

### 3.1 Mentora Behaviour Analysis

In Mentora, enrolled student notifications are driven by `NotificationTemplate`. Relevant templates for this feature:

| Template Key | Group | Triggered When |
|---|---|---|
| `new_course_notice` | `misc` | Instructor posts a noticeboard notice to a course |
| `course_created` | `course` | Course is created (admin notification) |
| `new_comment` | `course` | New comment on course |
| `new_rating` | `course` | New review/rating on course |
| `new_question_in_forum` | `course` | New forum topic |
| `new_answer_in_forum` | `course` | New answer in forum |
| `webinar_reminder` | `reminders` | Upcoming session reminder |

The key missing notification in UBOTZ 2.0 is `new_course_notice` — when an instructor posts a noticeboard announcement, **all enrolled students should receive an in-app notification and email**.

The other scenario is **session rescheduled** — when a live session's date/time changes, enrolled students need to be notified.

### 3.2 What's Already Implemented

| Notification Type | Status | Implementation |
|---|---|---|
| Student enrolled (welcome) | ✅ DONE | `StudentEnrolledEvent` + `SendEnrollmentNotificationUseCase` + listener |
| Student joined waitlist | ✅ DONE | `StudentJoinedWaitlistEvent` + `SendWaitlistJoinedNotificationUseCase` + listener |
| Waitlist slot available | ❌ MISSING | See Feature C section |

### 3.3 What Needs to Be Built

Two new notification pathways:

**Pathway 1: Course Noticeboard Posted → Notify All Enrolled Students**  
When an instructor creates a `CourseNoticeboard` entry, all students currently enrolled in that course should receive a notification.

**Pathway 2: Live Session Rescheduled → Notify All Enrolled Students**  
When a live session's `date`/`duration` is updated, enrolled students should receive a rescheduled notification.

### 3.4 Dependency: Enrolled Users Query

Both notification pathways require fetching all enrolled user IDs for a course. Check whether `CourseEnrollmentRepositoryInterface` already exposes this method:

```php
// app/Domain/TenantAdminDashboard/Course/Repositories/CourseEnrollmentRepositoryInterface.php
// Check for: findAllActiveEnrollmentsByCoursId(int $tenantId, int $courseId): array
```

If this method does not exist, it must be added as described in Step 3.4.1 below.

---

### 3.5 Pathway 1: Course Noticeboard Posted Notification

#### Phase 2 — Domain Layer

**File 1: Domain Event — `CourseNoticeboardPosted`**  
`app/Domain/TenantAdminDashboard/Course/Events/CourseNoticeboardPosted.php`

```php
<?php

declare(strict_types=1);

namespace App\Domain\TenantAdminDashboard\Course\Events;

final class CourseNoticeboardPosted
{
    public function __construct(
        public readonly int    $tenantId,
        public readonly int    $courseId,
        public readonly int    $noticeboardId,
        public readonly string $courseTitle,
        public readonly string $noticeTitle,
        public readonly string $noticeMessage,
        public readonly int    $authorId,
        public readonly \DateTimeImmutable $occurredAt = new \DateTimeImmutable(),
    ) {}
}
```

> This event must be fired by the `CreateCourseNoticeboardUseCase` AFTER the `DB::transaction()` commits. Locate the existing noticeboard UseCase and add `event(new CourseNoticeboardPosted(...))` after the transaction block.

**File 2: Extend `NotificationType` Value Object**  
`app/Domain/TenantAdminDashboard/Notification/ValueObjects/NotificationType.php`

Add new allowed type constants and factory methods:

```php
// Add to ALLOWED_TYPES array:
'course_notice',
'session_rescheduled',

// Add factory methods:
public static function courseNotice(): self
{
    return new self('course_notice');
}

public static function sessionRescheduled(): self
{
    return new self('session_rescheduled');
}
```

**File 3: Add `findAllActiveByCoursId` to enrollment repository interface (if missing)**  
`app/Domain/TenantAdminDashboard/Course/Repositories/CourseEnrollmentRepositoryInterface.php`

```php
// Add method:
/**
 * Returns all user IDs with active enrollment for a given course.
 * @return int[]
 */
public function findAllActiveUserIdsByCourseId(int $tenantId, int $courseId): array;
```

If this method already exists with a similar signature, use it directly without modifying the interface.

#### Phase 3 — Application Layer

**File 4: UseCase — `NotifyEnrolledStudentsOnCourseNoticeUseCase`**  
`app/Application/TenantAdminDashboard/Notification/UseCases/NotifyEnrolledStudentsOnCourseNoticeUseCase.php`

```php
<?php

declare(strict_types=1);

namespace App\Application\TenantAdminDashboard\Notification\UseCases;

use App\Domain\TenantAdminDashboard\Course\Events\CourseNoticeboardPosted;
use App\Domain\TenantAdminDashboard\Course\Repositories\CourseEnrollmentRepositoryInterface;
use App\Domain\TenantAdminDashboard\Notification\Entities\NotificationEntity;
use App\Domain\TenantAdminDashboard\Notification\Repositories\NotificationRepositoryInterface;
use App\Domain\TenantAdminDashboard\Notification\ValueObjects\NotificationType;
use App\Infrastructure\Persistence\TenantAdminDashboard\Notification\Jobs\SendNotificationEmailJob;

final class NotifyEnrolledStudentsOnCourseNoticeUseCase
{
    public function __construct(
        private readonly CourseEnrollmentRepositoryInterface $enrollmentRepository,
        private readonly NotificationRepositoryInterface $notificationRepository,
    ) {}

    public function handle(CourseNoticeboardPosted $event): void
    {
        $enrolledUserIds = $this->enrollmentRepository
            ->findAllActiveUserIdsByCourseId($event->tenantId, $event->courseId);

        foreach ($enrolledUserIds as $userId) {
            // Skip the author themselves
            if ($userId === $event->authorId) {
                continue;
            }

            $notification = NotificationEntity::create(
                tenantId: $event->tenantId,
                recipientUserId: $userId,
                type: NotificationType::courseNotice(),
                title: 'New notice in: ' . $event->courseTitle,
                body: $event->noticeTitle . ' — ' . $event->noticeMessage,
            );

            $this->notificationRepository->save($notification);

            SendNotificationEmailJob::dispatch(
                $event->tenantId,
                $userId,
                'New notice: ' . $event->noticeTitle,
                $event->noticeMessage,
            );
        }
    }
}
```

> **Why no `DB::transaction()` here?** This is an event listener, not a primary write UseCase. It handles a domain event that was already committed. Each notification save is an independent operation. If one fails, the rest should still attempt. Wrap individual saves in try/catch if partial failure tolerance is required.

> **Why no audit log here?** Notifications are infrastructure side-effects of domain events. The audit log entry should live on the originating UseCase (`CreateCourseNoticeboardUseCase`), not in the notification side-effect.

#### Step: Wire Event Listener in `NotificationServiceProvider`

In `app/Providers/NotificationServiceProvider.php`, add to the `boot()` method:

```php
Event::listen(
    \App\Domain\TenantAdminDashboard\Course\Events\CourseNoticeboardPosted::class,
    [\App\Application\TenantAdminDashboard\Notification\UseCases\NotifyEnrolledStudentsOnCourseNoticeUseCase::class, 'handle']
);
```

#### Step: Wire Event Dispatch in Noticeboard UseCase

In the existing `CreateCourseNoticeboardUseCase` (or equivalent), after the `DB::transaction()` block:

```php
// After transaction:
event(new CourseNoticeboardPosted(
    tenantId: $command->tenantId,
    courseId: $command->courseId,
    noticeboardId: $saved->getId(),
    courseTitle: $course->title,
    noticeTitle: $command->title,
    noticeMessage: $command->message,
    authorId: $command->actorId ?? 0,
));
```

---

### 3.6 Pathway 2: Session Rescheduled Notification

#### Phase 2 — Domain Layer

**File 5: Domain Event — `LiveSessionRescheduled`**  
`app/Domain/TenantAdminDashboard\Course\Events\LiveSessionRescheduled.php`

```php
<?php

declare(strict_types=1);

namespace App\Domain\TenantAdminDashboard\Course\Events;

final class LiveSessionRescheduled
{
    public function __construct(
        public readonly int    $tenantId,
        public readonly int    $courseId,
        public readonly int    $sessionId,
        public readonly string $courseTitle,
        public readonly string $sessionTitle,
        public readonly \DateTimeImmutable $newDate,
        public readonly int    $durationMinutes,
        public readonly \DateTimeImmutable $occurredAt = new \DateTimeImmutable(),
    ) {}
}
```

#### Phase 3 — Application Layer

**File 6: UseCase — `NotifyEnrolledStudentsOnSessionRescheduledUseCase`**  
`app/Application/TenantAdminDashboard/Notification/UseCases/NotifyEnrolledStudentsOnSessionRescheduledUseCase.php`

```php
<?php

declare(strict_types=1);

namespace App\Application\TenantAdminDashboard\Notification\UseCases;

use App\Domain\TenantAdminDashboard\Course\Events\LiveSessionRescheduled;
use App\Domain\TenantAdminDashboard\Course\Repositories\CourseEnrollmentRepositoryInterface;
use App\Domain\TenantAdminDashboard\Notification\Entities\NotificationEntity;
use App\Domain\TenantAdminDashboard\Notification\Repositories\NotificationRepositoryInterface;
use App\Domain\TenantAdminDashboard\Notification\ValueObjects\NotificationType;
use App\Infrastructure\Persistence\TenantAdminDashboard\Notification\Jobs\SendNotificationEmailJob;

final class NotifyEnrolledStudentsOnSessionRescheduledUseCase
{
    public function __construct(
        private readonly CourseEnrollmentRepositoryInterface $enrollmentRepository,
        private readonly NotificationRepositoryInterface $notificationRepository,
    ) {}

    public function handle(LiveSessionRescheduled $event): void
    {
        $enrolledUserIds = $this->enrollmentRepository
            ->findAllActiveUserIdsByCourseId($event->tenantId, $event->courseId);

        $newDateFormatted = $event->newDate->format('d M Y \a\t H:i');

        foreach ($enrolledUserIds as $userId) {
            $notification = NotificationEntity::create(
                tenantId: $event->tenantId,
                recipientUserId: $userId,
                type: NotificationType::sessionRescheduled(),
                title: 'Session rescheduled: ' . $event->sessionTitle,
                body: "The live session \"{$event->sessionTitle}\" in {$event->courseTitle} has been rescheduled to {$newDateFormatted}.",
            );

            $this->notificationRepository->save($notification);

            SendNotificationEmailJob::dispatch(
                $event->tenantId,
                $userId,
                'Session rescheduled: ' . $event->sessionTitle,
                $notification->body,
            );
        }
    }
}
```

#### Step: Wire Event Listener in `NotificationServiceProvider`

```php
Event::listen(
    \App\Domain\TenantAdminDashboard\Course\Events\LiveSessionRescheduled::class,
    [\App\Application\TenantAdminDashboard\Notification\UseCases\NotifyEnrolledStudentsOnSessionRescheduledUseCase::class, 'handle']
);
```

#### Step: Wire Event Dispatch in `UpdateLiveSessionUseCase`

Locate the existing `UpdateLiveSessionUseCase` (in `app/Application/TenantAdminDashboard/Course/UseCases/`). After its `DB::transaction()` block, add:

```php
// Only fire if date or duration changed
if ($dateChanged || $durationChanged) {
    event(new LiveSessionRescheduled(
        tenantId: $command->tenantId,
        courseId: $course->courseId,
        sessionId: $saved->getId(),
        courseTitle: $course->title,
        sessionTitle: $saved->getTitle(),
        newDate: $saved->getDate(),
        durationMinutes: $saved->getDuration(),
    ));
}
```

### 3.7 Tests to Write

**File 7: Feature Test — Course Noticeboard Notification**  
`tests/Feature/TenantDashboard/Notification/CourseNoticeboardNotificationTest.php`

Test cases:
- `enrolled_students_receive_notification_when_notice_is_posted`
- `author_does_not_receive_own_notice_notification`
- `unenrolled_students_do_not_receive_notice_notification`
- `notification_type_is_course_notice`

**File 8: Feature Test — Session Rescheduled Notification**  
`tests/Feature/TenantDashboard/Notification/SessionRescheduledNotificationTest.php`

Test cases:
- `enrolled_students_receive_notification_when_session_is_rescheduled`
- `no_notification_when_session_update_does_not_change_date`
- `notification_body_contains_new_date`

---

## 4. Feature C: Waitlist System — Compliance & Completion

### 4.1 Current State Summary

The waitlist feature has a working scaffold but multiple architecture violations that must be fixed before it can be considered compliant with the Developer Instruction Manual.

### 4.2 Architecture Compliance Gaps (Must Fix)

#### Gap 1: Missing `Command` Objects

**Rule (from Developer Manual §3):** Every write UseCase MUST receive a `Command` object — `final class`, `declare(strict_types=1)`, `public readonly` properties, `int $tenantId` as first parameter, `?int $actorId`.

**Current state:** `JoinCourseWaitlistUseCase::execute(int $tenantId, int $courseId, int $userId)` — no Command.

**Fix:** Create Command objects for all mutating use cases.

**File 1: `JoinWaitlistCommand`**  
`app/Application/TenantAdminDashboard/Course/Commands/Waitlist/JoinWaitlistCommand.php`

```php
<?php

declare(strict_types=1);

namespace App\Application\TenantAdminDashboard\Course\Commands\Waitlist;

final class JoinWaitlistCommand
{
    public function __construct(
        public readonly int  $tenantId,
        public readonly int  $courseId,
        public readonly int  $userId,
        public readonly ?int $actorId = null,
    ) {}
}
```

**File 2: `LeaveWaitlistCommand`**  
`app/Application/TenantAdminDashboard/Course/Commands/Waitlist/LeaveWaitlistCommand.php`

```php
<?php

declare(strict_types=1);

namespace App\Application\TenantAdminDashboard\Course\Commands\Waitlist;

final class LeaveWaitlistCommand
{
    public function __construct(
        public readonly int  $tenantId,
        public readonly int  $courseId,
        public readonly int  $userId,
        public readonly ?int $actorId = null,
    ) {}
}
```

**File 3: `ToggleWaitlistCommand`**  
`app/Application/TenantAdminDashboard\Course\Commands\Waitlist\ToggleWaitlistCommand.php`

```php
<?php

declare(strict_types=1);

namespace App\Application\TenantAdminDashboard\Course\Commands\Waitlist;

final class ToggleWaitlistCommand
{
    public function __construct(
        public readonly int  $tenantId,
        public readonly int  $courseId,
        public readonly bool $enabled,
        public readonly ?int $actorId = null,
    ) {}
}
```

**File 4: `ClearWaitlistCommand`**  
`app/Application/TenantAdminDashboard/Course/Commands/Waitlist/ClearWaitlistCommand.php`

```php
<?php

declare(strict_types=1);

namespace App\Application\TenantAdminDashboard\Course\Commands\Waitlist;

final class ClearWaitlistCommand
{
    public function __construct(
        public readonly int  $tenantId,
        public readonly int  $courseId,
        public readonly ?int $actorId = null,
    ) {}
}
```

**File 5: `DeleteWaitlistEntryCommand`**  
`app/Application/TenantAdminDashboard/Course/Commands/Waitlist/DeleteWaitlistEntryCommand.php`

```php
<?php

declare(strict_types=1);

namespace App\Application\TenantAdminDashboard\Course\Commands\Waitlist;

final class DeleteWaitlistEntryCommand
{
    public function __construct(
        public readonly int  $tenantId,
        public readonly int  $courseId,
        public readonly int  $waitlistEntryId,
        public readonly ?int $actorId = null,
    ) {}
}
```

---

#### Gap 2: Missing Audit Logging in `JoinCourseWaitlistUseCase`

**Rule (from Developer Manual §17):** Every mutation UseCase MUST have an audit log entry inside `DB::transaction()`.

**Current `JoinCourseWaitlistUseCase`:** Has no audit log. The repository call and event dispatch are outside a transaction.

**Rewrite `JoinCourseWaitlistUseCase`:**  
`app/Application/TenantAdminDashboard/Course/UseCases/Waitlist/JoinCourseWaitlistUseCase.php`

```php
<?php

declare(strict_types=1);

namespace App\Application\TenantAdminDashboard\Course\UseCases\Waitlist;

use App\Application\TenantAdminDashboard\Course\Commands\Waitlist\JoinWaitlistCommand;
use App\Domain\Shared\Audit\AuditContext;
use App\Domain\Shared\Audit\AuditLoggerInterface;
use App\Domain\Shared\Exceptions\ConflictException;
use App\Domain\Shared\Exceptions\EntityNotFoundException;
use App\Domain\Shared\Exceptions\ValidationException;
use App\Domain\TenantAdminDashboard\Course\Events\StudentJoinedWaitlistEvent;
use App\Domain\TenantAdminDashboard\Course\Repositories\CourseEnrollmentRepositoryInterface;
use App\Domain\TenantAdminDashboard\Course\Repositories\CourseRepositoryInterface;
use App\Domain\TenantAdminDashboard\Course\Repositories\WaitlistRepositoryInterface;
use Illuminate\Support\Facades\DB;

final class JoinCourseWaitlistUseCase
{
    public function __construct(
        private readonly CourseRepositoryInterface $courseRepository,
        private readonly CourseEnrollmentRepositoryInterface $enrollmentRepository,
        private readonly WaitlistRepositoryInterface $waitlistRepository,
        private readonly AuditLoggerInterface $auditLogger,
    ) {}

    public function execute(JoinWaitlistCommand $command): void
    {
        // Step 2: Precondition checks (outside transaction — read-only)
        $course = $this->courseRepository->findById($command->tenantId, $command->courseId);

        if ($course === null) {
            throw EntityNotFoundException::fromId('Course', $command->courseId);
        }

        if (!$course->enableWaitlist) {
            throw new ValidationException("Waitlist is not enabled for this course.");
        }

        $existingEnrollment = $this->enrollmentRepository
            ->findByUserIdAndCourseId($command->tenantId, $command->userId, $command->courseId);

        if ($existingEnrollment !== null && $existingEnrollment->isActive()) {
            throw new ConflictException("User is already enrolled in this course.");
        }

        if ($this->waitlistRepository->isOnWaitlist($command->tenantId, $command->courseId, $command->userId)) {
            throw new ConflictException("User is already on the waitlist for this course.");
        }

        // Steps 4–7: Transaction
        $events = DB::transaction(function () use ($command, $course) {
            // Step 5: Persist
            $entry = $this->waitlistRepository->joinWaitlist(
                $command->tenantId,
                $command->courseId,
                $command->userId,
            );

            // Step 6: Audit log (inside transaction)
            $this->auditLogger->log(new AuditContext(
                tenantId: $command->tenantId,
                userId: $command->actorId ?? 0,
                action: 'waitlist.joined',
                entityType: 'waitlist_entry',
                entityId: $entry->id ?? 0,
                metadata: [
                    'course_id'  => $command->courseId,
                    'user_id'    => $command->userId,
                    'course_name' => $course->title,
                ],
            ));

            // Step 7: Collect events
            return [
                new StudentJoinedWaitlistEvent(
                    tenantId: $command->tenantId,
                    courseId: $command->courseId,
                    userId: $command->userId,
                    courseName: $course->title,
                ),
            ];
        });

        // Step 8: Dispatch events AFTER commit
        foreach ($events as $event) {
            event($event);
        }
    }
}
```

**Apply the same fix pattern** to `ClearCourseWaitlistUseCase` and `ToggleCourseWaitlistUseCase` — they also need `DB::transaction()` wrapping and audit logging.

---

#### Gap 3: Event Dispatched Inside UseCase Body (Not Post-Transaction)

**Original `JoinCourseWaitlistUseCase` (incorrect):**
```php
// ❌ WRONG — event fires before transaction wraps persistence
$this->waitlistRepository->joinWaitlist($tenantId, $courseId, $userId);
event(new StudentJoinedWaitlistEvent(...));
```

This is fixed in the rewrite above (Gap 2). The same pattern must be audited in `ToggleCourseWaitlistUseCase`.

---

#### Gap 4: Architecture Violation in `SendWaitlistJoinedNotificationUseCase`

**Current violation:** `SendWaitlistJoinedNotificationUseCase` implements `ShouldQueue` and uses `InteractsWithQueue`. These are Laravel Infrastructure traits and must NOT appear in Application layer classes.

**Rule:** Application layer UseCases must have zero `use Illuminate\...` imports except `DB::`.

**Fix:** The queue concern belongs in an **Infrastructure Job**, not in the UseCase. The current `SendNotificationEmailJob` in Infrastructure already handles async email. The `SendWaitlistJoinedNotificationUseCase` should be a plain synchronous listener that dispatches the job — it must not implement `ShouldQueue` itself.

**Rewrite `SendWaitlistJoinedNotificationUseCase`:**

```php
<?php

declare(strict_types=1);

namespace App\Application\TenantAdminDashboard\Notification\UseCases;

use App\Domain\TenantAdminDashboard\Course\Events\StudentJoinedWaitlistEvent;
use App\Domain\TenantAdminDashboard\Notification\Entities\NotificationEntity;
use App\Domain\TenantAdminDashboard\Notification\Repositories\NotificationRepositoryInterface;
use App\Domain\TenantAdminDashboard\Notification\ValueObjects\NotificationType;
use App\Infrastructure\Persistence\TenantAdminDashboard\Notification\Jobs\SendNotificationEmailJob;

final class SendWaitlistJoinedNotificationUseCase
{
    // NO ShouldQueue here — this is the Application layer
    public function __construct(
        private readonly NotificationRepositoryInterface $repository,
    ) {}

    public function handle(StudentJoinedWaitlistEvent $event): void
    {
        $notification = NotificationEntity::create(
            tenantId: $event->tenantId,
            recipientUserId: $event->userId,
            type: NotificationType::waitlistJoined(),
            title: 'Waitlist joined: ' . $event->courseName,
            body: 'You have successfully joined the waitlist for ' . $event->courseName
                . '. We will notify you when a spot becomes available.',
        );

        $this->repository->save($notification);

        // Dispatch the email asynchronously via Infrastructure Job
        SendNotificationEmailJob::dispatch(
            $event->tenantId,
            $event->userId,
            $notification->title,
            $notification->body,
        );
    }
}
```

---

#### Gap 5: Missing FormRequests

**Rule (Developer Manual §13):** Every write HTTP endpoint MUST use a `FormRequest` for input validation.

**File 6: `JoinWaitlistRequest`**  
`app/Http/Requests/TenantAdminDashboard/Course/Waitlist/JoinWaitlistRequest.php`

```php
<?php

declare(strict_types=1);

namespace App\Http\Requests\TenantAdminDashboard\Course\Waitlist;

use Illuminate\Foundation\Http\FormRequest;

final class JoinWaitlistRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [];
        // No body input required — courseId comes from route, userId from auth
    }
}
```

**File 7: `LeaveWaitlistRequest`**  
`app/Http/Requests/TenantAdminDashboard/Course/Waitlist/LeaveWaitlistRequest.php`

```php
<?php

declare(strict_types=1);

namespace App\Http\Requests\TenantAdminDashboard\Course\Waitlist;

use Illuminate\Foundation\Http\FormRequest;

final class LeaveWaitlistRequest extends FormRequest
{
    public function authorize(): bool { return true; }
    public function rules(): array { return []; }
}
```

**File 8: `ToggleWaitlistRequest`**  
`app/Http/Requests/TenantAdminDashboard/Course/Waitlist/ToggleWaitlistRequest.php`

```php
<?php

declare(strict_types=1);

namespace App\Http\Requests\TenantAdminDashboard\Course\Waitlist;

use Illuminate\Foundation\Http\FormRequest;

final class ToggleWaitlistRequest extends FormRequest
{
    public function authorize(): bool { return true; }

    public function rules(): array
    {
        return [
            'enable' => ['required', 'boolean'],
        ];
    }
}
```

**Update `WaitlistController`** to use these FormRequests:

```php
// In join():
public function join(JoinWaitlistRequest $request, int $courseId, JoinCourseWaitlistUseCase $useCase): JsonResponse
{
    $tenantId = $this->tenantContext->getIdOrFail();
    $userId   = (int) $request->user('tenant_api')->id;

    $command = new JoinWaitlistCommand(
        tenantId: $tenantId,
        courseId: $courseId,
        userId:   $userId,
        actorId:  $userId,
    );

    $useCase->execute($command);

    return response()->json(['data' => ['message' => 'Successfully joined the waitlist.'], 'meta' => [], 'errors' => []], 200);
}
```

Apply the same pattern to `leave()` and `toggle()`.

---

### 4.3 New Functionality: Waitlist Slot Available Notification

When a student's enrollment **expires** or they **unenroll**, and the course has a waitlist with entries, the first person on the waitlist should be notified that a spot is available.

#### Phase 2 — Domain Layer

**File 9: Domain Event — `WaitlistSlotAvailable`**  
`app/Domain/TenantAdminDashboard/Course/Events/WaitlistSlotAvailable.php`

```php
<?php

declare(strict_types=1);

namespace App\Domain\TenantAdminDashboard\Course\Events;

final class WaitlistSlotAvailable
{
    public function __construct(
        public readonly int    $tenantId,
        public readonly int    $courseId,
        public readonly string $courseTitle,
        public readonly \DateTimeImmutable $occurredAt = new \DateTimeImmutable(),
    ) {}
}
```

**Extend `WaitlistRepositoryInterface`:**  
Add a method to fetch the first/next user on the waitlist:

```php
// In WaitlistRepositoryInterface.php, add:
public function findNextInQueue(int $tenantId, int $courseId): ?WaitlistEntryEntity;
```

**Extend `EloquentWaitlistRepository`:**

```php
public function findNextInQueue(int $tenantId, int $courseId): ?WaitlistEntryEntity
{
    $record = CourseWaitlistRecord::where('tenant_id', $tenantId)
        ->where('course_id', $courseId)
        ->orderBy('created_at', 'asc')
        ->first();

    return $record ? $this->toEntity($record) : null;
}
```

#### Phase 3 — Application Layer

**File 10: UseCase — `NotifyNextOnWaitlistUseCase`**  
`app/Application/TenantAdminDashboard/Notification/UseCases/NotifyNextOnWaitlistUseCase.php`

```php
<?php

declare(strict_types=1);

namespace App\Application\TenantAdminDashboard\Notification\UseCases;

use App\Domain\TenantAdminDashboard\Course\Events\WaitlistSlotAvailable;
use App\Domain\TenantAdminDashboard\Course\Repositories\WaitlistRepositoryInterface;
use App\Domain\TenantAdminDashboard\Notification\Entities\NotificationEntity;
use App\Domain\TenantAdminDashboard\Notification\Repositories\NotificationRepositoryInterface;
use App\Domain\TenantAdminDashboard\Notification\ValueObjects\NotificationType;
use App\Infrastructure\Persistence\TenantAdminDashboard\Notification\Jobs\SendNotificationEmailJob;

final class NotifyNextOnWaitlistUseCase
{
    public function __construct(
        private readonly WaitlistRepositoryInterface $waitlistRepository,
        private readonly NotificationRepositoryInterface $notificationRepository,
    ) {}

    public function handle(WaitlistSlotAvailable $event): void
    {
        $nextEntry = $this->waitlistRepository->findNextInQueue($event->tenantId, $event->courseId);

        if ($nextEntry === null) {
            return; // No one on waitlist — nothing to do
        }

        $notification = NotificationEntity::create(
            tenantId: $event->tenantId,
            recipientUserId: $nextEntry->userId,
            type: NotificationType::waitlistAvailable(),
            title: 'Spot available: ' . $event->courseTitle,
            body: 'A spot has opened up in "' . $event->courseTitle
                . '". Enroll now before it fills up.',
        );

        $this->notificationRepository->save($notification);

        SendNotificationEmailJob::dispatch(
            $event->tenantId,
            $nextEntry->userId,
            $notification->title,
            $notification->body,
        );
    }
}
```

**Wire `WaitlistSlotAvailable` event dispatch** — find where enrollment expiry or unenrollment is handled (likely in an `ExpireEnrollmentUseCase` or `UnenrollStudentUseCase`) and after its `DB::transaction()` block, check if the course has a waitlist and fire the event:

```php
// After transaction:
$waitlistCount = $this->waitlistRepository->countForCourse($command->tenantId, $command->courseId);
if ($waitlistCount > 0 && $course->enableWaitlist) {
    event(new WaitlistSlotAvailable(
        tenantId: $command->tenantId,
        courseId: $command->courseId,
        courseTitle: $course->title,
    ));
}
```

**Register listener in `NotificationServiceProvider`:**

```php
Event::listen(
    \App\Domain\TenantAdminDashboard\Course\Events\WaitlistSlotAvailable::class,
    [\App\Application\TenantAdminDashboard\Notification\UseCases\NotifyNextOnWaitlistUseCase::class, 'handle']
);
```

---

### 4.4 New Functionality: Delete Single Waitlist Entry

Admins must be able to remove individual entries from the waitlist (Mentora: `WaitlistController@deleteWaitlistItems`).

**Extend `WaitlistRepositoryInterface`:**

```php
// Add method:
public function deleteById(int $tenantId, int $id): void;
```

**Extend `EloquentWaitlistRepository`:**

```php
public function deleteById(int $tenantId, int $id): void
{
    CourseWaitlistRecord::where('tenant_id', $tenantId)
        ->where('id', $id)
        ->delete();
}
```

**File 11: UseCase — `DeleteWaitlistEntryUseCase`**  
`app/Application/TenantAdminDashboard/Course/UseCases/Waitlist/DeleteWaitlistEntryUseCase.php`

```php
<?php

declare(strict_types=1);

namespace App\Application\TenantAdminDashboard\Course\UseCases\Waitlist;

use App\Application\TenantAdminDashboard\Course\Commands\Waitlist\DeleteWaitlistEntryCommand;
use App\Domain\Shared\Audit\AuditContext;
use App\Domain\Shared\Audit\AuditLoggerInterface;
use App\Domain\TenantAdminDashboard\Course\Repositories\WaitlistRepositoryInterface;
use Illuminate\Support\Facades\DB;

final class DeleteWaitlistEntryUseCase
{
    public function __construct(
        private readonly WaitlistRepositoryInterface $waitlistRepository,
        private readonly AuditLoggerInterface $auditLogger,
    ) {}

    public function execute(DeleteWaitlistEntryCommand $command): void
    {
        DB::transaction(function () use ($command) {
            $this->waitlistRepository->deleteById($command->tenantId, $command->waitlistEntryId);

            $this->auditLogger->log(new AuditContext(
                tenantId: $command->tenantId,
                userId: $command->actorId ?? 0,
                action: 'waitlist_entry.deleted',
                entityType: 'waitlist_entry',
                entityId: $command->waitlistEntryId,
                metadata: ['course_id' => $command->courseId],
            ));
        });
    }
}
```

**Add route to `routes/tenant_dashboard/course.php`:**

```php
// Inside {courseId}/waitlist prefix group, add:
Route::delete('/entries/{entryId}', [\App\Http\TenantAdminDashboard\Course\Controllers\WaitlistController::class, 'deleteEntry'])
    ->middleware('tenant.capability:course.edit');
```

**Add `deleteEntry()` method to `WaitlistController`:**

```php
public function deleteEntry(
    Request $request,
    int $courseId,
    int $entryId,
    DeleteWaitlistEntryUseCase $useCase,
): JsonResponse {
    $tenantId = $this->tenantContext->getIdOrFail();

    $command = new DeleteWaitlistEntryCommand(
        tenantId: $tenantId,
        courseId: $courseId,
        waitlistEntryId: $entryId,
        actorId: (int) $request->user('tenant_api')->id,
    );

    $useCase->execute($command);

    return response()->json(['data' => ['message' => 'Waitlist entry removed.'], 'meta' => [], 'errors' => []], 200);
}
```

---

### 4.5 Tests to Write

**File 12: Feature Test**  
`tests/Feature/TenantDashboard/Course/WaitlistTest.php`

Test cases:
- `student_can_join_waitlist_when_waitlist_is_enabled`
- `student_cannot_join_waitlist_when_already_enrolled`
- `student_cannot_join_waitlist_twice`
- `student_cannot_join_waitlist_when_waitlist_is_disabled`
- `instructor_can_toggle_waitlist`
- `instructor_can_clear_waitlist`
- `instructor_can_delete_single_waitlist_entry`
- `tenant_a_cannot_access_tenant_b_waitlist` ← **critical isolation test**
- `next_student_on_waitlist_is_notified_when_slot_opens`
- `student_is_notified_on_joining_waitlist`

---

## 5. Shared Cross-Cutting Concerns

### 5.1 `CourseEnrollmentRepositoryInterface` — `findAllActiveUserIdsByCourseId`

Both notification pathways (noticeboard + session rescheduled) need this method. Before implementing either pathway, verify the method exists.

**Locate:** `app/Domain/TenantAdminDashboard/Course/Repositories/CourseEnrollmentRepositoryInterface.php`

If missing, add:

```php
/** @return int[] */
public function findAllActiveUserIdsByCourseId(int $tenantId, int $courseId): array;
```

Then add the implementation to `EloquentCourseEnrollmentRepository`:

```php
public function findAllActiveUserIdsByCourseId(int $tenantId, int $courseId): array
{
    return CourseEnrollmentRecord::where('tenant_id', $tenantId)
        ->where('course_id', $courseId)
        ->where('status', 'active')
        ->pluck('user_id')
        ->all();
}
```

### 5.2 Standard JSON Envelope

All new endpoints must return the standard UBOTZ JSON envelope:

```json
{
  "data": { ... },
  "meta": { ... },
  "errors": []
}
```

Do not return bare objects or non-enveloped responses.

### 5.3 Tenant Isolation Verification Commands

Run these after implementing each feature:

```powershell
docker exec -it ubotz_backend grep -rn "use Illuminate" app/Domain/
# Expected: 0 results

docker exec -it ubotz_backend grep -rn "DB::table" app/Application/
# Expected: 0 results

docker exec -it ubotz_backend grep -rn "->enum(" database/migrations/
# Expected: 0 results
```

---

## 6. Implementation Sequence

Work **strictly** in this order within each feature. Never start Infrastructure before Domain is complete.

```
Priority │ Feature                         │ Phase  │ File(s)
─────────┼─────────────────────────────────┼────────┼──────────────────────────────────────────────────────
  1      │ Waitlist — Commands             │ App    │ 5 Command files (JoinWaitlist, Leave, Toggle, Clear, Delete)
  2      │ Waitlist — UseCase rewrites     │ App    │ JoinCourseWaitlistUseCase (add DB::tx, audit, command)
  3      │ Waitlist — UseCase rewrites     │ App    │ ClearCourseWaitlistUseCase (add DB::tx, audit)
  4      │ Waitlist — UseCase rewrites     │ App    │ ToggleCourseWaitlistUseCase (add DB::tx, audit)
  5      │ Waitlist — Fix notification UC  │ App    │ SendWaitlistJoinedNotificationUseCase (remove ShouldQueue)
  6      │ Waitlist — FormRequests         │ HTTP   │ 3 FormRequest files
  7      │ Waitlist — Controller update    │ HTTP   │ WaitlistController (add FormRequests + Commands)
  8      │ Waitlist — Slot available event │ Domain │ WaitlistSlotAvailable event
  9      │ Waitlist — Repo extension       │ Domain │ WaitlistRepositoryInterface + findNextInQueue + deleteById
 10      │ Waitlist — Repo implementation  │ Infra  │ EloquentWaitlistRepository (add findNextInQueue, deleteById)
 11      │ Waitlist — Delete entry UC      │ App    │ DeleteWaitlistEntryUseCase + DeleteWaitlistEntryCommand
 12      │ Waitlist — Notify next UseCase  │ App    │ NotifyNextOnWaitlistUseCase
 13      │ Waitlist — Wire listeners       │ Infra  │ NotificationServiceProvider (WaitlistSlotAvailable)
 14      │ Waitlist — Route                │ HTTP   │ DELETE /entries/{entryId} route
 15      │ Waitlist — Tests                │ Test   │ WaitlistTest.php
─────────┼─────────────────────────────────┼────────┼──────────────────────────────────────────────────────
 16      │ Social — SocialPlatform VO      │ Domain │ SocialPlatform.php
 17      │ Social — Interface              │ Domain │ CourseShareLinkGeneratorInterface.php
 18      │ Social — Query                  │ App    │ GetCourseShareLinksQuery.php
 19      │ Social — Infra implementation   │ Infra  │ SocialShareLinkGenerator.php
 20      │ Social — ServiceProvider        │ Infra  │ CourseServiceProvider binding
 21      │ Social — Controller             │ HTTP   │ CourseShareReadController.php
 22      │ Social — Route                  │ HTTP   │ course.php route addition
 23      │ Social — Tests                  │ Test   │ CourseShareLinksTest.php
─────────┼─────────────────────────────────┼────────┼──────────────────────────────────────────────────────
 24      │ Notifications — Repo method     │ Domain │ CourseEnrollmentRepositoryInterface + impl (if missing)
 25      │ Notifications — NotificationType │ Domain│ Add course_notice, session_rescheduled types
 26      │ Notifications — Noticeboard evt │ Domain │ CourseNoticeboardPosted.php
 27      │ Notifications — Session evt     │ Domain │ LiveSessionRescheduled.php
 28      │ Notifications — Noticeboard UC  │ App    │ NotifyEnrolledStudentsOnCourseNoticeUseCase.php
 29      │ Notifications — Session UC      │ App    │ NotifyEnrolledStudentsOnSessionRescheduledUseCase.php
 30      │ Notifications — Wire noticeboard│ App    │ CreateCourseNoticeboardUseCase (add event dispatch)
 31      │ Notifications — Wire session    │ App    │ UpdateLiveSessionUseCase (add conditional event dispatch)
 32      │ Notifications — Wire listeners  │ Infra  │ NotificationServiceProvider (2 new listener bindings)
 33      │ Notifications — Tests           │ Test   │ 2 test files
```

---

## 7. Pre-Commit Checklist

Run this for every PR touching these features:

```
□ PHPStan Level 5: docker exec -it ubotz_backend vendor/bin/phpstan analyse app/ --level=5
□ All tests: docker exec -it ubotz_backend php artisan test

Architecture Guards:
□ No Illuminate imports in Domain: grep -rn "use Illuminate" app/Domain/ → 0 results
□ No DB::table in Application: grep -rn "DB::table" app/Application/ → 0 results
□ No MySQL ENUMs: grep -rn "->enum(" database/migrations/ → 0 results
□ No env() in app code: grep -rn "env(" app/ → 0 results

Waitlist Compliance:
□ All Waitlist UseCases (Join, Leave, Clear, Toggle) accept a Command object
□ JoinCourseWaitlistUseCase has DB::transaction() wrapping
□ All mutating Waitlist UseCases have audit log inside transaction
□ Events dispatched AFTER DB::transaction() block (not inside)
□ SendWaitlistJoinedNotificationUseCase does NOT implement ShouldQueue
□ WaitlistController methods use typed FormRequests

Social Sharing:
□ SocialPlatform is pure PHP — zero use Illuminate imports
□ CourseShareLinkGeneratorInterface is in Domain/Services/ — zero use Illuminate imports
□ SocialShareLinkGenerator is in Infrastructure/Shared/ only
□ GetCourseShareLinksQuery uses repository interface, not DB::table or Eloquent
□ CourseServiceProvider binding registered
□ Route protected by tenant.capability:course.view

Notifications:
□ CourseNoticeboardPosted event is pure PHP
□ LiveSessionRescheduled event is pure PHP
□ NotificationType VO updated with new types
□ NotifyEnrolledStudentsOnCourseNoticeUseCase uses repository interface
□ NotifyEnrolledStudentsOnSessionRescheduledUseCase uses repository interface
□ Both new listeners registered in NotificationServiceProvider
□ CourseNoticeboardPosted fired AFTER noticeboard transaction
□ LiveSessionRescheduled fired ONLY when date/duration actually changed
□ Both new notification UseCases do NOT implement ShouldQueue

Tenant Isolation (CRITICAL):
□ CourseEnrollmentRepository.findAllActiveUserIdsByCourseId scopes by tenant_id
□ WaitlistRepository.findNextInQueue scopes by tenant_id
□ WaitlistRepository.deleteById scopes by tenant_id
□ Tenant isolation tests passing (Tenant A cannot access Tenant B data)
□ No cross-tenant data visible in notification payloads

Tests:
□ WaitlistTest: tenant isolation test present and passing
□ CourseShareLinksTest: 404 on cross-tenant request
□ Both notification tests: unenrolled students do not receive notifications
```

---

*End of Document — P2 Feature Implementation Plan v1.0*  
*Companion: `backend/documentation/Ubotz 2 developer instruction manual .md` · `backend/documentation/Feature Migration Guide - Mentora to UBOTZ 2.md`*
