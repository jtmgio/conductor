---
description: Run quality gates, self-audit, then commit.
allowed-tools: Bash, Read, Glob, Grep, Edit, Write
---

**Run this entire command without stopping. Execute gates, self-audit, and commit in sequence.**

## Phase 0: Quality Gates

Execute in order. Fix issues found, then continue. Skip rules below.

1. `/verify-feature` — manual browser testing
2. `/security-review` — OWASP Top 10 audit
3. `/db-audit code schema` — schema + code query audit (skip Layer 1 if DB not running)
4. `/audit-tests` — test quality audit (if test files changed)

**Skip rules (non-feat commits only):**
- `/verify-feature`: Skip if zero UI changes
- `/audit-tests`: Skip if no test files changed
- `/db-audit`: Skip if no schema.prisma or Prisma query changes
- `/security-review`: NEVER skip

---

## Phase 1: Self-Audit

Review your own changes across these categories before committing:

### 1. UX Rules Compliance
- No badge counts or notification dots added?
- Completed tasks hidden (not shown in any view)?
- Follow-ups separate from tasks?
- No end-of-day summary or guilt messaging?

### 2. AI Context Assembly
- New AI calls use `assembleContext()` from `src/lib/ai-context.ts`?
- Token budget respected (~10K max)?
- New skills use proper `{{variable}}` resolution?

### 3. Integration Dedup
- New sourceType/sourceId patterns follow existing convention?
- Sync endpoints idempotent (safe to run multiple times)?

### 4. Theme Support
- New UI uses CSS variables (`var(--*)`) not raw hex?
- Dark theme renders correctly?

### 5. Mobile Responsiveness
- New views work on mobile (< 1024px)?
- Touch targets ≥ 44px?

### 6. Component Conventions
- shadcn/ui for form elements?
- Framer Motion for animations?
- Lucide for icons?
- Prisma singleton import from `src/lib/prisma.ts`?

---

## Phase 2: Build Check

```bash
npx tsc --noEmit
```

If type errors, fix them. Then verify the build:
```bash
npx next build 2>&1 | tail -5
```

(Ignore the pre-existing ROLE_KEYWORDS lint error in calendar/process/route.ts)

---

## Phase 3: Commit

```bash
git status
git diff --stat
git log --oneline -3
```

Stage relevant files (NOT .env files). Generate a commit message that:
- Starts with a conventional commit type (feat/fix/chore/refactor/docs)
- Summarizes the "why" in 1-2 sentences
- Lists key changes if multi-file

```bash
git add [specific files]
git commit -m "$(cat <<'EOF'
type: summary

Details if needed.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```
