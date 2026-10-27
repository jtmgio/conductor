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
        {/* Two columns, as the cockpit had it: meetings in a sticky side column, the board takes the rest */}
        <div className="mx-auto max-w-6xl pt-2 grid gap-6 lg:grid-cols-3">
          <aside className="lg:col-span-1 lg:sticky lg:top-4 lg:self-start">
            <AgendaStrip mode="strip" />
          </aside>
          <div className="lg:col-span-2">
            <DispatchBoard />
          </div>
        </div>
      </div>
    </>
  );
}
