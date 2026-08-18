import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/AppShell";

export const dynamic = "force-dynamic";

/**
 * The shell mounts once, here, for every authenticated route.
 *
 * It used to be rendered by each page instead, which meant a client-side navigation
 * unmounted it and everything it holds — the running reminder timer, the block-transition
 * ritual's memory of the previous block, the schedule poller. Layouts survive navigation;
 * pages don't. Anything stateful belongs on this side of the boundary.
 *
 * The gates live here too, replacing the identical checks copy-pasted into ten page.tsx
 * files (and missing entirely from /board).
 *
 * (app) is a route group — it groups these routes under one layout without appearing in
 * any URL. /board is still /board.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Fresh install first: with no companies there's no password to log in with either,
  // so sending an unauthenticated visitor to /login would be a dead end.
  const roleCount = await prisma.role.count();
  if (roleCount === 0) redirect("/setup");

  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  return <AppShell>{children}</AppShell>;
}
