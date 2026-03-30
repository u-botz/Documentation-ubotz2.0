# UBOTZ 2.0 — Full Deployment Configuration Dump

This document contains the full contents of all critical configuration, infrastructure, and deployment files for UBOTZ 2.0.

---

## BATCH 1 — Critical Infrastructure & Core Config

### docker-compose.yml
```yaml
# ==========================================================================
# UBOTZ 2.0 — Local Development Docker Compose
# ==========================================================================
# PURPOSE: Local development ONLY. Production uses managed services
#          (RDS, ElastiCache) — NOT Docker containers.
#
# USAGE:
#   docker compose up -d
#   docker compose exec ubotz_backend php artisan --version
#   docker compose down
#
# RULE: All credentials come from .env — NEVER hardcode passwords here.
#       See .env.example for required variables.
# ==========================================================================

name: ubotz

services:
  # ==========================================
  # DATABASE SERVICES
  # ==========================================

  ubotz_mysql:
    image: mysql:8.0
    container_name: ubotz_mysql
    restart: unless-stopped
    environment:
      MYSQL_ROOT_PASSWORD: ${DB_ROOT_PASSWORD}
      MYSQL_DATABASE: ${DB_DATABASE}
      MYSQL_USER: ${DB_USERNAME}
      MYSQL_PASSWORD: ${DB_PASSWORD}
      # Dedicated test database — same credentials, isolated schema.
      # Prevents migrate:fresh from destroying development data during test runs.
      MYSQL_TEST_DATABASE: ${DB_TEST_DATABASE:-ubotz_test}
    ports:
      - "127.0.0.1:3306:3306"
    volumes:
      - ubotz_mysql_data:/var/lib/mysql
      # Init script: creates `ubotz_test` database on first container start.
      # Read-only mount — never modified by the container.
      - ./docker/mysql/init-test-db.sql:/docker-entrypoint-initdb.d/init-test-db.sql:ro
    networks:
      - ubotz_net
    healthcheck:
      test: [ "CMD", "mysqladmin", "ping", "-h", "localhost", "-u", "root", "-p${DB_ROOT_PASSWORD}" ]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 30s

  ubotz_redis:
    image: redis:7-alpine
    container_name: ubotz_redis
    restart: unless-stopped
    ports:
      - "127.0.0.1:6379:6379"
    volumes:
      - ubotz_redis_data:/data
    networks:
      - ubotz_net
    command: >
      redis-server --appendonly yes --requirepass ${REDIS_PASSWORD}
    healthcheck:
      test: [ "CMD", "redis-cli", "-a", "${REDIS_PASSWORD}", "ping" ]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 10s

  # ==========================================
  # BACKEND SERVICES
  # ==========================================

  ubotz_backend:
    build:
      context: .
      dockerfile: docker/php/Dockerfile
    container_name: ubotz_backend
    restart: unless-stopped
    working_dir: /var/www
    expose:
      - "9000"
    volumes:
      - .:/var/www:cached
      - vendor_data:/var/www/vendor
    networks:
      - ubotz_net
    env_file:
      - .env
    depends_on:
      ubotz_mysql:
        condition: service_healthy
      ubotz_redis:
        condition: service_healthy

  ubotz_queue:
    build:
      context: .
      dockerfile: docker/php/Dockerfile
    container_name: ubotz_queue
    restart: unless-stopped
    working_dir: /var/www
    entrypoint: [ "php", "artisan", "queue:work", "--queue=high,default,low", "--tries=3", "--timeout=90", "--sleep=3" ]
    volumes:
      - .:/var/www:cached
      - vendor_data:/var/www/vendor
    networks:
      - ubotz_net
    env_file:
      - .env
    depends_on:
      ubotz_backend:
        condition: service_started
      ubotz_mysql:
        condition: service_healthy
      ubotz_redis:
        condition: service_healthy

  ubotz_web:
    image: nginx:1.25-alpine
    container_name: ubotz_web
    restart: unless-stopped
    ports:
      - "8000:80"
    volumes:
      - .:/var/www:cached
      - ./docker/nginx/default.conf:/etc/nginx/conf.d/default.conf:ro
    depends_on:
      - ubotz_backend
    networks:
      - ubotz_net

# ==========================================
# NETWORKS & VOLUMES
# ==========================================

networks:
  ubotz_net:
    driver: bridge

volumes:
  ubotz_mysql_data:
    name: ubotz_mysql_data
  ubotz_redis_data:
    name: ubotz_redis_data
  vendor_data:
    name: ubotz_vendor_data
```

