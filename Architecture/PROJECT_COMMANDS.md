# Ubotz 2.0 — Project Commands Reference

This document provides a cheat sheet for common development tasks, including Docker management, database migrations, and code quality checks.

## 🐳 Docker Management

### Start the Application
Start all services (Backend, MySQL, Redis, Nginx, Queue) in detached mode.
```bash
docker compose up -d
```

### Stop the Application
Stop and remove all running containers.
```bash
docker compose down
```

### View Logs
Follow the logs for all services or a specific service.
```bash
# All services
docker compose logs -f

# Specific service (e.g., backend)
docker compose logs -f ubotz_backend
```

### Access Backend Shell
Open an interactive Bash shell inside the backend container to run Artisan or Composer commands.
```bash
docker compose exec ubotz_backend bash
# OR (shorthand if configured)
# ./shell.sh
```
docker compose exec ubotz_backend php artisan optimize:clear
---

## 🗄️ Database & Migrations

All Artisan commands should be run inside the `ubotz_backend` container.

### Run Migrations
Apply pending migrations to the database.
```bash
docker compose exec ubotz_backend php artisan migrate
```
*Note: This automatically scans both `database/migrations/central` and `database/migrations/tenant` directories.*

### Rollback Migrations
Rollback the last batch of migrations.
```bash
docker compose exec ubotz_backend php artisan migrate:rollback
```

### Fresh Reset (Destructive)
Drop all tables and re-run all migrations from scratch, then seed the database.
```bash
docker compose exec ubotz_backend php artisan migrate:fresh --seed
```

### Check Migration Status
See which migrations have been run and which are pending.
```bash
docker compose exec ubotz_backend php artisan migrate:status
```

---

## 🛠️ Code Quality

### Static Analysis (PHPStan)
Run static analysis to catch type errors and bugs.
```bash
docker compose exec ubotz_backend ./vendor/bin/phpstan analyse
```

### Code Formatting (Laravel Pint)
Fix code style issues automatically.
```bash
docker compose exec ubotz_backend ./vendor/bin/pint
```

### Run Tests (PHPUnit / Pest)
Execute the automated test suite.
```bash
docker compose exec ubotz_backend php artisan test
```

---

## 📦 Dependency Management

### Install PHP Dependencies
```bash
docker compose exec ubotz_backend composer install
```

### Update PHP Dependencies
```bash
docker compose exec ubotz_backend composer update
```

---

## 🚀 Frontend (If applicable)

Run the Vite development server (usually run on the host machine, not inside Docker, unless configured otherwise).
```bash
npm run dev
```

---

## 📂 Directory Structure Reference
```bash
- **`docker-compose.yml`**: Defines the services.
- **`backend/`**: Laravel application source code.
- **`backend/database/migrations/central/`**: Landlord/Platform migrations.
- **`backend/database/migrations/tenant/`**: Tenant-specific migrations.
```