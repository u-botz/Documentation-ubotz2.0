# UBOTZ 2.0 Blog Technical Specification

The Blog module provides **tenant-scoped** categories and posts with **per-locale translations**, **comments**, and a **public** read API for the marketing website. Application code: `App\Application\TenantAdminDashboard\Blog`; public queries: `App\Application\PublicFacing\LandingPage` (e.g. `PublicBlogQueryServiceInterface`).

---

## 1. HTTP surface

### 1.1 Tenant admin / authenticated (`/api/tenant`)

Routes: `backend/routes/tenant_dashboard/blog.php`.

- Wrapped in **`tenant.module:module.blog`**.
- Mutations require **`tenant.capability:blog.manage`** (categories, posts, comment moderation actions).
- Reads for categories/posts/comments are available without that capability on the same route file (GETs).

| Area | Method | Path |
|------|--------|------|
| Categories | `GET` | `/api/tenant/blog/categories`, `/api/tenant/blog/categories/{id}` |
| Categories | `POST`, `PUT`, `DELETE` | `/api/tenant/blog/categories`, `/api/tenant/blog/categories/{id}` |
| Posts | `GET` | `/api/tenant/blog/posts`, `/api/tenant/blog/posts/{id}` |
| Posts | `POST`, `PUT`, `DELETE` | `/api/tenant/blog/posts`, `/api/tenant/blog/posts/{id}` |
| Comments | `GET` | `/api/tenant/blog/posts/{postId}/comments` |
| Comments | `PATCH`, `PUT`, `POST`, `DELETE` | `/api/tenant/blog/comments/{id}/toggle-status`, `.../comments/{id}`, `.../comments/{id}/reply` |

**Frontend constants:** `frontend/config/api-endpoints.ts` — `TENANT.BLOG.*`.

### 1.2 Public website (unauthenticated JSON)

`backend/routes/api.php`:

`GET /api/public/tenants/{tenantSlug}/website/blog/categories`  
`GET /api/public/tenants/{tenantSlug}/website/blog/posts`  
`GET /api/public/tenants/{tenantSlug}/website/blog/posts/{postSlug}`

Controller: `PublicWebsiteBlogController`. Requests pass through **`PublicWebsiteTenantContentAccessGate`** (blocked tenants return 404). **Locale** for list/show is derived from the **`Accept-Language`** header (first two letters, defaulting toward `en`), not a dedicated `ResolveLocale` middleware class.

---

## 2. Relational schema (tenant DB)

### 2.1 Categories

`2026_03_08_174543_create_blog_category_tables.php`:

- **`blog_categories`**: `tenant_id`, `name`, `slug`; index `(tenant_id, slug)`.
- **`blog_category_translations`**: `blog_category_id`, `locale`, `title`; unique `(blog_category_id, locale)`.

### 2.2 Posts

`2026_03_08_174544_create_blog_post_tables.php`:

- **`blog_posts`**: `tenant_id`, `category_id` (nullable), `author_id`, **`slug` unique** (per-tenant DB), `image`, `enable_comment`, `status` (default `draft`); indexes on `(tenant_id, status)`, `(tenant_id, category_id)`.
- **`blog_post_translations`**: `blog_post_id`, `locale`, `title`, `description`, `content`, `meta_description`; unique `(blog_post_id, locale)`.

### 2.3 Comments

`2026_03_08_174545_create_blog_comments_table.php`:

- **`blog_comments`**: `tenant_id`, `blog_post_id`, `user_id`, `reply_id` (self-FK), `comment`, `status` (default `pending`); indexes on `(tenant_id, blog_post_id)`, `(tenant_id, status)`.

---

## 3. Application use cases (tenant admin)

| Area | Examples |
|------|----------|
| Categories | `CreateBlogCategoryUseCase`, `UpdateBlogCategoryUseCase`, `DeleteBlogCategoryUseCase` |
| Posts | `CreateBlogPostUseCase`, `UpdateBlogPostUseCase`, `DeleteBlogPostUseCase` |
| Comments | `ModerateBlogCommentUseCase`, `ReplyToBlogCommentUseCase`, `EditBlogCommentUseCase`, `DeleteBlogCommentUseCase` |

Queries: `ListBlogPostsQuery`, `ListBlogCategoriesQuery`, `GetBlogPostQuery`, `ListBlogCommentsQuery`.

---

## 4. Performance & caching

The application-layer Blog module does **not** use `Cache::` facades in a way that replaces translation joins for every request. List/show performance depends on repository/query implementation and DB indexes. **Eager-loading** and **caching** should be verified per endpoint if documenting SLAs.

---

## 5. Security & content safety

- **Tenancy:** Posts and categories are tenant-scoped; public access is filtered by **tenant slug** and the public website gate.
- **Comments:** Stored text; **sanitize/escape on output** in the SPA and any HTML renderers — do not rely on DB-level “sanitization” alone.
- **XSS:** Treat `content` and `comment` as untrusted unless a dedicated sanitizer is applied in the pipeline.

---

## 6. Frontend

| Area | Location |
|------|----------|
| Admin pages | `frontend/app/tenant-admin-dashboard/blog/*` (list, new, edit, categories, comments) |
| Components | `frontend/features/tenant-admin/blog/*` — `use-blog.ts`, forms, tables, `CommentList`, `CategoryManager` |
| Public site | Consumes **`/api/public/tenants/{tenantSlug}/website/blog/...`** from the landing stack |

---

## 7. Linked code references

| Layer | Path |
|-------|------|
| Application (tenant) | `backend/app/Application/TenantAdminDashboard/Blog/` |
| Public queries | `backend/app/Application/PublicFacing/LandingPage/` (blog query service) |
| HTTP (tenant) | `backend/app/Http/Controllers/Api/TenantAdminDashboard/Blog/` |
| HTTP (public) | `backend/app/Http/Controllers/PublicFacing/LandingPage/PublicWebsiteBlogController.php` |
| Routes | `backend/routes/tenant_dashboard/blog.php`, `backend/routes/api.php` (public block) |

---

## 8. Document history

- Replaced generic “ResolveLocale middleware” narrative with **Accept-Language** behavior from `PublicWebsiteBlogController`.
- Documented **`module.blog`**, **`blog.manage`**, and **public** routes explicitly.
- Noted **slug** uniqueness as defined in migration (unique column on `blog_posts` within the tenant database).
