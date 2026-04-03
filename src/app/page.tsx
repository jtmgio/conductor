import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { FocusPage } from "./FocusPage";
import { SetupRedirect } from "./SetupRedirect";

export default async function Home() {
  // Check if setup is needed (no roles = fresh install)
  const roleCount = await prisma.role.count();
  if (roleCount === 0) {
    return <SetupRedirect />;
  }

  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  return <FocusPage />;
}
