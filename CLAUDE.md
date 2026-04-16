# CLAUDE.md — Conductor

## What is this

Conductor is a personal productivity operating system for an engineer managing multiple concurrent W2 engineering roles. It replaces Things 3 as a task manager and adds AI-powered follow-up tracking, transcript processing, communication drafting, slash commands, artifact rendering, and persistent per-role conversations. Integrates with Linear (task sync) and Granola (meeting transcript sync).

**This is a single-user app.** One person uses it. No multi-tenancy, no registration, no teams. Password-protected with a single password.

## Tech stack

- Next.js 14 (App Router) + React + TypeScript
- Tailwind CSS + shadcn/ui + Lucide React + Framer Motion
- PostgreSQL 16 (local on EC2 in prod, Docker in dev)
- Prisma ORM (16 models)
- NextAuth (credentials provider, single-user)
- Anthropic Claude API (Sonnet 4.6 default, Haiku 4.5, Opus 4.6 selectable)
- File processing: pdf-parse, mammoth, sharp

## Key schema notes

- 16 models: UserProfile, Role, Staff, Task, Tag, TaskTag, FollowUp, Note, Transcript, FileUpload, Conversation, ScheduleBlock, ScheduleOverride, Skill, Integration, AiUsage
- Task and FollowUp have `sourceType` + `sourceId` fields for deduplication across integrations (linear, granola, calendar)
- Indexes on Task(`roleId, done`), Task(`isToday, done`), Task(`roleId, status`), FollowUp(`roleId, status`), Note(`roleId, createdAt`), AiUsage(`createdAt`), AiUsage(`roleId`)
- Conversation.messages is a JSON column — if a thread exceeds ~100 messages, consider migrating to a Message model
- Skill model stores slash command templates (8 built-in + custom)
- Integration model stores third-party configs (Linear, Granola) with lastSyncAt/lastSyncResult
- ScheduleBlock stores time blocks; ScheduleOverride stores per-day deviations
- End-of-day reset triggers via AppShell on first request of each new day (localStorage check, no cron)

## New machine setup (complete guide)

This is the full end-to-end guide for setting up Conductor on a fresh macOS machine. Follow every step in order.

### Prerequisites

- **macOS** (required for Calendar sync via EventKit)
- **Docker Desktop** (for running the app + Postgres in containers)
- **Node.js 18+** (for local development, running Prisma commands)
- **Git** (to clone the repo)
- **Anthropic API key** from https://console.anthropic.com

### Step 1: Clone and configure environment

```bash
git clone <repo-url> conductor
cd conductor
cp .env.template .env
```

Edit `.env` and set these required values:

```bash
# Database — points to local Postgres (not Docker Postgres)
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/conductor"

# Auth — generate a unique secret
NEXTAUTH_SECRET="$(openssl rand -base64 32)"
NEXTAUTH_URL="http://localhost:5402"

# AI — your Anthropic API key (can also be set in-app later)
ANTHROPIC_API_KEY="sk-ant-..."

# Timezone for schedule matching
TIMEZONE="America/New_York"
```

Optional variables (set later if needed):
```bash
GRANOLA_API_KEY=""            # For meeting transcript sync (Granola Business plan)
LINEAR_SYNC_SECRET=""         # For Linear task sync authentication
APP_PASSWORD_HASH=""          # Auto-set during onboarding wizard
UPLOAD_DIR="./uploads"        # File upload directory
```

### Step 2: Set up local PostgreSQL

Conductor uses a local PostgreSQL instance (not the Docker Postgres). This is important — the Docker Postgres in `docker-compose.yml` is a secondary option.

If you don't have Postgres installed:
```bash
brew install postgresql@16
brew services start postgresql@16
```

Create the database:
```bash
createdb conductor
```

The `DATABASE_URL` in `.env` should point to your local Postgres:
```
postgresql://postgres:postgres@localhost:5432/conductor
```

If your local Postgres uses a different user/password, adjust accordingly.

### Step 3: Start Docker

```bash
docker compose up -d --build
```

This starts:
- **conductor** app on port **5402** (Next.js production build)
- **conductor-cron** sidecar for hourly Linear/Granola syncs
- **postgres** container on port **5433** (backup, not primary — see Step 2)

