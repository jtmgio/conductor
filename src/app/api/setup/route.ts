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

// Set password during setup — only allowed if no password is set yet, or user is authenticated
export async function POST(req: NextRequest) {
  const profile = await prisma.userProfile.findUnique({ where: { id: "default" }, select: { passwordHash: true } });
  const hasExistingPassword = !!(profile?.passwordHash || process.env.APP_PASSWORD_HASH);

  if (hasExistingPassword) {
    const { getServerSession } = await import("next-auth");
    const { authOptions } = await import("@/lib/auth");
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
