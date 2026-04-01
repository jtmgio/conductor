# Conductor — Complete Build Spec v3

> Single source of truth. Hand this entire file to Claude Code.
> Contains: product spec, design system, database schema, API routes,
> AI architecture, CDK infrastructure, and local development setup.

---

# PART 1: PRODUCT

## What this is

**Conductor** is a mobile-first web app for an engineer managing 6 concurrent W2 engineering roles. Replaces Things 3 as task manager. Adds follow-up tracking, transcript processing, AI communication drafting, file processing, per-role staff directory, and persistent AI conversations per role (like Claude projects). Designed for a neurodivergent user who needs minimal visible open loops.

## Design principles

1. **Focus mode first.** Default view shows ONE role, ONE block, today's tasks only.
2. **No visible open loops.** Completed tasks disappear. Follow-ups are separate from tasks.
3. **No tracking, no metrics, no guilt.** No time logging. No hours breakdown. No badge counts.
4. **Extract at ingest, not recall.** AI processes content once, stores structured data.
5. **Per-role identity.** Each role has its own staff, tone, conversation, context.
6. **One conversation per role.** Six persistent threads, like Claude projects.

## Neurodivergent UX rules (enforce everywhere)

1. No badge counts anywhere — not on nav, not on cards, nowhere
2. Completed tasks are GONE — record in DB, never shown in UI again
3. Follow-ups are NOT tasks — separate Tracker view entirely
4. Focus shows ONE role — current block only, no cross-role noise
5. Morning is optional / skippable
6. End of day is silent — no summary, no "incomplete" messaging
7. Stale follow-ups are the only proactive signal
8. No infinite scrolling backlogs — show active items only

## The 6 roles

| Priority | ID | Name | Title | Platform | Color |
|----------|-----|------|-------|----------|-------|
| 1 | zeta | Zeta | UI Director / Staff Engineer | Slack | #2563eb |
| 2 | healthmap | HealthMap | Principal UI Architect | Teams | #0d9488 |
| 3 | vquip | vQuip | CTO (3% equity) | Slack | #7c3aed |
| 4 | healthme | HealthMe | Sr UI Engineer | Slack | #d97706 |
| 5 | xenegrade | Xenegrade | Sr Engineer | Slack | #57534e |
| 6 | reacthealth | React Health | Sr Node/NestJS Engineer | Teams | #e11d48 |

Priority waterfall: When a block opens, pull from the highest-priority role with tasks.

---

# PART 2: DESIGN SYSTEM

## Tech

- **Tailwind CSS v3** — utility-first styling
- **shadcn/ui** — component library (copy-paste, not dependency)
- **Lucide React** — icons
- **Framer Motion** — animations (task completion, view transitions)
- **SF Pro Display / system-ui** — typography (Apple-native feel)

## shadcn/ui setup

Initialize with:
```bash
npx shadcn@latest init
```

Configuration:
```json
{
  "style": "default",
  "rsc": true,
  "tsx": true,
  "tailwind": {
    "config": "tailwind.config.ts",
    "css": "src/app/globals.css",
    "baseColor": "zinc",
    "cssVariables": true
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils"
  }
}
```

Install these components:
```bash
npx shadcn@latest add button card input textarea select badge dialog sheet tabs avatar separator dropdown-menu toast scroll-area
```

## Color system

### Role colors (Tailwind custom)

Add to `tailwind.config.ts`:

```typescript
const config = {
  theme: {
    extend: {
      colors: {
        role: {
          zeta: {
            DEFAULT: '#2563eb',
            light: '#eff6ff',
            border: '#bfdbfe',
            text: '#1e40af',
          },
          healthmap: {
            DEFAULT: '#0d9488',
            light: '#f0fdfa',
            border: '#99f6e4',
            text: '#115e59',
          },
          vquip: {
            DEFAULT: '#7c3aed',
            light: '#f5f3ff',
            border: '#c4b5fd',
            text: '#5b21b6',
          },
          healthme: {
            DEFAULT: '#d97706',
            light: '#fffbeb',
            border: '#fde68a',
            text: '#92400e',
          },
          xenegrade: {
            DEFAULT: '#57534e',
            light: '#fafaf9',
            border: '#d6d3d1',
            text: '#292524',
          },
          reacthealth: {
            DEFAULT: '#e11d48',
            light: '#fff1f2',
            border: '#fecdd3',
            text: '#9f1239',
          },
        },
      },
      fontFamily: {
        sans: ['"SF Pro Display"', 'system-ui', '-apple-system', 'sans-serif'],
      },
      keyframes: {
        'slide-out-right': {
          '0%': { opacity: '1', transform: 'translateX(0)' },
          '100%': { opacity: '0', transform: 'translateX(80px) scale(0.95)' },
        },
        'fade-in-up': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'pulse-dot': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.3' },
        },
      },
      animation: {
        'slide-out': 'slide-out-right 0.4s ease-out forwards',
        'fade-in': 'fade-in-up 0.2s ease-out',
        'pulse-dot': 'pulse-dot 2s ease-in-out infinite',
      },
    },
  },
};
```

### App-wide tokens

```css
/* globals.css additions */
@layer base {
  :root {
    --app-max-width: 480px;
    --nav-height: 64px;
    --status-success: #10b981;
    --status-warning: #f59e0b;
    --status-danger: #ef4444;
    --status-stale: #f97316;
  }
}
```

