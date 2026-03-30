# Ubotz Platform — Implementation Status Analysis

> Analysis Date: 2026-03-12 | Compared against: Architecture & Production Readiness Document v1.0

---

## Summary Scorecard

| Area | Status |
|---|---|
| Multi-Tenant Model (shared DB, `tenant_id` scoping) | ✅ Implemented |
| Tenant Identification (subdomain, header, JWT, route) | ✅ Implemented |
| Tenant Query Isolation (`BelongsToTenant` global scope) | ✅ Implemented |
| API Rate Limiting (global + auth endpoints) | ✅ Implemented (IP-based) |
| Background Queue System (Redis, priority queues) | ✅ Implemented (single worker) |
| Database Protection (`tenant_id` columns, indexes) | ✅ Implemented |
| Caching System (Redis) | ✅ Implemented (with auto-namespacing) |
| Tenant Usage Tracking (quota enforcement) | ✅ Implemented |
| Concurrent Session Management | ✅ Implemented |
| Audit Logging | ✅ Implemented |
| IP Restriction (platform-level) | ✅ Implemented |
| Security Headers | ✅ Implemented |
| Domain Events & DDD Structure | ✅ Implemented |
| **Tenant-Based API Rate Limiting** | ✅ Implemented |
| **Cache Key Namespacing (automatic)** | ✅ Implemented |
| **Dedicated Queue Workers per Priority** | ✅ Implemented |
| **Monitoring & Observability Stack** | ✅ Implemented |
| **Database Slow Query Monitoring** | ✅ Implemented |

---

## 1. What Is Implemented

### 1.1 Multi-Tenant Query Isolation ✅

**File**: `app/Infrastructure/Persistence/Traits/BelongsToTenant.php`

- Global scope adds `WHERE tenant_id = ?` to all queries when context is resolved
- Falls back to `WHERE 1 = 0` when context is **not** resolved (prevents accidental leaks)
- Auto-assigns `tenant_id` on model creation from `TenantContext`
- Throws exception if creating records without active tenant context

### 1.2 Tenant Identification (All 4 Mechanisms) ✅

| Mechanism | File | Key |
|---|---|---|
| Subdomain + `X-Tenant-Slug` header | `app/Http/Middleware/ResolveTenantFromSubdomain.php` | Extracts from Origin/Referer/Host or `X-Tenant-Slug` |
| JWT Token | `app/Http/Middleware/ResolveTenantFromToken.php` | Lightweight base64 decode of JWT payload for `tenant_id` |
| Route Parameter | `app/Http/Middleware/ResolveTenantContext.php` | Reads `{tenant}` or `{id}` from route, verifies via repository |

- Tenant resolution is cached (`tenant_resolution:{slug}`, TTL 60s)
- Inactive tenants get HTTP 403
- Non-existent tenants get HTTP 404

### 1.3 API Rate Limiting ✅ (IP-Based)

**Files**: `app/Providers/AppServiceProvider.php` (lines 253–271), `bootstrap/app.php` (line 34)

| Limiter | Config |
|---|---|
| Global API | `throttle:60,1` (60 req/min, all API routes) |
| Platform Login | 10/min per IP + 5/min per email |
| Tenant Login | 6/min per IP + 6/min per email |
| Password Reset | 5/min per IP |
| Tenant Usage Dashboard | `throttle:30,1` (30 req/min) |
| Webhooks | `throttle:60,1` |

Backend: Redis via Laravel's `ThrottleRequests` middleware.

### 1.4 Background Queue System ✅ (Single Worker)

**File**: `docker-compose.yml` (lines 96–117)

- `ubotz_queue` container processes `--queue=high,default,low`
- `--tries=3 --timeout=90 --sleep=3`
- Redis-backed queue
- Depends on MySQL (healthy) + Redis (healthy)

### 1.5 Tenant Usage Tracking & Quota Enforcement ✅

**File**: `app/Infrastructure/Services/EloquentTenantQuotaService.php`

| Quota Type | Status |
|---|---|
| Users | ✅ Counts active users per tenant |
| Courses | ✅ Counts non-archived courses |
| Sessions | ✅ Via `TenantSessionManager` |
| Storage | ⚠️ Stub (returns 0) |

- Resolves limits from subscription plan `features` JSON, falls back to platform defaults
- Throws `QuotaExceededException` (mapped to HTTP 409)
- Session quota supports `hard_block` and `evict_oldest` enforcement modes

**Usage Dashboard**: `app/Http/Controllers/Api/TenantAdminDashboard/Usage/TenantDashboardUsageController.php`

### 1.6 Concurrent Session Management ✅

**File**: `app/Infrastructure/Services/TenantSessionManager.php`

- Redis-backed session tracking per `tenant:user`
- Evicts oldest sessions when over plan limit
- Validates active sessions via JTI
- Supports explicit revocation (logout) and revoke-all

### 1.7 Audit Logging ✅

| Component | File(s) |
|---|---|
| Domain interface | `app/Domain/Shared/Audit/AuditLoggerInterface.php`, `AuditContext.php` |
| Admin audit | `AdminAuditLogger.php`, `AdminAuditLogRecord.php` |
| Tenant auth audit | `TenantAuthAuditLogger.php` |
| Tenant user audit | `TenantUserAuditLogger.php` |
| Tenant audit log API | `TenantAuditLogController.php`, `ListTenantAuditLogsQuery.php` |

