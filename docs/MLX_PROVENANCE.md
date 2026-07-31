# MLX / model-server provenance (tower)

Read-only archaeology of the four always-listening model servers on the tower
(Mac Pro, M2 Ultra, 128 GB). Reconstructs why each exists, who actually consumes
it (from client config, not service labels), and whether its original reason still
holds. Companion to `RUNBOOK_LOCAL_AI.md`. Every claim is cited; anything
unsourced is marked **inference** or listed under Explicit unknowns.

## Summary table

| Service (port) | Created | Original rationale | Current consumer(s) | Still valid? |
|---|---|---|---|---|
| **Ollama :11434** | homebrew plist `2026-07-02`; replaced by Ollama.app `2026-07-19` | Local backend for kosmos Assist "local" mode (data residency) — trinity `6c2d4b52` (2026-07-02) | kosmos Assist local — **dormant** (default backend `anthropic`); vquip incident-report web (`isLocalHost` dev-only); vquip-chat-gpt sandbox; arena-SMS `OLLAMA_*` fallback | Partial — need exists but dormant; **72B model has no consumer (orphaned)** |
| **MLX 32B :11435** (`com.kosmos.mlx`) | plist `2026-07-02 18:02`; `~/bin/kosmos-mlx.sh` 18:56 | **No first-party provenance found** (see unknowns) | **vquip arena SMS** `proto-sms-intake` only — **live** | Questionable — labeled kosmos, actually arena SMS |
| **MLX 30B :11436** (`com.conductor.mlx`) | plist `2026-07-06 09:03`; commits `2f68ba6`→`d85175e` (2026-07-06) | Conductor's own text-AI server, off the shared kosmos GPU; MoE for short GPU occupancy | **Conductor app only** — live | **Yes** — deliberate, documented |
| **Vision VL-7B :11438** (`com.vquip.arena.vision`) | `~/arena-vision-server.py` `2026-07-17 16:18` | Image/document classification for insurance incident reports (file header) | **vquip arena SMS** `proto-sms-intake` — live | **Yes** — provenance is file header only |

## Per-service detail (sourced)

**:11436 Conductor — fully sourced.** `docs/RUNBOOK_LOCAL_AI.md` + commits `2f68ba6`
"local MLX fallback via shared kosmos server" (07-06 08:41) → `d85175e` "dedicated
Conductor MLX server (Qwen3-30B-A3B)" (07-06 09:44). Qwen3-30B-A3B chosen for MoE
speed / short GPU occupancy (runbook). Consumers: Conductor only —
`src/lib/ai-provider.ts:38`, `docker-compose.yml:19`, `docker-compose.v2.yml:26`
(`LOCAL_AI_BASE_URL=http://host.docker.internal:11436/v1`). *Lazy-load impact:*
Conductor chat cold-start latency only.

**:11438 Vision — sourced to code, not to a spec.** Header of `~/arena-vision-server.py`:
"Arena document-classification server. Loads Qwen2.5-VL-7B once… POST /classify…
Localhost-only; a separate process from kosmos/conductor MLX." Hand-rolled, **not in
git**, no spec/PRD/handoff found. Consumers: arena SMS `proto-sms-intake/src/vision.ts:16`
(`VISION_BASE_URL`), `test/setup.ts:21` (defaults `127.0.0.1:11438`). *Lazy-load
impact:* first-classification latency; ~5 GB, low upside.

**:11434 Ollama — sourced.** kosmos Assist Ollama provider, trinity `6c2d4b52`
(2026-07-02). Config `~/projects/zeta/trinity/config/services/kosmos/kosmos.pkl:57,61,64`:
`assist_local_base_url → localhost:11434/v1`, default backend `"anthropic"`.
Consumers: kosmos Assist local — dormant (behind `assist_provider=="local"`);
vquip incident-report `config.js:21` (`isLocalHost`-gated); vquip-chat-gpt sandbox
`config.yaml:10`; arena-SMS `.env` `OLLAMA_*`. **72B model: no consumer found.**
Measured 2026-07-31: `ollama ps` returned **no loaded models** — Ollama lazy-loads
and unloads after `keep_alive`, so these weights are **not resident at idle**.

**:11435 — provenance gap, stated plainly.** `~/bin/kosmos-mlx.sh` (execs
`mlx_lm.server --model …Qwen2.5-32B-Instruct-4bit --port 11435 --host 0.0.0.0`) is
**hand-rolled, not version-controlled**, created 2026-07-02. **No commit, spec, PRD,
handoff, or Command Center doc explains why it exists.** The only doc mentioning it —
the Conductor runbook — described it as "kosmos/trinity production via cloudflared
tunnel," which the evidence contradicts (below). Consumer:
`defense-hub-arena-sms/apps/proto-sms-intake/.env:8-9`
(`OPENAI_BASE_URL=http://localhost:11435`, `OPENAI_MODEL=mlx-community/Qwen2.5-32B-Instruct-4bit`,
pinned), read by `src/extract.ts:28`. **Live, single consumer.** *Lazy-load impact:*
arena SMS first-extraction cold-start (~30 s load). *Inference:* the `--host 0.0.0.0`
bind hints at an original intent to serve it over the network/tunnel, never wired up.

## Surprising — name-vs-reality mismatches

1. **`com.kosmos.mlx` (:11435) is misattributed.** No trinity/kosmos code references
   `:11435` or `mlx` (the `git -S 11435` hits are ZIP-code data — 11435 is a Queens
   ZIP); the cloudflared tunnel exposes `:8011/:5474/:5475`, not `:11435`
   (`~/.cloudflared/config.yml`); kosmos Assist uses Anthropic/Ollama. Its only real
   consumer is a vquip single-stream SMS proto.
2. **The Conductor runbook's safety contract rested on that misattribution** — the
   "never touch :11435" rule is correct, but the stated owner (kosmos/tunnel) was
   wrong. Corrected in `RUNBOOK_LOCAL_AI.md`.
3. **`com.kosmos.watchdog` does not watch :11435.** `~/bin/kosmos-watchdog.sh`
   health-checks Docker + the trinity review stack, nothing MLX. :11435's only
   resilience is launchd `KeepAlive`.
4. **Ollama's 67 GB is not resident at idle** (`ollama ps` empty, 2026-07-31),
   reframing the swap picture.
5. **`defense-hub-arena-sms` is a git *worktree* of `defense-hub-arena`**, not a
   standalone repo — they share one object store; commits differ only by branch.
6. **Duplicate arena repos** both hold `proto-sms-intake`; the `-sms` worktree is
   live (`com.vquip.arena.sms`). `extract.ts:28` still comments `11437` (the retired
   arena-mlx) while `.env` points at `11435`.

## Explicit unknowns

- **Why :11435 was created** — no first-party source. Same-day (07-02) as the Ollama
  Assist provider and the now-disabled homebrew `com.kosmos.ollama`, so plausibly part
  of that day's local-AI setup — but that is **inference, not evidence**.
- **72B Ollama model consumer** — none found.
- **Whether kosmos Assist's local (Ollama) toggle is ever enabled in a deployed
  config** — only the `anthropic` default is visible in-repo.
- **Command Center** (`~/projects/zeta/ux-modernization/command-center`) — **no
  references** to any of these ports/services/models.

*The gaps above are the point. No plausible rationale has been invented to fill them.*