The `docker-entrypoint.sh` automatically runs `prisma migrate deploy` on startup, so the database schema is created/updated.

Verify it's running:
```bash
docker compose logs conductor | tail -5
# Should show: ✓ Ready in ...ms
```

### Step 4: Run the setup wizard

Open **http://localhost:5402** in your browser. The setup wizard will launch automatically:

1. **Welcome** — Click "Get Started" (or import a config JSON from a previous machine)
2. **Password** — Set your app password (min 4 characters). This auto-signs you in.
3. **Companies** — Add each role/company you work for:
   - Name (e.g., "Acme Corp"), Title (e.g., "VP Engineering"), Platform (Slack/Teams), Color
   - Add as many as needed. Priority is set by order (first = highest).
4. **Schedule** — Create time blocks mapping roles to hours:
   - e.g., "Morning" 7:30-10:00 → Acme Corp, "Midday" 10:30-3:00 → Globex Inc
   - These can be refined later in Settings > System > Schedule
5. **Profile** (optional) — Communication style and global context for AI
6. **Done** — Click "Open Conductor" to start using the app

### Step 5: Set up Calendar sync (macOS EventKit)

This reads events directly from macOS Calendar.app via Swift/EventKit — no screenshots needed. Events are mapped to roles by calendar account email.

#### 5a. Grant Calendar access

Run this once — macOS will prompt for Calendar permission:
```bash
swift cron/calendar-events.swift
```
Grant access in the macOS dialog that appears.

#### 5b. Discover your calendar accounts

```bash
swift cron/calendar-events.swift | python3 -c "import sys,json; [print(a) for a in set(e['calendarAccount'] for e in json.load(sys.stdin)['events'])]"
```

This prints your calendar account emails, e.g.:
```
you@acme-corp.com
you@globex-inc.com
you@initech.com
```

#### 5c. Configure account-to-role mappings

In **Settings > Integrations > Calendar**, or directly in the database:

```sql
psql -U postgres -h localhost -p 5432 -d conductor -c "
UPDATE \"UserProfile\" SET \"calendarRoleMappings\" = 'you@acme-corp.com = Acme Corp
you@globex-inc.com = Globex Inc
you@initech.com = Initech' WHERE id='default';"
```

Format is one mapping per line: `calendar-account-email = Role Name`

#### 5d. Configure ignore patterns

In Settings > Integrations > Calendar, set patterns for events to ignore (one per line):
```
OOO
Out of Office
Busy
Deep Work
Focus Time
Block
Hold
No meetings
Lunch
Personal
```

#### 5e. Install the LaunchAgent

The LaunchAgent runs hourly on the hour (7 AM - 4 PM, weekdays) on your Mac, reads Calendar events via EventKit, and POSTs to the Docker container.

```bash
# Create logs directory
mkdir -p logs

# Update the plist with your repo path and port
# (check cron/com.conductor.calendar-sync.plist — ProgramArguments path and CONDUCTOR_URL)

# Install and load
cp cron/com.conductor.calendar-sync.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.conductor.calendar-sync.plist
```

**Important**: Edit the plist if your paths differ:
- `ProgramArguments` → must point to your `cron/calendar-sync.sh` absolute path
- `CONDUCTOR_URL` → must match your Docker port (default: `http://localhost:5402`)
- `StandardOutPath` / `StandardErrorPath` → must point to your `logs/` directory

#### 5f. Verify calendar sync

```bash
bash cron/calendar-sync.sh
```

Should output something like:
```
Starting calendar sync for 2026-04-14...
Read 13 events from Calendar
Calendar sync success — {"meetingsFound":13,"meetingsCreated":13,...}
```

The sync:
- Runs hourly on the hour during working hours (7 AM - 4 PM, weekdays)
- Hashes event data — skips API call if nothing changed (saves cost)
- Uses Claude Haiku for prep task generation (~$0.001/call)
- AgendaStrip on the Focus page auto-refreshes within 15 seconds

### Step 6: Set up Linear sync (optional)

If you use Linear for task management:

