# Runbook — Local AI (shared MLX server)

How Conductor uses the local MLX model server, the safety contract around it, and how to
operate/extend it. Companion to `docs/RUNBOOK_CALENDAR_SYNC.md`.

## ⚠️ The one thing you must know first

**The MLX server on port 11435 is NOT Conductor's.** It belongs to the kosmos/trinity
production stack (`~/projects/kosmos`, `~/projects/zeta/trinity`), runs under the
LaunchAgent `com.kosmos.mlx` (with `com.kosmos.watchdog` beside it), serves live traffic
through a cloudflared tunnel, and must never go down. Conductor is a **guest**: an HTTP
client and nothing more.

The safety contract:

| Rule | Why |
|------|-----|
| Never restart, kill, or reconfigure the server (PID owned by `com.kosmos.mlx`) | Production outage |
| Never touch `~/mlx-venv` (no pip install/upgrade) | The server runs from it |
| Never send a model id other than the one loaded | `mlx_lm.server` will try to download/load a model named in a request — a multi-GB RAM/GPU spike on the prod box. `callLocal()` in `ai-provider.ts` hard-rejects mismatches for this reason. |
| Keep requests modest (max_tokens ≤ 8K, 120s timeout) | Requests queue serially; a runaway generation delays kosmos traffic |
| Verify state with read-only calls only (`GET /v1/models`, `ps`, `launchctl list`) | Everything else is intrusive |

## Current setup

Conductor runs its **own dedicated MLX server** (since 2026-07-06). The kosmos server is
no longer used by Conductor at all — the safety contract above still applies to it forever.

```
macOS host (M2 Ultra, 128GB)
  ├─ com.kosmos.mlx → ~/mlx-venv/bin/mlx_lm.server                    [KOSMOS — HANDS OFF]
  │     --model mlx-community/Qwen2.5-32B-Instruct-4bit --port 11435 --host 0.0.0.0
  ├─ com.conductor.mlx → ~/conductor-mlx-venv/bin/mlx_lm.server       [OURS]
  │     --model mlx-community/Qwen3-30B-A3B-Instruct-2507-4bit --port 11436 --host 127.0.0.1
  │     (~16GB resident, MoE ~3B active params — fast generation, short GPU occupancy)
  └─ Docker: conductor app
        └─ reaches OUR server via http://host.docker.internal:11436/v1
```

Why Qwen3-30B-A3B: mixture-of-experts with ~3B active parameters per token — generates
several times faster than the dense 32B, so chat feels responsive and each request holds
the shared Metal GPU briefly (the GPU is still one physical resource shared with kosmos;
short occupancy is the courtesy that matters).

Conductor-side venv pins (mirrors the known-good kosmos combo — latest mlx-lm + latest
transformers were incompatible as of 2026-07-06, `AttributeError ... __module__` on import):
`mlx-lm==0.31.3 transformers==5.12.1` on Python 3.13 (3.14 also broken with latest).

Manage OUR server (never the kosmos one):
```bash
launchctl list | grep conductor.mlx                     # status
tail -20 logs/mlx-server.log                            # server log
launchctl unload ~/Library/LaunchAgents/com.conductor.mlx.plist   # stop
launchctl load ~/Library/LaunchAgents/com.conductor.mlx.plist     # start
```

Conductor-side wiring (all in `src/lib/ai-provider.ts`):

- Model ids prefixed `local/` route to the local provider — e.g.
  `local/mlx-community/Qwen2.5-32B-Instruct-4bit`.
- Env vars (set in `docker-compose.yml`, overridable in `.env`):
  - `LOCAL_AI_BASE_URL` — default `http://host.docker.internal:11436/v1`
  - `LOCAL_AI_MODEL` — default `mlx-community/Qwen3-30B-A3B-Instruct-2507-4bit`; the ONLY
    id `callLocal()` will send
  - `LOCAL_AI_MAX_TOKENS` — output cap per local request (default 2048): keeps chat
    replies inside the 120s client timeout and bounds GPU occupancy per request
- `createCompletionWithLocalFallback()` — tries the cloud model, falls back to local on
  any error (credits exhausted, network, outage). Used by **every text-only AI route**
  (chat, drafts, briefing, calendar prep, extraction from text, summaries, etc.). The
  only cloud-pinned paths are the vision ones: `ai/extract` on images and the calendar
  *screenshot* fallback — a text model can't see, and silently degraded vision output
  is worse than an error. On chat fallback, image attachments become a placeholder note.
- Chat **defaults to the local model** ("Qwen3 30B (local)" — `LOCAL_MODELS[0]` in
  `src/app/ai/AIPage.tsx`, a static list; keep in sync with `LOCAL_AI_MODEL`). Cloud
  models remain selectable in the dropdown and auto-fall-back to local if they fail.
- Local usage is tracked in AiUsage at $0 (`ai-usage.ts` zero-costs `local/*` models).
- Images are dropped with a placeholder note — the local model is text-only. The
  calendar *screenshot* fallback and image uploads still require a cloud vision model.

