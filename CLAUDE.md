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
- Local MLX server (Qwen3 30B, default for text) + Anthropic Claude API (Sonnet 4.6, Haiku 4.5, Opus 4.6) + OpenAI (GPT-5.4 family) — see docs/RUNBOOK_LOCAL_AI.md
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

The LaunchAgent runs every 10 minutes, around the clock, on your Mac. It reads a rolling 14-day window of Calendar events via EventKit and POSTs each day to the Docker container.

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
- Runs every 10 minutes, 24/7 (per-day hashing makes off-hours runs nearly free — unchanged days skip the API call)
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
4. The Docker `conductor-cron` sidecar syncs hourly automatically

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
| Quick-capture a task | `⌃⌥Space` (or ⌘Space → `todo` → Enter, or `bash mac/conductor-capture.sh "..."`) |
| Install the capture hotkey | `bash mac/install-hotkey.sh` |
| Rebuild the capture app | `bash mac/build-capture-app.sh` |
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
│   ├── com.conductor.calendar-sync.plist  # LaunchAgent (hourly calendar sync)
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

Qwen3 30B (local MLX, current default), Sonnet 4.6, Haiku 4.5, Opus 4.6, GPT-5.4 family (if OpenAI key set). Dropdown in AI page header.

### Local AI (MLX) — read `docs/RUNBOOK_LOCAL_AI.md` before touching

- Model ids prefixed `local/` route to Conductor's own MLX server on the macOS host: `com.conductor.mlx` LaunchAgent, `~/conductor-mlx-venv`, port 11436, Qwen3-30B-A3B (`LOCAL_AI_BASE_URL` via `host.docker.internal`).
- **Port 11435 is the kosmos PRODUCTION server (`com.kosmos.mlx`, `~/mlx-venv`) — never touch it, never point Conductor at it.** `callLocal()` only ever sends `LOCAL_AI_MODEL` (an unknown id would make an mlx server try to load it — RAM spike).
- `createCompletionWithLocalFallback()` in `src/lib/ai-provider.ts` retries any failed cloud call on local — used by **all text-only AI routes** so billing outages degrade to local instead of losing features. Vision paths (`ai/extract` on images, calendar screenshot fallback) stay cloud-only. Local usage is tracked at $0, output capped by `LOCAL_AI_MAX_TOKENS` (2048), text-only (images dropped with a placeholder). Chat defaults to the local model.

## Integrations

### Linear
- Hourly sync via cron/LaunchAgent → `POST /api/integrations/linear/sync`
- GraphQL API, fetches issues assigned to user on configured team
- Role mapping configured in Settings > Integrations
- Status mapping: Backlog/Todo→backlog, In Progress→in_progress, In Review→in_review, Done→done
- Dedup: `sourceType="linear"`, `sourceId="linear-{uuid}"`
- Auth: `x-sync-secret` header

### Granola
- Hourly sync via cron/LaunchAgent → `POST /api/integrations/granola/sync`
- Maps Granola folder names to Conductor roles (configured in Settings > Integrations)
- Fetches AI summary + speaker-labeled transcript → Claude extracts tasks, follow-ups, decisions
- Dedup: `sourceType="granola"`, `sourceId="granola-{noteId}"`

### Calendar (macOS EventKit)
- **10-minute sync** via macOS LaunchAgent (`cron/com.conductor.calendar-sync.plist`) — runs 24/7 over a rolling `CALENDAR_WINDOW_DAYS` (default 14) day window, so future meetings are queryable. Set `CALENDAR_WORK_HOURS_ONLY=1` to restore the old 7AM-4PM weekday guard.
- Reads events directly from macOS Calendar via **EventKit** (`cron/calendar-events.swift`) — no screenshots needed
- Maps calendar accounts to roles (e.g., `you@acme-corp.com → Acme Corp`) configured in Settings > Integrations > Calendar
- Generates prep tasks for each non-ignored meeting via Claude Haiku (text, not vision — cheap)
- **`CALENDAR_PREP_TASKS="off"`** (env, currently set) disables prep tasks entirely: meetings still sync to the AgendaStrip but no Task rows are created and the AI call is skipped (sync response reports `summary: "prep tasks disabled"` so hash caching still works). Remove the env var + rebuild to re-enable.
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

