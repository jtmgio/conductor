import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { DraftsPage } from "./DraftsPage";

export default async function Drafts() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  return <DraftsPage />;
}
