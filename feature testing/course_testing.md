# Course Feature: Testing & Verification

This document contains the automated tests used to verify the Course Management feature, along with the commands to execute them.

## Feature Tests

### [ChapterCrudTest.php](file:///c:/Users/sayan/lms/Ubotz_2.0/backend/tests/Feature/TenantAdminDashboard/Course/ChapterCrudTest.php)
```php
<?php

namespace Tests\Feature\TenantAdminDashboard\Course;

use App\Infrastructure\Persistence\TenantAdminDashboard\Course\CourseRecord;
use App\Infrastructure\Persistence\TenantAdminDashboard\Course\ChapterRecord;
use Tests\TestCase;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Traits\AuthenticatesWithJwt;
use Tests\Traits\SeedsTestCapabilities;

class ChapterCrudTest extends TestCase
{
    use RefreshDatabase, AuthenticatesWithJwt, SeedsTestCapabilities;

    public function test_it_can_create_a_chapter()
    {
        $token = $this->tokenForTenantUser($this->user, $this->tenant);
        
        $response = $this->withHeaders(['Authorization' => "Bearer {$token}"])
            ->postJson("/api/tenant/courses/{$this->course->id}/chapters", [
                'title' => 'Chapter One',
                'status' => 'active'
            ]);

        $response->assertStatus(201);
        $this->assertDatabaseHas('course_chapters', ['title' => 'Chapter One']);
    }
    // ... test_it_can_list_chapters, test_it_can_update_a_chapter, test_it_can_reorder_chapters, test_it_can_delete_a_chapter
}
```

### [CourseFileCrudTest.php](file:///c:/Users/sayan/lms/Ubotz_2.0/backend/tests/Feature/TenantAdminDashboard/Course/CourseFileCrudTest.php)
```php
<?php

namespace Tests\Feature\TenantAdminDashboard\Course;

use App\Infrastructure\Persistence\TenantAdminDashboard\Course\CourseFileRecord;
use Tests\TestCase;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Traits\AuthenticatesWithJwt;
use Tests\Traits\SeedsTestCapabilities;

class CourseFileCrudTest extends TestCase
{
    use RefreshDatabase, AuthenticatesWithJwt, SeedsTestCapabilities;

    public function test_it_can_create_a_course_file(): void
    {
        $response = $this->withHeader('Authorization', "Bearer {$this->token}")
            ->postJson("/api/tenant/courses/{$this->course->id}/chapters/{$this->chapter->id}/files", [
                'title' => 'Lesson PDF',
                'file_path' => '/uploads/files/lesson.pdf',
                'file_source' => 'upload',
                'file_type' => 'pdf',
                'accessibility' => 'free',
                'status' => 'active'
            ]);

        $response->assertStatus(201);
        $this->assertDatabaseHas('course_files', ['title' => 'Lesson PDF']);
    }
    // ... test_it_can_list_files_in_a_chapter, test_it_can_update_a_course_file, test_it_can_delete_a_course_file
}
```

### [TextLessonCrudTest.php](file:///c:/Users/sayan/lms/Ubotz_2.0/backend/tests/Feature/TenantAdminDashboard/Course/TextLessonCrudTest.php)
```php
<?php

namespace Tests\Feature\TenantAdminDashboard\Course;

use App\Infrastructure\Persistence\TenantAdminDashboard\Course\TextLessonRecord;
use Tests\TestCase;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Traits\AuthenticatesWithJwt;
use Tests\Traits\SeedsTestCapabilities;

class TextLessonCrudTest extends TestCase
{
    use RefreshDatabase, AuthenticatesWithJwt, SeedsTestCapabilities;

    public function test_it_can_create_a_text_lesson(): void
    {
        $response = $this->withHeader('Authorization', "Bearer {$this->token}")
            ->postJson("/api/tenant/courses/{$this->course->id}/chapters/{$this->chapter->id}/text-lessons", [
                'title' => 'Introduction to Laravel',
                'content' => '<p>Welcome to our Laravel course!</p>',
                'accessibility' => 'free',
                'status' => 'active'
            ]);

        $response->assertStatus(201);
        $this->assertDatabaseHas('text_lessons', ['title' => 'Introduction to Laravel']);
    }
    // ... test_it_can_list_text_lessons_in_a_chapter, test_it_can_update_a_text_lesson, test_it_can_delete_a_text_lesson
}
```

