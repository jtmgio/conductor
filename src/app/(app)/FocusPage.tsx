"use client";

import { TodayCockpit } from "@/components/TodayCockpit";
import { MobileCapture } from "@/components/MobileCapture";
import { useSchedule } from "@/components/ScheduleContext";

export function FocusPage() {
  // The shell polls /api/schedule once for the whole app; read it, don't refetch it.
  const { currentBlock, nextBlocks, offClockMessage, loaded } = useSchedule();

  if (!loaded) return null;

  return (
    <>
      {/* Phone: pure capture. Desktop: the full cockpit. */}
      <div className="lg:hidden">
        <MobileCapture currentBlock={currentBlock} />
      </div>
      <div className="hidden lg:block">
        <TodayCockpit currentBlock={currentBlock} nextBlocks={nextBlocks} offClockMessage={offClockMessage} />
      </div>
    </>
  );
}