1. Get a Linear API key from Linear > Settings > API
2. In **Settings > Integrations**, add a Linear integration:
   - API key, Team ID, Role mapping
3. The Docker `conductor-cron` sidecar syncs hourly automatically
4. Or trigger manually from Settings

### Step 7: Set up Granola sync (optional)

If you use Granola for meeting transcripts:

1. Get a Granola API key (requires Business plan)
2. Set `GRANOLA_API_KEY` in `.env` or in Settings > System > API Keys
3. In **Settings > Integrations**, configure Granola folder→role mappings
4. The Docker `conductor-cron` sidecar syncs every 30 minutes automatically

### Step 8: Set up database backups (optional)

```bash
# The backup script dumps Postgres to the backups/ directory
mkdir -p backups

# Create a LaunchAgent for daily backups (or use cron)
# The backup script is at cron/backup.sh
# It keeps the last 7 days of backups and cleans older ones
bash cron/backup.sh  # Test it
```

### Step 9: Migrating from an old machine

Two options:

**Option A: Full app export/import (recommended)**
1. On old machine: Settings > System > Actions > Export full backup (downloads JSON)
2. On new machine: During setup wizard, click "Import" on the Welcome screen
3. Select the backup JSON — restores roles, staff, schedule, skills, integrations, tags, profile
4. Set a new password and you're done

**Option B: Database-level migration**
```bash
# Old machine: dump
pg_dump -U postgres conductor | gzip > conductor-backup.sql.gz

# New machine: restore
gunzip -c conductor-backup.sql.gz | psql -U postgres conductor

# Copy uploaded files separately
rsync -avz old-machine:/path/to/uploads/ ./uploads/
```

### Quick reference — daily operations

| Action | How |
|--------|-----|
| Start the app | `docker compose up -d` |
| Rebuild after code changes | `docker compose up -d --build` |
| View logs | `docker compose logs -f conductor` |
| Stop everything | `docker compose down` |
| Run database migrations | `docker compose restart conductor` (entrypoint runs migrate) |
| Manual calendar sync | `bash cron/calendar-sync.sh` |
| Check LaunchAgent status | `launchctl list \| grep conductor` |
| Reload LaunchAgent | `launchctl unload ~/Library/LaunchAgents/com.conductor.calendar-sync.plist && launchctl load ~/Library/LaunchAgents/com.conductor.calendar-sync.plist` |
| Reset stuck tasks | Settings > System > Actions > Reset today's tasks |
| Export config | Settings > System > Actions > Export full backup |

## Project structure

```
conductor/
├── prisma/schema.prisma, seed.ts, migrations/
├── src/app/                    # Next.js App Router pages + API routes
│   ├── api/
│   │   ├── tasks/, followups/, notes/, tags/, search/
│   │   ├── conversations/[roleId]/ (message, upload)
│   │   ├── ai/ (extract, draft, reconfigure, usage)
│   │   ├── skills/ (CRUD, resolve)
│   │   ├── integrations/ (CRUD, linear/sync, granola/sync)
│   │   ├── documents/          # Document management
│   │   ├── export/, import/    # Full backup + config export/import
│   │   ├── context/            # Assembled context for artifacts
│   │   ├── setup/, onboarding/ # First-run wizard + checklist
│   │   └── roles/, profile/, schedule/, calendar/, files/, transcripts/, auth/
│   ├── (pages) /, inbox, tracker, board, ai, docs, documents, settings, login, setup
│   ├── (settings subpages) flow, keys, costs
├── src/components/             # React components
│   ├── ui/                     # shadcn/ui primitives
│   ├── AppShell.tsx            # Responsive layout
│   ├── Sidebar.tsx             # Desktop nav
│   ├── BottomNav.tsx           # Mobile nav
│   ├── MobileDrawer.tsx        # Mobile drawer
│   ├── ChatThread.tsx          # AI chat with slash commands + artifact rendering
│   ├── TaskItem.tsx            # Task card with status, tags, source indicators
│   ├── FocusView.tsx           # Main focus mode
│   ├── GlobalSearch.tsx        # Cmd+K search
│   ├── SetupWizard.tsx         # Onboarding flow
│   ├── ScheduleGrid.tsx        # Schedule editor
│   ├── KeyboardShortcuts.tsx   # Keyboard shortcut handler
│   └── ConductorLogo.tsx       # App logo
├── src/lib/
│   ├── ai-context.ts           # 5-layer context assembly
│   ├── skill-resolver.ts       # {{variable}} template resolution
│   ├── ai-usage.ts             # Token/cost tracking
│   ├── api-keys.ts             # API key management
│   ├── file-processor.ts       # PDF/docx/image extraction
│   ├── schedule.ts             # Time block detection
│   ├── docs-content.ts         # Knowledge base content
│   ├── prisma.ts               # Prisma client singleton
│   ├── auth.ts                 # NextAuth config
│   └── utils.ts                # Shared utilities
├── .env.template               # Environment variable template
├── cron/                       # Sync scripts (run on macOS host, not inside Docker)
│   ├── calendar-events.swift   # EventKit reader — outputs today's events as JSON
│   ├── calendar-sync.sh        # Calendar sync runner (EventKit → API)
│   ├── com.conductor.calendar-sync.plist  # LaunchAgent (30-min calendar sync)
│   ├── sync.sh                 # Unified sync runner (Linear, Granola)
│   └── sync-crontab            # Cron schedule (Linear, Granola)
├── infra/                      # AWS CDK stack
├── uploads/                    # Local dev file uploads
└── docker-compose.yml
```

