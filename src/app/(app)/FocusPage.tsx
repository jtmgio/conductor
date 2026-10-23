"use client";

import { AgendaStrip } from "@/components/AgendaStrip";
import { DispatchBoard } from "@/components/DispatchBoard";
import { MobileCapture } from "@/components/MobileCapture";
import { useSchedule } from "@/components/ScheduleContext";

export function FocusPage() {
  // The shell polls /api/schedule once for the whole app; read it, don't refetch it.
  const { currentBlock, loaded } = useSchedule();

  if (!loaded) return null;

  return (
    <>
      {/* Phone: pure capture. Desktop: the dispatch board across every company. */}
      <div className="lg:hidden">
        <MobileCapture currentBlock={currentBlock} />
      </div>
      <div className="hidden lg:block">
        <div className="mx-auto max-w-3xl space-y-6 pt-2">
          <AgendaStrip />
          <DispatchBoard />
        </div>
      </div>
    </>
  );
}
