# E2E Test Feature — Playwright

Write Playwright e2e tests that exercise every user-facing behavior end to end.

## Step 0: Understand What Was Built

1. **Check git diff**:
   ```bash
   git diff --name-only HEAD~3..HEAD
   ```
2. **Read changed files** — focus on: pages/routes, components with interactions, API endpoints, validation
3. **List every user-facing flow** — each becomes at least one test.

## Step 1: Plan the Test Suite

For each flow, plan across categories:

### Happy Path
Primary success scenario. Every flow gets at least one.

### Validation & Error States
- Required fields empty, invalid formats
- Server errors (mock 500), network failures (`page.route()`)

### Edge Cases
- Rapid double-submit, empty states, browser back/forward after submit
- Long strings, special characters in inputs

### Responsive
- Mobile (375x667), Desktop (1440x900)

## Step 2: Write the Tests

### File Location
```
e2e/<feature-name>.spec.ts
```

### Authentication

Conductor uses single-password auth. To authenticate in tests:

```typescript
test.beforeEach(async ({ page }) => {
  // Login via the credentials endpoint
  await page.goto('http://localhost:3000/login');
  await page.getByPlaceholder('Enter password').fill('conductor');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('/');
});
```

Or bypass by setting the session cookie directly if faster.

### Selectors — prefer in order:
1. `getByRole()` — buttons, links, headings, textboxes
2. `getByText()` — visible text
3. `getByLabel()` — form inputs by label
4. `getByPlaceholder()` — form inputs by placeholder
5. `getByTestId()` — `data-testid` (last resort)

Never use fragile CSS selectors.

### Assertions — use Playwright's web-first:
```typescript
await expect(page.getByRole('heading')).toHaveText('Conductor');
await expect(page.getByRole('alert')).toBeVisible();
await expect(page).toHaveURL(/\/ai/);
```

### Conductor-Specific Test Patterns

**Slash commands:**
```typescript
test('slash menu appears on /', async ({ page }) => {
  await page.goto('/ai');
  await page.getByPlaceholder('How can I help').click();
  await page.keyboard.type('/');
  await expect(page.getByText('/standup-prep')).toBeVisible();
});
```

**Task completion:**
```typescript
test('completing a task animates it away', async ({ page }) => {
  // Find checkbox, click it, verify task slides out
});
```

**Theme switching:**
```typescript
test('theme switcher changes colors', async ({ page }) => {
  await page.getByRole('button', { name: 'Light' }).click();
  // Verify body has light theme class
});
```

## Step 3: Run Tests

```bash
# Verify app is running
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000

# Run headed (first time)
npx playwright test e2e/<feature>.spec.ts --headed

# Run headless
npx playwright test e2e/<feature>.spec.ts
```

## Step 4: Fix and Iterate

1. Read error messages carefully
2. Use `--trace on` for debugging
3. Fix test OR code, not both at once
4. Re-run until green

## Playwright Config

If no `playwright.config.ts` exists:

```typescript
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
```

## Final Checklist
- [ ] Every flow has a happy-path test
- [ ] Validation errors tested
- [ ] Error states tested
- [ ] Tests run green headless
- [ ] No `waitForTimeout()` calls
- [ ] No fragile CSS selectors
- [ ] Tests are independent
