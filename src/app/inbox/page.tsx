import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { InboxPage } from "./InboxPage";

export default async function Inbox() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  return <InboxPage />;
}
