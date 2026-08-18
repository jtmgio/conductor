"use client";

import { createContext, useContext, useEffect, useState } from "react";

/** Mirrors mapBlock() in src/app/api/schedule/route.ts. */
export interface BlockInfo {
  id: string;
  label: string;
  timeLabel: string;
  startHour: number;
  startMinute: number;
  endHour: number;
  endMinute: number;
  roleId: string | null;
  roleName?: string;
  roleColor?: string;
  roleTitle?: string;
  rolePlatform?: string;
}

interface ScheduleValue {
  currentBlock: BlockInfo | null;
  nextBlocks: BlockInfo[];
  allBlocks: BlockInfo[];
  offClockMessage: string | null;
  /** False until the first fetch settles — pages that need real blocks can wait on it. */
  loaded: boolean;
}

const EMPTY: ScheduleValue = {
  currentBlock: null,
  nextBlocks: [],
  allBlocks: [],
  offClockMessage: null,
  loaded: false,
};

const ScheduleContext = createContext<ScheduleValue>(EMPTY);

/**
 * One poller for the whole app.
 *
 * /api/schedule used to be fetched by AppShell, FocusPage, FormatterPage and
 * PlanTomorrowPage independently — four callers, several on their own 60s intervals, all
 * re-firing on every navigation. This lives in the shell (which is now in a layout, so it
 * outlives navigation) and everything else reads from context.
 */
export function ScheduleProvider({ children }: { children: React.ReactNode }) {
  const [value, setValue] = useState<ScheduleValue>(EMPTY);

  useEffect(() => {
    let cancelled = false;

    function load() {
      fetch("/api/schedule")
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (cancelled) return;
          setValue({
            currentBlock: data?.currentBlock ?? null,
            nextBlocks: data?.nextBlocks ?? [],
            allBlocks: data?.allBlocks ?? [],
            offClockMessage: data?.offClockMessage ?? null,
            loaded: true,
          });
        })
        .catch(() => {
          if (!cancelled) setValue((v) => ({ ...v, loaded: true }));
        });
    }

    load();
    const interval = setInterval(load, 60_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return <ScheduleContext.Provider value={value}>{children}</ScheduleContext.Provider>;
}

export function useSchedule(): ScheduleValue {
  return useContext(ScheduleContext);
}
