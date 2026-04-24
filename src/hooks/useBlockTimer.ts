"use client";

import { useState, useEffect, useRef } from "react";

interface BlockTime {
  endHour: number;
  endMinute: number;
}

interface BlockTimerResult {
  minutesRemaining: number;
  isOvertime: boolean;
  overtimeMinutes: number;
  formattedRemaining: string;
  urgency: "normal" | "warning" | "critical" | "overtime";
}

export function useBlockTimer(block: BlockTime | null | undefined): BlockTimerResult {
  const [now, setNow] = useState(() => new Date());
  const intervalRef = useRef<ReturnType<typeof setInterval>>();

  useEffect(() => {
    intervalRef.current = setInterval(() => setNow(new Date()), 15_000); // update every 15s
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  if (!block) {
    return { minutesRemaining: 0, isOvertime: false, overtimeMinutes: 0, formattedRemaining: "", urgency: "normal" };
  }

  const endMinutes = block.endHour * 60 + block.endMinute;
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const diff = endMinutes - currentMinutes;

  const isOvertime = diff < 0;
  const minutesRemaining = Math.max(0, diff);
  const overtimeMinutes = isOvertime ? Math.abs(diff) : 0;

  let formattedRemaining: string;
  if (isOvertime) {
    formattedRemaining = `+${overtimeMinutes} min over`;
  } else if (minutesRemaining < 1) {
    formattedRemaining = "< 1 min";
  } else if (minutesRemaining >= 60) {
    const h = Math.floor(minutesRemaining / 60);
    const m = minutesRemaining % 60;
    formattedRemaining = m > 0 ? `${h}h ${m}m left` : `${h}h left`;
  } else {
    formattedRemaining = `${minutesRemaining} min left`;
  }

  let urgency: BlockTimerResult["urgency"] = "normal";
  if (isOvertime) urgency = "overtime";
  else if (minutesRemaining <= 5) urgency = "critical";
  else if (minutesRemaining <= 10) urgency = "warning";

  return { minutesRemaining, isOvertime, overtimeMinutes, formattedRemaining, urgency };
}
