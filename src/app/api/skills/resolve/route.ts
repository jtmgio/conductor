import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveSkillVariables } from "@/lib/skill-resolver";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { skillId, roleId } = await req.json();
  if (!skillId || !roleId) {
    return NextResponse.json({ error: "skillId and roleId required" }, { status: 400 });
  }

  const skill = await prisma.skill.findUnique({ where: { id: skillId } });
  if (!skill) return NextResponse.json({ error: "Skill not found" }, { status: 404 });

  const prompt = await resolveSkillVariables(skill.prompt, roleId);
  return NextResponse.json({ prompt, skillName: skill.name, skillLabel: skill.label });
}
