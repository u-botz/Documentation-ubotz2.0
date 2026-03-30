# UBOTZ 2.0 — Dedicated Deployment Tier: Pre-Architecture Document (REVISED)

| Field | Value |
|---|---|
| **Document Type** | Pre-Architecture Analysis & Recommendation |
| **Date** | March 18, 2026 |
| **Revision** | 2.0 — Complete rewrite based on revised trust model |
| **Issued By** | Principal Engineer / Architecture Auditor |
| **Audience** | Platform Owner (L1), Technical Lead |
| **Status** | DRAFT — Pending Business Decision on Open Items |
| **Prerequisites** | Phase 12C complete. Module Entitlement System designed. |
| **Supersedes** | v1.0 (Ubotz-owned server model — discarded) |

> **This document captures requirements, evaluates architectural options, and provides recommendations for a new "Dedicated Deployment" product tier. No implementation should begin until all open decisions are resolved and this document is promoted to APPROVED.**

---

## 1. Executive Summary

### 1.1 What Is Being Proposed

A new product tier — **Dedicated Deployment** — where a tenant receives the Ubotz LMS+ERP application deployed on **their own server** (client-purchased VPS or on-premise hardware). The client has **full root/SSH access** to the server. Ubotz deploys and maintains the application via SSH, retaining a deploy key for updates and maintenance.

Two licensing models exist under this tier:

1. **One-Time Purchase** — Client pays once, owns that version forever. No kill-switch. Source code is visible (accepted risk, legal protection only).
2. **Subscription** — Client pays monthly/annually. Application hard-locks if payment stops. Source code must be **encrypted/compiled** to prevent tampering and IP theft.

### 1.2 Key Characteristics (From Requirements Gathering)

| Attribute | One-Time Purchase | Subscription |
|---|---|---|
| **Server ownership** | Client (their VPS) | Client (their VPS) |
| **Client SSH access** | Full root | Full root |
| **Stack** | Identical Docker Compose | Identical Docker Compose |
| **Platform admin files** | **Physically absent** | **Physically absent** |
| **Source code readable** | Yes (accepted) | **No — encrypted/compiled** |
| **Licensing agent** | Present, permanent license | Present, phone-home required |
| **Kill-switch** | None | Yes — hard lock on expiry |
| **Updates** | Frozen at purchased version | Ubotz pushes via SSH |
| **Code tampering protection** | Legal only | **Technical (encryption) + Legal** |
| **Ubotz ongoing SSH access** | Yes (maintenance) | Yes (updates + maintenance) |
| **Module toggling** | Fixed at purchase | Remote via control plane |
| **Telemetry** | Not required | Required (anonymized) |

### 1.3 Why This Is a Complete Rewrite (v1 → v2)

The v1 document assumed Ubotz owned the server and the client had zero access. That model allowed "files exist but routes not registered" as a safe strategy because no one could read the filesystem.

**The revised reality is fundamentally different:**

| v1 Assumption | v2 Reality | Impact |
|---|---|---|
| Ubotz owns server | Client owns server | Client can read all files |
| No client SSH access | Full root access | Client can modify any file |
| Dead code on disk is safe | Dead code is **readable IP exposure** | Platform admin code = leaked IP |
| Route blocking is sufficient | Route blocking is **bypassable** | Must physically remove code |
| License middleware can't be tampered | Client can edit PHP files | Must encrypt subscription code |
| Control plane always reachable | Client can block outbound traffic | Need tamper-resistant enforcement |

### 1.4 What This Introduces

1. A **Control Plane** — new bounded context on the Ubotz central server (subscription tier only)
2. A **Licensing Agent** — embedded in every dedicated instance (both tiers)
3. A **Build Pipeline** — producing three build variants (shared, dedicated-open, dedicated-encrypted)
4. A **PHP Encryption Layer** — protecting subscription-tier source code
5. A **Code Stripping Pipeline** — physically removing platform admin code at build time
6. An **Instance Registry** — tracking deployed instances
7. An **Update Distribution** system — pushing to client servers via SSH

---

## 2. Threat Model

### 2.1 Threat Actors

| Actor | Capability | Motivation | Tier Affected |
|---|---|---|---|
| **Curious client admin** | SSH access, can read files | Understand how the system works | Both |
| **Rogue client developer** | Full code access, can modify files | Remove licensing, run for free | Subscription |
| **IP thief** | Can copy entire codebase | Resell or redistribute Ubotz code | Both |
| **Competitor** | Obtains code from a client | Clone the product | Both |

### 2.2 Threat Matrix

| Threat | Severity | One-Time Purchase | Subscription |
|---|---|---|---|
| **T1: Read source code** | Medium | Accepted (legal protection) | **CRITICAL — must prevent** |
| **T2: Remove licensing agent** | Critical | N/A (perpetual license) | **CRITICAL — must prevent** |
| **T3: Modify application behavior** | Medium | Accepted (they own it) | **HIGH — code integrity violation** |
| **T4: Copy and redistribute** | High | Legal protection only | **CRITICAL — encrypted code is harder to repackage** |
| **T5: Block control plane** | High | N/A (no phone-home) | **HIGH — must degrade gracefully** |
| **T6: Discover platform admin code** | Critical | **Must prevent** | **Must prevent** |
| **T7: Access platform admin endpoints** | Critical | **Must prevent** | **Must prevent** |

### 2.3 Security Guarantees by Tier

**Both tiers (NON-NEGOTIABLE):**
- Zero platform admin files on disk. Not disabled, not blocked — **physically absent**.
- Zero platform admin database tables. No `admins`, `admin_roles`, `admin_permissions`, `admin_audit_logs` tables.
- Zero platform admin routes, controllers, middleware, service providers.
- Zero references to platform admin bounded contexts in the deployed code.

**Subscription tier (additional):**
- PHP source code is encrypted/compiled — not human-readable
- Licensing agent is protected within the encrypted layer
- Tampering with encrypted files causes application failure (integrity check)
- Control plane phone-home is embedded in the encrypted core

