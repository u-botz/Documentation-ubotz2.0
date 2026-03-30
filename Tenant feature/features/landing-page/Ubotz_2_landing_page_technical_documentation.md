# UBOTZ 2.0 Landing Page Technical Specification

## Core Architecture
Landing pages operate dynamically as the B2C acquisition interface for tenant products. Governed by `2026_03_13_154702_create_landing_pages_table.php`, they implement a specialized architectural boundary resolving front-end templating configurations against the main `Central DB` template repository.

## Relational Schema Maps (`landing_pages`)
| Column | Technical Significance |
| :--- | :--- |
| **Tenancy Isolation** | `tenant_id` - Universal boundary. Handled inherently by `BelongsToTenant` scope. |
| **Central Cross-Reference** | `template_id` - Not enforced as a strict Foreign Key inside the MySQL engine because it inherently maps across database networks directly into the Platform/Root architecture. Enforced at the application tier. |
| **Payload Engines** | `branding` / `seo_config` - JSON/`jsonb` storage clusters. Accommodates vast dynamic CSS, Google Analytics tokens, pixel integrations, and meta-tag hierarchies without incurring hundreds of rigid SQL columns. |

### Technical Render Workflows
When the `ResolveTenant` middleware successfully instantiates an inbound subdomain URI, it routes the default `/` request directly via `landing_pages` where `status = published`. Rendering the specific Next.js/React framework DOM is dependent directly upon merging `branding` properties with the referenced `template_id` JSX layout.
