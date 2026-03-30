# UBOTZ 2.0 — Platform Security: IP Restrictions — Business Findings

| Field | Value |
|---|---|
| **Document Type** | Principal Engineer — Business Logic Audit |
| **Feature** | Platform Security (IP Restrictions) |
| **Date** | 2026-03-27 |
| **Issued By** | Principal Engineer / Architecture Auditor |
| **Scope** | Global platform access controls and dashboard shielding |
| **Status** | REVIEWED — Reflects current implemented state |

---

## 1. Executive Summary

The **IP Restriction** system in UBOTZ 2.0 serves as a critical defense layer for the platform's central administration. It allows Super Admins to explicitly block access to the platform based on geographical or network-level identifiers. 

The system operates as a **Blacklist (Deny List)** mechanism. When an IP restriction is active, any request originating from a blocked IP to the platform's APIs (except for public health checks) will be immediately terminated with a **403 Forbidden** response.

---

## 2. Core Capabilities

### 2.1 Restriction Types
The system supports three distinct types of network-level blocking:

1. **Full IP (`full_ip`)**: Blocks a singular, specific IPv4 or IPv6 address (e.g., `192.168.1.50`).
2. **IP Range (`ip_range`)**: Blocks a broader network segment. This supports two formats:
   - **Wildcard**: Using asterisks for simple subnet blocking (e.g., `192.168.1.*` blocks all IPs in that subnet).
   - **CIDR**: Standard Classless Inter-Domain Routing notation for precise network control (e.g., `10.0.0.0/24`).
3. **Country Code (`country`)**: A placeholder for future GeoIP-based blocking (e.g., blocking all traffic from a specific ISO country code). *Note: Currently implemented as a domain concept but inactive in the middleware layer.*

### 2.2 Security Governance
Creating or deleting an IP restriction is a high-sensitivity action.
- **Mandatory Justification**: Every restriction requires a clear `reason` at the time of creation.
- **Audit Trail**: Every creation and deletion is recorded in the immutable `admin_audit_logs`, capturing the actor, the blocked value, and the timestamp.
- **Centralized Enforcement**: Restrictions are stored in the central database and applied globally across all platform-level routes.

---

## 3. Business Rules — Complete Reference

| ID | Rule | Enforcement Point |
|---|---|---|
| BR-SEC-01 | All platform-level requests (except `/api/health`) are subject to IP restriction checks. | `CheckIpRestriction` Middleware. |
| BR-SEC-02 | Requests from a restricted IP must be terminated with a 403 Forbidden status code. | Middleware `handle()` method. |
| BR-SEC-03 | A mandatory reason must be provided for every IP restriction created. | `IpRestrictionEntity::create()` — throws `InvalidArgumentException`. |
| BR-SEC-04 | Duplicate restrictions (same type and value) are forbidden. | `CreateIpRestrictionUseCase` — idempotency check. |
| BR-SEC-05 | IP Range validation supports standard `*` wildcards and `/` CIDR notation. | Middleware `checkIpRange()` helper. |

---

## 4. Operational Guardrails

1. **Health Check Bypass**: The system explicitly allows `/api/health` requests regardless of IP to ensure that infrastructure monitoring (load balancers, uptime checkers) is not accidentally blocked.
2. **Caching**: Restriction lists are retrieved via `getAllCached()` to ensure that the security check does not introduce significant latency to every request.
3. **Immediate Enforcement**: Once a restriction is saved to the database (and cache cleared), the block is active for all subsequent requests.

---

*End of Document — UBOTZ 2.0 Platform Security (IP Restrictions) Business Findings — March 27, 2026*