### 1.8 IP Restriction System ✅

Full DDD implementation with 18 files across Domain, Application, Infrastructure, and HTTP layers. Includes `CheckIpRestriction` middleware applied globally in the API middleware group.

### 1.9 Security Headers ✅

`app/Http/Middleware/SecurityHeaders.php` — appended globally to all responses.

### 1.10 Domain-Driven Design Structure ✅

```
app/
├── Domain/          (Auth, Shared, SuperAdminDashboard, TenantAdminDashboard)
├── Application/     (Use cases, commands, queries, DTOs)
├── Infrastructure/  (Persistence, Cache, External, Services, Tenant)
├── Http/            (Controllers, Middleware, Requests, Resources)
├── Policies/
└── Providers/
```

- `EventDispatcherInterface` + `LaravelEventDispatcher`
- Domain events: `SubscriptionPlanAssigned`, `IpRestrictionCreated/Deleted`, `StudentEnrolledEvent`, etc.
- Bounded context separation respected across Identity, Tenant Management, Quiz, Payment, Subscription domains

### 1.11 Exception Handling ✅

Comprehensive exception → HTTP mapping in `bootstrap/app.php`:
- JWTException → 401 (generic, prevents token enumeration)
- QuotaExceededException → 409
- EntityNotFoundException → 404
- ValidationException → 422
- InsufficientAuthorityException → 403

---

## 2. What Is Partially Implemented

### 1.12 Caching System (with Auto-Namespacing) ✅

**Files**: `app/Infrastructure/Cache/LaravelTenantCache.php`, `app/Domain/Shared/Cache/TenantCacheInterface.php`.

- `LaravelTenantCache` automatically injects `tenant:{id}:` prefix for all tenant-scoped operations.
- Correctly handles platform-level keys with `platform:` prefix when no context is resolved.
- Prevents cross-tenant cache collisions at the infrastructure level.
- Contract includes `has()` and `remember()` methods for consistent usage.

**Verified**: `tests/Unit/Infrastructure/LaravelTenantCacheTest.php` covers auto-prefixing, isolation, and fallback logic.

### 1.13 Dedicated Queue Workers (Priority-based) ✅

**Files**: `docker-compose.yml`

- Queue processing has been split into 3 dedicated workers, eliminating head-of-line blocking.
- `ubotz_queue_high`: Processes `high` queue. Optimized with 1s sleep and 120s timeout. Used for payment webhooks, subscription assignments, and immediate access grants.
- `ubotz_queue_default`: Processes `default` queue. Balanced with 3s sleep and 90s timeout. Used for standard background operations.
- `ubotz_queue_low`: Processes `low` queue. Relaxed with 5s sleep and 300s generous timeout. Used for heavy tasks and email dispatching safely without blocking critical workflows.

**Verified**: Existing `ShouldQueue` jobs and listeners have been explicitly assigned to their correct priority queues using the `public string $queue` property.

### 2.2 Storage Quota ⚠️

Storage quota type exists in `ResourceQuotaType::STORAGE` but returns `0` (not implemented). Comment in code: *"Storage not fully wired yet"*.

### 1.14 Monitoring & Observability Stack ✅

**Files**: `docker/prometheus/prometheus.yml`, `docker/grafana/provisioning/datasources/datasource.yml`, `docker/nginx/default.conf`, `app/Http/Controllers/Api/HealthMetricsController.php`

- Fully containerized Prometheus + Grafana stack.
- Configured exporters for MySQL, Redis, Nginx, and custom Laravel health metrics.
- Exposes detailed metrics on queue sizes, active connections, and tenant count via `/api/health/metrics`.

### 1.15 Database Slow Query Monitoring ✅

**Files**: `docker/mysql/my.cnf`, `docker-compose.yml`

- Enabled slow query logging for queries >1s and queries not matching indexes.
- Logs correctly mapped to persistent Docker volume at `/var/lib/mysql/slow-query.log`.

---

## 3. What Is NOT Implemented

### 3.1 Tenant-Based API Rate Limiting ✅

**Files**: `app/Providers/AppServiceProvider.php` (for `tenant_api` limiter), `routes/api.php` (middleware application).

- Throttles requests based on `tenant_id` from JWT context.
- Resolves limits from subscription plan `max_api_requests_per_minute`.
- Falls back to platform default (`config/ubotz.php`).
- Standardized 429 JSON response with `RATE_LIMIT_EXCEEDED` code.

**Verified**: `tests/Feature/TenantApiRateLimitTest.php` covers default fallback, custom plan limits, and tenant isolation.





## 4. Priority Action Items

| # | Item | Severity | Effort |
|---|---|---|---|
| 5 | Storage quota implementation | 🟢 Medium | Medium |
| 6 | Read replicas for DB scaling | 🟢 Future | High |
| 7 | Tenant sharding strategy | 🟢 Future | Very High |

he Monitoring & Observability Stack (including Prometheus, Grafana, Exporters, and the Laravel custom /api/health/metrics endpoint) is fully implemented and verified! The 500 error on the health metrics has been fixed by removing an unused injection. I have also enabled MySQL slow query logging (for queries >1s) and configured it properly within the MySQL container.