---

## 3. Architecture Overview

### 3.1 The Three-Build Model

```
                    SINGLE CODEBASE (GitHub)
                           │
                    ┌──────┼──────────────────────┐
                    │      │                       │
                    ▼      ▼                       ▼
            ┌─────────┐ ┌──────────────┐  ┌──────────────────┐
            │ SHARED   │ │ DEDICATED    │  │ DEDICATED        │
            │ BUILD    │ │ OPEN BUILD   │  │ ENCRYPTED BUILD  │
            │          │ │              │  │                  │
            │ Multi-   │ │ One-Time     │  │ Subscription     │
            │ tenant   │ │ Purchase     │  │ Clients          │
            │ Platform │ │ Clients      │  │                  │
            └─────────┘ └──────────────┘  └──────────────────┘
                │              │                   │
                │              │                   │
            Contains:      Contains:           Contains:
            ✅ Platform    ❌ Platform         ❌ Platform
               Admin          Admin               Admin
            ✅ Tenant      ✅ Tenant           ✅ Tenant
               Features       Features            Features
            ❌ Licensing   ✅ Licensing         ✅ Licensing
               Agent          Agent               Agent
            N/A            ✅ Readable          ✅ ionCube
                              PHP source           Encrypted
```

### 3.2 Deployment Topology

```
┌─────────────────────────────────────────┐
│         UBOTZ CENTRAL SERVER            │
│         (educoreos.com)                 │
│                                         │
│  ┌───────────────────────────────────┐  │
│  │     Control Plane API             │  │
│  │  (new bounded context)            │  │
│  │                                   │  │
│  │  • Instance Registry              │  │
│  │  • License Management             │  │
│  │  • Heartbeat Receiver             │  │
│  │  • Module Config Distribution     │  │
│  │  • Kill-Switch Issuer             │  │
│  └──────────────┬────────────────────┘  │
│                 │                        │
│     Platform Admin Dashboard             │
│     (manages all dedicated instances)    │
└─────────────────┼───────────────────────┘
                  │
        ┌─────────┴──────────┐
        │                    │
        ▼                    ▼
  SUBSCRIPTION           ONE-TIME
  CLIENT SERVER          CLIENT SERVER
  ┌──────────────┐      ┌──────────────┐
  │ Encrypted    │      │ Open Source  │
  │ PHP Code     │      │ PHP Code    │
  │              │      │             │
  │ Licensing    │      │ Licensing   │
  │ Agent ───────┼──┐   │ Agent       │
  │ (phone-home) │  │   │ (permanent) │
  │              │  │   │             │
  │ Heartbeat ◀──┼──┼──▶│ No callback │
  │ every 6h     │  │   │             │
  └──────────────┘  │   └──────────────┘
                    │
              HTTPS heartbeat
              to Control Plane
```

### 3.3 Trust Model Comparison

| Property | Shared (Current) | Dedicated Open (One-Time) | Dedicated Encrypted (Subscription) |
|---|---|---|---|
| Ubotz controls server | ✅ Yes | ❌ No | ❌ No |
| Client can read code | ❌ No | ✅ Yes (accepted) | ❌ No (encrypted) |
| Client can modify code | ❌ No | ✅ Yes (accepted) | ⚠️ Can try (breaks integrity) |
| Platform admin code present | ✅ Yes | ❌ No | ❌ No |
| License enforceable technically | N/A | ❌ No (legal only) | ✅ Yes (encrypted agent) |
| Kill-switch works | N/A | N/A | ✅ Yes (with caveats — see §5.3) |

---

## 4. Code Stripping Pipeline (Both Tiers)

### 4.1 The Problem

The current codebase contains platform admin code across multiple directories:

```
app/
  Domain/SuperAdminDashboard/        ← MUST NOT ship
  Application/SuperAdminDashboard/   ← MUST NOT ship
  Infrastructure/SuperAdminDashboard/ ← MUST NOT ship
  Http/Controllers/SuperAdmin/       ← MUST NOT ship

routes/
  super_admin_dashboard/             ← MUST NOT ship (entire directory)

config/
  admin-auth.php                     ← MUST NOT ship (admin guard config)

database/migrations/central/
  *_create_admins_table.php          ← MUST NOT ship
  *_create_admin_roles_table.php     ← MUST NOT ship
  *_create_admin_permissions_table.php ← MUST NOT ship
  *_create_admin_role_permission_table.php ← MUST NOT ship
  *_create_admin_role_assignments_table.php ← MUST NOT ship
  *_create_admin_audit_logs_table.php ← MUST NOT ship
```

### 4.2 Stripping Strategy: Build-Time Physical Removal

A build script runs BEFORE Docker image creation that physically deletes platform admin code:

