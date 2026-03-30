# PHPUnit 10+ Upgrade: Test Annotations to Fix

The `/** @test */` docblock annotation has been deprecated in PHPUnit 10+ and will be removed in PHPUnit 12. Tests should either use the `#[Test]` attribute or prefix the method name with `test_`.

## Files Needing Updates

The following 9 files in the backend test suite contain the deprecated `/** @test */` docblock and have been targeted for automated updates (by renaming the methods to start with `test_` instead of using the annotation):

1. `tests/Feature/TenantAdminDashboard/Course/CourseTypeMigrationTest.php`
2. `tests/Feature/TenantAdminDashboard/Course/PersonalNoteCrudTest.php`
3. `tests/Feature/TenantAdminDashboard/Course/TextLessonAttachmentCrudTest.php`
4. `tests/Feature/TenantAdminDashboard/Quiz/QuizFeatureTest.php`
5. `tests/Unit/Domain/Subscription/Services/ModuleCapabilityMapTest.php`
6. `tests/Unit/Domain/Subscription/Services/ModuleEntitlementResolverTest.php`
7. `tests/Unit/Domain/Subscription/ValueObjects/ModuleCodeTest.php`
8. `tests/Unit/Domain/Subscription/ValueObjects/ModuleEntitlementSetTest.php`
9. `tests/Unit/Domain/TenantAdminDashboard/Course/LiveSessionAndGiftDomainUnitTest.php`

## Migration Strategy

An automated script has been used to adjust these files, replacing the `/** @test */` docblock and prepending the test method's name with `test_`.

For any new tests authored going forward, either use the `test_` method prefix (e.g., `public function test_it_can_do_something()`) or use the PHP 8 attribute `#[Test]` (requiring `use PHPUnit\Framework\Attributes\Test;`).

