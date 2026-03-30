# UBOTZ 2.0 Blog Technical Specification

## Core Architecture
The Blog module uses a decoupled translation model (`TenantAdminDashboard\Blog`) to support internationalization.

## Relational Schema Constraints

### 1. Post Registry (`blog_posts`)
- **`tenant_id`**: Structural isolation.
- **`slug`**: Globally unique across the tenant's namespace.
- **Indices**: `idx_blog_posts_tenant_status` ensures rapid filtering for public feeds.

### 2. Content Layer (`blog_post_translations`)
- **`locale`**: ISO-639-1 code (e.g. `en`, `ar`).
- **`content`**: LongText blob for the main article body.
- **SEO fields**: `meta_description`, `seo_description`.

## Key Technical Workflows

### Multi-Lingual Resolution
1. User visits `/blog/{slug}`.
2. The `ResolveLocale` middleware identifies the user's preferred language or the browser default.
3. The system joins `blog_posts` with `blog_post_translations` where `locale == $activeLocale`.
4. If the preferred translation does not exist, the system falls back to the tenant's `default_locale`.

## Performance & Optimization
- **Eager Loading**: The module always eager-loads the `author` (from `users`) and `category` to minimize the "N+1" query problem in blog index views.
- **Caching**: Blog post bodies are cached to reduce expensive translation joins.

## Tenancy & Security
- **Author Scoping**: `author_id` is foreign-keyed to `users`. The system ensures only users within the same `tenant_id` can be assigned as authors.
- **Comment Security**: `blog_comments` are sanitized to prevent XSS.

---

## Linked References
- Related Modules: `User`, `Category`, `Locale`.