### docker/php/Dockerfile
```dockerfile
# ==========================================================================
# UBOTZ 2.0 — PHP-FPM Container
# ==========================================================================
# Base: PHP 8.3 FPM Alpine (minimal attack surface)
# Purpose: Runs Laravel 12 backend (PHP-FPM on port 9000)
# ==========================================================================

FROM php:8.3-fpm-alpine

# ----------------------------------------
# System dependencies
# ----------------------------------------
RUN apk add --no-cache \
    git \
    curl \
    libzip-dev \
    zip \
    unzip \
    libpng-dev \
    libjpeg-turbo-dev \
    freetype-dev \
    oniguruma-dev \
    libxml2-dev \
    icu-dev \
    linux-headers \
    $PHPIZE_DEPS

# ----------------------------------------
# PHP extensions required by Laravel 12
# ----------------------------------------
RUN docker-php-ext-configure gd --with-freetype --with-jpeg \
    && docker-php-ext-install -j$(nproc) \
    pdo \
    pdo_mysql \
    mbstring \
    exif \
    pcntl \
    bcmath \
    zip \
    gd \
    intl \
    opcache \
    xml

# ----------------------------------------
# Redis extension (for cache, queue, JWT blacklist)
# ----------------------------------------
RUN pecl install redis \
    && docker-php-ext-enable redis

# ----------------------------------------
# Composer (latest stable)
# ----------------------------------------
COPY --from=composer:latest /usr/bin/composer /usr/bin/composer

# ----------------------------------------
# Custom PHP configuration
# ----------------------------------------
COPY docker/php/local.ini /usr/local/etc/php/conf.d/99-ubotz.ini

# ----------------------------------------
# PHP-FPM tuning for development
# ----------------------------------------
RUN echo "[www]" > /usr/local/etc/php-fpm.d/zz-ubotz.conf \
    && echo "pm = dynamic" >> /usr/local/etc/php-fpm.d/zz-ubotz.conf \
    && echo "pm.max_children = 20" >> /usr/local/etc/php-fpm.d/zz-ubotz.conf \
    && echo "pm.start_servers = 4" >> /usr/local/etc/php-fpm.d/zz-ubotz.conf \
    && echo "pm.min_spare_servers = 2" >> /usr/local/etc/php-fpm.d/zz-ubotz.conf \
    && echo "pm.max_spare_servers = 6" >> /usr/local/etc/php-fpm.d/zz-ubotz.conf \
    && echo "clear_env = no" >> /usr/local/etc/php-fpm.d/zz-ubotz.conf

# ----------------------------------------
# Working directory
# ----------------------------------------
WORKDIR /var/www

# ----------------------------------------
# Install dependencies if composer.json exists
# (skipped on first build with empty project)
# ----------------------------------------
COPY composer.json composer.lock* ./
RUN if [ -f composer.lock ]; then \
    composer install --no-dev --optimize-autoloader --no-interaction --no-scripts; \
    fi

# ----------------------------------------
# Copy application code
# ----------------------------------------
COPY . .

# ----------------------------------------
# Set permissions
# ----------------------------------------
RUN chown -R www-data:www-data /var/www/storage /var/www/bootstrap/cache 2>/dev/null || true

# ----------------------------------------
# Expose PHP-FPM port
# ----------------------------------------
EXPOSE 9000

CMD ["php-fpm"]
```