## Typography

| Element | Size | Weight | Color |
|---------|------|--------|-------|
| Page title | 26px (text-2xl) | 700 | zinc-900 |
| Section label | 11px (text-xs) | 500 | zinc-400, uppercase, tracking-wide |
| Role name (in block) | 14px (text-sm) | 600 | role color |
| Time label | 11px (text-xs) | 400 | zinc-400 |
| Task text | 14px (text-sm) | 400 | zinc-900 |
| Urgent badge | 10px | 700 | red-500 |
| Nav label | 10px | 600 | active: blue-600, inactive: zinc-300 |
| Chat message | 13px | 400 | user: white, assistant: zinc-900 |

## Component patterns

### Bottom navigation (mobile only, hidden on lg+)

```tsx
// 4 tabs: Focus | Inbox | Tracker | AI
// Fixed bottom, max-width 480px centered
// Glass effect: bg-white/95 backdrop-blur-xl
// Active: border-t-2 border-blue-600, text-blue-600
// Inactive: text-zinc-300
// Icons: Lucide (Crosshair, Inbox, ListChecks, Sparkles)
// NO badge counts
// Hidden on desktop (lg:hidden) — nav moves to sidebar
```

### Sidebar (desktop only, hidden below lg)

```tsx
// Fixed left, w-[280px], h-screen
// bg-white border-r border-zinc-100
// dark:bg-zinc-950 dark:border-zinc-800
// Top: current block mini-view (role color accent, time, role name)
// Middle: nav links (Focus, Inbox, Tracker, AI) — vertical list
//   Active: bg-zinc-50 text-blue-600 font-semibold, left-2px border accent
//   Inactive: text-zinc-500
// "Coming up" section: next 2-3 blocks
// Bottom: settings gear + user avatar
```

### Task item (Focus view)

```tsx
// Rounded-2xl card, bg-zinc-50, border border-zinc-100
// Checkbox: 28px, rounded-lg, border-2 role-color/20
//   On hover: border-role-color/40
//   On complete: animate-slide-out (400ms), then remove from DOM
// Text: text-sm text-zinc-900
// Urgent: tiny "URGENT" badge, text-[10px] font-bold text-red-500
```

### Time block card (Focus view)

```tsx
// Active block: bg-role-light, border-2 border-role-color, rounded-2xl
// Inactive block: bg-zinc-50, border border-zinc-100, rounded-2xl
// Active indicator: 8px dot, bg-role-color, animate-pulse-dot
// Expandable: tap to show tasks + role reassignment dropdown
```

### Role chip

```tsx
// Inline pill: px-3 py-1, rounded-full
// bg-role-light, text-role-color, text-xs font-semibold
// border border-role-border
```

### Chat bubble (AI conversations)

```tsx
// User: bg-blue-600 text-white, rounded-2xl rounded-br-sm
// Assistant: bg-zinc-100 text-zinc-900, rounded-2xl rounded-bl-sm
// Max width: 85%
// Text: text-[13px] leading-relaxed whitespace-pre-wrap
```

### Follow-up card (Tracker)

```tsx
// Card: bg-white border border-zinc-100 rounded-xl p-4
// Left accent: 3px border-l, color = role color (border-radius: 0)
// Title: text-sm font-medium text-zinc-900
// "Waiting on [name]" — text-xs text-zinc-500
// Day counter: text-xs font-semibold
//   Normal: text-zinc-400
//   Stale (>3 days): text-orange-500 with orange dot
// Resolve button: ghost, "Mark received"
// Nudge button: ghost, "Follow up →"
```

### File upload zone

```tsx
// Dashed border: border-2 border-dashed border-zinc-200 rounded-xl
// Hover: border-zinc-300 bg-zinc-50
// Icon: Upload cloud (Lucide)
// Text: "Drop files or tap to upload"
// Subtext: "PDF, Word, images up to 10MB"
// Active/dragging: border-blue-400 bg-blue-50
```

### Morning pick screen

```tsx
// Full page, no bottom nav visible
// Title: day name, text-2xl font-bold
// Role progress: 6 small bars at top, fill with role color as you progress
//   (But this is NOT a forced walkthrough — it's a single scrollable screen)
// All tasks grouped by role sections
// Role section header: role chip + task count
// Each task: tap to toggle isToday (checkbox fills with role color)
// "Go" button: fixed bottom, full-width, bg-blue-600 text-white rounded-2xl
//   py-4 text-base font-semibold
// "Skip" link: text-zinc-400 text-sm, below the Go button
```

### Confirmation screen (after AI extract)

```tsx
// Card per category: Tasks, Follow-ups, Decisions, Key Quotes
// Each item: checkbox (pre-checked) + text
// Uncheck to reject an extracted item
// "Confirm" button saves only checked items
// "Discard all" link
```

### Draft variants (AI draft)

```tsx
// 2-3 cards stacked vertically
// Each card: border border-zinc-200 rounded-xl p-4
// Label badge: "Direct", "Softer", "Formal" etc
// Message text: text-sm font-mono (feels like actual message)
// "Copy" button on each: ghost button, copies to clipboard
// Toast on copy: "Copied to clipboard"
```

## Animations