Regarding your question about using a Caddyfile in production: Yes, some changes will be needed for production since you use Caddy instead of Nginx.

You will not need the nginx_exporter container in production.
Caddy has native Prometheus metrics built-in! You just need to enable the metrics directive in your Caddyfile (global options or server block) and it will expose a /metrics endpoint.
In your production prometheus.yml, you will replace the nginx job with a config that scrapes Caddy's :2019/metrics (or wherever you expose it) instead of port 9113.

UBOTZ Deployment Guide — Contabo VPS + GitHub CI/CD (Caddy)
Comprehensive guide for deploying the UBOTZ multi-tenant platform (Laravel backend + Next.js frontend) to a Contabo VPS with automated CI/CD via GitHub Actions. Uses Caddy as the reverse proxy with automatic SSL.

Current State Analysis
What Exists Today
Component	Current State	Production-Ready?
Backend Docker Compose	Local dev only (binds localhost ports)	❌ Needs production variant
Backend CI	PHPStan, CS Fixer, PHPUnit via GitHub Actions	✅ CI exists, needs CD
Frontend CI	ESLint + next build via GitHub Actions	✅ CI exists, needs CD
Web Server	Nginx dev config (no SSL, server_name localhost)	❌ Replace with Caddy
PHP Config	Dev settings (display_errors = On, OPcache revalidate=0)	❌ Needs production config
Environment Files	
.env
 with dev passwords, 
.env.ci
 for CI	❌ Needs .env.production template
