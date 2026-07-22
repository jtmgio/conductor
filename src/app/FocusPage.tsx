"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { TodayCockpit } from "@/components/TodayCockpit";
import { MobileCapture } from "@/components/MobileCapture";

interface BlockInfo {
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
}

export function FocusPage() {
  const [currentBlock, setCurrentBlock] = useState<BlockInfo | null>(null);
  const [nextBlocks, setNextBlocks] = useState<BlockInfo[]>([]);
  const [allBlocks, setAllBlocks] = useState<BlockInfo[]>([]);
  const [offClockMessage, setOffClockMessage] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    async function loadSchedule() {
      try {
        const res = await fetch("/api/schedule");
        if (res.ok) {
          const data = await res.json();
          setCurrentBlock(data.currentBlock);
          setNextBlocks(data.nextBlocks || []);
          setAllBlocks(data.allBlocks || []);
          setOffClockMessage(data.offClockMessage);
        }
      } catch {}
      setLoaded(true);
    }
    loadSchedule();
    const interval = setInterval(loadSchedule, 60_000);
    return () => clearInterval(interval);
  }, []);

  if (!loaded) return null;

  return (
    <AppShell
      currentBlock={currentBlock}
      nextBlocks={nextBlocks}
    >
      {/* Phone: pure capture. Desktop: the full cockpit. */}
      <div className="lg:hidden">
        <MobileCapture currentBlock={currentBlock} />
      </div>
      <div className="hidden lg:block">
        <TodayCockpit currentBlock={currentBlock} nextBlocks={nextBlocks} offClockMessage={offClockMessage} />
      </div>
    </AppShell>
  );
}
