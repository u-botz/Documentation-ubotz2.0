# Data Retention Policy

## Scope
This policy defines baseline retention windows, archive targets, and purge mechanisms for high-volume operational tables.

| Table | Retention Period | Archive Target | Purge Mechanism |
|---|---|---|---|
| `admin_audit_logs` | 2 years | S3 cold storage (JSONL export) | Scheduled Artisan command (monthly) |
| `lead_activities` | 1 year | N/A | Scheduled Artisan command (weekly) |
| `payment_events` | 7 years | S3 cold storage (financial archive) | Scheduled Artisan command (monthly) |
| `lead_notes` | Indefinite (soft-delete only) | N/A | No hard purge by default |
| `jobs` / `failed_jobs` | 30 days | N/A | `queue:prune-failed` and queue cleanup schedule |

## Operational Notes
- Purge jobs must filter by `created_at` and run in bounded batches.
- Purge jobs must include tenant-aware logging for tenant-scoped tables.
- Archive exports must be idempotent (safe re-run for the same date range).
- Financial/event archives must include integrity metadata (hash/checksum).