### Task completion
```tsx
// Framer Motion: animate={{ opacity: 0, x: 80, scale: 0.95 }}
// Duration: 0.4s, ease: "easeOut"
// After animation: remove from list (set done: true)
// Optional: subtle haptic on mobile (navigator.vibrate(10))
```

### View transitions
```tsx
// Page transitions: fade-in-up, 200ms
// Use Framer Motion AnimatePresence for tab switching
```

### Active block pulse
```tsx
// CSS animation: pulse-dot 2s ease-in-out infinite
// 8px circle, role color
```

## Dark mode

Support dark mode via Tailwind `dark:` variants. shadcn/ui handles this natively with CSS variables. Use `next-themes` for toggle.

Key overrides in dark mode:
- Page bg: zinc-950
- Card bg: zinc-900
- Borders: zinc-800
- Text primary: zinc-100
- Text secondary: zinc-400
- Role light colors: darken to role-color/10 opacity on dark bg
- Chat user bubble: stays blue-600
- Chat assistant bubble: zinc-800

## Responsive — mobile-first, desktop-full

This app is used on 3 devices: iPhone (primary mobile), Mac Air (laptop), Mac Pro (desktop, full-screen). Build mobile-first, then expand for desktop.

### Breakpoints

```typescript
// tailwind.config.ts
screens: {
  'sm': '640px',   // phone landscape
  'md': '768px',   // tablet / small laptop
  'lg': '1024px',  // desktop — layout shifts here
  'xl': '1280px',  // large desktop (Mac Pro full-screen)
}
```

### Mobile (default, < 1024px)

- Max width: 480px centered
- Single column layout
- Bottom nav (fixed, 64px)
- All touch targets: minimum 44px
- Views stack vertically
- Chat input at bottom with camera + input + send
- Full-width cards, no sidebars
- File upload: full-width drop zone

### Desktop (≥ 1024px)

Layout shifts to a **two-panel design** that fills the screen:

```
┌──────────────────────────────────────────────────────┐
│  Top bar: role selector + settings gear + clock      │
├─────────────────────┬────────────────────────────────┤
│                     │                                │
│  Sidebar (280px)    │  Main content (flex-1)         │
│                     │                                │
│  • Focus view       │  Expands to fill available     │
│  • Quick stats      │  width. No max-width cap.      │
│  • Coming up blocks │                                │
│  • Role nav pills   │  Shows the active view:        │
│                     │  inbox, tracker, AI chat,      │
│                     │  settings, or expanded focus   │
│                     │                                │
├─────────────────────┴────────────────────────────────┤
│  (no bottom nav on desktop — nav moves to sidebar)   │
└──────────────────────────────────────────────────────┘
```

**Sidebar (desktop only, 280px fixed width):**
- Always-visible mini focus view: current block, role, time
- "Coming up" next 2-3 blocks
- Navigation: Focus | Inbox | Tracker | AI (vertical list, not bottom tabs)
- Settings gear at bottom of sidebar
- Role color accent on left edge

**Main panel (desktop, flex-1, no max-width):**
- Fills remaining screen width
- Content area has max-width: 720px centered within the panel (readable line length)
- AI chat: messages area fills height, input pinned to bottom of panel
- Tracker: can show role groups side-by-side in a grid on wide screens
- Inbox: textarea and file zone can be wider and side-by-side
- Settings: two-column layout (role list left, edit form right)

**Desktop-specific enhancements:**
- No bottom nav (moves to sidebar)
- Keyboard shortcuts: `1-4` for nav tabs, `n` for new task, `⌘+Enter` to send in AI chat
- Wider cards with more horizontal space for task text
- Follow-up tracker can show a proper table layout instead of stacked cards
- Morning pick: role sections display as a grid (2-3 columns) instead of single stack

### Layout components

```tsx
// src/components/AppShell.tsx
// Wraps the entire app, switches between mobile and desktop layout

// Mobile: bottom nav + single content area (max-w-[480px] mx-auto)
// Desktop: sidebar + main panel (no max-width on outer, 720px max on content)

// Use Tailwind responsive:
// <div className="lg:hidden"> — mobile bottom nav
// <div className="hidden lg:flex"> — desktop sidebar
// <main className="lg:ml-[280px]"> — main content shifts right on desktop
```

```tsx
// Example responsive pattern
<div className="max-w-[480px] mx-auto lg:max-w-none lg:ml-[280px]">
  <div className="lg:max-w-[720px] lg:mx-auto">
    {/* Content */}
  </div>
</div>
```

### Critical: no content behind nav
- Mobile: `padding-bottom: 80px` on all pages (clears bottom nav)
- Desktop: no bottom padding needed (sidebar is on the left)

## PWA

