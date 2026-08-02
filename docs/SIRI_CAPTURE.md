# Hands-free capture on iPhone — Siri Shortcut + Home-screen widget

Say *"Hey Siri, add to Conductor"*, speak a task, and it files itself (MLX cleans the
title, infers the company, extracts the due date). Also works as a one-tap home-screen
widget. No app, no typing.

## How it works

It POSTs to a simple REST endpoint on the tower — `POST /api/capture` — with a bearer
token. Same MLX refine + company inference as everything else; an unsure company falls
back to your current schedule block, then your top-priority company, and the response
tells you where it landed so Siri can read it back.

```
POST http://joshuas-mac-pro.tail842fd4.ts.net:5402/api/capture
Authorization: Bearer <MCP_API_TOKEN>
Content-Type: application/json
{ "text": "reply to dana about the sailthru scores by friday" }
→ { "ok": true, "title": "Reply to Dana about Sailthru scores", "company": "Zeta" }
```

## Prerequisites

- **iPhone on Tailscale** (same tailnet as the tower — the same setup the MCP already uses). Test it works: open `http://joshuas-mac-pro.tail842fd4.ts.net:5402` in Safari on your phone; you should reach Conductor.
- **Your token** — on the tower, grab it: `grep MCP_API_TOKEN ~/projects/jtmg/conductor/.env`. You'll paste this into the Shortcut once.

## Build the Shortcut (one time, ~3 min)

Open the **Shortcuts** app → **+** (new shortcut) → add these actions in order:

1. **Dictate Text**
   - (Optional) set Language to English. This is what captures your spoken task.

2. **Get Contents of URL**
   - URL: `http://joshuas-mac-pro.tail842fd4.ts.net:5402/api/capture`
   - Tap **Show More**:
     - **Method:** `POST`
     - **Headers:** add two —
       - `Authorization` → `Bearer YOUR_TOKEN_HERE`  *(paste your real token after "Bearer ")*
       - `Content-Type` → `application/json`
     - **Request Body:** `JSON`
       - add field: key `text` (type **Text**) → value = the **Dictated Text** variable from step 1

3. **Get Dictionary Value**
   - Get **Value** for `company` in **Contents of URL** (the step-2 output). *(Add a second "Get Dictionary Value" for `title` if you want it in the confirmation.)*

4. **Show Notification** (or **Speak Text**)
   - Text: `Added to [company]` — insert the `company` variable from step 3. (e.g. "Added to Zeta")

5. **Rename the shortcut** (tap its name at top) → **"Add to Conductor"**.
   - The name *is* the Siri phrase, so keep it short and natural.

## Use it

- **Voice:** *"Hey Siri, add to Conductor"* → it prompts, you speak the task → it files and confirms the company.
- **Home-screen widget:** long-press the home screen → **+** → **Shortcuts** widget → pick "Add to Conductor". One tap runs it. (Or in the Shortcut's share sheet → **Add to Home Screen** for an app-style icon.)

## Notes & troubleshooting

- **Off Tailscale = it won't reach the tower.** If capture fails when you're out, that's the VPN, not the app. (An offline queue was deliberately deferred; revisit if it bites.)
- Captured tasks land in that company's **backlog** with `sourceType: "siri"`, so you can spot them. Organize them later on the desktop cockpit / Board.
- If the company guess is wrong (it will be sometimes when you don't name anyone), it still files — just move it on desktop. The refine only cleans the title and pulls the date; you can always fix placement.
- Same endpoint powers a potential **Apple Watch** complication or an automation later — it's just one authed POST.