```bash
#!/bin/bash
# build-dedicated.sh — runs in CI/CD pipeline
# Produces a clean codebase with ZERO platform admin code

set -euo pipefail

DEDICATED_BUILD_DIR="./build-dedicated"

# 1. Clone clean copy
cp -r ./src "$DEDICATED_BUILD_DIR"

# 2. REMOVE platform admin domain layer
rm -rf "$DEDICATED_BUILD_DIR/app/Domain/SuperAdminDashboard"

# 3. REMOVE platform admin application layer
rm -rf "$DEDICATED_BUILD_DIR/app/Application/SuperAdminDashboard"

# 4. REMOVE platform admin infrastructure layer
rm -rf "$DEDICATED_BUILD_DIR/app/Infrastructure/SuperAdminDashboard"

# 5. REMOVE platform admin controllers
rm -rf "$DEDICATED_BUILD_DIR/app/Http/Controllers/SuperAdmin"

# 6. REMOVE platform admin routes
rm -rf "$DEDICATED_BUILD_DIR/routes/super_admin_dashboard"

# 7. REMOVE platform admin migrations
rm -f "$DEDICATED_BUILD_DIR/database/migrations/central/"*_create_admins_*
rm -f "$DEDICATED_BUILD_DIR/database/migrations/central/"*_create_admin_roles_*
rm -f "$DEDICATED_BUILD_DIR/database/migrations/central/"*_create_admin_permissions_*
rm -f "$DEDICATED_BUILD_DIR/database/migrations/central/"*_create_admin_role_permission_*
rm -f "$DEDICATED_BUILD_DIR/database/migrations/central/"*_create_admin_role_assignments_*
rm -f "$DEDICATED_BUILD_DIR/database/migrations/central/"*_create_admin_audit_logs_*

# 8. REMOVE platform admin seeders
rm -f "$DEDICATED_BUILD_DIR/database/seeders/"*AdminSeeder*
rm -f "$DEDICATED_BUILD_DIR/database/seeders/"*AdminPermission*
rm -f "$DEDICATED_BUILD_DIR/database/seeders/"*AdminRole*

# 9. REMOVE platform admin config
rm -f "$DEDICATED_BUILD_DIR/config/admin-auth.php"

# 10. REMOVE platform admin middleware
rm -f "$DEDICATED_BUILD_DIR/app/Http/Middleware/"*AdminAuth*
rm -f "$DEDICATED_BUILD_DIR/app/Http/Middleware/"*EnsureAdmin*

# 11. INJECT dedicated-mode service provider
cp ./dedicated-overrides/DedicatedLicensingServiceProvider.php \
   "$DEDICATED_BUILD_DIR/app/Providers/"

# 12. INJECT dedicated route registration
cp ./dedicated-overrides/dedicated-routes.php \
   "$DEDICATED_BUILD_DIR/routes/"

# 13. INJECT dedicated migrations
cp ./dedicated-overrides/migrations/* \
   "$DEDICATED_BUILD_DIR/database/migrations/dedicated/"

# 14. Modify RouteServiceProvider to skip admin routes
# (sed or PHP-based transformer)

# 15. Verify: no admin references remain
echo "=== VERIFICATION ==="
ADMIN_REFS=$(grep -rn "SuperAdminDashboard\|admin_api\|AdminAuth" \
    "$DEDICATED_BUILD_DIR/app/" \
    "$DEDICATED_BUILD_DIR/routes/" \
    --include="*.php" || true)

if [ -n "$ADMIN_REFS" ]; then
    echo "ERROR: Platform admin references found in dedicated build!"
    echo "$ADMIN_REFS"
    exit 1
fi

echo "✅ Dedicated build clean — zero platform admin references"
```

### 4.3 Verification Gate (CI/CD)

The build pipeline MUST fail if ANY of these checks fail:

| Check | Command | Expected |
|---|---|---|
| No admin directories | `ls app/Domain/SuperAdminDashboard` | Directory not found |
| No admin routes | `ls routes/super_admin_dashboard` | Directory not found |
| No admin migrations | `ls database/migrations/central/*admin*` | No matches |
| No admin string references | `grep -rn "SuperAdminDashboard" app/ routes/` | 0 results |
| No admin guard references | `grep -rn "admin_api" app/ routes/ config/` | 0 results |
| Application boots | `php artisan route:list` | No errors, no admin routes |
| Migrations run | `php artisan migrate --pretend` | No admin tables created |

### 4.4 What Stays in Dedicated Builds

| Component | Present | Reason |
|---|---|---|
| Tenant domain layer (`Domain/TenantAdminDashboard/`) | ✅ | Core LMS+ERP logic |
| Tenant application layer | ✅ | UseCases, Commands, Queries |
| Tenant infrastructure layer | ✅ | Repositories, Eloquent models |
| Tenant routes (`routes/tenant_dashboard/`) | ✅ | All tenant-facing APIs |
| Tenant migrations (`database/migrations/tenant/`) | ✅ | All tenant data tables |
| Central migrations for tenant support | ✅ | `tenants`, `subscription_plans`, `tenant_subscriptions` tables |
| Licensing Agent (`Infrastructure/Licensing/`) | ✅ | Phone-home + enforcement |
| Dedicated migrations (`database/migrations/dedicated/`) | ✅ | License cache tables |
| Shared kernel (auth, middleware, etc.) | ✅ | Foundation |

### 4.5 Codebase Design Implication

To make stripping clean and reliable, the codebase MUST maintain strict bounded context separation:

**Rule: No tenant-facing code may import or reference any class from `SuperAdminDashboard` namespaces.**

If this rule is violated, the stripping pipeline will produce a broken build (missing class references). This is actually a **beneficial architectural constraint** — it enforces proper bounded context isolation that should already exist per the DDD architecture.

**Audit action:** Before implementing the dedicated build pipeline, run a dependency scan to verify no cross-boundary imports exist between `SuperAdminDashboard` and `TenantAdminDashboard` namespaces.

---

## 5. PHP Encryption (Subscription Tier Only)

### 5.1 Why Encryption Is Required

For subscription clients with full root SSH access, the threat is:

1. Client reads PHP source → understands licensing logic → removes it
2. Client modifies licensing middleware → disables phone-home
3. Client copies code → runs on another server without license
4. Client's developer removes the kill-switch check

**Without encryption, the licensing agent is theater — any developer can bypass it in 30 minutes.**

### 5.2 Recommended Tool: ionCube Encoder

| Tool | Maturity | Laravel Support | Cost | Reverse-Engineering Difficulty |
|---|---|---|---|---|
| **ionCube** | 20+ years, industry standard | Excellent (used by many commercial Laravel apps) | ~$349/year (Cerberus edition) | Very high — no public decoder |
| SourceGuardian | 15+ years | Good | ~$299/year | High |
| Zephir (compile to C extension) | Newer | Partial (complex) | Free | Highest (native binary) |
| Custom obfuscation | DIY | Full control | Free | Low (determined attacker breaks it) |

**Recommendation: ionCube Encoder (Cerberus edition)**

