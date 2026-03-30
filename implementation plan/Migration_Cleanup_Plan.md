# Migration Directory Fragmentation Cleanup

This plan addresses the fragmentation of Laravel migration files and the presence of corrupted directories (`central`` and `tenant```) in `database/migrations/`.

## Proposed Changes

### Database Migrations

#### [DELETE] [central``](file:///c:/Users/sayan/lms/Ubotz_2.0/backend/database/migrations/central%60)
#### [DELETE] [tenant``](file:///c:/Users/sayan/lms/Ubotz_2.0/backend/database/migrations/tenant%60)

#### [MOVE] Root migrations to Central
Move the following files from `database/migrations/` to `database/migrations/central/`:
- `0001_01_01_000001_create_cache_table.php`
- `0001_01_01_000002_create_jobs_table.php`
- `2026_03_07_160346_add_razorpay_order_id_to_tenant_subscriptions.php`

#### [MOVE] Root migrations to Tenant
Move the following files from `database/migrations/` to `database/migrations/tenant/`:
- `2026_03_09_145622_add_provider_fields_to_live_sessions_table.php`
- `2026_03_09_145626_create_agora_histories_table.php`
- `2026_03_09_145629_create_session_reminds_table.php`
- `2026_03_09_150029_create_gifts_table.php`
- `2026_03_09_161721_create_tenant_notifications_table.php`
- `2026_03_09_162210_add_enable_waitlist_to_courses_table.php`
- `2026_03_09_162212_create_course_waitlists_table.php`
- `2026_03_09_162746_create_user_groups_table.php`
- `2026_03_09_162750_create_user_group_members_table.php`
- `2026_03_09_162754_create_ticket_user_groups_table.php`
- `2026_03_09_162758_create_special_offer_user_groups_table.php`
- `2026_03_10_000001_create_invoices_table.php`
- `2026_03_10_000002_create_invoice_number_sequences_table.php`
- `2026_03_10_000003_create_tenant_billing_profiles_table.php`
- `2026_03_10_000004_create_refund_requests_table.php`
- `2026_03_13_114705_create_managed_directories_table.php`
- `2026_03_13_114712_create_managed_files_table.php`
- `2026_03_13_144427_add_soft_deletes_to_leads_tables.php`
- `2026_03_14_091300_create_landing_page_media_table.php`
- `2026_03_15_071007_add_advanced_config_fields_to_courses_table.php`
- `2026_03_17_102724_create_student_invoices_table.php`
- `2026_03_17_103728_create_course_comments_table.php`
- `2026_03_17_104807_create_course_translations_table.php`
- `2026_03_17_105341_add_allowed_group_ids_to_tickets_table.php`
- `2026_03_17_105512_create_discount_codes_table.php`
- `2026_03_17_110009_create_reward_tables.php`

## Verification Plan

### Automated Tests
1. **Migration Status**: Run `php artisan migrate:status` for both paths to ensure all migrations are still recognized and their status hasn't changed.
   ```powershell
   docker exec -it ubotz_backend php artisan migrate:status --path=database/migrations/central
   docker exec -it ubotz_backend php artisan migrate:status --path=database/migrations/tenant
   ```
2. **Fresh Migration (Optional/Simulated)**: Ensure that a fresh migration can be run without errors (if the environment allows).
   ```powershell
   # Only if safe or in a branch context
   # docker exec -it ubotz_backend php artisan migrate:fresh --path=database/migrations/central
   ```

### Manual Verification
- Verify that `database/migrations/` root is empty except for the `central` and `tenant` directories.
- Verify that `central`` and `tenant``` directories are deleted.
