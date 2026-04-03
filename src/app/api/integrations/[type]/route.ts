import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PUT(req: NextRequest, { params }: { params: { type: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const integration = await prisma.integration.findUnique({ where: { type: params.type } });
  if (!integration) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();

  // If updating config, merge with existing (so partial updates work)
  const existingConfig = integration.config as Record<string, unknown>;
  const newConfig = body.config ? { ...existingConfig, ...body.config } : existingConfig;

  const updated = await prisma.integration.update({
    where: { type: params.type },
    data: {
      roleId: body.roleId ?? integration.roleId,
      config: newConfig,
      enabled: body.enabled ?? integration.enabled,
    },
  });

  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: { params: { type: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await prisma.integration.delete({ where: { type: params.type } }).catch(() => {});
  return NextResponse.json({ ok: true });
}
