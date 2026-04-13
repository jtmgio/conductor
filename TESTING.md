# Conductor — E2E Testing Playbook

Reusable testing script for verifying all features after a fresh deploy or major changes. Uses generic placeholder data — substitute your own companies and staff.

## Prerequisites

- App running at `http://localhost:3100` (Docker: `docker compose up -d`)
- Fresh database (or known state)
- Anthropic API key configured in `.env`

## Quick Reset

```bash
# Full DB reset
docker compose exec postgres psql -U conductor conductor -c '
DELETE FROM "TaskTag"; DELETE FROM "Task"; DELETE FROM "FollowUp"; DELETE FROM "Note";
DELETE FROM "Transcript"; DELETE FROM "FileUpload"; DELETE FROM "AiUsage";
DELETE FROM "Conversation"; DELETE FROM "ScheduleOverride"; DELETE FROM "ScheduleBlock";
DELETE FROM "Staff"; DELETE FROM "Integration"; DELETE FROM "Skill" WHERE "isBuiltIn" = false;
DELETE FROM "Role"; UPDATE "UserProfile" SET "passwordHash" = NULL WHERE id = '\''default'\'';'

# Re-seed built-in skills + default tags
DATABASE_URL="postgresql://conductor:localdev@localhost:5433/conductor" npx prisma db seed

# Restart app
docker compose restart conductor
```

## Phase 1: Setup Wizard

### 1.1 Welcome Screen
- [ ] Navigate to `http://localhost:3100` — should redirect to `/setup`
- [ ] "Welcome to Conductor" heading visible
- [ ] "Get Started" button visible
- [ ] "Import config file" option visible
- [ ] Click "Get Started" — transitions to password step

### 1.2 Set Password
- [ ] Type password (min 4 chars)
- [ ] Type confirm password
- [ ] Test validation: try <4 chars — error
- [ ] Test validation: mismatched passwords — error
- [ ] Click Continue — advances to companies step

### 1.3 Add Companies (3+)

Add at least 3 companies to exercise multi-role features. Example test data:

