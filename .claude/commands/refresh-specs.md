---
description: Refresh spec files — dump current Prisma schema and route inventory.
allowed-tools: Bash, Read, Glob, Grep, Write
---

# Refresh Specs

Update reference files that serve as context for Claude projects.

## 1. Prisma Schema

Print the current schema:
```bash
cat prisma/schema.prisma
```

Count models:
```bash
grep "^model " prisma/schema.prisma | wc -l
```

## 2. Route Inventory

Scan all API routes and list them:
```bash
find src/app/api -name "route.ts" | sort | while read f; do
  # Extract HTTP methods
  methods=$(grep -oE "export async function (GET|POST|PUT|DELETE|PATCH)" "$f" | awk '{print $NF}' | tr '\n' ',' | sed 's/,$//')
  # Clean path
  route=$(echo "$f" | sed 's|src/app||' | sed 's|/route.ts||')
  echo "$methods  $route"
done
```

## 3. Page Inventory

```bash
find src/app -name "page.tsx" -not -path "*/api/*" | sort | while read f; do
  route=$(echo "$f" | sed 's|src/app||' | sed 's|/page.tsx||')
  [ -z "$route" ] && route="/"
  echo "$route"
done
```

## 4. Component Count

```bash
echo "Components: $(ls src/components/*.tsx 2>/dev/null | wc -l)"
echo "UI primitives: $(ls src/components/ui/*.tsx 2>/dev/null | wc -l)"
echo "Lib modules: $(ls src/lib/*.ts 2>/dev/null | wc -l)"
```

## 5. Report

Print a summary:
```
## Conductor Spec Refresh

- Models: N
- API routes: N
- Pages: N
- Components: N
- Lib modules: N
- Last migration: [name]
```

Remind the user to update CLAUDE.md if the model count or route count has changed significantly.
