# UBOTZ 2.0 Testing Credentials Reference

This document provides a quick reference for all the seeded accounts available for manual testing in both the Platform (Super Admin) and Tenant (School) environments.

All passwords are **`password`** unless otherwise configured in the `.env` file (for the Root Owner).

---

## 1. Platform Admins (Super Admin Dashboard)

**Login URL:** `http://localhost:3000/auth/platform-login` (or equivalent configured frontend URL)

| Role | Hierarchy | Email | Password |
| :--- | :--- | :--- | :--- |
| **Root Approver** | L2 (80) | `l2@ubotz.com` | `password` |
| **Operations Admin** | L3 (70) | `l3@ubotz.com` | `password` |
| **Super Admin** | L4 (60) | `l4@ubotz.com` | `password` |
| **Tenant Ops** | L5 (50) | `l5@ubotz.com` | `password` |
| **Billing Admin** | L6 (40) | `l6@ubotz.com` | `password` |
| **Audit Admin** | L7 (30) | `l7@ubotz.com` | `password` |

*(Note: The L1 Root Owner email is configured via `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD` in your `.env` file).*

---

## 2. School A (Tenant Admin Dashboard)

**Tenant Name:** School A  
**Slug:** `school-a`  
**Login URL:** `http://school-a.localhost:3000/auth/login`

| User | Role | Access Level | Email | Password |
| :--- | :--- | :--- | :--- | :--- |
| **Owner A** | `owner` | Full Access (100) | `owner@school-a.localhost` | `password` |
| **Admin A** | `admin` | Admin Access (80) | `admin@school-a.localhost` | `password` |
| **Teacher A** | `teacher` | Limited Access (60) | `teacher@school-a.localhost` | `password` |

*This tenant acts as the primary environment for UI testing. It comes pre-seeded with 25 courses and an entire exam hierarchy.*

---

## 3. School B (Cross-Tenant Data Isolation Testing)

**Tenant Name:** School B  
**Slug:** `school-b`  
**Login URL:** `http://school-b.localhost:3000/auth/login`

| User | Role | Access Level | Email | Password |
| :--- | :--- | :--- | :--- | :--- |
| **Owner B** | `owner` | Full Access (100) | `owner@school-b.localhost` | `password` |
| **Teacher B** | `teacher` | Limited Access (60) | `teacher@school-b.localhost` | `password` |

*Use School B accounts in an incognito window concurrently with School A to verify cross-tenant data isolation. (e.g. Courses and Users in School A should not be visible here).*
