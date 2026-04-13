import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { invalidateScheduleCache } from "@/lib/schedule";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  // Allow import without auth during setup (no roles = first run)
  const roleCount = await prisma.role.count();
  if (!session && roleCount > 0) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const data = await req.json();
  if (!data.version) return NextResponse.json({ error: "Invalid export format" }, { status: 400 });

  const results = { roles: 0, staff: 0, scheduleBlocks: 0, skills: 0, tags: 0, integrations: 0 };

  // Import tags
  if (data.tags?.length) {
    for (const tag of data.tags) {
      await prisma.tag.upsert({
        where: { name: tag.name },
        update: { color: tag.color },
        create: { name: tag.name, color: tag.color },
      });
      results.tags++;
    }
  }

  // Import roles + staff
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
        // Create default conversation thread for new role
        const existingConv = await prisma.conversation.findFirst({ where: { roleId, isDefault: true } });
        if (!existingConv) {
          await prisma.conversation.create({ data: { roleId, name: "General", isDefault: true, messages: [] } });
        }
      }

      // Import staff
      if (staff?.length) {
        // Remove existing staff and re-create
        await prisma.staff.deleteMany({ where: { roleId } });
        for (const s of staff) {
          await prisma.staff.create({ data: { ...s, roleId } });
          results.staff++;
        }
      }

      results.roles++;
    }
  }

  // Import schedule blocks
  if (data.scheduleBlocks?.length) {
    // Replace all existing blocks
    await prisma.scheduleBlock.deleteMany();
    for (const block of data.scheduleBlocks) {
      await prisma.scheduleBlock.create({ data: block });
      results.scheduleBlocks++;
    }
    invalidateScheduleCache();
  }

  // Import custom skills
  if (data.skills?.length) {
    for (const skill of data.skills) {
      await prisma.skill.upsert({
        where: { name: skill.name },
        update: { ...skill, isBuiltIn: false },
        create: { ...skill, isBuiltIn: false },
      });
      results.skills++;
    }
  }

  // Import integrations
  if (data.integrations?.length) {
    for (const integ of data.integrations) {
      await prisma.integration.upsert({
        where: { type: integ.type },
        update: { roleId: integ.roleId, config: integ.config, enabled: integ.enabled },
        create: integ,
      });
      results.integrations++;
    }
  }

  // Import profile
  if (data.profile) {
    // During setup (unauthenticated import), clear any existing password
    // so the user sets a fresh one in the next wizard step
    const profileData = !session ? { ...data.profile, passwordHash: null } : data.profile;
    await prisma.userProfile.upsert({
      where: { id: "default" },
      update: profileData,
      create: { id: "default", ...profileData },
    });
  }

  return NextResponse.json({ success: true, results });
}
