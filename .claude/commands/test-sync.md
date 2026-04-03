# Test Sync

Manually trigger integration syncs and report results.

## Steps

1. Check which integrations are configured:
   ```bash
   curl -s http://localhost:3000/api/integrations | python3 -c "import json,sys; [print(f'{i[\"type\"]}: enabled={i[\"enabled\"]}') for i in json.load(sys.stdin)]"
   ```

2. If Linear is configured, trigger sync:
   ```bash
   curl -s -X POST http://localhost:3000/api/integrations/linear/sync \
     -H "x-sync-secret: ${LINEAR_SYNC_SECRET:-conductor-linear-sync}" \
     -H "Content-Type: application/json"
   ```

3. If Granola is configured, trigger sync:
   ```bash
   curl -s -X POST http://localhost:3000/api/integrations/granola/sync \
     -H "Content-Type: application/json"
   ```

4. Report results: how many items found, created, updated, skipped, errors
5. Verify new tasks appeared in the database if any were created
