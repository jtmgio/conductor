import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { FormatterPage } from "@/components/FormatterPage";

export const dynamic = "force-dynamic";

export default async function Formatter() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  return <FormatterPage />;
}
