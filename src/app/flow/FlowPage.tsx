"use client";

import { AppShell } from "@/components/AppShell";
import { Workflow } from "lucide-react";
import Link from "next/link";

interface Step {
  num: number;
  title: string;
  trigger: string;
  color: string;
  page?: { label: string; href: string };
  items: string[];
  shortcut?: string;
}

const steps: Step[] = [
  {
    num: 1,
    title: "Morning Start",
    trigger: "First block — Open Conductor",
    color: "#4d8ef7",
    page: { label: "Focus", href: "/" },
    items: [
      "Morning Pick screen appears automatically",
      "Select today's tasks from each role's backlog",
      "Hit \"Go\" to enter Focus view",
      "Or hit \"Skip\" to go straight to focus",
    ],
  },
  {
    num: 2,
    title: "Work a Focus Block",
    trigger: "During any scheduled block",
    color: "#4d8ef7",
    page: { label: "Focus", href: "/" },
    items: [
      "Focus view shows only the current role's tasks",
      "Check the box to complete — task slides away",
      "Right-click a task to open details (notes, checklist, due date)",
      "Drag tasks to reorder priority",
    ],
    shortcut: "Press n to quick-add a task",
  },
  {
    num: 3,
    title: "After a Meeting",
    trigger: "Meeting just ended",
    color: "#2dd4bf",
    page: { label: "Inbox", href: "/inbox" },
    items: [
      "Go to Inbox → paste the transcript or meeting notes",
      "Select the role this meeting was for",
      "Hit \"Process\" → AI extracts tasks, follow-ups, decisions, quotes",
      "Review everything on the confirm screen — uncheck what you don't need",
      "Hit \"Confirm\" → items saved to the role",
    ],
  },
  {
    num: 4,
    title: "Capture a Slack / Teams Thread",
    trigger: "Important conversation happened",
    color: "#2dd4bf",
    page: { label: "Inbox", href: "/inbox" },
    items: [
      "Screenshot the conversation",
      "Go to Inbox → upload the screenshot",
      "AI reads the image and extracts action items",
      "Review and confirm — tasks and follow-ups created",
    ],
  },
  {
    num: 5,
    title: "Draft a Message",
    trigger: "Need to write something to someone",
    color: "#a78bfa",
    page: { label: "AI", href: "/ai" },
    items: [
      "Go to AI tab → select the role",
      "Ask: \"Draft a message to [person] about [topic]\"",
      "Get 2-3 variants (Direct, Softer, Formal)",
      "Copy the one you want → paste into Slack/Teams/email",
    ],
  },
  {
    num: 6,
    title: "Check What's Stale",
    trigger: "During triage or when you have a gap",
    color: "#fbbf24",
    page: { label: "Tracker", href: "/tracker" },
    items: [
      "Go to Tracker → follow-ups grouped by role",
      "Orange dot = stale (3+ days waiting)",
      "Filter by \"Stale\" to see only overdue items",
      "Hit \"Follow up →\" to auto-draft a nudge message via AI",
      "Hit \"Mark Received\" when someone responds",
    ],
  },
  {
    num: 7,
    title: "Role Switch",
    trigger: "Time block changes",
    color: "#4d8ef7",
    page: { label: "Focus", href: "/" },
    items: [
      "Focus view auto-updates to the new role's tasks",
      "Sidebar shows current block + what's coming up",
      "No action needed — just keep working",
    ],
  },
  {
    num: 8,
    title: "End of Day",
    trigger: "Last block ends — Done for the day",
    color: "#787878",
    items: [
      "Just close the app",
      "Incomplete today-tasks silently return to backlog",
      "No summary, no report, no \"you didn't finish\" guilt",
      "Between blocks the app shows \"off the clock\"",
    ],
  },
  {
    num: 9,
    title: "Evening Block (Optional)",
    trigger: "Evening — Optional low-touch block",
    color: "#fb7185",
    page: { label: "Focus", href: "/" },
    items: [
      "Lowest-priority role tasks only",
      "Light async work — nothing heavy",
      "Close the app when you're done",
    ],
  },
];

