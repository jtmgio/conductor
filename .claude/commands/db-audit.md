---
description: Three-layer database health, Prisma schema, and code query audit.
allowed-tools: Bash, Read, Glob, Grep
---

# Database Audit

Three-layer audit: live DB health, Prisma schema analysis, and code query patterns.

Optional arguments: $ARGUMENTS
- No args → all three layers
- `schema` → Layer 2 only
- `code` → Layer 3 only
- `db` → Layer 1 only
- `code schema` → Layers 2 + 3

## Severity Scale

| Severity | Meaning |
|----------|---------|
| 🔴 CRITICAL | Data loss, broken constraints, security |
| 🟠 HIGH | Performance degradation under load |
| 🟡 MEDIUM | Suboptimal but functional |
| 🔵 LOW | Hygiene / best practice |

---

## Layer 1: Live Database Health

Check DB connection first:
```bash
psql postgresql://conductor:localdev@localhost:5432/conductor -c "SELECT 1;" 2>/dev/null && echo "DB connected" || echo "DB not available"
```

### 1.1 Table sizes & bloat
```sql
SELECT schemaname || '.' || tablename AS table_name,
  pg_size_pretty(pg_total_relation_size(schemaname || '.' || tablename)) AS total_size,
  n_live_tup AS row_estimate
FROM pg_stat_user_tables ORDER BY pg_total_relation_size(schemaname || '.' || tablename) DESC;
```

### 1.2 Dead tuples (vacuum needed?)
```sql
SELECT relname, n_live_tup, n_dead_tup,
  CASE WHEN n_live_tup > 0 THEN round(100.0 * n_dead_tup / n_live_tup, 2) ELSE 0 END AS dead_pct
FROM pg_stat_user_tables WHERE n_dead_tup > 50 ORDER BY n_dead_tup DESC;
```

### 1.3 Unused indexes
```sql
SELECT relname AS table, indexrelname AS index, pg_size_pretty(pg_relation_size(indexrelid)) AS size, idx_scan
FROM pg_stat_user_indexes WHERE idx_scan = 0 AND indexrelname NOT LIKE '%_pkey'
ORDER BY pg_relation_size(indexrelid) DESC;
```

### 1.4 Unindexed foreign keys
```sql
SELECT tc.table_name, kcu.column_name AS fk_column
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'
  AND NOT EXISTS (
    SELECT 1 FROM pg_index i JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
    WHERE i.indrelid = (tc.table_schema || '.' || tc.table_name)::regclass AND a.attname = kcu.column_name
  );
```

### 1.5 Sequential scan ratio
```sql
SELECT relname, seq_scan, idx_scan,
  CASE WHEN (seq_scan + idx_scan) > 0 THEN round(100.0 * seq_scan / (seq_scan + idx_scan), 2) ELSE 0 END AS seq_pct,
  n_live_tup
FROM pg_stat_user_tables WHERE n_live_tup > 100 ORDER BY seq_pct DESC;
```

### 1.6 Cache hit ratio
```sql
SELECT sum(heap_blks_hit) / NULLIF(sum(heap_blks_hit + heap_blks_read), 0) AS cache_hit_ratio
FROM pg_statio_user_tables;
```
- < 0.99 on production → 🟠 needs more shared_buffers

---

## Layer 2: Prisma Schema Analysis

Read `prisma/schema.prisma` and check:

1. **ID consistency** — all models use `@id @default(cuid())`? Any UUIDs mixed in?
2. **DateTime fields** — all use `DateTime` type? Any `String` dates?
3. **Index coverage** — every foreign key has an `@@index`? Key query patterns covered?
4. **Cascade rules** — `onDelete` set on relations where parent deletion should cascade?
5. **Soft delete** — Task uses `done: true` not actual deletion. FollowUp uses `status: "resolved"`. Verify no hard deletes in code for these.
6. **JSON columns** — Conversation.messages and Task.checklist are JSON. Check for unbounded growth.
7. **sourceType/sourceId pattern** — used for dedup on Task and FollowUp. Verify uniqueness constraints or findFirst checks in sync code.

---

## Layer 3: Code Query Patterns

Scan `src/app/api/**/*.ts` and `src/lib/*.ts` for:

### 3.1 N+1 Queries
```bash
# Look for findMany followed by individual finds in loops
grep -rn "for.*of.*await.*prisma" src/app/api/
```
Any loop containing a Prisma call is suspect → 🟠 use `include` or batch query instead.

### 3.2 Unbounded Queries
```bash
grep -rn "findMany" src/app/api/ | grep -v "take\|first\|limit"
```
Any `findMany` without `take` on a table that could grow → 🟡

### 3.3 Missing Where Clauses
```bash
grep -rn "findMany({$\|findMany()" src/app/api/
```
Bare `findMany()` with no `where` on large tables → 🟡

### 3.4 Prisma Client Singleton
```bash
grep -rn "new PrismaClient" src/ | grep -v "prisma.ts"
```
Any result → 🔴 must use singleton from `src/lib/prisma.ts`

### 3.5 Raw SQL Safety
```bash
grep -rn "queryRaw\|executeRaw" src/
```
Check for string interpolation in raw queries → 🔴 use parameterized queries

### 3.6 Sensitive Data Exposure
```bash
grep -rn "password\|secret\|apiKey\|token" src/app/api/ | grep -v "test\|mock\|spec"
```
Check that passwords are hashed, API keys masked in responses, tokens not logged.

---

## Report

```
## Database Audit Report

### Summary
- Layer 1 (DB Health): [N findings]
- Layer 2 (Schema): [N findings]
- Layer 3 (Code): [N findings]

### Findings (by severity)

#### 🔴 CRITICAL
#### 🟠 HIGH
#### 🟡 MEDIUM
#### 🔵 LOW

### Recommendations
[Prioritized action items]
```