### .env.example
```bash
# ==========================================================================
# UBOTZ 2.0 — Environment Configuration Template
# ==========================================================================
# INSTRUCTIONS:
#   1. Copy this file: cp .env.example .env
#   2. Fill in REAL values for passwords (generate strong passwords)
#   3. NEVER commit .env to Git — only .env.example
#
# RULE: env() is BANNED outside config/ files.
#       All application code must use config('key') instead.
# ==========================================================================

# ==========================================
# APPLICATION
# ==========================================
APP_NAME=Ubotz
APP_ENV=local
APP_KEY=
APP_DEBUG=true
APP_URL=http://localhost:8000

# ==========================================
# DATABASE (MySQL 8.0)
# ==========================================
DB_CONNECTION=mysql
DB_HOST=ubotz_mysql
DB_PORT=3306
DB_DATABASE=ubotz_central
DB_USERNAME=ubotz_app
DB_PASSWORD=CHANGE_ME_GENERATE_STRONG_PASSWORD
DB_ROOT_PASSWORD=CHANGE_ME_GENERATE_STRONG_ROOT_PASSWORD

# ==========================================
# REDIS
# ==========================================
REDIS_HOST=ubotz_redis
REDIS_PASSWORD=CHANGE_ME_GENERATE_STRONG_REDIS_PASSWORD
REDIS_PORT=6379

# Redis database allocation:
#   DB 0 = Application cache (default)
#   DB 1 = Session storage
#   DB 2 = JWT blacklist (persistent, AOF enabled)
#   DB 3 = Queue
REDIS_CACHE_DB=0
REDIS_SESSION_DB=1
REDIS_JWT_BLACKLIST_DB=2
REDIS_QUEUE_DB=3

# ==========================================
# QUEUE
# ==========================================
QUEUE_CONNECTION=redis

# ==========================================
# CACHE
# ==========================================
CACHE_STORE=redis

# ==========================================
# SESSION
# ==========================================
SESSION_DRIVER=redis
SESSION_LIFETIME=120

# ==========================================
# LOGGING
# ==========================================
LOG_CHANNEL=stack
LOG_LEVEL=debug

# ==========================================
# CORS (Frontend URL — separate server)
# ==========================================
FRONTEND_URL=http://localhost:3000

# ==========================================
# JWT (Phase 2 — leave empty until then)
# ==========================================
# JWT_SECRET=
# JWT_TTL=15
# JWT_REFRESH_TTL=10080
```

### config/database.php
```php
<?php

use Illuminate\Support\Str;

return [
    'default' => env('DB_CONNECTION', 'mysql'),

    'connections' => [
        'mysql' => [
            'driver' => 'mysql',
            'url' => env('DB_URL'),
            'host' => env('DB_HOST', '127.0.0.1'),
            'port' => env('DB_PORT', '3306'),
            'database' => env('DB_DATABASE', 'laravel'),
            'username' => env('DB_USERNAME', 'root'),
            'password' => env('DB_PASSWORD', ''),
            'unix_socket' => env('DB_SOCKET', ''),
            'charset' => env('DB_CHARSET', 'utf8mb4'),
            'collation' => env('DB_COLLATION', 'utf8mb4_unicode_ci'),
            'prefix' => '',
            'prefix_indexes' => true,
            'strict' => true,
            'engine' => null,
            'options' => extension_loaded('pdo_mysql') ? array_filter([
                PDO::MYSQL_ATTR_SSL_CA => env('MYSQL_ATTR_SSL_CA'),
            ]) : [],
        ],
    ],

    'migrations' => [
        'table' => 'migrations',
        'update_date_on_publish' => true,
    ],

    'redis' => [
        'client' => env('REDIS_CLIENT', 'phpredis'),

        'options' => [
            'cluster' => env('REDIS_CLUSTER', 'redis'),
            'prefix' => env('REDIS_PREFIX', Str::slug(env('APP_NAME', 'laravel'), '_').'_database_'),
            'persistent' => env('REDIS_PERSISTENT', false),
        ],

        'default' => [
            'url' => env('REDIS_URL'),
            'host' => env('REDIS_HOST', '127.0.0.1'),
            'username' => env('REDIS_USERNAME'),
            'password' => env('REDIS_PASSWORD'),
            'port' => env('REDIS_PORT', '6379'),
            'database' => env('REDIS_DB', '0'),
        ],

        'cache' => [
            'url' => env('REDIS_URL'),
            'host' => env('REDIS_HOST', '127.0.0.1'),
            'username' => env('REDIS_USERNAME'),
            'password' => env('REDIS_PASSWORD'),
            'port' => env('REDIS_PORT', '6379'),
            'database' => env('REDIS_CACHE_DB', '1'),
        ],
    ],
];
```

