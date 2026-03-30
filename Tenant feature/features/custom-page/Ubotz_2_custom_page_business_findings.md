# UBOTZ 2.0 Custom Page Business Findings

## Executive Summary
The Custom Page module serves as a light-weight Content Management System (CMS) for Ubotz 2.0 tenants. It allows institutions to create and publish bespoke static content—such as "About Us", "Privacy Policy", or "Terms of Service"—without requiring external hosting or web development.

## Operational Modalities

### 1. Content Authoring
- **Editor**: Supports rich text/HTML (`body`) for flexible layout design.
- **Slug Management**: Each page is accessible via a unique institutional URL (e.g., `/page/privacy-policy`).
- **State Machine**: Pages can be held in `draft` mode during legal review and transitioned to `published` status for public availability.

### 2. Legal Compliance
Custom pages are the primary location for mandatory institutional documentation (GDPR policies, refund terms), ensuring that every tenant can maintain their own legal boundaries independent of the Ubotz platform terms.

### 3. SEO & Visibility
Each page can have its own `title` and metadata, ensuring that institutional policies and "About" content are indexable by search engines under the tenant’s custom domain or subdomain.

## Lifecycle
Published pages track a `published_at` timestamp. This provides an audit trail for when specific policy changes were made live to the student population.

---

## Linked References
- Related Modules: `Landing-Page`, `Custom-Domain`.