## Navigation structure

**Sidebar (6 items):** Focus, Inbox, Tracker, Board, AI + Settings (pushed to bottom)

Flow, Keys, and Costs were removed from nav — they live inside Settings > System tab as embedded content components.

**Settings (4 tabs):**
1. Roles (default) — Role accordions with responsibilities, goals, tone, context, staff directory
2. Profile — Communication style, sample messages, about me
3. Integrations — Calendar patterns, Linear config + sync, Granola config + sync
4. System — Schedule, Skills, Flow guide, Keyboard shortcuts, AI Costs, Actions

## Roles and priority waterfall

Roles are user-defined — created during onboarding or in Settings. Each role has:
- **Name, title, platform** (Slack or Teams), **color**, **priority** (1 = highest)
- **Tone** — how AI drafts messages for this role
- **Context** — background info for AI
- **Responsibilities, quarterly goals** — used by slash commands
- **Staff directory** — people associated with this role

When a time block has no assigned role or the assigned role has no tasks, pull from the highest-priority role that has tasks. This is called the **priority waterfall**.

## Schedule

Schedule blocks are user-configurable via Settings > System > Schedule. The seed provides default time slots (Morning, Triage, Midday, Afternoon, Late Afternoon, Evening) without role assignments — the user maps roles to blocks during onboarding.

Each block has: label, start time, end time, and per-weekday role assignments via ScheduleOverride.

## Critical UX rules (neurodivergent design)

**These are non-negotiable. Every PR must follow these.**

1. **No badge counts.** Not on nav tabs, not on role cards, not anywhere. Numbers create anxiety.
2. **Completed tasks are GONE.** Framer Motion slide-out animation → removed from DOM. No "completed" section. No count.
3. **Follow-ups are NOT tasks.** They live in the Tracker view, completely separate.
4. **Focus mode shows ONE role.** The current time block's role. No cross-role noise.
5. **Morning task selection is optional.** User can skip straight to focus mode.
6. **End of day is silent.** Incomplete today-tasks quietly return to backlog. No summary, no guilt.
7. **Stale follow-ups are the only proactive alert.** Everything else waits for the user to look.

## AI features

### Context assembly (src/lib/ai-context.ts)

Every Claude API call assembles context in 5 layers. **Never send entire conversation history or all notes.** Keep under ~10K tokens.

