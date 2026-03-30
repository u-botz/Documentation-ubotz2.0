# Ubotz 2.0 Frontend Testing Guide

This guide explains how to run the new testing infrastructure added to the Ubotz 2.0 Next.js frontend. It covers both **Unit Tests (Jest)** and **End-to-End Tests (Playwright)**.

---

## 1. Prerequisites

All test commands must be run from the `frontend` directory using **PowerShell**:

```powershell
cd C:\Users\sayan\lms\Ubotz_2.0\frontend
```

Ensure all dependencies are installed:
```powershell
npm install
npx playwright install
```

---

## 2. Unit Testing (Jest + React Testing Library)

Unit tests run in an isolated JSDOM environment. They are extremely fast and do not require the backend or the frontend server to be running.

### What to Unit Test
- Pure functions in `shared/lib/` (e.g., currency formatters)
- Custom hooks in `shared/hooks/`
- Reusable UI primitives in `shared/ui/`
- Individual client components (components with `"use client"`)

> **Note:** Next.js Server Components cannot be unit tested with Jest/JSDOM. Those must be covered by E2E tests.

### Running Unit Tests

To run the entire Jest test suite exactly once:
```powershell
npm run test
```

To run a specific test file:
```powershell
npm run test shared/lib/__tests__/currency.test.ts
```

To run tests in watch mode (auto-reruns when you save a file):
```powershell
npm run test:watch
```

To generate a test coverage report:
```powershell
npm run test:coverage
```

---

## 3. End-to-End Testing (Playwright)

End-to-End (E2E) tests simulate a real user opening a real browser and interacting with the UI.

### Critical Requirement: The Full Stack Must Be Running

Playwright tests the actual application. Before running E2E tests, you **must** have both servers running:

1. **The Laravel Backend (Docker)** is running and accessible on port `8000`.
2. **The Next.js Dev Server** will be automatically started by Playwright, but it expects to successfully proxy `/api/*` requests to `localhost:8000`.

### What to E2E Test
- Authentication flows (Login, Logout, Password Reset)
- Complex page loads (Dashboards)
- Multi-step business flows (Course creation, Checkout, Quizzes)

### The Setup Project (Authentication)

Because Ubotz uses HTTP-only cookies for authentication, our tests are configured in `playwright.config.ts` to first execute a "setup" project. 
The setup project runs `e2e/auth/setup.ts`, logs in as a Platform Admin, and saves that session cookie to `e2e/.auth/admin.json`.
Subsequent test files read that file so they skip the login screen entirely and jump straight to the dashboards.

### Running E2E Tests

To run the entire E2E test suite headlessly (no visible browser window):
```powershell
npm run e2e
```

To run E2E tests with a visible browser UI (great for debugging):
```powershell
npm run e2e:ui
```

To run a single spec file headlessly:
```powershell
npm run e2e e2e/auth/platform-login.spec.ts
```

To run a single spec file in headed mode (watch the browser move):
```powershell
npm run e2e:headed e2e/auth/platform-login.spec.ts
```

### Viewing E2E Results

If a test fails, Playwright captures a trace and a screenshot. You can view the rich HTML report by running:
```powershell
npm run e2e:report
```

---

## 4. Test Environment Variables

Playwright looks for a `.env.test` file in the `frontend` directory. If you are testing locally against your local Docker database, create `.env.test` with your standard testing credentials:

```env
TEST_ADMIN_EMAIL=admin@ubotz.com
TEST_ADMIN_PASSWORD=password
TEST_TENANT_ADMIN_EMAIL=tenant_admin@ubotz.com
TEST_TENANT_ADMIN_PASSWORD=password
```
