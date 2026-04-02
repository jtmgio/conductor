import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { CostsPage } from "./CostsPage";

export default async function Costs() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  return <CostsPage />;
}