## Verify it's healthy

```bash
# Is the kosmos server up and what model is loaded? (read-only)
curl -s http://localhost:11435/v1/models | python3 -m json.tool

# End-to-end through Conductor: force a calendar sync; if Anthropic is down/out of
# credits you should see the fallback log line and still get prep tasks + summary
rm -f /tmp/conductor-calendar-last-hash && bash cron/calendar-sync.sh
docker compose logs conductor --since 5m 2>&1 | grep -i "falling back to local"

# Tiny direct smoke test (safe — 30 tokens)
curl -s http://localhost:11435/v1/chat/completions -H "Content-Type: application/json" \
  -d '{"model":"mlx-community/Qwen2.5-32B-Instruct-4bit","max_tokens":30,"messages":[{"role":"user","content":"Reply with exactly: LOCAL OK"}]}'
```

## Failure modes

### Local fallback also fails / chat with local model errors

1. Is OUR server up? `launchctl list | grep conductor.mlx` and
   `curl -s localhost:11436/v1/models`. If down: `tail -30 logs/mlx-server.log`, then
   reload the LaunchAgent (KeepAlive normally restarts it). Meanwhile Conductor degrades
   gracefully: calendar syncs without prep tasks (and retries hourly), chat shows an error.
2. `Local model "X" is not the configured LOCAL_AI_MODEL` — the three config points
   drifted: the plist `--model`, `LOCAL_AI_MODEL` env, and `LOCAL_MODELS` in `AIPage.tsx`
   must all match what `GET /v1/models` reports.
3. Timeouts — the server processes requests serially; long generations queue behind each
   other past the 120s client timeout. `LOCAL_AI_MAX_TOKENS` (default 2048) bounds this.
   Transient; background jobs retry on the next cycle.
4. `host.docker.internal` unreachable — Docker Desktop provides it on macOS; if the app
   runs outside Docker use `http://localhost:11436/v1`.
5. Server crashes on startup with `AttributeError ... __module__` — the venv was
   rebuilt/upgraded onto the broken mlx-lm/transformers combo; reinstall the pins
   (`mlx-lm==0.31.3 transformers==5.12.1`).

## Measured performance (2026-07-06, M2 Ultra 128GB, Qwen3-30B-A3B-4bit)

Benchmarks against the dedicated server, chat-route payload shapes:

| Scenario | Prompt tokens | Time to full reply |
|----------|---------------|--------------------|
| Small prompt, cold | ~150 | ~2s |
| Medium context, cold | ~2.3K | ~4s |
| Chat-scale, cold | ~5.2K | ~6s |
| Chat-scale, warm (prefix cached) | ~5.2K | ~2.8s |

Real in-app chat messages (full 5-layer context + history, measured from logs + AiUsage):

| Message | Prompt | Cache reuse | End-to-end |
|---------|--------|-------------|------------|
| 1st (cold, incl. failed-Sonnet fallback detour) | 8,120 tok | none | ~12s |
| 2nd (direct to local, same thread) | 8,249 tok | ~50% (4.1K reused) | ~10s |

Rules of thumb: prompt processing ≈ 1,000–1,300 tok/s; generation ≈ 110 tok/s shallow,
~60 tok/s at 8K+ context; replies capped at 2,048 tokens. The dense Qwen2.5-32B measured
~8 tok/s generation on the same hardware — the MoE is roughly an order of magnitude faster.

The server keeps a prompt-prefix cache (one slot, last prompt wins). Chat threads are
append-only so consecutive messages in one thread reuse the prefix (~3–5s replies);
any interleaved request — briefing, meeting prep, hourly calendar sync — evicts it and
the next chat message pays the cold cost (~10s). If that ever becomes a real annoyance,
a second small server for background jobs is the fix; live with it first.

## Context limits — load-tested 2026-07-06

The model advertises 256K context; **the hardware does not deliver it.** Load-test ladder
(cold-ish, 60-token replies, dedicated server):

| Prompt tokens | Time to reply | Outcome |
|---------------|---------------|---------|
| 7K | 10.4s | ok |
| 17.7K | 22.3s | ok |
| ~22K (fresh server) | 39.6s | ok |
| 35.4K | 55.7s | ok — practical ceiling |
| ~71K | crashed at ~110s | **SERVER CRASH** |

Findings:

- **Hard limit ≈ 55K tokens of total context: the macOS Metal GPU watchdog kills the
  process** (`[METAL] Command buffer execution failed: Impacting Interactivity`,
  SIGABRT). Not graceful — the request dies with "Remote end closed connection" and
  in-flight requests fail. `KeepAlive` restarts the server within seconds.
- Prompt processing slows as context deepens (attention cost): ~680 tok/s at 7K,
  ~480 at 18K, ~320 at 35K. Extrapolated, a cold ~35–40K request also brushes the app's
  120s client timeout — so the timeout and the crash zone conveniently align.
- Concurrency: 4 parallel ~1.5K-token requests all completed in 8.5s wall — the server
  interleaves fine at small scale. Big requests still serialize.