5. **Install the LaunchAgent** (runs every 10 minutes, 24/7):
   ```bash
   cp cron/com.conductor.calendar-sync.plist ~/Library/LaunchAgents/
   launchctl load ~/Library/LaunchAgents/com.conductor.calendar-sync.plist
   ```

6. **Verify**: `bash cron/calendar-sync.sh` — should output event count and sync result

7. **Update `CONDUCTOR_URL`** in the plist if the app runs on a different port (default: `http://localhost:5402`)

#### Calendar sync troubleshooting

**Full runbook: `docs/RUNBOOK_CALENDAR_SYNC.md`** — diagnostic checklist, failure modes, recovery steps, incident history. Start there when calendar sync breaks. The critical gotchas:

1. **Rebuilding `cron/calendar-events` revokes its macOS Calendar (TCC) grant.** After any `bash cron/build-calendar-events.sh`, run `./cron/calendar-events` once interactively and grant the permission prompt — otherwise the next launchd run hangs forever on an invisible prompt.
2. **A hung run wedges the whole schedule.** launchd runs one instance per label; a stuck sync silently blocks all future runs. The script has a 90s watchdog, but if `launchctl list | grep calendar-sync` shows a long-lived PID, kill it.
3. **`tasksCreated: 0` with no `summary` in the result = the Haiku prep-task call failed** — usually Anthropic credits exhausted. Meetings still sync; the script skips hash-caching so prep tasks retry hourly once credits are restored.
4. **Force a full re-sync:** `rm -f /tmp/conductor-calendar-hash-* && bash cron/calendar-sync.sh` (hashes are per-day: `/tmp/conductor-calendar-hash-YYYY-MM-DD`)
5. The repo plist is a template (`/path/to/conductor` placeholders); the live copy in `~/Library/LaunchAgents/` has real paths.

#### Key files
- `docs/RUNBOOK_CALENDAR_SYNC.md` — operational runbook (read this first when sync breaks)
- `cron/calendar-events.swift` — Swift source; compiled by `cron/build-calendar-events.sh` into the `calendar-events` binary that holds the TCC grant
- `cron/calendar-sync.sh` — Bash wrapper: reads events (90s watchdog), guards date drift, hashes events+date, POSTs to API
- `cron/com.conductor.calendar-sync.plist` — macOS LaunchAgent (every 10 min, 24/7)
- `src/app/api/calendar/process/route.ts` — Accepts structured events or screenshot, reconciles with DB
- `src/app/api/calendar/last-sync/route.ts` — Returns last sync timestamp (polled by AgendaStrip)
- `src/app/api/calendar/accounts/route.ts` — Discovers calendar accounts (macOS only, not in Docker)
- `src/components/AgendaStrip.tsx` — Displays today's meetings, polls for sync updates

## Spotlight quick capture (macOS)

⌘Space → `todo` → Enter. A SwiftUI window: what to do, which company, today or backlog —
all keyboard (`⌘1…9` company, `⌘T` today/backlog, `Enter` add, `Esc` cancel). Files through
the same MLX refine as MCP `create_task` and confirms with the task key ("Added to vQuip · VQ-156").

**Named `Todo`, not `Conductor`, on purpose** — Spotlight ranks open windows above apps, so
the running Conductor browser window always won the "conductor" match. `todo` has no competitor.

### Message mode (`⌘M`)

The same window flips to a formatter: rough draft in, the draft in Josh's voice out and **on
the clipboard**. The whole flow is copy a draft → `⌃⌥Space` → `⌘M` → `Enter` → paste.

