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

```
macOS host (M2 Ultra, 128GB)
  ├─ com.kosmos.mlx → ~/mlx-venv/bin/mlx_lm.server
  │     --model mlx-community/Qwen2.5-32B-Instruct-4bit --port 11435 --host 0.0.0.0
  │     (~18GB resident, OpenAI-compatible API)
  └─ Docker: conductor app
        └─ reaches the host via http://host.docker.internal:11435/v1
```

Conductor-side wiring (all in `src/lib/ai-provider.ts`):

- Model ids prefixed `local/` route to the local provider — e.g.
  `local/mlx-community/Qwen2.5-32B-Instruct-4bit`.
- Env vars (set in `docker-compose.yml`, overridable in `.env`):
  - `LOCAL_AI_BASE_URL` — default `http://host.docker.internal:11435/v1`
  - `LOCAL_AI_MODEL` — default `mlx-community/Qwen2.5-32B-Instruct-4bit`; the ONLY id
    `callLocal()` will send
- `createCompletionWithLocalFallback()` — tries the cloud model, falls back to local on
  any error (credits exhausted, network, outage). Used by the **calendar prep-task
  route**; adopt it for other background/structured jobs as needed.
- Chat: "Qwen 2.5 32B (local)" appears in the AI page model selector (`LOCAL_MODELS`
  in `src/app/ai/AIPage.tsx` — a static list; keep in sync with `LOCAL_AI_MODEL`).
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

1. Is the server up? `launchctl list | grep kosmos.mlx` and `curl -s localhost:11435/v1/models`.
   If it's down, that's a **kosmos problem — do not fix it from here.** Conductor degrades
   gracefully: calendar syncs without prep tasks (and retries hourly), chat shows an error.
2. `Local model "X" is not the configured LOCAL_AI_MODEL` — the kosmos stack changed
   which model it serves. Update `LOCAL_AI_MODEL` in `.env`/`docker-compose.yml` AND the
   `LOCAL_MODELS` entry in `AIPage.tsx` to the id reported by `/v1/models`, rebuild.
3. Timeouts under load — the server processes requests serially; a long kosmos job can
   queue Conductor's request past the 120s client timeout. Transient; background jobs
   retry on the next cycle.
4. `host.docker.internal` unreachable — Docker Desktop provides it on macOS; if the app
   runs outside Docker use `http://localhost:11435/v1`.

### Model swapped by the kosmos team

`GET /v1/models` is the source of truth. Sync the two Conductor config points to it
(env var + `AIPage.tsx`) — never the other way around; Conductor adapts to kosmos.

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

## Running a dedicated Conductor server (optional, if sharing ever bites)

Only if contention with kosmos becomes a real problem. This adds a SECOND server and
model — it does not touch the kosmos one.

```bash
# 1. Own venv — never reuse ~/mlx-venv
python3 -m venv ~/conductor-mlx-venv && ~/conductor-mlx-venv/bin/pip install mlx-lm

# 2. Pick a DIFFERENT port (11436) and a bursty MoE model
~/conductor-mlx-venv/bin/mlx_lm.server \
  --model mlx-community/Qwen3-30B-A3B-Instruct-2507-4bit --port 11436 --host 127.0.0.1
# (first run downloads ~16GB; check memory pressure after: `memory_pressure | head -1`)

# 3. Point Conductor at it in .env, then docker compose up -d conductor
LOCAL_AI_BASE_URL=http://host.docker.internal:11436/v1
LOCAL_AI_MODEL=mlx-community/Qwen3-30B-A3B-Instruct-2507-4bit
# ...and update LOCAL_MODELS in src/app/ai/AIPage.tsx, then rebuild

# 4. Persist with a LaunchAgent named com.conductor.mlx (RunAtLoad + KeepAlive),
#    modeled on cron/com.conductor.calendar-sync.plist. Do NOT name it com.kosmos.*.
```

Decision guide: stay on the shared server until you actually observe kosmos latency
complaints or Conductor timeouts. Two models resident is fine for RAM; the GPU is the
contended resource either way, so a second server mostly buys queue isolation.

## History

**2026-07-06** — Built after Anthropic credits ran out and silently killed calendar prep
tasks for a week (see the calendar runbook's incident entry). Discovery: the machine
already ran a production MLX server for kosmos (thought to be "Gemma 3.5", actually
Qwen2.5-32B). Chose to share it as a strict guest rather than run a second server.
Fallback verified end-to-end with Anthropic credits exhausted: calendar sync produced
prep tasks via the local model.
