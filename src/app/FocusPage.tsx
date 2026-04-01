"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { FocusView } from "@/components/FocusView";

interface BlockInfo {
  id: string;
  label: string;
  timeLabel: string;
  roleId: string | null;
  roleName?: string;
  roleColor?: string;
}

export function FocusPage() {
  const [currentBlock, setCurrentBlock] = useState<BlockInfo | null>(null);
  const [nextBlocks, setNextBlocks] = useState<BlockInfo[]>([]);
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
          setOffClockMessage(data.offClockMessage);
        }
      } catch {}
      setLoaded(true);
    }
    loadSchedule();
  }, []);

  if (!loaded) return null;

  return (
    <AppShell
      currentBlock={currentBlock}
      nextBlocks={nextBlocks}
    >
      <FocusView currentBlock={currentBlock} nextBlocks={nextBlocks} offClockMessage={offClockMessage} />
    </AppShell>
  );
}