**Rationale:**
- Industry standard for commercial PHP distribution (WHMCS, Blesta, many WordPress premium plugins use it)
- Loader is free and available for all PHP versions including 8.3
- Supports license file binding (MAC address, domain, IP, expiry date)
- Has built-in anti-tampering — encrypted files check integrity, modification = crash
- Laravel-compatible — encrypts individual `.php` files, preserves directory structure
- Cannot be decoded without the original encryption key (held by Ubotz only)

### 5.3 What Gets Encrypted

```
SUBSCRIPTION BUILD ENCRYPTION MAP:

app/
  Domain/                    → ✅ ENCRYPT (all business logic)
  Application/               → ✅ ENCRYPT (all use cases)
  Infrastructure/            → ✅ ENCRYPT (all repositories)
  Http/Controllers/          → ✅ ENCRYPT (all controllers)
  Http/Middleware/           → ✅ ENCRYPT (all middleware)
  Providers/                 → ✅ ENCRYPT (service providers)
  Infrastructure/Licensing/  → ✅ ENCRYPT (critical — licensing agent)

config/                      → ❌ PLAIN (must be editable for DB credentials, etc.)
routes/                      → ✅ ENCRYPT (prevent route manipulation)
database/migrations/         → ❌ PLAIN (Laravel needs to read migration files)
resources/views/             → ❌ PLAIN (Blade templates, low IP value)
public/                      → ❌ PLAIN (web-accessible assets)
.env                         → ❌ PLAIN (environment config, client must edit)
```

### 5.4 ionCube License File Integration

ionCube supports a **license file** that the encrypted PHP checks at runtime:

```
// license.dat (generated by Ubotz per client)
// Bound to specific server properties

ServerIP=203.0.113.42
LicenseExpiry=2027-03-18
LicenseType=subscription
InstanceID=inst_abc123
MaxUsers=500
ModulesEnabled=lms,erp
```

The encrypted PHP code reads this license file. If the file is missing, expired, or tampered with, the application refuses to start. **This is enforced inside the encrypted binary — the client cannot see or modify the check.**

### 5.5 Encryption Build Pipeline

```
Step 1: Code Stripping (§4)
         ↓
    Clean dedicated codebase (no platform admin)
         ↓
Step 2: ionCube Encoding
         ↓
    All app/ and routes/ files encrypted
    Config and migrations remain plain
         ↓
Step 3: Docker Image Build
         ↓
    Image includes: encrypted PHP + ionCube Loader + plain config
         ↓
Step 4: Generate License File
         ↓
    Per-client license.dat with server binding + expiry
         ↓
Step 5: Deploy to Client Server
         ↓
    Ubotz SSH → pull image → place license.dat → start containers
```

### 5.6 Anti-Tampering Layers (Subscription Tier)

| Layer | Mechanism | What It Prevents |
|---|---|---|
| **L1: ionCube encryption** | PHP files are binary-encoded, not readable | Source code theft, understanding licensing logic |
| **L2: ionCube integrity check** | Encrypted files self-verify, modification = crash | Editing encrypted files to bypass checks |
| **L3: License file binding** | License tied to server IP/hostname | Moving code to unlicensed server |
| **L4: License expiry** | License has hard expiry date | Running after subscription lapses |
| **L5: Phone-home heartbeat** | Licensing agent calls control plane | License revocation, module updates |
| **L6: Heartbeat inside encrypted code** | Phone-home logic is encrypted, can't be found/removed | Disabling the heartbeat |

### 5.7 Honest Limitations

No client-side protection is 100% unbreakable. Full transparency on what ionCube does and doesn't guarantee:

| Guarantee | Level | Detail |
|---|---|---|
| Casual copying prevention | ✅ Strong | Non-technical client cannot read or reuse code |
| Developer tampering prevention | ✅ Strong | Cannot modify encrypted files without breaking them |
| Licensing bypass prevention | ✅ Strong | License check is inside encrypted code, invisible |
| Determined reverse-engineering | ⚠️ Deterrent | A well-funded attacker with months of effort *might* partially deobfuscate. ionCube has never been publicly cracked for PHP 8.x. |
| Legal enforcement backup | ✅ Essential | Encryption buys time and evidence. Contract + DMCA is the ultimate enforcement. |

**Bottom line:** ionCube raises the bar from "any junior developer can bypass this in 30 minutes" to "a dedicated reverse-engineering team would need significant effort and specialized tools." Combined with legal contracts, this is industry-standard protection for commercial PHP software.

---

## 6. Licensing Agent Design (Both Tiers)

### 6.1 Two Modes

| Property | One-Time (Permanent) | Subscription (Phone-Home) |
|---|---|---|
| License type | Permanent token (no expiry) | Time-bound token (refreshed on heartbeat) |
| Phone-home | Not required | Every 6 hours |
| Kill-switch | None | Active |
| Module toggling | Fixed at purchase | Remote via control plane |
| Telemetry | Not sent | Anonymized counts sent |
| Grace period | N/A | 72h full → 48h read-only → hard lock |
| Enforcement | ionCube license file (if encrypted) OR embedded permanent flag | ionCube license file + heartbeat + encrypted checks |

### 6.2 License Token (Subscription Mode)

The Control Plane issues a **signed license token** refreshed on each heartbeat:

```json
{
  "instance_id": "inst_abc123",
  "tenant_name": "Demo Academy",
  "plan_code": "dedicated_pro",
  "license_type": "subscription",
  "modules_enabled": ["module.lms", "module.erp"],
  "limits": {
    "max_users": 500,
    "max_courses": 200,
    "max_storage_mb": 51200
  },
  "valid_until": "2026-03-21T00:00:00Z",
  "issued_at": "2026-03-18T00:00:00Z",
  "signature": "RSA-SHA256..."
}
```

### 6.3 License Token (One-Time / Permanent Mode)

