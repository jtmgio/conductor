# Handoff prompt — Conductor v2 build

*Copy everything below the line into a fresh Claude Code (Opus) session opened in `~/projects/jtmg/conductor`.*

---

You are executing the **Conductor v2 rebuild** end to end. The direction is fully decided and specced — your job is faithful execution, not redesigning the plan.

## Before writing any code

Read these completely, in order:

1. `CLAUDE.md` (repo root) — architecture, conventions, integrations, deployment
2. `docs/SPEC_V2.md` — **the engineering source of truth.** Every feature, API shape, deletion list, build phase, and acceptance criterion is in there. When this prompt and the spec disagree, the spec wins.
3. `docs/REDESIGN_BRIEF.md` — the visual/UX source of truth for the new screens

Do not start until you've read all three. Do not re-litigate decisions recorded in them.

## Who this is for (read spec §0 — but the short version)

Single user, neurodivergent, anxiety-driven — he compulsively checks Slack across 4 companies every ~5 minutes out of fear of being behind. v2's entire purpose is to **replace that anxiety patrol with visible facts**: a "comms covered, next sweep at HH:MM" strip, per-company all-clear facts, and a block-transition ritual. Every implementation choice must serve calm. If you're ever choosing between two options, pick the quieter one.

## Hard rules (violating any of these is a failed build)

1. **No badge counts, no numbers on nav, anywhere. Ever.** No overdue-red states. Completed tasks animate out and are gone — no completed views, totals, or streaks. Amber is the only alert color, and only where the spec says.
2. **The all-clear line must never lie.** On API failure render nothing — never a stale or default "quiet."
3. **Database:** the real DB is the shared `postgres` Docker container (`conductor:localdev@postgres:5432/conductor` on the `postgres_default` network). NEVER drop, recreate, or reset it. NEVER run `prisma migrate dev` (shadow-DB reset risk). Host-side `prisma migrate deploy` fails with P1010 — apply migrations exactly as documented in spec §2: `docker exec -i postgres psql` + manual `_prisma_migrations` insert (checksum = sha256 of migration.sql), following the `20260720100000_add_reminders` precedent.
4. **Schema changes are additive only.** Do not drop models, columns, or data — orphaned models stay (spec §11).
5. **Do not touch** port 11435 / anything `kosmos` (another team's production MLX server). Conductor's local AI is port 11436 only.
6. **The MCP server (`src/app/api/mcp/`) and all sync plumbing (Linear, Granola, Calendar/EventKit, cron sidecar) must keep working untouched.** They are load-bearing for other sessions and automations.
7. **Deletions (Phase 6) require a grep audit first.** For every file on the spec §8 delete list: `grep -r` its imports across `src/` before deleting. Anything imported by a KEEP surface gets untangled first. The spec flags known traps (`ai/extract`, `transcripts/` sync endpoints, `ConfirmExtract`, `NoteEditor`) — verify each, don't trust the list blindly. All deletions in their own isolated commit.
8. **Conventions:** shadcn/ui primitives, Framer Motion for all animation, Lucide icons, CSS variables (`var(--surface)` etc., dark theme primary), Prisma singleton from `src/lib/prisma.ts`, 44px touch targets, no `console.log`. Match the style of neighboring code.

## Start here — setup (do this BEFORE Phase 1)

1. **Branch.** The working tree may have uncommitted changes and you'll be on `main`. Do NOT build on `main` and do NOT sweep pre-existing changes into your commits. Confirm the tree is clean (if not, stop and ask the user to commit/stash first), then cut a branch: `git checkout -b feat/v2`. All v2 work lands here; `main` stays a clean rollback point.
2. **Confirm the database.** The app talks to the shared `postgres` container, NOT Homebrew Postgres and NOT the old in-project one (both are stale). Verify: `docker exec -i postgres psql -U conductor -d conductor -c "select count(*) from \"Role\";"` returns rows. If it errors, stop and ask — do not point the app anywhere else.
3. **Auth reality (critical for testing).** Every API route except the MCP endpoint is behind NextAuth. **`curl` against a route returns HTTP 401 — that is EXPECTED and means the route exists and auth works, not that it's broken.** To actually exercise a route's logic you must be logged in: open `http://localhost:5402` in a browser, sign in with the app password (single-user credentials provider), and test through the UI or a browser session that carries the session cookie. Never conclude a route is broken from a bare `curl` 401. If you need the app password and don't have it, ask.

## Execution

Work through **spec §9 phases 1–7 strictly in order**, one phase at a time:

1. Backend foundations (migration, `/api/comms-cover` + `sweep`, `/api/all-clear`, reminders POST/PATCH)
2. Comms UI (strip + sweep panel; retire the old 30-min check-in modal + `useCheckInTimer`)
3. Block-transition ritual
4. Today rebuild + all-clear line + quick capture
5. Formatter page + nav slim to 5 items + shortcut remap
6. Deletions (isolated commit, grep-audited)
7. Restyle Board/Inbox/Tracker/Settings to the new design language

After **every** phase:
- `npx tsc --noEmit` → clean
- `docker compose up -d --build` → then confirm you're looking at the **freshly recreated** container before trusting its logs: `docker ps` should show `conductor-conductor-1` with an uptime of *seconds*, not hours. (A stale "✓ Ready" from the pre-rebuild container is a known false positive — the old container can answer while the new one is still building.) Only then trust `docker compose logs conductor | tail` showing `✓ Ready`.
- Click-test the surfaces you touched through the logged-in browser (app is at `http://localhost:5402`; see auth note above — a bare `curl` 401 is not a failure).
- Commit with a clear message (`feat: …` / `refactor: …` / `chore: remove …`) on the `feat/v2` branch. One phase = one coherent commit set. Do not push unless asked.

Never start phase N+1 with phase N red.

Phase 6 (deletions) is the only irreversible-feeling phase — it runs on `feat/v2`, so `main` is always your escape hatch. Keep it a standalone commit so it can be reverted in isolation if a cut turns out to be load-bearing.

## Design input

If mockup screenshots or an exported HTML/artifact mockup are provided in the conversation, follow them for Phases 4–7 — **but the hard rules and the "serve calm" principle outrank the mockups.** If any mockup contains a badge, a count, a productivity chart, a dashboard, an overdue-red state, or anything else the rules forbid, port the *layout* and silently drop the offending element — do not reproduce a rule violation because a mockup showed it. Mockups are a visual reference for structure and styling, not a license to break §1.

If no mockups are provided yet, build the screens from `REDESIGN_BRIEF.md` using the app's existing CSS-variable design language — structure per the brief, styling consistent with current components (see `MedicationReminders.tsx` for the reference amber treatment and card idiom). Don't block on missing mockups; Phases 1–3 are design-independent — start there.

## When done (or blocked)

- Verify against **spec §10's ten acceptance criteria** one by one and report each with evidence (command output, screenshot, or route response) — behavioral checks, not "it renders."
- Also verify criterion 8's sync health: `docker compose logs conductor-cron` clean + `bash cron/calendar-sync.sh` succeeds.
- If genuinely blocked or the spec is ambiguous on something material: stop and ask. Do not invent scope, do not add features from spec §11's out-of-scope list, do not "improve" the plan. Small ambiguities → pick the simpler, quieter option and note it in your report.

Begin with Phase 1.
