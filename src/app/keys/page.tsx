import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { KeysPage } from "./KeysPage";

export default async function Keys() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  return <KeysPage />;
}
