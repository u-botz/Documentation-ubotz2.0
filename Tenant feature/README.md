# Tenant Feature Documentation

This directory is organized to mirror the documentation quality and discoverability of `documentation/Platform features`.

## Structure

- `features/` : Per-feature folders with paired draft documents:
  - `Ubotz_2_<feature>_business_findings.md`
  - `Ubotz_2_<feature>_technical_documentation.md`
- `status reports/` : Current implementation/status snapshots per tenant module.
- `feature documents/` : Functional docs, specs, and business requirements.
- `developer instructions/` : Phase-wise implementation instructions.
- `references/` : Architecture and supporting reference docs.
- Domain folders (`crm/`, `communication hub/`, `fee management/`, `leave management/`, `student analytics/`) remain for feature-specific artifacts.

## Naming Conventions

- Use consistent title case with underscores only where already established.
- Avoid trailing spaces and duplicate suffixes in file names.
- Prefer one canonical copy per document (remove `(1)` duplicates when verified).

## Recommended Completion Pattern (Same as Platform Features)

For each tenant feature, maintain:
1. `..._business_findings.md`
2. `..._technical_documentation.md`

Status reports should remain in `status reports/` and be linked from the feature documents.