```json
// public/manifest.json
{
  "name": "Conductor",
  "short_name": "Conductor",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#2563eb",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

---

# PART 3: DATABASE

## Prisma schema

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model Role {
  id            String         @id
  name          String
  title         String
  platform      String
  priority      Int
  color         String
  tone          String?
  context       String?
  staff         Staff[]
  tasks         Task[]
  followUps     FollowUp[]
  notes         Note[]
  transcripts   Transcript[]
  fileUploads   FileUpload[]
  conversation  Conversation?
  createdAt     DateTime       @default(now())
  updatedAt     DateTime       @updatedAt
}

model Staff {
  id           String  @id @default(cuid())
  roleId       String
  role         Role    @relation(fields: [roleId], references: [id])
  name         String
  title        String
  relationship String?
  commNotes    String?
  email        String?
  slackHandle  String?
}

model Task {
  id         String    @id @default(cuid())
  roleId     String
  role       Role      @relation(fields: [roleId], references: [id])
  title      String
  priority   String    @default("normal")
  isToday    Boolean   @default(false)
  done       Boolean   @default(false)
  doneAt     DateTime?
  sourceType String?   // "transcript" | "file" | null (manual)
  sourceId   String?   // ID of the Transcript or FileUpload this was extracted from
  createdAt  DateTime  @default(now())
  updatedAt  DateTime  @updatedAt

  @@index([roleId, done])
  @@index([isToday, done])
}

model FollowUp {
  id          String    @id @default(cuid())
  roleId      String
  role        Role      @relation(fields: [roleId], references: [id])
  title       String
  waitingOn   String
  status      String    @default("waiting")
  dueDate     DateTime?
  staleDays   Int       @default(3)
  resolvedAt  DateTime?
  sourceType  String?   // "transcript" | "file" | null (manual)
  sourceId    String?
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  @@index([roleId, status])
}

model Note {
  id        String   @id @default(cuid())
  roleId    String
  role      Role     @relation(fields: [roleId], references: [id])
  content   String
  tags      String[]
  createdAt DateTime @default(now())

  @@index([roleId, createdAt])
}

model Transcript {
  id        String   @id @default(cuid())
  roleId    String
  role      Role     @relation(fields: [roleId], references: [id])
  rawText   String
  summary   String?
  createdAt DateTime @default(now())
}

model FileUpload {
  id            String   @id @default(cuid())
  roleId        String
  role          Role     @relation(fields: [roleId], references: [id])
  filename      String
  mimeType      String
  size          Int
  storagePath   String
  extractedText String?
  summary       String?
  createdAt     DateTime @default(now())

  @@index([roleId])
}

model Conversation {
  id        String   @id @default(cuid())
  roleId    String   @unique
  role      Role     @relation(fields: [roleId], references: [id])
  messages  Json     // [{role, content, timestamp, attachments?}]
  updatedAt DateTime @updatedAt
  // NOTE: If a single conversation exceeds ~100 messages, consider
  // migrating to a separate Message model for queryability and pagination.
  // For 6 conversations, JSON is fine for a long time.
}

model ScheduleOverride {
  id      String   @id @default(cuid())
  blockId String
  day     String
  roleId  String
  weekOf  DateTime
  // NOTE: Default schedule is hardcoded in src/lib/schedule.ts, NOT in the database.
  // ScheduleOverride only stores user deviations from the defaults.
}
```

---

# PART 4: AI ARCHITECTURE

## Context assembly (5 layers, ~5-8K tokens per request)

### Layer 1: System prompt (~500 tokens, always)
Static role definitions, waterfall, schedule, behavioral instructions.

### Layer 2: State snapshot (~1K tokens, always)
From Postgres: today's date, current block, today's tasks by role, active follow-up count with stale flags.

### Layer 3: Role context (~2K tokens, when in a role)
Active role's tone, staff directory (all names/titles/relationships/commNotes), last 5 notes, role context field.

### Layer 4: Retrieved context (~2-4K tokens, on demand)
Targeted Postgres queries: relevant notes, transcript summaries, staff records based on user's question.

### Layer 5: User message + attachments
Question, transcript, file content, or screenshot.

## Conversation context
For persistent role threads: Layers 1-3 + last 10 messages from history + new user message. If user references something older, search full history and inject into Layer 4.

## AI extract endpoint
Processes transcript/screenshot/file → returns structured JSON (tasks, follow-ups, decisions, key quotes) → user confirms → saves to Postgres.

## AI draft endpoint
Looks up recipient in staff directory → pulls recent notes about topic → drafts in role tone → returns 2-3 variants.

## File processing
- Images (PNG, JPG, WEBP): base64 to Claude API
- PDFs: text via pdf-parse
- Word docs (.docx): text via mammoth
- Text files (.txt, .md, .csv): read directly
- Max 10MB per upload
- Stored at UPLOAD_DIR, extracted text in DB

---

# PART 5: API ROUTES

### Auth
- `POST /api/auth/signin`

### Roles
- `GET /api/roles`
- `PUT /api/roles/[id]`
- `GET /api/roles/[id]/staff`
- `POST /api/roles/[id]/staff`
- `PUT /api/roles/[id]/staff/[staffId]`
- `DELETE /api/roles/[id]/staff/[staffId]`

### Tasks
- `GET /api/tasks?roleId=X&today=true`
- `POST /api/tasks`
- `PUT /api/tasks/[id]`
- `DELETE /api/tasks/[id]`
- `POST /api/tasks/select-today` — batch set isToday
- `POST /api/tasks/reset-today` — clear all isToday

### Follow-ups
- `GET /api/followups?roleId=X&status=waiting`
- `POST /api/followups`
- `PUT /api/followups/[id]`
- `GET /api/followups/stale`

### Notes
- `GET /api/notes?roleId=X&limit=10`
- `POST /api/notes`
- `GET /api/notes/search?q=term`

### Files
- `POST /api/files/upload`
- `GET /api/files?roleId=X`

