# Runbook — Calendar Sync (macOS EventKit)

How the calendar integration works, how it fails, and how to fix it. Written after the
June 29 – July 6, 2026 outage (see "Incident history" at the bottom for the full story).

## Architecture recap

```
launchd (com.conductor.calendar-sync, hourly on the hour, 7:00–16:00)
  └─ cron/calendar-sync.sh
       ├─ working-hours guard (weekday, 7–16)
       ├─ cron/calendar-events (compiled Swift binary, EventKit) → today's events as JSON
       ├─ 90s watchdog on the read (perl alarm)
       ├─ date-drift guard (abort if the day rolled over mid-run)
       ├─ hash check (/tmp/conductor-calendar-last-hash) → skip POST if events+date unchanged
       └─ POST /api/calendar/process (Docker app on :5402)
            ├─ maps calendar accounts → roles (UserProfile.calendarRoleMappings)
            ├─ Claude Haiku generates prep tasks / conflicts / summary
            └─ 3-phase reconcile: upsert meetings, remove deleted, preserve done prep tasks
```

Key invariants:

- **The compiled binary owns the TCC grant.** `cron/calendar-events` is code-signed with an
  embedded Info.plist so *it* (not the calling shell) holds macOS Calendar permission. That is
  what lets it run headless under launchd.
- **Rebuilding the binary revokes the grant.** New signature = new TCC identity. After any
  rebuild you MUST run the binary once interactively to re-trigger the permission prompt.
- **launchd runs one instance per label.** If a run hangs, every future scheduled run is
  silently skipped until the hung one dies. This is why the script has a 90s watchdog.

## First-response diagnostic checklist

Run these in order — each one localizes the fault to a different layer.

```bash
# 1. Is the LaunchAgent loaded and what did it last exit with?
launchctl list | grep conductor
#    "-  0  com.conductor.calendar-sync"  → loaded, idle, last run OK
#    a PID in the first column            → currently running (or WEDGED — check log timestamps)
#    nonzero second column                → last run failed, read the log

# 2. What does the log say? (timestamps are the tell — look for gaps and stale dates)
tail -30 logs/calendar-sync.log

# 3. Is the app up?
docker compose ps
curl -s http://localhost:5402/api/calendar/last-sync

# 4. Does the EventKit read work right now?
./cron/calendar-events "$(date +%Y-%m-%d)" | head -c 300
#    Hangs → lost TCC grant (see failure mode 1)
#    {"error": ...} → read the error

# 5. Run the whole pipeline by hand and read every line it prints:
bash cron/calendar-sync.sh

# 6. If meetings sync but prep tasks don't (tasksCreated:0, no "summary" in the
#    result), check the app logs for the AI error:
docker compose logs conductor --since 15m 2>&1 | grep -i "prep task\|anthropic"
```

## Failure modes and fixes

### 1. EventKit read hangs → whole label wedged (the June 2026 outage)

**Symptom:** `launchctl list` shows a PID for calendar-sync that never goes away; log shows a
"Starting calendar sync..." line with no completion; no new runs for hours/days.

**Cause:** `cron/calendar-events` was rebuilt, which invalidated its TCC Calendar grant. Under
launchd there is no visible permission prompt, so the EventKit access request hangs forever.
The hung run blocks every subsequent scheduled run (one instance per label).

**Fix:**
```bash
# Kill the wedged run
launchctl list | grep calendar-sync         # get the PID
kill <PID>

# Re-grant: run the binary once interactively — macOS shows the Calendar prompt. Grant it.
./cron/calendar-events "$(date +%Y-%m-%d)"

# Verify end-to-end
bash cron/calendar-sync.sh
```

**Prevention (already in the script):** a 90s perl-alarm watchdog kills a hung read (exit 142)
and logs the rebuild+re-grant instruction. **Rule: any time you rebuild the binary
(`bash cron/build-calendar-events.sh`), immediately run it once interactively.**

### 2. Events written under the wrong date

**Symptom:** log line where the wall-clock date and the "sync for YYYY-MM-DD" date disagree,
e.g. `Mon Jul 6 08:09: Calendar sync success — {"date":"2026-06-29",...}`. Today's Focus page
shows no meetings even though the sync "succeeded".

