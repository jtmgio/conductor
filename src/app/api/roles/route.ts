import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { uniquePrefix } from "@/lib/task-key";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const showAll = req.nextUrl.searchParams.get("all") === "true";

  const roles = await prisma.role.findMany({
    where: showAll ? {} : { active: true },
    orderBy: { priority: "asc" },
    include: { _count: { select: { tasks: { where: { done: false } }, followUps: { where: { status: "waiting" } } } } },
  });
  return NextResponse.json(roles);
}

export async function POST(req: NextRequest) {
  // Allow unauthenticated access during setup (no password set = setup in progress)
  const profile = await prisma.userProfile.findUnique({ where: { id: "default" }, select: { passwordHash: true } });
  const isSetupComplete = !!(profile?.passwordHash || process.env.APP_PASSWORD_HASH);
  if (isSetupComplete) {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { name, title, platform, color, priority } = await req.json();
  if (!name || !title) return NextResponse.json({ error: "name and title required" }, { status: 400 });

  // Auto-assign priority if not provided (add to end)
  const maxPriority = await prisma.role.aggregate({ _max: { priority: true } });
  const assignedPriority = priority ?? (maxPriority._max.priority ?? 0) + 1;

  // Every company needs a task-key prefix or its tasks are unaddressable.
  // Derive one from the name, avoiding prefixes already in use.
  const existingPrefixes = (
    await prisma.role.findMany({ where: { taskPrefix: { not: null } }, select: { taskPrefix: true } })
  ).map((r) => r.taskPrefix as string);

  const role = await prisma.role.create({
    data: {
      name,
      title,
      platform: platform || "Slack",
      color: color || "#4d8ef7",
      priority: assignedPriority,
      taskPrefix: uniquePrefix(name, existingPrefixes),
    },
  });

  // Auto-create default "General" conversation thread for the new role
  await prisma.conversation.create({
    data: { roleId: role.id, name: "General", isDefault: true, messages: [] },
  });

  return NextResponse.json(role);
}