- Server RSS stays ~8GB regardless (weights live in Metal wired memory, not RSS).
- The kosmos server was unaffected by our crash (separate process), but heavy prompt
  processing hogs the shared GPU — the watchdog fired precisely because interactivity
  suffered. Don't raise the caps below casually.

Layered caps enforcing the safe zone (all env-tunable, defaults in parentheses):

| Guard | Where | Default |
|-------|-------|---------|
| `UPLOAD_EXTRACT_MAX_CHARS` (120K chars ≈ 30K tok) | upload storage + note | keeps any one document inside one safe request |
| `DOC_SUMMARY_MAX_CHARS` (100K chars ≈ 25K tok) | background summarize | one-shot ~60s cold read |
| `LOCAL_AI_MAX_INPUT_CHARS` (160K chars ≈ 40K tok) | `callLocal()` hard guard | trims largest text blocks (never the newest message) with a visible marker — the crash-prevention backstop |
| `LOCAL_AI_MAX_TOKENS` (2048) | `callLocal()` output cap | bounds reply time + GPU occupancy |
| `CLOUD_AI_MAX_TEXT_CHARS` (60K chars/segment) | cloud providers only | cost guard: local-scale documents in history can't produce a surprise cloud bill |

## Choosing local chat models (MLX, this machine)

Headroom math: 128GB total, ~18GB held by the kosmos Qwen server. A second model is
memory-safe well past 70B-class 4-bit (~40GB), but **GPU compute is shared** — while any
local model generates, kosmos inference slows. Keep Conductor's local use bursty.

Verified-available on `mlx-community` (HF, checked 2026-07-06), best chat candidates:

| Model | Size (4-bit) | Notes |
|-------|--------------|-------|
| `Qwen2.5-32B-Instruct-4bit` | ~18GB (already loaded) | **Default — zero extra cost, shares kosmos server** |
| `Qwen3-30B-A3B-Instruct-2507-4bit` | ~16GB | MoE, ~3B active — fastest generation, minimal GPU occupancy per request; best pick for a dedicated server |
| `gemma-4-26b-a4b-it-4bit` | ~14GB | MoE Gemma 4 — same speed rationale |
| `gemma-4-31b-it-4bit` | ~17GB | Dense Gemma 4, stronger writing quality |
| `Llama-3.3-70B-Instruct-4bit` | ~40GB | Best quality of the set; slowest, longest GPU occupancy — most contention with kosmos |

(Note: there is no "Gemma 3.5" — the family goes 3 → 3n → 4. The kosmos server itself
runs Qwen 2.5, not Gemma.)

## Rebuilding the dedicated server on a new machine

This is what's running now (built 2026-07-06). It does not touch the kosmos server.

```bash
# 1. Own venv — never reuse ~/mlx-venv. Pin versions (latest combo is broken, see above)
/opt/homebrew/bin/python3.13 -m venv ~/conductor-mlx-venv
~/conductor-mlx-venv/bin/pip install "mlx-lm==0.31.3" "transformers==5.12.1"

# 2. Pre-download the model (~16GB)
~/conductor-mlx-venv/bin/hf download mlx-community/Qwen3-30B-A3B-Instruct-2507-4bit

# 3. Install the LaunchAgent (repo template: cron/com.conductor.mlx.plist —
#    fix the /path/to placeholders first)
cp cron/com.conductor.mlx.plist ~/Library/LaunchAgents/   # after editing paths
launchctl load ~/Library/LaunchAgents/com.conductor.mlx.plist

# 4. Verify, then check memory headroom
curl -s http://localhost:11436/v1/models | python3 -m json.tool
memory_pressure | head -1

# 5. Conductor env (docker-compose.yml defaults already point here):
#    LOCAL_AI_BASE_URL=http://host.docker.internal:11436/v1
#    LOCAL_AI_MODEL=mlx-community/Qwen3-30B-A3B-Instruct-2507-4bit
#    plus the LOCAL_MODELS entry in src/app/ai/AIPage.tsx must match — then rebuild.
```

Swapping the model later: pick from the table above, `hf download` it, update the plist's
`--model`, reload the LaunchAgent, update `LOCAL_AI_MODEL` + `AIPage.tsx`, rebuild. Keep
the RAM math in mind (kosmos holds ~18GB; stay well under total).

## History

**2026-07-06** — Built after Anthropic credits ran out and silently killed calendar prep
tasks for a week (see the calendar runbook's incident entry). Discovery: the machine
already ran a production MLX server for kosmos (thought to be "Gemma 3.5", actually
Qwen2.5-32B). First shared it as a strict guest; same day, moved to the dedicated
Qwen3-30B-A3B server on 11436 after chat on the dense 32B measured 25s at 4K context.
Then defaulted chat to local and put the local fallback on every text-only route.
Final state verified in production: real chat replies ~10s cold / ~3-5s warm at 8K+
context, all background AI features running locally at $0, kosmos untouched throughout.