export function FlowContent() {
  return (
    <div className="max-w-[680px]">
        <div className="flex items-center gap-2.5 mb-2">
          <Workflow className="h-6 w-6 text-[var(--text-tertiary)]" />
          <h1 className="text-[32px] font-semibold text-[var(--text-primary)]">Daily Flow</h1>
        </div>
        <p className="text-[15px] text-[var(--text-secondary)] mb-10">How to use Conductor throughout your day.</p>

        {/* Timeline */}
        <div className="relative">
          {/* Vertical line */}
          <div className="absolute left-[19px] top-4 bottom-4 w-px bg-[var(--border-default)]" />

          <div className="space-y-0">
            {steps.map((step, i) => (
              <div key={step.num} className="relative flex gap-5 pb-10 last:pb-0">
                {/* Number circle */}
                <div
                  className="relative z-10 w-10 h-10 rounded-full flex items-center justify-center text-[14px] font-bold text-white shrink-0"
                  style={{ backgroundColor: step.color }}
                >
                  {step.num}
                </div>

                {/* Content */}
                <div className="flex-1 pt-1.5">
                  <div className="flex items-center gap-3 flex-wrap mb-1.5">
                    <h2 className="text-[18px] font-semibold text-[var(--text-primary)]">{step.title}</h2>
                    {step.page && (
                      <Link
                        href={step.page.href}
                        className="px-2.5 py-0.5 rounded-full text-[12px] font-semibold border border-[var(--border-default)] text-[var(--text-secondary)] hover:bg-[var(--sidebar-hover)] transition-colors"
                      >
                        {step.page.label} &rarr;
                      </Link>
                    )}
                  </div>
                  <p className="text-[15px] text-[var(--text-tertiary)] mb-3">{step.trigger}</p>

                  <ul className="space-y-1.5">
                    {step.items.map((item, j) => (
                      <li key={j} className="flex items-start gap-2 text-[16px] text-[var(--text-secondary)] leading-relaxed">
                        <span className="text-[var(--text-tertiary)] mt-1.5 shrink-0">&#8226;</span>
                        {item}
                      </li>
                    ))}
                  </ul>

                  {step.shortcut && (
                    <div className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[var(--surface-raised)] border border-[var(--border-subtle)]">
                      <kbd className="text-[12px] font-mono text-[var(--accent-blue)] bg-[var(--surface)] px-1.5 py-0.5 rounded">n</kbd>
                      <span className="text-[13px] text-[var(--text-tertiary)]">{step.shortcut}</span>
                    </div>
                  )}

                  {/* Connector arrow for non-last items */}
                  {i < steps.length - 1 && (
                    <div className="mt-4 text-[12px] text-[var(--text-tertiary)] uppercase tracking-wider font-medium opacity-50">
                      {i === 7 ? "optional" : "then"}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Quick reference */}
        <div className="mt-12 border-t border-[var(--border-subtle)] pt-8">
          <h3 className="text-[13px] uppercase tracking-wider text-[var(--text-tertiary)] font-medium mb-4">Keyboard Shortcuts</h3>
          <div className="grid grid-cols-2 gap-2">
            {[
              { key: "n", desc: "Quick add task" },
              { key: "⌘K", desc: "Global search" },
              { key: "Right-click", desc: "Task details" },
            ].map((s) => (
              <div key={s.key} className="flex items-center gap-3 px-3 py-2 rounded-xl bg-[var(--surface-raised)] border border-[var(--border-subtle)]">
                <kbd className="text-[12px] font-mono text-[var(--accent-blue)] bg-[var(--surface)] px-2 py-0.5 rounded">{s.key}</kbd>
                <span className="text-[14px] text-[var(--text-secondary)]">{s.desc}</span>
              </div>
            ))}
          </div>
        </div>
    </div>
  );
}

export function FlowPage() {
  return (
    <AppShell>
      <div className="py-6">
        <FlowContent />
      </div>
    </AppShell>
  );
}
