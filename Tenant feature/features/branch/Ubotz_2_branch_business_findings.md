# UBOTZ 2.0 Branch Business Findings

## Executive Summary
The Branch feature supports localized, real-world deployment of the Ubotz LMS. For B2B tenants with multi-city or multi-campus offline institutions, Branches ensure that staff and physical assets can be tagged to a specific local administrative silo.

## Operational Modalities
- **Logistical Tagging**: Supports basic CRM tracking components like `code`, `email`, `phone`, and `address`. This surfaces immediately when registering students to specific intake centers.
- **Deactivation Protocol**: Branches are not permanently destroyed down the dependency chain if they close. The `is_active` toggle acts as a business-logic halt, ensuring historical attendance or enrollment records tied to that physical branch are not rendered obsolete.
- **Conflict Prevention**: Through strict internal code validation (`DEL-01`), administrators cannot unintentionally spawn duplicated local centers.
