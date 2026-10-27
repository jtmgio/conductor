import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { today, formatDateOnly } from "@/lib/dates";
import { taskKey } from "@/lib/task-key";
import { buildBoard, viewFlags, type BoardTask, type Horizon, type OwnerFilter } from "@/lib/board";

export const dynamic = "force-dynamic";

const HORIZONS: Horizon[] = ["today", "week", "all"];
const OWNERS: OwnerFilter[] = ["me", "claude", "all"];

// Same open-task filter the MCP get_board uses (it isn't exported from there).
const OPEN_TASK = { done: false, status: { not: "icebox" } };

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const params = req.nextUrl.searchParams;
  const horizonParam = params.get("horizon");
  const ownerParam = params.get("owner");
  if (horizonParam !== null && !HORIZONS.includes(horizonParam as Horizon)) {
    return NextResponse.json({ error: "horizon must be today, week or all" }, { status: 400 });
  }
  if (ownerParam !== null && !OWNERS.includes(ownerParam as OwnerFilter)) {
    return NextResponse.json({ error: "owner must be me, claude or all" }, { status: 400 });
  }
  const role = params.get("role");
  const project = params.get("project");
  // A project id only means something inside one company.
  if (project && !role) {
    return NextResponse.json({ error: "project needs role" }, { status: 400 });
  }
  // Raw params, not defaults: viewFlags reads "absent" as "bare call", which is the capped one.
  const horizon = (horizonParam ?? undefined) as Horizon | undefined;
  const owner = (ownerParam ?? undefined) as OwnerFilter | undefined;

  const now = new Date();
  const [tasks, followUps] = await Promise.all([
    prisma.task.findMany({
      // "loose" is the no-project bucket; any other value that isn't an id just matches nothing.
      where: {
        ...OPEN_TASK,
        role: { active: true },
        ...(role ? { roleId: role } : {}),
        ...(project ? { projectId: project === "loose" ? null : project } : {}),
      },
      include: {
        role: { select: { id: true, name: true, color: true, taskPrefix: true, priority: true } },
        tags: { include: { tag: true } },
        project: { select: { id: true, name: true } },
      },
    }),
    // buildBoard has no status to filter on, so only waiting ones are loaded.
    prisma.followUp.findMany({
      // Follow-ups follow the company filter but have no project.
      where: { status: "waiting", role: { active: true }, ...(role ? { roleId: role } : {}) },
      include: { role: { select: { name: true, color: true } } },
    }),
  ]);

  // buildBoard wants BoardTask (role and project as plain names), but the drawer wants the
  // role object and the project as { name }. Rows carry the DB record so the output can be
  // reshaped after ordering.
  type Rec = (typeof tasks)[number];
  const rows: (BoardTask & { id: string; rec: Rec })[] = tasks.map((t) => ({
    key: taskKey(t, t.role) ?? t.id,
    id: t.id,
    title: t.title,
    status: t.status,
    priority: t.priority,
    owner: t.owner as "me" | "claude",
    role: t.role.name,
    rolePriority: t.role.priority,
    dueDate: formatDateOnly(t.dueDate),
    scheduledFor: formatDateOnly(t.scheduledFor),
    notBefore: formatDateOnly(t.notBefore),
    blockedAt: t.blockedAt?.toISOString() ?? null,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
    project: t.project?.name ?? null,
    rec: t,
  }));

  const toUi = ({ rec: t, key }: { rec: Rec; key: string }) => ({
    key,
    id: t.id,
    title: t.title,
    priority: t.priority,
    status: t.status,
    roleId: t.roleId,
    notes: t.notes,
    dueDate: formatDateOnly(t.dueDate),
    checklist: t.checklist,
    scheduledFor: formatDateOnly(t.scheduledFor),
    tags: t.tags,
    number: t.number,
    externalKey: t.externalKey,
    role: { id: t.role.id, name: t.role.name, color: t.role.color, taskPrefix: t.role.taskPrefix, priority: t.role.priority },
    owner: t.owner as "me" | "claude",
    project: t.project ? { id: t.project.id, name: t.project.name } : null,
    blockedReason: t.blockedReason,
  });

  const date = formatDateOnly(today())!;
  // The app shows every owner by default (it's all Josh's), so owner never decides the cap here.
  const { capped } = viewFlags({ horizon, role: role ?? undefined, project: project ?? undefined });
  const result = buildBoard(
    rows,
    followUps.map((f) => ({
      id: f.id,
      title: f.title,
      waitingOn: f.waitingOn,
      role: f.role.name,
      createdAt: f.createdAt.toISOString(),
      staleDays: f.staleDays,
    })),
    date,
    { horizon: horizon ?? "today", owner: owner ?? "all", capped },
    now,
  );

  const colorOf = new Map(followUps.map((f) => [f.id, f.role.color]));
  return NextResponse.json({
    date,
    board: result.board.map(toUi),
    more: result.more,
    stuck: result.stuck.map((t) => ({ ...toUi(t), reason: t.reason, days: t.days })),
    waitingOnReview: result.waitingOnReview.map(toUi),
    waitingOn: result.waitingOn.map((f) => ({
      id: f.id,
      title: f.title,
      waitingOn: f.waitingOn,
      role: f.role,
      roleColor: colorOf.get(f.id) ?? "",
      daysWaiting: f.daysWaiting,
    })),
  });
}
