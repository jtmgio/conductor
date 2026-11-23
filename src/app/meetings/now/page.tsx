import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { MeetingsNow } from "./MeetingsNow";

export const dynamic = "force-dynamic";

/**
 * Today's remaining meetings in a window you leave open. Lives outside the (app) group on
 * purpose: no sidebar, no tab bar, nothing but the list, so the window can shrink to one line.
 */
export default async function Page() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  return <MeetingsNow />;
}
