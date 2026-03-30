# UBOTZ 2.0 Category Business Findings

## Executive Summary
For multi-discipline tenants (e.g. teaching K-12 and Competitive test prep concurrently), the Category module acts as the primary navigational interface driving course discovery on the front-end, organizing disparate subjects into logical retail buckets.

## Recursive Organizational Workflows
Unlike rigid single-layer tags, Categories allow a Parent $\rightarrow$ Child hierarchy to infinite depth.
- E.g. **Engineering** (Parent) $\rightarrow$ **Computer Science** (Child) $\rightarrow$ **Data Structures** (Grandchild).
- **Presentation Driven**: Administrators leverage `icon` vectors and manual `order` integer-driven sorting to intentionally highlight specific product verticals above others on public platforms.

## Destructive Cascades
- Business Risk: Due to the nested relationships, deleting a top-level **Parent** Category structurally annihilates every child category nested beneath it. This removes the `category_id` references from previously attached courses, risking layout destruction on the storefront. Operations must re-assign courses prior to root deletions.
