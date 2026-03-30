# UBOTZ 2.0 Custom Domain Business Findings

## Executive Summary
The Custom Domain module provides premium white-labeling capabilities for Ubotz 2.0 tenants. It allows institutions to host their student dashboard and landing pages on their own brand-specific URL (e.g., `learn.oxford.edu`) instead of a generic Ubotz subdomain (`oxford.ubotz.com`).

## Operational Modalities

### 1. Verification Lifecycle
To ensure institutional ownership and platform security, domains undergo a multi-step verification process:
- **`pending_verification`**: Initial entry where the tenant is provided with DNS records (CNAME, TXT, A) to add to their provider.
- **Verification Deadline**: Standard 72-hour window (`verification_deadline_at`) to complete DNS configuration.
- **`activated_at`**: Point at which the platform starts routing traffic to the custom URL.

### 2. DNS Integrity
The system periodically executes a `last_dns_check_at`. If a tenant removes their DNS records or their domain expires, the system records a `dns_failure_detected_at` and may automatically deactivate the custom domain to prevent "Subdomain Takeover" vulnerabilities.

### 3. Deactivation & Removal
Administrators can suspend custom domains for billing or compliance reasons (`deactivation_reason`), reverting the tenant to their primary Ubotz slug instantly.

## Commercial Value
Custom Domains are typically the hallmark of Enterprise-tier subscriptions. They provide the institutional trust required for high-ticket professional and academic certifications.

---

## Linked References
- Related Modules: `Tenant-Provisioning`, `Subscription`.
