import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { AIPage } from "./AIPage";

export default async function AI() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  return <AIPage />;
}