### Conversations
- `GET /api/conversations/[roleId]`
- `POST /api/conversations/[roleId]/message`
- `POST /api/conversations/[roleId]/upload`
- `DELETE /api/conversations/[roleId]`

### AI utility
- `POST /api/ai/extract`
- `POST /api/ai/draft`
- `POST /api/ai/reconfigure`

**Rate limiting on AI endpoints:** Implement a simple in-memory rate limiter (e.g., 20 requests per minute per endpoint). A stuck frontend retry loop must not burn through Claude API credits. Use a Map with timestamps — no external dependency needed for single-user.

---

# PART 6: FRONTEND VIEWS

### 1. Focus (default, `/`)
- Current block: role name in role color, time, pulsing dot
- Today's tasks for current role only
- Complete → Framer Motion slide-out → removed from list
- "All clear" empty state with pull-from-backlog option
- Minimal "coming up" — next 2-3 blocks (role dot + name + time)
- Off-the-clock: "Day starts at 7:30" / "Family time" / "Done for today"

### 2. Inbox (`/inbox`)
- Large textarea: "Paste a transcript, notes, or anything..."
- File upload drop zone: images, PDFs, Word docs
- Role selector (dropdown with role chips)
- "Process" → AI extract → confirmation screen with accept/reject per item
- Quick-add buttons: manual task or follow-up without AI

### 3. Tracker (`/tracker`)
- Follow-ups ONLY (not tasks)
- Grouped by role (expandable sections with role chip headers)
- Each: title, waiting on, day counter, stale badge
- Tap to resolve → disappears
- Nudge button → opens draft composer for follow-up message
- Filter pills: All | Stale | per-role

### 4. AI (`/ai`)
- Role tabs at top — all 6 roles as horizontal scrollable pills
- Persistent chat thread per role
- File upload inline (camera button + file picker)
- Chat bubbles (user blue, assistant zinc)
- Last 10 messages loaded, older scrollable
- Quick prompts below empty state: "What's next?" | "Draft a message" | "What's stale?"
- Extract button — when AI identifies action items, tap to save as tasks/follow-ups
- Clear conversation option (in dropdown menu)

### 5. Settings (`/settings`, gear icon accessible from any view)
- Per-role expandable sections:
  - Staff directory: list with add/edit/remove
  - Tone: textarea
  - Context: textarea
- Schedule template editor: grid, tap cell to change role
- Reset today button
- Data management

### Navigation

**Mobile (< 1024px):** Bottom nav with 4 tabs: Focus | Inbox | Tracker | AI. No badge counts. Lucide icons: Crosshair, Inbox, ListChecks, Sparkles.

**Desktop (≥ 1024px):** Left sidebar (280px fixed). Nav is a vertical list with role color accents. Current block always visible at top of sidebar. Coming-up blocks shown below nav. Bottom nav hidden via `lg:hidden`.

Settings gear accessible from both: top-right on mobile, bottom of sidebar on desktop.

### Morning flow
On new day (no isToday tasks):
- Focus shows "Start your day" interstitial
- All undone tasks across all roles, grouped by role (waterfall order)
- Urgent tasks prominent
- Tap to mark for today (no limit)
- "Go" button → focus mode
- "Skip" → straight to focus mode

### End of day (silent)

**Trigger mechanism:** Middleware check on every API request. Compare current date against a `lastResetDate` value (stored in a lightweight DB row or cookie). If the date has changed, run the reset before processing the request:
- Set `isToday = false` on all tasks where `done = false`
- Update any FollowUps past their `staleDays` threshold to `status = "stale"`
- Update `lastResetDate` to today

This means the first request of each new day triggers the cleanup automatically — no cron job needed. No UI shown to the user.

---

# PART 7: SEED DATA

