# Blog Feature Migration Plan
## Mentora → UBOTZ 2.0 (Tenant Admin Dashboard)

> **Read before implementing**: [Feature Migration Guide](file:///c:/Users/sayan/lms/Ubotz_2.0/backend/documentation/Feature%20Migration%20Guide%20-%20Mentora%20to%20UBOTZ%202.md) and [Developer Manual](file:///c:/Users/sayan/lms/Ubotz_2.0/backend/documentation/Ubotz%202%20developer%20instruction%20manual%20.md) — both are MANDATORY reading.

- **Priority:** 🔵 Low  
- **Complexity:** Low  
- **Bounded Context:** `TenantAdminDashboard` (Blog posts are tenant-owned content)

---

## Scope

Migrate only the **Admin/Instructor panel blog management** functions. Public-facing blog web pages (discovery, reading) are **out of scope** for this phase.

### Legacy Source Files

| Type | File | Extract |
|------|------|---------|
| Model | [`Blog.php`](file:///c:/Users/sayan/lms/Ubotz_2.0/mentora_production/app/Models/Blog.php) | Relationships, slug logic, share links |
| Model | [`BlogCategory.php`](file:///c:/Users/sayan/lms/Ubotz_2.0/mentora_production/app/Models/BlogCategory.php) | Category structure and slug |
| Model | [`BlogTranslation.php`](file:///c:/Users/sayan/lms/Ubotz_2.0/mentora_production/app/Models/Translation/BlogTranslation.php) | Translation fields |
| Model | [`BlogCategoryTranslation.php`](file:///c:/Users/sayan/lms/Ubotz_2.0/mentora_production/app/Models/Translation/BlogCategoryTranslation.php) | Category translation fields |
| Controller | [`Admin/BlogController.php`](file:///c:/Users/sayan/lms/Ubotz_2.0/mentora_production/app/Http/Controllers/Admin/BlogController.php) | CRUD, filters, reward/notification dispatch |
| Controller | [`Admin/BlogCategoriesController.php`](file:///c:/Users/sayan/lms/Ubotz_2.0/mentora_production/app/Http/Controllers/Admin/BlogCategoriesController.php) | Category CRUD |
| Controller | [`Admin/CommentsController.php`](file:///c:/Users/sayan/lms/Ubotz_2.0/mentora_production/app/Http/Controllers/Admin/CommentsController.php) | Comment moderation (blog section) |
| Migration | `create_blog_categories_table.php` | Schema: id, slug |
| Migration | `create_blog_table.php` | Schema: id, category_id, author_id, slug, image, enable_comment, status, timestamps |
| Migration | `create_blog_translations_table.php` | Schema: blog_id, locale, title, description, meta_description, content |
| Migration | `create_blog_category_translations_table.php` | Schema: blog_category_id, locale, title |
| Migration | `add_blog_id_to_comments_table.php` | Comments get a blog_id FK |

### Legacy → UBOTZ Use Case Mapping

| Legacy Method | UBOTZ UseCase | Type |
|---------------|--------------|------|
| `BlogCategoriesController@store` | `CreateBlogCategoryUseCase` | Write |
| `BlogCategoriesController@update` | `UpdateBlogCategoryUseCase` | Write |
| `BlogCategoriesController@delete` | `DeleteBlogCategoryUseCase` | Write |
| *(listing page)* | `ListBlogCategoriesQuery` | Read |
| `BlogController@store` | `CreateBlogPostUseCase` | Write |
| `BlogController@update` | `UpdateBlogPostUseCase` | Write |
| `BlogController@delete` | `DeleteBlogPostUseCase` | Write |
| `BlogController@index` | `ListBlogPostsQuery` | Read |
| *(blog@show)* | `GetBlogPostQuery` | Read |
| `CommentsController@toggleStatus` | `ModerateBlogCommentUseCase` | Write |
| `CommentsController@update` | `EditBlogCommentUseCase` | Write |
| `CommentsController@storeReply` | `ReplyToBlogCommentUseCase` | Write |
| `CommentsController@delete` | `DeleteBlogCommentUseCase` | Write |
| `CommentsController@index` | `ListBlogCommentsQuery` | Read |

---

## Phase 1: Database Migrations

Two UBOTZ 2.0 migrations needed. Since blogs are tenant-owned, all tables go in `database/migrations/tenant/`.

> [!IMPORTANT]
> The legacy `blog` table uses an ENUM for status. **UBOTZ 2.0 forbids MySQL ENUMs** — use `VARCHAR(30)` instead.
> The legacy schema has no `tenant_id`. You MUST add it to every table.

### Migration 1A: `blog_categories` + `blog_category_translations`

```
File: database/migrations/tenant/YYYY_MM_DD_000001_create_blog_category_tables.php
```

```php
// blog_categories
$table->id();
$table->unsignedBigInteger('tenant_id');     // ← NEW (multi-tenancy)
$table->string('name');                       // not translatable on this row level
$table->string('slug');
$table->timestamps();
$table->index(['tenant_id', 'slug']);

// blog_category_translations
$table->id();
$table->unsignedBigInteger('blog_category_id');
$table->string('locale', 10)->index();
$table->string('title');
$table->unique(['blog_category_id', 'locale']);
$table->foreign('blog_category_id')->references('id')->on('blog_categories')->onDelete('cascade');
```

### Migration 1B: `blog_posts` + `blog_post_translations`

```
File: database/migrations/tenant/YYYY_MM_DD_000002_create_blog_post_tables.php
```

```php
// blog_posts (renamed from legacy 'blog' to avoid reserved word conflicts)
$table->id();
$table->unsignedBigInteger('tenant_id');           // ← NEW
$table->unsignedBigInteger('category_id')->nullable();
$table->unsignedBigInteger('author_id');           // FK to tenant users
$table->string('slug')->unique();
$table->string('image');
$table->boolean('enable_comment')->default(true);
$table->string('status', 30)->default('draft');    // ← VARCHAR not ENUM: 'draft', 'published'
$table->timestamps();
$table->index(['tenant_id', 'status']);
$table->index(['tenant_id', 'category_id']);

// blog_post_translations
$table->id();
$table->unsignedBigInteger('blog_post_id');
$table->string('locale', 10)->index();
$table->string('title');
$table->text('description');
$table->longText('content');
$table->text('meta_description')->nullable();
$table->unique(['blog_post_id', 'locale']);
$table->foreign('blog_post_id')->references('id')->on('blog_posts')->onDelete('cascade');
```

### Migration 1C: `blog_comments`

> [!NOTE]
> The legacy Mentora system uses a single giant polymorphic `comments` table with nullable FK columns for `blog_id`, `webinar_id`, `product_id`, etc. This architecture is an anti-pattern. For UBOTZ 2.0, create a **dedicated `blog_comments` table** to maintain proper domain boundaries.

```
File: database/migrations/tenant/YYYY_MM_DD_000003_create_blog_comments_table.php
```

```php
$table->id();
$table->unsignedBigInteger('tenant_id');           // ← REQUIRED
$table->unsignedBigInteger('blog_post_id');
$table->unsignedBigInteger('user_id');
$table->unsignedBigInteger('reply_id')->nullable(); // self-referencing for replies
$table->text('comment');
$table->string('status', 30)->default('pending');  // 'pending', 'active'
$table->timestamps();
$table->index(['tenant_id', 'blog_post_id']);
$table->index(['tenant_id', 'status']);
$table->foreign('blog_post_id')->references('id')->on('blog_posts')->onDelete('cascade');
$table->foreign('reply_id')->references('id')->on('blog_comments')->onDelete('cascade');
```

---

## Phase 2: Domain Layer

**Location:** `app/Domain/TenantAdminDashboard/Blog/`

> [!CAUTION]
> Zero `use Illuminate\` imports allowed in the Domain layer. Pure PHP only.

### 2.1 Value Objects

| VO Class | File | Values |
|----------|------|--------|
| `BlogPostStatus` | `ValueObjects/BlogPostStatus.php` | `DRAFT`, `PUBLISHED` |
| `BlogCommentStatus` | `ValueObjects/BlogCommentStatus.php` | `PENDING`, `ACTIVE` |
| `BlogSlug` | `ValueObjects/BlogSlug.php` | Immutable validated slug string |

**`BlogPostStatus` must implement:**
- `canPublish()` — `DRAFT` only
- `canUnpublish()` — `PUBLISHED` only
- `isPublished()` — for access checks

### 2.2 Entities

#### `BlogCategoryEntity`
- Properties: `id`, `tenantId`, `name`, `slug`, `translations[]`
- Factory: `create(int $tenantId, string $name, BlogSlug $slug)`
- Business rule: No deletion if posts exist (enforce in UseCase)
- Events: `BlogCategoryCreated`, `BlogCategoryUpdated`, `BlogCategoryDeleted`

#### `BlogPostEntity` (Aggregate Root)
- Properties: `id`, `tenantId`, `categoryId`, `authorId`, `slug`, `image`, `enableComment`, `status`, `translations[]`
- Factory: `create(...)`, `reconstitute(...)`
- Methods:
  - `publish()` — transitions from DRAFT → PUBLISHED, emits `BlogPostPublished`
  - `unpublish()` — transitions from PUBLISHED → DRAFT, emits `BlogPostUnpublished`
  - `update(...)` — updates mutable fields
  - `delete()` — emits `BlogPostDeleted`
- Events: `BlogPostCreated`, `BlogPostPublished`, `BlogPostUnpublished`, `BlogPostUpdated`, `BlogPostDeleted`

#### `BlogCommentEntity`
- Properties: `id`, `tenantId`, `blogPostId`, `userId`, `replyId`, `comment`, `status`
- Methods:
  - `approve()` — PENDING → ACTIVE, emits `BlogCommentApproved`
  - `pend()` — ACTIVE → PENDING
- Events: `BlogCommentApproved`

### 2.3 Repository Interfaces

```php
// BlogCategoryRepositoryInterface
public function findById(int $tenantId, int $id): ?BlogCategoryEntity;
public function save(BlogCategoryEntity $category): BlogCategoryEntity;
public function delete(int $tenantId, int $id): void;
public function hasPostsInCategory(int $tenantId, int $categoryId): bool;

// BlogPostRepositoryInterface
public function findById(int $tenantId, int $id): ?BlogPostEntity;
public function findBySlug(int $tenantId, string $slug): ?BlogPostEntity;
public function save(BlogPostEntity $post): BlogPostEntity;
public function delete(int $tenantId, int $id): void;

// BlogCommentRepositoryInterface
public function findById(int $tenantId, int $id): ?BlogCommentEntity;
public function save(BlogCommentEntity $comment): BlogCommentEntity;
public function delete(int $tenantId, int $id): void;
```

### 2.4 Domain Exceptions

- `BlogPostNotFoundException`
- `BlogCategoryNotFoundException`
- `BlogCommentNotFoundException`
- `BlogCategoryNotEmptyException` (prevent delete if posts exist)
- `BlogPostStatusTransitionException`

---

## Phase 3: Application Layer

**Location:** `app/Application/TenantAdminDashboard/Blog/`

### 3.1 Commands (Write)

Each is a `final class`, `declare(strict_types=1)`, `readonly` constructor, with `int $tenantId` as **first** param and `?int $actorId` as last.

| Command | Key Parameters |
|---------|---------------|
| `CreateBlogCategoryCommand` | `tenantId`, `name`, `locale`, `actorId` |
| `UpdateBlogCategoryCommand` | `tenantId`, `categoryId`, `name`, `locale`, `actorId` |
| `DeleteBlogCategoryCommand` | `tenantId`, `categoryId`, `actorId` |
| `CreateBlogPostCommand` | `tenantId`, `categoryId`, `authorId`, `image`, `slug`, `enableComment`, `publish`, `locale`, `title`, `description`, `content`, `metaDescription`, `actorId` |
| `UpdateBlogPostCommand` | `tenantId`, `postId`, `categoryId`, `authorId`, `image`, `enableComment`, `publish`, `locale`, `title`, `description`, `content`, `metaDescription`, `actorId` |
| `DeleteBlogPostCommand` | `tenantId`, `postId`, `actorId` |
| `ModerateBlogCommentCommand` | `tenantId`, `commentId`, `actorId` |
| `EditBlogCommentCommand` | `tenantId`, `commentId`, `comment`, `actorId` |
| `ReplyToBlogCommentCommand` | `tenantId`, `blogPostId`, `parentCommentId`, `comment`, `actorId` |
| `DeleteBlogCommentCommand` | `tenantId`, `commentId`, `actorId` |

### 3.2 Use Cases (Write)

Follow the fixed orchestration pattern from the Migration Guide §7:
1. Tenant-scoped precondition check
2. Domain entity creation / mutation
3. `DB::transaction()` wrapping persist + audit log
4. Release events after commit

| UseCase | Notes |
|---------|-------|
| `CreateBlogCategoryUseCase` | Auto-generate slug from name (util or VO) |
| `UpdateBlogCategoryUseCase` | Update translation record for given locale |
| `DeleteBlogCategoryUseCase` | Throw `BlogCategoryNotEmptyException` if posts exist |
| `CreateBlogPostUseCase` | Auto-generate slug, if `publish=true` call `entity->publish()` |
| `UpdateBlogPostUseCase` | Update translation for locale; handle status change |
| `DeleteBlogPostUseCase` | Cascade deletes handled by DB FK |
| `ModerateBlogCommentUseCase` | Toggles `pending` ↔ `active` |
| `EditBlogCommentUseCase` | Updates comment text |
| `ReplyToBlogCommentUseCase` | Creates a new comment with `parent_id` |
| `DeleteBlogCommentUseCase` | Hard delete the comment |

### 3.3 Queries (Read)

All use `DB::table()` raw queries (or a query builder facade) — **not** Eloquent Repositories.

| Query | Filters |
|-------|---------|
| `ListBlogCategoriesQuery` | `search`, `page`, `perPage` |
| `ListBlogPostsQuery` | `search`, `categoryId`, `authorId`, `status`, `dateFrom`, `dateTo`, `page`, `perPage` |
| `GetBlogPostQuery` | `tenantId`, `postId` |
| `ListBlogCommentsQuery` | `blogPostId`, `status`, `userId`, `page`, `perPage` |

---

## Phase 4: Infrastructure Layer

**Location:** `app/Infrastructure/Persistence/TenantAdminDashboard/Blog/`

### 4.1 Eloquent Record Models

| Record Model | Table | Traits |
|---|---|---|
| `BlogCategoryRecord` | `blog_categories` | **Must use `BelongsToTenant`** |
| `BlogPostRecord` | `blog_posts` | **Must use `BelongsToTenant`** |
| `BlogPostTranslationRecord` | `blog_post_translations` | None (no direct tenant scope) |
| `BlogCategoryTranslationRecord` | `blog_category_translations` | None |
| `BlogCommentRecord` | `blog_comments` | **Must use `BelongsToTenant`** |

### 4.2 Eloquent Repositories

| Repository | Implements |
|---|---|
| `EloquentBlogCategoryRepository` | `BlogCategoryRepositoryInterface` |
| `EloquentBlogPostRepository` | `BlogPostRepositoryInterface` |
| `EloquentBlogCommentRepository` | `BlogCommentRepositoryInterface` |

**Mapper requirement:** Each repository must implement `toEntity(Record $record): Entity` and the save method must handle the translation upsert separately (parent first, then translation row).

### 4.3 Service Provider Registration

Add bindings to the appropriate `AppServiceProvider` (or a new `BlogServiceProvider`):

```php
$this->app->bind(BlogCategoryRepositoryInterface::class, EloquentBlogCategoryRepository::class);
$this->app->bind(BlogPostRepositoryInterface::class,     EloquentBlogPostRepository::class);
$this->app->bind(BlogCommentRepositoryInterface::class,  EloquentBlogCommentRepository::class);
```

---

## Phase 5: HTTP Layer

**Location:**  
- `app/Http/Controllers/Api/TenantAdminDashboard/Blog/`  
- Routes: `routes/tenant_dashboard/blog.php`

### 5.1 Controllers

Split into Read/Write pairs (each method ≤ 20 lines):

| Controller | Methods |
|---|---|
| `BlogCategoryReadController` | `index` |
| `BlogCategoryWriteController` | `store`, `update`, `destroy` |
| `BlogPostReadController` | `index`, `show` |
| `BlogPostWriteController` | `store`, `update`, `destroy` |
| `BlogCommentReadController` | `index` |
| `BlogCommentWriteController` | `toggleStatus`, `update`, `reply`, `destroy` |

### 5.2 Form Requests

| Request | Validates |
|---|---|
| `StoreBlogCategoryRequest` | `locale`, `title` (required strings) |
| `UpdateBlogCategoryRequest` | same |
| `StoreBlogPostRequest` | `locale`, `title`, `category_id`, `image`, `description`, `content` |
| `UpdateBlogPostRequest` | same but partial update |
| `UpdateBlogCommentRequest` | `comment` (required string) |
| `ReplyBlogCommentRequest` | `comment`, `parent_comment_id` (required) |

### 5.3 API Routes

Add to `routes/tenant_dashboard/blog.php` and require it from `routes/api.php`:

```php
// Blog Categories
Route::get('/blog/categories', [BlogCategoryReadController::class, 'index']);
Route::post('/blog/categories', [BlogCategoryWriteController::class, 'store']);
Route::put('/blog/categories/{id}', [BlogCategoryWriteController::class, 'update']);
Route::delete('/blog/categories/{id}', [BlogCategoryWriteController::class, 'destroy']);

// Blog Posts
Route::get('/blog/posts', [BlogPostReadController::class, 'index']);
Route::get('/blog/posts/{id}', [BlogPostReadController::class, 'show']);
Route::post('/blog/posts', [BlogPostWriteController::class, 'store']);
Route::put('/blog/posts/{id}', [BlogPostWriteController::class, 'update']);
Route::delete('/blog/posts/{id}', [BlogPostWriteController::class, 'destroy']);

// Blog Comments
Route::get('/blog/posts/{postId}/comments', [BlogCommentReadController::class, 'index']);
Route::patch('/blog/comments/{id}/toggle-status', [BlogCommentWriteController::class, 'toggleStatus']);
Route::put('/blog/comments/{id}', [BlogCommentWriteController::class, 'update']);
Route::post('/blog/comments/{id}/reply', [BlogCommentWriteController::class, 'reply']);
Route::delete('/blog/comments/{id}', [BlogCommentWriteController::class, 'destroy']);
```

---

## Phase 6: Verification

### Architecture Checks

```powershell
# No Illuminate imports in domain layer
docker exec -it ubotz_backend grep -rn "use Illuminate" app/Domain/TenantAdminDashboard/Blog/
# Expected: 0 results

# All blog Record models have BelongsToTenant
docker exec -it ubotz_backend grep -rLn "BelongsToTenant" app/Infrastructure/Persistence/TenantAdminDashboard/Blog/
# Should only return Translation records (they don't need it)

# No enums in migrations
docker exec -it ubotz_backend grep -rn "->enum(" database/migrations/tenant/
# Expected: 0 results
```

### Tests Required

| Test Class | Covers |
|---|---|
| `BlogPostStatusTest` | VO transitions — `create`, `canPublish`, `isPublished` |
| `BlogPostEntityTest` | Entity `publish()`, `unpublish()`, events emitted |
| `BlogCommentEntityTest` | Entity `approve()`, `pend()`, events emitted |
| `CreateBlogPostUseCaseTest` | Happy path + auth check + tenant isolation |
| `DeleteBlogCategoryUseCaseTest` | `BlogCategoryNotEmptyException` when posts exist |
| `ModerateBlogCommentUseCaseTest` | Toggle behaviour, reward emission |
| `BlogTenantIsolationTest` | Tenant A cannot read or mutate Tenant B's posts/comments |

---

## Implementation Order (Recommended)

```
Step 1  → Migrations (1A, 1B, 1C)
Step 2  → Domain: Value Objects (BlogPostStatus, BlogCommentStatus, BlogSlug)
Step 3  → Domain: Entities (BlogCategoryEntity, BlogPostEntity, BlogCommentEntity)
Step 4  → Domain: Events (BlogPostCreated, BlogPostPublished, BlogCommentApproved, ...)
Step 5  → Domain: Exceptions + Repository Interfaces
Step 6  → Infrastructure: Record models + Eloquent Repositories
Step 7  → Infrastructure: Service Provider bindings
Step 8  → Application: Commands
Step 9  → Application: UseCases (Write)
Step 10 → Application: Queries (Read)
Step 11 → HTTP: FormRequests + Controllers + Routes
Step 12 → Tests + Verification
```

> [!NOTE]
> **Total estimated file count:** ~60 files (6 migrations + 8 domain + 8 events + 5 exceptions + 4 repo interfaces + 7 record models + 3 eloquent repos + 10 commands + 10 usecases + 4 queries + 6 controllers + 6 form requests + 2 route files).
