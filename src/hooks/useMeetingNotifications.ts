"use client";

import { useEffect, useRef } from "react";
import { playSound } from "@/lib/sounds";

interface BaseMeeting {
  id: string;
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  role: { name: string; color: string };
  prepTask: { title: string; done: boolean } | null;
}

interface MeetingNotificationOptions<T> {
  onMeetingAlert?: (meeting: T) => void;
}

const LEAD_TIME_KEY = "conductor-notif-lead-minutes";
const PREP_LEAD_KEY = "conductor-prep-lead-minutes";

function getLeadMinutes(): number {
  if (typeof window === "undefined") return 5;
  const stored = localStorage.getItem(LEAD_TIME_KEY);
  return stored ? parseInt(stored, 10) : 5;
}

function getPrepLeadMinutes(): number {
  if (typeof window === "undefined") return 15;
  const stored = localStorage.getItem(PREP_LEAD_KEY);
  return stored ? parseInt(stored, 10) : 15;
}

export function useMeetingNotifications<T extends BaseMeeting>(meetings: T[], options?: MeetingNotificationOptions<T>) {
  // Keyed `${meetingId}:${stage}` so each escalation step fires exactly once.
  const notifiedRef = useRef<Set<string>>(new Set());
  const prepAlertedRef = useRef<Set<string>>(new Set());
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (meetings.length === 0) return;

    // Clear previous timers
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];

    const now = new Date();
    const nowMs = now.getTime();

    for (const meeting of meetings) {
      const [h, m] = meeting.startTime.split(":").map(Number);
      const meetingDate = new Date();
      meetingDate.setHours(h, m, 0, 0);
      const meetingMs = meetingDate.getTime();

      // Prep alert (15 min before by default)
      if (options?.onMeetingAlert && !prepAlertedRef.current.has(meeting.id)) {
        const prepLeadMinutes = getPrepLeadMinutes();
        const prepAt = meetingMs - prepLeadMinutes * 60 * 1000;
        const prepDelay = prepAt - nowMs;

        if (prepDelay > -30_000) {
          const prepTimer = setTimeout(
            () => {
              if (prepAlertedRef.current.has(meeting.id)) return;
              prepAlertedRef.current.add(meeting.id);
              options.onMeetingAlert!(meeting);
            },
            Math.max(prepDelay, 0)
          );
          timersRef.current.push(prepTimer);
        }
      }

      // Escalating alerts. One quiet chime five minutes out is easy to miss
      // entirely; three chances with distinct sounds is the whole point.
      const leadMinutes = getLeadMinutes();
      const stages: Array<{ key: string; atMs: number; sound: "meeting" | "meetingImminent" | "meetingNow"; label: string }> = [
        { key: "lead", atMs: meetingMs - leadMinutes * 60_000, sound: "meeting", label: `in ${leadMinutes} min` },
        { key: "imminent", atMs: meetingMs - 60_000, sound: "meetingImminent", label: "in 1 min" },
        { key: "now", atMs: meetingMs, sound: "meetingNow", label: "starting now" },
      ];

      for (const stage of stages) {
        // A 5-minute lead on a meeting 2 minutes away would collapse onto the
        // later stages; skip anything already past rather than firing late.
        if (stage.atMs - nowMs < -30_000) continue;
        const stageKey = `${meeting.id}:${stage.key}`;
        if (notifiedRef.current.has(stageKey)) continue;

        const timer = setTimeout(
          () => {
            if (notifiedRef.current.has(stageKey)) return;
            notifiedRef.current.add(stageKey);

            // Sound always; the OS notification only if it's been granted.
            playSound(stage.sound);

            if (!("Notification" in window) || Notification.permission !== "granted") return;
            const prepNote =
              meeting.prepTask && !meeting.prepTask.done
                ? `\nPrep: ${meeting.prepTask.title.replace(/^\d{1,2}:\d{2}\s*[—–-]\s*/, "")}`
                : "";
            new Notification(`${meeting.title} ${stage.label}`, {
              body: `${formatTime(meeting.startTime)} · ${meeting.role.name}${prepNote}`,
              // Same tag per meeting so each stage replaces the last instead of
              // stacking three notifications for one meeting.
              tag: `meeting-${meeting.id}`,
              icon: "/icon-192.png",
            });
          },
          Math.max(stage.atMs - nowMs, 0)
        );
        timersRef.current.push(timer);
      }

    }

    return () => {
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
    };
  }, [meetings, options?.onMeetingAlert]);
}

function formatTime(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return m === 0 ? `${hour} ${period}` : `${hour}:${m.toString().padStart(2, "0")} ${period}`;
}
