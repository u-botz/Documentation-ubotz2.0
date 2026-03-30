# UBOTZ 2.0 Enrollment Business Findings

## Executive Summary
Enrollments are the life-blood metric for the Tenant. They define exactly "who" has active clearance to consume educational material. An Enrollment acts as a digital ticket bridging a student account to a specific `Course`.

## The Acquisition Funnel
Business operators deploy three explicit methods to grant access:
1. **Direct Purchase (`source: purchase`)**: Automated pipeline triggered when Stripe/Razorpay issues a successful webhook clearance.
2. **Subscription (`source: subscription`)**: Granted dynamically based on the student's active platform-level membership status.
3. **Internal Grant (`source: free`)**: B2B sales leads or scholarship participants patched in manually by tenant administrators.

## Revocation and Expiry
- Unlike physical goods, digital enrollments require chronological termination. The `expires_at` property executes this logic implicitly without administrative intervention, safeguarding intellectual property.
- When an administrator investigates fraud or refunds a purchase, the enrollment enters the `revoked` state, severing application access while preserving the diagnostic trail that the student *was* previously engaged.