| Layer | What | Tokens | When |
|-------|------|--------|------|
| 1 | System prompt (roles, waterfall, schedule, artifact instructions) | ~500 | Always |
| 1.5 | Voice profile (communicationStyle, sampleMessages, globalContext) | ~500 | Always |
| 2 | State snapshot (today's tasks, active follow-ups, current block) | ~1K | Always |
| 3 | Role context (tone, responsibilities, goals, staff, notes, transcripts) | ~2K | When in a role |
| 4 | Retrieved context (keyword-matched notes, transcript summaries) | ~2-4K | On demand |

### Slash commands (skills)

8 built-in skills: `/standup-prep`, `/weekly-summary`, `/draft-update`, `/stale-report`, `/sprint-plan`, `/meeting-prep`, `/role-switch`, `/blocked`

Stored in Skill model. Prompt templates use `{{variables}}` resolved by `src/lib/skill-resolver.ts` against live DB data. Type `/` in AI chat → filterable popup menu with keyboard navigation.

### Artifact rendering

AI can return `:::artifact{title="..." type="html|react|mermaid"}` blocks. Rendered in sandboxed iframes in ChatThread. HTML artifacts get `window.CONDUCTOR_DATA` injected (roles, tasks, follow-ups, current block) from `/api/context`.

### Model selector

Sonnet 4.6 (default), Haiku 4.5, Opus 4.6. Dropdown in AI page header.

## Integrations

### Linear
- Hourly sync via cron/LaunchAgent → `POST /api/integrations/linear/sync`
- GraphQL API, fetches issues assigned to user on configured team
- Role mapping configured in Settings > Integrations
- Status mapping: Backlog/Todo→backlog, In Progress→in_progress, In Review→in_review, Done→done
- Dedup: `sourceType="linear"`, `sourceId="linear-{uuid}"`
- Auth: `x-sync-secret` header

### Granola
- 30-min sync via cron/LaunchAgent → `POST /api/integrations/granola/sync`
- Maps Granola folder names to Conductor roles (configured in Settings > Integrations)
- Fetches AI summary + speaker-labeled transcript → Claude extracts tasks, follow-ups, decisions
- Dedup: `sourceType="granola"`, `sourceId="granola-{noteId}"`

### Calendar (macOS EventKit)
- **Hourly sync** via macOS LaunchAgent (`cron/com.conductor.calendar-sync.plist`) — runs on the hour, 7 AM - 4 PM weekdays
- Reads events directly from macOS Calendar via **EventKit** (`cron/calendar-events.swift`) — no screenshots needed
- Maps calendar accounts to roles (e.g., `you@acme-corp.com → Acme Corp`) configured in Settings > Integrations > Calendar
- Generates prep tasks for each non-ignored meeting via Claude Haiku (text, not vision — cheap)
- 3-phase reconciliation: upsert new/changed meetings, remove deleted meetings, preserve completed prep tasks
- Dedup: `sourceType="calendar"`, `sourceId="cal-{date}-{normalizedTitle}"`
- Hash-based change detection: hashes event data, skips API call if calendar unchanged
- AgendaStrip polls `/api/calendar/last-sync` every 15 seconds, auto-refreshes when new sync lands
- AppShell triggers sync on app open if last sync was >65 minutes ago
- **Fallback**: screenshot upload via Settings > Integrations > Calendar drop zone (uses Sonnet vision)

#### Calendar sync setup on a new machine

1. **Grant Calendar access**: Run `swift cron/calendar-events.swift` once — macOS will prompt for Calendar permission. Grant it.

2. **Discover calendar accounts**:
   ```bash
   swift cron/calendar-events.swift | python3 -c "import sys,json; [print(a) for a in set(e['calendarAccount'] for e in json.load(sys.stdin)['events'])]"
   ```

3. **Configure mappings** in Settings > Integrations > Calendar, or directly in DB:
   ```sql
   UPDATE "UserProfile" SET "calendarRoleMappings" = 'you@acme-corp.com = Acme Corp
   you@globex-inc.com = Globex Inc
   you@initech.com = Initech' WHERE id='default';
   ```

4. **Configure ignore patterns** in Settings > Integrations > Calendar (OOO, Busy, Deep Work, etc.)

5. **Install the LaunchAgent** (runs hourly on the hour, guards for weekday working hours 7AM-4PM):
   ```bash
   cp cron/com.conductor.calendar-sync.plist ~/Library/LaunchAgents/
   launchctl load ~/Library/LaunchAgents/com.conductor.calendar-sync.plist
   ```

6. **Verify**: `bash cron/calendar-sync.sh` — should output event count and sync result

7. **Update `CONDUCTOR_URL`** in the plist if the app runs on a different port (default: `http://localhost:5402`)

#### Key files
- `cron/calendar-events.swift` — Swift script that reads events via EventKit, outputs JSON
- `cron/calendar-sync.sh` — Bash wrapper: runs Swift, hashes events, POSTs to API
- `cron/com.conductor.calendar-sync.plist` — macOS LaunchAgent (30-min interval)
- `src/app/api/calendar/process/route.ts` — Accepts structured events or screenshot, reconciles with DB
- `src/app/api/calendar/last-sync/route.ts` — Returns last sync timestamp (polled by AgendaStrip)
- `src/app/api/calendar/accounts/route.ts` — Discovers calendar accounts (macOS only, not in Docker)
- `src/components/AgendaStrip.tsx` — Displays today's meetings, polls for sync updates

## Conversations

One persistent conversation per role. Stored in the `Conversation` table as a JSON array of messages. When sending to Claude API, include Layers 1-3 + **last 10 messages** from history + new message.

## File processing

- Images → base64 to Claude API
- PDFs → text via pdf-parse, then to Claude as text
- Word docs → text via mammoth, then to Claude as text
- Text files → read directly
- Max 10MB per upload
- Store at `process.env.UPLOAD_DIR` (./uploads local, /opt/conductor/uploads prod)

## Responsive layout

- **Mobile-first** (< 1024px): bottom nav via MobileDrawer, single column
- **Desktop** (≥ 1024px): sidebar (280px) + main panel
- `AppShell.tsx` handles the layout switch
- Theme switcher: Dark (default), Warm, Light — via CSS variables in ThemeProvider

## Environment

Copy `.env.template` to `.env` and fill in your values:
```bash
cp .env.template .env
```

See `.env.template` for all available variables with descriptions. Key ones:
- `DATABASE_URL` — PostgreSQL connection string
- `NEXTAUTH_SECRET` — session secret (generate with `openssl rand -base64 32`)
- `ANTHROPIC_API_KEY` — Claude API key (can also be set in-app)
- `GRANOLA_API_KEY` — optional, for meeting transcript sync
- `LINEAR_SYNC_SECRET` — optional, for cron sync authentication

## Deployment

### Docker (primary — local macOS)

```bash
docker compose up -d --build   # Postgres on :5433, app on :5402
```

The app runs in Docker but calendar sync runs on the macOS host via LaunchAgent (EventKit requires native macOS access). See "New machine setup" above for full details.

### EC2 (remote — optional)

- EC2 t3.small via CDK (see /infra)
- PostgreSQL 16 installed on the same instance
- Nginx reverse proxy + Let's Encrypt SSL
- PM2 process manager
- EventBridge auto start/stop on weekdays

Deploy:
```bash
rsync -avz --exclude=node_modules --exclude=.next --exclude=uploads \
  ./ ubuntu@IP:/opt/conductor/
ssh ubuntu@IP "cd /opt/conductor && npm install && npx prisma migrate deploy && npm run build && pm2 restart conductor"
```

Note: Calendar sync via EventKit does not work on EC2 (no macOS). Use the screenshot upload in Settings > Integrations > Calendar as a manual fallback.

## Conventions

- Use shadcn/ui components from `@/components/ui/` — don't build custom form elements
- Use Framer Motion for all animations (task completion, view transitions)
- Use Lucide React for all icons
- All API routes in `src/app/api/` using Next.js App Router route handlers
- Prisma client singleton in `src/lib/prisma.ts` — import from there, never instantiate directly
- All touch targets minimum 44px
- No `console.log` in production — use conditional logging
- CSS variables for theming: `var(--surface)`, `var(--text-primary)`, `var(--border-subtle)`, etc.
- Dark theme is the primary design target

## What NOT to build

- No multi-user support
- No OAuth/social login
- No time tracking or hour logging
- No weekly hours breakdown
- No badge counts or notification dots
- No "completed tasks" view
- No end-of-day summary screens

