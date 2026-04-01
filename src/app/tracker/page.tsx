import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { TrackerPage } from "./TrackerPage";

export default async function Tracker() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  return <TrackerPage />;
}
