# Admin Blog Migration Gap Analysis

Full inventory of Mentora's Admin Blog sub-features versus what Ubotz 2.0 currently implements. Since this is a new feature migration, most Ubotz columns will be marked as missing (❌) indicating work that needs to be done.

## Legend

| Symbol | Meaning |
|--------|---------|
| ✅ | Implemented in Ubotz |
| ❌ | Missing — needs implementation |
| ⚠️ | Partially implemented |

---

## 1. Blog Categories (Admin)

Mentora organizes blog posts into basic categories.

| Feature | Mentora | Ubotz | Gap? |
|---------|---------|-------|------|
| `blog_categories` table | ✅ | ✅ | ✅ Tenant-scoped schema with translations |
| Category CRUD (Admin Panel) | ✅ | ✅ | ✅ `BlogCategoryWriteController` + `ListBlogCategoriesQuery` |
| Translatable titles (`BlogCategoryTranslation`) | ✅ | ✅ | ✅ Multi-table translation strategy implemented |
| Auto-slug generation | ✅ | ✅ | ✅ `BlogSlug` Value Object implemented |
| Post count aggregation | ✅ | ✅ | ✅ Implemented in `ListBlogCategoriesQuery` via subquery |

---

## 2. Core Blog Post CRUD & Metadata (Admin)

The central blog entity and its management in the Admin Panel.

| Feature | Mentora | Ubotz | Gap? |
|---------|---------|-------|------|
| `blog` table | ✅ | ✅ | ✅ `blog_posts` table implemented |
| Create post (Author, Category, Image) | ✅ | ✅ | ✅ `BlogPostWriteController` implemented |
| Update/Edit post | ✅ | ✅ | ✅ Full update UseCase with i18n support |
| Delete post | ✅ | ✅ | ✅ Physical delete implemented (soft delete can be added if required) |
| Translatable content (`BlogTranslation`) | ✅ (title, desc, meta, content) | ✅ | ✅ `blog_post_translations` table implemented |
| Status lifecycle (pending → publish) | ✅ | ✅ | ✅ `BlogPostStatus` VO with transition logic (DRAFT/PUBLISHED) |
| Enable/Disable Comments toggle | ✅ | ✅ | ✅ `enable_comment` boolean implemented |
| Auto-slug generation | ✅ | ✅ | ✅ `BlogSlug` Value Object used in Post creation |
| Admin Filters (Date, Title, Category, Author, Status) | ✅ | ✅ | ✅ `ListBlogPostsQuery` with comprehensive filters |
| Product Badges integration | ✅ | ❌ | ❌ Badges integration needed |
| Social Share Links generation | ✅ | ❌ | ❌ Model helper/service needed |

---

## 3. Rewards & Notifications (Blog Actions)

Mentora ties blog actions into its gamification and notification systems.

| Feature | Mentora | Ubotz | Gap? |
|---------|---------|-------|------|
| Notification: `publish_instructor_blog_post` | ✅ | ❌ | ❌ Trigger when Admin publishes Instructor's post |
| Reward Points: `CREATE_BLOG_BY_INSTRUCTOR` | ✅ | ❌ | ❌ Grant upon post publication |

---

## 4. Blog Comments & Moderation (Admin)

A dedicated comment system implemented for the Blog context in Ubotz 2.0.

| Feature | Mentora | Ubotz | Gap? |
|---------|---------|-------|------|
| `comments` table (polymorphic setup) | ✅ | ✅ | ✅ Dedicated `blog_comments` table (no polymorphism per DDD) |
| List comments (Filters: Date, Post, Status, User) | ✅ | ✅ | ✅ `ListBlogCommentsQuery` implemented |
| Moderation stats | ✅ | ⚠️ | ⚠️ Query returns items; counts handled by frontend or specific query |
| Toggle Status (pending ↔ active) | ✅ | ✅ | ✅ `ModerateBlogCommentUseCase` (PENDING ↔ ACTIVE) |
| Admin Edit User Comment | ✅ | ✅ | ✅ `EditBlogCommentUseCase` implemented |
| Admin Reply to Comment | ✅ | ✅ | ✅ `ReplyToBlogCommentUseCase` implemented |
| Delete Comment | ✅ | ✅ | ✅ `DeleteBlogCommentUseCase` implemented |
| Comment Reporting (`comment_reports`) | ✅ | ❌ | ❌ Moderation queue needed |
| Reward Points: base `COMMENT` | ✅ | ❌ | ❌ Grant upon approval |
| Reward Points: `COMMENT_FOR_INSTRUCTOR_BLOG` | ✅ | ❌ | ❌ Grant upon approval (Blog specific) |
| Notification: `new_comment` (To Author) | ✅ | ❌ | ❌ Trigger upon comment approval |

---

## Architectural Considerations in Ubotz 2.0 (DDD Implementation)

The Blog feature has been migrated to Ubotz 2.0 following these DDD principles:

1. **Bounded Context**: Implemented as a dedicated context within `App\Domain\TenantAdminDashboard\Blog`, `App\Application\TenantAdminDashboard\Blog`, etc.
2. **Entities & Value Objects**:
   - `BlogCategoryEntity`
   - `BlogPostEntity` (Aggregate Root)
   - `BlogCommentEntity`
   - `BlogPostStatus` (Value Object: DRAFT, PUBLISHED)
   - `BlogCommentStatus` (Value Object: PENDING, ACTIVE)
   - `BlogSlug` (Value Object with auto-generation from title)
3. **Multi-Tenancy**: Fully tenant-scoped. `blog_categories`, `blog_posts`, and `blog_comments` include a `tenant_id` column, and Eloquent models use the `BelongsToTenant` trait to enforce isolation.
4. **Translations**: Handled via dedicated translation tables (`blog_category_translations`, `blog_post_translations`) to support multi-language titles and content while maintaining clear ownership.
5. **Dedicated Comment Table**: To preserve domain integrity and simplify multi-tenancy logic, a dedicated `blog_comments` table was chosen over a global polymorphic comment table.
6. **Persistence Layer**: Segregated into `Record` models (Infrastructure) and `Repository` interfaces (Domain) to ensure domain logic remains framework-agnostic.
7. **Read Modeling**: Implemented as specialized `Queries` in the Application layer to handle complex filtering and data aggregation for the Admin Panel.
