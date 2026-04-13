import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { invalidateScheduleCache } from "@/lib/schedule";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const data = await req.json();
  if (data.version !== 2 || data.type !== "full") {
    return NextResponse.json(
      { error: "Invalid format. Expected a full export (version 2). Use the config import for version 1 exports." },
      { status: 400 }
    );
  }

  const results: Record<string, number> = {};

  // Build role name → ID mapping (import roles first, then resolve references)
  const roleNameToId: Record<string, string> = {};

  // 1. Import tags
  if (data.tags?.length) {
    for (const tag of data.tags) {
      await prisma.tag.upsert({
        where: { name: tag.name },
        update: { color: tag.color },
        create: { name: tag.name, color: tag.color },
      });
    }
    results.tags = data.tags.length;
  }

  // 2. Import roles + staff
  if (data.roles?.length) {
    for (const roleData of data.roles) {
      const { staff, ...roleFields } = roleData;
      const existing = await prisma.role.findFirst({ where: { name: roleFields.name } });

      let roleId: string;
      if (existing) {
        await prisma.role.update({ where: { id: existing.id }, data: roleFields });
        roleId = existing.id;
      } else {
        const role = await prisma.role.create({ data: roleFields });
        roleId = role.id;
      }
      roleNameToId[roleFields.name] = roleId;

      // Ensure default conversation thread exists
      const existingConv = await prisma.conversation.findFirst({ where: { roleId, isDefault: true } });
      if (!existingConv) {
        await prisma.conversation.create({ data: { roleId, name: "General", isDefault: true, messages: [] } });
      }

      // Import staff
      if (staff?.length) {
        await prisma.staff.deleteMany({ where: { roleId } });
        for (const s of staff) {
          await prisma.staff.create({ data: { ...s, roleId } });
        }
      }
    }
    results.roles = data.roles.length;
  }

  // Helper to resolve roleName → roleId
  const resolveRole = (roleName: string | null): string | null => {
    if (!roleName) return null;
    return roleNameToId[roleName] || null;
  };

  // 3. Import schedule blocks
  if (data.scheduleBlocks?.length) {
    await prisma.scheduleBlock.deleteMany();
    for (const block of data.scheduleBlocks) {
      await prisma.scheduleBlock.create({ data: block });
    }
    invalidateScheduleCache();
    results.scheduleBlocks = data.scheduleBlocks.length;
  }

  // 4. Import skills
  if (data.skills?.length) {
    for (const skill of data.skills) {
      const { isBuiltIn, ...fields } = skill;
      await prisma.skill.upsert({
        where: { name: skill.name },
        update: { ...fields, isBuiltIn: isBuiltIn ?? false },
        create: { ...fields, isBuiltIn: isBuiltIn ?? false },
      });
    }
    results.skills = data.skills.length;
  }

  // 5. Import integrations
  if (data.integrations?.length) {
    for (const integ of data.integrations) {
      const roleId = resolveRole(integ.roleName) || "";
      await prisma.integration.upsert({
        where: { type: integ.type },
        update: { roleId, config: integ.config, enabled: integ.enabled },
        create: { type: integ.type, roleId, config: integ.config, enabled: integ.enabled },
      });
    }
    results.integrations = data.integrations.length;
  }

  // 6. Import tasks (dedup by sourceType+sourceId, or title+roleName)
  if (data.tasks?.length) {
    let imported = 0;
    for (const t of data.tasks) {
      const roleId = resolveRole(t.roleName);
      if (!roleId) continue;

      // Dedup by source
      if (t.sourceType && t.sourceId) {
        const existing = await prisma.task.findFirst({
          where: { sourceType: t.sourceType, sourceId: t.sourceId },
        });
        if (existing) continue;
      }

      const task = await prisma.task.create({
        data: {
          roleId,
          title: t.title,
          priority: t.priority ?? "medium",
          status: t.status ?? "backlog",
          isToday: t.isToday ?? false,
          done: t.done ?? false,
          doneAt: t.doneAt ? new Date(t.doneAt) : null,
          notes: t.notes,
          dueDate: t.dueDate ? new Date(t.dueDate) : null,
          checklist: t.checklist,
          sortOrder: t.sortOrder ?? 0,
          sourceType: t.sourceType,
          sourceId: t.sourceId,
        },
      });

      // Link tags
      if (t.tags?.length) {
        for (const tagName of t.tags) {
          const tag = await prisma.tag.findUnique({ where: { name: tagName } });
          if (tag) {
            await prisma.taskTag.create({ data: { taskId: task.id, tagId: tag.id } });
          }
        }
      }

      imported++;
    }
    results.tasks = imported;
  }

  // 7. Import follow-ups (dedup by sourceType+sourceId)
  if (data.followUps?.length) {
    let imported = 0;
    for (const f of data.followUps) {
      const roleId = resolveRole(f.roleName);
      if (!roleId) continue;

      if (f.sourceType && f.sourceId) {
        const existing = await prisma.followUp.findFirst({
          where: { sourceType: f.sourceType, sourceId: f.sourceId },
        });
        if (existing) continue;
      }

      await prisma.followUp.create({
        data: {
          roleId,
          title: f.title,
          waitingOn: f.waitingOn,
          status: f.status ?? "waiting",
          dueDate: f.dueDate ? new Date(f.dueDate) : null,
          staleDays: f.staleDays ?? 3,
          resolvedAt: f.resolvedAt ? new Date(f.resolvedAt) : null,
          sourceType: f.sourceType,
          sourceId: f.sourceId,
        },
      });
      imported++;
    }
    results.followUps = imported;
  }

  // 8. Import notes
  if (data.notes?.length) {
    let imported = 0;
    for (const n of data.notes) {
      const roleId = resolveRole(n.roleName);
      if (!roleId) continue;

      await prisma.note.create({
        data: {
          roleId,
          content: n.content,
          tags: n.tags,
          createdAt: n.createdAt ? new Date(n.createdAt) : undefined,
        },
      });
      imported++;
    }
    results.notes = imported;
  }

  // 9. Import transcripts
  if (data.transcripts?.length) {
    let imported = 0;
    for (const t of data.transcripts) {
      const roleId = resolveRole(t.roleName);
      if (!roleId) continue;

      await prisma.transcript.create({
        data: {
          roleId,
          rawText: t.rawText,
          summary: t.summary,
          createdAt: t.createdAt ? new Date(t.createdAt) : undefined,
        },
      });
      imported++;
    }
    results.transcripts = imported;
  }

  // 10. Import conversations (merge messages into existing)
  if (data.conversations?.length) {
    for (const c of data.conversations) {
      const roleId = resolveRole(c.roleName);
      if (!roleId) continue;

      const existing = await prisma.conversation.findFirst({ where: { roleId, isDefault: true } });
      if (existing) {
        await prisma.conversation.update({ where: { id: existing.id }, data: { messages: c.messages } });
      } else {
        await prisma.conversation.create({ data: { roleId, name: "General", isDefault: true, messages: c.messages } });
      }
    }
    results.conversations = data.conversations.length;
  }

  // 11. Import profile
  if (data.profile) {
    await prisma.userProfile.upsert({
      where: { id: "default" },
      update: data.profile,
      create: { id: "default", ...data.profile },
    });
  }

  return NextResponse.json({ success: true, results });
}
