# CLAUDE.md — Conductor

## What is this

Conductor is a personal productivity operating system for an engineer managing 6 concurrent W2 engineering roles. It replaces Things 3 as a task manager and adds AI-powered follow-up tracking, transcript processing, communication drafting, and persistent per-role conversations.

**This is a single-user app.** One person uses it. No multi-tenancy, no registration, no teams. Password-protected with a single password.

## Tech stack

- Next.js 14 (App Router) + React + TypeScript
- Tailwind CSS + shadcn/ui + Lucide React + Framer Motion
- PostgreSQL 16 (local on EC2 in prod, Docker in dev)
- Prisma ORM
- NextAuth (credentials provider, single-user)
- Anthropic Claude API (claude-sonnet-4-20250514)
- File processing: pdf-parse, mammoth, sharp

## Key schema notes

- Task and FollowUp have `sourceType` + `sourceId` fields for tracing back to the transcript or file they were extracted from
- Indexes on Task(`roleId, done`), Task(`isToday, done`), FollowUp(`roleId, status`), Note(`roleId, createdAt`), FileUpload(`roleId`)
- Conversation.messages is a JSON column — if a thread exceeds ~100 messages, consider migrating to a Message model
- Default schedule is hardcoded in `src/lib/schedule.ts` — ScheduleOverride only stores deviations
- End-of-day reset triggers via middleware on first request of each new day (no cron)

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
├── src/components/             # React components
│   ├── ui/                     # shadcn/ui primitives
│   ├── AppShell.tsx            # Responsive layout (mobile bottom nav / desktop sidebar)
│   └── ...feature components
├── src/lib/                    # Shared utilities
│   ├── ai-context.ts           # 5-layer context assembly for Claude API
│   ├── file-processor.ts       # PDF/docx/image text extraction
│   ├── schedule.ts             # Time block detection + defaults
│   ├── prisma.ts               # Prisma client singleton
│   └── auth.ts                 # NextAuth config
├── infra/                      # AWS CDK stack
├── uploads/                    # Local dev file uploads
└── docker-compose.yml
```

## The 6 roles (in priority waterfall order)

1. **Zeta** — UI Director / Staff Engineer (Slack) — #2563eb — highest pay
2. **HealthMap** — Principal UI Architect (Teams) — #0d9488
3. **vQuip** — CTO, 3% equity (Slack) — #7c3aed — meetings 10:30am-3pm
4. **HealthMe** — Sr UI Engineer (Slack) — #d97706
5. **Xenegrade** — Sr Engineer (Slack) — #57534e
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
2. **Completed tasks are GONE.** Framer Motion slide-out animation → removed from DOM. No "completed" section. No count. Record stays in DB with `done: true` but UI never shows it again.
3. **Follow-ups are NOT tasks.** They live in the Tracker view, completely separate. "Waiting on someone" is not actionable — putting it in a task list creates a false open loop.
4. **Focus mode shows ONE role.** The current time block's role. No cross-role noise.
5. **Morning task selection is optional.** User can skip straight to focus mode.
6. **End of day is silent.** Incomplete today-tasks quietly return to backlog. No summary, no report, no "you didn't finish" messaging.
7. **Stale follow-ups are the only proactive alert.** Everything else waits for the user to look.

## AI context assembly

Every Claude API call assembles context in 5 layers. See `src/lib/ai-context.ts`.

**Never send the entire conversation history or all notes.** Keep requests under ~10K tokens.

| Layer | What | Tokens | When |
|-------|------|--------|------|
| 1 | System prompt (roles, waterfall, schedule) | ~500 | Always |
| 2 | State snapshot (today's tasks, active follow-ups, current block) | ~1K | Always |
| 3 | Role context (tone, staff directory, last 5 notes, role.context) | ~2K | When in a role |
| 4 | Retrieved context (relevant notes, transcript summaries) | ~2-4K | On demand |
| 5 | User message + attachments | Varies | Always |

## Conversations

One persistent conversation per role. Stored in the `Conversation` table as a JSON array of messages. When sending to Claude API, include Layers 1-3 + **last 10 messages** from history + new message. Not the full history.

## File processing

- Images → base64 to Claude API
- PDFs → text via pdf-parse, then to Claude as text
- Word docs → text via mammoth, then to Claude as text
- Text files → read directly
- Max 10MB per upload
- Store at `process.env.UPLOAD_DIR` (./uploads local, /opt/conductor/uploads prod)

## Responsive layout

- **Mobile-first** (< 1024px): 480px centered, bottom nav, single column
- **Desktop** (≥ 1024px): sidebar (280px) + main panel (content max 720px centered)
- Bottom nav hidden on desktop (`lg:hidden`), nav moves to sidebar (`hidden lg:flex`)
- `AppShell.tsx` handles the layout switch

## Environment

```bash
# .env.local (dev)
DATABASE_URL=postgresql://conductor:localdev@localhost:5432/conductor
NEXTAUTH_SECRET=local-dev-secret
NEXTAUTH_URL=http://localhost:3000
APP_PASSWORD_HASH=$2a$10$...
ANTHROPIC_API_KEY=sk-ant-...
UPLOAD_DIR=./uploads

# .env.production
DATABASE_URL=postgresql://conductor:cc_prod_pw@localhost:5432/conductor
NEXTAUTH_URL=https://your-domain.com
UPLOAD_DIR=/opt/conductor/uploads
NODE_ENV=production
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

## What NOT to build

- No multi-user support
- No OAuth/social login
- No time tracking or hour logging
- No weekly hours breakdown
- No badge counts or notification dots
- No "completed tasks" view
- No end-of-day summary screens
- No email/Slack integration (user copies messages manually)
- No calendar sync (user screenshots calendar and AI analyzes it)

## Spec reference

The complete product spec is in `conductor-spec.md` at the project root. It contains the full database schema, all API route definitions, AI endpoint logic, CDK infrastructure code, design system details, component patterns, and seed data. Refer to it for any implementation questions.
