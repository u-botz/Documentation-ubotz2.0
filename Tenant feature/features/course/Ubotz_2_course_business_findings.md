# UBOTZ 2.0 Course Business Findings

## Executive Summary
The `Course` feature sits at the apex of the tenant's educational taxonomy. It is the primary sellable entity that dictates pricing, access windows, pedagogical curriculum, and student assignment boundaries. Without an active Course, assessments and billing fail to function conceptually.

## Operational Modalities

### The Monetization Engine
- **`price_amount`**: Dictates base tuition for B2C conversion funnels. Can act as a free-tier boundary.
- **`access_days`**: Restricts the maximum tenure of an enrollment. This is highly utilized for "Subscription-like" rolling courses preventing lifetime access unless desired.
- **`is_private` toggle**: Hides the listing from the `Landing Page` directories while still allowing direct-link purchases by invited organizations or B2B sales leads.

### Course Lifecycles
1. Courses initialize in a `draft` state (imperceptible to front-end students).
2. During the `draft` state, administrators compile **Tags**, map the Course to an **Exam Hierarchy**, and assign an underlying `teacher_id`.
3. Transitioning to `published` immediately signals the `Payment` and `Landing-Page` engines to syndicate the listing publicly.

### Capacity Overrides
Administrators deploy a hard `capacity` limit. Once an active participant list hits this ceiling, automatic enrollment gateways are intentionally blocked, shifting prospects into a B2B "waitlist" mode or forcing the administrator to boot an adjacent `Batch`.