### config/auth.php
```php
<?php

return [
    'defaults' => [
        'guard' => env('AUTH_GUARD', 'web'),
        'passwords' => env('AUTH_PASSWORD_BROKER', 'users'),
    ],

    'guards' => [
        'web' => [
            'driver' => 'session',
            'provider' => 'users',
        ],

        'admin_api' => [
            'driver'   => 'jwt',
            'provider' => 'admins',
        ],

        'tenant_api' => [
            'driver'   => 'jwt',
            'provider' => 'users',
        ],
    ],

    'providers' => [
        'users' => [
            'driver' => 'eloquent',
            'model' => App\Infrastructure\Persistence\Shared\UserRecord::class,
        ],

        'admins' => [
            'driver' => 'eloquent',
            'model'  => App\Infrastructure\Persistence\Shared\AdminRecord::class,
        ],
    ],

    'passwords' => [
        'users' => [
            'provider' => 'users',
            'table' => env('AUTH_PASSWORD_RESET_TOKEN_TABLE', 'password_reset_tokens'),
            'expire' => 60,
            'throttle' => 60,
        ],
    ],

    'password_timeout' => env('AUTH_PASSWORD_TIMEOUT', 10800),
];
```

### config/jwt.php
```php
<?php

return [
    'secret' => env('JWT_SECRET'),
    'keys' => [
        'public' => env('JWT_PUBLIC_KEY'),
        'private' => env('JWT_PRIVATE_KEY'),
        'passphrase' => env('JWT_PASSPHRASE'),
    ],
    'ttl' => (int) env('JWT_TTL', 15),
    'refresh_iat' => env('JWT_REFRESH_IAT', false),
    'refresh_ttl' => (int) env('JWT_REFRESH_TTL', 10080),
    'algo' => env('JWT_ALGO', 'HS256'),
    'required_claims' => [
        'iss', 'iat', 'exp', 'nbf', 'sub', 'jti',
    ],
    'persistent_claims' => [
        'tenant_id', 'token_version', 'type', 'authority_level',
    ],
    'lock_subject' => true,
    'leeway' => (int) env('JWT_LEEWAY', 0),
    'blacklist_enabled' => env('JWT_BLACKLIST_ENABLED', true),
    'blacklist_grace_period' => (int) env('JWT_BLACKLIST_GRACE_PERIOD', 0),
    'show_black_list_exception' => env('JWT_SHOW_BLACKLIST_EXCEPTION', true),
    'decrypt_cookies' => false,
    'cookie_key_name' => 'token',
    'providers' => [
        'jwt' => PHPOpenSourceSaver\JWTAuth\Providers\JWT\Lcobucci::class,
        'auth' => PHPOpenSourceSaver\JWTAuth\Providers\Auth\Illuminate::class,
        'storage' => PHPOpenSourceSaver\JWTAuth\Providers\Storage\Illuminate::class,
    ],
    'tenant_cookie_domain' => env('JWT_TENANT_COOKIE_DOMAIN', '.ubotz.io'),
];
```

### config/session.php
```php
<?php

use Illuminate\Support\Str;

return [
    'driver' => env('SESSION_DRIVER', 'redis'),
    'lifetime' => (int) env('SESSION_LIFETIME', 120),
    'expire_on_close' => env('SESSION_EXPIRE_ON_CLOSE', false),
    'encrypt' => env('SESSION_ENCRYPT', false),
    'files' => storage_path('framework/sessions'),
    'connection' => env('SESSION_CONNECTION'),
    'table' => env('SESSION_TABLE', 'sessions'),
    'store' => env('SESSION_STORE'),
    'lottery' => [2, 100],
    'cookie' => env(
        'SESSION_COOKIE',
        Str::slug(env('APP_NAME', 'laravel'), '_').'_session'
    ),
    'path' => env('SESSION_PATH', '/'),
    'domain' => env('SESSION_DOMAIN'),
    'secure' => env('SESSION_SECURE_COOKIE'),
    'http_only' => env('SESSION_HTTP_ONLY', true),
    'same_site' => env('SESSION_SAME_SITE', 'lax'),
    'partitioned' => env('SESSION_PARTITIONED_COOKIE', false),
];
```

### config/cache.php
```php
<?php

use Illuminate\Support\Str;

return [
    'default' => env('CACHE_STORE', 'redis'),
    'stores' => [
        'redis' => [
            'driver' => 'redis',
            'connection' => env('REDIS_CACHE_CONNECTION', 'cache'),
            'lock_connection' => env('REDIS_CACHE_LOCK_CONNECTION', 'default'),
        ],
    ],
    'prefix' => env('CACHE_PREFIX', Str::slug(env('APP_NAME', 'laravel'), '_').'_cache_'),
];
```