```typescript
// prisma/seed.ts

import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const roles = [
    {
      id: 'zeta', name: 'Zeta', title: 'UI Director / Staff Engineer',
      platform: 'Slack', priority: 1, color: '#2563eb',
      tone: 'Technical, hands-on, IC-level. Direct and efficient. Code-focused.',
      context: 'Highest-paying role. Deep UI/frontend work. Async, no mandatory meetings.',
    },
    {
      id: 'healthmap', name: 'HealthMap', title: 'Principal UI Architect',
      platform: 'Teams', priority: 2, color: '#0d9488',
      tone: 'Architectural, strategic. Focus on system design and patterns.',
      context: 'Second highest pay. Best efficiency ratio.',
    },
    {
      id: 'vquip', name: 'vQuip', title: 'CTO (3% equity)',
      platform: 'Slack', priority: 3, color: '#7c3aed',
      tone: "Strategic, CTO-level. Delegate, don't do. Frame decisions, don't raise concerns. Use 'we' not 'I'. Direct with Cam, supportive with Gates.",
      context: 'Bluefields insurance tech. 3% equity, long-term hold. Meetings 10:30am-3pm. Three unfilled seats: QA, Architect, DevOps — absorbing this work.',
    },
    {
      id: 'healthme', name: 'HealthMe', title: 'Sr UI Engineer',
      platform: 'Slack', priority: 4, color: '#d97706',
      tone: 'Professional, collaborative. Standard senior engineer communication.',
      context: 'Mid-tier. Compress hours with Claude Code.',
    },
    {
      id: 'xenegrade', name: 'Xenegrade', title: 'Sr Engineer',
      platform: 'Slack', priority: 5, color: '#57534e',
      tone: 'Minimal, efficient. Low-touch communication.',
      context: 'Low maintenance. Tail block / evening work.',
    },
    {
      id: 'reacthealth', name: 'React Health', title: 'Sr Node/NestJS Engineer',
      platform: 'Teams', priority: 6, color: '#e11d48',
      tone: 'Minimal, task-focused.',
      context: 'Lowest touch. Minimal hours. Node/NestJS backend.',
    },
  ];

  for (const role of roles) {
    await prisma.role.upsert({
      where: { id: role.id },
      update: role,
      create: role,
    });
  }

  // vQuip staff
  const vquipStaff = [
    { name: 'Cam', title: 'CEO', relationship: 'My boss. In-office.', commNotes: 'Short Slack messages. Direct, brief. Cc on client-facing.' },
    { name: 'Jake Serigne', title: 'VP Technology / Product', relationship: 'Peer. In-office with Cam. Owns product roadmap.', commNotes: 'Structured communication. Has proximity advantage.' },
    { name: 'Gates', title: 'Dev Manager', relationship: 'My direct report. Manages day-to-day dev.', commNotes: 'Supportive tone. Delegate clearly.' },
    { name: 'Trey', title: 'Project Lead', relationship: 'Reports through Gates.', commNotes: '' },
    { name: 'Luke', title: 'Project Lead', relationship: 'Reports through Gates.', commNotes: '' },
    { name: 'Sufian', title: 'QA / Help Desk', relationship: 'Newer team member.', commNotes: 'Scope role carefully.' },
    { name: 'David Serigne', title: 'Finance', relationship: 'AR/AP, budgeting.', commNotes: '' },
    { name: 'Manuel Almenara', title: 'Programs', relationship: 'Cross-functional coordination.', commNotes: '' },
    { name: 'Jack Freudenthal', title: 'Loss Control', relationship: 'Insurance operations.', commNotes: '' },
  ];

  for (const s of vquipStaff) {
    await prisma.staff.create({ data: { ...s, roleId: 'vquip' } });
  }

  // Create empty conversations for each role
  for (const role of roles) {
    await prisma.conversation.create({
      data: { roleId: role.id, messages: [] },
    });
  }

  console.log('Seeded successfully');
}

main().catch(console.error).finally(() => prisma.$disconnect());
```

Add to `package.json`:
```json
{
  "prisma": {
    "seed": "ts-node --compiler-options {\"module\":\"CommonJS\"} prisma/seed.ts"
  }
}
```

---

# PART 8: LOCAL DEVELOPMENT

## Prerequisites
- Node.js 20+
- Docker (for Postgres)
- Anthropic API key

## docker-compose.yml

```yaml
version: '3.8'
services:
  postgres:
    image: postgres:16-alpine
    ports:
      - "5432:5432"
    environment:
      POSTGRES_USER: conductor
      POSTGRES_PASSWORD: localdev
      POSTGRES_DB: conductor
    volumes:
      - pgdata:/var/lib/postgresql/data

volumes:
  pgdata:
```

## .env.local

```bash
DATABASE_URL=postgresql://conductor:localdev@localhost:5432/conductor
NEXTAUTH_SECRET=local-dev-secret-change-in-prod
NEXTAUTH_URL=http://localhost:3000
APP_PASSWORD_HASH=$2a$10$GENERATE_THIS_WITH_BCRYPT
ANTHROPIC_API_KEY=sk-ant-your-key
UPLOAD_DIR=./uploads
```

## Getting started

```bash
# 1. Start Postgres
docker compose up -d

# 2. Install dependencies
npm install

# 3. Init shadcn/ui
npx shadcn@latest init
npx shadcn@latest add button card input textarea select badge dialog sheet tabs avatar separator dropdown-menu toast scroll-area

# 4. Generate Prisma client + migrate + seed
npx prisma migrate dev --name init
npx prisma db seed

# 5. Create uploads dir
mkdir -p uploads

# 6. Generate password hash
node -e "const b=require('bcryptjs');console.log(b.hashSync('YOUR_PASSWORD',10));"
# Paste output into .env.local APP_PASSWORD_HASH

# 7. Run dev server
npm run dev
# → http://localhost:3000
```

## Environment detection

```typescript
const UPLOAD_DIR = process.env.UPLOAD_DIR || (
  process.env.NODE_ENV === 'production'
    ? '/opt/conductor/uploads'
    : './uploads'
);
```

---

# PART 9: AWS INFRASTRUCTURE (CDK)

## Overview
- EC2 t3.small (Ubuntu 24), PostgreSQL 16, Node.js 20, Nginx, PM2
- Elastic IP (survives stop/start)
- EventBridge + Lambda: start 6 AM / stop 9 PM ET, Monday–Friday
- ~$13/month

## Project structure

```
/infra
  ├── bin/app.ts
  ├── lib/command-center-stack.ts
  ├── package.json
  ├── tsconfig.json
  └── cdk.json
```

## infra/bin/app.ts

```typescript
#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { CommandCenterStack } from '../lib/command-center-stack';

const app = new cdk.App();
new CommandCenterStack(app, 'CommandCenterStack', {
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: 'us-east-1' },
});
```

