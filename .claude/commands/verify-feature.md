# Verify Feature in Browser

You just built or modified a feature. Open Chrome, navigate to the running app, and manually test everything you implemented.

## Step 0: Understand What You Built

1. **Check the git diff**:
   ```bash
   git diff --name-only HEAD~5..HEAD
   git diff --stat HEAD~5..HEAD
   ```
2. **Read changed files** and identify:
   - New or modified pages/routes
   - New or modified forms and interactive components
   - New or modified API endpoints the UI calls
   - Validation rules
   - Loading states, empty states, error handling
3. **Write a numbered checklist** of every user-facing behavior to verify. Each item = concrete action + expected result.

Do NOT open the browser until the checklist is complete.

## Step 1: Verify the App Is Running

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000
```

If not 200, start it:
```bash
npm run dev
sleep 5
```

## Authentication

Single-user app. Password auth at /login. Password: `conductor` (dev).

## Step 2: Open Chrome and Test

Navigate to `http://localhost:3000` and work through your checklist.

### What to Test for Each Flow

**Forms:**
- Submit with all fields valid (happy path)
- Submit with required fields empty — verify error messages
- After success — verify toast/success, data persists on refresh

**Navigation & Routing:**
- Click every new link/button — verify correct destination
- Check URL matches expected route
- Browser back/forward works correctly

**Task Operations:**
- Check the box → task slides away with Framer Motion animation
- Status badge click cycles through statuses
- Expanded view shows notes, checklist, due date, tags

**AI Chat:**
- Type `/` → slash command menu appears with all 8 skills
- Type to filter → menu filters correctly
- Select a skill → resolves variables and sends message
- AI response renders markdown and code blocks correctly

**Settings:**
- All 4 tabs render (Roles, Profile, Integrations, System)
- Skill toggles work
- Integration connect/disconnect works

**Responsive:**
- Resize to mobile (~375px) — MobileDrawer works, bottom nav appears
- Desktop — sidebar with 6 items, Settings at bottom

**Console Errors:**
- Keep DevTools Console open throughout
- Flag any errors or warnings

## Step 3: Report Results

```
## Verification Results — [Feature Name]

### Environment
- URL: http://localhost:3000
- Branch: [current branch]
- Last commit: [short hash + message]

### Results
✅ 1. [description of test — PASS]
❌ 2. [description of test — FAIL]
   → [explanation of what went wrong]

### Issues Found
1. **[BUG]** [description] — Severity: High/Medium/Low

### Console Errors
- None / [list any]
```

After reporting, ask: "I found [N] issues. Want me to fix them and re-verify?"