#### [LearningProgressTest.php](file:///c:/Users/sayan/lms/Ubotz_2.0/backend/tests/Feature/TenantDashboard/LearningProgress/LearningProgressTest.php)
```php
<?php

declare(strict_types=1);

namespace Tests\Feature\TenantDashboard\LearningProgress;

use Tests\TestCase;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Traits\AuthenticatesWithJwt;

class LearningProgressTest extends TestCase
{
    use RefreshDatabase, AuthenticatesWithJwt;

    public function test_can_get_initial_course_progress(): void
    {
        $response = $this->withHeaders(['Authorization' => "Bearer {$this->token}"])
            ->getJson("/api/tenant/courses/{$this->courseId}/learning-progress");

        $response->assertStatus(200)
            ->assertJsonPath('data.progress_percent', 0);
    }

    public function test_can_toggle_item_progress(): void
    {
        $response = $this->withHeaders(['Authorization' => "Bearer {$this->token}"])
            ->postJson("/api/tenant/courses/{$this->courseId}/learning-progress/toggle", [
                'item_type' => 'text_lesson',
                'item_id' => $this->lessonId,
            ]);

        $response->assertStatus(200)->assertJson(['data' => ['completed' => true]]);
    }
}
```

### [EnrollmentControllerTest.php](file:///c:/Users/sayan/lms/Ubotz_2.0/backend/tests/Feature/TenantDashboard/Enrollment/EnrollmentControllerTest.php)
```php
<?php

declare(strict_types=1);

namespace Tests\Feature\TenantDashboard\Enrollment;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;
use App\Infrastructure\Persistence\TenantAdminDashboard\User\UserRecord;
use App\Infrastructure\Persistence\TenantAdminDashboard\Course\CourseRecord;

class EnrollmentControllerTest extends TestCase
{
    use RefreshDatabase;

    public function test_can_enroll_in_free_course()
    {
        $course = CourseRecord::factory()->create(['price_amount' => 0]);
        $response = $this->actingAs($this->user, 'tenant_api')->postJson("/api/tenant/enrollments/courses/{$course->id}/enroll");

        $response->assertStatus(200);
        $this->assertDatabaseHas('course_enrollments', ['course_id' => $course->id, 'source' => 'free']);
    }

    public function test_check_access_returns_true_if_enrolled()
    {
        $course = CourseRecord::factory()->create(['price_amount' => 0]);
        // ... (Seed enrollment)
        $response = $this->actingAs($this->user, 'tenant_api')->getJson("/api/tenant/enrollments/courses/{$course->id}/check-access");

        $response->assertStatus(200);
        $response->assertJsonPath('data.has_access', true);
    }
}
```

## Unit Tests

### [CheckCourseAccessUseCaseTest.php](file:///c:/Users/sayan/lms/Ubotz_2.0/backend/tests/Unit/TenantDashboard/Enrollment/CheckCourseAccessUseCaseTest.php)
```php
<?php

declare(strict_types=1);

namespace Tests\Unit\TenantDashboard\Enrollment;

use Tests\TestCase;
use App\Application\TenantDashboard\Enrollment\Services\CheckCourseAccessUseCase;
use App\Domain\TenantDashboard\Enrollment\Entities\CourseEnrollmentEntity;

class CheckCourseAccessUseCaseTest extends TestCase
{
    public function test_user_has_access_if_active_enrollment_exists()
    {
        $repositoryMock = $this->createMock(CourseEnrollmentRepositoryInterface::class);
        $useCase = new CheckCourseAccessUseCase($repositoryMock);

        $repositoryMock->method('findByUserIdAndCourseId')->willReturn(CourseEnrollmentEntity::create([...]));
        $this->assertTrue($useCase->execute(1, 1));
    }
}
```

---

## Test Execution Commands

### Execution via Docker

To run the full suite of Course feature tests, execute the following commands in any terminal:

```powershell
# Run all Chapter tests
docker exec -it ubotz_backend php artisan test tests/Feature/TenantAdminDashboard/Course/ChapterCrudTest.php

# Run all Course File tests
docker exec -it ubotz_backend php artisan test tests/Feature/TenantAdminDashboard/Course/CourseFileCrudTest.php

# Run all Text Lesson tests
docker exec -it ubotz_backend php artisan test tests/Feature/TenantAdminDashboard/Course/TextLessonCrudTest.php

# Run Learning Progress tests
docker exec -it ubotz_backend php artisan test tests/Feature/TenantDashboard/LearningProgress/LearningProgressTest.php

# Run Enrollment Unit tests
docker exec -it ubotz_backend php artisan test tests/Unit/TenantDashboard/Enrollment/CheckCourseAccessUseCaseTest.php

# Run Enrollment Feature tests
docker exec -it ubotz_backend php artisan test tests/Feature/TenantDashboard/Enrollment/EnrollmentControllerTest.php
```

Detailed test logs can be found in the backend's `documentation/TEST_COMMANDS.md` file.