- Switching to message mode **pulls the clipboard into the field and selects it**, since that
  is the flow it exists for. Typing replaces it; it only auto-fills when the field is empty.
- Company still picks the voice/tone (`⌘1…9`); `⌘P` cycles Slack → Teams → Email → SMS. The
  platform preselects from `Role.platform`, normalized server-side in `GET /api/capture`
  (a role on both Slack and Teams counts as Slack).
- On success it flashes "Copied · company · platform" and **closes itself** (~1.1s). The
  clipboard is the deliverable; the window has nothing left to do.
- **Emphasis is restored in code, not by the model.** `restoreEmphasis()` in
  `src/lib/format-message.ts` re-wraps every bold/italic span from the raw message in the
  platform's syntax. The prompt asks for it too, but the local Qwen model flattens
  `**Blocked**` to plain "blocked" most of the time no matter how it's asked — it's pulled
  toward the voice guide's terseness. The pass is conservative (first plain occurrence,
  never inside code, nothing under 3 chars). Gap: a header line the model deletes outright
  can't be restored, since where it belonged is a guess.
- **Rebuilding the app is not enough — restart the daemon.** The resident `--daemon` process
  keeps running the old binary, so `open -a Todo` reopens the version you just replaced:
  `launchctl kickstart -k gui/$(id -u)/com.conductor.todo-hotkey`.
- `src/app/api/format/route.ts` — bearer-authed `POST { text, role?, platform? }`. Exists
  because `/api/ai/format-message` is gated on a NextAuth session a Swift app can't hold;
  both call the same `src/lib/format-message.ts`, so the voice guide applies either way.
- Window sizing: the window uses an `NSHostingController`, not a bare `NSHostingView`, so it
  grows for the multi-line field and the read-back. Don't call `setContentSize` on it.

- `src/app/api/capture/route.ts` — bearer-authed with `MCP_API_TOKEN`, no NextAuth session.
  `GET` returns active companies (with `platform`) + the current schedule block's
  `currentRoleId` (what the app
  preselects). `POST` takes `{ text, role?, today? }`: an explicit `role` skips AI company
  inference entirely, `today: true` sets `scheduledFor`. Also serves the iOS Siri Shortcut,
  where both are omitted and inference still runs. Tasks get `sourceType: "siri"`.
**Global hotkey: `⌃⌥Space`** opens the window from anywhere, no Spotlight round-trip.
`bash mac/install-hotkey.sh` installs the `com.conductor.todo-hotkey` LaunchAgent, which
keeps `Todo.app --daemon` resident (accessory app, no Dock icon, no window until the hotkey).
Uses Carbon `RegisterEventHotKey` — the one global-hotkey API that needs no Accessibility
grant. `--uninstall` removes it; Spotlight still works either way. To change the combo, edit
`registerHotKey()` in the Swift, rebuild, re-run the installer.

- `mac/todo-app/main.swift` + `mac/build-capture-app.sh` — builds `/Applications/Todo.app`.
  `--daemon` makes it resident for the hotkey; without it, it's the one-shot Spotlight launch
  that quits when the capture is done.
  Run once per machine, and again after editing the Swift. Needs the Xcode command line tools
  (`xcode-select --install`). The build script also seeds `~/.conductor/{url,capture-token}`
  and embeds `public/icon-512.png` as the app icon.
- `mac/conductor-capture.sh` — the CLI equivalent (no picker; inference decides the company).
  Useful for testing and for scripting captures. Logs to `logs/capture.log` in the repo, or
  `~/.conductor/capture.log` on a client machine.
- **Client machines** (laptop → tower) need only the repo clone plus `~/.conductor/url`
  pointing at `http://joshuas-mac-pro.tail842fd4.ts.net:5402` and `~/.conductor/capture-token`
  holding the tower's `MCP_API_TOKEN`. No Docker, no Postgres, no `.env`. Config lives outside
  the repo because a Spotlight-launched app inherits no shell profile.

