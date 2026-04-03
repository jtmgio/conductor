import { prisma } from "./prisma";

export async function resolveSkillVariables(prompt: string, roleId: string): Promise<string> {
  const role = await prisma.role.findUnique({
    where: { id: roleId },
    include: { staff: true },
  });

  const replacements: Record<string, () => Promise<string>> = {
    roleName: async () => role?.name || "Unknown",
    roleTitle: async () => role?.title || "",
    responsibilities: async () => role?.responsibilities || "(not set)",
    quarterlyGoals: async () => role?.quarterlyGoals || "(not set)",

    todayTasks: async () => {
      const tasks = await prisma.task.findMany({
        where: { roleId, isToday: true, done: false },
        include: { tags: { include: { tag: true } } },
      });
      return tasks.map((t) => `- ${t.title} [${t.status}]${t.priority === "urgent" ? " (URGENT)" : ""}`).join("\n") || "(none)";
    },

    recentCompleted: async () => {
      const tasks = await prisma.task.findMany({
        where: { roleId, done: true, doneAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
      });
      return tasks.map((t) => `- ${t.title}`).join("\n") || "(none)";
    },

    weeklyCompleted: async () => {
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const tasks = await prisma.task.findMany({
        where: { done: true, doneAt: { gte: weekAgo } },
        include: { role: { select: { name: true } } },
      });
      return tasks.map((t) => `- [${t.role.name}] ${t.title}`).join("\n") || "(none)";
    },

    staleFollowUps: async () => {
      const fus = await prisma.followUp.findMany({
        where: { roleId, status: "waiting", createdAt: { lt: new Date(Date.now() - 3 * 86400000) } },
      });
      return fus.map((f) => `- "${f.title}" — waiting on ${f.waitingOn} (${Math.floor((Date.now() - f.createdAt.getTime()) / 86400000)}d)`).join("\n") || "(none)";
    },

    allStaleFollowUps: async () => {
      const fus = await prisma.followUp.findMany({
        where: { status: "waiting", createdAt: { lt: new Date(Date.now() - 3 * 86400000) } },
        include: { role: { select: { name: true } } },
      });
      return fus.map((f) => `- [${f.role.name}] "${f.title}" — waiting on ${f.waitingOn} (${Math.floor((Date.now() - f.createdAt.getTime()) / 86400000)}d)`).join("\n") || "(none)";
    },

    backlogTasks: async () => {
      const tasks = await prisma.task.findMany({
        where: { roleId, done: false, status: "backlog" },
      });
      return tasks.map((t) => `- ${t.title}${t.priority === "urgent" ? " (URGENT)" : ""}`).join("\n") || "(none)";
    },

    inProgressTasks: async () => {
      const tasks = await prisma.task.findMany({
        where: { roleId, done: false, status: "in_progress" },
      });
      return tasks.map((t) => `- ${t.title}`).join("\n") || "(none)";
    },

    blockedTasks: async () => {
      const tasks = await prisma.task.findMany({
        where: { roleId, done: false, status: "blocked" },
      });
      return tasks.map((t) => `- ${t.title}`).join("\n") || "(none)";
    },

    allBlockedTasks: async () => {
      const tasks = await prisma.task.findMany({
        where: { done: false, status: "blocked" },
        include: { role: { select: { name: true } } },
      });
      return tasks.map((t) => `- [${t.role.name}] ${t.title}`).join("\n") || "(none)";
    },

    activeFollowUps: async () => {
      const fus = await prisma.followUp.findMany({
        where: { roleId, status: "waiting" },
      });
      return fus.map((f) => `- "${f.title}" — waiting on ${f.waitingOn}`).join("\n") || "(none)";
    },

    staff: async () => {
      return role?.staff.map((s) => `- ${s.name} (${s.title})`).join("\n") || "(none)";
    },

    recentNotes: async () => {
      const notes = await prisma.note.findMany({
        where: { roleId },
        take: 5,
        orderBy: { createdAt: "desc" },
      });
      return notes.map((n) => `- [${n.createdAt.toLocaleDateString()}] ${n.content.slice(0, 200)}`).join("\n") || "(none)";
    },

    calendarTasks: async () => {
      const tasks = await prisma.task.findMany({
        where: { roleId, isToday: true, sourceType: "calendar", done: false },
      });
      return tasks.map((t) => `- ${t.title}${t.notes ? `\n  ${t.notes}` : ""}`).join("\n") || "(no calendar tasks)";
    },

    weeklyResolved: async () => {
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const fus = await prisma.followUp.findMany({
        where: { status: "resolved", resolvedAt: { gte: weekAgo } },
        include: { role: { select: { name: true } } },
      });
      return fus.map((f) => `- [${f.role.name}] ${f.title}`).join("\n") || "(none)";
    },

    roleTodayTasks: async () => {
      const tasks = await prisma.task.findMany({
        where: { roleId, isToday: true, done: false },
      });
      return tasks.map((t) => `- ${t.title} [${t.status}]`).join("\n") || "(none)";
    },

    roleFollowUps: async () => {
      const fus = await prisma.followUp.findMany({
        where: { roleId, status: "waiting" },
      });
      return fus.map((f) => `- "${f.title}" — waiting on ${f.waitingOn} (${Math.floor((Date.now() - f.createdAt.getTime()) / 86400000)}d)`).join("\n") || "(none)";
    },
  };

  let resolved = prompt;
  for (const [key, resolver] of Object.entries(replacements)) {
    if (resolved.includes(`{{${key}}}`)) {
      const value = await resolver();
      resolved = resolved.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), value);
    }
  }
  return resolved;
}
