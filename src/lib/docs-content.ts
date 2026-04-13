export interface Article {
  slug: string;
  title: string;
  category: string;
  summary: string;
  content: string; // Markdown-ish content (rendered with simple parser)
}

export interface Category {
  id: string;
  label: string;
  icon: string; // Lucide icon name
  description: string;
}

export const categories: Category[] = [
  { id: "getting-started", label: "Getting Started", icon: "Rocket", description: "How Conductor works and core concepts" },
  { id: "daily-workflow", label: "Daily Workflow", icon: "Clock", description: "Your day from morning to evening" },
  { id: "ai-features", label: "AI Features", icon: "Sparkles", description: "Chat, slash commands, artifacts, drafting" },
  { id: "integrations", label: "Integrations", icon: "Link2", description: "Linear, Granola, and calendar sync" },
  { id: "views", label: "Views & Navigation", icon: "Layout", description: "Focus, Board, Tracker, Inbox" },
  { id: "reference", label: "Reference", icon: "BookOpen", description: "Keyboard shortcuts, settings, roles" },
];

export const articles: Article[] = [
  // === GETTING STARTED ===
  {
    slug: "what-is-conductor",
    title: "What is Conductor?",
    category: "getting-started",
    summary: "A personal productivity OS for managing multiple engineering roles simultaneously.",
    content: `Conductor is a personal productivity operating system built for an engineer managing multiple concurrent engineering roles. It replaces traditional task managers with a system designed around time blocks, role switching, and AI-powered automation.

**Core philosophy:**
- One role at a time. Focus mode shows only the current time block's work.
- Follow-ups are not tasks. Waiting on someone is tracked separately in the Tracker.
- No guilt. End of day is silent — incomplete tasks return to backlog quietly.
- AI does the busywork. Meeting transcripts become tasks and follow-ups automatically.

**Your roles** are configured in Settings > Roles, each with a priority level, color, platform (Slack or Teams), and communication tone. When a time block has no work, Conductor pulls from the highest-priority role that has tasks. This is called the **priority waterfall**.`,
  },
  {
    slug: "schedule",
    title: "The Daily Schedule",
    category: "getting-started",
    summary: "Time blocks divide your day into focused role segments. Fully configurable.",
    content: `Conductor divides each weekday into time blocks that you configure during onboarding or in Settings > System > Schedule.

**Default blocks** (customizable):
- **Morning** — Deep focus work
- **Triage** — Check all communication channels
- **Midday** — Primary meetings / collaboration
- **Afternoon** — Secondary role work
- **Late Afternoon** — Catch-up and async
- **Evening** — Low-touch, optional block

Each block is assigned to a role, and you can set different roles per weekday using the schedule grid.

The sidebar always shows your current block with the role name and color. Focus mode automatically switches to the active role when a new block starts.

Schedule overrides can be configured in Settings > System > Schedule for days when the default doesn't apply.`,
  },
  {
    slug: "priority-waterfall",
    title: "Priority Waterfall",
    category: "getting-started",
    summary: "When a block has no work, pull from the highest-priority role that has tasks.",
    content: `The priority waterfall ensures no time block goes idle when there's work to do.

**How it works:**
If your current block's assigned role has no tasks marked for today, Conductor looks up your roles in priority order (configured in Settings > Roles). The first role with pending today-tasks becomes the active role for that block.

Priority is set per role — priority 1 is highest. When multiple roles have work, the highest-priority role wins.

**This is automatic in Focus mode.** You don't need to manually switch — the system shows you the right work.`,
  },
  {
    slug: "neurodivergent-design",
    title: "Design Principles",
    category: "getting-started",
    summary: "No badge counts, no guilt, no noise. Designed to reduce anxiety.",
    content: `Conductor follows strict neurodivergent-friendly design rules:

**No badge counts.** Numbers on tabs or cards create anxiety about "falling behind." There are no notification dots, no unread counts, no pending item numbers anywhere in the UI.

**Completed tasks disappear.** When you check a task off, it slides away with a smooth animation and is gone from the UI. There is no "completed" section, no history view, no "you finished 12 tasks today" summary. The record stays in the database, but the UI never shows it again.

**Follow-ups are NOT tasks.** "Waiting on someone" is not actionable — putting it in a task list creates a false open loop. Follow-ups live in the Tracker view, completely separate from tasks. The only proactive alert is when a follow-up goes stale (3+ days waiting).

**End of day is silent.** At 5 PM, incomplete tasks quietly return to backlog. No summary, no report, no "you didn't finish X" messaging. Just close the app.

**Focus means ONE role.** The Focus view shows only the current time block's role. No cross-role noise, no reminders about other roles' tasks.`,
  },

  // === DAILY WORKFLOW ===
  {
    slug: "morning-routine",
    title: "Morning Routine",
    category: "daily-workflow",
    summary: "Open Conductor at 7:30 AM. Optionally pick today's tasks, then jump into focus mode.",
    content: `**7:30 AM — Open Conductor**

The Morning Pick screen appears automatically (if enabled). This lets you review each role's backlog and select which tasks you want to tackle today.

- Browse tasks by role
- Tap to mark as "today"
- Hit "Go" to enter Focus view
- Or hit "Skip" to go straight to focus with whatever was already selected

**Morning pick is optional.** You can skip it entirely and work from whatever's already in your today list. No guilt if you skip.

After picking (or skipping), Focus view takes over and shows your current block's tasks.`,
  },
  {
    slug: "focus-mode",
    title: "Focus Mode",
    category: "daily-workflow",
    summary: "One role, one task list. Complete tasks by checking the box — they slide away.",
    content: `Focus is the main view you'll use throughout the day. It shows:

- **Current time block** at the top with the time range
- **Active role** with its color
- **Today's tasks** for that role only

**Working through tasks:**
- Check the checkbox to complete a task — it slides out with a smooth animation
- Click a task title to expand details (notes, checklist, due date, tags)
- Click the status badge to cycle: backlog → in progress → in review → blocked
- Right-click a task to toggle the detail panel

**Block navigation:** Use the < > arrows next to the role name to peek at other blocks' tasks without leaving focus mode.

**View toggle:** Switch between list view and grid view using the icons in the top right.`,
  },
  {
    slug: "processing-transcripts",
    title: "Processing Meeting Transcripts",
    category: "daily-workflow",
    summary: "Paste a transcript or upload a screenshot — AI extracts tasks, follow-ups, and decisions.",
    content: `After a meeting, go to **Inbox** and process the transcript:

1. Select the role this meeting was for
2. Paste the transcript text OR upload a file (screenshot, PDF, Word doc)
3. Hit "Process" — Claude reads the content and extracts:
   - **Tasks** — action items assigned to you
   - **Follow-ups** — things other people owe you (with their name)
   - **Decisions** — important decisions that were made
   - **Key quotes** — notable statements worth saving
4. Review everything on the confirm screen — uncheck anything you don't want
5. Hit "Confirm" — items are saved to the correct role

**Supported formats:** Screenshots (PNG/JPG), PDFs, Word docs (.docx), plain text, CSV, Markdown.

**Tip:** Granola integration can automate this entirely — see the Integrations section.`,
  },
  {
    slug: "tracking-followups",
    title: "Tracking Follow-ups",
    category: "daily-workflow",
    summary: "The Tracker shows who owes you what. Stale items get flagged after 3 days.",
    content: `Follow-ups are things other people owe you. They live in the **Tracker** view, completely separate from your task list.

Each follow-up shows:
- What you're waiting for
- Who you're waiting on
- How many days it's been
- Which role it belongs to

**Stale detection:** After 3 days (configurable per follow-up), the item is marked stale. This is the **only proactive alert** in Conductor — stale follow-ups are highlighted so you know to send a nudge.

**Actions:**
- Mark as received (resolves the follow-up)
- Use the AI to draft a nudge message via the /stale-report slash command

Follow-ups can be created manually or extracted automatically from meeting transcripts.`,
  },
  {
    slug: "drafting-messages",
    title: "Drafting Messages",
    category: "daily-workflow",
    summary: "AI writes messages in your voice. Select a role, describe what you need, get 2-3 variants.",
    content: `Go to the **AI** tab, select a role, and ask Claude to draft a message.

Example: "Draft a message to Sarah about the deployment timeline"

Claude will:
- Match your communication style (configured in Settings > Profile)
- Use the right tone for the role and platform (Slack vs Teams)
- Reference the staff directory to use the right names
- Generate 2-3 variants (Direct, Softer, Formal)

Copy the one you want and paste it into Slack/Teams/email.

**Your voice matters:** The AI uses your communication style from Settings > Profile. The more sample messages you provide, the better it matches your tone.`,
  },

  // === AI FEATURES ===
  {
    slug: "slash-commands",
    title: "Slash Commands",
    category: "ai-features",
    summary: "Type / in the AI chat to access 8 built-in commands that auto-fill with your data.",
    content: `In the AI chat input, type **/** to open the slash command menu. These are pre-built prompts that auto-fill with your real Conductor data.

**Built-in commands:**

**/standup-prep** — Generate standup notes for the current role. Includes today's tasks, yesterday's completed, and stale follow-ups.

**/weekly-summary** — Summarize completed work across all roles this week. Groups by role.

**/draft-update** — Draft a status update for leadership. Pulls responsibilities, goals, in-progress tasks, and blockers.

**/stale-report** — Show all stale follow-ups with suggested nudge messages for each. Includes escalation risk assessment.

**/sprint-plan** — Plan the next sprint from backlog. Prioritizes by quarterly goal alignment, unblocking, and quick wins.

**/meeting-prep** — Prepare for your next meeting. Pulls staff directory, stale follow-ups for attendees, and recent notes.

**/role-switch** — Quick 30-second context brief when switching roles. What's important, what's stale, recent decisions.

**/blocked** — List all blocked tasks across roles with suggestions for unblocking each.

**Custom commands** can be created in Settings > System > Skills.

**Filtering:** Type to filter the menu (e.g., "/stand" shows only /standup-prep). Use arrow keys to navigate, Enter/Tab to select, Escape to dismiss.`,
  },
  {
    slug: "artifacts",
    title: "Artifacts & Visualizations",
    category: "ai-features",
    summary: "AI can return interactive charts, diagrams, and tools that render inline in the chat.",
    content: `When you ask the AI to visualize data, create a diagram, or build an interactive tool, it can return an **artifact** — a live rendered widget inside the chat.

**Examples of what you can ask:**
- "Build me a chart of my task distribution across roles"
- "Create a mermaid diagram of my team structure"
- "Show me a dashboard of my follow-up status"

**Types supported:**
- **HTML** — Charts, dashboards, data visualizations with full CSS/JS
- **React** — Interactive components with Recharts for data viz
- **Mermaid** — Flowcharts, sequence diagrams, entity relationships

**Your real data:** HTML artifacts have access to \`window.CONDUCTOR_DATA\` which contains your actual roles, tasks, follow-ups, and current schedule. The AI can write code that visualizes your real data, not just examples.

Each artifact has a header with "Copy code" and "Expand" buttons.`,
  },
  {
    slug: "model-selection",
    title: "AI Model Selection",
    category: "ai-features",
    summary: "Choose between Sonnet (fast), Haiku (cheapest), and Opus (most capable).",
    content: `The AI chat supports three Claude models, selectable via the dropdown in the top right:

**Sonnet 4.6** (default) — Fast and capable. Best for most tasks: drafting messages, standup prep, general questions.

**Haiku 4.5** — Fastest and cheapest. Good for simple questions, quick lookups, and when you want near-instant responses.

**Opus 4.6** — Most capable. Use for complex analysis, detailed sprint planning, nuanced drafting, or when Sonnet's response isn't quite right.

**Cost tracking:** Every AI call is tracked. View usage and costs in Settings > System > Costs.`,
  },
  {
    slug: "ai-context",
    title: "How AI Context Works",
    category: "ai-features",
    summary: "Every AI call assembles 5 layers of context so Claude knows your roles, tasks, and style.",
    content: `When you send a message in the AI chat, Conductor assembles context in 5 layers before calling Claude:

**Layer 1: System prompt** — Your roles, the priority waterfall, schedule rules, and artifact instructions.

**Layer 1.5: Voice profile** — Your communication style, sample messages, and personal context from Settings > Profile.

**Layer 2: State snapshot** — Today's date, current time block, today's tasks across all roles, active follow-up counts.

**Layer 3: Role context** — The active role's tone, responsibilities, quarterly goals, staff directory, recent notes, and recent transcripts.

**Layer 4: Retrieved context** — Notes and transcripts that match keywords in your message (semantic search).

Plus the **last 10 messages** from your conversation history with that role.

This means Claude always knows: who you are, what role you're in, what you're working on, who your team is, and what your goals are — without you having to re-explain every time.`,
  },

  // === INTEGRATIONS ===
  {
    slug: "linear-integration",
    title: "Linear Integration",
    category: "integrations",
    summary: "Sync Linear issues to Conductor tasks automatically. Hourly, one-way sync.",
    content: `The Linear integration syncs issues assigned to you from a Linear team into Conductor tasks.

**Setup:**
1. Get a Personal API Key from Linear Settings > Security & Access
2. Find your Team ID and User ID (run the GraphQL queries from the setup guide)
3. Go to Settings > Integrations > Connect Linear
4. Enter your API key, team ID, user ID, and select which Conductor role to sync to

**How it works:**
- Every hour, Conductor queries Linear for active issues assigned to you
- New issues become tasks (tagged #linear + any Linear labels)
- Status changes in Linear update the task status in Conductor
- Issues completed in Linear are marked done in Conductor
- Duplicates are prevented via the issue's unique ID

**Status mapping:**
- Linear Backlog/Todo/Triage → Conductor "backlog"
- Linear In Progress → Conductor "in_progress"
- Linear In Review → Conductor "in_review"
- Linear Done/Canceled → marks task done

**Sync is one-way:** Linear → Conductor. Changes in Conductor don't sync back to Linear (yet).

Tasks from Linear show a "Linear" indicator badge so you know where they came from.`,
  },
  {
    slug: "granola-integration",
    title: "Granola Integration",
    category: "integrations",
    summary: "Auto-sync meeting transcripts from Granola. Maps folders to roles, AI extracts everything.",
    content: `Granola captures meeting transcripts across all platforms (Google Meet, Teams, Zoom, Slack huddles). Conductor syncs with Granola every 30 minutes to auto-process new meeting notes.

**Setup:**
1. Ensure you have Granola Business plan ($18/month) for API access
2. Get your API key from Granola Settings > API
3. Add GRANOLA_API_KEY to your .env.local
4. Go to Settings > Integrations > Connect Granola

**Folder-to-role mapping:**
Organize your meetings in Granola folders by company. Configure the folder-to-role mapping in Settings > Integrations > Granola. Each Granola folder name maps to a Conductor role.

Notes without a recognized folder mapping are skipped.

**What happens on each sync:**
1. Conductor fetches new notes from Granola
2. Maps each note's folder to a role
3. Fetches the full transcript with speaker labels
4. Sends Granola's AI summary + transcript to Claude for extraction
5. Creates tasks (your action items), follow-ups (what others owe you), and decision notes
6. Everything is tagged and attributed to the correct role

**No manual work needed.** After a meeting, just tag the Granola folder. The next sync picks it up automatically.`,
  },
  {
    slug: "calendar-processing",
    title: "Calendar Processing",
    category: "integrations",
    summary: "Screenshot your calendar and AI analyzes it to create meeting prep tasks.",
    content: `Conductor can process calendar screenshots to identify meetings and create prep tasks.

**How to use:**
1. Take a screenshot of your calendar (day or week view)
2. Go to Inbox and upload the screenshot
3. Select the relevant role
4. Claude analyzes the image and extracts meeting information

The AI identifies meeting times, titles, and attendees, then creates tasks for meeting preparation.

**Calendar ignore patterns:** In Settings > Integrations > Calendar, you can configure patterns for meetings to skip (e.g., "OOO", "Focus Time", "Lunch", "Training").`,
  },

  // === VIEWS & NAVIGATION ===
  {
    slug: "board-view",
    title: "Board View (Kanban)",
    category: "views",
    summary: "Swim lanes organized by status: Backlog, In Progress, In Review, Blocked, Done.",
    content: `The **Board** view shows your tasks as a Kanban board with columns:

- **Backlog** — Tasks not yet started
- **In Progress** — Actively working on
- **In Review** — Waiting for review/feedback
- **Blocked** — Can't proceed, needs unblocking
- **Done** — Drag here to complete

**Role filter:** Tabs at the top let you filter by role. Each role has its color-coded indicator.

**Drag and drop:** Move tasks between columns to update their status. Dragging to "Done" marks the task complete.

This view is great for getting a visual overview across all your roles or drilling into one role's workflow.`,
  },
  {
    slug: "inbox-view",
    title: "Inbox",
    category: "views",
    summary: "Process files, transcripts, and screenshots. AI extracts tasks and follow-ups.",
    content: `Inbox is where raw information enters Conductor. Upload a file or paste text, and AI processes it into structured data.

**What you can process:**
- Meeting transcripts (paste text or upload)
- Screenshots of Slack/Teams conversations
- PDFs and Word documents
- Calendar screenshots
- Any text content with action items

**The processing flow:**
1. Select a role
2. Upload or paste content
3. Hit "Process" — Claude analyzes the content
4. Review extracted items: tasks, follow-ups, decisions, key quotes
5. Uncheck anything you don't want
6. Hit "Confirm" to save

Inbox is manual — for automatic processing, use the Granola integration.`,
  },
  {
    slug: "global-search",
    title: "Global Search",
    category: "views",
    summary: "Press Cmd+K to search across tasks, follow-ups, notes, and transcripts.",
    content: `Press **Cmd+K** (or click "Search" in the sidebar) to open global search.

Search across:
- Tasks (by title)
- Follow-ups (by title or person)
- Notes (by content)
- Transcripts (by content)

Results are grouped by type and show the role each item belongs to. Click a result to navigate to it.

**Quick add:** Press **n** from anywhere to quick-add a task.`,
  },
  {
    slug: "navigation",
    title: "Navigation",
    category: "views",
    summary: "6 main views in the sidebar, plus Settings. Minimal by design.",
    content: `**Sidebar (desktop):**
- Focus — Your current time block's tasks (daily driver)
- Inbox — Process files and transcripts
- Tracker — Follow-ups you're waiting on
- Board — Kanban view of tasks by status
- AI — Chat with Claude per role
- Settings — Configuration, integrations, skills, reference

**Mobile:** Same items in a slide-out drawer, accessible via the hamburger menu.

**Theme:** Switch between Dark (default), Warm, and Light themes using the switcher at the bottom of the sidebar.

The sidebar also shows your current time block and upcoming blocks so you always know what's next.`,
  },

  // === REFERENCE ===
  {
    slug: "keyboard-shortcuts",
    title: "Keyboard Shortcuts",
    category: "reference",
    summary: "Cmd+K for search, n for quick add, Enter to send messages.",
    content: `**Global:**
- **Cmd+K** — Open global search
- **n** — Quick add a new task
- **Esc** — Close dialogs, search, or quick add

**Focus View:**
- **Click checkbox** — Complete a task (slides away)
- **Click title** — Expand task details
- **Right-click task** — Toggle detail panel
- **Drag** — Reorder tasks

**AI Chat:**
- **Enter** — Send message
- **Shift+Enter** — New line
- **/** — Open slash command menu
- **Arrow keys** — Navigate slash menu
- **Enter/Tab** — Select slash command
- **Esc** — Close slash menu

**Task Details:**
- **Enter** — Save title edit
- **Tab** — Move between fields`,
  },
  {
    slug: "settings-guide",
    title: "Settings Guide",
    category: "reference",
    summary: "4 tabs: Roles, Profile, Integrations, System. Where everything is configured.",
    content: `Settings is organized into 4 main tabs:

**Roles** (default tab)
Configure each of your roles:
- Responsibilities — what you own and are accountable for
- Quarterly goals — current objectives
- Communication tone — how AI should write for this role
- Role context — anything the AI should always know
- Staff directory — team members with titles, relationships, and communication notes

**Profile**
Your personal voice settings (applies to all roles):
- Communication style — how you write (direct, concise, etc.)
- Sample messages — real Slack/email messages for AI to match
- About me — personal context the AI should know

**Integrations**
- Calendar ignore patterns
- Linear connection and sync controls
- Granola connection and sync controls

**System** (has sub-tabs)
- General — About, schedule grid, actions (reset today, sign out)
- Skills — Built-in slash commands (enable/disable) + custom skill creator
- Reference — Daily flow guide + keyboard shortcuts
- Costs — AI usage dashboard (tokens, costs, breakdowns by role/endpoint)`,
  },
  {
    slug: "roles-config",
    title: "Configuring Roles",
    category: "reference",
    summary: "Set responsibilities, goals, tone, and staff directory for each role.",
    content: `Each role has configuration that the AI uses for context:

**Responsibilities:** What you own in this role. Be specific — "UI architecture decisions across the platform" is better than "frontend work." The AI references this when drafting status updates and prioritizing tasks.

**Quarterly Goals:** Current quarter's objectives. The AI uses these in sprint planning (/sprint-plan) and status updates (/draft-update) to align recommendations with your goals.

**Communication Tone:** How AI should write for this role. Examples: "Technical, hands-on, IC-level" for an engineering role vs "Strategic, executive-level" for a leadership role.

**Role Context:** Freeform context that's always included. Good for things like meeting schedules, team dynamics, or key relationships.

**Staff Directory:** Team members with:
- Name and title
- Relationship (direct report, manager, peer)
- Communication notes (e.g., "Prefers short Slack messages. Direct, brief.")
- Email and Slack handle

The AI uses the staff directory to match names in transcripts, suggest who to follow up with, and adapt communication style per recipient.`,
  },

  // === AI FEATURES (new) ===
  {
    slug: "morning-briefing",
    title: "Morning Briefing",
    category: "ai-features",
    summary: "Auto-generated daily brief shown on your first Focus page load",
    content: `# Morning Briefing

On your first Focus page load each day, Conductor generates a personalized morning briefing using AI.

**What it includes:**
- Top priority tasks across all roles
- Stale follow-ups that need attention
- Today's schedule with role assignments
- Key items from each active role

The briefing appears as a card at the top of the Focus page. Click the X to dismiss it — it won't show again until the next day.

**How it works:** The briefing assembles your full context (tasks, follow-ups, schedule, roles) and sends it to Claude for a concise summary. Uses Sonnet for quality.`,
  },
  {
    slug: "role-handoff",
    title: "Role Switch Handoff",
    category: "ai-features",
    summary: "Context brief when your schedule switches to a new role",
    content: `# Role Switch Handoff

When your time block changes and you switch to a new role, Conductor shows a brief context handoff — a quick summary of where you left off with the incoming role.

**What it shows:**
- Open tasks for the role
- Pending follow-ups
- Last conversation snippet
- Recent notes

The handoff card auto-dismisses after 30 seconds, or click X to close it immediately. This eliminates the "what was I doing?" feeling when context-switching between roles.`,
  },
  {
    slug: "ai-search",
    title: "AI-Powered Search",
    category: "ai-features",
    summary: "Natural language search across all your data",
    content: `# AI-Powered Search

Press **Cmd+K** to open search. Type your query — for keyword searches, results appear instantly. For complex questions, click the **"Ask AI"** button that appears below.

**Examples:**
- "What did Amanda say about HIPAA?" → AI searches notes and provides a synthesized answer
- "enrollment form" → Standard keyword results across tasks, follow-ups, notes
- "What's the status of the NestJS migration?" → AI answer with cited sources

AI search runs a keyword search first, then sends the top results to Claude for a synthesized answer. Sources are cited so you know where the info came from.`,
  },
  {
    slug: "create-tasks-from-chat",
    title: "Create Tasks from Chat",
    category: "ai-features",
    summary: "Turn AI responses into tasks and follow-ups with one click",
    content: `# Create Tasks from Chat

Every AI assistant message has two action buttons:

**Create Tasks** — Extracts action items from the AI's response and creates them as real tasks and follow-ups. Uses Haiku for fast extraction.

**Save to Drafts** — Saves the AI's response to your Draft Queue for later review and sending.

These buttons appear below every assistant message in the AI chat. After creating tasks, you'll see a confirmation like "Created 3 tasks, 1 follow-up".`,
  },
  {
    slug: "draft-queue",
    title: "Draft Queue",
    category: "ai-features",
    summary: "Review and manage all your drafted messages in one place",
    content: `# Draft Queue

Navigate to Drafts (Cmd+7) to see all saved draft messages across roles.

**How drafts get created:**
- Click "Save to drafts" on any AI assistant message in chat
- AI-generated message drafts can be saved for later review

**Draft Queue features:**
- Grouped by role with colored badges
- Each draft shows recipient, platform, and content preview
- **Copy** — copies to clipboard for pasting into Slack/Teams
- **Edit** — inline editing with save/cancel
- **Delete** — remove draft

This lets you batch your outbound messages — draft throughout the day, then review and send in one focused session.`,
  },
  {
    slug: "weekly-retro",
    title: "Weekly Retrospective",
    category: "ai-features",
    summary: "Auto-generated end-of-week summary with insights",
    content: `# Weekly Retrospective

Generate a comprehensive weekly summary by calling the retro API or using it as a slash command.

**What it covers:**
- Tasks completed per role
- Follow-ups resolved vs still pending
- Notes created and AI usage stats
- Per-role status (active, stalled, blocked)
- Time allocation observations
- One actionable insight for next week

**How to use:**
- Call POST /api/ai/retro from the API
- Or ask the AI: "Give me a weekly retro"

The retro queries the last 7 days of activity across all roles and generates a markdown-formatted summary.`,
  },
  {
    slug: "document-management",
    title: "Documents",
    category: "views",
    summary: "Browse, search, pin, and download uploaded files",
    content: `# Documents

Navigate to Documents (Cmd+6) to see all files you've uploaded across roles.

**Features:**
- **Filter by role** — click role badges to filter
- **Search** — find documents by content keywords
- **Expand** — click a document to see AI summary and text preview
- **Download** — download the original file (.docx, .pdf, etc.)
- **Open in AI** — loads the document into the AI chat for that role
- **Pin to AI context** — pinned documents are ALWAYS included in AI context, regardless of keywords or time

**How uploads work:**
When you upload a file in AI chat or Inbox, the text is extracted and saved as a Note (for long-term AI retrieval) and a FileUpload record (for download). An AI summary is auto-generated in the background using Haiku.

**AI Memory:**
- Uploaded docs persist forever as Notes
- AI finds them via keyword search when you ask related questions
- Pinned docs are always in context (up to 2,000 chars each)
- AI summaries are preferred over raw text when available`,
  },
];