## Task keys

Every task has a human-addressable key so it can be named out loud instead of by cuid —
"close WRI-12" rather than pasting `cmd8x2p9k…`. This is what makes the MCP surface usable
conversationally.

- `Role.taskPrefix` (unique, 2-4 chars, editable in Settings > Roles) + `Role.taskSeq`, a
  monotonic per-company counter. `Task.number` is unique per role; the key renders as
  `${prefix}-${number}` via `taskKey()` in `src/lib/task-key.ts`.
- **Allocation lives in a Prisma client extension** in `src/lib/prisma.ts`, not in the
  routes — there are seven `task.create` call sites and centralizing it means a new one
  can't silently produce a keyless task. The counter bump is an atomic
  `UPDATE ... RETURNING`, so concurrent creates can't collide.
- **Numbers are never reused.** Deleting VQ-14 leaves it dead; gaps are correct.
- `Task.externalKey` holds an upstream system's own key and wins over prefix/number, so a
  Linear issue stays `MED-54` instead of getting a second Conductor identity. The extension
  skips allocation when `externalKey` is set. Linear sync no longer prefixes titles.
- New companies get a prefix auto-derived from the name (`uniquePrefix()`, camelCase-aware:
  vQuip -> VQ, HealthMe -> HM), collision-checked against existing prefixes.
- MCP accepts a key anywhere it accepts an id (`resolveTaskId()`, case-insensitive) and
  returns `key` as the first field of every task. ⌘K search matches keys too.

## MCP server (external agents)

Conductor exposes an MCP endpoint at `/api/mcp/[transport]` (`src/app/api/mcp/[transport]/route.ts`, built on `mcp-handler`) so external agents — Claude Code on any Tailscale device — can work the task system.

- **URL**: `http://joshuas-mac-pro.tail842fd4.ts.net:5402/api/mcp/mcp` (streamable HTTP)
- **Auth**: `Authorization: Bearer $MCP_API_TOKEN` (env var; fails closed if unset). NextAuth does not apply here.
- **Tools**: `get_context`, `list_tasks`, `create_task`, `update_task`, `refine_task`, `delete_task`, `create_followup`, `add_note`, `search`, `format_message`, `get_meetings`
- Tools resolve roles by (partial) name, tasks created get `sourceType: "mcp"` and default to backlog (not today)
- `create_task` AI-refines raw text by default via `src/lib/task-refine.ts` (shared with `/api/tasks/refine`): short title, notes, checklist, resolved dueDate. When no role is given, local AI infers it from the role directory + staff names and must quote its evidence; `evidenceMatchesRole()` verifies the quote in code (topic overlap like "dashboard" doesn't pass). Unverifiable → the tool returns `needsClarification` (task NOT created) with role options + bestGuess + currentBlockRole so the client asks the user. `refine: false` skips the AI. `update_task` accepts `role` to move a misfiled task.
- **A task is never titled with the whole brain dump.** When there's no AI title — `refine: false`, or refinement failed — `splitRawTask()` (`src/lib/task-refine.ts`) takes the first sentence as the title and puts the complete original in notes. Both MCP `create_task` and `/api/capture` use it; MCP reports `titleShortened` when it fires. This exists because VQ-150 and HM-81 landed as 506- and 662-character titles.
- `refine_task` rewrites an existing task's title/notes/checklist through the same refiner — the repair path for anything already filed raw. Keeps key, company, status, due date and priority; won't overwrite a checklist that's already in progress.
- `update_task` takes `checklist` as plain strings (`[]` clears it). Steps whose text is unchanged keep their tick, so rewording a list doesn't un-tick finished work.
- Registered in Claude Code user scope: `claude mcp add --scope user --transport http conductor <url> --header "Authorization: Bearer <token>"`

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