### config/queue.php
```php
<?php

return [
    'default' => env('QUEUE_CONNECTION', 'redis'),
    'connections' => [
        'redis' => [
            'driver' => 'redis',
            'connection' => env('REDIS_QUEUE_CONNECTION', 'default'),
            'queue' => env('REDIS_QUEUE', 'default'),
            'retry_after' => (int) env('REDIS_QUEUE_RETRY_AFTER', 90),
            'block_for' => null,
            'after_commit' => false,
        ],
    ],
    'batching' => [
        'database' => env('DB_CONNECTION', 'mysql'),
        'table' => 'job_batches',
    ],
    'failed' => [
        'driver' => env('QUEUE_FAILED_DRIVER', 'database-uuids'),
        'database' => env('DB_CONNECTION', 'mysql'),
        'table' => 'failed_jobs',
    ],
];
```

### composer.json
```json
{
    "$schema": "https://getcomposer.org/schema.json",
    "name": "laravel/laravel",
    "type": "project",
    "require": {
        "php": "^8.2",
        "barryvdh/laravel-dompdf": "^3.1",
        "laravel/framework": "^12.0",
        "laravel/tinker": "^2.10.1",
        "maatwebsite/excel": "^3.1",
        "php-open-source-saver/jwt-auth": "^2.8",
        "razorpay/razorpay": "^2.9"
    }
}
```

---

## BATCH 2 — Security-Critical Multi-Tenant Config

### docker/nginx/default.conf
```nginx
server {
    listen 80;
    server_name localhost;
    root /var/www/public;
    index index.php;

    charset utf-8;
    client_max_body_size 50M;

    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    server_tokens off;

    location / {
        try_files $uri $uri/ /index.php?$query_string;
    }

    location ~ \.php$ {
        fastcgi_pass ubotz_backend:9000;
        fastcgi_param SCRIPT_FILENAME $realpath_root$fastcgi_script_name;
        include fastcgi_params;
    }

    location ~ /\.(?!well-known) {
        deny all;
    }
}
```

### config/cors.php
```php
<?php

return [
    'paths' => ['api/*'],
    'allowed_methods' => ['*'],
    'allowed_origins' => [
        env('FRONTEND_URL', 'http://localhost:3000'),
    ],
    'allowed_origins_patterns' => [
        '#^http://.*\.localhost:3000$#',
    ],
    'allowed_headers' => ['*'],
    'exposed_headers' => [],
    'max_age' => 0,
    'supports_credentials' => true,
];
```

### app/Http/Middleware/AddBearerTokenFromCookie.php
```php
<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class AddBearerTokenFromCookie
{
    public function handle(Request $request, Closure $next): Response
    {
        $cookieName = str_starts_with($request->getPathInfo(), '/api/tenant/')
            ? 'ubotz_auth_token'
            : config('jwt.cookie_name', 'ubotz_admin_token');

        $token = $request->cookie($cookieName);

        if ($token !== null && $request->bearerToken() === null) {
            $request->headers->set('Authorization', 'Bearer ' . $token);
        }

        return $next($request);
    }
}
```

