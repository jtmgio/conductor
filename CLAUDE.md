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

## Getting started

```bash
docker compose up -d              # Start Postgres
npm install                        # Dependencies
npx prisma migrate dev --name init # Schema + seed
mkdir -p uploads                   # File upload dir
npm run dev                        # http://localhost:3000
```

The setup wizard walks through password creation, adding companies/roles, configuring schedule blocks, and setting up a voice profile. No seed data includes company-specific information — all roles and staff are created through the app.

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
├── cron/                       # Docker cron sync scripts
│   ├── sync.sh                 # Unified sync runner
│   └── sync-crontab            # Cron schedule
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

Docker (alternative):
```bash
docker compose up -d   # Postgres on :5433, app on :3100
```

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

