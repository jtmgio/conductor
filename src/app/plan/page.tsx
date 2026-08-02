import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { PlanTomorrowPage } from "@/components/PlanTomorrowPage";

export const dynamic = "force-dynamic";

export default async function Plan() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  return <PlanTomorrowPage />;
}