## infra/lib/command-center-stack.ts

```typescript
import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';

export class CommandCenterStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const vpc = ec2.Vpc.fromLookup(this, 'DefaultVpc', { isDefault: true });

    const sg = new ec2.SecurityGroup(this, 'SG', { vpc, allowAllOutbound: true });
    sg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80), 'HTTP');
    sg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(443), 'HTTPS');
    // SSH: restrict to your IP or remove entirely and use SSM (aws ssm start-session)
    // sg.addIngressRule(ec2.Peer.ipv4('YOUR_IP/32'), ec2.Port.tcp(22), 'SSH');
    sg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(22), 'SSH — restrict to your IP in prod');

    const role = new iam.Role(this, 'Role', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
      managedPolicies: [iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore')],
    });

    const userData = ec2.UserData.forLinux();
    userData.addCommands(
      '#!/bin/bash', 'set -euo pipefail',
      'apt-get update && apt-get upgrade -y',
      'curl -fsSL https://deb.nodesource.com/setup_20.x | bash -',
      'apt-get install -y nodejs postgresql postgresql-contrib nginx certbot python3-certbot-nginx',
      'systemctl enable postgresql && systemctl start postgresql',
      "sudo -u postgres psql -c \"CREATE USER conductor WITH PASSWORD 'cc_prod_pw';\"",
      'sudo -u postgres psql -c "CREATE DATABASE conductor OWNER conductor;"',
      'npm install -g pm2',
      'mkdir -p /opt/conductor/uploads && chown -R ubuntu:ubuntu /opt/conductor',
      'cat > /etc/nginx/sites-available/conductor << \'NGINX\'',
      'server { listen 80; server_name _; client_max_body_size 10M;',
      '  location / { proxy_pass http://127.0.0.1:3000; proxy_http_version 1.1;',
      '    proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection "upgrade";',
      '    proxy_set_header Host $host; proxy_set_header X-Real-IP $remote_addr;',
      '    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;',
      '    proxy_set_header X-Forwarded-Proto $scheme; } }',
      'NGINX',
      'ln -sf /etc/nginx/sites-available/conductor /etc/nginx/sites-enabled/',
      'rm -f /etc/nginx/sites-enabled/default && systemctl reload nginx',
      'env PATH=$PATH:/usr/bin pm2 startup systemd -u ubuntu --hp /home/ubuntu',
    );

    const instance = new ec2.Instance(this, 'CC', {
      vpc, instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.SMALL),
      machineImage: ec2.MachineImage.fromSsmParameter(
        '/aws/service/canonical/ubuntu/server/24.04/stable/current/amd64/hvm/ebs-gp3/ami-id'),
      securityGroup: sg, role, userData,
      blockDevices: [{ deviceName: '/dev/sda1', volume: ec2.BlockDeviceVolume.ebs(30, { volumeType: ec2.EbsDeviceVolumeType.GP3, encrypted: true }) }],
      keyPair: this.node.tryGetContext('keyPair')
        ? ec2.KeyPair.fromKeyPairName(this, 'KP', this.node.tryGetContext('keyPair')) : undefined,
    });

    const eip = new ec2.CfnEIP(this, 'EIP', { instanceId: instance.instanceId });

    const fn = new lambda.Function(this, 'Sched', {
      runtime: lambda.Runtime.PYTHON_3_12, handler: 'index.handler', timeout: cdk.Duration.seconds(30),
      code: lambda.Code.fromInline(`
import boto3,os
ec2=boto3.client('ec2');IID=os.environ['INSTANCE_ID']
def handler(e,c):
  a=e.get('action','')
  if a=='start':ec2.start_instances(InstanceIds=[IID])
  elif a=='stop':ec2.stop_instances(InstanceIds=[IID])
  return{'status':'ok','action':a}
`),
      environment: { INSTANCE_ID: instance.instanceId },
    });

    fn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['ec2:StartInstances', 'ec2:StopInstances'],
      resources: [`arn:aws:ec2:${this.region}:${this.account}:instance/${instance.instanceId}`],
    }));

    // SCHEDULE: 6 AM start / 9 PM stop ET
    // These UTC hours are correct for EDT (Mar-Nov). During EST (Nov-Mar),
    // the schedule shifts to 5 AM / 8 PM ET. To fix: update hour to '11' / '2'
    // in November, back to '10' / '1' in March. Or make the Lambda timezone-aware.
    new events.Rule(this, 'Start', {
      schedule: events.Schedule.cron({ minute: '0', hour: '10', weekDay: 'MON-FRI' }),
      targets: [new targets.LambdaFunction(fn, { event: events.RuleTargetInput.fromObject({ action: 'start' }) })],
    });
    new events.Rule(this, 'Stop', {
      schedule: events.Schedule.cron({ minute: '0', hour: '1', weekDay: 'TUE-SAT' }),
      targets: [new targets.LambdaFunction(fn, { event: events.RuleTargetInput.fromObject({ action: 'stop' }) })],
    });

    new cdk.CfnOutput(this, 'InstanceId', { value: instance.instanceId });
    new cdk.CfnOutput(this, 'PublicIP', { value: eip.ref });
    new cdk.CfnOutput(this, 'SSH', { value: `ssh -i ~/.ssh/key.pem ubuntu@${eip.ref}` });
  }
}
```

