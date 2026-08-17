import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { MeetingsPage } from "./MeetingsPage";

export default async function Meetings() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  return <MeetingsPage />;
}
