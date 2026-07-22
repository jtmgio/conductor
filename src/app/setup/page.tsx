import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { SetupClient } from "./SetupClient";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  const roleCount = await prisma.role.count();
  if (roleCount > 0) redirect("/");
  return <SetupClient />;
}
