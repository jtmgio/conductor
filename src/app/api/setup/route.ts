import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

// Check if setup is needed (no roles = first run)
export async function GET() {
  const roleCount = await prisma.role.count();
  const profile = await prisma.userProfile.findUnique({ where: { id: "default" } });
  const hasPassword = !!(profile?.passwordHash || process.env.APP_PASSWORD_HASH);

  return NextResponse.json({
    needsSetup: roleCount === 0,
    hasPassword,
    roleCount,
  });
}

// Set password during setup
export async function POST(req: NextRequest) {
  const roleCount = await prisma.role.count();
  if (roleCount > 0) {
    return NextResponse.json({ error: "Setup already completed" }, { status: 400 });
  }

  const { password } = await req.json();
  if (!password || password.length < 4) {
    return NextResponse.json({ error: "Password must be at least 4 characters" }, { status: 400 });
  }

  const hash = await bcrypt.hash(password, 10);

  await prisma.userProfile.upsert({
    where: { id: "default" },
    update: { passwordHash: hash },
    create: { id: "default", passwordHash: hash },
  });

  return NextResponse.json({ success: true });
}