```json
{
  "instance_id": "inst_xyz789",
  "tenant_name": "Premier Institute",
  "plan_code": "dedicated_lifetime",
  "license_type": "permanent",
  "modules_enabled": ["module.lms", "module.erp"],
  "limits": {
    "max_users": 0,
    "max_courses": 0,
    "max_storage_mb": 0
  },
  "valid_until": null,
  "issued_at": "2026-03-18T00:00:00Z",
  "version_locked": "2.5.0",
  "signature": "RSA-SHA256..."
}
```

`0` = unlimited (consistent with existing `PlanFeatures` convention from Phase 11A).

### 6.4 Heartbeat Flow (Subscription Only)

```
Every 6 hours:

CLIENT SERVER                         UBOTZ CONTROL PLANE
     │                                       │
     │── POST /api/control/heartbeat ───────▶│
     │   {                                   │
     │     instance_id: "inst_abc123",       │
     │     current_token_hash: "sha256...",  │
     │     telemetry: {                      │
     │       active_users: 342,              │
     │       total_courses: 87,              │
     │       storage_used_mb: 12400,         │
     │       app_version: "2.5.0",          │
     │       uptime_hours: 720              │
     │     }                                 │
     │   }                                   │
     │                                       │
     │◀── 200 OK ───────────────────────────│
     │   {                                   │
     │     license_token: "eyJ...",          │
     │     next_heartbeat_seconds: 21600,    │
     │     pending_actions: []               │
     │   }                                   │
```

### 6.5 Offline Behavior (Subscription Tier)

```
Timeline when subscription instance loses contact with Control Plane:

Hour 0-72:    FULL OPERATION (grace period)
              License token still valid (72h validity window).
              Warning logged locally.

Hour 72-120:  READ-ONLY MODE
              Token expired. All write operations blocked.
              Users can view content, access existing courses.
              Prominent banner: "System in maintenance mode."

Hour 120+:    HARD LOCK
              Application returns 503 for all requests.
              Only the health check endpoint responds.
```

**Why this cascade (not immediate lock):**
- Immediate lock punishes the client's end-users for transient network issues
- 72 hours matches the license token validity — no new code needed
- Read-only mode preserves learning access while blocking unbilled growth
- After 120 hours, something is seriously wrong — hard lock justified

### 6.6 Telemetry Boundaries (Data Sovereignty)

**ALLOWED to transmit (anonymized counts only):**
- Total active user count
- Total course count
- Total storage used (MB)
- Application version
- Server uptime

**NEVER transmitted (contractual + technical guarantee):**
- User names, emails, phone numbers, any PII
- Course titles, content, structure
- File contents
- Database query results
- Authentication tokens

> The telemetry collector runs `COUNT(*)` queries only. It never executes `SELECT *` or transmits row-level data. In the encrypted build, this is verifiable by Ubotz but not modifiable by the client — the telemetry code is inside the encrypted layer.

---

## 7. Control Plane — Bounded Context Design

### 7.1 Scope

The Control Plane lives on the **Ubotz central server** (educoreos.com). It manages all dedicated instances regardless of tier.

```
app/Domain/ControlPlane/
  Entities/
    DedicatedInstanceEntity.php
    LicenseTokenEntity.php
    HeartbeatRecordEntity.php
  ValueObjects/
    InstanceStatus.php          (provisioning, active, suspended, terminated)
    LicenseType.php             (permanent, subscription)
    DeploymentVersion.php
    TelemetrySnapshot.php
  Events/
    InstanceProvisioned.php
    InstanceActivated.php
    InstanceSuspended.php
    InstanceTerminated.php
    HeartbeatReceived.php
    HeartbeatMissed.php
    LicenseTokenIssued.php
    KillSwitchActivated.php
  Exceptions/
    InstanceNotFoundException.php
    InvalidLicenseException.php
    HeartbeatOverdueException.php
  Repositories/
    DedicatedInstanceRepositoryInterface.php
    HeartbeatRecordRepositoryInterface.php
  Services/
    LicenseTokenIssuer.php
    TelemetryValidator.php

app/Application/ControlPlane/
  UseCases/
    ProvisionInstanceUseCase.php
    ActivateInstanceUseCase.php
    SuspendInstanceUseCase.php
    TerminateInstanceUseCase.php
    ProcessHeartbeatUseCase.php
    IssueLicenseTokenUseCase.php
    IssuePermanentLicenseUseCase.php
    ActivateKillSwitchUseCase.php
    UpdateInstanceModulesUseCase.php
  Scheduled/
    CheckOverdueHeartbeatsCommand.php  (runs hourly, subscription instances only)

app/Infrastructure/ControlPlane/
  Repositories/
    EloquentDedicatedInstanceRepository.php
    EloquentHeartbeatRecordRepository.php
  Services/
    JwtLicenseTokenIssuer.php
    IonCubeLicenseFileGenerator.php
  Models/
    DedicatedInstance.php
    HeartbeatRecord.php
```

### 7.2 Database Tables (Central Server)

```sql
CREATE TABLE dedicated_instances (
    id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    instance_id VARCHAR(50) UNIQUE NOT NULL,
    tenant_id BIGINT UNSIGNED NOT NULL,
    subscription_id BIGINT UNSIGNED NULL,          -- NULL for one-time purchase

    -- License model
    license_type VARCHAR(20) NOT NULL,             -- 'permanent' or 'subscription'

    -- Server details (client's server)
    server_ip VARCHAR(45) NULL,
    server_hostname VARCHAR(255) NULL,
    server_provider VARCHAR(50) NULL,
    ssh_deploy_key_fingerprint VARCHAR(100) NULL,   -- for audit, not the key itself

    -- Status
    status VARCHAR(30) NOT NULL DEFAULT 'provisioning',

    -- Deployment
    current_version VARCHAR(20) NULL,
    version_locked_at VARCHAR(20) NULL,            -- one-time: frozen version

    -- Module config
    modules_enabled JSON NOT NULL,

    -- Health (subscription only)
    last_heartbeat_at TIMESTAMP NULL,
    consecutive_missed_heartbeats INT UNSIGNED NOT NULL DEFAULT 0,

    -- License
    current_license_token_hash VARCHAR(64) NULL,
    license_valid_until TIMESTAMP NULL,            -- NULL for permanent

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    FOREIGN KEY (tenant_id) REFERENCES tenants(id),
    INDEX idx_instances_status (status),
    INDEX idx_instances_license_type (license_type),
    INDEX idx_instances_heartbeat (last_heartbeat_at)
);

CREATE TABLE instance_heartbeats (
    id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    instance_id VARCHAR(50) NOT NULL,

    -- Telemetry
    active_users INT UNSIGNED NOT NULL DEFAULT 0,
    total_courses INT UNSIGNED NOT NULL DEFAULT 0,
    storage_used_mb INT UNSIGNED NOT NULL DEFAULT 0,
    app_version VARCHAR(20) NULL,
    uptime_hours INT UNSIGNED NOT NULL DEFAULT 0,

    -- Response
    license_token_issued BOOLEAN NOT NULL DEFAULT FALSE,

    received_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    INDEX idx_heartbeats_instance (instance_id, received_at)
);
```

