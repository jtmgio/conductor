# CLAUDE.md — Conductor

## What is this

Conductor is a personal productivity operating system for an engineer managing 6 concurrent W2 engineering roles. It replaces Things 3 as a task manager and adds AI-powered follow-up tracking, transcript processing, communication drafting, slash commands, artifact rendering, and persistent per-role conversations. Integrates with Linear (task sync) and Granola (meeting transcript sync).

**This is a single-user app.** One person uses it. No multi-tenancy, no registration, no teams. Password-protected with a single password.

## Tech stack

- Next.js 14 (App Router) + React + TypeScript
- Tailwind CSS + shadcn/ui + Lucide React + Framer Motion
- PostgreSQL 16 (local on EC2 in prod, Docker in dev)
- Prisma ORM (15 models)
- NextAuth (credentials provider, single-user)
- Anthropic Claude API (Sonnet 4.6 default, Haiku 4.5, Opus 4.6 selectable)
- File processing: pdf-parse, mammoth, sharp

## Key schema notes

- 15 models: UserProfile, Role, Staff, Task, Tag, TaskTag, FollowUp, Note, Transcript, FileUpload, Conversation, ScheduleOverride, Skill, Integration, AiUsage
- Task and FollowUp have `sourceType` + `sourceId` fields for deduplication across integrations (linear, granola, calendar)
- Indexes on Task(`roleId, done`), Task(`isToday, done`), Task(`roleId, status`), FollowUp(`roleId, status`), Note(`roleId, createdAt`), AiUsage(`createdAt`), AiUsage(`roleId`)
- Conversation.messages is a JSON column — if a thread exceeds ~100 messages, consider migrating to a Message model
- Skill model stores slash command templates (8 built-in + custom)
- Integration model stores third-party configs (Linear, Granola) with lastSyncAt/lastSyncResult
- Default schedule is hardcoded in `src/lib/schedule.ts` — ScheduleOverride only stores deviations
- End-of-day reset triggers via AppShell on first request of each new day (localStorage check, no cron)

## Getting started

```bash
docker compose up -d              # Start Postgres
npm install                        # Dependencies
npx prisma migrate dev --name init # Schema + seed
mkdir -p uploads                   # File upload dir
npm run dev                        # http://localhost:3000
```

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
│   │   ├── context/            # Assembled context for artifacts
│   │   └── roles/, profile/, schedule/, calendar/, files/, transcripts/
│   ├── (pages) /, inbox, tracker, board, ai, settings, flow, keys, costs, login
├── src/components/             # React components
│   ├── ui/                     # shadcn/ui primitives
│   ├── AppShell.tsx            # Responsive layout
│   ├── Sidebar.tsx             # Desktop nav (6 items + Settings)
│   ├── ChatThread.tsx          # AI chat with slash commands + artifact rendering
│   ├── TaskItem.tsx            # Task card with status, tags, source indicators
│   ├── FocusView.tsx           # Main focus mode
│   └── GlobalSearch.tsx        # Cmd+K search
├── src/lib/
│   ├── ai-context.ts           # 5-layer context assembly
│   ├── skill-resolver.ts       # {{variable}} template resolution
│   ├── ai-usage.ts             # Token/cost tracking
│   ├── file-processor.ts       # PDF/docx/image extraction
│   ├── schedule.ts             # Time block detection
│   ├── prisma.ts               # Prisma client singleton
│   └── auth.ts                 # NextAuth config
├── scripts/                    # Sync scripts + LaunchAgent plists
│   ├── linear-sync.sh          # Hourly Linear sync
│   ├── granola-sync.sh         # 30-min Granola sync
│   └── *.plist                 # macOS LaunchAgent configs
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

## The 6 roles (in priority waterfall order)

1. **Zeta** — UI Director / Staff Engineer (Slack) — #2563eb — highest pay
2. **HealthMap** — Principal UI Architect (Teams) — #0d9488
3. **vQuip** — CTO, 3% equity (Slack) — #7c3aed — meetings 10:30am-3pm
4. **HealthMe** — Sr UI Engineer (Slack) — #d97706
5. **Xenegrade** — Sr Engineer (Slack) — #8cbf6e
6. **React Health** — Sr Node/NestJS Engineer (Teams) — #e11d48 — lowest touch

When a time block has no work, pull from the highest-priority role that has tasks. This is called the **priority waterfall**.

## Schedule

| Block | Time | Default roles |
|-------|------|---------------|
| b1 | 7:30–10:00 | Zeta / HealthMap (alternating days) |
| b2 | 10:00–10:30 | Triage (all Slacks + Teams) |
| b3 | 10:30–3:00 | vQuip (meetings + CTO async) |
| b4 | 3:00–4:00 | HealthMap / HealthMe |
| b5 | 4:00–5:00 | HealthMe / Xenegrade |
| b6 | 7:00–8:00 PM | Xenegrade / React Health (in bed) |

5 PM is a hard stop for family. 5–7 PM is family time. 7–8 PM is low-touch work in bed.

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

### Linear (HealthMe role)
- Hourly sync via LaunchAgent → `POST /api/integrations/linear/sync`
- GraphQL API, fetches issues assigned to user on configured team
- Status mapping: Backlog/Todo→backlog, In Progress→in_progress, In Review→in_review, Done→done
- Dedup: `sourceType="linear"`, `sourceId="linear-{uuid}"`
- Auth: `x-sync-secret` header

### Granola (all roles)
- 30-min sync via LaunchAgent → `POST /api/integrations/granola/sync`
- Maps Granola folder name to Conductor role (Zeta→zeta, HealthMap→healthmap, etc.)
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

```bash
# .env.local (dev)
DATABASE_URL=postgresql://conductor:localdev@localhost:5432/conductor
NEXTAUTH_SECRET=local-dev-secret
NEXTAUTH_URL=http://localhost:3000
APP_PASSWORD_HASH=$2b$10$...
ANTHROPIC_API_KEY=sk-ant-...
UPLOAD_DIR=./uploads
GRANOLA_API_KEY=grn_...                    # Optional: Granola Business plan API key
LINEAR_SYNC_SECRET=conductor-linear-sync   # Optional: auth for cron sync requests
```

## Deployment

- EC2 t3.small via CDK (see /infra)
- PostgreSQL 16 installed on the same instance
- Nginx reverse proxy + Let's Encrypt SSL
- PM2 process manager
- EventBridge auto start 6 AM ET / stop 9 PM ET, Monday–Friday

Deploy:
```bash
rsync -avz --exclude=node_modules --exclude=.next --exclude=uploads \
  ./ ubuntu@IP:/opt/conductor/
ssh ubuntu@IP "cd /opt/conductor && npm install && npx prisma migrate deploy && npm run build && pm2 restart conductor"
```

## Conventions

- Use shadcn/ui components from `@/components/ui/` — don't build custom form elements
- Use Framer Motion for all animations (task completion, view transitions)
- Use Lucide React for all icons
- All API routes in `src/app/api/` using Next.js App Router route handlers
- Prisma client singleton in `src/lib/prisma.ts` — import from there, never instantiate directly
- Role colors defined in `tailwind.config.ts` under `theme.extend.colors.role`
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

## Spec reference

The original product spec is in `conductor-spec.md` at the project root. Note: it describes the initial design — many features have been added since. For current state, refer to this CLAUDE.md and the memory files in `.claude/projects/.../memory/`.
