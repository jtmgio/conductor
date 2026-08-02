# Conductor v2 — Rollout Spec

**Companion docs:** `SPEC_V2.md` (what to build), `REDESIGN_BRIEF.md` (how it looks), `CURRENT_VS_V2.md` (deltas), `PROMPT_V2_BUILD.md` (build handoff). This doc = **how we ship it without breaking the daily driver.**

---

## 0. Context & constraints (these shape the whole plan)

- **Single-user, daily-driver.** One person uses Conductor every working day. There is no user base to stage to — the "rollout" is a *cutover* that must not leave the app broken during working hours.
- **Docker builds from the working tree**, not a git ref. So "deploy" = `docker compose up -d --build` against whatever's checked out. The git branch is for source control + rollback points, not deployment targeting.
- **Shared production Postgres.** The real DB is the shared `postgres` container (`conductor:localdev@postgres:5432/conductor`). All v2 migrations are **additive only** (no drops), so old and new code both run against the same schema safely.
- **Never `prisma migrate dev`; host `migrate deploy` hits P1010.** Apply migrations via `docker exec -i postgres psql` + a manual `_prisma_migrations` record (sha256 of the SQL) — the pattern already used for every v2 migration.
- **Do not touch** the kosmos MLX server (:11435) or other domains' containers.

## 1. Current state (as of this spec)

- Branch **`feat-v2`** holds all v2 work; **`main`** is the clean pre-v2 rollback point.
- The **live 5402 container is a working hybrid**: new backend already shipped and running (comms-cover + sweep, all-clear API, block-transition ritual, tiered reminders with escalation) **+ the old FocusView/nav** (Today not yet rebuilt). This hybrid is stable and in daily use — the additive backend didn't disturb the old UI.
- **Built & live already (SPEC_V2 Phases 1–3 + reminders):** migrations `add_comms_cover`, `add_reminders`, `add_reminder_icon_duration`, `add_reminder_tier` (all applied + recorded); `/api/comms-cover`, `/api/all-clear`, `/api/reminders` CRUD; `CommsCoverStrip`, `BlockTransition`, `Reminders` components wired into `AppShell`.
- **Not yet built (Phases 4–7 + locked lifecycle decisions):** the Today rebuild (one-thing cockpit), async capture + refine, rollover resurfacing, Formatter page, nav slim-to-5, the deletions, restyle.

## 2. Rollout strategy — two tracks

**Track A — additive backend (DONE, shipped incrementally).** Because comms/all-clear/reminders are additive and don't alter the old UI, they were safe to build straight on `feat-v2` and rebuild 5402 live. That's why they're already running. No further ceremony.

**Track B — the UI rebuild + deletions (the risky part).** Rebuilding the primary screen and deleting five page trees will pass through broken intermediate states. This must NOT run on the live 5402 container. Instead: **build and dogfood v2 on a parallel container/port against the same DB, then cut 5402 over in one clean step.**

Why parallel-against-same-DB is safe here: the deletions remove *code/routes*, never *data* (models stay per the additive rule), so both containers reading/writing the one DB can't corrupt each other's data — it's the same single user's data either way. A pre-cutover backup is still taken as insurance.

## 3. Parallel dogfood setup (Track B)

```bash
# 1. A git worktree so the build has its own checkout, leaving your daily branch alone
git worktree add ../conductor-v2 feat-v2

# 2. A compose override that runs a second stack on :5403, same DB, distinct project name
#    (docker-compose.v2.yml: port 5403:3000, NEXTAUTH_URL=http://localhost:5403,
#     same DATABASE_URL, no cron sidecar — the live stack's cron is enough)
cd ../conductor-v2
docker compose -p conductor-v2 -f docker-compose.v2.yml up -d --build
```

- **5402 = stable, your daily app.** Untouched during the whole Track B build.
- **5403 = v2 in progress.** You do real work in it when you feel like dogfooding; bugs there never touch 5402.
- Both hit the same Postgres. Additive schema means both boot clean.
- Each Phase (4→7) is built in the worktree, `npx tsc --noEmit` clean, container rebuilt on 5403, verified logged-in, committed. Never start phase N+1 with N red.

## 4. Build sequence (remaining — from SPEC_V2 §9, with locked decisions folded in)

1. **Today rebuild** — one-thing cockpit, auto-promote, start-next-early, all-clear line, agenda, comms strip integrated. Remove the capacity panel + MorningBriefing. (Silent start.)
2. **Capture** — async NL capture + refine (verbatim-instant, refine-in-background), tap-to-fix on desktop, ⌘N, in-app company inference.
3. **Rollover** — carry-over breadcrumb (additive migration), in-context per-company resurfacing, one-tap today/push/drop; remove EodPlanningPrompt + MorningPick.
4. **Formatter page** + nav slim to 5 (Today · Board · Tracker · Formatter · Settings) + shortcut remap; Settings reminders-manager (incl. tier/timing).
5. **Deletions** (isolated commit, grep-audited): `/ai`, `/documents`, `/drafts`, `/docs`, all of `/meetings` (+ MeetingPrepPanel, ChatThread, NoteEditor, DocumentViewer, DraftVariants, etc.). Keep formatter, meeting alert/takeover, Granola sync.
6. **Restyle** Board/Inbox/Tracker/Settings to the cockpit design language + mobile capture (FAB + prominent voice + fire-and-forget).

