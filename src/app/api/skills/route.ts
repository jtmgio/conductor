import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const skills = await prisma.skill.findMany({
    where: { enabled: true },
    orderBy: { sortOrder: "asc" },
  });
  return NextResponse.json(skills);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name, label, description, icon, prompt, category } = await req.json();
  if (!name || !label || !prompt) {
    return NextResponse.json({ error: "name, label, and prompt are required" }, { status: 400 });
  }

  const skill = await prisma.skill.create({
    data: {
      name: name.toLowerCase().replace(/[^a-z0-9-]/g, "-"),
      label,
      description: description || "",
      icon: icon || null,
      prompt,
      category: category || "general",
      isBuiltIn: false,
    },
  });
  return NextResponse.json(skill);
}