### 7.3 Instance Lifecycle State Machine

```
                  ┌──────────────┐
                  │ PROVISIONING │
                  └──────┬───────┘
                         │ Deployed + license issued
                         ▼
                  ┌──────────────┐
          ┌──────│    ACTIVE     │◀─────────┐
          │      └──────┬───────┘           │
          │             │                   │
   [Subscription     Payment failed /     Payment received /
    only paths]     Policy violation      Issue resolved
          │             │                   │
          │             ▼                   │
          │      ┌──────────────┐           │
          ├─────▶│  SUSPENDED   │───────────┘
          │      └──────┬───────┘
          │             │ Grace expired / Manual
          │             ▼
          │      ┌──────────────┐
          └─────▶│  TERMINATED  │
                 └──────────────┘

ONE-TIME PATH (simplified):
  PROVISIONING → ACTIVE → (stays active forever)
                        → TERMINATED (only if contract violation, manual)
```

---

## 8. Build Pipeline Design

### 8.1 Three Build Variants

```bash
# 1. SHARED (existing — multi-tenant platform)
make build-shared
# Output: ubotz/backend:2.5.0-shared

# 2. DEDICATED OPEN (one-time purchase — readable PHP)
make build-dedicated-open
# Output: ubotz/backend:2.5.0-dedicated-open

# 3. DEDICATED ENCRYPTED (subscription — ionCube encoded)
make build-dedicated-encrypted
# Output: ubotz/backend:2.5.0-dedicated-encrypted
```

### 8.2 Pipeline Steps

```
┌──────────────────────────────────────────────────────────┐
│                    SHARED BUILD                          │
│  Source → Docker Build → ubotz/backend:X.Y.Z-shared     │
│  (unchanged from current process)                        │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│                 DEDICATED OPEN BUILD                     │
│  Source                                                  │
│    → Strip platform admin (§4 script)                    │
│    → Inject licensing agent                              │
│    → Inject dedicated migrations                         │
│    → Verify (grep for admin refs = 0)                    │
│    → Docker Build                                        │
│    → ubotz/backend:X.Y.Z-dedicated-open                 │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│               DEDICATED ENCRYPTED BUILD                  │
│  Source                                                  │
│    → Strip platform admin (§4 script)                    │
│    → Inject licensing agent                              │
│    → Inject dedicated migrations                         │
│    → Verify (grep for admin refs = 0)                    │
│    → ionCube encode app/ + routes/ (§5.3 encryption map) │
│    → Verify encoded files load with ionCube Loader       │
│    → Docker Build (with ionCube Loader pre-installed)    │
│    → ubotz/backend:X.Y.Z-dedicated-encrypted            │
└──────────────────────────────────────────────────────────┘
```

### 8.3 Dockerfile Changes

```dockerfile
# Base stage (shared between all builds)
FROM php:8.3-fpm-alpine AS base
# ... existing setup ...

# Dedicated encrypted stage
FROM base AS dedicated-encrypted
# Install ionCube Loader
COPY --from=ioncube-loader /usr/local/ioncube/ /usr/local/ioncube/
RUN echo "zend_extension=/usr/local/ioncube/ioncube_loader_lin_8.3.so" \
    > /usr/local/etc/php/conf.d/00-ioncube.ini

# Copy encrypted source
COPY ./build-dedicated-encrypted/app/ /var/www/app/
COPY ./build-dedicated-encrypted/routes/ /var/www/routes/
# Plain files
COPY ./build-dedicated-encrypted/config/ /var/www/config/
COPY ./build-dedicated-encrypted/database/ /var/www/database/
```

### 8.4 Frontend Build (Next.js)

The Next.js frontend is deployed as a **pre-built static/SSR bundle** on the client server. Since Next.js compiles to `.next/` output:

- Source `.tsx` files are NOT deployed — only the compiled output
- No platform admin pages are included (they exist in separate route groups)
- The compiled JS is minified and not easily readable (though not encrypted)

```
Frontend stripping:
  app/(super-admin-dashboard)/    ← EXCLUDE from build
  app/(tenant-panel)/             ← INCLUDE
  app/(public)/                   ← INCLUDE
```

This is achieved by a build-time `next.config.js` configuration or a pre-build script that removes super-admin page directories before `npm run build`.

---

## 9. Update Distribution (Subscription Tier Only)

### 9.1 Flow

```
1. Ubotz builds new encrypted Docker image:
   ubotz/backend:2.5.1-dedicated-encrypted

2. Image pushed to Ubotz private Docker registry

3. Platform Admin marks update available for target instances

4. Ubotz ops connects via SSH to client server

5. During client's maintenance window:
   a. Pull new image from registry
   b. Run new dedicated migrations
   c. Update ionCube license file if needed
   d. Swap containers (Caddy health check ensures zero downtime)
   e. Verify application boots

6. Heartbeat confirms new version to Control Plane
```

### 9.2 One-Time Purchase: No Updates

