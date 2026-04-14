import { NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";
import { existsSync } from "fs";
import path from "path";

const execFileAsync = promisify(execFile);

export const dynamic = "force-dynamic";

export async function GET() {
  // Run the Swift script to get today's events, then extract unique calendar accounts
  const scriptPath = path.resolve(process.cwd(), "cron/calendar-events.swift");
  const swiftPaths = ["/usr/bin/swift", "/usr/local/bin/swift"];
  const swiftPath = swiftPaths.find(existsSync);

  if (!swiftPath || !existsSync(scriptPath)) {
    return NextResponse.json({
      accounts: [],
      error: "Calendar discovery requires macOS with EventKit access",
    });
  }

  try {
    const { stdout } = await execFileAsync(swiftPath, [scriptPath], { timeout: 15000 });
    const data = JSON.parse(stdout);
    const accounts = new Map<string, string>();
    for (const evt of data.events || []) {
      const key = evt.calendarAccount || evt.calendarName;
      if (key && !accounts.has(key)) {
        accounts.set(key, evt.calendarName);
      }
    }

    return NextResponse.json({
      accounts: Array.from(accounts.entries()).map(([account, name]) => ({
        account,
        calendarName: name,
      })),
    });
  } catch (err) {
    return NextResponse.json({
      accounts: [],
      error: err instanceof Error ? err.message : "Failed to read calendars",
    });
  }
}
