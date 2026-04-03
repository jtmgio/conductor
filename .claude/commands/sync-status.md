# Sync Status

Check the current sync status for all integrations (Linear, Granola).

## Steps

1. Query the Integration table for all configured integrations
2. For each, show:
   - Type and target role
   - Enabled/disabled
   - Last sync time (and how long ago)
   - Last sync result (success/error message)
3. Check if the LaunchAgent plists are loaded:
   ```bash
   launchctl list | grep conductor
   ```
4. Check recent sync logs:
   ```bash
   tail -5 scripts/linear-sync.log 2>/dev/null
   tail -5 scripts/granola-sync.log 2>/dev/null
   ```
5. Report any issues (e.g., sync not running, errors, stale syncs)