One-time purchase clients get the version they paid for, forever. Their `version_locked_at` field in the instance registry records this. Ubotz does not push updates unless the client purchases an upgrade separately.

---

## 10. Subscription Plan Integration

### 10.1 Extending the Existing Plan Model

The existing `subscription_plans` table and `PlanFeatures` value object (Phase 11A) can be extended with a `deployment_type` field:

```sql
ALTER TABLE subscription_plans
    ADD COLUMN deployment_type VARCHAR(20) NOT NULL DEFAULT 'shared'
    AFTER features;

-- deployment_type values: 'shared', 'dedicated_open', 'dedicated_encrypted'
```

### 10.2 Plan Examples

| Plan Code | Deployment Type | License Type | Price | Limits |
|---|---|---|---|---|
| `starter` | shared | N/A | ₹499/mo | 50 users, 20 courses |
| `professional` | shared | N/A | ₹1,999/mo | 500 users, 100 courses |
| `dedicated_basic_sub` | dedicated_encrypted | subscription | ₹9,999/mo | 500 users, 200 courses |
| `dedicated_pro_sub` | dedicated_encrypted | subscription | ₹24,999/mo | 2000 users, unlimited courses |
| `dedicated_lifetime` | dedicated_open | permanent | ₹2,99,999 one-time | Unlimited |

### 10.3 One-Time Purchase Flow

1. Super Admin creates a `dedicated_open` plan with one-time pricing
2. Super Admin provisions an instance → `ProvisionInstanceUseCase` creates `dedicated_instances` record with `license_type: permanent`
3. `IssuePermanentLicenseUseCase` generates a non-expiring license token
4. Ubotz ops deploys the open build to client server with permanent license
5. No further billing automation — marked as "paid" in the subscription system

### 10.4 Subscription Flow

1. Super Admin creates a `dedicated_encrypted` plan with monthly/annual pricing
2. Super Admin provisions an instance → record created with `license_type: subscription`
3. Existing Razorpay billing (Phase 12A-12C) handles recurring payments
4. `IssueLicenseTokenUseCase` generates 72h tokens refreshed by heartbeat
5. Ubotz ops deploys the encrypted build with time-bound license
6. If payment fails → subscription status changes → next heartbeat returns expired token → grace cascade activates

---

## 11. Security Analysis

### 11.1 Attack Scenarios & Defenses

| # | Attack | Target Tier | Defense | Residual Risk |
|---|---|---|---|---|
| A1 | Client reads platform admin source code | Both | **Code physically absent** — nothing to read | None |
| A2 | Client reads LMS/ERP business logic | One-time | Accepted (legal protection via contract) | IP visible but legally protected |
| A3 | Client reads LMS/ERP business logic | Subscription | **ionCube encryption** — binary, not readable | Determined attacker with months of effort *might* partially deobfuscate |
| A4 | Client removes licensing agent | Subscription | **Licensing agent is inside encrypted code** — cannot identify or remove it | Would need to break ionCube first |
| A5 | Client modifies encrypted PHP files | Subscription | **ionCube integrity check** — modified file = crash | Application stops working |
| A6 | Client copies code to another server | Subscription | **ionCube license file bound to server IP** — won't run elsewhere | Client could request new server, but Ubotz controls the license |
| A7 | Client blocks control plane URL | Subscription | **72h grace → read-only → hard lock** (enforcement inside encrypted code) | Client gets 72h of free usage max before lock |
| A8 | Client reverse-engineers ionCube | Subscription | No public ionCube 8.x decoder exists. Legal action as backup. | Theoretical risk, practically very difficult |
| A9 | Client resells the open-build code | One-time | **Legal contract + DMCA** — code has Ubotz copyright headers | Legal enforcement only |
| A10 | Rogue Ubotz employee accesses client data via SSH | Both | **Policy:** SSH access requires L2 approval + audit log. Key rotation schedule. | Human process risk |

### 11.2 Key Management

| Key | Stored Where | Purpose |
|---|---|---|
| ionCube encoder key | Ubotz build server (NEVER on client) | Encrypts PHP source code |
| ionCube loader | Every dedicated-encrypted instance | Decrypts PHP at runtime |
| License signing private key | Ubotz central server (secrets manager) | Signs license tokens |
| License verification public key | Every dedicated instance | Verifies token signature |
| SSH deploy key | Ubotz ops machines | Deploys to client servers |
| Docker registry credentials | Ubotz build pipeline | Pushes/pulls Docker images |

### 11.3 What ionCube Does NOT Protect

- **Config files** (`.env`, `config/*.php`) — must remain readable for client to configure database credentials, etc.
- **Blade templates** — low IP value, needed for customization
- **Database schema** — migrations are readable (client can see table structure)
- **Frontend JavaScript** — minified but not encrypted (standard for web apps)
- **Docker Compose file** — infrastructure config, readable

These are acceptable exposures. The high-value IP (business logic, algorithms, licensing) is in the encrypted PHP layer.

---

## 12. Impact on Existing Architecture

### 12.1 Changes to Central Server (educoreos.com)

| Component | Change |
|---|---|
| New bounded context: `ControlPlane` | ~25-30 new files |
| New central DB tables | `dedicated_instances`, `instance_heartbeats` |
| New API routes | `/api/control/heartbeat`, `/api/control/license/...` |
| Platform Admin Dashboard | New "Dedicated Instances" management section |
| Subscription Plans table | New `deployment_type` column |
| Build pipeline | Three-variant build (shared, dedicated-open, dedicated-encrypted) |

### 12.2 Changes to Application Codebase

| Component | Change |
|---|---|
| New directory: `Infrastructure/Licensing/` | ~10-12 new files |
| New migration directory: `database/migrations/dedicated/` | 2-3 migrations |
| Build script: `build-dedicated.sh` | Physical code stripping |
| ionCube encoding config | Encryption map definition |
| Dockerfile | Multi-stage for three variants |
| `docker-compose.dedicated.yml` | Dedicated variant compose file |
| Next.js build config | Platform admin page exclusion |

