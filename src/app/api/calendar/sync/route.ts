import { NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";

const execFileAsync = promisify(execFile);

export async function POST() {
  const scriptPath = path.resolve(process.cwd(), "cron/calendar-sync.sh");

  try {
    const { stdout, stderr } = await execFileAsync("bash", [scriptPath], {
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

    return NextResponse.json({
      ok: success,
      output: output.split("\n").slice(-2).join("\n"),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
