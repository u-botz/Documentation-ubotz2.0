# Debug Report: Branding Persistence Failure

## Issue Summary
Tenant brand colors (and notification preferences) are successfully selected and previewed in the frontend Settings page, but fail to persist after clicking "Save". 

## Suspected Root Cause
**Docker Volume Synchronization Failure**

Despite `config/tenant.php` being updated on the host machine to whitelist the `theme_color` and `notification_preferences` keys, the running Docker container (`ubotz_backend`) is still operating on a stale version of the configuration.

### Evidence
1. **Host Verification**: `backend/config/tenant.php` correctly contains:
   ```php
   'allowed_settings_keys' => [
       'timezone', 'locale', 'date_format', 'currency', 'theme_color', 'notification_preferences', 'features',
   ],
   ```
2. **Container Verification (Tinker)**: Running `php artisan tinker` inside the `ubotz_backend` container and executing `config('tenant.allowed_settings_keys')` returns the **old** list without the new keys.
3. **Container Verification (File Check)**: Checking the file directly inside the container via `cat` or `head` confirms that the file either doesn't match the host or the Laravel application is still using a cached version.
4. **Resulting Behavior**: The `UpdateTenantSettingsUseCase` uses `array_intersect_key` against this stale whitelist. Because `theme_color` is not in the "approved" list inside the container, it is stripped from the payload before the database transaction, resulting in a "silent" failure to save.

## Impact
- Custom branding cannot be saved.
- Notification preferences cannot be saved.
- Any new configuration keys added to `config/tenant.php` will be ignored until synchronization is restored.

## Next Steps (NOT SOLVED YET)
- [ ] Investigate why Docker volumes are not syncing (Windows Host issue).
- [ ] Attempt a full container restart (`docker-compose down && docker-compose up`).
- [ ] Manually verify file contents inside the container after restart.
- [ ] Ensure `php artisan config:clear` is effective after the file sync is confirmed.