## infra/package.json

```json
{
  "name": "command-center-infra",
  "scripts": { "deploy": "cdk deploy", "destroy": "cdk destroy" },
  "dependencies": { "aws-cdk-lib": "^2.170.0", "constructs": "^10.0.0", "source-map-support": "^0.5.21" },
  "devDependencies": { "@types/node": "^20.0.0", "typescript": "~5.6.0", "aws-cdk": "^2.170.0" }
}
```

## infra/cdk.json
```json
{ "app": "npx ts-node bin/app.ts" }
```

## infra/tsconfig.json
```json
{ "compilerOptions": { "target": "ES2020", "module": "commonjs", "strict": true, "outDir": "./cdk.out" }, "exclude": ["node_modules", "cdk.out"] }
```

## Deploy infrastructure

```bash
cd infra && npm install && cdk deploy -c keyPair=your-key-pair
```

## Deploy app to EC2

```bash
rsync -avz --exclude=node_modules --exclude=.next --exclude=uploads \
  ./ ubuntu@ELASTIC_IP:/opt/conductor/

ssh ubuntu@ELASTIC_IP << 'EOF'
  cd /opt/conductor && cp .env.production .env
  npm install && npx prisma migrate deploy && npx prisma db seed && npm run build
  pm2 delete conductor 2>/dev/null || true
  pm2 start npm --name conductor -- start && pm2 save
EOF
```

## .env.production

```bash
DATABASE_URL=postgresql://conductor:cc_prod_pw@localhost:5432/conductor
NEXTAUTH_SECRET=GENERATE_WITH_openssl_rand_-base64_32
NEXTAUTH_URL=https://your-domain.com
APP_PASSWORD_HASH=$2a$10$your-hash
ANTHROPIC_API_KEY=sk-ant-your-key
UPLOAD_DIR=/opt/conductor/uploads
NODE_ENV=production
```

## SSL
```bash
ssh ubuntu@ELASTIC_IP
sudo certbot --nginx -d your-domain.com --non-interactive --agree-tos -m you@email.com
```

---

# PART 10: PROJECT STRUCTURE

```
conductor/
├── prisma/
│   ├── schema.prisma
│   ├── seed.ts
│   └── migrations/
├── src/
│   ├── app/
│   │   ├── globals.css
│   │   ├── layout.tsx
│   │   ├── page.tsx                    # Focus view
│   │   ├── inbox/page.tsx
│   │   ├── tracker/page.tsx
│   │   ├── ai/page.tsx
│   │   ├── settings/page.tsx
│   │   └── api/
│   │       ├── auth/[...nextauth]/route.ts
│   │       ├── roles/...
│   │       ├── tasks/...
│   │       ├── followups/...
│   │       ├── notes/...
│   │       ├── files/...
│   │       ├── conversations/...
│   │       └── ai/...
│   ├── components/
│   │   ├── ui/                         # shadcn/ui components
│   │   ├── AppShell.tsx                # Responsive layout wrapper (mobile bottom nav / desktop sidebar)
│   │   ├── Sidebar.tsx                 # Desktop sidebar (hidden on mobile)
│   │   ├── FocusView.tsx
│   │   ├── MorningPick.tsx
│   │   ├── TaskItem.tsx
│   │   ├── InboxProcessor.tsx
│   │   ├── FollowUpCard.tsx
│   │   ├── ChatThread.tsx
│   │   ├── RoleTabs.tsx
│   │   ├── FileUpload.tsx
│   │   ├── DraftVariants.tsx
│   │   ├── BottomNav.tsx
│   │   ├── ConfirmExtract.tsx
│   │   └── ScheduleGrid.tsx
│   └── lib/
│       ├── ai-context.ts               # 5-layer context assembly
│       ├── file-processor.ts            # PDF/docx/image extraction
│       ├── schedule.ts                  # Block detection, defaults
│       ├── prisma.ts                    # Prisma client singleton
│       ├── auth.ts                      # NextAuth config
│       └── utils.ts                     # shadcn/ui cn() helper
├── public/
│   ├── manifest.json
│   └── sw.js
├── infra/                              # CDK (see Part 9)
├── uploads/                            # Local dev file uploads
├── docker-compose.yml
├── .env.local
├── .env.production
├── tailwind.config.ts
├── next.config.js
├── package.json
├── tsconfig.json
└── components.json                     # shadcn/ui config
```

---

# PART 11: BUILD ORDER

1. **Foundation:** Next.js scaffold + Tailwind + shadcn/ui init + Prisma schema + docker-compose + migrations + seed + auth
2. **Focus view:** Block detection + today's tasks + completion animation (Framer Motion) + morning pick screen
3. **Task management:** CRUD + backlog + isToday toggling + role grouping
4. **AI conversations:** Persistent threads per role + context assembly (lib/ai-context.ts) + file uploads in chat
5. **Inbox:** Transcript/file paste + AI extract + confirmation screen
6. **Tracker:** Follow-ups + staleness detection + nudge-to-draft
7. **Drafting:** AI draft endpoint + tone/staff lookup + variant cards + copy
8. **Schedule:** Week grid + block overrides
9. **Settings:** Staff directory CRUD + role tone/context editing
10. **PWA + polish:** Service worker + manifest + dark mode + final responsive pass