Monitoring	Prometheus + Grafana + exporters	✅ Exists, needs port hardening
Frontend Docker	Simple dev-mode npm run dev	❌ Needs production build + serve
SSL/TLS	None	✅ Caddy handles automatically
Tech Stack Summary
Backend:  Laravel 12 / PHP 8.3 FPM Alpine / MySQL 8.0 / Redis 7 Alpine
Frontend: Next.js 16 / React 19 / Tailwind 4 / Node 20 Alpine
Proxy:    Caddy 2 (automatic HTTPS via Let's Encrypt)
Payments: Razorpay
Auth:     JWT (php-open-source-saver/jwt-auth)
Queues:   Redis-backed, 3 priority tiers (high / default / low)
Monitoring: Prometheus + Grafana + MySQL/Redis exporters
Server Requirements (Contabo VPS)
Resource	Minimum	Recommended
CPU	4 vCPU	6–8 vCPU
RAM	8 GB	16 GB
Storage	100 GB SSD	200 GB NVMe SSD
OS	Ubuntu 22.04 LTS or 24.04 LTS	Ubuntu 24.04 LTS
IMPORTANT

Contabo VPS Cloud plans (VPS S or higher) are recommended. The cheapest plan (4 vCPU / 8 GB) works for launch; upgrade as tenants grow.

Infrastructure Architecture (Production)
Contabo VPS
Internet
Docker Network
/api/*
/*
Users / Browsers
Caddy Reverse Proxy:80 / :443Auto SSL
PHP-FPMLaravel Backend:9000
Next.js Frontend:3000
MySQL 8.0:3306
Redis 7:6379
Queue Worker — high
Queue Worker — default
Queue Worker — low
Prometheus :9090
Grafana :3001
NOTE

Why Caddy over Nginx? Caddy provides automatic HTTPS with Let's Encrypt, zero-config SSL renewal, HTTP/2 & HTTP/3 by default, and a far simpler configuration syntax. No Certbot or manual certificate management needed.

Phase 1: Server Initial Setup
1.1 SSH Access & Hardening
bash
# Connect to your Contabo VPS
ssh root@YOUR_SERVER_IP
# Create deploy user
adduser deploy
usermod -aG sudo deploy
# Setup SSH key auth (from your LOCAL machine)
# ssh-keygen -t ed25519 -C "deploy@ubotz"
ssh-copy-id deploy@YOUR_SERVER_IP
# Disable password auth
sudo nano /etc/ssh/sshd_config
# Set: PasswordAuthentication no
# Set: PermitRootLogin no
sudo systemctl restart sshd
1.2 Firewall (UFW)
bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP (Caddy redirect)
sudo ufw allow 443/tcp   # HTTPS
sudo ufw enable
1.3 Install Docker & Docker Compose
bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker deploy
# Log out and back in, then verify:
docker --version
docker compose version
Phase 2: Files & Folders to Create
2.1 Directory Structure on VPS
/home/deploy/ubotz/
├── backend/                        # ← Git clone of backend repo
│   ├── docker-compose.prod.yml     # [NEW] Production Docker Compose
│   ├── docker/
│   │   ├── caddy/
│   │   │   └── Caddyfile           # [NEW] Caddy reverse proxy config
│   │   └── php/
│   │       ├── Dockerfile           # Existing (minor changes)
│   │       ├── production.ini      # [NEW] Production PHP config
│   │       └── local.ini           # Existing (dev only)
│   ├── .env                         # Production env (from template)
│   └── ...
├── frontend/                       # ← Git clone of frontend repo
│   ├── Dockerfile                  # [NEW] Multi-stage production build
│   ├── .env.production             # [NEW] Production env
│   └── ...
├── caddy_data/                     # [NEW] Caddy cert storage (auto-managed)
├── caddy_config/                   # [NEW] Caddy config storage
├── backups/                        # [NEW] Database backups
│   └── data/
└── scripts/                        # [NEW] Deployment helpers
    ├── deploy-backend.sh
    ├── deploy-frontend.sh
    └── health-check.sh
2.2 New Files — Backend Repo
[NEW] docker/caddy/Caddyfile
caddyfile
# ==========================================================================
# UBOTZ 2.0 — Caddy Reverse Proxy Configuration
# ==========================================================================
# Caddy automatically provisions and renews SSL certificates.
# No Certbot, no manual renewal needed.
# ==========================================================================
# ---------- API Backend (api.ubotz.io) ----------
api.ubotz.io {
	# Security headers
	header {
		X-Frame-Options "DENY"
		X-Content-Type-Options "nosniff"
		X-XSS-Protection "1; mode=block"
		Referrer-Policy "strict-origin-when-cross-origin"
		Strict-Transport-Security "max-age=31536000; includeSubDomains"
		-Server
	}
	# Rate limiting for auth endpoints (5 requests per second per IP)
	@auth path /api/auth/* /api/development/auth/* /api/tenant/auth/*
	rate_limit @auth {
		zone auth_limit {
			key {remote_host}
			events 5
			window 1s
		}
	}
	# Health check — no logging
	@health path /api/health
	log @health {
		output discard
	}
	# Serve Laravel public directory for static assets
	root * /var/www/public
	# Try files → PHP-FPM fallback (Laravel routing)
	@notStatic {
		not file
	}
	
	php_fastcgi @notStatic ubotz_backend:9000 {
		root /var/www/public
		resolve_root_symlink
	}
	file_server
	# Block sensitive files
	@blocked {
		path /.env /.git/* /.github/*
	}
	respond @blocked 403
	# Request body size limit (match PHP config)
	request_body {
		max_size 50MB
	}
	log {
		output file /var/log/caddy/api_access.log
		format json
	}
}
# ---------- Frontend App (app.ubotz.io) ----------
app.ubotz.io {
	header {
		X-Frame-Options "DENY"
		X-Content-Type-Options "nosniff"
		Strict-Transport-Security "max-age=31536000; includeSubDomains"
		-Server
	}
	reverse_proxy ubotz_frontend:3000
	log {
		output file /var/log/caddy/app_access.log
		format json
	}
}
# ---------- Main domain redirect (optional) ----------
ubotz.io, www.ubotz.io {
	redir https://app.ubotz.io{uri} permanent
}
TIP

Caddy auto-SSL: Caddy will automatically obtain and renew Let's Encrypt certificates for all domains listed in the Caddyfile. No Certbot, no cron jobs, no manual steps needed. Just point your DNS records to the VPS IP and Caddy handles the rest.

[NEW] docker-compose.prod.yml
yaml
# ==========================================================================
# UBOTZ 2.0 — Production Docker Compose (Caddy)
# ==========================================================================
# PURPOSE: Production deployment on Contabo VPS.
# USAGE:  docker compose -f docker-compose.prod.yml up -d
# ==========================================================================
name: ubotz-prod
services:
  # ==========================================
  # DATABASE SERVICES
  # ==========================================
  ubotz_mysql:
    image: mysql:8.0
    container_name: ubotz_mysql
    restart: always
    environment:
      MYSQL_ROOT_PASSWORD: ${DB_ROOT_PASSWORD}
      MYSQL_DATABASE: ${DB_DATABASE}
      MYSQL_USER: ${DB_USERNAME}
      MYSQL_PASSWORD: ${DB_PASSWORD}
    volumes:
      - ubotz_mysql_data:/var/lib/mysql
      - ./docker/mysql/my.cnf:/etc/mysql/conf.d/slow-query.cnf:ro
    networks:
      - ubotz_net
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost", "-u", "root", "-p${DB_ROOT_PASSWORD}"]
      interval: 30s
      timeout: 10s
      retries: 5
      start_period: 60s
    deploy:
      resources:
        limits:
          memory: 2G
  ubotz_redis:
    image: redis:7-alpine
    container_name: ubotz_redis
    restart: always
    volumes:
      - ubotz_redis_data:/data
    networks:
      - ubotz_net
    command: >
      redis-server
        --appendonly yes
        --requirepass ${REDIS_PASSWORD}
        --maxmemory 512mb
        --maxmemory-policy allkeys-lru
    healthcheck:
      test: ["CMD", "redis-cli", "-a", "${REDIS_PASSWORD}", "ping"]
      interval: 30s
      timeout: 10s
      retries: 5
      start_period: 10s
  # ==========================================
  # BACKEND (PHP-FPM)
  # ==========================================
  ubotz_backend:
    build:
      context: .
      dockerfile: docker/php/Dockerfile
      args:
        - PHP_INI=production.ini
    container_name: ubotz_backend
    restart: always
    working_dir: /var/www
    expose:
      - "9000"
    volumes:
      - ./storage:/var/www/storage
      - ./bootstrap/cache:/var/www/bootstrap/cache
    networks:
      - ubotz_net
    env_file:
      - .env
    depends_on:
      ubotz_mysql:
        condition: service_healthy
      ubotz_redis:
        condition: service_healthy
  # ==========================================
  # QUEUE WORKERS
  # ==========================================
  ubotz_queue_high:
    build:
      context: .
      dockerfile: docker/php/Dockerfile
      args:
        - PHP_INI=production.ini
    container_name: ubotz_queue_high
    restart: always
    working_dir: /var/www
    entrypoint: ["php", "artisan", "queue:work", "--queue=high", "--tries=3", "--timeout=120", "--sleep=1", "--max-jobs=500", "--max-time=3600"]
    volumes:
      - ./storage:/var/www/storage
    networks:
      - ubotz_net
    env_file:
      - .env
    depends_on:
      ubotz_backend:
        condition: service_started
    deploy:
      resources:
        limits:
          memory: 512M
  ubotz_queue_default:
    build:
      context: .
      dockerfile: docker/php/Dockerfile
      args:
        - PHP_INI=production.ini
    container_name: ubotz_queue_default
    restart: always
    working_dir: /var/www
    entrypoint: ["php", "artisan", "queue:work", "--queue=default", "--tries=3", "--timeout=90", "--sleep=3", "--max-jobs=500", "--max-time=3600"]
    volumes:
      - ./storage:/var/www/storage
    networks:
      - ubotz_net
    env_file:
      - .env
    depends_on:
      ubotz_backend:
        condition: service_started
    deploy:
      resources:
        limits:
          memory: 512M
  ubotz_queue_low:
    build:
      context: .
      dockerfile: docker/php/Dockerfile
      args:
        - PHP_INI=production.ini
    container_name: ubotz_queue_low
    restart: always
    working_dir: /var/www
    entrypoint: ["php", "artisan", "queue:work", "--queue=low", "--tries=3", "--timeout=300", "--sleep=5", "--max-jobs=500", "--max-time=3600"]
    volumes:
      - ./storage:/var/www/storage
    networks:
      - ubotz_net
    env_file:
      - .env
    depends_on:
      ubotz_backend:
        condition: service_started
    deploy:
      resources:
        limits:
          memory: 256M
  # ==========================================
  # FRONTEND (Next.js Production)
  # ==========================================
  ubotz_frontend:
    build:
      context: ../frontend
      dockerfile: Dockerfile
      args:
        - NEXT_PUBLIC_API_URL=https://api.ubotz.io
    container_name: ubotz_frontend
    restart: always
    expose:
      - "3000"
    networks:
      - ubotz_net
    environment:
      - NODE_ENV=production
  # ==========================================
  # CADDY REVERSE PROXY (Automatic SSL)
  # ==========================================
  ubotz_caddy:
    image: caddy:2-alpine
    container_name: ubotz_caddy
    restart: always
    ports:
      - "80:80"
      - "443:443"
      - "443:443/udp"   # HTTP/3 (QUIC)
    volumes:
      - ./docker/caddy/Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data          # SSL certificates (auto-managed)
      - caddy_config:/config      # Caddy config cache
      - .:/var/www:ro              # Laravel public dir for static files
    networks:
      - ubotz_net
    depends_on:
      - ubotz_backend
      - ubotz_frontend
  # ==========================================
  # MONITORING (bind to localhost only)
  # ==========================================
  ubotz_prometheus:
    image: prom/prometheus:latest
    container_name: ubotz_prometheus
    restart: always
    volumes:
      - ./docker/prometheus/prometheus.yml:/etc/prometheus/prometheus.yml:ro
      - ubotz_prometheus_data:/prometheus
    networks:
      - ubotz_net
  ubotz_grafana:
    image: grafana/grafana:latest
    container_name: ubotz_grafana
    restart: always
    ports:
      - "127.0.0.1:3001:3000"  # Only via SSH tunnel
    volumes:
      - ./docker/grafana/provisioning:/etc/grafana/provisioning:ro
      - ubotz_grafana_data:/var/lib/grafana
    networks:
      - ubotz_net
    depends_on:
      - ubotz_prometheus
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=${GRAFANA_ADMIN_PASSWORD}
      - GF_SERVER_ROOT_URL=http://localhost:3001
  ubotz_mysql_exporter:
    image: prom/mysqld-exporter:latest
    container_name: ubotz_mysql_exporter
    restart: always
    environment:
      DATA_SOURCE_NAME: "root:${DB_ROOT_PASSWORD}@(ubotz_mysql:3306)/"
    networks:
      - ubotz_net
    depends_on:
      ubotz_mysql:
        condition: service_healthy
  ubotz_redis_exporter:
    image: oliver006/redis_exporter:latest
    container_name: ubotz_redis_exporter
    restart: always
    environment:
      REDIS_ADDR: "redis://ubotz_redis:6379"
      REDIS_PASSWORD: "${REDIS_PASSWORD}"
    networks:
      - ubotz_net
    depends_on:
      ubotz_redis:
        condition: service_healthy
networks:
  ubotz_net:
    driver: bridge
volumes:
  ubotz_mysql_data:
    name: ubotz_prod_mysql_data
  ubotz_redis_data:
    name: ubotz_prod_redis_data
  caddy_data:
    name: ubotz_caddy_data
  caddy_config:
    name: ubotz_caddy_config
  ubotz_prometheus_data:
    name: ubotz_prod_prometheus_data
  ubotz_grafana_data:
    name: ubotz_prod_grafana_data
NOTE

The Nginx exporter is removed since we're using Caddy. Caddy has built-in Prometheus metrics at /metrics that can be added to 
prometheus.yml
 if needed.

[NEW] docker/php/production.ini
ini
; ==========================================================================
; UBOTZ 2.0 — PHP Production Configuration
; ==========================================================================
; Error Reporting (NEVER show errors to users)
display_errors = Off
display_startup_errors = Off
error_reporting = E_ALL & ~E_DEPRECATED & ~E_STRICT
log_errors = On
error_log = /var/log/php_errors.log
; Memory & Execution Limits
memory_limit = 256M
max_execution_time = 30
max_input_time = 30
post_max_size = 50M
upload_max_filesize = 50M
; Timezone
date.timezone = UTC
; OPcache (aggressive caching for production)
opcache.enable = 1
opcache.memory_consumption = 256
opcache.interned_strings_buffer = 32
opcache.max_accelerated_files = 20000
opcache.revalidate_freq = 60
opcache.validate_timestamps = 0
opcache.save_comments = 1
opcache.jit = 1255
opcache.jit_buffer_size = 128M
; Security Hardening
expose_php = Off
session.cookie_httponly = On
session.cookie_secure = On
session.use_strict_mode = On
[NEW] .env.production.example
env
APP_NAME=Ubotz
APP_ENV=production
APP_DEBUG=false
APP_URL=https://api.ubotz.io
FRONTEND_PRODUCTION_URL=https://app.ubotz.io
APP_LOCALE=en
BCRYPT_ROUNDS=12
# Database
DB_CONNECTION=mysql
DB_HOST=ubotz_mysql
DB_PORT=3306
DB_DATABASE=ubotz_central
DB_USERNAME=ubotz_app
DB_PASSWORD=__GENERATE_STRONG_PASSWORD__
DB_ROOT_PASSWORD=__GENERATE_STRONG_ROOT_PASSWORD__
# Redis
REDIS_CLIENT=phpredis
REDIS_HOST=ubotz_redis
REDIS_PASSWORD=__GENERATE_STRONG_REDIS_PASSWORD__
REDIS_PORT=6379
REDIS_DB=0
# Queue, Cache, Session
QUEUE_CONNECTION=redis
CACHE_DRIVER=redis
SESSION_DRIVER=redis
SESSION_LIFETIME=120
SESSION_ENCRYPT=true
SESSION_PATH=/
SESSION_DOMAIN=.ubotz.io
# Logging
LOG_CHANNEL=stack
LOG_STACK=daily
LOG_LEVEL=warning
# CORS
FRONTEND_URL=https://app.ubotz.io
# JWT
JWT_SECRET=__GENERATE_STRONG_JWT_SECRET__
JWT_TTL=15
JWT_REFRESH_TTL=10080
JWT_COOKIE_NAME=ubotz_admin_token
JWT_BLACKLIST_GRACE_PERIOD=0
JWT_ALGO=HS256
JWT_TENANT_COOKIE_DOMAIN=.ubotz.io
JWT_COOKIE_DOMAIN=.ubotz.io
# Mail (SMTP for production)
MAIL_MAILER=smtp
MAIL_HOST=smtp.example.com
MAIL_PORT=587
MAIL_USERNAME=__MAIL_USERNAME__
MAIL_PASSWORD=__MAIL_PASSWORD__
MAIL_ENCRYPTION=tls
MAIL_FROM_ADDRESS=noreply@ubotz.io
MAIL_FROM_NAME="${APP_NAME}"
# Razorpay (Live keys)
RAZORPAY_KEY_ID=__LIVE_RAZORPAY_KEY__
RAZORPAY_KEY_SECRET=__LIVE_RAZORPAY_SECRET__
RAZORPAY_WEBHOOK_SECRET=__LIVE_WEBHOOK_SECRET__
# Monitoring
GRAFANA_ADMIN_PASSWORD=__GENERATE_GRAFANA_PASSWORD__
2.3 New Files — Frontend Repo
[NEW] 
Dockerfile
dockerfile
# ==========================================================================
# UBOTZ Frontend — Multi-Stage Production Build
# ==========================================================================
# Stage 1: Install dependencies
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --only=production
# Stage 2: Build
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
RUN npm run build
# Stage 3: Production runner (standalone mode)
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
CMD ["node", "server.js"]
IMPORTANT

Requires output: 'standalone' in 
next.config.ts
 — see 
Phase 3
.

[NEW] .env.production.example
env
NEXT_PUBLIC_API_URL=https://api.ubotz.io
2.4 New Files — On Server
[NEW] /home/deploy/ubotz/scripts/deploy-backend.sh
bash
#!/bin/bash
set -euo pipefail
DEPLOY_DIR="/home/deploy/ubotz/backend"
COMPOSE_FILE="docker-compose.prod.yml"
echo "=== UBOTZ Backend Deployment ==="
cd "$DEPLOY_DIR"
git fetch origin main
git reset --hard origin/main
docker compose -f $COMPOSE_FILE build --no-cache ubotz_backend
docker compose -f $COMPOSE_FILE run --rm ubotz_backend php artisan migrate --force
docker compose -f $COMPOSE_FILE run --rm ubotz_backend php artisan config:cache
docker compose -f $COMPOSE_FILE run --rm ubotz_backend php artisan route:cache
docker compose -f $COMPOSE_FILE run --rm ubotz_backend php artisan view:cache
docker compose -f $COMPOSE_FILE up -d --force-recreate ubotz_backend
docker compose -f $COMPOSE_FILE restart ubotz_queue_high ubotz_queue_default ubotz_queue_low
docker compose -f $COMPOSE_FILE restart ubotz_caddy
echo "=== Backend Deployment Complete ==="
[NEW] /home/deploy/ubotz/scripts/deploy-frontend.sh
bash
#!/bin/bash
set -euo pipefail
echo "=== UBOTZ Frontend Deployment ==="
cd /home/deploy/ubotz/frontend
git fetch origin main
git reset --hard origin/main
cd /home/deploy/ubotz/backend
docker compose -f docker-compose.prod.yml build --no-cache ubotz_frontend
docker compose -f docker-compose.prod.yml up -d --force-recreate ubotz_frontend
echo "=== Frontend Deployment Complete ==="
[NEW] /home/deploy/ubotz/scripts/health-check.sh
bash
#!/bin/bash
API_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "https://api.ubotz.io/api/health")
FE_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "https://app.ubotz.io")
echo "API: $API_STATUS | Frontend: $FE_STATUS"
if [ "$API_STATUS" != "200" ] || [ "$FE_STATUS" != "200" ]; then
  echo "❌ Health check FAILED!"
  exit 1
fi
echo "✅ All services healthy"
[NEW] /home/deploy/ubotz/backups/backup-mysql.sh
bash
#!/bin/bash
set -euo pipefail
BACKUP_DIR="/home/deploy/ubotz/backups/data"
DATE=$(date +%Y%m%d_%H%M%S)
mkdir -p "$BACKUP_DIR"
docker exec ubotz_mysql mysqldump \
  -u root -p"${DB_ROOT_PASSWORD}" \
  --all-databases --single-transaction --routines --triggers \
  > "$BACKUP_DIR/ubotz_full_$DATE.sql"
gzip "$BACKUP_DIR/ubotz_full_$DATE.sql"
find "$BACKUP_DIR" -name "*.sql.gz" -mtime +30 -delete
echo "Backup complete: ubotz_full_$DATE.sql.gz"
Phase 3: Changes to Existing Files
[MODIFY] 
frontend/next.config.ts
Add output: 'standalone' for Docker production builds:

diff
const nextConfig: NextConfig = {
+  output: 'standalone',
   async rewrites() {
[MODIFY] 
backend/docker/php/Dockerfile
Support selecting production vs dev PHP config:

diff
# Custom PHP configuration
-COPY docker/php/local.ini /usr/local/etc/php/conf.d/99-ubotz.ini
+ARG PHP_INI=local.ini
+COPY docker/php/${PHP_INI} /usr/local/etc/php/conf.d/99-ubotz.ini
[MODIFY] 
backend/.github/workflows/ci.yml
Append a deploy job after the existing backend-qa job:

yaml
deploy:
    name: Deploy to Contabo VPS
    runs-on: ubuntu-latest
    needs: backend-qa
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    steps:
      - name: Deploy via SSH
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.VPS_HOST }}
          username: ${{ secrets.VPS_USER }}
          key: ${{ secrets.VPS_SSH_KEY }}
          script: /home/deploy/ubotz/scripts/deploy-backend.sh
      - name: Health Check
        run: |
          sleep 15
          STATUS=$(curl -s -o /dev/null -w "%{http_code}" https://api.ubotz.io/api/health)
          if [ "$STATUS" != "200" ]; then
            echo "::error::Health check failed! Status: $STATUS"
            exit 1
          fi
          echo "✅ API health check passed"
[MODIFY] 
frontend/.github/workflows/ci.yml
Append a deploy job after the existing frontend-qa job:

yaml
deploy:
    name: Deploy to Contabo VPS
    runs-on: ubuntu-latest
    needs: frontend-qa
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    steps:
      - name: Deploy via SSH
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.VPS_HOST }}
          username: ${{ secrets.VPS_USER }}
          key: ${{ secrets.VPS_SSH_KEY }}
          script: /home/deploy/ubotz/scripts/deploy-frontend.sh
      - name: Health Check
        run: |
          sleep 15
          STATUS=$(curl -s -o /dev/null -w "%{http_code}" https://app.ubotz.io)
          if [ "$STATUS" != "200" ]; then
            echo "::error::Health check failed! Status: $STATUS"
            exit 1
          fi
          echo "✅ Frontend health check passed"
GitHub Repository Secrets Required
Add in both repos → Settings → Secrets and Variables → Actions:

Secret Name	Value	Description
VPS_HOST	YOUR_CONTABO_IP	Contabo VPS public IP
VPS_USER	deploy	SSH user on the VPS
VPS_SSH_KEY	(private key)	Ed25519 private key
CI_DB_PASSWORD	(strong password)	MySQL password for CI tests
CI_JWT_SECRET	(random string)	JWT secret for CI tests
Phase 4: First Deployment Checklist
bash
# 1. SSH into VPS
ssh deploy@YOUR_CONTABO_IP
# 2. Clone repos
mkdir -p /home/deploy/ubotz
cd /home/deploy/ubotz
git clone git@github.com:YOUR_ORG/ubotz-backend.git backend
git clone git@github.com:YOUR_ORG/ubotz-frontend.git frontend
# 3. Create directories
mkdir -p backups/data scripts
# 4. Copy & enable deploy scripts
cp scripts/*.sh /home/deploy/ubotz/scripts/ || true
chmod +x scripts/*.sh
# 5. Configure backend env
cd backend
cp .env.production.example .env
nano .env  # Fill in ALL real production passwords
# 6. Configure frontend env
cd ../frontend
echo "NEXT_PUBLIC_API_URL=https://api.ubotz.io" > .env.production
# 7. Start all services (Caddy auto-provisions SSL certificates)
cd /home/deploy/ubotz/backend
docker compose -f docker-compose.prod.yml up -d
# 8. Run initial migrations & seeders
docker compose -f docker-compose.prod.yml exec ubotz_backend php artisan migrate --force
docker compose -f docker-compose.prod.yml exec ubotz_backend php artisan db:seed --force
# 9. Generate app key
docker compose -f docker-compose.prod.yml exec ubotz_backend php artisan key:generate
# 10. Cache config
docker compose -f docker-compose.prod.yml exec ubotz_backend php artisan config:cache
docker compose -f docker-compose.prod.yml exec ubotz_backend php artisan route:cache
docker compose -f docker-compose.prod.yml exec ubotz_backend php artisan view:cache
# 11. Set up daily backup cron
echo "0 2 * * * /home/deploy/ubotz/scripts/backup-mysql.sh >> /var/log/ubotz-backup.log 2>&1" | crontab -
# 12. Verify
curl https://api.ubotz.io/api/health
curl https://app.ubotz.io
TIP

No SSL setup needed! Unlike Nginx + Certbot, Caddy automatically provisions Let's Encrypt certificates the moment containers start and DNS records point to the server. No Phase 5 for SSL, no renewal cron — it's all automatic.

Phase 5: DNS Configuration
Point these domains to your Contabo VPS IP before starting Caddy:

Record Type	Name	Value	TTL
A	api.ubotz.io	YOUR_CONTABO_IP	300
A	app.ubotz.io	YOUR_CONTABO_IP	300
A	ubotz.io	YOUR_CONTABO_IP	300
CNAME	www.ubotz.io	ubotz.io	300
IMPORTANT

DNS must be configured BEFORE starting Caddy. Caddy needs domains to resolve to the server IP in order to provision SSL certificates via Let's Encrypt's ACME challenge.

Summary: All Files to Create / Modify
New Files (14 total)
#	Location	File	Purpose
1	Backend repo	docker-compose.prod.yml	Production Docker Compose with Caddy
2	Backend repo	docker/caddy/Caddyfile	Caddy reverse proxy (auto SSL + rate limiting)
3	Backend repo	docker/php/production.ini	Production PHP config (OPcache JIT)
4	Backend repo	.env.production.example	Production env template
5	Frontend repo	
Dockerfile
Multi-stage production build
6	Frontend repo	.env.production.example	Production env template
7	VPS	scripts/deploy-backend.sh	Backend deploy script
8	VPS	scripts/deploy-frontend.sh	Frontend deploy script
9	VPS	scripts/health-check.sh	Health check script
10	VPS	backups/backup-mysql.sh	MySQL backup script
Modified Files (4 total)
#	Location	File	Change
1	Frontend repo	
next.config.ts
Add output: 'standalone'
2	Backend repo	
docker/php/Dockerfile
Support production PHP ini via build arg
3	Backend repo	
.github/workflows/ci.yml
Add CD deploy job
4	Frontend repo	
.github/workflows/ci.yml
Add CD deploy job
User Review Required
IMPORTANT

Domain Names: This guide uses api.ubotz.io and app.ubotz.io. Please confirm your actual domain names.

IMPORTANT

Mail Provider: The production env template has a placeholder SMTP config. Which mail provider will you use? (AWS SES, SendGrid, Mailgun, etc.)

WARNING

Development API endpoints: Routes under /api/development/* must be disabled in production. Ensure APP_ENV=production gates these routes or remove them from production route files entirely.

CAUTION

Secrets: Current 
.env
 contains CHANGE_ME placeholder passwords and a committed JWT_SECRET. Generate new strong passwords for ALL credentials before deploying. Never commit 
.env
 to git.

Verification Plan
Automated (Post-Deploy)
curl https://api.ubotz.io/api/health → expect 200 OK
curl https://app.ubotz.io → expect 200 OK + HTML
curl -vI https://api.ubotz.io 2>&1 | grep "SSL certificate" → valid cert
docker ps → all containers running + healthy
Manual Verification
Open https://app.ubotz.io in browser → verify frontend loads
Try platform admin login → verify JWT auth works over HTTPS
SSH tunnel ssh -L 3001:localhost:3001 deploy@VPS_IP → open http://localhost:3001 → Grafana dashboards
Push a test commit to main → verify GitHub Actions CI → CD → deploy succeeds
Check ls -la /home/deploy/ubotz/backups/data/ → verify daily backups exist