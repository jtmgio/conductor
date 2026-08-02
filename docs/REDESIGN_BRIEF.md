# Conductor v2 — Design Brief

*Paste this into claude.ai/design (or any design tool) as the source of truth. Generate one screen at a time, in the order listed.*

---

## What this app is

Conductor is a **single-user personal cockpit** for an engineer holding multiple concurrent jobs (4 active companies + 1 personal app project). It answers one question all day: **"What am I doing right now, and is everything else okay?"**

It is NOT a project management tool. Per-project depth (meeting prep, docs, stakeholder intel) lives elsewhere. Conductor is: today's plan, to-dos, things I'm waiting on from others, mandatory reminders, and a message formatter.

## The user (design for this person, not a generic user)

- Neurodivergent, anxiety-driven. Compulsively checks Slack/Teams across all companies (~every 5 min) out of fear of being "behind" or "in trouble."
- The redesign's core job: **replace the anxiety patrol with visible facts.** Every screen should answer "you're okay, it's handled" at a glance — with evidence, not cheerleading.
- Works 9:00 AM–3:45 PM in hourly-ish blocks, one company per block.

## Non-negotiable design rules

1. **No badge counts. No numbers on nav. Ever.** Counts create anxiety.
2. **Completed tasks disappear.** Slide-out animation, gone. No "completed" section, no daily totals, no streaks.
3. **Follow-ups are not tasks.** Separate surface entirely.
4. **One company at a time.** The current block's role dominates; other companies appear only as a calm "all clear" line.
5. **No guilt mechanics.** No overdue reds screaming, no "you missed X." Stale items get one quiet indicator.
6. **The "anti-badge":** where other apps show alarm counts, Conductor shows explicit safety — "Nothing due. No one waiting."
7. Dark theme is the primary design target (a warm and a light variant exist). Current palette uses CSS variables: deep neutral surfaces, soft off-white text, per-company accent colors, amber for reminders.
8. All touch targets ≥ 44px. Responsive: mobile (bottom nav) + desktop (slim sidebar).

## Navigation (5 items max)

Today · Board · Tracker · Formatter · Settings

---

## Screen 1 — TODAY (the cockpit, default screen — most important)

One screen, no scrolling hunt. Zones top to bottom:

**A. Current block header.** Big, calm. Company name in its accent color, block time range ("Zeta · 9:30–10:30"), and a subtle progress indication of where we are in the block. This is the "what am I doing right now" anchor.

**B. The ONE next task** for the current company. Large card, single task, checkbox. Below it, collapsed/small: the rest of today's tasks for this company. Never show other companies' tasks here.

**C. Comms cover strip.** A quiet persistent line:
> ✓ Comms covered · next sweep in 22 min (10:30)
This is the permission-not-to-check-Slack signal. When a sweep is due it flips to a gentle "Sweep now — 5 min" state (amber, not red). Never a modal nag.

**D. All-clear line for the other companies.** One row, tiny:
> vQuip ✓ quiet · Healthmap ✓ quiet · HealthMe ✓ quiet
"Quiet" = nothing due today, no stale follow-ups. If a company does have something due, it shows the single fact ("vQuip · 1 due today") — a fact, not an alarm.

**E. Agenda strip.** Today's meetings as a horizontal timeline chips row (time, title, company color). Already exists; keep the concept.

**F. Quick capture.** Always-reachable input ("dump a thought…"). Thought typed → filed to the right company automatically (AI infers). This is the exit ramp that makes NOT switching companies cheap.

**G. Medication reminder banner** (existing pattern, keep): amber pill banner slides up bottom-center at reminder time with a "Taken" button. E.g. "Take vitamins · 9:45."

## Screen 2 — BLOCK TRANSITION (full-screen moment, auto-appears between blocks)

A 20-second ritual, not a dialog. Full-screen calm takeover:

1. "vQuip block complete." (no summary of what got done — just closure)
2. "Anything open in your head?" — one text field, park stray thoughts (filed automatically)
3. "Sweep comms — 5 min" — checklist of the 4 companies to glance (Slack/Teams), check them off
4. "Next: Zeta · 10:30–11:30" with THE one next task shown
5. One button: "Start Zeta"

This replaces both the old 30-min check-in modal (retired) and silent block changes.

## Screen 3 — BOARD (to-dos)

Kanban: Backlog / In Progress / In Review / Blocked. Filterable to one company (default: current block's company). Task cards show: title, company color edge, due date only if one exists, source icon (Linear / calendar / MCP) small. Quick-add at top with AI refine (raw thought → clean title + notes + checklist). Done tasks animate out and are gone.

## Screen 4 — TRACKER (follow-ups / waiting-on)

List of things I'm waiting on FROM other people. Each: who, what, company color, "asked 3 days ago." Stale ones (> N days) get one quiet amber dot — this is the app's ONLY proactive alert. Actions: nudge (opens Formatter pre-filled), got-it (resolve, disappears), snooze.

## Screen 5 — FORMATTER

The message formatter as a first-class surface. Left: raw draft textarea. Pick company + platform (Slack / Teams / Email / SMS). Right: rewritten message in my voice with that company's tone, rendered in platform-correct formatting. One "Copy" button. History of recent formats below (small).

## Settings (keep simple, existing 4-tab structure is fine)

Roles · Profile · Integrations (Linear/Granola/Calendar) · System (schedule editor, reminders manager, backups).

---

## What was deliberately removed (do not design these)

AI chat/conversations, documents library, transcripts viewer, drafts page, any dashboard/analytics, any completed-tasks view, any counts anywhere.

## Existing data (real shapes to design against)

- **Companies (roles):** name, accent color, platform (Slack or Teams), priority order. Currently: vQuip, Zeta, Healthmap, HealthMe (+ TrainBetter personal project, Wris/Xen mostly automated).
- **Schedule blocks:** label, start–end, company per weekday. Current day: 9:00–3:45, 8 blocks.
- **Tasks:** title, notes, checklist, status, due date, company, source (linear/calendar/granola/mcp/manual), isToday flag.
- **Follow-ups:** who, what, company, asked-on date, status.
- **Reminders:** label, time, weekdays, acknowledged-today. ("Take vitamins" 9:45 M–F, "Take TRT" 9:50 M/F.)
- **Meetings:** time, title, company (from macOS calendar sync).