| # | Name | Title | Platform | Color |
|---|------|-------|----------|-------|
| 1 | Acme Corp | Senior Engineer | Slack | Blue (#2563eb) |
| 2 | Globex Inc | Tech Lead | Teams | Teal (#0d9488) |
| 3 | Initech | Staff Engineer | Slack | Purple (#7c3aed) |

For each company:
- [ ] Type company name
- [ ] Type title
- [ ] Select platform (Slack or Teams)
- [ ] Pick color from presets
- [ ] Click "Add" or press Enter
- [ ] Verify it appears in the list with correct color dot

After all companies:
- [ ] Click "Continue" — saves all roles, advances to schedule

### 1.4 Configure Schedule

Set up time blocks mapping roles to hours. Example:

| Block | Label | Start | End | Role |
|-------|-------|-------|-----|------|
| 1 | Morning Focus | 8:00 AM | 11:00 AM | Acme Corp |
| 2 | Midday | 11:00 AM | 2:00 PM | Globex Inc |
| 3 | Afternoon | 2:00 PM | 5:00 PM | Initech |

For each block:
- [ ] Set label, start time, end time
- [ ] Select role from color-coded bubbles
- [ ] Verify role name appears in selected bubble

After all blocks:
- [ ] Click "Continue"
- **Note**: Wizard assigns same role to all weekdays. Use Settings > System > Schedule to set per-day assignments post-setup.

### 1.5 Voice Profile
- [ ] Enter communication style (e.g., `Direct and concise. No filler phrases. Gets to the point immediately.`)
- [ ] Enter global context (e.g., `Senior engineer managing multiple concurrent roles. Prefers async communication.`)
- [ ] Click Continue — advances to "Done"

### 1.6 Complete Setup
- [ ] "All set!" screen appears
- [ ] Click "Go to Conductor" — redirects to login
- [ ] Login with password — lands on Focus page

---

## Phase 2: Settings — Populate Role Data

Go to Settings > Roles tab. For each role, expand the accordion and fill in:

### Role Details (per role)
- **Tone**: e.g., `Technical, collaborative. Code-focused.`
- **Responsibilities**: e.g., `Frontend architecture, code reviews, component library`
- **Quarterly Goals**: e.g., `Ship v2 design system, reduce bundle size 25%`
- **Context**: e.g., `React/TypeScript stack. Slack-first. Weekly standups.`

### Staff Members (2–3 per role)

Add via "Add staff" button in each role accordion. Example:

**Acme Corp** (3 staff):
1. Alice — Engineering Manager — `Runs sprint planning. Weekly 1:1.`
2. Bob — Senior Engineer — `Pairs on complex features.`
3. Carol — QA Lead — `Detailed bug reports.`

**Globex Inc** (2 staff):
1. Dan — Product Manager — `Owns roadmap.`
2. Eve — Backend Lead — `Manages API layer.`

**Initech** (2 staff):
1. Frank — Tech Lead — `Reviews all PRs.`
2. Grace — DevOps — `Manages CI/CD.`

### Verification Checks
- [ ] Settings > Roles: all roles visible with correct colors
- [ ] Each role accordion expands to show tone, responsibilities, goals, context, staff
- [ ] Settings > Profile: communication style and global context saved
- [ ] Settings > System > Schedule: grid shows all blocks with role assignments

---

## Phase 3: Add Tasks & Follow-ups

### Tasks (4+ per role)

Add via Inbox > "+ Add task manually" or Board view. Mix statuses:

**Per role, create at least:**
- 1 task — In Progress, marked Today
- 1 task — In Review
- 2 tasks — Backlog

Example tasks for Acme Corp:
1. "Migrate DatePicker to new design system" — In Progress, Today
2. "Review PR for TypeScript strict mode" — In Review
3. "Investigate bundle size regression" — Backlog
4. "Write architecture decision record" — Backlog

Repeat similar patterns for each role.

### Follow-ups (2 per role)

Add via Inbox > "+ Add follow-up manually" or Tracker. Each should reference a staff member:

Example for Acme Corp:
- "Waiting on Alice for sprint scope sign-off" (Alice)
- "Bob to finish rate limiting PR" (Bob)

Repeat for each role.

### Verification Checks
- [ ] Focus page: shows today's tasks for current block's role
- [ ] Board page: tasks in correct columns (Backlog, In Progress, In Review)
- [ ] Board: switch role tabs — tasks filter correctly
- [ ] Tracker: all follow-ups visible, grouped by role
- [ ] Tracker: role filter buttons work

---

## Phase 4: AI Chat Testing

### For each role, go to AI page, select the role tab, and test:

1. **Context awareness**
   - [ ] Send: `What are my priorities right now?`
   - Verify: mentions today's tasks, references role context

2. **Drafting with tone**
   - [ ] Send: `Draft a message to [staff name] about [a task]`
   - Verify: uses the role's configured tone, references staff correctly

3. **Slash commands**
   - [ ] Type `/` — skill menu appears with keyboard navigation
   - [ ] Select `/standup-prep` — generates formatted standup notes
   - [ ] Try `/blocked` — lists blocked items or says none

4. **Multi-turn memory**
   - [ ] Send a follow-up question referencing previous answer
   - Verify: maintains conversation context

### AI Verification Checks
- [ ] Each role tab shows conversation history after chatting
- [ ] Model selector works (try switching between Sonnet, Haiku, Opus)
- [ ] Quick action buttons send predefined prompts
- [ ] Slash command menu appears when typing `/`
- [ ] Arrow keys navigate the slash command menu
- [ ] Tab/Enter selects a skill
- [ ] Clear conversation works (history gone after refresh)

### Database Verification
```bash
docker compose exec postgres psql -U conductor conductor -c '
SELECT r.name,
  json_array_length(c.messages::json) as msg_count
FROM "Conversation" c
JOIN "Role" r ON r.id = c."roleId"
ORDER BY r.priority;'
```
Expected: each role has messages (user + assistant pairs).

---

## Phase 5: View-by-View Testing

### 5.1 Focus View
- [ ] Shows current time block's role (or "Off the clock" outside hours)
- [ ] Today's tasks listed for current role
- [ ] Complete a task — slides out with animation, disappears
- [ ] Quick add (+ button or `n` key) — creates task
- [ ] Expand a task — edit title, notes, status, tags, due date
- [ ] Add checklist items to a task
- [ ] Block navigation arrows cycle through all blocks
- [ ] Onboarding checklist shows/hides correctly

### 5.2 Inbox
- [ ] Role selector dropdown shows all roles
- [ ] "+ Add task manually" — creates task for selected role
- [ ] "+ Add follow-up manually" — creates follow-up for selected role
- [ ] Paste text in textarea — "Process" button activates
- [ ] (With API key) Process extracts tasks/follow-ups from text
- [ ] File drop zone accepts files

### 5.3 Tracker
- [ ] All follow-ups visible
- [ ] "All" filter shows everything
- [ ] "Stale" filter shows items 3+ days old
- [ ] Role filter buttons filter correctly
- [ ] "MARK RECEIVED" resolves a follow-up (disappears)
- [ ] "Follow up" button redirects to AI page

### 5.4 Board
- [ ] Kanban columns: Backlog, In Progress, In Review, Blocked, Done
- [ ] Role tabs switch between roles
- [ ] Task counts in column headers are correct
- [ ] Click status badge on a task — cycles to next status
- [ ] Expand a task card — full detail editor
- [ ] "No tasks" shown for empty columns

### 5.5 AI Page
- [ ] All role tabs visible with correct colors
- [ ] "No API key" banner hidden (key is configured)
- [ ] Model selector dropdown works (Sonnet, Haiku, Opus)
- [ ] Chat input accepts text
- [ ] Quick action buttons send predefined prompts
- [ ] `/` triggers slash command popup menu
- [ ] Arrow keys navigate the slash command menu
- [ ] Tab/Enter selects a skill

### 5.6 Settings

**Roles tab:**
- [ ] All roles listed with correct colors and titles
- [ ] Expand accordion — shows tone, context, responsibilities, goals
- [ ] Staff listed under each role
- [ ] Can edit and save any field
- [ ] "Add company" button works

**Profile tab:**
- [ ] Communication style shown
- [ ] Sample messages shown
- [ ] Global context shown
- [ ] Save changes persists

**Integrations tab:**
- [ ] Granola section visible
- [ ] Linear section visible
- [ ] Folder mapping UI works

**System tab:**
- General: About section, Theme switcher (Light/Warm/Dark), Text size (S/M/L/XL)
- Schedule: editable grid with role dropdowns per day, edit block names/times, add/delete blocks
- API Keys: key input, save, show/hide toggle
- Skills: all 8 built-in listed, expandable prompts, create custom skill
- Costs: page loads (may show no data)
- Data: Export full backup, Import backup, Export config only

### 5.7 Other Features
- [ ] Docs: Knowledge Base loads, categories visible, search works
- [ ] Documents: upload and view documents
- [ ] Global search (Cmd+K): search box opens, finds tasks by name
- [ ] Theme switching: all 3 themes render correctly
- [ ] Mobile responsive: resize to <1024px — bottom nav appears
- [ ] Keyboard shortcuts work (listed in Settings > System)

---

## Phase 6: Database Verification

Run after all testing to verify data integrity:

```bash
docker compose exec postgres psql -U conductor conductor -c "
SELECT 'Roles' as type, COUNT(*) as count FROM \"Role\"
UNION ALL SELECT 'Tasks', COUNT(*) FROM \"Task\"
UNION ALL SELECT 'Follow-ups', COUNT(*) FROM \"FollowUp\"
UNION ALL SELECT 'Staff', COUNT(*) FROM \"Staff\"
UNION ALL SELECT 'Notes', COUNT(*) FROM \"Note\"
UNION ALL SELECT 'Schedule Blocks', COUNT(*) FROM \"ScheduleBlock\"
UNION ALL SELECT 'Skills', COUNT(*) FROM \"Skill\"
UNION ALL SELECT 'Conversations', COUNT(*) FROM \"Conversation\"
ORDER BY type;"
```

Expected: counts match what you created during testing.

---

## Known Issues / Gotchas

1. **Setup wizard animation**: Step content can animate below the viewport — scroll down if the page appears blank after clicking "Get Started" or "Continue"
2. **Weekend/off-hours**: Focus page shows "Off the clock" outside schedule blocks — test during configured hours for full experience
3. **Skills need seeding**: After a DB reset, run `npx prisma db seed` to restore built-in slash commands
4. **Docker DB port**: Docker Postgres is mapped to host port 5433, not 5432
