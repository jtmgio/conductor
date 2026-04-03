---
description: Audit tests for quality — catches fluff tests that pass CI but don't validate behavior. Trigger on "review tests", "audit tests", "check test quality", "are my tests any good".
allowed-tools: Bash, Read, Glob, Grep, Edit, Write, Agent
---

# Audit Tests

Reviews test files for substance — catching tests that inflate coverage without validating behavior.

## The Core Question

For every test: **"If I introduced a bug in the code under test, would this test catch it?"** If no, it's fluff.

## Step 0: Determine Scope

1. No qualifier → audit all test files in the project
2. User provides path → audit that scope
3. From commit flow → only changed test files:
   ```bash
   git diff --cached --name-only --diff-filter=AM | grep -E '\.(spec|test)\.(ts|tsx)$'
   ```

## Step 1: Inventory the Tests

For each test file: file path, describe blocks, it/test descriptions, what's imported, what's mocked.

## Step 2: Flag Anti-Patterns

### Category A: Weak Assertions (High Priority)
- `toBeDefined()` / `toBeTruthy()` on return values
- `toHaveBeenCalled()` without `toHaveBeenCalledWith()`
- `expect(result).not.toBeNull()`
- `toHaveLength()` without checking contents
- Asserting only HTTP status codes without checking response body
- Snapshot tests on large objects

### Category B: Over-Mocking (Medium Priority)
- Every dependency mocked — testing mock wiring, not logic
- Mocks return exact expected output — testing JavaScript passes values through
- Mocking the method you're supposed to be testing
- Mocking Prisma returns pre-shaped data matching expected output — not testing transformation

### Category C: Missing Coverage (Medium Priority)
- No negative-path tests (invalid input, unauthorized, not-found, duplicates)
- No edge case tests (null/undefined, empty strings, boundary values, empty arrays)
- No error handling tests
- No auth tests on protected routes

### Category D: Test Smell (Low Priority)
- Duplicated tests with trivially different inputs
- Test descriptions don't match assertions
- Commented-out tests
- Magic strings without explanation
- No beforeEach cleanup

### Category E: E2E-Specific (Playwright)
- No response body assertions
- No database state verification after mutations
- Flaky selectors (CSS classes instead of roles/text)
- No cleanup of created data

## Step 3: Cross-Reference Against Implementation

For every tested module:
1. All public functions/API handlers tested?
2. Conditional branches covered?
3. Error paths tested?
4. Auth checks on protected routes tested?

## Step 4: Generate Report

```
## Test Audit Report — [Scope]

### Summary
- Files audited: N
- Total tests: N
- 🔴 Fluff tests: N
- 🟡 Suspicious tests: N
- 🟠 Missing coverage: N
- 🟢 Solid tests: N
- **Quality score: X/10**

### 🔴 Fluff Tests
| File | Line | Test Name | Issue | Fix |
|------|------|-----------|-------|-----|

### 🟡 Suspicious Tests
### 🟠 Missing Coverage
### 🟢 Solid Tests

### Recommendations
[Prioritized list]
```

## Step 5: Offer to Fix

"I found N fluff tests and M coverage gaps. Want me to rewrite fluff tests with meaningful assertions and add missing negative-path tests?"

## Project-Specific Rules
- Conductor currently has NO test infrastructure — if auditing, note this as the primary finding
- When tests are added: use Vitest for unit/integration, Playwright for e2e
- Prisma queries should be tested against real DB (Docker), not mocked
- API route tests should verify auth (getServerSession), input validation, and response shape
- shadcn/ui components don't need testing — test behavior, not library internals
