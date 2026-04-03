# Database REPL

Connect to the local Conductor PostgreSQL database and run queries.

## Connection

```bash
psql postgresql://conductor:localdev@localhost:5432/conductor
```

## Common queries

```sql
-- List all tables
\dt

-- Describe a table
\d "Task"

-- Row counts
SELECT schemaname, relname, n_live_tup FROM pg_stat_user_tables ORDER BY n_live_tup DESC;

-- Tasks by role and status
SELECT r.name, t.status, COUNT(*) FROM "Task" t JOIN "Role" r ON t."roleId" = r.id WHERE t.done = false GROUP BY r.name, t.status ORDER BY r.name;

-- Stale follow-ups
SELECT r.name, f.title, f."waitingOn", f."createdAt" FROM "FollowUp" f JOIN "Role" r ON f."roleId" = r.id WHERE f.status = 'waiting' AND f."createdAt" < NOW() - INTERVAL '3 days' ORDER BY f."createdAt";

-- Integration sync status
SELECT type, enabled, "lastSyncAt", "lastSyncResult" FROM "Integration";

-- AI usage today
SELECT endpoint, model, SUM("inputTokens") as input, SUM("outputTokens") as output, SUM("costCents") as cents FROM "AiUsage" WHERE "createdAt" > CURRENT_DATE GROUP BY endpoint, model;

-- Skills
SELECT name, label, "isBuiltIn", enabled FROM "Skill" ORDER BY "sortOrder";

-- Active indexes
SELECT indexname, tablename, indexdef FROM pg_indexes WHERE schemaname = 'public' ORDER BY tablename;
```