**Cause:** the script computes `TODAY` at startup. If the process is suspended (sleep, or a
hang like failure mode 1) across midnight, it posts with a stale date.

**Fix:** just run `bash cron/calendar-sync.sh` — it re-syncs today correctly. Stale rows on a
past date are harmless (the UI only surfaces today).

**Prevention (already in the script):** a date-drift guard re-checks the date after the
EventKit read and aborts if it changed.

### 3. Meetings sync but no prep tasks (`tasksCreated: 0`, no summary/conflicts)

**Symptom:** sync result JSON is missing `"summary"` and `"conflicts"`; docker logs show
`Calendar AI prep task generation failed`.

**Cause:** the Claude Haiku call failed — most commonly **Anthropic API credits exhausted**
(`Your credit balance is too low`), or a bad/missing API key.

**Fix:** add credits at console.anthropic.com → Plans & Billing (or fix the key in
Settings > System > API Keys / `ANTHROPIC_API_KEY`). No manual re-sync needed: the script
deliberately does **not** cache the hash for a degraded sync, so the next hourly run retries
prep-task generation automatically. To force it immediately:
```bash
rm -f /tmp/conductor-calendar-last-hash && bash cron/calendar-sync.sh
```

### 4. "Calendar unchanged (hash match), skipping" when you expected a sync

**Cause:** `/tmp/conductor-calendar-last-hash` matches the current events+date. Usually
correct behavior (saves an API call).

**Fix (force a full sync):**
```bash
rm -f /tmp/conductor-calendar-last-hash && bash cron/calendar-sync.sh
```

### 5. LaunchAgent not firing at all

```bash
launchctl list | grep calendar-sync   # nothing? → not loaded
cp cron/com.conductor.calendar-sync.plist ~/Library/LaunchAgents/   # only if missing
# Edit the installed copy: ProgramArguments path, log paths, CONDUCTOR_URL must be real paths
launchctl load ~/Library/LaunchAgents/com.conductor.calendar-sync.plist
```
Note the repo copy of the plist is a template with `/path/to/conductor` placeholders — the
live copy in `~/Library/LaunchAgents/` has the real paths. Runs only fire 7:00–16:00 weekdays;
outside that window "Outside working hours, skipping" in the log is normal.

### 6. Legacy screenshot pipeline (retired)

The pre-EventKit pipeline (`~/conductor-calendar/capture.sh` + `process.sh`, LaunchAgents
`com.conductor.calendar-capture` / `com.conductor.calendar-process`) was retired and its
agents unloaded on 2026-07-06; the plists are archived in `~/conductor-calendar/`. If
`launchctl list | grep conductor` ever shows them again, unload them — they only produce
5 AM screenshot errors. The supported fallback is the screenshot drop zone in
Settings > Integrations > Calendar.

## Script safeguards reference (cron/calendar-sync.sh)

| Guard | What it does | Why |
|-------|--------------|-----|
| Working-hours check | Exit 0 outside weekday 7:00–16:00 | Belt-and-suspenders with the plist schedule |
| 90s watchdog (perl alarm) | Kills a hung EventKit read, exit 142 with rebuild hint | A hung run wedges the launchd label indefinitely |
| Date-drift guard | Abort if `date` changed since startup | Sleep/suspend mid-run posts events under the wrong day |
| Date-in-hash | Hash covers events **and** date | Same events on a new day must still sync |
| Degraded-sync detection | Don't cache hash when result lacks `"summary"` (and there were prep-able meetings) | Prep tasks retry automatically after an AI failure (e.g. credits) |

## Incident history

**2026-06-29 → 2026-07-06 — week-long silent outage.**
The `calendar-events` binary was rebuilt on Jun 29 at 09:27, invalidating its TCC grant. The
10:00 sync hung on the invisible permission request and stayed alive for a week, blocking all
scheduled runs (launchd one-instance-per-label). It finally completed on Jul 6 at 08:09 —
posting with its stale Jun 29 date. Compounding it, Anthropic API credits had run out, so even
after recovery prep tasks silently failed. Diagnosed via the log timestamp gap + the
date mismatch in the success line + `docker compose logs` showing the credits error. Fixes:
killed/completed the wedged run, re-granted TCC, manual re-sync, and added the watchdog,
date-drift, and degraded-sync guards to `calendar-sync.sh`.
