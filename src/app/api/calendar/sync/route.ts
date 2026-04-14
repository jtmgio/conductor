import { NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";
import { existsSync } from "fs";
import path from "path";

const execFileAsync = promisify(execFile);

export async function POST() {
  // Try running the bash script (works on macOS with GUI session)
  // Falls back to just returning instructions if the script can't run
  const scriptPath = path.resolve(process.cwd(), "cron/calendar-sync.sh");

  if (!existsSync(scriptPath)) {
    // Try common project locations for standalone builds
    const altPaths = [
      path.resolve(__dirname, "../../../../cron/calendar-sync.sh"),
      "/opt/conductor/cron/calendar-sync.sh",
    ];
    const found = altPaths.find(existsSync);
    if (!found) {
      return NextResponse.json({ ok: false, skipped: true, reason: "calendar-sync.sh not found" });
    }
    return await runScript(found);
  }

  return await runScript(scriptPath);
}

async function runScript(scriptPath: string) {
  // Find bash — macOS and Linux paths
  const bashPaths = ["/bin/bash", "/usr/bin/bash", "/usr/local/bin/bash"];
  const bashPath = bashPaths.find(existsSync);

  if (!bashPath) {
    return NextResponse.json({
      ok: false,
      error: "bash not found — calendar sync requires macOS with screencapture",
    }, { status: 500 });
  }

  try {
    const { stdout, stderr } = await execFileAsync(bashPath, [scriptPath], {
      timeout: 120_000,
      env: {
        ...process.env,
        CONDUCTOR_URL: `http://localhost:${process.env.PORT || 3000}`,
        SYNC_TRIGGER: "app-open",
        PATH: "/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin",
      },
    });

    const output = (stdout + stderr).trim();
    const success = output.includes("Calendar sync success");
    const unchanged = output.includes("unchanged");

    return NextResponse.json({
      ok: success || unchanged,
      unchanged,
      output: output.split("\n").slice(-2).join("\n"),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