### app/Infrastructure/Services/TenantSessionManager.php
```php
<?php

declare(strict_types=1);

namespace App\Infrastructure\Services;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

class TenantSessionManager
{
    private const KEY_PREFIX = 'tenant_sessions:';

    public function __construct(
        private readonly PlatformSettingsService $platformSettings
    ) {}

    public function recordSession(int $tenantId, int $userId, string $jti, int $expiresAt): void
    {
        $key = self::KEY_PREFIX . $tenantId . ':' . $userId;
        $sessions = Cache::get($key, []);
        $sessions[$jti] = $expiresAt;

        $now = time();
        $sessions = array_filter($sessions, fn($exp) => $exp > $now);

        $mode = $this->platformSettings->getString('quota.session_enforcement_mode', 'hard_block');
        
        if ($mode === 'evict_oldest') {
            $maxSessions = $this->getMaxSessions($tenantId);
            if ($maxSessions > 0 && count($sessions) > $maxSessions) {
                asort($sessions);
                $sessions = array_slice($sessions, -$maxSessions, $maxSessions, true);
            }
        }
        
        $ttl = 1;
        if (!empty($sessions)) {
            $maxExp = max($sessions);
            $ttl = max(1, $maxExp - $now);
        }

        Cache::put($key, $sessions, $ttl);
    }

    public function isValidSession(int $tenantId, int $userId, string $jti): bool
    {
        $key = self::KEY_PREFIX . $tenantId . ':' . $userId;
        $sessions = Cache::get($key, []);
        return isset($sessions[$jti]) && $sessions[$jti] > time();
    }

    private function getMaxSessions(int $tenantId): int
    {
        $cacheKey = "tenant:{$tenantId}:max_sessions";
        return (int) Cache::remember($cacheKey, 300, function () use ($tenantId) {
            $planId = DB::table('tenant_subscriptions')
                ->where('tenant_id', $tenantId)
                ->whereIn('status', ['active', 'trial', 'past_due'])
                ->orderBy('id', 'desc')
                ->value('plan_id');

            if (!$planId) return 0;

            $features = DB::table('subscription_plans')->where('id', $planId)->value('features');
            if (!$features) return 0;

            $featuresArr = is_string($features) ? json_decode($features, true) : $features;
            return (int) ($featuresArr['max_sessions'] ?? 0);
        });
    }
}
```

### config/app.php
```php
<?php

return [
    'name' => env('APP_NAME', 'Laravel'),
    'env' => env('APP_ENV', 'production'),
    'debug' => (bool) env('APP_DEBUG', false),
    'url' => env('APP_URL', 'http://localhost'),
    'tenant_base_domain' => env('TENANT_BASE_DOMAIN', 'ubotz.io'),
    'timezone' => 'UTC',
    'locale' => env('APP_LOCALE', 'en'),
    'cipher' => 'AES-256-CBC',
    'key' => env('APP_KEY'),
];
```

---

## BATCH 3 — CI/CD & Deployment

### .github/workflows/ci.yml
```yaml
name: Backend CI

on:
  push:
    branches: [ main ]
  pull_request:
    branches: [ main ]

jobs:
  backend-qa:
    runs-on: ubuntu-latest
    services:
      mysql:
        image: mysql:8.0
        env:
          MYSQL_DATABASE: ubotz_central
          MYSQL_ROOT_PASSWORD: ${{ secrets.CI_DB_PASSWORD }}
        ports:
          - 3306:3306
      redis:
        image: redis:7-alpine
        ports:
          - 6379:6379

    steps:
      - uses: actions/checkout@v4
      - uses: shivammathur/setup-php@v2
        with:
          php-version: '8.3'
          extensions: mbstring, pdo_mysql, redis
      - run: composer install --no-interaction --prefer-dist --optimize-autoloader
      - run: cp .env.ci .env
      - run: php artisan key:generate
      - run: php artisan migrate --force
      - run: vendor/bin/php-cs-fixer fix --dry-run
      - run: vendor/bin/phpstan analyse
      - run: php artisan test --parallel
```

### routes/api.php
```php
<?php

declare(strict_types=1);

use App\Http\Controllers\Api\Auth\AdminAuthController;
use App\Http\Controllers\HealthController;
use Illuminate\Support\Facades\Route;

Route::get('/health', HealthController::class);

Route::prefix('auth')->group(function () {
    Route::post('/login', [AdminAuthController::class, 'login']);
    Route::post('/logout', [AdminAuthController::class, 'logout'])->middleware('auth:admin_api');
});

Route::prefix('platform')->middleware(['auth:admin_api', 'admin.session'])->group(function () {
    Route::get('/tenants', [\App\Http\Controllers\Api\SuperAdminDashboard\Tenant\TenantReadController::class, 'index']);
});

Route::prefix('tenant/auth')->group(function () {
    Route::middleware(['resolve.tenant.subdomain'])->group(function () {
        Route::post('/login', [\App\Http\Controllers\Api\TenantAdminDashboard\Auth\TenantAuthController::class, 'login']);
    });
});

Route::prefix('tenant')->middleware([
    'tenant.resolve.token',
    'auth:tenant_api',
    'tenant.active',
    'tenant.session',
])->group(function () {
    require base_path('routes/tenant_dashboard/course.php');
    require base_path('routes/tenant_dashboard/users.php');
});
```