## 5. Data & migrations

- Each new migration (only the rollover breadcrumb remains) is additive, applied via the `docker exec psql` + manual `_prisma_migrations` pattern.
- **Backup before cutover:** `bash cron/backup.sh` (dumps Postgres to `backups/`). Also verify the daily backup LaunchAgent is current.
- No data is dropped at any point. Orphaned models (`Conversation`, `Skill`, `Note`, `Transcript`, `Draft`) stay in the DB — pruned in a later, deliberate cleanup once v2 is proven, never during the cutover.

## 6. Verification gate (must pass before cutover)

Dogfood v2 on 5403 for **at least one full working day**, logged in, checking SPEC_V2 §10 acceptance criteria plus:
- One-thing flow: complete → next promotes; start-next-early works; rollover items resurface per-company with one-tap triage.
- Capture: ⌘N + mobile capture land instantly; refine fills in async; company inference + "which company?" fallback correct.
- Three signal tiers all fire correctly (comms sweep, tiered reminders + critical takeover, meeting takeover).
- Sync health: `docker compose logs conductor-cron` clean; `bash cron/calendar-sync.sh` succeeds; a Granola meeting still auto-creates tasks; MCP `create_task`/`format_message` still work from an external session.
- Deleted routes 404; formatter + meeting alerts still work.

## 7. Cutover procedure (the one clean step)

Do it at end of a working day (lowest disruption):
```bash
# 1. Backup
bash cron/backup.sh

# 2. Merge v2 to main (rollback point preserved)
git checkout main && git merge --no-ff feat-v2

# 3. Rebuild the live 5402 stack from the merged code
docker compose up -d --build
#    confirm the FRESH container (uptime = seconds, not hours) shows "✓ Ready"

# 4. Tear down the parallel dogfood stack + worktree
docker compose -p conductor-v2 down
git worktree remove ../conductor-v2
```
Next morning you open 5402 and it's full v2.

## 8. Rollback plan

- **Fast rollback (minutes):** `git checkout main~1` (the pre-merge commit) → `docker compose up -d --build`. `main` before the merge is the last known-good hybrid.
- Because the merge is `--no-ff`, the whole v2 cutover is one revertible commit: `git revert -m 1 <merge-sha>` → rebuild.
- **Deletions are the isolated-commit escape hatch:** if a cut turns out to be load-bearing after cutover, `git revert` just that Phase-5 commit and rebuild — the rest of v2 stays.
- Data is never rolled back (additive-only); a rollback is purely a code/container revert. If ever needed, `backups/` has the pre-cutover dump.

## 9. Mobile / MCP setup (separate track, no deploy)

These are iOS-side config against the **existing** MCP endpoint (`/api/mcp`, reachable over Tailscale) — do them anytime, independent of the cutover:
- **Siri voice-capture:** an Apple Shortcut ("Add to Conductor") that takes dictated text and POSTs it to MCP `create_task`. Add a Siri phrase.
- **Home-screen widget:** a Shortcuts widget that opens/fires the same Shortcut — one tap from the home screen.
- **In-app mobile FAB + voice + fire-and-forget** ships with Phase 6 (part of the build, not iOS config).
- Deferred (user-declined): share-sheet, offline queue. Revisit if capture-on-no-signal bites.

## 10. Post-cutover cleanup (later, deliberate — not part of rollout)

- Prune orphaned models/data once v2 is proven for a few weeks (a dedicated migration, run with the user present per DB-safety norms).
- Update `CLAUDE.md` to reflect the v2 nav/features and removed pages.
- Mirror to EC2 only if the remote instance is still used (EventKit calendar sync doesn't run there; screenshot upload was cut — note that gap if EC2 matters).

## 11. Risk register

| Risk | Mitigation |
|---|---|
| Broken build breaks daily driver during Track B | Parallel 5403 stack; 5402 untouched until cutover |
| A deletion removes something load-bearing | Grep-audit before deleting; isolated Phase-5 commit; `git revert` that commit |
| Migration re-run/rejected on rebuild | All migrations pre-recorded in `_prisma_migrations` with verified sha256; `migrate deploy` reports "no pending" |
| Meeting alert loses its target (panel deleted) | Alert rewired to the takeover, not the panel (per SPEC decisions) |
| Sync/MCP regression | Explicit gate item #6; test before cutover |
| Data loss | Additive-only; pre-cutover `cron/backup.sh`; no destructive SQL anywhere in v2 |
