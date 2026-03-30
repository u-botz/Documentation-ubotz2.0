# Local Setup Guide — UBOTZ 2.0

This guide provides step-by-step instructions to set up the UBOTZ 2.0 platform locally on Windows 11 using Docker and npm.

---

## Prerequisites

Before starting, ensure you have the following installed on your Windows 11 machine:
1. **Docker Desktop**: [Install Docker Desktop](https://www.docker.com/products/docker-desktop/) (ensure WSL 2 backend is enabled).
2. **Node.js (v18 or v20)**: [Install Node.js](https://nodejs.org/).
3. **PowerShell**: The default terminal for these commands.

---

## 1. Backend Setup (Laravel + Docker)

The backend runs inside Docker containers. Follow these steps to initialize it:

### Step 1.1: Environment Configuration
Navigate to the `backend` directory and create your `.env` file from the template:
```powershell
cd backend
cp .env.example .env
```
> [!IMPORTANT]
> Open the `.env` file and update the `DB_PASSWORD` and `DB_ROOT_PASSWORD` with secure values (for local development, simple strings like `secret` are often used, but ensure they match your needs).

### Step 1.2: Start Docker Containers
Launch the Docker containers defined in `docker-compose.yml`:
```powershell
docker compose up -d
```
This will start the following services:
- `ubotz_mysql` (Database)
- `ubotz_redis` (Cache/Queue)
- `ubotz_backend` (PHP-FPM)
- `ubotz_web` (Nginx)
- Monitoring: `prometheus`, `grafana`, and exporters.

### Step 1.3: Install PHP Dependencies
Run `composer install` inside the backend container:
```powershell
docker exec -it ubotz_backend composer install
```

### Step 1.4: Application Key & Database Initialization
Generate the application key and run migrations with seeders to populate initial data:
```powershell
docker exec -it ubotz_backend php artisan key:generate
docker exec -it ubotz_backend php artisan migrate:fresh --seed
```

---

## 2. Frontend Setup (Next.js)

The frontend is a Next.js application. It can be run directly on your host machine for better performance during development.

### Step 2.1: Environment Configuration
Navigate to the `frontend` directory and create your environment file:
```powershell
cd ../frontend
# If .env.local doesn't exist, you can create it
# For development, you usually need to point to the backend API:
echo "NEXT_PUBLIC_API_URL=http://localhost:8000" > .env.local
```

### Step 2.2: Install Dependencies
Install the required npm packages:
```powershell
npm install
```

### Step 2.3: Start Development Server
Run the Next.js development server:
```powershell
npm run dev
```

---

## 3. Accessing the Application

Once both environments are running, you can access them at:

- **Frontend**: [http://localhost:3000](http://localhost:3000)
- **Backend API**: [http://localhost:8000](http://localhost:8000)
- **Monitoring (Grafana)**: [http://localhost:3001](http://localhost:3001)

---

## Troubleshooting

### Common Issues on Windows
1. **Docker Not Started**: Ensure Docker Desktop is running.
2. **Port Conflicts**: Port `3306` (MySQL) or `8000` (Backend) might be in use. Check with `Get-NetTCPConnection -LocalPort 8000`.
3. **WSL 2 Permissions**: If you encounter file permission issues, ensure your project is located within the WSL 2 filesystem or your user directory.
4. **Artisan Commands**: Always run artisan commands through Docker as per the project protocol:
   ```powershell
   docker exec -it ubotz_backend php artisan [command]
   ```

---

## Testing the setup
To verify the setup, run the backend tests:
```powershell
docker exec -it ubotz_backend php artisan test
```

And for frontend linting/tests:
```powershell
npm run lint
# npm run test (if configured)
```
