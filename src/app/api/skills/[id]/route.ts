import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const skill = await prisma.skill.findUnique({ where: { id: params.id } });
  if (!skill) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();

  // Built-in skills can only toggle enabled
  if (skill.isBuiltIn) {
    const updated = await prisma.skill.update({
      where: { id: params.id },
      data: { enabled: body.enabled ?? skill.enabled },
    });
    return NextResponse.json(updated);
  }

  const updated = await prisma.skill.update({
    where: { id: params.id },
    data: {
      label: body.label ?? skill.label,
      description: body.description ?? skill.description,
      icon: body.icon ?? skill.icon,
      prompt: body.prompt ?? skill.prompt,
      category: body.category ?? skill.category,
      enabled: body.enabled ?? skill.enabled,
    },
  });
  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const skill = await prisma.skill.findUnique({ where: { id: params.id } });
  if (!skill) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (skill.isBuiltIn) return NextResponse.json({ error: "Cannot delete built-in skills" }, { status: 400 });

  await prisma.skill.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