### 12.3 What Does NOT Change

| Component | Reason |
|---|---|
| Domain layer entities, value objects, events | Business logic is deployment-agnostic |
| Application layer UseCases | Same operations, same validation |
| Tenant data model | Same tables, same schema |
| RBAC system | Same within-tenant authorization |
| Existing shared multi-tenant deployment | Completely unaffected |

---

## 13. Open Items Requiring Business Decision

| # | Item | Options | Recommendation | Decision By |
|---|---|---|---|---|
| OI-1 | ionCube license cost (~$349/year) | Approve / Find alternative | Approve — trivial cost vs. IP protection value | Platform Owner |
| OI-2 | Private Docker registry for dedicated images | Docker Hub Private / GitHub Container Registry / Self-hosted | GitHub Container Registry | Platform Owner |
| OI-3 | Dedicated pricing tiers (actual ₹ numbers) | See §10.2 examples | Business decision — needs cost modeling | Platform Owner |
| OI-4 | One-time purchase price point | See §10.2 | Business decision | Platform Owner |
| OI-5 | SSH key management process | Manual / HashiCorp Vault / AWS Secrets Manager | Manual for first 5 clients, Vault after | Platform Owner |
| OI-6 | Client data access policy for Ubotz ops | Documented policy needed | Written policy + L2 approval for SSH access | Platform Owner |
| OI-7 | ionCube license file: bind to IP only or IP + hostname? | IP only / IP + hostname / MAC address | IP only (hostnames change, MACs not available on VPS) | Technical Lead |
| OI-8 | Maximum number of one-time purchase clients (IP exposure risk) | Unlimited / Capped / Premium pricing to limit volume | Cap at premium pricing — high price naturally limits volume | Platform Owner |

---

## 14. Implementation Phasing

| Phase | Scope | Est. Effort | Dependencies |
|---|---|---|---|
| **DD-1: Code Stripping Pipeline** | Build script, verification gates, CI/CD integration | 4-5 days | Audit cross-boundary imports first |
| **DD-2: Control Plane Foundation** | Bounded context, DB tables, instance registry, license issuer | 5-7 days | None |
| **DD-3: Licensing Agent (Core)** | Service provider, license validation, enforcement middleware | 5-7 days | DD-2 |
| **DD-4: ionCube Integration** | Encoder setup, encryption map, Dockerfile changes, license file generator | 3-4 days | DD-1 + DD-3 |
| **DD-5: Heartbeat System** | Phone-home, telemetry, grace period cascade | 4-5 days | DD-2 + DD-3 |
| **DD-6: Platform Admin UI** | Instance management dashboard, health monitoring | 4-5 days | DD-2 |
| **DD-7: Frontend Stripping** | Next.js build config, page exclusion, dedicated build | 2-3 days | DD-1 |
| **DD-8: First Deployment (Open)** | One-time purchase client, end-to-end validation | 3-4 days | DD-1 through DD-3 |
| **DD-9: First Deployment (Encrypted)** | Subscription client, full heartbeat + encryption validation | 3-4 days | DD-4 + DD-5 |

**Total estimated: 33-44 development days**

> Add 30-40% buffer for testing, edge cases, and operational procedures. Realistic calendar time: 2-3 months with one developer.

---

## 15. Risks & Mitigations

| Risk | Severity | Likelihood | Mitigation |
|---|---|---|---|
| Cross-boundary import breaks stripping | High | Medium | Audit BEFORE implementation. PHPStan rule to prevent cross-namespace imports. |
| ionCube performance overhead | Medium | Low | Benchmark: ionCube adds <5% overhead on modern PHP. Test with realistic load. |
| ionCube PHP version lag | Medium | Medium | ionCube typically supports new PHP within 2-3 months. Don't upgrade PHP without verifying ionCube support. |
| Client blocks heartbeat deliberately | High | Medium | Grace cascade + eventual hard lock. Legal contract covers this scenario. |
| SSH key compromise | Critical | Low | Key rotation schedule. Per-client keys. Revocation procedure documented. |
| One-time purchase code leaked publicly | High | Low | Legal enforcement. Watermarked copyright headers. Premium pricing limits volume. |
| Operational overhead of managing N servers | Medium | High | Start manual. Automate after 5+ instances. Ansible/Terraform for provisioning. |

---

## 16. Verdict & Next Steps

### 16.1 Feasibility

**Architecturally feasible** but significantly more complex than v1 (Ubotz-owned server model). The key additions are:

1. **Code stripping pipeline** — must be bulletproof (zero admin code leakage)
2. **ionCube encryption** — industry-proven but adds a build dependency and cost
3. **Two-tier licensing** — permanent vs. subscription, different trust models

### 16.2 Architectural Risk Level

**Medium-High.** The core application doesn't change, but the build pipeline, encryption layer, and deployment process are all new infrastructure. The highest risk is in the stripping pipeline — if platform admin code leaks into a dedicated build, that's an irreversible IP exposure.

### 16.3 Critical Prerequisites Before Implementation

1. **Cross-boundary import audit** — verify zero `SuperAdminDashboard` ↔ `TenantAdminDashboard` imports
2. **ionCube evaluation** — purchase, test encoding/decoding with Laravel 12 + PHP 8.3, benchmark performance
3. **Legal contracts** — software license agreement covering both tiers must be drafted
4. **Resolve Open Items (§13)** — all 8 items need decisions

### 16.4 Next Steps

1. Resolve Open Items (§13)
2. Approve this document
3. Cross-boundary import audit (can start immediately, no dependencies)
4. ionCube evaluation and proof-of-concept (can start immediately)
5. Produce DD-1 Developer Instructions (Code Stripping Pipeline)
6. Phase-gate each sub-phase per established methodology

---

*End of Document*

*Document Status: DRAFT v2.0 — Pending Business Decision on Open Items*
*Supersedes: v1.0 (Ubotz-owned server model)*
