import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { SettingsPage } from "./SettingsPage";

export default async function Settings() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  return <SettingsPage />;
}
